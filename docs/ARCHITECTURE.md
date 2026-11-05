# Architecture & Code Contracts

This is the contract that lets several engineers build modules in parallel. **If you need to change
a public signature listed here, keep the old one working** and note the change at the bottom of this
file under "Changelog".

## 1. Tech decisions
- **Three.js r128**, vendored at `lib/three.min.js` (global `THREE`). No npm build, no bundler.
- **Plain classic scripts** (no ES modules), so the game runs from `file://` and from any static host.
  Every file is an IIFE that attaches to the global namespace `window.SP`:
  ```js
  (function () { 'use strict'; const SP = window.SP = window.SP || {}; /* ... */ SP.thing = {...}; })();
  ```
- No external CSS frameworks. `css/style.css` holds the comic UI (see ART.md §3). Google Fonts link for
  Fredoka is optional (fallback fonts must look fine offline).
- Every `localStorage` access wrapped in try/catch.
- Target 60 fps on a mid laptop; 30 fps minimum. Keep draw calls < 600: instancing for props.

## 2. Files and load order (index.html lists them in this exact order)
```
lib/three.min.js
js/core/util.js        SP.util
js/core/render.js      SP.render
js/core/camera.js      SP.cam
js/core/input.js       SP.input
js/core/ui.js          SP.ui
js/core/audio.js       SP.audio
js/core/save.js        SP.save
js/creature/parts.js   SP.parts       (catalog for cell, creature, outfit)
js/creature/model.js   SP.creature (design schema, stats, validation)
js/creature/mesh.js    SP.creature.build
js/creature/anim.js    SP.creature.animate
js/creature/gen.js     SP.creature.generate
js/editors/catalogs.js SP.assemblyParts (building, vehicle, ship catalogs)
js/editors/assembly.js SP.assembly
js/editors/editor.js   SP.editor
js/world/planet.js     SP.planet, SP.surf
js/world/sky.js        SP.sky
js/world/physics.js    SP.physics
js/world/eco.js        SP.eco
js/stages/intro.js     SP.stages.intro
js/stages/cell.js      SP.stages.cell
js/stages/creature.js  SP.stages.creature
js/stages/tribal.js    SP.stages.tribal
js/stages/civ.js       SP.stages.civ
js/stages/space.js     SP.stages.space
js/core/game.js        SP.game  (boots on DOMContentLoaded — loaded last)
```
A stage may add private helper files named `js/stages/<stage>_*.js`; add them to index.html directly
after the stage's main file.

## 3. Coordinate conventions
- Y up. Creature local space: **+Z forward**, +X is the creature's left side (three.js right-handed:
  facing +Z, +X is to the creature's left). Mirror plane is x = 0. Ground at local y = 0 after `build()` (the rig lifts the body so the feet touch 0).
- Planet: centre at origin. Surface point = `dir * planet.surfaceRadius(dir)`. Up = `dir` (normalised position).
- Time in seconds, distances in units (≈ metres).
- Colours are numbers (`0x22c55e`) in JS, strings in CSS.

## 4. Module APIs

### 4.1 SP.util
```
rng(seed:number|string) -> { next():[0,1), range(a,b), int(a,b) inclusive, pick(arr), chance(p), shuffle(arr), seed }
hashStr(s) -> uint32
noise3(x,y,z) -> [-1,1]   (simplex, deterministic; SP.util.setNoiseSeed(seed))
fbm3(x,y,z, octaves=4, lacunarity=2, gain=0.5) -> ~[-1,1]
clamp, lerp, invLerp, smoothstep, damp(a,b,lambda,dt), angleLerp, wrapAngle
uid(prefix) -> 'p_12'
debounce(fn, ms)
```

### 4.2 SP.render
```
init(containerEl)                       // creates SP.render.renderer (WebGLRenderer, antialias, shadows)
renderer                                // THREE.WebGLRenderer
INK = 0x080c14; PALETTE = [..12 pigment colours from ART.md..]; COLORS = { bone, darkAccent, mouth, claw, beak, bg }
gradientMap                             // the 3-tone DataTexture
toon(hex, opts={}) -> MeshToonMaterial  // cached; opts: {vertexColors, emissive, emissiveIntensity, transparent, opacity, side, flatShading}
toonRim(hex, opts) -> MeshToonMaterial with fresnel rim/glint (opts: vertexColors, opacity, rim, rimStrength, rimAt, spec, emissive, emissiveIntensity, depthWrite); cloneRim(src, clone) re-applies it after material.clone()
outlineMaterial(hex=INK) -> MeshBasicMaterial BackSide
cel(geometry, hex, opts={}) -> Mesh     // opts: {outline=0.07, cast=true, receive=true, material}; outline child named 'outline'
celInstanced(geometry, hex, count, opts) -> { mesh:InstancedMesh, outline:InstancedMesh|null, setMatrixAt(i,m), update() , group:Group }
makeLights(scene, preset='day') -> { ambient, sun, rim, setPreset(name) }   // presets: day, night, cell, editor, space
render(scene, camera)
onResize(fn)                             // registers callback(w,h); render handles renderer.setSize
disposeTree(object3D)                    // dispose geometries (not cached materials)
particles(scene) -> { burst(pos:Vector3, hex, count=12, speed=1, opts), update(dt) }   // prototype cube particles
```

