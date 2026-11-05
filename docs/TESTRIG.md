# Autoplay test rig

A bot that plays the whole Primordia Web campaign hands-free (title -> Cell -> Creature -> Tribal -> Civ -> Space -> ending) through the game's
real input, editor and HUD. It is **inert** unless the URL contains `?autoplay=1`; nothing in the shipped game changes without it.

Files: `js/testrig/autoplay.js` (core, `SP.testrig`), `bot_editor.js` (editor driver), `bot_cell.js`, `bot_creature.js`, `bot_tribal.js`,
`bot_civ.js`, `bot_space.js`, and the Node runner `tools/autoplay.js`.

## 1. Watch it play live (the main use)

No server is needed: opening `file:///.../primordia/index.html?autoplay=1&seed=7` directly in Chrome works (all scripts are classic, no fetch/modules; verified with Chromium from `file://`). A local server is only handy for a stable origin:

```
cd primordia && python3 -m http.server 8099
# then open:
http://localhost:8099/?autoplay=1                       # random seed (written back into the URL), real time
http://localhost:8099/?autoplay=1&seed=7                # reproducible run
http://localhost:8099/?autoplay=1&seed=7&speed=4        # 4x
http://localhost:8099/?autoplay=1&seed=7&stage=creature # start at a later stage
http://localhost:8099/?autoplay=1&seed=7&cine=1         # gentle cinematic camera drift
```

Default speed is **1x real time**, rendered every frame, with the normal HUD. While it plays you see:

* **Caption bar** (bottom): what the bot is doing and why ("Danger: a bigger hunter is near -> swimming away", "DNA 219 >= 200 -> going to the nest to mate").
* **World markers**: a pulsing dashed line + ring + arrow from the player to its current target (food, mate, nest, rival camp, enemy, planet...).
* **Fake cursor**: when the bot presses a real HUD or editor button (Done, tool bar, Gift/Perform/Raid, Continue) a cursor glides to it and highlights it first.
* **Editor**: it is paced step by step: the cursor goes to a part card, the part is dropped, resized, painted, named, then "Done" is pressed.
* **Control bar** (bottom centre): pause, step, 1x 2x 4x 8x 16x 32x, Cine camera, Take over / Resume bot, stats overlay.

| Key | Action |
|---|---|
| F8 | pause / resume |
| F7 | single-step one frame (while paused) |
| F9 | stats overlay (stage, sim/wall time, deaths, stuck events, errors, goal) |
| F10 | **Take over**: the bot stops sending input and you play; press again (or the bar button) to hand control back |

Speeds 16x and 32x are meant for impatient watching: the game steps in fixed 1/60 s substeps (stable timers, no tunnelling), the per-frame work is capped at ~40 ms so the page stays responsive, and the caption/overlay refresh is throttled. Speeds above 2x, or `headless=1`, trade watchability for throughput (headless skips the HUD and renders ~1 frame in 45).

## 2. URL parameters

