# QA report — Area B: Tribal, Civilization, Space, hand-offs, save, ending

QA lead B. Build tested: working tree at /home/claude/primordia (no edits made). Method: Playwright + SwiftShader
(1–11 fps, so logic was mostly tested by stepping `SP.game.current.update(0.05)` in-page), plus real mouse
input for box-select, right-click orders, star clicks and key presses. Seeds 101 and 7. Screenshots are in
`/tmp/claude-0/qa_b/`, and the test scripts are in `/tmp/claude-0/qa_b/scripts/`. No console errors were logged in any run.

## Overall verdict

All three stages load, run without errors and hand off correctly: tribal → civ → ship editor → space →
Staff of Life ending → credits → title. Each stage has the systems from the design doc, and the comic HUD,
the ending comic and the orbit/terraform view look good. The stages are **not yet shippable as a 20–30 minute
experience**:

* **Civ has no lose state.** A passive player loses their only city after about 13 minutes and the game soft-locks (P0).
* **Space can be won in about 4 minutes of game time.** The starting ship already has enough range to reach the core in 6 jumps, the Grox can be ignored, and the guardians do not block the Staff (P1).
* **Tribal Continue scrambles the rivals.** After a reload, rival names, species and sites are reassigned, so a "conquered" tribe moves elsewhere (P1).
* **Tribal number keys spend food during performances.** Pressing 2 or 3 during a 1-lane performance silently buys tool huts (P1).
* **Tribal is trivial.** Gatherers stop working after a few seconds, mashing pads gives a 50% performance score, and raids win without losses. Once one rival is dealt with, food piles up past 1000 with nothing to buy.
* **Phone width (390×760) is broken in all three stages,** and there are no touch controls for the RTS stages.

Primordia-faithfulness is good in structure (gift/perform/raid, 3 capture types, spice, T-score, Grox, wormholes,
Staff). It is weak in consequence: allied or conquered tribes do not shape civ, civ money does not reach space,
and the ending art does not show the player's creature or ship.

## Top 10 fixes (in order)

1. B-01 Civ defeat or recovery when the player owns 0 cities (soft-lock).
2. B-02 Space: make the core actually gated (start range or Grox gate) and make guardians block the Staff.
3. B-03 Tribal: persist each rival's identity (dir, species, kind, wanted) so Continue restores the same tribes.
4. B-04 Tribal: while a performance is running, swallow Digit1–9 (do not fall through to hut building).
5. B-05 Tribal: gatherers keep working (search wider and wait for regrowth instead of going idle).
6. B-07 Phone layout at 390 px for the tribal, civ and space HUDs, plus basic touch (tap select, long-press order).
7. B-06 Rhythm minigame: penalise empty presses. Also make raids cost something (rival defence is too weak).
8. B-08 Carry civ money into space (or remove the dead `primordiabucks` field) and stop the civ autosave overwriting `finished`.
9. B-09 Tribal: gifting should take the nearest gatherer, not fail with "Nobody is free".
10. B-12/B-13 Misleading UI text: "need ~30" range, "Terraform on the right", "Core distance" label. Toasts also cover the space view buttons.

---

## Findings

### B-01 — P0 — Civ: losing your last city soft-locks the game (no defeat or recovery)
- **Repro:** `/?stage=civ&skipintro=1&seed=101`, do nothing, and step the update for 20 minutes (`scripts/c3.js`).
- **Expected:** a defeat screen with retry/continue, or the AI never fully eliminates the player, or the player can refound.
- **Actual:** at about 13–14 minutes rival `r4` takes the capital. Player money freezes at 3647, all player vehicles are killed (`old.dead`), nothing can be produced, and there is no message beyond "city was lost". The stage cannot be completed.
- **Cause:** `captureCity` in `js/stages/civ.js:493-498` handles nation elimination generically. Nothing in `civ.js` checks `old === you`, and `checkWin` (civ.js:205) only checks the win condition. The military AI is allowed to attack the player from `W.prog >= 520` (civ_ai.js:176), and relations drift down via `aiDiplomacy`.
- **Fix:** when the player has 0 cities, show a "Your nation has fallen" modal with *Retry from autosave* / *Rebuild at …*. Also protect the capital, e.g. AI won't target the player's last city before prog 1800, or the capital has +100% hall HP.
- **Owner:** civ.js, civ_ai.js

