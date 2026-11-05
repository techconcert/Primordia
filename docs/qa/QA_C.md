# QA report, area C: editors, physics, art and performance

QA lead C, 2026-10-26. Method: Playwright with Chromium on SwiftShader at 1280×720 and 390×760, using real mouse drags, the wheel and the keyboard in `/?editor=*` and `tests/editor.html`; Node harnesses for `SP.creature.stats` and `SP.physics.step`; in-page checks of foot planting, physics on the real planet and renderer.info. Screenshots and scripts are in `/tmp/claude-0/qa_c/` (scripts in `scripts/`). No game code was changed.

## Overall verdict

**The core works but needs a balance and polish pass.** The creature creator is well built: real drag and drop, ghost previews, symmetry, spine handles, limb tip handles, feet and hands that snap to limb tips, wheel scaling, rotation, undo and redo, budget and complexity limits, validation and test drive all work with real input. No console errors appeared on any page, editor or stage, and the game runs from `file://`. Foot planting is very good: zero slip for 11 of 13 test creatures. The physics formulas match DESIGN §3.2 exactly, and heavier creatures really are slower in the world: on the real planet a creature of mass 72 covered 9.2 u in 5 s, against 21.5 u for the default creature.

The main problems:
- **Gait balance.** Legs are speed parts and every leg instance adds its speed level, so more legs always means faster. A quad with stub legs is 53% faster than the same biped. A legless slitherer is 4× slower than a biped, which makes it almost unplayable.
- **Leg detection.** A leg on the creature's back still counts as a leg and changes the gait.
- **Randomize ignores locked parts.**
- **Broken sandboxes.** The Building and Ship sandboxes, reachable from Stage Select, open a rover.
- **Washed-out lighting.** Every cel-shading band sits at or above 1.0, so the three tones collapse into flat neon.
- **Triangle counts.** Tribal draws about 950k triangles and Creature about 630k.
- **GPU memory leaks** on stage re-entry.
- **Mobile layout.** HUDs overlap at 390 px width in Tribal and Space.

## Top 10 fixes

1. **C-01** Make the Building and Ship sandboxes open the right design (game.js:204-205).
2. **C-02** Make randomize respect locked parts, and have validation reject locked parts (editor.js:128-155, model.js:128).
3. **C-03** Count only legs that reach the ground; ignore or warn about legs on the back (model.js:84-110, 221).
4. **C-04** Rebalance gait speed: leg speed abilities should not stack per leg instance, and slitherers need a usable base speed (model.js:172, 224).
5. **C-05** Lower lighting to ambient 0.45, sun 0.85, rim 0.35 so the three cel tones read (render.js:98-104).
6. **C-06** Fix the sky leak: `sky.dispose` removes meshes before they are disposed, leaking about 6 geometries and 1 to 3 textures per stage entry (sky.js:170).
7. **C-07** Fix the camera `onResize` leak: one callback per camera that is never removed (camera.js:10).
8. **C-08** Reduce triangles: Tribal draws 946k and Creature 630k (LOD for props and rigs).
9. **C-09** Fix the mobile HUD overlaps in Tribal, Space and Cell.
10. **C-10** Make the wheel less sensitive and stop the body jumping while fattening a vertebra, which makes the wheel scale an arm by mistake (editor.js:702-715).

---

## Findings

### C-01 P1: Building and Ship sandboxes open a rover with an empty core picker
- **Repro:** `/?editor=ship` or `/?editor=building`, or Title → Stage Select → Ship or Building.
- **Expected:** the default ship or city hall, and a core list to pick from.
- **Actual:** the editor shows "My Rover" (role `land`), the Hull or Core list says "Pick one" with no entries, and Ship's Done is disabled with "A ship needs at least one engine". Screenshots: `ed_ship.png`, `ed_building.png`.
- **Cause:** `game.js:204-205` passes `vehicleType:'land', buildingType:'cityhall'` for every mode. Then `editor.js:189` (`role = opts.vehicleType || opts.buildingType`) replaces the design with `defaultDesign(mode,'land')`.
- **Fix:** pass `vehicleType` only when the mode is vehicle and `buildingType` only when it is building. In editor.js, pick the role by mode: `mode==='vehicle'?opts.vehicleType: mode==='building'?opts.buildingType:undefined`.
- **Owner:** js/core/game.js, js/editors/editor.js.

