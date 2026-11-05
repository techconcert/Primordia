// node tests/water_test.js  -- water / buoyancy system (DESIGN 3.6): classification, physics, breath + drowning timing, NPC escape.
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
L('world/planet'); L('world/physics'); L('world/eco');
const V3 = THREE.Vector3, C = SP.creature;
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// ---------------------------------------------------------------- designs
function addp(d, id, extra) { d.parts.push(Object.assign({ uid: 'u' + Math.random().toString(36).slice(2), id, v: 2, o: [0, 0.3, 0], n: [0, 1, 0], s: 1, rot: 0, mirror: false }, extra || {})); return d; }
const starter = () => C.defaultDesign();
const fat = () => { const d = starter(); addp(d, 'sac_float_2'); d.spine.forEach((n) => { n.r *= 1.1; }); return d; };
const finned = () => { const d = starter(); addp(d, 'tail_fluke_3', { v: 0, o: [0, 0, -0.3], n: [0, 0, -1] }); addp(d, 'arm_flipper_2', { o: [0.4, -0.15, 0.05], mirror: true, len: 0.9, bend: -0.5 }); return d; };
const heavy = () => addp(starter(), 'shell_lead_3');
const snake = () => { const d = starter(); d.parts = d.parts.filter((p) => !/leg|foot/.test(p.id)); return d; };

// ---------------------------------------------------------------- classification
const sS = C.stats(starter()), sF = C.stats(fat()), sW = C.stats(finned()), sH = C.stats(heavy());
console.log('starter', sS.waterClass, sS.density.toFixed(2), '| fat', sF.waterClass, sF.density.toFixed(2), '| finned', sW.waterClass, sW.density.toFixed(2), '| heavy', sH.waterClass, sH.density.toFixed(2));
ok(sS.waterClass === 'floater', 'default starter floats');
ok(sF.waterClass === 'floater' && sF.density < sS.density, 'air sac + fat body: lighter, floats');
ok(sW.waterClass === 'swimmer' && sW.swimSpeed > sS.swimSpeed * 3, 'fluke tail + flipper: swimmer with a much higher swim speed');
ok(sH.waterClass === 'sinker' && sH.density > 1.1 && sH.sinkRate > 0.8, 'lead shell: sinker with a sink rate');
ok(C.stats(snake()).waterClass === 'swimmer' || C.stats(snake()).swimPower >= 2, 'legless body undulates (swim power +2)');
ok(sH.breath > 10 && sS.breath > 12 && sS.breath < 40, 'breath seconds are sensible (' + sS.breath.toFixed(1) + ' / ' + sH.breath.toFixed(1) + ')');
const gilled = addp(heavy(), 'gills_frill_2', { mirror: true }), snork = addp(heavy(), 'snorkel_tube_1'), blow = addp(heavy(), 'blowhole_2');
ok(C.stats(gilled).gill > 0.9, 'gills remove most of the drain');
ok(C.stats(snork).snorkel > 0.5 && C.stats(snork).breath > sH.breath, 'snorkel: tube length + air');
ok(C.stats(blow).breath > sH.breath + 15 && C.stats(blow).breathRefill > 2, 'blowhole: lots of air, fast refill');
ok(['tail_fluke_3', 'gills_frill_2', 'snorkel_tube_1', 'blowhole_2', 'sac_float_2', 'arm_flipper_2', 'shell_lead_3'].every((id) => SP.parts.get(id) && SP.parts.get(id).kind === 'creature'), '7 new water parts are in the catalog');
{ // generator distribution: every class shows up, none dominates
  const n = { floater: 0, swimmer: 0, sinker: 0 }; const tiers = ['tiny', 'small', 'medium', 'large', 'epic'];
  for (let i = 1; i <= 300; i++) { const d = C.generate(SP.util.rng(i), { sizeTier: tiers[i % 5] }); n[C.stats(d).waterClass]++; }
  console.log('generated classes', JSON.stringify(n));
  ok(n.floater > 30 && n.swimmer > 30 && n.sinker > 30 && Math.max(n.floater, n.swimmer, n.sinker) < 200, 'generated species cover all three classes');
}
// cells keep old behaviour
ok(C.stats(C.defaultDesign('cell')).waterClass === 'swimmer' && C.stats(C.defaultDesign('cell')).breath > 500, 'cells never drown');

