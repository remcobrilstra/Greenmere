// How a piece of gear looks on the Warden. Pure data: item in, colours and
// flags out (no three). view/hero.js builds the meshes from it.
//
// - The theme (the biome it dropped in) colours its cloth and leather.
// - Rarity sets the trim metal: iron, bronze, silver, gold.
// - Rare (2) pieces carry a glowing gem or accent in the theme's glow.
// - Epic (3) pieces are relics: their own shape, glowing runes in the relic's
//   colour (Wood, Gate, Hearth, Deep: the third affix's name), and drifting motes.
// - The starting heirlooms keep the Warden's blue and gold.

export const THEMES = [
  { name: "Moss", cloth: 0x3f7a3a, dark: 0x284f26, leather: 0x5a4a2a, glow: 0x9be86a },
  { name: "Root", cloth: 0x8a5230, dark: 0x5a321c, leather: 0x4a2c1a, glow: 0xffb060 },
  { name: "Slate", cloth: 0x51657c, dark: 0x334152, leather: 0x3c3c44, glow: 0x8cc8ff },
  { name: "Ember", cloth: 0xa23c28, dark: 0x6a2216, leather: 0x4a2418, glow: 0xff6a3a }
];
const HEIRLOOM = { name: "Warden", cloth: 0x2d62c8, dark: 0x1c3f8c, leather: 0x5a3a24, glow: 0x8cc8ff };
const TRIM = [0x7d838a, 0xb57d3e, 0xdde6ee, 0xffc84a];
const HEIRLOOM_TRIM = 0xd4a03a;
export const RELIC_GLOW = [0x8ed15a, 0xb48cff, 0xffa040, 0x5ad8d0];
const RELIC_NAME = ["Wood", "Gate", "Hearth", "Deep"];

function clampInt(v, lo, hi) {
  const n = Math.floor(Number(v) || 0);
  return Math.max(lo, Math.min(hi, n));
}

export function isHeirloom(item) {
  return !!(item && typeof item.uid === "string" && item.uid.indexOf("heirloom-") === 0);
}

// { tier: "heirloom" | "plain" | "fine" | "rare" | "relic", cloth, dark, leather,
//   trim, steel, glow (0 when none), relic (name or ""), motes (count) }
export function gearLook(item) {
  if (!item || item.kind === "consumable") return null;
  if (isHeirloom(item)) {
    return { tier: "heirloom", rarity: 0, cloth: HEIRLOOM.cloth, dark: HEIRLOOM.dark, leather: HEIRLOOM.leather, trim: HEIRLOOM_TRIM, steel: 0xc5d0dc, glow: 0, relic: "", motes: 0 };
  }
  const rarity = clampInt(item.rarity, 0, 3);
  const theme = THEMES[clampInt(item.themeId, 0, THEMES.length - 1)];
  const look = {
    tier: ["plain", "fine", "rare", "relic"][rarity],
    rarity,
    cloth: theme.cloth,
    dark: theme.dark,
    leather: theme.leather,
    trim: TRIM[rarity],
    steel: rarity >= 2 ? 0xd8e2ec : 0xa9b2bc,
    glow: rarity >= 2 ? theme.glow : 0,
    relic: "",
    motes: 0
  };
  if (rarity >= 3) {
    const a = Array.isArray(item.affixes) ? item.affixes[2] : null;
    const index = a ? Math.max(0, Math.min(3, Math.floor((Number(a.t) || 0) * 4))) : 0;
    look.relic = RELIC_NAME[index];
    look.glow = RELIC_GLOW[index];
    look.motes = 5;
  }
  return look;
}

// A short signature of what is worn, so the Warden is only re-dressed on change.
export function lookSignature(equipped) {
  if (!equipped) return "";
  const keys = ["weapon", "offhand", "head", "body", "feet", "trinket"];
  let sig = "";
  for (const k of keys) {
    const it = equipped[k];
    sig += k + ":" + (it ? (it.uid || "") + "/" + (it.rarity || 0) + "/" + (it.themeId || 0) + "/" + (Array.isArray(it.affixes) && it.affixes[2] ? Math.floor((Number(it.affixes[2].t) || 0) * 4) : "-") : "none") + ";";
  }
  return sig;
}
