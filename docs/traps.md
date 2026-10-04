# Underwood — Traps

| | |
|---|---|
| Owner | Dungeon |
| Date | 2026-10-04 |
| Status | Phase 1 implemented |
| Extends | `docs/greenmere-town-and-underwood.md`, `src/sim/floorgen.js`, `src/sim/balance.js` |

Traps add a second layer to a floor: foes threaten the Warden directly, and traps decide where the fight can happen. The Warden has no dodge or jump: the verbs are walk, sprint, strike, ward, mend (a channel that moving breaks), and extract. So every trap is beaten by **position, timing, or a switch**, never by reflexes the controls do not have.

---

## 1. Pillars

1. **Every trap shows before it fires.** A trap has a visible tell (glow, hiss, raised plate, shadow) and a wind-up, the same idea as foe telegraphs (`telegraphSeconds`). A hit you could not have seen is a bug.
2. **Traps hit foes too.** Spikes, fire, darts, and falling stone damage anything standing in them. Luring a pack through a dart corridor is a valid way to fight.
3. **The counterplay depends on the trap.** Section 2 sets the three kinds.
4. **The route is always passable.** A trap may sit on the only way to the stairs, but then it can always be crossed without damage, by timing or by its switch. Only optional rooms may hold traps that have to be paid for in HP.
5. **Deterministic.** Traps are placed by the per-floor rng in `generateFloor`. A seed and floor index give the same traps, timings, and switches every time.

## 2. Decisions (answered 2026-10-04)

| Question | Answer |
|---|---|
| Do traps hurt foes? | **Yes**, all damaging traps hit foes as well as the Warden. |
| Optional or on the route? | **Both.** Traps can be in side rooms and vaults, and on the entrance→stairs route. |
| Disarm? | **Depends on the trap.** Constant hazards have a switch that turns them off. Cycling hazards are beaten by timing and have no switch. |

That gives three counterplay kinds. Each trap belongs to exactly one:

| Kind | Behaviour | Beaten by | Example |
|---|---|---|---|
| **Cycling** | Runs on a fixed on/off rhythm, always visible. | Timing. No switch. | Intermittent flame jet, pendulum |
| **Constant** | Always on until switched off. | A **switch** (lever, valve, rune) somewhere else in the room or the corridor before it. | Fire wall, spore vent, flooded channel |
| **Triggered** | Idle until stepped on, then fires once after a short wind-up and re-arms. | Seeing it and stepping around it, or sprinting over it. | Spike plate, dart plate, gong |

Switch rules for constant traps:

- The switch is always on the **near side** of the hazard, reachable from the entrance without crossing it. (Floorgen checks this with the existing `bfsFrom`; see section 6.)
- A switch is a hold-to-use interaction like extract: about 1.2 s, broken by a hit or by moving away.
- A switched-off trap stays off for the rest of the floor and is saved in the run state, like an opened chest.
- Foes can be standing in a constant hazard when you switch it off. Leaving it on and pulling foes through it is a valid choice.

## 3. Catalogue

Damage is a multiple of `skirmisherDmg(floorIndex)`, so it scales with depth like foe hits. On the Warden it goes through `incomingDamage` (guard and ward apply). On foes it goes through `applyFoeDamage`.

### 3.1 Shared (any biome)

| Trap | Kind | Tell | Effect | Notes |
|---|---|---|---|---|
| Spike plate | Triggered | Plate sits 3 cm proud, darker joints | 0.5 s after you step on it: spikes, 1.2× dmg, everything on the tile | Sprinting crosses it before it fires. Re-arms after 2 s. |
| Dart corridor | Triggered | Wall slots at both ends of a straight corridor, a plate in the middle | Darts fly the length of the corridor, 0.6× dmg per dart, 3 darts | They are projectiles, so ward soaks them fully. Darts also hit foes in the corridor. |
| Alarm gong | Triggered | Gong on a frame next to a doorway, a tripwire across the door | Wakes every foe within 2 rooms and sends them toward the gong | No damage. Its value is breaking the 9 m aggro bubble. |
| Collapse tile | Triggered | Cracked tile, dust drifting | 1.0 s later it falls through: 1.5× dmg, you land on the next floor | A gamble: you skip ahead but lose this floor's chests. Never on the route, never on boss floors. |
| Mimic chest | Triggered | A chest that breathes. Seen up close, the lid has teeth | Becomes an elite foe when opened | Rare (about 1 floor in 8 from floor 6). Drops elite chest loot. |

### 3.2 By biome

Each biome adds 2–3 traps, so each band of 10 floors plays differently.

