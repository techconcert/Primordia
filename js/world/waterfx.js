// SP.waterFx -- visual feedback for the water system (DESIGN 3.6): splashes, pooled cel ripple rings, bubbles while the head
// is under, drowning gasps. Purely cosmetic; reads the fields SP.physics.step() writes on a body
// (waterState, submerged, drowning, _splash, _kick, speed, pos/up).
//   const fx = SP.waterFx.create(scene, particles, planet);  fx.update(dt, [body, ...], {sfx:true});  fx.dispose();
(function () {
  'use strict';
  const SP = window.SP = window.SP || {};
  const V3 = THREE.Vector3;
  const _p = new V3(), _q = new THREE.Quaternion(), _z = new V3(0, 0, 1);

  function create(scene, particles, planet) {
    const geo = new THREE.RingGeometry(0.82, 1, 28);
    const pool = [], live = [];
    function ring(pos, up, maxR, dur, op) {
      let r = pool.pop();
      if (!r) {
        if (live.length > 40) return;
        r = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xf0fdff, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }));
        r.renderOrder = 3; r.frustumCulled = false;
      }
      const sea = planet ? planet.seaRadius : pos.length();
      _p.copy(up).multiplyScalar(sea + 0.05);
      // keep the lateral position of the body, snap the radius to the sea
      r.position.copy(pos).addScaledVector(up, -pos.dot(up)).add(_p);
      r.quaternion.setFromUnitVectors(_z, up);
      r.userData = { t: 0, dur: dur, maxR: maxR, op: op === undefined ? 0.8 : op };
      r.scale.setScalar(0.01); r.material.opacity = r.userData.op; r.visible = true;
      scene.add(r); live.push(r);
    }
    function tick(dt) {
      for (let i = live.length - 1; i >= 0; i--) {
        const r = live[i], u = r.userData; u.t += dt; const k = u.t / u.dur;
        if (k >= 1) { scene.remove(r); r.visible = false; live.splice(i, 1); pool.push(r); continue; }
        const e = 1 - (1 - k) * (1 - k);
        r.scale.setScalar(0.25 + u.maxR * e); r.material.opacity = u.op * (1 - k) * (1 - k * 0.3);
      }
    }
    function bubbles(b, n, size) {
      if (!particles) return;
      const h = SP.physics.bodyH(b) * 0.8;
      _p.copy(b.pos).addScaledVector(b.up, h).addScaledVector(b.heading, b.radius * 0.5);
      particles.burst(_p.clone(), 0xcffafe, n, 0.18, { size: size || 0.14, life: 1.3, gravity: -2.6, flat: true, up: b.up });
    }
    const fx = {
      rings: live,
      ring: ring,
      splash(b, k) {
        k = k || 1;
        const sea = planet ? planet.seaRadius : b.pos.length();
        _p.copy(b.up).multiplyScalar(sea + 0.1).add(b.pos).addScaledVector(b.up, -b.pos.dot(b.up));
        if (particles) particles.burst(_p.clone(), 0xe0f7fa, Math.round(8 + 10 * k), 0.8 + 0.4 * k, { size: 0.2, life: 0.7, gravity: 11, up: b.up });
        ring(b.pos, b.up, b.radius * (1.6 + 1.2 * k), 1.1, 0.9);
        ring(b.pos, b.up, b.radius * (2.6 + 1.8 * k), 1.5, 0.55);
      },
      update(dt, bodies, o) {
        o = o || {};
        tick(dt);
        for (let i = 0; i < bodies.length; i++) {
          const b = bodies[i]; if (!b || !b.pos) continue;
          if (b._splash > 0) { fx.splash(b, b._splash); if (o.sfx !== false && SP.audio && SP.audio.sfx && b.id === 'player') SP.audio.sfx('splash', { vol: Math.min(1, 0.4 + 0.4 * b._splash) }); b._splash = 0; }
          if (b._kick > 0) { b._kick = 0; bubbles(b, 4, 0.16); ring(b.pos, b.up, b.radius * 1.4, 0.9, 0.5); }
          const st = b.waterState;
          if (!st || st === 'dry') { b._fxT = 0; continue; }
          b._fxT = (b._fxT || 0) + dt;
          const sp = Math.abs(b.speed || 0);
          // wake / idle ripples at the surface
          const per = (st === 'floating' || st === 'swimming') ? (sp > 0.8 ? 0.38 : 1.5) : (sp > 1 && b.wet < b.radius * 1.5 ? 0.45 : 99);
          if (b._fxT > per) { b._fxT = 0; ring(b.pos, b.up, b.radius * (sp > 0.8 ? 1.4 : 1.0), sp > 0.8 ? 0.9 : 1.6, sp > 0.8 ? 0.65 : 0.4); }
          // bubbles while the head is under (a flurry when drowning)
          if (b.submerged > 0.4) {
            b._bubT = (b._bubT || 0) - dt;
            if (b._bubT <= 0) { b._bubT = b.drowning ? 0.1 : 0.55 + Math.random() * 0.4; bubbles(b, b.drowning ? 3 : 1, b.drowning ? 0.2 : 0.13); }
          }
        }
      },
      dispose() { live.slice().forEach((r) => { scene.remove(r); r.material.dispose(); }); live.length = 0; pool.forEach((r) => r.material.dispose()); pool.length = 0; geo.dispose(); }
    };
    return fx;
  }
  SP.waterFx = { create };

  // ------------------------------------------------------------------ HUD: breath bar, state chip, shore arrow, drowning vignette
  const CSS = `
.wh-wrap{position:absolute;left:50%;bottom:208px;transform:translateX(-50%) scale(.9);display:flex;align-items:center;gap:10px;padding:6px 14px 8px;opacity:0;pointer-events:none;transition:opacity .25s,transform .25s;z-index:5;min-width:min(330px,86vw)}
.wh-wrap.on{opacity:1;transform:translateX(-50%) scale(1)}
.wh-main{flex:1;display:flex;flex-direction:column;gap:3px;min-width:0}
.wh-title{display:flex;justify-content:space-between;gap:10px;font-size:15px;font-weight:800;letter-spacing:.03em;text-transform:uppercase;color:#a5f3fc;white-space:nowrap}
.wh-title .hint{font-size:12px;color:#cbd5e1;text-transform:none;font-weight:700;letter-spacing:0}
.wh-main .bar{min-width:0;width:100%} .wh-main .bar-track{height:15px}
.wh-wrap.low .wh-title{color:#fda4af;animation:whPulse .5s ease-in-out infinite alternate}
.wh-wrap.low .bar-fill{--f:#f43f5e!important}
.wh-wrap.drown{border-color:#e11d48;animation:whShake .18s linear infinite}
@keyframes whPulse{to{transform:scale(1.06)}} @keyframes whShake{0%{margin-left:-2px}50%{margin-left:2px}100%{margin-left:-2px}}
.wh-arrow{display:none;flex-direction:column;align-items:center;font-size:11px;font-weight:800;color:#fde68a;width:50px}
.wh-arrow.on{display:flex}
.wh-arrow i{display:block;width:0;height:0;border-left:11px solid transparent;border-right:11px solid transparent;border-bottom:26px solid #fde047;filter:drop-shadow(0 0 0 var(--ink)) drop-shadow(2px 0 0 var(--ink)) drop-shadow(-2px 0 0 var(--ink)) drop-shadow(0 2px 0 var(--ink));transition:transform .12s}
.wh-vig{position:absolute;inset:0;pointer-events:none;opacity:0;transition:opacity .3s;background:radial-gradient(ellipse at center,rgba(8,47,73,0) 38%,rgba(8,47,73,.55) 78%,rgba(2,20,40,.9) 100%);z-index:4}
.wh-vig.drown{background:radial-gradient(ellipse at center,rgba(60,0,20,0) 30%,rgba(120,10,40,.5) 72%,rgba(40,0,10,.92) 100%);animation:whBeat .6s ease-in-out infinite alternate}
@keyframes whBeat{to{filter:brightness(1.6)}}
@media (max-width:720px){.wh-wrap{bottom:250px}}
`;
  const shown = {};
  const MSG = {
    sinker: ['Sinking!', 'Heavy bodies sink. Tap Space to kick upward, walk toward the shore.', '🫧'],
    swimmer: ['You can swim!', 'Hold Ctrl to dive, Space to surface. Air runs out when your head is under.', '🐟'],
    floater: ['You float!', 'Light bodies bob on the surface. Heavy ones sink and can drown.', '🛟']
  };
  function hud(root, opts) {
    opts = opts || {};
    const ui = SP.ui;
    if (!document.getElementById('wh-style')) { const st = document.createElement('style'); st.id = 'wh-style'; st.textContent = CSS; document.head.appendChild(st); }
    const wrap = ui.el('div', 'panel wh-wrap');
    const main = ui.el('div', 'wh-main');
    const title = ui.el('div', 'wh-title', '<span class="t">Breath</span><span class="hint"></span>');
    const bar = ui.bar({ icon: '🫧', color: 'sky', max: 20, value: 20 });
    main.appendChild(title); main.appendChild(bar.el);
    const arrow = ui.el('div', 'wh-arrow', '<i></i><span>Shore</span>');
    wrap.appendChild(main); wrap.appendChild(arrow);
    const vig = ui.el('div', 'wh-vig');
    root.appendChild(wrap); root.appendChild(vig);
    const tEl = title.querySelector('.t'), hEl = title.querySelector('.hint'), aI = arrow.querySelector('i'), aT = arrow.querySelector('span');
    const _v = new V3();
    let lastKey = '', hold = 0;
    const H = {
      wrap: wrap, vig: vig, bar: bar,
      // body: SP.physics body; ctx: {planet, fwd, right (camera tangent vectors), noToast}
      update(dt, body, ctx) {
        ctx = ctx || {};
        if (!body) return;
        const st = body.stats || {}, max = body.breathMax || st.breath || 20, cls = st.waterClass || 'floater';
        const wet = body.waterState && body.waterState !== 'dry' && body.waterState !== 'wading';
        const need = body.submerged > 0.02 || body.breath < max * 0.995;
        hold = need ? 1.2 : Math.max(0, hold - dt);
        const on = hold > 0 && max < 900 && !(ctx.hide);
        wrap.classList.toggle('on', on);
        const low = body.breath < max * 0.3 && body.breath < max;
        wrap.classList.toggle('low', low && !body.drowning);
        wrap.classList.toggle('drown', !!body.drowning);
        vig.classList.toggle('drown', !!body.drowning);
        const vk = body.drowning ? 1 : clampN(body.submerged * (1 - body.breath / max) * 1.2, 0, 1);
        vig.style.opacity = vk.toFixed(2);
        if (on) {
          bar.set(body.breath, max);
          const free = !body.onBottom && body.waterState !== 'floating';
          let t, h = '';
          if (body.drowning) { t = 'Drowning!'; h = cls === 'sinker' ? 'Kick up: tap Space!' : 'Surface: hold Space!'; }
          else if (body.submerged > 0.4 && low) { t = 'Out of air!'; h = cls === 'swimmer' ? 'Hold Space to surface' : 'Kick up: tap Space'; }
          else if (body.submerged > 0.4) { t = cls === 'swimmer' ? 'Diving' : (body.onBottom ? 'Under water' : 'Sinking!'); h = cls === 'swimmer' ? 'Space: surface' : 'Tap Space to kick up'; }
          else if (wet && cls === 'sinker' && free) { t = 'Sinking!'; h = 'Tap Space to kick up'; }
          else { t = 'Catching breath'; h = ''; }
          const k = t + h; if (k !== lastKey) { lastKey = k; tEl.textContent = t; hEl.textContent = h; }
        }
        // shore arrow for bodies that can't just float: while the head is under or they are sinking
        const showArrow = on && ctx.planet && ctx.fwd && (cls === 'sinker' || body.drowning) && wet && body.waterState !== 'floating';
        if (showArrow) {
          const sd = SP.physics.shoreDir(body, ctx.planet, _v);
          if (sd) {
            const ang = Math.atan2(sd.dot(ctx.right), sd.dot(ctx.fwd));
            aI.style.transform = 'rotate(' + ang.toFixed(3) + 'rad)'; aT.textContent = '~' + Math.round(body._shoreDist || 0) + ' m';
            arrow.classList.add('on');
          } else arrow.classList.remove('on');
        } else arrow.classList.remove('on');
        // one-time lessons
        if (!ctx.noToast && body.waterState && body.waterState !== 'dry') {
          const key = cls === 'sinker' ? (wet && body.waterState !== 'floating' ? 'sinker' : null) : (body.waterState === 'floating' || body.waterState === 'swimming' ? cls : null);
          if (key && !shown[key]) { shown[key] = true; const m = MSG[key]; ui.toast(m[0] + ' ' + m[1], m[2], 4500); }
        }
      },
      dispose() { wrap.remove(); vig.remove(); }
    };
    return H;
  }
  function clampN(v, a, b) { return v < a ? a : v > b ? b : v; }
  SP.waterHud = { create: hud, _shown: shown };
})();
