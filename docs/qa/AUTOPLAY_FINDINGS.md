# Autoplay findings (game issues seen while the bot played)

Found with `tools/autoplay.js` / `?autoplay=1`. Severity: B = blocks a stage for a human too, M = major, m = minor.

## Fixed in this pass

### AUTOPLAY-F01 (M, fixed): Cell stage mate cooldown never counts down
`js/stages/cell.js:1737` (`mateFlow`). `S.mateCd` was set to 8/12 s after a mating but nothing decremented it, so only one mating per run was possible and the bot (and a player) could not keep evolving through the editor. One-line fix added (`if (S.mateCd > 0) S.mateCd = Math.max(0, S.mateCd - dt);`).

## Fixed later / open

### AUTOPLAY-F02 (fixed): Tribal units pinned in / at lakes on the way to a rival camp
Cause: no route planning; `avoidWater` fell back to the straight (wet) vector and `escapeCtrl` pushed back to shore, so units oscillated at the shoreline.
Fix: new `SP.physics.pathAroundWater(body, planet, goalPos, out)` (`js/world/physics.js`): straight when the line is dry, otherwise a cached A* over a coarse grid of cells the body's water class may stand in, string-pulled to the farthest visible waypoint, replanned every 6 s (20 s when the goal is unreachable). Floaters whose goal cannot be reached on foot head straight and swim it (`body._paw.wade`, callers skip `avoidWater`); sinkers stop at the nearest shore (`body._paw.unreachable`). `tribal.js` `motion` uses it for every non-swimmer, plus a jam breaker (no net progress for 2.5 s -> alternating side-step) for trees/rocks/crowds. Covered by `tests/water_test.js` (sinkers reach 8/10 lake-crossing goals; the other 2 are on islands).
The bot keeps its flagged ASSIST warp for units that still sit still 8 s next to a rival camp; remaining cases are rivals on islands for sinker tribes.

### AUTOPLAY-F03 (m, open): Non-military civilizations cannot win a fight with turrets by design, but nothing tells the player
`js/stages/civ_units.js:347-366` (turret fire, range 24, 6.5 dmg per 0.9 s each) vs `U.doWork` range 16.6 (`civ_units.js:408`) and `U.markWar` at 25 % conversion (`civ_units.js:523`). Once a religious/economic attack passes 25 % the city turns hostile and its 3-4 turrets kill a trickling-in group in seconds. The only workable play is massing outside range 24 and going in together. Worth a hint in the city dock for economic/religious cards.
Also: `U.CAPS = {land:8, sea:6, air:4}` (`civ_units.js:8`) caps the fleet at 18; with 10k+ money unused late in the stage there is nothing to spend money on.

### AUTOPLAY-F04 (fixed): Creature sinkers could not cross lakes, bone piles beyond them stayed unreachable
The creature click-to-walk (`creature.js`) and the bot's `steer()` now use `pathAroundWater` for sinker/floater bodies, so a human or the bot walks round the lake. Piles on another island (`body._paw.unreachable`) are reported and skipped (bot) instead of being chased.

## Rig notes (not game bugs)

* Headless swiftshader runs at about 3 sim s per wall s; the stage budgets in `bot_*.js` (`maxSim`) are generous.
* Game code uses `Math.random` in places (civ vehicles, effects), so a seed reproduces the bot's decisions, not the exact game.
