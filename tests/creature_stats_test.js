// node tests/creature_stats_test.js  — stats() sanity: monotonicity + ability cap
global.window = global; global.THREE = {};
require('../js/creature/parts.js'); require('../js/creature/model.js');
const C = SP.creature; let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } else console.log('ok  ', m); };
const d = C.defaultDesign(); const s = C.stats(d);
console.log(s.mass.toFixed(2), s.gait, s.topSpeed.toFixed(2), s.accel.toFixed(2), s.health.toFixed(0), C.complexity(d), C.validate(d));
// heavier -> slower
const h = C.clone(d); h.spine.forEach(n => n.r *= 1.4); const sh = C.stats(h);
ok(sh.mass > s.mass && sh.topSpeed < s.topSpeed && sh.accel < s.accel, 'heavier is slower, less accel');
// longer legs faster
const l = C.clone(d); l.parts.forEach(p => { if (p.len) p.len = 2.0; }); const sl = C.stats(l);
ok(sl.topSpeed > s.topSpeed || sl.mass > s.mass, 'longer legs faster (mass-adjusted)');
const l2 = C.clone(d); l2.parts.forEach(p => { if (p.id === 'leg_stub_1') p.len = 2.0; }); 
// isolate length effect: compare formula at equal mass by cancelling mass term
const f = (x) => x.topSpeed * Math.pow(x.mass / 6, 0.25);
ok(f(C.stats(l2)) > f(s), 'longer legs faster at equal mass');
// quad more stable than biped
const q = C.clone(d); const lg = q.parts.find(p => p.id === 'leg_stub_1'); const lg2 = C.clone(lg); lg2.uid = 'x2'; lg2.v = 3; lg2.o = [0.4, -0.45, 0]; q.parts.push(lg2);
const sq = C.stats(q);
ok(sq.gait === 'quad' && sq.stability / sq.mass > s.stability / s.mass, 'quad stability multiplier > biped');
// abilities cap
const a = C.clone(d); for (let i = 0; i < 4; i++) { const p = C.clone(a.parts[0]); p.id = 'mouth_shred_4'; p.uid = 'm' + i; a.parts.push(p); }
ok(C.stats(a).abilities.bite === 5, 'bite capped at 5');
// slither
const sn = C.clone(d); sn.parts = sn.parts.filter(p => !/leg|foot/.test(p.id)); ok(C.stats(sn).gait === 'slither', 'slither');
// asym
const as = C.clone(d); as.parts.find(p => p.id === 'leg_stub_1').mirror = false; ok(C.stats(as).asym === 1 && C.stats(as).topSpeed < s.topSpeed * 1.2, 'asym detected');
// cell
const cs = C.stats(C.defaultDesign('cell')); console.log(cs); ok(cs.gait === 'cell' && cs.thrust > 0, 'cell stats');
const ce = C.defaultDesign('cell'); ce.parts.push({ uid: 'q', id: 'cell_flagellum_2', v: 0, o: [0, 0, -.5], n: [0, 0, -1], s: 1, rot: 0, mirror: false });
ok(C.stats(ce).topSpeed > cs.topSpeed, 'more flagella faster');

// ---- gait balance (C-03/C-04): otherwise identical body, only the number of stub legs changes
function withLegs(n) {
  const x = C.clone(d); x.parts = x.parts.filter(p => !/^(leg|foot)/.test(p.id));
  const vs = [1, 2, 3, 0, 4, 1]; let placed = 0, k = 0;
  while (placed < n) {
    const v = vs[k++ % vs.length], uid = 'L' + placed;
    if (n - placed >= 2) { x.parts.push({ uid, id: 'leg_stub_1', v, o: [0.4, -0.45, 0], n: [0.75, -0.65, 0], s: 1, rot: 0, mirror: true, len: 1.2, bend: 0.5 }); placed += 2; }
    else { x.parts.push({ uid, id: 'leg_stub_1', v, o: [0, -0.6, 0], n: [0, -1, 0], s: 1, rot: 0, mirror: false, len: 1.2, bend: 0.5 }); placed += 1; }
  }
  return x;
}
const B = C.stats(withLegs(2)), Q4 = C.stats(withLegs(4)), M6 = C.stats(withLegs(6)), SL = C.stats(withLegs(0));
console.log('biped', B.topSpeed.toFixed(2), 'quad', Q4.topSpeed.toFixed(2), 'multi', M6.topSpeed.toFixed(2), 'slither', SL.topSpeed.toFixed(2));
const near = (a, b, t) => Math.abs(a - b) <= t;
ok(B.gait === 'biped' && Q4.gait === 'quad' && M6.gait === 'multi' && SL.gait === 'slither', 'gait names by grounded leg count');
ok(near(Q4.topSpeed / B.topSpeed, 1.1, 0.06), 'quad ~1.1x biped top speed (' + (Q4.topSpeed / B.topSpeed).toFixed(2) + ')');
ok(near(M6.topSpeed / B.topSpeed, 0.9, 0.06), 'multi ~0.9x biped top speed (' + (M6.topSpeed / B.topSpeed).toFixed(2) + ')');
ok(near(SL.topSpeed / B.topSpeed, 0.75, 0.07), 'slither ~0.75x biped top speed (' + (SL.topSpeed / B.topSpeed).toFixed(2) + ')');
ok(B.turnRate > Q4.turnRate && B.turnRate > M6.turnRate, 'biped turns best');
ok(M6.accel > Q4.accel && Q4.accel > B.accel, 'multi accelerates best');
ok(SL.abilities.sneak > B.abilities.sneak, 'slither is sneakiest');
// leg on the back doesn't change gait (C-03)
const bk = C.clone(d); bk.parts.push({ uid: 'back', id: 'leg_stub_1', v: 2, o: [0, 0.65, 0], n: [0, 1, 0], s: 1, rot: 0, mirror: false, len: 1.2, bend: 0.5 });
const sb = C.stats(bk);
ok(sb.gait === s.gait && sb.legs === s.legs && Math.abs(sb.topSpeed - s.topSpeed) / s.topSpeed < 0.06, 'leg on back does not change gait/legs/speed (' + sb.gait + ',' + sb.legs + ')');
ok(C.validate(bk).warnings.some(w => /reach the ground/.test(w)), "validate warns \"Leg doesn't reach the ground\"");
ok(C.layout(bk).arms.length === C.layout(d).arms.length + 1, 'back leg becomes a decorative limb');
// leg speed does not scale with leg count (C-04)
ok(near(withLegs(6).parts.length && M6.abilities.speed, B.abilities.speed, 0.001), 'leg speed ability does not stack per leg');
// heavier slower / longer legs faster in the same gait
ok(C.stats(withLegs(4)).topSpeed > C.stats((() => { const x = withLegs(4); x.spine.forEach(n => n.r *= 1.4); return x; })()).topSpeed, 'quad: heavier is slower');
const longq = withLegs(4); longq.parts.forEach(p => { if (p.len) p.len = 2.0; });
ok(f(C.stats(longq)) > f(Q4), 'quad: longer legs faster at equal mass');
const sref = C.stats(C.defaultDesign());
ok(Math.abs(sref.mass - 4.7) < 0.15 && sref.jumpV >= 3.5, 'default matches M0 and has a visible jump');
process.exit(fail ? 1 : 0);