### B-02 — P1 — Space: the core is reachable in ~4 minutes with the starting ship; the guardians are irrelevant
- **Repro:** `/?stage=space&skipintro=1&seed=101`, run `scripts/s2.js`: BFS path with the default range, wait for full energy before each jump, then autopilot to the Staff.
- **Measured:**
  * The starting range is 24.6 pc (`15 + 4·2.4` in space.js:154). With that range the core is 6 hops away (`81 > 68 > 73 > 56 > 36 > Grox23 > 0`).
  * The whole run took **254 s of game time**, with 0 upgrades, 0 colonies, 0 kills and full hull.
  * The ending card reads "Colonies 0 · Empires allied 0 · Ships destroyed 0 · Jumps 6".
  * Jumping is always allowed with hostiles present, so Grox systems can be passed straight through.
  * The 3 core "Guardian" ships are ignored: the Staff pickup at space_sys.js:451 only checks distance < 20.
- **Expected (DESIGN §9):** reach the core by upgrading drive range or via the wormhole key, about 20–30 minutes.
- **Fix:**
  * Make the Grox belt a hard gate. Either block jumps into `s.grox` or `s.core` unless range ≥ 30 or the key is held, or make `jumpInfo` refuse a core jump from inside the belt unless the Grox fleet in that system is cleared.
  * Lower the starting `range` base to about 12.
  * Gate `finishQuest` on `this.enemies.length === 0`.
- **Owner:** space.js (`jumpInfo`, `shipStats`), space_sys.js:451, space_galaxy.js

### B-03 — P1 — Tribal: Continue scrambles rival tribes (names, species, sites); statuses land on the wrong tribe
- **Repro:** `scripts/t7.js`. Conquer rival 0, raise rival 2, autosave, reload, then Title → Continue.
- **Actual:**
  * Before: `Ragrunes/conquered, Zizis/aggr, Wobzuvexs/72 …`
  * After: `Wobquas/conquered, Razis/aggr, Ragrunes/72 …`
  * The rival sites themselves moved (`campaign.rivalSites[0]` changed from 0.93,-0.35,0.12 to -0.25,0.85,0.46).
  * The tombstone and the "conquered" status now belong to a different village in a different place.
- **Cause:** `buildRivals` (tribal.js:333-346) re-derives sites through `findFlat` and the distance filters, then fills the gaps randomly, and shuffles the species pool with `G.rng`. Its RNG state differs on resume because the random-site loop is skipped. `serialize` (tribal.js:240) stores only status and HP by index.
- **Fix:** serialize each rival's `{dir, speciesId, kind, wanted, name}` and rebuild from that on resume. Use a dedicated RNG per rival.
- **Owner:** tribal.js

### B-04 — P1 — Tribal: pressing number keys during a performance builds tool huts and spends food
- **Repro:** `scripts/t8.js`. Start a performance with only horn players (1 lane), then press 3, 2 and 5.
- **Actual:** food went from 170 to 75, and the Healing, Fishing and Axe huts were built. The rhythm lanes use keys 1–3, so this is a natural misclick.
- **Cause:** tribal.js:1168-1172 only consumes the key when `idx < lanes.length`; otherwise it falls through to `onToolButton`.
- **Fix:** while `G.session` is active, `return` for every Digit/Z/X/C key.
- **Owner:** tribal.js

### B-05 — P1 — Tribal: gather orders end after one or two bushes, so constant re-ordering is needed
- **Repro:** box-select all 5 members and right-click a bush (`scripts/t2.js`, real mouse).
- **Actual:** the group drains 2 bushes (5 fruit) in about 8 s, deposits, and all 5 go idle. Food went 60 → 70 and then stayed flat for 50 s.
- **Cause:** the alternate-node search radius is 26 u around the exhausted node (tribal.js:694-699). The village clearing has no flora within 25 u (`clearArea`). Bushes hold only 2–3 fruit.
- **Comparison:** with perfect re-ordering every second, income is about 100 food/min (`scripts/t6.js`), so food is plentiful. It is the micro that is the problem.
- **Fix:** search 45–60 u from the village or pile for any fruit ≥ 1. If none is found, wait near the last node for regrowth instead of clearing the order. Show a "🍓 idle gatherers" hint.
- **Owner:** tribal.js

