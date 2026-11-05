/* SP.input — keyboard / pointer state with per-frame edges. */
(function () {
  'use strict';
  const SP = window.SP = window.SP || {};

  const down = new Set(), pressedSet = new Set();
  const handlers = {};
  const mouse = {
    x: 0, y: 0, dx: 0, dy: 0, ndc: new THREE.Vector2(), left: false, right: false, middle: false,
    wheel: 0, clicked: false, rightClicked: false, dragging: false, inside: false, touch: false
  };
  let downX = 0, downY = 0, downBtn = -1, downOnUI = false, moved = 0;
  let uiCache = { frame: -1, v: false }, frameNo = 0;
  const ray = new THREE.Raycaster();

  function emit(name, e) {
    const a = handlers[name];
    if (!a) return;
    for (let i = 0; i < a.length; i++) { try { a[i](e); } catch (err) { console.error(err); } }
  }
  function typing(e) {
    const t = e && e.target;
    return !!(t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable));
  }
  function elementIsUI(el) {
    if (!el) return false;
    const tag = el.tagName;
    return !(tag === 'CANVAS' || tag === 'BODY' || tag === 'HTML' || el.id === 'canvas-container');
  }
  function setPos(e) {
    mouse.dx += (e.movementX !== undefined ? e.movementX : e.clientX - mouse.x);
    mouse.dy += (e.movementY !== undefined ? e.movementY : e.clientY - mouse.y);
    mouse.x = e.clientX; mouse.y = e.clientY;
    mouse.ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    mouse.inside = true;
  }

  window.addEventListener('keydown', function (e) {
    if (!typing(e)) {
      if (!down.has(e.code)) pressedSet.add(e.code);
      down.add(e.code);
      if (e.code === 'Space' || e.code === 'Tab' || e.code.indexOf('Arrow') === 0) e.preventDefault();
    }
    emit('keydown', e);
  });
  window.addEventListener('keyup', function (e) { down.delete(e.code); emit('keyup', e); });
  window.addEventListener('blur', function () { down.clear(); mouse.left = mouse.right = mouse.middle = false; mouse.dragging = false; });

  window.addEventListener('pointerdown', function (e) {
    setPos(e);
    mouse.touch = e.pointerType === 'touch';
    downOnUI = elementIsUI(e.target);
    downX = e.clientX; downY = e.clientY; downBtn = e.button; moved = 0;
    if (e.button === 0) mouse.left = true; else if (e.button === 2) mouse.right = true; else if (e.button === 1) mouse.middle = true;
    emit('mousedown', e);
  });
  window.addEventListener('pointermove', function (e) {
    setPos(e);
    if (mouse.left || mouse.right || mouse.middle) {
      moved = Math.max(moved, Math.hypot(e.clientX - downX, e.clientY - downY));
      if (moved > 5) mouse.dragging = true;
    }
    emit('mousemove', e);
  });
  window.addEventListener('pointerup', function (e) {
    setPos(e);
    const wasDrag = moved > 5;
    if (e.button === 0) { mouse.left = false; if (!wasDrag && !downOnUI && downBtn === 0) { mouse.clicked = true; emit('click', e); } }
    else if (e.button === 2) { mouse.right = false; if (!wasDrag && !downOnUI && downBtn === 2) { mouse.rightClicked = true; emit('rightclick', e); } }
    else if (e.button === 1) mouse.middle = false;
    if (!mouse.left && !mouse.right && !mouse.middle) mouse.dragging = false;
    emit('mouseup', e);
  });
  window.addEventListener('pointercancel', function () { mouse.left = mouse.right = mouse.middle = false; mouse.dragging = false; });
  document.addEventListener('mouseleave', function () { mouse.inside = false; });
  document.addEventListener('mouseenter', function () { mouse.inside = true; });
  window.addEventListener('contextmenu', function (e) { if (!typing(e)) e.preventDefault(); });
  window.addEventListener('wheel', function (e) {
    const onUI = elementIsUI(e.target) && !(e.target.closest && e.target.closest('#hud') && e.target.id === 'hud');
    if (!onUI) {
      mouse.wheel += Math.max(-3, Math.min(3, e.deltaY / (e.deltaMode === 1 ? 3 : 100)));
      e.preventDefault();
    }
    emit('wheel', e);
  }, { passive: false });

  SP.input = {
    mouse: mouse,
    isDown: function (code) { return down.has(code); },
    pressed: function (code) { return pressedSet.has(code); },
    // movement axes helper: returns {x,y} in -1..1 from WASD/arrows (x: right+, y: forward+)
    axis: function () {
      const x = (down.has('KeyD') || down.has('ArrowRight') ? 1 : 0) - (down.has('KeyA') || down.has('ArrowLeft') ? 1 : 0);
      const y = (down.has('KeyW') || down.has('ArrowUp') ? 1 : 0) - (down.has('KeyS') || down.has('ArrowDown') ? 1 : 0);
      return { x: x, y: y };
    },
    raycast: function (camera, objects, recursive) {
      ray.setFromCamera(mouse.ndc, camera);
      return ray.intersectObjects(Array.isArray(objects) ? objects : [objects], recursive !== false);
    },
    ray: function (camera) { ray.setFromCamera(mouse.ndc, camera); return ray.ray; },
    pointerOverUI: function () {
      if (uiCache.frame === frameNo) return uiCache.v;
      uiCache.frame = frameNo;
      uiCache.v = mouse.inside && elementIsUI(document.elementFromPoint(mouse.x, mouse.y));
      return uiCache.v;
    },
    endFrame: function () {
      pressedSet.clear();
      mouse.wheel = 0; mouse.clicked = false; mouse.rightClicked = false; mouse.dx = 0; mouse.dy = 0;
      frameNo++;
    },
    on: function (name, fn) {
      (handlers[name] = handlers[name] || []).push(fn);
      return function () { const a = handlers[name], i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); };
    },
    off: function (name, fn) { const a = handlers[name]; if (a) { const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); } }
  };
})();
