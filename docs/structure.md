# Greenmere module structure

Implementer checklist. Game rules, formulas, and the pull-request sequence live in `docs/greenmere-town-and-underwood.md`. This file is the layout contract. A new system goes in the file named here. It does not go back into `index.html` or into `src/main.js`.

## Shape

One static page. Native ES modules. No bundler, no `package.json`, no TypeScript. Three.js stays the pinned import-map URL `three@0.183.2/build/three.module.min.js`. Addons (GLTFLoader, the meshopt decoder) come from `three/addons/`, the same pinned version's `examples/jsm/`. Serve the folder with a static server. `file://` is unsupported.

`index.html` is the shell: plaque CSS, existing HUD nodes, the import map, the window error handler, and:

```html
<script type="module" src="./src/main.js"></script>
```

## Layers

Imports point downward only.

| Layer | May import | Must not |
|---|---|---|
| `src/sim/` | other `src/sim/` files | `three`, `document`, `window`, `localStorage`, mesh builders |
| `src/view/` | `three`, `src/sim/` | roll loot, write a save, read the keyboard, decide a combat outcome, import `src/play/` |
| `src/play/` | `sim`, `view`, `ui` | build geometry inline |
| `src/ui/` | existing DOM nodes | import `three`, generate floors, apply damage |
| `src/main.js` | `play`, `ui`, `view`, `test` | hold formulas or the floor generator |

`src/view/` receives callbacks such as `addCollider` from `main`. It does not import `src/play/` to get them.

## Files

PR-00 creates only the files the walking wood needs. Later files appear in the PR that first needs them.

