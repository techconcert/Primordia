/* SP.game — boot, title screen, stage registry, loop, pause/help, editors, campaign & autosave. */
(function () {
  'use strict';
  const SP = window.SP = window.SP || {};
  const U = SP.util, ui = SP.ui;
  const pendingStubs = (SP.game && SP.game._pending) || [];

  const ORDER = ['cell', 'creature', 'tribal', 'civ', 'space'];
  const STAGE_META = {
    intro:    { title: 'Meteor Intro',  icon: '☄️', next: 'cell',     mood: 'space',    tag: '' },
    cell:     { title: 'Cell Stage',    icon: '🦠', next: 'creature', mood: 'cell',     tag: 'Swim, eat, evolve!' },
    creature: { title: 'Creature Stage', icon: '🦎', next: 'tribal',  mood: 'creature', tag: 'Explore, befriend or fight' },
    tribal:   { title: 'Tribal Stage',  icon: '🛖', next: 'civ',      mood: 'tribal',   tag: 'Unite the tribes' },
    civ:      { title: 'Civilization Stage', icon: '🏙️', next: 'space', mood: 'civ',    tag: 'Build your nation' },
    space:    { title: 'Space Stage',   icon: '🚀', next: null,       mood: 'space',    tag: 'Reach the galactic core' }
  };
  const EDITOR_MODES = [
    { mode: 'cell', icon: '🦠', label: 'Cell', cur: 'DNA' }, { mode: 'creature', icon: '🦎', label: 'Creature', cur: 'DNA' },
    { mode: 'outfit', icon: '🎩', label: 'Outfit', cur: 'Food' }, { mode: 'building', icon: '🏠', label: 'Building', cur: 'Primordiabucks' },
    { mode: 'vehicle', icon: '🚗', label: 'Vehicle', cur: 'Primordiabucks' }, { mode: 'ship', icon: '🛸', label: 'Ship', cur: 'Primordiabucks' }
  ];

  const params = new URLSearchParams(location.search);
  const registry = {};
  let current = null, mode = 'boot';        // 'boot' | 'title' | 'stage'
  let paused = false, hold = 0, helpModal = null, editorOpen = false, pauseEl = null;
  let titleSt = null, last = 0, fpsAcc = 0, fpsN = 0, saveTimer = 0, debugOn = false, dtSmooth = 0;
  let errCount = {};

  const $ = (id) => document.getElementById(id);
  function guard(fn, label) { try { return fn(); } catch (e) { const k = label + e.message; if ((errCount[k] = (errCount[k] || 0) + 1) < 4) console.error('[' + label + ']', e); return undefined; } }

  // ---------------------------------------------------------------- campaign
  const SYL = ['bo', 'ra', 'mi', 'zu', 'ka', 'lo', 'ni', 'pe', 'tu', 'sa', 'vi', 'go', 'fe', 'dre', 'qua', 'lun'];
  function makeName(r, n) { let s = ''; for (let i = 0; i < n; i++) s += r.pick(SYL); return s.charAt(0).toUpperCase() + s.slice(1); }
  function randomDir(r) { const z = r.range(-1, 1), a = r.range(0, Math.PI * 2), s = Math.sqrt(1 - z * z); return [+(s * Math.cos(a)).toFixed(4), +z.toFixed(4), +(s * Math.sin(a)).toFixed(4)]; }
  function dotA(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function tryDesign(kind) { try { return SP.creature && SP.creature.defaultDesign ? SP.creature.defaultDesign(kind) : null; } catch (e) { console.error(e); return null; } }

  function newCampaign(seed) {
    if (seed === undefined || seed === null || isNaN(seed)) seed = Math.floor(Math.random() * 1e6);
    seed = Number(seed);
    const r = U.rng(seed);
    const d = tryDesign('creature');
    const cd = tryDesign('cell');
    // A-15: every run gets its own species name (the player can still rename it in an editor)
    const nm = makeName(r, 2);
    if (d) d.name = nm;
    if (cd) {
      cd.name = nm;
      // A-14: the starter cell gets two bead eyes (the default cell design has none)
      try {
        const C = SP.creature;
        if (cd.parts.every(function (p) { return p.id.indexOf('eye') < 0; }) && C.surfacePoint && SP.parts.get('cell_eye_bead')) {
          const sp = C.surfacePoint(cd, cd.spine.length - 1, [0.75, 0.2, 0.6]);
          cd.parts.push({ uid: C.uid(), id: 'cell_eye_bead', v: cd.spine.length - 1, o: sp.o.map(function (x) { return +x.toFixed(3); }), n: sp.n.map(function (x) { return +x.toFixed(3); }), s: 1.2, rot: 0, mirror: true });
        }
      } catch (e) { console.error(e); }
    }
    return {
      v: 1, seed: seed, created: Date.now(), stage: 'intro',
      speciesName: nm,
      design: d, cellDesign: cd, cards: {}, unlocked: unlockedDefaults(0, r), dna: 0, brainLevel: 1,
      planet: { seed: seed, name: makeName(r, 3), radius: 140 },
      eco: null, homeDir: null, rivalSites: [], tribe: null, civ: null, space: null,
      stats: { playTime: 0, kills: 0, allies: 0, extinctions: 0 }
    };
  }
  function unlockedDefaults(idx, r) {
    if (!SP.parts || !SP.parts.list) return [];
    return SP.parts.list.filter(function (p) { return p.unlockedByDefault || ((p.tier || 1) <= Math.min(4, idx + 1) && r.chance(0.55)); }).map(function (p) { return p.id; });
  }
  function defaultCampaignFor(stageId, seed) {
    const idx = Math.max(0, ORDER.indexOf(stageId));
    const c = newCampaign(seed);
    const r = U.rng(c.seed + 77);
    c.stage = stageId;
    if (idx >= 1) {
      c.cards.cell = r.pick(['herbivore', 'carnivore', 'omnivore']);
      c.unlocked = unlockedDefaults(idx, r);
      c.dna = [0, 150, 250, 300, 400][idx];
      c.homeDir = randomDir(r);
    }
    if (idx >= 2) {
      c.cards.creature = r.pick(['social', 'predator', 'adaptable']);
      c.brainLevel = 5;
      c.stats = { playTime: 1500, kills: r.int(2, 14), allies: r.int(1, 5), extinctions: r.int(0, 3) };
      const sites = [];
      let guard = 0;
      while (sites.length < 5 && guard++ < 400) { const d = randomDir(r); if (dotA(d, c.homeDir) < 0.85 && sites.every(function (s) { return dotA(s, d) < 0.8; })) sites.push(d); }
      c.rivalSites = sites;
    }
    if (idx >= 3) { c.cards.tribal = r.pick(['friendly', 'aggressive', 'industrious']); c.stats.playTime = 3000; }
    if (idx >= 4) { c.cards.civ = r.pick(['religious', 'economic', 'military']); c.stats.playTime = 4500; }
    return c;
  }

  // ---------------------------------------------------------------- stages
  function registerStage(s) { if (s && s.id) registry[s.id] = s; }
  function getStage(id) {
    const real = registry[id] || (SP.stages && SP.stages[id]);
    if (real && typeof real.enter === 'function') return real;
    return makePlaceholder(id);
  }

  function makePlaceholder(id, errMsg) {
    const meta = STAGE_META[id] || { title: id, icon: '🚧', next: null };
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x16203a);
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200); camera.position.set(0, 5, 17); camera.lookAt(0, 1, 0);
    SP.render.onResize(function (w, h) { camera.aspect = w / h; camera.updateProjectionMatrix(); });
    const L = SP.render.makeLights(scene, 'day'); L.sun.castShadow = false;
    const R = SP.render;
    const ground = R.cel(new THREE.CylinderGeometry(6, 6.4, 0.8, 24), 0x65a30d, { outline: 0.03 }); ground.position.y = -0.4; scene.add(ground);
    const cone = R.cel(new THREE.ConeGeometry(0.8, 1.6, 12), 0xf97316, { outline: 0.08 }); cone.position.set(-2.4, 0.8, 1); scene.add(cone);
    const stripe = R.cel(new THREE.TorusGeometry(0.55, 0.12, 8, 14), 0xffffff, { outline: 0.1 }); stripe.rotation.x = Math.PI / 2; stripe.position.y = 0.2; cone.add(stripe);
    const cube = R.cel(new THREE.BoxGeometry(1.5, 1.5, 1.5), 0xeab308, { outline: 0.06 }); scene.add(cube);
    const ball = R.cel(new THREE.SphereGeometry(0.8, 14, 10), 0x38bdf8, { outline: 0.07 }); scene.add(ball);
    const eyeG = new THREE.SphereGeometry(0.2, 10, 8), pupG = new THREE.SphereGeometry(0.1, 8, 6);
    [-0.28, 0.28].forEach(function (x) { const e = R.cel(eyeG, 0xffffff, { outline: 0.1 }); e.position.set(x, 0.2, 0.62); const p = R.cel(pupG, 0x080c14, { outline: 0 }); p.position.z = 0.14; e.add(p); ball.add(e); });
    let t = 0;
    const st = {
      id: id, title: meta.title, next: meta.next, scene: scene, camera: camera, placeholder: true,
      enter: function () {
        const p = ui.panel('construction');
        p.innerHTML = '<h2 class="stroke">🚧 Stage under construction</h2><p>' + meta.icon + ' <b>' + meta.title + '</b> is not ready yet. The team is still building it!' +
          (errMsg ? '<br><small style="color:#fda4af">' + errMsg + '</small>' : '') + '</p>';
        const row = ui.el('div', 'row-center');
        if (meta.next) row.appendChild(ui.button('Skip to next stage', { color: 'green', icon: '⏭', onClick: function () { G.goto(meta.next); } }));
        row.appendChild(ui.button('Title', { color: 'slate', icon: '🏠', onClick: function () { G.showTitle(); } }));
        p.appendChild(row);
        $('hud').appendChild(p);
        ui.help(['Nothing to do here yet. Come back soon!']);
      },
      update: function (dt) {
        t += dt;
        cube.position.set(0, 1.2 + Math.abs(Math.sin(t * 2.2)) * 1.1, -0.5); cube.rotation.y = t; cube.scale.set(1 + Math.max(0, -Math.sin(t * 2.2 + 1.2)) * 0.1, 1, 1);
        ball.position.set(2.4, 0.8 + Math.abs(Math.sin(t * 1.7)) * 0.9, 1); ball.scale.y = 1 + Math.sin(t * 3.4) * 0.08;
        cone.rotation.z = Math.sin(t * 2) * 0.12;
        camera.position.x = Math.sin(t * 0.3) * 1.5; camera.lookAt(0, 1, 0);
      },
      exit: function () { R.disposeTree(scene); }
    };
    return st;
  }

  function goto(id, opts) {
    opts = opts || {};
    if (!G.state) G.state = newCampaign(params.get('seed'));
    if (current) { const old = current; current = null; guard(function () { old.exit && old.exit(); }, 'exit'); }
    hideTitle(); closePause(); closeHelp();
    ui.clearHud(); ui.clearPopups(); ui.help([]);
    const ed = $('editor-ui'); if (!editorOpen) ed.innerHTML = '';
    hold = 0;
    const meta = STAGE_META[id] || {};
    flashFade();
    let st = getStage(id);
    G.state.stage = id;
    mode = 'stage';
    try { st.enter(G.state, opts); }
    catch (e) {
      console.error('Stage "' + id + '" failed to enter', e);
      ui.clearHud(); ui.toast('Stage failed to start: ' + e.message, '⚠️', 4000);
      st = makePlaceholder(id, 'Error: ' + e.message); st.enter(G.state, opts);
    }
    current = st; G.current = st;
    if (id !== 'intro' && !opts.noBanner && !st.noBanner && !(opts.fromIntro && !opts.skipped)) ui.banner(st.title || meta.title || id, meta.tag, 2600);
    if (SP.audio && id !== 'intro') SP.audio.music(meta.mood || null);
    if (id !== 'intro') autosave();
    refreshCorner();
    return st;
  }

  function completeStage(cardId, lines) {
    const st = current; if (!st) return;
    if (G.state) { G.state.cards = G.state.cards || {}; if (cardId) G.state.cards[st.id] = cardId; }
    autosave();
    hold++;
    ui.stageCard({
      stage: st.id, card: cardId, title: (st.title || st.id) + ' complete!', lines: lines || [],
      onContinue: function () {
        hold = Math.max(0, hold - 1);
        if (st.next) goto(st.next);
        else { ui.toast('Thanks for playing Primordia Web!', '🎉', 4000); showTitle(); }
      }
    });
  }

  // ---------------------------------------------------------------- editor
  function openEditor(opts) {
    return new Promise(function (resolve) {
      if (!SP.editor || typeof SP.editor.open !== 'function') { ui.toast('The editor is not ready yet', '🚧'); resolve(null); return; }
      if (editorOpen) { resolve(null); return; }
      editorOpen = true;
      $('hud').style.display = 'none';
      refreshCorner();                      // A-13: hide pause/mute over the editor
      if (current && current.pause) guard(function () { current.pause(); }, 'pause');
      if (SP.audio) SP.audio.music('editor');
      let p;
      try { p = SP.editor.open(opts || {}); } catch (e) { console.error(e); p = null; }
      Promise.resolve(p).catch(function (e) { console.error(e); return null; }).then(function (res) {
        editorOpen = false;
        $('hud').style.display = '';
        $('editor-ui').innerHTML = '';
        if (current && current.resume) guard(function () { current.resume(); }, 'resume');
        if (SP.audio) SP.audio.music(current ? (STAGE_META[current.id] || {}).mood || null : 'title');
        refreshCorner();
        resolve(res || null);
      });
    });
  }
  function sandbox(modeId) {
    const m = EDITOR_MODES.filter(function (x) { return x.mode === modeId; })[0] || { cur: 'DNA' };
    let design = null;
    if (modeId === 'cell' || modeId === 'creature' || modeId === 'outfit') design = tryDesign(modeId === 'cell' ? 'cell' : 'creature');
    else if (SP.assembly && SP.assembly.defaultDesign) { try { design = SP.assembly.defaultDesign(modeId, modeId === 'vehicle' ? 'land' : modeId === 'building' ? 'cityhall' : undefined); } catch (e) { console.error(e); } }
    hideTitle();
    mode = 'title-editor';
    openEditor({ mode: modeId, design: design, budget: null, currency: m.cur, unlocked: 'all', title: m.label + ' sandbox', allowCancel: true,
      vehicleType: modeId === 'vehicle' ? 'land' : undefined, buildingType: modeId === 'building' ? 'cityhall' : undefined }).then(function () { if (!current) showTitle(); });
  }

  // ---------------------------------------------------------------- save
  function autosave() {
    const s = G.state;
    if (!s || s.stage === 'intro' || !SP.save) return;
    if (current && typeof current.serialize === 'function') {
      const blob = guard(function () { return current.serialize(); }, 'serialize');
      if (blob !== undefined) s[current.id] = blob;
    }
    SP.save.save(s);
  }

  // ---------------------------------------------------------------- title screen
  function buildTitleScene() {
    const R = SP.render, scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0d121d);
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 400);
    SP.render.onResize(function (w, h) { camera.aspect = w / h; camera.updateProjectionMatrix(); });
    const L = R.makeLights(scene, 'day'); L.sun.castShadow = false; L.sun.position.set(-16, 12, 10);
    // stars
    const sp = new Float32Array(900 * 3), r = U.rng(5);
    for (let i = 0; i < 900; i++) { const v = new THREE.Vector3(r.range(-1, 1), r.range(-1, 1), r.range(-1, 1)).normalize().multiplyScalar(r.range(60, 140)); sp[i * 3] = v.x; sp[i * 3 + 1] = v.y; sp[i * 3 + 2] = v.z; }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.7, sizeAttenuation: true, transparent: true, opacity: 0.85 }));
    scene.add(stars);
    // planet: faceted low poly with vertex colours
    const planet = makePlanetMesh(7.5, 11);
    const pivot = new THREE.Group(); pivot.position.set(0, -8.4, 0); pivot.add(planet); scene.add(pivot);
    // floating toy primitives
    const bits = [];
    const defs = [
      [new THREE.DodecahedronGeometry(0.7), 0x22c55e], [new THREE.TorusGeometry(0.55, 0.2, 8, 14), 0xf43f5e], [new THREE.ConeGeometry(0.6, 1.2, 8), 0xeab308],
      [new THREE.BoxGeometry(0.9, 0.9, 0.9), 0xa855f7], [new THREE.SphereGeometry(0.55, 12, 10), 0x06b6d4], [new THREE.CylinderGeometry(0.35, 0.35, 1.1, 8), 0xf97316]
    ];
    defs.forEach(function (d, i) {
      const m = R.cel(d[0], d[1], { outline: 0.08, cast: false, receive: false });
      const a = i / defs.length * Math.PI * 2, rad = 9.5 + (i % 2) * 2.2;
      bits.push({ m: m, a: a, rad: rad, y: (i % 3 - 1) * 2.2 + 0.5, sp: 0.12 + 0.03 * i, ph: i * 1.3 });
      scene.add(m);
    });
    // hero blob
    const blob = new THREE.Group();
    const body = R.cel(new THREE.SphereGeometry(1, 16, 12), 0x84cc16, { outline: 0.06, cast: false }); blob.add(body);
    const eg = new THREE.SphereGeometry(0.28, 10, 8), pg = new THREE.SphereGeometry(0.14, 8, 6);
    [-0.36, 0.36].forEach(function (x) { const e = R.cel(eg, 0xffffff, { outline: 0.1, cast: false }); e.position.set(x, 0.35, 0.82); const p = R.cel(pg, 0x080c14, { outline: 0, cast: false }); p.position.z = 0.17; e.add(p); blob.add(e); });
    const mouth = R.cel(new THREE.TorusGeometry(0.22, 0.06, 6, 10, Math.PI), 0x881337, { outline: 0.15, cast: false }); mouth.rotation.z = Math.PI; mouth.position.set(0, -0.08, 0.96); blob.add(mouth);
    blob.position.set(-7.0, -4.3, 3); scene.add(blob);
    return {
      scene: scene, camera: camera, t: 0,
      update: function (dt) {
        this.t += dt; const t = this.t;
        planet.rotation.y += dt * 0.06; planet.rotation.x = 0.25;
        stars.rotation.y += dt * 0.005;
        bits.forEach(function (b) {
          const a = b.a + t * b.sp;
          b.m.position.set(Math.cos(a) * b.rad, b.y + 1.5 + Math.sin(t * 1.3 + b.ph) * 0.4, Math.sin(a) * b.rad * 0.7 - 4);
          b.m.rotation.x += dt * 0.7; b.m.rotation.y += dt * 0.9;
        });
        const k = Math.abs(Math.sin(t * 2.4));
        blob.position.y = -4.3 + k * 1.2; blob.scale.set(1 + (1 - k) * 0.12, 1 - (1 - k) * 0.14, 1 + (1 - k) * 0.12);
        blob.rotation.y = Math.sin(t * 0.8) * 0.4 + 0.3;
        camera.position.set(Math.sin(t * 0.15) * 1.2, 1.2 + Math.sin(t * 0.2) * 0.4, 17); camera.lookAt(0, -0.5, 0);
      }
    };
  }
  function makePlanetMesh(radius, seed) {
    const R = SP.render;
    let geo = new THREE.IcosahedronGeometry(radius, 7);
    if (geo.index) geo = geo.toNonIndexed();
    const pos = geo.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color();
    U.setNoiseSeed(seed);
    const tri = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()], cen = new THREE.Vector3(), tmp = new THREE.Vector3();
    const lift = {};
    function vlift(v) {
      const k = v.x.toFixed(2) + ',' + v.y.toFixed(2) + ',' + v.z.toFixed(2);
      if (lift[k] === undefined) { tmp.copy(v).normalize(); const h = U.fbm3(tmp.x * 1.6, tmp.y * 1.6, tmp.z * 1.6, 3); lift[k] = h < 0.1 ? 0 : h < 0.16 ? 0.025 : h < 0.4 ? 0.05 : h < 0.55 ? 0.08 : 0.12; }
      return lift[k];
    }
    for (let f = 0; f < pos.count; f += 3) {
      cen.set(0, 0, 0);
      for (let k = 0; k < 3; k++) { tri[k].fromBufferAttribute(pos, f + k); cen.add(tri[k]); }
      cen.normalize();
      const h = U.fbm3(cen.x * 1.6, cen.y * 1.6, cen.z * 1.6, 3);
      const hex = h < 0.02 ? 0x0e7490 : h < 0.1 ? 0x22d3ee : h < 0.16 ? 0xfcd34d : h < 0.4 ? 0x65a30d : h < 0.55 ? 0x4d7c0f : 0xe2e8f0;
      c.setHex(hex);
      for (let k = 0; k < 3; k++) {
        const l = vlift(tri[k]);
        tri[k].normalize().multiplyScalar(radius * (1 + l)); pos.setXYZ(f + k, tri[k].x, tri[k].y, tri[k].z);
        col[(f + k) * 3] = c.r; col[(f + k) * 3 + 1] = c.g; col[(f + k) * 3 + 2] = c.b;
      }
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const mesh = R.cel(geo, 0xffffff, { outline: 0.025, vertexColors: true, flatShading: true, cast: false, receive: false });
    // soft atmosphere rim
    const atmo = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.08, 24, 16), new THREE.MeshBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.18, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    mesh.add(atmo);
    return mesh;
  }

  function showTitle() {
    if (current) { const old = current; current = null; G.current = null; guard(function () { old.exit && old.exit(); }, 'exit'); }
    closePause(); closeHelp(); ui.clearHud(); ui.clearPopups(); ui.help([]); hold = 0;
    if (!editorOpen) $('editor-ui').innerHTML = '';
    mode = 'title';
    if (!titleSt) titleSt = guard(buildTitleScene, 'titleScene');
    const T = $('title'); T.innerHTML = '';
    const logo = ui.el('div', 'logo', '<div class="logo-main">PRIMORDIA<span> WEB</span></div><div class="logo-sub">Cell · Creature · Tribe · Civ · Space</div>');
    const menu = ui.el('div', 'title-menu');
    menu.appendChild(ui.button('New Game', { color: 'green', icon: '🌱', onClick: function () { newGame(); } }));
    if (SP.save && SP.save.has()) menu.appendChild(ui.button('Continue', { color: 'cyan', icon: '▶️', onClick: continueGame }));
    menu.appendChild(ui.button('Stage Select', { color: 'purple', icon: '🗺️', onClick: stageSelect }));
    const corner = ui.el('div', 'title-corner'); corner.appendChild(muteButton());
    T.appendChild(logo); T.appendChild(menu); T.appendChild(corner);
    T.appendChild(ui.el('div', 'title-foot', 'Click to begin · Esc pause · H help'));
    T.classList.add('on');
    flashFade();
    if (SP.audio) SP.audio.music('title');
    refreshCorner();
  }
  function hideTitle() { $('title').classList.remove('on'); }

  function muteButton() {
    const b = ui.button('', { color: 'slate', icon: SP.audio && SP.audio.muted ? '🔇' : '🔊', title: 'Mute / unmute', small: true, onClick: function () {
      SP.audio.setMuted(!SP.audio.muted); b.querySelector('.btn-icon').textContent = SP.audio.muted ? '🔇' : '🔊'; SP.audio.init();
    } });
    return b;
  }

  function newGame() {
    SP.audio && SP.audio.init();
    G.state = newCampaign(params.get('seed'));
    if (params.get('skipintro')) goto('cell'); else goto('intro');
  }
  function continueGame() {
    SP.audio && SP.audio.init();
    const s = SP.save.load();
    if (!s) { ui.toast('No save found', '🤷'); return; }
    G.state = s;
    goto(s.stage && s.stage !== 'intro' ? s.stage : 'cell', { resume: true, noBanner: false });
  }
  function startStage(id) {
    SP.audio && SP.audio.init();
    G.state = id === 'intro' ? newCampaign(params.get('seed')) : defaultCampaignFor(id, params.get('seed'));
    { const tc = params.get('tribal'); if (tc && /^(friendly|aggressive|industrious)$/.test(tc) && G.state.cards) G.state.cards.tribal = tc; }   // debug/test: force the tribal card (=> civ type) when starting at a stage
    goto(id);
  }
  function stageSelect() {
    SP.audio && SP.audio.init();
    const body = ui.el('div');
    body.appendChild(ui.el('div', 'sel-h', 'Stages'));
    const g = ui.el('div', 'stage-grid');
    let m;
    const btns = [['intro', '☄️', 'Intro']].concat(ORDER.map(function (id) { return [id, STAGE_META[id].icon, STAGE_META[id].title.replace(' Stage', '')]; }));
    btns.forEach(function (b) {
      g.appendChild(ui.button(b[2], { icon: b[1], color: b[0] === 'intro' ? 'indigo' : 'cyan', onClick: function () { m.close(); startStage(b[0]); } }));
    });
    body.appendChild(g);
    body.appendChild(ui.el('div', 'sel-h', 'Editor sandbox'));
    const g2 = ui.el('div', 'stage-grid');
    EDITOR_MODES.forEach(function (e) { g2.appendChild(ui.button(e.label, { icon: e.icon, color: 'amber', onClick: function () { m.close(); sandbox(e.mode); } })); });
    body.appendChild(g2);
    m = ui.modal({ title: '🗺️ Stage Select', body: body, className: 'modal-wide' });
  }

  // ---------------------------------------------------------------- pause / help
  function openPause() {
    if (mode !== 'stage' || !current || current.id === 'intro' || paused || editorOpen) return;
    paused = true; SP.audio && SP.audio.sfx('click');
    const root = $('pause'); root.innerHTML = '';
    const back = ui.el('div', 'pause-back'), box = ui.panel('pause-box pop-in');
    box.appendChild(ui.el('h2', 'stroke', '⏸ Paused'));
    box.appendChild(ui.button('Resume', { color: 'green', icon: '▶️', onClick: closePause }));
    box.appendChild(ui.button('Help (H)', { color: 'cyan', icon: '❓', onClick: function () { showHelp(); } }));
    box.appendChild(ui.button('Save', { color: 'indigo', icon: '💾', onClick: function () { autosave(); ui.toast('Game saved', '💾'); } }));
    const mb = ui.button(SP.audio.muted ? 'Sound: off' : 'Sound: on', { color: 'slate', icon: SP.audio.muted ? '🔇' : '🔊', onClick: function () {
      SP.audio.setMuted(!SP.audio.muted); SP.audio.init(); mb.querySelector('.btn-label').textContent = SP.audio.muted ? 'Sound: off' : 'Sound: on'; mb.querySelector('.btn-icon').textContent = SP.audio.muted ? '🔇' : '🔊';
    } });
    box.appendChild(mb);
    box.appendChild(ui.button('Quit to title', { color: 'rose', icon: '🏠', onClick: function () { autosave(); showTitle(); } }));
    back.appendChild(box); root.appendChild(back); pauseEl = back;
    refreshCorner();
  }
  function closePause() { if (pauseEl) { pauseEl.remove(); pauseEl = null; } $('pause').innerHTML = ''; if (paused) { paused = false; SP.audio && SP.audio.sfx('click'); } refreshCorner(); }
  function showHelp() { if (helpModal) return; helpModal = ui.showHelp(function () { helpModal = null; }); }
  function closeHelp() { if (helpModal) { const h = helpModal; helpModal = null; h.close(); } }

  function onKey(e) {
    if (e.repeat) return;
    const t = e.target, typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA');
    if (e.code === 'F2') { debugOn = !debugOn; $('debug').style.display = debugOn ? 'block' : 'none'; e.preventDefault(); return; }
    if (typing) return;
    if (e.code === 'Escape') {
      if (e.spHandled) return;
      if (ui.modalCount() > 0) return;
      if (paused) closePause(); else openPause();
    } else if (e.code === 'KeyH' && !editorOpen && mode === 'stage' && current && current.id !== 'intro') {
      if (ui.modalCount() > 0 && !helpModal) return;
      if (helpModal) closeHelp(); else showHelp();
    }
  }

  function refreshCorner() {
    const c = $('corner'); c.innerHTML = '';
    if (mode !== 'stage' || !current || current.id === 'intro' || editorOpen) return;
    c.style.pointerEvents = 'none';
    const p = ui.button('', { icon: '⏸', color: 'slate', small: true, title: 'Pause (Esc)', onClick: function () { if (paused) closePause(); else openPause(); } });
    c.appendChild(p); c.appendChild(muteButton());
    c.style.display = 'flex';
  }

  function flashFade() { const f = $('fade'); f.classList.add('on'); void f.offsetWidth; requestAnimationFrame(function () { f.classList.remove('on'); }); }

  // ---------------------------------------------------------------- loop
  function frame(now) {
    requestAnimationFrame(frame);
    if (!last) last = now;
    const raw = Math.max(0, (now - last) / 1000); last = now;
    const dt = Math.min(0.05, raw);
    fpsAcc += raw; fpsN++;
    if (fpsAcc >= 0.5) { G.fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; if (debugOn) updateDebug(); }
    G.dt = dt;
    let scene = null, camera = null;
    if (editorOpen && SP.editor) {
      guard(function () { SP.editor.update && SP.editor.update(dt); }, 'editor.update');
      scene = SP.editor.scene; camera = SP.editor.camera;
    } else if (mode === 'stage' && current) {
      const st = current;
      if (!paused && hold === 0 && !helpModal) {
        G.time += dt;
        guard(function () { st.update && st.update(dt, G.time); }, 'update:' + st.id);
        saveTimer += raw;
        if (saveTimer > 60) { saveTimer = 0; if (G.state) G.state.stats.playTime += 60; autosave(); }
      }
      if (current) { scene = current.scene; camera = current.camera; }
    } else if (mode === 'title' && titleSt) {
      titleSt.update(dt); scene = titleSt.scene; camera = titleSt.camera;
    }
    if (scene && camera) guard(function () { SP.render.render(scene, camera); }, 'render');
    SP.input.endFrame();
  }
  function updateDebug() {
    const i = SP.render.renderer ? SP.render.renderer.info : null;
    $('debug').textContent = 'fps ' + G.fps + '\ncalls ' + (i ? i.render.calls : '?') + '\ntris ' + (i ? i.render.triangles : '?') + '\ngeoms ' + (i ? i.memory.geometries : '?') + '\nstage ' + (current ? current.id : mode);
  }

  // ---------------------------------------------------------------- boot
  const G = {
    state: null, current: null, time: 0, dt: 0, fps: 0, params: params,
    fast: !!params.get('fast'), speedMul: params.get('fast') ? 5 : 1,
    stageMeta: STAGE_META, stageOrder: ORDER,
    registerStage: registerStage, goto: goto, openEditor: openEditor, completeStage: completeStage,
    newCampaign: newCampaign, defaultCampaignFor: defaultCampaignFor, showTitle: showTitle, autosave: autosave,
    pause: openPause, resume: closePause, showHelp: showHelp,
    get editorOpen() { return editorOpen; }
  };
  Object.defineProperty(G, 'paused', { get: function () { return paused || hold > 0 || !!helpModal; }, enumerable: true });
  SP.game = G;
  pendingStubs.forEach(registerStage);

  function boot() {
    try { SP.render.init($('canvas-container')); }
    catch (e) {
      console.error(e);
      document.body.appendChild(ui.el('div', 'panel construction', '<h2>WebGL unavailable</h2><p>Primordia Web needs WebGL. Try another browser or enable hardware acceleration.</p>'));
      return;
    }
    SP.input.on('keydown', onKey);
    window.addEventListener('beforeunload', function () { if (mode === 'stage') autosave(); });
    document.addEventListener('visibilitychange', function () { if (document.hidden && mode === 'stage') autosave(); });
    // sfx on stray clicks outside buttons is handled by ui.button
    requestAnimationFrame(frame);

    const ed = params.get('editor'), st = params.get('stage');
    if (ed) { mode = 'title-editor'; sandbox(ed); }
    else if (st) startStage(st);
    else showTitle();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
