/* SP.civAI — rival nations: economy, vehicle production, expansion, attacks/trade/conversion, geyser claims, diplomacy. */
(function () {
  'use strict';
  const SP = window.SP = window.SP || {};
  const V3 = THREE.Vector3;
  const C = SP.civ, U = SP.civUnits, CS = SP.civCity;
  const AI = SP.civAI = {};

  const PLANS = {
    military: [['land', 'military'], ['land', 'military'], ['air', 'military'], ['land', 'military'], ['sea', 'military'], ['land', 'military'], ['air', 'military'], ['land', 'military']],
    economic: [['land', 'economic'], ['land', 'military'], ['sea', 'economic'], ['air', 'economic'], ['land', 'economic'], ['land', 'military'], ['sea', 'military']],
    religious: [['land', 'religious'], ['land', 'military'], ['air', 'religious'], ['sea', 'religious'], ['land', 'religious'], ['land', 'military'], ['sea', 'military']]
  };
  const AI_ROLE_CAP = { land: 6, sea: 3, air: 3 };
  // B-01: nobody may attack the player (neutral city-states and rivals alike) before this much campaign progress
  // (prog = seconds x speed multiplier, so 1500 = 25 min at normal speed).
  AI.PLAYER_SAFE = 1500;

  // ---------------------------------------------------------------- setup
  AI.makeDesigns = function (W, n) {
    const pal = { base: W.rng.pick([0xfffbeb, 0xfef3c7, 0xe2e8f0, 0xfde68a]), accent: n.color, detail: W.rng.pick([0x475569, 0x1e293b, 0x92400e]) };
    n.designs = {};
    ['cityhall', 'house', 'factory', 'entertainment'].forEach(function (role) {
      let d = null;
      for (let i = 0; i < 4 && !d; i++) { try { d = SP.assembly.generate(W.rng, 'building', role, pal); } catch (e) { d = null; } }
      if (!d || !d.core) d = SP.assembly.defaultDesign('building', role);
      d.colors = { base: pal.base, accent: n.color, detail: pal.detail }; n.designs[role] = d;
    });
    ['land', 'sea', 'air'].forEach(function (role) {
      let d = null;
      for (let i = 0; i < 6 && !d; i++) {
        try { const c = SP.assembly.generate(W.rng, 'vehicle', role, pal); if (SP.assembly.validate(c).ok && SP.assembly.stats(c).cost < 650) d = c; } catch (e) { d = null; }
      }
      if (!d) d = SP.assembly.defaultDesign('vehicle', role);
      d.colors = { base: n.color, accent: pal.base, detail: pal.detail };
      n.designs[role] = d;
    });
  };
  AI.initNation = function (W, n) {
    n.plan = PLANS[n.type]; n.aiT = W.rng.range(0.5, 2); n.buildT = W.rng.range(4, 12); n.targetT = 0; n.target = null; n.warT = 20; n.expandT = 0;
    n.aggr = n.type === 'military' ? 1 : n.type === 'economic' ? 0.5 : 0.7;
  };

  // ---------------------------------------------------------------- helpers
  function myCities(W, n) { return W.cities.filter(function (c) { return c.nation === n.id; }); }
  function myVehicles(W, n) { return W.vehicles.filter(function (v) { return v.nation === n.id; }); }
  AI.power = function (W, n) {
    let p = myCities(W, n).length * 100;
    myVehicles(W, n).forEach(function (v) { p += v.maxHp * 0.4 + v.st.mil * 6; });
    return p;
  };
  AI.vehicleFor = function (W, n, role, kind) {
    const base = n.designs[role];
    return kind === 'military' ? U.variant(base, 'military') : U.variant(base, kind);
  };
  AI.canReach = function (W, v, city) {
    if (v.role === 'air') return true;
    if (v.role === 'sea') return !!city.port && W.compOf(city.port, 'sea') === W.compOf(v.dir, 'sea');
    return W.compOf(v.dir, 'land') === W.compOf(city.dir, 'land');
  };

  // ---------------------------------------------------------------- economy
  function aiBuild(W, n) {
    const cities = myCities(W, n);
    let best = null;
    cities.forEach(function (c) {
      if (!CS.freePlot(c)) return;
      CS.compute(W, c);
      const nh = CS.count(c, 'house'), nf = CS.count(c, 'factory'), ne = CS.count(c, 'entertainment');
      let role = 'factory';
      if (c.happy < 38 || ne * 2 < nf - 1) role = 'entertainment';
      else if (nh < 1 || nh < nf) role = 'house';
      else if (nf >= 3 && ne < 2) role = 'entertainment';
      const cost = CS.buildingCost(n, role);
      if (n.money >= cost && (!best || c.level < best.c.level)) best = { c: c, role: role, cost: cost };
    });
    if (best) { n.money -= best.cost; CS.addBuilding(W, best.c, best.role); CS.compute(W, best.c); }
  }
  function aiProduce(W, n) {
    const unlocked = Math.min(n.plan.length, 2 + Math.floor(W.prog / (n.type === 'military' ? 130 : 170)));
    const have = {};
    myVehicles(W, n).forEach(function (v) { const k = v.role + v.st.kind; have[k] = (have[k] || 0) + 1; });
    W.cities.forEach(function (c) { if (c.nation === n.id) c.queue.forEach(function (q) { const k = q.role + q.kind; have[k] = (have[k] || 0) + 1; }); });
    const seen = {};
    for (let i = 0; i < unlocked; i++) {
      const p = n.plan[i], k = p[0] + p[1]; seen[k] = (seen[k] || 0) + 1;
      if ((have[k] || 0) >= seen[k]) continue;
      if (U.count(W, n.id, p[0]) >= Math.min(AI_ROLE_CAP[p[0]], U.CAPS[p[0]])) continue;
      const cities = myCities(W, n).filter(function (c) { return c.queue.length < 1 && (p[0] !== 'sea' || c.port); });
      if (!cities.length) continue;
      const city = W.rng.pick(cities);
      const d = AI.vehicleFor(W, n, p[0], p[1]); const cost = U.vstats(d).cost;
      if (n.money < cost) return;
      n.money -= cost; city.queue.push({ role: p[0], kind: p[1], design: d, cost: cost, t: 0, dur: 9 });
      return;
    }
  }
  function aiExpand(W, n) {
    const mine = myCities(W, n);
    if (mine.length >= 2 || W.cities.length >= 15 || n.money < 800 || W.prog < 260 || n.neutral) return;
    const cap = mine[0]; if (!cap) return;
    const avoid = W.cities.map(function (c) { return c.dir; });
    const ref = C.randomTangent(cap.dir, W.rng);
    for (let k = 0; k < 10; k++) {
      const d0 = C.offsetDir(cap.dir, ref, W.rng.range(0, 6.28), W.rng.range(60, 110) / W.R);
      if (W.compOf(d0, 'land') !== W.compOf(cap.dir, 'land')) continue;
      const d = CS.findSite(W, d0, avoid, 55); if (!d) continue;
      if (W.compOf(d, 'land') !== W.compOf(cap.dir, 'land')) continue;
      if (CS.siteScore(W, d) > 4.5) continue;
      n.money -= 700;
      const c = W.addCity(n, d, C.word(W.rng, 2) + ' ' + W.rng.pick(['Port', 'Hill', 'Bay', 'Ridge', 'Fields']), ['house']);
      W.toast(n.name + ' founded ' + c.name, '🏗️');
      return;
    }
  }

  // ---------------------------------------------------------------- targeting
  function chooseTarget(W, n) {
    const prog = W.prog, pl = W.player;
    const vs = myVehicles(W, n); if (!vs.length) return null;
    const home = myCities(W, n)[0]; if (!home) return null;
    let best = null, bs = -1e9;
    W.cities.forEach(function (c) {
      if (c.nation === n.id) return;
      const owner = W.nationById[c.nation], r = W.getRel(n.id, c.nation);
      const hostile = r <= -30;
      if (owner === pl && prog < AI.PLAYER_SAFE) return;
      if (owner === pl && !hostile && !(prog > 900 && n.type === 'military' && r < 15)) return;
      if (!hostile && r > 55) return;
      let s = 0;
      if (hostile) s += 5; if (owner.neutral) s += n.type === 'military' ? 3 : 4;
      if (owner === pl && hostile) s += 1.5;
      s -= C.angleBetween(home.dir, c.dir) * 2.2;
      s -= Math.max(0, r) * 0.03;
      if (c.turrets.length) s += (c.turrets.filter(function (t) { return !t.alive; }).length) * 0.2;
      const reach = vs.filter(function (v) { return AI.canReach(W, v, c); }).length; if (!reach) return;
      s += reach * 0.25;
      if (s > bs) { bs = s; best = c; }
    });
    return best;
  }

  function aiOrders(W, n) {
    const vs = myVehicles(W, n);
    // claim spice first
    vs.forEach(function (v) {
      if (v.order || v.role === 'air') return;
      let best = null, bd = 1e9;
      W.geysers.forEach(function (g) {
        if (g.owner === n.id) return; if (g.owner && !U.hostile(W, g.owner, n.id)) return;
        if (g.claimBy && g.claimBy !== v.id && W.vehicles.some(function (o) { return o.id === g.claimBy && o.alive && o.order && o.order.type === 'claim'; })) return;
        if (v.role === 'land' && !g.land) return; if (v.role === 'land' && W.compOf(g.dir, 'land') !== W.compOf(v.dir, 'land')) return;
        if (v.role === 'sea' && !g.nearWater) return;
        const d = C.angleBetween(g.dir, v.dir); if (d < bd) { bd = d; best = g; }
      });
      if (best && bd * W.R < 190) { best.claimBy = v.id; U.order(W, v, { type: 'claim', g: best }); }
    });
    // defend
    const home = myCities(W, n);
    vs.forEach(function (v) {
      if (v.order && v.order.type !== 'move') return;
      if (v.st.mil <= 0) return;
      for (let i = 0; i < W.vehicles.length; i++) {
        const o = W.vehicles[i]; if (o.nation === n.id || !U.hostile(W, n.id, o.nation)) continue;
        if (home.some(function (c) { return c.pos.distanceTo(o.pos) < 55; }) && v.pos.distanceTo(o.pos) < 90) { U.order(W, v, { type: 'attack', v: o }); return; }
      }
    });
    // main target
    n.targetT -= 1;
    if (n.targetT <= 0 || !n.target || n.target.nation === n.id) {
      n.targetT = 8; n.target = chooseTarget(W, n);
    }
    const t = n.target; if (!t) return;
    const owner = W.nationById[t.nation];
    const hostile = U.hostile(W, n.id, t.nation);
    if (n.type === 'military' || hostile) {
      const fighters = vs.filter(function (v) { return v.st.mil > 0 && AI.canReach(W, v, t) && !(v.order && v.order.type === 'claim'); });
      const need = Math.min(3, Math.max(1, Math.floor(W.prog / 260) + 2));
      if (fighters.length >= need && W.prog > 160) {
        if (owner === W.player && W.prog < AI.PLAYER_SAFE) return;
        fighters.forEach(function (v) {
          if (!v.order || v.order.type === 'move' || (v.order.type === 'attack' && v.order.city !== t && !v.order.v)) {
            const spread = C.offsetDir(t.dir, C.randomTangent(t.dir, W.rng), W.rng.range(0, 6.28), W.rng.range(0, 8) / W.R);
            U.order(W, v, { type: 'attack', city: t });
          }
        });
        if (owner === W.player || owner.neutral) U.markWar(W, n.id, t.nation);
      }
    } else if (n.type === 'economic') {
      vs.forEach(function (v) {
        if (v.st.eco > 0 && v.st.eco >= v.st.rel && AI.canReach(W, v, t) && (!v.order || v.order.type === 'move')) U.order(W, v, { type: 'work', city: t });
      });
      if ((t.trade[n.id] || 0) >= 100 && n.money >= CS.price(t)) { n.money -= CS.price(t); W.captureCity(t, n, 'economic', CS.price(t)); n.target = null; }
    } else {
      vs.forEach(function (v) {
        if (v.st.rel > 0 && v.st.rel > v.st.eco && AI.canReach(W, v, t) && (!v.order || v.order.type === 'move')) U.order(W, v, { type: 'work', city: t });
      });
    }
    // idle non-fighters hover near home
  }

  // ---------------------------------------------------------------- relations drift
  function aiDiplomacy(W, n) {
    const pl = W.player;
    // military nations get gradually less friendly if they outgrow you
    if (n.type === 'military' && !n.neutral && W.prog > 120) {
      const r = W.getRel(n.id, pl.id);
      if (AI.power(W, n) > AI.power(W, pl) * 0.8 && r > -45) W.setRel(n.id, pl.id, r - 2.5 * W.rng.range(0.4, 1));
    }
    // random wars between AIs
    const others = W.nations.filter(function (o) { return o !== n && o !== pl && !o.neutral; });
    if (others.length && W.rng.chance(0.18)) {
      const o = W.rng.pick(others); const r = W.getRel(n.id, o.id);
      W.setRel(n.id, o.id, Math.max(-100, Math.min(100, r + W.rng.range(-26, 12))));
    }
    // peace slowly returns
    W.nations.forEach(function (o) {
      if (o === n) return; const r = W.getRel(n.id, o.id);
      if (r < -30 && W.t - (W.lastFight[n.id + o.id] || 0) > 70) W.setRel(n.id, o.id, r + 3);
    });
  }

  // ---------------------------------------------------------------- main
  AI.update = function (W, dt) {
    W.nations.forEach(function (n) {
      if (n.isPlayer) return;
      // income
      const mine = myCities(W, n);
      let inc = 0;
      mine.forEach(function (c) { if (!c.riot) inc += c.income; });
      n.income = inc;
      n.money += inc / 60 * dt;
      W.geysers.forEach(function (g) { if (g.owner === n.id) n.money += 100 / 60 * dt * W.FM; });
      if (!mine.length) { n.dead = true; return; }
      n.aiT -= dt; if (n.aiT > 0) return;
      n.aiT = 1.6 / Math.sqrt(W.FM);
      if (n.neutral) {
        n.buildT -= 1.6 * W.FM; if (n.buildT <= 0) { n.buildT = 40; aiBuild(W, n); }
        return;
      }
      n.buildT -= 1.6 * W.FM; if (n.buildT <= 0) { n.buildT = 14; aiBuild(W, n); }
      aiProduce(W, n);
      n.expandT -= 1.6; if (n.expandT <= 0) { n.expandT = 20; aiExpand(W, n); }
      aiOrders(W, n);
      n.warT -= 1.6; if (n.warT <= 0) { n.warT = 22; aiDiplomacy(W, n); }
    });
  };

  // ---------------------------------------------------------------- player-facing diplomacy
  AI.relLabel = function (r) { return r >= 60 ? 'Allied' : r >= 25 ? 'Friendly' : r > -10 ? 'Neutral' : r > -30 ? 'Unfriendly' : r > -70 ? 'Hostile' : 'At war'; };
  AI.act = function (W, n, action) {
    const pl = W.player, r = W.getRel(pl.id, n.id), cd = (n.dipCd = n.dipCd || {});
    const now = W.t;
    if (cd[action] && now < cd[action]) return { ok: false, text: 'Wait ' + Math.ceil(cd[action] - now) + 's' };
    let text = '', ok = true;
    switch (action) {
      case 'gift':
        if (pl.money < 200) return { ok: false, text: 'Need 200 💰' };
        pl.money -= 200; n.money += 200; W.setRel(pl.id, n.id, Math.min(100, r + 16)); text = n.name + ' loved the gift! (+16)'; cd.gift = now + 4; break;
      case 'compliment':
        W.setRel(pl.id, n.id, Math.min(100, r + (r < -30 ? 3 : 6))); text = 'They blush. (+6)'; cd.compliment = now + 25; break;
      case 'insult':
        W.setRel(pl.id, n.id, Math.max(-100, r - 22)); text = n.name + ' is furious! (-22)'; cd.insult = now + 8; break;
      case 'demand': {
        const stronger = AI.power(W, pl) > AI.power(W, n) * 1.2;
        if (stronger || r >= 55) {
          const amt = Math.min(n.money, 250 + 50 * myCities(W, n).length);
          n.money -= amt; pl.money += amt; W.setRel(pl.id, n.id, Math.max(-100, r - 16)); text = 'They paid ' + Math.round(amt) + ' 💰 (resentfully)';
        } else { W.setRel(pl.id, n.id, Math.max(-100, r - 28)); text = n.name + ' refuses and is angry! (-28)'; ok = false; }
        cd.demand = now + 40; break;
      }
    }
    if (SP.audio) SP.audio.sfx(ok ? 'social_ok' : 'social_bad');
    return { ok: ok, text: text };
  };
})();
