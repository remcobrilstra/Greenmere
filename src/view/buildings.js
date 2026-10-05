// Life-size Greenmere buildings, interiors, street props, square, and roads.
// Everything is code-built, flat-shaded Lambert with vertex colours. Parts are
// baked to world space and merged by role so the whole town costs a few dozen draws.

import * as THREE from "three";
import { mulberry32 } from "../sim/rng.js";
import { paintFaces, mergeParts, lambert } from "./materials.js";
import { loadTownModels } from "./townmodels.js";
import {
  BUILDINGS, COTTAGES, ROADS, PROPS, SQUARE_R, SQUARE_TOP, FLOOR_Y, WALL_T, DOOR_W, DOOR_H,
  INTERACT_R, CUTAWAY_H, STAIR_W, levelTop, wallBoxes, wallHeight, buildingColliders, propColliders, stationWorld, localToWorld
} from "../sim/townplan.js";

const PLASTER = [0xe7d7b4, 0xeadcbc, 0xe0cfa9];
const ASHLAR = [0x9aa0a4, 0x8a8f93, 0xa8adb0, 0x7d868f];
const TIMBER_D = [0x3a2416, 0x432a1a];
const TIMBER_M = [0x6b4428, 0x5e3b22];
const TIMBER_L = [0x8d5b34, 0x7d5030];
const STONE = [0x4c545e, 0x5e6771, 0x6e7882, 0x7d868f];
const STONE_D = [0x2f363e, 0x3e4650];
const PLANK = [0x8a6a44, 0x7d5e3a, 0x96744a];
const COBBLE = [0x8a8f93, 0x7b8085, 0x9aa0a4, 0x6e7377, 0x858a80];
const DIRT = [0x9a7a52, 0x8c6d47, 0xa4865c];
const IRON = [0x3b3f45, 0x2c3036];
const STEEL = [0xc5d0dc, 0xaab5c1];
const GOLD = [0xd4a03a, 0xc79232];
const COPPER = [0xb87333, 0xa86528, 0xc98443];
const STRAW = [0xc9a85a, 0xd8b968, 0xb8984c];
const BURLAP = [0xc2a36b, 0xb39460];
const GOODS = [0xb64034, 0x2d62c8, 0x3e9a36, 0xd4a03a, 0xe7d7b4, 0x7a4a8c, 0x8d5b34, 0xc5d0dc];

// One colour for a whole part (cobbles, planks) so faces do not split into triangles.
function pick(kit, list) {
  return list[Math.floor(kit.rand() * list.length)];
}

function tone(hex, amt) {
  const a = amt == null ? 0.07 : amt;
  const c = new THREE.Color(hex);
  const hi = c.clone().multiplyScalar(1 + a);
  const lo = c.clone().multiplyScalar(1 - a);
  hi.r = Math.min(1, hi.r); hi.g = Math.min(1, hi.g); hi.b = Math.min(1, hi.b);
  return [hex, hi.getHex(), lo.getHex()];
}

// Collects painted parts in world space, grouped by role.
function makeKit(rand) {
  const roles = new Map();
  const frame = new THREE.Matrix4();
  const tmp = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const pos = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const kit = {
    rand,
    frame,
    redirect: null,
    setFrame(m) { frame.copy(m); return kit; },
    add(role, geo, colors, x, y, z, ry, rx, rz) {
      if (kit.redirect && kit.redirect[role]) role = kit.redirect[role];
      euler.set(rx || 0, ry || 0, rz || 0);
      quat.setFromEuler(euler);
      pos.set(x, y, z);
      tmp.compose(pos, quat, one).premultiply(frame);
      const g = paintFaces(geo, colors, rand);
      g.applyMatrix4(tmp);
      let list = roles.get(role);
      if (!list) roles.set(role, list = []);
      list.push(g);
      return g;
    },
    box(role, w, h, d, colors, x, y, z, ry, rx, rz) {
      return kit.add(role, new THREE.BoxGeometry(w, h, d), colors, x, y, z, ry, rx, rz);
    },
    cyl(role, rt, rb, h, seg, colors, x, y, z, ry, rx, rz) {
      return kit.add(role, new THREE.CylinderGeometry(rt, rb, h, seg), colors, x, y, z, ry, rx, rz);
    },
    cone(role, r, h, seg, colors, x, y, z, ry, rx, rz) {
      return kit.add(role, new THREE.ConeGeometry(r, h, seg), colors, x, y, z, ry, rx, rz);
    },
    ball(role, r, colors, x, y, z, sx, sy, sz) {
      const g = new THREE.IcosahedronGeometry(r, 0);
      g.scale(sx || 1, sy || 1, sz || 1);
      return kit.add(role, g, colors, x, y, z);
    },
    take(role) {
      const list = roles.get(role);
      roles.delete(role);
      if (!list || !list.length) return null;
      return mergeParts(list);
    },
    roles() { return Array.from(roles.keys()); }
  };
  return kit;
}

function buildingMatrix(b) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(b.x, 0, b.z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), b.yaw),
    new THREE.Vector3(1, 1, 1)
  );
}

function localMatrix(base, x, y, z, ry) {
  return base.clone().multiply(new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry || 0),
    new THREE.Vector3(1, 1, 1)
  ));
}

// Frame on a wall face: local x runs along the wall (matching townplan `along`),
// local z points outward, y = 0 is the floor top.
function sideMatrix(base, b, side) {
  if (side === "front") return localMatrix(base, 0, FLOOR_Y, b.d / 2, 0);
  if (side === "back") return localMatrix(base, 0, FLOOR_Y, -b.d / 2, Math.PI);
  if (side === "left") return localMatrix(base, -b.w / 2, FLOOR_Y, 0, -Math.PI / 2);
  return localMatrix(base, b.w / 2, FLOOR_Y, 0, Math.PI / 2);
}
function sideFlip(side) {
  return side === "back" || side === "right" ? -1 : 1;
}
function sideLen(b, side) {
  return side === "front" || side === "back" ? b.w : b.d;
}

// ---------- furniture ----------

function goodsRow(kit, role, w, y, z, depth) {
  const r = kit.rand;
  let x = -w / 2 + 0.12;
  while (x < w / 2 - 0.15) {
    const kind = r();
    const col = [GOODS[Math.floor(r() * GOODS.length)]];
    if (kind < 0.4) {
      const h = 0.18 + r() * 0.16;
      kit.cyl(role, 0.07, 0.08, h, 6, col, x, y + h / 2, z + (r() - 0.5) * depth * 0.3);
      x += 0.2;
    } else if (kind < 0.75) {
      const s = 0.16 + r() * 0.14;
      kit.box(role, s, s * (0.7 + r() * 0.6), Math.min(depth * 0.8, s), col, x + s / 2, y + s * 0.4, z);
      x += s + 0.06;
    } else {
      kit.ball(role, 0.1, col, x, y + 0.1, z);
      x += 0.24;
    }
  }
}

function bottleRow(kit, w, y, z) {
  const r = kit.rand;
  let x = -w / 2 + 0.12;
  const hues = [[0x6fd08a], [0x7eb6ef], [0xe0605a], [0xd4a03a], [0xb08ae0]];
  while (x < w / 2 - 0.12) {
    const h = 0.16 + r() * 0.14;
    const col = hues[Math.floor(r() * hues.length)];
    kit.cyl("glowPotion", 0.065, 0.075, h, 6, col, x, y + h / 2, z);
    kit.cyl("interior", 0.025, 0.03, 0.06, 5, TIMBER_M, x, y + h + 0.03, z);
    x += 0.17 + r() * 0.06;
  }
}

