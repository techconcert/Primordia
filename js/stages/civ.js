/* SP.stages.civ — Civilization stage (DESIGN §8). World, nations, HUD, input, economy, win flow.
 * Helpers: civ_util.js (maths/merging), civ_city.js (cities), civ_units.js (vehicles), civ_ai.js (rivals + diplomacy), civ_ui.js (panels). */
(function () {
  'use strict';
  const SP = window.SP = window.SP || {};
  SP.stages = SP.stages || {};
  const V3 = THREE.Vector3;
  SP.civ = SP.civ || {};
  const U_ = SP.util, C = SP.civ, R = SP.render;
  const TYPE_FROM_TRIBAL = { aggressive: 'military', industrious: 'economic', friendly: 'religious' };
  const ABILITY = {
    friendly: { icon: '🎁', name: 'Gift Rain', cd: 90, desc: 'Showers every nation with gifts: relations +14, and they tip you 300 💰.' },
    aggressive: { icon: '📣', name: 'War Cry', cd: 75, desc: 'Your vehicles fight 60% harder and move 30% faster for 12 s.' },
    industrious: { icon: '🌾', name: 'Bountiful Harvest', cd: 90, desc: 'Instantly finishes production, calms riots and pays 2 minutes of income.' }
  };

  const S = SP.stages.civ = {
    id: 'civ', title: 'Civilization Stage', next: 'space', scene: null, camera: null, w: null,

    // ============================================================================ enter
    enter: function (campaign, opts) {
      opts = opts || {};
      const self = this;
      const W = this.w = { camp: campaign, t: 0, prog: 0, FM: (SP.game && SP.game.speedMul) || 1, nextId: 1, lodT: 0, vehicles: [], cities: [], geysers: [], nations: [], nationById: {}, turrets: [], sel: [],
        relMap: {}, lastFight: {}, captures: { military: 0, economic: 0, religious: 0 }, camDir: new V3(0, 1, 0), camDist: 100, horizonCos: 0.5, rng: null, ended: false, listeners: [], timers: {} };
      const camp = campaign;
      const saved = opts.resume && camp.civ && camp.civ.world ? camp.civ.world : null;
      W.rng = U_.rng((camp.seed || 1) * 31 + 4242);
      // B-01: snapshot of the campaign state at stage entry (player-designed kits only; the world itself is deterministic from the seed)
      W.entry = saved && camp.civ.entry ? camp.civ.entry : { designs: camp.civ && camp.civ.designs ? JSON.parse(JSON.stringify(camp.civ.designs)) : null };
      const scene = this.scene = new THREE.Scene();
      W.scene = scene;
      // ---- planet + sky
      const pr = (camp.planet && camp.planet.radius) || 140;
      const planet = W.planet = SP.planet.create({ seed: (camp.planet && camp.planet.seed) || camp.seed, radius: pr, detail: 6, propDensity: 0.18 });
      scene.add(planet.group); W.R = planet.radius;
      const sky = W.sky = SP.sky.create(scene, planet, { dayLength: 420, fog: false, clouds: false, startTime: 0.38 });
      sky.lights.sun.castShadow = false; scene.fog = null;
      W.initSky = true;
      // ---- camera
      const cam = W.cam = new SP.cam.RTS({ distance: 58, min: 22, max: 540, radius: planet.radius, fov: 45 });
      this.camera = W.camera = cam.camera;
      cam.camera.near = 2; cam.camera.far = 5000; cam.camera.updateProjectionMatrix();
      // ---- fx
      W.fx = R.particles(scene, 1600);
      // ---- terrain helpers
      W.passable = function (role, dir) {
        if (role === 'air') return true;
        const r = planet.surfaceRadius(dir);
        return role === 'sea' ? r <= planet.seaRadius - 0.4 : r >= planet.seaRadius + 0.12;
      };
      const cosPod = Math.cos((SP.civCity.POD_R + 0.5) / W.R);
      W.heightAt = function (dir) {
        for (let i = 0; i < W.cities.length; i++) if (W.cities[i].dir.dot(dir) > cosPod) return W.cities[i].topR;
        return planet.surfaceRadius(dir);
      };
      buildComponents(W);
      W.getRel = function (a, b) { if (a === b) return 100; const k = a < b ? a + '|' + b : b + '|' + a; const v = W.relMap[k]; return v === undefined ? 0 : v; };
      W.setRel = function (a, b, v) { if (a === b) return; const k = a < b ? a + '|' + b : b + '|' + a; W.relMap[k] = Math.max(-100, Math.min(100, v)); W.lastFight[a + b] = W.lastFight[b + a] = W.t; };
      W.toast = function (t, i, ms) { SP.ui.toast(t, i, ms); };
      W.captureCity = function (city, nation, method, price, noCard) { captureCity(W, city, nation, method, price, noCard); };
      W.claimGeyser = function (g, nation) { claimGeyser(W, g, nation); };
      W.addCity = function (nation, dir, name, roles, o) { return addCity(W, nation, dir, name, roles, o); };
      W.onSelChange = function () { if (self.ui) self.ui.selChanged(); };

      SP.civCity.init(W); SP.civUnits.init(W);
      if (saved) restoreWorld(W, saved); else createWorld(W);
      W.player = W.nationById.you;
      fortifyCapital(W);
      clearFloraNearCities(W);

      // ---- camera start
      const capital = W.cities.filter(function (c) { return c.nation === 'you'; })[0] || W.cities[0];
      cam.focusDir.copy(capital.dir); cam.rot = 0;
      cam.distance = 52; sky.setLocalTime(0.46, planet.surfacePoint(capital.dir));
      // ---- UI
      this.ui = SP.civUI.create(W, this);
      this.bindInput();
      W.detachTouch = SP.rtsTouch ? SP.rtsTouch.attach(cam) : null;      // B-07: one-finger pan, pinch zoom
      SP.ui.help([
        '<b>Goal:</b> own every city on the planet, then build your first spaceship.',
        '<b>Camera:</b> WASD / screen edges pan, wheel zooms (zoom out to see the whole planet), <kbd class="kbd">Z</kbd>/<kbd class="kbd">C</kbd> rotate.',
        '<b>Units:</b> click or drag-box to select vehicles. Right-click: move, attack, claim spice, trade or convert a city.',
        '<b>Cities:</b> click a city to build houses 🏠, factories 🏭 and entertainment 🎪. Factories next to houses +50% 💰, entertainment next to houses +50% 😀. Unhappy cities riot (no income).',
        '<b>Spice ✨:</b> send a land or sea vehicle to a magenta geyser to build a derrick: +100 💰/min each.',
        '<b>Capture:</b> ⚔️ military: destroy turrets, then the city hall. 💰 economic: trade vehicles fill the gold ring, then buy the city. 🔮 religious: holograms fill the magenta ring.',
        '<b>Design:</b> use the toolbar to open the building and vehicle editors. Hotkeys: <kbd class="kbd">1</kbd> <kbd class="kbd">2</kbd> <kbd class="kbd">3</kbd> build land/sea/air, <kbd class="kbd">Q</kbd> ability, <kbd class="kbd">Tab</kbd> next city, <kbd class="kbd">Space</kbd> recentre.',
        '<b>Diplomacy:</b> click a nation in the top-right list: gift, compliment, insult, demand.'
      ]);
      if (SP.audio) SP.audio.music('civ');
      this.hintT = 0;
      if (!saved) setTimeout(function () { if (self.w === W) SP.ui.toast(SP.input.mouse.touch ? 'Tap a vehicle to select it, then tap the ground, a geyser or a city to give an order. Drag to pan, pinch to zoom.' : 'Right-click the ground to move, a geyser to claim spice, a city to attack / trade / convert.', '💡', 6000); }, 3200);
      W.minimapT = 0; W.hudT = 0; W.econT = 0; W.lightT = 0;
      window.__civ = this;     // test hook
    },

    // ============================================================================ input
    bindInput: function () {
      const W = this.w, self = this, I = SP.input;
      W.drag = null;
      // B-15: edge-pan only after a real mouse move, and never while the pointer is over the HUD
      W.mouseMoved = false;
      W.listeners.push(I.on('mousemove', function (e) { if (e.pointerType === 'mouse' && (e.movementX || e.movementY)) W.mouseMoved = true; }));
      W.listeners.push(I.on('mousedown', function (e) {
        if (e.button !== 0) return;
        if (e.pointerType === 'touch') { W.drag = null; return; }       // touch drags pan the camera instead
        const t = e.target, onUI = !!t && t.tagName !== 'CANVAS' && t.id !== 'canvas-container' && t.tagName !== 'BODY';
        W.drag = onUI ? null : { x: e.clientX, y: e.clientY };
      }));
      W.listeners.push(I.on('mouseup', function (e) {
        if (e.button !== 0 || !W.drag) return;
        const d = W.drag; W.drag = null;
        if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) self.ui.boxSelect(d.x, d.y, e.clientX, e.clientY, e.shiftKey);
      }));
      W.listeners.push(I.on('keydown', function (e) {
        if (W.ended || (SP.game && SP.game.paused)) return;
        if (e.repeat) return;
        const k = e.code;
        if (k === 'Digit1' || k === 'Digit2' || k === 'Digit3') self.ui.hotkeyProduce(['land', 'sea', 'air'][+k.slice(5) - 1]);
        else if (k === 'KeyQ') self.ui.useAbility();
        else if (k === 'Tab') { e.preventDefault(); self.ui.cycleCity(); }
        else if (k === 'Space') self.ui.recentre();
        else if (k === 'KeyX') self.ui.stopSel();
      }));
    },

    // ============================================================================ update
    update: function (dt, t) {
      const W = this.w; if (!W || W.ended && W.frozen) return;
      const I = SP.input, cam = W.cam;
      W.t += dt; W.prog = W.t * W.FM;
      // camera (Q/E are free for abilities; rotate with Z/C)
      const od = I.isDown;
      I.isDown = function (c) { return c === 'KeyQ' || c === 'KeyE' ? false : od(c); };
      try {
        cam.edgePan = !!W.mouseMoved && !I.mouse.touch && !I.pointerOverUI();
        cam.panSpeed = Math.max(0.16, Math.min(1, 62 / cam.distance));
        if (od('KeyZ')) cam.rot += 1.6 * dt; if (od('KeyC')) cam.rot -= 1.6 * dt;
        cam.update(dt);
      } finally { I.isDown = od; }
      const cp = W.camera.position;
      W.camDist = cp.length(); W.camDir.copy(cp).divideScalar(W.camDist);
      W.horizonCos = Math.min(0.995, (W.R - 1) / W.camDist);
      // sky / planet
      const alt = U_.smoothstep ? U_.smoothstep(140, 420, cam.distance) : 0;
      W.sky.setAltitude && W.sky.setAltitude(alt);
      W.sky.update(dt, cam.focusPos);
      W.sky.dome.position.copy(cp);
      W.planet.update(dt, W.t, cam.focusPos);
      // economy tick
      this.econ(dt);
      // simulation
      SP.civUnits.update(W, dt);
      SP.civUnits.cityDecay(W, dt);
      SP.civAI.update(W, dt);
      for (let i = 0; i < W.cities.length; i++) {
        const c = W.cities[i];
        SP.civCity.update(W, c, dt, 0, c.pos.distanceTo(cp) < 120);
      }
      this.updateGeysers(dt);
      W.fx.update(dt);
      W.lightT -= dt; if (W.lightT <= 0) { W.lightT = 0.2; SP.civCity.updateLights(W, W.t); const sz = Math.max(9, Math.min(34, 2300 / Math.max(60, W.camDist * 0.9))); W.L.mat.size = sz; }
      // input & ui
      this.ui.update(dt);
      if (!W.ended) this.checkWin();
      if (SP.audio && Math.floor(W.t) % 30 === 0 && Math.floor(W.t) !== W.lastAmbient) { W.lastAmbient = Math.floor(W.t); }
    },

    // ============================================================================ economy
    econ: function (dt) {
      const W = this.w;
      W.econT -= dt;
      const pl = W.player;
      if (W.econT <= 0) {
        W.econT = 0.8;
        W.cities.forEach(function (c) {
          SP.civCity.compute(W, c);
          const wasRiot = c.riot;
          if (!c.riot && c.happy < 20) c.riot = true; else if (c.riot && c.happy >= 35) c.riot = false;
          if (c.riot && !wasRiot && c.nation === 'you') { W.toast('Riot in ' + c.name + '! Build entertainment 🎪', '🔥', 3500); if (SP.audio) SP.audio.sfx('alarm'); }
          c.income = c.riot ? 0 : c.baseIncome * (c.happy < 50 ? 0.5 + c.happy / 100 : 1) * W.FM;
          if (c.riot) W.fx.burst(c.pos.clone().addScaledVector(c.dir, 2.5), Math.random() < 0.5 ? 0xf97316 : 0xf43f5e, 5, 1.0, { up: c.dir, size: 0.35, life: 1.0 });
        });
        let inc = 0; W.cities.forEach(function (c) { if (c.nation === 'you') inc += c.income; });
        let sp = 0; W.geysers.forEach(function (g) { if (g.owner === 'you') sp += 100 * W.FM; });
        pl.cityIncome = inc; pl.spiceIncome = sp; pl.income = inc + sp;
      }
      pl.money += (pl.income || 0) / 60 * dt;
    },

    // ============================================================================ geysers
    updateGeysers: function (dt) {
      const W = this.w, cp = W.camera.position;
      W.geysers.forEach(function (g) {
        g.t += dt;
        const near = g.pos.distanceTo(cp) < 150;
        if (near && Math.random() < dt * 9) {
          W.fx.burst(g.pos, Math.random() < 0.6 ? 0xe879f9 : 0xfdf4ff, 1, 1.0, { up: g.dir, size: 0.3, life: 1.1, gravity: 2.5 });
        }
        g.beam.material.opacity = 0.22 + 0.1 * Math.sin(g.t * 3 + g.dir.x * 5);
        if (g.derrick) {
          const d = g.derrick;
          if (d.pop < 1) { d.pop = Math.min(1, d.pop + dt * 1.6); d.g.scale.setScalar(Math.max(0.01, 1 + 2.7 * Math.pow(d.pop - 1, 3) + 1.7 * Math.pow(d.pop - 1, 2))); }
          d.arm.rotation.z = Math.sin(g.t * 3) * 0.35;
        }
      });
    },

    // ============================================================================ win
    checkWin: function () {
      const W = this.w;
      if (W.winCheckT === undefined) W.winCheckT = 0;
      W.winCheckT -= 1; if (W.winCheckT > 0) return; W.winCheckT = 20;
      if (W.cities.length && W.cities.every(function (c) { return c.nation === 'you'; })) this.win();
      else if (W.cities.length && !W.cities.some(function (c) { return c.nation === 'you'; })) this.lose();
    },
    // B-01: all cities lost -> comic defeat card with retry / quit
    lose: function () {
      const W = this.w, self = this; if (W.ended) return; W.ended = true;
      if (SP.audio) SP.audio.sfx('alarm');
      SP.ui.banner('Your civilization has fallen', 'Every one of your cities is lost', 3000);
      setTimeout(function () {
        if (self.w !== W) return;
        const body = SP.ui.el('div', null, '<p style="font-size:18px;line-height:1.4">The last city of the <b>' + W.camp.speciesName + '</b> has fallen. Their banners are folded and the spice derricks go quiet...<br>' +
          'Rise again: restart the Civilization stage from where it began, or retreat to the title screen.</p>');
        SP.ui.modal({ title: '💔 Your civilization has fallen', body: body, closable: false, buttons: [
          { label: 'Try again', color: 'green', icon: '🔁', onClick: function () { self.retry(); } },
          { label: 'Quit to title', color: 'rose', icon: '🏠', onClick: function () { self.w.lost = true; SP.game.autosave(); SP.game.showTitle(); } }
        ] });
      }, 1600);
    },
    retry: function () {
      const W = this.w, camp = W.camp, entry = W.entry;
      camp.civ = entry && entry.designs ? { designs: entry.designs } : null;
      SP.game.goto('civ', { noBanner: true });
    },
    win: function () {
      const W = this.w, self = this; if (W.ended) return; W.ended = true;
      const cp = W.captures, pl = W.player;
      let card = pl.type, best = -1;
      ['military', 'economic', 'religious'].forEach(function (k) { if (cp[k] > best || (cp[k] === best && k === pl.type)) { best = cp[k]; card = k; } });
      if (best <= 0) card = pl.type;
      const camp = W.camp;
      if (SP.audio) SP.audio.sfx('win');
      SP.ui.banner('One Nation!', 'Every city on the planet is yours', 3000);
      W.fx.burst(W.cities[0].pos, 0xfacc15, 40, 2.5, { up: W.cities[0].dir, size: 0.5, life: 1.6 });
      setTimeout(function () {
        if (self.w !== W) return;
        const body = SP.ui.el('div', null, '<p style="font-size:18px;line-height:1.4">The planet is united under <b>' + camp.speciesName + '</b> rule. Methods used: ⚔️ ' + cp.military + ' · 💰 ' + cp.economic + ' · 🔮 ' + cp.religious +
          '.<br>You earned the <b class="stroke-sm">' + card.toUpperCase() + '</b> card. Time to look up: design your first spaceship!</p>');
        SP.ui.modal({ title: '🌍 The whole world is yours', body: body, closable: false, buttons: [{ label: 'Build my spaceship', color: 'green', icon: '🚀', onClick: function () { self.finish(card); } }] });
      }, 1800);
    },
    finish: function (card) {
      const W = this.w, camp = W.camp, pl = W.player, self = this;
      const d0 = SP.assembly.defaultDesign('ship');
      d0.colors = { base: 0xfffbeb, accent: pl.color, detail: 0x475569 };
      const p = SP.game.openEditor({ mode: 'ship', design: d0, budget: Math.max(600, Math.floor(pl.money)), currency: 'Primordiabucks', unlocked: 'all', title: 'Build your first spaceship', allowCancel: false });
      Promise.resolve(p).then(function (res) {
        const design = (res && res.design) || d0;
        // B-08: a fraction of the treasury travels to space (space.js reads primordiabucks)
        camp.space = Object.assign(camp.space || {}, { shipDesign: design, primordiabucks: Math.max(0, Math.floor(pl.money - ((res && res.spent) || 0))) });
        camp.civ = Object.assign(camp.civ || {}, self.carry(), { world: null, finished: true });
        W.frozen = true;
        SP.game.completeStage(card, [
          '🏙️ Nations united: ' + (W.nations.length) + ' · cities owned: ' + W.cities.length,
          '⚔️ ' + W.captures.military + ' military · 💰 ' + W.captures.economic + ' economic · 🔮 ' + W.captures.religious + ' religious conquests',
          '✨ Spice derricks: ' + W.geysers.filter(function (g) { return g.owner === 'you'; }).length,
          '🚀 Your first spaceship "' + (design.name || 'Starship') + '" is ready'
        ]);
      });
    },
    carry: function () {
      const W = this.w, pl = W.player;
      return { type: pl.type, designs: pl.designs, captures: W.captures, money: Math.floor(pl.money), captured: pl.captured || [], ability: W.camp.cards && W.camp.cards.tribal };
    },

    // ============================================================================ lifecycle
    pause: function () { const W = this.w; if (W) W.drag = null; },
    resume: function () { const W = this.w; if (W) { W.drag = null; if (this.ui) this.ui.afterEditor(); } },
    serialize: function () {
      const W = this.w; if (!W) return undefined;
      // B-08: once the stage is finished keep only the small carry-over blob (no world) so `finished` survives autosaves
      if (W.frozen) return Object.assign(this.carry(), { world: null, finished: true });
      if (W.lost) return W.entry && W.entry.designs ? { designs: W.entry.designs, world: null } : null;   // Continue after a defeat starts a fresh attempt
      return Object.assign(this.carry(), { world: serializeWorld(W), entry: W.entry });
    },
    exit: function () {
      const W = this.w; if (!W) return;
      W.listeners.forEach(function (off) { try { off(); } catch (e) {} });
      if (W.detachTouch) W.detachTouch();
      if (this.ui) this.ui.dispose();
      if (W.cam && W.cam.dispose) W.cam.dispose(); // C-07
      if (W.sky && W.sky.dispose) W.sky.dispose(); // C-06
      SP.civUnits.dispose(W); SP.civCity.disposeShared(W);
      W.vehicles.forEach(function (v) { if (v.rig) v.rig.dispose(); });
      W.cities.forEach(function (c) { SP.civCity.dispose(W, c); });
      W.fx.dispose();
      if (this.scene) R.disposeTree(this.scene);
      W.planet.dispose && W.planet.dispose();
      this.scene = null; this.w = null; this.ui = null;
      if (window.__civ === this) window.__civ = null;
    }
  };
  if (SP.game && SP.game.registerStage) SP.game.registerStage(S);

  // ================================================================================ world creation
  function buildComponents(W) {
    // coarse lat/lon grid with connected components for land and sea (reachability + minimap)
    const NX = 96, NY = 48, pl = W.planet, sea = pl.seaRadius;
    const land = new Uint8Array(NX * NY), tmp = new V3();
    const dirOf = function (x, y, o) { const lat = ((y + 0.5) / NY - 0.5) * Math.PI, lon = ((x + 0.5) / NX) * Math.PI * 2 - Math.PI; return o.set(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)); };
    for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++) land[y * NX + x] = pl.surfaceRadius(dirOf(x, y, tmp)) >= sea ? 1 : 0;
    const comps = { land: new Int16Array(NX * NY).fill(-1), sea: new Int16Array(NX * NY).fill(-1) };
    ['land', 'sea'].forEach(function (kind) {
      const want = kind === 'land' ? 1 : 0, comp = comps[kind]; let id = 0;
      for (let s = 0; s < NX * NY; s++) {
        if (land[s] !== want || comp[s] >= 0) continue;
        const stack = [s]; comp[s] = id;
        while (stack.length) {
          const c = stack.pop(), cx = c % NX, cy = (c / NX) | 0;
          const nb = [[(cx + 1) % NX, cy], [(cx + NX - 1) % NX, cy], [cx, cy + 1], [cx, cy - 1]];
          for (let k = 0; k < 4; k++) { const nx = nb[k][0], ny = nb[k][1]; if (ny < 0 || ny >= NY) continue; const n = ny * NX + nx; if (land[n] === want && comp[n] < 0) { comp[n] = id; stack.push(n); } }
        }
        id++;
      }
    });
    W.grid = { NX: NX, NY: NY, land: land, comps: comps };
    W.compOf = function (dir, kind) {
      const lat = Math.asin(Math.max(-1, Math.min(1, dir.y))), lon = Math.atan2(dir.z, dir.x);
      const cx = Math.min(NX - 1, Math.max(0, Math.floor((lon + Math.PI) / (Math.PI * 2) * NX))), cy = Math.min(NY - 1, Math.max(0, Math.floor((lat / Math.PI + 0.5) * NY)));
      const comp = comps[kind === 'sea' ? 'sea' : 'land'];
      let v = comp[cy * NX + cx]; if (v >= 0) return v;
      for (let r = 1; r <= 2; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const x = (cx + dx + NX) % NX, y = cy + dy; if (y < 0 || y >= NY) continue; v = comp[y * NX + x]; if (v >= 0) return v; }
      return -1;
    };
  }

  function colorToHex(c) { if (typeof c === 'number') return c; if (typeof c === 'string') { const n = parseInt(c.replace('#', ''), 16); return isNaN(n) ? null : n; } return null; }
  function colDist(a, b) { const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255, br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255; return Math.hypot(ar - br, ag - bg, ab - bb); }

  function mkNation(id, name, color, type, o) {
    return Object.assign({ id: id, name: name, color: color, type: type, isPlayer: id === 'you', neutral: false, money: 0, income: 0, designs: {}, captured: [], dmgMul: 1, tech: {} }, o || {});
  }
  function addNation(W, n) { W.nations.push(n); W.nationById[n.id] = n; return n; }

  function playerDesigns(W, n) {
    const saved = W.camp.civ && W.camp.civ.designs;
    const D = {};
    ['cityhall', 'house', 'factory', 'entertainment'].forEach(function (r) {
      D[r] = saved && saved[r] ? saved[r] : SP.assembly.defaultDesign('building', r);
      if (!(saved && saved[r])) D[r].colors = Object.assign({}, D[r].colors, { accent: n.color });
    });
    ['land', 'sea', 'air'].forEach(function (r) {
      if (saved && saved[r]) { D[r] = saved[r]; return; }
      let d = SP.assembly.defaultDesign('vehicle', r);
      d.colors = { base: n.color, accent: 0xfffbeb, detail: 0x1e293b };
      d = SP.civUnits.variant(d, n.type); d.name = (r === 'land' ? 'Rover' : r === 'sea' ? 'Boat' : 'Flyer');
      D[r] = d;
    });
    n.designs = D;
  }

  function createWorld(W) {
    const camp = W.camp, rng = W.rng, pl = W.planet;
    const tribal = camp.cards && camp.cards.tribal;
    const myType = TYPE_FROM_TRIBAL[tribal] || 'economic';
    // team colours
    let mine = colorToHex(camp.design && camp.design.colors && camp.design.colors.base);
    const pool = R.PALETTE.slice();
    if (mine === null || mine === undefined) mine = 0x06b6d4;
    // nearest palette tone to the species colour (keeps recognisable but vivid)
    let bestI = 0, bd = 1e9; pool.forEach(function (c, i) { const d = colDist(c, mine); if (d < bd) { bd = d; bestI = i; } });
    const myCol = pool.splice(bestI, 1)[0];
    pool.sort(function (a, b) { return (a === 0x92400e || a === 0x475569 ? 1 : 0) - (b === 0x92400e || b === 0x475569 ? 1 : 0); });
    const head = pool.slice(0, 10).filter(function (c) { return c !== 0x92400e && c !== 0x475569; }); rng.shuffle(head);
    const colors = head.concat(pool.filter(function (c) { return head.indexOf(c) < 0; }));
    const you = addNation(W, mkNation('you', camp.speciesName || 'Your people', myCol, myType, { money: 1300 }));
    playerDesigns(W, you);
    // sites
    const avoid = [];
    const place = function (arr) {
      let d = arr ? C.dirFromArr(arr) : pl.randomLandDir(rng);
      // B-11: sites inherited from the tribal stage keep a tighter spacing so a tribe's village becomes (nearly) the same city
      let s = SP.civCity.findSite(W, d, avoid, arr ? 40 : 62);
      for (let k = 0; !s && k < 12; k++) { s = SP.civCity.findSite(W, pl.randomLandDir(rng), avoid, 62); }
      if (!s) s = pl.randomLandDir(rng);
      avoid.push(s); return s;
    };
    const capDir = place(camp.homeDir);
    const types = ['military', 'economic', 'religious', rng.pick(['military', 'economic', 'religious']), rng.pick(['military', 'economic', 'religious'])];
    rng.shuffle(types);
    const sites = (camp.rivalSites || []).slice(0, 5);
    const nRivals = 5;
    const rivals = [];
    for (let i = 0; i < nRivals; i++) {
      const type = types[i];
      const n = addNation(W, mkNation('r' + i, C.nationName(rng, type), colors[i % colors.length], type, { money: 500 }));
      SP.civAI.makeDesigns(W, n); SP.civAI.initNation(W, n);
      rivals.push({ n: n, dir: place(sites[i]) });
    }
    const neutrals = [];
    for (let i = 0; i < 3; i++) {
      const type = rng.pick(['military', 'economic', 'religious']);
      const n = addNation(W, mkNation('n' + i, C.word(rng, 2) + ' ' + rng.pick(['City-State', 'Free Town', 'Commune']), colors[(nRivals + i) % colors.length], type, { money: 300, neutral: true }));
      SP.civAI.makeDesigns(W, n); n.plan = []; n.buildT = 20;
      neutrals.push({ n: n, dir: place(null) });
    }
    // relations
    W.nations.forEach(function (a) { W.nations.forEach(function (b) { if (a.id < b.id) W.relMap[a.id + '|' + b.id] = Math.round(rng.range(-12, 22)); }); });
    rivals.forEach(function (r) { const k = r.n.id < 'you' ? r.n.id + '|you' : 'you|' + r.n.id; W.relMap[k] = r.n.type === 'military' ? Math.round(rng.range(-22, 0)) : Math.round(rng.range(-5, 20)); });
    neutrals.forEach(function (r) { const k = r.n.id < 'you' ? r.n.id + '|you' : 'you|' + r.n.id; W.relMap[k] = Math.round(rng.range(0, 15)); });
    // B-11: tribes allied in the tribal stage start as friends, conquered ones as resentful, poorer neighbours
    const tribes = camp.tribe && camp.tribe.rivals || [];
    rivals.forEach(function (r, i) {
      const tr = tribes[i]; if (!tr) return;
      const k = r.n.id < 'you' ? r.n.id + '|you' : 'you|' + r.n.id;
      if (tr.status === 'allied') W.relMap[k] = 62;
      else if (tr.status === 'conquered') { W.relMap[k] = -14; r.n.money = 250; }
    });
    // cities
    const capital = addCity(W, you, capDir, C.word(rng, 2) + ' Prime', ['house', 'factory', 'entertainment'], { instant: true });
    rivals.forEach(function (r) { addCity(W, r.n, r.dir, C.word(rng, 3), r.n.type === 'religious' ? ['house', 'entertainment'] : ['house', 'factory'], { instant: true }); });
    neutrals.forEach(function (r) { addCity(W, r.n, r.dir, C.word(rng, 2) + ' ' + rng.pick(['Town', 'Haven', 'Point']), ['house'], { instant: true }); });
    // spice geysers
    const ng = rng.int(9, 12), gd = [];
    const cityDirs = W.cities.map(function (c) { return c.dir; });
    for (let tries = 0, made = 0; made < ng && tries < 400; tries++) {
      const water = made % 4 === 3;
      let d;
      if (water) { const t = new V3(rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)).normalize(); const r = pl.surfaceRadius(t); if (r > pl.seaRadius - 0.7 || r < pl.seaRadius - 3.5) continue; d = t; }
      else d = pl.randomLandDir(rng, function (dir, b, rr) { return rr > pl.seaRadius + 0.6 && b !== 'snow'; });
      if (cityDirs.some(function (c) { return c.distanceTo(d) * W.R < 42; }) || gd.some(function (g) { return g.distanceTo(d) * W.R < 55; })) continue;
      gd.push(d); makeGeyser(W, d, !water); made++;
    }
    // starting fleets
    startingVehicles(W, you, capital, ['land', 'land', 'sea', 'air']);
    rivals.forEach(function (r) { startingVehicles(W, r.n, W.cities.filter(function (c) { return c.nation === r.n.id; })[0], ['land', 'land']); });
  }
  function startingVehicles(W, n, city, roles) {
    roles.forEach(function (role) {
      if (role === 'sea' && !city.port) return;
      const d = n.isPlayer ? n.designs[role] : SP.civAI.vehicleFor(W, n, role, n.type === 'military' ? 'military' : (role === 'land' ? n.type : 'military'));
      const p = SP.civUnits.spawnPoint(W, city, role); if (!p) return;
      SP.civUnits.spawn(W, n, role, d, p, { instant: true });
    });
  }

  function clearFloraNearCities(W) {
    const fl = W.planet.flora; if (!fl || !fl.nodes) return;
    const lim = (SP.civCity.POD_R + 4) / W.R;
    fl.nodes.forEach(function (n) {
      if (!n.active) return;
      for (let i = 0; i < W.cities.length; i++) if (n.dir.angleTo(W.cities[i].dir) < lim) { n.active = false; n.size = 0; n.fruit = 0; n.vigor = 0; n.dirty = true; n.blocked = true; return; }
    });
    fl._dirty = true; fl.growthMul = 0.25;
  }
  function addCity(W, nation, dir, name, roles, o) {
    o = o || {};
    const city = SP.civCity.create(W, nation, dir, name);
    W.cities.push(city);
    (roles || []).forEach(function (r) { SP.civCity.addBuilding(W, city, r, undefined, true); });
    if (!(roles && roles.length)) { city.detail.updateMatrixWorld(true); SP.civCity.remerge(city); }
    else SP.civCity.remerge(city);
    SP.civCity.compute(W, city); city.income = city.baseIncome * W.FM;
    city.frame.updateMatrixWorld(true);
    city.turrets.forEach(function (t) { SP.civCity.placeTurret(W, t, nation); });
    if (!o.instant) { W.fx.burst(city.pos, nation.color, 30, 2, { up: city.dir, size: 0.5 }); }
    return city;
  }

  // ---- geysers
  function makeGeyser(W, dir, land) {
    const pl = W.planet;
    const g = { id: 'g' + W.geysers.length, dir: dir.clone(), land: land, owner: null, t: Math.random() * 6, derrick: null, claimBy: null, nearWater: !land };
    const r = land ? pl.surfaceRadius(dir) : pl.seaRadius - 0.1;
    g.pos = dir.clone().multiplyScalar(r);
    if (land) { const ref = C.randomTangent(dir, W.rng), o = new V3(); for (let k = 0; k < 8 && !g.nearWater; k++) { C.offsetDir(dir, ref, k * 0.785, 7 / W.R, o); if (pl.surfaceRadius(o) < pl.seaRadius - 0.4) g.nearWater = true; } }
    const grp = g.group = new THREE.Group(); grp.position.copy(g.pos); C.orient(grp, dir, C.randomTangent(dir, W.rng));
    const mound = R.cel(new THREE.ConeGeometry(2.6, 1.5, 9), 0x64748b, { outline: 0.06, cast: false }); mound.position.y = 0.2; grp.add(mound);
    const rim = R.cel(new THREE.TorusGeometry(2.2, 0.38, 6, 14), 0x475569, { outline: 0.1, cast: false }); rim.rotation.x = Math.PI / 2; rim.position.y = 0.95; grp.add(rim);
    const core = new THREE.Mesh(new THREE.SphereGeometry(1.3, 10, 6), R.toon(0xe879f9, { emissive: 0xe879f9, emissiveIntensity: 0.9 })); core.scale.y = 0.5; core.position.y = 1.05; grp.add(core);
    const crystalGeo = new THREE.OctahedronGeometry(0.55, 0);
    for (let i = 0; i < 4; i++) { const c = R.cel(crystalGeo, 0xf0abfc, { outline: 0.1, cast: false, emissive: 0xe879f9, emissiveIntensity: 0.8 }); const a = i * 1.57 + 0.4; c.position.set(Math.cos(a) * 1.6, 1.1, Math.sin(a) * 1.6); c.scale.set(0.7, 1.7, 0.7); c.rotation.z = Math.cos(a) * 0.3; c.rotation.x = Math.sin(a) * 0.3; grp.add(c); }
    const beam = g.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.9, 42, 10, 1, true), new THREE.MeshBasicMaterial({ color: 0xe879f9, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    beam.position.y = 21; grp.add(beam);
    W.scene.add(grp);
    W.geysers.push(g); return g;
  }
  function claimGeyser(W, g, nation, quiet) {
    const prev = g.owner;
    g.owner = nation.id; g.claimBy = null;
    if (g.derrick) { g.group.remove(g.derrick.g); }
    const d = new THREE.Group();
    const base = R.cel(new THREE.CylinderGeometry(1.5, 1.9, 0.7, 10), nation.color, { outline: 0.08, cast: false }); base.position.y = 0.35; d.add(base);
    const tower = R.cel(new THREE.ConeGeometry(0.95, 4.2, 6), 0xf5f5f4, { outline: 0.08, cast: false }); tower.position.y = 2.6; d.add(tower);
    const arm = new THREE.Group(); arm.position.y = 4.4;
    const beamM = R.cel(new THREE.BoxGeometry(3.4, 0.35, 0.4), nation.color, { outline: 0.1, cast: false }); arm.add(beamM);
    const head = R.cel(new THREE.SphereGeometry(0.5, 8, 6), 0x1e293b, { outline: 0.1, cast: false }); head.position.x = 1.7; arm.add(head);
    d.add(arm);
    const flag = R.cel(new THREE.BoxGeometry(0.1, 0.9, 1.2), nation.color, { outline: 0.1, cast: false }); flag.position.set(0, 5.4, 0.7); d.add(flag);
    g.group.add(d); g.derrick = { g: d, arm: arm, pop: 0 };
    d.scale.setScalar(0.01);
    W.fx.burst(g.pos, nation.color, 20, 1.6, { up: g.dir, size: 0.4 }); W.fx.burst(g.pos, 0xe879f9, 14, 1.2, { up: g.dir, size: 0.3 });
    if (quiet) { /* restored from a save: no fanfare */ }
    else if (nation.isPlayer) { W.toast('Derrick built! +100 💰/min', '✨'); if (SP.audio) SP.audio.sfx('build'); if (SP.ui.popup) SP.ui.popup(g.pos, W.camera, '+100 💰/min', 'pop-gold'); }
    else if (prev === 'you') W.toast(nation.name + ' seized your spice derrick!', '✨');
  }

  // B-01: the player's capital gets a much stronger hall and sturdier turrets
  function fortifyCapital(W) {
    const cap = W.cities.filter(function (c) { return c.nation === 'you'; })[0]; if (!cap || cap.fortified) return;
    cap.fortified = true;
    const f = cap.hallHp / cap.hallMax;
    cap.hallMax = Math.round(cap.hallMax * 2.2); cap.hallHp = Math.round(cap.hallMax * Math.min(1, Math.max(f, 0.05)));
    cap.turrets.forEach(function (t) { t.maxHp = Math.round(t.maxHp * 1.8); t.hp = Math.min(t.maxHp, t.alive ? Math.max(t.hp, t.maxHp * 0.5) : 0); });
    if (cap.turrets.length < 6) { SP.civCity.addTurret(W, cap, 0.4, W.player); SP.civCity.addTurret(W, cap, 0.4 + Math.PI, W.player); cap.turrets.slice(-2).forEach(function (t) { t.maxHp = t.hp = 216; }); }
  }

  // ---- capture
  function captureCity(W, city, nation, method, price, noCard) {
    const old = W.nationById[city.nation]; if (old === nation) return;
    const you = W.player;
    SP.civCity.setOwner(W, city, nation, method);
    if (price) old.money += price;
    // vehicles queued at the city are lost
    city.queue = [];
    // visuals
    W.fx.burst(city.pos.clone().addScaledVector(city.dir, 3), nation.color, 40, 2.5, { up: city.dir, size: 0.5, life: 1.2 });
    W.fx.burst(city.pos.clone().addScaledVector(city.dir, 3), 0xffffff, 20, 1.8, { up: city.dir, size: 0.3 });
    if (SP.audio) SP.audio.sfx(nation === you ? 'levelup' : 'alarm');
    // convert enemy vehicles that were besieging
    if (nation === you) {
      if (!noCard) W.captures[method] = (W.captures[method] || 0) + 1;
      const ic = { military: '⚔️', economic: '💰', religious: '🔮', merger: '🤝' }[method];
      SP.ui.banner(ic + ' ' + city.name + ' is yours!', method === 'merger' ? 'Merged into your civilization' : method === 'economic' ? 'Bought for ' + (price || 0) + ' 💰' : method === 'religious' ? 'Converted by hologram' : 'Conquered', 2800);
      // keep their vehicle designs
      if (!you.captured.some(function (c) { return c.from === old.id; })) {
        you.captured.push({ from: old.id, name: old.name, designs: { land: old.designs.land, sea: old.designs.sea, air: old.designs.air } });
      }
      W.setRel(you.id, old.id, Math.min(W.getRel(you.id, old.id), method === 'military' ? -55 : (method === 'economic' || method === 'merger') ? 5 : -20));
    } else if (old === you) {
      SP.ui.banner('💔 ' + city.name + ' was lost!', nation.name + ' ' + (method === 'military' ? 'conquered' : method === 'economic' ? 'bought' : 'converted') + ' it', 2800);
      W.setRel(you.id, nation.id, Math.min(W.getRel(you.id, nation.id), -35));
      you.money += 0;
    } else {
      W.toast(nation.name + ' took ' + city.name + ' from ' + old.name, method === 'military' ? '⚔️' : method === 'economic' ? '💰' : '🔮', 3000);
    }
    // nation eliminated?
    if (!W.cities.some(function (c) { return c.nation === old.id; })) {
      old.dead = true;
      W.vehicles.filter(function (v) { return v.nation === old.id; }).forEach(function (v) { SP.civUnits.kill(W, v); });
      W.geysers.forEach(function (g) { if (g.owner === old.id) { g.owner = null; if (g.derrick) { g.group.remove(g.derrick.g); g.derrick = null; } } });
      if (old !== you) W.toast(old.name + ' has fallen!', '🏳️', 3000);
    }
    W.vehicles.forEach(function (v) { if (v.order && ((v.order.city === city && v.nation === nation.id) )) v.order = null; });
    if (W.sel.length) W.sel = W.sel.filter(function (v) { return v.alive; });
    SP.civCity.compute(W, city);
    city.income = city.baseIncome * W.FM;
    city.prog = { military: 0, economic: 0, religious: 0 };
    W.econT = 0;
    if (S.ui) S.ui.refreshAll();
  }

  // ================================================================================ save / restore
  function serializeWorld(W) {
    const dtab = [], dmap = {};
    const di = function (d) { const s = JSON.stringify(d); if (dmap[s] === undefined) { dmap[s] = dtab.length; dtab.push(d); } return dmap[s]; };
    const out = {
      t: W.t, captures: W.captures, rel: W.relMap, nextId: W.nextId,
      nations: W.nations.map(function (n) { const o = { id: n.id, name: n.name, color: n.color, type: n.type, neutral: n.neutral, money: Math.round(n.money), tech: n.isPlayer ? n.tech : undefined, dead: !!n.dead, plan: n.plan ? n.type : null, dsg: {}, captured: [] };
        Object.keys(n.designs).forEach(function (k) { o.dsg[k] = di(n.designs[k]); });
        o.captured = (n.captured || []).map(function (c) { return { from: c.from, name: c.name, designs: { land: di(c.designs.land), sea: di(c.designs.sea), air: di(c.designs.air) } }; });
        return o; }),
      cities: W.cities.map(function (c) { return { n: c.nation, name: c.name, dir: C.arr(c.dir), plots: c.plots.map(function (p) { return p.role ? [p.role, di(p.design)] : null; }), hall: Math.round(c.hallHp), turrets: c.turrets.map(function (t) { return t.alive ? Math.round(t.hp) : 0; }), trade: c.trade, convert: c.convert, ref: C.arr(c.ref), q: (c.queue || []).map(function (q) { return { role: q.role, kind: q.kind, d: di(q.design), cost: q.cost, t: q.t, dur: q.dur }; }) }; }),
      geysers: W.geysers.map(function (g) { return { dir: C.arr(g.dir), land: g.land, owner: g.owner }; }),
      vehicles: W.vehicles.map(function (v) { return { n: v.nation, role: v.role, d: di(v.design), dir: C.arr(v.dir), hp: Math.round(v.hp) }; })
    };
    out.designs = dtab;
    return out;
  }
  function restoreWorld(W, s) {
    W.t = s.t || 0; W.captures = s.captures || W.captures; W.relMap = s.rel || {}; W.nextId = s.nextId || 1;
    const D = s.designs;
    s.nations.forEach(function (o) {
      const n = addNation(W, mkNation(o.id, o.name, o.color, o.type, { neutral: o.neutral, money: o.money, dead: o.dead, tech: o.tech || {} }));
      Object.keys(o.dsg).forEach(function (k) { n.designs[k] = D[o.dsg[k]]; });
      n.captured = (o.captured || []).map(function (c) { return { from: c.from, name: c.name, designs: { land: D[c.designs.land], sea: D[c.designs.sea], air: D[c.designs.air] } }; });
      if (!n.isPlayer && !n.neutral) SP.civAI.initNation(W, n); else if (n.neutral) { n.plan = []; n.buildT = 20; }
    });
    s.cities.forEach(function (o) {
      const n = W.nationById[o.n];
      const city = SP.civCity.create(W, n, C.dirFromArr(o.dir), o.name);
      W.cities.push(city);
      // B-17: build each plot from its saved design (swap the nation's current design in just for the call)
      o.plots.forEach(function (p, i) { if (p) { const cur = n.designs[p[0]]; if (D[p[1]]) n.designs[p[0]] = D[p[1]]; SP.civCity.addBuilding(W, city, p[0], i, true); n.designs[p[0]] = cur; } });
      SP.civCity.remerge(city);
      city.queue = (o.q || []).map(function (q) { return { role: q.role, kind: q.kind, design: D[q.d], cost: q.cost, t: q.t, dur: q.dur }; });
      city.hallHp = o.hall; city.trade = o.trade || {}; city.convert = o.convert || {};
      city.frame.updateMatrixWorld(true);
      city.turrets.forEach(function (t, i) { const hp = o.turrets[i]; t.alive = hp > 0; t.hp = hp; SP.civCity.placeTurret(W, t, n); });
      SP.civCity.compute(W, city);
    });
    s.geysers.forEach(function (o) { const g = makeGeyser(W, C.dirFromArr(o.dir), o.land); if (o.owner) claimGeyser(W, g, W.nationById[o.owner], true), g.derrick.pop = 1, g.derrick.g.scale.setScalar(1); });
    s.vehicles.forEach(function (o) { const n = W.nationById[o.n]; if (!n) return; const v = SP.civUnits.spawn(W, n, o.role, D[o.d], C.dirFromArr(o.dir), { instant: true }); v.hp = o.hp; });
  }

  // fix: derrick pop on restore handled above; expose for tests
  S._internal = { captureCity: captureCity };
})();
