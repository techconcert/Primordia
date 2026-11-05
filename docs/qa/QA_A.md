# QA report, area A: title, intro, campaign flow, save, pause, Cell, Creature

Tester: QA lead A. Build: working tree at /home/claude/primordia (no code edited). Method: Playwright with Chromium and swiftshader at 1280x720 and 390x760. Stage logic was stepped through `SP.game.current.update()` while the game was paused. I wrote bots for the cell stage (greedy eater), the social minigame (rhythm presses at 100% and 60% accuracy) and creature combat. Screenshots are in `/tmp/claude-0/qa_a/`.

## Overall verdict

The campaign spine works from start to finish. Every step below ran with **zero console errors** (only swiftshader "GPU stall" warnings):
- Title, New Game, meteor intro (skippable), Cell, cell editor via the mate, stage card.
- The first creature editor (budget = DNA + 100), hatch, Creature stage, mating editor, brain levels.
- Evolve, the Social card, and the Tribal stage on the same home direction with eco and relations carried over.
- Save, reload and Continue restore cell progress, creature position, HP and species relations (an allied species stayed allied).

The pause, help and Esc handling are robust.

The look is good. It is bright, toy-like and cel-shaded, and the social rhythm minigame is readable and charming.

The two problems for players are **pacing and balance**:
1. **Cell stage takes about 2.3 minutes for a simple bot** (target 8-12). Level 2 arrives after 15 seconds.
2. **The Creature stage's combat path is broken by NPC stats.** Even "tiny" and "small" species are 1.5-2x faster than the starter creature, have more HP, and hit for about 20 per blow. An aggressive small carnivore flees after one bite and cannot be caught, while its nest-mates kill the player in about 5 seconds. Only the social path is viable, and a carnivore player has almost no way to get meat.

Framing also hurts the first impression. The camera at the home nest looks straight through the nest's flag pole and over open water, so the hero creature is hidden behind the pole at every hatch.

## Top 10 fixes
1. A-01: rebalance cell progress (about 4x slower, with diminishing value per level).
2. A-02: cap generated NPC abilities and speed by size tier so tiny and small creatures are at or below the starter creature.
3. A-03: aggressive or territorial small carnivores should fight, not flee forever, after being hit.
4. A-04: give carnivore players a viable food loop (catchable prey, more carcasses).
5. A-05: fix the hatch/nest camera framing (flag pole and water).
6. A-06: fix the intro dive's final 2 seconds (flat blue wall, island fills the screen).
7. A-07: nests and creatures are far from home at the start; the first minute is empty.
8. A-08: phone-width HUD overlaps (Cell and Creature).
9. A-09: pack is lost on redesign (known issue, confirmed).
10. A-10: one kill makes a species permanently hostile; there is no way to recover.

---

## Findings

### A-01 · P1 · Cell stage is 4-5x too short
- **Repro:** New Game, skip the intro, run a greedy herbivore bot (eat the nearest plant, avoid red-halo cells) at 1x speed (script `/tmp/claude-0/qa_a/s/cellbot.js`).
- **Expected:** DESIGN §0 targets 8-12 minutes for a human.
- **Actual:**
  - Levels arrive at 15 s, 27 s, 58 s and about 91 s.
  - The bar fills at **2 min 20 s**, after 74 plants, 1 death and 0 kills.
  - A human, at about half the bot's efficiency, would finish in roughly 4-5 minutes.
  - KNOWN_ISSUES already flags this; it is still unfixed.
- **Cause:**
  - `js/stages/cell.js:1409`: every plant gives a flat +1 progress (meat +2..4), regardless of level.
  - `PER_LEVEL = 20` (cell.js:14) is linear.
  - `F.fill` (cell.js:484-504) keeps 24 plants and 36 plankton always within reach, so food is never scarce.
- **Fix:**
  - Scale the item value by `1/(1+0.6*level)`, or follow the original's 1.75 down to 0.75 DNA per item.
  - Make the level thresholds non-linear (for example 10/25/45/70/100 with a bigger total).
  - Lower the local plant target as the player levels up.
  - Re-measure with the bot; aim for about 6 minutes of bot time.
- **Owner:** `js/stages/cell.js`

