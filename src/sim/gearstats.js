// What a piece of gear or a training rank actually does, in numbers a player
// can read: hero stats with a given set of worn gear, the change from equipping
// or upgrading a piece, and the effects of each trainer rank. Pure: formulas
// come from balance.js and items.js; the stat sums mirror derive() in
// play/combat.js (the self-test checks they agree).

import {
  affixValue, strikeDamage, wardAbsorb, edgeMul, strikeRange, strikeArcDeg, strikeCooldown,
  wardAbsorbMul, wardCost, wardDuration, mendHeal, mendCost, mendPushback, mendCastSeconds,
  mendHot, walkSpeed, sprintSpeed, extractSeconds
} from "./balance.js";
import { affixDef, gearTotals, implicitStats } from "./items.js";
import { trapSenseRange, trapsOnMap, valveSeconds } from "./traps.js";

const SLOTS = ["weapon", "offhand", "head", "body", "feet", "trinket"];

// Hero stat rows a gear swap or upgrade can move, in display order. These are
// outcomes only: Might, Guard and Focus show up through health, damage, damage
// taken and the ward, so listing them too would count one affix several times.
// `flip` rows read as a cut ("Damage taken −2.3%") while a higher stored value helps.
export const STAT_ROWS = [
  { key: "damage", label: "Strike damage" },
  { key: "hp", label: "Max health" },
  { key: "mp", label: "Max mana" },
  { key: "reduce", label: "Damage taken", unit: "%", flip: true },
  { key: "ward", label: "Ward absorbs" },
  { key: "speed", label: "Move speed", unit: "%" },
  { key: "trapCut", label: "Trap damage", unit: "%", flip: true },
  { key: "sureCut", label: "Trap slows and holds", unit: "%", flip: true },
  { key: "sense", label: "Trap sense", unit: " m" }
];

// How much each number weighs in the overall verdict: per unit of relative
// change (rel) or per point (abs). Damage and staying power lead.
const WEIGHT = {
  damage: { rel: 1 },
  ehp: { rel: 1 },
  mp: { rel: 0.3 },
  ward: { rel: 0.25 },
  speed: { abs: 0.008 },
  trapCut: { abs: 0.002 },
  sureCut: { abs: 0.001 },
  sense: { abs: 0.001 }
};

// A swap with gains and losses counts as better or worse once the net moves this much.
const VERDICT_EDGE = 0.02;

const AFFIX_TEXT = {
  might: (v) => "+" + Math.round(v) + " Might",
  guard: (v) => "+" + Math.round(v) + " Guard",
  focus: (v) => "+" + Math.round(v) + " Focus",
  keen: (v) => "+" + v.toFixed(1) + "% strike damage",
  wardweave: (v) => "+" + v.toFixed(1) + "% ward strength",
  hale: (v) => "+" + Math.round(v) + " max health",
  clear: (v) => "+" + Math.round(v) + " max mana",
  quick: (v) => "+" + v.toFixed(1) + "% move speed",
  trapward: (v) => "−" + v.toFixed(1) + "% trap damage",
  surefoot: (v) => "−" + Math.round(v) + "% trap slows and holds",
  wary: (v) => "Senses traps within " + Math.round(v) + " m, marks them on the map"
};

const IMPLICIT_TEXT = {
  armor: (v) => "+" + Math.round(v) + " armor",
  flatHp: (v) => "+" + Math.round(v) + " base health",
  flatMp: (v) => "+" + Math.round(v) + " base mana",
  quick: (v) => "+" + v.toFixed(2).replace(/0$/, "") + "% base speed"
};

function int(v) {
  return Math.max(0, Math.floor(Number(v) || 0));
}

