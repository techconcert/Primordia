/* SP.civUI — HUD, labels, picking, panels, diplomacy and editors for the Civilization stage. */
(function () {
  'use strict';
  const SP = window.SP = window.SP || {};
  const V3 = THREE.Vector3;
  const C = SP.civ, R = SP.render, UI = SP.ui;
  const ABILITY = {
    friendly: { icon: '🎁', name: 'Gift Rain', cd: 90, desc: 'Showers every nation with gifts: relations +14 and they tip you 300 💰.' },
    aggressive: { icon: '📣', name: 'War Cry', cd: 75, desc: 'Your vehicles fight 60% harder and move 30% faster for 12 s.' },
    industrious: { icon: '🌾', name: 'Bountiful Harvest', cd: 90, desc: 'Instantly finishes production, calms riots and pays 2 minutes of income.' }
  };
  const CSS = `
.civ-labels{position:absolute;inset:0;pointer-events:none;overflow:hidden}
.civ-label{position:absolute;left:0;top:0;pointer-events:auto;cursor:pointer;text-align:center;white-space:nowrap;will-change:transform;font-weight:700;color:#fff;text-shadow:-1px -1px 0 #080c14,1px -1px 0 #080c14,-1px 1px 0 #080c14,1px 1px 0 #080c14,0 2px 0 #080c14}
.civ-label .cl-top{display:inline-flex;align-items:center;gap:5px;padding:2px 9px 2px 6px;background:rgba(18,24,38,.9);border:3px solid #080c14;border-radius:999px;box-shadow:0 3px 0 #080c14;font-size:13px}
.civ-label.own .cl-top{box-shadow:0 3px 0 #080c14,0 0 0 2px #fde047}
.civ-label .cl-dot{width:12px;height:12px;border-radius:50%;border:2px solid #080c14;display:inline-block}
.civ-label .cl-sub{font-size:10px;color:#cbd5e1;margin-top:1px}
.civ-label .cl-bars{display:flex;gap:3px;justify-content:center;margin-top:2px}
.civ-label .cl-bars b{display:none;width:34px;height:7px;border:2px solid #080c14;border-radius:5px;background:#1e293b;overflow:hidden}
.civ-label .cl-bars b i{display:block;height:100%;width:0}
.civ-label .cb-m i{background:#f43f5e}.civ-label .cb-e i{background:#facc15}.civ-label .cb-r i{background:#e879f9}
.civ-label.sel .cl-top{outline:3px solid #22d3ee}
.civ-overlay{position:absolute;inset:0;pointer-events:none}
.civ-tl{min-width:200px}
.civ-money{font-size:12px;color:#94a3b8;display:flex;gap:10px;flex-wrap:wrap}
.civ-money b{color:#fde68a}
.civ-nations{display:flex;flex-direction:column;gap:4px;padding:8px;max-width:230px}
.civ-nrow{display:flex;align-items:center;gap:6px;padding:3px 7px;border:2px solid #080c14;border-radius:10px;background:#1e293b;cursor:pointer;font-size:12px;font-weight:600}
.civ-nrow:hover{background:#334155}
.civ-nrow .cl-dot{width:11px;height:11px;border-radius:50%;border:2px solid #080c14;flex:none}
.civ-nrow .nn{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:110px}
.civ-nrow .nr{font-size:10px;padding:0 5px;border-radius:6px;border:2px solid #080c14;color:#080c14;font-weight:700}
.civ-dock{position:absolute;left:var(--gutter,12px);bottom:calc(var(--gutter,12px) + 74px);width:330px;max-width:calc(100vw - 24px);padding:10px 12px;display:flex;flex-direction:column;gap:7px;font-size:13px;max-height:calc(100vh - 230px);overflow:auto}
.civ-dock h3{margin:0;font-size:16px;display:flex;align-items:center;gap:6px}
.civ-dock .sub{color:#94a3b8;font-size:12px}
.civ-dock .x{margin-left:auto;cursor:pointer}
.civ-row{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.civ-stat{background:#1e293b;border:2px solid #080c14;border-radius:9px;padding:1px 7px;font-weight:700;font-size:12px}
.civ-meter{height:12px;border:2px solid #080c14;border-radius:8px;background:#1e293b;overflow:hidden;flex:1;min-width:80px;position:relative}
.civ-meter i{display:block;height:100%}
.civ-meter span{position:absolute;inset:0;font-size:9px;line-height:9px;text-align:center;font-weight:800;color:#fff;text-shadow:0 1px 0 #080c14}
.civ-ring{position:relative;width:176px;height:176px;margin:2px auto}
.civ-plot{position:absolute;width:46px;height:46px;margin:-23px 0 0 -23px;border:3px solid #080c14;border-radius:12px;background:#1e293b;font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 0 #080c14;color:#94a3b8}
.civ-plot:hover{background:#334155}.civ-plot.full{background:#fef3c7;color:#000}.civ-plot.f-house{background:#fecdd3}.civ-plot.f-factory{background:#cbd5e1}.civ-plot.f-entertainment{background:#f5d0fe}
.civ-plot.pick{outline:3px solid #22d3ee}
.civ-hall{position:absolute;left:50%;top:50%;width:54px;height:54px;margin:-27px 0 0 -27px;border:3px solid #080c14;border-radius:50%;background:#fde68a;display:flex;align-items:center;justify-content:center;font-size:26px}
.civ-hint{font-size:11px;color:#94a3b8;line-height:1.3}
.civ-tabs{display:flex;gap:4px}
.civ-tabs .on{outline:3px solid #fde047}
.civ-sel{border:2px solid #080c14;border-radius:8px;background:#1e293b;color:#fff;font:inherit;font-size:12px;padding:2px 4px}
.civ-bar{position:absolute;left:50%;bottom:calc(var(--gutter,12px) + 6px);transform:translateX(-50%);display:flex;gap:7px;align-items:flex-end;max-width:calc(100vw - 150px);overflow-x:auto;padding:2px 4px 6px}
.civ-abil{position:absolute;left:50%;bottom:calc(var(--gutter,12px) + 66px);transform:translateX(-50%)}
.civ-goal{margin-top:4px}
.civ-dip .row{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin:8px 0}
.civ-dip .log{min-height:22px;text-align:center;font-weight:700;color:#fde68a}
.civ-relbar{height:16px;border:3px solid #080c14;border-radius:10px;position:relative;background:linear-gradient(90deg,#be123c,#f97316 35%,#94a3b8 50%,#84cc16 70%,#22c55e)}
.civ-relbar i{position:absolute;top:-6px;width:8px;height:24px;background:#fff;border:3px solid #080c14;border-radius:5px;margin-left:-7px}
@media (max-width:760px){.civ-nations{display:none}.civ-bar .btn-label{display:none}.civ-tl{min-width:0}}
/* B-07: phone layout (390 px): compact money panel, small minimap, wrapped bottom bar clear of the corner buttons, ability orb on the right */
@media (max-width:700px){
.civ-tl .civ-money,.civ-tl .bar{display:none}
.civ-tr canvas{width:92px;height:92px}
.civ-bar{left:var(--gutter,12px);right:calc(var(--gutter,12px) + 112px);bottom:calc(var(--gutter,12px) + 2px);transform:none;max-width:none;overflow:visible;flex-wrap:wrap;justify-content:flex-start;gap:5px;padding:0}
.civ-bar .btn{min-width:0;padding:5px 8px}
.civ-abil{left:auto;right:var(--gutter,12px);bottom:calc(var(--gutter,12px) + 56px);transform:none}
.civ-dock{left:var(--gutter,12px);right:var(--gutter,12px);width:auto;max-width:none;bottom:calc(var(--gutter,12px) + 108px);max-height:calc(100vh - 330px);padding:8px 10px}
.civ-ring{transform:scale(.82);transform-origin:center top;margin-bottom:-26px}
.civ-label .cl-top{font-size:11px;padding:1px 6px 1px 4px}
}
`;

  function sigmoidTxt(r) { return SP.civAI.relLabel(r); }
  function relColor(r) { return r >= 60 ? '#4ade80' : r >= 25 ? '#a3e635' : r > -10 ? '#cbd5e1' : r > -30 ? '#fdba74' : '#fb7185'; }
  const ROLE_ICON = { land: '🚗', sea: '⛵', air: '✈️' };
  const BROLE = { house: ['🏠', 'House', 'More people; needed to staff factories.'], factory: ['🏭', 'Factory', '+💰, but lowers happiness. +50% next to a house.'], entertainment: ['🎪', 'Entertainment', '+happiness. +50% next to a house.'] };

  SP.civUI = {
    create: function (W, stage) {
      const you = W.player, camp = W.camp, I = SP.input, U = SP.civUnits, CS = SP.civCity;
      const ui = {};
      const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
      const hud = document.getElementById('hud');
      W.prodKind = you.type; W.prodSource = 'mine'; W.selCity = null;
      const tribal = camp.cards && camp.cards.tribal;
      const ab = ABILITY[tribal] || ABILITY.industrious;
      W.abil = { cd: 0, id: 'archetype', def: ab, active: 0 };

      // ------------------------------------------------------------ top-left: money + goal
      const tl = UI.el('div', 'hud-corner hud-tl');
      const tlp = UI.panel('civ-tl'); tlp.style.padding = '8px 10px'; tlp.style.display = 'flex'; tlp.style.flexDirection = 'column'; tlp.style.gap = '6px';
      const head = UI.el('div', 'hud-row');
      const moneyC = UI.counter({ icon: '💰', color: 'amber' }); head.appendChild(moneyC.el);
      const typeBadge = UI.el('span', 'civ-stat', C.TYPE_ICON[you.type] + ' ' + C.TYPE_NAME[you.type]); typeBadge.title = 'Your nation type (from your tribal card)'; head.appendChild(typeBadge);
      const incL = UI.el('div', 'civ-money'); tlp.appendChild(head); tlp.appendChild(incL);
      const cityBar = UI.bar({ label: 'Cities owned', icon: '🏙️', color: 'purple', max: Math.max(1, W.cities.length), value: 1, width: 220 });
      tlp.appendChild(cityBar.el);
      const capL = UI.el('div', 'civ-money'); tlp.appendChild(capL);
      tl.appendChild(tlp); hud.appendChild(tl);

      // ------------------------------------------------------------ top-right: minimap + nations
      const tr = UI.el('div', 'hud-corner hud-tr civ-tr');
      const mm = UI.minimap({ size: 150 }); mm.el.style.cursor = 'pointer'; mm.el.title = 'Click to jump'; tr.appendChild(mm.el);
      const nl = UI.panel('civ-nations'); tr.appendChild(nl); hud.appendChild(tr);
      const nrows = {};
      W.nations.forEach(function (n) {
        if (n.isPlayer) return;
        const row = UI.el('div', 'civ-nrow');
        const dot = UI.el('i', 'cl-dot'); dot.style.background = C.hexStr(n.color);
        row.appendChild(dot); row.appendChild(UI.el('span', 'nn', n.name)); const ty = UI.el('span', null, C.TYPE_ICON[n.type]); row.appendChild(ty);
        const cc = UI.el('span', 'civ-stat', '0'); cc.style.padding = '0 5px'; row.appendChild(cc);
        const rb = UI.el('span', 'nr', '');
        row.appendChild(rb);
        row.title = n.name + ' (' + C.TYPE_NAME[n.type] + ') - click for diplomacy';
        row.addEventListener('click', function () { ui.openDiplomacy(n); });
        nl.appendChild(row); nrows[n.id] = { row: row, cc: cc, rb: rb };
      });
      mm.el.addEventListener('pointerdown', function (e) {
        const r = mm.el.getBoundingClientRect(), x = ((e.clientX - r.left) / r.width) * 2 - 1, y = -(((e.clientY - r.top) / r.height) * 2 - 1);
        const rho = Math.hypot(x, y); if (rho > 1) return;
        const f = W.cam.forwardOnSurface(), up = W.cam.focusDir.clone(), rt = new V3().crossVectors(f, up).normalize();
        const th = rho * Math.PI, o = new V3().addScaledVector(rt, x).addScaledVector(f, y); if (o.lengthSq() > 0) o.normalize();
        W.cam.focusDir.copy(up).multiplyScalar(Math.cos(th)).addScaledVector(o, Math.sin(th)).normalize();
        e.stopPropagation();
      });

      // ------------------------------------------------------------ labels + overlay
      const labels = UI.el('div', 'civ-labels'); hud.appendChild(labels);
      const overlay = document.createElement('canvas'); overlay.className = 'civ-overlay'; hud.appendChild(overlay);
      const octx = overlay.getContext('2d');
      const fit = function () { overlay.width = window.innerWidth; overlay.height = window.innerHeight; };
      fit(); const offResize = R.onResize(fit);
      const lab = {};
      W.cities.forEach(function (c) { makeLabel(c); });
      function makeLabel(c) {
        const el = UI.el('div', 'civ-label');
        el.innerHTML = '<div class="cl-top"><i class="cl-dot"></i><span class="cl-name"></span><span class="cl-type"></span><span class="cl-flags"></span></div><div class="cl-sub"></div><div class="cl-bars"><b class="cb-m"><i></i></b><b class="cb-e"><i></i></b><b class="cb-r"><i></i></b></div>';
        el.addEventListener('click', function (e) { e.stopPropagation(); ui.selectCity(c); });
        labels.appendChild(el);
        lab[c.id] = { el: el, dot: el.querySelector('.cl-dot'), name: el.querySelector('.cl-name'), type: el.querySelector('.cl-type'), flags: el.querySelector('.cl-flags'), sub: el.querySelector('.cl-sub'),
          bm: el.querySelector('.cb-m'), be: el.querySelector('.cb-e'), br: el.querySelector('.cb-r'), key: '' };
      }

      // ------------------------------------------------------------ bottom bar
      const bar = UI.el('div', 'civ-bar');
      const mkBtn = function (label, icon, color, fn, title) { const b = UI.button(label, { icon: icon, color: color, onClick: fn, title: title, small: true }); bar.appendChild(b); return b; };
      mkBtn('Buildings', '🏛️', 'amber', function () { ui.designMenu(); }, 'Design city hall, house, factory, entertainment');
      mkBtn('Land', '🚗', 'green', function () { ui.editDesign('vehicle', 'land'); }, 'Design your land vehicle');
      mkBtn('Sea', '⛵', 'cyan', function () { ui.editDesign('vehicle', 'sea'); }, 'Design your sea vehicle');
      mkBtn('Air', '✈️', 'indigo', function () { ui.editDesign('vehicle', 'air'); }, 'Design your air vehicle');
      mkBtn('Capital', '🎯', 'slate', function () { ui.recentre(true); }, 'Jump to your capital (Space)');
      mkBtn('Planet', '🌍', 'purple', function () { W.cam.distance = 520; }, 'Zoom out to see the whole planet');
      mkBtn('All', '🧑‍🤝‍🧑', 'cyan', function () { ui.selectAllMine(); }, 'Select all your vehicles (touch-friendly)');
      mkBtn('Nations', '🌐', 'rose', function () { ui.openNations(); }, 'Nations list: open diplomacy');
      hud.appendChild(bar);
      const abilBar = UI.abilityBar([{ id: 'archetype', icon: ab.icon, key: 'Q', level: 0, cooldown: ab.cd, name: ab.name + ' - ' + ab.desc, onClick: function () { ui.useAbility(); } }]);
      const abHold = UI.el('div', 'civ-abil'); abHold.appendChild(abilBar.el); abHold.style.pointerEvents = 'auto'; hud.appendChild(abHold);

      // ------------------------------------------------------------ dock (selection / city)
      const dock = UI.panel('civ-dock'); dock.style.display = 'none'; hud.appendChild(dock);
      let dockSig = '', dockRefs = {};

      // ------------------------------------------------------------ helpers
      const proj = new V3();
      function toScreen(p, out) {
        proj.copy(p).project(W.camera);
        out.x = (proj.x * 0.5 + 0.5) * window.innerWidth; out.y = (-proj.y * 0.5 + 0.5) * window.innerHeight; out.z = proj.z;
        return out;
      }
      const _sc = { x: 0, y: 0, z: 0 };
      function visibleDir(dir, margin) { return dir.dot(W.camDir) > W.horizonCos - (margin === undefined ? 0.03 : margin); }
      function pickGround() {
        const ray = I.ray(W.camera), o = ray.origin, d = ray.direction;
        const Rb = W.R + 11, b = o.dot(d), c = o.lengthSq() - Rb * Rb, disc = b * b - c;
        if (disc < 0) return null;
        let t = Math.max(0, -b - Math.sqrt(disc));
        const p = new V3(), q = new V3(); let prev = t;
        const g = function (pp) { return Math.max(W.planet.surfaceRadius(q.copy(pp).normalize()), W.planet.seaRadius); };
        for (let i = 0; i < 160; i++) {
          p.copy(o).addScaledVector(d, t);
          const r = p.length();
          if (r <= g(p)) {
            let lo = prev, hi = t;
            for (let k = 0; k < 8; k++) { const mid = (lo + hi) / 2; p.copy(o).addScaledVector(d, mid); if (p.length() <= g(p)) hi = mid; else lo = mid; }
            return p.copy(o).addScaledVector(d, hi).normalize().clone();
          }
          if (r > Rb + 1 && i > 3 && d.dot(p) > 0) return null;
          prev = t; t += 0.9;
        }
        return null;
      }
      function cityAt(dir, extra) { let best = null, bd = 1e9; W.cities.forEach(function (c) { const a = C.angleBetween(c.dir, dir) * W.R; if (a < SP.civCity.POD_R + (extra || 2) && a < bd) { bd = a; best = c; } }); return best; }
      function geyserAt(dir) { let best = null, bd = 7; W.geysers.forEach(function (g) { const a = C.angleBetween(g.dir, dir) * W.R; if (a < bd) { bd = a; best = g; } }); return best; }
      function pickVehicle(x, y, mineOnly, maxPx) {
        let best = null, bd = maxPx || 26;
        W.vehicles.forEach(function (v) {
          if (mineOnly && v.nation !== you.id) return;
          if (!visibleDir(v.dir, 0.01)) return;
          toScreen(v.pos, _sc); if (_sc.z > 1) return;
          const d = Math.hypot(_sc.x - x, _sc.y - y); if (d < bd) { bd = d; best = v; }
        });
        return best;
      }
      function setSel(list) {
        W.sel.forEach(function (v) { v.sel = false; }); W.sel = list; list.forEach(function (v) { v.sel = true; });
        if (list.length) W.selCity = null;
        ui.selChanged();
      }
      ui.selChanged = function () { dockSig = ''; };
      ui.refreshAll = function () { dockSig = ''; updateNations(); updateTL(true); };

      ui.selectCity = function (c) {
        setSel([]); W.selCity = c; W.pickPlot = null; dockSig = '';
        if (SP.audio) SP.audio.sfx('click');
      };
      ui.boxSelect = function (x0, y0, x1, y1, add) {
        const xa = Math.min(x0, x1), xb = Math.max(x0, x1), ya = Math.min(y0, y1), yb = Math.max(y0, y1);
        const list = add ? W.sel.slice() : [];
        W.vehicles.forEach(function (v) {
          if (v.nation !== you.id || !visibleDir(v.dir, 0.01)) return;
          toScreen(v.pos, _sc); if (_sc.z > 1) return;
          if (_sc.x >= xa && _sc.x <= xb && _sc.y >= ya && _sc.y <= yb && list.indexOf(v) < 0) list.push(v);
        });
        setSel(list); if (list.length && SP.audio) SP.audio.sfx('place');
      };
      ui.selectAllMine = function () {
        const list = W.vehicles.filter(function (v) { return v.nation === you.id && v.alive; });
        setSel(list); if (list.length && SP.audio) SP.audio.sfx('place'); else W.toast('You have no vehicles yet', '🚗', 1500);
      };
      ui.openNations = function () {
        const body = UI.el('div', 'civ-dip'); const row = UI.el('div', 'row'); body.appendChild(row); let m;
        W.nations.forEach(function (n) {
          if (n.isPlayer) return;
          const nc = W.cities.filter(function (c) { return c.nation === n.id; }).length;
          const b = UI.button(n.name + ' · ' + SP.civAI.relLabel(W.getRel(you.id, n.id)) + ' · 🏙️' + nc, { icon: C.TYPE_ICON[n.type], color: nc ? 'slate' : 'slate', small: true, onClick: function () { m.close(); ui.openDiplomacy(n); } });
          if (!nc) b.style.opacity = 0.45; row.appendChild(b);
        });
        m = UI.modal({ title: '🌐 Nations', body: body, buttons: [{ label: 'Close', color: 'slate' }] });
      };
      ui.hotkeyProduce = function (role) {
        let c = W.selCity && W.selCity.nation === you.id ? W.selCity : null;
        if (!c) { let bd = 1e9; W.cities.forEach(function (k) { if (k.nation !== you.id) return; const d = k.dir.distanceTo(W.cam.focusDir); if (d < bd) { bd = d; c = k; } }); }
        if (c) ui.produce(c, role, W.prodKind);
      };
      ui.stopSel = function () { W.sel.forEach(function (v) { v.order = null; }); };
      ui.cycleCity = function () {
        const own = W.cities.filter(function (c) { return c.nation === you.id; }); if (!own.length) return;
        const i = own.indexOf(W.selCity); const c = own[(i + 1) % own.length];
        ui.selectCity(c); W.cam.focusDir.copy(c.dir);
      };
      ui.recentre = function (capital) {
        if (!capital && W.sel.length) { const s = new V3(); W.sel.forEach(function (v) { s.add(v.dir); }); W.cam.focusDir.copy(s.normalize()); return; }
        if (!capital && W.selCity) { W.cam.focusDir.copy(W.selCity.dir); return; }
        const own = W.cities.filter(function (c) { return c.nation === you.id; })[0] || W.cities[0];
        if (own) W.cam.focusDir.copy(own.dir);
        W.cam.distance = Math.min(W.cam.distance, 80);
      };

      // ------------------------------------------------------------ orders
      function formation(dest, i, n) {
        if (n <= 1) return dest;
        const ref = C.randomTangent(dest, { range: function () { return 0.3; } });
        return C.offsetDir(dest, ref, i * 2.4, (i === 0 ? 0 : 1.8 * Math.sqrt(i)) / W.R);
      }
      function rightClick() {
        const sel = W.sel.filter(function (v) { return v.alive && v.nation === you.id; });
        if (!sel.length || W.ended) return;
        const m = I.mouse;
        const ev = pickVehicle(m.x, m.y, false, 24);
        const dir = pickGround();
        const mark = function (pos, col) { W.fx.burst(pos, col, 8, 0.9, { up: pos.clone().normalize(), size: 0.3, life: 0.6, flat: true }); };
        // enemy vehicle
        if (ev && ev.nation !== you.id) {
          let cnt = 0;
          sel.forEach(function (v, i) { if (v.st.mil > 0) { U.order(W, v, { type: 'attack', v: ev }); cnt++; } else U.order(W, v, { type: 'move', dir: formation(ev.dir, i, sel.length) }); });
          if (cnt) { U.markWar(W, you.id, ev.nation); mark(ev.pos, 0xf43f5e); if (SP.audio) SP.audio.sfx('charge'); }
          return;
        }
        if (!dir) return;
        const city = cityAt(dir, 3);
        if (city) {
          let blocked = 0;
          sel.forEach(function (v, i) {
            if (city.nation === you.id) { U.order(W, v, { type: 'move', dir: formation(city.dir, i, sel.length) }); return; }
            if (v.role === 'land' && W.compOf(v.dir, 'land') !== W.compOf(city.dir, 'land')) { blocked++; return; }
            if (v.role === 'sea' && !city.port) { blocked++; return; }
            const k = v.st.kind;
            if (k === 'military') U.order(W, v, { type: 'attack', city: city });
            else if (k === 'economic' || k === 'religious') U.order(W, v, { type: 'work', city: city });
            else U.order(W, v, { type: 'move', dir: formation(city.dir, i, sel.length) });
          });
          if (blocked) W.toast(blocked + ' vehicle(s) cannot reach ' + city.name + ' (water in the way)', '🌊');
          if (city.nation !== you.id) {
            const kinds = {}; sel.forEach(function (v) { kinds[v.st.kind] = 1; });
            if (kinds.military) U.markWar(W, you.id, city.nation);
            mark(city.pos, kinds.military ? 0xf43f5e : kinds.economic ? 0xfacc15 : 0xe879f9);
            ui.selectCityPeek && ui.selectCityPeek(city);
          } else mark(city.pos, 0x4ade80);
          if (SP.audio) SP.audio.sfx('place');
          return;
        }
        const geyser = geyserAt(dir);
        if (geyser) {
          const claimers = sel.filter(function (v) { return v.role !== 'air' && (v.role === 'sea' ? geyser.nearWater : (geyser.land && W.compOf(v.dir, 'land') === W.compOf(geyser.dir, 'land'))); });
          if (!claimers.length) { W.toast('Land or sea vehicles that can reach the geyser are needed to claim spice', '✨'); }
          sel.forEach(function (v, i) { if (claimers.indexOf(v) >= 0) U.order(W, v, { type: 'claim', g: geyser }); else U.order(W, v, { type: 'move', dir: formation(geyser.dir, i, sel.length) }); });
          mark(geyser.pos, 0xe879f9); if (SP.audio) SP.audio.sfx('place');
          return;
        }
        // ground move (land can't enter sea etc: they stop at the shore)
        sel.forEach(function (v, i) { U.order(W, v, { type: 'move', dir: formation(dir, i, sel.length) }); });
        mark(dir.clone().multiplyScalar(W.planet.surfaceRadius(dir) + 0.3), 0x22d3ee);
        if (SP.audio) SP.audio.sfx('place', { vol: 0.5 });
      }
      function leftClick() {
        if (W.ended) return;
        const m = I.mouse, shift = I.isDown('ShiftLeft') || I.isDown('ShiftRight');
        const v = pickVehicle(m.x, m.y, true, m.touch ? 44 : 28);
        if (v) {
          if (shift) { const i = W.sel.indexOf(v); if (i >= 0) { v.sel = false; W.sel.splice(i, 1); setSel(W.sel.slice()); } else setSel(W.sel.concat([v])); }
          else if (I.mouse.clicked && W.lastClickV === v && W.t - W.lastClickT < 0.4) setSel(W.vehicles.filter(function (o) { return o.nation === you.id && o.role === v.role && visibleDir(o.dir, 0.01); }));
          else setSel([v]);
          W.lastClickV = v; W.lastClickT = W.t;
          if (SP.audio) SP.audio.sfx('place', { vol: 0.5 });
          return;
        }
        const dir = pickGround();
        if (dir) { const c = cityAt(dir, 2); if (c) { ui.selectCity(c); return; } }
        setSel([]); W.selCity = null;
      }

      // B-07: touch - tap own vehicle = select, tap anything else with a selection = give the context order
      function touchTap() {
        if (W.ended || (SP.rtsTouch && SP.rtsTouch.suppress())) return;
        const m = I.mouse, v = pickVehicle(m.x, m.y, true, 40);
        if (v || !W.sel.some(function (x) { return x.alive; })) { leftClick(); return; }
        rightClick();
      }

      // ------------------------------------------------------------ economy actions
      ui.designFor = function (role, kind) {
        let base = you.designs[role];
        if (W.prodSource !== 'mine') { const c = you.captured.filter(function (k) { return k.from === W.prodSource; })[0]; if (c) base = c.designs[role]; }
        const st = U.vstats(base);
        return st.kind === kind ? base : U.variant(base, kind);
      };
      ui.produce = function (city, role, kind) {
        if (city.nation !== you.id) return;
        if (city.riot) { W.toast('Riot! No production while the city is unhappy', '🔥'); return; }
        if (role === 'sea' && !city.port) { W.toast(city.name + ' has no coast for boats', '🌊'); return; }
        if (U.count(W, you.id, role) >= U.cap(W, you.id, role)) { W.toast('Fleet limit reached: ' + U.cap(W, you.id, role) + ' ' + role + ' vehicles', '🚫'); return; }
        if (city.queue.length >= 3) { W.toast('Production queue full', '⏳'); return; }
        const d = ui.designFor(role, kind), cost = U.vstats(d).cost;
        if (you.money < cost) { W.toast('Need ' + cost + ' 💰', '💰'); if (SP.audio) SP.audio.sfx('social_bad'); return; }
        you.money -= cost;
        city.queue.push({ role: role, kind: kind, design: d, cost: cost, t: 0, dur: 4.5 + cost / 90 });
        if (SP.audio) SP.audio.sfx('build'); dockSig = '';
      };
      ui.build = function (city, role, plotIdx) {
        const cost = CS.buildingCost(you, role);
        if (you.money < cost) { W.toast('Need ' + cost + ' 💰', '💰'); if (SP.audio) SP.audio.sfx('social_bad'); return; }
        you.money -= cost;
        const p = CS.addBuilding(W, city, role, plotIdx);
        if (p) {
          const wp = city.frame.localToWorld(p.local.clone());
          W.fx.burst(wp, 0xfde68a, 14, 1.2, { up: city.dir, size: 0.35 }); W.fx.burst(wp, you.color, 10, 1.0, { up: city.dir, size: 0.3 });
          if (SP.audio) SP.audio.sfx('build');
        }
        W.pickPlot = null; CS.compute(W, city); dockSig = '';
      };
      ui.buy = function (city) {
        const full = (city.trade[you.id] || 0) >= 100, price = CS.buyPrice(city, you.id);
        if (city.nation === you.id) return;
        if (!full && (W.getRel(you.id, city.nation) <= -30)) { W.toast(W.nationById[city.nation].name + ' will not sell while at war - improve relations (gifts) or fill the trade ring', '🚫', 2600); return; }
        if (!(price >= CS.MIN_PRICE)) return; // never sell a city for nothing (NaN or zero price)
        if (!(you.money >= price)) { W.toast('Need ' + price + ' 💰 to buy ' + city.name, '💰'); return; }
        you.money -= price; W.captureCity(city, you, 'economic', price, !full);
      };
      // Merger: once you hold half the world's cities a nation that is not at war with you can be bought out whole (all its cities at 70% of the summed buy-out prices)
      ui.mergePrice = function (n) {
        const cs = W.cities.filter(function (c) { return c.nation === n.id; }), mine = W.cities.filter(function (c) { return c.nation === you.id; }).length;
        if (!cs.length || n.isPlayer || n.dead || mine * 2 < W.cities.length || W.getRel(you.id, n.id) <= -30) return 0;
        return Math.round(cs.reduce(function (a, c) { return a + CS.buyPrice(c, you.id); }, 0) * 0.7);
      };
      ui.merge = function (n) {
        const price = ui.mergePrice(n); if (!price) { W.toast('No merger possible: hold half the cities and be at peace with them', '🚫', 2600); return false; }
        if (you.money < price) { W.toast('Need ' + price + ' 💰 for the merger', '💰'); return false; }
        you.money -= price; n.money += price;
        W.cities.filter(function (c) { return c.nation === n.id; }).forEach(function (c) { W.captureCity(c, you, 'merger', 0, true); });
        W.toast(n.name + ' merged into your civilization!', '🤝', 3000); return true;
      };
      ui.upgrade = function (key) {
        const cost = U.techCost(W, key); if (!cost) return false;
        if (you.money < cost) { W.toast('Need ' + cost + ' 💰', '💰'); return false; }
        if (!U.buyTech(W, key)) return false;
        W.toast(U.TECH[key].name + ' upgraded to tier ' + you.tech[key], U.TECH[key].icon); if (SP.audio) SP.audio.sfx('levelup', { vol: 0.5 }); dockSig = ''; return true;
      };
      ui.useAbility = function () {
        if (W.abil.cd > 0 || W.ended) { if (W.abil.cd > 0) W.toast(ab.name + ' recharging (' + Math.ceil(W.abil.cd) + 's)', '⏳', 1200); return; }
        W.abil.cd = ab.cd; if (SP.audio) SP.audio.sfx('win', { vol: 0.5 });
        const burstAt = function (pos, col, n) { W.fx.burst(pos, col, n, 2.2, { up: pos.clone().normalize(), size: 0.45, life: 1.4 }); };
        if (tribal === 'friendly') {
          W.nations.forEach(function (n) { if (!n.isPlayer) W.setRel(you.id, n.id, W.getRel(you.id, n.id) + 14); });
          you.money += 300;
          W.cities.forEach(function (c) { for (let i = 0; i < 4; i++) { const p = c.pos.clone().addScaledVector(c.dir, 14 + i * 3); W.fx.burst(p, [0xf472b6, 0xfacc15, 0x38bdf8, 0x4ade80][i], 10, 1.0, { up: c.dir, size: 0.45, life: 1.8, gravity: 3 }); } });
          W.toast('Gift Rain! Everyone loves you a little more (+300 💰)', '🎁', 3500);
        } else if (tribal === 'aggressive') {
          W.vehicles.forEach(function (v) { if (v.nation === you.id) { v.boost = 12; burstAt(v.pos, 0xf43f5e, 14); } });
          W.toast('WAR CRY! Your vehicles are fired up for 12 s', '📣', 3000);
        } else {
          W.cities.forEach(function (c) { if (c.nation === you.id) { c.queue.forEach(function (q) { q.t = q.dur; }); c.riot = false; c.hapBonus = 25; setTimeout(function () { c.hapBonus = 0; }, 20000); burstAt(c.pos.clone().addScaledVector(c.dir, 3), 0xfacc15, 24); } });
          you.money += (you.income || 0) * 2;
          W.toast('Bountiful Harvest! +' + Math.round((you.income || 0) * 2) + ' 💰', '🌾', 3500);
        }
      };

      // ------------------------------------------------------------ editors
      ui.designMenu = function () {
        const body = UI.el('div', 'row-center'); let m;
        [['cityhall', '🏛️', 'City Hall'], ['house', '🏠', 'House'], ['factory', '🏭', 'Factory'], ['entertainment', '🎪', 'Entertainment']].forEach(function (b) {
          body.appendChild(UI.button(b[2], { icon: b[1], color: 'amber', onClick: function () { m.close(); ui.editDesign('building', b[0]); } }));
        });
        m = UI.modal({ title: '🏛️ Design a building', body: body, buttons: [{ label: 'Close', color: 'slate' }] });
      };
      ui.editDesign = function (kind, role) {
        const d = you.designs[role];
        const cost = Math.round(SP.assembly.stats(d).cost);
        const opts = { mode: kind, design: SP.assembly.clone(d), budget: Math.floor(you.money + cost), currency: 'Primordiabucks', unlocked: 'all', allowCancel: true,
          title: kind === 'building' ? 'Design your ' + role : 'Design your ' + role + ' vehicle' };
        if (kind === 'vehicle') opts.vehicleType = role; else opts.buildingType = role;
        SP.game.openEditor(opts).then(function (res) {
          if (!res || !res.design) return;
          const nd = res.design; nd.role = role; nd.kind = kind;
          you.designs[role] = nd;
          if (kind === 'building') {
            W.cities.forEach(function (c) { if (c.nation === you.id) { if (role === 'cityhall') CS.refreshHall(W, c); else CS.refreshRole(W, c, role); CS.compute(W, c); } });
          }
          W.toast('Design saved: ' + (nd.name || role), '💾'); dockSig = '';
          W.camp.civ = Object.assign(W.camp.civ || {}, { designs: you.designs });
        });
      };
      ui.afterEditor = function () { dockSig = ''; fit(); };

      // ------------------------------------------------------------ diplomacy
      ui.openDiplomacy = function (n) {
        const body = UI.el('div', 'civ-dip');
        const info = UI.el('div', null); body.appendChild(info);
        const rb = UI.el('div', 'civ-relbar'); const knob = UI.el('i'); rb.appendChild(knob); body.appendChild(UI.el('div', null, '')); body.appendChild(rb);
        const lbl = UI.el('div', 'sub'); lbl.style.textAlign = 'center'; lbl.style.marginTop = '6px'; body.appendChild(lbl);
        const log = UI.el('div', 'log'); body.appendChild(log);
        const row = UI.el('div', 'row'); body.appendChild(row);
        const refresh = function () {
          const r = W.getRel(you.id, n.id), nc = W.cities.filter(function (c) { return c.nation === n.id; }).length, nv = W.vehicles.filter(function (v) { return v.nation === n.id; }).length;
          info.innerHTML = '<div style="font-size:18px;font-weight:700"><i class="cl-dot" style="display:inline-block;width:14px;height:14px;border-radius:50%;border:2px solid #080c14;background:' + C.hexStr(n.color) + '"></i> ' + n.name + ' ' + C.TYPE_ICON[n.type] + '</div>' +
            '<div class="sub">' + C.TYPE_NAME[n.type] + (n.neutral ? ' city-state' : ' nation') + ' · ' + nc + ' ' + (nc === 1 ? 'city' : 'cities') + ' · ' + nv + ' vehicles · ' + Math.round(n.money) + ' 💰</div>';
          knob.style.left = ((r + 100) / 200 * 100) + '%';
          lbl.innerHTML = '<b style="color:' + relColor(r) + '">' + sigmoidTxt(r) + '</b> (' + Math.round(r) + ')' + (r <= -30 ? ' - your units and theirs will fight' : '');
          if (n.dead) log.textContent = 'This nation has fallen.';
        };
        [['gift', '🎁', 'Gift 200 💰', 'green'], ['compliment', '😊', 'Compliment', 'cyan'], ['insult', '😠', 'Insult', 'rose'], ['demand', '💢', 'Demand tribute', 'amber']].forEach(function (a) {
          row.appendChild(UI.button(a[2], { icon: a[1], color: a[3], onClick: function () { const res = SP.civAI.act(W, n, a[0]); log.textContent = res.text; refresh(); updateNations(); } }));
        });
        const mp = ui.mergePrice(n); if (mp) row.appendChild(UI.button('Merge ' + mp + ' 💰', { icon: '🤝', color: 'amber', onClick: function () { if (ui.merge(n)) { log.textContent = 'Merged!'; refresh(); updateNations(); } } }));
        body.appendChild(UI.el('div', 'civ-hint', 'Gifts and compliments win friends. Insults and demands push nations towards war: at war they attack your vehicles and cities (and you can attack theirs).'));
        refresh();
        UI.modal({ title: '🤝 Diplomacy', body: body, buttons: [{ label: 'Close', color: 'slate' }] });
      };

      // ------------------------------------------------------------ dock rendering
      function bar2(color, frac, text) {
        const m = UI.el('div', 'civ-meter'); const i = UI.el('i'); i.style.background = color; i.style.width = Math.round(Math.max(0, Math.min(1, frac)) * 100) + '%'; m.appendChild(i);
        const s = UI.el('span', null, text || ''); m.appendChild(s); m.setFill = function (f, t) { i.style.width = Math.round(Math.max(0, Math.min(1, f)) * 100) + '%'; if (t !== undefined) s.textContent = t; }; return m;
      }
      function buildDock() {
        dock.innerHTML = ''; dockRefs = {};
        const c = W.selCity;
        if (c) return buildCityDock(c);
        if (W.sel.length) return buildSelDock();
        dock.style.display = 'none';
      }
      function buildSelDock() {
        dock.style.display = 'flex';
        const sel = W.sel;
        const h = UI.el('h3', null, '🚗 ' + sel.length + ' vehicle' + (sel.length > 1 ? 's' : '') + ' selected');
        const x = UI.el('span', 'x', '✕'); x.onclick = function () { setSel([]); }; h.appendChild(x); dock.appendChild(h);
        const cnt = { land: 0, sea: 0, air: 0, military: 0, economic: 0, religious: 0, none: 0 };
        sel.forEach(function (v) { cnt[v.role]++; cnt[v.st.kind]++; });
        const r = UI.el('div', 'civ-row');
        ['land', 'sea', 'air'].forEach(function (k) { if (cnt[k]) r.appendChild(UI.el('span', 'civ-stat', ROLE_ICON[k] + ' ' + cnt[k])); });
        ['military', 'economic', 'religious'].forEach(function (k) { if (cnt[k]) r.appendChild(UI.el('span', 'civ-stat', C.TYPE_ICON[k] + ' ' + cnt[k])); });
        dock.appendChild(r);
        if (sel.length === 1) {
          const v = sel[0]; dockRefs.hp = bar2('#4ade80', v.hp / v.maxHp, '❤️ ' + Math.round(v.hp));
          dock.appendChild(dockRefs.hp);
          dock.appendChild(UI.el('div', 'civ-hint', '"' + (v.design.name || v.role) + '" · speed ' + Math.round(U.speedOf(v)) + ' · power ' + Math.round(Math.max(v.st.mil, v.st.eco, v.st.rel)) + ' · defense ' + Math.round(v.st.defense)));
        }
        dock.appendChild(UI.el('div', 'civ-hint', (I.mouse.touch ? 'Tap: ' : 'Right-click: ') + 'ground = move · enemy = attack · geyser ✨ = claim spice · city = ' + (cnt.military ? 'attack ⚔️ ' : '') + (cnt.economic ? 'trade 💰 ' : '') + (cnt.religious ? 'convert 🔮' : '') + (I.mouse.touch ? '<br>Drag pans, pinch zooms. Tap a selected vehicle to reselect it; use All / ✕ to change the selection.' : '<br>Double-click selects all of one type. <kbd class="kbd">X</kbd> stops.')));
        const rb = UI.el('div', 'civ-row'); rb.appendChild(UI.button('Stop', { icon: '⏹', color: 'slate', small: true, onClick: ui.stopSel })); dock.appendChild(rb);
      }
      function buildCityDock(c) {
        dock.style.display = 'flex';
        const owner = W.nationById[c.nation], mine = owner === you;
        const h = UI.el('h3');
        const dot = UI.el('i', 'cl-dot'); dot.style.cssText = 'width:14px;height:14px;border-radius:50%;border:2px solid #080c14;display:inline-block;background:' + C.hexStr(owner.color);
        h.appendChild(dot); h.appendChild(document.createTextNode(c.name + ' ' + C.TYPE_ICON[owner.type]));
        const x = UI.el('span', 'x', '✕'); x.onclick = function () { W.selCity = null; dockSig = ''; }; h.appendChild(x); dock.appendChild(h);
        dock.appendChild(UI.el('div', 'sub', mine ? 'Your city · ' + C.TYPE_NAME[owner.type] : owner.name + ' · ' + C.TYPE_NAME[owner.type] + ' · ' + SP.civAI.relLabel(W.getRel(you.id, owner.id))));
        if (mine) {
          const st = UI.el('div', 'civ-row');
          dockRefs.pop = UI.el('span', 'civ-stat', '👥 0'); dockRefs.inc = UI.el('span', 'civ-stat', '💰 0/min'); st.appendChild(dockRefs.pop); st.appendChild(dockRefs.inc); dock.appendChild(st);
          dockRefs.happy = bar2('#84cc16', 0.5, '😀 50'); dock.appendChild(dockRefs.happy);
          dockRefs.status = UI.el('div', 'civ-hint', ''); dock.appendChild(dockRefs.status);
          // plot ring
          const ring = UI.el('div', 'civ-ring');
          const hall = UI.el('div', 'civ-hall', '🏛️'); hall.title = 'City hall - design it with the Buildings button'; ring.appendChild(hall);
          for (let i = 0; i < SP.civCity.NPLOT; i++) {
            const p = c.plots[i], a = i / SP.civCity.NPLOT * Math.PI * 2 - Math.PI / 2 + 0.3927;
            const b = UI.el('div', 'civ-plot' + (p.role ? ' full f-' + p.role : '') + (W.pickPlot === i ? ' pick' : ''), p.role ? BROLE[p.role][0] : '+');
            b.style.left = (88 + Math.cos(a) * 66) + 'px'; b.style.top = (88 + Math.sin(a) * 66) + 'px';
            b.title = p.role ? BROLE[p.role][1] : 'Empty plot - click to build';
            (function (idx, plot) { b.onclick = function () { if (plot.role) return; W.pickPlot = W.pickPlot === idx ? null : idx; dockSig = ''; if (SP.audio) SP.audio.sfx('click'); }; })(i, p);
            ring.appendChild(b);
          }
          dock.appendChild(ring);
          if (W.pickPlot !== null && W.pickPlot !== undefined) {
            const pr = UI.el('div', 'civ-row'); pr.style.justifyContent = 'center';
            ['house', 'factory', 'entertainment'].forEach(function (role) {
              const cost = CS.buildingCost(you, role);
              const bt = UI.button(cost + '', { icon: BROLE[role][0], color: you.money >= cost ? 'green' : 'slate', small: true, title: BROLE[role][1] + ': ' + BROLE[role][2], onClick: function () { ui.build(c, role, W.pickPlot); } });
              pr.appendChild(bt);
            });
            dock.appendChild(pr);
            dock.appendChild(UI.el('div', 'civ-hint', 'Adjacent plots matter: a factory 🏭 beside a house 🏠 earns +50%. An entertainment 🎪 beside a house gives +50% happiness.'));
          } else dock.appendChild(UI.el('div', 'civ-hint', 'Tap a "+" plot to build. Factories need houses for workers and make people grumpy; entertainment keeps the peace.'));
          // production
          dock.appendChild(UI.el('div', 'sub', 'Produce vehicles (' + C.TYPE_ICON[W.prodKind] + ' ' + C.TYPE_NAME[W.prodKind] + ' kit)'));
          const tabs = UI.el('div', 'civ-tabs');
          ['military', 'economic', 'religious'].forEach(function (k) {
            const b = UI.button('', { icon: C.TYPE_ICON[k], color: 'slate', small: true, title: ({ military: 'Weapons: attack turrets, halls and vehicles', economic: 'Sales dish: trade routes to buy cities', religious: 'Holo dome: convert cities' })[k], onClick: function () { W.prodKind = k; dockSig = ''; } });
            if (W.prodKind === k) b.classList.add('on'); tabs.appendChild(b);
          });
          if (you.captured.length) {
            const sel = document.createElement('select'); sel.className = 'civ-sel';
            sel.innerHTML = '<option value="mine">My designs</option>' + you.captured.map(function (k) { return '<option value="' + k.from + '"' + (W.prodSource === k.from ? ' selected' : '') + '>' + k.name + '</option>'; }).join('');
            sel.onchange = function () { W.prodSource = sel.value; dockSig = ''; }; tabs.appendChild(sel);
          }
          dock.appendChild(tabs);
          const pb = UI.el('div', 'civ-row');
          ['land', 'sea', 'air'].forEach(function (role) {
            const d = ui.designFor(role, W.prodKind), cost = U.vstats(d).cost, n = U.count(W, you.id, role);
            const disabled = (role === 'sea' && !c.port);
            const b = UI.button(cost + ' · ' + n + '/' + U.cap(W, you.id, role), { icon: ROLE_ICON[role], color: disabled ? 'slate' : you.money >= cost ? 'green' : 'slate', small: true, key: String(['land', 'sea', 'air'].indexOf(role) + 1), title: (d.name || role) + (disabled ? ' (no coast)' : ''), onClick: function () { ui.produce(c, role, W.prodKind); } });
            pb.appendChild(b);
          });
          dock.appendChild(pb);
          dock.appendChild(UI.el('div', 'sub', '⭐ Upgrades (spend your treasury)'));
          const tb = UI.el('div', 'civ-row');
          Object.keys(U.TECH).forEach(function (k) {
            const T = U.TECH[k], lv = U.techLevel(W, you.id, k), cost = U.techCost(W, k);
            tb.appendChild(UI.button(T.icon + ' ' + lv + '/' + T.max + (cost ? ' · ' + cost : ' MAX'), { color: cost && you.money >= cost ? 'green' : 'slate', small: true, title: T.name + ': ' + T.desc, onClick: function () { ui.upgrade(k); } }));
          });
          dock.appendChild(tb);
          dockRefs.queue = bar2('#38bdf8', 0, ''); dockRefs.queue.style.display = 'none'; dock.appendChild(dockRefs.queue);
        } else {
          // foreign city
          dockRefs.hall = bar2('#f43f5e', 1, ''); dock.appendChild(UI.el('div', 'sub', '⚔️ Defences'));
          dockRefs.tur = UI.el('div', 'civ-hint', ''); dock.appendChild(dockRefs.tur); dock.appendChild(dockRefs.hall);
          dockRefs.price = UI.el('div', 'sub', ''); dock.appendChild(dockRefs.price);
          dockRefs.trade = bar2('#facc15', 0, ''); dock.appendChild(dockRefs.trade);
          dockRefs.buy = UI.button('Buy out', { icon: '💰', color: 'amber', small: true, onClick: function () { ui.buy(c); } }); dockRefs.buy.style.display = 'none'; dock.appendChild(dockRefs.buy);
          dock.appendChild(UI.el('div', 'sub', '🔮 Conversion'));
          dockRefs.conv = bar2('#e879f9', 0, ''); dock.appendChild(dockRefs.conv);
          dock.appendChild(UI.el('div', 'civ-hint', 'Select vehicles and right-click this city: ⚔️ military destroy turrets then the hall, 💰 trade vehicles fill the trade ring so you can buy it, 🔮 holo vehicles convert its people.'));
          const rb = UI.el('div', 'civ-row'); rb.appendChild(UI.button('Diplomacy', { icon: '🤝', color: 'cyan', small: true, onClick: function () { ui.openDiplomacy(owner); } })); dock.appendChild(rb);
        }
      }
      ui.selectCityPeek = function () {};
      function dockSignature() {
        const c = W.selCity;
        if (c) {
          let s = 'c' + c.id + c.nation + W.pickPlot + W.prodKind + W.prodSource + you.captured.length + (c.port ? 'p' : '') + '|';
          c.plots.forEach(function (p) { s += p.role ? p.role[0] : '-'; });
          if (c.nation === you.id) s += '|' + [10, 100, 200, 300].map(function (n) { return you.money >= n ? 1 : 0; }).join('') + (Math.floor(you.money / 40));
          return s;
        }
        if (W.sel.length) return 's' + W.sel.map(function (v) { return v.id; }).join(',');
        return '';
      }
      function updateDock(dt) {
        const sig = dockSignature();
        if (sig !== dockSig) { dockSig = sig; buildDock(); }
        const c = W.selCity;
        if (c) {
          if (c.nation === you.id) {
            dockRefs.pop.textContent = '👥 ' + c.pop; dockRefs.inc.textContent = '💰 ' + Math.round(c.income) + '/min';
            const hp = c.happy; dockRefs.happy.setFill(hp / 100, (hp < 35 ? '😡 ' : hp < 55 ? '😐 ' : '😀 ') + Math.round(hp)); dockRefs.happy.firstChild.style.background = hp < 35 ? '#f43f5e' : hp < 55 ? '#f59e0b' : '#84cc16';
            dockRefs.status.textContent = c.riot ? '🔥 RIOT! No income until happiness recovers - build entertainment 🎪.' : c.factoryIdle ? '⚠️ Factories are short of workers: build houses 🏠.' : '';
            dockRefs.status.style.color = c.riot ? '#fb7185' : '#fcd34d';
            if (c.queue.length) { const q = c.queue[0]; dockRefs.queue.style.display = 'flex'; dockRefs.queue.setFill(q.t / q.dur, '🔧 ' + ROLE_ICON[q.role] + ' ' + Math.round(q.t / q.dur * 100) + '%' + (c.queue.length > 1 ? ' (+' + (c.queue.length - 1) + ')' : '')); } else dockRefs.queue.style.display = 'none';
          } else if (dockRefs.hall) {
            const alive = c.turrets.filter(function (t) { return t.alive; }).length;
            dockRefs.tur.textContent = alive ? '🛡️ ' + alive + '/' + c.turrets.length + ' turrets standing - hall is shielded' : '🛡️ Turrets down - city hall exposed!';
            dockRefs.hall.setFill(c.hallHp / c.hallMax, '🏛️ ' + Math.round(c.hallHp) + '/' + c.hallMax);
            const tr = (c.trade[you.id] || 0), cv = (c.convert[you.id] || 0);
            dockRefs.trade.setFill(tr / 100, Math.round(tr) + '%'); dockRefs.conv.setFill(cv / 100, Math.round(cv) + '%');
            dockRefs.price.textContent = '💰 Trade level - buy price ' + CS.buyPrice(c, you.id) + (tr >= 100 ? '' : ' (full trade ring = ' + CS.price(c) + '; open-market buy-out needs peace)');
            dockRefs.buy.style.display = (tr >= 100 || W.getRel(you.id, c.nation) > -30) ? '' : 'none';
          }
        } else if (W.sel.length === 1 && dockRefs.hp) { const v = W.sel[0]; dockRefs.hp.setFill(v.hp / v.maxHp, '❤️ ' + Math.round(v.hp)); }
        // drop dead vehicles from selection
        if (W.sel.some(function (v) { return !v.alive; })) setSel(W.sel.filter(function (v) { return v.alive; }));
      }

      // ------------------------------------------------------------ small HUD bits
      function updateTL(force) {
        moneyC.set(Math.floor(you.money));
        const own = W.cities.filter(function (c) { return c.nation === you.id; }).length;
        cityBar.set(own, W.cities.length);
        incL.innerHTML = '<span>🏙️ <b>+' + Math.round(you.cityIncome || 0) + '</b>/min</span><span>✨ <b>+' + Math.round(you.spiceIncome || 0) + '</b>/min</span>';
        capL.innerHTML = ['land', 'sea', 'air'].map(function (r) { return '<span>' + ROLE_ICON[r] + ' <b>' + U.count(W, you.id, r) + '/' + U.cap(W, you.id, r) + '</b></span>'; }).join('') + '<span>✨ <b>' + W.geysers.filter(function (g) { return g.owner === you.id; }).length + '/' + W.geysers.length + '</b></span>';
      }
      function updateNations() {
        W.nations.forEach(function (n) {
          const r = nrows[n.id]; if (!r) return;
          const nc = W.cities.filter(function (c) { return c.nation === n.id; }).length;
          r.cc.textContent = '🏙️' + nc; r.row.style.opacity = nc ? 1 : 0.4;
          const rel = W.getRel(you.id, n.id); r.rb.textContent = SP.civAI.relLabel(rel); r.rb.style.background = relColor(rel);
        });
      }
      function drawMinimap() {
        const f = W.cam.forwardOnSurface(), up = W.cam.focusDir.clone(), rt = new V3().crossVectors(f, up).normalize();
        const G = W.grid, o = new V3();
        mm.draw(function (ctx, w, h) {
          const cell = 5, half = w / 2;
          for (let py = 0; py < h; py += cell) for (let px = 0; px < w; px += cell) {
            const x = (px + cell / 2 - half) / half, y = -((py + cell / 2 - half) / half), rho = Math.hypot(x, y); if (rho > 1) continue;
            const th = rho * Math.PI; o.set(0, 0, 0).addScaledVector(rt, x).addScaledVector(f, y); if (o.lengthSq() > 0) o.normalize();
            o.multiplyScalar(Math.sin(th)).addScaledVector(up, Math.cos(th));
            const lat = Math.asin(Math.max(-1, Math.min(1, o.y))), lon = Math.atan2(o.z, o.x);
            const cx = Math.min(G.NX - 1, Math.floor((lon + Math.PI) / (Math.PI * 2) * G.NX)), cy = Math.min(G.NY - 1, Math.floor((lat / Math.PI + 0.5) * G.NY));
            ctx.fillStyle = G.land[cy * G.NX + cx] ? '#4d7c0f' : '#0e7490'; ctx.fillRect(px, py, cell, cell);
          }
          const pt = function (dir) { const d = Math.max(-1, Math.min(1, dir.dot(up))), th = Math.acos(d); if (th < 1e-4) return [half, half]; const px = dir.dot(rt), py = dir.dot(f), l = Math.hypot(px, py) || 1; const rr = th / Math.PI * half; return [half + px / l * rr, half - py / l * rr]; };
          W.geysers.forEach(function (g) { const p = pt(g.dir); ctx.fillStyle = g.owner ? C.hexStr(W.nationById[g.owner].color) : '#e879f9'; ctx.fillRect(p[0] - 1.5, p[1] - 1.5, 3, 3); });
          W.cities.forEach(function (c) { const p = pt(c.dir); ctx.fillStyle = C.hexStr(W.nationById[c.nation].color); ctx.strokeStyle = '#080c14'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p[0], p[1], c.nation === you.id ? 5 : 4, 0, 6.3); ctx.fill(); ctx.stroke(); });
          W.vehicles.forEach(function (v) { const p = pt(v.dir); ctx.fillStyle = C.hexStr(W.nationById[v.nation].color); ctx.fillRect(p[0] - 1, p[1] - 1, 2.2, 2.2); });
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.strokeRect(half - 9, half - 6, 18, 12);
        });
      }

      // ------------------------------------------------------------ labels + overlay per frame
      function updateLabels() {
        const w = window.innerWidth, h = window.innerHeight;
        W.cities.forEach(function (c) {
          if (!lab[c.id]) makeLabel(c);
          const L = lab[c.id], n = W.nationById[c.nation];
          const vis = visibleDir(c.dir, 0.02);
          if (!vis) { L.el.style.display = 'none'; return; }
          toScreen(c.pos.clone().addScaledVector(c.dir, 11), _sc);
          if (_sc.z > 1 || _sc.x < -80 || _sc.x > w + 80 || _sc.y < -40 || _sc.y > h + 40) { L.el.style.display = 'none'; return; }
          L.el.style.display = '';
          const sc = Math.max(0.78, Math.min(1.12, 1.25 - W.camDist / 520));
          L.el.style.transform = 'translate(' + (_sc.x | 0) + 'px,' + (_sc.y | 0) + 'px) translate(-50%,-100%) scale(' + sc.toFixed(2) + ')';
          const key = c.name + n.id + n.name + (c.riot ? 'r' : '') + (c.underAttack > 0 ? 'a' : '') + (W.selCity === c ? 's' : '');
          if (key !== L.key) {
            L.key = key; L.name.textContent = c.name; L.dot.style.background = C.hexStr(n.color); L.type.textContent = C.TYPE_ICON[n.type];
            L.flags.textContent = (c.riot ? '🔥' : '') + (c.underAttack > 0 ? '💥' : '');
            L.sub.textContent = n.isPlayer ? 'your city' : n.name;
            L.el.classList.toggle('own', n.isPlayer); L.el.classList.toggle('sel', W.selCity === c);
          }
          const hf = 1 - c.hallHp / c.hallMax; let tr = 0, cv = 0;
          for (const k in c.trade) tr = Math.max(tr, c.trade[k]); for (const k in c.convert) cv = Math.max(cv, c.convert[k]);
          L.bm.style.display = hf > 0.02 ? 'block' : 'none'; L.bm.firstChild.style.width = Math.round(hf * 100) + '%';
          L.be.style.display = tr > 1 ? 'block' : 'none'; L.be.firstChild.style.width = Math.round(tr) + '%';
          L.br.style.display = cv > 1 ? 'block' : 'none'; L.br.firstChild.style.width = Math.round(cv) + '%';
        });
      }
      function drawOverlay() {
        const ctx = octx, w = overlay.width, h = overlay.height;
        ctx.clearRect(0, 0, w, h);
        // geysers
        if (W.camDist > 30) W.geysers.forEach(function (g) {
          if (!visibleDir(g.dir, 0.02)) return;
          toScreen(g.pos.clone().addScaledVector(g.dir, 11), _sc); if (_sc.z > 1) return;
          const own = g.owner ? W.nationById[g.owner] : null, s = Math.max(10, Math.min(18, 2000 / W.camDist));
          ctx.font = '700 ' + s + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          if (own) { ctx.fillStyle = C.hexStr(own.color); ctx.strokeStyle = '#080c14'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(_sc.x, _sc.y, s * 0.75, 0, 6.3); ctx.stroke(); ctx.fill(); ctx.globalAlpha = 1; ctx.fillStyle = '#fff'; ctx.fillText('✨', _sc.x, _sc.y + 1); }
          else { ctx.fillText('✨', _sc.x, _sc.y); }
        });
        // vehicles
        W.vehicles.forEach(function (v) {
          const isSel = v.sel, dmg = v.hp < v.maxHp * 0.999, mine = v.nation === you.id;
          if (!isSel && !dmg && !(mine && W.camDist < 90)) return;
          if (!visibleDir(v.dir, 0.01) || v.pos.distanceTo(W.camera.position) > 160) return;
          toScreen(v.pos, _sc); if (_sc.z > 1) return;
          const col = C.hexStr(W.nationById[v.nation].color);
          const r = Math.max(9, Math.min(26, 700 / Math.max(30, v.pos.distanceTo(W.camera.position)) * 1.2));
          if (isSel) { ctx.strokeStyle = '#22d3ee'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(_sc.x, _sc.y + r * 0.3, r, r * 0.55, 0, 0, 6.3); ctx.stroke(); }
          if (isSel || dmg) {
            const bw = Math.max(20, r * 1.7), bx = _sc.x - bw / 2, by = _sc.y - r * 1.3;
            ctx.fillStyle = '#080c14'; ctx.fillRect(bx - 2, by - 2, bw + 4, 7);
            const f = Math.max(0, v.hp / v.maxHp); ctx.fillStyle = f > 0.5 ? '#4ade80' : f > 0.25 ? '#facc15' : '#f43f5e'; ctx.fillRect(bx, by, bw * f, 3);
          }
          if (mine && v.order && isSel) {
            const td = SP.civUnits.orderTargetDir(W, v);
            if (td && visibleDir(td, 0.0)) { const tp = td.clone().multiplyScalar(W.R + 1); const a = { x: _sc.x, y: _sc.y }; toScreen(tp, _sc); ctx.strokeStyle = 'rgba(34,211,238,.6)'; ctx.setLineDash([5, 5]); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(_sc.x, _sc.y); ctx.stroke(); ctx.setLineDash([]); }
          }
        });
        // drag box
        const m = I.mouse;
        if (W.drag && m.left && m.dragging && Math.hypot(m.x - W.drag.x, m.y - W.drag.y) > 6) {
          ctx.fillStyle = 'rgba(34,211,238,.14)'; ctx.strokeStyle = '#22d3ee'; ctx.lineWidth = 2;
          ctx.fillRect(W.drag.x, W.drag.y, m.x - W.drag.x, m.y - W.drag.y); ctx.strokeRect(W.drag.x, W.drag.y, m.x - W.drag.x, m.y - W.drag.y);
        }
      }

      // ------------------------------------------------------------ frame
      let acc = 0, accM = 0;
      ui.update = function (dt) {
        W.camera.updateMatrixWorld(true);
        const m = I.mouse;
        if (!UI.modalCount() && !W.ended) {
          if (m.clicked && !I.pointerOverUI()) { if (m.touch) touchTap(); else leftClick(); }
          if (m.rightClicked && !I.pointerOverUI()) rightClick();
        }
        // ability cooldown
        if (W.abil.cd > 0) { W.abil.cd = Math.max(0, W.abil.cd - dt); abilBar.setCooldown('archetype', W.abil.cd / ab.cd); abilBar.setActive('archetype', false); }
        acc += dt; accM += dt;
        updateLabels(); drawOverlay();
        updateDock(dt);
        if (acc > 0.3) { acc = 0; updateTL(); updateNations(); }
        if (accM > 0.35) { accM = 0; drawMinimap(); }
      };
      ui.dispose = function () {
        style.remove(); offResize && offResize();
        [tl, tr, labels, overlay, bar, abHold, dock].forEach(function (e) { e.remove(); });
      };
      updateTL(true); updateNations(); abilBar.setCooldown('archetype', 0);
      ui.ab = ab;
      return ui;
    }
  };
})();