### 4.3 SP.cam
```
new SP.cam.Follow({ fov=55, distance=14, minDist=5, maxDist=45, pitch=0.45 })
   .camera (PerspectiveCamera), .target (Vector3), .up (Vector3, surface normal), .yaw, .pitch, .distance
   .update(dt)            // smooth follow; right-mouse drag orbits; wheel zooms (reads SP.input)
   .forwardOnSurface() -> Vector3 tangent forward (for camera-relative WASD)
new SP.cam.Iso({ frustum=16 })   // orthographic isometric like the prototype; .camera, .target, .zoom, .update(dt)
new SP.cam.Top({ frustum=30 })   // orthographic top-down (cell stage); .camera, .target, .zoom
new SP.cam.Tilt({ fov=38, pitch=1.0, distance, stiffness })  // tilted perspective (cell stage); .camera, .target, .distance, .groundSize(), .distanceFor(groundHeight), .update(dt), .pointerToWorld(out,h), .toScreen(v,out), .dispose()
new SP.cam.RTS({ distance=60, min=20, max=160 })  // perspective, planet-aware, edge/WASD pan, wheel zoom; .camera, .focusDir(Vector3 unit), .update(dt)
```
All cameras update their projection on resize automatically.

### 4.4 SP.input
```
isDown(code)            // KeyboardEvent.code, e.g. 'KeyW', 'ShiftLeft', 'Space'
pressed(code)           // true only in the frame it went down
mouse = { x, y, ndc: Vector2, left, right, middle, wheel (delta this frame), clicked (left click this frame, not a drag), rightClicked, dragging }
raycast(camera, objects, recursive=true) -> intersections[]
pointerOverUI()         // true if the pointer is over an element with pointer-events (don't act on world)
endFrame()              // called by game loop
on(eventName, fn)       // 'keydown', 'click', 'rightclick', 'wheel' with raw events
```

### 4.5 SP.ui
DOM layers: `#hud` (stage HUD, cleared on stage change), `#popups`, `#toasts`, `#modal`, `#editor-ui`.
```
el(tag, className, html?) -> HTMLElement
clearHud()
panel(className?) -> HTMLElement (class 'panel')
button(label, { icon, color:'green'|'cyan'|..., onClick, title, small }) -> HTMLButtonElement
bar({ label, icon, color, max=100, width }) -> { el, set(v, max?) }
counter({ icon, label, color }) -> { el, set(text) }
popup(worldPos:Vector3, camera, text, cls='pop-gold')    // floating text
toast(text, icon='ℹ️', ms=2500)
modal({ title, body(html or element), buttons:[{label,color,onClick,close=true}], closable=true }) -> { close() }
banner(title, subtitle, ms=2500)        // big centred stage title
stageCard({ stage, card, title, lines:[...], onContinue })   // end-of-stage summary
abilityBar(abilities:[{id, icon, key, level, cooldown}]) -> { el, setCooldown(id, frac), setActive(id,bool), setLevels(map) }
minimap({ size=160 }) -> { el, draw(fn(ctx, w, h)) }   // 2D canvas
help(htmlLines[])                       // H key help overlay content for the current stage
```

### 4.6 SP.audio
```
init() (on first user gesture), sfx(name, opts), music(mood|null), setMuted(bool), muted
names: click, place, remove, eat, crunch, hit, hurt, die, levelup, dna, social_ok, social_bad,
       sing, dance, charm, pose, charge, spit, jump, mate, splash, build, coin, warp, laser, alarm, win
moods: cell, creature, tribal, civ, space, editor, title
```

### 4.7 SP.save
```
load() -> campaign|null ; save(campaign) ; clear() ; has() ; exportDesign(design) -> string ; importDesign(str) -> design|null
```

### 4.8 SP.game
```
state                   // campaign object (schema §5)
registerStage(stageObj)  // stage files call SP.game.registerStage(SP.stages.cell) at load — or game reads SP.stages
goto(stageId, opts={})  // exits current, enters next, shows banner, autosaves
current                 // active stage object
openEditor(opts) -> Promise<result|null>   // pauses current stage, runs SP.editor, resumes; see 4.12
completeStage(cardId, summaryLines)        // shows stageCard, records card, goes to the next stage
time, dt, paused
newCampaign(seed?) -> campaign
defaultCampaignFor(stageId, seed) -> campaign   // plausible history so any stage can start directly
dev: URL params  ?stage=cell|creature|tribal|civ|space  ?editor=cell|creature|outfit|building|vehicle|ship
                 ?seed=123  ?skipintro=1  ?fast=1 (progress ×5, for testing)
```
**Stage object contract** (each `js/stages/*.js` defines `SP.stages.<id>`):
```
{
  id: 'cell', title: 'Cell Stage', next: 'creature',
  scene: THREE.Scene, camera: THREE.Camera,      // what game renders each frame (set in enter)
  enter(campaign, opts),   // build scene + HUD (use SP.ui into #hud). Do not assume previous stage objects exist.
  update(dt, t),           // game loop; not called while paused or while editor is open
  exit(),                  // dispose scene, remove listeners, clear timers
  pause?(), resume?(),     // optional; editor open/close calls these
  serialize?() -> object   // stage-specific save blob written into campaign[id]
}
```
Game loop: `requestAnimationFrame`, `dt = min(0.05, real dt)`, calls `current.update`, then
`SP.render.render(current.scene, current.camera)`, then `SP.input.endFrame()`.
When the editor is open, game renders the editor's scene/camera instead.

