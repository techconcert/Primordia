/* SP.testrig — autoplay test rig core (see docs/TESTRIG.md).
 * INERT unless the URL has ?autoplay=1 (params: seed, speed 1-32, stage, until, headless, log).
 * Loaded BEFORE the stage scripts and game.js: it must wrap requestAnimationFrame before the game boots.
 * The rig drives the game's own private frame() callback with synthetic timestamps (K steps per real frame), runs the
 * bot once per step, and sends real keyboard events through SP.input. Per-stage bots live in bot_*.js and register in T.bots. */
(function () {
  'use strict';
  const SP = window.SP = window.SP || {};
  const q = new URLSearchParams(location.search);
  const on = q.get('autoplay');
  const active = !!on && on !== '0' && on !== 'false';
  const T = SP.testrig = { active: active, bots: {}, params: {} };
  if (!active) { T.report = function () { return { error: 'testrig inactive (add ?autoplay=1)' }; }; return; }

  // ------------------------------------------------------------------ params
  function num(k, d, lo, hi) { let v = parseFloat(q.get(k)); if (!isFinite(v)) v = d; return Math.max(lo, Math.min(hi, v)); }
  let seed = q.get('seed');
  if (seed === null || seed === '' || isNaN(Number(seed))) {
    seed = Math.floor(Math.random() * 1e6);
    try { const u = new URL(location.href); u.searchParams.set('seed', String(seed)); history.replaceState(null, '', u.toString()); } catch (e) { /* ignore */ }
  }
  seed = Number(seed);
  const P = T.params = {
    seed: seed, speed: Math.round(num('speed', 1, 1, 32)), stage: q.get('stage') || '', until: q.get('until') || 'end',
    headless: q.get('headless') === '1', log: q.get('log') === '1', intro: q.get('intro') === '1', cine: q.get('cine') === '1', assist: q.get('assist') === '1', ui: q.get('ui') !== '0', runs: num('runs', 1, 1, 99)
  };
  const ORDER = ['cell', 'creature', 'tribal', 'civ', 'space'];
  const T0 = performance.now();
  const wall = () => (performance.now() - T0) / 1000;

  // ------------------------------------------------------------------ report
  const R = T.R = {
    seed: seed, params: { speed: P.speed, stage: P.stage || 'cell', until: P.until, headless: P.headless },
    stages: [], assists: [], consoleErrors: [], consoleWarnings: [], unhandledRejections: [], designsBuilt: [], snapshots: [], events: [],
    finished: false, aborted: '', simSeconds: 0, wallSeconds: 0
  };
  let cur = null;     // current stage record
  function stageRec(id) {
    const r = { id: id, simSeconds: 0, wallSeconds: 0, deaths: 0, goalsCompleted: 0, stuckEvents: 0, notes: [], completed: false, card: null, resources: null, _w0: wall() };
    R.stages.push(r); return r;
  }
  T.log = function () { if (P.log) console.log.apply(console, ['[ap ' + R.simSeconds.toFixed(0) + 's]'].concat([].slice.call(arguments))); };
  T.note = function (s) { if (cur) { if (cur.notes.length < 80) cur.notes.push('@' + cur.simSeconds.toFixed(0) + 's ' + s); } R.events.length < 300 && R.events.push((cur ? cur.id : '-') + ' ' + s); T.log(s); };
  T.goal = function (s) { if (s !== T.goalText) { T.goalText = s; T.say(s); } };
  // watchable stuff: speed 1-2 and not headless means a human is probably watching
  T.watch = function () { return !P.headless && P.speed <= 2; };
  // ---- commentary caption bar
  let capEl = null, capHist = [], capT = 0;
  T.say = function (s) {
    if (!s || P.headless) return;
    if (capHist[capHist.length - 1] === s) return;
    capHist.push(s); if (capHist.length > 3) capHist.shift(); capT = 0; capDirty = true;
  };
  let capDirty = false;
  function capUpdate() {
    if (!document.body || !P.ui) return;
    if (!capEl) {
      capEl = document.createElement('div'); capEl.id = 'ap-caption';
      capEl.style.cssText = 'position:fixed;left:50%;bottom:132px;transform:translateX(-50%);z-index:99997;pointer-events:none;text-align:center;font:600 17px/1.35 Fredoka,system-ui,sans-serif;color:#fff;max-width:min(80vw,900px)';
      document.body.appendChild(capEl);
    }
    if (!capDirty) return; capDirty = false;
    capEl.innerHTML = '';
    capHist.forEach(function (t, i) {
      const d = document.createElement('div'); const last = i === capHist.length - 1;
      d.textContent = (last ? '\uD83E\uDD16 ' : '') + t;
      d.style.cssText = 'margin-top:3px;padding:' + (last ? '6px 14px' : '2px 10px') + ';border-radius:12px;display:inline-block;background:rgba(2,6,23,' + (last ? '.82' : '.45') + ');opacity:' + (last ? 1 : 0.55) + ';font-size:' + (last ? 18 : 13) + 'px;border:' + (last ? '2px solid #22d3ee' : '0');
      capEl.appendChild(d); capEl.appendChild(document.createElement('br'));
    });
  }
  // ---- world markers: a pulsing line + ring from the bot's creature to its current target (screen-space overlay)
  let mk = null, mkCv = null;
  /** from/to: THREE.Vector3-like {x,y,z} world points (from optional). label: short text */
  T.mark = function (to, label, from) { mk = to ? { to: to, label: label || '', from: from || null } : null; };
  function markDraw() {
    if (P.headless || !P.ui) return;
    if (!mkCv) { mkCv = document.createElement('canvas'); mkCv.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:99990;pointer-events:none'; document.body.appendChild(mkCv); }
    const W = window.innerWidth, H = window.innerHeight; if (mkCv.width !== W || mkCv.height !== H) { mkCv.width = W; mkCv.height = H; }
    const g = mkCv.getContext('2d'); g.clearRect(0, 0, W, H);
    const st = SP.game && SP.game.current; const cam = st && st.camera;
    if (!mk || !cam || T.manual || (SP.game && SP.game.editorOpen) || !window.THREE) return;
    const proj = function (p) { const v = new THREE.Vector3(p.x, p.y || 0, p.z); v.project(cam); return { x: (v.x * 0.5 + 0.5) * W, y: (-v.y * 0.5 + 0.5) * H, behind: v.z > 1 }; };
    const b = proj(mk.to); if (b.behind) return;
    const a = mk.from ? proj(mk.from) : null; const t = performance.now() / 1000;
    g.save(); g.lineWidth = 3; g.strokeStyle = 'rgba(34,211,238,.85)'; g.fillStyle = 'rgba(34,211,238,.9)';
    if (a && !a.behind) { g.setLineDash([10, 8]); g.lineDashOffset = -t * 40; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); g.setLineDash([]); }
    const r = 14 + 4 * Math.sin(t * 5);
    g.beginPath(); g.arc(b.x, b.y, r, 0, 6.283); g.stroke();
    g.beginPath(); g.moveTo(b.x, b.y - r - 18); g.lineTo(b.x - 9, b.y - r - 32); g.lineTo(b.x + 9, b.y - r - 32); g.closePath(); g.fill();
    if (mk.label) { g.font = '600 13px system-ui,sans-serif'; const w = g.measureText(mk.label).width + 14; g.fillStyle = 'rgba(2,6,23,.8)'; g.fillRect(b.x - w / 2, b.y - r - 54, w, 20); g.fillStyle = '#a5f3fc'; g.textAlign = 'center'; g.fillText(mk.label, b.x, b.y - r - 39); }
    g.restore();
  }
  // ---- fake cursor (used by the editor bot so viewers can see what is being picked)
  let curEl = null;
  T.cursor = {
    moveTo: function (el) {
      if (P.headless || !P.ui) return; if (!curEl) { curEl = document.createElement('div'); curEl.textContent = '\uD83D\uDC46'; curEl.style.cssText = 'position:fixed;left:50%;top:50%;z-index:99996;pointer-events:none;font-size:34px;transition:left .55s ease,top .55s ease;filter:drop-shadow(0 2px 3px #000);transform:translate(-30%,-10%)'; document.body.appendChild(curEl); }
      const r = el && el.getBoundingClientRect ? el.getBoundingClientRect() : null; if (!r) return;
      curEl.style.display = ''; curEl.style.left = (r.left + r.width / 2) + 'px'; curEl.style.top = (r.top + r.height / 2) + 'px';
      if (T._hl) { T._hl.style.outline = T._hlOld; }
      T._hl = el; T._hlOld = el.style.outline; el.style.outline = '3px solid #facc15';
    },
    hide: function () { if (curEl) curEl.style.display = 'none'; if (T._hl) { T._hl.style.outline = T._hlOld || ''; T._hl = null; } }
  };

  T.goalDone = function (s) { if (cur) cur.goalsCompleted++; T.note('goal: ' + s); };
  T.death = function () { if (cur) cur.deaths++; };
  T.stuck = function (s) { if (cur) cur.stuckEvents++; R.stuckSeq = (R.stuckSeq || 0) + 1; T.note('STUCK: ' + s); };
  T.design = function (d) { R.designsBuilt.push(d); };
  T.report = function () {
    R.wallSeconds = +wall().toFixed(1); R.simSeconds = +T.simT.toFixed(1);
    const stages = R.stages.map(function (s) {
      const o = {}; Object.keys(s).forEach(function (k) { if (k[0] !== '_') o[k] = s[k]; });
      o.simSeconds = +s.simSeconds.toFixed(1); o.wallSeconds = +((s.wallEnd !== undefined ? s.wallEnd : wall()) - s._w0).toFixed(1);
      delete o.wallEnd; return o;
    });
    return {
      seed: seed, params: R.params, finished: R.finished, aborted: R.aborted, simSeconds: R.simSeconds, wallSeconds: R.wallSeconds,
      currentStage: cur ? cur.id : null, stuckSeq: R.stuckSeq || 0, stageChangeSeq: T.stageChangeSeq || 0, goal: T.goalText || '', stages: stages, consoleErrors: R.consoleErrors, consoleWarnings: R.consoleWarnings.slice(0, 40),
      unhandledRejections: R.unhandledRejections, designsBuilt: R.designsBuilt, snapshots: R.snapshots, events: R.events.slice(-60)
    };
  };

  // ------------------------------------------------------------------ error capture
  function stackOwn(st) { return /testrig/.test(st || ''); }
  function rec(list, kind, msg, stack) {
    if (list.length > 200) return;
    list.push({ t: +(T.simT || 0).toFixed(1), stage: cur ? cur.id : null, msg: String(msg).slice(0, 400), own: stackOwn(stack), stack: String(stack || '').split('\n').slice(0, 4).join(' | ').slice(0, 400) });
  }
  const ce = console.error.bind(console), cw = console.warn.bind(console);
  console.error = function () {
    const a = [].slice.call(arguments); let st = '';
    try { st = new Error().stack; a.forEach(function (x) { if (x && x.stack) st += '\n' + x.stack; }); } catch (e) { /* */ }
    rec(R.consoleErrors, 'error', a.map(function (x) { return x && x.message ? x.message : (typeof x === 'object' ? JSON.stringify(x) : String(x)); }).join(' '), st);
    ce.apply(null, a);
  };
  console.warn = function () {
    const a = [].slice.call(arguments); rec(R.consoleWarnings, 'warn', a.join(' '), '');
    cw.apply(null, a);
  };
  window.addEventListener('error', function (e) { rec(R.consoleErrors, 'onerror', (e.message || 'error') + ' @' + (e.filename || '') + ':' + (e.lineno || ''), (e.error && e.error.stack) || e.filename); });
  window.addEventListener('unhandledrejection', function (e) { const r = e.reason; rec(R.unhandledRejections, 'rejection', r && r.message ? r.message : String(r), r && r.stack); });

  // ------------------------------------------------------------------ keyboard synth (real events into SP.input)
  const KEYMAP = { Space: ' ', ShiftLeft: 'Shift', ShiftRight: 'Shift', Escape: 'Escape', Enter: 'Enter', Tab: 'Tab', ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight' };
  function keyOf(code) { if (KEYMAP[code]) return KEYMAP[code]; if (/^Key/.test(code)) return code.slice(3).toLowerCase(); if (/^Digit/.test(code)) return code.slice(5); return code; }
  const held = new Set(); let tapQ = [];
  function kd(code) { window.dispatchEvent(new KeyboardEvent('keydown', { code: code, key: keyOf(code), bubbles: true, cancelable: true })); }
  function ku(code) { window.dispatchEvent(new KeyboardEvent('keyup', { code: code, key: keyOf(code), bubbles: true, cancelable: true })); }
  /** Hold exactly this set of key codes down (others released). */
  T.hold = function (codes) {
    const want = new Set(codes || []);
    held.forEach(function (c) { if (!want.has(c)) { held.delete(c); ku(c); } });
    want.forEach(function (c) { if (!held.has(c)) { held.add(c); kd(c); } });
  };
  T.releaseAll = function () { T.hold([]); };
  /** Press a key for exactly one game frame (edge-triggered keys). */
  T.tap = function (code) { if (held.has(code)) { ku(code); held.delete(code); } kd(code); tapQ.push(code); };
  function flushTaps() { const l = tapQ; tapQ = []; l.forEach(ku); }
  /** WASD from a direction vector (x right, y forward) with deadzone. */
  T.wasd = function (x, y, extra) {
    const c = (extra || []).slice(); const dz = 0.35;
    if (y > dz) c.push('KeyW'); else if (y < -dz) c.push('KeyS');
    if (x > dz) c.push('KeyD'); else if (x < -dz) c.push('KeyA');
    T.hold(c);
  };
  T.pointer = function (type, x, y, button) {
    const cv = document.querySelector('#canvas-container canvas') || document.body;
    const o = { clientX: x, clientY: y, button: button || 0, buttons: type === 'pointerup' ? 0 : 1, bubbles: true, cancelable: true, pointerType: 'mouse', isPrimary: true };
    cv.dispatchEvent(new PointerEvent(type, o));
  };
  T.click = function (x, y, button) { T.pointer('pointermove', x, y, button); T.pointer('pointerdown', x, y, button); T.pointer('pointerup', x, y, button); };

  // ------------------------------------------------------------------ DOM helpers
  T.q = function (sel, root) { return (root || document).querySelector(sel); };
  T.qa = function (sel, root) { return [].slice.call((root || document).querySelectorAll(sel)); };
  T.btnByText = function (re, root) {
    const l = T.qa('button, .btn', root || document);
    for (let i = 0; i < l.length; i++) if (re.test(l[i].textContent || '') && l[i].offsetParent !== null && !l[i].disabled) return l[i];
    return null;
  };
  T.clickText = function (re, root) { const b = T.btnByText(re, root); if (b) { b.click(); return true; } return false; };

  // ------------------------------------------------------------------ rAF capture / stepping
  const realRAF = window.requestAnimationFrame.bind(window);
  let gameCb = null, fakeNow = 1000, renderOK = true, origRender = null;
  window.requestAnimationFrame = function (cb) {
    if (cb && cb.name === 'frame') { gameCb = cb; return 0; }
    return realRAF(cb);
  };
  T.simT = 0; T.steps = 0;
  const DT = 1 / 30;
  let stageProbe = { x: 0, z: 0, t: 0, prog: 0, progT: 0 };
  let lastStageId = null, modalWait = 0, transitionWait = 0;

  function patchRender() {
    if (origRender || !SP.render || !SP.render.render) return;
    origRender = SP.render.render;
    SP.render.render = function (scene, camera) {
      if (!renderOK) return;
      if (T.cine && camera && !(SP.game && SP.game.editorOpen) && camera.position && camera.position.clone) {
        // gentle cinematic drift: slow sway around the stage camera's own framing, restored right after drawing
        const t = performance.now() / 1000, p0 = camera.position.clone(), q0 = camera.quaternion.clone();
        const a = Math.max(0.15, Math.min(2.5, p0.length() * 0.012));
        camera.position.x += Math.sin(t * 0.21) * a; camera.position.y += Math.sin(t * 0.17 + 1) * a * 0.35; camera.position.z += Math.cos(t * 0.19) * a;
        camera.quaternion.copy(q0); camera.updateMatrixWorld(true);
        try { return origRender.apply(this, arguments); } finally { camera.position.copy(p0); camera.quaternion.copy(q0); camera.updateMatrixWorld(true); }
      }
      return origRender.apply(this, arguments);
    };
  }

  function curBot() { const id = SP.game && SP.game.current && SP.game.current.id; return id && T.bots[id] ? T.bots[id] : null; }

  function finish(why) {
    if (R.finished || R.aborted) return;
    if (why === 'done') R.finished = true; else R.aborted = why;
    if (cur) { cur.wallEnd = wall(); }
    T.releaseAll(); T.stopped = true;
    T.note('rig stopped: ' + why);
  }

  // stage transition bookkeeping
  function syncStage() {
    const g = SP.game; if (!g) return;
    const id = g.current ? g.current.id : null;
    if (id === lastStageId) return;
    lastStageId = id;
    if (!id) return;
    if (cur && cur.id === id) return;
    if (cur) cur.wallEnd = wall();
    if (id === 'intro') { cur = stageRec('intro'); return; }
    cur = stageRec(id);
    stageProbe = { x: 0, z: 0, t: 0, prog: 0, progT: 0, init: false };
    R.stageChanges = (R.stageChanges || 0) + 1;
    T.stageChangeSeq = (T.stageChangeSeq || 0) + 1;
    T.goal('start ' + id);
    const b = T.bots[id]; try { b && b.enter && b.enter(); } catch (e) { console.error('[testrig] enter ' + id, e); }
    T.note('entered stage ' + id);
  }

  // wrap completeStage to learn about completions (and detect the end of the campaign)
  function hookGame() {
    const g = SP.game; if (!g || g._apHooked) return; g._apHooked = true;
    const orig = g.completeStage;
    g.completeStage = function (card, lines) {
      const st = g.current;
      if (cur && st && cur.id === st.id) { cur.completed = true; cur.card = card || null; cur.wallEnd = wall(); const b = T.bots[cur.id]; try { cur.resources = b && b.resources ? b.resources() : null; } catch (e) { /* */ } T.note('STAGE COMPLETE ' + st.id + ' card=' + card + ' sim=' + cur.simSeconds.toFixed(0) + 's'); }
      modalWait = 0;
      return orig.apply(this, arguments);
    };
  }

  function handleModals(dt) {
    // stage card -> continue
    const card = T.q('.stage-card');
    if (card) {
      modalWait += dt;
      if (modalWait > (T.watch() ? 6 : 2.2)) {
        modalWait = 0;
        const done = cur && cur.completed ? cur.id : null;
        const b = T.btnByText(/continue/i, card);
        if (done && (done === P.until || (done === 'space' && P.until === 'end'))) { finish('done'); if (b) { /* leave card for screenshots */ } return true; }
        if (b) b.click();
      }
      return true;
    }
    modalWait = 0;
    const mb = T.qa('.modal-box');
    if (mb.length) {
      const box = mb[mb.length - 1];
      const bot = curBot();
      if (bot && bot.modal && bot.modal(box, dt)) return true;
      if (!T.q('.ending, .sp-end')) {
        const safe = T.btnByText(/continue|got it|ok\b|okay|close|let'?s|start|play|next|yes|sure|awesome|great|lets/i, box);
        if (safe) { safe.click(); return true; }
        const x = T.q('.modal-x', box); if (x) { x.click(); return true; }
      }
      return true;
    }
    return false;
  }

  function botStep(dt) {
    const g = SP.game; if (!g) return;
    hookGame(); patchRender(); syncStage();
    if (T.manual) { cur && SP.game.current && !SP.game.paused && (cur.simSeconds += dt); return; }       // user has taken over
    // pause menu -> resume
    if (g.paused && !T.q('.stage-card') && !T.q('.modal-box') && T.q('.pause-box')) { T.clickText(/resume/i); return; }
    if (g.editorOpen && SP.editor && !SP.editor.isOpen) { T.yieldNow = true; T.releaseAll(); return; }   // editor closed: let its promise resolve before the next step
    if (g.editorOpen && SP.editor && SP.editor.isOpen) {
      T.releaseAll();
      const eb = T.bots.editor; if (eb) { try { eb.tick(dt); } catch (e) { console.error('[testrig] editor bot', e); eb.abort && eb.abort(); } }
      return;
    }
    if (handleModals(dt)) { T.releaseAll(); return; }
    const id = g.current ? g.current.id : null;
    if (!id) {                              // title screen
      if (R.stages.length && cur && cur.completed) { finish('done'); return; }
      if (T.titleWait === undefined) T.titleWait = 0;
      T.titleWait += dt;
      if (T.titleWait > 0.8) { T.titleWait = 0; if (!T.clickText(/new game/i)) { if (T.q('#title.on')) T.note('title without New Game button'); } }
      return;
    }
    T.titleWait = 0;
    if (id === 'intro') { transitionWait += dt; if (!P.intro && transitionWait > 1.0) { transitionWait = 0; T.tap('Escape'); } else if (P.intro) T.goal('watching the meteor intro'); return; }
    const bot = T.bots[id];
    if (!bot) { T.stuck('no bot for stage ' + id); return; }
    if (g.paused) return;
    cur && (cur.simSeconds += dt);
    try { bot.tick(dt); } catch (e) { console.error('[testrig] bot ' + id, e); }
    stuckCheck(bot, dt);
    // stage time budget guard: bot gave up
    if (cur && cur.simSeconds > (bot.maxSim || 3600) + (cur.extra || 0)) {
      if (P.assist && bot.assist && !cur.assisted) {       // ASSIST (flagged): push the stage over its last hurdle through the game's own state, then let the bot finish it for real
        cur.assisted = true; cur.extra = 600; R.assists = R.assists || []; R.assists.push(id);
        T.note('ASSIST: stage budget (' + (bot.maxSim || 3600) + 's) exceeded -> nudging the stage state so the campaign can continue');
        try { bot.assist(); } catch (e) { console.error('[testrig] assist ' + id, e); }
      } else { T.note('stage sim-time budget exceeded'); finish('stage ' + id + ' exceeded sim budget'); }
    }
  }

  function stuckCheck(bot, dt) {
    if (!bot.probe) return;
    let p; try { p = bot.probe(); } catch (e) { return; }
    if (!p) return;
    const sp = stageProbe;
    if (!sp.init) { sp.init = true; sp.x = p.x || 0; sp.z = p.z || 0; sp.prog = p.prog || 0; sp.t = 0; sp.progT = 0; return; }
    const moved = Math.hypot((p.x || 0) - sp.x, (p.z || 0) - sp.z) > (p.eps || 0.6);
    if (moved) { sp.x = p.x; sp.z = p.z; sp.t = 0; } else sp.t += dt;
    if ((p.prog || 0) !== sp.prog) { sp.prog = p.prog; sp.progT = 0; } else sp.progT += dt;
    if (!p.idleOk && sp.t > (bot.stuckPos || 14) && sp.progT > (bot.stuckPos || 14)) {
      sp.t = 0; T.stuck('no movement ' + (bot.stuckPos || 14) + 's at ' + (p.x || 0).toFixed(1) + ',' + (p.z || 0).toFixed(1) + ' goal=' + T.goalText);
      try { bot.unstick && bot.unstick('soft'); } catch (e) { console.error('[testrig] unstick', e); }
    }
    if (sp.progT > (bot.stuckProg || 150)) {
      sp.progT = 0; T.stuck('no progress ' + (bot.stuckProg || 150) + 's goal=' + T.goalText);
      try { bot.unstick && bot.unstick('hard'); } catch (e) { console.error('[testrig] unstick', e); }
    }
  }

  function stepOnce(dt, render) {
    T.simT += dt; T.steps++;
    R.simSeconds = T.simT;
    try { botStep(dt); } catch (e) { console.error('[testrig] botStep', e); }
    renderOK = render;
    fakeNow += dt * 1000;
    if (gameCb) { const cb = gameCb; gameCb = null; try { cb(fakeNow); } catch (e) { console.error('[testrig] game frame', e); } }
    flushTaps();
    if (T.simT - (T._snapT || 0) >= 300) { T._snapT = T.simT; snapshot(); }
    if (T.steps % (P.speed > 4 ? 60 : 10) === 0) overlayUpdate();
  }

  function snapshot() {
    const b = curBot(); let res = null; try { res = b && b.resources ? b.resources() : null; } catch (e) { /* */ }
    R.snapshots.push({ simT: +T.simT.toFixed(0), wall: +wall().toFixed(0), stage: cur ? cur.id : null, goal: T.goalText || '', resources: res });
  }

  // main pump -------------------------------------------------------------
  function pumpReal() {
    if (T.stopped) { renderOK = true; if (gameCb) { const cb = gameCb; gameCb = null; fakeNow += 16; try { cb(fakeNow); } catch (e) { /* */ } } realRAF(pumpReal); return; }
    const t0 = performance.now(), K = P.speed;
    const raw = Math.min(0.05, Math.max(1 / 120, (t0 - (T._lastReal || t0)) / 1000)); T._lastReal = t0;
    if (T.paused && !T.stepReq) {
      renderOK = true; fakeNow += raw * 1000; if (gameCb) { const cb = gameCb; gameCb = null; try { cb(fakeNow); } catch (e) { /* */ } }
      flushTaps(); overlayUpdate(); markDraw(); capUpdate(); realRAF(pumpReal); return;
    }
    // fixed 1/60 s substeps (stable game timers / no tunnelling); K x real time worth of them per frame, total work capped at ~40 ms
    const one = T.stepReq; T.stepReq = false;
    let want = 1;
    if (K > 1 && !one) { const exact = K * raw * 60 + (T._stepFrac || 0); want = Math.max(1, Math.floor(exact)); T._stepFrac = Math.min(2, exact - want); }
    let done = 0;
    for (let i = 0; i < want; i++) {
      stepOnce(K <= 1 ? Math.max(1 / 60, raw) : 1 / 60, i === want - 1 || performance.now() - t0 > 36);
      done++;
      if (T.stopped || performance.now() - t0 > 40) break;
    }
    if (!one && K > 1) {   // achieved speed (smoothed): sim seconds advanced per real second
      const ach = done / 60 / raw; T.achieved = T.achieved ? T.achieved * 0.93 + ach * 0.07 : ach;
    } else T.achieved = K;
    markDraw(); capUpdate();
    realRAF(pumpReal);
  }
  const mc = typeof MessageChannel !== 'undefined' ? new MessageChannel() : null;
  function pumpHeadless() {
    if (T.stopped) return;
    const t0 = performance.now();
    T.yieldNow = false;
    while (performance.now() - t0 < 30 && !T.stopped && !T.yieldNow) {
      stepOnce(DT, T.steps % 45 === 0);   // render rarely: keeps matrices / HUD roughly fresh
    }
    if (T.stopped) { setTimeout(function () { pumpReal(); }, 0); return; }
    if (mc) mc.port2.postMessage(0); else setTimeout(pumpHeadless, 0);
  }
  if (mc) mc.port1.onmessage = pumpHeadless;

  T.start = function () {
    if (T._started) return; T._started = true;
    if (P.headless) pumpHeadless(); else realRAF(pumpReal);
  };
  // the game boots on DOMContentLoaded and calls rAF(frame); start pumping once it has registered
  function waitBoot() { if (gameCb || (SP.game && SP.game.registerStage)) T.start(); else setTimeout(waitBoot, 20); }
  document.addEventListener('DOMContentLoaded', function () { setTimeout(waitBoot, 0); });
  if (document.readyState !== 'loading') setTimeout(waitBoot, 0);

  // ------------------------------------------------------------------ overlay (F9)
  let ov = null, ovOn = true;
  function overlayUpdate() {
    if (!document.body) return;
    buildControls(); ctlSync();
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'ap-overlay';
      ov.style.cssText = 'position:fixed;left:6px;bottom:6px;z-index:99999;pointer-events:none;font:11px/1.3 ui-monospace,Menlo,monospace;color:#bbf7d0;background:rgba(2,6,23,.72);padding:4px 7px;border-radius:6px;white-space:pre;max-width:46vw;overflow:hidden';
      document.body.appendChild(ov);
      window.addEventListener('keydown', function (e) { if (e.code === 'F9' && e.isTrusted !== false) { ovOn = !ovOn; ov.style.display = ovOn ? '' : 'none'; } });
    }
    if (!ovOn) return;
    const g = SP.game, id = g && g.current ? g.current.id : (g && g.editorOpen ? 'editor' : 'title');
    ov.textContent = 'AUTOPLAY seed ' + seed + '  x' + P.speed + (T.achieved && T.achieved < P.speed * 0.85 ? ' (' + Math.round(T.achieved) + 'x)' : '') + (P.headless ? ' headless' : '') + '\n' +
      'stage ' + id + '  sim ' + (cur ? cur.simSeconds.toFixed(0) : 0) + 's / total ' + T.simT.toFixed(0) + 's  wall ' + wall().toFixed(0) + 's\n' +
      'fps ' + (g ? g.fps : 0) + '  err ' + R.consoleErrors.length + '  stuck ' + (cur ? cur.stuckEvents : 0) + '  deaths ' + (cur ? cur.deaths : 0) + '\n' +
      'goal: ' + (T.goalText || '-');
  }

  T.setSpeed = function (k) { P.speed = Math.max(1, Math.min(32, k)); R.params.speed = P.speed; ctlSync(); };
  T.takeOver = function (on) { T.manual = !!on; T.releaseAll(); if (T.cursor) T.cursor.hide(); T.say(on ? 'You are in control. Press Resume bot to hand back.' : 'Bot resumed'); ctlSync(); };
  T.pause = function (on) { T.paused = on === undefined ? !T.paused : !!on; ctlSync(); };
  let ctl = null;
  function ctlSync() {
    if (!ctl) return;
    ctl.querySelectorAll('[data-sp]').forEach(function (b) { const on = +b.dataset.sp === P.speed; b.style.background = on ? '#0891b2' : '#1e293b';
      const ach = T.achieved; b.textContent = (on && !T.paused && P.speed > 1 && ach && ach < P.speed * 0.85) ? b.dataset.sp + 'x (' + Math.max(1, Math.round(ach)) + 'x)' : b.dataset.sp + 'x'; });
    ctl.querySelector('[data-a=pause]').textContent = T.paused ? '\u25B6' : '\u23F8';
    ctl.querySelector('[data-a=take]').textContent = T.manual ? '\uD83E\uDD16 Resume bot' : '\u270B Take over';
    ctl.querySelector('[data-a=cine]').style.background = T.cine ? '#0891b2' : '#1e293b';
  }
  function buildControls() {
    if (ctl || !document.body || P.headless || !P.ui) return;
    ctl = document.createElement('div'); ctl.id = 'ap-controls';
    ctl.style.cssText = 'position:fixed;bottom:4px;left:50%;transform:translateX(-50%);z-index:99998;display:flex;gap:4px;align-items:center;background:rgba(2,6,23,.8);padding:4px 6px;border-radius:10px;font:600 12px system-ui,sans-serif;color:#e2e8f0;user-select:none';
    const mkb = function (txt, attrs, fn) { const b = document.createElement('button'); b.textContent = txt; b.tabIndex = -1; Object.keys(attrs || {}).forEach(function (k) { b.setAttribute(k, attrs[k]); });
      b.style.cssText = 'background:#1e293b;color:#e2e8f0;border:1px solid #475569;border-radius:7px;padding:3px 8px;cursor:pointer;font:inherit';
      b.addEventListener('mousedown', function (e) { e.preventDefault(); e.stopPropagation(); }); b.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
      b.addEventListener('click', function (e) { e.stopPropagation(); fn(); b.blur(); }); ctl.appendChild(b); return b; };
    const lab = document.createElement('span'); lab.textContent = '\uD83E\uDD16 seed ' + seed; ctl.appendChild(lab);
    mkb('\u23F8', { 'data-a': 'pause' }, function () { T.pause(); });
    mkb('\u23ED', { 'data-a': 'step', title: 'step one frame (while paused)' }, function () { T.paused = true; T.stepReq = true; ctlSync(); });
    [1, 2, 4, 8, 16, 32].forEach(function (k) { mkb(k + 'x', { 'data-sp': k }, function () { T.setSpeed(k); }); });
    mkb('\uD83C\uDFA5 Cine', { 'data-a': 'cine', title: 'gentle cinematic camera drift' }, function () { T.cine = !T.cine; ctlSync(); });
    mkb('\u270B Take over', { 'data-a': 'take', title: 'F10' }, function () { T.takeOver(!T.manual); });
    mkb('\uD83D\uDCCA', { 'data-a': 'ov', title: 'stats overlay (F9)' }, function () { ovOn = !ovOn; if (ov) ov.style.display = ovOn ? '' : 'none'; });
    document.body.appendChild(ctl);
    window.addEventListener('keydown', function (e) {
      if (!e.isTrusted) return;
      if (e.code === 'F8') { e.preventDefault(); T.pause(); } else if (e.code === 'F7') { e.preventDefault(); T.paused = true; T.stepReq = true; ctlSync(); } else if (e.code === 'F10') { e.preventDefault(); T.takeOver(!T.manual); }
    });
    T.cine = P.cine; ctlSync();
  }
  T.nextTick = null;
  T.stageId = function () { return SP.game && SP.game.current ? SP.game.current.id : null; };
  T.rng = function () { if (!T._rng) T._rng = SP.util.rng('autoplay' + seed); return T._rng; };
  T.stageRec = function () { return cur; };
  T.ORDER = ORDER;
})();
