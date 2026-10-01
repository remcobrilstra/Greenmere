// Townsfolk: who lives in Greenmere, where they can walk, and how they decide
// where to go next. Pure data and pure steps; meshes live in view/townfolk.js.

import { mulberry32 } from "./rng.js";
import {
  BUILDINGS, COTTAGES, PROPS, HEARTH, GATE, TOWN_ARRIVAL, FLOOR_Y, YARD_D,
  buildingColliders, propColliders, localToWorld, doorPoint, worldYaw, buildingById
} from "./townplan.js";

export const FOLK_RADIUS = 0.35;
const EDGE_CLEAR = 0.5;
const EDGE_MAX = 17;

// Looks: palette indices are resolved by the view. hat: none | hood | cap | brim | kerchief.
export const KEEPERS = [
  { id: "maud", building: "store", role: "shopkeeper", look: { tunic: 0x7a4a8c, trim: 0xe7d7b4, skin: 0xe0a878, hair: 0x8a5a3a, hat: "kerchief", apron: 0xe7d7b4, height: 0.94 } },
  { id: "orrin", building: "smith", role: "smith", look: { tunic: 0x5a3a24, trim: 0x2c3036, skin: 0xc68a5c, hair: 0x2a1c14, hat: "none", apron: 0x3a2416, beard: true, height: 1.04 } },
  { id: "wen", building: "still", role: "distiller", look: { tunic: 0x3e6e4a, trim: 0xd4a03a, skin: 0xe8b88a, hair: 0xd8d0c0, hat: "hood", height: 0.92 } },
  { id: "tamsin", building: "trainer", role: "trainer", look: { tunic: 0x2f363e, trim: 0xd4a03a, skin: 0xb07a50, hair: 0xe0e0e0, hat: "none", beard: true, height: 0.98 } },
  { id: "pell", building: "inn", role: "innkeeper", look: { tunic: 0xb64034, trim: 0xe7d7b4, skin: 0xe0a878, hair: 0x5a3a24, hat: "cap", apron: 0xf4e7c8, height: 1.0 } }
];

export const WANDERERS = [
  { id: "ada", name: "Ada", home: 0, likes: { browse: 3, well: 2, rest: 1, drink: 1 }, look: { tunic: 0x2d62c8, trim: 0xe7d7b4, skin: 0xe0a878, hair: 0xb06a2a, hat: "kerchief", height: 0.93 } },
  { id: "bram", name: "Bram", home: 1, likes: { drink: 3, warm: 2, read: 1 }, look: { tunic: 0x6b4428, trim: 0x3a2416, skin: 0xc68a5c, hair: 0x2a1c14, hat: "brim", beard: true, height: 1.03 } },
  { id: "cora", name: "Cora", home: 2, likes: { browse: 2, rest: 2, shop: 2 }, look: { tunic: 0x3e9a36, trim: 0xd4a03a, skin: 0xf0c49a, hair: 0x1c1410, hat: "none", height: 0.95 } },
  { id: "dunstan", name: "Dunstan", home: 3, likes: { train: 3, warm: 1, drink: 1 }, look: { tunic: 0x4c545e, trim: 0xb64034, skin: 0xb07a50, hair: 0x5a3a24, hat: "cap", height: 1.02 } },
  { id: "elsie", name: "Elsie", home: 4, likes: { well: 3, browse: 1, read: 1 }, look: { tunic: 0xd4a03a, trim: 0x6b4428, skin: 0xe8b88a, hair: 0x8a5a3a, hat: "hood", height: 0.88 } },
  { id: "finn", name: "Finn", home: 5, likes: { gate: 2, road: 2, read: 2 }, look: { tunic: 0x1c3f8c, trim: 0xc5d0dc, skin: 0xe0a878, hair: 0xd8b968, hat: "none", height: 0.97 } },
  { id: "greta", name: "Greta", home: 0, likes: { shop: 3, browse: 2, rest: 1 }, look: { tunic: 0x8e3a2e, trim: 0xf4e7c8, skin: 0xc68a5c, hair: 0xd8d0c0, hat: "kerchief", apron: 0xe7d7b4, height: 0.9 } },
  { id: "hob", name: "Hob", home: 1, likes: { drink: 2, warm: 3 }, look: { tunic: 0x5e6771, trim: 0x3a2416, skin: 0xf0c49a, hair: 0x6b4428, hat: "brim", height: 1.0 } },
  { id: "isla", name: "Isla", home: 3, likes: { rest: 2, well: 2, browse: 2 }, look: { tunic: 0x7a4a8c, trim: 0xd4a03a, skin: 0xb07a50, hair: 0x1c1410, hat: "none", height: 0.92 } },
  { id: "jory", name: "Jory", home: 5, likes: { train: 2, gate: 1, road: 1, drink: 1 }, look: { tunic: 0x3e4650, trim: 0x8d5b34, skin: 0xe0a878, hair: 0xb06a2a, hat: "cap", beard: true, height: 1.04 } }
];

