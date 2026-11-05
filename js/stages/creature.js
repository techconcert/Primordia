/* SP.stages.creature -- Creature Stage (DESIGN §6): third-person life on a spherical planet inside the living world (SP.eco).
 * Helpers: creature_hud.js (SP.crHud), creature_social.js (SP.crSocial). */
(function () {
  'use strict';
  const SP = window.SP = window.SP || {};
  SP.stages = SP.stages || {};
  const U = SP.util, V3 = THREE.Vector3, clamp = U.clamp;

  const BRAIN_MAX = 500;
  const FRUIT_FOOD = 22, MEAT_FOOD = 30;
  const TIER_REWARD = [3, 6, 10, 18, 35];
  const COMBAT = ['bite', 'charge', 'strike', 'spit'], SOCIAL = ['sing', 'dance', 'charm', 'pose'];
  const ARCH = {
    herbivore: { id: 'siren', icon: '🎶', name: "Siren's Song", cd: 40, desc: 'Calms every creature nearby' },
    carnivore: { id: 'roar', icon: '🦁', name: 'Raging Roar', cd: 45, desc: 'Stuns and scares nearby creatures' },
    omnivore: { id: 'flock', icon: '🐾', name: 'Summon Flock', cd: 60, desc: 'Calls temporary allies' }
  };
  const _a = new V3(), _b = new V3(), _c = new V3(), _d = new V3(), _e = new V3(), _d2 = new V3();
  const EASE = (t) => t * t * (3 - 2 * t);

  function hex(n) { return '#' + ('000000' + (n >>> 0).toString(16)).slice(-6); }

  // ------------------------------------------------------------------ setup helpers
  function pickHome(planet, rng) {
    let best = null, bs = -1;
    const probe = new V3();
    for (let i = 0; i < 70; i++) {
      const d = planet.randomLandDir(rng, (dd, b, r) => (b === 'grass' || b === 'forest') && r > planet.seaRadius + 1.1 && r < planet.seaRadius + 4.5 && planet.slopeAt(dd) < 0.16);
      let wet = 0;
      for (let k = 0; k < 8; k++) {
        const a = k / 8 * Math.PI * 2, up = d, ref = Math.abs(up.y) < 0.95 ? new V3(0, 1, 0) : new V3(1, 0, 0);
        const e = new V3().crossVectors(ref, up).normalize(), n = new V3().crossVectors(up, e);
        const dir = e.multiplyScalar(Math.cos(a)).addScaledVector(n, Math.sin(a));
        probe.copy(SP.surf.move(d.clone().multiplyScalar(planet.radius), dir, 24, null)).normalize();
        if (planet.isWater(probe)) wet++;
      }
      // flora close by is a plus; coast (some water ring) too
      const food = planet.flora.within(planet.surfacePoint(d), 28).length;
      const score = (wet >= 1 && wet <= 5 ? 3 : wet > 0 ? 1 : 0) + Math.min(5, food / 3) + (planet.biomeAt(d) === 'grass' ? 1.5 : 0.5) + rng.next() * 0.5;
      if (score > bs) { bs = score; best = d; }
    }
    return best || planet.randomLandDir(rng, (dd, b) => b === 'grass');
  }
  function prepareDesign(C) {
    let d = C.design;
    const cardDiet = C.cards && C.cards.cell;
    if (!d || d.kind === 'cell') {
      const nd = SP.creature.defaultDesign('creature');
      if (d) { nd.name = d.name || nd.name; if (d.colors) nd.colors = JSON.parse(JSON.stringify(d.colors)); }
      const mouth = nd.parts.find((p) => SP.parts.get(p.id) && SP.parts.get(p.id).slot === 'mouth');
      if (mouth && cardDiet === 'herbivore') mouth.id = 'mouth_nibble_1'; else if (mouth && cardDiet === 'carnivore') mouth.id = 'mouth_snap_1';
      d = nd;
    }
    d = SP.creature.clone(d);
    if (!d.name) d.name = C.speciesName || 'Primordialing';
    return d;
  }

  // ================================================================== the stage
  const S = SP.stages.creature = {
    id: 'creature', title: 'Creature Stage', next: 'tribal',
    scene: null, camera: null,

    // ----------------------------------------------------------------- enter
    enter: function (campaign, opts) {
      opts = opts || {};
      const q = SP.game && SP.game.params;
      this.C = campaign; this.completed = false;
      campaign.stats = campaign.stats || { playTime: 0, kills: 0, allies: 0, extinctions: 0 };
      campaign.cards = campaign.cards || {};
      campaign.planet = campaign.planet || { seed: campaign.seed || 1, name: 'Home', radius: 140 };
      campaign.unlocked = Array.from(new Set((campaign.unlocked || []).concat(SP.parts.defaultUnlocked('creature'))));
      if (typeof campaign.dna !== 'number') campaign.dna = 0;
      const res = (opts.resume && campaign.creature && campaign.creature.v === 1) ? campaign.creature : null;
      this.res = res;
      this.T = 0; this.mode = 'combat'; this.speedMul = (SP.game && SP.game.speedMul) || 1;

      // ---- world
      const scene = this.scene = new THREE.Scene();
      const t0 = performance.now();
      const planet = this.planet = SP.planet.create({ seed: campaign.planet.seed, radius: campaign.planet.radius || 140, detail: 6 });
      scene.add(planet.group);
      const sky = this.sky = SP.sky.create(scene, planet, { dayLength: 360 });
      this.design = prepareDesign(campaign); campaign.design = this.design;

      const hrng = U.rng((campaign.seed || 1) * 31 + 7);
      let homeDir;
      if (campaign.homeDir && campaign.homeDir.length === 3) homeDir = new V3(campaign.homeDir[0], campaign.homeDir[1], campaign.homeDir[2]).normalize();
      else { homeDir = pickHome(planet, hrng); campaign.homeDir = [+homeDir.x.toFixed(4), +homeDir.y.toFixed(4), +homeDir.z.toFixed(4)]; }
      // a Stage-Select / legacy homeDir may lie in the sea: nests must stand on dry land (A-05)
      if (!res && !campaign.eco && (planet.isWater(homeDir) || planet.surfaceRadius(homeDir) < planet.seaRadius + 1.1 || planet.slopeAt(homeDir) > 0.3)) {
        homeDir = pickHome(planet, hrng); campaign.homeDir = [+homeDir.x.toFixed(4), +homeDir.y.toFixed(4), +homeDir.z.toFixed(4)];
      }
      this.homeDir = homeDir;

      this.brainXp = res ? res.brainXp : Math.max(0, ((campaign.brainLevel || 1) - 1) * 100);
      this.brainLevel = clamp(1 + Math.floor(this.brainXp / 100), 1, 5);
      campaign.brainLevel = this.brainLevel;
      this.stats = SP.creature.stats(this.design, { brainLevel: this.brainLevel });
      this.maxHp = this.stats.health; this.hp = res ? Math.min(res.hp, this.maxHp) : this.maxHp; this.hunger = res ? res.hunger : 80;
      this.explored = new Set(res && res.explored ? res.explored : []);
      this.pack = []; this.temp = []; this.dots = []; this.rings = []; this.calm = [];
      this.cd = { bite: 0, charge: 0, strike: 0, spit: 0, arch: 0 };
      this.archetype = ARCH[campaign.cards.cell] || ARCH.omnivore;
      this.sinceHit = 99; this.eatCd = 0; this.invul = 0; this.shake = 0; this.frenzy = 0; this.dead = false; this.deadT = 0;
      this.state = 'play'; this.walkTo = null; this.target = null; this.charge = null; this.eventPill = null; this.boomArea = null; this.raidFlash = 0;
      this.tutT = 0; this._tut = null; this._later = []; this.busy = false; this.lastSave = 0; this.hatch = null;

      // ---- player body + rig
      this.fit = SP.eco.sizeFit.playerFit(SP.creature.stats(this.design, { brainLevel: 1 })); // world-size normalisation (adult ~1.4 u at level 1, ~2.2 u at level 5)
      this.curScale = this.fit * Math.pow(1.12, this.brainLevel - 1);
      this.buildPlayer(res ? new V3(res.pos[0], res.pos[1], res.pos[2]) : null, res ? new V3(res.hd[0], res.hd[1], res.hd[2]) : null);

      // ---- eco
      const ecoOpts = {
        playerDesign: this.design, playerNestDir: homeDir, speciesCount: 9, brainLevel: this.brainLevel, scene, maxDrawn: 8,
        onAttackPlayer: (a, dmg, imp) => S.hurt(dmg, a, imp)
      };
      const data = res && res.eco ? res.eco : campaign.eco;
      let eco;
      try { eco = data ? SP.eco.load(planet, data, ecoOpts) : SP.eco.create(planet, U.rng((campaign.seed || 1) + 1234), ecoOpts); }
      catch (e) { console.error('eco load failed, creating fresh', e); eco = SP.eco.create(planet, U.rng((campaign.seed || 1) + 1234), ecoOpts); }
      this.eco = eco; eco.player = this.body;
      if (!res) {
        const n = eco.homeNest; if (n) { SP.physics.place(this.body, planet, n.dir); this.body.heading.copy(this.coastHeading(n.dir)); }
      }
      this.nest = eco.homeNest;
      if (res && res.sky !== undefined) sky.setTime(res.sky); else sky.setLocalTime(0.4, this.nest.pos);
      this.hookEco();

      // ---- fx, camera, UI
      this.particles = SP.render.particles(scene, 700);
      this.cam = new SP.cam.Follow({ fov: 55, distance: 13, minDist: 4, maxDist: 38, pitch: 0.5, lookHeight: 1.2 });
      this.camera = this.cam.camera; this.camK = 1;
      this.cam.target.copy(this.body.pos); this.cam.up.copy(this.body.up); this.cam.snap(); this.cam.faceDirection(this.body.heading, true);
      this.buildMarkers();
      this.hud = SP.crHud.create(this);
      this.waterFx = SP.waterFx.create(scene, this.particles, planet);          // splashes, ripples, bubbles (DESIGN 3.6)
      this.waterHud = SP.waterHud.create(SP.ui.hud());                          // breath bar, shore arrow, drowning vignette
      this.social = SP.crSocial.create(this);
      this.fx = this.makeFx();
      SP.ui.help([
        '<kbd class="kbd">W</kbd><kbd class="kbd">A</kbd><kbd class="kbd">S</kbd><kbd class="kbd">D</kbd> move (relative to the camera). <kbd class="kbd">Shift</kbd> sprint, <kbd class="kbd">Space</kbd> jump (hold to glide), <kbd class="kbd">C</kbd> sneak. In water: floaters bob, swimmers dive (<kbd class="kbd">C</kbd>) and surface (<kbd class="kbd">Space</kbd>), heavy bodies sink: tap <kbd class="kbd">Space</kbd> to kick up before the breath bar runs out',
        'Right-drag orbits the camera, wheel zooms. Click a creature to target it, click the ground to walk there, <kbd class="kbd">Tab</kbd> cycles targets',
        '<kbd class="kbd">1</kbd>-<kbd class="kbd">4</kbd> combat: bite, charge, strike, spit. Heavier targets resist; cooldown sweeps show when ready',
        '<kbd class="kbd">F</kbd> social mode. Watch the creature\'s gestures, then press <kbd class="kbd">5</kbd>-<kbd class="kbd">8</kbd> (sing, dance, charm, pose) as the notes hit the ring. Fill its heart meter to befriend it. Befriend a whole species to ally it',
        '<kbd class="kbd">E</kbd> eat fruit from bushes and trees (herbivore/omnivore) or meat from carcasses (carnivore/omnivore). Wrong food makes you sick. Hunger drains slowly',
        '<kbd class="kbd">G</kbd> recruit an ally or nest-mate into your pack (slots = brain level - 1). <kbd class="kbd">Q</kbd> ' + this.archetype.name + ': ' + this.archetype.desc.toLowerCase(),
        '<kbd class="kbd">M</kbd> (or <kbd class="kbd">E</kbd>) at your nest: mating call, redesign your species with your DNA, then hatch again',
        'Find bone piles (🦴 on the minimap) to unlock new parts. Epic creatures guard some. Earn DNA by eating, exploring, befriending, hunting. Fill all 5 brain segments to evolve'
      ]);

      // A-11: a reload during the first editor must reopen it (res exists because goto() autosaved in the editor state)
      this.startEditor = !campaign.creatureEditorDone && !(q && q.get('noedit'));
      if (this.startEditor && !res) campaign.dna += 100;
      if (!res || this.startEditor) { if (!this.startEditor) this.startHatch(true); else { this.body.pos.copy(this.nest.pos); this.rig.root.visible = false; this.state = 'editor'; } }
      this.log = (window.__crLog = []);
      this.loadMs = performance.now() - t0;
    },

    coastHeading: function (dir) {
      // face away from the nearest water so the player starts looking inland at the world
      const up = dir, ref = Math.abs(up.y) < 0.95 ? new V3(0, 1, 0) : new V3(1, 0, 0);
      const e = new V3().crossVectors(ref, up).normalize(), n = new V3().crossVectors(up, e);
      let best = e.clone(), bs = -1e9;
      for (let k = 0; k < 12; k++) {
        const a = k / 12 * Math.PI * 2, dv = e.clone().multiplyScalar(Math.cos(a)).addScaledVector(n, Math.sin(a));
        let s = 0;
        for (let r = 8; r <= 40; r += 8) { const p = SP.surf.move(dir.clone().multiplyScalar(this.planet.radius), dv, r, null).normalize(); s += this.planet.isWater(p) ? -3 : 1; }
        // the follow camera sits behind the hatchling, so land behind matters too (A-05: no view over open water)
        for (let r = 6; r <= 18; r += 6) { const p = SP.surf.move(dir.clone().multiplyScalar(this.planet.radius), dv.clone().negate(), r, null).normalize(); s += this.planet.isWater(p) ? -2.5 : 0.8; }
        // prefer directions with flora
        const pt = SP.surf.move(dir.clone().multiplyScalar(this.planet.radius), dv, 22, null);
        s += this.planet.flora.within(pt, 14).length * 0.4;
        if (s > bs) { bs = s; best = dv; }
      }
      return best;
    },

    buildPlayer: function (pos, heading) {
      const old = this.rig;
      if (old) { this.scene.remove(old.root); old.dispose && old.dispose(); }
      const rig = this.rig = SP.creature.build(this.design, { outline: true, shadows: true, lod: 'high' });
      this.scene.add(rig.root);
      this.stats = SP.creature.stats(this.design, { brainLevel: this.brainLevel });
      const sc = this.curScale;
      rig.setScale(sc);
      const st = Object.assign({}, this.stats);
      const m0 = st.mass, gs = sc / this.fit, sc3 = gs * gs * gs; // C-20: brain growth scales mass and stability too (knockback, uphill penalty)
      st.mass = m0 * sc3; st.stability = this.stats.stability * sc3;
      if (!this.body) {
        this.body = SP.physics.createBody({ pos: pos || new V3(0, this.planet.radius + 4, 0), heading: heading || new V3(1, 0, 0), radius: st.radius * sc, mass: st.mass, stats: st, scale: sc });
        this.body.id = 'player';
      } else {
        Object.assign(this.body.stats, st); this.body.radius = st.radius * sc; this.body.scale = sc; this.body.mass = st.mass;
      }
      this.anim = { speed: 0, turn: 0, action: null, actionT: 0, airborne: false, inWater: false };
      this.player = { isPlayer: true, body: this.body, rig: rig, get scale() { return S.curScale; } };
      this.act = null; this.actDur = 0;
      this.maxHp = this.stats.health;
    },

    buildMarkers: function () {
      const R = SP.render;
      // target ring
      const ring = this.targetRing = R.cel(new THREE.TorusGeometry(1, 0.07, 6, 28), 0xfde047, { outline: 0.0, cast: false, receive: false, material: SP.render.toon(0xfde047, { emissive: 0xfde047, emissiveIntensity: 0.7 }) });
      ring.visible = false; this.scene.add(ring);
      const wr = this.walkRing = R.cel(new THREE.TorusGeometry(0.6, 0.07, 6, 18), 0xffffff, { outline: 0, cast: false, receive: false, material: SP.render.toon(0xffffff, { emissive: 0xffffff, emissiveIntensity: 0.8 }) });
      wr.visible = false; this.scene.add(wr);
      // meteor-shower safe ring around the nest
      const safe = this.safeRing = new THREE.Mesh(new THREE.TorusGeometry(14, 0.12, 6, 64), new THREE.MeshBasicMaterial({ color: 0x67e8f9, transparent: true, opacity: 0.7 }));
      safe.visible = false; this.scene.add(safe);
    },

    // ----------------------------------------------------------------- derived values
    packSlots: function () { return Math.min(4, this.brainLevel - 1); },
    packFree: function () { return this.packSlots() - this.pack.length; },
    rawLevel: function (id) { return Math.round((this.stats.abilities && this.stats.abilities[id]) || 0); },
    abilityLevels: function () {
      const o = {};
      COMBAT.forEach((id) => { o[id] = Math.max(id === 'bite' ? 1 : 0, this.rawLevel(id)); });
      SOCIAL.forEach((id) => { o[id] = Math.max(1, this.rawLevel(id)); });
      return o;
    },
    socialLevel: function (id) { return this.abilityLevels()[id]; },
    dietOf: function () { const d = this.stats.diet; return d === 'none' || !d ? 'omnivore' : d; },
    cooldownFracs: function () {
      const A = SP.crHud.ABILITIES, o = {};
      COMBAT.forEach((id) => { o[id] = this.cd[id] / A[id].cd; });
      o.arch = this.cd.arch / this.archetype.cd;
      return o;
    },
    revealedPiles: function () {
      const home = this.nest.dir, R = this.planet.radius;
      const list = this.eco.bonePiles.slice().sort((a, b) => a.dir.angleTo(home) - b.dir.angleTo(home));
      const n = Math.min(20, 5 + 4 * this.brainLevel);
      return list.filter((p, i) => i < n || p.found);
    },

    // ----------------------------------------------------------------- positions & projection helpers
    headPos: function (obj, k) {
      const h = obj.isPlayer ? this.stats.height * this.curScale : (obj.species.stats.height || 2) * (obj.scale || 1);
      return obj.body.pos.clone().addScaledVector(obj.body.up, h * (k === undefined ? 1 : k));
    },
    toScreen: function (pos) {
      _e.copy(pos).project(this.camera);
      if (_e.z > 1 || _e.z < -1) return null;
      return { x: (_e.x * 0.5 + 0.5) * window.innerWidth, y: (-_e.y * 0.5 + 0.5) * window.innerHeight };
    },
    headScreen: function (obj, k, dom) {
      const p = this.toScreen(this.headPos(obj, k));
      if (!p) { dom.style.display = 'none'; return; }
      dom.style.display = ''; dom.style.left = p.x + 'px'; dom.style.top = p.y + 'px';
    },
    popupAt: function (pos, text, cls) { SP.ui.popup(pos, this.camera, text, cls); },
    faceTarget: function (a) {
      _a.copy(a.body.pos).sub(this.body.pos); _a.addScaledVector(this.body.up, -_a.dot(this.body.up));
      if (_a.lengthSq() > 0.01) { this.body.heading.copy(_a.normalize()); }
    },

    // ----------------------------------------------------------------- hatching
    startHatch: function (first) {
      const body = this.body, nest = this.nest;
      // hatch on the rim of the nest, facing away from the water
      const hd0 = this.coastHeading(nest.dir);
      // spawn on the rim to the SIDE of the heading so the flag pole is never between the follow camera and the hatchling (A-05)
      const side = new V3().crossVectors(nest.dir, hd0).normalize();
      const sp = SP.surf.move(nest.pos.clone(), side, 2.5, this.planet);
      SP.physics.place(body, this.planet, sp.clone().normalize());
      body.heading.copy(hd0).addScaledVector(body.up, -hd0.dot(body.up)).normalize();
      this.rig.root.visible = false;
      const g = new THREE.Group(), R = SP.render, r = Math.max(0.7, this.stats.radius * this.curScale * 0.62);
      const base = this.design.colors ? this.design.colors.base : 0x22c55e;
      const shellMat = { outline: 0.05 };
      const top = R.cel(new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0xfff7e0, shellMat);
      const bot = R.cel(new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), 0xfff7e0, shellMat);
      const spotG = new THREE.SphereGeometry(0.2, 8, 6);
      for (let i = 0; i < 5; i++) { const sp = R.cel(spotG, base, { outline: 0.05, cast: false }); const a = i * 1.7, h = 0.25 + i * 0.12; sp.position.set(Math.cos(a) * 0.9, h, Math.sin(a) * 0.9).normalize().multiplyScalar(1.0); top.add(sp); }
      g.add(top, bot); g.scale.set(r, r * 1.25, r);
      g.position.copy(body.pos).addScaledVector(body.up, r * 1.2);
      g.quaternion.setFromUnitVectors(new V3(0, 1, 0), body.up);
      this.scene.add(g);
      this.hatch = { g, top, bot, t: 0, r, popped: false, vel: new V3(), spin: new V3(), first: !!first };
      this.state = 'hatch'; this.invul = 3;
      this.cam.distance = 11; this.cam.pitch = 0.4; this.cam.target.copy(body.pos); this.cam.faceDirection(body.heading, true);
      SP.audio && SP.audio.sfx('place');
    },
    updateHatch: function (dt) {
      const h = this.hatch; h.t += dt;
      const up = this.body.up, g = h.g;
      if (h.t < 2.0) {
        const k = h.t / 2.0, w = Math.sin(h.t * (7 + k * 14)) * (0.05 + k * 0.32);
        g.rotation.z = 0; g.quaternion.setFromUnitVectors(new V3(0, 1, 0), up);
        const q = new THREE.Quaternion().setFromAxisAngle(this.cam.rightOnSurface(), w); g.quaternion.premultiply(q);
        if (Math.floor(h.t * 4) !== Math.floor((h.t - dt) * 4)) SP.audio && SP.audio.sfx('place', { pitch: 0.7 + k * 0.8, vol: 0.5 });
      } else if (!h.popped) {
        h.popped = true;
        const p = this.body.pos.clone().addScaledVector(up, 0.8);
        this.particles.burst(p, 0xfff7e0, 26, 1.3); this.particles.burst(p, 0xfde047, 14, 1.1);
        this.rig.root.visible = true; this.rig.setScale(0.01);
        h.vel.copy(up).multiplyScalar(7).addScaledVector(this.cam.rightOnSurface(), 2);
        h.spin.set(2, 0, 4);
        SP.audio && SP.audio.sfx('levelup');
        this.hudSay(h.first ? 'Your species grows legs!' : 'Hatched!', '#fde047');
        this.setAction('celebrate', 1.6);
        this.state = 'hatched';
      }
      if (h.popped) {
        const tt = h.t - 2.0;
        h.top.position.addScaledVector(h.vel, dt); h.vel.addScaledVector(up, -16 * dt);
        h.top.rotation.x += h.spin.x * dt; h.top.rotation.z += h.spin.z * dt;
        h.bot.scale.setScalar(Math.max(0.01, 1 - Math.max(0, tt - 0.8) * 1.2));
        h.top.scale.setScalar(Math.max(0.01, 1 - Math.max(0, tt - 0.9) * 1.2));
        const sc = this.curScale, k = Math.min(1, tt / 0.55), pop = EASE(k) * (1 + 0.25 * Math.sin(k * Math.PI)) ;
        this.rig.setScale(Math.max(0.01, sc * pop));
        if (tt > 1.8) { this.scene.remove(h.g); this.hatch = null; this.rig.setScale(sc); this.state = 'play'; this.invul = 1.2; this.cam.distance = 13; }
      }
    },

    // ----------------------------------------------------------------- actions / animation
    setAction: function (name, dur) { this.act = name; this.actDur = dur || 0.8; this.anim.action = name; this.anim.actionT = 0; },
    hudSay: function (t, c) { this.hud && this.hud.say(t, c); },

    // ----------------------------------------------------------------- fx helpers
    makeFx: function () {
      const self = this;
      return {
        burst: (pos, color, n, speed, o) => self.particles.burst(pos, color, n, speed, o),
        hearts: function (a, n) {
          for (let i = 0; i < n; i++) {
            setTimeout(() => {
              if (!self.hud || !a.body) return;
              const p = self.toScreen(self.headPos(a, 1.1)); if (!p) return;
              self.hud.heart(p.x + (Math.random() - 0.5) * 40, p.y + (Math.random() - 0.5) * 20, ['💗', '💖', '💕'][i % 3]);
            }, i * 110);
          }
        },
        notes: function (a, ab) {
          const p = self.toScreen(self.headPos(a, 1.3)); if (!p || !self.hud) return;
          self.hud.heart(p.x + (Math.random() - 0.5) * 60, p.y, SP.crHud.ABILITIES[ab].icon);
        },
        ring: function (pos, color, maxR, dur, up) {
          const m = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 6, 40), new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.9 }));
          m.position.copy(pos); m.quaternion.setFromUnitVectors(new V3(0, 0, 1), up || self.body.up);
          self.scene.add(m); self.rings.push({ m, t: 0, dur, maxR });
        }
      };
    },

    // ----------------------------------------------------------------- eco hooks (events, kills, relations)
    hookEco: function () {
      const eco = this.eco, C = this.C;
      eco.on('killed', (d) => {
        if (!d.byPlayer || d.species.isPlayer) return;
        C.stats.kills++;
        let r = TIER_REWARD[d.species.rank] || 5;
        if (d.isAlpha) r *= 2; if (d.guard) r += 15; if (d.isEpic) r *= 1.4;
        this.reward(r, 'Defeated ' + d.species.name, d.actor.body.pos);
        if (d.actor.raid) { this.reward(8, 'Nest defended', null); this.toast('Raider driven off!', '🛡️'); }
        if (d.isAlpha) this.unlockAlpha(d.species);
        if (d.guard) this.toast('Guardian defeated!', '🏆');
        SP.audio && SP.audio.sfx('die', { vol: 0.5 });
      });
      eco.on('impressed', (d) => {
        this.reward(6, null, d.actor.body.pos);
        this.toast(d.species.name + ' impressed (' + d.count + '/' + d.needed + ')', '💗', 2200);
        SP.audio && SP.audio.sfx('levelup', { vol: 0.5 });
        this.fx.hearts(d.actor, 8);
        if (d.isAlpha) this.unlockAlpha(d.species);
      });
      eco.on('allied', (d) => {
        C.stats.allies++;
        this.reward(60, null, this.body.pos);
        SP.ui.banner('New ally!', d.species.name + ' will never attack you', 2600);
        SP.ui.confetti(this.hud.over);
        SP.audio && SP.audio.sfx('win');
      });
      eco.on('extinct', (d) => {
        if (d.byPlayer) { C.stats.extinctions++; this.reward(50, null, this.body.pos); SP.ui.banner('Extinct!', d.species.name + ' are no more... by your hand', 3000); SP.audio && SP.audio.sfx('alarm'); }
        else this.toast(d.species.name + ' have gone extinct', '💀', 3200);
      });
      eco.on('boneFound', (d) => this.onBones(d));
      eco.on('event', (e) => this.onEvent(e));
    },

    onBones: function (d) {
      const C = this.C, names = [];
      d.parts.forEach((pid) => {
        const p = SP.parts.get(pid);
        if (C.unlocked.indexOf(pid) < 0) C.unlocked.push(pid);
        names.push(p ? (p.icon || '🦴') + ' ' + p.name : pid);
      });
      this.reward(20, null, d.pile.pos);
      SP.ui.toast('Bone pile! Unlocked: ' + names.join(', '), '🦴', 4200);
      SP.audio && SP.audio.sfx('levelup');
      this.particles.burst(d.pile.pos.clone().addScaledVector(d.pile.pos.clone().normalize(), 1.5), 0xfde047, 28, 1.4);
      this.hudSay('🦴 New parts!', '#fde047');
    },
    unlockAlpha: function (sp) {
      const C = this.C, tier = clamp(sp.rank + 1, 1, 4);
      const pool = SP.parts.ofKind('creature').filter((p) => !p.unlockedByDefault && C.unlocked.indexOf(p.id) < 0);
      if (!pool.length) return;
      pool.sort((a, b) => Math.abs(a.tier - tier) - Math.abs(b.tier - tier) + (Math.random() - 0.5));
      const p = pool[0]; C.unlocked.push(p.id);
      SP.ui.toast('Alpha reward! Unlocked ' + (p.icon || '') + ' ' + p.name, '👑', 4200);
    },
    onEvent: function (e) {
      const eco = this.eco;
      switch (e.type) {
        case 'meteor':
          if (e.phase === 'start') {
            SP.ui.banner('Meteor shower!', 'Run to your nest!', 3000); SP.audio && SP.audio.sfx('alarm');
            this.eventPill = { icon: '☄️', text: 'Meteors! Get to the nest', t: e.duration || 25, countdown: true };
            this.safeRing.visible = true; this.meteorOn = true; this.meteorSafe = true;
          } else if (e.phase === 'impact') {
            const d = e.pos.distanceTo(this.body.pos);
            this.fx.ring(e.pos.clone().addScaledVector(e.pos.clone().normalize(), 0.2), 0xfb923c, 4.2, 0.6, e.pos.clone().normalize());
            if (d < 70) this.shake = Math.max(this.shake, clamp(1 - d / 70, 0.1, 0.8));
            if (d < e.radius + this.body.radius && this.invul <= 0) { this.hurt(e.damage || 25, null, e.pos.clone().sub(this.body.pos).setLength(-14)); this.toast('Hit by a meteor!', '☄️'); }
          } else if (e.phase === 'end') {
            this.safeRing.visible = false; this.meteorOn = false; this.eventPill = null;
            if (!this.dead && this.body.pos.distanceTo(this.nest.pos) < 14) { this.reward(15, null, this.body.pos); this.toast('Safe at home! The sky clears.', '🏠'); } else this.toast('The meteors have stopped', '☄️');
          }
          break;
        case 'migration':
          if (e.phase === 'start') { SP.ui.toast(e.text || 'A herd is migrating!', '🦬', 4000); this.eventPill = { icon: '🦬', text: 'Migration: ' + e.species.name, t: 40 }; SP.audio && SP.audio.sfx('coin', { vol: 0.5 }); }
          break;
        case 'nest_raid':
          if (e.phase === 'start') { SP.ui.banner('Raid!', e.species.name + ' attack your nest', 2800); SP.audio && SP.audio.sfx('alarm'); this.raidFlash = 25; this.eventPill = { icon: '⚔️', text: 'Defend the nest!', t: 40 }; }
          else if (e.phase === 'bite') { if (Math.random() < 0.25) SP.ui.toast('The nest is under attack!', '🪺', 1600); }
          else if (e.phase === 'end') { this.raidFlash = 0; this.eventPill = null; SP.ui.toast('The raid is over', '🪺'); }
          break;
        case 'fruit_boom':
          if (e.phase === 'start') { SP.ui.toast('Fruit boom! Food is growing fast', '🍓', 4000); this.boomArea = { pos: e.pos, t: e.duration || 80 }; SP.audio && SP.audio.sfx('coin'); }
          else if (e.phase === 'end') { this.boomArea = null; }
          break;
        case 'peace': SP.ui.toast(e.text || 'They have calmed down', '🕊️', 3000); break;
        case 'arrival': SP.ui.toast(e.text || (e.species.name + ' arrive'), '🐾', 3800); break;
        default: break;
      }
    },

    later: function (t, fn) { (this._later = this._later || []).push({ t, fn }); },
    toast: function (t, i, ms) { SP.ui.toast(t, i, ms); },

    // ----------------------------------------------------------------- rewards and brain
    reward: function (amount, why, pos) {
      const C = this.C;
      let bonus = 1;
      for (const n of this.eco.nests) { const sp = this.eco.speciesById(n.speciesId); if (sp && sp.relation === 'allied' && n.pos.distanceTo(this.body.pos) < 40) { bonus = 1.25; break; } }
      const amt = Math.max(1, Math.round(amount * this.speedMul * bonus));
      C.dna += amt;
      const before = this.brainLevel;
      this.brainXp = Math.min(BRAIN_MAX, this.brainXp + amt);
      if (pos) this.popupAt(pos.clone().addScaledVector(pos.clone().normalize(), 1.6), '+' + amt + ' 🧬', 'pop-purple');
      else this.popupAt(this.headPos(this.player, 1.3), '+' + amt + ' 🧬', 'pop-purple');
      if (why) SP.ui.toast(why + '  +' + amt + ' DNA', '🧬', 1800);
      SP.audio && SP.audio.sfx('dna', { vol: 0.5 });
      const lvl = clamp(1 + Math.floor(this.brainXp / 100), 1, 5);
      if (lvl > before) this.levelUp(lvl);
      else if (this.brainXp >= BRAIN_MAX && !this._readyShown) { this._readyShown = true; this.readyToEvolve(); }
    },
    levelUp: function (lvl) {
      this.brainLevel = lvl; this.C.brainLevel = lvl;
      const old = this.maxHp;
      this.stats = SP.creature.stats(this.design, { brainLevel: lvl });
      this.maxHp = this.stats.health; this.hp = Math.min(this.maxHp, this.hp + (this.maxHp - old));
      Object.assign(this.body.stats, this.stats);
      this.eco.setBrainLevel(lvl);
      const target = this.fit * Math.pow(1.12, lvl - 1);
      this.growFrom = this.curScale; this.growT = 0; this.growTo = target;
      SP.ui.banner('Brain level ' + lvl + '!', '+20 health, bigger body' + (lvl < 5 ? ', +1 pack slot, new species approach' : ', the final level!'), 3200);
      SP.ui.confetti(this.hud.over);
      SP.audio && SP.audio.sfx('levelup');
      this.particles.burst(this.body.pos.clone().addScaledVector(this.body.up, 1.2), 0xfde047, 36, 1.5);
      this.fx.ring(this.body.pos.clone().addScaledVector(this.body.up, 0.2), 0xfde047, 6, 0.9);
      this.hud.refreshAbilities();
      if (this.brainXp >= BRAIN_MAX) { this._readyShown = true; this.readyToEvolve(); }
    },
    readyToEvolve: function () {
      setTimeout(() => { if (!this.completed) { SP.ui.toast('Your brain is full! Press "Evolve" to reach the Tribal Stage', '🌟', 6000); } }, 1500);
    },
    // exploration reward: first visit to each ~40 degree zone of the planet
    explore: function () {
      const d = this.body.up, key = Math.round(d.x * 2.4) + ',' + Math.round(d.y * 2.4) + ',' + Math.round(d.z * 2.4);
      if (!this.explored.has(key)) {
        this.explored.add(key);
        if (this.explored.size > 1 && this.state === 'play') { this.reward(3, null, null); this.popupAt(this.headPos(this.player, 1.8), '🗺️ New area!', 'pop-cyan'); }
      }
    },

    // ----------------------------------------------------------------- taking damage / dying
    hurt: function (dmg, src, imp) {
      if (this.dead || this.invul > 0 || this.state === 'hatch' || this.state === 'hatched') return;
      dmg = Math.max(1, dmg);
      this.hp -= dmg; this.sinceHit = 0; this.invul = 0.35;
      this.setAction('hurt', 0.45);
      this.popupAt(this.headPos(this.player, 1.1), '-' + Math.round(dmg), 'pop-red');
      this.hud.hit(); this.shake = Math.max(this.shake, 0.35);
      SP.audio && SP.audio.sfx('hurt');
      this.particles.burst(this.headPos(this.player, 0.6), 0xf43f5e, 10, 0.9);
      if (this.social.active) this.social.stop('hurt');
      if (this.hp <= 0) this.die();
    },
    die: function () {
      if (this.dead) return;
      this.dead = true; this.deadT = 0; this.hp = 0;
      this.setAction('die', 99); this.walkTo = null; this.charge = null;
      this.hud.showDead(true, this.deathCause === 'drown' ? 'You drowned' : null);
      SP.audio && SP.audio.sfx('die');
      this.eco.setPackTarget(null);
      this.social.stop('dead');
      const nest = this.nest; nest.population = Math.max(1, nest.population - 1);
      SP.ui.toast('Your nest-mates mourn you (nest population -1)', '🪺', 3000);
      for (const a of this.eco.actors) if (a.aggro > 0 && !a.species.isPlayer) a.aggro = 0;
    },
    respawn: function () {
      this.dead = false; this.deathCause = null; this.act = null; this.anim.action = null; this.hp = this.maxHp;
      this.body.breath = this.body.breathMax; this.body.drowning = false; this.body.drownFrac = 0; this.body.submerged = 0; this.body.waterState = 'dry'; this.hunger = Math.max(this.hunger, 60); this.hud.showDead(false);
      this.target = null; this.sinceHit = 99;
      for (const a of this.eco.actors) { if (a.target === this.body || a.target === 'player') { a.target = null; if (a.state === 'attack') a.state = 'idle'; } }
      this.startHatch(false);
    },

    // ----------------------------------------------------------------- targeting / input helpers
    setTarget: function (a) {
      if (a === this.target) return;
      this.target = a || null;
      if (a) SP.audio && SP.audio.sfx('click', { vol: 0.5, pitch: 1.3 });
      if (this.social.active && this.social.actor !== a) this.social.stop('switch');
      if (a && !a.species.isPlayer) this.eco.setPackTarget(null);
    },
    candidates: function () {
      const out = [];
      for (const a of this.eco.actors) {
        if (a.state === 'dead' || !a.rig || !a.rig.root.visible) continue;
        const d = a.body.pos.distanceTo(this.body.pos); if (d > 45) continue;
        out.push({ a, d });
      }
      out.sort((x, y) => x.d - y.d);
      return out;
    },
    cycleTarget: function () {
      const c = this.candidates(); if (!c.length) { this.setTarget(null); return; }
      let i = c.findIndex((x) => x.a === this.target);
      this.setTarget(c[(i + 1) % c.length].a);
    },
    pickActor: function () {
      const m = SP.input.mouse, H = window.innerHeight;
      const ppuBase = (H / 2) / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
      let best = null, bd = 1e9;
      for (const a of this.eco.actors) {
        if (a.state === 'dead' || !a.rig || !a.rig.root.visible) continue;
        const h = (a.species.stats.height || 2) * a.scale;
        const c = a.body.pos.clone().addScaledVector(a.body.up, h * 0.5);
        const s = this.toScreen(c); if (!s) continue;
        const dist = this.camera.position.distanceTo(c);
        const rpx = Math.max(30, Math.max(a.body.radius, h * 0.5) * 1.15 * ppuBase / dist);
        const d = Math.hypot(s.x - m.x, s.y - m.y);
        if (d < rpx && d / rpx < bd) { bd = d / rpx; best = a; }
      }
      return best;
    },
    groundPick: function () {
      const ray = SP.input.ray(this.camera), o = ray.origin, d = ray.direction, pl = this.planet;
      for (let t = 1; t < 240; t += 0.8) {
        _a.copy(o).addScaledVector(d, t);
        const r = _a.length(); if (r > pl.radius + 40) continue;
        _b.copy(_a).normalize();
        const sr = Math.max(pl.surfaceRadius(_b), pl.seaRadius);
        if (r <= sr) {
          // refine
          let lo = t - 0.8, hi = t;
          for (let i = 0; i < 6; i++) { const mid = (lo + hi) / 2; _a.copy(o).addScaledVector(d, mid); _b.copy(_a).normalize(); if (_a.length() <= Math.max(pl.surfaceRadius(_b), pl.seaRadius)) hi = mid; else lo = mid; }
          _a.copy(o).addScaledVector(d, hi); _b.copy(_a).normalize();
          return _b.clone().multiplyScalar(Math.max(pl.surfaceRadius(_b), pl.seaRadius));
        }
      }
      return null;
    },
    setMode: function (m) {
      if (this.mode === m) return;
      this.mode = m;
      if (m === 'combat') this.social.stop('mode');
      if (m === 'social') this.trySocial(true);
    },
    toggleMode: function () { this.setMode(this.mode === 'social' ? 'combat' : 'social'); },
    trySocial: function (announce) {
      const a = this.target;
      if (!a) { if (announce) SP.ui.toast('Social mode: target a creature (click or Tab), then perform with 5-8', '🎵', 2400); return false; }
      if (a.species.isPlayer) { if (announce) SP.ui.toast('That is one of your own. Press G to recruit it.', '🧬', 2200); return false; }
      const why = this.social.canTalk(a);
      if (why) { if (announce) SP.ui.toast(why, '💢', 1800); return false; }
      const d = a.body.pos.distanceTo(this.body.pos);
      if (d > 13) { this.walkTo = a.body.pos.clone(); this.walkStopAt = 8; if (announce) SP.ui.toast('Getting closer...', '🚶', 1200); return false; }
      return this.social.start(a);
    },

    // ----------------------------------------------------------------- abilities
    useAbility: function (id) {
      if (this.dead || this.state !== 'play' || this.busy) return;
      if (SOCIAL.indexOf(id) >= 0) {
        if (this.mode !== 'social') { this.mode = 'social'; }
        if (!this.social.active && this.target) this.trySocial(false);
        this.social.press(id);
        return;
      }
      // combat
      if (this.mode === 'social') { this.mode = 'combat'; this.social.stop('combat'); }
      const lvl = this.abilityLevels()[id];
      if (lvl <= 0) { SP.ui.toast('Your body has no ' + SP.crHud.ABILITIES[id].name + ' part. Find one in the editor or on bone piles.', '🔒', 2400); return; }
      if (this.cd[id] > 0) return;
      this['do_' + id](lvl);
    },
    dmgMul: function (a) {
      const k = Math.pow(clamp(this.body.mass / Math.max(0.3, a.body.mass), 0.15, 8), 0.15);
      return k * (this.frenzy > 0 ? 1.5 : 1);
    },
    strikeActor: function (a, dmg, kb) {
      _a.copy(a.body.pos).sub(this.body.pos); _a.addScaledVector(this.body.up, -_a.dot(this.body.up)); if (_a.lengthSq() < 1e-6) _a.copy(this.body.heading); _a.normalize();
      const hp0 = a.hp;
      this.eco.damage(a, dmg, 'player', _a.clone().multiplyScalar(kb === undefined ? this.body.mass * 1.2 : kb));
      this.popupAt(this.headPos(a, 1.0), '-' + Math.round(dmg), 'pop-red');
      this.particles.burst(a.body.pos.clone().addScaledVector(a.body.up, a.body.radius), 0xf43f5e, 9, 0.9);
      SP.audio && SP.audio.sfx('hit');
      if (a.species.isPlayer === false) this.eco.setPackTarget(a);
      this.sinceHit = Math.min(this.sinceHit, 2);
    },
    inFront: function (a, range, cosMin) {
      _a.copy(a.body.pos).sub(this.body.pos); _a.addScaledVector(this.body.up, -_a.dot(this.body.up));
      const d = _a.length() - a.body.radius - this.body.radius * 0.5;
      if (d > range) return false;
      if (cosMin === undefined || _a.lengthSq() < 0.01) return true;
      return _a.normalize().dot(this.body.heading) >= cosMin;
    },
    bestTargetIn: function (range, cos) {
      const t = this.target;
      if (t && t.state !== 'dead' && this.inFront(t, range, undefined)) return t;
      let best = null, bd = 1e9;
      for (const a of this.eco.actors) {
        if (a.state === 'dead' || a.species.isPlayer || a.packOf) continue;
        if (!this.inFront(a, range, cos)) continue;
        const d = a.body.pos.distanceTo(this.body.pos); if (d < bd) { bd = d; best = a; }
      }
      return best;
    },
    do_bite: function (lvl) {
      this.cd.bite = 1.2;
      this.setAction('bite', 0.5); SP.audio && SP.audio.sfx('crunch', { vol: 0.5 });
      const a = this.bestTargetIn(2.5, 0.3);
      if (a) { this.faceTarget(a); this.later(0.15, () => { if (a.state !== 'dead' && !this.dead) this.strikeActor(a, (6 + 6 * lvl) * this.dmgMul(a)); }); this.setTarget(a); }
    },
    do_strike: function (lvl) {
      this.cd.strike = 5;
      this.setAction('strike', 0.55); SP.audio && SP.audio.sfx('hit', { pitch: 0.8 });
      const hits = [];
      for (const a of this.eco.actors) { if (a.state === 'dead' || a.species.isPlayer || a.packOf) continue; if (this.inFront(a, 3, 0.5)) hits.push(a); }
      this.fx.ring(this.body.pos.clone().addScaledVector(this.body.up, 0.3).addScaledVector(this.body.heading, 1.5), 0xfde68a, 3, 0.35, this.body.up);
      this.later(0.2, () => { hits.forEach((a) => { if (a.state !== 'dead' && !this.dead) this.strikeActor(a, (5 + 5 * lvl) * this.dmgMul(a)); }); });
      if (hits.length && !this.target) this.setTarget(hits[0]);
    },
    do_charge: function (lvl) {
      this.cd.charge = 8;
      const t = this.target && this.target.state !== 'dead' ? this.target : null;
      if (t && t.body.pos.distanceTo(this.body.pos) < 16) this.faceTarget(t);
      this.setAction('charge', 0.6); SP.audio && SP.audio.sfx('charge');
      const dir = this.body.heading.clone();
      SP.physics.impulse(this.body, dir.clone().multiplyScalar(44 * (this.body.stats.stability || 5)));
      this.charge = { t: 0.6, lvl, dir, hit: false };
    },
    do_spit: function (lvl) {
      this.cd.spit = 4;
      const t = this.target && this.target.state !== 'dead' ? this.target : null;
      let aim = null;
      if (t && t.body.pos.distanceTo(this.body.pos) < 15) { this.faceTarget(t); aim = t; }
      else aim = this.bestTargetIn(14, 0.85);
      this.setAction('spit', 0.65); SP.audio && SP.audio.sfx('spit');
      const start = this.headPos(this.player, 0.7).addScaledVector(this.body.heading, this.body.radius);
      const R = SP.render, m = R.cel(new THREE.SphereGeometry(0.28, 8, 6), 0x84cc16, { outline: 0.15, cast: false, material: R.toon(0x84cc16, { emissive: 0x65a30d, emissiveIntensity: 0.8 }) });
      this.scene.add(m);
      const end = aim ? null : start.clone().addScaledVector(this.body.heading, 12);
      this.dots.push({ kind: 'proj', m, t: 0, dur: 0.45, start, aim, end, lvl });
      if (aim) this.setTarget(aim);
    },

    // ----------------------------------------------------------------- archetype ability (Q)
    useArchetype: function () {
      if (this.dead || this.state !== 'play') return;
      if (this.cd.arch > 0) { SP.ui.toast(this.archetype.name + ' recharging (' + Math.ceil(this.cd.arch) + 's)', '⏳', 1200); return; }
      this.cd.arch = this.archetype.cd; const eco = this.eco, P = this.body.pos;
      this.setAction(this.archetype.id === 'roar' ? 'pose' : this.archetype.id === 'siren' ? 'sing' : 'celebrate', 1.4);
      this.hudSay(this.archetype.icon + ' ' + this.archetype.name + '!', '#fde047');
      if (this.archetype.id === 'siren') {
        SP.audio && SP.audio.sfx('sing'); this.fx.ring(P.clone().addScaledVector(this.body.up, 0.4), 0xf9a8d4, 22, 1.2);
        let n = 0;
        for (const a of eco.actors) {
          if (a.state === 'dead' || a.species.isPlayer || a.body.pos.distanceTo(P) > 28) continue;
          a.aggro = 0; eco.engage(a, true); this.calm.push({ a, t: 12 }); n++;
          if (!a.impressed && a.species.relation !== 'extinct') eco.impress(a, 14);
          this.fx.hearts(a, 2);
        }
        SP.ui.toast(n ? n + ' creatures calmed' : 'Nobody nearby to calm', '🎶', 2000);
      } else if (this.archetype.id === 'roar') {
        SP.audio && SP.audio.sfx('charge', { pitch: 0.6 }); this.shake = 0.6; this.fx.ring(P.clone().addScaledVector(this.body.up, 0.4), 0xfb7185, 22, 0.9);
        for (const a of eco.actors) {
          if (a.state === 'dead' || a.species.isPlayer || a.packOf || a.body.pos.distanceTo(P) > 22) continue;
          a.body.stunned = Math.max(a.body.stunned, a.isEpic ? 1.2 : 2.2);
          _a.copy(a.body.pos).sub(P).addScaledVector(this.body.up, 0).setLength(a.body.mass * 2.5); SP.physics.impulse(a.body, _a);
          if (!a.isEpic) { a.threat = 'player'; a.fleeT = 6; a.state = 'flee'; a.stateT = 0; }
        }
      } else {
        SP.audio && SP.audio.sfx('mate'); this.fx.ring(P.clone().addScaledVector(this.body.up, 0.4), 0x67e8f9, 10, 0.9);
        const made = eco.spawnNear('player', P, 3);
        made.forEach((a) => { eco.recruit(a); a._tempUntil = this.T + 25; this.temp.push(a); this.particles.burst(a.body.pos.clone().addScaledVector(a.body.up, 1), 0x67e8f9, 12, 1); });
        SP.ui.toast(made.length ? 'The flock answers your call! (25 s)' : 'No room for a flock here', '🐾', 2200);
      }
    },

    // ----------------------------------------------------------------- eating
    nearestFood: function () {
      const b = this.body, reach = 2.6 + b.radius, diet = this.dietOf();
      let node = this.planet.flora.nearest(b.pos, reach + 1.6, (n) => n.fruit > 0);
      let car = null, cd = reach + 0.8;
      for (const c of this.eco.carcasses) { if (c.meat <= 0) continue; const d = c.pos.distanceTo(b.pos); if (d < cd) { cd = d; car = c; } }
      // A-04: nests hold eggs, a reliable (if risky) meat source for carnivores and omnivores
      let egg = null;
      if (diet !== 'herbivore') {
        let bd = 1e9;
        for (const n of this.eco.nests) {
          if (n.isPlayer || n.population < 1.5) continue;
          const sp = this.eco.speciesById(n.speciesId); if (!sp || sp.relation === 'extinct' || sp.relation === 'allied' || !sp.arrived) continue;
          const d = n.pos.distanceTo(b.pos), lim = (0.7 + 0.4 * sp.rank) * 1.3 + 2.0 + b.radius;
          if (d < lim && d < bd) { bd = d; egg = n; }
        }
      }
      if (diet === 'carnivore' && (car || egg)) node = null;     // meat-eaters are offered meat, not the bush next to it
      const nd = node ? node.pos.distanceTo(b.pos) : 1e9;
      if (node && nd < (node.type === 'tree' ? reach + 1.4 : reach) && (!car || nd < cd)) return { kind: 'fruit', node };
      if (car) return { kind: 'meat', car };
      if (egg) return { kind: 'egg', nest: egg };
      return null;
    },
    tryEat: function () {
      const f = this.nearestFood();
      if (!f) return false;
      const diet = this.dietOf();
      if ((f.kind === 'fruit' && diet === 'carnivore') || (f.kind !== 'fruit' && diet === 'herbivore')) {
        this.eatCd = 1.2; this.setAction('hurt', 0.45); this.popupAt(this.headPos(this.player, 1.1), f.kind === 'fruit' ? '🤢 Meat-eaters can\'t digest fruit!' : '🤢 Plant-eaters can\'t digest meat!', 'pop-red');
        SP.audio && SP.audio.sfx('social_bad'); this.particles.burst(this.headPos(this.player, 0.6), 0x84cc16, 8, 0.8);
        return true;
      }
      if (this.hunger > 92) { this.eatCd = 0.6; this.popupAt(this.headPos(this.player, 1.1), 'Not hungry', 'pop-white'); return true; }
      this.eatCd = 0.85; this.setAction('eat', 0.8);
      this.faceFood(f.kind === 'fruit' ? f.node.pos : f.kind === 'egg' ? f.nest.pos : f.car.pos);
      this.pendingEat = { t: 0.4, f };
      return true;
    },
    faceFood: function (p) { _a.copy(p).sub(this.body.pos); _a.addScaledVector(this.body.up, -_a.dot(this.body.up)); if (_a.lengthSq() > 0.04) this.body.heading.copy(_a.normalize()); },
    finishEat: function (f) {
      let got = 0;
      if (f.kind === 'fruit') { if (f.node.active) got = this.planet.flora.take(f.node, 1); if (got) { this.hunger = Math.min(100, this.hunger + FRUIT_FOOD); this.popupAt(this.headPos(this.player, 1.1), '+' + FRUIT_FOOD + ' 🍓', 'pop-green'); this.particles.burst(f.node.pos.clone().addScaledVector(f.node.dir, 1.4), f.node.fruitColor || 0xf43f5e, 8, 0.8); this.reward(1, null, null); } }
      else if (f.kind === 'egg') {
        const n = f.nest;
        if (n.population >= 1) {
          got = 1; n.population = Math.max(0, n.population - 0.8);
          this.hunger = Math.min(100, this.hunger + 26); this.popupAt(this.headPos(this.player, 1.1), '+26 🥚', 'pop-green');
          this.particles.burst(n.pos.clone().addScaledVector(n.dir, 0.8), 0xfff7e0, 9, 0.8); this.reward(2, null, null);
          for (const a of this.eco.actors) if (a.nest === n && a.state !== 'dead') { a.aggro = Math.max(a.aggro, 14); a.fleeT = 0; }   // the parents defend the nest
        }
      }
      else { got = this.eco.takeMeat(f.car, 1); if (got) { this.hunger = Math.min(100, this.hunger + MEAT_FOOD * got); this.popupAt(this.headPos(this.player, 1.1), '+' + MEAT_FOOD + ' 🍖', 'pop-green'); this.particles.burst(f.car.pos.clone().addScaledVector(this.body.up, 0.8), 0xf43f5e, 9, 0.8); this.reward(2, null, null); } }
      if (got) SP.audio && SP.audio.sfx(f.kind !== 'fruit' ? 'crunch' : 'eat');
    },

    // ----------------------------------------------------------------- pack
    recruitTarget: function () {
      const a = this.target; if (!a) return;
      if (a.packOf) { SP.ui.toast('Already in your pack', '🐾', 1200); return; }
      if (!(a.species.isPlayer || a.species.relation === 'allied')) { SP.ui.toast('Only allies and nest-mates can join your pack', '🐾', 2000); return; }
      if (this.packFree() <= 0) { SP.ui.toast(this.packSlots() <= 0 ? 'Grow your brain to unlock pack slots' : 'Your pack is full', '🐾', 2000); return; }
      if (this.eco.recruit(a)) {
        this.pack.push(a); this.fx.hearts(a, 4);
        SP.ui.toast(a.species.name + ' joined your pack!', '🐾', 2200); SP.audio && SP.audio.sfx('coin');
      }
    },
    dismiss: function (a) {
      this.eco.dismiss(a); const i = this.pack.indexOf(a); if (i >= 0) this.pack.splice(i, 1);
      SP.ui.toast(a.species.name + ' left your pack', '👋', 1500);
    },
    updatePack: function (dt) {
      const eco = this.eco;
      for (let i = this.pack.length - 1; i >= 0; i--) {
        const a = this.pack[i];
        if (a.state === 'dead') { SP.ui.toast('A pack member fell!', '💔', 2200); this.pack.splice(i, 1); }
        else if (!a.packOf || eco.actors.indexOf(a) < 0) this.pack.splice(i, 1);
      }
      for (let i = this.temp.length - 1; i >= 0; i--) {
        const a = this.temp[i];
        if (a.state === 'dead' || eco.actors.indexOf(a) < 0) { this.temp.splice(i, 1); continue; }
        if (this.T > a._tempUntil) { this.particles.burst(a.body.pos.clone().addScaledVector(a.body.up, 1), 0x67e8f9, 10, 1); eco.dismiss(a); eco.despawn(a); this.temp.splice(i, 1); }
      }
      for (let i = this.calm.length - 1; i >= 0; i--) {
        const c = this.calm[i]; c.t -= dt;
        if (c.t <= 0 || c.a.state === 'dead') { this.calm.splice(i, 1); eco.engage(c.a, false); continue; }
        c.a.aggro = 0; if (c.a.socialT < 1.5) eco.engage(c.a, true);
      }
    },
    // social gesture: you and your pack perform together
    perform: function (ab) {
      this.setAction(ab, 0.8);
      SP.audio && SP.audio.sfx(ab, { vol: 0.6 });
      this.fx.notes(this.player, ab);
      const all = this.pack.concat(this.temp);
      for (const m of all) if (m.state !== 'dead' && m.body.pos.distanceTo(this.body.pos) < 16) { m.anim.action = ab; m.anim.actionT = 0; m.actionDur = 0.8; }
    },

    // ----------------------------------------------------------------- mating call / editor
    openMating: function (first) {
      if (this.busy || this.dead) return Promise.resolve();
      this.busy = true; this.social.stop('editor'); this.walkTo = null;
      const C = this.C;
      const q = SP.game.openEditor({
        mode: 'creature', design: C.design, budget: C.dna, currency: 'DNA', unlocked: C.unlocked, allowCancel: true,
        title: first ? 'Your species grows legs!' : 'Mating call: evolve your species', brainLevel: this.brainLevel
      });
      return q.then((res) => {
        this.busy = false;
        if (first) { C.creatureEditorDone = true; }
        if (res && res.design) this.applyDesign(res.design, res.spent || 0);
        else if (first) this.startHatch(true);
        else if (this.state === 'editor') this.state = 'play';
      });
    },
    applyDesign: function (design, spent) {
      const C = this.C;
      C.dna = Math.max(0, C.dna - spent);
      this.design = design; C.design = design; C.speciesName = design.name || C.speciesName;
      const frac = this.maxHp > 0 ? this.hp / this.maxHp : 1;
      this.buildPlayer();
      this.hp = Math.max(1, this.maxHp * Math.max(frac, 0.6));
      this.eco.setPlayerDesign(design);
      const ownKept = this.pack.filter((a) => a.species.isPlayer).length;      // A-09: they are re-hatched as the new design below
      this.pack = this.pack.filter((a) => !a.species.isPlayer); this.temp = [];
      this.hud.refreshAbilities();
      this.target = null;
      this.startHatch(!C.creatureEditorDone || this.startEditor);
      this.startEditor = false;
      if (ownKept > 0) {
        const made = this.eco.spawnNear('player', this.body.pos, Math.min(ownKept, Math.max(0, this.packFree())));
        made.forEach((a) => { if (this.eco.recruit(a)) this.pack.push(a); });
      }
      SP.ui.toast('You hatch as a new design! Nest-mates will follow your lead.', '🥚', 3200);
      SP.audio && SP.audio.sfx('mate');
    },

    // ----------------------------------------------------------------- evolve
    evolve: function () {
      if (this.completed || this.brainXp < BRAIN_MAX) return;
      this.completed = true;
      const C = this.C, eco = this.eco;
      let allies = 0, ext = 0;
      eco.species.forEach((s) => { if (s.relation === 'allied') allies++; else if (s.relation === 'extinct') ext++; });
      let card = 'adaptable';
      if (allies > 0 && allies >= 2 * ext) card = 'social';
      else if (ext > 0 && ext >= 2 * allies) card = 'predator';
      C.eco = eco.serialize(); C.homeDir = [+this.nest.dir.x.toFixed(4), +this.nest.dir.y.toFixed(4), +this.nest.dir.z.toFixed(4)];
      C.design = this.design; C.brainLevel = 5; C.stats.allies = allies; C.stats.extinctions = ext;
      C.creature = this.serialize();
      const found = eco.bonePiles.filter((b) => b.found).length;
      const lines = [
        '🤝 Species allied: <b>' + allies + '</b>   💀 Species driven extinct: <b>' + ext + '</b>',
        '⚔️ Creatures defeated: <b>' + C.stats.kills + '</b>   🦴 Bone piles found: <b>' + found + '/' + eco.bonePiles.length + '</b>',
        '🧠 Brain fully grown. Parts unlocked: <b>' + C.unlocked.length + '</b>   🧬 DNA left: <b>' + Math.floor(C.dna) + '</b>',
        card === 'social' ? 'Your friendly ways made you a diplomat: <b>Serenade</b> awaits (instant befriend chance).' : card === 'predator' ? 'Your hunting made you a feared apex: <b>Frenzy</b> awaits (+50% damage).' : 'You are versatile and balanced: <b>Second Wind</b> awaits (heal 50%).',
        '🛖 Your sapient species gathers into tribes around the old nest...'
      ];
      SP.game.completeStage(card, lines);
    },

    // ----------------------------------------------------------------- update
    update: function (dt, t) {
      if (this.startEditor && this.state === 'editor' && !this.busy) { this.openMating(true); return; }
      if (this.state === 'editor') return;
      this.T += dt;
      const b = this.body, planet = this.planet, I = SP.input, sky = this.sky, eco = this.eco;
      const down = (c) => I.isDown(c), pr = (c) => I.pressed(c);
      if (!this.rig) return;

      // ---- timers
      for (const k in this.cd) if (this.cd[k] > 0) this.cd[k] = Math.max(0, this.cd[k] - dt);
      this.eatCd = Math.max(0, this.eatCd - dt); this.invul = Math.max(0, this.invul - dt); this.sinceHit += dt; this.frenzy = Math.max(0, this.frenzy - dt);
      this.shake = Math.max(0, this.shake - dt * 1.6); this.raidFlash = Math.max(0, this.raidFlash - dt);
      if (this.boomArea) this.boomArea.t -= dt;

      if (this._later) for (let i = this._later.length - 1; i >= 0; i--) { const q = this._later[i]; q.t -= dt; if (q.t <= 0) { this._later.splice(i, 1); q.fn(); } }
      // ---- state machines
      if (this.state === 'hatch' || this.state === 'hatched') this.updateHatch(dt);
      if (this.dead) { this.deadT += dt; if (this.deadT > 2.8) this.respawn(); }

      // ---- player control
      const canAct = this.state === 'play' && !this.dead && !this.busy;
      const ctrl = this._ctrl || (this._ctrl = { move: null, sprint: false, sneak: false, jump: false });
      ctrl.move = null; ctrl.sprint = false; ctrl.sneak = false; ctrl.jump = false;
      const modal = SP.ui.modalCount() > 0;
      if (canAct && !modal) {
        const fwd = this.cam.forwardOnSurface(), right = this.cam.rightOnSurface();
        const mv = _c.set(0, 0, 0);
        if (down('KeyW') || down('ArrowUp')) mv.add(fwd);
        if (down('KeyS') || down('ArrowDown')) mv.sub(fwd);
        if (down('KeyD') || down('ArrowRight')) mv.add(right);
        if (down('KeyA') || down('ArrowLeft')) mv.sub(right);
        let manual = mv.lengthSq() > 0;
        if (manual) { mv.normalize(); this.walkTo = null; }
        else if (this.walkTo) {
          _d.copy(this.walkTo).sub(b.pos); _d.addScaledVector(b.up, -_d.dot(b.up));
          const dist = _d.length(), stop = this.walkStopAt || 1.1;
          if (dist < stop) { this.walkTo = null; this.walkStopAt = 0; }
          else {
            mv.copy(_d).normalize();
            // click-to-walk goes round lakes the body cannot enter (shoreline following), instead of stalling at the water's edge
            if (b.stats.waterClass && b.stats.waterClass !== 'swimmer' && SP.physics.pathAroundWater) { const pd = SP.physics.pathAroundWater(b, this.planet, this.walkTo, _d2); if (pd) mv.copy(pd); }
            // obstacle whiskers: steer round trunks/rocks (and dense clusters) instead of pushing into them; a goal inside a cluster is reached as far as possible, then dropped
            if (SP.physics.steerAround && dist > 1.5) { SP.physics.steerAround(b, planet, mv, _d2, { goal: this.walkTo }); mv.copy(_d2); const sa = b._sa; this._wjam = (sa && sa.blocked && b.speed < 0.6) ? (this._wjam || 0) + dt : 0; if (this._wjam > 1.5) { this.walkTo = null; this._wjam = 0; } }
            mv.multiplyScalar(dist > 4 ? 1 : 0.6); manual = true;
          }
        }
        if (manual) ctrl.move = mv;
        ctrl.sprint = down('ShiftLeft') || down('ShiftRight');
        ctrl.sneak = down('KeyC') || down('ControlLeft');
        ctrl.jump = down('Space');
        if (this.eatT > 0 || this.act === 'eat') ctrl.move = ctrl.move ? ctrl.move.multiplyScalar(0.25) : null;
        // abilities
        for (let i = 0; i < 8; i++) if (pr('Digit' + (i + 1)) || pr('Numpad' + (i + 1))) this.useAbility(i < 4 ? COMBAT[i] : SOCIAL[i - 4]);
        if (pr('KeyF')) this.toggleMode();
        if (pr('KeyQ')) this.useArchetype();
        if (pr('KeyG')) this.recruitTarget();
        if (pr('Tab')) this.cycleTarget();
        if (pr('KeyM')) this.tryMate();
        if (pr('KeyE') || (down('KeyE') && this.eatCd <= 0 && !this.nearNest(true))) {
          if (this.eatCd <= 0) { if (!this.tryEat() && pr('KeyE')) { if (this.nearNest()) this.tryMate(); else if (this.target && (this.target.species.isPlayer || this.target.species.relation === 'allied') && !this.target.packOf) this.recruitTarget(); else this.popupAt(this.headPos(this.player, 1.2), 'Nothing to eat here', 'pop-white'); } }
        }
        // mouse
        if (I.mouse.clicked && !I.pointerOverUI()) {
          const a = this.pickActor();
          if (a) { this.setTarget(a); if (this.mode === 'social') this.trySocial(false); }
          else {
            const g = this.groundPick();
            if (g) { this.walkTo = g; this.walkStopAt = 0; this.walkRing.position.copy(g).addScaledVector(g.clone().normalize(), 0.15); this.walkRing.quaternion.setFromUnitVectors(new V3(0, 0, 1), g.clone().normalize()); this.walkRing.visible = true; }
          }
        }
      }
      // pending bite/eat
      if (this.pendingEat) { this.pendingEat.t -= dt; if (this.pendingEat.t <= 0) { this.finishEat(this.pendingEat.f); this.pendingEat = null; } }

      // ---- charge dash
      if (this.charge) {
        const ch = this.charge; ch.t -= dt;
        for (const a of eco.actors) {
          if (ch.hit || a.state === 'dead' || a.species.isPlayer || a.packOf) continue;
          if (a.body.pos.distanceTo(b.pos) < a.body.radius + b.radius + 0.7) {
            ch.hit = true;
            a.body.stunned = Math.max(a.body.stunned, 1 + 0.3 * ch.lvl);
            this.strikeActor(a, (4 + 4 * ch.lvl) * this.dmgMul(a), b.mass * 18);
            this.shake = Math.max(this.shake, 0.3); this.setTarget(a);
            b.knock.multiplyScalar(0.2);
          }
        }
        if (ch.t <= 0 || ch.hit) this.charge = null;
      }

      // ---- physics
      if (!this.dead && (this.state === 'play' || this.state === 'hatched')) SP.physics.step(b, planet, ctrl, dt);
      else if (this.dead) SP.physics.step(b, planet, { move: null }, dt);
      sky.update(dt, b.pos);
      planet.update(dt, this.T, b.pos);
      eco.update(dt, b.pos, sky.timeOfDay);
      { const bodies = [b]; for (const a of eco.actors) bodies.push(a.body); SP.physics.collideAll(bodies, dt); }
      this.updateWater(dt);
      if (b._landImpact) { this.particles.burst(b.pos.clone().addScaledVector(b.up, 0.1), 0xd6d3d1, 8, 0.7, { flat: true, size: 0.22, life: 0.5 }); b._landImpact = 0; }

      // ---- survival: hunger, regen
      if (this.state === 'play' && !this.dead) {
        this.hunger = Math.max(0, this.hunger - dt / 3);
        if (this.hunger <= 0) { this.hp -= 1.2 * dt; if (Math.random() < dt * 0.4) this.popupAt(this.headPos(this.player, 1.2), 'Starving!', 'pop-red'); if (this.hp <= 0) this.die(); }
        else if (this.sinceHit > 6 && this.hunger > 25 && this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + dt * (this.maxHp * 0.02) * (this.nearNest(true) ? 3 : 1));
        if (this.nearNest(true) && this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + dt * 3);
        this.explore();
      }

      // ---- growth animation
      if (this.growT !== undefined && this.growT < 1) {
        this.growT = Math.min(1, this.growT + dt / 1.6);
        this.curScale = this.growFrom + (this.growTo - this.growFrom) * EASE(this.growT);
        if (this.state === 'play') this.rig.setScale(this.curScale);
        const gs = this.curScale / this.fit, gs3 = gs * gs * gs; b.radius = this.stats.radius * this.curScale; b.scale = this.curScale; b.mass = this.stats.mass * gs3;
        b.stats.mass = b.mass; b.stats.stability = this.stats.stability * gs3; // C-20
      }

      // ---- animation
      this.animatePlayer(dt);

      // ---- dots (spit projectiles, poison), rings
      this.updateDots(dt);
      this.updateRings(dt);
      this.updatePack(dt);
      this.social.update(dt);
      if (this.target) {
        const a = this.target;
        if (a.state === 'dead' || eco.actors.indexOf(a) < 0 || a.body.pos.distanceTo(b.pos) > 70) this.setTarget(null);
      }
      if (this.mode === 'combat' && this.target && this.target.state !== 'dead') {
        // pack fights what you fight
        if (!this.target.species.isPlayer && this.target.species.relation !== 'allied' && (this.target.aggro > 0 || this.target.state === 'attack' || this.target.species.relation === 'hostile')) eco.setPackTarget(this.target);
      }
      this.updateMarkers(dt);
      this.updateCamera(dt);
      this.particles.update(dt);
      this.hud.update(dt);
      this.hud.drawMinimap(dt);
      this.updateHint();
      this.tutorial(dt);
    },

    // ---- water (DESIGN 3.6): drowning damage, FX, HUD
    updateWater: function (dt) {
      const b = this.body, eco = this.eco;
      if (b.drownFrac > 0) {
        const f = b.drownFrac; b.drownFrac = 0;
        if (this.state === 'play' && !this.dead && !this.busy) {
          this.hp -= f * this.maxHp; this.sinceHit = 0;
          this._drownT = (this._drownT || 0) - dt;
          if (this._drownT <= 0) {
            this._drownT = 0.9; this.hud.hit(); this.shake = Math.max(this.shake, 0.25);
            this.popupAt(this.headPos(this.player, 1.2), 'Drowning!', 'pop-red');
            SP.audio && SP.audio.sfx('hurt', { vol: 0.5, pitch: 0.8 });
          }
          if (this.hp <= 0) { this.deathCause = 'drown'; this.hp = 0; this.die(); }
        }
      }
      const list = [b];
      for (const a of eco.actors) if (a.state !== 'dead' && a.drawn !== false && a.body.waterState !== 'dry' && a.body.pos.distanceToSquared(b.pos) < 2500) list.push(a.body);
      this.waterFx.update(dt, list);
      this.waterHud.update(dt, b, { planet: this.planet, fwd: this.cam.forwardOnSurface(), right: this.cam.rightOnSurface(), hide: this.dead || this.state !== 'play' });
    },

    nearNest: function (healing) { return this.nest && this.body.pos.distanceTo(this.nest.pos) < (healing ? 7 : 11); },
    tryMate: function () {
      if (!this.nearNest()) { SP.ui.toast('Go to your nest to call a mate (M)', '🪺', 2000); return; }
      this.openMating(false);
    },

    animatePlayer: function (dt) {
      const b = this.body, an = this.anim;
      an.speed = b.speed; an.turn = b._turnRate || 0; an.airborne = b.airborne && !b.inWater; an.inWater = b.inWater;
      an.waterState = b.waterState; an.submerged = b.submerged; an.drowning = b.drowning && !this.dead;
      if (this.act) {
        an.actionT += dt;
        if (this.act !== 'die' && an.actionT > this.actDur) { this.act = null; an.action = null; }
      }
      if (!this.act) {
        let a = null;
        if (b.sneaking && !b.inWater) a = 'sneak';
        else if (an.airborne) { a = (this.stats.glide > 0 && SP.input.isDown('Space') && b._vr < 0) ? 'glide' : 'jump'; }
        else if (b.inWater) a = 'swim';
        if (a !== an.action) { an.action = a; an.actionT = 0; } else if (a) an.actionT += dt;
      }
      const tg = this.target;
      an.lookAt = (tg && tg.state !== 'dead' && tg.body.pos.distanceTo(b.pos) < 26) ? this.headPos(tg, 0.8) : undefined;
      if (this.state !== 'hatch') SP.surf.orient(this.rig.root, b.pos, b.heading);
      if (this.state === 'play' || this.state === 'hatched') SP.creature.animate(this.rig, dt, an);
    },

    updateDots: function (dt) {
      for (let i = this.dots.length - 1; i >= 0; i--) {
        const d = this.dots[i];
        if (d.kind === 'proj') {
          d.t += dt; const k = Math.min(1, d.t / d.dur);
          const tp = d.aim && d.aim.state !== 'dead' ? this.headPos(d.aim, 0.5) : (d.end || d.start);
          d.m.position.lerpVectors(d.start, tp, k).addScaledVector(this.body.up, Math.sin(k * Math.PI) * 1.6);
          if (k >= 1) {
            this.scene.remove(d.m); this.dots.splice(i, 1);
            this.particles.burst(tp, 0x84cc16, 10, 0.8);
            // splash: poison the target (or whoever is near the landing point)
            let victim = d.aim && d.aim.state !== 'dead' ? d.aim : null;
            if (!victim) { let bd = 3; for (const a of this.eco.actors) { if (a.state === 'dead' || a.species.isPlayer || a.packOf) continue; const dd = a.body.pos.distanceTo(tp); if (dd < bd + a.body.radius) { bd = dd; victim = a; } } }
            if (victim) { this.dots.push({ kind: 'poison', a: victim, left: 3, tick: 0, per: (3 * d.lvl) / 6 * this.dmgMul(victim) }); this.popupAt(this.headPos(victim, 1.0), 'Poisoned!', 'pop-green'); this.eco.damage(victim, 0.01, 'player'); this.eco.setPackTarget(victim); }
          }
        } else if (d.kind === 'poison') {
          d.left -= dt; d.tick -= dt;
          if (d.a.state === 'dead') { this.dots.splice(i, 1); continue; }
          if (d.tick <= 0) { d.tick = 0.5; this.eco.damage(d.a, d.per, 'player'); this.popupAt(this.headPos(d.a, 1.0), '-' + d.per.toFixed(1), 'pop-green'); this.particles.burst(this.headPos(d.a, 0.7), 0x84cc16, 3, 0.4); }
          if (d.left <= 0) this.dots.splice(i, 1);
        }
      }
    },
    updateRings: function (dt) {
      for (let i = this.rings.length - 1; i >= 0; i--) {
        const r = this.rings[i]; r.t += dt; const k = r.t / r.dur;
        if (k >= 1) { this.scene.remove(r.m); r.m.geometry.dispose(); r.m.material.dispose(); this.rings.splice(i, 1); continue; }
        r.m.scale.setScalar(0.3 + r.maxR * EASE(k)); r.m.material.opacity = 0.9 * (1 - k);
      }
    },
    updateMarkers: function (dt) {
      const tg = this.target, ring = this.targetRing;
      if (tg && tg.state !== 'dead' && tg.rig) {
        ring.visible = true;
        const sp = tg.species, col = sp.isPlayer || sp.relation === 'allied' ? 0x4ade80 : (tg.aggro > 0 || sp.relation === 'hostile' || tg.state === 'attack') ? 0xf43f5e : this.social.active && this.social.actor === tg ? 0xf9a8d4 : 0xfde047;
        ring.material = SP.render.toon(col, { emissive: col, emissiveIntensity: 0.7 });
        const p = tg.body.pos.clone().addScaledVector(tg.body.up, 0.15);
        ring.position.copy(p); ring.quaternion.setFromUnitVectors(new V3(0, 0, 1), tg.body.up);
        const s = (tg.body.radius + 0.5) * (1 + Math.sin(this.T * 5) * 0.05); ring.scale.set(s, s, s);
      } else ring.visible = false;
      if (this.walkTo) { this.walkRing.visible = true; this.walkRing.position.copy(this.walkTo).addScaledVector(this.walkTo.clone().normalize(), 0.15); this.walkRing.scale.setScalar(1 + Math.sin(this.T * 8) * 0.12); } else this.walkRing.visible = false;
      if (this.safeRing.visible) {
        const n = this.nest; this.safeRing.position.copy(n.pos).addScaledVector(n.dir, 0.3); this.safeRing.quaternion.setFromUnitVectors(new V3(0, 0, 1), n.dir);
        this.safeRing.material.opacity = 0.45 + 0.3 * Math.sin(this.T * 5);
      }
    },

    updateCamera: function (dt) {
      const cam = this.cam, b = this.body;
      cam.target.copy(b.pos); cam.up.copy(b.up);
      cam.lookHeight = 1.0 + this.stats.height * 0.35 * this.curScale;
      if (this.state === 'hatch' || this.state === 'hatched') { cam.distance = Math.min(cam.distance, 11); }
      cam.update(dt);
      // ---- the home nest's flag pole fades away when it stands between the camera and the player (A-05)
      { const n = this.nest;
        if (n && n.pole) {
          const cp = this.camera.position, pp = _c.copy(b.pos).addScaledVector(b.up, 1.0);
          _d.copy(pp).sub(cp); const L = _d.length() || 1; _d.divideScalar(L);
          _e.copy(n.pos).addScaledVector(n.dir, 1.9).sub(cp);                 // pole middle
          const t = clamp(_e.dot(_d), 0, L), dist = _e.addScaledVector(_d, -t).length();
          const hide = t < L - 0.3 && dist < 2.1 + 0.2 * this.stats.height;
          n.pole.visible = n.flag.visible = !hide;
        } }
      // ---- keep the camera out of tree canopies and the ground
      const c = this.camera, look = _a.copy(cam._pos).addScaledVector(cam._up, cam.lookHeight);
      const dv = _b.copy(c.position).sub(look), D = dv.length();
      if (D > 0.01) {
        dv.divideScalar(D);
        let allowed = D, hard = D;
        const planet = this.planet;
        for (let k = 1; k <= 12 && allowed >= D; k++) {
          const tt = D * k / 12;
          _c.copy(look).addScaledVector(dv, tt);
          SP.physics.eachStatic(planet, _c, (col) => {
            if (allowed < tt) return;
            let tree = false, sc = 1;
            if (col.node) { if (!col.node.active || col.node.type !== 'tree') return; tree = true; sc = col.node.scale * (0.5 + 0.5 * col.node.size) * 0.95; }
            else if (col.h > 40 && col.r > 0.3) { tree = true; sc = col.r / 0.43; }
            else return;
            if (!tree) return;
            _d.set(col.x, col.y, col.z); _e.copy(_d).normalize();
            { // trunk: distance from the sample to the trunk segment
              const hh = _c.x * 0 + (_c.clone().sub(_d).dot(_e)); const hc = clamp(hh, 0, 3.2 * sc);
              const tr = _c.clone().sub(_d).addScaledVector(_e, -hc).length();
              if (tr < 0.2 * sc + 0.6 && look.distanceTo(_d) > 1.6) { allowed = tt; hard = Math.min(hard, tt); return; }
            }
            _d.addScaledVector(_e, 3.7 * sc);
            const rad = 1.3 * sc + 0.45; if (_c.distanceTo(_d) < rad && look.distanceTo(_d) > rad + 0.6) allowed = tt;
          });
        }
        const minD = Math.max(3.2, D * 0.42);
        const want = clamp(Math.min(allowed, Math.max(hard, 0)) / D, Math.min(hard < D ? 3.6 : minD, minD) / D, 1);
        if (want < this.camK) this.camK = want; else this.camK = Math.min(want, this.camK + dt * 1.8 * (1 / D) * 8);
        if (this.camK < 1) c.position.copy(look).addScaledVector(dv, D * this.camK);
        // ground clearance
        _c.copy(c.position); const r = _c.length(), sr = Math.max(planet.surfaceRadius(_c.normalize()), planet.seaRadius);
        if (r < sr + 1.0) { c.position.copy(_c).multiplyScalar(sr + 1.0); }
        c.lookAt(look);
      }
      if (this.shake > 0.001) {
        const s = this.shake * 0.35;
        c.position.x += (Math.random() - 0.5) * s; c.position.y += (Math.random() - 0.5) * s; c.position.z += (Math.random() - 0.5) * s;
      }
    },

    updateHint: function () {
      if (this.dead || this.state !== 'play') { this.hud.setHint(''); return; }
      let h = '';
      const f = this.nearestFood(), diet = this.dietOf();
      if (this.social.active) h = '';
      else if (f) {
        const ok = !((f.kind === 'fruit' && diet === 'carnivore') || (f.kind !== 'fruit' && diet === 'herbivore'));
        h = ok ? '<kbd class="kbd">E</kbd> Eat ' + (f.kind === 'fruit' ? '🍓 fruit' : f.kind === 'egg' ? '🥚 an egg (the parents will defend it!)' : '🍖 meat') : (f.kind === 'fruit' ? '🚫 You can\'t digest fruit' : '🚫 You can\'t digest meat');
      } else if (this.nearNest()) h = '<kbd class="kbd">M</kbd> Mating call: redesign your species 🥚';
      else if (this.target && (this.target.species.isPlayer || this.target.species.relation === 'allied') && !this.target.packOf && this.packFree() > 0 && this.target.body.pos.distanceTo(this.body.pos) < 16) h = '<kbd class="kbd">G</kbd> Recruit ' + this.target.species.name + ' into your pack';
      else if (this.brainXp >= BRAIN_MAX) h = '🌟 Your brain is full! Evolve whenever you are ready';
      this.hud.setHint(h);
    },
    tutorial: function (dt) {
      this.tutT += dt;
      const steps = this._tut || (this._tut = [[2.5, 'Welcome to the wild! WASD to move, right-drag to look around.', '🌍'], [11, 'Eat fruit (E) and meet creatures: click one, press F, then play along with the beat!', '🍓'], [26, 'Press M at your nest to redesign your species with the DNA you collect.', '🥚']]);
      for (const s of steps) if (this.tutT > s[0] && !s.done && this.state === 'play') { s.done = true; if (!this.res) SP.ui.toast(s[1], s[2], 4600); }
    },

    // ----------------------------------------------------------------- save / lifecycle
    serialize: function () {
      if (!this.eco || !this.body) return undefined;
      const b = this.body;
      return {
        v: 1, eco: this.eco.serialize(), pos: [b.pos.x, b.pos.y, b.pos.z], hd: [b.heading.x, b.heading.y, b.heading.z], hp: this.hp, hunger: this.hunger,
        brainXp: this.brainXp, explored: Array.from(this.explored), sky: this.sky.phase
      };
    },
    pause: function () { this.paused = true; },
    resume: function () { this.paused = false; },
    exit: function () {
      try { this.social && this.social.dispose(); } catch (e) { console.error(e); }
      const eco = this.eco;
      if (eco) {
        for (const a of eco.actors) { if (a.rig && a.rig.dispose) { try { a.rig.dispose(); } catch (e) { } } }
        for (const c of eco.carcasses) { if (c.rig && c.rig.dispose) { try { c.rig.dispose(); } catch (e) { } } }
        for (const sp of eco.species.concat([eco.playerSpecies])) { if (sp._pool) { sp._pool.forEach((r) => r.dispose && r.dispose()); sp._pool.length = 0; } }
        eco.actors.length = 0; eco.carcasses.length = 0;
        SP.render.disposeTree(eco.group); // C-06: nests, bone piles, carcasses, props live under eco.group and would be unreachable after the remove below
        if (eco.group.parent) eco.group.parent.remove(eco.group);
      }
      if (this.rig && this.rig.dispose) this.rig.dispose();
      if (this.particles) this.particles.dispose();
      if (this.waterHud) this.waterHud.dispose();
      if (this.waterFx) this.waterFx.dispose();
      this.waterHud = this.waterFx = null;
      if (this.hud) this.hud.dispose();
      if (this.sky && this.sky.dispose) this.sky.dispose();
      if (this.cam && this.cam.dispose) this.cam.dispose(); // C-07
      if (this.scene) SP.render.disposeTree(this.scene);
      if (this.planet && this.planet.dispose) this.planet.dispose();
      this.eco = null; this.planet = null; this.rig = null; this.body = null; this.scene = null; this.hud = null; this.social = null; this.pack = []; this.temp = [];
      SP.ui.clearPopups();
    }
  };
  if (SP.game && SP.game.registerStage) SP.game.registerStage(S);
})();
