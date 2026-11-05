# Art Style Guide

The look comes from the prototype (`docs/prototype_reference.html`): **chunky toy-like primitives,
3-tone cel shading, thick ink outlines, saturated candy palette, comic-book UI**. Every system
must use the shared helpers in `js/core/render.js` and `css/style.css` so the whole game reads as
one product. Do not introduce PBR materials, textures, post-processing, or photoreal anything.

## 1. Rendering rules

### 1.1 Cel shading
- Material: `THREE.MeshToonMaterial` with the shared 3-step gradient map (NearestFilter):
  shadow `(55,60,75)`, mid `(165,172,190)`, highlight `(255,255,255)`.
- Always get materials via `SP.render.toon(hex, opts)` (cached per colour/option set).
  Vertex-coloured meshes (terrain) use `SP.render.toon(0xffffff, {vertexColors:true})`.
- Emissive is allowed for glow things (bioluminescent cells, spice, engines, city lights at night):
  `SP.render.toon(hex, {emissive: hex, emissiveIntensity: 0.6})`.

### 1.2 Ink outlines
- Inverted hull: child mesh using the same geometry, `MeshBasicMaterial({color: INK, side: BackSide})`,
  scaled by `1 + t`. Use `SP.render.cel(geo, hex, {outline: t})`.
- Thickness `t`: big bodies 0.05-0.07, medium parts 0.08, small details (teeth, pupils) 0.09-0.10,
  terrain/planet 0 (planet gets a silhouette rim instead, see §4), particles 0.
- For instanced props (trees, rocks) use `SP.render.celInstanced(geo, hex, count, {outline})`, which
  returns a pair of InstancedMeshes sharing matrices. Never create thousands of individual outlined meshes.
- INK colour `0x080c14` everywhere (outline, UI borders, text stroke).

### 1.3 Lighting (per scene)
`SP.render.makeLights(scene, preset)`:
- Ambient `0xfff7ed` @ 0.75
- Sun directional `0xffedd5` @ 1.25, casts shadows (2048 map in editor, 1024 in world)
- Rim directional `0x38bdf8` @ 0.45 from the opposite side
Presets tint these: `cell` (teal ambient), `night` (blue ambient 0.45, sun 0.3), `space` (no ambient fill, strong sun).

### 1.4 Shapes
- Build from primitives: spheres, capsules (sphere+cylinder), cones, dodecahedrons, tori, boxes.
- Low segment counts are part of the look (8-16 radial segments). Foliage = dodecahedrons.
- Squash and stretch on every animated thing (landing, eating, hit reactions).
- Eyes: white sphere + dark pupil sphere slightly forward (cartoon look). Pupils track targets.

## 2. Palette

### 2.1 Creature pigment palette (player paint swatches)
| Name | Hex |
|---|---|
| Emerald | `#22c55e` |
| Cyan | `#06b6d4` |
| Purple | `#a855f7` |
| Orange | `#f97316` |
| Rose | `#f43f5e` |
| Gold | `#eab308` |
| Sky | `#38bdf8` |
| Lime | `#84cc16` |
| Pink | `#ec4899` |
| Teal | `#14b8a6` |
| Brown | `#92400e` |
| Slate | `#475569` |

Secondary/bone default: cream `#fffbeb`. Dark accent: `#1e293b`. Mouth interior: wine `#881337`.
Claws/horn: amber `#d97706`. Beak: `#f59e0b`.

### 2.2 Environment
| Use | Hex |
|---|---|
| Background / void | `#0d121d` |
| Grass | `#4d7c0f` (dark) `#65a30d` (mid) `#84cc16` (light) |
| Forest canopy | `#15803d`, `#22c55e` |
| Trunk | `#78350f` |
| Sand | `#fcd34d` / `#fde68a` |
| Rock | `#334155`, `#475569`, `#64748b` |
| Snow | `#e2e8f0` |
| Shallow water | `#22d3ee` α0.75 |
| Deep water | `#0e7490` |
| Tool/lab metal | `#272f44` with cyan glow `#22d3ee` |

### 2.3 Stage moods
- **Cell:** deep teal water `#0b3b4a` → `#062430` gradient with teal depth fog (`#06222c`), warm key
  light (`#ffe6c4`) from upper-left plus a teal rim light from behind, floating motes and real 3D bubbles.
  Everything is a 3D toon model seen from a tilted overhead camera (no SVG/sprite look): cells are plump
  translucent membranes with fresnel rim, ink outline, nucleus/organelles visible inside, glossy highlights,
  3D eyes and tube flagella/cilia; food is 3D (algae blob clusters with fronds, meat chunks with fat and bone,
  glowing plankton orbs), pickups are faceted shard crystals. Floor has sand ripples, rocks and swaying kelp;
  blurred blob backdrop and contact shadows give depth.