// A sagging cord from (ax, az) to (bx, bz) at height y, drawn as short straight pieces.
function stringLine(kit, role, ax, az, bx, bz, y, sagMax, n) {
  for (let i = 0; i < n; i++) {
    const t0 = i / n;
    const t1 = (i + 1) / n;
    const x0 = ax + (bx - ax) * t0;
    const z0 = az + (bz - az) * t0;
    const x1 = ax + (bx - ax) * t1;
    const z1 = az + (bz - az) * t1;
    const y0 = y - Math.sin(t0 * Math.PI) * sagMax;
    const y1 = y - Math.sin(t1 * Math.PI) * sagMax;
    const h = Math.hypot(x1 - x0, z1 - z0);
    const len = Math.hypot(h, y1 - y0);
    kit.box(role, 0.02, 0.02, len, [0xe7d7b4], (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, Math.atan2(x1 - x0, z1 - z0), -Math.atan2(y1 - y0, h));
  }
}

const FURNITURE = {
  counter(kit, f) {
    kit.box("interior", f.w, f.h - 0.08, f.d, TIMBER_M, 0, (f.h - 0.08) / 2, 0);
    kit.box("interior", f.w + 0.12, 0.08, f.d + 0.12, TIMBER_L, 0, f.h - 0.04, 0);
    for (let x = -f.w / 2 + 0.3; x < f.w / 2; x += 0.6) {
      kit.box("interior", 0.08, f.h - 0.2, 0.04, TIMBER_D, x, (f.h - 0.08) / 2, f.d / 2 + 0.01);
    }
    if (f.bottles) bottleRow(kit, f.w * 0.5, f.h, -0.1);
    else {
      // Scales and a ledger.
      kit.box("interior", 0.5, 0.06, 0.36, [0xe7d7b4], -f.w * 0.25, f.h + 0.03, 0);
      kit.cyl("interior", 0.03, 0.03, 0.4, 5, GOLD, f.w * 0.25, f.h + 0.2, 0);
      kit.box("interior", 0.5, 0.03, 0.03, GOLD, f.w * 0.25, f.h + 0.4, 0);
      kit.cyl("interior", 0.11, 0.08, 0.05, 6, GOLD, f.w * 0.25 - 0.22, f.h + 0.28, 0);
      kit.cyl("interior", 0.11, 0.08, 0.05, 6, GOLD, f.w * 0.25 + 0.22, f.h + 0.28, 0);
    }
  },
  shelf(kit, f) {
    kit.box("interior", f.w, f.h, 0.06, TIMBER_D, 0, f.h / 2, -f.d / 2 + 0.03);
    kit.box("interior", 0.08, f.h, f.d, TIMBER_M, -f.w / 2 + 0.04, f.h / 2, 0);
    kit.box("interior", 0.08, f.h, f.d, TIMBER_M, f.w / 2 - 0.04, f.h / 2, 0);
    const levels = 4;
    for (let i = 0; i < levels; i++) {
      const y = 0.15 + i * (f.h - 0.3) / (levels - 1);
      kit.box("interior", f.w - 0.1, 0.05, f.d, TIMBER_L, 0, y, 0);
      if (i < levels - 1) {
        if (f.bottles) bottleRow(kit, f.w - 0.2, y + 0.025, 0);
        else goodsRow(kit, "interior", f.w - 0.2, y + 0.025, 0, f.d);
      }
    }
  },
  barrel(kit, f) {
    const r = Math.min(f.w, f.d) / 2 * 0.92;
    kit.cyl("interior", r * 0.9, r * 0.9, f.h, 8, TIMBER_M, 0, f.h / 2, 0);
    kit.cyl("interior", r, r, f.h * 0.5, 8, TIMBER_L, 0, f.h / 2, 0);
    kit.cyl("interior", r * 0.95, r * 0.95, 0.06, 8, IRON, 0, f.h * 0.2, 0);
    kit.cyl("interior", r * 0.95, r * 0.95, 0.06, 8, IRON, 0, f.h * 0.8, 0);
    if (f.coal) {
      for (let i = 0; i < 5; i++) kit.ball("interior", 0.1, [0x1c1c1e, 0x2a2a2c], (kit.rand() - 0.5) * r, f.h + 0.02, (kit.rand() - 0.5) * r);
    }
  },
  crates(kit, f) {
    const s = Math.min(f.w, f.d);
    kit.box("interior", s, s * 0.6, s, TIMBER_L, 0, s * 0.3, 0, 0.1);
    kit.box("interior", s * 0.7, s * 0.5, s * 0.7, TIMBER_M, 0.05, s * 0.6 + s * 0.25, 0, -0.25);
    kit.box("interior", s + 0.02, 0.06, 0.08, TIMBER_D, 0, s * 0.3, s / 2, 0.1);
  },
  table(kit, f) {
    kit.box("interior", f.w, 0.07, f.d, TIMBER_L, 0, f.h - 0.035, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      kit.box("interior", 0.08, f.h - 0.07, 0.08, TIMBER_D, sx * (f.w / 2 - 0.1), (f.h - 0.07) / 2, sz * (f.d / 2 - 0.1));
    }
    if (f.goods) goodsRow(kit, "interior", f.w - 0.2, f.h, 0, f.d);
    if (f.stools) {
      for (const sz of [-1, 1]) {
        kit.cyl("interior", 0.18, 0.18, 0.06, 6, TIMBER_L, 0, 0.45, sz * (f.d / 2 + 0.35));
        kit.cyl("interior", 0.05, 0.05, 0.42, 5, TIMBER_D, 0, 0.21, sz * (f.d / 2 + 0.35));
      }
      kit.cyl("interior", 0.07, 0.06, 0.16, 6, [0xb8b2a4], 0.15, f.h + 0.08, 0);
      kit.ball("interior", 0.12, [0xd8b968], -0.2, f.h + 0.06, 0.05, 1, 0.6, 1);
    }
    if (f.herbs) {
      for (let i = 0; i < 5; i++) {
        kit.cyl("interior", 0.06, 0.02, 0.32, 5, [0x3e9a36, 0x67b84a, 0x8d7a3a], -f.w / 2 + 0.25 + i * 0.22, f.h + 0.05, (kit.rand() - 0.5) * 0.3, 0, 0, Math.PI / 2);
      }
      kit.cyl("interior", 0.14, 0.1, 0.1, 6, [0x8a8f93], f.w / 2 - 0.25, f.h + 0.05, 0);
    }
  },
  sacks(kit, f) {
    for (let i = 0; i < 3; i++) {
      kit.ball("interior", 0.36, BURLAP, (i % 2 - 0.5) * 0.3, 0.3 + (i === 2 ? 0.3 : 0), (i - 1) * 0.42, 1, 0.9, 1);
    }
  },
  rug(kit, f) {
    kit.box("interior", f.w, 0.02, f.d, [0x8e3a2e], 0, 0.01, 0);
    kit.box("interior", f.w - 0.3, 0.022, f.d - 0.3, [0xc98443], 0, 0.012, 0);
    kit.box("interior", f.w - 0.6, 0.024, f.d - 0.6, [0x6e2e28], 0, 0.013, 0);
  },
  forge(kit, f) {
    kit.box("interior", f.w, f.h, f.d, STONE, 0, f.h / 2, 0);
    kit.box("glowFire", f.w - 0.5, 0.08, f.d - 0.5, [0xff7a2a, 0xffa040, 0xff5a1a], 0, f.h + 0.02, 0);
    // Hood and flue up through the roof line.
    kit.cone("interior", f.w * 0.62, 1.1, 4, STONE_D, 0, f.h + 1.35, 0, Math.PI / 4);
    kit.box("interior", 0.8, 1.6, 0.8, STONE_D, 0, f.h + 2.6, 0);
    // Bellows.
    kit.box("interior", 0.5, 0.18, 0.8, [0x5a3a24], f.w / 2 + 0.35, 0.7, 0.1, 0, 0.18);
    kit.box("interior", 0.08, 0.7, 0.08, TIMBER_D, f.w / 2 + 0.35, 0.35, 0.1);
  },
  anvil(kit, f) {
    kit.cyl("interior", 0.32, 0.36, 0.5, 7, TIMBER_M, 0, 0.25, 0);
    kit.box("interior", 0.5, 0.12, 0.36, IRON, 0, 0.56, 0);
    kit.box("interior", 0.3, 0.12, 0.24, IRON, 0, 0.68, 0);
    kit.box("interior", 0.72, 0.14, 0.32, IRON, 0, 0.8, 0);
    kit.cone("interior", 0.13, 0.4, 5, IRON, 0.55, 0.8, 0, 0, 0, -Math.PI / 2);
  },
  trough(kit, f) {
    kit.box("interior", f.w, f.h, f.d, STONE, 0, f.h / 2, 0);
    kit.box("interior", f.w - 0.2, 0.04, f.d - 0.2, [0x3b6e8c, 0x356480], 0, f.h - 0.06, 0);
  },
  bench(kit, f) {
    kit.box("interior", f.w, 0.08, f.d, TIMBER_L, 0, f.h - 0.04, 0);
    kit.box("interior", 0.1, f.h - 0.08, f.d - 0.1, TIMBER_D, -f.w / 2 + 0.2, (f.h - 0.08) / 2, 0);
    kit.box("interior", 0.1, f.h - 0.08, f.d - 0.1, TIMBER_D, f.w / 2 - 0.2, (f.h - 0.08) / 2, 0);
    if (f.tools) {
      kit.box("interior", 0.4, 0.06, 0.1, IRON, -0.8, f.h + 0.03, 0);
      kit.box("interior", 0.06, 0.06, 0.34, TIMBER_M, -0.8, f.h + 0.03, 0.18);
      kit.box("interior", 0.5, 0.04, 0.06, IRON, 0.1, f.h + 0.02, -0.1, 0.4);
      kit.box("interior", 0.26, 0.22, 0.2, IRON, f.w / 2 - 0.4, f.h + 0.11, 0);
      kit.box("interior", f.w - 0.2, 0.9, 0.04, TIMBER_D, 0, f.h + 0.75, -f.d / 2 + 0.02);
      for (let i = 0; i < 6; i++) kit.box("interior", 0.05, 0.36, 0.04, IRON, -f.w / 2 + 0.4 + i * 0.45, f.h + 0.8, -f.d / 2 + 0.06);
    }
  },
  rack(kit, f) {
    kit.box("interior", 0.1, f.h, 0.1, TIMBER_D, -f.w / 2 + 0.05, f.h / 2, -f.d / 2 + 0.05);
    kit.box("interior", 0.1, f.h, 0.1, TIMBER_D, f.w / 2 - 0.05, f.h / 2, -f.d / 2 + 0.05);
    kit.box("interior", f.w, 0.08, 0.1, TIMBER_M, 0, f.h * 0.85, -f.d / 2 + 0.05);
    kit.box("interior", f.w, 0.08, 0.3, TIMBER_M, 0, 0.12, 0);
    for (let i = 0; i < 5; i++) {
      const x = -f.w / 2 + 0.35 + i * (f.w - 0.7) / 4;
      kit.box("interior", 0.06, 1.3, 0.025, STEEL, x, 0.9, -0.02, 0, -0.12);
      kit.box("interior", 0.22, 0.05, 0.05, GOLD, x, 0.3, 0.02);
    }
    kit.cyl("interior", 0.3, 0.3, 0.06, 6, [0x2d62c8], -f.w / 4, f.h * 0.85 + 0.35, -f.d / 2 + 0.12, 0, Math.PI / 2);
    kit.cyl("interior", 0.3, 0.3, 0.06, 6, [0xb64034], f.w / 4, f.h * 0.85 + 0.35, -f.d / 2 + 0.12, 0, Math.PI / 2);
  },
  grindstone(kit, f) {
    kit.box("interior", 0.1, 0.8, 0.1, TIMBER_D, -0.2, 0.4, 0);
    kit.box("interior", 0.1, 0.8, 0.1, TIMBER_D, 0.2, 0.4, 0);
    kit.cyl("interior", 0.42, 0.42, 0.14, 10, [0x9aa0a4, 0x8a8f93], 0, 0.75, 0, 0, 0, Math.PI / 2);
    kit.box("interior", 0.7, 0.2, 0.4, TIMBER_M, 0, 0.1, 0);
  },
  still(kit, f) {
    kit.box("interior", 1.2, 0.5, 1.2, STONE, 0, 0.25, 0);
    kit.box("glowFire", 0.5, 0.18, 0.06, [0xff7a2a, 0xffa040], 0, 0.2, 0.6);
    kit.cyl("interior", 0.55, 0.5, 0.75, 9, COPPER, 0, 0.88, 0);
    kit.ball("interior", 0.56, COPPER, 0, 1.25, 0, 1, 0.55, 1);
    kit.cone("interior", 0.22, 0.5, 8, COPPER, 0, 1.75, 0);
    kit.cyl("interior", 0.05, 0.05, 1.2, 6, COPPER, 0.45, 1.75, 0, 0, 0, -1.05);
    // Condenser barrel and coil.
    kit.cyl("interior", 0.32, 0.32, 0.9, 8, TIMBER_M, 0.0, 0.45, -0.1 + 0.0, 0, 0, 0);
    kit.cyl("interior", 0.06, 0.06, 0.3, 6, COPPER, 0.95, 1.2, 0, 0, 0, Math.PI / 2);
    kit.cyl("glowPotion", 0.12, 0.16, 0.3, 7, [0x6fd08a], 0.95, 0.15, 0.55);
  },
  cauldron(kit, f) {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      kit.ball("interior", 0.18, STONE, Math.cos(a) * 0.38, 0.1, Math.sin(a) * 0.38);
    }
    kit.ball("interior", 0.5, IRON, 0, 0.5, 0, 1, 0.8, 1);
    kit.cyl("glowPotion", 0.42, 0.42, 0.04, 9, [0x6fd08a, 0x58c070], 0, 0.78, 0);
    kit.box("interior", 0.06, 0.9, 0.06, TIMBER_L, 0.15, 1.05, 0, 0, 0, 0.4);
  },
  lectern(kit, f) {
    kit.box("interior", 0.5, 0.08, 0.4, TIMBER_D, 0, 0.04, 0);
    kit.box("interior", 0.14, f.h - 0.1, 0.14, TIMBER_M, 0, (f.h - 0.1) / 2, 0);
    kit.box("interior", f.w, 0.06, f.d, TIMBER_L, 0, f.h, 0, 0, 0.35);
    kit.box("interior", 0.6, 0.06, 0.42, [0xe7d7b4], 0, f.h + 0.06, 0.02, 0, 0.35);
  },
  dummy(kit, f) {
    kit.box("interior", 0.12, f.h, 0.12, TIMBER_D, 0, f.h / 2, 0);
    kit.cyl("interior", 0.26, 0.22, 0.75, 7, STRAW, 0, 1.15, 0);
    kit.box("interior", 1.0, 0.1, 0.1, TIMBER_M, 0, 1.4, 0);
    kit.ball("interior", 0.2, BURLAP, 0, f.h - 0.1, 0);
    kit.cyl("interior", 0.35, 0.4, 0.1, 7, STONE, 0, 0.05, 0);
  },
  brazier(kit, f) {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      kit.box("interior", 0.05, f.h - 0.2, 0.05, IRON, Math.cos(a) * 0.18, (f.h - 0.2) / 2, Math.sin(a) * 0.18, -a, 0, 0);
    }
    kit.cyl("interior", 0.3, 0.16, 0.22, 7, IRON, 0, f.h - 0.1, 0);
    kit.cone("glowFire", 0.2, 0.42, 5, [0xff8a2a, 0xffc060], 0, f.h + 0.2, 0);
  },
  kegs(kit, f) {
    kit.box("interior", f.w, 0.3, f.d, TIMBER_D, 0, 0.15, 0);
    for (let i = 0; i < 3; i++) {
      const x = -f.w / 3 + i * f.w / 3;
      kit.cyl("interior", 0.32, 0.32, f.d - 0.05, 8, TIMBER_M, x, 0.62, 0, 0, Math.PI / 2);
      kit.cyl("interior", 0.04, 0.04, 0.16, 5, GOLD, x, 0.5, f.d / 2 + 0.02, 0, Math.PI / 2);
    }
    kit.box("interior", f.w, 0.06, f.d, TIMBER_L, 0, 1.0, 0);
    for (let i = 0; i < 6; i++) kit.cyl("interior", 0.08, 0.07, 0.2, 6, [0xb8b2a4, 0x8d5b34], -f.w / 2 + 0.3 + i * 0.55, 1.13, 0);
  },
  fireplace(kit, f) {
    kit.box("interior", f.w, f.h, f.d, STONE, 0, f.h / 2, 0);
    kit.box("interior", 1.2, 0.9, 0.2, [0x1c1c1e], 0, 0.5, f.d / 2 - 0.05);
    kit.cone("glowFire", 0.3, 0.6, 5, [0xff8a2a, 0xffc060], 0, 0.35, f.d / 2 - 0.1);
    kit.box("interior", f.w + 0.3, 0.14, f.d + 0.2, TIMBER_D, 0, 1.2, 0.05);
    const top = f.top || 3.6;
    kit.box("interior", f.w * 0.7, top - f.h, f.d * 0.8, STONE, 0, f.h + (top - f.h) / 2, -0.05);
  },
  bankCounter(kit, f) {
    kit.box("interior", f.w, f.h - 0.08, f.d, STONE, 0, (f.h - 0.08) / 2, 0);
    kit.box("interior", f.w + 0.12, 0.08, f.d + 0.12, TIMBER_D, 0, f.h - 0.04, 0);
    // Brass grille with a pass-through.
    kit.box("interior", f.w, 0.06, 0.06, GOLD, 0, f.h + 1.0, 0);
    for (let x = -f.w / 2 + 0.1; x <= f.w / 2; x += 0.22) {
      if (Math.abs(x) < 0.35) continue;
      kit.box("interior", 0.03, 1.0, 0.03, GOLD, x, f.h + 0.5, 0);
    }
    kit.box("interior", 0.42, 0.5, 0.36, [0xe7d7b4], -1.2, f.h + 0.03, 0.05);
    kit.cyl("interior", 0.03, 0.03, 0.22, 5, [0xf4e7c8], 1.6, f.h + 0.11, 0);
    kit.cone("glowFire", 0.03, 0.06, 4, [0xffc060], 1.6, f.h + 0.25, 0);
  },
  vault(kit, f) {
    kit.box("interior", f.w + 0.4, f.h + 0.3, 0.1, STONE_D, 0, (f.h + 0.3) / 2, 0);
    kit.cyl("interior", f.w / 2, f.w / 2, 0.14, 12, IRON, 0, f.h / 2 + 0.1, 0.08, 0, Math.PI / 2);
    kit.cyl("interior", 0.22, 0.22, 0.08, 8, GOLD, 0, f.h / 2 + 0.1, 0.18, 0, Math.PI / 2);
    for (let k = 0; k < 4; k++) {
      kit.box("interior", 0.05, 0.5, 0.05, GOLD, 0, f.h / 2 + 0.1, 0.24, 0, 0, k * Math.PI / 4);
    }
  },
  bed(kit, f) {
    kit.box("interior", f.w, 0.32, f.d, TIMBER_M, 0, 0.16, 0);
    kit.box("interior", f.w - 0.1, 0.16, f.d - 0.15, [0xe7d7b4], 0, 0.4, 0.05);
    kit.box("interior", f.w - 0.08, 0.12, f.d * 0.6, [0x8e3a2e, 0x2d62c8][Math.floor(kit.rand() * 2)], 0, 0.5, f.d * 0.18);
    kit.box("interior", f.w * 0.6, 0.12, 0.3, [0xf4e7c8], 0, 0.52, -f.d / 2 + 0.3);
    kit.box("interior", f.w, 0.9, 0.1, TIMBER_D, 0, 0.45, -f.d / 2 + 0.05);
  },
  chest(kit, f) {
    kit.box("interior", f.w, f.h * 0.75, f.d, TIMBER_M, 0, f.h * 0.375, 0);
    kit.box("interior", f.w + 0.04, f.h * 0.25, f.d + 0.04, TIMBER_L, 0, f.h * 0.875, 0);
    kit.box("interior", f.w + 0.06, 0.05, f.d + 0.06, IRON, 0, f.h * 0.75, 0);
    kit.box("interior", 0.08, 0.1, 0.04, GOLD, 0, f.h * 0.7, f.d / 2 + 0.03);
  },
  wardrobe(kit, f) {
    kit.box("interior", f.w, f.h, f.d, TIMBER_M, 0, f.h / 2, 0);
    kit.box("interior", 0.04, f.h - 0.2, 0.04, TIMBER_D, 0, f.h / 2, f.d / 2 + 0.01);
    kit.box("interior", f.w + 0.1, 0.1, f.d + 0.1, TIMBER_D, 0, f.h + 0.05, 0);
  },
  coffer(kit, f) {
    kit.box("interior", f.w, 0.22, f.d, TIMBER_D, 0, f.h + 0.11, 0);
    for (let i = 0; i < 6; i++) kit.cyl("interior", 0.06, 0.06, 0.02, 7, GOLD, (i % 3 - 1) * 0.13, f.h + 0.24 + Math.floor(i / 3) * 0.025, (i % 2 - 0.5) * 0.1);
  },
  trophy(kit, f) {
    // A relic from the deep: a dark plaque, a gold rim, and a glowing shard.
    kit.box("interior", f.w, 0.8, 0.08, TIMBER_D, 0, f.h, 0);
    kit.box("interior", f.w + 0.1, 0.9, 0.05, GOLD, 0, f.h, -0.03);
    kit.cone("glowFire", 0.16, 0.5, 4, [0xff8a2a, 0xffc060], 0, f.h, 0.12, 0, 0, Math.PI);
    kit.cone("interior", 0.08, 0.5, 4, IRON, -f.w / 2 + 0.2, f.h + 0.15, 0.1, 0, 0, 0.6);
    kit.cone("interior", 0.08, 0.5, 4, IRON, f.w / 2 - 0.2, f.h + 0.15, 0.1, 0, 0, -0.6);
  },
  armorStand(kit, f) {
    kit.cyl("interior", 0.3, 0.34, 0.08, 7, TIMBER_D, 0, 0.04, 0);
    kit.box("interior", 0.08, 1.4, 0.08, TIMBER_D, 0, 0.75, 0);
    kit.box("interior", 0.62, 0.7, 0.36, STEEL, 0, 1.2, 0);
    kit.box("interior", 0.66, 0.1, 0.4, GOLD, 0, 0.88, 0);
    kit.ball("interior", 0.2, STEEL, -0.36, 1.48, 0);
    kit.ball("interior", 0.2, STEEL, 0.36, 1.48, 0);
    kit.cone("interior", 0.2, 0.36, 6, STEEL, 0, 1.75, 0);
  },
  herbRack(kit, f) {
    kit.box("interior", f.w, 0.06, 0.06, TIMBER_D, 0, f.h, 0);
    for (let i = 0; i < 7; i++) {
      const x = -f.w / 2 + 0.2 + i * (f.w - 0.4) / 6;
      kit.box("interior", 0.015, 0.3, 0.015, [0xb8984c], x, f.h - 0.15, 0);
      kit.cone("interior", 0.09, 0.32, 5, [0x3e9a36, 0x67b84a, 0x8d7a3a, 0xc7b0f0][i % 4], x, f.h - 0.42, 0, 0, 0, Math.PI);
    }
  },
  alembic(kit, f) {
    FURNITURE.table(kit, { w: f.w, d: f.d, h: f.h });
    kit.ball("glowPotion", 0.17, [0x7eb6ef], -0.15, f.h + 0.17, 0);
    kit.cyl("interior", 0.03, 0.03, 0.5, 5, COPPER, 0.08, f.h + 0.4, 0, 0, 0, -0.9);
    kit.ball("glowPotion", 0.1, [0xe0605a], 0.3, f.h + 0.1, 0);
  },
  crystal(kit, f) {
    kit.cyl("interior", 0.12, 0.14, 0.05, 6, GOLD, 0, f.h + 0.025, 0);
    kit.add("glowPotion", new THREE.OctahedronGeometry(0.13, 0), [0xb08ae0, 0x7eb6ef], 0, f.h + 0.2, 0);
  },
  banner(kit, f) {
    kit.box("interior", f.w + 0.2, 0.06, 0.06, TIMBER_D, 0, f.h, 0);
    kit.box("interior", f.w, 1.4, 0.03, [f.color || 0x2d62c8], 0, f.h - 0.75, 0);
    kit.cone("interior", f.w / 2, 0.35, 3, [f.color || 0x2d62c8], 0, f.h - 1.6, 0, 0, 0, Math.PI);
    kit.box("interior", f.w * 0.5, 0.06, 0.035, GOLD, 0, f.h - 0.5, 0.01);
  },
  bunting(kit, f) {
    // Two crossing strings of flags under the beams.
    const flags = [[0xb64034], [0xd4a03a], [0x2d62c8], [0x3e9a36]];
    for (const [ax, az, bx, bz] of [[-f.w / 2, -f.d / 2, f.w / 2, f.d / 2], [-f.w / 2, f.d / 2, f.w / 2, -f.d / 2]]) {
      const n = 14;
      stringLine(kit, "interior", ax, az, bx, bz, f.h + 0.13, 0.5, n);
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const sag = Math.sin(t * Math.PI) * 0.5;
        kit.cone("interior", 0.13, 0.26, 3, flags[i % 4], ax + (bx - ax) * t, f.h - sag, az + (bz - az) * t, Math.atan2(bx - ax, bz - az), 0, Math.PI);
      }
    }
  },
  tavernTable(kit, f) {
    const r = Math.min(f.w, f.d) / 2;
    kit.cyl("interior", r * 0.75, r * 0.75, 0.07, 8, TIMBER_L, 0, f.h - 0.035, 0);
    kit.cyl("interior", 0.08, 0.14, f.h - 0.07, 6, TIMBER_D, 0, (f.h - 0.07) / 2, 0);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.5;
      kit.cyl("interior", 0.2, 0.2, 0.06, 6, TIMBER_L, Math.cos(a) * r * 1.1, 0.45, Math.sin(a) * r * 1.1);
      kit.cyl("interior", 0.05, 0.05, 0.42, 5, TIMBER_D, Math.cos(a) * r * 1.1, 0.21, Math.sin(a) * r * 1.1);
    }
    kit.cyl("interior", 0.07, 0.06, 0.16, 6, [0xb8b2a4], 0.15, f.h + 0.08, 0.1);
  }
};

