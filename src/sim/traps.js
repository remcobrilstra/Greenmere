// Dungeon traps (docs/traps.md). Pure data and state machines: floorgen places
// them, src/play/traps.js steps them and applies damage, src/view/traps.js draws them.
//
// Three counterplay kinds:
//   cycling   — a fixed on/off rhythm, beaten by timing (flame jet)
//   constant  — always on until its switch is used (fire wall)
//   triggered — idle until stepped on, fires after a short wind-up, re-arms (spike plate)
//
// A trap covers part of one 4 m tile. `axis` is the way the corridor runs ("x" or
// "z"); `along` half-depth is measured on that axis, `across` on the other one.
// A `radius` makes the footprint a circle instead; `blast` is a larger circle the
// trap hits when it goes off (a rockfall springs on a small spot, lands wide).
//
// Effects while a hot trap touches a unit: `dmgMul` (× a skirmisher hit, once per
// firing or per `tick`), `slow` (speed multiplier while inside), `hold` (seconds
// rooted), `breaksMend`. `hurts: false` means the footprint does nothing itself
// (darts, gongs, ambushes). `blocks` marks a constant trap that shuts a corridor
// and must have a `switch` the route check can reach.

// Switched-off traps share run.killed with foes and chests, above CHEST_BASE:
// TRAP_BASE + id for a trap put out by the Warden (it leaves spoils), TRAP_SPENT + id
// for one that went off for good (a rung gong).
export const TRAP_BASE = 6000;
export const TRAP_SPENT = 7000;

export const TRAP_KINDS = {
  spikes: {
    counter: "triggered",
    along: 1.2,
    across: 1.2,
    // Walking across (6.4 m/s) takes ~0.47 s, sprinting (11.5 m/s) ~0.26 s.
    arm: 0.38,
    up: 0.55,
    rearm: 2.0,
    dmgMul: 1.2
  },
  flameJet: {
    counter: "cycling",
    along: 1.0,
    across: 2.0,
    glow: 0.9,
    fire: 1.4,
    off: 2.1,
    tick: 0.5,
    dmgMul: 0.6
  },
  fireWall: {
    counter: "constant",
    along: 0.9,
    across: 2.0,
    tick: 0.4,
    dmgMul: 1.4,
    blocks: true,
    switch: "valve"
  },
  // A small plate mid-corridor; the launcher at one end of the run looses a fan
  // of darts down its length. The plate itself does not hurt.
  darts: {
    counter: "triggered",
    along: 0.55,
    across: 0.55,
    arm: 0.3,
    up: 0.45,
    rearm: 3.0,
    dmgMul: 0.6,
    hurts: false,
    volley: { lanes: [-1.2, 0, 1.2], gap: 0.12, speed: 18, radius: 0.12 }
  },
  // A tripwire across a corridor mouth. Crossing it rings the gong once and wakes
  // the foes nearby; a strike cuts the wire quietly.
  gong: {
    counter: "triggered",
    along: 0.15,
    across: 2.0,
    arm: 0,
    up: 0.1,
    rearm: 1e9,
    dmgMul: 0,
    hurts: false,
    once: true,
    wakeSteps: 6
  },

  // ---- Mossy Caves ----
  // A mushroom cluster that puffs a poison cloud on a rhythm.
  sporePuff: {
    counter: "cycling",
    radius: 1.6,
    glow: 0.8,
    fire: 1.4,
    off: 2.2,
    tick: 0.5,
    dmgMul: 0.35,
    breaksMend: true
  },
  // Cracked, dusty floor: stepping on it brings stone down. A shadow grows first.
  rockfall: {
    counter: "triggered",
    radius: 0.9,
    blast: 1.5,
    arm: 0.8,
    up: 0.15,
    rearm: 1e9,
    dmgMul: 1.4,
    once: true
  },
  // A vent that fills the corridor with spores until its valve is shut.
  sporeVent: {
    counter: "constant",
    along: 1.0,
    across: 2.0,
    tick: 0.5,
    dmgMul: 0.5,
    breaksMend: true,
    blocks: true,
    switch: "valve"
  },

  // ---- Sunken Temple ----
  // A blade swinging across the corridor; cross while it is at the far side.
  pendulum: {
    counter: "cycling",
    along: 0.3,
    across: 2.0,
    period: 2.6,
    swing: 1.55,
    blade: 0.5,
    tick: 0.8,
    dmgMul: 1.3
  },
  // Knee-deep water across the corridor: slows everyone until the sluice is pulled.
  flood: {
    counter: "constant",
    along: 1.6,
    across: 2.0,
    tick: 1,
    dmgMul: 0,
    slow: 0.6,
    blocks: true,
    switch: "lever"
  },

  // ---- Rootdeep ----
  // Roots that lash out and hold whatever steps on them for a second.
  grasp: {
    counter: "triggered",
    along: 1.1,
    across: 1.1,
    arm: 0.25,
    up: 0.3,
    rearm: 3.0,
    dmgMul: 0,
    hold: 1.0
  },
  // Thorns that close the doorway behind the Warden until the room is cleared.
  thornWall: {
    counter: "triggered",
    along: 0.6,
    across: 2.0,
    arm: 0.6,
    up: 1e9,
    rearm: 1e9,
    dmgMul: 0,
    hurts: false,
    once: true,
    maxClosed: 30
  },
  // A briar thicket across the corridor; its root heart is struck out (3 hits).
  briar: {
    counter: "constant",
    along: 1.0,
    across: 2.0,
    tick: 0.5,
    dmgMul: 0.45,
    slow: 0.65,
    blocks: true,
    switch: "heart",
    heartHits: 3
  },

  // ---- Slate Crypt ----
  // A sarcophagus whose lid slides off as the Warden passes; foes climb out.
  sarcophagus: {
    counter: "triggered",
    radius: 2.3,
    arm: 0.5,
    up: 0.2,
    rearm: 1e9,
    dmgMul: 0,
    hurts: false,
    once: true,
    ambush: 2
  },
  // Three cursed candles: while any burns, foes in the room take less damage.
  // Each is snuffed with F.
  candles: {
    counter: "constant",
    radius: 0.01,
    dmgMul: 0,
    hurts: false,
    foeWard: 0.3,
    switch: "candle"
  },

  // ---- Ember Forge ----
  // A hammer on a post that lifts slowly and slams down.
  tripHammer: {
    counter: "cycling",
    radius: 1.5,
    glow: 1.1,
    fire: 0.3,
    off: 1.8,
    tick: 1,
    dmgMul: 2.0
  },
  // ---- Set pieces (phase 4) ----
  // A cracked tile that gives way: whoever is on it when it goes drops to the
  // next floor, hurt. It leaves a hole.
  collapse: {
    counter: "triggered",
    along: 1.3,
    across: 1.3,
    arm: 1.0,
    up: 0.2,
    rearm: 1e9,
    dmgMul: 1.5,
    hurts: false,
    once: true
  },
  // A quiet room whose doorways bar shut when the Warden reaches its middle;
  // a wave climbs in. The bars lift when the wave is dead.
  seal: {
    counter: "triggered",
    radius: 3.0,
    arm: 0.8,
    up: 1e9,
    rearm: 1e9,
    dmgMul: 0,
    hurts: false,
    once: true,
    maxClosed: 90
  },

  // ---- Boss hazards: called down on the Warden mid-fight, never on the boss ----
  bossFlame: {
    counter: "triggered",
    radius: 1.4,
    arm: 0.9,
    up: 1.0,
    rearm: 0.6,
    tick: 0.5,
    dmgMul: 0.8,
    once: true
  },
  bossFlood: {
    counter: "constant",
    radius: 6.5,
    tick: 1,
    dmgMul: 0,
    slow: 0.6
  },

  // Molten slag in a big room. No switch: walk around it.
  slagPool: {
    counter: "constant",
    radius: 1.5,
    tick: 0.5,
    dmgMul: 1.2,
    slow: 0.7
  }
};

