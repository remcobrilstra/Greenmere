// Quests: daily notices on the board in the square, and one-time requests from
// the keepers. Pure data and pure steps: the play layer feeds game events in,
// and the save stores the plain state returned here.
//
// Objective types and the events that move them:
//   kill    {archetype?, elite?, boss?, count}  <- {type: "kill", archetype, elite, boss, floor}
//   reach   {floor}                              <- {type: "floor", floor}
//   extract {floor}                              <- {type: "extract", floor}
//   gather  {material, count}                    <- {type: "material", material, amount}
//   gold    {count}                              <- {type: "gold", amount}
//   craft   {recipe?, count}                     <- {type: "craft", recipe}
//   sell    {count}                              <- {type: "sell"}
//   deposit {count}                              <- {type: "deposit", amount}
//   deliver {material, count}                    <- checked when claimed; the materials are handed over

import { mulberry32 } from "./rng.js";
import { killGold, killXp, grantXp } from "./balance.js";

export const QUEST_CAP = 6;
export const DAILY_OFFERS = 3;
const MATERIALS = ["heartwood", "rootfiber", "slag", "emberglass"];
const MAT_NAME = { heartwood: "heartwood", rootfiber: "rootfiber", slag: "slag", emberglass: "emberglass" };

export function emptyQuests() {
  return { day: "", active: [], claimedDaily: {}, doneRequests: [] };
}

function depthOf(bestDepth) {
  return Math.max(1, Math.floor(Number(bestDepth) || 0));
}

function reward(d, goldMul, xpMul, materials) {
  return { gold: Math.round(killGold(d) * goldMul), xp: Math.round(killXp(d) * xpMul), materials: materials || {} };
}

// ---------- the daily board ----------

// Each template makes one notice for a depth; `when` gates it.
const DAILY = [
  {
    id: "cull",
    when: () => true,
    make: (d) => {
      const n = 8 + 2 * Math.min(d, 6);
      return { title: "Thin the Underwood", text: "Slay " + n + " of anything below.", objective: { type: "kill", count: n }, reward: reward(d, 6, 2.5) };
    }
  },
  {
    id: "elites",
    when: (d) => d >= 4,
    make: (d) => {
      const n = 1 + Math.floor(d / 8);
      return { title: "Marked Ones", text: "Kill " + n + " elite" + (n > 1 ? "s" : "") + ".", objective: { type: "kill", elite: true, count: n }, reward: reward(d, 10, 4) };
    }
  },
  {
    id: "deeper",
    when: () => true,
    make: (d) => {
      const f = d + 1;
      return { title: "Further Down", text: "Stand on floor " + f + ".", objective: { type: "reach", floor: f, count: 1 }, reward: reward(f, 8, 3) };
    }
  },
  {
    id: "home",
    when: (d) => d >= 2,
    make: (d) => {
      const f = Math.max(2, d);
      return { title: "Come Home Safe", text: "Extract from floor " + f + " or deeper.", objective: { type: "extract", floor: f, count: 1 }, reward: reward(f, 7, 3) };
    }
  },
  {
    id: "haul",
    when: () => true,
    make: (d, rng) => {
      // Only materials whose floors the Warden can already reach (moss 1, root 2, slate 3, ember 4).
      const open = MATERIALS.slice(0, Math.min(4, d + 1));
      const m = open[Math.floor(rng() * open.length)];
      const n = 3 + Math.floor(d / 3);
      return { title: "Haul", text: "Gather " + n + " " + MAT_NAME[m] + ".", objective: { type: "gather", material: m, count: n }, reward: reward(d, 5, 2) };
    }
  },
  {
    id: "purse",
    when: () => true,
    make: (d) => {
      const n = killGold(d) * 12;
      return { title: "Fill the Purse", text: "Pick up " + n + " gold in the Underwood.", objective: { type: "gold", count: n }, reward: reward(d, 4, 2) };
    }
  },
  {
    id: "provision",
    when: (d) => d >= 1,
    make: (d) => ({ title: "Provisions", text: "Distill draughts twice at The Still.", objective: { type: "craft", recipe: "draught", count: 2 }, reward: reward(d, 3, 1.5, { heartwood: 1 }) })
  },
  {
    id: "trade",
    when: (d) => d >= 1,
    make: (d) => ({ title: "Clear the Pack", text: "Sell 3 pieces of gear to Maud.", objective: { type: "sell", count: 3 }, reward: reward(d, 3, 1.5) })
  }
];