export const BARKS = {
  shopkeeper: ["Rope, oil, draughts. Mind the scales.", "Come back with a full pack, Warden.", "Bank's in the back. Safe as stone."],
  smith: ["Mind the sparks.", "Bring me slag and I'll make it sing.", "That blade's seen the Underwood. I can tell."],
  distiller: ["Heartwood for the red, rootfiber for the blue.", "Breathe slow. The still is temperamental.", "A draught in hand beats a prayer underground."],
  trainer: ["Stand in the circle when you're ready.", "Strength is a habit, Warden.", "The stones remember every oath."],
  innkeeper: ["Fire's banked, ale's cold.", "Sit a while. The wood isn't going anywhere.", "Heard the deep floors are getting louder."],
  folk: ["Morning, Warden.", "Back from the gate already?", "Fine day for it.", "The well water tastes of moss again.", "Is it true there's no bottom down there?", "Mind the cart.", "Smells like the smithy's busy.", "You look like you could use a draught."]
};

// Said once per new depth tier, the first time the hero comes by afterwards.
export const BARKS_TIER = {
  shopkeeper: ["", "Word of your delves brought new suppliers. Have a look.", "Coin's flowing, Warden. Your coin, mostly.", "They're calling this the Warden's town now. Good for trade."],
  smith: ["", "Bought a second anvil on the strength of your slag.", "Built a stand for the good mail. Nothing in Greenmere fit it before.", "Hung a shard from floor ten on the wall. Still warm."],
  distiller: ["", "Drying racks are full. The deep roots are potent.", "A new alembic. Finer draughts, steadier hands.", "The crystal you brought hums at night. I like it."],
  trainer: ["", "Hung the old banners again. The Circle remembers its wardens.", "Two more dummies. The young ones want to learn your stance.", "There's a trophy on the wall with your name. Earn the next one."],
  innkeeper: ["", "Bunting's up. Folk drink more when there's a hero in town.", "Full house most nights now, thanks to you.", "That's a trophy over my fire, Warden. Don't let it be the last."],
  folk: ["", "The square looks bright, doesn't it?", "Market's busier since you went deep.", "They've raised a statue. Looks a bit like you."]
};

// ---------- colliders the walkers must respect ----------

function staticColliders() {
  const list = [];
  for (const b of BUILDINGS.concat(COTTAGES)) for (const c of buildingColliders(b)) if (!c.level) list.push(c);
  for (const p of PROPS) for (const c of propColliders(p)) list.push(c);
  list.push({ kind: "circle", x: HEARTH.x, z: HEARTH.z, r: 2.75 });
  list.push({ kind: "circle", x: GATE.x - 2.08, z: GATE.z, r: 0.8 });
  list.push({ kind: "circle", x: GATE.x + 2.08, z: GATE.z, r: 0.8 });
  return list;
}

function pointClearance(c, x, z) {
  if (c.kind !== "box") return Math.hypot(x - c.x, z - c.z) - c.r;
  const co = Math.cos(c.yaw);
  const si = Math.sin(c.yaw);
  const dx = x - c.x;
  const dz = z - c.z;
  const lx = dx * co - dz * si;
  const lz = dx * si + dz * co;
  const ex = Math.max(0, Math.abs(lx) - c.hx);
  const ez = Math.max(0, Math.abs(lz) - c.hz);
  if (ex === 0 && ez === 0) return -Math.min(c.hx - Math.abs(lx), c.hz - Math.abs(lz));
  return Math.hypot(ex, ez);
}