- **Creature:** prototype greens, warm sun, day/night cycle with purple dusk `#7c3aed` tint.
- **Tribal:** warm ochre `#d97706`, campfire orange, totem reds, hut straw `#fbbf24`.
- **Civilization:** each nation has one bright team colour from the pigment palette; buildings cream
  + team colour; spice is magenta `#e879f9` emissive.
- **Space:** navy void `#0d121d`, stars as additive points, nebula blobs, planets cel-shaded with
  a thin glow ring, empires as coloured rings.

## 3. UI style (comic panels)

Defined in `css/style.css` (hand-written; no Tailwind dependency):

- Font: **Fredoka** 500-800 from Google Fonts, fallback `"Trebuchet MS", sans-serif`.
- `.panel` — `rgba(18,24,38,0.94)` fill, `3.5px solid #080c14` border, `border-radius 18px`,
  `box-shadow: 0 6px 0 #080c14, inset 0 2px 0 rgba(255,255,255,.12)`.
- `.btn` — 3px ink border, `box-shadow 0 4px 0 #080c14`, presses down 3.5px on :active.
  Colour variants: `.btn-green .btn-cyan .btn-purple .btn-rose .btn-amber .btn-slate .btn-indigo`.
- `.stroke` / `.stroke-sm` — ink text-shadow outline for headings and numbers.
- Floating popups (`.pop`) rise and fade over ~1s with an overshoot scale (prototype `popUpFade`).
- Meters: rounded bars, slate track `#1e293b` with ink border, coloured fill with a white inner highlight.
- Emoji are acceptable as icons (🧬 🍓 ⚔️ 🎵 🦴 🥚). Keep them consistent per concept:
  DNA 🧬, food 🍓/🍖, health ❤️, social 🎵, attack ⚔️, speed 💨, primordiabucks 💰, spice ✨.
- Category label colours: body emerald, legs indigo, weapons rose, eyes cyan, mouths amber,
  social pink, detail purple.
- Layout: HUD in corners, never cover the centre of the screen. Must work at 1280×720 and at phone
  width (panels collapse, bottom toolbars scroll horizontally).

## 4. Planets
- Terrain is one icosphere with vertex colours by biome and height, toon shaded, **flat shading**
  for faceted low-poly look.
- Water is a second sphere at sea level, toon material, `#22d3ee` α0.8, gently pulsing.
- Atmosphere: a slightly larger back-face sphere, additive, `#7dd3fc` α0.25 (gives the outline/rim).
- From space, planets keep the same terrain colours so the homeworld is recognisable.

## 5. Editor look
- Cell editor uses the same volumetric cell model as the stage (membrane, organelles, tube whips) on the turntable.
- Turntable pedestal from the prototype: `#272f44` cylinder with a glowing cyan torus ring.
- Background: radial gradient from `#1e293b` to `#0d121d`, faint grid.
- Selected part: cyan outline instead of ink. Hovered drop point: cyan ghost preview at 50% opacity.
- Spine handles: small white spheres with ink outline; the selected vertebra is gold.

## 6. FX
- Particles are tiny unlit/toon cubes (prototype) or tetrahedra, no outline, life 0.5-1s, gravity.
- Hit: red cubes + white flash; Eat: green or red cubes; Level-up: gold confetti + ring burst;
  Social success: pink hearts/notes (sprites made of small meshes or emoji popups).
- Text popups in world space use `SP.ui.popup(worldPos, text, cls)`.

## 7. Audio direction
Procedural WebAudio only (no assets): bubbly blips in Cell, chirps and thumps in Creature,
drums in Tribal, synth stabs in Civ, pads in Space. Every button click, part placement, eat, hit,
level-up and stage transition has a sound. Master mute button in the top bar.

## Scale guide (Tribal / world units)
- Tribe member: largest dimension ~1.6 u (humanoid-pet scale; `MEMBER_DIM` in tribal.js). Chieftain x1.3, baby x0.5 growing to 1. Rival members the same (x0.92).
- Tribal normalizes every creature: `fitScale(stats, target)` = target / max(height, 0.75*length), clamped 0.15..1.3, so long-legged or brain-scaled designs shrink while keeping proportions. Physics radius (min 0.28), mass, `body.scale` and anim stride (`rig.scale`) all use the fitted scale; UI offsets (health bars, tags, crown, selection) use `hOf(e)` = stats.height * rig.scale.
- Animals: `animalTarget` = 1.6 * (dim/2.4)^0.75 clamped 0.45..4.5 u (small critters under member size, epic <= ~4.5 u, below hut/tree height).
- Props: huts 3-4.6 u tall (~3.1 u wide), totem ~4-5 u, trees 5-9 u, rocks 0.5-3 u, bushes ~1.5 u, campfire ~1-1.5 u tall, food pile ~1.2 u, tool huts ~2.5 u. Tree/rock colliders use trunk/rock radius only (~0.4-0.5 u trees).
