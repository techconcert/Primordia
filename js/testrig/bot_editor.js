/* testrig editor bot — designs random-but-valid creatures / cells / ships / outfits.
 * HOW IT DRIVES THE EDITOR: it waits for the real editor to open (SP.game.openEditor -> SP.editor.open), reads the live session
 * with SP.editor._dbg() (design, budget, isUnlocked, mode), builds a candidate design from the real catalog (SP.parts / SP.assembly),
 * validates it with the editor's own SP.creature.validate / SP.assembly.validate + budget + complexity, writes it into the session
 * (S.design, S.dirty so the editor rebuilds its rig), types the name into the real input and presses the real Done button.
 * It does not click the 3D viewport (placement uses the same surface maths as gen.js: SP.creature.surfacePoint). */
(function () {
  'use strict';
  const SP = window.SP = window.SP || {};
  const T = SP.testrig; if (!T || !T.active) return;

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  let openT = 0, tries = 0, lastS = null, doneClicks = 0;
  const PALETTE = [0x22c55e, 0x06b6d4, 0xa855f7, 0xf97316, 0xf43f5e, 0xeab308, 0x38bdf8, 0x84cc16, 0xec4899, 0x14b8a6, 0x92400e, 0x475569];
  const MM = (p) => (p.mirror ? 2 : 1);

  function defOf(id) { return SP.parts.get(id); }
  function costOf(d) { return SP.creature.cost(d); }
  function net(S, d) { return costOf(d) - S.cost0; }
  function okDesign(S, d, budget) {
    const v = SP.creature.validate(d); if (!v.ok) return false;
    const cx = SP.creature.complexity(d); if (cx.value > cx.max) return false;
    if (budget !== null && budget !== undefined && net(S, d) > budget) return false;
    // never use parts that the player has not unlocked (the editor would refuse "Locked part")
    for (const p of d.parts) { const df = defOf(p.id); if (!df || (!S.isUnlocked(df) && !(S.grand && S.grand[p.id]))) return false; }
    return true;
  }
  function addAt(d, id, v, dir, o) {
    o = o || {};
    const sp = SP.creature.surfacePoint(d, clamp(v, 0, d.spine.length - 1), dir);
    const p = { uid: SP.creature.uid(), id: id, v: clamp(v, 0, d.spine.length - 1), o: sp.o.map((x) => +x.toFixed(3)), n: sp.n.map((x) => +x.toFixed(3)), s: o.s || 1, rot: 0, mirror: !!o.mirror };
    if (o.len) { p.len = o.len; p.bend = o.bend === undefined ? 0 : o.bend; }
    if (o.attach) p.attach = o.attach;
    d.parts.push(p); return p;
  }
  function cand(S, slotOrCat, filter) {
    return SP.parts.list.filter((p) => p.kind === S.design.kind && (p.slot === slotOrCat || p.category === slotOrCat) && S.isUnlocked(p) && (!filter || filter(p)));
  }
  function pick(a, rng) { return a.length ? rng.pick(a) : null; }

  // ------------------------------------------------------------------ creature from scratch
  function newCreature(S, rng, diet, budget, note) {
    const want = rng.pick(['swimmer', 'sinker', 'any', 'any']);   // exercise the water system: some seeds build a swimmer, some a sinker
    note.waterWant = want;
    for (let attempt = 0; attempt < 70; attempt++) {
      const d = SP.creature.defaultDesign('creature');
      d.name = S.design.name || d.name; d.parts = [];
      // shape: scale radii / length, random vertebra count between 4 and 7 by interpolation
      const nv = rng.int(4, 7), base = SP.creature.defaultDesign('creature').spine;
      const len = rng.range(0.8, 1.5), fat = rng.range(0.8, 1.3);
      d.spine = [];
      for (let i = 0; i < nv; i++) {
        const u = i / (nv - 1) * (base.length - 1), a = base[Math.floor(u)], b = base[Math.min(base.length - 1, Math.floor(u) + 1)], f = u - Math.floor(u);
        const lp = [0, 1, 2].map((k) => a.p[k] + (b.p[k] - a.p[k]) * f);
        d.spine.push({ p: [lp[0], +(0.9 + (lp[1] - 0.9) * rng.range(0.7, 1.3)).toFixed(3), +(lp[2] * len).toFixed(3)], r: +clamp((a.r + (b.r - a.r) * f) * fat * rng.range(0.9, 1.1), 0.26, 1.5).toFixed(3) });
      }
      const head = nv - 1, mid1 = Math.max(1, Math.floor(nv * 0.3)), mid2 = Math.max(mid1, Math.floor(nv * 0.6));
      // mouth matching the diet (omnivore mouths work for everyone; a diet-matching one is preferred)
      let mouths = cand(S, 'mouth', (p) => p.diet === diet);
      if (!mouths.length) mouths = cand(S, 'mouth', (p) => p.diet === 'omnivore');
      if (!mouths.length) mouths = cand(S, 'mouth');
      const mouth = pick(mouths, rng); if (!mouth) return null;
      addAt(d, mouth.id, head, [0, -0.15, 1], { s: rng.range(0.9, 1.3) });
      // eyes
      const eye = pick(cand(S, 'eye'), rng);
      if (eye) addAt(d, eye.id, head, [0.6, 0.5, 0.7], { s: rng.range(0.9, 1.4), mirror: true });
      // legs (+feet): biped (one pair) or quad (two pairs)
      const leg = pick(cand(S, 'leg'), rng);
      if (leg) {
        const lenL = rng.range(1.0, 1.7), pairs = rng.chance(0.55) ? [mid1, mid2] : [mid2];
        const foot = pick(cand(S, 'foot'), rng);
        pairs.forEach((v) => {
          const lp = addAt(d, leg.id, v, [0.9, -0.7, 0], { mirror: true, len: lenL, bend: 0.4 });
          if (foot) addAt(d, foot.id, v, [0.9, -0.7, 0], { mirror: true, attach: lp.uid });
        });
      }
      // arms (+hands)
      const arm = rng.chance(0.6) ? pick(cand(S, 'arm'), rng) : null;
      if (arm) {
        const ap = addAt(d, arm.id, mid1, [1, 0.1, 0.2], { mirror: true, len: rng.range(0.8, 1.4), bend: -0.4 });
        const hand = pick(cand(S, 'hand'), rng);
        if (hand) addAt(d, hand.id, mid1, [1, 0.1, 0.2], { mirror: true, attach: ap.uid });
      }
      // extra random parts from every other unlocked category (weapons / social / detail / extras)
      const extras = SP.parts.list.filter((p) => p.kind === 'creature' && ['weapons', 'social', 'detail', 'extras', 'movement'].indexOf(p.category) >= 0 && p.slot !== 'leg' && p.slot !== 'arm' && S.isUnlocked(p));
      const nEx = rng.int(2, 5);
      for (let i = 0; i < nEx && extras.length; i++) {
        const e = rng.pick(extras), v = rng.int(0, head);
        const dir = e.slot === 'surface' || true ? [rng.range(-1, 1), rng.range(-0.4, 1), rng.range(-1, 1)] : [0, 1, 0];
        const mir = Math.abs(dir[0]) > 0.35;
        addAt(d, e.id, v, dir, { s: rng.range(0.7, 1.4), mirror: mir });
      }
      if (want === 'swimmer') {
        ['tail_fluke_3', 'fin_tail_2', 'fin_dorsal_2', 'gills_frill_2'].forEach((id) => { const df = defOf(id); if (df && S.isUnlocked(df) && rng.chance(0.8)) addAt(d, id, id.indexOf('tail') >= 0 ? 0 : mid1, id.indexOf('tail') >= 0 ? [0, 0.1, -1] : [0, 1, 0.1], { s: rng.range(0.9, 1.3), mirror: id.indexOf('gills') >= 0 }); });
        d.parts.forEach((q) => { const df = defOf(q.id); if (df && df.slot === 'foot' && defOf('foot_web_2') && S.isUnlocked(defOf('foot_web_2'))) q.id = 'foot_web_2'; });
      }
      // colours
      d.colors = { base: rng.pick(PALETTE), accent: rng.chance(0.5) ? 0xfffbeb : rng.pick(PALETTE), detail: rng.chance(0.6) ? 0x1e293b : rng.pick(PALETTE), pattern: rng.pick(['none', 'stripes', 'spots', 'belly']) };
      d.name = S.design.name || d.name;
      // trim extras until it fits budget / complexity
      let g = 0;
      while (!okDesign(S, d, budget) && g++ < 30) {
        const idx = d.parts.map((p, i) => [p, i]).filter((x) => { const df = defOf(x[0].id); return df && ['mouth', 'eye', 'leg', 'foot'].indexOf(df.slot) < 0 && !x[0].attach; }).map((x) => x[1]);
        if (!idx.length) break;
        d.parts.splice(rng.pick(idx), 1);
      }
      const v = SP.creature.validate(d);
      if (!okDesign(S, d, budget)) continue;
      if (v.warnings.some((w) => /reach the ground/.test(w))) continue;    // keep it functional: all legs must touch down
      if (want !== 'any' && attempt < 60) { let wc = null; try { wc = SP.creature.stats(d, {}).waterClass; } catch (e) { /* */ } if (wc !== want) continue; }
      note.attempts = attempt + 1;
      return d;
    }
    return null;
  }

  // ------------------------------------------------------------------ mutation of an existing design
  function mutate(S, rng, budget, note) {
    const kind = S.design.kind;
    for (let attempt = 0; attempt < 60; attempt++) {
      const d = SP.creature.clone(S.design); const log = [];
      const nOps = rng.int(1, 3);
      for (let k = 0; k < nOps; k++) {
        const op = rng.pick(['add', 'add', 'remove', 'swap', 'scale', 'color', 'spine']);
        const parts = d.parts;
        if (op === 'add') {
          const all = SP.parts.list.filter((p) => p.kind === kind && S.isUnlocked(p) && p.slot !== 'mouth' && p.slot !== 'foot' && p.slot !== 'hand' && (kind === 'cell' ? true : p.slot !== 'leg' && p.slot !== 'arm' || rng.chance(0.2)));
          if (!all.length) continue;
          const e = rng.pick(all), v = rng.int(0, d.spine.length - 1);
          const dir = kind === 'cell' ? [rng.range(-1, 1), 0, rng.range(-1, 1)] : [rng.range(-1, 1), rng.range(-0.5, 1), rng.range(-1, 1)];
          if (e.slot === 'leg' || e.slot === 'arm') {
            const lp = addAt(d, e.id, v, [0.9, e.slot === 'leg' ? -0.7 : 0, 0.1], { mirror: true, len: 1.3, bend: 0.3 });
            const comp = cand(S, e.slot === 'leg' ? 'foot' : 'hand'); if (comp.length) addAt(d, rng.pick(comp).id, v, [0.9, e.slot === 'leg' ? -0.7 : 0, 0.1], { mirror: true, attach: lp.uid });
          } else addAt(d, e.id, v, dir, { s: rng.range(0.7, 1.4), mirror: Math.abs(dir[0]) > 0.35 });
          log.push('+' + e.id);
        } else if (op === 'remove') {
          const idx = parts.map((p, i) => i).filter((i) => { const df = defOf(parts[i].id); return df && df.slot !== 'mouth' && !parts[i].attach; });
          if (idx.length <= 2) continue;
          const i = rng.pick(idx), gone = parts.splice(i, 1)[0];
          for (let j = parts.length - 1; j >= 0; j--) if (parts[j].attach === gone.uid) parts.splice(j, 1);
          log.push('-' + gone.id);
        } else if (op === 'swap') {
          const i = rng.int(0, parts.length - 1), p = parts[i], df = defOf(p.id); if (!df) continue;
          const alts = SP.parts.list.filter((q) => q.kind === kind && q.slot === df.slot && q.id !== df.id && S.isUnlocked(q) && (q.slot !== 'mouth' || q.diet === df.diet || q.diet === 'omnivore'));
          if (!alts.length) continue;
          const nq = rng.pick(alts); log.push(p.id + '>' + nq.id); p.id = nq.id;
        } else if (op === 'scale') {
          const p = rng.pick(parts); if (!p) continue; p.s = +clamp((p.s || 1) * rng.range(0.75, 1.35), 0.5, 2).toFixed(2); log.push('scale ' + p.id);
        } else if (op === 'color') {
          d.colors.base = rng.pick(PALETTE); if (rng.chance(0.5)) d.colors.accent = rng.pick(PALETTE); d.colors.pattern = rng.pick(['none', 'stripes', 'spots', 'belly']); log.push('colour');
        } else if (op === 'spine') {
          const s = rng.pick(d.spine); s.r = +clamp(s.r * rng.range(0.85, 1.2), 0.26, 1.5).toFixed(3); log.push('girth');
        }
      }
      if (!log.length) continue;
      if (!okDesign(S, d, budget)) continue;
      if (kind === 'creature' && SP.creature.validate(d).warnings.some((w) => /reach the ground/.test(w))) continue;
      note.ops = log; note.attempts = attempt + 1;
      return d;
    }
    return null;
  }

  // ------------------------------------------------------------------ assembly (ship / vehicle / building) and outfit
  function newAssembly(S, rng, budget) {
    const A = SP.assembly, mode = S.mode;
    for (let a = 0; a < 30; a++) {
      let d;
      try { d = A.generate(rng, mode, S.design.role, null); } catch (e) { console.error('[testrig] assembly.generate', e); return null; }
      d.name = S.design.name || d.name;
      let g = 0;
      const okA = () => A.validate(d).ok && (budget === null || A.cost(d) - S.cost0 <= budget);
      while (!okA() && g++ < 30 && d.parts.length > 1) {
        // drop the most expensive removable part (never the last engine / wheel: validation will tell)
        let bi = -1, bc = -1; d.parts.forEach((p, i) => { const df = SP.assemblyParts.get(p.id); if (df && df.cost > bc) { bc = df.cost; bi = i; } });
        const keep = d.parts.slice(); d.parts.splice(bi, 1);
        if (!A.validate(d).ok && A.validate({ kind: d.kind, role: d.role, core: d.core, parts: keep }).ok) { d.parts = keep; d.parts.splice((bi + 1) % keep.length, 1); }
      }
      if (okA()) return d;
    }
    return null;
  }
  function outfit(S, rng, budget) {
    const d = SP.creature.clone(S.design); d.outfit = [];
    const cats = SP.parts.byCategory('outfit'), names = Object.keys(cats);
    for (let i = 0; i < 4; i++) {
      const arr = (cats[rng.pick(names)] || []).filter((p) => S.isUnlocked(p)); if (!arr.length) continue;
      const def = rng.pick(arr), v = rng.int(0, d.spine.length - 1);
      const p = addAt(d, def.id, v, [rng.range(-1, 1), 1, rng.range(-0.3, 0.3)], { mirror: false });
      d.parts.pop(); d.outfit.push(p);
      if (costOf(d) - S.cost0 > budget) d.outfit.pop();
    }
    return d;
  }

  // ------------------------------------------------------------------ apply + finish
  function apply(S, d) {
    S.design = d; if (S.A.ensure) S.A.ensure(S);
    S.sel = null; S.vsel = -1; S.reframe = true; S.dirty = true;
    if (S.ui && S.ui.name) S.ui.name.value = d.name || S.ui.name.value;
  }
  function describe(S, d, extra) {
    const o = Object.assign({ stage: T.stageId(), mode: S.mode, name: d.name, t: +T.simT.toFixed(0) }, extra || {});
    try {
      if (d.kind === 'creature' || d.kind === 'cell') {
        o.parts = d.parts.map((p) => p.id + (p.mirror ? '*2' : '')); o.vertebrae = d.spine.length;
        o.cost = costOf(d); o.complexity = +SP.creature.complexity(d).value.toFixed(1);
        const st = SP.creature.stats(d, {}); o.waterClass = st.waterClass; o.diet = st.diet; o.gait = st.gait;
        const m = d.parts.map((p) => defOf(p.id)).filter((x) => x && x.slot === 'mouth')[0]; o.mouth = m && m.id;
      } else { o.parts = d.parts.map((p) => p.id + (p.mirror ? '*2' : '')); o.core = d.core; o.cost = SP.assembly.cost(d); }
    } catch (e) { o.err = String(e.message || e); }
    return o;
  }

  // ------------------------------------------------------------------ paced playback (so a human can follow it)
  const hexs = (c) => '#' + ('000000' + (c >>> 0).toString(16)).slice(-6);
  function tabFor(S, def) { return S.tabs.filter((t) => t.type === 'parts' && t.parts && t.parts.indexOf(def) >= 0)[0] || S.tabs.filter((t) => t.type === 'parts' && t.parts && t.parts.some((x) => x.id === def.id))[0]; }
  function selBtn(S, i) { return S.ui.sel ? S.ui.sel.querySelectorAll('button')[i] : null; }
  function colorKey(c) { return typeof c === 'string' ? c.toLowerCase() : hexs(c); }

  /** Build the list of watchable steps that transform the session's current design into D. */
  function plan(S, D) {
    const steps = [], C = S.design, list = (d) => (S.mode === 'outfit' ? d.outfit : d.parts) || [];
    const dUids = {}; list(D).forEach((p) => { dUids[p.uid] = 1; });
    const nameOf = (id) => { const df = defOf(id) || (SP.assemblyParts && SP.assemblyParts.get(id)); return df ? df.name : id; };
    // 1. remove parts that will not survive (real trash button)
    list(C).filter((p) => !dUids[p.uid] && !p.attach).forEach((p) => {
      steps.push({ say: 'Editor: removing ' + nameOf(p.id), el: () => selBtn(S, 4), pre: () => { S.sel = p.uid; }, act: () => { const b = selBtn(S, 4); b && b.click(); }, wait: 0.5 });
    });
    // 2. body shape
    const spineChanged = D.spine && JSON.stringify(D.spine) !== JSON.stringify(C.spine);
    if (spineChanged) steps.push({ say: 'Editor: reshaping the body (' + D.spine.length + ' vertebrae)', tab: (t) => t.type === 'body', act: () => { S.design.spine = JSON.parse(JSON.stringify(D.spine)); S.reframe = true; S.dirty = true; }, wait: 0.9 });
    // 3. add / modify one by one
    const cur = {}; list(S.design).forEach((p) => { cur[p.uid] = p; });
    list(D).forEach((p) => {
      const df = defOf(p.id); const nm = nameOf(p.id);
      if (!cur[p.uid]) {
        const ab = df && df.abilities ? Object.keys(df.abilities).filter((k) => df.abilities[k]).slice(0, 2).join('/') : '';
        steps.push({
          say: 'Editor: adding ' + nm + (ab ? ' (+' + ab + ')' : '') + (df && df.cost ? ' for ' + df.cost * MM(p) : ''),
          tab: (t) => df && t.type === 'parts' && t.parts && t.parts.some((x) => x.id === df.id), card: df && df.id,
          act: () => { list(S.design).push(JSON.parse(JSON.stringify(p))); S.sel = p.uid; S.reframe = false; S.dirty = true; const b = selBtn(S, 2); if (b) { if ((p.s || 1) > 1.7) selBtn(S, 1).click(); else b.click(); } }, wait: 0.7
        });
      } else if (JSON.stringify(cur[p.uid]) !== JSON.stringify(p)) {
        steps.push({ say: 'Editor: tweaking ' + nm + (cur[p.uid].id !== p.id ? ' (swapped from ' + nameOf(cur[p.uid].id) + ')' : ''), el: () => selBtn(S, 2), pre: () => { S.sel = p.uid; },
          act: () => { Object.assign(cur[p.uid], JSON.parse(JSON.stringify(p))); S.dirty = true; const b = selBtn(S, 2); b && ((p.s || 1) > 1.7 ? selBtn(S, 1) : b).click(); }, wait: 0.6 });
      }
    });
    // 4. colours (real paint tab + swatches)
    if (D.colors && JSON.stringify(D.colors) !== JSON.stringify(C.colors) && S.tabs.some((t) => t.type === 'paint')) {
      ['base', 'accent', 'detail'].forEach((slot) => {
        if (colorKey(D.colors[slot]) === colorKey(C.colors[slot])) return;
        steps.push({ say: 'Editor: painting the ' + slot + ' colour', tab: (t) => t.type === 'paint', slot: slot, swatch: colorKey(D.colors[slot]), act: () => { /* click performed in step runner */ }, wait: 0.5 });
      });
    }
    if (D.name) steps.push({ say: 'Editor: naming it ' + D.name, el: () => S.ui.name, act: () => { S.design.name = D.name; if (S.ui.name) S.ui.name.value = D.name; }, wait: 0.5 });
    return steps;
  }

  let run = null;   // {S, steps, i, t, phase, fast, target}
  function stepRun(S, dt) {
    const fast = T.params.headless || T.params.speed >= 16;
    const k = run, st = k.steps[k.i];
    if (!st) { return finishRun(S, dt); }
    k.t += dt;
    if (k.phase === 0) {                      // begin: announce, open tab, move cursor
      T.say(st.say); T.goal(st.say);
      if (st.tab) { const tb = S.tabs.filter(st.tab)[0]; if (tb && S.tab !== tb) { T.cursor.moveTo(tb.btn); k.tabBtn = tb; } }
      k.phase = 1; k.t = 0; if (fast) k.t = 99; return;
    }
    if (k.phase === 1) {                      // cursor travelling to the tab
      if (k.t < 0.7) return;
      if (k.tabBtn) { k.tabBtn.btn.click(); k.tabBtn = null; }
      if (st.slot) { const sb = [].slice.call(S.ui.pal.querySelectorAll('button')).filter((b) => b.textContent.indexOf(st.slot) >= 0)[0]; if (sb) sb.click(); }
      let el = null;
      if (st.card && S.ui.cards) { const c = S.ui.cards.filter((x) => x.def.id === st.card)[0]; el = c && c.el; if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' }); }
      else if (st.swatch) el = S.ui.pal.querySelector('.ed-sw[title="' + st.swatch + '"]');
      else if (st.el) { try { st.pre && st.pre(); el = st.el(); } catch (e) { /* */ } }
      if (el) T.cursor.moveTo(el);
      k.el = el; k.phase = 2; k.t = 0; if (fast) k.t = 99; return;
    }
    if (k.phase === 2) {                      // hover on target (card), then carry to the viewport and drop
      if (k.t < 0.7) return;
      if (st.card && S.ui.vp) T.cursor.moveTo(S.ui.vp);
      if (st.swatch && k.el) k.el.click();
      k.phase = 3; k.t = 0; if (fast) k.t = 99; return;
    }
    if (k.phase === 3) {
      if (k.t < (st.card ? 0.7 : 0.15)) return;
      try { st.pre && st.pre(); st.act && st.act(); } catch (e) { console.error('[testrig] editor step', e); }
      k.phase = 4; k.t = 0; if (fast) k.t = 99; return;
    }
    if (k.phase === 4) { if (k.t < (st.wait || 0.4)) return; k.i++; k.phase = 0; k.t = 0; }
  }
  function finishRun(S, dt) {
    const k = run; k.t += dt;
    if (!k.doneStep) { T.say('Editor: done, checking validity'); k.doneStep = 1; k.t = 0; if (S.ui.done) T.cursor.moveTo(S.ui.done); if (T.params.headless) k.t = 99; return; }
    if (k.t < 1.0) return;
    T.cursor.hide();
    const v = S.A.validate ? S.A.validate(S) : { ok: true };
    if (!v.ok && !k.retried) T.note('editor design invalid per ' + (v.errors || []).join(';'));
    S.design.name = (S.ui.name && S.ui.name.value) || S.design.name;
    if (S.ui.done) { S.ui.done.click(); } else SP.editor.close();
    k.pressed = true; k.pt = 0;
  }

  const E = T.bots.editor = {
    abort: function () { try { SP.editor.close(); } catch (e) { /* */ } T.cursor && T.cursor.hide(); run = null; },
    tick: function (dt) {
      const S = SP.editor._dbg(); if (!S) { run = null; return; }
      if (S !== lastS) { lastS = S; openT = 0; tries = 0; run = null; S._apDone = false; }
      openT += dt;
      if (openT < (T.params.headless ? 0.5 : 1.2)) { if (openT > 0.2) T.goal('Editor opened (' + S.mode + ')'); return; }
      if (run && run.pressed) {                                   // Done pressed; if the editor is still open the design was refused
        run.pt += dt;
        if (run.pt > 2) { tries++; T.note('editor refused Done (' + tries + ')'); run = null; if (tries > 2) { T.note('editor would not close: cancel'); SP.editor.close(); T.cursor.hide(); } }
        return;
      }
      if (!run) {
        const rng = T.rng(), mode = S.mode, bud = S.budget === null || S.budget === undefined ? null : S.budget;
        const first = !!(S.opts && /grows legs/i.test(S.opts.title || ''));
        const note = {}; let d = null, kind = '';
        try {
          const bot = T.bots[T.stageId()] || {};
          const diet = (bot.diet && bot.diet()) || rng.pick(['herbivore', 'carnivore', 'omnivore']);
          if (mode === 'creature') {
            if (first) { d = newCreature(S, rng, diet, bud, note); kind = 'new creature, diet ' + diet; }
            else { d = rng.chance(0.1) ? null : mutate(S, rng, bud === null ? 40 : Math.floor(bud), note); kind = 'mutation'; }
          } else if (mode === 'cell') {
            d = cellDietFix(S, bot) || mutate(S, rng, bud === null ? 40 : Math.floor(bud), note); kind = 'cell mutation';
          } else if (mode === 'outfit') { d = outfit(S, rng, bud === null ? 99 : bud); kind = 'outfit'; }
          else { d = newAssembly(S, rng, bud); kind = 'new ' + mode; }
        } catch (e) { console.error('[testrig] editor build', e); }
        let steps = [];
        if (d) {
          d.name = d.name || S.design.name;
          T.design(describe(S, d, { how: kind, budget: bud, spentEst: Math.max(0, mode === 'creature' || mode === 'cell' || mode === 'outfit' ? net(S, d) : 0), note: note }));
          T.goalDone('design: ' + kind);
          if (S.A.asm) {                                           // assembly modes: swap the whole design (core + parts), narrated
            steps = [{ say: 'Editor: generating a ' + mode + ' design (' + d.parts.length + ' parts)', el: () => S.ui.done, act: () => { apply(S, d); }, wait: 1.2 }];
          } else steps = plan(S, d);
          T.say(kind === 'mutation' ? 'Editor: enough DNA, evolving the creature' : 'Editor: ' + kind);
        } else T.note('editor: no better design found (' + mode + '), keeping current');
        run = { S: S, steps: steps, i: 0, t: 0, phase: 0, pressed: false };
        T.goal('Editor: ' + (kind || 'keep design') + ' (' + steps.length + ' steps)');
      }
      stepRun(S, dt);
    }
  };

  // carnivore / omnivore plans swap the starting filter mouth for a matching one (diet is per seed)
  function cellDietFix(S, bot) {
    const want = bot && bot.diet && bot.diet(); if (!want) return null;
    const d = SP.creature.clone(S.design), mp = d.parts.filter((p) => defOf(p.id) && defOf(p.id).slot === 'mouth')[0]; if (!mp) return null;
    const cur = defOf(mp.id).diet; if (cur === want) return null;
    const opts = SP.parts.list.filter((p) => p.kind === 'cell' && p.slot === 'mouth' && p.diet === want && S.isUnlocked(p));
    if (!opts.length) return null;
    mp.id = opts[0].id;
    return okDesign(S, d, S.budget === null ? null : S.budget) ? d : null;
  }
})();