// ---------- signs ----------

const SIGN_ICON = {
  coin(kit) {
    for (let i = 0; i < 3; i++) kit.cyl("shell", 0.16, 0.16, 0.05, 8, GOLD, 0, -0.12 + i * 0.07, 0, 0, 0, Math.PI / 2);
  },
  anvil(kit) {
    kit.box("shell", 0.1, 0.1, 0.36, IRON, 0, 0.06, 0);
    kit.box("shell", 0.1, 0.12, 0.16, IRON, 0, -0.04, 0);
    kit.box("shell", 0.1, 0.06, 0.28, IRON, 0, -0.13, 0);
  },
  flask(kit) {
    kit.ball("glowPotion", 0.15, [0x6fd08a], 0, -0.06, 0, 0.6, 1, 1);
    kit.cyl("shell", 0.04, 0.04, 0.14, 5, [0xe7d7b4], 0, 0.12, 0);
  },
  ring(kit) {
    const g = new THREE.TorusGeometry(0.15, 0.04, 4, 8);
    g.rotateY(Math.PI / 2);
    kit.add("shell", g, GOLD, 0, 0, 0);
  },
  key(kit) {
    const g = new THREE.TorusGeometry(0.09, 0.03, 4, 8);
    g.rotateY(Math.PI / 2);
    kit.add("shell", g, GOLD, 0, 0.12, 0);
    kit.box("shell", 0.05, 0.05, 0.32, GOLD, 0, 0.12, -0.24);
    kit.box("shell", 0.05, 0.12, 0.05, GOLD, 0, 0.06, -0.33);
    kit.box("shell", 0.05, 0.09, 0.05, GOLD, 0, 0.07, -0.22);
  },
  tankard(kit) {
    kit.cyl("shell", 0.1, 0.11, 0.24, 7, [0xb8b2a4], 0, 0, 0);
    kit.box("shell", 0.05, 0.14, 0.06, [0xb8b2a4], 0, 0, -0.15);
  }
};