| Biome | Trap | Kind | Effect |
|---|---|---|---|
| **Mossy Caves** | Spore puff | Cycling | A mushroom cluster puffs every 4 s, poison cloud 2.5 m wide for 1.5 s, damage over time |
| | Stalactite | Triggered | A shadow grows on the floor for 0.8 s before stone drops, 1.4× dmg in 1.5 m |
| | Spore vent | Constant | A cloud that stays, damage over time and it **breaks mend**. Switch: a valve set into the cave wall |
| **Sunken Temple** | Pendulum | Cycling | A blade sweeps across a corridor; crossing is about timing |
| | Dart corridor | Triggered | (shared, but the temple gets them most often) |
| | Flooded channel | Constant | Knee-deep water: slows you 40% and puts out braziers. Switch: a sluice lever |
| **Rootdeep** | Grasping roots | Triggered | You are held for 1 s. Foes are held too, so you can kite them through |
| | Thorn wall | Triggered | Closes the corridor **behind** you when you enter a room (a small ambush). Opens when the room is cleared |
| | Briar patch | Constant | Damage over time and slows. Switch: a root heart you strike to destroy (3 hits) |
| **Slate Crypt** | Sarcophagus | Triggered | The lid slides off when you pass, and 1–2 foes come out |
| | Alarm gong | Triggered | (shared, the crypt gets them most often) |
| | Cursed candles | Constant | While lit, foes in the room take 30% less damage. Switch: blow each one out (a short hold at each candle) |
| **Ember Forge** | Flame jet | Cycling | A grate vents fire on a visible rhythm: 1 s glow, 1.5 s fire, 2.5 s off. 1.0× dmg per 0.5 s while you are in it |
| | Fire wall | Constant | Fire right across a corridor or doorway. Switch: a bellows valve on the near side |
| | Trip hammer | Cycling | A crushing hammer next to an anvil, 2.0× dmg in a 1.5 m circle |
| | Slag pool | Constant | Heavy damage over time. **No switch**: it is part of the room's layout and never on the route |

Biomes repeat after 50 floors (`BIOME_BAND` × 5). From the second cycle on, a floor can borrow one trap from the previous biome, so traps combine instead of only getting stronger.

### 3.3 Trap rooms

