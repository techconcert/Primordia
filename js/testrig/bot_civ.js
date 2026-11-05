/* testrig bot: Civilization stage. Uses the stage's own UI actions (stage.ui.produce / build / buy / useAbility) and vehicle orders
 * (SP.civUnits.order, the same calls the right-click handler makes). Real key taps are used for the hotkey ability (Q) and camera is nudged gently.
 * Capture method follows the player's card (military: attack, economic: trade ring then buy, religious: holograms). */
(function () {
  'use strict';
  const SP = window.SP = window.SP || {};
  const T = SP.testrig; if (!T || !T.active) return;

  let stg = null, fails = 0, bl = {}, prog = null, W = null, thinkT = 0, lastW = null, lastOwn = 0, retries = 0, lastCaptured = 0, abT = 0, buildT = 0, lastGain = 0, esc = 0, giftT = 0, waitN = 0, waitT = 0, healUntil = 0;

  function stage() { return SP.stages.civ; }
  function angle(a, b) { return Math.acos(Math.max(-1, Math.min(1, a.dot(b)))); }
  const CS = () => SP.civCity, U = () => SP.civUnits, AI = () => SP.civAI;

  // a staging point that a vehicle of this role can actually stand on (the plain 62-unit point is often a lake or a cliff)
  function standable(W, v, dir, cityDir) {
    const ok = (d) => W.passable(v.role, d) && (v.role === 'air' || (v.role === 'sea' ? W.compOf(d, 'sea') === W.compOf(v.dir, 'sea') : W.compOf(d, 'land') === W.compOf(v.dir, 'land')));
    if (ok(dir)) return dir;
    const ref = new THREE.Vector3(0, 1, 0).cross(dir); if (ref.lengthSq() < 1e-6) ref.set(1, 0, 0); ref.normalize();
    let best = null, bd = 1e9;
    for (const r of [5, 9, 14, 20, 28, 38]) for (let k = 0; k < 14; k++) {
      const d = SP.civ.offsetDir(dir, ref, k / 14 * 6.2832, r / W.R); if (!ok(d)) continue;
      const cd = angle(d, cityDir) * W.R; if (cd < 34) continue;
      const score = r + Math.abs(cd - 62) * 0.3; if (score < bd) { bd = score; best = d; }
    }
    return best || dir;
  }
  function myVehicles(W) { return W.vehicles.filter((v) => v.nation === 'you' && v.alive); }
  function ownCities(W) { return W.cities.filter((c) => c.nation === 'you'); }

  const B = T.bots.civ = {
    maxSim: 4500, stuckProg: 300,
    enter: function () { lastGain = 0; esc = 0; giftT = 0; waitN = 0; waitT = 0; healUntil = 0; retries = 0; lastW = null; thinkT = 2; lastOwn = 0; lastCaptured = 0; bl = {}; prog = null; fails = 0; stg = null; T.note('civ bot ready'); },
    resources: function () { W = stage().w; if (!W) return null; const you = W.player; return { money: Math.round(you.money), income: Math.round(you.income || 0), type: you.type, cities: ownCities(W).length + '/' + W.cities.length, vehicles: myVehicles(W).length, prog: Math.round(W.prog), retries: retries, esc: esc, tech: JSON.stringify(W.player.tech || {}), spice: W.geysers.filter((g) => g.owner === 'you').length }; },
    probe: function () { W = stage().w; if (!W) return null; return { x: 0, z: 0, idleOk: true, prog: ownCities(W).length * 1000 + Math.round(W.player.money / 50) + myVehicles(W).length }; },
    assist: function () { W = stage().w; if (!W) return; const me = W.nationById && W.nationById[W.player.id !== undefined ? W.player.id : 'you']; W.cities.filter((c) => c.nation !== 'you').forEach((c) => { try { W.captureCity(c, me || W.player, 'religious'); T.note('ASSIST: captured ' + c.name); } catch (e) { /* */ } }); },
    unstick: function () { if (!W) return; myVehicles(W).forEach((v) => { v.order = null; }); thinkT = 0; },
    modal: function (box) {
      if (T.clickText(/build my spaceship/i, box)) { T.goal('World united -> designing the first spaceship'); return true; }
      if (T.clickText(/try again/i, box)) { retries++; T.note('civilization fell: Try again (' + retries + ')'); return true; }
      return false;
    },
    tick: function (dt) {
      const st = stage(); W = st && st.w; if (!W || !st.ui) return;
      if (W !== lastW) { if (lastW) T.note('civ world restarted (retry)'); lastW = W; thinkT = 2; stg = null; prog = null; lastGain = W.t; esc = 0; }
      if (W.ended) { T.mark(null); T.goal(W.cities.every((c) => c.nation === 'you') ? 'All cities captured: One Nation!' : 'Civilization fell...'); return; }
      abT -= dt; thinkT -= dt;
      const you = W.player, ui = st.ui;
      const own = ownCities(W);
      if (own.length !== lastOwn) {
        if (own.length > lastOwn && lastOwn) { T.goalDone('captured a city (' + own.length + '/' + W.cities.length + ')'); fails = Math.max(0, fails - 1); lastGain = W.t; esc = Math.max(0, esc - 1); }
        if (own.length < lastOwn) { const foes = W.vehicles.filter((v) => v.alive && v.nation !== 'you' && own.some((c) => c.pos.distanceTo(v.pos) < 70)).length; T.note('civ: LOST a city (' + own.length + ' left), enemy vehicles near our cities: ' + foes); }
        lastOwn = own.length;
      }
      if (B._look) { W.cam.focusDir.lerp(B._look, Math.min(1, dt * 0.8)).normalize(); }
      if (thinkT > 0) return; thinkT = 1.0;
      if (!own.length) return;
      const type = you.type, capital = own[0], vs = myVehicles(W);
      const inGroup = (v) => !!(stg && stg.ids[v.id]);
      const fight = (v) => (type === 'military' ? v.st.mil > 0 : type === 'economic' ? v.st.eco > 0 && v.st.eco >= v.st.rel : v.st.rel > 0 && v.st.rel > v.st.eco);
      const hpOk = (v) => v.hp >= v.maxHp * 0.65 || own.some((c) => c.pos.distanceTo(v.pos) < 24);
      const targets = W.cities.filter((c) => c.nation !== 'you' && !(bl[c.name] > W.t));
      const allT = W.cities.filter((c) => c.nation !== 'you');
      const reserve = 100;

      // ---- no-progress detector: escalate every 8 sim-minutes without a new city
      if (W.t - lastGain > 480 * (esc + 1)) { esc++; T.note('civ: no new city for ' + Math.round((W.t - lastGain) / 60) + ' min -> escalation level ' + esc); T.goal('No progress -> new strategy (level ' + esc + ')'); fails++; stg = null; prog = null; bl = {}; }

      // ---- defence: military vehicles that are not in the strike group intercept enemy vehicles near our cities
      const foes = W.vehicles.filter((v) => v.alive && v.nation !== 'you' && own.some((c) => c.pos.distanceTo(v.pos) < 60) && U().hostile(W, 'you', v.nation));
      if (foes.length) {
        const defs = vs.filter((v) => v.st.mil > 0 && !inGroup(v) && (!v.order || v.order.type === 'move' || (v.order.type === 'attack' && v.order.v && !v.order.v.alive)));
        defs.forEach((v) => { const f = foes.sort((a, b) => a.pos.distanceTo(v.pos) - b.pos.distanceTo(v.pos))[0]; U().order(W, v, { type: 'attack', v: f }); });
        if (defs.length) T.goal('Defence: ' + defs.length + ' vehicles intercept ' + foes.length + ' enemy vehicles near our cities');
      }

      // ---- peace policy: a gift (200 for +16 relations) only where it pays: a nation whose vehicles are raiding us, or the owner of the city we want to buy
      giftT -= 1;
      if (giftT <= 0 && you.money > 1200 && foes.length) {
        const tgtOwner = stg && stg.go ? stg.c.nation : null, raider = foes.map((f) => f.nation).filter((n) => n !== tgtOwner)[0], n = raider && W.nationById[raider];
        if (n && W.getRel('you', n.id) < -25) { const res = AI().act(W, n, 'gift'); giftT = res.ok ? 12 : 4; if (res.ok) T.say('Diplomacy: gift to ' + n.name + ' (relations ' + Math.round(W.getRel('you', n.id)) + ')'); }
      }

      // ---- economy: buildings in cities with free plots (houses first, then factories, entertainment when unhappy)
      buildT -= 1;
      if (buildT <= 0) {
        for (const c of own) {
          if (!CS().freePlot(c)) continue;
          const nh = CS().count(c, 'house'), nf = CS().count(c, 'factory'), ne = CS().count(c, 'entertainment');
          const role = c.riot ? 'entertainment' : nh < 2 ? 'house' : nf < nh ? 'factory' : ne < Math.ceil(nh / 2) ? 'entertainment' : 'house';
          const cost = CS().buildingCost(you, role);
          if (you.money >= cost + reserve) { T.goal('Economy: ' + c.name + ' gets a new ' + role + ' (' + cost + ')'); T.mark(c.pos, c.name, null); B._look = c.dir.clone(); ui.build(c, role); buildT = 2; return; }
        }
      }

      // ---- buy-out: the cheapest city whose owner is not at war with us (gift first if relations are the only obstacle)
      let buyT = null, buyP = 1e9, buyOk = false;
      for (const c of allT) { const p = CS().buyPrice(c, 'you'); if (p < buyP) { buyP = p; buyT = c; } }
      if (buyT) buyOk = buyT.trade.you >= 100 || (W.getRel('you', buyT.nation) > -30);
      if (B._dbgT === undefined || W.t - B._dbgT > 90) { B._dbgT = W.t; T.note('civ buy-out: cheapest ' + (buyT ? buyT.name + ' ' + buyP + ' (rel ' + Math.round(W.getRel('you', buyT.nation)) + (buyOk ? ', open' : ', closed') + ')' : '-') + ', money ' + Math.round(you.money) + ', income ' + Math.round(you.income || 0)); }
      // ---- merger: with half the world, buy whole nations
      if (own.length * 2 >= W.cities.length) {
        const m = W.nations.filter((n) => !n.isPlayer && !n.dead).map((n) => ({ n, p: ui.mergePrice(n) })).filter((x) => x.p && you.money >= x.p + reserve).sort((a, b) => b.p - a.p)[0];
        if (m) { T.goal('Merger: ' + m.n.name + ' joins us for ' + m.p); ui.merge(m.n); return; }
      }
      if (own.length * 2 >= W.cities.length && giftT <= 0 && you.money > 900 && !(stg && stg.go)) {
        const n = W.nations.filter((x) => !x.isPlayer && !x.dead && W.cities.some((c) => c.nation === x.id) && W.getRel('you', x.id) <= -30).sort((a, b) => W.getRel('you', b.id) - W.getRel('you', a.id))[0];
        if (n) { const res = AI().act(W, n, 'gift'); giftT = res.ok ? 4 : 2; if (res.ok) T.say('Diplomacy: making peace with ' + n.name + ' for a merger'); }
      }
      // ---- fleet production: keep every city's queue busy up to the caps (card kind + 3 military escorts for non-military cards)
      const cap = (r) => U().cap(W, 'you', r);
      const cnt = { land: U().count(W, 'you', 'land'), sea: U().count(W, 'you', 'sea'), air: U().count(W, 'you', 'air') };
      const kindN = (k) => vs.filter((v) => v.st.kind === k).length + own.reduce((n, c) => n + c.queue.filter((q) => q.kind === k).length, 0);
      const freeG = W.geysers.filter((g) => !g.owner);
      for (let guard = 0; guard < 2; guard++) {
        let role = null, kind = type;
        const nMil = kindN('military');
        if (cnt.land < (freeG.some((g) => g.land) ? 3 : 2) && cnt.land < cap('land')) role = 'land';
        else if (type !== 'military' && nMil < 2 + Math.min(4, esc * 2) && cnt.land < cap('land')) { role = 'land'; kind = 'military'; }
        else if (cnt.land < (type === 'military' ? cap('land') : Math.min(cap('land'), 6 + esc))) role = 'land';
        else if (cnt.air < cap('air')) role = 'air';
        else if (cnt.sea < Math.min(2, cap('sea')) && own.some((c) => c.port)) role = 'sea';
        else if (type === 'military' && cnt.sea < cap('sea') && own.some((c) => c.port)) role = 'sea';
        if (!role) break;
        const city = own.filter((c) => !c.riot && c.queue.length < 2 && (role !== 'sea' || c.port)).sort((a, b) => (stg ? angle(a.dir, stg.c.dir) - angle(b.dir, stg.c.dir) : 0) + (a.queue.length - b.queue.length) * 0.3)[0];   // build near the front
        if (!city) break;
        const d = ui.designFor(role, kind), cost = U().vstats(d).cost;
        if (you.money < cost + 30 + (vs.filter((v) => fight(v) || v.st.mil > 0).length >= 3 && buyT ? buyP : 0)) break;   // once a basic fleet exists, save for the next buy-out
        T.goal('Production: ' + city.name + ' builds a ' + kind + ' ' + role + ' vehicle (' + cost + ')'); T.say('Fleet: ' + (cnt.land + cnt.sea + cnt.air) + ' vehicles, building a ' + kind + ' ' + role + ' unit');
        ui.produce(city, role, kind); cnt[role]++;
      }

      if (buyT && buyOk && you.money >= buyP + reserve && (type !== 'economic' || !stg || stg.c === buyT || you.money >= buyP + CS().price(stg.c))) { T.goal('Economy: buying out ' + buyT.name + ' for ' + buyP); T.mark(buyT.pos, buyT.name, capital.pos); B._look = buyT.dir.clone(); ui.buy(buyT); return; }
      // upgrades: cheap tiers early, expensive ones when a buy-out is not close
      const order = type === 'military' ? ['fire', 'armor', 'fleet', 'persuade'] : ['persuade', 'fleet', 'armor', 'fire'];
      for (const k of order) {
        const cost = U().techCost(W, k); if (!cost) continue;
        if (k === 'fleet' && cnt.land < cap('land') && cnt.air < cap('air')) continue;
        const lv = U().techLevel(W, 'you', k);
        if (type === 'economic' && stg && you.money < cost + CS().price(stg.c)) continue;
        if (you.money >= cost + (300 + (buyT ? buyP : 0))) { T.goal('Upgrade: ' + U().TECH[k].name + ' tier ' + (lv + 1) + ' (' + cost + ')'); T.say('Spending the treasury on ' + U().TECH[k].name); ui.upgrade(k); break; }
      }
      // the cheapest city belongs to somebody at war with us: warm them up with gifts (cheap compared with the price) so the buy-out opens
      if (buyT && !buyOk && giftT <= 0 && you.money >= 300 && you.money + (you.income || 0) * 3 >= buyP && (type === 'economic' || !(stg && stg.go && stg.c === buyT))) { const res = AI().act(W, W.nationById[buyT.nation], 'gift'); giftT = res.ok ? 4 : 2; if (res.ok) T.say('Diplomacy: warming up ' + buyT.name + "'s owner so we can buy it out"); }

      // ---- spice claims
      const idle = vs.filter((v) => !v.order && !inGroup(v));
      for (const v of idle) {
        if (v.role === 'air') continue;
        let best = null, bd = 1e9;
        for (const g of freeG) {
          if (g.claimBy && g.claimBy !== v.id && W.vehicles.some((o) => o.id === g.claimBy && o.alive && o.order && o.order.type === 'claim')) continue;
          if (v.role === 'land' && (!g.land || W.compOf(g.dir, 'land') !== W.compOf(v.dir, 'land'))) continue;
          if (v.role === 'sea' && !g.nearWater) continue;
          const d = angle(g.dir, v.dir); if (d < bd) { bd = d; best = g; }
        }
        if (best && bd * W.R < 220 && (v.st.kind === 'military' || vs.filter((o) => o.order && o.order.type === 'claim').length < 4)) { best.claimBy = v.id; U().order(W, v, { type: 'claim', g: best }); T.goal('Spice: sending a ' + v.role + ' vehicle to claim a geyser (+100/min)'); T.mark(best.pos || capital.pos, 'spice', v.pos); B._look = best.dir.clone(); idle.splice(idle.indexOf(v), 1); }
      }

      // ---- conquest
      if (!targets.length) return;
      // heal: wounded idle vehicles go home
      vs.forEach((v) => { if (!inGroup(v) && !v.order && !hpOk(v)) U().order(W, v, { type: 'move', dir: capital.dir.clone() }); });
      const act = () => { if (abT <= 0 && W.abil && W.abil.cd <= 0) { abT = 20; T.say('Using the special ability (Q)'); T.tap('KeyQ'); } };
      const verb = type === 'military' ? 'Attacking ' : type === 'economic' ? 'Trading with ' : 'Converting ';
      const meter = (c) => Math.round((type === 'economic' ? c.trade.you : c.convert.you) || 0);
      const defenders = (c) => W.vehicles.filter((o) => o.alive && o.nation === c.nation && o.pos.distanceTo(c.pos) < 75).reduce((n, o) => n + (o.st.mil > 0 ? 1 : 0.3), 0);

      if (stg) {
        const c = stg.c, grp = stg.vs.filter((v) => v.alive);
        if (c.nation === 'you') { stg = null; prog = null; return; }
        const lost = stg.n0 - grp.length;
        if (grp.length < 2 || (stg.go && lost >= Math.ceil(stg.n0 * 0.55) && meter(c) < 85 && type !== 'military') || (stg.go && type === 'military' && grp.length < Math.ceil(stg.n0 * 0.3))) {
          fails++; bl[c.name] = W.t + 200; T.note('civ: strike group at ' + c.name + ' fell to ' + grp.length + '/' + stg.n0 + ' -> retreat, heal and mass a bigger army (fails ' + fails + ')');
          grp.forEach((v) => { U().order(W, v, { type: 'move', dir: capital.dir.clone() }); }); stg = null; prog = null; return;
        }
        if (!stg.go) {
          const near = grp.filter((v) => angle(v.dir, stg.dirs[v.id]) * W.R < 18 || (angle(v.dir, c.dir) * W.R > 50 && !v.order));
          T.goal('Massing ' + near.length + '/' + grp.length + ' vehicles outside turret range of ' + c.name); T.mark(c.pos, c.name + ' (assembly)', capital.pos); B._look = c.dir.clone();
          const el = W.t - stg.t0;
          let sum = 0; grp.forEach((v) => { if (!near.includes(v)) sum += angle(v.dir, stg.dirs[v.id]) * W.R; });
          if (stg.best === undefined || sum < stg.best - 8) { stg.best = sum; stg.tProg = W.t; }
          const stalled = W.t - stg.tProg > 90;
          if (near.length >= grp.length || (el > 60 && near.length >= Math.ceil(grp.length * 0.7)) || (stalled && near.length >= 3)) {
            const goers = grp.filter((v) => near.includes(v) || el > 60);
            const esc2 = goers.filter((v) => type !== 'military' && v.st.mil > 0), conv = goers.filter((v) => !esc2.includes(v));
            esc2.forEach((v) => U().order(W, v, { type: 'attack', city: c }));
            conv.forEach((v) => U().order(W, v, type === 'military' ? { type: 'attack', city: c } : (esc2.length ? { type: 'move', dir: stg.dirs[v.id].clone() } : { type: 'work', city: c })));
            stg.go = true; stg.vs = goers; stg.n0 = goers.length; stg.t1 = W.t; stg.clear = esc2.length > 0; prog = null;
            T.say('All ' + goers.length + ' vehicles go in' + (esc2.length ? ': escorts clear the turrets first' : ' together')); act();
          } else if (stalled) { bl[c.name] = W.t + 120; T.note('civ: massing for ' + c.name + ' stalled (' + near.length + '/' + grp.length + ') -> new plan'); grp.forEach((v) => { v.order = null; }); stg = null; fails++; }
          else grp.forEach((v) => { if (!v.order && !near.includes(v)) U().order(W, v, { type: 'move', dir: stg.dirs[v.id].clone() }); });
          return;
        }
        if (stg.clear) {   // combined arms: military escorts knock the turrets out, then the converters go in
          const esc2 = grp.filter((v) => v.st.mil > 0), up = c.turrets.filter((t) => t.alive).length;
          T.goal('Escorts clear ' + c.name + ' (' + up + '/' + c.turrets.length + ' turrets left)'); T.mark(c.pos, c.name, grp[0].pos); B._look = c.dir.clone();
          esc2.forEach((v) => { if (!v.order) U().order(W, v, { type: 'attack', city: c }); });
          if (!up || !esc2.length || W.t - stg.t1 > 70) { stg.clear = false; stg.t1 = W.t; grp.filter((v) => v.st.mil <= 0).forEach((v) => U().order(W, v, { type: 'work', city: c })); T.say(up ? 'Going in anyway' : 'Turrets down: converters go in'); }
          else return;
        }
        // attack phase
        T.goal(verb + c.name + ' with ' + grp.length + ' vehicles' + (type !== 'military' ? ' (' + meter(c) + '%)' : ' (turrets ' + c.turrets.filter((t) => t.alive).length + ')')); T.mark(c.pos, c.name, grp[0].pos); B._look = c.dir.clone();
        const metric = type === 'military' ? (c.turrets.filter((t) => !t.alive).length * 100 + (c.hallMax - c.hallHp)) : meter(c) * 10;
        const md = Math.min.apply(null, grp.map((v) => v.pos.distanceTo(c.pos)));
        if (!prog || prog.c !== c) prog = { c: c, d: md, m: metric, t: W.t };
        else if (md < prog.d - 4 || metric > prog.m + 2) { prog.d = Math.min(prog.d, md); prog.m = Math.max(prog.m, metric); prog.t = W.t; }
        else if (W.t - prog.t > 100) { bl[c.name] = W.t + 240; fails++; T.note('civ: no progress on ' + c.name + ' for 100s -> trying another city'); grp.forEach((v) => { U().order(W, v, { type: 'move', dir: capital.dir.clone() }); }); stg = null; prog = null; return; }
        // keep orders alive; reinforcements join
        grp.forEach((v) => { if (!v.order) U().order(W, v, v.st.mil > 0 ? { type: 'attack', city: c } : { type: 'work', city: c }); });
        const extra = vs.filter((v) => !inGroup(v) && (!v.order || v.order.type === 'move') && hpOk(v) && AI().canReach(W, v, c) && (fight(v) || (type !== 'military' && v.st.mil > 0 && grp.filter((g) => g.st.mil > 0).length < 5)));
        if (extra.length) { extra.forEach((v) => { U().order(W, v, v.st.mil > 0 ? { type: 'attack', city: c } : { type: 'work', city: c }); stg.ids[v.id] = true; stg.vs.push(v); }); T.say('Reinforcements join the attack on ' + c.name); }
        return;
      }

      // ---- no strike running: wait for an army, then pick a target
      const army = vs.filter((v) => fight(v) && !v.order && hpOk(v));
      const escorts = type === 'military' ? [] : vs.filter((v) => v.st.mil > 0 && !v.order && hpOk(v) && v.role !== 'sea');
      const armyAll = vs.filter((v) => fight(v)).length;
      const capArmy = Math.max(3, Math.min(cap('land') + cap('air') - (type === 'military' ? 1 : 5), 10));
      const need = Math.min(capArmy, type === 'military' ? 6 + Math.min(3, fails) : 5 + Math.min(2, fails));
      if (army.length !== waitN) { waitN = army.length; waitT = W.t; }
      const patient = army.length >= 4 && W.t - waitT > 45 + 20 * Math.min(4, esc);   // production stalled: go with what exists
      if (army.length >= need || patient || (army.length >= 3 && W.t - waitT > 240)) {
        let best = null, bs = -1e9;
        const pool = army.concat(escorts), cen0 = new THREE.Vector3(); pool.forEach((v) => cen0.add(v.dir)); if (cen0.lengthSq() < 1e-6) cen0.copy(capital.dir); cen0.normalize();
        for (const c of targets) {
          const reach = pool.filter((v) => AI().canReach(W, v, c)).length; if (!reach) continue;
          if (c === buyT && buyOk && you.money + (you.income || 0) * 2 >= buyP && esc < 3) continue;    // about to buy it: do not start a fight with its owner
          const d = defenders(c), tur = c.turrets.filter((t) => t.alive).length;
          if (type === 'economic' && W.getRel('you', c.nation) <= -30 && esc < 2) continue;       // trading with somebody at war with us feeds our vehicles to their turrets
          if (type === 'economic' && you.money < CS().price(c) * 0.8 && esc < 3) continue;      // the trade ring decays when we leave: have the cash before we start
          if (esc < 2 && d > army.length * 0.9 + 1 && armyAll < capArmy) continue;       // too strong for now: build up
          const s = reach * 0.4 - angle(cen0, c.dir) * 2.4 - tur * 0.5 - d * 0.8 - c.level * 0.1 + (c.nation.startsWith('n') ? 0.5 : 0);
          if (s > bs) { bs = s; best = c; }
        }
        if (best) {
          const grpA = army.filter((v) => AI().canReach(W, v, best)), grpE = (type !== 'religious' || esc < 1) ? [] : escorts.filter((v) => AI().canReach(W, v, best) && !grpA.includes(v)).slice(0, 4 + esc);
          const group = grpA.concat(grpE);
          const cen = new THREE.Vector3(); group.forEach((v) => cen.add(v.dir)); cen.normalize();
          stg = { c: best, vs: group.slice(), ids: {}, t0: W.t, dirs: {}, go: false, n0: group.length };
          group.forEach((v) => { stg.ids[v.id] = true; const av = angle(best.dir, v.dir), tv = Math.min(1, (62 / W.R) / Math.max(av, 1e-3)), dv0 = best.dir.clone().lerp(v.dir, tv).normalize(), dv = standable(W, v, dv0, best.dir); stg.dirs[v.id] = dv; if (av * W.R > 60) U().order(W, v, { type: 'move', dir: dv.clone() }); });
          T.goal('Target chosen: ' + best.name + ' (' + best.nation + ', ' + defenders(best).toFixed(1) + ' defenders) with ' + group.length + ' vehicles'); T.mark(best.pos, best.name, capital.pos); B._look = best.dir.clone();
          waitN = 0; return;
        }
      }
      T.goal('Building up an army (' + army.length + '/' + need + ' ' + type + ' vehicles, money ' + Math.round(you.money) + ')'); T.mark(null); B._look = capital.dir.clone();
    }
  };
})();
