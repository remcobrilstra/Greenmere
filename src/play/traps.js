import { trapDamage, arcHit } from "../sim/balance.js";
import {
  TRAP_BASE,
  TRAP_SPENT,
  TRAP_FOOT,
  makeTrapState,
  stepTrap,
  trapDef,
  trapHits,
  trapFootprint,
  trapStrikes,
  stepDart,
  dartHits,
  dartVolley,
  valveSeconds,
  trapSenseRange,
  trapsOnMap,
  wardedTrapDamage,
  surefootSlow,
  surefootHold
} from "../sim/traps.js";
import { syncTrapView, syncValveView, syncCandleView, syncDarts } from "../view/traps.js";

// Runs the floor's traps (docs/traps.md): steps each one from src/sim/traps.js,
// hurts, slows and roots the Warden (rt.applyIncoming, rt.trapSlow, rt.trapHold)
// and foes (rt.woundFoe, e.trapSlow, e.trapHold), flies dart volleys, rings gongs,
// opens sarcophagi, seals rooms with thorns, and runs the switches: valves and
// levers (F, held), root hearts (struck), cursed candles (F, held, one by one).
// combat.js calls rt.tickTraps every dungeon frame; live = false while combat is
// paused (only the art moves).

const SWITCH_REACH = 1.9;
const CANDLE_REACH = 1.6;
const CANDLE_SECONDS = 0.5;
const SWITCH_MOVE = 0.6;
const FOE_HIT = "#ff9a4a";

// What the F prompt says at each switch, and the cast bar name.
const SWITCH_TEXT = {
  fireWall: { label: "Close the valve", sub: "Puts out the fire wall", cast: "Valve", done: "The valve groans shut. The fire wall gutters out." },
  sporeVent: { label: "Close the valve", sub: "Stops the spore vent", cast: "Valve", done: "The valve groans shut. The spores settle." },
  flood: { label: "Pull the sluice lever", sub: "Drains the channel", cast: "Lever", done: "The sluice opens. The water drains away." },
  candles: { label: "Snuff the candle", sub: "The cursed light wards the foes here", cast: "Candle", done: "The last cursed candle gutters out." }
};

