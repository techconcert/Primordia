// SP.sky -- day/night cycle, gradient sky dome, stars, sun/moon, clouds, light presets blending.
// The sun orbits the planet in world space; "night" is wherever the focus point faces away from it.
(function () {
  'use strict';
  const SP = window.SP = window.SP || {};
  const V3 = THREE.Vector3;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  function create(scene, planet, opts) {
    opts = opts || {};
    const dayLength = opts.dayLength || 360;
    const pal = (planet && planet.palette) || {};
    const skyCols = pal.sky || { day: 0x7dd3fc, horizon: 0xcdeffd };
    const tilt = opts.tilt === undefined ? 0.38 : opts.tilt;
    // sun orbit: great circle perpendicular to axis A (tilted from world Y)
    const axis = new V3(Math.sin(tilt), Math.cos(tilt), 0.12).normalize();
    const e1 = new V3().crossVectors(axis, new V3(0, 0, 1)).normalize(), e2 = new V3().crossVectors(axis, e1).normalize();
    let phase = opts.startTime === undefined ? 0.42 : opts.startTime; // 0..1 orbit fraction of the sun (global clock)
    const sunDir = new V3(), moonDir = new V3(), focusUp = new V3(0, 1, 0), focusPos = new V3(0, planet ? planet.radius : 100, 0);

    const lights = opts.lights || (SP.render && SP.render.makeLights ? SP.render.makeLights(scene, 'day') : null);
    const fog = new THREE.Fog(skyCols.horizon, 60, 260);
    if (opts.fog !== false) scene.fog = fog;
    scene.background = new THREE.Color(0x0d121d);

    // ---------------- dome
    const dome = new THREE.Group(); dome.name = 'sky'; scene.add(dome);
    const uni = { uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uUp: { value: new V3(0, 1, 0) }, uSpace: { value: 0 }, uVoid: { value: new THREE.Color(0x0d121d) } };
    const domeMat = new THREE.ShaderMaterial({
      uniforms: uni, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'varying vec3 vD; uniform vec3 uTop; uniform vec3 uHor; uniform vec3 uUp; uniform float uSpace; uniform vec3 uVoid;' +
        'void main(){ float h = dot(normalize(vD), uUp); float k = smoothstep(-0.15, 0.75, h); vec3 c = mix(uHor, uTop, pow(k, 0.8)); gl_FragColor = vec4(mix(c, uVoid, uSpace), 1.0); }',
    });
    const domeMesh = new THREE.Mesh(new THREE.SphereGeometry(1200, 24, 14), domeMat); domeMesh.renderOrder = -10; domeMesh.frustumCulled = false; dome.add(domeMesh);

    // stars
    const N = 700, sp = new Float32Array(N * 3), rs = new (window.SP.util && SP.util.rng ? function (s) { return SP.util.rng(s); } : function (s) { let a = s; return { next() { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; } }; })(planet ? (planet.seed | 0) + 5 : 5);
    for (let i = 0; i < N; i++) { const y = rs.next() * 2 - 1, th = rs.next() * Math.PI * 2, r = Math.sqrt(1 - y * y); sp[i * 3] = Math.cos(th) * r * 1100; sp[i * 3 + 1] = y * 1100; sp[i * 3 + 2] = Math.sin(th) * r * 1100; }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 2.4, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
    const stars = new THREE.Points(sg, starMat); stars.frustumCulled = false; stars.renderOrder = -9; dome.add(stars);

    // sun & moon discs
    const sunMesh = new THREE.Mesh(new THREE.CircleGeometry(48, 24), new THREE.MeshBasicMaterial({ color: 0xfff1b8, fog: false, depthWrite: false }));
    const sunHalo = new THREE.Mesh(new THREE.CircleGeometry(95, 24), new THREE.MeshBasicMaterial({ color: 0xfde68a, transparent: true, opacity: 0.25, fog: false, depthWrite: false }));
    const moonMesh = new THREE.Mesh(new THREE.CircleGeometry(30, 20), new THREE.MeshBasicMaterial({ color: 0xe2e8f0, fog: false, depthWrite: false }));
    [sunMesh, sunHalo, moonMesh].forEach((m) => { m.renderOrder = -8; m.frustumCulled = false; dome.add(m); });

    // clouds: a few chunky cel blobs drifting around the planet
    const cloudGroup = new THREE.Group(); cloudGroup.name = 'clouds';
    let clouds = [];
    if (planet && opts.clouds !== false) {
      const geo = new THREE.DodecahedronGeometry(1, 0), mat = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: SP.render && SP.render.gradientMap, transparent: true, opacity: 0.95 });
      const ink = SP.render && SP.render.outlineMaterial ? SP.render.outlineMaterial() : new THREE.MeshBasicMaterial({ color: 0x080c14, side: THREE.BackSide });
      for (let i = 0; i < 26; i++) {
        const g = new THREE.Group(), n = 3 + Math.floor(rs.next() * 3);
        for (let k = 0; k < n; k++) {
          const s = 2.2 + rs.next() * 2.4, m = new THREE.Mesh(geo, mat); m.scale.set(s * 1.5, s * 0.8, s * 1.1); m.position.set((k - n / 2) * 3.2, rs.next() * 1.2, (rs.next() - 0.5) * 2);
          const o = new THREE.Mesh(geo, ink); o.scale.setScalar(1.09); m.add(o); g.add(m);
        }
        const dir = new V3(rs.next() * 2 - 1, rs.next() * 2 - 1, rs.next() * 2 - 1).normalize();
        const h = planet.radius + 30 + rs.next() * 14;
        clouds.push({ g, dir, h, ax: new V3(rs.next() - 0.5, 1, rs.next() - 0.5).normalize(), sp: 0.004 + rs.next() * 0.008, yaw: rs.next() * 6 });
        cloudGroup.add(g);
      }
      scene.add(cloudGroup);
    }

    const cDay = { top: new THREE.Color(skyCols.day), hor: new THREE.Color(skyCols.horizon), amb: new THREE.Color(0xfff7ed), sun: new THREE.Color(0xffedd5), rim: new THREE.Color(0x38bdf8) };
    const cDusk = { top: new THREE.Color(0x7c3aed), hor: new THREE.Color(0xfb923c), amb: new THREE.Color(0xf5c6d8), sun: new THREE.Color(0xfb923c), rim: new THREE.Color(0xa78bfa) };
    const cNight = { top: new THREE.Color(0x0b1026), hor: new THREE.Color(0x1e2a5a), amb: new THREE.Color(0x6070c0), sun: new THREE.Color(0x8fa4ff), rim: new THREE.Color(0x7c3aed) };
    const tmpA = new THREE.Color(), tmpB = new THREE.Color();
    let space = 0, localE = 0, tod = 0.5, smoothE = null;

    const sky = {
      dome, lights, stars, fog, dayLength,
      timeOfDay: 0.5, isNight: false, sunDir, moonDir, elevation: 0, light: 1,
      get phase() { return phase; },
      // set the global clock: t = fraction of the day (0..1), 0.5 = sun on the "noon meridian"
      setTime(t) { phase = ((t % 1) + 1) % 1; smoothE = null; computeSun(); },
      // 0 = on the ground, 1 = looking from space (fades the horizon gradient to the void, keeps stars)
      // choose the global clock so that the local time of day at `pos` equals tod (0.5 noon, 0 midnight)
      setLocalTime(tod, pos) {
        const up = (pos || focusPos).clone().normalize(); const east = _east(up); const target = (tod - 0.5) * 2 * Math.PI;
        let best = 0, bd = 1e9;
        for (let i = 0; i < 360; i++) {
          const a = i / 360 * Math.PI * 2, sd = e1.clone().multiplyScalar(Math.cos(a)).addScaledVector(e2, Math.sin(a));
          let d = Math.atan2(sd.dot(east), sd.dot(up)) - target; d = Math.abs(Math.atan2(Math.sin(d), Math.cos(d)));
          if (d < bd) { bd = d; best = i / 360; }
        }
        phase = best; smoothE = null; computeSun(); if (pos) { focusPos.copy(pos); focusUp.copy(up); } sky.update(0, null);
      },
      setAltitude(k) { space = clamp(k, 0, 1); },
      update(dt, focus) {
        phase = (phase + dt / dayLength) % 1;
        if (focus && focus.lengthSq() > 0) { focusPos.copy(focus); focusUp.copy(focus).normalize(); }
        computeSun();
        const e = sunDir.dot(focusUp);
        smoothE = smoothE === null ? e : smoothE + (e - smoothE) * Math.min(1, dt * 6);
        sky.elevation = smoothE;
        // time-of-day for UI / AI: 0.5 noon, 0.25 sunrise, 0.75 sunset, 0 midnight
        const ang = Math.atan2(sunDir.dot(_east(focusUp)), e);
        tod = 0.5 + ang / (2 * Math.PI); // east of zenith = morning
        // morning: sun toward +east side
        sky.timeOfDay = ((tod % 1) + 1) % 1;
        sky.isNight = smoothE < -0.08;
        apply(smoothE);
      },
    };
    const _ev = new V3();
    function _east(up) { const r = Math.abs(up.y) < 0.95 ? _ev.set(0, 1, 0) : _ev.set(1, 0, 0); const east = new V3().crossVectors(r, up).normalize(); return east.multiplyScalar(-1); }
    function computeSun() {
      const a = phase * Math.PI * 2;
      sunDir.copy(e1).multiplyScalar(Math.cos(a)).addScaledVector(e2, Math.sin(a)).normalize();
      moonDir.copy(sunDir).negate();
    }
    function blend(e, key, out) {
      // day when e > .3, dusk around 0, night below -.2
      const wDay = ss(0.05, 0.4, e), wNight = ss(0.0, -0.3, e), wDusk = Math.max(0, 1 - wDay - wNight);
      out.setRGB(cDay[key].r * wDay + cDusk[key].r * wDusk + cNight[key].r * wNight, cDay[key].g * wDay + cDusk[key].g * wDusk + cNight[key].g * wNight, cDay[key].b * wDay + cDusk[key].b * wDusk + cNight[key].b * wNight);
      return out;
    }
    function apply(e) {
      blend(e, 'top', tmpA); uni.uTop.value.copy(tmpA);
      blend(e, 'hor', tmpB); uni.uHor.value.copy(tmpB);
      uni.uUp.value.copy(focusUp); uni.uSpace.value = space;
      dome.position.copy(opts.followCamera ? opts.followCamera.position : focusPos);
      if (opts.followCamera) dome.position.copy(opts.followCamera.position);
      if (scene.background && scene.background.isColor) scene.background.copy(tmpB);
      fog.color.copy(tmpB);
      fog.near = 60 + space * 5000; fog.far = 260 + space * 20000;
      const night = ss(-0.05, -0.35, e);
      starMat.opacity = Math.max(night, space * 0.9);
      sunMesh.position.copy(sunDir).multiplyScalar(1000); sunHalo.position.copy(sunMesh.position);
      moonMesh.position.copy(moonDir).multiplyScalar(1000);
      [sunMesh, sunHalo, moonMesh].forEach((m) => { m.lookAt(dome.position); });
      sunMesh.lookAt(0, 0, 0); // face center of dome (camera inside)
      sunMesh.lookAt(sunMesh.position.clone().multiplyScalar(2)); sunHalo.quaternion.copy(sunMesh.quaternion);
      moonMesh.lookAt(moonMesh.position.clone().multiplyScalar(2));
      sunMesh.visible = sunHalo.visible = true;
      // lights
      if (lights) {
        const sunI = 0.27 * ss(-0.12, 0.3, e), moonI = 0.12 * ss(-0.05, -0.35, e); // toon: effective = amb + PI*I*band (see render.js)
        const useSun = sunI >= moonI;
        const dir = useSun ? sunDir : moonDir;
        sky.light = Math.max(sunI, moonI);
        lights.sun.intensity = Math.max(sunI, moonI);
        blend(e, 'sun', lights.sun.color); blend(e, 'amb', lights.ambient.color); blend(e, 'rim', lights.rim.color);
        lights.ambient.intensity = 0.43 + 0.07 * ss(-0.2, 0.3, e); // C-05: day = 0.5 + PI*0.27 -> three distinct cel tones
        lights.rim.intensity = 0.06 + 0.05 * ss(-0.1, 0.3, e);
        const dist = 60;
        if (lights.follow) lights.follow(focusPos, dir, dist);
        else { lights.sun.target.position.copy(focusPos); lights.sun.position.copy(focusPos).addScaledVector(dir, dist); lights.sun.target.updateMatrixWorld(); }
        lights.rim.position.copy(focusPos).addScaledVector(dir, -50).addScaledVector(focusUp, 20);
      }
      // clouds drift & pick up sun colour
      const t = performance.now() / 1000;
      for (const c of clouds) {
        const d = c.dir.clone().applyAxisAngle(c.ax, t * c.sp);
        c.g.position.copy(d).multiplyScalar(c.h);
        const up = d, f = new V3(0, 1, 0).cross(up).normalize(); if (f.lengthSq() < 0.01) f.set(1, 0, 0);
        const m = new THREE.Matrix4().makeBasis(f, up, new V3().crossVectors(f, up).normalize()); c.g.quaternion.setFromRotationMatrix(m);
        c.g.visible = space < 0.7;
      }
    }
    computeSun();
    sky.update(0, focusPos);
    sky.dispose = function () { // C-06: free geometries/materials BEFORE removing them (the stage's disposeTree(scene) can no longer reach them)
      [dome, cloudGroup].forEach(function (g) {
        g.traverse(function (o) {
          if (o.geometry && !(o.geometry.userData && o.geometry.userData.keep)) o.geometry.dispose();
          const m = o.material; if (m && !m.isMeshToonMaterial) { (Array.isArray(m) ? m : [m]).forEach(function (mm) { if (mm.dispose && mm !== (SP.render && SP.render.outlineMaterial && SP.render.outlineMaterial())) mm.dispose(); }); }
        });
        scene.remove(g);
      });
    };
    return sky;
  }
  SP.sky = { create };
})();
