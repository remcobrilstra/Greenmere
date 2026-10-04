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

// Switched-off traps share run.killed with foes and chests, above CHEST_BASE.
export const TRAP_BASE = 6000;

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
    dmgMul: 1.4
  }
};

// The foot circle a trap tests against: smaller than the body so grazing an edge is free.
export const TRAP_FOOT = 0.3;

export function trapDef(kind) {
  return TRAP_KINDS[kind] || null;
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

// Is a circle at (x, z) with radius r inside the trap's footprint?
export function trapHits(trap, x, z, r) {
  const def = trapDef(trap.kind);
  if (!def) return false;
  const dx = x - trap.x;
  const dz = z - trap.z;
  const along = trap.axis === "z" ? dz : dx;
  const across = trap.axis === "z" ? dx : dz;
  const pad = r == null ? TRAP_FOOT : r;
  return Math.abs(along) < def.along + pad && Math.abs(across) < def.across + pad;
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

// Route check (docs/traps.md §6). Walls are rock and every constant trap counts as
// rock too; returns the constant traps whose switch cannot be reached from the
// entrance. Empty means every wall can be put out, so the whole floor opens up.
export function unreachableSwitches(plan) {
  const cols = plan.cols;
  const rows = plan.rows;
  const tiles = plan.tiles;
  const traps = plan.traps || [];
  const blocked = new Set();
  for (let i = 0; i < traps.length; i++) {
    const def = trapDef(traps[i].kind);
    if (def && def.counter === "constant") blocked.add(traps[i].row * cols + traps[i].col);
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
    if (!def || def.counter !== "constant") continue;
    const sw = traps[i].sw;
    if (!sw || !seen[sw.row * cols + sw.col]) bad.push(traps[i]);
  }
  return bad;
}
