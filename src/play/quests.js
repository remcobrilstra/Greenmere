// Quests in play: game events in, rewards out, saves noted. Every hook in
// combat, space, and the panels calls rt.questEvent; nothing else changes them.

import {
  emptyQuests, applyEvent, takeQuest, claimQuest, abandonQuest, rollover,
  boardOffers, requestFor, findActive, isComplete, progressOf, QUEST_CAP
} from "../sim/quests.js";
import { KEEPER_FOR } from "./dialogue.js";

const GIVER_STATION = { board: "board", maud: "store", orrin: "smith", wen: "still", tamsin: "trainer", pell: "inn", aldous: "bank" };
const GIVER_NAME = { board: "the notice board", maud: "Maud", orrin: "Orrin", wen: "Sister Wen", tamsin: "Old Tamsin", pell: "Pell", aldous: "Aldous" };

export function localDay(date) {
  const d = date || new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return d.getFullYear() + "-" + m + "-" + day;
}

export function attachQuests(rt) {
  function q() {
    const s = rt.session;
    if (!s) return emptyQuests();
    if (!s.quests || !Array.isArray(s.quests.active)) s.quests = emptyQuests();
    return s.quests;
  }
  // The day can be pinned (tests, dev) with rt.questDayOverride.
  function today() {
    return rt.questDayOverride || localDay();
  }
  function fresh() {
    const state = q();
    if (rollover(state, today()) && rt.markSave) rt.markSave("town");
    return state;
  }
  function noteSave() {
    if (!rt.markSave || (rt.session && rt.session.devRun)) return;
    rt.markSave(rt.space === "dungeon" ? "run" : "town");
  }

  function questEvent(e) {
    const s = rt.session;
    if (!s || s.devRun) return [];
    const state = fresh();
    const moved = applyEvent(state, e);
    if (!moved.length) return moved;
    for (const m of moved) {
      if (!m.done || m.before >= m.quest.objective.count) continue;
      if (rt.say) rt.say("Quest done: " + m.quest.title + ". Return to " + GIVER_NAME[m.quest.giver] + ".");
    }
    noteSave();
    return moved;
  }

  function board() {
    const state = fresh();
    const s = rt.session || {};
    return { day: state.day, offers: boardOffers(state, state.day, s.bestDepth), active: state.active, cap: QUEST_CAP };
  }

  function keeperRequest(kind) {
    const keeper = KEEPER_FOR[kind];
    if (!keeper) return null;
    return requestFor(fresh(), keeper, rt.session ? rt.session.bestDepth : 0);
  }

  function take(offer) {
    const res = takeQuest(fresh(), offer);
    if (res.ok) {
      if (rt.say) rt.say("Quest taken: " + offer.title + ".");
      noteSave();
    }
    return res;
  }

  function claim(key) {
    const s = rt.session;
    const res = claimQuest(fresh(), key, s);
    if (!res.ok) return res;
    if (res.levels && rt.derivePools) {
      const hp = rt.vitals ? rt.vitals.hp : 0;
      const mp = rt.vitals ? rt.vitals.mp : 0;
      rt.derivePools();
      if (rt.vitals) {
        rt.vitals.hp = Math.min(rt.vitals.hpMax, hp);
        rt.vitals.mp = Math.min(rt.vitals.mpMax, mp);
      }
    }
    if (rt.syncVitals) rt.syncVitals();
    const r = res.quest.reward;
    const parts = [];
    if (r.gold) parts.push(r.gold + " gold");
    if (r.xp) parts.push(r.xp + " xp");
    for (const k of Object.keys(r.materials || {})) parts.push(r.materials[k] + " " + k);
    if (rt.say) rt.say(res.quest.title + " complete: " + parts.join(", ") + (res.levels ? ". Level up!" : "."));
    noteSave();
    return res;
  }

  function abandon(key) {
    const ok = abandonQuest(fresh(), key);
    if (ok) noteSave();
    return ok;
  }

  // Finished quests waiting to be handed in, with the station to hand them in at.
  function readyToClaim() {
    const s = rt.session;
    const out = [];
    for (const a of fresh().active) if (isComplete(a, s)) out.push({ quest: a, station: GIVER_STATION[a.giver], who: GIVER_NAME[a.giver] });
    return out;
  }

  rt.questEvent = questEvent;
  rt.questBoard = board;
  rt.keeperRequest = keeperRequest;
  rt.takeQuest = take;
  rt.claimQuest = claim;
  rt.abandonQuest = abandon;
  rt.questsReady = readyToClaim;
  rt.questProgress = (a) => progressOf(a, rt.session);
  rt.questComplete = (a) => isComplete(a, rt.session);
  rt.findQuest = (key) => findActive(fresh(), key);
  rt.questToday = today;
}
