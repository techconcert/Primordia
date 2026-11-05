#!/usr/bin/env node
// Autoplay runner: drives the in-page test rig (js/testrig, ?autoplay=1) with headless Chromium.
//   node tools/autoplay.js --seed 1 --speed 8 --until end --timeout 1800 --out /tmp/claude-0/ap_1
// --assist: when a stage blows its sim-time budget, nudge its state (flagged ASSIST in the report) so later stages still get exercised
// Options: --seed N  --runs N (seeds N..N+runs-1)  --speed 1-20  --until <stageId|end>  --stage <startStage>  --timeout <wall seconds>
//          --out <dir>  --headless (no-HUD fast mode; screenshots still taken by the runner)  --log  --width/--height  --shots <wall s between periodic shots>
// Env: BASE (default http://localhost:8099). Exit code 0 only if every run finished with zero console errors / rejections.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const opt = { seed: 1, runs: 1, speed: 8, until: 'end', stage: '', timeout: 1800, out: '', headless: false, log: false, assist: false, tribal: '', width: 1280, height: 720, shots: 180 };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (!a.startsWith('--')) continue;
  const k = a.slice(2);
  if (k === 'headless' || k === 'log' || k === 'assist') { opt[k] = true; continue; }
  const v = argv[++i];
  opt[k] = typeof opt[k] === 'number' ? Number(v) : v;
}
const BASE = process.env.BASE || 'http://localhost:8099';
if (!opt.out) opt.out = '/tmp/claude-0/ap_' + opt.seed;

async function runOne(seed, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const url = `${BASE}/?autoplay=1&seed=${seed}&speed=${opt.speed}&until=${opt.until}` + (opt.stage ? `&stage=${opt.stage}` : '') + (opt.tribal ? `&tribal=${opt.tribal}` : '') + (opt.headless ? '&headless=1' : '') + (opt.log ? '&log=1' : '') + (opt.assist ? '&assist=1' : '');
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: opt.width, height: opt.height } });
  const pageErrors = [];
  page.on('console', (m) => { if (opt.log && m.text().startsWith('[ap')) console.log(m.text()); });
  page.on('pageerror', (e) => pageErrors.push(`[pageerror] ${e.message}`));
  page.on('requestfailed', (r) => { if (!/fonts\.(googleapis|gstatic)/.test(r.url())) pageErrors.push(`[requestfailed] ${r.url()}`); });
  console.log(`[run seed ${seed}] ${url}`);
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'load' });
  let rep = null, lastSeq = -1, lastShot = 0, shotN = 0, pendingShot = 0, lastLine = '';
  const shot = async (tag) => {
    try { await page.screenshot({ path: path.join(outDir, `${String(++shotN).padStart(2, '0')}_${tag}.png`) }); } catch (e) { /* page busy */ }
  };
  const lastStagesSeen = {};
  while ((Date.now() - t0) / 1000 < opt.timeout) {
    await new Promise((r) => setTimeout(r, 1500));
    try { rep = await page.evaluate(() => (window.SP && SP.testrig && SP.testrig.report) ? { r: SP.testrig.report(), seq: SP.testrig.stageChangeSeq || 0 } : null); } catch (e) { rep = null; }
    if (!rep) continue;
    const r = rep.r;
    if ((r.stuckSeq || 0) > (runOne._ss || 0) && shotN < 40) { runOne._ss = r.stuckSeq; await shot('stuck_' + (r.currentStage || 'x')); }
    if (rep.seq !== lastSeq) { lastSeq = rep.seq; pendingShot = Date.now() + 4000; }
    if (pendingShot && Date.now() > pendingShot) { pendingShot = 0; await shot('enter_' + (r.currentStage || 'x')); lastShot = Date.now(); }
    else if ((Date.now() - lastShot) / 1000 > opt.shots) { lastShot = Date.now(); await shot('t_' + (r.currentStage || 'x')); }
    const line = `[${((Date.now() - t0) / 1000).toFixed(0)}s wall] stage=${r.currentStage} sim=${r.simSeconds}s err=${r.consoleErrors.length} goal="${r.goal}"`;
    if (line !== lastLine) { lastLine = line; if ((Date.now() - (runOne._lp || 0)) > 10000) { runOne._lp = Date.now(); console.log(line); } }
    if (r.finished || r.aborted) break;
  }
  await new Promise((r) => setTimeout(r, 1500));
  try { rep = await page.evaluate(() => ({ r: SP.testrig.report(), seq: 0 })); } catch (e) { /* keep last */ }
  await shot('final');
  await browser.close();
  const r = rep ? rep.r : { finished: false, stages: [], consoleErrors: [], unhandledRejections: [], aborted: 'no report' };
  r.assists = (r.stages || []).filter((s) => (s.notes || []).some((n) => /ASSIST: (stage budget|brainXp|captured|remaining)/.test(n))).map((s) => s.id);   // stage-level nudges (unit warps are listed in the notes only)
  r.pageErrors = pageErrors;
  r.runnerWallSeconds = +((Date.now() - t0) / 1000).toFixed(0);
  if (!r.finished && !r.aborted) r.aborted = 'runner timeout after ' + opt.timeout + 's';
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(r, null, 2));
  fs.writeFileSync(path.join(outDir, 'report.md'), md(r));
  const ok = r.finished && !r.consoleErrors.length && !r.unhandledRejections.length && !pageErrors.length;
  console.log(`[run seed ${seed}] ${ok ? 'OK' : 'FAIL'}  finished=${r.finished} sim=${r.simSeconds}s wall=${r.runnerWallSeconds}s errors=${r.consoleErrors.length} rejections=${r.unhandledRejections.length} pageErrors=${pageErrors.length}${r.aborted ? ' aborted=' + r.aborted : ''}`);
  return { ok, r };
}