function buildSign(kit, base, b, door) {
  const m = sideMatrix(base, b, door.side);
  kit.setFrame(m);
  const flip = sideFlip(door.side);
  const a = (door.at + DOOR_W / 2 + 0.75) * flip;
  // Board centre just under door height: the bracket stays below the eave
  // overhang (wall top 3.76, roof edge about 3.3 at 0.5 m out) and the board's
  // bottom edge clears 2.2 m for anyone walking past.
  const y = DOOR_H - 0.05;
  kit.box("shell", 0.08, 0.08, 1.15, IRON, a, y + 0.42, 0.55);
  kit.box("shell", 0.06, 0.5, 0.06, IRON, a, y + 0.18, 0.08, 0, 0.7);
  kit.box("shell", 0.02, 0.18, 0.02, IRON, a, y + 0.32, 0.25);
  kit.box("shell", 0.02, 0.18, 0.02, IRON, a, y + 0.32, 0.85);
  kit.box("shell", 0.07, 0.6, 0.86, TIMBER_M, a, y, 0.55);
  kit.box("shell", 0.08, 0.66, 0.92, GOLD, a, y, 0.55);
  const icon = SIGN_ICON[b.sign];
  if (icon) {
    for (const side of [-1, 1]) {
      kit.setFrame(localMatrix(m, a + side * 0.07, y, 0.55, 0));
      icon(kit);
    }
  }
}

function tierRedirect(tier) {
  const role = "tier" + tier;
  return { interior: role, props: role, glowPotion: role, glowFire: role, glowLamp: role };
}

// ---------- one building ----------

