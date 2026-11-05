/* SP.assemblyParts — building / vehicle / ship part catalogs for the assembly editors.
 *
 * PartDef = { id, name, kind:'building'|'vehicle'|'ship', category, icon, cost (Primordiabucks),
 *             roles?:[...] (only offered for these design roles), core?:true,
 *             place:'any'|'top'|'side'|'bottom',   // legal surface orientation
 *             upAlign?:true,   // on side surfaces local +Z points world-up (doors, windows, signs)
 *             shape?:[...]     // extra placeable surface in the part's local frame ({t:'box'|'sph'|'cap'|'cyl'})
 *             stats:{ power, speed, health, defense, energy, range, capacity, happiness, production },
 *             sym?:true,       // pairs naturally (wheels, wings)
 *             build(design, part, colors) -> Object3D }
 * Local frame of a placed part: +Y = surface normal, base of the part at y=0, +Z = forward
 * (side surfaces with upAlign: +Z = up).  Cores are built directly in design space.
 * Animated bits are tagged via object.userData.anim = {type:'wheel'|'spin'|'flame'|'blink', ...}.
 */
(function () {
  'use strict';
  const SP = window.SP = window.SP || {};
  const T = THREE;

  // ---------- tiny geometry/mesh helpers ----------
  function M(g, col, ol, o) { return SP.render.cel(g, col, Object.assign({ outline: ol === undefined ? 0.07 : ol }, o || {})); }
  function G() { const g = new T.Group(); for (let i = 0; i < arguments.length; i++) if (arguments[i]) g.add(arguments[i]); return g; }
  function at(o, x, y, z, rx, ry, rz) { o.position.set(x || 0, y || 0, z || 0); if (rx || ry || rz) o.rotation.set(rx || 0, ry || 0, rz || 0); return o; }
  const box = (w, h, d) => new T.BoxGeometry(w, h, d);
  const cyl = (rt, rb, h, s) => new T.CylinderGeometry(rt, rb, h, s || 14);
  const sph = (r, a, b, ps, pl, ts, tl) => new T.SphereGeometry(r, a || 14, b || 10, ps, pl, ts, tl);
  const cone = (r, h, s) => new T.ConeGeometry(r, h, s || 12);
  const tor = (r, t, a, b) => new T.TorusGeometry(r, t, a || 8, b || 16);
  function capsule(r, len, seg) { // axis Y, total length len + 2r
    const pts = [], n = 6;
    for (let i = 0; i <= n; i++) { const a = -Math.PI / 2 + (i / n) * Math.PI / 2; pts.push(new T.Vector2(Math.max(0.0001, r * Math.cos(a)), -len / 2 + r * Math.sin(a))); }
    for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI / 2; pts.push(new T.Vector2(Math.max(0.0001, r * Math.cos(a)), len / 2 + r * Math.sin(a))); }
    return new T.LatheGeometry(pts, seg || 12);
  }
  function capZ(r, len, seg) { const g = capsule(r, len, seg); g.rotateX(Math.PI / 2); return g; }
  function prism(w, h, len) { // triangular roof prism, ridge along Z, base at y=0
    const g = new T.CylinderGeometry(1, 1, len, 3); g.rotateX(-Math.PI / 2);
    g.scale(w / 1.732, h / 1.5, 1); g.translate(0, 0.5 * h / 1.5, 0); return g;
  }
  function glowMat(hex, k) { return SP.render.toon(hex, { emissive: hex, emissiveIntensity: k === undefined ? 0.7 : k }); }
  function glow(g, hex, k, ol) { return SP.render.cel(g, hex, { material: glowMat(hex, k), outline: ol === undefined ? 0.06 : ol, cast: false }); }
  function anim(o, a) { o.userData.anim = a; return o; }

  const GLASS = 0x7dd3fc, WIN = 0xfde68a, METAL = 0x94a3b8, DARK = 0x1e293b, WOOD = 0x92400e, BRICK = 0xb45309,
    CREAM = 0xfffbeb, GOLD = 0xeab308, FLAME = 0xf97316, ROSE = 0xf43f5e, TEAL = 0x14b8a6, STEEL = 0x64748b;

  // ---------- registry ----------
  const list = [];
  const byId = {};
  function def(d) {
    d.stats = Object.assign({ power: 0, speed: 0, health: 0, defense: 0, energy: 0, range: 0, capacity: 0, happiness: 0, production: 0 }, d.stats || {});
    d.place = d.place || 'any';
    d.tier = d.tier || 1;
    d.unlockedByDefault = d.unlockedByDefault !== false;
    list.push(d); byId[d.id] = d; return d;
  }
  // P(kind, category, id, name, icon, cost, stats, opts, build)
  function P(kind, category, id, name, icon, cost, stats, opts, build) {
    return def(Object.assign({ id: id, name: name, kind: kind, category: category, icon: icon, cost: cost, stats: stats, build: build }, opts || {}));
  }

  const CATS = {
    building: {
      core: { name: 'Core', icon: '🏛️', color: '#22c55e' }, roofs: { name: 'Roofs', icon: '🏠', color: '#f43f5e' },
      structure: { name: 'Walls', icon: '🧱', color: '#6366f1' }, openings: { name: 'Doors', icon: '🚪', color: '#06b6d4' },
      industry: { name: 'Industry', icon: '🏭', color: '#f59e0b' }, signs: { name: 'Signs', icon: '🪧', color: '#ec4899' },
      decor: { name: 'Decor', icon: '🌳', color: '#a855f7' }
    },
    vehicle: {
      core: { name: 'Chassis', icon: '🚙', color: '#22c55e' }, wheels: { name: 'Wheels', icon: '🛞', color: '#6366f1' },
      propulsion: { name: 'Drive', icon: '🌀', color: '#06b6d4' }, wings: { name: 'Wings', icon: '🪽', color: '#38bdf8' },
      weapons: { name: 'Power', icon: '💥', color: '#f43f5e' }, armor: { name: 'Armour', icon: '🛡️', color: '#475569' },
      detail: { name: 'Details', icon: '💡', color: '#a855f7' }
    },
    ship: {
      core: { name: 'Hull', icon: '🛸', color: '#22c55e' }, engines: { name: 'Engines', icon: '🔥', color: '#f97316' },
      wings: { name: 'Wings', icon: '🪽', color: '#38bdf8' }, weapons: { name: 'Weapons', icon: '🔫', color: '#f43f5e' },
      utility: { name: 'Utility', icon: '📡', color: '#06b6d4' }, detail: { name: 'Details', icon: '💡', color: '#a855f7' }
    }
  };

  // =====================================================================================
  //  BUILDINGS
  // =====================================================================================
  const B = 'building';
  function slab(w, h, d, col, ol) { return at(M(box(w, h, d), col, ol), 0, h / 2, 0); }
  function core(kind, id, name, icon, cost, roles, stats, shape, build) {
    return def({ id: id, name: name, kind: kind, category: 'core', core: true, icon: icon, cost: cost, roles: roles, stats: stats, shape: shape, build: build, place: 'any' });
  }

  // cores -------------------------------------------------------------------------
  core(B, 'b_core_cottage', 'Cottage Block', '🏡', 40, ['house'], { capacity: 4, health: 30 },
    [{ t: 'box', c: [0, 1, 0], h: [1.8, 1, 1.8] }],
    (d, p, c) => G(slab(3.6, 2, 3.6, c.base), at(M(box(3.9, 0.25, 3.9), c.detail), 0, 0.12, 0)));
  core(B, 'b_core_tallhouse', 'Tall House', '🏘️', 60, ['house'], { capacity: 7, health: 40 },
    [{ t: 'box', c: [0, 1.7, 0], h: [1.3, 1.7, 1.3] }],
    (d, p, c) => G(slab(2.6, 3.4, 2.6, c.base), at(M(box(2.8, 0.2, 2.8), c.accent), 0, 1.7, 0)));
  core(B, 'b_core_roundhut', 'Round Hut', '🛖', 45, ['house'], { capacity: 5, health: 30 },
    [{ t: 'cyl', c: [0, 1.1, 0], r: 1.9, hh: 1.1 }],
    (d, p, c) => G(at(M(cyl(1.9, 1.9, 2.2, 18), c.base), 0, 1.1, 0), at(M(tor(1.9, 0.12, 6, 20), c.accent), 0, 1.4, 0, Math.PI / 2)));
  core(B, 'b_core_hall', 'Grand Hall', '🏛️', 120, ['cityhall'], { health: 120, capacity: 10, happiness: 5 },
    [{ t: 'box', c: [0, 1.5, 0], h: [3, 1.5, 2.1] }, { t: 'box', c: [0, 0.2, 0], h: [3.3, 0.2, 2.4] }],
    (d, p, c) => G(slab(6, 3, 4.2, c.base), at(M(box(6.6, 0.4, 4.8), c.detail), 0, 0.2, 0), at(M(box(6.2, 0.2, 4.4), c.accent), 0, 3, 0)));
  core(B, 'b_core_rotunda', 'Rotunda', '🕌', 140, ['cityhall'], { health: 140, capacity: 8, happiness: 8 },
    [{ t: 'cyl', c: [0, 1.6, 0], r: 2.8, hh: 1.6 }, { t: 'cyl', c: [0, 0.2, 0], r: 3.3, hh: 0.2 }],
    (d, p, c) => G(at(M(cyl(2.8, 2.8, 3.2, 20), c.base), 0, 1.6, 0), at(M(cyl(3.3, 3.3, 0.4, 20), c.detail), 0, 0.2, 0), at(M(cyl(2.95, 2.95, 0.25, 20), c.accent), 0, 3.2, 0)));
  core(B, 'b_core_keep', 'Civic Keep', '🏰', 160, ['cityhall'], { health: 200, capacity: 6, happiness: 2 },
    [{ t: 'box', c: [0, 2.2, 0], h: [2, 2.2, 2] }, { t: 'box', c: [0, 0.6, 0], h: [3, 0.6, 2.6] }],
    (d, p, c) => G(slab(4, 4.4, 4, c.base), slab(6, 1.2, 5.2, c.detail), at(M(box(4.3, 0.3, 4.3), c.accent), 0, 4.4, 0)));
  core(B, 'b_core_shed', 'Factory Shed', '🏭', 90, ['factory'], { production: 8, health: 60 },
    [{ t: 'box', c: [0, 1.2, 0], h: [3, 1.2, 1.9] }],
    (d, p, c) => G(slab(6, 2.4, 3.8, c.base), at(M(box(6.2, 0.2, 4), c.detail), 0, 2.4, 0)));
  core(B, 'b_core_silo', 'Silo Works', '🛢️', 110, ['factory'], { production: 10, health: 70 },
    [{ t: 'cyl', c: [-1.4, 2, 0], r: 1.3, hh: 2 }, { t: 'box', c: [1.4, 0.9, 0], h: [2, 0.9, 1.5] }],
    (d, p, c) => G(at(M(cyl(1.3, 1.3, 4, 16), c.base), -1.4, 2, 0), at(M(sph(1.3, 16, 8, 0, 6.3, 0, 1.6), c.accent), -1.4, 4, 0), slab(4, 1.8, 3, c.detail).translateX(1.4)));
  core(B, 'b_core_mill', 'Mill Hall', '🏗️', 130, ['factory'], { production: 14, health: 80 },
    [{ t: 'box', c: [-0.8, 1.2, 0], h: [2.4, 1.2, 2] }, { t: 'box', c: [1.8, 1.6, 0], h: [1.4, 1.6, 1.4] }],
    (d, p, c) => G(at(slab(4.8, 2.4, 4, c.base), -0.8, 0, 0), at(slab(2.8, 3.2, 2.8, c.accent), 1.8, 0, 0)));
  core(B, 'b_core_bigtop', 'Big Top', '🎪', 100, ['entertainment'], { happiness: 12, health: 30 },
    [{ t: 'cyl', c: [0, 0.8, 0], r: 2.8, hh: 0.8 }, { t: 'cap', a: [0, 1.6, 0], b: [0, 3.2, 0], r: 0.9 }],
    (d, p, c) => G(at(M(cyl(2.8, 2.8, 1.6, 20), c.base), 0, 0.8, 0), at(M(cone(2.9, 1.8, 20), c.accent), 0, 2.5, 0)));
  core(B, 'b_core_theatre', 'Theatre', '🎭', 130, ['entertainment'], { happiness: 16, health: 40 },
    [{ t: 'box', c: [0, 1.1, 0], h: [3, 1.1, 2.2] }, { t: 'box', c: [0, 0.15, 2.5], h: [1.5, 0.15, 0.5] }],
    (d, p, c) => G(slab(6, 2.2, 4.4, c.base), at(M(box(3, 0.3, 1), c.detail), 0, 0.15, 2.5), at(M(box(6.3, 0.2, 4.7), c.accent), 0, 2.2, 0)));
  core(B, 'b_core_arena', 'Fun Dome', '🎡', 150, ['entertainment'], { happiness: 20, health: 50 },
    [{ t: 'cyl', c: [0, 0.5, 0], r: 3, hh: 0.5 }, { t: 'sph', c: [0, 1, 0], r: 2.5 }],
    (d, p, c) => G(at(M(cyl(3, 3, 1, 20), c.detail), 0, 0.5, 0), at(M(sph(2.5, 20, 12, 0, 6.3, 0, 1.6), c.base), 0, 1, 0)));

  // roofs -------------------------------------------------------------------------
  P(B, 'roofs', 'b_roof_gable', 'Gable Roof', '🏠', 15, { health: 6 }, { place: 'top' },
    (d, p, c) => G(at(M(prism(4, 1.6, 4), c.accent), 0, 0, 0)));
  P(B, 'roofs', 'b_roof_flat', 'Flat Parapet', '⬛', 10, { defense: 3 }, { place: 'top' },
    (d, p, c) => G(at(M(box(3.9, 0.12, 3.9), c.detail), 0, 0.06, 0), at(M(box(3.9, 0.35, 0.18), c.accent), 0, 0.3, 1.86), at(M(box(3.9, 0.35, 0.18), c.accent), 0, 0.3, -1.86), at(M(box(0.18, 0.35, 3.5), c.accent), 1.86, 0.3, 0), at(M(box(0.18, 0.35, 3.5), c.accent), -1.86, 0.3, 0)));
  P(B, 'roofs', 'b_roof_pyramid', 'Pyramid Roof', '🔺', 18, { health: 5 }, { place: 'top' },
    (d, p, c) => at(M(cone(2.7, 1.7, 4), c.accent), 0, 0.85, 0, 0, Math.PI / 4, 0));
  P(B, 'roofs', 'b_roof_dome', 'Dome Roof', '🔵', 30, { happiness: 2, health: 5 }, { place: 'top', shape: [{ t: 'sph', c: [0, 0, 0], r: 1.4 }] },
    (d, p, c) => G(M(sph(1.4, 18, 10, 0, 6.2832, 0, 1.5708), c.accent), at(M(tor(1.4, 0.08, 6, 20), c.detail), 0, 0.02, 0, Math.PI / 2)));
  P(B, 'roofs', 'b_roof_turret', 'Cone Cap', '🧙', 12, {}, { place: 'top' },
    (d, p, c) => at(M(cone(1, 1.9, 10), c.accent), 0, 0.95, 0));
  P(B, 'roofs', 'b_roof_sawtooth', 'Sawtooth Roof', '🪚', 20, { production: 2 }, { place: 'top' },
    (d, p, c) => G(at(M(prism(2, 0.9, 3.8), c.accent), -1.4, 0, 0), at(M(prism(2, 0.9, 3.8), c.accent), 0.7, 0, 0)));
  P(B, 'roofs', 'b_roof_tiles', 'Tile Hip Roof', '🏘️', 22, { health: 8 }, { place: 'top' },
    (d, p, c) => G(at(M(box(3.9, 0.3, 3.9), c.accent), 0, 0.15, 0), at(M(box(2.8, 0.3, 2.8), c.detail), 0, 0.45, 0), at(M(box(1.6, 0.3, 1.6), c.accent), 0, 0.75, 0)));

  // walls / structure ---------------------------------------------------------------
  P(B, 'structure', 'b_annex', 'Annex Block', '🧱', 25, { capacity: 2, health: 10 }, { place: 'side', shape: [{ t: 'box', c: [0, 0.9, 0], h: [1.2, 0.9, 1.2] }] },
    (d, p, c) => at(M(box(2.4, 1.8, 2.4), c.base), 0, 0.9, 0));
  P(B, 'structure', 'b_tower_round', 'Round Tower', '🗼', 40, { defense: 6, health: 15 }, { place: 'top', shape: [{ t: 'cyl', c: [0, 1.7, 0], r: 0.75, hh: 1.7 }] },
    (d, p, c) => G(at(M(cyl(0.75, 0.8, 3.4, 14), c.base), 0, 1.7, 0), at(M(cyl(0.95, 0.95, 0.3, 14), c.detail), 0, 3.4, 0), at(M(cone(0.95, 1.1, 14), c.accent), 0, 4.05, 0)));
  P(B, 'structure', 'b_tower_square', 'Square Tower', '🏯', 40, { defense: 8, health: 20 }, { place: 'top', shape: [{ t: 'box', c: [0, 1.5, 0], h: [0.65, 1.5, 0.65] }] },
    (d, p, c) => G(at(M(box(1.3, 3, 1.3), c.base), 0, 1.5, 0), at(M(box(1.6, 0.3, 1.6), c.detail), 0, 3.1, 0), at(M(box(0.35, 0.4, 0.35), c.detail), 0.6, 3.45, 0.6), at(M(box(0.35, 0.4, 0.35), c.detail), -0.6, 3.45, 0.6), at(M(box(0.35, 0.4, 0.35), c.detail), 0.6, 3.45, -0.6), at(M(box(0.35, 0.4, 0.35), c.detail), -0.6, 3.45, -0.6)));
  P(B, 'structure', 'b_column', 'Column', '🏛️', 12, { health: 3 }, { place: 'top' },
    (d, p, c) => G(at(M(cyl(0.22, 0.26, 2.2, 10), c.detail), 0, 1.1, 0), at(M(box(0.7, 0.18, 0.7), c.accent), 0, 0.09, 0), at(M(box(0.7, 0.18, 0.7), c.accent), 0, 2.2, 0)));
  P(B, 'structure', 'b_steps', 'Front Steps', '🪜', 8, {}, { place: 'side', upAlign: true },
    (d, p, c) => G(at(M(box(2, 0.7, 0.35), c.detail), 0, 0.17, 0).translateY(0), at(M(box(1.6, 0.7, 0.35), c.detail), 0, 0.5, 0)).translateZ(0));
  P(B, 'structure', 'b_balcony', 'Balcony', '🪟', 14, { happiness: 1 }, { place: 'side', upAlign: true },
    (d, p, c) => G(at(M(box(1.8, 0.12, 0.9), c.detail), 0, 0.45, 0).rotateX(0), at(M(box(1.8, 0.4, 0.08), c.accent), 0, 0.2, 0)));
  P(B, 'structure', 'b_awning', 'Striped Awning', '⛱️', 10, { happiness: 1 }, { place: 'side', upAlign: true },
    (d, p, c) => { const g = G(at(M(box(1.8, 0.7, 0.08), c.accent), 0, 0.35, 0), at(M(box(1.8, 0.7, 0.085), c.detail), 0, 0.35, 0)); g.children[0].scale.set(1, 1, 1); return g; });

  // openings ----------------------------------------------------------------------
  P(B, 'openings', 'b_win_square', 'Square Window', '🪟', 4, { happiness: 1 }, { place: 'side', upAlign: true },
    (d, p, c) => G(at(M(box(0.95, 0.14, 0.95), c.detail, 0.08), 0, 0.07, 0), glow(box(0.7, 0.05, 0.7), WIN, 0.6).translateY(0.15)));
  P(B, 'openings', 'b_win_round', 'Porthole', '⭕', 4, { happiness: 1 }, { place: 'side', upAlign: true },
    (d, p, c) => G(at(M(cyl(0.5, 0.5, 0.14, 16), c.detail, 0.08), 0, 0.07, 0), glow(cyl(0.36, 0.36, 0.05, 16), WIN, 0.6).translateY(0.15)));
  P(B, 'openings', 'b_win_arch', 'Arched Window', '⛩️', 6, { happiness: 1 }, { place: 'side', upAlign: true },
    (d, p, c) => G(at(M(box(0.8, 0.14, 1.1), c.detail, 0.08), 0, 0.07, -0.05), at(M(cyl(0.4, 0.4, 0.14, 14), c.detail, 0.08), 0, 0.07, 0.5), glow(box(0.58, 0.05, 0.9), WIN, 0.6).translateY(0.15).translateZ(-0.05), glow(cyl(0.29, 0.29, 0.05, 14), WIN, 0.6).translateY(0.15).translateZ(0.4)));
  P(B, 'openings', 'b_win_wide', 'Shop Window', '🛍️', 8, { happiness: 2, production: 1 }, { place: 'side', upAlign: true },
    (d, p, c) => G(at(M(box(2.2, 0.14, 1.0), c.detail, 0.08), 0, 0.07, 0), glow(box(1.95, 0.05, 0.75), GLASS, 0.5).translateY(0.15)));
  P(B, 'openings', 'b_door_wood', 'Wooden Door', '🚪', 6, { defense: 1 }, { place: 'side', upAlign: true },
    (d, p, c) => G(at(M(box(1.0, 0.14, 1.6), WOOD, 0.08), 0, 0.07, 0), at(M(sph(0.07, 6, 5), GOLD, 0.1), 0.3, 0.2, 0), at(M(box(1.3, 0.1, 0.18), c.detail), 0, 0.05, 0.86)).translateZ(0));
  P(B, 'openings', 'b_door_double', 'Double Door', '🏛️', 10, { defense: 1, happiness: 1 }, { place: 'side', upAlign: true },
    (d, p, c) => G(at(M(box(1.9, 0.14, 1.9), c.accent, 0.08), 0, 0.07, 0), at(M(box(0.85, 0.16, 1.7), WOOD, 0.08), -0.45, 0.08, -0.05), at(M(box(0.85, 0.16, 1.7), WOOD, 0.08), 0.45, 0.08, -0.05)));
  P(B, 'openings', 'b_door_gate', 'Factory Gate', '🚧', 12, { production: 2, defense: 2 }, { place: 'side', upAlign: true },
    (d, p, c) => G(at(M(box(2.6, 0.16, 2.2), c.detail, 0.06), 0, 0.08, 0), at(M(box(2.3, 0.2, 1.9), STEEL, 0.06), 0, 0.1, -0.05), at(M(box(2.3, 0.22, 0.12), GOLD, 0.06), 0, 0.12, 0.3), at(M(box(2.3, 0.22, 0.12), GOLD, 0.06), 0, 0.12, -0.3)));

  // industry -----------------------------------------------------------------------
  P(B, 'industry', 'b_chimney', 'Brick Chimney', '🧯', 10, { production: 2 }, { place: 'top' },
    (d, p, c) => G(at(M(box(0.55, 1.5, 0.55), BRICK), 0, 0.75, 0), at(M(box(0.75, 0.2, 0.75), c.detail), 0, 1.55, 0), anim(at(M(sph(0.3, 8, 6), 0xe2e8f0, 0, { cast: false }), 0, 2.1, 0), { type: 'puff', rate: 1 })));
  P(B, 'industry', 'b_stack', 'Smokestack', '🏭', 25, { production: 5 }, { place: 'top', tier: 2 },
    (d, p, c) => G(at(M(cyl(0.45, 0.7, 3.4, 12), c.accent), 0, 1.7, 0), at(M(cyl(0.55, 0.55, 0.3, 12), DARK), 0, 3.4, 0), anim(at(M(sph(0.45, 8, 6), 0xcbd5e1, 0, { cast: false }), 0, 4.1, 0), { type: 'puff', rate: 0.8 })));
  P(B, 'industry', 'b_tank', 'Storage Tank', '🛢️', 30, { production: 3, capacity: 2 }, { place: 'top', shape: [{ t: 'cyl', c: [0, 0.9, 0], r: 0.85, hh: 0.9 }] },
    (d, p, c) => G(at(M(cyl(0.85, 0.85, 1.8, 14), c.base), 0, 0.9, 0), at(M(sph(0.85, 14, 6, 0, 6.3, 0, 1.6), c.accent), 0, 1.8, 0)));
  P(B, 'industry', 'b_pipes', 'Pipework', '➿', 14, { production: 2 }, { place: 'side' },
    (d, p, c) => G(at(M(cyl(0.18, 0.18, 2.4, 8), STEEL), 0, 0.2, 0, 0, 0, Math.PI / 2).translateY(0), at(M(cyl(0.18, 0.18, 1.2, 8), STEEL), 1.2, 0.2, 0.6, Math.PI / 2, 0, 0)));
  P(B, 'industry', 'b_crane', 'Gantry Crane', '🏗️', 45, { production: 6, capacity: 2 }, { place: 'top', tier: 2 },
    (d, p, c) => G(at(M(box(0.3, 2.6, 0.3), c.accent), 0, 1.3, 0), at(M(box(0.25, 0.25, 2.8), c.accent), 0, 2.7, 0.9), at(M(box(0.08, 1, 0.08), DARK, 0.1), 0, 2.2, 2), at(M(box(0.4, 0.3, 0.4), GOLD), 0, 1.65, 2)));
  P(B, 'industry', 'b_vent', 'Roof Fan', '🌀', 8, { production: 1 }, { place: 'top' },
    (d, p, c) => G(at(M(cyl(0.5, 0.5, 0.4, 12), STEEL), 0, 0.2, 0), anim(G(at(M(box(0.9, 0.05, 0.16), c.detail, 0.1), 0, 0, 0), at(M(box(0.16, 0.05, 0.9), c.detail, 0.1), 0, 0, 0)).translateY(0.46), { type: 'spin', axis: 'y', rate: 5 })));

  // signs ---------------------------------------------------------------------------
  P(B, 'signs', 'b_sign_board', 'Wooden Sign', '🪧', 5, { happiness: 1 }, { place: 'any', upAlign: true },
    (d, p, c) => G(at(M(box(1.5, 0.12, 0.7), c.accent, 0.08), 0, 0.06, 0), at(M(box(1.2, 0.14, 0.4), CREAM, 0.08), 0, 0.07, 0)));
  P(B, 'signs', 'b_sign_neon', 'Neon Sign', '💡', 14, { happiness: 3 }, { place: 'any', upAlign: true },
    (d, p, c) => G(at(M(box(1.8, 0.14, 0.8), DARK, 0.06), 0, 0.07, 0), anim(glow(box(1.5, 0.06, 0.45), 0xe879f9, 1, 0.06).translateY(0.16), { type: 'blink', rate: 1.6 })));
  P(B, 'signs', 'b_billboard', 'Billboard', '📺', 22, { happiness: 4, production: 1 }, { place: 'top' },
    (d, p, c) => G(at(M(box(0.2, 1.4, 0.2), STEEL), -0.8, 0.7, 0), at(M(box(0.2, 1.4, 0.2), STEEL), 0.8, 0.7, 0), at(M(box(2.6, 1.3, 0.16), c.detail), 0, 1.7, 0), glow(box(2.3, 1.0, 0.06), c.accent, 0.5).translateY(1.7).translateZ(0.1)));
  P(B, 'signs', 'b_flag', 'Flag Pole', '🚩', 6, { happiness: 1 }, { place: 'top' },
    (d, p, c) => G(at(M(cyl(0.06, 0.06, 2.4, 6), STEEL, 0.1), 0, 1.2, 0), anim(at(M(box(0.08, 0.55, 0.9), c.accent, 0.08), 0, 2.1, 0.5), { type: 'wave', rate: 3 })));
  P(B, 'signs', 'b_clock', 'Clock Face', '🕰️', 18, { happiness: 3 }, { place: 'side', upAlign: true },
    (d, p, c) => G(at(M(cyl(0.6, 0.6, 0.16, 20), CREAM, 0.08), 0, 0.08, 0), at(M(tor(0.6, 0.07, 6, 20), c.detail), 0, 0.12, 0, Math.PI / 2), at(M(box(0.07, 0.05, 0.4), DARK, 0.1), 0, 0.2, 0.18), at(M(box(0.3, 0.05, 0.07), DARK, 0.1), 0.12, 0.2, 0)));

  // decor ---------------------------------------------------------------------------
  P(B, 'decor', 'b_statue', 'Hero Statue', '🗽', 35, { happiness: 6 }, { place: 'top' },
    (d, p, c) => G(at(M(box(0.9, 0.5, 0.9), c.detail), 0, 0.25, 0), at(M(cyl(0.2, 0.28, 1.0, 8), GOLD), 0, 1, 0), at(M(sph(0.24, 10, 8), GOLD), 0, 1.7, 0), at(M(cyl(0.05, 0.05, 0.7, 6), GOLD, 0.1), 0.35, 1.9, 0, 0, 0, -0.3)));
  P(B, 'decor', 'b_fountain', 'Fountain', '⛲', 28, { happiness: 5 }, { place: 'top' },
    (d, p, c) => G(at(M(cyl(1.0, 1.1, 0.35, 16), c.detail), 0, 0.17, 0), at(M(cyl(0.85, 0.85, 0.1, 16), 0x22d3ee, 0.04, { material: SP.render.toon(0x22d3ee, { transparent: true, opacity: 0.8 }) }), 0, 0.33, 0), at(M(cyl(0.12, 0.2, 1, 8), c.detail), 0, 0.7, 0), at(M(sph(0.3, 10, 6, 0, 6.3, 0, 1.6), 0x22d3ee, 0.06), 0, 1.15, 0)));
  P(B, 'decor', 'b_tree', 'Potted Tree', '🌳', 8, { happiness: 2 }, { place: 'top' },
    (d, p, c) => G(at(M(cyl(0.12, 0.16, 0.8, 7), WOOD), 0, 0.4, 0), at(M(new T.DodecahedronGeometry(0.6, 0), 0x22c55e), 0, 1.1, 0), at(M(new T.DodecahedronGeometry(0.4, 0), 0x16a34a), 0.3, 1.45, 0.1)));
  P(B, 'decor', 'b_lamp', 'Lamp Post', '🏮', 6, { happiness: 1 }, { place: 'top' },
    (d, p, c) => G(at(M(cyl(0.06, 0.08, 1.7, 6), DARK, 0.1), 0, 0.85, 0), glow(sph(0.2, 8, 6), WIN, 0.9).translateY(1.8)));
  P(B, 'decor', 'b_dish', 'Satellite Dish', '📡', 20, { happiness: 2, production: 1 }, { place: 'top' },
    (d, p, c) => G(at(M(cyl(0.1, 0.14, 0.8, 8), STEEL), 0, 0.4, 0), anim(G(G(at(M(sph(0.75, 12, 6, 0, 6.3, 0, 1.2), CREAM, 0.07), 0, 0, 0, Math.PI, 0, 0), at(M(cyl(0.03, 0.03, 0.7, 5), DARK, 0.1), 0, -0.35, 0)).rotateX(0.5)).translateY(1.2), { type: 'spin', axis: 'y', rate: 0.5 })));
  P(B, 'decor', 'b_solar', 'Solar Panel', '🔆', 24, { production: 2, happiness: 1 }, { place: 'top' },
    (d, p, c) => G(at(M(box(0.1, 0.5, 0.1), STEEL, 0.1), 0, 0.25, 0), at(M(box(1.8, 0.1, 1.2), 0x1d4ed8, 0.06), 0, 0.65, 0, 0.5, 0, 0)));
  P(B, 'decor', 'b_cannon', 'Defence Turret', '🛡️', 50, { defense: 12, power: 4 }, { place: 'top', tier: 3 },
    (d, p, c) => G(at(M(cyl(0.6, 0.7, 0.5, 12), c.detail), 0, 0.25, 0), at(M(sph(0.5, 10, 8), c.accent), 0, 0.7, 0), at(M(cyl(0.12, 0.12, 1.2, 8), DARK), 0, 0.85, 0.7, Math.PI / 2, 0, 0)));

  // =====================================================================================
  //  VEHICLES
  // =====================================================================================
  const V = 'vehicle';
  core(V, 'v_core_buggy', 'Buggy Frame', '🏎️', 60, ['land'], { speed: 6, health: 30, capacity: 1 },
    [{ t: 'box', c: [0, 0.65, 0], h: [0.95, 0.25, 1.7] }, { t: 'box', c: [0, 1.05, -0.5], h: [0.6, 0.2, 0.6] }],
    (d, p, c) => G(at(M(box(1.9, 0.5, 3.4), c.base), 0, 0.65, 0), at(M(box(1.2, 0.4, 1.2), c.accent), 0, 1.05, -0.5), at(M(box(0.9, 0.12, 0.9), c.detail), 0, 0.95, 1.1)));
  core(V, 'v_core_truck', 'Truck Chassis', '🚚', 80, ['land'], { speed: 4, health: 60, capacity: 3 },
    [{ t: 'box', c: [0, 0.75, -0.4], h: [1.1, 0.3, 2.2] }, { t: 'box', c: [0, 1.4, 1.5], h: [1, 0.6, 0.7] }],
    (d, p, c) => G(at(M(box(2.2, 0.6, 4.4), c.base), 0, 0.75, -0.4), at(M(box(2.0, 1.2, 1.4), c.accent), 0, 1.4, 1.5), glow(box(1.6, 0.4, 0.05), GLASS, 0.3).translateY(1.65).translateZ(2.23)));
  core(V, 'v_core_tank', 'Tank Hull', '🪖', 110, ['land'], { speed: 3, health: 90, defense: 10 },
    [{ t: 'box', c: [0, 0.8, 0], h: [1.3, 0.4, 2], r: 0.1 }],
    (d, p, c) => G(at(M(box(2.6, 0.8, 4), c.base), 0, 0.8, 0), at(M(box(2.3, 0.2, 1.2), c.detail), 0, 1.25, 1.5)));
  core(V, 'v_core_boat', 'Skiff Hull', '🚤', 60, ['sea'], { speed: 5, health: 40, capacity: 1 },
    [{ t: 'cap', a: [0, 0.5, -1.2], b: [0, 0.5, 1.2], r: 0.8 }],
    (d, p, c) => G(at(M(capZ(0.8, 2.4, 14), c.base), 0, 0.5, 0), at(M(box(1.1, 0.12, 1.8), c.detail), 0, 1.0, -0.1)));
  core(V, 'v_core_cat', 'Catamaran', '⛵', 90, ['sea'], { speed: 6, health: 60, capacity: 2 },
    [{ t: 'cap', a: [-1, 0.45, -1.4], b: [-1, 0.45, 1.4], r: 0.45 }, { t: 'cap', a: [1, 0.45, -1.4], b: [1, 0.45, 1.4], r: 0.45 }, { t: 'box', c: [0, 0.95, 0], h: [1.3, 0.12, 1.2] }],
    (d, p, c) => G(at(M(capZ(0.45, 2.8, 12), c.base), -1, 0.45, 0), at(M(capZ(0.45, 2.8, 12), c.base), 1, 0.45, 0), at(M(box(2.8, 0.24, 2.4), c.accent), 0, 0.95, 0)));
  core(V, 'v_core_barge', 'Armoured Barge', '🚢', 120, ['sea'], { speed: 3, health: 100, defense: 8, capacity: 3 },
    [{ t: 'box', c: [0, 0.7, 0], h: [1.4, 0.45, 2.4], r: 0.2 }],
    (d, p, c) => G(at(M(box(2.8, 0.9, 4.8), c.base), 0, 0.7, 0), at(M(box(2.5, 0.12, 4.4), c.detail), 0, 1.2, 0)));
  core(V, 'v_core_jet', 'Jet Fuselage', '✈️', 100, ['air'], { speed: 9, health: 40 },
    [{ t: 'cap', a: [0, 1, -1.2], b: [0, 1, 1.5], r: 0.55 }],
    (d, p, c) => G(at(M(capZ(0.55, 2.7, 14), c.base), 0, 1, 0), at(M(cone(0.4, 0.9, 12), c.accent), 0, 1, 2.35).rotateX(Math.PI / 2), glow(sph(0.42, 10, 6, 0, 6.3, 0, 1.5), GLASS, 0.3).translateY(1.4).translateZ(0.9)));
  core(V, 'v_core_heli', 'Chopper Pod', '🚁', 100, ['air'], { speed: 5, health: 50, capacity: 2 },
    [{ t: 'sph', c: [0, 1.1, 0], r: 1.0 }, { t: 'cap', a: [0, 1.2, -1.2], b: [0, 1.2, -2.6], r: 0.25 }],
    (d, p, c) => G(at(M(sph(1.0, 16, 12), c.base), 0, 1.1, 0), at(M(capZ(0.25, 1.4, 8), c.accent), 0, 1.2, -1.9), glow(sph(0.8, 12, 8, 0, 6.3, 0, 1.4), GLASS, 0.3).translateY(1.25).translateZ(0.35)));
  core(V, 'v_core_saucer', 'Hover Saucer', '🛸', 130, ['air'], { speed: 7, health: 60 },
    [{ t: 'cyl', c: [0, 1, 0], r: 1.9, hh: 0.3 }, { t: 'sph', c: [0, 1.3, 0], r: 0.9 }],
    (d, p, c) => G(at(M(cyl(1.9, 1.2, 0.6, 20), c.base), 0, 1, 0), at(M(sph(0.9, 14, 8, 0, 6.3, 0, 1.6), GLASS, 0.06), 0, 1.3, 0), glow(tor(1.7, 0.07, 6, 24), c.accent, 0.8).translateY(1.0).rotateX(Math.PI / 2)));

  // wheels / tracks
  function wheel(r, w, c, tread, spokes) {
    const spin = new T.Group();
    spin.add(M(cyl(r, r, w, 16), tread || DARK), at(M(cyl(r * 0.6, r * 0.6, w * 1.12, 10), c.detail, 0.06), 0, 0, 0));
    for (let i = 0; i < (spokes || 0); i++) spin.add(at(M(box(r * 1.5, w * 1.2, r * 0.12), c.accent, 0.06), 0, 0, 0, 0, i * Math.PI / (spokes), 0));
    spin.position.y = w / 2;
    const g = new T.Group(); g.add(spin);
    spin.rotation.set(0, 0, 0); g.userData.anim = { type: 'wheel', target: spin, r: r }; g.userData.rotAxis = 'y';
    // the cylinder axis is local Y; the wheel stands on its edge relative to the surface normal
    return g;
  }
  P(V, 'wheels', 'v_wheel_small', 'Buggy Wheel', '🛞', 12, { speed: 1.5, health: 2 }, { roles: ['land'], place: 'side', sym: true, tier: 1 },
    (d, p, c) => wheel(0.45, 0.35, c, DARK, 3));
  P(V, 'wheels', 'v_wheel_big', 'Monster Wheel', '🚜', 22, { speed: 1, health: 5, defense: 1 }, { roles: ['land'], place: 'side', sym: true, tier: 2 },
    (d, p, c) => wheel(0.8, 0.6, c, DARK, 4));
  P(V, 'wheels', 'v_wheel_slick', 'Racing Slick', '🏁', 20, { speed: 3 }, { roles: ['land'], place: 'side', sym: true, tier: 2 },
    (d, p, c) => wheel(0.5, 0.5, c, DARK, 0));
  P(V, 'wheels', 'v_tread', 'Tank Tread', '⚙️', 34, { speed: 0.8, defense: 4, health: 8 }, { roles: ['land'], place: 'side', sym: true, tier: 2 },
    (d, p, c) => { const g = G(at(M(box(0.9, 0.5, 3.0), DARK, 0.05), 0, 0.25, 0));
      for (let i = -1; i <= 1; i++) { const w = at(M(cyl(0.32, 0.32, 0.56, 10), c.detail, 0.05), 0, 0.28, i * 1.0); g.add(w); }
      g.userData.anim = { type: 'wheel', target: g.children[1], r: 0.32 }; return g; });
  P(V, 'wheels', 'v_hover', 'Hover Pad', '🧲', 38, { speed: 2, health: 3 }, { roles: ['land', 'sea'], place: 'bottom', sym: true, tier: 3 },
    (d, p, c) => G(at(M(cyl(0.55, 0.7, 0.2, 14), c.detail), 0, 0.1, 0), glow(cyl(0.5, 0.5, 0.06, 14), 0x22d3ee, 0.9).translateY(0.22), anim(glow(tor(0.55, 0.05, 6, 16), 0x22d3ee, 0.9).translateY(0.05).rotateX(Math.PI / 2), { type: 'blink', rate: 3 })));
  P(V, 'wheels', 'v_float', 'Pontoon Float', '🛟', 16, { speed: 0.5, defense: 2, health: 6 }, { roles: ['sea'], place: 'side', sym: true },
    (d, p, c) => G(at(M(capZ(0.28, 1.6, 10), c.accent), 0, 0.35, 0).rotateZ(-Math.PI / 2)));
  P(V, 'wheels', 'v_ski', 'Landing Skid', '🎿', 8, { health: 3 }, { roles: ['air'], place: 'bottom', sym: true },
    (d, p, c) => G(at(M(cyl(0.07, 0.07, 2.2, 8), STEEL), 0, 0.06, 0, Math.PI / 2, 0, 0), at(M(cyl(0.05, 0.05, 0.6, 6), STEEL), 0, 0.3, 0.7), at(M(cyl(0.05, 0.05, 0.6, 6), STEEL), 0, 0.3, -0.7)));

  // propulsion
  P(V, 'propulsion', 'v_prop_boat', 'Screw Propeller', '🌀', 20, { speed: 2.5 }, { roles: ['sea'], place: 'any', tier: 1 },
    (d, p, c) => G(at(M(cyl(0.08, 0.08, 0.5, 8), STEEL), 0, 0.25, 0), anim(G(at(M(box(0.9, 0.05, 0.22), c.accent, 0.1), 0, 0, 0, 0, 0, 0.3), at(M(box(0.22, 0.05, 0.9), c.accent, 0.1), 0, 0, 0, 0.3, 0, 0), at(M(sph(0.12, 8, 6), c.detail), 0, 0, 0)).translateY(0.55), { type: 'spin', axis: 'y', rate: 14, throttle: true })));
  P(V, 'propulsion', 'v_outboard', 'Outboard Motor', '🛥️', 28, { speed: 3.5, power: 1 }, { roles: ['sea'], place: 'any', tier: 2 },
    (d, p, c) => G(at(M(box(0.45, 0.8, 0.5), c.accent), 0, 0.4, 0), at(M(cyl(0.07, 0.07, 0.9, 8), STEEL), 0, 0.15, -0.0), anim(G(at(M(box(0.6, 0.05, 0.14), c.detail, 0.1), 0, 0, 0), at(M(box(0.14, 0.05, 0.6), c.detail, 0, 0.1), 0, 0, 0)).translateY(1), { type: 'spin', axis: 'y', rate: 20, throttle: true })));
  P(V, 'propulsion', 'v_rudder', 'Rudder Fin', '🔱', 8, { speed: 0.3, defense: 1 }, { roles: ['sea', 'air'], place: 'any' },
    (d, p, c) => at(M(box(0.1, 0.9, 0.7), c.accent), 0, 0.45, 0));
  P(V, 'propulsion', 'v_rotor', 'Main Rotor', '🚁', 30, { speed: 3, power: 1 }, { roles: ['air'], place: 'top', tier: 2 },
    (d, p, c) => G(at(M(cyl(0.1, 0.1, 0.45, 8), STEEL), 0, 0.22, 0), anim(G(at(M(box(4.4, 0.05, 0.28), c.accent, 0.1), 0, 0, 0), at(M(box(0.28, 0.05, 4.4), c.accent, 0.1), 0, 0, 0), at(M(cyl(0.17, 0.17, 0.12, 8), c.detail), 0, 0, 0)).translateY(0.5), { type: 'spin', axis: 'y', rate: 16, throttle: false })));
  P(V, 'propulsion', 'v_tailrotor', 'Tail Rotor', '🌬️', 14, { speed: 1 }, { roles: ['air'], place: 'any', tier: 1 },
    (d, p, c) => anim(G(at(M(box(0.7, 0.05, 0.12), c.accent, 0.1), 0, 0, 0), at(M(box(0.12, 0.05, 0.7), c.accent, 0.1), 0, 0, 0)).translateY(0.3), { type: 'spin', axis: 'y', rate: 22 }));
  P(V, 'propulsion', 'v_jet', 'Jet Engine', '🚀', 40, { speed: 4, power: 1 }, { roles: ['air', 'land', 'sea'], place: 'any', tier: 2, sym: true },
    (d, p, c) => G(at(M(cyl(0.34, 0.28, 1.2, 12), c.accent), 0, 0.6, 0), at(M(cyl(0.26, 0.4, 0.3, 12), DARK), 0, 0, 0), anim(glow(cone(0.24, 0.8, 10), FLAME, 1).translateY(-0.5).rotateX(Math.PI), { type: 'flame', base: 0.7 })));
  P(V, 'propulsion', 'v_exhaust', 'Exhaust Pipes', '💨', 10, { speed: 0.6, power: 0.5 }, { roles: ['land'], place: 'any', sym: true },
    (d, p, c) => G(at(M(cyl(0.1, 0.1, 0.9, 8), STEEL), 0, 0.45, 0), at(M(cyl(0.14, 0.1, 0.2, 8), DARK), 0, 0.9, 0), anim(at(M(sph(0.16, 7, 5), 0xcbd5e1, 0, { cast: false }), 0, 1.15, 0), { type: 'puff', rate: 1.4 })));

  // wings
  function wingGeo(span, chord, thick, sweep) { // along +Y (out of surface), chord along Z, taper
    const g = new T.BufferGeometry();
    const hw = thick / 2, tip = chord * 0.45;
    const v = [
      -hw, 0, chord / 2, hw, 0, chord / 2, hw, 0, -chord / 2, -hw, 0, -chord / 2,
      -hw * 0.5, span, tip / 2 - sweep, hw * 0.5, span, tip / 2 - sweep, hw * 0.5, span, -tip / 2 - sweep, -hw * 0.5, span, -tip / 2 - sweep
    ];
    const idx = [0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7, 4, 5, 6, 4, 6, 7, 0, 3, 2, 0, 2, 1];
    g.setAttribute('position', new T.Float32BufferAttribute(v, 3)); g.setIndex(idx); g.computeVertexNormals();
    return g;
  }
  function flatGeo(g) { const n = g.toNonIndexed(); n.computeVertexNormals(); return n; }
  P(V, 'wings', 'v_wing_straight', 'Straight Wing', '🛩️', 22, { speed: 1, health: 3 }, { roles: ['air'], place: 'side', sym: true },
    (d, p, c) => M(flatGeo(wingGeo(2.2, 1.1, 0.12, 0.1)), c.accent, 0.06));
  P(V, 'wings', 'v_wing_swept', 'Swept Wing', '🦅', 32, { speed: 2.5, health: 2 }, { roles: ['air'], place: 'side', sym: true, tier: 2 },
    (d, p, c) => M(flatGeo(wingGeo(2.0, 1.6, 0.1, 0.9)), c.accent, 0.06));
  P(V, 'wings', 'v_wing_short', 'Stub Wing', '🔺', 16, { power: 1, health: 4 }, { roles: ['air', 'land', 'sea'], place: 'side', sym: true },
    (d, p, c) => M(flatGeo(wingGeo(1.0, 1.0, 0.14, 0.2)), c.detail, 0.07));
  P(V, 'wings', 'v_tailfin', 'Tail Fin', '🔼', 10, { speed: 0.5 }, { place: 'top' },
    (d, p, c) => at(M(flatGeo(wingGeo(1.2, 1.1, 0.1, 0.5)), c.accent, 0.07), 0, 0, 0));
  P(V, 'wings', 'v_spoiler', 'Racing Spoiler', '🏎️', 14, { speed: 1 }, { roles: ['land'], place: 'top' },
    (d, p, c) => G(at(M(box(0.1, 0.5, 0.1), c.detail), -0.7, 0.25, 0), at(M(box(0.1, 0.5, 0.1), c.detail), 0.7, 0.25, 0), at(M(box(1.9, 0.07, 0.5), c.accent), 0, 0.55, 0)));

  // power / weapons (military / economic / religious)
  P(V, 'weapons', 'v_gun', 'Machine Gun', '🔫', 25, { power: 5 }, { place: 'top', sym: true },
    (d, p, c) => G(at(M(cyl(0.22, 0.28, 0.3, 10), c.detail), 0, 0.15, 0), at(M(box(0.3, 0.3, 0.5), c.accent), 0, 0.45, 0), at(M(cyl(0.06, 0.06, 0.9, 6), DARK, 0.1), 0, 0.45, 0.65, Math.PI / 2, 0, 0)));
  P(V, 'weapons', 'v_cannon', 'Cannon', '💣', 45, { power: 11 }, { place: 'top', tier: 2 },
    (d, p, c) => G(at(M(cyl(0.45, 0.55, 0.35, 12), c.detail), 0, 0.17, 0), at(M(sph(0.5, 12, 8), c.accent), 0, 0.55, 0), at(M(cyl(0.13, 0.17, 1.5, 10), DARK), 0, 0.6, 0.95, Math.PI / 2, 0, 0)));
  P(V, 'weapons', 'v_missiles', 'Missile Pod', '🚀', 60, { power: 14, range: 2 }, { place: 'any', tier: 3, sym: true },
    (d, p, c) => { const g = G(at(M(box(0.9, 0.5, 1.0), c.detail), 0, 0.25, 0)); for (let i = 0; i < 4; i++) g.add(at(M(cyl(0.12, 0.12, 0.3, 8), ROSE, 0.1), -0.27 + (i % 2) * 0.54, 0.35 + Math.floor(i / 2) * 0.0, 0.56, Math.PI / 2, 0, 0)); return g; });
  P(V, 'weapons', 'v_laser', 'Laser Lance', '⚡', 80, { power: 18, energy: -1 }, { place: 'top', tier: 3 },
    (d, p, c) => G(at(M(cyl(0.3, 0.4, 0.4, 10), c.detail), 0, 0.2, 0), at(M(cyl(0.12, 0.2, 1.4, 8), c.accent), 0, 0.7, 0.4, Math.PI / 2 - 0.3, 0, 0), glow(sph(0.18, 8, 6), 0xf43f5e, 1).translateY(0.95).translateZ(1.05)));
  P(V, 'weapons', 'v_sales', 'Sales Dish', '💰', 40, { power: 8, range: 3 }, { place: 'top', tier: 2 },
    (d, p, c) => G(at(M(cyl(0.12, 0.18, 0.5, 8), STEEL), 0, 0.25, 0), anim(G(G(at(M(sph(0.8, 14, 6, 0, 6.3, 0, 1.2), GOLD, 0.07), 0, 0, 0, Math.PI, 0, 0), at(M(cyl(0.04, 0.04, 0.6, 5), DARK, 0.1), 0, -0.3, 0), at(M(sph(0.12, 6, 5), ROSE, 0.1), 0, -0.6, 0)).rotateX(-0.5)).translateY(0.95), { type: 'spin', axis: 'y', rate: 1.2 })));
  P(V, 'weapons', 'v_preacher', 'Holo Dome', '🔮', 55, { power: 9, range: 4 }, { place: 'top', tier: 3 },
    (d, p, c) => G(at(M(cyl(0.45, 0.55, 0.3, 14), c.detail), 0, 0.15, 0), glow(sph(0.5, 14, 10, 0, 6.3, 0, 1.6), 0xe879f9, 0.7).translateY(0.3), anim(glow(tor(0.6, 0.04, 6, 20), 0xe879f9, 1).translateY(0.8).rotateX(Math.PI / 2), { type: 'spin', axis: 'z', rate: 2 })));
  P(V, 'weapons', 'v_flame', 'Flamethrower', '🔥', 35, { power: 7, range: 1 }, { place: 'top', roles: ['land', 'sea'] },
    (d, p, c) => G(at(M(cyl(0.2, 0.25, 0.4, 8), c.detail), 0, 0.2, 0), at(M(cyl(0.08, 0.12, 1, 8), DARK), 0, 0.5, 0.5, Math.PI / 2, 0, 0), anim(glow(cone(0.16, 0.5, 8), FLAME, 1).translateY(0.5).translateZ(1.2).rotateX(Math.PI / 2), { type: 'flame', base: 0.6 })));

  // armour
  P(V, 'armor', 'v_plate', 'Armour Plate', '🛡️', 18, { defense: 5, health: 10 }, { place: 'side', sym: true },
    (d, p, c) => at(M(box(0.2, 0.14, 1.8), c.detail), 0, 0.07, 0).rotateZ(0));
  P(V, 'armor', 'v_plate_top', 'Roof Plate', '⬛', 16, { defense: 4, health: 8 }, { place: 'top' },
    (d, p, c) => at(M(box(1.6, 0.14, 1.6), c.detail), 0, 0.07, 0));
  P(V, 'armor', 'v_spikes', 'Spike Ram', '🌵', 22, { power: 3, defense: 3 }, { place: 'any', sym: true },
    (d, p, c) => { const g = new T.Group(); for (let i = -1; i <= 1; i++) g.add(at(M(cone(0.14, 0.6, 6), METAL, 0.1), i * 0.35, 0.3, 0)); return g; });
  P(V, 'armor', 'v_bullbar', 'Bull Bar', '🐂', 20, { defense: 4, health: 6 }, { place: 'side' },
    (d, p, c) => G(at(M(cyl(0.09, 0.09, 1.8, 8), c.detail), 0, 0.3, 0, 0, 0, Math.PI / 2), at(M(cyl(0.07, 0.07, 0.4, 6), c.detail), 0.8, 0.15, 0), at(M(cyl(0.07, 0.07, 0.4, 6), c.detail), -0.8, 0.15, 0)));
  P(V, 'armor', 'v_shield', 'Energy Shield', '🔰', 70, { defense: 14, energy: -1 }, { place: 'top', tier: 3 },
    (d, p, c) => G(at(M(cyl(0.2, 0.28, 0.2, 10), c.detail), 0, 0.1, 0), anim(glow(sph(0.9, 12, 8), 0x38bdf8, 0.35).translateY(0.7), { type: 'blink', rate: 0.7 })));

  // details
  P(V, 'detail', 'v_cockpit', 'Bubble Canopy', '🫧', 14, { health: 2 }, { place: 'top' },
    (d, p, c) => G(glow(sph(0.6, 14, 8, 0, 6.3, 0, 1.6), GLASS, 0.3), at(M(tor(0.6, 0.05, 6, 16), c.detail), 0, 0.02, 0, Math.PI / 2)));
  P(V, 'detail', 'v_light', 'Headlights', '🔦', 6, { range: 1 }, { place: 'any', sym: true },
    (d, p, c) => G(at(M(cyl(0.2, 0.2, 0.15, 10), c.detail, 0.08), 0, 0.07, 0), glow(cyl(0.14, 0.14, 0.05, 10), WIN, 1).translateY(0.16)));
  P(V, 'detail', 'v_beacon', 'Beacon Light', '🚨', 8, {}, { place: 'top' },
    (d, p, c) => G(at(M(cyl(0.2, 0.25, 0.15, 8), DARK), 0, 0.07, 0), anim(glow(sph(0.2, 8, 6), ROSE, 1).translateY(0.28), { type: 'blink', rate: 2.5 })));
  P(V, 'detail', 'v_antenna', 'Antenna', '📡', 6, { range: 1 }, { place: 'top' },
    (d, p, c) => G(at(M(cyl(0.025, 0.04, 1.6, 5), STEEL, 0.12), 0, 0.8, 0), at(M(sph(0.07, 6, 5), ROSE, 0.1), 0, 1.65, 0)));
  P(V, 'detail', 'v_flag', 'Team Flag', '🚩', 5, {}, { place: 'top' },
    (d, p, c) => G(at(M(cyl(0.03, 0.03, 1.4, 5), STEEL, 0.12), 0, 0.7, 0), anim(at(M(box(0.05, 0.4, 0.7), c.accent, 0.08), 0, 1.2, 0.38), { type: 'wave', rate: 4 })));
  P(V, 'detail', 'v_cargo', 'Cargo Crate', '📦', 18, { capacity: 3 }, { place: 'top' },
    (d, p, c) => G(at(M(box(1.2, 0.8, 1.2), WOOD), 0, 0.4, 0), at(M(box(1.25, 0.1, 0.2), c.detail), 0, 0.4, 0)));
  P(V, 'detail', 'v_stripe', 'Racing Stripe', '🟦', 4, {}, { place: 'top' },
    (d, p, c) => at(M(box(0.35, 0.04, 2.2), c.accent, 0.04), 0, 0.02, 0));

  // =====================================================================================
  //  SHIPS
  // =====================================================================================
  const S = 'ship';
  core(S, 's_core_dart', 'Dart Hull', '🛩️', 100, ['ship'], { speed: 8, health: 40, energy: 20, range: 3 },
    [{ t: 'cap', a: [0, 0, -1.4], b: [0, 0, 1.6], r: 0.65 }],
    (d, p, c) => G(at(M(capZ(0.65, 3, 14), c.base), 0, 0, 0), at(M(cone(0.5, 1.0, 12), c.accent), 0, 0, 2.55).rotateX(Math.PI / 2), glow(sph(0.5, 10, 6, 0, 6.3, 0, 1.4), GLASS, 0.3).translateY(0.5).translateZ(0.7)));
  core(S, 's_core_saucer', 'Saucer Hull', '🛸', 120, ['ship'], { speed: 6, health: 60, energy: 30, range: 2, capacity: 2 },
    [{ t: 'cyl', c: [0, 0, 0], r: 2.4, hh: 0.35 }, { t: 'sph', c: [0, 0.4, 0], r: 1.1 }],
    (d, p, c) => G(at(M(cyl(2.4, 1.6, 0.7, 24), c.base), 0, 0, 0), at(M(sph(1.1, 16, 8, 0, 6.3, 0, 1.6), GLASS, 0.06), 0, 0.35, 0), glow(tor(2.2, 0.08, 6, 28), c.accent, 0.8).translateY(0.0).rotateX(Math.PI / 2)));
  core(S, 's_core_cruiser', 'Cruiser Hull', '🚀', 160, ['ship'], { speed: 5, health: 110, energy: 40, range: 4, capacity: 4 },
    [{ t: 'box', c: [0, 0, 0], h: [0.9, 0.55, 2.8], r: 0.15 }],
    (d, p, c) => G(at(M(box(1.8, 1.1, 5.6), c.base), 0, 0, 0), at(M(cone(0.9, 1.4, 4), c.accent), 0, 0, 3.4, Math.PI / 2, 0, Math.PI / 4), at(M(box(1.2, 0.3, 2), c.detail), 0, 0.65, -0.4)));
  core(S, 's_core_pod', 'Egg Pod', '🥚', 80, ['ship'], { speed: 4, health: 50, energy: 25, range: 2, capacity: 3 },
    [{ t: 'sph', c: [0, 0, 0], r: 1.5 }],
    (d, p, c) => G(at(M(sph(1.5, 18, 12), c.base), 0, 0, 0), glow(sph(1.0, 12, 8, 0, 6.3, 0, 1.0), GLASS, 0.3).translateY(0.6).translateZ(0.8).rotateX(0.6)));
  core(S, 's_core_wedge', 'Wedge Hull', '🔷', 140, ['ship'], { speed: 7, health: 70, energy: 35, range: 3 },
    [{ t: 'box', c: [0, 0, -0.4], h: [1.3, 0.4, 1.9], r: 0.1 }, { t: 'box', c: [0, 0, 1.6], h: [0.5, 0.3, 0.9], r: 0.1 }],
    (d, p, c) => G(at(M(box(2.6, 0.8, 3.8), c.base), 0, 0, -0.4), at(M(box(1.0, 0.6, 1.8), c.accent), 0, 0, 1.6), at(M(box(1.0, 0.3, 1.0), c.detail), 0, 0.5, -0.8)));

  P(S, 'engines', 's_eng_small', 'Ion Thruster', '🔥', 25, { speed: 2, energy: -1 }, { place: 'any', sym: true },
    (d, p, c) => G(at(M(cyl(0.3, 0.38, 0.7, 12), c.detail), 0, 0.35, 0), at(M(cyl(0.34, 0.2, 0.2, 12), DARK), 0, 0, 0), anim(glow(cone(0.22, 0.9, 10), 0x38bdf8, 1).translateY(-0.4).rotateX(Math.PI), { type: 'flame', base: 0.7 })));
  P(S, 'engines', 's_eng_big', 'Plasma Drive', '☄️', 55, { speed: 5, energy: -3, range: 1 }, { place: 'any', tier: 2 },
    (d, p, c) => G(at(M(cyl(0.6, 0.75, 1.0, 14), c.accent), 0, 0.5, 0), at(M(cyl(0.7, 0.5, 0.3, 14), DARK), 0, 0, 0), anim(glow(cone(0.45, 1.6, 12), 0xf97316, 1).translateY(-0.8).rotateX(Math.PI), { type: 'flame', base: 0.6 })));
  P(S, 'engines', 's_eng_triple', 'Triple Nozzle', '🔱', 70, { speed: 6, energy: -4 }, { place: 'any', tier: 3 },
    (d, p, c) => { const g = G(at(M(box(1.6, 0.5, 0.8), c.detail), 0, 0.25, 0)); for (let i = -1; i <= 1; i++) { g.add(at(M(cyl(0.22, 0.3, 0.5, 10), DARK), i * 0.55, 0, 0)); g.add(anim(glow(cone(0.16, 0.8, 8), FLAME, 1).translateX(i * 0.55).translateY(-0.55).rotateX(Math.PI), { type: 'flame', base: 0.6 })); } return g; });
  P(S, 'engines', 's_warp', 'Warp Ring', '🌌', 120, { range: 5, energy: -6 }, { place: 'any', tier: 4 },
    (d, p, c) => G(anim(glow(tor(1.1, 0.14, 8, 26), 0xa855f7, 1).translateY(0.3).rotateX(Math.PI / 2), { type: 'spin', axis: 'z', rate: 1.5 }), at(M(cyl(0.12, 0.12, 0.6, 6), c.detail), 0, 0.3, 0)));
  P(S, 'engines', 's_battery', 'Power Cell', '🔋', 30, { energy: 25 }, { place: 'any', sym: true, shape: [{ t: 'cap', a: [0, 0.3, 0], b: [0, 0.8, 0], r: 0.35 }] },
    (d, p, c) => G(at(M(capsule(0.35, 0.5, 10), c.accent), 0, 0.55, 0), glow(cyl(0.2, 0.2, 0.1, 8), 0x84cc16, 1).translateY(1.0)));
  P(S, 'wings', 's_wing_delta', 'Delta Wing', '🔺', 35, { speed: 2, health: 6 }, { place: 'side', sym: true },
    (d, p, c) => M(flatGeo(wingGeo(2.2, 2.0, 0.14, 0.9)), c.accent, 0.06));
  P(S, 'wings', 's_wing_fin', 'Swept Fin', '🦈', 22, { speed: 1.5, health: 3 }, { place: 'any', sym: true },
    (d, p, c) => M(flatGeo(wingGeo(1.3, 1.2, 0.1, 0.6)), c.detail, 0.07));
  P(S, 'wings', 's_wing_solar', 'Solar Wing', '☀️', 40, { energy: 18 }, { place: 'side', sym: true },
    (d, p, c) => G(at(M(cyl(0.05, 0.05, 0.6, 5), STEEL), 0, 0.3, 0), at(M(box(2.2, 0.06, 1.1), 0x1d4ed8, 0.05), 0, 1.0, 0).translateY(0).rotateZ(0), at(M(box(0.06, 2.2, 1.1), 0x1d4ed8, 0.05), 0, 1.4, 0)));
  P(S, 'weapons', 's_laser', 'Laser Cannon', '⚡', 50, { power: 8, energy: -2 }, { place: 'any', sym: true },
    (d, p, c) => G(at(M(cyl(0.2, 0.28, 0.4, 10), c.detail), 0, 0.2, 0), at(M(cyl(0.09, 0.12, 1.0, 8), DARK), 0, 0.9, 0), glow(sph(0.12, 8, 6), ROSE, 1).translateY(1.45)));
  P(S, 'weapons', 's_missile', 'Missile Pod', '🚀', 65, { power: 14, range: 1 }, { place: 'any', tier: 2, sym: true },
    (d, p, c) => { const g = G(at(M(box(0.8, 0.5, 1), c.detail), 0, 0.25, 0)); for (let i = 0; i < 3; i++) g.add(at(M(cone(0.12, 0.4, 8), ROSE, 0.1), -0.25 + i * 0.25, 0.55, 0.2)); return g; });
  P(S, 'weapons', 's_turret', 'Gun Turret', '🔫', 45, { power: 6, defense: 2 }, { place: 'any', sym: true },
    (d, p, c) => G(at(M(cyl(0.35, 0.45, 0.3, 12), c.detail), 0, 0.15, 0), at(M(sph(0.32, 10, 8), c.accent), 0, 0.5, 0), at(M(cyl(0.06, 0.06, 0.8, 6), DARK, 0.1), -0.14, 0.55, 0.4, Math.PI / 2, 0, 0), at(M(cyl(0.06, 0.06, 0.8, 6), DARK, 0.1), 0.14, 0.55, 0.4, Math.PI / 2, 0, 0)));
  P(S, 'weapons', 's_beam', 'Tractor Beam', '🧲', 80, { power: 3, capacity: 3, range: 1 }, { place: 'bottom', tier: 3 },
    (d, p, c) => G(at(M(cyl(0.5, 0.7, 0.35, 14), c.detail), 0, 0.17, 0), anim(glow(cone(0.5, 1.4, 12), 0x84cc16, 0.5).translateY(-0.5).rotateX(Math.PI), { type: 'blink', rate: 1.2 })));
  P(S, 'utility', 's_antenna', 'Antenna Array', '📡', 14, { range: 1 }, { place: 'top' },
    (d, p, c) => G(at(M(cyl(0.03, 0.05, 1.5, 5), STEEL, 0.12), 0, 0.75, 0), at(M(box(0.8, 0.05, 0.05), STEEL, 0.12), 0, 1.2, 0), at(M(box(0.5, 0.05, 0.05), STEEL, 0.12), 0, 1.45, 0), at(M(sph(0.08, 6, 5), ROSE, 0.1), 0, 1.55, 0)));
  P(S, 'utility', 's_dish', 'Comms Dish', '📶', 22, { range: 2 }, { place: 'top' },
    (d, p, c) => G(at(M(cyl(0.1, 0.15, 0.5, 8), STEEL), 0, 0.25, 0), anim(G(G(at(M(sph(0.7, 14, 6, 0, 6.3, 0, 1.2), CREAM, 0.07), 0, 0, 0, Math.PI, 0, 0), at(M(cyl(0.03, 0.03, 0.5, 5), DARK, 0.1), 0, -0.3, 0)).rotateX(-0.6)).translateY(0.8), { type: 'spin', axis: 'y', rate: 0.6 })));
  P(S, 'utility', 's_cargo', 'Cargo Pod', '📦', 30, { capacity: 6, defense: 1 }, { place: 'any', sym: true, shape: [{ t: 'sph', c: [0, 0.6, 0], r: 0.6 }] },
    (d, p, c) => G(at(M(sph(0.6, 12, 10), c.base), 0, 0.6, 0), at(M(tor(0.6, 0.06, 6, 16), c.detail), 0, 0.6, 0, Math.PI / 2)));
  P(S, 'utility', 's_tank', 'Fuel Tank', '⛽', 28, { range: 2, energy: 10 }, { place: 'any', sym: true, shape: [{ t: 'cap', a: [0, 0.3, -0.35], b: [0, 0.3, 0.35], r: 0.4 }] },
    (d, p, c) => at(M(capZ(0.4, 0.7, 10), c.accent), 0, 0.35, 0));
  P(S, 'utility', 's_shield', 'Shield Emitter', '🛡️', 60, { defense: 12, energy: -2 }, { place: 'top', tier: 2 },
    (d, p, c) => G(at(M(cyl(0.3, 0.4, 0.3, 10), c.detail), 0, 0.15, 0), anim(glow(tor(0.4, 0.06, 6, 16), 0x38bdf8, 1).translateY(0.5).rotateX(Math.PI / 2), { type: 'spin', axis: 'z', rate: 3 })));
  P(S, 'utility', 's_scanner', 'Scanner Bulb', '🔬', 35, { range: 3 }, { place: 'bottom', tier: 2 },
    (d, p, c) => G(at(M(cyl(0.08, 0.1, 0.5, 6), STEEL), 0, 0.25, 0), glow(sph(0.35, 10, 8), 0x84cc16, 0.5).translateY(0.7)));
  P(S, 'detail', 's_light', 'Nav Light', '💡', 5, {}, { place: 'any', sym: true },
    (d, p, c) => anim(glow(sph(0.12, 8, 6), 0x22c55e, 1).translateY(0.1), { type: 'blink', rate: 1.8 }));
  P(S, 'detail', 's_dome', 'Command Dome', '🔘', 20, { health: 5, defense: 1 }, { place: 'top' },
    (d, p, c) => G(glow(sph(0.55, 12, 8, 0, 6.3, 0, 1.6), GLASS, 0.3), at(M(tor(0.55, 0.05, 6, 16), c.detail), 0, 0.02, 0, Math.PI / 2)));
  P(S, 'detail', 's_stripe', 'Hull Stripe', '🟥', 4, {}, { place: 'top' },
    (d, p, c) => at(M(box(0.4, 0.04, 2.4), c.accent, 0.04), 0, 0.02, 0));
  P(S, 'detail', 's_plate', 'Armour Plating', '⬛', 18, { defense: 6, health: 12 }, { place: 'any', sym: true },
    (d, p, c) => at(M(box(1.2, 0.14, 1.6), c.detail), 0, 0.07, 0));
  P(S, 'detail', 's_spike', 'Ram Spike', '📍', 15, { power: 3 }, { place: 'any' },
    (d, p, c) => at(M(cone(0.25, 1.2, 8), METAL, 0.08), 0, 0.6, 0));

  SP.assemblyParts = {
    list: list,
    categories: CATS,
    get(id) { return byId[id] || null; },
    byKind(kind) { return list.filter(function (p) { return p.kind === kind; }); },
    cores(kind, role) { return list.filter(function (p) { return p.kind === kind && p.core && (!role || !p.roles || p.roles.indexOf(role) >= 0); }); },
    // palette contents for a design: { category: PartDef[] } (non-core parts filtered by role)
    forDesign(design) {
      const out = {};
      list.forEach(function (p) {
        if (p.kind !== design.kind) return;
        if (p.roles && design.role && p.roles.indexOf(design.role) < 0) return;
        (out[p.category] = out[p.category] || []).push(p);
      });
      return out;
    },
    roles: { building: ['house', 'cityhall', 'factory', 'entertainment'], vehicle: ['land', 'sea', 'air'], ship: ['ship'] }
  };
})();