### B-06 — P2 (design) — Tribal is too easy and runs out of goals
- **Mashing:** pressing all lanes at 10 Hz scores exactly 50% with zero skill. Two such performances ally a peaceful tribe in 71 s (`scripts/t9.js`). Empty presses have no penalty (tribal_ui.js:215).
- **Raids:** 4 axe warriors conquer the aggressive 6-member tribe in under 120 s with 0 losses.
- **Food overflow:** after the first rival, food accumulates past 1000. Sinks stop at the hut and baby caps, and raids steal only 12 at a time.
- **Pacing estimate:** a competent player finishes all 5 rivals in about 10–12 minutes, mostly spent walking 150–340 u between villages (rival sites in seed 101 are 155–341 u away).
- **Fix:**
  * Penalise empty presses (−1 point and break the combo).
  * Scale rival defence with `size` and tier.
  * Make later rivals need gifts *and* performance.
  * Add food sinks: pet upgrades, hut tier 3 cost, or feasts that boost attitude.
- **Owner:** tribal.js, tribal_ui.js

### B-07 — P1 — Phone width (390×760) HUD is broken in all three stages; RTS has no touch controls
- **Screenshots:** `m_tribal.png`, `m_civ.png`, `m_space.png`.
- **Tribal:** the Tribes bar, minimap and Baby/Outfitter buttons overlap each other. The rival list covers about 30% of the screen. The tool bar is cut off at tool 6 and covered by the corner pause/mute buttons.
- **Civ:** the hint toast covers the money panel. The bottom bar is cut off (Air, Capital and Planet are missing) and overlapped by pause/mute. The nation list is hidden. There is no way to open diplomacy.
- **Space:** Market, Ship, Hail and Badges overlap the money, energy and Galaxy buttons. The goal panel covers the planet.
- **Touch:** tribal and civ require drag-box, left-click and right-click. There is no touch path at all.
- **Expected:** ART.md §3 says it "must work … at phone width".
- **Fix:**
  * Add a `@media (max-width:700px)` layout per stage: stack the top-left HUD, collapse the rival or nation list into a button, and make the bottom bars scroll with right padding for `#corner`.
  * Touch: tap selects, tap a target to give a context order, two-finger drag pans.
- **Owner:** tribal_ui.js, civ_ui.js, space_ui.js CSS, core/input.js

### B-08 — P2 — Civ → Space carry-over: money dropped; `civ.finished` overwritten
- **Money:** civ `finish()` stores `camp.space.primordiabucks = money` (civ.js:231), but `newState` hard-codes `money: 450` (space.js:115). In `scripts/hand.js` the player had about 5000 💰 at the win and 450 in space.
- **Overwritten flag:** `completeStage` → `autosave` → `civ.serialize()` (civ.js:250) re-creates `campaign.civ` with a full `world` blob. This drops `finished: true` and bloats the save.
- **Fix:**
  * Either start space with `max(450, primordiabucks × 0.25)` or delete the field. If it is deliberately not carried, say so on the stage card.
  * Make `serialize` return the carry-only blob when `W.ended`.
- **Owner:** space.js, civ.js

### B-09 — P2 — Tribal: Gift fails when everyone is working
- **Actual:** `onRivalGift` (tribal.js:1108) only picks idle units or units with a move/gift order. With all units gathering it toasts "Nobody is free to carry the gift" and does nothing (`scripts/t9.js` T10).
- **Fix:** take the nearest non-baby unit and interrupt its order.

### B-10 — P2 — Tribal: duplicate rival names
- **Actual:** seed 101 has two tribes named "Razis" (species name collision). The list, labels and toasts become ambiguous.
- **Fix:** de-duplicate names in `buildSpecies` and `buildRivals`, e.g. append "of the Hills".
- **Owner:** tribal.js:279-357

