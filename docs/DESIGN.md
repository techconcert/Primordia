# PRIMORDIA WEB — Game Design Document

Working title: **Primordia Web**. A browser re-creation of Primordia's five-stage evolution arc, in the
prototype's cel-shaded toy style, built with Three.js (r128, vendored) and plain JavaScript.

Read with: `REFERENCE.md` (the original), `ART.md` (look), `ARCHITECTURE.md` (code contracts).

---

## 0. Pillars

1. **Your creation is the hero.** Whatever you build in an editor appears, animates and behaves
   according to what you built. Parts change stats; stats change physics; physics change play.
2. **One world, one species, one story.** The same species, home planet, rivals and choices carry
   through every stage. Nests become villages become cities become your homeworld seen from orbit.
3. **A living world.** Food grows, populations rise and fall, predators hunt prey, species can go
   extinct (by your hand or not). The player is one actor in an ecosystem, not the centre of a
   static diorama. *(This is the big upgrade over the prototype.)*
4. **Consequences.** How you play each stage (diet, social vs. aggressive) gives a card and a
   carried-forward ability, and shapes the next stage's starting position.
5. **Readable in 10 seconds.** Every stage has a clear goal bar on screen and a toy-like UI.

## 1. Stage count

Five stages, as released: **Cell → Creature → Tribal → Civilization → Space**, preceded by a short
meteor intro. (The user remembered seven; the cut Aquatic and City phases would make seven, see
REFERENCE.md §2. Aquatic is listed as a stretch goal in §10.)

Each stage ends with a **Stage Complete** card summarising choices and granting the stage card.
The title screen offers *New Game*, *Continue* (save), and *Stage Select* (jump to any stage with a
generated default history, so every stage is playable on its own).

## 2. Campaign flow and carry-over

```
Meteor intro → Cell (cell editor) → [grow legs] → Creature (creature editor) → [sapience]
→ Tribal (outfitter) → [unite tribes] → Civilization (building + vehicle editors) → [one nation]
→ Space (ship editor) → reach the galactic core
```

| Carried forward | From → To |
|---|---|
| Species design (body, colours, name) | Cell → all |
| Cell diet (herbivore/carnivore/omnivore) | Cell → Creature starting mouth and diet |
| Home planet (seed, terrain, biomes) | Creature → Tribal → Civ → Space homeworld |
| Ecosystem state (which species allied, extinct) | Creature → Tribal (allied species are tameable pets, extinct ones gone) |
| Home nest location | Creature → Tribal village site |
| Rival tribe sites | Tribal → Civ rival city sites |
| Stage cards (4 total) | Each → final "archetype" in Space (e.g. Zealot, Warrior, Trader, Scientist, Wanderer...) |

Archetype ability per card (one button per stage, long cooldown):
- Cell: Herbivore *Siren's Song* (calm nearby creatures), Carnivore *Raging Roar* (stun/fear),
  Omnivore *Summon Flock* (temporary allies).
- Creature: Social *Serenade* (instant befriend chance), Predator *Frenzy* (+50% damage 10s),
  Adaptable *Second Wind* (heal 50%).
- Tribal: Friendly *Gift Rain*, Aggressive *War Cry*, Industrious *Bountiful Harvest*.
- Civ: Religious *Black Cloud* (mass convert), Economic *Ad Blitz*, Military *Gadget Bomb*.

---

## 3. Shared systems

### 3.1 Currencies and progress
| Stage | Spend currency | Progress bar | Bar fills by |
|---|---|---|---|
| Cell | DNA 🧬 | Evolution (0-100) | Eating (+1..+4), killing cells (+3..+8), part pickups |
| Creature | DNA 🧬 | Brain (5 levels, 100 each) | Same DNA earned also fills brain; ally/extinct a species = big chunk |
| Tribal | Food 🍓 | Tribe progress (5 rivals) | Allying/conquering a rival tribe = one segment |
| Civ | Primordiabucks 💰 | Cities owned / total | Capturing cities |
| Space | Primordiabucks 💰 | Badges + core distance | Missions, colonies, exploration |

In Cell and Creature, DNA *earned* fills the progress bar and is also added to the *spendable*
balance for the editor (spending does not lower the bar).

### 3.2 Physics model (creatures)
Implemented in `SP.creature.stats()` + `SP.physics`. Units: 1 unit ≈ 1 m; a starter creature is ~2 units tall.

