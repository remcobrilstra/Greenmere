// Townsfolk in play: keepers working at their posts, wanderers walking the
// waypoint graph, giving way to the hero, and greeting them with barks.

import * as THREE from "three";
import { KEEPERS, WANDERERS, BARKS, BARKS_TIER, FOLK_RADIUS, buildTownGraph, createWalker, stepWalker, keeperPost } from "../sim/townfolk.js";
import { floorAt, buildingById, townTier } from "../sim/townplan.js";
import { buildVillager, poseVillager } from "../view/townfolk.js";
import { dampAngle } from "./move.js";

const WORK = { smith: "hammer", distiller: "stir", shopkeeper: "tally", innkeeper: "wipe", trainer: "drill" };
const ACTIVITY_POSE = { warm: "warm", rest: "rest", drink: "drink", browse: "chat", shop: "chat", well: "chat", square: "chat", train: "drill" };
const GREET_R = 3.5;
const FORGET_R = 5.5;
const BARK_COOLDOWN = 25;
const HEAD_Y = 2.25;

export function attachTownfolk(rt) {
  const graph = buildTownGraph();
  const folk = [];
  let barkTurn = 0;

  for (let i = 0; i < KEEPERS.length; i++) {
    const def = KEEPERS[i];
    const post = keeperPost(def);
    const v = buildVillager(def.look, 0x4b1d + i * 977);
    v.root.name = "keeper:" + def.id;
    rt.townRoot.add(v.root);
    const b = buildingById(def.building);
    folk.push({
      kind: "keeper", id: def.id, def, v,
      name: b.keeper.name, role: def.role, building: b,
      x: post.x, z: post.z, yaw: post.yaw, homeYaw: post.yaw,
      phase: 0, blend: 0, near: false, lastBark: -BARK_COOLDOWN, toldTier: 0
    });
  }
  for (let i = 0; i < WANDERERS.length; i++) {
    const def = WANDERERS[i];
    const w = createWalker(def, graph, 0x7a11 + i * 7919);
    const v = buildVillager(def.look, 0x9e37 + i * 613);
    v.root.name = "folk:" + def.id;
    rt.townRoot.add(v.root);
    folk.push({
      kind: "walker", id: def.id, def, v, w,
      name: def.name, role: "folk", building: null,
      x: w.x, z: w.z, yaw: w.yaw,
      phase: i, blend: 0, near: false, lastBark: -BARK_COOLDOWN, toldTier: 0, sit: 0
    });
  }

  const _head = new THREE.Vector3();

  function blockedAhead(f, hero) {
    const w = f.w;
    if (w.mode !== "walk" || !w.path.length) return false;
    const target = graph.nodes[w.path[0]];
    const mx = target.x - w.x;
    const mz = target.z - w.z;
    const ml = Math.hypot(mx, mz) || 1;
    function inFront(ox, oz, range) {
      const dx = ox - w.x;
      const dz = oz - w.z;
      const d = Math.hypot(dx, dz);
      return d < range && d > 1e-4 && (dx * mx + dz * mz) / (d * ml) > 0.35;
    }
    if (inFront(hero.x, hero.z, 1.15)) return true;
    for (let i = 0; i < folk.length; i++) {
      const o = folk[i];
      if (o === f) continue;
      // Lower ids yield to higher ones so two walkers never wait on each other.
      if (o.kind === "walker" && o.id < f.id) continue;
      if (inFront(o.x, o.z, 0.8)) return true;
    }
    return false;
  }

  function bark(f, time) {
    if (!rt.barks) return;
    const tier = townTier(rt.session ? rt.session.bestDepth : 0);
    let line;
    if (tier > f.toldTier) {
      // First word after the town grew: the keeper notices.
      line = (BARKS_TIER[f.role] || BARKS_TIER.folk)[tier];
      f.toldTier = tier;
    } else {
      const lines = BARKS[f.role] || BARKS.folk;
      line = lines[(barkTurn++ + f.id.length) % lines.length];
    }
    rt.barks.say(f.id, f.name, line, 3.6);
    f.lastBark = time;
  }

  let clock = 0;
  function tickTownfolk(dt, time) {
    if (rt.space === "dungeon") return;
    clock += dt;
    const hero = rt.player.position;
    const inside = rt.insideBuilding;
    const upstairs = (rt.heroLevel || 0) === 1;
    // Evenings fill the inn; at night most folk go home.
    const night = rt.nightFactor ? rt.nightFactor() : 0;
    const bias = night > 0.75 ? { home: 6, drink: 2, warm: 1.5 } : night > 0.3 ? { drink: 3, warm: 2, home: 2 } : null;
    for (let i = 0; i < folk.length; i++) {
      const f = folk[i];
      let moving = false;
      let work = null;
      let targetYaw = f.yaw;
      const dh = Math.hypot(hero.x - f.x, hero.z - f.z);
      let seatY = null;
      if (f.kind === "walker") {
        stepWalker(f.w, dt, graph, blockedAhead(f, hero), bias);
        moving = f.w.moving;
        // Ease onto a seat (stool, bench) and back off it when leaving.
        const seat = !moving ? f.w.seat : null;
        f.sit += ((seat ? 1 : 0) - f.sit) * (1 - Math.exp(-5 * dt));
        if (f.sit < 0.002) f.sit = 0;
        if (seat) f.lastSeat = seat;
        const s = f.lastSeat;
        f.x = s ? f.w.x + (s.x - f.w.x) * f.sit : f.w.x;
        f.z = s ? f.w.z + (s.z - f.w.z) * f.sit : f.w.z;
        if (s && f.sit > 0) seatY = s.h - 0.53 * (f.def.look.height || 1);
        if (f.w.faceYaw != null) targetYaw = seat ? seat.yaw : f.w.faceYaw;
        if (!moving) work = seat ? (seat.sitDrink ? "sitdrink" : "sit") : ACTIVITY_POSE[f.w.activity] || null;
        // Idle walkers turn to look at a hero who stops beside them.
        if (!moving && !seat && dh < 2.4) targetYaw = Math.atan2(-(hero.x - f.x), -(hero.z - f.z));
      } else {
        const sameRoom = inside === f.building;
        if (sameRoom && dh < 3.4) {
          targetYaw = Math.atan2(-(hero.x - f.x), -(hero.z - f.z));
          work = "chat";
        } else {
          targetYaw = f.homeYaw;
          work = WORK[f.role] || null;
        }
      }
      f.yaw = dampAngle(f.yaw, targetYaw, moving ? 10 : 5, dt);
      f.blend += ((moving ? 1 : 0) - f.blend) * (1 - Math.exp(-8 * dt));
      if (moving) f.phase += dt * 8.6 * (f.w ? f.w.speed / 1.45 : 1);
      const floor = floorAt(f.x, f.z);
      const baseY = floor == null ? 0 : floor;
      f.v.root.position.set(f.x, seatY == null ? baseY : baseY + (seatY - baseY) * f.sit, f.z);
      f.v.root.rotation.y = f.yaw;
      poseVillager(f.v, f.phase, f.blend, clock + i * 1.7, work);

      // Greet once per approach. Keepers only speak to a hero in their own room.
      const canGreet = !upstairs && (f.kind === "keeper" ? inside === f.building : !inside);
      if (dh < GREET_R && !f.near && canGreet) {
        f.near = true;
        if (clock - f.lastBark > BARK_COOLDOWN) bark(f, clock);
      } else if (dh > FORGET_R) {
        f.near = false;
      }
      if (rt.barks && rt.barks.has(f.id)) {
        _head.set(f.x, (floor == null ? 0 : floor) + HEAD_Y * (f.def.look.height || 1), f.z).project(rt.camera);
        const onScreen = _head.z < 1 && _head.x > -1.1 && _head.x < 1.1 && _head.y > -1.1 && _head.y < 1.1;
        rt.barks.place(f.id, (_head.x + 1) / 2 * window.innerWidth, (1 - _head.y) / 2 * window.innerHeight - 8, onScreen);
      }
    }
  }

  // Hero vs townsfolk: circles on XZ, used by resolveColliders in town.
  function resolveTownActors(x, z, radius) {
    if (!rt.townfolkSolid || rt.space === "dungeon") return null;
    let moved = false;
    for (let i = 0; i < folk.length; i++) {
      const f = folk[i];
      const dx = x - f.x;
      const dz = z - f.z;
      const min = radius + FOLK_RADIUS;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min && d2 > 1e-8) {
        const d = Math.sqrt(d2);
        const push = (min - d) / d;
        x += dx * push;
        z += dz * push;
        moved = true;
      }
    }
    return moved ? { x, z } : null;
  }

  rt.townfolk = folk;
  rt.townGraph = graph;
  rt.townfolkSolid = true;
  rt.tickTownfolk = tickTownfolk;
  rt.resolveTownActors = resolveTownActors;
  rt.keeperAt = function (id) {
    return folk.find((f) => f.id === id) || null;
  };
}
