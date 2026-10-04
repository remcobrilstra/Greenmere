// Greenmere town layout. Pure data: every building, door, counter, road, and
// prop position lives here so view, play, minimap, and tests share one source.
// Local building frame: +z is the front (door side), +x is the right hand when
// facing the front from inside. World = rotateY(yaw) * local + (x, z).

export const FLOOR_Y = 0.16;
export const WALL_T = 0.3;
export const WALL_H = 3.6;
export const DOOR_W = 1.6;
export const DOOR_H = 2.6;
export const TOWN_FLAT_R = 36;
export const FOREST_CLEAR_R = 44;
export const SQUARE_R = 10;
export const SQUARE_TOP = 0.065;
export const INTERACT_R = 2.4;
// Indoors, the current building's walls are cut away above this height (dollhouse view).
export const CUTAWAY_H = 1.5;
export const STAIR_W = 1.2;
// The town grows with the deepest successful extract: tiers unlock at these depths.
export const TIER_DEPTHS = [0, 3, 6, 10];

export function townTier(bestDepth) {
  const d = Math.max(0, Math.floor(Number(bestDepth) || 0));
  let tier = 0;
  for (let i = 0; i < TIER_DEPTHS.length; i++) if (d >= TIER_DEPTHS[i]) tier = i;
  return tier;
}

// The hearth is a camp beside the gate road, where extract and death land.
export const HEARTH = { x: 6.5, z: -28.5 };
export const GATE = { x: 0, z: -36, descent: { x: 0, z: -34.2, r: 1.8 } };
// Extract and death land at the town end of the gate road, facing into town.
export const TOWN_ARRIVAL = { x: 0, z: -27, yaw: Math.PI };

function faceCenter(x, z) {
  return Math.atan2(-x, -z);
}

export function localToWorld(b, lx, lz) {
  const c = Math.cos(b.yaw);
  const s = Math.sin(b.yaw);
  return { x: b.x + lx * c + lz * s, z: b.z - lx * s + lz * c };
}

export function worldToLocal(b, x, z) {
  const c = Math.cos(b.yaw);
  const s = Math.sin(b.yaw);
  const dx = x - b.x;
  const dz = z - b.z;
  return { x: dx * c - dz * s, z: dx * s + dz * c };
}

// Yaw for an actor whose local forward is −z to face local direction (dx, dz) of building b.
export function worldYaw(b, dx, dz) {
  const c = Math.cos(b.yaw);
  const s = Math.sin(b.yaw);
  const wx = dx * c + dz * s;
  const wz = -dx * s + dz * c;
  return Math.atan2(-wx, -wz);
}

