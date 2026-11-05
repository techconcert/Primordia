/* SP.stages.tribal — Tribal stage (DESIGN §7): RTS village, gathering/hunting/fishing, tool huts, babies, pets,
   5 rival tribes (gift / perform / raid), outfitter, hut tiers. Helpers: tribal_world.js (props), tribal_ui.js (HUD + minigame). */
(function () {
  'use strict';
  const SP = window.SP = window.SP || {};
  SP.stages = SP.stages || {};
  const U = SP.util, V3 = THREE.Vector3, clamp = U.clamp;

  // ------------------------------------------------------------------ data
  const TOOLS = [
    { id: 'gather', name: 'Gathering canes', icon: '🌿', cost: 20, kind: 'work', color: 0x4ade80, desc: 'Gather double fruit and carry more' },
    { id: 'fish', name: 'Fishing spear', icon: '🎣', cost: 25, kind: 'work', color: 0x38bdf8, desc: 'Required to fish at coast spots' },
    { id: 'heal', name: 'Healing staff', icon: '💚', cost: 30, kind: 'work', color: 0x86efac, desc: 'Heals nearby tribe members' },
    { id: 'spear', name: 'War spear', icon: '🔱', cost: 30, kind: 'war', color: 0xf87171, desc: 'Long reach, strong hits' },
    { id: 'axe', name: 'War axe', icon: '🪓', cost: 40, kind: 'war', color: 0xdc2626, desc: 'Heavy damage, smashes totems' },
    { id: 'torch', name: 'War torch', icon: '🔥', cost: 35, kind: 'war', color: 0xf97316, desc: 'Burns buildings, scares animals' },
    { id: 'horn', name: 'Horn', icon: '📯', cost: 30, kind: 'social', color: 0xf472b6, desc: 'Musical instrument for performances' },
    { id: 'maracas', name: 'Maracas', icon: '🎶', cost: 30, kind: 'social', color: 0xc084fc, desc: 'Musical instrument for performances' },
    { id: 'didge', name: 'Didgeridoo', icon: '🎺', cost: 50, kind: 'social', color: 0xfbbf24, desc: 'Deep instrument, big social bonus' },
  ];
  const TOOL = {}; TOOLS.forEach((t) => { TOOL[t.id] = t; });
  const SOCIAL = ['horn', 'maracas', 'didge'];
  const TIER_CAP = [6, 10, 12], TIER_SLOTS = [6, 8, 9];
  const RIVAL_SIZES = [4, 6, 6, 8, 10];
  const RIVAL_COLORS = [0xf43f5e, 0xa855f7, 0x06b6d4, 0xeab308, 0xec4899];
  const GIFT_COST = 20, BABY_COST = 25, PET_COST = 15, BABY_TIME = 20, MAX_PETS = 4;
  const NAMES = ['Oog', 'Bimba', 'Tok', 'Mala', 'Zunu', 'Pip', 'Raka', 'Dodo', 'Nuk', 'Fenna', 'Gorp', 'Lilu', 'Yam', 'Kesa', 'Bo'];
  const FOODV = { fruit: 2, seaweed: 2, fish: 3, meat: 1.5, egg: 5 };

  let G = null;                 // live state while the stage is active
  const _a = new V3(), _b = new V3(), _c = new V3(), _e = new V3(), _f = new V3(), _g = new V3();

  // ------------------------------------------------------------------ geometry helpers
  function basisAt(dir) { const ref = Math.abs(dir.y) < 0.95 ? new V3(0, 1, 0) : new V3(1, 0, 0); const e = new V3().crossVectors(ref, dir).normalize(); const n = new V3().crossVectors(dir, e).normalize(); return { e, n }; }
  function groundPoint(dir) { const d = dir.clone().normalize(); return d.multiplyScalar(Math.max(G.planet.surfaceRadius(d), G.planet.seaRadius)); }
  function landPoint(dir) { const d = dir.clone().normalize(); return d.multiplyScalar(G.planet.surfaceRadius(d)); }
  function dirOffset(dir, b, bearing, dist) { const a = dist / G.planet.radius, t = b.e.clone().multiplyScalar(Math.sin(bearing)).addScaledVector(b.n, Math.cos(bearing)); return dir.clone().multiplyScalar(Math.cos(a)).addScaledVector(t, Math.sin(a)).normalize(); }
  function arc(a, b) { return G.planet.radius * Math.acos(clamp(a.clone().normalize().dot(b.clone().normalize()), -1, 1)); }
  function dist3(a, b) { return a.distanceTo(b); }
  // dry-land helpers (bug: villages/props under water). Ground must be >= PROP_MARGIN above sea or the point is moved to the nearest dry spot.
  function dryGround(p) { const S = SP.tribalSites, pl = G.planet; return S.isDry(pl, p) ? groundPoint(p) : S.dryPoint(pl, p); }
  function placeDry(obj, pos, fwd) { const p = dryGround(pos); place(obj, p, fwd); (G.statics = G.statics || []).push({ obj, fwd }); return obj; }
  // runtime guard: relocate anything standing below sea level to the nearest dry spot
  function guardDry(force) {
    const S = SP.tribalSites, pl = G.planet; let moved = 0;
    (G.statics || []).forEach((s) => { if (S.groundAbove(pl, s.obj.position) < 0) { const p = S.dryPoint(pl, s.obj.position); SP.surf.orient(s.obj, p, s.fwd || new V3(0, 0, 1)); moved++; } });
    const fix = (e) => { if (!e || e.dead || e.removed) return; const b = e.body; if (S.groundAbove(pl, b.pos) < -0.6) { const p = S.dryPoint(pl, b.pos, 0.4); b.pos.copy(p); if (b.vel) b.vel.set(0, 0, 0); if (b.up) b.up.copy(p).normalize(); e.goal = null; moved++; } };
    G.units.forEach(fix); G.rivals.forEach((r) => r.members.forEach(fix));
    return moved;
  }
  function randomDir(rng) { const z = rng.range(-1, 1), a = rng.range(0, Math.PI * 2), s = Math.sqrt(1 - z * z); return new V3(s * Math.cos(a), z, s * Math.sin(a)); }
  function place(obj, pos, fwd) { SP.surf.orient(obj, pos, fwd || new V3(0, 0, 1)); G.scene.add(obj); return obj; }
  function toast(t, ic, ms) { SP.ui.toast(t, ic, ms); }
  function sfx(n, o) { if (SP.audio) SP.audio.sfx(n, o); }
  function popup(pos, text, cls) { if (!G || !G.cam) return; _a.copy(pos).addScaledVector(pos.clone().normalize(), 2.2); SP.ui.popup(_a, G.cam.camera, text, cls); }
  function burst(pos, hex, n, sp, o) { if (G && G.fx) G.fx.burst(pos, hex, n, sp, o || { life: 0.8, size: 0.35, gravity: 5, up: pos.clone().normalize() }); }

  // ------------------------------------------------------------------ entities
  // Scale guide (docs/ART.md): a tribe member's largest dimension is ~1.4 u; animals follow a compressed curve (0.45..4.5 u).
  const MEMBER_DIM = 1.6;
  function dimOf(st) { return Math.max(st.height || 0, (st.length || 0) * 0.75, 0.6); }
  function fitScale(st, target) { return clamp(target / dimOf(st), 0.15, 1.3); }
  function animalTarget(st) { return clamp(MEMBER_DIM * Math.pow(dimOf(st) / 2.4, 0.75), 0.45, 4.5); }
  function hOf(e) { return Math.max(0.6, ((e.rig && e.rig.stats.height) || 2) * ((e.rig && e.rig.scale) || 1)); } // visual height in world units
  function mkEnt(kind, design, pos, o) {
    o = o || {};
    const rig = SP.creature.build(design, { lod: 'low', outline: true, shadows: o.shadows !== false });
    const fit = fitScale(rig.stats, o.target || MEMBER_DIM);
    const sc = (o.scale || 1) * fit; rig.setScale(sc);
    G.scene.add(rig.root);
    const stats = Object.assign({}, rig.stats, o.stats || {});
    const up = pos.clone().normalize(), h = basisAt(up).e.clone();
    const body = SP.physics.createBody({ pos: pos.clone(), heading: h, radius: Math.max(0.28, rig.stats.radius * sc * 0.65), mass: Math.max(0.5, rig.stats.mass * sc * sc), stats, scale: sc });
    const e = { kind, rig, body, design, anim: { speed: 0, turn: 0, action: null, actionT: 0, airborne: false, inWater: false }, act: null, hp: 50, maxHp: 50, goal: null, thr: 1, arrive: 0.5, dead: false, deadT: 0, scale: sc, fit, atkCd: 0, vis: true };
    G.bodies.push(body);
    return e;
  }
  function removeEnt(e) {
    if (!e || e.removed) return; e.removed = true;
    const i = G.bodies.indexOf(e.body); if (i >= 0) G.bodies.splice(i, 1);
    if (e.rig) { G.scene.remove(e.rig.root); e.rig.dispose(); }
  }
  function setAct(e, name, dur) { if (e.act && e.act.name === name && !dur) return; e.act = { name, t: 0, dur: dur || 0 }; }
  function clearAct(e, name) { if (e.act && (!name || e.act.name === name)) e.act = null; }
  function go(e, pos, thr, arrive) { e.goal = pos; e.thr = thr === undefined ? 1 : thr; e.arrive = arrive || 0.5; }
  function motion(e, dt) {
    const b = e.body; let mv = null;
    if (e.goal && !e.dead && !e.frozen) {
      _b.copy(e.goal).sub(b.pos); _b.addScaledVector(b.up, -_b.dot(b.up));
      const d = _b.length();
      if (d > e.arrive) { _b.multiplyScalar(1 / d); _b.multiplyScalar(Math.max(0.3, Math.min(1, d / 2)) * e.thr); mv = _b; }
    }
    // water (DESIGN 3.6): heavy bodies keep out of lakes, climb out when they fall in, and lose health when out of breath
    const c = e._ctrl || (e._ctrl = { move: null, jump: false });
    c.jump = false;
    if (mv && b.stats.waterClass !== 'swimmer') {
      // route around lakes towards the goal (shoreline following), then the local side-step as a safety net
      const gl = e.goal && SP.physics.pathAroundWater(b, G.planet, e.goal, _f);
      if (gl) { const l = mv.length(); mv = _f.multiplyScalar(l); }
      if (!(b._paw && b._paw.wade)) mv = SP.physics.avoidWater(b, G.planet, mv, _e);
    }
    // obstacle whiskers (trunk radius only, capped body footprint): slide round trees / rocks before the jam breaker has to kick in
    if (mv && !e.dead && SP.physics.steerAround) { const l = mv.length(); if (l > 0.01) { const o = e._sav || (e._sav = new THREE.Vector3()); o.copy(mv).multiplyScalar(1 / l); SP.physics.steerAround(b, G.planet, o, o, { goal: e.goal }); mv = o.multiplyScalar(l); } }
    // jam breaker: a unit that has a goal but makes no net progress for 2.5 s (tree / rock / crowd in the way) side-steps for a moment, alternating sides
    if (mv && !e.dead) {
      const sk = e._sk || (e._sk = { p: b.pos.clone(), t: 0, until: 0, ang: 1.2, n: 0 });
      sk.t += dt;
      if (sk.t > 2.5) { if (sk.until <= 0 && sk.p.distanceTo(b.pos) < 0.9 && !b.danger) { sk.until = 1.4 + 0.4 * Math.min(sk.n, 4); sk.ang = (sk.n % 2 ? 1 : -1) * 1.2; sk.n++; } else if (sk.p.distanceTo(b.pos) >= 0.9) sk.n = 0; sk.p.copy(b.pos); sk.t = 0; }
      if (sk.until > 0) { sk.until -= dt; if (mv !== _g) { _g.copy(mv); mv = _g; } SP.physics.rotate ? SP.physics.rotate(mv, b.up, sk.ang) : 0; }
    } else if (e._sk) { e._sk.t = 0; e._sk.p.copy(b.pos); }
    c.move = mv;
    if (!e.dead) SP.physics.escapeCtrl(b, G.planet, c, _e);
    SP.physics.step(b, G.planet, c, dt);
    if (b.drownFrac > 0) {
      const f = b.drownFrac; b.drownFrac = 0;
      if (!e.dead && e.maxHp) {
        e.hp -= f * e.maxHp;
        e._drownT = (e._drownT || 0) - dt;
        if (e._drownT <= 0 && e.vis !== false) { e._drownT = 1.2; popup(b.pos, 'Drowning!', 'pop-red'); if (!G.flags.drownToast && e.kind === 'unit') { G.flags.drownToast = true; toast('A tribe member is drowning! Heavy bodies sink: keep them near shore or give them fins.', '🫧', 5000); } }
        if (e.hp <= 0) kill(e, null);
      }
    }
  }
  function face(e, pos) {
    const b = e.body; _c.copy(pos).sub(b.pos); _c.addScaledVector(b.up, -_c.dot(b.up));
    if (_c.lengthSq() > 1e-4) { _c.normalize(); b.heading.lerp(_c, 0.3).addScaledVector(b.up, 0).normalize(); }
  }
  function visual(e, dt, showR) {
    const b = e.body, d = b.pos.distanceTo(G.cam.focusPos);
    const show = d < showR && !e.removed;
    e.rig.root.visible = show; e.vis = show;
    if (!show) return;
    SP.surf.orient(e.rig.root, b.pos, b.heading);
    const A = e.anim; A.speed = b.speed; A.turn = b._turnRate || 0; A.inWater = b.inWater; A.airborne = b.airborne && !b.inWater; A.waterState = b.waterState; A.submerged = b.submerged; A.drowning = b.drowning && !e.dead;
    if (e.act) { e.act.t += dt; if (e.act.dur && e.act.t > e.act.dur) e.act = null; }
    A.action = e.act ? e.act.name : null; A.actionT = e.act ? e.act.t : 0;
    SP.creature.animate(e.rig, dt, A);
  }
  function flatDist(a, b) { return a.distanceTo(b); }

  // ------------------------------------------------------------------ stage
  const S = SP.stages.tribal = {
    id: 'tribal', title: 'Tribal Stage', next: 'civ', scene: null, camera: null,

    enter: function (campaign, opts) {
      opts = opts || {};
      const R = SP.render, ui = SP.ui;
      G = this._G = { c: campaign, t: 0, bodies: [], units: [], animals: [], rivals: [], drops: [], pings: [], pets: [], fishSpots: [], nests: [], slots: [], toolHuts: {},
        food: 60, tier: 1, finished: false, selected: [], selRival: -1, session: null, hint: '', hintT: 0, flags: {}, alerts: [], fm: SP.game && SP.game.fast ? 2.2 : 1, speed: SP.game && SP.game.speedMul || 1,
        toolCount: {}, uiT: 0, nightK: 0, stats: { fruit: 0, meat: 0, fish: 0, seaweed: 0, egg: 0, hunted: 0, raidsRepelled: 0, babies: 0, stolen: 0 }, outfit: { social: 0, attack: 0, health: 0, gather: 0 }, keys: [], saved: opts.resume ? campaign.tribal : null };
      const saved = G.saved;
      G.rng = U.rng((campaign.seed || 1) + 4242);
      const scene = G.scene = this.scene = new THREE.Scene();

      // ---- planet, sky, camera
      const pc = campaign.planet || { seed: campaign.seed, radius: 140 };
      const planet = G.planet = SP.planet.create({ seed: pc.seed, radius: pc.radius || 140, detail: 6 });
      scene.add(planet.group);
      G.sky = SP.sky.create(scene, planet, { dayLength: 360 });
      G.fx = R.particles(scene, 400);
      G.wfx = SP.waterFx.create(scene, G.fx, planet);
      this.planet = planet;

      // ---- village site (same home as the creature stage, nudged to flat land)
      let hd = campaign.homeDir ? new V3(campaign.homeDir[0], campaign.homeDir[1], campaign.homeDir[2]).normalize() : randomDir(G.rng);
      { // a saved/legacy home that is wet or marginal is re-picked (deterministic search outward, then the whole globe)
        const hd0 = hd.clone();
        if (!SP.tribalSites.evaluate(planet, hd).ok) hd = SP.tribalSites.pickDry(planet, hd, { maxR: 90 });
        G.homeMoved = !!saved && hd0.angleTo(hd) > 1e-3;
      }
      campaign.homeDir = [+hd.x.toFixed(4), +hd.y.toFixed(4), +hd.z.toFixed(4)];
      G.homeDir = hd;
      buildVillage();
      G.sky.setLocalTime(saved ? saved.tod : 0.42, G.v.pos);

      const cam = G.cam = new SP.cam.RTS({ distance: 48, min: 16, max: 150, radius: planet.radius });
      cam.radiusAt = (d) => Math.max(planet.surfaceRadius(d), planet.seaRadius);
      cam.focusDir.copy(saved && saved.camDir && !G.homeMoved ? new V3().fromArray(saved.camDir) : hd); cam.focusDir.normalize();
      this.camera = cam.camera;
      cam.update(0); cam.update(0);

      // ---- world content
      buildSpecies();
      buildFishSpots(); buildNests();
      buildRivals();
      buildAnimals();
      buildUnits(saved);
      guardDry();
      if (saved) applySaved(saved);
      refreshTools();

      // ---- UI & input
      buildUI();
      hookInput();
      ui.help([
        '<b>Left-click</b> a tribe member to select; <b>drag a box</b> for many; <b>double-click</b> selects all of the same job.',
        '<b>Right-click</b> to order: ground = move, 🍓 bush/tree = gather, 🌊 fish spot = fish (needs 🎣), wildlife = hunt, 🥚 nest = raid eggs, food on the ground = pick up.',
        '<b>1-9</b> equip the selected members with a tool (build its hut first from the bottom bar). <b>0</b> drops the tool.',
        'Tools: 🌿 canes gather ×2, 🎣 fish, 💚 heal, 🔱🪓🔥 war gear, 📯🎶🎺 instruments for performances.',
        '<b>B</b> raises a baby (25 food, 20 s). <b>O</b> opens the outfitter (spend food on clothes with bonuses). <b>Space</b> centres on the village.',
        'Click a rival tribe on the right: 🎁 <b>gift</b> food, 🎵 <b>perform</b> their favourite instrument (hit the notes with 1-3), or ⚔️ <b>raid</b> and destroy their totem and hut.',
        'Friendly wildlife (green hearts) can be tamed for 15 food: right-click them. Pets lay eggs in the pen.',
        'Ally or conquer all 5 tribes to win. Hostile tribes raid your food pile - keep warriors near home.',
        'Camera: WASD / screen edges pan, wheel zooms, Q/E rotates.'
      ]);
      if (SP.audio) SP.audio.music('tribal');
      G.hintT = 0;
      refreshUI(true);
    },

    update: function (dt, t) {
      if (!G) return;
      dt = Math.min(dt, 0.05);
      G.t += dt;
      const cam = G.cam, planet = G.planet;
      const mk = SP.game && SP.game.speedMul || 1;
      G.speed = mk;
      cam.edgePan = !!G.mouseMoved && !SP.input.mouse.touch && !SP.input.pointerOverUI();
      cam.update(dt);
      G.sky.update(dt, cam.focusPos);
      planet.update(dt, G.t, cam.focusPos);
      // night factor drives the fire
      const nk = clamp((0.18 - G.sky.elevation) / 0.4, 0, 1);
      G.nightK += (nk - G.nightK) * Math.min(1, dt * 3); G.night = G.nightK > 0.5;
      G.fire.update(G.t, G.nightK);
      const showR = 40 + cam._d * 1.5;
      G.showR = showR;

      updateUnits(dt);
      updateAnimals(dt);
      updateRivals(dt);
      updateDrops(dt);
      updateSession(dt);
      updateProps(dt);
      G.guardT = (G.guardT || 0) - dt; if (G.guardT <= 0) { G.guardT = 1; guardDry(); }

      SP.physics.collideAll(G.bodies, dt);
      // visuals
      for (const u of G.units) visual(u, dt, showR + 20);
      for (const a of G.animals) visual(a, dt, showR);
      for (const r of G.rivals) for (const m of r.members) visual(m, dt, showR);
      { const wet = []; for (const b of G.bodies) if (b.waterState && b.waterState !== 'dry' && b.pos.distanceToSquared(G.cam.focusPos) < 4900) wet.push(b); G.wfx.update(dt, wet, { sfx: false }); }
      G.fx.update(dt);

      G.uiT -= dt;
      if (G.uiT <= 0) { G.uiT = 0.2; refreshUI(); }
      drawOverlay(dt);
      checkWin(dt);
    },

    pause: function () { if (G) { G.paused = true; } },
    resume: function () { if (G) { G.paused = false; G.uiBuilt && (G.ui.canvas.style.display = ''); } },

    exit: function () {
      if (!G) return;
      try { if (G.session && G.session.game) G.session.game.close(); } catch (e) {}
      (G.keys || []).forEach((f) => f());
      if (G.ui) SP.tribalUI.dispose(G.ui);
      if (G.boxEl && G.boxEl.parentNode) G.boxEl.parentNode.removeChild(G.boxEl);
      [].concat(G.units, G.animals).forEach(removeEnt);
      G.rivals.forEach((r) => r.members.forEach(removeEnt));
      if (G.wfx) G.wfx.dispose();
      if (G.fx) G.fx.dispose();
      if (G.sky && G.sky.dispose) G.sky.dispose();
      if (G.cam && G.cam.dispose) G.cam.dispose(); // C-07
      if (G.scene) SP.render.disposeTree(G.scene);
      if (G.planet && G.planet.dispose) G.planet.dispose();
      G = null; this._G = null; this.scene = null;
    },

    serialize: function () {
      if (!G) return null;
      writeTribe();
      return {
        v: 1, tod: G.sky.timeOfDay, food: G.food, tier: G.tier, camDir: G.cam.focusDir.toArray(), stats: G.stats,
        huts: G.slots.map((s) => s.tool), pets: G.pets.length,
        units: G.units.filter((u) => !u.dead).map((u) => ({ chief: u.isChief, baby: u.baby, grow: u.grow, tool: u.tool, hp: u.hp, pos: u.body.pos.toArray() })),
        rivals: G.rivals.map((r) => ({ attitude: r.attitude, war: r.war, status: r.status, totemHp: r.totemHp, hutHp: r.hutHp, members: r.members.filter((m) => !m.dead).length,
          dir: [r.dir.x, r.dir.y, r.dir.z].map((x) => +x.toFixed(5)), sp: r.species.id, kind: r.kind, wanted: r.wanted, name: r.name, gifted: !!r.gifted, performed: !!r.performed })),
        flags: G.flags
      };
    },
    _G: null,
    TOOLS: TOOLS,
    _dbg: { addAttitude: (i, n) => addAttitude(G.rivals[i], n), conquer: (i) => conquer(G.rivals[i]) },
  };

  // ================================================================== build
  function clearArea(pos, rad) {
    const fl = G.planet.flora;
    fl.nodes.forEach((n) => { if (n.pos.distanceTo(pos) < rad) { n.active = false; n.size = 0; n.fruit = 0; n.vigor = 0; n.deadT = 1e12; n.dirty = true; } });
    fl._dirty = true;
  }
  function buildVillage() {
    const W = SP.tribalWorld, hd = G.homeDir, b = basisAt(hd), pos = groundPoint(hd);
    const at = (x, z) => dryGround(hd.clone().multiplyScalar(G.planet.radius).addScaledVector(b.e, x).addScaledVector(b.n, z));
    const v = G.v = { dir: hd, pos, b, at, up: hd.clone() };
    const fwdTo = (from, to) => to.clone().sub(from).addScaledVector(from.clone().normalize(), -to.clone().sub(from).dot(from.clone().normalize()));
    clearArea(pos, 25);
    v.firePos = at(0, 7.5); v.pilePos = at(-7, 4); v.totemPos = at(7.5, 3.5); v.penPos = at(-22, -11);
    v.hut = W.hut(1); placeDry(v.hut, pos, fwdTo(pos, v.firePos));
    const fire = G.fire = W.campfire(); placeDry(fire.group, v.firePos);
    G.pile = W.foodPile(); placeDry(G.pile.group, v.pilePos);
    const tm = W.totem(0x38bdf8); placeDry(tm, v.totemPos, fwdTo(v.totemPos, pos));
    const pen = W.pen(); placeDry(pen, v.penPos); v.penR = pen.userData.radius;
    // 9 tool-hut slots on a ring
    for (let i = 0; i < 9; i++) {
      const a = 0.45 + i / 9 * Math.PI * 2, p = at(Math.cos(a) * 13, Math.sin(a) * 13);
      const mk = W.slotMarker(); placeDry(mk, p);
      G.slots.push({ pos: p, tool: null, obj: null, marker: mk, i });
    }
    // some decoration: rocks and a drying rack
    for (let i = 0; i < 5; i++) { const a = G.rng.range(0, 6.28), d = G.rng.range(17, 24); const p = at(Math.cos(a) * d, Math.sin(a) * d); const rk = W.M(new THREE.Group(), 'dod', 0x64748b, [G.rng.range(0.5, 1.1), G.rng.range(0.4, 0.8), G.rng.range(0.5, 1)], [0, 0.3, 0]); const gr = new THREE.Group(); gr.add(rk); placeDry(gr, p); }
  }

  function buildSpecies() {
    const c = G.c, eco = c.eco, rng = G.rng, list = [];
    if (eco && eco.species) eco.species.forEach((s) => { if (s.relation !== 'extinct' && s.arrived !== false && s.design) list.push({ id: s.id, name: s.name, design: s.design, diet: s.diet || 'herbivore', tier: s.sizeTier || 'small', temper: s.temperament || 'passive', relation: s.relation || 'neutral', angry: 0 }); });
    const tiers = ['tiny', 'small', 'small', 'medium', 'medium', 'large'];
    let n = 0;
    while (list.length < 7) {
      const tier = tiers[n % tiers.length], diet = n % 4 === 3 ? 'carnivore' : n % 4 === 2 ? 'omnivore' : 'herbivore';
      const temper = diet === 'carnivore' ? 'aggressive' : rng.pick(['passive', 'skittish', 'territorial']);
      let d; try { d = SP.creature.generate(rng, { sizeTier: tier, diet, temperament: temper }); } catch (e) { d = SP.creature.defaultDesign('creature'); }
      list.push({ id: 'g' + n, name: d.name || ('Beast' + n), design: d, diet, tier, temper, relation: n === 0 ? 'allied' : 'neutral', angry: 0 });
      n++;
    }
    G.species = list;
  }

  function buildFishSpots() {
    const pl = G.planet, hd = G.homeDir, rng = G.rng, b = basisAt(hd), found = [];
    for (let radius = 80; radius <= 200 && found.length < 5; radius += 60) {
      for (let k = 0; k < 500 && found.length < 6; k++) {
        const d = dirOffset(hd, b, rng.range(0, 6.28), rng.range(18, radius));
        if (!pl.isWater(d)) continue;
        const depth = pl.seaRadius - pl.surfaceRadius(d); if (depth < 0.2 || depth > 3.5) continue;
        // find shore: step toward home until land
        const bb = basisAt(d); let shore = null;
        for (let a = 0; a < 8 && !shore; a++) for (let s = 3; s <= 9 && !shore; s += 3) { const q = dirOffset(d, bb, a / 8 * 6.28, s); if (!pl.isWater(q) && pl.slopeAt(q) < 0.6) shore = q; }
        if (!shore) continue;
        if (found.some((f) => arc(f.dir, d) < 12)) continue;
        found.push({ dir: d, shore });
      }
    }
    const W = SP.tribalWorld;
    found.forEach((f, i) => {
      const obj = W.fishSpot(), p = groundPoint(f.dir); place(obj, p);
      G.fishSpots.push({ dir: f.dir, pos: p, stand: landPoint(f.shore), obj, ph: i * 1.3 });
    });
  }

  function buildNests() {
    const eco = G.c.eco, W = SP.tribalWorld, rng = G.rng, hd = G.homeDir, b = basisAt(hd);
    const cands = [];
    if (eco && eco.nests) eco.nests.forEach((n) => { if (n.isPlayer) return; const sp = G.species.find((s) => s.id === n.speciesId); if (!sp || sp.relation === 'allied') return; const d = new V3(n.dir[0], n.dir[1], n.dir[2]).normalize(); if (arc(d, hd) < 130 && arc(d, hd) > 25 && SP.tribalSites.isDry(G.planet, d)) cands.push({ dir: d, sp }); });
    const need = 4;
    for (let k = 0; cands.length < need && k < 200; k++) {
      const d = dirOffset(hd, b, rng.range(0, 6.28), rng.range(30, 85)); if (!SP.tribalSites.isDry(G.planet, d) || G.planet.slopeAt(d) > 0.5) continue;
      const sps = G.species.filter((s) => s.relation !== 'allied'); cands.push({ dir: d, sp: rng.pick(sps) });
    }
    cands.slice(0, 5).forEach((c) => {
      const obj = W.nestProp(), p = landPoint(c.dir); place(obj, p);
      G.nests.push({ dir: c.dir, pos: p, obj, sp: c.sp, eggs: 3, t: 0 });
    });
  }

  function buildRivals() {
    const c = G.c, hd = G.homeDir, W = SP.tribalWorld;
    // B-03: rivals use their own RNG and, when resuming, the saved identity (site, species, kind, wanted tool, name),
    // so Continue never reshuffles who lives where.
    const rng = U.rng(((c.seed | 0) + 17) * 131 + 7);
    const sv = G.saved && G.saved.rivals && G.saved.rivals.length >= 5 && G.saved.rivals.every((q) => q && q.dir) ? G.saved.rivals : null;
    // sites
    let sites = [];
    (c.rivalSites || []).forEach((s) => { if (s && s.length === 3) sites.push(new V3(s[0], s[1], s[2]).normalize()); });
    const S = SP.tribalSites, pl = G.planet;
    let fixed = [];
    if (sv) { // resumed: keep each saved site unless it is now wet, then re-pick nearby (deterministic)
      fixed = sv.map((q) => new V3(q.dir[0], q.dir[1], q.dir[2]).normalize());
      fixed = fixed.map((d, i) => S.evaluate(pl, d).h >= S.MARGIN && S.evaluate(pl, d).landFrac >= 0.7 ? d : S.pickDry(pl, d, { maxR: 60, accept: (q) => arc(q, hd) > 55 && fixed.every((s2, j) => j === i || arc(s2, q) > 40) }));
    } else fixed = S.pickRivals(pl, hd, rng, sites, 5, 58, 42);
    while (fixed.length < 5) fixed.push(S.pickDry(pl, randomDir(rng), { maxR: 30 }));
    if (!sv) fixed.sort((a, b) => arc(a, hd) - arc(b, hd));
    c.rivalSites = fixed.map((d) => [+d.x.toFixed(4), +d.y.toFixed(4), +d.z.toFixed(4)]);
    // species for rivals: non-allied, distinct
    let pool = G.species.filter((s) => s.relation !== 'allied');
    pool = rng.shuffle ? rng.shuffle(pool.slice()) : pool;
    const usedNames = {}, SUFFIX = ['of the Hills', 'of the Shore', 'of the North', 'of the Dunes', 'of the Fen'];
    const kinds = pool.map((s) => (s.diet === 'carnivore' && s.temper !== 'passive') || s.temper === 'aggressive' ? 'aggressive' : 'peaceful');
    fixed.forEach((d, i) => {
      let sp = pool[i % pool.length] || G.species[0];
      let kind = kinds[i % pool.length] || 'peaceful';
      if (i === 1 || i === 3) kind = i === 1 ? 'aggressive' : kind; // guarantee some war
      if (i === 0) kind = 'peaceful';
      let wanted = SOCIAL[(i + (c.seed | 0)) % 3];
      if (sv) { sp = G.species.find((s) => s.id === sv[i].sp) || sp; kind = sv[i].kind || kind; wanted = sv[i].wanted || wanted; }
      // B-10: unique tribe names ("Razis" twice -> "Razis of the Shore")
      let nm = (sp.name || 'Tribe') + 's';
      if (sv && sv[i].name) nm = sv[i].name;
      else if (usedNames[nm]) { for (let q = 0; q < SUFFIX.length && usedNames[nm]; q++) nm = (sp.name || 'Tribe') + 's ' + SUFFIX[(i + q) % SUFFIX.length]; }
      usedNames[nm] = 1;
      const pos = dryGround(d), b = basisAt(d);
      const at = (x, z) => dryGround(d.clone().multiplyScalar(G.planet.radius).addScaledVector(b.e, x).addScaledVector(b.n, z));
      const r = { i, name: nm, species: sp, design: SP.creature.clone(sp.design), dir: d, pos, at, color: RIVAL_COLORS[i], size: RIVAL_SIZES[i], kind, wanted,
        attitude: kind === 'aggressive' ? 6 : 42, war: kind === 'aggressive', status: 'neutral', members: [], totemHp: 260 + RIVAL_SIZES[i] * 30, hutHp: 300 + RIVAL_SIZES[i] * 34, raidT: 70 + i * 12, perfT: 0, trib: 0, active: false, fireDance: 0 };
      r.totemMax = r.totemHp; r.hutMax = r.hutHp;
      clearArea(pos, 16);
      r.firePos = at(0, 6); r.totemPos = at(5.5, 1.5); r.hutPos = pos;
      r.hutObj = W.hut(1, color3(r.color)); placeDry(r.hutObj, pos, r.firePos.clone().sub(pos));
      r.totemObj = W.totem(r.color, 1.0); placeDry(r.totemObj, r.totemPos, pos.clone().sub(r.totemPos));
      r.fire = W.campfire(); r.fire.light.visible = false; placeDry(r.fire.group, r.firePos);
      r.banner = W.banner(r.color); placeDry(r.banner, at(-5, 4));
      r.ruin = null;
      for (let k = 0; k < r.size; k++) {
        const a = k / r.size * 6.28, m = mkEnt('rival', r.design, at(Math.cos(a) * 5, Math.sin(a) * 5 + 4), { scale: 0.92, target: MEMBER_DIM, shadows: false, stats: { topSpeed: Math.max(3.4, 4.2), accel: 12 } });
        m.rival = r; m.hp = m.maxHp = 40 + r.size * 5 + i * 6; m.state = 'idle'; m.home = r.firePos; m.wT = G.rng.range(0, 4); m.dmg = (5 + r.size * 0.5) * (1 + i * 0.1);
        if (k % 3 === 0) m.eng = true; // takes part in fights
        m.frozen = false; r.members.push(m);
      }
      G.rivals.push(r);
    });
    G.rivals.forEach((r) => { r.members.forEach((m) => { m.rig.root.visible = false; }); });
  }
  function color3(c) { return c; }

  function buildAnimals() {
    const hd = G.homeDir, b = basisAt(hd), rng = G.rng;
    G.spawnAnimalNear = function (centerDir, minD, maxD) {
      const sp = rng.pick(G.species);
      const dd = sp.tier === 'epic' ? null : sp;
      if (!dd) return null;
      let d = null;
      for (let k = 0; k < 40; k++) {
        const q = dirOffset(centerDir, basisAt(centerDir), rng.range(0, 6.28), rng.range(minD, maxD));
        if (!SP.tribalSites.isDry(G.planet, q) || G.planet.slopeAt(q) > 0.55) continue;
        if (sp.diet === 'carnivore' && arc(q, hd) < 35) continue;
        d = q; break;
      }
      if (!d) return null;
      return makeAnimal(sp, landPoint(d));
    };
    for (let i = 0; i < 12; i++) G.spawnAnimalNear(hd, 24, 95);
  }
  function makeAnimal(sp, pos) {
    const st = SP.creature.stats(sp.design);
    const e = mkEnt('animal', sp.design, pos, { target: animalTarget(st), shadows: false, stats: { topSpeed: Math.min(st.topSpeed, 6.5) } });
    e.sp = sp; e.maxHp = e.hp = clamp(st.health * 0.55, 14, 150); e.state = 'wander'; e.home = pos.clone(); e.wT = G.rng.range(0, 5);
    e.friendly = sp.relation === 'allied'; e.dmg = clamp(3 + (st.abilities.bite || 0) * 1.5 + st.mass * 0.35, 2, 14); e.meat = clamp(Math.round(e.maxHp / 9), 2, 14);
    e.fleeT = 0;
    G.animals.push(e);
    return e;
  }

  function buildUnits(saved) {
    const design = G.c.design || SP.creature.defaultDesign('creature');
    G.design = design;
    updateOutfitStats();
    const list = saved ? saved.units : null;
    const n = list ? list.length : 5;
    for (let i = 0; i < n; i++) {
      const rec = list ? list[i] : { chief: i === 0 };
      const pos = rec.pos && !G.homeMoved ? new V3().fromArray(rec.pos) : G.v.at(Math.cos(i * 1.26) * 3.5, 7.5 + Math.sin(i * 1.26) * 3.5);
      const u = makeUnit(pos, rec.chief, rec.baby);
      if (rec.baby) u.grow = rec.grow || 0;
      if (rec.hp) u.hp = Math.min(u.maxHp, rec.hp);
      if (rec.tool) equip(u, rec.tool);
      G.units.push(u);
    }
    if (!G.units.some((u) => u.isChief) && G.units[0]) { G.units[0].isChief = true; regear(G.units[0]); }
  }
  function updateOutfitStats() {
    const st = SP.creature.stats(G.design); G.base = st; G.outfit = st.outfit || { social: 0, attack: 0, health: 0, gather: 0 };
  }
  function makeUnit(pos, chief, baby) {
    const sc = chief ? 1.3 : 1;
    const u = mkEnt('unit', G.design, pos, { scale: sc * (baby ? 0.5 : 1), stats: { topSpeed: Math.max(3.8, G.base.topSpeed) * 1.1, accel: Math.max(9, G.base.accel) * 1.3, turnRate: Math.max(4, G.base.turnRate) } });
    u.isChief = !!chief; u.baby = !!baby; u.grow = baby ? 0 : 1; u.baseScale = sc * u.fit; u.tool = null; u.toolObj = null; u.order = null;
    u.name = chief ? 'Chief' : G.rng.pick(NAMES); u.carry = {}; u.carryN = 0; u.workT = 0; u.idleT = G.rng.range(0, 3); u.dance = false; u.healT = 0;
    u.maxHp = clamp(G.base.health * 0.9, 70, 240) * (chief ? 1.3 : 1) + G.outfit.health * 8; u.hp = u.maxHp;
    regear(u);
    return u;
  }
  function regear(u) { // crown and tool prop on a fresh rig
    const W = SP.tribalWorld, rig = u.rig, sp = u.design ? u.design.spine : G.design.spine, n = sp.length;
    if (u.crown) { u.crown.parent && u.crown.parent.remove(u.crown); u.crown = null; }
    if (u.isChief) { const cr = W.crown(); const r = sp[n - 1].r; cr.scale.setScalar(r * 1.3); cr.position.set(0, sp[n - 1].r * 0.95, 0.05); rig.vg[n - 1].add(cr); u.crown = cr; }
    if (u.toolObj) { u.toolObj.parent && u.toolObj.parent.remove(u.toolObj); u.toolObj = null; }
    if (u.tool) {
      const p = W.toolProp(u.tool), k = clamp(G.base.height / 2.2, 0.7, 2.2), vi = Math.max(0, n - 2), r = sp[vi].r;
      p.scale.setScalar(k * 0.9); p.position.set(r * 1.05, r * 0.2, 0.1 * k); p.rotation.set(0.25, 0, -0.35);
      if (u.tool === 'horn' || u.tool === 'didge') { p.position.set(0.2 * r, r * 0.5, r * 0.9); p.rotation.set(1.15, 0, 0); }
      rig.vg[vi].add(p); u.toolObj = p;
    }
  }
  function equip(u, toolId) { u.tool = toolId; regear(u); recount(); }
  function recount() { G.toolCount = {}; G.units.forEach((u) => { if (u.tool) G.toolCount[u.tool] = (G.toolCount[u.tool] || 0) + 1; }); }
  function rebuildRigs() {
    G.units.forEach((u) => {
      const pos = u.body.pos.clone(), hd = u.body.heading.clone();
      G.scene.remove(u.rig.root); u.rig.dispose();
      const rig = SP.creature.build(G.design, { lod: 'low', outline: true, shadows: true });
      u.fit = fitScale(rig.stats, MEMBER_DIM); u.baseScale = (u.isChief ? 1.3 : 1) * u.fit;
      rig.setScale(u.baseScale * (u.baby ? 0.5 + 0.5 * u.grow : 1)); G.scene.add(rig.root); u.rig = rig; u.design = G.design;
      u.body.stats = Object.assign({}, rig.stats, { topSpeed: Math.max(3.8, G.base.topSpeed) * 1.1, accel: Math.max(9, G.base.accel) * 1.3, turnRate: Math.max(4, G.base.turnRate) });
      u.body.radius = Math.max(0.28, rig.stats.radius * u.baseScale * (u.baby ? 0.5 + 0.5 * u.grow : 1) * 0.65); u.body.scale = rig.scale;
      const f = u.hp / u.maxHp; u.maxHp = clamp(G.base.health * 0.9, 70, 240) * (u.isChief ? 1.3 : 1) + G.outfit.health * 8; u.hp = u.maxHp * f;
      regear(u);
    });
  }

  function applySaved(s) {
    G.food = s.food; G.tier = s.tier || 1; G.stats = s.stats || G.stats; G.flags = s.flags || {};
    SP.tribalWorld.setHutTier(G.v.hut, G.tier);
    (s.huts || []).forEach((t) => { if (t) buildToolHut(t, true); });
    (s.rivals || []).forEach((rs, i) => {
      const r = G.rivals[i]; if (!r) return;
      r.attitude = rs.attitude; r.war = rs.war; r.status = rs.status; r.gifted = !!rs.gifted; r.performed = !!rs.performed; r.totemHp = rs.totemHp; r.hutHp = rs.hutHp;
      while (r.members.length > rs.members) removeEnt(r.members.pop());
      if (r.totemHp <= 0) r.totemObj.visible = false; if (r.hutHp <= 0) r.hutObj.visible = false;
      if (r.status === 'conquered') makeRuin(r, true);
    });
    for (let i = 0; i < (s.pets || 0); i++) { const sp = G.species.find((q) => q.relation === 'allied') || G.species[0]; const a = makeAnimal(sp, G.v.penPos.clone()); tameAnimal(a, true); }
  }

  // ================================================================== tools / buildings
  function freeSlot() { const n = TIER_SLOTS[G.tier - 1]; for (let i = 0; i < n; i++) if (!G.slots[i].tool) return G.slots[i]; return null; }
  function refreshTools() {
    const n = TIER_SLOTS[G.tier - 1];
    G.slots.forEach((s, i) => { s.marker.visible = !s.tool && i < n; });
    G.slotsFree = G.slots.filter((s, i) => !s.tool && i < n).length;
  }
  function buildToolHut(id, free) {
    const t = TOOL[id], slot = freeSlot();
    if (G.toolHuts[id]) return;
    if (!slot) { toast('No free hut slots. Upgrade your hut by dealing with rival tribes!', '🛖'); return; }
    if (!free) { if (G.food < t.cost) { toast('Need ' + t.cost + ' food for the ' + t.name, '🍓'); sfx('social_bad'); return; } G.food -= t.cost; }
    const obj = SP.tribalWorld.toolHut(t); place(obj, slot.pos, G.v.pos.clone().sub(slot.pos));
    slot.tool = id; slot.obj = obj; G.toolHuts[id] = slot;
    burst(slot.pos, 0xfde68a, 16, 2.2); sfx('build');
    if (!free) { toast(t.name + ' built! Select members and press ' + (TOOLS.indexOf(t) + 1) + ' to equip.', t.icon, 3200); G.flags.hut = true; }
    refreshTools();
  }
  function onToolButton(id) {
    if (!G.toolHuts[id]) { buildToolHut(id); return; }
    assignTool(id);
  }
  function assignTool(id) {
    const sel = G.selected.filter((u) => !u.baby && !u.dead);
    if (!sel.length) { toast('Select tribe members first (drag a box)', '🖱️'); return; }
    if (!G.toolHuts[id]) { toast('Build the ' + TOOL[id].name + ' hut first (' + TOOL[id].cost + ' food)', '🔨'); return; }
    sel.forEach((u) => { u.order = { t: 'fetch', tool: id, hut: G.toolHuts[id] }; u.carryN && 0; });
    G.activeTool = id; setTimeout(() => { if (G) G.activeTool = null; }, 600);
    sfx('place'); toast(sel.length + ' heading to the hut for ' + TOOL[id].icon, TOOL[id].icon, 1600);
  }

  // ================================================================== units
  function dmgOf(u) {
    const ab = u.rig.stats.abilities || {};
    let d = 5 + (ab.bite || 0) * 1.3 + (ab.strike || 0) * 1.3 + (ab.charge || 0) + G.outfit.attack * 3;
    if (u.tool === 'spear') d += 6; else if (u.tool === 'axe') d += 9; else if (u.tool === 'torch') d += 5;
    if (u.isChief) d *= 1.3;
    return d;
  }
  function reachOf(u) { return 2.3 + u.body.radius + (u.tool === 'spear' ? 1.8 : 0); }
  function capOf(u) { return u.tool === 'gather' ? 14 : 8; }
  function addCarry(u, type, n) { u.carry[type] = (u.carry[type] || 0) + n; u.carryN += n; }
  function deposit(u) {
    let gain = 0;
    for (const k in u.carry) { const n = u.carry[k]; if (!n) continue; const v = (FOODV[k] || 1) * n; gain += v; G.stats[k] = (G.stats[k] || 0) + n; }
    u.carry = {}; u.carryN = 0;
    if (gain > 0) { G.food += gain; popup(G.v.pilePos, '+' + Math.round(gain) + ' 🍓', 'pop-gold'); sfx('coin'); G.flags.deposited = true; }
  }
  function nearestEnemyOf(u, range) {
    let best = null, bd = range;
    const cand = [];
    G.rivals.forEach((r) => { if (r.status === 'conquered') return; r.members.forEach((m) => { if (!m.dead && (m.state === 'raid' || m.state === 'return' || (r.war && m.state === 'attack'))) cand.push(m); }); });
    G.animals.forEach((a) => { if (!a.dead && a.state === 'attack') cand.push(a); });
    for (const m of cand) { const d = flatDist(u.body.pos, m.body.pos); if (d < bd) { bd = d; best = m; } }
    return best;
  }
  function damage(target, amt, src) {
    if (target.dead) return;
    target.hp -= amt; setAct(target, 'hurt', 0.45);
    if (G.cam && target.vis !== false) popup(target.body.pos, '-' + Math.round(amt), target.kind === 'unit' ? 'pop-red' : 'pop-white');
    sfx('hit', { vol: 0.5 });
    burst(target.body.pos, target.kind === 'unit' ? 0xf43f5e : 0xfbbf24, 5, 1.5);
    SP.physics.impulse(target.body, _a.copy(target.body.pos).sub(src.body.pos).normalize().multiplyScalar(2));
    if (target.kind === 'animal' && !target.friendly) { if (target.sp.temper === 'aggressive' || target.sp.temper === 'territorial' || target.sp.diet === 'carnivore') { target.state = 'attack'; target.tgt = src; } else { target.state = 'flee'; target.fleeT = 6; target.from = src; } }
    if (target.kind === 'rival' && src.kind === 'unit') { const r = target.rival; if (r.status === 'neutral' && !r.war) declareWar(r, true); if (target.state !== 'raid' && target.state !== 'return' && (target.eng || r.war)) { target.state = 'attack'; target.tgt = src; } }
    if (target.hp <= 0) kill(target, src);
  }
  function kill(e, src) {
    e.dead = true; e.deadT = 0; e.goal = null; setAct(e, 'die');
    sfx('die', { vol: 0.6 });
    if (e.kind === 'animal') {
      G.stats.hunted++;
      G.drops.push(makeDrop('meat', e.meat, e.body.pos.clone()));
    } else if (e.kind === 'rival') {
      if (e.loot) G.drops.push(makeDrop('fruit', Math.round(e.loot / 2), e.body.pos.clone()));
      if (e.state === 'raid' || e.state === 'return') G.stats.raidsRepelled++;
    } else if (e.kind === 'unit') {
      if (e.isChief) { e.downT = 18; } else toast((e.name || 'A tribe member') + ' has fallen...', '💔');
      G.selected = G.selected.filter((x) => x !== e);
    }
  }
  function makeDrop(type, n, pos) {
    const obj = SP.tribalWorld.dropProp(type); place(obj, pos.clone().normalize().multiplyScalar(Math.max(G.planet.surfaceRadius(pos.clone().normalize()), G.planet.seaRadius)));
    return { type, n, pos: obj.position.clone(), obj, ttl: 90 };
  }

  function updateUnits(dt) {
    const cap = TIER_CAP[G.tier - 1];
    G.cap = cap;
    for (const u of G.units.slice()) {
      u.atkCd = Math.max(0, u.atkCd - dt);
      u.goal = null;
      if (u.dead) {
        u.deadT += dt;
        if (u.isChief) { u.downT -= dt; if (u.downT <= 0) { u.dead = false; u.hp = u.maxHp * 0.6; u.act = null; SP.physics.place(u.body, G.planet, G.v.pos.clone().normalize()); u.body.pos.copy(G.v.at(0, 5)); toast('The chieftain is back on their feet!', '👑'); } }
        else if (u.deadT > 2.4) { removeEnt(u); G.units.splice(G.units.indexOf(u), 1); recount(); }
        motion(u, dt); continue;
      }
      if (u.baby) {
        u.grow = Math.min(1, u.grow + dt * G.speed / BABY_TIME);
        u.rig.setScale(u.baseScale * (0.5 + 0.5 * u.grow)); u.body.radius = Math.max(0.28, u.rig.stats.radius * u.baseScale * (0.5 + 0.5 * u.grow) * 0.65); u.body.scale = u.rig.scale;
        if (u.grow >= 1) { u.baby = false; toast('A baby has grown up! 🎉', '👶'); sfx('levelup'); burst(u.body.pos, 0xfde047, 20, 3); popup(u.body.pos, 'Grown up!', 'pop-pink'); }
        wander(u, dt, G.v.firePos, 6);
        motion(u, dt); continue;
      }
      // regeneration / healing
      const nearFire = flatDist(u.body.pos, G.v.firePos) < 10;
      if (u.hp < u.maxHp) u.hp = Math.min(u.maxHp, u.hp + dt * (nearFire ? 3 : 0.4));
      if (u.tool === 'heal') {
        u.healT -= dt;
        if (u.healT <= 0) { u.healT = 1.5; let w = null, wf = 0.98; for (const o of G.units) { if (o.dead || flatDist(o.body.pos, u.body.pos) > 9) continue; const f = o.hp / o.maxHp; if (f < wf) { wf = f; w = o; } } if (w) { w.hp = Math.min(w.maxHp, w.hp + 14); popup(w.body.pos, '+14 💚', 'pop-green'); burst(w.body.pos, 0x4ade80, 6, 1.4); } }
      }
      const o = u.order;
      if (!o) { idleUnit(u, dt); motion(u, dt); continue; }
      orderStep(u, o, dt);
      motion(u, dt);
    }
    recount();
  }
  function wander(u, dt, center, rad) {
    u.idleT -= dt;
    if (u.idleT <= 0 || !u.wTarget) {
      u.idleT = G.rng.range(2.5, 6);
      const a = G.rng.range(0, 6.28), d = G.rng.range(1.5, rad);
      u.wTarget = G.v.at ? offsetNear(center, a, d) : center.clone();
    }
    if (u.wTarget && flatDist(u.body.pos, u.wTarget) > 0.8) go(u, u.wTarget, 0.35, 0.7);
  }
  function offsetNear(center, ang, d) { const up = center.clone().normalize(), b = basisAt(up); return groundPoint(center.clone().addScaledVector(b.e, Math.cos(ang) * d).addScaledVector(b.n, Math.sin(ang) * d)); }
  function idleUnit(u, dt) {
    // defend
    const foe = nearestEnemyOf(u, 13);
    if (foe && !u.baby) { u.order = { t: 'attack', tgt: foe, auto: true }; return; }
    if (u.carryN > 0) { u.order = { t: 'deposit' }; return; }
    // dance at the fire at night / sometimes in the day
    const d = flatDist(u.body.pos, G.v.firePos);
    if (G.night || u.dance) {
      if (d > 6) { go(u, offsetNear(G.v.firePos, u.idleT * 3 + u.name.length, 3.5), 0.5, 0.8); clearAct(u, 'dance'); }
      else { face(u, G.v.firePos); setAct(u, 'dance'); }
      u.idleT -= dt; if (u.idleT <= 0) { u.idleT = G.rng.range(8, 20); u.dance = G.rng.chance(0.7); }
      if (!G.night && u.idleT < 0.1) u.dance = false;
    } else {
      clearAct(u, 'dance'); wander(u, dt, G.v.firePos, 7);
      if (u.idleT < 0.05 && G.rng.chance(0.2)) u.dance = true;
    }
  }

  function orderStep(u, o, dt) {
    const b = u.body, pos = b.pos;
    clearAct(u, 'dance');
    switch (o.t) {
      case 'move': {
        go(u, o.pos, 1, 0.9);
        if (flatDist(pos, o.pos) < 1.2) u.order = null;
        break;
      }
      case 'fetch': {
        if (!o.hut) { u.order = null; break; }
        go(u, o.hut.pos, 1, 2.2);
        if (flatDist(pos, o.hut.pos) < 3.4) { equip(u, o.tool); u.order = null; popup(pos, TOOL[o.tool].icon, 'pop-white'); sfx('place'); burst(pos, 0xfde047, 8, 2); G.flags.equipped = true; }
        break;
      }
      case 'deposit': {
        go(u, G.v.pilePos, 1, 2.6);
        if (flatDist(pos, G.v.pilePos) < 3.8) { deposit(u); u.order = o.next || null; if (o.next && o.next.t === 'gather') { o.next.ph = 'work'; } }
        break;
      }
      case 'gather': { gatherStep(u, o, dt); break; }
      case 'fish': { fishStep(u, o, dt); break; }
      case 'nest': { nestStep(u, o, dt); break; }
      case 'pickup': {
        const d = o.drop;
        if (!d || d.gone) { u.order = u.carryN ? { t: 'deposit' } : null; break; }
        go(u, d.pos, 1, 1.2);
        if (flatDist(pos, d.pos) < 2.4) {
          addCarry(u, d.type === 'fruit' ? 'fruit' : d.type, d.n); d.gone = true; sfx('eat'); popup(pos, '+' + d.n, 'pop-gold');
          u.order = { t: 'deposit' };
        }
        break;
      }
      case 'attack': { attackStep(u, o, dt); break; }
      case 'hunt': { huntStep(u, o, dt); break; }
      case 'tame': {
        const a = o.animal;
        if (!a || a.dead || a.pet) { u.order = null; break; }
        go(u, a.body.pos, 0.8, 1.6);
        if (flatDist(pos, a.body.pos) < 3) {
          if (G.pets.length >= MAX_PETS) toast('The pen is full (' + MAX_PETS + ' pets)', '🐾');
          else if (G.food < PET_COST) toast('Taming costs ' + PET_COST + ' food', '🍓');
          else { G.food -= PET_COST; tameAnimal(a); popup(a.body.pos, 'Tamed! 🐾', 'pop-pink'); sfx('charm'); }
          u.order = null;
        }
        break;
      }
      case 'gift': {
        const r = o.rival; go(u, r.firePos, 1, 2.5);
        if (flatDist(pos, r.firePos) < 5.5) {
          giveGift(r); u.order = null; setAct(u, 'celebrate', 1.4);
        }
        break;
      }
      case 'perform': {
        const r = o.rival; if (r.status !== 'neutral') { u.order = null; break; }
        if (!o.spot) { const a = o.k * 0.9 + 0.4; o.spot = offsetNear(r.firePos, a, 6.5); }
        go(u, o.spot, 1, 1.3);
        if (flatDist(pos, o.spot) < 2) { o.ready = true; face(u, r.firePos); if (!G.session && !o.started) { /* session starts from updateSession */ } }
        break;
      }
    }
  }

  function gatherStep(u, o, dt) {
    const node = o.node, pos = u.body.pos;
    const kind = o.kind;
    const full = u.carryN >= capOf(u);
    if (o.ph === 'deposit' || full) {
      o.ph = 'deposit'; u.order = { t: 'deposit', next: o }; return;
    }
    if (!node.active || node.fruit <= 0) {
      // B-05: look for another node of the same kind - near the old one, wider, then around the village
      const ok = (n) => n.fruit > 0 && (kind === 'seaweed' ? n.type === 'seaweed' : n.type !== 'seaweed');
      const fl = G.planet.flora;
      const alt = fl.nearest(node.pos, 26, ok) || fl.nearest(node.pos, 60, ok) || fl.nearest(G.v.pilePos, 90, ok);
      if (alt) { o.node = alt; o.wait = 0; return; }
      // nothing left: drop off what we carry (and come back), otherwise wait by the bare bush for it to regrow
      if (u.carryN > 0) { u.order = { t: 'deposit', next: o }; return; }
      o.wait = (o.wait || 0) + dt; G.gatherWaitT = G.t;
      go(u, node.pos, 0.4, 3.5); clearAct(u, 'eat');
      if (o.wait > 45) { u.order = null; }
      return;
    }
    o.wait = 0;
    go(u, node.pos, 1, 1.6);
    if (flatDist(pos, node.pos) < 2.6) {
      face(u, node.pos); setAct(u, 'eat'); u.workT += dt;
      if (u.workT >= 1.1 / Math.sqrt(G.speed)) {
        u.workT = 0;
        const mult = (u.tool === 'gather' ? 2 : 1) * (1 + G.outfit.gather * 0.25) * Math.sqrt(G.speed);
        const want = Math.max(1, Math.round(mult)), got = G.planet.flora.take(node, want);
        if (got > 0) { addCarry(u, kind === 'seaweed' ? 'seaweed' : 'fruit', got); burst(node.pos, 0xef4444, 4, 1.4); sfx('eat', { vol: 0.5 }); }
      }
    } else clearAct(u, 'eat');
  }
  function fishStep(u, o, dt) {
    if (u.tool !== 'fish') { toast('Fishing needs a 🎣 spear: build the Fishing hut and equip it', '🎣'); u.order = null; return; }
    const sp = o.spot, pos = u.body.pos;
    if (u.carryN >= capOf(u)) { u.order = { t: 'deposit', next: o }; return; }
    go(u, sp.stand, 1, 1.0);
    if (flatDist(pos, sp.stand) < 1.8) {
      face(u, sp.pos); setAct(u, 'strike'); u.workT += dt;
      if (u.workT >= 2.2 / Math.sqrt(G.speed)) { u.workT = 0; const n = Math.max(1, Math.round((1 + G.outfit.gather * 0.2) * Math.sqrt(G.speed))); addCarry(u, 'fish', n); sfx('splash', { vol: 0.5 }); burst(sp.pos, 0xbae6fd, 8, 2); sp.jump = 0.6; }
    }
  }
  function nestStep(u, o, dt) {
    const n = o.nest, pos = u.body.pos;
    if (u.carryN >= capOf(u)) { u.order = { t: 'deposit', next: o }; return; }
    if (n.eggs <= 0) { u.order = u.carryN ? { t: 'deposit' } : null; return; }
    go(u, n.pos, 1, 1.6);
    if (flatDist(pos, n.pos) < 2.6) {
      face(u, n.pos); setAct(u, 'eat'); u.workT += dt;
      if (u.workT >= 1.4) { u.workT = 0; n.eggs--; addCarry(u, 'egg', 1); sfx('crunch', { vol: 0.5 }); n.sp.angry = 120; popup(n.pos, 'The ' + n.sp.name + ' are angry!', 'pop-red'); G.flags.nested = true; }
    }
  }
  function attackStep(u, o, dt) {
    const pos = u.body.pos;
    if (o.bld) { // totem / hut of a rival
      const r = o.bld.rival, part = o.bld.part;
      const hp = part === 'totem' ? r.totemHp : r.hutHp;
      if (r.status === 'conquered' || hp <= 0) {
        // switch to the other building, otherwise done
        if (part === 'totem' && r.hutHp > 0) { o.bld.part = 'hut'; return; }
        if (part === 'hut' && r.totemHp > 0) { o.bld.part = 'totem'; return; }
        u.order = null; return;
      }
      const target = part === 'totem' ? r.totemPos : r.hutPos;
      r.alarm = 25;                                          // the whole village turns out to defend
      // B-06: fight the defenders hitting us before smashing the buildings
      const foe = nearestDefender(u, r, 9);
      if (foe) {
        go(u, foe.body.pos, 1, reachOf(u) * 0.8); face(u, foe.body.pos);
        if (flatDist(pos, foe.body.pos) < reachOf(u) + foe.body.radius && u.atkCd <= 0) { u.atkCd = 0.9; setAct(u, u.tool ? 'strike' : 'bite', 0.5); damage(foe, dmgOf(u), u); }
        return;
      }
      go(u, target, 1, 2.8);
      const reach = reachOf(u) + (part === 'hut' ? 2 : 0.8);
      if (flatDist(pos, target) < reach + 1.0) {
        face(u, target);
        if (u.atkCd <= 0) {
          u.atkCd = 0.9; setAct(u, u.tool ? 'strike' : 'bite', 0.5);
          const mul = u.tool === 'axe' ? 1.5 : u.tool === 'torch' ? 1.2 : u.tool === 'spear' ? 0.8 : 0.5;
          const dm = dmgOf(u) * mul;
          if (part === 'totem') r.totemHp -= dm; else r.hutHp -= dm;
          if (!r.war) declareWar(r, true);
          sfx('hit', { vol: 0.5 }); burst(target, u.tool === 'torch' ? 0xf97316 : 0xd6a35c, 6, 2.4);
          if (u.tool === 'torch') burst(target, 0xfde047, 3, 1.2);
          if (r.totemHp <= 0 && r.totemObj.visible) { r.totemObj.visible = false; burst(r.totemPos, 0xef4444, 30, 4); popup(r.totemPos, 'Totem destroyed!', 'pop-red'); sfx('alarm', { vol: 0.5 }); }
          if (r.hutHp <= 0 && r.hutObj.visible) { r.hutObj.visible = false; burst(r.hutPos, 0xfbbf24, 36, 4); popup(r.hutPos, 'Hut destroyed!', 'pop-red'); sfx('alarm', { vol: 0.5 }); }
          if (r.totemHp <= 0 && r.hutHp <= 0) conquer(r);
        }
      }
      return;
    }
    const t = o.tgt;
    if (!t || t.dead || t.removed) { u.order = u.carryN ? { t: 'deposit' } : null; return; }
    if (o.auto && flatDist(pos, t.body.pos) > 24) { u.order = null; return; }
    go(u, t.body.pos, 1, reachOf(u) * 0.8);
    if (flatDist(pos, t.body.pos) < reachOf(u) + t.body.radius) {
      face(u, t.body.pos);
      if (u.atkCd <= 0) { u.atkCd = 0.9; setAct(u, u.tool ? 'strike' : 'bite', 0.5); damage(t, dmgOf(u) * (u.tool === 'torch' && t.kind === 'animal' ? 1.2 : 1), u); }
    }
  }
  function nearestDefender(u, r, range) {
    let best = null, bd = range;
    for (const m of r.members) { if (m.dead || m.state !== 'attack') continue; const d = flatDist(u.body.pos, m.body.pos); if (d < bd) { bd = d; best = m; } }
    return best;
  }
  function huntStep(u, o, dt) {
    const a = o.target, pos = u.body.pos;
    if (a.friendly || a.pet) { toast('They are friendly! Right-click again to tame them for ' + PET_COST + ' food.', '💚'); u.order = null; return; }
    if (a.dead || a.removed) {
      const d = G.drops.find((q) => !q.gone && q.pos.distanceTo(a.body.pos) < 4);
      u.order = d ? { t: 'pickup', drop: d } : (u.carryN ? { t: 'deposit' } : null); return;
    }
    go(u, a.body.pos, 1, reachOf(u) * 0.8);
    if (flatDist(pos, a.body.pos) < reachOf(u) + a.body.radius) {
      face(u, a.body.pos);
      if (u.atkCd <= 0) { u.atkCd = 0.9; setAct(u, u.tool ? 'strike' : 'bite', 0.5); damage(a, dmgOf(u), u); }
    }
  }

  // ================================================================== animals / drops / pets
  function updateAnimals(dt) {
    const units = G.units;
    for (const a of G.animals.slice()) {
      a.goal = null; a.atkCd = Math.max(0, a.atkCd - dt);
      if (a.dead) { a.deadT += dt; if (a.deadT > 2.6) { removeEnt(a); G.animals.splice(G.animals.indexOf(a), 1); } motion(a, dt); continue; }
      if (a.pet) { updatePetAnimal(a, dt); motion(a, dt); continue; }
      a.wT -= dt;
      // threat check
      let near = null, nd = 1e9;
      for (const u of units) { if (u.dead) continue; const d = flatDist(a.body.pos, u.body.pos); if (d < nd) { nd = d; near = u; } }
      if (a.friendly) {
        if (near && nd < 14 && nd > 4 && a.sp.relation === 'allied' && a.wT < 0) { /* curious */ go(a, near.body.pos, 0.35, 5); }
        else idleAnimal(a, dt);
      } else if (a.state === 'attack') {
        const t = a.tgt;
        if (!t || t.dead || flatDist(a.body.pos, t.body.pos) > 30) { a.state = 'wander'; }
        else { go(a, t.body.pos, 1, a.body.radius + t.body.radius); if (flatDist(a.body.pos, t.body.pos) < a.body.radius + t.body.radius + 1.6 && a.atkCd <= 0) { a.atkCd = 1.3; setAct(a, 'bite', 0.5); if (t.kind === 'unit') damage(t, a.dmg, a); } }
      } else if (a.state === 'flee') {
        a.fleeT -= dt; if (a.fleeT <= 0 || !a.from) a.state = 'wander';
        else { _c.copy(a.body.pos).sub(a.from.body.pos).normalize().multiplyScalar(14).add(a.body.pos); go(a, _c, 1, 1); }
      } else {
        const hostileNow = a.sp.angry > 0 || (a.sp.diet === 'carnivore' && (a.sp.temper === 'aggressive'));
        const range = hostileNow ? 11 : a.sp.temper === 'skittish' ? 12 : a.sp.temper === 'territorial' ? 6 : 0;
        if (near && nd < range) {
          if (hostileNow || a.sp.temper === 'territorial') { a.state = 'attack'; a.tgt = near; }
          else { a.state = 'flee'; a.fleeT = 4; a.from = near; }
        } else idleAnimal(a, dt);
      }
      if (a.sp.angry > 0) a.sp.angry = Math.max(0, a.sp.angry - dt / (G.animals.length || 1));
      motion(a, dt);
    }
    // keep the wilds populated
    G.respawnT = (G.respawnT || 0) - dt;
    if (G.respawnT <= 0) { G.respawnT = 14; if (G.animals.filter((a) => !a.dead && !a.pet).length < 11 && G.spawnAnimalNear) G.spawnAnimalNear(G.cam.focusDir.clone(), 55, 110); }
  }
  function idleAnimal(a, dt) {
    if (a.wT <= 0) { a.wT = G.rng.range(3, 8); const ang = G.rng.range(0, 6.28); a.wTarget = offsetNear(a.home, ang, G.rng.range(2, 14)); if (G.planet.isWater(a.wTarget.clone().normalize())) a.wTarget = a.home.clone(); a.graze = G.rng.chance(0.4); }
    if (a.wTarget && flatDist(a.body.pos, a.wTarget) > 1) { go(a, a.wTarget, 0.4, 1); clearAct(a, 'eat'); }
    else if (a.graze) setAct(a, 'eat');
  }
  function tameAnimal(a, silent) {
    a.pet = true; a.friendly = true; a.state = 'pet'; a.home = G.v.penPos.clone(); a.eggT = G.rng.range(8, 20);
    G.pets.push(a); if (!silent) G.flags.tamed = true;
  }
  function updatePetAnimal(a, dt) {
    const pen = G.v.penPos, d = flatDist(a.body.pos, pen);
    a.wT -= dt;
    if (d > G.v.penR - 1) go(a, pen, 0.6, 2);
    else { if (a.wT <= 0) { a.wT = G.rng.range(2, 6); a.wTarget = offsetNear(pen, G.rng.range(0, 6.28), G.rng.range(0.5, 3.6)); } if (a.wTarget && flatDist(a.body.pos, a.wTarget) > 0.8) go(a, a.wTarget, 0.35, 0.8); }
    a.eggT -= dt * G.speed;
    if (a.eggT <= 0) {
      a.eggT = 28; if (G.drops.filter((q) => q.type === 'egg' && !q.gone).length < 4) { const p = offsetNear(pen, G.rng.range(0, 6.28), G.rng.range(1, 3.5)); G.drops.push(makeDrop('egg', 1, p)); popup(a.body.pos, '🥚', 'pop-white'); sfx('pose', { vol: 0.5 }); }
    }
  }
  function updateDrops(dt) {
    for (const d of G.drops.slice()) {
      d.ttl -= dt;
      if (d.gone || d.ttl <= 0) { G.scene.remove(d.obj); d.gone = true; G.drops.splice(G.drops.indexOf(d), 1); continue; }
      d.obj.children[0] && (d.obj.rotation.y += dt);
      if (d.ttl < 8) d.obj.visible = Math.floor(d.ttl * 4) % 2 === 0;
    }
  }
  function updateProps(dt) {
    const t = G.t;
    G.pile.setAmount(G.food);
    for (const f of G.fishSpots) {
      f.obj.userData.r.scale.setScalar(0.8 + 0.25 * Math.sin(t * 2 + f.ph)); f.obj.userData.r2.scale.setScalar(1.3 + 0.3 * Math.sin(t * 1.4 + f.ph * 2));
      if (f.jump > 0) { f.jump -= dt; const k = 1 - f.jump / 0.6; f.obj.userData.fish.position.y = Math.sin(k * Math.PI) * 1.4; f.obj.userData.fish.rotation.x = -1 + k * 2; f.obj.userData.fish.visible = true; } else f.obj.userData.fish.visible = false;
      f.obj.position.copy(f.pos); // keep on water
    }
    for (const s of G.slots) if (s.marker.visible) { const k = 1 + 0.12 * Math.sin(t * 3 + s.i); s.marker.children[0].scale.setScalar(1.9 * k); s.marker.userData.sprite && (s.marker.children[1].position.y = 1.3 + 0.15 * Math.sin(t * 3 + s.i)); }
    for (const n of G.nests) { n.t += dt; if (n.eggs < 3 && n.t > 40) { n.t = 0; n.eggs++; } n.obj.userData.eggs.forEach((e, i) => { e.visible = i < n.eggs; }); }
    for (const r of G.rivals) { if (r.banner.userData.flag) r.banner.userData.flag.rotation.y = Math.sin(t * 3 + r.i) * 0.25; r.fire.update(t, G.nightK); }
    if (G.hintT > 0) G.hintT -= dt;
  }

  // ================================================================== rivals
  function declareWar(r, byPlayer) {
    if (r.war || r.status !== 'neutral') return;
    r.war = true; r.attitude = Math.min(r.attitude, 12);
    if (byPlayer) r.raidT = Math.min(r.raidT, 35 + r.i * 6);       // provoked tribes retaliate sooner
    if (byPlayer) { toast('The ' + r.name + ' are now hostile!', '😠', 3000); sfx('alarm', { vol: 0.5 }); }
    G.flags.rivalSeen = true;
  }
  function giveGift(r) {
    if (r.status !== 'neutral') return;
    const gain = 18 * G.fm + G.outfit.social * 1.5;
    r.gifted = true; addAttitude(r, gain); burst(r.firePos, 0xf9a8d4, 14, 2.5); popup(r.firePos, '🎁 +' + Math.round(gain), 'pop-pink'); sfx('social_ok'); G.flags.rivalSeen = true;
  }
  function addAttitude(r, n) {
    if (r.status !== 'neutral') return;
    // B-06: the later tribes (3-5) are only won over by BOTH a gift and a performance; one alone stalls at 70
    const need2 = r.i >= 2 && !(r.gifted && r.performed);
    const before = r.attitude;
    r.attitude = clamp(r.attitude + n, 0, need2 ? 70 : 100);
    if (need2 && before < 70 && r.attitude >= 70) { toast('The ' + r.name + ' want both a 🎁 gift and 🎵 music from you.', '🤔', 3400); }
    else if (need2 && before >= 70 && n > 0 && r.attitude >= 70) { toast('The ' + r.name + ' are warm, but want ' + (r.gifted ? '🎵 a performance' : '🎁 a gift') + ' too.', '🤔', 2600); }
    if (r.war && r.attitude >= 35) { r.war = false; toast('The ' + r.name + ' calm down.', '🕊️'); r.members.forEach((m) => { if (m.state === 'attack') m.state = 'idle'; }); }
    if (r.attitude >= 100) ally(r);
  }
  function ally(r) {
    r.status = 'allied'; r.war = false; r.attitude = 100;
    burst(r.firePos, 0x86efac, 40, 4); popup(r.firePos, 'ALLIED! 🤝', 'pop-green'); sfx('win'); toast('The ' + r.name + ' are now your allies!', '🤝', 3500);
    r.members.forEach((m) => { if (m.state === 'attack' || m.state === 'raid') m.state = 'idle'; });
    rivalDealt(r);
  }
  function conquer(r) {
    r.status = 'conquered'; r.war = false;
    burst(r.pos, 0xf43f5e, 50, 5); popup(r.pos, 'CONQUERED! ⚔️', 'pop-red'); sfx('win'); toast('The ' + r.name + ' have been conquered!', '⚔️', 3500);
    r.members.forEach((m) => { if (!m.dead) { m.state = 'flee'; m.fleeFrom = r.pos.clone(); m.fleeT = 6; } });
    makeRuin(r);
    G.units.forEach((u) => { if (u.order && u.order.bld && u.order.bld.rival === r) u.order = null; });
    rivalDealt(r);
  }
  function makeRuin(r, quiet) {
    r.totemObj.visible = false; r.hutObj.visible = false; r.banner.visible = false;
    if (!r.ruin) { r.ruin = SP.tribalWorld.tombstone(); place(r.ruin, r.pos); }
    if (quiet) r.members.forEach((m) => { removeEnt(m); }), r.members.length = 0;
  }
  function dealtCount() { return G.rivals.filter((r) => r.status === 'allied' || r.status === 'conquered').length; }
  function rivalDealt(r) {
    const n = dealtCount();
    if ((n === 1 && G.tier < 2) || (n === 3 && G.tier < 3)) {
      G.tier = n === 1 ? 2 : 3; SP.tribalWorld.setHutTier(G.v.hut, G.tier); refreshTools();
      SP.ui.banner('Hut upgraded! (tier ' + G.tier + ')', '+4 tribe size and more tool-hut slots', 3200); sfx('levelup');
      burst(G.v.pos, 0xfde047, 40, 5);
    }
    G.flags.rivalSeen = true;
  }
  function checkWin() {
    if (G.finished) return;
    if (dealtCount() >= 5) {
      G.finishT = (G.finishT || 0) + 0.016;
      G.finished = true;
      G.units.forEach((u) => { if (!u.dead) { u.order = null; u.dance = true; setAct(u, 'celebrate'); } });
      writeTribe();
      const allied = G.rivals.filter((r) => r.status === 'allied').length, conq = G.rivals.filter((r) => r.status === 'conquered').length;
      const card = allied >= 4 ? 'friendly' : conq >= 4 ? 'aggressive' : 'industrious';
      G.c.tribe.card = card;
      setTimeout(() => {
        if (!G) return;
        SP.game.completeStage(card, [
          '🤝 ' + allied + ' tribes allied, ⚔️ ' + conq + ' conquered',
          '👥 Tribe size: ' + G.units.length + ' (hut tier ' + G.tier + ')',
          '🛠️ ' + Object.keys(G.toolHuts).length + ' tool huts built, 🐾 ' + G.pets.length + ' pets',
          '🍓 Food stored: ' + Math.floor(G.food),
          card === 'friendly' ? 'Your people are known for friendship and song.' : card === 'aggressive' ? 'Your warriors are feared across the land.' : 'Your tribe thrives on hard work and balance.'
        ]);
      }, 2200);
    }
  }
  function writeTribe() {
    const c = G.c;
    c.tribe = {
      food: Math.floor(G.food), members: G.units.length, cap: TIER_CAP[G.tier - 1], tier: G.tier, tools: Object.keys(G.toolHuts), pets: G.pets.length, outfit: G.outfit,
      allied: G.rivals.filter((r) => r.status === 'allied').length, conquered: G.rivals.filter((r) => r.status === 'conquered').length,
      rivals: G.rivals.map((r) => ({ name: r.name, status: r.status, size: r.size, kind: r.kind, dir: [r.dir.x, r.dir.y, r.dir.z].map((x) => +x.toFixed(4)) })),
      card: c.tribe && c.tribe.card || null, stats: G.stats
    };
    c.rivalSites = G.rivals.map((r) => [r.dir.x, r.dir.y, r.dir.z].map((x) => +x.toFixed(4)));
    if (c.stats) c.stats.allies = (c.stats.allies || 0);
  }

  function updateRivals(dt) {
    const cam = G.cam;
    for (const r of G.rivals) {
      r.active = flatDist(r.pos, cam.focusPos) < G.showR + 60 || r.alarm > 0 || G.units.some((u) => !u.dead && flatDist(u.body.pos, r.pos) < 70) || r.members.some((m) => m.state === 'raid' || m.state === 'return' || m.state === 'attack' || m.state === 'flee');
      r.perfT = Math.max(0, r.perfT - dt); r.alarm = Math.max(0, (r.alarm || 0) - dt);
      if (r.status === 'allied') { r.trib += dt; if (r.trib > 22) { r.trib = 0; G.food += 6; popup(r.hutPos, '🎁 +6', 'pop-green'); } }
      if (r.status === 'neutral' && r.war && G.t > 75) {
        r.raidT -= dt;
        if (r.raidT <= 0) { r.raidT = 65 + (10 - r.size) * 4 + G.rng.range(0, 25); startRaid(r); }
      }
      for (const m of r.members.slice()) {
        m.goal = null; m.atkCd = Math.max(0, m.atkCd - dt);
        if (m.dead) { m.deadT += dt; if (m.deadT > 2.4) { removeEnt(m); r.members.splice(r.members.indexOf(m), 1); } motion(m, dt); continue; }
        if (!r.active) { m.rig.root.visible = false; continue; }
        rivalMember(r, m, dt);
        motion(m, dt);
      }
      if (r.status === 'conquered' && r.members.length && r.members.every((m) => m.dead || m.removed)) r.members.length = 0;
    }
  }
  function startRaid(r) {
    const idle = r.members.filter((m) => !m.dead && m.state === 'idle');
    const k = Math.min(idle.length, Math.max(1, Math.ceil(r.size / 3)));
    if (!k) return;
    for (let i = 0; i < k; i++) { idle[i].state = 'raid'; idle[i].loot = 0; }
    toast('Raiders from the ' + r.name + ' are coming for your food!', '⚠️', 3800); sfx('alarm');
    G.alerts.push({ t: 12, r });
    G.hint = '⚠️ Raiders approaching! Defend the food pile.'; G.hintT = 10;
  }
  function rivalMember(r, m, dt) {
    const b = m.body;
    if (m.state === 'flee') {
      m.fleeT -= dt; _c.copy(b.pos).sub(m.fleeFrom || r.pos).normalize().multiplyScalar(30).add(b.pos); go(m, _c, 1, 1);
      if (m.fleeT <= 0) { removeEnt(m); r.members.splice(r.members.indexOf(m), 1); } return;
    }
    if (m.state === 'raid') {
      const foe = nearestPlayer(m, 6);
      if (foe && m.hp > 0 && G.units.some((u) => !u.dead && flatDist(u.body.pos, m.body.pos) < 6)) { meleeAI(m, foe, 4 + r.size * 0.2); }
      else {
        go(m, G.v.pilePos, 1, 2.4);
        if (flatDist(b.pos, G.v.pilePos) < 3.6) { const take = Math.min(G.food, 12); G.food -= take; m.loot = take; G.stats.stolen += take; m.state = 'return'; popup(G.v.pilePos, '-' + Math.round(take) + ' 🍓 stolen!', 'pop-red'); sfx('hurt', { vol: 0.5 }); }
      }
      return;
    }
    if (m.state === 'return') {
      go(m, r.firePos, 1, 3);
      if (flatDist(b.pos, r.firePos) < 4.5) { m.state = 'idle'; m.loot = 0; }
      return;
    }
    if (m.state === 'attack') {
      const t = m.tgt;
      if (!t || t.dead || flatDist(b.pos, r.pos) > 60 || r.status !== 'neutral' || !r.war) { m.state = 'idle'; return; }
      meleeAI(m, t, m.dmg); return;
    }
    // idle: defend if war (everyone joins in while the village is under attack - B-06)
    if (r.war && r.status === 'neutral' && (m.eng || r.alarm > 0)) {
      let bd = r.alarm > 0 ? 24 : 15, bu = null;
      for (const u of G.units) { if (u.dead || u.baby) continue; const d = flatDist(u.body.pos, m.body.pos); if (d < bd && flatDist(u.body.pos, r.pos) < 45) { bd = d; bu = u; } }
      if (bu) { m.state = 'attack'; m.tgt = bu; return; }
    }
    m.wT -= dt;
    const dance = G.nightK > 0.5 || r.status === 'allied';
    if (dance && flatDist(b.pos, r.firePos) < 7) { face(m, r.firePos); if (flatDist(b.pos, r.firePos) > 4.5) go(m, r.firePos, 0.4, 3); setAct(m, 'dance'); return; }
    clearAct(m, 'dance');
    if (m.wT <= 0) { m.wT = G.rng.range(3, 7); m.wTarget = offsetNear(r.firePos, G.rng.range(0, 6.28), G.rng.range(2, 8)); }
    if (m.wTarget && flatDist(b.pos, m.wTarget) > 0.9) go(m, m.wTarget, 0.35, 0.8);
  }
  function nearestPlayer(m, range) { let best = null, bd = range; for (const u of G.units) { if (u.dead || u.baby) continue; const d = flatDist(u.body.pos, m.body.pos); if (d < bd) { bd = d; best = u; } } return best; }
  function meleeAI(m, t, dmg) {
    go(m, t.body.pos, 1, m.body.radius + t.body.radius);
    if (flatDist(m.body.pos, t.body.pos) < m.body.radius + t.body.radius + 1.8 && m.atkCd <= 0) { m.atkCd = 1.3; setAct(m, 'bite', 0.5); damage(t, dmg, m); }
  }

  // ================================================================== performances
  function startPerformance(r) {
    const perf = G.units.filter((u) => !u.dead && !u.baby && SOCIAL.indexOf(u.tool) >= 0);
    let sel = G.selected.filter((u) => perf.indexOf(u) >= 0);
    if (!sel.length) sel = perf;
    if (!sel.length) { toast('Equip 📯 horn, 🎶 maracas or 🎺 didgeridoo first (build a social hut, select members, press 7-9).', '🎵', 4200); return; }
    if (r.status !== 'neutral') return;
    sel.forEach((u, k) => { u.order = { t: 'perform', rival: r, k, spot: null, ready: false }; });
    toast(sel.length + ' musician' + (sel.length > 1 ? 's' : '') + ' heading to the ' + r.name, '🎵', 2000);
    G.flags.rivalSeen = true; sfx('sing', { vol: 0.5 });
  }
  function updateSession(dt) {
    const s = G.session;
    if (!s) {
      // look for a group of ready performers
      for (const r of G.rivals) {
        if (r.status !== 'neutral' || r.perfT > 0) continue;
        const ready = G.units.filter((u) => u.order && u.order.t === 'perform' && u.order.rival === r && u.order.ready);
        if (!ready.length) continue;
        r.waitT = (r.waitT || 0) + dt;
        const total = G.units.filter((u) => u.order && u.order.t === 'perform' && u.order.rival === r).length;
        if (ready.length >= total || r.waitT > 4) { r.waitT = 0; beginSession(r, ready); break; }
      }
      return;
    }
    if (s.game) s.game.update(dt);
    s.units.forEach((u) => { if (!u.dead && u.order && u.order.t === 'perform') { u.goal = null; face(u, s.r.firePos); setAct(u, u.tool === 'maracas' ? 'dance' : 'sing'); } });
    // rival members gather around and dance
    s.r.members.forEach((m) => { if (!m.dead && m.state === 'idle') { face(m, s.r.firePos); setAct(m, 'dance'); } });
  }
  function beginSession(r, units) {
    const lanes = []; const have = {};
    units.forEach((u) => { have[u.tool] = (have[u.tool] || 0) + 1; });
    SOCIAL.forEach((id, i) => { if (have[id]) lanes.push({ id, icon: TOOL[id].icon, key: String(lanes.length + 1) }); });
    const wantedHere = !!have[r.wanted];
    const sess = G.session = { r, units, lanes, game: null, wantedHere, prevFocus: G.cam.focusDir.clone() };
    G.cam.focusDir.copy(r.dir);
    sess.game = SP.tribalUI.rhythm({
      lanes, wanted: r.wanted, wantedIcon: TOOL[r.wanted].icon, rivalName: r.name, seed: (r.i + 1) * 977 + ((G.t * 10) | 0), count: 12 + Math.min(4, units.length),
      onDone: (res) => endSession(res),
    });
    sfx('sing');
  }
  function endSession(res) {
    const s = G.session; if (!s) return; G.session = null;
    const r = s.r;
    // B-14: go back to where the player was looking (unless they already moved the camera elsewhere)
    if (s.prevFocus && G.cam.focusDir.angleTo(r.dir) * G.planet.radius < 25) G.cam.focusDir.copy(s.prevFocus);
    const social = G.outfit.social;
    let gain = res.score * 36 * (s.wantedHere ? 1.7 : 0.7) + social * 3 * res.score + s.units.length * 2 * res.score;
    gain = Math.round(gain * G.fm);
    r.perfT = 18;
    if (res.score > 0.2) r.performed = true;
    addAttitude(r, gain);
    popup(r.firePos, (gain >= 25 ? '🎶 ' : '🎵 ') + '+' + gain, 'pop-pink'); burst(r.firePos, 0xf9a8d4, 24, 3.5);
    SP.ui.toast((s.wantedHere ? '' : 'They wanted a ' + TOOL[r.wanted].icon + '! ') + 'Performance score ' + Math.round(res.score * 100) + '% (' + res.perfect + ' perfect)', res.score > 0.6 ? '🎉' : '🎵', 3200);
    s.units.forEach((u) => { if (u.order && u.order.t === 'perform') u.order = null; clearAct(u); setAct(u, 'celebrate', 1.2); });
    s.r.members.forEach((m) => { clearAct(m, 'dance'); });
    sfx(res.score > 0.5 ? 'win' : 'social_bad', { vol: 0.6 });
  }

  // ================================================================== player actions
  function newBaby() {
    if (G.units.length >= TIER_CAP[G.tier - 1]) { toast('Tribe is full (' + TIER_CAP[G.tier - 1] + '). Upgrade the hut by dealing with rivals.', '🛖'); sfx('social_bad'); return; }
    if (G.food < BABY_COST) { toast('A baby costs ' + BABY_COST + ' food', '🍓'); sfx('social_bad'); return; }
    G.food -= BABY_COST; G.stats.babies++;
    const u = makeUnit(G.v.at(2, 3.5), false, true); G.units.push(u);
    sfx('charm'); burst(u.body.pos, 0xf9a8d4, 14, 2.4); popup(u.body.pos, 'A baby is born! 👶', 'pop-pink'); G.flags.baby = true;
  }
  function openOutfit() {
    if (SP.game.editorOpen) return;
    SP.game.openEditor({ mode: 'outfit', design: G.design, budget: Math.floor(G.food), currency: 'Food', unlocked: 'all', title: 'Tribal Outfitter' }).then((res) => {
      if (!res || !G || !res.design) return;
      G.food = Math.max(0, G.food - (res.spent || 0));
      G.design = res.design; G.c.design = res.design;
      updateOutfitStats(); rebuildRigs();
      toast('Your tribe is looking sharp! Bonuses: 🎵' + G.outfit.social + ' ⚔️' + G.outfit.attack + ' ❤️' + G.outfit.health + ' 🧺' + G.outfit.gather, '🎩', 3800);
      // rival members keep their own designs
    });
  }
  function selectAll() { G.selected = G.units.filter((u) => !u.dead); sfx('click'); }
  function homeCam() { G.cam.focusDir.copy(G.homeDir); }

  function onRivalGift(i) {
    const r = G.rivals[i]; if (r.status !== 'neutral') return;
    if (G.food < GIFT_COST) { toast('A gift costs ' + GIFT_COST + ' food', '🍓'); sfx('social_bad'); return; }
    let u = G.selected.find((x) => !x.dead && !x.baby);
    // B-09: otherwise the nearest grown-up (idle ones preferred); a busy gatherer drops its order for the gift
    if (!u) { let bd = 1e9; G.units.forEach((x) => { if (x.dead || x.baby) return; const d = flatDist(x.body.pos, r.firePos) + (x.order && x.order.t !== 'gift' && x.order.t !== 'move' ? 25 : 0); if (d < bd) { bd = d; u = x; } }); }
    if (!u) { toast('Nobody is free to carry the gift', '🙁'); return; }
    G.food -= GIFT_COST; u.order = { t: 'gift', rival: r }; toast('A gift is on its way to the ' + r.name, '🎁', 2000); sfx('place');
  }
  function onRivalRaid(i) {
    const r = G.rivals[i]; if (r.status !== 'neutral') return;
    let sel = G.selected.filter((u) => !u.dead && !u.baby);
    if (!sel.length) sel = G.units.filter((u) => !u.dead && !u.baby && ['spear', 'axe', 'torch'].indexOf(u.tool) >= 0);
    if (!sel.length) sel = G.units.filter((u) => !u.dead && !u.baby);
    if (!sel.length) return;
    declareWar(r, true);
    sel.forEach((u) => { u.order = { t: 'attack', bld: { rival: r, part: r.totemHp > 0 ? 'totem' : 'hut' } }; });
    toast(sel.length + ' warriors march on the ' + r.name + '!', '⚔️', 2400); G.flags.rivalSeen = true;
  }
  function selectRival(i) {
    G.selRival = G.selRival === i ? -1 : i; G.flags.rivalSeen = true;
    if (G.selRival >= 0) G.cam.focusDir.copy(G.rivals[i].dir);
  }

  // ================================================================== input
  function hookInput() {
    const I = SP.input, ui = SP.ui, keys = G.keys;
    G.boxEl = G.ui.box;
    let sx = 0, sy = 0, down = false, dragging = false, lastClick = { t: 0, u: null };
    const blocked = () => (SP.game && (SP.game.paused || SP.game.editorOpen)) || ui.modalCount() > 0;
    // B-15: edge-pan only after a real mouse move and never over the HUD
    G.mouseMoved = false;
    keys.push(I.on('mousemove', (e) => { if (e.pointerType === 'mouse' && (e.movementX || e.movementY)) G.mouseMoved = true; }));
    // B-07: one-finger drag pans, pinch zooms (rts_touch.js); a tap selects or - with a selection - gives the context order
    if (SP.rtsTouch) keys.push(SP.rtsTouch.attach(G.cam));
    keys.push(I.on('mousedown', (e) => {
      if (e.pointerType === 'touch') return;
      if (e.button !== 0 || blocked() || I.pointerOverUI()) return;
      down = true; dragging = false; sx = e.clientX; sy = e.clientY;
    }));
    keys.push(I.on('mousemove', (e) => {
      if (!down) return;
      if (!dragging && Math.hypot(e.clientX - sx, e.clientY - sy) > 7) dragging = true;
      if (dragging) { const b = G.ui.box; b.style.display = 'block'; b.style.left = Math.min(sx, e.clientX) + 'px'; b.style.top = Math.min(sy, e.clientY) + 'px'; b.style.width = Math.abs(e.clientX - sx) + 'px'; b.style.height = Math.abs(e.clientY - sy) + 'px'; }
    }));
    keys.push(I.on('mouseup', (e) => {
      if (e.button !== 0 || !down) return;
      down = false; G.ui.box.style.display = 'none';
      if (dragging) { dragging = false; boxSelect(sx, sy, e.clientX, e.clientY, e.shiftKey); }
    }));
    keys.push(I.on('click', (e) => {
      if (blocked()) return;
      const touch = e.pointerType === 'touch';
      if (touch && SP.rtsTouch && SP.rtsTouch.suppress()) return;       // that was a pan / pinch
      G.touchScale = touch ? 1.6 : 1;
      const hit = pickAt(e.clientX, e.clientY, 'select');
      G.touchScale = 1;
      if (touch) {
        if (hit && hit.type === 'unit') {
          const now = performance.now();
          if (lastClick.u === hit.ent && now - lastClick.t < 450) { G.selected = G.units.filter((u) => !u.dead && (hit.ent.tool ? u.tool === hit.ent.tool : !u.tool && !u.baby)); }
          else if (G.selected.length === 1 && G.selected[0] === hit.ent) G.selected = [];
          else if (G.selected.length && e.shiftKey) { /* n/a on touch */ }
          else G.selected = [hit.ent];
          lastClick = { t: now, u: hit.ent }; sfx('click'); return;
        }
        if (hit && hit.type === 'rival' && !G.selected.some((u) => !u.dead && !u.baby)) { selectRival(hit.rival.i); return; }
        if (G.selected.some((u) => !u.dead && !u.baby)) { G.touchScale = 1.6; issueOrder(e.clientX, e.clientY); G.touchScale = 1; }
        return;
      }
      if (hit && hit.type === 'unit') {
        const now = performance.now();
        if (lastClick.u === hit.ent && now - lastClick.t < 380) { // double click: all of a type
          const same = G.units.filter((u) => !u.dead && (hit.ent.tool ? u.tool === hit.ent.tool : !u.tool && !u.baby));
          G.selected = same; sfx('click');
        } else if (e.shiftKey) { if (G.selected.indexOf(hit.ent) < 0) G.selected.push(hit.ent); else G.selected.splice(G.selected.indexOf(hit.ent), 1); }
        else G.selected = [hit.ent];
        lastClick = { t: now, u: hit.ent }; sfx('click');
      } else if (hit && hit.type === 'rival') { selectRival(hit.rival.i); }
      else if (!e.shiftKey) { G.selected = []; }
    }));
    keys.push(I.on('rightclick', (e) => {
      if (blocked()) return;
      issueOrder(e.clientX, e.clientY);
    }));
    keys.push(I.on('keydown', (e) => {
      if (blocked() || e.repeat) return;
      const c = e.code;
      if (G.session && G.session.game) {
        const idx = c === 'Digit1' || c === 'KeyZ' ? 0 : c === 'Digit2' || c === 'KeyX' ? 1 : c === 'Digit3' || c === 'KeyC' ? 2 : -1;
        if (idx >= 0 && idx < G.session.lanes.length) { G.session.game.press(idx); return; }
        // B-04: while the band is playing, number / Z X C keys never fall through to hut building
        if (c.indexOf('Digit') === 0 || c === 'KeyZ' || c === 'KeyX' || c === 'KeyC') return;
      }
      if (c.indexOf('Digit') === 0) { const n = +c.slice(5); if (n === 0) { G.selected.forEach((u) => { if (u.tool) { u.tool = null; regear(u); } }); recount(); sfx('click'); } else if (TOOLS[n - 1]) onToolButton(TOOLS[n - 1].id); }
      else if (c === 'KeyB') newBaby();
      else if (c === 'KeyO') openOutfit();
      else if (c === 'Space') { homeCam(); e.preventDefault && 0; }
      else if (c === 'KeyA' && (e.ctrlKey || e.metaKey)) { selectAll(); e.preventDefault(); }
    }));
  }

  function project(pos, out) { out.copy(pos).project(G.cam.camera); return out.z < 1 && out.z > -1; }
  const _p = new V3();
  function scr(pos) { if (!project(pos, _p)) return null; return { x: (_p.x * 0.5 + 0.5) * window.innerWidth, y: (-_p.y * 0.5 + 0.5) * window.innerHeight }; }
  function boxSelect(x0, y0, x1, y1, add) {
    const minx = Math.min(x0, x1), maxx = Math.max(x0, x1), miny = Math.min(y0, y1), maxy = Math.max(y0, y1);
    const res = [];
    for (const u of G.units) { if (u.dead) continue; _a.copy(u.body.pos).addScaledVector(u.body.up, 1.2); const s = scr(_a); if (s && s.x >= minx && s.x <= maxx && s.y >= miny && s.y <= maxy) res.push(u); }
    G.selected = add ? G.selected.concat(res.filter((u) => G.selected.indexOf(u) < 0)) : res;
    if (res.length) sfx('click');
  }
  function groundPick(x, y) {
    const ndc = new THREE.Vector2(x / window.innerWidth * 2 - 1, -(y / window.innerHeight) * 2 + 1);
    const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, G.cam.camera);
    const o = ray.ray.origin, d = ray.ray.direction;
    let r = G.planet.radius + 1, p = null;
    for (let k = 0; k < 4; k++) {
      const b = o.dot(d), c = o.lengthSq() - r * r, disc = b * b - c; if (disc < 0) return null;
      const tt = -b - Math.sqrt(disc); if (tt < 0) return null;
      p = o.clone().addScaledVector(d, tt); r = Math.max(G.planet.surfaceRadius(p.clone().normalize()), G.planet.seaRadius);
    }
    return p.normalize().multiplyScalar(r);
  }
  // returns nearest interactive thing at a screen position
  function pickAt(x, y, mode) {
    let best = null, bs = 1e9;
    const consider = (type, pos, o, lift, rad, bias) => {
      _a.copy(pos).addScaledVector(pos.clone().normalize(), lift || 1); const s = scr(_a); if (!s) return;
      const d = Math.hypot(s.x - x, s.y - y); const lim = (rad || 30) * (G.touchScale || 1); if (d > lim) return;
      const sc = d + (bias || 0); if (sc < bs) { bs = sc; best = Object.assign({ type, pos }, o); }
    };
    if (mode === 'select') {
      for (const u of G.units) if (!u.dead) consider('unit', u.body.pos, { ent: u }, hOf(u) * 0.55, 30, -4);
      G.rivals.forEach((r) => { consider('rival', r.totemPos, { rival: r }, 2.5, 42); consider('rival', r.hutPos, { rival: r }, 2, 46); r.members.forEach((m) => { if (!m.dead) consider('rival', m.body.pos, { rival: r }, 1.2, 28); }); });
      return best;
    }
    for (const a of G.animals) if (!a.dead && a.vis) consider('animal', a.body.pos, { ent: a }, hOf(a) * 0.55, 34, 0);
    G.rivals.forEach((r) => {
      if (r.status === 'conquered') return;
      r.members.forEach((m) => { if (!m.dead && m.vis) consider('rmember', m.body.pos, { rival: r, ent: m }, 1.2, 30, -2); });
      if (r.totemHp > 0) consider('rbuild', r.totemPos, { rival: r, part: 'totem' }, 2.4, 40, 2);
      if (r.hutHp > 0) consider('rbuild', r.hutPos, { rival: r, part: 'hut' }, 2, 46, 4);
    });
    for (const d of G.drops) if (!d.gone) consider('drop', d.pos, { drop: d }, 0.6, 30, -3);
    for (const n of G.nests) consider('nest', n.pos, { nest: n }, 0.6, 32, 0);
    for (const f of G.fishSpots) consider('fish', f.pos, { spot: f }, 0.5, 36, 0);
    for (const s of G.slots) if (s.tool) consider('toolhut', s.pos, { slot: s }, 1.4, 40, 3);
    const gp = groundPick(x, y);
    if (gp) {
      const fl = G.planet.flora; let bn = null, bd = 3.2 + G.cam._d * 0.03;
      const nodes = fl.within(gp, bd + 1);
      for (const n of nodes) { if (n.fruit <= 0) continue; const d = n.pos.distanceTo(gp); if (d < bd) { bd = d; bn = n; } }
      if (bn && !best) best = { type: 'flora', node: bn, pos: bn.pos };
      if (!best) best = { type: 'ground', pos: gp };
      best.ground = gp;
    }
    return best;
  }
  function issueOrder(x, y) {
    const sel = G.selected.filter((u) => !u.dead && !u.baby);
    if (!sel.length) { toast('Select tribe members first: click one or drag a box', '🖱️', 1600); return; }
    const hit = pickAt(x, y, 'order'); if (!hit) return;
    const ping = (pos, ic) => G.pings.push({ pos: pos.clone(), t: 0, ic });
    sfx('click', { pitch: 1.3 });
    switch (hit.type) {
      case 'animal': {
        const a = hit.ent;
        if (a.pet) { toast('That is one of your pets', '🐾'); break; }
        if (a.friendly) { sel[0].order = { t: 'tame', animal: a }; ping(a.body.pos, '🐾'); sel.slice(1).forEach((u) => { u.order = { t: 'move', pos: a.body.pos.clone() }; }); toast('Taming costs ' + PET_COST + ' food', '🐾', 1600); break; }
        sel.forEach((u) => { u.order = { t: 'hunt', target: a }; }); ping(a.body.pos, '🍖'); break;
      }
      case 'rmember': {
        const r = hit.rival;
        if (!r.war && r.status === 'neutral' && sel.some((u) => SOCIAL.indexOf(u.tool) >= 0)) { startPerformance(r); break; }
        if (r.status === 'neutral' || hit.ent.state === 'raid') { sel.forEach((u) => { u.order = { t: 'attack', tgt: hit.ent }; }); if (!r.war) declareWar(r, true); ping(hit.ent.body.pos, '⚔️'); }
        break;
      }
      case 'rbuild': {
        const r = hit.rival;
        if (!r.war && r.status === 'neutral' && sel.some((u) => SOCIAL.indexOf(u.tool) >= 0)) { startPerformance(r); ping(r.firePos, '🎵'); break; }
        if (r.status === 'conquered') break;
        if (r.status === 'allied') { toast('They are your allies!', '🤝'); break; }
        declareWar(r, true);
        sel.forEach((u) => { u.order = { t: 'attack', bld: { rival: r, part: hit.part } }; }); ping(hit.pos, '⚔️'); break;
      }
      case 'drop': { const d = hit.drop; sel.slice(0, 2).forEach((u) => { u.order = { t: 'pickup', drop: d }; }); ping(d.pos, '🧺'); break; }
      case 'flora': {
        const kind = hit.node.type === 'seaweed' ? 'seaweed' : 'fruit';
        sel.forEach((u) => { u.order = { t: 'gather', node: hit.node, kind, ph: 'work' }; }); ping(hit.node.pos, kind === 'seaweed' ? '🌿' : '🍓'); break;
      }
      case 'nest': { sel.forEach((u) => { u.order = { t: 'nest', nest: hit.nest }; }); ping(hit.nest.pos, '🥚'); break; }
      case 'fish': {
        const fishers = sel.filter((u) => u.tool === 'fish');
        if (!fishers.length) { toast('Equip the 🎣 Fishing spear first (build its hut, select members, press 2)', '🎣', 3200); break; }
        fishers.forEach((u) => { u.order = { t: 'fish', spot: hit.spot }; }); ping(hit.spot.pos, '🎣'); break;
      }
      case 'toolhut': { const id = hit.slot.tool; sel.forEach((u) => { u.order = { t: 'fetch', tool: id, hut: hit.slot }; }); ping(hit.slot.pos, TOOL[id].icon); break; }
      case 'unit': { break; }
      default: {
        const gp = hit.ground || hit.pos; if (!gp) break;
        sel.forEach((u, i) => { const a = i * 2.4, d = i === 0 ? 0 : 1.4 + Math.floor(i / 6); u.order = { t: 'move', pos: i === 0 ? gp.clone() : offsetNear(gp, a, d + 0.8) }; });
        ping(gp, '👣');
      }
    }
  }

  // ================================================================== UI glue
  function buildUI() {
    SP.ui.clearHud();
    const api = {
      TOOLS, TOOL, giftCost: GIFT_COST, babyCost: BABY_COST,
      onBaby: newBaby, onOutfit: openOutfit, onSelectAll: selectAll, onHome: homeCam,
      onTool: onToolButton, onRival: (i) => selectRival(i), onGift: onRivalGift, onPerform: (i) => startPerformance(G.rivals[i]), onRaid: onRivalRaid, onLook: (i) => G.cam.focusDir.copy(G.rivals[i].dir),
    };
    G.api = api;
    G.ui = SP.tribalUI.create(api);
    G.ui.buildRivals(G.rivals);
    G.uiBuilt = true;
    // minimap click
    G.ui.mini.canvas.addEventListener('pointerdown', (e) => {
      const r = G.ui.mini.canvas.getBoundingClientRect(), s = r.width, mx = (e.clientX - r.left) / s * 2 - 1, my = (e.clientY - r.top) / s * 2 - 1;
      const len = Math.hypot(mx, my); if (len > 1) return;
      const ang = len * MM_ANG, fwd = G.cam.forwardOnSurface(), up = G.cam.focusDir, right = new V3().crossVectors(fwd, up).normalize();
      const t = fwd.clone().multiplyScalar(-my / (len || 1)).addScaledVector(right, mx / (len || 1)).normalize();
      G.cam.focusDir.copy(up.clone().multiplyScalar(Math.cos(ang)).addScaledVector(t, Math.sin(ang))).normalize();
    });
  }
  const MM_ANG = 2.0;
  function selText() {
    const s = G.selected.filter((u) => !u.dead);
    if (!s.length) return SP.input.mouse.touch ? 'Tap a tribe member to select (double-tap: all alike, or use All)' : 'Drag a box around your tribe to select';
    const jobs = {}; s.forEach((u) => { const k = u.isChief ? '👑' : u.baby ? '👶' : u.tool ? TOOL[u.tool].icon : '🧑'; jobs[k] = (jobs[k] || 0) + 1; });
    const o = s.length === 1 && s[0].order ? ' - ' + ({ move: 'moving', gather: 'gathering', fish: 'fishing', hunt: 'hunting', attack: 'fighting', deposit: 'carrying food', fetch: 'fetching tool', pickup: 'picking up', gift: 'delivering gift', perform: 'performing', tame: 'taming', nest: 'raiding nest' }[s[0].order.t] || '') : '';
    return 'Selected ' + s.length + ': ' + Object.keys(jobs).map((k) => k + '×' + jobs[k]).join(' ') + o;
  }
  function hintText() {
    if (G.hintT > 0 && G.hint) return G.hint;
    const f = G.flags;
    if (G.gatherWaitT && G.t - G.gatherWaitT < 3) return '🍓 The bushes are bare - gatherers wait for them to regrow (or send them somewhere new).';
    if (!f.deposited) return SP.input.mouse.touch ? 'Tap your tribe (or All), then tap a 🍓 bush or tree to gather fruit. Drag pans, pinch zooms.' : 'Drag to select your tribe, then right-click a 🍓 bush or tree to gather fruit.';
    if (!f.hut) return 'Spend food on a tool hut in the bottom bar. Gathering canes 🌿 double your harvest!';
    if (!f.equipped) return 'Select members and press the tool\'s number key to equip it.';
    if (!f.rivalSeen) return 'Pick a rival tribe on the right: gift food, play music or raid them.';
    return '';
  }
  function refreshUI(force) {
    if (!G.ui) return;
    G.selText = selText(); G.hint = hintText();
    G.dealt = dealtCount();
    G.slotsFree = G.slotsFree === undefined ? 0 : G.slotsFree;
    SP.tribalUI.refresh(G.ui, G, G.api);
    drawMinimap();
  }
  function drawMinimap() {
    const cam = G.cam, fd = cam.focusDir, fwd = cam.forwardOnSurface(), right = new V3().crossVectors(fwd, fd).normalize();
    G.ui.mini.draw((ctx, w, h) => {
      const cx = w / 2, cy = h / 2, R = w / 2 - 8;
      ctx.fillStyle = '#0e4a63'; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, R * 0.5, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.stroke();
      const plot = (dir) => {
        const dot = clamp(dir.dot(fd), -1, 1), ang = Math.acos(dot);
        _a.copy(dir).addScaledVector(fd, -dot); const px = _a.dot(right), py = _a.dot(fwd), l = Math.hypot(px, py) || 1;
        const rr = Math.min(1, ang / MM_ANG);
        return { x: cx + px / l * rr * R, y: cy - py / l * rr * R, edge: ang > MM_ANG };
      };
      // land hint: sample a coarse ring of terrain
      for (let ring = 1; ring <= 4; ring++) for (let i = 0; i < ring * 8; i++) {
        const a = i / (ring * 8) * 6.283, an = ring / 4 * MM_ANG * 0.95;
        const t = fwd.clone().multiplyScalar(Math.cos(a)).addScaledVector(right, Math.sin(a));
        const d = fd.clone().multiplyScalar(Math.cos(an)).addScaledVector(t, Math.sin(an)).normalize();
        if (!G.planet.isWater(d)) { const p = plot(d); ctx.fillStyle = 'rgba(132,204,22,.55)'; ctx.fillRect(p.x - 3, p.y - 3, 6, 6); }
      }
      let p = plot(G.homeDir); ctx.fillStyle = '#fbbf24'; ctx.strokeStyle = '#080c14'; ctx.lineWidth = 2; ctx.fillRect(p.x - 5, p.y - 5, 10, 10); ctx.strokeRect(p.x - 5, p.y - 5, 10, 10);
      G.rivals.forEach((r) => { p = plot(r.dir); ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, 7); ctx.fillStyle = r.status === 'conquered' ? '#475569' : '#' + r.color.toString(16).padStart(6, '0'); ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = r.status === 'allied' ? '#86efac' : r.war ? '#ef4444' : '#080c14'; ctx.stroke(); });
      G.units.forEach((u) => { if (u.dead) return; p = plot(u.body.pos.clone().normalize()); ctx.fillStyle = '#fff'; ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3); });
      G.rivals.forEach((r) => r.members.forEach((m) => { if (m.state === 'raid' || m.state === 'return') { p = plot(m.body.pos.clone().normalize()); ctx.fillStyle = '#ef4444'; ctx.fillRect(p.x - 2, p.y - 2, 4, 4); } }));
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(cx - 12, cy - 8, 24, 16);
    });
  }

  // ---- overlay: selection rings, health bars, order markers, pings
  function drawOverlay(dt) {
    const ui = G.ui, ctx = ui.ctx, cv = ui.canvas, W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H);
    const cam = G.cam, t = G.t;
    const ring = (pos, rad, col, lw, a) => {
      const s = scr(pos); if (!s) return;
      _b.copy(pos).addScaledVector(cam.camera.matrixWorld.elements.length ? _c.setFromMatrixColumn(cam.camera.matrixWorld, 0) : _c, rad);
      const s2 = scr(_b); const rx = s2 ? Math.max(6, Math.abs(s2.x - s.x)) : 20;
      ctx.beginPath(); ctx.ellipse(s.x, s.y, rx, rx * 0.5, 0, 0, 7); ctx.lineWidth = lw; ctx.strokeStyle = col; ctx.globalAlpha = a === undefined ? 1 : a; ctx.stroke(); ctx.globalAlpha = 1;
    };
    const bar = (pos, lift, frac, col, w) => {
      _a.copy(pos).addScaledVector(pos.clone().normalize(), lift); const s = scr(_a); if (!s) return;
      w = w || 40; ctx.fillStyle = '#080c14'; ctx.fillRect(s.x - w / 2 - 2, s.y - 5, w + 4, 9);
      ctx.fillStyle = '#334155'; ctx.fillRect(s.x - w / 2, s.y - 3, w, 5);
      ctx.fillStyle = col; ctx.fillRect(s.x - w / 2, s.y - 3, w * clamp(frac, 0, 1), 5);
    };
    for (const u of G.units) {
      if (u.dead) continue;
      const sel = G.selected.indexOf(u) >= 0;
      if (sel) { ring(u.body.pos, u.body.radius * 1.5 + 0.4, '#080c14', 6); ring(u.body.pos, u.body.radius * 1.5 + 0.4, '#fde047', 3); }
      if (sel || u.hp < u.maxHp * 0.98 || u.baby) {
        bar(u.body.pos, hOf(u) * 1.05 + 0.35, u.baby ? u.grow : u.hp / u.maxHp, u.baby ? '#f9a8d4' : u.hp / u.maxHp > 0.5 ? '#22c55e' : u.hp / u.maxHp > 0.25 ? '#f59e0b' : '#ef4444', 36);
      }
      if (u.carryN > 0 || (u.tool && sel)) {
        _a.copy(u.body.pos).addScaledVector(u.body.up, hOf(u) * 1.05 + 1.2); const s = scr(_a);
        if (s) { ctx.font = '16px sans-serif'; ctx.textAlign = 'center'; ctx.fillText((u.carryN > 0 ? '🍓' + u.carryN : '') + (u.tool && sel ? TOOL[u.tool].icon : ''), s.x, s.y); }
      }
      if (sel && u.order) { // order marker
        const o = u.order, tp = o.pos || (o.node && o.node.pos) || (o.spot && o.spot.pos) || (o.target && o.target.body && o.target.body.pos) || (o.tgt && o.tgt.body && o.tgt.body.pos) || (o.nest && o.nest.pos) || (o.drop && o.drop.pos) || (o.hut && o.hut.pos) || (o.bld && (o.bld.part === 'totem' ? o.bld.rival.totemPos : o.bld.rival.hutPos)) || (o.rival && o.rival.firePos);
        if (tp) { const a = scr(u.body.pos), b = scr(tp); if (a && b) { ctx.setLineDash([5, 6]); ctx.strokeStyle = 'rgba(253,224,71,.65)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]); ctx.beginPath(); ctx.arc(b.x, b.y, 5 + Math.sin(t * 6) * 1.5, 0, 7); ctx.fillStyle = '#fde047'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#080c14'; ctx.stroke(); } }
      }
      if (u.isChief && !sel) { _a.copy(u.body.pos).addScaledVector(u.body.up, hOf(u) * 1.5); }
    }
    for (const a of G.animals) {
      if (a.dead || !a.vis) continue;
      if (a.hp < a.maxHp) bar(a.body.pos, hOf(a) * 1.05 + 0.35, a.hp / a.maxHp, '#f87171', 30);
      if (a.friendly && !a.pet) { _a.copy(a.body.pos).addScaledVector(a.body.up, hOf(a) * 1.1 + 0.6); const s = scr(_a); if (s) { ctx.font = '18px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('💚', s.x, s.y + Math.sin(t * 3 + a.body.id) * 3); } }
    }
    const selR = G.rivals[G.selRival];
    for (const r of G.rivals) {
      for (const m of r.members) if (!m.dead && m.vis && (m.hp < m.maxHp || m.state === 'raid' || m.state === 'return')) bar(m.body.pos, 2.4, m.hp / m.maxHp, m.state === 'raid' || m.state === 'return' ? '#ef4444' : '#' + r.color.toString(16).padStart(6, '0'), 30);
      if (r.status !== 'conquered' && flatDist(r.pos, cam.focusPos) < G.showR + 30) {
        if (r.totemHp > 0 && r.totemHp < r.totemMax) bar(r.totemPos, 6, r.totemHp / r.totemMax, '#f87171', 52);
        if (r.hutHp > 0 && r.hutHp < r.hutMax) bar(r.hutPos, 6.5, r.hutHp / r.hutMax, '#fb923c', 52);
        _a.copy(r.pos).addScaledVector(r.pos.clone().normalize(), 9.5); const s = scr(_a);
        if (s) { ctx.font = 'bold 13px Fredoka, sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 4; ctx.strokeStyle = '#080c14'; ctx.fillStyle = '#fff'; const lbl = r.name + (r.status === 'allied' ? ' 🤝' : r.status === 'conquered' ? ' 🏴' : r.war ? ' 😠' : ' ' + TOOL[r.wanted].icon); ctx.strokeText(lbl, s.x, s.y); ctx.fillText(lbl, s.x, s.y); }
      }
    }
    if (selR && selR.status !== 'conquered') ring(selR.pos, 11, '#fde047', 3, 0.7 + 0.3 * Math.sin(t * 5));
    // pile alert
    if (G.alerts.length) {
      G.alerts = G.alerts.filter((a) => (a.t -= dt) > 0);
      const s = scr(G.v.pilePos); if (s && G.alerts.length) { ctx.font = '26px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('⚠️', s.x, s.y - 70 + Math.sin(t * 8) * 4); }
    }
    // pings
    for (let i = G.pings.length - 1; i >= 0; i--) {
      const p = G.pings[i]; p.t += dt; if (p.t > 1.1) { G.pings.splice(i, 1); continue; }
      const s = scr(p.pos); if (!s) continue; const k = p.t / 1.1;
      ctx.globalAlpha = 1 - k; ctx.beginPath(); ctx.ellipse(s.x, s.y, 8 + k * 26, (8 + k * 26) * 0.5, 0, 0, 7); ctx.lineWidth = 3; ctx.strokeStyle = '#fde047'; ctx.stroke();
      ctx.font = '22px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(p.ic, s.x, s.y - 10 - k * 18); ctx.globalAlpha = 1;
    }
  }

  if (SP.game && SP.game.registerStage) SP.game.registerStage(S);
})();