// Hero numbers for this level, training, and worn set (same sums as derive()).
export function heroStats(session, equipped) {
  const s = session || {};
  const eq = equipped || s.equipped || {};
  const level = Math.max(1, int(s.level));
  const tracks = s.tracks || {};
  const gear = gearTotals(eq);
  const might = 9 + level + gear.might;
  const guard = 9 + level + gear.guard;
  const focus = 9 + level + gear.focus;
  const armored = guard + gear.armor;
  return {
    might, guard, focus, armor: gear.armor,
    hp: 40 + might * 8 + guard * 4 + gear.flatHp,
    mp: 20 + focus * 6 + gear.flatMp,
    damage: strikeDamage({ level, might, tracks }, eq.weapon || null),
    reduce: Math.round(armored / (armored + 50) * 1000) / 10,
    ward: wardAbsorb(guard, tracks.bulwark || 0, 1 + gear.wardweave / 100),
    speed: Math.round(gear.quick * 10) / 10,
    trapCut: Math.round(Math.min(60, gear.trapward) * 10) / 10,
    sureCut: Math.round(Math.min(90, gear.surefoot)),
    sense: trapSenseRange(tracks.delver || 0, gear.wary)
  };
}

function diffStats(a, b) {
  const out = [];
  for (const row of STAT_ROWS) {
    const gain = Math.round((b[row.key] - a[row.key]) * 10) / 10;
    if (!gain) continue;
    out.push({ key: row.key, label: row.label, unit: row.unit || "", from: a[row.key], to: b[row.key], delta: row.flip ? -gain : gain, good: gain > 0 });
  }
  return out;
}

// Effective health: how much raw damage it takes to drop you.
function ehp(st) {
  return st.hp / Math.max(0.05, 1 - st.reduce / 100);
}

// Net strength change from stats `a` to stats `b`, as one number (0.05 is
// about 5% stronger).
export function powerScore(a, b) {
  const pairs = {
    damage: [a.damage, b.damage], ehp: [ehp(a), ehp(b)], mp: [a.mp, b.mp], ward: [a.ward, b.ward],
    speed: [a.speed, b.speed], trapCut: [a.trapCut, b.trapCut], sureCut: [a.sureCut, b.sureCut], sense: [a.sense, b.sense]
  };
  let score = 0;
  for (const k of Object.keys(WEIGHT)) {
    const [from, to] = pairs[k];
    const w = WEIGHT[k];
    score += w.rel ? (to - from) / Math.max(1, from) * w.rel : (to - from) * w.abs;
  }
  return score;
}

function verdictOf(changes, score) {
  if (!changes.length) return "same";
  const ups = changes.filter((c) => c.good).length;
  if (ups === changes.length) return "better";
  if (!ups) return "worse";
  if (score >= VERDICT_EDGE) return "better";
  if (score <= -VERDICT_EDGE) return "worse";
  return "mixed";
}

// What putting `item` on would change, against whatever is worn in its slot now.
// A swap with gains and losses is judged on its net `score`; only a close call
// is a trade-off.
export function compareEquip(session, item) {
  const s = session || {};
  if (!item || item.kind === "consumable" || SLOTS.indexOf(item.slot) < 0) return null;
  const now = Object.assign({}, s.equipped || {});
  const worn = now[item.slot] || null;
  const next = Object.assign({}, now, { [item.slot]: item });
  const a = heroStats(s, now);
  const b = heroStats(s, next);
  const changes = diffStats(a, b);
  const score = powerScore(a, b);
  return { worn, changes, score, verdict: verdictOf(changes, score) };
}

// The piece one item level up, as tryUpgrade would leave it.
export function upgradedCopy(item) {
  const copy = Object.assign({}, item, { ilvl: int(item.ilvl) + 1 });
  if (item.slot === "weapon") copy.weaponBase = int(item.weaponBase) + 1;
  return copy;
}

// What one smith upgrade buys. For a worn piece: the change to the hero.
// For a carried piece: the change it would make if worn after the upgrade,
// compared with wearing it as it is now. `grows` lists the piece's own lines
// that change, as [now, next] text ("" when a line is new).
export function compareUpgrade(session, item) {
  const s = session || {};
  if (!item || item.kind === "consumable" || SLOTS.indexOf(item.slot) < 0) return null;
  const next = upgradedCopy(item);
  const base = Object.assign({}, s.equipped || {}, { [item.slot]: item });
  const up = Object.assign({}, base, { [item.slot]: next });
  const changes = diffStats(heroStats(s, base), heroStats(s, up));
  const before = Object.create(null);
  for (const p of affixParts(item)) before[p.id] = p.text;
  const grows = [];
  for (const p of affixParts(next)) if (before[p.id] !== p.text) grows.push([before[p.id] || "", p.text]);
  return { changes, grows };
}

