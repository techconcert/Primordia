// SP.physics -- creature movement on a sphere (DESIGN.md 3.2): tangent-plane motion, gravity to centre,
// ground snap, slopes, swimming, jump & glide, sprint timers, stun, knockback, sphere/sphere + static-prop collisions.
(function () {
  'use strict';
  const SP = window.SP = window.SP || {};
  const V3 = THREE.Vector3;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const GRAV = 14;
  const GRIP = { slither: 0.7, biped: 1.0, quad: 0.8, multi: 1.2, cell: 1 };
  let _id = 1;
  const t1 = new V3(), t2 = new V3(), t3 = new V3(), t4 = new V3(), tUp = new V3(), tN = new V3(), t5 = new V3();

  function defaultStats() {
    return { mass: 6, radius: 0.9, topSpeed: 4, accel: 8, turnRate: 3, jumpV: 5, glide: 0, swim: 0.5, stability: 6, health: 100, sprintMul: 1.4, sprintTime: 1.5, sprintCooldown: 10, gait: 'biped', abilities: {},
      // water (DESIGN 3.6); SP.creature.stats() overrides all of these
      waterClass: 'floater', density: 0.95, swimSpeed: 1.4, sinkRate: 0, diveDepth: 0, breath: 20, gill: 0, snorkel: 0, breathRefill: 1, drownRate: 0.09 };
  }

  function createBody(o) {
    const stats = Object.assign(defaultStats(), o.stats || {});
    const pos = (o.pos || new V3(0, 150, 0)).clone();
    const up = pos.clone().normalize();
    let heading = o.heading ? o.heading.clone() : new V3(0, 0, 1);
    heading.addScaledVector(up, -heading.dot(up));
    if (heading.lengthSq() < 1e-6) heading = new V3(1, 0, 0).addScaledVector(up, -up.x);
    heading.normalize();
    return {
      id: o.id || _id++, pos, vel: new V3(), heading, up, radius: o.radius || stats.radius, mass: o.mass || stats.mass, stats,
      onGround: true, inWater: false, airborne: false, speed: 0, stunned: 0, knock: new V3(), sprintT: 0, sprintCd: 0, sneaking: false, sprinting: false,
      depth: 0, groundR: 0, slope: 0, collide: true, _vt: new V3(), _vr: 0, _jumpLatch: false, _turnRate: 0, _pend: 0,
      // water (DESIGN 3.6): 'dry'|'wading'|'floating'|'swimming'|'submerged'
      scale: o.scale || 0, waterState: 'dry', submerged: 0, breath: stats.breath, breathMax: stats.breath, drowning: false, drownFrac: 0, wet: 0, onBottom: false, danger: false,
      _splash: 0, _kick: 0, _kickCd: 0, _fat: 0, _wt: (o.id || _id) * 1.7, _wetPrev: false,
    };
  }

  // ---- static colliders: 3D spatial hash cached on the planet
  const CELL = 8;
  function statics(planet) {
    let h = planet._phys;
    if (h && h.n === planet.colliders.length) return h;
    h = { n: planet.colliders.length, map: new Map() };
    for (const c of planet.colliders) {
      const k = [Math.floor(c.x / CELL), Math.floor(c.y / CELL), Math.floor(c.z / CELL)].join(',');
      let a = h.map.get(k); if (!a) h.map.set(k, a = []); a.push(c);
    }
    planet._phys = h;
    return h;
  }
  function eachStatic(planet, pos, fn) {
    const h = statics(planet), cx = Math.floor(pos.x / CELL), cy = Math.floor(pos.y / CELL), cz = Math.floor(pos.z / CELL);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
      const arr = h.map.get((cx + a) + ',' + (cy + b) + ',' + (cz + c));
      if (arr) for (let i = 0; i < arr.length; i++) fn(arr[i]);
    }
  }

  function groundInfo(planet, dir) {
    const r = planet.surfaceRadius(dir);
    return r;
  }

  function step(b, planet, ctrl, dt) {
    if (dt <= 0) return;
    ctrl = ctrl || {};
    const st = b.stats;
    const pos = b.pos, up = tUp.copy(pos).normalize();
    const r = pos.length();
    const gR = planet.surfaceRadius(up);
    const sea = planet.seaRadius;
    const depth = Math.max(0, sea - gR);
    const wasWater = b.inWater;
    // ---- water geometry (DESIGN 3.6)
    const cls = st.waterClass || 'floater';
    const H = bodyH(b);                                     // body height in world units (incl. brain growth scale)
    const wadeLim = wadeOf(H);                              // up to this depth (about knee height) everybody just wades on the bottom; deeper = float / swim / sink
    const draft = cls === 'sinker' ? 0 : H * clamp(0.6 * (st.density || 0.95), 0.18, 0.55) * (cls === 'swimmer' ? 0.85 : 1);
    const swimMode = cls !== 'sinker' && depth > wadeLim;   // buoyant bodies leave the bottom (they rest on it when the water is shallower than their draft)
    const eqR = Math.max(sea - draft, gR + 0.06);          // surface-floating radius, never below the bed
    const wl = sea - r;                                     // how far the feet are below the surface (+ below)
    const deepW = depth > wadeLim;
    const surfaceR = swimMode ? eqR : gR;
    const height = r - surfaceR;
    b.groundR = gR; b.depth = depth;
    b._wt += dt;

    // ---- timers
    if (b.stunned > 0) b.stunned = Math.max(0, b.stunned - dt);
    if (b.sprintCd > 0) b.sprintCd = Math.max(0, b.sprintCd - dt);
    const canAct = b.stunned <= 0;

    // ---- terrain normal / slope
    const n = planet.normalAt(up, tN);
    const slopeVec = t1.copy(n).addScaledVector(up, -n.dot(up)); // tangential part of normal (points downhill)
    const slope = slopeVec.length(); b.slope = slope;

    // ---- steering
    const hd = b.heading;
    hd.addScaledVector(up, -hd.dot(up)); if (hd.lengthSq() < 1e-8) hd.set(1, 0, 0).addScaledVector(up, -up.x); hd.normalize();
    let desired = 0, throttle = 0;
    b.sneaking = !!(ctrl.sneak && canAct);
    if (canAct) {
      if (ctrl.move && ctrl.move.lengthSq() > 1e-4) {
        const mv = t2.copy(ctrl.move).addScaledVector(up, -ctrl.move.dot(up));
        const len = Math.min(1, mv.length());
        if (len > 0.02) {
          mv.normalize();
          const ang = Math.atan2(t3.crossVectors(hd, mv).dot(up), hd.dot(mv));
          const maxTurn = st.turnRate * (b.onGround ? 1 : 0.5) * dt;
          const da = clamp(ang, -maxTurn, maxTurn);
          rotate(hd, up, da); b._turnRate = da / dt;
          throttle = len * clamp(1 - Math.abs(ang - da) * 0.55, 0.12, 1);
        }
      } else if (ctrl.turn || ctrl.throttle) {
        const da = (ctrl.turn || 0) * st.turnRate * dt; rotate(hd, up, da); b._turnRate = da / dt; throttle = ctrl.throttle || 0;
      } else b._turnRate = 0;
    } else b._turnRate = 0;

    // ---- sprint
    if (ctrl.sprint && canAct && b.sprintT <= 0 && b.sprintCd <= 0 && throttle > 0.1) b.sprintT = st.sprintTime;
    if (b.sprintT > 0) {
      if (!ctrl.sprint || throttle <= 0.05) { b.sprintT = 0; b.sprintCd = st.sprintCooldown * 0.6; }
      else { b.sprintT -= dt; if (b.sprintT <= 0) { b.sprintT = 0; b.sprintCd = st.sprintCooldown; } }
    }
    b.sprinting = b.sprintT > 0;

    // ---- speed target
    let spd = st.topSpeed * throttle;
    if (b.sprinting) spd *= st.sprintMul;
    if (b.sneaking && !(swimMode && cls === 'swimmer')) spd *= 0.45;
    const freeWater = !swimMode && deepW && !b.onGround && wl > 0.15;       // sinking / kicking / treading water
    const bottomWet = !swimMode && b.onGround && wl > 0.12;
    if (swimMode || freeWater) { spd = st.swimSpeed * throttle * (b.sprinting ? 1 + (st.sprintMul - 1) * 0.5 : 1); }
    else if (bottomWet) spd *= Math.max(0.28, 1 - (cls === 'sinker' ? 0.62 : 0.4) * clamp(wl / Math.max(0.5, H), 0, 1.2));
    if (b.drowning) spd *= 0.7;
    // uphill penalty
    if (slope > 0.001 && throttle > 0) {
      const up_ = clamp(-hd.dot(slopeVec) / slope, 0, 1) * slope; // uphill sin component
      const grip = st.slopeGrip !== undefined ? st.slopeGrip : (GRIP[st.gait] || 0.9);
      const pen = clamp(up_ * Math.sqrt(Math.max(0.2, st.mass / 6)) * (1 - grip * 0.5), 0, 0.7);
      spd *= 1 - pen;
      // water: a bottom that is steeper than the body can grip is hard to climb out of when the head is under / deep
      if (bottomWet && wl > 0.5 * H) { const lim = 0.14 + 0.2 * grip; spd *= 1 - clamp((up_ / lim - 0.6) * 0.9, 0, 0.85); }
    }
    // ---- tangential velocity
    const vt = b._vt;
    vt.addScaledVector(up, -vt.dot(up)); // keep tangent
    const target = t3.copy(hd).multiplyScalar(spd);
    const air = b.airborne && !swimMode && !(wl > 0.15 && deepW);
    const acc = st.accel * (air ? 0.25 : 1) * (canAct ? 1 : 0.2);
    const dv = t4.copy(target).sub(vt);
    const dl = dv.length();
    const fr = (throttle < 0.05 || !canAct) ? 1.6 : 1.0;
    const maxDv = acc * fr * dt;
    if (dl > maxDv) dv.multiplyScalar(maxDv / dl);
    if (!air || throttle > 0.05) vt.add(dv);
    // sliding on very steep ground
    if (!air && slope > 0.78 && !swimMode) vt.addScaledVector(slopeVec, 9 * (slope - 0.78) * dt / slope);
    // deep sea floor: a slope beyond the body's grip lets it slide back down (kick / paddle to get out)
    if (bottomWet && wl > 0.5 * H && slope > 0.02) { const lim = (0.14 + 0.2 * (st.slopeGrip !== undefined ? st.slopeGrip : 0.9)) * 1.25; if (slope > lim) vt.addScaledVector(slopeVec, 3.2 * (slope - lim) * dt / slope); }
    if (b.drowning && canAct) rotate(hd, up, Math.sin(b._wt * 6.3) * 1.3 * dt);   // stumbling

    // ---- vertical
    let vr = b._vr;
    const wantJump = ctrl.jump && canAct;
    if (b._kickCd > 0) b._kickCd -= dt;
    if (b._fat > 0) b._fat = Math.max(0, b._fat - (b.onGround || swimMode ? 0.25 : 0.08) * dt);
    const kickable = !swimMode && wl > 0.3 * H && deepW;               // sinkers in deep water kick upwards instead of jumping
    if (wantJump && !b.stunned) {
      if (swimMode) {
        if (!b._jumpLatch && height < 0.3 && r > eqR - 0.3) { vr = st.jumpV * 0.85; b.onGround = false; b.airborne = true; b._jumpAnim = 0; }
      } else if (kickable) {
        if (b._kickCd <= 0) {
          // each kick is weaker than the last (fatigue), so a heavy body cannot tread water for ever: swim for the shore
          vr = Math.max(vr, clamp(st.jumpV * 0.9 + 0.2, 3, 5.5) * clamp(1 - b._fat, 0.3, 1));
          b._fat = Math.min(1, b._fat + 0.14); b.onGround = false; b.airborne = true; b._kickCd = 0.55; b._kick = 1; b._jumpAnim = 0;
        }
      } else if (!b._jumpLatch && b.onGround) { vr = st.jumpV; b.onGround = false; b.airborne = true; b._jumpAnim = 0; }
    }
    b._jumpLatch = !!wantJump;
    // knockback decays
    const kn = b.knock; kn.multiplyScalar(Math.exp(-4.5 * dt));
    if (kn.lengthSq() < 1e-4) kn.set(0, 0, 0);

    let newR = r;
    if (swimMode) {
      // buoyant: bob at the surface (spring); swimmers may dive (Ctrl/C) and surface (Space)
      const bob = (cls === 'floater' ? 0.05 : 0.03) * H * Math.sin(b._wt * 1.7) * (b.speed > 1 ? 0.5 : 1);
      const eq = eqR + bob;
      const diving = cls === 'swimmer' && ctrl.sneak && canAct;
      const floorR = gR + 0.12;
      if (r > eq + 0.12 || (vr > 1.0 && r > eq - 0.3 && !(wantJump && r < eqR - 0.3))) {          // out of the water: ballistic
        vr -= GRAV * dt; if (st.glide > 0 && wantJump && vr < 0) vr = Math.max(vr, -(2 + (5 - st.glide) * 1.5));
        newR = r + vr * dt; b.airborne = true; b.onGround = false;
      } else {
        let tgt = eq;
        if (diving) tgt = Math.max(floorR, eq - st.diveDepth);
        let want;
        if (diving) want = r > tgt + 0.04 ? -2.0 : 0;
        else if (cls === 'swimmer' && wantJump && r < eq - 0.25) want = 3.2;                               // surface quickly
        else want = clamp((tgt - r) * 7, -2.5, r < eq - 0.25 ? 2.0 : 2.8);
        vr += (want - vr) * Math.min(1, 9 * dt);
        newR = r + vr * dt;
        if (diving && newR < tgt) { newR = tgt; vr = 0; }
        b.airborne = false; b.onGround = false;
      }
      if (newR < floorR && depth > 0) { newR = Math.max(newR, gR); if (vr < 0) vr = 0; }
    } else if (b.onGround && height < 0.45 && vr <= 0.01) {
      newR = r + (surfaceR - r) * Math.min(1, 18 * dt); vr = 0; // snap
    } else {
      b.onGround = false; b.airborne = true;
      if (wl > 0.3 * H && deepW) {
        // sinking: drag pulls the vertical speed towards the terminal sink rate (kicks decay quickly)
        const sink = -(st.sinkRate || 1.2);
        vr += (sink - vr) * (1 - Math.exp(-3.2 * dt));
        if (st.glide > 0 && wantJump && vr < 0) vr = Math.max(vr, -(2 + (5 - st.glide) * 1.5));
      } else {
        vr -= GRAV * dt;
        if (st.glide > 0 && wantJump && vr < 0) { vr = Math.max(vr, -(2 + (5 - st.glide) * 1.5)); vt.multiplyScalar(1 - 0.2 * dt); }
      }
      newR = r + vr * dt;
      if (newR <= surfaceR + 0.02) { newR = surfaceR; if (vr < -6 && !(wl > 0.3 * H)) b._landImpact = -vr; vr = 0; b.onGround = true; b.airborne = false; }
    }

    // ---- integrate tangentially (vt + knock tangential), keep on sphere
    const kt = t2.copy(kn).addScaledVector(up, -kn.dot(up));
    const kr = kn.dot(up);
    if (kr > 0.5 && b.onGround) { vr = Math.max(vr, kr); b.onGround = false; b.airborne = true; kn.addScaledVector(up, -kr); }
    t3.copy(vt).add(kt);
    const np = t4.copy(pos).addScaledVector(t3, dt);
    np.normalize();
    // rotate heading & velocity with the transport
    const nu = np.clone();
    // parallel transport of heading/velocity: rotate by the rotation taking up -> nu
    const ax = t1.crossVectors(up, nu); const sinA = ax.length();
    if (sinA > 1e-9) { ax.divideScalar(sinA); const ang = Math.asin(Math.min(1, sinA)); rodrigues(hd, ax, ang); rodrigues(vt, ax, ang); rodrigues(kn, ax, ang); }
    // radius: re-evaluate ground at new dir for grounded bodies
    const gR2 = planet.surfaceRadius(nu);
    pos.copy(nu).multiplyScalar(Math.max(newR, gR2));
    b.up.copy(nu);
    hd.addScaledVector(nu, -hd.dot(nu)).normalize();
    b._vr = vr;

    // ---- water state, breath, drowning (DESIGN 3.6)
    waterUpdate(b, st, cls, H, swimMode, depth, sea, pos.length(), wl, dt, canAct, ctrl);

    // ---- static props
    if (b.collide !== false) collideStatics(b, planet);

    b.vel.copy(vt).add(kt).addScaledVector(nu, vr);
    b.speed = vt.dot(hd);
  }


  // body height in world units (stats.height is the unscaled design height)
  function bodyH(b) {
    const st = b.stats, h0 = st.height || b.radius * 2;
    const sc = b.scale || (st.radius ? b.radius / st.radius : 1);
    return Math.max(0.4, h0 * sc);
  }

  function waterUpdate(b, st, cls, H, swimMode, depth, sea, rNow, wlPrev, dt, canAct, ctrl) {
    const wl = sea - rNow;
    const sc = H / (st.height || H);
    const headH = H * 0.82 + (st.snorkel || 0) * sc;                    // the breathing point (a snorkel lifts it)
    const sub = clamp((wl - headH * 0.92) / (headH * 0.16), 0, 1);
    b.wet = Math.max(0, wl);
    b.submerged = swimMode && cls === 'floater' ? 0 : sub;
    let state;
    if (wl < 0.12 || depth < 0.04) state = 'dry';
    else if (swimMode) {
      state = b.submerged > 0.5 ? 'submerged' : (cls === 'swimmer' && (b.speed > 0.5 || ctrl.sneak || wl > draftOf(st, H) + 0.4) ? 'swimming' : 'floating');
    } else if (b.onGround) state = b.submerged > 0.5 ? 'submerged' : (wl > wadeOf(H) ? 'swimming' : 'wading');   // deeper than the knees on the bed: clambering / struggling, not walking
    else state = b.submerged > 0.5 ? 'submerged' : 'swimming';
    b.onBottom = !swimMode && b.onGround && state !== 'dry';
    // bodies free in the water (not standing on something) count as inWater: animation paddles, no ground snap
    b.inWater = state === 'floating' || state === 'swimming' || state === 'submerged';
    // splash when entering deep-ish water
    const wet = state !== 'dry' && wl > 0.25 * H;
    if (wet && !b._wetPrev) b._splash = clamp(0.45 + Math.abs(b._vr) / 8 + Math.abs(b.speed) / 8, 0.4, 1.6);
    b._wetPrev = wet;
    b.waterState = state;
    // danger: a body that cannot just float and has water over (or nearly over) its head -> AI should climb out (escapeCtrl)
    b.danger = cls !== 'swimmer' && (state === 'submerged' || (cls === 'sinker' && wl > H * 0.55 && state !== 'dry' && state !== 'floating'));
    // breath
    const max = st.breath || 20; b.breathMax = max;
    if (b.breath === undefined || b.breath > max) b.breath = max;
    if (b.submerged >= 0.5) b.breath = Math.max(0, b.breath - dt * (1 - (st.gill || 0)));
    else if (b.submerged <= 0.25) b.breath = Math.min(max, b.breath + dt * (max / 3.5) * (st.breathRefill || 1) * (state === 'dry' ? 1.4 : 1));
    b.drowning = b.breath <= 0 && max < 900;
    if (b.drowning) b.drownFrac += (st.drownRate === undefined ? 0.09 : st.drownRate) * dt;     // fraction of max health; the owner consumes + zeroes it
  }
  function wadeOf(H) { return clamp(H * 0.22, 0.25, 0.6); }
  function draftOf(st, H) { return st.waterClass === 'sinker' ? 0 : H * clamp(0.6 * (st.density || 0.95), 0.18, 0.55); }

  // tangent direction (unit, written to `out`) towards the nearest shore, or null when none is within ~25 u. Cached ~0.5 s per body.
  function shoreDir(b, planet, out) {
    out = out || new V3();
    if (b._shoreAt !== undefined && b._wt - b._shoreAt < 0.5 && b._shore) return out.copy(b._shore);
    b._shoreAt = b._wt;
    const up = b.up, sea = planet.seaRadius, hd = b.heading;
    let best = null, bd = 1e9; const tt = new V3(), q = new V3();
    for (let i = 0; i < 16; i++) {
      tt.copy(hd); rodrigues(tt, up, i * Math.PI / 8);
      for (let k = 0; k < 6; k++) {
        const d = [3, 6, 10, 15, 20, 26][k];
        q.copy(b.pos).addScaledVector(tt, d).normalize();
        if (planet.surfaceRadius(q) > sea + 0.1) { const sc = d + (planet.slopeAt ? planet.slopeAt(q) * 6 : 0); if (sc < bd) { bd = sc; best = tt.clone(); } break; }
      }
    }
    b._shore = best; b._shoreDist = best ? bd : 0;
    return best ? out.copy(best) : null;
  }

  // deepest water (m below sea level) a body of its class is willing to walk into on its own
  function passDepth(b) {
    const st = b.stats, cls = st.waterClass;
    if (cls === 'swimmer') return Infinity;
    if (cls === 'floater') return 1.6;
    return Math.min(0.6, 0.25 * bodyH(b)) + 0.2;
  }
  // steer a movement vector around water the body should not enter (sinkers: anything but wading; floaters: deep lakes). Returns `mv` or `out`.
  const _aw = new V3(), _aq = new V3();
  function avoidWater(b, planet, mv, out) {
    const pd = passDepth(b); if (pd === Infinity) return mv;
    const len = mv.length(); if (len < 1e-4) return mv;
    const ahead = 2.8 + Math.abs(b.speed) * 0.5, sea = planet.seaRadius;
    _aw.copy(mv).multiplyScalar(1 / len);
    const test = (v) => { _aq.copy(b.pos).addScaledVector(v, ahead).normalize(); return planet.surfaceRadius(_aq) >= sea - pd; };
    if (test(_aw)) return mv;
    out = out || new V3();
    for (const ang of [0.7, -0.7, 1.4, -1.4, 2.4]) { out.copy(_aw); rodrigues(out, b.up, ang); if (test(out)) return out.multiplyScalar(len); }
    return mv;
  }
  // Water-avoiding steering. Returns a unit tangent heading (written to `out`) towards `goal`; null when already there.
  // 1. straight line dry (probes up to 16 u ahead, capped at the goal distance) -> go straight.
  // 2. otherwise A* over a coarse grid of dry cells around the body (cached waypoints, replanned every few seconds), string-pulled so the
  //    body heads for the farthest waypoint it can see; a detour that fails (goal on an island / lake unavoidable) heads for the dry cell
  //    nearest the goal, and bodies that cannot get anywhere dry simply head straight (they wade if their class allows).
  // Swimmers and anything else with passDepth = Infinity just get the straight bearing. State lives in b._paw.
  const _pa = new V3(), _pq = new V3(), _pr = new V3(), _pe = new V3(), _pn = new V3();
  let _pcr;                                   // when defined (prop-aware planning), cells within trunk radius + _pcr are not passable
  const _po = new V3();
  function pawPass(planet, pd, dir) {
    const r = planet.surfaceRadius(dir); if (r < planet.seaRadius - pd) return false;
    if (_pcr !== undefined) {
      _po.copy(dir).multiplyScalar(r); let ok = true; const cr = _pcr;
      eachStatic(planet, _po, (c) => { if (!ok || (c.node && !c.node.active)) return; const dx = _po.x - c.x, dy = _po.y - c.y, dz = _po.z - c.z, rr = c.r + cr; if (dx * dx + dy * dy + dz * dz < rr * rr) ok = false; });
      return ok;
    }
    return true;
  }
  function pawClear(b, planet, pd, from, v, L) {
    for (let d = 2.5; d <= L + 0.01; d += 2.5) { _pq.copy(from).addScaledVector(v, d).normalize(); if (!pawPass(planet, pd, _pq)) return false; }
    return true;
  }
  function pawPlan(b, planet, pd, goal) {
    const R = planet.radius || b.pos.length(), STEP = 3.5, KEY = STEP * 0.6;
    const key = (v) => Math.round(v.x * R / KEY) + "," + Math.round(v.y * R / KEY) + "," + Math.round(v.z * R / KEY);
    const start = b.pos.clone().normalize(), g = goal.clone().normalize();
    const hOf = (d) => d.angleTo(g) * R;
    const nodes = [{ d: start, g: 0, f: hOf(start), p: -1 }], open = [0], seen = new Map([[key(start), 0]]);
    let best = 0, bestH = hOf(start), n = 0;
    const dirs = [[1, 0], [0.7071, 0.7071], [0, 1], [-0.7071, 0.7071], [-1, 0], [-0.7071, -0.7071], [0, -1], [0.7071, -0.7071]];
    const MAXN = 2600, ax = new V3(0, 1, 0), e1 = new V3(), e2 = new V3(), nd = new V3();
    while (open.length && n++ < MAXN) {
      let bi = 0; for (let i = 1; i < open.length; i++) if (nodes[open[i]].f < nodes[open[bi]].f) bi = i;
      const ci = open[bi]; open[bi] = open[open.length - 1]; open.pop();
      const c = nodes[ci], h = hOf(c.d);
      if (h < bestH) { bestH = h; best = ci; }
      if (h < STEP * 1.2) { best = ci; break; }
      e1.copy(ax).cross(c.d); if (e1.lengthSq() < 1e-4) e1.set(1, 0, 0).cross(c.d); e1.normalize(); e2.copy(c.d).cross(e1).normalize();
      for (const dd of dirs) {
        nd.copy(c.d).addScaledVector(e1, dd[0] * STEP / R).addScaledVector(e2, dd[1] * STEP / R).normalize();
        const k = key(nd); if (seen.has(k)) continue;
        // the step must be dry at its end and mid-way
        _pn.copy(c.d).add(nd).normalize();
        if (!pawPass(planet, pd, nd) || !pawPass(planet, pd, _pn)) { seen.set(k, -1); continue; }
        const idx = nodes.length; nodes.push({ d: nd.clone(), g: c.g + STEP * (dd[0] && dd[1] ? 1.414 : 1), f: 0, p: ci }); nodes[idx].f = nodes[idx].g + hOf(nodes[idx].d) * 1.25;
        seen.set(k, idx); open.push(idx);
      }
    }
    const path = []; for (let i = best; i > 0; i = nodes[i].p) path.push(nodes[i].d.clone().multiplyScalar(R));
    path.reverse();
    return { path, reached: bestH < STEP * 1.5, n };
  }
  // opts.obst = clearance (u) from trunks/rocks: the route avoids props as well as water (same A* grid + string pulling, state in b._pao)
  function pathAroundWater(b, planet, goal, out, opts) {
    _pcr = opts && opts.obst;
    try { return pathAroundWater0(b, planet, goal, out || new V3(), _pcr !== undefined); } finally { _pcr = undefined; }
  }
  function pathAroundWater0(b, planet, goal, out, props) {
    _pa.copy(goal).sub(b.pos); _pa.addScaledVector(b.up, -_pa.dot(b.up));
    const dist = _pa.length(); if (dist < 1e-3) return null;
    _pa.multiplyScalar(1 / dist);
    let pd = passDepth(b);
    if (pd === Infinity && !props) return out.copy(_pa);
    const st = props ? (b._pao || (b._pao = { plan: null, at: -99, goalKey: '', i: 0 })) : (b._paw || (b._paw = { plan: null, at: -99, goalKey: '', i: 0 }));
    const now = b._wt, L = Math.min(16, dist);
    if (pawClear(b, planet, pd, b.pos, _pa, L) && (dist > 16 || pawPass(planet, pd, _pr.copy(goal).normalize()))) { st.plan = null; st.wade = false; st.unreachable = false; return out.copy(_pa); }
    // need a detour
    const gk = Math.round(goal.x / 3) + ',' + Math.round(goal.y / 3) + ',' + Math.round(goal.z / 3);
    if (!st.plan || st.goalKey !== gk || now - st.at > (st.plan.reached ? 6 : 20)) {
      if (now - st.at > 0.75 || st.goalKey !== gk) { st.plan = pawPlan(b, planet, pd, goal); st.at = now; st.goalKey = gk; st.i = 0; }
    }
    const pl = st.plan; st.unreachable = !!(pl && !pl.reached);
    // floaters can cross a lake that cannot be walked round (they float): head straight and let them swim it (callers skip avoidWater while st.wade)
    st.wade = !props && st.unreachable && b.stats.waterClass === 'floater';
    if (st.wade) return out.copy(_pa);
    if (!pl || !pl.path.length) return out.copy(_pa);
    // string-pull: the farthest of the next waypoints that is in a clear straight line
    let pick = -1;
    for (let i = Math.min(pl.path.length - 1, st.i + 8); i >= st.i; i--) {
      _pe.copy(pl.path[i]).sub(b.pos); _pe.addScaledVector(b.up, -_pe.dot(b.up)); const dd = _pe.length(); if (dd < 1e-3) continue;
      _pe.multiplyScalar(1 / dd);
      if (pawClear(b, planet, pd, b.pos, _pe, Math.min(dd, 16))) { pick = i; break; }
    }
    if (pick < 0) { if (pl.reached) st.at = now - 5.3; pick = Math.min(pl.path.length - 1, st.i); _pe.copy(pl.path[pick]).sub(b.pos); _pe.addScaledVector(b.up, -_pe.dot(b.up)); _pe.normalize(); }
    // advance the waypoint cursor past the ones we are close to
    while (st.i < pl.path.length - 1) { _pr.copy(pl.path[st.i]).sub(b.pos); _pr.addScaledVector(b.up, -_pr.dot(b.up)); if (_pr.length() < 2.2) st.i++; else break; }
    return out.copy(_pe);
  }

  // when `b.danger`: write the controls of a body trying to climb out (towards the shore, kicking up). Returns true if it took over.
  function escapeCtrl(b, planet, ctrl, tmp) {
    if (!b.danger) return false;
    const sd = shoreDir(b, planet, tmp || new V3());
    ctrl.move = sd || null; ctrl.sprint = false; ctrl.sneak = false;
    ctrl.jump = b.submerged > 0.2 || !b.onGround;
    return true;
  }

  function rotate(v, axis, ang) { rodrigues(v, axis, ang); }
  function rodrigues(v, k, a) {
    const c = Math.cos(a), s = Math.sin(a), d = k.dot(v) * (1 - c);
    const cx = k.y * v.z - k.z * v.y, cy = k.z * v.x - k.x * v.z, cz = k.x * v.y - k.y * v.x;
    v.set(v.x * c + cx * s + k.x * d, v.y * c + cy * s + k.y * d, v.z * c + cz * s + k.z * d);
  }

  // Static props (trunks, rocks): circle colliders in the tangent plane. Only the trunk radius `c.r` counts (canopies never block), and the
  // body's footprint is capped (OBST_CAP) so a huge creature is not wider than the gaps between trees. Two relaxation passes depenetrate
  // wedged bodies; velocity into the obstacle is removed and a head-on hit is deflected to the side the heading already leans to, so the body
  // slides round the trunk instead of stalling. `b._blocked` (0..1) tells steering/bots how hard the body is pressed against something.
  const OBST_CAP = 0.55;
  function obstR(b) { return Math.min(b.radius * 0.6, OBST_CAP); }
  function collideStatics(b, planet) {
    const pos = b.pos, up = b.up, h = pos.length() - b.groundR, br = obstR(b);
    let hit = 0;
    for (let it = 0; it < 2; it++) {
      let moved = false;
      eachStatic(planet, pos, (c) => {
        if (c.node && !c.node.active) return;
        if (h > c.h) return;
        const dx = pos.x - c.x, dy = pos.y - c.y, dz = pos.z - c.z;
        const d2 = dx * dx + dy * dy + dz * dz, rr = c.r + br;
        if (d2 >= rr * rr) return;
        t1.set(dx, dy, dz); t1.addScaledVector(up, -t1.dot(up));
        let l = t1.length(); if (l < 1e-4) { t1.copy(b.heading).negate(); l = 1; }
        t1.multiplyScalar(1 / l);
        const move = Math.max(0, rr - l);
        pos.addScaledVector(t1, Math.min(move, 0.5)); moved = true;
        const vi = b._vt.dot(t1);
        if (vi < 0) {
          b._vt.addScaledVector(t1, -vi);
          // slide: add speed along the tangent of the obstacle on the side the heading already leans to
          t5.crossVectors(up, t1); if (t5.dot(b.heading) < 0) t5.negate();
          b._vt.addScaledVector(t5, Math.min(-vi, 3) * 0.6);
          hit = Math.max(hit, Math.min(1, -vi / Math.max(0.5, b.stats.topSpeed || 3)));
        }
        if (b.onGround && !b.inWater) { const nr = planet.surfaceRadius(t2.copy(pos).normalize()); pos.normalize().multiplyScalar(nr); }
      });
      if (!moved) break;
    }
    b._blocked = hit > 0 ? Math.max(hit, (b._blocked || 0) * 0.9) : (b._blocked || 0) * 0.9;
  }

  // Obstacle-aware local steering ("whiskers"): `dir` is the wanted unit tangent heading; returns a heading (written to `out`) that is clear of
  // trunks/rocks (and, with `o.pd`, of water deeper than pd) for the look-ahead distance. Shared by the player's click-to-walk, the autoplay bot
  // and tribe movement. `b._sa.blocked` is true when every direction is blocked (a dense cluster): callers sidestep / back off / pick another goal.
  const _sq = new V3(), _sv = new V3(), _sp = new V3();
  function nearStatics(b, planet, R) {
    const st = b._sa || (b._sa = { side: 1, list: [], at: -9, blocked: false, free: 99 });
    if (b._wt - st.at > 0.2 || st.at > b._wt) {
      st.at = b._wt; const L = st.list; L.length = 0; const px = b.pos.x, py = b.pos.y, pz = b.pos.z;
      eachStatic(planet, b.pos, (c) => { if (c.node && !c.node.active) return; if (Math.abs(c.x - px) < R + c.r && Math.abs(c.y - py) < R + c.r && Math.abs(c.z - pz) < R + c.r) L.push(c); });
    }
    return st;
  }
  function freeDist(b, planet, st, v, L, cr, pd) {
    const R = b.pos.length(), h = 0;
    for (let d = 0.8; d <= L + 0.01; d += 0.8) {
      _sq.copy(b.pos).addScaledVector(v, d).normalize();
      if (pd !== undefined && planet.surfaceRadius(_sq) < planet.seaRadius - pd) return d - 0.8;
      _sq.multiplyScalar(R);
      for (let i = 0; i < st.list.length; i++) {
        const c = st.list[i], dx = _sq.x - c.x, dy = _sq.y - c.y, dz = _sq.z - c.z, rr = c.r + cr;
        if (dx * dx + dy * dy + dz * dz < rr * rr) return d - 0.8;
      }
    }
    return L;
  }
  const SA_ANGS = [0.35, -0.35, 0.7, -0.7, 1.05, -1.05, 1.5, -1.5, 2.1, -2.1, 2.8];
  function steerAround(b, planet, dir, out, o) {
    o = o || {}; out = out || new V3();
    const sp = Math.abs(b.speed || 0), L = o.look || (3.4 + sp * 0.5), pd = o.pd, cr0 = obstR(b) + (o.margin === undefined ? 0.4 : o.margin);
    const st = nearStatics(b, planet, L + 4);
    st.blocked = false;
    if (!st.list.length && pd === undefined) { st.free = L; return out.copy(dir); }
    // net-progress watchdog: whiskers are local, so a concave pocket (ring of trunks / rocks) can trap them. No progress for 2.5 s with something
    // ahead -> follow an A* route over a prop-free grid (cells >= trunk + body footprint from every trunk) for the next 10 s.
    if (o.goal) {
      const gd = b.pos.distanceTo(o.goal);
      if (st.pt === undefined || b._wt < st.pt) { st.pt = b._wt; st.pd = gd; st.planUntil = 0; }
      if (b._wt - st.pt > 2.5) { if (st.pd - gd < 1.6 && gd > 4 && st.free < L) st.planUntil = b._wt + 10; st.pt = b._wt; st.pd = gd; }
      if (st.planUntil > b._wt) { const pl = pathAroundWater(b, planet, o.goal, _sp, { obst: cr0 + 0.2 }); if (pl) { dir = _sp.copy(pl); st.planning = true; } } else st.planning = false;
    }
    st.free = freeDist(b, planet, st, dir, L, cr0, pd);
    if (st.free >= L) { st.commit = 0; return out.copy(dir); }
    // commitment: keep the side-step chosen a moment ago while it is still clear (no dithering in front of a wall of trunks)
    if (st.commit && b._wt < st.until) {
      _sv.copy(dir); rodrigues(_sv, b.up, st.commit);
      const fr = freeDist(b, planet, st, _sv, L, cr0, pd);
      if (fr >= Math.min(L, 2.4)) { st.free = fr; out.copy(dir); rodrigues(out, b.up, st.commit); return out; }
    }
    let best = -1e9, bang = 0, bfree = 0;
    for (let pass = 0; pass < 2 && bfree < 1.6; pass++) {
      const cr = pass ? obstR(b) + 0.05 : cr0;       // second pass: squeeze through the tightest gap physics allows
      best = -1e9;
      for (let i = 0; i < SA_ANGS.length; i++) {
        const a = SA_ANGS[i]; _sv.copy(dir); rodrigues(_sv, b.up, a);
        const fr = freeDist(b, planet, st, _sv, L, cr, pd);
        const sc = fr / L - Math.abs(a) * 0.16 + (Math.sign(a) === st.side ? 0.1 : 0);
        if (sc > best) { best = sc; bang = a; bfree = fr; }
      }
    }
    st.side = Math.sign(bang) || st.side; st.free = bfree; st.commit = bang; st.until = b._wt + 0.8;
    if (bfree < 1.2) st.blocked = true;
    out.copy(dir); rodrigues(out, b.up, bang); return out;
  }
  // nearest point (world position on the surface) at least `clear` away from every trunk, for goals that lie inside a dense cluster
  function freeSpot(planet, pos, clear) {
    clear = clear === undefined ? 1.4 : clear;
    const P = pos.clone(); let inside = false;
    eachStatic(planet, P, (c) => { if (c.node && !c.node.active) return; const dx = P.x - c.x, dy = P.y - c.y, dz = P.z - c.z, rr = c.r + clear; if (dx * dx + dy * dy + dz * dz < rr * rr) inside = true; });
    if (!inside) return P;
    const R = P.length(), up = P.clone().normalize(), e1 = new V3(1, 0, 0).cross(up); if (e1.lengthSq() < 1e-4) e1.set(0, 1, 0).cross(up); e1.normalize();
    const e2 = up.clone().cross(e1); const q = new V3();
    for (let rad = 1.2; rad <= 9; rad += 1.2) for (let k = 0; k < 12; k++) {
      const a = k / 12 * Math.PI * 2; q.copy(up).addScaledVector(e1, Math.cos(a) * rad / R).addScaledVector(e2, Math.sin(a) * rad / R).normalize();
      const r = Math.max(planet.surfaceRadius(q), planet.seaRadius); q.multiplyScalar(r);
      let ok = true; eachStatic(planet, q, (c) => { if (c.node && !c.node.active) return; const dx = q.x - c.x, dy = q.y - c.y, dz = q.z - c.z, rr = c.r + clear; if (dx * dx + dy * dy + dz * dz < rr * rr) ok = false; });
      if (ok) return q.clone();
    }
    return P;
  }

  function collideAll(bodies, dt) {
    const n = bodies.length;
    for (let i = 0; i < n; i++) {
      const a = bodies[i]; if (a.collide === false) continue;
      for (let j = i + 1; j < n; j++) {
        const c = bodies[j]; if (c.collide === false) continue;
        const dx = c.pos.x - a.pos.x; if (dx > 8 || dx < -8) continue;
        const dy = c.pos.y - a.pos.y, dz = c.pos.z - a.pos.z;
        const rr = (a.radius + c.radius) * 0.9, d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= rr * rr || d2 < 1e-8) continue;
        const d = Math.sqrt(d2), over = rr - d;
        // push along the tangent (separately per body)
        const sa = Math.max(0.08, c.mass / (a.mass + c.mass)), sc = 1 - sa;
        t1.set(dx / d, dy / d, dz / d);
        t2.copy(t1).addScaledVector(a.up, -t1.dot(a.up));
        a.pos.addScaledVector(t2, -over * sa * 0.9);
        t3.copy(t1).addScaledVector(c.up, -t1.dot(c.up));
        c.pos.addScaledVector(t3, over * sc * 0.9);
        // resolve velocity along the normal (light bodies bounce more)
        const rel = (c._vt.dot(t1) - a._vt.dot(t1));
        if (rel < 0) { a._vt.addScaledVector(t1, rel * sa * 0.5); c._vt.addScaledVector(t1, -rel * sc * 0.5); }
        // re-project radius for grounded bodies is done on next step (snap)
      }
    }
  }

  function impulse(b, v) {
    const k = 1 / Math.max(0.5, b.stats.stability || b.mass);
    b.knock.addScaledVector(v, k);
  }

  function raycastGround(planet, pos) {
    const d = pos.clone().normalize(), r = planet.surfaceRadius(d), w = r < planet.seaRadius;
    return { point: d.clone().multiplyScalar(w ? planet.seaRadius : r), normal: planet.normalAt(d), height: pos.length() - (w ? planet.seaRadius : r), water: w, terrainR: r };
  }

  // place a body on the ground at a dir
  function place(b, planet, dir) {
    const d = dir.clone().normalize();
    const r = Math.max(planet.surfaceRadius(d), planet.seaRadius);
    b.pos.copy(d).multiplyScalar(r); b.up.copy(d); b._vt.set(0, 0, 0); b._vr = 0; b.knock.set(0, 0, 0);
    b.heading.addScaledVector(d, -b.heading.dot(d)); if (b.heading.lengthSq() < 1e-6) b.heading.set(1, 0, 0).addScaledVector(d, -d.x); b.heading.normalize();
    b.onGround = true; b.airborne = false;
  }

  SP.physics = { createBody, step, shoreDir, bodyH, avoidWater, pathAroundWater, steerAround, freeSpot, obstR, rotate, escapeCtrl, passDepth, collideAll, impulse, raycastGround, place, GRAVITY: GRAV, eachStatic };
})();
