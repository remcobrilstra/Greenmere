import { mulberry32 } from "./rng.js";
import { floorSpan, enemyBudget, eliteCount, trapBudget } from "./balance.js";
import { biomeFor } from "./biomes.js";
import { unreachableSwitches } from "./traps.js";

export const TILE = 4;
// Nothing spawns within SAFE_RADIUS metres or SAFE_STEPS walking tiles of the
// entrance. Aggro is 9 m, so a fresh arrival never wakes a pack.
export const SAFE_RADIUS = 14;
export const SAFE_STEPS = 4;
// Opened chests share run.killed with foes, above any spawn or summon id.
export const CHEST_BASE = 5000;
const ELITE_AFFIX = ["hasted", "thick", "warding"];
// Collider radius per prop kind. Corner props sit 1.84 m from the tile center,
// so anything up to 0.94 keeps the center 0.9 m clear.
const PROP_R = {
  rock: 0.45, stalagmite: 0.45, mushroom: 0.35, crystal: 0.4, root: 0.45,
  urn: 0.4, rubble: 0.45, brazier: 0.4, statue: 0.55, tomb: 0.55,
  candle: 0.3, anvil: 0.45, slag: 0.45, pillar: 0.6
};
const MAX_BRAZIERS = 8;

let sealedThrows = false;

export function setSealedThrows(on) {
  sealedThrows = !!on;
}

