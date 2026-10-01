// Town life that is not a person: chimney smoke, hens in the cottage yards,
// two cats and a dog that roam the villagers' paths.

import { COTTAGES, floorAt } from "../sim/townplan.js";
import { CATS, DOGS, HEN_YARDS, createHen, stepHen, createPet, stepWalker } from "../sim/townfolk.js";
import { buildSmoke, buildHen, buildCat, buildDog, poseAnimal } from "../view/ambience.js";
import { dampAngle } from "./move.js";

const PET_REST = { warm: "sleep", rest: "sit", home: "sleep", drink: "sit", shop: "sit", well: "sit", gate: "sit", square: "sit", door: "sit" };

export function attachAmbience(rt) {
  const chimneys = [];
  for (const b of rt.buildings || []) for (const c of b.smoke || []) chimneys.push(c);
  const smoke = buildSmoke(rt.townRoot, chimneys);
  const graph = rt.townGraph;

  const hens = [];
  let henSeed = 0x4e11;
  for (const yi of HEN_YARDS) {
    const cottage = COTTAGES[yi];
    for (let k = 0; k < 2; k++) {
      const h = createHen("hen-" + yi + "-" + k, cottage, henSeed += 131);
      const v = buildHen(henSeed);
      v.root.name = h.id;
      rt.townRoot.add(v.root);
      hens.push({ h, v, phase: k, blend: 0 });
    }
  }

  const pets = [];
  const petDefs = CATS.concat(DOGS);
  for (let i = 0; i < petDefs.length; i++) {
    const def = petDefs[i];
    const w = createPet(def, graph, 0x9e7 + i * 389);
    const v = def.kind === "cat" ? buildCat(0x3c + i, def.coat) : buildDog(0x5d + i, def.coat);
    v.root.name = def.id;
    rt.townRoot.add(v.root);
    pets.push({ def, w, v, yaw: w.yaw, phase: 0, blend: 0 });
  }

  function tickAmbience(dt, time) {
    if (rt.space === "dungeon") return;
    const bg = rt.scene.background && rt.scene.background.isColor ? rt.scene.background : null;
    smoke.tick(dt, bg);
    const hero = rt.player.position;
    const heroOutside = (rt.heroLevel || 0) === 0;
    for (const e of hens) {
      stepHen(e.h, dt, graph.colliders, heroOutside ? hero.x : null, heroOutside ? hero.z : null);
      e.blend += ((e.h.moving ? 1 : 0) - e.blend) * (1 - Math.exp(-10 * dt));
      if (e.h.moving) e.phase += dt * (e.h.flee ? 22 : 12);
      e.v.root.position.set(e.h.x, 0, e.h.z);
      e.v.root.rotation.y = e.h.yaw;
      poseAnimal(e.v, e.phase, e.blend, time + e.phase, null);
    }
    for (const p of pets) {
      const w = p.w;
      let blocked = false;
      if (w.mode === "walk" && w.path.length) {
        const n = graph.nodes[w.path[0]];
        const dx = hero.x - w.x;
        const dz = hero.z - w.z;
        const d = Math.hypot(dx, dz);
        blocked = d < 0.9 && d > 1e-4 && (dx * (n.x - w.x) + dz * (n.z - w.z)) > 0;
      }
      stepWalker(w, dt, graph, blocked);
      if (w.faceYaw != null) p.yaw = dampAngle(p.yaw, w.faceYaw, w.moving ? 9 : 3, dt);
      p.blend += ((w.moving ? 1 : 0) - p.blend) * (1 - Math.exp(-8 * dt));
      if (w.moving) p.phase += dt * (p.def.kind === "cat" ? 9 : 12);
      const floor = floorAt(w.x, w.z);
      p.v.root.position.set(w.x, floor == null ? 0 : floor, w.z);
      p.v.root.rotation.y = p.yaw;
      poseAnimal(p.v, p.phase, p.blend, time, w.moving ? null : PET_REST[w.activity] || "sit");
    }
  }

  rt.tickAmbience = tickAmbience;
  rt.smoke = smoke;
  rt.hens = hens;
  rt.pets = pets;
}