### A-02 · P1 · Generated NPC creatures out-stat the starter creature by a wide margin
- **Repro:** `?stage=creature&noedit=1&seed=42`, then compare `SP.stages.creature.eco.species[i].stats` with the player's stats.
- **Actual (seed 42):**

  | | Speed (u/s) | HP | Damage per hit |
  |---|---|---|---|
  | Player | 5.9 | 107 | Bite 12 |
  | Pibli (tiny omnivore) | 9.3 | 154 | 20 |
  | Mimon (small herbivore) | 11.1 | 102 | — |
  | Grufle (small carnivore) | 10.6 | 99 | 20 |

  - Grufle's alpha hits for 28.
  - Standing 12 units from a Grufle nest for 10 seconds = 11 hits and **death within about 5 seconds**.
- **Expected:** At brain level 1, tiny and small species are prey or peers (DESIGN §3.5: "the world grows with you").
- **Cause:**
  - `SP.creature.generate` (`js/creature/gen.js`) gives small designs high-level speed, strike and health parts.
  - `dealDamage` (`js/world/eco.js:599-601`) uses `max(bite, strike, charge)` as its level, so strike 5 makes any NPC hit as hard as the strongest attack.
- **Fix:**
  - In `generate`, budget ability levels by `sizeTier` (tiny ≤ 1-2 per ability, small ≤ 2-3).
  - Clamp NPC `topSpeed` to about 0.8-1.1x the reference starter for tiny and small species.
  - In `dealDamage`, use the bite level, or the average of the combat levels, times a tier factor.
- **Owner:** `js/creature/gen.js`, `js/world/eco.js`

### A-03 · P1 · Aggressive small carnivores flee forever after one hit
- **Repro:** Seed 42. Go to the Grufle nest (species `s4`, small, carnivore, aggressive), target one, and bite once.
- **Actual:**
  - It attacks, takes 12 damage, then switches to `flee` at 10.6 u/s and runs 50+ units away. It cannot be caught.
  - Meanwhile its nest-mates keep hitting the player.
  - Combat bot result: 60 s of fighting, **0 kills**.
- **Cause:** `stance()` at `js/world/eco.js:459`. When `aggro > 0`, any `tierSmall` (rank ≤ 1) species returns `'flee'`, even if it is aggressive or territorial and can fight.
- **Fix:**
  - Aggressive and territorial species with `canFight` should keep attacking while HP > 30%, and flee only when wounded.
  - Fleeing should give up after about 25 units instead of `fleeT` being refreshed whenever the player is within 20 (eco.js:668).
- **Owner:** `js/world/eco.js`

### A-04 · P1 · The carnivore creature path is barely playable
- **Repro:** Finish Cell as a carnivore (card `carnivore` gives `mouth_snap_1`). In Creature, fruit shows "can't digest". The only meat comes from carcasses.
- **Actual:**
  - Prey outruns the player (A-02/A-03).
  - Predators rarely make kills in the near zone (KNOWN_ISSUES).
  - Hunger drains to 0 in 5 minutes, and then HP drains.
  - A carnivore therefore depends on luck or on going social.
- **Fix:**
  - After fixing A-02/A-03, guarantee a few slow tiny herbivores near home for carnivores.
  - Add meat from dead NPCs killed by the meteor event.
  - Consider a slower hunger drain while there are no carcasses within 60 units.
- **Owner:** `js/world/eco.js`, `js/stages/creature.js:932`

### A-05 · P1 · The camera at hatch and at the nest looks through the flag pole over water
- **Repro:** Any creature start, hatch after mating (screenshots `22_creature_play.png`, `24_creature_continue.png`, `35_after_mating.png`, `42_creature_mobile.png`).
- **Actual:**
  - The 4.6-unit flag pole sits in the middle of the screen and covers the creature, egg and hatch moment every time.
  - The camera floats over flat cyan water.
- **Cause:**
  - `startHatch` (`js/stages/creature.js:250-256`) places the player 2.1 units from the nest centre, facing away from water. The follow camera then sits behind the player, over the nest and the water, so the pole (`js/world/eco.js` `buildNestMesh`, pole at y = 2.3, height 4.6) is between camera and player.
  - `pickHome` (creature.js:24-43) also rewards coastal homes.
- **Fix:**
  - Either face the hatchling toward the nest so the camera looks inland and the pole is behind, or offset the pole to the nest's rim.
  - Fade the pole out when it is between the camera and the player (the existing obstruction loop at creature.js:1058 only handles trees).
- **Owner:** `js/stages/creature.js`, `js/world/eco.js`

