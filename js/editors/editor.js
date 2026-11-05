/* SP.editor — one editor framework, six modes (cell, creature, outfit, building, vehicle, ship).
 * See docs/ARCHITECTURE.md §4.12.  UI lives in #editor-ui (styled by css/editor.css).
 * Design-space ("frame") convention: overlay objects (ghost, handles, rings) live in a `frame` group whose
 * matrix follows rig.body (creature modes) or the lifted assembly holder, so design coordinates map 1:1. */
(function () {
  'use strict';
  const SP = window.SP = window.SP || {};
  const T = THREE;

  // ------------------------------------------------------------------ constants
  const ABIL = { bite: ['🦷', 'Bite'], charge: ['💥', 'Charge'], strike: ['⚔️', 'Strike'], spit: ['💦', 'Spit'], sing: ['🎵', 'Sing'], dance: ['💃', 'Dance'], charm: ['😍', 'Charm'], pose: ['🦚', 'Pose'], speed: ['💨', 'Speed'], sprint: ['🏃', 'Sprint'], sneak: ['🥷', 'Sneak'], jump: ['🦘', 'Jump'], glide: ['🪂', 'Glide'], health: ['❤️', 'Health'] };
  const BONUS = { social: ['🎵', 'Social'], attack: ['⚔️', 'Attack'], health: ['❤️', 'Health'], gather: ['🧺', 'Gather'] };
  const CAT = {
    mouth: ['👄', '#f59e0b'], eyes: ['👁️', '#06b6d4'], legs: ['🦵', '#6366f1'], arms: ['💪', '#14b8a6'], hands: ['✋', '#38bdf8'], feet: ['🦶', '#818cf8'],
    weapons: ['⚔️', '#f43f5e'], social: ['🎵', '#ec4899'], detail: ['✨', '#a855f7'], movement: ['🌀', '#84cc16'], extras: ['✨', '#a855f7'],
    hat: ['🎩', '#f97316'], mask: ['🎭', '#eab308'], chest: ['🦺', '#64748b'], shoulder: ['🛡️', '#94a3b8'], accessory: ['💍', '#ec4899']
  };
  const CAT_ORDER = ['mouth', 'movement', 'eyes', 'legs', 'arms', 'hands', 'feet', 'weapons', 'social', 'detail', 'extras', 'hat', 'mask', 'chest', 'shoulder', 'accessory'];
  const GAIT = { slither: 'Slitherer', biped: 'Biped', quad: 'Quadruped', multi: 'Multiped', cell: 'Swimmer' };
  const DIET = { herbivore: ['🌿', 'Herbivore'], carnivore: ['🥩', 'Carnivore'], omnivore: ['🍽️', 'Omnivore'], none: ['—', 'No mouth'] };
  const CUR = { DNA: '🧬', Food: '🍓', Primordiabucks: '💰' };
  const TITLES = { cell: 'Cell Editor', creature: 'Creature Editor', outfit: 'Tribal Outfitter', building: 'Building Editor', vehicle: 'Vehicle Editor', ship: 'Ship Editor' };
  const SWATCHES = [0x22c55e, 0x06b6d4, 0xa855f7, 0xf97316, 0xf43f5e, 0xeab308, 0x38bdf8, 0x84cc16, 0xec4899, 0x14b8a6, 0x92400e, 0x475569, 0xfffbeb, 0x1e293b];
  const PATTERNS = [['none', '⬜ Plain'], ['stripes', '🦓 Stripes'], ['spots', '🐆 Spots'], ['belly', '🥚 Belly']];
  const ACTIONS = [['bite', '🦷', 'Bite'], ['charge', '💥', 'Charge'], ['strike', '⚔️', 'Strike'], ['spit', '💦', 'Spit'], ['sing', '🎵', 'Sing'], ['dance', '💃', 'Dance'], ['charm', '😍', 'Charm'], ['pose', '🦚', 'Pose'], ['jump', '🦘', 'Jump'], ['sneak', '🥷', 'Sneak'], ['eat', '🍖', 'Eat'], ['hurt', '😖', 'Hurt'], ['celebrate', '🎉', 'Cheer']];
  const STAT_MAX = { power: 50, speed: 20, health: 250, defense: 40, energy: 80, range: 12, capacity: 20, happiness: 40, production: 40 };
  const ASM_BARS = {
    building: [['capacity', '🏠', 'Housing', '#22c55e'], ['happiness', '😀', 'Fun', '#ec4899'], ['production', '🏭', 'Output', '#f59e0b'], ['health', '❤️', 'Health', '#f43f5e'], ['defense', '🛡️', 'Defence', '#64748b']],
    vehicle: [['power', '💥', 'Power', '#f43f5e'], ['speed', '💨', 'Speed', '#06b6d4'], ['health', '❤️', 'Health', '#22c55e'], ['defense', '🛡️', 'Defence', '#64748b'], ['range', '🎯', 'Range', '#a855f7'], ['capacity', '📦', 'Cargo', '#f59e0b']],
    ship: [['speed', '💨', 'Speed', '#06b6d4'], ['power', '💥', 'Weapons', '#f43f5e'], ['health', '❤️', 'Hull', '#22c55e'], ['energy', '🔋', 'Energy', '#eab308'], ['range', '🌌', 'Range', '#a855f7'], ['capacity', '📦', 'Cargo', '#f59e0b']]
  };
  const hex = (n) => '#' + ('000000' + (n >>> 0).toString(16)).slice(-6);
  const toHexNum = (c, f) => (SP.assembly && SP.assembly.toHex ? SP.assembly.toHex(c, f) : (typeof c === 'number' ? c : typeof c === 'string' ? parseInt(c.replace('#', ''), 16) : f));
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const sfx = (n) => { try { if (SP.audio && SP.audio.sfx) SP.audio.sfx(n); } catch (e) { /* audio optional */ } };
  function h(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; }
  let uidn = 0;
  const newUid = () => 'e' + (++uidn).toString(36) + Math.floor(Math.random() * 46656).toString(36);

  // ------------------------------------------------------------------ math helpers
  const _bx = new T.Vector3(), _by = new T.Vector3(), _bz = new T.Vector3(), _bm = new T.Matrix4(), _br = new T.Matrix4(), _bs = new T.Matrix4();
  // part frame: +Y = normal, +Z = forward projected; rot about normal; uniform scale s; optional mirror across x=0
  function pmat(p, n, s, rot, mirror, upAlign, out) {
    if (SP.assembly && SP.assembly.placeMatrix) return SP.assembly.placeMatrix(p, n, s, rot, mirror, upAlign, out);
    out = out || new T.Matrix4();
    _by.set(n[0], n[1], n[2]).normalize(); _bz.set(0, 0, 1); _bz.addScaledVector(_by, -_bz.dot(_by));
    if (_bz.lengthSq() < 1e-4) _bz.set(0, 1, 0).addScaledVector(_by, -_by.y); _bz.normalize();
    _bx.crossVectors(_by, _bz); _bm.makeBasis(_bx, _by, _bz); _bm.multiply(_br.makeRotationY(rot || 0)); _bm.multiply(_bs.makeScale(s || 1, s || 1, s || 1)); _bm.setPosition(p[0], p[1], p[2]);
    out.copy(_bm); if (mirror) out.premultiply(new T.Matrix4().makeScale(-1, 1, 1)); return out;
  }

  // creature spine as a signed distance field (chain of tapered capsules); cell mode flattens to the XZ plane
  function spineSurface(spine, flat) {
    const n = spine.length;
    function sdf(x, y, z) {
      if (flat) y = 0;
      let m = 1e9;
      if (n === 1) { const s = spine[0]; return Math.hypot(x - s.p[0], y - s.p[1], z - s.p[2]) - s.r; }
      for (let i = 1; i < n; i++) {
        const a = spine[i - 1], b = spine[i];
        const bx = b.p[0] - a.p[0], by = b.p[1] - a.p[1], bz = b.p[2] - a.p[2];
        const px = x - a.p[0], py = y - a.p[1], pz = z - a.p[2];
        const hh = clamp((px * bx + py * by + pz * bz) / (bx * bx + by * by + bz * bz || 1), 0, 1);
        const d = Math.hypot(px - bx * hh, py - by * hh, pz - bz * hh) - (a.r + (b.r - a.r) * hh);
        if (d < m) m = d;
      }
      return m;
    }
    const E = 0.004;
    function normal(x, y, z) {
      const nx = sdf(x + E, y, z) - sdf(x - E, y, z), ny = flat ? 0 : sdf(x, y + E, z) - sdf(x, y - E, z), nz = sdf(x, y, z + E) - sdf(x, y, z - E);
      const l = Math.hypot(nx, ny, nz) || 1; return [nx / l, ny / l, nz / l];
    }
    function closest(x, y, z) {
      let px = x, py = flat ? 0 : y, pz = z;
      for (let i = 0; i < 10; i++) { const d = sdf(px, py, pz), g = normal(px, py, pz); px -= g[0] * d; py -= g[1] * d; pz -= g[2] * d; if (Math.abs(d) < 0.0008) break; }
      return { p: [px, py, pz], n: normal(px, py, pz), d: Math.abs(sdf(x, y, z)) };
    }
    function raycast(ox, oy, oz, dx, dy, dz, tmax) {
      if (flat) {
        if (Math.abs(dy) < 1e-4) return null;
        const t = -oy / dy; if (t < 0) return null;
        const c = closest(ox + dx * t, 0, oz + dz * t);
        const dd = sdf(ox + dx * t, 0, oz + dz * t);
        if (dd > 1.3) return null;
        return { t: t, p: c.p, n: c.n };
      }
      let t = 0; tmax = tmax || 80;
      if (sdf(ox, oy, oz) < 0) return null;
      for (let i = 0; i < 120; i++) {
        const x = ox + dx * t, y = oy + dy * t, z = oz + dz * t, d = sdf(x, y, z);
        if (d < 0.004) return { t: t, p: [x, y, z], n: normal(x, y, z) };
        t += Math.max(d * 0.95, 0.004); if (t > tmax) return null;
      }
      return null;
    }
    return { sdf: sdf, normal: normal, closest: closest, raycast: raycast };
  }

  // ------------------------------------------------------------------ mode adapters
  const CreatureAdapter = {
    asm: false,
    cur: (S) => S.opts.currency || 'DNA',
    list(S) { return S.mode === 'outfit' ? S.design.outfit : S.design.parts; },
    ensure(S) { if (S.mode === 'outfit' && !S.design.outfit) S.design.outfit = []; },
    def: (id) => SP.parts.get(id),
    cost(S, d) { try { return SP.creature.cost(d || S.design, S.unlockedArg); } catch (e) { return 0; } },
    stats: (S) => SP.creature.stats(S.design, { brainLevel: S.opts.brainLevel || 1 }),
    validate: (S) => SP.creature.validate(S.design),
    complexity: (S) => SP.creature.complexity(S.design),
    build(S) { return SP.creature.build(S.design, { outline: true, shadows: true, lod: 'high' }); },
    surface(S, exclude) { return spineSurface(S.design.spine, S.design.kind === 'cell'); },
    frameMatrix(S, rig, out) { rig.root.updateMatrixWorld(true); out.copy(rig.body ? rig.body.matrixWorld : rig.root.matrixWorld); return out; },
    posOf(S, pt) { const v = S.design.spine[clamp(pt.v | 0, 0, S.design.spine.length - 1)]; return [v.p[0] + pt.o[0], v.p[1] + pt.o[1], v.p[2] + pt.o[2]]; },
    place(S, pt, p, n) {
      const sp = S.design.spine; let bi = 0, bd = 1e9;
      for (let i = 0; i < sp.length; i++) { const d = Math.hypot(p[0] - sp[i].p[0], p[1] - sp[i].p[1], p[2] - sp[i].p[2]) - sp[i].r * 0.2; if (d < bd) { bd = d; bi = i; } }
      pt.v = bi; pt.o = [p[0] - sp[bi].p[0], p[1] - sp[bi].p[1], p[2] - sp[bi].p[2]]; pt.n = n.slice();
    },
    make(S, def, p, n, mirror) {
      const pt = { uid: newUid(), id: def.id, v: 0, o: [0, 0, 0], n: [0, 1, 0], s: 1, rot: 0, mirror: !!mirror };
      CreatureAdapter.place(S, pt, p, n);
      if (def.slot === 'leg') { pt.len = 1.3; pt.bend = 0; } else if (def.slot === 'arm') { pt.len = 1.0; pt.bend = 0; }
      return pt;
    },
    isLimb: (def) => def && (def.slot === 'leg' || def.slot === 'arm'),
    matrix(S, pt, def, mirror, out) { return pmat(CreatureAdapter.posOf(S, pt), pt.n, pt.s, pt.rot, mirror, false, out); },
    random(S, rng) {
      const d = SP.creature.generate(rng, { kind: S.design.kind });
      if (S.mode === 'outfit') {
        const outs = SP.parts.byCategory('outfit'), cats = Object.keys(outs), res = [];
        const sf = spineSurface(S.design.spine, false);
        for (let i = 0; i < 3; i++) {
          const arr = outs[cats[Math.floor(rng.next() * cats.length)]].filter((p) => S.isUnlocked(p));
          if (!arr.length) continue; const def = arr[Math.floor(rng.next() * arr.length)];
          const sp = S.design.spine[Math.floor(rng.next() * S.design.spine.length)];
          const dir = [rng.range(-1, 1), 1, rng.range(-0.3, 0.3)];
          const hit = sf.raycast(sp.p[0] + dir[0] * 6, sp.p[1] + 6, sp.p[2] + dir[2] * 6, -dir[0], -1, -dir[2], 30);
          if (hit) res.push(CreatureAdapter.make(S, def, hit.p, hit.n, Math.abs(hit.p[0]) > 0.12));
        }
        S.design.outfit = res; return S.design;
      }
      d.name = S.design.name; if (S.design.outfit) d.outfit = S.design.outfit; return d;
    }
  };

  const AssemblyAdapter = {
    asm: true,
    cur: (S) => S.opts.currency || 'Primordiabucks',
    list: (S) => S.design.parts,
    ensure() { /* nothing */ },
    def: (id) => SP.assemblyParts.get(id),
    cost: (S, d) => SP.assembly.cost(d || S.design),
    stats: (S) => SP.assembly.stats(S.design),
    validate: (S) => SP.assembly.validate(S.design),
    complexity: (S) => SP.assembly.complexity(S.design),
    build: (S) => SP.assembly.build(S.design, {}),
    surface: (S, exclude) => SP.assembly.surface(S.design, exclude),
    frameMatrix(S, rig, out) { rig.root.updateMatrixWorld(true); out.makeTranslation(0, rig.lift || 0, 0).premultiply(rig.root.matrixWorld); return out; },
    posOf: (S, pt) => pt.p,
    place(S, pt, p, n) { pt.p = p.map((v) => Math.round(v * 1000) / 1000); pt.n = n.map((v) => Math.round(v * 1000) / 1000); },
    make(S, def, p, n, mirror) { const pt = { uid: newUid(), id: def.id, p: [0, 0, 0], n: [0, 1, 0], s: 1, rot: 0, mirror: !!mirror }; AssemblyAdapter.place(S, pt, p, n); return pt; },
    isLimb: () => false,
    matrix(S, pt, def, mirror, out) { return pmat(pt.p, pt.n, pt.s, pt.rot, mirror, def && def.upAlign, out); },
    random(S, rng) { const d = SP.assembly.generate(rng, S.design.kind, S.design.role, S.design.colors); d.name = S.design.name; return d; }
  };

  // ------------------------------------------------------------------ module state
  let S = null;            // active session
  const E = SP.editor = { isOpen: false, scene: null, camera: null, update: update, open: open, close: function () { if (S) finish(null); }, _dbg: function () { return S; } };

  // ------------------------------------------------------------------ open
  function open(opts) {
    opts = opts || {};
    if (S) return Promise.resolve(null);
    const mode = opts.mode || 'creature';
    const creatureLike = mode === 'cell' || mode === 'creature' || mode === 'outfit';
    const A = creatureLike ? CreatureAdapter : AssemblyAdapter;
    if (creatureLike && !(SP.creature && SP.creature.build && SP.creature.stats && SP.creature.defaultDesign && SP.parts)) { toast('Creature editor needs SP.creature + SP.parts', '🚧'); return Promise.resolve(null); }
    if (!creatureLike && !(SP.assembly && SP.assemblyParts)) { toast('Assembly editor not loaded', '🚧'); return Promise.resolve(null); }
    if (!SP.render || !SP.render.makeLights) { toast('Renderer missing', '🚧'); return Promise.resolve(null); }

    let design;
    try {
      if (creatureLike) {
        design = opts.design ? SP.creature.clone(opts.design) : SP.creature.defaultDesign(mode === 'cell' ? 'cell' : 'creature');
        if (mode === 'cell') design.kind = 'cell';
      } else {
        const typed = mode === 'vehicle' ? opts.vehicleType : mode === 'building' ? opts.buildingType : undefined; // C-01: role only applies to its own mode
        const role = typed || (opts.design && opts.design.role) || undefined;
        design = opts.design ? SP.assembly.clone(opts.design) : null;
        if (!design || design.kind !== mode || (role && design.role !== role && typed)) design = SP.assembly.defaultDesign(mode, role);
      }
    } catch (e) { console.error(e); return Promise.resolve(null); }

    return new Promise(function (resolve) {
      S = {
        mode: mode, A: A, opts: opts, design: design, resolve: resolve, budget: opts.budget === undefined ? null : opts.budget,
        unlockedArg: opts.unlocked === undefined ? 'all' : opts.unlocked, allowCancel: opts.allowCancel !== false,
        history: [], hi: -1, sym: true, sel: null, selTwin: false, hover: null, tab: null, tabs: [], armed: null, drag: null, vsel: -1,
        dirty: true, rig: null, testRig: null, test: null, ptr: new Map(), t: 0, spin: 0.6, ui: {}, spinVel: 0, flashT: 0, wheelTimer: 0
      };
      S.isUnlocked = function (def) { return S.unlockedArg === 'all' || def.unlockedByDefault || (Array.isArray(S.unlockedArg) && S.unlockedArg.indexOf(def.id) >= 0); };
      A.ensure(S);
      S.cost0 = A.cost(S);
      S.grand = {}; if (!A.asm) A.list(S).forEach((p) => { S.grand[p.id] = 1; }); // parts already in the opened design are never flagged as locked
      try { buildScene(); buildUI(); } catch (e) { console.error(e); teardown(); resolve(null); return; }
      pushHistory();
      rebuildRig(true);
      refreshAll();
      E.isOpen = true; E.scene = S.scene; E.camera = S.camera;
      window.addEventListener('keydown', onKey);
      window.addEventListener('keyup', onKeyUp);
      if (SP.render.onResize) S.unResize = SP.render.onResize(onResize);
      onResize(window.innerWidth, window.innerHeight);
      sfx('click');
    });
  }

  function toast(text, icon) { try { if (SP.ui && SP.ui.toast) { SP.ui.toast(text, icon); return; } } catch (e) { /* fall through */ } console.warn('[editor]', text); }
  function flash(text) {
    if (!S) return; const f = h('div', 'ed-flash', text); S.ui.root.appendChild(f); setTimeout(() => f.remove(), 1700); sfx('hurt');
  }

  function finish(result) {
    if (!S) return; const s = S, res = s.resolve;
    teardown();
    res(result);
  }
  function teardown() {
    if (!S) return;
    window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('pointermove', onWinMove); window.removeEventListener('pointerup', onWinUp);
    if (S.unResize) S.unResize();
    clearTimeout(S.wheelTimer);
    try { if (S.rig && S.rig.dispose) S.rig.dispose(); if (S.testRig && S.testRig.dispose) S.testRig.dispose(); } catch (e) { /* ignore */ }
    if (S.scene) S.scene.traverse(function (o) { if (o.geometry && !(o.geometry.userData && o.geometry.userData.keep)) o.geometry.dispose(); });
    if (S.scene && S.scene.background && S.scene.background.dispose) S.scene.background.dispose(); // C-06: gradient backdrop texture
    if (S.ui.root && S.ui.root.parentNode) S.ui.root.parentNode.removeChild(S.ui.root);
    if (S.ui.ghostCard) S.ui.ghostCard.remove();
    E.isOpen = false; E.scene = null; E.camera = null; S = null;
  }
  function done() {
    const v = validity(); if (!v.ok) { flash(v.reasons[0]); return; }
    S.design.name = (S.ui.name && S.ui.name.value.trim()) || S.design.name || 'Unnamed';
    const spent = Math.max(0, S.A.cost(S) - S.cost0);
    const design = S.A.asm ? SP.assembly.clone(S.design) : SP.creature.clone(S.design);
    sfx('levelup'); finish({ design: design, spent: spent });
  }
  function cancel() { if (!S.allowCancel) return; sfx('click'); finish(null); }

  // ------------------------------------------------------------------ scene
  function buildScene() {
    const R = SP.render;
    const scene = new T.Scene(); S.scene = scene;
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 256; const g = cv.getContext('2d');
    const gr = g.createRadialGradient(128, 118, 8, 128, 128, 190); gr.addColorStop(0, '#26364f'); gr.addColorStop(0.55, '#162033'); gr.addColorStop(1, '#0a0e17');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    scene.background = new T.CanvasTexture(cv);
    S.lights = R.makeLights(scene, 'editor');
    const cam = new T.PerspectiveCamera(38, 1.6, 0.1, 400); S.camera = cam;
    S.basePitch = S.mode === 'cell' ? 0.95 : 0.38;
    S.cam = { pitch: S.basePitch, dist: 12, tgt: new T.Vector3(0, 1.5, 0), distT: 12, tgtT: new T.Vector3(0, 1.5, 0), pitchT: S.basePitch };
    const grid = new T.GridHelper(80, 64, 0x24324d, 0x182236); grid.position.y = -0.8; grid.material.transparent = true; grid.material.opacity = 0.55; scene.add(grid); S.grid = grid;
    const tt = new T.Group(); tt.rotation.y = 0.6; scene.add(tt); S.turn = tt;
    // pedestal: unit-sized (radius ~4.2) and scaled by session
    const ped = new T.Group(); tt.add(ped); S.ped = ped;
    const base = R.cel(new T.CylinderGeometry(4.2, 4.6, 0.75, 40), 0x272f44, { outline: 0.04 }); base.position.y = -0.38; ped.add(base);
    const ring = R.cel(new T.TorusGeometry(3.6, 0.12, 8, 48), 0x22d3ee, { outline: 0.05, material: R.toon(0x22d3ee, { emissive: 0x22d3ee, emissiveIntensity: 0.7 }) }); ring.rotation.x = Math.PI / 2; ring.position.y = 0.02; ped.add(ring); S.ring = ring;
    const model = new T.Group(); tt.add(model); S.model = model;
    const fr = new T.Group(); fr.matrixAutoUpdate = false; tt.add(fr); S.frame = fr;
    // overlay objects
    S.ghost = new T.Group(); S.ghost.visible = false; fr.add(S.ghost);
    S.ringSel = new T.Mesh(new T.TorusGeometry(1, 0.06, 6, 32), new T.MeshBasicMaterial({ color: 0x22d3ee, depthTest: false, transparent: true, opacity: 0.95 }));
    S.ringSel.renderOrder = 30; S.ringSel.visible = false; fr.add(S.ringSel);
    S.ringTwin = S.ringSel.clone(); S.ringTwin.material = S.ringSel.material.clone(); S.ringTwin.material.opacity = 0.4; S.ringTwin.visible = false; fr.add(S.ringTwin);
    S.ringHov = new T.Mesh(new T.TorusGeometry(1, 0.035, 6, 28), new T.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true, opacity: 0.6 })); S.ringHov.renderOrder = 29; S.ringHov.visible = false; fr.add(S.ringHov);
    S.tipH = new T.Mesh(new T.SphereGeometry(1, 12, 10), new T.MeshBasicMaterial({ color: 0xfacc15, depthTest: false })); S.tipH.renderOrder = 31; S.tipH.visible = false; fr.add(S.tipH);
    S.tipLine = new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(), new T.Vector3(0, 1, 0)]), new T.LineBasicMaterial({ color: 0xfacc15, depthTest: false })); S.tipLine.renderOrder = 30; S.tipLine.visible = false; fr.add(S.tipLine);
    S.handles = new T.Group(); fr.add(S.handles); S.handles.visible = false;
    // treadmill
    const tm = new T.Group(); tm.visible = false; tt.add(tm); S.treadmill = tm; S.planks = [];
    for (let i = 0; i < 14; i++) { const p = R.cel(new T.BoxGeometry(5.2, 0.14, 0.5), i % 2 ? 0x334155 : 0x1e293b, { outline: 0.05 }); p.position.y = -0.05; tm.add(p); S.planks.push(p); }
    // water tank for the test drive (DESIGN 3.6): glass wall, translucent surface, sandy floor; scaled in stepTest
    { const g = new T.Group(); g.visible = false; tt.add(g); S.pool = g;
      const wm = new T.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.15, side: T.DoubleSide, depthWrite: false });
      const wall = new T.Mesh(new T.CylinderGeometry(1, 1, 1, 40, 1, true), wm); wall.position.y = 0.5; wall.renderOrder = 2;
      const top = new T.Mesh(new T.CircleGeometry(1, 40), new T.MeshBasicMaterial({ color: 0x67e8f9, transparent: true, opacity: 0.3, side: T.DoubleSide, depthWrite: false })); top.rotation.x = -Math.PI / 2; top.renderOrder = 2;
      const rim = new T.Mesh(new T.TorusGeometry(1, 0.012, 6, 48), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 })); rim.rotation.x = Math.PI / 2;
      const floor = new T.Mesh(new T.CircleGeometry(1, 40), R.toon(0xe7c27d)); floor.rotation.x = -Math.PI / 2; floor.position.y = 0.03;
      g.add(wall, top, rim, floor); g.userData = { wall: wall, top: top, rim: rim, floor: floor };
    }
    S.ghostMat = new T.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.5, depthWrite: false });
    S.badMat = new T.MeshBasicMaterial({ color: 0xf43f5e, transparent: true, opacity: 0.5, depthWrite: false });
    S.ray = new T.Raycaster();
  }

  function colorsNow() {
    const c = S.design.colors || {};
    return { base: toHexNum(c.base, 0x22c55e), accent: toHexNum(c.accent, 0xfffbeb), detail: toHexNum(c.detail, 0x1e293b), pattern: c.pattern };
  }

  function rebuildRig(first) {
    const A = S.A;
    if (S.rig) { S.model.remove(S.rig.root); try { S.rig.dispose && S.rig.dispose(); } catch (e) { /* ignore */ } S.rig = null; }
    try { S.rig = A.build(S); } catch (e) { console.error(e); toast('Build failed: ' + e.message, '⚠️'); S.dirty = false; return; }
    S.model.add(S.rig.root); S.rig.root.visible = !S.test;
    S.model.updateMatrixWorld(true);
    A.frameMatrix(S, S.rig, S.frame.matrix); S.frame.matrix.premultiply(new T.Matrix4().copy(S.turn.matrixWorld).invert());
    S.frame.matrixWorldNeedsUpdate = true;
    S.surf = A.surface(S, null);
    if (first || S.reframe) frameCamera();
    S.dirty = false; rebuildHandles();
  }
  function frameCamera() {
    S.reframe = false;
    const b = new T.Box3().setFromObject(S.rig.root);
    if (b.isEmpty()) return;
    const sz = b.getSize(new T.Vector3()), c = b.getCenter(new T.Vector3());
    const r = Math.max(sz.x, sz.y, sz.z) * 0.5;
    const pr = clamp(Math.max(sz.x, sz.z) * 0.5 + (S.mode === 'creature' ? 0.6 : 1.1), S.mode === 'creature' ? 2.0 : 2.6, 14);
    S.pedScale = pr / 3.9; S.ped.scale.set(S.pedScale, 1, S.pedScale);
    S.ped.children.forEach((o) => { /* keep thickness */ });
    S.cam.tgtT.set(0, Math.max(0.6, c.y * 0.85), 0); S.cam.distT = S.mode === 'cell' ? clamp(r * 3.2 + 3, 6, 40) : (S.mode === 'creature' ? clamp(r * 2.6 + 3, 6.5, 70) : clamp(r * 3.6 + 4.5, 9, 70));
    if (!S.cam.init) { S.cam.tgt.copy(S.cam.tgtT); S.cam.dist = S.cam.distT; S.cam.init = true; }
    S.lights.sun.shadow.camera.left = S.lights.sun.shadow.camera.bottom = -pr - 6; S.lights.sun.shadow.camera.right = S.lights.sun.shadow.camera.top = pr + 6; S.lights.sun.shadow.camera.updateProjectionMatrix();
    S.grid.position.y = -0.76;
  }
  function markDirty() { S.dirty = true; }

  // ------------------------------------------------------------------ history
  function snap() { return JSON.stringify(S.design); }
  function pushHistory() {
    const s = snap(); if (S.history[S.hi] === s) return;
    S.history.length = S.hi + 1; S.history.push(s); S.hi = S.history.length - 1; if (S.history.length > 80) { S.history.shift(); S.hi--; }
    updateUndoBtns();
  }
  function restore(i) {
    S.hi = i; S.design = JSON.parse(S.history[i]); S.sel = null; S.vsel = -1; markDirty(); refreshAll();
    if (S.ui.name) S.ui.name.value = S.design.name || '';
  }
  function undo() { if (S.hi > 0) { restore(S.hi - 1); sfx('remove'); } }
  function redo() { if (S.hi < S.history.length - 1) { restore(S.hi + 1); sfx('place'); } }
  function commit() { pushHistory(); markDirty(); refreshAll(); }

  // ------------------------------------------------------------------ queries / validity
  function budgetInfo() {
    const c = S.A.cost(S), net = c - S.cost0;
    return { cost: c, net: net, remaining: S.budget === null ? Infinity : S.budget - net };
  }
  function validity() {
    const v = S.A.validate(S), cx = S.A.complexity(S), b = budgetInfo(); const reasons = [];
    (v.errors || []).forEach((e) => reasons.push(e));
    if (cx.value > cx.max && !(v.errors || []).some((e) => /complex|many/i.test(e))) reasons.push('Too complex: ' + cx.value + '/' + cx.max);
    if (!S.A.asm) { const seen = {}; curList().forEach((p) => { const d = partDef(p); if (d && !S.isUnlocked(d) && !(S.grand && S.grand[p.id]) && !seen[p.id]) { seen[p.id] = 1; reasons.push('Locked part: ' + d.name); } }); }
    if (b.remaining < 0) reasons.push('Over budget by ' + Math.ceil(-b.remaining) + ' ' + S.A.cur(S));
    return { ok: reasons.length === 0, reasons: reasons, v: v, cx: cx, b: b };
  }
  function partDef(pt) { return S.A.def(pt.id); }
  function curList() { return S.A.list(S); }
  function findPart(uid) { const L = curList(); for (let i = 0; i < L.length; i++) if (L[i].uid === uid) return L[i]; return null; }
  function selPart() { return S.sel ? findPart(S.sel) : null; }

  // ------------------------------------------------------------------ picking
  const _v1 = new T.Vector3(), _v2 = new T.Vector3(), _inv = new T.Matrix4();
  function vpRect() { return S.ui.vp.getBoundingClientRect(); }
  function ndcOf(cx, cy) { const r = vpRect(); return new T.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1); }
  function localRay(cx, cy) {
    S.camera.updateMatrixWorld(); S.frame.updateMatrixWorld(true);
    S.ray.setFromCamera(ndcOf(cx, cy), S.camera);
    _inv.copy(S.frame.matrixWorld).invert();
    const o = S.ray.ray.origin.clone().applyMatrix4(_inv), d = S.ray.ray.direction.clone().transformDirection(_inv);
    return { o: o, d: d };
  }
  function toScreen(local) { // local frame vec3 -> client px {x,y,z(depth ndc)}
    _v1.copy(local).applyMatrix4(S.frame.matrixWorld).project(S.camera); const r = vpRect();
    return { x: r.left + (_v1.x * 0.5 + 0.5) * r.width, y: r.top + (-_v1.y * 0.5 + 0.5) * r.height, z: _v1.z };
  }
  function camDistTo(local) { return _v2.copy(local).applyMatrix4(S.frame.matrixWorld).distanceTo(S.camera.position); }
  function worldPerPx(local) { const d = camDistTo(local); const r = vpRect(); return 2 * d * Math.tan(S.camera.fov * Math.PI / 360) / r.height; }
  function surfaceHit(cx, cy, exclude) {
    const sf = exclude ? S.A.surface(S, exclude) : S.surf;
    const r = localRay(cx, cy);
    return sf.raycast(r.o.x, r.o.y, r.o.z, r.d.x, r.d.y, r.d.z, 200);
  }
  // returns {p:[], n:[], mirror:bool, centred:bool} applying symmetry rules
  function symmetrize(hit, def) {
    let p = hit.p.slice(), n = hit.n.slice(), mirror = false, centred = false;
    if (Math.abs(p[0]) < 0.14) { p[0] = 0; n[0] = 0; const l = Math.hypot(n[0], n[1], n[2]) || 1; n = n.map((v) => v / l); centred = true; }
    else if (S.sym) { if (p[0] < 0) { p[0] = -p[0]; n[0] = -n[0]; } mirror = true; }
    return { p: p, n: n, mirror: mirror, centred: centred };
  }
  function partRadiusPx(pt) {
    const pos = new T.Vector3().fromArray(S.A.posOf(S, pt)); return clamp(0.45 * (pt.s || 1) / worldPerPx(pos), 16, 70);
  }
  function pickPart(cx, cy) {
    const L = curList(); let best = null, bd = 1e9;
    for (let i = 0; i < L.length; i++) {
      const pt = L[i], pos = S.A.posOf(S, pt);
      for (let k = 0; k < (pt.mirror ? 2 : 1); k++) {
        const lp = new T.Vector3(k ? -pos[0] : pos[0], pos[1], pos[2]);
        const sc = toScreen(lp); const d = Math.hypot(sc.x - cx, sc.y - cy); const rad = partRadiusPx(pt) * 1.05;
        const nl = new T.Vector3(k ? -pt.n[0] : pt.n[0], pt.n[1], pt.n[2]).transformDirection(S.frame.matrixWorld);
        const toCam = S.camera.position.clone().sub(lp.clone().applyMatrix4(S.frame.matrixWorld)).normalize();
        const facing = nl.dot(toCam); if (facing < -0.35) continue;
        const score = d - (pt.uid === S.sel ? 8 : 0);
        if (d < rad && score < bd) { bd = score; best = { pt: pt, twin: !!k, dist: d, rad: rad }; }
      }
    }
    return best;
  }
  function pickVertebra(cx, cy) {
    if (!S.handlesOn) return -1; let best = -1, bd = 22;
    S.design.spine.forEach((s, i) => { const sc = toScreen(new T.Vector3().fromArray(s.p)); const d = Math.hypot(sc.x - cx, sc.y - cy); if (d < bd) { bd = d; best = i; } });
    return best;
  }
  function limbTip(pt) {
    const pd = partDef(pt); const base = S.A.posOf(S, pt); const len = pt.len || 1.2;
    const sx = pt.n[0] >= 0 ? 1 : -1;
    let dir;
    if (pd && pd.slot === 'arm') dir = new T.Vector3(sx * Math.max(0.25, Math.abs(pt.n[0]) * 0.5), -0.55, 0.55 + (pt.bend || 0) * 0.3);
    else dir = new T.Vector3(sx * (0.12 + (pd && pd.limb && pd.limb.splay || 0.1) + Math.abs(pt.n[0]) * 0.25), -1, (pt.bend || 0) * 0.35);
    dir.normalize(); return new T.Vector3().fromArray(base).addScaledVector(dir, len * 0.95);
  }
  function limbCandidates(def) {
    const want = def.slot === 'foot' ? 'leg' : 'arm'; const out = [];
    curList().forEach((pt) => { const pd = partDef(pt); if (pd && pd.slot === want) { out.push({ pt: pt, tip: limbTip(pt), twin: false }); if (pt.mirror) { const t = limbTip(pt); t.x = -t.x; out.push({ pt: pt, tip: t, twin: true }); } } });
    return out;
  }

  // ------------------------------------------------------------------ ghost preview
  function ghostify(obj) {
    obj.traverse(function (o) {
      if (o.isMesh) { if (o.name === 'outline') o.visible = false; else { o.material = S.ghostMat; o.castShadow = false; o.receiveShadow = false; } }
      if (o.userData) o.userData.anim = null;
    });
  }
  function ghostFor(def) {
    if (S.ghostDef === def.id) return;
    while (S.ghost.children.length) S.ghost.remove(S.ghost.children[0]);
    S.ghostDef = def.id; S.ghostParts = [];
    for (let k = 0; k < 2; k++) {
      const g = new T.Group(); g.matrixAutoUpdate = false;
      try { const tmpl = { uid: 'ghost', id: def.id, v: 0, o: [0, 0, 0], n: [0, 1, 0], p: [0, 0, 0], s: 1, rot: 0, mirror: false, len: def.slot === 'arm' ? 1.0 : 1.3, bend: 0 }; const obj = def.build(S.design, tmpl, colorsNow()); ghostify(obj); g.add(obj); } catch (e) { console.warn('ghost build failed', def.id, e.message); }
      S.ghost.add(g); S.ghostParts.push(g);
    }
  }
  function hideGhost() { S.ghost.visible = false; }
  function showGhost(def, pos, n, s, rot, mirror, valid, upAlign) {
    ghostFor(def);
    S.ghostMat.color.setHex(valid ? 0x22d3ee : 0xf43f5e);
    const fake = { p: pos, n: n, s: s, rot: rot };
    S.ghostParts[0].matrix.copy(pmat(pos, n, s, rot, false, def.upAlign)); S.ghostParts[0].matrixWorldNeedsUpdate = true;
    S.ghostParts[1].visible = !!mirror;
    if (mirror) { S.ghostParts[1].matrix.copy(pmat(pos, n, s, rot, true, def.upAlign)); }
    S.ghost.visible = true;
  }

  // ------------------------------------------------------------------ part operations
  function nearestLimb(def, cx, cy, maxPx) {
    let best = null, bd = maxPx || 110;
    limbCandidates(def).forEach(function (c) { const sc = toScreen(c.tip); const d = Math.hypot(sc.x - cx, sc.y - cy); if (d < bd) { bd = d; best = c; } });
    return best;
  }
  function evalPlacement(def, cx, cy) { // -> {ok, pos, n, mirror, attachTo?, reason}
    if (def.slot === 'foot' || def.slot === 'hand') {
      const c = nearestLimb(def, cx, cy);
      if (!c) return { ok: false, reason: 'Drop it on the tip of a ' + (def.slot === 'foot' ? 'leg' : 'arm') };
      return { ok: true, pos: c.tip.toArray(), n: c.pt.n.slice(), mirror: c.pt.mirror, attachTo: c.pt, twin: c.twin };
    }
    const hit = surfaceHit(cx, cy);
    if (!hit) return { ok: false, reason: '' };
    const sy = symmetrize(hit, def);
    if (S.A.asm && !SP.assembly.placeOk(def, sy.n)) return { ok: false, pos: sy.p, n: sy.n, mirror: sy.mirror, reason: 'Needs a ' + (def.place === 'top' ? 'top' : def.place === 'side' ? 'side' : 'bottom') + ' surface' };
    return { ok: true, pos: sy.p, n: sy.n, mirror: sy.mirror };
  }
  function withBudget(mutate) { // apply mutation, reject if over budget (only when it increases cost)
    const before = snap(), c0 = S.A.cost(S);
    mutate();
    const c1 = S.A.cost(S);
    if (S.budget !== null && c1 > c0 && (c1 - S.cost0) > S.budget) { S.design = JSON.parse(before); S.A.ensure(S); flash('Not enough ' + S.A.cur(S) + '!'); return false; }
    return true;
  }
  function placeDef(def, cx, cy) {
    if (!S.isUnlocked(def)) { flash('Locked: find bone piles!'); return false; }
    const ev = evalPlacement(def, cx, cy);
    if (!ev.ok) { if (ev.reason) flash(ev.reason); return false; }
    let created = null;
    const ok = withBudget(function () {
      const L = curList();
      if (ev.attachTo) { // foot / hand: replace any existing one on that limb
        for (let i = L.length - 1; i >= 0; i--) if (L[i].attach === ev.attachTo.uid) L.splice(i, 1);
        const lp = ev.attachTo; created = { uid: newUid(), id: def.id, v: lp.v, o: lp.o.slice(), n: lp.n.slice(), s: 1, rot: 0, mirror: !!lp.mirror, attach: lp.uid };
      } else created = S.A.make(S, def, ev.pos, ev.n, ev.mirror);
      L.push(created);
    });
    if (!ok) return false;
    S.sel = created.uid; commit(); sfx('place');
    if (S.A.isLimb(def)) setHint('Drag the gold handle to set the limb length and bend');
    return true;
  }
  function removePart(uid) {
    const L = curList(); const i = L.findIndex((p) => p.uid === uid); if (i < 0) return;
    const gone = L.splice(i, 1)[0];
    for (let k = L.length - 1; k >= 0; k--) if (L[k].attach === uid) L.splice(k, 1);
    if (S.A.asm) { const dropped = SP.assembly.prune(S.design); if (dropped.length) toast(dropped.length + ' attached part(s) removed', '🧹'); }
    if (S.sel === uid) S.sel = null;
    commit(); sfx('remove');
  }
  function syncAttached(limb) {
    curList().forEach(function (p) { if (p.attach === limb.uid) { p.v = limb.v; p.o = limb.o.slice(); p.n = limb.n.slice(); p.mirror = limb.mirror; p.s = 1; } });
  }
  function scalePart(pt, k) {
    pt.s = clamp((pt.s || 1) * k, 0.5, 2); markDirty(); clearTimeout(S.wheelTimer); S.wheelTimer = setTimeout(() => { if (S) { pushHistory(); refreshAll(); } }, 400); refreshSel();
  }
  function rotatePart(pt, da) { pt.rot = (pt.rot || 0) + da; markDirty(); clearTimeout(S.wheelTimer); S.wheelTimer = setTimeout(() => { if (S) pushHistory(); }, 300); }
  function toggleMirror(pt) { if (Math.abs(S.A.posOf(S, pt)[0]) < 0.14) { flash('Centred parts cannot be mirrored'); return; } pt.mirror = !pt.mirror; commit(); }

  // ------------------------------------------------------------------ spine editing
  function limits() { return S.design.kind === 'cell' ? { min: 1, max: 5 } : { min: 3, max: 14 }; }
  function allAnchored() { return (S.design.parts || []).concat(S.design.outfit || []); }
  function reprojectParts(o0map) {
    const sf = spineSurface(S.design.spine, S.design.kind === 'cell');
    allAnchored().forEach(function (pt) {
      const v = S.design.spine[clamp(pt.v | 0, 0, S.design.spine.length - 1)]; const o = (o0map && o0map.get(pt)) || pt.o;
      const c = sf.closest(v.p[0] + o[0], v.p[1] + o[1], v.p[2] + o[2]);
      pt.o = [c.p[0] - v.p[0], c.p[1] - v.p[1], c.p[2] - v.p[2]]; pt.n = c.n;
    });
  }
  function addVertebra() {
    const sp = S.design.spine, L = limits(); if (sp.length >= L.max) { flash('Spine is at its maximum length'); return; }
    let i = S.vsel >= 0 ? S.vsel : 0; const flat = S.design.kind === 'cell';
    let np;
    if (i === sp.length - 1 || (S.vsel < 0)) { // extend beyond an end
      const end = i === 0 || S.vsel < 0 ? 0 : sp.length - 1; const a = sp[end], b = sp[end === 0 ? Math.min(1, sp.length - 1) : end - 1];
      const dir = new T.Vector3(a.p[0] - b.p[0], a.p[1] - b.p[1], a.p[2] - b.p[2]); if (dir.lengthSq() < 1e-4) dir.set(0, 0, end === 0 ? -1 : 1); dir.normalize();
      const r = a.r * 0.85; np = { p: [a.p[0] + dir.x * (a.r + r) * 0.75, flat ? 0 : a.p[1] + dir.y * (a.r + r) * 0.75, a.p[2] + dir.z * (a.r + r) * 0.75], r: r };
      if (end === 0) { sp.unshift(np); allAnchored().forEach((p) => { p.v += 1; }); S.vsel = 0; } else { sp.push(np); S.vsel = sp.length - 1; }
    } else {
      const a = sp[i], b = sp[i + 1]; np = { p: [(a.p[0] + b.p[0]) / 2, (a.p[1] + b.p[1]) / 2, (a.p[2] + b.p[2]) / 2], r: (a.r + b.r) / 2 };
      sp.splice(i + 1, 0, np); allAnchored().forEach((p) => { if (p.v > i) p.v += 1; }); S.vsel = i + 1;
    }
    reprojectParts(); S.reframe = true; commit(); sfx('place');
  }
  function removeVertebra() {
    const sp = S.design.spine, L = limits(); if (sp.length <= L.min) { flash('Spine needs at least ' + L.min + ' vertebrae'); return; }
    const i = S.vsel >= 0 ? S.vsel : 0; sp.splice(i, 1);
    allAnchored().forEach((p) => { if (p.v > i) p.v -= 1; else if (p.v === i) p.v = Math.max(0, i - 1); });
    S.vsel = Math.min(S.vsel, sp.length - 1); if (S.vsel < 0) S.vsel = -1;
    reprojectParts(); commit(); sfx('remove');
  }
  function rebuildHandles() {
    const hg = S.handles; while (hg.children.length) { const ch = hg.children[0]; hg.remove(ch); ch.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material.dispose) o.material.dispose(); }); } // C-06: free the old handles
    S.handleMeshes = [];
    if (!S.design.spine) return;
    S.design.spine.forEach(function (s, i) {
      const g = new T.Group(); const core = new T.Mesh(new T.SphereGeometry(1, 14, 10), new T.MeshBasicMaterial({ color: 0x67e8f9, depthTest: false, transparent: true, opacity: 0.55 }));
      const ol = new T.Mesh(new T.SphereGeometry(1.28, 14, 10), new T.MeshBasicMaterial({ color: 0x22d3ee, side: T.BackSide, depthTest: false, transparent: true, opacity: 0.9 })); core.renderOrder = 41; ol.renderOrder = 40; g.add(ol, core); hg.add(g); S.handleMeshes.push({ g: g, core: core });
    });
    const pts = S.design.spine.map((s) => new T.Vector3().fromArray(s.p));
    S.spineLine = new T.Line(new T.BufferGeometry().setFromPoints(pts), new T.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, depthTest: false })); S.spineLine.renderOrder = 39; hg.add(S.spineLine);
  }

  // ------------------------------------------------------------------ overlay sync (per frame)
  const _q = new T.Quaternion(), _zv = new T.Vector3(0, 0, 1), _nv = new T.Vector3();
  function orientRing(m, pos, n, rad) { m.position.set(pos[0] + n[0] * 0.04, pos[1] + n[1] * 0.04, pos[2] + n[2] * 0.04); _nv.set(n[0], n[1], n[2]).normalize(); m.quaternion.setFromUnitVectors(_zv, _nv); m.scale.setScalar(rad); }
  function syncOverlay() {
    const showEdit = !S.test;
    S.frame.visible = showEdit;
    S.handlesOn = showEdit && S.tab && S.tab.type === 'body' && S.mode !== 'outfit' && !S.A.asm;
    S.handles.visible = S.handlesOn;
    if (S.handlesOn && S.handleMeshes) {
      S.design.spine.forEach(function (s, i) {
        const hm = S.handleMeshes[i]; if (!hm) return; const pos = new T.Vector3().fromArray(s.p);
        hm.g.position.copy(pos); hm.g.scale.setScalar(worldPerPx(pos) * (i === S.vsel ? 12 : 9));
        hm.core.material.color.setHex(i === S.vsel ? 0xfacc15 : 0x67e8f9);
      });
      const arr = S.spineLine.geometry.attributes.position; S.design.spine.forEach((s, i) => arr.setXYZ(i, s.p[0], s.p[1], s.p[2])); arr.needsUpdate = true; S.spineLine.geometry.computeBoundingSphere();
    }
    const pt = showEdit ? selPart() : null;
    S.ringSel.visible = S.ringTwin.visible = S.tipH.visible = S.tipLine.visible = false;
    if (pt) {
      const pos = S.A.posOf(S, pt), rad = 0.45 * (pt.s || 1);
      orientRing(S.ringSel, pos, pt.n, rad); S.ringSel.visible = true; S.ringSel.material.opacity = 0.75 + 0.25 * Math.sin(S.t * 6);
      if (pt.mirror) { orientRing(S.ringTwin, [-pos[0], pos[1], pos[2]], [-pt.n[0], pt.n[1], pt.n[2]], rad); S.ringTwin.visible = true; }
      const pd = partDef(pt);
      if (pd && S.A.isLimb(pd)) {
        const tip = limbTip(pt); S.tipH.position.copy(tip); S.tipH.scale.setScalar(worldPerPx(tip) * 9); S.tipH.visible = true;
        const a = S.tipLine.geometry.attributes.position; a.setXYZ(0, pos[0], pos[1], pos[2]); a.setXYZ(1, tip.x, tip.y, tip.z); a.needsUpdate = true; S.tipLine.geometry.computeBoundingSphere(); S.tipLine.visible = true;
      }
    }
    const hv = showEdit && S.hover && S.hover !== S.sel ? findPart(S.hover) : null; S.ringHov.visible = false;
    if (hv && !S.drag) { orientRing(S.ringHov, S.A.posOf(S, hv), hv.n, 0.45 * (hv.s || 1)); S.ringHov.visible = true; }
  }

  // ------------------------------------------------------------------ pointer interaction
  function viewportHasPointer(cx, cy) { const el = document.elementFromPoint(cx, cy); return el === S.ui.vp; }
  function setCursor(cls) { S.ui.vp.classList.toggle('hot', cls === 'hot'); S.ui.vp.classList.toggle('dragging', cls === 'drag'); }
  function setHint(t) { if (S.ui.hint) S.ui.hint.textContent = t || defaultHint(); }
  function defaultHint() {
    if (S.test) return 'Drag to spin the camera · wheel to zoom';
    if (S.tab && S.tab.type === 'body') return 'Drag a cyan handle to stretch the body · wheel over it to fatten · +/- add or remove';
    if (S.armed) return 'Click the body to place ' + (S.armed.name || 'the part') + ' · Esc cancels';
    return 'Drag a card onto the body · drag parts to move · wheel scales · R rotates · Del removes · X symmetry';
  }

  function onVpDown(e) {
    if (!S) return;
    S.ptr.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { S.ui.vp.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    if (S.ptr.size >= 2) { const pts = Array.from(S.ptr.values()); S.drag = { type: 'pinch', d0: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y), dist0: S.cam.distT }; return; }
    if (e.button === 2) { // right click: delete
      if (!S.test) { const pk = pickPart(e.clientX, e.clientY); if (pk) { removePart(pk.pt.uid); } }
      return;
    }
    const cx = e.clientX, cy = e.clientY;
    const base = { sx: cx, sy: cy, moved: 0, id: e.pointerId };
    if (S.test) { S.drag = Object.assign(base, { type: 'orbit' }); setCursor('drag'); return; }
    // C-11: in the Body tab the spine handles win over the selected part's rotate ring
    const viFirst = S.handlesOn ? pickVertebra(cx, cy) : -1;
    const sel = viFirst >= 0 ? null : selPart();
    if (sel) {
      const pd = partDef(sel);
      if (pd && S.A.isLimb(pd)) { const sc = toScreen(limbTip(sel)); if (Math.hypot(sc.x - cx, sc.y - cy) < 20) { S.drag = Object.assign(base, { type: 'tip', uid: sel.uid }); setCursor('drag'); return; } }
      const pos = new T.Vector3().fromArray(S.A.posOf(S, sel)); const rad = partRadiusPx(sel);
      for (let k = 0; k < (sel.mirror ? 2 : 1); k++) {
        const sc = toScreen(k ? new T.Vector3(-pos.x, pos.y, pos.z) : pos); const d = Math.hypot(sc.x - cx, sc.y - cy);
        if (d > rad * 0.78 && d < rad * 1.45) { const a0 = Math.atan2(cy - sc.y, cx - sc.x); S.drag = Object.assign(base, { type: 'rotate', uid: sel.uid, a0: a0, rot0: sel.rot || 0, cx: sc.x, cy: sc.y, flip: k ? -1 : 1 }); setCursor('drag'); return; }
      }
    }
    if (S.armed) { S.drag = Object.assign(base, { type: 'orbit', armedTap: true }); setCursor('drag'); return; }
    const vi = pickVertebra(cx, cy);
    if (vi >= 0) {
      S.vsel = vi; const o0 = new Map(); allAnchored().forEach((p) => o0.set(p, p.o.slice()));
      S.drag = Object.assign(base, { type: 'vert', i: vi, o0: o0, off: null }); setCursor('drag'); return;
    }
    const pk = pickPart(cx, cy);
    if (pk) { S.sel = pk.pt.uid; S.drag = Object.assign(base, { type: 'move', uid: pk.pt.uid, twin: pk.twin, started: false, snap: snap() }); refreshSel(); setCursor('drag'); return; }
    S.drag = Object.assign(base, { type: 'orbit', tapDeselect: true }); setCursor('drag');
  }

  function onVpMove(e) {
    if (!S) return;
    if (S.ptr.has(e.pointerId)) S.ptr.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const cx = e.clientX, cy = e.clientY, d = S.drag;
    if (!d) { hoverAt(cx, cy); return; }
    if (d.type === 'pinch') { if (S.ptr.size >= 2) { const pts = Array.from(S.ptr.values()); const nd = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y); S.cam.distT = clamp(d.dist0 * d.d0 / Math.max(20, nd), 4, 80); } return; }
    if (d.id !== undefined && e.pointerId !== d.id) return;
    d.moved = Math.max(d.moved || 0, Math.hypot(cx - d.sx, cy - d.sy));
    if (d.type === 'orbit') {
      S.turn.rotation.y += (cx - (d.lx === undefined ? d.sx : d.lx)) * 0.008; S.cam.pitchT = clamp(S.cam.pitchT + (cy - (d.ly === undefined ? d.sy : d.ly)) * 0.004, 0.04, 1.3);
      d.lx = cx; d.ly = cy;
    } else if (d.type === 'move') {
      if (!d.started && d.moved < 5) return;
      if (!d.started) { d.started = true; }
      const pt = findPart(d.uid); if (!pt) return;
      const hit = surfaceHit(cx, cy, S.A.asm ? pt.uid : null);
      if (!hit) { d.off = true; setHint('Release off the body to remove this part'); S.ui.vp.style.cursor = 'no-drop'; return; }
      S.ui.vp.style.cursor = ''; d.off = false; setHint();
      const pd = partDef(pt); let sy = symmetrize(hit, pd);
      if (S.A.asm && !SP.assembly.placeOk(pd, sy.n)) return;
      if (!S.sym) { sy.p = hit.p.slice(); sy.n = hit.n.slice(); sy.mirror = false; if (Math.abs(sy.p[0]) < 0.14) { sy.p[0] = 0; sy.n[0] = 0; } }
      S.A.place(S, pt, sy.p, sy.n); pt.mirror = sy.mirror; syncAttached(pt); markDirty();
    } else if (d.type === 'rotate') {
      const pt = findPart(d.uid); if (!pt) return; const a = Math.atan2(cy - d.cy, cx - d.cx); let da = a - d.a0; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
      pt.rot = d.rot0 - da * d.flip; if (!e.altKey) pt.rot = Math.round(pt.rot / (Math.PI / 24)) * (Math.PI / 24); markDirty();
    } else if (d.type === 'tip') {
      const pt = findPart(d.uid); if (!pt) return; const base = new T.Vector3().fromArray(S.A.posOf(S, pt));
      const r = localRay(cx, cy); const camDir = new T.Vector3(); S.camera.getWorldDirection(camDir);
      camDir.transformDirection(_inv.copy(S.frame.matrixWorld).invert());
      const tip = limbTip(pt); const denom = camDir.dot(r.d); if (Math.abs(denom) < 1e-4) return;
      const t = tip.clone().sub(r.o).dot(camDir) / denom; const q = r.o.clone().addScaledVector(r.d, t);
      if (pt.n[0] < 0) q.x = -q.x; // work on the +x side
      const bq = base.clone(); if (pt.n[0] < 0) bq.x = -bq.x; const v = q.sub(bq);
      pt.len = clamp(v.length() / 0.95, 0.6, 2.5); pt.bend = clamp((v.z / Math.max(0.1, v.length())) * 2.2, -1, 1);
      markDirty(); refreshStatsSoon();
    } else if (d.type === 'vert') {
      const r = localRay(cx, cy); const flat = S.design.kind === 'cell'; let t;
      if (flat) { if (Math.abs(r.d.y) < 0.05) return; t = -r.o.y / r.d.y; } else { if (Math.abs(r.d.x) < 0.05) return; t = -r.o.x / r.d.x; }
      if (t < 0) return; const q = r.o.clone().addScaledVector(r.d, t);
      const s = S.design.spine[d.i]; if (!d.off) d.off = [s.p[0] - q.x, s.p[1] - q.y, s.p[2] - q.z];
      s.p = flat ? [q.x + d.off[0], 0, q.z + d.off[2]] : [0, Math.max(0.35, q.y + d.off[1]), q.z + d.off[2]];
      clampSegments(d.i);
      reprojectParts(d.o0); markDirty(); refreshStatsSoon();
    }
  }

  // C-13: keep neighbouring vertebrae between 0.3x and 1.7x the sum of their radii apart
  function clampSegments(i) {
    const sp = S.design.spine, s = sp[i];
    [i - 1, i + 1].forEach((j) => {
      const o = sp[j]; if (!o) return;
      const dx = s.p[0] - o.p[0], dy = s.p[1] - o.p[1], dz = s.p[2] - o.p[2], dist = Math.hypot(dx, dy, dz) || 1e-6, rs = s.r + o.r;
      const lo = 0.3 * rs, hi = 1.7 * rs, want = Math.min(hi, Math.max(lo, dist)); if (Math.abs(want - dist) < 1e-6) return;
      const f = want / dist; s.p = [o.p[0] + dx * f, o.p[1] + dy * f, o.p[2] + dz * f];
      if (S.design.kind !== 'cell') s.p[0] = 0; else s.p[1] = 0;
    });
  }

  function onVpUp(e) {
    if (!S) return;
    S.ptr.delete(e.pointerId);
    try { S.ui.vp.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    const d = S.drag; if (!d) return;
    if (d.type === 'pinch') { if (S.ptr.size < 2) S.drag = null; return; }
    if (d.id !== undefined && e.pointerId !== d.id) return;
    S.drag = null; setCursor(''); S.ui.vp.style.cursor = '';
    if (d.type === 'orbit') {
      if (d.moved < 5) {
        if (d.armedTap && S.armed) { if (placeDef(S.armed, e.clientX, e.clientY)) { S.armed = null; refreshCards(); } }
        else if (d.tapDeselect) { S.sel = null; S.vsel = -1; refreshSel(); }
      }
    } else if (d.type === 'move') {
      if (d.started) {
        if (d.off) { removePart(d.uid); } else { commit(); sfx('place'); }
      } else refreshSel();
    } else if (d.type === 'rotate' || d.type === 'tip' || d.type === 'vert') { if (d.moved > 2) { commit(); } }
    setHint();
  }
  function hoverAt(cx, cy) {
    if (S.test) return;
    const el = document.elementFromPoint(cx, cy);
    if (el !== S.ui.vp) { S.hover = null; hideGhost(); return; }
    const pk = pickPart(cx, cy); S.hover = pk ? pk.pt.uid : null;
    const vi = pickVertebra(cx, cy);
    setCursor(pk || vi >= 0 ? 'hot' : '');
    if (S.armed) { const ev = evalPlacement(S.armed, cx, cy); if (ev.pos) showGhost(S.armed, ev.pos, ev.n, 1, 0, ev.mirror, ev.ok); else hideGhost(); } else hideGhost();
  }
  function onVpWheel(e) {
    if (!S) return; e.preventDefault();
    const k = Math.exp(-e.deltaY * 0.0006); // C-10: ~7% per notch
    if (!S.test) {
      // lock the target for 400 ms after the first hit so a moving body can't hand the wheel to another part
      const now = performance.now(), lk = S.wheelLock && now - S.wheelLock.t < 400 ? S.wheelLock : null;
      let vi = lk ? (lk.kind === 'vert' ? lk.id : -1) : pickVertebra(e.clientX, e.clientY);
      if (vi >= 0) {
        S.wheelLock = { kind: 'vert', id: vi, t: now };
        S.vsel = vi; const s = S.design.spine[vi]; s.r = clamp(s.r * k, 0.25, 1.6); reprojectParts(); markDirty();
        clearTimeout(S.wheelTimer); S.wheelTimer = setTimeout(() => { if (S) commit(); }, 350); refreshStatsSoon(); return;
      }
      let target = null;
      if (lk && lk.kind === 'part') target = findPart(lk.id);
      else if (!lk) { const pk = pickPart(e.clientX, e.clientY); target = pk ? pk.pt : (selPart() && S.hover === S.sel ? selPart() : null); }
      else if (lk) return; // locked on a vertebra that was just removed: ignore
      if (target) { S.wheelLock = { kind: 'part', id: target.uid, t: now }; S.sel = target.uid; scalePart(target, k); return; }
    }
    S.cam.distT = clamp(S.cam.distT / k, 4, 80);
  }

  // palette drag
  function startCardDrag(def, e) {
    if (!S.isUnlocked(def)) { flash('Locked: find bone piles! 🦴'); return; }
    S.cardDown = { def: def, x: e.clientX, y: e.clientY, active: false, id: e.pointerId };
    window.addEventListener('pointermove', onWinMove); window.addEventListener('pointerup', onWinUp);
  }
  function onWinMove(e) {
    const c = S && S.cardDown; if (!c || e.pointerId !== c.id) return;
    if (!c.active && Math.hypot(e.clientX - c.x, e.clientY - c.y) > 7) {
      c.active = true; S.armed = null; S.ui.ghostCard = h('div', 'ed-ghostcard', c.def.icon || '❓'); document.body.appendChild(S.ui.ghostCard);
      S.sel = null; refreshSel(); setHint('Drop it on the body');
    }
    if (c.active) {
      S.ui.ghostCard.style.left = e.clientX + 'px'; S.ui.ghostCard.style.top = e.clientY + 'px';
      if (viewportHasPointer(e.clientX, e.clientY)) {
        S.ui.ghostCard.style.opacity = 0.35;
        const ev = evalPlacement(c.def, e.clientX, e.clientY);
        if (ev.pos) showGhost(c.def, ev.pos, ev.n, 1, 0, ev.mirror, ev.ok); else hideGhost();
        c.ev = ev;
      } else { S.ui.ghostCard.style.opacity = 0.95; hideGhost(); c.ev = null; }
    }
  }
  function onWinUp(e) {
    const c = S && S.cardDown; if (!c || e.pointerId !== c.id) return;
    window.removeEventListener('pointermove', onWinMove); window.removeEventListener('pointerup', onWinUp);
    S.cardDown = null;
    if (c.active) {
      if (S.ui.ghostCard) { S.ui.ghostCard.remove(); S.ui.ghostCard = null; }
      hideGhost(); setHint();
      if (viewportHasPointer(e.clientX, e.clientY)) placeDef(c.def, e.clientX, e.clientY);
    } else { // tap: arm / disarm
      S.armed = S.armed === c.def ? null : c.def; S.sel = null; refreshCards(); refreshSel(); setHint();
      if (S.armed) sfx('click');
    }
  }

  // keyboard
  function onKey(e) {
    if (!S) return;
    const typing = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');
    if (typing) { if (e.key === 'Enter' || e.key === 'Escape') e.target.blur(); return; }
    const k = e.key, ctrl = e.ctrlKey || e.metaKey;
    if (S.test && !S.A.asm && !ctrl && DRIVE_KEYS[k.toLowerCase()]) { S.keys = S.keys || {}; S.keys[k.toLowerCase()] = true; if (k !== 'Shift') e.preventDefault(); return; }
    if (ctrl && (k === 'z' || k === 'Z')) { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (ctrl && (k === 'y' || k === 'Y')) { e.preventDefault(); redo(); return; }
    if (k === 'Delete' || k === 'Backspace') { if (S.sel) { e.preventDefault(); removePart(S.sel); } return; }
    if (k === 'x' || k === 'X') { toggleSym(); return; }
    if (k === 'r' || k === 'R') { const p = selPart(); if (p) { rotatePart(p, (e.shiftKey ? -1 : 1) * Math.PI / 12); } return; }
    if (k === '[') { const p = selPart(); if (p) scalePart(p, 0.92); return; }
    if (k === ']') { const p = selPart(); if (p) scalePart(p, 1.08); return; }
    if (k === '+' || k === '=') { if (S.handlesOn) { e.preventDefault(); addVertebra(); } return; }
    if (k === '-' || k === '_') { if (S.handlesOn) { e.preventDefault(); removeVertebra(); } return; }
    if (k === 'Escape') { if (S.armed) { S.armed = null; refreshCards(); setHint(); } else if (S.sel) { S.sel = null; refreshSel(); } else if (S.vsel >= 0) S.vsel = -1; return; }
  }
  function onKeyUp(e) { if (S && S.keys && e) { S.keys[(e.key || '').toLowerCase()] = false; } }
  const DRIVE_KEYS = { w: 1, a: 1, s: 1, d: 1, arrowup: 1, arrowdown: 1, arrowleft: 1, arrowright: 1, ' ': 1, shift: 1, c: 1 };
  function toggleSym() { S.sym = !S.sym; if (S.ui.symBtn) { S.ui.symBtn.classList.toggle('on', S.sym); } sfx('click'); }

  // ------------------------------------------------------------------ UI
  function btn(cls, html, title, fn) { const b = h('button', 'ed-btn ' + cls, html); if (title) b.title = title; b.type = 'button'; b.addEventListener('click', function (e) { e.stopPropagation(); sfx('click'); fn(e); }); return b; }
  function buildTabs() {
    const A = S.A, tabs = [];
    if (A.asm) {
      const cats = SP.assemblyParts.categories[S.design.kind] || {};
      tabs.push({ id: 'core', type: 'core', name: cats.core ? cats.core.name : 'Core', icon: cats.core ? cats.core.icon : '🏛️', color: cats.core ? cats.core.color : '#22c55e' });
      const byCat = SP.assemblyParts.forDesign(S.design);
      Object.keys(cats).forEach(function (c) { if (c === 'core' || !byCat[c]) return; tabs.push({ id: c, type: 'parts', name: cats[c].name, icon: cats[c].icon, color: cats[c].color, parts: byCat[c] }); });
    } else {
      if (S.mode !== 'outfit') tabs.push({ id: 'body', type: 'body', name: 'Body', icon: '🧬', color: '#22c55e' });
      const byCat = SP.parts.byCategory(S.mode === 'outfit' ? 'outfit' : S.mode === 'cell' ? 'cell' : 'creature');
      Object.keys(byCat).sort((a, b) => CAT_ORDER.indexOf(a) - CAT_ORDER.indexOf(b)).forEach(function (c) {
        const m = CAT[c] || ['🔹', '#94a3b8']; tabs.push({ id: c, type: 'parts', name: c.charAt(0).toUpperCase() + c.slice(1), icon: m[0], color: m[1], parts: byCat[c] });
      });
    }
    if (S.mode !== 'outfit') tabs.push({ id: 'paint', type: 'paint', name: 'Paint', icon: '🎨', color: '#ec4899' });
    tabs.push({ id: 'test', type: 'test', name: 'Test Drive', icon: '▶️', color: '#0ea5e9' });
    S.tabs = tabs;
  }
  function buildUI() {
    let host = document.getElementById('editor-ui');
    if (!host) { host = h('div'); host.id = 'editor-ui'; host.style.cssText = 'position:absolute;inset:0;z-index:12;pointer-events:none'; document.body.appendChild(host); }
    host.innerHTML = '';
    const root = h('div', 'ed-root'); host.appendChild(root); S.ui.root = root;
    const vp = h('div', 'ed-viewport'); root.appendChild(vp); S.ui.vp = vp;
    vp.addEventListener('pointerdown', onVpDown); vp.addEventListener('pointermove', onVpMove); vp.addEventListener('pointerup', onVpUp); vp.addEventListener('pointercancel', onVpUp);
    vp.addEventListener('wheel', onVpWheel, { passive: false }); vp.addEventListener('contextmenu', (e) => e.preventDefault());
    vp.addEventListener('pointerleave', () => { if (!S.drag) { S.hover = null; hideGhost(); } });
    buildTabs();
    // top bar
    const top = h('div', 'ed-panel ed-top'); root.appendChild(top);
    top.appendChild(h('span', 'ed-title ed-stroke', (CUR[S.A.cur(S)] ? '🧪 ' : '') + (S.opts.title || TITLES[S.mode])));
    const nm = h('input', 'ed-name'); nm.type = 'text'; nm.maxLength = 28; nm.placeholder = 'Name'; nm.value = S.design.name || ''; nm.addEventListener('input', () => { S.design.name = nm.value; });
    nm.addEventListener('keydown', (e) => e.stopPropagation()); top.appendChild(nm); S.ui.name = nm;
    const g1 = h('div', 'ed-group'); top.appendChild(g1);
    S.ui.undo = btn('ed-sq ed-slate', '↶', 'Undo (Ctrl+Z)', undo); S.ui.redo = btn('ed-sq ed-slate', '↷', 'Redo (Ctrl+Y)', redo); g1.append(S.ui.undo, S.ui.redo);
    S.ui.symBtn = btn('ed-sq ed-indigo on', '🪞', 'Symmetry (X)', toggleSym); g1.appendChild(S.ui.symBtn);
    g1.appendChild(btn('ed-sq ed-purple', '🎲', 'Randomize', randomize));
    top.appendChild(h('div', 'ed-spacer'));
    const g2 = h('div', 'ed-group'); top.appendChild(g2);
    if (S.allowCancel) g2.appendChild(btn('ed-rose', '✖<span class="t"> Cancel</span>', 'Cancel (discard changes)', cancel));
    S.ui.done = btn('ed-green', '✔<span class="t"> Done</span>', 'Finish', done); g2.appendChild(S.ui.done);
    // left rail + palette
    const left = h('div', 'ed-left'); root.appendChild(left);
    const rail = h('div', 'ed-panel ed-rail'); left.appendChild(rail); S.ui.rail = rail;
    S.tabs.forEach(function (t) {
      const b = h('button', 'ed-tab', t.icon + '<span class="lbl">' + t.name + '</span>'); b.type = 'button'; b.style.setProperty('--c', t.color); b.title = t.name;
      b.addEventListener('click', () => { sfx('click'); selectTab(t); }); rail.appendChild(b); t.btn = b;
    });
    const pal = h('div', 'ed-panel ed-pal'); left.appendChild(pal); S.ui.pal = pal;
    // right: stats
    const st = h('div', 'ed-panel ed-stats'); root.appendChild(st); S.ui.stats = st;
    S.ui.hint = h('div', 'ed-panel ed-hint', ''); root.appendChild(S.ui.hint);
    // selection toolbar
    const sel = h('div', 'ed-panel ed-sel'); root.appendChild(sel); S.ui.sel = sel;
    sel.appendChild(h('span', 'nm', ''));
    sel.appendChild(btn('ed-slate', '➖', 'Smaller ([)', () => { const p = selPart(); if (p) scalePart(p, 0.88); }));
    sel.appendChild(btn('ed-slate', '➕', 'Bigger (])', () => { const p = selPart(); if (p) scalePart(p, 1.14); }));
    sel.appendChild(btn('ed-slate', '⟳', 'Rotate (R)', () => { const p = selPart(); if (p) rotatePart(p, Math.PI / 12); }));
    sel.appendChild(btn('ed-slate', '🪞', 'Mirror pair on/off', () => { const p = selPart(); if (p) toggleMirror(p); }));
    sel.appendChild(btn('ed-rose', '🗑', 'Remove (Del)', () => { if (S.sel) removePart(S.sel); }));
    selectTab((S.mode === 'creature' || S.mode === 'cell') && S.tabs.filter((x) => x.type !== 'body')[0] || S.tabs[0], true); // C-12: don't open on the Body tab (its handles look like eyes)
    if (window.matchMedia && window.matchMedia('(max-width: 760px)').matches) st.classList.add('collapsed');
  }
  function selectTab(t, silent) {
    if (S.tab && S.tab.type === 'test' && t.type !== 'test') exitTest();
    S.tab = t; S.armed = null; hideGhost();
    S.tabs.forEach((x) => x.btn.classList.toggle('active', x === t));
    if (t.type === 'test') enterTest();
    renderPalette(); setHint(); refreshCards();
  }
  function renderPalette() {
    const pal = S.ui.pal, t = S.tab; pal.innerHTML = ''; pal.style.setProperty('--c', t.color);
    const head = h('div', 'ed-pal-head', '<span>' + t.icon + ' ' + t.name + '</span><small></small>'); pal.appendChild(head);
    const cur = CUR[S.A.cur(S)] || '';
    if (t.type === 'parts') {
      { const nu = t.parts.filter((d) => S.isUnlocked(d)).length; head.lastChild.textContent = nu < t.parts.length ? nu + '/' + t.parts.length + ' unlocked' : t.parts.length + ' parts'; } /* C-22 */ const grid = h('div', 'ed-cards'); pal.appendChild(grid); S.ui.cards = [];
      t.parts.forEach(function (d) { const c = makeCard(d, cur); grid.appendChild(c); S.ui.cards.push({ el: c, def: d }); });
    } else if (t.type === 'core') {
      const grid = h('div', 'ed-cards'); pal.appendChild(grid); S.ui.cards = [];
      SP.assemblyParts.cores(S.design.kind, S.design.role).forEach(function (d) {
        const c = makeCard(d, cur, true); c.addEventListener('click', () => chooseCore(d)); grid.appendChild(c); S.ui.cards.push({ el: c, def: d, core: true });
      });
      head.lastChild.textContent = 'Pick one';
    } else if (t.type === 'body') {
      const box = h('div', 'ed-paint'); pal.appendChild(box);
      box.appendChild(h('div', 'ed-msgs', '<div class="w" style="color:#cbd5e1">Drag the cyan handles to stretch the spine. Wheel over a handle to make it fatter or thinner. Parts follow their vertebra.</div>'));
      const row = h('div', 'ed-slot-btn'); box.appendChild(row);
      row.append(btn('ed-green', '➕ Add', 'Add a vertebra (+)', addVertebra), btn('ed-rose', '➖ Remove', 'Remove a vertebra (-)', removeVertebra));
      const info = h('div', 'ed-msgs'); info.style.color = '#94a3b8'; box.appendChild(info); S.ui.spineInfo = info;
    } else if (t.type === 'paint') renderPaint();
    else if (t.type === 'test') renderTestPanel();
  }
  function makeCard(d, cur, isCore) {
    const locked = !S.isUnlocked(d);
    const c = h('div', 'ed-card' + (locked ? ' locked' : '')); c.style.setProperty('--c', S.tab.color); c.title = locked ? 'Locked: find bone piles' : (d.desc || d.name);
    c.appendChild(h('div', 'ic', locked ? (d.icon || '❓') : (d.icon || '❓')));
    c.appendChild(h('div', 'nm', locked ? '???' : d.name));
    const pips = h('div', 'pips');
    if (locked) pips.innerHTML = '<span class="pip">🦴</span>';
    else {
      const ab = d.abilities || {}; Object.keys(ab).slice(0, 3).forEach((k) => { if (ABIL[k]) pips.appendChild(h('span', 'pip', ABIL[k][0] + '<b>' + ab[k] + '</b>')); });
      const ob = d.outfitBonus || {}; Object.keys(ob).forEach((k) => { if (ob[k] && BONUS[k]) pips.appendChild(h('span', 'pip', BONUS[k][0] + '+' + ob[k])); });
      if (d.diet) pips.appendChild(h('span', 'pip', (DIET[d.diet] || ['', ''])[0]));
      if (d.fin) pips.appendChild(h('span', 'pip', '🐟<b>' + d.fin + '</b>'));                     // swim level (water, DESIGN 3.6)
      if (d.gill || d.lung || d.snorkel) pips.appendChild(h('span', 'pip', '🫧<b>' + (d.gill ? Math.round(d.gill * 100) + '%' : '+' + (d.lung || 0)) + '</b>'));
      if (d.dens !== undefined && (d.dens <= 0.3 || d.dens >= 2.4)) pips.appendChild(h('span', 'pip', d.dens <= 0.3 ? '🎈' : '⚓'));
      if (d.stats) { const SI = { power: '💥', speed: '💨', health: '❤️', defense: '🛡️', energy: '🔋', range: '🎯', capacity: '📦', happiness: '😀', production: '🏭' }; Object.keys(d.stats).filter((k) => d.stats[k]).slice(0, 3).forEach((k) => pips.appendChild(h('span', 'pip', (SI[k] || k) + '<b>' + (d.stats[k] > 0 ? '+' : '') + d.stats[k] + '</b>'))); }
    }
    c.appendChild(pips);
    const co = h('div', 'co', locked ? 'Find bone piles' : (isCore ? '' : cur + ' ' + d.cost)); co.dataset.cost = d.cost; if (isCore) co.textContent = (CUR[S.A.cur(S)] || '') + ' ' + d.cost; c.appendChild(co);
    if (!isCore) c.addEventListener('pointerdown', (e) => { if (e.button === 0) startCardDrag(d, e); });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    return c;
  }
  function chooseCore(d) {
    if (S.design.core === d.id) return;
    const before = snap(); S.design.core = d.id;
    const dropped = SP.assembly.reproject(S.design);
    if (S.budget !== null && (S.A.cost(S) - S.cost0) > S.budget) { S.design = JSON.parse(before); flash('Not enough ' + S.A.cur(S) + '!'); return; }
    if (dropped.length) toast(dropped.length + ' part(s) fell off', '🧹'); S.sel = null; S.reframe = true; commit(); sfx('place');
  }
  function refreshCards() {
    if (!S.ui.cards) return; const rem = budgetInfo().remaining;
    S.ui.cards.forEach(function (c) {
      c.el.classList.toggle('armed', S.armed === c.def);
      c.el.classList.toggle('chosen', !!c.core && S.design.core === c.def.id);
      const co = c.el.querySelector('.co'); if (co && !c.core && S.isUnlocked(c.def)) co.classList.toggle('bad', c.def.cost > rem);
    });
  }
  // paint
  function renderPaint() {
    const pal = S.ui.pal, box = h('div', 'ed-paint'); pal.appendChild(box);
    const slots = [['base', 'Base colour', '🎨'], ['accent', 'Accent colour', '🖍️'], ['detail', 'Detail colour', '✏️']];
    S.paintSlot = S.paintSlot || 'base';
    const row = h('div', 'ed-slot-btn'); box.appendChild(row);
    slots.forEach(function (s) { const b = btn('ed-slate' + (S.paintSlot === s[0] ? ' on' : ''), s[2] + ' ' + s[0], s[1], () => { S.paintSlot = s[0]; renderPalette(); }); row.appendChild(b); });
    const sec = h('div'); box.appendChild(sec); sec.appendChild(h('h4', '', 'Pick a ' + S.paintSlot + ' colour'));
    const grid = h('div', 'ed-swatches'); sec.appendChild(grid);
    const cur = toHexNum(S.design.colors[S.paintSlot], 0);
    SWATCHES.forEach(function (c) {
      const b = h('button', 'ed-sw' + (c === cur ? ' sel' : '')); b.type = 'button'; b.style.background = hex(c); b.title = hex(c);
      b.addEventListener('click', () => { sfx('click'); const old = S.design.colors[S.paintSlot]; S.design.colors[S.paintSlot] = typeof old === 'string' ? hex(c) : c; commit(); renderPalette(); });
      grid.appendChild(b);
    });
    if (!S.A.asm) {
      const ps = h('div'); box.appendChild(ps); ps.appendChild(h('h4', '', 'Pattern'));
      const pg = h('div', 'ed-pats'); ps.appendChild(pg);
      PATTERNS.forEach(function (p) { pg.appendChild(btn('ed-slate' + ((S.design.colors.pattern || 'none') === p[0] ? ' on' : ''), p[1], 'Body pattern', () => { S.design.colors.pattern = p[0]; commit(); renderPalette(); })); });
    }
  }
  // test drive
  function renderTestPanel() {
    const pal = S.ui.pal, box = h('div', 'ed-test'); pal.appendChild(box);
    const spd = h('div', 'row'); box.appendChild(spd);
    [['idle', '🧍 Idle'], ['walk', '🚶 Walk'], ['run', '🏃 Top speed']].forEach(function (s) { const b = btn('ed-slate' + (S.test.speed === s[0] && !S.test.drive ? ' on' : ''), s[1], '', () => { S.test.speed = s[0]; endDrive(); renderPalette(); }); spd.appendChild(b); });
    spd.appendChild(btn('ed-slate' + (S.test.circle ? ' on' : ''), '⭕ Circle', 'Walk around the pedestal', () => { endDrive(); S.test.circle = !S.test.circle; if (!S.test.circle) { S.rig.root.position.set(0, 0, 0); S.rig.root.rotation.y = 0; } renderPalette(); }));
    if (!S.A.asm && S.rig && S.rig.stats && S.rig.stats.waterClass && S.rig.stats.gait !== 'cell') {
      const wb = btn('ed-slate' + (S.test.water ? ' on' : ''), '🌊 Water tank', 'Drop it in a pool: does it float, swim or sink? (Space kicks up, C dives)', () => { toggleWater(); renderPalette(); });
      spd.appendChild(wb);
      if (S.test.water) { const wi = h('div', 'ed-msgs ed-waterinfo'); box.appendChild(wi); S.ui.waterInfo = wi; }
    }
    if (!S.A.asm) {
      box.appendChild(h('h4', '', 'Actions'));
      const row = h('div', 'row'); box.appendChild(row); const ab = S.rig && S.rig.stats ? S.rig.stats.abilities || {} : {};
      ACTIONS.forEach(function (a) { const has = ab[a[0]] > 0 || ['eat', 'hurt', 'celebrate'].indexOf(a[0]) >= 0; row.appendChild(btn('ed-cyan' + (has ? '' : ' dim'), a[1] + ' ' + a[2], has ? '' : 'No part gives this ability', () => { S.test.action = a[0]; S.test.actionT = 0; S.test.actionLen = a[0] === 'dance' || a[0] === 'sing' ? 3 : 1.5; sfx(a[0] === 'bite' ? 'hit' : a[0]); })); });
    } else box.appendChild(h('div', 'ed-msgs', '<div class="w" style="color:#cbd5e1">Wheels roll, rotors spin and engines burn at the speed you pick.</div>'));
    const t = S.rig && S.rig.stats && S.rig.stats.topSpeed; if (t) box.appendChild(h('div', 'ed-msgs', '<div style="color:#94a3b8">Top speed ' + t.toFixed(1) + ' u/s</div>'));
  }
  function toggleWater() {
    const T_ = S.test; if (!T_) return;
    T_.water = !T_.water; T_.circle = false;
    if (T_.water) { endDrive(); T_.drive = { x: 0, z: 0, h: 0, v: 0, y: 0, vy: 0 }; T_.w = null; S.treadmill.visible = false; S.cam.distT = Math.max(S.cam.distT, 11); }
    else { T_.drive = null; S.pool.visible = false; S.rig.root.position.set(0, 0, 0); S.rig.root.rotation.y = 0; if (S.rig.setTint) S.rig.setTint(null); }
  }
  // mini water simulation for the test tank (same rules as SP.physics, DESIGN 3.6; no planet needed)
  function stepWater(dt, K, fw, tn) {
    const T_ = S.test, rig = S.rig, st = rig.stats, D = T_.drive || (T_.drive = { x: 0, z: 0, h: 0, v: 0, y: 0, vy: 0 });
    const cls = st.waterClass, H = Math.max(0.6, st.height || 2), dens = st.density || 0.95;
    const R = S.pedScale * 3.4 * 0.9, depth = Math.max(2.6, H * 1.35 + 0.6);
    const pool = S.pool; pool.visible = true; S.treadmill.visible = false;
    pool.userData.wall.scale.set(R, depth, R); pool.userData.wall.position.y = depth / 2; pool.userData.top.scale.set(R, R, 1); pool.userData.top.position.y = depth;
    pool.userData.rim.scale.set(R, R, R); pool.userData.rim.position.y = depth; pool.userData.floor.scale.set(R, R, 1);
    S.cam.tgtT.y = depth * 0.55; S.cam.distT = Math.max(S.cam.distT, depth * 2.6 + R * 1.2);        // frame the whole tank
    const W = T_.w || (T_.w = { y: depth - 0.2, vy: 0, breath: st.breath, kick: 0, t: 0 });
    W.t += dt; W.kick -= dt;
    const draft = cls === 'sinker' ? 0 : H * Math.max(0.18, Math.min(0.55, 0.6 * dens)) * (cls === 'swimmer' ? 0.85 : 1);
    const eq = depth - draft + (cls === 'floater' ? 0.05 : 0.03) * H * Math.sin(W.t * 1.7);
    const jp = !!K[' '], dive = !!K.c && cls === 'swimmer';
    if (cls === 'sinker') {
      if (jp && W.kick <= 0 && W.y < depth) { W.vy = Math.max(W.vy, Math.min(6.5, (st.jumpV || 4) * 1.1 + 0.5)); W.kick = 0.5; }
      W.vy += (-(st.sinkRate || 1.2) - W.vy) * (1 - Math.exp(-3.2 * dt));
      W.y = Math.max(0, Math.min(depth - 0.05, W.y + W.vy * dt)); if (W.y <= 0 || W.y >= depth - 0.05) W.vy = 0;
    } else {
      const tgt = dive ? Math.max(0.05, eq - (st.diveDepth || 1.5)) : eq;
      const want = dive ? (W.y > tgt + 0.04 ? -2 : 0) : (cls === 'swimmer' && jp && W.y < eq - 0.25 ? 3.2 : Math.max(-2.5, Math.min(2.8, (tgt - W.y) * 7)));
      W.vy += (want - W.vy) * Math.min(1, 9 * dt); W.y = Math.max(0, Math.min(eq + 0.1, W.y + W.vy * dt));
    }
    const wl = depth - W.y, headH = H * 0.82 + (st.snorkel || 0);
    const sub = cls === 'floater' ? 0 : Math.max(0, Math.min(1, (wl - headH * 0.92) / (headH * 0.16)));
    if (sub >= 0.5) W.breath = Math.max(0, W.breath - dt * (1 - (st.gill || 0))); else if (sub <= 0.25) W.breath = Math.min(st.breath, W.breath + dt * st.breath / 3.5 * (st.breathRefill || 1));
    const drowning = W.breath <= 0; W.drown = drowning ? (W.drown || 0) + dt : 0;
    if (W.drown > 3.5) { W.y = depth - 0.2; W.vy = 0; W.breath = st.breath; W.drown = 0; }       // pulled out, try again
    const onFloor = cls === 'sinker' && W.y <= 0.02;
    const top = onFloor ? st.topSpeed * 0.45 : st.swimSpeed;
    const tgtV = fw * top * (fw < 0 ? 0.5 : 1), a = (st.accel || 8) * dt; D.v += Math.max(-a, Math.min(a, tgtV - D.v));
    D.h += tn * (st.turnRate || 3) * dt * Math.min(1, 0.35 + Math.abs(D.v) / Math.max(1, top));
    D.x += Math.sin(D.h) * D.v * dt; D.z += Math.cos(D.h) * D.v * dt;
    const rr = Math.hypot(D.x, D.z), lim = R * 0.8; if (rr > lim) { D.x *= lim / rr; D.z *= lim / rr; D.v *= 0.6; }
    rig.root.position.set(D.x, W.y, D.z); rig.root.rotation.y = D.h;
    try { SP.creature.animate(rig, dt, { speed: D.v, turn: tn * (st.turnRate || 3), action: null, actionT: 0, airborne: false, inWater: !onFloor && wl > 0.2 * H, waterState: sub > 0.5 ? 'submerged' : 'floating', submerged: sub, drowning: drowning }); } catch (e) { console.error(e); }
    const wi = S.ui && S.ui.waterInfo;
    if (wi) {
      const cn = { floater: '🛟 Floats', swimmer: '🐟 Swims', sinker: '⚓ Sinks' }[cls];
      wi.innerHTML = '<div style="color:#a5f3fc;font-weight:800">' + cn + ' · breath ' + W.breath.toFixed(1) + ' / ' + st.breath.toFixed(0) + ' s' + (drowning ? ' · <span style="color:#fb7185">DROWNING</span>' : '') + '</div><div style="color:#94a3b8">' + (cls === 'sinker' ? 'Space: kick up · WASD: walk the floor' : cls === 'swimmer' ? 'C: dive · Space: surface · WASD: paddle' : 'Bobs at the surface · WASD: paddle slowly') + '</div>';
    }
  }
  function endDrive() { if (S.test && S.test.drive) { S.test.drive = null; S.rig.root.position.set(0, 0, 0); S.rig.root.rotation.y = 0; } }
  function enterTest() {
    S.test = { speed: 'run', action: null, actionT: 0, actionLen: 1.5, circle: false, ang: 0, scroll: 0 };
    S.treadmill.visible = true; S.armed = null; S.sel = null; if (S.rig) S.rig.root.visible = true; hideGhost();
    S.cam.pitchT = 0.2; S.cam.distT = Math.max(S.cam.distT, 9); S.keys = {};
    refreshSel(); setHint('Test drive: WASD / arrows to walk, Space to jump, Shift to sprint');
  }
  function exitTest() {
    if (S.pool) S.pool.visible = false;
    S.test = null; S.keys = {}; S.treadmill.visible = false; markDirty();
    if (S.rig) { S.rig.root.position.set(0, 0, 0); S.rig.root.rotation.y = 0; }
    S.cam.pitchT = S.basePitch;
  }
  function stepTest(dt) {
    const T_ = S.test, rig = S.rig; if (!rig) return;
    const st = rig.stats || {}; const top = S.A.asm ? 2 + (st.speed || 0) * 0.55 : (st.topSpeed || 3);
    const sp = T_.speed === 'idle' ? 0 : T_.speed === 'walk' ? top * 0.5 : top;
    if (T_.action) { T_.actionT += dt; if (T_.actionT > T_.actionLen) T_.action = null; }
    const R = S.pedScale * 3.4;
    if (!S.A.asm) {
      // C-15: interactive test drive with the creature's real stats (accel, turn rate, top speed, jump, sprint)
      const K = S.keys || {}, fw = (K.w || K.arrowup ? 1 : 0) - (K.s || K.arrowdown ? 1 : 0), tn = (K.a || K.arrowleft ? 1 : 0) - (K.d || K.arrowright ? 1 : 0), jp = !!K[' '];
      if (T_.water) { stepWater(dt, K, fw, tn); return; }
      if ((fw || tn || jp) && !T_.drive) { T_.drive = { x: 0, z: 0, h: 0, v: 0, y: 0, vy: 0 }; T_.circle = false; S.treadmill.visible = false; renderPalette(); }
      if (T_.drive) {
        const D = T_.drive, tgt = fw * (st.topSpeed || 4) * (K.shift ? (st.sprintMul || 1.4) : 1) * (fw < 0 ? 0.5 : 1);
        const dv = tgt - D.v, a = (st.accel || 8) * dt * (tgt === 0 ? 1.5 : 1); D.v += Math.max(-a, Math.min(a, dv));
        D.h += tn * (st.turnRate || 3) * dt * Math.min(1, 0.35 + Math.abs(D.v) / Math.max(1, st.topSpeed || 4));
        D.x += Math.sin(D.h) * D.v * dt; D.z += Math.cos(D.h) * D.v * dt;
        const rr = Math.hypot(D.x, D.z), lim = R * 0.85; if (rr > lim) { D.x *= lim / rr; D.z *= lim / rr; D.v *= 0.6; }
        if (D.y <= 0 && jp) { D.vy = st.jumpV || 4; D.y = 0.001; }
        if (D.y > 0) { D.vy -= 14 * dt; D.y += D.vy * dt; if (D.y <= 0) { D.y = 0; D.vy = 0; } }
        rig.root.position.set(D.x, D.y, D.z); rig.root.rotation.y = D.h; S.treadmill.visible = false;
        try { SP.creature.animate(rig, dt, { speed: D.v, turn: tn * (st.turnRate || 3), action: T_.action, actionT: T_.actionT, airborne: D.y > 0.02, inWater: false }); } catch (e) { console.error(e); }
        return;
      }
    }
    if (S.A.asm) rig.animate(dt, { speed: sp, throttle: sp / Math.max(1, top) });
    else { try { SP.creature.animate(rig, dt, { speed: sp, turn: T_.circle ? sp / 3 : 0, action: T_.action, actionT: T_.actionT, airborne: false, inWater: false }); } catch (e) { console.error(e); S.test.speed = 'idle'; } }
    if (T_.circle) { T_.ang += sp / Math.max(2.5, R * 0.6) * dt; const rr = R * 0.6; rig.root.position.set(Math.sin(T_.ang) * rr, 0, Math.cos(T_.ang) * rr); rig.root.rotation.y = T_.ang + Math.PI / 2; S.treadmill.visible = false; }
    else { S.treadmill.visible = true; rig.root.position.set(0, 0, 0); rig.root.rotation.y = 0; T_.scroll = (T_.scroll + sp * dt) % 1.2; S.planks.forEach((p, i) => { let z = ((i * 0.6 - T_.scroll + 4.2) % 8.4 + 8.4) % 8.4 - 4.2; p.position.z = z; p.scale.x = Math.max(0.6, S.pedScale * 0.9); p.visible = Math.abs(z) < S.pedScale * 3.2; }); }
  }

  // stats panel
  let statsTimer = 0;
  function refreshStatsSoon() { if (statsTimer) return; statsTimer = setTimeout(function () { statsTimer = 0; if (S) refreshStats(); }, 60); }
  function bar(icon, label, frac, valTxt, color) {
    const r = h('div', 'ed-bar'); r.style.setProperty('--c', color || '#22c55e');
    r.innerHTML = '<span>' + icon + ' ' + label + '</span><div class="tr"><div class="fi" style="width:' + Math.round(clamp(frac, 0, 1) * 100) + '%"></div></div><span class="v">' + valTxt + '</span>'; return r;
  }
  function refreshStats() {
    const box = S.ui.stats; const collapsed = box.classList.contains('collapsed'); box.innerHTML = '';
    let st; try { st = S.A.stats(S); } catch (e) { console.error(e); return; }
    const val = validity(), b = val.b, cx = val.cx, cur = CUR[S.A.cur(S)] || '';
    const head = h('h3', '', '📊 Stats'); box.appendChild(head);
    const tog = h('span', 'ed-stats-toggle', collapsed ? '▼' : '▲'); tog.style.cursor = 'pointer'; tog.addEventListener('click', () => { box.classList.toggle('collapsed'); refreshStats(); }); head.appendChild(tog);
    if (!S.A.asm) {
      const legs = st.legs || 0, gait = st.gait === 'biped' && legs === 1 ? 'Hopper' : (GAIT[st.gait] || st.gait || '');
      head.insertBefore(h('span', 'ed-gait', gait), tog);
      if (st.gait === 'cell') {
        box.append(bar('💨', 'Thrust', (st.thrust || 0) / 10, (st.thrust || 0).toFixed(1), '#06b6d4'), bar('🌀', 'Turn', (st.turn || 0) / 8, (st.turn || 0).toFixed(1), '#6366f1'), bar('💥', 'Ram', (st.ramDamage || 0) / 30, (st.ramDamage || 0).toFixed(0), '#f43f5e'));
      } else {
        box.append(bar('💨', 'Speed', st.topSpeed / 12, st.topSpeed.toFixed(1), '#06b6d4'), bar('🚀', 'Accel', st.accel / 20, st.accel.toFixed(1), '#6366f1'), bar('🌀', 'Turning', st.turnRate / 6, st.turnRate.toFixed(1), '#a855f7'), bar('🦘', 'Jump', st.jumpV / 10, st.jumpV.toFixed(1), '#84cc16'));
      }
      box.append(bar('❤️', 'Health', st.health / 300, Math.round(st.health), '#f43f5e'), bar('⚖️', 'Mass', st.mass / 30, st.mass.toFixed(1), '#f59e0b'));
      if (st.waterClass && st.gait !== 'cell') {   // water (DESIGN 3.6): floats / swims / sinks + seconds of air
        const WC = { floater: ['🛟', 'Floats', '#22d3ee', 'Light and buoyant: bobs on the surface, slow paddling, never drowns at the surface.'], swimmer: ['🐟', 'Swims', '#38bdf8', 'Fins or webbed limbs: paddles at speed and can dive (C) and surface (Space).'], sinker: ['⚓', 'Sinks', '#f97316', 'Dense or heavy: sinks, walks the sea floor slowly and drowns when the air runs out. Tap Space to kick up.'] }[st.waterClass];
        const wrow = h('div', 'ed-water'); wrow.title = WC[3] + ' Density ' + st.density.toFixed(2) + ' (water = 1.00).';
        wrow.innerHTML = '<span class="wc ' + st.waterClass + '">' + WC[0] + ' ' + WC[1] + '</span><span class="wd">density ' + st.density.toFixed(2) + '</span>';
        box.appendChild(wrow);
        box.appendChild(bar('🫧', 'Breath', st.breath / 60, Math.round(st.breath) + 's', '#38bdf8'));
      }
      const ab = h('div', 'ed-abil'); const A = st.abilities || {};
      Object.keys(A).forEach((k) => { if (A[k] > 0 && ABIL[k]) ab.appendChild(h('span', 'ed-ab', ABIL[k][0] + ' <b>' + A[k] + '</b>')); });
      const dt = DIET[st.diet] || DIET.none; ab.appendChild(h('span', 'ed-ab', dt[0] + ' ' + dt[1]));
      if (S.mode === 'outfit' && st.outfit) Object.keys(st.outfit).forEach((k) => { if (st.outfit[k]) ab.appendChild(h('span', 'ed-ab', BONUS[k][0] + ' <b>+' + st.outfit[k] + '</b>')); });
      box.appendChild(ab);
    } else {
      head.insertBefore(h('span', 'ed-gait', S.design.role), tog);
      ASM_BARS[S.design.kind].forEach((r) => box.appendChild(bar(r[1], r[2], (st[r[0]] || 0) / STAT_MAX[r[0]], Math.round(st[r[0]] || 0), r[3])));
      if (S.design.kind === 'vehicle' && st.powerKind) box.appendChild(h('div', 'ed-abil', '<span class="ed-ab">' + ({ military: '⚔️ Military', economic: '💰 Economic', religious: '🔮 Religious' })[st.powerKind] + '</span>'));
    }
    const pts = h('div', 'ed-pts');
    if (S.budget !== null) pts.appendChild(h('div', 'line', '<span>' + cur + ' Budget</span><b>' + Math.round(S.budget) + '</b>'));
    pts.appendChild(h('div', 'line', '<span>' + cur + ' Cost' + (S.A.asm ? '' : ' (change)') + '</span><b>' + (S.A.asm ? Math.round(b.cost) : (b.net >= 0 ? '+' : '') + Math.round(b.net)) + '</b>'));
    if (S.budget !== null) pts.appendChild(h('div', 'line', '<span>Remaining</span><span class="big' + (b.remaining < 0 ? ' bad' : '') + '">' + cur + ' ' + Math.round(b.remaining) + '</span>'));
    box.appendChild(pts);
    const cxb = h('div', 'ed-cx' + (cx.value > cx.max ? ' over' : ''));
    cxb.innerHTML = '<div class="line" style="display:flex;justify-content:space-between;font-size:12px;font-weight:700"><span>' + (S.A.asm ? '🧩 Parts' : '🧠 Complexity') + '</span><span style="color:' + (cx.value > cx.max ? '#fb7185' : '#cbd5e1') + '">' + (Math.round(cx.value * 10) / 10) + ' / ' + cx.max + '</span></div><div class="tr"><div class="fi" style="width:' + Math.round(clamp(cx.value / cx.max, 0, 1) * 100) + '%"></div></div>';
    box.appendChild(cxb);
    const msgs = h('div', 'ed-msgs'); box.appendChild(msgs);
    val.reasons.forEach((m) => msgs.appendChild(h('div', 'e', '⛔ ' + m)));
    (val.v.warnings || []).forEach((m) => msgs.appendChild(h('div', 'w', '⚠️ ' + m)));
    S.ui.done.disabled = !val.ok; S.ui.done.title = val.ok ? 'Finish and keep this design' : 'Cannot finish yet: ' + val.reasons.join(' · ');
    if (S.ui.spineInfo && S.design.spine) S.ui.spineInfo.innerHTML = '<div>Vertebrae: ' + S.design.spine.length + ' (' + limits().min + '–' + limits().max + ')</div>';
  }
  function refreshSel() {
    const p = selPart(), el = S.ui.sel; if (!el) return;
    el.classList.toggle('show', !!p && !S.test);
    if (p) { const d = partDef(p); el.querySelector('.nm').textContent = (d ? d.icon + ' ' + d.name : p.id) + ' ×' + (p.s || 1).toFixed(2); }
  }
  function updateUndoBtns() { if (!S.ui.undo) return; S.ui.undo.disabled = S.hi <= 0; S.ui.redo.disabled = S.hi >= S.history.length - 1; }
  function refreshAll() { refreshStats(); refreshCards(); refreshSel(); updateUndoBtns(); if (S.tab && S.tab.type === 'core') refreshCards(); }

  // C-02: replace parts the player has not unlocked by an unlocked part of the same slot (or drop them)
  function swapLocked() {
    const L = curList(), lg = S.grand || {};
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i], d = partDef(p); if (!d || S.isUnlocked(d) || lg[p.id]) continue;
      const alts = SP.parts.list.filter((q) => q.kind === d.kind && q.slot === d.slot && q.id !== d.id && S.isUnlocked(q));
      if (alts.length) {
        alts.sort((a, b) => Math.abs(a.tier - d.tier) - Math.abs(b.tier - d.tier));
        const best = alts.filter((q) => Math.abs(q.tier - d.tier) === Math.abs(alts[0].tier - d.tier));
        p.id = best[Math.floor(Math.random() * best.length)].id;
      } else { L.splice(i, 1); for (let k = L.length - 1; k >= 0; k--) if (L[k].attach === p.uid) L.splice(k, 1); }
    }
  }

  // randomize
  function randomize() {
    const rng = SP.util && SP.util.rng ? SP.util.rng((Math.random() * 1e9) | 0) : { next: Math.random, range: (a, b) => a + Math.random() * (b - a), int: (a, b) => a + Math.floor(Math.random() * (b - a + 1)), pick: (a) => a[Math.floor(Math.random() * a.length)], chance: (p) => Math.random() < p };
    try {
      const nd = S.A.random(S, rng);
      if (nd) S.design = nd;
      S.A.ensure(S);
      if (!S.A.asm) swapLocked();
      // trim the most expensive parts until it fits the budget
      let guard = 40;
      while (S.budget !== null && (S.A.cost(S) - S.cost0) > S.budget && guard-- > 0) {
        const L = curList(); if (!L.length) break; let bi = 0, bc = -1; L.forEach((p, i) => { const d = partDef(p); if (d && d.cost > bc && !(d.slot === 'mouth')) { bc = d.cost; bi = i; } });
        const gone = L.splice(bi, 1)[0]; for (let k = L.length - 1; k >= 0; k--) if (L[k].attach === gone.uid) L.splice(k, 1);
      }
      S.sel = null; S.vsel = -1; S.reframe = true; if (S.ui.name && !S.design.name) S.design.name = S.ui.name.value; commit(); sfx('dna');
    } catch (e) { console.error(e); toast('Randomize failed', '⚠️'); }
  }

  // ------------------------------------------------------------------ resize / update
  function onResize(w, hh) {
    if (!S) return; w = w || window.innerWidth; hh = hh || window.innerHeight;
    S.camera.aspect = w / hh;
    const narrow = w <= 760; let dx = 0, dy = 0;
    if (narrow) dy = (192 - 54) / 2; else dx = (w <= 900 ? (318 - 218) : (318 - 258)) / 2;
    if (dx || dy) S.camera.setViewOffset(w, hh, -dx, dy, w, hh); else S.camera.clearViewOffset();
    S.camera.updateProjectionMatrix();
  }
  function update(dt) {
    if (!S) return; dt = Math.min(dt || 0.016, 0.05); S.t += dt;
    if (S.dirty) rebuildRig();
    const c = S.cam, k = 1 - Math.exp(-9 * dt);
    c.dist += (c.distT - c.dist) * k; c.pitch += (c.pitchT - c.pitch) * k; c.tgt.lerp(c.tgtT, k);
    S.camera.position.set(c.tgt.x, c.tgt.y + Math.sin(c.pitch) * c.dist, c.tgt.z + Math.cos(c.pitch) * c.dist); S.camera.lookAt(c.tgt);
    S.ring.material.emissiveIntensity = 0.55 + 0.2 * Math.sin(S.t * 2);
    if (S.test) stepTest(dt);
    S.turn.updateMatrixWorld(true); S.frame.updateMatrixWorld(true);
    syncOverlay();
  }
})();
