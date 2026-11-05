// node tests/obstacle_test.js -- static-prop collision (sliding, trunk-only, capped footprint) + SP.physics.steerAround / freeSpot, and a perf check.
const path = require('path');
global.window = global; global.THREE = require('../lib/three.min.js');
global.performance = global.performance || { now: () => Date.now() };
const L = (f) => require(path.join('..', 'js', f + '.js'));
global.document = global.document || { addEventListener() {}, getElementById() { return null; }, createElement() { return { style: {}, getContext() { return null; }, addEventListener() {} }; }, body: { appendChild() {} } };
global.addEventListener = global.addEventListener || (() => {});
global.innerWidth = 1280; global.innerHeight = 720;
L('core/util');
try { L('core/render'); } catch (e) { /* shim covers it */ }
for (const f of ['creature/parts', 'creature/model', 'creature/mesh', 'creature/anim', 'creature/gen']) { try { L(f); } catch (e) { /* headless */ } }
require('./_shim_world.js');
L('world/planet'); L('world/physics');
const V3 = THREE.Vector3, C = SP.creature, P = SP.physics;
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const planet = SP.planet.create({ seed: 7, detail: 5 });
const cols = planet.colliders;
console.log('colliders', cols.length);
const DT = 1 / 30;
function mk(radius, dir, heading) {
  const st = C.stats(C.defaultDesign());
  const b = P.createBody({ pos: dir.clone().multiplyScalar(planet.seaRadius + 5), radius, mass: st.mass, stats: Object.assign({}, st), heading });
  P.place(b, planet, dir); return b;
}
// dense spots: directions with many colliders within 9 u
const spots = [];
for (const c of cols) { if (planet.surfaceRadius(new V3(c.x, c.y, c.z).normalize()) < planet.seaRadius + 0.5) continue; let n = 0; for (const d of cols) if ((c.x - d.x) ** 2 + (c.y - d.y) ** 2 + (c.z - d.z) ** 2 < 81) n++; if (n >= 5) spots.push({ c, n }); }
spots.sort((a, b) => b.n - a.n);
console.log('dense cluster centres', spots.length, 'max neighbours', spots[0] && spots[0].n);
ok(spots.length > 3, 'planet has dense prop clusters to test with');

// 1. footprint cap: a huge body is no wider than the cap against trunks
const big = mk(4, new V3(0, 1, 0), new V3(1, 0, 0));
ok(P.obstR(big) <= 0.55 + 1e-9, 'collision footprint capped (radius 4 -> ' + P.obstR(big).toFixed(2) + ')');

// 2. crossing test: walk to a goal 30 u away through the densest clusters, with and without steering
function walk(radius, a, goalDir, steer, T) {
  const b = mk(radius, a, null);
  const g = goalDir.clone().multiplyScalar(planet.surfaceRadius(goalDir)), ctrl = { move: new V3() }, out = new V3(), want = new V3();
  let lastD = 0, stall = 0, maxStall = 0, t = 0, last = b.pos.clone();
  const pd = 1.6;
  for (; t < T; t += DT) {
    want.copy(g).sub(b.pos); want.addScaledVector(b.up, -want.dot(b.up)); const d = want.length(); lastD = d; if (d < 2.8) break; want.multiplyScalar(1 / d);
    b._wt = (b._wt || 0) + 0; 
    if (steer) { P.steerAround(b, planet, want, out, { goal: g }); ctrl.move = out; } else ctrl.move = want;
    P.step(b, planet, ctrl, DT);
    if (process.env.TR && steer && Math.abs(t % 3) < DT) console.log(t.toFixed(0), d.toFixed(1), 'free', b._sa && b._sa.free.toFixed(1), 'blk', b._sa && b._sa.blocked, 'spd', b.speed.toFixed(2), 'bl', (b._blocked||0).toFixed(2), 'cm', b._sa && b._sa.commit);
    if (b.pos.distanceTo(last) < 0.02) { stall += DT; maxStall = Math.max(maxStall, stall); } else { stall = 0; last.copy(b.pos); }
  }
  return { arrived: t < T, t, maxStall, d: +lastD.toFixed(1), ws: b.waterState, slope: +b.slope.toFixed(2), dh: planet.surfaceRadius(b.pos.clone().normalize()) - planet.seaRadius, start0: a.toArray().map(v=>+v.toFixed(3)).join(',') };
}
const rng = SP.util.rng(5);
let tries = 0;
const res = { off: [0, 0, 0], on: [0, 0, 0] }, N = 24;
for (const sz of [0.9, 2.2]) for (let i = 0; i < N; i++) {
  const s = spots[Math.floor(rng.next() * Math.min(spots.length, 60))].c, a = new V3(s.x, s.y, s.z).normalize();
  const ax = new V3(rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)).cross(a).normalize();
  const goal = a.clone().applyAxisAngle(ax, 30 / planet.radius);
  let dry = true; for (let k = 0; k <= 12; k++) if (planet.surfaceRadius(a.clone().lerp(goal, k / 12).normalize()) < planet.seaRadius + 0.4) dry = false;
  if (!dry) { i--; if (++tries > 400) break; continue; }
  for (const steer of [false, true]) {
    const r = walk(sz, a, goal, steer, 45); if (steer && !r.arrived && process.env.DBG) console.log('fail', sz, r, 'blockedLast');
    const k = steer ? 'on' : 'off';
    res[k][0]++; if (r.arrived) res[k][1]++; res[k][2] += r.maxStall;
  }
}
console.log('crossings (n, arrived, mean max stall s): without whiskers', res.off[0], res.off[1], (res.off[2] / res.off[0]).toFixed(2), '| with', res.on[0], res.on[1], (res.on[2] / res.on[0]).toFixed(2));
ok(res.on[1] >= res.off[1], 'whisker steering arrives at least as often as pushing straight');
ok(res.on[1] / res.on[0] > 0.9, 'whisker steering gets through dense props (' + res.on[1] + '/' + res.on[0] + ')');
ok(res.on[2] < res.off[2], 'whiskers reduce stall time');