### A-06 · P1 · The intro dive ends in about 2 seconds of a flat blue wall with a giant island wedge
- **Repro:** New Game, watch intro time t ≈ 8-11 s (`intro_seq_13/15/17.png`, `04_intro_c.png`).
- **Actual:**
  - The camera lerps to 0.9 units above a flat-shaded 20-face ocean.
  - An island dodecahedron and its offset black outline fill a third of the screen.
  - There is no splash, no waves and no caption.
  - The "zoom into the water" beat reads as a rendering glitch.
- **Cause:**
  - `js/stages/intro.js:166-172` sets the dive target `impactDir*(PR+0.9)`.
  - The islands placed at intro.js:58-66 are only excluded from a narrow cone around the impact point.
- **Fix:**
  - Stop the dive at about PR + 4.
  - Widen the island exclusion cone (for example `d.dot(impactDir) > 0.75`).
  - Bring the underwater tint and a splash ring and particles in earlier (around t + 0.6 instead of + 1.2).
  - Optionally cross-fade to the underwater scene at 9.5 s.
- **Owner:** `js/stages/intro.js`

### A-07 · P2 · The start of the Creature stage feels empty; nests are far away
- **Repro:** Seed 42: list nest distances from home.
- **Actual:**
  - The nearest other-species nest is 66 units away; the others are 70-214.
  - At start, only nest-mates are within 50 units.
  - At about 6 u/s it takes 10-20 seconds of walking before meeting anything.
  - DESIGN pillar 3 ("a living world") does not land in the first minute.
- **Cause:** `settleSpecies` → `placeNestDir(sp, 28, 105)` (`js/world/eco.js:126-131`) plus `avoid = 26`.
- **Fix:**
  - Force one tiny herbivore nest and one small herbivore nest at 25-45 units from home.
  - Spawn a wandering herd near home on the first visit.
- **Owner:** `js/world/eco.js`

### A-08 · P2 · Phone-width (390x760) HUD overlaps
- **Repro:** `W=390 H=760` (`41_cell_mobile.png`, `42_creature_mobile.png`).
- **Actual:**
  - Cell: the evolution bar covers the health panel completely and is clipped ("0/10…"); the diet panel overlaps it.
  - Creature: the ability bar is cut off on the left (slot 1 off-screen, Q missing), and the pause/mute corner buttons sit on top of abilities 7-8.
- **Fix:**
  - Below 700 px, stack the top HUD vertically and shrink the cell evolution bar (the CSS at cell.js:102 only shrinks the minimum width).
  - Wrap or scroll the creature ability bar.
  - Move `#corner` above the ability bar.
- **Owner:** `js/stages/cell.js` (CSS), `js/stages/creature_hud.js`, `css/style.css`

### A-09 · P2 (known, confirmed) · Recruited nest-mates leave the pack when you redesign
- **Repro:** Reach brain level 2, G to recruit a nest-mate (pack 1), M at the nest, Done.
- **Actual:** Pack goes to 0.
- **Cause:** `creature.js:804` filters out own-species members, and `eco.setPlayerDesign` (`eco.js:444`) despawns them.
- **Fix:** Re-spawn the same number of new-design nest-mates next to the player after hatching, and re-recruit them.
- **Owner:** `js/stages/creature.js`, `js/world/eco.js`

### A-10 · P2 · One kill makes a species permanently hostile; no way to recover
- **Cause:**
  - `eco.kill` (`js/world/eco.js:409`) sets `relation = 'hostile'` and nothing ever resets it.
  - `crSocial.canTalk` refuses hostile species (`creature_social.js` `canTalk`).
- **Effect:** A single misclick, or a pack kill (source `'pack'` counts as player), locks the social route for that species for the rest of the stage.
- **Fix:** Decay hostility back to neutral after about 3 minutes without kills, or make hostility per nest.
- **Owner:** `js/world/eco.js`

### A-11 · P2 · Reloading during the first creature editor skips it for good
- **Repro:** Finish Cell, the first editor opens. Reload, then Continue.
- **Actual:** The stage resumes in `play` with the default design. The "grow legs" editor never appears; the +100 DNA is kept.
- **Cause:**
  - `creature.js:146`: `startEditor = !res && !creatureEditorDone`.
  - `res` exists because goto() autosaved `campaign.creature` while state was `'editor'`.
- **Fix:** Also open the editor when `res && !campaign.creatureEditorDone`.
- **Owner:** `js/stages/creature.js`

