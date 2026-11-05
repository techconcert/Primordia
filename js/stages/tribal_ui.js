/* SP.tribalUI — HUD, 2D overlay (rings, health bars, order markers) and the rhythm "perform" minigame for the Tribal stage. */
(function () {
  'use strict';
  const SP = window.SP = window.SP || {};

  const CSS = `
  .tr-prog { display:flex; gap:6px; align-items:center; padding:6px 12px; }
  .tr-prog .seg { width:46px; height:38px; border:3px solid #080c14; border-radius:12px; background:#1e293b; display:flex; align-items:center; justify-content:center; font-size:20px; box-shadow:0 3px 0 #080c14, inset 0 2px 0 rgba(255,255,255,.1); transition:background .3s, transform .3s; position:relative; }
  .tr-prog .seg.allied { background:#16a34a; transform:scale(1.06); } .tr-prog .seg.conquered { background:#dc2626; transform:scale(1.06); }
  .tr-prog .seg i { position:absolute; left:3px; right:3px; bottom:2px; height:4px; border-radius:3px; opacity:.9; }
  .tr-prog .lbl { font-weight:700; font-size:13px; color:#e2e8f0; text-transform:uppercase; letter-spacing:.04em; margin-right:6px; }
  .tr-hint { font-size:13px; font-weight:600; color:#f8fafc; background:rgba(8,12,20,.72); border-radius:999px; padding:3px 12px; max-width:min(560px,90vw); text-align:center; }
  .tr-tools { display:flex; gap:6px; padding:6px 8px; max-width:calc(100vw - 32px); overflow-x:auto; }
  .tr-tool { position:relative; min-width:64px; padding:3px 6px 4px; border:3px solid #080c14; border-radius:12px; background:#1e293b; color:#fff; font:inherit; cursor:pointer; box-shadow:0 3px 0 #080c14; text-align:center; transition:transform .1s, background .2s; }
  .tr-tool:active { transform:translateY(2px); box-shadow:0 1px 0 #080c14; }
  .tr-tool .ic { font-size:24px; line-height:1.1; display:block; filter:drop-shadow(0 2px 0 #080c14); }
  .tr-tool .sub { font-size:11px; font-weight:700; display:block; color:#cbd5e1; }
  .tr-tool .k { position:absolute; top:-7px; left:-5px; background:#0f172a; border:2px solid #080c14; border-radius:6px; font-size:10px; font-weight:800; padding:0 4px; color:#e2e8f0; }
  .tr-tool.built { background:#15803d; } .tr-tool.cant { opacity:.55; } .tr-tool.war.built { background:#b91c1c; } .tr-tool.soc.built { background:#be185d; } .tr-tool.nslot { opacity:.35; }
  .tr-tool.on { outline:3px solid #fde047; }
  .tr-riv { width:250px; padding:6px 8px; display:flex; flex-direction:column; gap:5px; }
  .tr-riv .row { display:flex; align-items:center; gap:6px; padding:3px 4px; border-radius:10px; cursor:pointer; border:2px solid transparent; }
  .tr-riv .row:hover { background:rgba(255,255,255,.07); } .tr-riv .row.sel { border-color:#fde047; background:rgba(253,224,71,.08); }
  .tr-riv .dot { width:14px; height:14px; border-radius:50%; border:2px solid #080c14; flex:none; }
  .tr-riv .nm { font-size:13px; font-weight:700; flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .tr-riv .att { width:70px; height:10px; background:#0f172a; border:2px solid #080c14; border-radius:6px; overflow:hidden; flex:none; }
  .tr-riv .att b { display:block; height:100%; background:#22c55e; transition:width .3s, background .3s; }
  .tr-riv .st { font-size:12px; font-weight:800; width:24px; text-align:center; flex:none; }
  .tr-riv .acts { display:none; gap:4px; padding:2px 2px 6px; flex-wrap:wrap; } .tr-riv .acts.open { display:flex; }
  .tr-riv .acts .info { width:100%; font-size:12px; color:#cbd5e1; font-weight:600; }
  .tr-sel { font-size:13px; font-weight:700; color:#f8fafc; padding:4px 10px; border-radius:999px; background:rgba(8,12,20,.75); min-height:20px; }
  .tr-box { position:absolute; border:2px solid #fde047; background:rgba(253,224,71,.14); pointer-events:none; z-index:5; border-radius:3px; }
  .tr-over { position:absolute; inset:0; pointer-events:none !important; z-index:1; }
  .tr-rhythm { position:absolute; left:50%; bottom:118px; transform:translateX(-50%); width:min(460px,92vw); padding:10px 14px 12px; z-index:30; }
  .tr-rhythm h3 { margin:0 0 6px; font-size:16px; text-align:center; }
  .tr-rhythm .lanes { position:relative; display:flex; gap:6px; height:200px; }
  .tr-rhythm .lane { position:relative; flex:1; background:rgba(15,23,42,.9); border:3px solid #080c14; border-radius:12px; overflow:hidden; }
  .tr-rhythm .lane.want { background:linear-gradient(#3b2a05,#1e1a0b); box-shadow:inset 0 0 18px rgba(250,204,21,.45); }
  .tr-rhythm .hit { position:absolute; left:0; right:0; bottom:var(--pad,26px); height:5px; background:#fff; opacity:.8; }
  .tr-rhythm .pad { position:absolute; left:0; right:0; bottom:0; height:var(--pad,26px); display:flex; align-items:center; justify-content:center; font-size:14px; font-weight:800; background:#334155; cursor:pointer; user-select:none; }
  .tr-rhythm .pad.down { background:#fde047; color:#000; }
  .tr-rhythm .note { position:absolute; left:50%; width:44px; height:44px; margin-left:-22px; margin-top:-22px; border-radius:50%; background:#f8fafc; border:3px solid #080c14; display:flex; align-items:center; justify-content:center; font-size:22px; }
  .tr-rhythm .note.w { background:#fde047; box-shadow:0 0 14px #facc15; } .tr-rhythm .note.hit { animation:trHit .3s forwards; } .tr-rhythm .note.miss { opacity:.25; }
  @keyframes trHit { to { transform:scale(1.9); opacity:0; } }
  .tr-rhythm .score { display:flex; justify-content:space-between; font-weight:800; margin-top:6px; font-size:14px; }
  .tr-rhythm .fb { position:absolute; left:0; right:0; top:46%; text-align:center; font-weight:900; font-size:26px; pointer-events:none; }
  @media (max-width:700px){
    .tr-riv { width:200px; } .tr-riv .att{width:44px;} .tr-prog .seg{width:30px;height:28px;font-size:15px;} .tr-tool{min-width:54px;}
    /* B-07: phone layout - counters + buttons top-left, tiny minimap top-right, tribe list behind the Tribes bar, tool bar clear of the corner buttons */
    .tr-tl .hud-row { gap:5px; flex-wrap:wrap; } .tr-tl .counter-label { display:none; } .tr-tl .btn:not(.b-baby) .btn-label { display:none; } .tr-tl .btn { padding:3px 7px; min-width:0; } .tr-tl .b-baby .btn-label { font-size:12px; } .tr-tl .hud-row { gap:4px; } .tr-sel { font-size:12px; max-width:calc(100vw - 150px); }
    .tr-tc { top:calc(var(--gutter) + 150px) !important; left:var(--gutter) !important; transform:none !important; align-items:flex-start !important; }
    .tr-prog { padding:4px 8px; gap:4px; cursor:pointer; } .tr-prog .lbl { display:none; } .tr-prog .lbl.cnt { display:inline; }
    .tr-hint { max-width:calc(100vw - 150px); font-size:12px; text-align:left; border-radius:12px; }
    .tr-tr canvas { width:88px !important; height:88px !important; }
    .tr-tr .tr-riv { display:none; } .tr-tr .tr-riv.mopen { display:flex; position:fixed; right:var(--gutter); top:calc(var(--gutter) + 100px); }
    .tr-tools { max-width:calc(100vw - 2 * var(--gutter) - 112px); } .tr-bc { left:var(--gutter) !important; transform:none !important; align-items:flex-start !important; }
    .tr-tool .k { display:none; }
  }
  `;

  let selGetter = () => -1; function G_sel() { return selGetter(); }
  function el(tag, cls, html) { return SP.ui.el(tag, cls, html); }

  // ======================================================================== HUD
  function create(api) {
    const ui = SP.ui, hud = document.getElementById('hud');
    const style = document.createElement('style'); style.id = 'tribal-css'; style.textContent = CSS; document.head.appendChild(style);
    const out = { style, rows: [], toolBtns: {} };

    // overlay canvas (rings, health bars, markers)
    const cv = el('canvas', 'tr-over nopoint'); hud.appendChild(cv);
    out.canvas = cv; out.ctx = cv.getContext('2d');
    function fit() { cv.width = window.innerWidth; cv.height = window.innerHeight; }
    fit(); out.unResize = SP.render.onResize(fit);
    out.box = el('div', 'tr-box nopoint'); out.box.style.display = 'none'; hud.appendChild(out.box);

    // top-left: food / pop / time
    const tl = el('div', 'hud-corner hud-tl tr-tl');
    const row = el('div', 'hud-row');
    out.food = ui.counter({ icon: '🍓', color: 'amber', label: 'Food' });
    out.pop = ui.counter({ icon: '👥', color: 'cyan', label: 'Tribe' });
    out.time = ui.counter({ icon: '🌞', color: 'purple', label: '' });
    row.appendChild(out.food.el); row.appendChild(out.pop.el); row.appendChild(out.time.el);
    tl.appendChild(row);
    out.sel = el('div', 'tr-sel nopoint', 'Drag to select your tribe'); tl.appendChild(out.sel);
    const actions = el('div', 'hud-row');
    out.btnBaby = ui.button('Baby 25', { icon: '👶', color: 'pink', small: true, title: 'Raise a new tribe member (B)', onClick: api.onBaby });
    out.btnOutfit = ui.button('Outfitter', { icon: '🎩', color: 'purple', small: true, title: 'Dress your tribe (O)', onClick: api.onOutfit });
    out.btnAll = ui.button('All', { icon: '🧑‍🤝‍🧑', color: 'cyan', small: true, title: 'Select everyone (Ctrl+A)', onClick: api.onSelectAll });
    out.btnHome = ui.button('Home', { icon: '🛖', color: 'amber', small: true, title: 'Centre on the village (Space)', onClick: api.onHome });
    out.btnBaby.classList.add('b-baby');
    [out.btnBaby, out.btnOutfit, out.btnAll, out.btnHome].forEach((b) => actions.appendChild(b));
    tl.appendChild(actions);
    hud.appendChild(tl);

    // top-centre: progress
    const tc = el('div', 'hud-corner hud-tc tr-tc');
    const prog = ui.panel('tr-prog'); prog.appendChild(el('span', 'lbl stroke-sm', 'Tribes'));
    out.segs = [];
    for (let i = 0; i < 5; i++) { const s = el('div', 'seg', '❔'); const c = el('i'); s.appendChild(c); prog.appendChild(s); out.segs.push({ s, c }); }
    out.progLbl = el('span', 'lbl cnt', '0/5'); out.progLbl.style.marginLeft = '6px'; prog.appendChild(out.progLbl);
    prog.addEventListener('click', () => { out.listOpen = !out.listOpen; list.classList.toggle('mopen', out.listOpen || G_sel() >= 0); });   // phone: tap the Tribes bar to show the tribe list
    tc.appendChild(prog);
    out.hint = el('div', 'tr-hint stroke-sm nopoint', ''); tc.appendChild(out.hint);
    hud.appendChild(tc);

    // top-right: minimap + rival list
    const tr = el('div', 'hud-corner hud-tr tr-tr');
    out.mini = ui.minimap({ size: 140 }); tr.appendChild(out.mini.el);
    const list = ui.panel('tr-riv');
    out.list = list; tr.appendChild(list);
    hud.appendChild(tr);
    out.buildRivals = function (rivals) {
      list.innerHTML = ''; out.rows = [];
      rivals.forEach((r, i) => {
        const wrap = el('div');
        const rw = el('div', 'row'); const dot = el('span', 'dot'); dot.style.background = '#' + r.color.toString(16).padStart(6, '0');
        const nm = el('span', 'nm stroke-sm', r.name); const att = el('span', 'att'); const ab = el('b'); att.appendChild(ab);
        const st = el('span', 'st', '😐');
        rw.appendChild(dot); rw.appendChild(nm); rw.appendChild(att); rw.appendChild(st);
        rw.addEventListener('click', () => { SP.audio && SP.audio.sfx('click'); api.onRival(i); });
        const acts = el('div', 'acts'); const info = el('div', 'info'); acts.appendChild(info);
        const bGift = ui.button('Gift ' + api.giftCost, { icon: '🎁', color: 'green', small: true, title: 'Send food to calm them', onClick: () => api.onGift(i) });
        const bPerf = ui.button('Perform', { icon: '🎵', color: 'pink', small: true, title: 'Send musicians to play for them', onClick: () => api.onPerform(i) });
        const bRaid = ui.button('Raid', { icon: '⚔️', color: 'rose', small: true, title: 'Attack their totem and hut', onClick: () => api.onRaid(i) });
        const bGo = ui.button('', { icon: '👁', color: 'slate', small: true, title: 'Look at their village', onClick: () => api.onLook(i) });
        [bGift, bPerf, bRaid, bGo].forEach((b) => acts.appendChild(b));
        wrap.appendChild(rw); wrap.appendChild(acts); list.appendChild(wrap);
        out.rows.push({ rw, ab, st, acts, info, bGift, bPerf, bRaid, nm });
      });
    };

    // bottom-centre: tool bar
    const bc = el('div', 'hud-corner hud-bc tr-bc');
    const bar = ui.panel('tr-tools');
    api.TOOLS.forEach((t, i) => {
      const b = el('button', 'tr-tool ' + (t.kind === 'war' ? 'war' : t.kind === 'social' ? 'soc' : ''));
      b.type = 'button'; b.title = t.name + ' - ' + t.desc;
      b.appendChild(el('span', 'k', String(i + 1))); b.appendChild(el('span', 'ic', t.icon)); const sub = el('span', 'sub', ''); b.appendChild(sub);
      b.addEventListener('click', () => { SP.audio && SP.audio.sfx('click'); api.onTool(t.id); });
      bar.appendChild(b); out.toolBtns[t.id] = { b, sub };
    });
    bc.appendChild(bar); hud.appendChild(bc);
    return out;
  }

  const ST = { ally: '🤝', war: '😠', neutral: '😐', conquered: '🏴', happy: '🙂' };
  function refresh(out, G, api) {
    selGetter = () => G.selRival; out.list.classList.toggle('mopen', !!out.listOpen || G.selRival >= 0);
    out.food.set(Math.floor(G.food)); out.pop.set(G.units.length + '/' + G.cap);
    out.time.set(G.night ? '🌙' : '🌞');
    out.time.el.querySelector('.counter-icon').textContent = G.night ? '🌙' : '🌞';
    out.btnBaby.disabled = false;
    out.btnBaby.style.opacity = (G.food >= api.babyCost && G.units.length < G.cap) ? 1 : 0.55;
    out.sel.textContent = G.selText;
    out.hint.textContent = G.hint || '';
    out.hint.style.display = G.hint ? '' : 'none';
    G.rivals.forEach((r, i) => {
      const seg = out.segs[i]; const done = r.status === 'allied' || r.status === 'conquered';
      seg.s.className = 'seg' + (done ? ' ' + r.status : ''); seg.s.firstChild.nodeValue = r.status === 'allied' ? '🤝' : r.status === 'conquered' ? '⚔️' : '❔';
      seg.c.style.background = '#' + r.color.toString(16).padStart(6, '0');
    });
    out.progLbl.textContent = G.dealt + '/5';
    G.rivals.forEach((r, i) => {
      const row = out.rows[i]; if (!row) return;
      const pct = r.status === 'conquered' ? 0 : Math.max(0, Math.min(100, r.attitude));
      row.ab.style.width = pct + '%'; row.ab.style.background = r.status === 'allied' ? '#22c55e' : r.attitude < 35 ? '#ef4444' : r.attitude < 65 ? '#f59e0b' : '#84cc16';
      row.st.textContent = r.status === 'allied' ? ST.ally : r.status === 'conquered' ? ST.conquered : r.war ? ST.war : ST.neutral;
      row.rw.classList.toggle('sel', G.selRival === i);
      row.acts.classList.toggle('open', G.selRival === i);
      const done = r.status !== 'neutral';
      row.info.textContent = done ? (r.status === 'allied' ? 'Allied. They share food with you.' : 'Conquered.') : (r.kind === 'aggressive' ? 'Hostile' : 'Peaceful') + ' - ' + r.size + ' members - loves ' + api.TOOL[r.wanted].icon + ' ' + api.TOOL[r.wanted].name.split(' ')[0] + (r.i >= 2 && !(r.gifted && r.performed) ? ' - needs 🎁 gift + 🎵 music' : '');
      [row.bGift, row.bPerf, row.bRaid].forEach((b) => { b.style.display = done ? 'none' : ''; });
      row.rw.style.opacity = done ? 0.7 : 1;
    });
    api.TOOLS.forEach((t, i) => {
      const o = out.toolBtns[t.id], hv = G.toolHuts[t.id];
      o.b.classList.toggle('built', !!hv); o.b.classList.toggle('cant', !hv && (G.food < t.cost));
      o.b.classList.toggle('nslot', !hv && G.slotsFree <= 0);
      o.b.classList.toggle('on', G.activeTool === t.id);
      o.sub.textContent = hv ? '×' + (G.toolCount[t.id] || 0) : '🍓' + t.cost;
    });
  }

  function dispose(out) {
    if (!out) return;
    if (out.unResize) out.unResize();
    if (out.style && out.style.parentNode) out.style.parentNode.removeChild(out.style);
  }

  // ======================================================================== rhythm minigame
  function rhythm(o) {
    const lanes = o.lanes;                 // [{id, icon, key}]
    const hudEl = document.getElementById('hud');
    const PAD = (SP.rtsTouch && (SP.rtsTouch.coarse() || SP.rtsTouch.narrow())) ? 46 : 26;   // big tap pads on touch screens
    const root = SP.ui.panel('tr-rhythm pop-in'); root.style.setProperty('--pad', PAD + 'px');
    root.appendChild(el('h3', 'stroke-sm', '🎵 Play for ' + o.rivalName + ' - they love ' + o.wantedIcon + '!'));
    const box = el('div', 'lanes'); root.appendChild(box);
    const laneEls = lanes.map((l, i) => {
      const ln = el('div', 'lane' + (l.id === o.wanted ? ' want' : ''));
      ln.appendChild(el('div', 'hit'));
      const pad = el('div', 'pad', l.icon + ' <span style="opacity:.7;margin-left:6px">' + l.key + '</span>');
      pad.addEventListener('pointerdown', (e) => { e.stopPropagation(); press(i); });
      ln.appendChild(pad); box.appendChild(ln); return { ln, pad };
    });
    const fb = el('div', 'fb stroke', ''); box.appendChild(fb);
    const sc = el('div', 'score'); const sL = el('span', 'stroke-sm', 'Score 0'); const sR = el('span', 'stroke-sm', ''); sc.appendChild(sL); sc.appendChild(sR); root.appendChild(sc);
    hudEl.appendChild(root);

    // notes
    const rng = SP.util.rng(o.seed || 11), BEAT = 0.625, FALL = 1.8;
    const notes = []; let tt = 1.6;
    const total = o.count || 14;
    const pool = []; lanes.forEach((l) => { pool.push(l); if (l.id === o.wanted) pool.push(l, l); });
    for (let i = 0; i < total; i++) {
      const lane = lanes.indexOf(rng.pick(pool));
      const n = { t: tt, lane, w: lanes[lane].id === o.wanted ? 2 : 1, state: 0, el: null };
      const ne = el('div', 'note' + (n.w > 1 ? ' w' : ''), lanes[lane].icon); n.el = ne; laneEls[lane].ln.appendChild(ne); notes.push(n);
      tt += rng.pick([BEAT, BEAT, BEAT, BEAT * 0.5, BEAT * 1.5]);
    }
    const maxPts = notes.reduce((a, n) => a + n.w * 2, 0);
    const S = { t: 0, pts: 0, combo: 0, perfect: 0, good: 0, miss: 0, wrong: 0, done: false, res: null };
    const H = 200 - PAD;
    let fbT = 0;
    function say(txt, col) { fb.textContent = txt; fb.style.color = col; fb.style.opacity = 1; fbT = 0.5; }
    function press(i) {
      if (S.done) return;
      laneEls[i].pad.classList.add('down'); setTimeout(() => laneEls[i].pad.classList.remove('down'), 90);
      let best = null;
      for (const n of notes) if (n.state === 0 && n.lane === i && Math.abs(n.t - S.t) < 0.22 && (!best || n.t < best.t)) best = n;
      if (!best) {
        // B-06: an empty / early press costs a point and breaks the combo, so mashing every pad scores nothing
        S.pts = Math.max(-4, S.pts - 1); S.combo = 0; S.wrong++; say('Off beat!', '#fb7185');
        SP.audio && SP.audio.sfx('social_bad', { pitch: 0.7, vol: 0.4 }); return;
      }
      const d = Math.abs(best.t - S.t), perfect = d < 0.1;
      best.state = 1; best.el.classList.add('hit');
      S.pts += best.w * (perfect ? 2 : 1); S.combo++; perfect ? S.perfect++ : S.good++;
      say(perfect ? 'PERFECT!' : 'Good', perfect ? '#fde047' : '#86efac');
      SP.audio && SP.audio.sfx(best.w > 1 ? 'charm' : 'social_ok', { pitch: 0.9 + 0.12 * lanes.indexOf(lanes[i]) });
      if (o.onHit) o.onHit(best, perfect);
    }
    function update(dt) {
      if (S.done) return;
      S.t += dt;
      for (const n of notes) {
        if (n.state === 0 && S.t - n.t > 0.22) { n.state = 2; n.el.classList.add('miss'); S.miss++; S.combo = 0; say('Miss', '#fb7185'); SP.audio && SP.audio.sfx('social_bad', { vol: 0.5 }); }
        if (n.state !== 1) n.el.style.top = (H * (1 - (n.t - S.t) / FALL)) + 'px';
        else n.el.style.top = H + 'px';
        n.el.style.display = (n.t - S.t) > FALL ? 'none' : '';
      }
      if (fbT > 0) { fbT -= dt; if (fbT <= 0) fb.style.opacity = 0; }
      sL.textContent = 'Score ' + Math.max(0, S.pts) + '/' + maxPts; sR.textContent = S.combo > 1 ? 'Combo x' + S.combo : '';
      if (S.t > notes[notes.length - 1].t + 0.8) finish();
    }
    function finish() {
      if (S.done) return; S.done = true;
      S.res = { score: maxPts ? Math.max(0, S.pts) / maxPts : 0, perfect: S.perfect, good: S.good, miss: S.miss, wrong: S.wrong };
      setTimeout(() => { if (root.parentNode) root.parentNode.removeChild(root); }, 500);
      root.style.transition = 'opacity .4s'; root.style.opacity = 0;
      if (o.onDone) o.onDone(S.res);
    }
    function close() { S.done = true; if (root.parentNode) root.parentNode.removeChild(root); }
    return { update, press, close, finish, state: S, lanes, get done() { return S.done; } };
  }

  SP.tribalUI = { create, refresh, dispose, rhythm };
})();