// The foot circle a trap tests against: smaller than the body so grazing an edge is free.
export const TRAP_FOOT = 0.3;

export function trapDef(kind) {
  return TRAP_KINDS[kind] || null;
}

// Does the footprint act on what stands in it while the trap is hot?
export function trapFootprint(kind) {
  const def = trapDef(kind);
  return !!def && def.hurts !== false;
}

// Does standing in the trap's footprint while it is hot hurt?
export function trapHurts(kind) {
  const def = trapDef(kind);
  return !!def && def.hurts !== false && def.dmgMul > 0;
}

// The pendulum blade's offset across the corridor at time t (−swing … +swing).
export function pendulumAt(def, t, phase) {
  return Math.sin(((t / def.period) + (phase || 0)) * Math.PI * 2) * def.swing;
}

// Seconds to turn a valve; Delver rank 5 halves it.
export function valveSeconds(delverRank) {
  return delverRank >= 5 ? 0.6 : 1.2;
}

// Delver rank 1: plates and wires glint within this many metres (0: no glint).
// A `wary` affix gives its own range; the larger one counts.
export function trapSenseRange(delverRank, wary) {
  return Math.max(delverRank >= 1 ? 10 : 0, wary > 0 ? Math.round(wary) : 0);
}

// Delver rank 3, or any `wary` gear: traps the Warden has seen go on the map.
export function trapsOnMap(delverRank, wary) {
  return delverRank >= 3 || wary > 0;
}

// Trap damage after `trapward` gear (percent, capped at 60).
export function wardedTrapDamage(raw, trapward) {
  const cut = Math.max(0, Math.min(60, trapward || 0));
  return Math.max(1, Math.round(raw * (1 - cut / 100)));
}