// Furniture entries: type, local x/z, yaw (local), w/d/h. walk: true = no collider.
// round: true = circle collider of radius max(w, d) / 2.
export const BUILDINGS = [
  {
    id: "store",
    name: "Bramble & Board",
    panel: "store",
    x: -18, z: -2, yaw: Math.PI / 2,
    w: 11, d: 8,
    upper: 2.6, jetty: 0.35, roofH: 2.6, roofColor: 0x6e2e28,
    chimneys: [{ x: 3.2, z: -2.2 }],
    doors: [{ side: "front", at: 0 }],
    windows: [
      { side: "front", at: -3.4 }, { side: "front", at: 3.4 },
      { side: "back", at: 0 }, { side: "right", at: -1.6 }
    ],
    sign: "coin",
    // Stairs run along the left wall from the front (z0) up to the back (z1).
    stairs: { x: -4.6, z0: 2.6, z1: -2.9 },
    keeper: { id: "maud", name: "Maud Bramble", title: "shopkeeper", x: 0, z: -2.0 },
    station: { x: 0, z: 0.3 },
    furniture: [
      { type: "counter", x: 0, z: -1.05, w: 5, d: 0.8, h: 1.05 },
      { type: "shelf", x: -2.3, z: -3.4, w: 2.4, d: 0.6, h: 2.5 },
      { type: "shelf", x: 3.3, z: -3.4, w: 3.2, d: 0.6, h: 2.5 },
      { type: "barrel", x: -2.8, z: 3.2, w: 0.8, d: 0.8, h: 1.0, round: true },
      { type: "barrel", x: -1.95, z: 3.3, w: 0.8, d: 0.8, h: 1.0, round: true },
      { type: "crates", x: 4.3, z: 2.7, w: 1.2, d: 1.2, h: 1.3 },
      { type: "table", x: 3.4, z: 0.6, w: 1.8, d: 1.0, h: 0.85, goods: true },
      { type: "sacks", x: 4.6, z: -1.6, w: 0.9, d: 1.4, h: 0.7 },
      { type: "rug", x: 0, z: 1.7, w: 3.2, d: 2.2, h: 0.02, walk: true },
      // Growth: Maud's stock follows the Warden's depth.
      { type: "shelf", x: 5.0, z: 1.4, yaw: -Math.PI / 2, w: 2.0, d: 0.45, h: 2.0, bottles: true, tier: 1 },
      { type: "coffer", x: 1.6, z: -1.05, w: 0.5, d: 0.35, h: 1.05, walk: true, tier: 2 },
      { type: "trophy", x: 3.3, z: -3.75, w: 1.2, d: 0.2, h: 2.9, walk: true, tier: 3 }
    ],
    upperFurniture: [
      { type: "bed", x: 4.3, z: 2.6, yaw: Math.PI / 2, w: 1.2, d: 2.1, h: 0.6 },
      { type: "chest", x: 4.7, z: 1.0, yaw: -Math.PI / 2, w: 0.9, d: 0.5, h: 0.55 },
      { type: "wardrobe", x: 0.6, z: -3.7, w: 1.6, d: 0.6, h: 2.0 },
      { type: "crates", x: -2.6, z: -3.3, w: 1.2, d: 1.2, h: 1.3 },
      { type: "sacks", x: -1.0, z: -3.4, w: 0.9, d: 1.4, h: 0.7 },
      { type: "table", x: 1.4, z: 2.6, w: 1.2, d: 0.8, h: 0.8 },
      { type: "rug", x: 1.0, z: 0.2, w: 3.0, d: 2.0, h: 0.02, walk: true }
    ]
  },
  {
    id: "smith",
    name: "The Quench",
    panel: "smith",
    x: 18, z: -2, yaw: -Math.PI / 2,
    w: 11, d: 8,
    upper: 0, roofH: 2.8, roofColor: 0x2f363e,
    chimneys: [{ x: -3.4, z: -2.8, big: true }],
    doors: [{ side: "front", at: 0 }],
    windows: [
      { side: "front", at: 3.4 }, { side: "back", at: 2.6 },
      { side: "right", at: 0 }, { side: "left", at: 1.8 }
    ],
    sign: "anvil",
    keeper: { id: "orrin", name: "Orrin Vale", title: "smith", x: -1.2, z: -1.35 },
    station: { x: -1.2, z: 0.9 },
    furniture: [
      { type: "forge", x: -3.4, z: -2.75, w: 2.6, d: 1.6, h: 1.0 },
      { type: "anvil", x: -1.2, z: -0.45, w: 1.0, d: 0.5, h: 0.85 },
      { type: "trough", x: -4.6, z: 1.2, yaw: Math.PI / 2, w: 1.9, d: 0.8, h: 0.7 },
      { type: "barrel", x: -4.6, z: -0.6, w: 0.8, d: 0.8, h: 1.0, round: true, coal: true },
      { type: "bench", x: 3.4, z: -3.4, w: 3.2, d: 0.8, h: 0.95, tools: true },
      { type: "rack", x: 4.95, z: 0.8, yaw: -Math.PI / 2, w: 2.6, d: 0.4, h: 2.0 },
      { type: "grindstone", x: 2.6, z: 1.9, w: 1.0, d: 0.7, h: 1.0 },
      { type: "crates", x: 4.4, z: 3.0, w: 1.0, d: 1.0, h: 0.9 },
      { type: "anvil", x: 1.0, z: -1.4, w: 1.0, d: 0.5, h: 0.85, tier: 1 },
      { type: "armorStand", x: 4.3, z: -1.9, w: 0.7, d: 0.7, h: 1.9, round: true, tier: 2 },
      { type: "trophy", x: 0.6, z: -3.75, w: 1.2, d: 0.2, h: 2.6, walk: true, tier: 3 }
    ]
  },
  {
    id: "still",
    name: "The Still",
    panel: "still",
    x: -14, z: -20, yaw: Math.PI / 4,
    w: 8, d: 7,
    upper: 0, roofH: 2.4, roofColor: 0x3d4a3a,
    chimneys: [{ x: 2.2, z: -2.0 }],
    doors: [{ side: "front", at: 0 }],
    windows: [
      { side: "front", at: -2.4 }, { side: "front", at: 2.4 },
      { side: "left", at: 0.4 }, { side: "right", at: 0.6 }
    ],
    sign: "flask",
    keeper: { id: "wen", name: "Sister Wen", title: "distiller", x: -0.6, z: -1.55 },
    station: { x: -0.6, z: 0.85 },
    furniture: [
      { type: "counter", x: -0.6, z: -0.65, w: 3.2, d: 0.7, h: 1.05, bottles: true },
      { type: "still", x: 2.0, z: -2.1, w: 1.6, d: 1.6, h: 2.2, round: true },
      { type: "shelf", x: -3.4, z: -0.4, yaw: Math.PI / 2, w: 3.0, d: 0.5, h: 2.3, bottles: true },
      { type: "shelf", x: -1.4, z: -2.95, w: 2.4, d: 0.5, h: 2.3, bottles: true },
      { type: "cauldron", x: 2.3, z: 1.3, w: 1.1, d: 1.1, h: 0.9, round: true },
      { type: "table", x: -2.5, z: 2.2, w: 1.4, d: 0.9, h: 0.85, herbs: true },
      { type: "rug", x: -0.4, z: 1.9, w: 2.2, d: 1.6, h: 0.02, walk: true },
      { type: "herbRack", x: 0.6, z: -2.0, w: 2.4, d: 0.3, h: 2.6, walk: true, tier: 1 },
      { type: "alembic", x: 2.9, z: -0.25, w: 0.9, d: 0.6, h: 0.9, tier: 2 },
      { type: "crystal", x: -1.6, z: -0.65, w: 0.3, d: 0.3, h: 1.05, walk: true, tier: 3 }
    ]
  },
  {
    id: "trainer",
    name: "The Circle",
    panel: "trainer",
    x: 0, z: 20, yaw: Math.PI,
    w: 13, d: 10,
    upper: 0, roofH: 3.4, roofColor: 0x2f363e,
    chimneys: [],
    doors: [{ side: "front", at: 0 }],
    windows: [
      { side: "front", at: -4.2 }, { side: "front", at: 4.2 },
      { side: "back", at: -3.2 }, { side: "back", at: 3.2 },
      { side: "left", at: -1.6 }, { side: "left", at: 1.6 },
      { side: "right", at: -1.6 }, { side: "right", at: 1.6 }
    ],
    sign: "ring",
    keeper: { id: "tamsin", name: "Old Tamsin", title: "trainer", x: 0, z: -0.7 },
    station: { x: 0, z: 1.2 },
    ring: { x: 0, z: 0.2, r: 2.5, stones: 8 },
    furniture: [
      { type: "lectern", x: 0, z: -3.9, w: 0.9, d: 0.6, h: 1.15 },
      { type: "dummy", x: -4.4, z: -2.6, w: 0.8, d: 0.8, h: 1.9, round: true },
      { type: "dummy", x: 4.4, z: -2.6, w: 0.8, d: 0.8, h: 1.9, round: true },
      { type: "rack", x: -3.4, z: -4.45, w: 2.4, d: 0.4, h: 2.0 },
      { type: "rack", x: 3.4, z: -4.45, w: 2.4, d: 0.4, h: 2.0 },
      { type: "bench", x: -5.95, z: 1.4, yaw: Math.PI / 2, w: 2.8, d: 0.55, h: 0.5 },
      { type: "bench", x: 5.95, z: 1.4, yaw: -Math.PI / 2, w: 2.8, d: 0.55, h: 0.5 },
      { type: "brazier", x: -2.2, z: -3.6, w: 0.6, d: 0.6, h: 1.1, round: true },
      { type: "brazier", x: 2.2, z: -3.6, w: 0.6, d: 0.6, h: 1.1, round: true },
      { type: "banner", x: -1.2, z: -4.6, w: 0.9, d: 0.1, h: 3.2, walk: true, color: 0x2d62c8, tier: 1 },
      { type: "banner", x: 1.2, z: -4.6, w: 0.9, d: 0.1, h: 3.2, walk: true, color: 0xd4a03a, tier: 1 },
      { type: "dummy", x: -4.4, z: 2.6, w: 0.8, d: 0.8, h: 1.9, round: true, tier: 2 },
      { type: "dummy", x: 4.4, z: 2.6, w: 0.8, d: 0.8, h: 1.9, round: true, tier: 2 },
      { type: "trophy", x: 0, z: -4.7, w: 1.4, d: 0.2, h: 2.8, walk: true, tier: 3 }
    ]
  },
  {
    id: "inn",
    name: "The Banked Fire",
    panel: "inn",
    x: 15, z: -20, yaw: -Math.PI / 4,
    w: 10, d: 8,
    upper: 2.6, jetty: 0.35, roofH: 2.4, roofColor: 0x5a3a24,
    chimneys: [{ x: -4.5, z: 0.2 }],
    doors: [{ side: "front", at: -1.2 }],
    windows: [
      { side: "front", at: 2.4 }, { side: "front", at: -3.8 },
      { side: "back", at: -1.6 }, { side: "back", at: 2.2 }
    ],
    sign: "tankard",
    stairs: { x: 4.1, z0: 2.9, z1: -2.8 },
    keeper: { id: "pell", name: "Pell", title: "innkeeper", x: 1.6, z: -2.55 },
    station: { x: 1.6, z: -0.3 },
    furniture: [
      { type: "counter", x: 1.6, z: -1.65, w: 3.0, d: 0.8, h: 1.1 },
      { type: "kegs", x: 1.6, z: -3.45, w: 2.6, d: 0.7, h: 1.4 },
      { type: "fireplace", x: -4.55, z: 0.2, yaw: Math.PI / 2, w: 2.2, d: 0.6, h: 2.2 },
      { type: "tavernTable", x: -2.2, z: -1.6, w: 1.6, d: 1.6, h: 0.8, round: true },
      { type: "tavernTable", x: -2.7, z: 1.9, w: 1.6, d: 1.6, h: 0.8, round: true },
      { type: "tavernTable", x: 1.6, z: 1.9, w: 1.6, d: 1.6, h: 0.8, round: true },
      { type: "rug", x: -2.9, z: 0.2, w: 1.6, d: 2.4, h: 0.02, walk: true },
      { type: "bunting", x: 0, z: 0, w: 8.0, d: 6.0, h: 3.2, walk: true, tier: 1 },
      { type: "trophy", x: -4.75, z: 0.2, yaw: Math.PI / 2, w: 1.4, d: 0.2, h: 2.75, walk: true, tier: 3 }
    ],
    upperFurniture: [
      { type: "bed", x: -3.6, z: -3.0, w: 1.1, d: 2.0, h: 0.6 },
      { type: "bed", x: -1.4, z: -3.0, w: 1.1, d: 2.0, h: 0.6 },
      { type: "bed", x: 0.8, z: -3.0, w: 1.1, d: 2.0, h: 0.6 },
      { type: "chest", x: -3.6, z: -1.6, w: 0.8, d: 0.45, h: 0.5 },
      { type: "chest", x: -1.4, z: -1.6, w: 0.8, d: 0.45, h: 0.5 },
      { type: "chest", x: 0.8, z: -1.6, w: 0.8, d: 0.45, h: 0.5 },
      { type: "table", x: -3.4, z: 2.4, w: 1.2, d: 0.8, h: 0.8 },
      { type: "rug", x: -0.8, z: 1.2, w: 3.0, d: 2.0, h: 0.02, walk: true }
    ]
  }
];