### C-02 P1: Randomize uses locked parts and Done accepts them
- **Repro:** `tests/editor.html?mode=creature&locked=1&budget=60` → 🎲.
- **Actual:** the design contained `mouth_sip_2`, `eye_angry_2` and `arm_stout_1` (all locked) and Done stayed enabled. Players can get any part without finding bone piles.
- **Cause:** `CreatureAdapter.random` (editor.js:128) calls `SP.creature.generate` on the full catalog. `validity()` never checks `S.isUnlocked`.
- **Fix:** pass `unlocked` into generate, or swap each locked part for an unlocked part of the same slot. Also add a `Locked part: X` reason in `validity()`.
- **Owner:** editor.js, gen.js.

### C-03 P1: Any leg part counts as a leg, even on top of the back
- **Repro:** in the creature editor, drop a Stubby Leg on the top centre of the back.
- **Actual:** stats change from Biped to Quadruped (legs 3, speed 5.9 → 7.5, accel 9.3 → 16.5). The leg is not visible because the IK pushes it down into the body. There is no warning. Screenshot: `ed_leg_on_back.png`.
- **Expected:** DESIGN §3.2 says "a part with slot 'leg' that reaches the ground is a leg".
- **Cause:** `layout()` (model.js:84-110) adds every leg-slot part to `legs`, and the gait at model.js:221 uses `legs.length`.
- **Fix:** in `layout`, mark a leg as grounded when `hip[1] - vert - ankle <= lift + 0.05`. Only grounded legs count for gait, speed and asym. Treat the others as "decorative limbs" (tail or arm animation) and show the warning "Leg doesn't reach the ground".
- **Owner:** model.js, mesh.js, anim.js.

### C-04 P1: Gait balance: more legs always faster, slither nearly unplayable
Numbers from `scripts/stats.js`, using the same stub legs:

| Legs | Gait | Mass | Top speed (u/s) | Accel | Turn |
|---|---|---|---|---|---|
| 0 | slither | 4.17 | **1.42** | 2.0 | 3.42 |
| 1 | hopper | 4.35 | 4.26 | 7.0 | 3.60 |
| 2 | biped | 4.53 | 5.95 | 9.6 | 3.56 |
| 3 | quad (tripod) | 4.71 | 7.46 | 16.8 | 2.53 |
| 4 | quad | 4.89 | **9.13** | 20.2 | 2.50 |
| 6 | multi | 5.25 | 7.96 | 22.2 | 2.18 |

On the real planet over 5 s: the quad covered 29.2 u, the default biped 21.5 u and the slitherer 6.2 u. Generated slither NPCs move at 1.2 to 1.75 u/s, while the biped and quad NPCs measured move at 6 to 12 u/s (`feet.js`).
- **Cause:** every leg part adds `speed:1` or more per instance, and mirrored legs count twice (model.js:172). So the speed level scales with leg count and dominates the gait multipliers. For slitherers, `L=0` is clamped to 0.5 and they have no speed part (model.js:224).
- **Fix:**
  - Leg speed should be the mean speed ability over the grounded legs, not the sum. Feet should add at most a +1 bonus.
  - Give slitherers a base of `s = 1.5` (or speedMul 0.75) so they reach about 3.5 u/s.
  - Add a per-extra-leg mass or turn penalty so the gait choice becomes a real trade-off.
  - Update the DESIGN §3.3 stacking note.
- **Owner:** model.js, parts.js, DESIGN.md.

### C-05 P1: Lighting saturates every cel band, so colours look neon and flat (known issue, values confirmed)
- **Maths:** the light factor is ambient + sun × band. Shadow band: 0.75 + 1.25 × 0.22 = **1.02**. Mid: 0.75 + 1.25 × 0.65 = **1.56**. Highlight: **2.0**. All three bands clip for the dominant channel, so emerald `#22c55e` renders as mint, cyan `#06b6d4` renders as `#00ffff`, and the pedestal `#272f44` renders as slate blue. Screenshots: `zoo_walk.png`, `focus_3.png`, `focus_9.png`, `stage_tribal.png`, `m_civ.png`. The values are inherited from the prototype (`proto.png` shows the same mint), but the prototype only lit one creature on a dark background. Grass, sand and water planets wash out badly.
- **Recommended values** (render.js:98-104 PRESETS):
  - `day/editor`: amb 0.45, sun 0.85, rim 0.35. This gives shadow 0.64, mid 1.0 and highlight 1.3, so three readable tones.
  - `cell`: amb 0.55, sun 0.7.
  - Water: opacity 0.8 → 0.7, and darken the shallow colour `#22d3ee` toward `#06b6d4` on terrain vertex colours.
  - Sand: `#fde68a` → `#fcd34d` × 0.9.

  Side-by-side render: `light_compare.png` (current / 0.55-0.95 / recommended). The recommended set reads as true emerald and restores the dark pedestal. Check planet terrain vertex colours after the change (they may need +10% value).
