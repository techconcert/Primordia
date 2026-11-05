/* SP.cam — Follow (planet-aware third person), Iso, Top, RTS cameras. */
(function () {
  'use strict';
  const SP = window.SP = window.SP || {};
  const U = SP.util;
  const V3 = THREE.Vector3;
  const _a = new V3(), _b = new V3(), _c = new V3();

  function aspect() { return SP.render ? SP.render.width / SP.render.height : window.innerWidth / window.innerHeight; }
  function onResize(fn) { // returns an unsubscribe function (C-07)
    if (SP.render && SP.render.onResize) return SP.render.onResize(fn);
    const h = function () { fn(window.innerWidth, window.innerHeight); }; window.addEventListener('resize', h);
    return function () { window.removeEventListener('resize', h); };
  }
  function disposeCam() { if (this._unResize) { this._unResize(); this._unResize = null; } }

  // project v onto the plane orthogonal to unit `up` and normalise; falls back to an arbitrary tangent
  function tangentOf(v, up, out) {
    out.copy(v).addScaledVector(up, -v.dot(up));
    if (out.lengthSq() < 1e-6) {
      out.set(0, 0, -1); out.addScaledVector(up, -out.dot(up));
      if (out.lengthSq() < 1e-6) { out.set(1, 0, 0); out.addScaledVector(up, -out.dot(up)); }
    }
    return out.normalize();
  }

  function rotateAbout(v, axis, ang, out) {
    const c = Math.cos(ang), s = Math.sin(ang);
    _c.crossVectors(axis, v);
    return out.copy(v).multiplyScalar(c).addScaledVector(_c, s).addScaledVector(axis, axis.dot(v) * (1 - c));
  }

  // ---------------- Follow ----------------
  function Follow(o) {
    o = o || {};
    this.camera = new THREE.PerspectiveCamera(o.fov || 55, aspect(), 0.1, 3000);
    this.target = new V3();
    this.up = new V3(0, 1, 0);
    this.yaw = 0;                    // user orbit around `up`, relative to the transported base heading
    this.pitch = o.pitch === undefined ? 0.45 : o.pitch;
    this.distance = o.distance || 14;
    this.minDist = o.minDist || 5; this.maxDist = o.maxDist || 45;
    this.lookHeight = o.lookHeight === undefined ? 1 : o.lookHeight;
    this.stiffness = o.stiffness || 10;
    this.manual = o.manual !== false;   // allow right-drag / wheel
    this._pos = new V3(); this._up = new V3(0, 1, 0); this._base = new V3(0, 0, -1);
    this._dist = this.distance; this._yaw = 0; this._init = false;
    this._heading = new V3(0, 0, -1);
    const self = this;
    this._unResize = onResize(function () { self.camera.aspect = aspect(); self.camera.updateProjectionMatrix(); });
  }
  Follow.prototype.dispose = disposeCam;
  Follow.prototype.snap = function () { this._init = false; this.update(0); };
  // Rotate the orbit so the camera looks along world tangent `dir` (optionally instantly).
  Follow.prototype.faceDirection = function (dir, instant) {
    tangentOf(dir, this._up, _a);
    const base = this._base;
    const ang = Math.atan2(_b.crossVectors(base, _a).dot(this._up), base.dot(_a));
    this.yaw = ang;
    if (instant) this._yaw = ang;
  };
  Follow.prototype.forwardOnSurface = function () { return this._heading.clone(); };
  Follow.prototype.rightOnSurface = function () { return new V3().crossVectors(this._heading, this._up).normalize(); };
  Follow.prototype.update = function (dt) {
    const m = SP.input && SP.input.mouse;
    if (this.manual && m && dt > 0) {
      if (m.right && m.dragging) {
        this.yaw -= m.dx * 0.006;
        this.pitch = U.clamp(this.pitch + m.dy * 0.005, 0.05, 1.45);
      }
      if (m.wheel && !(SP.input.pointerOverUI && SP.input.pointerOverUI())) this.distance = U.clamp(this.distance * Math.pow(1.12, m.wheel), this.minDist, this.maxDist);
    }
    this.distance = U.clamp(this.distance, this.minDist, this.maxDist);
    const k = this._init ? 1 - Math.exp(-this.stiffness * dt) : 1;
    if (!this._init) { this._pos.copy(this.target); this._up.copy(this.up).normalize(); this._dist = this.distance; this._yaw = this.yaw; this._init = true; }
    this._pos.lerp(this.target, k);
    this._up.lerp(this.up, Math.min(1, k * 0.8)).normalize();
    this._dist += (this.distance - this._dist) * Math.min(1, 1 - Math.exp(-8 * dt) || 1);
    this._yaw += (this.yaw - this._yaw) * (this._init && dt > 0 ? 1 - Math.exp(-14 * dt) : 1);
    const up = this._up;
    tangentOf(this._base, up, this._base);                   // parallel transport of the heading reference
    rotateAbout(this._base, up, this._yaw, _a);              // heading after orbit yaw
    this._heading.copy(_a);
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch), d = this._dist;
    _b.copy(this._pos).addScaledVector(up, this.lookHeight);  // look-at point
    this.camera.position.copy(_b).addScaledVector(up, sp * d).addScaledVector(_a, -cp * d);
    this.camera.up.copy(up);
    this.camera.lookAt(_b);
  };

  // ---------------- Iso ----------------
  function Iso(o) {
    o = o || {};
    this.frustum = o.frustum || 16; this.zoom = o.zoom || 1;
    this.target = new V3(); this.stiffness = o.stiffness || 8;
    this.wheelZoom = !!o.wheelZoom; this.minZoom = o.minZoom || 0.4; this.maxZoom = o.maxZoom || 3;
    this.offset = new V3(14, 15, 14);
    const a = aspect(), f = this.frustum;
    this.camera = new THREE.OrthographicCamera(-f * a / 2, f * a / 2, f / 2, -f / 2, -200, 300);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = Math.PI / 4; this.camera.rotation.x = -Math.atan(1 / Math.SQRT2);
    this._t = new V3(); this._init = false; this._z = this.zoom;
    const self = this;
    this._unResize = onResize(function () { self._proj(); });
  }
  Iso.prototype.dispose = disposeCam;
  Iso.prototype._proj = function () {
    const a = aspect(), f = this.frustum / this._z, c = this.camera;
    c.left = -f * a / 2; c.right = f * a / 2; c.top = f / 2; c.bottom = -f / 2; c.updateProjectionMatrix();
  };
  Iso.prototype.update = function (dt) {
    const m = SP.input && SP.input.mouse;
    if (this.wheelZoom && m && m.wheel && !SP.input.pointerOverUI()) this.zoom = U.clamp(this.zoom * Math.pow(0.9, m.wheel), this.minZoom, this.maxZoom);
    if (!this._init) { this._t.copy(this.target); this._init = true; }
    this._t.lerp(this.target, 1 - Math.exp(-this.stiffness * dt));
    this._z += (this.zoom - this._z) * (1 - Math.exp(-10 * dt));
    this._proj();
    this.camera.position.copy(this._t).add(this.offset);
  };

  // ---------------- Top (orthographic top-down, screen-up = -Z) ----------------
  function Top(o) {
    o = o || {};
    this.frustum = o.frustum || 30; this.zoom = o.zoom || 1;
    this.target = new V3(); this.stiffness = o.stiffness || 6;
    this.wheelZoom = !!o.wheelZoom; this.minZoom = o.minZoom || 0.3; this.maxZoom = o.maxZoom || 4;
    const a = aspect(), f = this.frustum;
    this.camera = new THREE.OrthographicCamera(-f * a / 2, f * a / 2, f / 2, -f / 2, -500, 500);
    this.camera.up.set(0, 0, -1);
    this.camera.position.set(0, 100, 0);
    this.camera.lookAt(0, 0, 0);
    this._t = new V3(); this._init = false; this._z = this.zoom;
    const self = this;
    this._unResize = onResize(function () { self._proj(); });
  }
  Top.prototype.dispose = disposeCam;
  Top.prototype._proj = Iso.prototype._proj;
  Top.prototype.update = function (dt) {
    const m = SP.input && SP.input.mouse;
    if (this.wheelZoom && m && m.wheel && !SP.input.pointerOverUI()) this.zoom = U.clamp(this.zoom * Math.pow(0.9, m.wheel), this.minZoom, this.maxZoom);
    if (!this._init) { this._t.copy(this.target); this._init = true; }
    this._t.lerp(this.target, 1 - Math.exp(-this.stiffness * dt));
    this._z += (this.zoom - this._z) * (1 - Math.exp(-8 * dt));
    this._proj();
    this.camera.position.set(this._t.x, 100, this._t.z);
    this.camera.up.set(0, 0, -1);
    this.camera.lookAt(this._t.x, 0, this._t.z);
  };
  // convert pointer to world XZ plane point (y=0)
  Top.prototype.pointerToWorld = function (out) {
    out = out || new V3();
    const n = SP.input.mouse.ndc;
    out.set(n.x, n.y, 0).unproject(this.camera);
    out.y = 0;
    return out;
  };


  // ---------------- Tilt (perspective, pitched overhead 2.5D view; screen-up = -Z; cell stage) ----------------
  // The camera looks at `target` on the plane y = 0 from `distance` away, pitched `pitch` radians above the horizon.
  function Tilt(o) {
    o = o || {};
    this.fov = o.fov || 38; this.pitch = o.pitch === undefined ? 1.0 : o.pitch; this.distance = o.distance || 16;
    this.target = new V3(); this.stiffness = o.stiffness || 6;
    this.camera = new THREE.PerspectiveCamera(this.fov, aspect(), 0.5, 900);
    this._t = new V3(); this._d = this.distance; this._init = false;
    this._ray = new THREE.Raycaster(); this._pl = new THREE.Plane(new V3(0, 1, 0), 0);
    const self = this;
    this._unResize = onResize(function () { self.camera.aspect = aspect(); self.camera.updateProjectionMatrix(); });
  }
  Tilt.prototype.dispose = disposeCam;
  // ground rectangle seen at the target: { w, h } (h along the screen's vertical axis, w across at the centre line)
  Tilt.prototype.groundSize = function (dist) {
    const d = dist === undefined ? this._d : dist, th = Math.tan(this.fov * Math.PI / 360);
    const h = 2 * d * th / Math.sin(this.pitch);
    return { w: 2 * d * th * this.camera.aspect, h: h };
  };
  // distance that makes the ground height at the centre equal `h`
  Tilt.prototype.distanceFor = function (h) { return h * Math.sin(this.pitch) / (2 * Math.tan(this.fov * Math.PI / 360)); };
  Tilt.prototype.update = function (dt) {
    if (!this._init) { this._t.copy(this.target); this._d = this.distance; this._init = true; }
    this._t.lerp(this.target, 1 - Math.exp(-this.stiffness * dt));
    this._d += (this.distance - this._d) * (1 - Math.exp(-8 * dt));
    const c = this.camera, cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    c.position.set(this._t.x, this._t.y + sp * this._d, this._t.z + cp * this._d);
    c.up.set(0, 1, 0);
    c.lookAt(this._t.x, this._t.y, this._t.z);
    c.updateMatrixWorld(true);
  };
  // pointer -> point on the horizontal plane y = h (default 0)
  Tilt.prototype.pointerToWorld = function (out, h) {
    out = out || new V3();
    const n = SP.input.mouse.ndc;
    this.camera.updateMatrixWorld();
    this._ray.setFromCamera(n, this.camera);
    this._pl.constant = -(h || 0);
    if (!this._ray.ray.intersectPlane(this._pl, out)) {            // above the horizon: aim far along the ray
      out.copy(this._ray.ray.direction).multiplyScalar(80).add(this._ray.ray.origin); out.y = h || 0;
    }
    return out;
  };
  // world point -> CSS pixels { x, y, behind }
  Tilt.prototype.toScreen = function (v, out) {
    out = out || { x: 0, y: 0, behind: false };
    _a.copy(v).project(this.camera);
    const W = SP.render ? SP.render.width : window.innerWidth, H = SP.render ? SP.render.height : window.innerHeight;
    out.x = (_a.x * 0.5 + 0.5) * W; out.y = (1 - (_a.y * 0.5 + 0.5)) * H; out.behind = _a.z > 1;
    return out;
  };

  // ---------------- RTS (planet-aware perspective) ----------------
  function RTS(o) {
    o = o || {};
    this.camera = new THREE.PerspectiveCamera(o.fov || 45, aspect(), 1, 6000);
    this.distance = o.distance || 60; this.min = o.min || 20; this.max = o.max || 160;
    this.radius = o.radius || 140;               // planet radius used to place the focus point
    this.radiusAt = null;                        // optional fn(dir) -> surface radius
    this.focusDir = new V3(0, 1, 0);
    this.rot = 0;                                // Q/E rotation
    this.panSpeed = o.panSpeed || 1; this.edgePan = o.edgePan !== false;
    this.focusPos = new V3();
    this._base = new V3(0, 0, -1); this._d = this.distance; this._rot = 0; this._dir = this.focusDir.clone();
    this._init = false;
    this._fwd = new V3(0, 0, -1);
    const self = this;
    this._unResize = onResize(function () { self.camera.aspect = aspect(); self.camera.updateProjectionMatrix(); });
  }
  RTS.prototype.dispose = disposeCam;
  RTS.prototype.forwardOnSurface = function () { return this._fwd.clone(); };
  RTS.prototype.update = function (dt) {
    const I = SP.input, m = I.mouse;
    if (m.wheel && !I.pointerOverUI()) this.distance = U.clamp(this.distance * Math.pow(1.13, m.wheel), this.min, this.max);
    this.distance = U.clamp(this.distance, this.min, this.max);
    if (I.isDown('KeyQ')) this.rot += 1.6 * dt;
    if (I.isDown('KeyE')) this.rot -= 1.6 * dt;
    this.focusDir.normalize();
    // pan input in camera-relative terms
    let px = 0, py = 0;
    if (I.isDown('KeyW') || I.isDown('ArrowUp')) py += 1;
    if (I.isDown('KeyS') || I.isDown('ArrowDown')) py -= 1;
    if (I.isDown('KeyD') || I.isDown('ArrowRight')) px += 1;
    if (I.isDown('KeyA') || I.isDown('ArrowLeft')) px -= 1;
    if (this.edgePan && m.inside && document.hasFocus() && !m.dragging) {
      const e = 10, w = window.innerWidth, h = window.innerHeight;
      if (m.x <= e) px -= 1; else if (m.x >= w - e) px += 1;
      if (m.y <= e) py += 1; else if (m.y >= h - e) py -= 1;
    }
    const up = this.focusDir;
    tangentOf(this._base, up, this._base);
    rotateAbout(this._base, up, this._rot, _a);              // screen-forward tangent
    this._fwd.copy(_a);
    if (px || py) {
      _b.crossVectors(_a, up).normalize();                    // right
      _c.copy(_a).multiplyScalar(py).addScaledVector(_b, px);
      const len = _c.length(); if (len > 1) _c.divideScalar(len);
      const speed = this.distance * 0.9 * this.panSpeed * dt;  // world units
      const step = speed / this.radius;
      // move over the sphere: rotate focusDir towards the move direction
      this.focusDir.addScaledVector(_c, Math.tan(step)).normalize();
      // keep reference heading consistent (transport happens next frame via tangentOf)
    }
    const k = this._init ? 1 - Math.exp(-12 * dt) : 1;
    if (!this._init) { this._dir.copy(this.focusDir); this._rot = this.rot; this._d = this.distance; this._init = true; }
    this._dir.lerp(this.focusDir, k).normalize();
    this._rot += (this.rot - this._rot) * k;
    this._d += (this.distance - this._d) * (this._init ? 1 - Math.exp(-9 * dt) : 1);
    const dir = this._dir;
    const R = this.radiusAt ? this.radiusAt(dir) : this.radius;
    this.focusPos.copy(dir).multiplyScalar(R);
    tangentOf(this._base, dir, this._base);
    rotateAbout(this._base, dir, this._rot, _a);
    const t = U.clamp(U.invLerp(this.min, this.max, this._d), 0, 1);
    const tilt = U.lerp(0.75, 0.12, t);                      // angle from vertical
    this.camera.position.copy(this.focusPos).addScaledVector(dir, Math.cos(tilt) * this._d).addScaledVector(_a, -Math.sin(tilt) * this._d);
    this.camera.up.copy(_a);                                 // screen-up follows pan heading: no pole flipping
    this.camera.lookAt(this.focusPos);
  };

  SP.cam = { Follow: Follow, Iso: Iso, Top: Top, Tilt: Tilt, RTS: RTS };
})();