function buildOne(kit, b) {
  const base = buildingMatrix(b);
  const H = wallHeight(b);
  const F = FLOOR_Y;
  const T = WALL_T;
  const U = b.upper || 0;
  const J = U ? (b.jetty || 0) : 0;
  const roofTone = tone(b.roofColor, 0.06);
  const stone = b.style === "stone";
  const WALL = stone ? ASHLAR : PLASTER;

  // Plinth and floor.
  kit.setFrame(base);
  kit.box("shell", b.w + 0.24, F + 0.28, b.d + 0.24, STONE, 0, (F - 0.02 - 0.3) / 2, 0);
  if (!b.closed) {
    for (let z = -b.d / 2 + T; z < b.d / 2 - T - 0.05; z += 0.34) {
      const dz = Math.min(0.33, b.d / 2 - T - z);
      kit.box("interior", b.w - 2 * T, 0.04, dz - 0.01, [pick(kit, PLANK)], 0, F - 0.02, z + dz / 2);
    }
  }

  // Walls, plaster in front, timber framing on both faces.
  const walls = wallBoxes(b);
  for (let i = 0; i < walls.length; i++) {
    const w = walls[i];
    kit.setFrame(base);
    kit.box("shell", w.hx * 2, H, w.hz * 2, WALL, w.x, F + H / 2, w.z);
    // Dark cap shown on the cut line when the walls are cut away around the hero.
    if (!b.closed) kit.box("cap", w.hx * 2 + 0.3, 0.05, w.hz * 2 + 0.3, [0x3a2416], w.x, F + CUTAWAY_H + 0.02, w.z);
  }
  const sides = ["front", "back", "left", "right"];
  for (let si = 0; si < sides.length; si++) {
    const side = sides[si];
    const L = sideLen(b, side);
    const flip = sideFlip(side);
    kit.setFrame(sideMatrix(base, b, side));
    const doors = b.doors.filter((d) => d.side === side);
    const wins = (b.windows || []).filter((w) => w.side === side);
    // Lintels over openings, door frames, sill step.
    for (const d of doors) {
      const a = d.at * flip;
      if (!b.closed) {
        kit.box("shell", DOOR_W, H - DOOR_H, T, WALL, a, DOOR_H + (H - DOOR_H) / 2, -T / 2);
        kit.box("shell", DOOR_W, 0.04, T, PLANK, a, -0.02, -T / 2);
        // Leaf swung open against the inside wall.
        kit.box("shell", 1.42, DOOR_H - 0.12, 0.08, TIMBER_M, a - DOOR_W / 2 - 0.71 * 1, (DOOR_H - 0.12) / 2, -T - 0.06);
        kit.box("shell", 0.08, 0.08, 0.06, GOLD, a - DOOR_W / 2 - 1.2, 1.1, -T - 0.12);
      } else {
        kit.box("shell", DOOR_W - 0.1, DOOR_H - 0.1, 0.08, TIMBER_M, a, (DOOR_H - 0.1) / 2, 0.04);
        kit.box("shell", 0.08, 0.08, 0.06, GOLD, a + 0.5, 1.1, 0.1);
      }
      // Frame lips 2 cm over the plaster jambs and lintel so the faces never share a plane.
      kit.box("shell", 0.22, DOOR_H + 0.1, 0.24, TIMBER_D, a - DOOR_W / 2 - 0.09, (DOOR_H + 0.1) / 2, 0.04);
      kit.box("shell", 0.22, DOOR_H + 0.1, 0.24, TIMBER_D, a + DOOR_W / 2 + 0.09, (DOOR_H + 0.1) / 2, 0.04);
      kit.box("shell", DOOR_W + 0.6, 0.24, 0.26, TIMBER_D, a, DOOR_H + 0.1, 0.05);
      kit.box("shell", DOOR_W + 0.5, 0.12, 0.75, STONE, a, -F + 0.06, 0.38);
      kit.box("shell", DOOR_W - 0.2, 0.05, 0.05, GOLD, a, DOOR_H + 0.25, 0.19);
    }
    // Posts: corners, beside doors, and fill so no plaster panel is wider than ~2.8 m.
    const blocked = [];
    for (const d of doors) blocked.push([d.at * flip - DOOR_W / 2 - 0.25, d.at * flip + DOOR_W / 2 + 0.25]);
    for (const w of wins) blocked.push([w.at * flip - 0.75, w.at * flip + 0.75]);
    const posts = [-L / 2 + 0.1, L / 2 - 0.1];
    const count = Math.max(1, Math.round(L / 2.6));
    for (let i = 1; i < count; i++) {
      const a = -L / 2 + (i * L) / count;
      let ok = true;
      for (const r of blocked) if (a > r[0] && a < r[1]) ok = false;
      if (ok) posts.push(a);
    }
    for (const a of posts) {
      if (stone) {
        // Quoins at the corners only.
        if (Math.abs(Math.abs(a) - (L / 2 - 0.1)) > 1e-6) continue;
        for (let y = 0.2; y < H; y += 0.5) kit.box("shell", 0.34, 0.24, 0.24, STONE, a, y, 0.06);
        continue;
      }
      kit.box("shell", 0.22, H, 0.2, TIMBER_D, a, H / 2, 0.06);
      kit.box("shell", 0.2, H, 0.14, TIMBER_M, a, H / 2, -T - 0.05);
    }
    kit.box("shell", L + 0.1, 0.22, 0.24, TIMBER_D, 0, H - 0.11, 0.07);
    kit.box("shell", L - 2 * T, 0.2, 0.16, TIMBER_M, 0, H - 0.3, -T - 0.06);
    // Sill rail, broken at doors.
    const cuts = doors.map((d) => [d.at * flip - DOOR_W / 2 - 0.2, d.at * flip + DOOR_W / 2 + 0.2]).sort((p, q) => p[0] - q[0]);
    let start = -L / 2;
    const rails = [];
    for (const c of cuts) { rails.push([start, c[0]]); start = c[1]; }
    rails.push([start, L / 2]);
    for (const r of rails) {
      if (r[1] - r[0] < 0.1) continue;
      kit.box("shell", r[1] - r[0], 0.16, 0.2, stone ? STONE_D : TIMBER_M, (r[0] + r[1]) / 2, 0.42, 0.06);
    }
    // Braces in the outermost free panels.
    posts.sort((p, q) => p - q);
    for (let i = 0; i + 1 < posts.length; i++) {
      const a0 = posts[i];
      const a1 = posts[i + 1];
      const span = a1 - a0;
      if (span < 1.4 || span > 3.4) continue;
      let ok = true;
      for (const r of blocked) if (r[1] > a0 && r[0] < a1) ok = false;
      if (stone || !ok || (i !== 0 && i + 2 !== posts.length)) continue;
      const len = Math.hypot(span - 0.2, H * 0.62);
      const ang = Math.atan2(H * 0.62, span - 0.2) * (i === 0 ? 1 : -1);
      kit.box("shell", len, 0.16, 0.16, TIMBER_D, (a0 + a1) / 2, 0.5 + H * 0.31, 0.05, 0, 0, ang);
    }
    // Windows: frame, glass, shutters, sill, flower box on the front.
    for (const w of wins) {
      const a = w.at * flip;
      const y = 1.75;
      kit.box("glowWindow", 1.0, 1.15, 0.04, [0xf6d59a, 0xf0c884], a, y, 0.01);
      kit.box("shell", 1.2, 0.12, 0.16, TIMBER_D, a, y + 0.64, 0.05);
      kit.box("shell", 1.3, 0.1, 0.26, TIMBER_L, a, y - 0.62, 0.09);
      kit.box("shell", 0.1, 1.2, 0.14, TIMBER_D, a - 0.55, y, 0.05);
      kit.box("shell", 0.1, 1.2, 0.14, TIMBER_D, a + 0.55, y, 0.05);
      kit.box("shell", 0.06, 1.15, 0.1, TIMBER_D, a, y, 0.05);
      kit.box("shell", 0.5, 1.2, 0.06, TIMBER_M, a - 0.88, y, 0.1, 0, 0, 0);
      kit.box("shell", 0.5, 1.2, 0.06, TIMBER_M, a + 0.88, y, 0.1, 0, 0, 0);
      kit.box("glowWindow", 1.0, 1.15, 0.04, [0xf6d59a, 0xf0c884], a, y, -T - 0.01);
      kit.box("shell", 1.2, 0.08, 0.2, TIMBER_L, a, y - 0.62, -T - 0.08);
      if (side === "front") {
        kit.box("shell", 1.1, 0.24, 0.3, TIMBER_M, a, y - 0.82, 0.22);
        for (let k = 0; k < 5; k++) {
          kit.ball("shell", 0.09, [[0xffe14a], [0xf2a3c2], [0xff8d6a], [0xfff6e4], [0xc7b0f0]][k], a - 0.4 + k * 0.2, y - 0.62, 0.22);
        }
      }
    }
  }

  // Upper storey (jettied), roof, gables, chimneys: the cut-away "upper" role.
  kit.setFrame(base);
  const top = F + H;
  if (U) {
    const uw = b.w + 2 * J;
    const ud = b.d + 2 * J;
    if (b.stairs) buildUpperRoom(kit, b, base, uw, ud, top, U);
    else kit.box("upper", uw, U, ud, PLASTER, 0, top + U / 2, 0);
    // Sill and plate beams wrap the outside of the storey (a ring, not a slab).
    // They stand 2 cm proud of the plaster's top and bottom (posts 1 cm) to avoid z-fighting.
    for (const [y, h] of [[top + 0.1, 0.24], [top + U - 0.08, 0.2]]) {
      kit.box("upper", uw + 0.1, h, 0.16, TIMBER_D, 0, y, ud / 2 + 0.03);
      kit.box("upper", uw + 0.1, h, 0.16, TIMBER_D, 0, y, -ud / 2 - 0.03);
      kit.box("upper", 0.16, h, ud + 0.1, TIMBER_D, uw / 2 + 0.03, y, 0);
      kit.box("upper", 0.16, h, ud + 0.1, TIMBER_D, -uw / 2 - 0.03, y, 0);
    }
    for (let x = -uw / 2 + 0.1; x <= uw / 2; x += uw / Math.max(2, Math.round(uw / 2.2))) {
      kit.box("upper", 0.2, U + 0.02, 0.2, TIMBER_D, x, top + U / 2, ud / 2 + 0.02);
      kit.box("upper", 0.2, U + 0.02, 0.2, TIMBER_D, x, top + U / 2, -ud / 2 - 0.02);
    }
    for (let z = -ud / 2 + 0.1; z <= ud / 2; z += ud / Math.max(2, Math.round(ud / 2.2))) {
      kit.box("upper", 0.2, U + 0.02, 0.2, TIMBER_D, -uw / 2 - 0.02, top + U / 2, z);
      kit.box("upper", 0.2, U + 0.02, 0.2, TIMBER_D, uw / 2 + 0.02, top + U / 2, z);
    }
    for (const sgn of [-1, 1]) {
      for (const a of [-b.w / 4, b.w / 4]) {
        kit.box("glowWindow", 0.9, 0.9, 0.04, [0xf6d59a], a, top + U / 2 + 0.1, sgn * (ud / 2 + 0.01));
        kit.box("upper", 1.1, 0.1, 0.2, TIMBER_L, a, top + U / 2 - 0.4, sgn * (ud / 2 + 0.08));
        kit.box("upper", 1.1, 0.1, 0.14, TIMBER_D, a, top + U / 2 + 0.6, sgn * (ud / 2 + 0.06));
      }
    }
    // Joist ends under the jetty.
    for (let x = -b.w / 2 + 0.4; x < b.w / 2; x += 0.8) {
      kit.box("shell", 0.14, 0.14, J + 0.3, TIMBER_D, x, top - 0.08, b.d / 2 + J / 2);
      kit.box("shell", 0.14, 0.14, J + 0.3, TIMBER_D, x, top - 0.08, -b.d / 2 - J / 2);
    }
  }
  const Y0 = top + U;
  const halfD = b.d / 2 + J;
  const over = 0.5;
  const rise = b.roofH;
  const slope = rise / halfD;
  const eaveY = Y0 - slope * over;
  const runZ = halfD + over;
  const ang = Math.atan(slope);
  const slabLen = runZ / Math.cos(ang);
  const roofW = b.w + 2 * J + 0.8;
  const th = 0.2;
  const shingle = [new THREE.Color(b.roofColor).multiplyScalar(0.78).getHex()];
  for (const sgn of [-1, 1]) {
    // Underside runs from the ridge (z 0, Y0 + rise) to the eave (runZ, eaveY);
    // the slab centre sits half a thickness out along the outward normal.
    const cy = (eaveY + Y0 + rise) / 2 + (th / 2) * Math.cos(ang);
    const cz = sgn * (runZ / 2 + (th / 2) * Math.sin(ang));
    kit.box("upper", roofW, th, slabLen, roofTone, 0, cy, cz, 0, sgn * ang);
    for (let k = 1; k < 5; k++) {
      const t = k / 5;
      const y = Y0 + rise - slope * runZ * t + th / Math.cos(ang) + 0.01;
      kit.box("upper", roofW + 0.02, 0.05, 0.1, shingle, 0, y, sgn * runZ * t, 0, sgn * ang);
    }
  }
  kit.box("upper", roofW + 0.1, 0.16, 0.36, TIMBER_D, 0, Y0 + rise + 0.16, 0);
  // Gables.
  const shape = new THREE.Shape();
  shape.moveTo(-halfD, 0);
  shape.lineTo(halfD, 0);
  shape.lineTo(0, rise);
  shape.lineTo(-halfD, 0);
  for (const sgn of [-1, 1]) {
    const g = new THREE.ExtrudeGeometry(shape, { depth: T, bevelEnabled: false });
    g.rotateY(Math.PI / 2);
    const x = sgn * (b.w / 2 + J) - (sgn > 0 ? T : 0);
    kit.add("upper", g, WALL, x, Y0, 0);
    kit.box("upper", 0.18, rise * 0.9, 0.18, TIMBER_D, sgn * (b.w / 2 + J + 0.02), Y0 + rise * 0.45, 0);
    kit.box("upper", 0.16, 0.16, halfD * 2, TIMBER_D, sgn * (b.w / 2 + J + 0.02), Y0 + 0.08, 0);
    if (!U) kit.box("glowWindow", 0.6, 0.6, 0.04, [0xf6d59a], sgn * (b.w / 2 + J + 0.02), Y0 + rise * 0.35, 0, Math.PI / 2);
  }
  const smoke = [];
  for (const c of b.chimneys || []) {
    const s = c.big ? 1.1 : 0.7;
    const hTop = Y0 + rise + 1.0;
    const h = hTop - (F + H - 0.5);
    kit.box("upper", s, h, s, STONE, c.x, F + H - 0.5 + h / 2, c.z);
    kit.box("upper", s + 0.16, 0.14, s + 0.16, STONE_D, c.x, hTop, c.z);
    const p = localToWorld(b, c.x, c.z);
    smoke.push({ x: p.x, y: hTop + 0.2, z: p.z, big: !!c.big });
  }

  // Sign over the main door. Its own role, so it survives a Blender-built shell.
  if (b.sign) {
    kit.redirect = { shell: "sign" };
    buildSign(kit, base, b, b.doors[0]);
    kit.redirect = null;
  }

  // Interior furniture. Depth-tier pieces go to their tier mesh.
  for (const f of b.furniture || []) {
    const fn = FURNITURE[f.type];
    if (!fn) continue;
    kit.setFrame(localMatrix(base, f.x, F, f.z, f.yaw || 0));
    if (f.tier) kit.redirect = tierRedirect(f.tier);
    fn(kit, f);
    kit.redirect = null;
  }
  if (b.ring) {
    kit.setFrame(localMatrix(base, b.ring.x, F, b.ring.z, 0));
    kit.cyl("interior", b.ring.r + 0.4, b.ring.r + 0.45, 0.04, 16, STONE, 0, 0.02, 0);
    kit.cyl("interior", 0.6, 0.6, 0.05, 8, GOLD, 0, 0.035, 0);
    for (let i = 0; i < b.ring.stones; i++) {
      const a = ((i + 0.5) / b.ring.stones) * Math.PI * 2 + Math.PI / 2;
      const h = i % 2 ? 0.6 : 1.05;
      kit.cyl("interior", 0.27, 0.34, h, 5, STONE, Math.cos(a) * b.ring.r, h / 2, Math.sin(a) * b.ring.r);
    }
  }
  if (b.stairs) buildStairs(kit, b, base);
  if (b.yard) buildYard(kit, b, base);
  return { smoke };
}