export function clearanceAt(colliders, x, z) {
  let best = Infinity;
  for (let i = 0; i < colliders.length; i++) {
    const d = pointClearance(colliders[i], x, z);
    if (d < best) best = d;
  }
  return best;
}

export function segmentClear(colliders, ax, az, bx, bz, clear) {
  const minX = Math.min(ax, bx) - clear;
  const maxX = Math.max(ax, bx) + clear;
  const minZ = Math.min(az, bz) - clear;
  const maxZ = Math.max(az, bz) + clear;
  const near = [];
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    const r = c.kind === "box" ? Math.hypot(c.hx, c.hz) : c.r;
    if (c.x + r < minX || c.x - r > maxX || c.z + r < minZ || c.z - r > maxZ) continue;
    near.push(c);
  }
  if (!near.length) return true;
  const len = Math.hypot(bx - ax, bz - az);
  const steps = Math.max(1, Math.ceil(len / 0.15));
  for (let k = 0; k <= steps; k++) {
    const t = k / steps;
    if (clearanceAt(near, ax + (bx - ax) * t, az + (bz - az) * t) < clear) return false;
  }
  return true;
}

// ---------- waypoint graph ----------

function node(list, x, z, tag, face, inside, seat) {
  list.push({ i: list.length, x, z, tag, face: face == null ? null : face, inside: inside || null, seat: seat || null });
}

function inBuilding(list, id, lx, lz, tag, faceX, faceZ) {
  const b = buildingById(id);
  const p = localToWorld(b, lx, lz);
  node(list, p.x, p.z, tag, faceX == null ? null : worldYaw(b, faceX, faceZ), id);
}

function buildNodes() {
  const n = [];
  // Square: a loose ring plus spots by the well, the fire, the benches, the stalls.
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2 + 0.2;
    node(n, Math.cos(a) * 7.6, Math.sin(a) * 7.6, "square");
  }
  node(n, -3.4, 5.6, "well", Math.atan2(-(-5.2 + 3.4), -(3.6 - 5.6)));
  node(n, -6.6, 2.3, "well", Math.atan2(-(-5.2 + 6.6), -(3.6 - 2.3)));
  node(n, 0.6, -0.9, "warm", Math.atan2(-(HEARTH.x - 0.6), -(HEARTH.z + 0.9)));
  node(n, 4.3, 1.0, "warm", Math.atan2(-(HEARTH.x - 4.3), -(HEARTH.z - 1.0)));
  // Benches: walk up in front, then sit (the play layer eases onto the seat).
  node(n, -3.4, 9.2, "rest", Math.PI, null, { x: -3.4, z: 8.25, yaw: Math.PI, h: 0.48 });
  node(n, 3.4, 9.2, "rest", Math.PI, null, { x: 3.4, z: 8.25, yaw: Math.PI, h: 0.48 });
  node(n, -2.0, -11.5, "read", Math.PI / 2);
  for (const p of PROPS) {
    if (p.type !== "stall") continue;
    const fx = Math.sin(p.yaw);
    const fz = Math.cos(p.yaw);
    node(n, p.x + fx * 1.65, p.z + fz * 1.65, "browse", Math.atan2(fx, fz));
  }
  // Gate road.
  node(n, 0, -15, "road");
  node(n, 0, -21, "road");
  node(n, TOWN_ARRIVAL.x + 1.2, TOWN_ARRIVAL.z - 2.5, "gate", 0);
  // Every service door, outside and in.
  for (const b of BUILDINGS) {
    const d = b.doors[0];
    const o = doorPoint(b, d, 1.4);
    const po = localToWorld(b, o.x, o.z);
    node(n, po.x, po.z, "door");
    const i = doorPoint(b, d, -1.3);
    inBuilding(n, b.id, i.x, i.z, "threshold");
  }
  // Places to be inside.
  inBuilding(n, "store", 2.0, 1.7, "shop", 1, 0);
  inBuilding(n, "store", -3.0, 2.0, "shop", -1, 0);
  inBuilding(n, "inn", 1.6, -0.45, "drink", 0, -1);
  // Inn stools: one seat per stool, reached from a spot just behind it.
  const inn = buildingById("inn");
  for (const f of inn.furniture) {
    if (f.type !== "tavernTable") continue;
    const r = Math.min(f.w, f.d) / 2;
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + 0.5;
      const ap = localToWorld(inn, f.x + Math.cos(a) * (r + 0.8), f.z + Math.sin(a) * (r + 0.8));
      const sp = localToWorld(inn, f.x + Math.cos(a) * r * 1.1, f.z + Math.sin(a) * r * 1.1);
      const yaw = worldYaw(inn, -Math.cos(a), -Math.sin(a));
      node(n, ap.x, ap.z, "drink", yaw, "inn", { x: sp.x, z: sp.z, yaw, h: 0.45 + FLOOR_Y, sitDrink: true });
    }
  }
  inBuilding(n, "trainer", -3.0, -1.2, "train", -1, -1);
  inBuilding(n, "trainer", 3.0, -1.2, "train", 1, -1);
  inBuilding(n, "still", 1.6, 2.4, "shop", 0, -1);
  // Homes: inside by the hearth, the doorstep in the yard, and the yard gate.
  for (const c of COTTAGES) {
    const sgn = c.doors[0].at > 0 ? 1 : -1;
    inBuilding(n, c.id, sgn * 0.4, -0.5, "home", -sgn, -1);
    const o = doorPoint(c, c.doors[0], 1.1);
    const p = localToWorld(c, o.x, o.z);
    node(n, p.x, p.z, "door");
    const g = localToWorld(c, c.yard.gate.x, c.yard.gate.z);
    node(n, g.x, g.z, "path");
  }
  // Connectors between the square, the homes, and the service doors.
  const links = [[-12, 9], [12, 9], [-14, 13], [14, 13], [-22, 2], [22, 2], [-8, 14], [8, 14], [-21, -11], [21, -10], [-7, -14], [7, -14], [-20, 18], [20, 18]];
  for (const [x, z] of links) node(n, x, z, "path");
  return n;
}

