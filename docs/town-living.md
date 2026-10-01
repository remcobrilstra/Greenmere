# Greenmere — A Living Town

| | |
|---|---|
| Owner | Town / hub |
| Date | 2026-10-01 |
| Status | Phases 1–3 implemented; 4 planned |
| Extends | `docs/greenmere-town-and-underwood.md` (HUB-*, ART-*), `docs/structure.md` |

The current town is five props on a 14 m clearing. The houses are 2.35 m tall, about the Warden's height, and the spec calls them "exterior obstacles, not interiors". This document replaces that with a **life-size town you can walk into**. Every service has its own building and its own keeper behind a counter, and townsfolk walk the streets. Between delves the town is where the player turns dungeon materials into gear, distills draughts, trains, and shops.

The art direction does not change: code-built, flat-shaded Lambert geometry, no textures, no downloaded models, locked town light values. The control scheme does not change either: camera-relative WASD with an orbit camera.

---

## 1. Pillars

1. **Scale is honest.** The hero is ~2.1 m. Doors are 2.6 m tall and 1.6 m wide. Ground-floor walls are 3.6 m. Rooms are 8–12 m across. Nothing is "hero-height".
2. **Every service is a place.** A building, a sign you can read from the square, a keeper NPC, a counter, and a room that tells you what happens there (forge glow, copper still, shelves of goods, a stone circle on the floor).
3. **Someone is always around.** Keepers work at their stations. Townsfolk walk between real destinations (well, stalls, inn, homes), stop, chat, and step around the player.
4. **Walking in feels seamless.** No loading screen and no separate interior scene. The roof cuts away when you step inside, the camera tightens, and a warm interior light comes up.
5. **The town reads at a glance.** One central square with the Hearth fire, the gate on the north road, and services around the square, each with a hanging sign whose silhouette names its trade (anvil, flask, coin, ring).

---

## 2. Layout

North is −z. The town core (radius 36) is perfectly flat at y = 0. Hills blend back in between 36 and 64. The forest keeps all 3,050 trees and moves them outside radius 44.

```
                         N (−z)
                     [Delve Gate]  (0, −36)
                          ||   arrival (0, −27), faces town
          [The Still]     ||      [The Banked Fire]
          (−14,−20)       ||        (15,−20)  inn
   (cottage)          stalls ||                   (cottage)
            \          __||__                 /
 [Bramble & Board]===( Square )===[The Quench]
     (−18,−2) store   ( Hearth )    (18,−2) smith
                       \__ __/
   (cottage)              ||                     (cottage)
                     [The Circle]
                       (0, 20) trainer hall
          (cottage)                       (cottage)
                         S (+z)
```

| Place | Center | Faces | Footprint (w×d) | Role |
|---|---|---|---|---|
| Hearth Square | (0, 0) | — | cobble disc r 10 | Bonfire stays at (3.4, −2.6). Well, benches, market stalls, notice board |
| Delve Gate | (0, −36) | south | arch 3.2 × 3.6 opening | Only exit. Descent disc at (0, −34.2) |
| Town arrival | (0, −27) | yaw π (into town) | — | Extract and death land here |
| Bramble & Board | (−18, −2) | east | 11 × 8 | General store: buy, sell, buyback, stash, bank |
| The Quench | (18, −2) | west | 11 × 8 | Smith: gear crafting, kits, oil, +1 ilvl upgrade |
| The Still | (−14, −20) | south-east | 8 × 7 | Alchemist: distill draughts from dungeon materials |
| The Circle | (0, 20) | north | 13 × 10 | Trainer hall: spend skill points; stone circle inside |
| The Banked Fire | (15, −20) | south-west | 10 × 8 | Inn: social hub, townsfolk gather; later rumours |
| Cottages ×6 | ring at r 26–34 | toward square | 6 × 5 | Walk-in homes with fenced yards; where wanderers start and end their days |

Every coordinate lives in **one pure module**, `src/sim/townplan.js`. View, play, minimap, and tests import it and never repeat numbers.

