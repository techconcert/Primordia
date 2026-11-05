/* SP.creature.build — design -> Rig (see ARCHITECTURE §4.11).
 * Body = one smooth variable-radius tube along a Catmull-Rom spine (CPU-deformable for animation) + inverted-hull outline.
 */
(function () {
  'use strict';
  const SP = window.SP = window.SP || {};
  const C = SP.creature = SP.creature || {};
  const V3 = THREE.Vector3, Q = THREE.Quaternion;

  const UP = new V3(0, 1, 0), FWD = new V3(0, 0, 1);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const sstep = (t) => t * t * (3 - 2 * t);
  const _m = new THREE.Matrix4(), _x = new V3(), _y = new V3(), _z = new V3(), _q = new Q();

  function toon(hex, o) { return SP.render && SP.render.toon ? SP.render.toon(hex, o) : new THREE.MeshToonMaterial(Object.assign({ color: hex }, o || {})); }
  function mix(a, b, t) {
    const ar = a >> 16 & 255, ag = a >> 8 & 255, ab = a & 255, br = b >> 16 & 255, bg = b >> 8 & 255, bb = b & 255;
    return ((ar + (br - ar) * t) << 16) | ((ag + (bg - ag) * t) << 8) | (ab + (bb - ab) * t);
  }

  // Orientation of a part: local +Y = normal, local +Z = creature forward projected on tangent plane (cell: horizontal tangent).
  function partQuat(n, rot, isCell, out) {
    _y.set(n[0], n[1], n[2]).normalize();
    if (isCell) {
      _z.crossVectors(UP, _y);
      if (_z.lengthSq() < 1e-4) _z.copy(FWD);
    } else {
      _z.copy(FWD).addScaledVector(_y, -FWD.dot(_y));
      if (_z.lengthSq() < 1e-4) _z.copy(UP).addScaledVector(_y, -UP.dot(_y));
    }
    _z.normalize();
    _x.crossVectors(_y, _z);
    _m.makeBasis(_x, _y, _z);
    out.setFromRotationMatrix(_m);
    if (rot) { _q.setFromAxisAngle(UP, rot); out.multiply(_q); }
    return out;
  }

  // ------------------------------------------------------------------ skin (tube)
  function buildSkin(design, opts, lowLod, isCell) {
    const sp = design.spine;
    const nReal = sp.length;
    let P = sp.map((s) => new V3(s.p[0], s.p[1], s.p[2])), R = sp.map((s) => s.r);
    if (nReal === 1) { P = [P[0].clone().add(new V3(0, 0, -0.001)), P[0].clone().add(new V3(0, 0, 0.001))]; R = [R[0], R[0]]; }
    const n = P.length;
    const curve = new THREE.CatmullRomCurve3(P, false, 'centripetal');
    let len = 0; for (let i = 1; i < n; i++) len += P[i].distanceTo(P[i - 1]);
    const flat = isCell ? (C.CELL_FLAT || 0.5) : 1;
    const radial = lowLod ? (isCell ? 10 : 8) : (isCell ? 20 : 14);
    const shape = isCell ? design.shape : null;
    let bcx = 0, bcz = 0; sp.forEach((q) => { bcx += q.p[0] / nReal; bcz += q.p[2] / nReal; });
    const nBody = clamp(Math.round(len / (lowLod ? 0.4 : 0.14)), n * (lowLod ? 1 : 2), lowLod ? 14 : 44);
    const capK = lowLod ? 2 : 4;

    const rAt = (u) => { // uniform Catmull-Rom on radii
      const i = Math.min(n - 2, Math.floor(u)), t = u - i;
      const p0 = R[Math.max(0, i - 1)], p1 = R[i], p2 = R[i + 1], p3 = R[Math.min(n - 1, i + 2)];
      const t2 = t * t, t3 = t2 * t;
      return Math.max(0.05, 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3));
    };

    // ring list: tail cap rings, body rings, head cap rings
    const rings = []; // {c:V3, rad, u, side:V3, bin:V3}
    const frameAt = (T) => {
      const up = Math.abs(T.y) > 0.95 ? FWD : UP;
      const side = new V3().crossVectors(up, T).normalize();
      const bin = new V3().crossVectors(T, side).normalize();
      return { side: side, bin: bin };
    };
    const t0 = curve.getTangent(0).normalize(), t1 = curve.getTangent(1).normalize();
    const f0 = frameAt(t0), f1 = frameAt(t1);
    for (let j = 0; j < capK; j++) {
      const ph = (j + 1) / (capK + 1) * Math.PI / 2;
      rings.push({ c: P[0].clone().addScaledVector(t0, -R[0] * Math.sin(ph) ), rad: R[0] * Math.cos(ph), u: 0, side: f0.side, bin: f0.bin });
    }
    // fix cap ordering: first ring is closest to pole => reverse so rings run tail -> body
    rings.reverse();
    for (let i = 0; i < nBody; i++) {
      const t = i / (nBody - 1), u = t * (n - 1);
      const T = curve.getTangent(t).normalize();
      const f = frameAt(T);
      rings.push({ c: curve.getPoint(t), rad: rAt(u), u: u, side: f.side, bin: f.bin });
    }
    for (let j = 0; j < capK; j++) {
      const ph = (j + 1) / (capK + 1) * Math.PI / 2;
      rings.push({ c: P[n - 1].clone().addScaledVector(t1, R[n - 1] * Math.sin(ph)), rad: R[n - 1] * Math.cos(ph), u: n - 1, side: f1.side, bin: f1.bin });
    }
    const nR = rings.length;
    const nV = nR * radial + 2;
    const pos = new Float32Array(nV * 3), col = new Float32Array(nV * 3);
    const vRing = new Uint16Array(nV), vTheta = new Float32Array(nV);
    const ringC = new Float32Array((nR + 2) * 3), ringU = new Float32Array(nR + 2), ringRad = new Float32Array(nR + 2);
    const base = design.colors.base, accent = design.colors.accent, detail = design.colors.detail, pat = design.colors.pattern || 'none';
    const cb = new THREE.Color(base), ca = new THREE.Color(accent), cd = new THREE.Color(detail), tmp = new THREE.Color();
    // spots: deterministic centres
    const rs = SP.util ? SP.util.rng(String(design.seed || design.name || 'x')) : { next: Math.random };
    const spots = [];
    if (pat === 'spots') for (let i = 0; i < 9; i++) spots.push([rs.next() * (n - 1), rs.next() * 6.283, 0.28 + rs.next() * 0.3]);
    const stripeF = 1.4 + (design.name ? (design.name.length % 3) * 0.5 : 0);

    for (let i = 0; i < nR; i++) {
      const r = rings[i];
      ringC[i * 3] = r.c.x; ringC[i * 3 + 1] = r.c.y; ringC[i * 3 + 2] = r.c.z; ringU[i] = r.u; ringRad[i] = r.rad;
      for (let k = 0; k < radial; k++) {
        const th = k / radial * Math.PI * 2, vi = i * radial + k;
        const cs = Math.cos(th), sn = Math.sin(th);
        pos[vi * 3] = r.c.x + (r.side.x * cs * r.rad + r.bin.x * sn * r.rad * flat);
        pos[vi * 3 + 1] = r.c.y + (r.side.y * cs * r.rad + r.bin.y * sn * r.rad * flat);
        pos[vi * 3 + 2] = r.c.z + (r.side.z * cs * r.rad + r.bin.z * sn * r.rad * flat);
        if (shape) { // visual silhouette bumps (star / lobed): modulate the horizontal radius by azimuth around the body centre
          const cxm = bcx, czm = bcz, rx = pos[vi * 3] - cxm, rz = pos[vi * 3 + 2] - czm, az = Math.atan2(rx, rz);
          const bump = shape === 'star' ? 0.2 * Math.pow(Math.max(0, Math.cos(5 * az)), 1.6) : shape === 'lobed' ? 0.13 * Math.cos(3 * az) : 0;
          pos[vi * 3] = cxm + rx * (1 + bump); pos[vi * 3 + 2] = czm + rz * (1 + bump);
        }
        vRing[vi] = i; vTheta[vi] = th;
        tmp.copy(cb);
        if (pat === 'belly') { tmp.lerp(ca, sstep(clamp((-sn + 0.05) / 0.7, 0, 1))); }
        else if (pat === 'stripes') { const s = Math.sin(r.u * stripeF * 3.1416 * 1.6 + 0.4); if (s > 0.2 && sn > -0.35) tmp.lerp(cd, sstep(clamp((s - 0.2) / 0.25, 0, 1)) * sstep(clamp((sn + 0.35) / 0.4, 0, 1))); }
        else if (pat === 'spots') { let w = 0; for (let q = 0; q < spots.length; q++) { const sq = spots[q]; let dth = Math.abs(th - sq[1]); if (dth > 3.1416) dth = 6.283 - dth; const d = Math.hypot((r.u - sq[0]) * 0.9, dth * r.rad * 0.7); w = Math.max(w, 1 - clamp((d - sq[2] * 0.7) / (sq[2] * 0.3 + 0.001), 0, 1)); } if (w > 0) tmp.lerp(ca, w); }
        col[vi * 3] = tmp.r; col[vi * 3 + 1] = tmp.g; col[vi * 3 + 2] = tmp.b;
      }
    }
    // poles
    const tailPole = nR * radial, headPole = nR * radial + 1;
    const pt = P[0].clone().addScaledVector(t0, -R[0]), ph2 = P[n - 1].clone().addScaledVector(t1, R[n - 1]);
    [[tailPole, pt, 0, nR], [headPole, ph2, n - 1, nR + 1]].forEach((a) => {
      pos[a[0] * 3] = a[1].x; pos[a[0] * 3 + 1] = a[1].y; pos[a[0] * 3 + 2] = a[1].z;
      vRing[a[0]] = a[3]; ringC[a[3] * 3] = a[1].x; ringC[a[3] * 3 + 1] = a[1].y; ringC[a[3] * 3 + 2] = a[1].z; ringU[a[3]] = a[2];
      tmp.copy(a[0] === tailPole ? (pat === 'belly' ? cb : cb) : cb); col[a[0] * 3] = tmp.r; col[a[0] * 3 + 1] = tmp.g; col[a[0] * 3 + 2] = tmp.b;
    });
    const idx = [];
    for (let i = 0; i < nR - 1; i++) for (let k = 0; k < radial; k++) {
      const a = i * radial + k, b = i * radial + (k + 1) % radial, c = (i + 1) * radial + k, d = (i + 1) * radial + (k + 1) % radial;
      idx.push(a, b, c, b, d, c);
    }
    for (let k = 0; k < radial; k++) {
      const a = k, b = (k + 1) % radial; idx.push(a, tailPole, b);
      const a2 = (nR - 1) * radial + k, b2 = (nR - 1) * radial + (k + 1) % radial; idx.push(a2, b2, headPole);
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geom.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geom.setIndex(idx);
    geom.computeVertexNormals();
    // bounding sphere padded for deformation
    geom.computeBoundingSphere(); geom.boundingSphere.radius += 0.8;
    const nor = geom.attributes.normal.array;
    const outG = new THREE.BufferGeometry();
    const opos = new Float32Array(nV * 3), ooff = new Float32Array(nV);
    outG.setAttribute('position', new THREE.BufferAttribute(opos, 3).setUsage(THREE.DynamicDrawUsage));
    outG.setIndex(idx);
    outG.boundingSphere = geom.boundingSphere.clone();
    for (let v = 0; v < nV; v++) {
      const rr = ringRad[vRing[v]] || 0.1;
      ooff[v] = (0.035 + 0.03 * Math.min(rr, 1.2)) * (isCell ? 0.8 : 1);
      opos[v * 3] = pos[v * 3] + nor[v * 3] * ooff[v]; opos[v * 3 + 1] = pos[v * 3 + 1] + nor[v * 3 + 1] * ooff[v]; opos[v * 3 + 2] = pos[v * 3 + 2] + nor[v * 3 + 2] * ooff[v];
    }
    const matBody = isCell
      ? (SP.render && SP.render.toonRim ? SP.render.toonRim(0xffffff, { vertexColors: true, rim: mix(base, 0xffffff, 0.7), rimStrength: 0.85, rimAt: 0.56, spec: 0.95, opacity: 0.62 })
        : toon(0xffffff, { vertexColors: true, transparent: true, opacity: 0.82, depthWrite: false }))
      : toon(0xffffff, { vertexColors: true });
    const mesh = new THREE.Mesh(geom, matBody);
    mesh.castShadow = opts.shadows !== false; mesh.receiveShadow = opts.shadows !== false; mesh.frustumCulled = false;
    mesh.name = 'skin';
    if (isCell) mesh.renderOrder = 3;
    let outMesh = null;
    if (opts.outline !== false) {
      outMesh = new THREE.Mesh(outG, SP.render && SP.render.outlineMaterial ? SP.render.outlineMaterial() : new THREE.MeshBasicMaterial({ color: 0x080c14, side: THREE.BackSide }));
      outMesh.name = 'outline'; outMesh.frustumCulled = false;
      mesh.add(outMesh);
    }
    const rest = pos.slice();
    return {
      mesh: mesh, outMesh: outMesh, geom: geom, outG: outG, rest: rest, pos: pos, opos: opos, nor: nor, ooff: ooff, vRing: vRing,
      ringC: ringC, ringU: ringU, nR: nR + 2, nV: nV, n: n, nReal: nReal,
      tmpR: new Float32Array((nR + 2) * 13),
      // apply node states: ns = { x,y,z,yaw,pitch,k : Float32Array(n) }
      update(ns, wobble) {
        const nRr = this.nR, tr = this.tmpR, nn = n;
        for (let i = 0; i < nRr; i++) {
          const u = ringU[i], j = Math.min(nn - 2, Math.floor(u)), f = sstep(u - j);
          const j1 = j + 1;
          const L = (a) => a[j] + (a[j1] - a[j]) * f;
          const o = i * 13;
          const yaw = L(ns.yaw), pit = L(ns.pitch);
          const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pit), spn = Math.sin(pit);
          tr[o] = L(ns.x); tr[o + 1] = L(ns.y); tr[o + 2] = L(ns.z); tr[o + 3] = L(ns.k) * (wobble ? 1 + wobble[i % wobble.length] : 1);
          // R = Ry(yaw) * Rx(pitch)
          tr[o + 4] = cy; tr[o + 5] = sy * spn; tr[o + 6] = sy * cp;
          tr[o + 7] = 0; tr[o + 8] = cp; tr[o + 9] = -spn;
          tr[o + 10] = -sy; tr[o + 11] = cy * spn; tr[o + 12] = cy * cp;
        }
        const rest = this.rest, p = this.pos, op = this.opos, nr = this.nor, oo = this.ooff, vr = this.vRing;
        for (let v = 0; v < this.nV; v++) {
          const r = vr[v], o = r * 13, cx = ringC[r * 3], cyy = ringC[r * 3 + 1], cz = ringC[r * 3 + 2];
          const rx = (rest[v * 3] - cx) * tr[o + 3], ry = (rest[v * 3 + 1] - cyy) * tr[o + 3], rz = (rest[v * 3 + 2] - cz) * tr[o + 3];
          const x = cx + tr[o] + tr[o + 4] * rx + tr[o + 7] * ry + tr[o + 10] * rz;
          const y = cyy + tr[o + 1] + tr[o + 5] * rx + tr[o + 8] * ry + tr[o + 11] * rz;
          const z = cz + tr[o + 2] + tr[o + 6] * rx + tr[o + 9] * ry + tr[o + 12] * rz;
          p[v * 3] = x; p[v * 3 + 1] = y; p[v * 3 + 2] = z;
          op[v * 3] = x + nr[v * 3] * oo[v]; op[v * 3 + 1] = y + nr[v * 3 + 1] * oo[v]; op[v * 3 + 2] = z + nr[v * 3 + 2] * oo[v];
        }
        this.geom.attributes.position.needsUpdate = true;
        if (this.outMesh) this.outG.attributes.position.needsUpdate = true;
      }
    };
  }

  // ------------------------------------------------------------------ limbs
  function limbMesh(hex, r0, r1, ol) {
    const P = SP.parts;
    const m = P._M(P._geo.cyl(Math.max(0.05, r1 / r0)), hex, { s: [r0, 1, r0], ol: ol });
    return m;
  }

  function colorOf(design, role) {
    const c = design.colors; const v = c[role]; return typeof v === 'number' ? v : c.base;
  }

  function buildLimb(rig, design, inst, vg, isArm) {
    const P = SP.parts, d = inst.def, p = inst.part, lb = d.limb || {};
    const hex = colorOf(design, p.color || d.col || 'base');
    const s = p.s || 1, len = inst.len;
    const r0 = (lb.r0 || 0.15) * s * (0.7 + 0.3 * len), r1 = (lb.r1 || 0.1) * s * (0.7 + 0.3 * len);
    const rk = (r0 + r1) / 2 * (lb.thigh || 1) * 0.92;
    const upper = P._M(P._geo.cyl(Math.max(0.05, rk / r0)), hex, { s: [r0, 1, r0] });
    const lower = P._M(P._geo.cyl(Math.max(0.05, r1 / rk)), hex, { s: [rk, 1, rk] });
    const hip = P._M(P._geo.sph(), hex, { s: r0 * (lb.jr || 1.1) * 1.05 });
    rig.body.add(upper, lower, hip);
    let knee = null;
    if (lb.joint === 'ball') { knee = P._M(P._geo.sph(), hex, { s: rk * (lb.jr || 1.1) * 1.0 }); rig.body.add(knee); }
    // tip (foot / hand)
    let tip = null, ankle = inst.ankle;
    const tipPart = design.parts.find((q) => q.attach === p.uid && SP.parts.get(q.id));
    const colors = design.colors;
    if (tipPart) {
      const td = SP.parts.get(tipPart.id);
      tip = td.build(design, tipPart, colors);
      const ts = tipPart.s || 1;
      tip.scale.set(ts * (inst.side < 0 && tipPart.mirror ? -1 : 1), ts, ts);
    } else {
      tip = d.build(design, p, colors);
      if (!isArm) tip.scale.set(s * (inst.side < 0 ? -1 : 1), s, s);
      else tip.scale.set(s * (inst.side < 0 ? -1 : 1), s, s);
    }
    const tipHolder = new THREE.Group(); tipHolder.add(tip); rig.body.add(tipHolder);
    const side = inst.side;
    const pole = new V3(0, 0.25, 0);
    if (lb.pole === 'up') pole.set(side * 1.0, 1.4, 0.1);
    else if (lb.pole === 'back') pole.set(side * 0.3, 0.1, -1);
    else pole.set(side * 0.3, 0.1, 1);
    if (p.bend !== undefined && lb.pole !== 'up') pole.z = (lb.pole === 'back' ? -1 : 1) * (p.bend >= 0 ? 1 : -1);
    pole.normalize();
    const vi = Math.min(p.v, vg.length - 1);
    const node = design.spine[vi];
    const off = new V3(p.mirror ? p.o[0] * (side || 1) : p.o[0], p.o[1], p.o[2]);
    const limb = {
      hip: hip, upper: upper, lower: lower, knee: knee, foot: tipHolder, tip: tip, len: len, side: side, phase: 0, footWorld: new V3(),
      hex: hex, ratU: Math.max(0.05, rk / r0), ratL: Math.max(0.05, r1 / rk),
      def: d, part: p, isArm: isArm, v: vi, off: off, pole: pole, ankle: ankle, splay: inst.splay, vert: inst.vert, rf: inst.rf,
      r0: r0, rk: rk, r1: r1, home: new V3(), fp: new V3(), from: new V3(), to: new V3(), sw: -1, timed: false, ph: 0, rate: 1, row: 0, off0: 0,
      hipRest: new V3(inst.hip[0], inst.hip[1], inst.hip[2])
    };
    return limb;
  }


  // ------------------------------------------------------------------ cell interior + helpers
  // Lift an equatorial surface point (offset o from the vertebra centre) up the ellipsoid by `ang` radians; returns {o, n}.
  function cellLift(node, o, ang) {
    const FL = C.CELL_FLAT || 0.5, r = Math.max(0.05, node.r), ca = Math.cos(ang), sa = Math.sin(ang);
    const rx = o[0] * ca, rz = o[2] * ca, ry = o[1] + sa * r * FL;
    const nx = rx / (r * r), ny = ry / (r * FL * r * FL), nz = rz / (r * r), l = Math.hypot(nx, ny, nz) || 1;
    return { o: [rx, ry, rz], n: [nx / l, ny / l, nz / l] };
  }
  const ORG_COLS = [0xfde047, 0xfb7185, 0xa78bfa, 0xfb923c, 0x67e8f9, 0xf472b6];
  function buildCellInterior(rig, design, low, collect) {
    const P = SP.parts, sp = design.spine, n = sp.length, FL = C.CELL_FLAT || 0.5, base = design.colors.base;
    const geoS = P._geo.sph();
    const rr = SP.util ? SP.util.rng(String(design.seed || design.name || 'c')) : { next: Math.random };
    let mr = 0; sp.forEach((q) => { mr += q.r / n; });
    // cytoplasm: slightly smaller, lighter ellipsoids (opaque, give the body volume under the translucent skin)
    const cyto = mix(base, 0xffffff, low ? 0.5 : 0.4);
    const cmat = toon(cyto, { emissive: mix(base, 0xffffff, 0.3), emissiveIntensity: 0.34, side: THREE.BackSide });   // far inner wall only, so organelles in front stay visible
    for (let i = 0; i < n; i++) {
      const r = sp[i].r;
      rig.vg[i].add(P._M(geoS, cyto, { mat: cmat, s: [r * 0.97, r * FL * 0.97, r * 0.97], ol: 0, noShadow: true }));
      if (i < n - 1) {
        const q = sp[i + 1], rm = (r + q.r) * 0.5 * 0.95;
        rig.vg[i].add(P._M(geoS, cyto, { mat: cmat, s: [rm, rm * FL, rm], p: [(q.p[0] - sp[i].p[0]) / 2, (q.p[1] - sp[i].p[1]) / 2, (q.p[2] - sp[i].p[2]) / 2], ol: 0, noShadow: true }));
      }
    }
    // nucleus + nucleolus
    const mid = Math.floor((n - 1) / 2), rm = sp[mid].r;
    const nucCol = mix(base, 0x4c1d95, 0.5);
    const nuc = P._M(geoS, nucCol, { s: [rm * 0.4, rm * 0.31, rm * 0.4], p: [rm * 0.06, rm * FL * 0.1, -rm * 0.05], ol: 0.7, mat: toon(nucCol, { emissive: nucCol, emissiveIntensity: 0.25 }) });
    rig.vg[mid].add(nuc);
    const nl = P._M(geoS, mix(base, 0xffffff, 0.8), { s: rm * 0.12, p: [rm * 0.16, rm * FL * 0.3, rm * 0.0], ol: 0.3, mat: toon(mix(base, 0xffffff, 0.85), { emissive: 0xffffff, emissiveIntensity: 0.35 }) });
    rig.vg[mid].add(nl);
    nuc.userData.anim = { type: 'bob', amp: rm * 0.035, speed: 0.8, phase: 1.3 };
    nl.userData.anim = { type: 'bob', amp: rm * 0.02, speed: 1.5, phase: 0.4 };
    // organelles
    const orgs = low ? 3 : 6;
    for (let k = 0; k < orgs; k++) {
      const vi = Math.min(n - 1, Math.floor(rr.next() * n)), r = sp[vi].r;
      const a = rr.next() * 6.283, d = r * (0.45 + rr.next() * 0.28), y = (rr.next() - 0.45) * r * FL * 0.8;
      const px = Math.cos(a) * d, pz = Math.sin(a) * d * 1.05, col = ORG_COLS[Math.floor(rr.next() * ORG_COLS.length)];
      let m;
      if (k % 3 === 0) { // vacuole: pale translucent bubble with a glint
        const sz = r * (0.17 + rr.next() * 0.08);
        const vm = SP.render && SP.render.toonRim ? SP.render.toonRim(mix(col, 0xffffff, 0.6), { opacity: 0.6, rim: 0xffffff, rimStrength: 0.55, spec: 1 }) : toon(mix(col, 0xffffff, 0.6), { transparent: true, opacity: 0.6, depthWrite: false });
        m = P._M(geoS, col, { s: sz, p: [px, y, pz], ol: 0.35, mat: vm }); m.renderOrder = 2;
      } else if (k % 3 === 1) { // mitochondrion: stretched pill with a lighter core
        m = P._M(geoS, col, { s: [r * 0.09, r * 0.085, r * 0.21], p: [px, y, pz], r: [0, rr.next() * 3.14, 0], ol: 0.5 });
        const core = P._M(geoS, mix(col, 0xffffff, 0.55), { s: [0.55, 0.5, 0.78], p: [0, 0.35, 0], ol: 0, noShadow: true });
        m.add(core);
      } else { // granule
        m = P._M(geoS, mix(base, 0x1e293b, 0.45), { s: r * (0.075 + rr.next() * 0.035), p: [px, y, pz], ol: 0.4 });
      }
      m.userData.anim = { type: 'bob', amp: r * (0.045 + rr.next() * 0.03), speed: 0.7 + rr.next() * 1.1, phase: rr.next() * 6.28 };
      rig.vg[vi].add(m);
    }
    rig.vg.forEach((g) => collect(rig, g, 0));
  }

  // ------------------------------------------------------------------ main build
  function collectFx(rig, obj, vi) {
    obj.traverse((o) => {
      const a = o.userData && o.userData.anim;
      if (!a) return;
      const fx = { obj: o, a: a, bx: o.rotation.x, by: o.rotation.y, bz: o.rotation.z, sc: o.scale.clone(), bp: o.position.clone(), vi: vi | 0, ph: a.phase || Math.random() * 6.28, links: null, lb: null };
      if (a.links) { fx.links = a.links; fx.lb = a.links.map((l) => [l.rotation.x, l.rotation.y, l.rotation.z]); }
      rig.fx.push(fx);
    });
  }

  function build(design, opts) {
    opts = opts || {};
    const low = opts.lod === 'low' || opts.lod === 'tiny';
    const tiny = opts.lod === 'tiny';
    const P = SP.parts;
    const isCell = design.kind === 'cell';
    const prevCtx = Object.assign({}, P.ctx);
    P.ctx.outline = opts.outline !== false; P.ctx.shadows = opts.shadows !== false; P.ctx.low = low;
    const stats = C.stats(design);
    const lay = C.layout(design);
    const root = new THREE.Group(); root.name = 'creature';
    const body = new THREE.Group(); body.name = 'body'; body.position.y = lay.lift; root.add(body);
    const rig = {
      lodMode: low, tiny: tiny, lowUpdate: null,
      root: root, design: design, stats: stats, body: body, legs: [], arms: [], eyes: [], mouth: null, fx: [], vg: [], lift: lay.lift,
      isCell: isCell, lod: tiny ? 'tiny' : low ? 'low' : 'high', scale: 1, skin: null, parts: [], _mats: null
    };
    const skin = buildSkin(design, opts, low, isCell);
    rig.skin = skin; body.add(skin.mesh);
    const sp = design.spine, n = sp.length;
    for (let i = 0; i < n; i++) {
      const g = new THREE.Group(); g.position.set(sp[i].p[0], sp[i].p[1], sp[i].p[2]); body.add(g); rig.vg.push(g);
    }
    // inner organelles for cells: cytoplasm, nucleus, vacuoles, mitochondria, granules (seen through the translucent membrane)
    if (isCell) buildCellInterior(rig, design, low, collectFx);

    // parts
    const colors = design.colors;
    const q = new Q();
    const placeSurface = (list, isOutfit) => {
      list.forEach((p) => {
        const d = P.get(p.id); if (!d) return;
        if (d.slot === 'leg' || d.slot === 'arm') return;
        if ((d.slot === 'foot' || d.slot === 'hand') && p.attach) return; // placed on its limb tip
        const vi = clamp(p.v | 0, 0, n - 1);
        const sides = p.mirror ? [false, true] : [false];
        sides.forEach((mir) => {
          const g = d.build(design, p, colors);
          const holder = new THREE.Group();
          let nn = mir ? [-p.n[0], p.n[1], p.n[2]] : p.n;
          let po = [mir ? -p.o[0] : p.o[0], p.o[1], p.o[2]];
          if (isCell && d.slot === 'eye' && Math.abs(nn[1]) < 0.4) { const L = cellLift(sp[vi], po, 0.62); po = L.o; nn = L.n; } // eyes sit on the upper curve of the plump body
          partQuat(nn, mir ? -(p.rot || 0) : (p.rot || 0), isCell, q);
          holder.quaternion.copy(q);
          holder.position.set(po[0], po[1], po[2]);
          const s = p.s || 1;
          holder.scale.set(mir ? -s : s, s, s);
          holder.add(g);
          rig.vg[vi].add(holder);
          collectFx(rig, g, vi);
          if (d.slot === 'eye' && g.userData.eye) { g.userData.eyeInfo = g.userData.eye; rig.eyes.push(g); }
          if (d.slot === 'mouth' && !rig.mouth) rig.mouth = g;
          rig.parts.push({ part: p, def: d, obj: holder, mirror: mir, v: vi });
        });
      });
    };
    placeSurface(design.parts, false);
    if (design.outfit && design.outfit.length) placeSurface(design.outfit, true);

    // limbs
    lay.legs.forEach((inst) => { const l = buildLimb(rig, design, inst, rig.vg, false); rig.legs.push(l); });
    lay.arms.forEach((inst) => { const l = buildLimb(rig, design, inst, rig.vg, true); rig.arms.push(l); });
    // rest poses (root-local)
    rig.legs.forEach((l) => {
      const hx = l.hipRest.x, hz = l.hipRest.z;
      l.home.set(hx + l.side * l.len * l.splay, Math.max(0, l.hipRest.y + lay.lift - l.vert - l.ankle), hz);
      l.fp.copy(l.home);
    });
    rig.arms.forEach((l) => {
      l.home.set(l.hipRest.x + l.side * l.len * l.splay, l.hipRest.y + lay.lift - l.vert * 0.95, l.hipRest.z + l.len * 0.18);
      l.fp.copy(l.home);
    });
    rig.legs.forEach((l) => { const lat = l.len * l.splay; l.exc = Math.sqrt(Math.max(0.02, Math.pow(l.len * 0.93, 2) - l.vert * l.vert - lat * lat)); });
    assignGait(rig);

    // anim state
    const ns = { x: new Float32Array(skin.n), y: new Float32Array(skin.n), z: new Float32Array(skin.n), yaw: new Float32Array(skin.n), pitch: new Float32Array(skin.n), k: new Float32Array(skin.n).fill(1) };
    rig.a = {
      t: Math.random() * 10, G: 0, prevSpeed: 0, acc: 0, turn: 0, mv: 0, ns: ns, wobble: isCell ? new Float32Array(skin.nR) : null,
      blink: 0, nextBlink: 1 + Math.random() * 3, look: new V3(), lookInit: false, bodyQ: new Q(), bodyP: new V3(), wasAir: false, land: 0,
      slither: 0, lastAction: null, tint: 0, pivot: new V3(), swim: 0, crouch: 0, headYaw: 0, headPitch: 0, saccade: new V3(), nextSaccade: 1,
      fade: 1, deadT: 0
    };
    let px = 0, py = 0, pz = 0; sp.forEach((s) => { px += s.p[0] / n; py += s.p[1] / n; pz += s.p[2] / n; });
    rig.a.pivot.set(px, py, pz);

    // API
    rig.setTint = function (hex, k) { setTint(rig, hex, k); };
    rig.setScale = function (k) { rig.scale = k; root.scale.setScalar(k); };
    rig.setFade = function (k) { setFade(rig, k); };
    rig.dispose = function () { dispose(rig); };
    rig.root.userData.rig = rig;

    if (low) lowify(rig, tiny, opts);
    if (C.animate && C.animate.init) C.animate.init(rig);
    Object.assign(P.ctx, prevCtx);
    // settle into rest pose so first frame is valid
    if (C.animate) C.animate(rig, 0.0001, { speed: 0, turn: 0, action: null, actionT: 0, airborne: false, inWater: false });
    return rig;
  }


  // ------------------------------------------------------------------ low / tiny LOD: merge static geometry, batch limbs
  const _mm = new THREE.Matrix4(), _nm = new THREE.Matrix3(), _vv = new V3(), _nn = new V3(), _ee = new THREE.Matrix4(), _sc = new V3();
  const INKC = new THREE.Color(0x080c14);
  function newAcc() { return { pos: [], nor: [], col: [], idx: [] }; }
  function accGeo(acc, g, m, col, colAttr, back) {
    const pa = g.attributes.position, na = g.attributes.normal, ia = g.index, base = acc.pos.length / 3;
    _nm.getNormalMatrix(m);
    for (let i = 0; i < pa.count; i++) {
      _vv.fromBufferAttribute(pa, i).applyMatrix4(m); acc.pos.push(_vv.x, _vv.y, _vv.z);
      if (na) { _nn.fromBufferAttribute(na, i).applyMatrix3(_nm).normalize(); if (back) _nn.negate(); acc.nor.push(_nn.x, _nn.y, _nn.z); } else acc.nor.push(0, 1, 0);
      if (colAttr) acc.col.push(colAttr.getX(i), colAttr.getY(i), colAttr.getZ(i)); else acc.col.push(col.r, col.g, col.b);
    }
    const flip = (m.determinant() < 0) !== !!back;
    const nIdx = ia ? ia.count : pa.count;
    for (let i = 0; i < nIdx; i += 3) {
      const a = (ia ? ia.getX(i) : i) + base, b = (ia ? ia.getX(i + 1) : i + 1) + base, c = (ia ? ia.getX(i + 2) : i + 2) + base;
      if (flip) acc.idx.push(a, c, b); else acc.idx.push(a, b, c);
    }
  }
  function accToMesh(acc, material, name, shadows) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(acc.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(acc.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(acc.col, 3));
    g.setIndex(acc.idx);
    g.computeBoundingSphere(); g.boundingSphere.radius += 0.5;
    const m = new THREE.Mesh(g, material);
    m.castShadow = !!shadows; m.receiveShadow = !!shadows; m.frustumCulled = false;
    if (name) m.name = name;
    return m;
  }
  function inkMaterial() { return SP.render && SP.render.outlineMaterial ? SP.render.outlineMaterial() : new THREE.MeshBasicMaterial({ color: 0x080c14, side: THREE.BackSide }); }

  // Dynamic batch: several template geometries each driven by a proxy Object3D (position/quaternion/scale).
  function makeBatch() {
    return {
      inst: [], pos: null, nor: null, geom: null,
      add(tpl, proxy, grow) { this.inst.push({ tpl: tpl, proxy: proxy, grow: grow || 0 }); },
      finish() {
        let n = 0; this.inst.forEach((i) => { i.off = n; n += i.tpl.pos.length / 3; });
        const idx = [], col = [];
        this.inst.forEach((i) => { const b = i.off; i.tpl.idx.forEach((k) => idx.push(k + b)); for (let k = 0; k < i.tpl.col.length; k++) col.push(i.tpl.col[k]); });
        this.pos = new Float32Array(n * 3); this.nor = new Float32Array(n * 3);
        const g = this.geom = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
        g.setAttribute('normal', new THREE.BufferAttribute(this.nor, 3).setUsage(THREE.DynamicDrawUsage));
        g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
        g.setIndex(idx);
        g.boundingSphere = new THREE.Sphere(new V3(0, 1, 0), 40);
        this.update();
        return g;
      },
      update() {
        const P = this.pos, N = this.nor;
        for (let k = 0; k < this.inst.length; k++) {
          const it = this.inst[k], pr = it.proxy, t = it.tpl;
          _sc.copy(pr.scale);
          if (it.grow) { _sc.x += it.grow; _sc.y += it.grow * 1.2; _sc.z += it.grow; }
          _mm.compose(pr.position, pr.quaternion, _sc);
          _ee.makeRotationFromQuaternion(pr.quaternion);
          const e = _mm.elements, r = _ee.elements, tp = t.pos, tn = t.nor, o = it.off * 3;
          for (let i = 0, c = tp.length; i < c; i += 3) {
            const x = tp[i], y = tp[i + 1], z = tp[i + 2];
            P[o + i] = e[0] * x + e[4] * y + e[8] * z + e[12]; P[o + i + 1] = e[1] * x + e[5] * y + e[9] * z + e[13]; P[o + i + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
            const nx = tn[i], ny = tn[i + 1], nz = tn[i + 2];
            N[o + i] = r[0] * nx + r[4] * ny + r[8] * nz; N[o + i + 1] = r[1] * nx + r[5] * ny + r[9] * nz; N[o + i + 2] = r[2] * nx + r[6] * ny + r[10] * nz;
          }
        }
        this.geom.attributes.position.needsUpdate = true; this.geom.attributes.normal.needsUpdate = true;
      }
    };
  }
  function tplFromAcc(acc) { return { pos: Float32Array.from(acc.pos), nor: Float32Array.from(acc.nor), col: acc.col, idx: acc.idx }; }

  function lowify(rig, tiny, opts) {
    const body = rig.body, P = SP.parts, isCell = rig.isCell, shadows = opts.shadows !== false;
    const white = toon(0xffffff, { vertexColors: true });
    root_update(rig);
    const bodyInv = new THREE.Matrix4().copy(body.matrixWorld).invert();
    const limbObjs = new Set();
    rig.legs.concat(rig.arms).forEach((l) => { limbObjs.add(l.upper); limbObjs.add(l.lower); limbObjs.add(l.hip); if (l.knee) limbObjs.add(l.knee); limbObjs.add(l.foot); });
    // CPU-animated tube bundles (flagella, cilia, lure stalks) stay live: pull them out before the static merge, re-hang them after
    const whips = rig.fx.filter((f) => f.a.type === 'whip');
    whips.forEach((f) => body.attach(f.obj));
    const accB = newAcc(), accO = newAcc();
    const gather = (obj, inv, aB, aO) => {
      obj.traverse((m) => {
        if (!m.isMesh || m.name === 'skin') return;
        if (m.name === 'outline') { if (aO) accGeo(aO, m.geometry, _mm.multiplyMatrices(inv, m.matrixWorld), INKC); return; }
        let col = m.material.color || new THREE.Color(0xffffff);
        if (m.material.emissive && m.material.emissiveIntensity > 0.2 && m.material.emissive.getHex() > 0) { col = col.clone().lerp(m.material.emissive, Math.min(0.7, 0.45 * m.material.emissiveIntensity)).multiplyScalar(1.15); } // baked glow
        accGeo(aB, m.geometry, _mm.multiplyMatrices(inv, m.matrixWorld), col, m.geometry.attributes.color || null, m.material.side === THREE.BackSide);
      });
    };
    // static parts (everything under vertebra groups) + cell organelles
    rig.vg.forEach((g) => gather(g, bodyInv, accB, accO));
    body.children.slice().forEach((c) => { if (c.isMesh && c.name !== 'skin' && !limbObjs.has(c) && c.name !== 'outline') { gather(c, bodyInv, accB, accO); body.remove(c); } });
    // limbs -> batched proxies
    const batchM = makeBatch(), batchO = makeBatch();
    rig.legs.concat(rig.arms).forEach((l) => {
      const mk = (old, ratio) => {
        const px = new THREE.Object3D(); px.scale.copy(old.scale); body.add(px); body.remove(old);
        const g = P._geo.cyl(ratio); const a = newAcc(); accGeo(a, g, new THREE.Matrix4(), new THREE.Color(l.hex));
        batchM.add(tplFromAcc(a), px, 0);
        const a2 = newAcc(); accGeo(a2, g, new THREE.Matrix4(), new THREE.Color(0x080c14));
        batchO.add(tplFromAcc(a2), px, 0.05);
        return px;
      };
      l.upper = mk(l.upper, l.ratU); l.lower = mk(l.lower, l.ratL);
      body.remove(l.hip); body.remove(l.knee || l.hip); l.hip = new THREE.Object3D(); l.knee = null;
      // tip (foot / hand)
      const h = l.foot; h.updateMatrixWorld(true);
      const hInv = new THREE.Matrix4().copy(h.matrixWorld).invert();
      const tb = newAcc(), to = newAcc(); gather(h, hInv, tb, to);
      while (h.children.length) h.remove(h.children[0]);
      if (tb.idx.length) batchM.add(tplFromAcc(tb), h, 0);
      if (to.idx.length) batchO.add(tplFromAcc(to), h, 0);
    });
    // body skin
    const sk = rig.skin;
    if (!isCell) {
      accGeo(accB, sk.geom, new THREE.Matrix4(), null, sk.geom.attributes.color);
      const oa = sk.outG, base = accO.pos.length / 3, pa = oa.attributes.position;
      for (let i = 0; i < pa.count; i++) { accO.pos.push(pa.getX(i), pa.getY(i), pa.getZ(i)); accO.nor.push(0, 1, 0); accO.col.push(0.03, 0.05, 0.08); }
      for (let i = 0; i < oa.index.count; i++) accO.idx.push(oa.index.getX(i) + base);
      sk.geom.dispose(); sk.outG.dispose(); body.remove(sk.mesh);
    }
    rig.vg.forEach((g) => { while (g.children.length) g.remove(g.children[0]); });
    rig.eyes = []; rig.mouth = null; rig.fx = whips;
    whips.forEach((f) => rig.vg[Math.min(f.vi, rig.vg.length - 1)].attach(f.obj));
    // tiny: bake limbs at rest pose into the body mesh
    if (tiny) {
      const stub = { speed: 0, turn: 0, action: null, actionT: 0, airborne: false, inWater: false };
      if (C.animate) C.animate(rig, 1e-4, stub);
      batchM.finish(); batchO.finish();
      const bake = (b, acc) => { const base = acc.pos.length / 3; for (let i = 0; i < b.pos.length; i++) { acc.pos.push(b.pos[i]); acc.nor.push(b.nor[i]); } const col = b.geom.attributes.color.array; for (let i = 0; i < col.length; i++) acc.col.push(col[i]); const ix = b.geom.index; for (let i = 0; i < ix.count; i++) acc.idx.push(ix.getX(i) + base); };
      if (rig.legs.length + rig.arms.length) { bake(batchM, accB); bake(batchO, accO); }
      batchM.geom.dispose(); batchO.geom.dispose();
      rig.legs = []; rig.arms = [];
    }
    const bodyMesh = accB.idx.length ? accToMesh(accB, white, 'merged', shadows) : null;
    if (bodyMesh) body.add(bodyMesh);
    if (opts.outline !== false && accO.idx.length) { const om = accToMesh(accO, inkMaterial(), 'outline', false); body.add(om); rig.mergedOutline = om; }
    if (isCell) { sk.mesh.remove(sk.outMesh); sk.outMesh && body.add(sk.outMesh); body.add(sk.mesh); }
    if (!tiny && (rig.legs.length || rig.arms.length)) {
      batchM.finish(); batchO.finish();
      const lm = new THREE.Mesh(batchM.geom, white); lm.frustumCulled = false; lm.castShadow = shadows; lm.name = 'limbs';
      body.add(lm);
      if (opts.outline !== false) { const lo = new THREE.Mesh(batchO.geom, inkMaterial()); lo.frustumCulled = false; lo.name = 'outline'; body.add(lo); }
      rig.lowUpdate = function () { batchM.update(); if (opts.outline !== false) batchO.update(); };
      rig._batches = [batchM, batchO];
    }
  }
  function root_update(rig) { rig.root.updateMatrixWorld(true); }

  // gait offsets + rows
  function assignGait(rig) {
    const legs = rig.legs; if (!legs.length) return;
    const zs = legs.map((l) => l.home.z).sort((a, b) => a - b);
    const rows = []; zs.forEach((z) => { if (!rows.length || z - rows[rows.length - 1] > 0.3) rows.push(z); });
    const nRows = rows.length;
    const gait = rig.stats.gait;
    legs.forEach((l, i) => {
      let row = 0; for (let k = 0; k < rows.length; k++) if (Math.abs(l.home.z - rows[k]) <= 0.3 + 1e-6) row = k;
      l.row = row;
      const left = l.side >= 0;
      let off;
      if (legs.length === 1) off = 0;
      else if (gait === 'multi') off = (row / nRows) * 0.9 + (left ? 0 : 0.5);
      else off = (left ? 0 : 0.5) + (row % 2 ? 0.5 : 0);
      if (l.side === 0) off = (row % 2) ? 0.5 : 0;
      l.off0 = off % 1;
      l.ph = l.off0;
    });
    rig.nRows = nRows;
  }

  // ------------------------------------------------------------------ materials: tint / fade
  function ownMats(rig, withOutline) {
    if (rig._mats && (!withOutline || rig._outOwned)) return;
    const map = new Map(); rig._mats = rig._mats || [];
    rig.root.traverse((o) => {
      if (!o.isMesh) return;
      const isOut = o.name === 'outline';
      if (isOut && !withOutline) return;
      if (isOut && rig._outOwned) return;
      if (!isOut && rig._ownedMain) return;
      let m = map.get(o.material);
      if (!m) {
        m = o.material.clone(); if (SP.render && SP.render.cloneRim) SP.render.cloneRim(o.material, m); m.userData = { e: o.material.emissive ? o.material.emissive.getHex() : 0, ei: o.material.emissiveIntensity, op: o.material.opacity, tr: o.material.transparent, dw: o.material.depthWrite, out: isOut };
        map.set(o.material, m); rig._mats.push(m);
      }
      o.material = m;
    });
    if (withOutline) rig._outOwned = true; else rig._ownedMain = true;
  }
  function setTint(rig, hex, k) {
    ownMats(rig, false);
    rig._tintHex = hex === undefined ? null : hex;
    rig._mats.forEach((m) => {
      if (m.userData.out || !m.emissive) return;
      if (hex === null || hex === undefined) { m.emissive.setHex(m.userData.e); m.emissiveIntensity = m.userData.ei; }
      else { m.emissive.setHex(hex); m.emissiveIntensity = k === undefined ? 0.85 : k; }
    });
    rig.tinted = hex !== null && hex !== undefined;
  }
  function setFade(rig, k) {
    if (k >= 0.999 && !rig._outOwned) return;
    ownMats(rig, true);
    rig._mats.forEach((m) => {
      m.transparent = k < 0.999 || m.userData.tr; m.opacity = m.userData.op * k;
      m.depthWrite = k >= 0.999 ? m.userData.dw : (m.userData.tr ? false : m.userData.dw);
    });
  }
  function dispose(rig) {
    if (rig.root.parent) rig.root.parent.remove(rig.root);
    rig.skin.geom.dispose(); rig.skin.outG.dispose();
    rig.root.traverse((o) => { if (o.geometry && o.geometry.userData && o.geometry.userData.own) o.geometry.dispose(); });
    rig.body.traverse((o) => { if (o.isMesh && (o.name === 'merged' || o.name === 'limbs' || (o.name === 'outline' && o.geometry && !o.geometry.userData.keep && o.parent === rig.body))) o.geometry.dispose(); });
    if (rig._mats) rig._mats.forEach((m) => m.dispose());
    rig._mats = null;
  }

  C.build = build;
  C._partQuat = partQuat;
})();
