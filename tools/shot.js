// Usage: node tools/shot.js "<path-and-query>" out.png [waitMs=4000] [actions.js]
// Serves nothing itself: expects `python3 -m http.server 8080` running at the repo root
// (override with BASE=http://localhost:9000). Prints console errors/warnings and page errors.
// actions.js (optional) exports: module.exports = async (page) => { ... } run after load + wait.
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const [, , q = '/', out = 'shot.png', waitMs = '4000', actions] = process.argv;
  const base = process.env.BASE || 'http://localhost:8080';
  const url = q.startsWith('http') ? q : base + (q.startsWith('/') ? q : '/' + q);
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: Number(process.env.W || 1280), height: Number(process.env.H || 720) } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[console.${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}\n${e.stack || ''}`));
  page.on('requestfailed', (r) => errors.push(`[requestfailed] ${r.url()}`));
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(Number(waitMs));
  if (actions) {
    const fn = require(path.resolve(actions));
    await fn(page);
  }
  await page.screenshot({ path: out });
  const fps = await page.evaluate(() => (window.SP && SP.game && SP.game.fps) || null).catch(() => null);
  console.log(`screenshot: ${out}  url: ${url}  fps: ${fps}`);
  console.log(errors.length ? errors.join('\n') : 'no console errors');
  await browser.close();
})();