// A slow multiplier and a hold time after `surefoot` gear (percent, capped at 90).
export function surefootSlow(slow, surefoot) {
  const keep = 1 - Math.max(0, Math.min(90, surefoot || 0)) / 100;
  return 1 - (1 - slow) * keep;
}
export function surefootHold(hold, surefoot) {
  return hold * (1 - Math.max(0, Math.min(90, surefoot || 0)) / 100);
}

// A dart in flight: { x, z, dx, dz, left }. Moves it; false once it is spent.
export function stepDart(dart, dt, speed) {
  const step = speed * dt;
  dart.x += dart.dx * step;
  dart.z += dart.dz * step;
  dart.left -= step;
  return dart.left > 0;
}

export function dartHits(dart, x, z, r, radius) {
  const dx = x - dart.x;
  const dz = z - dart.z;
  const reach = r + (radius || 0.12);
  return dx * dx + dz * dz <= reach * reach;
}

// Where a dart volley starts and how far it flies: from the launcher end of the
// run to the far end. `fromW`/`toW` are the two end cells' world centers.
export function dartVolley(def, axis, fromW, toW) {
  const along = axis === "z" ? toW.z - fromW.z : toW.x - fromW.x;
  const dir = along >= 0 ? 1 : -1;
  const dx = axis === "z" ? 0 : dir;
  const dz = axis === "z" ? dir : 0;
  const len = Math.abs(along) + 4;
  const out = [];
  const lanes = def.volley.lanes;
  for (let i = 0; i < lanes.length; i++) {
    out.push({
      x: fromW.x - dx * 1.6 + (axis === "z" ? lanes[i] : 0),
      z: fromW.z - dz * 1.6 + (axis === "z" ? 0 : lanes[i]),
      dx,
      dz,
      left: len,
      delay: i * def.volley.gap
    });
  }
  return out;
}

export function cyclePeriod(def) {
  return def.glow + def.fire + def.off;
}

// Where a cycling trap is in its rhythm at time t: "glow" (warning), "fire", or "off".
export function cycleStage(def, t, phase) {
  const period = cyclePeriod(def);
  let u = (t + (phase || 0) * period) % period;
  if (u < 0) u += period;
  if (u < def.glow) return { stage: "glow", u: u / def.glow };
  u -= def.glow;
  if (u < def.fire) return { stage: "fire", u: u / def.fire };
  return { stage: "off", u: (u - def.fire) / def.off };
}

// Live state for one placed trap.
export function makeTrapState(spec) {
  return {
    id: spec.id,
    kind: spec.kind,
    x: spec.x,
    z: spec.z,
    axis: spec.axis || "x",
    phase: spec.phase || 0,
    disabled: false,
    // triggered: "idle" | "arming" | "up" | "rearm"
    state: "idle",
    stateT: 0,
    // cycling: the current stage and its progress 0..1
    stage: "off",
    stageU: 0,
    hot: false,
    // Who this firing has hit (triggered) or when each target may be hit again (ticks).
    struck: new Set(),
    nextHit: new Map()
  };
}

// Is a circle at (x, z) with radius r inside the trap's footprint? `wide` tests
// the blast instead (where a sprung trap lands), when the kind has one.
export function trapHits(trap, x, z, r, wide) {
  const def = trapDef(trap.kind);
  if (!def) return false;
  const dx = x - trap.x;
  const dz = z - trap.z;
  const pad = r == null ? TRAP_FOOT : r;
  if (def.radius != null) {
    const reach = (wide && def.blast ? def.blast : def.radius) + pad;
    return dx * dx + dz * dz < reach * reach;
  }
  const along = trap.axis === "z" ? dz : dx;
  let across = trap.axis === "z" ? dx : dz;
  // The pendulum's footprint is its blade, wherever the swing has it.
  if (def.period) across -= trap.swing || 0;
  const half = def.period ? def.blade : def.across;
  return Math.abs(along) < def.along + pad && Math.abs(across) < half + pad;
}

// Advance one trap. `time` is the floor clock (cycling traps read it, so every
// jet keeps its rhythm whether or not anyone watches); `stepped` is true when a
// unit that may spring plates stands on it. Sets trap.hot.
export function stepTrap(trap, dt, time, stepped) {
  const def = trapDef(trap.kind);
  if (!def || trap.disabled) {
    trap.hot = false;
    return trap;
  }
  if (def.period) {
    trap.swing = pendulumAt(def, time, trap.phase);
    trap.hot = true;
    return trap;
  }
  if (def.counter === "cycling") {
    const s = cycleStage(def, time, trap.phase);
    trap.stage = s.stage;
    trap.stageU = s.u;
    trap.hot = s.stage === "fire";
    return trap;
  }
  if (def.counter === "constant") {
    trap.hot = true;
    return trap;
  }
  trap.stateT += dt;
  if (trap.state === "idle") {
    trap.stateT = 0;
    if (stepped) trap.state = "arming";
  } else if (trap.state === "arming" && trap.stateT >= def.arm) {
    trap.state = "up";
    trap.stateT = 0;
    trap.struck.clear();
  } else if (trap.state === "up" && trap.stateT >= def.up) {
    trap.state = "rearm";
    trap.stateT = 0;
  } else if (trap.state === "rearm" && trap.stateT >= def.rearm) {
    trap.state = "idle";
    trap.stateT = 0;
  }
  trap.hot = trap.state === "up";
  return trap;
}

