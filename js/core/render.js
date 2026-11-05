/* SP.render — renderer, toon materials, ink outlines, lights, particles. */
(function () {
  'use strict';
  const SP = window.SP = window.SP || {};

  const INK = 0x080c14;
  const PALETTE = [0x22c55e, 0x06b6d4, 0xa855f7, 0xf97316, 0xf43f5e, 0xeab308, 0x38bdf8, 0x84cc16, 0xec4899, 0x14b8a6, 0x92400e, 0x475569];
  const COLORS = { bone: 0xfffbeb, darkAccent: 0x1e293b, mouth: 0x881337, claw: 0xd97706, beak: 0xf59e0b, bg: 0x0d121d };

  function makeGradient() {
    const data = new Uint8Array([55, 60, 75, 255, 165, 172, 190, 255, 255, 255, 255, 255]);
    const tex = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
    tex.minFilter = THREE.NearestFilter; tex.magFilter = THREE.NearestFilter;
    tex.generateMipmaps = false; tex.needsUpdate = true;
    return tex;
  }
  const gradientMap = makeGradient();

  const toonCache = {};
  function toon(hex, opts) {
    opts = opts || {};
    const key = hex + '|' + (opts.vertexColors ? 'v' : '') + (opts.emissive !== undefined ? 'e' + opts.emissive + ':' + (opts.emissiveIntensity === undefined ? 1 : opts.emissiveIntensity) : '') +
      (opts.transparent ? 't' + (opts.opacity === undefined ? 1 : opts.opacity) : '') + (opts.side || 0) + (opts.flatShading ? 'f' : '') + (opts.depthWrite === false ? 'nd' : '');
    let m = toonCache[key];
    if (!m) {
      const p = { color: hex, gradientMap: gradientMap };
      if (opts.vertexColors) p.vertexColors = true;
      if (opts.emissive !== undefined) { p.emissive = opts.emissive; p.emissiveIntensity = opts.emissiveIntensity === undefined ? 1 : opts.emissiveIntensity; }
      if (opts.transparent) { p.transparent = true; p.opacity = opts.opacity === undefined ? 1 : opts.opacity; }
      if (opts.side !== undefined) p.side = opts.side;
      if (opts.depthWrite === false) p.depthWrite = false;
      m = toonCache[key] = new THREE.MeshToonMaterial(p);
    }
    return m;
  }

  // Toon material with a hard-edged fresnel rim band + a toon specular glint (cell stage membranes, bubbles, crystals).
  // One pass, no extra draw call. Rim / glint directions are in view space (the cell camera never rolls, so highlights stay put).
  // opts: { vertexColors, opacity (1), rim:hex, rimStrength (0.9), rimAt (0.55), spec (0..1 glint strength, 0=off), emissive, emissiveIntensity, depthWrite }
  const rimCache = {};
  function toonRim(hex, opts) {
    opts = opts || {};
    const o = { vc: !!opts.vertexColors, op: opts.opacity === undefined ? 1 : opts.opacity, rim: opts.rim === undefined ? 0xbff5ff : opts.rim,
      rs: opts.rimStrength === undefined ? 0.9 : opts.rimStrength, ra: opts.rimAt === undefined ? 0.55 : opts.rimAt, sp: opts.spec === undefined ? 0 : opts.spec };
    const key = [hex, o.vc, o.op, o.rim, o.rs, o.ra, o.sp, opts.emissive, opts.emissiveIntensity, opts.depthWrite].join('|');
    let m = rimCache[key];
    if (m) return m;
    const p = { color: hex, gradientMap: gradientMap };
    if (o.vc) p.vertexColors = true;
    if (o.op < 1) { p.transparent = true; p.opacity = o.op; p.depthWrite = opts.depthWrite === true; }
    if (opts.emissive !== undefined) { p.emissive = opts.emissive; p.emissiveIntensity = opts.emissiveIntensity === undefined ? 1 : opts.emissiveIntensity; }
    m = new THREE.MeshToonMaterial(p);
    patchRim(m, o);
    rimCache[key] = m;
    return m;
  }
  function patchRim(m, o) {
    const rimC = new THREE.Color(o.rim);
    m.userData.rimOpts = o;
    m.onBeforeCompile = function (sh) {
      sh.uniforms.rimColor = { value: rimC };
      sh.uniforms.rimK = { value: new THREE.Vector4(o.rs, o.ra, o.sp, 0) };
      sh.fragmentShader = sh.fragmentShader.replace('void main() {', 'uniform vec3 rimColor;\nuniform vec4 rimK;\nvoid main() {')
        .replace('gl_FragColor = vec4( outgoingLight, diffuseColor.a );',
          'vec3 vd = normalize( vViewPosition );\n' +
          'float ndv = clamp( dot( normal, vd ), 0.0, 1.0 );\n' +
          'float edge = 1.0 - ndv;\n' +
          'float rimB = smoothstep( rimK.y, rimK.y + 0.07, edge ) * 0.8 + smoothstep( 0.2, 0.9, edge ) * 0.35;\n' +
          'outgoingLight += rimColor * rimB * rimK.x;\n' +
          'float sg = max( dot( normal, normalize( vec3( -0.5, 0.62, 0.6 ) ) ), 0.0 );\n' +
          'float glint = step( 0.935, sg ) * rimK.z;\n' +
          'float glint2 = step( 0.985, max( dot( normal, normalize( vec3( 0.2, 0.75, 0.62 ) ) ), 0.0 ) ) * rimK.z * 0.6;\n' +
          'outgoingLight = mix( outgoingLight, vec3( 1.0 ), clamp( glint + glint2, 0.0, 1.0 ) );\n' +
          'gl_FragColor = vec4( outgoingLight, clamp( diffuseColor.a + rimB * 0.55 + glint + glint2, 0.0, 1.0 ) );');
    };
    m.customProgramCacheKey = function () { return 'toonrim'; };
  }
  // Re-apply the rim patch to a cloned material (Material.clone() drops onBeforeCompile).
  function cloneRim(src, clone) {
    if (src && src.userData && src.userData.rimOpts) patchRim(clone, src.userData.rimOpts);
    return clone;
  }

  const outlineCache = {};
  function outlineMaterial(hex) {
    hex = hex === undefined ? INK : hex;
    return outlineCache[hex] || (outlineCache[hex] = new THREE.MeshBasicMaterial({ color: hex, side: THREE.BackSide }));
  }

  // Geometry scaled about its own bounding-box centre (for instanced outlines, whose matrices are shared).
  function inflatedGeometry(geo, t) {
    const g = geo.clone();
    g.computeBoundingBox();
    const c = new THREE.Vector3(); g.boundingBox.getCenter(c);
    g.translate(-c.x, -c.y, -c.z);
    g.scale(1 + t, 1 + t, 1 + t);
    g.translate(c.x, c.y, c.z);
    return g;
  }

  function cel(geometry, hex, opts) {
    opts = opts || {};
    const t = opts.outline === undefined ? 0.07 : opts.outline;
    const mesh = new THREE.Mesh(geometry, opts.material || toon(hex, opts));
    mesh.castShadow = opts.cast !== false;
    mesh.receiveShadow = opts.receive !== false;
    if (t > 0) {
      const o = new THREE.Mesh(geometry, outlineMaterial(opts.outlineColor));
      o.name = 'outline';
      o.scale.setScalar(1 + t);
      mesh.add(o);
    }
    return mesh;
  }

  function celInstanced(geometry, hex, count, opts) {
    opts = opts || {};
    const t = opts.outline === undefined ? 0.07 : opts.outline;
    const mesh = new THREE.InstancedMesh(geometry, opts.material || toon(hex, opts), count);
    mesh.castShadow = opts.cast !== false;
    mesh.receiveShadow = opts.receive !== false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = opts.frustumCulled === true;
    const group = new THREE.Group();
    let outline = null;
    if (t > 0) {
      outline = new THREE.InstancedMesh(inflatedGeometry(geometry, t), outlineMaterial(opts.outlineColor), count);
      outline.instanceMatrix = mesh.instanceMatrix; // shared attribute: one upload, same matrices
      outline.frustumCulled = mesh.frustumCulled;
      outline.name = 'outline';
      group.add(outline);
    }
    group.add(mesh);
    const api = {
      mesh: mesh, outline: outline, group: group,
      setMatrixAt(i, m) { mesh.setMatrixAt(i, m); },
      setColorAt(i, c) { mesh.setColorAt(i, c); if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; },
      setCount(n) { mesh.count = n; if (outline) outline.count = n; },
      update() { mesh.instanceMatrix.needsUpdate = true; if (outline) outline.count = mesh.count; }
    };
    return api;
  }

  // ---- lights ----
  const PRESETS = {
    // C-05. NOTE: r128 MeshToonMaterial multiplies direct light by PI twice (WebGLLights scale + RE_Direct_Toon), so the
    // effective cel factor is  ambient + PI * intensity * band  (band = 0.22 / 0.65 / 1.0). Directional/point intensities
    // below are therefore ~1/3 of the "natural" value. Day: shadow 0.68, mid 1.04, highlight 1.35 (three readable tones).
    day:    { amb: [0xfff7ed, 0.5], sun: [0xffedd5, 0.27], rim: [0x38bdf8, 0.11] },
    night:  { amb: [0x6070c0, 0.45], sun: [0x8fa4ff, 0.1],  rim: [0x7c3aed, 0.16] },
    cell:   { amb: [0x7fe8e0, 0.55], sun: [0xd8fff6, 0.22], rim: [0x22d3ee, 0.12] },
    editor: { amb: [0xfff7ed, 0.5], sun: [0xffedd5, 0.28], rim: [0x38bdf8, 0.11] },
    space:  { amb: [0x202a40, 0.18], sun: [0xfff3d6, 0.55], rim: [0x38bdf8, 0.11] }
  };
  function makeLights(scene, preset) {
    const ambient = new THREE.AmbientLight(0xfff7ed, 0.5);
    const sun = new THREE.DirectionalLight(0xffedd5, 0.27);
    sun.position.set(24, 38, 20);
    sun.castShadow = true;
    const ed = preset === 'editor';
    sun.shadow.mapSize.set(ed ? 2048 : 1024, ed ? 2048 : 1024);
    const d = ed ? 22 : 40;
    Object.assign(sun.shadow.camera, { left: -d, right: d, top: d, bottom: -d, near: 1, far: 140 });
    sun.shadow.bias = -0.0005;
    const rim = new THREE.DirectionalLight(0x38bdf8, 0.11);
    rim.position.set(-24, 14, -20);
    scene.add(ambient, sun, sun.target, rim);
    const api = {
      ambient: ambient, sun: sun, rim: rim,
      setPreset(name) {
        const p = PRESETS[name] || PRESETS.day;
        ambient.color.setHex(p.amb[0]); ambient.intensity = p.amb[1];
        sun.color.setHex(p.sun[0]); sun.intensity = p.sun[1];
        rim.color.setHex(p.rim[0]); rim.intensity = p.rim[1];
        api.preset = name;
      },
      // keep shadows tight around a moving focus; dir = direction towards the sun
      follow(pos, dir, dist) {
        dist = dist || 40;
        const dv = dir || sun.position.clone().sub(sun.target.position).normalize();
        sun.target.position.copy(pos);
        sun.position.copy(pos).addScaledVector(dv, dist);
        sun.target.updateMatrixWorld();
      }
    };
    api.setPreset(preset || 'day');
    return api;
  }

  // ---- renderer ----
  const resizeCbs = [];
  let container = null;
  const R = {
    renderer: null,
    INK: INK, PALETTE: PALETTE, COLORS: COLORS, gradientMap: gradientMap,
    width: window.innerWidth, height: window.innerHeight,
    toon: toon, toonRim: toonRim, cloneRim: cloneRim, outlineMaterial: outlineMaterial, cel: cel, celInstanced: celInstanced, makeLights: makeLights,
    init(el) {
      container = el || document.getElementById('canvas-container') || document.body;
      const r = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
      r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      r.shadowMap.enabled = true;
      r.shadowMap.type = THREE.PCFSoftShadowMap;
      r.setClearColor(COLORS.bg, 1);
      container.appendChild(r.domElement);
      R.renderer = r;
      R.resize();
      window.addEventListener('resize', R.resize);
      return r;
    },
    resize() {
      const w = Math.max(1, container ? container.clientWidth || window.innerWidth : window.innerWidth);
      const h = Math.max(1, container ? container.clientHeight || window.innerHeight : window.innerHeight);
      R.width = w; R.height = h;
      if (R.renderer) R.renderer.setSize(w, h);
      for (let i = 0; i < resizeCbs.length; i++) { try { resizeCbs[i](w, h); } catch (e) { console.error(e); } }
    },
    onResize(fn) {
      resizeCbs.push(fn);
      try { fn(R.width, R.height); } catch (e) { console.error(e); }
      return function () { const i = resizeCbs.indexOf(fn); if (i >= 0) resizeCbs.splice(i, 1); };
    },
    render(scene, camera) { if (R.renderer && scene && camera) R.renderer.render(scene, camera); },
    disposeTree(obj) {
      obj.traverse(function (o) { if (o.geometry && !o.geometry.userData.keep) o.geometry.dispose(); });
    },
    // Cube-particle pool (prototype style). One draw call per system.
    particles(scene, max) {
      max = max || 600;
      const geo = new THREE.BoxGeometry(1, 1, 1);
      const mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff }), max);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      const col = new THREE.Color(0xffffff);
      for (let i = 0; i < max; i++) mesh.setColorAt(i, col);
      mesh.count = 0;
      scene.add(mesh);
      const ps = [];
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), tmpE = new THREE.Euler();
      return {
        mesh: mesh,
        // opts: { size=.18, life=.75, gravity=9, up:Vector3, spread=1, dir:Vector3 (bias), gravityless }
        burst(pos, hex, count, speed, opts) {
          opts = opts || {}; count = count === undefined ? 12 : count; speed = speed === undefined ? 1 : speed;
          const up = opts.up || new THREE.Vector3(0, 1, 0);
          const a1 = new THREE.Vector3(), a2 = new THREE.Vector3();
          a1.set(1, 0, 0); if (Math.abs(up.dot(a1)) > 0.9) a1.set(0, 0, 1);
          a1.cross(up).normalize(); a2.crossVectors(up, a1);
          for (let i = 0; i < count && ps.length < max; i++) {
            const a = Math.random() * Math.PI * 2, spd = (1.5 + Math.random() * 3.5) * speed;
            const v = new THREE.Vector3().addScaledVector(a1, Math.cos(a) * spd).addScaledVector(a2, Math.sin(a) * spd)
              .addScaledVector(up, (opts.flat ? 0 : 2.5 + Math.random() * 3.5) * Math.max(0.3, speed));
            if (opts.dir) v.addScaledVector(opts.dir, spd);
            const life = (opts.life || 0.75) * (0.8 + Math.random() * 0.4);
            ps.push({ p: pos.clone(), v: v, life: life, max: life, size: (opts.size || 0.18) * (0.7 + Math.random() * 0.6),
              c: new THREE.Color(hex), g: opts.gravity === undefined ? 9 : opts.gravity, up: up, rx: Math.random() * 6, ry: Math.random() * 6 });
          }
        },
        update(dt) {
          let n = 0;
          for (let i = ps.length - 1; i >= 0; i--) {
            const p = ps[i];
            p.life -= dt;
            if (p.life <= 0) { ps[i] = ps[ps.length - 1]; ps.pop(); continue; }
            p.v.addScaledVector(p.up, -p.g * dt);
            p.p.addScaledVector(p.v, dt);
          }
          for (let i = 0; i < ps.length; i++) {
            const p = ps[i], k = Math.min(1, p.life / p.max * 1.6);
            tmpE.set(p.rx + p.life * 6, p.ry + p.life * 4, 0); q.setFromEuler(tmpE);
            s.setScalar(p.size * k);
            m4.compose(p.p, q, s);
            mesh.setMatrixAt(n, m4); mesh.setColorAt(n, p.c); n++;
          }
          mesh.count = n;
          mesh.instanceMatrix.needsUpdate = true;
          if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        },
        clear() { ps.length = 0; mesh.count = 0; },
        dispose() { scene.remove(mesh); geo.dispose(); mesh.material.dispose(); }
      };
    }
  };
  SP.render = R;
})();