| Param | Meaning |
|---|---|
| `autoplay=1` | activate the rig |
| `seed=N` | seed for all bot choices (diet, creature build, tribal strategy, mate threshold...). Missing -> random, written into the URL |
| `speed=1..32` | sim speed as a multiple of real time (default 1). Fixed 1/60 s substeps, at most ~40 ms of work per frame; if the machine cannot keep up the bar shows the achieved speed, e.g. `16x (11x)` |
| `stage=<id>` | start at `cell\|creature\|tribal\|civ\|space` (default: from the title screen) |
| `until=<stageId\|end>` | stop after that stage completes (default `end` = after Space's ending) |
| `runs=N` | informational in-page; the Node runner uses `--runs` |
| `headless=1` | fast mode, no overlay/HUD pacing, 30 ms work chunks |
| `log=1` | mirror goals/notes to the console as `[ap <sim s>] ...` |
| `intro=1` | watch the intro instead of skipping it |
| `cine=1` | cinematic camera drift on |
| `ui=0` | hide the rig's own caption / bars |
| `tribal=friendly\|aggressive\|industrious` | (game debug param) with `stage=civ`: force the tribal card, i.e. the civ type religious / military / economic. Runner: `--tribal <card>` |
| `assist=1` | when a stage blows its sim-time budget the bot nudges the stage state (see section 6) instead of aborting the run |

## 3. Node runner (CI / unattended)

```
node tools/autoplay.js --seed 1 --speed 8 --until end --timeout 1800 --out /tmp/ap_1 --headless
node tools/autoplay.js --seed 1 --runs 3 --headless --until end          # seeds 1,2,3 -> out/seed_N/
```

Options: `--seed --runs --speed --until --stage --timeout <wall s> --out --headless --log --assist --shots <wall s between periodic screenshots> --width --height`.
Env: `BASE` (default `http://localhost:8099`). Needs `playwright` (chromium) and uses `--use-gl=swiftshader --enable-webgl --ignore-gpu-blocklist`.
It polls `SP.testrig.report()`, takes screenshots on every stage change, on stuck events, periodically and at the end, and writes
`report.json`, `report.md` and `NN_*.png` into `--out`. **Exit code 0 only if the run finished with zero console errors, unhandled rejections and page errors.**
Expect roughly 3-4 simulated seconds per wall second in headless swiftshader; a full campaign is a long run, use `--timeout` generously.

## 4. The report

`SP.testrig.report()` returns
`{seed, stages:[{id, simSeconds, wallSeconds, deaths, goalsCompleted, stuckEvents, notes, completed, card, resources}], consoleErrors, unhandledRejections, designsBuilt, finished, ...}`
plus `currentStage`, `snapshots` (resources every 5 min of sim time), `events`, `consoleWarnings`, `goal`. `consoleErrors[].own` marks errors thrown from `js/testrig/`.
The F9 overlay shows the same live.

## 5. What each bot does

* **Cell**: random diet per seed; seeks food, flees bigger cells / fights smaller ones, collects shards and parts, calls a mate (C) at enough DNA, spends DNA in the editor (diet fix + random mutation).
* **Creature** (walks round lakes via the game's shared `SP.physics.pathAroundWater`; bone piles on another island are skipped; cornered by a hunter it fights back): the first editor visit builds a random but valid creature (mouth matching diet, eyes, legs, random extra parts, random shape and colours, inside budget and complexity limits; per seed it aims for a *swimmer*, a *sinker* or an unconstrained build so the water system gets exercised). Then: eat when hungry, fight or avoid by relative strength, social minigame (Digit5-8 timed), recruit pack (G), befriend species, bone piles, return to nest, mate to mutate (M, per-seed DNA threshold), grow brain, press Evolve. **Water**: sinkers stay out of deep water and swim/kick (Space) to the nearest shore when wet; swimmers/floaters sometimes explore water and head for shore when breath is below 35%; drowning always triggers the shore run.
* **Tribal**: gathers fruit, builds tool huts, raises babies, equips tools through the real tool bar; random strategy per seed (friendly / aggressive / mixed): gifts + rhythm performance (Digit1-3) vs raids on the 5 rivals.
* **Civ**: builds houses/factories/entertainment, produces vehicles of the player's type, keeps every city queue busy up to the caps, buys upgrades and buy-outs (gifts first if the owner is at war), claims spice, masses a strike group outside turret range (3+ military escorts for non-military cards), then captures by card type (military attack, economic trade ring, religious conversion); wounded vehicles retreat and heal; every 8 sim-min without a new city it escalates (bigger escort, ignores defender strength, resets blacklist), handles the lose/retry modal and the "Build my spaceship" hand-off (ship editor driven like the creature editor).
* **Space**: scans and colonises planets with Colony Packs, collects and sells spice, buys Market upgrades, jumps (G, select, J) star to star toward the core once drive range >= 34 (or with a Wormhole Key), fights Grox/pirates with real flight keys, flies to the Staff of Life, clicks through the ending.

Creature bot navigation: `steer()` runs the shared `SP.physics.steerAround` (whiskers + prop A* watchdog + water depth) and explore goals go through `SP.physics.freeSpot`; the stuck detector escalates per episode (25 s window): 1 back off, 2 sideways detour waypoint, 3 jump + opposite detour, 4 re-plan (new explore goal, skip bone piles 60 s, drop click-walk). Seed-7 stuck counter went from 22 to the value in section 7.

All bots: stuck detector (no position change AND no progress for N s -> soft unstick; long no-progress -> hard unstick), `T.goal()` commentary, death counting, modal handling (stage cards, safe-word buttons).

## 6. Where the bot bypasses real input (direct-API fallbacks)

These call the same function the UI/click handler calls:

* **Editor**: the design is built from the real catalog, validated with `SP.creature.validate/complexity/cost`, then replayed through the editor's own DOM (trash button, tab buttons, cards, "bigger" button, palette swatches, name field, Done). Session state read through `SP.editor._dbg()`.
* **Creature**: `S.setTarget` for befriending; movement is WASD/Shift/Space through `SP.input`.
* **Tribal**: `G.selected` and gather orders (`u.order = {t:'gather'...}`) instead of box select + right click. Buttons are real DOM clicks.
* **Civ**: `SP.civUnits.order` (the right-click handler's call), `ui.produce/build/buy`.
* **Space**: `S.autopilotTo` (click-to-fly), `S.foundColony` (3D placement click), `S.buy` (Market button), `S.sellSpice` (contact dialog button), `S.sel = {type:'star', i}` before the J key.
* **Assist (flagged, never silent)**: `S.dev.grant(1500)` in Space only after 1700 sim s without being able to reach the core. With `assist=1` / `--assist`, a stage that exceeds its sim-time budget gets one nudge through the game's own state and a 600 s grace period: creature `brainXp = 500` (the bot then presses the real Evolve button), tribal remaining rivals set to allied, civ remaining cities captured through `W.captureCity`. Each use is a note starting with `ASSIST:` in the stage notes, appears in `report.assists` and in a bold line in `report.md`. In tribal, a unit that stays motionless 8 s *away* from its goal while on a perform/attack order (rival on an island that a sinker tribe cannot reach, AUTOPLAY-F02 residue) is warped next to the rival camp, also flagged.

Debug accessors added to game files: none besides the existing `SP.editor._dbg()`, `SP.stages.cell._dbg`, `SP.stages.tribal._G`, `SP.stages.civ.w`, `S.dev`.

## 7. Verified results (headless, `--speed 8 --assist`, swiftshader, final code unless noted)

| seed | cell diet / creature build | stages reached | sim time | notes |
|---|---|---|---|---|
| 1 | carnivore / carnivore sinker | cell, creature, tribal (friendly), civ (religious), space (zealot), ending: **finished, 0 console errors** | 9424 s (wall 82 min) | creature 3488 s unassisted; civ hit its 4500 s budget -> ASSIST (remaining cities captured); 3 tribal unit warps (ASSIST) |
| 2 | omnivore (cell) / herbivore swimmer | cell, creature, tribal (friendly), civ (religious), space (zealot), ending: **finished, 0 console errors** | 16698 s (wall 123 min) | creature alone (`--stage creature`, with the 3-matings cap) finished unassisted in 3281 s; in the full run (before the cap) it needed ASSISTs in creature (7000 s), tribal (3009 s, rivals set allied; raids stalled) and civ (4500 s); space 1385 s |
| 3 | omnivore / carnivore sinker | cell, creature, tribal (aggressive, 390 s, no warps), civ (military), space (warrior), ending: **finished, 0 console errors** | 10251 s (wall 91 min) | creature 4405 s unassisted; civ ASSIST at 4500 s |

Civ is the slow stage (14 cities, enemies retake cities); with `--assist` it always completes through the flagged nudge. Without `--assist` a run aborts at the first exceeded budget (cell 2400, creature 7000, tribal 3000, civ 4500, space 4200 sim s).
Tests: `node tests/obstacle_test.js` (prop sliding / whiskers / freeSpot / perf), `node tests/creature_stats_test.js`, `eco_sim_test.js`, `eco_features_test.js`, `water_test.js` all pass (water_test now also checks `pathAroundWater`: sinkers reach 8/10 goals across lakes, the other 2 are on islands, 0 deep-water ticks).

## 8. Known limits

* Watching needs a real GPU browser; swiftshader is slow (about 1-3 fps rendered).
* The creature bot can idle near its nest when hunting targets are unreachable; the stuck detector recovers it.
* Tribal is the slowest stage (food income is low); `tribal` maxSim is 3000 s.
* A fixed seed gives the same bot *decisions* but not bit-identical games (game code uses `Math.random` in places).
* The rig is inert without `autoplay=1`; do not ship pages that include `?autoplay=1` links.