export function buildTownGraph() {
  const colliders = staticColliders();
  const nodes = buildNodes().filter((nd) => clearanceAt(colliders, nd.x, nd.z) >= EDGE_CLEAR);
  for (let i = 0; i < nodes.length; i++) nodes[i].i = i;
  const edges = nodes.map(() => []);
  for (let a = 0; a < nodes.length; a++) {
    for (let b = a + 1; b < nodes.length; b++) {
      const na = nodes[a];
      const nb = nodes[b];
      const d = Math.hypot(na.x - nb.x, na.z - nb.z);
      if (d > EDGE_MAX) continue;
      // Indoor nodes only join nodes of the same building (or its door step).
      if ((na.inside || nb.inside) && na.inside !== nb.inside && na.tag !== "door" && nb.tag !== "door") continue;
      if (!segmentClear(colliders, na.x, na.z, nb.x, nb.z, EDGE_CLEAR)) continue;
      edges[a].push({ to: b, d });
      edges[b].push({ to: a, d });
    }
  }
  // Keep the largest connected piece so nobody picks a destination they cannot reach.
  const comp = new Int32Array(nodes.length).fill(-1);
  let best = -1;
  let bestSize = 0;
  for (let i = 0, id = 0; i < nodes.length; i++) {
    if (comp[i] >= 0) continue;
    let size = 0;
    const stack = [i];
    comp[i] = id;
    while (stack.length) {
      const u = stack.pop();
      size++;
      for (const e of edges[u]) if (comp[e.to] < 0) { comp[e.to] = id; stack.push(e.to); }
    }
    if (size > bestSize) { bestSize = size; best = id; }
    id++;
  }
  const keep = [];
  const remap = new Int32Array(nodes.length).fill(-1);
  for (let i = 0; i < nodes.length; i++) if (comp[i] === best) { remap[i] = keep.length; keep.push(nodes[i]); }
  const keptEdges = keep.map((nd) => edges[nd.i].filter((e) => remap[e.to] >= 0).map((e) => ({ to: remap[e.to], d: e.d })));
  keep.forEach((nd, i) => { nd.i = i; });
  return { nodes: keep, edges: keptEdges, colliders };
}