### A-12 · P2 · Reloading on the Cell "stage complete" card leaves a full bar that does nothing
- **Cause:** completeStage autosaves with `stage: 'cell'`, `progress: 100`. On Continue, `finish()` is only triggered from `addProgress` (cell.js:1430), so the player has to eat something before the stage ends.
- **Fix:** In `enter`, if `saved.progress >= 100`, call `finish()` (or let `goto` resume on the next stage when `cards[stage]` is set).
- **Owner:** `js/stages/cell.js`, `js/core/game.js`

### A-13 · P2 · The pause/mute corner buttons stay visible over the editors
- **Repro:** Open any in-stage editor (`16_cell_editor_after.png`, bottom right).
- **Cause:** `openEditor` (`js/core/game.js` around line 176) does not call `refreshCorner()` after setting `editorOpen = true`.
- **Fix:** Call `refreshCorner()` there.
- **Owner:** `js/core/game.js`

### A-14 · P2 · Starter cell has no eyes and the diet is not chosen at the start
- **Actual:**
  - `defaultDesign('cell')` (`js/creature/model.js` around line 30) has only a filter mouth and a flagellum. The editor warns "No eyes" from the start, and the hero cell looks blank next to the intro's googly-eyed cell.
  - Primordia lets you pick herbivore or carnivore at the start; here you have to collect 15 DNA and call a mate first.
- **Fix:**
  - Add two bead eyes to the default cell.
  - Optionally add a 2-button diet choice on the cell stage banner.
- **Owner:** `js/creature/model.js`, `js/stages/cell.js`

### A-15 · P2 · Every new species is called "Primordialing"
- **Cause:** `newCampaign` (game.js) keeps `defaultDesign().name`, so `makeName` never runs. The cell card says "Time to grow legs, Primordialing!" on every run.
- **Fix:** Use `makeName(r, 2)` unless the player has typed a name.
- **Owner:** `js/core/game.js`

### A-16 · P2 · DNA numbers don't match
- **Actual:** The cell card says "DNA collected: 105" while the HUD shows 100. Death subtracts from `campaign.dna` but not from `dnaEarned` (cell.js:1487).
- **Fix:** Show one figure, or label them "earned" and "banked".
- **Owner:** `js/stages/cell.js`

### A-17 · P2 · The cell title appears twice after the intro
- **Actual:** The intro shows its own "STAGE 1 / CELL STAGE" card (intro.js:242), then `goto('cell')` shows the game banner "Cell Stage" again.
- **Fix:** In `SP.game.goto`, pass `noBanner` when `opts.fromIntro` is set.
- **Owner:** `js/stages/intro.js` / `js/core/game.js`

### A-18 · P2 · Clicking to skip the intro also starts swimming
- **Actual:** The same mousedown that skips the intro leaves `mouse.left` held when Cell starts, so the cell starts swimming toward the cursor.
- **Fix:** Use the keyboard-only skip, or ignore `mouse.left` for the first 0.3 s of the cell stage.
- **Owner:** `js/stages/intro.js`, `js/stages/cell.js`

### A-19 · P2 · A large tree canopy can hide the player
- **Actual:** Tree canopies near the follow camera hide the player (`32_tp_3.png`). This is the known "obstruction heuristic only" issue.
- **Fix:** Fade canopies between the camera and the player instead of pulling the camera in.
- **Owner:** `js/stages/creature.js`

### A-20 · Info · Performance and test environment
- Under swiftshader the Creature stage renders at 0-1 fps, and the intro drops to 2-4 fps at impact (500 particles).
- One screenshot came out black during a 0-fps frame. I could not reproduce it at normal frame rates, so it is not filed.
- This needs a real-GPU check by area C.

## What works (verified)
- **Title and Stage Select.** Continue appears only when a save exists.
- **Intro.** Esc, Space or click skips it.
- **Esc spam.** 9 presses: one pause box, no stacking. H and Esc interact correctly.
- **Cell mate and editor round trip.**
  - Below 15 DNA, C shows a clear message.
  - Swimming into the mate opens the editor with budget = DNA.
  - Adding a Cell Jaw (mirrored, +30) makes the diet omnivore, deducts the DNA and rebuilds the rig in the world.
  - Cancel refunds and resumes cleanly.