---

## 3. Buildings

### 3.1 Construction kit (`src/view/buildings.js`)

A building is data (`townplan.js`) plus a generic builder:

- **Foundation:** stone band from −0.3 to the floor top. The floor top is `FLOOR_Y = 0.16`, the hero steps up onto it.
- **Walls:** 0.3 m thick boxes. Each face is split around its door openings. Every wall segment produces one oriented box collider, and those boxes are the only thing that stops the hero, so doors are real gaps.
- **Timber framing:** corner posts, sill and top beams, diagonal braces on the plaster. Plaster `#e7d7b4`, timber `#3a2416`–`#8d5b34`.
- **Windows:** framed, shuttered insets on both faces. Glass is a dim emissive warm pane, so windows glow faintly.
- **Door:** the opening plus a door leaf swung open against the inside wall, a stone step, and a gold sill.
- **Roof:** a gable prism with 0.5 m overhang, slate `#2f363e` (store keeps red `#6e2e28`), an optional jettied upper storey, and chimneys. Roof and upper storey are one "upper" mesh so they can cut away together.
- **Sign:** an iron bracket over the door holding a board and a trade silhouette (anvil, flask, coin stack, ring, tankard).
- **Interior:** plank floor, plus a furniture list from `townplan.js` (counter, shelves, barrels, crates, tables, benches, rugs, forge, anvil, still, cauldron, training dummies, weapon rack, hearth). Large furniture gets box colliders.

**Draw-call discipline:** all static parts of one building are merged by role into at most four meshes: shell, upper, interior, glow. All of them use the shared vertex-colour `lambert()` material, except the upper mesh, which gets its own material so it can cut away. Expect ~4 draws per building, ~45 for the whole town.

### 3.2 Going inside

`src/play/interiors.js` tracks which building rect contains the hero (pure point-in-OBB from `townplan.js`).

| | Outside | Inside |
|---|---|---|
| Upper mesh (roof, upper storey) | drawn | `colorWrite = false`, `depthWrite = false`: invisible, **still casts its shadow**, so the room stays roofed in light |
| Walls and window glass | full height | Clipped at `FLOOR_Y + CUTAWAY_H` (1.5 m) by the building's own clipping plane, with dark caps on the cut ("dollhouse"). The plane exists from the start and only its constant moves, so no shader variant changes. Shadows are not clipped |
| Camera pitch clamp | 0.12–1.05 | 0.55–1.15 (looks down into the room) |
| Camera distance clamp | 3.6–16 | 3.6–8.5 |
| Camera occluders | terrain + every shell + every upper | terrain + the *other* buildings |
| Interior light | intensity 0 | one shared warm `PointLight` moves to the room and fades up |
| Ground | `terrainHeight` | `FLOOR_Y` |
| Minimap eyebrow | `Greenmere` | building name |

The shared interior light is always in the scene (intensity 0 outdoors), so the shader light count never changes and nothing recompiles when you enter or leave.

### 3.3 Collision

`src/play/move.js` gains **oriented box colliders**: `{kind: "box", x, z, hx, hz, c, s, r}`, where `r` is the bounding radius used for grid bucketing. Circles stay `{x, z, r}`. Resolution is circle-vs-OBB closest point, three passes, same grid. The `?dev=1` overlay draws boxes as wire boxes, so the overlay child count still equals the collider count.

---

## 4. Services

| Building | Keeper | Panel | What it does |
|---|---|---|---|
| Bramble & Board | **Maud Bramble**, shopkeeper | `store` | Buy draughts, sell gear, buyback ×8, stash, bank (unchanged rules, HUB-04) |
| The Quench | **Orrin Vale**, smith | `smith` | Gear recipes (oil, kit) and the +1 ilvl upgrade (HUB-05, ITM-05) |
| The Still | **Sister Wen**, distiller | `still` *(new)* | Distills health and mana draughts from heartwood and rootfiber. These recipes move here from the smith |
| The Circle | **Old Tamsin**, trainer | `trainer` | Raise Edge, Bulwark, Mend, Delver (HUB-06) |
| The Banked Fire | **Pell**, innkeeper | none in Phase 1 | Flavor barks. Phase 4: rumours about the next floor's theme or boss |