// ---------------------------------------------------------------- physics
const planet = SP.planet.create({ seed: 5, detail: 5, propDensity: 0.0 });
const rng = SP.util.rng(21);
function findDir(lo, hi) { for (let i = 0; i < 40000; i++) { const d = new V3(rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)).normalize(); const dep = planet.seaRadius - planet.surfaceRadius(d); if (dep >= lo && dep <= hi) return d; } return null; }
const deepDir = findDir(4.5, 7), midDir = findDir(2.8, 3.4), shallowDir = findDir(0.4, 0.6);
ok(deepDir && midDir && shallowDir, 'test planet has deep, mid and shallow water');
function body(design, dir) {
  const st = C.stats(design);
  const b = SP.physics.createBody({ pos: dir.clone().multiplyScalar(planet.seaRadius), radius: st.radius, mass: st.mass, stats: Object.assign({}, st) });
  SP.physics.place(b, planet, dir); return b;
}
const DT = 1 / 60;
function run(b, secs, ctrlFn, each) { let hp = 1, t = 0; const ctrl = { move: null, jump: false, sneak: false, sprint: false }; for (let i = 0; i < secs * 60; i++) { t += DT; if (ctrlFn) ctrlFn(ctrl, t, b); SP.physics.step(b, planet, ctrl, DT); hp -= b.drownFrac; b.drownFrac = 0; if (each) each(b, t); } return { hp, t }; }
const surfH = (b) => b.pos.length() - planet.seaRadius;