export function attachTraps(rt) {
  let builtFor = null;
  let traps = [];
  let views = [];
  let darts = [];
  let time = 0;
  // The switch being worked: { trap, view, part?, t, total, x0, z0, hp0 }.
  let turning = null;

  function session() {
    return rt.session;
  }

  function delverRank() {
    const s = session();
    return s && s.tracks && s.tracks.delver ? s.tracks.delver : 0;
  }

  function gear(key) {
    const s = session();
    return s && s[key] > 0 ? s[key] : 0;
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
      const out = killed.indexOf(TRAP_BASE + v.id) >= 0;
      trap.disabled = out || killed.indexOf(TRAP_SPENT + v.id) >= 0;
      if (trap.disabled && v.parts) for (const p of v.parts) p.lit = false;
      // Spoils the Warden has not picked up yet lie where they fell.
      if (out && rt.spawnTrapSpoils) {
        const at = spoilsAt(v);
        rt.spawnTrapSpoils(TRAP_BASE + v.id, at.x, at.z, false);
      }
      traps.push(trap);
    }
  }

  // Spoils land beside a switch, or where the trap stood.
  function spoilsAt(view) {
    if (view.sw) return { x: view.sw.x, z: view.sw.z };
    if (view.parts && view.parts.length) return { x: view.parts[0].x, z: view.parts[0].z };
    return { x: view.x, z: view.z };
  }

  function putOut(trap, view, line) {
    trap.disabled = true;
    trap.hot = false;
    remember(TRAP_BASE + trap.id);
    const at = spoilsAt(view);
    if (rt.spawnTrapSpoils) rt.spawnTrapSpoils(TRAP_BASE + trap.id, at.x, at.z, true);
    if (rt.say) rt.say(line);
  }

  function spend(trap) {
    trap.disabled = true;
    trap.hot = false;
    remember(TRAP_SPENT + trap.id);
  }

  // Trapwise elites know every trap: nothing springs under them or touches them.
  function wise(e) {
    return e.eliteAffix === "trapwise";
  }

  // Brutes, elites and bosses spring plates; the rest step light. Only the
  // Warden trips a gong's wire or wakes a sarcophagus.
  function springs(e, kind) {
    if (kind === "gong" || kind === "sarcophagus" || kind === "thornWall" || wise(e)) return false;
    return e.archetype === "brute" || !!e.eliteAffix || !!e.boss;
  }

  function inRoom(room, x, z) {
    return !!room && x >= room.x0 && x < room.x1 && z >= room.z0 && z < room.z1;
  }

  function foesIn(room) {
    let n = 0;
    const enemies = rt.enemies || [];
    for (let k = 0; k < enemies.length; k++) {
      const e = enemies[k];
      if (e && e.hp > 0 && inRoom(room, e.x, e.z)) n++;
    }
    return n;
  }

  // ---- Gong ----
  function ringGong(trap, view) {
    const def = trapDef("gong");
    spend(trap);
    trap.ringT = 2.4;
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

  // ---- Thorn wall ----
  // The doorway cell turns to rock in the floor plan while the thorns stand, so
  // walking, sight lines and the maps all treat it as wall.
  function setDoor(view, solid) {
    const plan = rt.plan;
    if (!plan || view.col == null) return;
    plan.tiles[view.row * plan.cols + view.col] = solid ? 0 : 1;
  }

  function stepThorns(trap, view, dt, live) {
    const def = trapDef("thornWall");
    if (trap.openT > 0) trap.openT += dt;
    if (trap.disabled) return;
    const p = rt.player.position;
    if (trap.state === "idle") {
      // The Warden steps into a room that still holds its pack.
      if (live && inRoom(view.room, p.x, p.z) && foesIn(view.room) > 0) {
        trap.state = "arming";
        trap.stateT = 0;
        if (rt.say) rt.say("Thorns rise in the doorway behind you.");
      }
      return;
    }
    trap.stateT += dt;
    if (trap.state === "arming") {
      // Nobody gets crushed: wait while anyone stands in the doorway.
      if (trapHits(trap, p.x, p.z, 0.45)) trap.stateT = Math.min(trap.stateT, def.arm * 0.5);
      if (trap.stateT >= def.arm) {
        trap.state = "up";
        trap.stateT = 0;
        setDoor(view, true);
      }
      return;
    }
    if (trap.state === "up" && (foesIn(view.room) === 0 || trap.stateT >= def.maxClosed)) {
      setDoor(view, false);
      spend(trap);
      trap.openT = 0.0001;
      if (rt.say) rt.say("The thorns wither back from the doorway.");
    }
  }

  // ---- Strikes: tripwires and root hearts ----
  function strikeTraps(origin, forward, range, half) {
    sync();
    for (let i = 0; i < traps.length; i++) {
      const trap = traps[i];
      if (trap.disabled) continue;
      const v = views[i];
      if (trap.kind === "gong") {
        // Nearest point on the wire, which spans the corridor across its axis.
        const across = v.axis === "z" ? "x" : "z";
        const pt = { x: v.x, z: v.z };
        pt[across] = Math.max(v[across] - 1.9, Math.min(v[across] + 1.9, origin[across]));
        if (!arcHit(origin, forward, pt, range, half, 0.3)) continue;
        putOut(trap, v, "You cut the tripwire. The gong stays silent.");
        return true;
      }
      if (trap.kind === "briar" && v.sw && arcHit(origin, forward, { x: v.sw.x, z: v.sw.z }, range, half, 0.45)) {
        trap.heartHits = (trap.heartHits || 0) + 1;
        trap.flashT = 0.15;
        if (trap.heartHits >= trapDef("briar").heartHits) {
          trap.witherT = 1;
          putOut(trap, v, "The root heart bursts. The briars wither.");
        } else if (rt.say) {
          rt.say("The root heart shudders.");
        }
        return true;
      }
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
        if (rt.applyIncoming) rt.applyIncoming(wardedTrapDamage(d.dmg, gear("trapward")));
        spent = true;
      }
      for (let k = 0; live && !spent && k < enemies.length; k++) {
        const e = enemies[k];
        if (!e || !(e.hp > 0) || wise(e) || !dartHits(d, e.x, e.z, e.hurt || 0.45, def.volley.radius)) continue;
        if (rt.woundFoe) rt.woundFoe(e, d.dmg, FOE_HIT);
        spent = true;
      }
      if (spent) darts.splice(i, 1);
    }
  }

  // ---- Footprint effects ----
  function touchHero(trap, def, dmg, wide) {
    const p = rt.player.position;
    if (rt.vitals.deathLock || !trapHits(trap, p.x, p.z, TRAP_FOOT, wide)) return;
    const sure = gear("surefoot");
    if (def.slow) rt.trapSlow = Math.min(rt.trapSlow, surefootSlow(def.slow, sure));
    if (!trapStrikes(trap, "hero", time)) return;
    if (dmg > 0 && rt.applyIncoming) rt.applyIncoming(wardedTrapDamage(dmg, gear("trapward")));
    if (def.hold) rt.trapHold = Math.max(rt.trapHold || 0, surefootHold(def.hold, sure));
    if (def.breaksMend && rt.cancelMend) rt.cancelMend();
  }

  function touchFoes(trap, def, dmg, wide) {
    const enemies = rt.enemies || [];
    for (let k = 0; k < enemies.length; k++) {
      const e = enemies[k];
      if (!e || !(e.hp > 0) || wise(e)) continue;
      if (!trapHits(trap, e.x, e.z, (e.hurt || 0.45) * 0.6, wide)) continue;
      if (def.slow) e.trapSlow = Math.min(e.trapSlow || 1, def.slow);
      if (!trapStrikes(trap, e, time)) continue;
      if (dmg > 0 && rt.woundFoe) rt.woundFoe(e, dmg, FOE_HIT);
      if (def.hold) e.trapHold = Math.max(e.trapHold || 0, def.hold);
    }
  }

  function tickTraps(dt, live) {
    sync();
    rt.trapSlow = 1;
    if (rt.trapHold > 0) rt.trapHold = Math.max(0, rt.trapHold - dt);
    const enemies = rt.enemies || [];
    for (let k = 0; k < enemies.length; k++) if (enemies[k]) enemies[k].trapSlow = 1;
    if (!traps.length) return;
    time += dt;
    const p = rt.player.position;
    const run = session() && session().run;
    const floor = run ? run.floorIndex : 1;
    const sense = trapSenseRange(delverRank(), gear("wary"));
    for (let i = 0; i < traps.length; i++) {
      const trap = traps[i];
      const view = views[i];
      const def = trapDef(trap.kind);
      if (trap.ringT > 0) trap.ringT = Math.max(0, trap.ringT - dt);
      if (trap.flashT > 0) trap.flashT = Math.max(0, trap.flashT - dt);
      if (trap.witherT > 0) trap.witherT = Math.max(0, trap.witherT - dt * 1.5);
      if (trap.kind === "thornWall") {
        stepThorns(trap, view, dt, live);
        syncTrapView(view, trap, time, 0);
        continue;
      }
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
        else if (trap.kind === "sarcophagus") {
          const n = rt.spawnAmbush ? rt.spawnAmbush(view.x, view.z, def.ambush) : 0;
          if (rt.say) rt.say(n ? "The lid grinds aside. The dead climb out." : "The lid grinds aside. The coffin is empty.");
        }
      }
      if (live && trap.hot && trapFootprint(trap.kind)) {
        const dmg = def.dmgMul > 0 ? trapDamage(floor, def.dmgMul) : 0;
        const wide = !!def.blast;
        touchHero(trap, def, dmg, wide);
        touchFoes(trap, def, dmg, wide);
      }
      // A one-shot trap that has gone off stays spent.
      if (def.once && was === "up" && trap.state !== "up" && !trap.disabled) spend(trap);
      // Delver trap sense: plates and wires glint as the Warden draws near.
      let glint = 0;
      if (sense > 0 && !trap.disabled && def.counter === "triggered") {
        const d = Math.hypot(p.x - view.x, p.z - view.z);
        if (d < sense) glint = 1 - (d / sense) * 0.6;
      }
      syncTrapView(view, trap, time, glint);
    }
    stepDarts(dt, live);
    if (builtFor) syncDarts(builtFor.userData.trapDarts, darts);
    tickSwitch(dt);
  }

  // Cursed candles: foes standing in their room take less damage while any burns.
  function foeDamageMul(e) {
    if (!e || !traps.length) return 1;
    for (let i = 0; i < traps.length; i++) {
      const trap = traps[i];
      if (trap.kind !== "candles" || trap.disabled) continue;
      if (inRoom(views[i].room, e.x, e.z)) return 1 - trapDef("candles").foeWard;
    }
    return 1;
  }

  // ---- Switches worked with F: valves, levers, candles ----
  function switchNear() {
    if (rt.space !== "dungeon") return null;
    sync();
    const p = rt.player.position;
    let best = null;
    let bestD = SWITCH_REACH;
    for (let i = 0; i < traps.length; i++) {
      const v = views[i];
      const trap = traps[i];
      if (trap.disabled) continue;
      if (v.sw && v.sw.type !== "heart") {
        const d = Math.hypot(p.x - v.sw.x, p.z - v.sw.z);
        if (d <= bestD) {
          bestD = d;
          best = { trap, view: v, part: null };
        }
      }
      for (const part of v.parts || []) {
        if (!part.lit) continue;
        const d = Math.hypot(p.x - part.x, p.z - part.z);
        if (d <= Math.min(bestD, CANDLE_REACH)) {
          bestD = d;
          best = { trap, view: v, part };
        }
      }
    }
    if (best) Object.assign(best, SWITCH_TEXT[best.trap.kind] || SWITCH_TEXT.fireWall);
    return best;
  }

  function tryUseSwitch() {
    if (turning || rt.vitals.deathLock) return !!turning;
    const near = switchNear();
    if (!near) return false;
    if (rt.cancelMend) rt.cancelMend();
    if (rt.cancelExtract) rt.cancelExtract();
    const p = rt.player.position;
    const total = near.part ? CANDLE_SECONDS : valveSeconds(delverRank());
    turning = { trap: near.trap, view: near.view, part: near.part, cast: near.cast, done: near.done, t: 0, total, x0: p.x, z0: p.z, hp0: rt.vitals.hp };
    if (rt.say && !near.part) rt.say(near.view.sw && near.view.sw.type === "lever" ? "You haul on the lever…" : "You put your weight to the valve…");
    return true;
  }

  function tickSwitch(dt) {
    if (!turning) return;
    const p = rt.player.position;
    const moved = Math.hypot(p.x - turning.x0, p.z - turning.z0);
    // Walking off or taking a hit lets it go.
    if (moved > SWITCH_MOVE || rt.vitals.hp < turning.hp0 || rt.vitals.deathLock || rt.space !== "dungeon") {
      if (turning.part) syncCandleView(turning.part, 0);
      else syncValveView(turning.view, 0, time);
      turning = null;
      return;
    }
    turning.t += dt;
    const u = Math.min(1, turning.t / turning.total);
    if (turning.part) syncCandleView(turning.part, u);
    else syncValveView(turning.view, u, time);
    if (u < 1) return;
    const done = turning;
    turning = null;
    if (done.part) {
      done.part.lit = false;
      syncCandleView(done.part, 0);
      if ((done.view.parts || []).some((c) => c.lit)) {
        if (rt.say) rt.say("The candle hisses out. The others still burn.");
        return;
      }
    }
    putOut(done.trap, done.view, done.done);
  }

  // Traps for the minimap and the floor map: Delver rank 3 or wary gear.
  function trapMarks() {
    if (rt.space !== "dungeon" || !trapsOnMap(delverRank(), gear("wary"))) return [];
    sync();
    const out = [];
    for (let i = 0; i < traps.length; i++) out.push({ x: views[i].x, z: views[i].z, kind: traps[i].kind, off: traps[i].disabled });
    return out;
  }

  const baseCastInfo = rt.castInfo;
  rt.castInfo = function () {
    if (turning) return { kind: "valve", name: turning.cast || "Valve", t: turning.t, total: turning.total };
    return baseCastInfo ? baseCastInfo() : null;
  };

  rt.tickTraps = tickTraps;
  rt.strikeTraps = strikeTraps;
  rt.foeDamageMul = foeDamageMul;
  rt.switchNear = switchNear;
  rt.tryUseSwitch = tryUseSwitch;
  // The phase 1 names, still used by the prompt and the self-test.
  rt.valveNear = switchNear;
  rt.tryUseValve = tryUseSwitch;
  rt.trapMarks = trapMarks;
  rt.trapStates = function () {
    sync();
    return traps;
  };
  rt.trapDarts = function () {
    return darts;
  };
}
