// Underwood biomes. Each holds BIOME_BAND floors, then the next one takes over;
// after the last biome the cycle starts again, so there is still no last floor.
// Pure data: layout knobs for src/sim/floorgen.js. Palettes live in src/view/lights.js
// under the same id.

export const BIOME_BAND = 10;

export const BIOMES = [
  {
    id: 0,
    key: "cave",
    name: "Mossy Caves",
    boss: "Moss Colossus",
    short: "Caves",
    roomShape: "blob",
    corridor: "wind",
    room: [3, 6],
    wideChance: 0.35,
    loopRate: 0.3,
    pillars: false,
    propRate: 0.22,
    props: { stalagmite: 4, rock: 3, mushroom: 3, crystal: 1 },
    // Trap weights (docs/traps.md §3.2); src/sim/floorgen.js caps each kind.
    traps: { spikes: 3, flameJet: 1, fireWall: 1, darts: 1, gong: 1 }
  },
  {
    id: 1,
    key: "temple",
    name: "Sunken Temple",
    boss: "Sunken Idol",
    short: "Temple",
    roomShape: "rect",
    corridor: "straight",
    room: [3, 7],
    wideChance: 0,
    loopRate: 0.35,
    pillars: true,
    propRate: 0.14,
    props: { urn: 3, rubble: 3, brazier: 2, statue: 1 },
    // Trap weights (docs/traps.md §3.2); src/sim/floorgen.js caps each kind.
    traps: { spikes: 2, darts: 4, flameJet: 1, fireWall: 1, gong: 1 }
  },
  {
    id: 2,
    key: "root",
    name: "Rootdeep",
    boss: "Rooted King",
    short: "Rootdeep",
    roomShape: "blob",
    corridor: "wind",
    room: [4, 7],
    wideChance: 0.5,
    loopRate: 0.25,
    pillars: false,
    propRate: 0.24,
    props: { root: 5, rock: 2, mushroom: 3 },
    // Trap weights (docs/traps.md §3.2); src/sim/floorgen.js caps each kind.
    traps: { spikes: 3, darts: 1, flameJet: 1, fireWall: 1, gong: 1 }
  },
  {
    id: 3,
    key: "crypt",
    name: "Slate Crypt",
    boss: "Slate Warden",
    short: "Crypt",
    roomShape: "rect",
    corridor: "straight",
    room: [3, 6],
    wideChance: 0,
    loopRate: 0.2,
    pillars: true,
    propRate: 0.16,
    props: { tomb: 3, candle: 3, urn: 2, rubble: 2 },
    // Trap weights (docs/traps.md §3.2); src/sim/floorgen.js caps each kind.
    traps: { spikes: 2, gong: 3, darts: 2, flameJet: 1, fireWall: 1 }
  },
  {
    id: 4,
    key: "forge",
    name: "Ember Forge",
    boss: "Ember Custodian",
    short: "Forge",
    roomShape: "rect",
    corridor: "wind",
    room: [4, 7],
    wideChance: 0.4,
    loopRate: 0.3,
    pillars: true,
    propRate: 0.18,
    props: { brazier: 2, anvil: 2, rock: 3, slag: 3 },
    // Trap weights (docs/traps.md §3.2); src/sim/floorgen.js caps each kind.
    traps: { spikes: 1, flameJet: 4, fireWall: 3, darts: 1, gong: 1 }
  }
];

export function biomeIndex(floorIndex) {
  const n = Math.max(1, Math.floor(Number(floorIndex) || 1));
  return Math.floor((n - 1) / BIOME_BAND) % BIOMES.length;
}

export function biomeFor(floorIndex) {
  return BIOMES[biomeIndex(floorIndex)];
}

// 1..BIOME_BAND: how deep into the current biome this floor is.
export function biomeDepth(floorIndex) {
  const n = Math.max(1, Math.floor(Number(floorIndex) || 1));
  return ((n - 1) % BIOME_BAND) + 1;
}

// True on the first floor of a biome band (floor 1, 11, 21, …).
export function biomeEntry(floorIndex) {
  return biomeDepth(floorIndex) === 1;
}
