// Keeps the Warden's lifetime tally (sim/lifestats.js) for the sheet's Ledger tab.
// Listens on rt.questEvent (every kill, floor, pickup, craft, sale, extract,
// death, and delve already passes through it) and rt.claimQuest, and counts
// play time by the wall clock. Dev floors count nothing. Attach after quests.

import { emptyStats, recordStat } from "../sim/lifestats.js";

export function attachLifeStats(rt) {
  function stats() {
    const s = rt.session;
    if (!s || s.devRun) return null;
    if (!s.stats || typeof s.stats !== "object") s.stats = emptyStats();
    return s.stats;
  }

  const prevEvent = rt.questEvent;
  rt.questEvent = function (e) {
    const st = stats();
    if (st) recordStat(st, e);
    return prevEvent ? prevEvent.apply(this, arguments) : [];
  };

  const prevClaim = rt.claimQuest;
  if (prevClaim) {
    rt.claimQuest = function () {
      const res = prevClaim.apply(this, arguments);
      const st = res && res.ok ? stats() : null;
      if (st) recordStat(st, { type: "quest" });
      return res;
    };
  }

  // Wall clock, not the capped frame step; a sleeping tab (gap over 2 s) does not count.
  let last = performance.now();
  const prevTick = rt.tickHud;
  rt.tickHud = function (dt) {
    if (prevTick) prevTick(dt);
    const now = performance.now();
    const step = (now - last) / 1000;
    last = now;
    const st = stats();
    if (!st || !(step > 0) || step > 2) return;
    st.playSeconds += step;
    if (rt.space === "dungeon") st.delveSeconds += step;
  };
}
