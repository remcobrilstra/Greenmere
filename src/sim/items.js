// Gear rolls and names. Pure data: no three, document, or localStorage.
// Affix magnitudes go through affixValue in balance.js. Do not add a second formula.

import { affixValue, delverMatBonus, dropIlvl, killGold, rarityCuts, upgradeCost } from "./balance.js";
import { mixSeed } from "./floorgen.js";
import { mulberry32 } from "./rng.js";

const SLOT_TABLE = [
  { slot: "weapon", weight: 22, baseId: "blade", baseName: "Blade" },
  { slot: "body", weight: 18, baseId: "tunic", baseName: "Tunic" },
  { slot: "offhand", weight: 16, baseId: "shield", baseName: "Shield" },
  { slot: "head", weight: 16, baseId: "circlet", baseName: "Circlet" },
  { slot: "feet", weight: 16, baseId: "boots", baseName: "Boots" },
  { slot: "trinket", weight: 12, baseId: "charm", baseName: "Charm" }
];

const AFFIX_ROWS = [
  { id: "might", slots: ["weapon", "offhand", "head", "body", "feet", "trinket"], min: 1, max: 4 },
  { id: "guard", slots: ["head", "body", "offhand"], min: 1, max: 4 },
  { id: "focus", slots: ["head", "trinket"], min: 1, max: 4 },
  { id: "keen", slots: ["weapon"], min: 8, max: 18 },
  { id: "wardweave", slots: ["offhand"], min: 10, max: 25 },
  { id: "hale", slots: ["body", "feet"], min: 12, max: 40 },
  { id: "clear", slots: ["head", "trinket"], min: 8, max: 24 },
  { id: "quick", slots: ["feet"], min: 4, max: 8 }
];

const THEME_NAME = ["Moss", "Root", "Slate", "Ember"];
const PREFIX = {
  might: "Mighty",
  guard: "Guarded",
  focus: "Focused",
  keen: "Keen",
  wardweave: "Woven",
  hale: "Hale",
  clear: "Clear",
  quick: "Quick"
};
const SUFFIX = {
  might: "of Might",
  guard: "of the Guard",
  focus: "of Focus",
  keen: "of the Edge",
  wardweave: "of the Weave",
  hale: "of Vitality",
  clear: "of Clarity",
  quick: "of Haste"
};
const RELIC = ["of the Wood", "of the Gate", "of the Hearth", "of the Deep"];

const BASE_NAME = {
  blade: "Blade",
  shield: "Shield",
  circlet: "Circlet",
  tunic: "Tunic",
  boots: "Boots",
  charm: "Charm"
};

export function affixDef(id) {
  for (let i = 0; i < AFFIX_ROWS.length; i++) {
    if (AFFIX_ROWS[i].id === id) return AFFIX_ROWS[i];
  }
  return null;
}

export function lootRng(runSeed, floorIndex, spawnId) {
  return mulberry32(mixSeed(runSeed, floorIndex + 7919 + spawnId));
}

function pickSlot(roll) {
  let acc = 0;
  for (let i = 0; i < SLOT_TABLE.length; i++) {
    acc += SLOT_TABLE[i].weight;
    if (roll < acc) return SLOT_TABLE[i];
  }
  return SLOT_TABLE[SLOT_TABLE.length - 1];
}

function legalAffixes(slot) {
  const out = [];
  for (let i = 0; i < AFFIX_ROWS.length; i++) {
    if (AFFIX_ROWS[i].slots.indexOf(slot) >= 0) out.push(AFFIX_ROWS[i]);
  }
  return out;
}

function fisherYates(list, rng) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const swap = list[i];
    list[i] = list[j];
    list[j] = swap;
  }
  return list;
}

function rolledRarity(floorIndex, kind, rng) {
  const cuts = rarityCuts(floorIndex);
  const roll = Math.floor(rng() * 10000);
  let rarity = 0;
  if (roll < cuts.epic) rarity = 3;
  else if (roll < cuts.rare) rarity = 2;
  else if (roll < cuts.uncommon) rarity = 1;
  if (kind === "boss" && rarity < 2) rarity = 2;
  else if (kind === "elite" && rarity < 1) rarity = 1;
  return rarity;
}