### B-11 — P2 — Civ: rival cities do not sit on the tribal rival sites
- **Actual:** after the hand-off, the rival cities are 21–84 u from their tribal village sites (`hand.js` log). `findSite(..., 62)` (civ.js:347) moves them, so "nests become villages become cities" is only loosely true. Allied or conquered tribal status has no effect in civ (DESIGN pillar 4).
- **Fix:**
  * Reduce `minSep` for rival sites, or let tribal pick sites that already satisfy civ spacing.
  * Make tribes allied in tribal start as Friendly nations in civ.

### B-12 — P2 — Space UI text is wrong or misleading
- The goal text says "need ~30" (space.js:764) and the Market says "core needs about 30" (space.js:440), but range 25 already reaches the core (see B-02).
- The orbit hint says "Terraform on the right" (space.js:777), but the panel is on the left.
- The "Core distance" bar (space.js:718) shows progress (0 at start, 100 at the core). Rename it "Progress to core".

### B-13 — P2 — Space: toasts cover the top-centre title and the Galaxy/System/Orbit buttons
- **Screenshots:** `hand_space_start.png`, `s4_galaxy.png`. The first-visit toast hides the view buttons for 5 s.
- **Related:** planet pins overlap the HUD and goal panel, and the "✨ The Core" galaxy pin draws over the energy/hull HUD.
- **Fix:** move `#toasts` below `.sp-top` in space, or offset it to about 130 px.

### B-14 — P2 — Tribal: camera stays at the rival village after a performance
- **Actual:** `beginSession` moves the camera to the rival (tribal.js:1060) and never returns. The player is left far from home while raids hit the pile.
- **Fix:** restore the previous `focusDir` on `endSession`, or add a "back" ping.

### B-15 — P2 — RTS edge-pan with cursor at (0,0) (known issue, confirmed)
- **Actual:** with `mouse.inside` true and the cursor parked at a screen edge, the tribal camera drifts away in a few seconds (`scripts/t3.js`).
- **Fix:** require a real `mousemove` before enabling edge-pan, and disable it while the pointer is over HUD panels.
- **Owner:** core/camera.js:181

### B-16 — P2 — The ending does not feature the player's creation
- **Actual:** the comic panels use a generic saucer and a smiling Grox ("Turn back, little ones!" with a happy face). The credits buttons overlap the scrolling credits text (`s3_credits.png`).
- **Fix:** render the player's ship (`X.portrait` already exists) and species into the panels. Pin the buttons below the roll.

### B-17 — P2 — Civ restore side-effects
- On Continue, `restoreWorld` calls `claimGeyser` for each owned geyser (civ.js:545). This fires a "Derrick built! +100 💰/min" toast and popup for every player derrick.
- Building plot designs are reassigned after the mesh has already been built (civ.js:538), so restored buildings show the nation's current design rather than the saved one.
- Vehicle orders and production queues are not saved.

### B-18 — P2 — Tribal visuals
- The rival hut roof reads as a huge flat octagon parasol (`tbot_social_m5.png`).
- Thick black diagonal bands appeared over the background behind the tribal Stage Complete card (`hand_tribal_card.png`), probably an outline or ruin mesh near the camera. Unverified; worth a look.

---

## What works well
- **Hand-off chain:** the tribal card (Industrious → Economic nation), the civ win modal, the mandatory ship editor (Esc correctly ignored, `allowCancel:false`) and the civ card all work. Space then starts with the designed ship, the correct archetype (Trader from 2 trader-type cards) and the Staff ending. "Finish game" gives a final card and returns to the title, and the save keeps `space.ended`.
- **Civ:** box-select and right-click orders work. Spice claim by land and sea vehicles works (+100/min). Capture by all three methods works, and the win check and card tie-break work. The AI expands and fights.
- **Space:** galaxy click → Jump (J) → warp works. The planet card, autopilot, scan (T), orbit view with the T-score square and sliders, Market (B), and Esc/modal handling all work.
- **Tribal:** box select, the context right-click (gather, hunt, fish, raid, perform), tool fetch, babies, hut tiers, raids on the food pile, and allied tribute work.

## Pacing summary (simulated)

