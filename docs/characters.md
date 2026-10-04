# Characters: skinned humans

Plan for replacing the rigid-part humans (the Warden and the villagers) with skinned,
animated characters built in Blender. Foes keep their shader rig (`src/view/foes.js`):
they are instanced per pack and three.js does not instance skinned meshes.

## Why

- **Fidelity.** Rigid parts cap the look: seams at elbows, knees, shoulders and hips;
  no continuous silhouette from torso into limbs; a face that is a box with features
  stuck on. A skinned body bends at the joints and can carry a real face.
- **Motion.** Today's walk, strike and idle are sine waves on groups. Skinned characters
  play authored clips (idle, walk, run, strike, cast, hurt) blended by an `AnimationMixer`.
- **Draw calls.** A villager is 5-6 meshes, the Warden about 30. A skinned character is
  one body draw plus one per rigid accessory socket.

## Look

Still the Outer Wood style: flat shading, faceted, vertex colours, no textures, no
downloaded models. Humans may carry more triangles than the rest of the world:

| Character | Budget (tris) |
|---|---|
| Warden, body + worn gear | 3,000-5,000 |
| Villager | 2,000-3,000 |

Proportions, face and silhouette are chosen in phase 0 from rendered candidates.

## Skeleton

One skeleton for every human, so a clip made once plays on all of them. About 24 bones:

```
root
└ hips
  ├ spine ─ chest ─ neck ─ head            (socket: head gear)
  │          ├ shoulder.L ─ upperArm.L ─ forearm.L ─ hand.L   (socket: shield on forearm.L)
  │          ├ shoulder.R ─ upperArm.R ─ forearm.R ─ hand.R   (socket: weapon in hand.R)
  │          └ cape.1 ─ cape.2
  ├ thigh.L ─ shin.L ─ foot.L
  └ thigh.R ─ shin.R ─ foot.R
```

Bones are `Object3D`s, so the play code keeps its handles: `rt.body` becomes the hips,
`rt.torso` the chest, `rt.head` the head, `rt.leftArm`/`rt.rightArm` the upper arms,
`rt.leftLeg`/`rt.rightLeg` the thighs, `rt.cape` cape.1. Code-driven pose layers (strike
twist and lunge, aim, the hearth channel) write on top of the mixer each frame, after
`mixer.update`. Self-test checks on those handles keep working.

## Pipeline

- `tools/blender/humans.py`, exec'd into `greenmere.py` like the other generators.
- Body: a continuous mesh from a joint graph (Blender's Skin modifier), one
  subdivision, then flat shading. Face built on the head: brow, nose, eyes, ears, hair.
- Weights: computed by the script from distance to bone segments with blends at the
  joints (deterministic, no bone-heat failures); accessories rigid to one bone; skirts
  and tabards split between hips and thighs.
- Colour: the existing slot code (vertex colour R = colour slot, G = baked shade), so a
  gear look or a villager look still paints one shared mesh (`src/view/partlib.js`).
- Clips keyframed by the script (idle, walk, run, strike, cast, mend, hurt, fall),
  exported in the same `.glb` with the skin.
- Gear: weapons, shields, head gear and trinkets rigid on sockets; body armour
  (tabards, pauldrons, greaves, boots) skinned to the same skeleton, merged with the body
  per look, so a dressed Warden stays one skinned draw.

## Runtime

- `src/view/hero.js` builds a `SkinnedMesh` from the library (painted per look) and an
  `AnimationMixer`; the code-built Warden stays as the fallback until the file loads.
- `src/play/heroanim.js` maps actions to clips with crossfades, then applies its pose
  layers to the bones.
- `src/view/townfolk.js` does the same for villagers on the shared skeleton; body
  variety from per-villager bone scales (height, build) and swappable hair, hats, aprons.

## Status

- Phase 0 done (2026-10-04): the `warden` style in `tools/blender/humans.py`, the
  heroic body (2.02 m, sturdy build) with the storybook head (clean-shaven, swept hair).
- Phase 1 done: `assets/models/warden.glb`, `src/view/heroskin.js`. Seven authored
  clips (idle, walk, run, strike, hearth, mend, flinch) play through an
  `AnimationMixer` with gameplay timing in charge (`rt.heroMotion`); the code rig
  still drives the death fall and is the fallback.
- Phase 2 done: 35 pieces (`WD_PIECES`), shown and painted per worn slot and tier by
  `dress()` (coat, hood, mantle, pauldrons, cape, gems and runes; helm, circlets,
  crown and halo; boots, knee cops, greaves and rings, spikes; necklace and pendants).
  Swords and shields per tier are pieces too, modelled in the idle hold on hand.R
  and forearm.L; the relic charm is still the piece-built one, scaled down.
- Phase 3 done: `assets/models/folk.glb` (`build_folk`), the same skeleton with
  villager pieces (body, three hair styles, beard, tunic, dress, apron, trousers,
  shoes, cap, brim, hood, kerchief) coloured with the villager look slots.
  `src/view/townfolk.js` gives each villager a cloned skeleton and one skinned mesh
  merged from its pieces, painted from its look; `poseVillager` retargets the limb
  groups onto the bones, so every work loop carries over. One draw per villager.

## Phases

0. **Style.** Three or four hero candidates rendered side by side in rest, walk and
   strike poses; pick one (or a blend).
1. **Warden body.** Skinned base body, skeleton, idle/walk/run/strike clips, in game
   behind the fallback; self-test hero checks pass on bones.
2. **Warden gear.** Every slot and tier rebuilt on the skeleton; gear look painting.
3. **Villagers.** Shared skeleton, per-look bodies, keepers and wanderers switched over.
4. **Cleanup.** Retire the rigid-part rigs, part libraries and pose code they needed.

## Risks

- Gear tiers are most of the art work: every piece needs re-authoring for the skeleton.
- Joint deformation needs iteration (shoulders, hips); review in Blender in rest, walk
  and strike before any export.
- The self-test measures the hero rig directly (strike twist, lunge, nose heading); those
  checks move to bones in phase 1.
- The minimap portrait (`src/ui/portrait.js`) renders the Warden and needs the new mesh.