| File | First PR | Holds |
|---|---|---|
| `src/main.js` | PR-00 | Boot, frame loop, `?test=1` / `?dev=1`. From PR-04, the only `localStorage` access for `greenmere.save.v1`. |
| `src/sim/rng.js` | PR-00 | `mulberry32`, `hash2`. |
| `src/sim/terrain.js` | PR-00 | `terrainHeight`, `smoothstep`. |
| `src/view/materials.js` | PR-00 | `paintFaces`, `mergeParts`, `lambert`, `makeMat`. |
| `src/view/hero.js` | PR-00 | The Warden. Local forward is −z. Built from code, then from the Blender piece library (`assets/models/hero.glb`, `tools/blender/hero.py`) once loaded: base and every gear tier painted from `gearLook`, same rig groups, buckets and materials; `nose` and `toe` stay code-built. `hero.ready` resolves after the switch. |
| `src/view/heroskin.js` | Characters | The skinned Warden (`assets/models/warden.glb`, `tools/blender/humans.py` `build_warden`): one skeleton, 35 pieces `wd_<piece>` that `dress(looks)` shows and paints per worn slot and tier, seven clips played by an `AnimationMixer` from `rt.heroMotion` (walk and run scrubbed from the step phase, the strike from `rt.strikeInfo`). Hangs under the code rig's `body`; `retarget()` turns the code groups' rotations into bone rotations before every draw and shadow, so movement, strikes, the death fall and the portrait keep posing the code rig. Sword and shield groups ride the hand and forearm bones. See `docs/characters.md`. |
| `src/view/town.js` | PR-00 | Terrain, 3,050 trees, scatter, camp, `townRoot`. Owns `mulberry32(0x6e11e5)`. The terrain's exact surface is `terrain.userData.heightAt` (no raycasts). Instanced scatter is cut into 50 m cells with their own bounds and a draw distance per kind (`townRoot.userData.cullScatter`, run from the town tick); each tree is one merged trunk + canopy geometry. |
| `src/view/lights.js` | PR-00 | Sun, hemisphere, ambient, fog, `applyTownLight`. |
| `src/play/camera.js` | PR-00 | `placeCamera`, `cameraPlanarBasis`, town `groundY`. |
| `src/play/resolution.js` | Frame budget | `attachResolution`: adaptive pixel ratio (cap 1.75x, steps of 0.125 down while frames run past ~49 fps, back up after a calm 5 s, a level that fails right after a raise is skipped for 30 s); `rt.renderScale`. Dev `&res=pin` or `&res=<ratio>`; the self-test pins it. |
| `src/play/move.js` | PR-00 | Movement, `dampAngle`, collider resolve. |
| `src/ui/hud.js` | PR-00 | Plaques, vitals, action bar, minimap, `say`. |
| `src/test/self-test.js` | PR-00 | `selfTestControls`. Assigns `window.__selfTestControls`. |
| `src/sim/balance.js` | PR-01 | Difficulty, XP, damage, upgrade gold. |
| `src/sim/floorgen.js` | PR-01 | `mixSeed`, `generateFloor`. Plain plan, no meshes. |
| `src/play/town.js` | PR-02 | Gate and station prompts. |
| `src/view/dungeon.js` | PR-03 | `buildFloorMesh(plan)`. Does not sample `terrainHeight`. |
| `src/sim/biomes.js` | Dungeon | `BIOMES` table (layout knobs per 10-floor band), `biomeFor`, `biomeIndex`, `biomeDepth`, `biomeEntry`. Pure data. |
| `src/view/dungeonkit.js` | Dungeon | `makeBuilder` (baked flat-shaded triangles), the code-built biome prop writers, and the Blender biome kits (`assets/models/dungeon-<key>.glb`, `tools/blender/dungeon.py`): `loadDungeonKit`, `kitVariants`, `stampPiece`. `buildFloorMesh` dresses every wall face, corner, prop and floor scatter from the kit (meshes `dungeonDressing`, `dungeonDressingGlow`); until the kit is in it uses the writers, then re-dresses in place. |
| `src/view/foes.js` | Dungeon | The five foe archetypes: Blender-built per biome (`assets/models/foes-<key>.glb`, `tools/blender/foes.py`) as parts with pivots, merged per archetype with a part index per vertex so each pack stays one instanced mesh; the vertex shader swings parts from per-foe `aAnim` (walk phase and amount, wind-up and lunge, flinch) read off combat state by `makeFoeAnimator`, and lights `<part>Glow` pieces. The code-built bodies (`codeFoeGeometry`) stand in until a set loads. |
| `src/sim/traps.js` | Traps | Trap kinds (`TRAP_KINDS`: counterplay, footprint, timings, damage multiple), `stepTrap`, `trapHits`, `trapStrikes`, `cycleStage`, the route check `unreachableSwitches`, `TRAP_BASE`. Pure. Placement lives in `floorgen.js` (`plan.traps`). See `docs/traps.md`. |
| `src/view/traps.js` | Traps | `buildTraps` (spike plates, flame jets, fire walls, valves with feed pipes; valve colliders), `syncTrapView`, `syncValveView`. Code-built, flat Lambert. |
| `src/play/traps.js` | Traps | `attachTraps`: steps the floor's traps from `rt.tickTraps` (called by combat), hurts the Warden via `rt.applyIncoming` and foes via `rt.woundFoe`, the valve hold (`rt.valveNear`, `rt.tryUseValve`), switched-off traps in `run.killed`. |
| `src/play/space.js` | PR-03 | Town or dungeon, `descendFloor`, `arriveTown`. |
| `src/play/combat.js` | PR-03 | Windups and strikes. Numbers come from `src/sim`. |
| `src/sim/save.js` | PR-04 | Schema and `migrate` only. |
| `src/ui/panels.js` | PR-05 | Keeper windows (store, smith, still, trainer, inn, bank, notice board): one centred window, the keeper's talk and request on the left, the counter on the right with tabs and item cards. |
| `src/ui/gearui.js` | Town | Shared by the sheet, the keeper windows and the action bar: rendered icons (`icon`, `iconName`) with line glyphs as fallback, `itemCell`, the shared tooltip (`attachTips`, `#ui-tip`), `gearTip`, `upgradeStatus`. |
| `src/ui/iconmap.js` | Town art | Generated by `tools/icons_pack.py`: cell index of every icon in `assets/icons/icons.webp`. Do not edit. |
| `src/sim/items.js` | PR-06 | Slots, affixes, `dropIlvl`, recipes. |
| `src/sim/townplan.js` | Town | Every town coordinate: buildings, doors, counters, furniture, roads, props, arrival, wall boxes, `floorAt`, `buildingAt`. See `docs/town-living.md`. |
| `src/sim/townfolk.js` | Town | Keeper and wanderer roster, barks, waypoint graph, `shortestPath`, `stepWalker`. |
| `src/view/buildings.js` | Town | Life-size buildings, interiors, signs, street props, square, roads, shared interior light. |
| `src/view/townfolk.js` | Town | `buildVillager`, `poseVillager`, `villagerPartsReady`. Skinned villagers from `assets/models/folk.glb` (`tools/blender/humans.py` `build_folk`): per villager a cloned skeleton and one merged, look-painted skinned mesh; the limb groups stay the pose source and are retargeted onto the bones. Without it, the older part library below. Villagers start code-built and are re-skinned from the Blender part library (`assets/models/villager.glb`, `tools/blender/villagers.py`): shared parts whose vertex colours carry a colour slot and a baked shade, painted per villager from its `look`. Same rig and poses. |
| `src/view/partlib.js` | Town art | `loadPartLibrary`, `paintParts`, `swapGeometry`: slot-coded Blender part libraries (R = colour slot, G = baked shade) painted per character. |
| `src/play/interiors.js` | Town | Which building and level hold the hero, roof and wall cutaway, interior light, indoor camera, level-aware grounding. |
| `src/play/townfolk.js` | Town | Steps keepers and wanderers, hero–villager collision, greetings. |
| `src/ui/barks.js` | Town | Speech plaques above townsfolk. |
| `src/view/ambience.js` | Town | Chimney smoke (instanced), hen, cat, and dog meshes, `poseAnimal`, `animalPartsReady`. Animals are re-skinned from the Blender part library (`assets/models/animals.glb`, `tools/blender/animals.py`) painted by coat. |
| `src/play/ambience.js` | Town | Ticks smoke, hens, and pets. |
| `src/sim/townlore.js` | Town | Keeper lines, rumours, counsel, `guideHint`. Pure. |
| `src/play/dialogue.js` | Town | Talk cycling per keeper, inn rest, guide target. |
| `src/ui/guide.js` | Town | The guide plaque under the minimap. |
| `src/sim/quests.js` | Quests | Daily notices, keeper requests, objectives, events, claims, rollover, save normalization. Pure. |
| `src/play/quests.js` | Quests | `rt.questEvent`, take, claim, abandon, today's date. |
| `src/ui/questlog.js` | Quests | Tracker plaque for carried quests. |
| `src/ui/character.js` | Town | XP bar in the vitals plaque; the character sheet (C / portrait; I opens the Pack tab) with tabs Character (paper doll between the six worn slots, attributes, combat numbers, training, wealth), Pack (24-cell grid, loot rules), Ledger (lifetime tally); hover or focus tooltips with gear numbers and worn-vs-carried comparisons. Dev: `?dev=1&open=sheet&tab=ledger&tip=eq:weapon`. |
| `src/sim/lifestats.js` | Town | `emptyStats`, `normalizeStats`, `recordStat`, `playTimeText`: the lifetime tally saved as `hero.stats` (time played, delves, kills by kind, falls, deepest floor, spoils, crafts, sales, quests). Pure. |
| `src/play/lifestats.js` | Town | Feeds the tally from `rt.questEvent` and `rt.claimQuest`, counts play time by wall clock. Dev floors count nothing. |
| `src/ui/atlas.js` | Dungeon | Explored-tile memory for the current floor (`rt.explored`, `rt.tileSeen`) and the full floor map plaque (M). |
| `src/ui/foebars.js` | Dungeon | Health bars over wounded foes (below full only): lag chunk, ward strip, elite edge, named boss bar. |
| `src/ui/hurtfx.js` | Combat | Red screen-edge flash on damage (scaled to the hit), low-health pulse, sets `rt.camShake`. |
| `src/ui/castbar.js` | Combat | Hearth (Extract) cast bar above the action bar; "Interrupted" when the channel breaks. |
| `src/play/heroanim.js` | Combat | Hero action poses over the walk cycle (strike: cock, whip, lunge; hearth: arms raised), slash-arc fade, hearth channel effect. Runs last in `update`. |
| `src/play/questmarks.js` | Town | Which giver shows a quest mark ("!" to take, "?" to hand in), placed over the head or, for a keeper indoors, over the door. |
| `src/view/questmarks.js` | Town | `buildQuestMark`: the yellow "!" and "?" glyphs. |
| `src/sim/gearstats.js` | Town | `heroStats` (mirrors `derive()`), `compareEquip`, `compareUpgrade`, readable `affixLines`, trainer `trackEffects` / `trackNext`. Pure; feeds the panel previews. |
| `src/view/townmodels.js` | Town art | `loadModel`, `loadTownModels`: the Blender-built town from `assets/models/` (one `.glb` per building, plus `town.glb` for the square, roads, street props and hearth pit). `buildings.js` swaps every part in at once when all files load, or keeps the code-built town whole if any fails. |
| `src/view/gateportal.js` | Town | `buildGatePortal`: the Delve Gate's swirling veil (shader), inward motes, pulsing light; `tick(time)` from `play/town.js`, which also starts a delve when the hero walks through the opening. |

