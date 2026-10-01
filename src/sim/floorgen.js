import { mulberry32 } from "./rng.js";
import { floorSpan, enemyBudget, eliteCount } from "./balance.js";

export const TILE = 4;
const ELITE_AFFIX = ["hasted", "thick", "warding"];

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

export function generateFloor(runSeed, floorIndex) {
  const seed = mixSeed(runSeed, floorIndex);
  const rng = mulberry32(seed);
  const cols = floorSpan(floorIndex);
  const rows = cols;
  const tiles = new Uint8Array(cols * rows);
  const rooms = [];

  function stamp(room) {
    const r1 = Math.min(rows, room.row + room.h);
    const c1 = Math.min(cols, room.col + room.w);
    for (let r = Math.max(0, room.row); r < r1; r++) {
      for (let c = Math.max(0, room.col); c < c1; c++) tiles[r * cols + c] = 1;
    }
  }

  function inRect(room, col, row) {
    return col >= room.col && row >= room.row && col < room.col + room.w && row < room.row + room.h;
  }

  function apart(a, b) {
    const horiz = a.col + a.w + 1 <= b.col || b.col + b.w + 1 <= a.col;
    const vert = a.row + a.h + 1 <= b.row || b.row + b.h + 1 <= a.row;
    return horiz || vert;
  }

  function carveH(c0, c1, row) {
    if (row < 0 || row >= rows) return;
    const a = Math.max(0, Math.min(c0, c1));
    const b = Math.min(cols - 1, Math.max(c0, c1));
    for (let c = a; c <= b; c++) tiles[row * cols + c] = 1;
  }

  function carveV(r0, r1, col) {
    if (col < 0 || col >= cols) return;
    const a = Math.max(0, Math.min(r0, r1));
    const b = Math.min(rows - 1, Math.max(r0, r1));
    for (let r = a; r <= b; r++) tiles[r * cols + col] = 1;
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

  function centerOf(room) {
    return { col: room.col + (room.w >> 1), row: room.row + (room.h >> 1) };
  }

  const targetRooms = 3 + Math.floor(cols / 4);
  for (let n = 0; n < targetRooms; n++) {
    const w = cols >= 9 && rng() < 0.4 ? 5 : 3;
    for (let attempt = 0; attempt < 30; attempt++) {
      const col = Math.floor(rng() * (cols - w + 1));
      const row = Math.floor(rng() * (rows - w + 1));
      const room = { id: rooms.length, col, row, w, h: w };
      let ok = true;
      for (let i = 0; i < rooms.length; i++) {
        if (!apart(room, rooms[i])) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      rooms.push(room);
      stamp(room);
      break;
    }
  }

  if (rooms.length < 2) {
    const stamps = [
      { col: 1, row: 1 },
      { col: cols - 4, row: rows - 4 }
    ];
    for (let i = 0; i < stamps.length; i++) {
      const room = { id: rooms.length, col: stamps[i].col, row: stamps[i].row, w: 3, h: 3 };
      rooms.push(room);
      stamp(room);
    }
  }

  for (let i = 0; i < rooms.length; i++) rooms[i].id = i;

  for (let i = 1; i < rooms.length; i++) {
    const a = centerOf(rooms[i - 1]);
    const b = centerOf(rooms[i]);
    carveL(a.col, a.row, b.col, b.row, rng() < 0.5);
  }

  const extras = Math.floor(rooms.length * 0.45);
  for (let k = 0; k < extras; k++) {
    const a = Math.floor(rng() * rooms.length);
    let b = Math.floor(rng() * rooms.length);
    let guard = 0;
    while (b === a && guard < 5) {
      b = Math.floor(rng() * rooms.length);
      guard++;
    }
    if (b === a) b = (a + 1) % rooms.length;
    const ca = centerOf(rooms[a]);
    const cb = centerOf(rooms[b]);
    carveL(ca.col, ca.row, cb.col, cb.row, rng() < 0.5);
  }

  const entrance = centerOf(rooms[0]);

  function bfsDist() {
    const dist = new Int16Array(tiles.length);
    dist.fill(-1);
    const start = entrance.row * cols + entrance.col;
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

  function allReached(dist) {
    for (let i = 0; i < tiles.length; i++) {
      if (tiles[i] === 1 && dist[i] < 0) return false;
    }
    return true;
  }

  function farthestFloor(dist) {
    let best = null;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const d = dist[r * cols + c];
        if (d < 0) continue;
        if (!best || d > best.d || (d === best.d && (r > best.row || (r === best.row && c > best.col)))) {
          best = { col: c, row: r, d };
        }
      }
    }
    return best;
  }

  function carveLowestWallNeighbor(col, row) {
    let best = -1;
    const dirs = [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0]
    ];
    for (let i = 0; i < dirs.length; i++) {
      const c = col + dirs[i][0];
      const r = row + dirs[i][1];
      if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
      const idx = r * cols + c;
      if (tiles[idx] !== 0) continue;
      if (best < 0 || idx < best) best = idx;
    }
    if (best < 0) return false;
    tiles[best] = 1;
    return true;
  }

  function inEntrance(col, row) {
    return inRect(rooms[0], col, row);
  }

  let dist = bfsDist();
  let candidate = farthestFloor(dist);
  let stairGuard = 0;
  while (
    candidate &&
    candidate.col === entrance.col &&
    candidate.row === entrance.row &&
    stairGuard++ < 8
  ) {
    if (!carveLowestWallNeighbor(entrance.col, entrance.row)) break;
    dist = bfsDist();
    candidate = farthestFloor(dist);
  }

  function farthestRoomCenter(distMap) {
    let best = null;
    let bestD = -1;
    for (let i = 1; i < rooms.length; i++) {
      const room = rooms[i];
      const ctr = centerOf(room);
      if (inEntrance(ctr.col, ctr.row)) continue;
      const d = distMap[ctr.row * cols + ctr.col];
      if (d < 0) continue;
      if (!best || d > bestD || (d === bestD && room.id > best.id)) {
        best = room;
        bestD = d;
      }
    }
    if (!best) return null;
    const ctr = centerOf(best);
    return { col: ctr.col, row: ctr.row, roomId: best.id };
  }

  let stairs = candidate ? { col: candidate.col, row: candidate.row } : { col: entrance.col, row: entrance.row };
  let stairsRoomId = 0;
  const naturalOk = candidate && !inEntrance(candidate.col, candidate.row);
  let holders = [];
  if (naturalOk) {
    for (let i = 0; i < rooms.length; i++) {
      if (rooms[i].id !== 0 && inRect(rooms[i], candidate.col, candidate.row)) holders.push(rooms[i]);
    }
  }
  if (holders.length) {
    let room = holders[0];
    for (let i = 1; i < holders.length; i++) if (holders[i].id > room.id) room = holders[i];
    stairsRoomId = room.id;
  } else {
    const moved = farthestRoomCenter(dist);
    if (moved) {
      stairs = { col: moved.col, row: moved.row };
      stairsRoomId = moved.roomId;
    }
  }

  if (!allReached(dist)) {
    if (sealedThrows) {
      throw new Error("sealed pocket seed " + (runSeed >>> 0) + " floor " + floorIndex);
    }
    const corners = [
      { col: 0, row: 0 },
      { col: cols - 1, row: 0 },
      { col: 0, row: rows - 1 },
      { col: cols - 1, row: rows - 1 }
    ];
    let corner = corners[0];
    let cornerD = -1;
    for (let i = 0; i < corners.length; i++) {
      const c = corners[i];
      const d = Math.abs(c.col - entrance.col) + Math.abs(c.row - entrance.row);
      if (d > cornerD || (d === cornerD && (c.row > corner.row || (c.row === corner.row && c.col > corner.col)))) {
        corner = c;
        cornerD = d;
      }
    }
    // 4-connected L, horizontal then vertical. A diagonal is not a floor path.
    carveL(entrance.col, entrance.row, corner.col, corner.row, true);
    dist = bfsDist();
    let pocketGuard = 0;
    while (!allReached(dist) && pocketGuard++ < tiles.length) {
      let pocket = -1;
      for (let i = 0; i < tiles.length; i++) {
        if (tiles[i] === 1 && dist[i] < 0) {
          pocket = i;
          break;
        }
      }
      if (pocket < 0) break;
      const pr = (pocket / cols) | 0;
      const pc = pocket - pr * cols;
      carveL(entrance.col, entrance.row, pc, pr, true);
      dist = bfsDist();
    }
    if (!allReached(dist)) throw new Error("fallback left a sealed pocket");
  }

  function outsideCount() {
    let n = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (tiles[r * cols + c] === 1 && !inEntrance(c, r)) n++;
      }
    }
    return n;
  }

  function carveLowestAdjacent() {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        if (tiles[i] !== 0) continue;
        const floorN =
          (c > 0 && tiles[i - 1] === 1) ||
          (c + 1 < cols && tiles[i + 1] === 1) ||
          (r > 0 && tiles[i - cols] === 1) ||
          (r + 1 < rows && tiles[i + cols] === 1);
        if (floorN) {
          tiles[i] = 1;
          return i;
        }
      }
    }
    return -1;
  }

  const need = Math.min(36, enemyBudget(floorIndex));
  while (outsideCount() < need) {
    if (carveLowestAdjacent() < 0) break;
  }

  const bossFloor = floorIndex % 5 === 0;
  const spawns = [];
  const occupied = new Uint8Array(tiles.length);

  function pushSpawn(col, row, boss) {
    const i = row * cols + col;
    occupied[i] = 1;
    spawns.push({
      id: spawns.length,
      archetype: boss ? "boss" : "skirmisher",
      col,
      row,
      eliteAffix: null,
      boss: !!boss
    });
  }

  function farEnough(col, row) {
    const w = tileToWorld(col, row, cols, rows);
    for (let i = 0; i < spawns.length; i++) {
      const s = spawns[i];
      const p = tileToWorld(s.col, s.row, cols, rows);
      if (Math.hypot(w.x - p.x, w.z - p.z) < 3) return false;
    }
    return true;
  }

  function legal(col, row) {
    if (tiles[row * cols + col] !== 1) return false;
    if (inEntrance(col, row)) return false;
    if (col === entrance.col && row === entrance.row) return false;
    return true;
  }

  if (bossFloor) pushSpawn(stairs.col, stairs.row, true);

  const rr = [];
  for (let i = 1; i < rooms.length; i++) rr.push(rooms[i]);
  const lists = rr.map((room) => {
    const cells = [];
    for (let r = room.row; r < room.row + room.h; r++) {
      for (let c = room.col; c < room.col + room.w; c++) {
        if (r < 0 || c < 0 || r >= rows || c >= cols) continue;
        if (!legal(c, r)) continue;
        if (c === stairs.col && r === stairs.row) continue;
        cells.push({ col: c, row: r });
      }
    }
    return cells;
  });
  const cursors = lists.map(() => 0);
  let cursor = 0;
  let spin = 0;
  while (spawns.length < need && rr.length && spin++ < cols * rows) {
    let placed = false;
    for (let k = 0; k < rr.length; k++) {
      const i = (cursor + k) % rr.length;
      const list = lists[i];
      while (cursors[i] < list.length) {
        const cell = list[cursors[i]++];
        const idx = cell.row * cols + cell.col;
        if (occupied[idx]) continue;
        if (!farEnough(cell.col, cell.row)) continue;
        pushSpawn(cell.col, cell.row, false);
        cursor = (i + 1) % rr.length;
        placed = true;
        break;
      }
      if (placed) break;
    }
    if (!placed) break;
  }

  function fillScan(ignoreGap) {
    for (let r = 0; r < rows && spawns.length < need; r++) {
      for (let c = 0; c < cols && spawns.length < need; c++) {
        if (!legal(c, r)) continue;
        if (occupied[r * cols + c]) continue;
        if (!ignoreGap && !farEnough(c, r)) continue;
        pushSpawn(c, r, false);
      }
    }
  }

  fillScan(false);
  fillScan(true);

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

  dist = bfsDist();

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
        const edge = r === room.row || c === room.col || r === room.row + room.h - 1 || c === room.col + room.w - 1;
        if (!edge) continue;
        const neigh = [
          [c - 1, r],
          [c + 1, r],
          [c, r - 1],
          [c, r + 1]
        ];
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
  const ordered = pool.concat(rest);
  for (let i = 0; i < ordered.length && marked < wantElites; i++) {
    ordered[i].eliteAffix = ELITE_AFFIX[Math.floor(rng() * ELITE_AFFIX.length)];
    marked++;
  }

  const props = [];
  const themeId = ((floorIndex - 1) % 4 + 4) % 4;
  let braziers = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (tiles[r * cols + c] !== 1) continue;
      if ((c === entrance.col && r === entrance.row) || (c === stairs.col && r === stairs.row)) continue;
      if (rng() >= 0.25) continue;
      const ox = rng() < 0.5 ? -1.3 : 1.3;
      const oz = rng() < 0.5 ? -1.3 : 1.3;
      let kind;
      if (themeId === 3) {
        const roll = rng();
        if (roll < 1 / 3 && braziers < 4) {
          kind = "brazier";
          braziers++;
        } else if (roll < 2 / 3) kind = "rock";
        else kind = "root";
      } else {
        kind = rng() < 0.5 ? "rock" : "root";
      }
      props.push({ kind, col: c, row: r, ox, oz });
    }
  }

  return {
    runSeed: runSeed >>> 0,
    floorIndex,
    themeId,
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
    enemyBudget: enemyBudget(floorIndex)
  };
}
