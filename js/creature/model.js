/* SP.creature — design schema, validation, cost, complexity, stats (DESIGN.md §3.2/3.3). Pure, no THREE needed. */
(function () {
  'use strict';
  const SP = window.SP = window.SP || {};
  const C = SP.creature = SP.creature || {};

  const M0 = 4.7; // reference mass = the default starter (C-17)
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const ABIL = ['bite', 'charge', 'strike', 'spit', 'sing', 'dance', 'charm', 'pose', 'speed', 'sprint', 'sneak', 'jump', 'glide', 'health'];
  const GAIT = {
    slither: { speedMul: 0.75, accelMul: 1.2, turnMul: 1.0, stab: 1.2, slopeGrip: 0.7 },
    biped: { speedMul: 1.0, accelMul: 1.4, turnMul: 1.25, stab: 0.8, slopeGrip: 1.0 },
    quad: { speedMul: 1.1, accelMul: 2.0, turnMul: 0.9, stab: 1.4, slopeGrip: 0.8 },
    multi: { speedMul: 0.9, accelMul: 2.6, turnMul: 0.8, stab: 1.6, slopeGrip: 1.2 },
    cell: { speedMul: 1, accelMul: 1, turnMul: 1, stab: 1, slopeGrip: 1 }
  };
  const MAX_COMPLEXITY = { creature: 32, cell: 12 };

  const def = (id) => SP.parts && SP.parts.get(id);
  const mm = (p) => (p.mirror ? 2 : 1);
  const CELL_FLAT = 0.8;   // cell body half-thickness / radius (plump 3D body; was 0.5 when the cell stage was a flat top-down view)

  function clone(d) { return JSON.parse(JSON.stringify(d)); }

  // ---- water (DESIGN 3.6): material density of a part relative to water (1.0). `dens` on the PartDef wins; otherwise by slot.
  // displaced volume of a part = mass / dens, so dens < 1 (air sacs, wings, fuzz) floats and dens > 1 (bone, armour) sinks.
  const SLOT_DENS = { mouth: 1.15, eye: 0.95, leg: 1.9, arm: 1.5, hand: 1.4, foot: 1.7, surface: 1.0 };
  const CAT_DENS = { weapons: 2.0, social: 0.8, detail: 1.0 };
  function partDens(d) { return d.dens !== undefined ? d.dens : (CAT_DENS[d.category] !== undefined && d.slot === 'surface' ? CAT_DENS[d.category] : (SLOT_DENS[d.slot] || 1.0)); }
  const FAT_VOL = 1.12;      // soft tissue, fat and lungs make the spine volume count 12% larger than its mass

  // ---------------------------------------------------------------- default designs
  let _u = 0;
  function nuid() { return 'p' + (++_u).toString(36) + Math.floor(Math.random() * 1e4).toString(36); }

  function defaultDesign(kind) {
    kind = kind || 'creature';
    if (kind === 'cell') {
      const f = nuid();
      return {
        v: 1, kind: 'cell', name: 'Cell', spine: [{ p: [0, 0, -0.35], r: 0.6 }, { p: [0, 0, 0.35], r: 0.55 }],
        parts: [
          { uid: nuid(), id: 'cell_filter', v: 1, o: [0, 0, 0.5], n: [0, 0, 1], s: 1, rot: 0, mirror: false },
          { uid: f, id: 'cell_flagellum', v: 0, o: [0, 0, -0.55], n: [0, 0, -1], s: 1, rot: 0, mirror: false }
        ],
        colors: { base: 0x22c55e, accent: 0xfffbeb, detail: 0x1e293b, pattern: 'none' }, outfit: []
      };
    }
    const leg = nuid(), arm = nuid();
    const d = {
      v: 1, kind: 'creature', name: 'Primordialing',
      spine: [
        { p: [0, 0.9, -1.0], r: 0.3 }, { p: [0, 1.05, -0.45], r: 0.62 }, { p: [0, 1.15, 0.15], r: 0.68 },
        { p: [0, 1.3, 0.7], r: 0.5 }, { p: [0, 1.4, 1.1], r: 0.5 }
      ],
      parts: [
        { uid: nuid(), id: 'mouth_chomp_1', v: 4, o: [0, -0.12, 0.45], n: [0, -0.15, 1], s: 1, rot: 0, mirror: false },
        { uid: nuid(), id: 'eye_round_1', v: 4, o: [0.26, 0.28, 0.33], n: [0.5, 0.55, 0.67], s: 1, rot: 0, mirror: true },
        { uid: leg, id: 'leg_stub_1', v: 1, o: [0.4, -0.45, 0], n: [0.75, -0.65, 0], s: 1, rot: 0, mirror: true, len: 1.2, bend: 0.5 },
        { uid: nuid(), id: 'foot_stub_1', v: 1, o: [0.4, -0.45, 0], n: [0, -1, 0], s: 1, rot: 0, mirror: true, attach: leg },
        { uid: arm, id: 'arm_noodle_1', v: 3, o: [0.4, -0.15, 0.05], n: [1, 0, 0], s: 1, rot: 0, mirror: true, len: 0.9, bend: -0.5 },
        { uid: nuid(), id: 'hand_paw_1', v: 3, o: [0.4, -0.15, 0.05], n: [1, 0, 0], s: 1, rot: 0, mirror: true, attach: arm },
        { uid: nuid(), id: 'tail_tuft_1', v: 0, o: [0, 0, -0.25], n: [0, 0.2, -1], s: 1, rot: 0, mirror: false }
      ],
      colors: { base: 0x22c55e, accent: 0xfffbeb, detail: 0x1e293b, pattern: 'belly' }, outfit: []
    };
    return d;
  }

  // ---------------------------------------------------------------- surface helper (for editors/gen)
  // Returns {o, n} for direction dir (unit-ish [x,y,z]) from vertebra v: tube surface, spherical caps at the ends.
  function surfacePoint(design, v, dir) {
    const sp = design.spine, n = sp.length, r = sp[v].r;
    let dx = dir[0], dy = dir[1], dz = dir[2];
    let l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
    const a = sp[Math.max(0, v - 1)].p, b = sp[Math.min(n - 1, v + 1)].p;
    let tx = b[0] - a[0], ty = b[1] - a[1], tz = b[2] - a[2];
    const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
    const along = dx * tx + dy * ty + dz * tz;
    const cap = (v === n - 1 && along > 0) || (v === 0 && along < 0);
    if (!cap && n > 1) { dx -= along * tx; dy -= along * ty; dz -= along * tz; l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l; }
    return { o: [dx * r, dy * r, dz * r], n: [dx, dy, dz] };
  }

  // ---------------------------------------------------------------- layout (shared by stats + mesh): leg instances, body lift
  function layout(design) {
    const sp = design.spine, isCell = design.kind === 'cell';
    const flat = isCell ? CELL_FLAT : 1;
    const legs = [], arms = [];
    const byUid = {};
    design.parts.forEach((p) => { byUid[p.uid] = p; });
    design.parts.forEach((p) => {
      const d = def(p.id); if (!d || (d.slot !== 'leg' && d.slot !== 'arm')) return;
      const node = sp[p.v] || sp[sp.length - 1];
      const len = clamp(p.len || 1.2, 0.3, 3);
      const lb = d.limb || {};
      const rf = Math.min(lb.rf || 0.84, 0.84), splay = lb.splay === undefined ? 0.2 : lb.splay;
      let ankle = 0.1;
      if (d.slot === 'leg') {
        const f = design.parts.find((q) => q.attach === p.uid && def(q.id) && def(q.id).slot === 'foot');
        if (f) ankle = def(f.id).ankle || 0.12; else ankle = d.ankle || 0.1;
      }
      const sides = p.mirror ? [1, -1] : [Math.abs(p.o[0]) < 0.01 ? 0 : (p.o[0] > 0 ? 1 : -1)];
      sides.forEach((sd) => {
        const ox = p.mirror ? p.o[0] * sd : p.o[0];
        const hip = [node.p[0] + ox, node.p[1] + p.o[1], node.p[2] + p.o[2]];
        const inst = { part: p, def: d, side: sd, len: len, hip: hip, ankle: ankle, rf: rf, splay: splay, vert: len * Math.sqrt(Math.max(0.01, rf * rf - splay * splay)) };
        (d.slot === 'leg' ? legs : arms).push(inst);
      });
    });
    let minY = Infinity, maxY = -Infinity;
    sp.forEach((s) => { minY = Math.min(minY, s.p[1] - s.r * flat); maxY = Math.max(maxY, s.p[1] + s.r * flat); });
    let lift = -minY;
    const all = legs;
    let grounded = all, loose = [];
    if (all.length) {
      lift = -Infinity;
      all.forEach((l) => { l.need = l.vert + l.ankle - l.hip[1]; lift = Math.max(lift, l.need); });
      // C-03: a leg only counts if it can reach the ground (within IK slack of the longest reach). Others are decorative limbs.
      grounded = []; loose = [];
      all.forEach((l) => { (l.need >= lift - (0.25 + 0.08 * l.len) ? grounded : loose).push(l); });
      loose.forEach((l) => { l.deco = true; arms.push(l); });
    }
    return { legs: grounded, arms: arms, decor: loose, lift: lift, minY: minY, maxY: maxY, height: maxY + lift };
  }

  // ---------------------------------------------------------------- complexity / cost / validate
  function complexity(design) {
    let v = design.spine.length * 0.5;
    design.parts.forEach((p) => { const d = def(p.id); if (d) v += d.complexity * mm(p); });
    (design.outfit || []).forEach((p) => { const d = def(p.id); if (d) v += d.complexity * mm(p) * 0.5; });
    return { value: v, max: MAX_COMPLEXITY[design.kind] || 32 };
  }
  // cost of the body parts (and outfit). `unlocked` is accepted for API symmetry; locked parts are still priced.
  function cost(design, unlocked) {
    let c = 0;
    design.parts.forEach((p) => { const d = def(p.id); if (d) c += d.cost * mm(p); });
    (design.outfit || []).forEach((p) => { const d = def(p.id); if (d) c += d.cost * mm(p); });
    return c;
  }

  function validate(design) {
    const errors = [], warnings = [];
    if (!design || !design.spine || !design.parts) return { ok: false, errors: ['malformed design'], warnings: warnings };
    const cell = design.kind === 'cell';
    const nmin = 1, nmax = cell ? 5 : 14, nmin2 = cell ? 1 : 3;
    if (design.spine.length < nmin2 || design.spine.length > nmax) errors.push('Spine needs ' + nmin2 + '-' + nmax + ' vertebrae');
    design.spine.forEach((s, i) => { if (s.r < 0.25 || s.r > 1.6) warnings.push('Vertebra ' + i + ' radius outside 0.25-1.6'); });
    let mouths = 0; const uids = {};
    design.parts.forEach((p) => {
      const d = def(p.id);
      if (!d) { errors.push('Unknown part ' + p.id); return; }
      uids[p.uid] = 1;
      if (d.kind !== design.kind) errors.push(d.name + ' does not belong in a ' + design.kind + ' design');
      if (p.v < 0 || p.v >= design.spine.length) errors.push(d.name + ' anchored to missing vertebra');
      if (p.s < 0.5 - 1e-6 || p.s > 2 + 1e-6) warnings.push(d.name + ' scale outside 0.5-2');
      if ((d.slot === 'leg' || d.slot === 'arm') && (p.len < 0.6 - 1e-6 || p.len > 2.5 + 1e-6)) warnings.push(d.name + ' length outside 0.6-2.5');
      if (d.slot === 'mouth') mouths += 1;
    });
    design.parts.forEach((p) => { if (p.attach && !uids[p.attach]) warnings.push('Orphan foot/hand ' + p.id); });
    if (!mouths) errors.push('No mouth: your creature cannot eat');
    if (!design.parts.some((p) => def(p.id) && def(p.id).slot === 'eye')) warnings.push('No eyes');
    if (!cell && layout(design).decor.length) warnings.push("Leg doesn't reach the ground");
    const cx = complexity(design);
    if (cx.value > cx.max) errors.push('Over complexity limit (' + cx.value.toFixed(1) + '/' + cx.max + ')');
    return { ok: errors.length === 0, errors: errors, warnings: warnings };
  }

  // ---------------------------------------------------------------- stats
  function stats(design, opts) {
    opts = opts || {};
    const brain = opts.brainLevel === undefined ? 1 : opts.brainLevel;
    const sp = design.spine, cell = design.kind === 'cell';
    const lay = layout(design);

    // mass
    let mass = 0;
    sp.forEach((s) => { mass += (4 / 3) * Math.PI * s.r * s.r * s.r * (cell ? 0.5 : 1); });
    const ab = {}; ABIL.forEach((k) => { ab[k] = 0; });
    let fin = 0, hasH = false, hasC = false, hasO = false, thrust = 0.6, turn = 0.5, burst = 0, ram = 0, poison = 0, zap = 0;
    let legSpd = 0, footSpd = 0, limbSpd = 0; // C-04: leg/foot speed does not stack per instance
    let spineVol = 0, partVol = 0, lung = 0, gill = 0, snorkel = 0, refill = 1;
    sp.forEach((s_) => { spineVol += (4 / 3) * Math.PI * s_.r * s_.r * s_.r * (cell ? 0.5 : 1); });
    const groundUids = {}; lay.legs.forEach((l) => { groundUids[l.part.uid] = 1; });
    design.parts.forEach((p) => {
      const d = def(p.id); if (!d) return;
      const k = mm(p);
      let m = d.mass;
      if (d.slot === 'leg' || d.slot === 'foot') {
        const sv = (d.abilities && d.abilities.speed) || 0;
        limbSpd += sv * k;
        const ok = d.slot === 'leg' ? groundUids[p.uid] : groundUids[p.attach];
        if (ok) { if (d.slot === 'leg') legSpd = Math.max(legSpd, sv); else footSpd = Math.max(footSpd, sv); }
      }
      if (d.slot === 'leg' || d.slot === 'arm') m = d.mass * (p.len || 1.2);
      mass += m * k;
      partVol += (m * k) / Math.max(0.05, partDens(d));
      if (d.lung) lung += d.lung * k;
      if (d.gill) gill += d.gill * k;
      if (d.snorkel) snorkel = Math.max(snorkel, d.snorkel);
      if (d.refill) refill = Math.max(refill, d.refill);
      for (const a in d.abilities) ab[a] = (ab[a] || 0) + d.abilities[a] * k;
      if (d.fin) fin += d.fin * k;
      if (d.diet === 'herbivore') hasH = true; else if (d.diet === 'carnivore') hasC = true; else if (d.diet === 'omnivore') hasO = true;
      if (d.cell) { thrust += (d.cell.thrust || 0) * k; turn += (d.cell.turn || 0) * k; burst += (d.cell.burst || 0) * k; ram += (d.cell.ram || 0) * k; poison += d.cell.poison || 0; zap += d.cell.zap || 0; }
    });
    ab.speed = Math.max(0, ab.speed - limbSpd) + legSpd + footSpd;
    ABIL.forEach((k) => { ab[k] = Math.min(5, ab[k]); });
    const outfit = { social: 0, attack: 0, health: 0, gather: 0 };
    (design.outfit || []).forEach((p) => {
      const d = def(p.id); if (!d) return;
      mass += d.mass * mm(p) * 0.5;
      partVol += d.mass * mm(p) * 0.5 / Math.max(0.05, partDens(d));
      if (d.outfitBonus) for (const k in outfit) outfit[k] += (d.outfitBonus[k] || 0) * mm(p);
    });
    const diet = (hasO || (hasH && hasC)) ? 'omnivore' : hasH ? 'herbivore' : hasC ? 'carnivore' : 'none';

    // size
    let length = 0;
    for (let i = 1; i < sp.length; i++) length += Math.hypot(sp[i].p[0] - sp[i - 1].p[0], sp[i].p[1] - sp[i - 1].p[1], sp[i].p[2] - sp[i - 1].p[2]);
    length += sp[0].r + sp[sp.length - 1].r;
    const cen = [0, 0, 0]; sp.forEach((s) => { cen[0] += s.p[0] / sp.length; cen[1] += s.p[1] / sp.length; cen[2] += s.p[2] / sp.length; });
    let radius = 0; sp.forEach((s) => { radius = Math.max(radius, Math.hypot(s.p[0] - cen[0], s.p[1] - cen[1], s.p[2] - cen[2]) + s.r); });
    radius = Math.max(0.4, radius * 0.85);

    const m = mass / M0;
    const S = { mass: mass, height: lay.height, length: length, radius: radius };

    if (cell) {
      const size = Math.max(0.3, radius);
      const drag = 2.5 * (0.7 + 0.3 * size);
      S.legs = 0; S.legPairs = 0; S.gait = 'cell'; S.asym = 0; S.legLength = 0;
      S.thrust = thrust; S.drag = drag; S.turn = turn;
      S.topSpeed = (thrust * 2.2) / drag * 2.2;
      S.accel = thrust * 3 / Math.sqrt(Math.max(0.3, mass));
      S.turnRate = (2.2 + turn * 1.8) / (0.6 + 0.4 * size);
      S.ramDamage = (4 + 4 * ram + 3 * ab.strike) * Math.sqrt(Math.max(0.5, mass));
      S.burst = burst; S.poison = poison; S.zap = zap;
      S.jumpV = 0; S.glide = 0; S.swim = 1; S.stability = mass;
      S.health = 20 + 8 * mass + 15 * ab.health;
      S.sprintMul = 1 + 0.4 * burst / 3 + 0.2; S.sprintTime = 1 + 0.3 * burst; S.sprintCooldown = Math.max(3, 8 - burst);
      S.abilities = ab; S.diet = diet; S.outfit = outfit; S.slopeGrip = 1;
      S.volume = mass; S.density = 1; S.buoyancy = 0; S.swimPower = 5; S.waterClass = 'swimmer'; S.swimSpeed = S.topSpeed; S.sinkRate = 0; S.diveDepth = 0;
      S.gill = 1; S.snorkel = 0; S.breathRefill = 1; S.breath = 999; S.drownRate = 0;
      return S;
    }

    // legs / gait
    const legs = lay.legs;
    let left = 0, right = 0, Lsum = 0;
    legs.forEach((l) => { if (l.side > 0) left++; else if (l.side < 0) right++; Lsum += l.len; });
    const nL = legs.length;
    const L = nL ? Lsum / nL : 0;
    if (!nL && !cell) ab.sneak = Math.min(5, ab.sneak + 2); // slitherers are the sneakiest
    const asym = Math.abs(left - right);
    const gait = nL === 0 ? 'slither' : nL <= 2 ? 'biped' : nL <= 4 ? 'quad' : 'multi';
    const G = GAIT[gait];
    // slither: implicit speed level 2 and an effective leg length of 0.7 (usable base speed, ~0.75x a biped)
    const s = nL ? ab.speed : Math.max(2, ab.speed);
    if (!nL) ab.speed = s;
    let topSpeed = (3.8 + 1.1 * s) * G.speedMul * Math.pow(nL ? clamp(L, 0.5, 2.5) : 0.7, 0.35) * Math.pow(m, -0.25) * (1 - 0.12 * asym);
    if (nL === 3) topSpeed *= 0.95;
    if (nL === 1) topSpeed *= 0.9;
    const bodyLength = length + L;
    S.legs = nL; S.legPairs = Math.ceil(nL / 2); S.gait = gait; S.asym = asym; S.legLength = L;
    S.topSpeed = topSpeed;
    S.accel = topSpeed * G.accelMul * Math.pow(m, -0.5);
    S.turnRate = 3.2 * G.turnMul * Math.pow(m, -0.3) / (0.6 + 0.15 * bodyLength);
    S.jumpV = ab.jump > 0 ? (4 + 1.5 * ab.jump) * Math.pow(m, -0.3) : (gait === 'slither' ? 0 : 4.0);
    S.glide = ab.glide;
    S.fallCap = 2 + (5 - ab.glide) * 1.5;
    S.swim = 0.45 + 0.15 * Math.min(5, fin);
    S.stability = mass * G.stab;
    S.slopeGrip = G.slopeGrip;
    S.health = 40 + 25 * Math.pow(mass, 0.6) + 25 * ab.health + brain * 20;
    S.sprintMul = 1.4 + 0.12 * ab.sprint;
    S.sprintTime = 1.5 + 0.5 * ab.sprint;
    S.sprintCooldown = 10 - ab.sprint;
    S.abilities = ab; S.diet = diet; S.outfit = outfit;
    waterStats(S, { spineVol: spineVol, partVol: partVol, lung: lung, gill: gill, snorkel: snorkel, refill: refill, fin: fin, nL: nL, ab: ab, mass: mass });
    return S;
  }

  // ---------------------------------------------------------------- water: volume, density, class, breath (DESIGN 3.6)
  const WATER_CLS = { floatMax: 1.0, swimPow: 3 };
  function waterStats(S, w) {
    const mass = w.mass;
    const swimPow = Math.min(5, w.fin + (w.nL === 0 ? 2 : 0));       // fins, flippers, webbed feet; snakes/eels undulate (+2)
    const volume = Math.max(0.05, w.spineVol * FAT_VOL + w.partVol);
    const density = mass / volume;
    let cls;
    if (swimPow >= WATER_CLS.swimPow && density < 1.18 + 0.05 * swimPow) cls = 'swimmer';
    else cls = density <= WATER_CLS.floatMax ? 'floater' : 'sinker';
    const gill = Math.min(0.95, w.gill);
    S.volume = volume; S.density = density; S.buoyancy = 1 - density;        // + floats, - sinks (fraction of weight)
    S.swimPower = swimPow; S.waterClass = cls;
    const top = S.topSpeed;
    const mul = cls === 'swimmer' ? Math.min(1.0, 0.5 + 0.1 * swimPow) : cls === 'floater' ? 0.26 + 0.05 * swimPow : 0.28;
    S.swimSpeed = Math.max(0.9, top * mul);
    S.sinkRate = cls === 'sinker' ? clamp(0.8 + 3.0 * (density - 1), 0.8, 2.6) : 0;
    S.diveDepth = cls === 'swimmer' ? 1.3 + 0.4 * swimPow : 0;                 // how far below the surface a swimmer may dive
    S.gill = gill; S.snorkel = w.snorkel; S.breathRefill = w.refill;
    S.breath = clamp(12 + 3.2 * Math.sqrt(Math.max(0, mass)) + 1.5 * (w.ab.health || 0) + w.lung, 8, 150);
    S.drownRate = 0.09;                                                       // fraction of max health per second once breath is empty
    return S;
  }

  Object.assign(C, {
    defaultDesign: defaultDesign, clone: clone, validate: validate, cost: cost, complexity: complexity, stats: stats,
    layout: layout, partDens: partDens, surfacePoint: surfacePoint, CELL_FLAT: CELL_FLAT, uid: nuid, ABILITIES: ABIL, MAX_COMPLEXITY: MAX_COMPLEXITY
  });
})();