| Stage | Design target | Observed |
|---|---|---|
| Tribal | 20–30 min | Social bot allied tribe #1 at about 3 min. A mash-and-raid strategy needs about 2 min per rival plus walking: roughly 10–12 min. |
| Civ | 20–30 min | A passive player is eliminated at about 13 min (B-01). The capture pace for an active player was not fully measured; win flow was verified via forced captures. |
| Space | 20–30 min | About 4 min to the ending with no upgrades (B-02). |

---

## Fix status

Verified with Playwright (SwiftShader), stepping `update()` in-page, plus real touch events through CDP at 390x760. Zero console errors in every run. New file: `js/stages/rts_touch.js` (shared pan/pinch for tribal + civ, added to index.html).

- **B-01 fixed.** Civ now has a defeat card ("Your civilization has fallen" with *Try again* and *Quit to title*). Retry restarts from an entry snapshot (kept in `camp.civ.entry`). No AI may target the player before progress 1500 (25 min at normal speed), and the capital gets a 2.2x hall and 6 sturdier turrets. A passive player was untouched for 30 min.
- **B-02 fixed.** Base drive range is 8 (start range about 18). Jumps into the Grox belt or the core need range 34 (3 upgrades, prices raised) or the Wormhole Key. Guardians (boss + 2) now block the Staff. The nearest-to-core star outside the belt is 9 hops away at start range. A fight bot beats the guardians with a few upgrades and dies with none.
- **B-03 fixed.** Rival identity (site, species, kind, wanted tool, name, gifted/performed flags) is saved and rebuilt, and rivals use their own RNG. Continue gave identical rivals.
- **B-04 fixed.** Digit and Z/X/C keys are swallowed while a performance runs (food stayed 170).
- **B-05 fixed.** Gatherers search 26, then 60, then 90 units, deposit and resume, or wait up to 45 s for regrowth. A hint is shown. Food rose steadily over 2 minutes.
- **B-06 mostly fixed.** Empty presses cost a point and break the combo (mashing scored 0). Whole villages defend, defenders are stronger and scale with tribe tier, and raiders fight defenders before buildings. Building HP is higher and axe damage lower. A 4-axe raid on the last tribe lost all four. Tribes 3-5 need both a gift and a performance. No new food sink was added.
- **B-07 fixed (one gap).** 390 px layouts for all three stages. Tribal and civ have tap-select, tap-to-order, one-finger pan, pinch zoom, an "All" button and a Nations list. The space ship has on-screen turn, thrust, fire and boost buttons, tap-to-fly and pinch zoom. Gap: planet-orbit view has no touch flight.
- **B-08 fixed.** Space starts with 450 + 25% of the Civ treasury (max 1500) and says so. `civ.finished` and the carry-only blob survive autosaves. The ship editor spend is deducted.
- **B-09 fixed.** Gift takes the nearest grown-up, preferring idle ones, and interrupts their order.
- **B-10 fixed.** Rival names are unique ("Razis of the Shore").
- **B-11 partially fixed.** Civ uses a tighter spacing for tribal sites. Allied tribes start Friendly (+62) and conquered ones resentful and poorer. 3 of 5 cities now sit within 28 units of their tribal village. Two still move 77-84 units because of terrain.
- **B-12 fixed.** The "need ~30" text is replaced by the real gate, the orbit hint says the panel is on the left, and the bar is now "Progress to core".
- **B-13 fixed.** Space toasts sit below the title and view buttons (at the bottom on phones). Pins draw behind the HUD.
- **B-14 fixed.** The camera returns to where it was after a performance.
- **B-15 fixed (stage level).** Edge-pan needs a real mouse move and is off over HUD or on touch. `camera.js` was not touched.
- **B-16 fixed.** The ending comic shows the player's own ship, the Grox is angry, and the credits buttons sit on a gradient bar below the roll.
- **B-17 partially fixed.** Plot designs are restored faithfully, there is no derrick toast spam on Continue, and production queues are saved. Vehicle orders are still not saved.
- **B-18 partially fixed.** The hut roof is now a stepped thatched cone. I could not reproduce the black diagonal bands, so that part is untouched.