### 4.9 SP.parts (creature-scale catalog)
```
SP.parts.list            // array of PartDef
SP.parts.get(id) -> PartDef
SP.parts.byCategory(kind:'cell'|'creature'|'outfit') -> { categoryName: PartDef[] }
PartDef = {
  id:'mouth_jaw_1', name:'Snapper Jaw', kind:'creature'|'cell'|'outfit',
  category:'mouth'|'eyes'|'legs'|'arms'|'feet'|'hands'|'weapons'|'social'|'detail'|'movement'(cell)|'hat'|'mask'|'chest'|'shoulder'|'accessory',
  slot:'mouth'|'eye'|'leg'|'arm'|'foot'|'hand'|'surface',    // placement; 'leg' parts become legs; 'foot'/'hand' snap to limb tips (part.attach)
  tier:1..4, cost, complexity:1..3, mass,
  abilities:{ bite:2, sing:1, ... },            // levels contributed (summed, cap 5)
  diet?:'herbivore'|'carnivore'|'omnivore',     // mouths only
  outfitBonus?:{ social, attack, health, gather },  // outfit parts
  unlockedByDefault:bool,
  icon:'🦷',
  build(design, part, colors) -> THREE.Object3D   // mesh builder for this part, local frame: +Y = surface normal, +Z = creature forward
}
```
Required counts (MVP): cell ≥ 14 parts, creature ≥ 60 parts across categories (≥ 8 mouths incl. herbivore/
carnivore/omnivore, ≥ 6 eyes, ≥ 8 legs, ≥ 6 arms/hands, ≥ 6 feet, ≥ 8 weapons, ≥ 8 social, ≥ 10 details),
outfit ≥ 24 parts.

### 4.10 SP.creature (model)
```
CreatureDesign = {
  v:1, kind:'cell'|'creature', name, seed?,
  spine:[ { p:[x,y,z], r } ],            // ordered tail(0) → head(last). Creature space, +Z forward. 3..14 nodes (cell: 1..5)
  parts:[ {
     uid, id,                              // PartDef id
     v: vertebra index it's anchored to,   // parts move with that vertebra when the spine is edited
     o:[x,y,z],                            // offset from that vertebra centre (creature space) to the surface point
     n:[x,y,z],                            // surface normal at placement
     s: scale 0.5..2, rot: radians around normal,
     mirror: bool,                         // true → also instantiated mirrored across x=0
     len?: 0.6..2.5,                       // limbs only: length
     bend?: [-1..1],                        // limbs only: knee bend preference
     color?: 'base'|'accent'|'detail',
     attach?: uid                          // slot 'foot'/'hand' parts: uid of the leg/arm part whose tip they sit on
  } ],
  colors:{ base, accent, detail, pattern:'none'|'stripes'|'spots'|'belly' },
  outfit:[ ...same shape as parts, outfit PartDefs ]   // tribal and later
}
SP.creature.defaultDesign(kind='creature') -> design      // the starter (~mass 6, biped, jaw, two eyes)
SP.creature.clone(design) -> design
SP.creature.validate(design) -> { ok, errors:[], warnings:[] }   // e.g. no mouth (error), over complexity (error)
SP.creature.cost(design, unlocked?) -> number
SP.creature.complexity(design) -> { value, max }
SP.creature.stats(design, opts={ brainLevel:1 }) -> CreatureStats
CreatureStats = {
  mass, height, length, radius,            // radius = collision sphere
  legs, legPairs, gait:'slither'|'biped'|'quad'|'multi'|'cell', asym, legLength,
  topSpeed, accel, turnRate, jumpV, glide, swim, stability, health, sprintMul, sprintTime, sprintCooldown,
  abilities:{ bite, charge, strike, spit, sing, dance, charm, pose, speed, sprint, sneak, jump, glide, health },
  diet:'herbivore'|'carnivore'|'omnivore'|'none',
  outfit:{ social, attack, health, gather },
  // cell-only: thrust, drag, turn, ramDamage
}
```
Formulas: DESIGN.md §3.2. `stats()` must be pure and fast (called every edit).

### 4.11 SP.creature.build / animate / generate
```
SP.creature.build(design, opts={ outline:true, shadows:true, lod:'high'|'low' }) -> Rig
Rig = {
  root: THREE.Group,          // put this in the scene; local frame as §3; feet at y=0 in rest pose
  design, stats,
  body: THREE.Group,          // spine skin + surface parts (bobs/leans during animation)
  legs: [ { hip:Object3D, upper, lower, foot, len, side:-1|1, phase, footWorld:Vector3 } ],
  arms: [ ... ],
  eyes: [ Object3D ],         // for look-at
  mouth: Object3D|null,
  setTint(hex|null),           // flash colour for hits / selection
  setScale(k),                 // brain growth scale
  dispose()
}
SP.creature.animate(rig, dt, s) // s = AnimState:
AnimState = {
  speed: current speed (u/s, signed), turn: angular velocity (rad/s),
  action: null|'bite'|'charge'|'strike'|'spit'|'sing'|'dance'|'charm'|'pose'|'eat'|'hurt'|'die'|'mate'|'celebrate'|'sneak'|'jump'|'glide'|'swim',
  actionT: seconds since action started, airborne:bool, inWater:bool, lookAt?:Vector3 (world)
}
```
Animation is fully procedural: leg phase advances by `speed / strideLength` where
`strideLength = 1.2 · legLength`; gait offsets: biped 0/0.5, quad trot (diagonal pairs), multi metachronal
wave (offset `i/legPairs`), slither = sinusoidal spine wave, cell = flagella/cilia wiggle. Two-bone IK
per leg toward a foot target that plants on the ground and lifts in an arc during swing.
Body bobs `0.06 · legLength` per step, leans into acceleration and turns. Social/combat actions are
short procedural clips (sing: mouth open + head up; dance: hop + spin; charm: sway + blink;
pose: rear up). `die`: tip over and fade.
```
SP.creature.generate(rng, opts={ kind:'creature', diet, sizeTier:'tiny'|'small'|'medium'|'large'|'epic',
                                 temperament, complexity:0..1, gaitHint, palette }) -> design
```
Generated designs must be valid, varied (biped/quad/multi/slither mixes), and use the same catalog.

