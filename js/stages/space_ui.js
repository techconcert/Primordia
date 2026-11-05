/* SP.spaceUI — Space stage helper: injected CSS, alien portraits, contact dialog, shop, terraform panel,
   badges and the "Staff of Life" ending (comic panels + credits). All logic lives in SP.stages.space (S).   */
(function () {
  'use strict';
  const SP = window.SP = window.SP || {};
  const U = SP.util, V3 = THREE.Vector3;
  const ui = function () { return SP.ui; };
  const el = function (t, c, h) { return SP.ui.el(t, c, h); };
  const hex = function (n) { return '#' + ('000000' + n.toString(16)).slice(-6); };
  const X = SP.spaceUI = {};

  // ------------------------------------------------------------------ css
  const CSS = `
.sp-top{position:absolute;left:50%;top:var(--gutter);transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:6px;pointer-events:none}
.sp-top>*{pointer-events:auto}
.sp-title{font-size:22px;font-weight:700;color:#fde68a;padding:4px 16px;background:rgba(18,24,38,.82);border:3px solid var(--ink);border-radius:14px;box-shadow:0 4px 0 var(--ink);white-space:nowrap}
.sp-title small{display:block;font-size:12px;color:#94a3b8;font-weight:500;text-align:center}
.sp-views{display:flex;gap:6px}
.sp-stats{display:flex;flex-direction:column;gap:6px}
.sp-stats .bar{min-width:190px}
.sp-side{display:flex;flex-direction:column;gap:8px;align-items:flex-end}
.sp-side .row{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
.sp-card{width:min(310px,calc(100vw - 32px));font-size:14px;color:#e2e8f0}
.sp-card h3{margin:0 0 4px;font-size:20px;color:#fde68a;display:flex;align-items:center;gap:6px}
.sp-card .sub{color:#94a3b8;font-size:12px;margin-bottom:6px}
.sp-card .kv{display:flex;justify-content:space-between;gap:10px;padding:2px 0;border-bottom:1px dashed rgba(148,163,184,.25)}
.sp-card .kv b{color:#fff}
.sp-card .btns{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
.sp-tpips{display:inline-flex;gap:2px;font-size:16px}
.sp-mission{max-width:300px;font-size:13px;color:#e2e8f0}
.sp-mission b{color:#fde047}
.sp-alert{position:absolute;left:50%;top:92px;transform:translateX(-50%);padding:6px 16px;background:rgba(127,29,29,.92);border:3px solid var(--ink);border-radius:14px;box-shadow:0 4px 0 var(--ink);font-weight:700;color:#fecaca;pointer-events:none;animation:spBlink 1s ease-in-out infinite;white-space:nowrap}
@keyframes spBlink{50%{filter:brightness(1.5)}}
.sp-pin{position:absolute;transform:translate(-50%,-100%);pointer-events:none;font-weight:700;font-size:13px;color:#fff;white-space:nowrap;text-align:center;padding:0}
.sp-pin span{display:inline-block;background:rgba(8,12,20,.8);border:2px solid var(--ink);border-radius:9px;padding:1px 8px}
.sp-pin i{display:block;font-style:normal;font-size:20px;line-height:1;animation:spBob 1.2s ease-in-out infinite}
@keyframes spBob{50%{transform:translateY(-4px)}}
.sp-warp{position:absolute;inset:0;pointer-events:none;opacity:0;background:radial-gradient(circle at 50% 50%,rgba(255,255,255,0) 0%,rgba(125,211,252,.0) 30%,rgba(125,211,252,.55) 60%,rgba(255,255,255,1) 100%)}
.sp-fade{position:absolute;inset:0;pointer-events:none;opacity:0;background:#05070d}
.sp-hint{position:absolute;left:50%;bottom:calc(var(--gutter) + 70px);transform:translateX(-50%);color:#e2e8f0;font-size:14px;background:rgba(8,12,20,.6);border-radius:10px;padding:4px 12px;pointer-events:none;white-space:nowrap;max-width:calc(100vw - 32px);overflow:hidden;text-overflow:ellipsis}
.sp-bottom{position:absolute;left:50%;bottom:calc(var(--gutter) + 6px);transform:translateX(-50%);display:flex;gap:10px;align-items:flex-end;pointer-events:none}
.sp-bottom>*{pointer-events:auto}
/* contact */
.modal-box.modal-wide{width:min(780px,100%)}
.sp-contact{display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap;width:100%}
.sp-port{position:relative;width:200px;flex:none;border:4px solid var(--ink);border-radius:14px;box-shadow:0 5px 0 var(--ink);overflow:hidden;background:radial-gradient(circle at 50% 40%,var(--c) 0%,rgba(8,12,20,.9) 120%);transform:rotate(-2deg)}
.sp-port img{display:block;width:100%;height:200px;object-fit:cover}
.sp-port .nm{padding:4px 8px;background:var(--ink);color:#fff;font-weight:700;font-size:14px;text-align:center}
.sp-port .halftone{position:absolute;inset:0;background-image:radial-gradient(rgba(0,0,0,.28) 1.4px,transparent 1.5px);background-size:7px 7px;pointer-events:none;mix-blend-mode:multiply}
.sp-cmain{flex:1;min-width:0;flex-basis:260px;display:flex;flex-direction:column;gap:10px}
.sp-bubble{position:relative;background:#fffbeb;color:#1e293b;border:3.5px solid var(--ink);border-radius:20px;padding:10px 14px;font-weight:600;font-size:16px;box-shadow:0 4px 0 var(--ink)}
.sp-bubble:before{content:"";position:absolute;left:-16px;top:26px;border:10px solid transparent;border-right:14px solid var(--ink)}
.sp-bubble:after{content:"";position:absolute;left:-10px;top:28px;border:8px solid transparent;border-right:11px solid #fffbeb}
.sp-att{display:flex;align-items:center;gap:8px;font-size:13px;color:#94a3b8}
.sp-att .trk{flex:1;height:14px;border-radius:8px;border:2.5px solid var(--ink);background:linear-gradient(90deg,#be123c,#f59e0b 50%,#22c55e);position:relative}
.sp-att .trk i{position:absolute;top:-6px;width:10px;height:22px;border-radius:5px;background:#fff;border:2.5px solid var(--ink);transform:translateX(-50%)}
.sp-actions{display:flex;flex-wrap:wrap;gap:6px;flex-wrap:wrap}
.sp-sub{background:rgba(8,12,20,.45);border-radius:12px;padding:8px;display:flex;flex-direction:column;gap:6px;max-height:220px;overflow:auto;font-size:14px}
.sp-row{display:flex;align-items:center;gap:8px;justify-content:space-between}
.sp-row .l{display:flex;align-items:center;gap:8px;flex:1;min-width:0}
.sp-dot{display:inline-block;width:14px;height:14px;border-radius:50%;border:2px solid var(--ink);flex:none}
/* shop */
.sp-shop{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px;width:100%;max-height:58vh;overflow:auto;padding:4px}
.sp-item{background:rgba(30,41,59,.9);border:3px solid var(--ink);border-radius:14px;padding:8px 10px;display:flex;flex-direction:column;gap:4px;box-shadow:0 3px 0 var(--ink)}
.sp-item .t{display:flex;align-items:center;gap:6px;font-weight:700;color:#fff;font-size:15px}
.sp-item .t span{font-size:24px}
.sp-item .d{font-size:12px;color:#94a3b8;flex:1}
.sp-item .pips{display:flex;gap:3px}
.sp-item .pips i{width:12px;height:8px;border-radius:3px;background:#1e293b;border:1.5px solid var(--ink)}
.sp-item .pips i.on{background:#fde047}
.sp-money{font-size:20px;font-weight:700;color:#fde047;margin-bottom:6px}
/* terraform */
.sp-tf{width:min(300px,calc(100vw - 32px));font-size:13px;color:#e2e8f0;display:flex;flex-direction:column;gap:4px;padding:8px 12px}
.sp-tf h3{margin:0;font-size:18px;color:#fde68a;display:flex;align-items:center;gap:6px;justify-content:space-between}
.sp-tf canvas{width:100%;max-width:118px;align-self:center;border:3px solid var(--ink);border-radius:12px;background:#0b1220}
.sp-tf .sl{display:flex;flex-direction:column;gap:0}
.sp-tf .sl label{display:flex;justify-content:space-between;font-weight:600}
.sp-tf input[type=range]{width:100%;accent-color:#22d3ee;margin:2px 0}
.sp-tf .tools{display:flex;gap:6px;flex-wrap:wrap}
.sp-tf .tools .btn{flex:1;min-width:84px;justify-content:center}
.sp-tf .row{display:flex;gap:6px;flex-wrap:wrap}
.sp-tf .row .btn{flex:1;justify-content:center}
/* B-13: toasts sit below the title/view buttons, pins stay behind the HUD */
#toasts{padding-top:calc(var(--gutter) + 112px)}
.sp-pin{z-index:1}.sp-stats,.sp-side,.sp-top,.sp-card,.sp-bottom,.sp-mission{z-index:2}
/* B-07: on-screen flight controls for touch */
.sp-touch{position:absolute;left:0;right:0;bottom:0;height:0;pointer-events:none;z-index:3}
.sp-tbtn{position:absolute;width:62px;height:62px;border-radius:50%;border:4px solid var(--ink);background:rgba(30,41,59,.88);color:#fff;font-size:26px;box-shadow:0 4px 0 var(--ink);pointer-events:auto;touch-action:none;user-select:none;-webkit-user-select:none;display:flex;align-items:center;justify-content:center;padding:0}
.sp-tbtn.on{background:#fde047;color:#000;transform:translateY(2px);box-shadow:0 2px 0 var(--ink)}
.sp-tbtn.fire{background:rgba(190,18,60,.9)}.sp-tbtn.fire.on{background:#fb7185}
@media (max-width:700px){
.sp-stats .bar{min-width:0}
.sp-stats .bar .bar-label,.sp-stats .bar.core{display:none}
.sp-top{left:var(--gutter);top:calc(var(--gutter) + 118px);transform:none;align-items:flex-start;flex-direction:row;flex-wrap:wrap;gap:4px;max-width:calc(100vw - 100px)}
.sp-title{font-size:13px;padding:2px 8px;white-space:normal}.sp-title small{font-size:10px;text-align:left}
.sp-views .btn{padding:3px 8px}.sp-views .btn .btn-label{display:none}
.sp-side{top:var(--gutter);right:var(--gutter)}.sp-side .row{flex-direction:column;flex-wrap:nowrap}.sp-side .row .btn .btn-label{display:none}
.sp-side .row .btn{min-width:0;padding:6px 9px}
.sp-mission{position:fixed;left:var(--gutter);top:calc(var(--gutter) + 196px);max-width:calc(100vw - 100px);font-size:11px;padding:4px 8px}
.sp-hint,.sp-bottom .sp-hint{display:none}
.sp-card{position:fixed;left:var(--gutter);right:var(--gutter);width:auto;bottom:calc(var(--gutter) + 82px)}
#toasts{inset:auto 0 150px 0;padding-top:0;flex-direction:column-reverse}
.sp-alert{top:auto;bottom:calc(var(--gutter) + 150px);font-size:13px;padding:3px 10px}
.sp-bottom{left:50%}
}
/* ending */
.sp-end{position:absolute;inset:0;z-index:45;background:radial-gradient(ellipse at 50% 40%,#1b1f3b 0%,#05070d 90%);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:var(--gutter);pointer-events:auto;overflow:hidden}
.sp-comic{display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;gap:12px;width:min(920px,100%);aspect-ratio:16/10;max-height:calc(100vh - 120px)}
@media (max-width:720px){.sp-comic{grid-template-columns:1fr;grid-template-rows:none;aspect-ratio:auto}}
.sp-pnl{position:relative;border:5px solid #fff;outline:4px solid var(--ink);background:#0b1220;overflow:hidden;transform:scale(.2) rotate(-6deg);opacity:0;transition:transform .5s cubic-bezier(.2,1.4,.4,1),opacity .3s;box-shadow:0 8px 0 var(--ink)}
.sp-pnl.on{transform:scale(1) rotate(var(--r,0deg));opacity:1}
.sp-pnl svg,.sp-pnl .art{position:absolute;inset:0;width:100%;height:100%}
.sp-pnl .cap{position:absolute;left:8px;bottom:8px;right:30%;background:#fde047;color:#1e293b;border:3px solid var(--ink);padding:4px 8px;font-weight:700;font-size:clamp(11px,1.6vw,17px);box-shadow:3px 3px 0 var(--ink)}
.sp-pnl .bub{position:absolute;right:8px;top:8px;max-width:48%;background:#fff;color:#1e293b;border:3px solid var(--ink);border-radius:50%/40%;padding:6px 12px;font-weight:700;font-size:clamp(11px,1.6vw,17px);text-align:center}
.sp-pnl .dots{position:absolute;inset:0;background-image:radial-gradient(rgba(0,0,0,.22) 1.5px,transparent 1.6px);background-size:8px 8px;pointer-events:none}
.sp-credits{position:absolute;inset:0;overflow:hidden;text-align:center;color:#e2e8f0;background:radial-gradient(ellipse at 50% 40%,#1b1f3b 0%,#05070d 90%)}
.sp-credits .roll{position:absolute;left:0;right:0;top:100%;animation:spRoll 38s linear forwards;padding:0 var(--gutter)}
@keyframes spRoll{to{transform:translateY(calc(-100% - 100vh))}}
.sp-credits h1{font-size:clamp(40px,8vw,84px);color:#a3e635;margin:0 0 20px}
.sp-credits h2{font-size:clamp(22px,3.4vw,34px);color:#fde68a;margin:34px 0 6px}
.sp-credits p{font-size:clamp(16px,2.4vw,22px);margin:4px 0}
.sp-endbtns{position:absolute;bottom:0;left:0;right:0;padding:48px 12px 22px;background:linear-gradient(rgba(5,7,13,0),#05070d 42%);z-index:3;display:flex;gap:12px;justify-content:center;flex-wrap:wrap;opacity:0;transition:opacity 1s;pointer-events:none}
.sp-endbtns.on{opacity:1;pointer-events:auto}
.sp-badges{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;min-width:min(560px,calc(100vw - 80px))}
.sp-badge{border:3px solid var(--ink);border-radius:14px;background:rgba(30,41,59,.9);padding:8px;text-align:center;opacity:.45;filter:grayscale(.8)}
.sp-badge.on{opacity:1;filter:none;background:rgba(113,63,18,.85)}
.sp-badge span{font-size:34px;display:block}
.sp-badge small{display:block;color:#cbd5e1}
`;
  X.injectCss = function () {
    if (document.getElementById('space-css')) return;
    const s = document.createElement('style'); s.id = 'space-css'; s.textContent = CSS; document.head.appendChild(s);
  };
  X.removeCss = function () { const s = document.getElementById('space-css'); if (s) s.remove(); };

  // ------------------------------------------------------------------ portraits (own tiny renderer, cached as data URLs)
  let pr = null; const portCache = {};
  function portRenderer() {
    if (pr) return pr;
    try {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
      const r = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
      r.setSize(256, 256, false); r.setClearColor(0x000000, 0);
      const scene = new THREE.Scene();
      const amb = new THREE.AmbientLight(0xfff7ed, 0.5), sun = new THREE.DirectionalLight(0xffedd5, 0.3), rim = new THREE.DirectionalLight(0x38bdf8, 0.15);
      sun.position.set(2, 3, 4); rim.position.set(-3, 1, -2); scene.add(amb, sun, rim);
      const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
      pr = { r: r, scene: scene, cam: cam, canvas: canvas };
    } catch (e) { console.error('portrait renderer', e); pr = { fail: true }; }
    return pr;
  }
  X.portrait = function (design, key) {
    key = key || (design && design.name) || 'x';
    if (portCache[key]) return portCache[key];
    const P = portRenderer();
    if (P.fail || !design) return null;
    let url = null, rig = null;
    try {
      rig = SP.creature.build(design, { lod: 'low', outline: true, shadows: false });
      try { SP.creature.animate(rig, 0.016, { speed: 0, turn: 0, action: null, actionT: 0 }); } catch (e) {}
      rig.root.rotation.y = 0.45;
      P.scene.add(rig.root);
      P.scene.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(rig.root), c = new V3(), sz = new V3();
      box.getCenter(c); box.getSize(sz);
      const h = Math.max(sz.y, 0.5), headY = box.max.y - h * 0.3;
      const span = Math.max(h * 0.62, Math.min(sz.x, sz.z) * 0.9, 0.9);
      P.cam.position.set(c.x + span * 0.35, headY + span * 0.12, c.z + span * 2.6);
      P.cam.lookAt(c.x, headY, c.z);
      P.r.render(P.scene, P.cam);
      url = P.canvas.toDataURL('image/png');
    } catch (e) { console.error('portrait', e); }
    if (rig) { P.scene.remove(rig.root); try { rig.dispose(); } catch (e) {} }
    if (url) portCache[key] = url;
    return url;
  };

  // B-16: render the player's own ship for the ending comic
  X.shipPortrait = function (design, key) {
    key = 'ship:' + (key || 'p');
    if (portCache[key]) return portCache[key];
    const P = portRenderer(); if (P.fail || !design) return null;
    let url = null, rig = null;
    try {
      rig = SP.assembly.build(design, { animate: false });
      rig.root.rotation.y = -0.6; P.scene.add(rig.root); P.scene.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(rig.root), c = new V3(), sz = new V3(); box.getCenter(c); box.getSize(sz);
      const m = Math.max(sz.x, sz.y, sz.z, 0.5);
      P.cam.position.set(c.x + m * 1.1, c.y + m * 1.0, c.z + m * 2.5); P.cam.lookAt(c);
      P.r.render(P.scene, P.cam); url = P.canvas.toDataURL('image/png');
    } catch (e) { console.error('ship portrait', e); }
    if (rig) { P.scene.remove(rig.root); try { rig.dispose(); } catch (e) {} }
    if (url) portCache[key] = url;
    return url;
  };

  // ------------------------------------------------------------------ contact dialog (comic)
  const GREET_BAD = ['We have nothing to say to you.', 'Leave our space, intruder!', 'Your ship is in our sights...'];
  const GREET_MID = ['State your business.', 'Hmm. Another traveller.', 'We are listening. Briefly.'];
  const GREET_GOOD = ['Friend! Your visit brightens our day!', 'Welcome back! What can we do for you?', 'The stars smile on you, ally!'];
  X.contact = function (S, empId, first) {
    if (S._contactOpen) return null;
    const gal = S.gal, em = gal.empires[empId], rel = S.rel(empId);
    rel.contact = true;
    const body = el('div', 'sp-contact');
    const url = X.portrait(em.design, 'emp' + empId + ':' + S.gal.seed);
    const port = el('div', 'sp-port'); port.style.setProperty('--c', hex(em.color));
    port.innerHTML = (url ? '<img src="' + url + '" alt="">' : '<div style="height:200px;display:flex;align-items:center;justify-content:center;font-size:90px">👽</div>') +
      '<div class="halftone"></div><div class="nm">' + em.species + ' ' + em.persIcon + '</div>';
    const main = el('div', 'sp-cmain');
    const bubble = el('div', 'sp-bubble');
    const att = el('div', 'sp-att');
    const sub = el('div', 'sp-sub');
    const actions = el('div', 'sp-actions');
    main.appendChild(bubble); main.appendChild(att); main.appendChild(actions); main.appendChild(sub);
    body.appendChild(port); body.appendChild(main);
    let say = first ? em.hello[0] : (rel.att < -20 ? GREET_BAD : rel.att > 35 ? GREET_GOOD : GREET_MID)[Math.floor(Math.random() * 3)];
    if (rel.war) say = 'We are at WAR, ' + (SP.game.state.speciesName || 'stranger') + '! Unless you beg for peace...';
    let modal = null, mode = null;

    function sync() {
      bubble.textContent = say;
      const f = U.clamp((rel.att + 100) / 200, 0, 1);
      att.innerHTML = '<span>' + (rel.att < -30 ? '😠' : rel.att < 20 ? '😐' : '😊') + ' ' + (rel.war ? 'WAR' : rel.ally ? 'Allied' : 'Attitude') + '</span><div class="trk"><i style="left:' + (f * 100) + '%"></i></div><b>' + Math.round(rel.att) + '</b>';
      actions.innerHTML = '';
      const btn = function (label, icon, color, fn) { const b = SP.ui.button(label, { icon: icon, color: color, small: true, onClick: fn }); actions.appendChild(b); return b; };
      if (!rel.war) {
        btn('Trade spice', '✨', 'amber', function () { mode = mode === 'trade' ? null : 'trade'; say = 'What do you have to sell?'; sync(); });
        btn('Gift 50💰', '🎁', 'cyan', function () { say = S.gift(empId); sync(); });
        btn('Missions', '📜', 'green', function () { mode = mode === 'mission' ? null : 'mission'; say = 'We always need a capable pilot.'; sync(); });
        if (!rel.ally) btn('Alliance', '🤝', 'purple', function () { const r = S.proposeAlliance(empId); say = r.msg; sync(); });
        btn('Declare war', '⚔️', 'rose', function () { say = S.declareWar(empId); sync(); });
      } else {
        btn('Beg for peace (300💰)', '🕊️', 'green', function () { say = S.makePeace(empId); sync(); });
      }
      sub.style.display = mode ? '' : 'none'; sub.innerHTML = '';
      if (mode === 'trade') {
        let any = false;
        G().SPICES.forEach(function (sp) {
          const n = S.st.spice[sp.id] || 0; if (n <= 0) return; any = true;
          const price = S.spicePrice(empId, sp.id), liked = em.likes.indexOf(sp.id) >= 0;
          const row = el('div', 'sp-row'), l = el('div', 'l', '<i class="sp-dot" style="background:' + hex(sp.color) + '"></i><span>' + sp.name + ' ×' + n + '</span><small style="color:#94a3b8">' + price + '💰 each' + (liked ? ' 😍 loved' : em.dislikes === sp.id ? ' 🙁' : '') + '</small>');
          row.appendChild(l);
          row.appendChild(SP.ui.button('Sell all +' + price * n + '💰', { color: 'green', small: true, icon: '💰', sfx: 'coin', onClick: function () { say = S.sellSpice(empId, sp.id); sync(); } }));
          sub.appendChild(row);
        });
        if (!any) sub.appendChild(el('div', '', 'You carry no spice. Colonise planets with spice and visit them to collect it!'));
      } else if (mode === 'mission') {
        const cur = S.st.mission;
        if (cur) {
          sub.appendChild(el('div', '', 'Current mission: <b>' + cur.text + '</b>'));
          sub.appendChild(SP.ui.button('Abandon', { color: 'slate', small: true, onClick: function () { S.abandonMission(); say = 'A pity.'; sync(); } }));
        } else {
          const offers = S.missionOffers(empId);
          offers.forEach(function (m) {
            const row = el('div', 'sp-row'); row.appendChild(el('div', 'l', '<span>' + m.icon + ' ' + m.text + '</span>'));
            row.appendChild(SP.ui.button('Accept +' + m.reward + '💰', { color: 'green', small: true, onClick: function () { S.acceptMission(m); say = 'Excellent. Return when it is done.'; mode = null; sync(); } }));
            sub.appendChild(row);
          });
          if (!offers.length) sub.appendChild(el('div', '', 'No missions today.'));
        }
      }
    }
    sync();
    modal = SP.ui.modal({ title: em.persIcon + ' ' + em.name, body: body, className: 'modal-wide', buttons: [{ label: 'Goodbye', color: 'slate', icon: '👋' }], onClose: function () { S._contactOpen = false; } });
    S._contactOpen = true;
    return modal;
  };
  function G() { return SP.spaceGalaxy; }

  // ------------------------------------------------------------------ shop
  X.shop = function (S) {
    const body = el('div'), money = el('div', 'sp-money'), grid = el('div', 'sp-shop');
    body.appendChild(money); body.appendChild(grid);
    function render() {
      money.textContent = '💰 ' + Math.floor(S.st.money) + ' Primordiabucks';
      grid.innerHTML = '';
      S.shopItems().forEach(function (it) {
        const c = el('div', 'sp-item');
        c.appendChild(el('div', 't', '<span>' + it.icon + '</span>' + it.name));
        c.appendChild(el('div', 'd', it.desc));
        if (it.max) { let p = '<div class="pips">'; for (let i = 0; i < it.max; i++) p += '<i class="' + (i < it.level ? 'on' : '') + '"></i>'; c.appendChild(el('div', '', p + '</div>')); }
        if (it.count !== undefined) c.appendChild(el('div', 'd', 'Owned: <b style="color:#fff">' + it.count + '</b>'));
        const b = SP.ui.button(it.disabled ? it.reason : (it.price ? it.price + '💰' : 'Free'), { color: it.disabled ? 'slate' : 'green', small: true, icon: it.disabled ? '' : '🛒', sfx: 'coin', onClick: function () { S.buy(it.id); render(); } });
        if (it.disabled) b.disabled = true;
        c.appendChild(b); grid.appendChild(c);
      });
    }
    render();
    return SP.ui.modal({ title: '🛒 Galactic Market', body: body, className: 'modal-wide', buttons: [{ label: 'Done', color: 'green' }] });
  };

  // ------------------------------------------------------------------ badges
  X.badges = function (S) {
    const g = el('div', 'sp-badges');
    S.badgeList().forEach(function (b) { g.appendChild(el('div', 'sp-badge' + (b.got ? ' on' : ''), '<span>' + b.icon + '</span><b>' + b.name + '</b><small>' + b.desc + '</small>')); });
    return SP.ui.modal({ title: '🏅 Badges', body: g, buttons: [{ label: 'Close', color: 'green' }] });
  };

  // ------------------------------------------------------------------ terraform / planet panel (orbit view)
  X.planetPanel = function (S) {
    const root = el('div', 'panel sp-tf');
    const head = el('h3'), cv = document.createElement('canvas'); cv.width = cv.height = 170;
    const g = cv.getContext('2d');
    const info = el('div', 'sub');
    const slA = mkSlider('🌫️ Atmosphere'), slT = mkSlider('🌡️ Temperature');
    const tools = el('div', 'tools'), life = el('div', 'row'), act = el('div', 'row');
    root.appendChild(head); root.appendChild(cv); root.appendChild(info); root.appendChild(slA.el); root.appendChild(slT.el); root.appendChild(tools); root.appendChild(life); root.appendChild(act);
    function mkSlider(label) {
      const w = el('div', 'sl'), lab = el('label'), inp = document.createElement('input');
      inp.type = 'range'; inp.min = 0; inp.max = 100; inp.step = 1; inp.value = 50;
      w.appendChild(lab); w.appendChild(inp);
      return { el: w, lab: lab, inp: inp, label: label, touched: false };
    }
    slA.inp.addEventListener('input', function () { slA.touched = true; draw(); });
    slT.inp.addEventListener('input', function () { slT.touched = true; draw(); });
    const tool = function (id, icon, label) {
      const b = SP.ui.button(label, { icon: icon, color: 'indigo', small: true, onClick: function () { S.useToolBuy(id); sync(true); } });
      b.dataset.tool = id; tools.appendChild(b); return b;
    };
    const bGen = tool('gen', '🌫️', '0'), bFrz = tool('frz', '❄️', '0'), bHeat = tool('heat', '🔥', '0');
    const bPlant = SP.ui.button('Plants', { icon: '🌱', color: 'green', small: true, onClick: function () { S.placeLife('plants'); sync(true); } });
    const bAnim = SP.ui.button('Animals', { icon: '🐾', color: 'amber', small: true, onClick: function () { S.placeLife('animals'); sync(true); } });
    life.appendChild(bPlant); life.appendChild(bAnim);
    const bApply = SP.ui.button('Terraform', { icon: '🛠️', color: 'cyan', small: true, onClick: function () { S.applyTerraform(+slA.inp.value, +slT.inp.value); slA.touched = slT.touched = false; sync(true); } });
    const bScan = SP.ui.button('Scan', { icon: '🔬', color: 'purple', small: true, onClick: function () { S.scanOrbitPlanet(); sync(true); } });
    const bCol = SP.ui.button('Colonise', { icon: '🏗️', color: 'green', small: true, onClick: function () { S.beginColonise(); sync(true); } });
    const bCollect = SP.ui.button('Collect', { icon: '✨', color: 'amber', small: true, onClick: function () { S.collectHere(); sync(true); } });
    act.appendChild(bScan); act.appendChild(bApply); act.appendChild(bCol); act.appendChild(bCollect);

    function steps(cur, tgt) { return Math.ceil(Math.abs(tgt - cur) / 12 - 0.001); }
    function draw() {
      const ps = S.orbitPS(); if (!ps) return;
      const W = 170, pad = 12, sc = (W - pad * 2) / 100;
      g.clearRect(0, 0, W, W);
      const gx = function (a) { return pad + a * sc; }, gy = function (t) { return pad + (100 - t) * sc; };
      const bands = SP.spaceGalaxy.BANDS, cols = ['rgba(250,204,21,.18)', 'rgba(132,204,22,.28)', 'rgba(34,197,94,.5)'];
      bands.forEach(function (b, i) {
        g.fillStyle = cols[i]; g.strokeStyle = '#080c14'; g.lineWidth = 2;
        const x0 = gx(50 - b), y0 = gy(50 + b), w = b * 2 * sc;
        g.beginPath(); g.rect(x0, y0, w, w); g.fill(); g.stroke();
      });
      g.fillStyle = '#94a3b8'; g.font = '600 10px Fredoka, sans-serif'; g.textAlign = 'center';
      g.fillText('thin ← atmosphere → thick', W / 2, W - 1); g.save(); g.translate(8, W / 2); g.rotate(-Math.PI / 2); g.fillText('cold ← temp → hot', 0, 0); g.restore();
      const tgtA = +slA.inp.value, tgtT = +slT.inp.value;
      if (slA.touched || slT.touched) {
        g.strokeStyle = '#67e8f9'; g.setLineDash([4, 3]); g.lineWidth = 2; g.beginPath(); g.moveTo(gx(ps.atmo), gy(ps.temp)); g.lineTo(gx(tgtA), gy(tgtT)); g.stroke(); g.setLineDash([]);
        g.beginPath(); g.arc(gx(tgtA), gy(tgtT), 6, 0, 6.3); g.strokeStyle = '#67e8f9'; g.lineWidth = 2.5; g.stroke();
      }
      g.beginPath(); g.arc(gx(ps.atmo), gy(ps.temp), 6, 0, 6.3); g.fillStyle = '#fff'; g.fill(); g.lineWidth = 2.5; g.strokeStyle = '#080c14'; g.stroke();
    }
    function sync(force) {
      const ps = S.orbitPS(), def = S.orbitDef(); if (!ps || !def) return;
      const T = SP.spaceGalaxy.tScore(ps);
      head.innerHTML = '<span>' + SP.spaceGalaxy.PTYPES[def.type].icon + ' ' + def.name + '</span><span class="sp-tpips">' + [0, 1, 2].map(function (i) { return i < T ? '⭐' : '☆'; }).join('') + '</span>';
      if (!slA.touched) slA.inp.value = Math.round(ps.atmo); if (!slT.touched) slT.inp.value = Math.round(ps.temp);
      const inh = def.inhabited !== undefined, sc = ps.scanned;
      const sp = def.spice >= 0 ? SP.spaceGalaxy.SPICES[def.spice] : null;
      info.innerHTML = def.home ? '🏠 Your homeworld. Energy refills here.' : inh ? '👽 Inhabited by the ' + S.gal.empires[def.inhabited].species + '.' :
        (sc ? 'T-score ' + T + '/3 · life: ' + def.life + ' · ' + (sp ? '<span style="color:' + hex(sp.color) + '">✨ ' + sp.name + '</span>' : 'no spice') : 'Not scanned yet. Scan to reveal spice & life.') +
        (ps.colony ? '<br>🏗️ Colony lvl ' + ps.colony.level + ' · stored ✨ ' + Math.floor(ps.colony.store) : '');
      slA.lab.innerHTML = '<span>' + slA.label + '</span><b>' + Math.round(ps.atmo) + (slA.touched ? ' → ' + slA.inp.value : '') + '</b>';
      slT.lab.innerHTML = '<span>' + slT.label + '</span><b>' + Math.round(ps.temp) + (slT.touched ? ' → ' + slT.inp.value : '') + '</b>';
      const nA = steps(ps.atmo, +slA.inp.value), dT = +slT.inp.value - ps.temp, nT = steps(ps.temp, +slT.inp.value);
      bApply.querySelector('.btn-label').textContent = (nA || nT) ? 'Apply (' + (nA ? nA + '🌫️ ' : '') + (nT ? nT + (dT < 0 ? '❄️' : '🔥') : '') + ')' : 'Terraform';
      const inv = S.st.inv;
      bGen.querySelector('.btn-label').textContent = '×' + inv.gen; bFrz.querySelector('.btn-label').textContent = '×' + inv.frz; bHeat.querySelector('.btn-label').textContent = '×' + inv.heat;
      bGen.title = 'Atmosphere generator charges (+/-12). Click to buy one for ' + S.priceOf('gen') + '💰'; bFrz.title = 'Freezer charges (-12 temp). Buy for ' + S.priceOf('frz') + '💰'; bHeat.title = 'Heater charges (+12 temp). Buy for ' + S.priceOf('heat') + '💰';
      bPlant.querySelector('.btn-label').textContent = 'Plants ×' + inv.plants + (ps.plants ? ' (' + ps.plants + ')' : ''); bAnim.querySelector('.btn-label').textContent = 'Animals ×' + inv.animals + (ps.animals ? ' (' + ps.animals + ')' : '');
      bScan.style.display = sc || inh ? 'none' : '';
      bCol.style.display = (ps.colony || def.home || inh || def.type === 'gas') ? 'none' : ''; bCol.querySelector('.btn-label').textContent = 'Colonise (' + inv.packs + ' pack' + (inv.packs === 1 ? '' : 's') + ')';
      bCollect.style.display = ps.colony && ps.colony.store >= 1 ? '' : 'none';
      bApply.style.display = (inh) ? 'none' : '';
      draw();
    }
    return { el: root, sync: sync };
  };

  // ------------------------------------------------------------------ the ending
  const PANELS = [
    { r: '-1.5deg', cap: 'After a long, long journey through the stars...', ship: true, art: function () { return svgScene('#0b1030', '#312e81', '<g transform="translate(160,110) rotate(-25)" class="sp-fallback-ship"><ellipse cx="0" cy="0" rx="46" ry="14" fill="#e2e8f0" stroke="#080c14" stroke-width="5"/><ellipse cx="0" cy="-8" rx="20" ry="14" fill="#7dd3fc" stroke="#080c14" stroke-width="5"/><path d="M-60,4 L-130,20 L-60,12Z" fill="#f97316" stroke="#080c14" stroke-width="4"/></g>'); } },
    { r: '1.2deg', cap: 'The Grox guard the heart of the galaxy.', bub: 'Turn back, little ones!', art: function () { return svgScene('#2a0a14', '#7f1d1d', '<circle cx="160" cy="105" r="55" fill="#ef4444" stroke="#080c14" stroke-width="6"/><path d="M118,78 L152,92 M202,78 L168,92" stroke="#080c14" stroke-width="7" stroke-linecap="round"/><circle cx="140" cy="97" r="12" fill="#fff" stroke="#080c14" stroke-width="4"/><circle cx="180" cy="97" r="12" fill="#fff" stroke="#080c14" stroke-width="4"/><circle cx="143" cy="99" r="5" fill="#080c14"/><circle cx="177" cy="99" r="5" fill="#080c14"/><path d="M132,142 Q160,118 188,142" stroke="#080c14" stroke-width="6" fill="none"/><path d="M146,134 l6,10 l6,-12 l6,12 l6,-12 l6,12" stroke="#fff" stroke-width="4" fill="none"/>'); } },
    { r: '1deg', cap: 'There, glowing in the core: the STAFF OF LIFE!', art: function () { return svgScene('#3b2a05', '#fde047', '<g stroke="#fff7c2" stroke-width="3" opacity=".6"><path d="M160,110 L40,10 M160,110 L280,10 M160,110 L10,110 M160,110 L310,110 M160,110 L60,200 M160,110 L260,200"/></g><rect x="152" y="70" width="16" height="140" rx="8" fill="#fbbf24" stroke="#080c14" stroke-width="5"/><circle cx="160" cy="62" r="26" fill="#fffbeb" stroke="#080c14" stroke-width="5"/><circle cx="160" cy="62" r="12" fill="#f43f5e" stroke="#080c14" stroke-width="4"/><path d="M152,100 q16,10 0,20 q-16,10 0,20" stroke="#92400e" stroke-width="5" fill="none"/>'); } },
    { r: '-1deg', cap: 'Life blooms across the stars. Your story has only begun!', bub: 'Thank you!', art: null }
  ];
  function svgScene(c1, c2, inner) {
    let stars = ''; const r = U.rng(5);
    for (let i = 0; i < 40; i++) stars += '<circle cx="' + r.range(0, 320) + '" cy="' + r.range(0, 220) + '" r="' + r.range(0.6, 2) + '" fill="#fff" opacity="' + r.range(0.4, 1) + '"/>';
    return '<svg viewBox="0 0 320 220" preserveAspectRatio="xMidYMid slice"><defs><radialGradient id="g' + c1.slice(1) + '" cx="50%" cy="50%" r="75%"><stop offset="0" stop-color="' + c2 + '"/><stop offset="1" stop-color="' + c1 + '"/></radialGradient></defs><rect width="320" height="220" fill="url(#g' + c1.slice(1) + ')"/>' + stars + inner + '</svg>';
  }
  X.ending = function (S, onFinish) {
    const root = el('div', 'sp-end');
    SP.ui.layer('hud').appendChild(root);
    const grid = el('div', 'sp-comic'); root.appendChild(grid);
    const next = SP.ui.button('Next', { color: 'cyan', icon: '▶', onClick: advance });
    next.style.position = 'absolute'; next.style.bottom = '18px'; root.appendChild(next);
    let idx = 0, timer = null, dead = false;
    const campaign = SP.game.state;
    const panels = PANELS.map(function (p, i) {
      const d = el('div', 'sp-pnl'); d.style.setProperty('--r', p.r);
      if (p.art) {
        d.innerHTML = p.art();
        if (p.ship) {      // the player's own ship flies through the first panel
          const surl = X.shipPortrait(S.st.shipDesign, 'end');
          if (surl) { const fb = d.querySelector('.sp-fallback-ship'); if (fb) fb.remove(); d.insertAdjacentHTML('beforeend', '<img src="' + surl + '" style="position:absolute;left:18%;top:2%;width:64%;filter:drop-shadow(0 0 10px rgba(125,211,252,.8))">'); }
        }
      } else {
        const url = X.portrait(campaign.design, 'player');
        d.innerHTML = svgScene('#052e16', '#16a34a', '<circle cx="80" cy="190" r="70" fill="#4d7c0f" stroke="#080c14" stroke-width="5"/><circle cx="250" cy="200" r="60" fill="#0ea5e9" stroke="#080c14" stroke-width="5"/><circle cx="230" cy="40" r="16" fill="#f472b6" stroke="#080c14" stroke-width="4"/>') +
          (url ? '<img src="' + url + '" style="position:absolute;left:30%;top:6%;width:44%;filter:drop-shadow(0 0 8px #fff)">' : '');
      }
      d.appendChild(el('div', 'dots'));
      d.appendChild(el('div', 'cap stroke-none', p.cap)); if (p.bub) d.appendChild(el('div', 'bub', p.bub));
      grid.appendChild(d); return d;
    });
    SP.audio && SP.audio.sfx('win');
    function advance() {
      if (dead) return;
      clearTimeout(timer);
      if (idx < panels.length) { panels[idx].classList.add('on'); SP.audio && SP.audio.sfx('levelup'); idx++; if (idx >= panels.length) next.querySelector('.btn-label').textContent = 'Credits'; timer = setTimeout(advance, 4800); return; }
      credits();
    }
    function credits() {
      if (dead) return; dead = true; clearTimeout(timer);
      root.innerHTML = '';
      const cr = el('div', 'sp-credits'); root.appendChild(cr);
      const st = S.st, nCol = S.colonyList().length, nAll = Object.keys(st.rel).filter(function (k) { return st.rel[k].ally; }).length;
      const roll = el('div', 'roll',
        '<h1>PRIMORDIA WEB</h1><p>Cell · Creature · Tribe · Civilization · Space</p>' +
        '<h2>The ' + (campaign.speciesName || 'Wanderer') + ' saga</h2><p>You found the Staff of Life at the heart of the galaxy.</p>' +
        '<p>Colonies founded: <b>' + nCol + '</b> · Empires allied: <b>' + nAll + '</b> · Planets scanned: <b>' + st.stats.scans + '</b> · Jumps: <b>' + st.stats.jumps + '</b></p>' +
        '<h2>Stages</h2><p>🦠 Cell &nbsp; 🦎 Creature &nbsp; 🛖 Tribal &nbsp; 🏙️ Civilization &nbsp; 🚀 Space</p>' +
        '<h2>Built with</h2><p>Three.js · WebAudio · plain JavaScript · lots of toy-box primitives</p>' +
        '<h2>Special thanks</h2><p>Every player who ever named a creature something silly.</p>' +
        '<h2>Thanks for playing!</h2><p>The galaxy is yours. Keep exploring.</p>');
      cr.appendChild(roll);
      const btns = el('div', 'sp-endbtns');
      btns.appendChild(SP.ui.button('Keep exploring', { color: 'green', icon: '🌌', onClick: function () { root.remove(); onFinish && onFinish('free'); } }));
      btns.appendChild(SP.ui.button('Finish game', { color: 'amber', icon: '🏁', onClick: function () { root.remove(); onFinish && onFinish('finish'); } }));
      cr.appendChild(btns);
      setTimeout(function () { btns.classList.add('on'); }, 3000);
      SP.audio && SP.audio.sfx('win');
    }
    timer = setTimeout(advance, 600);
    return { close: function () { dead = true; clearTimeout(timer); root.remove(); } };
  };
})();