// Upper room: floor slab with a stairwell, four walls with windows inside and out,
// a rail around the stairwell, and the upstairs furniture (all cut away with the walls).
// The walls are exterior ("upper"); the room inside is "room" and "roomWindow", which
// a Blender-built exterior keeps.
function buildUpperRoom(kit, b, base, uw, ud, top, U) {
  const T = WALL_T;
  const s = b.stairs;
  const sx0 = s.x - STAIR_W / 2;
  const sx1 = s.x + STAIR_W / 2;
  const sz0 = Math.min(s.z0, s.z1);
  const sz1 = Math.max(s.z0, s.z1);
  const x0 = -uw / 2 + T;
  const x1 = uw / 2 - T;
  const z0 = -ud / 2 + T;
  const z1 = ud / 2 - T;
  const slab = (ax, bx, az, bz) => {
    if (bx - ax < 0.01 || bz - az < 0.01) return;
    kit.box("room", bx - ax, 0.2, bz - az, [0xa4825a, 0x9a7a52], (ax + bx) / 2, top - 0.1, (az + bz) / 2);
  };
  slab(x0, sx0, z0, z1);
  slab(sx1, x1, z0, z1);
  slab(sx0, sx1, z0, sz0);
  slab(sx0, sx1, sz1, z1);
  for (let x = x0 + 0.17; x < x1; x += 0.34) {
    if (x > sx0 - 0.17 && x < sx1 + 0.17) continue;
    kit.box("room", 0.02, 0.012, z1 - z0, [0x5e3b22], x, top + 0.006, (z0 + z1) / 2);
  }
  // Walls.
  kit.box("upper", uw, U, T, PLASTER, 0, top + U / 2, ud / 2 - T / 2);
  kit.box("upper", uw, U, T, PLASTER, 0, top + U / 2, -ud / 2 + T / 2);
  kit.box("upper", T, U, ud - 2 * T, PLASTER, -uw / 2 + T / 2, top + U / 2, 0);
  kit.box("upper", T, U, ud - 2 * T, PLASTER, uw / 2 - T / 2, top + U / 2, 0);
  for (const sgn of [-1, 1]) {
    for (const a of [-b.w / 4, b.w / 4]) {
      kit.box("roomWindow", 0.9, 0.9, 0.04, [0xf6d59a], a, top + U / 2 + 0.1, sgn * (ud / 2 - T - 0.01));
      kit.box("room", 1.1, 0.08, 0.16, TIMBER_L, a, top + U / 2 - 0.4, sgn * (ud / 2 - T - 0.08));
    }
    kit.box("room", uw - 2 * T, 0.18, 0.14, TIMBER_M, 0, top + U - 0.3, sgn * (ud / 2 - T - 0.07));
  }
  // Stairwell rail on the room side and the low end.
  const room = s.x < 0 ? 1 : -1;
  const rx = s.x + room * (STAIR_W / 2 + 0.05);
  const low = s.z0;
  const high = s.z1;
  kit.box("room", 0.08, 0.08, Math.abs(high - low), TIMBER_L, rx, top + 0.95, (low + high) / 2);
  kit.box("room", STAIR_W + 0.1, 0.08, 0.08, TIMBER_L, s.x, top + 0.95, low - Math.sign(high - low) * 0.05);
  for (let k = 0; k <= 6; k++) {
    const z = low + (high - low) * (k / 6);
    kit.box("room", 0.07, 0.95, 0.07, TIMBER_D, rx, top + 0.475, z);
  }
  for (let k = 0; k <= 3; k++) {
    kit.box("room", 0.07, 0.95, 0.07, TIMBER_D, s.x - STAIR_W / 2 + k * STAIR_W / 3, top + 0.475, low - Math.sign(high - low) * 0.05);
  }
  // Upstairs furniture rides in the cut-away room role.
  kit.redirect = { interior: "room", glowPotion: "room", glowFire: "room" };
  for (const f of b.upperFurniture || []) {
    const fn = FURNITURE[f.type];
    if (!fn) continue;
    kit.setFrame(localMatrix(base, f.x, top, f.z, f.yaw || 0));
    fn(kit, f);
  }
  kit.redirect = null;
  kit.setFrame(base);
  // Caps for the upstairs cut line.
  const cy = top + CUTAWAY_H + 0.02;
  kit.box("cap1", uw + 0.3, 0.05, T + 0.3, [0x3a2416], 0, cy, ud / 2 - T / 2);
  kit.box("cap1", uw + 0.3, 0.05, T + 0.3, [0x3a2416], 0, cy, -ud / 2 + T / 2);
  kit.box("cap1", T + 0.3, 0.05, ud, [0x3a2416], -uw / 2 + T / 2, cy, 0);
  kit.box("cap1", T + 0.3, 0.05, ud, [0x3a2416], uw / 2 - T / 2, cy, 0);
}

// A straight flight from (x, z0) on the floor to (x, z1) at the upstairs floor.
function buildStairs(kit, b, base) {
  const s = b.stairs;
  const F = FLOOR_Y;
  const rise = levelTop(b) - F;
  const n = Math.ceil(rise / 0.2);
  const run = (s.z1 - s.z0) / n;
  kit.setFrame(base);
  for (let k = 0; k < n; k++) {
    const topY = F + rise * (k + 1) / n;
    const zc = s.z0 + run * (k + 0.5);
    kit.box("interior", STAIR_W, topY - F, Math.abs(run) + 0.01, TIMBER_M, s.x, (topY + F) / 2, zc);
    kit.box("interior", STAIR_W + 0.04, 0.05, Math.abs(run) * 0.35, TIMBER_L, s.x, topY - 0.02, zc + run * 0.35);
  }
  // Handrail on the open side.
  const room = s.x < 0 ? 1 : -1;
  const rx = s.x + room * (STAIR_W / 2 + 0.05);
  const len = Math.hypot(s.z1 - s.z0, rise);
  const ang = Math.atan2(rise, Math.abs(s.z1 - s.z0)) * Math.sign(s.z0 - s.z1);
  kit.box("interior", 0.08, 0.08, len, TIMBER_L, rx, F + rise / 2 + 0.95, (s.z0 + s.z1) / 2, 0, ang);
  for (let k = 1; k <= 5; k++) {
    const t = k / 6;
    kit.box("interior", 0.07, 0.95, 0.07, TIMBER_D, rx, F + rise * t + 0.475, s.z0 + (s.z1 - s.z0) * t);
  }
  kit.box("interior", 0.12, 1.2, 0.12, TIMBER_D, rx, F + 0.6, s.z0);
}

// Cottage yard: picket fence with a gate gap, a vegetable patch, a washing line.
function buildYard(kit, b, base) {
  const y = b.yard;
  kit.setFrame(base);
  for (const f of y.fences) {
    const dx = f.x1 - f.x;
    const dz = f.z1 - f.z0;
    const len = Math.hypot(dx, dz);
    const yaw = Math.atan2(dx, dz);
    const mx = (f.x + f.x1) / 2;
    const mz = (f.z0 + f.z1) / 2;
    kit.box("props", 0.05, 0.07, len, TIMBER_L, mx, 0.35, mz, yaw);
    kit.box("props", 0.05, 0.07, len, TIMBER_L, mx, 0.75, mz, yaw);
    const posts = Math.max(1, Math.round(len / 0.45));
    for (let i = 0; i <= posts; i++) {
      const t = i / posts;
      kit.box("props", 0.09, 0.95, 0.06, TIMBER_M, f.x + dx * t, 0.47, f.z0 + dz * t, yaw);
      kit.cone("props", 0.065, 0.12, 4, TIMBER_M, f.x + dx * t, 1.0, f.z0 + dz * t, yaw + Math.PI / 4);
    }
  }
  const g = y.garden;
  kit.box("props", g.w, 0.18, g.d, [0x4a3024, 0x5a3a24], g.x, 0.09, g.z);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 5; c++) {
      const px = g.x - g.w / 2 + 0.3 + c * (g.w - 0.6) / 4;
      const pz = g.z - g.d / 2 + 0.35 + r * (g.d - 0.7) / 3;
      if (r % 2) kit.ball("props", 0.14, [0x3e9a36, 0x4eaf45], px, 0.28, pz, 1, 0.8, 1);
      else kit.cone("props", 0.1, 0.32, 5, [0x67b84a, 0x8bc85a], px, 0.33, pz);
    }
  }
  const l = y.line;
  kit.box("props", 0.09, 1.9, 0.09, TIMBER_D, l.x, 0.95, l.z0);
  kit.box("props", 0.09, 1.9, 0.09, TIMBER_D, l.x, 0.95, l.z1);
  kit.box("props", 0.02, 0.02, Math.abs(l.z1 - l.z0), [0xe7d7b4], l.x, 1.82, (l.z0 + l.z1) / 2);
  const cloth = [[0xf4e7c8], [0x2d62c8], [0xb64034], [0xd4a03a]];
  for (let i = 0; i < 4; i++) {
    const z = l.z0 + 0.5 + i * (Math.abs(l.z1 - l.z0) - 1) / 3;
    kit.box("props", 0.03, 0.55 + (i % 2) * 0.2, 0.45, cloth[i], l.x, 1.5 - (i % 2) * 0.1, z);
  }
}

// ---------- street props ----------