function md(r) {
  const L = [];
  L.push(`# Autoplay report seed ${r.seed}`);
  L.push(`finished: **${r.finished}**${r.aborted ? ' aborted: ' + r.aborted : ''}  sim ${r.simSeconds}s  wall ${r.wallSeconds}s  speed x${r.params && r.params.speed}`);
  L.push('', '| stage | sim s | wall s | deaths | goals | stuck | done | card |', '|---|---|---|---|---|---|---|---|');
  (r.stages || []).forEach((s) => L.push(`| ${s.id} | ${s.simSeconds} | ${s.wallSeconds} | ${s.deaths} | ${s.goalsCompleted} | ${s.stuckEvents} | ${s.completed ? 'yes' : 'no'} | ${s.card || ''} |`));
  if ((r.assists || []).length) L.push('', `**ASSISTS used (stages nudged by the rig): ${r.assists.join(', ')}**`);
  L.push('', `console errors: ${r.consoleErrors.length}, rejections: ${r.unhandledRejections.length}, page errors: ${(r.pageErrors || []).length}`);
  r.consoleErrors.slice(0, 8).forEach((e) => L.push(`- [${e.stage} @${e.t}s${e.own ? ' OWN' : ''}] ${e.msg}`));
  (r.unhandledRejections || []).slice(0, 5).forEach((e) => L.push(`- [rejection ${e.stage}] ${e.msg}`));
  (r.pageErrors || []).slice(0, 5).forEach((e) => L.push(`- ${e}`));
  L.push('', '## Designs built');
  (r.designsBuilt || []).forEach((d) => L.push(`- ${d.stage}/${d.mode} "${d.name}" ${d.how || ''} cost=${d.cost} cx=${d.complexity} mouth=${d.mouth || ''} water=${d.waterClass || ''} parts=${(d.parts || []).join(',')}`));
  L.push('', '## Stage notes');
  (r.stages || []).forEach((s) => { L.push(`### ${s.id}`); (s.notes || []).slice(0, 25).forEach((n) => L.push('- ' + n)); if (s.resources) L.push('- resources: ' + JSON.stringify(s.resources)); });
  return L.join('\n') + '\n';
}

(async () => {
  let allOk = true;
  for (let i = 0; i < opt.runs; i++) {
    const seed = opt.seed + i;
    const out = opt.runs > 1 ? path.join(opt.out, 'seed_' + seed) : opt.out;
    const res = await runOne(seed, out);
    allOk = allOk && res.ok;
  }
  process.exit(allOk ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