// The Counting House keeps the bank and the stash. Stone walls, its own road.
BUILDINGS.push({
  id: "bank",
  name: "The Counting House",
  panel: "bank",
  style: "stone",
  x: -14, z: 14, yaw: faceCenter(-14, 14),
  w: 9, d: 7,
  upper: 0, roofH: 2.4, roofColor: 0x2f363e,
  chimneys: [{ x: 3.0, z: -2.4 }],
  doors: [{ side: "front", at: 0 }],
  windows: [{ side: "front", at: -2.7 }, { side: "front", at: 2.7 }, { side: "left", at: -0.6 }, { side: "right", at: 0.6 }],
  sign: "key",
  roadTo: [-6.0, 7.6],
  keeper: { id: "aldous", name: "Aldous Penn", title: "banker", x: 0, z: -1.6 },
  station: { x: 0, z: 0.55 },
  furniture: [
    { type: "bankCounter", x: 0, z: -0.7, w: 4.0, d: 0.7, h: 1.15 },
    { type: "vault", x: 0, z: -3.3, w: 1.8, d: 0.12, h: 2.4, walk: true },
    { type: "chest", x: -2.9, z: -2.6, w: 1.0, d: 0.55, h: 0.6 },
    { type: "chest", x: 2.9, z: -2.6, w: 1.0, d: 0.55, h: 0.6 },
    { type: "coffer", x: 1.3, z: -0.7, w: 0.5, d: 0.35, h: 1.15, walk: true },
    { type: "shelf", x: -4.0, z: 0.6, yaw: Math.PI / 2, w: 2.4, d: 0.4, h: 2.2 },
    { type: "table", x: 3.0, z: 1.7, w: 1.2, d: 0.8, h: 0.85, goods: true },
    { type: "rug", x: 0, z: 1.9, w: 2.6, d: 1.6, h: 0.02, walk: true },
    { type: "trophy", x: -2.0, z: -3.3, w: 1.0, d: 0.2, h: 2.4, walk: true, tier: 3 }
  ]
});

