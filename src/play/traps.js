import { trapDamage, arcHit } from "../sim/balance.js";
import {
  TRAP_BASE,
  TRAP_SPENT,
  TRAP_FOOT,
  makeTrapState,
  stepTrap,
  trapDef,
  trapHits,
  trapHurts,
  trapStrikes,
  stepDart,
  dartHits,
  dartVolley,
  valveSeconds,
  trapSenseRange,
  trapsOnMap
} from "../sim/traps.js";
import { syncTrapView, syncValveView, syncDarts } from "../view/traps.js";

// Runs the floor's traps (docs/traps.md): steps each one from src/sim/traps.js,
// hurts the Warden through rt.applyIncoming and foes through rt.woundFoe, flies
// dart volleys, rings gongs, and handles the valve that puts a fire wall out.
// combat.js calls rt.tickTraps every dungeon frame; live = false while combat is
// paused (only the art moves).

const VALVE_REACH = 1.9;
const VALVE_MOVE = 0.6;
const FOE_HIT = "#ff9a4a";

export function attachTraps(rt) {
  let builtFor = null;
  let traps = [];
  let views = [];
  let darts = [];
  let time = 0;
  // The valve being turned: { trap, view, t, total, x0, z0, hp0 }.
  let turning = null;

  function session() {
    return rt.session;
  }

  function delverRank() {
    const s = session();
    return s && s.tracks && s.tracks.delver ? s.tracks.delver : 0;
  }

  function remember(id) {
    const run = session() && session().run;
    if (!run) return;
    if (!Array.isArray(run.killed)) run.killed = [];
    if (run.killed.indexOf(id) < 0) run.killed.push(id);
    if (rt.markSave && !session().devRun) rt.markSave("dungeon");
  }

  function sync() {
    const root = rt.dungeonRoot;
    if (root === builtFor) return;
    builtFor = root;
    turning = null;
    time = 0;
    traps = [];
    darts = [];
    views = (root && root.userData.traps) || [];
    const run = session() && session().run;
    const killed = (run && run.killed) || [];
    for (let i = 0; i < views.length; i++) {
      const v = views[i];
      const trap = makeTrapState(v);
      const putOut = killed.indexOf(TRAP_BASE + v.id) >= 0;
      trap.disabled = putOut || killed.indexOf(TRAP_SPENT + v.id) >= 0;
      // Spoils the Warden has not picked up yet lie where they fell.
      if (putOut && rt.spawnTrapSpoils) rt.spawnTrapSpoils(TRAP_BASE + v.id, spoilsAt(v).x, spoilsAt(v).z, false);
      traps.push(trap);
    }
  }

  // Spoils land beside a valve, or on a cut wire.
  function spoilsAt(view) {
    return view.sw ? { x: view.sw.x, z: view.sw.z } : { x: view.x, z: view.z };
  }

  function putOut(trap, view, line) {
    trap.disabled = true;
    trap.hot = false;
    remember(TRAP_BASE + trap.id);
    const at = spoilsAt(view);
    if (rt.spawnTrapSpoils) rt.spawnTrapSpoils(TRAP_BASE + trap.id, at.x, at.z, true);
    if (rt.say) rt.say(line);
  }

  // Brutes, elites and bosses spring plates; the rest step light. Only the
  // Warden trips a gong's wire: the foes know their own halls.
  function springs(e, kind) {
    if (kind === "gong") return false;
    return e.archetype === "brute" || !!e.eliteAffix || !!e.boss;
  }

  // ---- Gong ----
  function ringGong(trap, view) {
    const def = trapDef("gong");
    trap.disabled = true;
    trap.ringT = 2.4;
    remember(TRAP_SPENT + trap.id);
    const plan = rt.plan;
    let woken = 0;
    if (plan) {
      // Walk the tiles out from the gong: every foe within wakeSteps comes running.
      const cols = plan.cols;
      const rows = plan.rows;
      const cell = (x, z) => ({ c: Math.round(x / 4 + (cols - 1) / 2), r: Math.round(z / 4 + (rows - 1) / 2) });
      const start = cell(view.x, view.z);
      const dist = new Int16Array(plan.tiles.length).fill(-1);
      const q = [start.r * cols + start.c];
      dist[q[0]] = 0;
      for (let qi = 0; qi < q.length; qi++) {
        const i = q[qi];
        if (dist[i] >= def.wakeSteps) continue;
        const r = (i / cols) | 0;
        const c = i - r * cols;
        const next = [c > 0 ? i - 1 : -1, c + 1 < cols ? i + 1 : -1, r > 0 ? i - cols : -1, r + 1 < rows ? i + cols : -1];
        for (let k = 0; k < 4; k++) {
          const j = next[k];
          if (j < 0 || dist[j] >= 0 || plan.tiles[j] !== 1) continue;
          dist[j] = dist[i] + 1;
          q.push(j);
        }
      }
      const enemies = rt.enemies || [];
      for (let k = 0; k < enemies.length; k++) {
        const e = enemies[k];
        if (!e || !(e.hp > 0) || e.state !== "idle") continue;
        const at = cell(e.x, e.z);
        if (at.c < 0 || at.r < 0 || at.c >= cols || at.r >= rows) continue;
        if (dist[at.r * cols + at.c] < 0) continue;
        e.state = "approach";
        e.wanderTo = null;
        woken++;
      }
    }
    rt.camShake = Math.max(rt.camShake || 0, 0.35);
    if (rt.say) rt.say(woken ? "A gong booms through the halls. Something stirs." : "A gong booms through the empty halls.");
    return woken;
  }

  // A swing that reaches the wire cuts it before anyone hears.
  function strikeTraps(origin, forward, range, half) {
    sync();
    for (let i = 0; i < traps.length; i++) {
      const trap = traps[i];
      if (trap.kind !== "gong" || trap.disabled) continue;
      const v = views[i];
      // Nearest point on the wire, which spans the corridor across its axis.
      const along = v.axis === "z" ? "x" : "z";
      const pt = { x: v.x, z: v.z };
      pt[along] = Math.max(v[along] - 1.9, Math.min(v[along] + 1.9, origin[along]));
      if (!arcHit(origin, forward, pt, range, half, 0.3)) continue;
      putOut(trap, v, "You cut the tripwire. The gong stays silent.");
      return true;
    }
    return false;
  }

  // ---- Darts ----
  function loose(trap, view, floor) {
    if (!view.fromW || !view.toW) return;
    const def = trapDef("darts");
    const dmg = trapDamage(floor, def.dmgMul);
    const volley = dartVolley(def, view.axis, view.fromW, view.toW);
    for (let i = 0; i < volley.length; i++) {
      volley[i].dmg = dmg;
      darts.push(volley[i]);
    }
  }

  function stepDarts(dt, live) {
    if (!darts.length) return;
    const def = trapDef("darts");
    const p = rt.player.position;
    const enemies = rt.enemies || [];
    for (let i = darts.length - 1; i >= 0; i--) {
      const d = darts[i];
      if (d.delay > 0) {
        d.delay -= dt;
        continue;
      }
      let spent = !stepDart(d, dt, def.volley.speed);
      if (live && !spent && !rt.vitals.deathLock && dartHits(d, p.x, p.z, 0.42, def.volley.radius)) {
        if (rt.applyIncoming) rt.applyIncoming(d.dmg);
        spent = true;
      }
      for (let k = 0; live && !spent && k < enemies.length; k++) {
        const e = enemies[k];
        if (!e || !(e.hp > 0) || !dartHits(d, e.x, e.z, e.hurt || 0.45, def.volley.radius)) continue;
        if (rt.woundFoe) rt.woundFoe(e, d.dmg, FOE_HIT);
        spent = true;
      }
      if (spent) darts.splice(i, 1);
    }
  }

  function tickTraps(dt, live) {
    sync();
    if (!traps.length) return;
    time += dt;
    const p = rt.player.position;
    const enemies = rt.enemies || [];
    const run = session() && session().run;
    const floor = run ? run.floorIndex : 1;
    const sense = trapSenseRange(delverRank());
    for (let i = 0; i < traps.length; i++) {
      const trap = traps[i];
      const view = views[i];
      if (trap.ringT > 0) trap.ringT = Math.max(0, trap.ringT - dt);
      let stepped = false;
      if (live && !trap.disabled) {
        stepped = trapHits(trap, p.x, p.z, TRAP_FOOT);
        for (let k = 0; k < enemies.length && !stepped; k++) {
          const e = enemies[k];
          if (e && e.hp > 0 && springs(e, trap.kind) && trapHits(trap, e.x, e.z, TRAP_FOOT)) stepped = true;
        }
      }
      const was = trap.state;
      stepTrap(trap, dt, time, stepped);
      if (live && trap.state === "up" && was !== "up") {
        if (trap.kind === "darts") loose(trap, view, floor);
        else if (trap.kind === "gong") ringGong(trap, view);
      }
      if (live && trap.hot && trapHurts(trap.kind)) {
        const dmg = trapDamage(floor, trapDef(trap.kind).dmgMul);
        if (!rt.vitals.deathLock && trapHits(trap, p.x, p.z, TRAP_FOOT) && trapStrikes(trap, "hero", time) && rt.applyIncoming) {
          rt.applyIncoming(dmg);
        }
        for (let k = 0; k < enemies.length; k++) {
          const e = enemies[k];
          if (!e || !(e.hp > 0)) continue;
          if (!trapHits(trap, e.x, e.z, (e.hurt || 0.45) * 0.6)) continue;
          if (trapStrikes(trap, e, time) && rt.woundFoe) rt.woundFoe(e, dmg, FOE_HIT);
        }
      }
      // Delver trap sense: plates and wires glint as the Warden draws near.
      let glint = 0;
      if (sense > 0 && !trap.disabled && trapDef(trap.kind).counter === "triggered") {
        const d = Math.hypot(p.x - view.x, p.z - view.z);
        if (d < sense) glint = 1 - (d / sense) * 0.6;
      }
      syncTrapView(view, trap, time, glint);
    }
    stepDarts(dt, live);
    if (builtFor) syncDarts(builtFor.userData.trapDarts, darts);
    tickValve(dt);
  }

  // ---- Valves ----
  function valveNear() {
    if (rt.space !== "dungeon") return null;
    sync();
    const p = rt.player.position;
    let best = null;
    let bestD = VALVE_REACH;
    for (let i = 0; i < traps.length; i++) {
      const v = views[i];
      if (!v.sw || traps[i].disabled) continue;
      const d = Math.hypot(p.x - v.sw.x, p.z - v.sw.z);
      if (d <= bestD) {
        bestD = d;
        best = { trap: traps[i], view: v };
      }
    }
    return best;
  }

  function tryUseValve() {
    if (turning || rt.vitals.deathLock) return !!turning;
    const near = valveNear();
    if (!near) return false;
    if (rt.cancelMend) rt.cancelMend();
    if (rt.cancelExtract) rt.cancelExtract();
    const p = rt.player.position;
    turning = { trap: near.trap, view: near.view, t: 0, total: valveSeconds(delverRank()), x0: p.x, z0: p.z, hp0: rt.vitals.hp };
    if (rt.say) rt.say("You put your weight to the valve…");
    return true;
  }

  function tickValve(dt) {
    if (!turning) return;
    const p = rt.player.position;
    const moved = Math.hypot(p.x - turning.x0, p.z - turning.z0);
    // Walking off or taking a hit lets the wheel spin back.
    if (moved > VALVE_MOVE || rt.vitals.hp < turning.hp0 || rt.vitals.deathLock || rt.space !== "dungeon") {
      syncValveView(turning.view, 0, time);
      turning = null;
      return;
    }
    turning.t += dt;
    const u = Math.min(1, turning.t / turning.total);
    syncValveView(turning.view, u, time);
    if (u < 1) return;
    const trap = turning.trap;
    const view = turning.view;
    turning = null;
    putOut(trap, view, "The valve groans shut. The fire wall gutters out.");
  }

  // Traps for the minimap and the floor map: only with Delver rank 3.
  function trapMarks() {
    if (rt.space !== "dungeon" || !trapsOnMap(delverRank())) return [];
    sync();
    const out = [];
    for (let i = 0; i < traps.length; i++) out.push({ x: views[i].x, z: views[i].z, kind: traps[i].kind, off: traps[i].disabled });
    return out;
  }

  const baseCastInfo = rt.castInfo;
  rt.castInfo = function () {
    if (turning) return { kind: "valve", name: "Valve", t: turning.t, total: turning.total };
    return baseCastInfo ? baseCastInfo() : null;
  };

  rt.tickTraps = tickTraps;
  rt.strikeTraps = strikeTraps;
  rt.valveNear = valveNear;
  rt.tryUseValve = tryUseValve;
  rt.trapMarks = trapMarks;
  rt.trapStates = function () {
    sync();
    return traps;
  };
  rt.trapDarts = function () {
    return darts;
  };
}
