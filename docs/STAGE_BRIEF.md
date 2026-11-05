# Brief for stage engineers

You are a senior JS/Three.js gameplay engineer on "Primordia Web". Repo: /home/claude/primordia (local git;
DO NOT commit — the lead commits). Several engineers work in parallel in this repo, each owning
different files.

## Read first
1. `docs/ARCHITECTURE.md` fully, **including the Changelog at the bottom** — it documents the real
   APIs as built (they extend the original contract).
2. `docs/DESIGN.md` §0-3 (pillars, carry-over, shared systems, the living world) and your stage section.
3. `docs/ART.md` (look and UI), `docs/REFERENCE.md` (the original game's version of your stage).
4. The real code you'll call: `js/core/*.js`, `js/creature/*.js`, `js/editors/*.js` (SP.editor,
   SP.assembly), `js/world/*.js` (SP.planet, SP.surf, SP.sky, SP.physics, SP.eco). Example harnesses:
   `tests/world_harness.js` (how to wire planet + sky + eco + physics + follow camera),
   `tests/creature.html`, `tests/editor.html`. Example stage: `js/stages/intro.js`.

## Rules
- Classic IIFE scripts on `window.SP`, no modules, no network/CDNs (only `lib/three.min.js`).
- You own `js/stages/<stage>.js` and optional helpers `js/stages/<stage>_*.js`. If you add helpers,
  add their `<script>` tags to index.html directly after your stage's main script — that's the only
  edit to index.html allowed. Don't edit anyone else's files. If a shared module has a bug or a
  missing feature, work around it locally and list it in your report (the lead routes fixes).
- Stage contract: ARCHITECTURE §4.8 (`enter(campaign, opts)`, `update(dt,t)`, `exit()`, `scene`,
  `camera`, optional `pause/resume/serialize`). `exit()` must dispose everything (no leaks across
  stage changes). Support `opts.resume` (Continue) using your `serialize()` blob in `campaign[id]`.
- Must be playable starting directly from `?stage=<id>&skipintro=1` (uses `SP.game.defaultCampaignFor`).
  If the default campaign lacks something you need (e.g. homeDir, rivalSites), generate it.
- Honour `SP.game.fast` (progress ×5) for testing.
- Use SP.ui for HUD (comic style per ART.md), SP.audio for sfx + music(mood), SP.ui.help for H help.
- Crowds: use `SP.creature.build(design, {lod:'low'})` (being optimised to few draw calls) and cap
  visible animated creatures; keep total draw calls < 600.
- Finish by calling `SP.game.completeStage(card, summaryLines)` after writing all carry-over data
  into the campaign (DESIGN §2).

## Testing
- Start your own server on your assigned port from the repo root in the background:
  `python3 -m http.server <port>`.
- `BASE=http://localhost:<port> node tools/shot.js "/?stage=<id>&skipintro=1&fast=1" /tmp/claude-0/<name>.png 6000 [actions.js]`
  — write Playwright action scripts (hold keys, click, drag) that actually play the stage through
  its key loop, and use `page.evaluate` to inspect `SP.game.state` / your stage object and to
  fast-forward (e.g. grant resources) so you can verify the end-of-stage flow too.
- LOOK at the screenshots with the Read tool and iterate until it looks polished, readable and in
  the cel/comic style. Zero console errors from your files.

## Report
When done, reply with a ≤250-word report: files, what works, how you verified it, workarounds for
shared-module issues, known issues.
