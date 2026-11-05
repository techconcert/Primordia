// Minimal stand-ins for SP.util / SP.render / SP.cam / SP.input / SP.creature, used ONLY by the WP3
// harness (tests/world.html) and the node tests while the real modules are missing/incomplete.
// Every piece is installed only if absent, so loading this after the real modules is harmless.
(function () {
  'use strict';
  const root = typeof window !== 'undefined' ? window : globalThis;
  const SP = root.SP = root.SP || {};
  const T = root.THREE;

  // ---------------------------------------------------------------- util
  if (!SP.util) {
    const hashStr = (s) => { s = String(s); let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; };
    const rng = (seed) => {
      let a = (typeof seed === 'number' ? seed : hashStr(seed)) >>> 0; const s0 = a;
      const next = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
      const r = { seed: s0, next, range: (x, y) => x + (y - x) * next(), int: (x, y) => x + Math.floor(next() * (y - x + 1)), pick: (arr) => arr[Math.floor(next() * arr.length)], chance: (p) => next() < p,
        shuffle: (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); const t = arr[i]; arr[i] = arr[j]; arr[j] = t; } return arr; } };
      return r;
    };
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    SP.util = { rng, hashStr, clamp, lerp: (a, b, t) => a + (b - a) * t, invLerp: (a, b, v) => (v - a) / (b - a),
      smoothstep: (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); },
      damp: (a, b, l, dt) => a + (b - a) * (1 - Math.exp(-l * dt)),
      wrapAngle: (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; },
      angleLerp: (a, b, t) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * t; },
      uid: (() => { let n = 0; return (p = 'p') => p + '_' + (++n); })() };
  }

  // ---------------------------------------------------------------- render
  if (!SP.render && T) {
    const R = SP.render = {};
    R.INK = 0x080c14;
    R.PALETTE = [0x22c55e, 0x06b6d4, 0xa855f7, 0xf97316, 0xf43f5e, 0xeab308, 0x38bdf8, 0x84cc16, 0xec4899, 0x14b8a6, 0x92400e, 0x475569];
    R.COLORS = { bone: 0xfffbeb, darkAccent: 0x1e293b, mouth: 0x881337, claw: 0xd97706, beak: 0xf59e0b, bg: 0x0d121d };
    const gm = new Uint8Array([55, 60, 75, 255, 165, 172, 190, 255, 255, 255, 255, 255]);
    R.gradientMap = new T.DataTexture(gm, 3, 1, T.RGBAFormat); R.gradientMap.minFilter = R.gradientMap.magFilter = T.NearestFilter; R.gradientMap.needsUpdate = true;
    const cache = {};
    R.toon = (hex, o = {}) => {
      const k = hex + '|' + JSON.stringify(o);
      if (cache[k]) return cache[k];
      const m = new T.MeshToonMaterial({ color: hex, gradientMap: R.gradientMap, vertexColors: !!o.vertexColors, transparent: !!o.transparent, opacity: o.opacity === undefined ? 1 : o.opacity, side: o.side === undefined ? T.FrontSide : o.side });
      if (o.emissive !== undefined) { m.emissive = new T.Color(o.emissive); m.emissiveIntensity = o.emissiveIntensity === undefined ? 1 : o.emissiveIntensity; }
      return (cache[k] = m);
    };
    R.outlineMaterial = (hex = R.INK) => { const k = 'ol' + hex; return cache[k] || (cache[k] = new T.MeshBasicMaterial({ color: hex, side: T.BackSide })); };
    R.cel = (geo, hex, o = {}) => {
      const m = new T.Mesh(geo, o.material || R.toon(hex));
      m.castShadow = o.cast !== false; m.receiveShadow = o.receive !== false;
      const t = o.outline === undefined ? 0.07 : o.outline;
      if (t > 0) { const ol = new T.Mesh(geo, R.outlineMaterial()); ol.scale.setScalar(1 + t); ol.name = 'outline'; m.add(ol); }
      return m;
    };
    R.makeLights = (scene, preset = 'day') => {
      const ambient = new T.AmbientLight(0xfff7ed, 0.75), sun = new T.DirectionalLight(0xffedd5, 1.25), rim = new T.DirectionalLight(0x38bdf8, 0.45);
      sun.position.set(40, 80, 30); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
      rim.position.set(-40, 20, -30);
      scene.add(ambient, sun, rim, sun.target);
      const o = { ambient, sun, rim, setPreset(n) { if (n === 'night') { ambient.color.set(0x7c8cff); ambient.intensity = 0.45; sun.intensity = 0.3; } } };
      return o;
    };
    R.init = (el) => {
      const r = R.renderer = new T.WebGLRenderer({ antialias: true });
      r.setPixelRatio(Math.min(2, root.devicePixelRatio || 1)); r.setSize(el.clientWidth || innerWidth, el.clientHeight || innerHeight);
      r.shadowMap.enabled = true; r.shadowMap.type = T.PCFSoftShadowMap; el.appendChild(r.domElement);
      addEventListener('resize', () => { r.setSize(el.clientWidth || innerWidth, el.clientHeight || innerHeight); R._rs.forEach((f) => f(r.domElement.width, r.domElement.height)); });
    };
    R._rs = []; R.onResize = (f) => R._rs.push(f);
    R.render = (scene, cam) => R.renderer.render(scene, cam);
    R.disposeTree = (o) => o.traverse((c) => { if (c.geometry) c.geometry.dispose(); });
  }

  // ---------------------------------------------------------------- input
  if (!SP.input && typeof document !== 'undefined') {
    const down = {}, pr = {};
    const I = SP.input = { mouse: { x: 0, y: 0, left: false, right: false, middle: false, wheel: 0, clicked: false, dragging: false, dx: 0, dy: 0 },
      isDown: (c) => !!down[c], pressed: (c) => !!pr[c], endFrame() { for (const k in pr) delete pr[k]; I.mouse.wheel = 0; I.mouse.dx = 0; I.mouse.dy = 0; }, pointerOverUI: () => false };
    addEventListener('keydown', (e) => { if (!down[e.code]) pr[e.code] = true; down[e.code] = true; });
    addEventListener('keyup', (e) => { down[e.code] = false; });
    addEventListener('mousedown', (e) => { if (e.button === 2) I.mouse.right = true; if (e.button === 0) I.mouse.left = true; });
    addEventListener('mouseup', (e) => { if (e.button === 2) I.mouse.right = false; if (e.button === 0) I.mouse.left = false; });
    addEventListener('mousemove', (e) => { I.mouse.dx += e.movementX; I.mouse.dy += e.movementY; });
    addEventListener('wheel', (e) => { I.mouse.wheel += Math.sign(e.deltaY); }, { passive: true });
    addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // ---------------------------------------------------------------- camera
  if (!SP.cam) SP.cam = {};
  if (!SP.cam.Follow && T) {
    SP.cam.Follow = class {
      constructor(o = {}) {
        this.camera = new T.PerspectiveCamera(o.fov || 55, innerWidth / innerHeight, 0.3, 3000);
        this.target = new T.Vector3(); this.up = new T.Vector3(0, 1, 0); this.yaw = 0; this.pitch = o.pitch || 0.45; this.distance = o.distance || 14;
        this.minDist = o.minDist || 5; this.maxDist = o.maxDist || 45; this._ref = new T.Vector3(0, 0, 1);
        addEventListener('resize', () => { this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix(); });
      }
      _basis() {
        const up = this.up, r = Math.abs(up.y) < 0.95 ? new T.Vector3(0, 1, 0) : new T.Vector3(1, 0, 0);
        const east = new T.Vector3().crossVectors(r, up).normalize(), north = new T.Vector3().crossVectors(up, east).normalize();
        return { east, north };
      }
      forwardOnSurface() { const b = this._basis(); return b.north.clone().multiplyScalar(Math.cos(this.yaw)).addScaledVector(b.east, Math.sin(this.yaw)).normalize(); }
      update(dt) {
        const I = SP.input;
        if (I && I.mouse) { if (I.mouse.right) { this.yaw -= I.mouse.dx * 0.005; this.pitch = Math.max(0.1, Math.min(1.4, this.pitch + I.mouse.dy * 0.005)); } if (I.mouse.wheel) this.distance = Math.max(this.minDist, Math.min(this.maxDist, this.distance * (1 + 0.1 * I.mouse.wheel))); }
        const tu = this.target.clone().normalize(); this.up.lerp(tu, Math.min(1, dt * 8)).normalize();
        const f = this.forwardOnSurface();
        const p = this.target.clone().addScaledVector(f, -Math.cos(this.pitch) * this.distance).addScaledVector(this.up, Math.sin(this.pitch) * this.distance + 1.2);
        this.camera.position.lerp(p, Math.min(1, dt * 10)); this.camera.up.copy(this.up);
        this.camera.lookAt(this.target.clone().addScaledVector(this.up, 1));
      }
    };
  }

  // ---------------------------------------------------------------- creature (placeholder capsules)
  const realC = SP.creature;
  if ((!realC || !realC.build || !realC.animate || !realC.generate || !realC.stats) && T) {
    SP.creatureReal = realC; SP.creatureIsShim = true;
    const TIERS = {
      tiny: { r: 0.35, m: 0.6, hp: 25, spd: 3.2 }, small: { r: 0.55, m: 2, hp: 45, spd: 3.8 }, medium: { r: 0.8, m: 6, hp: 100, spd: 4.3 },
      large: { r: 1.3, m: 18, hp: 220, spd: 4.5 }, epic: { r: 2.2, m: 60, hp: 600, spd: 4.6 } };
    const C = SP.creature = {}; if (realC) Object.keys(realC).forEach((k) => { C[k] = realC[k]; });
    const SYL = ['ba', 'ko', 'mi', 'zu', 'ra', 'ti', 'no', 'fe', 'lu', 'sha', 'dro', 'pip'];
    C.defaultDesign = (kind = 'creature') => ({ v: 1, kind, name: 'Blob', seed: 1, spine: [], parts: [], colors: { base: 0x22c55e, accent: 0xfacc15, detail: 0x1e293b, pattern: 'none' }, outfit: [], _tier: 'medium', _diet: 'omnivore' });
    C.generate = (rng, o = {}) => {
      const tier = o.sizeTier || 'small', diet = o.diet || 'herbivore';
      const pal = SP.render ? SP.render.PALETTE : [0x22c55e];
      const d = C.defaultDesign('creature'); d.name = rng.pick(SYL) + rng.pick(SYL) + rng.pick(SYL);
      d.colors = { base: rng.pick(pal), accent: rng.pick(pal), detail: 0x1e293b, pattern: 'none' }; d._tier = tier; d._diet = diet; d._legs = rng.pick([2, 4, 4, 6]); d._temp = o.temperament; return d;
    };
    C.stats = (d) => {
      const t = TIERS[d._tier || 'medium'], carn = d._diet === 'carnivore', om = d._diet === 'omnivore';
      return { mass: t.m, height: t.r * 2, length: t.r * 2.4, radius: t.r, legs: d._legs || 4, legPairs: (d._legs || 4) / 2, gait: 'quad', asym: 0, legLength: t.r * 0.7,
        topSpeed: t.spd, accel: t.spd * 2, turnRate: 3.2 / Math.pow(Math.max(t.m / 6, 0.3), 0.3), jumpV: 4, glide: 0, swim: 0.5, stability: t.m * 1.4, health: t.hp, sprintMul: 1.4, sprintTime: 2, sprintCooldown: 8,
        abilities: { bite: carn ? 2 + (d._tier === 'epic' ? 2 : 0) : om ? 1 : 0, charge: 0, strike: d._tier === 'large' && !carn ? 1 : 0, spit: 0, sing: 1, dance: 1, charm: 1, pose: 1, speed: 1, sprint: 1, sneak: 0, jump: 0, glide: 0, health: 0 },
        diet: d._diet || 'omnivore', outfit: { social: 0, attack: 0, health: 0, gather: 0 } };
    };
    C.build = (d, o = {}) => {
      const s = C.stats(d), r = s.radius, root = new T.Group(), body = new T.Group(); root.add(body);
      const mk = (g, c, ol) => SP.render.cel(g, c, { outline: ol === undefined ? 0.07 : ol });
      const torso = mk(new T.SphereGeometry(r, 10, 8), d.colors.base); torso.scale.set(0.9, 0.85, 1.35); torso.position.y = r * 1.1; body.add(torso);
      const head = mk(new T.SphereGeometry(r * 0.6, 8, 8), d.colors.base); head.position.set(0, r * 1.5, r * 1.3); body.add(head);
      const eyes = [];
      for (const sx of [-1, 1]) { const e = mk(new T.SphereGeometry(r * 0.2, 6, 6), 0xffffff, 0.09); e.position.set(sx * r * 0.28, r * 1.7, r * 1.75); const p = new T.Mesh(new T.SphereGeometry(r * 0.1, 5, 5), SP.render.toon(0x080c14)); p.position.set(0, 0, r * 0.15); e.add(p); body.add(e); eyes.push(e); }
      const legs = []; const n = Math.max(2, d._legs || 4);
      for (let i = 0; i < n; i++) { const side = i % 2 ? 1 : -1, z = ((i >> 1) / Math.max(1, (n >> 1) - 1 || 1) - 0.5) * r * 1.6;
        const h = new T.Group(); h.position.set(side * r * 0.6, r * 0.8, z); const leg = mk(new T.CylinderGeometry(r * 0.12, r * 0.1, r * 0.8, 5), d.colors.accent, 0.08); leg.position.y = -r * 0.4; h.add(leg); root.add(h); legs.push({ hip: h, side, phase: (i % 4) * 0.25 }); }
      const rig = { root, design: d, stats: s, body, legs, arms: [], eyes, mouth: head, _ph: 0, _k: 1,
        setTint(hex) { root.traverse((c) => { if (c.isMesh && c.material && c.material.emissive && c.material.color && c.name !== 'outline') { /* cached mats: skip */ } }); rig._tint = hex; },
        setScale(k) { root.scale.setScalar(k); rig._k = k; }, dispose() { root.traverse((c) => { if (c.geometry) c.geometry.dispose(); }); } };
      return rig;
    };
    C.animate = (rig, dt, s) => {
      rig._ph += (s.speed || 0) * dt * 0.9 / Math.max(0.3, rig.stats.legLength);
      for (const l of rig.legs) l.hip.rotation.x = Math.sin((rig._ph + l.phase) * Math.PI * 2) * 0.7 * Math.min(1, Math.abs(s.speed || 0) / 2);
      const r = rig.stats.radius; let y = Math.abs(Math.sin(rig._ph * Math.PI * 2)) * 0.06 * r * Math.min(1, Math.abs(s.speed || 0));
      let rz = 0, sy = 1;
      if (s.action === 'die') { rz = Math.min(1, s.actionT * 2) * Math.PI / 2; }
      else if (s.action === 'eat') { rig.body.rotation.x = 0.4 * Math.abs(Math.sin(s.actionT * 8)); }
      else if (s.action === 'sneak') { sy = 0.8; }
      else if (s.action === 'bite') { rig.body.rotation.x = 0.35 * Math.sin(s.actionT * Math.PI / 0.5); }
      else rig.body.rotation.x = 0;
      rig.body.position.y = y; rig.body.rotation.z = rz; rig.body.scale.y = sy;
    };
  }
})();