const COTTAGE_SPOTS = [
  [-29, 9, 0x6e2e28], [29, 10, 0x2f363e], [-19, 27, 0x5a3a24],
  [19, 27, 0x6e2e28], [-30, -12, 0x2f363e], [32, -11, 0x5a3a24]
];
// Front yard in local space: fence from the front wall out to YARD_D, gate at the door.
export const YARD_D = 4.6;
export const YARD_PAD = 0.6;

function cottageFurniture(sgn) {
  return [
    { type: "bed", x: sgn * 1.9, z: -1.2, w: 1.0, d: 1.9, h: 0.6 },
    { type: "fireplace", x: -sgn * 1.6, z: -1.95, w: 1.3, d: 0.5, h: 1.6, top: 3.0 },
    { type: "table", x: -sgn * 0.9, z: 0.8, w: 1.0, d: 0.8, h: 0.8, stools: true },
    { type: "chest", x: sgn * 2.3, z: 1.4, yaw: sgn * -Math.PI / 2, w: 0.8, d: 0.45, h: 0.5 },
    { type: "shelf", x: -sgn * 0.2, z: -2.05, w: 1.2, d: 0.3, h: 1.8 },
    { type: "rug", x: 0.2 * sgn, z: 0.2, w: 1.8, d: 1.4, h: 0.02, walk: true }
  ];
}