### 4.12 SP.editor
```
SP.editor.open({
  mode:'cell'|'creature'|'outfit'|'building'|'vehicle'|'ship',
  design,                 // CreatureDesign or AssemblyDesign (cloned internally)
  budget: number|null,    // spend currency available; null = sandbox
  currency:'DNA'|'Food'|'Primordiabucks',
  unlocked: string[]|'all',
  title, allowCancel=true,
  vehicleType?: 'land'|'sea'|'air', buildingType?:'cityhall'|'house'|'factory'|'entertainment'
}) -> Promise<{ design, spent } | null>      // null = cancelled
SP.editor.isOpen, SP.editor.scene, SP.editor.camera, SP.editor.update(dt)   // game loop uses these while open
```
Editor UI lives in `#editor-ui`. Features: DESIGN.md §3.4 and §11 controls, live stats panel,
DNA/complexity meters, paint tab, test-drive tab (treadmill walk, idle, socials), undo/redo, randomize,
name field, Done/Cancel.

### 4.13 SP.assembly (buildings, vehicles, ships)
```
AssemblyDesign = { v:1, kind:'building'|'vehicle'|'ship', role, name,
                   core:'catalog id of the chassis/core',
                   parts:[ { uid, id, p:[x,y,z], n:[x,y,z], s, rot, mirror } ],
                   colors:{ base, accent, detail } }
SP.assemblyParts.list / get(id) / byKind(kind)       // PartDef-like with stats:{ power, speed, health, defense, energy, range, capacity, happiness, production }
SP.assembly.defaultDesign(kind, role) ; SP.assembly.clone(d) ; SP.assembly.stats(d) -> { cost, power, speed, health, ... }
SP.assembly.build(d, opts) -> { root, stats, design, dispose(), animate(dt, state) }  // e.g. wheels spin, props rotate
SP.assembly.generate(rng, kind, role, palette) -> d
```

### 4.14 SP.planet / SP.surf / SP.sky
```
SP.planet.create({ seed, radius=140, detail=6, seaLevel=0 (offset), amplitude=9, biomeBias?, palette? }) -> Planet
Planet = {
  seed, radius, seaRadius,
  group: THREE.Group (terrain + water + atmosphere), terrain: Mesh, water: Mesh,
  surfaceRadius(dir) -> number,           // terrain height along unit dir (analytic, matches mesh within ~0.2)
  surfacePoint(dir, out?) -> Vector3,     // max(terrain, nothing) — the ground (may be under water)
  groundOrWater(dir, out?) -> { point, water:bool, depth }
  normalAt(dir) -> Vector3 (terrain normal), isWater(dir) -> bool, biomeAt(dir) -> 'beach'|'grass'|'forest'|'desert'|'tundra'|'swamp'|'rock'|'snow'|'ocean'
  slopeAt(dir) -> 0..1
  randomLandDir(rng, filter?) -> Vector3 unit
  flora: { nodes:[ { id, dir, pos, type:'bush'|'tree'|'seaweed', fruit, maxFruit, regrow } ], nearest(pos, maxDist, filter) , take(node, n), update(dt) }
  props: instanced rocks/grass/trees (static decoration)
  update(dt, t), dispose()
}
SP.surf = {
  up(pos) -> unit vector,
  orient(object3D, pos, forward)             // place object at pos, up = surface normal, facing forward (tangent)
  tangentForward(up, heading) , projectOnTangent(v, up),
  move(pos, forwardTangent, dist, planet) -> new pos on surface
  greatCircleDist(a, b, radius)
}
SP.sky.create(scene, planet, { dayLength=360 }) -> { update(dt, focusPos), timeOfDay 0..1, isNight, sunDir, setTime(t) }  // background colour, light presets
```

### 4.15 SP.physics
```
SP.physics.createBody({ pos:Vector3, heading:Vector3 (tangent), radius, mass, stats }) -> Body
Body = { pos, vel (Vector3 world), heading, up, radius, mass, stats, onGround, inWater, airborne,
         speed (signed along heading), stunned (s), knock (Vector3), sprintT, sprintCd, id }
SP.physics.step(body, planet, ctrl, dt)
   ctrl = { move: Vector3 tangent desired direction (len 0..1) | null, throttle?, turn?, jump:bool, sprint:bool, sneak:bool }
   // applies accel/topSpeed/turnRate/slope/swim/gravity/jump/glide from body.stats
SP.physics.collideAll(bodies, dt)           // sphere-sphere, mass-ratio push
SP.physics.impulse(body, vecWorld)          // knockback scaled by 1/stability
SP.physics.raycastGround(planet, pos) ...
```

