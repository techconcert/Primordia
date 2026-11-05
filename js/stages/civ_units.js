/* SP.civUnits — vehicles of the Civilization stage: build, move over the sphere, fight, trade, convert, claim spice. */
(function () {
  'use strict';
  const SP = window.SP = window.SP || {};
  const V3 = THREE.Vector3, M4 = THREE.Matrix4, Q = THREE.Quaternion;
  const C = SP.civ, R = SP.render;
  const VS = 0.85;                       // vehicle rig scale
  const CAPS = { land: 8, sea: 6, air: 4 };
  const TURRET_DMG = 4.5;                // per shot (every 0.9 s); was 6.5, which out-scaled any non-military assault (balance pass)
  const MAX_PROXY = 200, MAX_TRACER = 64, DETAIL_N = 12, DETAIL_DIST = 105;
  const U = SP.civUnits = { VS: VS, CAPS: CAPS };
  // Player upgrades (money sink for late game): 5 tiers each, fleet command 3 tiers (more vehicle slots). cost = base * (tier + 1)
  U.TECH = {
    fire: { icon: '🔫', name: 'Weapons', max: 5, base: 1000, desc: '+18% vehicle damage per tier' },
    armor: { icon: '🛡️', name: 'Armour', max: 5, base: 1000, desc: '-9% damage taken per tier' },
    persuade: { icon: '📣', name: 'Persuasion', max: 5, base: 1000, desc: '+20% trade and conversion speed per tier' },
    fleet: { icon: '🏭', name: 'Fleet command', max: 3, base: 1500, desc: '+2 land, +1 sea, +1 air vehicle slots per tier' }
  };
  const FLEET_STEP = { land: 2, sea: 1, air: 1 };
  U.techLevel = function (W, nationId, key) { const n = W.nationById[nationId]; return (n && n.isPlayer && n.tech && n.tech[key]) || 0; };
  U.techCost = function (W, key) { const t = U.TECH[key], lv = U.techLevel(W, W.player.id, key); return lv >= t.max ? 0 : t.base * (lv + 1); };
  U.cap = function (W, nationId, role) { return CAPS[role] + U.techLevel(W, nationId, 'fleet') * FLEET_STEP[role]; };
  U.buyTech = function (W, key) {
    const pl = W.player, t = U.TECH[key]; if (!t) return false;
    const cost = U.techCost(W, key); if (!cost || pl.money < cost) return false;
    pl.money -= cost; pl.tech = pl.tech || {}; pl.tech[key] = (pl.tech[key] || 0) + 1; return true;
  };

  const _m = new M4(), _q = new Q(), _s = new V3(), _v = new V3(), _w = new V3(), _c = new THREE.Color(), _o = new THREE.Object3D();

  // ------------------------------------------------------------------ stats
  U.vstats = function (design) {
    const st = SP.assembly.stats(design), dd = SP.assemblyParts;
    let mil = 0, eco = 0, rel = 0;
    (design.parts || []).forEach(function (pt) {
      const pd = dd.get(pt.id); if (!pd) return; const p = (pd.stats.power || 0) * (pt.mirror ? 2 : 1);
      if (!p) return;
      if (pd.id === 'v_sales') eco += p; else if (pd.id === 'v_preacher') rel += p; else mil += p;
    });
    const kind = mil <= 0 && eco <= 0 && rel <= 0 ? 'none' : (rel > mil && rel >= eco ? 'religious' : eco > mil ? 'economic' : 'military');
    return { hp: Math.max(30, st.health) * 1.3, speed: st.speed, defense: st.defense || 0, mil: mil, eco: eco, rel: rel, kind: kind,
      range: 11 + (st.range || 0) * 2.2, cost: Math.round(st.cost), role: design.role };
  };
  U.speedOf = function (v) {
    let s = Math.max(3.8, Math.min(20, 2.6 + v.st.speed * 0.95));
    if (v.role === 'air') s *= 1.45; else if (v.role === 'sea') s *= 0.9;
    return s * (v.boost > 0 ? 1.3 : 1);
  };
  U.hostile = function (W, a, b) { return a !== b && W.getRel(a, b) <= -30; };

  // swap the power part of a vehicle design (military <-> trade <-> holo)
  U.variant = function (design, kind) {
    const d = SP.assembly.clone(design), dd = SP.assemblyParts;
    const target = kind === 'economic' ? 'v_sales' : kind === 'religious' ? 'v_preacher' : null;
    let found = false;
    d.parts.forEach(function (p) {
      const pd = dd.get(p.id);
      if (pd && pd.category === 'weapons') {
        found = true;
        if (target) p.id = target;
        else if (p.id === 'v_sales' || p.id === 'v_preacher') p.id = 'v_cannon';
      }
    });
    if (!found) {
      const id = target || 'v_gun';
      const r = d.role === 'air' ? [0, 10, 0.1] : d.role === 'sea' ? [0, 10, 0.2] : [0, 10, 0.6];
      SP.assembly.addPart(d, id, r[0], r[1], r[2], 0, -1, 0);
    }
    return d;
  };

  // ------------------------------------------------------------------ init / dispose
  U.init = function (W) {
    const g = { land: new THREE.BoxGeometry(1.2, 0.8, 2.0), sea: null, air: null };
    g.land = C.mergeGeos([{ geo: new THREE.BoxGeometry(1.3, 0.55, 2.0), matrix: new M4().makeTranslation(0, 0.4, 0) }, { geo: new THREE.BoxGeometry(0.9, 0.5, 0.9), matrix: new M4().makeTranslation(0, 0.9, -0.15) }]);
    g.sea = C.mergeGeos([{ geo: new THREE.BoxGeometry(1.2, 0.5, 1.8), matrix: new M4().makeTranslation(0, 0.3, -0.2) }, { geo: new THREE.ConeGeometry(0.85, 1.0, 4), matrix: new M4().makeRotationX(Math.PI / 2).multiply(new M4().makeRotationY(Math.PI / 4)).setPosition(0, 0.3, 1.2) }, { geo: new THREE.BoxGeometry(0.6, 0.6, 0.7), matrix: new M4().makeTranslation(0, 0.8, -0.4) }]);
    g.air = C.mergeGeos([{ geo: new THREE.ConeGeometry(0.55, 2.2, 6), matrix: new M4().makeRotationX(Math.PI / 2).setPosition(0, 0.5, 0) }, { geo: new THREE.BoxGeometry(2.6, 0.12, 0.8), matrix: new M4().makeTranslation(0, 0.5, -0.3) }]);
    W.proxy = {};
    ['land', 'sea', 'air'].forEach(function (k) {
      const ci = R.celInstanced(g[k], 0xffffff, MAX_PROXY, { material: new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: R.gradientMap }), outline: 0.1, cast: false, receive: false });
      for (let i = 0; i < MAX_PROXY; i++) ci.setColorAt(i, _c.setHex(0xffffff));
      ci.setCount(0); W.scene.add(ci.group); W.proxy[k] = ci;
    });
    // tracers
    const tg = new THREE.BoxGeometry(0.2, 0.2, 1.4);
    W.tracerMesh = new THREE.InstancedMesh(tg, new THREE.MeshBasicMaterial({ color: 0xffffff }), MAX_TRACER);
    W.tracerMesh.frustumCulled = false; W.tracerMesh.count = 0; W.tracerMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < MAX_TRACER; i++) W.tracerMesh.setColorAt(i, _c.setHex(0xffffff));
    W.scene.add(W.tracerMesh); W.tracers = [];
    // shock spheres
    W.shocks = [];
    W.shockGeo = new THREE.SphereGeometry(1, 12, 8);
    // trade lines
    W.tradeLines = [];
    W.tradeGeo = new THREE.CylinderGeometry(0.11, 0.11, 1, 5); W.tradeGeo.translate(0, 0.5, 0);
    W.tradeMat = new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.8, depthWrite: false });
    W.coinGeo = new THREE.OctahedronGeometry(0.34, 0);
    W.coinMat = new THREE.MeshBasicMaterial({ color: 0xfff176 });
    W.holoMat = new THREE.MeshBasicMaterial({ color: 0xe879f9, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    W.holos = {};
  };
  U.dispose = function (W) {
    ['land', 'sea', 'air'].forEach(function (k) { const ci = W.proxy[k]; W.scene.remove(ci.group); ci.mesh.geometry.dispose(); ci.outline && ci.outline.geometry.dispose(); ci.mesh.dispose(); });
    W.tracerMesh.geometry.dispose(); W.tracerMesh.material.dispose();
    W.shockGeo.dispose(); W.tradeGeo.dispose(); W.tradeMat.dispose(); W.coinGeo.dispose(); W.coinMat.dispose(); W.holoMat.dispose();
  };

  // ------------------------------------------------------------------ spawn
  U.count = function (W, nationId, role) {
    let n = 0;
    W.vehicles.forEach(function (v) { if (v.nation === nationId && v.role === role) n++; });
    W.cities.forEach(function (c) { if (c.nation === nationId) c.queue.forEach(function (q) { if (q.role === role) n++; }); });
    return n;
  };
  U.spawnPoint = function (W, city, role) {
    if (role === 'air') return city.dir.clone();
    if (role === 'sea') return city.port ? city.port.clone() : null;
    const ref = city.ref;
    for (let k = 0; k < 14; k++) {
      const d = C.offsetDir(city.dir, ref, W.rng.range(0, 6.28), (POD() + 4.5 + (k > 8 ? 8 : 0)) / W.R);
      if (W.passable('land', d)) return d;
    }
    return null;
  };
  function POD() { return SP.civCity.POD_R; }

  U.spawn = function (W, nation, role, design, dir, opts) {
    opts = opts || {};
    const v = {
      id: W.nextId++, nation: nation.id, role: role, design: design, st: U.vstats(design),
      dir: dir.clone(), heading: C.randomTangent(dir, W.rng), pos: new V3(), up: dir.clone(),
      speed: 0, order: null, cd: 0, scan: Math.random() * 0.3, obj: new THREE.Group(), rig: null, mode: 'proxy', farT: 0,
      popT: opts.instant ? 1 : 0, stuck: 0, avoid: 0, avoidT: 0, boost: 0, work: null, claim: 0, bob: Math.random() * 6, turnRate: 0, alive: true, sel: false, flash: 0
    };
    v.hp = v.maxHp = v.st.hp;
    v.obj.visible = false; W.scene.add(v.obj);
    U.place(W, v);
    W.vehicles.push(v);
    if (!opts.instant) { W.fx.burst(v.pos, nation.color, 14, 1.2, { up: v.up, size: 0.3 }); W.fx.burst(v.pos, 0xffffff, 8, 0.8, { up: v.up, size: 0.2 }); }
    return v;
  };

  U.groundR = function (W, v) {
    if (v.role === 'air') return Math.max(W.heightAt(v.dir), W.planet.seaRadius) + 6 + Math.sin(W.t * 1.7 + v.bob) * 0.35;
    if (v.role === 'sea') return W.planet.seaRadius + 0.03 + Math.sin(W.t * 2 + v.bob) * 0.05;
    return W.heightAt(v.dir) + 0.04;
  };
  U.place = function (W, v) {
    const r = U.groundR(W, v);
    v.pos.copy(v.dir).multiplyScalar(r); v.up.copy(v.dir);
    v.obj.position.copy(v.pos);
    C.orient(v.obj, v.up, v.heading);
  };

  U.ensureRig = function (W, v) {
    if (v.rig) return;
    v.rig = SP.assembly.build(v.design);
    v.rig.root.scale.setScalar(VS);
    v.obj.add(v.rig.root);
    v.obj.updateMatrixWorld(true);
    v.merge = C.mergeStatic(v.obj, [v.rig.root], null);
  };
  U.dropRig = function (W, v) {
    if (!v.rig) return;
    v.obj.remove(v.rig.root); if (v.merge) { v.obj.remove(v.merge.group); v.merge.group.traverse(function (o) { if (o.geometry) o.geometry.dispose(); }); v.merge = null; }
    v.rig.dispose(); v.rig = null;
  };

  // ------------------------------------------------------------------ orders
  U.order = function (W, v, o) { v.order = o; v.stuck = 0; v.claim = 0; v.work = null; };
  U.orderTargetDir = function (W, v) {
    const o = v.order; if (!o) return null;
    switch (o.type) {
      case 'move': return o.dir;
      case 'claim': return o.g.dir;
      case 'attack': return o.v ? o.v.dir : o.city ? o.city.dir : null;
      case 'work': return o.city.dir;
    }
    return null;
  };

  // ------------------------------------------------------------------ damage / death
  U.explode = function (W, pos, size, color) {
    W.fx.burst(pos, 0xf97316, Math.round(8 + size * 6), 0.9 + size * 0.5, { size: 0.35 + size * 0.2, life: 0.9, up: pos.clone().normalize() });
    W.fx.burst(pos, 0xfde047, Math.round(6 + size * 4), 0.7 + size * 0.4, { size: 0.3 + size * 0.15, life: 0.7, up: pos.clone().normalize() });
    W.fx.burst(pos, 0x1e293b, Math.round(4 + size * 3), 0.6 + size * 0.3, { size: 0.4, life: 1.2, gravity: -1.5, up: pos.clone().normalize() });
    if (color) W.fx.burst(pos, color, 6, 0.8, { size: 0.25, up: pos.clone().normalize() });
    const mat = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending });
    const m = new THREE.Mesh(W.shockGeo, mat); m.position.copy(pos); m.scale.setScalar(0.5); W.scene.add(m);
    W.shocks.push({ m: m, t: 0, dur: 0.5, size: 1.6 + size * 1.4 });
    if (SP.audio) SP.audio.sfx(size > 2 ? 'die' : 'hit', { vol: size > 2 ? 0.7 : 0.35 });
  };
  U.tracer = function (W, a, b, color) {
    if (W.tracers.length >= MAX_TRACER) return;
    W.tracers.push({ a: a.clone(), b: b.clone(), t: 0, dur: 0.16 + a.distanceTo(b) * 0.006, c: color });
  };

  U.markWar = function (W, a, b) {
    if (a === b) return;
    if (W.getRel(a, b) > -45) {
      const was = U.hostile(W, a, b);
      W.setRel(a, b, -60);
      if (!was && (a === W.player.id || b === W.player.id)) {
        const o = W.nationById[a === W.player.id ? b : a];
        W.toast(o.name + ' is now at war with you!', '⚔️');
      }
    }
  };

  U.hitVehicle = function (W, v, dmg, from) {
    if (!v.alive) return;
    dmg *= 1 - v.st.defense / (v.st.defense + 30);
    dmg *= 1 - 0.09 * U.techLevel(W, v.nation, 'armor');
    v.hp -= dmg; v.flash = 0.12;
    if (from !== undefined && from !== null) U.markWar(W, v.nation, from);
    if (v.hp <= 0) U.kill(W, v, from);
  };
  U.kill = function (W, v, from) {
    if (!v.alive) return; v.alive = false;
    U.explode(W, v.pos, v.role === 'air' ? 1.6 : 1.2, W.nationById[v.nation].color);
    W.scene.remove(v.obj); U.dropRig(W, v);
    const i = W.vehicles.indexOf(v); if (i >= 0) W.vehicles.splice(i, 1);
    const j = W.sel.indexOf(v); if (j >= 0) W.sel.splice(j, 1);
    if (v.nation === W.player.id) { W.toast('Lost a ' + v.role + ' vehicle', '💥'); if (W.onSelChange) W.onSelChange(); }
  };

  U.hitTurret = function (W, t, dmg, fromNation) {
    if (!t.alive) return;
    const city = t.city;
    t.hp -= dmg; t.hit = 1; city.underAttack = 8; city.lastAttacker = fromNation; city.lastHit = W.t;
    U.markWar(W, city.nation, fromNation);
    if (t.hp <= 0) {
      t.alive = false; t.rebuild = 0; U.explode(W, t.world, 1.6);
      if (city.turrets.every(function (x) { return !x.alive; })) { W.toast(W.nationById[city.nation].name + ' defences down at ' + city.name, '💥', 2000); }
    }
    SP.civCity.writeTurret(W, t, W.nationById[city.nation]);
  };
  U.hitHall = function (W, city, dmg, fromNation) {
    city.underAttack = 8; city.lastAttacker = fromNation; city.lastHit = W.t;
    U.markWar(W, city.nation, fromNation);
    if (city.turrets.some(function (t) { return t.alive; })) { city.shield = 0.4; return; }
    city.hallHp -= dmg;
    if (Math.random() < 0.3) W.fx.burst(city.pos.clone().addScaledVector(city.dir, 2), 0xf97316, 3, 0.7, { up: city.dir, size: 0.3 });
    if (city.hallHp <= 0) { city.hallHp = 0; W.captureCity(city, W.nationById[fromNation], 'military'); }
  };

  // ------------------------------------------------------------------ geysers
  U.updateClaim = function (W, v, dt) {
    const o = v.order; if (!o || o.type !== 'claim') return;
    const g = o.g;
    const need = v.role === 'sea' ? 7.5 : 4.2;
    if (v.pos.distanceTo(g.pos) > need) return;
    if (g.owner === v.nation) { v.order = null; return; }
    if (g.owner && !U.hostile(W, g.owner, v.nation)) { if (v.nation === W.player.id) W.toast('That derrick belongs to ' + W.nationById[g.owner].name + ' (not at war)', '🚫'); v.order = null; return; }
    v.claim += dt * (v.boost > 0 ? 1.3 : 1);
    if (Math.random() < dt * 8) W.fx.burst(g.pos, W.nationById[v.nation].color, 1, 0.6, { up: g.dir, size: 0.25 });
    if (v.claim >= 2.4) { W.claimGeyser(g, W.nationById[v.nation]); v.order = null; v.claim = 0; }
  };

  // ------------------------------------------------------------------ route planning (coarse A* over the land / sea grid, string-pulled with line-of-sight tests)
  // Local feelers alone circle forever round lakes and bays, so a vehicle whose straight line is blocked follows waypoints.
  function los(W, role, a, b) {
    const n = Math.max(1, Math.ceil(C.angleBetween(a, b) * W.R / 3.5));
    for (let i = 1; i <= n; i++) { _c3.lerpVectors(a, b, i / n).normalize(); if (!W.passable(role, _c3)) return false; }
    return true;
  }
  const _c3 = new V3();
  function gridCell(W, dir) {
    const g = W.grid, lat = Math.asin(Math.max(-1, Math.min(1, dir.y))), lon = Math.atan2(dir.z, dir.x);
    return Math.min(g.NY - 1, Math.max(0, Math.floor((lat / Math.PI + 0.5) * g.NY))) * g.NX + Math.min(g.NX - 1, Math.max(0, Math.floor((lon + Math.PI) / (Math.PI * 2) * g.NX)));
  }
  function cellDir(W, i, out) {
    const g = W.grid, x = i % g.NX, y = (i / g.NX) | 0, lat = ((y + 0.5) / g.NY - 0.5) * Math.PI, lon = ((x + 0.5) / g.NX) * Math.PI * 2 - Math.PI;
    return out.set(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon));
  }
  U.findPath = function (W, role, from, to) {
    const g = W.grid; if (!g || role === 'air') return null;
    const want = role === 'sea' ? 0 : 1, N = g.NX * g.NY, s0 = gridCell(W, from), g0 = gridCell(W, to);
    const gs = new Float32Array(N).fill(1e9), prev = new Int32Array(N).fill(-1), done = new Uint8Array(N);
    const heap = [], push = function (i, f) { heap.push([f, i]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; const t = heap[p]; heap[p] = heap[k]; heap[k] = t; k = p; } };
    const pop = function () { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { let l = 2 * k + 1, r = l + 1, m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; const t = heap[m]; heap[m] = heap[k]; heap[k] = t; k = m; } } return top[1]; };
    const da = new V3(), db = new V3(), gd = cellDir(W, g0, new V3());
    gs[s0] = 0; push(s0, 0);
    let found = false, guard = 0;
    while (heap.length && guard++ < 6000) {
      const c = pop(); if (done[c]) continue; done[c] = 1;
      if (c === g0) { found = true; break; }
      const cx = c % g.NX, cy = (c / g.NX) | 0; cellDir(W, c, da);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue; const ny = cy + dy; if (ny < 0 || ny >= g.NY) continue;
        const n = ny * g.NX + ((cx + dx + g.NX) % g.NX); if (done[n]) continue;
        if (g.land[n] !== want && n !== g0) continue;
        const gn = gs[c] + C.angleBetween(da, cellDir(W, n, db)) * W.R;
        if (gn < gs[n]) { gs[n] = gn; prev[n] = c; push(n, gn + C.angleBetween(db, gd) * W.R); }
      }
    }
    if (!found) return null;
    const cells = []; for (let c = g0; c !== -1; c = prev[c]) cells.push(c); cells.reverse();
    const pts = cells.map(function (c) { return cellDir(W, c, new V3()); }); pts[pts.length - 1] = to.clone(); pts[0] = from.clone();
    // string pull
    const out = []; let cur = 0;
    while (cur < pts.length - 1) { let nx = cur + 1; for (let k = pts.length - 1; k > cur + 1; k--) if (los(W, role, pts[cur], pts[k])) { nx = k; break; } out.push(pts[nx]); cur = nx; }
    return out;
  };
  // the direction a vehicle should actually steer to on its way to tgt (tgt itself when the way is clear)
  U.navDir = function (W, v, tgt, dt) {
    const nv = v.nav || (v.nav = { pts: null, goal: new V3(), t: 0, i: 0, fail: 0 });
    nv.t -= dt;
    const d = C.angleBetween(v.dir, tgt) * W.R;
    if (d < 8) { nv.pts = null; return tgt; }
    const moved = nv.goal.distanceTo(tgt) * W.R > 6;
    if (nv.t <= 0 && (moved || v.stuck > 0.3 || v.avoidT > 0.15 || nv.pts)) {
      nv.t = 1.2 + Math.random() * 0.6;
      if (nv.pts && !moved && v.stuck < 0.3 && los(W, v.role, v.dir, tgt)) nv.pts = null;
      else if (!nv.pts || moved || v.stuck > 0.6) {
        if (!los(W, v.role, v.dir, tgt)) { nv.pts = U.findPath(W, v.role, v.dir, tgt); nv.i = 0; } else nv.pts = null;
        nv.goal.copy(tgt);
      }
    }
    if (nv.pts) {
      while (nv.i < nv.pts.length - 1 && C.angleBetween(v.dir, nv.pts[nv.i]) * W.R < 5) nv.i++;
      return nv.pts[nv.i];
    }
    return tgt;
  };

  // ------------------------------------------------------------------ steering
  function step(W, v, dt, tgtDir, stop, cruise) {
    const up = v.dir;
    const dist = C.angleBetween(v.dir, tgtDir) * W.R;
    let desired = v.speed;
    if (tgtDir && dist > stop) {
      // desired heading
      const t = C.tangentTo(v.dir, tgtDir, _v);
      if (t.lengthSq() > 0) {
        let ang = Math.atan2(_w.crossVectors(v.heading, t).dot(up), v.heading.dot(t));
        const maxTurn = (v.role === 'air' ? 3.2 : 2.6) * dt;
        const ta = Math.max(-maxTurn, Math.min(maxTurn, ang));
        // obstacle feelers (not for air)
        if (v.role !== 'air') {
          const look = Math.max(2.2, v.speed * 0.45) / W.R;
          let blocked = false;
          const probe = function (turn) {
            _w.copy(v.heading); C.turn(_w, up, turn); _s.copy(v.dir); C.advance(_s, _w, look);
            return W.passable(v.role, _s);
          };
          if (v.avoidT > 0) { v.avoidT -= dt; C.turn(v.heading, up, v.avoid * 2.4 * dt); }
          else {
            C.turn(v.heading, up, ta);
            if (!probe(0)) {
              blocked = true;
              const opts = [0.5, -0.5, 1.0, -1.0, 1.6, -1.6];
              if (v.avoid < 0) opts.reverse();
              let ok = false;
              for (let i = 0; i < opts.length; i++) if (probe(opts[i])) { v.avoid = opts[i] > 0 ? 1 : -1; C.turn(v.heading, up, opts[i] * Math.min(1, dt * 5)); ok = true; v.avoidT = 0.25; break; }
              if (!ok) { desired = 0; v.stuck += dt; v.avoid = v.avoid || 1; v.avoidT = 0.5; }
            }
            if (!blocked) v.stuck = Math.max(0, v.stuck - dt);
          }
        } else C.turn(v.heading, up, ta);
        v.turnRate = ta / dt;
        desired = Math.abs(ang) > 1.9 ? cruise * 0.3 : cruise;
      }
      if (dist < stop + cruise * 0.5) desired = Math.min(desired, Math.max(2.5, (dist - stop) * 2.2));
    } else desired = 0;
    // accelerate
    v.speed += (desired - v.speed) * Math.min(1, dt * (desired > v.speed ? 2.2 : 4));
    if (v.speed < 0.02) v.speed = 0;
    if (v.speed > 0) {
      const a = v.speed * dt / W.R;
      const sv = _s.copy(v.dir), sh = _w.copy(v.heading); C.advance(sv, sh, a);
      if (W.passable(v.role, sv)) { C.advance(v.dir, v.heading, a); }
      else { v.speed = 0; v.stuck += dt; v.avoidT = Math.max(v.avoidT, 0.4); if (!v.avoid) v.avoid = 1; }
    }
    return dist;
  }

  // ------------------------------------------------------------------ targeting
  function inRangeTarget(W, v, range) {
    // returns {kind:'v'|'t'|'h', obj, pos}
    const myN = v.nation;
    let best = null, bd = range;
    for (let i = 0; i < W.vehicles.length; i++) {
      const o = W.vehicles[i]; if (o.nation === myN || !U.hostile(W, myN, o.nation)) continue;
      const d = o.pos.distanceTo(v.pos); if (d < bd) { bd = d; best = { kind: 'v', obj: o, pos: o.pos }; }
    }
    if (best) return best;
    const ord = v.order;
    for (let i = 0; i < W.turrets.length; i++) {
      const t = W.turrets[i]; if (!t.alive || t.city.nation === myN || !U.hostile(W, myN, t.city.nation)) continue;
      const d = t.world.distanceTo(v.pos); if (d < bd) { bd = d; best = { kind: 't', obj: t, pos: t.world }; }
    }
    if (best) return best;
    for (let i = 0; i < W.cities.length; i++) {
      const c = W.cities[i]; if (c.nation === myN || !U.hostile(W, myN, c.nation)) continue;
      if (c.turrets.some(function (t) { return t.alive; })) continue;
      const d = c.pos.distanceTo(v.pos) - 5; if (d < bd) { bd = d; best = { kind: 'h', obj: c, pos: c.pos }; }
    }
    return best;
  }
  function fire(W, v, tgt) {
    const nation = W.nationById[v.nation];
    const dmgMul = (v.boost > 0 ? 1.6 : 1) * (nation.dmgMul || 1) * (1 + 0.18 * U.techLevel(W, v.nation, 'fire'));
    const dmg = Math.max(1, v.st.mil * 0.95) * 0.8 * dmgMul;
    v.cd = 0.8;
    _v.copy(v.pos).addScaledVector(v.up, v.role === 'air' ? 0.3 : 0.9);
    U.tracer(W, _v, tgt.pos, v.st.mil > 12 ? 0xfb7185 : 0xfde047);
    if (tgt.kind === 'v') U.hitVehicle(W, tgt.obj, dmg, v.nation);
    else if (tgt.kind === 't') U.hitTurret(W, tgt.obj, dmg, v.nation);
    else U.hitHall(W, tgt.obj, dmg, v.nation);
    if (Math.random() < 0.5) W.fx.burst(tgt.pos, 0xfacc15, 2, 0.6, { size: 0.22, up: tgt.pos.clone().normalize() });
    if (SP.audio && v.nation === W.player.id && Math.random() < 0.3) SP.audio.sfx('laser', { vol: 0.25 });
  }

  // ------------------------------------------------------------------ per frame
  U.update = function (W, dt) {
    const FM = W.FM;
    // production queues
    W.cities.forEach(function (c) {
      if (!c.queue.length) return;
      const q = c.queue[0]; q.t += dt * FM * (c.riot ? 0 : 1);
      if (q.t >= q.dur) {
        c.queue.shift();
        const nation = W.nationById[c.nation];
        const d = U.spawnPoint(W, c, q.role);
        if (!d) { nation.money += q.cost; if (nation.isPlayer) W.toast('No room to launch ' + q.role + ' vehicle - refunded', '↩️'); return; }
        const v = U.spawn(W, nation, q.role, q.design, d);
        if (nation.isPlayer) { W.toast('New ' + q.role + ' vehicle ready', '🚗'); if (SP.audio) SP.audio.sfx('build'); }
        else v.aiFresh = true;
      }
    });
    // turrets
    for (let i = 0; i < W.turrets.length; i++) {
      const t = W.turrets[i]; if (!t.alive) continue;
      t.cd -= dt;
      let bd = 24, tg = null; const myN = t.city.nation;
      for (let k = 0; k < W.vehicles.length; k++) {
        const o = W.vehicles[k]; if (o.nation === myN || !U.hostile(W, myN, o.nation)) continue;
        const d = o.pos.distanceTo(t.world); if (d < bd) { bd = d; tg = o; }
      }
      if (tg) {
        _v.copy(tg.pos).sub(t.world); _v.applyQuaternion(_q.copy(t.city.frame.quaternion).invert());
        const ya = Math.atan2(_v.x, _v.z); let dy = ya - t.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        t.yaw += Math.max(-6 * dt, Math.min(6 * dt, dy));
        SP.civCity.writeTurret(W, t, null);
        if (t.cd <= 0 && Math.abs(dy) < 0.5) {
          t.cd = 0.9; _w.copy(t.world).addScaledVector(t.city.dir, 1.6);
          U.tracer(W, _w, tg.pos, 0xff7a59);
          U.hitVehicle(W, tg, TURRET_DMG, myN);
        }
      }
    }

    // vehicles
    const cam = W.camera.position;
    for (let i = W.vehicles.length - 1; i >= 0; i--) {
      const v = W.vehicles[i]; if (!v || !v.alive) continue;
      if (v.boost > 0) v.boost -= dt;
      v.cd -= dt; v.flash = Math.max(0, v.flash - dt);
      if (v.popT < 1) v.popT = Math.min(1, v.popT + dt / 0.7);
      const nation = W.nationById[v.nation];
      // order resolution
      const o = v.order;
      let tgtDir = null, stop = 0.6, cruise = U.speedOf(v);
      v.working = null;
      if (o) {
        switch (o.type) {
          case 'move': tgtDir = o.dir; stop = 0.7; break;
          case 'claim': tgtDir = o.g.dir; stop = v.role === 'sea' ? 4.5 : 2.2; if (o.g.owner === v.nation) v.order = null; break;
          case 'attack':
            if (o.v) { if (!o.v.alive) { v.order = null; break; } tgtDir = o.v.dir; stop = v.st.range * 0.7; }
            else if (o.city) {
              if (o.city.nation === v.nation) { v.order = null; break; }
              let tp = o.city.pos, extra = 5;
              let bt = null, bd2 = 1e9; o.city.turrets.forEach(function (t) { if (!t.alive) return; const d = t.world.distanceTo(v.pos); if (d < bd2) { bd2 = d; bt = t; } });
              if (bt) { tp = bt.world; extra = 0; }
              tgtDir = _w.copy(tp).normalize().clone(); stop = Math.max(2, v.st.range * 0.72 - extra);
              v.tgtPos = tp;
            }
            break;
          case 'work':
            tgtDir = o.city.dir; stop = 13; if (o.city.nation === v.nation) v.order = null;
            break;
        }
      }
      if (tgtDir) {
        const goalDir = tgtDir;
        if (v.role !== 'air' && W.grid) tgtDir = U.navDir(W, v, tgtDir, dt);
        const dist = tgtDir === goalDir ? step(W, v, dt, tgtDir, stop, cruise) : (step(W, v, dt, tgtDir, 0.3, cruise), C.angleBetween(v.dir, goalDir) * W.R);
        if (v.stuck > 2.2 && o && o.type === 'move') { v.order = null; v.stuck = 0; }
        else if (v.stuck > 5) { v.order = null; v.stuck = 0; }
        if (v.order) {
          const o2 = v.order;
          if (o2.type === 'move' && dist <= 0.9) v.order = null;
          if (o2.type === 'work' && dist <= 13.6 + 3) {
            v.working = o2.city; U.doWork(W, v, o2.city, dt);
          }
          if (o2.type === 'claim') U.updateClaim(W, v, dt);
        }
      } else {
        v.speed = Math.max(0, v.speed - dt * 8);
        if (v.speed > 0) { C.advance(v.dir, v.heading, v.speed * dt / W.R); }
      }
      U.place(W, v);
      // weapons
      if (v.st.mil > 0 && v.cd <= 0) {
        v.scan -= dt;
        if (v.scan <= 0) {
          v.scan = 0.3;
          let tgt = null;
          const ord = v.order;
          if (ord && ord.type === 'attack' && ord.v && ord.v.alive && ord.v.pos.distanceTo(v.pos) < v.st.range) tgt = { kind: 'v', obj: ord.v, pos: ord.v.pos };
          else tgt = inRangeTarget(W, v, v.st.range);
          if (!tgt && ord && ord.type === 'attack' && ord.city && ord.city.nation !== v.nation) {
            // order target in range: player forced war
            U.markWar(W, ord.city.nation, v.nation);
            const bt = ord.city.turrets.filter(function (t) { return t.alive; }).sort(function (a, b) { return a.world.distanceTo(v.pos) - b.world.distanceTo(v.pos); })[0];
            if (bt && bt.world.distanceTo(v.pos) < v.st.range) tgt = { kind: 't', obj: bt, pos: bt.world };
            else if (!bt && ord.city.pos.distanceTo(v.pos) - 5 < v.st.range) tgt = { kind: 'h', obj: ord.city, pos: ord.city.pos };
          }
          if (tgt) v.tgt = tgt;
        }
        if (v.tgt) {
          const tg = v.tgt;
          const alive = tg.kind === 'v' ? tg.obj.alive : tg.kind === 't' ? tg.obj.alive : true;
          if (alive && tg.pos.distanceTo(v.pos) < v.st.range + 1) {
            // face target when stationary-ish
            if (v.speed < 0.5) { C.tangentTo(v.dir, _v.copy(tg.pos).normalize(), _w); if (_w.lengthSq() > 0) v.heading.lerp(_w, Math.min(1, dt * 5)).normalize(); }
            fire(W, v, tg);
          } else v.tgt = null;
        }
      }
      // heal at friendly city
      if (v.hp < v.maxHp) {
        for (let k = 0; k < W.cities.length; k++) { const c = W.cities[k]; if (c.nation === v.nation && c.pos.distanceTo(v.pos) < 24) { v.hp = Math.min(v.maxHp, v.hp + dt * 4); break; } }
      }
    }

    // LOD: which vehicles get full rigs
    W.lodT -= dt;
    if (W.lodT <= 0) {
      W.lodT = 0.25;
      const list = [];
      for (let i = 0; i < W.vehicles.length; i++) { const v = W.vehicles[i]; const d = v.pos.distanceTo(cam); if (d < DETAIL_DIST && v.pos.clone().normalize().dot(W.camDir) > W.horizonCos - 0.05) list.push({ v: v, d: d }); }
      list.sort(function (a, b) { return a.d - b.d; });
      W.vehicles.forEach(function (v) { v.wantDetail = false; });
      for (let i = 0; i < Math.min(DETAIL_N, list.length); i++) list[i].v.wantDetail = true;
    }
    const counts = { land: 0, sea: 0, air: 0 };
    const zoomK = Math.max(1, W.camDist / 80);
    for (let i = 0; i < W.vehicles.length; i++) {
      const v = W.vehicles[i];
      const pop = v.popT < 1 ? (1 - Math.pow(1 - v.popT, 3)) * (1 + Math.sin(v.popT * 3.14) * 0.25) : 1;
      if (v.wantDetail) {
        if (!v.rig) U.ensureRig(W, v);
        v.mode = 'detail'; v.farT = 0; v.obj.visible = true;
        v.obj.scale.setScalar(Math.max(0.01, pop));
        v.rig.animate(dt, { speed: v.speed / VS });
        v.rig.root.rotation.z = v.role === 'air' ? -v.turnRate * 0.12 : 0;
      } else {
        if (v.rig) { v.farT += dt; v.obj.visible = false; if (v.farT > 8) U.dropRig(W, v); }
        v.mode = 'proxy'; v.obj.visible = false;
        const pk = W.proxy[v.role], k = counts[v.role]++;
        if (k < MAX_PROXY) {
          _s.setScalar(Math.max(0.01, pop) * VS * 1.25 * zoomK);
          _o.position.copy(v.pos); C.orient(_o, v.up, v.heading); _m.compose(v.pos, _o.quaternion, _s);
          pk.setMatrixAt(k, _m);
          _c.setHex(W.nationById[v.nation].color); if (v.flash > 0) _c.setHex(0xffffff);
          pk.setColorAt(k, _c);
        }
      }
    }
    ['land', 'sea', 'air'].forEach(function (r) { const pk = W.proxy[r]; pk.setCount(Math.min(MAX_PROXY, counts[r])); pk.update(); if (pk.mesh.instanceColor) pk.mesh.instanceColor.needsUpdate = true; });

    // tracers
    let n = 0;
    for (let i = W.tracers.length - 1; i >= 0; i--) {
      const t = W.tracers[i]; t.t += dt; if (t.t >= t.dur) { W.tracers.splice(i, 1); continue; }
    }
    for (let i = 0; i < W.tracers.length; i++) {
      const t = W.tracers[i], k = t.t / t.dur;
      _v.lerpVectors(t.a, t.b, k);
      _w.copy(t.b).sub(t.a);
      _o.position.copy(_v); _o.up.set(0, 1, 0); _o.lookAt(_v.clone().add(_w)); _o.updateMatrix();
      _m.compose(_v, _o.quaternion, _s.set(1, 1, 1)); W.tracerMesh.setMatrixAt(n, _m); W.tracerMesh.setColorAt(n, _c.setHex(t.c)); n++;
    }
    W.tracerMesh.count = n; W.tracerMesh.instanceMatrix.needsUpdate = true; if (W.tracerMesh.instanceColor) W.tracerMesh.instanceColor.needsUpdate = true;
    // shocks
    for (let i = W.shocks.length - 1; i >= 0; i--) {
      const s = W.shocks[i]; s.t += dt; const k = s.t / s.dur;
      if (k >= 1) { W.scene.remove(s.m); s.m.material.dispose(); W.shocks.splice(i, 1); continue; }
      s.m.scale.setScalar(0.5 + s.size * (1 - Math.pow(1 - k, 2))); s.m.material.opacity = 0.85 * (1 - k);
    }
    U.updateTradeVisuals(W, dt);
  };

  // ------------------------------------------------------------------ trade / holograms
  U.doWork = function (W, v, city, dt) {
    const FM = W.FM;
    if (city.nation === v.nation) return;
    const me = v.nation, pm = 1 + 0.2 * U.techLevel(W, me, 'persuade');
    if (v.st.eco > 0 && v.st.eco >= v.st.rel) {
      city.trade[me] = Math.min(100, (city.trade[me] || 0) + v.st.eco * 0.4 * FM * dt * pm);
      city.tradeSeen = city.tradeSeen || {}; city.tradeSeen[me] = W.t;
      if (Math.random() < dt * 2) W.fx.burst(city.pos.clone().addScaledVector(city.dir, 3), 0xfacc15, 1, 0.6, { up: city.dir, size: 0.3, gravity: -2 });
    } else if (v.st.rel > 0) {
      const had = city.convert[me] || 0;
      city.convert[me] = Math.min(100, had + v.st.rel * 0.34 * FM * dt * pm);
      city.convSeen = city.convSeen || {}; city.convSeen[me] = W.t;
      if (had < 25 && city.convert[me] >= 25) { const owner = W.nationById[city.nation]; if (owner.id !== me && W.getRel(owner.id, me) > -45) U.markWar(W, owner.id, me); }
      if (city.convert[me] >= 100) { W.captureCity(city, W.nationById[me], 'religious'); v.order = null; }
    }
  };

  U.cityDecay = function (W, dt) {
    W.cities.forEach(function (c) {
      for (const k in c.convert) {
        const seen = c.convSeen && c.convSeen[k]; if (seen !== undefined && W.t - seen < 1.2) continue;
        c.convert[k] = Math.max(0, c.convert[k] - dt * 1.6); if (c.convert[k] <= 0) delete c.convert[k];
      }
      for (const k in c.trade) {
        const seen = c.tradeSeen && c.tradeSeen[k]; if (seen !== undefined && W.t - seen < 1.2) continue;
        c.trade[k] = Math.max(0, c.trade[k] - dt * 0.25); if (c.trade[k] <= 0) delete c.trade[k];
      }
    });
  };

  U.updateTradeVisuals = function (W, dt) {
    // trade lines for working economic vehicles
    const active = W.vehicles.filter(function (v) { return v.working && v.st.eco > 0 && v.st.eco >= v.st.rel && v.working.nation !== v.nation; }).slice(0, 12);
    while (W.tradeLines.length < active.length) {
      const line = new THREE.Group();
      const cyl = new THREE.Mesh(W.tradeGeo, W.tradeMat); line.add(cyl);
      const coins = []; for (let i = 0; i < 4; i++) { const c = new THREE.Mesh(W.coinGeo, W.coinMat); line.add(c); coins.push(c); }
      line.userData = { cyl: cyl, coins: coins };
      W.scene.add(line); W.tradeLines.push(line);
    }
    for (let i = 0; i < W.tradeLines.length; i++) {
      const L = W.tradeLines[i];
      if (i >= active.length) { L.visible = false; continue; }
      const v = active[i], city = v.working;
      L.visible = true;
      const a = v.pos, b = _w.copy(city.pos).addScaledVector(city.dir, 4);
      const mid = _v.copy(a).add(b).multiplyScalar(0.5);
      // arc: cylinder straight between, coins arc
      const dir = _s.copy(b).sub(a), len = dir.length();
      L.userData.cyl.position.copy(a); L.userData.cyl.scale.set(1, len, 1);
      L.userData.cyl.quaternion.setFromUnitVectors(_o.up.set(0, 1, 0), dir.normalize());
      L.userData.coins.forEach(function (c, k) {
        const f = ((W.t * 0.7 + k / 4) % 1);
        c.position.lerpVectors(a, b, f).addScaledVector(mid.clone().normalize(), Math.sin(f * 3.14159) * 2.2);
        c.rotation.y += dt * 6; c.scale.setScalar(0.8 + Math.sin(f * 3.14159) * 0.6);
      });
    }
    // holograms
    const wantHolo = {};
    W.vehicles.forEach(function (v) { if (v.working && v.st.rel > 0 && v.st.rel > v.st.eco && v.working.nation !== v.nation) { wantHolo[v.working.id] = (wantHolo[v.working.id] || 0) + 1; (wantHolo['v' + v.working.id] = wantHolo['v' + v.working.id] || []).push(v); } });
    W.cities.forEach(function (c) {
      let h = W.holos[c.id];
      const on = !!wantHolo[c.id];
      if (on && !h) h = W.holos[c.id] = U.makeHolo(W, c);
      if (!h) return;
      const target = on ? 1 : 0;
      h.k += (target - h.k) * Math.min(1, dt * 3);
      h.g.visible = h.k > 0.02;
      if (h.g.visible) {
        h.t += dt;
        let mx = 0; for (const k in c.convert) mx = Math.max(mx, c.convert[k]);
        h.fig.rotation.y += dt * 1.6; h.fig.position.y = 11 + Math.sin(h.t * 2) * 0.7; h.fig.scale.setScalar(h.k * (0.8 + mx / 100 * 0.6));
        h.ring.rotation.z += dt * 1.2; h.ring.scale.setScalar(h.k * (1 + 0.1 * Math.sin(h.t * 4)));
        h.cone.scale.set(h.k, h.k, h.k);
        h.mat.opacity = (0.25 + 0.3 * (0.5 + 0.5 * Math.sin(h.t * 7))) * h.k + 0.15 * (mx / 100);
        if (Math.random() < dt * 14) W.fx.burst(c.pos.clone().addScaledVector(c.dir, 6 + Math.random() * 6), 0xe879f9, 1, 0.5, { up: c.dir, size: 0.26, gravity: -3, life: 1.1 });
      }
    });
  };
  U.makeHolo = function (W, city) {
    const g = new THREE.Group(), mat = W.holoMat.clone();
    const fig = new THREE.Group();
    const head = new THREE.Mesh(new THREE.SphereGeometry(1.1, 10, 8), mat); head.position.y = 2.6;
    const body = new THREE.Mesh(new THREE.ConeGeometry(1.6, 3.4, 8), mat); body.position.y = 0.4;
    const arm1 = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 2, 6), mat); arm1.position.set(1.6, 1.6, 0); arm1.rotation.z = -0.9;
    const arm2 = arm1.clone(); arm2.position.x = -1.6; arm2.rotation.z = 0.9;
    fig.add(head, body, arm1, arm2); fig.scale.setScalar(1.0);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(5.5, 0.18, 6, 36), mat); ring.rotation.x = Math.PI / 2; ring.position.y = 1.2;
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 6, 11, 20, 1, true), mat); cone.position.y = 5.6;
    g.add(fig, ring, cone);
    city.frame.add(g); g.visible = false;
    return { g: g, fig: fig, ring: ring, cone: cone, mat: mat, k: 0, t: 0 };
  };
})();
