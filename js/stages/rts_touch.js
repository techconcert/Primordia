/* SP.rtsTouch — shared touch controls for the RTS stages (tribal, civ): one-finger drag pans, two-finger pinch zooms,
   a plain tap is left to the stage (select / order). SP.rtsTouch.suppress() is true while the current touch sequence
   was a pan or pinch, so stages can ignore the click that input.js still emits for it.  (B-07) */
(function () {
  'use strict';
  const SP = window.SP = window.SP || {};
  const V3 = THREE.Vector3;
  let styleEl = null;

  function isWorld(t) { return !!t && (t.tagName === 'CANVAS' || t.id === 'canvas-container' || t.tagName === 'BODY' || t.tagName === 'HTML'); }

  const T = SP.rtsTouch = {
    coarse: function () { try { return !!(window.matchMedia && window.matchMedia('(pointer:coarse)').matches) || 'ontouchstart' in window; } catch (e) { return false; } },
    narrow: function () { return window.innerWidth <= 700; },
    _sup: false,
    suppress: function () { return T._sup; },
    // cam: SP.cam.RTS; returns a detach function
    attach: function (cam, opts) {
      opts = opts || {};
      if (!styleEl) { styleEl = document.createElement('style'); styleEl.textContent = '#canvas-container,#canvas-container canvas{touch-action:none}'; document.head.appendChild(styleEl); }
      const pts = new Map();
      let lastPinch = 0, panning = false, base = null;
      function pinchDist() { const a = Array.from(pts.values()); return Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y); }
      function onDown(e) {
        if (e.pointerType !== 'touch') return;
        cam.edgePan = false;                                    // a touch screen has no hovering cursor
        if (!isWorld(e.target)) return;
        if (pts.size === 0) { T._sup = false; panning = false; }
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY });
        if (pts.size >= 2) { T._sup = true; lastPinch = pinchDist(); }
      }
      function onMove(e) {
        const p = pts.get(e.pointerId); if (!p) return;
        const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
        if (pts.size >= 2) {
          const d = pinchDist();
          if (lastPinch > 8 && d > 8) cam.distance = Math.max(cam.min, Math.min(cam.max, cam.distance * lastPinch / d));
          lastPinch = d; return;
        }
        if (!panning && Math.hypot(p.x - p.sx, p.y - p.sy) > 10) { panning = true; T._sup = true; }
        if (!panning) return;
        const f = cam.forwardOnSurface(), up = cam.focusDir, right = new V3().crossVectors(f, up).normalize();
        const k = 2 * Math.tan(cam.camera.fov * Math.PI / 360) * (cam._d || cam.distance) / Math.max(300, window.innerHeight);
        const v = right.multiplyScalar(-dx * k * 1.1).addScaledVector(f, dy * k * 1.45);
        up.addScaledVector(v, 1 / cam.radius).normalize();
      }
      function onUp(e) { pts.delete(e.pointerId); if (pts.size === 1) { const p = pts.values().next().value; p.sx = p.x; p.sy = p.y; } }
      window.addEventListener('pointerdown', onDown); window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp); window.addEventListener('pointercancel', onUp);
      return function () {
        window.removeEventListener('pointerdown', onDown); window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp); window.removeEventListener('pointercancel', onUp);
        T._sup = false;
      };
    }
  };
})();
