/* SP.stages.cell — Stage 1: tide pool seen from a tilted overhead 2.5D camera (DESIGN §5).
 * Swim, eat, fight, grow through 5 levels on a 0-100 evolution bar, collect parts, call a mate for the cell editor,
 * then hand a creature-stage design (colours/name/diet carried over) to SP.game.completeStage.
 * Everything lives in this one IIFE; public surface is SP.stages.cell (stage contract, ARCHITECTURE §4.8). */
(function () {
  'use strict';
  const SP = window.SP = window.SP || {};
  SP.stages = SP.stages || {};
  const U = SP.util, V3 = THREE.Vector3;
  const TAU = Math.PI * 2;
  const clamp = U.clamp, lerp = U.lerp;

  const GROW = 1.35;            // size multiplier per level
  const PER_LEVEL = 20;         // progress points per level (0-20-40-60-80-100)
  const POOL_R = 140;           // radius of the tide pool
  const MAX_NPC = 44;
  const BASE_R = 0.8;           // radius of the starter cell (used for camera / food sizing)
  const TMP = new V3();
  // A-01: food is worth less the bigger you are (REFERENCE §3: ~1.75 -> 0.75 DNA per item); progress per item shrinks too
  const DNA_PER_ITEM = [1.75, 1.5, 1.25, 1.0, 0.75];
  const PROG_PER_ITEM = [1.0, 0.8, 0.62, 0.5, 0.4];

  const rnd = Math.random;
  const wrapA = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
  const sfx = (n, o) => { try { if (SP.audio) SP.audio.sfx(n, o); } catch (e) { /* audio is optional */ } };
  const toast = (t, i, ms) => { try { SP.ui.toast(t, i, ms); } catch (e) { /* ui optional */ } };
  const fastMul = () => (SP.game && SP.game.speedMul) || 1;

  // ================================================================== textures
  function canvasTex(w, h, draw) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); t.needsUpdate = true; return t;
  }
  function dotTex() {
    return canvasTex(64, 64, (g, w) => {
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, w);
    });
  }
  function bubbleTex() {
    return canvasTex(64, 64, (g) => {
      g.fillStyle = 'rgba(190,245,255,.16)'; g.beginPath(); g.arc(32, 32, 26, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(210,250,255,.9)'; g.lineWidth = 4; g.beginPath(); g.arc(32, 32, 26, 0, TAU); g.stroke();
      g.strokeStyle = 'rgba(255,255,255,.95)'; g.lineWidth = 4; g.lineCap = 'round'; g.beginPath(); g.arc(32, 32, 17, Math.PI * 1.1, Math.PI * 1.45); g.stroke();
    });
  }
  function causticTex() {
    const N = 192, cv = document.createElement('canvas'); cv.width = cv.height = N;
    const g = cv.getContext('2d'), img = g.createImageData(N, N), d = img.data;
    const W = [[3, 2], [-2, 4], [5, -1], [1, 5], [4, 3], [-3, -4], [2, -5]], ph = [0.3, 1.9, 4.1, 2.7, 5.2, 0.9, 3.4];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const u = x / N, v = y / N;
      const wu = u + 0.045 * Math.sin(TAU * (2 * v + 0.3)), wv = v + 0.045 * Math.sin(TAU * (3 * u + 0.7));
      let s = 0;
      for (let i = 0; i < W.length; i++) s += Math.sin(TAU * (W[i][0] * wu + W[i][1] * wv) + ph[i]);
      s /= W.length;
      const val = Math.pow(clamp(1 - Math.abs(s * 2.0), 0, 1), 5);
      const o = (y * N + x) * 4;
      d[o] = 190; d[o + 1] = 255; d[o + 2] = 250; d[o + 3] = Math.round(val * 255);
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true; return t;
  }
  function floorTex() {
    return canvasTex(512, 512, (g, w, h) => {
      const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      gr.addColorStop(0, '#0e4a5b'); gr.addColorStop(0.7, '#0b3b4a'); gr.addColorStop(1, '#062430');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      const r = U.rng(99);
      for (let i = 0; i < 70; i++) {
        const x = r.range(0, w), y = r.range(0, h), rad = r.range(20, 70);
        const gg = g.createRadialGradient(x, y, 0, x, y, rad);
        const light = r.chance(0.5);
        gg.addColorStop(0, light ? 'rgba(40,150,160,.20)' : 'rgba(0,15,25,.28)'); gg.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gg; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
    });
  }
  function emojiTex(ch) {
    return canvasTex(96, 96, (g) => { g.font = '64px serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ch, 48, 52); });
  }

  // ================================================================== HUD style (scoped, removed on exit)
  const CSS = `
.cell-vig{position:fixed;inset:0;pointer-events:none!important;background:radial-gradient(ellipse at center,rgba(0,0,0,0) 52%,rgba(1,16,24,.62) 100%)}
.cell-vig.hurt{animation:cellHurt .55s ease-out}
@keyframes cellHurt{0%{box-shadow:inset 0 0 130px 40px rgba(244,63,94,.5)}100%{box-shadow:inset 0 0 130px 40px rgba(244,63,94,0)}}
.cell-evo{display:flex;flex-direction:column;align-items:center;gap:2px;padding:8px 14px 10px}
.cell-evo .bar{min-width:340px}
.cell-evo .bar-track{height:22px}
.cell-evo .evo-div{position:absolute;top:0;bottom:0;width:3px;margin-left:-1.5px;background:var(--ink);opacity:.9;z-index:2}
.cell-evo .bar-text{z-index:3}
.cell-diet{padding:7px 12px 9px;min-width:220px}
.cell-diet .dh{display:flex;justify-content:space-between;font-size:12px;font-weight:700;color:#cbd5e1;letter-spacing:.05em;text-transform:uppercase;margin-bottom:4px}
.cell-diet .tl{display:flex;gap:2px;height:14px}
.cell-diet .tl i{flex:1;border-radius:3px;background:#1e293b;border:1.5px solid var(--ink)}
.cell-diet .dr{display:flex;justify-content:space-between;font-size:13px;margin-top:4px;font-weight:700}
.cell-hint{font-size:13px;color:#a5f3fc;text-shadow:0 2px 0 var(--ink);font-weight:700;text-align:center;pointer-events:none}
.cell-arrow{position:fixed;left:0;top:0;pointer-events:none!important;font-size:26px;display:none;z-index:11;filter:drop-shadow(0 2px 0 #080c14);transform:translate(-50%,-50%)}
.cell-arrow b{display:block;font-size:20px;transform-origin:center}
.cell-pulse{animation:cellPulse .8s ease-in-out infinite alternate}
@keyframes cellPulse{to{transform:scale(1.12);filter:brightness(1.4)}}
@media (max-width:700px){.cell-evo .bar{min-width:0!important;width:min(360px,calc(100vw - 72px))!important}.hud-tc{max-width:calc(100vw - 2*var(--gutter))}.hud-tl .panel,.hud-tl .counter{max-width:226px;box-sizing:border-box}.cell-hint{display:none}.cell-diet{min-width:100px;max-width:112px}.cell-diet .tl{display:none}.hud-tc{top:128px!important;left:var(--gutter)!important;transform:none!important}.cell-evo{padding:5px 10px 7px}}
`;

  // ================================================================== NPC designs
  const PAL = {
    prey: [0xbff5ff, 0xa5f3fc, 0xd9f99d, 0xfde68a],
    grazer: [0x84cc16, 0x38bdf8, 0x14b8a6, 0xeab308, 0x22c55e, 0xa3e635],
    hunter: [0xf43f5e, 0xf97316, 0xec4899, 0xdc2626],
    turtle: [0x92400e, 0x64748b, 0x0d9488, 0xa16207],
    electric: [0xeab308, 0xfacc15, 0x38bdf8],
    poisoner: [0x84cc16, 0xa855f7, 0xbef264],
    epic: [0x7c3aed, 0x6d28d9, 0x9d174d]
  };
  const TIER = (r) => r < 0.45 ? 'tiny' : r < 0.8 ? 'small' : r < 1.3 ? 'medium' : r < 2.4 ? 'large' : 'epic';
  function addPart(d, id, v, dir, o) {
    o = o || {};
    const sp = SP.creature.surfacePoint(d, Math.min(v, d.spine.length - 1), dir);
    d.parts.push({ uid: SP.creature.uid(), id: id, v: Math.min(v, d.spine.length - 1), o: sp.o, n: sp.n, s: o.s || 1, rot: 0, mirror: !!o.mirror });
  }
  function designFor(S, type, rho) {
    const rng = S.rng;
    const diet = { prey: 'herbivore', grazer: 'herbivore', turtle: 'herbivore', hunter: 'carnivore', electric: rng.chance(0.5) ? 'carnivore' : 'omnivore', poisoner: 'omnivore', epic: 'carnivore' }[type] || 'herbivore';
    const d = SP.creature.generate(rng, { kind: 'cell', diet: diet, sizeTier: TIER(rho) });
    d.parts = d.parts.filter((p) => { const pd = SP.parts.get(p.id); return !pd || pd.category !== 'weapons'; });
    const mid = Math.floor(d.spine.length / 2);
    switch (type) {
      case 'turtle':
        addPart(d, 'cell_spike', mid, [1, 0, 0.5], { mirror: true, s: 1.3 });
        addPart(d, 'cell_spike', mid, [1, 0, -0.5], { mirror: true, s: 1.3 });
        addPart(d, 'cell_armor', 0, [0.9, 0, -0.2], { mirror: true });
        break;
      case 'hunter': if (rng.chance(0.55)) addPart(d, rng.pick(['cell_spike', 'cell_horn']), mid, [0.9, 0, 0.45], { mirror: true }); break;
      case 'electric': addPart(d, 'cell_electric', mid, [1, 0, 0], { mirror: true }); break;
      case 'poisoner': addPart(d, 'cell_poison', mid, [1, 0, -0.1], { mirror: true }); break;
      case 'epic':
        addPart(d, 'cell_horn', mid, [0.8, 0, 0.6], { mirror: true, s: 1.4 });
        addPart(d, 'cell_spike', mid, [1, 0, -0.4], { mirror: true, s: 1.3 });
        break;
      default: break;
    }
    const pal = PAL[type] || PAL.grazer;
    d.colors.base = rng.pick(pal);
    if (type === 'hunter' || type === 'epic') d.colors.accent = rng.pick([0xfffbeb, 0xfde047]);
    return d;
  }

  // ================================================================== the stage
  const S = SP.stages.cell = {
    id: 'cell', title: 'Cell Stage', next: 'creature',
    scene: null, camera: null,

    // ---------------------------------------------------------------- enter
    enter: function (campaign, opts) {
      opts = opts || {};
      const R = SP.render;
      S.campaign = campaign;
      campaign.unlocked = campaign.unlocked || [];
      campaign.dna = campaign.dna || 0;
      if (!campaign.cellDesign) campaign.cellDesign = SP.creature.defaultDesign('cell');
      if (!campaign.cellDesign.name || campaign.cellDesign.name === 'Cell') campaign.cellDesign.name = campaign.speciesName || campaign.cellDesign.name;
      S.rng = U.rng((campaign.seed | 0) + 1234);

      const scene = S.scene = new THREE.Scene();
      S.cam = new SP.cam.Tilt({ fov: 38, pitch: 1.0, stiffness: 5 });   // pitched ~57 deg overhead, perspective
      S.camera = S.cam.camera;
      // warm key from the upper left front, teal rim from behind-right, teal ambient (toon bands: amb + PI * I * band, see ARCHITECTURE C-05)
      S.lights = R.makeLights(scene, 'cell');
      S.lights.sun.castShadow = false;
      S.lights.sun.position.set(-22, 17, 21);
      S.lights.ambient.color.setHex(0xcdeff0); S.lights.ambient.intensity = 0.5;
      S.lights.sun.color.setHex(0xffe6c4); S.lights.sun.intensity = 0.24;
      S.lights.rim.color.setHex(0x22d3ee); S.lights.rim.intensity = 0.2; S.lights.rim.position.set(24, 9, -26);

      // progress state
      const saved = opts.resume && campaign.cell && campaign.cell.v === 1 ? campaign.cell : null;
      S.progress = saved ? saved.progress : 0;
      S.level = Math.min(4, Math.floor(S.progress / PER_LEVEL));
      S.plantEaten = saved ? saved.plant : 0;
      S.meatEaten = saved ? saved.meat : 0;
      S.timeline = saved ? (saved.timeline || []).slice() : [];
      S.kills = saved ? saved.kills : 0;
      S.deaths = saved ? saved.deaths : 0;
      S.partsFound = saved ? saved.partsFound || 0 : 0;
      S.dnaEarned = saved ? saved.dnaEarned || 0 : 0;
      S.mateMark = saved ? saved.mateMark || 0 : 0;       // highest 25% mark already granted
      S.mateReadyMark = false;
      const dev = SP.game && SP.game.params ? Number(SP.game.params.get('cellprogress')) : NaN;
      if (!saved && dev > 0) { S.progress = clamp(dev, 0, 99); S.level = Math.min(4, Math.floor(S.progress / PER_LEVEL)); }

      S.needRelease = true;       // A-18: a mouse press that skipped the intro must be released before it steers
      S.time = 0; S.ending = false; S.endT = 0; S.completed = false; S.editing = false;
      S.shake = 0; S.zoomMul = 1; S.popT = 0; S.sinceHurt = 99; S.nextId = 1;
      S.cells = []; S.pickups = []; S.clouds = []; S.telegraphs = [];
      S.mate = null; S.mateCd = 0; S.mateTrig = 0; S.shardT = 18; S.spawnT = 0; S.specialAlt = false;
      S.respawnT = 0; S.hudT = 0; S.wrongT = 0; S.sfxT = 0; S.frame = 0;
      S.viewH = 14; S.viewW = 25; S.cur = new V3(0.5, 0, 0.2);

      buildWorld();
      buildFood();
      buildFx();
      S.fs = Math.pow(GROW, S.level * 0.8);

      // player
      const start = saved ? { x: saved.px || 0, z: saved.pz || 0 } : { x: 0, z: 0 };
      const P = S.player = spawnCell({ isPlayer: true, type: 'player', x: start.x, z: start.z, h: Math.PI * 0.5, design: campaign.cellDesign, k: Math.pow(GROW, S.level) });
      P.invuln = 2.2;
      S.cam.target.set(P.x, 0, P.z); S.cam._t.copy(S.cam.target); S.cam._init = true;
      updateView(1); S.cam._d = S.cam.distance; updateView(1);

      // initial population
      for (let i = 0; i < 4; i++) { const an = i * 1.7 + 0.6; food.patch('plant', P.x + Math.cos(an) * 5.5 * S.fs, P.z + Math.sin(an) * 4.5 * S.fs, true); }
      food.fill(true);
      for (let i = 0; i < 11; i++) spawnNpc(true);

      buildHud();
      SP.ui.help([
        '<b>WASD / arrows</b> or <b>hold the mouse</b> to swim toward the cursor',
        '<kbd class="kbd">Space</kbd> jet burst — also a bite if you have a jaw or proboscis',
        '<kbd class="kbd">E</kbd> special: electric zap or poison cloud (needs the part)',
        '<kbd class="kbd">C</kbd> call a mate, swim into it to open the cell editor (needs 15 DNA or a 25% mark)',
        '🌿 Filter mouths eat plants, 🦷 jaws eat meat, 💉 proboscis eats both. Tiny cells are plankton for everyone.',
        'Yellow meteor shards ✨ and golden shields 🛡 unlock new cell parts. Bigger cells hurt: watch the red glow.',
        '<b>Wheel</b> or <kbd class="kbd">+</kbd>/<kbd class="kbd">-</kbd> zoom. Fill the evolution bar to grow legs!'
      ]);
      toast('Swim with WASD or hold the mouse. Eat the glowing food!', '🌿', 4200);
      if (saved) toast('Welcome back, Level ' + (S.level + 1), '🦠', 2500);
      if (S.progress >= 100) finish();          // A-12: reloaded on the 'stage complete' card
    },

    // ---------------------------------------------------------------- update
    update: function (dt, t) {
      if (!S.scene) return;
      dt = Math.min(dt, 0.05);
      S.time += dt; S.frame++;
      const P = S.player;
      S.sinceHurt += dt;
      S.popT = Math.max(0, S.popT - dt); S.wrongT = Math.max(0, S.wrongT - dt); S.sfxT = Math.max(0, S.sfxT - dt);
      // slow rotating water current
      const ca = S.time * 0.07;
      S.cur.set(Math.cos(ca) * 0.55, 0, Math.sin(ca * 1.3) * 0.45);

      updateView(dt);
      controlPlayer(dt);
      if (!S.editing) {
        for (let i = 0; i < S.cells.length; i++) {
          const c = S.cells[i];
          if (c.dead) { c.deadT += dt; c.actT += dt; continue; }
          if (c.rise > 0) { c.rise = Math.max(0, c.rise - dt / 3.4); }
          if (!c.isPlayer && c.type !== 'mate') aiUpdate(c, dt);
          if (c.type === 'mate') mateUpdate(c, dt);
          physics(c, dt);
        }
        collisions(dt);
        cloudsUpdate(dt);
        telegraphUpdate(dt);
        pickupsUpdate(dt);
        playerEat(dt);
        food.update(dt);
        popControl(dt);
      }
      for (let i = 0; i < S.cells.length; i++) animateCell(S.cells[i], dt);
      reap();
      fxUpdate(dt);
      worldUpdate(dt);
      cameraUpdate(dt);
      hudUpdate(dt);
      if (S.ending) {
        S.endT += dt;
        if (S.endT > 3.4 && !S.completed) { S.completed = true; complete(); }
      }
    },

    pause: function () { /* the editor owns input now; nothing to freeze */ },
    resume: function () {
      S.cam._t.copy(S.cam.target);
    },

    // ---------------------------------------------------------------- exit
    exit: function () {
      if (!S.scene) return;
      if (S.cam && S.cam.dispose) S.cam.dispose(); // C-07
      try { S.campaign.cell = S.serialize(); } catch (e) { /* ignore */ }
      for (let i = 0; i < S.cells.length; i++) disposeRig(S.cells[i]);
      S.cells.length = 0;
      if (S.fx) ['haloGeo', 'shadowGeo'].forEach((k) => { if (S.fx[k]) S.fx[k].dispose(); }); // C-06: shared FX geometry may not be in the scene at exit
      S.scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material && o.material.userData && o.material.userData.own) o.material.dispose();
      });
      if (S.fx && S.fx.parts) S.fx.parts.dispose();
      S.texs.forEach((t) => t.dispose());
      if (S.styleEl) S.styleEl.remove();
      S.arrows.forEach((a) => a.el.remove());
      if (S.vig) S.vig.remove();
      S.scene = null; S.player = null; S.mate = null;
    },

    serialize: function () {
      const P = S.player;
      return {
        v: 1, progress: S.progress, level: S.level, plant: S.plantEaten, meat: S.meatEaten, timeline: S.timeline.slice(-300),
        kills: S.kills, deaths: S.deaths, partsFound: S.partsFound, dnaEarned: S.dnaEarned, mateMark: S.mateMark,
        px: P ? Math.round(P.x) : 0, pz: P ? Math.round(P.z) : 0
      };
    }
  };

  // ================================================================== world: floor relief, rim, backdrop, caustics, shadows, bubbles
  const FOG_COL = 0x06222c;
  function softTex(inner, outer) {
    return canvasTex(64, 64, (g, w) => {
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, inner); gr.addColorStop(0.55, outer); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, w);
    });
  }
  function blobTex() { // a giant out-of-focus cell seen far below: soft body, membrane ring, nucleus
    return canvasTex(128, 128, (g, w) => {
      const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62);
      gr.addColorStop(0, 'rgba(255,255,255,.55)'); gr.addColorStop(0.62, 'rgba(255,255,255,.4)'); gr.addColorStop(0.8, 'rgba(255,255,255,.75)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, w);
      const ng = g.createRadialGradient(54, 58, 2, 54, 58, 24);
      ng.addColorStop(0, 'rgba(0,0,0,.55)'); ng.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = ng; g.fillRect(0, 0, w, w);
    });
  }
  // toon material for instanced foliage that sways in the current (vertex shader, driven by S.time)
  function swayMat(hex, em) {
    const m = new THREE.MeshToonMaterial({ color: hex, gradientMap: SP.render.gradientMap, emissive: em, emissiveIntensity: 0.35 });
    m.userData.own = true;
    m.onBeforeCompile = function (sh) {
      sh.uniforms.uT = { value: 0 }; m.userData.sh = sh;
      sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\n#ifdef USE_INSTANCING\n float h = max(0.0, position.y + 0.5);\n float ph = instanceMatrix[3][0] * 0.37 + instanceMatrix[3][2] * 0.23;\n transformed.x += sin(uT * 1.2 + ph + h * 2.0) * 0.28 * h * h;\n transformed.z += cos(uT * 0.9 + ph * 1.3 + h * 1.6) * 0.18 * h * h;\n#endif')
        .replace('void main() {', 'uniform float uT;\nvoid main() {');
    };
    m.customProgramCacheKey = function () { return 'sway'; };
    return m;
  }

  function buildWorld() {
    const R = SP.render, scene = S.scene;
    S.texs = [];
    const keep = (t) => { S.texs.push(t); return t; };
    const own = (m) => { m.userData.own = true; return m; };
    scene.background = new THREE.Color(FOG_COL);
    scene.fog = new THREE.Fog(FOG_COL, 20, 80);
    const rr = U.rng(7), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new V3(), pp = new V3(), col = new THREE.Color();
    const G = S.floorG = new THREE.Group(); scene.add(G);   // everything on the sea floor; lowered with the camera distance each frame

    // floor
    const floorGeo = new THREE.CircleGeometry(POOL_R + 8, 96); floorGeo.rotateX(-Math.PI / 2);
    const floor = new THREE.Mesh(floorGeo, own(new THREE.MeshBasicMaterial({ map: keep(floorTex()) })));
    G.add(floor);
    const place = (inst, i, x, y, z, rx, ry, rz, sx, sy, sz) => { e.set(rx, ry, rz); q.setFromEuler(e); m4.compose(pp.set(x, y, z), q, sc.set(sx, sy, sz)); inst.setMatrixAt(i, m4); };
    const done = (inst) => { inst.update(); if (inst.mesh.instanceColor) inst.mesh.instanceColor.needsUpdate = true; G.add(inst.group); };
    // sand ripples (long flat ridges that catch the key light)
    const NR = 360, rip = R.celInstanced(new THREE.SphereGeometry(1, 8, 5), 0x2b8e96, NR, { outline: 0, cast: false, receive: false, frustumCulled: false });
    for (let i = 0; i < NR; i++) {
      const a = rr.range(0, TAU), d = Math.sqrt(rr.next()) * (POOL_R - 4), yaw = rr.range(0, 3.14) + Math.sin(a * 3) * 0.4;
      const L = rr.range(2.2, 6.5);
      place(rip, i, Math.cos(a) * d, 0.05, Math.sin(a) * d, 0, yaw, 0, L, rr.range(0.16, 0.34), rr.range(0.45, 1.0));
      col.setHex(rr.pick([0x2b8e96, 0x34a3a8, 0x247d86, 0x3bb0b3])); rip.mesh.setColorAt(i, col);
    }
    done(rip);
    // pebbles
    const peb = R.celInstanced(new THREE.DodecahedronGeometry(1, 0), 0x1a6a76, 900, { outline: 0.0, cast: false, receive: false, frustumCulled: false });
    for (let i = 0; i < 900; i++) {
      const a = rr.range(0, TAU), d = Math.sqrt(rr.next()) * (POOL_R - 2), s = rr.range(0.25, 1.1);
      place(peb, i, Math.cos(a) * d, 0.2, Math.sin(a) * d, rr.range(0, 6), rr.range(0, 6), rr.range(0, 6), s * 1.3, s * 0.7, s);
      col.setHex(rr.pick([0x1d7480, 0x258890, 0x2a979e, 0x196a74])); peb.mesh.setColorAt(i, col);
    }
    done(peb);
    // boulders with ink outlines
    const NB = 110, bld = R.celInstanced(new THREE.IcosahedronGeometry(1, 1), 0x2f8a92, NB, { outline: 0, cast: false, receive: false, frustumCulled: false });
    for (let i = 0; i < NB; i++) {
      const a = rr.range(0, TAU), d = Math.sqrt(rr.next()) * (POOL_R - 6), s = rr.range(0.7, 2.3);
      place(bld, i, Math.cos(a) * d, s * 0.25, Math.sin(a) * d, rr.range(0, 6), rr.range(0, 6), rr.range(0, 6), s * 1.2, s * 0.8, s);
      col.setHex(rr.pick([0x4aa6a8, 0x5db5b0, 0x3f95a0, 0x6cbdb4])); bld.mesh.setColorAt(i, col);
    }
    done(bld);
    // kelp: tall tapered blades that sway
    const NK = 340, kg = new THREE.CylinderGeometry(0.03, 0.2, 1, 5, 5, true); kg.translate(0, 0.5, 0);
    const kelpM = new THREE.InstancedMesh(kg, swayMat(0x1f9d63, 0x0f7a4a), NK);
    kelpM.frustumCulled = false;
    for (let i = 0; i < NK; i++) {
      const cl = Math.floor(i / 6), cr = U.rng(500 + cl), a = cr.range(0, TAU), d = Math.sqrt(cr.next()) * (POOL_R - 6);
      const x = Math.cos(a) * d + rr.range(-1.2, 1.2), z = Math.sin(a) * d + rr.range(-1.2, 1.2), h = rr.range(2.2, 4.6);
      e.set(rr.range(-0.12, 0.12), rr.range(0, 6), rr.range(-0.12, 0.12)); q.setFromEuler(e);
      m4.compose(pp.set(x, 0, z), q, sc.set(rr.range(0.7, 1.4), h, rr.range(0.7, 1.4))); kelpM.setMatrixAt(i, m4);
      col.setHex(rr.pick([0x1f9d63, 0x2bb673, 0x178a55, 0x3ac27f, 0x7bc74a])); kelpM.setColorAt(i, col);
    }
    G.add(kelpM); S.kelp = kelpM;
    // glowing sea anemones / coral tufts (emissive tips)
    const NA = 50, NJ = 8, ag = new THREE.ConeGeometry(0.2, 1, 6), tuft = R.celInstanced(ag, 0xf9a8d4, NA * NJ, { outline: 0.1, cast: false, receive: false, frustumCulled: false, emissive: 0xec4899, emissiveIntensity: 0.3 });
    for (let i = 0; i < NA; i++) {
      const a = rr.range(0, TAU), d = Math.sqrt(rr.next()) * (POOL_R - 6), cx = Math.cos(a) * d, cz = Math.sin(a) * d, cc = rr.pick([0xf9a8d4, 0xfdba74, 0xc4b5fd, 0x86efac]);
      for (let j = 0; j < NJ; j++) {
        const t = j / NJ * TAU + rr.range(-0.3, 0.3), s = rr.range(0.7, 1.2), tl = j ? 0.6 : 0.05;
        place(tuft, i * NJ + j, cx + Math.cos(t) * 0.3 * (j ? 1 : 0), 0.5 * s, cz + Math.sin(t) * 0.3 * (j ? 1 : 0), Math.sin(t) * tl, 0, -Math.cos(t) * tl, s * 0.9, s * (j ? 1.1 : 1.6), s * 0.9);
        col.setHex(cc); tuft.mesh.setColorAt(i * NJ + j, col);
      }
    }
    done(tuft);
    // rocky rim (taller than before so the tilted camera shows a wall)
    const rim = R.celInstanced(new THREE.IcosahedronGeometry(1, 0), 0x2c7f86, 170, { outline: 0.06, cast: false, receive: false, frustumCulled: false });
    for (let i = 0; i < 170; i++) {
      const a = i / 170 * TAU + rr.range(-0.02, 0.02), d = POOL_R + 3 + rr.range(0, 8), s = rr.range(4, 10);
      place(rim, i, Math.cos(a) * d, s * 0.55, Math.sin(a) * d, rr.range(0, 6), rr.range(0, 6), rr.range(0, 6), s * 1.2, s * 1.05, s);
      col.setHex(rr.pick([0x2c7f86, 0x246a73, 0x38929a, 0x1f5c66])); rim.mesh.setColorAt(i, col);
    }
    done(rim);

    // giant blurred cells drifting far below (one instanced draw)
    const bt = keep(blobTex());
    const NBL = 16, bg = new THREE.PlaneGeometry(1, 1); bg.rotateX(-Math.PI / 2);
    S.blobI = new THREE.InstancedMesh(bg, own(new THREE.MeshBasicMaterial({ map: bt, transparent: true, opacity: 0.5, depthWrite: false })), NBL);
    S.blobI.frustumCulled = false; S.blobI.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    S.blobs = [];
    for (let i = 0; i < NBL; i++) {
      const a = rr.range(0, TAU), d = Math.sqrt(rr.next()) * (POOL_R - 10);
      S.blobs.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, s: rr.range(14, 46), yaw: rr.range(0, 6), sp: rr.range(0.1, 0.35), dir: rr.range(0, 6), yo: rr.range(0.55, 0.9) });
      col.setHex(rr.pick([0x04303a, 0x03262f, 0x073a47, 0x0a2f3f])); S.blobI.setColorAt(i, col);
    }
    scene.add(S.blobI);

    // cell contact shadows (soft dark discs just under every cell)
    S.shadowTex = keep(softTex('rgba(0,10,16,.62)', 'rgba(0,10,16,.38)'));
    const sg = new THREE.PlaneGeometry(2, 2); sg.rotateX(-Math.PI / 2);
    S.shadowI = new THREE.InstancedMesh(sg, own(new THREE.MeshBasicMaterial({ map: S.shadowTex, transparent: true, depthWrite: false, fog: false })), MAX_NPC + 4);
    S.shadowI.frustumCulled = false; S.shadowI.instanceMatrix.setUsage(THREE.DynamicDrawUsage); S.shadowI.count = 0; S.shadowI.renderOrder = -2;
    scene.add(S.shadowI);

    // caustic shimmer (two additive layers sliding in opposite directions)
    const ct = keep(causticTex());
    S.caustics = [];
    [{ tile: 22, vx: 0.35, vz: 0.2, op: 0.2, f: 0.35 }, { tile: 34, vx: -0.22, vz: 0.3, op: 0.16, f: 0.6 }].forEach((o) => {
      const t = ct.clone(); t.needsUpdate = true; t.wrapS = t.wrapT = THREE.RepeatWrapping; S.texs.push(t);
      const g = new THREE.PlaneGeometry(1, 1); g.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, own(new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: o.op, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })));
      m.frustumCulled = false; m.renderOrder = -3; scene.add(m);
      S.caustics.push({ mesh: m, tex: t, o: o });
    });

    // floating layer: real translucent bubbles (instanced spheres + glint blobs) and glowing motes
    const dt = keep(dotTex());
    S.dotMap = dt;
    S.layers = [];
    const bubMat = R.toonRim(0x9fe8f5, { opacity: 0.2, rim: 0xe0fbff, rimStrength: 0.7, rimAt: 0.5, spec: 0.9, emissive: 0x2a9db0, emissiveIntensity: 0.3 });
    const sphG = new THREE.SphereGeometry(1, 12, 9), glintG = new THREE.SphereGeometry(1, 6, 4);
    const mkB = (n, size, riseSp) => {
      const body = new THREE.InstancedMesh(sphG, bubMat, n), glint = new THREE.InstancedMesh(glintG, own(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false })), n);
      [body, glint].forEach((m) => { m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(m); });
      body.renderOrder = 6; glint.renderOrder = 7;
      const seed = []; for (let i = 0; i < n; i++) seed.push({ x: rnd() * 1000, y: rnd(), z: rnd() * 1000, ph: rnd() * 6, sp: 0.6 + rnd() * 0.8, s: size * (0.6 + rnd() * 0.8) });
      S.layers.push({ bubble: true, body: body, glint: glint, n: n, seed: seed, rise: riseSp });
    };
    mkB(6, 0.34, 0.5); mkB(26, 0.18, 0.35);
    const pos = new Float32Array(110 * 3), seeds = [];
    for (let i = 0; i < 110; i++) seeds.push({ x: rnd() * 1000, z: rnd() * 1000, y: rnd(), ph: rnd() * 6, sp: 0.6 + rnd() });
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(pg, own(new THREE.PointsMaterial({ map: dt, size: 4, sizeAttenuation: false, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })));
    pts.frustumCulled = false; scene.add(pts);
    S.layers.push({ pts: pts, pos: pos, seed: seeds, n: 110 });
    S.bm4 = new THREE.Matrix4(); S.bq = new THREE.Quaternion(); S.bs = new V3(); S.bp = new V3();
  }

  function updateView(dt) {
    const P = S.player, cam = S.cam;
    const rv = Math.max(BASE_R * (P ? P.k : 1), P ? P.r * 0.95 : BASE_R);
    const asp = SP.render.width / Math.max(1, SP.render.height);
    const target = 15.5 * rv * S.zoomMul * (asp < 1 ? 1 + (1 - asp) * 0.55 : 1);   // ground height seen at the screen centre (same framing as the old top-down view; a little wider in portrait)
    S.viewTarget = target;
    cam.distance = cam.distanceFor(target);
    const gs = cam.groundSize(cam._d);                  // follow the (smoothed) distance for spawn / culling extents
    S.viewH = gs.h * 1.1; S.viewW = gs.w * 1.25;        // generous: the far edge of the tilted view is wider and deeper
    S.halfDiag = 0.5 * Math.hypot(S.viewW, S.viewH);
    S.fogK = cam._d;
  }

  const _sw = new V3();
  function worldUpdate(dt) {
    const cx = S.cam._t.x, cz = S.cam._t.z, t = S.time, d = S.cam._d;
    // fog fades the far (top of screen) parts of the pool: depth-of-field-like falloff
    S.scene.fog.near = d * 1.05; S.scene.fog.far = d * 3.1;
    const D = Math.max(5.5, d * 0.5);                   // how far below the play plane the sea floor sits
    S.floorG.position.y = -D;
    if (S.kelp && S.kelp.material.userData.sh) S.kelp.material.userData.sh.uniforms.uT.value = t;
    const side = Math.max(S.viewW, S.viewH) * 1.9;
    S.caustics.forEach((c) => {
      c.mesh.position.set(cx, -D * c.o.f, cz); c.mesh.scale.set(side, 1, side);
      const k = side / c.o.tile;
      c.tex.repeat.set(k, k);
      c.tex.offset.set(cx / c.o.tile - k / 2 + t * c.o.vx / c.o.tile, -cz / c.o.tile - k / 2 - t * c.o.vz / c.o.tile);
      c.mesh.material.opacity = c.o.op * (0.85 + 0.15 * Math.sin(t * 1.3 + c.o.tile));
    });
    // far blurred cells (world anchored; perspective gives the parallax)
    {
      const M = S.bm4, qq = S.bq, ss = S.bs, pp = S.bp, ee = new THREE.Euler();
      for (let i = 0; i < S.blobs.length; i++) {
        const b = S.blobs[i];
        b.dir += Math.sin(t * 0.15 + i) * dt * 0.2; b.x += Math.sin(b.dir) * b.sp * dt; b.z += Math.cos(b.dir) * b.sp * dt;
        const rr = Math.hypot(b.x, b.z); if (rr > POOL_R - 6) { b.x *= (POOL_R - 6) / rr; b.z *= (POOL_R - 6) / rr; b.dir += 3.1; }
        ee.set(0, b.yaw + t * 0.02 * (i % 3 - 1), 0); qq.setFromEuler(ee);
        const sz = b.s * Math.max(1, d / 20);
        M.compose(pp.set(b.x, -D * b.yo, b.z), qq, ss.set(sz, 1, sz)); S.blobI.setMatrixAt(i, M);
      }
      S.blobI.instanceMatrix.needsUpdate = true;
    }
    // bubbles (instanced translucent spheres + glints) / motes
    const u = Math.max(0.6, S.viewTarget / 12.4);
    const BW = S.viewW * 1.3, BH = S.viewH * 1.5, top = d * 0.4;
    S.layers.forEach((L) => {
      if (L.bubble) {
        const M = S.bm4, qq = S.bq, ss = S.bs, pp = S.bp;
        qq.identity();
        for (let i = 0; i < L.n; i++) {
          const s = L.seed[i];
          s.y = (s.y + dt * 0.05 * L.rise * s.sp) % 1;
          const x = cx + ((s.x + Math.sin(t * 0.6 * s.sp + s.ph) * 0.6 * u - cx) % BW + BW * 1.5) % BW - BW / 2;
          const z = cz + ((s.z - cz) % BH + BH * 1.5) % BH - BH * 0.55;
          const y = 0.5 * u + s.y * top;
          const r = s.s * u * (1 + 0.06 * Math.sin(t * 2 + s.ph));
          M.compose(pp.set(x, y, z), qq, ss.set(r, r, r)); L.body.setMatrixAt(i, M);
          M.compose(pp.set(x - r * 0.38, y + r * 0.42, z + r * 0.3), qq, ss.set(r * 0.22, r * 0.14, r * 0.14)); L.glint.setMatrixAt(i, M);
        }
        L.body.instanceMatrix.needsUpdate = true; L.glint.instanceMatrix.needsUpdate = true;
      } else {
        const a = L.pos, BW2 = S.viewW * 1.2, BH2 = S.viewH * 1.2;
        for (let i = 0; i < L.n; i++) {
          const s = L.seed[i];
          s.z -= 0.1 * s.sp * dt * 2.2;
          s.x += Math.sin(t * 0.8 * s.sp + s.ph) * dt * 0.6;
          const ox = ((s.x - cx * 1.05) % BW2 + BW2 * 1.5) % BW2 - BW2 / 2;
          const oz = ((s.z - cz * 1.05) % BH2 + BH2 * 1.5) % BH2 - BH2 / 2;
          a[i * 3] = cx + ox; a[i * 3 + 1] = s.y * d * 0.5; a[i * 3 + 2] = cz + oz;
        }
        L.pts.geometry.attributes.position.needsUpdate = true;
      }
    });
    // contact shadows
    {
      const M = S.bm4, qq = S.bq, ss = S.bs, pp = S.bp; let n = 0; qq.identity();
      for (let i = 0; i < S.cells.length && n < S.shadowI.instanceMatrix.count; i++) {
        const c = S.cells[i];
        if (!c.rig || !c.rig.root.visible || c.dead && c.deadT > 1) continue;
        const rs = c.r * 1.25 * (c.rise > 0 ? 1 - c.rise : 1);
        if (rs < 0.02) continue;
        M.compose(pp.set(c.x + c.r * 0.22, -c.r * 0.55 - 0.05, c.z - c.r * 0.12), qq, ss.set(rs, 1, rs)); S.shadowI.setMatrixAt(n++, M);
      }
      S.shadowI.count = n; S.shadowI.instanceMatrix.needsUpdate = true;
    }
  }

  // ================================================================== food: plants, meat, plankton (instanced)
  const food = window.__food = {};
  function buildFood() {
    const R = SP.render, scene = S.scene;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new V3(), pp = new V3(), e = new THREE.Euler();
    const halo = (hex, cap, op) => {
      const g = new THREE.PlaneGeometry(2, 2); g.rotateX(-Math.PI / 2);
      const m = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ map: S.dotMap, color: hex, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }), cap);
      m.material.userData.own = true; m.renderOrder = -1;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; m.count = 0; scene.add(m); return m;
    };
    const mkInst = (geo, hex, cap, em, o) => {
      const ci = R.celInstanced(geo, hex, cap, Object.assign({ outline: 0.14, cast: false, receive: false, emissive: em, emissiveIntensity: 0.6 }, o || {}));
      ci.setCount(0); scene.add(ci.group); return ci;
    };
    const F = food;
    F.plants = []; F.meats = []; F.planks = [];
    F.CAP = { plant: 120, meat: 70, plank: 110 };
    // plant food: glowing algae clusters = 3 chunky blobs + 4 fronds
    F.plantI = mkInst(new THREE.SphereGeometry(1, 10, 8), 0x37c85c, F.CAP.plant * 3, 0x0f6b32, { emissiveIntensity: 0.45 });
    const fg = new THREE.ConeGeometry(0.2, 1, 5); fg.translate(0, 0.5, 0);
    F.frondI = mkInst(fg, 0x9cf6a8, F.CAP.plant * 4, 0x22c55e, { outline: 0.18, emissiveIntensity: 0.55 });
    F.plantH = halo(0x4ade80, F.CAP.plant, 0.26);
    // meat: raw chunk + fat marbling + a bone with two knobs
    F.meatI = mkInst(new THREE.DodecahedronGeometry(1, 0), 0xf43f5e, F.CAP.meat, 0xbe123c, { emissiveIntensity: 0.5 });
    F.meatS = mkInst(new THREE.SphereGeometry(1, 8, 6), 0xffffff, F.CAP.meat * 3, 0x442222, { outline: 0.14, emissiveIntensity: 0.25 });
    F.boneI = mkInst(new THREE.CylinderGeometry(1, 1, 1, 7, 1), 0xfffbeb, F.CAP.meat, 0x6b5b3e, { outline: 0.2, emissiveIntensity: 0.2 });
    { const cc = new THREE.Color(); for (let i = 0; i < F.CAP.meat * 3; i++) { cc.setHex(i % 3 === 0 ? 0xffd5db : 0xfff7e0); F.meatS.mesh.setColorAt(i, cc); } if (F.meatS.mesh.instanceColor) F.meatS.mesh.instanceColor.needsUpdate = true; }
    F.meatH = halo(0xf43f5e, F.CAP.meat, 0.3);
    // plankton: tiny glossy glowing orbs
    F.plankI = mkInst(new THREE.SphereGeometry(1, 10, 8), 0x9fe3ee, F.CAP.plank, 0x3bb4c8,
      { outline: 0.0, material: R.toonRim(0xa5f0ff, { rim: 0xffffff, rimStrength: 0.6, rimAt: 0.5, spec: 1, emissive: 0x3bb4c8, emissiveIntensity: 0.7 }) });
    F.plankH = halo(0x7fdcf0, F.CAP.plank, 0.35);
    F.mgr = 0;
    F.tmp = { m4: m4, q: q, sc: sc, pp: pp, e: e, ax: new V3() };

    F.add = function (kind, x, z, o) {
      const list = kind === 'plant' ? F.plants : kind === 'meat' ? F.meats : F.planks;
      if (list.length >= F.CAP[kind]) return null;
      o = o || {};
      const fs = S.fs;
      const it = { x: x, z: z, vx: o.vx || 0, vz: o.vz || 0, ph: rnd() * 6, ang: rnd() * 6, val: o.val || 1, life: o.life || 0, age: 0 };
      if (kind === 'plant') it.r = 0.24 * fs * (0.85 + rnd() * 0.35);
      else if (kind === 'meat') { it.r = (0.26 + 0.1 * it.val) * fs; it.life = o.life || 38; }
      else it.r = 0.075 * fs * (0.8 + rnd() * 0.5);
      list.push(it); return it;
    };
    // a clump of one kind of food around (cx,cz)
    F.patch = function (kind, cx, cz, quiet) {
      const n = kind === 'plant' ? S.rng.int(3, 6) : S.rng.int(4, 9), sp = (kind === 'plant' ? 2.8 : 3.6) * S.fs;
      for (let i = 0; i < n; i++) {
        const a = S.rng.range(0, TAU), d = Math.sqrt(S.rng.next()) * sp;
        const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
        if (Math.hypot(x, z) > POOL_R - 3) continue;
        F.add(kind, x, z, { val: 1 });
      }
    };
    F.localR = function () { return S.halfDiag * 1.75; };
    F.fill = function (initial) {
      const P = S.player, Rl = F.localR();
      const want = { plant: Math.max(10, 22 - S.level * 3), plank: Math.max(18, 32 - S.level * 4), meat: 4 };
      const have = { plant: 0, plank: 0, meat: 0 };
      const cnt = (list, key) => { for (let i = 0; i < list.length; i++) if (Math.hypot(list[i].x - P.x, list[i].z - P.z) < Rl) have[key]++; };
      cnt(F.plants, 'plant'); cnt(F.planks, 'plank'); cnt(F.meats, 'meat');
      let guard = 0;
      while (have.plant < want.plant && guard++ < 6) {
        const a = rnd() * TAU, d = initial ? Math.sqrt(rnd()) * Rl : Rl * (0.8 + rnd() * 0.2);
        const n0 = F.plants.length; F.patch('plant', P.x + Math.cos(a) * d, P.z + Math.sin(a) * d); have.plant += F.plants.length - n0;
      }
      guard = 0;
      while (have.plank < want.plank && guard++ < 4) {
        const a = rnd() * TAU, d = initial ? Math.sqrt(rnd()) * Rl : Rl * (0.8 + rnd() * 0.2);
        const n0 = F.planks.length; F.patch('plank', P.x + Math.cos(a) * d, P.z + Math.sin(a) * d); have.plank += F.planks.length - n0;
      }
      if (have.meat < want.meat && rnd() < (initial ? 1 : 0.35)) {
        const a = rnd() * TAU, d = Rl * (0.5 + rnd() * 0.5);
        F.add('meat', P.x + Math.cos(a) * d, P.z + Math.sin(a) * d, { val: 1 + (rnd() < 0.3 ? 1 : 0), life: 60 });
      }
    };
    F.update = function (dt) {
      const P = S.player, t = S.time, T = F.tmp, Rl = F.localR(), cull = Rl * 1.45, cull2 = cull * cull;
      F.mgr -= dt; if (F.mgr <= 0) { F.mgr = 0.3; F.fill(false); }
      const cx = S.cur.x * dt, cz = S.cur.z * dt;
      const drift = (list) => {
        for (let i = list.length - 1; i >= 0; i--) {
          const f = list[i];
          f.age += dt;
          f.vx *= Math.exp(-1.2 * dt); f.vz *= Math.exp(-1.2 * dt);
          f.x += (f.vx + Math.sin(t * 0.6 + f.ph) * 0.12) * dt + cx * 0.5; f.z += (f.vz + Math.cos(t * 0.5 + f.ph) * 0.12) * dt + cz * 0.5;
          const rr = Math.hypot(f.x, f.z);
          if (rr > POOL_R - 2) { f.x *= (POOL_R - 2) / rr; f.z *= (POOL_R - 2) / rr; }
          const dx = f.x - P.x, dz = f.z - P.z;
          if (dx * dx + dz * dz > cull2 || (f.life && f.age > f.life)) { list[i] = list[list.length - 1]; list.pop(); }
        }
      };
      drift(F.plants); drift(F.meats); drift(F.planks);
      // push everything out of cell bodies (so wrong food bumps instead of ghosting through)
      for (let j = 0; j < S.cells.length; j++) {
        const c = S.cells[j]; if (c.dead) continue;
        const lim = c.r * 0.82;
        const push = (list, canEat) => {
          if (canEat && c.isPlayer) return;
          for (let i = 0; i < list.length; i++) {
            const f = list[i], dx = f.x - c.x, dz = f.z - c.z, d2 = dx * dx + dz * dz, m = lim + f.r;
            if (d2 < m * m && d2 > 1e-6) { const d = Math.sqrt(d2), k = (m - d) * 6 * dt; f.x += dx / d * k; f.z += dz / d * k; f.vx += dx / d * 0.4; f.vz += dz / d * 0.4; }
          }
        };
        if (Math.abs(c.x - P.x) < Rl && Math.abs(c.z - P.z) < Rl) { push(F.plants, c.canPlant); push(F.meats, c.canMeat); }
      }
      // render (everything rests on the y = 0 play plane; halos are ground glows)
      for (let i = 0; i < F.plants.length; i++) {
        const f = F.plants[i], pulse = 1 + 0.12 * Math.sin(t * 2.2 + f.ph), r = f.r;
        f.ang += dt * 0.5;
        for (let j = 0; j < 3; j++) {
          const a = f.ang + j * TAU / 3, s = r * (0.85 + 0.2 * Math.sin(t * 2 + f.ph + j * 2)) * (j === 2 ? 0.8 : 1);
          T.pp.set(f.x + Math.cos(a) * r * 1.0, s * 0.95 + r * 0.3 * (j & 1) + 0.05 * r * Math.sin(t * 1.6 + f.ph + j), f.z + Math.sin(a) * r * 1.0);
          T.q.identity(); T.sc.set(s, s * 0.92, s);
          T.m4.compose(T.pp, T.q, T.sc); F.plantI.setMatrixAt(i * 3 + j, T.m4);
        }
        for (let j = 0; j < 4; j++) {
          const a = -f.ang * 0.6 + j * TAU / 4 + f.ph, tilt = 0.5 + 0.18 * Math.sin(t * 1.5 + f.ph + j * 1.7), h = r * (2.2 + 0.5 * (j & 1));
          T.ax.set(Math.sin(a), 0, -Math.cos(a)); T.q.setFromAxisAngle(T.ax, tilt);
          T.pp.set(f.x + Math.cos(a) * r * 0.25, r * 0.2, f.z + Math.sin(a) * r * 0.25); T.sc.set(r * 0.8, h, r * 0.8);
          T.m4.compose(T.pp, T.q, T.sc); F.frondI.setMatrixAt(i * 4 + j, T.m4);
        }
        T.q.identity(); T.pp.set(f.x, 0.02, f.z); T.sc.setScalar(r * 3.8 * pulse); T.m4.compose(T.pp, T.q, T.sc); F.plantH.setMatrixAt(i, T.m4);
      }
      F.plantI.setCount(F.plants.length * 3); F.plantI.update(); F.frondI.setCount(F.plants.length * 4); F.frondI.update();
      F.plantH.count = F.plants.length; F.plantH.instanceMatrix.needsUpdate = true;
      for (let i = 0; i < F.meats.length; i++) {
        const f = F.meats[i], fade = f.life ? clamp((f.life - f.age) / 4, 0.1, 1) : 1, pulse = 1 + 0.1 * Math.sin(t * 2.6 + f.ph), r = f.r * fade;
        f.ang += dt * 0.7;
        const by = r * 0.85 + 0.08 * Math.sin(t * 1.8 + f.ph), ca = Math.cos(f.ang), sa = Math.sin(f.ang);
        T.e.set(0.25, f.ang, 0.18); T.q.setFromEuler(T.e);
        T.pp.set(f.x, by, f.z); T.sc.set(r * 1.15, r * 0.8, r * 0.95);
        T.m4.compose(T.pp, T.q, T.sc); F.meatI.setMatrixAt(i, T.m4);
        // fat marbling on top (pale blob)
        T.pp.set(f.x + ca * r * 0.22, by + r * 0.62, f.z - sa * r * 0.18); T.sc.set(r * 0.6, r * 0.34, r * 0.5);
        T.m4.compose(T.pp, T.q, T.sc); F.meatS.setMatrixAt(i * 3, T.m4);
        // bone sticking out sideways with a knob at each end
        const ba = f.ang * 0.3 + f.ph, bx = Math.cos(ba), bz = Math.sin(ba), bl = r * 1.7;
        T.e.set(0, -ba, Math.PI / 2); T.q.setFromEuler(T.e);
        T.pp.set(f.x + bx * r * 0.95, by + r * 0.15, f.z + bz * r * 0.95); T.sc.set(r * 0.17, bl, r * 0.17);
        T.m4.compose(T.pp, T.q, T.sc); F.boneI.setMatrixAt(i, T.m4);
        T.q.identity();
        for (let j = 0; j < 2; j++) {
          const sg = j ? 1 : -1;
          T.pp.set(f.x + bx * (r * 0.95 + sg * bl * 0.5), by + r * 0.15, f.z + bz * (r * 0.95 + sg * bl * 0.5)); T.sc.set(r * 0.3, r * 0.26, r * 0.3);
          T.m4.compose(T.pp, T.q, T.sc); F.meatS.setMatrixAt(i * 3 + 1 + j, T.m4);
        }
        T.pp.set(f.x, 0.02, f.z); T.sc.setScalar(f.r * 3.3 * pulse * fade); T.m4.compose(T.pp, T.q, T.sc); F.meatH.setMatrixAt(i, T.m4);
      }
      F.meatI.setCount(F.meats.length); F.meatI.update(); F.meatS.setCount(F.meats.length * 3); F.meatS.update(); F.boneI.setCount(F.meats.length); F.boneI.update();
      F.meatH.count = F.meats.length; F.meatH.instanceMatrix.needsUpdate = true;
      T.q.identity();
      for (let i = 0; i < F.planks.length; i++) {
        const f = F.planks[i], s = f.r * (0.9 + 0.2 * Math.sin(t * 3 + f.ph));
        T.pp.set(f.x, f.r * 1.2 + 0.12 * Math.sin(t * 1.4 + f.ph * 2), f.z); T.sc.setScalar(s); T.m4.compose(T.pp, T.q, T.sc); F.plankI.setMatrixAt(i, T.m4);
        T.pp.y = 0.02; T.sc.setScalar(s * 3.2); T.m4.compose(T.pp, T.q, T.sc); F.plankH.setMatrixAt(i, T.m4);
      }
      F.plankI.setCount(F.planks.length); F.plankI.update(); F.plankH.count = F.planks.length; F.plankH.instanceMatrix.needsUpdate = true;
    };
  }

  // ================================================================== effects: particles, rings, zaps, poison puffs
  function buildFx() {
    const R = SP.render, scene = S.scene;
    const fx = S.fx = {};
    fx.parts = R.particles(scene, 700);
    // expanding rings
    fx.rings = [];
    const rg = new THREE.RingGeometry(0.86, 1, 48); rg.rotateX(-Math.PI / 2);
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.material.userData.own = true; m.visible = false; m.frustumCulled = false; scene.add(m);
      fx.rings.push({ m: m, t: 0, life: 0, max: 1, y: 0.1 });
    }
    // lightning segments
    const zg = new THREE.BoxGeometry(1, 0.06, 0.12);
    fx.zapMesh = new THREE.InstancedMesh(zg, new THREE.MeshBasicMaterial({ color: 0xfef08a }), 220);
    fx.zapMesh.material.userData.own = true; fx.zapMesh.frustumCulled = false; fx.zapMesh.count = 0; fx.zapMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(fx.zapMesh); fx.zaps = [];
    // poison puffs
    const pg = new THREE.SphereGeometry(1, 12, 9);
    fx.puffMesh = new THREE.InstancedMesh(pg, R.toonRim(0xa3e635, { opacity: 0.38, rim: 0xecfccb, rimStrength: 0.45, rimAt: 0.6, spec: 0.5, emissive: 0x4d7c0f, emissiveIntensity: 0.3 }), 150);
    fx.puffMesh.frustumCulled = false; fx.puffMesh.count = 0; fx.puffMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); fx.puffMesh.renderOrder = 5;
    scene.add(fx.puffMesh);
    // telegraph shadows (epic cell)
    fx.shadowGeo = new THREE.CircleGeometry(1, 40); fx.shadowGeo.rotateX(-Math.PI / 2);
    fx.m4 = new THREE.Matrix4(); fx.q = new THREE.Quaternion(); fx.sc = new V3(); fx.pp = new V3(); fx.e = new THREE.Euler();
    fx.halos = {};
    const hg = new THREE.PlaneGeometry(2, 2); hg.rotateX(-Math.PI / 2);
    fx.haloGeo = hg;
    ['red', 'amber', 'cyan', 'player', 'pink'].forEach((k) => {
      const col = { red: 0xf43f5e, amber: 0xfbbf24, cyan: 0x9be9ff, player: 0xbaf7ff, pink: 0xf9a8d4 }[k];
      fx.halos[k] = new THREE.MeshBasicMaterial({ map: S.dotMap, color: col, transparent: true, opacity: k === 'player' ? 0.3 : 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
      fx.halos[k].userData.own = true;
    });
  }
  function ring(x, z, color, maxR, life, y) {
    const r = S.fx.rings.find((q) => q.life <= 0); if (!r) return;
    r.t = 0; r.life = life; r.max = maxR; r.y = y === undefined ? 0.1 : y; r.m.material.color.setHex(color); r.m.visible = true; r.m.position.set(x, r.y, z);
  }
  function burstP(x, z, hex, n, speed, size) {
    const P = S.player;
    TMP.set(x, 0.45 + 0.55 * (P ? P.k : 1), z);
    S.fx.parts.burst(TMP, hex, n, speed, { size: size || 0.2 * S.fs, life: 0.75, gravity: 0, up: new V3(0, 1, 0), flat: true });
  }
  function zapBolt(ax, az, bx, bz, big) {
    const segs = 7, dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz) || 1, nx = -dz / len, nz = dx / len;
    let px = ax, pz = az;
    for (let i = 1; i <= segs; i++) {
      const u = i / segs, j = i === segs ? 0 : (rnd() - 0.5) * len * 0.22;
      const x = ax + dx * u + nx * j, z = az + dz * u + nz * j;
      S.fx.zaps.push({ x1: px, z1: pz, x2: x, z2: z, life: 0.2, w: big ? 1.6 : 1 });
      px = x; pz = z;
    }
  }
  function fxUpdate(dt) {
    const fx = S.fx;
    fx.parts.update(dt);
    for (let i = 0; i < fx.rings.length; i++) {
      const r = fx.rings[i]; if (r.life <= 0) continue;
      r.t += dt; const u = r.t / r.life;
      if (u >= 1) { r.life = 0; r.m.visible = false; continue; }
      const s = r.max * (1 - Math.pow(1 - u, 2.2)); r.m.scale.setScalar(Math.max(0.01, s)); r.m.material.opacity = 0.85 * (1 - u);
    }
    let n = 0;
    for (let i = fx.zaps.length - 1; i >= 0; i--) {
      const z = fx.zaps[i]; z.life -= dt;
      if (z.life <= 0 || n >= 220) { fx.zaps.splice(i, 1); continue; }
    }
    for (let i = 0; i < fx.zaps.length && n < 220; i++) {
      const z = fx.zaps[i], dx = z.x2 - z.x1, dz = z.z2 - z.z1, len = Math.hypot(dx, dz) || 0.01;
      fx.e.set(0, Math.atan2(-dz, dx), 0); fx.q.setFromEuler(fx.e);
      fx.pp.set((z.x1 + z.x2) / 2, 0.45 + 0.5 * (S.player ? S.player.k : 1), (z.z1 + z.z2) / 2);
      const w = z.w * Math.max(0.5, S.fs) * (z.life / 0.2) * 1.4;
      fx.sc.set(len, 1, w * 2);
      fx.m4.compose(fx.pp, fx.q, fx.sc); fx.zapMesh.setMatrixAt(n++, fx.m4);
    }
    fx.zapMesh.count = n; fx.zapMesh.instanceMatrix.needsUpdate = true;
    // puffs
    n = 0;
    fx.q.identity();
    for (let i = 0; i < S.clouds.length && n < 150; i++) {
      const c = S.clouds[i], u = c.age / c.life, s = c.r * (u < 0.15 ? u / 0.15 : 1 - Math.max(0, u - 0.7) / 0.3 * 0.9);
      for (let j = 0; j < 3; j++) {
        const a = c.ph + j * 2.1 + S.time * 0.3;
        const pr = Math.max(0.01, s * (0.65 + 0.2 * j));
        fx.pp.set(c.x + Math.cos(a) * c.r * 0.35, pr * 0.75, c.z + Math.sin(a) * c.r * 0.35);
        fx.sc.set(pr, pr * 0.8, pr);
        fx.m4.compose(fx.pp, fx.q, fx.sc); fx.puffMesh.setMatrixAt(n++, fx.m4);
      }
    }
    fx.puffMesh.count = n; fx.puffMesh.instanceMatrix.needsUpdate = true;
  }

  // ================================================================== cells: creation, physics, animation
  function applyStats(c) {
    const st = c.st, k = c.k, ratio = c.hpMax ? c.hp / c.hpMax : 1;
    const tm = c.tm || { spd: 1, hp: 1 };
    c.r = st.radius * k;
    c.mass = c.r * c.r;
    c.hpMax = (st.health + (c.isPlayer ? 22 : 0)) * k * k * tm.hp;
    c.hp = c.hpMax * ratio;
    let top = st.topSpeed * Math.pow(k, 0.85) * tm.spd;
    if (!c.isPlayer) top = clamp(top, 2.2 * Math.pow(k, 0.85), 8 * Math.pow(k, 0.85));
    c.topSpeed = top;
    c.drag = st.drag;
    c.turnRate = st.turnRate / Math.sqrt(Math.max(0.5, k));
    c.bite = st.abilities ? st.abilities.bite : 0;
    c.ramDmg = st.ramDamage * 0.5;
    // ram parts (spike 1, horn 2) are encoded in ramDamage = (4 + 4*ram + 3*strike) * sqrt(mass)
    c.spike = Math.max(0, (st.ramDamage / Math.sqrt(Math.max(0.5, st.mass)) - 4 - 3 * (st.abilities ? st.abilities.strike : 0)) / 4);
    c.zap = st.zap; c.poison = st.poison; c.burstLv = st.burst;
    c.diet = st.diet;
    c.canPlant = st.diet === 'herbivore' || st.diet === 'omnivore';
    c.canMeat = st.diet === 'carnivore' || st.diet === 'omnivore';
  }
  function attachRig(c, design) {
    if (c.rig) disposeRig(c, true);
    const rig = SP.creature.build(design, { outline: true, shadows: false, lod: c.isPlayer || c.type === 'mate' ? 'high' : 'low' });
    rig.setScale(c.k);
    rig.root.position.set(c.x, 0, c.z); rig.root.rotation.y = c.h;
    c.rig = rig; c.st = rig.stats; c.design = design;
    S.scene.add(rig.root);
    applyStats(c);
  }
  function disposeRig(c, keepHalo) {
    if (c.rig) { try { c.rig.dispose(); } catch (e) { /* ignore */ } c.rig = null; }
    if (c.halo && !keepHalo) { S.scene.remove(c.halo); c.halo = null; }
  }
  const TYPE_MUL = {
    player: { spd: 1, hp: 1 }, prey: { spd: 0.9, hp: 0.8 }, grazer: { spd: 0.85, hp: 1 }, hunter: { spd: 0.95, hp: 1.1 },
    turtle: { spd: 0.4, hp: 2.0 }, electric: { spd: 0.85, hp: 1 }, poisoner: { spd: 0.9, hp: 1 }, epic: { spd: 0.7, hp: 1.8 }, mate: { spd: 0.8, hp: 1 }
  };
  function spawnCell(o) {
    const c = {
      id: S.nextId++, type: o.type, isPlayer: !!o.isPlayer, x: o.x, z: o.z, vx: 0, vz: 0, h: o.h === undefined ? rnd() * TAU : o.h,
      k: o.k || 1, dirX: 0, dirZ: 0, thr: 0, hp: 1, hpMax: 1, dead: false, deadT: 0, rise: o.rise || 0,
      burstT: 0, burstCd: 0, burstMul: 2, biteCd: 0, zapCd: 0, poisonCd: 0, thornCd: 0, ramCd: 0, tintT: 0, tinted: false,
      act: null, actT: 0, aspeed: 0, turn: 0, lastTurn: 0, invuln: 0, lastHit: null, lastHitT: -99, grudge: 0,
      ai: { wanderT: 0, wx: o.x, wz: o.z, tgt: null, state: 'wander', t: o.type === 'epic' ? 4 : 0, fleeT: 0, cd: rnd() * 0.3 }, tm: TYPE_MUL[o.type] || TYPE_MUL.grazer,
      partDrop: o.partDrop || null, rho: o.rho || 1, kvis: 1, halo: null, fadeK: 1
    };
    attachRig(c, o.design || designFor(S, o.type, o.rho || 1));
    if (!c.isPlayer && o.rho) { c.k = (o.rho * (S.player ? S.player.r : BASE_R)) / c.st.radius; c.rig.setScale(c.k); applyStats(c); }
    c.hp = c.hpMax;
    if (c.rise > 0) { c.kvis = 0.6; }
    // halo
    const hk = c.isPlayer ? 'player' : c.type === 'mate' ? 'pink' : null;
    if (hk) { c.halo = new THREE.Mesh(S.fx.haloGeo, S.fx.halos[hk]); c.halo.frustumCulled = false; S.scene.add(c.halo); }
    else { c.halo = new THREE.Mesh(S.fx.haloGeo, S.fx.halos.amber); c.halo.visible = false; c.halo.frustumCulled = false; S.scene.add(c.halo); }
    S.cells.push(c);
    return c;
  }

  function setAction(c, a) { if (c.act === 'die' && a !== 'die') return; c.act = a; c.actT = 0; }

  function physics(c, dt) {
    if (c.rise > 0.25) { c.thr = 0; }
    // timers
    c.burstCd = Math.max(0, c.burstCd - dt); c.biteCd = Math.max(0, c.biteCd - dt); c.zapCd = Math.max(0, c.zapCd - dt);
    c.poisonCd = Math.max(0, c.poisonCd - dt); c.thornCd = Math.max(0, c.thornCd - dt); c.ramCd = Math.max(0, c.ramCd - dt);
    c.invuln = Math.max(0, c.invuln - dt); c.grudge = Math.max(0, c.grudge - dt);
    if (c.burstT > 0) c.burstT -= dt;
    if (c.stunned > 0) c.stunned = Math.max(0, c.stunned - dt);
    const V = c.topSpeed * (c.burstT > 0 ? c.burstMul : 1);
    if (c.thr > 0.01 && !c.stunned) {
      const want = Math.atan2(c.dirX, c.dirZ), dd = wrapA(want - c.h), mt = c.turnRate * dt * (c.burstT > 0 ? 0.6 : 1);
      const step = clamp(dd, -mt, mt); c.h = wrapA(c.h + step); c.turn = step / dt;
      const al = Math.max(0.18, Math.cos(wrapA(want - c.h)));
      const a = V * c.drag * c.thr * al;
      c.vx += (Math.sin(c.h) * a) * dt; c.vz += (Math.cos(c.h) * a) * dt;
    } else c.turn *= Math.exp(-6 * dt);
    c.vx -= c.vx * c.drag * dt; c.vz -= c.vz * c.drag * dt;
    // soft current
    c.vx += S.cur.x * 0.25 * dt; c.vz += S.cur.z * 0.25 * dt;
    c.x += c.vx * dt; c.z += c.vz * dt;
    // soft pool wall
    const rr = Math.hypot(c.x, c.z), lim = POOL_R - c.r * 0.8;
    if (rr > lim - 6) {
      const nx = c.x / rr, nz = c.z / rr, over = rr - (lim - 6);
      c.vx -= nx * over * 4 * dt; c.vz -= nz * over * 4 * dt;
      if (rr > lim) { c.x = nx * lim; c.z = nz * lim; const vn = c.vx * nx + c.vz * nz; if (vn > 0) { c.vx -= nx * vn * 1.4; c.vz -= nz * vn * 1.4; } }
    }
    c.aspeed = c.vx * Math.sin(c.h) + c.vz * Math.cos(c.h);
    // timers for visuals
    c.actT += dt;
    if (c.act && c.act !== 'die') {
      const dur = c.act === 'bite' ? 0.5 : c.act === 'hurt' ? 0.45 : c.act === 'eat' ? 0.38 : c.act === 'spit' ? 0.65 : c.act === 'strike' ? 0.55 : c.act === 'mate' || c.act === 'celebrate' ? 99 : 0.5;
      if (c.actT > dur) c.act = null;
    }
    if (c.tintT > 0) { c.tintT -= dt; if (c.tintT <= 0 && c.tinted) { c.rig.setTint(null); c.tinted = false; } }
    if (c.isPlayer) {
      if (!c.dead && S.sinceHurt > 4 && c.hp < c.hpMax) c.hp = Math.min(c.hpMax, c.hp + c.hpMax * 0.012 * dt);
      if (c.invuln > 0) c.rig.root.visible = (Math.floor(S.time * 14) % 2 === 0) || c.invuln > 100;
      else c.rig.root.visible = true;
    }
  }

  function animateCell(c, dt) {
    const rig = c.rig; if (!rig) return;
    const dx = c.x - S.cam._t.x, dz = c.z - S.cam._t.z;
    const near = Math.abs(dx) < S.viewW * 0.5 + c.r * 2.5 && dz > -S.viewH * 0.62 - c.r * 2.5 && dz < S.viewH * 0.45 + c.r * 2.5;
    c.inView = near;
    // smooth visual growth
    if (c.isPlayer && c.kT && Math.abs(c.k - c.kT) > 0.0005) {
      c.k = lerp(c.k, c.kT, 1 - Math.exp(-3.2 * dt)); rig.setScale(c.k); applyStats(c);
    }
    let ks = c.k;
    if (c.rise > 0) {
      const u = c.rise; ks = c.k * (1 - 0.4 * u); rig.root.position.y = -9 * u; rig.setFade(1 - 0.65 * u);
    } else if (rig.root.position.y !== 0) { rig.root.position.y = 0; rig.setFade(1); }
    if (c.type === 'mate') ks *= 1 + 0.04 * Math.sin(S.time * 6);
    rig.root.scale.setScalar(ks);
    rig.root.position.x = c.x; rig.root.position.z = c.z; rig.root.rotation.y = c.h;
    rig.root.visible = (c.isPlayer ? rig.root.visible : true) && (near || c.isPlayer);
    if (near || c.isPlayer) {
      c.acc = (c.acc || 0) + dt;
      if (c.isPlayer || near) {
        SP.creature.animate(rig, c.acc, { speed: c.aspeed, turn: c.turn, action: c.act, actionT: c.actT, airborne: false, inWater: false, lookAt: c.look });
        c.acc = 0;
      }
    }
    // halo
    const hl = c.halo;
    if (hl) {
      let mat = null, show = near && !c.dead;
      if (!c.isPlayer && c.type !== 'mate') {
        const P = S.player, pr = P ? P.r : BASE_R;
        if (c.plank) mat = S.fx.halos.cyan;
        else if (c.type === 'epic' || (c.type === 'hunter' && c.r > pr * 0.85)) mat = S.fx.halos.red;
        else if (c.type === 'turtle' || c.type === 'electric' || c.type === 'poisoner') mat = S.fx.halos.amber;
        else if (c.type === 'hunter') mat = S.fx.halos.amber;
        else show = false;
        if (mat) hl.material = mat;
      }
      hl.visible = show;
      if (show) {
        hl.position.set(c.x, -0.05, c.z);
        const pulse = 1 + 0.06 * Math.sin(S.time * 3 + c.id);
        hl.scale.setScalar(c.r * (c.isPlayer ? 2.2 : 2.0) * pulse * (c.rise > 0 ? 0.3 : 1));
      }
    }
  }

  function reap() {
    for (let i = S.cells.length - 1; i >= 0; i--) {
      const c = S.cells[i];
      let remove = false;
      if (c.dead && !c.isPlayer && c.deadT > 1.9) remove = true;
      if (!c.isPlayer && !c.dead && c.type !== 'mate' && c.type !== 'epic') {
        const P = S.player; if (Math.hypot(c.x - P.x, c.z - P.z) > S.halfDiag * 2.6) remove = true;
      }
      if (remove) { c.dead = true; c.gone = true; disposeRig(c); S.cells.splice(i, 1); }
    }
  }

  // ================================================================== combat
  function mouthOf(c, out) {
    out.x = c.x + Math.sin(c.h) * c.r * 0.78; out.z = c.z + Math.cos(c.h) * c.r * 0.78; return out;
  }
  const _m = { x: 0, z: 0 };

  function hurt(t, dmg, src, o) {
    if (t.dead || t.rise > 0.3) return false;
    if (t.isPlayer && (t.invuln > 0 || S.ending)) return false;
    o = o || {};
    t.hp -= dmg; t.lastHit = src; t.lastHitT = S.time;
    if (!t.tinted) { t.rig.setTint(0xff3355); t.tinted = true; }
    t.tintT = 0.14;
    if (t.act !== 'die') setAction(t, 'hurt');
    if (o.kx !== undefined) { t.vx += o.kx; t.vz += o.kz; }
    burstP(t.x, t.z, t.isPlayer ? 0xf43f5e : 0xffe4e6, 6, 0.9 * Math.max(0.6, t.k * 0.6));
    if (src && src.isPlayer && t !== src && !t.isPlayer) t.grudge = 7;
    if ((t.isPlayer || (src && src.isPlayer)) && S.popT <= 0) {
      S.popT = 0.12; TMP.set(t.x, 0.5 + t.k * 1.1, t.z); SP.ui.popup(TMP, S.camera, '-' + Math.max(1, Math.round(dmg)), t.isPlayer ? 'pop-red' : 'pop-white');
    }
    if (S.sfxT <= 0) { S.sfxT = 0.08; sfx(t.isPlayer ? 'hurt' : 'hit', { pitch: clamp(1.3 - t.k * 0.12, 0.6, 1.4) }); }
    if (t.isPlayer) {
      S.shake = Math.max(S.shake, 0.4 * Math.min(2, 0.5 + t.k * 0.2)); S.sinceHurt = 0;
      if (S.vig) { S.vig.classList.remove('hurt'); void S.vig.offsetWidth; S.vig.classList.add('hurt'); }
    }
    if (t.hp <= 0) die(t, src);
    return true;
  }
  function impulse(from, to, force) {
    const dx = to.x - from.x, dz = to.z - from.z, d = Math.hypot(dx, dz) || 1;
    const f = force / Math.max(0.4, to.mass);
    return { kx: dx / d * f, kz: dz / d * f };
  }

  function die(c, src) {
    if (c.dead) return;
    c.dead = true; c.deadT = 0; c.hp = 0; c.thr = 0; c.act = 'die'; c.actT = 0;
    const credit = src && src.isPlayer;
    if (c.isPlayer) { playerDied(); return; }
    sfx('die', { pitch: clamp(1.4 - c.k * 0.15, 0.6, 1.3) });
    burstP(c.x, c.z, c.rig.design.colors.base, 14, 1.4);
    ring(c.x, c.z, 0xffffff, c.r * 2.2, 0.5);
    const P = S.player, rho = c.r / P.r;
    // meat drops
    const n = clamp(Math.round(1.4 + rho * 2.2), 1, 7), val = clamp(1 + Math.floor(rho * 2.4), 1, 4);
    if (c.type !== 'mate') for (let i = 0; i < n; i++) {
      const a = rnd() * TAU, sp = 1.2 + rnd() * 2.5;
      food.add('meat', c.x + Math.cos(a) * c.r * 0.4, c.z + Math.sin(a) * c.r * 0.4, { val: val, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, life: 45 });
    }
    // part drop
    if (c.partDrop && (credit || rnd() < 0.35)) {
      const a = rnd() * TAU;
      addPickup('part', c.x, c.z, { id: c.partDrop, vx: Math.cos(a) * 1.5, vz: Math.sin(a) * 1.5 });
    }
    if (credit) {
      S.kills++;
      const bonus = 5 + 7 * clamp((rho - 0.4) / 1.4, 0, 1);
      addProgress(Math.round(bonus), c.x, c.z, 'kill');
      if (c.type === 'epic') { toast('You felled the epic cell!', '👑', 3000); addPickup('shard', c.x, c.z, {}); }
    }
  }

  // damage routines ----------------------------------------------------
  function bite(c, t) {
    if (c.biteCd > 0 || c.dead) return false;
    c.biteCd = c.isPlayer ? 0.55 : 1.15;
    setAction(c, 'bite');
    const dmg = (3.5 + 4 * Math.max(1, c.bite)) * c.k * c.k * (c.type === 'epic' ? 1.4 : 1);
    sfx('crunch', { pitch: clamp(1.25 - c.k * 0.1, 0.65, 1.3), vol: c.isPlayer ? 1 : 0.7 });
    const imp = impulse(c, t, c.mass * 2.5);
    hurt(t, dmg, c, imp);
    return true;
  }
  function tryBite(c) {
    if (c.bite <= 0) return false;
    mouthOf(c, _m);
    let best = null, bd = 1e9;
    for (let i = 0; i < S.cells.length; i++) {
      const t = S.cells[i]; if (t === c || t.dead || t.type === 'mate' || t.rise > 0.3) continue;
      const d = Math.hypot(t.x - _m.x, t.z - _m.z) - t.r;
      if (d < c.r * 1.2 && d < bd) { bd = d; best = t; }
    }
    if (best) return bite(c, best);
    return false;
  }
  function doZap(c) {
    if (c.zapCd > 0 || c.zap <= 0 || c.dead) return false;
    c.zapCd = c.isPlayer ? 3.6 : 2.8;
    setAction(c, 'strike');
    const R = c.r * 3.4 + 1.5 * c.k, dmg = (4.5 + 3 * c.zap) * c.k * c.k;
    sfx('laser', { pitch: clamp(1.2 - c.k * 0.1, 0.6, 1.2) });
    ring(c.x, c.z, 0xfde047, R, 0.45);
    let hit = 0;
    for (let i = 0; i < S.cells.length; i++) {
      const t = S.cells[i]; if (t === c || t.dead || t.type === 'mate' || t.rise > 0.3) continue;
      if (!c.isPlayer && !t.isPlayer && !(c.target === t)) continue;      // NPCs only zap the player or their own prey
      const d = Math.hypot(t.x - c.x, t.z - c.z);
      if (d < R + t.r) { zapBolt(c.x, c.z, t.x, t.z, c.isPlayer); hurt(t, dmg, c, impulse(c, t, c.mass * 3)); t.stunned = 0.5; hit++; }
    }
    if (!hit) for (let i = 0; i < 4; i++) { const a = rnd() * TAU; zapBolt(c.x, c.z, c.x + Math.cos(a) * R * 0.8, c.z + Math.sin(a) * R * 0.8); }
    return true;
  }
  function dropPoison(c, big) {
    if (c.poisonCd > 0 || c.dead || S.clouds.length >= 44) return false;
    c.poisonCd = c.isPlayer ? 5 : 0.9;
    const bx = c.x - Math.sin(c.h) * c.r * 0.9, bz = c.z - Math.cos(c.h) * c.r * 0.9;
    S.clouds.push({ x: bx, z: bz, r: c.r * (big ? 2.4 : 1.4), age: 0, life: big ? 6 : 4, owner: c, dps: (big ? 3.2 : 2.2) * c.k * c.k, ph: rnd() * 6, tick: 0 });
    if (c.isPlayer) { setAction(c, 'spit'); sfx('spit'); }
    return true;
  }
  function cloudsUpdate(dt) {
    for (let i = S.clouds.length - 1; i >= 0; i--) {
      const q = S.clouds[i]; q.age += dt; q.tick -= dt;
      if (q.age >= q.life) { S.clouds.splice(i, 1); continue; }
      if (q.tick <= 0) {
        q.tick = 0.35;
        for (let j = 0; j < S.cells.length; j++) {
          const t = S.cells[j]; if (t.dead || t === q.owner || t.type === 'mate' || t.rise > 0.3) continue;
          if (t.poison > 0 && !t.isPlayer && q.owner && !q.owner.isPlayer) continue;     // poisoners are immune to each other
          if (Math.hypot(t.x - q.x, t.z - q.z) < q.r + t.r * 0.5) {
            if (!q.owner || q.owner.isPlayer || t.isPlayer || t.grudge >= 0) hurt(t, q.dps * 0.35 * (t.isPlayer ? 1 : 1), q.owner, {});
            if (t.isPlayer) S.shake = Math.max(S.shake, 0.1);
            if (t.type !== 'epic') { t.vx *= 0.9; t.vz *= 0.9; }
          }
        }
      }
    }
  }

  function burst(c) {
    if (c.burstCd > 0 || c.dead || c.rise > 0.3) return false;
    const b = c.burstLv || 0;
    c.burstT = 0.34 + 0.09 * b; c.burstMul = 2.1 + 0.3 * b; c.burstCd = Math.max(0.9, 2.6 - 0.4 * b) * (c.isPlayer ? 1 : 1.6);
    const imp = c.topSpeed * (0.9 + 0.2 * b);
    c.vx += Math.sin(c.h) * imp; c.vz += Math.cos(c.h) * imp;
    c.thr = 1;
    ring(c.x - Math.sin(c.h) * c.r, c.z - Math.cos(c.h) * c.r, 0xbaf7ff, c.r * 2.6, 0.45, 1);
    burstP(c.x - Math.sin(c.h) * c.r, c.z - Math.cos(c.h) * c.r, 0xd7f9ff, 8, 0.7);
    if (c.isPlayer || c.inView) sfx('splash', { pitch: 1.1 });
    return true;
  }

  function collisions(dt) {
    const cs = S.cells, P = S.player;
    for (let i = 0; i < cs.length; i++) {
      const a = cs[i]; if (a.dead || a.rise > 0.3) continue;
      for (let j = i + 1; j < cs.length; j++) {
        const b = cs[j]; if (b.dead || b.rise > 0.3) continue;
        const dx = b.x - a.x, dz = b.z - a.z, rr = a.r + b.r;
        if (Math.abs(dx) > rr || Math.abs(dz) > rr) continue;
        const d = Math.hypot(dx, dz) || 1e-3, minD = rr * 0.74;
        if (d >= minD) continue;
        const nx = dx / d, nz = dz / d, ov = minD - d, wa = b.mass / (a.mass + b.mass), wb = 1 - wa;
        const mateTouch = (a.type === 'mate' && b.isPlayer) || (b.type === 'mate' && a.isPlayer);
        if (mateTouch) { onMateTouch(); continue; }
        if (a.type === 'mate' || b.type === 'mate') continue;
        a.x -= nx * ov * wa * 0.55; a.z -= nz * ov * wa * 0.55; b.x += nx * ov * wb * 0.55; b.z += nz * ov * wb * 0.55;
        const rv = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
        if (rv > 0) { const jv = rv * 1.05; a.vx -= nx * jv * wa; a.vz -= nz * jv * wa; b.vx += nx * jv * wb; b.vz += nz * jv * wb; }
        // damage only involves the player (NPC vs NPC fights are AI driven: bites, zaps, clouds)
        const pa = a.isPlayer ? a : b.isPlayer ? b : null;
        if (!pa) continue;
        const o = pa === a ? b : a, nxp = pa === a ? nx : -nx, nzp = pa === a ? nz : -nz;   // normal pointing from player to other
        // player ram
        const sP = pa.vx * nxp + pa.vz * nzp;
        if (pa.ramCd <= 0 && (sP > pa.topSpeed * 0.5 || pa.burstT > 0) && sP > 0.5) {
          pa.ramCd = 0.55;
          const dmg = pa.ramDmg * clamp(sP / pa.topSpeed, 0.3, 1.5) * pa.k * pa.k * 0.9 + (pa.burstT > 0 ? 1.5 * pa.k * pa.k : 0);
          if (hurt(o, dmg, pa, impulse(pa, o, pa.mass * 3))) { sfx('hit'); }
        }
        // thorns, both ways
        if (pa.spike > 0 && pa.thornCd <= 0) { pa.thornCd = 0.5; hurt(o, (2.5 + 2.5 * pa.spike) * pa.k * pa.k, pa, impulse(pa, o, pa.mass * 2)); }
        if (o.spike > 0 && o.thornCd <= 0) {
          o.thornCd = 0.55; hurt(pa, (2 + 3 * Math.min(3, o.spike)) * o.k * o.k, o, impulse(o, pa, o.mass * 2));
        }
        // aggressive NPC ram
        if (!o.dead && (o.ai.state === 'chase' || o.type === 'epic' || o.ai.state === 'lunge') && o.ramCd <= 0) {
          const sO = -(o.vx * nxp + o.vz * nzp);
          if (sO > o.topSpeed * 0.5) { o.ramCd = 0.8; hurt(pa, o.ramDmg * 0.55 * o.k * o.k, o, impulse(o, pa, o.mass * 2)); }
        }
      }
    }
  }

  // ================================================================== NPC AI
  function nearestFood(list, x, z, maxD) {
    let best = null, bd = maxD * maxD;
    for (let i = 0; i < list.length; i++) { const f = list[i], dx = f.x - x, dz = f.z - z, d = dx * dx + dz * dz; if (d < bd) { bd = d; best = f; } }
    return best;
  }
  function steer(c, tx, tz, thr) {
    const dx = tx - c.x, dz = tz - c.z, d = Math.hypot(dx, dz) || 1;
    c.dirX = dx / d; c.dirZ = dz / d; c.thr = thr;
  }
  function flee(c, fx, fz, thr) {
    const dx = c.x - fx, dz = c.z - fz, d = Math.hypot(dx, dz) || 1;
    // curve away from the pool wall
    let ex = dx / d, ez = dz / d;
    const rr = Math.hypot(c.x, c.z);
    if (rr > POOL_R - 18) { ex -= c.x / rr * 0.9; ez -= c.z / rr * 0.9; const l = Math.hypot(ex, ez) || 1; ex /= l; ez /= l; }
    c.dirX = ex; c.dirZ = ez; c.thr = thr;
  }
  function wander(c, dt, thr) {
    const ai = c.ai; ai.wanderT -= dt;
    if (ai.wanderT <= 0 || Math.hypot(ai.wx - c.x, ai.wz - c.z) < c.r * 1.5) {
      ai.wanderT = 3 + rnd() * 4; const a = rnd() * TAU, d = c.r * (6 + rnd() * 10);
      ai.wx = c.x + Math.cos(a) * d; ai.wz = c.z + Math.sin(a) * d;
      const rr = Math.hypot(ai.wx, ai.wz); if (rr > POOL_R - 12) { ai.wx *= (POOL_R - 12) / rr; ai.wz *= (POOL_R - 12) / rr; }
    }
    steer(c, ai.wx, ai.wz, thr);
  }
  function eatFoodNpc(c, f, list, heal) {
    const i = list.indexOf(f); if (i >= 0) { list[i] = list[list.length - 1]; list.pop(); }
    c.hp = Math.min(c.hpMax, c.hp + c.hpMax * heal); setAction(c, 'eat');
    if (c.inView) burstP(f.x, f.z, list === food.meats ? 0xfb7185 : 0x86efac, 4, 0.6, 0.14 * S.fs);
  }

  function aiUpdate(c, dt) {
    const P = S.player, ai = c.ai;
    if (c.rise > 0.25) { c.thr = 0; return; }
    if (c.stunned) { c.thr = 0; return; }
    const pr = P.r, rho = c.r / pr;
    c.plank = c.type !== 'epic' && c.r < pr * 0.3;
    c.rho = rho;
    const perc = Math.max(7, c.r * 9);
    const pd = Math.hypot(P.x - c.x, P.z - c.z);
    const playerPred = !P.dead && (P.diet !== 'herbivore' || P.spike > 0.5 || P.zap > 0 || P.poison > 0);

    // plankton cells just drift, nibble and panic a little
    if (c.plank) {
      if (pd < P.r * 5 && playerPred) flee(c, P.x, P.z, 0.9); else wander(c, dt, 0.35);
      return;
    }
    // ---- threat scan
    let threat = null, td = 1e9;
    if (c.type !== 'turtle' && c.type !== 'epic') {
      for (let i = 0; i < S.cells.length; i++) {
        const t = S.cells[i]; if (t === c || t.dead || t.type === 'mate' || t.rise > 0.3) continue;
        const pred = t.isPlayer ? playerPred : (t.type === 'hunter' || t.type === 'epic' || t.type === 'electric');
        if (!pred) continue;
        if (c.type === 'hunter' && !t.isPlayer && t.type !== 'epic') continue;
        if (t.r < c.r * (t.isPlayer ? 1.15 : 1.05) && !(t.type === 'epic')) continue;
        const d = Math.hypot(t.x - c.x, t.z - c.z) - t.r;
        if (d < Math.max(5, t.r * 4.5) && d < td) { td = d; threat = t; }
      }
    }
    if (threat) {
      ai.state = 'flee'; ai.fleeT = 1.4;
      flee(c, threat.x, threat.z, 1);
      if (td < threat.r * 2.2 && c.burstCd <= 0) burst(c);
      if (c.type === 'poisoner') dropPoison(c, false);
      if (c.type === 'electric' && td < c.r * 3) { c.target = threat; doZap(c); }
      return;
    }
    if (ai.fleeT > 0) { ai.fleeT -= dt; }

    switch (c.type) {
      case 'turtle': case 'grazer': case 'prey': return grazerAi(c, dt, perc);
      case 'poisoner':
        if (c.thr > 0.2 && S.frame % 7 === 0) dropPoison(c, false);
        return grazerAi(c, dt, perc);
      case 'hunter': case 'electric': return hunterAi(c, dt, perc, pd, playerPred);
      case 'epic': return epicAi(c, dt, perc, pd);
      default: return grazerAi(c, dt, perc);
    }
  }
  function grazerAi(c, dt, perc) {
    const ai = c.ai;
    ai.cd -= dt;
    if (!ai.tgt || ai.tgt.gone) {
      if (ai.cd <= 0) {
        ai.cd = 0.35;
        const list = c.type === 'poisoner' && rnd() < 0.4 ? food.meats : food.plants;
        ai.tgt = nearestFood(list, c.x, c.z, perc); ai.tlist = list;
      }
    }
    if (ai.tgt) {
      const f = ai.tgt, list = ai.tlist;
      if (list.indexOf(f) < 0) { ai.tgt = null; return wander(c, dt, 0.35); }
      steer(c, f.x, f.z, 0.55);
      mouthOf(c, _m);
      if (Math.hypot(f.x - _m.x, f.z - _m.z) < c.r * 0.7 + f.r) { eatFoodNpc(c, f, list, 0.06); ai.tgt = null; ai.cd = 0.6; }
    } else wander(c, dt, c.type === 'turtle' ? 0.5 : 0.35);
  }
  function hunterAi(c, dt, perc, pd, playerPred) {
    const P = S.player, ai = c.ai;
    ai.cd -= dt;
    // pick a quarry
    if (ai.cd <= 0) {
      ai.cd = 0.3; let best = null, bd = 1e9;
      const maxR = c.r * 1.0;
      if (!P.dead && P.invuln <= 0 && !S.ending && (P.r < c.r * 1.12 || c.grudge > 0) && pd < perc * 1.4) { best = P; bd = pd; }
      for (let i = 0; i < S.cells.length; i++) {
        const t = S.cells[i]; if (t === c || t.dead || t.isPlayer || t.type === 'mate' || t.rise > 0.3 || t.type === 'turtle' || t.type === 'epic' || t.type === 'hunter') continue;
        if (t.r > maxR * 0.85) continue;
        const d = Math.hypot(t.x - c.x, t.z - c.z);
        if (d < perc && d < bd * 0.8) { bd = d; best = t; }
      }
      c.target = best;
      ai.meat = !best ? nearestFood(food.meats, c.x, c.z, perc) : null;
    }
    const t = c.target;
    if (t && !t.dead) {
      ai.state = 'chase';
      mouthOf(c, _m);
      const dist = Math.hypot(t.x - _m.x, t.z - _m.z);
      steer(c, t.x + (t.vx || 0) * 0.25, t.z + (t.vz || 0) * 0.25, 1);
      if (dist < c.r * 4 && c.burstCd <= 0 && t.r < c.r) burst(c);
      if (c.type === 'electric') {
        if (Math.hypot(t.x - c.x, t.z - c.z) < c.r * 3 + t.r && c.zapCd <= 0) doZap(c);
      } else if (dist < c.r * 0.55 + t.r * 0.8) bite(c, t);
      if (t.isPlayer && P.dead) c.target = null;
      return;
    }
    ai.state = 'wander';
    const m = ai.meat;
    if (m && food.meats.indexOf(m) >= 0) {
      steer(c, m.x, m.z, 0.6); mouthOf(c, _m);
      if (Math.hypot(m.x - _m.x, m.z - _m.z) < c.r * 0.7 + m.r) { eatFoodNpc(c, m, food.meats, 0.12); ai.meat = null; }
    } else wander(c, dt, 0.4);
    if (c.type === 'electric') {   // electric cells also graze lazily
      const pl = nearestFood(food.planks, c.x, c.z, perc * 0.5);
      if (pl) { steer(c, pl.x, pl.z, 0.4); mouthOf(c, _m); if (Math.hypot(pl.x - _m.x, pl.z - _m.z) < c.r * 0.7) eatFoodNpc(c, pl, food.planks, 0.02); }
    }
  }
  function epicAi(c, dt, perc, pd) {
    const P = S.player, ai = c.ai;
    ai.t -= dt;
    switch (ai.state) {
      case 'lunge': {
        steer(c, ai.lx, ai.lz, 1);
        c.burstT = Math.max(c.burstT, 0.1); c.burstMul = 2.8;
        for (let i = 0; i < S.cells.length; i++) {
          const t = S.cells[i]; if (t === c || t.dead || t.type === 'mate' || t.rise > 0.3) continue;
          if (t.type === 'epic') continue;
          if (Math.hypot(t.x - c.x, t.z - c.z) < c.r * 0.85 + t.r * 0.6) {
            if (t.isPlayer) { if (c.biteCd <= 0) { c.biteCd = 1.2; setAction(c, 'bite'); hurt(t, Math.max(40, t.hpMax * 0.5), c, impulse(c, t, c.mass * 4)); sfx('crunch', { pitch: 0.55 }); } }
            else if (t.r < c.r * 0.7) { hurt(t, t.hpMax * 2, c, {}); }
          }
        }
        if (ai.t <= 0 || Math.hypot(ai.lx - c.x, ai.lz - c.z) < c.r) { ai.state = 'recover'; ai.t = 1.8; }
        return;
      }
      case 'telegraph': {
        c.thr = 0; c.vx *= 0.9; c.vz *= 0.9;
        const tg = ai.tg;
        if (tg) { tg.t += dt; }
        if (ai.t <= 0) { ai.state = 'lunge'; ai.t = 1.3; if (tg) tg.done = true; sfx('charge', { pitch: 0.55 }); ring(c.x, c.z, 0xf43f5e, c.r * 3, 0.6); }
        return;
      }
      case 'recover': c.thr = 0.15; if (ai.t <= 0) { ai.state = 'roam'; ai.t = 2 + rnd() * 2; } return;
      default: {
        // roam, then pick a quarry and wind up
        wander(c, dt, 0.4);
        if (ai.t <= 0 && pd < Math.max(perc * 1.6, 30) && !P.dead && P.invuln <= 0) {
          ai.state = 'telegraph'; ai.t = 1.6;
          const lead = clamp(pd / (c.topSpeed * 2.4), 0, 1.2);
          ai.lx = P.x + P.vx * lead * 0.5; ai.lz = P.z + P.vz * lead * 0.5;
          c.h = Math.atan2(ai.lx - c.x, ai.lz - c.z);
          ai.tg = { x: ai.lx, z: ai.lz, r: c.r * 1.6, t: 0, life: 1.6, done: false, owner: c };
          S.telegraphs.push(ai.tg);
          sfx('alarm', { pitch: 0.6, vol: 0.8 });
          if (S.sfxT <= 0) toast('Something huge is stirring...', '👁', 1800);
        } else if (ai.t <= 0) ai.t = 1.2;
      }
    }
  }
  function telegraphUpdate(dt) {
    for (let i = S.telegraphs.length - 1; i >= 0; i--) {
      const tg = S.telegraphs[i];
      if (tg.done || tg.owner.dead) { if (tg.mesh) { S.scene.remove(tg.mesh); tg.mesh.material.dispose(); } S.telegraphs.splice(i, 1); continue; }
      if (!tg.mesh) {
        tg.mesh = new THREE.Mesh(S.fx.shadowGeo, new THREE.MeshBasicMaterial({ color: 0x1a0008, transparent: true, opacity: 0.5, depthWrite: false }));
        tg.mesh.position.set(tg.x, 0.06, tg.z); tg.mesh.frustumCulled = false; tg.mesh.renderOrder = -1; S.scene.add(tg.mesh);
      }
      const u = clamp(tg.t / tg.life, 0, 1);
      tg.mesh.scale.setScalar(tg.r * (0.25 + 0.75 * u));
      tg.mesh.material.color.setHex(Math.floor(S.time * 8) % 2 ? 0x4c0519 : 0x1a0008);
      tg.mesh.material.opacity = 0.25 + 0.4 * u;
    }
  }

  // ================================================================== NPC population
  function pickNpcType() {
    const L = S.level, rng = S.rng;
    const cs = S.cells;
    let hunters = 0, epics = 0, total = 0;
    for (let i = 0; i < cs.length; i++) { if (cs[i].dead || cs[i].isPlayer || cs[i].type === 'mate') continue; total++; if (cs[i].type === 'hunter') hunters++; if (cs[i].type === 'epic') epics++; }
    const w = [
      ['prey', 2.2], ['grazer', 3.4], ['hunter', hunters < 2 + L ? 1.2 + 0.4 * L : 0], ['turtle', 1.0],
      ['electric', L >= 1 ? 0.9 : 0.12], ['poisoner', L >= 1 ? 0.9 : 0.25], ['epic', L >= 2 && !epics && rng.chance(0.3) ? 0.35 : 0]
    ];
    let sum = 0; w.forEach((x) => { sum += x[1]; });
    let r = rng.next() * sum;
    for (let i = 0; i < w.length; i++) { r -= w[i][1]; if (r <= 0) return w[i][0]; }
    return 'grazer';
  }
  function rhoFor(type) {
    const rng = S.rng, L = S.level;
    switch (type) {
      case 'prey': return rng.range(0.15, 0.28);
      case 'grazer': return rng.range(0.38, 1.15);
      case 'hunter': return L === 0 ? rng.range(0.7, 1.25) : rng.range(0.85, 1.6);
      case 'turtle': return rng.range(0.7, 1.35);
      case 'electric': return rng.range(0.8, 1.45);
      case 'poisoner': return rng.range(0.7, 1.25);
      case 'epic': return rng.range(3.3, 4.0);
      default: return 1;
    }
  }
  function lockedPart() {
    const owned = new Set(S.campaign.unlocked.concat(SP.parts.defaultUnlocked ? SP.parts.defaultUnlocked('cell') : []));
    return SP.parts.list.filter((p) => p.kind === 'cell' && !owned.has(p.id));
  }
  function spawnNpc(initial, forceType, forceRho, rise) {
    const P = S.player;
    if (S.cells.length >= MAX_NPC + 2) return null;
    const type = forceType || pickNpcType(), rho = forceRho || rhoFor(type);
    const a = rnd() * TAU, hd = S.halfDiag;
    const d = initial ? hd * (0.45 + rnd() * 1.0) : hd * (1.12 + rnd() * 0.4);
    let x = P.x + Math.cos(a) * d, z = P.z + Math.sin(a) * d;
    const rr = Math.hypot(x, z), lim = POOL_R - 14;
    if (rr > lim) { x *= lim / rr; z *= lim / rr; }
    if (initial && Math.hypot(x - P.x, z - P.z) < P.r * 5) { x += P.r * 7; }
    const design = designFor(S, type, rho);
    // maybe carry a part the player doesn't have
    let partDrop = null;
    const locked = lockedPart();
    if (locked.length) {
      const mine = design.parts.map((p) => p.id).filter((id) => locked.some((l) => l.id === id));
      if (mine.length && S.rng.chance(0.85)) partDrop = S.rng.pick(mine);
      else if (type === 'epic') partDrop = S.rng.pick(locked).id;
    }
    return spawnCell({ type: type, x: x, z: z, rho: rho, design: design, partDrop: partDrop, rise: rise ? 1 : (type === 'epic' ? 1 : 0), h: Math.atan2(P.x - x, P.z - z) + (rnd() - 0.5) * 2 });
  }
  function popControl(dt) {
    S.spawnT -= dt;
    if (S.spawnT > 0 || S.ending) return;
    S.spawnT = 0.4;
    let n = 0; const P = S.player;
    for (let i = 0; i < S.cells.length; i++) { const c = S.cells[i]; if (!c.isPlayer && !c.dead && c.type !== 'mate') n++; }
    const want = Math.min(MAX_NPC, 16 + S.level * 3);
    if (n < want) spawnNpc(false);
    // shards
    S.shardT -= dt * 0.4;
    if (S.shardT <= 0) {
      S.shardT = 40 + rnd() * 25;
      const sh = S.pickups.filter((p) => p.kind === 'shard').length;
      if (sh < 2) { const a = rnd() * TAU, d = S.halfDiag * (0.9 + rnd() * 0.9); addPickup('shard', P.x + Math.cos(a) * d, P.z + Math.sin(a) * d, {}); toast('A meteor shard glimmers nearby!', '✨', 2200); }
    }
  }

  // ================================================================== pickups: meteor shards and golden shields
  function crystalGeo() { // faceted hexagonal crystal (non-indexed -> flat facets)
    if (S._crystalGeo) return S._crystalGeo;
    const pts = [[0, -1], [0.42, -0.5], [0.46, 0.35], [0, 1]].map((q) => new THREE.Vector2(q[0], q[1]));
    const g = new THREE.LatheGeometry(pts, 6).toNonIndexed(); g.computeVertexNormals(); g.userData.shared = true;
    return (S._crystalGeo = g);
  }
  function addPickup(kind, x, z, o) {
    const rr = Math.hypot(x, z), lim = POOL_R - 6; if (rr > lim) { x *= lim / rr; z *= lim / rr; }
    const R = SP.render, fs = S.fs, g = new THREE.Group();
    const p = { kind: kind, x: x, z: z, vx: o.vx || 0, vz: o.vz || 0, id: o.id || null, age: 0, ph: rnd() * 6, g: g, r: 0.95 * fs };
    if (kind === 'shard') {
      // meteor shard: a faceted, glowing crystal cluster
      const gm = R.toonRim(0xf5b81c, { rim: 0xfff7c2, rimStrength: 0.7, rimAt: 0.5, spec: 1, emissive: 0xf59e0b, emissiveIntensity: 0.55 });
      const gm2 = R.toonRim(0xfde68a, { rim: 0xffffff, rimStrength: 0.6, rimAt: 0.5, spec: 1, emissive: 0xfbbf24, emissiveIntensity: 0.6 });
      const mk = (mat, sx, sy, px, pz, rx, rz, ry) => {
        const m = new THREE.Mesh(crystalGeo(), mat); m.scale.set(sx, sy, sx); m.position.set(px, sy * 0.8, pz); m.rotation.set(rx, ry || 0, rz); g.add(m);
        const ol = new THREE.Mesh(crystalGeo(), R.outlineMaterial()); ol.scale.setScalar(1.09); m.add(ol); return m;
      };
      mk(gm, 0.5, 0.95, 0, 0, 0.0, 0.0);
      mk(gm2, 0.3, 0.62, 0.5, -0.1, 0.1, -0.7, 0.4);
      mk(gm, 0.26, 0.5, -0.45, 0.2, -0.2, 0.75, 1.1);
      mk(gm2, 0.2, 0.4, 0.05, 0.5, -0.9, 0.1, 0.2);
      p.glow = new THREE.Mesh(S.fx.haloGeo, new THREE.MeshBasicMaterial({ map: S.dotMap, color: 0xfde047, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      p.glow.material.userData.own = true; p.glow.scale.setScalar(3.2); p.glow.position.y = -0.1; g.add(p.glow);
      p.rise = 1.0;
    } else {
      const sh = new THREE.Shape();
      sh.moveTo(-0.75, 0.8); sh.lineTo(0.75, 0.8); sh.lineTo(0.75, 0.05); sh.bezierCurveTo(0.75, -0.55, 0.3, -0.85, 0, -1.05);
      sh.bezierCurveTo(-0.3, -0.85, -0.75, -0.55, -0.75, 0.05); sh.lineTo(-0.75, 0.8);
      const eg = new THREE.ExtrudeGeometry(sh, { depth: 0.28, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 2 });
      eg.rotateX(-Math.PI / 2); eg.translate(0, -0.1, 0);
      const tg = new THREE.Group(); tg.rotation.x = Math.PI / 2 - S.cam.pitch; g.add(tg);   // tilt the badge to face the camera
      const shield = R.cel(eg, 0xfbbf24, { outline: 0.06, cast: false, receive: false, emissive: 0xb45309, emissiveIntensity: 0.45 });
      tg.add(shield);
      const def = SP.parts.get(p.id);
      const tex = emojiTex(def ? def.icon : '?'); S.texs.push(tex);
      const ic = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 1.15), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
      ic.material.userData.own = true; ic.rotation.x = -Math.PI / 2; ic.position.y = 0.46; tg.add(ic);
      p.glow = new THREE.Mesh(S.fx.haloGeo, new THREE.MeshBasicMaterial({ map: S.dotMap, color: 0xfbbf24, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      p.glow.material.userData.own = true; p.glow.scale.setScalar(2.6); p.glow.position.y = -0.1; g.add(p.glow);
      p.rise = 0.95;
    }
    g.scale.setScalar(fs * (kind === 'shard' ? 0.95 : 0.66)); g.position.set(x, p.rise * fs, z);
    S.scene.add(g); S.pickups.push(p);
    sfx('coin', { pitch: 0.9, vol: 0.6 });
    return p;
  }
  function pickupsUpdate(dt) {
    const P = S.player;
    for (let i = S.pickups.length - 1; i >= 0; i--) {
      const p = S.pickups[i]; p.age += dt;
      p.vx *= Math.exp(-1.5 * dt); p.vz *= Math.exp(-1.5 * dt);
      p.x += (p.vx + S.cur.x * 0.3) * dt; p.z += (p.vz + S.cur.z * 0.3) * dt;
      p.g.position.set(p.x, (p.rise + Math.sin(S.time * 2 + p.ph) * 0.15) * S.fs, p.z);
      if (p.kind === 'shard') { p.g.rotation.y = S.time * 0.9 + p.ph; p.glow.material.opacity = 0.3 + 0.18 * Math.sin(S.time * 4 + p.ph); if (rnd() < dt * 3) burstP(p.x + (rnd() - 0.5) * 2, p.z + (rnd() - 0.5) * 2, 0xfef08a, 1, 0.3, 0.12 * S.fs); }
      else { p.g.rotation.y = Math.sin(S.time * 1.4 + p.ph) * 0.45; p.glow.material.opacity = 0.3 + 0.15 * Math.sin(S.time * 3 + p.ph); }
      let take = false;
      if (!P.dead && Math.hypot(P.x - p.x, P.z - p.z) < P.r * 0.95 + p.r) take = true;
      const far = Math.hypot(P.x - p.x, P.z - p.z) > S.halfDiag * 3.2 || p.age > 150;
      if (take) { collectPickup(p); }
      if (take || far) { S.scene.remove(p.g); p.g.traverse((o) => { if (o.geometry && o.geometry !== S.fx.haloGeo && !o.geometry.userData.shared) o.geometry.dispose(); }); S.pickups.splice(i, 1); }
    }
  }
  function collectPickup(p) {
    const P = S.player, owned = S.campaign.unlocked;
    let id = p.id;
    if (p.kind === 'shard') { const l = lockedPart(); id = l.length ? S.rng.pick(l).id : null; }
    const def = id ? SP.parts.get(id) : null;
    sfx('levelup', { pitch: 1.2 });
    ring(p.x, p.z, 0xfde047, P.r * 4, 0.7);
    burstP(p.x, p.z, 0xfde047, 16, 1.5);
    S.shake = Math.max(S.shake, 0.15);
    if (def && owned.indexOf(id) < 0) {
      owned.push(id); S.partsFound++;
      toast('New cell part: ' + def.name + ' ' + def.icon + '  (open the editor with C)', '🧩', 3800);
      addProgress(4, p.x, p.z, 'part');
    } else addProgress(6, p.x, p.z, 'part');
  }

  // ================================================================== player control
  function controlPlayer(dt) {
    const P = S.player, I = SP.input;
    if (!P) return;
    if (P.dead) {
      S.respawnT -= dt;
      if (S.respawnT <= 0 && !S.respawned) playerRespawn();
      P.thr = 0; return;
    }
    if (S.editing) { P.thr = 0; return; }
    // zoom
    if (I.mouse.wheel && !I.pointerOverUI()) S.zoomMul = clamp(S.zoomMul * Math.pow(1.1, I.mouse.wheel), 0.6, 2.0);
    if (I.isDown('Equal') || I.isDown('NumpadAdd')) S.zoomMul = clamp(S.zoomMul * Math.pow(0.5, dt), 0.6, 2.0);
    if (I.isDown('Minus') || I.isDown('NumpadSubtract')) S.zoomMul = clamp(S.zoomMul * Math.pow(2, dt), 0.6, 2.0);
    // steering
    const ax = I.axis();
    let thr = 0;
    if (ax.x || ax.y) {
      let dx = ax.x, dz = -ax.y; const l = Math.hypot(dx, dz); P.dirX = dx / l; P.dirZ = dz / l; thr = 1;
    } else if (I.mouse.left && !S.needRelease && !I.pointerOverUI()) {
      S.cam.pointerToWorld(TMP);
      const dx = TMP.x - P.x, dz = TMP.z - P.z, d = Math.hypot(dx, dz);
      if (d > P.r * 0.6) { P.dirX = dx / d; P.dirZ = dz / d; thr = clamp((d - P.r * 0.6) / (P.r * 3), 0.25, 1); }
      P.look = TMP.clone();
    }
    P.thr = thr;
    if (!I.mouse.left) { P.look = undefined; S.needRelease = false; }
    if (I.pressed('Space')) attack(P);
    if (I.pressed('KeyE')) special();
    if (I.pressed('KeyC')) callMate();
  }
  // Space: jet burst (if ready) and a bite if you own a jaw / proboscis
  function attack(P) {
    if (P.dead) return;
    burst(P);
    if (P.bite > 0) tryBite(P);
  }
  function special() {
    const P = S.player; if (P.dead || S.editing) return;
    if (P.zap <= 0 && P.poison <= 0) { toast('No special part yet: find an Electric Organ ⚡ or Poison Sac ☠', '🧩', 2200); return; }
    const useZap = P.zap > 0 && (P.poison <= 0 || !S.specialAlt);
    if (P.zap > 0 && P.poison > 0) S.specialAlt = !S.specialAlt;
    if (useZap) { if (P.zapCd > 0) return; doZap(P); } else { if (P.poisonCd > 0) return; dropPoison(P, true); }
  }
  function playerEat(dt) {
    const P = S.player; if (P.dead || P.rise > 0) return;
    const m = P.rig.mouth ? (P.rig.mouth.getWorldPosition(TMP), { x: TMP.x, z: TMP.z }) : mouthOf(P, { x: 0, z: 0 });
    const reach = P.r * 0.5, mag = P.r * 1.7;
    const tryList = (list, kind, ok) => {
      for (let i = list.length - 1; i >= 0; i--) {
        const f = list[i], dx = f.x - m.x, dz = f.z - m.z, d = Math.hypot(dx, dz);
        if (ok) {
          if (d < mag && d > 0.001) { const pull = (1 - d / mag) * 5.5 * dt; f.x -= dx * pull; f.z -= dz * pull; }
          if (d < reach + f.r || Math.hypot(f.x - P.x, f.z - P.z) < P.r * 0.4) { eatItem(list, i, kind, f); }
        } else if (Math.hypot(f.x - P.x, f.z - P.z) < P.r * 0.9 + f.r && S.wrongT <= 0 && kind !== 'plank') {
          S.wrongT = 3.5;
          TMP.set(f.x, 1.2, f.z);
          SP.ui.popup(TMP, S.camera, kind === 'plant' ? '🌿 needs a filter mouth' : '🍖 needs a jaw', 'pop-white');
        }
      }
    };
    tryList(food.plants, 'plant', P.canPlant);
    tryList(food.meats, 'meat', P.canMeat);
    tryList(food.planks, 'plank', true);
  }
  function eatItem(list, i, kind, f) {
    const P = S.player;
    list[i] = list[list.length - 1]; list.pop();
    setAction(P, 'eat');
    P.hp = Math.min(P.hpMax, P.hp + P.hpMax * (kind === 'meat' ? 0.1 : 0.05));
    burstP(f.x, f.z, kind === 'meat' ? 0xfb7185 : kind === 'plant' ? 0x86efac : 0xbff5ff, 5, 0.8);
    const amt = kind === 'meat' ? clamp(f.val + 1, 2, 4) : kind === 'plant' ? 1 : 0.5;
    if (kind === 'plant') { S.plantEaten++; S.timeline.push(0); }
    else if (kind === 'meat') { S.meatEaten++; S.timeline.push(1); }
    if (S.sfxT <= 0 || kind === 'meat') { S.sfxT = 0.05; sfx(kind === 'meat' ? 'crunch' : 'eat', { pitch: 0.9 + rnd() * 0.3, vol: 0.8 }); }
    addProgress(amt, f.x, f.z, kind);
    S.dietDirty = true;
  }

  // ================================================================== progress, DNA, levels
  function addProgress(amt, x, z, why) {
    if (S.ending) return;
    const c = S.campaign;
    // food (plants/plankton/meat) is scaled by level; kills, shards and parts are flat and therefore worth more later on
    const food = why === 'plant' || why === 'meat' || why === 'plank';
    const lv = Math.min(4, S.level);
    const prog = food ? amt * PROG_PER_ITEM[lv] * fastMul() : amt * fastMul();
    const dna = food ? amt * DNA_PER_ITEM[lv] * fastMul() : amt * 1.6 * fastMul();
    S.progress = Math.min(100, S.progress + prog);
    c.dna += dna; S.dnaEarned += dna;
    if (dna >= 1) { TMP.set(x, 1.6, z); SP.ui.popup(TMP, S.camera, '+' + (dna >= 10 ? Math.round(dna) : dna.toFixed(1).replace(/\.0$/, '')) + ' 🧬', why === 'kill' ? 'pop-gold' : 'pop-green'); }
    if (amt >= 2) sfx('dna', { vol: 0.7 });
    // 25% marks unlock "call a mate"
    const mark = Math.floor(S.progress / 25) * 25;
    if (mark > S.mateMark && mark < 100) { S.mateMark = mark; S.mateReadyMark = true; toast('Evolution ' + mark + '%! Press C to call a mate and upgrade your cell', '💕', 4200); }
    while (S.level < 4 && S.progress >= (S.level + 1) * PER_LEVEL) levelUp();
    if (S.progress >= 100) finish();
    S.hudDirty = true;
  }
  function levelUp() {
    S.level++;
    const P = S.player;
    P.kT = Math.pow(GROW, S.level);
    S.fs = Math.pow(GROW, S.level * 0.8);
    P.hp = P.hpMax;
    sfx('levelup');
    ring(P.x, P.z, 0xfde047, P.r * 7, 0.9, 4); ring(P.x, P.z, 0xffffff, P.r * 4.5, 0.6, 4.2);
    burstP(P.x, P.z, 0xfde047, 30, 2.4, 0.3 * S.fs); burstP(P.x, P.z, 0xf9a8d4, 16, 2, 0.25 * S.fs); burstP(P.x, P.z, 0x67e8f9, 16, 2, 0.25 * S.fs);
    S.shake = 0.45;
    SP.ui.banner('Level ' + (S.level + 1), 'Your cell grows bigger!', 2200);
    // previously dangerous cells shrink in relative terms automatically; bring a new, larger tier up from the depths
    const tiers = S.level >= 3 ? ['hunter', 'electric', 'turtle'] : ['hunter', 'turtle', 'poisoner'];
    for (let i = 0; i < 3; i++) {
      const type = tiers[i % tiers.length];
      spawnNpc(false, type, S.rng.range(1.9, 2.7), true);
    }
    toast('Bigger cells are rising from the deep...', '🌊', 3000);
  }
  function finish() {
    if (S.ending) return;
    S.ending = true; S.endT = 0;
    const P = S.player;
    P.hp = P.hpMax; P.invuln = 999;
    setAction(P, 'celebrate');
    toast('Ready to grow legs!', '🦶', 4500);
    SP.ui.banner('Ready to grow legs!', 'Your cell is ready to crawl out of the water', 3200);
    sfx('win');
    for (let i = 0; i < 4; i++) setTimeout(() => { if (S.scene && S.player) { burstP(S.player.x, S.player.z, [0xfde047, 0xf43f5e, 0x22d3ee, 0x84cc16][i], 20, 2.2, 0.28 * S.fs); ring(S.player.x, S.player.z, 0xffffff, S.player.r * (3 + i), 0.8, 4); } }, 250 * i);
  }

  // diet shares: earlier items weigh 1.5x
  function dietShare() {
    const tl = S.timeline, n = tl.length;
    if (!n) return { plant: 0.5, meat: 0.5, n: 0 };
    let wp = 0, wm = 0;
    for (let i = 0; i < n; i++) { const w = i < n / 2 ? 1.5 : 1; if (tl[i] === 0) wp += w; else wm += w; }
    return { plant: wp / (wp + wm), meat: wm / (wp + wm), n: n };
  }
  function dietCard() {
    const d = dietShare();
    if (!d.n) return S.player.st.diet === 'none' ? 'omnivore' : S.player.st.diet;
    return d.plant > 0.65 ? 'herbivore' : d.plant < 0.35 ? 'carnivore' : 'omnivore';
  }

  // ================================================================== death and respawn
  function playerDied() {
    const P = S.player;
    S.deaths++; S.respawned = false; S.respawnT = 2.2;
    sfx('die'); S.shake = 0.6;
    burstP(P.x, P.z, P.rig.design.colors.base, 22, 2);
    for (let i = 0; i < 3; i++) food.add('meat', P.x, P.z, { val: 1, vx: (rnd() - 0.5) * 4, vz: (rnd() - 0.5) * 4, life: 30 });
    const floor = S.level * PER_LEVEL;
    const lost = Math.min(2.5, Math.max(0, S.progress - floor));
    S.progress -= lost; S.campaign.dna = Math.max(0, S.campaign.dna - Math.round(lost));
    S.dnaEarned = Math.max(0, S.dnaEarned - Math.round(lost));      // A-16: keep the card figure and the HUD in step
    toast('Your cell was eaten! A new cell hatches... (-' + Math.round(lost) + ' progress)', '💀', 3200);
    S.hudDirty = true;
  }
  function playerRespawn() {
    S.respawned = true;
    const P = S.player;
    // find a calm spot away from other cells
    let bx = 0, bz = 0, bs = -1;
    for (let tries = 0; tries < 10; tries++) {
      const a = rnd() * TAU, d = Math.sqrt(rnd()) * (POOL_R * 0.55), x = Math.cos(a) * d, z = Math.sin(a) * d;
      let nearest = 1e9;
      for (let i = 0; i < S.cells.length; i++) { const c = S.cells[i]; if (c === P || c.dead) continue; nearest = Math.min(nearest, Math.hypot(c.x - x, c.z - z) - c.r); }
      if (nearest > bs) { bs = nearest; bx = x; bz = z; }
    }
    P.dead = false; P.deadT = 0; P.act = null; P.hp = P.hpMax; P.x = bx; P.z = bz; P.vx = P.vz = 0; P.invuln = 3;
    P.rig.setFade(1); P.rig.root.visible = true;
    attachRig(P, S.campaign.cellDesign);
    S.cam.target.set(P.x, 0, P.z); S.cam._t.copy(S.cam.target);
    // sweep dangerous cells away from the spawn
    for (let i = 0; i < S.cells.length; i++) { const c = S.cells[i]; if (c !== P && !c.isPlayer && Math.hypot(c.x - bx, c.z - bz) < c.r + P.r * 3) { c.x += (c.x - bx) * 2 + 8; } }
    ring(bx, bz, 0xbaf7ff, P.r * 5, 0.8, 4); burstP(bx, bz, 0xbaf7ff, 14, 1.4);
    sfx('splash');
    food.fill(true);
  }

  // ================================================================== mate and editor
  function canMate() { return S.campaign.dna >= 15 || S.mateReadyMark; }
  function callMate() {
    const P = S.player;
    if (S.mate || P.dead || S.editing || S.ending) { if (S.mate) toast('Your mate is already on its way!', '💕', 1500); return; }
    if (S.mateCd > 0) { toast('Your mate needs a moment (' + Math.ceil(S.mateCd) + 's)', '💕', 1500); return; }
    if (!canMate()) { toast('You need 15 DNA 🧬 or the next 25% mark to call a mate', '💕', 2600); return; }
    const d = SP.creature.clone(S.campaign.cellDesign);
    d.name = 'Mate';
    const lerpHex = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t).getHex();
    d.colors.base = lerpHex(d.colors.base, 0xf9a8d4, 0.55); d.colors.accent = 0xfffbeb;
    const a = rnd() * TAU, dist = S.halfDiag * 0.8;
    const m = spawnCell({ type: 'mate', x: P.x + Math.cos(a) * dist, z: P.z + Math.sin(a) * dist, k: P.k, design: d, h: a + Math.PI });
    m.ai.life = 32; m.ai.heart = 0;
    S.mate = m;
    sfx('mate'); SP.ui.banner('A mate approaches!', 'Swim into it to open the cell editor', 2400);
  }
  function mateUpdate(c, dt) {
    const P = S.player, ai = c.ai;
    ai.life -= dt; ai.heart -= dt;
    if (S.mateTrig > 0) { c.thr = 0; return; }
    if (ai.heart <= 0) { ai.heart = 0.9; TMP.set(c.x, 0.6 + c.k * 1.1, c.z); SP.ui.popup(TMP, S.camera, '💕', 'pop-pink'); }
    // hover around a spot near the player
    const d = Math.hypot(P.x - c.x, P.z - c.z);
    if (d > P.r * 7) steer(c, P.x, P.z, 0.9);
    else {
      ai.wanderT -= dt;
      if (ai.wanderT <= 0) { ai.wanderT = 2.5; const a = rnd() * TAU; ai.wx = P.x + Math.cos(a) * P.r * 5; ai.wz = P.z + Math.sin(a) * P.r * 5; }
      steer(c, ai.wx, ai.wz, 0.35);
    }
    if (ai.life <= 0 && !S.editing) {
      toast('Your mate swam away...', '💔', 2000);
      c.dead = true; c.deadT = 5; c.act = 'die'; S.mate = null; S.mateCd = 8;
    }
  }
  function onMateTouch() {
    if (S.mateTrig > 0 || S.editing || !S.mate) return;
    S.mateTrig = 1.1;
    const P = S.player, m = S.mate;
    setAction(P, 'mate'); setAction(m, 'mate');
    for (let i = 0; i < 6; i++) setTimeout(() => { if (S.scene && S.mate) { TMP.set(P.x + (rnd() - 0.5) * P.r * 3, 0.8 + P.k, P.z + (rnd() - 0.5) * P.r * 3); SP.ui.popup(TMP, S.camera, '💕', 'pop-pink'); } }, i * 140);
    burstP((P.x + m.x) / 2, (P.z + m.z) / 2, 0xf9a8d4, 24, 1.8);
    ring((P.x + m.x) / 2, (P.z + m.z) / 2, 0xf9a8d4, P.r * 5, 0.9, 4);
    sfx('mate');
    S.mateOpen = true;
  }
  function mateFlow(dt) {
    if (S.mateCd > 0) S.mateCd = Math.max(0, S.mateCd - dt);   // AUTOPLAY-F01: the cooldown was set (8/12 s) but never counted down, so only one mating per run was possible
    if (S.mateTrig > 0) {
      S.mateTrig -= dt;
      if (S.mateTrig <= 0 && S.mateOpen) { S.mateOpen = false; openEditorNow(); }
    }
  }
  function openEditorNow() {
    S.editing = true;
    const c = S.campaign;
    const finishUp = (res) => {
      S.editing = false;
      if (!S.scene) return;
      const P = S.player, m = S.mate;
      if (m) { m.dead = true; m.deadT = 5; S.mate = null; }
      S.mateCd = 12;
      P.act = null;
      if (res && res.design) {
        c.cellDesign = res.design;
        if (!c.cellDesign.name) c.cellDesign.name = c.speciesName;
        c.dna = Math.max(0, c.dna - (res.spent || 0));
        const hpRatio = P.hp / P.hpMax;
        attachRig(P, c.cellDesign);
        P.hp = P.hpMax * hpRatio;
        S.mateReadyMark = false;
        toast('Your cell evolved! ' + ((res.spent || 0) ? '(-' + res.spent + ' DNA)' : ''), '🧬', 2800);
        ring(P.x, P.z, 0xa5f3fc, P.r * 5, 0.8, 4); burstP(P.x, P.z, 0xa5f3fc, 20, 1.8); sfx('levelup');
      } else toast('Maybe next time...', '💕', 1500);
      S.hudDirty = true;
    };
    let p;
    try {
      p = SP.game.openEditor({ mode: 'cell', design: SP.creature.clone(c.cellDesign), budget: c.dna, currency: 'DNA', unlocked: c.unlocked.slice(), title: 'Evolve your cell', allowCancel: true });
    } catch (e) { console.error(e); p = null; }
    Promise.resolve(p).then(finishUp, (e) => { console.error(e); finishUp(null); });
  }

  // ================================================================== completing the stage
  function complete() {
    const c = S.campaign, P = S.player;
    const card = dietCard();
    const cell = c.cellDesign, d = SP.creature.defaultDesign('creature');
    d.name = cell.name && cell.name !== 'Cell' && cell.name !== 'Mate' ? cell.name : (c.speciesName || d.name);
    d.colors = { base: cell.colors.base, accent: cell.colors.accent, detail: cell.colors.detail, pattern: d.colors.pattern || 'belly' };
    const mouthId = { herbivore: 'mouth_nibble_1', carnivore: 'mouth_snap_1', omnivore: 'mouth_chomp_1' }[card];
    d.parts.forEach((p) => { const pd = SP.parts.get(p.id); if (pd && pd.slot === 'mouth' && mouthId) p.id = mouthId; });
    d.seed = cell.seed || d.seed;
    c.design = d; c.speciesName = d.name;
    if (c.unlocked.indexOf(mouthId) < 0) c.unlocked.push(mouthId);
    c.stats = c.stats || { playTime: 0, kills: 0, allies: 0, extinctions: 0 };
    c.stats.kills += S.kills;
    c.cell = S.serialize();
    const share = dietShare();
    SP.game.completeStage(card, [
      '🌿 Plants eaten: ' + S.plantEaten + '   🍖 Meat eaten: ' + S.meatEaten,
      '⚔️ Cells defeated: ' + S.kills + (S.deaths ? '   💀 Times eaten: ' + S.deaths : ''),
      '🍽 Diet: ' + Math.round(share.plant * 100) + '% plants / ' + Math.round(share.meat * 100) + '% meat → ' + card.toUpperCase(),
      '🧬 DNA earned: ' + Math.round(S.dnaEarned) + ' (banked: ' + Math.round(c.dna) + ')' + '   🧩 Parts found: ' + S.partsFound,
      '🦶 Time to grow legs, ' + d.name + '!'
    ]);
  }

  // ================================================================== camera
  function cameraUpdate(dt) {
    const P = S.player, cam = S.cam;
    cam.target.set(P.x + P.vx * 0.25, 0, P.z + P.vz * 0.25);
    cam.update(dt);
    S.shake = Math.max(0, S.shake - dt * 1.4);
    if (S.shake > 0.001) {
      const a = S.shake * S.viewH * 0.012;
      S.camera.position.x += (rnd() - 0.5) * 2 * a; S.camera.position.z += (rnd() - 0.5) * 2 * a;
    }
    mateFlow(dt);
  }

  // ================================================================== HUD
  function buildHud() {
    const ui = SP.ui, hud = ui.hud();
    S.styleEl = document.createElement('style'); S.styleEl.textContent = CSS; document.head.appendChild(S.styleEl);
    S.vig = ui.el('div', 'cell-vig'); hud.appendChild(S.vig);
    // top-left: health + DNA
    const tl = ui.el('div', 'hud-corner hud-tl');
    const hp = ui.panel(); hp.style.padding = '8px 12px 10px';
    S.hpBar = ui.bar({ label: 'Health', icon: '❤️', color: 'rose', max: 100, width: 220 });
    hp.appendChild(S.hpBar.el);
    tl.appendChild(hp);
    S.dnaCtr = ui.counter({ icon: '🧬', label: 'DNA', color: 'cyan' });
    tl.appendChild(S.dnaCtr.el);
    hud.appendChild(tl);
    // top-centre: evolution bar
    const tc = ui.el('div', 'hud-corner hud-tc');
    const evo = ui.panel('cell-evo');
    S.evoBar = ui.bar({ label: 'Evolution', icon: '🦠', color: 'lime', max: 100, width: 360 });
    const track = S.evoBar.el.querySelector('.bar-track');
    for (let i = 1; i < 5; i++) { const dv = ui.el('span', 'evo-div'); dv.style.left = (i * 20) + '%'; track.appendChild(dv); }
    S.evoLabel = S.evoBar.el.querySelector('.bar-label');
    evo.appendChild(S.evoBar.el);
    tc.appendChild(evo);
    hud.appendChild(tc);
    // top-right: diet timeline + zoom hint
    const tr = ui.el('div', 'hud-corner hud-tr');
    const dp = ui.panel('cell-diet');
    dp.innerHTML = '<div class="dh"><span>Diet timeline</span><span class="dc">–</span></div><div class="tl"></div><div class="dr"><span style="color:#86efac">🌿 <b class="dpl">0%</b></span><span style="color:#fda4af">🍖 <b class="dme">0%</b></span></div>';
    S.dietEl = { tl: dp.querySelector('.tl'), pl: dp.querySelector('.dpl'), me: dp.querySelector('.dme'), card: dp.querySelector('.dc') };
    S.dietSegs = [];
    for (let i = 0; i < 24; i++) { const s = document.createElement('i'); S.dietEl.tl.appendChild(s); S.dietSegs.push(s); }
    tr.appendChild(dp);
    hud.appendChild(tr);
    // bottom-centre: abilities
    const bc = ui.el('div', 'hud-corner hud-bc');
    S.abBar = ui.abilityBar([
      { id: 'burst', icon: '💨', key: 'Space', name: 'Jet burst / bite', cooldown: 3, level: 0, onClick: () => { const P = S.player; if (P && !P.dead && !S.editing) attack(P); } },
      { id: 'special', icon: '⚡', key: 'E', name: 'Special: zap / poison', cooldown: 4, level: 0, onClick: special },
      { id: 'mate', icon: '💕', key: 'C', name: 'Call a mate', cooldown: 12, level: 0, onClick: callMate }
    ]);
    bc.appendChild(S.abBar.el);
    const hint = ui.el('div', 'cell-hint', 'Wheel or + / - to zoom · H for help');
    bc.appendChild(hint);
    hud.appendChild(bc);
    // edge arrows for shards and the mate
    S.arrows = [];
    ['✨', '💕'].forEach((ic, i) => {
      const el = ui.el('div', 'cell-arrow'); el.innerHTML = ic + '<b>▲</b>'; document.body.appendChild(el);
      S.arrows.push({ el: el, arrow: el.querySelector('b') });
    });
    S.hudDirty = true; S.dietDirty = true;
  }
  function hudUpdate(dt) {
    const P = S.player; if (!P) return;
    S.hudT -= dt;
    // cheap values every frame
    if (S.hudT > 0 && !S.hudDirty) { arrowsUpdate(); return; }
    S.hudT = 0.12;
    S.hpBar.set(Math.max(0, P.hp), P.hpMax);
    const dna = Math.round(S.campaign.dna);
    S.dnaCtr.set(dna);
    S.evoBar.set(S.progress, 100);
    S.evoLabel.textContent = 'Evolution · Level ' + (S.level + 1) + ' / 5';
    // abilities
    const b = P.burstCd > 0 ? P.burstCd / Math.max(0.5, Math.max(0.9, 2.6 - 0.4 * (P.burstLv || 0))) : 0;
    S.abBar.setCooldown('burst', clamp(b, 0, 1));
    const zc = P.zap > 0 && (P.poison <= 0 || !S.specialAlt) ? P.zapCd / 3.6 : P.poison > 0 ? P.poisonCd / 5 : 0;
    S.abBar.setCooldown('special', clamp(zc, 0, 1));
    S.abBar.setCooldown('mate', clamp(S.mateCd / 12, 0, 1));
    S.abBar.setLevels({ burst: Math.min(5, Math.round(P.burstLv || 0)), special: Math.min(5, Math.round((P.zap || 0) + (P.poison || 0))), mate: canMate() ? 1 : 0 });
    const spIcon = P.zap > 0 && P.poison > 0 ? '⚡' : P.zap > 0 ? '⚡' : P.poison > 0 ? '☠' : '·';
    const si = S.abBar.el.querySelectorAll('.ability-icon')[1]; if (si && si.textContent !== spIcon) si.textContent = spIcon;
    const slots = S.abBar.el.querySelectorAll('.ability');
    if (slots[1]) slots[1].style.opacity = (P.zap > 0 || P.poison > 0) ? 1 : 0.45;
    if (slots[2]) { slots[2].style.opacity = canMate() ? 1 : 0.55; slots[2].classList.toggle('cell-pulse', canMate() && !S.mate); }
    if (S.dietDirty || S.hudDirty) {
      S.dietDirty = false;
      const d = dietShare(), tl = S.timeline, n = tl.length;
      S.dietEl.pl.textContent = n ? Math.round(d.plant * 100) + '%' : '0%'; S.dietEl.me.textContent = n ? Math.round(d.meat * 100) + '%' : '0%';
      S.dietEl.card.textContent = n ? ({ herbivore: '🌿 herbivore', carnivore: '🍖 carnivore', omnivore: '🍽 omnivore' }[dietCard()]) : '–';
      const segs = S.dietSegs, nb = Math.min(24, Math.max(n, 1));
      for (let i = 0; i < segs.length; i++) {
        if (i >= nb || !n) { segs[i].style.background = ''; continue; }
        const a = Math.floor(i * n / nb), z = Math.max(a + 1, Math.floor((i + 1) * n / nb));
        let m = 0; for (let j = a; j < z; j++) m += tl[j];
        const f = m / (z - a);
        segs[i].style.background = f < 0.34 ? '#4ade80' : f > 0.66 ? '#f43f5e' : '#facc15';
      }
    }
    S.hudDirty = false;
    arrowsUpdate();
  }
  const _sp = { x: 0, y: 0, behind: false }, _pw = new V3();
  function arrowsUpdate() {
    const W = SP.render.width, H = SP.render.height, cx = S.cam._t.x, cz = S.cam._t.z;
    let shard = null, bd = 1e9;
    for (let i = 0; i < S.pickups.length; i++) { const p = S.pickups[i]; if (p.kind !== 'shard') continue; const d = Math.hypot(p.x - cx, p.z - cz); if (d < bd) { bd = d; shard = p; } }
    place(S.arrows[0], shard);
    place(S.arrows[1], S.mate && !S.mate.dead ? S.mate : null);
    function place(a, t) {
      if (!t || S.editing) { a.el.style.display = 'none'; return; }
      S.cam.toScreen(_pw.set(t.x, 0.8, t.z), _sp);
      let sx = _sp.x, sy = _sp.y;
      if (_sp.behind) { sx = W - sx; sy = H - sy; }          // behind the camera (never on the ground plane, but be safe)
      const m = 46;
      if (!_sp.behind && sx > m && sx < W - m && sy > m + 40 && sy < H - m) { a.el.style.display = 'none'; return; }
      const ex = clamp(sx, m, W - m), ey = clamp(sy, m + 40, H - m - 70);
      a.el.style.display = 'block'; a.el.style.left = ex + 'px'; a.el.style.top = ey + 'px';
      a.arrow.style.transform = 'rotate(' + (Math.atan2(sy - H / 2, sx - W / 2) + Math.PI / 2) + 'rad)';
    }
  }

  // test / debug hook
  S._dbg = {
    get state() { return S; },
    addProgress: function (n) { addProgress(n, S.player.x, S.player.z, 'dbg'); },
    spawn: function (type, rho) { return spawnNpc(false, type, rho); },
    shard: function () { return addPickup('shard', S.player.x + 5, S.player.z, {}); },
    kill: function (c) { die(c, S.player); },
    poison: function () { dropPoison(S.player, true); },
    zap: function () { doZap(S.player); },
    hurt: function (c, d) { hurt(c, d, S.player, {}); },
    part: function (id) { return addPickup('part', S.player.x + 3, S.player.z + 1, { id: id || 'cell_jet' }); },
    meat: function (n) { for (let i = 0; i < (n || 4); i++) food.add('meat', S.player.x + 3 + i * 1.2, S.player.z - 2.5 + (i % 2) * 1.5, { val: 1 + (i % 2), life: 200 }); }
  };

  SP.game.registerStage(S);
})();