export function gearName(item) {
  const theme = THEME_NAME[item.themeId] || THEME_NAME[0];
  const base = BASE_NAME[item.baseId] || "Gear";
  const affixes = item.affixes || [];
  if (!affixes.length) return theme + " " + base;
  let name = (PREFIX[affixes[0].id] || affixes[0].id) + " " + theme + " " + base;
  if (affixes[1]) name += " " + (SUFFIX[affixes[1].id] || ("of " + affixes[1].id));
  if (affixes[2]) {
    const index = Math.max(0, Math.min(3, Math.floor(affixes[2].t * 4)));
    name += " " + RELIC[index];
  }
  return name;
}

export function rollGearDrop(rng, spec) {
  const floorIndex = Math.max(1, Math.floor(Number(spec && spec.floorIndex) || 1));
  const spawnId = Math.floor(Number(spec && spec.spawnId) || 0);
  const ordinal = spec && spec.ordinal != null ? Math.floor(Number(spec.ordinal) || 0) : 0;
  const kind = spec && (spec.kind === "boss" || spec.kind === "elite") ? spec.kind : "normal";
  if (kind !== "boss") {
    const chance = 1800 + Math.min(2200, floorIndex * 40);
    if (Math.floor(rng() * 10000) >= chance) return null;
  }
  const ilvl = dropIlvl(floorIndex, kind);
  const slotDef = pickSlot(Math.floor(rng() * 100));
  const rarity = rolledRarity(floorIndex, kind, rng);
  const legal = fisherYates(legalAffixes(slotDef.slot), rng);
  const count = Math.min(rarity, legal.length);
  const affixes = [];
  for (let i = 0; i < count; i++) affixes.push({ id: legal[i].id, t: rng() });
  const item = {
    uid: "drop-" + floorIndex + "-" + spawnId + "-" + ordinal,
    kind: "gear",
    slot: slotDef.slot,
    consumableId: null,
    charges: 1,
    stack: 1,
    rarity,
    ilvl,
    baseId: slotDef.baseId,
    themeId: ((floorIndex - 1) % 4 + 4) % 4,
    affixes,
    name: ""
  };
  if (slotDef.slot === "weapon") item.weaponBase = 12 + Math.floor((ilvl - 1) * 1.1);
  item.name = gearName(item);
  return item;
}

export function gearTotals(equipped) {
  const out = { might: 0, guard: 0, focus: 0, flatHp: 0, flatMp: 0, quick: 0, wardweave: 0 };
  if (!equipped || typeof equipped !== "object") return out;
  const keys = ["weapon", "offhand", "head", "body", "feet", "trinket"];
  for (let s = 0; s < keys.length; s++) {
    const item = equipped[keys[s]];
    if (!item || !Array.isArray(item.affixes)) continue;
    const ilvl = Math.max(1, Math.floor(Number(item.ilvl) || 1));
    for (let i = 0; i < item.affixes.length; i++) {
      const affix = item.affixes[i];
      if (!affix || typeof affix.id !== "string") continue;
      const def = affixDef(affix.id);
      if (!def) continue;
      const value = affixValue(def, affix, ilvl);
      if (affix.id === "might" || affix.id === "guard" || affix.id === "focus") out[affix.id] += Math.round(value);
      else if (affix.id === "hale") out.flatHp += Math.round(value);
      else if (affix.id === "clear") out.flatMp += Math.round(value);
      else if (affix.id === "quick") out.quick += value;
      else if (affix.id === "wardweave") out.wardweave += value;
    }
  }
  return out;
}

function heirloom(slot, baseId, name, weaponBase) {
  const item = {
    uid: "heirloom-" + slot,
    kind: "gear",
    slot,
    consumableId: null,
    charges: 1,
    stack: 1,
    rarity: 0,
    ilvl: 1,
    baseId,
    themeId: 0,
    affixes: [],
    name
  };
  if (slot === "weapon") item.weaponBase = weaponBase;
  return item;
}

export function heirloomEquipped() {
  return {
    weapon: heirloom("weapon", "blade", "Warden's Blade", 12),
    offhand: heirloom("offhand", "shield", "Warden's Shield", 0),
    head: heirloom("head", "circlet", "Circlet", 0),
    body: heirloom("body", "tunic", "Tunic", 0),
    feet: heirloom("feet", "boots", "Boots", 0),
    trinket: null
  };
}