// The piece's own lines, keyed so two item levels line up: base damage or
// base stat first, then each affix.
function affixParts(item) {
  const out = [];
  if (!item || item.kind === "consumable") return out;
  const ilvl = Math.max(1, int(item.ilvl));
  if (item.slot === "weapon" && item.weaponBase) out.push({ id: "base", text: int(item.weaponBase) + " base damage" });
  for (const imp of implicitStats(item)) {
    if (imp.value > 0 && IMPLICIT_TEXT[imp.key]) out.push({ id: "base:" + imp.key, text: IMPLICIT_TEXT[imp.key](imp.value) });
  }
  for (const a of item.affixes || []) {
    const def = a && affixDef(a.id);
    if (!def) continue;
    const text = AFFIX_TEXT[a.id];
    out.push({ id: a.id, text: text ? text(affixValue(def, a, ilvl)) : a.id });
  }
  return out;
}

// One readable line per stat on the piece, e.g. "+4 armor", "+3 Might", "+12.4% strike damage".
export function affixLines(item) {
  return affixParts(item).map((p) => p.text);
}

// "+12 Max health" / "−4 Strike damage" / "Damage taken −1.2%".
export function changeText(c) {
  const sign = c.delta > 0 ? "+" : "−";
  return c.label + " " + sign + Math.abs(c.delta) + c.unit;
}

// ---- Trainer ranks ----

function fmt(n) {
  return String(Math.round(n * 100) / 100);
}

// What a track does at a rank, as label/value rows. Diffing two ranks gives
// exactly what raising it buys.
export function trackEffects(track, rank) {
  const r = Math.max(0, Math.min(5, int(rank)));
  if (track === "edge") {
    return [
      ["Strike damage", "×" + fmt(edgeMul(r))],
      ["Strike reach", fmt(strikeRange(r)) + " m"],
      ["Strike arc", strikeArcDeg(r) + "°"],
      ["Strike cooldown", fmt(strikeCooldown(r)) + " s"]
    ];
  }
  if (track === "bulwark") {
    return [
      ["Ward strength", "×" + fmt(wardAbsorbMul(r))],
      ["Ward cost", wardCost(r) + " mana"],
      ["Ward lasts", fmt(wardDuration(r)) + " s"],
      ["Damage while warded", r >= 3 ? "−8%" : "—"],
      ["Raising a ward", r >= 5 ? "staggers foes within 2.4 m" : "—"]
    ];
  }
  if (track === "mend") {
    return [
      ["Mend heals", mendHeal(r) + " health"],
      ["Then over time", mendHot(r) ? "+" + mendHot(r) + " health" : "—"],
      ["Mend cost", mendCost(r) + " mana"],
      ["Mend cast", fmt(mendCastSeconds(r)) + " s"],
      ["Hit while casting", "pushes back " + fmt(mendPushback(r)) + " s"]
    ];
  }
  if (track === "delver") {
    return [
      ["Walk speed", fmt(walkSpeed(r))],
      ["Sprint speed", fmt(sprintSpeed(r))],
      ["Hearth channel", fmt(extractSeconds(r)) + " s"],
      ["Extra material", r >= 3 ? "35% chance per drop" : "—"],
      ["Trap sense", trapSenseRange(r) ? "plates and wires glint within " + trapSenseRange(r) + " m" : "—"],
      ["Traps on the map", trapsOnMap(r) ? "once seen" : "—"],
      ["Valve turn", fmt(valveSeconds(r)) + " s"]
    ];
  }
  return [];
}

// Rows that change from `rank` to `rank + 1`: [label, now, next].
export function trackNext(track, rank) {
  const r = int(rank);
  if (r >= 5) return [];
  const now = trackEffects(track, r);
  const next = trackEffects(track, r + 1);
  const out = [];
  for (let i = 0; i < now.length; i++) if (now[i][1] !== next[i][1]) out.push([now[i][0], now[i][1], next[i][1]]);
  return out;
}