- **Trapped vault:** a dead-end room (chests already prefer dead ends) set up as a trap course, with a chest guaranteed at least rare at the far end. Optional, so it may cost HP.
- **Sealed room:** an ambush. When you reach the middle, the doors close and a wave spawns (using `summonRoom`'s cap). You get out by clearing it or by extracting. On the route at most once per floor, from floor 8.
- **Gauntlet corridor:** a straight corridor with 2–3 cycling traps whose rhythms are out of step with each other. On the route only when the gaps are at least 1.2 s at sprint speed.

## 4. Foes and traps

- Every damaging trap damages foes too, using the same damage numbers.
- Foes do **not** walk around traps on purpose: they chase straight through. That is the opening for the player.
- The **trapwise** elite affix (new, from floor 15): this foe steps around triggered plates and waits out cycling traps. Shown as a fourth affix next to `hasted`, `thick`, and `warding`.
- Foes do not set off triggered traps unless they are a brute or an elite. That keeps skirmishers from setting off every plate on the floor before you get there.
- Spitter orbs that land on a plate set it off.
- **Bosses** use their biome's traps. The Ember Custodian lights the room's flame jets every third swing, the Moss Colossus brings down stalactites, and the Sunken Idol floods the room. A boss's traps can be switched off only after it reaches 50% HP.

## 5. Counterplay and progression

- **Delver track:** rank 1 shows triggered traps from 2 m further away. Rank 3 marks them on the minimap. Rank 5 halves switch hold time.
- **Gear affixes:** `trapward` (−% trap damage), `surefoot` (immune to slows and holds), `keen` (traps on the minimap at any rank). They use the existing affix system, with no new slots.
- **Switching off a trap gives a reward:** switching off a constant trap drops a small pile of the biome's material (`THEME_MAT`). That is the reason to engage with a trap instead of always going around it.
- **Mend:** damage over time breaks the channel the same way moving does, so you heal outside a hazard.

## 6. Generation

New pass in `generateFloor`, after chests and before props:

1. `trapBudget(n)` in `balance.js`: 0 on floors 1–2, then `min(12, 1 + floor((n - 2) / 3))`. Boss floors spend half of it, and none of it in the boss room.
2. Biome rows get a weighted `traps` table next to `props` (e.g. Forge: `{ flameJet: 4, fireWall: 2, tripHammer: 2, spikePlate: 2, slagPool: 1 }`).
3. Traps keep the same keep-out as spawns: never within `SAFE_RADIUS` / `SAFE_STEPS` of the entrance, and never on a chest, the stairs, or the entrance cell.
4. **Route check:** work out the shortest entrance→stairs path. Any trap on it must be cycling (with a gap of at least 1.2 s), triggered (with a free tile next to it to step around), or constant (with its switch reachable without crossing it, checked with `bfsFrom` while the trap's cells count as walls). Otherwise the trap moves elsewhere or is dropped.
5. Output: `floor.traps = [{ id, kind, col, row, yaw, phase, switch: { col, row } | null }]`. `phase` is an rng offset, so cycling traps next to each other are out of step.
6. Run state: switched-off traps go into `run.killed` as `TRAP_BASE + id` (`TRAP_BASE = 6000`, above `CHEST_BASE`), so leaving and coming back keeps them off.

## 7. Code layout

| Layer | File | Holds |
|---|---|---|
| Data | `src/sim/traps.js` (new) | Trap table (kind, counterplay, timings, damage multiplier, radius), `stepTrap(trap, dt)`, `trapHits(trap, x, z)`. Pure, so it can be tested. |
| Placement | `src/sim/floorgen.js` | The pass in section 6. |
| Numbers | `src/sim/balance.js` | `trapBudget`, `trapDamage(n, kind)`. |
| Play | `src/play/traps.js` (new) | Runs traps each frame, applies damage to the hero and foes, handles switches and the hold interaction, writes run state. |
| View | `src/view/traps.js` (new) | Code-built meshes and tells, in flat-shaded Lambert like the dungeon kit. Glows go through `src/view/lights.js` palettes. |
| UI | `src/ui/hud.js` | Hold prompt at a switch ("Hold E — close the valve"). Trap icons on the minimap at Delver rank 3 or with `keen`. |

## 8. Testing (`?test=1`)

- The same seed and floor give the same `floor.traps`.
- No trap within the entrance keep-out, on any of 200 sampled seeds across floors 1–60.
- **Route check:** on every sampled floor, the entrance→stairs path is walkable with constant traps counted as walls and their switches reachable.
- A cycling trap's pattern is periodic, and `trapHits` is false during its off window.
- Trap damage to a foe and to the hero matches `trapDamage` before mitigation.
- A switched-off trap is still off after a save and load.
- Readability (manual, `tools/shots.mjs`): every tell can be seen from the default orbit camera at both ends of its range.

## 9. Phases

| Phase | Scope | Why first |
|---|---|---|
| **1** | Spike plate (triggered), flame jet (cycling), fire wall + valve (constant), all biomes. Placement, route check, and damage to foes. | Covers one trap of each kind, tests readability from the camera, and builds the switch interaction once. |
| **2** | Alarm gong, dart corridor, trap budget per biome, minimap marks, Delver hooks. | Ambush and corridor play, plus progression. |
| **3** | The rest of the biome traps, trap affixes on gear, the trapwise elite. | Variety. |
| **4** | Trapped vaults, sealed rooms, gauntlets, mimics, boss trap phases. | Set pieces built on the systems that exist by then. |

## 9a. Phase 1 notes

- **Placement:** step 8 of `generateFloor` uses its own stream (`mixSeed(runSeed ^ 0x7a9b5, floor)`), so floors that existed before traps keep exactly the same layout, foes, chests, and props. Spike plates go on room cells with floor on all four sides. Flame jets and fire walls go on straight one-wide corridor cells. Spike plates are capped at 60% of the budget, and fire walls at 2 per floor. No two traps, or a trap and a valve, sit on touching cells. Traps also avoid prop, chest, and spawn cells.
- **Valve:** stands on the corridor cell on the entrance side of its fire wall, against a side wall, with a feed pipe along the wall to the trap. F starts a 1.2 s turn. Moving 0.6 m or taking any damage breaks it. `rt.castInfo` reports it as kind `"valve"`.
- **Foes:** brutes, elites, and bosses spring plates. Every foe takes damage from a hot trap, using a foot circle at 60% of its hurt radius. Trap kills go through `rt.woundFoe`, the same path as a sword kill (XP, loot, `run.killed`).
- **Numbers:** spike plate 1.2× a skirmisher hit, with a 0.38 s wind-up (walking across takes ~0.47 s, sprinting ~0.26 s). Flame jet 0.6× per 0.5 s on a 4.4 s cycle (0.9 s glow, 1.4 s fire, 2.1 s off). Fire wall 1.4× per 0.4 s. All damage goes through guard and ward.
- **Not in phase 1:** the material reward for switching off a trap, minimap marks, and Delver or gear hooks (phase 2).

## 10. Open points

- Should a collapse tile count as completing the floor for quests and floor-clear rewards?
- Is a slag pool with no switch too punishing in the Forge's narrow rooms? Maybe allow it only in rooms at least 5 tiles wide.
- Can the player see trap tells in the dark from the camera height? This needs a test with real art before phase 2.
