/* testrig bot: Creature stage. Real keyboard input (camera-relative WASD, Shift, E, M, F, G, 1-8) driven from read-only state of SP.stages.creature.
 * Direct stage API use (documented in docs/TESTRIG.md): S.setTarget(actor) to pick a social/combat target (instead of Tab-cycling / clicking actors). */
(function () {
  'use strict';
  const SP = window.SP = window.SP || {};
  const T = SP.testrig; if (!T || !T.active) return;
  const V3 = THREE.Vector3;
  const SOCIAL = ['sing', 'dance', 'charm', 'pose'];
  const _d = new V3(), _t = new V3();

  const det = { t: 0, dir: null }, jam = { t: 0 };
  let S = null, dietPlan = null, mateAt = 150, unst = { t: 0, x: 0, y: 0 }, expl = null, wasDead = false, lastBrain = 0, eatT = 0, abT = 0, socCool = {}, evolveT = 0, avoid = {}, lastKills = 0, lastAllies = 0, foundSeen = 0, mateWait = 0;

  function st() { return SP.stages.creature; }
  const _pw = new THREE.Vector3();
  function steer(S, tp, o) {
    o = o || {};
    const b = S.body; _d.copy(tp).sub(b.pos); _d.addScaledVector(b.up, -_d.dot(b.up));
    const dist = _d.length();
    if (dist < (o.stop || 0)) { T.hold(o.sprint ? ['ShiftLeft'] : []); return dist; }
    _d.normalize();
    // heavy bodies follow the shoreline instead of walking into the lake (shared game helper)
    const wcl = S.stats && S.stats.waterClass;
    if (!o.straight && wcl && wcl !== 'swimmer' && SP.physics.pathAroundWater && dist > 2.5) { const pd = SP.physics.pathAroundWater(b, S.planet, tp, _pw); if (pd) _d.copy(pd); }
    // obstacle whiskers over the shared prop hash (trunks / rocks, water for non-swimmers); a detour waypoint from the stuck escalation overrides the goal
    if (dist > 1.6 && SP.physics.steerAround) {
      const pd = (!o.straight && wcl && wcl !== 'swimmer') ? SP.physics.passDepth(b) : undefined;
      if (det.t > 0 && det.dir) { det.t -= 1 / 20; _d.copy(det.dir); }
      SP.physics.steerAround(b, S.planet, _d, _pw, { goal: tp, pd: pd === Infinity ? undefined : pd }); _d.copy(_pw);
      const sa = b._sa; jam.t = (sa && sa.blocked && b.speed < 0.7) ? jam.t + 1 / 20 : Math.max(0, jam.t - 0.1);
      if (jam.t > 1.2) { jam.t = 0; B.unstick('soft'); }
    }
    const fwd = S.cam.forwardOnSurface(), right = S.cam.rightOnSurface();
    T.wasd(_d.dot(right), _d.dot(fwd), o.sprint ? ['ShiftLeft'] : []);
    return dist;
  }
  function dist3(a, b) { return a.distanceTo(b); }
  function strength(S, a) { return a.body.mass / Math.max(0.05, S.body.mass); }
  function dangerous(S, a) { return a.state !== 'dead' && !a.packOf && !a.species.isPlayer && a.species.relation !== 'allied' && (a.state === 'attack' || a.aggro > 0 || a.species.relation === 'hostile' || a.state === 'hunt'); }

  /** nearest dry land around the body (samples rings of directions) */
  function shoreTarget(S) {
    const b = S.body, p = b.pos.clone().normalize(); let best = null, bd = 1e9;
    for (let k = 0; k < 48; k++) {
      const ang = 0.02 + (k % 6) * 0.025, ax = new V3(1, 0, 0).applyAxisAngle(p, (k / 8) * Math.PI * 2 + 0.3).cross(p).normalize();
      const dir = p.clone().applyAxisAngle(ax, ang);
      let ok = false; try { ok = !S.planet.isWater(dir) && S.planet.slopeAt(dir) < 0.6; } catch (e) { /* */ }
      if (ok && ang < bd) { bd = ang; best = dir; }
    }
    if (!best) return S.nest.pos.clone();
    return best.multiplyScalar(S.planet.surfaceRadius ? S.planet.surfaceRadius(best) : S.planet.radius);
  }

  /** sinkers (and low-breath bodies) must not wade through deep water: sample the straight route for water */
  function wet(S, v) { try { return S.planet.isWater(v.clone().normalize()); } catch (e) { return false; } }
  function pathClear(S, to) {
    const wc = S.stats && S.stats.waterClass; if (wc !== 'sinker' || SP.physics.pathAroundWater) return true;   // the shared router walks round lakes
    const a = S.body.pos.clone().normalize(), c = to.clone().normalize();
    for (let i = 1; i <= 16; i++) if (wet(S, a.clone().lerp(c, i / 16))) return false;
    return true;
  }

  function pickExplore(S) {
    const rng = T.rng(), b = S.body;
    for (let i = 0; i < 12; i++) {
      const axis = new V3(rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)).normalize();
      const ang = rng.range(0.25, 0.7);
      const dir = b.pos.clone().normalize().applyAxisAngle(axis, ang);
      let ok = true; const wc = S.stats && S.stats.waterClass; try { ok = (wc === 'swimmer' && rng.chance(0.3) ? S.planet.isWater(dir) : !S.planet.isWater(dir)) && (S.planet.isWater(dir) || S.planet.slopeAt(dir) < 0.5); } catch (e) { /* */ }
      if (ok && !pathClear(S, dir)) ok = false;
      if (ok) { const r = S.planet.surfaceRadius ? S.planet.surfaceRadius(dir) : S.planet.radius; const g = dir.multiplyScalar(r); return SP.physics.freeSpot ? SP.physics.freeSpot(S.planet, g, 2.0) : g; }   // never pick a goal inside a trunk cluster
    }
    return b.pos.clone().applyAxisAngle(new V3(0, 1, 0), 0.4);
  }

  const B = T.bots.creature = {
    maxSim: 7000, stuckPos: 12, stuckProg: 150,
    enter: function () {
      const r = T.rng();
      S = st();
      mateAt = r.pick([200, 280, 360]);
      dietPlan = null; B._matings = 0; B._lastDna = undefined; unst.t = 0; expl = null; wasDead = false; lastBrain = 0; socCool = {}; avoid = {}; mateWait = 0; foundSeen = 0;
      T.note('creature plan: mate when DNA >= ' + mateAt);
    },
    diet: function () { const c = SP.game.state && SP.game.state.cards; return (c && c.cell) || 'omnivore'; },
    resources: function () { if (!S || !S.C) return null; return { brainXp: Math.round(S.brainXp), brainLevel: S.brainLevel, dna: Math.round(S.C.dna), hp: Math.round(S.hp), hunger: Math.round(S.hunger), kills: S.C.stats.kills, allies: S.C.stats.allies, pack: S.pack.length, bones: S.eco.bonePiles.filter((p) => p.found).length + '/' + S.eco.bonePiles.length, diet: S.dietOf() }; },
    probe: function () { if (!S || !S.body) return null; return { x: S.body.pos.x, z: S.body.pos.z, eps: 0.6, prog: Math.round(S.brainXp) + (S.C.stats.kills || 0) * 3 + S.explored.size, idleOk: S.social && S.social.active }; },
    assist: function () { S = st(); if (S && S.brainXp < 500) { S.brainXp = 500; T.note('ASSIST: brainXp set to 500 (bot then presses the real Evolve button)'); } },
    // escalation: 1 back off, 2 detour waypoint sideways (whiskers follow it for a few s), 3 jump + sprint away, 4 re-plan (new explore goal, skip piles)
    unstick: function (level) {
      const r = T.rng(); B._esc = (B._escT > 0 ? Math.min(4, (B._esc || 0) + 1) : 1); B._escT = 25; if (level === 'hard') B._esc = Math.max(B._esc, 3);
      const b = S && S.body; if (!b) return;
      const side = r.chance(0.5) ? 1 : -1;
      unst.t = 0;
      if (B._esc === 1) { unst.t = 1.1; unst.x = 0; unst.y = -1; }                                           // back off
      else if (B._esc === 2) { det.dir = b.heading.clone(); SP.physics.rotate(det.dir, b.up, side * (1.6 + r.range(0, 0.8))); det.t = 3.5; }   // detour sideways
      else if (B._esc === 3) { det.dir = b.heading.clone(); SP.physics.rotate(det.dir, b.up, side * 2.6); det.t = 3; unst.t = 0; T.tap('Space'); B._jumpT = 1.5; }
      else { expl = null; det.t = 0; for (const k in avoid) if (/^pile/.test(k)) avoid[k] = Math.max(avoid[k], 60); if (S.walkTo) S.walkTo = null; unst.t = 1.4; unst.x = side; unst.y = -0.4; }
      T.note('unstick step ' + B._esc + ' (' + level + ')');
    },
    modal: function () { return false; },
    tick: function (dt) {
      S = st(); if (!S || !S.body || !S.eco) return;
      if (S.state === 'editor') return;                               // the game opens the first editor itself
      if (S.dead) { if (!wasDead) { wasDead = true; T.death(); } T.mark(null); T.releaseAll(); T.goal('Died: respawning at the nest'); return; }
      wasDead = false;
      if (S.state !== 'play' || S.busy || S.completed) { T.releaseAll(); T.mark(null); if (S.state !== 'play') T.goal('Hatching into the new body'); return; }
      if (SP.ui.modalCount() > 0) { T.releaseAll(); return; }
      if (B._escT > 0) B._escT -= dt;
      if (B._jumpT > 0) { B._jumpT -= dt; if (Math.floor(B._jumpT * 4) % 2) T.tap('Space'); }
      if (unst.t > 0) { unst.t -= dt; T.wasd(unst.x, unst.y, []); if (unst.t > 1) T.tap('Space'); return; }

      const b = S.body, eco = S.eco, nest = S.nest, cd = S.cd || {};
      eatT -= dt; abT -= dt; mateWait -= dt; evolveT -= dt;
      for (const k in socCool) if ((socCool[k] -= dt) <= 0) delete socCool[k];
      for (const k in avoid) if ((avoid[k] -= dt) <= 0) delete avoid[k];
      if (S.brainLevel !== lastBrain) { if (lastBrain) T.goalDone('brain level ' + S.brainLevel); lastBrain = S.brainLevel; }
      if (S.C.stats.allies !== lastAllies) { lastAllies = S.C.stats.allies; T.goalDone('allied a species (' + lastAllies + ')'); }

      // ---- 0. water safety (DESIGN 3.6): sinkers stay out of deep water; everyone heads for shore when breath runs low (Space kicks up / paddles)
      const wc = (S.stats && S.stats.waterClass) || 'swimmer', wet = b.waterState && b.waterState !== 'dry';
      const lowBreath = b.breathMax ? b.breath < b.breathMax * (wc === 'sinker' ? 0.7 : 0.35) : false;
      if (b.drowning || (wet && (lowBreath || (wc === 'sinker' && b.waterState !== 'wading')))) {
        const sh = shoreTarget(S);
        T.goal((b.drowning ? 'Drowning!' : 'Low breath (' + Math.round(b.breath) + ')') + ' [' + wc + '] -> swimming to shore'); T.mark(sh, 'shore', b.pos);
        steer(S, sh, { sprint: true, straight: true }); T.tap('Space'); B._wetSeen = (B._wetSeen || 0) + dt; return;
      }

      // ---- 1. evolve
      if (S.brainXp >= 500 && !S.completed) {
        T.goal('Brain is full -> pressing Evolve to reach the Tribal Stage'); T.mark(null);
        T.releaseAll();
        if (evolveT <= 0) { evolveT = 1.5; const btn = T.q('.cr-evolve.on') || (S.hud && S.hud.evolve); if (btn) btn.click(); else S.evolve(); }
        return;
      }

      // ---- 2. threats
      const near = [];
      for (const a of eco.actors) { if (a.state === 'dead' || a.packOf || a.species.isPlayer) continue; const d = dist3(a.body.pos, b.pos); if (d < 60) near.push({ a, d }); }
      near.sort((x, y) => x.d - y.d);
      let threat = null;
      for (const n of near) { if (n.d < 16 && dangerous(S, n.a) && n.a.state !== 'flee') { threat = n; break; } }
      const hpFrac = S.hp / S.maxHp;
      if (threat) {
        const a = threat.a, r = strength(S, a);
        const canFight = r < 1.0 && hpFrac > 0.4 && !avoid[a.id || 'x'];   // a fight we could not finish in 35 s is given up (run home instead of spinning on it)
        // cornered: a faster hunter that keeps biting while we run is fought back (running for > 9 s with it within 8 u)
        B._runT = (threat.d < 8 && (!canFight || r > 1.4)) ? (B._runT || 0) + dt : Math.max(0, (B._runT || 0) - dt * 0.5);
        const cornered = B._runT > 9 && hpFrac > 0.25 && r < 3;
        if ((!canFight || r > 1.4) && !cornered) {
          T.goal('Danger: ' + a.species.name + ' (' + (r > 1.4 ? 'much stronger' : 'dangerous') + ') -> running home to the nest');
          T.mark(nest.pos, 'nest', b.pos);
          steer(S, nest.pos, { sprint: true });
          if (S.social.active) S.social.stop('flee');
          return;
        }
        if (cornered) { T.goal('Cornered by ' + a.species.name + ' (strength x' + r.toFixed(1) + ') -> fighting back'); if (B._runT > 40) B._runT = 0; return fight(S, a, dt); }
        T.goal('Fighting weaker ' + a.species.name + ' (strength x' + r.toFixed(1) + ')');
        return fight(S, a, dt);
      }

      // ---- 3. social minigame in progress
      if (S.social.active) { return social(S, dt); }

      // ---- 4. hunger
      if (S.hunger < 45) {
        const f = findFood(S);
        if (f) { T.goal('Hungry (' + Math.round(S.hunger) + ') -> heading to ' + f.label); T.mark(f.pos, f.label, b.pos); return goEat(S, f); }
        const prey = pickPrey(S, near);
        if (prey) { T.goal('Hungry carnivore -> hunting ' + prey.species.name); return fight(S, prey, dt); }
      }

      // ---- 5. mate at the nest when there is enough DNA
      if (B._lastDna !== undefined && S.C.dna < B._lastDna - 40) { B._matings = (B._matings || 0) + 1; T.note('DNA spent (' + Math.round(B._lastDna) + ' -> ' + Math.round(S.C.dna) + '): body change #' + B._matings); }
      B._lastDna = S.C.dna;
      if (S.C.dna >= mateAt && S.brainXp < 500 && (B._matings || 0) < 3) {   // three body changes per run are plenty to exercise the editor; after that DNA is just XP
        const dn = dist3(b.pos, nest.pos);
        if (dn < 9) { T.hold([]); T.goal('DNA ' + Math.round(S.C.dna) + ' >= ' + mateAt + ' -> mating (M) to evolve the body'); if (mateWait <= 0) { mateWait = 3; T.tap('KeyM'); } return; }
        T.goal('DNA ' + Math.round(S.C.dna) + ' >= ' + mateAt + ' -> going to the nest to mate'); T.mark(nest.pos, 'nest (mate)', b.pos); steer(S, nest.pos, { stop: 6 }); return;
      }

      // ---- 6. recruit allies / nest-mates into the pack
      if (S.packFree() > 0) {
        let c = null;
        for (const n of near) { const a = n.a; if (!a.packOf && (a.species.isPlayer || a.species.relation === 'allied') && n.d < 25) { c = n; break; } }
        if (c) {
          T.goal('Recruiting ' + c.a.species.name + ' into the pack (G)'); T.mark(c.a.body.pos, 'recruit', b.pos);
          if (c.d < 8) { T.hold([]); if (S.target !== c.a) S.setTarget(c.a); if (abT <= 0) { abT = 1.0; T.tap('KeyG'); } } else steer(S, c.a.body.pos, { stop: 5 });
          return;
        }
      }

      const pilesList = S.revealedPiles().filter((p) => !p.found && !(avoid['pile' + eco.bonePiles.indexOf(p)]) && pathClear(S, p.pos)), pilesLeft = pilesList.length;
      // ---- 7. befriend neutral species (social minigame)
      for (const n of near) {
        const a = n.a, sp = a.species;
        if (sp.relation !== 'neutral' || a.impressed || dangerous(S, a) || socCool[a.id || sp.id] || avoid[sp.id]) continue;
        if (n.d > (pilesLeft ? 22 : 52)) continue;   // with bone piles to collect only talk to species that are right here
        if (a.guard || a.isEpic) continue;
        T.goal('Curious: wants to befriend ' + sp.name + ' -> walking over to perform'); T.mark(a.body.pos, sp.name, b.pos);
        if (n.d < 9) {
          T.hold([]);
          if (S.target !== a) S.setTarget(a);
          if (S.mode !== 'social' && abT <= 0) { abT = 1.0; T.tap('KeyF'); }
          else if (S.mode === 'social' && !S.social.active && abT <= 0) { abT = 2; if (!S.social.canTalk(a)) { T.tap('Digit5'); } else { socCool[a.id || sp.id] = 40; S.setMode('combat'); } }
        } else steer(S, a.body.pos, { stop: 6 });
        return;
      }
      if (S.mode === 'social' && !S.social.active) S.setMode('combat');

      // ---- 8. bone piles (unlock parts + DNA)
      const piles = pilesList;
      if (piles.length) {
        piles.sort((x, y) => dist3(x.pos, b.pos) - dist3(y.pos, b.pos));
        const p = piles[0];
        T.goal('Seeking bone piles (' + piles.length + ' left) -> parts + DNA'); T.mark(p.pos, 'bones', b.pos);
        const d = steer(S, p.pos, { stop: 1.2 });
        B._pileT = (B._pileT || 0) + dt; if (B._pile !== p) { B._pile = p; B._pileT = 0; }
        if (b._paw && b._paw.unreachable && B._pileT > 3) { avoid['pile' + eco.bonePiles.indexOf(p)] = 240; T.note('bone pile is on another island -> skipping'); b._paw.unreachable = false; }
        if (B._pileT > 110) { avoid['pile' + eco.bonePiles.indexOf(p)] = 300; T.note('giving up on a bone pile for now'); }
        return;
      }

      // ---- 9. hunt for DNA when strong, else explore
      const prey = pickPrey(S, near, true);
      if (prey) { T.goal('Strong enough -> hunting ' + prey.species.name + ' for DNA'); return fight(S, prey, dt); }
      if (!expl || dist3(b.pos, expl) < 6 || (expl._t = (expl._t || 0) + dt) > 40) expl = pickExplore(S);
      T.goal('Nothing urgent -> exploring new areas (+DNA)'); T.mark(expl, 'explore', b.pos);
      steer(S, expl, { stop: 4 });
    }
  };

  function findFood(S) {
    const b = S.body, diet = S.dietOf(); let best = null;
    if (diet !== 'carnivore') {
      const node = S.planet.flora.nearest(b.pos, 140, (n) => n.fruit > 0 && !(S.planet.isWater && S.planet.isWater(n.pos.clone().normalize())));
      if (node) best = { kind: 'fruit', pos: node.pos, d: dist3(node.pos, b.pos), label: 'fruit bush' };
    }
    if (diet !== 'herbivore') {
      for (const c of S.eco.carcasses) { if (c.meat <= 0) continue; const d = dist3(c.pos, b.pos); if (d < 140 && (!best || d < best.d)) best = { kind: 'meat', pos: c.pos, d, label: 'carcass' }; }
    }
    return best;
  }
  function goEat(S, f) {
    const reach = 2.2 + S.body.radius;
    if (f.d < reach) { T.hold([]); if (eatT <= 0) { eatT = 0.9; T.tap('KeyE'); } } else steer(S, f.pos, { stop: reach * 0.7 });
  }
  function pickPrey(S, near, forDna) {
    if (S.dietOf() === 'herbivore' && !forDna) return null;
    if (S.hp / S.maxHp < 0.7) return null;
    const lv = S.abilityLevels(); if (!(lv.bite > 0 || lv.strike > 0 || lv.charge > 0 || lv.spit > 0)) return null;
    for (const n of near) {
      const a = n.a; if (a.species.relation === 'allied' || a.species.relation === 'extinct' || a.guard || a.isEpic || avoid[a.id || 'x']) continue;
      if (strength(S, a) < (forDna ? 0.6 : 0.85) && n.d < 30) { if (forDna && S.dietOf() === 'herbivore' && !(a.aggro > 0)) continue; return a; }
    }
    return null;
  }
  function fight(S, a, dt) {
    const b = S.body, d = dist3(a.body.pos, b.pos) - a.body.radius - b.radius * 0.5;
    T.mark(a.body.pos, a.species.name, b.pos);
    if (S.target !== a) S.setTarget(a);
    if (S.mode !== 'combat') S.setMode('combat');
    if (d > 2.0) { steer(S, a.body.pos, { stop: 0.5 }); } else T.hold([]);
    const lv = S.abilityLevels();
    if (abT <= 0 && d < 3.2) {
      abT = 0.35;
      if (lv.strike > 0 && !(cd(S, 'strike') > 0)) T.tap('Digit3');
      else if (lv.bite > 0 && !(cd(S, 'bite') > 0)) T.tap('Digit1');
      else if (lv.charge > 0 && !(cd(S, 'charge') > 0) && d > 1) T.tap('Digit2');
    } else if (abT <= 0 && lv.spit > 0 && d > 3 && d < 12 && !(cd(S, 'spit') > 0)) { abT = 0.5; T.tap('Digit4'); }
    // give up if it takes too long
    B._fightT = (B._fightT || 0) + dt; if (B._fightA !== a) { B._fightA = a; B._fightT = 0; }
    if (B._fightT > 35) { avoid[a.id || 'x'] = 120; B._fightT = 0; }
  }
  function cd(S, k) { return (S.cd && S.cd[k]) || 0; }
  function social(S, dt) {
    const Z = S.social, a = Z.actor;
    T.hold([]);
    T.goal('Social minigame with ' + (a ? a.species.name : '?') + ': ' + (Z.phase === 'reply' ? 'answering the beat' : 'watching the gestures'));
    if (a) T.mark(a.body.pos, 'friend?', S.body.pos);
    if (Z.phase === 'reply') {
      for (const s of Z.slots) {
        if (s.res || s._p) continue;
        if (s.tHit - Z.t <= dt * 0.6) { s._p = true; T.tap('Digit' + (5 + SOCIAL.indexOf(s.ab))); T.say('Pressing ' + s.ab + ' on the beat'); }
      }
    }
  }
})();