- Each keeper stands behind their counter. The **interaction point** is the customer side of the counter, with interact radius 2.4 and close radius 3.2, unchanged.
- Prompts keep the station names (`F — The Quench`) so the HUD contract holds.
- Panels gain a keeper line under the eyebrow, e.g. *Orrin Vale, smith*.
- Recipes get a `station` field (`"smith"` or `"still"`). Each panel lists only its own recipes. Craft rules (`tryCraft`) do not change.

---

## 5. Townsfolk

### 5.1 Data (`src/sim/townfolk.js`, pure)

- **Roster:** 5 keepers and 10 wanderers. Each entry has a name, a role, a palette (tunic, trim, skin, hair), a hat (none / hood / cap / brim / kerchief), apron and beard flags, and a height scale (0.9–1.04).
- **Waypoint graph:** nodes for the square ring, well, stalls, benches, notice board, each door (outside and inside), inn tables, cottage doors, and the gate road. Edges are only drawn where a straight walk is clear of every collider. A self-test asserts this by sampling each edge against the collider set.
- **Wanderer brain:** a small state machine, `idle → pick destination (weighted by node tag) → walk path → linger (3–12 s, activity by tag: browse, chat, rest, drink) → …`. It is driven by its own `mulberry32` seed, so `stepTownfolk` is deterministic for tests and never touches the town scatter RNG.
- **Keeper brain:** stays at the post, plays an idle work loop (hammer, stir, tally, sweep), turns to face the hero within 5 m, and returns to work.

### 5.2 Play (`src/play/townfolk.js`)

- Steps every townsfolk record each town frame. Nothing runs in the dungeon, because `townRoot` is unparented there.
- **Personal space:** the hero collides with townsfolk (circle r 0.38). A walker whose next step would come within 0.9 m of the hero waits briefly, then sidesteps.
- **Barks:** short lines when the hero first comes within 3.5 m (per-NPC cooldown 25 s). Keepers greet by trade ("Mind the sparks."). Wanderers comment on town life. Barks are DOM speech plaques projected above the head (`src/ui/barks.js`), using `textContent` only, max 3 on screen, fading after 3 s.

### 5.3 View (`src/view/townfolk.js`)

Villagers are built like the Warden but cheaper: one merged vertex-colour body mesh (torso, head, hat, apron) plus four limb groups, all on the shared `lambert()` material. They use the hero's procedural walk swing and add idle gestures (arm work loops). That is ~6 draws each and ~90 for 15 townsfolk.

---

## 6. Dressing — making it feel lived in

- **Ground:** a cobble square, packed-dirt roads to every door and to the gate, and grass worn at the edges of the roads.
- **Square:** a well with a little roof and bucket, two benches, a notice board, three market stalls with coloured awnings and goods (crates, apples, cloth), barrels and sacks.
- **Streets:** lantern posts with emissive lamps (no extra lights), fences around cottage yards, a hay cart, woodpiles, flower boxes under windows, and a water trough at the smithy.
- **Motion:** chimney smoke puffs rise and fade (store, smithy, inn, still), forge coals pulse, the still bubbles, stall awnings sway slightly. Townsfolk provide the rest.
- **Sound:** none (an audio non-goal in the main spec).

---

## 7. Budgets

| | Budget |
|---|---|
| Town building draws | ≤ 50 |
| Townsfolk draws | ≤ 100 |
| Dressing draws | ≤ 40 (merged by kind) |
| Extra lights | exactly 1 (shared interior light) + the existing camp light |
| Colliders added | ≤ 200 boxes |
| Townsfolk step cost | ≤ 0.3 ms per frame for 15 actors |

The forest stays instanced and untouched in count.

---

## 8. Spec deltas (supersede `greenmere-town-and-underwood.md`)