{ // floater
  const b = body(fat(), deepDir); let min = 9, max = -9;
  const r = run(b, 40, null, (bb, t) => { if (t > 3) { min = Math.min(min, surfH(bb)); max = Math.max(max, surfH(bb)); } });
  ok(b.waterState === 'floating' && b.submerged === 0 && !b.drowning && near(b.breath, b.breathMax, 1e-6), 'floater floats: state ' + b.waterState);
  ok(max - min > 0.03 && max < 0.2 && min > -b.stats.height, 'floater bobs at the surface (' + min.toFixed(2) + '..' + max.toFixed(2) + ')');
  ok(r.hp === 1, 'floater takes no damage');
  // slow paddling
  const b2 = body(fat(), deepDir); const p0 = b2.pos.clone(); run(b2, 3, (c) => { c.move = new V3(1, 0, 0).addScaledVector(b2.up, -b2.up.x); });
  ok(Math.abs(b2.speed) < b2.stats.topSpeed * 0.5, 'floater paddles slowly (' + b2.speed.toFixed(2) + ' vs top ' + b2.stats.topSpeed.toFixed(1) + ')');
}
{ // swimmer: fast at the surface, dives and surfaces, spends breath only when submerged
  const b = body(finned(), deepDir);
  run(b, 3); const mv = new V3(); let sp = 0;
  run(b, 4, (c) => { mv.copy(b.heading); c.move = mv; }, (bb, t) => { if (t > 2) sp = Math.max(sp, bb.speed); });
  ok(b.waterState === 'swimming' && sp > b.stats.swimSpeed * 0.8, 'swimmer paddles at speed (' + sp.toFixed(2) + ' of ' + b.stats.swimSpeed.toFixed(2) + ')');
  let minH = 9; run(b, 3, (c) => { c.move = null; c.sneak = true; }, (bb) => { minH = Math.min(minH, surfH(bb)); });
  ok(minH < -(b.stats.height * 0.8) && b.submerged > 0.5 && b.waterState === 'submerged', 'swimmer dives (feet ' + minH.toFixed(2) + ', state ' + b.waterState + ')');
  const br = b.breath; run(b, 5, (c) => { c.sneak = true; });
  ok(b.breath < br - 3, 'diving drains breath');
  run(b, 3, (c) => { c.sneak = false; c.jump = true; });
  ok(b.submerged === 0 && surfH(b) > -b.stats.height, 'swimmer surfaces with Space');
  run(b, 6, (c) => { c.jump = false; });
  ok(b.breath > b.breathMax * 0.95, 'breath refills at the surface');
}
{ // sinker: sinks, rests on the bottom, breath drains, drowning starts on time, damage rate, death time
  const b = body(heavy(), deepDir);
  const st = b.stats, depth = planet.seaRadius - planet.surfaceRadius(deepDir);
  let bottomT = 0, drownT = 0, dieT = 0;
  const r = run(b, 60, null, (bb, t) => { if (!bottomT && bb.onGround && bb.pos.length() - planet.surfaceRadius(bb.up) < 0.05) bottomT = t; if (!drownT && bb.drowning) drownT = t; });
  console.log('sinker: depth', depth.toFixed(1), 'reached bottom at', bottomT.toFixed(1), 's, breath', st.breath.toFixed(1), 'drowning from', drownT.toFixed(1), 's, hp left', r.hp.toFixed(2));
  ok(bottomT > 1 && bottomT < 8, 'sinker sinks to the bottom in a few seconds');
  ok(b.waterState === 'submerged' && b.onBottom, 'sinker rests on the bottom, head under');
  ok(near(drownT, st.breath, 2.0), 'drowning begins when the breath runs out (' + drownT.toFixed(1) + ' s vs ' + st.breath.toFixed(1) + ' s)');
  const dieExpected = st.breath + 1 / st.drownRate;
  ok(r.hp <= 0.05, 'a sinker left on the bottom drowns to death (hp left ' + r.hp.toFixed(2) + ')');
  // time to die
  const b2 = body(heavy(), deepDir); let hp = 1, t = 0, tDie = 0; const ctrl = {};
  while (t < 90 && hp > 0) { t += DT; SP.physics.step(b2, planet, ctrl, DT); hp -= b2.drownFrac; b2.drownFrac = 0; if (hp <= 0) tDie = t; }
  ok(near(tDie, dieExpected, 3), 'death by drowning after ~breath + 1/rate s (' + tDie.toFixed(1) + ' vs ' + dieExpected.toFixed(1) + ')');
}
{ // kicks: a sinker at mid depth can kick up to the surface in a few seconds; at the surface breath refills; kicks tire so it cannot tread water for ever
  const b = body(heavy(), midDir); run(b, 6);
  ok(b.waterState === 'submerged' && b.onBottom, 'mid-depth sinker is on the bottom');
  let surfaced = 0, brAt = 0;
  const tap = (c, t) => { c.jump = ((t * 60 | 0) % 36) < 2; };            // tap Space every 0.6 s
  run(b, 10, tap, (bb, t) => { if (!surfaced && bb.submerged < 0.3 && t > 0.5) { surfaced = t; brAt = bb.breath; } });
  ok(surfaced > 0 && surfaced < 6, 'tapping Space kicks the sinker up to the surface (' + surfaced.toFixed(1) + ' s)');
  ok(b.breathMax > 0 && brAt > 0, 'breath was not exhausted by the climb');
  const b2 = body(heavy(), midDir); run(b2, 6);
  let sank = 0; run(b2, 25, tap, (bb, t) => { if (t > 4 && !sank && bb.submerged > 0.9) sank = t; });
  ok(sank > 0 && b2.breath < b2.breathMax, 'kicks tire: the sinker cannot tread water for ever (sank again at ' + sank.toFixed(1) + ' s)');
  const b3 = body(heavy(), midDir); run(b3, 6); run(b3, 4, tap); const f1 = b3._fat; run(b3, 4);
  ok(f1 > 0.3 && b3._fat < f1, 'resting on the bottom recovers kick strength (' + f1.toFixed(2) + ' -> ' + b3._fat.toFixed(2) + ')');
}
{ // drowning damage stops once air is back
  const b = body(heavy(), deepDir); run(b, b.stats.breath + 3);
  ok(b.drowning, 'drowning flag set when out of air');
  b.pos.copy(b.up).multiplyScalar(planet.seaRadius + 1.0); b._vr = 0;   // pulled out
  run(b, 3);
  ok(!b.drowning && b.breath > 0, 'back at the surface: no longer drowning');
}
{ // wading: shallow water never drowns, everybody walks (slower)
  const b = body(heavy(), shallowDir); run(b, 4);
  ok(b.waterState === 'wading' && b.submerged === 0 && b.onGround, 'shallow water: wading on the bottom (' + b.waterState + ')');
  const mv = new V3(); const dry = body(heavy(), shallowDir); SP.physics.place(dry, planet, shallowDir);
  run(b, 3, (c) => { mv.copy(b.heading); c.move = mv; });
  ok(!b.drowning && b.breath === b.breathMax, 'wading never costs breath');
}
{ // steep floor: sinkers in deep water get stuck sliding unless they kick (physics must stay finite)
  const b = body(heavy(), deepDir); run(b, 5);
  ok(isFinite(b.pos.x) && isFinite(b.pos.y) && isFinite(b.pos.z), 'positions stay finite');
}

