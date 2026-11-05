/* Harness-only shim: fills in SP.creature.* functions that are missing so the editor can be tested
 * before WP2a lands. Every function is only defined if absent. Never loaded by index.html. */
(function () {
  'use strict';
  const SP = window.SP = window.SP || {};
  const T = THREE;
  const C = SP.creature = SP.creature || {};
  const rnd = () => Math.random();
  let uidn = 0;
  const uid = () => 'sp' + (++uidn);
  if (!C.defaultDesign) C.defaultDesign = function (kind) {
    kind = kind || 'creature';
    const cell = kind === 'cell';
    const d = { v: 1, kind: kind, name: 'Shimmy', spine: cell ? [{ p: [0, 0, -0.6], r: 0.7 }, { p: [0, 0, 0.5], r: 0.8 }] : [{ p: [0, 1.6, -1.2], r: 0.45 }, { p: [0, 1.7, -0.4], r: 0.75 }, { p: [0, 1.9, 0.5], r: 0.7 }, { p: [0, 2.1, 1.2], r: 0.5 }], parts: [], colors: { base: 0x22c55e, accent: 0xfffbeb, detail: 0x1e293b, pattern: 'none' }, outfit: [] };
    const jaw = SP.parts.list.find((p) => p.kind === kind && p.category === 'mouth');
    if (jaw) d.parts.push({ uid: uid(), id: jaw.id, v: d.spine.length - 1, o: [0, 0.1, 0.5], n: [0, 0, 1], s: 1, rot: 0, mirror: false });
    return d;
  };
  if (!C.clone) C.clone = (d) => JSON.parse(JSON.stringify(d));
  const get = (id) => SP.parts.get(id);
  const all = (d) => (d.parts || []).concat(d.outfit || []);
  if (!C.cost) C.cost = (d) => all(d).reduce((a, p) => { const pd = get(p.id); return a + (pd ? pd.cost : 0); }, 0);
  if (!C.complexity) C.complexity = (d) => ({ value: all(d).reduce((a, p) => { const pd = get(p.id); return a + (pd ? pd.complexity : 1); }, 0) + d.spine.length * 0.5, max: d.kind === 'cell' ? 12 : 32 });
  if (!C.validate) C.validate = (d) => {
    const e = [], w = [];
    if (!d.parts.some((p) => { const pd = get(p.id); return pd && pd.slot === 'mouth'; })) e.push('Needs a mouth to eat.');
    const c = C.complexity(d); if (c.value > c.max) e.push('Too complex!');
    if (!d.parts.some((p) => { const pd = get(p.id); return pd && pd.slot === 'eye'; })) w.push('No eyes: poor vision.');
    return { ok: !e.length, errors: e, warnings: w };
  };
  if (!C.stats) C.stats = (d) => {
    let mass = 0; d.spine.forEach((s) => { mass += 4.19 * s.r * s.r * s.r; });
    const ab = { bite: 0, charge: 0, strike: 0, spit: 0, sing: 0, dance: 0, charm: 0, pose: 0, speed: 0, sprint: 0, sneak: 0, jump: 0, glide: 0, health: 0 };
    let legs = 0, diet = 'none'; const lens = [];
    d.parts.forEach((p) => { const pd = get(p.id); if (!pd) return; const m = p.mirror ? 2 : 1; mass += pd.mass * m; Object.keys(pd.abilities || {}).forEach((k) => { ab[k] = Math.min(5, (ab[k] || 0) + pd.abilities[k] * m); });
      if (pd.slot === 'leg') { legs += m; lens.push(p.len || 1.2); } if (pd.diet) diet = pd.diet; });
    const L = lens.length ? lens.reduce((a, b) => a + b, 0) / lens.length : 0;
    const gait = d.kind === 'cell' ? 'cell' : legs === 0 ? 'slither' : legs <= 2 ? 'biped' : legs <= 4 ? 'quad' : 'multi';
    const m = mass / 6, top = d.kind === 'cell' ? 4 : (3 + 1.1 * ab.speed) * Math.pow(Math.max(0.5, L || 0.5), 0.35) * Math.pow(m, -0.25) * (gait === 'slither' ? 0.55 : 1);
    return { mass: mass, height: 2, length: 3, radius: 1.5, legs: legs, legPairs: Math.ceil(legs / 2), gait: gait, asym: 0, legLength: L, topSpeed: top, accel: top * 1.4 * Math.pow(m, -0.5), turnRate: 3.2 * Math.pow(m, -0.3) / 1.0, jumpV: ab.jump ? 4 + 1.5 * ab.jump : 2.5, glide: ab.glide, swim: 0.5, stability: mass, health: 40 + 10 * mass + 25 * ab.health, sprintMul: 1.4, sprintTime: 1.5, sprintCooldown: 10, abilities: ab, diet: diet, outfit: { social: 0, attack: 0, health: 0, gather: 0 }, thrust: top, drag: 2.5, turn: 3, ramDamage: mass };
  };
  function basis(n, rot) {
    const Y = new T.Vector3(n[0], n[1], n[2]).normalize(); const Z = new T.Vector3(0, 0, 1); Z.addScaledVector(Y, -Z.dot(Y));
    if (Z.lengthSq() < 1e-4) Z.set(0, 1, 0).addScaledVector(Y, -Y.y); Z.normalize(); const X = new T.Vector3().crossVectors(Y, Z);
    return new T.Matrix4().makeBasis(X, Y, Z).multiply(new T.Matrix4().makeRotationY(rot || 0));
  }
  if (!C.build) C.build = function (d, opts) {
    const R = SP.render, root = new T.Group(), body = new T.Group(); root.add(body);
    const st = C.stats(d), col = (k) => { const v = d.colors[k]; return typeof v === 'string' ? parseInt(v.replace('#', ''), 16) : v; };
    const cols = { base: col('base'), accent: col('accent'), detail: col('detail') };
    d.spine.forEach((s, i) => { const m = R.cel(new T.SphereGeometry(s.r, 16, 12), cols.base, { outline: 0.06 }); m.position.fromArray(s.p); body.add(m);
      if (i) { const a = new T.Vector3().fromArray(d.spine[i - 1].p), b = new T.Vector3().fromArray(s.p), r0 = d.spine[i - 1].r, r1 = s.r; const len = a.distanceTo(b);
        const cy = R.cel(new T.CylinderGeometry(r1, r0, len, 14), cols.base, { outline: 0.06 }); cy.position.copy(a).add(b).multiplyScalar(0.5); cy.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), b.clone().sub(a).normalize()); body.add(cy); } });
    const legs = [];
    all(d).forEach((p) => { const pd = get(p.id); if (!pd) return; const v = d.spine[Math.min(p.v, d.spine.length - 1)];
      for (let k = 0; k < (p.mirror ? 2 : 1); k++) {
        const g = new T.Group(); const M = basis(p.n, p.rot); const pos = new T.Vector3(v.p[0] + p.o[0], v.p[1] + p.o[1], v.p[2] + p.o[2]);
        M.multiply(new T.Matrix4().makeScale(p.s || 1, p.s || 1, p.s || 1)); M.setPosition(pos);
        if (k) M.premultiply(new T.Matrix4().makeScale(-1, 1, 1)); g.matrixAutoUpdate = false; g.matrix.copy(M);
        if (pd.slot === 'leg' || pd.slot === 'arm') { const len = p.len || 1.2; const lg = R.cel(new T.CylinderGeometry(0.12, 0.1, len, 8), cols.base, { outline: 0.08 }); lg.position.y = -len / 2; g.add(lg); }
        else { try { g.add(pd.build(d, p, cols)); } catch (e) { console.warn('part build', p.id, e.message); } }
        body.add(g); }
    });
    let lift = st.legLength || 0; if (!lift) { lift = Math.max(0.2, -Math.min.apply(null, d.spine.map((s) => s.p[1] - s.r))); }
    // shim lift: put the lowest spine surface (or leg tip) at y=0
    const low = Math.min.apply(null, d.spine.map((s) => s.p[1] - s.r)); const legLow = Math.min.apply(null, d.parts.filter((p) => { const pd = get(p.id); return pd && pd.slot === 'leg'; }).map((p) => d.spine[p.v].p[1] + p.o[1] - (p.len || 1.2)).concat([1e9]));
    body.position.y = -Math.min(low, legLow < 1e8 ? legLow : low);
    return { root: root, design: d, stats: st, body: body, legs: legs, arms: [], eyes: [], mouth: null, setTint() {}, setScale(k) { root.scale.setScalar(k); }, dispose() { R.disposeTree(root); }, _shim: true };
  };
  if (!C.animate) C.animate = function (rig, dt, s) { rig._t = (rig._t || 0) + dt; const b = rig.body; if (!b._y0) b._y0 = b.position.y; const sp = Math.abs(s.speed || 0);
    b.position.y = b._y0 + Math.abs(Math.sin(rig._t * (2 + sp))) * 0.05 * Math.min(1, sp);
    if (s.action) { const t = s.actionT || 0; b.rotation.z = Math.sin(t * 8) * 0.15; b.position.y += s.action === 'dance' ? Math.abs(Math.sin(t * 6)) * 0.4 : 0; } else b.rotation.z = 0; };
  if (!C.generate) C.generate = function (rng, o) { o = o || {}; const d = C.defaultDesign(o.kind || 'creature'); d.name = 'Gen'; d.colors.base = SP.render.PALETTE[Math.floor(rnd() * 12)];
    if (d.kind !== 'cell') { const legs = SP.parts.list.filter((p) => p.slot === 'leg' && p.kind === 'creature'); const n = 1 + Math.floor(rnd() * 3); if (legs.length) for (let i = 0; i < n; i++) d.parts.push({ uid: uid(), id: legs[Math.floor(rnd() * legs.length)].id, v: 1 + (i % 2), o: [0.7, -0.5, 0], n: [1, -0.3, 0], s: 1, rot: 0, mirror: true, len: 1.1 + rnd() * 0.5 }); }
    return d; };
})();
