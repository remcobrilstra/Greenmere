// Talking to Greenmere: which keeper line is showing in each panel, resting at
// the inn, and the guide's next step (with the station it points at).

import { loreState, talkLines, guideHint, partOfDay } from "../sim/townlore.js";
import { buildingById, insideRect } from "../sim/townplan.js";

export const KEEPER_FOR = { store: "maud", smith: "orrin", still: "wen", trainer: "tamsin", inn: "pell", bank: "aldous" };
const GUIDE_EVERY = 0.4;
const GUIDE_QUIET_R = 5;

export function attachDialogue(rt) {
  const talkIndex = Object.create(null);
  let guideT = 0;

  function state() {
    return loreState(rt.session, rt.townClock ? rt.townClock.phase : 0.5);
  }

  // The keeper's current line for a panel kind; `advance` moves to the next one.
  function keeperTalk(kind, advance) {
    const id = KEEPER_FOR[kind];
    if (!id) return null;
    const lines = talkLines(id, state());
    if (!lines.length) return null;
    let i = talkIndex[id] || 0;
    if (advance) i += 1;
    i %= lines.length;
    talkIndex[id] = i;
    return { keeper: id, line: lines[i], index: i, count: lines.length };
  }

  function resetTalk(kind) {
    const id = KEEPER_FOR[kind];
    if (id) talkIndex[id] = 0;
  }

  // A room at the Banked Fire: sleep through the night, or doze until evening.
  function restAtInn() {
    const clock = rt.townClock;
    if (!clock) return "";
    const part = partOfDay(clock.phase);
    let text;
    if (part === "evening" || part === "night") {
      clock.phase = 0.3;
      text = "You sleep until morning. The fire was kept in.";
    } else {
      clock.phase = 0.71;
      text = "You doze by the fire until evening.";
    }
    if (rt.fillPools) rt.fillPools();
    if (rt.syncVitals) rt.syncVitals();
    if (rt.say) rt.say(text);
    return text;
  }

  function stationFor(target) {
    const list = rt.stations || [];
    for (let i = 0; i < list.length; i++) if (list[i].id === target) return list[i];
    return null;
  }

  // Recompute the guide a few times a second. It hides near its own target.
  function tickGuide(dt, force) {
    guideT -= dt;
    if (guideT > 0 && !force) return rt.guide;
    guideT = GUIDE_EVERY;
    if (rt.space !== "town") {
      rt.guide = null;
      return null;
    }
    const hint = guideHint(state());
    if (!hint) {
      rt.guide = null;
      return null;
    }
    const st = stationFor(hint.target);
    const p = rt.player.position;
    const b = st && st.building ? buildingById(st.building) : null;
    const there = st && (Math.hypot(p.x - st.x, p.z - st.z) < GUIDE_QUIET_R || (b && insideRect(b, p.x, p.z, 0)));
    rt.guide = there ? null : { text: hint.text, target: hint.target, x: st ? st.x : null, z: st ? st.z : null };
    return rt.guide;
  }

  rt.guide = null;
  rt.keeperTalk = keeperTalk;
  rt.resetTalk = resetTalk;
  rt.restAtInn = restAtInn;
  rt.tickGuide = tickGuide;
  rt.loreState = state;
}
