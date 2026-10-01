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

  function refreshTownPrompt() {
    if (rt.space === "dungeon") {
      rt.setStationPrompt("");
      if (rt.closePanel) rt.closePanel();
      return;
    }
    const p = rt.player.position;
    const s = stationAt(p.x, p.z);
    rt.setStationPrompt(s ? s.name : "");
    if (rt.panelOpen && rt.panelStation) {
      const d = Math.hypot(p.x - rt.panelStation.x, p.z - rt.panelStation.z);
      if (d > 3.2) rt.closePanel();
    }
  }

  function interactStation() {
    if (rt.space === "dungeon") {
      if (rt.tryPickupGear && rt.tryPickupGear()) return;
      if (rt.tryStairs) rt.tryStairs();
      return;
    }
    refreshTownPrompt();
    const p = rt.player.position;
    const s = stationAt(p.x, p.z);
    if (!s) return;
    if (s.id === "gate" && rt.enterFromGate) {
      if (rt.closePanel) rt.closePanel();
      rt.enterFromGate();
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

  // Town-only per-frame work: light, interiors, townsfolk, ambience.
  function tickTown(dt, time) {
    if (!clock.frozen) clock.phase = (clock.phase + dt / DAY_SECONDS) % 1;
    applyTownTime(rt.scene, rt, clock.phase, rt.nightMats);
    syncTier();
    if (rt.tickInteriors) rt.tickInteriors(dt);
    if (rt.tickTownfolk) rt.tickTownfolk(dt, time);
    if (rt.tickAmbience) rt.tickAmbience(dt, time);
  }
  rt.syncTownTier = syncTier;

  rt.tickTown = tickTown;
  rt.stationAt = stationAt;
  rt.refreshTownPrompt = refreshTownPrompt;
  rt.interactStation = interactStation;
}
