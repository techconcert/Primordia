/* SP.parts — catalog of cell / creature / outfit parts with procedural mesh builders.
 * Part-local frame: +Y = surface normal (outwards), +Z = creature forward (or "up" for front-mounted parts).
 * Every build() returns a THREE.Group made of cached unit primitives, scaled per mesh (chunky toon + ink outline).
 * Sub-objects may carry userData.anim ({type,axis,amp,speed,phase,react}) which anim.js animates generically.
 */
(function () {
  'use strict';
  const SP = window.SP = window.SP || {};

  const K = {
    bone: 0xfffbeb, dk: 0x1e293b, wine: 0x881337, claw: 0xd97706, beak: 0xf59e0b, w: 0xffffff, ink: 0x080c14,
    gold: 0xeab308, rose: 0xf43f5e, cyan: 0x22d3ee, lime: 0x84cc16, pink: 0xec4899, purple: 0xa855f7, wood: 0x92400e, stone: 0x64748b, straw: 0xfbbf24
  };
  const DEF_COLORS = { base: 0x22c55e, accent: 0xfffbeb, detail: 0x1e293b, pattern: 'none' };

  // Build-time context set by mesh.js (outline / shadows / lod). Kept module-level because build() has a fixed signature.
  const ctx = { outline: true, shadows: true, low: false };

  // ------------------------------------------------------------------ geometry + mesh helpers
  const gc = {};
  function cached(key, mk) { let g = gc[key]; if (!g) { g = gc[key] = mk(); g.userData.keep = true; } return g; }
  const geo = {
    sph() { return ctx.low ? cached('sphL', () => new THREE.SphereGeometry(1, 10, 7)) : cached('sph', () => new THREE.SphereGeometry(1, 14, 10)); },
    hemi() { return cached('hemi', () => new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2)); },
    cyl(t) { t = t === undefined ? 1 : t; const k = Math.round(t * 100); return cached('cyl' + k + (ctx.low ? 'L' : ''), () => new THREE.CylinderGeometry(t, 1, 1, ctx.low ? 6 : 9, 1)); },
    cone() { return cached('cone' + (ctx.low ? 'L' : ''), () => new THREE.ConeGeometry(1, 1, ctx.low ? 5 : 8)); },
    box() { return cached('box', () => new THREE.BoxGeometry(1, 1, 1)); },
    tor(tube) { tube = tube || 0.25; const k = Math.round(tube * 100); return cached('tor' + k, () => new THREE.TorusGeometry(1, tube, 8, 16)); },
    dod() { return cached('dod', () => new THREE.DodecahedronGeometry(1)); },
    oct() { return cached('oct', () => new THREE.OctahedronGeometry(1)); },
    tet() { return cached('tet', () => new THREE.TetrahedronGeometry(1)); },
    tri() { return cached('tri', () => new THREE.CylinderGeometry(1, 1, 1, 3)); }
  };

  function toonMat(hex, o) { return SP.render && SP.render.toon ? SP.render.toon(hex, o) : new THREE.MeshToonMaterial({ color: hex }); }
  function inkMat() { return SP.render && SP.render.outlineMaterial ? SP.render.outlineMaterial() : new THREE.MeshBasicMaterial({ color: K.ink, side: THREE.BackSide }); }

  // M(geo, hex, {p:[x,y,z], s:k|[x,y,z], r:[x,y,z], ol:outline factor, emissive})
  function M(g, hex, o) {
    o = o || {};
    const m = new THREE.Mesh(g, o.mat || toonMat(hex, o.emissive !== undefined ? { emissive: o.emissive, emissiveIntensity: o.ei === undefined ? 0.7 : o.ei } : undefined));
    if (o.s !== undefined) { if (typeof o.s === 'number') m.scale.set(o.s, o.s, o.s); else m.scale.set(o.s[0], o.s[1], o.s[2]); }
    if (o.p) m.position.set(o.p[0], o.p[1], o.p[2]);
    if (o.r) m.rotation.set(o.r[0], o.r[1], o.r[2]);
    m.castShadow = ctx.shadows && !o.noShadow;
    m.receiveShadow = ctx.shadows;
    const olf = o.ol === undefined ? 1 : o.ol;
    if (ctx.outline && olf > 0) {
      const sx = Math.abs(m.scale.x), sy = Math.abs(m.scale.y), sz = Math.abs(m.scale.z);
      const avg = (sx + sy + sz) / 3;
      if (!(ctx.low && avg < 0.14)) {
        const ta = Math.min(0.06, Math.max(0.015, 0.055 * avg + 0.012)) * olf;
        const out = new THREE.Mesh(g, inkMat());
        out.scale.set(1 + ta / sx, 1 + ta / sy, 1 + ta / sz);
        out.name = 'outline';
        m.add(out);
      }
    }
    return m;
  }
  const grp = (p, r) => { const g = new THREE.Group(); if (p) g.position.set(p[0], p[1], p[2]); if (r) g.rotation.set(r[0], r[1], r[2]); return g; };
  const sph = (hex, p, s, o) => M(geo.sph(), hex, Object.assign({ p: p, s: s }, o));
  const cone = (hex, p, s, r, o) => M(geo.cone(), hex, Object.assign({ p: p, s: s, r: r }, o));
  const box = (hex, p, s, r, o) => M(geo.box(), hex, Object.assign({ p: p, s: s, r: r }, o));
  const cyl = (hex, p, s, r, t, o) => M(geo.cyl(t), hex, Object.assign({ p: p, s: s, r: r }, o));

  // Chain of tapered segments, each nested in the previous one: curl = rotation.x per link (+ = towards local +Z).
  // Returns { root, links, tip } ; tip is a Group at the end for attachments.
  function chain(parent, hex, o) {
    const n = o.n || 4, len = o.len || 1, r0 = o.r0 || 0.15, r1 = o.r1 === undefined ? r0 * 0.3 : o.r1;
    const h = len / n; let cur = parent; const links = [];
    for (let i = 0; i < n; i++) {
      const a = r0 + (r1 - r0) * (i / n), b = r0 + (r1 - r0) * ((i + 1) / n);
      const link = grp(i === 0 ? [0, 0, 0] : [0, h, 0], i === 0 ? [o.curl0 || 0, 0, 0] : [o.curl || 0, o.twist || 0, 0]);
      cur.add(link); links.push(link);
      const seg = M(geo.cyl(Math.max(0.05, b / a)), o.colors ? o.colors[i % o.colors.length] : hex, { p: [0, h / 2, 0], s: [a, h * 1.04, a], ol: o.ol });
      link.add(seg);
      cur = link;
    }
    const tip = grp([0, h, 0]); cur.add(tip);
    return { root: links[0], links: links, tip: tip };
  }


  // ------------------------------------------------------------------ cell-part helpers: lathe shapes, static tapered tubes, CPU-animated tube bundles
  const mixHex = (a, b, t) => {
    const ar = a >> 16 & 255, ag = a >> 8 & 255, ab = a & 255, br = b >> 16 & 255, bg = b >> 8 & 255, bb = b & 255;
    return ((ar + (br - ar) * t) << 16) | ((ag + (bg - ag) * t) << 8) | (ab + (bb - ab) * t);
  };
  // Lathe of [r, y] points around local Y (cached by key).
  function lathe(key, pts, seg) {
    return cached('lathe' + key + (ctx.low ? 'L' : ''), () => new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(p[0], p[1])), ctx.low ? Math.max(5, seg - 3) : seg));
  }
  // Static tapered tube along polyline pts ([x,y,z]...), radii per point, round tip. Cached by key.
  function tubeStatic(key, pts, radii, radial) {
    return cached('tube' + key + (ctx.low ? 'L' : ''), () => {
      const rad = ctx.low ? Math.max(5, radial - 2) : radial, n = pts.length, pos = [], idx = [];
      const T = new THREE.Vector3(), S = new THREE.Vector3(), B = new THREE.Vector3(), ref = new THREE.Vector3(1, 0, 0), a = new THREE.Vector3(), b = new THREE.Vector3();
      for (let i = 0; i < n; i++) {
        a.set.apply(a, pts[Math.max(0, i - 1)]); b.set.apply(b, pts[Math.min(n - 1, i + 1)]);
        T.subVectors(b, a).normalize();
        if (Math.abs(T.dot(ref)) > 0.92) ref.set(0, 0, 1);
        S.crossVectors(T, ref).normalize(); B.crossVectors(T, S).normalize();
        for (let k = 0; k < rad; k++) { const th = k / rad * Math.PI * 2, c = Math.cos(th) * radii[i], sn = Math.sin(th) * radii[i]; pos.push(pts[i][0] + S.x * c + B.x * sn, pts[i][1] + S.y * c + B.y * sn, pts[i][2] + S.z * c + B.z * sn); }
        ref.set(1, 0, 0);
      }
      // round tip pole
      a.set.apply(a, pts[n - 1]); b.set.apply(b, pts[n - 2]); T.subVectors(a, b).normalize();
      pos.push(a.x + T.x * radii[n - 1] * 0.9, a.y + T.y * radii[n - 1] * 0.9, a.z + T.z * radii[n - 1] * 0.9);
      for (let i = 0; i < n - 1; i++) for (let k = 0; k < rad; k++) { const q = i * rad + k, q1 = i * rad + (k + 1) % rad, r = (i + 1) * rad + k, r1 = (i + 1) * rad + (k + 1) % rad; idx.push(q, q1, r, q1, r1, r); }
      for (let k = 0; k < rad; k++) idx.push((n - 1) * rad + k, (n - 1) * rad + (k + 1) % rad, n * rad);
      // base cap
      pos.push(pts[0][0], pts[0][1], pts[0][2]);
      const bp = n * rad + 1;
      for (let k = 0; k < rad; k++) idx.push(k, bp, (k + 1) % rad);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
      return g;
    });
  }
  // CPU-animated bundle of tapered tubes (flagella, cilia, proboscis, lure stalk): ONE mesh + ONE ink-outline mesh for the whole bundle.
  // tube = { b:[x,y,z] base, d:[x,y,z] unit direction, lat:[x,y,z] unit lateral axis, len, r0, r1, ph, bulb? (radius gain at the tip) }
  function dynTubes(g, hex, tubes, o) {
    o = o || {};
    const segs = o.segs || (ctx.low ? 5 : 8), rad = o.radial || (ctx.low ? 5 : 6), ol = o.ol === undefined ? 0.022 : o.ol;
    const nT = tubes.length, ringN = segs + 1, vPer = ringN * rad + 1, nV = nT * vPer;
    const pos = new Float32Array(nV * 3), nor = new Float32Array(nV * 3), col = new Float32Array(nV * 3), opos = new Float32Array(nV * 3);
    const idx = [];
    const c0 = new THREE.Color(hex), c1 = new THREE.Color(o.tipHex === undefined ? mixHex(hex, 0xffffff, 0.45) : o.tipHex);
    const tmpC = new THREE.Color();
    for (let t = 0; t < nT; t++) {
      const base = t * vPer;
      for (let i = 0; i < ringN; i++) {
        tmpC.copy(c0).lerp(c1, Math.pow(i / segs, 1.6));
        for (let k = 0; k < rad; k++) { const v = base + i * rad + k; col[v * 3] = tmpC.r; col[v * 3 + 1] = tmpC.g; col[v * 3 + 2] = tmpC.b; }
      }
      const pv = base + ringN * rad; col[pv * 3] = c1.r; col[pv * 3 + 1] = c1.g; col[pv * 3 + 2] = c1.b;
      for (let i = 0; i < segs; i++) for (let k = 0; k < rad; k++) {
        const q = base + i * rad + k, q1 = base + i * rad + (k + 1) % rad, r = base + (i + 1) * rad + k, r1 = base + (i + 1) * rad + (k + 1) % rad;
        idx.push(q, q1, r, q1, r1, r);
      }
      for (let k = 0; k < rad; k++) idx.push(base + segs * rad + k, base + segs * rad + (k + 1) % rad, pv);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(idx); geo.userData.own = true;
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 12);
    const mesh = new THREE.Mesh(geo, toonMat(0xffffff, { vertexColors: true }));
    mesh.frustumCulled = false; mesh.castShadow = false; mesh.userData.dyn = true; mesh.name = 'dyn';
    g.add(mesh);
    let omesh = null, ogeo = null;
    if (ctx.outline && ol > 0) {
      ogeo = new THREE.BufferGeometry();
      ogeo.setAttribute('position', new THREE.BufferAttribute(opos, 3).setUsage(THREE.DynamicDrawUsage));
      ogeo.setIndex(idx); ogeo.userData.own = true; ogeo.boundingSphere = geo.boundingSphere;
      omesh = new THREE.Mesh(ogeo, inkMat()); omesh.frustumCulled = false; omesh.userData.dyn = true; omesh.name = 'dynOutline';
      g.add(omesh);
    }
    const P = new Array(ringN), Sd = new THREE.Vector3(), Bn = new THREE.Vector3(), Tn = new THREE.Vector3(), ref = new THREE.Vector3(), nrm = new THREE.Vector3();
    for (let i = 0; i < ringN; i++) P[i] = new THREE.Vector3();
    const tip = new THREE.Vector3();
    const api = {
      mesh: mesh, outline: omesh, tip: tip, tipObj: null,
      // wave: lateral displacement fraction of length at the tip; spd rad/s; k waves along the tube
      update(T, amp, spd, ph) {
        for (let t = 0; t < nT; t++) {
          const tb = tubes[t], h = tb.len / segs, wv = (tb.wave || 1.3) * Math.PI * 2;
          const px = tb.ph + (ph || 0);
          let x = tb.b[0], y = tb.b[1], z = tb.b[2], prevOff = 0;
          P[0].set(x, y, z);
          for (let i = 1; i < ringN; i++) {
            const s = i / segs, env = 0.15 + 0.85 * s * s * (3 - 2 * s) * (0.5 + 0.5 * s);
            const off = amp * tb.len * env * Math.sin(wv * s - T * spd + px);
            const dl = off - prevOff; prevOff = off;
            const along = Math.sqrt(Math.max(0.0001, h * h - dl * dl));
            x += tb.d[0] * along + tb.lat[0] * dl; y += tb.d[1] * along + tb.lat[1] * dl; z += tb.d[2] * along + tb.lat[2] * dl;
            P[i].set(x, y, z);
          }
          const base = t * vPer;
          for (let i = 0; i < ringN; i++) {
            const a = P[Math.max(0, i - 1)], b = P[Math.min(ringN - 1, i + 1)];
            Tn.subVectors(b, a).normalize();
            ref.set(tb.lat[0], tb.lat[1], tb.lat[2]);
            Sd.crossVectors(Tn, ref); if (Sd.lengthSq() < 1e-4) Sd.set(1, 0, 0);
            Sd.normalize(); Bn.crossVectors(Tn, Sd).normalize();
            const sI = i / segs;
            let r = tb.r0 + (tb.r1 - tb.r0) * sI;
            if (tb.bulb) r += tb.bulb * Math.exp(-Math.pow((sI - 0.95) * 5, 2));
            for (let k = 0; k < rad; k++) {
              const th = k / rad * Math.PI * 2, cs = Math.cos(th), sn = Math.sin(th), v = (base + i * rad + k) * 3;
              nrm.set(Sd.x * cs + Bn.x * sn, Sd.y * cs + Bn.y * sn, Sd.z * cs + Bn.z * sn);
              pos[v] = P[i].x + nrm.x * r; pos[v + 1] = P[i].y + nrm.y * r; pos[v + 2] = P[i].z + nrm.z * r;
              nor[v] = nrm.x; nor[v + 1] = nrm.y; nor[v + 2] = nrm.z;
              if (omesh) { opos[v] = P[i].x + nrm.x * (r + ol); opos[v + 1] = P[i].y + nrm.y * (r + ol); opos[v + 2] = P[i].z + nrm.z * (r + ol); }
            }
          }
          const L = P[ringN - 1], pv = (base + ringN * rad) * 3, rr = tb.r1 + (tb.bulb ? tb.bulb * 0.6 : 0);
          Tn.subVectors(L, P[ringN - 2]).normalize();
          pos[pv] = L.x + Tn.x * rr * 0.9; pos[pv + 1] = L.y + Tn.y * rr * 0.9; pos[pv + 2] = L.z + Tn.z * rr * 0.9;
          nor[pv] = Tn.x; nor[pv + 1] = Tn.y; nor[pv + 2] = Tn.z;
          if (omesh) { opos[pv] = L.x + Tn.x * (rr + ol) * 1.0 + Tn.x * ol; opos[pv + 1] = L.y + Tn.y * (rr + ol) + Tn.y * ol; opos[pv + 2] = L.z + Tn.z * (rr + ol) + Tn.z * ol; }
          if (t === 0) tip.copy(L);
        }
        geo.attributes.position.needsUpdate = true; geo.attributes.normal.needsUpdate = true;
        if (ogeo) ogeo.attributes.position.needsUpdate = true;
        if (api.tipObj) api.tipObj.position.copy(tip);
      }
    };
    api.update(0, 0.05, 1, 0);
    g.userData.dyn = api;
    return api;
  }

  // ------------------------------------------------------------------ shared sub-builders
  // Jaw-mouth: upper jaw + hinged lower jaw (jaw.rotation.x = -open) + wine interior + teeth.
  function teethSpots(w, l, n) {
    const a = [];
    for (let i = 0; i < n; i++) { const x = (i / (n - 1) - 0.5) * 0.7 * w; a.push([x, l * 0.9]); }
    a.push([-w * 0.4, l * 0.55], [w * 0.4, l * 0.55]);
    return a;
  }
  function jawMouth(g, c, o) {
    const w = o.w || 0.6, l = o.l || 0.55, h = o.h || 0.22, lip = o.lip === undefined ? c.m : o.lip;
    g.add(sph(lip, [0, l * 0.5, h * 0.52], [w * 0.5, l * 0.52, h * 0.6]));
    const jaw = grp([0, 0.02, -h * 0.05]); jaw.name = 'jaw'; g.add(jaw);
    jaw.add(sph(o.lower === undefined ? lip : o.lower, [0, l * 0.5 - 0.02, -h * 0.45 + h * 0.05], [w * 0.47 * (o.lowerW || 1), l * 0.5 * (o.lowerL || 1), h * 0.55]));
    g.add(sph(o.inner || K.wine, [0, l * 0.5, 0], [w * 0.42, l * 0.42, h * 0.3], { ol: 0.4 }));
    const t = o.teeth || 'flat', tc = o.toothColor || K.bone;
    const nT = o.nTeeth || 4;
    if (t !== 'none') {
      if (t === 'buck') {
        [-1, 1].forEach((sx) => g.add(box(tc, [sx * w * 0.1, l * 0.94, h * 0.0], [w * 0.14, h * 0.12, h * 0.55], null, { ol: 1.4 })));
      } else {
        teethSpots(w, l, nT).forEach((sp, i) => {
          const big = (t === 'fang' || t === 'saw') && (i === 0 || i === nT - 1);
          const ts = t === 'molar' ? [w * 0.11, w * 0.11, h * 0.2] : (t === 'flat' ? [w * 0.11, h * 0.2, h * 0.22] : (t === 'saw' ? [w * 0.07, h * 0.28, w * 0.07] : [w * 0.065, big ? h * 0.7 : h * 0.34, w * 0.065]));
          const up = (t === 'flat' || t === 'molar') ? box(tc, [sp[0], sp[1], h * 0.02], [ts[0], ts[2], ts[1]], null, { ol: 1.4 }) : cone(tc, [sp[0], sp[1], h * 0.08 - (big ? h * 0.12 : 0)], ts, [-Math.PI / 2, 0, 0], { ol: 1.5 });
          g.add(up);
          if (t !== 'buck' && (i % 2 === 0 || t === 'saw')) {
            const lo = (t === 'flat' || t === 'molar') ? box(tc, [sp[0], sp[1] - 0.02, -h * 0.02], [ts[0], ts[2], ts[1]], null, { ol: 1.4 }) : cone(tc, [sp[0], sp[1] - 0.02, -h * 0.08 + (big ? h * 0.1 : 0)], ts, [Math.PI / 2, 0, 0], { ol: 1.5 });
            jaw.add(lo);
          }
        });
      }
    }
    jaw.userData.max = o.max || 0.75;
    g.userData.jaw = jaw;
    g.userData.mouthLen = l;
    return jaw;
  }
  function beakMouth(g, c, o) {
    const w = o.w || 0.5, l = o.l || 0.7, h = o.h || 0.28, col = o.color || K.beak;
    const up = cone(col, [0, l * 0.45, h * 0.28], [w * 0.5, l, h * 0.55], [Math.PI / 2 * 0 , 0, 0]);
    up.rotation.set(0, 0, 0); up.scale.set(w * 0.5, l, h * 0.5);
    g.add(up);
    const jaw = grp([0, 0.02, -h * 0.02]); jaw.name = 'jaw'; g.add(jaw);
    jaw.add(cone(o.lowerColor || col, [0, l * 0.36, -h * 0.2], [w * 0.4, l * 0.72, h * 0.34]));
    g.add(sph(K.wine, [0, l * 0.3, 0], [w * 0.3, l * 0.3, h * 0.2], { ol: 0.3 }));
    jaw.userData.max = o.max || 0.6;
    g.userData.jaw = jaw;
  }

  // Cartoon eye (also used for tracking). Returns {ball, holder, lid, R}.
  function eyeBuild(g, c, o) {
    const R = o.r || 0.2, cy = o.cy === undefined ? R * 0.5 : o.cy;
    if (o.stalk) {
      const st = chain(g, o.stalkColor || c.m, { n: 3, len: o.stalk, r0: R * 0.42, r1: R * 0.32, curl: 0.12 });
      st.root.userData.anim = { type: 'sway', axis: 'x', amp: 0.08, speed: 2.1, phase: Math.random() * 6, react: {} };
      g.userData.stalk = st.root;
      var holderParent = st.tip;
    }
    const ball = grp([0, o.stalk ? R * 0.7 : cy, 0]);
    (o.stalk ? holderParent : g).add(ball);
    if (!o.stalk) {
      // socket collar blends the eyeball into the skin
      g.add(sph(c.m, [0, cy * 0.4, 0], [R * 1.06, R * 0.8, R * 1.06], { ol: 0.6 }));
    }
    const white = o.compound ? M(geo.dod(), o.white || 0xfb923c, { s: R }) : sph(o.white === undefined ? K.w : o.white, [0, 0, 0], R, o.emissive ? { emissive: o.emissive } : undefined);
    ball.add(white);
    const holder = grp([0, 0, 0]); ball.add(holder);
    const irisC = o.iris === undefined ? 0x0ea5e9 : o.iris;
    if (!o.bead && !o.compound) {
      holder.add(sph(irisC, [0, R * 0.8, 0], [R * (o.irisR || 0.58), R * 0.3, R * (o.irisR || 0.58)], { ol: 0.5, emissive: o.irisGlow ? irisC : undefined }));
      holder.add(sph(K.ink, [0, R * 0.95, 0], o.slit ? [R * 0.12, R * 0.15, R * 0.42] : [R * 0.3, R * 0.14, R * 0.3], { ol: 0.2 }));
      holder.add(sph(K.w, [R * 0.16, R * 1.03, R * 0.14], [R * 0.1, R * 0.06, R * 0.1], { ol: 0, noShadow: true }));
    } else if (o.bead) {
      holder.add(sph(K.w, [R * 0.3, R * 0.93, R * 0.3], [R * 0.3, R * 0.14, R * 0.26], { ol: 0, noShadow: true }));
      holder.add(sph(K.w, [-R * 0.34, R * 0.88, -R * 0.2], [R * 0.12, R * 0.07, R * 0.12], { ol: 0, noShadow: true }));
    } else {
      holder.add(sph(K.ink, [0, R * 0.95, 0], [R * 0.3, R * 0.14, R * 0.3], { ol: 0.2 }));
    }
    let lid = null;
    if (!o.stalk && !o.noLid) {
      lid = M(geo.hemi(), o.lidColor === undefined ? c.b : o.lidColor, { s: R * 1.12, ol: 0.7 });
      lid.position.y = 0; lid.rotation.x = Math.PI; ball.add(lid);
    }
    g.userData.eye = { ball: ball, holder: holder, lid: lid, R: R, googly: !!o.googly, lidBase: o.lidBase || 0, rest: new THREE.Vector3(0, 1, 0) };
    if (o.brow) {
      g.add(box(o.browColor === undefined ? c.d : o.browColor, [0, cy + R * 0.9, R * 0.7], [R * 1.5, R * 0.28, R * 0.34], [o.brow, 0, 0]));
    }
    return ball;
  }

  // Generic wing: hinge group rotated about local Z (animated by 'flap').
  function wing(g, c, o) {
    const sp = o.span || 1.1, ch = o.chord || 0.6;
    const hinge = grp([0, 0, 0], [0, 0, 0]); g.add(hinge);
    const fold = o.fold === undefined ? 0.9 : o.fold;
    hinge.rotation.z = fold;
    // arm bone + membrane fan
    hinge.add(cyl(c.m, [sp * 0.5, 0, 0], [0.06, sp, 0.06], [0, 0, Math.PI / 2], 0.7));
    const n = o.fingers || 3;
    for (let i = 0; i < n; i++) {
      const t = (i + 1) / n;
      hinge.add(cone(o.color || c.a, [sp * (0.25 + 0.7 * t) - sp * 0.15, 0, -ch * 0.5 * (1 - 0.2 * t)], [0.1 + 0.02 * i, ch * (1.2 - 0.5 * t), 0.05], [Math.PI / 2, 0, -0.12], { ol: 0.8 }));
    }
    if (o.feather) {
      for (let i = 0; i < n + 1; i++) hinge.add(sph(o.color || c.a, [sp * (0.15 + 0.8 * i / n), 0, -ch * 0.35], [sp * 0.2, 0.04, ch * 0.5], null));
    }
    hinge.add(sph(o.color || c.a, [sp * 0.5, 0, -ch * 0.3], [sp * 0.5, 0.035, ch * 0.4], { ol: 0.8 }));
    hinge.userData.anim = { type: 'flap', axis: 'z', fold: fold, spread: o.spread === undefined ? -0.1 : o.spread, amp: o.amp || 0.7, speed: o.speed || 11 };
    return hinge;
  }

  // ------------------------------------------------------------------ catalog registry
  const list = [];
  const byId = {};
  const TIER_COST = [0, 25, 75, 150, 250];

  function add(id, name, kind, category, slot, tier, o, fn) {
    o = o || {};
    const def = {
      id: id, name: name, kind: kind, category: category, slot: slot, tier: tier,
      cost: o.cost !== undefined ? o.cost : (category === 'eyes' ? 10 : TIER_COST[tier]),
      complexity: o.cx || 1, mass: o.mass !== undefined ? o.mass : 0.2,
      abilities: o.ab || {}, unlockedByDefault: !!o.u, icon: o.icon || '', col: o.col || 'base'
    };
    if (o.diet) def.diet = o.diet;
    if (o.bonus) def.outfitBonus = Object.assign({ social: 0, attack: 0, health: 0, gather: 0 }, o.bonus);
    if (o.limb) def.limb = o.limb;
    if (o.fin) def.fin = o.fin;
    if (o.dens !== undefined) def.dens = o.dens;                   // material density vs water (1.0); see model.js partDens / DESIGN 3.6
    if (o.lung) def.lung = o.lung;                                 // + seconds of breath
    if (o.gill) def.gill = o.gill;                                 // fraction of the breath drain removed (0..1)
    if (o.snorkel) def.snorkel = o.snorkel;                        // breathing tube length above the head (units)
    if (o.refill) def.refill = o.refill;                           // breath refill speed multiplier
    if (o.cell) def.cell = o.cell;
    if (o.ankle !== undefined) def.ankle = o.ankle;
    if (o.desc) def.desc = o.desc;
    def.build = function (design, part, colors) {
      part = part || {};
      colors = colors || (design && design.colors) || DEF_COLORS;
      const role = part.color || def.col;
      const rm = colors[role];
      const c = { m: rm === undefined || typeof rm === 'string' ? colors.base : rm, b: colors.base, a: colors.accent, d: colors.detail };
      for (const k in K) c[k] = K[k];
      const g = new THREE.Group(); g.name = id;
      fn(g, c, { part: part, design: design, def: def });
      g.userData.partId = id;
      return g;
    };
    list.push(def); byId[id] = def;
    return def;
  }

  const C = 'creature', CE = 'cell', OU = 'outfit';

  // ================================================================== CREATURE: MOUTHS
  add('mouth_nibble_1', 'Nibbler', C, 'mouth', 'mouth', 1, { u: 1, diet: 'herbivore', mass: 0.12, col: 'accent', icon: '🥕', ab: {} },
    (g, c) => jawMouth(g, c, { w: 0.5, l: 0.4, h: 0.22, teeth: 'buck', lip: c.m }));
  add('mouth_chomp_1', 'Chomper', C, 'mouth', 'mouth', 1, { u: 1, diet: 'omnivore', mass: 0.25, icon: '😁', ab: { bite: 1 } },
    (g, c) => jawMouth(g, c, { w: 0.68, l: 0.5, h: 0.26, teeth: 'flat', nTeeth: 4 }));
  add('mouth_snap_1', 'Snapper Jaw', C, 'mouth', 'mouth', 1, { u: 1, diet: 'carnivore', mass: 0.3, icon: '🦷', ab: { bite: 2 } },
    (g, c) => jawMouth(g, c, { w: 0.62, l: 0.62, h: 0.26, teeth: 'fang', nTeeth: 4, lip: c.m }));
  add('mouth_grind_2', 'Grinder', C, 'mouth', 'mouth', 2, { diet: 'herbivore', mass: 0.4, icon: '🐄', ab: { health: 1 } },
    (g, c) => jawMouth(g, c, { w: 0.85, l: 0.5, h: 0.3, teeth: 'molar', nTeeth: 4, max: 0.5 }));
  add('mouth_fang_2', 'Fanged Maw', C, 'mouth', 'mouth', 2, { diet: 'carnivore', mass: 0.45, icon: '🐺', ab: { bite: 3 } },
    (g, c) => jawMouth(g, c, { w: 0.78, l: 0.78, h: 0.32, teeth: 'fang', nTeeth: 5, toothColor: K.bone }));
  add('mouth_beak_2', 'Chirp Beak', C, 'mouth', 'mouth', 2, { diet: 'omnivore', mass: 0.15, icon: '🐦', ab: { bite: 1, sing: 1 }, col: 'accent' },
    (g, c) => beakMouth(g, c, { w: 0.5, l: 0.65, h: 0.3 }));
  add('mouth_song_2', 'Songbird Bill', C, 'mouth', 'mouth', 2, { diet: 'herbivore', mass: 0.12, icon: '🎤', ab: { sing: 2 } },
    (g, c) => { beakMouth(g, c, { w: 0.4, l: 0.5, h: 0.3, color: 0xfacc15, lowerColor: 0xf59e0b, max: 0.9 }); g.userData.jaw.userData.sing = true; });
  add('mouth_sip_2', 'Sipper Trunk', C, 'mouth', 'mouth', 2, { diet: 'herbivore', mass: 0.25, icon: '🐘', ab: { charm: 1 } },
    (g, c) => {
      const ch = chain(g, c.m, { n: 4, len: 0.9, r0: 0.17, r1: 0.1, curl: -0.28, curl0: 0.35 });
      ch.root.userData.anim = { type: 'chain', axis: 'x', amp: 0.12, speed: 2.4, wave: 0.7, phase: 0, links: ch.links, react: { eat: 3, sing: 1.5 } };
      ch.tip.add(M(geo.tor(0.3), c.wine, { s: 0.11, r: [Math.PI / 2, 0, 0], p: [0, 0.03, 0] }));
      g.userData.trunk = ch.root;
    });
  add('mouth_gator_3', 'Gator Maw', C, 'mouth', 'mouth', 3, { diet: 'carnivore', mass: 0.7, icon: '🐊', ab: { bite: 4 }, cx: 2 },
    (g, c) => jawMouth(g, c, { w: 0.82, l: 1.15, h: 0.3, teeth: 'saw', nTeeth: 6, max: 0.9 }));
  add('mouth_hoover_3', 'Hoover Snout', C, 'mouth', 'mouth', 3, { diet: 'herbivore', mass: 0.35, icon: '🌀', ab: { health: 1, charm: 1 }, cx: 2 },
    (g, c) => {
      g.add(cyl(c.m, [0, 0.25, 0], [0.26, 0.5, 0.26], null, 1.5));
      g.add(M(geo.tor(0.3), c.wine, { s: 0.3, p: [0, 0.52, 0], r: [Math.PI / 2, 0, 0] }));
      g.add(sph(K.wine, [0, 0.5, 0], [0.22, 0.08, 0.22], { ol: 0.2 }));
      g.userData.anim = { type: 'pulse', amp: 0.05, speed: 4, react: { eat: 3 } };
    });
  add('mouth_tusk_3', 'Tusker', C, 'mouth', 'mouth', 3, { diet: 'omnivore', mass: 0.6, icon: '🐗', ab: { bite: 2, charge: 1 }, cx: 2 },
    (g, c) => {
      jawMouth(g, c, { w: 0.8, l: 0.55, h: 0.3, teeth: 'flat', nTeeth: 4 });
      [-1, 1].forEach((s) => { const t = chain(g, K.bone, { n: 3, len: 0.6, r0: 0.07, r1: 0.02, curl: 0.5, curl0: 0 }); t.root.position.set(s * 0.3, 0.3, -0.12); t.root.rotation.set(0.5, 0, s * -0.2); });
    });
  add('mouth_kiss_3', 'Rainbow Lips', C, 'mouth', 'mouth', 3, { diet: 'omnivore', mass: 0.2, icon: '💋', ab: { charm: 2, sing: 1 }, cx: 2 },
    (g, c) => jawMouth(g, c, { w: 0.66, l: 0.42, h: 0.26, teeth: 'none', lip: K.pink, lower: K.pink, max: 0.8 }));
  add('mouth_shred_4', 'Shredder Maw', C, 'mouth', 'mouth', 4, { diet: 'carnivore', mass: 1.0, icon: '☠', ab: { bite: 5 }, cx: 3 },
    (g, c) => jawMouth(g, c, { w: 1.0, l: 0.9, h: 0.4, teeth: 'saw', nTeeth: 7, lip: c.m, inner: 0x5b0b25, max: 0.95 }));

  // ================================================================== CREATURE: EYES
  add('eye_bead_1', 'Bead Eye', C, 'eyes', 'eye', 1, { u: 1, mass: 0.02, icon: '⚫', col: 'detail' },
    (g, c) => eyeBuild(g, c, { r: 0.12, bead: true, white: K.ink, noLid: true }));
  add('eye_round_1', 'Round Eye', C, 'eyes', 'eye', 1, { u: 1, mass: 0.02, icon: '👀' },
    (g, c) => eyeBuild(g, c, { r: 0.2, iris: 0x0ea5e9 }));
  add('eye_googly_1', 'Googly Eye', C, 'eyes', 'eye', 1, { mass: 0.03, icon: '🤪', ab: { charm: 1 } },
    (g, c) => eyeBuild(g, c, { r: 0.27, bead: true, googly: true, noLid: false }));
  add('eye_stalk_2', 'Stalk Eye', C, 'eyes', 'eye', 2, { mass: 0.05, icon: '🦐' },
    (g, c) => eyeBuild(g, c, { r: 0.2, stalk: 0.55, iris: 0x22c55e }));
  add('eye_slit_2', 'Slit Eye', C, 'eyes', 'eye', 2, { mass: 0.02, icon: '🐍', ab: { sneak: 1 } },
    (g, c) => eyeBuild(g, c, { r: 0.19, white: 0xfde047, iris: 0xf97316, slit: true, irisR: 0.5 }));
  add('eye_angry_2', 'Fierce Eye', C, 'eyes', 'eye', 2, { mass: 0.03, icon: '😠', ab: { bite: 0 } },
    (g, c) => eyeBuild(g, c, { r: 0.2, iris: 0xdc2626, brow: -0.5 }));
  add('eye_sleepy_2', 'Sleepy Eye', C, 'eyes', 'eye', 2, { mass: 0.02, icon: '😴', ab: { charm: 1 } },
    (g, c) => eyeBuild(g, c, { r: 0.22, iris: 0xa855f7, lidBase: 0.45 }));
  add('eye_compound_3', 'Compound Eye', C, 'eyes', 'eye', 3, { mass: 0.06, icon: '🪰', ab: { sneak: 1 } },
    (g, c) => eyeBuild(g, c, { r: 0.28, compound: true, noLid: true }));
  add('eye_cyclops_3', 'Cyclops Eye', C, 'eyes', 'eye', 3, { mass: 0.08, icon: '👁', ab: { charm: 1 } },
    (g, c) => { eyeBuild(g, c, { r: 0.42, iris: 0xa855f7 }); g.add(M(geo.tor(0.22), K.claw, { s: 0.42, p: [0, 0.18, 0], r: [Math.PI / 2, 0, 0] })); });
  add('eye_glow_4', 'Glow Eye', C, 'eyes', 'eye', 4, { mass: 0.05, icon: '✨', ab: { charm: 2 } },
    (g, c) => eyeBuild(g, c, { r: 0.24, white: 0xfef08a, emissive: 0xfacc15, iris: 0xf43f5e, irisGlow: true }));

  // ================================================================== CREATURE: LEGS (limb params drive mesh.js / anim.js)
  const legFoot = (hex, r) => (g) => g.add(sph(hex, [0, r * 0.45, 0], [r, r * 0.5, r * 1.25]));
  const defLeg = (id, name, tier, o, limb, fn) => add(id, name, C, 'legs', 'leg', tier, Object.assign({ mass: 0.15, limb: limb, ankle: 0.1 }, o), fn || ((g, c) => { g.add(sph(c.a, [0, 0.08, 0.04], [0.2, 0.1, 0.28])); g.userData.ankle = 0.1; }));
  defLeg('leg_stub_1', 'Stubby Leg', 1, { u: 1, icon: '🦵', ab: { speed: 1 } }, { r0: 0.24, r1: 0.17, joint: 'ball', jr: 1.1, pole: 'fwd', splay: 0.2, rf: 0.9 });
  defLeg('leg_pillar_1', 'Pillar Leg', 1, { u: 1, icon: '🏛', ab: { health: 1 }, mass: 0.22 }, { r0: 0.3, r1: 0.26, joint: 'none', jr: 1, pole: 'fwd', splay: 0.1, rf: 0.96 },
    (g, c) => { g.add(sph(c.a, [0, 0.1, 0.08], [0.3, 0.12, 0.38])); });
  defLeg('leg_lanky_2', 'Lanky Leg', 2, { u: 1, icon: '🦩', ab: { speed: 2 } }, { r0: 0.13, r1: 0.08, joint: 'ball', jr: 1.5, pole: 'fwd', splay: 0.12, rf: 0.93 },
    (g, c) => { g.add(sph(c.a, [0, 0.07, 0.1], [0.12, 0.07, 0.3])); });
  defLeg('leg_spring_2', 'Spring Leg', 2, { icon: '🦘', ab: { jump: 2, speed: 1 } }, { r0: 0.26, r1: 0.1, joint: 'ball', jr: 1.1, pole: 'back', splay: 0.15, rf: 0.8, thigh: 1.2 },
    (g, c) => { g.add(sph(c.a, [0, 0.08, 0.2], [0.17, 0.09, 0.42])); });
  defLeg('leg_bug_2', 'Bug Leg', 2, { icon: '🪲', ab: { speed: 1, sneak: 1 } }, { r0: 0.09, r1: 0.04, joint: 'ball', jr: 1.3, pole: 'up', splay: 0.55, rf: 0.92 },
    (g, c) => { g.add(cone(c.d, [0, 0.07, 0.03], [0.05, 0.16, 0.05], [0.3, 0, 0])); });
  defLeg('leg_digi_3', 'Sprinter Leg', 3, { icon: '🐆', ab: { speed: 3 } }, { r0: 0.2, r1: 0.07, joint: 'ball', jr: 1.2, pole: 'back', splay: 0.1, rf: 0.94, thigh: 1.3 },
    (g, c) => { g.add(sph(c.a, [0, 0.06, 0.12], [0.09, 0.06, 0.26])); });
  defLeg('leg_flipper_2', 'Paddle Leg', 2, { icon: '🐧', ab: { speed: 1 }, fin: 2 }, { r0: 0.2, r1: 0.14, joint: 'ball', jr: 1, pole: 'fwd', splay: 0.2, rf: 0.88 },
    (g, c) => { g.add(sph(c.a, [0, 0.05, 0.22], [0.28, 0.05, 0.3])); });
  defLeg('leg_tentacle_3', 'Tentacle Leg', 3, { icon: '🐙', ab: { sneak: 2, jump: 1 } }, { r0: 0.17, r1: 0.05, joint: 'none', jr: 1, pole: 'up', splay: 0.4, rf: 0.8, thigh: 1.0 },
    (g, c) => { g.add(sph(c.m, [0, 0.07, 0.0], [0.07, 0.07, 0.07])); });
  defLeg('leg_titan_4', 'Titan Leg', 4, { icon: '🦣', ab: { health: 2, speed: 2 }, mass: 0.3, cx: 2 }, { r0: 0.36, r1: 0.28, joint: 'ball', jr: 1.15, pole: 'fwd', splay: 0.08, rf: 0.96 },
    (g, c) => { g.add(sph(c.a, [0, 0.14, 0.06], [0.36, 0.15, 0.42])); [-1, 0, 1].forEach((x) => g.add(cone(K.bone, [x * 0.2, 0.12, 0.38], [0.07, 0.15, 0.07], [Math.PI / 2, 0, 0]))); });
  defLeg('leg_rocket_4', 'Rocket Leg', 4, { icon: '🚀', ab: { speed: 4, jump: 2 }, cx: 2 }, { r0: 0.18, r1: 0.1, joint: 'ball', jr: 1.3, pole: 'back', splay: 0.12, rf: 0.95, thigh: 1.4 },
    (g, c) => { g.add(sph(c.a, [0, 0.07, 0.14], [0.13, 0.07, 0.34])); g.add(M(geo.tor(0.3), K.gold, { s: 0.14, p: [0, 0.28, 0], r: [Math.PI / 2, 0, 0] })); });

  // ================================================================== CREATURE: ARMS and HANDS
  const defArm = (id, name, tier, o, limb) => add(id, name, C, 'arms', 'arm', tier, Object.assign({ mass: 0.1, limb: limb }, o), (g, c) => g.add(sph(c.a, [0, 0, 0.1], [0.12, 0.12, 0.14])));
  defArm('arm_noodle_1', 'Noodle Arm', 1, { u: 1, icon: '🍝', ab: { strike: 1 } }, { r0: 0.1, r1: 0.07, joint: 'ball', jr: 1.2, pole: 'back', splay: 0.4, rf: 0.8 });
  defArm('arm_stout_1', 'Stout Arm', 1, { icon: '💪', ab: { strike: 1, health: 1 } }, { r0: 0.17, r1: 0.12, joint: 'ball', jr: 1.15, pole: 'back', splay: 0.35, rf: 0.78 });
  defArm('arm_long_2', 'Long Arm', 2, { icon: '🦍', ab: { strike: 2 } }, { r0: 0.12, r1: 0.08, joint: 'ball', jr: 1.25, pole: 'back', splay: 0.3, rf: 0.88 });
  defArm('arm_brawn_3', 'Brawn Arm', 3, { icon: '🥊', ab: { strike: 3 }, mass: 0.2, cx: 2 }, { r0: 0.24, r1: 0.16, joint: 'ball', jr: 1.1, pole: 'back', splay: 0.4, rf: 0.8, thigh: 1.2 });
  add('hand_paw_1', 'Paw', C, 'hands', 'hand', 1, { u: 1, mass: 0.05, icon: '🐾', ab: { strike: 1 }, col: 'accent' },
    (g, c) => { g.add(sph(c.m, [0, 0, 0.1], [0.14, 0.12, 0.16])); [-1, 0, 1].forEach((x) => g.add(sph(c.m, [x * 0.08, -0.01, 0.23], [0.045, 0.045, 0.05], { ol: 0.8 }))); });
  add('hand_claw_2', 'Claw Hand', C, 'hands', 'hand', 2, { mass: 0.08, icon: '🦅', ab: { strike: 2 }, col: 'accent' },
    (g, c) => { g.add(sph(c.m, [0, 0, 0.08], [0.12, 0.1, 0.14])); [-1, 0, 1].forEach((x) => g.add(cone(K.claw, [x * 0.07, 0, 0.3], [0.04, 0.24, 0.04], [Math.PI / 2 - 0.2 * x, 0, 0], { ol: 1.5 }))); });
  add('hand_pincer_2', 'Pincer', C, 'hands', 'hand', 2, { mass: 0.15, icon: '🦀', ab: { strike: 2, charm: 0 }, col: 'detail' },
    (g, c) => {
      g.add(sph(c.m, [0, 0, 0.1], [0.14, 0.14, 0.18]));
      const a = grp([0, 0.05, 0.2]), b = grp([0, -0.05, 0.2]); g.add(a, b);
      a.add(cone(c.m, [0, 0, 0.18], [0.1, 0.4, 0.07], [Math.PI / 2, 0, 0])); b.add(cone(c.m, [0, 0, 0.18], [0.1, 0.4, 0.07], [Math.PI / 2, 0, 0]));
      a.userData.anim = { type: 'sway', axis: 'x', amp: 0.18, speed: 3, phase: 0, base: -0.1, react: { strike: 4 } };
      b.userData.anim = { type: 'sway', axis: 'x', amp: -0.18, speed: 3, phase: 0, base: 0.1, react: { strike: 4 } };
    });
  add('hand_grab_2', 'Grabber', C, 'hands', 'hand', 2, { mass: 0.1, icon: '🖐', ab: { strike: 1, charm: 1 }, col: 'accent' },
    (g, c) => { g.add(sph(c.m, [0, 0, 0.1], [0.16, 0.1, 0.17])); for (let i = 0; i < 4; i++) { const f = chain(g, c.m, { n: 2, len: 0.3, r0: 0.04, r1: 0.03, curl: 0.5 }); f.root.position.set(-0.1 + i * 0.066, 0, 0.2); f.root.rotation.set(Math.PI / 2 - 0.1, 0, 0); } });
  add('hand_fist_3', 'Big Fist', C, 'hands', 'hand', 3, { mass: 0.3, icon: '✊', ab: { strike: 3 }, col: 'accent', cx: 2 },
    (g, c) => { g.add(sph(c.m, [0, 0, 0.18], [0.26, 0.24, 0.28])); [-1.5, -0.5, 0.5, 1.5].forEach((x) => g.add(sph(c.m, [x * 0.1, 0.1, 0.36], [0.09, 0.09, 0.08], { ol: 0.8 }))); });

  // ================================================================== CREATURE: FEET (frame: origin = sole on ground; userData ankle height)
  const defFoot = (id, name, tier, o, fn, ankle) => add(id, name, C, 'feet', 'foot', tier, Object.assign({ mass: 0.08, col: 'accent', ankle: ankle }, o), fn);
  defFoot('foot_stub_1', 'Round Foot', 1, { u: 1, icon: '🦶' }, (g, c) => g.add(sph(c.m, [0, 0.1, 0.08], [0.2, 0.11, 0.28])), 0.14);
  defFoot('foot_toes_1', 'Toed Foot', 1, { icon: '🐸', ab: { speed: 1 } }, (g, c) => {
    g.add(sph(c.m, [0, 0.09, -0.02], [0.17, 0.09, 0.2]));
    [-1, 0, 1].forEach((x) => g.add(sph(c.m, [x * 0.13, 0.07, 0.2 - Math.abs(x) * 0.04], [0.07, 0.07, 0.15], { ol: 0.9 })));
  }, 0.14);
  defFoot('foot_claw_2', 'Claw Foot', 2, { icon: '🦖', ab: { speed: 1, strike: 1 } }, (g, c) => {
    g.add(sph(c.m, [0, 0.09, -0.02], [0.15, 0.09, 0.2]));
    [-1, 0, 1].forEach((x) => { g.add(sph(c.m, [x * 0.11, 0.06, 0.18], [0.05, 0.05, 0.14], { ol: 0.9 })); g.add(cone(K.claw, [x * 0.11, 0.06, 0.36], [0.04, 0.14, 0.04], [Math.PI / 2, 0, 0], { ol: 1.5 })); });
  }, 0.13);
  defFoot('foot_hoof_2', 'Hoof', 2, { icon: '🐴', ab: { speed: 2 }, col: 'detail' }, (g, c) => {
    g.add(cyl(c.m, [0, 0.1, 0.02], [0.13, 0.2, 0.13], null, 1.0));
    g.add(box(c.m, [0, 0.05, 0.1], [0.2, 0.1, 0.2]));
  }, 0.2);
  defFoot('foot_web_2', 'Webbed Foot', 2, { icon: '🦆', fin: 2, ab: { speed: 1 } }, (g, c) => {
    g.add(sph(c.d, [0, 0.035, 0.2], [0.3, 0.035, 0.26]));
    g.add(sph(c.m, [0, 0.08, -0.02], [0.13, 0.08, 0.15]));
  }, 0.1);
  defFoot('foot_pad_2', 'Soft Paw', 2, { icon: '🐱', ab: { sneak: 2 } }, (g, c) => {
    g.add(sph(c.m, [0, 0.1, 0.02], [0.19, 0.11, 0.24]));
    [-1, 0, 1].forEach((x) => g.add(sph(c.d, [x * 0.09, 0.02, 0.2], [0.04, 0.03, 0.05], { ol: 0.5 })));
  }, 0.12);
  defFoot('foot_sucker_3', 'Sucker Foot', 3, { icon: '🐙', ab: { jump: 1, sneak: 1 } }, (g, c) => {
    g.add(cyl(c.m, [0, 0.08, 0], [0.22, 0.16, 0.22], null, 0.7));
    g.add(M(geo.tor(0.3), c.d, { s: 0.2, p: [0, 0.02, 0], r: [Math.PI / 2, 0, 0] }));
  }, 0.14);
  defFoot('foot_spike_3', 'Spiked Foot', 3, { icon: '📌', ab: { speed: 1, strike: 1 } }, (g, c) => {
    g.add(sph(c.m, [0, 0.1, 0.04], [0.2, 0.11, 0.26]));
    [-1, 0, 1].forEach((x) => g.add(cone(K.bone, [x * 0.12, 0.2, 0.0], [0.05, 0.18, 0.05])));
  }, 0.14);

  // ================================================================== CREATURE: WEAPONS (horns, spikes, stingers, spitters)
  const hornPair = (g, c, o) => {
    const h = chain(g, o.color || K.bone, { n: o.n || 3, len: o.len || 0.8, r0: o.r || 0.11, r1: 0.015, curl: o.curl === undefined ? 0.35 : o.curl, twist: o.twist || 0 });
    h.root.rotation.set(o.tilt || -0.2, 0, o.splay || 0);
    return h;
  };
  add('horn_nub_1', 'Nub Horn', C, 'weapons', 'surface', 1, { u: 0, mass: 0.15, icon: '🦄', ab: { charge: 1 }, col: 'accent' },
    (g, c) => { g.add(cone(c.m, [0, 0.2, 0], [0.12, 0.4, 0.12])); });
  add('horn_unicorn_2', 'Spear Horn', C, 'weapons', 'surface', 2, { mass: 0.25, icon: '🦄', ab: { charge: 2 }, col: 'accent' },
    (g, c) => { const h = chain(g, c.m, { n: 3, len: 1.1, r0: 0.12, r1: 0.01, curl: 0.12, curl0: -0.35, colors: [c.m, c.a, c.m] }); });
  add('horn_ram_3', 'Ram Horns', C, 'weapons', 'surface', 3, { mass: 0.5, icon: '🐏', ab: { charge: 3 }, col: 'accent', cx: 2 },
    (g, c) => { const h = chain(g, c.m, { n: 5, len: 1.1, r0: 0.17, r1: 0.05, curl: 0.45, curl0: -0.5 }); h.root.rotation.z = 0.7; h.root.rotation.y = 0.3; });
  add('horn_antler_3', 'Antlers', C, 'weapons', 'surface', 3, { mass: 0.4, icon: '🦌', ab: { charge: 2, pose: 1 }, col: 'accent', cx: 2 },
    (g, c) => {
      const m = chain(g, c.m, { n: 3, len: 1.0, r0: 0.07, r1: 0.04, curl: -0.15, curl0: -0.25 });
      m.links.forEach((l, i) => { if (i > 0) { const b = chain(l, c.m, { n: 2, len: 0.4, r0: 0.04, r1: 0.015, curl: 0.2 }); b.root.rotation.z = 0.8; b.root.rotation.x = 0.1; } });
    });
  add('spike_back_2', 'Back Spikes', C, 'weapons', 'surface', 2, { mass: 0.5, icon: '🦔', ab: { health: 1, charge: 1 }, col: 'accent', cx: 2 },
    (g, c) => { for (let i = 0; i < 5; i++) { const x = (i % 2 ? 1 : -1) * 0.18 * (i > 0), z = (i - 2) * 0.22; g.add(cone(c.m, [x, 0.22 - Math.abs(z) * 0.1, z], [0.1, 0.5 - Math.abs(z) * 0.15, 0.1], [-0.2 * (z > 0 ? -1 : 1) * 0, 0, 0])); } });
  add('spike_club_3', 'Spiked Club Tail', C, 'weapons', 'surface', 3, { mass: 0.8, icon: '🔨', ab: { strike: 3 }, col: 'base', cx: 2 },
    (g, c) => {
      const t = chain(g, c.m, { n: 4, len: 1.2, r0: 0.16, r1: 0.1, curl: 0.12, curl0: 0.4 });
      t.root.userData.anim = { type: 'chain', axis: 'x', amp: 0.14, speed: 2.2, wave: 0.6, phase: 0, links: t.links, react: { strike: 3, dance: 2 } };
      t.tip.add(sph(c.a, [0, 0.18, 0], [0.3, 0.28, 0.3]));
      for (let i = 0; i < 6; i++) { const a = i * 1.05; t.tip.add(cone(K.bone, [Math.cos(a) * 0.28, 0.18, Math.sin(a) * 0.28], [0.07, 0.2, 0.07], [Math.sin(a) * 1.4, 0, -Math.cos(a) * 1.4])); }
    });
  add('stinger_3', 'Scorpion Stinger', C, 'weapons', 'surface', 3, { mass: 0.5, icon: '🦂', ab: { strike: 2, spit: 1 }, col: 'base', cx: 2 },
    (g, c) => {
      const t = chain(g, c.m, { n: 5, len: 1.4, r0: 0.13, r1: 0.08, curl: 0.45, curl0: 0.1 });
      t.root.userData.anim = { type: 'chain', axis: 'x', amp: 0.08, speed: 2, wave: 0.5, phase: 0, links: t.links, react: { strike: 4 } };
      t.tip.add(sph(K.rose, [0, 0.1, 0], 0.16)); t.tip.add(cone(K.rose, [0, 0.3, 0], [0.09, 0.3, 0.09]));
    });
  add('spit_sac_2', 'Spitter Cheeks', C, 'weapons', 'surface', 2, { mass: 0.2, icon: '💦', ab: { spit: 2 }, col: 'accent' },
    (g, c) => { g.add(sph(c.m, [0, 0.12, 0], [0.3, 0.25, 0.3])); g.add(cone(c.d, [0, 0.32, 0], [0.07, 0.2, 0.07])); g.userData.anim = { type: 'pulse', amp: 0.08, speed: 2.5, react: { spit: 5 } }; });
  add('spit_acid_4', 'Acid Gland', C, 'weapons', 'surface', 4, { mass: 0.4, icon: '🧪', ab: { spit: 4 }, col: 'accent', cx: 2 },
    (g, c) => { g.add(sph(K.lime, [0, 0.15, 0], [0.34, 0.3, 0.34], { emissive: K.lime, ei: 0.5 })); g.add(cyl(c.d, [0, 0.4, 0], [0.09, 0.3, 0.09], null, 0.7)); g.userData.anim = { type: 'pulse', amp: 0.1, speed: 3, react: { spit: 4 } }; });
  add('claw_blade_4', 'Bone Blade', C, 'weapons', 'surface', 4, { mass: 0.7, icon: '🗡', ab: { strike: 4, bite: 1 }, col: 'accent', cx: 2 },
    (g, c) => { g.add(cone(K.bone, [0, 0.5, 0], [0.16, 1.1, 0.06], [0, 0, 0], { ol: 1.2 })); g.add(sph(c.m, [0, 0.05, 0], [0.2, 0.12, 0.2])); });
  add('plate_ram_4', 'Battering Brow', C, 'weapons', 'surface', 4, { mass: 1.2, icon: '🛡', ab: { charge: 5, health: 1 }, col: 'accent', cx: 3 },
    (g, c) => { g.add(sph(c.m, [0, 0.14, 0.05], [0.55, 0.3, 0.5])); for (let i = -1; i <= 1; i++) g.add(cone(K.bone, [i * 0.28, 0.4, 0.1], [0.1, 0.25, 0.1])); });

  // ================================================================== CREATURE: SOCIAL
  add('crest_frill_2', 'Display Frill', C, 'social', 'surface', 2, { mass: 0.15, icon: '🦎', ab: { pose: 2 }, col: 'accent' },
    (g, c) => {
      const f = grp([0, 0, -0.1]); g.add(f);
      for (let i = 0; i < 5; i++) { const a = (i - 2) * 0.42; const s = cone(i % 2 ? c.a : c.m, [Math.sin(a) * 0.38, Math.cos(a) * 0.38 + 0.05, 0], [0.1, 0.62, 0.06], [0, 0, -a], { ol: 1.1 }); f.add(s); }
      f.userData.anim = { type: 'pulse', amp: 0.03, speed: 2, react: { pose: 8, dance: 4, charm: 3 }, axis: 'y' };
    });
  add('fan_tail_3', 'Peacock Fan', C, 'social', 'surface', 3, { mass: 0.3, icon: '🦚', ab: { pose: 3, charm: 1 }, col: 'accent', cx: 2 },
    (g, c) => {
      const f = grp([0, 0.1, 0], [0.5, 0, 0]); g.add(f);
      for (let i = 0; i < 7; i++) { const a = (i - 3) * 0.3; const fe = grp([0, 0, 0], [0, 0, -a]); f.add(fe); fe.add(sph(i % 2 ? c.m : c.a, [0, 0.65, 0], [0.13, 0.65, 0.05])); fe.add(sph(K.cyan, [0, 1.15, 0.03], [0.09, 0.09, 0.03], { ol: 0.5 })); }
      f.userData.anim = { type: 'pulse', amp: 0.02, speed: 2, react: { pose: 10, dance: 5, charm: 4 }, axis: 'y' };
    });
  add('sac_throat_2', 'Singing Sac', C, 'social', 'surface', 2, { mass: 0.1, icon: '🎈', ab: { sing: 2 }, col: 'accent' },
    (g, c) => { g.add(sph(c.m, [0, 0.14, 0], [0.32, 0.26, 0.32])); g.userData.anim = { type: 'pulse', amp: 0.06, speed: 2, react: { sing: 9 } }; });
  add('ears_big_1', 'Big Ears', C, 'social', 'surface', 1, { mass: 0.1, icon: '🐰', ab: { charm: 1 }, col: 'base' },
    (g, c) => { const e = grp([0, 0, 0], [0, 0, 0.45]); g.add(e); e.add(sph(c.m, [0, 0.4, 0], [0.18, 0.5, 0.07])); e.add(sph(K.pink, [0, 0.38, 0.03], [0.1, 0.34, 0.05], { ol: 0 })); e.userData.anim = { type: 'sway', axis: 'z', amp: 0.1, speed: 3.1, phase: 0, react: { charm: 3 } }; });
  add('whisker_1', 'Whiskers', C, 'social', 'surface', 1, { u: 0, mass: 0.02, icon: '🐈', ab: { charm: 1 }, col: 'detail' },
    (g, c) => { [-1, 1].forEach((s) => [0, 1, 2].forEach((i) => g.add(cyl(c.m, [s * 0.25, 0.04 + i * 0.03, 0], [0.012, 0.5, 0.012], [0, 0, s * (1.2 - i * 0.28)], 1, { ol: 1.2 })))); });
  add('pom_dance_2', 'Dance Pom', C, 'social', 'surface', 2, { mass: 0.1, icon: '🎀', ab: { dance: 2 }, col: 'accent' },
    (g, c) => { const s = chain(g, c.m, { n: 2, len: 0.5, r0: 0.04, r1: 0.04, curl: 0.3 }); s.tip.add(sph(K.pink, [0, 0.12, 0], 0.2)); s.root.userData.anim = { type: 'chain', axis: 'x', amp: 0.2, speed: 4, wave: 1, links: s.links, phase: 0, react: { dance: 3 } }; });
  add('plume_3', 'Feather Plume', C, 'social', 'surface', 3, { mass: 0.1, icon: '🪶', ab: { pose: 1, charm: 2 }, col: 'accent', cx: 2 },
    (g, c) => { const cols = [K.rose, K.gold, K.lime, K.cyan]; for (let i = 0; i < 4; i++) { const f = grp([0, 0, 0], [(i - 1.5) * 0.18, 0, (i - 1.5) * 0.3]); g.add(f); f.add(sph(cols[i], [0, 0.45, 0], [0.09, 0.5, 0.04])); f.userData.anim = { type: 'sway', axis: 'x', amp: 0.1, speed: 2.4, phase: i, react: { dance: 3, charm: 2 } }; } });
  add('lure_bulb_3', 'Glow Lure', C, 'social', 'surface', 3, { mass: 0.15, icon: '💡', ab: { charm: 2, sing: 1 }, col: 'accent', cx: 2 },
    (g, c) => {
      const s = chain(g, c.m, { n: 3, len: 0.8, r0: 0.04, r1: 0.03, curl: 0.4, curl0: -0.3 });
      s.tip.add(sph(0xfef08a, [0, 0.1, 0], 0.17, { emissive: 0xfacc15, ei: 0.9 }));
      s.root.userData.anim = { type: 'chain', axis: 'x', amp: 0.12, speed: 2.5, wave: 0.8, links: s.links, phase: 0, react: { charm: 3 } };
    });
  add('belly_drum_3', 'Drum Belly', C, 'social', 'surface', 3, { mass: 0.3, icon: '🥁', ab: { dance: 2, sing: 1 }, col: 'accent', cx: 2 },
    (g, c) => { g.add(sph(c.m, [0, 0.12, 0], [0.5, 0.3, 0.5])); g.add(M(geo.tor(0.1), K.gold, { s: 0.5, p: [0, 0.2, 0], r: [Math.PI / 2, 0, 0] })); g.userData.anim = { type: 'pulse', amp: 0.05, speed: 6, react: { dance: 6, sing: 3 } }; });
  add('mane_rainbow_4', 'Rainbow Mane', C, 'social', 'surface', 4, { mass: 0.2, icon: '🌈', ab: { pose: 2, charm: 2, dance: 1 }, col: 'accent', cx: 2 },
    (g, c) => { const cols = [K.rose, 0xf97316, K.gold, K.lime, K.cyan, K.purple]; cols.forEach((col, i) => { const m = chain(g, col, { n: 2, len: 0.55, r0: 0.09, r1: 0.04, curl: -0.3, curl0: 0 }); m.root.position.set(0, 0, -0.5 + i * 0.2 + 0.1); m.root.rotation.set(0.3, 0, 0); m.root.userData.anim = { type: 'chain', axis: 'x', amp: 0.2, speed: 3, wave: 0.7, links: m.links, phase: i * 0.5, react: { dance: 3, pose: 2 } }; }); });
  add('bell_horns_2', 'Jingle Antennae', C, 'social', 'surface', 2, { mass: 0.1, icon: '🔔', ab: { sing: 1, dance: 1 }, col: 'detail' },
    (g, c) => { [-1, 1].forEach((s) => { const a = chain(g, c.m, { n: 3, len: 0.7, r0: 0.03, r1: 0.025, curl: 0.2 }); a.root.rotation.set(-0.3, 0, s * 0.35); a.tip.add(sph(K.gold, [0, 0.07, 0], 0.1)); a.root.userData.anim = { type: 'chain', axis: 'x', amp: 0.2, speed: 3.2, wave: 0.8, links: a.links, phase: s, react: { dance: 3, sing: 2 } }; }); });

  // ================================================================== CREATURE: DETAILS (tails, wings, fins, armour, fuzz)
  const tailAnim = (t, amp, sp, react) => { t.root.userData.anim = { type: 'chain', axis: 'y', amp: amp, speed: sp, wave: 0.7, links: t.links, phase: 0, react: react || { dance: 2, walk: 1.5 } }; };
  add('tail_tuft_1', 'Tuft Tail', C, 'detail', 'surface', 1, { u: 1, mass: 0.12, icon: '🐕', col: 'base' },
    (g, c) => { const t = chain(g, c.m, { n: 3, len: 0.8, r0: 0.17, r1: 0.1, curl: 0.18, curl0: 0.35 }); t.tip.add(sph(c.a, [0, 0.1, 0], [0.16, 0.2, 0.16])); tailAnim(t, 0.22, 3); });
  add('tail_whip_2', 'Whip Tail', C, 'detail', 'surface', 2, { mass: 0.15, icon: '🐍', col: 'base', ab: { speed: 1 } },
    (g, c) => { const t = chain(g, c.m, { n: 6, len: 1.8, r0: 0.17, r1: 0.025, curl: 0.12, curl0: 0.25 }); tailAnim(t, 0.2, 3.4); });
  add('tail_fat_1', 'Paddle Tail', C, 'detail', 'surface', 1, { mass: 0.25, icon: '🦫', col: 'base', ab: { health: 1 } },
    (g, c) => { const t = chain(g, c.m, { n: 2, len: 0.6, r0: 0.18, r1: 0.12, curl: 0.2, curl0: 0.3 }); t.tip.add(sph(c.d, [0, 0.2, 0], [0.34, 0.3, 0.07])); tailAnim(t, 0.16, 2.2); });
  add('fin_dorsal_2', 'Dorsal Fin', C, 'detail', 'surface', 2, { mass: 0.1, icon: '🦈', col: 'accent', fin: 2 },
    (g, c) => { g.add(M(geo.cone(), c.m, { p: [0, 0.4, -0.08], s: [0.07, 0.8, 0.5], r: [-0.25, 0, 0] })); g.userData.anim = { type: 'sway', axis: 'z', amp: 0.04, speed: 2, phase: 0, react: {} }; });
  add('fin_tail_2', 'Fish Tail', C, 'detail', 'surface', 2, { mass: 0.2, icon: '🐟', col: 'accent', fin: 3 },
    (g, c) => { const t = chain(g, c.m, { n: 2, len: 0.5, r0: 0.12, r1: 0.08, curl: 0, curl0: 0.15 }); t.tip.add(M(geo.tri(), c.a, { p: [0, 0.3, 0], s: [0.45, 0.06, 0.5], r: [0, Math.PI / 2 + 0, 0] })); tailAnim(t, 0.4, 5); t.root.userData.anim.axis = 'x'; t.root.userData.anim.axis = 'y'; });
  add('wing_flutter_2', 'Flutter Wings', C, 'detail', 'surface', 2, { mass: 0.2, icon: '🦋', col: 'accent', ab: { glide: 2, jump: 1 }, cx: 2 },
    (g, c) => wing(g, c, { span: 0.8, chord: 0.5, fold: 1.0, spread: -0.05, amp: 0.8, speed: 14, fingers: 2 }));
  add('wing_glider_4', 'Glider Wings', C, 'detail', 'surface', 4, { mass: 0.6, icon: '🦇', col: 'accent', ab: { glide: 4, jump: 1 }, cx: 3 },
    (g, c) => wing(g, c, { span: 1.7, chord: 0.9, fold: 1.1, spread: -0.12, amp: 0.55, speed: 8, fingers: 4 }));
  add('wing_feather_3', 'Feather Wings', C, 'detail', 'surface', 3, { mass: 0.35, icon: '🕊', col: 'accent', ab: { glide: 3, jump: 1 }, cx: 2 },
    (g, c) => wing(g, c, { span: 1.3, chord: 0.6, fold: 1.0, spread: -0.1, amp: 0.7, speed: 10, fingers: 3, feather: true, color: c.a }));
  add('shell_dome_2', 'Shell Dome', C, 'detail', 'surface', 2, { mass: 0.9, icon: '🐢', col: 'detail', ab: { health: 2 }, cx: 2 },
    (g, c) => { g.add(M(geo.hemi(), c.m, { s: [0.85, 0.65, 0.95], p: [0, -0.1, 0] })); for (let i = 0; i < 3; i++) g.add(sph(c.a, [(i - 1) * 0.35, 0.5 - Math.abs(i - 1) * 0.1, 0], [0.12, 0.05, 0.12], { ol: 0.4 })); });
  add('plates_armor_3', 'Armor Plates', C, 'detail', 'surface', 3, { mass: 0.7, icon: '🦏', col: 'detail', ab: { health: 2 }, cx: 2 },
    (g, c) => { for (let i = 0; i < 3; i++) g.add(M(geo.dod(), i % 2 ? c.a : c.m, { p: [0, 0.1, (i - 1) * 0.35], s: [0.35, 0.18, 0.2] })); });
  add('bumps_warty_1', 'Warty Bumps', C, 'detail', 'surface', 1, { mass: 0.05, icon: '🐸', col: 'accent', ab: { sneak: 1 } },
    (g, c) => { [[0, 0], [0.2, 0.15], [-0.18, 0.1], [0.05, -0.22], [-0.2, -0.15]].forEach((p, i) => g.add(sph(c.m, [p[0], 0.04, p[1]], [0.09 + (i % 2) * 0.03, 0.07, 0.09 + (i % 2) * 0.03]))); });
  add('fuzz_tufts_1', 'Fuzzy Tufts', C, 'detail', 'surface', 1, { mass: 0.04, icon: '🧶', col: 'accent', ab: { health: 1 } },
    (g, c) => { for (let i = 0; i < 6; i++) { const a = i * 1.05; g.add(cone(c.m, [Math.cos(a) * 0.17, 0.1, Math.sin(a) * 0.17], [0.07, 0.3, 0.07], [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5], { ol: 1.2 })); } });
  add('ridge_dorsal_2', 'Dorsal Ridge', C, 'detail', 'surface', 2, { mass: 0.15, icon: '🐉', col: 'accent', ab: { pose: 1 } },
    (g, c) => { for (let i = 0; i < 4; i++) g.add(cone(c.m, [0, 0.18 - Math.abs(i - 1.5) * 0.03, (i - 1.5) * 0.24], [0.06, 0.4 - Math.abs(i - 1.5) * 0.08, 0.2], [0.15, 0, 0])); });
  add('pouch_belly_2', 'Belly Pouch', C, 'detail', 'surface', 2, { mass: 0.15, icon: '🦘', col: 'accent', ab: { health: 1 } },
    (g, c) => { g.add(sph(c.m, [0, 0.07, 0], [0.4, 0.2, 0.35])); g.add(sph(c.d, [0, 0.14, 0.05], [0.28, 0.06, 0.18], { ol: 0.3 })); });
  add('spots_glow_3', 'Glow Spots', C, 'detail', 'surface', 3, { mass: 0.03, icon: '🔆', col: 'accent', ab: { charm: 1 } },
    (g, c) => { [[0, 0], [0.22, 0.12], [-0.2, 0.18]].forEach((p) => g.add(sph(K.cyan, [p[0], 0.02, p[1]], [0.1, 0.05, 0.1], { emissive: K.cyan, ei: 0.9, ol: 0.3 }))); g.userData.anim = { type: 'pulse', amp: 0.2, speed: 2.4, react: {} }; });

  // ================================================================== CREATURE: WATER PARTS (DESIGN 3.6)
  defArm('arm_flipper_2', 'Flipper Limb', 2, { icon: '🐧', fin: 3, ab: { strike: 0 }, dens: 1.05, mass: 0.14 },
    { r0: 0.16, r1: 0.1, joint: 'ball', jr: 1.1, pole: 'back', splay: 0.5, rf: 0.8 });
  byId['arm_flipper_2'].build = (function (orig) {
    return function (design, part, colors) {
      const g = orig(design, part, colors);
      g.clear();
      const c = (colors && colors.accent !== undefined && typeof colors.accent === 'number') ? colors.accent : K.cyan;
      const m = (colors && typeof colors.base === 'number') ? colors.base : K.cyan;
      g.add(sph(m, [0, 0, 0.16], [0.06, 0.34, 0.3]));              // flat blade (wide in local Y)
      g.add(sph(c, [0, 0, 0.12], [0.075, 0.16, 0.14], { ol: 0.6 }));
      g.userData.anim = { type: 'sway', axis: 'y', amp: 0.18, speed: 5, phase: 0, react: { walk: 1.5 } };
      return g;
    };
  })(byId['arm_flipper_2'].build);
  add('gills_frill_2', 'Gill Frills', C, 'detail', 'surface', 2, { mass: 0.08, icon: '🐠', col: 'accent', gill: 0.85, dens: 1.0, cx: 1, desc: 'Breathe underwater: drains 85% less air (two = almost amphibious).' },
    (g, c) => {
      for (let i = 0; i < 3; i++) { const f = grp([0, 0.03, (i - 1) * 0.17], [0, 0, 0]); g.add(f); f.add(cone(i % 2 ? K.rose : K.pink, [0, 0.2, 0], [0.05, 0.4, 0.17], [0, 0, 0.18 * (i - 1)], { ol: 1.1 })); f.userData.anim = { type: 'sway', axis: 'z', amp: 0.12, speed: 3 + i * 0.4, phase: i, react: {} }; }
      g.add(sph(c.d, [0, 0.0, 0], [0.14, 0.05, 0.3], { ol: 0.4 }));
    });
  add('snorkel_tube_1', 'Snorkel Stalk', C, 'detail', 'surface', 1, { mass: 0.04, icon: '🤿', col: 'detail', lung: 8, snorkel: 0.9, dens: 0.9, desc: 'A breathing tube: breathe while the water is below its tip. +8 s air.' },
    (g, c) => {
      const t = chain(g, c.m, { n: 3, len: 0.9, r0: 0.07, r1: 0.06, curl: -0.12, curl0: 0 });
      t.tip.add(cyl(K.gold, [0, 0.03, 0], [0.1, 0.1, 0.1], null, 1.2));
      t.tip.add(sph(c.d, [0, 0.09, 0], [0.065, 0.035, 0.065], { ol: 0.3 }));
      t.root.userData.anim = { type: 'chain', axis: 'x', amp: 0.05, speed: 2, wave: 0.6, links: t.links, phase: 0, react: {} };
    });
  add('blowhole_2', 'Blowhole', C, 'detail', 'surface', 2, { mass: 0.06, icon: '🐋', col: 'detail', lung: 22, refill: 2.4, dens: 0.9, cx: 1, desc: 'Big lungs and a fast gasp: +22 s air, refills 2.4x faster.' },
    (g, c) => {
      g.add(M(geo.tor(0.35), c.d, { s: 0.15, p: [0, 0.03, 0], r: [Math.PI / 2, 0, 0] }));
      g.add(sph(0x0b1220, [0, 0.025, 0], [0.11, 0.04, 0.11], { ol: 0 }));
      g.userData.anim = { type: 'pulse', amp: 0.12, speed: 2.2, axis: 'y', react: {} };
    });
  add('sac_float_2', 'Air Sac', C, 'detail', 'surface', 2, { mass: 0.12, icon: '🎈', col: 'accent', lung: 6, dens: 0.12, desc: 'A gas bladder: very light, so it keeps heavier bodies afloat. +6 s air.' },
    (g, c) => {
      g.add(M(geo.sph(), c.m, { s: [0.34, 0.28, 0.34], p: [0, 0.2, 0] }));
      g.add(sph(0xffffff, [0.1, 0.3, 0.1], [0.07, 0.05, 0.05], { ol: 0, emissive: 0xffffff, ei: 0.3 }));
      g.userData.anim = { type: 'pulse', amp: 0.05, speed: 1.9, react: {} };
    });
  add('tail_fluke_3', 'Fluke Tail', C, 'detail', 'surface', 3, { mass: 0.34, icon: '🐬', col: 'base', fin: 4, dens: 0.95, cx: 2, ab: { speed: 1 }, desc: 'Powerful swimming tail (swim level 4).' },
    (g, c) => {
      const t = chain(g, c.m, { n: 4, len: 1.1, r0: 0.2, r1: 0.1, curl: 0.05, curl0: 0.2 });
      const f = grp([0, 0.04, 0], [0, 0, 0]); t.tip.add(f);
      [-1, 1].forEach((sd) => f.add(sph(c.a, [sd * 0.24, 0.06, 0], [0.3, 0.035, 0.17], { r: [0, sd * 0.25, sd * 0.1] })));
      tailAnim(t, 0.36, 4.2, { dance: 2, walk: 2 }); t.root.userData.anim.axis = 'x';
    });
  add('shell_lead_3', 'Heavy Shell', C, 'detail', 'surface', 3, { mass: 1.7, icon: '🪨', col: 'detail', ab: { health: 3 }, cx: 2, dens: 3.4, desc: 'Thick armour. Great protection, sinks like a stone.' },
    (g, c) => {
      g.add(M(geo.hemi(), c.m, { s: [1.0, 0.8, 1.15], p: [0, -0.14, 0] }));
      for (let i = 0; i < 5; i++) { const a = i * 1.26; g.add(sph(c.a, [Math.cos(a) * 0.42, 0.52 - 0.02 * i, Math.sin(a) * 0.5], [0.15, 0.06, 0.15], { ol: 0.4 })); }
      g.add(M(geo.tor(0.2), K.stone, { s: 0.55, p: [0, 0.4, 0], r: [Math.PI / 2, 0, 0] }));
    });

  // ================================================================== CELL PARTS (frame: +Y outward from rim, +Z tangent, X = up; drawn flat)
  const cellEyeBuild = (r, o) => (g, c) => { eyeBuild(g, c, Object.assign({ r: r, noLid: true }, o)); };
  const rimMat = (hex, o) => (SP.render && SP.render.toonRim ? SP.render.toonRim(hex, o) : toonMat(hex, o));
  // static tapered tube with its own inflated ink hull (hull scaling about the origin would detach curved tubes)
  function tubeCel(key, pts, radii, radial, hex, ol, o) {
    o = o || {};
    const m = new THREE.Mesh(tubeStatic(key, pts, radii, radial), o.mat || toonMat(hex, o.emissive !== undefined ? { emissive: o.emissive, emissiveIntensity: o.ei === undefined ? 0.7 : o.ei } : undefined));
    m.castShadow = false;
    if (ctx.outline && ol > 0) {
      const out = new THREE.Mesh(tubeStatic(key + 'o' + Math.round(ol * 1000), pts, radii.map((r) => r + ol), radial), inkMat());
      out.name = 'outline'; m.add(out);
    }
    return m;
  }
  // dynamic bundle wrapped in its own group `w` (low-LOD merging skips + re-parents it, anim.js drives userData.anim.type 'whip')
  function dynPart(g, hex, tubes, o, an) {
    const w = grp(); g.add(w);
    const d = dynTubes(w, hex, tubes, o);
    an = an || {};
    if (ctx.low && o && o.staticLow) { // low LOD: pose once and let the static merge take it (keeps crowd cells at <= 6 draw calls)
      d.update(1.3, (an.amp || 0.2) * 0.7, an.speed || 8, 0);
      w.traverse((m) => { if (m.isMesh) { m.userData.dyn = false; if (m.name === 'dynOutline') m.name = 'outline'; } });
      return { w: w, d: d };
    }
    w.userData.anim = Object.assign({ type: 'whip', dyn: d, amp: 0.2, speed: 8, react: {} }, an);
    return { w: w, d: d };
  }
  const ZAX = [0, 0, 1];

  add('cell_filter', 'Filter Mouth', CE, 'mouth', 'mouth', 1, { u: 1, cost: 15, mass: 0.1, diet: 'herbivore', icon: '🌿', cx: 1, ab: {} },
    (g, c) => {
      const lip = mixHex(c.m, 0xffffff, 0.3);
      g.add(M(geo.tor(0.42), lip, { s: 0.3, p: [0, 0.1, 0], r: [Math.PI / 2, 0, 0], ol: 1.1 }));
      g.add(sph(mixHex(K.wine, K.ink, 0.35), [0, 0.07, 0], [0.27, 0.06, 0.27], { ol: 0.2 }));
      for (let i = 0; i < 9; i++) {
        const a = i / 9 * Math.PI * 2, h = grp([0, 0.1, 0], [0, a, 0]); g.add(h);
        const t = cone(c.d === K.dk ? mixHex(c.m, 0xffffff, 0.55) : c.d, [0.36, 0.17, 0], [0.04, 0.28, 0.04], [0, 0, -0.55], { ol: 1.2 }); h.add(t);
      }
      g.userData.anim = { type: 'pulse', amp: 0.08, speed: 3, react: { eat: 4 } };
    });
  add('cell_jaw', 'Cell Jaw', CE, 'mouth', 'mouth', 1, { u: 1, cost: 15, mass: 0.12, diet: 'carnivore', icon: '🦷', cx: 1, ab: { bite: 1 } },
    (g, c) => jawMouth(g, c, { w: 0.62, l: 0.55, h: 0.3, teeth: 'fang', nTeeth: 3, lip: mixHex(c.m, 0xffffff, 0.12) }));
  add('cell_proboscis', 'Proboscis', CE, 'mouth', 'mouth', 2, { cost: 25, mass: 0.15, diet: 'omnivore', icon: '💉', cx: 2, ab: { bite: 1 } },
    (g, c) => {
      g.add(sph(c.m, [0, 0.05, 0], [0.2, 0.14, 0.2], { ol: 1 }));
      dynPart(g, c.m, [{ b: [0, 0.08, 0], d: [0, 1, 0], lat: ZAX, len: 1.0, r0: 0.11, r1: 0.05, ph: 0, wave: 0.55, bulb: 0.05 }], { segs: 7, tipHex: mixHex(K.rose, 0xffffff, 0.15), staticLow: true }, { amp: 0.12, speed: 3, react: { eat: 3 } });
    });
  add('cell_flagellum', 'Flagellum', CE, 'movement', 'surface', 1, { u: 1, cost: 15, mass: 0.1, icon: '〰', cx: 1, ab: { speed: 2 }, cell: { thrust: 2.2, turn: 0.1, burst: 0 } },
    (g, c) => {
      g.add(sph(mixHex(c.m, 0xffffff, 0.2), [0, 0.02, 0], [0.15, 0.1, 0.15], { ol: 1 }));
      dynPart(g, c.m, [{ b: [0, 0.05, 0], d: [0, 1, 0], lat: ZAX, len: 1.8, r0: 0.085, r1: 0.016, ph: 0, wave: 1.15 }], { segs: 10, tipHex: mixHex(c.m, 0xffffff, 0.5) }, { amp: 0.19, speed: 8.5, react: { walk: 1.8 } });
    });
  add('cell_flagellum_2', 'Whip Tail', CE, 'movement', 'surface', 3, { cost: 20, mass: 0.15, icon: '🌀', cx: 2, ab: { speed: 3 }, cell: { thrust: 3.4, turn: 0.1, burst: 0 } },
    (g, c) => {
      g.add(sph(mixHex(c.m, 0xffffff, 0.2), [0, 0.03, 0], [0.2, 0.13, 0.2], { ol: 1 }));
      dynPart(g, c.m, [
        { b: [0, 0.06, 0.05], d: [0, 1, 0], lat: ZAX, len: 2.3, r0: 0.1, r1: 0.016, ph: 0, wave: 1.0 },
        { b: [0, 0.06, -0.05], d: [0, 1, 0], lat: ZAX, len: 2.0, r0: 0.075, r1: 0.014, ph: 0.9, wave: 1.0 }
      ], { segs: 11, tipHex: c.a }, { amp: 0.17, speed: 11.5, react: { walk: 1.8 } });
    });
  add('cell_cilia', 'Cilia', CE, 'movement', 'surface', 1, { u: 1, cost: 15, mass: 0.08, icon: '🌾', cx: 1, ab: { sneak: 1 }, cell: { thrust: 0.7, turn: 1.2, burst: 0 } },
    (g, c) => {
      const tubes = [];
      for (let r = 0; r < 3; r++) for (let i = 0; i < 8; i++) {
        const z = (i - 3.5) * 0.17 + (r % 2 ? 0.085 : 0), x = (r - 1) * 0.27, dx = x * 0.9, dz = z * 0.5;
        const l = Math.hypot(dx, 1, dz);
        tubes.push({ b: [x, -Math.abs(x) * 0.25 - 0.03, z], d: [dx / l, 1 / l, dz / l], lat: ZAX, len: 0.4, r0: 0.04, r1: 0.022, ph: i * 0.75 + r * 0.9, wave: 0.45, bulb: 0.025 });
      }
      dynPart(g, c.m, tubes, { segs: ctx.low ? 3 : 5, radial: 5, tipHex: mixHex(c.m, 0xffffff, 0.5), ol: 0.016, staticLow: true }, { amp: 0.3, speed: 9.5, react: { walk: 1.6 } });
    });
  add('cell_jet', 'Jet Squirter', CE, 'movement', 'surface', 2, { cost: 25, mass: 0.2, icon: '💨', cx: 2, ab: { sprint: 2 }, cell: { thrust: 0.8, turn: 0, burst: 3 } },
    (g, c) => {
      g.add(M(lathe('jet', [[0, 0], [0.2, 0.02], [0.21, 0.14], [0.3, 0.34], [0.33, 0.4], [0.22, 0.4], [0, 0.3]], 12), c.m, { ol: 0.8 }));
      g.add(sph(mixHex(K.dk, K.ink, 0.5), [0, 0.37, 0], [0.22, 0.05, 0.22], { ol: 0.1, noShadow: true }));
      g.add(M(geo.tor(0.22), c.d === K.dk ? c.a : c.d, { s: 0.31, p: [0, 0.4, 0], r: [Math.PI / 2, 0, 0], ol: 0.8 }));
      g.userData.anim = { type: 'pulse', amp: 0.12, speed: 5, react: { walk: 2 } };
    });
  add('cell_spike', 'Spike', CE, 'weapons', 'surface', 1, { u: 1, cost: 10, mass: 0.1, icon: '📍', cx: 1, ab: { strike: 1, charge: 1 }, col: 'accent', cell: { ram: 1.0 } },
    (g, c) => {
      g.add(sph(c.b, [0, 0.03, 0], [0.22, 0.13, 0.22], { ol: 0.9 }));
      g.add(cone(c.m, [0, 0.46, 0], [0.16, 0.9, 0.16], null, { ol: 1.3 }));
      g.add(M(geo.tor(0.3), mixHex(c.m, K.ink, 0.25), { s: 0.12, p: [0, 0.15, 0], r: [Math.PI / 2, 0, 0], ol: 0.6 }));
    });
  add('cell_poison', 'Poison Sac', CE, 'weapons', 'surface', 2, { cost: 15, mass: 0.12, icon: '☠', cx: 1, ab: { spit: 2 }, col: 'accent', cell: { poison: 1 } },
    (g, c) => {
      const sac = grp([0, 0.2, 0]); g.add(sac);
      sac.add(M(geo.sph(), K.lime, { s: [0.32, 0.29, 0.32], mat: rimMat(K.lime, { opacity: 0.8, rim: 0xecfccb, spec: 0.9, emissive: K.lime, emissiveIntensity: 0.4 }), ol: 0.8 }));
      [[0.08, 0.02, 0.06, 0.1], [-0.09, -0.05, -0.04, 0.075], [0.0, 0.1, -0.1, 0.06]].forEach((b) => sac.add(sph(mixHex(K.lime, K.dk, 0.55), [b[0], b[1], b[2]], b[3], { ol: 0.2, noShadow: true })));
      g.add(cyl(c.d === K.dk ? mixHex(K.lime, K.dk, 0.5) : c.d, [0, 0.46, 0], [0.09, 0.26, 0.09], null, 0.6, { ol: 1 }));
      g.add(sph(K.lime, [0, 0.62, 0], [0.09, 0.07, 0.09], { emissive: K.lime, ei: 0.8, ol: 0.5 }));
      g.userData.anim = { type: 'pulse', amp: 0.1, speed: 3, react: { spit: 4 } };
    });
  add('cell_electric', 'Electric Organ', CE, 'weapons', 'surface', 3, { cost: 25, mass: 0.2, icon: '⚡', cx: 2, ab: { strike: 2, spit: 1 }, col: 'accent', cell: { zap: 1 } },
    (g, c) => {
      g.add(sph(mixHex(K.gold, K.dk, 0.5), [0, 0.1, 0], [0.3, 0.17, 0.3], { ol: 0.9 }));
      const coilPts = [], coilR = [];
      for (let i = 0; i <= 22; i++) { const t = i / 22, a = t * Math.PI * 2 * 2.2; coilPts.push([Math.cos(a) * 0.15, 0.2 + t * 0.5, Math.sin(a) * 0.15]); coilR.push(0.034); }
      const z = grp([0, 0, 0]); g.add(z);
      z.add(tubeCel('coil', coilPts, coilR, 6, K.gold, 0.022, { emissive: K.gold, ei: 0.9 }));
      for (let i = 0; i < 3; i++) { const a = i * 2.09, h = grp([0, 0.62, 0], [0, a, 0]); z.add(h); h.add(cone(0xfef08a, [0.1, 0.08, 0], [0.04, 0.2, 0.04], [0, 0, -0.7], { emissive: K.gold, ei: 1, ol: 1 })); }
      z.userData.anim = { type: 'spin', axis: 'y', speed: 1.8, react: {} };
      const orb = grp([0, 0.78, 0]); g.add(orb);
      orb.add(sph(0xfef9c3, [0, 0, 0], 0.11, { emissive: 0xfde047, ei: 1.3, ol: 0.6 }));
      orb.userData.anim = { type: 'pulse', amp: 0.35, speed: 11, react: { strike: 3 } };
    });
  add('cell_horn', 'Ram Horn', CE, 'weapons', 'surface', 2, { cost: 15, mass: 0.2, icon: '🐂', cx: 1, ab: { charge: 2 }, col: 'accent', cell: { ram: 2.0 } },
    (g, c) => {
      const pts = [], rd = [];
      for (let i = 0; i <= 9; i++) { const u = i / 9, a = u * 1.15; pts.push([0, Math.sin(a) * 0.82, (1 - Math.cos(a)) * 0.82 * 0.95]); rd.push(0.16 * (1 - u) + 0.022); }
      g.add(tubeCel('horn', pts, rd, 8, K.bone, 0.03));
      g.add(sph(c.b, [0, 0.04, 0], [0.26, 0.15, 0.26], { ol: 0.9 }));
      [0.25, 0.5, 0.72].forEach((u) => { const a = u * 1.15, r = 0.16 * (1 - u) + 0.035; g.add(M(geo.tor(0.3), mixHex(K.bone, K.claw, 0.45), { s: r * 0.9, p: [0, Math.sin(a) * 0.82, (1 - Math.cos(a)) * 0.82 * 0.95], r: [Math.PI / 2 + a * 0, 0, 0], ol: 0.5 })); });
    });
  add('cell_eye_bead', 'Bead Eye', CE, 'eyes', 'eye', 1, { u: 1, cost: 5, mass: 0.01, icon: '⚫', col: 'detail' }, cellEyeBuild(0.15, { bead: true, white: K.ink }));
  add('cell_eye_button', 'Button Eye', CE, 'eyes', 'eye', 1, { cost: 5, mass: 0.01, icon: '👀' }, cellEyeBuild(0.24, { iris: 0x0ea5e9 }));
  add('cell_eye_stalk', 'Stalk Eye', CE, 'eyes', 'eye', 2, { cost: 5, mass: 0.02, icon: '🦐' }, (g, c) => eyeBuild(g, c, { r: 0.21, stalk: 0.5, iris: 0x22c55e }));
  add('cell_armor', 'Armor Plate', CE, 'extras', 'surface', 2, { cost: 15, mass: 0.3, icon: '🛡', cx: 1, ab: { health: 2 }, col: 'detail' },
    (g, c) => {
      const lite = mixHex(c.m, 0xffffff, 0.3);
      [[0, 0.08, -0.22, 0.4, 0.3], [0.04, 0.12, 0.12, 0.38, 0.9], [-0.02, 0.16, 0.42, 0.3, 1.7]].forEach((p) => {
        g.add(M(geo.dod(), c.m, { p: [p[0], p[1], p[2]], s: [p[3], 0.17, p[3]], r: [0, p[4], 0] }));
        g.add(M(geo.dod(), lite, { p: [p[0], p[1] + 0.1, p[2]], s: [p[3] * 0.55, 0.08, p[3] * 0.55], r: [0, p[4], 0], ol: 0.6 }));
      });
    });
  add('cell_lure', 'Glow Lure', CE, 'extras', 'surface', 2, { cost: 15, mass: 0.1, icon: '💡', cx: 1, ab: { charm: 2 }, col: 'accent' },
    (g, c) => {
      g.add(sph(c.m, [0, 0.03, 0], [0.14, 0.09, 0.14], { ol: 1 }));
      const o = dynPart(g, c.m, [{ b: [0, 0.05, 0], d: [0, 1, 0], lat: ZAX, len: 0.8, r0: 0.05, r1: 0.032, ph: 0, wave: 0.5 }], { segs: 6, radial: 5, ol: 0.02, staticLow: true }, { amp: 0.14, speed: 2.4, react: {} });
      const bulb = grp(); o.w.add(bulb); o.d.tipObj = bulb; if (ctx.low) o.d.update(1.3, 0.1, 2.4, 0);
      const bm = rimMat(0xfef08a, { emissive: 0xfacc15, emissiveIntensity: 1, rim: 0xffffff, rimStrength: 0.5, spec: 1 });
      const b = new THREE.Mesh(geo.sph(), bm); b.scale.set(0.17, 0.17, 0.17); b.position.y = 0.1; bulb.add(b);
      const gl = new THREE.Mesh(geo.sph(), toonMat(0xfde047, { transparent: true, opacity: 0.25, emissive: 0xfde047, emissiveIntensity: 1, depthWrite: false }));
      gl.scale.set(0.3, 0.3, 0.3); gl.position.y = 0.1; bulb.add(gl);
      bulb.userData.anim = { type: 'pulse', amp: 0.18, speed: 3.2, react: {} };
    });
  add('cell_pod', 'Primordia Pod', CE, 'extras', 'surface', 3, { cost: 20, mass: 0.15, icon: '🍄', cx: 1, ab: { health: 1, sneak: 1 }, col: 'accent' },
    (g, c) => {
      [[0, 0, 0.22], [0.2, 0.2, 0.15], [-0.17, 0.15, 0.14]].forEach((p) => {
        g.add(sph(c.m, [p[2] * 0.3, p[2] * 0.95, p[1]], [p[2], p[2] * 1.05, p[2]], null));
        g.add(sph(mixHex(c.m, K.dk, 0.55), [p[2] * 0.3, p[2] * 1.75, p[1]], [p[2] * 0.4, p[2] * 0.12, p[2] * 0.4], { ol: 0.2, noShadow: true }));
      });
    });

  // ================================================================== OUTFIT PARTS (tribal): surface-mounted dress-up
  const out = (id, name, cat, tier, bonus, icon, fn, o) => add(id, name, OU, cat, 'surface', tier, Object.assign({ cost: [0, 10, 20, 35, 50][tier], mass: 0.1, bonus: bonus, icon: icon, col: 'accent' }, o), fn);
  out('hat_feather', 'Feather Headband', 'hat', 1, { social: 2 }, '🪶', (g, c) => { g.add(M(geo.tor(0.15), K.claw, { s: [0.5, 0.5, 0.18], p: [0, 0.05, 0], r: [Math.PI / 2, 0, 0] })); [-1, 0, 1].forEach((i) => g.add(sph([K.rose, K.gold, K.cyan][i + 1], [i * 0.15, 0.35, -0.1], [0.07, 0.35, 0.03], null, { r: [0, 0, -i * 0.3] }))); }, { u: 1 });
  out('hat_straw', 'Straw Hat', 'hat', 1, { gather: 2 }, '👒', (g, c) => { g.add(cyl(K.straw, [0, 0.03, 0], [0.7, 0.06, 0.7], null, 1)); g.add(cyl(K.straw, [0, 0.2, 0], [0.38, 0.32, 0.38], null, 0.85)); g.add(cyl(K.rose, [0, 0.12, 0], [0.4, 0.06, 0.4], null, 1)); }, { u: 1 });
  out('hat_horned', 'Horned Helmet', 'hat', 2, { attack: 2, health: 1 }, '⛑', (g, c) => { g.add(M(geo.hemi(), K.stone, { s: [0.5, 0.42, 0.5] })); [-1, 1].forEach((s) => { const h = chain(g, K.bone, { n: 3, len: 0.55, r0: 0.08, r1: 0.02, curl: 0.4 }); h.root.position.set(s * 0.42, 0.15, 0); h.root.rotation.z = -s * 1.0; }); });
  out('hat_crown', 'Chieftain Crown', 'hat', 3, { social: 3 }, '👑', (g, c) => { g.add(cyl(K.gold, [0, 0.12, 0], [0.42, 0.24, 0.42], null, 1)); for (let i = 0; i < 5; i++) { const a = i * 1.2566; g.add(cone(K.gold, [Math.cos(a) * 0.4, 0.34, Math.sin(a) * 0.4], [0.08, 0.2, 0.08])); } g.add(sph(K.rose, [0, 0.14, 0.42], 0.07)); });
  out('hat_totem', 'Totem Headdress', 'hat', 3, { social: 2, attack: 1 }, '🗿', (g, c) => { for (let i = 0; i < 7; i++) { const a = (i - 3) * 0.38; g.add(sph([K.rose, K.gold, K.cyan, K.lime][i % 4], [Math.sin(a) * 0.45, Math.cos(a) * 0.45 + 0.05, 0], [0.09, 0.45, 0.04], null, { r: [0, 0, -a] })); } });
  out('hat_bone', 'Bone Cap', 'hat', 1, { attack: 1 }, '💀', (g, c) => { g.add(M(geo.hemi(), K.bone, { s: [0.45, 0.35, 0.45] })); g.add(cone(K.bone, [0, 0.4, 0], [0.07, 0.3, 0.07])); });
  out('hat_leaf', 'Leaf Crown', 'hat', 1, { gather: 1, social: 1 }, '🌿', (g, c) => { for (let i = 0; i < 6; i++) { const a = i * 1.047; g.add(sph(K.lime, [Math.cos(a) * 0.38, 0.1, Math.sin(a) * 0.38], [0.14, 0.04, 0.07], null, { r: [0, -a, 0.3] })); } });
  out('mask_tiki', 'Tiki Mask', 'mask', 2, { social: 2, attack: 1 }, '🗿', (g, c) => { g.add(box(K.wood, [0, 0.1, 0], [0.5, 0.2, 0.62])); g.add(sph(K.ink, [-0.14, 0.2, 0.05], [0.07, 0.05, 0.1], { ol: 0 })); g.add(sph(K.ink, [0.14, 0.2, 0.05], [0.07, 0.05, 0.1], { ol: 0 })); g.add(box(K.rose, [0, 0.2, -0.18], [0.3, 0.08, 0.1])); }, { u: 1 });
  out('mask_war', 'War Paint Mask', 'mask', 1, { attack: 2 }, '😡', (g, c) => { g.add(box(K.rose, [0, 0.04, 0], [0.6, 0.04, 0.12])); g.add(box(K.bone, [0, 0.05, 0.2], [0.5, 0.04, 0.08])); });
  out('mask_leaf', 'Leaf Mask', 'mask', 1, { gather: 2 }, '🍃', (g, c) => { g.add(sph(K.lime, [0, 0.06, 0], [0.4, 0.06, 0.45])); g.add(sph(K.ink, [-0.12, 0.12, 0.05], [0.06, 0.03, 0.08], { ol: 0 })); g.add(sph(K.ink, [0.12, 0.12, 0.05], [0.06, 0.03, 0.08], { ol: 0 })); });
  out('mask_plague', 'Healer Beak Mask', 'mask', 3, { health: 3 }, '🩹', (g, c) => { g.add(sph(K.bone, [0, 0.15, 0], [0.4, 0.26, 0.4])); g.add(cone(K.bone, [0, 0.2, 0.4], [0.14, 0.6, 0.14], [Math.PI / 2, 0, 0])); g.add(sph(K.gold, [-0.15, 0.3, 0.1], 0.08)); g.add(sph(K.gold, [0.15, 0.3, 0.1], 0.08)); });
  out('chest_hide', 'Hide Vest', 'chest', 1, { health: 1, attack: 1 }, '🦺', (g, c) => { g.add(sph(0xb45309, [0, 0.08, 0], [0.62, 0.16, 0.5])); g.add(box(K.bone, [0, 0.17, 0], [0.1, 0.02, 0.4])); }, { u: 1 });
  out('chest_shell', 'Shell Plate', 'chest', 2, { health: 3 }, '🐚', (g, c) => { g.add(M(geo.hemi(), K.stone, { s: [0.65, 0.35, 0.55] })); }, {});
  out('chest_beads', 'Bead Necklace', 'chest', 1, { social: 2 }, '📿', (g, c) => { for (let i = 0; i < 9; i++) { const a = (i / 9) * 6.283; g.add(sph([K.rose, K.gold, K.cyan][i % 3], [Math.cos(a) * 0.55, 0.05, Math.sin(a) * 0.5], 0.07)); } }, { u: 1 });
  out('chest_bone', 'Bone Armor', 'chest', 3, { health: 2, attack: 2 }, '🦴', (g, c) => { for (let i = 0; i < 4; i++) g.add(cyl(K.bone, [0, 0.08, (i - 1.5) * 0.17], [0.05, 1.0, 0.05], [0, 0, Math.PI / 2], 1)); });
  out('shoulder_fur', 'Fur Mantle', 'shoulder', 1, { health: 1, social: 1 }, '🧣', (g, c) => { g.add(sph(0xd6d3d1, [0, 0.1, 0], [0.36, 0.2, 0.36])); for (let i = 0; i < 4; i++) g.add(cone(0xe7e5e4, [Math.cos(i * 1.57) * 0.2, 0.25, Math.sin(i * 1.57) * 0.2], [0.07, 0.2, 0.07])); });
  out('shoulder_spiked', 'Spiked Pauldron', 'shoulder', 3, { attack: 3 }, '⚔', (g, c) => { g.add(M(geo.hemi(), K.stone, { s: [0.38, 0.28, 0.38] })); for (let i = 0; i < 3; i++) g.add(cone(K.bone, [Math.cos(i * 2.1) * 0.15, 0.3, Math.sin(i * 2.1) * 0.15], [0.07, 0.32, 0.07])); });
  out('shoulder_cape', 'Tribal Cape', 'shoulder', 2, { social: 2, health: 1 }, '🦸', (g, c) => { g.add(M(geo.tri(), K.rose, { p: [0, 0.06, -0.3], s: [0.6, 0.04, 0.7], r: [0, Math.PI / 2 * 0, 0] })); });
  out('acc_spear', 'Stone Spear', 'accessory', 1, { attack: 3, gather: 1 }, '🔱', (g, c) => { g.add(cyl(K.wood, [0, 0.8, 0], [0.04, 1.6, 0.04], null, 1)); g.add(cone(K.stone, [0, 1.7, 0], [0.1, 0.3, 0.05])); }, { u: 1 });
  out('acc_club', 'Wooden Club', 'accessory', 1, { attack: 2 }, '🏏', (g, c) => { g.add(cyl(K.wood, [0, 0.45, 0], [0.12, 0.9, 0.12], null, 0.4)); }, {});
  out('acc_torch', 'Torch', 'accessory', 2, { attack: 1, social: 1 }, '🔥', (g, c) => { g.add(cyl(K.wood, [0, 0.45, 0], [0.05, 0.9, 0.05], null, 1)); g.add(cone(0xf97316, [0, 1.0, 0], [0.14, 0.34, 0.14], null, { emissive: 0xf97316, ei: 0.9 })); g.add(cone(K.gold, [0, 0.98, 0], [0.08, 0.22, 0.08], null, { emissive: K.gold, ei: 1, ol: 0 })); });
  out('acc_basket', 'Gathering Basket', 'accessory', 1, { gather: 3 }, '🧺', (g, c) => { g.add(cyl(K.straw, [0, 0.18, 0], [0.34, 0.36, 0.34], null, 1.2)); g.add(M(geo.tor(0.1), K.wood, { s: 0.3, p: [0, 0.4, 0], r: [Math.PI / 2, 0, 0] })); }, { u: 1 });
  out('acc_maracas', 'Maracas', 'accessory', 2, { social: 3 }, '🪇', (g, c) => { g.add(cyl(K.wood, [0, 0.3, 0], [0.04, 0.6, 0.04], null, 1)); g.add(sph(K.rose, [0, 0.7, 0], [0.16, 0.22, 0.16])); g.userData.anim = { type: 'sway', axis: 'z', amp: 0.2, speed: 8, phase: 0, react: { dance: 2, sing: 2 } }; });
  out('acc_horn', 'Tribal Horn', 'accessory', 2, { social: 3 }, '📯', (g, c) => { const h = chain(g, K.bone, { n: 4, len: 0.9, r0: 0.05, r1: 0.17, curl: 0.3 }); h.root.rotation.z = 0.2; });
  out('acc_shield', 'Round Shield', 'accessory', 2, { health: 2 }, '🛡', (g, c) => { g.add(cyl(K.wood, [0, 0.4, 0], [0.45, 0.08, 0.45], [Math.PI / 2, 0, 0], 1)); g.add(sph(K.gold, [0, 0.4, 0.06], 0.12)); });
  out('acc_staff', 'Healing Staff', 'accessory', 3, { health: 3, social: 1 }, '🪄', (g, c) => { g.add(cyl(K.wood, [0, 0.8, 0], [0.04, 1.6, 0.04], null, 1)); g.add(sph(K.cyan, [0, 1.7, 0], 0.17, { emissive: K.cyan, ei: 0.8 })); });
  out('acc_net', 'Fishing Net', 'accessory', 2, { gather: 3 }, '🥅', (g, c) => { g.add(cyl(K.wood, [0, 0.6, 0], [0.04, 1.2, 0.04], null, 1)); g.add(M(geo.tor(0.1), K.wood, { s: 0.3, p: [0, 1.3, 0], r: [0.3, 0, 0] })); g.add(M(geo.hemi(), 0xfef3c7, { s: [0.28, 0.2, 0.28], p: [0, 1.3, 0], r: [Math.PI, 0, 0], ol: 0.3 })); });
  out('acc_necklace', 'Fang Necklace', 'accessory', 3, { social: 1, attack: 2 }, '🦷', (g, c) => { for (let i = 0; i < 7; i++) { const a = (i - 3) * 0.35; g.add(cone(K.bone, [Math.sin(a) * 0.5, 0.04, Math.cos(a) * 0.1], [0.07, 0.2, 0.07], [Math.PI, 0, 0])); } });

  // ------------------------------------------------------------------ public API

  // ---- water: material densities of the older parts (relative to water = 1.0; default by slot in model.js partDens)
  { const D = { leg_flipper_2: 1.05, foot_web_2: 1.05, leg_tentacle_3: 1.1, leg_bug_2: 1.5, leg_pillar_1: 2.3, leg_titan_4: 2.4, arm_noodle_1: 1.15, arm_brawn_3: 1.8,
      wing_flutter_2: 0.5, wing_glider_4: 0.6, wing_feather_3: 0.55, fuzz_tufts_1: 0.5, shell_dome_2: 2.5, plates_armor_3: 2.9, pouch_belly_2: 0.8, fin_dorsal_2: 0.9, fin_tail_2: 0.95,
      tail_fat_1: 0.9, tail_whip_2: 1.0, sac_throat_2: 0.35, belly_drum_3: 0.55, spit_sac_2: 0.7, spit_acid_4: 0.8, eye_stalk_2: 0.9, plate_ram_4: 2.8, claw_blade_4: 2.6 };
    for (const k in D) if (byId[k]) byId[k].dens = D[k]; }

  const api = {
    list: list,
    colors: K,
    ctx: ctx,
    get(id) { return byId[id] || null; },
    byCategory(kind) {
      const out = {};
      list.forEach((p) => { if (p.kind === kind) (out[p.category] = out[p.category] || []).push(p); });
      return out;
    },
    ofKind(kind) { return list.filter((p) => p.kind === kind); },
    defaultUnlocked(kind) { return list.filter((p) => p.unlockedByDefault && (!kind || p.kind === kind)).map((p) => p.id); },
    // internals shared with mesh.js
    _chain: chain, _geo: geo, _M: M, _grp: grp, _mix: mixHex, _rimMat: rimMat
  };
  SP.parts = api;
})();
