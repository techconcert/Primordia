// SP.eco -- the living world (DESIGN.md 3.5): species, nests, LOD simulation (near actors with AI / far statistical
// population model), flora grazing, predation, relations, bone piles, carcasses, alpha/epic/rogue individuals,
// migration of species with brain level, world events, serialisation.
(function () {
  'use strict';
  const SP = window.SP = window.SP || {};
  const V3 = THREE.Vector3;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const TIERS = ['tiny', 'small', 'medium', 'large', 'epic'];
  const RANK = { tiny: 0, small: 1, medium: 2, large: 3, epic: 4 };
  const UNLOCK = { tiny: 1, small: 1, medium: 2, large: 3, epic: 4 };
  const NEED = [1.2, 2.4, 4, 7, 12];            // fruit per minute per individual
  const GROW = [0.9, 0.7, 0.5, 0.35, 0.22];     // intrinsic growth per minute
  const KILLRATE = [0.15, 0.3, 0.5, 0.8, 1.2];  // kills per predator per minute
  const PREYFAC = [0.5, 0.8, 1.2, 2.0, 3.0];
  const MAXVIS = [6, 5, 4, 3, 2];
  const ROAM = [14, 20, 26, 30, 36];
  const SYL = ['ba', 'ko', 'mi', 'zu', 'ra', 'ti', 'no', 'fe', 'lu', 'sha', 'dro', 'pip', 'vex', 'gor', 'nim', 'quo', 'tal', 'bri'];
  const LIKES = ['sing', 'dance', 'charm', 'pose'];
  const SPAWN_R = 90, DESPAWN_R = 112, MAX_ACTORS = 40;

  // ---- world-size normalisation (ART.md Scale guide, Creature stage). Designs vary hugely (0.7..14 u long), so every spawned
  // creature is multiplied by a fit so its world size lands in the Primordia-like class ranges below (proportions kept).
  // dim = largest of height / 0.75*length (same measure as tribal.js). Player adult (brain 5, x1.57 growth) ~2.2 u.
  const SIZE_RANGE = { tiny: [0.45, 0.9], small: [0.9, 1.5], medium: [1.4, 2.2], large: [2.0, 3.2], largeHerb: [1.8, 2.6], epic: [4.8, 5.8] };
  const PLAYER_BASE = 1.4;
  const dimOf = (st) => Math.max(st.height || 0, (st.length || 0) * 0.75, 0.6);
  const fitFor = (st, target) => clamp(target / dimOf(st), 0.1, 1.5);
  function targetSize(sp) {
    const dim = dimOf(sp.stats);
    if (sp.isPlayer) return clamp(PLAYER_BASE * Math.pow(dim / 2.4, 0.25), 1.2, 1.65);
    const r = SIZE_RANGE[sp.sizeTier === 'large' && sp.diet === 'herbivore' ? 'largeHerb' : sp.sizeTier] || SIZE_RANGE.medium;
    return clamp(1.6 * Math.pow(dim / 2.4, 0.75), r[0], r[1]);
  }
  function speciesFit(sp) { if (sp.fit === undefined) { sp.target = targetSize(sp); sp.fit = fitFor(sp.stats, sp.target); } return sp.fit; }

  const _a = new V3(), _b = new V3(), _c = new V3(), _d = new V3();
  let _uid = 1;
  const uid = (p) => p + '_' + (_uid++);

  function defRng(seed) {
    if (SP.util && SP.util.rng) return SP.util.rng(seed);
    let a = seed >>> 0; const next = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    return { next, range: (x, y) => x + (y - x) * next(), int: (x, y) => x + Math.floor(next() * (y - x + 1)), pick: (arr) => arr[Math.floor(next() * arr.length)], chance: (p) => next() < p };
  }
  function toon(hex, o) { return SP.render && SP.render.toon ? SP.render.toon(hex, o || {}) : new THREE.MeshToonMaterial({ color: hex }); }

  // ================================================================== create
  function create(planet, rng, opts) {
    opts = opts || {};
    rng = rng || defRng(planet.seed || 1);
    const data = opts._data || null;
    const R = planet.radius;
    const eco = {
      planet, rng, opts, species: [], nests: [], actors: [], bonePiles: [], carcasses: [], time: 0, brainLevel: opts.brainLevel || 1,
      group: new THREE.Group(), player: null, packTarget: null, events: [], _handlers: {}, _far: 0, _farT: 0, _capT: 99, _manT: 0, _eventT: 0, _nestVisT: 0,
      _arrivals: [], _lastKillBy: {}, _migT: 0, focus: new V3(0, R, 0), timeOfDay: 0.5, night: false,
    };
    eco.group.name = 'eco';
    if (opts.scene) opts.scene.add(eco.group);
    const flora = planet.flora;
    const tools = SP.planet._tools;
    let nestTpl = null, nestGeo = null, nestOl = null;
    const arc = (da, db) => R * Math.acos(clamp(da.dot(db), -1, 1));
    eco.arc = arc;

    // ---------------------------------------------------------------- events (emitter)
    eco.on = (evt, fn) => { (eco._handlers[evt] = eco._handlers[evt] || []).push(fn); return eco; };
    const emit = eco.emit = (evt, payload) => { const h = eco._handlers[evt]; if (h) for (const f of h) { try { f(payload); } catch (e) { console.error(e); } } };

    // ---------------------------------------------------------------- player species + nest
    const playerDesign = opts.playerDesign || (SP.creature && SP.creature.defaultDesign && SP.creature.defaultDesign('creature'));
    function makePlayerSpecies(design) {
      const st = SP.creature.stats(design, { brainLevel: eco.brainLevel });
      return { id: 'player', name: design.name || 'Your species', design, stats: st, diet: st.diet === 'none' ? 'omnivore' : st.diet, sizeTier: 'medium', temperament: 'passive', nocturnal: false, likes: [], relation: 'allied', impressed: 0, needed: 0, killed: 0, alpha: { alive: false }, color: design.colors ? design.colors.base : 0x22c55e, arrived: true, prey: new Set(), habitat: [], herd: true, rank: 2, isPlayer: true, _pool: [] };
    }
    eco.playerSpecies = makePlayerSpecies(playerDesign);
    const speciesById = eco.speciesById = (id) => (id === 'player' ? eco.playerSpecies : eco.species.find((s) => s.id === id));

    // ---------------------------------------------------------------- species generation
    const PLAN = [['tiny', 'herbivore'], ['tiny', 'omnivore'], ['small', 'herbivore'], ['small', 'herbivore'], ['small', 'carnivore'], ['medium', 'herbivore'], ['medium', 'carnivore'], ['large', 'herbivore'], ['epic', 'carnivore'],
      ['small', 'omnivore'], ['medium', 'omnivore'], ['large', 'carnivore'], ['tiny', 'herbivore'], ['medium', 'herbivore']];
    function temperamentFor(tier, diet) {
      const r = rng.next();
      if (diet === 'carnivore') return tier === 'epic' ? 'aggressive' : r < 0.55 ? 'aggressive' : 'territorial';
      if (diet === 'omnivore') return r < 0.4 ? 'territorial' : r < 0.7 ? 'skittish' : 'passive';
      if (tier === 'tiny' || tier === 'small') return r < 0.6 ? 'skittish' : r < 0.9 ? 'passive' : 'territorial';
      return r < 0.5 ? 'passive' : 'territorial';
    }
    function computePrey() {
      for (const s of eco.species) {
        s.prey = new Set();
        if (s.diet === 'herbivore') continue;
        for (const t of eco.species) {
          if (t === s) continue;
          if (s.diet === 'carnivore') { if (t.rank <= s.rank && !(t.diet !== 'herbivore' && t.rank === s.rank)) s.prey.add(t.id); }
          else if (t.rank < s.rank && t.diet === 'herbivore' && t.rank <= 1) s.prey.add(t.id);
        }
      }
    }
    // A-02: scale generated NPC stats by size tier relative to the starter creature (speed 5.9, health ~107 at brain level 1)
    // so tiny/small species are peers or prey for a level-1 player, medium species are a real threat and large/epic ones are not.
    const TUNE = {
      tiny:   { spd: [0.62, 0.9], hp: [0.4, 0.6], dmg: 1 },
      small:  { spd: [0.75, 1.0], hp: [0.62, 0.9], dmg: 1 },
      medium: { spd: [0.95, 1.2], hp: [1.4, 2.1], dmg: 2.4 },
      large:  { spd: [0.95, 1.25], hp: [3.0, 4.6], dmg: 3.8 },
      epic:   { spd: [1.0, 1.4], hp: [6.0, 9.0], dmg: 5 }
    };
    let _ref = null;
    function refStats() {
      if (!_ref) { try { _ref = SP.creature.stats(SP.creature.defaultDesign('creature'), { brainLevel: 1 }); } catch (e) { _ref = { topSpeed: 5.9, health: 107 }; } }
      return _ref;
    }
    function tuneStats(stats, tier) {
      const t = TUNE[tier] || TUNE.medium, ref = refStats(), st = Object.assign({}, stats);
      const spd = clamp(stats.topSpeed, ref.topSpeed * t.spd[0], ref.topSpeed * t.spd[1]);
      const k = spd / Math.max(0.1, stats.topSpeed);
      st.topSpeed = spd; st.accel = stats.accel * Math.min(1.3, k);
      st.health = clamp(stats.health, ref.health * t.hp[0], ref.health * t.hp[1]);
      st.dmgLvl = t.dmg;
      return st;
    }
    function makeSpecies(plan, idx) {
      const [tier, diet0] = plan;
      const temperament = temperamentFor(tier, diet0);
      const design = SP.creature.generate(rng, { kind: 'creature', diet: diet0, sizeTier: tier, temperament, complexity: 0.3 + rng.next() * 0.5 });
      const stats = tuneStats(SP.creature.stats(design, { brainLevel: 1 }), tier);
      const diet = (stats.diet === 'herbivore' || stats.diet === 'carnivore' || stats.diet === 'omnivore') ? stats.diet : diet0;
      const hab = diet === 'herbivore' ? ['grass', 'forest', 'forest', 'grass', 'swamp', 'beach'] : ['grass', 'forest', 'desert', 'tundra', 'swamp', 'forest', 'grass'];
      const h1 = rng.pick(hab); let h2 = rng.pick(hab); if (h2 === h1) h2 = 'grass';
      const likes = []; const pool = LIKES.slice(); while (likes.length < 2) likes.push(pool.splice(Math.floor(rng.next() * pool.length), 1)[0]);
      const nm = design.name || (rng.pick(SYL) + rng.pick(SYL) + rng.pick(SYL));
      return { id: 's' + idx, name: nm, design, stats, diet, sizeTier: tier, temperament, nocturnal: diet === 'carnivore' ? rng.chance(0.4) : rng.chance(0.18), likes, relation: 'neutral', impressed: 0,
        needed: (tier === 'tiny' || tier === 'small') ? 3 : 4, killed: 0, alpha: { alive: true }, color: design.colors ? design.colors.base : 0xffffff, arrived: false, prey: new Set(), habitat: [h1, h2],
        herd: (tier === 'tiny' || tier === 'small' || tier === 'medium') && diet !== 'carnivore' && rng.chance(0.7), rank: RANK[tier], _pool: [] };
    }

    // ---------------------------------------------------------------- nests
    function nestScale(sp) { speciesFit(sp); return clamp(0.45 * sp.target, 0.35, 3.2); } // bowl ~3 u wide per unit scale: ~2-3x creature width, eggs ~half creature height
    function addNest(sp, dir, pop, isPlayer) {
      const d = dir.clone().normalize();
      const pos = planet.surfacePoint(d);
      const n = { id: uid('nest'), speciesId: sp.id, dir: d, pos, population: pop, capacity: Math.max(pop, 4), growth: 0, isPlayer: !!isPlayer, food: 0, sat: 0.8, eatAcc: 0, nodes: [], zeroT: 0, mesh: null };
      eco.nests.push(n); buildNestMesh(n, sp);
      return n;
    }
    function placeNestDir(sp, minFromPlayer, maxFromPlayer, avoid) {
      const home = eco.homeNest ? eco.homeNest.dir : null;
      let best = null;
      for (let tries = 0; tries < 60; tries++) {
        const d = planet.randomLandDir(rng, (dd, b, r) => {
          if (r > R + planet.amplitude * 0.9) return false;
          if (planet.slopeAt(dd) > 0.4) return false;
          return tries > 30 || sp.habitat.indexOf(b) >= 0 || b === 'grass' || b === 'forest' ;
        });
        if (home) { const dh = arc(d, home); if (dh < minFromPlayer || dh > maxFromPlayer) continue; }
        let ok = true; for (const n of eco.nests) if (arc(d, n.dir) < (avoid || 26)) { ok = false; break; }
        if (ok) { best = d; break; }
        if (!best) best = d;
      }
      return best || planet.randomLandDir(rng);
    }
    function placeCloseDir(sp) {
      const home = eco.homeNest;
      for (let t = 0; t < 14; t++) {
        const p = landNear(home.pos, 24 + t * 0.5, 46, null); if (!p) continue;
        const d = p.clone().normalize(); let ok = true;
        for (const n of eco.nests) if (arc(d, n.dir) < 18) { ok = false; break; }
        if (ok) return d;
      }
      return placeNestDir(sp, 28, 105);
    }
    function settleSpecies(sp, near, close) {
      const k = 1 + (rng.next() < 0.55 ? 1 : 0) + (rng.next() < 0.2 ? 1 : 0);
      sp.arrived = true;
      for (let i = 0; i < k; i++) {
        // A-07: `close` species (a tiny and a small herbivore) always get a first nest 24-46 units from home: early company and prey
        const d = close && i === 0 ? placeCloseDir(sp) : near ? (i === 0 ? placeNestDir(sp, 28, 105) : placeNestDir(sp, 28, 300)) : placeNestDir(sp, 85, 400);
        addNest(sp, d, 3 + Math.floor(rng.next() * 3), false);
      }
    }

    // ---------------------------------------------------------------- build world (or restore)
    const homeDir = opts.playerNestDir ? opts.playerNestDir.clone().normalize() : planet.randomLandDir(rng, (d, b) => b === 'grass' || b === 'forest');
    if (!data) {
      const cnt = opts.speciesCount || 9;
      for (let i = 0; i < cnt; i++) eco.species.push(makeSpecies(PLAN[i % PLAN.length], i));
      computePrey();
      eco.homeNest = addNest(eco.playerSpecies, homeDir, 6, true);
      eco.homeNest.capacity = 12;
      for (const sp of eco.species) if (UNLOCK[sp.sizeTier] <= eco.brainLevel) settleSpecies(sp, true, (sp.sizeTier === 'tiny' || sp.sizeTier === 'small') && sp.diet === 'herbivore' && !eco.species.some((o) => o !== sp && o.sizeTier === sp.sizeTier && o.diet === 'herbivore' && o.arrived));
    } else {
      for (const sd of data.species) {
        const design = sd.design; const stats = tuneStats(SP.creature.stats(design, { brainLevel: 1 }), sd.sizeTier);
        const sp = Object.assign({}, sd, { design, stats, prey: new Set(), _pool: [], alpha: { alive: sd.alphaAlive !== false } });
        eco.species.push(sp);
      }
      computePrey();
      for (const nd of data.nests) {
        const sp = speciesById(nd.speciesId); const n = addNest(sp, new V3(nd.dir[0], nd.dir[1], nd.dir[2]), nd.population, nd.isPlayer);
        n.capacity = nd.capacity; n.growth = nd.growth || 0; n.id = nd.id; if (nd.isPlayer) eco.homeNest = n;
      }
      if (!eco.homeNest) eco.homeNest = addNest(eco.playerSpecies, homeDir, 6, true);
      eco.time = data.time || 0; eco.brainLevel = data.brainLevel || eco.brainLevel;
    }
    Object.defineProperty(eco, 'playerNest', { get() { return eco.homeNest; } });

    // ---------------------------------------------------------------- nest visuals
    function buildNestMesh(n, sp) {
      if (!tools) return;
      if (!nestTpl) {
        const g = tools.prims(), parts = [{ g: g.cyl8, c: 0xca8a04, p: [0, 0.12, 0], s: [1.25, 0.24, 1.25] }];
        for (let layer = 0; layer < 2; layer++) for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2 + layer * 0.26, r = 1.5 + layer * 0.08 + (i % 3) * 0.05;
          parts.push({ g: g.cyl5, c: (i + layer) % 3 === 0 ? 0x78350f : 0x92400e, p: [Math.cos(a) * r, 0.2 + layer * 0.2, Math.sin(a) * r], s: [0.12, 1.15, 0.12], r: [0, -a - Math.PI / 2, Math.PI / 2], ol: layer === 0 });
        }
        nestTpl = tools.buildTemplate(parts, 0.07);
        nestGeo = tools.templGeometry(nestTpl); nestOl = tools.templGeometry(nestTpl, true);
      }
      const m = new THREE.Mesh(nestGeo, toon(0xffffff, { vertexColors: true }));
      const o = new THREE.Mesh(nestOl, tools.inkMat()); m.add(o);
      m.receiveShadow = true;
      const s = nestScale(sp); m.scale.setScalar(s);
      SP.surf.orient(m, n.pos, new V3(1, 0, 0).addScaledVector(n.dir, -n.dir.x));
      m.scale.setScalar(s); n.mesh = m; eco.group.add(m);
      if (n.isPlayer) { // flag pole so the home nest is easy to spot
        const pole = SP.render.cel(new THREE.CylinderGeometry(0.07, 0.09, 4.6, 6), 0x78350f, { outline: 0.1 }); const kp = 0.8 / s; pole.scale.setScalar(kp); pole.position.y = 2.3 * kp; m.add(pole); // pole stays ~3.7 u tall whatever the nest size
        const flag = SP.render.cel(new THREE.ConeGeometry(0.7, 1.4, 3), eco.playerSpecies.color, { outline: 0.1 }); flag.rotation.z = -Math.PI / 2; flag.scale.setScalar(kp); flag.position.set(0.7 * kp, 4.0 * kp, 0); m.add(flag);
        n.pole = pole; n.flag = flag;       // so the stage can fade them when they stand between camera and player (A-05)
      }
    }
    // eggs: one instanced mesh for every nest
    const EGG_CAP = 600;
    const eggGeo = new THREE.SphereGeometry(0.3, 7, 5);
    const eggMesh = new THREE.InstancedMesh(eggGeo, toon(0xffffff), EGG_CAP); eggMesh.count = 0; eggMesh.frustumCulled = false;
    eggMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(EGG_CAP * 3), 3);
    const eggOl = new THREE.InstancedMesh(new THREE.SphereGeometry(0.3 * 1.18, 7, 5), tools ? tools.inkMat() : toon(0x080c14), EGG_CAP); eggOl.instanceMatrix = eggMesh.instanceMatrix; eggOl.count = 0; eggOl.frustumCulled = false;
    eco.group.add(eggMesh, eggOl);
    function updateEggs() {
      const mm = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new V3(), p = new V3(), c = new THREE.Color(); let k = 0;
      for (const n of eco.nests) {
        if (k >= EGG_CAP - 8) break;
        const sp = speciesById(n.speciesId); if (!sp || sp.relation === 'extinct') continue;
        const cnt = Math.min(7, Math.round(n.population / (n.isPlayer ? 1.6 : 1.1)));
        const sc = nestScale(sp), up = n.dir, e = new V3().crossVectors(Math.abs(up.y) < 0.9 ? new V3(0, 1, 0) : new V3(1, 0, 0), up).normalize(), nn = new V3().crossVectors(up, e);
        c.setHex(sp.color).lerp(new THREE.Color(0xffffff), 0.35);
        for (let i = 0; i < cnt; i++) {
          const a = i * 2.4 + n.pos.x, r = (0.2 + (i % 3) * 0.3) * sc;
          p.copy(n.pos).addScaledVector(e, Math.cos(a) * r).addScaledVector(nn, Math.sin(a) * r).addScaledVector(up, 0.38 * sc);
          q.setFromUnitVectors(new V3(0, 1, 0), up); const sk = sc * 0.9; s.set(sk, sk * 1.25, sk);
          mm.compose(p, q, s); eggMesh.setMatrixAt(k, mm); eggMesh.setColorAt(k, c); k++;
        }
      }
      eggMesh.count = k; eggOl.count = k; eggMesh.instanceMatrix.needsUpdate = true; eggMesh.instanceColor.needsUpdate = true;
    }

    // ---------------------------------------------------------------- bone piles
    function makeBonePiles() {
      const home = eco.homeNest.dir; const parts = (SP.parts && SP.parts.list ? SP.parts.list : []).filter((p) => p.kind === 'creature' && !p.unlockedByDefault);
      const byTier = {}; parts.forEach((p) => { (byTier[p.tier] = byTier[p.tier] || []).push(p); });
      const pickPart = (d01, used) => {
        const w = [1.2 - d01, 0.9, 0.2 + d01, d01 * d01 * 1.3 + 0.02]; let tot = w.reduce((a, b) => a + b, 0), r = rng.next() * tot, t = 0;
        for (let i = 0; i < 4; i++) { r -= w[i]; if (r <= 0) { t = i; break; } }
        for (let k = 0; k < 4; k++) { const arr = byTier[((t + k) % 4) + 1]; if (arr && arr.length) { const cand = arr.filter((p) => used.indexOf(p.id) < 0); if (cand.length) return cand[Math.floor(rng.next() * cand.length)].id; } }
        return parts.length ? parts[Math.floor(rng.next() * parts.length)].id : 'part_' + Math.floor(rng.next() * 99);
      };
      const used = [];
      for (let i = 0; i < 20; i++) {
        let best = null, bs = -1;
        for (let c = 0; c < 12; c++) {
          const d = planet.randomLandDir(rng, (dd, b, r) => planet.slopeAt(dd) < 0.45);
          if (arc(d, home) < 22) continue; let ok = true; for (const bp of eco.bonePiles) if (arc(d, bp.dir) < 18) { ok = false; break; }
          if (!ok) continue;
          const sc = arc(d, home) / (Math.PI * R) + (planet.surfaceRadius(d) - R) / planet.amplitude * 0.5 + rng.next() * 0.4;
          if (sc > bs) { bs = sc; best = d; }
        }
        if (!best) continue;
        const d01 = clamp(arc(best, home) / (Math.PI * R), 0, 1);
        const ids = [pickPart(d01, used)]; used.push(ids[0]); if (rng.next() < 0.3) { const x = pickPart(d01, used); if (ids.indexOf(x) < 0) { ids.push(x); used.push(x); } }
        eco.bonePiles.push({ id: uid('bone'), dir: best, pos: planet.surfacePoint(best), parts: ids, found: false });
      }
      // guards: 4 of the farthest piles, guarded by the biggest species available
      const guards = eco.species.slice().sort((a, b) => b.rank - a.rank || (b.diet === 'carnivore') - (a.diet === 'carnivore'));
      if (guards.length) {
        const far = eco.bonePiles.slice().sort((a, b) => arc(b.dir, home) - arc(a.dir, home)).slice(0, 4);
        far.forEach((bp, i) => { bp.guardSpecies = guards[i % Math.min(2, guards.length)].id; bp.guardAlive = true; bp.guardedBy = null; });
      }
    }
    if (!data) makeBonePiles(); else {
      for (const bd of data.bonePiles) { const d = new V3(bd.dir[0], bd.dir[1], bd.dir[2]); eco.bonePiles.push({ id: bd.id, dir: d, pos: planet.surfacePoint(d), parts: bd.parts, found: bd.found, guardSpecies: bd.guardSpecies, guardAlive: bd.guardAlive, guardedBy: null }); }
    }
    let boneTpl = null;
    function buildBoneMeshes() {
      if (!tools) return;
      const g = tools.prims(), cream = 0xfffbeb;
      const parts = [
        { g: new THREE.TorusGeometry(0.9, 0.09, 5, 9, Math.PI), c: cream, p: [0, 0, -0.5], r: [0, 0, 0] },
        { g: new THREE.TorusGeometry(0.75, 0.09, 5, 9, Math.PI), c: cream, p: [0, 0, 0], r: [0, 0, 0] },
        { g: new THREE.TorusGeometry(0.6, 0.09, 5, 9, Math.PI), c: cream, p: [0, 0, 0.5], r: [0, 0, 0] },
        { g: g.cyl5, c: cream, p: [0, 0.05, 0], s: [0.1, 0.1, 1.5], r: [Math.PI / 2, 0, 0], ol: false },
        { g: g.sph, c: cream, p: [1.4, 0.45, 0.4], s: [0.55, 0.5, 0.6] },
        { g: g.box, c: cream, p: [1.6, 0.2, 0.4], s: [0.35, 0.2, 0.45] },
        { g: g.sphS, c: 0x1e293b, p: [1.58, 0.55, 0.72], s: [0.14, 0.14, 0.14], ol: false },
        { g: g.sphS, c: 0x1e293b, p: [1.58, 0.55, 0.1], s: [0.14, 0.14, 0.14], ol: false },
        { g: g.cyl6, c: cream, p: [-1.3, 0.12, -0.6], s: [0.12, 1.4, 0.12], r: [0.1, 0.4, Math.PI / 2] },
        { g: g.sph, c: cream, p: [-0.65, 0.12, -0.78], s: [0.2, 0.2, 0.2] },
        { g: g.sph, c: cream, p: [-1.95, 0.12, -0.4], s: [0.2, 0.2, 0.2] },
      ];
      boneTpl = tools.buildTemplate(parts, 0.1);
      const mg = tools.templGeometry(boneTpl), og = tools.templGeometry(boneTpl, true);
      const sparkG = new THREE.OctahedronGeometry(0.35, 0);
      for (const bp of eco.bonePiles) {
        const m = new THREE.Mesh(mg, toon(0xffffff, { vertexColors: true })); m.add(new THREE.Mesh(og, tools.inkMat()));
        SP.surf.orient(m, bp.pos, new V3(rng.next() - 0.5, rng.next() - 0.5, rng.next() - 0.5)); m.scale.setScalar(1.7); m.castShadow = true;
        const sp = new THREE.Mesh(sparkG, toon(0xfde047, { emissive: 0xfacc15, emissiveIntensity: 0.9 })); sp.position.set(0, 3.2, 0); sp.scale.set(1, 1.4, 1); m.add(sp);
        bp.mesh = m; bp.spark = sp; eco.group.add(m);
      }
    }
    buildBoneMeshes();

    // ---------------------------------------------------------------- blob shadows (one instanced mesh)
    const SH_CAP = 90;
    const shMesh = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 12), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), SH_CAP);
    shMesh.frustumCulled = false; shMesh.count = 0; shMesh.renderOrder = 1; eco.group.add(shMesh);
    function updateShadows() {
      const mm = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new V3(), p = new V3(); let k = 0;
      const X = new V3(1, 0, 0), Z = new V3(0, 0, 1), basis = new THREE.Matrix4();
      for (const a of eco.actors) {
        if (a.state === 'dead' || k >= SH_CAP) continue;
        const b = a.body, up = b.up; p.copy(up).multiplyScalar(Math.max(planet.surfaceRadius(up), b.inWater ? planet.seaRadius : 0) + 0.07);
        const fw = b.heading, x = _a.crossVectors(up, fw).normalize();
        // circle faces +Z: map local Z->up
        basis.makeBasis(x, fw, up); q.setFromRotationMatrix(basis);
        const r = b.radius * 1.25 * (a.rig ? 1 : 1) * clamp(1 - (b.pos.length() - b.groundR) * 0.15, 0.4, 1); s.set(r, r, 1);
        mm.compose(p, q, s); shMesh.setMatrixAt(k++, mm);
      }
      shMesh.count = k; shMesh.instanceMatrix.needsUpdate = true;
    }

    // ================================================================== actors
    function maxVis(sp) { return sp.isPlayer ? 5 : MAXVIS[sp.rank]; }
    function buildRig(sp) {
      if (sp._pool.length) return sp._pool.pop();
      return SP.creature.build(sp.design, { outline: true, shadows: false, lod: 'low' });
    }
    function landNear(center, rmin, rmax, avoidPos) {
      for (let i = 0; i < 10; i++) {
        const ang = rng.next() * Math.PI * 2, dist = rmin + rng.next() * (rmax - rmin);
        const up = _a.copy(center).normalize(), ref = Math.abs(up.y) < 0.95 ? _b.set(0, 1, 0) : _b.set(1, 0, 0);
        const e = new V3().crossVectors(ref, up).normalize(), n = new V3().crossVectors(up, e);
        const dir = e.multiplyScalar(Math.cos(ang)).addScaledVector(n, Math.sin(ang));
        const d = SP.surf.move(center.clone().normalize().multiplyScalar(R), dir, dist, null).normalize();
        const r = planet.surfaceRadius(d);
        if (r < planet.seaRadius + 0.5 || planet.slopeAt(d) > 0.5) continue;
        const p = d.multiplyScalar(r);
        if (avoidPos && p.distanceTo(avoidPos) < 14 && i < 8) continue;
        return p;
      }
      return null;
    }
    function makeMarker(kind, size) {
      const g = new THREE.Group();
      if (kind === 'alpha') {
        const ring = SP.render.cel(new THREE.TorusGeometry(0.45, 0.1, 6, 10), 0xfacc15, { outline: 0.12 }); ring.rotation.x = Math.PI / 2; g.add(ring);
        for (let i = 0; i < 5; i++) { const sp = SP.render.cel(new THREE.ConeGeometry(0.14, 0.45, 4), 0xfde047, { outline: 0.14 }); const a = i / 5 * Math.PI * 2; sp.position.set(Math.cos(a) * 0.45, 0.25, Math.sin(a) * 0.45); g.add(sp); }
      } else if (kind === 'rogue') {
        const c = SP.render.cel(new THREE.ConeGeometry(0.3, 0.8, 4), 0xef4444, { outline: 0.12, material: toon(0xef4444, { emissive: 0xef4444, emissiveIntensity: 0.7 }) }); c.rotation.x = Math.PI; g.add(c);
      }
      g.scale.setScalar(Math.max(0.8, size * 0.55)); return g;
    }
    function spawnActor(sp, nest, pos, o) {
      o = o || {};
      if (!pos || eco.actors.length >= MAX_ACTORS) return null;
      const rig = buildRig(sp);
      const fit = speciesFit(sp), gs = o.scale || (0.92 + rng.next() * 0.16) * (o.alpha ? (sp.sizeTier === 'epic' ? 1.1 : 1.3) : 1), sc = gs * fit; // gs = gameplay scale (hp/mass/meat), sc = world scale
      rig.setScale && rig.setScale(sc);
      const heading = new V3(rng.next() - 0.5, rng.next() - 0.5, rng.next() - 0.5);
      const stats = sp.stats;
      const body = SP.physics.createBody({ pos: pos.clone(), heading, radius: stats.radius * sc, mass: stats.mass * gs * gs * gs, stats, scale: sc });
      const hpMax = stats.health * gs * (o.alpha ? (sp.rank <= 1 ? 1.3 : 2.2) : 1) * (o.guard ? 1.4 : 1);
      const a = {
        id: uid('a'), species: sp, rig, body, hp: hpMax, maxHp: hpMax, state: 'idle', target: null, nest: nest || null, isAlpha: !!o.alpha, isEpic: sp.sizeTier === 'epic' || !!o.guard, isRogue: !!o.rogue, interest: 0, anim: { speed: 0, turn: 0, action: null, actionT: 0, airborne: false, inWater: false }, packOf: null,
        scale: sc, gs: gs, hunger: 0.35 + rng.next() * 0.55, thinkT: rng.next() * 0.3, dest: null, node: null, stateT: 0, atkCd: 0, aggro: 0, flash: 0, eatT: 0, dyingT: 0, guard: o.guard || null, migrate: o.migrate || null, raid: o.raid || null, socialT: 0, ctrl: { move: null, sprint: false, sneak: false, jump: false }, impressed: false, marker: null, threat: null, fleeT: 0, actionDur: 0,
      };
      if (o.alpha) { a.marker = makeMarker('alpha', rig.stats ? rig.stats.height || 2 : 2); }
      else if (o.rogue) { a.marker = makeMarker('rogue', rig.stats ? rig.stats.height || 2 : 2); }
      if (a.marker) { const h = ((rig.stats && rig.stats.height) || 2); a.marker.position.set(0, h * 1.05 + 0.8, 0); rig.root.add(a.marker); }
      a.state = o.state || 'idle';
      SP.physics.place(body, planet, pos);
      SP.surf.orient(rig.root, body.pos, body.heading);
      eco.group.add(rig.root);
      eco.actors.push(a);
      return a;
    }
    function releaseRig(a, keep) {
      const rig = a.rig; if (!rig) return;
      eco.group.remove(rig.root);
      if (a.marker) { rig.root.remove(a.marker); a.marker = null; }
      if (keep) return;
      if (rig.setTint) rig.setTint(null);
      const sp = a.species;
      if (sp._pool.length < 6 && a.state !== 'dead') { rig.setScale && rig.setScale(1); sp._pool.push(rig); } else if (rig.dispose) rig.dispose();
      a.rig = null;
    }
    function despawn(a) {
      const i = eco.actors.indexOf(a); if (i < 0) return;
      eco.actors.splice(i, 1);
      if (a.guard && !a._guardDead) { const bp = eco.bonePiles.find((b) => b.id === a.guard); if (bp) bp.guardedBy = null; }
      if (a.isAlpha && a.species.alpha.alive) a.species.alpha.actor = null;
      releaseRig(a);
    }
    eco.despawn = despawn;
    eco.spawnNear = function (speciesId, pos, n) {
      const sp = speciesById(speciesId); if (!sp) return [];
      const out = [];
      for (let i = 0; i < (n || 1); i++) {
        // at the actor cap, make room by retiring the farthest non-pack actor (summoned flocks / re-hatched nest-mates must appear)
        if (eco.actors.length >= MAX_ACTORS) {
          let far = null, fd = -1; for (const o of eco.actors) { if (o.packOf || o.state === 'dead') continue; const d = o.body.pos.distanceToSquared(eco.focus); if (d > fd) { fd = d; far = o; } }
          if (far) despawn(far);
        }
        const p = landNear(pos, 3, 9) || pos.clone(); const nest = eco.nests.find((x) => x.speciesId === speciesId) || null; const a = spawnActor(sp, nest, p, {}); if (a) out.push(a); }
      return out;
    };

    // ---------------------------------------------------------------- bookkeeping: damage / kill / impress
    const isPlayerSource = (s) => s === 'player' || s === 'pack';
    function checkExtinct(sp) {
      if (sp.isPlayer || sp.relation === 'extinct' || !sp.arrived) return;
      const alive = eco.nests.some((n) => n.speciesId === sp.id && n.population >= 0.5);
      if (alive) return;
      sp.relation = 'extinct';
      const byPlayer = sp.killed > 0 && eco._lastKillBy[sp.id] === 'player';
      for (const a of eco.actors.slice()) if (a.species === sp && a.state !== 'dead') despawn(a);
      emit('extinct', { species: sp, byPlayer });
      emit('event', { type: 'extinction', species: sp, byPlayer });
    }
    eco.damage = function (a, amount, source, dirVec) {
      if (!a || a.state === 'dead') return 0;
      a.hp -= amount; a.flash = 0.16; if (a.rig && a.rig.setTint) a.rig.setTint(0xff5555);
      if (a.state === 'sleep') { a.state = 'idle'; a.stateT = 0; }
      a.anim.action = 'hurt'; a.anim.actionT = 0; a.actionDur = 0.35;
      if (isPlayerSource(source) || (source && source.body)) { a.aggro = 20; a.lastAttacker = source; a.threat = source && source.body ? source : null; }
      if (dirVec) SP.physics.impulse(a.body, dirVec);
      if (isPlayerSource(source)) {
        if (a.species.relation === 'neutral' || a.species.relation === 'allied') {
          if (a.species.relation === 'allied') { a.species.relation = 'neutral'; a.species.impressed = 0; }
        }
      }
      if (a.hp <= 0) eco.kill(a, source);
      return a.hp;
    };
    eco.kill = function (a, source) {
      if (!a || a.state === 'dead') return;
      const sp = a.species;
      a.hp = 0; a.state = 'dead'; a.anim.action = 'die'; a.anim.actionT = 0; a.dyingT = 0; a.ctrl.move = null;
      if (a.nest) a.nest.population = Math.max(0, a.nest.population - 1);
      if (a.isAlpha) { sp.alpha.alive = false; sp.alpha.actor = null; }
      if (a.guard) { a._guardDead = true; const bp = eco.bonePiles.find((b) => b.id === a.guard); if (bp) { bp.guardAlive = false; bp.guardedBy = null; } }
      if (a.raid) a.raid.dead++;
      const byPlayer = isPlayerSource(source);
      if (byPlayer && !sp.isPlayer) {
        sp.killed++; eco._lastKillBy[sp.id] = 'player'; sp._hostT = eco.time;
        if (sp.relation === 'allied') { sp.relation = 'hostile'; sp.impressed = 0; } else if (sp.relation === 'neutral') sp.relation = 'hostile';
      }
      // carcass keeps the rig
      const meat = Math.max(2, Math.round(sp.stats.mass * a.gs * a.gs * a.gs * 0.8 + 2));
      eco.carcasses.push({ id: uid('c'), pos: a.body.pos.clone(), meat, maxMeat: meat, t: 0, speciesId: sp.id, rig: a.rig, actor: a });
      if (a.marker && a.rig) { a.rig.root.remove(a.marker); a.marker = null; }
      emit('killed', { actor: a, species: sp, source, isAlpha: a.isAlpha, isEpic: a.isEpic, byPlayer, nest: a.nest, guard: a.guard });
      if (a.nest) checkExtinct(sp);
    };
    eco.impress = function (a, amount) {
      if (!a || a.state === 'dead') return 0;
      const sp = a.species;
      a.interest = clamp(a.interest + amount, 0, 100);
      if (amount < 0 && a.interest <= 0 && (sp.temperament === 'aggressive' || sp.temperament === 'territorial') && !a.isAlpha) { a.aggro = Math.max(a.aggro, 12); }
      if (a.interest >= 100 && !a.impressed) {
        a.impressed = true; a.state = 'idle'; a.stateT = 0;
        if (!sp.isPlayer && sp.relation !== 'allied' && sp.relation !== 'extinct') {
          sp.impressed++;
          emit('impressed', { actor: a, species: sp, count: sp.impressed, needed: sp.needed, isAlpha: a.isAlpha });
          if (sp.impressed >= sp.needed) { sp.relation = 'allied'; emit('allied', { species: sp }); }
        }
      }
      return a.interest;
    };
    eco.engage = function (a, on) { if (!a || a.state === 'dead') return; if (on === false) { if (a.state === 'social') { a.state = 'idle'; a.stateT = 0; } } else { a.state = 'social'; a.socialT = 6; a.stateT = 0; } };
    eco.recruit = function (a) { if (!a || a.state === 'dead') return false; if (!(a.species.isPlayer || a.species.relation === 'allied')) return false; a.packOf = 'player'; a.state = 'follow'; return true; };
    eco.dismiss = function (a) { if (a) { a.packOf = null; a.state = 'idle'; } };
    eco.setPackTarget = function (a) { eco.packTarget = a || null; };
    eco.takeMeat = function (c, n) { const t = Math.min(n === undefined ? 1 : n, c.meat); c.meat -= t; return t; };
    eco.setBrainLevel = function (n) {
      eco.brainLevel = n; eco.playerSpecies = Object.assign(eco.playerSpecies, { stats: SP.creature.stats(eco.playerSpecies.design, { brainLevel: n }) });
      for (const sp of eco.species) if (!sp.arrived && sp.relation !== 'extinct' && UNLOCK[sp.sizeTier] <= n && !eco._arrivals.some((x) => x.sp === sp)) eco._arrivals.push({ sp, t: 12 + rng.next() * 20 });
    };
    eco.setPlayerDesign = function (design) {
      const sp = eco.playerSpecies; sp.design = design; sp.stats = SP.creature.stats(design, { brainLevel: eco.brainLevel }); sp.color = design.colors ? design.colors.base : sp.color; sp.name = design.name || sp.name;
      for (const a of eco.actors.slice()) if (a.species === sp) despawn(a);
      sp._pool.length = 0;
    };

    // ================================================================== AI
    const sleepsNow = (sp) => (eco.night ? !sp.nocturnal : sp.nocturnal);
    function canFight(sp) { const ab = sp.stats.abilities || {}; return (ab.bite || 0) + (ab.charge || 0) + (ab.strike || 0) + (ab.spit || 0) > 0 || sp.diet === 'carnivore'; }
    function playerPos() { return eco.player ? eco.player.pos : eco.focus; }
    function stance(a, d) {
      const sp = a.species, P = eco.player;
      if (sp.isPlayer) return null;
      const sneak = P && P.sneaking, fight = canFight(sp), tierSmall = sp.rank <= 1;
      if (a.isRogue) return d < 24 ? 'attack' : null;
      if (a.guard) { const bp = eco.bonePiles.find((b) => b.id === a.guard); if (bp && a.body.pos.distanceTo(bp.pos) < 40 && d < 26) return 'attack'; return null; }
      if (sp.relation === 'allied' && a.aggro <= 0) return null;
      if (a.aggro > 0) {
        // A-03: aggressive / territorial fighters (and bold mid-size species) keep fighting and only flee once badly hurt
        const brave = fight && (sp.temperament === 'aggressive' || sp.temperament === 'territorial' || (sp.rank >= 2 && sp.temperament !== 'skittish'));
        if (brave) return a.hp < a.maxHp * 0.22 && !a.isAlpha && !a.isEpic ? 'flee' : 'attack';
      }
      if (a.aggro > 0) return (sp.temperament === 'skittish' || sp.temperament === 'passive' || tierSmall) && !(sp.rank >= 2 && fight && sp.temperament !== 'skittish') ? 'flee' : (fight ? 'attack' : 'flee');
      if (sp.relation === 'hostile') { if (fight && !tierSmall) return d < 22 ? 'attack' : null; return d < 18 ? 'flee' : null; }
      switch (sp.temperament) {
        case 'skittish': return d < (sneak ? 7 : 14) ? 'flee' : null;
        case 'passive': return null;
        case 'territorial': {
          const nd = a.nest ? a.nest.pos.distanceTo(playerPos()) : 999;
          if (fight && (nd < 14 || d < 5)) return 'attack'; if (!fight && d < 6) return 'flee'; return null;
        }
        case 'aggressive': return fight && d < (sneak ? 9 : 20) && (a.state !== 'sleep' || d < 6) ? 'attack' : (!fight && d < 10 ? 'flee' : null);
      }
      return null;
    }
    function nearestThreat(a) {
      let best = null, bd = (a.species.temperament === 'skittish' ? 24 : 16), me = a.body.pos;
      for (const o of eco.actors) {
        if (o === a || o.state === 'dead' || o.state === 'sleep') continue;
        if (!o.species.prey.has(a.species.id)) continue;
        const d = o.body.pos.distanceTo(me); if (d < bd) { bd = d; best = o; }
      }
      return best;
    }
    function nearestPrey(a, range) {
      let best = null, bd = range, me = a.body.pos;
      for (const o of eco.actors) {
        if (o === a || o.state === 'dead' || o.species.isPlayer) continue;
        if (!a.species.prey.has(o.species.id)) continue;
        if (a.nest && o.nest === a.nest) continue;
        const d = o.body.pos.distanceTo(me); if (d < bd) { bd = d; best = o; }
      }
      return best;
    }
    function nearestCarcass(a, range) {
      let best = null, bd = range;
      for (const c of eco.carcasses) { if (c.meat <= 0 || c.t > 50) continue; const d = c.pos.distanceTo(a.body.pos); if (d < bd) { bd = d; best = c; } }
      return best;
    }
    function pickWander(a) {
      const sp = a.species, home = a.nest ? a.nest.pos : (a.migrate ? null : a.body.pos);
      if (a.migrate) return a.migrate.dest.clone();
      let center = home;
      if (sp.herd && !sp.isPlayer) {
        // herd cohesion
        let cx = 0, cy = 0, cz = 0, n = 0;
        for (const o of eco.actors) { if (o !== a && o.species === sp && o.state !== 'dead' && o.body.pos.distanceTo(a.body.pos) < 28) { cx += o.body.pos.x; cy += o.body.pos.y; cz += o.body.pos.z; n++; } }
        if (n > 0 && rng.next() < 0.65) center = new V3(cx / n, cy / n, cz / n);
      }
      const roam = ROAM[sp.rank] * (a.nest ? 1 : 0.6);
      return landNear(center || a.body.pos, 3, Math.min(roam, 22), null);
    }
    function setState(a, s) { if (a.state !== s) { a.state = s; a.stateT = 0; if (s !== 'flee') a._fleeFrom = null; } }
    function think(a) {
      const sp = a.species, me = a.body.pos, P = playerPos(), dP = me.distanceTo(P);
      if (a.state === 'dead') return;
      if (a.packOf) { if (a.state !== 'attack') setState(a, 'follow'); }
      // threats from other actors
      if (a.state !== 'follow' && !a.isEpic && !a.guard && !a.raid) {
        const th = nearestThreat(a);
        if (th) { a.threat = th; a.fleeT = 5; if (a.state !== 'flee') { setState(a, 'flee'); } return; }
      }
      // player stance
      const st = a.state !== 'social' ? stance(a, dP) : null;
      if (st === 'attack' && !a.packOf) { a.target = eco.player || 'player'; setState(a, 'attack'); return; }
      if (st === 'flee' && !a.packOf) { a.threat = 'player'; a.fleeT = 4; setState(a, 'flee'); return; }
      if (a.state === 'attack' && a.target === (eco.player || 'player')) { if (dP > 36 || (a.nest && a.nest.pos.distanceTo(me) > 60)) { a.target = null; setState(a, 'idle'); } else return; }
      if (a.state === 'flee') { if (a.fleeT <= 0) { a.threat = null; setState(a, 'idle'); } return; }
      if (a.state === 'social') { if (a.socialT <= 0 || dP > 16) setState(a, 'idle'); return; }
      if (a.state === 'follow') {
        if (eco.packTarget && eco.packTarget.state !== 'dead' && eco.packTarget.body.pos.distanceTo(P) < 25 && canFight(sp)) { a.target = eco.packTarget; setState(a, 'attack'); a._packAtk = true; }
        return;
      }
      if (a.state === 'attack') {
        if (!a.target || a.target === 'player' || (a.target.state === 'dead') || (a.target.body && a.target.body.pos.distanceTo(me) > 40)) { a.target = null; a._packAtk = false; setState(a, a.packOf ? 'follow' : 'idle'); }
        return;
      }
      // raid
      if (a.raid && a.raid.nest) { a.dest = a.raid.nest.pos; if (a.state !== 'attack') setState(a, 'wander'); return; }
      // sleep
      if (sleepsNow(sp) && !a.migrate && !a.guard) {
        if (a.state === 'sleep') { if (dP < (eco.player && eco.player.sneaking ? 2.5 : 5) && !sp.isPlayer && sp.relation !== 'allied') setState(a, 'idle'); return; }
        const home = a.nest ? a.nest.pos : null;
        if (home) { if (me.distanceTo(home) < 4.5) { setState(a, 'sleep'); return; } a.dest = home; if (a.state !== 'wander') setState(a, 'wander'); a._goHome = true; return; }
        setState(a, 'sleep'); return;
      } else if (a.state === 'sleep') { setState(a, 'idle'); }
      a._goHome = false;
      if (a.state === 'graze' && a.node && a.node.active && a.node.fruit > 0 && a.hunger < 0.97) return;
      if (a.state === 'hunt') {
        if (!a.target || a.target.state === 'dead' || a.target.body.pos.distanceTo(me) > 38) { a.target = null; setState(a, 'idle'); } return;
      }
      // hunger driven behaviour
      const hungry = a.hunger < (sp.temperament === 'aggressive' ? 0.85 : 0.6);
      if ((sp.diet !== 'herbivore') && hungry) {
        const car = nearestCarcass(a, 32);
        if (car) { a.carcass = car; a.dest = car.pos; setState(a, 'graze'); a.node = null; return; }
        if (sp.prey.size) { const pr = nearestPrey(a, 30); if (pr) { a.target = pr; setState(a, 'hunt'); return; } }
      }
      if (sp.diet !== 'carnivore' && (a.hunger < 0.75 || rng.next() < 0.08) && !a.guard) {
        const node = flora.nearest(me, 30, (n) => n.fruit > 0 && (!n._claim || n._claim === a.id || eco.time - n._claimT > 8));
        if (node && !planet.isWater(node.dir)) { a.node = node; node._claim = a.id; node._claimT = eco.time; a.dest = node.pos; a.carcass = null; setState(a, 'graze'); return; }
      }
      if (a.state === 'idle') {
        if (a.stateT > 1 + rng.next() * 3) { const d = pickWander(a); if (d) { a.dest = d; setState(a, 'wander'); } else a.stateT = 0; }
      } else if (a.state === 'wander') {
        if (!a.dest || me.distanceTo(a.dest) < 2.2) { if (a._goHome && !sleepsNow(sp)) a._goHome = false; setState(a, 'idle'); }
        else if (a.stateT > 40) setState(a, 'idle');
      } else if (a.state === 'graze') {
        // arrived-or-lost logic is handled in act(); if no target: idle
        if (!a.node && !a.carcass) setState(a, 'idle');
      }
    }
    // deepest water (below sea level) an actor is willing to walk into: swimmers anywhere, floaters shallow lakes, sinkers only wade (DESIGN 3.6)
    function passDepth(a) {
      const st = a.species.stats, cls = st.waterClass;
      if (cls === 'swimmer') return Infinity;
      if (cls === 'floater') return 1.6;
      return Math.min(0.6, 0.25 * (st.height || 2) * a.scale) + 0.2;
    }
    function steerSafe(a, dir, swim) {
      // look ahead for water; rotate heading away if needed
      const b = a.body, ahead = 2.8 + Math.abs(b.speed) * 0.5;
      const pd = swim ? Infinity : passDepth(a);
      const test = (v) => { _d.copy(b.pos).addScaledVector(v, ahead).normalize(); return planet.surfaceRadius(_d) >= planet.seaRadius - pd; };
      if (pd === Infinity || test(dir)) return dir;
      const up = b.up;
      for (const ang of [0.7, -0.7, 1.4, -1.4, 2.4]) {
        const r = _c.copy(dir); rod(r, up, ang);
        if (test(r)) return r.clone();
      }
      return dir;
    }
    function rod(v, k, a) { const c = Math.cos(a), s = Math.sin(a), d = k.dot(v) * (1 - c); const cx = k.y * v.z - k.z * v.y, cy = k.z * v.x - k.x * v.z, cz = k.x * v.y - k.y * v.x; v.set(v.x * c + cx * s + k.x * d, v.y * c + cy * s + k.y * d, v.z * c + cz * s + k.z * d); }
    function toward(a, p, throttle, arrive) {
      const b = a.body; _a.copy(p).sub(b.pos); _a.addScaledVector(b.up, -_a.dot(b.up));
      const d = _a.length(); if (d < 0.05) { a.ctrl.move = null; return d; }
      _a.divideScalar(d);
      const dir = steerSafe(a, _a, false);
      const th = throttle * clamp(d / (arrive || 3), 0.25, 1);
      a._mv = a._mv || new V3(); a._mv.copy(dir).multiplyScalar(th); a.ctrl.move = a._mv;
      return d;
    }
    function away(a, from, throttle) {
      const b = a.body; _a.copy(b.pos).sub(from); _a.addScaledVector(b.up, -_a.dot(b.up));
      if (_a.lengthSq() < 1e-6) _a.copy(b.heading); _a.normalize();
      const dir = steerSafe(a, _a, a.species.stats.waterClass !== 'sinker' && a.hp > a.maxHp * 0.2);   // fleeing swimmers/floaters may take to the water
      a._mv = a._mv || new V3(); a._mv.copy(dir).multiplyScalar(throttle); a.ctrl.move = a._mv;
    }
    // a sinker that ended up in deep water (knocked in, pushed, spawned) stops what it is doing and tries to climb out (DESIGN 3.6)
    function escapeWater(a) {
      const b = a.body, c = a.ctrl;
      if (!b.danger) return false;
      a._mv = a._mv || new V3();
      SP.physics.escapeCtrl(b, planet, c, a._mv); if (c.move) c.move = a._mv;
      if (a.state !== 'flee' && a.state !== 'attack') a.dest = null;
      a.anim.lookAt = undefined;
      return true;
    }
    function attackReach(a, tb) { return a.body.radius + tb.radius + 0.9; }
    function dealDamage(a, tgt, isPlayerTarget) {
      const ab = a.species.stats.abilities || {}, lvl = Math.min(a.species.stats.dmgLvl || 5, Math.max(1, ab.bite || 0, ab.strike || 0, ab.charge || 0));
      const tm = isPlayerTarget ? (eco.player && eco.player.mass) || 6 : tgt.body.mass;
      let dmg = (6 + 6 * lvl) * 0.55 * Math.pow(a.body.mass / Math.max(0.5, tm), 0.15);
      if (a.isRogue) dmg *= 1.3; if (a.isAlpha) dmg *= 1.3;
      a.anim.action = 'bite'; a.anim.actionT = 0; a.actionDur = 0.55; a.atkCd = a.species.rank <= 1 ? 1.7 : 1.4;
      _a.copy(isPlayerTarget ? playerPos() : tgt.body.pos).sub(a.body.pos); _a.addScaledVector(a.body.up, -_a.dot(a.body.up)); _a.normalize();
      const imp = _a.clone().multiplyScalar(a.body.mass * 1.2);
      if (isPlayerTarget) { if (opts.onAttackPlayer) opts.onAttackPlayer(a, dmg, imp); if (eco.player && SP.physics) SP.physics.impulse(eco.player, imp); }
      else eco.damage(tgt, dmg, a, imp);
    }
    function act(a, dt) {
      const sp = a.species, st = sp.stats, b = a.body, c = a.ctrl, P = playerPos();
      c.move = null; c.sprint = false; c.sneak = false; c.jump = false;
      const walk = 0.42;
      switch (a.state) {
        case 'idle': case 'sleep': {
          if (a.state === 'sleep') { a.anim.action = 'sneak'; }
          else if (a.rig && eco.player && b.pos.distanceTo(P) < 14) a.anim.lookAt = P;
          break;
        }
        case 'wander': {
          if (a.dest) { const d = toward(a, a.dest, a.raid || a.migrate ? 0.7 : (a._goHome ? 0.6 : walk), 3); if (d < 2.2 && a.migrate) { a.migrate.done = true; } }
          break;
        }
        case 'graze': {
          if (a.carcass) {
            const car = a.carcass; if (car.meat <= 0 || car.t > 58) { a.carcass = null; setState(a, 'idle'); break; }
            const d = toward(a, car.pos, 0.6, 3);
            if (d < b.radius + 1.8) { c.move = null; a.anim.action = 'eat'; a.eatT += dt; if (a.eatT > 1.2) { a.eatT = 0; const t = eco.takeMeat(car, 1); a.hunger = Math.min(1, a.hunger + 0.2 * t); if (a.hunger > 0.95) { a.carcass = null; setState(a, 'idle'); } } }
          } else if (a.node && a.node.active) {
            const n = a.node; if (n.fruit <= 0 && a.eatT <= 0) { a.node = null; setState(a, 'idle'); break; }
            const d = toward(a, n.pos, 0.55, 3);
            if (d < b.radius + (n.type === 'tree' ? 1.9 : 1.3)) {
              c.move = null; if (a.anim.action !== 'eat') { a.anim.action = 'eat'; a.anim.actionT = 0; a.actionDur = 1.25; }
              a.eatT += dt;
              if (a.eatT > 1.1) { a.eatT = 0; const t = flora.take(n, 1 + (sp.rank >= 3 ? 1 : 0)); a.hunger = Math.min(1, a.hunger + 0.2 * t); n._claimT = eco.time; if (t === 0 || a.hunger > 0.95) { a.node = null; setState(a, 'idle'); } }
            }
          } else { a.node = null; setState(a, 'idle'); }
          break;
        }
        case 'hunt': {
          const t = a.target; if (!t || t.state === 'dead') { setState(a, 'idle'); break; }
          const d = toward(a, t.body.pos, 1, 2);
          c.sprint = d < 12 && d > 3;
          if (d < attackReach(a, t.body) + 0.4 && a.atkCd <= 0) dealDamage(a, t, false);
          break;
        }
        case 'attack': {
          const t = a.target;
          if (t === 'player' || (eco.player && t === eco.player)) {
            const d = toward(a, P, 1, 2); c.sprint = d < 14 && d > 4;
            const pr = (eco.player ? eco.player.radius : 1);
            if (d < a.body.radius + pr + 1.1 && a.atkCd <= 0) dealDamage(a, null, true);
            a.anim.lookAt = P;
          } else if (t && t.state !== 'dead') {
            const d = toward(a, t.body.pos, 1, 2); c.sprint = d < 12 && d > 3;
            if (d < attackReach(a, t.body) + 0.4 && a.atkCd <= 0) dealDamage(a, t, false);
          } else if (a.raid) { /* raiders gnaw the nest */
            const nest = a.raid.nest; const d = toward(a, nest.pos, 0.8, 2);
            if (d < 3.5 && a.atkCd <= 0) { a.atkCd = 5; a.anim.action = 'bite'; a.anim.actionT = 0; a.actionDur = 0.55; nest.population = Math.max(1, nest.population - 0.5); emit('event', { type: 'nest_raid', phase: 'bite', nest, pos: nest.pos }); }
          } else setState(a, 'idle');
          break;
        }
        case 'flee': {
          const th = a.threat === 'player' ? P : (a.threat && a.threat.body ? a.threat.body.pos : null);
          if (!th) { setState(a, 'idle'); break; }
          const d = th.distanceTo(b.pos);
          away(a, th, a.hp < a.maxHp * 0.3 ? 0.8 : 1); c.sprint = d < 11 && a.hp >= a.maxHp * 0.3;
          a.fleeT -= dt; if (d > 32) a.fleeT = 0;
          if (d < 20) a.fleeT = Math.max(a.fleeT, 1.5);
          // A-03: give up after ~25 units of running instead of fleeing for ever
          if (!a._fleeFrom) a._fleeFrom = b.pos.clone();
          else if (b.pos.distanceTo(a._fleeFrom) > 25) { a.fleeT = 0; a.aggro = 0; a._fleeFrom = null; a._calmT = 6; }
          break;
        }
        case 'social': {
          a.socialT -= dt; a.anim.lookAt = P;
          _a.copy(P).sub(b.pos); _a.addScaledVector(b.up, -_a.dot(b.up)); if (_a.lengthSq() > 0.5) { a._mv = a._mv || new V3(); a._mv.copy(_a).normalize().multiplyScalar(0.05); c.move = a._mv; }
          break;
        }
        case 'follow': {
          const d = b.pos.distanceTo(P);
          if (d > 5) { toward(a, P, d > 18 ? 1 : 0.6, 4); c.sprint = d > 16; }
          if (d > 90) { /* lost the pack: warp next to player */ const p = landNear(P, 4, 7); if (p) SP.physics.place(b, planet, p); }
          break;
        }
      }
    }
    function updateActor(a, dt) {
      const b = a.body;
      if (a.state === 'dead') { a.dyingT += dt; a.anim.actionT += dt; a.anim.speed = 0; return; }
      a.stateT += dt; a.atkCd -= dt; a.aggro = Math.max(0, a.aggro - dt);
      a.hunger = Math.max(0, a.hunger - dt / 220);
      a.thinkT -= dt; if (a.thinkT <= 0) { a.thinkT = 0.25 + rng.next() * 0.1; think(a); }
      a.anim.lookAt = undefined;
      if (a.anim.action === 'sneak' && a.state !== 'sleep') a.anim.action = null;
      act(a, dt);
      escapeWater(a);
      SP.physics.step(b, planet, a.ctrl, dt);
      a.anim.speed = b.speed; a.anim.turn = b._turnRate; a.anim.airborne = b.airborne && !b.inWater; a.anim.inWater = b.inWater;
      a.anim.waterState = b.waterState; a.anim.submerged = b.submerged; a.anim.drowning = b.drowning;
      if (b.drownFrac > 0) {          // out of breath: lose health (fraction of max); a death by drowning leaves a carcass like any other
        a.hp -= b.drownFrac * a.maxHp; b.drownFrac = 0;
        if (a.hp <= 0) { eco.kill(a, 'drown'); return; }
      }
      if (a.anim.action && a.anim.action !== 'sneak') { a.anim.actionT += dt; if (a.actionDur > 0 && a.anim.actionT > a.actionDur && a.anim.action !== 'eat') { a.anim.action = null; } else if (a.anim.action === 'eat' && a.state !== 'graze') a.anim.action = null; }
      else if (a.anim.action === 'sneak') a.anim.actionT += dt;
      if (a.flash > 0) { a.flash -= dt; if (a.flash <= 0 && a.rig && a.rig.setTint) a.rig.setTint(null); }
      if (a.marker) { a.marker.rotation.y += dt * 1.8; a.marker.position.y += Math.sin(eco.time * 3 + a.scale * 9) * dt * 0.15; }
    }
    function poseActor(a, dt) {
      if (!a.rig) return;
      SP.surf.orient(a.rig.root, a.body.pos, a.body.heading);
      const d2 = a.body.pos.distanceToSquared(eco.focus);
      const vis = (d2 < 70 * 70 && a.drawn !== false) || a.state === 'dead';   // beyond ~70 u nothing is visible over the horizon/trees: skip draw + IK
      if (a.rig.root.visible !== vis) a.rig.root.visible = vis;
      if (vis && (d2 < 45 * 45 || (a._skip = ((a._skip || 0) + 1) % 3) === 0)) SP.creature.animate(a.rig, d2 < 45 * 45 ? dt : dt * 3, a.anim);
    }

    // ================================================================== LOD management
    function nestActors(n) { let c = 0; for (const a of eco.actors) if (a.nest === n && a.state !== 'dead') c++; return c; }
    function manageActors() {
      const F = eco.focus, fdir = _b.copy(F).normalize();
      // despawn far / reconcile
      for (const a of eco.actors.slice()) {
        if (a.state === 'dead') continue;
        const d = a.body.pos.distanceTo(F);
        if (d > DESPAWN_R && !a.packOf) despawn(a);
      }
      // draw budget: only the nearest actors get a visible rig (low-LOD rigs still cost ~100 draw calls each)
      { const live = eco.actors.filter((a) => a.state !== 'dead'); live.sort((x, y) => x.body.pos.distanceToSquared(F) - y.body.pos.distanceToSquared(F)); live.forEach((a, i) => { a.drawn = i < (opts.maxDrawn || 10); }); }
      // nests
      const cand = [];
      for (const n of eco.nests) {
        const sp = speciesById(n.speciesId); if (!sp || sp.relation === 'extinct' || !sp.arrived) continue;
        const d = arc(n.dir, fdir);
        if (d < SPAWN_R) cand.push({ n, sp, d });
      }
      cand.sort((x, y) => x.d - y.d);
      let spawned = 0;
      for (const { n, sp } of cand) {
        const want = Math.min(Math.round(n.population), maxVis(sp));
        const have = nestActors(n);
        if (have > want) {
          // quietly remove the farthest one beyond sight
          let far = null, fd = 25; for (const a of eco.actors) if (a.nest === n && a.state !== 'dead' && !a.packOf && !a.isAlpha) { const d = a.body.pos.distanceTo(F); if (d > fd) { fd = d; far = a; } }
          if (far) despawn(far);
        } else if (have < want && eco.actors.length < MAX_ACTORS && spawned < 3) {
          const isPrimary = !sp.isPlayer && eco.nests.find((x) => x.speciesId === sp.id) === n;
          const wantAlpha = isPrimary && sp.alpha.alive && !sp.alpha.actor;
          const rogue = !wantAlpha && !sp.isPlayer && sp.rank >= 1 && sp.temperament !== 'passive' && rng.next() < 0.07;
          const p = landNear(n.pos, 2.5, 9, F);
          if (p) { const a = spawnActor(sp, n, p, { alpha: wantAlpha, rogue }); if (a) { spawned++; if (wantAlpha) sp.alpha.actor = a.id; } }
        }
      }
      // bone pile guards
      for (const bp of eco.bonePiles) {
        if (!bp.guardAlive || bp.guardedBy) continue;
        if (bp.pos.distanceTo(F) > SPAWN_R || eco.actors.length >= MAX_ACTORS) continue;
        const sp = speciesById(bp.guardSpecies); if (!sp || sp.relation === 'extinct') continue;
        const p = landNear(bp.pos, 3, 8, null); if (!p) continue;
        const a = spawnActor(sp, null, p, { guard: bp.id, scale: 1.15 }); if (a) bp.guardedBy = a.id;
      }
    }

    eco._manage = manageActors;
    // ================================================================== far simulation (statistical population model)
    function refreshCapacity() {
      // gather food nodes per nest, count consumers per node
      const herbNests = [];
      for (const n of eco.nests) { const sp = speciesById(n.speciesId); if (!sp || sp.relation === 'extinct' || !sp.arrived) { n.nodes = []; continue; } n.nodes = flora.within(n.pos, 40); n._sp = sp; if (sp.diet !== 'carnivore') herbNests.push(n); }
      for (const n of herbNests) for (const f of n.nodes) f._cons = 0;
      for (const n of herbNests) for (const f of n.nodes) f._cons++;
      for (const n of eco.nests) {
        const sp = n._sp; if (!sp || n.isPlayer) { if (n.isPlayer) { let P = 0; for (const f of n.nodes) P += 60 / f.regrow * f.vigor / Math.max(1, f._cons || 1); n.food = P; n.capacity = clamp(P * 0.7 / 3.5, 4, 14); } continue; }
        let fruitCap = 0, preyCap = 0;
        if (sp.diet !== 'carnivore') { let P = 0; for (const f of n.nodes) P += (f.active ? 60 / f.regrow * f.vigor : 0) / Math.max(1, f._cons); n.food = P; fruitCap = clamp(0.55 * P / NEED[sp.rank], 1.5, 16); }
        if (sp.diet !== 'herbivore') {
          let pp = 0; for (const o of eco.nests) { if (!sp.prey.has(o.speciesId)) continue; if (arc(o.dir, n.dir) < 90) pp += o.population; }
          preyCap = clamp(pp * 0.3 / PREYFAC[sp.rank] * (sp.diet === 'omnivore' ? 1.2 : 1), 1.5, 9);
        }
        n.capacity = sp.diet === 'herbivore' ? fruitCap : sp.diet === 'carnivore' ? preyCap : clamp(fruitCap * 0.55 + preyCap * 0.7, 1.5, 14);
        if (sp.diet === 'carnivore') n.capacity = Math.max(n.capacity, 2.0);
      }
    }
    function farTick(dt) {
      eco._far++;
      const nests = eco.nests, min = dt / 60;
      const byId = new Map(); for (const n of nests) { const sp = speciesById(n.speciesId); n._sp = sp; }
      // predation first (uses current pops)
      for (const pn of nests) {
        const sp = pn._sp; if (!sp || sp.isPlayer || !sp.arrived || sp.relation === 'extinct' || sp.diet === 'herbivore' || pn.population < 1) continue;
        if (nestActors(pn) > 0) { pn.sat = 0.75 + 0.25 * pn.sat; continue; } // near: real hunting
        let sumW = 0; const list = [];
        for (const qn of nests) {
          if (!sp.prey.has(qn.speciesId) || qn.population < 1.8 || arc(qn.dir, pn.dir) > 70) continue;
          const w = qn.population / (qn.population + 3); list.push([qn, w]); sumW += w;
        }
        const sat = sumW / (sumW + 0.6);
        pn.sat = pn.sat * 0.6 + 0.4 * clamp(sat * 1.15, 0, 1);
        if (!list.length) continue;
        const K = pn.population * KILLRATE[sp.rank] * sat * min;
        for (const [qn, w] of list) {
          const kill = Math.min(K * w / sumW * (nestActors(qn) > 0 ? 0.6 : 1), qn.population * 0.12);
          qn.population -= kill;
        }
      }
      for (const n of nests) {
        const sp = n._sp; if (!sp || !sp.arrived || sp.relation === 'extinct') continue;
        if (n.isPlayer) {
          if (n.population < 1) { n.population = 1; emit('event', { type: 'nest_empty', nest: n }); }
          if (n.population < n.capacity) n.population += 0.6 * min * (1 - n.population / n.capacity) * 2;
          continue;
        }
        const pop = n.population;
        if (pop < 0.5) { if (pop > 0) n.population = 0; continue; }
        // consumption (herbivores / omnivores) from the flora layer
        if (sp.diet !== 'carnivore') {
          const unspawned = Math.max(0, pop - nestActors(n));
          n.eatAcc += unspawned * NEED[sp.rank] * min * (sp.diet === 'omnivore' ? 0.6 : 1);
          let got = 0, miss = 0;
          while (n.eatAcc >= 1) {
            n.eatAcc -= 1;
            let node = null;
            for (let k = 0; k < 6 && n.nodes.length; k++) { const c = n.nodes[Math.floor(rng.next() * n.nodes.length)]; if (c.active && c.fruit > 0) { node = c; break; } }
            if (node) { flora.take(node, 1); got++; } else miss++;
          }
          if (got + miss > 0) n.sat = n.sat * 0.6 + 0.4 * (got / (got + miss));
          else n.sat = n.sat * 0.9 + 0.1 * clamp(n.food / Math.max(0.1, pop * NEED[sp.rank]), 0, 1);
          if (nestActors(n) > 0) n.sat = Math.max(n.sat, 0.55);
        }
        const cap = Math.max(1.5, n.capacity);
        const sf = 0.3 + 0.7 * n.sat;
        let births = pop >= 2 ? pop * GROW[sp.rank] * (1 - pop / cap) * sf * min : pop * 0.06 * min;
        let deaths = pop * 0.03 * min;
        if (n.sat < 0.5) deaths += pop * (0.5 - n.sat) * 0.15 * min;
        n.growth = (births - deaths) / min;
        n.population = Math.max(0, pop + births - deaths);
        if (n.population < 0.5) n.population = 0;
      }
      // recolonisation: empty nests are re-settled from healthy ones of the same species
      for (const n of nests) {
        const sp = n._sp; if (!sp || sp.isPlayer || !sp.arrived || sp.relation === 'extinct' || n.population > 0) { n.zeroT = 0; continue; }
        n.zeroT += dt;
        if (n.zeroT > 90) {
          let src = null; for (const o of nests) if (o !== n && o.speciesId === n.speciesId && o.population >= 5 && (!src || o.population > src.population)) src = o;
          if (src && rng.next() < 0.5) { src.population -= 1.5; n.population = 1.5; n.zeroT = 0; } else n.zeroT = 45;
        }
      }
      for (const sp of eco.species) checkExtinct(sp);
    }
    eco._farTick = farTick;

    // ================================================================== events
    const meteors = [];
    let particles = null;
    function fx() { if (!particles && SP.render && SP.render.particles && opts.scene) { try { particles = SP.render.particles(opts.scene); } catch (e) { particles = null; } } return particles; }
    const meteorGeo = new THREE.ConeGeometry(0.35, 3.2, 5);
    function startEvent(type) {
      const home = eco.homeNest;
      if (type === 'meteor') {
        const ev = { type: 'meteor', t: 0, dur: 25, spawnT: 0, pos: home.pos.clone(), impacts: [] };
        eco.events.push(ev); emit('event', { type: 'meteor', phase: 'start', pos: home.pos.clone(), duration: ev.dur, safeRadius: 14, text: 'Meteor shower! Run to your nest!' });
      } else if (type === 'migration') {
        const cands = eco.species.filter((s) => s.arrived && s.relation !== 'extinct' && s.diet === 'herbivore' && s.rank <= 3 && eco.nests.some((n) => n.speciesId === s.id && n.population >= 2));
        if (!cands.length) return false;
        const sp = cands[Math.floor(rng.next() * cands.length)];
        const F = eco.focus, pd = F.clone().normalize();
        const ref = Math.abs(pd.y) < 0.95 ? new V3(0, 1, 0) : new V3(1, 0, 0), e = new V3().crossVectors(ref, pd).normalize(), nn = new V3().crossVectors(pd, e);
        const ang = rng.next() * Math.PI * 2, tdir = e.multiplyScalar(Math.cos(ang)).addScaledVector(nn, Math.sin(ang));
        const startPt = SP.surf.move(pd.clone().multiplyScalar(R), tdir, -62, null), dest = SP.surf.move(pd.clone().multiplyScalar(R), tdir, 95, null);
        const ev = { type: 'migration', t: 0, dur: 200, species: sp, dest, actors: [] };
        const cnt = 5 + Math.floor(rng.next() * 4);
        for (let i = 0; i < cnt; i++) {
          const p0 = landNear(startPt, 1, 9, null) || startPt.clone();
          if (planet.isWater(p0.clone().normalize())) continue;
          const a = spawnActor(sp, null, p0, { migrate: { dest, ev, done: false } }); if (a) { a.state = 'wander'; a.dest = dest; ev.actors.push(a); }
        }
        eco.events.push(ev); emit('event', { type: 'migration', phase: 'start', species: sp, from: startPt, to: dest, text: 'A herd of ' + sp.name + ' is migrating through!' });
      } else if (type === 'raid') {
        const cands = eco.species.filter((s) => s.arrived && s.relation !== 'extinct' && s.diet !== 'herbivore' && eco.nests.some((n) => n.speciesId === s.id && n.population >= 2) && s.relation !== 'allied');
        if (!cands.length) return false;
        const sp = cands[Math.floor(rng.next() * cands.length)];
        const ev = { type: 'raid', t: 0, dur: 80, species: sp, nest: home, actors: [], dead: 0, spawned: false, resolved: false };
        eco.events.push(ev); emit('event', { type: 'nest_raid', phase: 'start', species: sp, nest: home, pos: home.pos.clone(), text: sp.name + ' are raiding your nest!' });
      } else if (type === 'fruit') {
        const c = planet.randomLandDir(rng, (d) => arc(d, eco.focus.clone().normalize()) < 110).clone();
        const pos = planet.surfacePoint(c);
        flora.boost(pos, 65, 4.5, 80);
        eco.events.push({ type: 'fruit', t: 0, dur: 80, pos });
        emit('event', { type: 'fruit_boom', phase: 'start', pos, radius: 65, duration: 80, text: 'Fruit boom!' });
      } else return false;
      return true;
    }
    eco.triggerEvent = (t) => { t = { meteor: 'meteor', migration: 'migration', raid: 'raid', fruit: 'fruit', fruit_boom: 'fruit', nest_raid: 'raid', meteor_shower: 'meteor' }[t] || t; return startEvent(t); };
    function updateEvents(dt) {
      eco._eventT -= dt;
      if (eco._eventT <= 0) {
        const order = rng.shuffle ? rng.shuffle(['meteor', 'migration', 'raid', 'fruit']) : ['fruit', 'migration', 'raid', 'meteor'];
        for (const t of order) if (startEvent(t)) break;
        eco._eventT = 120 + rng.next() * 60;
      }
      for (let i = eco.events.length - 1; i >= 0; i--) {
        const ev = eco.events[i]; ev.t += dt;
        if (ev.type === 'meteor') {
          ev.spawnT -= dt;
          if (ev.t < ev.dur - 3 && ev.spawnT <= 0) {
            ev.spawnT = 0.55 + rng.next() * 0.5;
            const F = eco.focus; const p = landNear(F, 10, 34, null);
            if (p && p.distanceTo(eco.homeNest.pos) > 15) {
              const up = p.clone().normalize(), ref = new V3(rng.next() - 0.5, 0, rng.next() - 0.5);
              const m = new THREE.Mesh(meteorGeo, toon(0xfb923c, { emissive: 0xf97316, emissiveIntensity: 1 })); m.frustumCulled = false;
              const start = p.clone().addScaledVector(up, 70).addScaledVector(ref, 28);
              eco.group.add(m); meteors.push({ m, start, end: p, t: 0, dur: 1.5 });
            }
          }
          if (ev.t > ev.dur) { eco.events.splice(i, 1); emit('event', { type: 'meteor', phase: 'end' }); }
        } else if (ev.type === 'migration') {
          ev.actors = ev.actors.filter((a) => eco.actors.indexOf(a) >= 0 && a.state !== 'dead');
          const done = ev.actors.length > 0 && ev.actors.every((a) => a.migrate && a.migrate.done);
          if (ev.t > ev.dur || done || (ev.t > 10 && !ev.actors.length)) { for (const a of ev.actors) { a.migrate = null; despawn(a); } eco.events.splice(i, 1); emit('event', { type: 'migration', phase: 'end', species: ev.species }); }
        } else if (ev.type === 'raid') {
          const nest = ev.nest;
          if (!ev.spawned && nest.pos.distanceTo(eco.focus) < 100 && ev.t < 50) {
            ev.spawned = true; const k = 2 + Math.floor(rng.next() * 2);
            for (let j = 0; j < k; j++) { const p = landNear(nest.pos, 30, 42, eco.focus); if (!p) continue; const a = spawnActor(ev.species, null, p, { raid: ev, rogue: false }); if (a) { a.state = 'wander'; a.dest = nest.pos; ev.actors.push(a); } }
          }
          ev.actors = ev.actors.filter((a) => eco.actors.indexOf(a) >= 0 && a.state !== 'dead');
          let finish = ev.t > ev.dur || (ev.spawned && ev.actors.length === 0 && ev.t > 8);
          if (!ev.spawned && ev.t > 40 && !ev.resolved) { ev.resolved = true; const loss = 1 + Math.floor(rng.next() * 2); nest.population = Math.max(1, nest.population - loss); emit('event', { type: 'nest_raid', phase: 'bite', nest, pos: nest.pos, loss }); finish = true; }
          if (finish) { for (const a of ev.actors) { a.raid = null; despawn(a); } eco.events.splice(i, 1); emit('event', { type: 'nest_raid', phase: 'end', nest }); }
        } else if (ev.type === 'fruit') {
          if (ev.t > ev.dur) { eco.events.splice(i, 1); emit('event', { type: 'fruit_boom', phase: 'end' }); }
        }
      }
      // meteors in flight
      for (let i = meteors.length - 1; i >= 0; i--) {
        const mt = meteors[i]; mt.t += dt; const k = Math.min(1, mt.t / mt.dur);
        mt.m.position.lerpVectors(mt.start, mt.end, k * k);
        _a.copy(mt.end).sub(mt.start).normalize(); mt.m.quaternion.setFromUnitVectors(new V3(0, 1, 0), _a.negate());
        if (k >= 1) {
          eco.group.remove(mt.m); meteors.splice(i, 1);
          const pos = mt.end.clone();
          const f = fx(); if (f) { f.burst(pos, 0xfb923c, 18, 1.4); f.burst(pos, 0xfde047, 10, 1); }
          for (const a of eco.actors.slice()) if (a.state !== 'dead' && a.body.pos.distanceTo(pos) < 3.8) eco.damage(a, 40, 'meteor', a.body.pos.clone().sub(pos).setLength(a.body.mass * 2));
          emit('event', { type: 'meteor', phase: 'impact', pos, radius: 3.8, damage: 25 });
        }
      }
    }

    // ================================================================== main update
    eco.update = function (dt, focusPos, timeOfDay) {
      if (dt <= 0) return;
      eco.time += dt;
      if (focusPos) eco.focus.copy(focusPos);
      if (timeOfDay !== undefined) { eco.timeOfDay = timeOfDay; eco.night = timeOfDay < 0.2 || timeOfDay > 0.8; }
      eco._capT += dt; if (eco._capT >= 10) { eco._capT = 0; refreshCapacity(); }
      eco._farT += dt; if (eco._farT >= 2) { const d = eco._farT; eco._farT = 0; farTick(d); }
      eco._manT += dt; if (eco._manT >= 0.5) { eco._manT = 0; manageActors(); }
      // arrivals
      for (let i = eco._arrivals.length - 1; i >= 0; i--) {
        const ar = eco._arrivals[i]; ar.t -= dt;
        if (ar.t <= 0) { eco._arrivals.splice(i, 1); refreshCapacity(); settleSpecies(ar.sp, false); refreshCapacity(); for (const n of eco.nests) if (n.speciesId === ar.sp.id) n.population = Math.max(2, Math.min(n.capacity * 0.6, 6)); emit('speciesArrived', { species: ar.sp, nests: eco.nests.filter((n) => n.speciesId === ar.sp.id) }); emit('event', { type: 'arrival', species: ar.sp, text: ar.sp.name + ' have migrated into the region' }); eco._nestVisT = 0; }
      }
      updateEvents(dt);
      // A-10: hostility fades after ~3 minutes without a kill, so one mistake does not lock out the social route for ever
      for (const sp of eco.species) {
        if (sp.relation !== 'hostile') { sp._hostT = undefined; continue; }
        if (sp._hostT === undefined) sp._hostT = eco.time;
        if (eco.time - sp._hostT > 180) { sp.relation = 'neutral'; sp.impressed = 0; sp._hostT = undefined; emit('event', { type: 'peace', species: sp, text: sp.name + ' have forgiven you' }); }
      }
      // actors
      for (const a of eco.actors) updateActor(a, dt);
      for (let i = eco.actors.length - 1; i >= 0; i--) { const a = eco.actors[i]; if (a.state === 'dead' && a.dyingT > 1.2) { eco.actors.splice(i, 1); a.rig = null; } }
      for (const a of eco.actors) poseActor(a, dt);
      // carcasses
      for (let i = eco.carcasses.length - 1; i >= 0; i--) {
        const c = eco.carcasses[i]; c.t += dt;
        if (c.rig && c.actor) { if (c.t < 3) { c.actor.anim.actionT = c.t; SP.creature.animate(c.rig, dt, c.actor.anim); SP.surf.orient(c.rig.root, c.pos, c.actor.body.heading); } if (c.t < 3 && !c.rig.root.parent) eco.group.add(c.rig.root); }
        if (c.rig && c.t > 50) { const k = clamp((60 - c.t) / 10, 0.05, 1); c.rig.setScale && c.rig.setScale(c.actor.scale * k); }
        if (c.t > 60 || c.meat <= 0) { if (c.rig) { eco.group.remove(c.rig.root); c.rig.dispose && c.rig.dispose(); } eco.carcasses.splice(i, 1); }
      }
      // bone piles
      const P = playerPos();
      for (const bp of eco.bonePiles) {
        if (bp.spark) { bp.spark.visible = !bp.found; bp.spark.rotation.y += dt * 2; bp.spark.position.y = 3.2 + Math.sin(eco.time * 2.5 + bp.pos.x) * 0.25; }
        if (!bp.found && P.distanceTo(bp.pos) < 3.2) { bp.found = true; emit('boneFound', { pile: bp, parts: bp.parts, guardAlive: bp.guardAlive }); }
      }
      eco._nestVisT -= dt; if (eco._nestVisT <= 0) { eco._nestVisT = 1; updateEggs(); }
      updateShadows();
    };
    eco.stats = function () {
      let pop = 0; for (const n of eco.nests) pop += n.population;
      return { far: eco._far, actors: eco.actors.length, totalPop: pop, species: eco.species.filter((s) => s.relation !== 'extinct').length };
    };

    // ---------------------------------------------------------------- serialize
    eco.serialize = function () {
      return {
        v: 1, time: eco.time, brainLevel: eco.brainLevel,
        species: eco.species.map((s) => ({ id: s.id, name: s.name, design: s.design, diet: s.diet, sizeTier: s.sizeTier, temperament: s.temperament, nocturnal: s.nocturnal, likes: s.likes, relation: s.relation, impressed: s.impressed, needed: s.needed, killed: s.killed, alphaAlive: s.alpha.alive, color: s.color, arrived: s.arrived, habitat: s.habitat, herd: s.herd, rank: s.rank })),
        nests: eco.nests.map((n) => ({ id: n.id, speciesId: n.speciesId, dir: [n.dir.x, n.dir.y, n.dir.z], population: n.population, capacity: n.capacity, growth: n.growth, isPlayer: n.isPlayer })),
        bonePiles: eco.bonePiles.map((b) => ({ id: b.id, dir: [b.dir.x, b.dir.y, b.dir.z], parts: b.parts, found: b.found, guardSpecies: b.guardSpecies, guardAlive: b.guardAlive })),
      };
    };
    eco.dispose = function () {
      for (const a of eco.actors.slice()) { eco.group.remove(a.rig.root); a.rig && a.rig.dispose && a.rig.dispose(); }
      eco.actors.length = 0; if (eco.group.parent) eco.group.parent.remove(eco.group);
    };

    // first-time init
    eco._eventT = opts.firstEventIn || (70 + rng.next() * 30);
    refreshCapacity();
    for (const n of eco.nests) { const sp = speciesById(n.speciesId); if (!n.isPlayer && !data) n.population = Math.max(2, Math.min(n.capacity * (0.5 + 0.4 * rng.next()), 9)); }
    updateEggs();
    return eco;
  }

  SP.eco = { create, load(planet, data, opts) { opts = Object.assign({}, opts, { _data: data }); return create(planet, null, opts); }, TIERS, RANK, UNLOCK, sizeFit: { dimOf, fitFor, targetSize, speciesFit, playerFit: (st) => fitFor(st, targetSize({ isPlayer: true, stats: st })) } };
})();