function cottageYard(sgn, doorAt) {
  const hw = 3 + YARD_PAD;
  const z0 = 2.5;
  const z1 = 2.5 + YARD_D;
  const gate0 = doorAt - 0.8;
  const gate1 = doorAt + 0.8;
  return {
    fences: [
      { x: -hw, z0, x1: -hw, z1 },
      { x: hw, z0, x1: hw, z1 },
      { x: -hw, z0: z1, x1: gate0, z1 },
      { x: gate1, z0: z1, x1: hw, z1 }
    ],
    garden: { x: -sgn * 1.9, z: 4.7, w: 2.2, d: 2.8 },
    line: { x: sgn * 3.0, z0: 3.3, z1: 6.4 },
    gate: { x: doorAt, z: z1 + 0.8 }
  };
}

export const COTTAGES = COTTAGE_SPOTS.map(([x, z, roof], i) => {
  const sgn = i % 2 ? -1 : 1;
  const doorAt = sgn * 1.2;
  return {
    id: "cottage-" + i,
    name: "Cottage",
    home: true,
    x, z, yaw: faceCenter(x, z),
    w: 6, d: 5,
    wallH: 3.0,
    upper: 0, roofH: 2.2, roofColor: roof,
    chimneys: [{ x: -sgn * 1.6, z: -1.95 }],
    doors: [{ side: "front", at: doorAt }],
    windows: [{ side: "front", at: -sgn * 1.4 }, { side: "left", at: 0 }, { side: "right", at: 0 }],
    sign: null,
    furniture: cottageFurniture(sgn),
    yard: cottageYard(sgn, doorAt)
  };
});

export const ALL_BUILDINGS = BUILDINGS.concat(COTTAGES);

export function buildingById(id) {
  for (let i = 0; i < ALL_BUILDINGS.length; i++) if (ALL_BUILDINGS[i].id === id) return ALL_BUILDINGS[i];
  return null;
}

export function wallHeight(b) {
  return b.wallH || WALL_H;
}

function sideLength(b, side) {
  return side === "front" || side === "back" ? b.w : b.d;
}

// Local point on a side: `along` runs left→right as seen from outside for front,
// and along +x / +z for the others; `out` is the distance outward from the outer face.
export function sidePoint(b, side, along, out) {
  if (side === "front") return { x: along, z: b.d / 2 + out };
  if (side === "back") return { x: along, z: -(b.d / 2 + out) };
  if (side === "left") return { x: -(b.w / 2 + out), z: along };
  return { x: b.w / 2 + out, z: along };
}

// Local wall boxes {x, z, hx, hz} split around door gaps. Front/back walls span
// the full width; left/right sit between them so corners do not overlap.
export function wallBoxes(b) {
  const out = [];
  const sides = ["front", "back", "left", "right"];
  for (let si = 0; si < sides.length; si++) {
    const side = sides[si];
    const full = sideLength(b, side);
    const span = side === "front" || side === "back" ? full : full - WALL_T * 2;
    const gaps = [];
    if (!b.closed) {
      for (let i = 0; i < b.doors.length; i++) {
        const d = b.doors[i];
        if (d.side === side) gaps.push([d.at - DOOR_W / 2, d.at + DOOR_W / 2]);
      }
    }
    gaps.sort((a, c) => a[0] - c[0]);
    let start = -span / 2;
    const pieces = [];
    for (let i = 0; i < gaps.length; i++) {
      if (gaps[i][0] > start + 1e-6) pieces.push([start, gaps[i][0]]);
      start = gaps[i][1];
    }
    if (span / 2 > start + 1e-6) pieces.push([start, span / 2]);
    for (let i = 0; i < pieces.length; i++) {
      const [a, c] = pieces[i];
      const mid = (a + c) / 2;
      const half = (c - a) / 2;
      const p = sidePoint(b, side, mid, -WALL_T / 2);
      if (side === "front" || side === "back") out.push({ side, x: p.x, z: p.z, hx: half, hz: WALL_T / 2 });
      else out.push({ side, x: p.x, z: p.z, hx: WALL_T / 2, hz: half });
    }
  }
  return out;
}

export function doorPoint(b, door, out) {
  return sidePoint(b, door.side, door.at, out);
}

