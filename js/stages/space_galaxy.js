/* SP.spaceGalaxy — Space stage helper: galaxy generation (stars, empires, planets), the galaxy-map visuals
   (additive glow points, territory rings, core, black holes, nebulae) and the parallax backdrop.        */
(function () {
  'use strict';
  const SP = window.SP = window.SP || {};
  const U = SP.util, V3 = THREE.Vector3;
  const G = SP.spaceGalaxy = {};

  G.RADIUS = 100; G.GROX_IN = 10, G.GROX_OUT = 25;
  G.SPICES = [
    { id: 0, name: 'Crimson Zest', color: 0xf43f5e, value: 7 }, { id: 1, name: 'Azure Dust', color: 0x38bdf8, value: 6 },
    { id: 2, name: 'Golden Musk', color: 0xeab308, value: 10 }, { id: 3, name: 'Verdant Bloom', color: 0x84cc16, value: 8 },
    { id: 4, name: 'Violet Nectar', color: 0xa855f7, value: 12 }
  ];
  G.STAR_TYPES = {
    yellow: { color: 0xfde68a, size: 3.4, label: 'Yellow dwarf', hab: 1.0, glow: 0xfbbf24 },
    orange: { color: 0xfdba74, size: 3.2, label: 'Orange star', hab: 0.8, glow: 0xfb923c },
    red: { color: 0xf87171, size: 2.8, label: 'Red dwarf', hab: 0.5, glow: 0xef4444 },
    blue: { color: 0x93c5fd, size: 4.6, label: 'Blue giant', hab: 0.4, glow: 0x60a5fa },
    white: { color: 0xf8fafc, size: 3.6, label: 'White star', hab: 0.7, glow: 0xe2e8f0 },
    grox: { color: 0xff3b3b, size: 3.6, label: 'Grox system', hab: 0, glow: 0xdc2626 },
    bh: { color: 0xc084fc, size: 3.0, label: 'Black hole', hab: 0, glow: 0x7c3aed },
    core: { color: 0xfff1b8, size: 9, label: 'Galactic Core', hab: 0, glow: 0xfde047 }
  };
  G.PTYPES = {
    earth: { label: 'Terran', icon: '🌍' }, alien_purple: { label: 'Violet', icon: '🔮' }, ember: { label: 'Ember', icon: '🌋' },
    ice: { label: 'Frozen', icon: '🧊' }, gas: { label: 'Gas giant', icon: '🪐' }
  };
  const SYL = ['ka', 'zor', 'mi', 'tu', 'ra', 'vel', 'on', 'ix', 'ba', 'lu', 'sha', 'dre', 'qui', 'pho', 'nex', 'ul', 'ae', 'gor', 'yn', 'cae', 'tha', 'pil', 'zen', 'omi', 'fa', 'ri'];
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
  const EMP_SUFFIX = ['Dominion', 'Concord', 'Collective', 'Union', 'Syndicate', 'Empire', 'Clans', 'Federation'];
  const EMP_COLORS = [0xf43f5e, 0xa855f7, 0xf97316, 0xeab308, 0xec4899, 0x84cc16, 0x14b8a6, 0x38bdf8];
  const PERSONALITIES = [
    { id: 'trader', icon: '💼', label: 'Traders', hello: ['Ahh, a customer! Spice is life, friend.', 'Prices are fair, the profits are fairer.'] },
    { id: 'warlike', icon: '⚔️', label: 'Warriors', hello: ['You dare enter our space? Speak quickly!', 'Strength decides everything out here.'] },
    { id: 'friendly', icon: '🕊️', label: 'Peacemakers', hello: ['Greetings, traveller! Be welcome among the stars!', 'What a lovely ship! Come, let us talk.'] },
    { id: 'scholar', icon: '🔬', label: 'Scholars', hello: ['Fascinating! A new species at our border!', 'We catalogue every star. Do you have data?'] }
  ];
  G.PERSONALITIES = PERSONALITIES;

  function starName(rng, used) {
    for (let k = 0; k < 20; k++) {
      let s = '';
      const n = rng.int(2, 3);
      for (let i = 0; i < n; i++) s += rng.pick(SYL);
      s = s.charAt(0).toUpperCase() + s.slice(1);
      if (rng.chance(0.18)) s += '-' + rng.int(2, 99);
      if (!used[s]) { used[s] = 1; return s; }
    }
    return 'Star-' + rng.int(100, 999);
  }

  // ------------------------------------------------------------------ generation
  G.generate = function (seed, campaign) {
    const rng = U.rng('galaxy' + seed), used = {};
    const stars = [];
    function add(o) { o.i = stars.length; o.name = o.name || starName(rng, used); o.empire = -1; o.pirates = false; o.r = Math.hypot(o.pos.x, o.pos.z); stars.push(o); return o; }
    function T(type) { const t = G.STAR_TYPES[type]; return { type: type, color: t.color, size: t.size }; }
    // core (index 0)
    add(Object.assign({ pos: new V3(0, 0, 0), name: 'The Core', core: true }, T('core')));
    // black holes: chain towards the core
    const a0 = rng.range(0, Math.PI * 2);
    const bhDefs = [[68, a0 + 0.5], [42, a0 + 2.4], [5.5, a0 + 4.2]];
    const bh = bhDefs.map(function (d, k) {
      return add(Object.assign({ pos: new V3(Math.cos(d[1]) * d[0], 0, Math.sin(d[1]) * d[0]), bh: k + 1, name: 'Wormhole ' + ROMAN[k] }, T('bh'))).i;
    });
    // Grox ring of red systems
    const grox = [];
    for (let k = 0; k < 18; k++) {
      const a = k / 18 * Math.PI * 2 + rng.range(-0.12, 0.12), r = rng.range(G.GROX_IN + 1.5, G.GROX_OUT - 1.5);
      grox.push(add(Object.assign({ pos: new V3(Math.cos(a) * r, rng.range(-1, 1), Math.sin(a) * r), grox: true }, T('grox'))).i);
    }
    // home star
    const homeA = rng.range(0, Math.PI * 2) + 3, homeR = rng.range(76, 84);
    const home = add(Object.assign({ pos: new V3(Math.cos(homeA) * homeR, 0.5, Math.sin(homeA) * homeR), home: true, name: (campaign && campaign.planet && campaign.planet.name) ? campaign.planet.name + ' Prime' : 'Home' }, T('yellow')));
    // spiral arms
    const arms = 3, types = ['yellow', 'yellow', 'orange', 'orange', 'red', 'red', 'red', 'white', 'white', 'blue'];
    let guard = 0;
    while (stars.length < 240 && guard++ < 20000) {
      const u = rng.next(), r = 28 + Math.sqrt(u) * 72;
      const arm = rng.int(0, arms - 1), ang = arm / arms * Math.PI * 2 + a0 + Math.log(r / 22) * 2.3 + (rng.next() + rng.next() + rng.next() - 1.5) * 0.55;
      const p = new V3(Math.cos(ang) * r, (rng.next() + rng.next() - 1) * 2.4 * (1 - r / 140), Math.sin(ang) * r);
      let ok = true;
      for (let i = 0; i < stars.length; i++) { if (stars[i].pos.distanceToSquared(p) < 3.8 * 3.8) { ok = false; break; } }
      if (!ok) continue;
      add(Object.assign({ pos: p }, T(rng.pick(types))));
    }
    // pirate nests (never in the home vicinity)
    const pirates = [];
    for (let k = 0; k < 14; k++) {
      const s = stars[rng.int(0, stars.length - 1)];
      if (s.core || s.bh || s.grox || s.home || s.pirates || s.pos.distanceTo(stars[home.i].pos) < 25) continue;
      s.pirates = true; pirates.push(s.i);
    }
    // empires
    const empires = [];
    const centres = [];
    for (let tries = 0; tries < 4000 && centres.length < 6; tries++) {
      const s = stars[rng.int(1, stars.length - 1)];
      if (s.core || s.bh || s.grox || s.home || s.r < 38 || s.r > 95) continue;
      if (s.pos.distanceTo(stars[home.i].pos) < 28) continue;
      if (centres.some(function (c) { return stars[c].pos.distanceTo(s.pos) < 40; })) continue;
      centres.push(s.i);
    }
    const colorPool = rng.shuffle(EMP_COLORS.slice());
    const usedSp = {};
    centres.forEach(function (ci, e) {
      let design = null;
      try { design = SP.creature.generate(U.rng(seed * 31 + e * 7 + 5), { kind: 'creature', sizeTier: rng.pick(['small', 'medium', 'medium', 'large']), complexity: 0.5 }); } catch (err) { console.error('empire species', err); }
      let sp = (design && design.name) || starName(rng, used);
      while (usedSp[sp]) sp += 'i'; usedSp[sp] = 1;
      if (design) design.name = sp;
      const pers = rng.pick(PERSONALITIES);
      const likes = rng.shuffle([0, 1, 2, 3, 4]);
      empires.push({
        id: e, species: sp, name: sp + ' ' + rng.pick(EMP_SUFFIX), color: colorPool[e % colorPool.length], design: design,
        pers: pers.id, persIcon: pers.icon, persLabel: pers.label, hello: pers.hello, capital: ci,
        likes: [likes[0], likes[1]], dislikes: likes[4], baseAttitude: Math.round(rng.range(-25, 50)), stars: []
      });
    });
    // territories (nearest centre within reach)
    stars.forEach(function (s) {
      if (s.core || s.bh || s.grox || s.home) return;
      let best = -1, bd = 1e9;
      empires.forEach(function (em) { const d = stars[em.capital].pos.distanceTo(s.pos); if (d < bd) { bd = d; best = em.id; } });
      if (best >= 0 && bd < 27) { s.empire = best; empires[best].stars.push(s.i); }
    });
    empires.forEach(function (em) { stars[em.capital].empire = em.id; stars[em.capital].capitalOf = em.id; stars[em.capital].pirates = false; });
    return { seed: seed, stars: stars, empires: empires, coreIdx: 0, homeIdx: home.i, bh: bh, grox: grox, pirates: pirates, planets: {}, campaignPlanet: campaign && campaign.planet };
  };

  // ------------------------------------------------------------------ planets of a system
  G.planetsOf = function (gal, si, campaign) {
    if (gal.planets[si]) return gal.planets[si];
    const s = gal.stars[si];
    let out = [];
    if (s.core || s.bh) { gal.planets[si] = out; return out; }
    const rng = U.rng('sys' + gal.seed + ':' + si);
    const st = G.STAR_TYPES[s.type] || G.STAR_TYPES.yellow;
    const n = s.home ? rng.int(4, 5) : s.grox ? rng.int(2, 4) : rng.int(2, 6);
    const W = { ember: 0, earth: 0, alien_purple: 0, ice: 0, gas: 0 };
    let orbit = rng.range(62, 80);
    for (let i = 0; i < n; i++) {
      const zone = n > 1 ? i / (n - 1) : 0.4;
      W.ember = Math.pow(1 - zone, 2) * 1.4; W.earth = Math.max(0.05, 1 - Math.abs(zone - 0.38) * 2.2) * (0.4 + st.hab * 0.8);
      W.alien_purple = Math.max(0.05, 1 - Math.abs(zone - 0.55) * 2.2); W.ice = Math.pow(zone, 2) * 1.3; W.gas = i >= 2 ? 0.2 + zone * 0.7 : 0.03;
      let tot = 0, k; for (k in W) tot += W[k];
      let roll = rng.next() * tot, type = 'earth';
      for (k in W) { roll -= W[k]; if (roll <= 0) { type = k; break; } }
      let p = {
        i: i, key: si + ':' + i, star: si, type: type, orbit: orbit, seed: Math.floor(rng.next() * 1e6) + 11,
        size: type === 'gas' ? rng.range(10, 15) : rng.range(4.2, 8), phase: rng.range(0, Math.PI * 2), speed: rng.range(0.6, 1.2) * (90 / orbit) * 0.06,
        moons: rng.chance(0.35) ? rng.int(1, 2) : 0, ring: type === 'gas' && rng.chance(0.5), tilt: rng.range(-0.3, 0.3),
        spice: rng.chance(0.82) ? rng.int(0, 4) : -1, name: s.name + ' ' + ROMAN[i]
      };
      const B = { earth: [55, 18, 50, 20], alien_purple: [62, 22, 36, 22], ember: [24, 18, 84, 10], ice: [20, 16, 13, 10], gas: [50, 0, 50, 0] }[type];
      p.baseAtmo = Math.round(U.clamp(B[0] + rng.range(-1, 1) * B[1], 3, 97)); p.baseTemp = Math.round(U.clamp(B[2] + rng.range(-1, 1) * B[3], 3, 97));
      p.life = type === 'gas' ? 'none' : type === 'earth' ? rng.pick(['creatures', 'plants', 'plants', 'microbes']) : type === 'alien_purple' ? rng.pick(['creatures', 'microbes', 'plants', 'none']) : rng.pick(['microbes', 'none', 'none']);
      out.push(p);
      orbit += rng.range(42, 62);
    }
    // special planets
    if (s.home) {
      const hp = out[0];
      hp.type = 'earth'; hp.home = true; hp.name = (campaign && campaign.planet && campaign.planet.name) || 'Homeworld'; hp.seed = (campaign && campaign.planet && campaign.planet.seed) || 1;
      hp.size = 7.5; hp.orbit = 105; hp.baseAtmo = 52; hp.baseTemp = 50; hp.life = 'creatures'; hp.spice = -1; hp.moons = 1; hp.ring = false;
    }
    if (s.capitalOf !== undefined && s.capitalOf >= 0) {
      const cp = out[Math.min(1, out.length - 1)];
      cp.type = 'earth'; cp.inhabited = s.capitalOf; cp.size = 7; cp.baseAtmo = 52; cp.baseTemp = 48; cp.life = 'creatures'; cp.spice = -1;
      cp.name = gal.empires[s.capitalOf].species + ' Prime';
    }
    gal.planets[si] = out;
    return out;
  };

  // T-score (0..3) from atmosphere/temperature distance to the habitable centre. Plants & animals stabilise (widen the bands).
  G.tScore = function (ps) {
    if (!ps || ps.gas) return 0;
    const dev = Math.max(Math.abs(ps.atmo - 50), Math.abs(ps.temp - 50)) - (ps.plants > 0 ? 3 : 0) - (ps.animals > 0 ? 3 : 0);
    return dev <= 8 ? 3 : dev <= 18 ? 2 : dev <= 32 ? 1 : 0;
  };
  G.BANDS = [32, 18, 8];

  // ------------------------------------------------------------------ canvas textures
  function canvasTex(size, draw) {
    const c = document.createElement('canvas'); c.width = c.height = size;
    draw(c.getContext('2d'), size);
    const t = new THREE.CanvasTexture(c); t.needsUpdate = true; return t;
  }
  G.glowTexture = function (inner, outer) {
    return canvasTex(128, function (g, s) {
      const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      gr.addColorStop(0, inner || 'rgba(255,255,255,1)'); gr.addColorStop(0.25, inner || 'rgba(255,255,255,.55)'); gr.addColorStop(1, outer || 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, s, s);
    });
  };
  function nebulaTex(seed, hue) {
    const rng = U.rng(seed);
    return canvasTex(256, function (g, s) {
      for (let i = 0; i < 26; i++) {
        const x = s / 2 + rng.range(-0.28, 0.28) * s, y = s / 2 + rng.range(-0.28, 0.28) * s, r = rng.range(0.1, 0.28) * s;
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        const h = hue + rng.range(-25, 25);
        gr.addColorStop(0, 'hsla(' + h + ',80%,62%,' + rng.range(0.1, 0.28) + ')'); gr.addColorStop(1, 'hsla(' + h + ',80%,55%,0)');
        g.fillStyle = gr; g.fillRect(0, 0, s, s);
      }
      // fade the border so sprites never show edges
      g.globalCompositeOperation = 'destination-in';
      const m = g.createRadialGradient(s / 2, s / 2, s * 0.12, s / 2, s / 2, s / 2);
      m.addColorStop(0, 'rgba(0,0,0,1)'); m.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = m; g.fillRect(0, 0, s, s);
    });
  }
  function swirlTex() {
    return canvasTex(256, function (g, s) {
      g.translate(s / 2, s / 2);
      for (let arm = 0; arm < 4; arm++) {
        for (let k = 0; k < 90; k++) {
          const t = k / 90, r = t * s * 0.46, a = arm * Math.PI / 2 + t * 5.2;
          const x = Math.cos(a) * r, y = Math.sin(a) * r, rr = (1 - t) * 20 + 6;
          const gr = g.createRadialGradient(x, y, 0, x, y, rr);
          gr.addColorStop(0, 'rgba(255,240,180,' + (0.34 * (1 - t) + 0.05) + ')'); gr.addColorStop(1, 'rgba(255,200,100,0)');
          g.fillStyle = gr; g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
        }
      }
    });
  }

  // ------------------------------------------------------------------ shader points
  function pointMat(mode) {
    const minpx = mode === 'glow' ? '1.5' : mode === 'ring' ? '7.0' : '4.0';
    let frag;
    if (mode === 'glow') frag = 'float a = exp(-d*d*5.5)*0.85 + smoothstep(0.22,0.0,d)*0.9;';
    else if (mode === 'ring') frag = 'float a = smoothstep(0.66,0.74,d)*smoothstep(1.0,0.9,d)*0.95 + smoothstep(0.7,0.0,d)*0.07;';
    else frag = 'float a = pow(smoothstep(1.0,0.0,d),2.0);';
    return new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 600 }, uTime: { value: 0 } },
      vertexShader: 'attribute vec3 aColor; attribute float aSize; attribute float aPhase; attribute float aAlpha; varying vec3 vC; varying float vA; uniform float uScale; uniform float uTime;' +
        'void main(){ vC = aColor; vec4 mv = modelViewMatrix * vec4(position,1.0); float tw = 0.9 + 0.1*sin(uTime*1.6 + aPhase*6.2831);' +
        'float s = aSize * uScale / max(1.0, -mv.z); float f = clamp(s / ' + minpx + ', 0.0, 1.0); vA = aAlpha * tw * (0.35 + 0.65*f); gl_PointSize = clamp(s, ' + minpx + ', 256.0); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'varying vec3 vC; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5)*2.0; if (d > 1.0) discard; ' + frag + ' gl_FragColor = vec4(vC, a * vA); }',
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    });
  }
  // build a Points object from entries [{p:V3, c:hex, s:size, a:alpha}]
  function makePoints(entries, mode, rng) {
    const n = entries.length, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n), ph = new Float32Array(n), al = new Float32Array(n);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const e = entries[i]; pos[i * 3] = e.p.x; pos[i * 3 + 1] = e.p.y; pos[i * 3 + 2] = e.p.z;
      c.setHex(e.c); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      size[i] = e.s; ph[i] = rng ? rng.next() : Math.random(); al[i] = e.a === undefined ? 1 : e.a;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1)); g.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1)); g.setAttribute('aAlpha', new THREE.BufferAttribute(al, 1));
    const pts = new THREE.Points(g, pointMat(mode)); pts.frustumCulled = false; return pts;
  }
  G.makePoints = makePoints; G.pointMat = pointMat;

  // ------------------------------------------------------------------ parallax backdrop (shared by all views)
  G.createBackdrop = function () {
    const rng = U.rng(77), group = new THREE.Group(); group.name = 'backdrop';
    const layers = [];
    const defs = [{ n: 900, rad: 900, k: 0.0, s: 2.6, a: 0.8 }, { n: 420, rad: 700, k: 0.03, s: 3.6, a: 0.85 }, { n: 160, rad: 520, k: 0.09, s: 5.0, a: 0.9 }];
    const cols = [0xffffff, 0xbfdbfe, 0xfde68a, 0xfecaca, 0xc4b5fd];
    defs.forEach(function (d) {
      const ents = [];
      for (let i = 0; i < d.n; i++) {
        const v = new V3(rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)).normalize().multiplyScalar(d.rad * rng.range(0.85, 1.05));
        ents.push({ p: v, c: rng.pick(cols), s: d.s * rng.range(0.5, 1.6), a: rng.range(0.4, 1) });
      }
      const pts = makePoints(ents, 'glow', rng);
      const lay = new THREE.Group(); lay.add(pts); group.add(lay); layers.push({ g: lay, k: d.k, pts: pts });
    });
    // nebula blobs in the far layer
    const nebs = [], hues = [265, 190, 330, 25, 210, 290];
    for (let i = 0; i < 9; i++) {
      const tex = nebulaTex(100 + i, hues[i % hues.length]);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: rng.range(0.5, 0.9), depthTest: false }));
      const v = new V3(rng.range(-1, 1), rng.range(-0.7, 0.7), rng.range(-1, 1)).normalize().multiplyScalar(620);
      sp.position.copy(v); sp.scale.setScalar(rng.range(380, 640)); sp.renderOrder = -10; sp.material.rotation = rng.range(0, 6);
      layers[1].g.add(sp); nebs.push(sp);
    }
    return {
      group: group, layers: layers,
      update: function (camPos, t, scale) {
        for (let i = 0; i < layers.length; i++) { layers[i].g.position.copy(camPos).multiplyScalar(1 - layers[i].k); layers[i].pts.material.uniforms.uScale.value = scale; layers[i].pts.material.uniforms.uTime.value = t; }
      },
      dispose: function () { group.traverse(function (o) { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } }); }
    };
  };

  // ------------------------------------------------------------------ galaxy map visuals
  G.createView = function (gal) {
    const rng = U.rng(4242), group = new THREE.Group(); group.name = 'galaxyView';
    const mats = [];
    function reg(p) { mats.push(p.material); return p; }
    const disposables = [];

    // galactic dust following the spiral arms
    const dust = [];
    for (let i = 0; i < 3200; i++) {
      const u = rng.next(), r = 4 + Math.pow(u, 0.7) * 102, arm = rng.int(0, 2);
      const ang = arm / 3 * Math.PI * 2 + Math.log(Math.max(r, 8) / 22) * 2.3 + 0.0 + (rng.next() + rng.next() + rng.next() - 1.5) * (0.3 + 0.35 * (r / 100)) + 1.2;
      const p = new V3(Math.cos(ang) * r, (rng.next() - 0.5) * 3.5 * Math.max(0.2, 1 - r / 120), Math.sin(ang) * r);
      const hot = r < 30;
      dust.push({ p: p, c: hot ? 0xffe9a8 : rng.pick([0x93c5fd, 0xc4b5fd, 0xbfdbfe, 0xfde68a, 0xffffff]), s: rng.range(0.4, 1.3), a: rng.range(0.25, 0.65) });
    }
    const dustPts = reg(makePoints(dust, 'glow', rng)); group.add(dustPts);

    // nebula blobs in the disc plane
    for (let i = 0; i < 14; i++) {
      const r = rng.range(25, 90), a = rng.range(0, Math.PI * 2);
      const tex = nebulaTex(300 + i, [265, 200, 330, 20, 150][i % 5]); disposables.push(tex);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: rng.range(0.35, 0.6) }));
      sp.position.set(Math.cos(a) * r, rng.range(-3, 3), Math.sin(a) * r); sp.scale.setScalar(rng.range(35, 70)); sp.material.rotation = rng.range(0, 6);
      group.add(sp);
    }

    // stars (selectable) — glow points
    const sEnt = gal.stars.map(function (s) {
      const t = G.STAR_TYPES[s.type];
      return { p: s.pos, c: t.color, s: t.size * (s.core ? 3.2 : 1), a: s.bh ? 0.5 : 1 };
    });
    const starPts = reg(makePoints(sEnt, 'glow', rng)); group.add(starPts);

    // territory + rings, rebuilt when ownership changes
    let ringPts = null, blobPts = null;
    function rebuildOwnership(colonyStars, allyIds, discovered) {
      if (ringPts) { group.remove(ringPts); ringPts.geometry.dispose(); ringPts.material.dispose(); }
      if (blobPts) { group.remove(blobPts); blobPts.geometry.dispose(); blobPts.material.dispose(); }
      const rE = [], bE = [];
      gal.stars.forEach(function (s) {
        if (s.empire >= 0) {
          const em = gal.empires[s.empire];
          rE.push({ p: s.pos, c: em.color, s: s.capitalOf !== undefined ? 7.5 : 5.2, a: s.capitalOf !== undefined ? 1 : 0.8 });
          bE.push({ p: s.pos, c: em.color, s: s.capitalOf !== undefined ? 34 : 24, a: 0.14 });
        }
        if (s.grox) { rE.push({ p: s.pos, c: 0xff3b3b, s: 5.6, a: 0.9 }); bE.push({ p: s.pos, c: 0xff2222, s: 20, a: 0.1 }); }
        if (s.bh) { rE.push({ p: s.pos, c: 0xc084fc, s: 6, a: 1 }); bE.push({ p: s.pos, c: 0x7c3aed, s: 18, a: 0.2 }); }
      });
      (colonyStars || []).forEach(function (i) { const s = gal.stars[i]; rE.push({ p: s.pos, c: 0x5eead4, s: s.home ? 8.5 : 6.2, a: 1 }); bE.push({ p: s.pos, c: 0x2dd4bf, s: s.home ? 32 : 22, a: 0.16 }); });
      ringPts = reg(makePoints(rE, 'ring', rng)); blobPts = reg(makePoints(bE, 'blob', rng));
      group.add(blobPts); group.add(ringPts);
    }

    // glowing core
    const core = new THREE.Group(); group.add(core);
    const glowTex = G.glowTexture('rgba(255,244,200,1)', 'rgba(255,170,60,0)'); disposables.push(glowTex);
    [[70, 0.85, 0xfff1b8], [34, 0.9, 0xffffff], [120, 0.35, 0xffb347]].forEach(function (d) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: d[1], color: d[2] }));
      sp.scale.setScalar(d[0]); core.add(sp);
    });
    const swTex = swirlTex(); disposables.push(swTex);
    const swirls = [];
    [[44, 0.7, 0.18], [30, 0.9, -0.3]].forEach(function (d) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(d[0], d[0]), new THREE.MeshBasicMaterial({ map: swTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: d[1], side: THREE.DoubleSide }));
      m.rotation.x = -Math.PI / 2; core.add(m); swirls.push({ m: m, w: d[2] });
    });
    // Grox belt
    const belt = new THREE.Mesh(new THREE.RingGeometry(G.GROX_IN, G.GROX_OUT, 72, 1), new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    belt.rotation.x = -Math.PI / 2; group.add(belt);
    function circleLine(r, color, op, seg) {
      const pts = []; for (let i = 0; i < seg; i++) { const a = i / seg * Math.PI * 2; pts.push(new V3(Math.cos(a) * r, 0, Math.sin(a) * r)); }
      return new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false }));
    }
    group.add(circleLine(G.GROX_OUT, 0xff3b3b, 0.55, 120)); group.add(circleLine(G.GROX_IN, 0xff7b3b, 0.3, 90));

    // black holes (dark disc + accretion ring)
    const bhs = [];
    gal.bh.forEach(function (si) {
      const s = gal.stars[si], g = new THREE.Group(); g.position.copy(s.pos);
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.9, 14, 10), new THREE.MeshBasicMaterial({ color: 0x000000 })));
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.7, 0.18, 6, 32), new THREE.MeshBasicMaterial({ color: 0xc084fc, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
      ring.rotation.x = Math.PI / 2 - 0.35; g.add(ring);
      const ring2 = new THREE.Mesh(new THREE.TorusGeometry(2.5, 0.08, 6, 32), new THREE.MeshBasicMaterial({ color: 0x60a5fa, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
      ring2.rotation.x = Math.PI / 2 - 0.35; g.add(ring2);
      group.add(g); bhs.push({ ring: ring, ring2: ring2 });
    });
    // wormhole links (visible once the key is owned)
    const wormLines = new THREE.Group(); wormLines.visible = false; group.add(wormLines);
    for (let k = 0; k < gal.bh.length - 1; k++) {
      const a = gal.stars[gal.bh[k]].pos, b = gal.stars[gal.bh[k + 1]].pos;
      const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), new THREE.LineDashedMaterial({ color: 0xc084fc, dashSize: 1.4, gapSize: 1.0, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
      l.computeLineDistances(); wormLines.add(l);
    }
    const last = gal.stars[gal.bh[gal.bh.length - 1]].pos;
    const l2 = new THREE.Line(new THREE.BufferGeometry().setFromPoints([last, new V3(0, 0, 0)]), new THREE.LineDashedMaterial({ color: 0xfde047, dashSize: 1.0, gapSize: 1.0, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
    l2.computeLineDistances(); wormLines.add(l2);

    // drive range ring + route line
    const rangeRing = circleLine(1, 0x5eead4, 0.8, 128); group.add(rangeRing);
    const rangeDisc = new THREE.Mesh(new THREE.CircleGeometry(1, 64), new THREE.MeshBasicMaterial({ color: 0x14b8a6, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    rangeDisc.rotation.x = -Math.PI / 2; group.add(rangeDisc);
    const routeGeo = new THREE.BufferGeometry().setFromPoints([new V3(), new V3()]);
    const route = new THREE.Line(routeGeo, new THREE.LineBasicMaterial({ color: 0x5eead4, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
    route.visible = false; route.frustumCulled = false; group.add(route);

    rebuildOwnership([], [], null);

    return {
      group: group, starPts: starPts,
      rebuildOwnership: rebuildOwnership,
      setRange: function (centre, range) { rangeRing.position.copy(centre); rangeRing.scale.setScalar(range); rangeDisc.position.copy(centre); rangeDisc.scale.setScalar(range); },
      setRoute: function (a, b, ok) {
        if (!b) { route.visible = false; return; }
        route.visible = true; const p = routeGeo.attributes.position; p.setXYZ(0, a.x, a.y, a.z); p.setXYZ(1, b.x, b.y, b.z); p.needsUpdate = true;
        route.material.color.setHex(ok ? 0x5eead4 : 0xf43f5e);
      },
      showWormholes: function (v) { wormLines.visible = !!v; },
      update: function (dt, t, scale) {
        mats.forEach(function (m) { m.uniforms.uScale.value = scale; m.uniforms.uTime.value = t; });
        swirls.forEach(function (s) { s.m.rotation.z += s.w * dt; });
        bhs.forEach(function (b, i) { b.ring.rotation.z += dt * 1.4; b.ring2.rotation.z -= dt * 0.8; });
        belt.rotation.z += dt * 0.02;
      },
      dispose: function () {
        group.traverse(function (o) { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } });
        disposables.forEach(function (t) { t.dispose(); });
      }
    };
  };
})();