- **Owner:** render.js, sky.js presets, planet.js palettes.

### C-06 P1: GPU geometry and texture leak on every stage re-entry
- **Repro:** enter and exit each stage 5 times (`scripts/leak.js`, results in `leak.txt`). `renderer.info.memory` grows per cycle:
  - cell: +1 geometry
  - tribal: +6 geometries, +1 texture
  - creature: +16 geometries, +3 textures
  - civ and space: 0
- **Cause:** `sky.dispose` (sky.js:170) only removes the dome and clouds from the scene. The stage then calls `disposeTree(scene)`, which no longer reaches them. So the sky sphere, stars, sun, halo, moon and cloud geometries (6, which matches Tribal's +6) and their ShaderMaterial and PointsMaterial are never disposed. Creature leaks more on top of that (eco or HUD minimap textures).
- **Fix:** in `sky.dispose`, traverse the dome and cloudGroup and dispose geometries and non-shared materials. Look for the other ~10 creature-stage geometries (social/HUD objects that are not in the scene at exit).
- **Owner:** sky.js, creature.js, creature_hud.js.

### C-07 P2: Camera resize callbacks are never removed
- **Problem:** the number of live `SP.render.onResize` callbacks grows by one per entry of cell, tribal, civ and creature (15 → 20 after 20 cycles). Each callback keeps an old camera alive.
- **Cause:** camera.js:10 (`onResize` helper), used at camera.js:45/98/127/165, throws away the unsubscribe function.
- **Fix:** store the function and add `dispose()` to Follow, Iso, Top and RTS. Stages call it in `exit()`.
- **Owner:** camera.js and the stages.

### C-08 P1: Triangle counts too high for a mid laptop
renderer.info at 1280×720:

| Scene | Draw calls | Triangles | Geometries |
|---|---|---|---|
| Title | 26 | 6k | 13 |
| Creature editor | 125 | 23k | 26 |
| Cell | 154 | 88k | 68 |
| Creature (play) | 133 | **630k** | 113 |
| Tribal | 413 | **946k** | 177 |
| Civ | 291 | 315k | 249 |
| Space | 61 | 19k | 47 |

All draw-call counts are under the 600 budget.

Tribal breakdown: creature rigs ("merged" body 108k plus outline 94k plus limbs 40k) and baked prop chunks (`props_N`, 25-45k each, plus outline copies). Outlines double every mesh.
- **Fix:**
  - Use `lod:'low'` rigs beyond about 25 u in Tribal.
  - Lower sphere segments for low-LOD rigs (8×6).
  - Use distance culling or simplified chunks for props beyond about 80 u.
  - Drop outlines on far chunks.
  - Set a budget of 250k triangles per frame.
- **Owner:** mesh.js (LOD), planet.js (props), tribal_world.js.

### C-09 P1: Mobile 390×760 layout overlaps
Screenshot: `m_all.png`.
- **Tribal:** the TRIBES bar runs under the minimap, the hint text overlaps the buttons, and the tool bar overflows to the right (elements at x = 387-501).
- **Space:** the money counter is covered by the Market and Ship buttons. `.sp-top` and `.sp-views` overflow (-4..394).
- **Civ:** the Air button overflows (x = 393-449) and the screen is almost entirely blown-out cyan.
- **Cell:** the DNA counter overlaps the evolution bar, and the zoom hint overlaps the ability buttons.
- **Creature editor:** usable. The tabs scroll horizontally and the creature sits a little high.
- **Fix:** add `@media (max-width:760px)` rules to stack the top HUDs, shrink the minimap to 96 px and put the button rows in a horizontally scrolling container.
- **Owner:** css/style.css, tribal_ui.js, space_ui.js, cell.js HUD.

### C-10 P2: Wheel scaling too sensitive, and fattening the spine moves the body under the cursor
- **Problem:** `k = exp(-deltaY*0.0016)` (editor.js:704) is ×1.21 per 120-unit notch, so 4 notches take a part from 1.0 to the 2.0 maximum. Spine radius goes from 0.68 to 1.6 in 4 notches.
- **Problem:** while fattening, `layout().lift` changes, so the whole body moves vertically on screen. Later wheel notches then landed on the Noodle Arm and scaled it to ×1.62 by accident (`ed_spine.png`).
- **Fix:** use a step of 0.0006 (about 7% per notch). Lock the wheel target for 400 ms after the first hit (`S.wheelLock = {kind, id}`). Optionally keep the camera target following `rig.lift`.
- **Owner:** editor.js.

### C-11 P2: The selected part's rotate ring steals clicks meant for spine handles
- **Repro:** Body tab with a part selected, then drag a vertebra handle that lies inside the part's rotate ring (0.78-1.45 × its radius).
- **Actual:** the part rotates instead of the vertebra moving.
- **Cause:** editor.js:608 checks the selected part's gizmos before `pickVertebra` at line 618.
- **Fix:** in the Body tab, check vertebra handles first and deselect parts when switching to Body.
- **Owner:** editor.js.

### C-12 P2: Spine handles look like part of the creature, and Body is the default tab
- **Problem:** the white handle spheres with ink outlines read as eyes or buttons on the creature (`ed_creature.png`, `light_compare.png`).
- **Fix:** open on the Mouth or Eyes tab, or show handles only on hover or in the Body tab, with a translucent cyan ring style. Handles could also show in every creature tab when the pointer is near the spine, as in Primordia.
- **Owner:** editor.js.

### C-13 P2: The vertebra drag has no constraints
- **Problem:** the head vertebra can be dragged any distance from its neighbour or on top of it. There is no minimum or maximum segment length, so the tube stretches or pinches. Primordia clamps segment length to about 0.4-1.2 × radius.
- **Fix:** clamp `|p_i - p_{i±1}|` between `0.5·(r_i+r_j)` and `1.6·(r_i+r_j)` in the `'vert'` drag (editor.js around line 668).
- **Owner:** editor.js.

### C-14 P2: Clicking a locked card gives no feedback
- **Problem:** locked cards get no pointerdown handler (editor.js:868), so clicking one does nothing. The "Locked: find bone piles!" flash code is unreachable.
- **Fix:** attach the handler and call `flash` for locked cards.
- **Owner:** editor.js.

### C-15 P2: Test drive is not interactive, and the selection toolbar stays visible
- **Problem:** the selection bar ("Claw Foot ×1.00 ➖➕⟳🪞🗑") still shows in Test Drive (`ed_testdrive.png`), because `enterTest` (editor.js:936) clears `S.sel` but never calls `refreshSel()`.
- **Problem:** in Primordia, test drive lets you walk with WASD and jump. Here there is only a fixed treadmill, which does show the gait but not turn rate, accel or jump.
- **Fix:** call `refreshSel()` in `enterTest`. Add WASD and Space to the circle mode using `SP.physics.step` on a flat fake planet, with the creature's real stats (the Node harness in `scripts/phys.js` shows the approach).
- **Owner:** editor.js.

### C-16 P2: Fast, short-legged quads skate their feet
- **Problem:** foot-slip harness (`scripts/feet.js`): 11 of 13 creatures have zero slip. The small quad "Wobqua" (L 1.1, top speed 12 u/s) slips 0.036 u per frame on average with a 0.31 u maximum, about 9% of travel, and 71 IK reach clamps.
- **Cause:** the cadence cap `Math.min(1/strideI, 6/sp)` (anim.js:213) limits the step rate to 6 Hz, so feet slide once `sp/stride > 6`.
- **Fix:** raise the cap to about 9 Hz for legs under 1.3, or lengthen the stride (`strideI` up to 1.6 × len) at high speed. Also cap topSpeed at about 6 × 1.2 × L in stats so the animation can keep up.
- **Owner:** anim.js, model.js.

### C-17 P2: The default creature does not match the reference mass M0 = 6
- **Problem:** `defaultDesign()` has a mass of 4.69, so the starter is about 6% faster and its accel about 13% higher than the reference.
- **Fix:** set M0 = 4.7, or fatten the default spine (vertebra radius × 1.08).
- **Owner:** model.js:7 or :44.

### C-18 P2: Default jump is invisible, and health scales hard with mass
- **Problem:** without jump parts, jumpV is 2.5 and the measured apex is **0.20 u** for a creature 2.4 u tall (gravity 14). Pressing Space barely registers.
- **Fix:** default jumpV 4.0 (apex 0.57).
- **Problem:** health is `40+10·mass`. A body with every vertebra at radius 1.6 has 930 HP against 107 for the default, nearly 9×.
- **Fix:** use `40+25·mass^0.6` (about 260 at mass 87, 105 at 4.7).
- **Owner:** model.js:232, 238.

### C-19 P2: Multi-gait slope grip and the docs disagree
- **Problem:** model.js:14 sets `slopeGrip` to 0.5 for multi. physics.js:9 `GRIP.multi = 1.2` is never used, because stats always supplies `slopeGrip`. The Changelog says multi uses 1.2, so multis are actually the worst climbers.
- **Fix:** set model.js multi to 1.2 (or 1.0) to match the "great hill climbing" note, and update DESIGN.
- **Owner:** model.js.

### C-20 P2: Brain growth scales body mass but not stats.mass or stability
- **Problem:** creature.js:180 and 940 set `body.mass = st.mass·sc³`, but `stats.stability` and `stats.mass` (used for knockback and the uphill penalty) stay at the unscaled value. A brain-5 creature (×1.57 size, ×3.9 mass) takes the same knockback and has the same climbing penalty as at brain 1.
- **Fix:** scale `stats.stability` and `stats.mass` by sc³ when copying them into the body.
- **Owner:** creature.js.

### C-21 P2: The editor frames the creature small on an oversized pedestal
- **Problem:** at 1280×720 the creature fills about 15% of the viewport height (`ed_creature.png`), while the pedestal fills the lower half.
- **Fix:** in `frameCamera` (editor.js), change `distT = r*3.6+4.5` to `r*2.6+3`, and set the pedestal radius to `max(sz.x,sz.z)*0.5+0.6`.
- **Owner:** editor.js.

### C-22 P2: Locked parts work, but the silhouette shows the emoji
- **Problem:** locked cards show a black-filtered emoji, "???" and 🦴, which is good. The tooltip "Locked: find bone piles" is fine. There is no part count of locked against unlocked.
- **Fix:** show "3/13 unlocked" in the palette header.
- **Owner:** editor.js.

### C-23 P2: Fonts and offline
- **Finding:** Fredoka loads from Google Fonts, and under `file://` it loaded too, because the network was available. The fallback is Trebuchet. Everything else under `file://` worked: title, cell, creature and the editor, with no errors.
- **Owner:** none needed.

## Missing or awkward compared with the Primordia creature creator (essentials)
1. **No multi-joint limbs or limb joint handles.** Limbs are 2-bone with one length and bend handle, and there is no way to add elbows or knees to shape a leg (Primordia's core gesture). Recommendation: let users drag the knee or joint too, storing `bend`/`knee` offsets.
2. **Parts cannot attach to other parts.** Eyes or spikes can't go on limbs, and weapons can't go on hands (only feet and hands snap to tips).
3. **Rotation is only around the surface normal.** There are no tilt or "lean" handles.
4. **Paint is coarse.** There are 14 swatches and 4 patterns, with no per-part colour role picker, no colour sliders and no paint-style preview. (ART allows this; it is listed as a gap.)
5. **Test drive** is not drivable (C-15) and does not show a jump or sprint demo.
6. **There is no "evolve body" spine bending in the lateral plane.** Primordia also limits the spine to the mid-plane, so that is fine. Fattening is wheel-only, and touch users have no fatten control.
7. **There is no save, load or Primordiapedia in the editor.** `SP.save.exportDesign` exists but has no button. The DESIGN §12 "export species" button is missing.
8. **Feedback when a change affects stats is missing:** no delta arrows on the stat bars and no "Speed +1.6" popups.

## Verified correct (no action)
- Every value from `SP.creature.stats` matches an independent re-implementation of DESIGN §3.2: topSpeed, accel, turnRate, jumpV, health, stability and swim for 0-8 legs. The only additions are the documented extra multipliers (one leg ×0.9, three legs ×0.95).
- Asymmetry is detected correctly (one-sided leg: asym 1, speed ×0.88; three one-sided legs: ×0.64).
- Physics `step` reaches about 97% of topSpeed. The 90% rise time is 0.58 s for the default creature and 2.45 s for the heavy one. Uphill at sinθ = 0.5: default 4.51 u/s, heavy 0.85 u/s (penalty capped at 0.7, as designed). Sneak ×0.45 and sprint ×1.4 hold. Knockback from an impulse of 30: default moves 1.71 u, heavy 0.09 u. Collision: the light body moves 0.68 u, the heavy one 0.037 u.
- Editor: drag and drop placement with a ghost, moving parts (re-anchors to the nearest vertebra), wheel scaling, R to rotate, Delete and right-click removal, undo and redo (including the intermediate wheel steps), the mouth-required error with Done disabled, Add or Remove vertebra, feet snapping to leg tips, the budget block with the "Not enough DNA!" flash, and Done returning `spent=100`.
- No console errors or page errors on the title, the six editors, the five stages, the creature harness or `file://`.

---

## Fix status

Verified with `tests/creature_stats_test.js`, `eco_sim_test.js`, `eco_features_test.js` (all pass), Playwright runs (zero console errors on title, editors, five stages, 390 px) and before/after screenshots in `/tmp/claude-0/qa_c/fix/` (`before_*`, `fin_*`).

- **C-01** fixed: role passed only for its own mode (game.js, editor.js); Ship, Building and Vehicle sandboxes show the right core list.
- **C-02** fixed: Randomize swaps locked parts for unlocked ones of the same slot; validity adds "Locked part: X" (parts in the opened design are exempt).
- **C-03** fixed: only grounded legs count; others become decorative limbs animated like arms; warning "Leg doesn't reach the ground"; DESIGN §3.2 updated.
- **C-04** fixed: leg speed = max leg + max foot level; slither implicit Speed 2, speedMul 0.75; measured biped 1.0 : quad 1.08 : multi 0.87 : slither 0.78; node test added; DESIGN updated.
- **C-05** fixed: r128 toon applies direct light x PI twice, so intensities were ~3x too high (worse than the report's maths); presets, sky, cell, intro and space lights re-tuned (bands 0.68 / 1.04 / 1.35); water and sand palette toned down.
- **C-06** fixed: sky, editor handles/backdrop, creature eco group and cell FX geometry are disposed; 5 re-entries of each stage now keep geometry and texture counts flat.
- **C-07** fixed: cameras have `dispose()` and stages call it; live resize callbacks stay at 0.
- **C-08** fixed: finer prop chunks plus distance culling and outline culling; Tribal about 350k tris, Creature about 250-290k; draw calls under 600.
- **C-09** partially: Cell HUD fixed at 390 px; Tribal (toolbar scrolls) and Civ were already acceptable; the Space world-label pin still clips at the screen edge (cosmetic).
- **C-10** fixed: step 0.0006 (about 7% per notch) and a 400 ms wheel-target lock.
- **C-11** fixed: in the Body tab, vertebra handles are picked before the part rotate ring.
- **C-12** partially: the creature editor opens on the Mouth tab and handles are translucent cyan; the handles still show only in the Body tab.
- **C-13** fixed: segment length clamped to 0.3-1.7x the sum of radii.
- **C-14** fixed: locked cards now flash "Locked: find bone piles".
- **C-15** fixed: selection bar hidden in Test Drive; WASD/arrows, Space and Shift drive with the creature's real stats.
- **C-16** fixed: cadence cap raised to 10 Hz for short legs; feet harness shows zero slip for all 13 creatures including the fast small quad.
- **C-17** fixed: M0 = 4.7 (default mass 4.69).
- **C-18** fixed: default jumpV 4.0; health `40 + 25·mass^0.6`.
- **C-19** fixed: multi slopeGrip 1.2; DESIGN table updated.
- **C-20** fixed: body.stats.mass and stability are scaled by scale^3 on build and during the growth animation.
- **C-21** fixed: tighter camera and a smaller pedestal for the creature editor.
- **C-22** fixed: palette header shows "n/m unlocked".
- **C-23** won't fix: no action needed.
