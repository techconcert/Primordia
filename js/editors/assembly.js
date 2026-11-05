/* SP.assembly — building / vehicle / ship designs (ARCHITECTURE §4.13).
 * AssemblyDesign = { v:1, kind, role, name, core, parts:[{uid,id,p,n,s,rot,mirror}], colors:{base,accent,detail} }
 * Extra API used by the editor: surface(), placeMatrix(), placeOk(), prune(), reproject(), validate(), complexity(), toHex().
 */
(function () {
  'use strict';
  const SP = window.SP = window.SP || {};
  const T = THREE;

  const LIMITS = { building: 40, vehicle: 36, ship: 36 };
  let _uid = 0;
  const uid = () => 'a' + (++_uid).toString(36) + Math.floor(Math.random() * 1e4).toString(36);
  const defs = () => SP.assemblyParts;

  function toHex(c, fallback) {
    if (typeof c === 'number') return c;
    if (typeof c === 'string') { const n = parseInt(c.replace('#', ''), 16); return isNaN(n) ? (fallback || 0xffffff) : n; }
    return fallback === undefined ? 0xffffff : fallback;
  }
  function colorsOf(d) {
    const c = d.colors || {};
    return { base: toHex(c.base, 0xfffbeb), accent: toHex(c.accent, 0xf97316), detail: toHex(c.detail, 0x475569) };
  }

  // ---------------------------------------------------------------------------------
  //  placement frame
  // ---------------------------------------------------------------------------------
  const _X = new T.Vector3(), _Y = new T.Vector3(), _Z = new T.Vector3(), _m = new T.Matrix4(), _r = new T.Matrix4(), _t = new T.Matrix4(), _s = new T.Matrix4();
  // Local +Y = surface normal; +Z = world forward projected (or world up for upAlign parts on side surfaces).
  function placeMatrix(p, n, s, rot, mirror, upAlign, out) {
    out = out || new T.Matrix4();
    _Y.set(n[0], n[1], n[2]).normalize();
    if (upAlign && Math.abs(_Y.y) < 0.7) _Z.set(0, 1, 0); else _Z.set(0, 0, 1);
    _Z.addScaledVector(_Y, -_Z.dot(_Y));
    if (_Z.lengthSq() < 1e-4) { _Z.set(0, 1, 0).addScaledVector(_Y, -_Y.y); }
    _Z.normalize();
    _X.crossVectors(_Y, _Z);
    _m.makeBasis(_X, _Y, _Z);
    _r.makeRotationY(rot || 0);
    _m.multiply(_r);
    _s.makeScale(s || 1, s || 1, s || 1);
    _m.multiply(_s);
    _m.setPosition(p[0], p[1], p[2]);
    out.copy(_m);
    if (mirror) { const mx = new T.Matrix4().makeScale(-1, 1, 1); out.premultiply(mx); }
    return out;
  }
  function placeOk(def, n) {
    const y = n[1];
    switch (def && def.place) {
      case 'top': return y > 0.5;
      case 'side': return Math.abs(y) < 0.65;
      case 'bottom': return y < -0.4;
      default: return true;
    }
  }

  // ---------------------------------------------------------------------------------
  //  signed-distance surface of a design (core shape + shapes of placed parts)
  // ---------------------------------------------------------------------------------
  function sdBox(x, y, z, hx, hy, hz, r) {
    const qx = Math.abs(x) - hx, qy = Math.abs(y) - hy, qz = Math.abs(z) - hz;
    const ox = Math.max(qx, 0), oy = Math.max(qy, 0), oz = Math.max(qz, 0);
    return Math.sqrt(ox * ox + oy * oy + oz * oz) + Math.min(Math.max(qx, qy, qz), 0) - (r || 0);
  }
  function sdCyl(x, y, z, r, hh) {
    const dx = Math.sqrt(x * x + z * z) - r, dy = Math.abs(y) - hh;
    return Math.min(Math.max(dx, dy), 0) + Math.sqrt(Math.max(dx, 0) * Math.max(dx, 0) + Math.max(dy, 0) * Math.max(dy, 0));
  }
  function sdSeg(x, y, z, a, b, r) {
    const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
    const pax = x - a[0], pay = y - a[1], paz = z - a[2];
    const h = Math.max(0, Math.min(1, (pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz || 1)));
    const dx = pax - bax * h, dy = pay - bay * h, dz = paz - baz * h;
    return Math.sqrt(dx * dx + dy * dy + dz * dz) - r;
  }
  const _v = new T.Vector3(), _w = new T.Vector3();
  // compile one shape primitive under matrix M (uniform scale k) -> fn(x,y,z)
  function compileShape(sh, M, k) {
    const c = sh.c || [0, 0, 0];
    if (sh.t === 'sph') {
      const cc = _v.set(c[0], c[1], c[2]).applyMatrix4(M); const cx = cc.x, cy = cc.y, cz = cc.z, r = sh.r * k;
      return function (x, y, z) { const dx = x - cx, dy = y - cy, dz = z - cz; return Math.sqrt(dx * dx + dy * dy + dz * dz) - r; };
    }
    if (sh.t === 'cap') {
      const a = _v.set(sh.a[0], sh.a[1], sh.a[2]).applyMatrix4(M).toArray(), b = _w.set(sh.b[0], sh.b[1], sh.b[2]).applyMatrix4(M).toArray(), r = sh.r * k;
      return function (x, y, z) { return sdSeg(x, y, z, a, b, r); };
    }
    const inv = M.clone().invert(); const e = inv.elements;
    if (sh.t === 'cyl') {
      return function (x, y, z) {
        const lx = e[0] * x + e[4] * y + e[8] * z + e[12] - c[0], ly = e[1] * x + e[5] * y + e[9] * z + e[13] - c[1], lz = e[2] * x + e[6] * y + e[10] * z + e[14] - c[2];
        return sdCyl(lx, ly, lz, sh.r, sh.hh) * k;
      };
    }
    // box
    const h = sh.h, rr = sh.r || 0;
    return function (x, y, z) {
      const lx = e[0] * x + e[4] * y + e[8] * z + e[12] - c[0], ly = e[1] * x + e[5] * y + e[9] * z + e[13] - c[1], lz = e[2] * x + e[6] * y + e[10] * z + e[14] - c[2];
      return sdBox(lx, ly, lz, h[0], h[1], h[2], rr) * k;
    };
  }

  const GROUND = { t: 'cyl', c: [0, -0.19, 0], r: 5.5, hh: 0.21 };
  // surface(design, excludeUid) -> { sdf, raycast, closest, normal }
  function surface(d, excludeUid) {
    const fns = [];
    const cd = defs() && defs().get(d.core);
    const I = new T.Matrix4();
    if (cd && cd.shape) cd.shape.forEach(function (sh) { fns.push(compileShape(sh, I, 1)); });
    if (d.kind === 'building') fns.push(compileShape(GROUND, I, 1));
    (d.parts || []).forEach(function (pt) {
      if (pt.uid === excludeUid) return;
      const pd = defs().get(pt.id);
      if (!pd || !pd.shape) return;
      const M = placeMatrix(pt.p, pt.n, pt.s, pt.rot, false, pd.upAlign);
      pd.shape.forEach(function (sh) { fns.push(compileShape(sh, M, pt.s || 1)); });
      if (pt.mirror) {
        const M2 = placeMatrix(pt.p, pt.n, pt.s, pt.rot, true, pd.upAlign);
        pd.shape.forEach(function (sh) { fns.push(compileShape(sh, M2, pt.s || 1)); });
      }
    });
    const n = fns.length;
    function sdf(x, y, z) { let m = 1e9; for (let i = 0; i < n; i++) { const v = fns[i](x, y, z); if (v < m) m = v; } return m; }
    const E = 0.004;
    function normal(x, y, z) {
      const nx = sdf(x + E, y, z) - sdf(x - E, y, z), ny = sdf(x, y + E, z) - sdf(x, y - E, z), nz = sdf(x, y, z + E) - sdf(x, y, z - E);
      const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      return [nx / l, ny / l, nz / l];
    }
    function raycast(ox, oy, oz, dx, dy, dz, tmax) {
      let t = 0; tmax = tmax || 80;
      if (sdf(ox, oy, oz) < 0) return null;
      for (let i = 0; i < 160; i++) {
        const x = ox + dx * t, y = oy + dy * t, z = oz + dz * t;
        const dist = sdf(x, y, z);
        if (dist < 0.003) return { t: t, p: [x, y, z], n: normal(x, y, z) };
        t += Math.max(dist * 0.95, 0.003);
        if (t > tmax) return null;
      }
      return null;
    }
    function closest(x, y, z) {
      let px = x, py = y, pz = z;
      for (let i = 0; i < 8; i++) {
        const dist = sdf(px, py, pz); const g = normal(px, py, pz);
        px -= g[0] * dist; py -= g[1] * dist; pz -= g[2] * dist;
        if (Math.abs(dist) < 0.001) break;
      }
      return { p: [px, py, pz], n: normal(px, py, pz), d: Math.abs(sdf(x, y, z)) };
    }
    return { sdf: sdf, raycast: raycast, closest: closest, normal: normal, count: n };
  }

  // ---------------------------------------------------------------------------------
  //  design model
  // ---------------------------------------------------------------------------------
  function clone(d) { return JSON.parse(JSON.stringify(d)); }

  function addPart(d, id, ox, oy, oz, dx, dy, dz, o) {
    o = o || {};
    const pd = defs().get(id); if (!pd) return null;
    const sf = surface(d);
    const l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    const h = sf.raycast(ox, oy, oz, dx / l, dy / l, dz / l, 60);
    if (!h || !placeOk(pd, h.n)) return null;
    const centred = Math.abs(h.p[0]) < 0.12;
    const part = { uid: uid(), id: id, p: h.p.map(function (v) { return Math.round(v * 1000) / 1000; }), n: h.n.map(function (v) { return Math.round(v * 1000) / 1000; }), s: o.s || 1, rot: o.rot || 0, mirror: centred ? false : o.mirror !== false && o.mirror !== undefined ? !!o.mirror : false };
    if (centred) part.p[0] = 0;
    d.parts.push(part);
    return part;
  }

  const DEFAULT_COLORS = {
    house: { base: 0xfffbeb, accent: 0xf43f5e, detail: 0x92400e }, cityhall: { base: 0xfffbeb, accent: 0x38bdf8, detail: 0xeab308 },
    factory: { base: 0x94a3b8, accent: 0xf97316, detail: 0x475569 }, entertainment: { base: 0xec4899, accent: 0xeab308, detail: 0xa855f7 },
    land: { base: 0x22c55e, accent: 0xeab308, detail: 0x1e293b }, sea: { base: 0x38bdf8, accent: 0xfffbeb, detail: 0x475569 },
    air: { base: 0xf43f5e, accent: 0xfffbeb, detail: 0x475569 }, ship: { base: 0xa855f7, accent: 0x22d3ee, detail: 0x475569 }
  };
  const DEFAULT_CORE = { house: 'b_core_cottage', cityhall: 'b_core_hall', factory: 'b_core_shed', entertainment: 'b_core_bigtop', land: 'v_core_buggy', sea: 'v_core_boat', air: 'v_core_jet', ship: 's_core_dart' };

  function defaultDesign(kind, role) {
    kind = kind || 'building';
    if (!role) role = kind === 'building' ? 'house' : kind === 'vehicle' ? 'land' : 'ship';
    const d = { v: 1, kind: kind, role: role, name: '', core: DEFAULT_CORE[role], parts: [], colors: Object.assign({}, DEFAULT_COLORS[role]) };
    d.name = ({ house: 'My House', cityhall: 'My City Hall', factory: 'My Factory', entertainment: 'My Theatre', land: 'My Rover', sea: 'My Boat', air: 'My Flyer', ship: 'My Starship' })[role];
    const add = function () { return addPart.apply(null, [d].concat([].slice.call(arguments))); };
    switch (role) {
      case 'house':
        add('b_roof_gable', 0, 10, 0, 0, -1, 0);
        add('b_door_wood', 10, 0.8, 0.0, -1, 0, 0, { s: 1 }); d.parts.forEach(function (p) { if (p.id === 'b_door_wood') { p.mirror = false; } });
        add('b_win_square', 10, 1.3, 1.0, -1, 0, 0, { mirror: true });
        add('b_chimney', 0, 10, 1.2, 0, -1, 0);
        break;
      case 'cityhall':
        add('b_roof_dome', 0, 10, 0, 0, -1, 0, { s: 1.5 });
        add('b_door_double', 0, 1.2, 10, 0, 0, -1);
        add('b_win_arch', 2.2, 1.6, 10, 0, 0, -1, { mirror: true });
        add('b_tower_round', 4.2, 10, 0.5, 0, -1, 0, { mirror: true });
        add('b_clock', 0, 2.5, 10, 0, 0, -1);
        break;
      case 'factory':
        add('b_roof_sawtooth', 0, 10, 0, 0, -1, 0);
        add('b_door_gate', 0.0, 1.0, 10, 0, 0, -1);
        add('b_stack', 2, 10, 1, 0, -1, 0);
        add('b_win_wide', 10, 1.4, 0.0, -1, 0, 0);
        break;
      case 'entertainment':
        add('b_flag', 0, 10, 0, 0, -1, 0);
        add('b_sign_neon', 3, 1.2, 10, -0.2, 0, -1);
        add('b_lamp', 2.4, 10, 2.4, 0, -1, 0, { mirror: true });
        break;
      case 'land':
        add('v_wheel_small', 10, 0.65, 1.2, -1, 0, 0, { mirror: true }); add('v_wheel_small', 10, 0.65, -1.2, -1, 0, 0, { mirror: true });
        add('v_gun', 0, 10, 0.9, 0, -1, 0); add('v_light', 0.6, 0.7, 10, 0, 0, -1, { mirror: true });
        break;
      case 'sea':
        add('v_prop_boat', 0, 0.5, -10, 0, 0, 1); add('v_gun', 0, 10, 0.4, 0, -1, 0);
        break;
      case 'air':
        add('v_wing_swept', 10, 1, -0.2, -1, 0, 0, { mirror: true }); add('v_tailfin', 0, 10, -1.0, 0, -1, 0);
        add('v_cockpit', 0, 10, 0.9, 0, -1, 0); add('v_jet', 0, 1, -10, 0, 0, 1);
        break;
      default:
        add('s_eng_small', 0.5, 0, -10, 0, 0, 1, { mirror: true }); add('s_wing_delta', 10, 0, -0.4, -1, 0, 0, { mirror: true });
        add('s_antenna', 0, 10, 0, 0, -1, 0);
    }
    return d;
  }

  function cost(d) {
    const dd = defs(); const cd = dd.get(d.core); let c = cd ? cd.cost : 0;
    (d.parts || []).forEach(function (pt) { const pd = dd.get(pt.id); if (pd) c += pd.cost * (pt.mirror ? 2 : 1); });
    return c;
  }
  const STAT_KEYS = ['power', 'speed', 'health', 'defense', 'energy', 'range', 'capacity', 'happiness', 'production'];
  function stats(d) {
    const dd = defs(); const cd = dd.get(d.core);
    const out = { cost: 0 };
    STAT_KEYS.forEach(function (k) { out[k] = 0; });
    if (cd) STAT_KEYS.forEach(function (k) { out[k] += cd.stats[k] || 0; });
    let count = 0, military = 0, economic = 0, religious = 0;
    (d.parts || []).forEach(function (pt) {
      const pd = dd.get(pt.id); if (!pd) return;
      const m = pt.mirror ? 2 : 1; count += m;
      STAT_KEYS.forEach(function (k) { out[k] += (pd.stats[k] || 0) * m; });
      if (pd.stats.power) { if (pd.id === 'v_sales') economic += pd.stats.power * m; else if (pd.id === 'v_preacher') religious += pd.stats.power * m; else military += pd.stats.power * m; }
    });
    out.cost = cost(d);
    out.parts = count; out.maxParts = LIMITS[d.kind] || 36;
    out.powerKind = d.kind === 'vehicle' ? (religious > military && religious >= economic ? 'religious' : economic > military ? 'economic' : 'military') : null;
    out.speed = Math.max(0, out.speed); out.health = Math.max(0, out.health);
    out.energy = d.kind === 'ship' ? Math.max(0, out.energy) : out.energy;
    return out;
  }
  function complexity(d) { const s = stats(d); return { value: s.parts, max: s.maxParts }; }

  function validate(d) {
    const errors = [], warnings = [], dd = defs();
    const ids = {}; (d.parts || []).forEach(function (p) { ids[p.id] = (ids[p.id] || 0) + 1; });
    const cat = function (c) { return (d.parts || []).filter(function (p) { const pd = dd.get(p.id); return pd && pd.category === c; }).reduce(function (a, p) { return a + (p.mirror ? 2 : 1); }, 0); };
    if (!dd.get(d.core)) errors.push('Pick a core first.');
    const c = complexity(d);
    if (c.value > c.max) errors.push('Too many parts (' + c.value + '/' + c.max + ').');
    if (d.kind === 'vehicle') {
      if (d.role === 'land' && cat('wheels') < 2) errors.push('A land vehicle needs at least two wheels, treads or hover pads.');
      if (d.role === 'sea' && !(ids.v_prop_boat || ids.v_outboard || ids.v_jet)) errors.push('A boat needs a propeller, outboard motor or jet.');
      if (d.role === 'air' && !(ids.v_rotor || ids.v_jet)) errors.push('Aircraft need a rotor or a jet engine.');
      if (stats(d).power <= 0) warnings.push('No weapon, sales dish or holo dome: this vehicle has no power.');
    } else if (d.kind === 'ship') {
      if (cat('engines') < 1) errors.push('A ship needs at least one engine.');
      if (stats(d).power <= 0) warnings.push('Unarmed ships are defenceless.');
    } else if (d.kind === 'building') {
      if (!(ids.b_door_wood || ids.b_door_double || ids.b_door_gate)) warnings.push('No door: citizens cannot get in.');
    }
    return { ok: errors.length === 0, errors: errors, warnings: warnings };
  }

  // Snap parts back onto the surface after the core changed / a shape part was removed.
  // Returns the uids that were dropped because nothing is near them any more.
  function reproject(d, snapDist) {
    snapDist = snapDist || 1.2;
    const dropped = [];
    const parts = d.parts.slice();
    d.parts.length = 0;
    parts.forEach(function (pt) {
      const sf = surface(d);
      const c = sf.closest(pt.p[0], pt.p[1], pt.p[2]);
      if (c.d > snapDist) { dropped.push(pt.uid); return; }
      pt.p = c.p; pt.n = c.n; d.parts.push(pt);
    });
    return dropped;
  }
  // Drop parts that lost their supporting surface (without moving the others).
  function prune(d, tol) {
    tol = tol || 0.35; const dropped = [];
    let changed = true;
    while (changed) {
      changed = false;
      for (let i = 0; i < d.parts.length; i++) {
        const pt = d.parts[i]; const sf = surface(d, pt.uid);
        if (Math.abs(sf.sdf(pt.p[0], pt.p[1], pt.p[2])) > tol) { dropped.push(pt.uid); d.parts.splice(i, 1); changed = true; break; }
      }
    }
    return dropped;
  }

  // ---------------------------------------------------------------------------------
  //  mesh build + animation
  // ---------------------------------------------------------------------------------
  function boundsOf(obj) {
    obj.updateMatrixWorld(true);
    const box = new T.Box3(), tmp = new T.Box3();
    (function walk(o) {
      if (o.userData && o.userData.anim && (o.userData.anim.type === 'flame' || o.userData.anim.type === 'puff')) return;
      if (o.isMesh && o.name !== 'outline' && o.geometry) {
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        tmp.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld); box.union(tmp);
      }
      for (let i = 0; i < o.children.length; i++) walk(o.children[i]);
    })(obj);
    return box;
  }

  function build(d, opts) {
    opts = opts || {};
    const dd = defs(); const colors = colorsOf(d);
    const root = new T.Group(); root.name = 'assembly';
    const holder = new T.Group(); root.add(holder);
    const objects = {};
    const cd = dd.get(d.core);
    if (d.kind === 'building') { const slab = SP.render.cel(new T.CylinderGeometry(5.5, 5.5, 0.42, 32), 0x65a30d, { outline: 0.03 }); slab.position.y = -0.19; slab.userData.ground = true; holder.add(slab); }
    if (cd) holder.add(cd.build(d, null, colors));
    const anims = [];
    (d.parts || []).forEach(function (pt) {
      const pd = dd.get(pt.id); if (!pd) return;
      const n = pt.mirror ? 2 : 1;
      const wrap = new T.Group(); objects[pt.uid] = wrap;
      for (let k = 0; k < n; k++) {
        const g = new T.Group(); g.matrixAutoUpdate = false;
        g.matrix.copy(placeMatrix(pt.p, pt.n, pt.s, pt.rot, k === 1, pd.upAlign));
        g.add(pd.build(d, pt, colors));
        wrap.add(g);
      }
      wrap.traverse(function (o) { const a = o.userData && o.userData.anim; if (a) { a.sign = pt.n[0] >= 0 ? 1 : -1; a.obj = o; a.t0 = Math.random() * 6; a.base = o.position.y; a.sc = o.scale.clone(); anims.push(a); } });
      holder.add(wrap);
    });
    const b = boundsOf(root);
    let lift = 0;
    if (d.kind === 'vehicle') lift = -b.min.y; else if (d.kind === 'ship') lift = 1.6;
    holder.position.y = lift;
    let t = 0;
    const rig = {
      root: root, design: d, stats: stats(d), lift: lift, objects: objects, bounds: b,
      dispose() { SP.render && SP.render.disposeTree && SP.render.disposeTree(root); },
      animate(dt, state) {
        state = state || {}; t += dt;
        const speed = state.speed || 0, th = state.throttle === undefined ? Math.min(1, Math.abs(speed) / 8) : state.throttle;
        for (let i = 0; i < anims.length; i++) {
          const a = anims[i], o = a.obj;
          switch (a.type) {
            case 'wheel': { const tg = a.target || o; tg.rotation.y += a.sign * speed / (a.r || 0.5) * dt; break; }
            case 'spin': { const k = a.throttle ? 0.25 + th : 1; o.rotation[a.axis || 'y'] += a.rate * k * dt * (a.sign || 1) * 1; break; }
            case 'flame': { const base = a.base2 === undefined ? (a.base2 = a.base || 0.7) : a.base2; const k = (base + (1 - base) * th) * (1 + 0.14 * Math.sin(t * 38 + a.t0)); o.scale.set(a.sc.x * (0.9 + 0.1 * k), a.sc.y * k, a.sc.z * (0.9 + 0.1 * k)); break; }
            case 'blink': o.visible = Math.sin((t + a.t0) * (a.rate || 1) * 6.283) > -0.35; break;
            case 'puff': { const f = ((t + a.t0) * (a.rate || 1) * 0.5) % 1; o.position.y = a.base + f * 0.7; o.scale.setScalar((0.5 + f * 0.8) * (1 - f * f)); break; }
            case 'wave': o.rotation.y = Math.sin((t + a.t0) * (a.rate || 3)) * 0.3; break;
          }
        }
      }
    };
    if (opts.animate) rig.animate(0, { speed: 0 });
    return rig;
  }

  // ---------------------------------------------------------------------------------
  //  random designs
  // ---------------------------------------------------------------------------------
  function generate(rng, kind, role, palette) {
    rng = rng || (SP.util && SP.util.rng ? SP.util.rng(Date.now()) : { next: Math.random, pick: function (a) { return a[Math.floor(Math.random() * a.length)]; }, range: function (a, b) { return a + Math.random() * (b - a); }, chance: function (p) { return Math.random() < p; }, int: function (a, b) { return a + Math.floor(Math.random() * (b - a + 1)); } });
    const dd = defs();
    kind = kind || 'building';
    role = role || (kind === 'building' ? rng.pick(dd.roles.building) : kind === 'vehicle' ? rng.pick(dd.roles.vehicle) : 'ship');
    const d = defaultDesign(kind, role);
    const cores = dd.cores(kind, role);
    d.core = rng.pick(cores).id; d.parts = [];
    const P = SP.render && SP.render.PALETTE ? SP.render.PALETTE : [0x22c55e, 0xf97316, 0x38bdf8, 0xa855f7, 0xf43f5e];
    if (palette && palette.base !== undefined) d.colors = { base: palette.base, accent: palette.accent, detail: palette.detail };
    else if (Array.isArray(palette) && palette.length) d.colors = { base: rng.pick(palette), accent: rng.pick(palette), detail: rng.pick(palette) };
    else d.colors = { base: rng.pick(P), accent: rng.pick(P), detail: rng.pick([0x1e293b, 0x475569, 0x92400e, 0xfffbeb]) };
    if (kind === 'building' && rng.chance(0.6)) d.colors.base = rng.pick([0xfffbeb, 0xfde68a, 0xe2e8f0, d.colors.base]);
    const f = function (cat) { return dd.forDesign(d)[cat] || []; };
    const ex = function (lo, hi) { return rng.range(lo, hi); };
    const tryAdd = function (pd, ox, oy, oz, dx, dy, dz, o) { if (pd && d.parts.length < LIMITS[kind] - 2) return addPart(d, pd.id, ox, oy, oz, dx, dy, dz, o); return null; };
    const top = function (pd, xr, zr, o) { for (let i = 0; i < 6; i++) if (tryAdd(pd, ex(-xr, xr), 12, ex(-zr, zr), 0, -1, 0, o)) return true; return false; };
    const side = function (pd, yl, yh, zr, o) { for (let i = 0; i < 6; i++) if (tryAdd(pd, 14, ex(yl, yh), ex(-zr, zr), -1, 0, 0, Object.assign({ mirror: true }, o))) return true; return false; };
    const front = function (pd, xr, yl, yh, o) { for (let i = 0; i < 6; i++) if (tryAdd(pd, ex(-xr, xr), ex(yl, yh), 14, 0, 0, -1, o)) return true; return false; };
    const back = function (pd, xr, yl, yh, o) { for (let i = 0; i < 6; i++) if (tryAdd(pd, ex(-xr, xr), ex(yl, yh), -14, 0, 0, 1, o)) return true; return false; };
    const pick = function (cat, filter) { const a = f(cat).filter(filter || function () { return true; }); return a.length ? rng.pick(a) : null; };

    if (kind === 'building') {
      top(pick('roofs'), 0.5, 0.5, { s: 1 });
      front(dd.get(role === 'factory' ? 'b_door_gate' : rng.pick(['b_door_wood', 'b_door_double'])), 0.3, 0.7, 1.3);
      const nw = rng.int(1, 3); for (let i = 0; i < nw; i++) { const w = pick('openings', function (p) { return /win/.test(p.id); }); side(w, 1, 2, 1.0, { mirror: true }); front(w, 1.3, 1.1, 2.0, { mirror: true }); }
      const extras = rng.int(2, 5);
      for (let i = 0; i < extras; i++) {
        const pd = pick(rng.pick(['structure', 'industry', 'signs', 'decor']));
        if (!pd) continue;
        if (pd.place === 'side') side(pd, 0.8, 1.6, 1.2); else top(pd, 4.2, 4.2, { mirror: rng.chance(0.5) });
      }
    } else if (kind === 'vehicle') {
      if (role === 'land') {
        const w = pick('wheels'); const zs = [-1.2, 1.2]; const nax = rng.int(2, 3);
        for (let i = 0; i < nax; i++) side(w, 0.4, 0.9, 0.1, { mirror: true }) && (d.parts[d.parts.length - 1].p[2] = nax === 2 ? zs[i] : -1.4 + i * 1.4) && null;
      } else if (role === 'sea') {
        back(pick('propulsion', function (p) { return /prop|outboard/.test(p.id); }), 0, 0.2, 0.7);
        side(pick('wheels', function (p) { return p.id === 'v_float'; }), 0.2, 0.7, 0.4, { mirror: true });
      } else {
        side(pick('wings'), 0.8, 1.2, 0.2, { mirror: true });
        if (rng.chance(0.5)) top(dd.get('v_rotor'), 0.1, 0.1); else back(dd.get('v_jet'), 0.35, 0.8, 1.2);
        top(dd.get('v_tailfin'), 0, 0.6);
      }
      for (let i = 0; i < rng.int(1, 3); i++) { const pd = pick('weapons'); if (pd) top(pd, 0.5, 1.0, { mirror: pd.sym && rng.chance(0.5) }); }
      for (let i = 0; i < rng.int(1, 3); i++) { const pd = pick(rng.pick(['armor', 'detail'])); if (!pd) continue; if (pd.place === 'side') side(pd, 0.5, 1.0, 0.8, { mirror: true }); else top(pd, 0.5, 1.0); }
    } else {
      for (let i = 0; i < rng.int(1, 2); i++) back(pick('engines'), 0.6, -0.1, 0.1, { mirror: rng.chance(0.5) });
      side(pick('wings'), -0.1, 0.1, 0.6, { mirror: true });
      for (let i = 0; i < rng.int(1, 3); i++) { const pd = pick('weapons'); if (pd) top(pd, 0.6, 1.0, { mirror: true }); }
      for (let i = 0; i < rng.int(2, 4); i++) { const pd = pick(rng.pick(['utility', 'detail', 'utility'])); if (pd) top(pd, 0.8, 1.2, { mirror: pd.sym && rng.chance(0.5) }); }
    }
    d.name = d.name || 'Random ' + role;
    return d;
  }

  SP.assembly = {
    LIMITS: LIMITS, toHex: toHex, colorsOf: colorsOf,
    defaultDesign: defaultDesign, clone: clone, stats: stats, cost: cost, complexity: complexity, validate: validate,
    build: build, generate: generate, surface: surface, placeMatrix: placeMatrix, placeOk: placeOk,
    addPart: addPart, reproject: reproject, prune: prune, boundsOf: boundsOf, newUid: uid
  };
})();
