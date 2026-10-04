// The Warden's lifetime tally for the character sheet's Ledger tab: time played,
// delves, kills, deaths, the deepest floor reached, what was found and made.
// Pure: fed the same game events quests see (play/lifestats.js), saved with the
// hero, clamped on load like every other ledger number.

export const FOE_KINDS = ["skirmisher", "brute", "spitter", "shade", "boss"];
const COUNTERS = [
  "delves", "kills", "elites", "bosses", "deaths", "extracts", "deepestFloor",
  "chests", "goldFound", "materialsFound", "gearFound", "crafts", "sold", "questsDone"
];

export function emptyStats() {
  const out = { playSeconds: 0, delveSeconds: 0, killsBy: {}, gearByRarity: [0, 0, 0, 0] };
  for (const k of COUNTERS) out[k] = 0;
  for (const k of FOE_KINDS) out.killsBy[k] = 0;
  return out;
}

function count(v, hi) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(hi, Math.floor(n))) : 0;
}

export function normalizeStats(raw) {
  const out = emptyStats();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  out.playSeconds = count(raw.playSeconds, 1e10);
  out.delveSeconds = Math.min(out.playSeconds, count(raw.delveSeconds, 1e10));
  for (const k of COUNTERS) out[k] = count(raw[k], 1e12);
  if (raw.killsBy && typeof raw.killsBy === "object") {
    for (const k of FOE_KINDS) out.killsBy[k] = count(raw.killsBy[k], 1e12);
  }
  if (Array.isArray(raw.gearByRarity)) {
    for (let i = 0; i < 4; i++) out.gearByRarity[i] = count(raw.gearByRarity[i], 1e12);
  }
  return out;
}

function amount(e) {
  return Math.max(0, Math.floor(Number(e.amount) || 0));
}

// Apply one game event (the shape rt.questEvent receives). Returns whether anything moved.
export function recordStat(stats, e) {
  if (!stats || !e || !e.type) return false;
  switch (e.type) {
    case "kill": {
      stats.kills++;
      const kind = e.boss ? "boss" : e.archetype;
      if (FOE_KINDS.indexOf(kind) >= 0) stats.killsBy[kind]++;
      if (e.boss) stats.bosses++;
      else if (e.elite) stats.elites++;
      return true;
    }
    case "floor":
      stats.deepestFloor = Math.max(stats.deepestFloor, count(e.floor, 1e6));
      return true;
    case "delve": stats.delves++; return true;
    case "extract": stats.extracts++; return true;
    case "death": stats.deaths++; return true;
    case "chest": stats.chests++; return true;
    case "gold": stats.goldFound += amount(e); return true;
    case "material": stats.materialsFound += amount(e); return true;
    case "gear":
      stats.gearFound++;
      stats.gearByRarity[Math.max(0, Math.min(3, Math.floor(Number(e.rarity) || 0)))]++;
      return true;
    case "craft": stats.crafts++; return true;
    case "sell": stats.sold++; return true;
    case "unsell": stats.sold = Math.max(0, stats.sold - 1); return true;
    case "quest": stats.questsDone++; return true;
    default: return false;
  }
}

// "3h 12m", "12m 05s", "42s".
export function playTimeText(seconds) {
  const s = count(seconds, 1e10);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h) return h + "h " + String(m).padStart(2, "0") + "m";
  if (m) return m + "m " + String(r).padStart(2, "0") + "s";
  return r + "s";
}