export function insideRect(b, x, z, margin) {
  const l = worldToLocal(b, x, z);
  const m = margin || 0;
  return Math.abs(l.x) <= b.w / 2 - m && Math.abs(l.z) <= b.d / 2 - m;
}

// The open building whose interior (inside the inner wall faces) holds (x, z).
export function buildingAt(x, z) {
  for (let i = 0; i < ALL_BUILDINGS.length; i++) {
    const b = ALL_BUILDINGS[i];
    if (!b.closed && insideRect(b, x, z, WALL_T)) return b;
  }
  return null;
}

// ---------- upper floors ----------

export function jetty(b) {
  return b.upper ? (b.jetty || 0) : 0;
}

export function levelTop(b) {
  return FLOOR_Y + wallHeight(b);
}

// 0 at the foot of the stairs, 1 at the top, or null when (lx, lz) is off the flight.
export function stairT(b, lx, lz) {
  const s = b.stairs;
  if (!s || Math.abs(lx - s.x) > STAIR_W / 2) return null;
  const lo = Math.min(s.z0, s.z1);
  const hi = Math.max(s.z0, s.z1);
  if (lz < lo || lz > hi) return null;
  return (lz - s.z0) / (s.z1 - s.z0);
}

function inUpper(b, l) {
  const j = jetty(b);
  return Math.abs(l.x) <= b.w / 2 + j && Math.abs(l.z) <= b.d / 2 + j;
}

// Walkable height at (x, z) for an actor on `level` (0 ground, 1 upstairs), or null outdoors.
export function groundAtLevel(x, z, level) {
  for (let i = 0; i < ALL_BUILDINGS.length; i++) {
    const b = ALL_BUILDINGS[i];
    const l = worldToLocal(b, x, z);
    const t = stairT(b, l.x, l.z);
    if (t != null) return FLOOR_Y + Math.max(0, Math.min(1, t)) * wallHeight(b);
    if (level === 1 && b.upper && inUpper(b, l)) return levelTop(b);
    if (Math.abs(l.x) <= b.w / 2 && Math.abs(l.z) <= b.d / 2) return FLOOR_Y;
  }
  return null;
}

// Level after a step: the flight decides by its midpoint; elsewhere the level holds.
export function nextLevel(x, z, level) {
  for (let i = 0; i < ALL_BUILDINGS.length; i++) {
    const b = ALL_BUILDINGS[i];
    if (!b.stairs) continue;
    const l = worldToLocal(b, x, z);
    const t = stairT(b, l.x, l.z);
    if (t != null) return t > 0.5 ? 1 : 0;
    if (level === 1 && inUpper(b, l)) return 1;
  }
  return level === 1 ? 0 : level;
}

export function upperBuildingAt(x, z) {
  for (let i = 0; i < ALL_BUILDINGS.length; i++) {
    const b = ALL_BUILDINGS[i];
    if (b.upper && b.stairs && inUpper(b, worldToLocal(b, x, z))) return b;
  }
  return null;
}

// Floor height under (x, z), or null on open ground.
export function floorAt(x, z) {
  for (let i = 0; i < ALL_BUILDINGS.length; i++) {
    if (insideRect(ALL_BUILDINGS[i], x, z, 0)) return FLOOR_Y;
  }
  return null;
}

export function stationWorld(b) {
  const p = localToWorld(b, b.station.x, b.station.z);
  return { x: p.x, z: p.z };
}

