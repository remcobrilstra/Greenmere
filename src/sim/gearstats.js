// What a piece of gear or a training rank actually does, in numbers a player
// can read: hero stats with a given set of worn gear, the change from equipping
// or upgrading a piece, and the effects of each trainer rank. Pure: formulas
// come from balance.js and items.js; the stat sums mirror derive() in
// play/combat.js (the self-test checks they agree).

import {
  affixValue, strikeDamage, wardAbsorb, edgeMul, strikeRange, strikeArcDeg, strikeCooldown,
  wardAbsorbMul, wardCost, wardDuration, mendHeal, mendCost, mendCooldown, mendPushback, mendCastSeconds,
  mendHot, walkSpeed, sprintSpeed, extractSeconds
} from "./balance.js";
import { affixDef, gearTotals } from "./items.js";
import { trapSenseRange, trapsOnMap, valveSeconds } from "./traps.js";

const SLOTS = ["weapon", "offhand", "head", "body", "feet", "trinket"];

// Hero stat rows in display order. `better` is the direction that helps.
export const STAT_ROWS = [
  { key: "damage", label: "Strike damage" },
  { key: "hp", label: "Max health" },
  { key: "mp", label: "Max mana" },
  { key: "might", label: "Might" },
  { key: "guard", label: "Guard" },
  { key: "focus", label: "Focus" },
  { key: "reduce", label: "Damage taken", unit: "%", better: -1 },
  { key: "ward", label: "Ward absorbs" },
  { key: "speed", label: "Move speed", unit: "%" }
];

const AFFIX_TEXT = {
  might: (v) => "+" + Math.round(v) + " Might",
  guard: (v) => "+" + Math.round(v) + " Guard",
  focus: (v) => "+" + Math.round(v) + " Focus",
  keen: (v) => "+" + v.toFixed(1) + "% strike damage",
  wardweave: (v) => "+" + v.toFixed(1) + "% ward strength",
  hale: (v) => "+" + Math.round(v) + " max health",
  clear: (v) => "+" + Math.round(v) + " max mana",
  quick: (v) => "+" + v.toFixed(1) + "% move speed"
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
  return {
    might, guard, focus,
    hp: 40 + might * 8 + guard * 4 + gear.flatHp,
    mp: 20 + focus * 6 + gear.flatMp,
    damage: strikeDamage({ level, might, tracks }, eq.weapon || null),
    reduce: Math.round(guard / (guard + 50) * 1000) / 10,
    ward: wardAbsorb(guard, tracks.bulwark || 0, 1 + gear.wardweave / 100),
    speed: Math.round(gear.quick * 10) / 10
  };
}

function diffStats(a, b) {
  const out = [];
  for (const row of STAT_ROWS) {
    const from = a[row.key];
    const to = b[row.key];
    const delta = Math.round((to - from) * 10) / 10;
    if (!delta) continue;
    const good = delta * (row.better || 1) > 0;
    out.push({ key: row.key, label: row.label, unit: row.unit || "", from, to, delta, good });
  }
  return out;
}

function verdictOf(changes) {
  if (!changes.length) return "same";
  const ups = changes.filter((c) => c.good).length;
  if (ups === changes.length) return "better";
  if (!ups) return "worse";
  return "mixed";
}

// What putting `item` on would change, against whatever is worn in its slot now.
export function compareEquip(session, item) {
  const s = session || {};
  if (!item || item.kind === "consumable" || SLOTS.indexOf(item.slot) < 0) return null;
  const now = Object.assign({}, s.equipped || {});
  const worn = now[item.slot] || null;
  const next = Object.assign({}, now, { [item.slot]: item });
  const changes = diffStats(heroStats(s, now), heroStats(s, next));
  return { worn, changes, verdict: verdictOf(changes) };
}

// The piece one item level up, as tryUpgrade would leave it.
export function upgradedCopy(item) {
  const copy = Object.assign({}, item, { ilvl: int(item.ilvl) + 1 });
  if (item.slot === "weapon") copy.weaponBase = int(item.weaponBase) + 1;
  return copy;
}

// What one smith upgrade buys. For a worn piece: the change to the hero.
// For a carried piece: the change it would make if worn after the upgrade,
// compared with wearing it as it is now.
export function compareUpgrade(session, item) {
  const s = session || {};
  if (!item || item.kind === "consumable" || SLOTS.indexOf(item.slot) < 0) return null;
  const base = Object.assign({}, s.equipped || {}, { [item.slot]: item });
  const up = Object.assign({}, base, { [item.slot]: upgradedCopy(item) });
  const changes = diffStats(heroStats(s, base), heroStats(s, up));
  const hollow = !(item.affixes && item.affixes.length) && item.slot !== "weapon";
  return { changes, hollow };
}

// One readable line per affix, e.g. "+3 Might", "+12.4% strike damage".
export function affixLines(item) {
  const out = [];
  if (!item || item.kind === "consumable") return out;
  const ilvl = Math.max(1, int(item.ilvl));
  if (item.slot === "weapon" && item.weaponBase) out.push(int(item.weaponBase) + " base damage");
  for (const a of item.affixes || []) {
    const def = a && affixDef(a.id);
    if (!def) continue;
    const text = AFFIX_TEXT[a.id];
    out.push(text ? text(affixValue(def, a, ilvl)) : a.id);
  }
  return out;
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
