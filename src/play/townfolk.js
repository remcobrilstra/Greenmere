// Townsfolk in play: keepers working at their posts, wanderers walking the
// waypoint graph, giving way to the hero, and greeting them with barks.

import * as THREE from "three";
import {
  KEEPERS, WANDERERS, VENDORS, SHIFTS, BARKS, BARKS_TIER, FOLK_RADIUS,
  buildTownGraph, createWalker, stepWalker, shortestPath, keeperPost, vendorPost, staffRoute, staticTownColliders, shiftPart
} from "../sim/townfolk.js";
import { floorAt, buildingById, townTier } from "../sim/townplan.js";
import { buildVillager, poseVillager } from "../view/townfolk.js";
import { dampAngle } from "./move.js";

const WORK = { smith: "hammer", distiller: "stir", shopkeeper: "tally", innkeeper: "wipe", trainer: "drill", banker: "tally", vendor: "chat" };
const STAFF_SPEED = 1.3;
const ACTIVITY_POSE = { warm: "warm", rest: "rest", drink: "drink", browse: "chat", shop: "chat", well: "chat", square: "chat", train: "drill" };
const GREET_R = 3.5;
const FORGET_R = 5.5;
const BARK_COOLDOWN = 25;
const HEAD_Y = 2.25;

export function attachTownfolk(rt) {
  const graph = buildTownGraph();
  const folk = [];
  let barkTurn = 0;
  const cols = staticTownColliders();
  function nodeNear(p, tag) {
    let best = null;
    let bd = Infinity;
    for (const n of graph.nodes) {
      if (tag && n.tag !== tag) continue;
      const d = Math.hypot(n.x - p.x, n.z - p.z);
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }
  function homeNode(cottageId) {
    return graph.nodes.find((n) => n.tag === "home" && n.inside === cottageId) || null;
  }

  for (let i = 0; i < KEEPERS.length; i++) {
    const def = KEEPERS[i];
    const post = keeperPost(def);
    const v = buildVillager(def.look, 0x4b1d + i * 977);
    v.root.name = "keeper:" + def.id;
    rt.townRoot.add(v.root);
    const b = buildingById(def.building);
    const route = staffRoute(b, cols) || [post, post];
    const exit = nodeNear(route[0], "threshold");
    folk.push({
      kind: "keeper", id: def.id, def, v,
      name: b.keeper.name, role: def.role, building: b,
      x: post.x, z: post.z, yaw: post.yaw, homeYaw: post.yaw,
      post, route, exitNode: exit ? exit.i : null, shift: SHIFTS[def.id] || null, mode: "post", routeI: route.length - 1,
      w: null, sit: 0, seed: 0x51a + i * 131,
      phase: 0, blend: 0, near: false, lastBark: -BARK_COOLDOWN, toldTier: 0
    });
  }
  for (let i = 0; i < VENDORS.length; i++) {
    const def = VENDORS[i];
    const vp = vendorPost(def);
    const v = buildVillager(def.look, 0x2c3 + i * 449);
    v.root.name = "vendor:" + def.id;
    rt.townRoot.add(v.root);
    const exit = nodeNear(vp.side, "stallside");
    folk.push({
      kind: "keeper", vendor: true, id: def.id, def, v,
      name: def.name, role: "vendor", lines: def.lines, building: null,
      x: vp.x, z: vp.z, yaw: vp.yaw, homeYaw: vp.yaw,
      post: vp, route: vp.route, exitNode: exit ? exit.i : null,
      shift: { evening: def.evening, night: def.home }, mode: "post", routeI: vp.route.length - 1,
      w: null, sit: 0, seed: 0x7e1 + i * 211,
      phase: 0, blend: 0, near: false, lastBark: -BARK_COOLDOWN, toldTier: 0
    });
  }
  for (let i = 0; i < WANDERERS.length; i++) {
    const def = WANDERERS[i];
    const w = createWalker(def, graph, 0x7a11 + i * 7919);
    if (def.child) w.speed *= 1.35;
    const v = buildVillager(def.look, 0x9e37 + i * 613);
    v.root.name = "folk:" + def.id;
    rt.townRoot.add(v.root);
    folk.push({
      kind: "walker", id: def.id, def, v, w,
      name: def.name, role: def.child ? "child" : "folk", building: null,
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
    if (f.lines) {
      line = f.lines[(barkTurn++ + f.id.length) % f.lines.length];
    } else if (tier > f.toldTier) {
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

  // One walking step on the graph, with seats; shared by wanderers and off-duty staff.
  function walkStep(f, dt, hero, bias) {
    stepWalker(f.w, dt, graph, blockedAhead(f, hero), bias);
    const moving = f.w.moving;
    const seat = !moving ? f.w.seat : null;
    f.sit += ((seat ? 1 : 0) - f.sit) * (1 - Math.exp(-5 * dt));
    if (f.sit < 0.002) f.sit = 0;
    if (seat) f.lastSeat = seat;
    const s = f.lastSeat;
    f.x = s ? f.w.x + (s.x - f.w.x) * f.sit : f.w.x;
    f.z = s ? f.w.z + (s.z - f.w.z) * f.sit : f.w.z;
    const out = { moving, work: null, targetYaw: f.yaw, seatY: null };
    if (s && f.sit > 0) out.seatY = s.h - 0.53 * (f.def.look.height || 1);
    if (f.w.faceYaw != null) out.targetYaw = seat ? seat.yaw : f.w.faceYaw;
    if (!moving) out.work = seat ? (seat.sitDrink ? "sitdrink" : "sit") : ACTIVITY_POSE[f.w.activity] || null;
    const dh = Math.hypot(hero.x - f.x, hero.z - f.z);
    if (!moving && !seat && dh < 2.4) out.targetYaw = Math.atan2(-(hero.x - f.x), -(hero.z - f.z));
    return out;
  }

  // Straight-line walk toward a point; true on arrival.
  function walkTo(f, p, dt) {
    const dx = p.x - f.x;
    const dz = p.z - f.z;
    const d = Math.hypot(dx, dz);
    const step = STAFF_SPEED * dt;
    if (d <= step) {
      f.x = p.x;
      f.z = p.z;
      return true;
    }
    f.x += (dx / d) * step;
    f.z += (dz / d) * step;
    f.walkYaw = Math.atan2(-dx, -dz);
    return false;
  }

  // Keepers and vendors: on duty at the post, otherwise out in town.
  function onDuty(f, part) {
    if (!f.shift || f.exitNode == null) return true;
    if (f.building && rt.insideBuilding === f.building) return true;
    if (part === "day") return true;
    return part === "night" && f.shift.night === "post";
  }
  function staffStep(f, dt, hero, part, inside) {
    const duty = onDuty(f, part);
    const dh = Math.hypot(hero.x - f.x, hero.z - f.z);
    if (f.mode === "post") {
      if (!duty) {
        f.mode = "out";
        f.routeI = f.route.length - 1;
      } else {
        const res = { moving: false, work: WORK[f.role] || null, targetYaw: f.homeYaw, seatY: null };
        const close = f.building ? inside === f.building && dh < 3.4 : dh < 3.0;
        if (close) {
          res.targetYaw = Math.atan2(-(hero.x - f.x), -(hero.z - f.z));
          res.work = "chat";
        }
        return res;
      }
    }
    if (f.mode === "out" || f.mode === "in") {
      if (f.mode === "out" && duty) f.mode = "in";
      else if (f.mode === "in" && !duty) f.mode = "out";
      const next = f.mode === "out" ? Math.max(0, f.routeI - 1) : Math.min(f.route.length - 1, f.routeI + 1);
      const target = f.route[f.mode === "out" ? (f.routeI > 0 ? f.routeI - 1 : 0) : next];
      if (walkTo(f, target, dt)) {
        f.routeI = f.mode === "out" ? Math.max(0, f.routeI - 1) : next;
        if (f.mode === "in" && f.routeI === f.route.length - 1) {
          f.mode = "post";
          f.x = f.post.x;
          f.z = f.post.z;
        } else if (f.mode === "out" && f.routeI === 0) {
          // Through the door: become a walker on the town graph.
          const n = graph.nodes[f.exitNode];
          if (!f.w) f.w = createWalker({ id: f.id, home: 0, likes: {} }, graph, f.seed);
          f.w.node = n.i;
          f.w.x = n.x;
          f.w.z = n.z;
          f.w.path = [];
          f.w.mode = "linger";
          f.w.t = 0.4;
          f.w.seat = null;
          f.sit = 0;
          f.lastSeat = null;
          f.mode = "away";
        }
      }
      return { moving: true, work: null, targetYaw: f.walkYaw != null ? f.walkYaw : f.yaw, seatY: null };
    }
    // Out in town (or heading back to the door).
    const w = f.w;
    if (duty && f.mode === "away") {
      f.mode = "return";
      const path = shortestPath(graph, w.node, f.exitNode);
      w.path = path && path.length ? path : [f.exitNode];
      w.mode = "walk";
      w.seat = null;
    } else if (!duty && f.mode === "return") {
      f.mode = "away";
      w.mode = "linger";
      w.t = 0;
    }
    if (f.mode === "return") {
      const res = walkStep(f, dt, hero, null);
      if (w.mode === "linger" && w.node === f.exitNode) {
        f.sit = 0;
        f.lastSeat = null;
        f.x = w.x;
        f.z = w.z;
        f.mode = "in";
        f.routeI = 0;
      }
      return res;
    }
    // Away: evenings follow their tastes; at night they walk home and stay.
    w.def.likes = f.shift.evening || {};
    if (part === "night") {
      const home = homeNode(f.shift.night);
      if (home && w.node !== home.i && w.mode === "linger") {
        const path = shortestPath(graph, w.node, home.i);
        if (path && path.length) {
          w.path = path;
          w.mode = "walk";
          w.seat = null;
        }
      } else if (home && w.node === home.i && w.mode === "linger") {
        w.t = Math.max(w.t, 5);
      }
    }
    return walkStep(f, dt, hero, null);
  }

  function tickTownfolk(dt, time) {
    if (rt.space === "dungeon") return;
    clock += dt;
    const hero = rt.player.position;
    const inside = rt.insideBuilding;
    const upstairs = (rt.heroLevel || 0) === 1;
    const part = shiftPart(rt.townClock ? rt.townClock.phase : 0.5);
    // Evenings fill the inn; at night most folk go home.
    const night = rt.nightFactor ? rt.nightFactor() : 0;
    const bias = night > 0.75 ? { home: 6, drink: 2, warm: 1.5 } : night > 0.3 ? { drink: 3, warm: 2, home: 2 } : null;
    for (let i = 0; i < folk.length; i++) {
      const f = folk[i];
      const step = f.kind === "walker" ? walkStep(f, dt, hero, bias) : staffStep(f, dt, hero, part, inside);
      const moving = step.moving;
      const seatY = step.seatY;
      f.yaw = dampAngle(f.yaw, step.targetYaw, moving ? 10 : 5, dt);
      f.blend += ((moving ? 1 : 0) - f.blend) * (1 - Math.exp(-8 * dt));
      if (moving) f.phase += dt * 8.6 * (f.w ? f.w.speed / 1.45 : 1);
      const floor = floorAt(f.x, f.z);
      const baseY = floor == null ? 0 : floor;
      f.v.root.position.set(f.x, seatY == null ? baseY : baseY + (seatY - baseY) * f.sit, f.z);
      f.v.root.rotation.y = f.yaw;
      poseVillager(f.v, f.phase, f.blend, clock + i * 1.7, step.work);

      // Greet once per approach. A keeper at the counter only speaks to a hero in the room.
      const dh = Math.hypot(hero.x - f.x, hero.z - f.z);
      const atCounter = f.kind === "keeper" && f.mode === "post" && f.building;
      const canGreet = !upstairs && (atCounter ? inside === f.building : !inside || inside === f.building);
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

  // F beside a villager (not at a counter): they say something to the hero.
  function nearestFolk(x, z, range) {
    let best = null;
    let bestD = range;
    for (const f of folk) {
      // Wanderers, vendors, and keepers who are out of their shops; a keeper at
      // the counter is reached through the counter's own panel instead.
      if (f.kind !== "walker" && !f.vendor && f.mode === "post") continue;
      const d = Math.hypot(f.x - x, f.z - z);
      if (d < bestD) { best = f; bestD = d; }
    }
    return best;
  }
  function talkNearestFolk(x, z) {
    const f = nearestFolk(x, z, 2.2);
    if (!f || !rt.barks) return false;
    bark(f, clock);
    f.near = true;
    return true;
  }

  rt.nearestFolk = nearestFolk;
  rt.talkNearestFolk = talkNearestFolk;
  rt.townfolk = folk;
  rt.townGraph = graph;
  rt.townfolkSolid = true;
  rt.tickTownfolk = tickTownfolk;
  rt.resolveTownActors = resolveTownActors;
  rt.keeperAt = function (id) {
    return folk.find((f) => f.id === id) || null;
  };
}
