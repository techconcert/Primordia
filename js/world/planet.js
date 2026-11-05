// SP.planet / SP.surf  -- procedural cel-shaded planet, flora resource layer, static decoration.
// Self-contained: owns its own seeded simplex noise (so several planets with different seeds can coexist),
// uses SP.render.toon when available (falls back to a local toon material).
(function () {
  'use strict';
  const SP = window.SP = window.SP || {};
  const V3 = THREE.Vector3;

  // ------------------------------------------------------------------ small helpers
  function prng(seed) {
    let a = (typeof seed === 'number' ? seed : hashStr(seed)) >>> 0;
    const next = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    return { next, range: (x, y) => x + (y - x) * next(), pick: (arr) => arr[Math.floor(next() * arr.length)], chance: (p) => next() < p };
  }
  function hashStr(s) { s = String(s); let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const mix = (a, b, t) => a + (b - a) * t;

  // 3D simplex noise (Gustavson), one instance per seed
  function makeNoise(seed) {
    const r = prng(seed), p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) { const j = Math.floor(r.next() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
    const perm = new Uint8Array(512), pm12 = new Uint8Array(512);
    for (let i = 0; i < 512; i++) { perm[i] = p[i & 255]; pm12[i] = perm[i] % 12; }
    const g3 = new Float32Array([1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0, 1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1, 0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1]);
    const F3 = 1 / 3, G3 = 1 / 6;
    return function noise3(xin, yin, zin) {
      let n0, n1, n2, n3;
      const s = (xin + yin + zin) * F3, i = Math.floor(xin + s), j = Math.floor(yin + s), k = Math.floor(zin + s);
      const t = (i + j + k) * G3, x0 = xin - (i - t), y0 = yin - (j - t), z0 = zin - (k - t);
      let i1, j1, k1, i2, j2, k2;
      if (x0 >= y0) {
        if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; } else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; } else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
      } else {
        if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; } else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; } else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
      }
      const x1 = x0 - i1 + G3, y1 = y0 - j1 + G3, z1 = z0 - k1 + G3, x2 = x0 - i2 + 2 * G3, y2 = y0 - j2 + 2 * G3, z2 = z0 - k2 + 2 * G3, x3 = x0 - 1 + 3 * G3, y3 = y0 - 1 + 3 * G3, z3 = z0 - 1 + 3 * G3;
      const ii = i & 255, jj = j & 255, kk = k & 255;
      let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
      if (t0 < 0) n0 = 0; else { const gi = pm12[ii + perm[jj + perm[kk]]] * 3; t0 *= t0; n0 = t0 * t0 * (g3[gi] * x0 + g3[gi + 1] * y0 + g3[gi + 2] * z0); }
      let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
      if (t1 < 0) n1 = 0; else { const gi = pm12[ii + i1 + perm[jj + j1 + perm[kk + k1]]] * 3; t1 *= t1; n1 = t1 * t1 * (g3[gi] * x1 + g3[gi + 1] * y1 + g3[gi + 2] * z1); }
      let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
      if (t2 < 0) n2 = 0; else { const gi = pm12[ii + i2 + perm[jj + j2 + perm[kk + k2]]] * 3; t2 *= t2; n2 = t2 * t2 * (g3[gi] * x2 + g3[gi + 1] * y2 + g3[gi + 2] * z2); }
      let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
      if (t3 < 0) n3 = 0; else { const gi = pm12[ii + 1 + perm[jj + 1 + perm[kk + 1]]] * 3; t3 *= t3; n3 = t3 * t3 * (g3[gi] * x3 + g3[gi + 1] * y3 + g3[gi + 2] * z3); }
      return 32 * (n0 + n1 + n2 + n3);
    };
  }
  function fbm(noise, x, y, z, oct) {
    let a = 1, f = 1, sum = 0, norm = 0;
    for (let o = 0; o < oct; o++) { sum += a * noise(x * f, y * f, z * f); norm += a; a *= 0.5; f *= 2.03; }
    return sum / norm;
  }

  // ------------------------------------------------------------------ biomes & palettes
  const B = { ocean: 0, beach: 1, grass: 2, forest: 3, desert: 4, tundra: 5, swamp: 6, rock: 7, snow: 8 };
  const BNAMES = ['ocean', 'beach', 'grass', 'forest', 'desert', 'tundra', 'swamp', 'rock', 'snow'];

  const PALETTES = {
    earth: {
      grass: [0x4d7c0f, 0x65a30d, 0x84cc16], forest: [0x3f6212, 0x4d7c0f, 0x65a30d], desert: [0xdcb13b, 0xe3be45, 0xe4cf7c], beach: [0xe4cf7c, 0xe5dbb3, 0xe3be45], // C-05: sand ~0.9 so the highlight band does not clip
      tundra: [0x8fa59a, 0xa8b8a8, 0xc3d0c4], swamp: [0x3b6b4e, 0x4d7f5a, 0x5f8f5a], rock: [0x334155, 0x475569, 0x64748b], snow: [0xcbd5e1, 0xe2e8f0, 0xf8fafc],
      seabedShallow: 0xd9c98a, seabedDeep: 0x1d6572, foam: 0xe6f9f7,
      canopy: [[0x15803d, 0x22c55e], [0x166534, 0x4ade80], [0x14532d, 0x16a34a], [0x15803d, 0x65a30d]], rare: [[0xb45309, 0xf59e0b], [0xbe185d, 0xf472b6], [0x9a3412, 0xfb923c]],
      pine: [0x166534, 0x15803d], trunk: 0x78350f, swampTree: [0x2f6f55, 0x4a9a6b], cactus: 0x3f8f4a,
      water: 0x06b6d4, waterDeep: 0x0e7490, atmo: 0x7dd3fc, sky: { day: 0x7dd3fc, horizon: 0xcdeffd }, fruit: [0xf43f5e, 0xa855f7, 0xf97316, 0xeab308, 0x38bdf8], bush: [0x2f7d32, 0x4caf50],
      flowers: [0xf472b6, 0xfacc15, 0xffffff, 0xa855f7, 0xfb923c, 0x38bdf8], mush: [0xf43f5e, 0xa855f7, 0x06b6d4, 0xf97316], tuft: [0x65a30d, 0x84cc16, 0xa3e635], seaweed: [0x14b8a6, 0x2dd4bf],
    },
    alien_purple: {
      grass: [0x6d28d9, 0x8b5cf6, 0xa78bfa], forest: [0x5b21b6, 0x7c3aed, 0x9061f9], desert: [0xfb7185, 0xfda4af, 0xfecdd3], beach: [0xfbcfe8, 0xfce7f3, 0xf9a8d4],
      tundra: [0x7dd3fc, 0xa5d8ff, 0xbae6fd], swamp: [0x0f766e, 0x14b8a6, 0x2dd4bf], rock: [0x3b2a5a, 0x57407a, 0x7a5fa0], snow: [0xe0e7ff, 0xeef2ff, 0xffffff],
      seabedShallow: 0xe9b5e0, seabedDeep: 0x4c1d95, foam: 0xfdf4ff,
      canopy: [[0xc026d3, 0xe879f9], [0x0891b2, 0x22d3ee], [0x7e22ce, 0xc084fc]], rare: [[0xea580c, 0xfdba74], [0x65a30d, 0xbef264]],
      pine: [0x0f766e, 0x2dd4bf], trunk: 0x4a2c6e, swampTree: [0x0e7490, 0x22d3ee], cactus: 0xdb2777,
      water: 0xf0abfc, waterDeep: 0x86198f, atmo: 0xe879f9, sky: { day: 0xc084fc, horizon: 0xfbcfe8 }, fruit: [0x22d3ee, 0xfacc15, 0x84cc16, 0xffffff, 0xfb7185], bush: [0x7e22ce, 0xc026d3],
      flowers: [0x22d3ee, 0xfacc15, 0xffffff, 0x84cc16, 0xfb923c, 0xf43f5e], mush: [0x22d3ee, 0x84cc16, 0xfacc15, 0xffffff], tuft: [0x8b5cf6, 0xa78bfa, 0xc4b5fd], seaweed: [0xf472b6, 0xfb7185],
    },
    ember: {
      grass: [0x7c2d12, 0x9a3412, 0xc2410c], forest: [0x57210f, 0x7c2d12, 0x9a3412], desert: [0xf59e0b, 0xfbbf24, 0xfcd34d], beach: [0x44403c, 0x57534e, 0x78716c],
      tundra: [0x78716c, 0xa8a29e, 0xd6d3d1], swamp: [0x365314, 0x4d7c0f, 0x65a30d], rock: [0x1c1917, 0x292524, 0x44403c], snow: [0xe7e5e4, 0xf5f5f4, 0xffffff],
      seabedShallow: 0xfb923c, seabedDeep: 0x7f1d1d, foam: 0xfef3c7,
      canopy: [[0xb91c1c, 0xf97316], [0x854d0e, 0xeab308], [0x7f1d1d, 0xef4444]], rare: [[0x15803d, 0x4ade80]],
      pine: [0x7f1d1d, 0xb91c1c], trunk: 0x292524, swampTree: [0x365314, 0x65a30d], cactus: 0xea580c,
      water: 0xf97316, waterDeep: 0x991b1b, atmo: 0xfdba74, sky: { day: 0xfb923c, horizon: 0xfde68a }, fruit: [0xfacc15, 0x22d3ee, 0xffffff, 0xa3e635, 0xf472b6], bush: [0x78350f, 0xb45309],
      flowers: [0xfacc15, 0xffffff, 0x22d3ee, 0xf43f5e, 0xa3e635, 0xf472b6], mush: [0xfacc15, 0x22d3ee, 0xa3e635, 0xffffff], tuft: [0xb45309, 0xd97706, 0xf59e0b], seaweed: [0xdc2626, 0xf97316],
    },
    ice: {
      grass: [0x5eaaa8, 0x7fcdcc, 0xa3e4e0], forest: [0x2f7f86, 0x3ba0a0, 0x5ec7bf], desert: [0xe0f2fe, 0xf0f9ff, 0xffffff], beach: [0xe0f2fe, 0xf0f9ff, 0xdbeafe],
      tundra: [0xbfdbfe, 0xdbeafe, 0xeff6ff], swamp: [0x1e6091, 0x2a7ab0, 0x3b95c4], rock: [0x475569, 0x64748b, 0x94a3b8], snow: [0xe2e8f0, 0xf1f5f9, 0xffffff],
      seabedShallow: 0xbfe9f7, seabedDeep: 0x1e3a8a, foam: 0xffffff,
      canopy: [[0x0f766e, 0x2dd4bf], [0x1d4ed8, 0x60a5fa], [0x4338ca, 0x818cf8]], rare: [[0xdb2777, 0xf9a8d4]],
      pine: [0x0f766e, 0x14b8a6], trunk: 0x475569, swampTree: [0x1e40af, 0x3b82f6], cactus: 0x38bdf8,
      water: 0x7dd3fc, waterDeep: 0x1e3a8a, atmo: 0xbae6fd, sky: { day: 0x93c5fd, horizon: 0xe0f2fe }, fruit: [0xf43f5e, 0xfacc15, 0xf97316, 0xffffff, 0xa855f7], bush: [0x0f766e, 0x14b8a6],
      flowers: [0xf472b6, 0xffffff, 0xfacc15, 0xa855f7, 0x38bdf8, 0xfb923c], mush: [0x38bdf8, 0xa855f7, 0xffffff, 0xf472b6], tuft: [0x5ec7bf, 0x99f6e4, 0xccfbf1], seaweed: [0x38bdf8, 0x818cf8],
    },
  };
  function resolvePalette(p) {
    if (!p) return PALETTES.earth;
    if (typeof p === 'string') return PALETTES[p] || PALETTES.earth;
    return Object.assign({}, PALETTES.earth, p);
  }

  // ------------------------------------------------------------------ materials (degrade gracefully)
  let _gm = null;
  function gradientMap() {
    if (SP.render && SP.render.gradientMap) return SP.render.gradientMap;
    if (!_gm) {
      _gm = new THREE.DataTexture(new Uint8Array([55, 60, 75, 255, 165, 172, 190, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat);
      _gm.minFilter = _gm.magFilter = THREE.NearestFilter; _gm.needsUpdate = true;
    }
    return _gm;
  }
  const _mc = {};
  function toon(hex, o) {
    o = o || {};
    if (SP.render && SP.render.toon) return SP.render.toon(hex, o);
    const k = hex + JSON.stringify(o);
    if (_mc[k]) return _mc[k];
    const m = new THREE.MeshToonMaterial({ color: hex, gradientMap: gradientMap(), vertexColors: !!o.vertexColors, transparent: !!o.transparent, opacity: o.opacity === undefined ? 1 : o.opacity, side: o.side === undefined ? THREE.FrontSide : o.side });
    if (o.emissive !== undefined) { m.emissive = new THREE.Color(o.emissive); m.emissiveIntensity = o.emissiveIntensity === undefined ? 1 : o.emissiveIntensity; }
    return (_mc[k] = m);
  }
  const INK = (SP.render && SP.render.INK) || 0x080c14;
  let _ink = null;
  function inkMat() { return _ink || (_ink = (SP.render && SP.render.outlineMaterial ? SP.render.outlineMaterial(INK) : new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide }))); }

  // ------------------------------------------------------------------ icosphere (recursive subdivision, indexed)
  function icosphere(detail) {
    const t = (1 + Math.sqrt(5)) / 2;
    let verts = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map((v) => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; });
    let faces = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
    for (let d = 0; d < detail; d++) {
      const cache = new Map(), nf = [];
      const mid = (a, b) => {
        const k = a < b ? a * 1048576 + b : b * 1048576 + a;
        let m = cache.get(k);
        if (m === undefined) {
          const va = verts[a], vb = verts[b]; let x = va[0] + vb[0], y = va[1] + vb[1], z = va[2] + vb[2]; const l = Math.hypot(x, y, z);
          m = verts.length; verts.push([x / l, y / l, z / l]); cache.set(k, m);
        }
        return m;
      };
      for (const f of faces) { const a = mid(f[0], f[1]), b = mid(f[1], f[2]), c = mid(f[2], f[0]); nf.push([f[0], a, c], [f[1], b, a], [f[2], c, b], [a, b, c]); }
      faces = nf;
    }
    return { verts, faces };
  }

  // ------------------------------------------------------------------ prop templates (merged, flat shaded, with outline hull)
  // part: { g: BufferGeometry, c: hex, p:[x,y,z], s:number|[sx,sy,sz], r:[rx,ry,rz], ol:bool }
  const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new V3(), _p = new V3();
  function buildTemplate(parts, olT, extra) {
    const pos = [], nor = [], col = [], opos = [];
    const c = new THREE.Color();
    for (const part of parts) {
      let g = part.g.index ? part.g.toNonIndexed() : part.g.clone();
      const sc = part.s === undefined ? [1, 1, 1] : (typeof part.s === 'number' ? [part.s, part.s, part.s] : part.s);
      const r = part.r || [0, 0, 0], p = part.p || [0, 0, 0];
      _e.set(r[0], r[1], r[2]); _q.setFromEuler(_e); _p.set(p[0], p[1], p[2]); _s.set(sc[0], sc[1], sc[2]);
      _m4.compose(_p, _q, _s);
      g.applyMatrix4(_m4); g.computeVertexNormals();
      const P = g.attributes.position.array, N = g.attributes.normal.array;
      c.setHex(part.c);
      const n = P.length / 3;
      for (let i = 0; i < n; i++) { pos.push(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); nor.push(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]); col.push(c.r, c.g, c.b); }
      if (part.ol !== false && olT > 0) {
        // scale hull about the part's centre; thin parts get extra thickness so the ink still reads
        g.computeBoundingBox(); const bb = g.boundingBox;
        const cx = (bb.min.x + bb.max.x) / 2, cy = (bb.min.y + bb.max.y) / 2, cz = (bb.min.z + bb.max.z) / 2;
        const sx = bb.max.x - bb.min.x, sy = bb.max.y - bb.min.y, sz = bb.max.z - bb.min.z;
        const ax = olT * 1.0 * Math.max(sx, 0.15) * 0.5 + 0.03, ay = olT * Math.max(sy, 0.15) * 0.5 + 0.03, az = olT * Math.max(sz, 0.15) * 0.5 + 0.03;
        const kx = 1 + ax / Math.max(sx / 2, 0.02), ky = 1 + ay / Math.max(sy / 2, 0.02), kz = 1 + az / Math.max(sz / 2, 0.02);
        for (let i = 0; i < n; i++) opos.push(cx + (P[i * 3] - cx) * kx, cy + (P[i * 3 + 1] - cy) * ky, cz + (P[i * 3 + 2] - cz) * kz);
      }
      g.dispose();
    }
    const t = { pos: new Float32Array(pos), nor: new Float32Array(nor), col: new Float32Array(col), opos: new Float32Array(opos), n: pos.length / 3, on: opos.length / 3, collR: 0, collH: 99 };
    return Object.assign(t, extra || {});
  }
  function templGeometry(t, outline) {
    const g = new THREE.BufferGeometry();
    if (outline) { g.setAttribute('position', new THREE.BufferAttribute(t.opos, 3)); }
    else { g.setAttribute('position', new THREE.BufferAttribute(t.pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(t.nor, 3)); g.setAttribute('color', new THREE.BufferAttribute(t.col, 3)); }
    g.computeBoundingSphere();
    return g;
  }

  // shared primitive geometries (low segment counts are part of the look)
  const G = {};
  function prims() {
    if (G.dodeca) return G;
    G.dodeca = new THREE.DodecahedronGeometry(1, 0);
    G.icosa = new THREE.IcosahedronGeometry(1, 0);
    G.octa = new THREE.OctahedronGeometry(1, 0);
    G.cyl5 = new THREE.CylinderGeometry(1, 1, 1, 5, 1, false);
    G.cyl6 = new THREE.CylinderGeometry(1, 1, 1, 6, 1, false);
    G.cyl7 = new THREE.CylinderGeometry(1, 1, 1, 7, 1, false);
    G.cyl8 = new THREE.CylinderGeometry(1, 1, 1, 8, 1, false);
    G.cone5 = new THREE.ConeGeometry(1, 1, 5, 1);
    G.cone6 = new THREE.ConeGeometry(1, 1, 6, 1);
    G.cone7 = new THREE.ConeGeometry(1, 1, 7, 1);
    G.sph = new THREE.SphereGeometry(1, 7, 5);
    G.sphS = new THREE.SphereGeometry(1, 6, 4);
    G.hemi = new THREE.SphereGeometry(1, 9, 5, 0, Math.PI * 2, 0, Math.PI * 0.5);
    G.box = new THREE.BoxGeometry(1, 1, 1);
    return G;
  }
  const HP = Math.PI / 2;

  function makeTemplates(P) {
    const g = prims(), T = {};
    const tr = P.trunk;
    // --- decorative trees
    T.treeRound = (cA) => buildTemplate([
      { g: g.cyl6, c: tr, p: [0, 1.15, 0], s: [0.38, 2.3, 0.38] },
      { g: g.dodeca, c: cA[0], p: [0, 2.9, 0], s: [1.65, 1.35, 1.65] },
      { g: g.dodeca, c: cA[1], p: [0.1, 4.0, 0], s: [1.1, 1.0, 1.1], r: [0.3, 0.6, 0] }], 0.07, { collR: 0.45 });
    T.treeTall = (cA) => buildTemplate([
      { g: g.cyl6, c: tr, p: [0, 1.8, 0], s: [0.34, 3.6, 0.34] },
      { g: g.dodeca, c: cA[0], p: [0, 3.9, 0], s: [1.5, 1.1, 1.5] },
      { g: g.dodeca, c: cA[1], p: [0.15, 5.0, 0.1], s: [1.15, 0.95, 1.15], r: [0.2, 0.9, 0] },
      { g: g.dodeca, c: cA[0], p: [0, 5.9, 0], s: [0.75, 0.75, 0.75] }], 0.07, { collR: 0.42 });
    T.pine = (cA, snow) => buildTemplate([
      { g: g.cyl5, c: tr, p: [0, 0.6, 0], s: [0.28, 1.2, 0.28] },
      { g: g.cone7, c: cA[0], p: [0, 1.9, 0], s: [1.5, 1.8, 1.5] },
      { g: g.cone7, c: cA[1], p: [0, 3.1, 0], s: [1.15, 1.6, 1.15] },
      { g: g.cone7, c: cA[0], p: [0, 4.2, 0], s: [0.8, 1.4, 0.8] }]
      .concat(snow ? [{ g: g.cone7, c: 0xf1f5f9, p: [0, 4.55, 0], s: [0.45, 0.8, 0.45], ol: false }] : []), 0.07, { collR: 0.4 });
    T.cactus = (flowerCol) => buildTemplate([
      { g: g.cyl8, c: P.cactus, p: [0, 1.1, 0], s: [0.42, 2.2, 0.42] },
      { g: g.sph, c: P.cactus, p: [0, 2.2, 0], s: [0.42, 0.42, 0.42] },
      { g: g.cyl6, c: P.cactus, p: [0.65, 1.2, 0], s: [0.2, 0.9, 0.2], r: [0, 0, -0.9] },
      { g: g.cyl6, c: P.cactus, p: [0.95, 1.65, 0], s: [0.2, 0.7, 0.2] },
      { g: g.cyl6, c: P.cactus, p: [-0.55, 1.5, 0], s: [0.18, 0.7, 0.18], r: [0, 0, 0.9] },
      { g: g.cyl6, c: P.cactus, p: [-0.85, 1.9, 0], s: [0.18, 0.6, 0.18] },
      { g: g.sphS, c: flowerCol, p: [0, 2.55, 0], s: [0.2, 0.2, 0.2], ol: false }], 0.08, { collR: 0.5 });
    T.swampTree = (cA) => buildTemplate([
      { g: g.cyl5, c: 0x4a3728, p: [0.25, 1.1, 0], s: [0.3, 2.4, 0.3], r: [0, 0, 0.18] },
      { g: g.cyl5, c: 0x4a3728, p: [-0.3, 0.5, 0.2], s: [0.14, 1.4, 0.14], r: [0.3, 0, -0.5] },
      { g: g.dodeca, c: cA[0], p: [0.5, 2.7, 0], s: [2.0, 0.85, 2.0] },
      { g: g.dodeca, c: cA[1], p: [0.4, 3.25, 0.1], s: [1.2, 0.7, 1.2] },
      { g: g.cone5, c: cA[1], p: [1.5, 2.0, 0.5], s: [0.12, 1.2, 0.12], r: [Math.PI, 0, 0], ol: false },
      { g: g.cone5, c: cA[1], p: [-0.4, 1.9, -0.8], s: [0.12, 1.0, 0.12], r: [Math.PI, 0, 0], ol: false }], 0.07, { collR: 0.5 });
    T.rock = (c1, c2) => buildTemplate([
      { g: g.dodeca, c: c1, p: [0, 0.35, 0], s: [0.95, 0.65, 0.8], r: [0.2, 0.5, 0.1] },
      { g: g.dodeca, c: c2, p: [0.75, 0.2, 0.2], s: [0.5, 0.38, 0.45], r: [0.1, 0.2, 0.5] }], 0.08, { collR: 0.85, collH: 0.9 });
    T.boulder = (c1, c2) => buildTemplate([
      { g: g.dodeca, c: c1, p: [0, 1.0, 0], s: [1.9, 1.5, 1.7], r: [0.3, 0.2, 0.1] },
      { g: g.dodeca, c: c2, p: [1.6, 0.6, 0.4], s: [0.9, 0.8, 0.9], r: [0.1, 0.9, 0.5] },
      { g: g.dodeca, c: c2, p: [-1.2, 0.45, -0.6], s: [0.65, 0.55, 0.6] }], 0.06, { collR: 2.0, collH: 3 });
    T.crystal = (c1) => buildTemplate([
      { g: g.octa, c: c1, p: [0, 0.9, 0], s: [0.45, 1.3, 0.45] },
      { g: g.octa, c: c1, p: [0.55, 0.5, 0.2], s: [0.3, 0.8, 0.3], r: [0, 0, -0.4] },
      { g: g.octa, c: c1, p: [-0.45, 0.4, -0.2], s: [0.25, 0.65, 0.25], r: [0, 0, 0.5] }], 0.08, { collR: 0.6, collH: 1.5 });
    T.tuft = (c1, c2) => buildTemplate([
      { g: g.cone5, c: c1, p: [0, 0.38, 0], s: [0.1, 0.8, 0.1], ol: false },
      { g: g.cone5, c: c2, p: [0.16, 0.3, 0.06], s: [0.09, 0.6, 0.09], r: [0, 0, -0.35], ol: false },
      { g: g.cone5, c: c2, p: [-0.15, 0.3, -0.05], s: [0.09, 0.62, 0.09], r: [0.2, 0, 0.35], ol: false },
      { g: g.cone5, c: c1, p: [0.02, 0.28, -0.17], s: [0.08, 0.5, 0.08], r: [-0.4, 0, 0], ol: false }], 0);
    T.flower = (cHead, cLeaf) => buildTemplate([
      { g: g.cyl5, c: cLeaf, p: [0, 0.3, 0], s: [0.04, 0.6, 0.04], ol: false },
      { g: g.cone5, c: cLeaf, p: [0.12, 0.15, 0], s: [0.08, 0.3, 0.08], r: [0, 0, -1.1], ol: false },
      { g: g.sph, c: cHead, p: [0, 0.68, 0], s: [0.2, 0.15, 0.2] },
      { g: g.sphS, c: 0xfde047, p: [0, 0.78, 0], s: [0.09, 0.08, 0.09], ol: false }], 0.1);
    T.mushroom = (cCap) => buildTemplate([
      { g: g.cyl8, c: 0xfef9c3, p: [0, 0.4, 0], s: [0.2, 0.8, 0.2] },
      { g: g.hemi, c: cCap, p: [0, 0.75, 0], s: [0.78, 0.62, 0.78] },
      { g: g.sphS, c: 0xffffff, p: [0.32, 1.12, 0.08], s: [0.12, 0.08, 0.12], ol: false },
      { g: g.sphS, c: 0xffffff, p: [-0.2, 1.2, -0.18], s: [0.12, 0.08, 0.12], ol: false },
      { g: g.sphS, c: 0xffffff, p: [-0.05, 1.3, 0.25], s: [0.1, 0.07, 0.1], ol: false }], 0.09, { collR: 0.25 });
    T.reed = (c1) => buildTemplate([
      { g: g.cone5, c: c1, p: [0, 0.9, 0], s: [0.07, 1.8, 0.07], ol: false },
      { g: g.cone5, c: c1, p: [0.18, 0.75, 0.05], s: [0.07, 1.5, 0.07], r: [0, 0, -0.25], ol: false },
      { g: g.cone5, c: c1, p: [-0.15, 0.8, -0.08], s: [0.07, 1.6, 0.07], r: [0.15, 0, 0.2], ol: false },
      { g: g.cyl5, c: 0x78350f, p: [0, 1.85, 0], s: [0.1, 0.35, 0.1], ol: false }], 0);
    T.shrub = () => buildTemplate([
      { g: g.cyl5, c: 0x92400e, p: [0, 0.35, 0], s: [0.05, 0.7, 0.05], r: [0, 0, 0.3] },
      { g: g.cyl5, c: 0x92400e, p: [0.1, 0.4, 0], s: [0.05, 0.8, 0.05], r: [0, 0, -0.4] },
      { g: g.cyl5, c: 0x92400e, p: [0, 0.3, 0.1], s: [0.04, 0.6, 0.04], r: [0.5, 0, 0] }], 0.1);
    T.log = () => buildTemplate([
      { g: g.cyl6, c: tr, p: [0, 0.3, 0], s: [0.3, 1.6, 0.3], r: [0, 0, HP] },
      { g: g.cyl6, c: 0xfcd34d, p: [0.82, 0.3, 0], s: [0.22, 0.04, 0.22], r: [0, 0, HP], ol: false }], 0.1, { collR: 0.5, collH: 0.7 });
    T.stump = () => buildTemplate([{ g: g.cyl7, c: tr, p: [0, 0.25, 0], s: [0.45, 0.5, 0.45] }, { g: g.cyl7, c: 0xfcd34d, p: [0, 0.51, 0], s: [0.38, 0.03, 0.38], ol: false }], 0.1, { collR: 0.4, collH: 0.6 });
    // --- resource nodes
    T.bush = (cl, cl2) => buildTemplate([
      { g: g.dodeca, c: cl, p: [0, 0.5, 0], s: [1.0, 0.65, 0.95], r: [0, 0.3, 0] },
      { g: g.dodeca, c: cl2, p: [0.55, 0.38, 0.2], s: [0.62, 0.45, 0.6], r: [0.2, 0.9, 0] },
      { g: g.dodeca, c: cl2, p: [-0.5, 0.4, -0.25], s: [0.6, 0.45, 0.58], r: [0.4, 0.2, 0] }], 0.07);
    T.fruitTree = (cl, cl2) => buildTemplate([
      { g: g.cyl6, c: tr, p: [0, 0.9, 0], s: [0.22, 1.8, 0.22] },   // thin trunk (r ~0.46 u at node scale ~2.1), canopy high (Primordia proportions)
      { g: g.dodeca, c: cl, p: [0, 2.3, 0], s: [1.35, 1.1, 1.35], r: [0, 0.4, 0] },
      { g: g.dodeca, c: cl2, p: [0.75, 2.0, 0.25], s: [0.8, 0.7, 0.8], r: [0.3, 0.8, 0] },
      { g: g.dodeca, c: cl2, p: [-0.7, 2.1, -0.35], s: [0.8, 0.7, 0.8], r: [0.1, 0.1, 0.4] },
      { g: g.dodeca, c: cl, p: [0, 3.0, 0], s: [0.8, 0.7, 0.8] }], 0.07, { collR: 0.5 });
    T.seaweed = (c1, c2) => buildTemplate([
      { g: g.cone5, c: c1, p: [0, 0.8, 0], s: [0.16, 1.6, 0.16], ol: false },
      { g: g.cone5, c: c2, p: [0.3, 0.65, 0.1], s: [0.14, 1.3, 0.14], r: [0, 0, -0.3], ol: false },
      { g: g.cone5, c: c2, p: [-0.28, 0.7, -0.1], s: [0.14, 1.4, 0.14], r: [0.2, 0, 0.3], ol: false },
      { g: g.cone5, c: c1, p: [0.05, 0.55, -0.3], s: [0.12, 1.1, 0.12], r: [-0.4, 0, 0], ol: false }], 0);
    return T;
  }

  // ------------------------------------------------------------------ SP.surf
  const _t1 = new V3(), _t2 = new V3();
  const surf = {
    up(pos, out) { return (out || new V3()).copy(pos).normalize(); },
    projectOnTangent(v, up, out) { out = out || new V3(); const d = v.dot(up); return out.copy(v).addScaledVector(up, -d); },
    // heading: Vector3 (projected) or angle in radians measured from "north" (toward +Y pole) around up
    tangentForward(up, heading, out) {
      out = out || new V3();
      if (heading && heading.isVector3) { out.copy(heading).addScaledVector(up, -heading.dot(up)); if (out.lengthSq() < 1e-8) out.set(0, 0, 1).addScaledVector(up, -up.z); return out.normalize(); }
      const ref = Math.abs(up.y) < 0.95 ? _t1.set(0, 1, 0) : _t1.set(1, 0, 0);
      const east = _t2.crossVectors(ref, up).normalize(); const north = new V3().crossVectors(up, east).normalize();
      return out.copy(north).multiplyScalar(Math.cos(heading || 0)).addScaledVector(east, Math.sin(heading || 0)).normalize();
    },
    orient(obj, pos, forward) {
      const up = new V3().copy(pos).normalize();
      const f = new V3().copy(forward).addScaledVector(up, -forward.dot(up));
      if (f.lengthSq() < 1e-8) f.set(0, 0, 1).addScaledVector(up, -up.z);
      f.normalize();
      const x = new V3().crossVectors(up, f).normalize();
      const m = surf._m || (surf._m = new THREE.Matrix4());
      m.makeBasis(x, up, f);
      obj.position.copy(pos);
      obj.quaternion.setFromRotationMatrix(m);
      return obj;
    },
    // move along the great circle by `dist` units in tangent direction `fwd`; result projected onto terrain
    move(pos, fwd, dist, planet) {
      const r = pos.length(), up = new V3().copy(pos).divideScalar(r);
      const f = new V3().copy(fwd).addScaledVector(up, -fwd.dot(up)).normalize();
      const a = dist / r;
      const d = up.multiplyScalar(Math.cos(a)).addScaledVector(f, Math.sin(a)).normalize();
      if (planet) return d.multiplyScalar(Math.max(planet.surfaceRadius(d), planet.seaRadius ? 0 : 0));
      return d.multiplyScalar(r);
    },
    greatCircleDist(a, b, radius) {
      const ra = a.length(), rb = b.length(); const c = clamp(a.dot(b) / (ra * rb), -1, 1);
      return Math.acos(c) * (radius || (ra + rb) / 2);
    },
  };
  SP.surf = surf;

  // ------------------------------------------------------------------ planet
  function create(opts) {
    opts = opts || {};
    const seed = opts.seed === undefined ? 1 : opts.seed;
    const radius = opts.radius || 140;
    const detail = opts.detail === undefined ? 6 : opts.detail;
    const amp = opts.amplitude || 9;
    const seaLevel = opts.seaLevel || 0;
    const seaRadius = radius + seaLevel;
    const pal = resolvePalette(opts.palette);
    const seedN = typeof seed === 'number' ? seed : hashStr(seed);
    const bias = Object.assign({ wet: 0, warm: 0, land: 0 }, opts.biomeBias || {});
    const R = prng(seedN ^ 0x9e3779b9);
    const n1 = makeNoise(seedN + 11), n2 = makeNoise(seedN + 23), n3 = makeNoise(seedN + 37), n4 = makeNoise(seedN + 51), n5 = makeNoise(seedN + 67), n6 = makeNoise(seedN + 83), n7 = makeNoise(seedN + 97), n8 = makeNoise(seedN + 101);
    const ox = R.range(-50, 50), oy = R.range(-50, 50), oz = R.range(-50, 50);

    // --- continent field + sea-level quantile so the ocean covers 35-45 %
    const contRaw = (x, y, z) => {
      const c = fbm(n1, x * 1.25 + ox, y * 1.25 + oy, z * 1.25 + oz, 4);
      return c * 1.5 + 0.28 * fbm(n2, x * 3.3 + oy, y * 3.3 + oz, z * 3.3 + ox, 3);
    };
    const seaFrac = clamp(0.35 + 0.10 * R.next() - bias.land * 0.1, 0.3, 0.5);
    let seaT;
    {
      const N = 5000, arr = new Float32Array(N), ga = Math.PI * (3 - Math.sqrt(5));
      for (let i = 0; i < N; i++) { const y = 1 - (i + 0.5) / N * 2, r = Math.sqrt(1 - y * y), th = i * ga; arr[i] = contRaw(Math.cos(th) * r, y, Math.sin(th) * r); }
      arr.sort(); seaT = arr[Math.floor(seaFrac * N)];
    }
    const maxH = amp * 1.55;

    // heightAt: elevation relative to `radius` for a unit direction (x,y,z)
    function heightAt(x, y, z) {
      const e = contRaw(x, y, z) - seaT;
      if (e < 0) {
        const d = -e;
        return -amp * (0.10 * ss(0, 0.05, d) + 0.58 * ss(0.04, 0.5, d)) + 0.12 * amp * fbm(n3, x * 6 + ox, y * 6, z * 6, 2) * ss(0.05, 0.3, d);
      }
      let h = amp * (0.15 * ss(0, 0.09, e) + 0.30 * ss(0.05, 0.55, e));
      h += amp * 0.2 * fbm(n3, x * 4.6 + oz, y * 4.6 + ox, z * 4.6 + oy, 3) * ss(0.03, 0.22, e);
      if (e > 0.1) {
        const mask = ss(0.28, 0.75, 0.5 + 0.55 * fbm(n5, x * 1.7 + oy, y * 1.7 + ox, z * 1.7 + oz, 2)) * ss(0.1, 0.5, e);
        if (mask > 0.001) {
          let rg = 1 - Math.abs(fbm(n4, x * 2.6 + ox, y * 2.6 + oz, z * 2.6 + oy, 4));
          rg = rg * rg * rg;
          h += amp * 0.95 * rg * mask;
        }
      }
      h += amp * 0.04 * n3(x * 15, y * 15 + oy, z * 15) * ss(0.02, 0.1, e);
      return h;
    }
    // climate
    function tempAt(x, y, z, h) {
      const lat = Math.abs(y);
      return 1.1 - 1.05 * Math.pow(lat, 2.1) + 0.22 * fbm(n7, x * 1.9 + oz, y * 1.9 + ox, z * 1.9 + oy, 2) - Math.max(0, h) / amp * 0.07 + bias.warm;
    }
    function moistAt(x, y, z) { return 0.5 + 0.55 * fbm(n6, x * 2.3 + oy, y * 2.3 + oz, z * 2.3 + ox, 3) + bias.wet; }
    function biomeFrom(h, t, m, slope) {
      const hs = h - seaLevel;
      if (hs < -0.06) return B.ocean;
      const peak = hs / amp;
      if (peak > 1.15 || (peak > 0.8 && t < 0.4)) return B.snow;
      if (peak > 0.88 || slope > 0.62) return B.rock;
      if (t < 0.1) return B.snow;
      if (t < 0.3) return B.tundra;
      if (hs < 0.75) return t > 0.3 && !(m > 0.72 && t > 0.5) ? B.beach : B.swamp;
      if (t > 0.74 && m < 0.44) return B.desert;
      if (m > 0.64 && peak < 0.4 && t > 0.42) return B.swamp;
      if (m > 0.54) return B.forest;
      return B.grass;
    }

    const surfaceRadius = (dir) => {
      const l = dir.x * dir.x + dir.y * dir.y + dir.z * dir.z, k = Math.abs(l - 1) < 1e-6 ? 1 : 1 / Math.sqrt(l);
      return radius + heightAt(dir.x * k, dir.y * k, dir.z * k);
    };

    // ---------------------------------------------------------------- mesh
    const ico = icosphere(detail);
    const nv = ico.verts.length, nf = ico.faces.length;
    const vh = new Float32Array(nv);
    for (let i = 0; i < nv; i++) { const v = ico.verts[i]; vh[i] = heightAt(v[0], v[1], v[2]); }
    const positions = new Float32Array(nf * 9), colors = new Float32Array(nf * 9);
    const faceBiome = new Uint8Array(nf), faceC = new Float32Array(nf * 3), faceArea = new Float32Array(nf), faceSlope = new Float32Array(nf);
    const col = new THREE.Color(), col2 = new THREE.Color();
    function paintFace(b, hs, jit, noiseV, depth) {
      const peak = hs / amp;
      let arr;
      switch (b) {
        case B.grass: arr = pal.grass; break; case B.forest: arr = pal.forest; break; case B.desert: arr = pal.desert; break; case B.beach: arr = pal.beach; break;
        case B.tundra: arr = pal.tundra; break; case B.swamp: arr = pal.swamp; break; case B.snow: arr = pal.snow; break; case B.rock: arr = pal.rock; break; default: arr = null;
      }
      if (!arr) { // ocean floor, shallow -> deep, foam at the coast
        const k = ss(0.1, 3.8, depth);
        col.setHex(pal.seabedShallow); col2.setHex(pal.seabedDeep); col.lerp(col2, k);
        if (depth < 0.4) { col2.setHex(pal.foam); col.lerp(col2, (1 - depth / 0.4) * 0.9); }
        const j = 1 + (jit - 0.5) * 0.08; return col.multiplyScalar(j);
      }
      const v = clamp(0.5 + noiseV * 0.9 + (jit - 0.5) * 0.9, 0, 1);
      if (v < 0.5) { col.setHex(arr[0]); col2.setHex(arr[1]); col.lerp(col2, v * 2); } else { col.setHex(arr[1]); col2.setHex(arr[2]); col.lerp(col2, (v - 0.5) * 2); }
      if (b === B.rock) { col2.setHex(pal.snow[1]); col.lerp(col2, ss(0.8, 1.05, peak)); }
      if (b === B.grass || b === B.forest) { if (peak > 0.45) { col2.setHex(pal.rock[2]); col.lerp(col2, ss(0.45, 0.72, peak) * 0.7); } }
      return col;
    }
    for (let f = 0; f < nf; f++) {
      const fa = ico.faces[f], a = ico.verts[fa[0]], b = ico.verts[fa[1]], c = ico.verts[fa[2]];
      const ra = radius + vh[fa[0]], rb = radius + vh[fa[1]], rc = radius + vh[fa[2]];
      const ax = a[0] * ra, ay = a[1] * ra, az = a[2] * ra, bx = b[0] * rb, by = b[1] * rb, bz = b[2] * rb, cx = c[0] * rc, cy = c[1] * rc, cz = c[2] * rc;
      const o = f * 9;
      positions[o] = ax; positions[o + 1] = ay; positions[o + 2] = az; positions[o + 3] = bx; positions[o + 4] = by; positions[o + 5] = bz; positions[o + 6] = cx; positions[o + 7] = cy; positions[o + 8] = cz;
      // face normal & slope vs radial
      const ux = bx - ax, uy = by - ay, uz = bz - az, wx = cx - ax, wy = cy - ay, wz = cz - az;
      let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx; const nl = Math.hypot(nx, ny, nz) || 1; faceArea[f] = nl / 2; nx /= nl; ny /= nl; nz /= nl;
      let dx = a[0] + b[0] + c[0], dy = a[1] + b[1] + c[1], dz = a[2] + b[2] + c[2]; const dl = Math.hypot(dx, dy, dz); dx /= dl; dy /= dl; dz /= dl;
      faceC[f * 3] = dx; faceC[f * 3 + 1] = dy; faceC[f * 3 + 2] = dz;
      const cosT = Math.abs(nx * dx + ny * dy + nz * dz), slope = Math.sqrt(Math.max(0, 1 - cosT * cosT)); faceSlope[f] = slope;
      const h = (vh[fa[0]] + vh[fa[1]] + vh[fa[2]]) / 3;
      const t = tempAt(dx, dy, dz, h), m = moistAt(dx, dy, dz);
      const bi = biomeFrom(h, t, m, slope); faceBiome[f] = bi;
      const jit = ((f * 2654435761) >>> 0) / 4294967296;
      const nv2 = bi === B.ocean ? 0 : n8(dx * 9 + ox, dy * 9, dz * 9 + oz);
      const cc = paintFace(bi, h - seaLevel, jit, nv2, seaLevel - h);
      for (let k = 0; k < 3; k++) { colors[o + k * 3] = cc.r; colors[o + k * 3 + 1] = cc.g; colors[o + k * 3 + 2] = cc.b; }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    const terrain = new THREE.Mesh(geo, toon(0xffffff, { vertexColors: true }));
    terrain.receiveShadow = true; terrain.name = 'terrain';

    // water (low-res flat-shaded sphere; seabed colours give the depth gradient)
    const wico = icosphere(Math.min(detail, 4));
    const wpos = new Float32Array(wico.faces.length * 9);
    wico.faces.forEach((fa, i) => { for (let k = 0; k < 3; k++) { const v = wico.verts[fa[k]]; wpos[i * 9 + k * 3] = v[0] * seaRadius; wpos[i * 9 + k * 3 + 1] = v[1] * seaRadius; wpos[i * 9 + k * 3 + 2] = v[2] * seaRadius; } });
    const wgeo = new THREE.BufferGeometry(); wgeo.setAttribute('position', new THREE.BufferAttribute(wpos, 3)); wgeo.computeVertexNormals();
    const waterMat = toon(pal.water, { transparent: true, opacity: 0.7 }).clone();
    waterMat.depthWrite = false;
    const water = new THREE.Mesh(wgeo, waterMat); water.name = 'water'; water.renderOrder = 2;

    // atmosphere rim (hidden when the camera is inside)
    const atmoGroup = new THREE.Group(); atmoGroup.name = 'atmosphere';
    const atmoMats = [];
    [[1.045, 0.20], [1.09, 0.10]].forEach(([k, a]) => {
      const m = new THREE.MeshBasicMaterial({ color: pal.atmo, side: THREE.BackSide, transparent: true, opacity: a, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
      m.userData.base = a; atmoMats.push(m);
      const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(radius * k, 4), m); mesh.renderOrder = 3; mesh.frustumCulled = false;
      mesh.onBeforeRender = (rd, sc, cam) => { m.opacity = cam.position.lengthSq() > radius * radius * k * k * 0.97 ? m.userData.base : 0; };
      atmoGroup.add(mesh);
    });

    const group = new THREE.Group(); group.name = 'planet';
    group.add(terrain, water, atmoGroup);

    // ---------------------------------------------------------------- analytic queries
    const _d = new V3(), _a = new V3(), _b = new V3(), _c = new V3(), _r1 = new V3(), _r2 = new V3(), _tmp = new V3();
    function dirOf(v) { return _d.copy(v).normalize(); }
    function normalAt(dir, out) {
      out = out || new V3();
      const d = _tmp.copy(dir).normalize();
      const ref = Math.abs(d.y) < 0.95 ? _r1.set(0, 1, 0) : _r1.set(1, 0, 0);
      const e1 = _r2.crossVectors(ref, d).normalize();
      const e2 = _a.crossVectors(d, e1).normalize();
      const k = 1.6 / radius;
      _b.copy(d).addScaledVector(e1, k).normalize(); const p1x = _b.x, p1y = _b.y, p1z = _b.z;
      const q1 = radius + heightAt(p1x, p1y, p1z);
      const P1x = p1x * q1, P1y = p1y * q1, P1z = p1z * q1;
      _b.copy(d).addScaledVector(e2, k).normalize();
      const q2 = radius + heightAt(_b.x, _b.y, _b.z);
      const P2x = _b.x * q2, P2y = _b.y * q2, P2z = _b.z * q2;
      const q0 = radius + heightAt(d.x, d.y, d.z);
      const ux = P1x - d.x * q0, uy = P1y - d.y * q0, uz = P1z - d.z * q0, wx = P2x - d.x * q0, wy = P2y - d.y * q0, wz = P2z - d.z * q0;
      let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx; const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l; ny /= l; nz /= l;
      if (nx * d.x + ny * d.y + nz * d.z < 0) { nx = -nx; ny = -ny; nz = -nz; }
      return out.set(nx, ny, nz);
    }
    const planet = {
      seed, radius, seaRadius, detail, amplitude: amp, palette: pal, paletteName: typeof opts.palette === 'string' ? opts.palette : 'earth',
      group, terrain, water, atmosphere: atmoGroup,
      heightAt, surfaceRadius,
      surfacePoint(dir, out) { const d = dirOf(dir); const r = surfaceRadius(d); return (out || new V3()).copy(d).multiplyScalar(r); },
      groundOrWater(dir, out) {
        const d = dirOf(dir), r = surfaceRadius(d), w = r < seaRadius;
        return { point: (out || new V3()).copy(d).multiplyScalar(w ? seaRadius : r), water: w, depth: w ? seaRadius - r : 0 };
      },
      normalAt,
      isWater(dir) { const d = dirOf(dir); return surfaceRadius(d) < seaRadius - 0.02; },
      slopeAt(dir) { const n = normalAt(dir, _c); const d = dirOf(dir); return Math.sqrt(Math.max(0, 1 - Math.min(1, n.dot(d)) ** 2)); },
      biomeAt(dir) {
        const d = dirOf(dir), x = d.x, y = d.y, z = d.z, h = heightAt(x, y, z);
        let slope = 0; if (h - seaLevel > amp * 0.25) { const n = normalAt(d, _c); const dd = _d; slope = Math.sqrt(Math.max(0, 1 - Math.min(1, n.dot(dd)) ** 2)); }
        return BNAMES[biomeFrom(h, tempAt(x, y, z, h), moistAt(x, y, z), slope)];
      },
      temperatureAt(dir) { const d = dirOf(dir); return tempAt(d.x, d.y, d.z, heightAt(d.x, d.y, d.z)); },
      moistureAt(dir) { const d = dirOf(dir); return moistAt(d.x, d.y, d.z); },
      randomLandDir(rng, filter) {
        const next = rng.next ? () => rng.next() : Math.random;
        const out = new V3();
        let fb = null;
        for (let i = 0; i < 400; i++) {
          const y = next() * 2 - 1, th = next() * Math.PI * 2, r = Math.sqrt(1 - y * y);
          out.set(Math.cos(th) * r, y, Math.sin(th) * r);
          const rr = surfaceRadius(out);
          if (rr < seaRadius + 0.3) continue;
          if (!fb) fb = out.clone();
          if (!filter || filter(out.clone(), planet.biomeAt(out), rr)) return out.clone();
        }
        return (fb || new V3(0, 1, 0)).clone();
      },
      biomeStats: null, colliders: [], faceBiome,
    };

    // biome statistics (fraction of land / of surface)
    {
      const cnt = new Float64Array(9); let tot = 0;
      for (let f = 0; f < nf; f++) { cnt[faceBiome[f]] += faceArea[f]; tot += faceArea[f]; }
      const st = {}; BNAMES.forEach((n, i) => { st[n] = cnt[i] / tot; }); st.land = 1 - st.ocean; planet.biomeStats = st;
    }

    // ---------------------------------------------------------------- static decoration (baked into spatial chunks)
    const T = makeTemplates(pal);
    const tplList = [], tplIdx = {};
    function tpl(key, builder) { if (tplIdx[key] === undefined) { tplIdx[key] = tplList.length; tplList.push(builder()); } return tplIdx[key]; }
    const CH = 6; // C-08: finer chunks (216) so distance culling can drop far props
    const instances = []; // {t, px,py,pz, ux,uy,uz, yaw, s, k, chunk}
    const colliders = [];
    function chunkOf(x, y, z) {
      const ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(z); let face, u, v;
      if (ax >= ay && ax >= az) { face = x > 0 ? 0 : 1; u = y / ax; v = z / ax; } else if (ay >= az) { face = y > 0 ? 2 : 3; u = x / ay; v = z / ay; } else { face = z > 0 ? 4 : 5; u = x / az; v = y / az; }
      return face * CH * CH + Math.min(CH - 1, Math.floor((u + 1) / 2 * CH)) * CH + Math.min(CH - 1, Math.floor((v + 1) / 2 * CH));
    }
    const rp = prng(seedN ^ 0xabcdef);
    function barycentric(f) {
      let u = rp.next(), v = rp.next(); if (u + v > 1) { u = 1 - u; v = 1 - v; }
      const o = f * 9, w = 1 - u - v;
      return [positions[o] * w + positions[o + 3] * u + positions[o + 6] * v, positions[o + 1] * w + positions[o + 4] * u + positions[o + 7] * v, positions[o + 2] * w + positions[o + 5] * u + positions[o + 8] * v];
    }
    function addProp(t, p, scale, k) {
      const l = Math.hypot(p[0], p[1], p[2]), ux = p[0] / l, uy = p[1] / l, uz = p[2] / l;
      instances.push({ t, px: p[0], py: p[1], pz: p[2], ux, uy, uz, yaw: rp.next() * Math.PI * 2, s: scale, k: k === undefined ? 0.92 + rp.next() * 0.16 : k, ch: chunkOf(ux, uy, uz) });
      const T0 = tplList[t];
      if (T0.collR > 0) colliders.push({ x: p[0], y: p[1], z: p[2], r: T0.collR * scale, h: T0.collH * scale });
    }
    const canopy = pal.canopy, rare = pal.rare;
    const treeKeys = (i, rareP) => { const set = rp.chance(rareP) ? rare : canopy; return set[i % set.length]; };
    // variant tables (built lazily)
    const vTreeRound = [], vTreeTall = [], vPine = [], vRock = [], vFlower = [], vMush = [], vTuft = [], vCactus = [], vSwamp = [], vBoulder = [];
    canopy.concat(rare).forEach((c, i) => { vTreeRound.push(tpl('tr' + i, () => T.treeRound(c))); vTreeTall.push(tpl('tt' + i, () => T.treeTall(c))); });
    const nCan = canopy.length;
    [0, 1].forEach((i) => { vPine.push(tpl('pine' + i, () => T.pine(pal.pine, i === 1))); });
    [[pal.rock[1], pal.rock[2]], [pal.rock[0], pal.rock[1]], [0x94a3b8, 0x64748b]].forEach((c, i) => { vRock.push(tpl('rock' + i, () => T.rock(c[0], c[1]))); });
    vBoulder.push(tpl('boulder0', () => T.boulder(pal.rock[1], pal.rock[2])), tpl('boulder1', () => T.boulder(pal.rock[0], pal.rock[1])));
    const sandRock = tpl('sandrock', () => T.rock(0xb45309, 0xd97706)), sandRock2 = tpl('sandrock2', () => T.rock(0xa16207, 0xca8a04));
    pal.flowers.forEach((c, i) => vFlower.push(tpl('fl' + i, () => T.flower(c, 0x16a34a))));
    pal.mush.forEach((c, i) => vMush.push(tpl('mu' + i, () => T.mushroom(c))));
    pal.tuft.forEach((c, i) => vTuft.push(tpl('tu' + i, () => T.tuft(c, pal.tuft[(i + 1) % 3]))));
    ['0xf472b6', '0xfacc15', '0xfb923c'].forEach((c, i) => vCactus.push(tpl('ca' + i, () => T.cactus(+c))));
    pal.swampTree && vSwamp.push(tpl('sw0', () => T.swampTree(pal.swampTree)), tpl('sw1', () => T.swampTree([pal.swampTree[1], pal.swampTree[0]])));
    const tReed = tpl('reed', () => T.reed(0x6b8e23)), tShrub = tpl('shrub', () => T.shrub()), tLog = tpl('log', () => T.log()), tStump = tpl('stump', () => T.stump());
    const tCrystal = [tpl('cry0', () => T.crystal(0x67e8f9)), tpl('cry1', () => T.crystal(0xc4b5fd))];
    const rpick = (arr) => arr[Math.floor(rp.next() * arr.length)];
    const dens = opts.propDensity === undefined ? 1 : opts.propDensity;

    // per-face noise "clumpiness" so forests have glades, flowers cluster in meadows
    for (let f = 0; f < nf; f++) {
      const b = faceBiome[f];
      if (b === B.ocean) continue;
      const area = faceArea[f], slope = faceSlope[f];
      const dx = faceC[f * 3], dy = faceC[f * 3 + 1], dz = faceC[f * 3 + 2];
      const clump = ss(-0.25, 0.35, n8(dx * 7 + oz, dy * 7 + oy, dz * 7 + ox));
      const clump2 = ss(-0.1, 0.5, n5(dx * 11 + ox, dy * 11, dz * 11 + oz));
      const p = (d, c) => rp.next() < d * dens * area * (c === undefined ? 1 : c);
      const at = () => barycentric(f);
      const flat = slope < 0.42;
      switch (b) {
        case B.forest:
          if (flat && p(0.075, 0.25 + clump)) { const ci = Math.floor(rp.next() * nCan * (rp.chance(0.08) ? 1 : 1)); const rare2 = rp.chance(0.1); const idx = rare2 ? nCan + Math.floor(rp.next() * rare.length) : ci; addProp(rp.chance(0.4) ? vTreeTall[idx] : vTreeRound[idx], at(), 0.85 + rp.next() * 0.65); }
          if (p(0.05, clump2)) addProp(rpick(vTuft), at(), 0.9 + rp.next() * 0.6);
          if (p(0.012, clump2)) addProp(rpick(vMush), at(), 0.8 + rp.next() * 0.7);
          if (p(0.006)) addProp(rpick(vRock), at(), 0.6 + rp.next() * 0.7);
          if (p(0.004)) addProp(rp.chance(0.6) ? tLog : tStump, at(), 0.8 + rp.next() * 0.5);
          if (p(0.012, clump2)) addProp(rpick(vFlower), at(), 0.9 + rp.next() * 0.5);
          break;
        case B.grass:
          if (flat && p(0.010, clump)) addProp(vTreeRound[Math.floor(rp.next() * nCan)], at(), 0.8 + rp.next() * 0.6);
          if (p(0.07, 0.3 + clump2)) addProp(rpick(vTuft), at(), 0.9 + rp.next() * 0.7);
          if (p(0.07, clump2 * clump2)) addProp(rpick(vFlower), at(), 0.9 + rp.next() * 0.6);
          if (p(0.006)) addProp(rpick(vRock), at(), 0.6 + rp.next() * 0.9);
          if (p(0.004, clump)) addProp(rpick(vMush), at(), 0.8 + rp.next() * 0.5);
          break;
        case B.desert:
          if (flat && p(0.012)) addProp(rpick(vCactus), at(), 0.8 + rp.next() * 0.7);
          if (p(0.012)) addProp(rp.chance(0.5) ? sandRock : sandRock2, at(), 0.7 + rp.next() * 1.1);
          if (p(0.015)) addProp(tShrub, at(), 0.8 + rp.next() * 0.7);
          if (p(0.0015)) addProp(rpick(vBoulder), at(), 0.8 + rp.next() * 0.5);
          break;
        case B.tundra:
          if (flat && p(0.022, 0.3 + clump)) addProp(rpick(vPine), at(), 0.8 + rp.next() * 0.7);
          if (p(0.015)) addProp(rpick(vRock), at(), 0.6 + rp.next() * 0.8);
          if (p(0.02, clump2)) addProp(rpick(vTuft), at(), 0.8 + rp.next() * 0.5);
          break;
        case B.swamp:
          if (flat && p(0.03, 0.3 + clump)) addProp(rpick(vSwamp), at(), 0.8 + rp.next() * 0.6);
          if (p(0.07, clump2)) addProp(tReed, at(), 0.8 + rp.next() * 0.7);
          if (p(0.02, clump2)) { addProp(rpick(vMush), at(), 1.4 + rp.next() * 1.6); }
          if (p(0.008)) addProp(rpick(vRock), at(), 0.5 + rp.next() * 0.6);
          break;
        case B.beach:
          if (p(0.006)) addProp(rpick(vRock), at(), 0.4 + rp.next() * 0.6);
          if (p(0.008, clump2)) addProp(rpick(vTuft), at(), 0.6 + rp.next() * 0.4);
          break;
        case B.rock:
          if (p(0.012)) addProp(rpick(vRock), at(), 0.8 + rp.next() * 1.2);
          if (p(0.0022)) addProp(rpick(vBoulder), at(), 0.8 + rp.next() * 0.8);
          if (p(0.001)) addProp(rpick(tCrystal), at(), 0.8 + rp.next() * 0.9);
          if (flat && p(0.004)) addProp(rpick(vPine), at(), 0.7 + rp.next() * 0.5);
          break;
        case B.snow:
          if (p(0.006)) addProp(rpick(vRock), at(), 0.7 + rp.next() * 1.0);
          if (p(0.0012)) addProp(rpick(tCrystal), at(), 0.8 + rp.next() * 0.9);
          if (flat && p(0.004)) addProp(vPine[1], at(), 0.7 + rp.next() * 0.5);
          break;
      }
    }
    // bake chunks
    const byChunk = new Map();
    for (const it of instances) { let a = byChunk.get(it.ch); if (!a) byChunk.set(it.ch, a = []); a.push(it); }
    const propsGroup = new THREE.Group(); propsGroup.name = 'props';
    const chunkMeshes = [];
    const qA = new THREE.Quaternion(), qB = new THREE.Quaternion(), yAxis = new V3(0, 1, 0), upv = new V3();
    const mat = new THREE.Matrix4(), one = new V3();
    let triCount = 0;
    byChunk.forEach((list, ch) => {
      let nMain = 0, nOl = 0;
      for (const it of list) { nMain += tplList[it.t].n; nOl += tplList[it.t].on; }
      const P = new Float32Array(nMain * 3), N = new Float32Array(nMain * 3), C = new Float32Array(nMain * 3), OP = new Float32Array(nOl * 3);
      let io = 0, ioo = 0;
      for (const it of list) {
        const t0 = tplList[it.t];
        upv.set(it.ux, it.uy, it.uz); qA.setFromUnitVectors(yAxis, upv); qB.setFromAxisAngle(yAxis, it.yaw); qA.multiply(qB);
        mat.compose(_p.set(it.px, it.py, it.pz), qA, one.set(it.s, it.s, it.s)); const e = mat.elements, nm = new THREE.Matrix3().setFromMatrix4(mat);
        const m00 = e[0], m10 = e[1], m20 = e[2], m01 = e[4], m11 = e[5], m21 = e[6], m02 = e[8], m12 = e[9], m22 = e[10], tx = e[12], ty = e[13], tz = e[14];
        const kk = it.k;
        for (let i = 0; i < t0.n; i++) {
          const x = t0.pos[i * 3], y = t0.pos[i * 3 + 1], z = t0.pos[i * 3 + 2];
          P[io * 3] = m00 * x + m01 * y + m02 * z + tx; P[io * 3 + 1] = m10 * x + m11 * y + m12 * z + ty; P[io * 3 + 2] = m20 * x + m21 * y + m22 * z + tz;
          const nx = t0.nor[i * 3], ny = t0.nor[i * 3 + 1], nz = t0.nor[i * 3 + 2];
          const s1 = 1 / it.s; N[io * 3] = (m00 * nx + m01 * ny + m02 * nz) * s1; N[io * 3 + 1] = (m10 * nx + m11 * ny + m12 * nz) * s1; N[io * 3 + 2] = (m20 * nx + m21 * ny + m22 * nz) * s1;
          C[io * 3] = Math.min(1, t0.col[i * 3] * kk); C[io * 3 + 1] = Math.min(1, t0.col[i * 3 + 1] * kk); C[io * 3 + 2] = Math.min(1, t0.col[i * 3 + 2] * kk);
          io++;
        }
        for (let i = 0; i < t0.on; i++) {
          const x = t0.opos[i * 3], y = t0.opos[i * 3 + 1], z = t0.opos[i * 3 + 2];
          OP[ioo * 3] = m00 * x + m01 * y + m02 * z + tx; OP[ioo * 3 + 1] = m10 * x + m11 * y + m12 * z + ty; OP[ioo * 3 + 2] = m20 * x + m21 * y + m22 * z + tz; ioo++;
        }
      }
      const g1 = new THREE.BufferGeometry();
      g1.setAttribute('position', new THREE.BufferAttribute(P, 3)); g1.setAttribute('normal', new THREE.BufferAttribute(N, 3)); g1.setAttribute('color', new THREE.BufferAttribute(C, 3)); g1.computeBoundingSphere();
      const m1 = new THREE.Mesh(g1, toon(0xffffff, { vertexColors: true })); m1.name = 'props_' + ch; propsGroup.add(m1); chunkMeshes.push(m1); m1.matrixAutoUpdate = false;
      if (nOl) {
        const g2 = new THREE.BufferGeometry(); g2.setAttribute('position', new THREE.BufferAttribute(OP, 3)); g2.boundingSphere = g1.boundingSphere;
        const m2 = new THREE.Mesh(g2, inkMat()); m2.name = 'propsOutline_' + ch; /* name[5]==='O' marks outlines */ m2.matrixAutoUpdate = false; propsGroup.add(m2); chunkMeshes.push(m2);
      }
      triCount += (nMain + nOl) / 3;
    });
    group.add(propsGroup);
    planet.props = { group: propsGroup, chunks: chunkMeshes, count: instances.length, triangles: triCount, cullScale: 0.6, outlineScale: 0.3, _last: new V3(1e9, 0, 0) };
    // C-08: distance culling of baked prop chunks (far chunks vanish into the fog; mid-distance chunks lose their ink hull)
    function cullProps(focus) {
      const P = planet.props, R = flora.cullRadius * P.cullScale;
      if (!focus || !isFinite(R)) { if (P._culled) { chunkMeshes.forEach((m) => { m.visible = true; }); P._culled = false; } return; }
      if (!P._culled || P._last.distanceToSquared(focus) > 4) {
        P._last.copy(focus); P._culled = true; const RO = flora.cullRadius * P.outlineScale;
        for (const m of chunkMeshes) {
          const bs = m.geometry.boundingSphere, d = bs.center.distanceTo(focus) - bs.radius;
          m.visible = m.name.charAt(5) === 'O' ? d < RO : d < R;
        }
      }
    }
    planet.colliders = colliders;

    // ---------------------------------------------------------------- flora (resource nodes)
    const flora = buildFlora();
    function buildFlora() {
      const rf = prng(seedN ^ 0x51ed27);
      const nodes = [];
      const areaK = (radius / 140) * (radius / 140) * (opts.floraDensity === undefined ? 1 : opts.floraDensity);
      const want = { bush: Math.round(620 * areaK), tree: Math.round(230 * areaK), seaweed: Math.round(110 * areaK) };
      const dormantExtra = 0.32;
      const weight = [0, 0.25, 1, 0.95, 0.12, 0.2, 0.7, 0.02, 0]; // by biome
      const regrowBy = [0, 34, 22, 14, 45, 38, 18, 60, 99]; // seconds per fruit by biome
      const cell = 4.5, hashCell = new Map();
      const hkey = (x, y, z) => Math.floor(x / cell) * 73856093 ^ Math.floor(y / cell) * 19349663 ^ Math.floor(z / cell) * 83492791;
      const tooClose = (x, y, z, r) => {
        const cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell);
        for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
          const arr = hashCell.get((cx + a) * 73856093 ^ (cy + b) * 19349663 ^ (cz + c) * 83492791);
          if (arr) for (const n of arr) { const dx = n.pos.x - x, dy = n.pos.y - y, dz = n.pos.z - z; if (dx * dx + dy * dy + dz * dz < r * r) return true; }
        }
        return false;
      };
      const total = (want.bush + want.tree + want.seaweed) * (1 + dormantExtra);
      const counts = { bush: 0, tree: 0, seaweed: 0 };
      const cap = { bush: Math.round(want.bush * (1 + dormantExtra)), tree: Math.round(want.tree * (1 + dormantExtra)), seaweed: Math.round(want.seaweed * (1 + dormantExtra)) };
      let tries = 0, id = 0;
      const fruitPal = pal.fruit;
      while (tries++ < 60000 && (counts.bush < cap.bush || counts.tree < cap.tree || counts.seaweed < cap.seaweed)) {
        const f = Math.floor(rf.next() * nf);
        const b = faceBiome[f];
        let type;
        if (b === B.ocean) {
          if (counts.seaweed >= cap.seaweed) continue;
          const o = f * 9, hAvg = (Math.hypot(positions[o], positions[o + 1], positions[o + 2]) + Math.hypot(positions[o + 3], positions[o + 4], positions[o + 5]) + Math.hypot(positions[o + 6], positions[o + 7], positions[o + 8])) / 3;
          const depth = seaRadius - hAvg; if (depth < 0.5 || depth > 3.4) continue; type = 'seaweed';
        } else {
          if (rf.next() > weight[b]) continue;
          if (faceSlope[f] > 0.4) continue;
          type = rf.next() < 0.27 ? 'tree' : 'bush';
          if (counts[type] >= cap[type]) { type = type === 'tree' ? 'bush' : 'tree'; if (counts[type] >= cap[type]) continue; }
        }
        // clumping: fruit patches
        const dx0 = faceC[f * 3], dy0 = faceC[f * 3 + 1], dz0 = faceC[f * 3 + 2];
        if (type !== 'seaweed') { const cl = ss(-0.3, 0.3, n8(dx0 * 5 + oy, dy0 * 5 + oz, dz0 * 5)); if (rf.next() > 0.25 + cl) continue; }
        let u = rf.next(), v = rf.next(); if (u + v > 1) { u = 1 - u; v = 1 - v; } const w = 1 - u - v, o = f * 9;
        const px = positions[o] * w + positions[o + 3] * u + positions[o + 6] * v, py = positions[o + 1] * w + positions[o + 4] * u + positions[o + 7] * v, pz = positions[o + 2] * w + positions[o + 5] * u + positions[o + 8] * v;
        if (tooClose(px, py, pz, type === 'tree' ? 5.5 : 3.6)) continue;
        // avoid decorative collider overlap
        let blocked = false;
        for (let ci = 0; ci < colliders.length && !blocked; ci += 1) { const c = colliders[ci]; if (Math.abs(c.x - px) < 2 && Math.abs(c.y - py) < 2 && Math.abs(c.z - pz) < 2 && (c.x - px) ** 2 + (c.y - py) ** 2 + (c.z - pz) ** 2 < (c.r + 1.2) ** 2) blocked = true; }
        if (blocked) continue;
        const pos = new V3(px, py, pz), dir = pos.clone().normalize();
        const node = {
          id: 'f' + (id++), type, dir, pos, biome: BNAMES[b], active: true, size: 1, vigor: 1, acc: 0, spreadT: 0, yaw: rf.next() * Math.PI * 2, scale: 0.85 + rf.next() * 0.5, dirty: true,
          maxFruit: type === 'tree' ? 6 + Math.floor(rf.next() * 3) : type === 'seaweed' ? 3 : 4 + Math.floor(rf.next() * 3),
          regrow: (type === 'seaweed' ? 26 : regrowBy[b]) * (0.8 + rf.next() * 0.5) * (type === 'tree' ? 1.25 : 1),
          fruitColor: type === 'seaweed' ? 0xfda4af : fruitPal[Math.floor(rf.next() * fruitPal.length)], slots: [],
        };
        node.fruit = Math.floor(rf.next() * (node.maxFruit + 1));
        if (type === 'tree') node.scale = 1.8 + rf.next() * 0.6; // tree nodes ~6-8 u tall (Primordia: trees tower over animals)
        if (type === 'seaweed') node.scale = 0.9 + rf.next() * 0.6;
        // basis + fruit slots (local east/north/up offsets)
        const ref = Math.abs(dir.y) < 0.95 ? new V3(0, 1, 0) : new V3(1, 0, 0);
        node.east = new V3().crossVectors(ref, dir).normalize(); node.north = new V3().crossVectors(dir, node.east).normalize();
        for (let s = 0; s < node.maxFruit; s++) {
          const a = rf.next() * Math.PI * 2, th = rf.next() * 1.1;
          let R0, hgt;
          if (type === 'tree') { R0 = 1.1 + rf.next() * 0.9; hgt = 2.0 + Math.cos(th) * 1.0 + rf.next() * 0.3; R0 *= Math.sin(th) * 0.9 + 0.5; }
          else if (type === 'bush') { R0 = 0.55 + rf.next() * 0.45; hgt = 0.5 + Math.cos(th) * 0.5; R0 *= Math.sin(th) * 0.8 + 0.35; }
          else { R0 = 0.35; hgt = 0.35 + rf.next() * 1.0; }
          node.slots.push([Math.cos(a) * R0, Math.sin(a) * R0, hgt]);
        }
        const k = hkey(px, py, pz); let arr = hashCell.get(k); if (!arr) hashCell.set(k, arr = []); arr.push(node);
        if (type === 'seaweed') node.maxFruit = 3;
        // dormant extras start inactive
        if (nodes.length >= (want.bush + want.tree + want.seaweed) && counts[type] >= want[type]) { node.active = false; node.size = 0; node.fruit = 0; node.vigor = 0.7; }
        else if (counts[type] >= want[type]) { node.active = false; node.size = 0; node.fruit = 0; node.vigor = 0.7; }
        counts[type]++;
        nodes.push(node);
        if (type !== 'seaweed' && node.type === 'tree') colliders.push({ x: px, y: py, z: pz, r: 0.22 * node.scale, h: 3, node });
      }
      return makeFloraSystem(nodes, hashCell);
    }

    function makeFloraSystem(nodes, hashCell) {
      const fruitGeo = new THREE.IcosahedronGeometry(0.24, 0), fruitOl = new THREE.IcosahedronGeometry(0.24 * 1.32, 0);
      const maxFruitTotal = nodes.reduce((s, n) => s + n.maxFruit, 0);
      const ks = { bush: 0, tree: 0, seaweed: 0 }; nodes.forEach((n) => { ks[n.type]++; });
      const mk = (geo, olGeo, mater, olMat, cap, name) => {
        const m = new THREE.InstancedMesh(geo, mater, Math.max(1, cap)); m.frustumCulled = false; m.name = name; m.count = 0;
        let o = null;
        if (olGeo) { o = new THREE.InstancedMesh(olGeo, olMat, Math.max(1, cap)); o.instanceMatrix = m.instanceMatrix; o.frustumCulled = false; o.name = name + '_ol'; o.count = 0; }
        m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        return { m, o };
      };
      const tplBush = tpl('nodeBush', () => T.bush(pal.bush[0], pal.bush[1])), tplTree = tpl('nodeTree', () => T.fruitTree(pal.canopy[0][0], pal.bush[1] === 0x4caf50 ? 0x4caf50 : pal.canopy[0][1])), tplSea = tpl('nodeSea', () => T.seaweed(pal.seaweed[0], pal.seaweed[1]));
      const vcMat = toon(0xffffff, { vertexColors: true });
      const body = {
        bush: mk(templGeometry(tplList[tplBush]), templGeometry(tplList[tplBush], true), vcMat, inkMat(), ks.bush, 'bush'),
        tree: mk(templGeometry(tplList[tplTree]), templGeometry(tplList[tplTree], true), vcMat, inkMat(), ks.tree, 'ftree'),
        seaweed: mk(templGeometry(tplList[tplSea]), null, vcMat, null, ks.seaweed, 'seaweed'),
      };
      const fruit = mk(fruitGeo, fruitOl, toon(0xffffff), inkMat(), maxFruitTotal, 'fruit');
      fruit.m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, maxFruitTotal) * 3), 3);
      const fgroup = new THREE.Group(); fgroup.name = 'flora';
      [body.bush, body.tree, body.seaweed, fruit].forEach((x) => { fgroup.add(x.m); if (x.o) fgroup.add(x.o); });
      group.add(fgroup);

      const boosts = [];
      const S = {
        nodes, group: fgroup, growthMul: 1, cullRadius: 130, time: 0, _dirty: true, _acc: 0, _lastFocus: new V3(1e9, 0, 0), _seedQ: [],
        stats: { active: 0, fruit: 0, withered: 0, seeded: 0 },
        nearest(pos, maxDist, filter) {
          let best = null, bd = maxDist * maxDist;
          const f = filter || ((n) => n.fruit > 0);
          for (let i = 0; i < nodes.length; i++) {
            const n = nodes[i]; if (!n.active) continue;
            const dx = n.pos.x - pos.x; if (dx > maxDist || dx < -maxDist) continue;
            const dy = n.pos.y - pos.y, dz = n.pos.z - pos.z, d = dx * dx + dy * dy + dz * dz;
            if (d < bd && f(n)) { bd = d; best = n; }
          }
          return best;
        },
        within(pos, maxDist, out) {
          out = out || []; const m2 = maxDist * maxDist;
          for (let i = 0; i < nodes.length; i++) { const n = nodes[i]; if (!n.active) continue; const dx = n.pos.x - pos.x, dy = n.pos.y - pos.y, dz = n.pos.z - pos.z; if (dx * dx + dy * dy + dz * dz < m2) out.push(n); }
          return out;
        },
        take(node, n) {
          if (!node || !node.active) return 0;
          const t = Math.min(n === undefined ? 1 : n, node.fruit);
          if (t <= 0) return 0;
          node.fruit -= t; node.vigor = Math.max(0, node.vigor - 0.035 * t); node.dirty = true; S._dirty = true;
          if (node.vigor <= 0.02 && node.fruit === 0 && node.size >= 1) { node.withered = (node.withered || 0) + 1; }
          return t;
        },
        boost(pos, rad, mul, dur) { boosts.push({ dir: pos.clone().normalize(), cos: Math.cos(rad / radius), mul, t: dur }); },
        update(dt, focus) {
          S.time += dt;
          for (let i = boosts.length - 1; i >= 0; i--) { boosts[i].t -= dt; if (boosts[i].t <= 0) boosts.splice(i, 1); }
          let act = 0, fr = 0, wi = 0;
          for (let i = 0; i < nodes.length; i++) {
            const n = nodes[i];
            if (!n.active) continue;
            act++;
            if (n.size < 1) { n.size = Math.min(1, n.size + dt / 80); n.dirty = true; S._dirty = true; }
            let mul = S.growthMul;
            if (boosts.length) for (const b of boosts) if (n.dir.dot(b.dir) > b.cos) mul *= b.mul;
            const sick = n.vigor < 0.15;
            if (n.size >= 0.6 && n.fruit < n.maxFruit && !sick) {
              n.acc += dt * mul * (0.35 + 0.65 * n.vigor);
              if (n.acc >= n.regrow) { n.acc -= n.regrow; n.fruit++; n.dirty = true; S._dirty = true; }
            }
            if (n.vigor < 1) { n.vigor = Math.min(1, n.vigor + dt / (n.fruit >= n.maxFruit * 0.5 ? 150 : 400) * (mul > 1 ? 1.5 : 1)); }
            fr += n.fruit; if (sick) wi++;
            // overgrazed to death: wither away (becomes dormant, may be re-seeded later)
            if (n.vigor <= 0.02 && n.fruit === 0 && n.withered > 3 && n.type !== 'seaweed') { n.active = false; n.size = 0; n.withered = 0; n.deadT = S.time; n.dirty = true; S._dirty = true; continue; }
            if (n.vigor > 0.85 && n.fruit >= n.maxFruit && n.size >= 1 && n.type !== 'seaweed') {
              n.spreadT += dt * mul;
              if (n.spreadT > 100 + (i % 7) * 12) { n.spreadT = 0; S.seed(n); }
            }
          }
          S.stats.active = act; S.stats.fruit = fr; S.stats.withered = wi;
          S._acc += dt;
          const fp = focus || null;
          if (S._dirty || (fp && fp.distanceToSquared(S._lastFocus) > 36) || S._acc > 1.5) {
            if (S._acc > 0.2) { S._acc = 0; S.rebuild(fp); }
          }
        },
        // plant a sapling in a dormant slot near `parent`
        seed(parent) {
          let best = null, bd = 1e9;
          for (let i = 0; i < nodes.length; i++) {
            const n = nodes[i]; if (n.active || n.type !== parent.type) continue;
            if (n.deadT !== undefined && S.time - n.deadT < 120) continue;
            const d = n.pos.distanceTo(parent.pos);
            if (d > 3 && d < 18 && d < bd - Math.random() * 6) { bd = d; best = n; }
          }
          if (!best) return null;
          best.active = true; best.size = 0.12; best.fruit = 0; best.vigor = 0.7; best.acc = 0; best.dirty = true; best.deadT = undefined; S._dirty = true; S.stats.seeded++;
          return best;
        },
        rebuild(focus) {
          const R2 = S.cullRadius * S.cullRadius, fp = focus || S._lastFocus;
          if (focus) S._lastFocus.copy(focus);
          const cnt = { bush: 0, tree: 0, seaweed: 0 }; let fc = 0;
          const mm = new THREE.Matrix4(), q = new THREE.Quaternion(), q2 = new THREE.Quaternion(), s3 = new V3(), up = new V3(), p3 = new V3(), colr = new THREE.Color();
          const fm = fruit.m;
          for (let i = 0; i < nodes.length; i++) {
            const n = nodes[i];
            if (!n.active) continue;
            if (focus) { const dx = n.pos.x - fp.x, dy = n.pos.y - fp.y, dz = n.pos.z - fp.z; if (dx * dx + dy * dy + dz * dz > R2) continue; }
            const bm = body[n.type];
            const sz = n.scale * (0.5 + 0.5 * n.size) * (0.78 + 0.22 * n.vigor);
            q.setFromUnitVectors(yAxis, n.dir); q2.setFromAxisAngle(yAxis, n.yaw); q.multiply(q2);
            mm.compose(n.pos, q, s3.set(sz, sz, sz));
            bm.m.setMatrixAt(cnt[n.type]++, mm);
            if (n.fruit > 0 && n.size >= 0.55) {
              colr.setHex(n.fruitColor);
              const fs = n.scale * (0.5 + 0.5 * n.size);
              for (let s = 0; s < n.fruit; s++) {
                const sl = n.slots[s];
                p3.copy(n.pos).addScaledVector(n.east, sl[0] * fs).addScaledVector(n.north, sl[1] * fs).addScaledVector(n.dir, sl[2] * fs);
                mm.compose(p3, q, s3.set(n.type === 'seaweed' ? 0.8 : 1, n.type === 'seaweed' ? 0.8 : 1, n.type === 'seaweed' ? 0.8 : 1));
                fm.setMatrixAt(fc, mm); fm.setColorAt(fc, colr); fc++;
              }
            }
            n.dirty = false;
          }
          for (const k of ['bush', 'tree', 'seaweed']) { const bm = body[k]; bm.m.count = cnt[k]; bm.m.instanceMatrix.needsUpdate = true; if (bm.o) bm.o.count = cnt[k]; }
          fm.count = fc; fm.instanceMatrix.needsUpdate = true; if (fm.instanceColor) fm.instanceColor.needsUpdate = true; fruit.o.count = fc;
          S._dirty = false; S.visibleFruit = fc; S.visibleNodes = cnt.bush + cnt.tree + cnt.seaweed;
        },
      };
      S.rebuild(null);
      return S;
    }
    planet.flora = flora;
    // decorative colliders from baked props may also include fruit trees (node-linked); remove ghost entries for dormant nodes lazily in physics

    // ---------------------------------------------------------------- update / dispose
    planet.update = function (dt, t, focus) {
      const tt = t === undefined ? flora.time : t;
      waterMat.opacity = 0.68 + 0.04 * Math.sin(tt * 0.9);
      water.scale.setScalar(1 + 0.0007 * Math.sin(tt * 0.7));
      flora.update(dt, focus);
      cullProps(focus);
    };
    planet.dispose = function () {
      group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      if (group.parent) group.parent.remove(group);
    };
    return planet;
  }

  SP.planet = { create, PALETTES, _tools: { buildTemplate, templGeometry, prims, toon, inkMat }, BIOMES: BNAMES, _makeNoise: makeNoise, _icosphere: icosphere, _prng: prng };
})();
