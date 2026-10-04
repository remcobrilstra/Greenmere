import { trapDamage } from "../sim/balance.js";
import { TRAP_BASE, TRAP_FOOT, makeTrapState, stepTrap, trapDef, trapHits, trapStrikes } from "../sim/traps.js";
import { syncTrapView, syncValveView } from "../view/traps.js";

// Runs the floor's traps (docs/traps.md): steps each one from src/sim/traps.js,
// hurts the Warden through rt.applyIncoming and foes through rt.woundFoe, and
// handles the valve that puts a fire wall out. combat.js calls rt.tickTraps
// every dungeon frame; live = false while combat is paused (only the art moves).

const VALVE_REACH = 1.9;
const VALVE_SECONDS = 1.2;
const VALVE_MOVE = 0.6;
const FOE_HIT = "#ff9a4a";

export function attachTraps(rt) {
  let builtFor = null;
  let traps = [];
  let views = [];
  let time = 0;
  // The valve being turned: { trap, view, t, x0, z0, hp0 }.
  let turning = null;

  function session() {
    return rt.session;
  }

  function sync() {
    const root = rt.dungeonRoot;
    if (root === builtFor) return;
    builtFor = root;
    turning = null;
    time = 0;
    traps = [];
    views = (root && root.userData.traps) || [];
    const run = session() && session().run;
    const killed = (run && run.killed) || [];
    for (let i = 0; i < views.length; i++) {
      const v = views[i];
      const trap = makeTrapState(v);
      trap.disabled = killed.indexOf(TRAP_BASE + v.id) >= 0;
      traps.push(trap);
    }
  }

  // Brutes and elites spring plates; skirmishers, spitters and shades step light.
  function springs(e) {
    return e.archetype === "brute" || !!e.eliteAffix || !!e.boss;
  }

  function tickTraps(dt, live) {
    sync();
    if (!traps.length) return;
    time += dt;
    const p = rt.player.position;
    const enemies = rt.enemies || [];
    const run = session() && session().run;
    const floor = run ? run.floorIndex : 1;
    for (let i = 0; i < traps.length; i++) {
      const trap = traps[i];
      let stepped = false;
      if (live) {
        stepped = trapHits(trap, p.x, p.z, TRAP_FOOT);
        for (let k = 0; k < enemies.length && !stepped; k++) {
          const e = enemies[k];
          if (e && e.hp > 0 && springs(e) && trapHits(trap, e.x, e.z, TRAP_FOOT)) stepped = true;
        }
      }
      stepTrap(trap, dt, time, stepped);
      if (live && trap.hot) {
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
      syncTrapView(views[i], trap, time);
    }
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
    turning = { trap: near.trap, view: near.view, t: 0, x0: p.x, z0: p.z, hp0: rt.vitals.hp };
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
    const u = Math.min(1, turning.t / VALVE_SECONDS);
    syncValveView(turning.view, u, time);
    if (u < 1) return;
    const trap = turning.trap;
    turning = null;
    trap.disabled = true;
    trap.hot = false;
    const run = session() && session().run;
    if (run) {
      if (!Array.isArray(run.killed)) run.killed = [];
      if (run.killed.indexOf(TRAP_BASE + trap.id) < 0) run.killed.push(TRAP_BASE + trap.id);
      if (rt.markSave && !session().devRun) rt.markSave("dungeon");
    }
    if (rt.say) rt.say("The valve groans shut. The fire wall gutters out.");
  }

  const baseCastInfo = rt.castInfo;
  rt.castInfo = function () {
    if (turning) return { kind: "valve", name: "Valve", t: turning.t, total: VALVE_SECONDS };
    return baseCastInfo ? baseCastInfo() : null;
  };

  rt.tickTraps = tickTraps;
  rt.valveNear = valveNear;
  rt.tryUseValve = tryUseValve;
  rt.trapStates = function () {
    sync();
    return traps;
  };
}
