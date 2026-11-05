/* SP.civ — shared helpers for the Civilization stage (merging static meshes, sphere maths, names). */
(function () {
  'use strict';
  const SP = window.SP = window.SP || {};
  const V3 = THREE.Vector3, M4 = THREE.Matrix4;
  const C = SP.civ = SP.civ || {};

  // ---- sphere maths ---------------------------------------------------------------------
  const _t = new V3();
  // unit tangent at `dir` pointing towards unit `to` (zero vector if antipodal/identical)
  C.tangentTo = function (dir, to, out) {
    out = out || new V3();
    out.copy(to).addScaledVector(dir, -to.dot(dir));
    const l = out.length();
    if (l < 1e-6) return out.set(0, 0, 0);
    return out.divideScalar(l);
  };
  C.angleBetween = function (a, b) { return Math.acos(Math.max(-1, Math.min(1, a.dot(b)))); };
  // move unit dir `d` along tangent `h` by angle `a` (in place); h is parallel-transported
  C.advance = function (d, h, a) {
    const c = Math.cos(a), s = Math.sin(a);
    const nx = d.x * c + h.x * s, ny = d.y * c + h.y * s, nz = d.z * c + h.z * s;
    const hx = -d.x * s + h.x * c, hy = -d.y * s + h.y * c, hz = -d.z * s + h.z * c;
    d.set(nx, ny, nz).normalize(); h.set(hx, hy, hz);
    h.addScaledVector(d, -h.dot(d)).normalize();
  };
  // rotate tangent h about up by angle a (in place)
  C.turn = function (h, up, a) {
    const c = Math.cos(a), s = Math.sin(a);
    _t.crossVectors(up, h);
    h.multiplyScalar(c).addScaledVector(_t, s).normalize();
  };
  const _bx = new V3(), _by = new V3(), _bz = new V3(), _bm = new M4();
  // orient an object: +Y = up, +Z = heading
  C.orient = function (obj, up, heading) {
    _by.copy(up); _bz.copy(heading).addScaledVector(up, -heading.dot(up));
    if (_bz.lengthSq() < 1e-8) _bz.set(1, 0, 0).addScaledVector(up, -up.x);
    _bz.normalize(); _bx.crossVectors(_by, _bz);
    _bm.makeBasis(_bx, _by, _bz); obj.quaternion.setFromRotationMatrix(_bm);
  };
  C.randomTangent = function (dir, rng) {
    const a = new V3(rng ? rng.range(-1, 1) : Math.random() - 0.5, rng ? rng.range(-1, 1) : Math.random() - 0.5, rng ? rng.range(-1, 1) : Math.random() - 0.5);
    a.addScaledVector(dir, -a.dot(dir));
    if (a.lengthSq() < 1e-6) a.set(1, 0, 0).addScaledVector(dir, -dir.x);
    return a.normalize();
  };
  C.dirFromArr = function (a) { return new V3(a[0], a[1], a[2]).normalize(); };
  C.arr = function (v) { return [+v.x.toFixed(4), +v.y.toFixed(4), +v.z.toFixed(4)]; };
  // point on the sphere at angular offset `ang` from `dir` along bearing `bearing` (angle around dir, from refTangent)
  C.offsetDir = function (dir, ref, bearing, ang, out) {
    out = out || new V3();
    const h = ref.clone(); C.turn(h, dir, bearing);
    out.copy(dir); C.advance(out, h, ang);
    return out;
  };

  // ---- geometry merging -----------------------------------------------------------------
  // merge [{geo, matrix}] into one non-indexed BufferGeometry (position+normal)
  C.mergeGeos = function (items) {
    let n = 0;
    items.forEach(function (it) { const g = it.geo; n += g.index ? g.index.count : g.attributes.position.count; });
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
    let o = 0;
    const v = new V3(), nm = new THREE.Matrix3();
    items.forEach(function (it) {
      const g = it.geo, P = g.attributes.position, N = g.attributes.normal, I = g.index;
      const cnt = I ? I.count : P.count;
      nm.getNormalMatrix(it.matrix);
      const flip = it.matrix.determinant() < 0;
      for (let k = 0; k < cnt; k += 3) {
        for (let j = 0; j < 3; j++) {
          const jj = flip ? (j === 0 ? 0 : j === 1 ? 2 : 1) : j;
          const idx = I ? I.getX(k + jj) : k + jj;
          v.fromBufferAttribute(P, idx).applyMatrix4(it.matrix);
          pos[o * 3] = v.x; pos[o * 3 + 1] = v.y; pos[o * 3 + 2] = v.z;
          if (N) { v.fromBufferAttribute(N, idx).applyMatrix3(nm).normalize(); nor[o * 3] = v.x; nor[o * 3 + 1] = v.y; nor[o * 3 + 2] = v.z; }
          o++;
        }
      }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.computeBoundingSphere(); geo.computeBoundingBox();
    return geo;
  };

  // Merge every static mesh below `roots` into one mesh per material, parented to `target`.
  // Originals are hidden (visible=false) and subtrees flagged userData.anim are left alone.
  // Returns a state; pass it back as `prev` to un-merge before re-merging.
  C.mergeStatic = function (target, roots, prev) {
    if (prev) {
      prev.hidden.forEach(function (m) { m.visible = true; });
      target.remove(prev.group);
      prev.group.traverse(function (o) { if (o.geometry) o.geometry.dispose(); });
    }
    target.updateMatrixWorld(true);
    const inv = new M4().copy(target.matrixWorld).invert();
    const buckets = new Map(), hidden = [], anims = [];
    function walk(o) {
      if (o.userData && o.userData.anim) { anims.push(o); return; }
      if (o.isMesh && o.geometry && !Array.isArray(o.material) && o.visible !== false) {
        const mat = o.material; let b = buckets.get(mat); if (!b) { b = []; buckets.set(mat, b); }
        b.push({ geo: o.geometry, matrix: new M4().multiplyMatrices(inv, o.matrixWorld) });
        hidden.push(o);
      }
      for (let i = 0; i < o.children.length; i++) walk(o.children[i]);
    }
    roots.forEach(function (r) { walk(r); });
    hidden.forEach(function (m) { m.visible = false; });
    const group = new THREE.Group(); group.name = 'merged';
    buckets.forEach(function (items, mat) {
      const mesh = new THREE.Mesh(C.mergeGeos(items), mat);
      mesh.castShadow = false; mesh.receiveShadow = false;
      if (mat.side === THREE.BackSide) mesh.renderOrder = 0;
      group.add(mesh);
    });
    target.add(group);
    return { group: group, hidden: hidden, anims: anims };
  };

  // ---- names ----------------------------------------------------------------------------
  const SYL = ['ba', 'ko', 'ri', 'zu', 'ma', 'ten', 'sol', 'vi', 'ra', 'lu', 'ne', 'dor', 'qui', 'pa', 'sha', 'mo', 'ti', 'gro', 'fen', 'ula'];
  C.word = function (rng, n) { let s = ''; for (let i = 0; i < n; i++) s += rng.pick(SYL); return s.charAt(0).toUpperCase() + s.slice(1); };
  C.TYPE_ICON = { military: '⚔️', economic: '💰', religious: '🔮' };
  C.TYPE_NAME = { military: 'Military', economic: 'Economic', religious: 'Religious' };
  C.nationName = function (rng, type) {
    const suf = { military: ['Empire', 'Legion', 'Dominion'], economic: ['Republic', 'Trading Co.', 'League'], religious: ['Theocracy', 'Order', 'Sanctum'] };
    return C.word(rng, 2) + ' ' + rng.pick(suf[type]);
  };
  C.hexStr = function (h) { return '#' + ('000000' + (h >>> 0).toString(16)).slice(-6); };
  C.fmt = function (n) { n = Math.round(n); return n >= 10000 ? (n / 1000).toFixed(1) + 'k' : String(n); };
})();