export function mixSeed(runSeed, floorIndex) {
  let x = (runSeed ^ Math.imul(floorIndex + 1, 0x9e3779b1)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  return (x ^ (x >>> 16)) >>> 0;
}

export function tileToWorld(col, row, cols, rows) {
  return {
    x: (col - (cols - 1) / 2) * TILE,
    z: (row - (rows - 1) / 2) * TILE
  };
}

function archetypeWeights(n) {
  return {
    skirmisher: 100,
    brute: n >= 3 ? 35 + n : 0,
    spitter: n >= 2 ? 30 + Math.floor(n * 0.5) : 0,
    shade: n >= 6 ? 20 + Math.floor(n * 0.4) : 0
  };
}

function pickArchetype(rng, n) {
  const weights = archetypeWeights(n);
  const order = ["skirmisher", "brute", "spitter", "shade"];
  let sum = 0;
  for (let i = 0; i < order.length; i++) sum += weights[order[i]];
  let roll = rng() * sum;
  for (let i = 0; i < order.length; i++) {
    roll -= weights[order[i]];
    if (roll < 0) return order[i];
  }
  return "skirmisher";
}

function pickWeighted(rng, table) {
  const keys = Object.keys(table);
  let sum = 0;
  for (let i = 0; i < keys.length; i++) sum += table[keys[i]];
  let roll = rng() * sum;
  for (let i = 0; i < keys.length; i++) {
    roll -= table[keys[i]];
    if (roll < 0) return keys[i];
  }
  return keys[keys.length - 1];
}

export function generateFloor(runSeed, floorIndex) {
  const seed = mixSeed(runSeed, floorIndex);
  const rng = mulberry32(seed);
  const biome = biomeFor(floorIndex);
  const cols = floorSpan(floorIndex);
  const rows = cols;
  const tiles = new Uint8Array(cols * rows);
  // The outer ring always stays rock, so every floor reads as enclosed.
  const lo = 1;
  const hiC = cols - 2;
  const hiR = rows - 2;
  let rooms = [];

  function randInt(a, b) {
    return a + Math.floor(rng() * (b - a + 1));
  }

  function carve(c, r) {
    if (c < lo || r < lo || c > hiC || r > hiR) return;
    tiles[r * cols + c] = 1;
  }

  function inRect(room, col, row) {
    return col >= room.col && row >= room.row && col < room.col + room.w && row < room.row + room.h;
  }

  function apart(a, b, gap) {
    const horiz = a.col + a.w + gap <= b.col || b.col + b.w + gap <= a.col;
    const vert = a.row + a.h + gap <= b.row || b.row + b.h + gap <= a.row;
    return horiz || vert;
  }

  function centerOf(room) {
    return { col: room.col + (room.w >> 1), row: room.row + (room.h >> 1) };
  }

  function stampRect(room) {
    for (let r = room.row; r < room.row + room.h; r++) {
      for (let c = room.col; c < room.col + room.w; c++) carve(c, r);
    }
  }

  // A chamber: an ellipse with a ragged rim. The center cross is always open.
  function stampBlob(room) {
    const cx = room.col + (room.w - 1) / 2;
    const cy = room.row + (room.h - 1) / 2;
    const rx = room.w / 2;
    const ry = room.h / 2;
    for (let r = room.row; r < room.row + room.h; r++) {
      for (let c = room.col; c < room.col + room.w; c++) {
        const dx = (c - cx) / rx;
        const dy = (r - cy) / ry;
        if (dx * dx + dy * dy <= 0.72 + rng() * 0.5) carve(c, r);
      }
    }
    const m = centerOf(room);
    carve(m.col, m.row);
    if (m.col - 1 >= room.col) carve(m.col - 1, m.row);
    if (m.col + 1 < room.col + room.w) carve(m.col + 1, m.row);
    if (m.row - 1 >= room.row) carve(m.col, m.row - 1);
    if (m.row + 1 < room.row + room.h) carve(m.col, m.row + 1);
  }

  function carveH(c0, c1, row) {
    const a = Math.min(c0, c1);
    const b = Math.max(c0, c1);
    for (let c = a; c <= b; c++) carve(c, row);
  }

  function carveV(r0, r1, col) {
    const a = Math.min(r0, r1);
    const b = Math.max(r0, r1);
    for (let r = a; r <= b; r++) carve(col, r);
  }

  function carveL(c0, r0, c1, r1, horizFirst) {
    if (horizFirst) {
      carveH(c0, c1, r0);
      carveV(r0, r1, c1);
    } else {
      carveV(r0, r1, c0);
      carveH(c0, c1, r1);
    }
  }

  // A tunnel that drifts toward its target with the odd sidestep. Sometimes two wide.
  function carveWind(a, b) {
    let c = a.col;
    let r = a.row;
    const wide = rng() < biome.wideChance;
    const wideDir = rng() < 0.5 ? -1 : 1;
    let sidesteps = 0;
    let guard = 0;
    carve(c, r);
    while ((c !== b.col || r !== b.row) && guard++ < 600) {
      const dc = b.col - c;
      const dr = b.row - r;
      let sc = 0;
      let sr = 0;
      if (rng() < 0.14 && sidesteps < 6) {
        if (Math.abs(dc) >= Math.abs(dr)) sr = rng() < 0.5 ? -1 : 1;
        else sc = rng() < 0.5 ? -1 : 1;
        sidesteps++;
      } else {
        const ad = Math.abs(dc);
        const ar = Math.abs(dr);
        if (ad > 0 && (ar === 0 || rng() * (ad + ar) < ad)) sc = Math.sign(dc);
        else sr = Math.sign(dr);
      }
      const nc = c + sc;
      const nr = r + sr;
      if (nc < lo || nr < lo || nc > hiC || nr > hiR) continue;
      c = nc;
      r = nr;
      carve(c, r);
      if (wide) {
        if (sc !== 0) carve(c, r + wideDir);
        else carve(c + wideDir, r);
      }
    }
    if (c !== b.col || r !== b.row) carveL(c, r, b.col, b.row, true);
  }

  function connect(a, b) {
    const ca = centerOf(a);
    const cb = centerOf(b);
    if (biome.corridor === "wind") carveWind(ca, cb);
    else carveL(ca.col, ca.row, cb.col, cb.row, rng() < 0.5);
  }

  // 1. Rooms on a jittered grid, so a big floor is used edge to edge. Some slots
  // stay solid rock; some neighbouring slots merge into one hall.
  const spanW = cols - 2;
  const grid = Math.max(2, Math.round(spanW / 5.5));
  const cut = [];
  for (let i = 0; i <= grid; i++) cut.push(lo + Math.floor((i * spanW) / grid));
  const taken = new Uint8Array(grid * grid);
  const mergeChance = biome.roomShape === "rect" ? 0.2 : 0.14;
  for (let gy = 0; gy < grid; gy++) {
    for (let gx = 0; gx < grid; gx++) {
      if (taken[gy * grid + gx]) continue;
      taken[gy * grid + gx] = 1;
      let gx1 = gx;
      let gy1 = gy;
      if (rng() < mergeChance && gx + 1 < grid && !taken[gy * grid + gx + 1]) gx1 = gx + 1;
      else if (rng() < mergeChance && gy + 1 < grid) gy1 = gy + 1;
      taken[gy1 * grid + gx1] = 1;
      const merged = gx1 !== gx || gy1 !== gy;
      if (!merged && rng() < 0.12) continue;
      // The last column and row of each slot stay rock: that is the gap between rooms.
      const uw = cut[gx1 + 1] - cut[gx] - 1;
      const uh = cut[gy1 + 1] - cut[gy] - 1;
      const minS = Math.min(biome.room[0], uw, uh);
      const w = merged && gx1 !== gx ? randInt(Math.max(minS, Math.floor(uw * 0.6)), uw) : randInt(minS, Math.min(biome.room[1], uw));
      const h = merged && gy1 !== gy ? randInt(Math.max(minS, Math.floor(uh * 0.6)), uh) : randInt(minS, Math.min(biome.room[1], uh));
      const col = cut[gx] + randInt(0, uw - w);
      const row = cut[gy] + randInt(0, uh - h);
      rooms.push({ id: rooms.length, col, row, w, h });
    }
  }
  if (rooms.length < 2) {
    rooms = [
      { id: 0, col: lo, row: lo, w: 3, h: 3 },
      { id: 1, col: hiC - 2, row: hiR - 2, w: 3, h: 3 }
    ];
  }
  for (let i = 0; i < rooms.length; i++) {
    if (biome.roomShape === "blob") stampBlob(rooms[i]);
    else stampRect(rooms[i]);
  }

  // 2. Corridors: a minimum spanning tree over room centers, then a few short loops.
  function gapSq(a, b) {
    const ca = centerOf(a);
    const cb = centerOf(b);
    const dc = ca.col - cb.col;
    const dr = ca.row - cb.row;
    return dc * dc + dr * dr;
  }
  const linked = new Set();
  const inTree = [true];
  for (let i = 1; i < rooms.length; i++) inTree.push(false);
  for (let added = 1; added < rooms.length; added++) {
    let bi = -1;
    let bj = -1;
    let bd = Infinity;
    for (let i = 0; i < rooms.length; i++) {
      if (!inTree[i]) continue;
      for (let j = 0; j < rooms.length; j++) {
        if (inTree[j]) continue;
        const d = gapSq(rooms[i], rooms[j]);
        if (d < bd) {
          bd = d;
          bi = i;
          bj = j;
        }
      }
    }
    inTree[bj] = true;
    linked.add(Math.min(bi, bj) * 1000 + Math.max(bi, bj));
    connect(rooms[bi], rooms[bj]);
  }
  const spare = [];
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      if (!linked.has(i * 1000 + j)) spare.push({ i, j, d: gapSq(rooms[i], rooms[j]) });
    }
  }
  spare.sort((a, b) => a.d - b.d || a.i - b.i || a.j - b.j);
  const loops = Math.round(rooms.length * biome.loopRate);
  for (let k = 0; k < loops && spare.length; k++) {
    const pick = Math.floor(rng() * Math.min(spare.length, rooms.length));
    const pair = spare.splice(pick, 1)[0];
    connect(rooms[pair.i], rooms[pair.j]);
  }

  function bfsFrom(col, row) {
    const dist = new Int16Array(tiles.length);
    dist.fill(-1);
    const start = row * cols + col;
    if (tiles[start] !== 1) return dist;
    dist[start] = 0;
    const q = [start];
    let qi = 0;
    while (qi < q.length) {
      const i = q[qi++];
      const r = (i / cols) | 0;
      const c = i - r * cols;
      const nd = dist[i] + 1;
      if (c > 0 && tiles[i - 1] === 1 && dist[i - 1] < 0) {
        dist[i - 1] = nd;
        q.push(i - 1);
      }
      if (c + 1 < cols && tiles[i + 1] === 1 && dist[i + 1] < 0) {
        dist[i + 1] = nd;
        q.push(i + 1);
      }
      if (r > 0 && tiles[i - cols] === 1 && dist[i - cols] < 0) {
        dist[i - cols] = nd;
        q.push(i - cols);
      }
      if (r + 1 < rows && tiles[i + cols] === 1 && dist[i + cols] < 0) {
        dist[i + cols] = nd;
        q.push(i + cols);
      }
    }
    return dist;
  }

  function farthestRoom(dist, skip) {
    let best = -1;
    let bestD = -1;
    for (let i = 0; i < rooms.length; i++) {
      if (i === skip) continue;
      const m = centerOf(rooms[i]);
      const d = dist[m.row * cols + m.col];
      if (d > bestD || (d === bestD && i > best)) {
        best = i;
        bestD = d;
      }
    }
    return best;
  }

  // 3. Entrance and stairs sit at the two ends of the longest walk.
  const probe = centerOf(rooms[0]);
  const entranceIdx = farthestRoom(bfsFrom(probe.col, probe.row), -1);
  const em = centerOf(rooms[entranceIdx]);
  const stairsIdx = farthestRoom(bfsFrom(em.col, em.row), entranceIdx);
  const entranceRoom = rooms[entranceIdx];
  const stairsRoom = rooms[stairsIdx];
  const ordered = [entranceRoom];
  for (let i = 0; i < rooms.length; i++) if (i !== entranceIdx) ordered.push(rooms[i]);
  rooms = ordered;
  for (let i = 0; i < rooms.length; i++) rooms[i].id = i;
  const entrance = centerOf(entranceRoom);
  const stairs = centerOf(stairsRoom);
  const stairsRoomId = stairsRoom.id;

  // 4. Every room center must be reachable; stray rim cells that are not get filled back in.
  let dist = bfsFrom(entrance.col, entrance.row);
  for (let i = 0; i < rooms.length; i++) {
    const m = centerOf(rooms[i]);
    if (dist[m.row * cols + m.col] < 0) {
      if (sealedThrows) throw new Error("sealed room seed " + (runSeed >>> 0) + " floor " + floorIndex);
      carveL(entrance.col, entrance.row, m.col, m.row, true);
      dist = bfsFrom(entrance.col, entrance.row);
    }
  }
  for (let i = 0; i < tiles.length; i++) {
    if (tiles[i] === 1 && dist[i] < 0) tiles[i] = 0;
  }

  function inEntrance(col, row) {
    return inRect(entranceRoom, col, row);
  }

  function nearEntrance(col, row) {
    const dc = (col - entrance.col) * TILE;
    const dr = (row - entrance.row) * TILE;
    return dc * dc + dr * dr < SAFE_RADIUS * SAFE_RADIUS;
  }

  function safe(col, row) {
    const i = row * cols + col;
    if (tiles[i] !== 1 || inEntrance(col, row)) return false;
    if (dist[i] < SAFE_STEPS || nearEntrance(col, row)) return false;
    return true;
  }

  function legal(col, row) {
    if (tiles[row * cols + col] !== 1) return false;
    if (inEntrance(col, row)) return false;
    if (col === entrance.col && row === entrance.row) return false;
    return true;
  }

  function carveLowestAdjacent() {
    for (let r = lo; r <= hiR; r++) {
      for (let c = lo; c <= hiC; c++) {
        const i = r * cols + c;
        if (tiles[i] !== 0) continue;
        const floorN = tiles[i - 1] === 1 || tiles[i + 1] === 1 || tiles[i - cols] === 1 || tiles[i + cols] === 1;
        if (floorN) {
          tiles[i] = 1;
          return i;
        }
      }
    }
    return -1;
  }

  const need = Math.min(36, enemyBudget(floorIndex));
  const bossFloor = floorIndex % 5 === 0;
  const spawns = [];
  const occupied = new Uint8Array(tiles.length);

  function pushSpawn(col, row, boss) {
    occupied[row * cols + col] = 1;
    spawns.push({
      id: spawns.length,
      archetype: boss ? "boss" : "skirmisher",
      col,
      row,
      eliteAffix: null,
      boss: !!boss
    });
  }

  if (bossFloor) pushSpawn(stairs.col, stairs.row, true);

  // 5. Packs of 2-4 hold rooms; some rooms stay quiet. A boss keeps its room to itself.
  const packRooms = [];
  for (let i = 1; i < rooms.length; i++) {
    if (bossFloor && rooms[i].id === stairsRoomId) continue;
    packRooms.push(rooms[i]);
  }
  for (let i = packRooms.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = packRooms[i];
    packRooms[i] = packRooms[j];
    packRooms[j] = t;
  }
  // A room holds at most a quarter of its open cells, so leftovers spread into
  // more rooms and then the corridors instead of piling into one hall.
  const held = packRooms.map(() => 0);
  let progress = true;
  while (spawns.length < need && progress) {
    progress = false;
    for (let k = 0; k < packRooms.length && spawns.length < need; k++) {
      const room = packRooms[k];
      const m = centerOf(room);
      const cells = [];
      for (let r = room.row; r < room.row + room.h; r++) {
        for (let c = room.col; c < room.col + room.w; c++) {
          if (!safe(c, r) || occupied[r * cols + c]) continue;
          if (c === stairs.col && r === stairs.row) continue;
          cells.push({ col: c, row: r, d: Math.abs(c - m.col) + Math.abs(r - m.row) });
        }
      }
      cells.sort((a, b) => a.d - b.d || a.row - b.row || a.col - b.col);
      const cap = Math.max(2, Math.floor((cells.length + held[k]) / 4)) - held[k];
      const size = Math.max(0, Math.min(need - spawns.length, 2 + Math.floor(rng() * 3), cells.length, cap));
      for (let i = 0; i < size; i++) pushSpawn(cells[i].col, cells[i].row, false);
      held[k] += size;
      if (size > 0) progress = true;
    }
  }

  function fillScan(test) {
    for (let r = 0; r < rows && spawns.length < need; r++) {
      for (let c = 0; c < cols && spawns.length < need; c++) {
        if (!test(c, r) || occupied[r * cols + c]) continue;
        if (c === stairs.col && r === stairs.row) continue;
        pushSpawn(c, r, false);
      }
    }
  }
  fillScan(safe);
  fillScan(legal);
  let safety = 0;
  while (spawns.length < need && safety++ < cols * rows) {
    const i = carveLowestAdjacent();
    if (i < 0) break;
    const r = (i / cols) | 0;
    const c = i - r * cols;
    if (!legal(c, r) || occupied[i]) continue;
    pushSpawn(c, r, false);
  }

  for (let i = 0; i < spawns.length; i++) {
    if (!spawns[i].boss) spawns[i].archetype = pickArchetype(rng, floorIndex);
  }

  dist = bfsFrom(entrance.col, entrance.row);

  function roomIdAt(col, row) {
    let id = -1;
    for (let i = 0; i < rooms.length; i++) {
      if (inRect(rooms[i], col, row)) id = rooms[i].id;
    }
    return id;
  }

  function corridorExits(room) {
    let exits = 0;
    for (let r = room.row; r < room.row + room.h; r++) {
      for (let c = room.col; c < room.col + room.w; c++) {
        if (tiles[r * cols + c] !== 1) continue;
        const neigh = [[c - 1, r], [c + 1, r], [c, r - 1], [c, r + 1]];
        let door = false;
        for (let k = 0; k < neigh.length; k++) {
          const nc = neigh[k][0];
          const nr = neigh[k][1];
          if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
          if (inRect(room, nc, nr)) continue;
          if (tiles[nr * cols + nc] === 1) door = true;
        }
        if (door) exits++;
      }
    }
    return exits;
  }

  const deadRooms = new Set();
  for (let i = 1; i < rooms.length; i++) {
    if (corridorExits(rooms[i]) === 1) deadRooms.add(rooms[i].id);
  }

  const pool = [];
  const rest = [];
  for (let i = 0; i < spawns.length; i++) {
    const s = spawns[i];
    if (s.boss) continue;
    if (s.col === stairs.col && s.row === stairs.row) continue;
    if (deadRooms.has(roomIdAt(s.col, s.row))) pool.push(s);
    else rest.push(s);
  }

  function byFar(a, b) {
    const da = dist[a.row * cols + a.col];
    const db = dist[b.row * cols + b.col];
    if (da !== db) return db - da;
    if (a.row !== b.row) return b.row - a.row;
    if (a.col !== b.col) return b.col - a.col;
    return a.id - b.id;
  }

  pool.sort(byFar);
  rest.sort(byFar);
  const wantElites = eliteCount(floorIndex);
  let marked = 0;
  const eliteOrder = pool.concat(rest);
  for (let i = 0; i < eliteOrder.length && marked < wantElites; i++) {
    eliteOrder[i].eliteAffix = ELITE_AFFIX[Math.floor(rng() * ELITE_AFFIX.length)];
    marked++;
  }

  // 6. Props. Pillars stand on the shared corner of four room cells; the rest sit
  // in a tile corner. Either way every tile center keeps 0.9 m clear.
  const props = [];
  const pillarAt = new Set();
  if (biome.pillars) {
    for (let i = 0; i < rooms.length; i++) {
      const room = rooms[i];
      if (room.w < 5 || room.h < 5 || room.id === stairsRoomId) continue;
      const alongX = room.w >= room.h;
      const span = alongX ? room.w : room.h;
      for (let t = 1; t < span - 2; t += 2) {
        for (let side = 0; side < 2; side++) {
          const c = alongX ? room.col + t : (side ? room.col + room.w - 2 : room.col);
          const r = alongX ? (side ? room.row + room.h - 2 : room.row) : room.row + t;
          if (tiles[r * cols + c] !== 1 || tiles[r * cols + c + 1] !== 1) continue;
          if (tiles[(r + 1) * cols + c] !== 1 || tiles[(r + 1) * cols + c + 1] !== 1) continue;
          pillarAt.add(r * cols + c);
          props.push({ kind: "pillar", col: c, row: r, ox: 2, oz: 2, r: PROP_R.pillar });
        }
      }
    }
  }
  // 7. Treasure: 0-2 chests, dead-end rooms first, never the entrance or stairs room.
  // A chest leans into a room corner (same 1.3 m corner offset as props) and faces
  // the room. Ids are per floor; opened chests are kept in run.killed as CHEST_BASE + id.
  const chests = [];
  const chestCell = new Set();
  const chestRoll = rng();
  const wantChests = chestRoll < 0.35 ? 0 : chestRoll < 0.85 ? 1 : 2;
  const chestRooms = [];
  for (let i = 1; i < rooms.length; i++) if (rooms[i].id !== stairsRoomId) chestRooms.push(rooms[i]);
  for (let i = chestRooms.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = chestRooms[i];
    chestRooms[i] = chestRooms[j];
    chestRooms[j] = t;
  }
  chestRooms.sort((a, b) => (deadRooms.has(b.id) ? 1 : 0) - (deadRooms.has(a.id) ? 1 : 0));
  for (let k = 0; k < chestRooms.length && chests.length < wantChests; k++) {
    const room = chestRooms[k];
    const corners = [
      { c: room.col, r: room.row, sx: -1, sz: -1 },
      { c: room.col + room.w - 1, r: room.row, sx: 1, sz: -1 },
      { c: room.col, r: room.row + room.h - 1, sx: -1, sz: 1 },
      { c: room.col + room.w - 1, r: room.row + room.h - 1, sx: 1, sz: 1 }
    ];
    const start = Math.floor(rng() * 4);
    for (let n = 0; n < 4; n++) {
      const corner = corners[(start + n) % 4];
      // The cell in the room nearest that corner that is open and free.
      let best = null;
      let bestD = Infinity;
      for (let r = room.row; r < room.row + room.h; r++) {
        for (let c = room.col; c < room.col + room.w; c++) {
          const i = r * cols + c;
          if (tiles[i] !== 1 || occupied[i]) continue;
          if ((c === entrance.col && r === entrance.row) || (c === stairs.col && r === stairs.row)) continue;
          const d = Math.abs(c - corner.c) + Math.abs(r - corner.r);
          if (d < bestD) {
            bestD = d;
            best = { c, r };
          }
        }
      }
      if (!best) continue;
      const vc = corner.sx < 0 ? best.c - 1 : best.c;
      const vr = corner.sz < 0 ? best.r - 1 : best.r;
      if (pillarAt.has(vr * cols + vc)) continue;
      chestCell.add(best.r * cols + best.c);
      chests.push({
        id: chests.length,
        col: best.c,
        row: best.r,
        ox: 1.3 * corner.sx,
        oz: 1.3 * corner.sz,
        // Local −z (the chest's front) points back toward the room.
        yaw: Math.atan2(corner.sx, corner.sz),
        r: 0.55
      });
      break;
    }
  }

  let braziers = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (tiles[r * cols + c] !== 1) continue;
      if ((c === entrance.col && r === entrance.row) || (c === stairs.col && r === stairs.row)) continue;
      if (chestCell.has(r * cols + c)) continue;
      if (rng() >= biome.propRate) continue;
      const sx = rng() < 0.5 ? -1 : 1;
      const sz = rng() < 0.5 ? -1 : 1;
      let kind = pickWeighted(rng, biome.props);
      // The corner vertex this prop leans into must not already hold a pillar.
      const vc = sx < 0 ? c - 1 : c;
      const vr = sz < 0 ? r - 1 : r;
      if (pillarAt.has(vr * cols + vc)) continue;
      if (kind === "brazier") {
        if (braziers >= MAX_BRAZIERS) kind = "rubble";
        else braziers++;
      }
      props.push({ kind, col: c, row: r, ox: 1.3 * sx, oz: 1.3 * sz, r: PROP_R[kind] || 0.45 });
    }
  }

  // 8. Traps (docs/traps.md). Their own stream, so the layout, foes, chests and
  // props above stay exactly as they were before traps existed.
  const traps = placeTraps();

  function placeTraps() {
    const budget = bossFloor ? trapBudget(floorIndex) >> 1 : trapBudget(floorIndex);
    if (budget <= 0) return [];
    const trng = mulberry32(mixSeed(runSeed ^ 0x7a9b5, floorIndex));
    const stairsRoomRef = rooms[stairsRoomId];
    const propCell = new Set();
    for (let i = 0; i < props.length; i++) if (props[i].kind !== "pillar") propCell.add(props[i].row * cols + props[i].col);
    const floorAt = (c, r) => c >= 0 && r >= 0 && c < cols && r < rows && tiles[r * cols + c] === 1;
    const inAnyRoom = (c, r) => {
      for (let i = 0; i < rooms.length; i++) if (inRect(rooms[i], c, r)) return true;
      return false;
    };
    function open(c, r) {
      const i = r * cols + c;
      if (!safe(c, r) || occupied[i] || chestCell.has(i) || propCell.has(i)) return false;
      if (c === stairs.col && r === stairs.row) return false;
      if (bossFloor && inRect(stairsRoomRef, c, r)) return false;
      return true;
    }
    // The axis of a straight one-wide corridor cell ("x" or "z"), or null.
    function straight(c, r) {
      if (!floorAt(c, r) || inAnyRoom(c, r)) return null;
      const e = floorAt(c + 1, r);
      const w = floorAt(c - 1, r);
      const s = floorAt(c, r + 1);
      const n = floorAt(c, r - 1);
      if (e && w && !s && !n) return "x";
      if (s && n && !e && !w) return "z";
      return null;
    }
    const roomCells = [];
    const corridorCells = [];
    const doorCells = [];
    const dartCells = [];
    for (let r = lo; r <= hiR; r++) {
      for (let c = lo; c <= hiC; c++) {
        if (!floorAt(c, r) || !open(c, r)) continue;
        if (inAnyRoom(c, r)) {
          // A plate needs floor on every side, so it can always be stepped around.
          if (floorAt(c + 1, r) && floorAt(c - 1, r) && floorAt(c, r + 1) && floorAt(c, r - 1)) roomCells.push({ col: c, row: r });
          continue;
        }
        const axis = straight(c, r);
        if (!axis) continue;
        corridorCells.push({ col: c, row: r, axis });
        const dc = axis === "x" ? 1 : 0;
        const dr = axis === "x" ? 0 : 1;
        // A gong's tripwire spans a corridor mouth: the next cell along is a room.
        if (inAnyRoom(c + dc, r + dr) || inAnyRoom(c - dc, r - dr)) doorCells.push({ col: c, row: r, axis });
        // A dart plate sits mid-run, with straight corridor on both sides; the
        // launcher stands at one end of the run and shoots down its length.
        if (straight(c + dc, r + dr) === axis && straight(c - dc, r - dr) === axis) {
          const ends = [];
          for (const sgn of [1, -1]) {
            let k = 1;
            while (k < 8 && straight(c + dc * sgn * (k + 1), r + dr * sgn * (k + 1)) === axis) k++;
            ends.push({ col: c + dc * sgn * k, row: r + dr * sgn * k, k });
          }
          dartCells.push({ col: c, row: r, axis, ends });
        }
      }
    }
    function shuffle(list) {
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(trng() * (i + 1));
        const t = list[i];
        list[i] = list[j];
        list[j] = t;
      }
    }
    shuffle(roomCells);
    shuffle(corridorCells);
    // No two traps (or a trap and a switch) on touching cells.
    const busy = new Set();
    function free(c, r) {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) if (busy.has((r + dr) * cols + c + dc)) return false;
      }
      return true;
    }
    // A fire wall's valve sits on the corridor cell before it (nearer the entrance),
    // against a side wall of that cell.
    function switchFor(cell) {
      const ax = cell.axis === "x";
      const a = ax ? { c: cell.col - 1, r: cell.row } : { c: cell.col, r: cell.row - 1 };
      const b = ax ? { c: cell.col + 1, r: cell.row } : { c: cell.col, r: cell.row + 1 };
      const da = dist[a.r * cols + a.c];
      const db = dist[b.r * cols + b.c];
      const near = da >= 0 && (db < 0 || da <= db) ? a : b;
      if (!floorAt(near.c, near.r) || chestCell.has(near.r * cols + near.c)) return null;
      if (near.c === stairs.col && near.r === stairs.row) return null;
      const sides = ax ? [[0, 1], [0, -1]] : [[1, 0], [-1, 0]];
      for (let k = 0; k < sides.length; k++) {
        const sc = sides[k][0];
        const sr = sides[k][1];
        if (floorAt(near.c + sc, near.r + sr)) continue;
        return { col: near.c, row: near.r, ox: sc * 1.55, oz: sr * 1.55, yaw: Math.atan2(sc, sr) };
      }
      return null;
    }
    shuffle(doorCells);
    shuffle(dartCells);
    const WEIGHT = biome.traps || { spikes: 3, flameJet: 2, fireWall: 1, darts: 1, gong: 1 };
    const POOL = { spikes: roomCells, flameJet: corridorCells, fireWall: corridorCells, darts: dartCells, gong: doorCells };
    const CAP = { spikes: Math.ceil(budget * 0.6), flameJet: 12, fireWall: 2, darts: 2, gong: 1 };
    const placed = {};
    const out = [];
    for (let n = 0; n < budget; n++) {
      const kinds = [];
      let sum = 0;
      for (const k in WEIGHT) {
        if (!POOL[k] || !POOL[k].length || (placed[k] || 0) >= CAP[k]) continue;
        kinds.push(k);
        sum += WEIGHT[k];
      }
      if (!kinds.length) break;
      let roll = trng() * sum;
      let kind = kinds[kinds.length - 1];
      for (let i = 0; i < kinds.length; i++) {
        roll -= WEIGHT[kinds[i]];
        if (roll < 0) {
          kind = kinds[i];
          break;
        }
      }
      const pool = POOL[kind];
      const phase = trng();
      const side = trng() < 0.5 ? -1 : 1;
      while (pool.length) {
        const cell = pool.pop();
        if (!free(cell.col, cell.row)) continue;
        const spec = { id: out.length, kind, col: cell.col, row: cell.row, axis: cell.axis || "x", phase, sw: null };
        if (kind === "fireWall") {
          spec.sw = switchFor(cell);
          if (!spec.sw || !free(spec.sw.col, spec.sw.row)) continue;
          busy.add(spec.sw.row * cols + spec.sw.col);
        } else if (kind === "gong") {
          // The gong hangs against one side wall of the mouth cell.
          spec.side = side;
        } else if (kind === "darts") {
          const from = cell.ends[side < 0 ? 0 : 1];
          const to = cell.ends[side < 0 ? 1 : 0];
          if (!free(from.col, from.row)) continue;
          spec.from = { col: from.col, row: from.row };
          spec.to = { col: to.col, row: to.row };
          busy.add(from.row * cols + from.col);
        }
        placed[kind] = (placed[kind] || 0) + 1;
        busy.add(cell.row * cols + cell.col);
        out.push(spec);
        break;
      }
    }
    // Route check: with every fire wall standing, each valve must still be reachable
    // from the entrance. A wall that fails is dropped and the check runs again.
    for (let guard = 0; guard < 4; guard++) {
      const bad = unreachableSwitches({ cols, rows, tiles, entrance, traps: out });
      if (!bad.length) break;
      for (let i = out.length - 1; i >= 0; i--) if (bad.indexOf(out[i]) >= 0) out.splice(i, 1);
    }
    for (let i = 0; i < out.length; i++) out[i].id = i;
    return out;
  }

  return {
    runSeed: runSeed >>> 0,
    floorIndex,
    themeId: biome.id,
    biomeId: biome.id,
    biomeKey: biome.key,
    biomeName: biome.name,
    cols,
    rows,
    tile: TILE,
    tiles,
    entrance: { col: entrance.col, row: entrance.row },
    stairs: { col: stairs.col, row: stairs.row },
    stairsRoomId,
    rooms,
    spawns,
    props,
    chests,
    traps,
    enemyBudget: enemyBudget(floorIndex)
  };
}
