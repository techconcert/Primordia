/* SP.creature.generate(rng, opts) — varied, charming, valid designs from the shared catalog. */
(function () {
  'use strict';
  const SP = window.SP = window.SP || {};
  const C = SP.creature = SP.creature || {};

  const PALETTE = [0x22c55e, 0x06b6d4, 0xa855f7, 0xf97316, 0xf43f5e, 0xeab308, 0x38bdf8, 0x84cc16, 0xec4899, 0x14b8a6, 0x92400e, 0x475569];
  const CREAM = 0xfffbeb, DARK = 0x1e293b;
  const SIZE = { tiny: 0.34, small: 0.52, medium: 0.78, large: 1.2, epic: 1.9 };
  const MAXTIER = { tiny: 2, small: 3, medium: 4, large: 4, epic: 4 };
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const SYL = ['bo', 'ka', 'zu', 'mi', 'ra', 'fle', 'gru', 'pi', 'to', 'sna', 'lo', 'vex', 'du', 'ne', 'qua', 'bli', 'mon', 'tek', 'wob', 'zi'];

  function pickPart(rng, cat, maxTier, filter) {
    let l = SP.parts.list.filter((p) => p.kind === 'creature' && p.category === cat && p.tier <= maxTier && (!filter || filter(p)));
    if (!l.length) l = SP.parts.list.filter((p) => p.kind === 'creature' && p.category === cat && (!filter || filter(p)));
    return rng.pick(l);
  }

  function generate(rng, opts) {
    opts = opts || {};
    if (!rng || !rng.next) rng = SP.util.rng(rng === undefined ? Math.floor(Math.random() * 1e9) : rng);
    if (opts.kind === 'cell') return genCell(rng, opts);
    const tier = opts.sizeTier || rng.pick(['small', 'medium', 'medium', 'large', 'tiny']);
    const rs = SIZE[tier] * rng.range(0.9, 1.1);
    const maxTier = opts.maxTier || MAXTIER[tier];
    const diet = opts.diet || rng.pick(['herbivore', 'carnivore', 'omnivore']);
    const temper = opts.temperament || rng.pick(['skittish', 'passive', 'territorial', 'aggressive']);
    const cxK = opts.complexity === undefined ? rng.range(0.35, 0.8) : opts.complexity;
    const budget = 10 + cxK * 18;
    // ---- plan
    let plan = opts.gaitHint;
    if (!plan) { const r = rng.next(); plan = r < 0.3 ? 'biped' : r < 0.66 ? 'quad' : r < 0.82 ? 'multi' : r < 0.91 ? 'slither' : r < 0.96 ? 'hopper' : 'tripod'; }
    const shapes = { biped: ['upright', 'upright', 'blob'], hopper: ['upright', 'blob'], quad: ['arch', 'long', 'tank', 'blob'], tripod: ['blob', 'arch'], multi: ['long', 'worm', 'tank'], slither: ['worm', 'long', 'worm'] };
    const shape = rng.pick(shapes[plan] || ['blob']);
    const dsg = {
      v: 1, kind: 'creature', name: rng.pick(SYL) + rng.pick(SYL) + rng.pick(['', rng.pick(SYL)]), seed: Math.floor(rng.next() * 1e9),
      spine: [], parts: [], colors: {}, outfit: []
    };
    dsg.name = dsg.name[0].toUpperCase() + dsg.name.slice(1);

    // ---- spine
    let n, len, fat, headK, neck = false;
    switch (shape) {
      case 'blob': n = rng.int(3, 4); len = 2.0 * rs * rng.range(1.0, 1.5); fat = rng.range(1.0, 1.25); headK = rng.range(0.7, 0.9); break;
      case 'upright': n = rng.int(4, 6); len = 3.2 * rs * rng.range(0.9, 1.2); fat = rng.range(0.8, 1.05); headK = rng.range(0.55, 0.8); break;
      case 'tank': n = rng.int(3, 5); len = 3.2 * rs * rng.range(1.0, 1.3); fat = rng.range(1.0, 1.2); headK = rng.range(0.5, 0.7); break;
      case 'arch': n = rng.int(4, 6); len = 3.4 * rs * rng.range(0.9, 1.3); fat = rng.range(0.7, 0.95); headK = rng.range(0.55, 0.75); neck = rng.chance(0.3); break;
      case 'long': n = rng.int(6, 9); len = 4.8 * rs * rng.range(0.9, 1.4); fat = rng.range(0.5, 0.75); headK = rng.range(0.6, 0.9); break;
      default: n = rng.int(7, 11); len = 5.0 * rs * rng.range(0.9, 1.5); fat = rng.range(0.45, 0.7); headK = rng.range(0.8, 1.0); break; // worm
    }
    const rBase = rs * fat;
    const tailThin = rng.range(0.3, 0.55);
    const archAmp = shape === 'upright' ? len * 0.38 : shape === 'arch' ? len * 0.1 : shape === 'blob' ? rs * 0.15 : 0;
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      let r = rBase * (tailThin + (1 - tailThin) * Math.sin(Math.min(1, u * 1.5 + 0.05) * Math.PI * 0.5 + 0.0) * 1.0);
      if (shape === 'worm' || shape === 'long') r = rBase * (0.55 + 0.55 * Math.sin(Math.PI * clamp(u * 0.9 + 0.05, 0, 1)) * 0.8) * (u < 0.15 ? 0.7 + u * 2 : 1);
      if (u > 0.82 && shape !== 'worm') r = rBase * (headK + (neck ? -0.25 : 0.1));
      if (neck && u > 0.5 && u < 0.85) r = rBase * 0.45;
      if (shape === 'upright' && u > 0.6 && u < 0.85) r *= 0.85;
      if (i === n - 1) r = Math.max(r, rBase * headK);
      r = clamp(r, 0.2, 2.4);
      const z = (u - 0.45) * len;
      let y = 0;
      if (shape === 'upright') y = Math.pow(u, 1.5) * archAmp;
      else if (shape === 'arch') y = Math.sin(u * Math.PI) * archAmp + (neck ? Math.pow(Math.max(0, u - 0.5) * 2, 2) * len * 0.35 : 0);
      else if (shape === 'blob') y = Math.sin(u * Math.PI) * archAmp;
      dsg.spine.push({ p: [0, +(rBase + y).toFixed(3), +z.toFixed(3)], r: +r.toFixed(3) });
    }
    const sk = clamp(rs / 0.7, 0.6, 2); // part scale
    const head = n - 1;
    const mk = (id, v, dir, o) => {
      o = o || {};
      const sp = C.surfacePoint(dsg, v, dir);
      const nv = sp.n.slice();
      if (o.n) { o.n.forEach((x, i) => { nv[i] = x; }); }
      const part = { uid: C.uid(), id: id, v: v, o: sp.o.map((x) => +x.toFixed(3)), n: nv.map((x) => +x.toFixed(3)), s: +clamp(o.s || 1, 0.5, 2).toFixed(2), rot: o.rot || 0, mirror: !!o.mirror };
      if (o.len !== undefined) { part.len = +clamp(o.len, 0.6, 2.5).toFixed(2); part.bend = o.bend === undefined ? 0.5 : o.bend; }
      if (o.attach) part.attach = o.attach;
      if (o.color) part.color = o.color;
      dsg.parts.push(part);
      return part;
    };

    // ---- legs
    const legBase = clamp(rs * rng.range(1.0, 1.7) + 0.35, 0.65, 2.5);
    const legPool = SP.parts.list.filter((p) => p.slot === 'leg' && p.tier <= maxTier);
    const feetPool = SP.parts.list.filter((p) => p.slot === 'foot' && p.tier <= maxTier);
    const addLeg = (v, mirror, lenMul, dirx, legDef, centered) => {
      const dir = centered ? [0, -1, 0] : [dirx === undefined ? 0.85 : dirx, -0.55, 0];
      const lp = mk(legDef.id, v, dir, { s: clamp(sk * 0.9, 0.6, 1.6), mirror: mirror && !centered, len: legBase * lenMul });
      const insect = legDef.limb.pole === 'up';
      if (insect) lp.bend = 0;
      let foot;
      if (legDef.id === 'leg_flipper_2' || legDef.id === 'leg_tentacle_3') foot = null;
      else if (legDef.id === 'leg_digi_3' || legDef.id === 'leg_rocket_4') foot = rng.pick(feetPool.filter((f) => /claw|pad|hoof|toes/.test(f.id)));
      else foot = rng.pick(feetPool);
      if (foot && rng.chance(0.85)) {
        const fp = mk(foot.id, v, [0, -1, 0], { s: clamp(sk * 0.9, 0.6, 1.8), mirror: mirror && !centered, attach: lp.uid });
        fp.o = lp.o.slice(); fp.n = [0, -1, 0];
      }
      return lp;
    };
    const legDef = rng.pick(legPool.filter((p) => plan === 'multi' ? /bug|stub|tentacle|lanky|pillar/.test(p.id) : (plan === 'hopper' ? /spring|digi|rocket|stub/.test(p.id) : true)));
    const lowN = (f) => Math.max(0, Math.min(n - 2, Math.round((n - 1) * f)));
    if (plan === 'biped') addLeg(lowN(0.38), true, 1, 0.8, legDef);
    else if (plan === 'hopper') addLeg(lowN(0.4), false, 1.25, 0, legDef, true);
    else if (plan === 'quad') { addLeg(lowN(0.25), true, 1, 0.8, legDef); addLeg(lowN(0.72), true, rng.range(0.85, 1.1), 0.8, legDef); }
    else if (plan === 'tripod') { addLeg(lowN(0.7), true, 1, 0.8, legDef); addLeg(lowN(0.2), false, 1, 0, legDef, true); }
    else if (plan === 'multi') {
      const pairs = rng.int(3, Math.min(6, Math.max(3, n - 2)));
      for (let i = 0; i < pairs; i++) addLeg(lowN(0.18 + 0.64 * (i / (pairs - 1))), true, 0.95, 0.9, legDef);
    }
    // ---- equalise leg reach so every foot meets the ground whatever the spine height at its hip
    (function () {
      const legsP = dsg.parts.filter((p) => SP.parts.get(p.id).slot === 'leg');
      if (legsP.length < 2) return;
      const info = legsP.map((p) => {
        const d = SP.parts.get(p.id), lb = d.limb, rf = Math.min(lb.rf, 0.84);
        const f = dsg.parts.find((q) => q.attach === p.uid), ank = f ? (SP.parts.get(f.id).ankle || 0.12) : (d.ankle || 0.1);
        const fac = Math.sqrt(rf * rf - lb.splay * lb.splay), hipY = dsg.spine[p.v].p[1] + p.o[1];
        return { p: p, fac: fac, ank: ank, hipY: hipY };
      });
      const gy = Math.min.apply(null, info.map((i) => i.hipY - i.p.len * i.fac - i.ank));
      info.forEach((i) => { i.p.len = +clamp((i.hipY - gy - i.ank) / i.fac, 0.6, 2.5).toFixed(2); });
    })();
    // ---- head: mouth + eyes
    const mouthPool = SP.parts.list.filter((p) => p.slot === 'mouth' && p.kind === 'creature' && p.tier <= maxTier && (p.diet === diet));
    const mdef = rng.pick(mouthPool.length ? mouthPool : SP.parts.list.filter((p) => p.slot === 'mouth' && p.kind === 'creature'));
    mk(mdef.id, head, [0, -0.2, 1], { s: sk * rng.range(0.9, 1.25), n: null });
    const eyePool = SP.parts.list.filter((p) => p.slot === 'eye' && p.kind === 'creature' && p.tier <= maxTier);
    const edef = rng.pick(eyePool);
    const cyc = edef.id === 'eye_cyclops_3';
    const es = sk * rng.range(0.75, 1.1);
    if (cyc) mk(edef.id, head, [0, 0.45, 0.9], { s: es * 0.55 });
    else if (edef.id === 'eye_stalk_2') mk(edef.id, head, [0.3, 1, 0.1], { s: es, mirror: true });
    else mk(edef.id, head, [0.55, 0.5, 0.7], { s: es, mirror: true });
    // ---- arms
    if ((plan === 'biped' || plan === 'quad' || plan === 'hopper') && rng.chance(plan === 'biped' ? 0.8 : 0.35)) {
      const armPool = SP.parts.list.filter((p) => p.slot === 'arm' && p.tier <= maxTier);
      const handPool = SP.parts.list.filter((p) => p.slot === 'hand' && p.tier <= maxTier);
      const ad = rng.pick(armPool);
      const ap = mk(ad.id, Math.max(0, head - 1), [1, -0.2, 0.2], { s: sk * 0.9, mirror: true, len: clamp(legBase * rng.range(0.55, 0.9), 0.6, 2.2), bend: -0.5 });
      if (rng.chance(0.9)) { const hd = rng.pick(handPool); const hp = mk(hd.id, ap.v, [1, 0, 0], { s: sk * 0.95, mirror: true, attach: ap.uid }); hp.o = ap.o.slice(); }
    }
    // ---- extras by temperament / diet
    const extras = [];
    const aggressive = temper === 'aggressive' || temper === 'territorial' || diet === 'carnivore';
    const wp = SP.parts.list.filter((p) => p.category === 'weapons' && p.kind === 'creature' && p.tier <= maxTier);
    const wChoice = aggressive ? wp.filter((p) => /club|stinger|blade|nub|spit|spike|ram|horn/.test(p.id)) : wp.filter((p) => /nub|unicorn|ram|antler|spike_back|spit_sac/.test(p.id));
    if (wChoice.length && rng.chance(aggressive ? 0.75 : 0.5)) extras.push(['w', rng.pick(wChoice)]);
    if (rng.chance(0.55)) extras.push(['s', pickPart(rng, 'social', maxTier)]);
    if (rng.chance(0.4)) extras.push(['s', pickPart(rng, 'social', maxTier)]);
    if (plan !== 'slither' && rng.chance(0.8)) extras.push(['t', pickPart(rng, 'detail', maxTier, (p) => /^tail_|fin_tail/.test(p.id))]);
    if (rng.chance(0.18)) extras.push(['wing', pickPart(rng, 'detail', maxTier, (p) => /wing/.test(p.id))]);
    if (rng.chance(0.4)) extras.push(['d', pickPart(rng, 'detail', maxTier, (p) => /shell|plates|bumps|fuzz|ridge|pouch|spots|fin_dorsal/.test(p.id))]);
    extras.forEach((e) => {
      const d = e[1]; if (!d) return;
      const sc = clamp(sk * rng.range(0.85, 1.3), 0.5, 2);
      const mid = Math.max(1, Math.round((n - 1) * 0.55));
      switch (e[0]) {
        case 't': mk(d.id, 0, [0, 0.15, -1], { s: sc }); break;
        case 'wing': mk(d.id, mid, [0.5, 1, 0], { s: sc, mirror: true, n: [0.45, 0.9, 0] }); break;
        case 'w': {
          if (/horn|antler|nub|unicorn|ram/.test(d.id) && !/club|stinger/.test(d.id)) {
            if (d.id === 'horn_unicorn_2' || d.id === 'horn_nub_1') mk(d.id, head, [0, 1, 0.45], { s: sc });
            else mk(d.id, head, [0.45, 1, -0.1], { s: sc, mirror: true });
          } else if (/club|stinger/.test(d.id)) mk(d.id, 0, [0, 0.25, -1], { s: sc });
          else if (/spike_back/.test(d.id)) mk(d.id, mid, [0, 1, 0], { s: sc });
          else if (/spit/.test(d.id)) mk(d.id, head, [0.8, 0.2, 0.2], { s: sc, mirror: true });
          else if (/plate|blade/.test(d.id)) mk(d.id, head, [0, 1, 0.5], { s: sc });
          break;
        }
        case 's': {
          if (/frill/.test(d.id)) mk(d.id, head, [0, 0.2, -1], { s: sc * 0.8 });
          else if (/fan/.test(d.id)) mk(d.id, 0, [0, 0.8, -0.6], { s: sc });
          else if (/sac/.test(d.id)) mk(d.id, head, [0, -0.9, 0.3], { s: sc });
          else if (/ears/.test(d.id)) mk(d.id, head, [0.8, 0.8, -0.2], { s: sc, mirror: true });
          else if (/whisker/.test(d.id)) mk(d.id, head, [0.5, -0.1, 0.9], { s: sc, mirror: true });
          else if (/pom|plume|lure/.test(d.id)) mk(d.id, head, [0, 1, 0.1], { s: sc });
          else if (/drum/.test(d.id)) mk(d.id, mid, [0, -1, 0.2], { s: sc });
          else if (/mane/.test(d.id)) mk(d.id, Math.max(1, head - 1), [0, 1, 0], { s: sc });
          else if (/bell/.test(d.id)) mk(d.id, head, [0.4, 1, 0.1], { s: sc, mirror: true });
          break;
        }
        default: {
          if (/shell|plates/.test(d.id)) mk(d.id, mid, [0, 1, 0], { s: sc });
          else if (/fin_dorsal/.test(d.id)) mk(d.id, mid, [0, 1, 0], { s: sc });
          else if (/pouch/.test(d.id)) mk(d.id, mid, [0, -1, 0.4], { s: sc });
          else mk(d.id, mid, [0.3, 1, 0], { s: sc });
        }
      }
    });
    // ---- colours
    const pal = opts.palette;
    const base = pal && pal.base !== undefined ? pal.base : rng.pick(PALETTE);
    let accent = pal && pal.accent !== undefined ? pal.accent : (rng.chance(0.55) ? CREAM : rng.pick(PALETTE.filter((c) => c !== base)));
    const detail = pal && pal.detail !== undefined ? pal.detail : (rng.chance(0.6) ? DARK : rng.pick(PALETTE.filter((c) => c !== base && c !== accent)));
    dsg.colors = { base: base, accent: accent, detail: detail, pattern: pal && pal.pattern || rng.pick(['none', 'belly', 'belly', 'stripes', 'spots']) };
    // ---- trim to budget
    let guard = 0;
    while (C.complexity(dsg).value > Math.min(30, budget) && guard++ < 30) {
      let idx = -1;
      for (let i = dsg.parts.length - 1; i >= 0; i--) { const d = SP.parts.get(dsg.parts[i].id); if (d.slot === 'surface') { idx = i; break; } }
      if (idx < 0) break;
      dsg.parts.splice(idx, 1);
    }
    return dsg;
  }

  function genCell(rng, opts) {
    const diet = opts.diet || rng.pick(['herbivore', 'carnivore', 'omnivore']);
    const tier = opts.sizeTier || 'small';
    const rs = ({ tiny: 0.4, small: 0.6, medium: 0.8, large: 1.1, epic: 1.6 }[tier] || 0.6) * rng.range(0.9, 1.15);
    // silhouette: round, oval, bean (bent), star (spiky outline), lobed, worm (long and thin)
    const shape = opts.shape || rng.pick(['round', 'oval', 'oval', 'bean', 'bean', 'star', 'lobed', 'lobed', 'worm']);
    const n = { round: 1, star: 1, oval: rng.int(2, 3), bean: 3, lobed: 3, worm: 4 }[shape];
    const d = { v: 1, kind: 'cell', name: rng.pick(SYL) + rng.pick(SYL), seed: Math.floor(rng.next() * 1e9), spine: [], parts: [], colors: {}, outfit: [] };
    d.name = d.name[0].toUpperCase() + d.name.slice(1);
    if (shape === 'star' || shape === 'lobed') d.shape = shape;
    const len = n === 1 ? 0 : rs * (shape === 'worm' ? rng.range(1.7, 2.1) : shape === 'lobed' ? rng.range(0.9, 1.2) : rng.range(0.8, 1.6));
    for (let i = 0; i < n; i++) {
      const u = n === 1 ? 0.5 : i / (n - 1);
      let rk = shape === 'worm' ? 0.62 * (1 - 0.18 * u * u) : shape === 'lobed' ? (i === 1 ? 0.8 : 1) : shape === 'bean' ? (i === 1 ? 1.05 : 0.88) : 1;
      if (shape !== 'worm' && shape !== 'lobed' && shape !== 'bean') rk *= (i === n - 1 ? 0.85 : 1);
      const x = shape === 'bean' ? (i === 1 ? -0.3 * rs : 0) : shape === 'worm' && i > 0 ? Math.sin(i * 1.9) * 0.1 * rs : 0;
      d.spine.push({ p: [+x.toFixed(3), 0, +((u - 0.5) * len).toFixed(3)], r: +(rs * rk * rng.range(0.94, 1.06)).toFixed(3) });
    }
    const head = n - 1;
    const mk = (id, v, dir, o) => {
      o = o || {};
      const sp = C.surfacePoint(d, v, dir);
      const nv = sp.n;
      const p = { uid: C.uid(), id: id, v: v, o: sp.o.map((x) => +x.toFixed(3)), n: nv.map((x) => +x.toFixed(3)), s: o.s || 1, rot: 0, mirror: !!o.mirror };
      d.parts.push(p); return p;
    };
    const mouth = { herbivore: 'cell_filter', carnivore: 'cell_jaw', omnivore: 'cell_proboscis' }[diet];
    mk(mouth, head, [0, 0, 1], { s: clamp(rs / 0.6, 0.7, 1.6) });
    const mover = rng.pick(['cell_flagellum', 'cell_flagellum', 'cell_cilia', 'cell_jet', 'cell_flagellum_2']);
    if (mover === 'cell_cilia') mk(mover, 0, [1, 0, 0], { mirror: true }); else mk(mover, 0, [0, 0, -1]);
    if (rng.chance(0.7)) { const e = rng.pick(['cell_eye_bead', 'cell_eye_button', 'cell_eye_stalk']); mk(e, head, [0.75, 0.2, 0.6], { mirror: true, s: clamp(rs / 0.6, 0.8, 1.6) * rng.range(0.9, 1.2) }); }
    if (diet !== 'herbivore' || rng.chance(0.3)) { const w = rng.pick(['cell_spike', 'cell_poison', 'cell_electric', 'cell_horn']); mk(w, Math.floor(n / 2), [1, 0, 0.1], { mirror: true }); }
    if (rng.chance(0.3)) mk(rng.pick(['cell_armor', 'cell_lure', 'cell_pod']), 0, [0.9, 0, -0.5], { mirror: true });
    const base = rng.pick(PALETTE);
    d.colors = { base: base, accent: rng.chance(0.5) ? CREAM : rng.pick(PALETTE.filter((c) => c !== base)), detail: DARK, pattern: 'none' };
    let guard = 0;
    while (C.complexity(d).value > 11 && guard++ < 10) d.parts.pop();
    return d;
  }

  C.generate = generate;
})();