const PACK_LIMIT = 24;
const STACK_LIMIT = 20;

// Listed pays and counts. Delver's +1 is not a craft discount.
// `station` names the building that works the recipe: draughts are distilled
// at The Still, oil and kits come from The Quench.
export const RECIPES = [
  { id: "draught-hp", station: "still", gold: 10, materials: { heartwood: 1 }, consumableId: "draught-hp", count: 3, stack: true, charges: 1, name: "Health Draught" },
  { id: "draught-mp", station: "still", gold: 10, materials: { rootfiber: 1 }, consumableId: "draught-mp", count: 3, stack: true, charges: 1, name: "Mana Draught" },
  { id: "oil", station: "smith", gold: 40, materials: { slag: 2, emberglass: 1 }, consumableId: "oil", count: 1, stack: false, charges: 10, name: "Oil" },
  { id: "kit", station: "smith", gold: 30, materials: { heartwood: 3, slag: 2 }, consumableId: "kit", count: 1, stack: false, charges: 1, name: "Kit" }
];

export function recipeDef(id) {
  for (let i = 0; i < RECIPES.length; i++) {
    if (RECIPES[i].id === id) return RECIPES[i];
  }
  return null;
}

function matHave(materials, key) {
  if (!materials || !key) return 0;
  return Math.max(0, Math.floor(Number(materials[key]) || 0));
}

function canPayMaterials(materials, cost) {
  const keys = Object.keys(cost || {});
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (matHave(materials, key) < Math.floor(Number(cost[key]) || 0)) return false;
  }
  return true;
}

function payMaterials(materials, cost) {
  const keys = Object.keys(cost || {});
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const next = matHave(materials, key) - Math.floor(Number(cost[key]) || 0);
    materials[key] = next > 0 ? next : 0;
  }
}

function slotsNeeded(pack, recipe) {
  if (!recipe.stack) return recipe.count;
  let left = recipe.count;
  for (let i = 0; i < pack.length && left > 0; i++) {
    const item = pack[i];
    if (!item || item.kind !== "consumable" || item.consumableId !== recipe.consumableId) continue;
    const room = STACK_LIMIT - Math.max(0, Math.floor(Number(item.stack) || 0));
    if (room <= 0) continue;
    left -= Math.min(room, left);
  }
  if (left <= 0) return 0;
  return Math.ceil(left / STACK_LIMIT);
}

function takeUid(state) {
  const n = Math.max(1, Math.floor(Number(state.nextUid) || 1));
  state.nextUid = n + 1;
  return "craft-" + n;
}

function emitRecipe(state, recipe) {
  if (!recipe.stack) {
    for (let i = 0; i < recipe.count; i++) {
      state.pack.push({
        uid: takeUid(state),
        kind: "consumable",
        slot: null,
        consumableId: recipe.consumableId,
        charges: recipe.charges,
        stack: 1,
        rarity: 0,
        ilvl: 1,
        baseId: null,
        themeId: 0,
        affixes: [],
        name: recipe.name
      });
    }
    return;
  }
  let left = recipe.count;
  for (let i = 0; i < state.pack.length && left > 0; i++) {
    const item = state.pack[i];
    if (!item || item.kind !== "consumable" || item.consumableId !== recipe.consumableId) continue;
    const room = STACK_LIMIT - Math.max(0, Math.floor(Number(item.stack) || 0));
    if (room <= 0) continue;
    const take = Math.min(room, left);
    item.stack = Math.max(0, Math.floor(Number(item.stack) || 0)) + take;
    left -= take;
  }
  while (left > 0) {
    const take = Math.min(STACK_LIMIT, left);
    state.pack.push({
      uid: takeUid(state),
      kind: "consumable",
      slot: null,
      consumableId: recipe.consumableId,
      charges: recipe.charges,
      stack: take,
      rarity: 0,
      ilvl: 1,
      baseId: null,
      themeId: 0,
      affixes: [],
      name: recipe.name
    });
    left -= take;
  }
}