export function shortestPath(graph, from, to) {
  const n = graph.nodes.length;
  const dist = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const done = new Uint8Array(n);
  dist[from] = 0;
  for (;;) {
    let u = -1;
    let best = Infinity;
    for (let i = 0; i < n; i++) if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
    if (u < 0 || u === to) break;
    done[u] = 1;
    for (const e of graph.edges[u]) {
      const nd = dist[u] + e.d;
      if (nd < dist[e.to]) { dist[e.to] = nd; prev[e.to] = u; }
    }
  }
  if (from !== to && prev[to] < 0) return null;
  const path = [];
  for (let v = to; v !== from; v = prev[v]) path.push(v);
  path.reverse();
  return path;
}

export function nodesTagged(graph, tag) {
  return graph.nodes.filter((nd) => nd.tag === tag);
}

// ---------- walkers ----------

const LINGER = { browse: [5, 11], well: [4, 9], warm: [6, 14], rest: [8, 16], read: [4, 8], drink: [8, 18], shop: [5, 10], train: [6, 12], home: [6, 14], gate: [3, 6], road: [1, 3], square: [1, 4] };

export function createWalker(def, graph, seed) {
  const rng = mulberry32(seed >>> 0);
  const homes = nodesTagged(graph, "home");
  const home = homes[def.home % homes.length];
  const start = graph.nodes[Math.floor(rng() * graph.nodes.length)];
  const startNode = start.inside ? home : start;
  return {
    id: def.id,
    def,
    rng,
    node: startNode.i,
    x: startNode.x,
    z: startNode.z,
    yaw: startNode.face == null ? rng() * Math.PI * 2 : startNode.face,
    mode: "linger",
    t: 1 + rng() * 6,
    path: [],
    activity: startNode.tag,
    speed: 1.25 + rng() * 0.45,
    moving: false,
    blockedT: 0
  };
}

function pickDestination(w, graph, bias) {
  const likes = w.def.likes || {};
  const weights = Object.assign({ square: 1, home: 1, browse: 1 }, likes);
  if (bias) for (const k in bias) weights[k] = (weights[k] || 0) * bias[k] + (bias[k] > 1 ? bias[k] - 1 : 0);
  const options = [];
  let total = 0;
  for (const nd of graph.nodes) {
    if (nd.i === w.node) continue;
    const wt = weights[nd.tag] || 0;
    if (!wt) continue;
    options.push([nd, wt]);
    total += wt;
  }
  let roll = w.rng() * total;
  for (const [nd, wt] of options) {
    roll -= wt;
    if (roll <= 0) return nd;
  }
  return options.length ? options[options.length - 1][0] : graph.nodes[w.node];
}

// Advance one walker by dt. `blocked` (from the play layer) holds them in place.
// `bias` scales destination weights by tag (night sends people home or to the inn).
export function stepWalker(w, dt, graph, blocked, bias) {
  w.moving = false;
  if (w.mode === "linger") {
    w.t -= dt;
    if (w.t > 0) return w;
    const dest = pickDestination(w, graph, bias);
    const path = shortestPath(graph, w.node, dest.i);
    if (!path || !path.length) {
      w.t = 2;
      return w;
    }
    w.path = path;
    w.mode = "walk";
    w.activity = "walk";
    w.seat = null;
  }
  if (blocked) {
    w.blockedT += dt;
    // Give way, but never forever: after a moment, walk on.
    if (w.blockedT < 1.6) return w;
  } else {
    w.blockedT = 0;
  }
  const target = graph.nodes[w.path[0]];
  const dx = target.x - w.x;
  const dz = target.z - w.z;
  const d = Math.hypot(dx, dz);
  const stepLen = w.speed * dt;
  if (d <= stepLen || d < 1e-6) {
    w.x = target.x;
    w.z = target.z;
    w.node = target.i;
    w.path.shift();
    if (!w.path.length) {
      w.mode = "linger";
      const span = LINGER[target.tag] || [2, 5];
      w.t = span[0] + w.rng() * (span[1] - span[0]);
      w.activity = target.tag;
      w.faceYaw = target.face;
      w.seat = target.seat || null;
    }
    return w;
  }
  w.x += (dx / d) * stepLen;
  w.z += (dz / d) * stepLen;
  w.moving = true;
  w.faceYaw = Math.atan2(-dx, -dz);
  return w;
}