### 4.16 SP.eco
```
SP.eco.create(planet, rng, { playerDesign, playerNestDir, speciesCount=9, brainLevel=1, scene }) -> Eco
Eco = {
  species:[ { id, name, design, stats, diet, sizeTier, temperament, nocturnal, likes:['sing','dance'], relation:'neutral'|'allied'|'extinct'|'hostile', impressed:0, needed:4, killed:0, alpha:{alive}, color } ],
  nests:[ { id, speciesId, dir, pos, population, capacity, growth, isPlayer } ],
  actors:[ Actor ],                           // currently spawned near the focus
  bonePiles:[ { id, dir, pos, parts:[ids], found:false, guardedBy?:actorId } ],
  carcasses:[ { pos, meat, t } ],
  update(dt, focusPos, timeOfDay),           // LOD spawn/despawn, AI, far simulation, flora consumption, events
  spawnNear(speciesId, pos, n), despawn(actor),
  damage(actor, amount, source), kill(actor, source),
  impress(actor, amount),                    // social; returns new interest
  on(evt, fn)  // 'extinct', 'allied', 'impressed', 'killed', 'boneFound', 'event', 'speciesArrived'
  setBrainLevel(n), serialize(), static SP.eco.load(planet, data, opts)
}
Actor = { id, species, rig, body, hp, maxHp, state:'idle'|'wander'|'graze'|'hunt'|'flee'|'sleep'|'attack'|'social'|'follow'|'dead', target, nest, isAlpha, isEpic, isRogue, interest:0..100, anim:AnimState, packOf?:'player' }
```
The Creature stage owns the player character, player abilities, the social minigame UI and HUD.
`SP.eco` owns NPC AI (including NPCs attacking the player — it calls `opts.onAttackPlayer(actor, dmg)`).

## 5. Campaign state (save schema)
```
campaign = {
  v:1, seed, created, stage:'intro'|'cell'|...,
  speciesName, design:CreatureDesign, cellDesign?:CreatureDesign,
  cards:{ cell?, creature?, tribal?, civ? },
  unlocked:[partIds], dna:0, brainLevel:1,
  planet:{ seed, name, radius:140 },
  eco: (SP.eco.serialize()) | null,
  homeDir:[x,y,z] | null,                    // player's nest/village/capital direction on planet
  rivalSites:[[x,y,z], ...],                 // tribal rivals → civ rivals
  tribe:{...}|null, civ:{...}|null, space:{...}|null,
  stats:{ playTime, kills, allies, extinctions }
}
```

## 6. Testing
- `python3 -m http.server 8080` from the repo root, open `http://localhost:8080/?stage=creature&skipintro=1`.
- `node tools/shot.js "<query>" out.png [waitMs] [script.js]` takes a Playwright screenshot and prints
  console errors (see tools/shot.js). Every module owner must leave **zero console errors**.
- Module owners may add standalone harness pages under `tests/` (e.g. `tests/creature.html`).