const PROP = {
  well(kit, p) {
    kit.cyl("props", p.r, p.r + 0.08, 0.85, 10, STONE, 0, 0.42, 0);
    kit.cyl("props", p.r - 0.18, p.r - 0.18, 0.05, 10, [0x2a4a5c], 0, 0.62, 0);
    for (const s of [-1, 1]) kit.box("props", 0.14, 2.9, 0.14, TIMBER_D, s * (p.r - 0.05), 1.45, 0);
    kit.box("props", p.r * 2 + 0.2, 0.1, 0.1, TIMBER_M, 0, 2.55, 0);
    kit.cone("props", p.r + 0.15, 0.7, 4, tone(0x6e2e28), 0, 3.0, 0, Math.PI / 4);
    kit.cyl("props", 0.16, 0.13, 0.24, 7, TIMBER_M, 0.15, 1.3, 0);
    kit.box("props", 0.02, 0.45, 0.02, [0x8a8f93], 0.15, 1.55, 0);
  },
  stall(kit, p) {
    const w = p.w;
    const d = p.d;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const h = sz < 0 ? 2.5 : 2.1;
      kit.box("props", 0.12, h, 0.12, TIMBER_D, sx * (w / 2 - 0.06), h / 2, sz * (d / 2 - 0.06));
    }
    kit.box("props", w - 0.1, 0.85, d * 0.7, TIMBER_M, 0, 0.42, 0.1);
    kit.box("props", w, 0.06, d * 0.75, TIMBER_L, 0, 0.88, 0.1);
    goodsRow(kit, "props", w - 0.3, 0.91, 0.1, d * 0.6);
    const stripes = 6;
    const ang = Math.atan2(0.45, d + 0.4);
    for (let i = 0; i < stripes; i++) {
      const col = i % 2 ? [0xf4e7c8] : [p.awning];
      kit.box("props", w / stripes + 0.01, 0.05, d + 0.6, col, -w / 2 + (i + 0.5) * (w / stripes), 2.33, 0.05, 0, ang);
    }
    for (let i = 0; i < stripes; i++) {
      const col = i % 2 ? [0xf4e7c8] : [p.awning];
      kit.box("props", w / stripes + 0.01, 0.3, 0.04, col, -w / 2 + (i + 0.5) * (w / stripes), 1.98, d / 2 + 0.33);
    }
  },
  bench(kit, p) {
    FURNITURE.bench(kit, { w: p.w, d: p.d, h: 0.48 });
    kit.box("props", p.w, 0.4, 0.06, TIMBER_L, 0, 0.75, -p.d / 2 + 0.03, 0, -0.15);
  },
  notice(kit, p) {
    for (const s of [-1, 1]) kit.box("props", 0.12, 2.2, 0.12, TIMBER_D, s * (p.w / 2 - 0.06), 1.1, 0);
    kit.box("props", p.w, 1.0, 0.08, TIMBER_M, 0, 1.5, 0);
    kit.cone("props", p.w * 0.72, 0.4, 4, tone(0x2f363e), 0, 2.25, 0, Math.PI / 4, 0, 0);
    const r = kit.rand;
    for (let i = 0; i < 5; i++) {
      kit.box("props", 0.24 + r() * 0.1, 0.3 + r() * 0.1, 0.02, [0xf4e7c8, 0xe7d7b4], -0.5 + i * 0.25, 1.5 + (r() - 0.5) * 0.4, 0.05 * (i % 2 ? 1 : -1) + (i % 2 ? 0.0 : 0.0) + 0.05, 0, 0, (r() - 0.5) * 0.2);
    }
  },
  // A painted town map on a post, with two finger-boards above (front is local +z).
  wayboard(kit, p) {
    const w = p.w;
    const CREAM = [0xf4e7c8, 0xe7d7b4];
    kit.box("props", 0.5, 0.16, 0.5, STONE, 0, 0.08, -0.08);
    kit.box("props", 0.16, 2.95, 0.16, TIMBER_D, 0, 1.475, -0.08);
    kit.cone("props", 0.14, 0.22, 4, TIMBER_D, 0, 3.06, -0.08, Math.PI / 4);
    kit.box("props", w, 0.86, 0.06, TIMBER_M, 0, 1.4, 0.02);
    for (const y of [0.95, 1.85]) kit.box("props", w + 0.08, 0.07, 0.1, TIMBER_D, 0, y, 0.02);
    for (const s of [-1, 1]) kit.box("props", 0.07, 0.97, 0.1, TIMBER_D, s * (w / 2 + 0.005), 1.4, 0.02);
    // the map: green wood, the grey square, the gate road north, roofs round it
    kit.box("props", w - 0.14, 0.72, 0.012, [0x5e8a3a, 0x568234], 0, 1.4, 0.056);
    kit.cyl("props", 0.1, 0.1, 0.012, 12, [0xb8b2a4], 0, 1.36, 0.064, 0, Math.PI / 2, 0);
    kit.box("props", 0.05, 0.3, 0.012, [0xc9a85a], 0, 1.6, 0.064);
    kit.box("props", 0.09, 0.09, 0.014, [0x2d62c8], 0, 1.71, 0.066, 0, 0, Math.PI / 4);
    const roofs = [0x6e2e28, 0x2f363e, 0x3d4a3a, 0x7a4a2a, 0x2f363e, 0x6e2e28];
    const spots = [[-0.3, 0.02], [0.3, 0.02], [-0.22, 0.2], [0.22, 0.2], [0, -0.24], [-0.22, -0.18]];
    for (let i = 0; i < spots.length; i++) kit.box("props", 0.1, 0.08, 0.014, [roofs[i]], spots[i][0], 1.36 + spots[i][1], 0.066);
    // finger-boards: one toward the square, one toward the gate
    for (const [y, s] of [[2.3, 1], [2.62, -1]]) {
      kit.box("props", 0.7, 0.15, 0.04, CREAM, s * 0.38, y, -0.08);
      kit.box("props", 0.11, 0.11, 0.04, CREAM, s * 0.73, y, -0.08, 0, 0, Math.PI / 4);
      kit.box("props", 0.4, 0.02, 0.045, [0x6b4428], s * 0.36, y, -0.08);
    }
  },
  cart(kit, p) {
    kit.box("props", p.w, 0.12, p.d - 0.6, TIMBER_L, 0, 0.75, -0.3);
    for (const s of [-1, 1]) kit.box("props", 0.08, 0.4, p.d - 0.6, TIMBER_M, s * (p.w / 2 - 0.04), 0.98, -0.3);
    kit.box("props", p.w - 0.2, 0.55, p.d - 0.9, STRAW, 0, 1.05, -0.3);
    for (const s of [-1, 1]) {
      kit.cyl("props", 0.5, 0.5, 0.1, 10, TIMBER_D, s * (p.w / 2 + 0.08), 0.5, -0.4, 0, 0, Math.PI / 2);
      kit.box("props", 0.08, 0.08, 1.4, TIMBER_M, s * 0.45, 0.6, p.d / 2 - 0.2, 0, -0.2);
    }
  },
  woodpile(kit, p) {
    for (let row = 0; row < 3; row++) {
      for (let i = 0; i < 6 - row; i++) {
        kit.cyl("props", 0.15, 0.15, p.d, 6, [0x6b4428, 0x8d5b34, 0x5a3a24], -p.w / 2 + 0.2 + (i + row * 0.5) * 0.32, 0.15 + row * 0.26, 0, 0, Math.PI / 2);
      }
    }
  },
  barrels(kit, p) {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      kit.setFrame(kit.frame.clone().multiply(new THREE.Matrix4().makeTranslation(Math.cos(a) * 0.38, 0, Math.sin(a) * 0.38)));
      FURNITURE.barrel(kit, { w: 0.62, d: 0.62, h: 0.85 });
      kit.setFrame(kit.frame.clone().multiply(new THREE.Matrix4().makeTranslation(-Math.cos(a) * 0.38, 0, -Math.sin(a) * 0.38)));
    }
  },
  trough(kit, p) {
    FURNITURE.trough(kit, { w: p.w, d: p.d, h: 0.65 });
  },
  statue(kit, p) {
    // The town raises a Warden in stone once the delves run deep.
    kit.cyl("props", p.r, p.r + 0.1, 0.5, 8, STONE, 0, 0.25, 0);
    kit.box("props", p.r * 1.3, 0.6, p.r * 1.3, STONE, 0, 0.8, 0);
    kit.box("props", p.r * 1.35, 0.06, 0.05, GOLD, 0, 0.9, p.r * 0.66);
    const st = [0x9aa0a4, 0x8a8f93];
    kit.box("props", 0.24, 0.9, 0.24, st, -0.16, 1.55, 0);
    kit.box("props", 0.24, 0.9, 0.24, st, 0.16, 1.55, 0);
    kit.box("props", 0.78, 0.7, 0.42, st, 0, 2.3, 0);
    kit.ball("props", 0.2, st, -0.46, 2.6, 0);
    kit.ball("props", 0.2, st, 0.46, 2.6, 0);
    kit.ball("props", 0.24, st, 0, 2.95, 0);
    kit.cone("props", 0.26, 0.34, 6, st, 0, 3.15, 0.03);
    kit.box("props", 0.06, 1.1, 0.04, st, 0.5, 2.6, -0.25, 0, -0.4);
    kit.cyl("props", 0.24, 0.24, 0.06, 6, st, -0.5, 2.4, -0.2, 0, Math.PI / 2);
  },
  bunting(kit, p) {
    // Flag strings from lamp to lamp across the square.
    const posts = [[8.4, -6.2], [-9.8, 1.0], [-8.4, -6.8], [9.6, 2.4], [2.6, 10.6], [-2.6, 10.6]];
    const flags = [[0xb64034], [0xd4a03a], [0x2d62c8], [0x3e9a36], [0xf4e7c8]];
    const pairs = [[0, 1], [2, 3], [4, 2], [5, 0]];
    // Poles on the lamp posts carry the strings well overhead.
    const top = 3.95;
    for (const [x, z] of posts) kit.cyl("props", 0.05, 0.07, top - 2.6, 6, TIMBER_D, x, (top + 2.6) / 2, z);
    let k = 0;
    for (const [a, c] of pairs) {
      const [ax, az] = posts[a];
      const [bx, bz] = posts[c];
      const n = Math.round(Math.hypot(bx - ax, bz - az) / 0.55);
      stringLine(kit, "props", ax, az, bx, bz, top - 0.1, 0.55, n);
      for (let i = 1; i < n; i++) {
        const t = i / n;
        const sag = Math.sin(t * Math.PI) * 0.55;
        kit.cone("props", 0.14, 0.3, 3, flags[k++ % 5], ax + (bx - ax) * t, top - 0.25 - sag, az + (bz - az) * t, Math.atan2(bx - ax, bz - az), 0, Math.PI);
      }
    }
  },
  lamp(kit, p) {
    kit.cyl("props", 0.1, 0.14, 2.8, 6, TIMBER_D, 0, 1.4, 0);
    kit.box("props", 0.6, 0.08, 0.08, TIMBER_D, 0.25, 2.7, 0);
    kit.box("props", 0.03, 0.2, 0.03, IRON, 0.5, 2.58, 0);
    kit.box("glowLamp", 0.22, 0.3, 0.22, [0xffe0a0], 0.5, 2.32, 0);
    kit.cone("props", 0.2, 0.18, 4, IRON, 0.5, 2.55, 0, Math.PI / 4);
    kit.cyl("props", 0.18, 0.2, 0.2, 6, STONE, 0, 0.1, 0);
  }
};

// ---------- ground ----------

function buildGround(kit) {
  kit.setFrame(new THREE.Matrix4());
  // Mortar disc under the cobbles.
  kit.cyl("ground", SQUARE_R + 0.3, SQUARE_R + 0.3, 0.06, 36, [0x5d5a52], 0, 0.02, 0);
  const s = 1.0;
  for (let x = -SQUARE_R; x <= SQUARE_R; x += s) {
    for (let z = -SQUARE_R; z <= SQUARE_R; z += s) {
      const cx = x + (Math.abs(Math.round(z)) % 2 ? s / 2 : 0);
      if (Math.hypot(cx, z) > SQUARE_R - 0.4) continue;
      kit.box("ground", s * 0.9, 0.06, s * 0.88, [pick(kit, COBBLE)], cx, SQUARE_TOP - 0.03, z);
    }
  }
  // Curb ring.
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const cx = Math.cos(a) * SQUARE_R;
    const cz = Math.sin(a) * SQUARE_R;
    let mouth = false;
    for (const r of ROADS) {
      if (Math.hypot(r.bx - cx, r.bz - cz) < r.w / 2 + 0.9 || Math.hypot(r.ax - cx, r.az - cz) < r.w / 2 + 0.9) mouth = true;
    }
    if (mouth) continue;
    kit.box("ground", 1.25, 0.1, 0.4, STONE, Math.cos(a) * SQUARE_R, 0.05, Math.sin(a) * SQUARE_R, -a + Math.PI / 2);
  }
  for (const r of ROADS) {
    const dx = r.bx - r.ax;
    const dz = r.bz - r.az;
    const len = Math.hypot(dx, dz);
    const yaw = Math.atan2(dx, dz);
    const n = Math.max(1, Math.round(len / 1.4));
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const wob = (kit.rand() - 0.5) * 0.25;
      kit.box("ground", r.w + wob, 0.05, len / n + 0.02, [pick(kit, DIRT)], r.ax + dx * t, 0.025, r.az + dz * t, yaw);
    }
  }
}

