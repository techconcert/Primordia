/* testrig bot: Space stage. Phases: (1) economy: scan + colonise planets with Colony Packs, collect spice, sell it to empires, buy upgrades from the
 * Market ladder; (2) jump star to star toward the Galactic Core once drive range >= GATE_RANGE (34) or a Wormhole Key is owned; (3) fight the Grox
 * with real flight keys (A/D/W/S + Space); (4) fly to the Staff of Life; (5) click through the ending ("Finish game").
 * Real input: flight keys, Space, KeyT scan, KeyG/KeyJ galaxy jump, KeyE orbit, KeyQ ability, ending buttons.
 * Direct-API fallbacks (same calls the UI buttons make, documented in docs/TESTRIG.md): S.autopilotTo (click-to-fly), S.foundColony (3D placement click),
 * S.buy (Market), S.sellSpice (contact dialog button). `assist` (S.dev.grant) is used ONLY after a very long stall and is flagged in the report. */
(function () {
  'use strict';
  const SP = window.SP = window.SP || {};
  const T = SP.testrig; if (!T || !T.active) return;
  const V3 = THREE.Vector3;

  let S = null, thinkT = 0, job = null, jumpWait = 0, lastAssist = -9999, stageT = 0, endT = 0, soldAt = {}, lastHopT = 0, coreFightT = 0, noCand = {};

  const GR = () => SP.spaceGalaxy;
  function stage() { return SP.stages.space; }
  function wrap(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }

  /** colonisable planet defs of star si (rock/ice/etc, uninhabited, with spice, no colony yet) */
  function candidates(si) {
    const out = [];
    let defs = []; try { defs = GR().planetsOf(S.gal, si, S.campaign) || []; } catch (e) { return out; }
    defs.forEach((d) => {
      if (d.home || d.type === 'gas' || d.inhabited !== undefined || d.spice < 0) return;
      const ps = S.psOf(d); if (ps.colony) return;
      out.push(d);
    });
    out.sort((a, b) => S.tScoreOf(b) - S.tScoreOf(a));
    return out;
  }
  function edgeOK(a, b, ss, st) {
    if (a === b) return false;
    const s = S.gal.stars[b], d = s.pos.distanceTo(S.gal.stars[a].pos);
    if (s.bh && !st.inv.key) return false;
    if (S.gated(s) && !st.inv.key && ss.range < S.GATE_RANGE) return false;
    return d <= ss.range;
  }
  /** BFS hop path (list of star indices after `from`) to the first star satisfying `goal` */
  function pathTo(goal, from) {
    const st = S.st, ss = S.ss, N = S.gal.stars.length, prev = new Array(N).fill(-2); from = from === undefined ? st.loc : from;
    prev[from] = -1; const q = [from];
    while (q.length) {
      const a = q.shift();
      if (a !== from && goal(a)) { const p = []; for (let x = a; x !== from; x = prev[x]) p.unshift(x); return p; }
      for (let b = 0; b < N; b++) if (prev[b] === -2 && edgeOK(a, b, ss, st)) { prev[b] = a; q.push(b); }
    }
    return null;
  }
  function colonyStores() { return S.colonyList().filter((c) => !c.def.home && c.ps.colony.store >= 8); }
  function empireStar(i) { return S.gal.stars[i].empire >= 0; }

  function sellAll() {
    const st = S.st, si = st.loc, emp = S.gal.stars[si].empire; if (emp < 0) return false;
    let tot = 0;
    for (const k in st.spice) if (st.spice[k] > 0) { const n = st.spice[k]; S.sellSpice(emp, +k); tot += n; }
    if (tot) { T.goalDone('sold ' + tot + ' spice to ' + S.gal.empires[emp].name + ' (money ' + Math.round(st.money) + ')'); T.say('Selling ' + tot + ' units of spice'); }
    return tot > 0;
  }
  function shop() {
    const st = S.st, ss = S.ss, key = st.inv.key;
    const cols = S.colonyList().length;
    const tries = [];
    if (st.inv.packs === 0 && cols < 7 && pathCand()) tries.push('pack');
    if (!key && ss.range < S.GATE_RANGE) tries.push('range');
    if (st.up.energy < 2) tries.push('energy'); if (st.up.hull < 2) tries.push('hull'); if (st.up.weapon < 2) tries.push('weapon');
    if (st.up.energy < 4) tries.push('energy'); if (st.up.weapon < 4) tries.push('weapon'); if (st.up.hull < 4) tries.push('hull');
    const lvlMax = { range: 6, energy: 4, weapon: 5, hull: 5 };
    for (const id of tries) {
      if (lvlMax[id] !== undefined && st.up[id] >= lvlMax[id]) continue;
      const p = S.priceOf(id);
      if (st.money >= p && p > 0) { T.goal('Market: buying ' + id + ' for ' + p); T.say('Market purchase: ' + id + ' (' + p + ')'); S.buy(id); return true; }
      if (id === 'range' || id === 'pack') break;     // save up for the important item
    }
    return false;
  }
  function pathCand() { return S.gal.stars.some((s) => !s.core && !s.bh && !noCand[s.i] && candidates(s.i).length && (s.i === S.st.loc || pathTo((x) => x === s.i))); }

  // ---- flight: combat
  function combat() {
    const sh = S.ship, es = S.enemies; if (!es.length) return false;
    let e = null, bd = 1e9; es.forEach((o) => { const d = o.pos.distanceTo(sh.pos); if (d < bd) { bd = d; e = o; } });
    const to = e.pos.clone().sub(sh.pos), want = Math.atan2(to.x, to.z), diff = wrap(want - sh.h);
    const keys = ['Space'];
    if (diff > 0.06) keys.push('KeyA'); else if (diff < -0.06) keys.push('KeyD');
    if (bd > 95) keys.push('KeyW'); else if (bd < 40) keys.push('KeyS'); else if (Math.abs(diff) < 0.5 && Math.sin(S.t * 0.7) > 0.3) keys.push('KeyW');
    T.hold(keys); S.autopilot = null;
    T.mark(e.pos, 'enemy (' + e.kind + ')', sh.pos);
    T.goal('Combat: ' + es.length + ' hostile ' + es[0].kind + ' ships, hull ' + Math.round(S.st.hull) + '/' + Math.round(S.ss.hullMax));
    if (S.st.hull < S.ss.hullMax * 0.4 && S.useAbility && (!S.abil || true) && !B._qT) { B._qT = 30; T.tap('KeyQ'); T.say('Low hull: using the archetype ability (Q)'); }
    return true;
  }

  function startJump(next) {
    // real input: G opens the galaxy map, select the star, J jumps
    if (S.view !== 'galaxy') { S.gotoView('galaxy'); return; }
    S.sel = { type: 'star', i: next };
    T.mark(null);
    T.tap('KeyJ'); lastHopT = S.t;
    T.note('jump -> ' + S.gal.stars[next].name + ' (energy ' + Math.round(S.st.energy) + ', range ' + S.ss.range.toFixed(0) + ')');
  }

  /** hop toward a goal star; returns true when an action was taken */
  function travel(goalFn, why) {
    const st = S.st;
    const p = pathTo(goalFn); if (!p) return false;
    const next = p[0], info = S.jumpInfo(next);
    T.goal(why + ' (' + p.length + ' hops, next ' + S.gal.stars[next].name + ')');
    if (!info.ok && /energy/i.test(info.reason || '')) {
      T.goal('Charging the drive: ' + Math.floor(st.energy) + '/' + Math.ceil(info.cost) + ' energy for the next jump');
      if (S.view === 'galaxy') S.gotoView('system');
      return true;
    }
    if (!info.ok) return false;
    startJump(next); return true;
  }

  const B = T.bots.space = {
    maxSim: 4200, stuckPos: 60, stuckProg: 420,
    enter: function () { S = stage(); thinkT = 1.5; job = null; stageT = 0; endT = 0; soldAt = {}; coreFightT = 0; noCand = {}; B._qT = 0; T.note('space bot ready (seed galaxy ' + (S.gal && S.gal.seed) + ')'); },
    resources: function () {
      S = stage(); const st = S && S.st; if (!st) return null;
      return { money: Math.round(st.money), range: +S.ss.range.toFixed(1), energyMax: S.ss.energyMax, up: st.up, colonies: S.colonyList().length, packs: st.inv.packs, key: st.inv.key, spice: S.cargoTotal(), loc: S.gal.stars[st.loc].name, jumps: st.stats.jumps, kills: st.stats.kills, coreReached: !!st.coreReached, assist: B._assists || 0 };
    },
    probe: function () {
      S = stage(); const st = S && S.st; if (!st) return null;
      return { x: S.ship ? S.ship.pos.x : 0, z: S.ship ? S.ship.pos.z : 0, idleOk: true, prog: Math.round(st.stats.earned / 10) + st.stats.jumps * 20 + S.colonyList().length * 50 + st.stats.scans * 5 + st.stats.kills * 3 + (st.up.range + st.up.energy + st.up.hull + st.up.weapon) * 40 + Math.round(S.cargoTotal() / 3) };
    },
    unstick: function (kind) { job = null; thinkT = 0; T.releaseAll(); S.autopilot = null; if (S && S.view === 'orbit') T.tap('KeyE'); if (S && S.view === 'galaxy') S.gotoView('system'); },
    modal: function (box) {
      // contact dialog: sell everything, then leave
      let sold = false; T.qa('button', box).forEach((b) => { if (/sell all/i.test(b.textContent) && !b.disabled && b.offsetParent) { b.click(); sold = true; } });
      if (sold) { T.say('Trading with the aliens: selling spice'); return true; }
      return T.clickText(/goodbye|close|ok|continue/i, box);
    },
    tick: function (dt) {
      S = stage(); if (!S || !S.st || !S.ship) return;
      const st = S.st; stageT += dt; B._qT = Math.max(0, (B._qT || 0) - dt);
      // ---------- ending
      if (S.ending || S.endingUI || T.q('.sp-end')) {
        T.releaseAll(); T.mark(null); T.goal('The Staff of Life! Watching the ending'); endT -= dt;
        if (endT <= 0) { endT = 0.9; if (!T.clickText(/finish game/i)) T.clickText(/next/i); }
        return;
      }
      if (st.ended) { T.releaseAll(); if (S.h && S.h.finishBtn) { endT -= dt; if (endT <= 0) { endT = 1; T.clickText(/finish game/i); } } return; }
      if (S.trans || S.dying || SP.game.editorOpen || SP.ui.modalCount() > 0) { T.releaseAll(); return; }
      // ---------- per-frame flight
      if (S.view === 'system') {
        if (combat()) return;
        const atCore = S.gal.stars[st.loc].core, sy = S.sys;
        if (atCore && sy && sy.staff) {
          T.hold([]); T.mark(sy.staff.position, 'Staff of Life', S.ship.pos); T.goal('The Guardians are down: flying to the Staff of Life');
          if (!S.autopilot) S.autopilot = { point: sy.staff.position.clone().setY(0) };
          return;
        }
        T.hold(S.autopilot ? [] : []);
      } else T.releaseAll();
      // ---------- slow thinking
      thinkT -= dt; if (thinkT > 0) return; thinkT = 0.6;
      if (S.view === 'galaxy') { if (!S.trans) { const nxt = B._next; if (nxt !== undefined && nxt !== null) startJump(nxt); else S.gotoView('system'); } return; }
      if (S.view === 'orbit') { if (job && job.kind === 'colonise') return colonise(); T.tap('KeyE'); return; }
      const si = st.loc, star = S.gal.stars[si], ss = S.ss;
      const key = st.inv.key, canCore = key || ss.range >= S.GATE_RANGE;
      // hull / energy sanity: repair at harbours
      if (S.refuelStar(si) && st.hull < ss.hullMax * 0.6 && st.money > 100) S.buy('repair');
      // sell when at an empire star
      if (empireStar(si) && S.cargoTotal() > 0 && (soldAt[si] === undefined || S.t - soldAt[si] > 30)) { soldAt[si] = S.t; sellAll(); }
      if (shop()) return;
      // assist fallback after a very long stall
      if (stageT > 1700 && !canCore && S.t - lastAssist > 700) { lastAssist = S.t; B._assists = (B._assists || 0) + 1; S.dev.grant(1500); T.note('ASSIST: granted 1500 money (stage elapsed ' + Math.round(stageT) + 's, range ' + ss.range.toFixed(1) + ')'); }
      // ---------- phase 2: go for the core
      if (canCore) {
        if (star.core) { T.goal('At the Galactic Core: clearing the Guardians'); if (S.sys && S.sys.staff && !S.autopilot) S.autopilot = { point: S.sys.staff.position.clone().setY(0) }; return; }
        // with the key, ride the black holes: first go to bh[0]
        const goalFn = key && !st.wormholeUsed ? (x) => x === S.gal.bh[0] : (x) => x === S.gal.coreIdx;
        const p = pathTo(goalFn);
        if (p) { B._next = p[0]; if (travel(goalFn, key && !st.wormholeUsed ? 'Wormhole Key: heading to the first black hole' : 'Drive range ' + ss.range.toFixed(0) + ': jumping toward the Galactic Core')) return; }
        else if (key && st.wormholeUsed) { const q = pathTo((x) => x === S.gal.coreIdx); if (q) { B._next = q[0]; if (travel((x) => x === S.gal.coreIdx, 'Out of the wormhole: jumping into the Core')) return; } }
        T.goal('No route to the core yet (range ' + ss.range.toFixed(0) + '), more upgrades/energy needed');
      }
      // ---------- phase 1: economy
      if (job && job.kind === 'colonise') return colonise();
      if (st.inv.packs > 0) {
        const here = candidates(si);
        if (here.length) { job = { kind: 'colonise', def: here[0], step: 'fly', t: 0 }; T.goal('Colonising ' + here[0].name + ': flying there'); return colonise(); }
        noCand[si] = 1;
        const goalFn = (x) => !S.gal.stars[x].core && !S.gal.stars[x].bh && !noCand[x] && candidates(x).length > 0;
        B._next = (pathTo(goalFn) || [])[0];
        if (travel(goalFn, 'Looking for a planet to colonise')) return;
      }
      // carry spice to an empire
      if (S.cargoTotal() >= 10 && !empireStar(si)) { const f = (x) => empireStar(x); const p = pathTo(f); if (p) { B._next = p[0]; if (travel(f, 'Carrying ' + S.cargoTotal() + ' spice to market')) return; } }
      // collect from rich colonies
      const rich = colonyStores().filter((c) => c.star !== si).sort((a, b) => b.ps.colony.store - a.ps.colony.store)[0];
      if (rich && rich.ps.colony.store >= 14) { const f = (x) => x === rich.star; const p = pathTo(f); if (p) { B._next = p[0]; if (travel(f, 'Collecting spice from ' + rich.def.name)) return; } }
      if (S.cargoTotal() >= 4 && !empireStar(si)) { const f = (x) => empireStar(x); const p = pathTo(f); if (p) { B._next = p[0]; if (travel(f, 'Selling the small spice cargo')) return; } }
      // nothing to do: fly around a bit (scan planets in this system) or wait
      const scanDef = (S.sys ? S.sys.planets : []).map((p) => p.def).filter((d) => d.type !== 'gas' && d.inhabited === undefined && !S.psOf(d).scanned)[0];
      if (scanDef && !S.scanning) { T.goal('Scanning ' + scanDef.name); S.sel = { type: 'planet', def: scanDef }; if (S.ship.pos.distanceTo(S.planetWorld(scanDef)) > scanDef.size + 90) S.autopilotTo(scanDef, false); else T.tap('KeyT'); return; }
      if (empireStar(si) && st.money > 60 && S.rel(S.gal.stars[si].empire).att < 60 && (st.money > 700)) { S.gift(S.gal.stars[si].empire); }
      T.goal('Waiting for colonies to produce spice (money ' + Math.round(st.money) + ', next goal range ' + S.GATE_RANGE + ')');
      // wander: go back to the closest colony system with cargo or just stay
      const col = S.colonyList().filter((c) => !c.def.home)[0];
      if (col && col.star !== si && !(S.t - lastHopT < 60)) { const f = (x) => x === col.star; const p = pathTo(f); if (p) { B._next = p[0]; travel(f, 'Returning to a colony'); } }
    }
  };

  function colonise() {
    const o = S.orb, j = job; if (!j) return;
    const def = j.def, ps = S.psOf(def); j.t += 0.6;
    if (ps.colony) { T.goalDone('colony founded on ' + def.name); job = null; T.tap('KeyE'); return; }
    if (j.t > 140) { T.note('colonise job timed out for ' + def.name); noCand[S.st.loc] = 1; job = null; if (S.view === 'orbit') T.tap('KeyE'); return; }
    if (S.view === 'system') {
      const pw = S.planetWorld(def), d = S.ship.pos.distanceTo(pw);
      T.mark(pw, def.name, S.ship.pos);
      if (j.step === 'fly') {
        if (!S.autopilot && d > def.size + 80) S.autopilotTo(def, false);
        if (d <= def.size + 90) j.step = 'scan';
        return;
      }
      if (j.step === 'scan') {
        if (!ps.scanned) { S.sel = { type: 'planet', def: def }; if (!S.scanning) { T.goal('Scanning ' + def.name + ' (T-score, spice)'); T.say('Pressing T to scan'); T.tap('KeyT'); } return; }
        j.step = 'orbit';
      }
      if (j.step === 'orbit') { T.goal('Going down into orbit around ' + def.name); S.sel = { type: 'planet', def: def }; S.gotoView('orbit', def); return; }
      return;
    }
    if (S.view === 'orbit' && o && o.planet) {
      T.mark(null); T.goal('Founding a colony on dry land of ' + def.name);
      if (S.st.inv.packs <= 0) { job = null; T.tap('KeyE'); return; }
      if (!o.placing) S.beginColonise();
      const rng = T.rng();
      for (let k = 0; k < 400; k++) {
        const v = new V3(rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)); if (v.lengthSq() < 0.05) continue; v.normalize();
        if (!o.planet.isWater(v) && o.planet.slopeAt(v) < 0.45) { S.foundColony(v); return; }
      }
      T.note('no dry land found on ' + def.name); job = null; noCand[S.st.loc] = 1; T.tap('KeyE');
    }
  }
})();
