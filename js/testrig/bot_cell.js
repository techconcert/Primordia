/* testrig bot: Cell stage. Reads SP.stages.cell._dbg.state (read-only) and steers with real WASD / Space / C key events. */
(function () {
  'use strict';
  const SP = window.SP = window.SP || {};
  const T = SP.testrig; if (!T || !T.active) return;

  let dietWant = null, wander = { x: 0, z: 0, t: 0 }, unst = { t: 0, ax: 0, az: 0 }, lastLevel = 0, lastDead = false, partsSeen = 0, mateWait = 0, lastProg = 0;
  const POOL_R = 140;

  function St() { return SP.stages.cell && SP.stages.cell._dbg && SP.stages.cell._dbg.state; }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }
  function nearest(list, P, pred) {
    let best = null, bd = 1e9;
    for (let i = 0; i < list.length; i++) { const f = list[i]; if (pred && !pred(f)) continue; const d = Math.hypot(f.x - P.x, f.z - P.z); if (d < bd) { bd = d; best = f; } }
    return best ? { f: best, d: bd } : null;
  }
  function go(P, tx, tz, label) { const dx = tx - P.x, dz = tz - P.z; T.wasd(dx, -dz); T.mark({ x: tx, y: 0.6, z: tz }, label, { x: P.x, y: 0.6, z: P.z }); }

  const B = T.bots.cell = {
    maxSim: 2400,
    enter: function () {
      const rng = T.rng();
      dietWant = rng.pick(['herbivore', 'carnivore', 'omnivore']);
      lastLevel = 0; lastDead = false; partsSeen = 0; unst.t = 0; lastProg = 0;
      T.note('cell diet plan: ' + dietWant);
    },
    diet: function () { return dietWant; },
    resources: function () { const S = St(); if (!S) return null; return { progress: +S.progress.toFixed(1), level: S.level + 1, dna: +(S.campaign.dna || 0).toFixed(0), kills: S.kills, plant: S.plantEaten, meat: S.meatEaten, deaths: S.deaths || 0 }; },
    probe: function () { const S = St(); if (!S || !S.player) return null; return { x: S.player.x, z: S.player.z, prog: Math.floor(S.progress * 4) + (S.campaign.dna | 0), eps: 0.8 }; },
    unstick: function (level) { unst.t = level === 'hard' ? 3 : 1.6; const a = T.rng().range(0, 6.28); unst.ax = Math.cos(a); unst.az = Math.sin(a); },
    tick: function (dt) {
      const S = St(); if (!S || !S.player || !S.scene) return;
      const P = S.player;
      if (S.deaths !== undefined && S.deaths !== B._deaths) { if (B._deaths !== undefined) T.death(); B._deaths = S.deaths; }
      if (P.dead || S.editing || S.ending) { T.releaseAll(); T.mark(null); T.goal(S.ending ? 'Level complete: evolution finished!' : P.dead ? 'Got eaten, respawning...' : 'Evolving at the cell editor'); return; }
      if (S.level !== lastLevel) { lastLevel = S.level; T.goalDone('cell level ' + (S.level + 1)); }
      if (S.partsFound !== undefined && S.partsFound !== partsSeen) { partsSeen = S.partsFound; T.goalDone('collected cell part'); }
      if (unst.t > 0) { unst.t -= dt; T.wasd(unst.ax, -unst.az); return; }

      const food = window.__food || { plants: [], meats: [], planks: [] };
      // ---- threats: predators that are not clearly smaller than us
      let flee = null, fd = 1e9;
      for (const c of S.cells) {
        if (c.dead || c === P || c.type === 'mate' || c.rise > 0.3) continue;
        const pred = c.type === 'hunter' || c.type === 'epic' || c.type === 'electric';
        if (!pred || c.r < P.r * 0.9) continue;
        const d = dist(c, P) - c.r - P.r;
        if (d < Math.max(10, c.r * 4) && d < fd) { fd = d; flee = c; }
      }
      if (flee) {
        T.goal('Danger: a bigger ' + flee.type + ' is near -> swimming away'); T.mark({ x: flee.x, y: 0.6, z: flee.z }, 'predator', { x: P.x, y: 0.6, z: P.z });
        let ex = P.x - flee.x, ez = P.z - flee.z;
        const rc = Math.hypot(P.x, P.z); if (rc > POOL_R * 0.8) { ex -= P.x * 0.03; ez -= P.z * 0.03; }   // do not flee into the wall
        T.wasd(ex, -ez); B._burstT = (B._burstT || 0) - dt; if (fd < flee.r * 2 && B._burstT <= 0) { B._burstT = 1.2; T.tap('Space'); }
        return;
      }
      // ---- mate: enough DNA -> call, then swim into the mate
      if (S.mate && !S.mate.dead) {
        T.goal('A mate is here -> swimming into it to open the editor');
        go(P, S.mate.x, S.mate.z, 'mate'); return;
      }
      mateWait -= dt;
      if (mateWait <= 0 && S.mateCd <= 0 && (S.campaign.dna >= 20 || S.mateReadyMark) && !S.editing) {
        mateWait = 6; T.mark(null); T.goal('DNA ' + (S.campaign.dna | 0) + ' >= 20 -> calling a mate (C)'); T.tap('KeyC'); T.hold([]); return;
      }
      // ---- pickups (shards = DNA/progress, parts = new cell parts)
      const pk = nearest(S.pickups, P, (p) => !p.gone && !p.dead);
      if (pk && pk.d < 70) { T.goal(pk.f.kind === 'part' ? 'Spotted a cell part -> collecting it' : 'Spotted a DNA shard -> collecting it'); go(P, pk.f.x, pk.f.z, pk.f.kind); return; }
      // ---- carnivores/omnivores: hunt smaller cells; everyone: eat what the mouth allows
      let tgt = null, why = '';
      if (P.canPlant) { const n = nearest(food.plants, P); if (n) { tgt = n.f; why = 'plant'; tgt.d = n.d; } }
      if (P.canMeat) { const n = nearest(food.meats, P); if (n && (!tgt || n.d < tgt.d * 1.3)) { tgt = n.f; why = 'meat'; tgt.d = n.d; } }
      if (!tgt && (P.bite > 0 || P.zap > 0 || P.poison > 0)) {
        const prey = nearest(S.cells, P, (c) => !c.dead && c !== P && c.type !== 'mate' && c.rise < 0.3 && c.r < P.r * 0.8 && !(c.type === 'epic'));
        if (prey && prey.d < 60) {
          T.goal('Hungry for meat -> hunting a smaller ' + prey.f.type);
          const near = prey.d < P.r * 2.2 + prey.f.r;
          go(P, prey.f.x, prey.f.z, 'prey'); B._biteT = (B._biteT || 0) - dt; if (near && B._biteT <= 0) { B._biteT = 0.45; T.tap('Space'); }
          return;
        }
      }
      if (!tgt) { const n = nearest(food.planks, P); if (n) { tgt = n.f; why = 'plankton'; } }
      if (tgt) { T.goal((dietWant === 'carnivore' ? 'Carnivore' : dietWant === 'herbivore' ? 'Herbivore' : 'Omnivore') + ' -> heading to ' + why); go(P, tgt.x, tgt.z, why); return; }
      // ---- nothing around: wander the pool
      wander.t -= dt;
      if (wander.t <= 0 || dist(P, wander) < 6) { const r = T.rng(), a = r.range(0, 6.28), d = r.range(10, POOL_R * 0.7); wander.x = Math.cos(a) * d; wander.z = Math.sin(a) * d; wander.t = 8; }
      T.goal('Nothing edible nearby -> exploring the pool'); go(P, wander.x, wander.z, 'explore');
    }
  };
})();