export const CLIP_OFF = 1e4;

export function buildTownBuildings(townRoot, addCollider, addBoxCollider) {
  const kit = makeKit(mulberry32(0xb111d));
  const shared = lambert();
  const glowMats = {
    glowWindow: lambert({ emissive: 0xffb060, emissiveIntensity: 0.32 }),
    glowFire: lambert({ emissive: 0xff5a12, emissiveIntensity: 0.9 }),
    glowPotion: lambert({ emissive: 0x6a6a6a, emissiveIntensity: 0.55 }),
    glowLamp: lambert({ emissive: 0xffc060, emissiveIntensity: 0.95 })
  };
  const glowParts = { glowWindow: [], glowFire: [], glowPotion: [], glowLamp: [] };
  function collectGlow() {
    for (const k of Object.keys(glowParts)) {
      const g = kit.take(k);
      if (g) glowParts[k].push(g);
    }
  }
  function mesh(geo, mat, cast, receive, name) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast;
    m.receiveShadow = receive;
    if (name) m.name = name;
    townRoot.add(m);
    return m;
  }
  const tierColliders = [];
  function addColliderRecord(c) {
    const item = c.kind === "box" ? addBoxCollider(c.x, c.z, c.hx, c.hz, c.yaw) : addCollider(c.x, c.z, c.r);
    item.level = c.level || 0;
    if (c.tier) {
      item.tier = c.tier;
      item.off = true;
      tierColliders.push(item);
    }
    return item;
  }

  const buildings = [];
  const windowMats = [];
  const all = BUILDINGS.concat(COTTAGES);
  for (const b of all) {
    const built = buildOne(kit, b);
    const shellGeo = mergeParts([kit.take("shell"), kit.take("upper"), kit.take("sign"), kit.take("room")].filter(Boolean));
    const interiorGeo = kit.take("interior");
    const capGeo = kit.take("cap");
    const cap1Geo = kit.take("cap1");
    const glassParts = [kit.take("glowWindow"), kit.take("roomWindow")].filter(Boolean);
    const windowGeo = glassParts.length ? mergeParts(glassParts) : null;
    collectGlow();
    // Walls and window glass get this building's own clipping plane. It sits far
    // above the town until the hero walks in, then drops to the cut line, so the
    // shader variant never changes.
    const clip = new THREE.Plane(new THREE.Vector3(0, -1, 0), CLIP_OFF);
    const shellMat = lambert({ clippingPlanes: [clip] });
    const windowMat = glowMats.glowWindow.clone();
    windowMat.clippingPlanes = [clip];
    windowMats.push(windowMat);
    const shell = mesh(shellGeo, shellMat, true, true, b.id + ":shell");
    const windows = windowGeo ? mesh(windowGeo, windowMat, false, false, b.id + ":windows") : null;
    const caps = capGeo ? mesh(capGeo, shared, false, true, b.id + ":caps") : null;
    if (caps) caps.visible = false;
    const caps1 = cap1Geo ? mesh(cap1Geo, shared, false, true, b.id + ":caps1") : null;
    if (caps1) caps1.visible = false;
    const interior = interiorGeo ? mesh(interiorGeo, shared, true, true, b.id + ":interior") : null;
    const colliders = buildingColliders(b).map(addColliderRecord);
    buildings.push({ def: b, shell, shellMat, windows, caps, caps1, clip, interior, colliders, smoke: built.smoke, model: false });
  }

  const propColliderList = [];
  for (const p of PROPS) {
    const fn = PROP[p.type];
    if (!fn) continue;
    kit.setFrame(localMatrix(new THREE.Matrix4(), p.x, 0, p.z, p.yaw || 0));
    if (p.tier) kit.redirect = tierRedirect(p.tier);
    fn(kit, p);
    kit.redirect = null;
    for (const c of propColliders(p)) propColliderList.push(addColliderRecord(c));
  }
  // FURNITURE helpers used by props write to "interior"; fold them into props.
  const propsA = kit.take("props");
  const propsB = kit.take("interior");
  const propsGeo = mergeParts([propsA, propsB].filter(Boolean));
  const props = mesh(propsGeo, shared, true, true, "townProps");
  collectGlow();

  // Depth-tier dressing: one mesh per tier for the whole town, shown by setTier.
  const tierMeshes = [null];
  for (let t = 1; t <= 3; t++) {
    const g = kit.take("tier" + t);
    const m = g ? mesh(g, shared, true, true, "townTier" + t) : null;
    if (m) m.visible = false;
    tierMeshes.push(m);
  }
  let shownTier = 0;
  function setTier(tier) {
    shownTier = tier;
    for (let t = 1; t < tierMeshes.length; t++) if (tierMeshes[t]) tierMeshes[t].visible = t <= tier;
    for (const c of tierColliders) c.off = c.tier > tier;
  }

  buildGround(kit);
  const ground = mesh(kit.take("ground"), shared, false, true, "townGround");

  const glow = {};
  for (const k of Object.keys(glowParts)) {
    if (!glowParts[k].length) continue;
    glow[k] = mesh(mergeParts(glowParts[k]), glowMats[k], false, false, "town:" + k);
  }

  // One warm light shared by every interior. It never leaves the scene, so the
  // light count (and every shader) stays the same when the hero walks in or out.
  const interiorLight = new THREE.PointLight(0xffc27a, 0, 15, 1.6);
  interiorLight.name = "interiorLight";
  interiorLight.position.set(0, 3, 0);
  townRoot.add(interiorLight);

  const stations = [];
  for (const bb of buildings) {
    const b = bb.def;
    if (!b.panel || !b.station) continue;
    const p = stationWorld(b);
    stations.push({
      id: b.panel,
      panel: b.panel,
      name: b.name,
      x: p.x,
      z: p.z,
      interact: INTERACT_R,
      building: b.id,
      keeperLine: b.keeper ? b.keeper.name + ", " + b.keeper.title : "",
      group: bb.shell,
      footMesh: bb.interior,
      footY: FLOOR_Y,
      colliders: bb.colliders,
      decor: []
    });
  }

  // The notice board in the square answers F like a counter.
  for (const p of PROPS) {
    if (p.type !== "notice") continue;
    const fx = Math.sin(p.yaw);
    const fz = Math.cos(p.yaw);
    stations.push({
      id: "board", panel: "board", name: "Notice Board",
      x: p.x + fx * 1.2, z: p.z + fz * 1.2,
      interact: INTERACT_R, keeperLine: "",
      group: props, footMesh: null, footY: 0, colliders: [], decor: []
    });
  }

  // The wayboard by the gate replays the first-visit tour (play/intro.js) on F.
  for (const p of PROPS) {
    if (p.type !== "wayboard") continue;
    stations.push({
      id: "tour", name: "The Wayboard",
      x: p.x + Math.sin(p.yaw) * 1.2, z: p.z + Math.cos(p.yaw) * 1.2,
      interact: INTERACT_R, keeperLine: "",
      group: props, footMesh: null, footY: 0, colliders: [], decor: []
    });
  }

  // The Blender-built town (view/townmodels.js): every building's shell, glass,
  // sign, interior and upstairs room, plus the square, roads, street props,
  // depth-tier dressing and glow pieces. It swaps in at once when every file has
  // loaded; if any fails the code-built town stays whole, so the two never mix.
  // Footprints, doors, colliders, tiers and the cutaway are unchanged.
  const emptyGeo = () => mergeParts([]);
  function swap(m, geo) {
    const old = m.geometry;
    m.geometry = geo || emptyGeo();
    old.dispose();
  }
  const modelsReady = loadTownModels(buildings.map((bb) => bb.def.id)).then((models) => {
    const glowAdd = { glowFire: [], glowPotion: [], glowLamp: [] };
    const tierAdd = [null, [], [], []];
    const collect = (model) => {
      for (const k of Object.keys(glowAdd)) if (model[k]) glowAdd[k].push(model[k]);
      for (let t = 1; t <= 3; t++) if (model["tier" + t]) tierAdd[t].push(model["tier" + t]);
    };
    for (const bb of buildings) {
      const model = models[bb.def.id];
      const m = buildingMatrix(bb.def);
      for (const k of Object.keys(model)) if (model[k]) model[k].applyMatrix4(m);
      swap(bb.shell, model.shell);
      if (bb.windows) swap(bb.windows, model.glass);
      if (bb.interior) swap(bb.interior, model.interior);
      if (bb.caps && model.cap) swap(bb.caps, model.cap);
      if (bb.caps1 && model.cap1) swap(bb.caps1, model.cap1);
      if (model.lamp) {
        // Clipped with the walls; follows the shared lamp glow that applyTownTime drives.
        const lampMat = glowMats.glowLamp.clone();
        lampMat.clippingPlanes = [bb.clip];
        const lamp = mesh(model.lamp, lampMat, false, false, bb.def.id + ":lamp");
        lamp.onBeforeRender = () => { lampMat.emissiveIntensity = glowMats.glowLamp.emissiveIntensity; };
      }
      collect(model);
      bb.model = true;
    }
    const town = models.town;
    swap(props, town.props);
    swap(ground, town.ground);
    collect(town);
    for (const k of Object.keys(glowAdd)) {
      const geo = glowAdd[k].length ? mergeParts(glowAdd[k]) : null;
      if (glow[k]) swap(glow[k], geo);
      else if (geo) glow[k] = mesh(geo, glowMats[k], false, false, "town:" + k);
    }
    for (let t = 1; t <= 3; t++) {
      const geo = tierAdd[t].length ? mergeParts(tierAdd[t]) : null;
      if (tierMeshes[t]) swap(tierMeshes[t], geo);
      else if (geo) {
        tierMeshes[t] = mesh(geo, shared, true, true, "townTier" + t);
        tierMeshes[t].visible = t <= shownTier;
      }
    }
    return { hearth: town.hearth || null, gate: town.gate || null, gateGlow: town.gateGlow || null };
  }).catch((err) => {
    console.warn("[town] Blender models did not load; keeping the code-built town", err);
    return null;
  });

  return {
    buildings, stations, props, ground, glow, modelsReady, glowMats, interiorLight, propColliders: propColliderList,
    tierMeshes, setTier, getTier() { return shownTier; },
    nightMats: { windows: windowMats, lamp: glowMats.glowLamp }
  };
}
