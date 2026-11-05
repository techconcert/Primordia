/* Space stage — planet orbit view: hover over a planet (SP.planet), scan, colonise, terraform, plant life. Installed onto SP.stages.space. */
(function () {
  'use strict';
  const SP = window.SP = window.SP || {};
  const U = SP.util, V3 = THREE.Vector3, clamp = U.clamp;
  const G = function () { return SP.spaceGalaxy; };
  const S = SP.stages.space;
  const PR = 40;   // planet radius in the orbit view

  const M = {
    initOrbitCommon: function () { this.orb = null; },

    // =============================================================== show / hide
    orbShow: function (def) {
      const R = SP.render, self = this, ps = this.psOf(def), scene = this.scene;
      const group = new THREE.Group(); scene.add(group);
      const pal = def.type === 'gas' ? 'earth' : def.type;
      const planet = SP.planet.create({ seed: def.seed, radius: PR, detail: 5, amplitude: 3.8, palette: pal, propDensity: 0.45, floraDensity: 0.35 });
      planet.flora.cullRadius = 1e9; planet.flora._dirty = true;
      if (planet.atmosphere) planet.atmosphere.visible = false;
      group.add(planet.group);
      const shell = new THREE.Mesh(new THREE.SphereGeometry(PR * 1.06, 40, 24), new THREE.MeshBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.2, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false }));
      group.add(shell);
      const rim = new THREE.Mesh(new THREE.SphereGeometry(PR * 1.012, 40, 24), SP.render.outlineMaterial()); group.add(rim); rim.visible = false;
      // far sun glow
      const sunDir = new V3(0.6, 0.35, 0.7).normalize();
      const sunTex = G().glowTexture('rgba(255,255,255,1)', 'rgba(255,230,160,0)');
      const star = this.gal.stars[this.st.loc], sc = G().STAR_TYPES[star.type] || G().STAR_TYPES.yellow;
      const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTex, color: sc.glow, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.9 }));
      sun.scale.setScalar(300); sun.position.copy(sunDir).multiplyScalar(900); group.add(sun);
      this.sunDir.position.copy(sunDir).multiplyScalar(200); this.sunDir.color.setHex(sc.color); this.sunDir.intensity = 0.3;
      const colonyGroup = new THREE.Group(), lifeGroup = new THREE.Group(); group.add(colonyGroup, lifeGroup);
      const ghost = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.25, 6, 24), new THREE.MeshBasicMaterial({ color: 0x4ade80, transparent: true, opacity: 0.9 })); ghost.visible = false; group.add(ghost);
      const o = this.orb = { def: def, ps: ps, planet: planet, group: group, shell: shell, rim: rim, sun: sun, sunTex: sunTex, colonyGroup: colonyGroup, lifeGroup: lifeGroup, ghost: ghost, placing: false, tween: null, critters: [],
        dir: new V3(), hd: new V3(), turn: 0, cd: 30, ctd: 30, yaw: 0, pitch: 0.5, lifeKey: '', colLevel: 0, t: 0 };
      // ship starts above the colony (or a random land spot)
      let d0;
      if (ps.colony && ps.colony.dir) d0 = new V3().fromArray(ps.colony.dir);
      else if (def.home && this.campaign.homeDir) d0 = new V3().fromArray(this.campaign.homeDir);
      else d0 = planet.randomLandDir(U.rng(def.seed + 3));
      o.dir.copy(d0).normalize();
      const up = o.dir, tmp = Math.abs(up.y) < 0.9 ? new V3(0, 1, 0) : new V3(1, 0, 0);
      o.hd.crossVectors(up, tmp).normalize().cross(up).multiplyScalar(-1).normalize(); o.hd.crossVectors(tmp, up).cross(up).normalize();
      if (o.hd.lengthSq() < 0.5) o.hd.set(1, 0, 0).addScaledVector(up, -up.x).normalize();
      this.shipGroup.visible = true; this.shipGroup.scale.setScalar(0.5);
      this.scene.background = new THREE.Color(0x05070d);
      // colony / capital buildings
      this.orbRefreshColony(true);
      this.orbRefreshLife(true);
      this.orbShell();
      // panel
      const panel = o.panel = SP.spaceUI.planetPanel(this);
      const wrap = o.wrap = SP.ui.el('div', 'hud-corner hud-bl'); wrap.style.maxHeight = 'calc(100% - 270px)'; wrap.style.overflow = 'auto'; wrap.appendChild(panel.el);
      this.h.root.appendChild(wrap); panel.sync(true);
      this.sc.td = 30;
      o.cd = o.ctd = 30; this.placeOrbitShip(0, true);
      SP.audio && SP.audio.sfx('warp', { vol: 0.3 });
      this.collectAll(this.st.loc, true);
    },
    orbHide: function () {
      const o = this.orb; if (!o) return;
      if (o.wrap) o.wrap.remove();
      this.orbDispose();
      // put the ship back next to the planet in the system view
      const def = o.def, pw = this.planetWorld(def), sh = this.ship, dir = pw.length() > 1 ? pw.clone().normalize() : new V3(0, 0, 1);
      sh.pos.copy(pw).addScaledVector(dir, def.size + 32); sh.pos.y = 0; sh.vel.set(0, 0, 0); sh.h = Math.atan2(-dir.x, -dir.z);
      this.sc.yaw = sh.h + Math.PI; this.sc.td = this.sc.dist = 36; this.sc.off = 0;
      this.hidePrefix('orb');
    },
    orbDispose: function () {
      const o = this.orb; if (!o) return;
      if (o.wrap && o.wrap.parentNode) o.wrap.remove();
      this.scene.remove(o.group);
      o.group.traverse(function (m) { if (m.geometry) m.geometry.dispose(); });
      o.colonyGroup.children.forEach(function (c) { if (c.userData.rig) { try { c.userData.rig.dispose(); } catch (e) {} } });
      try { o.planet.dispose(); } catch (e) {}
      if (o.sunTex) o.sunTex.dispose();
      if (o.lifeMesh) { o.lifeMesh.forEach(function (m) { m.dispose && m.dispose(); }); }
      this.orb = null;
    },
    orbitPS: function () { return this.orb ? this.orb.ps : null; },
    orbitDef: function () { return this.orb ? this.orb.def : null; },

    // =============================================================== buildings
    orbRefreshColony: function (force) {
      const o = this.orb; if (!o) return;
      const ps = o.ps, def = o.def, level = def.home ? 4 : ps.colony ? ps.colony.level : 0;
      if (!force && level === o.colLevel) return;
      o.colLevel = level;
      o.colonyGroup.children.slice().forEach(function (c) { o.colonyGroup.remove(c); if (c.userData.rig) { try { c.userData.rig.dispose(); } catch (e) {} } });
      if (!level) return;
      let dir;
      if (ps.colony && ps.colony.dir) dir = new V3().fromArray(ps.colony.dir);
      else if (def.home) dir = this.campaign.homeDir ? new V3().fromArray(this.campaign.homeDir) : o.planet.randomLandDir(U.rng(def.seed + 3));
      else return;
      dir.normalize();
      const planet = o.planet;
      const e1 = new V3().crossVectors(Math.abs(dir.y) < 0.9 ? new V3(0, 1, 0) : new V3(1, 0, 0), dir).normalize(), e2 = new V3().crossVectors(dir, e1);
      const kinds = ['cityhall', 'house', 'house', 'factory', 'house', 'entertainment'], layout = [[0, 0], [3.6, 0.4], [-3.4, 1.4], [0.6, -3.8], [3.0, -3.2], [-3.2, -3.0]];
      const n = def.home ? 6 : Math.min(kinds.length, 1 + level + (level > 2 ? 1 : 0));
      const scale = 0.3;
      for (let i = 0; i < n; i++) {
        const k = kinds[i], role = k;
        let d; try { d = SP.assembly.defaultDesign('building', role); } catch (e) { continue; }
        let rig; try { rig = SP.assembly.build(d, {}); } catch (e) { console.error(e); continue; }
        const dd = dir.clone().addScaledVector(e1, layout[i][0] / PR).addScaledVector(e2, layout[i][1] / PR).normalize();
        const pt = planet.surfacePoint(dd), nrm = planet.normalAt(dd);
        const g = new THREE.Group(); g.add(rig.root); g.userData.rig = rig; rig.root.scale.setScalar(scale);
        g.position.copy(pt).addScaledVector(nrm, 0.15); g.quaternion.setFromUnitVectors(new V3(0, 1, 0), nrm); g.rotateY(i * 1.3);
        o.colonyGroup.add(g);
      }
      // beacon
      const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 14, 6, 1, true), new THREE.MeshBasicMaterial({ color: 0x5eead4, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }));
      beacon.position.copy(planet.surfacePoint(dir)).addScaledVector(dir, 7); beacon.quaternion.setFromUnitVectors(new V3(0, 1, 0), dir); o.colonyGroup.add(beacon);
    },
    orbRefreshLife: function (force) {
      const o = this.orb; if (!o) return; const ps = o.ps, key = ps.plants + ':' + ps.animals;
      if (!force && key === o.lifeKey) return; o.lifeKey = key;
      o.lifeGroup.children.slice().forEach(function (c) { o.lifeGroup.remove(c); });
      if (o.lifeMesh) { o.lifeMesh.forEach(function (m) { m.dispose && m.dispose(); }); }
      o.lifeMesh = []; o.critters = [];
      const rng = U.rng(o.def.seed + 77), planet = o.planet, R = SP.render;
      if (ps.plants > 0) {
        const n = Math.min(40 + ps.plants * 45, 160), geo = new THREE.DodecahedronGeometry(1, 0), pal = planet.palette.canopy, cols = [pal[0][1], pal[1 % pal.length][1], pal[0][0]];
        const inst = R.celInstanced(geo, 0xffffff, n, { outline: 0.1, cast: false, receive: false }); const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
        let placed = 0;
        for (let i = 0; i < n * 4 && placed < n; i++) {
          const d = planet.randomLandDir(rng); const pt = planet.surfacePoint(d), nrm = planet.normalAt(d); if (planet.slopeAt(d) > 0.5) continue;
          q.setFromUnitVectors(new V3(0, 1, 0), nrm); const s = rng.range(0.5, 1.1);
          m4.compose(pt.addScaledVector(nrm, s * 0.6), q, new V3(s, s * rng.range(0.8, 1.4), s)); inst.setMatrixAt(placed, m4); c.setHex(rng.pick(cols)); inst.setColorAt(placed, c); placed++;
        }
        inst.setCount(placed); inst.update(); o.lifeGroup.add(inst.group); o.lifeMesh.push(geo);
      }
      if (ps.animals > 0) {
        const n = Math.min(3 + ps.animals * 3, 14), bg = new THREE.SphereGeometry(0.7, 10, 8), eg = new THREE.SphereGeometry(0.22, 6, 5); o.lifeMesh.push(bg, eg);
        for (let i = 0; i < n; i++) {
          const g = new THREE.Group(), body = R.cel(bg, rng.pick(R.PALETTE), { outline: 0.1, cast: false, receive: false }); body.scale.set(1, 0.85, 1.25);
          const e1 = R.cel(eg, 0xffffff, { outline: 0.15, cast: false, receive: false }), e2 = e1.clone(); e1.position.set(0.28, 0.35, 0.8); e2.position.set(-0.28, 0.35, 0.8);
          g.add(body, e1, e2); o.lifeGroup.add(g);
          o.critters.push({ g: g, dir: planet.randomLandDir(rng), ax: new V3(rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)).normalize(), sp: rng.range(0.01, 0.03), ph: rng.range(0, 6) });
        }
      }
    },
    orbShell: function () {
      const o = this.orb; if (!o) return; const ps = o.ps;
      const cold = new THREE.Color(0x7dd3fc), mid = new THREE.Color(0x86efac), hot = new THREE.Color(0xfb923c), c = new THREE.Color();
      const t = ps.temp / 100; if (t < 0.5) c.copy(cold).lerp(mid, t * 2); else c.copy(mid).lerp(hot, (t - 0.5) * 2);
      if (o.def.type === 'alien_purple') c.lerp(new THREE.Color(0xe879f9), 0.5);
      o.shell.material.color.copy(c); o.shell.material.opacity = 0.07 + ps.atmo * 0.0032; o.shell.scale.setScalar(0.96 + ps.atmo * 0.0012);
    },

    // =============================================================== actions (called by the panel)
    scanOrbitPlanet: function () { const o = this.orb; if (!o) return; if (o.def.inhabited !== undefined) return; this.scanReveal(o.def); },
    applyTerraform: function (tA, tT) {
      const o = this.orb; if (!o) return; const ps = o.ps, inv = this.st.inv;
      if (o.def.inhabited !== undefined || o.def.type === 'gas') return;
      const before = G().tScore(ps);
      const plan = function (cur, tgt, toolUp, toolDown) {
        const diff = tgt - cur; if (Math.abs(diff) < 0.5) return { val: cur, used: {} };
        const tool = diff > 0 ? toolUp : toolDown, need = Math.ceil(Math.abs(diff) / 12 - 0.001), use = Math.min(need, inv[tool]);
        const used = {}; used[tool] = use; return { val: cur + Math.sign(diff) * Math.min(Math.abs(diff), use * 12), used: used, short: need > use, tool: tool };
      };
      const a = plan(ps.atmo, tA, 'gen', 'gen'), t = plan(ps.temp, tT, 'heat', 'frz');
      let any = false;
      [a.used, t.used].forEach(function (u) { for (const k in u) if (u[k] > 0) { inv[k] -= u[k]; any = true; } });
      if (!any) { SP.ui.toast('No tool charges for that change. Buy some with the 🌫️ ❄️ 🔥 buttons!', '🛠️', 3200); SP.audio && SP.audio.sfx('social_bad'); return; }
      if (a.short || t.short) SP.ui.toast('Not enough charges for the full change; applied what you had.', '🛠️', 2600);
      o.tween = { a0: ps.atmo, a1: a.val, t0: ps.temp, t1: t.val, t: 0, dur: 1.8, before: before };
      SP.audio && SP.audio.sfx('charge'); SP.audio && SP.audio.sfx('build');
      this.syncHud(true);
    },
    placeLife: function (kind) {
      const o = this.orb; if (!o) return; const inv = this.st.inv;
      if (o.def.inhabited !== undefined || o.def.type === 'gas') { SP.ui.toast('Not here.', '🚫'); return; }
      if (inv[kind] <= 0) { SP.ui.toast('None left: buy in the Market (B).', '🛒'); return; }
      inv[kind]--; o.ps[kind]++;
      this.orbRefreshLife(); SP.audio && SP.audio.sfx('place');
      this.fx.burst(this.shipGroup.position.clone(), kind === 'plants' ? 0x84cc16 : 0xf9a8d4, 24, 1.6, { life: 1.0, size: 0.5, gravity: 1 });
      SP.ui.toast((kind === 'plants' ? 'Plants' : 'Animals') + ' released! The climate is more stable (+3 tolerance).', kind === 'plants' ? '🌱' : '🐾', 2800);
      this.refreshOwnership();
    },
    beginColonise: function () {
      const o = this.orb; if (!o) return; const st = this.st;
      if (o.ps.colony) { SP.ui.toast('Already colonised.', '🏗️'); return; }
      if (o.def.inhabited !== undefined || o.def.type === 'gas' || o.def.home) { SP.ui.toast('You cannot colonise this world.', '🚫'); return; }
      if (st.inv.packs <= 0) { SP.ui.toast('You need a Colony Pack (Market, B).', '🛒', 3000); return; }
      o.placing = !o.placing; if (o.placing) SP.ui.toast('Click a spot on dry land to found your colony. Right-click cancels.', '🏗️', 3500);
    },
    collectHere: function () {
      const o = this.orb; if (!o || !o.ps.colony) return;
      const n = Math.floor(o.ps.colony.store), sp = o.def.spice;
      if (n < 1 || sp < 0) return;
      o.ps.colony.store -= n; this.st.spice[sp] = (this.st.spice[sp] || 0) + n; SP.ui.toast('+' + n + ' ' + G().SPICES[sp].name, '✨', 2200); SP.audio && SP.audio.sfx('dna'); this.syncHud(true);
    },
    foundColony: function (dir) {
      const o = this.orb, st = this.st; if (!o) return;
      st.inv.packs--; o.ps.colony = { level: 1, store: 0, age: 0, dir: [dir.x, dir.y, dir.z] }; o.placing = false; st.stats.colonies++;
      o.ps.scanned = true;
      this.orbRefreshColony(true); this.refreshOwnership();
      SP.audio && SP.audio.sfx('build'); SP.audio && SP.audio.sfx('win', { vol: 0.5 });
      SP.ui.banner('Colony founded!', o.def.name, 2200);
      this.fx.burst(o.planet.surfacePoint(dir), 0x5eead4, 30, 2, { life: 1.1, size: 0.6, gravity: 0, up: dir });
      this.checkBadges(); this.syncHud(true);
    },

    // =============================================================== update
    placeOrbitShip: function (dt, snap) {
      const o = this.orb, sh = this.ship, up = o.dir, fwd = o.hd;
      const gr = o.planet.groundOrWater(up).point.length(), alt = gr + 6.5;
      const pos = up.clone().multiplyScalar(alt), x = new V3().crossVectors(up, fwd).normalize();
      const m = new THREE.Matrix4().makeBasis(x, up, fwd);
      this.shipGroup.position.copy(pos); this.shipGroup.quaternion.setFromRotationMatrix(m); this.shipGroup.rotateZ(-o.turn * 0.4);
      sh.pos.copy(pos); o.pos = pos; o.up = up; o.fwd = fwd;
    },
    updateOrbit: function (dt, busy) {
      const o = this.orb; if (!o) return; const inp = SP.input, m = inp.mouse, sh = this.ship;
      o.t += dt;
      o.planet.update(dt, this.t, new V3(0, 0, 0));
      // input
      let turn = 0, thr = 0, boost = false;
      if (!busy) {
        turn = (inp.isDown('KeyA') || inp.isDown('ArrowLeft') ? 1 : 0) - (inp.isDown('KeyD') || inp.isDown('ArrowRight') ? 1 : 0);
        thr = (inp.isDown('KeyW') || inp.isDown('ArrowUp') ? 1 : 0) - (inp.isDown('KeyS') || inp.isDown('ArrowDown') ? 0.6 : 0);
        boost = inp.isDown('ShiftLeft') || inp.isDown('ShiftRight');
        if (m.wheel) { if (m.wheel > 0 && o.ctd >= 94) this.gotoView('system'); else o.ctd = clamp(o.ctd * Math.exp(m.wheel * 0.15), 11, 95); }
        if (m.dragging && m.right && this._pressWorld) { o.yaw -= m.dx * 0.006; o.pitch = clamp(o.pitch + m.dy * 0.004, 0.15, 1.3); }
        else if (!m.right) o.yaw *= Math.exp(-dt * 0.6);
      }
      // move over the surface (great-circle)
      const speed = (16 + this.ss.speed * 0.4) * (boost ? 1.8 : 1), R0 = PR + 6.5;
      o.turn += (turn - o.turn) * (1 - Math.exp(-dt * 7));
      o.hd.applyAxisAngle(o.dir, o.turn * 1.9 * dt);
      if (thr) {
        const axis = new V3().crossVectors(o.dir, o.hd).normalize(); // rotation axis: moves dir towards hd
        const ang = thr * speed * dt / R0; const q = new THREE.Quaternion().setFromAxisAngle(axis, ang);
        o.dir.applyQuaternion(q).normalize(); o.hd.applyQuaternion(q);
      }
      o.hd.addScaledVector(o.dir, -o.hd.dot(o.dir)).normalize();
      this.shipRig.animate(dt, { speed: speed * Math.abs(thr), throttle: Math.abs(thr) * (boost ? 1 : 0.8) });
      this.placeOrbitShip(dt, false);
      // tween
      if (o.tween) {
        const tw = o.tween; tw.t += dt; const f = clamp(tw.t / tw.dur, 0, 1), e = f * f * (3 - 2 * f);
        o.ps.atmo = tw.a0 + (tw.a1 - tw.a0) * e; o.ps.temp = tw.t0 + (tw.t1 - tw.t0) * e; this.orbShell();
        if (Math.random() < 0.5) this.fx.burst(o.up.clone().multiplyScalar(PR + 4), 0xa5f3fc, 2, 1.2, { life: 0.9, size: 0.7, gravity: 0, up: o.up });
        if (f >= 1) {
          o.tween = null; const after = G().tScore(o.ps);
          if (after > tw.before) { SP.ui.banner('T-score ' + after + '!', after >= 3 ? 'A paradise world!' : 'The planet is getting greener', 2000); SP.audio && SP.audio.sfx('levelup'); }
          else if (after < tw.before) SP.ui.toast('T-score dropped to ' + after, '⚠️');
          this.checkBadges(); this.syncHud(true);
        }
        o.panel.sync();
      }
      // life animation
      o.critters.forEach(function (c) {
        c.dir.applyAxisAngle(c.ax, c.sp * dt * (0.4 + 0.6 * Math.sin(this.t * 0.5 + c.ph))).normalize();
        const pt = o.planet.surfacePoint(c.dir), nrm = o.planet.normalAt(c.dir); c.g.position.copy(pt).addScaledVector(nrm, 0.6 + Math.abs(Math.sin(this.t * 4 + c.ph)) * 0.25);
        c.g.quaternion.setFromUnitVectors(new V3(0, 1, 0), nrm); c.g.rotateY(c.ph + this.t * 0.2);
        if (o.planet.isWater(c.dir)) c.g.visible = false; else c.g.visible = true;
      }, this);
      o.sun.material.opacity = 0.8 + Math.sin(this.t) * 0.05;
      // colony placement
      o.ghost.visible = false;
      if (o.placing && !busy) {
        const hit = inp.raycast(this.camera, [o.planet.terrain], false)[0];
        if (hit && !inp.pointerOverUI()) {
          const dir = hit.point.clone().normalize(), ok = !o.planet.isWater(dir) && o.planet.slopeAt(dir) < 0.5;
          o.ghost.visible = true; o.ghost.position.copy(o.planet.surfacePoint(dir)).addScaledVector(dir, 0.5); o.ghost.quaternion.setFromUnitVectors(new V3(0, 0, 1), o.planet.normalAt(dir)); o.ghost.material.color.setHex(ok ? 0x4ade80 : 0xf43f5e);
          o.ghost.scale.setScalar(1 + Math.sin(this.t * 6) * 0.1);
          if (m.clicked) { if (ok) this.foundColony(dir); else { SP.ui.toast('Pick dry, flat land.', '🚫', 1500); SP.audio && SP.audio.sfx('social_bad'); } }
        }
        if (m.rightClicked) { o.placing = false; }
      }
      if (this.beam) this.beam.visible = false;
      // sweep fx particles
      this.shake = 0;
    },
    cameraOrbit: function (dt, snap) {
      const o = this.orb, cam = this.camera; if (!o || !o.pos) return;
      o.cd += (o.ctd - o.cd) * (snap ? 1 : 1 - Math.exp(-dt * 6));
      const k = clamp((o.cd - 45) / 50, 0, 1), pitch = o.pitch + k * (1.3 - o.pitch);
      const back = o.fwd.clone().applyAxisAngle(o.up, o.yaw).multiplyScalar(-Math.cos(pitch)).addScaledVector(o.up, Math.sin(pitch)).multiplyScalar(o.cd);
      const want = o.pos.clone().add(back);
      cam.position.copy(snap ? want : cam.position.lerp(want, 1 - Math.exp(-dt * 8)));
      cam.up.copy(o.up);
      const look = o.pos.clone().addScaledVector(o.fwd, o.cd * 0.25 * (1 - k)).addScaledVector(o.up, -o.cd * 0.05);
      look.lerp(new V3(0, 0, 0), k * 0.8);
      cam.lookAt(look);
    }
  };
  Object.assign(S, M);
})();