// Collider records in world space for one building. Boxes: {kind, x, z, hx, hz, yaw}.
export function buildingColliders(b) {
  const list = [];
  if (b.closed) {
    list.push({ kind: "box", x: b.x, z: b.z, hx: b.w / 2, hz: b.d / 2, yaw: b.yaw, level: 0 });
    return list;
  }
  const walls = wallBoxes(b);
  for (let i = 0; i < walls.length; i++) {
    const w = walls[i];
    const p = localToWorld(b, w.x, w.z);
    list.push({ kind: "box", x: p.x, z: p.z, hx: w.hx, hz: w.hz, yaw: b.yaw, level: 0 });
  }
  function furnitureColliders(items, level) {
    for (let i = 0; i < items.length; i++) {
      const f = items[i];
      if (f.walk) continue;
      const p = localToWorld(b, f.x, f.z);
      const extra = { level, tier: f.tier || 0 };
      if (f.round) list.push(Object.assign({ kind: "circle", x: p.x, z: p.z, r: Math.max(f.w, f.d) / 2 }, extra));
      else list.push(Object.assign({ kind: "box", x: p.x, z: p.z, hx: f.w / 2, hz: f.d / 2, yaw: b.yaw + (f.yaw || 0) }, extra));
    }
  }
  function localBox(lx, lz, hx, hz, level) {
    const p = localToWorld(b, lx, lz);
    list.push({ kind: "box", x: p.x, z: p.z, hx, hz, yaw: b.yaw, level });
  }
  furnitureColliders(b.furniture || [], 0);
  if (b.upper && b.stairs) {
    const s = b.stairs;
    const sign = Math.sign(s.z1 - s.z0);
    const len = Math.abs(s.z1 - s.z0);
    const mid = (s.z0 + s.z1) / 2;
    const rail = 0.05;
    // Ground floor: sides above the first quarter (the low steps can be stepped onto
    // from the side), and the top end so nobody walks under the landing onto the flight.
    const sideLen = len * 0.75;
    const sideMid = s.z0 + sign * (len * 0.25 + sideLen / 2);
    for (const side of [-1, 1]) localBox(s.x + side * (STAIR_W / 2 + rail), sideMid, rail, sideLen / 2, 0);
    localBox(s.x, s.z1 + sign * rail, STAIR_W / 2 + rail * 2, rail, 0);
    // Upstairs: the stairwell is railed on both sides and at the low end.
    for (const side of [-1, 1]) localBox(s.x + side * (STAIR_W / 2 + rail), mid, rail, len / 2, 1);
    localBox(s.x, s.z0 - sign * rail, STAIR_W / 2 + rail * 2, rail, 1);
    // Upper storey walls (no doors) and chimneys that pass through the room.
    const j = jetty(b);
    const hx = b.w / 2 + j;
    const hz = b.d / 2 + j;
    localBox(0, hz - WALL_T / 2, hx, WALL_T / 2, 1);
    localBox(0, -hz + WALL_T / 2, hx, WALL_T / 2, 1);
    localBox(-hx + WALL_T / 2, 0, WALL_T / 2, hz, 1);
    localBox(hx - WALL_T / 2, 0, WALL_T / 2, hz, 1);
    for (const c of b.chimneys || []) {
      const p = localToWorld(b, c.x, c.z);
      list.push({ kind: "circle", x: p.x, z: p.z, r: (c.big ? 1.1 : 0.7) * 0.72, level: 1 });
    }
    furnitureColliders(b.upperFurniture || [], 1);
  }
  if (b.yard) {
    const y = b.yard;
    for (const f of y.fences) {
      const mx = (f.x + f.x1) / 2;
      const mz = (f.z0 + f.z1) / 2;
      localBox(mx, mz, Math.max(0.06, Math.abs(f.x1 - f.x) / 2), Math.max(0.06, Math.abs(f.z1 - f.z0) / 2), 0);
    }
    localBox(y.garden.x, y.garden.z, y.garden.w / 2, y.garden.d / 2, 0);
    for (const z of [y.line.z0, y.line.z1]) {
      const p = localToWorld(b, y.line.x, z);
      list.push({ kind: "circle", x: p.x, z: p.z, r: 0.12, level: 0 });
    }
  }
  if (b.ring) {
    for (let i = 0; i < b.ring.stones; i++) {
      // Offset by half a step so a gap faces the door (+z).
      const a = ((i + 0.5) / b.ring.stones) * Math.PI * 2 + Math.PI / 2;
      const p = localToWorld(b, b.ring.x + Math.cos(a) * b.ring.r, b.ring.z + Math.sin(a) * b.ring.r);
      list.push({ kind: "circle", x: p.x, z: p.z, r: 0.34, level: 0 });
    }
  }
  return list;
}

// Roads: straight strips {ax, az, bx, bz, w}. Each service door runs to the square.
function toSquare(p) {
  const len = Math.hypot(p.x, p.z) || 1;
  const r = SQUARE_R - 0.6;
  return { x: (p.x / len) * r, z: (p.z / len) * r };
}
function buildRoads() {
  const roads = [{ ax: 0, az: -(SQUARE_R - 0.6), bx: 0, bz: GATE.z + 0.8, w: 3.6 }];
  for (let i = 0; i < BUILDINGS.length; i++) {
    const b = BUILDINGS[i];
    const d = b.doors[0];
    const lp = doorPoint(b, d, 0.6);
    const p = localToWorld(b, lp.x, lp.z);
    const q = b.roadTo ? { x: b.roadTo[0], z: b.roadTo[1] } : toSquare(p);
    roads.push({ ax: p.x, az: p.z, bx: q.x, bz: q.z, w: 2.6 });
  }
  for (let i = 0; i < COTTAGES.length; i++) {
    const b = COTTAGES[i];
    const lp = doorPoint(b, b.doors[0], 0.3);
    const lq = doorPoint(b, b.doors[0], YARD_D + 1.4);
    const p = localToWorld(b, lp.x, lp.z);
    const q = localToWorld(b, lq.x, lq.z);
    roads.push({ ax: p.x, az: p.z, bx: q.x, bz: q.z, w: 1.4 });
  }
  // A short footpath from the gate road to the hearth's clearing.
  roads.push({ ax: 1.6, az: HEARTH.z, bx: HEARTH.x - 2.9, bz: HEARTH.z, w: 1.6 });
  return roads;
}
export const ROADS = buildRoads();

