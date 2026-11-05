/* SP.civCity — cities of the Civilization stage: podium, buildings (SP.assembly), turrets, economy, capture meters, lights. */
(function () {
  'use strict';
  const SP = window.SP = window.SP || {};
  const V3 = THREE.Vector3, M4 = THREE.Matrix4, Q = THREE.Quaternion;
  const C = SP.civ, R = SP.render;
  const POD_R = 17.2, PLOT_R = 8.4, TURRET_R = 13.2, BS = 0.6, HS = 0.95, NPLOT = 8, MAX_TURRETS = 96;
  const ROLES = ['house', 'factory', 'entertainment'];
  const RING_CFG = { military: { r0: 14.3, r1: 15.1, col: 0xf43f5e }, economic: { r0: 15.3, r1: 16.1, col: 0xfacc15 }, religious: { r0: 16.3, r1: 17.0, col: 0xe879f9 } };
  const CS = SP.civCity = { POD_R: POD_R, ROLES: ROLES, NPLOT: NPLOT };

  const _m = new M4(), _q = new Q(), _s = new V3(), _p = new V3(), _y = new V3(0, 1, 0), _c = new THREE.Color();

  // ------------------------------------------------------------------ shared (per world) objects
  function glowTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }
  CS.init = function (W) {
    // turrets: two instanced meshes for the whole world
    const base = new THREE.CylinderGeometry(0.8, 1.05, 0.9, 8); base.translate(0, 0.45, 0);
    const head = C.mergeGeos([
      { geo: new THREE.SphereGeometry(0.72, 10, 8), matrix: new M4().makeTranslation(0, 0, 0) },
      { geo: new THREE.CylinderGeometry(0.16, 0.2, 1.7, 7), matrix: new M4().makeRotationX(Math.PI / 2).setPosition(0, 0.05, 1.0) }
    ]);
    W.tBase = R.celInstanced(base, 0x64748b, MAX_TURRETS, { outline: 0.08, cast: false, receive: false });
    W.tHead = R.celInstanced(head, 0xffffff, MAX_TURRETS, { material: new THREE.MeshBasicMaterial({ color: 0xffffff }), outline: 0.1, cast: false, receive: false });
    W.tBase.setCount(0); W.tHead.setCount(0);
    W.tFree = []; W.tN = 0; W.turrets = [];
    W.scene.add(W.tBase.group, W.tHead.group);
    // city lights: one Points object
    const N = 220;
    W.L = { n: 0, pos: new Float32Array(N * 3), col: new Float32Array(N * 3), base: new Float32Array(N * 3), city: [], N: N };
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(W.L.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(W.L.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    W.L.mat = new THREE.PointsMaterial({ size: 14, map: glowTexture(), vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: false });
    W.L.pts = new THREE.Points(g, W.L.mat); W.L.pts.frustumCulled = false; W.L.pts.renderOrder = 5;
    W.scene.add(W.L.pts);
    W.ringGeo = {};
    W.ringMat = {};
    Object.keys(RING_CFG).forEach(function (k) { W.ringMat[k] = new THREE.MeshBasicMaterial({ color: RING_CFG[k].col, side: THREE.DoubleSide, transparent: true, opacity: 0.95, depthWrite: false }); });
    W.ringBack = new THREE.MeshBasicMaterial({ color: 0x080c14, side: THREE.DoubleSide, transparent: true, opacity: 0.55, depthWrite: false });
  };
  CS.disposeShared = function (W) {
    [W.tBase, W.tHead].forEach(function (t) { if (t) { W.scene.remove(t.group); t.mesh.dispose(); if (t.outline) { t.outline.geometry.dispose(); } t.mesh.geometry.dispose(); } });
    if (W.L && W.L.pts) { W.L.pts.geometry.dispose(); W.L.mat.map.dispose(); W.L.mat.dispose(); }
    Object.keys(W.ringGeo || {}).forEach(function (k) { W.ringGeo[k].dispose(); });
  };

  // ------------------------------------------------------------------ site selection
  CS.siteScore = function (W, dir) {
    const pl = W.planet, sea = pl.seaRadius;
    let mn = 1e9, mx = -1e9;
    const up = dir, ref = C.randomTangent(dir, { range: function () { return 0.37; } }), o = new V3();
    const samp = function (ang, bear) {
      if (ang === 0) o.copy(dir); else C.offsetDir(dir, ref, bear, ang, o);
      const r = pl.surfaceRadius(o); mn = Math.min(mn, r); mx = Math.max(mx, r);
    };
    samp(0, 0);
    for (let i = 0; i < 6; i++) samp(10 / W.R, i * 1.047);
    for (let i = 0; i < 10; i++) samp(19 / W.R, i * 0.628);
    if (mn < sea + 0.7) return 1e9;
    return mx - mn;
  };
  // nearest decent building site around dir
  CS.findSite = function (W, dir, avoid, minSep) {
    const ref = C.randomTangent(dir, W.rng);
    let best = null, bs = 1e9;
    for (let ring = 0; ring <= 12; ring++) {
      const ang = (ring * 7) / W.R, nb = ring === 0 ? 1 : 10 + ring;
      for (let k = 0; k < nb; k++) {
        const d = ring === 0 ? dir.clone() : C.offsetDir(dir, ref, k / nb * 6.2832, ang);
        if (avoid && avoid.some(function (a) { return a.distanceTo(d) * W.R < minSep; })) continue;
        const s = CS.siteScore(W, d) + ring * 0.15;
        if (s < bs) { bs = s; best = d; }
      }
      if (best && bs < 3.2) break;
    }
    return best;
  };

  // ------------------------------------------------------------------ building rigs
  function hideGround(rig) { rig.root.traverse(function (o) { if (o.userData && o.userData.ground) o.visible = false; }); }
  function makeRig(design, scale) {
    const rig = SP.assembly.build(design);
    hideGround(rig);
    rig.root.scale.setScalar(scale);
    return rig;
  }
  CS.buildingStats = function (design) { return SP.assembly.stats(design); };
  CS.buildingCost = function (nation, role) { return Math.round(SP.assembly.stats(nation.designs[role]).cost); };

  function plotLocal(i) { const a = i / NPLOT * Math.PI * 2 + 0.3927; return new V3(Math.cos(a) * PLOT_R, 0, Math.sin(a) * PLOT_R); }

  // ------------------------------------------------------------------ create
  CS.create = function (W, nation, dir, name, o) {
    o = o || {};
    const pl = W.planet;
    const city = {
      id: 'c' + W.cities.length, name: name, nation: nation.id, dir: dir.clone(), plots: [], turrets: [], pending: [],
      hallHp: 0, hallMax: 0, happy: 60, riot: false, pop: 0, income: 0, trade: {}, convert: {}, lastAttacker: null, lastHit: -99,
      level: 0, prog: { military: 0, economic: 0, religious: 0 }, shield: 0, queue: [], port: null, rings: {}, lightIdx: [], underAttack: 0, anim: 0
    };
    // podium height from terrain samples
    const ref = C.randomTangent(dir, W.rng); city.ref = ref;
    let mn = 1e9, mx = -1e9; const tmp = new V3();
    for (let i = -1; i < 16; i++) {
      if (i < 0) tmp.copy(dir); else C.offsetDir(dir, ref, i * 0.7, (i < 6 ? 9 : 17) / W.R, tmp);
      const r = pl.surfaceRadius(tmp); mn = Math.min(mn, r); mx = Math.max(mx, r);
    }
    city.topR = Math.max(mx + 0.2, pl.seaRadius + 0.5);
    const frame = city.frame = new THREE.Group(); frame.name = 'city:' + name;
    frame.position.copy(dir).multiplyScalar(city.topR);
    C.orient(frame, dir, ref);
    city.pos = frame.position.clone();
    // podium
    const h = city.topR - mn + 3.0;
    const pod = R.cel(new THREE.CylinderGeometry(POD_R, POD_R + 0.9, h, 28), 0xd6d3d1, { outline: 0, cast: false, receive: false });
    pod.position.y = -h / 2; frame.add(pod);
    city.podMat = null;
    const rim = R.cel(new THREE.TorusGeometry(POD_R - 0.25, 0.42, 6, 40), nation.color, { outline: 0, cast: false, receive: false });
    rim.rotation.x = Math.PI / 2; rim.position.y = 0.05; frame.add(rim); city.rim = rim;
    const plaza = new THREE.Mesh(new THREE.CircleGeometry(PLOT_R + 3.4, 32), R.toon(0xf5f5f4)); plaza.rotation.x = -Math.PI / 2; plaza.position.y = 0.04; frame.add(plaza);
    const disc = new THREE.Mesh(new THREE.RingGeometry(4.3, 5.1, 32), R.toon(nation.color)); disc.rotation.x = -Math.PI / 2; disc.position.y = 0.07; frame.add(disc); city.disc = disc;
    // grass ring outside plaza
    const grass = new THREE.Mesh(new THREE.RingGeometry(PLOT_R + 3.4, POD_R - 0.6, 32), R.toon(0xa8a29e)); grass.rotation.x = -Math.PI / 2; grass.position.y = 0.03; frame.add(grass);
    // detail group (merged)
    city.detail = new THREE.Group(); frame.add(city.detail);
    // hall
    const hall = city.hall = makeRig(nation.designs.cityhall, HS); city.detail.add(hall.root);
    const hs = SP.assembly.stats(nation.designs.cityhall);
    city.hallMax = Math.round(160 + hs.health * 1.2); city.hallHp = city.hallMax;
    for (let i = 0; i < NPLOT; i++) city.plots.push({ i: i, local: plotLocal(i), role: null, rig: null });
    // turrets
    for (let k = 0; k < 4; k++) CS.addTurret(W, city, k / 4 * Math.PI * 2 + 0.0, nation);
    // rings
    Object.keys(RING_CFG).forEach(function (k) {
      const c = RING_CFG[k];
      const back = new THREE.Mesh(new THREE.RingGeometry(c.r0, c.r1, 48, 1), W.ringBack); back.rotation.x = -Math.PI / 2; back.position.y = 0.09; back.visible = false;
      const fg = new THREE.Mesh(new THREE.RingGeometry(c.r0 + 0.07, c.r1 - 0.07, 48, 1), W.ringMat[k]); fg.rotation.x = -Math.PI / 2; fg.position.y = 0.11; fg.visible = false; fg.renderOrder = 3;
      // rotate so the arc starts at the top of the screen-ish and runs clockwise (viewed from above)
      frame.add(back, fg); city.rings[k] = { back: back, fg: fg, v: -1 };
    });
    // flag pole with team flag beside hall
    const pole = R.cel(new THREE.CylinderGeometry(0.1, 0.1, 5, 6), 0x475569, { outline: 0.2 }); pole.position.set(-3.6, 2.5, 3.6); frame.add(pole);
    const flag = R.cel(new THREE.BoxGeometry(2.0, 1.1, 0.1), nation.color, { outline: 0.1 }); flag.position.set(-2.6, 4.4, 3.6); frame.add(flag); city.flag = flag; city.flagMat = flag.material;
    W.scene.add(frame);
    // port: nearest deep water
    city.port = CS.findPort(W, dir);
    return city;
  };

  CS.findPort = function (W, dir) {
    const pl = W.planet, ref = C.randomTangent(dir, { range: function () { return 0.21; } }), o = new V3();
    for (let r = 20; r <= 110; r += 6) {
      const nb = Math.max(12, Math.round(r / 3));
      for (let k = 0; k < nb; k++) {
        C.offsetDir(dir, ref, k / nb * 6.2832, r / W.R, o);
        if (pl.surfaceRadius(o) < pl.seaRadius - 0.6) {
          // require a bit of water around
          const o2 = new V3(); C.offsetDir(o, ref, 1, 4 / W.R, o2);
          if (pl.surfaceRadius(o2) < pl.seaRadius - 0.3) return o.clone();
        }
      }
    }
    return null;
  };

  // ------------------------------------------------------------------ turrets
  CS.addTurret = function (W, city, ang, nation) {
    const idx = W.tFree.length ? W.tFree.pop() : W.tN++;
    if (idx >= MAX_TURRETS) return null;
    const local = new V3(Math.cos(ang) * TURRET_R, 0, Math.sin(ang) * TURRET_R);
    const t = { city: city, idx: idx, local: local, ang: ang, hp: 120, maxHp: 120, alive: true, yaw: ang, cd: 0, world: new V3(), hit: 0, rebuild: 0 };
    city.turrets.push(t); W.turrets.push(t);
    W.tBase.setCount(W.tN); W.tHead.setCount(W.tN);
    CS.placeTurret(W, t, nation);
    return t;
  };
  CS.placeTurret = function (W, t, nation) {
    const city = t.city;
    t.world.copy(t.local).applyMatrix4(city.frame.matrixWorld.clone().multiply(new M4()));
    city.frame.updateMatrixWorld(true);
    t.world.copy(t.local).applyMatrix4(city.frame.matrixWorld);
    CS.writeTurret(W, t, nation || W.nationById[city.nation]);
  };
  CS.writeTurret = function (W, t, nation) {
    const city = t.city, sc = t.alive ? 1 + t.hit * 0.25 : 0.0001;
    _q.copy(city.frame.quaternion);
    _m.compose(t.world, _q, _s.set(sc, sc, sc)); W.tBase.setMatrixAt(t.idx, _m);
    const hq = new Q().setFromAxisAngle(_y, t.yaw);
    _q.copy(city.frame.quaternion).multiply(hq);
    _p.set(0, 0.95 * sc, 0).applyQuaternion(city.frame.quaternion).add(t.world);
    _m.compose(_p, _q, _s.set(sc, sc, sc)); W.tHead.setMatrixAt(t.idx, _m);
    if (nation) { _c.setHex(nation.color); W.tHead.setColorAt(t.idx, _c); }
  };

  // ------------------------------------------------------------------ buildings
  CS.freePlot = function (city) { for (let i = 0; i < NPLOT; i++) if (!city.plots[i].role) return city.plots[i]; return null; };
  CS.count = function (city, role) { return city.plots.filter(function (p) { return p.role === role; }).length; };
  CS.remerge = function (city) {
    const roots = [city.hall.root]; city.plots.forEach(function (p) { if (p.rig && !p.popping) roots.push(p.rig.root); });
    city.merge = C.mergeStatic(city.detail, roots, city.merge);
    city.anims = city.merge.anims;
  };
  CS.addBuilding = function (W, city, role, plotIdx, instant) {
    const nation = W.nationById[city.nation];
    const plot = plotIdx !== undefined && plotIdx !== null ? city.plots[plotIdx] : CS.freePlot(city);
    if (!plot || plot.role) return null;
    const rig = makeRig(nation.designs[role], BS);
    plot.role = role; plot.rig = rig; plot.design = nation.designs[role];
    rig.root.position.copy(plot.local);
    rig.root.rotation.y = Math.atan2(-plot.local.x, -plot.local.z);
    city.detail.add(rig.root);
    if (instant) { rig.root.updateMatrixWorld(true); CS.remerge(city); }
    else { plot.popping = 0.0001; rig.root.scale.setScalar(0.001); city.dirty = true; }
    CS.addLight(W, city, plot.local, role);
    return plot;
  };
  CS.removeBuilding = function (W, city, plot) {
    if (!plot.rig) return;
    city.detail.remove(plot.rig.root); plot.rig.dispose(); plot.rig = null; plot.role = null; plot.popping = 0;
    CS.remerge(city);
  };
  // replace all buildings of a role in this city with the nation's current design
  CS.refreshRole = function (W, city, role) {
    const nation = W.nationById[city.nation]; let ch = false;
    city.plots.forEach(function (p) {
      if (p.role !== role) return;
      city.detail.remove(p.rig.root); p.rig.dispose();
      const rig = makeRig(nation.designs[role], BS); rig.root.position.copy(p.local); rig.root.rotation.y = Math.atan2(-p.local.x, -p.local.z);
      city.detail.add(rig.root); p.rig = rig; p.design = nation.designs[role]; ch = true;
    });
    if (ch) { city.detail.updateMatrixWorld(true); CS.remerge(city); }
  };
  CS.refreshHall = function (W, city) {
    const nation = W.nationById[city.nation];
    city.detail.remove(city.hall.root); city.hall.dispose();
    city.hall = makeRig(nation.designs.cityhall, HS); city.detail.add(city.hall.root);
    city.detail.updateMatrixWorld(true); CS.remerge(city);
  };

  CS.addLight = function (W, city, local, role) {
    const L = W.L; if (L.n >= L.N) return;
    const i = L.n++;
    _p.copy(local); _p.y = role === 'factory' ? 1.6 : 1.3;
    city.frame.updateMatrixWorld(true);
    _p.applyMatrix4(city.frame.matrixWorld);
    L.pos[i * 3] = _p.x; L.pos[i * 3 + 1] = _p.y; L.pos[i * 3 + 2] = _p.z;
    const warm = role === 'entertainment' ? [1, 0.45, 0.9] : role === 'factory' ? [1, 0.7, 0.3] : [1, 0.85, 0.5];
    L.base[i * 3] = warm[0]; L.base[i * 3 + 1] = warm[1]; L.base[i * 3 + 2] = warm[2];
    L.city[i] = city; city.lightIdx.push(i);
    L.pts.geometry.setDrawRange(0, L.n);
    L.pts.geometry.attributes.position.needsUpdate = true;
  };

  // ------------------------------------------------------------------ economy
  CS.compute = function (W, city) {
    const nation = W.nationById[city.nation];
    let pop = 4, factories = 0, factOut = 0, hap = 0, nb = 0;
    const adjHouse = function (i) { return city.plots[(i + 1) % NPLOT].role === 'house' || city.plots[(i + NPLOT - 1) % NPLOT].role === 'house'; };
    const hs = SP.assembly.stats(nation.designs.cityhall);
    hap += 55 + (hs.happiness || 0);
    const prod = [];
    city.plots.forEach(function (p) {
      if (!p.role) return;
      nb++;
      const st = SP.assembly.stats(p.design || nation.designs[p.role]);
      if (p.role === 'house') pop += (st.capacity || 4) * 1.5;
      else if (p.role === 'factory') { factories++; prod.push({ st: st, adj: adjHouse(p.i) }); hap -= 9; }
      else if (p.role === 'entertainment') hap += (st.happiness || 10) * (adjHouse(p.i) ? 1.5 : 1);
    });
    const need = factories * 5, workers = Math.max(0, pop - 4);
    const eff = need > 0 ? Math.min(1, workers / need) : 1;
    prod.forEach(function (f) { factOut += (f.st.production || 8) * 5 * (f.adj ? 1.5 : 1) * eff; });
    hap -= Math.max(0, pop - 14) * 0.9;
    if (city.underAttack > 0) hap -= 8;
    hap += (city.hapBonus || 0);
    city.pop = Math.round(pop); city.happy = Math.max(0, Math.min(100, hap)); city.level = nb;
    city.baseIncome = 28 + pop * 2.5 + factOut;
    city.factoryIdle = factories > 0 && eff < 0.99;
    city.nBuildings = nb;
    return city;
  };
  CS.MIN_PRICE = 450;
  CS.price = function (city) { const p = 450 + 140 * (city.level || 0) + 60 * ((city.turrets && city.turrets.length) || 0); return Math.max(CS.MIN_PRICE, isFinite(p) ? p : CS.MIN_PRICE); };
  // price the player actually pays: base price with a full trade ring, up to 2x for an open-market buy-out without trade (any card, owner must not be at war)
  CS.buyPrice = function (city, nationId) { const tr = Math.min(100, (city.trade && city.trade[nationId]) || 0); return Math.max(CS.MIN_PRICE, Math.round(CS.price(city) * (2.0 - tr / 100))); };

  // ------------------------------------------------------------------ capture meters
  CS.setRing = function (W, city, kind, v, tint) {
    const r = city.rings[kind]; if (!r) return;
    const show = v > 0.004;
    r.back.visible = show; r.fg.visible = show;
    if (!show) { r.v = -1; return; }
    if (Math.abs(v - r.v) < 0.006) return;
    r.v = v;
    const c = RING_CFG[kind];
    r.fg.geometry.dispose();
    r.fg.geometry = new THREE.RingGeometry(c.r0 + 0.07, c.r1 - 0.07, 48, 1, Math.PI / 2, -Math.PI * 2 * Math.min(1, v));
  };

  // ------------------------------------------------------------------ ownership
  CS.setOwner = function (W, city, nation, method) {
    const old = W.nationById[city.nation];
    city.nation = nation.id;
    city.rim.material = R.toon(nation.color); city.disc.material = R.toon(nation.color); city.flag.material = R.toon(nation.color);
    // rebuild turrets
    city.turrets.forEach(function (t) { t.alive = true; t.hp = t.maxHp * 0.6; t.cd = 0; t.hit = 0; CS.writeTurret(W, t, nation); });
    city.hallHp = Math.round(city.hallMax * 0.45);
    city.trade = {}; city.convert = {}; city.shield = 0; city.queue = [];
    city.riot = false; city.hapBonus = 0;
    // buildings keep their look; swap the hall + buildings to the new owner's designs only for new construction
    return old;
  };

  // ------------------------------------------------------------------ per-frame
  CS.update = function (W, city, dt, camDist, nearCam) {
    const nation = W.nationById[city.nation];
    city.anim += dt;
    // popping buildings
    let pops = false;
    city.plots.forEach(function (p) {
      if (!p.popping) return;
      p.popping += dt; const k = Math.min(1, p.popping / 0.8);
      const e = k < 1 ? 1 + 2.70158 * Math.pow(k - 1, 3) + 1.70158 * Math.pow(k - 1, 2) : 1;
      p.rig.root.scale.setScalar(BS * Math.max(0.001, e)); p.rig.root.rotation.y = Math.atan2(-p.local.x, -p.local.z) + (1 - k) * 2.5;
      if (k >= 1) { p.popping = 0; pops = true; }
    });
    if (pops) { city.detail.updateMatrixWorld(true); CS.remerge(city); }
    if (nearCam && city.anims) {
      city.hall.animate(dt, {}); city.plots.forEach(function (p) { if (p.rig) p.rig.animate(dt, {}); });
    }
    // turret regen, hit flash
    city.underAttack = Math.max(0, city.underAttack - dt);
    city.turrets.forEach(function (t) {
      if (t.hit > 0) { t.hit = Math.max(0, t.hit - dt * 3); CS.writeTurret(W, t, nation); }
      if (!t.alive) { t.rebuild += dt; if (t.rebuild > 45 && city.underAttack <= 0) { t.alive = true; t.hp = t.maxHp; t.rebuild = 0; CS.writeTurret(W, t, nation); } }
    });
    if (city.underAttack <= 0 && city.hallHp < city.hallMax) city.hallHp = Math.min(city.hallMax, city.hallHp + dt * 1.2);
    city.shield = Math.max(0, city.shield - dt);
    // flag wave
    city.flag.rotation.y = Math.sin(city.anim * 3) * 0.25;
    // rings: show highest progress per method (+ hall damage)
    const hallFrac = 1 - city.hallHp / city.hallMax;
    let tr = 0, cv = 0;
    for (const k in city.trade) tr = Math.max(tr, city.trade[k] / 100);
    for (const k in city.convert) cv = Math.max(cv, city.convert[k] / 100);
    CS.setRing(W, city, 'military', hallFrac > 0.01 ? hallFrac : 0);
    CS.setRing(W, city, 'economic', tr);
    CS.setRing(W, city, 'religious', cv);
    // riot flicker on rim
    if (city.riot) city.rim.material = R.toon(Math.floor(city.anim * 4) % 2 ? 0xf43f5e : nation.color);
  };

  // lights colour update (call a few times a second)
  CS.updateLights = function (W, t) {
    const L = W.L; if (!L.n) return;
    const sd = W.sky.sunDir;
    for (let i = 0; i < L.n; i++) {
      const c = L.city[i]; if (!c) continue;
      const night = Math.max(0, Math.min(1, (-c.dir.dot(sd) + 0.08) / 0.3));
      const nat = W.nationById[c.nation];
      const fl = 0.85 + 0.15 * Math.sin(t * 3 + i * 1.7);
      let r = L.base[i * 3], g = L.base[i * 3 + 1], b = L.base[i * 3 + 2];
      if (c.riot) { r = 1; g = 0.2; b = 0.15; }
      const k = night * fl;
      L.col[i * 3] = r * k; L.col[i * 3 + 1] = g * k; L.col[i * 3 + 2] = b * k;
    }
    L.pts.geometry.attributes.color.needsUpdate = true;
  };

  CS.dispose = function (W, city) {
    W.scene.remove(city.frame);
    city.frame.traverse(function (o) { if (o.geometry && !o.geometry.userData.keep) o.geometry.dispose(); });
    city.turrets.forEach(function (t) { W.tFree.push(t.idx); });
  };
})();
