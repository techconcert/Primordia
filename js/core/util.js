/* SP.util — math helpers, seeded RNG, simplex noise. */
(function () {
  'use strict';
  const SP = window.SP = window.SP || {};
  // Stage files load before game.js; let them call SP.game.registerStage() at load time.
  if (!SP.game) {
    SP.game = { _pending: [], registerStage: function (s) { this._pending.push(s); } };
  }
  SP.stages = SP.stages || {};

  function hashStr(s) {
    s = String(s);
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function rng(seed) {
    const s = typeof seed === 'number' ? (seed >>> 0) : hashStr(seed === undefined ? Date.now() : seed);
    const f = mulberry32(s);
    const r = {
      seed: seed,
      next: f,
      range(a, b) { return a + (b - a) * f(); },
      int(a, b) { return a + Math.floor(f() * (b - a + 1)); },
      pick(arr) { return arr[Math.floor(f() * arr.length)]; },
      chance(p) { return f() < p; },
      shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(f() * (i + 1)); const t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
        return arr;
      }
    };
    return r;
  }

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const invLerp = (a, b, v) => (a === b ? 0 : (v - a) / (b - a));
  const smoothstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  // Frame-rate independent exponential smoothing: damp(current, target, lambda, dt)
  const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
  const wrapAngle = (a) => { a = (a + Math.PI) % (Math.PI * 2); if (a < 0) a += Math.PI * 2; return a - Math.PI; };
  const angleLerp = (a, b, t) => a + wrapAngle(b - a) * t;

  let _uid = 0;
  const uid = (prefix) => (prefix || 'u') + '_' + (++_uid);

  function debounce(fn, ms) {
    let t = 0;
    return function () { const a = arguments, c = this; clearTimeout(t); t = setTimeout(function () { fn.apply(c, a); }, ms); };
  }

  // ---- 3D simplex noise (Stefan Gustavson, public domain) ----
  const grad3 = [[1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],[1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],[0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]];
  const perm = new Uint8Array(512), permMod12 = new Uint8Array(512);
  function setNoiseSeed(seed) {
    const r = rng(seed === undefined ? 1 : seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) { const j = Math.floor(r.next() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
    for (let i = 0; i < 512; i++) { perm[i] = p[i & 255]; permMod12[i] = perm[i] % 12; }
  }
  setNoiseSeed(1337);
  const F3 = 1 / 3, G3 = 1 / 6;
  function noise3(xin, yin, zin) {
    let n0, n1, n2, n3;
    const s = (xin + yin + zin) * F3;
    const i = Math.floor(xin + s), j = Math.floor(yin + s), k = Math.floor(zin + s);
    const t = (i + j + k) * G3;
    const x0 = xin - (i - t), y0 = yin - (j - t), z0 = zin - (k - t);
    let i1, j1, k1, i2, j2, k2;
    if (x0 >= y0) {
      if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
      else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
      else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
    } else {
      if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
      else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
      else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
    }
    const x1 = x0 - i1 + G3, y1 = y0 - j1 + G3, z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2 * G3, y2 = y0 - j2 + 2 * G3, z2 = z0 - k2 + 2 * G3;
    const x3 = x0 - 1 + 3 * G3, y3 = y0 - 1 + 3 * G3, z3 = z0 - 1 + 3 * G3;
    const ii = i & 255, jj = j & 255, kk = k & 255;
    let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
    if (t0 < 0) n0 = 0; else { const g = grad3[permMod12[ii + perm[jj + perm[kk]]]]; t0 *= t0; n0 = t0 * t0 * (g[0] * x0 + g[1] * y0 + g[2] * z0); }
    let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
    if (t1 < 0) n1 = 0; else { const g = grad3[permMod12[ii + i1 + perm[jj + j1 + perm[kk + k1]]]]; t1 *= t1; n1 = t1 * t1 * (g[0] * x1 + g[1] * y1 + g[2] * z1); }
    let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
    if (t2 < 0) n2 = 0; else { const g = grad3[permMod12[ii + i2 + perm[jj + j2 + perm[kk + k2]]]]; t2 *= t2; n2 = t2 * t2 * (g[0] * x2 + g[1] * y2 + g[2] * z2); }
    let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
    if (t3 < 0) n3 = 0; else { const g = grad3[permMod12[ii + 1 + perm[jj + 1 + perm[kk + 1]]]]; t3 *= t3; n3 = t3 * t3 * (g[0] * x3 + g[1] * y3 + g[2] * z3); }
    return 32 * (n0 + n1 + n2 + n3);
  }
  function fbm3(x, y, z, octaves, lacunarity, gain) {
    octaves = octaves || 4; lacunarity = lacunarity || 2; gain = gain === undefined ? 0.5 : gain;
    let sum = 0, amp = 1, freq = 1, norm = 0;
    for (let o = 0; o < octaves; o++) { sum += amp * noise3(x * freq, y * freq, z * freq); norm += amp; amp *= gain; freq *= lacunarity; }
    return sum / norm;
  }

  SP.util = { rng, hashStr, noise3, fbm3, setNoiseSeed, clamp, lerp, invLerp, smoothstep, damp, angleLerp, wrapAngle, uid, debounce };
})();