| Item | Was | Now |
|---|---|---|
| HUB-02 | Five stations at fixed meadow XZ, buildings are exteriors | Stations are interaction points inside life-size buildings. Coordinates come from `townplan.js` |
| HUB-09 / CMB-10 | Arrival at (0, −8), yaw 0 | Arrival at `TOWN_ARRIVAL` (0, −27), yaw π, at the town end of the gate road |
| Key spatial model | "The player does not walk inside a house in v1" | The player walks into every service building (§3.2) |
| Terrain | Meadow blend 12 → 30 | Flat core to 36, blend to 64 |
| Forest | Clear inside radius 14 | Clear inside radius 44. Count still 3,050 |
| Smith recipes | All four recipes at the Quench | Draughts at The Still, oil and kit at the Quench |
| `docs/structure.md` file table | — | Adds `src/sim/townplan.js`, `src/sim/townfolk.js`, `src/view/buildings.js`, `src/view/townfolk.js`, `src/play/interiors.js`, `src/play/townfolk.js`, `src/ui/barks.js` |

HUB-08 (no town construction) still holds: nothing here lets the player build.

---

## 9. Testing (`?test=1`)

- **Layout:** every station point lies inside its building rect and in front of its counter. Every door gap admits a 0.42 radius hero, and the wall beside it does not.
- **Collision:** walking straight into a wall from outside never ends inside the rect. Walking through the door does.
- **Interior:** stepping inside sets `rt.insideBuilding`, the upper mesh has `colorWrite === false`, the interior light is above 0, and ground Y equals `FLOOR_Y`. Stepping out restores all of them.
- **Townsfolk:** `stepTownfolk` with a fixed seed is reproducible. No walker ends a 120 s simulation inside a collider. Every graph edge is clear.
- **Existing suites:** still pass after the coordinates move to `townplan.js` (tree count, flat shading, light constants, panels, save).

---

## 10. Phases

| Phase | Scope | Status |
|---|---|---|
| **1. The place** | `townplan.js`, flat core, life-size enterable buildings for all five services plus cottages, OBB colliders, floor grounding, roof and wall cutaway, indoor camera, interior light, The Still panel, roads, square, minimap buildings, test updates | done |
| **2. The people** | Keepers at counters, 10 wanderers on the waypoint graph, hero/NPC collision, barks, keeper line in panels | done |
| **3. The life** | Day and night, lit windows and lanterns, chimney smoke, seated patrons and bench sitters, open cottages with fenced yards, hens, two cats and a dog, walkable upper floors in the store and the inn, the town growing with depth | done |
| 4. The depth | Keeper dialogue plaque (greeting, rumours, tutorial hints by progress), split bank and stash into a Counting House, keeper reactions to milestones (`bestDepth`), new-player guide line | later |

## 10a. Implementation notes

- **Measured:** 161 draw calls in town (buildings 44, townsfolk 75). The waypoint graph (57 nodes) builds in ~15 ms at load. `?test=1` grows from 537 to 586 checks, all passing.
- **Frame step:** `main.js` floors `dt` at 0 as well as capping it at 33 ms. A `requestAnimationFrame` timestamp can trail `performance.now()`, and a negative step made the camera lerp extrapolate away.
- **Dev view:** `?dev=1&at=x,z[,yaw]&cam=yaw,pitch,dist` places the hero and camera for inspecting the town.
- **Test isolation:** the self-test sets `rt.townfolkSolid = false` so wandering villagers cannot make collider or prompt checks flaky. The townsfolk block turns it on for its own checks, and the suite restores it at the end.

## 11. Decisions (answered 2026-10-01)

All four open questions were answered **yes**. Phase 3 implements each one.

### 11.1 Day and night (amends ART-01)