**Mass**
- Vertebra mass = `1.0 * (4/3)πr³` (body density 1.0)
- Part mass from catalog (eyes 0.02, mouths 0.1-0.6, legs 0.15·len per leg, armour/spikes up to 1.2).
- `mass = Σ`. Reference mass `M0 = 4.7` (the default starter creature's mass).

**Legs and gait** — a part with `slot:'leg'` that reaches the ground is a leg. Mirrored parts count twice.
A leg whose hip is too high to reach the ground (e.g. dropped on the creature's back) is *not* a leg: it
becomes a decorative limb (animated like an arm), is ignored by gait, speed and asym, and the editor warns
"Leg doesn't reach the ground". (`SP.creature.layout()` returns `legs` = grounded, `arms` = arms + decorative legs, `decor`.)
- `legs = count`, `L = mean leg length` (0.6..2.5), `asym = |legsLeft − legsRight|`.
- Gait: `0 legs → 'slither'`, `1-2 → 'biped'` (1 = hopper), `3-4 → 'quad'`, `≥5 → 'multi'`.
  Three legs is a 'quad' tripod (still works, slightly slower). Asymmetry gives a limp
  (speed ×(1 − 0.12·asym), animation hobbles).
- Ground clearance = the longest leg's vertical reach. Spine is lifted so feet touch y = 0.

| Gait | speedMul | accelMul | turnMul | stability | slopeGrip | notes |
|---|---|---|---|---|---|---|
| slither | 0.75 | 1.2 | 1.0 | 1.2 | 0.7 | belly on ground; implicit Speed level 2 and L = 0.7; +2 sneak; can't jump unless jump parts |
| biped | 1.00 | 1.4 | 1.25 | 0.8 | 1.0 | upright torso pitch; long stride; arms free for Strike |
| quad | 1.10 | 2.0 | 0.9 | 1.4 | 0.8 | trot; best sustained speed; stable vs. knockback |
| multi | 0.90 | 2.6 | 0.8 | 1.6 | 1.2 | ripple gait; best accel, great hill climbing |

Gait identity (otherwise identical body): top speed biped 1.0×, quad ≈1.1×, multi ≈0.9×, slither ≈0.75×;
biped turns best, multi accelerates best and climbs best, slither is slowest but sneakiest.

**Derived stats** (`s` = Speed ability level 0-5, `m = mass/M0`). Leg speed does **not** scale with leg
count: `s = (Speed from non-leg parts) + max Speed level among grounded leg parts + max Speed level among
feet`, capped at 5 (slither: at least 2). Other abilities still sum over parts.
```
topSpeed  = (3.8 + 1.1·s) · speedMul · clamp(L,0.5,2.5)^0.35 · m^-0.25 · (1 − 0.12·asym)
accel     = topSpeed · accelMul · m^-0.5
turnRate  = 3.2 · turnMul · m^-0.3 / (0.6 + 0.15·bodyLength)          (rad/s)
jumpV     = jump>0 ? (4 + 1.5·jump) · m^-0.3 : 4.0                      (units/s upward)
glide     = glide level → air drag reduced, fall speed capped at 2 + (5−glide)·1.5
health    = 40 + 25·mass^0.6 + 25·healthLevel (+ brain level × 20 in creature stage)
stability = mass · stabilityMul   (knockback taken = impulse / stability)
swim      = 0.45 + 0.15·finLevel (legacy multiplier, kept for compatibility; real water rules are in §3.6: swimSpeed, waterClass, breath)
uphill    = speed × (1 − clamp(slope·m^0.5·(1−slopeGrip·0.5), 0, 0.7))  (slope = sinθ, uphill only)
sprint    = ×(1.4 + 0.12·sprint) for (1.5 + 0.5·sprint) s, cooldown 10 − sprint s
```
Heavier = slower to start, slower to turn, hits harder and gets knocked less. Long legs = faster
but lower turn rate (bodyLength includes leg reach). Each value is shown in the editor live.

**Collisions:** bodies are spheres (radius ≈ body bounding radius). Overlap is resolved by mass
ratio (heavy pushes light). Charge applies `impulse = mass · speed` to the target.

### 3.3 Abilities
14 abilities, each 0-5: combat **bite charge strike spit**, social **sing dance charm pose**,
movement **speed sprint sneak jump glide**, plus **health**.
- Each part lists abilities with levels. **Stacking rule:** a creature's level for an ability is
  the sum of its parts' levels, capped at 5. Mirrored parts count twice. **Exception:** Speed from leg and
  foot parts takes the maximum leg level plus the maximum foot level instead of summing per instance (§3.2). (Original sources do not
  pin this down; summing gives the most meaningful editor decisions.)
- Diet comes from mouths: herbivore mouth, carnivore mouth, or both/omnivore mouth → omnivore.
- No mouth = cannot eat (editor blocks "Done" with a warning). No legs = slither (allowed).

### 3.4 Points and limits in editors
- **Budget:** part cost by tier: T1 25, T2 75, T3 150, T4 250 DNA (creature); cell parts 5-25.
  Eyes 10. Vertebra: free. Removing refunds fully during the same editor session.
- **Complexity meter:** each part has complexity 1-3, each vertebra 0.5. Max 32 (creature), 12
  (cell). Over the limit the Done button is disabled and the meter flashes red.
- Spine: 3-14 vertebrae, radius 0.25-1.6.
- Parts: scale 0.5-2.0 (cost does not change; mass and ability *do not* change with scale except
  legs, where length matters).
- **Unlocks:** only unlocked parts are available. Locked parts show as silhouettes with a 🦴 icon
  and the hint "Find bone piles".

### 3.5 The living world (ecosystem and growth) — major upgrade
Implemented in `js/world/eco.js`. Used by the Creature stage directly and by Tribal/Civ as fauna.

**Planet.** A sphere planet (radius 140 in creature stage), procedurally generated from the campaign
seed with continents, mountains, beaches, rivers-as-lowlands, and five biomes: grassland, forest,
desert, tundra, swamp. Sea covers 35-45%. Day/night cycle of 6 minutes.

**Flora as a resource layer.** Fruit bushes and fruit trees are *resource nodes* with `fruit` 0-N.
Fruit regrows at a biome-dependent rate (forest fast, desert slow). Herbivore NPCs actually eat it.
Overgrazing a region makes food scarce there, which lowers nest growth. Meat appears as carcasses
from deaths (any cause) and decays over 60 s.

**Species.** 8-10 NPC species are generated per planet with `SP.creature.generate()`, each with a
diet, size tier (tiny, small, medium, large, epic), temperament (skittish, passive, territorial,
aggressive), activity (diurnal/nocturnal), social preference (which of sing/dance/charm/pose it likes,
2 of the 4), and stats derived from its design (so the same physics apply to NPCs).
Species unlock with the player's brain level: at brain 1 only tiny/small species live near you,
larger ones spread into the region later (they migrate in), so the world grows with you.

**Nests.** Each species has 1-3 nests. A nest has `population`, `capacity` (from food within 40 u),
and `growth` per minute. Simulation runs at two levels of detail:
- *Near* (within ~90 u of the player): individuals are spawned as actors with AI (wander, graze,
  hunt, flee, return to nest at night, defend nest, form herds).
- *Far*: nests update statistically each 2 s: births from food, deaths from predation (based on
  predator populations nearby) and starvation. Nothing is "frozen".
Species with population 0 at all nests are **extinct** (announced, removed from future stages).

**Player species.** Your home nest holds your species' population (starts 6). Pack members are
recruited from your nest or allied species. If you die you respawn at the nest; the nest population
drops by 1. If your nest population is ever 0... it regrows from 1 (no game over, but a warning).

**Relations.** Per species: `neutral → impressed(n/needed) → allied` or `hunted(n) → extinct`.
Allying needs impressing 4 members (or 3 for small species) from its nests. Allied species never
attack you, can join your pack, and give 25% DNA bonus when you're near their nest.
Hunting to extinction requires killing nest members until population hits 0.

**Bone piles & parts.** 20 bone piles scattered (more in remote/high places), each unlocks 1-2 parts
(tier weighted by distance from home). Epic creatures guard 4 of them. Alpha individuals (one per
species, larger, crown icon) unlock a part when befriended/defeated.

**Growth of the player.** Brain level 1→5. Each level: +20 health, body scale ×1.12, +1 pack slot
(max 4), new species migrate in, new bone piles revealed on the minimap. Reaching brain 5 and
filling the bar opens "Evolve to Tribal".

**Events.** Meteor shower (go to nest), migration (a herd crosses the map), predator raid on your nest,
seasonal fruit boom. One event every 2-3 minutes keeps the world moving.

**Persistence.** `eco.serialize()` stores species, nests (pop), relations, bone piles found, carcass-free.

### 3.6 Water: float, swim or sink (buoyancy and drowning)
Implemented in `SP.creature.stats()` (classification), `SP.physics.step()` (movement, breath), `anim.js` (clips) and
`js/world/waterfx.js` (splash/ripples/bubbles + the breath HUD). Every creature body obeys it: the player, NPC species
(eco.js), tribe members and animals (tribal). Cells ignore it (they live in the water). Civ vehicles are unaffected.

**Stats (creature).** Water density = 1.0.
- `volume = 1.12 · Σ(4/3 π r³) over the spine + Σ(part mass / part dens)`; the 12% is fat and lungs. A part's `dens`
  (PartDef field) defaults by slot (legs 1.9, feet 1.7, arms 1.5, hands 1.4, mouths 1.15, eyes 0.95, weapons/horns/claws 2.0,
  social parts 0.8, detail 1.0) with explicit overrides (air sac 0.12, wings 0.5-0.6, fuzz 0.5, drum belly 0.55, armour plates 2.9,
  shell dome 2.5, heavy shell 3.4).
- `density = mass / volume`, `buoyancy = 1 - density` (+ floats), `swimPower = min(5, fin + (legless ? 2 : 0))` where `fin`
  is the sum of the `fin` levels of parts (paddle leg 2, webbed foot 2 per foot, dorsal fin 2, fish tail 3, flipper limb 3, fluke tail 4).
- **waterClass**: `swimmer` if `swimPower >= 3` and `density < 1.18 + 0.05·swimPower`; else `floater` if `density <= 1.0`; else `sinker`.
  So: light, fat, round bodies with few dense parts float; finned/flippered/webbed/tail-finned bodies (and snakes with a fin) swim;
  heavy, dense, armoured, long-legged or bony bodies sink. The starter creature floats (density 0.98).
- `swimSpeed = max(0.9, topSpeed · k)`, k = floater `0.26 + 0.05·swimPower`, swimmer `min(1, 0.5 + 0.1·swimPower)`, sinker `0.28` (flailing).
- `sinkRate = clamp(0.8 + 3·(density-1), 0.8, 2.6)` u/s (sinkers only), `diveDepth = 1.3 + 0.4·swimPower` (swimmers only).
- `breath = clamp(12 + 3.2·sqrt(mass) + 1.5·healthLevel + Σ lung, 8, 150)` seconds. `gill` (0-0.95) removes that fraction of the
  drain; `snorkel` lifts the breathing point by its length; `breathRefill` multiplies the refill speed. `drownRate = 0.09`
  (fraction of max health per second once empty: about 11 s from empty to dead).
- Parts: **Gill Frills** (gill 0.85), **Snorkel Stalk** (+8 s, 0.9 u tube), **Blowhole** (+22 s, refill x2.4), **Air Sac** (dens 0.12, +6 s),
  **Flipper Limb** (arm, swim 3), **Fluke Tail** (swim 4, speed 1), **Heavy Shell** (dens 3.4, health 3).
  The editor stats panel shows Floats / Swims / Sinks, density and the breath bar; the test drive has a **Water tank** (C dive, Space kick/surface).

**Physics (`SP.physics.step`).** `H` = body height. Depth up to the *knee line* `clamp(0.22 H, 0.25, 0.6)` is *wading*: everybody walks on the bottom with a
speed penalty (`1 - 0.4..0.62 · wl/H`, min 0.28), feet on the bed, ring at the legs. Anything deeper is never a walk (fix for "the creature walked over water": the old limit was `0.3..0.9 H` and buoyant bodies only floated once the water was deeper than their draft, so tall-legged bodies walked the bed with the water at hip height): `waterState` is `floating`/`swimming`/`submerged` and `b.inWater` is true, so the paddle/float/struggle clips play. Deeper:
- **Floater/swimmer** leave the bottom as soon as the water passes the knee line (resting on the bed while it is shallower than their draft) and sit at draft `0.18..0.55 H` (swimmers 85%): a spring holds them at the surface with a wave bob;
  they paddle at `swimSpeed`. Floaters never drown at the surface. Swimmers **dive** with Ctrl/C (down to `diveDepth`, speed 2 u/s) and
  **surface** with Space (3.2 u/s); a jump from the surface still leaps out of the water.
- **Sinker** is not buoyant: it falls (on a bed deeper than the knee line it is `swimming`/`submerged`: the body thrashes (struggle clip) and clambers along the bed at the wading speed penalty) (water drag towards `sinkRate`), rests on the bottom and **walks the sea floor** (speed penalty by depth).
  Space gives an upward **kick** (`0.9·jumpV + 0.2`, 3-5.5 u/s, cooldown 0.55 s, hold to repeat) that drag cancels in about a second, so a
  body at <= 4 u depth can kick itself up to breathe; each kick is **weaker** (fatigue +0.14, recovers 0.25/s on the bottom) so nobody treads
  water for ever. On a deep bottom steeper than `0.14 + 0.2·slopeGrip` the climb slows down (and the body slides back beyond 1.25x that):
  kick/paddle towards the shore instead of only walking. A HUD arrow shows the way and the distance.
- Water state: `b.waterState` = `dry | wading | floating | swimming | submerged`; `b.submerged` (0..1, head under; the breathing point is
  `0.82 H + snorkel`); `b.inWater` = bodies free in the water; `b.onBottom`, `b.wet` (feet depth), `b.danger` (a non-swimmer in trouble, used by AI).
- **Breath**: `b.breath` / `b.breathMax`. Drains 1/s (x`1 - gill`) while `submerged >= 0.5`; refills at `max/3.5` per s (x1.4 dry, x`breathRefill`)
  while `submerged <= 0.25`. At 0: `b.drowning = true` and `b.drownFrac += drownRate·dt` (fraction of max health; the owner applies it and
  zeroes it), movement x0.7 and the body stumbles. Death by drowning is an ordinary death: the player respawns at the nest
  ("You drowned"), an NPC dies, leaves a carcass and its nest loses one.
- Events for FX: `b._splash` (entering water), `b._kick`; consumed by `SP.waterFx`.
- API: `SP.physics.shoreDir(b, planet, out)` (tangent towards the nearest shore, `b._shoreDist`), `avoidWater(b, planet, mv)`, `escapeCtrl(b, planet, ctrl)`, `bodyH(b)`.

**Animation/FX.** Floaters roll and nod; swimmers paddle legs/arms/fins faster with speed; struggling sinkers thrash; drowning plays the `drown`
clip (flailing, gasping). Bubbles rise while the head is under (a flurry when drowning), a splash + two ripple rings on entry, wake ripples
while paddling (pooled cel rings), and the body is tinted blue-green while submerged.

**HUD.** A comic breath bar appears only while submerged or recovering (title: Diving / Sinking! / Under water / Out of air! / Drowning!, with a
context hint), a one-time lesson toast per class ("Sinking!", "You can swim!", "You float!"), a shore arrow, and a teal vignette that turns
red and pulses while drowning. Tribe members show a "Drowning!" popup and one toast.

**NPCs/tribe.** Actors choose land destinations; steering refuses water deeper than: swimmers never, floaters 1.6 u, sinkers `0.25 H + 0.2`;
fleeing swimmers/floaters may take to the water. A sinker that ends up in danger drops what it is doing and climbs out (shore direction +
kicks); a few drown naturally. Tribe members avoid deep water the same way; fish spots stay on the shore (wading).

**Props (trunks, rocks) and steering.** `planet.colliders` are trunk circles only (canopies never block). `collideStatics` uses the body footprint
`min(0.6 r, 0.55)` (`SP.physics.obstR`), two depenetration passes, removes velocity into the obstacle and adds a sideways slip towards the side the heading
leans to, so bodies slide round trunks and big creatures still fit through gaps (`b._blocked` 0..1 = pressure). `SP.physics.steerAround(b, planet, dir, out,
{goal, pd})` is the shared local steering for the creature click-to-walk, the autoplay bot and tribe members: whiskers (11 candidate headings, look-ahead
3.4 u + speed/2, 0.8 s commitment so it never dithers, a second pass with a tighter margin through tight gaps, optional water-depth test `pd`), plus a
2.5 s net-progress watchdog that switches to a 10 s A* route over a prop-free grid (`pathAroundWater(..., {obst})`) when a concave pocket traps the whiskers.
`b._sa.blocked` = every direction is closed (callers drop the goal / back off). `SP.physics.freeSpot(planet, pos, clear)` moves a goal out of a trunk cluster.

---

## 4. Stage 0 — Meteor intro (15 s, skippable)
Camera flies through stars, a comet hits an ocean planet, zoom into the water: a primordia cracks open
and the player's first cell appears. Then a title card: "CELL STAGE".

## 5. Stage 1 — Cell

**View:** tilted overhead perspective camera (~57 degree pitch, follows the player, pulls back as you grow) over a 3D water volume with depth fog. All creatures and food are real 3D toon models. Layers: play plane, a seabed with rocks/kelp and large blurred silhouettes below (bigger predators you'll meet later), and bubbles/motes above. Mouse aim raycasts to the play plane.

**Controls:** WASD/arrows or hold left mouse to swim toward cursor. Space = attack/boost ability,
E = special (poison/electric), C = call mate (opens editor when bar ≥ next 25% mark or any time DNA ≥ 15),
Q = archetype ability (n/a in cell), +/- zoom.

**Size ladder:** 5 growth levels (bar 0-20-40-60-80-100). At each level the player cell grows ×1.35,
camera zooms out, previously-dangerous cells become prey, and a new tier of larger cells drifts up
from the depth layer into the play layer. Tiny cells below 0.3× your size become "plankton" food.

**Food:** green plant clusters (herbivore), red meat chunks (carnivore), both drift and respawn.
Killed cells drop meat.

**Diet timeline:** track `plantEaten` vs `meatEaten` with earlier items weighted 1.5×. End card:
herbivore if plant share > 65%, carnivore if < 35%, else omnivore.

**NPC cells:** generated with `SP.creature.generate({kind:'cell'})`. Behaviours: grazer (eats plants,
flees), hunter (chases smaller), spiky turtle (slow, passive, hurts if touched), electric (zaps when close),
poison trail. Epic cell: huge, eats anything, telegraphs with shadow.

**Parts in the world:** meteor shards (glowing yellow) contain a random locked part; killing a cell
that has a part you lack drops it (golden shield icon).

**Cell physics:** 2D drag-based. Thrust from movement parts: flagellum (fast top speed), cilia
(tight turning), jet (burst). Mass from body size and parts. Water drag 2.5. Ramming damage = relative speed × mass.

**Cell editor:** same editor framework in `cell` mode: flat top-down blob body (spine in XZ plane),
parts: mouths (filter, jaw, proboscis), movement (flagellum, cilia, jet), weapons (spike, poison, electric),
eyes (beady, stalk, button). Budget = cell DNA.

**End:** bar full → "You're ready to grow legs!" → creature editor (first one, budget = DNA + 100 bonus,
legs unlocked) → Creature stage.

## 6. Stage 2 — Creature

**View:** third-person perspective camera following the creature on the spherical planet.
Right-drag orbits, wheel zooms (6-40 u). Minimap (top-right) shows nests, bone piles, epic creatures.

**Controls:** WASD move (relative to camera), Shift sprint, Space jump (hold to glide if able),
Ctrl/C sneak, 1-4 combat abilities, 5-8 social abilities (only when in social mode), E eat/interact/pick up,
F toggle social/combat mode on the target, M mating call (go to nest → editor), Q archetype ability,
Tab cycle target. Click a creature to target it; click ground to walk there.

**HUD:** health ❤️, hunger 🍖, DNA counter 🧬, brain bar with 5 segments, ability bar
(icons with level pips + cooldown sweep), pack portraits, target panel (species, relation, health,
social meter), minimap, day clock, event toasts.

**Combat:** abilities with cooldown & damage:
| Ability | Range | Damage | Cooldown | Notes |
|---|---|---|---|---|
| Bite | 2.5 | 6 + 6·lvl | 1.2 s | |
| Charge | 8 | 4 + 4·lvl + impulse | 8 s | dash, stuns 1 + 0.3·lvl s, uses physics impulse |
| Strike | 3 (arc 120°) | 5 + 5·lvl | 5 s | hits all in arc |
| Spit | 14 | 3·lvl over 3 s | 4 s | projectile with arc |
Damage scaled by `(attackerMass/targetMass)^0.15`. NPCs use the same table.

**Social minigame:** approach in social mode → target performs a sequence of gestures, one per beat,
drawn from its liked abilities. Press the matching ability (5-8) within the beat window. Success adds
`10 + 6·yourLevel` to its interest meter (0-100). Failure or ignoring −15. Interest 100 → impressed.
Aggressive creatures may break off and attack if failures happen. Allied pack members perform with you
and add their levels.

**Eating:** E on fruit bush/tree (herbivore/omnivore) or carcass (carnivore/omnivore). Hunger drains
1/3 s; at 0, health drains. Eating wrong food: vomit, no hunger restored.

**Mating & editor:** at nest press M (or E on nest) → creature editor with DNA budget. On Done, you
hatch from an egg at the nest as the new design; all nest members update to the new design.

**Pack:** brain level − 1 slots. Recruit from allied species (F → "Join pack") or your nest.
Pack follows, attacks your target, performs socials with you.

**Win:** brain level 5 bar full → "Evolve" → Stage card: Social if allies ≥ 2× extinctions,
Predator if extinctions ≥ 2× allies, else Adaptable → Tribal.

## 7. Stage 3 — Tribal

**View:** RTS camera over the same planet (top-down perspective, 30-120 u zoom), centred on the village
built at your old nest.

**Units:** tribe members (your creature design + outfit), chieftain (larger, crowned). Max 12.
Click to select, drag box to multi-select, right-click to order (move, gather, attack, perform).

**Resources:** food only. Sources: fruit bushes (gather), fish spots on coast (fishing tool), hunting
wild animals (meat), seaweed, eggs from nests of non-allied species (raids anger them).
Food stored at the village hut.

**Buildings (around the hut, 6 fixed slots):** Tool huts — Gathering canes, Fishing spears,
Healing staff, War: Spear / Axe / Torch, Social: Horn / Maracas / Didgeridoo. Each costs 20-50 food.
Hut upgrades (3 tiers) after first and third rival dealt with: +4 pop cap, more slots unlock.
New members: 25 food per baby (needs food stockpile, takes 20 s to grow).

**Rival tribes:** 5 rival villages at other species' old nest locations (or random land), sizes
4, 6, 6, 8, 10. Each has an attitude meter. Approach peacefully: send a gift (food) and perform with
the instrument they want (a social rhythm minigame shared with the creature stage's code, using
instruments instead of sing/dance). Or raid: destroy totem & hut → conquered. Rivals raid you and
steal food if you're weak.

**Pets:** allied species from the Creature stage can be domesticated at the hut for 15 food:
pens produce eggs (food).

**Tribal outfitter:** editor in `outfit` mode: body locked; place clothing/masks/armour/headgear
that add social, attack, health, or gather bonuses. Budget: food.

**Win:** all 5 rivals allied or conquered. Card: Friendly (≥4 allied), Aggressive (≥4 conquered),
Industrious otherwise.

## 8. Stage 4 — Civilization

**View:** higher RTS camera; you can zoom out to see the whole planet.

**Setup:** your city at the village site; rival nations occupy the 5 rival tribal sites + 3 neutral
cities. Each nation is military, economic, or religious. Your type comes from your tribal card
(Aggressive→military, Industrious→economic, Friendly→religious), but you can capture cities of
other types and use their vehicles.

**Economy:** spice geysers (8-12) across the planet; capture with any land/sea vehicle and a spice
derrick (auto) → +100 💰/min each. Cities: city hall + up to 8 building plots. Buildings: house
(+pop, needed for factories), factory (+💰, −happiness), entertainment (+happiness).
Adjacency links (from the original): factory next to house +50%; entertainment next to house
+50% happiness. Unhappy cities riot (no income).

**Vehicles (editor `vehicle` mode):** land / sea / air chassis + parts: power (weapons / sales
pitch / preacher hologram depending on type), speed (wheels, props, engines), health (armour).
Stats are points split from parts; cost scales with total stat points. Max 8 land + 6 sea + 4 air
vehicles. Buildings designed in `building` mode (cosmetic + slight cost differences).

**Capturing cities:**
- Military: destroy turrets, then reduce the city hall to 0 → captured.
- Economic: open trade route by sending trade vehicle; after trade level fills, buy the city for
  its price (scales with size).
- Religious: park religious vehicles; holograms convert population; when conversion 100% → captured.

**Diplomacy:** contact panel per nation: gift, compliment, insult, demand. Relations drive AI attacks.

**Money sinks & upgrades (balance pass):** the treasury had nothing to buy once the 18-vehicle fleet cap was reached, so the
own-city dock has an *Upgrades* row: Weapons (+18% damage/tier), Armour (-9% damage taken/tier), Persuasion (+20% trade and
conversion speed/tier), 5 tiers each at 1000 x (tier+1) 💰, and Fleet command (+2 land, +1 sea, +1 air vehicle slots/tier,
3 tiers, 1500 x (tier+1)). **Buy-out:** any card can buy any city whose owner is not at war with you at 2x the list price
(a full trade ring still gets the 1x price; partial trade interpolates). It does not count towards the card. Gifts (+16 relations
for 200 💰) end wars so a buy-out becomes possible. Turret fire (6.5 dmg / 0.9 s each, range 24) is unchanged: non-military routes
mass outside range 24, bring military escorts to knock the turrets out, then go in together.

**Merger:** once you own half of all cities, a nation not at war with you can be bought out whole from its diplomacy panel (all its cities at 70% of their summed buy-out prices).

**Win:** own all cities → card (Military/Economic/Religious by majority capture type) → build first
spaceship (ship editor) → Space.

## 9. Stage 5 — Space

**View 1, galaxy map:** a spiral disc of ~240 stars (instanced points), coloured by type. Your
empire's stars have rings in your colour, rival empires' in theirs. The galactic core glows at the
centre, guarded by the Grox (a ring of red systems).

**View 2, solar system:** a star and 2-6 planets on orbits; fly the ship (3D, cel-shaded) around.
**View 3, planet orbit:** hover over the planet surface (reuses `SP.planet` with a new seed), abduct
creatures, plant spice colonies, terraform.

**Ship:** designed in `ship` mode. Stats: energy (max), hull (health), weapons, drive range (parsecs).
Energy drains when jumping between stars (cost ∝ distance), refills at your colonies.

**Loop:** explore → scan planets (T-score 0-3, spice type, life) → colonise planets with spice →
sell spice to empires for 💰 → buy upgrades (drive range, weapons, terraforming tools, colony packs)
→ go further toward the core.

**Terraforming (simplified):** each planet has atmosphere (0-100) and temperature (0-100).
Tools: atmosphere generator/freezer/heater (+/−). Target ring = habitable band. T-score =
how many rings in. Adding plants/animals stabilises the score. Higher T-score = more colony size
= more spice.

**Empires:** 6 AI empires generated with `SP.creature.generate` aliens and an attitude toward you.
Contact them: trade, alliance, missions (deliver spice, eradicate pests, scan planet), war.
Pirates raid your colonies (defend by flying there and shooting).

**Grox & core:** the core is surrounded by Grox systems (hostile, strong). Reach the core by
upgrading drive range enough or by finding the wormhole chain (3 black holes that skip ahead,
needing the Wormhole Key mission from an ally). At the core: the **Staff of Life** ending
cinematic and credits, then free play.

---

## 10. Scope: MVP vs stretch

| Stage | MVP (must ship) | Stretch |
|---|---|---|
| Cell | full loop, 5 size levels, 6+ NPC behaviours, parts from shards, diet timeline, editor | epic cell boss, sound reactive music |
| Creature | planet, ecosystem LOD sim, nests, combat, social minigame, pack, bone piles, brain levels, editor, epic creatures | events (meteors, migration), alpha creatures, glide |
| Tribal | village, 12 members, gather/fish/hunt, 6 tool huts, 5 rivals with ally/raid, outfitter | pets, rival raids on you, hut tiers |
| Civ | cities, spice, 3 vehicle types land/sea/air with editor, 3 capture methods, win | building editor, diplomacy depth, superweapons |
| Space | galaxy map, system view, ship flight, spice/colonise, terraform sliders, empires contact, core ending | planet abduction, pirates, wormholes, missions variety |
| Aquatic (cut stage) | — | optional stage between Cell and Creature |

---

## 11. Controls summary (also shown in the in-game help, H key)
- Global: Esc pause menu, H help, M mute (in pause), F2 screenshot-free debug overlay (dev only)
- Editors: left-drag part from palette onto body; drag placed part to move; wheel over part to scale;
  right-click / Delete to remove; Ctrl+Z / Ctrl+Y undo/redo; drag empty space to rotate turntable;
  vertebra handles: drag to move, wheel to fatten; +/− keys add/remove vertebra at tail; X toggle symmetry.

## 12. Save system
Autosave to localStorage at each stage start and every 60 s (`primordia-web-save-v1`). Single slot
plus an "export species" button that copies the design JSON.
