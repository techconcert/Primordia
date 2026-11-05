# Primordia (2008) — Reference Notes

Condensed reference for the team. Raw research with sources is in `RESEARCH_RAW.md`.
Where sources were silent, items marked *(design knowledge)* come from the design lead's own
knowledge of the game and should be treated as "close enough to feel right", not gospel.

## 1. Why Primordia was respected and loved

| What players loved | Why it matters for us |
|---|---|
| **The creators.** Anyone could build a creature in minutes and it *just worked*: walked, ate, danced. | The creature editor is the heart of the product. It must be fast, forgiving and fun even if the stages are simple. |
| **Procedural animation.** A three-legged lopsided thing still walks convincingly (Hecker/Wright, IEEE Spectrum 2008). | Gait must be derived from the design (leg count, leg length, symmetry, mass), never canned per template. |
| **Ownership across scales.** Your creature becomes your tribe, your city, your empire. Your choices leave "consequence" traits. | One persistent species and one persistent home planet through all stages. |
| **Scope / wonder.** "Eat, evolve, conquer, explore" — from tide pool to galaxy. | Each stage pulls the camera back and changes the genre. Stage transitions should feel like a reveal. |
| **Charm.** Bright, toy-like, comedic creatures, sing/dance/pose social play. | Cel shading, bold outlines, squash-and-stretch, sound effects for everything. |
| **Sharing (Primordiapedia, 100M creations by May 2009).** | Out of scope online, but designs serialise to JSON so export/import is trivial. |

Main criticisms (Metacritic 84; Eurogamer, GameSpot, NYT, Zero Punctuation): the early stages
were **too short and shallow**, each stage "a simplified version of another genre". SecuROM DRM
caused a backlash. Scientists criticised the "evolution" as intelligent design.

**Lessons we take:** keep the editor deep; give every stage at least one system with real
decisions (diet, ally vs. hunt, economy); make the world feel alive (ecosystem) rather than a
static playground; let early choices visibly matter later.

## 2. The stage count — 5, not 7

The released game has **five stages**: Cell, Creature, Tribal, Civilization, Space.
Galactic Adventures (June 2009) added captain missions inside Space; it was not a new stage.
The cell stage is internally a 10-step progression ladder (5 levels × 2), which is probably
where "more stages" memories come from. Earlier public demos (2005-2007) showed extra phases
that were cut or merged: an **Aquatic** stage between Cell and Creature, and a separate
**City** phase before Civilization. Those would make 7, but they never shipped.

**Our decision:** five playable stages, faithful to the release, plus the opening meteor intro.
The cut Aquatic stage is a documented stretch goal (see DESIGN.md §10).

## 3. Stage summaries (original)

### Cell
- Tide pool, top-down. WASD/click to move. Eat or be eaten. Size ladder: prey < peers < predators < epic.
- DNA from food (≈1.75 → 0.75 per item as you grow); cell DNA cap ≈105.
- Diet: start herbivore (filter) or carnivore (jaw). Final card from a **timeline** of actions,
  earlier actions weighted more. Cards: herbivore → *Siren's Song*, carnivore → *Raging Roar*,
  omnivore → *Summon Flock*.
- Parts found in meteor shards / dropped by killed cells. Editor via **Call Mate**.
- Part costs: Jaw 15, Filter 15, Proboscis 25, Flagella 15, Jet 25, Cilia 15, Spike 10,
  Poison 15, Electric 25, Eyes 5. Parts stack in the cell stage.
- Ends when the bar fills → "grow legs" → first creature editor.

### Creature
- Third-person on a spherical planet. Home nest = respawn + mating point.
- **Hunger** bar; diet restricts food (herbivore: fruit only, carnivore: meat only, omnivore: both).
- **Combat** abilities: Bite (fast), Charge (stun, long cd), Strike (multi-target), Spit (ranged DoT).
- **Social** minigame: target performs one of Sing/Dance/Charm/Pose; you match it to fill its
  meter. Impress enough members of a nest → species allied.
- Movement abilities: Speed, Sprint, Sneak, Jump, Glide. Plus Health.
- All abilities level 0-5. Parts stack into an ability, capped at 5 *(design knowledge; sources silent)*.
- Parts cost 25/75/150/250 by tier; eyes 10. Removing refunds. Complexity meter caps part count *(design knowledge)*.
- Parts unlocked from **bone piles**, by allying/killing **alpha** creatures; **epic** creatures guard
  valuable piles. **Rogue** creatures roam.
- **Brain size** grows with DNA: more health, larger body, more pack slots. Full bar → sapience.
- Cards: Social / Predator / Adaptable.

### Tribal
- RTS with up to 12 tribe members; food (meat, fruit, fish, seaweed, eggs) is the only currency.
- 5 rival tribes (6, 9, 9, 9, 12 members). Ally via gifts + playing the instrument they want, or raid.
- Tool huts: up to 6 slots from 9 tools (gather, fish, healing; spear, axe, torch; horn, maracas, didgeridoo).
- Pets (15 food). Tribal outfitter: clothing only, no body edits.
- Cards: Friendly / Industrious / Aggressive.

### Civilization
- Nations = cities on the homeworld. Primordiabucks from spice geysers (derricks), factories, trade.
- Vehicles (land/sea/air) in three roles: military, economic, religious. Buildings: city hall, house,
  factory, entertainment; linking adjacency affects production and happiness.
- Capture all cities by conquest, purchase, or conversion. Superweapons cost tens of thousands.
- Cards: Military / Economic / Religious (from tribal card + civ play).

### Space
- One ship, galaxy of stars. Spice, colonies, terraforming (atmosphere/temperature, T-score 0-3,
  ecosystem rings), empires and diplomacy, missions, pirates, wormholes, the Grox at the core.
- Travel range upgrades; badges/ranks. Goal: reach the galactic core.

## 4. Procedural animation (key facts)
- Gait computed from leg count, leg length, body symmetry; footfall timing calculated per stride.
- Short legs "scurry faster" so mixed-length creatures still look right.
- Torso bob from leg length and spine flexibility.
- No fixed skeleton: limb motions defined relative to other body parts.
- In Maxis' own tests ~7/10 random creatures animated well — we should aim for the same robustness:
  every design must at least *move* plausibly.
