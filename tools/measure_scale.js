// Usage: BASE=http://localhost:8111 node tools/measure_scale.js [seed] — prints world sizes of player/species/flora in the creature stage.
const { chromium } = require('playwright');
(async () => {
  const base = process.env.BASE || 'http://localhost:8111';
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(`${base}/?stage=creature&skipintro=1&fast=1&seed=${process.argv[2] || 7}`, { waitUntil: 'load' });
  await page.waitForTimeout(6000);
  const out = await page.evaluate(() => {
    const S = SP.stages.creature, eco = S.eco, rows = [];
    const box = (root) => { root.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(root); const s = new THREE.Vector3(); b.getSize(s); return s; };
    const ps = box(S.rig.root);
    rows.push({ n: 'PLAYER', tier: '-', diet: '-', scale: +S.curScale.toFixed(2), h: +ps.y.toFixed(2), maxdim: +Math.max(ps.x, ps.y, ps.z).toFixed(2), r: +S.body.radius.toFixed(2), m: +S.body.mass.toFixed(1), stH: +S.stats.height.toFixed(2), stL: +S.stats.length.toFixed(2) });
    for (const a of eco.actors) {
      if (a.rig && a.rig.root) { const s = box(a.rig.root); rows.push({ n: a.species.name, tier: a.species.sizeTier, diet: a.species.diet, scale: +a.scale.toFixed(2), h: +s.y.toFixed(2), maxdim: +Math.max(s.x, s.y, s.z).toFixed(2), r: +a.body.radius.toFixed(2), m: +a.body.mass.toFixed(1), stH: +a.species.stats.height.toFixed(2), stL: +a.species.stats.length.toFixed(2) }); }
    }
    // species not currently spawned: build at scale 1
    const seen = new Set(rows.map((r) => r.n));
    for (const sp of eco.species) if (!seen.has(sp.name)) { const rig = SP.creature.build(sp.design, { lod: 'low' }); const s = box(rig.root); rows.push({ n: sp.name + '*', tier: sp.sizeTier, diet: sp.diet, scale: 1, h: +s.y.toFixed(2), maxdim: +Math.max(s.x, s.y, s.z).toFixed(2), r: +sp.stats.radius.toFixed(2), m: +sp.stats.mass.toFixed(1), stH: +sp.stats.height.toFixed(2), stL: +sp.stats.length.toFixed(2) }); }
    const fl = S.planet.flora, nodes = fl.nodes || [];
    const tr = nodes.filter((n) => n.type === 'tree' && n.active).map((n) => n.scale); const bu = nodes.filter((n) => n.type === 'bush' && n.active).map((n) => n.scale);
    return { rows, floraScales: { tree: [Math.min(...tr), Math.max(...tr)], bush: [Math.min(...bu), Math.max(...bu)], nTree: tr.length, nBush: bu.length }, nest: eco.homeNest && 1 };
  });
  console.table(out.rows); console.log(JSON.stringify(out.floraScales)); console.log(errs.length ? errs.join('\n') : 'no errors');
  await browser.close();
})();
