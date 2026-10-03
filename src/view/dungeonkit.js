import * as THREE from "three";

// Low-poly kit for the Underwood: one triangle builder that bakes many small parts
// into a single flat-shaded, vertex-coloured geometry, plus the biome props and set
// pieces that feed it. Pure geometry; buildFloorMesh in dungeon.js owns the meshes.

const _c = new THREE.Color();

export function makeBuilder() {
  const pos = [];
  const col = [];
  // Current placement: local part coordinates → world.
  let fx = 0;
  let fy = 0;
  let fz = 0;
  let fcos = 1;
  let fsin = 0;
  let fs = 1;

  function at(x, y, z, yaw, s) {
    fx = x;
    fy = y;
    fz = z;
    fcos = Math.cos(yaw || 0);
    fsin = Math.sin(yaw || 0);
    fs = s == null ? 1 : s;
  }

  function wx(x, z) {
    return fx + (x * fcos + z * fsin) * fs;
  }
  function wz(x, z) {
    return fz + (-x * fsin + z * fcos) * fs;
  }

  // Triangle in local coordinates; flipped if needed so its face points away from
  // the local reference point (ox, oy, oz). That keeps convex parts FrontSide-safe.
  function tri(a, b, c, hex, ox, oy, oz) {
    const ax = wx(a[0], a[2]);
    const ay = fy + a[1] * fs;
    const az = wz(a[0], a[2]);
    let bx = wx(b[0], b[2]);
    let by = fy + b[1] * fs;
    let bz = wz(b[0], b[2]);
    let cx = wx(c[0], c[2]);
    let cy = fy + c[1] * fs;
    let cz = wz(c[0], c[2]);
    if (ox != null) {
      const ux = bx - ax;
      const uy = by - ay;
      const uz = bz - az;
      const vx = cx - ax;
      const vy = cy - ay;
      const vz = cz - az;
      const nx = uy * vz - uz * vy;
      const ny = uz * vx - ux * vz;
      const nz = ux * vy - uy * vx;
      const rx = wx(ox, oz);
      const ry = fy + oy * fs;
      const rz = wz(ox, oz);
      const mx = (ax + bx + cx) / 3 - rx;
      const my = (ay + by + cy) / 3 - ry;
      const mz = (az + bz + cz) / 3 - rz;
      if (nx * mx + ny * my + nz * mz < 0) {
        const tx = bx;
        const ty = by;
        const tz = bz;
        bx = cx;
        by = cy;
        bz = cz;
        cx = tx;
        cy = ty;
        cz = tz;
      }
    }
    pos.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    _c.setHex(hex);
    col.push(_c.r, _c.g, _c.b, _c.r, _c.g, _c.b, _c.r, _c.g, _c.b);
  }

  function quad(a, b, c, d, hex, ox, oy, oz) {
    tri(a, b, c, hex, ox, oy, oz);
    tri(a, c, d, hex, ox, oy, oz);
  }

  // A box whose eight corners are nudged by `jit`; reads as a rock or a worn block.
  function lump(x, y, z, sx, sy, sz, jit, rand, sideHexes, topHex) {
    const hx = sx / 2;
    const hy = sy / 2;
    const hz = sz / 2;
    const v = [];
    for (let i = 0; i < 8; i++) {
      const px = (i & 1 ? hx : -hx) + (rand() - 0.5) * 2 * jit * sx;
      const py = (i & 2 ? hy : -hy) + (i & 2 ? (rand() - 0.5) * 2 * jit * sy : 0);
      const pz = (i & 4 ? hz : -hz) + (rand() - 0.5) * 2 * jit * sz;
      v.push([x + px, y + py, z + pz]);
    }
    const faces = [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]];
    for (let f = 0; f < faces.length; f++) {
      const q = faces[f];
      const hex = f === 3 && topHex != null ? topHex : sideHexes[Math.floor(rand() * sideHexes.length)];
      quad(v[q[0]], v[q[1]], v[q[2]], v[q[3]], hex, x, y, z);
    }
  }

  function box(x, y, z, sx, sy, sz, hex, topHex) {
    const hx = sx / 2;
    const hy = sy / 2;
    const hz = sz / 2;
    const v = [];
    for (let i = 0; i < 8; i++) v.push([x + (i & 1 ? hx : -hx), y + (i & 2 ? hy : -hy), z + (i & 4 ? hz : -hz)]);
    const faces = [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]];
    for (let f = 0; f < faces.length; f++) {
      const q = faces[f];
      quad(v[q[0]], v[q[1]], v[q[2]], v[q[3]], f === 3 && topHex != null ? topHex : hex, x, y, z);
    }
  }

  // A lathe of `rings` = [[radius, y], …] from bottom to top, `sides` around.
  // Radius 0 at either end closes it into a point.
  function lathe(x, z, rings, sides, hexes, rand, yaw0) {
    const a0 = yaw0 || 0;
    let cy = 0;
    for (let i = 0; i < rings.length; i++) cy += rings[i][1];
    cy /= rings.length;
    const pt = (ring, k) => {
      const a = a0 + (k / sides) * Math.PI * 2;
      return [x + Math.cos(a) * ring[0], ring[1], z + Math.sin(a) * ring[0]];
    };
    for (let i = 0; i < rings.length - 1; i++) {
      const lo = rings[i];
      const hi = rings[i + 1];
      const hex = hexes[Math.min(hexes.length - 1, i % hexes.length)];
      for (let k = 0; k < sides; k++) {
        const ry = (lo[1] + hi[1]) / 2;
        if (lo[0] > 0 && hi[0] > 0) quad(pt(lo, k), pt(lo, k + 1), pt(hi, k + 1), pt(hi, k), hex, x, ry, z);
        else if (lo[0] > 0) tri(pt(lo, k), pt(lo, k + 1), [x, hi[1], z], hex, x, cy, z);
        else if (hi[0] > 0) tri([x, lo[1], z], pt(hi, k + 1), pt(hi, k), hex, x, cy, z);
      }
    }
    const bottom = rings[0];
    const top = rings[rings.length - 1];
    for (let k = 0; k < sides && top[0] > 0; k++) tri([x, top[1], z], pt(top, k), pt(top, k + 1), hexes[hexes.length - 1], x, top[1] - 1, z);
    for (let k = 0; k < sides && bottom[0] > 0 && bottom[1] > 0.01; k++) tri([x, bottom[1], z], pt(bottom, k), pt(bottom, k + 1), hexes[0], x, bottom[1] + 1, z);
    if (rand) rand();
  }

  // Flat ring on the ground, facing up.
  function ring(x, y, z, inner, outer, segs, hex) {
    for (let k = 0; k < segs; k++) {
      const a = (k / segs) * Math.PI * 2;
      const b = ((k + 1) / segs) * Math.PI * 2;
      quad(
        [x + Math.cos(a) * inner, y, z + Math.sin(a) * inner],
        [x + Math.cos(a) * outer, y, z + Math.sin(a) * outer],
        [x + Math.cos(b) * outer, y, z + Math.sin(b) * outer],
        [x + Math.cos(b) * inner, y, z + Math.sin(b) * inner],
        hex, x, y - 1, z
      );
    }
  }

  function disc(x, y, z, r, segs, hex) {
    for (let k = 0; k < segs; k++) {
      const a = (k / segs) * Math.PI * 2;
      const b = ((k + 1) / segs) * Math.PI * 2;
      tri([x, y, z], [x + Math.cos(a) * r, y, z + Math.sin(a) * r], [x + Math.cos(b) * r, y, z + Math.sin(b) * r], hex, x, y - 1, z);
    }
  }

  function count() {
    return pos.length / 9;
  }

  function geometry() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pos), 3));
    geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(col), 3));
    geo.computeVertexNormals();
    return geo;
  }

  return { at, tri, quad, lump, box, lathe, ring, disc, count, geometry };
}

