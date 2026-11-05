/* SP.audio — procedural WebAudio sfx + quiet generative music. No assets. */
(function () {
  'use strict';
  const SP = window.SP = window.SP || {};

  let ctx = null, master = null, sfxBus = null, musicBus = null, comp = null;
  let muted = false;
  try { muted = localStorage.getItem('primordia-web-muted') === '1'; } catch (e) {}
  const lastPlayed = {};
  let noiseBuf = null;

  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  function init() {
    const active = !navigator.userActivation || navigator.userActivation.hasBeenActive;
    if (!active) return false;
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return true; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try {
      ctx = new AC();
      comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16; comp.ratio.value = 4;
      master = ctx.createGain(); master.gain.value = muted ? 0 : 0.8;
      sfxBus = ctx.createGain(); sfxBus.gain.value = 0.7;
      musicBus = ctx.createGain(); musicBus.gain.value = 0.32;
      sfxBus.connect(master); musicBus.connect(master); master.connect(comp); comp.connect(ctx.destination);
      const n = ctx.sampleRate;
      noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      if (A.pendingMood !== undefined) A.music(A.pendingMood);
      return true;
    } catch (e) { ctx = null; return false; }
  }

  // --- building blocks ---
  // tone: freq (Hz), optional slide to `to`, linear-ish pluck envelope
  function tone(o) {
    const t0 = ctx.currentTime + (o.delay || 0);
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f, t0);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t0 + o.d);
    if (o.vib) { const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = o.vib; lg.gain.value = o.f * 0.03; l.connect(lg); lg.connect(osc.frequency); l.start(t0); l.stop(t0 + o.d + 0.1); }
    const v = (o.v === undefined ? 0.3 : o.v), a = o.a === undefined ? 0.005 : o.a;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(v, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.d);
    let out = osc;
    if (o.lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; osc.connect(f); out = f; }
    out.connect(g); g.connect(o.dest || sfxBus);
    osc.start(t0); osc.stop(t0 + o.d + 0.05);
    return g;
  }
  function noise(o) {
    const t0 = ctx.currentTime + (o.delay || 0);
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = o.ftype || 'bandpass'; f.frequency.setValueAtTime(o.f || 1000, t0); f.Q.value = o.q || 1;
    if (o.to) f.frequency.exponentialRampToValueAtTime(Math.max(40, o.to), t0 + o.d);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(o.v === undefined ? 0.3 : o.v, t0 + (o.a || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.d);
    src.connect(f); f.connect(g); g.connect(o.dest || sfxBus);
    src.start(t0, Math.random()); src.stop(t0 + o.d + 0.05);
  }

  // Each sfx is a function(p) where p = pitch multiplier
  const S = {
    click:   (p) => { tone({ f: 620 * p, to: 880 * p, d: 0.07, type: 'square', v: 0.12, lp: 3000 }); },
    place:   (p) => { tone({ f: 330 * p, to: 520 * p, d: 0.12, type: 'triangle', v: 0.28 }); tone({ f: 700 * p, d: 0.06, type: 'sine', v: 0.1, delay: 0.05 }); },
    remove:  (p) => { tone({ f: 500 * p, to: 180 * p, d: 0.16, type: 'triangle', v: 0.25 }); },
    eat:     (p) => { tone({ f: 260 * p, to: 700 * p, d: 0.11, type: 'sine', v: 0.3 }); tone({ f: 420 * p, to: 980 * p, d: 0.1, type: 'sine', v: 0.2, delay: 0.07 }); },
    crunch:  (p) => { noise({ f: 2800 * p, q: 0.8, d: 0.07, v: 0.4 }); noise({ f: 1800 * p, q: 0.8, d: 0.06, v: 0.3, delay: 0.07 }); tone({ f: 150 * p, to: 90 * p, d: 0.1, type: 'square', v: 0.12, lp: 600 }); },
    hit:     (p) => { noise({ f: 900 * p, to: 200, q: 0.7, d: 0.15, v: 0.5 }); tone({ f: 180 * p, to: 55, d: 0.16, type: 'sine', v: 0.55 }); },
    hurt:    (p) => { tone({ f: 520 * p, to: 200 * p, d: 0.28, type: 'sawtooth', v: 0.2, lp: 1500, vib: 22 }); noise({ f: 700, d: 0.1, v: 0.2 }); },
    die:     (p) => { tone({ f: 440 * p, to: 70, d: 0.8, type: 'triangle', v: 0.35, vib: 8 }); tone({ f: 330 * p, to: 50, d: 0.9, type: 'sine', v: 0.25, delay: 0.1 }); },
    levelup: (p) => { [523, 659, 784, 1047, 1319].forEach((f, i) => tone({ f: f * p, d: 0.22, type: 'triangle', v: 0.26, delay: i * 0.07 })); tone({ f: 1568 * p, d: 0.5, type: 'sine', v: 0.15, delay: 0.35 }); },
    dna:     (p) => { tone({ f: 880 * p, d: 0.09, type: 'sine', v: 0.25 }); tone({ f: 1320 * p, d: 0.16, type: 'sine', v: 0.22, delay: 0.07 }); tone({ f: 1760 * p, d: 0.2, type: 'sine', v: 0.1, delay: 0.14 }); },
    social_ok:  (p) => { tone({ f: 659 * p, d: 0.14, type: 'triangle', v: 0.28 }); tone({ f: 988 * p, d: 0.24, type: 'triangle', v: 0.28, delay: 0.1 }); },
    social_bad: (p) => { tone({ f: 220 * p, to: 150 * p, d: 0.3, type: 'square', v: 0.14, lp: 700 }); tone({ f: 208 * p, to: 140 * p, d: 0.3, type: 'square', v: 0.1, lp: 700, delay: 0.02 }); },
    sing:    (p) => { tone({ f: 523 * p, d: 0.5, type: 'sine', v: 0.25, a: 0.06, vib: 6 }); tone({ f: 784 * p, d: 0.5, type: 'sine', v: 0.14, a: 0.1, vib: 6, delay: 0.12 }); },
    dance:   (p) => { [392, 494, 392, 587].forEach((f, i) => tone({ f: f * p, d: 0.1, type: 'square', v: 0.1, lp: 2200, delay: i * 0.08 })); },
    charm:   (p) => { tone({ f: 880 * p, to: 1320 * p, d: 0.35, type: 'sine', v: 0.2, vib: 9 }); tone({ f: 1320 * p, to: 1760 * p, d: 0.3, type: 'sine', v: 0.1, delay: 0.1 }); },
    pose:    (p) => { tone({ f: 196 * p, to: 330 * p, d: 0.3, type: 'sawtooth', v: 0.18, lp: 1100 }); tone({ f: 392 * p, d: 0.25, type: 'triangle', v: 0.18, delay: 0.14 }); },
    charge:  (p) => { noise({ f: 300, to: 2400 * p, q: 1.2, d: 0.35, v: 0.35, a: 0.1 }); tone({ f: 110 * p, to: 330 * p, d: 0.35, type: 'sawtooth', v: 0.18, lp: 800, a: 0.1 }); },
    spit:    (p) => { noise({ f: 2200 * p, to: 700, q: 2, d: 0.12, v: 0.4 }); tone({ f: 600 * p, to: 200 * p, d: 0.12, type: 'sine', v: 0.2 }); },
    jump:    (p) => { tone({ f: 260 * p, to: 640 * p, d: 0.16, type: 'square', v: 0.14, lp: 2400 }); },
    mate:    (p) => { [523, 659, 784, 659, 880].forEach((f, i) => tone({ f: f * p, d: 0.2, type: 'sine', v: 0.22, delay: i * 0.11, vib: 5 })); },
    splash:  (p) => { noise({ ftype: 'lowpass', f: 3000 * p, to: 400, d: 0.35, v: 0.45 }); tone({ f: 400 * p, to: 150 * p, d: 0.12, type: 'sine', v: 0.2 }); },
    build:   (p) => { tone({ f: 200 * p, d: 0.08, type: 'square', v: 0.18, lp: 900 }); tone({ f: 300 * p, d: 0.08, type: 'square', v: 0.18, lp: 1200, delay: 0.1 }); tone({ f: 480 * p, d: 0.2, type: 'triangle', v: 0.25, delay: 0.2 }); noise({ f: 2500, d: 0.05, v: 0.3, delay: 0.2 }); },
    coin:    (p) => { tone({ f: 988 * p, d: 0.07, type: 'square', v: 0.14, lp: 4000 }); tone({ f: 1319 * p, d: 0.35, type: 'square', v: 0.14, lp: 4000, delay: 0.07 }); },
    warp:    (p) => { tone({ f: 80 * p, to: 1600 * p, d: 0.7, type: 'sawtooth', v: 0.15, lp: 1800, a: 0.2 }); noise({ f: 400, to: 5000, q: 0.8, d: 0.7, v: 0.25, a: 0.3 }); },
    laser:   (p) => { tone({ f: 1800 * p, to: 200 * p, d: 0.22, type: 'sawtooth', v: 0.16, lp: 5000 }); },
    alarm:   (p) => { for (let i = 0; i < 3; i++) { tone({ f: 740 * p, d: 0.16, type: 'square', v: 0.14, lp: 2500, delay: i * 0.24 }); tone({ f: 554 * p, d: 0.16, type: 'square', v: 0.14, lp: 2500, delay: i * 0.24 + 0.12 }); } },
    win:     (p) => { [523, 659, 784].forEach((f, i) => tone({ f: f * p, d: 0.2, type: 'triangle', v: 0.26, delay: i * 0.11 })); [1047, 784, 1047].forEach((f, i) => tone({ f: f * p, d: 0.55, type: 'triangle', v: 0.22, delay: 0.4 + i * 0.02 })); tone({ f: 1568 * p, d: 0.8, type: 'sine', v: 0.14, delay: 0.5 }); }
  };

  // --- music ---
  // Each mood: scale (semitones from root), root midi, bpm, step(state, t, stepIdx, dest)
  const PENT = [0, 2, 4, 7, 9], MINPENT = [0, 3, 5, 7, 10], MAJ = [0, 2, 4, 5, 7, 9, 11];
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function nt(midi, t, d, type, v, dest, lp) {
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = type; osc.frequency.value = mtof(midi);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + Math.min(0.02, d / 4)); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    let o = osc; if (lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; osc.connect(f); o = f; }
    o.connect(g); g.connect(dest); osc.start(t); osc.stop(t + d + 0.05);
  }
  function pad(midis, t, d, dest, v, type) {
    midis.forEach((m) => {
      const osc = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
      osc.type = type || 'triangle'; osc.frequency.value = mtof(m); osc.detune.value = (Math.random() - 0.5) * 12;
      f.type = 'lowpass'; f.frequency.value = 900;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + d * 0.4); g.gain.linearRampToValueAtTime(0.0001, t + d);
      osc.connect(f); f.connect(g); g.connect(dest); osc.start(t); osc.stop(t + d + 0.05);
    });
  }
  function drum(t, f, d, v, dest) {
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.frequency.setValueAtTime(f * 1.8, t); osc.frequency.exponentialRampToValueAtTime(f, t + 0.06);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    osc.connect(g); g.connect(dest); osc.start(t); osc.stop(t + d + 0.05);
  }
  function chordOf(root, scale, deg) { return [0, 2, 4].map((i) => root + scale[(deg + i) % scale.length] + 12 * Math.floor((deg + i) / scale.length)); }

  const MOODS = {
    title: { bpm: 84, step(s, t, i, d) {
      const root = 57, prog = [0, 5, 3, 4];
      if (i % 16 === 0) { s.deg = prog[(i / 16) % 4 | 0]; pad(chordOf(root - 12, MAJ, s.deg), t, 16 * s.spb, d, 0.05); }
      const ch = chordOf(root, MAJ, s.deg || 0);
      if (i % 2 === 0) nt(pick(ch) + (i % 8 === 0 ? 12 : 0), t, 0.5, 'triangle', 0.07, d);
      if (i % 4 === 0) nt(ch[0] - 12, t, 0.7, 'sine', 0.1, d);
    } },
    cell: { bpm: 70, step(s, t, i, d) {
      if (i % 32 === 0) pad([45, 52, 57], t, 32 * s.spb, d, 0.05, 'sine');
      if (Math.random() < 0.28) { const m = 69 + pick(PENT) + pick([0, 12]); nt(m, t, 0.18, 'sine', 0.07, d); nt(m + 0.0, t + s.spb * 1.5, 0.12, 'sine', 0.03, d); }
      if (i % 16 === 8) nt(57 + pick(PENT), t, 0.9, 'triangle', 0.05, d);
    } },
    creature: { bpm: 100, step(s, t, i, d) {
      const root = 55, prog = [0, 3, 4, 3];
      if (i % 16 === 0) { s.deg = prog[(i / 16) % 4 | 0]; pad(chordOf(root, MAJ, s.deg), t, 16 * s.spb, d, 0.04); }
      const ch = chordOf(root + 12, MAJ, s.deg || 0);
      const pat = [1, 0, 0, 1, 0, 1, 0, 0];
      if (pat[i % 8] && Math.random() < 0.85) nt(pick(ch) + pick([0, 0, 12]), t, 0.25, 'triangle', 0.08, d, 2200);
      if (i % 8 === 0) nt(ch[0] - 24, t, 0.4, 'sine', 0.12, d);
    } },
    tribal: { bpm: 96, step(s, t, i, d) {
      const k = i % 16;
      if (k === 0 || k === 6 || k === 10) drum(t, 70, 0.25, 0.22, d);
      if (k === 4 || k === 12) drum(t, 120, 0.15, 0.13, d);
      if (k % 2 === 1 && Math.random() < 0.3) drum(t, 200, 0.08, 0.05, d);
      if (i % 4 === 0 && Math.random() < 0.55) nt(62 + pick(MINPENT) + pick([0, 12]), t, 0.5, 'sine', 0.07, d, 1800);
      if (i % 32 === 0) pad([50, 57, 62], t, 32 * s.spb, d, 0.035);
    } },
    civ: { bpm: 108, step(s, t, i, d) {
      const prog = [0, 5, 3, 4], root = 53;
      if (i % 16 === 0) { s.deg = prog[(i / 16) % 4 | 0]; pad(chordOf(root, MAJ, s.deg), t, 16 * s.spb, d, 0.04, 'sawtooth'); }
      const ch = chordOf(root + 12, MAJ, s.deg || 0);
      if (i % 2 === 0) nt(ch[(i / 2 | 0) % 3], t, 0.16, 'square', 0.04, d, 1800);
      if (i % 8 === 0) nt(ch[0] - 12, t, 0.5, 'triangle', 0.1, d, 500);
      if (i % 8 === 4) drum(t, 90, 0.1, 0.06, d);
    } },
    space: { bpm: 54, step(s, t, i, d) {
      if (i % 32 === 0) { const r = pick([45, 48, 43]); pad([r, r + 7, r + 12, r + 16], t, 32 * s.spb, d, 0.045, 'sine'); }
      if (Math.random() < 0.12) nt(81 + pick(PENT), t, 1.6, 'sine', 0.05, d);
    } },
    editor: { bpm: 78, step(s, t, i, d) {
      const prog = [0, 2, 5, 4], root = 52;
      if (i % 16 === 0) { s.deg = prog[(i / 16) % 4 | 0]; pad(chordOf(root, MAJ, s.deg), t, 16 * s.spb, d, 0.04); }
      const ch = chordOf(root + 12, MAJ, s.deg || 0);
      if ([0, 3, 6, 10, 12].indexOf(i % 16) >= 0) nt(pick(ch) + pick([0, 12]), t, 0.35, 'triangle', 0.07, d, 1800);
      if (i % 8 === 0) nt(ch[0] - 12, t, 0.6, 'sine', 0.1, d);
    } }
  };

  let track = null;
  function stopTrack(tr, fade) {
    if (!tr) return;
    clearInterval(tr.timer);
    const t = ctx.currentTime;
    tr.gain.gain.cancelScheduledValues(t); tr.gain.gain.setValueAtTime(tr.gain.gain.value, t); tr.gain.gain.linearRampToValueAtTime(0, t + fade);
    setTimeout(function () { try { tr.gain.disconnect(); tr.echo.disconnect(); } catch (e) {} }, fade * 1000 + 800);
  }
  function startTrack(mood) {
    const M = MOODS[mood]; if (!M) return null;
    const gain = ctx.createGain(); gain.gain.setValueAtTime(0, ctx.currentTime); gain.gain.linearRampToValueAtTime(1, ctx.currentTime + 2.0);
    // soft echo send
    const echo = ctx.createDelay(1.0); echo.delayTime.value = 0.42;
    const fb = ctx.createGain(); fb.gain.value = 0.38;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800;
    const dry = ctx.createGain(); dry.gain.value = 1;
    const wet = ctx.createGain(); wet.gain.value = mood === 'space' || mood === 'cell' ? 0.7 : 0.4;
    dry.connect(gain); dry.connect(echo); echo.connect(lp); lp.connect(fb); fb.connect(echo); lp.connect(wet); wet.connect(gain);
    gain.connect(musicBus);
    const spb = 60 / M.bpm / 4; // one 16th step
    const tr = { mood: mood, gain: gain, echo: echo, timer: 0, state: { spb: spb, deg: 0 }, idx: 0, next: ctx.currentTime + 0.15 };
    tr.timer = setInterval(function () {
      if (!ctx) return;
      while (tr.next < ctx.currentTime + 0.4) { try { M.step(tr.state, tr.next, tr.idx, dry); } catch (e) {} tr.idx++; tr.next += spb; }
    }, 120);
    return tr;
  }

  const A = {
    muted: muted, pendingMood: undefined,
    init: init,
    get ready() { return !!ctx; },
    sfx(name, opts) {
      if (!ctx || muted || !S[name]) return;
      const now = performance.now();
      if (lastPlayed[name] && now - lastPlayed[name] < 35) return;
      lastPlayed[name] = now;
      if (ctx.state === 'suspended') { if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return; ctx.resume(); }
      const o = opts || {};
      const prev = sfxBus.gain.value;
      try {
        if (o.vol !== undefined) sfxBus.gain.value = prev * o.vol;
        S[name](o.pitch || 1);
      } catch (e) { console.error('sfx', name, e); }
      sfxBus.gain.value = prev;
    },
    music(mood) {
      A.pendingMood = mood;
      if (!ctx) return;
      if (track && track.mood === mood) return;
      stopTrack(track, 1.2); track = null;
      if (mood) track = startTrack(mood);
    },
    setMuted(m) {
      muted = !!m; A.muted = muted;
      try { localStorage.setItem('primordia-web-muted', muted ? '1' : '0'); } catch (e) {}
      if (master) { master.gain.cancelScheduledValues(ctx.currentTime); master.gain.setTargetAtTime(muted ? 0 : 0.8, ctx.currentTime, 0.05); }
    },
    names: Object.keys(S),
    moods: Object.keys(MOODS)
  };
  SP.audio = A;

  // unlock on first user gesture
  function unlock() { init(); if (ctx && ctx.state === 'running') { window.removeEventListener('pointerdown', unlock, true); window.removeEventListener('keydown', unlock, true); } }
  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('keydown', unlock, true);
})();