// Should a hot trap damage `key` (a foe or "hero") now? Triggered traps hit each
// target once per firing; cycling and constant traps hit on contact, then every tick.
export function trapStrikes(trap, key, time) {
  if (!trap.hot) return false;
  const def = trapDef(trap.kind);
  if (!def) return false;
  if (def.counter === "triggered") {
    if (trap.struck.has(key)) return false;
    trap.struck.add(key);
    return true;
  }
  const next = trap.nextHit.get(key);
  if (next != null && time < next) return false;
  trap.nextHit.set(key, time + def.tick);
  return true;
}

// Route check (docs/traps.md §6). Walls are rock and every trap that shuts a
// corridor (`blocks`) counts as rock too. Returns those whose switch cannot be
// reached from the entrance. Empty means every one can be put out, so the whole
// floor opens up.
export function unreachableSwitches(plan) {
  const cols = plan.cols;
  const rows = plan.rows;
  const tiles = plan.tiles;
  const traps = plan.traps || [];
  const blocked = new Set();
  for (let i = 0; i < traps.length; i++) {
    const def = trapDef(traps[i].kind);
    if (def && def.blocks) blocked.add(traps[i].row * cols + traps[i].col);
  }
  const seen = new Uint8Array(tiles.length);
  const start = plan.entrance.row * cols + plan.entrance.col;
  if (tiles[start] === 1 && !blocked.has(start)) {
    seen[start] = 1;
    const q = [start];
    for (let qi = 0; qi < q.length; qi++) {
      const i = q[qi];
      const r = (i / cols) | 0;
      const c = i - r * cols;
      const next = [c > 0 ? i - 1 : -1, c + 1 < cols ? i + 1 : -1, r > 0 ? i - cols : -1, r + 1 < rows ? i + cols : -1];
      for (let k = 0; k < 4; k++) {
        const j = next[k];
        if (j < 0 || seen[j] || tiles[j] !== 1 || blocked.has(j)) continue;
        seen[j] = 1;
        q.push(j);
      }
    }
  }
  const bad = [];
  for (let i = 0; i < traps.length; i++) {
    const def = trapDef(traps[i].kind);
    if (!def || !def.blocks) continue;
    const sw = traps[i].sw;
    if (!sw || !seen[sw.row * cols + sw.col]) bad.push(traps[i]);
  }
  return bad;
}

// Gauntlet check (docs/traps.md §3.3): cycling traps of `kind` stand `spacing`
// metres apart down a corridor with the given phases. Is there a moment to set
// off, at a sprint, that carries the Warden down the middle untouched? Returns
// the longest such window of start times in seconds (0: none).
export const GAUNTLET_SPRINT = 11.5;
export function gauntletWindow(kind, phases, spacing, speed) {
  const def = trapDef(kind);
  if (!def) return 0;
  const v = speed || GAUNTLET_SPRINT;
  const n = phases.length;
  const first = -((n - 1) / 2) * spacing;
  const pad = TRAP_FOOT;
  const reach = (def.along || 0) + pad;
  const startS = first - reach - 0.5;
  const endS = -first + reach + 0.5;
  const span = (endS - startS) / v;
  const horizon = def.period ? def.period * 4 : cyclePeriod(def) * 4;
  const step = 0.02;
  const probe = { kind, x: 0, z: 0, axis: "x", swing: 0 };
  function hotAt(i, t) {
    if (def.period) {
      probe.swing = pendulumAt(def, t, phases[i]);
      return Math.abs(probe.swing) < def.blade + pad;
    }
    return cycleStage(def, t, phases[i]).stage === "fire";
  }
  let best = 0;
  let run = 0;
  for (let t0 = 0; t0 < horizon; t0 += step) {
    let clear = true;
    for (let t = 0; t <= span && clear; t += 1 / 60) {
      const s = startS + v * t;
      for (let i = 0; i < n; i++) {
        const at = first + i * spacing;
        if (Math.abs(s - at) < reach && hotAt(i, t0 + t)) {
          clear = false;
          break;
        }
      }
    }
    run = clear ? run + step : 0;
    if (run > best) best = run;
  }
  return best;
}
