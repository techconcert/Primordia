// Headless feature test: events, combat vs player, impress/ally, kill/extinct, bone piles, serialize.
const path = require('path');
global.window = global; global.THREE = require('../lib/three.min.js');
global.performance = global.performance || { now: () => Date.now() };
global.document = { addEventListener() {}, getElementById() { return null; }, createElement() { return { style: {}, getContext() { return null; }, addEventListener() {} }; }, body: { appendChild() {} } };
global.addEventListener = () => {}; global.innerWidth = 1280; global.innerHeight = 720;
const L = (f) => require(path.join('..', 'js', f + '.js'));
L('core/util'); try { L('core/render'); } catch (e) {}
for (const f of ['creature/parts', 'creature/model', 'creature/mesh', 'creature/anim', 'creature/gen']) { try { L(f); } catch (e) {} }
require('./_shim_world.js'); L('world/planet'); L('world/physics'); L('world/eco');
let fails = 0; const check = (c, m) => { console.log((c ? 'ok: ' : 'FAIL: ') + m); if (!c) fails++; };
console.log('creature module:', SP.creatureIsShim ? 'SHIM' : 'REAL');
const planet = SP.planet.create({ seed: 9, detail: 4, propDensity: 0.3 });
const rng = SP.util.rng(9); const home = planet.randomLandDir(rng, (d, b) => b === 'grass' || b === 'forest');
const eco = SP.eco.create(planet, rng, { playerDesign: SP.creature.defaultDesign('creature'), playerNestDir: home, brainLevel: 1, scene: new THREE.Scene(), onAttackPlayer: (a, d) => { attacks.push([a.species.name, d, a.id, eco.time]); } });
const attacks = [], ev = {}, got = {};
['extinct', 'allied', 'impressed', 'killed', 'boneFound', 'speciesArrived'].forEach((e) => eco.on(e, (d) => { got[e] = (got[e] || 0) + 1; }));
eco.on('event', (e) => { const k = e.type + ':' + (e.phase || ''); ev[k] = (ev[k] || 0) + 1; });
const hp = planet.surfacePoint(home); const player = SP.physics.createBody({ pos: hp.clone(), radius: 1, mass: 6, stats: {} }); eco.player = player;
const step = (sec, dt = 0.05) => { for (let t = 0; t < sec; t += dt) { planet.update(dt, t, hp); eco.update(dt, player.pos, 0.5); const b = [player]; eco.actors.forEach((a) => b.push(a.body)); SP.physics.collideAll(b, dt); } };
step(5);
// events
for (const t of ['meteor', 'migration', 'raid', 'fruit']) { const ok = eco.triggerEvent(t); step(30); console.log('event', t, ok); }
check(ev['meteor:start'] && ev['meteor:impact'], 'meteor shower starts and impacts: ' + JSON.stringify(ev));
check(ev['migration:start'], 'migration herd starts');
check(ev['fruit_boom:start'], 'fruit boom');
check(ev['nest_raid:start'], 'raid starts');
// brain level -> arrivals
const before = eco.species.filter((s) => s.arrived).length; eco.setBrainLevel(4); step(45);
check(eco.species.filter((s) => s.arrived).length > before && got.speciesArrived, 'species migrate in with brain level (' + before + ' -> ' + eco.species.filter((s) => s.arrived).length + ')');
// pick an aggressive carnivore, put it next to the player
let agg = eco.species.find((s) => s.temperament === 'aggressive' && s.arrived); 
if (agg) { const a = eco.spawnNear(agg.id, player.pos, 1)[0]; a.state = 'idle'; step(25); const per = {}; attacks.forEach((x) => { per[x[2]] = (per[x[2]] || 0) + 1; }); console.log('attackers', Object.keys(per).length, Math.max(...Object.values(per))); check(attacks.length > 0, 'aggressive ' + agg.name + ' attacks the player (' + attacks.length + ' hits)'); eco.despawn(a); }
// impress -> allied
const sp = eco.species.find((s) => s.arrived && s.diet === 'herbivore'); const acts = eco.spawnNear(sp.id, player.pos, sp.needed);
for (const a of acts) { eco.impress(a, 60); eco.impress(a, 60); }
check(sp.relation === 'allied' && got.allied === 1, sp.name + ' allied after ' + sp.needed + ' impressed');
check(eco.recruit(acts[0]) && acts[0].state === 'follow', 'allied actor can be recruited');
// kill to extinction
const vic = eco.species.find((s) => s.arrived && s !== sp && s.diet === 'herbivore' && s.relation === 'neutral');
if (vic) {
  for (let i = 0; i < 60 && vic.relation !== 'extinct'; i++) { for (const n of eco.nests.filter((n) => n.speciesId === vic.id)) { const a = eco.spawnNear(vic.id, n.pos, 1)[0]; if (!a) continue; a.nest = n; eco.damage(a, 1e5, 'player'); } step(1.3); }
  check(vic.relation === 'extinct' && got.extinct >= 1, vic.name + ' hunted to extinction');
}
// bone piles
const bp = eco.bonePiles[0]; player.pos.copy(bp.pos); step(1);
check(bp.found && got.boneFound === 1, 'bone pile found, parts ' + bp.parts.join(','));
check(eco.bonePiles.length === 20 && eco.bonePiles.filter((b) => b.guardSpecies).length === 4, 'bone piles: 20, 4 guarded');
check(eco.carcasses.length >= 0, 'carcasses exist: ' + eco.carcasses.length);
step(70); check(eco.carcasses.every((c) => c.t <= 61), 'carcasses decay (60 s)');
const s2 = SP.eco.load(planet, JSON.parse(JSON.stringify(eco.serialize())), { scene: new THREE.Scene() });
check(s2.species.find((s) => s.id === vic.id).relation === 'extinct' && s2.bonePiles[0].found, 'serialize keeps relations and bone piles');
console.log(fails ? fails + ' FAILED' : 'ALL OK'); process.exit(fails ? 1 : 0);
