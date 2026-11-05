/* SP.stages.space — Stage 5: Space (DESIGN §9).
   Core: state, economy, galaxy map view, view transitions, HUD, missions, diplomacy, save.
   Helpers (installed onto this object): space_galaxy.js (data + galaxy visuals), space_ui.js (dialogs),
   space_sys.js (solar-system view, flight, combat), space_orbit.js (planet orbit, colonies, terraforming). */
(function () {
  'use strict';
  const SP = window.SP = window.SP || {};
  SP.stages = SP.stages || {};
  const U = SP.util, V3 = THREE.Vector3, clamp = U.clamp;
  const G = function () { return SP.spaceGalaxy; }, X = function () { return SP.spaceUI; };
  const hex = function (n) { return '#' + ('000000' + n.toString(16)).slice(-6); };

  const ARCH = {
    warrior: { name: 'Warrior', icon: '⚔️', ab: 'Battle Frenzy', abIcon: '💢', desc: 'Double weapon damage and faster fire for 10 s.', cd: 35, passive: '+20% laser damage' },
    trader: { name: 'Trader', icon: '💼', ab: 'Market Surge', abIcon: '📈', desc: '+50% spice prices and friendlier empires for 40 s.', cd: 50, passive: '+10% spice prices' },
    zealot: { name: 'Zealot', icon: '🔮', ab: 'Black Cloud', abIcon: '☁️', desc: 'Enemies in the system calm down for 12 s; nearby empires like you more.', cd: 45, passive: 'Empires start friendlier' },
    wanderer: { name: 'Wanderer', icon: '🧭', ab: 'Second Wind', abIcon: '🌬️', desc: 'Restore 50% hull and 40% energy; your next jump is 30% cheaper.', cd: 40, passive: '+25% max energy' }
  };
  const CARD_MAP = {
    cell: { herbivore: 'zealot', carnivore: 'warrior', omnivore: 'wanderer' },
    creature: { social: 'zealot', predator: 'warrior', adaptable: 'wanderer' },
    tribal: { friendly: 'zealot', aggressive: 'warrior', industrious: 'trader' },
    civ: { religious: 'zealot', economic: 'trader', military: 'warrior' }
  };
  const CARD_W = { cell: 1, creature: 1, tribal: 1.2, civ: 1.5 };
  function archetypeOf(cards) {
    const sc = { warrior: 0, trader: 0, zealot: 0, wanderer: 0.1 };
    Object.keys(CARD_MAP).forEach(function (k) { const a = cards && CARD_MAP[k][cards[k]]; if (a) sc[a] += CARD_W[k]; });
    let best = 'wanderer'; Object.keys(sc).forEach(function (a) { if (sc[a] > sc[best]) best = a; });
    return best;
  }

  const S = SP.stages.space = {
    id: 'space', title: 'Space Stage', next: null, scene: null, camera: null,
    ARCH: ARCH, view: 'none',

    // ================================================================== enter / exit
    enter: function (campaign, opts) {
      opts = opts || {};
      const R = SP.render, self = this;
      X().injectCss();
      this.campaign = campaign; this.t = 0; this.dead = false; this.hudT = 0; this._unsub = [];
      const scene = this.scene = new THREE.Scene(); scene.background = new THREE.Color(0x05070d);
      const camera = this.camera = new THREE.PerspectiveCamera(55, 1, 0.5, 6000); camera.position.set(0, 90, 120);
      this._unResize = R.onResize(function (w, h) { camera.aspect = w / h; camera.updateProjectionMatrix(); });
      this.baseFov = 55; this.fovMul = 1;
      // lights
      this.ambient = new THREE.AmbientLight(0x8a96c0, 0.4); this.starLight = new THREE.PointLight(0xfff3d6, 0.4, 0, 0); this.sunDir = new THREE.DirectionalLight(0xfff3d6, 0.5); this.rimLight = new THREE.DirectionalLight(0x38bdf8, 0.11);
      this.sunDir.position.set(60, 40, 50); this.rimLight.position.set(-50, 10, -40); this.sunDir.visible = false;
      scene.add(this.ambient, this.starLight, this.sunDir, this.rimLight);
      // galaxy + state
      this.gal = G().generate(campaign.seed, campaign);
      const saved = campaign.space && campaign.space.v === 1 ? campaign.space : null;
      this.st = saved ? this.restore(saved) : this.newState(campaign);
      this.arch = ARCH[this.st.arch] || ARCH.wanderer; this.recalcShip();
      this.backdrop = G().createBackdrop(); scene.add(this.backdrop.group);
      this.galView = G().createView(this.gal); scene.add(this.galView.group); this.galView.group.visible = false;
      this.fx = R.particles(scene, 700);
      this.pins = {};
      this.initShip(); this.initCombat(); this.initOrbitCommon();
      this.sel = null; this.hover = null; this.trans = null; this.timers = { pirate: 140, war: 200, colony: 0, sec: 0 };
      this.gc = { target: new V3(), yaw: 0.4, pitch: 0.9, dist: 190, tt: new V3(), td: 190 };
      this.buildHud();
      this._unsub.push(SP.input.on('mousedown', function (e) { self._pressWorld = !!(e.target && e.target.tagName === 'CANVAS'); }));
      this._unsub.push(SP.input.on('keydown', function (e) { self.onKey(e); }));
      this.refreshOwnership();
      SP.ui.help([
        '<b>Goal:</b> reach the galactic core and find the Staff of Life. Grox guard it!',
        '<kbd class="kbd">Wheel</kbd> zoom between <b>Galaxy → Solar system → Planet orbit</b>; <kbd class="kbd">G</kbd> galaxy map, <kbd class="kbd">E</kbd> orbit nearest planet',
        'Galaxy: drag to rotate, right-drag or <kbd class="kbd">WASD</kbd> to pan, click a star then <b>Jump</b>. Energy cost grows with distance and is limited by drive range.',
        'System: <kbd class="kbd">W</kbd> thrust <kbd class="kbd">A/D</kbd> turn <kbd class="kbd">Shift</kbd> boost; click a planet to fly there; <b>click / hold mouse or Space</b> to fire lasers.',
        'Scan planets (T-score, spice, life). Colonise with a Colony Pack, terraform with atmosphere / temperature tools, collect and <b>sell spice</b> to empires.',
        'Contact empires (📡 Hail): trade, missions, alliances. Allies can give a <b>Wormhole Key</b> (3 black holes skip you to the core).',
        '<kbd class="kbd">Q</kbd> archetype ability: <b>' + this.arch.ab + '</b> (' + this.arch.desc + ')', '<kbd class="kbd">B</kbd> market, <kbd class="kbd">V</kbd> ship editor, pirates raid colonies. Defend them!'
      ]);
      if (SP.audio) SP.audio.music('space');
      // start in the system view at the current star (or galaxy for a fresh game overview)
      this.applyView(this.st.view === 'orbit' && this.st.orbitKey ? 'system' : 'system');
      this.arriveEffects(this.st.loc, true);
      if (!saved) setTimeout(function () { if (!self.dead) SP.ui.toast('Scroll out (or press G) to see the galaxy. Your goal glows at the centre!', '🌌', 5200); }, 2500);
      if (!saved && this.st.carried > 0) setTimeout(function () { if (!self.dead) SP.ui.toast('Your civilization sent ' + self.st.carried + ' 💰 of its treasury (a quarter, up to 1500) to fund the voyage.', '🏛️', 5200); }, 8200);
      this.update(0.001, 0);
    },

    exit: function () {
      this.dead = true;
      if (this._unsub) this._unsub.forEach(function (f) { try { f(); } catch (e) {} });
      if (this._unResize) this._unResize();
      if (this.endingUI) { this.endingUI.close(); this.endingUI = null; }
      if (this.sysDispose) this.sysDispose();
      if (this.orbDispose) this.orbDispose();
      if (this.galView) this.galView.dispose();
      if (this.backdrop) this.backdrop.dispose();
      if (this.fx) this.fx.dispose();
      if (this.combatDispose) this.combatDispose();
      if (this.shipRig) { try { this.shipRig.dispose(); } catch (e) {} }
      if (this.scene) SP.render.disposeTree(this.scene);
      X().removeCss();
      this.scene = null;
    },

    pause: function () { this.paused = true; },
    resume: function () { this.paused = false; this.recalcShip(); this.syncHud(true); },

    serialize: function () {
      const st = this.st; if (!st) return null;
      const o = JSON.parse(JSON.stringify(st)); o.v = 1; o.view = 'system'; return o;
    },

    // ================================================================== state
    newState: function (c) {
      let design = c.space && c.space.shipDesign;
      if (!design) { try { design = SP.assembly.defaultDesign('ship'); } catch (e) { console.error(e); } }
      const gal = this.gal;
      const st = {
        v: 1, shipDesign: design, money: 450 + Math.min(1500, Math.floor(((c.space && c.space.primordiabucks) || 0) * 0.25)), carried: Math.min(1500, Math.floor(((c.space && c.space.primordiabucks) || 0) * 0.25)), energy: 0, hull: 0, loc: gal.homeIdx, view: 'system',
        up: { range: 0, energy: 0, weapon: 0, hull: 0 }, inv: { packs: 1, gen: 1, frz: 1, heat: 1, plants: 2, animals: 1, key: false },
        spice: {}, planets: {}, visited: [gal.homeIdx], rel: {}, mission: null, keyGiven: false, done: 0,
        stats: { kills: 0, earned: 0, scans: 0, jumps: 0, sold: 0, colonies: 0 }, badges: {}, ended: false, raids: [], cleared: [], arch: archetypeOf(c.cards), play: 0, wormholeUsed: false, contacted: {}
      };
      this.st = st;
      const ss = this.shipStats(st); st.energy = ss.energyMax; st.hull = ss.hullMax;
      return st;
    },
    restore: function (s) {
      const st = JSON.parse(JSON.stringify(s));
      st.inv = Object.assign({ packs: 0, gen: 0, frz: 0, heat: 0, plants: 0, animals: 0, key: false }, st.inv);
      st.up = Object.assign({ range: 0, energy: 0, weapon: 0, hull: 0 }, st.up);
      st.stats = Object.assign({ kills: 0, earned: 0, scans: 0, jumps: 0, sold: 0, colonies: 0 }, st.stats);
      st.raids = st.raids || []; st.cleared = st.cleared || []; st.rel = st.rel || {}; st.spice = st.spice || {}; st.planets = st.planets || {}; st.badges = st.badges || {}; st.contacted = st.contacted || {};
      if (!st.shipDesign) st.shipDesign = SP.assembly.defaultDesign('ship');
      st.arch = st.arch || archetypeOf(this.campaign.cards);
      this.st = st;
      const ss = this.shipStats(st); st.energy = Math.min(st.energy, ss.energyMax); st.hull = Math.min(st.hull || ss.hullMax, ss.hullMax);
      return st;
    },
    rel: function (id) {
      const st = this.st;
      if (!st.rel[id]) {
        const em = this.gal.empires[id];
        st.rel[id] = { att: em.baseAttitude + (st.arch === 'zealot' ? 12 : 0), contact: false, ally: false, war: false, trades: 0 };
      }
      return st.rel[id];
    },

    shipStats: function (st) {
      st = st || this.st;
      let d = { energy: 0, health: 0, power: 0, speed: 0, range: 0, defense: 0 };
      try { d = SP.assembly.stats(st.shipDesign); } catch (e) {}
      const arch = st.arch;
      return {
        energyMax: Math.round((38 + (d.energy || 0) + 15 * st.up.energy) * (arch === 'wanderer' ? 1.25 : 1)),
        hullMax: Math.round(70 + (d.health || 0) * 1.2 + 40 * st.up.hull),
        power: Math.max(4, d.power || 0) * (1 + 0.25 * st.up.weapon),
        range: 8 + (d.range || 0) * 2.4 + 6 * st.up.range,
        speed: 24 + (d.speed || 0) * 3.2, defense: d.defense || 0, parts: d.parts || 0
      };
    },
    recalcShip: function () {
      this.ss = this.shipStats();
      this.st.energy = Math.min(this.st.energy, this.ss.energyMax); this.st.hull = Math.min(this.st.hull, this.ss.hullMax);
    },
    addMoney: function (n, why) {
      this.st.money += n; if (n > 0) this.st.stats.earned += n;
      if (SP.audio && n > 0) SP.audio.sfx('coin');
    },
    tScoreOf: function (def) { return G().tScore(this.psOf(def)); },
    defOf: function (key) { const a = key.split(':'); return G().planetsOf(this.gal, +a[0], this.campaign)[+a[1]]; },
    psOf: function (def) {
      const st = this.st; let ps = st.planets[def.key];
      if (!ps) { ps = { atmo: def.baseAtmo, temp: def.baseTemp, plants: 0, animals: 0, scanned: !!def.home, colony: null, gas: def.type === 'gas' }; st.planets[def.key] = ps; }
      ps.gas = def.type === 'gas';
      return ps;
    },
    colonyList: function () {
      const out = [], self = this;
      Object.keys(this.st.planets).forEach(function (k) { const ps = self.st.planets[k]; if (ps.colony) out.push({ key: k, def: self.defOf(k), ps: ps, star: +k.split(':')[0] }); });
      return out;
    },
    refuelStar: function (si) {
      if (si === this.gal.homeIdx) return true;
      const ck = this.colonyList(); for (let i = 0; i < ck.length; i++) if (ck[i].star === si) return true;
      return false;
    },
    refreshOwnership: function () {
      const set = {}; this.colonyList().forEach(function (c) { set[c.star] = 1; }); set[this.gal.homeIdx] = 1;
      this.galView.rebuildOwnership(Object.keys(set).map(Number), [], null);
      this.galView.showWormholes(this.st.inv.key);
    },

    // ================================================================== views & transitions
    // run fn() at the midpoint of a zoom/warp transition
    transition: function (kind, fn, dur) {
      if (this.trans) return;
      this.trans = { kind: kind, t: 0, dur: dur || 1.0, fn: fn, phase: 0 };
      SP.audio && SP.audio.sfx(kind === 'warp' ? 'warp' : 'charge', { vol: 0.5 });
    },
    stepTransition: function (dt) {
      const tr = this.trans; if (!tr) { this.fovMul = 1; return; }
      tr.t += dt; const half = tr.dur / 2;
      const kinds = { 'in': [1, 0.42, 1.9], out: [1, 1.9, 0.42], warp: [1, 2.6, 2.6] };
      const k = kinds[tr.kind];
      if (tr.phase === 0) {
        const f = clamp(tr.t / half, 0, 1), e = f * f;
        this.fovMul = k[0] + (k[1] - k[0]) * e; this.h.fade.style.opacity = e; this.h.warp.style.opacity = tr.kind === 'warp' ? e : 0;
        if (f >= 1) { tr.phase = 1; tr.t = 0; try { tr.fn(); } catch (e2) { console.error(e2); } this.updateCamera(0.5, true); }
      } else {
        const f = clamp(tr.t / half, 0, 1), e = 1 - (1 - f) * (1 - f);
        const startF = tr.kind === 'in' ? 1.9 : tr.kind === 'out' ? 0.42 : 2.6;
        this.fovMul = startF + (1 - startF) * e; this.h.fade.style.opacity = 1 - e; this.h.warp.style.opacity = tr.kind === 'warp' ? 1 - e : 0;
        if (f >= 1) { this.trans = null; this.fovMul = 1; this.h.fade.style.opacity = 0; this.h.warp.style.opacity = 0; }
      }
    },

    gotoView: function (view, arg) {
      if (this.trans || this.view === view && !arg) return;
      if (this.ending) return;
      const order = { galaxy: 0, system: 1, orbit: 2 }, self = this;
      const kind = order[view] > order[this.view] ? 'in' : 'out';
      if (view === 'orbit') {
        const def = arg || this.selPlanetDef() || this.nearestPlanet();
        if (!def) { SP.ui.toast('Select a planet first', '🪐'); return; }
        if (def.type === 'gas') { SP.ui.toast('Gas giants have no surface to orbit.', '🪐'); return; }
        if (this.hostilesNear(260)) { SP.ui.toast('Clear the hostile ships first!', '⚠️'); return; }
        arg = def;
      }
      this.transition(kind, function () { self.applyView(view, arg); }, 1.0);
    },

    applyView: function (view, arg) {
      if (this.view === 'system' && view !== 'system') this.sysHide();
      if (this.view === 'orbit' && view !== 'orbit') this.orbHide();
      const prev = this.view; this.view = view;
      this.galView.group.visible = view === 'galaxy';
      this.starLight.visible = view === 'system'; this.sunDir.visible = view === 'orbit'; this.rimLight.visible = view !== 'galaxy';
      this.ambient.intensity = view === 'orbit' ? 0.4 : 0.4;
      if (view === 'galaxy') {
        const c = this.gal.stars[this.st.loc].pos, g = this.gc;
        g.tt.copy(c); g.target.copy(c); g.td = prev === "galaxy" ? g.td : 95; g.dist = g.td; if (!this.sel || this.sel.type !== 'star') this.sel = null;
        this.shipGroup.visible = false;
      } else if (view === 'system') { this.sysShow(this.st.loc); }
      else if (view === 'orbit') { this.orbShow(arg); }
      this.st.view = view === 'orbit' ? 'system' : view;
      this.refreshHud();
      this.updateCamera(0.5, true);
    },

    selPlanetDef: function () { return this.sel && this.sel.type === 'planet' ? this.sel.def : null; },

    // ================================================================== jumping
    // B-02: the Grox blockade jams short-range drives. The core (and the Grox belt around it) can only be entered with
    // drive range >= GATE_RANGE (upgrade it in the Market) or with the Wormhole Key (the black-hole chain bypasses the belt).
    GATE_RANGE: 34,
    gated: function (s) { return !!(s.core || s.grox); },
    jumpInfo: function (i) {
      const gal = this.gal, st = this.st, s = gal.stars[i], here = gal.stars[st.loc];
      if (i === st.loc) return { ok: false, reason: 'You are here', dist: 0, cost: 0 };
      const dist = s.pos.distanceTo(here.pos), ss = this.ss || this.shipStats();
      let cost = Math.max(2, dist * 1.1) * (st.cheapJump ? 0.7 : 1);
      const info = { dist: dist, cost: cost, range: ss.range };
      if (s.bh && !st.inv.key) { info.ok = false; info.reason = 'Sealed gate: needs a Wormhole Key'; return info; }
      if (this.gated(s) && !st.inv.key && ss.range < this.GATE_RANGE) { info.ok = false; info.reason = 'The Grox blockade jams your drive: needs range ' + this.GATE_RANGE + ' (you have ' + ss.range.toFixed(0) + ') or a Wormhole Key'; return info; }
      if (dist > ss.range) { info.ok = false; info.reason = 'Out of range (' + dist.toFixed(0) + ' > ' + ss.range.toFixed(0) + ')'; return info; }
      if (st.energy < cost) { info.ok = false; info.reason = 'Needs ' + Math.ceil(cost) + ' energy'; return info; }
      info.ok = true; return info;
    },
    startJump: function (i, free) {
      if (this.trans) return;
      const info = this.jumpInfo(i);
      if (!free && !info.ok) { SP.ui.toast(info.reason, '⛔'); SP.audio && SP.audio.sfx('social_bad'); return; }
      const self = this, st = this.st;
      this.transition('warp', function () {
        if (!free) { st.energy = Math.max(0, st.energy - info.cost); st.cheapJump = false; }
        st.loc = i; st.stats.jumps++;
        if (st.visited.indexOf(i) < 0) st.visited.push(i);
        self.sel = null; self.autopilot = null;
        self.applyView('system'); self.arriveEffects(i, false);
        self.checkBadges();
      }, 1.8);
    },

    // things that happen on arrival in a system
    arriveEffects: function (si, initial) {
      const gal = this.gal, s = gal.stars[si], st = this.st, self = this;
      this.collectAll(si, true);
      if (s.core) { this.arriveCore(); return; }
      if (s.bh) { this.arriveBlackHole(s); return; }
      if (s.grox) {
        const depth = clamp(1 - (s.r - G().GROX_IN) / (G().GROX_OUT - G().GROX_IN), 0, 1);
        this.spawnHostiles('grox', 3 + Math.round(depth * 3), 1.5 + depth * 2);
        SP.ui.banner('⚠ GROX SPACE', 'Hostile fleet incoming!', 2600); SP.audio && SP.audio.sfx('alarm');
      } else if (s.pirates && st.cleared.indexOf(si) < 0) {
        const m = st.mission, boss = m && m.kind === 'key' && m.star === si;
        this.spawnHostiles('pirate', boss ? 6 : 3, 1, boss ? 'Warlord' : null);
        SP.ui.toast(boss ? 'The Pirate Warlord waits for you!' : 'Pirates! Fire at will.', '☠️', 3200); SP.audio && SP.audio.sfx('alarm');
      }
      // active raids on this system
      st.raids.forEach(function (r) {
        if (r.star === si && !r.spawned) { r.spawned = true; self.spawnHostiles(r.by === 'pirates' ? 'pirate' : 'empire', 3, 1, null, r.by === 'pirates' ? null : r.by); SP.ui.toast('Raiders attack your colony!', '🚨', 3000); SP.audio && SP.audio.sfx('alarm'); }
      });
      if (!initial && s.empire >= 0 && !st.contacted[s.empire]) {
        st.contacted[s.empire] = 1;
        const emId = s.empire, rl = this.rel(emId);
        setTimeout(function () { if (!self.dead && self.view === 'system' && !rl.war) X().contact(self, emId, true); }, 1800);
      }
      if (this.refuelStar(si)) SP.ui.toast('Safe harbour: energy refills here.', '🔋', 2200);
    },
    arriveBlackHole: function (s) {
      const st = this.st, self = this, gal = this.gal;
      if (!st.inv.key) return;
      const k = s.bh;
      SP.ui.banner('🌀 Wormhole ' + k + '/3', 'The gate swallows your ship...', 2200); SP.audio && SP.audio.sfx('warp');
      st.wormholeUsed = true;
      if (k < 3) {
        setTimeout(function () { if (!self.dead && !self.trans && self.st.loc === s.i) self.startJump(gal.bh[k], true); }, 2600);
      } else {
        SP.ui.toast('You emerge right beside the galactic core! Jump in!', '✨', 4500);
      }
    },
    arriveCore: function () {
      SP.ui.banner('The Galactic Core', 'Find the Staff of Life', 3200);
      this.spawnHostiles('grox', 3, 1.3, 'Guardian');
      this.st.coreReached = true;
    },

    // ================================================================== economy / diplomacy
    spicePrice: function (empId, type) {
      const em = this.gal.empires[empId], rel = this.rel(empId), sp = G().SPICES[type];
      let m = 1 + clamp(rel.att, -100, 100) / 250;
      if (em.likes.indexOf(type) >= 0) m *= 1.6; else if (em.dislikes === type) m *= 0.7;
      if (rel.ally) m *= 1.15; if (this.st.arch === 'trader') m *= 1.1; if (this.st.tradeBoost > 0) m *= 1.5;
      return Math.max(1, Math.round(sp.value * m));
    },
    sellSpice: function (empId, type) {
      const n = this.st.spice[type] || 0; if (n <= 0) return 'You have none.';
      const price = this.spicePrice(empId, type), total = price * n, rel = this.rel(empId);
      this.st.spice[type] = 0; this.st.stats.sold += n; this.addMoney(total); rel.att = Math.min(100, rel.att + 2 + n * 0.1); rel.trades++;
      this.syncHud(true); this.checkBadges(); this.checkDeliver(empId);
      return 'Pleasure doing business! ' + total + '💰 for ' + n + ' units.';
    },
    gift: function (empId) {
      if (this.st.money < 50) return 'You cannot afford a gift.';
      this.st.money -= 50; const r = this.rel(empId); r.att = Math.min(100, r.att + 8); SP.audio && SP.audio.sfx('social_ok'); this.syncHud(true);
      return 'A gift? How thoughtful!';
    },
    proposeAlliance: function (empId) {
      const r = this.rel(empId), em = this.gal.empires[empId];
      if (r.ally) return { ok: true, msg: 'We are already allies, friend.' };
      if (r.att < 55) return { ok: false, msg: 'We do not know you well enough yet... (needs attitude 55, trade or gift more)' };
      if (r.trades < 2) return { ok: false, msg: 'Trade with us a couple of times first.' };
      r.ally = true; r.att = Math.min(100, r.att + 10); SP.ui.toast('Allied with the ' + em.name + '!', '🤝', 3000); SP.audio && SP.audio.sfx('win');
      this.checkBadges(); this.syncHud(true);
      return { ok: true, msg: 'An alliance! Our fleets stand with you. Ask us about missions.' };
    },
    declareWar: function (empId) {
      const r = this.rel(empId); r.war = true; r.ally = false; r.att = -80; this.timers.war = Math.min(this.timers.war, 60);
      SP.ui.toast('War declared! They will raid your colonies.', '⚔️', 3000); SP.audio && SP.audio.sfx('alarm'); return 'Then it is war!';
    },
    makePeace: function (empId) {
      if (this.st.money < 300) return 'Peace costs 300💰. You cannot afford it.';
      this.st.money -= 300; const r = this.rel(empId); r.war = false; r.att = -5; this.st.raids = this.st.raids.filter(function (x) { return x.by !== empId; });
      SP.ui.toast('Peace restored.', '🕊️', 2400); this.syncHud(true); return 'Very well. Peace, for now.';
    },
    hail: function () {
      const s = this.gal.stars[this.st.loc];
      let emp = s.empire;
      if (emp < 0) { const allies = Object.keys(this.st.rel).filter(function (k) { return this.st.rel[k].ally; }, this); if (allies.length) emp = +allies[0]; }
      if (emp < 0) { SP.ui.toast('No empire answers your hail here.', '📡'); return; }
      X().contact(this, emp, false); this.checkTurnIn(emp);
    },

    // ---- missions
    missionOffers: function (empId) {
      const gal = this.gal, st = this.st, rel = this.rel(empId), rng = U.rng('mis' + gal.seed + empId + st.done), here = gal.stars[st.loc], out = [];
      const base = 160 + st.done * 40;
      const t = rng.pick([0, 1, 2, 3, 4]);
      out.push({ kind: 'deliver', emp: empId, type: t, n: rng.int(12, 24), reward: base + 60, icon: '📦', text: 'Deliver 15+ ' + G().SPICES[t].name + ' (' + '✨' + ')' });
      out[0].n = 15; out[0].text = 'Deliver ' + out[0].n + ' units of ' + G().SPICES[t].name;
      // scan
      let cands = gal.stars.filter(function (s) { return !s.core && !s.bh && !s.grox && s.i !== here.i && s.pos.distanceTo(here.pos) < 45; });
      if (cands.length) {
        const s = rng.pick(cands), pls = G().planetsOf(gal, s.i, this.campaign).filter(function (p) { return p.type !== 'gas' && p.inhabited === undefined && !p.home; });
        if (pls.length) { const p = rng.pick(pls); out.push({ kind: 'scan', emp: empId, star: s.i, key: p.key, reward: base, icon: '🔬', text: 'Scan the planet ' + p.name + ' (' + s.name + ' system)' }); }
      }
      cands = gal.pirates.filter(function (i) { return st.cleared.indexOf(i) < 0 && gal.stars[i].pos.distanceTo(here.pos) < 80; });
      if (cands.length) { const i = rng.pick(cands); out.push({ kind: 'pirates', emp: empId, star: i, reward: base + 120, icon: '☠️', text: 'Destroy the pirates at ' + gal.stars[i].name }); }
      if (rel.ally && !st.inv.key) {
        const pc = gal.pirates.filter(function (i) { return st.cleared.indexOf(i) < 0; });
        if (pc.length) { pc.sort(function (a, b) { return gal.stars[a].pos.distanceTo(here.pos) - gal.stars[b].pos.distanceTo(here.pos); }); out.unshift({ kind: 'key', emp: empId, star: pc[0], reward: 0, icon: '🗝️', text: 'WORMHOLE KEY: slay the Pirate Warlord at ' + gal.stars[pc[0]].name }); }
      }
      return out;
    },
    acceptMission: function (m) { this.st.mission = Object.assign({}, m); SP.ui.toast('Mission accepted: ' + m.text, '📜', 3500); this.syncHud(true); this.checkTurnIn(m.emp); },
    abandonMission: function () { this.st.mission = null; this.syncHud(true); },
    finishMission: function () {
      const m = this.st.mission; if (!m) return;
      const rel = this.rel(m.emp), em = this.gal.empires[m.emp];
      if (m.reward) this.addMoney(m.reward);
      rel.att = Math.min(100, rel.att + 14);
      if (m.kind === 'key') { this.st.inv.key = true; this.galView.showWormholes(true); SP.ui.banner('🗝️ Wormhole Key!', 'The three black holes will carry you to the core.', 4200); SP.audio && SP.audio.sfx('win'); }
      else SP.ui.banner('Mission complete!', '+' + m.reward + '💰 and the ' + em.species + ' like you more', 2600);
      this.st.done++; this.st.mission = null; this.syncHud(true); this.checkBadges();
    },
    checkDeliver: function (empId) { /* deliveries are handed in at contact; see checkTurnIn */ this.checkTurnIn(empId); },
    checkTurnIn: function (empId) {
      const m = this.st.mission; if (!m || m.emp !== empId) return;
      if (m.kind === 'deliver') {
        if ((this.st.spice[m.type] || 0) >= m.n) { this.st.spice[m.type] -= m.n; this.finishMission(); }
      } else if (m.done) this.finishMission();
    },
    onScanned: function (def) {
      const m = this.st.mission;
      if (m && m.kind === 'scan' && m.key === def.key) { m.done = true; SP.ui.toast('Scan complete! Report back to the ' + this.gal.empires[m.emp].species + ' (📡 Hail).', '🔬', 3500); this.syncHud(true); }
    },
    onCleared: function (si) {
      const st = this.st, m = st.mission;
      if (this.gal.stars[si].pirates && st.cleared.indexOf(si) < 0) st.cleared.push(si);
      st.raids = st.raids.filter(function (r) { return r.star !== si; });
      if (m && (m.kind === 'pirates' || m.kind === 'key') && m.star === si) { m.done = true; SP.ui.toast('Target destroyed! Report back (📡 Hail) for your reward.', '🎯', 3500); this.syncHud(true); }
    },

    // ---- collecting spice
    collectAll: function (si, quiet) {
      let total = 0, self = this;
      this.colonyList().forEach(function (c) {
        if (c.star !== si || !c.ps.colony || c.ps.colony.store < 1) return;
        const sp = c.def.spice; if (sp < 0) return;
        const n = Math.floor(c.ps.colony.store); c.ps.colony.store -= n; self.st.spice[sp] = (self.st.spice[sp] || 0) + n; total += n;
      });
      if (total > 0) { if (!quiet || total > 0) SP.ui.toast('Collected ' + total + ' units of spice', '✨', 2400); SP.audio && SP.audio.sfx('dna'); this.syncHud(true); }
      return total;
    },
    cargoTotal: function () { let n = 0; for (const k in this.st.spice) n += this.st.spice[k]; return n; },

    // ================================================================== shop
    priceOf: function (id) {
      const lv = this.st.up, base = { gen: 110, frz: 110, heat: 110, pack: 380, plants: 120, animals: 160, repair: 0 };
      if (base[id] !== undefined) return base[id];
      const ladders = { range: [400, 700, 1000, 1400, 1900, 2500], energy: [150, 260, 400, 580], weapon: [200, 340, 520, 760, 1050], hull: [180, 300, 460, 680, 950] };
      return ladders[id][lv[id]] || 0;
    },
    shopItems: function () {
      const st = this.st, lv = st.up, self = this, items = [], ss = this.ss || this.shipStats();
      const lad = function (id, icon, name, desc, max) { const p = self.priceOf(id), maxed = lv[id] >= max; items.push({ id: id, icon: icon, name: name, desc: desc, level: lv[id], max: max, price: p, disabled: maxed || st.money < p, reason: maxed ? 'Maxed' : 'Need ' + p + '💰' }); };
      lad('range', '🌀', 'Drive Range +6', 'Jump further. Now: ' + ss.range.toFixed(0) + ' pc. Entering the Grox belt and the core needs ' + self.GATE_RANGE + ' pc (or a Wormhole Key).', 6);
      lad('energy', '🔋', 'Energy Tank +15', 'Max energy: ' + ss.energyMax, 4);
      lad('weapon', '⚡', 'Laser Power +25%', 'Damage per shot: ' + (3 + ss.power * 0.55).toFixed(1), 5);
      lad('hull', '🛡️', 'Hull Plating +40', 'Max hull: ' + ss.hullMax, 5);
      const cnt = function (id, icon, name, desc, key) { const p = self.priceOf(id); items.push({ id: id, icon: icon, name: name, desc: desc, count: st.inv[key], price: p, disabled: st.money < p, reason: 'Need ' + p + '💰' }); };
      cnt('pack', '🏗️', 'Colony Pack', 'Found a spice colony on a planet.', 'packs');
      cnt('gen', '🌫️', 'Atmosphere Generator ×3', 'Each charge shifts atmosphere ±12.', 'gen');
      cnt('frz', '❄️', 'Freezer ×3', 'Each charge cools a planet by 12.', 'frz');
      cnt('heat', '🔥', 'Heater ×3', 'Each charge warms a planet by 12.', 'heat');
      cnt('plants', '🌱', 'Plant Seeds', 'Plants stabilise the T-score (+3 tolerance).', 'plants');
      cnt('animals', '🐾', 'Animal Pod', 'Animals stabilise the T-score (+3 tolerance).', 'animals');
      const miss = Math.ceil(ss.hullMax - st.hull), rp = Math.ceil(miss * 0.8);
      items.push({ id: 'repair', icon: '🔧', name: 'Repair Hull', desc: 'Missing ' + miss + ' hull.', price: rp, disabled: miss <= 0 || st.money < rp, reason: miss <= 0 ? 'Full' : 'Need ' + rp + '💰' });
      items.push({ id: 'key', icon: '🗝️', name: 'Wormhole Key', desc: st.inv.key ? 'You own it! Fly into a black hole.' : 'Not for sale. Earn it from an allied empire\'s mission.', price: 0, disabled: true, reason: st.inv.key ? 'Owned' : 'Locked' });
      return items;
    },
    buy: function (id) {
      const st = this.st, p = id === 'repair' ? Math.ceil((this.ss.hullMax - st.hull) * 0.8) : this.priceOf(id);
      if (st.money < p) return;
      if (['range', 'energy', 'weapon', 'hull'].indexOf(id) >= 0) { st.up[id]++; }
      else if (id === 'pack') st.inv.packs++;
      else if (id === 'gen' || id === 'frz' || id === 'heat') st.inv[id] += 3;
      else if (id === 'plants') st.inv.plants++; else if (id === 'animals') st.inv.animals++;
      else if (id === 'repair') st.hull = this.ss.hullMax;
      else return;
      st.money -= p; SP.audio && SP.audio.sfx('build');
      this.recalcShip(); if (id === 'energy') st.energy += 15; this.syncHud(true);
    },
    useToolBuy: function (id) { const p = this.priceOf(id); if (this.st.money >= p) { this.st.money -= p; this.st.inv[id] += 1; SP.audio && SP.audio.sfx('build'); this.syncHud(true); } else SP.ui.toast('Need ' + p + '💰 for one charge', '💰'); },
    openShip: function () {
      const self = this;
      SP.game.openEditor({ mode: 'ship', design: SP.assembly.clone(this.st.shipDesign), budget: Math.floor(this.st.money), currency: 'Primordiabucks', unlocked: 'all', title: 'Ship Editor', allowCancel: true }).then(function (res) {
        if (res && res.design) {
          self.st.shipDesign = res.design; self.st.money -= (res.spent || 0);
          self.rebuildShip(); self.recalcShip(); self.syncHud(true);
          SP.ui.toast('Ship refitted!', '🛠️');
        }
      });
    },

    // ================================================================== badges / goal
    badgeList: function () {
      const st = this.st, nAll = Object.keys(st.rel).filter(function (k) { return st.rel[k].ally; }).length, nCol = this.colonyList().length;
      let t3 = false; this.colonyList().forEach(function (c) { if (G().tScore(c.ps) >= 3) t3 = true; });
      return [
        { id: 'explorer', icon: '🧭', name: 'Explorer', desc: 'Visit 12 stars (' + st.visited.length + ')', got: st.visited.length >= 12 },
        { id: 'colonist', icon: '🏗️', name: 'Colonist', desc: 'Found 3 colonies (' + nCol + ')', got: nCol >= 3 },
        { id: 'trader', icon: '💰', name: 'Tycoon', desc: 'Earn 4000💰 (' + Math.floor(st.stats.earned) + ')', got: st.stats.earned >= 4000 },
        { id: 'diplomat', icon: '🤝', name: 'Diplomat', desc: 'Ally with 2 empires (' + nAll + ')', got: nAll >= 2 },
        { id: 'warrior', icon: '⚔️', name: 'Ace Pilot', desc: 'Destroy 20 ships (' + st.stats.kills + ')', got: st.stats.kills >= 20 },
        { id: 'scientist', icon: '🔬', name: 'Scientist', desc: 'Scan 10 planets (' + st.stats.scans + ')', got: st.stats.scans >= 10 },
        { id: 'terra', icon: '🌍', name: 'Terraformer', desc: 'A T-score 3 colony', got: t3 },
        { id: 'worm', icon: '🌀', name: 'Wormhole Rider', desc: 'Use the black hole chain', got: !!st.wormholeUsed },
        { id: 'core', icon: '✨', name: 'Staff Bearer', desc: 'Find the Staff of Life', got: !!st.ended }
      ];
    },
    checkBadges: function () {
      const st = this.st, self = this;
      this.badgeList().forEach(function (b) { if (b.got && !st.badges[b.id]) { st.badges[b.id] = 1; SP.ui.toast('Badge earned: ' + b.name, b.icon, 3000); SP.audio && SP.audio.sfx('levelup'); } });
      if (this.h) this.h.badgeBtn.querySelector('.btn-label').textContent = Object.keys(st.badges).length + '/9';
    },
    coreProgress: function () {
      const d = this.gal.stars[this.st.loc].pos.length(), start = this.gal.stars[this.gal.homeIdx].pos.length();
      return clamp(1 - d / start, 0, 1);
    },

    // ================================================================== the ending
    finishQuest: function () {
      if (this.ending || this.st.endedShown) return;
      this.ending = true; this.st.endedShown = true;
      const self = this;
      this.transition('warp', function () {
        self.h.root.style.display = 'none';
        self.endingUI = X().ending(self, function (choice) {
          self.endingUI = null; self.ending = false; self.st.ended = true; self.h.root.style.display = '';
          self.checkBadges();
          if (choice === 'finish') self.completeGame(); else { SP.ui.toast('Free play: the galaxy is yours. Press Esc for the title.', '🌌', 5000); self.addFinishButton(); }
        });
      }, 1.6);
    },
    addFinishButton: function () {
      const self = this; if (this.h.finishBtn) return;
      this.h.finishBtn = SP.ui.button('Finish game', { icon: '🏁', color: 'amber', small: true, onClick: function () { self.completeGame(); } });
      this.h.btnRow.appendChild(this.h.finishBtn);
    },
    completeGame: function () {
      const st = this.st, lines = [
        'You reached the Galactic Core and found the Staff of Life!',
        'Archetype: ' + this.arch.name + ' ' + this.arch.icon,
        'Colonies founded: ' + this.colonyList().length + ' · Empires allied: ' + Object.keys(st.rel).filter(function (k) { return st.rel[k].ally; }).length,
        'Ships destroyed: ' + st.stats.kills + ' · Planets scanned: ' + st.stats.scans + ' · Jumps: ' + st.stats.jumps,
        'Total spice sold: ' + st.stats.sold + ' units · Earned ' + Math.floor(st.stats.earned) + '💰'
      ];
      SP.game.completeStage(st.arch, lines);
    },

    // ================================================================== input
    onKey: function (e) {
      if (this.dead || this.trans || this.ending || SP.game.paused || SP.game.editorOpen || SP.ui.modalCount() > 0) return;
      const t = e.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (e.repeat) return;
      switch (e.code) {
        case 'KeyG': this.gotoView(this.view === 'galaxy' ? 'system' : 'galaxy'); break;
        case 'KeyE': if (this.view === 'system') this.gotoView('orbit'); else if (this.view === 'orbit') this.gotoView('system'); break;
        case 'KeyQ': this.useAbility(); break;
        case 'KeyB': X().shop(this); break;
        case 'KeyV': this.openShip(); break;
        case 'KeyJ': case 'Enter': if (this.view === 'galaxy' && this.sel && this.sel.type === 'star') this.startJump(this.sel.i); break;
        case 'KeyH': break;
        case 'KeyC': if (this.view === 'system') this.hail(); break;
        case 'KeyT': if (this.view === 'system') this.scanSelected(); break;
      }
    },
    useAbility: function () {
      const st = this.st;
      if (st.abCd > 0) { SP.ui.toast('Ability recharging (' + Math.ceil(st.abCd) + 's)', '⏳', 1200); return; }
      const a = st.arch, me = this;
      st.abCd = this.arch.cd; this.abMax = this.arch.cd;
      SP.audio && SP.audio.sfx('charge');
      if (a === 'warrior') { st.frenzy = 10; SP.ui.banner('💢 Battle Frenzy!', 'Double damage', 1400); }
      else if (a === 'trader') { st.tradeBoost = 40; for (const k in st.rel) if (st.rel[k].contact) st.rel[k].att = Math.min(100, st.rel[k].att + 6); SP.ui.banner('📈 Market Surge!', 'Spice sells for +50%', 1600); }
      else if (a === 'zealot') { st.calm = 12; const s = this.gal.stars[st.loc]; if (s.empire >= 0) this.rel(s.empire).att = Math.min(100, this.rel(s.empire).att + 15); SP.ui.banner('☁️ Black Cloud', 'Enemies calm down', 1600); this.fx.burst(this.ship.pos.clone(), 0xa855f7, 40, 3, { life: 1.4, size: 0.9, gravity: 0 }); }
      else { st.hull = Math.min(this.ss.hullMax, st.hull + this.ss.hullMax * 0.5); st.energy = Math.min(this.ss.energyMax, st.energy + this.ss.energyMax * 0.4); st.cheapJump = true; SP.ui.banner('🌬️ Second Wind', 'Hull and energy restored', 1600); this.fx.burst(this.ship.pos.clone(), 0x86efac, 30, 2, { life: 1.2, size: 0.6, gravity: 0 }); }
      this.syncHud(true);
    },

    // ================================================================== update
    update: function (dt, t) {
      if (this.dead) return;
      const st = this.st; this.t += dt; st.play = (st.play || 0) + dt;
      if (!this.ss) this.recalcShip();
      this.stepTransition(dt);
      const busy = !!this.trans || this.ending;
      // cooldowns
      ['abCd', 'frenzy', 'tradeBoost', 'calm'].forEach(function (k) { if (st[k] > 0) st[k] = Math.max(0, st[k] - dt); });
      this.fovTick();
      if (this.view === 'galaxy') this.updateGalaxy(dt, busy);
      else if (this.view === 'system') this.updateSystem(dt, busy);
      else if (this.view === 'orbit') this.updateOrbit(dt, busy);
      this.updateWorld(dt);
      this.updateCamera(dt, false);
      this.updateBackdrop(dt);
      this.fx.update(dt);
      this.updatePins();
      this.hudT -= dt; if (this.hudT <= 0) { this.hudT = 0.15; this.syncHud(false); }
    },

    fovTick: function () {
      const f = this.baseFov * this.fovMul;
      if (Math.abs(this.camera.fov - f) > 0.01) { this.camera.fov = clamp(f, 8, 150); this.camera.updateProjectionMatrix(); }
    },
    pointScale: function () { return SP.render.height * (SP.render.renderer ? SP.render.renderer.getPixelRatio() : 1) / (2 * Math.tan(this.camera.fov * Math.PI / 360)); },
    updateBackdrop: function (dt) { this.backdrop.update(this.camera.position, this.t, this.pointScale()); },

    // world-time systems: energy, colonies, raids, timers
    updateWorld: function (dt) {
      const st = this.st, tm = this.timers, mul = SP.game.speedMul || 1, self = this;
      // energy regen: fast at safe harbours, slow elsewhere
      const home = this.refuelStar(st.loc);
      if (this.view !== 'galaxy' || true) st.energy = Math.min(this.ss.energyMax, st.energy + dt * (home ? 7 : 0.35));
      // hull regen when calm
      if (!this.hostilesNear(99999)) st.hull = Math.min(this.ss.hullMax, st.hull + dt * (home ? 4 : 0.4));
      // colonies grow and produce
      this.colonyList().forEach(function (c) {
        const col = c.ps.colony, T = G().tScore(c.ps);
        const rate = c.def.spice >= 0 ? 0.075 * (1 + T) * Math.sqrt(col.level) * mul : 0;
        col.store = Math.min(40 + 40 * col.level, col.store + rate * dt);
        col.age = (col.age || 0) + dt * mul;
        const target = 1 + T;
        if (col.level < target && col.age > 45 * col.level) { col.level++; col.age = 0; if (self.orb && self.orb.def === c.def) self.orbRefreshColony(); SP.ui.toast(c.def.name + ' colony grew to level ' + col.level + '!', '🏘️', 2400); }
        else if (col.level > target + 1 && T < col.level - 1 && col.age > 120) { col.level--; col.age = 0; }
        // drift back to natural climate unless stabilised
        const stab = (c.ps.plants > 0 ? 1 : 0) + (c.ps.animals > 0 ? 1 : 0);
        c.ps.atmo += (c.def.baseAtmo - c.ps.atmo) * 0.0012 * dt / (1 + 2.5 * stab); c.ps.temp += (c.def.baseTemp - c.ps.temp) * 0.0012 * dt / (1 + 2.5 * stab);
      });
      // auto-collect when in the colony's system
      tm.sec -= dt; if (tm.sec <= 0) { tm.sec = 3; if (this.view !== 'galaxy') this.collectAll(st.loc, true); this.checkBadges(); }
      // raids
      tm.pirate -= dt; tm.war -= dt;
      const cols = this.colonyList().filter(function (c) { return !c.def.home; });
      if (tm.pirate <= 0) { tm.pirate = U.rng(Math.floor(this.t)).range(110, 190); if (cols.length) this.startRaid('pirates', cols); }
      if (tm.war <= 0) {
        tm.war = U.rng(Math.floor(this.t) + 5).range(100, 160);
        for (const k in st.rel) if (st.rel[k].war && cols.length) this.startRaid(+k, cols);
      }
      st.raids.forEach(function (r) {
        if (st.loc === r.star && self.view !== 'galaxy') return;
        r.t -= dt;
        if (r.t <= 0) {
          const def = self.defOf(r.key), ps = self.psOf(def);
          if (ps.colony) { ps.colony.store = 0; ps.colony.level = Math.max(1, ps.colony.level - 1); ps.colony.age = 0; SP.ui.toast(def.name + ' was ransacked by ' + (r.by === 'pirates' ? 'pirates' : 'the ' + self.gal.empires[r.by].species) + '!', '💥', 4000); SP.audio && SP.audio.sfx('hurt'); }
          r.dead = true;
        }
      });
      st.raids = st.raids.filter(function (r) { return !r.dead; });
      // slight attitude drift to keep diplomacy alive
      for (const k in st.rel) { const r = st.rel[k]; if (!r.war && !r.ally) r.att += (r.att > 0 ? -0.004 : 0.004) * dt; }
      for (const k in st.rel) { const r = st.rel[k]; if (!r.war && r.att < -60 && r.contact) { this.declareWar(+k); SP.ui.toast('The ' + this.gal.empires[+k].species + ' declared war on you!', '⚔️', 4000); } }
    },
    startRaid: function (by, cols) {
      const st = this.st, gal = this.gal;
      let pick;
      if (by === 'pirates') pick = cols[Math.floor(Math.random() * cols.length)];
      else { const em = gal.empires[by]; cols = cols.slice().sort(function (a, b) { return gal.stars[a.star].pos.distanceTo(gal.stars[em.capital].pos) - gal.stars[b.star].pos.distanceTo(gal.stars[em.capital].pos); }); pick = cols[0]; }
      if (!pick || st.raids.some(function (r) { return r.key === pick.key; })) return;
      st.raids.push({ star: pick.star, key: pick.key, by: by, t: 100, spawned: false });
      SP.ui.toast((by === 'pirates' ? 'Pirates are raiding ' : 'The ' + gal.empires[by].species + ' attack ') + pick.def.name + ' (' + gal.stars[pick.star].name + ')! 100 s to respond', '🚨', 5200);
      SP.audio && SP.audio.sfx('alarm');
    },

    // ================================================================== galaxy map view
    updateGalaxy: function (dt, busy) {
      const g = this.gc, m = SP.input.mouse, cam = this.camera;
      this.galView.update(dt, this.t, this.pointScale());
      this.galView.setRange(this.gal.stars[this.st.loc].pos, this.ss.range);
      if (!busy) {
        if (m.wheel) {
          if (m.wheel < 0 && g.td <= 16.5) { this.zoomIntoSystem(); }
          else g.td = clamp(g.td * Math.exp(m.wheel * 0.17), 15, 300);
        }
        if (m.dragging && this._pressWorld) {
          if (m.left) { g.yaw -= m.dx * 0.006; g.pitch = clamp(g.pitch + m.dy * 0.005, 0.12, 1.5); }
          else if (m.right || m.middle) { const k = g.dist * 0.0016; g.tt.addScaledVector(this.camRight(), -m.dx * k); g.tt.addScaledVector(this.camFlat(), m.dy * k); }
        }
        const ax = SP.input.axis(); if (ax.x || ax.y) { const k = g.dist * 0.7 * dt; g.tt.addScaledVector(this.camRight(), ax.x * k); g.tt.addScaledVector(this.camFlat(), ax.y * k); }
        g.tt.x = clamp(g.tt.x, -130, 130); g.tt.z = clamp(g.tt.z, -130, 130); g.tt.y = 0;
      }
      // hover + click picking
      this.hover = busy ? null : this.pickStar();
      if (!busy && m.clicked && !SP.input.pointerOverUI()) {
        this.sel = this.hover !== null ? { type: 'star', i: this.hover } : null; this.refreshCard(); SP.audio && this.hover !== null && SP.audio.sfx('click');
      }
      const k = 1 - Math.exp(-dt * 7);
      g.target.lerp(g.tt, k); g.dist += (g.td - g.dist) * k;
      // route line
      const here = this.gal.stars[this.st.loc].pos;
      if (this.sel && this.sel.type === 'star') { const info = this.jumpInfo(this.sel.i); this.galView.setRoute(here, this.gal.stars[this.sel.i].pos, info.ok); } else this.galView.setRoute(null, null);
    },
    camRight: function () { const g = this.gc; return new V3(Math.cos(g.yaw), 0, -Math.sin(g.yaw)); },
    camFlat: function () { const g = this.gc; return new V3(-Math.sin(g.yaw), 0, -Math.cos(g.yaw)); },
    zoomIntoSystem: function () {
      const here = this.gal.stars[this.st.loc].pos;
      if (this.gc.target.distanceTo(here) > 40) { SP.ui.toast('Jump to a star to explore it. Zoom close to your own star to enter its system.', '🌌', 2600); this.gc.td = 25; return; }
      this.gotoView('system');
    },
    pickStar: function () {
      const m = SP.input.mouse, cam = this.camera, w = SP.render.width, h = SP.render.height; let best = null, bd = 22 * 22;
      if (!m.inside || SP.input.pointerOverUI()) return null;
      const v = new V3(), stars = this.gal.stars;
      cam.updateMatrixWorld(); cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
      for (let i = 0; i < stars.length; i++) {
        v.copy(stars[i].pos).project(cam); if (v.z > 1 || v.z < -1) continue;
        const dx = (v.x * 0.5 + 0.5) * w - m.x, dy = (-v.y * 0.5 + 0.5) * h - m.y, d = dx * dx + dy * dy - (stars[i].core ? 400 : 0);
        if (d < bd) { bd = d; best = i; }
      }
      return best;
    },

    // ================================================================== camera
    updateCamera: function (dt, snap) {
      const cam = this.camera;
      if (this.view === 'galaxy') {
        const g = this.gc, cp = Math.cos(g.pitch), p = new V3(Math.sin(g.yaw) * cp, Math.sin(g.pitch), Math.cos(g.yaw) * cp).multiplyScalar(g.dist).add(g.target);
        cam.position.copy(p); cam.up.set(0, 1, 0); cam.lookAt(g.target);
      } else if (this.view === 'system') this.cameraSystem(dt, snap);
      else if (this.view === 'orbit') this.cameraOrbit(dt, snap);
    },

    // ================================================================== HUD
    buildHud: function () {
      const self = this, ui = SP.ui, hud = document.getElementById('hud'), h = this.h = {};
      const root = h.root = ui.el('div', 'nopoint'); root.style.cssText = 'position:absolute;inset:0;pointer-events:none';
      hud.appendChild(root);
      const tl = ui.el('div', 'hud-corner hud-tl sp-stats'); root.appendChild(tl);
      h.money = ui.counter({ icon: '💰', color: 'amber' }); h.cargo = ui.counter({ icon: '✨', color: 'purple' });
      h.energy = ui.bar({ icon: '⚡', color: 'cyan', label: 'Energy', max: 40, width: 200 }); h.hull = ui.bar({ icon: '❤️', color: 'rose', label: 'Hull', max: 80, width: 200 });
      const crow = ui.el('div', 'hud-row'); crow.appendChild(h.money.el); crow.appendChild(h.cargo.el);
      tl.appendChild(crow); tl.appendChild(h.energy.el); tl.appendChild(h.hull.el);
      h.core = ui.bar({ icon: '🌌', color: 'amber', label: 'Progress to core', max: 100, width: 200 }); h.core.el.classList.add('core'); tl.appendChild(h.core.el);
      // top centre
      const tc = ui.el('div', 'sp-top'); root.appendChild(tc);
      h.title = ui.el('div', 'sp-title'); tc.appendChild(h.title);
      const views = ui.el('div', 'sp-views'); tc.appendChild(views);
      h.vGal = ui.button('Galaxy', { icon: '🌌', color: 'indigo', small: true, key: 'G', onClick: function () { self.gotoView('galaxy'); } });
      h.vSys = ui.button('System', { icon: '☀️', color: 'amber', small: true, onClick: function () { self.gotoView('system'); } });
      h.vOrb = ui.button('Orbit', { icon: '🪐', color: 'cyan', small: true, key: 'E', onClick: function () { self.gotoView('orbit'); } });
      views.appendChild(h.vGal); views.appendChild(h.vSys); views.appendChild(h.vOrb);
      // top right buttons
      const tr = ui.el('div', 'hud-corner hud-tr sp-side'); root.appendChild(tr);
      const row = h.btnRow = ui.el('div', 'row'); tr.appendChild(row);
      row.appendChild(ui.button('Market', { icon: '🛒', color: 'green', small: true, key: 'B', onClick: function () { X().shop(self); } }));
      row.appendChild(ui.button('Ship', { icon: '🛠️', color: 'purple', small: true, key: 'V', onClick: function () { self.openShip(); } }));
      row.appendChild(ui.button('Hail', { icon: '📡', color: 'cyan', small: true, key: 'C', onClick: function () { self.hail(); } }));
      h.badgeBtn = ui.button('0/9', { icon: '🏅', color: 'amber', small: true, onClick: function () { X().badges(self); } }); row.appendChild(h.badgeBtn);
      h.mission = ui.el('div', 'panel sp-mission'); tr.appendChild(h.mission);
      // selection card (bottom-left)
      h.card = ui.el('div', 'panel sp-card hud-corner hud-bl'); h.card.style.display = 'none'; root.appendChild(h.card);
      // ability bar
      const bc = ui.el('div', 'sp-bottom'); root.appendChild(bc);
      h.abil = ui.abilityBar([{ id: 'q', icon: this.arch.abIcon, key: 'Q', name: this.arch.ab + ': ' + this.arch.desc, cooldown: this.arch.cd, level: 0, onClick: function () { self.useAbility(); } }]);
      bc.appendChild(h.abil.el);
      h.arch = ui.el('div', 'sp-hint', ''); h.arch.style.position = 'static'; h.arch.style.transform = 'none'; h.arch.textContent = this.arch.icon + ' ' + this.arch.name + ' · ' + this.arch.passive; bc.appendChild(h.arch);
      h.alert = ui.el('div', 'sp-alert'); h.alert.style.display = 'none'; root.appendChild(h.alert);
      h.hint = ui.el('div', 'sp-hint'); root.appendChild(h.hint);
      h.fade = ui.el('div', 'sp-fade'); h.warp = ui.el('div', 'sp-warp'); root.appendChild(h.fade); root.appendChild(h.warp);
      h.tip = ui.el('div', 'sp-pin'); h.tip.style.display = 'none'; root.appendChild(h.tip);
      this.buildTouch(root);
      this.syncHud(true);
    },
    // B-07: on-screen flight controls (turn / thrust / fire) on touch devices and phone-width screens
    buildTouch: function (root) {
      const self = this, ui = SP.ui;
      this.touchCtl = { turn: 0, thr: 0, fire: false, boost: false, on: false };
      const want = (SP.rtsTouch ? SP.rtsTouch.coarse() : false) || window.innerWidth <= 700;
      if (!want) return;
      const wrap = this.h.touch = ui.el('div', 'sp-touch'); root.appendChild(wrap);
      const tc = this.touchCtl; tc.on = true;
      const mk = function (icon, cls, style, set) {
        const b = ui.el('button', 'sp-tbtn ' + cls, icon); b.type = 'button'; Object.assign(b.style, style);
        const on = function (e) { e.preventDefault(); e.stopPropagation(); try { b.setPointerCapture(e.pointerId); } catch (x) {} set(true); b.classList.add('on'); };
        const off = function (e) { set(false); b.classList.remove('on'); };
        b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('lostpointercapture', off);
        wrap.appendChild(b); return b;
      };
      const g = 'calc(var(--gutter) + 6px)';
      mk('◀', '', { left: g, bottom: g }, function (v) { if (v) tc.turn = 1; else if (tc.turn === 1) tc.turn = 0; });
      mk('▶', '', { left: 'calc(var(--gutter) + 72px)', bottom: g }, function (v) { if (v) tc.turn = -1; else if (tc.turn === -1) tc.turn = 0; });
      mk('🚀', '', { right: 'var(--gutter)', bottom: 'calc(var(--gutter) + 70px)' }, function (v) { tc.thr = v ? 1 : 0; });
      mk('💥', 'fire', { right: 'calc(var(--gutter) + 72px)', bottom: 'calc(var(--gutter) + 70px)' }, function (v) { tc.fire = v; });
      mk('⚡', '', { right: 'calc(var(--gutter) + 144px)', bottom: 'calc(var(--gutter) + 76px)' }, function (v) { tc.boost = v; }).style.width = '50px';
      wrap.lastChild.style.height = '50px'; wrap.lastChild.style.fontSize = '20px';
      // pinch zoom (galaxy / system) + two-finger pan in the galaxy
      const pts = new Map(); let last = 0, lastMid = null;
      const dist = function () { const a = Array.from(pts.values()); return Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y); };
      const mid = function () { const a = Array.from(pts.values()); return { x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2 }; };
      const dn = function (e) { if (e.pointerType !== 'touch' || !(e.target && e.target.tagName === 'CANVAS')) return; pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pts.size === 2) { last = dist(); lastMid = mid(); } };
      const mv = function (e) {
        const p = pts.get(e.pointerId); if (!p) return; p.x = e.clientX; p.y = e.clientY;
        if (pts.size !== 2 || self.trans) return;
        const d = dist(), m = mid();
        if (last > 8 && d > 8) { const k = last / d; if (self.view === 'galaxy') self.gc.td = clamp(self.gc.td * k, 15, 300); else if (self.view === 'system') self.sc.td = clamp(self.sc.td * k, 14, 700); }
        if (self.view === 'galaxy' && lastMid) { const gg = self.gc, kk = gg.dist * 0.0016; gg.tt.addScaledVector(self.camRight(), -(m.x - lastMid.x) * kk); gg.tt.addScaledVector(self.camFlat(), (m.y - lastMid.y) * kk); }
        last = d; lastMid = m;
      };
      const up = function (e) { pts.delete(e.pointerId); };
      window.addEventListener('pointerdown', dn); window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
      this._unsub.push(function () { window.removeEventListener('pointerdown', dn); window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); });
    },
    refreshHud: function () { this.syncHud(true); this.refreshCard(); },
    syncHud: function (force) {
      const h = this.h, st = this.st; if (!h || !this.ss) return;
      h.money.set(Math.floor(st.money)); h.cargo.set(this.cargoTotal());
      h.energy.set(st.energy, this.ss.energyMax); h.hull.set(st.hull, this.ss.hullMax);
      const p = this.coreProgress(); h.core.set(Math.round(p * 100), 100);
      if (h.touch) h.touch.style.display = this.view === 'system' && !this.ending ? '' : 'none';
      h.abil.setCooldown('q', st.abCd > 0 ? st.abCd / this.arch.cd : 0); h.abil.setActive('q', st.frenzy > 0 || st.tradeBoost > 0 || st.calm > 0);
      const s = this.gal.stars[st.loc];
      const vn = this.view === 'galaxy' ? 'Galaxy map' : this.view === 'orbit' && this.orb ? this.orb.def.name : s.name + ' system';
      h.title.innerHTML = vn + '<small>' + (this.view === 'galaxy' ? 'Range ' + this.ss.range.toFixed(0) + ' pc · you are at ' + s.name : s.core ? 'The Galactic Core' : G().STAR_TYPES[s.type].label + (s.empire >= 0 ? ' · ' + this.gal.empires[s.empire].name : '')) + '</small>';
      h.vGal.classList.toggle('btn-sel', this.view === 'galaxy'); h.vSys.style.opacity = this.view === 'system' ? 1 : 0.8; h.vOrb.style.opacity = this.view === 'orbit' ? 1 : 0.8;
      // mission tracker
      const m = st.mission;
      h.mission.style.display = m || this.view !== 'galaxy' ? '' : '';
      let txt = '';
      if (m) txt = '<b>' + m.icon + ' Mission</b><br>' + m.text + (m.done ? '<br><span style="color:#86efac">✔ Done! Hail ' + this.gal.empires[m.emp].species + ' to report.</span>' : '') + (m.star !== undefined ? '<br><small>📍 ' + this.gal.stars[m.star].name + '</small>' : '');
      else txt = '<b>🎯 Goal</b><br>Reach the Galactic Core and the Staff of Life.<br><small>The Grox belt needs drive range ' + this.GATE_RANGE + ' (yours: ' + this.ss.range.toFixed(0) + ') - buy Drive Range in the Market (B) - or earn a Wormhole Key from an ally. Guardians protect the Staff.</small>';
      if (st.raids.length) txt += '<br><span style="color:#fca5a5">🚨 ' + st.raids.length + ' colony raid' + (st.raids.length > 1 ? 's' : '') + '! ' + this.gal.stars[st.raids[0].star].name + ' (' + Math.ceil(st.raids[0].t) + 's)</span>';
      if (h._missionTxt !== txt) { h.mission.innerHTML = txt; h._missionTxt = txt; }
      h.alert.style.display = this.hostilesNear(99999) && this.view === 'system' ? '' : 'none';
      if (h.alert.style.display === '') h.alert.textContent = '⚠ Hostiles: ' + this.hostileCount();
      this.updateHint();
      if (this.cardDirty || force || (this.cardT = (this.cardT || 0) + 1) % 4 === 0) this.refreshCard();
      if (this.view === 'orbit' && this.orb && this.orb.panel) this.orb.panel.sync();
    },
    updateHint: function () {
      const v = this.view; let t = '';
      if (v === 'galaxy') t = 'Drag: rotate · Right-drag / WASD: pan · Wheel: zoom · Click a star, then Jump (J)';
      else if (v === 'system') t = 'W thrust · A/D turn · Shift boost · Click planet: fly there · Hold mouse / Space: fire · Q ability · E orbit';
      else if (v === 'orbit') t = this.orb && this.orb.placing ? 'Click the surface on land to place your colony' : 'WASD fly over the surface · Wheel out to leave orbit · Terraform panel on the left';
      if (this.h.hint._t !== t) { this.h.hint.textContent = t; this.h.hint._t = t; }
    },

    refreshCard: function () {
      const h = this.h, ui = SP.ui, self = this; if (!h) return;
      this.cardDirty = false;
      const c = h.card; c.innerHTML = '';
      if (this.view === 'orbit') { c.style.display = 'none'; return; }
      const sel = this.sel;
      if (this.view === 'galaxy' && sel && sel.type === 'star') this.starCard(c, sel.i);
      else if (this.view === 'system' && sel && sel.type === 'planet') this.planetCard(c, sel.def);
      else { c.style.display = 'none'; return; }
      c.style.display = '';
    },
    starCard: function (c, i) {
      const gal = this.gal, s = gal.stars[i], st = this.st, ui = SP.ui, self = this, info = this.jumpInfo(i);
      const em = s.empire >= 0 ? gal.empires[s.empire] : null;
      const kv = function (k, v) { return '<div class="kv"><span>' + k + '</span><b>' + v + '</b></div>'; };
      let html = '<h3>' + (s.core ? '✨' : s.bh ? '🌀' : s.grox ? '☠️' : '⭐') + ' ' + s.name + '</h3><div class="sub">' + G().STAR_TYPES[s.type].label + (s.home ? ' · Your home' : '') + '</div>';
      html += kv('Distance', info.dist.toFixed(1) + ' pc') + kv('Jump cost', i === st.loc ? '-' : Math.ceil(info.cost) + ' ⚡ (you have ' + Math.floor(st.energy) + ')');
      if (em) { const r = this.rel(em.id); html += kv('Empire', '<span style="color:' + hex(em.color) + '">' + em.name + '</span>') + kv('Relation', r.war ? 'WAR' : r.ally ? 'Allied' : r.contact ? 'Attitude ' + Math.round(r.att) : 'Unknown'); }
      if (s.grox) html += kv('Hazard', '<span style="color:#fca5a5">GROX fleet</span>'); else if (s.pirates && st.cleared.indexOf(i) < 0) html += kv('Hazard', '<span style="color:#fca5a5">☠ pirates</span>');
      if (this.refuelStar(i)) html += kv('Colony', 'Safe harbour');
      if (st.visited.indexOf(i) >= 0 && !s.core && !s.bh) html += kv('Planets', G().planetsOf(gal, i, this.campaign).length);
      c.innerHTML = html;
      const btns = ui.el('div', 'btns');
      if (i === st.loc) btns.appendChild(ui.button('Enter system', { icon: '☀️', color: 'amber', small: true, onClick: function () { self.gotoView('system'); } }));
      else { const b = ui.button('Jump', { icon: '🚀', color: info.ok ? 'green' : 'slate', small: true, key: 'J', onClick: function () { self.startJump(i); } }); if (!info.ok) b.title = info.reason; btns.appendChild(b); if (!info.ok) btns.appendChild(ui.el('div', 'sub', info.reason)); }
      c.appendChild(btns);
    },
    planetCard: function (c, def) {
      const ps = this.psOf(def), ui = SP.ui, self = this, gal = this.gal;
      const kv = function (k, v) { return '<div class="kv"><span>' + k + '</span><b>' + v + '</b></div>'; };
      const T = G().tScore(ps), sc = ps.scanned || def.home;
      let html = '<h3>' + G().PTYPES[def.type].icon + ' ' + def.name + '</h3><div class="sub">' + G().PTYPES[def.type].label + ' planet' + (def.inhabited !== undefined ? ' · ' + gal.empires[def.inhabited].species + ' homeworld' : '') + '</div>';
      if (def.type === 'gas') html += kv('Surface', 'none (gas giant)');
      else if (sc) {
        const sp = def.spice >= 0 ? G().SPICES[def.spice] : null;
        html += kv('T-score', '<span class="sp-tpips">' + [0, 1, 2].map(function (k) { return k < T ? '⭐' : '☆'; }).join('') + '</span>') + kv('Spice', sp ? '<span style="color:' + hex(sp.color) + '">✨ ' + sp.name + '</span>' : 'none') + kv('Life', def.life);
        if (ps.colony) html += kv('Colony', 'level ' + ps.colony.level + ' · ✨' + Math.floor(ps.colony.store));
      } else html += '<div class="sub">Unscanned. Get close and press Scan (T).</div>';
      const d = this.ship.pos.distanceTo(this.planetWorld(def));
      html += kv('Distance', Math.round(d) + ' u');
      c.innerHTML = html;
      const btns = ui.el('div', 'btns');
      btns.appendChild(ui.button('Fly', { icon: '🧭', color: 'cyan', small: true, onClick: function () { self.autopilotTo(def, false); } }));
      if (!sc && def.type !== 'gas' && def.inhabited === undefined) btns.appendChild(ui.button('Scan', { icon: '🔬', color: 'purple', small: true, key: 'T', onClick: function () { self.scanSelected(); } }));
      if (def.type !== 'gas') btns.appendChild(ui.button('Orbit', { icon: '🪐', color: 'green', small: true, key: 'E', onClick: function () { self.autopilotTo(def, true); } }));
      if (def.inhabited !== undefined) btns.appendChild(ui.button('Hail', { icon: '📡', color: 'cyan', small: true, key: 'C', onClick: function () { self.hail(); } }));
      c.appendChild(btns);
    },

    // DOM pins that follow world positions
    pin: function (id, html, cls) {
      let p = this.pins[id];
      if (!p) { p = this.pins[id] = SP.ui.el('div', 'sp-pin'); this.h.root.appendChild(p); }
      if (p._html !== html) { p.innerHTML = html; p._html = html; }
      p._seen = this.t; return p;
    },
    placePin: function (p, world, dy) {
      const v = world.clone().project(this.camera);
      if (v.z > 1 || v.z < -1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) { p.style.display = 'none'; return; }
      p.style.display = ''; p.style.left = ((v.x * 0.5 + 0.5) * SP.render.width) + 'px'; p.style.top = ((-v.y * 0.5 + 0.5) * SP.render.height + (dy || 0)) + 'px';
    },
    updatePins: function () {
      const t = this.t, gal = this.gal, st = this.st;
      if (this.trans && this.trans.phase === 0 && this.trans.t > 0.1) { for (const k in this.pins) this.pins[k].style.display = 'none'; return; }
      if (this.view === 'galaxy') {
        const cur = gal.stars[st.loc];
        this.placePin(this.pin('here', '<i>🔻</i><span>You are here</span>'), cur.pos.clone().add(new V3(0, 1, 0)), -4);
        if (this.sel && this.sel.type === 'star') this.placePin(this.pin('sel', '<span>' + gal.stars[this.sel.i].name + '</span>'), gal.stars[this.sel.i].pos, -14); else this.hidePin('sel');
        if (this.hover !== null && (!this.sel || this.sel.i !== this.hover)) { const s = gal.stars[this.hover]; this.placePin(this.pin('hov', '<span>' + s.name + (s.empire >= 0 ? ' · ' + gal.empires[s.empire].species : '') + '</span>'), s.pos, -14); } else this.hidePin('hov');
        if (st.mission && st.mission.star !== undefined) this.placePin(this.pin('mis', '<i>🎯</i><span>' + st.mission.icon + '</span>'), gal.stars[st.mission.star].pos, -6); else this.hidePin('mis');
        // empire names
        gal.empires.forEach(function (em, i) { const p = this.pin('em' + i, '<span style="border-color:' + hex(em.color) + ';color:' + hex(em.color) + '">' + em.name + '</span>'); if (this.gc.dist < 130 && this.rel(i).contact) this.placePin(p, gal.stars[em.capital].pos, -22); else p.style.display = 'none'; }, this);
        // core label
        this.placePin(this.pin('core', '<span style="color:#fde047">✨ The Core</span>'), new V3(0, 3, 0), -18);
        this.hidePrefix('pl'); this.hidePin('ap');
      } else { this.hidePrefix('em'); this.hidePin('here'); this.hidePin('sel'); this.hidePin('hov'); this.hidePin('mis'); this.hidePin('core'); this.pinsSystem(); }
    },
    hidePin: function (id) { const p = this.pins[id]; if (p) p.style.display = 'none'; },
    hidePrefix: function (pre) { for (const k in this.pins) if (k.indexOf(pre) === 0) this.pins[k].style.display = 'none'; },

    hostileCount: function () { return this.enemies ? this.enemies.length : 0; },
    hostilesNear: function (r) {
      if (!this.enemies || !this.enemies.length || !this.ship) return false;
      if (r > 9000) return this.enemies.length > 0;
      for (let i = 0; i < this.enemies.length; i++) if (this.enemies[i].pos.distanceTo(this.ship.pos) < r) return true;
      return false;
    }
  };

  // debug / test hooks
  S.dev = {
    grant: function (n) { S.st.money += n; S.syncHud(true); },
    tp: function (si) { S.st.loc = si; if (S.st.visited.indexOf(si) < 0) S.st.visited.push(si); S.applyView('system'); S.arriveEffects(si, false); },
    full: function () { S.st.energy = S.ss.energyMax; S.st.hull = S.ss.hullMax; }
  };

  if (SP.game && SP.game.registerStage) SP.game.registerStage(S);
})();
