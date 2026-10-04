# Findings
this document contains findings from test session that need resolution



## Town

- [x] the roof of the well to to large for the well and its to low raise it and either grow the well or reduce the roof size
  - Resolved: posts raised to 2.9 m and the roof narrowed to just past the drum; the eaves now sit about 2.3 m up (was about 1.25 m). Blender town and code-built fallback.
- [x] street lamps in town need to be rotates to face the square or road they are ment to light up
  - Resolved: every lamp gets a yaw (`lampYaw` in `src/sim/townplan.js`); lamps along the gate road reach over the road, lamps round the square reach toward the well.
- [x] benches slow need proper rotation.
  - Resolved: the two square benches face the well (`faceCenter`), seats toward the square.
- [x] the decoration streamers on the square are to low, make the poles higher and raise the streamers
  - Resolved: each lamp post that carries a string gets a pole up to 3.95 m with a brass finial; strings hang from 3.85 m with less sag, so the flags stay above about 3.1 m.
- [x] building signs clip through the roofs of their buildings
  - Resolved: the hanging signs (store, smith, still, Circle, inn, bank) now hang with the board centred just under door height (2.55 m) instead of 3.15 m, so bracket and board stay below the eave overhang and read from the street; the board's bottom edge still clears 2.2 m. Changed in the Blender building builder (`tools/blender/furnish.py` `build_sign`, models rebuilt) and the code-built fallback (`src/view/buildings.js` `buildSign`).
