// WP3 harness: planet + sky + eco + test player.
(function () {
  'use strict';
  const q = new URLSearchParams(location.search);
  const seed = +(q.get('seed') || 7);
  const timeScale0 = +(q.get('ts') || 1);
  const V3 = THREE.Vector3;
  SP.render.init(document.getElementById('canvas-container'));
  const scene = new THREE.Scene();
  const t0 = performance.now();
  const planet = SP.planet.create({ seed, radius: +(q.get('r') || 140), detail: +(q.get('detail') || 6), palette: q.get('palette') || undefined });
  scene.add(planet.group);
  const tPlanet = performance.now() - t0;
  const sky = SP.sky.create(scene, planet, { dayLength: +(q.get('day') || 360) });

  // player
  const design = SP.creature.defaultDesign('creature');
  const rig = SP.creature.build(design, { outline: true, shadows: true, lod: 'high' });
  scene.add(rig.root);
  const rng = SP.util.rng(seed);
  const homeDir = planet.randomLandDir(rng, (d, b) => b === 'grass' || b === 'forest');
  sky.setLocalTime(q.get('tod') ? +q.get('tod') : 0.5, planet.surfacePoint(homeDir));
  const body = SP.physics.createBody({ pos: planet.surfacePoint(homeDir).add(homeDir.clone().multiplyScalar(0.5)), heading: new V3(1, 0, 0), radius: rig.stats.radius, mass: rig.stats.mass, stats: rig.stats });
  const anim = { speed: 0, turn: 0, action: null, actionT: 0, airborne: false, inWater: false };
  let hp = 100;

  const cam = new SP.cam.Follow({ distance: 15, pitch: 0.5 });
  cam.target.copy(body.pos); cam.up.copy(body.up); cam.snap && cam.snap();

  let eco = null;
  const log = [];
  const addLog = (s) => { log.unshift(((performance.now() - t0) / 1000).toFixed(0) + 's ' + s); if (log.length > 40) log.pop(); };
  if (SP.eco) {
    eco = SP.eco.create(planet, rng, { playerDesign: design, playerNestDir: homeDir, speciesCount: +(q.get('species') || 9), brainLevel: +(q.get('brain') || 1), scene,
      onAttackPlayer: (a, dmg) => { hp = Math.max(1, hp - dmg); addLog('attacked by ' + a.species.name + ' -' + dmg.toFixed(1)); } });
    eco.player = body;
    ['extinct', 'allied', 'impressed', 'killed', 'boneFound', 'event', 'speciesArrived'].forEach((e) => eco.on(e, (d) => addLog(e + ' ' + (d && (d.type || (d.species && d.species.name) || d.name || d.id) || '') + (d && d.phase ? ' ' + d.phase : ''))));
  }
  window.__h = { planet, sky, eco, body, rig, cam, scene };

  let orbit = false, timeScale = timeScale0, fps = 0, frames = 0, fpsT = 0, T = 0;
  const hist = {}; let histT = 0;
  addEventListener('keydown', (e) => {
    if (e.code === 'KeyO') { orbit = !orbit; sky.setAltitude(orbit ? 1 : 0); planet.flora.cullRadius = orbit ? 1e9 : 130; planet.flora._dirty = true; }
    if (e.code === 'KeyT') timeScale = timeScale === 1 ? 20 : 1;
    if (e.code === 'KeyN') sky.setTime((sky.phase + 0.5) % 1);
    if (e.code === 'KeyE') { const n = planet.flora.nearest(body.pos, 6); if (n) { planet.flora.take(n, 1); anim.action = 'eat'; anim.actionT = 0; } }
    if (eco && e.code === 'KeyK') { let best = null, bd = 30; for (const a of eco.actors) { const d = a.body.pos.distanceTo(body.pos); if (d < bd && a.state !== 'dead') { bd = d; best = a; } } if (best) eco.kill(best, 'player'); }
    if (eco && e.code.startsWith('Digit')) { const t = ['meteor', 'migration', 'raid', 'fruit'][+e.code.slice(5) - 1]; if (t) eco.triggerEvent(t); }
  });

  function panel() {
    const info = SP.render.renderer.info.render;
    let h = `<b>WP3 world</b> fps ${fps.toFixed(0)} | calls ${info.calls} tris ${(info.triangles / 1000).toFixed(0)}k | planet ${tPlanet.toFixed(0)}ms<br>`;
    h += `time ${sky.timeOfDay.toFixed(2)} ${sky.isNight ? 'NIGHT' : 'day'} | hp ${hp.toFixed(0)} | biome ${planet.biomeAt(body.pos)} | ${body.inWater ? 'swim ' : ''}${body.onGround ? 'ground' : 'air'}<br>`;
    const fs = planet.flora.stats;
    h += `flora active ${fs.active}/${planet.flora.nodes.length} fruit ${fs.fruit} withered ${fs.withered} seeded ${fs.seeded} | props ${planet.props.count}<br>`;
    if (eco) {
      const st = eco.stats ? eco.stats() : {};
      h += `actors ${eco.actors.length} | carcasses ${eco.carcasses.length} | bones found ${eco.bonePiles.filter((b) => b.found).length}/${eco.bonePiles.length} | brain ${eco.brainLevel}<br>`;
      h += '<h4>Species (relation, imp/need, killed, total pop)</h4><table>';
      for (const s of eco.species) {
        const pop = eco.nests.filter((n) => n.speciesId === s.id).reduce((a, n) => a + n.population, 0);
        const cls = s.relation === 'extinct' ? 'ext' : s.relation === 'allied' ? 'all' : s.relation === 'hostile' ? 'hos' : '';
        h += `<tr class="${cls}"><td>${s.name}</td><td>${s.sizeTier[0]}${s.diet[0]}${s.temperament[0]}${s.nocturnal ? 'N' : ''}</td><td>${s.relation}</td><td>${s.impressed}/${s.needed}</td><td>k${s.killed}</td><td>${s.arrived === false ? 'away' : pop.toFixed(1)}</td></tr>`;
        (hist[s.id] = hist[s.id] || []);
      }
      h += '</table><h4>Nest populations over time (every 10s)</h4>';
      for (const s of eco.species) { const a = hist[s.id]; h += `<div>${s.name}: ${a.slice(-14).map((v) => v.toFixed(0)).join(' ')}</div>`; }
      const pn = eco.nests.find((n) => n.isPlayer); if (pn) h += `<div>player nest: ${pn.population.toFixed(1)}</div>`;
      if (st.far !== undefined) h += `<div>far-sim ticks ${st.far}</div>`;
    }
    h += '<h4>Events</h4><div id="log">' + log.slice(0, 9).join('<br>') + '</div>';
    document.getElementById('dbg').innerHTML = h;
  }

  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    let dt = Math.min(0.05, (now - last) / 1000); last = now;
    frames++; fpsT += dt; if (fpsT > 0.5) { fps = frames / fpsT; frames = 0; fpsT = 0; window.__fps = fps; }
    const I = SP.input;
    const steps = Math.max(1, Math.round(timeScale));
    for (let s = 0; s < steps; s++) {
      const sdt = steps > 1 ? 0.05 : dt;
      T += sdt;
      // player control
      const fwd = cam.forwardOnSurface(), up = body.up, right = new V3().crossVectors(fwd, up).normalize();
      const mv = new V3();
      if (I.isDown('KeyW') || I.isDown('ArrowUp')) mv.add(fwd);
      if (I.isDown('KeyS') || I.isDown('ArrowDown')) mv.sub(fwd);
      if (I.isDown('KeyD') || I.isDown('ArrowRight')) mv.add(right);
      if (I.isDown('KeyA') || I.isDown('ArrowLeft')) mv.sub(right);
      if (mv.lengthSq() > 0) mv.normalize();
      SP.physics.step(body, planet, { move: mv.lengthSq() ? mv : null, jump: I.isDown('Space'), sprint: I.isDown('ShiftLeft'), sneak: I.isDown('ControlLeft') }, sdt);
      sky.update(sdt, body.pos);
      planet.update(sdt, T, body.pos);
      if (eco) { eco.update(sdt, body.pos, sky.timeOfDay); const bodies = [body]; for (const a of eco.actors) bodies.push(a.body); SP.physics.collideAll(bodies, sdt); }
      if (hp < 100) hp = Math.min(100, hp + sdt * 2);
    }
    SP.surf.orient(rig.root, body.pos, body.heading);
    anim.speed = body.speed; anim.turn = body._turnRate; anim.airborne = body.airborne && !body.inWater; anim.inWater = body.inWater;
    if (anim.action) { anim.actionT += dt; if (anim.actionT > 1) anim.action = null; }
    SP.creature.animate(rig, dt, anim);
    if (!orbit) {
      cam.target.copy(body.pos); cam.up.copy(body.up); cam.update(dt);
      SP.render.render(scene, cam.camera);
    } else {
      const a = T * 0.15, c = cam.camera; c.up.set(0, 1, 0);
      c.position.set(Math.cos(a) * planet.radius * 3.0, planet.radius * 0.9, Math.sin(a) * planet.radius * 3.0); c.lookAt(0, 0, 0);
      sky.dome.position.copy(c.position);
      SP.render.render(scene, c);
    }
    histT += dt * steps; if (eco && histT > 10) { histT = 0; for (const s of eco.species) hist[s.id].push(eco.nests.filter((n) => n.speciesId === s.id).reduce((a, n) => a + n.population, 0)); }
    if (Math.floor(now / 250) !== frame._p) { frame._p = Math.floor(now / 250); panel(); }
    SP.input.endFrame();
  }
  requestAnimationFrame(frame);
})();
