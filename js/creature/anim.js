/* SP.creature.animate — fully procedural animation (ARCHITECTURE §4.11): IK legs with foot planting, gaits, spine waves,
 * look-at, blinking, action clips, squash & stretch. No allocations in the hot path. */
(function () {
  'use strict';
  const SP = window.SP = window.SP || {};
  const C = SP.creature = SP.creature || {};
  const V3 = THREE.Vector3, Q = THREE.Quaternion;

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const sstep = (t) => { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
  const damp = (a, b, l, dt) => a + (b - a) * (1 - Math.exp(-l * dt));
  const PI = Math.PI, TAU = Math.PI * 2;

  const Y = new V3(0, 1, 0), Z = new V3(0, 0, 1);
  const _a = new V3(), _b = new V3(), _c = new V3(), _d = new V3(), _hip = new V3(), _knee = new V3(), _ank = new V3(), _pp = new V3();
  const _q = new Q(), _q2 = new Q(), _inv = new THREE.Matrix4(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
  const _lk = new V3();

  // pose accumulator, reused
  const P = {};
  function resetPose() {
    P.pitch = 0; P.roll = 0; P.yaw = 0; P.y = 0; P.z = 0; P.sy = 1; P.jaw = 0; P.headPitch = 0; P.headYaw = 0; P.tail = 0;
    P.armUp = 0; P.armSpread = 0; P.armStrike = 0; P.crouch = 0; P.cad = 1; P.eyeWide = 0; P.blink = -1; P.tuck = 0; P.wing = 0;
    P.bulge = 0; P.headZ = 0; P.hop = 0; P.puff = 0; P.fade = 1; P.dead = 0; P.spinFx = 0;
  }

  // ------------------------------------------------------------------ action clips
  const DUR = { bite: 0.5, strike: 0.55, spit: 0.65, hurt: 0.45 };
  function applyAction(rig, A, action, t, size) {
    const T = A.t;
    switch (action) {
      case 'bite': {
        const ph = clamp(t / DUR.bite, 0, 1);
        if (t > DUR.bite) break;
        const lunge = Math.sin(Math.min(1, ph * 1.4) * PI);
        P.z += 0.3 * size * lunge; P.pitch += 0.25 * lunge; P.headPitch += 0.35 * lunge; P.headZ = 0.35 * lunge;
        P.jaw = ph < 0.35 ? sstep(ph / 0.3) : 1 - sstep((ph - 0.35) / 0.18);
        P.sy *= 1 + 0.06 * lunge;
        break;
      }
      case 'charge':
        P.pitch += 0.28; P.headPitch += 0.3; P.z += 0.12 * size; P.cad = 1.5; P.jaw = 0.25; P.sy *= 1.05; P.armSpread = 0.0; P.armUp = 0;
        break;
      case 'strike': {
        if (t > DUR.strike) break;
        const ph = clamp(t / DUR.strike, 0, 1);
        const wind = sstep(ph / 0.35) * (1 - sstep((ph - 0.35) / 0.1)), slam = sstep((ph - 0.35) / 0.15) * (1 - sstep((ph - 0.6) / 0.4));
        P.armUp = wind; P.armStrike = slam; P.pitch += -0.2 * wind + 0.25 * slam; P.yaw += 0.45 * slam - 0.2 * wind; P.headYaw -= 0.25 * slam;
        P.z += 0.2 * size * slam; P.sy *= 1 + 0.08 * wind - 0.08 * slam; P.tail = 0.5 * slam;
        break;
      }
      case 'spit': {
        if (t > DUR.spit) break;
        const ph = clamp(t / DUR.spit, 0, 1);
        const back = sstep(ph / 0.4) * (1 - sstep((ph - 0.4) / 0.1)), fwd = sstep((ph - 0.4) / 0.12) * (1 - sstep((ph - 0.55) / 0.45));
        P.pitch += -0.3 * back + 0.25 * fwd; P.headPitch += -0.5 * back + 0.35 * fwd; P.jaw = Math.max(back * 0.5, fwd); P.puff = back; P.sy *= 1 + 0.1 * back - 0.08 * fwd;
        break;
      }
      case 'sing':
        P.headPitch += -0.5; P.pitch += -0.12; P.jaw = 0.45 + 0.3 * Math.sin(T * 6.5); P.roll += Math.sin(T * 2.6) * 0.07; P.y += 0.04 * size * Math.abs(Math.sin(T * 3.3)); P.puff = 0.5 + 0.5 * Math.sin(T * 6.5); P.eyeWide = 0.3;
        P.blink = 0.4;
        break;
      case 'dance': {
        const beat = T * 5.6;
        const hop = Math.abs(Math.sin(beat * 0.5));
        P.hop = hop; P.y += hop * 0.32 * size; P.sy *= 1 + 0.12 * hop - 0.1 * (1 - hop); P.yaw += Math.sin(T * 2.4) * 1.0; P.roll += Math.sin(beat * 0.5) * 0.14;
        P.armUp = 0.6 + 0.4 * Math.sin(beat); P.headYaw += Math.sin(beat * 0.5) * 0.35; P.jaw = 0.2 + 0.15 * Math.sin(beat); P.tuck = 0.35 * hop; P.tail = 1;
        break;
      }
      case 'charm':
        P.roll += Math.sin(T * 2.6) * 0.13; P.yaw += Math.sin(T * 1.3) * 0.2; P.headPitch += 0.15 + Math.sin(T * 2.6) * 0.1; P.crouch = 0.12; P.eyeWide = 1;
        P.blink = (Math.sin(T * 7) > 0.55) ? 1 : 0; P.y += 0.03 * size * Math.sin(T * 5.2); P.tail = 0.6; P.armUp = 0.25;
        break;
      case 'pose':
        P.pitch += -0.55; P.y += 0.12 * size; P.armSpread = 1; P.headPitch += -0.2; P.jaw = 0.3; P.sy *= 1.04; P.puff = 1; P.tail = 0.2;
        break;
      case 'eat':
        P.headPitch += 0.35 + 0.2 * Math.sin(T * 5); P.pitch += 0.1; P.jaw = 0.25 + 0.3 * (0.5 + 0.5 * Math.sin(T * 9)); P.bulge = 1; P.crouch = 0.1; P.sy *= 1 + 0.03 * Math.sin(T * 9);
        break;
      case 'hurt': {
        if (t > DUR.hurt) break;
        const ph = clamp(t / DUR.hurt, 0, 1), k = Math.sin(ph * PI);
        P.sy *= 1 - 0.22 * k; P.pitch += -0.3 * (1 - ph) * k * 2; P.z -= 0.2 * size * k; P.eyeWide = 1; P.blink = k > 0.5 ? 1 : 0; P.jaw = 0.4 * k; P.roll += Math.sin(ph * 25) * 0.08 * (1 - ph);
        break;
      }
      case 'die': {
        const ph = clamp(t / 1.2, 0, 1), e = sstep(ph);
        P.roll += e * 1.5; P.y -= e * 0.35 * size; P.sy *= 1 - 0.1 * e; P.blink = 1; P.jaw = 0.3 * e; P.dead = e; P.cad = 0; P.tuck = 0;
        P.fade = t < 1.4 ? 1 : clamp(1 - (t - 1.4) / 0.8, 0, 1);
        P.headPitch += 0.3 * e;
        break;
      }
      case 'mate':
        P.roll += Math.sin(T * 2.2) * 0.1; P.pitch += -0.12 + Math.sin(T * 4.4) * 0.05; P.headYaw += Math.sin(T * 1.1) * 0.3; P.blink = 0.7; P.y += 0.05 * size * Math.abs(Math.sin(T * 2.2)); P.tail = 1; P.jaw = 0.1;
        break;
      case 'celebrate': {
        const h = Math.abs(Math.sin(T * 6.6));
        P.hop = h; P.y += h * 0.5 * size; P.sy *= 1 + 0.15 * h - 0.08 * (1 - h); P.yaw += T * 1.5 * 0 + Math.sin(T * 3) * 0.4; P.armUp = 1; P.jaw = 0.4; P.tuck = 0.4 * h; P.tail = 1; P.headPitch += -0.2;
        break;
      }
      case 'sneak':
        P.crouch = 0.45; P.headPitch += 0.2; P.pitch += 0.08; P.cad = 0.8;
        break;
      case 'jump': P.tuck = 0.7; P.sy *= 1.1; P.pitch += -0.05; P.armUp = 0.5; break;
      case 'glide': P.tuck = 0.3; P.wing = 1; P.sy *= 1.0; P.pitch += 0.12; P.armSpread = 1; break;
      case 'swim': break;
      case 'drown': // out of breath: wild flailing, eyes wide, mouth gasping (DESIGN 3.6)
        P.roll += Math.sin(T * 9.1) * 0.26; P.pitch += Math.sin(T * 7.3) * 0.16 - 0.1; P.armUp = 0.55 + 0.45 * Math.sin(T * 11); P.armSpread = 0.7;
        P.jaw = 0.55 + 0.3 * Math.sin(T * 8); P.eyeWide = 1; P.sy *= 1 + 0.05 * Math.sin(T * 13); P.headPitch += -0.45; P.tail = 1; P.y += 0.05 * size * Math.sin(T * 9); P.blink = 0;
        break;
      default: break;
    }
  }

  // ------------------------------------------------------------------ IK
  // Solve two equal bones from hip to target with pole direction. Writes _knee, and clamped target into _ank.
  function ik(l, hip, target, pole) {
    const len = l.len, maxR = len * 0.998, minR = len * 0.2;
    _a.subVectors(target, hip);
    let dist = _a.length();
    if (dist < 1e-5) { _a.set(0, -1, 0); dist = 1e-5; } else _a.multiplyScalar(1 / dist);
    dist = clamp(dist, minR, maxR);
    _ank.copy(hip).addScaledVector(_a, dist);
    const half = dist * 0.5, hk = Math.sqrt(Math.max(0, len * len * 0.25 - half * half));
    _pp.copy(pole).addScaledVector(_a, -pole.dot(_a));
    if (_pp.lengthSq() < 1e-4) _pp.set(0, 0, 1).addScaledVector(_a, -_a.z);
    _pp.normalize();
    _knee.copy(hip).addScaledVector(_a, half).addScaledVector(_pp, hk);
  }
  function seg(mesh, a, b) {
    _d.subVectors(b, a);
    const l = _d.length() || 1e-4;
    mesh.position.copy(a).addScaledVector(_d, 0.5);
    mesh.scale.y = l;
    _d.multiplyScalar(1 / l);
    mesh.quaternion.setFromUnitVectors(Y, _d);
  }

  // ------------------------------------------------------------------ main
  function animate(rig, dt, s) {
    s = s || {};
    if (!(dt > 0)) dt = 1e-4;
    if (dt > 0.1) dt = 0.1;
    const A = rig.a, st = rig.stats, cell = rig.isCell, body = rig.body, root = rig.root;
    const sk = rig.scale || 1;
    const speed = (s.speed || 0) / sk, sp = Math.abs(speed);
    let action = s.action || null; const aT = s.actionT || 0;
    const air = !!s.airborne, water = !!s.inWater;
    const drown = !!s.drowning, struggle = water && !air && st.waterClass === 'sinker';   // sinkers thrash, swimmers/floaters paddle calmly
    if (air && action !== 'glide' && action !== 'die') action = (action && action !== 'jump' && action !== 'swim') ? action : 'jump';
    A.t += dt; const T = A.t;
    root.updateWorldMatrix(true, false);
    const nLegs = rig.legs.length;
    const Ls = nLegs ? st.legLength : Math.max(0.6, st.radius);
    const size = nLegs ? Ls : st.radius;
    const gait = st.gait;

    // inputs
    const acc = clamp((speed - A.prevSpeed) / dt, -30, 30); A.prevSpeed = speed;
    A.acc = damp(A.acc, acc, 7, dt);
    A.turn = damp(A.turn, (s.turn || 0), 9, dt);
    const mvRaw = clamp(sp / (cell ? 2.0 : Math.max(1.0, size * 1.5)), 0, 1);
    A.mv = damp(A.mv, mvRaw, 10, dt);
    const mv = A.mv;
    const moving = sp > 0.12;

    resetPose();
    if (action) applyAction(rig, A, action, aT, size);
    if (drown && !cell && action !== 'die') { action = 'drown'; applyAction(rig, A, 'drown', aT, size); }
    if (water && !air && !cell) {
      if (!action) action = 'swim'; P.tuck = Math.max(P.tuck, 0.15);
      if (!drown) {
        // calm float: gentle roll + nod; struggling sinkers flail their arms
        P.roll += Math.sin(T * 1.5) * 0.045; P.pitch += Math.sin(T * 1.1 + 1) * 0.035;
        if (struggle) { P.armUp = Math.max(P.armUp, 0.5 + 0.4 * Math.sin(T * 8)); P.eyeWide = Math.max(P.eyeWide, 0.6); P.jaw = Math.max(P.jaw, 0.2); P.roll += Math.sin(T * 6) * 0.08; }
      }
    }
    const swimming = water && !cell;

    // landing squash
    if (A.wasAir && !air) A.land = 1;
    A.wasAir = air;
    A.land = damp(A.land, 0, 9, dt);
    P.sy *= 1 - 0.22 * A.land;
    P.y -= 0.12 * size * A.land;

    // ---- gait phases
    let hopY = 0;
    const idleMode = !moving || air || swimming;
    if (nLegs) {
      if (A.wasIdle === undefined) A.wasIdle = true;
      if (!idleMode && A.wasIdle) { rig.legs.forEach((l) => { l.ph = l.off0; }); }
      A.wasIdle = idleMode;
      const spd01 = clamp(sp / (Math.max(0.6, Ls) * 3.2), 0, 1);
      const duty = gait === 'multi' ? 0.7 - 0.12 * spd01 : gait === 'quad' ? 0.62 - 0.16 * spd01 : (nLegs === 1 ? 0.34 : 0.62 - 0.2 * spd01);
      A.duty = duty;
      const fwdSign = speed >= 0 ? 1 : -1;
      const maxSwing = nLegs <= 2 ? 1 : Math.floor(nLegs / 2);
      let swinging = 0;
      for (let i = 0; i < nLegs; i++) if (rig.legs[i].sw >= 0) swinging++;
      const turnDt = (s.turn || 0) * dt;
      for (let i = 0; i < nLegs; i++) {
        const l = rig.legs[i];
        const fp = l.fp;
        const strideI = Math.min(1.2 * l.len * P.cad, 2 * l.exc / duty);
        // air / swim: foot follows a tucked / paddling target
        if (air || swimming) {
          const tk = Math.max(P.tuck, 0.5);
          if (swimming && !air) {
            const pf = drown ? 12 : struggle ? 9 : 5.5 + 3.5 * mv, pa = drown ? 1.8 : struggle ? 1.4 : 0.8 + 0.5 * mv;
            const ph = T * pf + l.off0 * TAU;
            _a.set(l.home.x * 0.9, l.home.y + l.vert * 0.35 + Math.sin(ph) * 0.12 * l.len * pa, l.home.z + Math.cos(ph) * 0.45 * l.len * pa);
          } else {
            const trail = action === 'glide' ? -0.35 : 0.22;
            _a.set(l.home.x * (1 - 0.25 * tk), l.home.y + l.vert * 0.62 * tk, l.home.z + l.len * trail * tk);
          }
          fp.lerp(_a, 1 - Math.exp(-14 * dt)); l.sw = -1; l.timed = false;
          continue;
        }
        if (l.timed && l.sw >= 0) {
          l.sw += dt / 0.2;
          if (l.sw >= 1) { fp.copy(l.to); l.sw = -1; l.timed = false; swinging--; }
          else { const e = sstep(l.sw); fp.lerpVectors(l.from, l.to, e); fp.y = l.home.y + Math.sin(l.sw * PI) * 0.22 * l.len + 0; }
          continue;
        }
        if (!idleMode) {
          l.ph += sp * Math.min(1 / strideI, (6 + 4 * clamp((1.4 - l.len) / 0.8, 0, 1)) / Math.max(sp, 0.01)) * dt; // short legs may step faster (C-16)
          const pc = l.ph - Math.floor(l.ph);
          if (pc < duty) {
            if (l.sw >= 0) { fp.copy(l.to); l.sw = -1; swinging--; }
            // dead-reckon: ground slides back under the body
            const x = fp.x, z = fp.z - speed * dt;
            fp.x = x * Math.cos(-turnDt) + z * Math.sin(-turnDt);
            fp.z = -x * Math.sin(-turnDt) + z * Math.cos(-turnDt);
            fp.y = l.home.y;
          } else {
            const t = (pc - duty) / (1 - duty);
            if (l.sw < 0) {
              l.from.copy(fp);
              const reach = strideI * duty * 0.5;
              l.to.set(l.home.x, l.home.y, l.home.z + fwdSign * reach);
              l.to.x += l.side * Math.abs(s.turn || 0) * 0.02 * 0 + 0;
              swinging++;
            }
            l.sw = t;
            const e = sstep(t);
            fp.lerpVectors(l.from, l.to, e);
            const lift = nLegs === 1 ? 0 : 0.26 * l.len * Math.min(1, 0.5 + spd01);
            fp.y = l.home.y + Math.sin(t * PI) * lift;
            if (nLegs === 1) { hopY = Math.sin(t * PI) * 0.4 * l.len * (0.4 + 0.6 * spd01); fp.y = l.home.y + hopY + Math.sin(t * PI) * 0.12 * l.len; }
          }
        } else {
          // idle: ground is still under us; settle feet towards home, one at a time
          if (l.sw >= 0) { l.timed = true; }
          else {
            const x = fp.x, z = fp.z - speed * dt;
            fp.x = x * Math.cos(-turnDt) + z * Math.sin(-turnDt);
            fp.z = -x * Math.sin(-turnDt) + z * Math.cos(-turnDt);
            fp.y = l.home.y;
            const dx = fp.x - l.home.x, dz = fp.z - l.home.z;
            if (swinging < maxSwing && dx * dx + dz * dz > Math.pow(0.1 * l.len + 0.04, 2)) {
              l.from.copy(fp); l.to.copy(l.home); l.sw = 0; l.timed = true; swinging++;
            }
          }
        }
      }
    }
    if (nLegs === 1 && !idleMode) P.y += hopY * 0.9;

    // ---- body bob / lean
    const leader = nLegs ? rig.legs[0] : null;
    let bob = 0, gaitRoll = 0, gaitYaw = 0, gaitPitch = 0;
    if (nLegs && !air && !swimming) {
      const pc = leader.ph;
      if (nLegs > 1) {
        bob = 0.08 * Ls * (Math.cos(TAU * 2 * (pc - (A.duty || 0.6) * 0.5)) - 1) * 0.5 * mv;
        const wob = Math.sin(TAU * pc);
        if (gait === 'biped') { gaitRoll = wob * 0.07 * mv; gaitYaw = wob * 0.04 * mv; }
        else if (gait === 'quad') { gaitRoll = wob * 0.03 * mv; gaitYaw = wob * 0.05 * mv; gaitPitch = Math.cos(TAU * pc * 2) * 0.02 * mv; }
        else { gaitRoll = wob * 0.025 * mv; }
        if (st.asym) gaitRoll += (rig.legs.filter((q) => q.side > 0).length > rig.legs.filter((q) => q.side < 0).length ? 1 : -1) * 0.07 * st.asym * (0.5 + 0.5 * Math.cos(TAU * pc)) * mv;
      }
    }
    if (rig.tiny && gait !== 'slither' && !cell && !air) { A.tp = (A.tp || 0) + sp * dt / (1.2 * Math.max(0.6, size)); bob = 0.06 * size * -Math.abs(Math.sin(PI * A.tp)) * mv; }
    const lean = clamp(A.acc * 0.011, -0.14, 0.14) + (gait === 'slither' ? 0 : 0.035 * mv);
    let pitch = P.pitch + lean + gaitPitch;
    let roll = P.roll - clamp(A.turn * 0.09, -0.25, 0.25) * clamp(mv * 2, 0, 1) + gaitRoll;
    let yawB = P.yaw + gaitYaw;
    if (cell) { // floating, banking jelly: nods with acceleration, banks into turns, bobs gently (everything is 3D under the tilted camera)
      A.sw = (A.sw || 0) + dt * (2.3 + 6.5 * mv);
      pitch = clamp(A.acc * 0.0035, -0.09, 0.09) + 0.035 * Math.sin(T * 1.3);
      roll = -clamp(A.turn * 0.07, -0.3, 0.3) * clamp(mv * 2.2, 0, 1) + 0.04 * Math.sin(T * 1.1 + 1);
      yawB = 0; bob = 0.045 * Math.max(0.5, rig.stats.radius) * Math.sin(T * 1.5);
    }
    const crouchY = (nLegs ? -P.crouch * 0.4 * Ls : 0) + (swimming ? -0.1 * size : 0);
    let sy = P.sy;
    if (!nLegs && !cell) sy *= 1 - P.crouch * 0.25;
    const breath = Math.sin(T * 2.1) * 0.012;
    // cells: squash & stretch along the heading (swim-stroke pulse + acceleration), volume preserving
    let szC = 1;
    if (cell) szC = 1 + clamp(A.acc * 0.004, -0.07, 0.1) + 0.09 * mv * Math.sin(A.sw) + 0.012 * Math.sin(T * 2.9);
    const sxz = cell ? 1 / Math.sqrt(sy * szC) : 1 / Math.sqrt(sy);
    sy += breath;
    // spin (dance) is applied to the body yaw only
    _e.set(pitch, yawB, roll, 'YXZ');
    body.quaternion.setFromEuler(_e);
    body.scale.set(sxz, sy, cell ? szC : sxz);
    // pivot about centre of mass; keep bottom of the body where it was when squashing
    const pv = A.pivot;
    _a.set(pv.x * sxz, pv.y * sy, pv.z * (cell ? szC : sxz)).applyQuaternion(body.quaternion);
    const bottomFix = (pv.y - rig.skin.rest[1] * 0 - (rig._minY === undefined ? (rig._minY = bottomOf(rig)) : rig._minY)) * (1 - sy);
    let by = rig.lift + P.y + bob + crouchY + bottomFix;
    if (cell && s.wobbleBoost) by += 0;
    body.position.set(pv.x - _a.x + 0, by + (pv.y - _a.y), pv.z - _a.z + P.z);
    if (cell) body.position.x = pv.x - _a.x;
    body.updateMatrix();
    _inv.copy(body.matrix).invert();

    // ---- spine nodes
    if (!rig.lodMode) { spineAnim(rig, A, s, mv, sp, speed, dt, size, gait, action); rig.skin.update(A.ns, A.wobble); }

    // ---- limbs
    const vgs = rig.vg;
    for (let i = 0; i < nLegs; i++) {
      const l = rig.legs[i];
      const vg = vgs[l.v];
      _hip.copy(l.off).applyQuaternion(vg.quaternion).add(vg.position);          // body-local hip
      _b.copy(_hip).applyMatrix4(body.matrix);                                   // root-local hip
      // planted foot: slide towards the hip if out of reach
      _ank.set(l.fp.x, l.fp.y + l.ankle, l.fp.z);
      const planted = l.sw < 0 && !air && !swimming;
      if (planted) {
        const dy = _ank.y - _b.y, mr = l.len * 0.985;
        const hd2 = mr * mr - dy * dy;
        const hd = hd2 > 0 ? Math.sqrt(hd2) : 0;
        const hx = _ank.x - _b.x, hz = _ank.z - _b.z, hh = Math.hypot(hx, hz);
        if (hh > hd) { A.clampN = (A.clampN || 0) + 1; const k = hd / (hh || 1); l.fp.x = _b.x + hx * k; l.fp.z = _b.z + hz * k; _ank.x = l.fp.x; _ank.z = l.fp.z; }
      }
      // hopping bodies lift feet that would be overstretched
      if (P.y > 0.05 * l.len && planted) _ank.y = Math.max(_ank.y, _b.y - l.vert * 1.0 - 0.0);
      _c.copy(_ank).applyMatrix4(_inv);                                          // ankle in body-local
      ik(l, _hip, _c, l.pole);
      l.hip.position.copy(_hip);
      seg(l.upper, _hip, _knee);
      if (l.knee) l.knee.position.copy(_knee);
      _d.copy(_ank);
      seg(l.lower, _knee, _d);
      // foot holder: sole point
      _c.set(l.fp.x, l.fp.y, l.fp.z).applyMatrix4(_inv);
      // keep foot attached to the (possibly clamped) ankle
      _lk.set(0, -l.ankle, 0);
      l.foot.position.copy(_ank).add(_lk.applyQuaternion(_q2.copy(body.quaternion).invert()));
      _q2.copy(body.quaternion).invert();
      if (l.sw >= 0) { _q.setFromAxisAngle(new V3(1, 0, 0).set(1, 0, 0), -0.55 * Math.sin(l.sw * PI)); _q2.multiply(_q); }
      l.foot.quaternion.copy(_q2);
      l.phase = l.ph;
      l.footWorld.set(l.fp.x, l.fp.y, l.fp.z).applyMatrix4(root.matrixWorld);
    }
    // arms
    const nArms = rig.arms.length;
    for (let i = 0; i < nArms; i++) {
      const l = rig.arms[i];
      const vg = vgs[l.v];
      _hip.copy(l.off).applyQuaternion(vg.quaternion).add(vg.position);
      _b.copy(_hip).applyMatrix4(body.matrix);
      const sd = l.side || 1;
      let sw = 0, lift = 0;
      if (leader && !air) { const ph = TAU * (leader.ph + (sd > 0 ? 0.5 : 0) + (gait === 'biped' ? 0 : 0.25)); sw = Math.sin(ph) * 0.3 * l.len * mv; lift = Math.max(0, Math.cos(ph)) * 0.08 * l.len * mv; }
      else if (!nLegs) { sw = Math.sin(T * 6 + sd) * 0.15 * l.len * mv; }
      const idleSway = Math.sin(T * 1.7 + sd * 1.3) * 0.04 * l.len;
      _a.copy(l.home);
      _a.z += sw + idleSway; _a.y += lift;
      // raise / spread / strike
      if (P.armUp > 0) { _c.set(_b.x + sd * l.len * 0.35, _b.y + l.len * (0.6 + 0.2 * Math.sin(T * 8 + sd)), _b.z + l.len * 0.35); _a.lerp(_c, clamp(P.armUp, 0, 1)); }
      if (P.armSpread > 0) { _c.set(_b.x + sd * l.len * 0.95, _b.y + l.len * 0.05, _b.z + l.len * 0.05); _a.lerp(_c, clamp(P.armSpread, 0, 1)); }
      if (P.armStrike > 0) { _c.set(_b.x + sd * l.len * 0.2, _b.y - l.len * 0.45, _b.z + l.len * 0.95); _a.lerp(_c, clamp(P.armStrike, 0, 1)); }
      if (air || swimming) { _a.y += l.len * 0.25; _a.z += Math.sin(T * 8 + sd) * 0.2 * l.len * (swimming ? 1 : 0.3); }
      // smooth
      l.fp.lerp(_a, 1 - Math.exp(-18 * dt));
      _c.copy(l.fp).applyMatrix4(_inv);
      ik(l, _hip, _c, l.pole);
      l.hip.position.copy(_hip);
      seg(l.upper, _hip, _knee);
      if (l.knee) l.knee.position.copy(_knee);
      seg(l.lower, _knee, _ank);
      l.foot.position.copy(_ank);
      _d.subVectors(_ank, _knee).normalize();
      l.foot.quaternion.setFromUnitVectors(Z, _d);
      l.footWorld.copy(l.fp).applyMatrix4(root.matrixWorld);
    }

    // ---- head look, eyes, mouth
    if (!rig.lodMode) { headAndEyes(rig, A, s, dt, action); fxAnim(rig, A, mv, action, air, dt); }
    else if (rig.fx.length) fxAnim(rig, A, mv, action, air, dt);   // low LOD keeps its live flagella / cilia
    if (rig.lowUpdate) rig.lowUpdate();

    // ---- fade / tint
    if (action === 'die') {
      if (P.fade < 1 || A.faded) { rig.setFade(P.fade); A.faded = P.fade < 1; }
    } else if (A.faded) { rig.setFade(1); A.faded = false; }
    const hurtTint = action === 'hurt' && aT < 0.2;
    if (hurtTint !== !!A.hurtTint) { A.hurtTint = hurtTint; rig.setTint(hurtTint ? 0xff5a5a : null); }
    // blue-green tint while the head is under water (water FX, DESIGN 3.6); never overrides the red hurt flash
    if (!cell && rig.setTint && !hurtTint) {
      const wt = (s.submerged || 0) > 0.25;
      if (wt && rig._tintHex === undefined || wt && rig._tintHex === null) rig.setTint(0x0e9bb0, 0.3);
      else if (!wt && rig._tintHex === 0x0e9bb0) rig.setTint(null);
    }
  }

  function bottomOf(rig) {
    let m = Infinity; const f = rig.isCell ? (C.CELL_FLAT || 0.5) : 1;
    rig.design.spine.forEach((n) => { m = Math.min(m, n.p[1] - n.r * f); });
    return m;
  }

  // ------------------------------------------------------------------ spine
  const tmpOff = [0, 0, 0];
  function spineAnim(rig, A, s, mv, sp, speed, dt, size, gait, action) {
    const sk = rig.skin, n = sk.n, ns = A.ns, T = A.t, nReal = sk.nReal;
    const spine = rig.design.spine;
    const pts = spine; // design coords
    // total length
    let totalLen = rig.stats.length;
    const cell = rig.isCell;
    // slither wave phase
    const slith = gait === 'slither' || cell;
    const wl = Math.max(1.4, totalLen * 0.8), waves = totalLen / wl;
    A.slither += ((slith ? sp * 0.8 / wl : sp * 0.3 / wl) + (slith ? 0.1 : 0.05)) * dt * TAU;
    const rAvg = rig.stats.radius;
    const wamp = slith ? (cell ? 0.17 : 0.32) * rAvg * (0.3 + 0.7 * mv) : 0.015 * rAvg * mv;
    // head look target (yaw/pitch)
    const hy = A.headYaw + P.headYaw, hp = A.headPitch + P.headPitch;
    // pass 1: lateral offsets
    for (let j = 0; j < n; j++) {
      const u = j / Math.max(1, n - 1);
      const jr = Math.min(j, nReal - 1);
      let x = 0, y = 0, z = 0;
      if (wamp > 0) x += wamp * Math.sin(A.slither - u * waves * TAU) * (0.45 + 0.55 * (1 - u * 0.6));
      // tail sway (+ lag behind turns)
      const tw = (1 - clamp(u * 2, 0, 1)); const tw2 = tw * tw;
      if (tw2 > 0 && !cell) x += tw2 * (0.1 * totalLen * (0.35 + 0.65 * P.tail + 0.5 * mv) * Math.sin(T * (1.6 + 2.2 * mv + P.tail) + 0.5) - A.turn * 0.05 * totalLen);
      if (cell) { x += wamp * 0 ; }
      ns.x[j] = x; ns.y[j] = y; ns.z[j] = z;
      ns.yaw[j] = 0; ns.pitch[j] = 0;
      // breathing & bulge
      let k = 1 + 0.02 * Math.sin(T * 2.1 - u * 2) * (1 - Math.abs(u - 0.5) * 1.4);
      if (P.bulge > 0) { const bp = 1 - ((T * 1.4) % 1); k += 0.2 * P.bulge * Math.exp(-Math.pow((u - bp) * 4.5, 2)); }
      if (P.puff > 0) k += 0.12 * P.puff * Math.exp(-Math.pow((u - 0.8) * 3.5, 2));
      ns.k[j] = k;
    }
    // wave -> yaw per node
    if (wamp > 0 && n > 1) {
      for (let j = 0; j < n; j++) {
        const j0 = Math.max(0, j - 1), j1 = Math.min(n - 1, j + 1);
        const dz = (spine[Math.min(j1, nReal - 1)].p[2] - spine[Math.min(j0, nReal - 1)].p[2]) || 0.5;
        ns.yaw[j] += Math.atan2(ns.x[j1] - ns.x[j0], Math.abs(dz) + 0.001);
      }
    }
    // tail yaw from sway
    if (!slith && n > 2) {
      for (let j = 0; j < n - 1; j++) { const j1 = j + 1; const dz = Math.abs(spine[Math.min(j1, nReal - 1)].p[2] - spine[Math.min(j, nReal - 1)].p[2]) + 0.001; ns.yaw[j] += Math.atan2(ns.x[j1] - ns.x[j], dz) * 0.7; }
    }
    // head/neck bend: forward kinematics from node jb to the head
    if (n > 2 && (Math.abs(hy) > 1e-3 || Math.abs(hp) > 1e-3 || P.headZ)) {
      const jb = Math.max(0, Math.floor((n - 1) * 0.45));
      const cnt = n - 1 - jb;
      let cy = 0, cp = 0, ox = 0, oy = 0, oz = 0;
      for (let j = jb + 1; j < n; j++) {
        cy += hy / cnt; cp += hp / cnt;
        const jj = Math.min(j, nReal - 1), jp = Math.min(j - 1, nReal - 1);
        const sx = spine[jj].p[0] - spine[jp].p[0], sy = spine[jj].p[1] - spine[jp].p[1], sz = spine[jj].p[2] - spine[jp].p[2];
        // rotate segment by Ry(cy)*Rx(cp)
        const c1 = Math.cos(cp), s1 = Math.sin(cp), c2 = Math.cos(cy), s2 = Math.sin(cy);
        const y1 = sy * c1 - sz * s1, z1 = sy * s1 + sz * c1;
        const x2 = sx * c2 + z1 * s2, z2 = -sx * s2 + z1 * c2;
        ox += x2 - sx; oy += y1 - sy; oz += z2 - sz;
        ns.x[j] += ox; ns.y[j] += oy; ns.z[j] += oz + (j === n - 1 ? P.headZ : 0);
        ns.yaw[j] += cy; ns.pitch[j] += cp;
      }
    }
    if (cell) {
      // jelly wobble + stretch along motion
      const w = A.wobble; const nw = w.length;
      for (let i = 0; i < nw; i++) w[i] = 0.045 * Math.sin(T * 2.6 + i * 1.3) + 0.03 * mv * Math.sin(T * 9 + i * 0.7);
      for (let j = 0; j < n; j++) { ns.k[j] *= 1 + 0.03 * Math.sin(T * 3 + j * 2); }
    }
    // vertebra groups
    for (let j = 0; j < nReal; j++) {
      const g = rig.vg[j], p = spine[j].p;
      g.position.set(p[0] + ns.x[j], p[1] + ns.y[j], p[2] + ns.z[j]);
      _e.set(ns.pitch[j], ns.yaw[j], 0, 'YXZ');
      g.quaternion.setFromEuler(_e);
    }
  }

  // ------------------------------------------------------------------ head, eyes, mouth
  const _look = new V3(), _eyeL = new V3();
  function headAndEyes(rig, A, s, dt, action) {
    const T = A.t;
    const head = rig.vg[rig.vg.length - 1];
    let ty = 0, tp = 0;
    let haveLook = false;
    if (s.lookAt) {
      haveLook = true;
      _look.copy(s.lookAt);
      rig.root.worldToLocal(_look);
      _a.copy(head.position);
      const dx = _look.x - _a.x, dz = _look.z - _a.z, dy = _look.y - rig.lift - _a.y;
      const yaw = Math.atan2(dx, dz || 0.0001), pit = Math.atan2(-dy, Math.hypot(dx, dz) + 0.001);
      ty = clamp(yaw, -0.8, 0.8) * 0.55; tp = clamp(pit, -0.5, 0.5) * 0.5;
      if (Math.abs(yaw) > 2.0) { ty = 0; tp = 0; }
    }
    if (rig.isCell) { ty *= 0.3; tp = 0; }
    A.headYaw = damp(A.headYaw, ty, 6, dt); A.headPitch = damp(A.headPitch, tp, 6, dt);

    // blink
    A.nextBlink -= dt;
    if (A.nextBlink <= 0 && A.blink <= 0) { A.blink = 0.0001; A.nextBlink = 1.8 + Math.random() * 3.5; }
    let bl = 0;
    if (A.blink > 0) { A.blink += dt * 9; bl = A.blink < 1 ? A.blink : (A.blink < 2 ? 2 - A.blink : 0); if (A.blink >= 2) A.blink = 0; }
    if (P.blink >= 0) bl = Math.max(bl, P.blink);
    // saccades when nothing to look at
    A.nextSaccade -= dt;
    if (A.nextSaccade <= 0) { A.nextSaccade = 0.8 + Math.random() * 2.5; A.saccade.set((Math.random() - 0.5) * 0.7, 1, (Math.random() - 0.5) * 0.5); }
    const eyes = rig.eyes;
    for (let i = 0; i < eyes.length; i++) {
      const g = eyes[i], info = g.userData.eye;
      if (!info) continue;
      if (!info.dir) { info.dir = new V3(0, 1, 0); info.gv = new V3(); info.g = new V3(); }
      if (haveLook) {
        _eyeL.copy(s.lookAt); g.worldToLocal(_eyeL);
        _eyeL.normalize();
        if (_eyeL.y < 0.45) { _eyeL.y = 0.45; _eyeL.normalize(); }
      } else _eyeL.copy(A.saccade);
      _eyeL.normalize();
      if (info.googly) {
        // spring-driven loose pupil
        info.gv.x += (-info.g.x * 60 - info.gv.x * 5 - A.acc * 0.15 + Math.sin(T * 7) * A.mv * 2) * dt;
        info.gv.z += (-info.g.z * 60 - info.gv.z * 5 + Math.cos(T * 9) * A.mv * 2 - A.turn * 0.1) * dt;
        info.g.x = clamp(info.g.x + info.gv.x * dt, -0.7, 0.7); info.g.z = clamp(info.g.z + info.gv.z * dt, -0.7, 0.7);
        _eyeL.set(info.g.x, 1, info.g.z).normalize();
        info.dir.copy(_eyeL);
      } else info.dir.lerp(_eyeL, 1 - Math.exp(-14 * dt)).normalize();
      info.holder.quaternion.setFromUnitVectors(Y, info.dir);
      if (info.lid) {
        const closed = Math.max(bl, info.lidBase * (1 - P.eyeWide));
        info.lid.rotation.x = PI * (1 - closed);
      }
      if (P.eyeWide > 0) info.ball.scale.setScalar(1 + 0.12 * P.eyeWide); else if (info.ball.scale.x !== 1) info.ball.scale.setScalar(1);
    }
    // mouth
    const m = rig.mouth;
    if (m) {
      const jaw = m.userData.jaw;
      if (jaw) {
        let open = P.jaw;
        if (!open && A.mv > 0.6) open = 0.05 + 0.04 * Math.sin(T * 10);   // panting
        jaw.rotation.x = -open * (jaw.userData.max || 0.7);
      }
    }
  }

  // ------------------------------------------------------------------ generic fx
  function fxAnim(rig, A, mv, action, air, dt) {
    const T = A.t, list = rig.fx;
    A.wingG = damp(A.wingG || 0, (action === 'glide' ? 1 : (air ? 0.7 : 0)), 10, dt);
    for (let i = 0; i < list.length; i++) {
      const f = list[i], a = f.a, o = f.obj;
      let amp = a.amp || 0, spd = a.speed || 1;
      const re = a.react;
      if (re) {
        if (action && re[action]) { amp *= re[action]; spd *= 1 + 0.25 * re[action]; }
        if (re.walk) { amp *= 0.3 + 0.7 * Math.min(1, mv * re.walk); spd *= 1 + 0.5 * mv; }
      } else if (a.type === 'chain' || a.type === 'sway') { amp *= 0.8 + 0.6 * mv; spd *= 1 + 0.4 * mv; }
      const ph = f.ph;
      switch (a.type) {
        case 'sway': {
          const ax = a.axis || 'x';
          const v = (a.base || 0) + amp * Math.sin(T * spd + ph);
          if (ax === 'x') o.rotation.x = f.bx + v; else if (ax === 'y') o.rotation.y = f.by + v; else o.rotation.z = f.bz + v;
          break;
        }
        case 'pulse': {
          const k = 1 + amp * Math.sin(T * spd + ph);
          o.scale.set(f.sc.x * k, f.sc.y * (a.axis === 'y' ? 1 : k), f.sc.z * k);
          break;
        }
        case 'whip': a.dyn.update(T, amp, spd, f.ph); break;
        case 'bob': {
          const t2 = T * a.speed + a.phase, lag = clamp(A.acc * 0.012, -0.5, 0.5) * a.amp * 2.5, am = a.amp * (0.7 + 0.8 * mv);
          o.position.set(f.bp.x + am * Math.sin(t2), f.bp.y + am * 0.7 * Math.sin(t2 * 1.31 + 1.7), f.bp.z + am * Math.cos(t2 * 0.83) - lag);
          break;
        }
        case 'spin': { const ax = a.axis || 'y'; if (ax === 'y') o.rotation.y = f.by + T * spd; else if (ax === 'x') o.rotation.x = f.bx + T * spd; else o.rotation.z = f.bz + T * spd; break; }
        case 'chain': {
          const ax = a.axis || 'x', L = f.links, lb = f.lb, wv = a.wave || 0.7;
          for (let k = 0; k < L.length; k++) {
            const v = amp * Math.sin(T * spd - k * wv + ph) * (0.5 + k / L.length);
            if (ax === 'x') L[k].rotation.x = lb[k][0] + v; else if (ax === 'y') L[k].rotation.y = lb[k][1] + v; else L[k].rotation.z = lb[k][2] + v;
          }
          break;
        }
        case 'flap': {
          const g = A.wingG, flapF = air && action !== 'glide' ? 1 : 0;
          const spread = (a.spread !== undefined ? a.spread : -0.1);
          const z = a.fold + (spread - a.fold) * Math.max(g, flapF * 0.6) + (a.amp || 0.6) * 0.5 * Math.sin(T * (a.speed || 10)) * flapF + 0.05 * Math.sin(T * 2.3 + ph) * (g > 0.5 ? 1 : 0.4);
          o.rotation.z = z;
          break;
        }
        default: break;
      }
    }
  }

  animate.init = function (rig) {};
  C.animate = animate;
})();