// Square and street props. Colliders come from `r` (circle) or w/d (box).
export const PROPS = [
  { type: "well", x: 0, z: 0, r: 1.0 },
  { type: "stall", x: -6.9, z: -4.6, yaw: faceCenter(-6.9, -4.6), w: 2.6, d: 1.4, awning: 0xb64034 },
  { type: "stall", x: -8.2, z: 5.0, yaw: faceCenter(-8.2, 5.0), w: 2.6, d: 1.4, awning: 0x2d62c8 },
  { type: "stall", x: 7.0, z: 5.4, yaw: faceCenter(7.0, 5.4), w: 2.6, d: 1.4, awning: 0xd4a03a },
  { type: "bench", x: -3.4, z: 8.2, yaw: faceCenter(-3.4, 8.2), w: 2.0, d: 0.55 },
  { type: "bench", x: 3.4, z: 8.2, yaw: faceCenter(3.4, 8.2), w: 2.0, d: 0.55 },
  { type: "notice", x: -3.2, z: -11.5, yaw: Math.PI / 2, w: 1.6, d: 0.3 },
  { type: "cart", x: 4.4, z: -14.5, yaw: 0.25, w: 1.6, d: 2.8 },
  { type: "woodpile", x: 22.9, z: -2.0, yaw: Math.PI / 2, w: 2.2, d: 0.9 },
  { type: "barrels", x: -12.6, z: 3.4, r: 0.75 },
  { type: "barrels", x: 12.8, z: -6.8, r: 0.75 },
  { type: "trough", x: 12.4, z: 2.6, yaw: 0, w: 1.8, d: 0.7 },
  // Growth: the square dresses up as the Warden goes deeper.
  { type: "bunting", x: 0, z: 0, r: 0, walk: true, tier: 1 },
  { type: "stall", x: 6.8, z: 8.6, yaw: faceCenter(6.8, 8.6), w: 2.4, d: 1.3, awning: 0x3e9a36, tier: 2 },
  { type: "statue", x: 0, z: 6.8, r: 0.8, tier: 3 }
];
const LAMP_SPOTS = [
  [2.7, -13], [-2.7, -20], [2.7, -27], [-2.7, -33.5],
  [8.4, -6.2], [-8.4, -6.8], [9.6, 2.4], [-9.8, 1.0], [2.6, 10.6], [-2.6, 10.6]
];
// A lamp's arm (local +x) reaches over what it lights: the gate road for the
// lamps along it, the well for the lamps round the square.
export function lampYaw(x, z) {
  const onRoad = Math.abs(x) < 4 && z < -SQUARE_R;
  const dx = -x;
  const dz = onRoad ? 0 : -z;
  return Math.atan2(-dz, dx);
}
for (let i = 0; i < LAMP_SPOTS.length; i++) {
  const [x, z] = LAMP_SPOTS[i];
  PROPS.push({ type: "lamp", x, z, yaw: lampYaw(x, z), r: 0.18 });
}

export function propColliders(p) {
  if (p.walk) return [];
  const tier = p.tier || 0;
  if (p.r) return [{ kind: "circle", x: p.x, z: p.z, r: p.r, level: 0, tier }];
  return [{ kind: "box", x: p.x, z: p.z, hx: p.w / 2, hz: p.d / 2, yaw: p.yaw || 0, level: 0, tier }];
}

// Points where the town is built over; scatter (flowers, grass) avoids these.
export function townBlocked(x, z, pad) {
  const m = pad || 0;
  if (Math.hypot(x, z) < SQUARE_R + m) return true;
  for (let i = 0; i < ALL_BUILDINGS.length; i++) {
    const b = ALL_BUILDINGS[i];
    const l = worldToLocal(b, x, z);
    const front = b.yard ? b.d / 2 + YARD_D + 0.6 : b.d / 2 + 1.6;
    if (Math.abs(l.x) <= b.w / 2 + 1 + m && l.z <= front + m && l.z >= -b.d / 2 - 1.6 - m) return true;
  }
  for (let i = 0; i < ROADS.length; i++) {
    const r = ROADS[i];
    const dx = r.bx - r.ax;
    const dz = r.bz - r.az;
    const len2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - r.ax) * dx + (z - r.az) * dz) / len2));
    if (Math.hypot(x - (r.ax + dx * t), z - (r.az + dz * t)) < r.w / 2 + 0.3 + m) return true;
  }
  if (Math.abs(x - GATE.x) < 4 && Math.abs(z - GATE.z) < 3 + m) return true;
  if (Math.hypot(x - HEARTH.x, z - HEARTH.z) < 3.4 + m) return true;
  return false;
}