export function keeperPost(def) {
  const b = buildingById(def.building);
  const p = localToWorld(b, b.keeper.x, b.keeper.z);
  return { x: p.x, z: p.z, yaw: worldYaw(b, 0, 1), building: b };
}

// ---------- animals ----------

export const CATS = [
  { id: "cat-moss", kind: "cat", home: 0, coat: 0x6e7377, likes: { warm: 4, rest: 3, home: 2, drink: 2, well: 1 } },
  { id: "cat-ember", kind: "cat", home: 3, coat: 0xc97a3a, likes: { warm: 3, home: 3, shop: 2, rest: 1 } }
];
export const DOGS = [
  { id: "dog-burr", kind: "dog", home: 1, coat: 0x8d5b34, likes: { gate: 3, road: 3, square: 3, warm: 2, door: 1 } }
];
export const HEN_YARDS = [0, 2, 3, 5];
const HEN_RANGE = 1.9;

export function yardCenter(c) {
  return localToWorld(c, 0, c.d / 2 + YARD_D / 2);
}

export function createHen(id, cottage, seed) {
  const rng = mulberry32(seed >>> 0);
  const home = yardCenter(cottage);
  const a = rng() * Math.PI * 2;
  const r = rng() * 1.2;
  return {
    id, rng, home,
    x: home.x + Math.cos(a) * r,
    z: home.z + Math.sin(a) * r,
    yaw: rng() * Math.PI * 2,
    tx: 0, tz: 0,
    mode: "peck",
    t: rng() * 2,
    moving: false,
    flee: false
  };
}

function pickHenTarget(h, colliders, awayX, awayZ) {
  for (let tries = 0; tries < 8; tries++) {
    let a = h.rng() * Math.PI * 2;
    if (awayX != null) a = Math.atan2(h.z - awayZ, h.x - awayX) + (h.rng() - 0.5) * 1.2;
    const dist = 0.6 + h.rng() * 1.4;
    let tx = h.x + Math.cos(a) * dist;
    let tz = h.z + Math.sin(a) * dist;
    const dx = tx - h.home.x;
    const dz = tz - h.home.z;
    const d = Math.hypot(dx, dz);
    if (d > HEN_RANGE) {
      tx = h.home.x + (dx / d) * HEN_RANGE;
      tz = h.home.z + (dz / d) * HEN_RANGE;
    }
    if (segmentClear(colliders, h.x, h.z, tx, tz, 0.2)) return [tx, tz];
  }
  return null;
}

// Hens peck about their yard and scatter from a hero who comes close.
export function stepHen(h, dt, colliders, heroX, heroZ) {
  h.moving = false;
  const near = heroX != null && Math.hypot(heroX - h.x, heroZ - h.z) < 1.6;
  if (near && !h.flee) {
    const t = pickHenTarget(h, colliders, heroX, heroZ);
    if (t) {
      h.tx = t[0];
      h.tz = t[1];
      h.mode = "walk";
      h.flee = true;
    }
  }
  if (h.mode === "peck") {
    h.t -= dt;
    if (h.t <= 0) {
      const t = pickHenTarget(h, colliders, null, null);
      if (t) {
        h.tx = t[0];
        h.tz = t[1];
        h.mode = "walk";
      } else {
        h.t = 1;
      }
    }
    return h;
  }
  const dx = h.tx - h.x;
  const dz = h.tz - h.z;
  const d = Math.hypot(dx, dz);
  const speed = h.flee ? 2.4 : 0.8;
  if (d <= speed * dt) {
    h.x = h.tx;
    h.z = h.tz;
    h.mode = "peck";
    h.flee = false;
    h.t = 1.5 + h.rng() * 4;
    return h;
  }
  h.x += (dx / d) * speed * dt;
  h.z += (dz / d) * speed * dt;
  h.yaw = Math.atan2(-dx, -dz);
  h.moving = true;
  return h;
}

// Cats and the dog share the villagers' graph with their own tastes and pace.
export function createPet(def, graph, seed) {
  const w = createWalker({ id: def.id, home: def.home, likes: def.likes }, graph, seed);
  w.speed = def.kind === "cat" ? 0.7 + w.rng() * 0.2 : 1.5 + w.rng() * 0.3;
  w.pet = def.kind;
  return w;
}