- **Cell to Creature carry-over.** Colours, name and the mouth matching the diet card carry over. The first editor shows "Your species grows legs!" with budget 200 (100 + 100).
- **Eating.** Fruit gives +22 hunger. Wrong food gives the "can't digest" hint.
- **Social minigame.**
  - At 100% accuracy one creature takes 28.5 s, and a small species is allied after 3 impressions in 86 s (+96 brain XP).
  - Banner and confetti play on alliance. The alliance survives save and Continue.
- **Brain level up.** Body ×1.12, +20 HP, pack slot, new species arrive.
- **G recruit.** The recruit follows the player.
- **Mating editor at the nest.** Budget = DNA, brain level is passed, the result is applied, nest-mates update to the new design, and hatching works.
- **Death.** Nest population drops by 1 and is floored at 1 after 9 deaths; respawn is a hatch at the nest.
- **Evolve.** The button appears at 500 XP. The card is "Social", and Tribal starts with `homeDir`, `eco` and relations carried over.

## Pacing estimate (Creature)
- 500 brain XP is needed.
- One ally is about 80-96 XP, roughly 1.5 minutes of minigame plus travel. Bone piles give +20 each (20 piles).
- A social-path player should take about 15-25 minutes, which is within the target.
- The combat path currently can't be timed, because kills are close to impossible (A-02/A-03).

## Fix status

Verified with Playwright (swiftshader), the cell bot, a creature combat bot and the node tests (`eco_sim_test`, `eco_features_test`, `creature_stats_test` pass). Zero console errors.

- **A-01 fixed.** Food progress per item is 1.0, 0.8, 0.62, 0.5, 0.4 by level and DNA per item is 1.75 down to 0.75. Kills (5-12), shards and parts are flat and worth more. Death costs at most 2.5. Local food density falls with level. Cell bot: about 6-6.5 min with 5-15 clumsy deaths (was 2.3 min), so a human should land at 8-12 min.
- **A-02 fixed.** `tuneStats` in `eco.js` clamps NPC speed, health and damage level by size tier relative to the starter creature. Tiny and small are at or below the starter, medium is a real threat, large and epic are big. `dealDamage` caps the level by tier, and small alphas are weaker.
- **A-03 fixed.** Aggressive, territorial and bold mid-size fighters keep attacking and flee only below 22% HP, slower than a sprint. Fleeing gives up after 25 units.
- **A-04 fixed.** A tiny and a small herbivore nest always sit 24-46 units from home. Kills leave carcasses. New: press E at another species' nest to eat an egg (carnivores and omnivores). The parents defend it, and carnivores are offered meat before fruit.
- **A-05 fixed.** The hatchling spawns beside the nest rim, the heading prefers land behind the camera, and the flag pole fades when it is between the camera and the player. Stage-select homes in the sea are re-picked on dry land.
- **A-06 fixed.** The dive stops at PR + 7.5 above the water. The island exclusion cone is wider, foam is added, and the view cross-fades to the underwater colour. The planet limb stays visible and there is no flat wall.
- **A-07 fixed.** See A-04: close herbivore nests give company and prey within the first 30-40 units.
- **A-08 fixed.** Creature: the ability bar wraps, abilities are smaller, and pause/mute moves to the side. Cell: the top HUD stacks. Checked at 390 px.
- **A-09 fixed.** Nest-mates in the pack are re-hatched as the new design and re-recruited after a redesign.
- **A-10 fixed.** Hostility decays to neutral after 3 minutes without a kill, with a toast.
- **A-11 fixed.** A reload during the first editor reopens it, and the +100 DNA is not granted twice.
- **A-12 fixed.** Continuing from a full evolution bar calls `finish()` straight away.
- **A-13 fixed.** `openEditor` calls `refreshCorner()`.
- **A-14 partially fixed.** The starter cell gets bead eyes, added in `newCampaign` because `model.js` is owned by area C. The diet choice at the start is not added, because it is optional.
- **A-15 fixed.** New campaigns get a random species name, and the cell card uses it.
- **A-16 fixed.** Death reduces both figures, and the card reads "DNA earned X (banked Y)".
- **A-17 fixed.** The game banner is skipped after a completed intro and shown after a skip.
- **A-18 fixed.** The cell stage ignores a held mouse button until it has been released once.
- **A-19 won't fix.** Canopies are baked into merged per-chunk prop meshes in `planet.js`, so per-tree fading needs a prop rewrite. The existing camera pull-in stays. The nest pole is faded (A-05).
- **A-20 info.** No code change, needs a real-GPU check.