// 3. head-on into one trunk: slides past instead of stalling
{
  const c = cols.find((q) => q.r > 0.3 && q.r < 0.7 && planet.surfaceRadius(new V3(q.x, q.y, q.z).normalize()) > planet.seaRadius + 0.5); const cd = new V3(c.x, c.y, c.z).normalize();
  const ax = new V3(0, 1, 0).cross(cd).normalize(), start = cd.clone().applyAxisAngle(ax, -6 / planet.radius);
  const b = mk(2.5, start, null); b.heading.copy(new V3(c.x, c.y, c.z).sub(b.pos)).addScaledVector(b.up, 0).normalize(); b.heading.addScaledVector(b.up, -b.heading.dot(b.up)).normalize();
  const hd0 = b.heading.clone(), ctrl = { move: hd0.clone() };
  let t = 0, closest = 1e9; for (; t < 6; t += DT) { ctrl.move.copy(hd0); P.step(b, planet, ctrl, DT); closest = Math.min(closest, b.pos.distanceTo(new V3(c.x, c.y, c.z))); }
  const past = b.pos.clone().sub(start.clone().multiplyScalar(planet.radius)).dot(hd0);
  ok(closest >= c.r + P.obstR(b) - 0.25 && past > 8, 'head-on into a trunk: depenetrated and slid past (travelled ' + past.toFixed(1) + ' u)');
}

// 4. freeSpot lies outside every trunk
{
  const s = spots[0].c, g = new V3(s.x, s.y, s.z), f = P.freeSpot(planet, g, 1.4); let min = 1e9; for (const d of cols) min = Math.min(min, f.distanceTo(new V3(d.x, d.y, d.z)) - d.r);
  ok(min >= 1.3, 'freeSpot returns a point clear of all trunks (' + min.toFixed(2) + ')');
}

// 5. perf
{
  const b = mk(1, new V3(spots[0].c.x, spots[0].c.y, spots[0].c.z).normalize(), null), ctrl = { move: new V3(1, 0, 0) }, want = new V3(), out = new V3();
  const t0 = performance.now(); const n = 20000; for (let i = 0; i < n; i++) { want.copy(b.heading); P.steerAround(b, planet, want, out); ctrl.move = out; b._wt += DT; P.step(b, planet, ctrl, DT); }
  const per = (performance.now() - t0) / n; console.log('step + steerAround: ' + (per * 1000).toFixed(1) + ' us per call');
  ok(per < 0.25, 'step + steerAround costs < 0.25 ms per body');
}
console.log(fails ? 'FAILED ' + fails : 'ALL OK'); process.exit(fails ? 1 : 0);
