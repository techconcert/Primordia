// Usage: BASE=http://localhost:8111 node tools/scale_shot.js out.png [before] — lines species up next to a tree in the creature stage.
const { chromium } = require('playwright');
(async () => {
  const base = process.env.BASE || 'http://localhost:8111', out = process.argv[2] || 'scale.png', before = process.argv[3] === 'before';
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(`${base}/?stage=creature&skipintro=1&fast=1&seed=7`, { waitUntil: 'load' });
  await page.waitForTimeout(4000);
  const done = page.locator('text=Done').first(); if (await done.count()) { await done.click(); await page.waitForTimeout(12000); }
  await page.evaluate((before) => {
    const S = SP.stages.creature, eco = S.eco, pl = S.planet, V = THREE.Vector3;
    if (before) { for (const n of pl.flora.nodes) if (n.type === 'tree') n.scale = 1.25; pl.flora.rebuild(S.body.pos); S.rig.setScale(1); S.body.radius = S.stats.radius; }
    eco.update = () => {}; // freeze
    const tree = pl.flora.nodes.filter((n) => n.type === 'tree' && n.active).sort((a, b) => a.pos.distanceTo(S.body.pos) - b.pos.distanceTo(S.body.pos))[0];
    const up = tree.pos.clone().normalize(), e = new V().crossVectors(Math.abs(up.y) < 0.9 ? new V(0, 1, 0) : new V(1, 0, 0), up).normalize(), n = new V().crossVectors(up, e);
    const place = (v, d, side) => { const p = tree.pos.clone().addScaledVector(e, d).addScaledVector(n, side).normalize(); p.multiplyScalar(pl.surfaceRadius(p)); return p; };
    SP.physics.place(S.body, pl, place(0, 0, 7)); S.body.heading.copy(e);
    eco.species.forEach((sp, i) => { sp.arrived = true; const p = place(0, 4 + (i % 5) * 3.2, 2 + Math.floor(i / 5) * 5); if (!before) {} const al = eco.spawnNear(sp.id, p, 1); });
    for (const a of eco.actors) { if (a.species.isPlayer) continue; a.ai = null; a.state = 'idle'; a.body.vel.set(0, 0, 0); }
    S.cam.distance = Number(13); S.cam.faceDirection(S.body.heading, true);
    const orig = S.updateCamera; S.updateCamera = function (dt) { orig.call(S, dt); const b = S.body, c = S.camera, h = b.heading.clone(); const side = new V().crossVectors(b.up, h).normalize();
      const pos = b.pos.clone().addScaledVector(h, -Number(window.__back || 5)).addScaledVector(side, 9).addScaledVector(b.up, 4.5); c.position.copy(pos); c.up.copy(b.up); c.lookAt(b.pos.clone().addScaledVector(h, 6).addScaledVector(b.up, 2.2)); };
    window.__tree = tree.scale;
  }, before);
  await page.waitForTimeout(5000);
  await page.screenshot({ path: out });
  console.log(out, errs.length ? errs.join('\n') : 'no errors');
  await browser.close();
})();