- **Clock:** one town day lasts `DAY_SECONDS` = 18 minutes. A session starts at phase 0.36 (morning). The clock lives in `play/town.js` (`rt.townClock`) and only lights the town; the dungeon resets to the fixed values via `applyDungeonLight` → `resetTownTime`.
- **Keys:** night 0.0–0.2, dawn 0.26, **day plateau 0.32–0.68**, dusk 0.74, night 0.8–1.0, with smooth blends between keys. On the plateau every ART-01 value is exact: fog, background, hemisphere, ambient, sun colour and direction, and sky. The self-test pins phase 0.5, so every locked-value check still holds.
- **Night:** the sun becomes a pale moon from the opposite sky, the fog and background go deep blue, window glass glows (emissive 0.32 → 1.27), and lanterns light up (0.18 → 1.43). No extra lights are added.
- **Townsfolk at dusk:** they favour the inn and the fire. At night most go home.

### 11.2 Cottage interiors

- **Interiors:** all six cottages are open homes with a bed, a hearth, a table with stools, a chest, a shelf and a rug.
- **Yards:** each has a fenced front yard with a gate gap, a vegetable patch and a washing line.
- **Townsfolk:** wanderers' home nodes are inside, and they come out through the yard gate.

### 11.3 Upper floors

- **Where:** the store and the inn have a straight flight (`stairs` in `townplan.js`) up to a walkable upstairs: Maud's room above the shop, and the inn's guest beds.
- **Levels:** the hero has `rt.heroLevel` (0 or 1). The flight's midpoint switches level (`nextLevel`), and `groundAtLevel` gives the height on the ramp, the upstairs floor or the ground.
- **Colliders** carry a `level`, and only the hero's level collides:
  - *Ground floor:* side rails on the upper three quarters of the flight, and a rail at its top end.
  - *Upstairs:* rails on both sides of the stairwell and its low end, plus the upper walls and chimneys.
- **Cutaway:** one clipping plane per building. Its cut sits at floor + 1.5 m for whichever level the hero is on, and the cap set for that level is shown.
- **Interaction:** counters below do not answer from upstairs.

### 11.4 The town grows with depth

- **Tiers:** `townTier(bestDepth)` returns tier 1 at depth 3, tier 2 at depth 6 and tier 3 at depth 10.
- **Visibility:** growth pieces are marked `tier` in `townplan.js`. They render in three town-wide meshes shown by tier, and their colliders are `off` until unlocked. The waypoint graph always avoids them.

| Tier | Store | Smith | Still | Circle | Inn | Square |
|---|---|---|---|---|---|---|
| 1 (depth 3) | Draught shelf | Second anvil | Herb drying rack | Banners | Bunting | Bunting lamp to lamp |
| 2 (depth 6) | Coin coffer | Armour stand | Alembic | Two more dummies | — | Fourth stall |
| 3 (depth 10) | Relic trophy | Relic trophy | Glowing crystal | Trophy | Trophy over the fire | Warden statue |

- **Keepers notice:** the first greeting after a new tier is a growth line (`BARKS_TIER`).
- **Not construction:** none of this is player construction, so HUB-08 stands. It is visual and social only, and prices and rules are unchanged.

### 11.5 Phase 3 notes

- **Smoke:** one `InstancedMesh` of 70 puffs across 10 chimneys. Puffs fade toward the fog colour, so smoke darkens at night.
- **Animals:** 8 hens peck within 1.9 m of their yard centre and scatter from the hero. Two cats and a dog walk the villagers' graph at their own pace, and sit or sleep at fires, benches and doorsteps.
- **Seats:** graph nodes can carry a `seat` (inn stools, square benches). A walker lingering there eases onto it and sits, drinking at the inn.
- **New files:** `src/view/ambience.js` (smoke, hen, cat and dog meshes) and `src/play/ambience.js` (their tick).
- **Dev params:**
  - `&time=0..1`: set the hour.
  - `&depth=N`: preview tier growth.
  - `&level=1`: start upstairs with `&at`.
  - `&warp=S`: run S seconds of town life before showing. Headless Chrome's frame clock does not advance, so screenshots use this.
- **Measured:** `?test=1` is 624 checks, all passing.