export function tryCraft(state, recipeId) {
  const recipe = recipeDef(recipeId);
  if (!state || !recipe) return { ok: false, reason: "recipe" };
  if (!Array.isArray(state.pack)) state.pack = [];
  if (!state.materials) return { ok: false, reason: "materials" };
  const gold = Math.floor(Number(recipe.gold) || 0);
  const purse = Math.floor(Number(state.purse) || 0);
  if (purse < gold) return { ok: false, reason: "gold" };
  if (!canPayMaterials(state.materials, recipe.materials)) return { ok: false, reason: "materials" };
  if (state.pack.length + slotsNeeded(state.pack, recipe) > PACK_LIMIT) return { ok: false, reason: "pack" };
  state.purse = purse - gold;
  payMaterials(state.materials, recipe.materials);
  emitRecipe(state, recipe);
  return { ok: true };
}

function findKit(pack) {
  if (!Array.isArray(pack)) return -1;
  for (let i = 0; i < pack.length; i++) {
    const item = pack[i];
    if (item && item.kind === "consumable" && item.consumableId === "kit" && Math.floor(Number(item.stack) || 0) > 0) return i;
  }
  return -1;
}

// The only cap is newIlvl <= bestDepth. Affix id and t stay. Weapons gain 1 weaponBase.
export function tryUpgrade(state, item, useKit) {
  if (!state || !item || item.kind === "consumable") return { ok: false, reason: "gear" };
  const ilvl = Math.max(0, Math.floor(Number(item.ilvl) || 0));
  const depth = Math.max(0, Math.floor(Number(state.bestDepth) || 0));
  if (ilvl + 1 > depth) return { ok: false, reason: "depth" };
  const themeId = Math.max(0, Math.floor(Number(item.themeId) || 0));
  const cost = upgradeCost(ilvl, themeId);
  const gold = Math.floor(Number(cost.gold) || 0);
  const purse = Math.floor(Number(state.purse) || 0);
  if (purse < gold) return { ok: false, reason: "gold" };
  const kitIndex = useKit ? findKit(state.pack) : -1;
  if (useKit) {
    if (kitIndex < 0) return { ok: false, reason: "kit" };
  } else if (!canPayMaterials(state.materials, cost.materials)) {
    return { ok: false, reason: "materials" };
  }
  state.purse = purse - gold;
  if (useKit) {
    const kit = state.pack[kitIndex];
    const stack = Math.floor(Number(kit.stack) || 1);
    if (stack <= 1) state.pack.splice(kitIndex, 1);
    else kit.stack = stack - 1;
  } else {
    payMaterials(state.materials, cost.materials);
  }
  item.ilvl = ilvl + 1;
  if (item.slot === "weapon") item.weaponBase = Math.max(0, Math.floor(Number(item.weaponBase) || 0)) + 1;
  return { ok: true, cost };
}

const KILL_MATERIAL = ["heartwood", "rootfiber", "slag", "emberglass"];

// Gold and theme material for one kill (spec: Difficulty, "Material drop").
// Gold is killGold(n) × 3 for elites × 8 for bosses. A material drops on a roll
// below 4000 of 10000: the floor theme's material, materialDropCount of them.
// Uses its own rng stream so the gear roll is unchanged.
export function killExtras(rng, spec) {
  const floorIndex = Math.max(1, Math.floor(Number(spec && spec.floorIndex) || 1));
  const kind = spec && (spec.kind === "boss" || spec.kind === "elite") ? spec.kind : "normal";
  const rank = Math.max(0, Math.floor(Number(spec && spec.delver) || 0));
  const gold = killGold(floorIndex) * (kind === "elite" ? 3 : 1) * (kind === "boss" ? 8 : 1);
  const roll = Math.floor(rng() * 10000);
  const bonusRoll = rng();
  let material = null;
  if (roll < 4000) {
    material = {
      key: KILL_MATERIAL[((floorIndex - 1) % 4 + 4) % 4],
      count: materialDropCount(kind, rank, bonusRoll)
    };
  }
  return { gold, material };
}

export function extrasRng(runSeed, floorIndex, spawnId) {
  return mulberry32(mixSeed(runSeed ^ 0x6a09e667, floorIndex + 104729 + spawnId));
}

// Drop quantity before the 40% roll. Rank below 3 adds 0, including rank 0.
export function materialDropCount(kind, rank, bonusRoll) {
  let qty = 1;
  if (kind === "boss") qty += 3;
  else if (kind === "elite") qty += 1;
  return qty + delverMatBonus(rank, bonusRoll);
}
