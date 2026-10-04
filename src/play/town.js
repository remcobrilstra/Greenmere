import { applyTownTime, nightFactor } from "../view/lights.js";
import { townTier } from "../sim/townplan.js";

// One town day lasts this many seconds; a session starts mid-morning.
export const DAY_SECONDS = 18 * 60;

// Station proximity. F at a keeper's counter opens #panel for that building. Hearth still only speaks.

export function attachTown(rt) {
  function stationAt(x, z) {
    // Counters and the gate are all on the ground; nothing answers from upstairs.
    if ((rt.heroLevel || 0) !== 0) return null;
    const list = rt.stations;
    let best = null;
    let bestD = 0;
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      const d = Math.hypot(x - s.x, z - s.z);
      if (d <= s.interact && (!best || d < bestD)) {
        best = s;
        bestD = d;
      }
    }
    return best;
  }

  // The second line of the F prompt at each counter: what you will do there.
  const STATION_SUB = {
    gate: "Step through into the Underwood",
    hearth: "Warm your hands",
    store: "Buy and sell",
    smith: "Upgrade and craft gear",
    still: "Distill draughts",
    trainer: "Spend skill points",
    inn: "Rest to restore health and mana",
    bank: "Bank your gold",
    board: "Read the notices"
  };

  // Gear lying within reach (the same reach F uses to pick it up).
  function gearNear() {
    const drops = rt.groundDrops;
    if (!drops) return null;
    const p = rt.player.position;
    let best = null;
    let bestD = 2.2 + 1e-4;
    for (const d of drops) {
      if (!d || d.kind !== "gear" || !d.item || d.fly) continue;
      const dist = Math.hypot(p.x - d.x, p.z - d.z);
      if (dist <= bestD) {
        best = d;
        bestD = dist;
      }
    }
    return best;
  }

  // Below ground F picks up gear, opens a chest, or takes the stairs, in that order.
  function refreshDungeonPrompt() {
    if (rt.transit) {
      rt.setStationPrompt("");
      return;
    }
    const gear = gearNear();
    if (gear) {
      rt.setStationPrompt("Pick up " + (gear.item.name || "gear"), { sub: "Into your pack" });
      return;
    }
    if (rt.chestNear && rt.chestNear()) {
      rt.setStationPrompt("Open the chest");
      return;
    }
    const st = rt.stairsState ? rt.stairsState() : null;
    if (st && st.near) {
      if (st.blocked) rt.setStationPrompt("The guardian bars the stairs", { sub: "Defeat the floor's boss to descend", barred: true });
      else rt.setStationPrompt("Descend to floor " + st.next, { sub: "or hold 4 to extract with your loot" });
      return;
    }
    rt.setStationPrompt("");
  }

  function refreshTownPrompt() {
    if (rt.space === "dungeon") {
      refreshDungeonPrompt();
      if (rt.closePanel) rt.closePanel();
      return;
    }
    const p = rt.player.position;
    const s = rt.transit ? null : stationAt(p.x, p.z);
    // Villagers answer F too, when no counter is in reach (and townsfolk are live).
    const folk = !s && !rt.transit && rt.townfolkSolid && (rt.heroLevel || 0) === 0 && rt.nearestFolk ? rt.nearestFolk(p.x, p.z, 2.2) : null;
    if (s) rt.setStationPrompt(s.name, { sub: STATION_SUB[s.panel || s.id] || "" });
    else rt.setStationPrompt(folk ? "Talk to " + folk.name : "");
    if (rt.panelOpen && rt.panelStation) {
      const d = Math.hypot(p.x - rt.panelStation.x, p.z - rt.panelStation.z);
      if (d > 3.2) rt.closePanel();
    }
  }

  // The gate and the stairs play the portal transit when it is attached.
  function viaPortal(kind, action) {
    if (rt.portalTransit) rt.portalTransit(kind, action);
    else action();
  }

  function interactStation() {
    if (rt.transit) return;
    if (rt.space === "dungeon") {
      if (rt.tryPickupGear && rt.tryPickupGear()) return;
      if (rt.tryOpenChest && rt.tryOpenChest()) return;
      const st = rt.stairsState ? rt.stairsState() : null;
      if (st && st.near && !st.blocked) viaPortal("stairs", () => rt.tryStairs());
      else if (rt.tryStairs) rt.tryStairs();
      return;
    }
    refreshTownPrompt();
    const p = rt.player.position;
    const s = stationAt(p.x, p.z);
    if (!s) {
      if (rt.townfolkSolid && (rt.heroLevel || 0) === 0 && rt.talkNearestFolk && rt.talkNearestFolk(p.x, p.z)) {
        if (rt.clearAcknowledgement) rt.clearAcknowledgement();
      }
      return;
    }
    if (s.id === "gate" && rt.enterFromGate) {
      if (rt.closePanel) rt.closePanel();
      viaPortal("gate", () => rt.enterFromGate());
      return;
    }
    if (s.panel && rt.openPanel) {
      rt.clearAcknowledgement();
      rt.openPanel(s.panel, s);
      return;
    }
    if (rt.closePanel) rt.closePanel();
    rt.acknowledgeStation();
  }

  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    if (e.code === "KeyF") interactStation();
    else if (e.code === "Escape") {
      if (rt.closePanel) rt.closePanel();
      rt.clearAcknowledgement();
    }
  });

  // Town clock. `frozen` holds the hour (the self-test pins noon).
  const clock = { phase: 0.36, frozen: false };
  rt.townClock = clock;
  rt.nightFactor = () => nightFactor(clock.phase);

  // Grow the town to the tier the Warden's deepest extract has earned.
  function syncTier() {
    const tier = townTier(rt.session ? rt.session.bestDepth : 0);
    if (rt.setTownTier && rt.getTownTier && rt.getTownTier() !== tier) rt.setTownTier(tier);
    return tier;
  }

  // The Delve Gate: animate the portal, and walking through the opening
  // starts a delve just as F at the gate does. Only a real step across the
  // gate line counts, so placing the hero on the gate does not.
  // The side is only updated when the hero is clearly off the line (5 cm),
  // so a frame that lands inside that band never hides the crossing.
  let gate = null;
  let lastStep = null;
  let lastSide = 0;
  function tickGate(time) {
    if (!gate) gate = (rt.stations || []).find((st) => st.id === "gate") || null;
    if (!gate) return;
    if (gate.portal) gate.portal.tick(time);
    const p = rt.player.position;
    const prev = lastStep;
    lastStep = { x: p.x, z: p.z };
    const o = gate.opening;
    if (!o) return;
    const d = p.z - o.z;
    const was = lastSide;
    if (d > 0.05) lastSide = 1;
    else if (d < -0.05) lastSide = -1;
    if (!prev || !rt.enterFromGate || rt.transit || (rt.heroLevel || 0) !== 0) return;
    if (rt.session && rt.session.run) return;
    const crossed = was !== 0 && lastSide !== was;
    if (!crossed || Math.hypot(p.x - prev.x, p.z - prev.z) > 1 || Math.abs(p.x - o.x) > o.halfW) return;
    lastStep = null;
    lastSide = 0;
    if (rt.closePanel) rt.closePanel();
    viaPortal("gate", () => rt.enterFromGate());
  }

  // Town-only per-frame work: light, interiors, townsfolk, ambience.
  function tickTown(dt, time) {
    if (!clock.frozen) clock.phase = (clock.phase + dt / DAY_SECONDS) % 1;
    applyTownTime(rt.scene, rt, clock.phase, rt.nightMats);
    syncTier();
    if (rt.tickInteriors) rt.tickInteriors(dt);
    if (rt.tickTownfolk) rt.tickTownfolk(dt, time);
    if (rt.tickAmbience) rt.tickAmbience(dt, time);
    if (rt.tickGuide) rt.tickGuide(dt);
    tickGate(time);
    const cull = rt.townRoot && rt.townRoot.userData.cullScatter;
    if (cull) cull(rt.camera.position);
  }
  rt.syncTownTier = syncTier;

  rt.tickTown = tickTown;
  rt.stationAt = stationAt;
  rt.refreshTownPrompt = refreshTownPrompt;
  rt.refreshDungeonPrompt = refreshDungeonPrompt;
  rt.interactStation = interactStation;
}