## Rules

- Town scatter uses `mulberry32(0x6e11e5)` inside `src/view/town.js`. Dungeon code uses `mixSeed` and never that generator.
- `generateFloor` returns data. Only `src/view/dungeon.js` builds the floor meshes.
- The frame loop calls play once per capped `dt` (`Math.min(0.033, …)`). Floor generation does not run inside the animation callback.
- A circular import is a failed review. Move the shared piece to `src/sim/` or to a third play file.
- Collider records are plain data: circles `{x, z, r}` and oriented boxes `{kind: "box", x, z, hx, hz, yaw}` (building walls, furniture). Town colliders may carry `level` (0 ground, 1 upstairs; only the hero's level collides) and `tier` (off until the town reaches that tier). The same records drive resolution. Decorative meshes with no collider stay on an explicit list.
- Town coordinates come from `src/sim/townplan.js`. Do not repeat a building or station position anywhere else, tests included.
- Do not add a file that this table does not name.
- UI style is Hearthwood: fonts (`assets/fonts`, Cinzel for titles and labels, Alegreya for text) and tokens (`--wood-*`, `--brass*`, `--ink`, `--frame-bg`, `--frame-shadow`, `--tip-shadow`) sit at the top of the `<style>` in `index.html`; the theme layer at its end sets only fonts, colour, borders and shadows. New UI uses the tokens, not literal colours.
- Art direction stays the locked Outer Wood style: flat shading, Lambert world, standard-material hero, no tone mapping, no downloaded models.

## Pull-request order

PR-00 extract the prototype. PR-01 formulas and floor plans. PR-02 town stations. PR-03 one playable floor. PR-04 save. PR-05 store. PR-06 gear. PR-07 trainer. PR-08 smith. PR-09 full enemy set. PR-10 themes and dungeon map. PR-11 frame budget. Each PR is specified in `docs/greenmere-town-and-underwood.md`.

## Town art pipeline

The town's art (building exteriors and interiors, furniture, yards, the square, roads, street props, the hearth pit) is generated in Blender from the town plan, not hand-placed, so it stays in step with doors, windows, chimneys, furniture spots and colliders. The code-built town in `view/buildings.js` is the fallback and the reference for footprints.

1. `node tools/townplan-dump.mjs` writes `tools/blender/townplan.json` from `src/sim/townplan.js`.
2. In Blender (Scripting tab or the Blender MCP): `p = r"<repo>/tools/blender/greenmere.py"; g = {"__file__": p}; exec(open(p).read(), g); g["build"]()` (or `g["build"](["smith"])`). Styles per building live in `STYLES` there; furniture and props live in `tools/blender/furnish.py`, one function per townplan `type`. Ambient occlusion is baked into vertex colours; output is `assets/models/<id>.glb`, meshopt compressed.
Character and nature libraries: `g["build_villagers"]()`, `g["build_animals"]()`, `g["build_nature"]()` (rocks, bushes, flowers, grass, mushrooms, trees, clouds, quest glyphs) and `g["build_hero"]()` (with `preview_hero()`). Villager parts: `g["build_villagers"]()` writes `assets/models/villager.glb`; `g["preview_villagers"]()` lines up painted examples in Blender.

Foes: `g["build_foes"]()` (or `g["build_foes"](["crypt"])`) writes `assets/models/foes-<key>.glb`; `g["preview_foes"]("crypt")` and `g["look_foes"]("crypt")` to look. Parts are named `fo_<key>_<archetype>_<part>` with the node origin on the joint; the motion rules per part live in `src/view/foes.js`.

Dungeon kits: `g["build_dungeon"]()` (or `g["build_dungeon"](["crypt"])`) writes `assets/models/dungeon-<key>.glb` per biome; `g["preview_dungeon"]("crypt")` builds without baking and `g["look_dungeon"]("crypt")` frames the laid-out pieces. Pieces: `wall0..3` (a 4 m face, rock at z < 0, room at +z; built biomes 3.6 m tall), `cornerOut`, `cornerIn`, prop variants per floorgen kind (`urn0`, `urn1`, `pillar0`), `scatter0..2`, and `<piece>Glow` for the emissive parts. Palettes mirror `DUNGEON_THEMES` in `src/view/lights.js`.

Frame cost: `node tools/perf.mjs [views]` times update, HUD and render submit (CPU), the GPU per render (timer queries) and the paced frame on the real GPU (ANGLE/D3D11), with `--dpr=1.75`, `--cpu` (top functions), `--meshes` (heaviest meshes), `--ablate` (one feature off at a time) and `--own` (serve this checkout: run a copy in a `git worktree` for before/after).

3. `node tools/shots.mjs` renders every building view headless and writes `shots/sheet.png`; `--ab` adds a before column (models blocked), `--test` runs the self-test, `--time=0.9` shoots at night. Dungeon views `d-cave`, `d-temple`, `d-root`, `d-crypt`, `d-forge` wait for the biome kit. Raw views take any dev query (`q:at=x,z&cam=yaw,pitch,dist`); `&hide=hero` hides the Warden for close looks; `&near=<name>` drops it beside a named town object (`hen-0-0`, `cat-moss`, a villager id). Needs Playwright (found in the npx cache, or `npx playwright install chromium`).

## Icon pipeline

Item, supply, material and ability icons are rendered in Blender from the same part library the Warden wears, so an icon always matches the piece on the hero.

1. In Blender (MCP or Scripting tab), after loading `greenmere.py` as above: `g["build_icons"]()` renders every icon (`g["icon_names"]()` lists them; pass a list to render a few) into `tools/blender/icons_out/` (not committed). Gear icons are `<slot>-heir`, `<slot>-r<rarity>-t<theme>` and `<slot>-r3-t<theme>-g<relic>`, coloured as in `src/view/gearlook.js`; props and poses live in `tools/blender/icons.py`.
2. `python tools/icons_pack.py` (Pillow) adds the dark outline and shadow, packs `assets/icons/icons.webp` and writes `src/ui/iconmap.js`.
3. `src/ui/gearui.js` picks the cell (`iconName(item)`); a name missing from the sheet falls back to the line glyph.