// ---------------------------------------------------------------- NPCs obey the same rules
{
  const scene = new THREE.Scene(); const rng2 = SP.util.rng(5);
  const home = planet.randomLandDir(rng2, (d, b) => b === 'grass' || b === 'forest');
  const eco = SP.eco.create(planet, rng2, { playerDesign: starter(), playerNestDir: home, brainLevel: 5, scene, firstEventIn: 9999 });
  const focus = planet.surfacePoint(home); eco.player = SP.physics.createBody({ pos: focus.clone(), radius: 1, mass: 6, stats: {} });
  eco.update(0.1, focus, 0.5);
  const sp = eco.species.find((s) => !s.isPlayer && s.arrived) || eco.species[0];
  Object.assign(sp.stats, C.stats(heavy()), { height: sp.stats.height, radius: sp.stats.radius, mass: sp.stats.mass });   // force a sinker species
  sp.stats.waterClass = 'sinker'; sp.stats.density = 1.25; sp.stats.sinkRate = 1.5; sp.stats.breath = 12; sp.stats.drownRate = 0.09;
  const lake = planet.surfacePoint(deepDir).multiplyScalar(1.01); eco.player.pos.copy(lake);   // actors are only simulated near the focus
  eco.update(0.1, lake, 0.5);
  const acts = eco.spawnNear(sp.id, lake, 3); ok(acts.length >= 3, 'spawned test actors');
  // drop one into the deep end far from shore -> it should try to climb out; one more in the middle of nowhere should drown and leave a carcass
  const a = acts[0]; SP.physics.place(a.body, planet, deepDir); a.hp = a.maxHp;
  let died = false, escaped = false, t = 0;
  const kills = []; eco.on('killed', (k) => kills.push(k));
  while (t < 60 && !died && !escaped) { t += 0.05; eco.update(0.05, lake, 0.5); if (a.state === 'dead') died = true; else if (t > 2 && a.body.waterState === 'dry') escaped = true; }
  console.log('NPC sinker in deep water:', died ? 'drowned at ' + t.toFixed(1) + ' s' : escaped ? 'climbed out at ' + t.toFixed(1) + ' s' : 'still in water, hp ' + (a.hp / a.maxHp).toFixed(2));
  ok(died || escaped || a.hp < a.maxHp, 'NPC sinker either climbs out or takes drowning damage');
  { // a drowned NPC counts as a death and leaves a carcass; its nest loses a member
    const d = acts[2] || acts[1]; SP.physics.place(d.body, planet, deepDir); d.body.stats.breath = 2; d.body.stats.drownRate = 0.5; d.body.stats.sinkRate = 3.0; d.body.breath = 2; d.body.breathMax = 2; d.hp = d.maxHp;
    const pop0 = d.nest ? d.nest.population : 0; let tt = 0; while (tt < 30 && d.state !== 'dead') { tt += 0.05; eco.update(0.05, lake, 0.5); }
    ok(d.state === 'dead' && kills.some((k) => k.actor === d && k.source === 'drown'), 'NPC that cannot reach air drowns (dead after ' + tt.toFixed(1) + ' s)');
    ok(eco.carcasses.some((c) => c.actor === d) && (!d.nest || d.nest.population < pop0 + 1e-9), 'drowned NPC leaves a carcass and counts as a death');
  }
  // pathing: a sinker wanderer picks land destinations and the steer test avoids lakes (no body ends submerged after a minute on land)
  const b = acts[1] || acts[0]; let wet = 0, n = 0;
  for (let i = 0; i < 1200; i++) { eco.update(0.05, focus, 0.5); if (b !== a && b.body.waterState === 'submerged') wet++; n++; }
  ok(wet < n * 0.05, 'sinker NPCs stay out of deep water while wandering (' + wet + '/' + n + ' submerged ticks)');
}