function hashDay(day) {
  let h = 2166136261;
  for (let i = 0; i < day.length; i++) {
    h ^= day.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Today's notices: a pure function of the date and the deepest extract.
export function dailyOffers(day, bestDepth) {
  const d = depthOf(bestDepth);
  const rng = mulberry32(hashDay(String(day)));
  const pool = DAILY.filter((t) => t.when(d));
  const out = [];
  while (out.length < DAILY_OFFERS && pool.length) {
    const t = pool.splice(Math.floor(rng() * pool.length), 1)[0];
    const q = t.make(d, rng);
    out.push(Object.assign({ key: "daily:" + day + ":" + t.id, kind: "daily", giver: "board", day }, q));
  }
  return out;
}

// ---------- keeper requests ----------

export const REQUESTS = [
  { id: "tamsin-first", giver: "tamsin", minDepth: 0, title: "First Blood", text: "Slay 10 foes in the Underwood, then come back to the Circle.", objective: { type: "kill", count: 10 }, reward: { gold: 20, xp: 60, materials: {} } },
  { id: "tamsin-boss", giver: "tamsin", after: "tamsin-first", minDepth: 4, title: "The Keeper of the Stair", text: "Kill the guardian of a fifth floor.", objective: { type: "kill", boss: true, count: 1 }, reward: { gold: 120, xp: 260, materials: {} } },
  { id: "maud-wares", giver: "maud", minDepth: 1, title: "Stock for the Shelves", text: "Sell me 4 pieces of gear from below.", objective: { type: "sell", count: 4 }, reward: { gold: 45, xp: 40, materials: {} } },
  { id: "wen-roots", giver: "wen", minDepth: 2, title: "Roots for the Still", text: "Bring me 4 rootfiber.", objective: { type: "deliver", material: "rootfiber", count: 4 }, reward: { gold: 40, xp: 50, materials: { heartwood: 2 } } },
  { id: "wen-ember", giver: "wen", after: "wen-roots", minDepth: 4, title: "A Warmer Draught", text: "Bring me 2 emberglass.", objective: { type: "deliver", material: "emberglass", count: 2 }, reward: { gold: 90, xp: 110, materials: { rootfiber: 3 } } },
  { id: "orrin-slag", giver: "orrin", minDepth: 3, title: "Slag for the Quench", text: "Bring me 6 slag.", objective: { type: "deliver", material: "slag", count: 6 }, reward: { gold: 70, xp: 80, materials: { emberglass: 1 } } },
  { id: "orrin-elites", giver: "orrin", after: "orrin-slag", minDepth: 6, title: "Proof of Temper", text: "Kill 3 elites with my steel.", objective: { type: "kill", elite: true, count: 3 }, reward: { gold: 150, xp: 200, materials: { slag: 4 } } },
  { id: "pell-deep", giver: "pell", minDepth: 3, title: "A Story Worth Telling", text: "Extract from floor 5 or deeper and tell me about it.", objective: { type: "extract", floor: 5, count: 1 }, reward: { gold: 100, xp: 120, materials: {} } },
  { id: "aldous-savings", giver: "aldous", minDepth: 1, title: "A Prudent Warden", text: "Deposit 150 gold with the Counting House.", objective: { type: "deposit", count: 150 }, reward: { gold: 30, xp: 40, materials: {} } }
];

export function requestDef(id) {
  for (const r of REQUESTS) if (r.id === id) return r;
  return null;
}

// The keeper's next request: active one first, else the first open one.
export function requestFor(q, giver, bestDepth) {
  const depth = Math.max(0, Math.floor(Number(bestDepth) || 0));
  for (const a of q.active) if (a.kind === "request" && a.giver === giver) return { state: "active", quest: a };
  for (const r of REQUESTS) {
    if (r.giver !== giver || q.doneRequests.indexOf(r.id) >= 0) continue;
    if (r.after && q.doneRequests.indexOf(r.after) < 0) continue;
    if (depth < r.minDepth) return null;
    return { state: "offer", quest: Object.assign({ key: "request:" + r.id, kind: "request", day: "" }, r) };
  }
  return null;
}

// ---------- state changes ----------

function instance(offer) {
  return {
    key: offer.key,
    kind: offer.kind,
    giver: offer.giver,
    title: offer.title,
    text: offer.text,
    objective: Object.assign({}, offer.objective),
    reward: { gold: offer.reward.gold, xp: offer.reward.xp, materials: Object.assign({}, offer.reward.materials) },
    progress: 0,
    day: offer.day || ""
  };
}

export function findActive(q, key) {
  for (const a of q.active) if (a.key === key) return a;
  return null;
}

export function takeQuest(q, offer) {
  if (!offer || findActive(q, offer.key)) return { ok: false, reason: "taken" };
  if (q.active.length >= QUEST_CAP) return { ok: false, reason: "full" };
  if (offer.kind === "daily" && q.claimedDaily[offer.key]) return { ok: false, reason: "claimed" };
  const a = instance(offer);
  q.active.push(a);
  return { ok: true, quest: a };
}

export function abandonQuest(q, key) {
  const i = q.active.findIndex((a) => a.key === key);
  if (i < 0) return false;
  q.active.splice(i, 1);
  return true;
}

function eventAmount(o, e) {
  switch (o.type) {
    case "kill":
      if (e.type !== "kill") return 0;
      if (o.boss && !e.boss) return 0;
      if (o.elite && !e.elite) return 0;
      if (o.archetype && o.archetype !== e.archetype) return 0;
      return 1;
    case "gather":
      return e.type === "material" && e.material === o.material ? Math.max(0, Math.floor(e.amount || 0)) : 0;
    case "gold":
      return e.type === "gold" ? Math.max(0, Math.floor(e.amount || 0)) : 0;
    case "craft":
      return e.type === "craft" && (!o.recipe || String(e.recipe || "").indexOf(o.recipe) === 0) ? 1 : 0;
    case "sell":
      return e.type === "sell" ? 1 : 0;
    case "deposit":
      return e.type === "deposit" ? Math.max(0, Math.floor(e.amount || 0)) : 0;
    default:
      return 0;
  }
}

// Feed one game event. Returns the quests it moved: [{quest, before, after, done}].
export function applyEvent(q, e) {
  const moved = [];
  if (!e || !e.type) return moved;
  for (const a of q.active) {
    const o = a.objective;
    const before = a.progress;
    if (o.type === "reach" && e.type === "floor") {
      if (e.floor >= o.floor) a.progress = 1;
    } else if (o.type === "extract" && e.type === "extract") {
      if (e.floor >= o.floor) a.progress = 1;
    } else if ((o.type === "sell" && e.type === "unsell") || (o.type === "deposit" && e.type === "withdraw")) {
      // Buying back a sale, or taking a deposit out again, does not count.
      if (a.progress < o.count) a.progress = Math.max(0, a.progress - (e.type === "unsell" ? 1 : Math.max(0, Math.floor(e.amount || 0))));
    } else {
      const n = eventAmount(o, e);
      if (n > 0) a.progress = Math.min(o.count, a.progress + n);
    }
    if (a.progress !== before) moved.push({ quest: a, before, after: a.progress, done: a.progress >= o.count });
  }
  return moved;
}

export function isComplete(a, session) {
  const o = a.objective;
  if (o.type === "deliver") {
    const have = session && session.materials ? Math.floor(Number(session.materials[o.material]) || 0) : 0;
    return have >= o.count;
  }
  return a.progress >= o.count;
}

// Progress for display: deliver quests read the material counter.
export function progressOf(a, session) {
  const o = a.objective;
  if (o.type === "deliver") {
    const have = session && session.materials ? Math.floor(Number(session.materials[o.material]) || 0) : 0;
    return Math.min(o.count, have);
  }
  return Math.min(o.count, a.progress);
}

// Hand in: pay the reward into the session, take delivered materials, record it.
export function claimQuest(q, key, session) {
  const a = findActive(q, key);
  if (!a) return { ok: false, reason: "missing" };
  if (!isComplete(a, session)) return { ok: false, reason: "unfinished" };
  if (!session.materials) session.materials = { heartwood: 0, rootfiber: 0, slag: 0, emberglass: 0 };
  if (a.objective.type === "deliver") session.materials[a.objective.material] -= a.objective.count;
  session.purse = Math.min(1e9, Math.floor(Number(session.purse) || 0) + a.reward.gold);
  for (const k of Object.keys(a.reward.materials || {})) {
    if (MATERIALS.indexOf(k) < 0) continue;
    session.materials[k] = Math.min(999, Math.floor(Number(session.materials[k]) || 0) + a.reward.materials[k]);
  }
  const levels = grantXp(session, a.reward.xp);
  abandonQuest(q, key);
  if (a.kind === "daily") q.claimedDaily[a.key] = a.day;
  else q.doneRequests.push(a.key.replace(/^request:/, ""));
  return { ok: true, quest: a, levels };
}

// A new day: yesterday's unfinished notices are taken down; old claim marks go.
export function rollover(q, day) {
  if (q.day === day) return false;
  q.day = day;
  q.active = q.active.filter((a) => a.kind !== "daily" || a.day === day);
  const keep = {};
  for (const k of Object.keys(q.claimedDaily)) if (q.claimedDaily[k] === day) keep[k] = day;
  q.claimedDaily = keep;
  return true;
}

// Board view: today's notices that are not taken or already claimed.
export function boardOffers(q, day, bestDepth) {
  return dailyOffers(day, bestDepth).filter((o) => !findActive(q, o.key) && !q.claimedDaily[o.key]);
}

// ---------- save ----------

function str(v, max) {
  return typeof v === "string" ? v.slice(0, max) : "";
}
function int(v, lo, hi) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : lo;
}
const OBJECTIVES = ["kill", "reach", "extract", "gather", "gold", "craft", "sell", "deposit", "deliver"];

// Clamp a stored quest state. Unknown shapes are dropped, not trusted.
export function normalizeQuests(raw) {
  const out = emptyQuests();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  out.day = str(raw.day, 10);
  if (Array.isArray(raw.active)) {
    for (const a of raw.active) {
      if (out.active.length >= QUEST_CAP) break;
      if (!a || typeof a !== "object" || !a.objective || typeof a.objective !== "object") continue;
      const type = OBJECTIVES.indexOf(a.objective.type) >= 0 ? a.objective.type : null;
      if (!type) continue;
      const objective = { type, count: int(a.objective.count, 1, 1e6) };
      if (a.objective.floor != null) objective.floor = int(a.objective.floor, 1, 1e6);
      if (MATERIALS.indexOf(a.objective.material) >= 0) objective.material = a.objective.material;
      if (typeof a.objective.archetype === "string") objective.archetype = str(a.objective.archetype, 24);
      if (typeof a.objective.recipe === "string") objective.recipe = str(a.objective.recipe, 24);
      if (a.objective.elite) objective.elite = true;
      if (a.objective.boss) objective.boss = true;
      const r = a.reward && typeof a.reward === "object" ? a.reward : {};
      const materials = {};
      if (r.materials && typeof r.materials === "object") for (const k of MATERIALS) if (r.materials[k]) materials[k] = int(r.materials[k], 0, 999);
      out.active.push({
        key: str(a.key, 80),
        kind: a.kind === "request" ? "request" : "daily",
        giver: str(a.giver, 16),
        title: str(a.title, 60),
        text: str(a.text, 140),
        objective,
        reward: { gold: int(r.gold, 0, 1e6), xp: int(r.xp, 0, 1e7), materials },
        progress: int(a.progress, 0, objective.count),
        day: str(a.day, 10)
      });
    }
  }
  if (raw.claimedDaily && typeof raw.claimedDaily === "object") {
    let n = 0;
    for (const k of Object.keys(raw.claimedDaily)) {
      if (k === "__proto__" || k === "constructor" || k === "prototype" || n >= 16) continue;
      out.claimedDaily[str(k, 80)] = str(raw.claimedDaily[k], 10);
      n++;
    }
  }
  if (Array.isArray(raw.doneRequests)) {
    for (const id of raw.doneRequests) if (requestDef(id) && out.doneRequests.indexOf(id) < 0) out.doneRequests.push(id);
  }
  return out;
}
