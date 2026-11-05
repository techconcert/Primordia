// Headless sanity test of the ecosystem (near + far simulation). Usage: node tests/eco_sim_test.js [seed] [minutes]
// Checks that, with no player input, populations neither explode nor collapse within the simulated time.
const path = require('path');
global.window = global; global.THREE = require('../lib/three.min.js');
global.performance = global.performance || { now: () => Date.now() };
const L = (f) => require(path.join('..', 'js', f + '.js'));
global.document = global.document || { addEventListener() {}, getElementById() { return null; }, createElement() { return { style: {}, getContext() { return null; }, addEventListener() {} }; }, body: { appendChild() {} } };
global.addEventListener = global.addEventListener || (() => {});
global.innerWidth = 1280; global.innerHeight = 720;
L('core/util');
try { L('core/render'); } catch (e) { /* shim covers it */ }
for (const f of ['creature/parts', 'creature/model', 'creature/mesh', 'creature/anim', 'creature/gen']) { try { L(f); } catch (e) { console.log('(skip ' + f + ': ' + e.message + ')'); } }
require('./_shim_world.js');
L('world/planet'); L('world/physics'); L('world/eco');
const seed = +(process.argv[2] || 5), minutes = +(process.argv[3] || 10);
let fails = 0; const check = (c, m) => { if (!c) { fails++; console.log('FAIL: ' + m); } else console.log('ok: ' + m); };

function run(label, focusFar) {
  const planet = SP.planet.create({ seed, detail: 4, propDensity: 0.3 });
  const rng = SP.util.rng(seed);
  const homeDir = planet.randomLandDir(rng, (d, b) => b === 'grass' || b === 'forest');
  const design = SP.creature.defaultDesign('creature');
  const scene = new THREE.Scene();
  const eco = SP.eco.create(planet, rng, { playerDesign: design, playerNestDir: homeDir, brainLevel: +(process.argv[4] || 4), scene, firstEventIn: 60 });
  const home = planet.surfacePoint(homeDir);
  const focus = focusFar ? home.clone().multiplyScalar(-1) : home.clone();
  const body = SP.physics.createBody({ pos: home.clone(), radius: 1, mass: 6, stats: {} }); eco.player = body;
  const evs = {}; eco.on('event', (e) => { evs[e.type + ':' + (e.phase || '')] = (evs[e.type + ':' + (e.phase || '')] || 0) + 1; });
  const hist = {}, kills = []; eco.on('killed', (k) => kills.push((k.source && k.source.species ? k.source.species.name : k.source) + '>' + k.species.name));
  let eats = 0; const ot = planet.flora.take; planet.flora.take = function (n, k) { const r = ot.call(planet.flora, n, k); eats += r; return r; };
  let ext = 0, att = 0; eco.on('extinct', () => ext++);
  const total = () => eco.nests.filter((n) => !n.isPlayer).reduce((a, n) => a + n.population, 0);
  const initial = total();
  const dt = focusFar ? 0.5 : 0.05; let t = 0, maxActors = 0, minTot = 1e9, maxTot = 0;
  const t0 = Date.now();
  while (t < minutes * 60) {
    t += dt; planet.update(dt, t, focus); eco.update(dt, focus, 0.5);
    if (!focusFar) { const bodies = []; for (const a of eco.actors) bodies.push(a.body); SP.physics.collideAll(bodies, dt); }
    maxActors = Math.max(maxActors, eco.actors.length);
    if (!focusFar && Math.floor(t * 4) % 4 === 0) for (const a of eco.actors) hist[a.state] = (hist[a.state] || 0) + 1;
    if (Math.floor(t) % 60 === 0 && Math.abs(t - Math.floor(t)) < dt / 2) {
      const tot = total(); minTot = Math.min(minTot, tot); maxTot = Math.max(maxTot, tot);
      console.log(label + ' t=' + (t / 60).toFixed(0) + 'min pop=' + tot.toFixed(1) + ' actors=' + eco.actors.length + ' species alive=' + eco.species.filter((s) => s.relation !== 'extinct').length + ' fruit=' + planet.flora.stats.fruit + ' active=' + planet.flora.stats.active);
    }
  }
  console.log(label + ' per-species: ' + eco.species.map((s) => s.name + '(' + s.sizeTier[0] + s.diet[0] + ')=' + eco.nests.filter((n) => n.speciesId === s.id).reduce((a, n) => a + n.population, 0).toFixed(1)).join(' '));
  console.log(label + ' events: ' + JSON.stringify(evs) + ' wall ' + (Date.now() - t0) + 'ms, maxActors ' + maxActors);
  console.log(label + ' state histogram ' + JSON.stringify(hist) + ' fruit eaten ' + eats + ' kills ' + kills.length + ' ' + kills.slice(0, 8).join(','));
  const fin = total();
  check(maxActors <= 40, label + ' actor budget <= 40 (max ' + maxActors + ')');
  check(fin > initial * 0.25, label + ' population did not collapse (' + initial.toFixed(1) + ' -> ' + fin.toFixed(1) + ')');
  check(fin < initial * 4 + 20, label + ' population did not explode');
  check(eco.species.filter((s) => s.relation !== 'extinct').length >= Math.ceil(eco.species.length * 0.7), label + ' no mass extinction (' + ext + ' extinct)');
  check(eco.nests.every((n) => isFinite(n.population) && n.population <= 40), label + ' all populations finite and bounded');
  const s = eco.serialize(); const e2 = SP.eco.load(planet, JSON.parse(JSON.stringify(s)), { scene: new THREE.Scene() });
  check(e2.nests.length === eco.nests.length && e2.species.length === eco.species.length, label + ' serialize/load roundtrip');
}
run('near', false);
run('far ', true);
console.log(fails ? fails + ' FAILED' : 'ALL OK');
process.exit(fails ? 1 : 0);
