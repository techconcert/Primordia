/* SP.tribalSites — dry-land site selection for the Tribal stage (villages, rival villages, props, members).
   Pure functions of (planet, dir): deterministic, no scene access, runs in node (tests/tribal_sites_test.js).
   Bug fixed: villages/props spawning under water (findFlat accepted its "least bad" candidate even when wet). */
(function () {
  'use strict';
  const SP = window.SP = window.SP || {};
  const V3 = THREE.Vector3;
  const MARGIN = 1.0;      // village centre: height above sea (u) at least
  const CENTRE = 2.0;      // ...preferred; strict pass needs this
  const PROP_MARGIN = 0.3; // props/structures near a village: ground at least this far above sea
  const RING = 12;         // ring radius checked for lake/river basins

  function basis(d) { const ref = Math.abs(d.y) < 0.95 ? new V3(0, 1, 0) : new V3(1, 0, 0); const e = new V3().crossVectors(ref, d).normalize(); const n = new V3().crossVectors(d, e).normalize(); return { e, n }; }
  function off(pl, d, b, bearing, dist) { const a = dist / pl.radius, t = b.e.clone().multiplyScalar(Math.sin(bearing)).addScaledVector(b.n, Math.cos(bearing)); return d.clone().multiplyScalar(Math.cos(a)).addScaledVector(t, Math.sin(a)).normalize(); }
  function hAbove(pl, d) { return pl.surfaceRadius(d) - pl.seaRadius; }
  function arc(pl, a, b) { return pl.radius * Math.acos(Math.max(-1, Math.min(1, a.dot(b)))); }

  // Evaluate a village site. strict = passes every rule; score = lower is better (>= 100 means wet / unusable).
  function evaluate(pl, dir, o) {
    o = o || {};
    const d = dir.clone().normalize(), h0 = hAbove(pl, d);
    const r = { dir: d, h: h0, ok: false, score: 100 + Math.max(0, MARGIN - h0), landFrac: 0, slope: 0 };
    if (h0 < MARGIN) return r;
    const centreSlope = pl.slopeAt(d); r.slope = centreSlope;
    let worst = centreSlope; const bi = pl.biomeAt(d); const bad = (bi === 'snow' || bi === 'rock') ? 0.4 : 0;
    const b = basis(d); let wet = 0, tot = 0, minNear = 99;
    const rings = [[4, 8], [8, 10], [RING, 12]];
    for (let k = 0; k < rings.length; k++) {
      const rad = rings[k][0], n = rings[k][1];
      for (let i = 0; i < n; i++) {
        const q = off(pl, d, b, i / n * Math.PI * 2 + k * 0.3, rad), hq = hAbove(pl, q);
        if (rad <= 8) minNear = Math.min(minNear, hq);
        if (rad === RING) { tot++; if (hq < PROP_MARGIN) wet++; }
        else if (hq < PROP_MARGIN) { r.score = 90 + (8 - rad); return r; }       // shoreline within 8 u
        worst = Math.max(worst, pl.slopeAt(q));
      }
    }
    r.landFrac = 1 - wet / tot; r.slope = worst; r.score = worst + bad + wet * 0.2 + Math.max(0, CENTRE - h0) * 0.3;
    r.ok = r.landFrac >= 0.85 && h0 >= CENTRE && centreSlope < 0.28 && worst < 0.5 && !bad && !(o.reject && o.reject(d));
    return r;
  }
  // Fibonacci sphere sample (deterministic, covers the globe).
  function fib(i, n) { const y = 1 - 2 * (i + 0.5) / n, r = Math.sqrt(Math.max(0, 1 - y * y)), th = i * 2.399963229728653; return new V3(Math.cos(th) * r, y, Math.sin(th) * r); }

  // Search outward from `dir` for the nearest strict site; else best dry site in range; else best on the whole planet
  // (highest dry spot when nothing is flat). opts: { maxR, step, accept(d) } -- accept filters candidates (spacing etc.)
  function pickDry(pl, dir, opts) {
    opts = opts || {};
    const d0 = dir.clone().normalize(), maxR = opts.maxR === undefined ? 90 : opts.maxR, step = opts.step || 4, b = basis(d0);
    const accept = opts.accept || null;
    let best = null;
    const good = (e) => e.h >= MARGIN && e.landFrac >= 0.85 && e.score < 50;
    const consider = (q) => { if (accept && !accept(q)) return false; const e = evaluate(pl, q); if (e.ok) { best = e; return true; } if (good(e) && (!best || e.score < best.score)) best = e; return false; };
    for (let r = 0; r <= maxR; r += step) {
      const n = r === 0 ? 1 : Math.ceil(r / step) * 4;
      for (let i = 0; i < n; i++) if (consider(r === 0 ? d0 : off(pl, d0, b, i / n * Math.PI * 2 + r, r))) return best.dir;
    }
    if (best) return best.dir;   // a dry, basin-free (if lumpy) site nearby
    // global fallback: nearest-index strict site, then a lumpy dry site with a basin-free ring, then the highest dry spot
    let hi = null, gd = null; const N = 3000;
    for (let i = 0; i < N; i++) {
      const q = fib(i, N); if (accept && !accept(q)) continue;
      const h = hAbove(pl, q); if (h < MARGIN) continue;
      if (!hi || h > hi.h) hi = { dir: q, h };
      if (i % 3 === 0) { const e = evaluate(pl, q); if (e.ok) return q; if (good(e) && (!gd || e.score < gd.score)) gd = e; }
    }
    if (gd) return gd.dir;
    if (hi) return hi.dir;
    return d0;
  }

  // Ground height of a world position above sea (negative = under water)
  function groundAbove(pl, pos) { const d = pos.clone().normalize(); return hAbove(pl, d); }
  function isDry(pl, pos, margin) { return groundAbove(pl, pos) >= (margin === undefined ? PROP_MARGIN : margin); }
  // Nearest dry surface point to `pos` (world position, any height). Returns the surface point (never below sea).
  function dryPoint(pl, pos, margin, maxRad) {
    margin = margin === undefined ? PROP_MARGIN : margin;
    const d = pos.clone().normalize();
    if (hAbove(pl, d) >= margin) return d.multiplyScalar(pl.surfaceRadius(d));
    const b = basis(d);
    for (let rad = 1.5; rad <= (maxRad || 60); rad += 1.5) for (let k = 0; k < 16; k++) {
      const q = off(pl, d, b, k / 16 * Math.PI * 2 + rad, rad);
      if (hAbove(pl, q) >= margin && pl.slopeAt(q) < 0.6) return q.multiplyScalar(pl.surfaceRadius(q));
    }
    return d.multiplyScalar(Math.max(pl.surfaceRadius(d), pl.seaRadius));
  }
  // Rival-site list for a campaign: >= minHome from home, >= minGap apart, all strict-dry; deterministic from rng.
  function pickRivals(pl, hd, rng, fixed, count, minHome, minGap) {
    const out = [];
    const okFar = (q) => arc(pl, q, hd) > minHome && out.every((s) => arc(pl, s, q) > minGap);
    (fixed || []).forEach((s) => { if (out.length >= count) return; const f = pickDry(pl, s, { maxR: 40, accept: okFar }); if (okFar(f) && evaluate(pl, f).h >= MARGIN) out.push(f); });
    for (let k = 0; out.length < count && k < 3000; k++) {
      const z = rng.range(-1, 1), a = rng.range(0, Math.PI * 2), s = Math.sqrt(1 - z * z), q = new V3(s * Math.cos(a), z, s * Math.sin(a));
      if (!okFar(q) || arc(pl, q, hd) > pl.radius * Math.PI - k * 0.05 - 10) continue;
      if (evaluate(pl, q).ok) out.push(q);
    }
    // relax spacing, then pick the best dry spot anywhere
    for (let g = 0; out.length < count && g < 6; g++) {
      const q = pickDry(pl, fib(g * 37 + out.length * 11, 500), { maxR: 20, accept: (c) => arc(pl, c, hd) > minHome * 0.7 && out.every((s) => arc(pl, s, c) > minGap * 0.5) });
      if (hAbove(pl, q) >= MARGIN) out.push(q);
    }
    for (let i = 0; out.length < count && i < 5000; i++) { const q = fib(i, 5000); if (hAbove(pl, q) >= MARGIN && out.every((s) => arc(pl, s, q) > 8)) out.push(q); }
    return out;
  }

  SP.tribalSites = { MARGIN, CENTRE, PROP_MARGIN, RING, evaluate, pickDry, pickRivals, isDry, groundAbove, dryPoint, basis, off, arc: (pl, a, b) => arc(pl, a, b) };
})();
