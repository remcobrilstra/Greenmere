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
| `src/view/town.js` | PR-00 | Terrain, 3,050 trees, scatter, camp, `townRoot`. Owns `mulberry32(0x6e11e5)`. |
| `src/view/lights.js` | PR-00 | Sun, hemisphere, ambient, fog, `applyTownLight`. |
| `src/play/camera.js` | PR-00 | `placeCamera`, `cameraPlanarBasis`, town `groundY`. |
| `src/play/move.js` | PR-00 | Movement, `dampAngle`, collider resolve. |
| `src/ui/hud.js` | PR-00 | Plaques, vitals, action bar, minimap, `say`. |
| `src/test/self-test.js` | PR-00 | `selfTestControls`. Assigns `window.__selfTestControls`. |
| `src/sim/balance.js` | PR-01 | Difficulty, XP, damage, upgrade gold. |
| `src/sim/floorgen.js` | PR-01 | `mixSeed`, `generateFloor`. Plain plan, no meshes. |
| `src/play/town.js` | PR-02 | Gate and station prompts. |
| `src/view/dungeon.js` | PR-03 | `buildFloorMesh(plan)`. Does not sample `terrainHeight`. |
| `src/sim/biomes.js` | Dungeon | `BIOMES` table (layout knobs per 10-floor band), `biomeFor`, `biomeIndex`, `biomeDepth`, `biomeEntry`. Pure data. |
| `src/view/dungeonkit.js` | Dungeon | `makeBuilder` (baked flat-shaded triangles) and the biome prop writers used by `buildFloorMesh`. |
| `src/play/space.js` | PR-03 | Town or dungeon, `descendFloor`, `arriveTown`. |
| `src/play/combat.js` | PR-03 | Windups and strikes. Numbers come from `src/sim`. |
| `src/sim/save.js` | PR-04 | Schema and `migrate` only. |
| `src/ui/panels.js` | PR-05 | Store, stash, trainer, smith. |
| `src/sim/items.js` | PR-06 | Slots, affixes, `dropIlvl`, recipes. |
| `src/sim/townplan.js` | Town | Every town coordinate: buildings, doors, counters, furniture, roads, props, arrival, wall boxes, `floorAt`, `buildingAt`. See `docs/town-living.md`. |
| `src/sim/townfolk.js` | Town | Keeper and wanderer roster, barks, waypoint graph, `shortestPath`, `stepWalker`. |
| `src/view/buildings.js` | Town | Life-size buildings, interiors, signs, street props, square, roads, shared interior light. |
| `src/view/townfolk.js` | Town | `buildVillager`, `poseVillager`, `villagerPartsReady`. Villagers start code-built and are re-skinned from the Blender part library (`assets/models/villager.glb`, `tools/blender/villagers.py`): shared parts whose vertex colours carry a colour slot and a baked shade, painted per villager from its `look`. Same rig and poses. |
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
- Art direction stays the locked Outer Wood style: flat shading, Lambert world, standard-material hero, no tone mapping, no downloaded models.

## Pull-request order

PR-00 extract the prototype. PR-01 formulas and floor plans. PR-02 town stations. PR-03 one playable floor. PR-04 save. PR-05 store. PR-06 gear. PR-07 trainer. PR-08 smith. PR-09 full enemy set. PR-10 themes and dungeon map. PR-11 frame budget. Each PR is specified in `docs/greenmere-town-and-underwood.md`.

## Town art pipeline

The town's art (building exteriors and interiors, furniture, yards, the square, roads, street props, the hearth pit) is generated in Blender from the town plan, not hand-placed, so it stays in step with doors, windows, chimneys, furniture spots and colliders. The code-built town in `view/buildings.js` is the fallback and the reference for footprints.

1. `node tools/townplan-dump.mjs` writes `tools/blender/townplan.json` from `src/sim/townplan.js`.
2. In Blender (Scripting tab or the Blender MCP): `p = r"<repo>/tools/blender/greenmere.py"; g = {"__file__": p}; exec(open(p).read(), g); g["build"]()` (or `g["build"](["smith"])`). Styles per building live in `STYLES` there; furniture and props live in `tools/blender/furnish.py`, one function per townplan `type`. Ambient occlusion is baked into vertex colours; output is `assets/models/<id>.glb`, meshopt compressed.
Character and nature libraries: `g["build_villagers"]()`, `g["build_animals"]()`, `g["build_nature"]()` (rocks, bushes, flowers, grass, mushrooms, trees, clouds, quest glyphs) and `g["build_hero"]()` (with `preview_hero()`). Villager parts: `g["build_villagers"]()` writes `assets/models/villager.glb`; `g["preview_villagers"]()` lines up painted examples in Blender.

3. `node tools/shots.mjs` renders every building view headless and writes `shots/sheet.png`; `--ab` adds a before column (models blocked), `--test` runs the self-test, `--time=0.9` shoots at night. Raw views take any dev query (`q:at=x,z&cam=yaw,pitch,dist`); `&hide=hero` hides the Warden for close looks; `&near=<name>` drops it beside a named town object (`hen-0-0`, `cat-moss`, a villager id). Needs Playwright (found in the npx cache, or `npx playwright install chromium`).