{ // pathAroundWater: a sinker walks to goals across lakes by following the shore (AUTOPLAY-F02/F04)
  const rr = SP.util && SP.util.rng ? SP.util.rng(77) : null;
  const R = rr || { range: (a, b) => a + Math.random() * (b - a) };
  const landDir = () => { for (let i = 0; i < 5000; i++) { const d = new V3(R.range(-1, 1), R.range(-1, 1), R.range(-1, 1)).normalize(); if (planet.surfaceRadius(d) > planet.seaRadius + 0.3 && planet.slopeAt(d) < 0.35) return d; } return null; };
  const crossesWater = (a, c) => { for (let i = 1; i < 30; i++) if (planet.surfaceRadius(a.clone().lerp(c, i / 30).normalize()) < planet.seaRadius - 0.6) return true; return false; };
  let tried = 0, reached = 0, wetTicks = 0, totalTicks = 0;
  for (let k = 0; k < 4000 && tried < 10; k++) {
    const a = landDir(), g = landDir(); if (!a || !g) continue;
    const ang = a.angleTo(g) * planet.radius; if (ang < 30 || ang > 80 || !crossesWater(a, g)) continue;
    tried++;
    const b = body(heavy(), a); SP.physics.place(b, planet, a);
    const goal = planet.surfacePoint(g), mv = new V3(), o1 = new V3(), o2 = new V3(), o3 = new V3(), c = { move: null, jump: false };
    let t = 0, done = false;
    while (t < 400 && !done) {
      t += DT; mv.copy(goal).sub(b.pos); mv.addScaledVector(b.up, -mv.dot(b.up)); const d = mv.length();
      if (d < 3) { done = true; break; }
      mv.multiplyScalar(1 / d);
      const dir = SP.physics.pathAroundWater(b, planet, goal, o1); let m = dir ? o2.copy(dir) : mv;
      m = SP.physics.avoidWater(b, planet, m, o3); c.move = m; c.jump = false;
      SP.physics.escapeCtrl(b, planet, c, o3);
      SP.physics.step(b, planet, c, DT); b.drownFrac = 0; if (process.env.DBG && tried==7 && Math.round(t*60)%600==0) console.log(t.toFixed(0), b._paw&&b._paw.plan&&(b._paw.plan.reached+' '+b._paw.plan.n+' '+b._paw.plan.path.length+' i'+b._paw.i), b.pos.distanceTo(goal).toFixed(1), b.speed.toFixed(2), b.waterState, b.danger, m.length().toFixed(2), b.onGround); totalTicks++; if (b.waterState === 'submerged') wetTicks++;
    }
    if (done) reached++;
    console.log('  route ' + tried + ': ' + ang.toFixed(0) + ' u, ' + (done ? 'arrived in ' + t.toFixed(0) + ' s' : 'NOT arrived, left ' + b.pos.distanceTo(goal).toFixed(0) + ' u, state ' + b.waterState + ' side ' + (b._paw && b._paw.side)));
  }
  ok(tried >= 5, 'found lake-crossing routes (' + tried + ')');
  ok(reached >= tried * 0.7, 'sinker reaches ' + reached + '/' + tried + ' goals across lakes by walking round');
  ok(wetTicks < totalTicks * 0.03, 'sinker stays out of deep water on those routes (' + wetTicks + '/' + totalTicks + ')');
}

{ // regression (user report "the creature walked over water"): no class ever WALKS in water deeper than knee height; tall legged bodies included
  const tall = (extra) => { const d = starter(); d.parts.filter((p) => /^leg/.test(p.id)).forEach((p) => { p.len = 2.2; }); if (extra) addp(d, extra); return d; };
  const cases = { 'tall floater': tall(), 'tall sinker': tall('shell_lead_3'), 'swimmer (tall legs + fluke)': addp(tall(), 'tail_fluke_3', { v: 0, o: [0, 0, -0.3], n: [0, 0, -1] }) };
  const midLo = findDir(1.1, 1.5), midHi = findDir(1.8, 2.3);
  for (const k of Object.keys(cases)) for (const dir of [midLo, midHi]) {
    if (!dir) continue;
    const b = body(cases[k], dir), H = SP.physics.bodyH(b), dep = planet.seaRadius - planet.surfaceRadius(dir);
    run(b, 4);
    const lim = Math.max(0.25, Math.min(0.6, H * 0.22));
    ok(dep <= lim || (b.waterState !== 'wading' && b.waterState !== 'dry' && b.inWater), k + ' at depth ' + dep.toFixed(2) + ' (H ' + H.toFixed(1) + ', knee ' + lim.toFixed(2) + '): state ' + b.waterState + ', inWater ' + b.inWater + ' (never wading above the knee)');
    if (b.stats.waterClass !== 'sinker') ok(b.pos.length() >= planet.seaRadius - H * 0.6 - 1e-3 || dep < lim, k + ': buoyant body sits at the surface, not on the bed');
  }
  const sh = body(cases['tall floater'], shallowDir); run(sh, 3);
  ok(sh.waterState === 'wading' && !sh.inWater && sh.onGround, 'ankle-deep water is still wading (feet on the bed)');
}

console.log(fails ? fails + ' FAILED' : 'ALL OK');
process.exit(fails ? 1 : 0);