function pick(list, rand) {
  return list[Math.floor(rand() * list.length)];
}

// ---------- Props ----------
// Each writer draws one prop at the builder's current placement (base at y = 0).
// `solid` takes the diffuse parts; `glow` takes the emissive ones.

const PALE = [0xe7d7b4, 0xd8c8a0];
const IRON = [0x2f363e, 0x3e4650, 0x241c18];

export const PROP_WRITERS = {
  rock(solid, glow, t, rand) {
    solid.lump(0, 0.28, 0, 0.95, 0.62, 0.85, 0.12, rand, t.rock, pick(t.wallTop, rand));
    if (rand() < 0.6) solid.lump(0.42, 0.14, 0.3, 0.42, 0.3, 0.4, 0.15, rand, t.rock);
  },
  stalagmite(solid, glow, t, rand) {
    const h = 1.3 + rand() * 0.9;
    solid.lathe(0, 0, [[0.46, 0], [0.3, h * 0.45], [0.12, h * 0.8], [0, h]], 6, t.rock, rand, rand());
    solid.lathe(0.36, 0.22, [[0.24, 0], [0.12, 0.5], [0, 0.9]], 5, t.rock, rand, rand());
  },
  mushroom(solid, glow, t, rand) {
    const n = 2 + Math.floor(rand() * 3);
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2;
      const d = i === 0 ? 0 : 0.18 + rand() * 0.14;
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      const h = 0.22 + rand() * 0.34;
      const r = 0.12 + rand() * 0.12;
      solid.lathe(x, z, [[0.05, 0], [0.04, h]], 5, PALE, rand);
      glow.lathe(x, z, [[r * 0.4, h - 0.02], [r, h + 0.04], [r * 0.7, h + 0.12], [0, h + 0.16]], 6, [0], rand);
    }
  },
  crystal(solid, glow, t, rand) {
    solid.lump(0, 0.1, 0, 0.7, 0.2, 0.6, 0.15, rand, t.rock);
    const n = 3 + Math.floor(rand() * 2);
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2;
      const d = i === 0 ? 0 : 0.18;
      const h = 0.5 + rand() * 0.6;
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      glow.lathe(x, z, [[0.1, 0.05], [0.12, h * 0.7], [0, h]], 4, [0], rand, a);
    }
  },
  root(solid, glow, t, rand) {
    const h = 0.9 + rand() * 0.6;
    solid.lathe(0, 0, [[0.32, 0], [0.22, h * 0.5], [0.08, h * 0.9], [0, h]], 5, t.root, rand, rand());
    solid.lathe(0.3, -0.2, [[0.16, 0], [0.08, 0.4], [0, 0.6]], 5, t.root, rand, rand());
    solid.lump(-0.2, 0.06, 0.25, 0.5, 0.14, 0.18, 0.1, rand, t.root);
  },
  urn(solid, glow, t, rand) {
    const h = 0.7 + rand() * 0.25;
    solid.lathe(0, 0, [[0.22, 0], [0.34, h * 0.35], [0.3, h * 0.7], [0.15, h * 0.85], [0.21, h]], 7, [t.rock[0], t.trim[0], t.rock[1], t.trim[1]], rand);
  },
  rubble(solid, glow, t, rand) {
    const n = 3 + Math.floor(rand() * 3);
    for (let i = 0; i < n; i++) {
      const s = 0.22 + rand() * 0.3;
      solid.lump((rand() - 0.5) * 0.7, s * 0.4, (rand() - 0.5) * 0.7, s * 1.3, s * 0.8, s, 0.15, rand, t.wall);
    }
  },
  brazier(solid, glow, t, rand) {
    solid.lathe(0, 0, [[0.26, 0], [0.12, 0.12], [0.08, 0.6]], 6, IRON, rand);
    solid.lathe(0, 0, [[0.18, 0.55], [0.38, 0.72], [0.4, 0.82]], 7, [t.trim[0], t.trim[1]], rand);
    glow.lathe(0, 0, [[0.3, 0.78], [0.2, 1.05], [0, 1.35]], 5, [0], rand, rand());
    glow.lathe(0.1, 0.06, [[0.14, 0.8], [0, 1.15]], 4, [0], rand, rand());
  },
  statue(solid, glow, t, rand) {
    solid.box(0, 0.2, 0, 0.9, 0.4, 0.9, t.wall[0], t.trim[0]);
    solid.lathe(0, 0, [[0.34, 0.4], [0.3, 1.2], [0.36, 1.45], [0.2, 1.55]], 6, t.wall, rand);
    solid.lump(0, 1.78, 0, 0.36, 0.42, 0.34, 0.08, rand, t.wall);
    if (rand() < 0.4) solid.lump(0.2, 1.4, 0.1, 0.2, 0.5, 0.2, 0.1, rand, t.wall);
  },
  tomb(solid, glow, t, rand) {
    solid.box(0, 0.24, 0, 0.8, 0.48, 1.3, t.wall[0], t.wall[1]);
    solid.box(0, 0.54, 0, 0.9, 0.12, 1.4, t.trim[0], t.trim[1]);
    solid.lump(0, 0.66, -0.1, 0.4, 0.12, 0.7, 0.05, rand, t.trim);
  },
  candle(solid, glow, t, rand) {
    solid.box(0, 0.06, 0, 0.6, 0.12, 0.5, t.wall[0], t.trim[0]);
    const n = 3 + Math.floor(rand() * 3);
    for (let i = 0; i < n; i++) {
      const x = (rand() - 0.5) * 0.44;
      const z = (rand() - 0.5) * 0.34;
      const h = 0.18 + rand() * 0.3;
      solid.lathe(x, z, [[0.045, 0.12], [0.045, 0.12 + h]], 5, PALE, rand);
      glow.lathe(x, z, [[0.04, 0.13 + h], [0, 0.24 + h]], 4, [0], rand);
    }
  },
  anvil(solid, glow, t, rand) {
    solid.box(0, 0.22, 0, 0.42, 0.44, 0.42, IRON[1]);
    solid.box(0, 0.5, 0, 0.36, 0.14, 0.9, IRON[0], IRON[1]);
    solid.lathe(0, 0.55, [[0.1, 0.43], [0, 0.6]], 4, IRON, rand);
    if (rand() < 0.5) glow.box(0.1, 0.6, -0.2, 0.12, 0.04, 0.24, 0);
  },
  slag(solid, glow, t, rand) {
    solid.lump(0, 0.22, 0, 0.9, 0.44, 0.8, 0.18, rand, [0x241c18, 0x2f363e, 0x3a2416]);
    solid.lump(0.3, 0.1, 0.25, 0.4, 0.2, 0.4, 0.2, rand, [0x241c18, 0x2f363e]);
    glow.lump(-0.08, 0.42, 0.04, 0.32, 0.06, 0.26, 0.2, rand, [0]);
  },
  pillar(solid, glow, t, rand, h) {
    const top = h || 3.4;
    solid.box(0, 0.18, 0, 1.4, 0.36, 1.4, t.trim[1] || t.wall[0], t.trim[0]);
    solid.lathe(0, 0, [[0.58, 0.36], [0.52, top * 0.5], [0.55, top - 0.36]], 8, t.wall, rand, Math.PI / 8);
    solid.box(0, top - 0.18, 0, 1.36, 0.36, 1.36, t.trim[0], t.trim[1] || t.trim[0]);
    if (t.id === 4) glow.lathe(0, 0, [[0.6, 1.2], [0.6, 1.32]], 8, [0], rand, Math.PI / 8);
  }
};

export function writeProp(kind, solid, glow, theme, rand, wallH) {
  const fn = PROP_WRITERS[kind] || PROP_WRITERS.rock;
  fn(solid, glow, theme, rand, wallH);
}

export { pick };
