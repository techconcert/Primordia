/* SP.tribalWorld — prop builders for the Tribal stage (huts, totems, campfire, food pile, tool props, pen...). */
(function () {
  'use strict';
  const SP = window.SP = window.SP || {};
  const V3 = THREE.Vector3;
  const R = () => SP.render;

  // ---- shared geometry cache (disposed with the scene tree; geometries are tiny)
  const GEO = {};
  function g(name, make) { return GEO[name] || (GEO[name] = make()); }
  const geo = {
    cyl: () => g('cyl', () => new THREE.CylinderGeometry(1, 1, 1, 10)),
    cone: () => g('cone', () => new THREE.ConeGeometry(1, 1, 10)),
    box: () => g('box', () => new THREE.BoxGeometry(1, 1, 1)),
    sph: () => g('sph', () => new THREE.SphereGeometry(1, 12, 9)),
    dod: () => g('dod', () => new THREE.DodecahedronGeometry(1, 0)),
    tor: () => g('tor', () => new THREE.TorusGeometry(1, 0.1, 6, 28)),
  };

  // cel helper with transform
  function M(parent, gk, hex, s, p, o) {
    o = o || {};
    const m = R().cel(geo[gk](), hex, { outline: o.ol === undefined ? 0.07 : o.ol, cast: o.cast !== false, emissive: o.em, emissiveIntensity: o.ei, transparent: o.tr, opacity: o.op });
    m.scale.set(s[0], s[1], s[2]); m.position.set(p[0], p[1], p[2]);
    if (o.r) m.rotation.set(o.r[0], o.r[1], o.r[2]);
    parent.add(m); return m;
  }

  // ---- emoji icon sprites (billboards)
  const texCache = {};
  function iconTexture(emoji) {
    if (texCache[emoji]) return texCache[emoji];
    const c = document.createElement('canvas'); c.width = c.height = 96;
    const x = c.getContext('2d');
    x.beginPath(); x.arc(48, 48, 42, 0, Math.PI * 2); x.fillStyle = 'rgba(18,24,38,.92)'; x.fill();
    x.lineWidth = 6; x.strokeStyle = '#080c14'; x.stroke();
    x.font = '54px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(emoji, 48, 52);
    const t = new THREE.CanvasTexture(c); texCache[emoji] = t; return t;
  }
  function iconSprite(emoji, size) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: iconTexture(emoji), depthTest: false, transparent: true }));
    s.scale.setScalar(size || 2); s.renderOrder = 20; return s;
  }
  function glowSprite(hex, size, op) {
    if (!texCache._glow) {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = gr; x.fillRect(0, 0, 64, 64); texCache._glow = new THREE.CanvasTexture(c);
    }
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: texCache._glow, color: hex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: op === undefined ? 0.8 : op }));
    s.scale.setScalar(size); return s;
  }

  // ---- hut: tier 1..3
  function hut(tier, colorRoof) {
    const grp = new THREE.Group();
    M(grp, 'cyl', 0xa8683a, [2.6, 1.7, 2.6], [0, 0.85, 0]);
    M(grp, 'cyl', 0x7c4a22, [2.72, 0.22, 2.72], [0, 1.55, 0], { ol: 0.05 });
    // B-18: two stacked cones (team-coloured skirt + straw cap) read as a thatched roof, not a flat parasol from above
    const roof = M(grp, 'cone', colorRoof || 0xe2891d, [3.1, 1.5, 3.1], [0, 2.25, 0]);
    M(grp, 'cone', colorRoof ? 0xf5d08a : 0xf0a63a, [2.2, 1.9, 2.2], [0, 3.5, 0]);
    M(grp, 'cone', 0xfbbf24, [0.5, 0.7, 0.5], [0, 4.6, 0], { ol: 0.12 });
    M(grp, 'box', 0x3b2a1a, [0.9, 1.3, 0.3], [0, 0.65, 2.55], { ol: 0.05 });
    const t2 = new THREE.Group(); // tier 2: second hut-lets + banner
    M(t2, 'cyl', 0xc98a52, [1.5, 1.1, 1.5], [3.6, 0.55, 1.2]); M(t2, 'cone', 0xf59e0b, [2.1, 1.7, 2.1], [3.6, 1.95, 1.2]);
    M(t2, 'cyl', 0x78350f, [0.1, 3.4, 0.1], [-3.0, 1.7, 1.6], { ol: 0.2 }); M(t2, 'box', 0xf43f5e, [1.2, 0.8, 0.06], [-2.4, 3.0, 1.6]);
    const t3 = new THREE.Group(); // tier 3: tall chief tower + skulls
    M(t3, 'cyl', 0xb45309, [1.3, 3.2, 1.3], [-3.5, 1.6, -1.5]); M(t3, 'cone', 0xef4444, [1.9, 1.8, 1.9], [-3.5, 4.1, -1.5]);
    M(t3, 'sph', 0xfffbeb, [0.4, 0.4, 0.4], [-3.5, 3.3, -0.8]);
    grp.add(t2, t3); t2.visible = tier >= 2; t3.visible = tier >= 3;
    grp.userData = { t2, t3, roof };
    return grp;
  }
  function setHutTier(grp, tier) { grp.userData.t2.visible = tier >= 2; grp.userData.t3.visible = tier >= 3; }

  function totem(col, h) {
    const grp = new THREE.Group(); h = h || 1;
    const cols = [col, 0xfbbf24, 0xf8fafc];
    for (let i = 0; i < 4; i++) {
      const b = M(grp, 'box', cols[i % 3], [1.0, 1.1, 1.0], [0, 0.55 + i * 1.1, 0], { ol: 0.07 });
      M(b, 'sph', 0xffffff, [0.2, 0.2, 0.1], [-0.24, 0.12, 0.52], { ol: 0.15 }); M(b, 'sph', 0xffffff, [0.2, 0.2, 0.1], [0.24, 0.12, 0.52], { ol: 0.15 });
      M(b, 'sph', 0x080c14, [0.09, 0.09, 0.05], [-0.24, 0.12, 0.62], { ol: 0 }); M(b, 'sph', 0x080c14, [0.09, 0.09, 0.05], [0.24, 0.12, 0.62], { ol: 0 });
      M(b, 'box', 0x7f1d1d, [0.45, 0.14, 0.05], [0, -0.22, 0.52], { ol: 0.1 });
    }
    M(grp, 'cone', 0xef4444, [0.9, 0.9, 0.9], [0, 4.85, 0]);
    // wings
    M(grp, 'box', col, [2.6, 0.25, 0.5], [0, 3.3, 0], { ol: 0.09 });
    grp.scale.setScalar(h); return grp;
  }

  function campfire() {
    const grp = new THREE.Group();
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; M(grp, 'dod', 0x64748b, [0.38, 0.3, 0.38], [Math.cos(a) * 1.25, 0.15, Math.sin(a) * 1.25]); }
    for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + 0.4; M(grp, 'cyl', 0x78350f, [0.14, 1.3, 0.14], [Math.cos(a) * 0.35, 0.35, Math.sin(a) * 0.35], { r: [Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9], ol: 0.2 }); }
    const flames = new THREE.Group(); grp.add(flames);
    const fm = [];
    [[0xf97316, 0.55, 1.4, 0], [0xfbbf24, 0.4, 1.1, 1.7], [0xfde047, 0.26, 0.8, 3.4]].forEach((d, i) => {
      const f = R().cel(geo.cone(), d[0], { outline: i === 0 ? 0.08 : 0, cast: false, emissive: d[0], emissiveIntensity: 1.1 });
      f.scale.set(d[1], d[2], d[1]); f.position.set(Math.cos(d[3]) * 0.12, 0.4 + d[2] * 0.5, Math.sin(d[3]) * 0.12); flames.add(f); fm.push({ m: f, h: d[2], ph: d[3] });
    });
    const glow = glowSprite(0xff8a2a, 9, 0.5); glow.position.y = 1.2; grp.add(glow);
    const light = new THREE.PointLight(0xff9a3c, 0, 46, 1.6); light.position.y = 2.2; grp.add(light);
    return {
      group: grp, light, glow,
      update(t, night) {
        const k = 0.35 + 0.65 * night;
        for (let i = 0; i < fm.length; i++) { const f = fm[i], w = 1 + 0.18 * Math.sin(t * (9 + i * 3) + f.ph) + 0.1 * Math.sin(t * 23 + i); f.m.scale.y = f.h * w * (0.8 + 0.4 * k); f.m.position.y = 0.4 + f.m.scale.y * 0.5; f.m.rotation.y = t * 2 + i; }
        light.intensity = (0.25 + 2.3 * night) * (0.9 + 0.1 * Math.sin(t * 13) + 0.05 * Math.sin(t * 31));
        glow.material.opacity = 0.3 + 0.5 * night; glow.scale.setScalar(7 + 4 * night + Math.sin(t * 9) * 0.3);
      }
    };
  }

  function foodPile() {
    const grp = new THREE.Group(), items = [];
    const cols = [0xef4444, 0xf97316, 0x84cc16, 0xfbbf24, 0xec4899, 0xa855f7, 0x22c55e];
    M(grp, 'cyl', 0xa16207, [1.9, 0.18, 1.9], [0, 0.09, 0], { ol: 0.06 });
    const pts = [];
    for (let l = 0; l < 3; l++) { const n = [7, 4, 2][l], r = [1.15, 0.7, 0.28][l]; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2 + l; pts.push([Math.cos(a) * r, 0.42 + l * 0.42, Math.sin(a) * r]); } }
    pts.forEach((p, i) => { const m = M(grp, 'sph', cols[i % cols.length], [0.36, 0.36, 0.36], p); m.visible = false; items.push(m); });
    const sign = iconSprite('🍓', 1.7); sign.position.y = 3.4; grp.add(sign);
    return { group: grp, setAmount(n) { const c = Math.min(items.length, Math.ceil(n / 8)); for (let i = 0; i < items.length; i++) items[i].visible = i < c; } };
  }

  function pen() {
    const grp = new THREE.Group();
    const N = 14, Rr = 5.2;
    M(grp, 'cyl', 0xcaa75b, [Rr, 0.06, Rr], [0, 0.03, 0], { ol: 0, cast: false });
    for (let i = 0; i < N; i++) {
      const a = i / N * Math.PI * 2, x = Math.cos(a) * Rr, z = Math.sin(a) * Rr;
      M(grp, 'cyl', 0x92400e, [0.16, 1.1, 0.16], [x, 0.55, z], { ol: 0.2 });
      const b = a + Math.PI / N; // rail
      M(grp, 'box', 0xb45309, [2 * Rr * Math.sin(Math.PI / N), 0.1, 0.1], [Math.cos(b) * Rr * Math.cos(Math.PI / N), 0.8, Math.sin(b) * Rr * Math.cos(Math.PI / N)], { r: [0, -b + Math.PI / 2, 0], ol: 0.2 });
    }
    const sign = iconSprite('🐾', 1.6); sign.position.y = 2.6; grp.add(sign);
    grp.userData.radius = Rr;
    return grp;
  }

  function slotMarker() {
    const grp = new THREE.Group();
    const r = R().cel(geo.tor(), 0xfde68a, { outline: 0, cast: false, transparent: true, opacity: 0.6 });
    r.rotation.x = Math.PI / 2; r.scale.set(1.9, 1.9, 1.9); grp.add(r);
    const s = iconSprite('🔨', 1.5); s.position.y = 1.3; grp.add(s); grp.userData.sprite = s; grp.userData.ring = r;
    return grp;
  }

  // ---- tool props (held in hand / shown at tool huts). Local frame: y up, ~1 unit long
  function toolProp(id) {
    const grp = new THREE.Group();
    const stick = (len, col) => M(grp, 'cyl', col || 0x92400e, [0.06, len, 0.06], [0, len / 2, 0], { ol: 0.25 });
    switch (id) {
      case 'gather': stick(1.4); M(grp, 'dod', 0x4ade80, [0.28, 0.2, 0.28], [0, 1.5, 0]); M(grp, 'dod', 0x22c55e, [0.2, 0.15, 0.2], [0.18, 1.35, 0]); break;
      case 'fish': stick(1.7); M(grp, 'cone', 0x94a3b8, [0.1, 0.5, 0.1], [0, 1.9, 0]); M(grp, 'cone', 0x94a3b8, [0.07, 0.4, 0.07], [0.14, 1.85, 0]); M(grp, 'cone', 0x94a3b8, [0.07, 0.4, 0.07], [-0.14, 1.85, 0]); break;
      case 'heal': stick(1.5, 0xfde68a); M(grp, 'sph', 0x4ade80, [0.26, 0.26, 0.26], [0, 1.6, 0], { em: 0x22c55e, ei: 0.7 }); break;
      case 'spear': stick(2.0); M(grp, 'cone', 0xe2e8f0, [0.12, 0.5, 0.12], [0, 2.2, 0]); break;
      case 'axe': stick(1.3); M(grp, 'box', 0x94a3b8, [0.55, 0.38, 0.1], [0.25, 1.2, 0]); break;
      case 'torch': stick(1.2); M(grp, 'cone', 0xf97316, [0.22, 0.55, 0.22], [0, 1.45, 0], { em: 0xf97316, ei: 1.0, ol: 0 }); M(grp, 'cone', 0xfde047, [0.12, 0.35, 0.12], [0, 1.4, 0], { em: 0xfde047, ei: 1.0, ol: 0 }); break;
      case 'horn': M(grp, 'cone', 0xfef3c7, [0.35, 1.1, 0.35], [0, 0.7, 0], { r: [0, 0, 0] }); M(grp, 'cyl', 0x92400e, [0.14, 0.2, 0.14], [0, 0.1, 0]); break;
      case 'maracas': stick(0.7, 0xb45309); M(grp, 'sph', 0xf43f5e, [0.3, 0.38, 0.3], [0, 0.95, 0]); M(grp, 'sph', 0xfacc15, [0.07, 0.07, 0.07], [0.08, 1.05, 0.26], { ol: 0 }); break;
      case 'didge': M(grp, 'cyl', 0xd97706, [0.14, 1.9, 0.14], [0, 0.95, 0], { ol: 0.2 }); M(grp, 'cyl', 0x92400e, [0.22, 0.12, 0.22], [0, 1.9, 0]); M(grp, 'box', 0xfacc15, [0.3, 0.06, 0.16], [0, 1.0, 0.1], { ol: 0 }); break;
      default: stick(1);
    }
    return grp;
  }

  function toolHut(tool) {
    const grp = new THREE.Group();
    M(grp, 'cyl', 0xa8683a, [1.6, 1.0, 1.6], [0, 0.5, 0]);
    M(grp, 'cone', tool.color || 0xfbbf24, [2.1, 1.5, 2.1], [0, 1.75, 0]);
    M(grp, 'box', 0x3b2a1a, [0.6, 0.8, 0.2], [0, 0.4, 1.55], { ol: 0.06 });
    const p = toolProp(tool.id); p.position.set(1.6, 0, 1.2); p.rotation.z = -0.15; grp.add(p);
    const s = iconSprite(tool.icon, 1.5); s.position.y = 3.6; grp.add(s);
    return grp;
  }

  function fishSpot() {
    const grp = new THREE.Group();
    const r = R().cel(geo.tor(), 0xe0f2fe, { outline: 0, cast: false, transparent: true, opacity: 0.8 });
    r.rotation.x = Math.PI / 2; grp.add(r);
    const r2 = R().cel(geo.tor(), 0xbae6fd, { outline: 0, cast: false, transparent: true, opacity: 0.6 });
    r2.rotation.x = Math.PI / 2; grp.add(r2);
    const fish = R().cel(geo.sph(), 0xfb923c, { outline: 0.1, cast: false }); fish.scale.set(0.22, 0.2, 0.45); grp.add(fish);
    const s = iconSprite('🐟', 1.3); s.position.y = 2.2; grp.add(s);
    grp.userData = { r, r2, fish };
    return grp;
  }

  function nestProp() {
    const grp = new THREE.Group();
    M(grp, 'cyl', 0xa16207, [0.9, 0.22, 0.9], [0, 0.11, 0], { ol: 0.07 });
    M(grp, 'tor', 0x854d0e, [0.9, 0.9, 0.9], [0, 0.22, 0], { r: [Math.PI / 2, 0, 0], ol: 0.1 });
    const eggs = [];
    [[-0.28, 0.1], [0.27, -0.05], [0.0, 0.3]].forEach((p) => { const e = M(grp, 'sph', 0xfffbeb, [0.22, 0.3, 0.22], [p[0], 0.45, p[1]], { ol: 0.12 }); eggs.push(e); });
    grp.userData.eggs = eggs; return grp;
  }

  function dropProp(type) {
    const grp = new THREE.Group();
    if (type === 'meat') { M(grp, 'sph', 0xdc2626, [0.5, 0.4, 0.5], [0, 0.4, 0]); M(grp, 'cyl', 0xfffbeb, [0.09, 0.6, 0.09], [0.4, 0.5, 0], { r: [0, 0, 1.2], ol: 0.2 }); }
    else if (type === 'egg') { M(grp, 'sph', 0xfffbeb, [0.28, 0.38, 0.28], [0, 0.38, 0]); M(grp, 'sph', 0xfde68a, [0.2, 0.28, 0.2], [0.4, 0.3, 0.2]); }
    else if (type === 'fish') { M(grp, 'sph', 0xfb923c, [0.28, 0.24, 0.55], [0, 0.35, 0]); }
    else { M(grp, 'sph', 0xef4444, [0.36, 0.36, 0.36], [0, 0.4, 0]); M(grp, 'sph', 0xf97316, [0.3, 0.3, 0.3], [0.35, 0.3, 0.1]); }
    const gl = glowSprite(0xfde68a, 2.2, 0.55); gl.position.y = 0.5; grp.add(gl);
    return grp;
  }

  function crown() {
    const grp = new THREE.Group();
    M(grp, 'cyl', 0xfacc15, [0.42, 0.14, 0.42], [0, 0, 0], { em: 0xfacc15, ei: 0.25, ol: 0.12 });
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; M(grp, 'cone', 0xfde047, [0.1, 0.28, 0.1], [Math.cos(a) * 0.36, 0.2, Math.sin(a) * 0.36], { em: 0xfacc15, ei: 0.3, ol: 0.15 }); }
    M(grp, 'sph', 0xef4444, [0.1, 0.1, 0.1], [0, 0.12, 0.4], { ol: 0.2 });
    return grp;
  }

  function banner(col) {
    const grp = new THREE.Group();
    M(grp, 'cyl', 0x78350f, [0.09, 4.2, 0.09], [0, 2.1, 0], { ol: 0.25 });
    const f = M(grp, 'box', col, [1.5, 0.95, 0.06], [0.8, 3.6, 0], { ol: 0.08 }); grp.userData.flag = f;
    return grp;
  }

  function tombstone() { // conquered rival ruins
    const grp = new THREE.Group();
    M(grp, 'dod', 0x64748b, [1.1, 0.5, 0.9], [0, 0.25, 0]); M(grp, 'dod', 0x475569, [0.7, 0.35, 0.6], [1.2, 0.2, 0.5]);
    M(grp, 'cyl', 0x3f2a14, [0.14, 1.4, 0.14], [-0.6, 0.5, 0.2], { r: [0, 0, 1.0], ol: 0.2 });
    return grp;
  }

  SP.tribalWorld = {
    hut, setHutTier, totem, campfire, foodPile, pen, slotMarker, toolProp, toolHut, fishSpot, nestProp, dropProp, crown, banner, tombstone, iconSprite, glowSprite, M, geo
  };
})();
