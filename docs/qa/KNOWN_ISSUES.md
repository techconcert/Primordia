# Known issues reported by module engineers (input for QA)

- Lighting: SP.render.makeLights defaults (ambient 0.75, sun 1.25) push toon highlight past 1.0, colours look neon/blown out. Creature engineer suggests ambient 0.55, sun 0.95. Space orbit planet terrain tint washed out.
- Planet outline halo too thick from far away (intro/space).
- Cell stage pacing too short (~1.5 min bot, maybe 3-5 min human); carnivore play under-tuned. Dev hooks ?cellprogress, SP.stages.cell._dbg, window.__food exposed.
- Creature stage: click-to-target is screen-space; pack members of the player species lost on mating redesign (eco.setPlayerDesign despawns them); pack-fighting untested; shared eco dispose throws on dead actors without rig (stage works around it); camera obstruction heuristic only.
- Eco: predators rarely kill in near zone; multi gait slopeGrip changed to 1.2 (DESIGN table said 0.5).
- Low-LOD creatures: eyes/jaw/spine bend static; close-up limb look unverified.
- Tribal: RTS camera edge-pans when mouse at (0,0); rivals 100-300u away (long walks); rhythm panel overlaps screen centre; wildlife uses own AI, not SP.eco; dev hooks _G/_dbg.
- Civ: RTS camera Q/E conflict → Z/C rotate; AI aggressive (takes neutral cities quickly); turret heads dark; land vehicles get stuck in bays; three r128 InstancedMesh 0-count instanceColor workaround.
- Space: Wormhole Key mission chain, real wormhole jump, pirate colony raids and save/continue untested end to end; injected .modal-wide CSS.
- Editors: touch untested; limb tips estimated, not read from rig.
- General: real-GPU fps never measured (swiftshader 1-30 fps). Full campaign intro→cell→creature→tribal→civ→space never played through in one session.