## Changelog
- Cell stage 3D overhaul: stage uses `SP.cam.Tilt`; `SP.render.toonRim/cloneRim`; `SP.creature.CELL_FLAT` (cell z-flatten 0.8); `design.shape` ('star'|'lobed') and genCell shapes (round, oval, bean, star, lobed, worm; `opts.shape`); cell skin is translucent with interior organelles (`bob` fx); flagella/cilia/proboscis/tails are CPU-deformed tube bundles (`whip` fx, kept live in low LOD via merged lowify); `SP.parts._mix/_rimMat` helpers; cell `_dbg` gains kill/hurt/poison/zap/part/meat. Rig API unchanged.
- Added `attach` on design parts and `foot`/`hand` slots (feet/hands snap to limb tips; a limb without one gets a default stub).
- WP1 (core engine) additions, all backwards compatible:
  - `util.js` pre-creates a stub `SP.game = { registerStage }` (queued) so stage files may call `SP.game.registerStage(...)` at load; `game.js` absorbs the queue. `SP.stages = {}` also pre-created.
  - `SP.input`: `mouse.dx/dy` (pixels this frame), `mouse.inside`, `axis()` -> {x,y} from WASD/arrows, `ray(camera)`, `off(name, fn)`; `on()` returns an unsubscribe fn; extra events 'mousedown','mouseup','mousemove','keyup'.
  - `SP.cam.Follow`: also `.snap()`, `.faceDirection(tangent, instant)`, `.rightOnSurface()`, `.lookHeight`, `.manual`. `Iso/Top`: opts `wheelZoom`, `.zoom`; `Top.pointerToWorld()`. `RTS`: `.radius`, `.radiusAt(dir)` (optional), `.focusPos`, `.rot`, `.forwardOnSurface()`, opts `edgePan`.
  - `SP.render`: `width/height`, `onResize` returns unsubscribe; `makeLights(...).follow(pos, sunDir, dist)`; `celInstanced` also `setColorAt`, `setCount`; `particles(scene, max).burst(pos, hex, count, speed, {size, life, gravity, up, flat, dir})`, `.clear()`, `.dispose()`. NOTE r128 MeshToonMaterial ignores `flatShading` (use non-indexed geometry for facets).
  - `SP.ui`: `popupAt(x,y,...)`, `layer(id)`, `modalCount()`, `showHelp()`, `confetti`; `button` opts `key`, `sfx`; `bar` has `flash()`/`setColor()`; `abilityBar.setCooldown(id, frac)` frac = fraction REMAINING (1 just used -> 0 ready), ability entries accept `name`, `onClick`. Modal Esc handler sets `e.spHandled = true`. HUD helper classes: `.hud-corner .hud-tl/.hud-tr/.hud-bl/.hud-br/.hud-bc/.hud-tc`, `.hud-row`.
  - `SP.audio`: `ready`, `names`, `moods`, sfx opts `{pitch, vol}`. Audio only starts after real user activation.
  - `SP.save`: `KEY`. importDesign accepts raw JSON or `PRIMORDIA1:` base64.
  - `SP.game`: `fast` (bool) + `speedMul` (5 with ?fast=1), `params`, `stageMeta`, `stageOrder`, `showTitle()`, `autosave()`, `pause()/resume()`, `showHelp()`, `editorOpen`, `fps`. `paused` is true while pause menu, help or a stage card is open. `goto(id, {noBanner})`. A stage with `noBanner:true` skips the banner. Continue passes `opts.resume = true`. Stage `serialize()` is stored in `campaign[stage.id]` on autosave. Esc/H are ignored during intro (intro handles its own skip). A fixed bottom-right corner has pause + mute buttons (#corner) during stages.
  - Cards are lowercase strings: cell herbivore|carnivore|omnivore, creature social|predator|adaptable, tribal friendly|aggressive|industrious, civ religious|economic|military.
  - index.html also links css/editor.css after css/style.css. tests/ui.html is a UI/audio/render demo.
- WP2a (creature): `SP.parts` additions: `ctx`, `ofKind(kind)`, `defaultUnlocked(kind)`; PartDef extras `col` (default colour role), `limb` {r0,r1,joint,pole,splay,rf,thigh} for leg/arm slots, `ankle` (foot/leg tip height), `fin` (swim level), `cell:{thrust,turn,burst,ram,poison,zap}`, `diet`. `leg`/`arm` PartDef.mass is per unit length (mass = mass * len). Foot/hand parts need `attach` = uid of their limb (same `o`, `mirror`).
- `SP.creature` additions: `layout(design)` (leg instances + body lift, shared by stats/mesh), `surfacePoint(design, v, dir) -> {o, n}` (tube surface with spherical end caps; use it to place parts), `uid()`, `ABILITIES`, `MAX_COMPLEXITY`. stats() extras: `fallCap`, `slopeGrip`, cell: `burst/poison/zap`. `health` uses `+ brainLevel*20` literally. Mirrored parts count twice for cost, complexity, mass, abilities. Outfit complexity/mass count half.
- Rig extras: `rig.vg[]` (per-vertebra groups parts hang on), `rig.fx`, `rig.setFade(k)`, `rig.lift`. `animate()` also accepts `s.lookAt`; `rig.eyes[i].userData.eye` holds pupil/lid refs. Eye/arm tips use `rig.legs[i].foot` (holder) and `footWorld` (world pos of the ground contact).
- Cell designs: parts use a horizontal frame (local Y = outward rim normal, local Z = tangent, local X = up); spine lies in XZ, +Z forward.
- Gen designs may exceed the editor's vertebra radius range 0.25..1.6 for epic NPCs (validate gives warnings only).
- WP2b (editors): `css/editor.css` must be linked in index.html (after style.css). `SP.editor.open` extras: `opts.brainLevel`; `SP.editor.close()` (cancels), `SP.editor._dbg()` (test hook). Budget semantics: `spent = max(0, cost(final) - cost(initial))`, remaining = budget - that net change (removing original parts credits). `SP.assembly` additions: `validate`, `complexity`, `cost`, `surface` (SDF raycast), `placeMatrix`, `placeOk`, `reproject`, `prune`, `addPart`; `build()` returns `{root, stats, design, lift, objects, bounds, dispose, animate(dt,{speed,throttle})}`. `SP.assemblyParts` adds `categories`, `cores(kind, role)`, `forDesign(design)`, `roles`; parts carry `place: any|top|side|bottom`, optional `shape` (extends placeable surface), `roles`, `core:true`. Building designs sit on an implicit 11u grass plot (placeable ground). Creature editor assumes overlay frame = `rig.body.matrixWorld` (design space) and estimates limb tips from `len/bend/limb.splay`.

### WP3 (world) additions — planet.js / sky.js / physics.js / eco.js
- **Planet**: `create` also accepts `palette` (`'earth'|'alien_purple'|'ember'|'ice'` or an object overriding `SP.planet.PALETTES.earth`), `propDensity`, `floraDensity`, `biomeBias:{wet,warm,land}`. Extra members: `heightAt(x,y,z)`, `temperatureAt/moistureAt(dir)`, `biomeStats`, `colliders[]` (static prop circles `{x,y,z,r,h}` used by physics), `props` (baked per-chunk meshes). `planet.update(dt, t, focusPos)` — pass the focus position so flora instancing is culled around it (`flora.cullRadius`, default 130; set `Infinity` for orbit views and set `flora._dirty = true`).
- **Flora nodes** (`planet.flora.nodes`): extra fields `active, size, vigor, biome, fruitColor`. Extra API: `within(pos, r)`, `boost(pos, radius, mul, seconds)` (fruit boom), `growthMul`, `seed(parent)`. Growth system: eaten fruit lowers `vigor`; overgrazed nodes wither to dormant and thriving ones seed saplings in dormant slots, so vegetation visibly thins and spreads. `take()` returns the number actually taken.
- **SP.surf**: `tangentForward(up, headingVecOrAngle)`, `orient`, `move(pos, fwd, dist, planet)` (returns point on the terrain), `greatCircleDist`.
- **Sky**: `SP.sky.create(scene, planet, {dayLength, lights?, tilt, fog:false, clouds:false})` creates its own `SP.render.makeLights` (exposed as `sky.lights`; pass `opts.lights` to reuse) and a gradient dome/stars/sun/moon/clouds; sets `scene.fog` and `scene.background`. Extras: `setAltitude(0..1)` (space view), `setLocalTime(tod, pos)`, `sky.phase`, `elevation`, `moonDir`. `timeOfDay`: 0.5 noon, 0.25 sunrise, 0.75 sunset, 0 midnight, local to the focus. Night = far side of the planet from the (orbiting) sun.
- **Physics**: ctrl may also use `{throttle, turn}` (tank style). Extra: `SP.physics.place(body, planet, dir)`, `body.sneaking/sprinting/slope/groundR/depth`. `stats.slopeGrip` optional (table in DESIGN §3.2; multi gait uses 1.2 because the table's 0.5 contradicts "great hill climbing"). Static props are collided automatically in `step` via `planet.colliders`; call `collideAll([...bodies])` once per frame.
- **Eco**: `eco.player = body` (SP.physics body, or anything with `pos/radius/mass/sneaking`) must be set by the stage; AI uses it. `opts.onAttackPlayer(actor, dmg, impulseVec)`. Extra API: `eco.playerNest` (home nest, pop starts 6), `eco.playerSpecies`, `triggerEvent('meteor'|'migration'|'raid'|'fruit')`, `engage(actor,on)`, `recruit/dismiss(actor)`, `setPackTarget(actor)`, `takeMeat(carcass,n)`, `setPlayerDesign(design)`, `stats()`, `group` (add to scene or pass `opts.scene`). Species also carry `arrived, habitat, herd, prey:Set, rank`. `eco.update` expects `planet.update` to be called by the stage (flora growth). Events (`on('event')`) payloads: `{type:'meteor', phase:'start'|'impact'|'end', pos, radius, damage}`, `{type:'migration'|'nest_raid'|'fruit_boom', phase, ...}`, `{type:'arrival'|'extinction'|'nest_empty'}`. Bone piles are found automatically when the focus comes within 3.2 u (`'boneFound'`). Draw budget: only the 10 nearest actors get a visible rig (`opts.maxDrawn`) because low-LOD rigs still cost ~100 draw calls each.
- Tests: `tests/world.html` (harness), `node tests/eco_sim_test.js [seed] [minutes]` (10 sim-minutes near + far population sanity), `node tests/eco_features_test.js` (events, combat, ally, extinction, bones, serialize). `tests/_shim_world.js` only fills missing core/creature modules.
- QA-A fixes: Cell progress is `PROG_PER_ITEM[level]` per food item, kills and parts flat (cell.js). `SP.eco`: NPC `stats` are tier-clamped (`stats.dmgLvl`), `eco.spawnNear` retires the farthest actor at the cap, nests expose `pole`/`flag`, hostile species forgive after 180 s (`'event'` type `'peace'`), aggressive fighters flee only when wounded and give up after 25 u. The creature stage can eat eggs at foreign nests (`nearestFood` kind `'egg'`). `SP.game.goto('cell', { fromIntro, skipped })` suppresses the duplicate banner.
- QA-B fixes: `js/stages/rts_touch.js` (`SP.rtsTouch.attach(cam)` one-finger pan + pinch zoom for RTS stages, `suppress()`, `coarse()`, `narrow()`), loaded before tribal.js. Civ: defeat card + retry (`camp.civ.entry`), `SP.civAI.PLAYER_SAFE`. Space: `S.GATE_RANGE` (34) gates Grox/core jumps without the key, `S.touchCtl` on-screen flight buttons, `X.shipPortrait`. Tribal saves rival identity (`dir, sp, kind, wanted, name, gifted, performed`).

### QA-C fix pass (C-01..C-23)
- **Stats / gait** (`model.js`, DESIGN §3.2/§3.3 updated): `layout()` now returns `legs` = only legs that can reach the ground, `arms` = arms **plus decorative (non-grounded) legs** (`inst.deco = true`), and `decor`; `validate()` warns "Leg doesn't reach the ground". Speed from leg/foot parts = max leg level + max foot level (no per-instance stacking; other abilities still sum); slither has implicit Speed 2, speedMul 0.75, effective L 0.7 and +2 sneak; multi speedMul 0.9, slopeGrip 1.2; topSpeed base 3.8; `M0 = 4.7`; default jumpV 4.0; health `40 + 25·mass^0.6 + ...`. `anim.js`: short legs may cycle up to 10 Hz. `tests/creature_stats_test.js` asserts the gait ratios.
- **Lighting**: r128 `MeshToonMaterial` applies direct light x PI twice, so the effective cel factor is `ambient + PI·intensity·band`. All directional/point intensities in `render.js` PRESETS, `sky.js`, cell/intro/space stages and the space portrait renderer were divided by ~PI (day: amb 0.5, sun 0.27, rim 0.11 = 0.68 / 1.04 / 1.35). Water 0.7 opacity and `#06b6d4`, sand x0.9 in `planet.js` earth palette.
- **Perf**: planet prop chunks are 216 (CH = 6) instead of 54 and are distance-culled in `planet.update(dt, t, focus)` (`planet.props.cullScale` 0.6 and `outlineScale` 0.3, both times `flora.cullRadius`; `Infinity` disables). Tribal ~350k tris (was 950k), Creature ~250-290k (was 630k).
- **Leaks**: `sky.dispose()` disposes its own geometries/materials; `SP.cam.Follow/Iso/Top/RTS` have `.dispose()` (unsubscribes the resize callback) and the stages call it in `exit()`; editor frees spine handles and its backdrop texture; creature stage disposes `eco.group`; cell stage disposes shared FX geometry.
- **Editor**: sandbox role only applies to its own mode (`game.js`/`editor.js`, Building and Ship sandboxes work); Randomize swaps locked parts and `validity()` reports "Locked part: X" (parts already in the opened design are exempt); wheel step 0.0006 with a 400 ms target lock; Body-tab vertebra handles beat the part rotate ring; cyan translucent handles; creature editor opens on the Mouth tab; vertebra segment length clamped to 0.3-1.7x the sum of radii; locked cards flash a hint; test drive is interactive (WASD/arrows, Space jump, Shift sprint, real stats) and hides the selection bar; creature framing tighter; palette header shows "n/m unlocked".
- **Creature stage**: brain growth also scales `body.stats.mass` and `stability` by scale^3.
- **Mobile**: Cell HUD fits 390 px (evo bar width, diet panel, hint hidden).

### Water / buoyancy (DESIGN §3.6)
- `SP.creature.stats()` (creature kind) adds `volume, density, buoyancy, swimPower, waterClass ('floater'|'swimmer'|'sinker'), swimSpeed, sinkRate, diveDepth, gill, snorkel, breathRefill, breath (seconds), drownRate`; cells get inert values (`waterClass 'swimmer'`, breath 999). `SP.creature.partDens(def)`. PartDef extras: `dens, lung, gill, snorkel, refill`. 7 new parts: `gills_frill_2, snorkel_tube_1, blowhole_2, sac_float_2, arm_flipper_2, tail_fluke_3, shell_lead_3`; older parts got `dens` overrides.
- `SP.physics`: `createBody` accepts `scale` (body height scale; default radius / stats.radius). `step` replaces the old "everything floats" water with wading / floating / swimming / sinking, kicks, diving and breath. Body fields (stable names): `waterState, submerged, breath, breathMax, drowning, drownFrac (fraction of max health owed; the owner applies it and zeroes it), wet, onBottom, danger, inWater` (now: free in the water, not merely deep) plus `_splash/_kick` FX events. New API: `shoreDir, bodyH, avoidWater, escapeCtrl, passDepth`. ctrl: `sneak` (Ctrl/C) dives, `jump` surfaces/kicks. Old fields and signatures are unchanged.
- `js/world/waterfx.js` (index.html, after physics.js): `SP.waterFx.create(scene, particles, planet).update(dt, bodies)` (splash, pooled ripple rings, bubbles) and `SP.waterHud.create(hudRoot).update(dt, body, {planet, fwd, right})` (breath bar, shore arrow, vignette, lesson toasts).
- `anim.js`: `animate()` reads `s.waterState, s.submerged, s.drowning` (plus `rig.stats.waterClass`); new action `'drown'`; blue-green tint while submerged; `rig.setTint(hex, intensity)`; `rig._tintHex`.
- Stages: creature (`updateWater`, drowning damage/death "You drowned", `hud.showDead(on, title)`), eco (`escapeWater`, class-aware `steerSafe`, drowning damage -> `eco.kill(a, 'drown')`), tribal (`motion()` avoids water, drowns, FX). Editor: stats panel water row, card pips, test-drive Water tank (C dive).
- Test: `node tests/water_test.js` (classification, floating/diving/sinking, breath + drowning timing, kicks/fatigue, NPC escape and drowning).


### Tribal scale pass
- `mkEnt` normalizes creature size via `fitScale` (see ART.md Scale guide); `o.scale` is now a multiplier on top of the fit, `o.target` the target dimension; ents carry `fit`. Units' `baseScale` includes the fit (recomputed in `rebuildRigs`). Health bars, tags, crown and pick radii use `hOf(e)`.
- Water + props fix pass: knee-line wading (`wadeOf(H) = clamp(0.22 H, 0.25, 0.6)`), buoyant bodies leave the bed as soon as water passes the knee (`eqR` never below the bed), sinkers/anyone deeper than the knee on the bed are `swimming`/`submerged` with `inWater = true` (anim paddles / struggles; previously long-legged bodies were `wading` in hip-deep water and visibly walked). Props: `collideStatics` capped footprint (`obstR`), 2-pass depenetration, slide, `b._blocked`; new `SP.physics.steerAround`, `freeSpot`, `obstR`, and `pathAroundWater(..., {obst})`. Creature click-to-walk, bot and tribe `motion()` use them; bot stuck escalation. Tests: `tests/obstacle_test.js`, extended `tests/water_test.js`.

### Civ late-game sinks + autoplay x16/x32
- Civ (`civ_units.js`, `civ_city.js`, `civ_ui.js`, `civ.js`): `U.TECH` player upgrades (weapons +18% dmg, armour -9% dmg taken, persuasion +20% trade/conversion speed per tier, 5 tiers each at 1000*(tier+1) 💰; fleet command 3 tiers at 1500*(tier+1), +2 land/+1 sea/+1 air slots). API `U.techLevel/techCost/buyTech/cap(W, nationId, role)` (`U.CAPS` stays the base cap and the AI's cap); stored on `nation.tech` (player only) and saved in the world snapshot. UI: "Upgrades" row in the own-city dock, `ui.upgrade(key)`. Buy-out: `CS.buyPrice(city, nationId)` = price * (2 - trade/100); `ui.buy` now works for every card when the owner is not at war (rel > -30) or the trade ring is full; open-market buy-outs do not count towards the card (`captureCity(..., noCard)`). Debug: `?stage=civ&tribal=friendly|aggressive|industrious` forces the civ type.
- Testrig: fixed 1/60 s substeps, x1..x32 (`?speed=`), total work per frame capped at ~40 ms, achieved speed shown on the bar ("16x (11x)"); `tools/autoplay.js --tribal <card>`.
- Tribal "village underwater" fix: new `js/stages/tribal_sites.js` (`SP.tribalSites`, loaded before tribal.js): `evaluate/pickDry/pickRivals/isDry/dryPoint`. Home, rival and prop sites need height >= sea+1 (centre >= 2 u preferred), slope limits, no shore within 8 u, >= 85% land on a 12 u ring; deterministic outward search, then globe-wide fallback (strict, basin-free, highest dry). Saved/resumed wet `homeDir`/rival sites are re-picked (`G.homeMoved` drops stale saved positions). Village/rival props use `placeDry`/`dryGround`; `guardDry()` (1 s) relocates structures/members below sea. Test: `node tests/tribal_sites_test.js [seeds]`.
