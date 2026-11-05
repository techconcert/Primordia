/* SP.stages.intro — meteor intro (DESIGN §4). ~14 s, skippable (click / Esc / Space). */
(function () {
  'use strict';
  const SP = window.SP = window.SP || {};
  SP.stages = SP.stages || {};
  const U = SP.util, V3 = THREE.Vector3;

  const T_COMET = 2.6, T_HIT = 7.0, T_UNDER = 11.0, T_END = 14.4;
  const ease = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const clamp01 = (t) => Math.max(0, Math.min(1, t));

  function glowTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,200,120,.7)'); gr.addColorStop(1, 'rgba(255,120,40,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }

  const S = SP.stages.intro = {
    id: 'intro', title: 'Meteor Intro', next: 'cell', noBanner: true,
    scene: null, camera: null,
    enter: function (campaign, opts) {
      const R = SP.render, scene = this.scene = new THREE.Scene();
      scene.background = new THREE.Color(0x05070d);
      const camera = this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1200);
      this._unResize = R.onResize(function (w, h) { camera.aspect = w / h; camera.updateProjectionMatrix(); });
      this.t = 0; this.done = false; this.phase = 'space';
      const L = this.lights = R.makeLights(scene, 'space'); L.sun.castShadow = false; L.sun.position.set(-60, 40, 80); L.sun.intensity = 0.35; L.ambient.intensity = 0.55; L.ambient.color.setHex(0x8aa0d0);

      // stars (three layers of size)
      const rng = U.rng(42), N = 1800, pos = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) {
        const v = new V3(rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)).normalize().multiplyScalar(rng.range(300, 600));
        pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
      }
      const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0.9 }));
      scene.add(this.stars);
      // near star streaks (fly-through feel)
      const M = 160, sp = new Float32Array(M * 6); this.streakSeeds = [];
      for (let i = 0; i < M; i++) {
        const a = rng.range(0, Math.PI * 2), r = rng.range(8, 70), z = rng.range(-300, 60);
        this.streakSeeds.push({ x: Math.cos(a) * r, y: Math.sin(a) * r, z: z });
      }
      const stg = new THREE.BufferGeometry(); stg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
      this.streaks = new THREE.LineSegments(stg, new THREE.LineBasicMaterial({ color: 0xbfe3ff, transparent: true, opacity: 0.6 }));
      this.streaks.frustumCulled = false; scene.add(this.streaks);

      // planet
      const PR = this.PR = 12;
      const planet = this.planet = new THREE.Group(); scene.add(planet);
      const water = R.cel(new THREE.IcosahedronGeometry(PR, 4), 0x0369a1, { outline: 0.0, cast: false });
      planet.add(water);
      this.impactDirPre = new V3(0.22, 0.12, 0.97).normalize();
      const rock = U.rng(7);
      for (let i = 0; i < 14; i++) {
        const d = new V3(rock.range(-1, 1), rock.range(-0.6, 0.6), rock.range(-1, 1)).normalize();
        if (d.dot(this.impactDirPre) > 0.62) { i--; continue; }   // keep the impact ocean clear
        const s = rock.range(1.2, 3.2);
        const isl = R.cel(new THREE.DodecahedronGeometry(s, 0), rock.pick([0x65a30d, 0x4d7c0f, 0x84cc16]), { outline: 0.05, cast: false });
        isl.position.copy(d).multiplyScalar(PR * 0.98); isl.quaternion.setFromUnitVectors(new V3(0, 1, 0), d); isl.scale.set(1.3, 0.4, 1.3); planet.add(isl);
      }
      const rim = new THREE.Mesh(new THREE.SphereGeometry(PR * 1.07, 32, 20), new THREE.MeshBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.3, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false }));
      planet.add(rim);
      planet.add(new THREE.Mesh(new THREE.SphereGeometry(PR * 1.012, 32, 20), SP.render.outlineMaterial()));

      // impact site and comet
      this.impactDir = new V3(0.22, 0.12, 0.97).normalize();
      this.P = this.impactDir.clone().multiplyScalar(PR);
      this.cometStart = this.P.clone().add(new V3(-0.7, 0.3, 0.3).normalize().multiplyScalar(90));
      const comet = this.comet = new THREE.Group();
      const core = R.cel(new THREE.DodecahedronGeometry(1.1, 0), 0xf97316, { outline: 0.1, cast: false, emissive: 0xf97316, emissiveIntensity: 0.6 }); comet.add(core);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      glow.scale.setScalar(9); comet.add(glow);
      const tail = this.tail = new THREE.Mesh(new THREE.ConeGeometry(1.0, 16, 10, 1, true), new THREE.MeshBasicMaterial({ color: 0xffb454, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      tail.geometry.translate(0, -8, 0); tail.name = 'tail'; comet.add(tail);   // tip at origin, widening backwards (-Y local)
      comet.visible = false; scene.add(comet); this.core = core;
      this.fx = R.particles(scene, 500);

      // shock ring
      this.ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.08, 6, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      this.ring.position.copy(this.P).multiplyScalar(1.01); this.ring.lookAt(this.P.clone().multiplyScalar(2)); this.ring.visible = false; scene.add(this.ring);

      // underwater scene (built hidden)
      const uw = this.uw = new THREE.Group(); uw.visible = false; uw.position.set(0, 0, -2000); scene.add(uw);
      this.bubbles = [];
      const bg = new THREE.SphereGeometry(1, 8, 6);
      for (let i = 0; i < 60; i++) {
        const b = R.cel(bg, 0xa5f3fc, { outline: 0, cast: false, emissive: 0x22d3ee, emissiveIntensity: 0.5, transparent: true, opacity: 0.55 });
        const s = rng.range(0.05, 0.3); b.scale.setScalar(s);
        b.position.set(rng.range(-9, 9), rng.range(-6, 6), rng.range(-8, 3));
        this.bubbles.push({ m: b, sp: rng.range(0.3, 1.1), ph: rng.range(0, 6) }); uw.add(b);
      }
      const shell = this.shell = new THREE.Group();
      const hemi = new THREE.SphereGeometry(1.5, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
      const top = R.cel(hemi, 0xe9dfc4, { outline: 0.05, cast: false, side: THREE.DoubleSide }), bot = R.cel(hemi, 0xd9c58a, { outline: 0.05, cast: false, side: THREE.DoubleSide });
      bot.rotation.x = Math.PI; shell.add(top, bot); uw.add(shell); this.shellTop = top; this.shellBot = bot;
      const cell = this.cell = new THREE.Group();
      cell.add(R.cel(new THREE.SphereGeometry(0.95, 18, 14), 0x4ade80, { outline: 0.06, cast: false, emissive: 0x16a34a, emissiveIntensity: 0.25 }));
      const nuc = R.cel(new THREE.SphereGeometry(0.38, 12, 10), 0xbbf7d0, { outline: 0.1, cast: false }); nuc.position.set(0.1, -0.1, 0.5); cell.add(nuc);
      const ew = new THREE.SphereGeometry(0.28, 12, 10), pg = new THREE.SphereGeometry(0.13, 8, 6);
      [-0.38, 0.32].forEach(function (x, i) { const e = R.cel(ew, 0xffffff, { outline: 0.1, cast: false }); e.position.set(x, 0.42, 0.78); e.scale.setScalar(i ? 0.85 : 1); const p = R.cel(pg, 0x080c14, { outline: 0 }); p.position.z = 0.2; e.add(p); cell.add(e); });
      const fl = R.cel(new THREE.ConeGeometry(0.16, 1.1, 8), 0x86efac, { outline: 0.12, cast: false }); fl.position.set(0, -0.2, -1.2); fl.rotation.x = -Math.PI / 2; cell.add(fl); this.flag = fl;
      cell.visible = false; uw.add(cell);
      uw.add(new THREE.PointLight(0x5eead4, 0.4, 30));

      // DOM
      const hud = document.getElementById('hud'); hud.innerHTML = '';
      this.dom = {};
      const mk = (cls, parent, text) => { const d = SP.ui.el('div', cls, text); (parent || hud).appendChild(d); return d; };
      this.dom.tint = mk('intro-tint'); this.dom.flash = mk('intro-flash');
      this.dom.cap = mk('intro-caption stroke-sm', null, 'Somewhere in the vast, quiet dark...');
      this.dom.skip = mk('intro-skip stroke-sm', null, 'Click or press Esc to skip');
      ['tint', 'flash', 'cap', 'skip'].forEach((k) => { this.dom[k].style.pointerEvents = 'none'; });
      this.camShake = 0; this.flags = {};
      // skip input
      const self = this;
      this._skip = function (e) {
        if (self.t < 0.4) return;
        if (e.type === 'keydown' && ['Escape', 'Space', 'Enter'].indexOf(e.code) < 0) return;
        self.finish(true);
      };
      this._offK = SP.input.on('keydown', this._skip);
      this._offC = SP.input.on('mousedown', this._skip);
      if (SP.audio) SP.audio.music('space');
      this.update(0.001);
    },

    finish: function (skipped) {
      if (this.done) return; this.done = true;
      if (SP.game && SP.game.goto) SP.game.goto('cell', { fromIntro: true, skipped: !!skipped });
    },

    update: function (dt) {
      if (this.done) return;
      this.t += dt;
      const t = this.t, cam = this.camera, P = this.P, PR = this.PR, D = this.dom;
      if (this.fx) this.fx.update(dt);
      const caption = t > 0.6 && t < 3.4;
      D.cap.classList.toggle('on', caption);
      if (t > 3.4 && D.cap.textContent.indexOf('Somewhere') === 0) D.cap.textContent = 'A visitor arrives...';
      D.cap.classList.toggle('on', caption || (t > 3.8 && t < 6.2));

      // ---- star streaks (camera fly-through during phase 1)
      const fly = t * 38;
      const sp = this.streaks.geometry.attributes.position;
      const zOff = this.phase === 'space' ? fly : 0;
      for (let i = 0; i < this.streakSeeds.length; i++) {
        const s = this.streakSeeds[i];
        let z = ((s.z + zOff) % 360) - 300 + 150;
        const len = 5 + Math.min(12, fly * 0.04);
        sp.setXYZ(i * 2, s.x, s.y, z); sp.setXYZ(i * 2 + 1, s.x, s.y, z - len);
      }
      sp.needsUpdate = true;
      this.streaks.material.opacity = 0.55 * (1 - clamp01((t - 5.5) / 1.5));
      this.stars.rotation.y = t * 0.004;

      // ---- phase 1/2: space approach
      if (t < T_UNDER) {
        const k = ease(clamp01(t / T_HIT));
        cam.position.set(U.lerp(-6, 7, k), U.lerp(7, 5, k), U.lerp(150, 40, k));
        const look = new V3().copy(P).multiplyScalar(0.25 * k);
        if (t > T_HIT) {
          // dive towards the water at the impact site
          const kk = ease(clamp01((t - T_HIT) / (T_UNDER - T_HIT - 1.0)));
          const end = this.impactDir.clone().multiplyScalar(PR + 7.5);   // A-06: stop above the water, never inside the wall of ocean
          const startPos = new V3(7, 5, 40);
          cam.position.copy(startPos).lerp(end, kk);
          look.copy(P).addScaledVector(new V3(0, 1, 0), 2.2 * kk);   // tilt a little so the curved horizon and foam stay in frame
          cam.up.set(0, 1, 0);
          if (t > T_HIT + 0.4 && t < T_UNDER - 0.8 && Math.random() < 0.7) this.fx.burst(P.clone().addScaledVector(this.impactDir, 0.1), 0xe0f2fe, 3, 1.4, { up: this.impactDir, life: 1.2, size: 0.32, gravity: 3 });
        } else cam.up.set(0, 1, 0);
        if (this.camShake > 0) { this.camShake = Math.max(0, this.camShake - dt * 1.4); cam.position.x += (Math.random() - 0.5) * this.camShake; cam.position.y += (Math.random() - 0.5) * this.camShake; }
        cam.lookAt(look);
      }
      this.planet.rotation.y = -0.1 + t * 0.01;

      // ---- comet
      if (t >= T_COMET && t < T_HIT) {
        if (!this.flags.warp) { this.flags.warp = 1; this.comet.visible = true; SP.audio && SP.audio.sfx('warp'); }
        const k = clamp01((t - T_COMET) / (T_HIT - T_COMET)), e = k * k * 0.55 + k * 0.45;
        const pos = new V3().copy(this.cometStart).lerp(P, e);
        const vel = new V3().copy(P).sub(this.cometStart).normalize();
        this.comet.position.copy(pos);
        this.comet.quaternion.setFromUnitVectors(new V3(0, 1, 0), vel);   // tail (-Y) trails behind
        this.core.rotation.x += dt * 4; this.core.rotation.y += dt * 3;
        const sc = 1 + 2.4 * (1 - e); this.comet.scale.setScalar(Math.max(1, sc));
        if (Math.random() < 0.8) this.fx.burst(pos, Math.random() < 0.5 ? 0xfbbf24 : 0xf97316, 2, 0.3, { life: 1.1, size: 0.5, gravity: 0 });
      }
      if (t >= T_HIT && !this.flags.hit) {
        this.flags.hit = 1; this.comet.visible = false; this.camShake = 1.4;
        D.flash.style.transition = 'none'; D.flash.style.opacity = 1; void D.flash.offsetWidth; D.flash.style.transition = 'opacity 1.4s'; D.flash.style.opacity = 0;
        const up = this.impactDir;
        this.fx.burst(P.clone(), 0xffffff, 40, 3.2, { up: up, life: 1.4, size: 0.5, gravity: 4 });
        this.fx.burst(P.clone(), 0xf97316, 50, 2.4, { up: up, life: 1.6, size: 0.6, gravity: 3 });
        this.fx.burst(P.clone(), 0x7dd3fc, 40, 2.0, { up: up, life: 1.8, size: 0.45, gravity: 3 });
        this.ring.visible = true; this.ringT = 0;
        if (SP.audio) { SP.audio.sfx('hit'); SP.audio.sfx('splash'); SP.audio.sfx('alarm', { vol: 0.0 }); }
        D.cap.classList.remove('on');
      }
      if (this.ring.visible) {
        this.ringT += dt; const rk = this.ringT / 2.2;
        this.ring.scale.setScalar(0.5 + rk * 9); this.ring.material.opacity = Math.max(0, 0.9 * (1 - rk));
        if (rk >= 1) this.ring.visible = false;
      }
      // underwater tint ramp during dive
      if (t > T_HIT + 1.0 && t < T_UNDER) { D.tint.style.transition = 'none'; D.tint.style.opacity = clamp01((t - T_HIT - 1.0) / (T_UNDER - T_HIT - 1.0)); }   // cross-fade into the underwater colour

      // ---- phase 3: underwater, primordia cracks
      if (t >= T_UNDER) {
        if (!this.flags.under) {
          this.flags.under = 1; this.phase = 'under';
          this.planet.visible = false; this.comet.visible = false; this.stars.visible = false; this.streaks.visible = false;
          this.uw.position.set(0, 0, 0); this.uw.visible = true;
          this.scene.background = new THREE.Color(0x0b3b4a);
          this.scene.fog = new THREE.Fog(0x062430, 8, 26);
          this.lights.setPreset('cell');
          cam.up.set(0, 1, 0); cam.position.set(0, 0.2, 9); cam.lookAt(0, 0, 0);
          D.tint.style.transition = 'opacity 1s'; D.tint.style.opacity = 0;
          D.cap.textContent = 'Life begins...'; D.cap.classList.add('on');
          if (SP.audio) SP.audio.music('cell');
        }
        const u = t - T_UNDER;
        this.bubbles.forEach(function (b) { b.m.position.y += b.sp * dt; if (b.m.position.y > 7) b.m.position.y = -7; b.m.position.x += Math.sin(t * 1.3 + b.ph) * dt * 0.2; });
        const crack = clamp01((u - 1.2) / 1.0);
        // egg wobble, then the shell halves fly apart
        this.shell.rotation.z = u < 1.2 ? Math.sin(u * 22) * 0.07 * clamp01(u / 0.5) : 0;
        this.shell.rotation.x = u < 1.2 ? Math.cos(u * 17) * 0.05 : 0;
        if (u >= 1.2 && !this.flags.crack) { this.flags.crack = 1; D.cap.classList.remove('on'); this.cell.visible = true; this.fx.burst(new V3(0, 0, 0), 0xfffbeb, 30, 1.6, { life: 1.2, size: 0.18, gravity: 0, flat: false }); SP.audio && SP.audio.sfx('levelup'); SP.audio && SP.audio.sfx('crunch'); }
        if (u >= 1.2) {
          this.shellTop.position.set(-crack * 3.2, crack * 2.6, 0); this.shellTop.rotation.z = crack * 1.1; this.shellTop.rotation.x = crack * 0.7;
          this.shellBot.position.set(crack * 3.2, -crack * 2.2, 0); this.shellBot.rotation.z = -crack * 1.0;
          const fade = clamp01((u - 2.0) / 0.8);
          this.shellTop.visible = this.shellBot.visible = fade < 1;
        }
        const pop = this.flags.crack ? Math.min(1, (u - 1.2) / 0.5) : 0, over = 1 + Math.sin(pop * Math.PI) * 0.3;
        this.cell.scale.setScalar(Math.max(0.01, pop * over) * (1 + Math.sin(t * 5) * 0.04));
        this.cell.position.y = Math.sin(t * 2) * 0.12; this.cell.rotation.y = Math.sin(t * 1.2) * 0.4;
        this.flag.rotation.z = Math.sin(t * 9) * 0.5;
        if (u >= 2.6 && !this.flags.title) {
          this.flags.title = 1;
          const c = SP.ui.el('div', 'stage-title-card stroke', '<div class="small">STAGE 1</div><div class="big">CELL STAGE</div>');
          document.getElementById('hud').appendChild(c);
          SP.audio && SP.audio.sfx('win');
          D.skip.style.display = 'none';
        }
        if (t >= T_END) this.finish(false);
      }
      this.fx && this.fx.update(0);
    },

    exit: function () {
      this.done = true;
      if (this._offK) this._offK(); if (this._offC) this._offC();
      if (this._unResize) this._unResize();
      if (this.fx) this.fx.dispose();
      if (this.scene) SP.render.disposeTree(this.scene);
      this.scene = null;
    }
  };
  if (SP.game && SP.game.registerStage) SP.game.registerStage(S);
})();
