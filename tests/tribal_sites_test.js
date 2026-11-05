// node tests/tribal_sites_test.js -- Tribal village/rival site selection must be dry land (bug: villages spawned underwater).
const path = require('path');
global.window = global; global.THREE = require('../lib/three.min.js');
global.performance = global.performance || { now: () => Date.now() };
global.document = global.document || { addEventListener() {}, getElementById() { return null; }, createElement() { return { style: {}, getContext() { return null; }, addEventListener() {} }; }, body: { appendChild() {} } };
global.addEventListener = global.addEventListener || (() => {});
global.innerWidth = 1280; global.innerHeight = 720;
const L = (f) => require(path.join('..', 'js', f + '.js'));
L('core/util');
try { L('core/render'); } catch (e) { /* shim covers it */ }
require('./_shim_world.js');
L('world/planet'); L('stages/tribal_sites');
const S = SP.tribalSites, U = SP.util, V3 = THREE.Vector3;
const N = +(process.argv[2] || 200);
let fails = 0, worstH = 99, worstFrac = 1, minSep = 999, fallbacks = 0, t0 = Date.now();
const bad = (m) => { fails++; if (fails < 20) console.log('FAIL', m); };
for (let seed = 1; seed <= N; seed++) {
  const pl = SP.planet.create({ seed, radius: 140, detail: 6 });
  const rng = U.rng(seed + 4242);
  const z = rng.range(-1, 1), a = rng.range(0, 6.28), s = Math.sqrt(1 - z * z);
  const start = new V3(s * Math.cos(a), z, s * Math.sin(a));
  const hd = S.pickDry(pl, start, { maxR: 90 });
  const eh = S.evaluate(pl, hd);
  if (!eh.ok) fallbacks++;
  const check = (d, what) => {
    const h = pl.surfaceRadius(d) - pl.seaRadius; worstH = Math.min(worstH, h);
    if (h < S.MARGIN) bad(`seed ${seed} ${what} height ${h.toFixed(2)} < ${S.MARGIN}`);
    if (pl.isWater(d)) bad(`seed ${seed} ${what} is water`);
    // ring of radius 12: >= 85% land
    const b = S.basis(d); let land = 0; for (let i = 0; i < 16; i++) { if (pl.surfaceRadius(S.off(pl, d, b, i / 16 * 6.283, 12)) - pl.seaRadius >= 0.3) land++; }
    worstFrac = Math.min(worstFrac, land / 16);
    if (land / 16 < 0.85) bad(`seed ${seed} ${what} ring land ${land}/16`);
    // every structure offset used by buildVillage/buildRival (hut, fire, pile, totem, slots, pen, rocks) resolves to dry ground
    const R = pl.radius, base = d.clone().multiplyScalar(R);
    const offs = [[0, 0], [0, 7.5], [-7, 4], [7.5, 3.5], [-22, -11], [0, 6], [5.5, 1.5], [-5, 4]];
    for (let i = 0; i < 9; i++) { const q = 0.45 + i / 9 * 6.283; offs.push([Math.cos(q) * 13, Math.sin(q) * 13]); }
    for (let i = 0; i < 5; i++) offs.push([Math.cos(i * 1.3) * 22, Math.sin(i * 1.3) * 22]);
    offs.forEach((o) => {
      const p = base.clone().addScaledVector(b.e, o[0]).addScaledVector(b.n, o[1]);
      const fixed = S.isDry(pl, p) ? p.clone().normalize() : S.dryPoint(pl, p).normalize();
      const hh = pl.surfaceRadius(fixed) - pl.seaRadius;
      if (hh < S.PROP_MARGIN - 1e-6) bad(`seed ${seed} ${what} prop at ${o} height ${hh.toFixed(2)}`);
    });
  };
  check(hd, 'home');
  const rivals = S.pickRivals(pl, hd, rng, [], 5, 58, 42);
  if (rivals.length !== 5) bad(`seed ${seed} only ${rivals.length} rivals`);
  rivals.forEach((r, i) => { check(r, 'rival' + i); minSep = Math.min(minSep, S.arc(pl, r, hd)); });
  // saved/resumed game with a wet homeDir must be re-picked
  const wet = (() => { for (let i = 0; i < 400; i++) { const q = new V3(s * Math.cos(i), Math.cos(i * 0.37), s * Math.sin(i)).normalize(); if (pl.isWater(q)) return q; } return null; })();
  if (wet) { const hd2 = S.pickDry(pl, wet, { maxR: 90 }); if (pl.surfaceRadius(hd2) - pl.seaRadius < S.MARGIN) bad(`seed ${seed} wet resume not re-picked`); }
}
console.log(`${N} seeds: worst village height ${worstH.toFixed(2)} u, worst ring land ${(worstFrac * 100).toFixed(0)}%, closest rival-home ${minSep.toFixed(0)} u, non-strict home fallbacks ${fallbacks}, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log(fails ? 'FAILED ' + fails : 'PASS');
process.exit(fails ? 1 : 0);
