/* Space stage — solar-system view: star + planets, ship flight, dogfights, scanning. Installed onto SP.stages.space. */
(function () {
  'use strict';
  const SP = window.SP = window.SP || {};
  const U = SP.util, V3 = THREE.Vector3, clamp = U.clamp;
  const G = function () { return SP.spaceGalaxy; };
  const S = SP.stages.space;
  const hex = function (n) { return '#' + ('000000' + n.toString(16)).slice(-6); };

  // ---- tiny deterministic 3D value noise (independent of SP.util's global noise seed)
  function h3(x, y, z, s) { let n = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + s * 19.19) * 43758.5453; return n - Math.floor(n); }
  function vnoise(x, y, z, s) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
    const L = U.lerp;
    return L(L(L(h3(xi, yi, zi, s), h3(xi + 1, yi, zi, s), u), L(h3(xi, yi + 1, zi, s), h3(xi + 1, yi + 1, zi, s), u), v),
      L(L(h3(xi, yi, zi + 1, s), h3(xi + 1, yi, zi + 1, s), u), L(h3(xi, yi + 1, zi + 1, s), h3(xi + 1, yi + 1, zi + 1, s), u), v), w);
  }
  function fnoise(x, y, z, s) { return vnoise(x, y, z, s) * 0.6 + vnoise(x * 2.1, y * 2.1, z * 2.1, s + 3) * 0.3 + vnoise(x * 4.3, y * 4.3, z * 4.3, s + 7) * 0.1; }

  const PAL = {
    earth: { low: [0x0e7490, 0x22d3ee], land: [0x65a30d, 0x4d7c0f, 0x84cc16, 0xfcd34d], cap: 0xf1f5f9, sea: 0.46 },
    alien_purple: { low: [0x86198f, 0xc026d3], land: [0x8b5cf6, 0x6d28d9, 0xf9a8d4, 0xa78bfa], cap: 0xfdf4ff, sea: 0.4 },
    ember: { low: [0x7f1d1d, 0xf97316], land: [0x292524, 0x44403c, 0x57534e, 0xb91c1c], cap: 0xf97316, sea: 0.35 },
    ice: { low: [0x1e3a8a, 0x60a5fa], land: [0xe0f2fe, 0xbae6fd, 0xffffff, 0x93c5fd], cap: 0xffffff, sea: 0.3 }
  };
  const GLOW = { earth: 0x7dd3fc, alien_purple: 0xe879f9, ember: 0xfdba74, ice: 0xbae6fd, gas: 0xfde68a };
  S.PLANET_GLOW = GLOW;

  function makePlanetMesh(def, geoCache) {
    const R = SP.render, size = def.size, grp = new THREE.Group();
    const seed = def.seed % 997;
    let geo = new THREE.IcosahedronGeometry(size, def.type === 'gas' ? 3 : 3); if (geo.index) geo = geo.toNonIndexed();
    const pos = geo.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color(), cen = new V3();
    const gasCols = U.rng(seed).shuffle([0xfde68a, 0xfdba74, 0xf472b6, 0xa78bfa, 0x7dd3fc, 0xfca5a5, 0x86efac]).slice(0, 4);
    const P = PAL[def.type];
    for (let f = 0; f < pos.count; f += 3) {
      cen.set(0, 0, 0); for (let k = 0; k < 3; k++) cen.x += pos.getX(f + k), cen.y += pos.getY(f + k), cen.z += pos.getZ(f + k);
      cen.normalize();
      let hx;
      if (def.type === 'gas') {
        const lat = cen.y + (vnoise(cen.x * 3, cen.y * 6, cen.z * 3, seed) - 0.5) * 0.18, band = Math.floor((lat + 1) * 5.5) % gasCols.length;
        hx = gasCols[band];
      } else {
        const n = fnoise(cen.x * 2.2 + seed, cen.y * 2.2, cen.z * 2.2, seed);
        if (Math.abs(cen.y) > 0.86 && def.type !== 'ember') hx = P.cap;
        else if (n < P.sea) hx = n < P.sea - 0.1 ? P.low[0] : P.low[1];
        else hx = P.land[Math.floor(fnoise(cen.x * 5, cen.y * 5, cen.z * 5, seed + 9) * P.land.length) % P.land.length];
        if (def.type === 'ember' && n < P.sea) hx = Math.sin(cen.x * 30 + cen.z * 20) > 0.2 ? 0xf97316 : 0xb91c1c;
      }
      c.setHex(hx);
      for (let k = 0; k < 3; k++) { col[(f + k) * 3] = c.r; col[(f + k) * 3 + 1] = c.g; col[(f + k) * 3 + 2] = c.b; }
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.computeVertexNormals();
    const body = R.cel(geo, 0xffffff, { vertexColors: true, outline: 0.035, cast: false, receive: false });
    grp.add(body);
    return { group: grp, body: body };
  }

  function addGlowShell(grp, size, color, op) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(size * 1.14, 24, 16), new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: op, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    grp.add(m); return m;
  }

  const STAR_R = { yellow: 14, orange: 12.5, red: 10, blue: 20, white: 15, grox: 15, bh: 6, core: 26 };

  const M = {
    // =============================================================== init
    initShip: function () {
      this.ship = { pos: new V3(), vel: new V3(), h: 0, turn: 0, thrust: 0, boost: false, fireT: 0, inv: 0, bank: 0 };
      this.shipGroup = new THREE.Group(); this.shipGroup.visible = false; this.scene.add(this.shipGroup);
      this.rebuildShip();
    },
    rebuildShip: function () {
      if (this.shipRig) { this.shipGroup.remove(this.shipRig.root); try { this.shipRig.dispose(); } catch (e) {} }
      const rig = this.shipRig = SP.assembly.build(this.st.shipDesign, { animate: true });
      const b = rig.bounds, size = Math.max(b.max.x - b.min.x, b.max.z - b.min.z, 1);
      this.shipScale = clamp(5.2 / size, 0.4, 2.2);
      rig.root.scale.setScalar(this.shipScale); rig.root.position.y = -(rig.lift || 0) * this.shipScale;
      this.shipGroup.add(rig.root);
    },
    initCombat: function () {
      const R = SP.render;
      this.enemies = []; this.bolts = []; this.eid = 1;
      const geo = this.egeo = {
        body: new THREE.ConeGeometry(0.9, 3.4, 6), wing: new THREE.BoxGeometry(3.4, 0.16, 1.3), fin: new THREE.BoxGeometry(0.16, 1.0, 1.0), eye: new THREE.SphereGeometry(0.42, 8, 6), spike: new THREE.ConeGeometry(0.28, 1.4, 5)
      };
      geo.body.rotateX(Math.PI / 2);
      this.boltGeo = new THREE.BoxGeometry(0.28, 0.28, 3.2);
      this.boltMesh = new THREE.InstancedMesh(this.boltGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), 200);
      this.boltMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.boltMesh.frustumCulled = false; this.boltMesh.count = 0;
      const wc = new THREE.Color(1, 1, 1); for (let i = 0; i < 200; i++) this.boltMesh.setColorAt(i, wc);
      this.scene.add(this.boltMesh);
      // scan beam
      this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 1, 6, 1, true), new THREE.MeshBasicMaterial({ color: 0xa3e635, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
      this.beam.visible = false; this.scene.add(this.beam);
      this.sc = { yaw: 0, off: 0, pitch: 0.5, dist: 34, td: 34 };
      this.prevLeft = false; this.noFire = false; this.shake = 0; this.autopilot = null; this.scanning = null; this.hadEnemies = false;
      this.mtmp = new THREE.Matrix4(); this.qtmp = new THREE.Quaternion(); this.stmp = new V3(1, 1, 1);
    },
    combatDispose: function () {
      this.enemies.forEach(function (e) { e.mesh.parent && e.mesh.parent.remove(e.mesh); });
      ['body', 'wing', 'fin', 'eye', 'spike'].forEach(function (k) { this.egeo[k].dispose(); }, this);
      this.boltGeo.dispose(); this.boltMesh.material.dispose(); this.beam.geometry.dispose(); this.beam.material.dispose();
    },

    // =============================================================== system build / show / hide
    sysShow: function (si) {
      if (this.sys && this.sys.star !== si) this.sysDispose();
      let fresh = false;
      if (!this.sys) { this.sys = this.buildSystem(si); fresh = true; }
      this.sys.group.visible = true; this.shipGroup.visible = true; this.shipGroup.scale.setScalar(1);
      this.scene.background = new THREE.Color(0x05070d);
      const sl = this.starLight; sl.color.setHex(this.sys.lightColor); sl.intensity = this.sys.lightI;
      if (fresh || this.fromJump) {
        const sy = this.sys, sh = this.ship; sh.vel.set(0, 0, 0);
        const first = sy.planets[0];
        if (sy.home) { const hp = sy.planets[0]; sh.pos.copy(this.planetWorld(hp.def)).add(new V3(-hp.def.size * 2.2 - 14, 0, -hp.def.size * 2.6 - 10)); sh.h = Math.atan2(hp.pos.x - sh.pos.x, hp.pos.z - sh.pos.z); }
        else if (first) { const d = first.def.orbit * 0.6; sh.pos.set(Math.cos(first.def.phase + 1.2) * d, 0, Math.sin(first.def.phase + 1.2) * d); sh.h = Math.atan2(-sh.pos.x, -sh.pos.z); }
        else { sh.pos.set(0, 0, 90); sh.h = Math.PI; }
        this.sc.yaw = sh.h + Math.PI; this.sc.off = 0; this.sc.dist = this.sc.td = 36; this.sc.pitch = 0.5;
      }
      this.sel = null;
    },
    sysHide: function () { if (this.sys) this.sys.group.visible = false; this.beam.visible = false; this.autopilot = null; this.scanning = null; this.hidePrefix('pl'); this.hidePin('ap'); this.hidePin('en'); },
    sysDispose: function () {
      const sy = this.sys; if (!sy) return;
      this.scene.remove(sy.group);
      sy.group.traverse(function (o) { if (o.geometry) o.geometry.dispose(); });
      if (sy.planetObjs) sy.planetObjs.forEach(function (p) { if (p.planetLib) p.planetLib.dispose(); });
      if (sy.tex) sy.tex.forEach(function (t) { t.dispose(); });
      this.enemies.forEach(function (e) { e.mesh.parent && e.mesh.parent.remove(e.mesh); }); this.enemies.length = 0; this.bolts.length = 0;
      this.sys = null; this.hadEnemies = false;
    },
    buildSystem: function (si) {
      const R = SP.render, gal = this.gal, star = gal.stars[si], defs = G().planetsOf(gal, si, this.campaign), st = G().STAR_TYPES[star.type];
      const group = new THREE.Group(); this.scene.add(group);
      const tex = []; const sy = { star: si, group: group, planets: [], tex: tex, planetObjs: [], home: !!star.home };
      const glowT = G().glowTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)'); tex.push(glowT);
      const sr = STAR_R[star.type] || 14; sy.starR = sr;
      sy.lightColor = st.color; sy.lightI = 0.4;
      if (star.bh) {
        group.add(new THREE.Mesh(new THREE.SphereGeometry(sr, 20, 14), new THREE.MeshBasicMaterial({ color: 0x000000 })));
        const mk = function (r, w, c, rx) { const m = new THREE.Mesh(new THREE.TorusGeometry(r, w, 8, 56), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })); m.rotation.x = Math.PI / 2 - rx; group.add(m); return m; };
        sy.rings = [mk(sr * 1.6, 0.9, 0xc084fc, 0.25), mk(sr * 2.3, 0.5, 0x60a5fa, 0.25), mk(sr * 3.2, 0.3, 0xf0abfc, 0.25)];
        const g = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowT, color: 0x7c3aed, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.9 })); g.scale.setScalar(sr * 10); group.add(g);
        sy.lightColor = 0xa78bfa; sy.lightI = 0.35;
        return sy;
      }
      // the star
      const body = new THREE.Mesh(new THREE.SphereGeometry(sr, 24, 16), new THREE.MeshBasicMaterial({ color: st.color }));
      const outl = new THREE.Mesh(new THREE.SphereGeometry(sr * 1.05, 24, 16), new THREE.MeshBasicMaterial({ color: SP.render.INK, side: THREE.BackSide }));
      group.add(outl, body); sy.starBody = body;
      [[sr * 5.2, st.glow, 0.55], [sr * 2.8, 0xffffff, 0.5], [sr * 9, st.glow, 0.22]].forEach(function (d) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowT, color: d[1], blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: d[2] })); sp.scale.setScalar(d[0]); group.add(sp);
      });
      sy.rays = new THREE.Mesh(new THREE.RingGeometry(sr * 1.15, sr * 1.8, 18, 1), new THREE.MeshBasicMaterial({ color: st.glow, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      sy.rays.rotation.x = -Math.PI / 2; group.add(sy.rays);
      if (star.core) {
        sy.lightI = 1.8; sy.lightColor = 0xfff1b8;
        sy.swirl = new THREE.Mesh(new THREE.PlaneGeometry(sr * 9, sr * 9), new THREE.MeshBasicMaterial({ map: glowT, color: 0xffd36e, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
        sy.swirl.rotation.x = -Math.PI / 2; group.add(sy.swirl);
        // the Staff of Life
        const staff = new THREE.Group(), pole = R.cel(new THREE.CylinderGeometry(0.5, 0.7, 14, 8), 0xfbbf24, { outline: 0.1, cast: false, emissive: 0xf59e0b, emissiveIntensity: 0.5 });
        const orb = R.cel(new THREE.IcosahedronGeometry(2.6, 1), 0xfffbeb, { outline: 0.08, cast: false, emissive: 0xfff1b8, emissiveIntensity: 0.9 }); orb.position.y = 8.5;
        const gem = R.cel(new THREE.OctahedronGeometry(1.2, 0), 0xf43f5e, { outline: 0.1, cast: false, emissive: 0xf43f5e, emissiveIntensity: 0.8 }); gem.position.y = 8.5;
        const ring1 = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.18, 6, 32), new THREE.MeshBasicMaterial({ color: 0x86efac, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false })); ring1.position.y = 8.5; ring1.rotation.x = 1.2;
        const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowT, color: 0xfff1b8, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.9 })); gl.scale.setScalar(36); gl.position.y = 8;
        staff.add(pole, orb, gem, ring1, gl); staff.position.set(sr + 70, 0, 20); group.add(staff);
        sy.staff = staff; sy.staffRing = ring1; sy.staffOrb = orb;
        return sy;
      }
      // planets
      defs.forEach(function (def, idx) {
        const g = new THREE.Group(); group.add(g);
        let obj, planetLib = null;
        if (def.home) {
          try {
            planetLib = SP.planet.create({ seed: def.seed, radius: def.size, detail: 4, amplitude: def.size * 0.075, palette: 'earth', propDensity: 0, floraDensity: 0 });
            planetLib.group.name = 'homePlanet'; obj = { group: planetLib.group };
          } catch (e) { console.error('home planet', e); obj = makePlanetMesh(def); }
        } else obj = makePlanetMesh(def);
        g.add(obj.group);
        const shell = addGlowShell(g, def.size, GLOW[def.type] || 0xffffff, def.type === 'gas' ? 0.18 : 0.26);
        let ring = null;
        if (def.ring) {
          ring = new THREE.Mesh(new THREE.RingGeometry(def.size * 1.5, def.size * 2.3, 48, 1), new THREE.MeshBasicMaterial({ color: 0xfde68a, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }));
          ring.rotation.x = Math.PI / 2 - 0.35; g.add(ring);
        }
        const moons = [];
        for (let m = 0; m < def.moons; m++) {
          const mm = R.cel(new THREE.IcosahedronGeometry(def.size * (0.2 + 0.05 * m), 1), 0xcbd5e1, { outline: 0.08, cast: false, receive: false });
          g.add(mm); moons.push({ m: mm, r: def.size * (2.1 + m * 0.7), a: m * 2.4, sp: 0.7 - m * 0.2 });
        }
        const colRing = new THREE.Mesh(new THREE.TorusGeometry(def.size * 1.7, 0.18, 6, 40), new THREE.MeshBasicMaterial({ color: 0x5eead4, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
        colRing.rotation.x = Math.PI / 2; colRing.visible = false; g.add(colRing);
        const pts = []; for (let k = 0; k < 160; k++) { const a = k / 160 * Math.PI * 2; pts.push(new V3(Math.cos(a) * def.orbit, 0, Math.sin(a) * def.orbit)); }
        const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x64748b, transparent: true, opacity: 0.45 }));
        group.add(line);
        const po = { def: def, group: g, obj: obj, shell: shell, moons: moons, colRing: colRing, pos: new V3(), planetLib: planetLib, line: line };
        sy.planets.push(po); if (planetLib) sy.planetObjs.push(po);
        po.spin = 0.12 + (idx % 3) * 0.05;
      });
      sy.planets.forEach(function (p) { this.placePlanet(p, 0); }, this);
      return sy;
    },
    placePlanet: function (p, t) {
      const a = p.def.phase + t * p.def.speed * 0.35;
      p.pos.set(Math.cos(a) * p.def.orbit, 0, Math.sin(a) * p.def.orbit); p.group.position.copy(p.pos);
    },
    planetWorld: function (def) {
      const sy = this.sys; if (sy) for (let i = 0; i < sy.planets.length; i++) if (sy.planets[i].def === def) return sy.planets[i].pos;
      return new V3();
    },
    planetObj: function (def) { const sy = this.sys; if (sy) for (let i = 0; i < sy.planets.length; i++) if (sy.planets[i].def === def) return sy.planets[i]; return null; },
    nearestPlanet: function () {
      const sy = this.sys; if (!sy) return null; let best = null, bd = 1e9;
      sy.planets.forEach(function (p) { if (p.def.type === 'gas') return; const d = p.pos.distanceTo(this.ship.pos); if (d < bd) { bd = d; best = p.def; } }, this);
      return best;
    },
    autopilotTo: function (def, thenOrbit) {
      if (def.type === 'gas' && thenOrbit) { SP.ui.toast('Gas giants have no surface to orbit.', '🪐'); return; }
      this.autopilot = { def: def, thenOrbit: !!thenOrbit }; this.sel = { type: 'planet', def: def }; this.refreshCard();
    },

    // =============================================================== enemies
    makeEnemy: function (kind, color, scale) {
      const R = SP.render, g = this.egeo, grp = new THREE.Group();
      let body = color, wing = 0x1e293b, glow = 0xf43f5e;
      if (kind === 'grox') { body = 0x7e22ce; wing = 0x1e1b4b; glow = 0xff3b3b; }
      else if (kind === 'pirate') { body = 0x78350f; wing = 0x292524; glow = 0xfacc15; }
      else { wing = color; body = 0xe2e8f0; glow = color; }
      const b = R.cel(g.body, body, { outline: 0.08, cast: false, receive: false });
      const w = R.cel(g.wing, wing, { outline: 0.08, cast: false, receive: false }); w.position.z = -0.5;
      const f = R.cel(g.fin, wing, { outline: 0.1, cast: false, receive: false }); f.position.set(0, 0.6, -1.0);
      const e = R.cel(g.eye, 0xffffff, { outline: 0.1, cast: false, receive: false, emissive: glow, emissiveIntensity: 0.9 }); e.position.set(0, 0.3, 0.7);
      grp.add(b, w, f, e);
      if (kind === 'grox') { for (let i = -1; i <= 1; i += 2) { const s = R.cel(g.spike, 0xdc2626, { outline: 0.1, cast: false, receive: false }); s.position.set(i * 1.5, 0, 0.4); s.rotation.x = Math.PI / 2; grp.add(s); } }
      if (kind === 'pirate') { const sk = R.cel(g.eye, 0xfffbeb, { outline: 0.12, cast: false, receive: false }); sk.scale.set(0.7, 0.7, 0.7); sk.position.set(0, 0.95, -0.1); grp.add(sk); }
      grp.scale.setScalar(scale || 1);
      return grp;
    },
    spawnHostiles: function (kind, n, strength, label, empId) {
      const sh = this.ship, rng = U.rng(Math.floor(this.t * 1000) + n), gal = this.gal;
      const base = { pirate: [32, 4, 31, 1.7, 40], empire: [55, 6, 34, 1.4, 60], grox: [85, 8, 36, 1.1, 90] }[kind];
      const color = kind === 'empire' && empId !== undefined && empId !== null ? gal.empires[empId].color : 0xf43f5e;
      for (let i = 0; i < n; i++) {
        const boss = label && i === 0 && (label === 'Warlord' || label === 'Guardian');
        const a = rng.range(0, Math.PI * 2), d = rng.range(170, 250);
        const sc = boss ? 2.3 : (kind === 'grox' ? 1.5 : 1.15);
        const mesh = this.makeEnemy(kind, color, sc);
        const hp = base[0] * (boss ? 6 : 1) * (0.85 + strength * 0.25);
        const e = { id: this.eid++, kind: kind, mesh: mesh, pos: new V3(sh.pos.x + Math.cos(a) * d, rng.range(-4, 4), sh.pos.z + Math.sin(a) * d), vel: new V3(), h: a + Math.PI,
          hp: hp, maxHp: hp, dmg: base[1] * (boss ? 1.6 : 1) * (0.9 + strength * 0.12), spd: base[2] * (boss ? 0.7 : 1), fireInt: base[3], fireT: rng.range(0.5, 2), r: 2.4 * sc, bounty: base[4] * (boss ? 5 : 1), strafe: rng.chance(0.5) ? 1 : -1, ph: rng.range(0, 6), pref: rng.range(55, 95), boss: boss, color: color, label: boss ? label : null, hit: 0 };
        mesh.position.copy(e.pos); this.sys.group.add(mesh); this.enemies.push(e);
      }
      this.hadEnemies = true;
    },
    killEnemy: function (e, byPlayer) {
      const i = this.enemies.indexOf(e); if (i < 0) return;
      this.enemies.splice(i, 1); e.mesh.parent && e.mesh.parent.remove(e.mesh);
      const c = e.kind === 'grox' ? 0xa855f7 : e.kind === 'pirate' ? 0xf97316 : e.color;
      this.fx.burst(e.pos.clone(), c, 22, 2.6, { life: 1.0, size: 0.9, gravity: 0 }); this.fx.burst(e.pos.clone(), 0xfef08a, 14, 1.6, { life: 0.7, size: 0.7, gravity: 0 });
      SP.audio && SP.audio.sfx('die', { vol: 0.7 });
      if (byPlayer) {
        this.st.stats.kills++; this.addMoney(e.bounty); SP.ui.popup(e.pos.clone(), this.camera, '+' + e.bounty + '💰', 'pop-gold');
        const sy = this.gal.stars[this.st.loc];
        if (sy.empire >= 0 && e.kind === 'empire') { this.rel(sy.empire).att -= 3; }
        this.checkBadges();
      }
      if (this.enemies.length === 0 && this.hadEnemies) {
        this.hadEnemies = false;
        const si = this.st.loc, raid = this.st.raids.some(function (r) { return r.star === si; });
        this.onCleared(si);
        SP.ui.banner(raid ? 'Colony saved!' : 'Sector clear', raid ? 'The raiders are gone.' : 'No more hostiles.', 1800);
        SP.audio && SP.audio.sfx('win', { vol: 0.5 });
        if (this.gal.stars[si].core) SP.ui.toast('The way to the Staff of Life is open!', '✨', 3600);
      }
    },
    hurtPlayer: function (dmg) {
      const st = this.st, sh = this.ship; if (sh.inv > 0 || this.ending || this.trans) return;
      dmg *= 100 / (100 + this.ss.defense * 5); st.hull -= dmg; sh.inv = 0.18; this.shake = Math.min(1.2, this.shake + dmg * 0.04);
      SP.audio && SP.audio.sfx('hurt', { vol: 0.6 });
      this.fx.burst(sh.pos.clone(), 0xfb7185, 5, 1, { life: 0.4, size: 0.4, gravity: 0 });
      if (st.hull <= 0) this.playerDied();
    },
    playerDied: function () {
      if (this.dying) return; this.dying = true;
      const st = this.st, self = this, lost = Math.floor(st.money * 0.15);
      this.fx.burst(this.ship.pos.clone(), 0xfb923c, 40, 3, { life: 1.2, size: 1, gravity: 0 }); SP.audio && SP.audio.sfx('die');
      SP.ui.banner('Ship destroyed!', 'Respawning at home (−' + lost + '💰)', 2600);
      this.shipGroup.visible = false;
      this.transition('warp', function () {
        st.money -= lost; st.loc = self.gal.homeIdx; st.energy = self.ss.energyMax; st.hull = self.ss.hullMax; st.raids.forEach(function (r) { r.spawned = false; });
        self.sysDispose(); self.autopilot = null; self.dying = false; self.fromJump = true; self.applyView('system'); self.fromJump = false; self.arriveEffects(st.loc, true);
      }, 2.0);
    },

    // =============================================================== bolts
    fireBolt: function (own, pos, dir, dmg, speed, life, color) {
      if (this.bolts.length >= 190) return;
      this.bolts.push({ own: own, p: pos.clone(), v: dir.clone().multiplyScalar(speed), life: life, dmg: dmg, c: new THREE.Color(color) });
    },
    updateBolts: function (dt) {
      const bl = this.bolts, m4 = this.mtmp, q = this.qtmp, one = this.stmp, sh = this.ship, z = new V3(0, 0, 1), d = new V3();
      let n = 0;
      for (let i = bl.length - 1; i >= 0; i--) {
        const b = bl[i]; b.life -= dt; b.p.addScaledVector(b.v, dt);
        let dead = b.life <= 0;
        if (!dead && b.own === 'p') {
          for (let k = 0; k < this.enemies.length; k++) {
            const e = this.enemies[k]; if (b.p.distanceToSquared(e.pos) < (e.r + 0.8) * (e.r + 0.8)) {
              e.hp -= b.dmg; e.hit = 0.15; dead = true; this.fx.burst(b.p.clone(), 0xfff7ae, 4, 1, { life: 0.35, size: 0.35, gravity: 0 }); SP.audio && SP.audio.sfx('hit', { vol: 0.35 });
              SP.ui.popup(b.p.clone(), this.camera, '-' + Math.round(b.dmg), 'pop-white');
              if (e.hp <= 0) this.killEnemy(e, true);
              break;
            }
          }
        } else if (!dead && b.own === 'e') {
          if (b.p.distanceToSquared(sh.pos) < 3.2 * 3.2) { dead = true; this.hurtPlayer(b.dmg); }
        }
        if (dead) { bl[i] = bl[bl.length - 1]; bl.pop(); }
      }
      for (let i = 0; i < bl.length; i++) {
        const b = bl[i]; d.copy(b.v).normalize(); q.setFromUnitVectors(z, d);
        m4.compose(b.p, q, one); this.boltMesh.setMatrixAt(n, m4); this.boltMesh.setColorAt(n, b.c); n++;
      }
      this.boltMesh.count = n; this.boltMesh.instanceMatrix.needsUpdate = true; if (this.boltMesh.instanceColor) this.boltMesh.instanceColor.needsUpdate = true;
    },
    updateEnemies: function (dt) {
      const sh = this.ship, st = this.st, calm = st.calm > 0;
      for (let i = 0; i < this.enemies.length; i++) {
        const e = this.enemies[i];
        const to = sh.pos.clone().sub(e.pos); to.y = 0; const d = to.length();
        const want = Math.atan2(to.x, to.z);
        e.h = U.angleLerp(e.h, want, 1 - Math.exp(-dt * 2.4));
        const f = new V3(Math.sin(e.h), 0, Math.cos(e.h)), side = new V3(f.z, 0, -f.x);
        let thrust = d > e.pref + 20 ? 1 : d < e.pref - 25 ? -0.7 : 0.1;
        if (calm) thrust = 0.2;
        e.vel.addScaledVector(f, thrust * e.spd * 2 * dt); e.vel.addScaledVector(side, e.strafe * Math.sin(this.t * 0.9 + e.ph) * e.spd * 0.8 * dt);
        e.vel.multiplyScalar(Math.exp(-dt * 1.3)); e.pos.addScaledVector(e.vel, dt);
        e.pos.y += (0 - e.pos.y) * dt * 0.5;
        e.mesh.position.copy(e.pos); e.mesh.rotation.y = e.h; e.mesh.rotation.z = -e.strafe * Math.sin(this.t * 0.9 + e.ph) * 0.3;
        e.hit = Math.max(0, e.hit - dt);
        const s = 1 + e.hit * 1.5; const sc = e.mesh.userData.sc || (e.mesh.userData.sc = e.mesh.scale.x); e.mesh.scale.setScalar(sc * s);
        e.fireT -= dt;
        if (!calm && e.fireT <= 0 && d < 170 && Math.abs(U.wrapAngle(want - e.h)) < 0.35) {
          e.fireT = e.fireInt * (e.boss ? 0.5 : 1) * (0.8 + Math.random() * 0.4);
          const aim = sh.pos.clone().addScaledVector(sh.vel, d / 64); aim.sub(e.pos).normalize();
          aim.x += (Math.random() - 0.5) * 0.14; aim.z += (Math.random() - 0.5) * 0.14; aim.normalize();
          const mp = e.pos.clone().addScaledVector(f, 2.4);
          this.fireBolt('e', mp, aim, e.dmg, 66, 2.6, e.kind === 'grox' ? 0xff4d4d : e.kind === 'pirate' ? 0xfacc15 : e.color);
          SP.audio && SP.audio.sfx('laser', { vol: 0.18, pitch: 0.7 });
        }
      }
    },

    // =============================================================== scanning
    scanSelected: function () {
      const def = this.selPlanetDef() || this.nearestPlanet(); if (!def) { SP.ui.toast('Select a planet to scan', '🔬'); return; }
      if (def.type === 'gas') { this.scanning = null; }
      const ps = this.psOf(def);
      if (ps.scanned) { SP.ui.toast('Already scanned.', '🔬', 1500); return; }
      if (def.inhabited !== undefined) { SP.ui.toast('The inhabitants wave back. Use Hail instead.', '👽', 2200); return; }
      const d = this.ship.pos.distanceTo(this.planetWorld(def));
      if (d > def.size + 95) { SP.ui.toast('Fly closer to scan (within ' + Math.round(def.size + 95) + ' u).', '🔬'); this.autopilotTo(def, false); return; }
      this.scanning = { def: def, t: 0 }; SP.audio && SP.audio.sfx('charge');
    },
    scanReveal: function (def) {
      const ps = this.psOf(def); if (ps.scanned) return;
      ps.scanned = true; this.st.stats.scans++;
      const T = G().tScore(ps), sp = def.spice >= 0 ? G().SPICES[def.spice] : null;
      SP.ui.toast(def.name + ': T-score ' + T + ' · ' + (sp ? sp.name + ' spice' : 'no spice') + ' · life: ' + def.life, '🔬', 4200);
      SP.audio && SP.audio.sfx('dna'); this.onScanned(def); this.checkBadges(); this.refreshCard();
    },

    // =============================================================== per-frame
    updateSystem: function (dt, busy) {
      const sy = this.sys; if (!sy) return;
      const sh = this.ship, m = SP.input.mouse, inp = SP.input, st = this.st, ss = this.ss, cam = this.camera;
      // animate world
      sy.planets.forEach(function (p) {
        this.placePlanet(p, this.t);
        p.obj.group.rotation.y += dt * p.spin;
        const col = this.psOf(p.def).colony; p.colRing.visible = !!col || !!p.def.home; p.colRing.rotation.z += dt * 0.5;
        p.moons.forEach(function (mn) { mn.a += dt * mn.sp; mn.m.position.set(Math.cos(mn.a) * mn.r, 0, Math.sin(mn.a) * mn.r); });
        if (p.planetLib) { try { p.planetLib.update && p.planetLib.update(dt, this.t, new V3(0, 0, 0)); } catch (e) {} }
      }, this);
      if (sy.rays) sy.rays.rotation.z += dt * 0.1;
      if (sy.rings) sy.rings.forEach(function (r, i) { r.rotation.z += dt * (1.2 - i * 0.3); });
      if (sy.swirl) sy.swirl.rotation.z += dt * 0.12;
      if (sy.staff) { sy.staff.rotation.y += dt * 0.6; sy.staff.position.y = Math.sin(this.t * 1.3) * 1.2; sy.staffRing.rotation.z += dt * 1.5; sy.staffOrb.rotation.y += dt; }
      // input
      let turn = 0, thr = 0, boost = false;
      if (!busy && !this.dying) {
        turn = (inp.isDown('KeyA') || inp.isDown('ArrowLeft') ? 1 : 0) - (inp.isDown('KeyD') || inp.isDown('ArrowRight') ? 1 : 0);
        thr = (inp.isDown('KeyW') || inp.isDown('ArrowUp') ? 1 : 0) - (inp.isDown('KeyS') || inp.isDown('ArrowDown') ? 0.6 : 0);
        boost = inp.isDown('ShiftLeft') || inp.isDown('ShiftRight');
        const tcl = this.touchCtl;                                   // on-screen buttons (B-07)
        if (tcl && tcl.on) { turn = clamp(turn + tcl.turn, -1, 1); thr = clamp(thr + tcl.thr, -1, 1); boost = boost || tcl.boost; }
        if (turn || thr) { this.autopilot = null; }
        if (m.wheel) {
          const sc = this.sc;
          if (m.wheel > 0 && sc.td >= 690) this.gotoView('galaxy');
          else if (m.wheel < 0 && sc.td <= 15.5 && this.selPlanetDef() && this.selPlanetDef().type !== 'gas' && this.ship.pos.distanceTo(this.planetWorld(this.selPlanetDef())) < this.selPlanetDef().size + 130) this.gotoView('orbit', this.selPlanetDef());
          else sc.td = clamp(sc.td * Math.exp(m.wheel * 0.17), 14, 700);
        }
        if (m.dragging && m.right && this._pressWorld) { this.sc.off -= m.dx * 0.006; this.sc.pitch = clamp(this.sc.pitch + m.dy * 0.004, 0.12, 1.45); }
        if (!m.right && Math.abs(this.sc.off) > 0.001 && !m.dragging) this.sc.off *= Math.exp(-dt * 0.8);
        // press edge: decide fire vs planet click
        if (m.left && !this.prevLeft) this.noFire = !this._pressWorld || !!this.rayPlanet();
        if (m.clicked && !inp.pointerOverUI()) {
          const pl = this.rayPlanet();
          if (pl) { this.autopilotTo(pl.def, false); SP.audio && SP.audio.sfx('click'); }
          else if (m.touch && this._pressWorld) { const gp = this.groundPoint(); if (gp) { this.autopilot = { point: gp }; SP.audio && SP.audio.sfx('click', { vol: 0.5 }); } }   // tap empty space = fly there
        }
        if (m.rightClicked && !inp.pointerOverUI()) { const gp = this.groundPoint(); if (gp) { this.autopilot = { point: gp }; } }
      }
      this.prevLeft = m.left;
      // autopilot
      if (this.autopilot && !busy) {
        const ap = this.autopilot, tgt = ap.def ? this.planetWorld(ap.def) : ap.point;
        const to = tgt.clone().sub(sh.pos); to.y = 0; const d = to.length(), stopD = ap.def ? ap.def.size + (ap.thenOrbit ? 30 : 36) : 6;
        const want = Math.atan2(to.x, to.z), diff = U.wrapAngle(want - sh.h);
        turn = clamp(diff * 3, -1, 1); thr = Math.abs(diff) < 0.9 ? clamp((d - stopD) / 60, 0.2, 1) : 0.1; boost = d > 260;
        if (d < stopD + 4) {
          this.autopilot = null; thr = 0;
          if (ap.thenOrbit) this.gotoView('orbit', ap.def);
          else if (ap.def && !this.psOf(ap.def).scanned && ap.def.type !== 'gas' && ap.def.inhabited === undefined) SP.ui.toast('Arrived. Press T to scan ' + ap.def.name + '.', '🔬', 2200);
        }
      }
      // ship physics
      sh.turn += (turn - sh.turn) * (1 - Math.exp(-dt * 7)); sh.h += sh.turn * 2.5 * dt;
      const f = new V3(Math.sin(sh.h), 0, Math.cos(sh.h)), acc = ss.speed * 1.8 * (boost ? 2.1 : 1);
      if (boost && thr > 0 && st.energy > 0.3) { st.energy = Math.max(0, st.energy - dt * 1.2); } else if (boost) boost = false;
      sh.vel.addScaledVector(f, thr * acc * dt); sh.vel.multiplyScalar(Math.exp(-dt * 1.2)); sh.pos.addScaledVector(sh.vel, dt);
      sh.thrust = thr; sh.pos.y *= Math.exp(-dt * 3);
      // collisions with star and planets
      const sr = sy.starR + 6, dd = new V3();
      dd.copy(sh.pos); dd.y = 0; if (dd.length() < sr && !sy.rings) { dd.normalize().multiplyScalar(sr); sh.pos.x = dd.x; sh.pos.z = dd.z; sh.vel.multiplyScalar(0.5); if (!sy.rings) this.hurtPlayer(0.3); }
      sy.planets.forEach(function (p) {
        dd.copy(sh.pos).sub(p.pos); dd.y = 0; const rr = p.def.size * 1.2 + 3;
        if (dd.length() < rr) { dd.normalize().multiplyScalar(rr); sh.pos.x = p.pos.x + dd.x; sh.pos.z = p.pos.z + dd.z; sh.vel.multiplyScalar(0.6); }
      });
      // apply to ship object
      this.shipGroup.position.copy(sh.pos); this.shipGroup.rotation.set(0, sh.h, -sh.turn * 0.45);
      this.shipRig.animate(dt, { speed: sh.vel.length(), throttle: clamp(Math.max(0, thr) + (boost ? 0.5 : 0), 0, 1) });
      if (thr > 0.1 && Math.random() < 0.6) this.fx.burst(sh.pos.clone().addScaledVector(f, -2.4 * this.shipScale), boost ? 0xfde047 : 0x7dd3fc, 1, 0.1, { life: 0.5, size: 0.28, gravity: 0, flat: true });
      sh.inv = Math.max(0, sh.inv - dt);
      // combat
      this.updateFire(dt, busy);
      this.updateEnemies(dt); this.updateBolts(dt);
      // black hole wormhole pull / staff pickup
      // B-02: the Guardians really do protect the Staff - it can only be taken once the core system is clear
      if (sy.staff && !this.ending && !st.endedShown && sh.pos.distanceTo(sy.staff.position) < 20) {
        if (this.enemies.length === 0) this.finishQuest();
        else if (!this._guardT || this.t - this._guardT > 6) { this._guardT = this.t; SP.ui.toast('The Guardians still protect the Staff of Life - destroy them first!', '💀', 3200); SP.audio && SP.audio.sfx('alarm', { vol: 0.5 }); }
      }
      // scanning
      if (this.scanning) {
        const sc = this.scanning, p = this.planetWorld(sc.def), d = sh.pos.distanceTo(p);
        if (d > sc.def.size + 120) { this.scanning = null; this.beam.visible = false; SP.ui.toast('Scan interrupted', '🔬', 1200); }
        else {
          sc.t += dt; this.beam.visible = true;
          const mid = sh.pos.clone().add(p).multiplyScalar(0.5); this.beam.position.copy(mid); this.beam.scale.set(1 + Math.sin(this.t * 30) * 0.3, d, 1);
          this.beam.quaternion.setFromUnitVectors(new V3(0, 1, 0), p.clone().sub(sh.pos).normalize());
          if (sc.t > 1.8) { this.beam.visible = false; this.scanning = null; this.scanReveal(sc.def); }
        }
      } else this.beam.visible = false;
      // shake decay
      this.shake = Math.max(0, this.shake - dt * 2.2);
      if (this.view === 'system' && Math.floor(this.t * 4) % 2 === 0) this.cardDirty = this.cardDirty || false;
    },
    updateFire: function (dt, busy) {
      const sh = this.ship, m = SP.input.mouse, inp = SP.input, ss = this.ss, st = this.st;
      sh.fireT -= dt; if (busy || this.dying) return;
      const wantFire = (m.left && !m.touch && this._pressWorld && !this.noFire && !inp.pointerOverUI()) || inp.isDown('Space') || !!(this.touchCtl && this.touchCtl.fire);
      if (!wantFire || sh.fireT > 0) return;
      const fr = st.frenzy > 0 ? 1.7 : 1, dmg = (3 + ss.power * 0.55) * (st.frenzy > 0 ? 2 : 1) * (st.arch === 'warrior' ? 1.2 : 1);
      sh.fireT = 0.27 / fr;
      let dir;
      const gp = m.left ? this.groundPoint() : null;
      if (gp) { dir = gp.clone().sub(sh.pos); dir.y = 0; dir.normalize(); }
      else dir = new V3(Math.sin(sh.h), 0, Math.cos(sh.h));
      // aim assist
      let best = null, bd = 1e9; const ray = m.left ? SP.input.ray(this.camera) : null;
      this.enemies.forEach(function (e) {
        let dist;
        if (ray) { dist = ray.distanceToPoint(e.pos); } else { const to = e.pos.clone().sub(sh.pos); dist = Math.abs(U.wrapAngle(Math.atan2(to.x, to.z) - sh.h)) * to.length(); }
        if (dist < e.r * 2.6 + 4 && dist < bd) { bd = dist; best = e; }
      });
      if (best) { const d = best.pos.distanceTo(sh.pos); dir = best.pos.clone().addScaledVector(best.vel, d / 130).sub(sh.pos); dir.y = 0; dir.normalize(); }
      const side = new V3(dir.z, 0, -dir.x);
      [-1, 1].forEach(function (s) {
        this.fireBolt('p', sh.pos.clone().addScaledVector(dir, 3).addScaledVector(side, s * 1.1), dir, dmg, 135, 1.5, st.frenzy > 0 ? 0xfde047 : 0x5eead4);
      }, this);
      SP.audio && SP.audio.sfx('laser', { vol: 0.28 });
    },
    groundPoint: function () {
      const ray = SP.input.ray(this.camera), y = this.ship.pos.y, o = ray.origin, d = ray.direction;
      if (Math.abs(d.y) < 1e-4) return null; const t = (y - o.y) / d.y; if (t < 0) return null;
      return o.clone().addScaledVector(d, t);
    },
    rayPlanet: function () {
      const sy = this.sys; if (!sy) return null; const ray = SP.input.ray(this.camera), sph = new THREE.Sphere(), tmp = new V3(); let best = null, bd = 1e9;
      sy.planets.forEach(function (p) { sph.set(p.pos, p.def.size * 1.35 + 3 + this.sc.dist * 0.012); if (ray.intersectSphere(sph, tmp)) { const d = tmp.distanceTo(ray.origin); if (d < bd) { bd = d; best = p; } } }, this);
      return best;
    },

    cameraSystem: function (dt, snap) {
      const sc = this.sc, sh = this.ship, cam = this.camera;
      sc.dist += (sc.td - sc.dist) * (snap ? 1 : 1 - Math.exp(-dt * 6));
      if (sc.dist < 150 || snap) sc.yaw = snap ? sh.h + Math.PI + sc.off : U.angleLerp(sc.yaw, sh.h + Math.PI + sc.off, 1 - Math.exp(-dt * 2.2));
      const pitch = sc.pitch + clamp((sc.dist - 120) / 500, 0, 1) * (1.4 - sc.pitch);
      const cp = Math.cos(pitch), off = new V3(Math.sin(sc.yaw) * cp, Math.sin(pitch), Math.cos(sc.yaw) * cp).multiplyScalar(sc.dist);
      const look = sh.pos.clone().add(new V3(Math.sin(sh.h), 0, Math.cos(sh.h)).multiplyScalar(Math.min(sc.dist * 0.2, 40)));
      cam.position.copy(snap ? sh.pos.clone().add(off) : cam.position.lerp(sh.pos.clone().add(off), 1 - Math.exp(-dt * (snap ? 99 : 9))));
      if (this.shake > 0) cam.position.add(new V3((Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5)).multiplyScalar(this.shake * 1.2));
      cam.up.set(0, 1, 0); cam.lookAt(look);
    },

    pinsSystem: function () {
      const sy = this.sys; if (!sy || this.view !== 'system') { this.hidePrefix('pl'); this.hidePin('en'); return; }
      this.hidePrefix('pl');
      const sel = this.selPlanetDef();
      sy.planets.forEach(function (p, i) {
        const ps = this.st.planets[p.def.key], tags = (p.def.home ? '🏠' : ps && ps.colony ? '🏗️' : p.def.inhabited !== undefined ? '👽' : ps && ps.scanned ? '✅' : '');
        const pin = this.pin('pl' + i, '<span' + (sel === p.def ? ' style="border-color:#fde047;color:#fde047"' : '') + '>' + G().PTYPES[p.def.type].icon + ' ' + p.def.name + ' ' + tags + '</span>');
        this.placePin(pin, p.pos.clone().add(new V3(0, p.def.size * 1.2, 0)), -6);
      }, this);
      // nearest enemy arrow
      let ne = null, nd = 1e9; this.enemies.forEach(function (e) { const d = e.pos.distanceTo(this.ship.pos); if (d < nd) { nd = d; ne = e; } }, this);
      if (ne) {
        const v = ne.pos.clone().project(this.camera), behind = v.z > 1 || v.z < -1; let x = v.x, y = v.y; if (behind) { x = -x; y = -y; }
        const off = behind || Math.abs(x) > 0.92 || Math.abs(y) > 0.88;
        const k = Math.max(Math.abs(x) / 0.92, Math.abs(y) / 0.88, 1); x /= k; y /= k;
        const p = this.pin('en', '<i>' + (ne.boss ? '💀' : '☠️') + '</i><span>' + Math.round(nd) + (ne.boss ? ' · ' + ne.label + ' ' + Math.round(ne.hp) + '❤' : '') + '</span>');
        p.style.display = ''; p.style.left = ((x * 0.5 + 0.5) * SP.render.width) + 'px'; p.style.top = ((-y * 0.5 + 0.5) * SP.render.height) + 'px'; p.style.opacity = off ? 1 : 0.8;
      } else this.hidePin('en');
    }
  };
  Object.assign(S, M);
})();
