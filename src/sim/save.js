// Hand edits are allowed. There is no checksum, encryption, or account.
// A ledger is accepted as written; out-of-range numbers clamp, they do not reject play.

import { heirloomEquipped } from "./items.js";

export const SCHEMA = 1;
export const SAVE_KEY = "greenmere.save.v1";
export const SAVE_BAK_KEY = "greenmere.save.v1.bak";
export const SAVE_MAX_CHARS = 256 * 1024;

const SLOT_KEYS = ["weapon", "offhand", "head", "body", "feet", "trinket"];
const MAT_KEYS = ["heartwood", "slag", "rootfiber", "emberglass"];
function bannedKey(key) {
  return key === "__proto__" || key === "constructor" || key === "prototype";
}

export function clampInt(n, lo, hi, fallback) {
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, Math.floor(n)));
}

function finiteNum(n, fallback) {
  return typeof n === "number" && Number.isFinite(n) ? n : fallback;
}

export function freshGame() {
  return {
    schemaVersion: SCHEMA,
    savedAt: 0,
    nextUid: 1,
    hero: {
      name: "Warden",
      level: 1,
      xp: 0,
      skillPoints: 0,
      tracks: { edge: 0, bulwark: 0, mend: 0, delver: 0 },
      equipped: heirloomEquipped(),
      pack: [],
      purse: 0,
      bank: 0,
      materials: { heartwood: 0, slag: 0, rootfiber: 0, emberglass: 0 },
      hp: 160,
      mp: 80,
      bestDepth: 0,
      townUnlocks: { store: true, smith: true, trainer: true, stall: false }
    },
    stash: [],
    run: null
  };
}

function copyPlain(value, depth) {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value;
  if (depth > 6) return null;
  if (Array.isArray(value)) {
    const out = [];
    for (let i = 0; i < value.length && i < 32; i++) out.push(copyPlain(value[i], depth + 1));
    return out;
  }
  if (typeof value !== "object") return null;
  const out = {};
  const keys = Object.keys(value);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (bannedKey(key)) continue;
    out[key] = copyPlain(value[key], depth + 1);
  }
  return out;
}

function copyList(list, cap) {
  const out = [];
  if (!Array.isArray(list)) return out;
  for (let i = 0; i < list.length && out.length < cap; i++) {
    if (!list[i] || typeof list[i] !== "object") continue;
    const item = copyPlain(list[i], 0);
    if (item) out.push(item);
  }
  return out;
}

function applySharedHero(out, hero) {
  out.hero.level = clampInt(hero.level, 1, 9999, 1);
  out.hero.xp = clampInt(hero.xp, 0, 1e9, 0);
  out.hero.purse = clampInt(hero.purse, 0, 1e9, 0);
  out.hero.bank = clampInt(hero.bank, 0, 1e9, 0);
  out.hero.bestDepth = clampInt(hero.bestDepth, 0, 1e6, 0);
  if (hero.materials && typeof hero.materials === "object") {
    for (let i = 0; i < MAT_KEYS.length; i++) {
      const key = MAT_KEYS[i];
      out.hero.materials[key] = clampInt(hero.materials[key], 0, 999, 0);
    }
  }
  if (hero.tracks && typeof hero.tracks === "object") {
    const keys = Object.keys(hero.tracks);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
      out.hero.tracks[key] = clampInt(hero.tracks[key], 0, 5, 0);
    }
  }
  const spent = Object.values(out.hero.tracks).reduce((sum, rank) => sum + (Number.isFinite(rank) ? rank : 0), 0);
  out.hero.skillPoints = Number.isFinite(hero.skillPoints)
    ? clampInt(hero.skillPoints, 0, 9999, 0)
    : Math.max(0, out.hero.level - 1 - spent);
  const equipped = hero.equipped;
  const hasSlots = equipped && typeof equipped === "object" && SLOT_KEYS.every((key) => Object.prototype.hasOwnProperty.call(equipped, key));
  if (hasSlots) {
    out.hero.equipped = {};
    for (let i = 0; i < SLOT_KEYS.length; i++) {
      const key = SLOT_KEYS[i];
      const value = equipped[key];
      out.hero.equipped[key] = value == null || typeof value !== "object" ? null : copyPlain(value, 0);
    }
  }
  return out;
}

function normalizeRun(run) {
  if (!run || typeof run !== "object" || Array.isArray(run)) return null;
  const killed = [];
  if (Array.isArray(run.killed)) {
    for (let i = 0; i < run.killed.length && killed.length < 80; i++) {
      const id = clampInt(run.killed[i], 0, 1e6, -1);
      if (id >= 0 && killed.indexOf(id) < 0) killed.push(id);
    }
  }
  const picked = [];
  if (Array.isArray(run.picked)) {
    // Up to three drops per kill (gear, gold, material) on a 36-enemy floor.
    for (let i = 0; i < run.picked.length && picked.length < 200; i++) {
      const entry = run.picked[i];
      if (typeof entry === "string" && entry) picked.push(entry.slice(0, 80));
      else if (typeof entry === "number" && Number.isFinite(entry)) picked.push(String(Math.floor(entry)));
    }
  }
  const enemyHp = {};
  if (run.enemyHp && typeof run.enemyHp === "object" && !Array.isArray(run.enemyHp)) {
    const keys = Object.keys(run.enemyHp);
    for (let i = 0; i < keys.length && Object.keys(enemyHp).length < 64; i++) {
      const key = keys[i];
      if (bannedKey(key)) continue;
      const hp = clampInt(run.enemyHp[key], 1, 1e7, 0);
      if (hp > 0) enemyHp[key] = hp;
    }
  }
  const summons = [];
  if (Array.isArray(run.summons)) {
    for (let i = 0; i < run.summons.length && summons.length < 16; i++) {
      const src = run.summons[i];
      if (!src || typeof src !== "object") continue;
      summons.push({
        id: clampInt(src.id, 0, 1e6, 0),
        archetype: typeof src.archetype === "string" ? src.archetype.slice(0, 32) : "",
        x: finiteNum(src.x, 0),
        z: finiteNum(src.z, 0),
        hp: clampInt(src.hp, 1, 1e7, 1)
      });
    }
  }
  let rngState = 0;
  if (Number.isFinite(run.rngState)) rngState = run.rngState >>> 0;
  return {
    runSeed: clampInt(run.runSeed, 0, 0xffffffff, 1) >>> 0,
    floorIndex: clampInt(run.floorIndex, 1, 1e9, 1),
    x: Math.max(-1e6, Math.min(1e6, finiteNum(run.x, 0))),
    z: Math.max(-1e6, Math.min(1e6, finiteNum(run.z, 0))),
    yaw: Math.max(-1e6, Math.min(1e6, finiteNum(run.yaw, 0))),
    hp: clampInt(run.hp, 0, 1e7, 160),
    mp: clampInt(run.mp, 0, 1e7, 80),
    killed,
    picked,
    enemyHp,
    summons,
    rngState,
    floorGuard: !!run.floorGuard,
    oilLeft: clampInt(run.oilLeft, 0, 99, 0)
  };
}

function normalizeV1(doc) {
  const out = freshGame();
  out.schemaVersion = SCHEMA;
  const hero = doc && doc.hero && typeof doc.hero === "object" ? doc.hero : {};
  if (typeof hero.name === "string" && hero.name) out.hero.name = hero.name.slice(0, 64);
  applySharedHero(out, hero);
  out.hero.hp = clampInt(hero.hp, 0, 1e7, out.hero.hp);
  out.hero.mp = clampInt(hero.mp, 0, 1e7, out.hero.mp);
  out.hero.pack = copyList(hero.pack, 24);
  out.stash = copyList(doc && doc.stash, 48);
  out.nextUid = clampInt(doc && doc.nextUid, 1, 1e9, 1);
  out.savedAt = Number.isFinite(doc && doc.savedAt) && doc.savedAt > 0 ? Math.floor(doc.savedAt) : 0;
  const unlocks = hero.townUnlocks;
  out.hero.townUnlocks = {
    store: !!(unlocks && typeof unlocks === "object" && typeof unlocks.store === "boolean" ? unlocks.store : true),
    smith: !!(unlocks && typeof unlocks === "object" && typeof unlocks.smith === "boolean" ? unlocks.smith : true),
    trainer: !!(unlocks && typeof unlocks === "object" && typeof unlocks.trainer === "boolean" ? unlocks.trainer : true),
    stall: false
  };
  out.run = normalizeRun(doc && doc.run);
  return out;
}

const MIGRATIONS = [
  function v0_to_v1(doc) {
    const out = freshGame();
    out.schemaVersion = 1;
    const hero = doc && doc.hero && typeof doc.hero === "object" ? doc.hero : {};
    applySharedHero(out, hero);
    return out;
  }
];

function versionOf(doc) {
  const looks = Object.prototype.hasOwnProperty.call(doc, "hero") || Object.prototype.hasOwnProperty.call(doc, "schemaVersion");
  if (!looks) return null;
  if (!Object.prototype.hasOwnProperty.call(doc, "schemaVersion") || doc.schemaVersion == null) return 0;
  const v = doc.schemaVersion;
  if (typeof v === "number" && Number.isFinite(v)) return Math.floor(v);
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Math.floor(Number(v));
  throw new Error("unreadable ledger");
}

export function migrate(doc) {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return freshGame();
  let version = versionOf(doc);
  if (version == null) return freshGame();
  if (version > SCHEMA) throw new Error("unreadable ledger");
  if (version < 0) return freshGame();
  let current = doc;
  let guard = 0;
  while (version !== SCHEMA) {
    const step = MIGRATIONS[version];
    if (typeof step !== "function") throw new Error("unreadable ledger");
    current = step(current);
    const next = current && current.schemaVersion;
    if (next !== version + 1) throw new Error("unreadable ledger");
    version = next;
    if (++guard > 8) throw new Error("unreadable ledger");
  }
  return normalizeV1(current);
}

// Size check only. Callers refuse the write; this must not throw into the frame loop.
export function ledgerExceedsCap(text) {
  return typeof text === "string" && text.length > SAVE_MAX_CHARS;
}

export function parseSave(text) {
  if (typeof text !== "string") throw new Error("unreadable ledger");
  return JSON.parse(text, (key, value) => {
    if (key === "__proto__" || key === "constructor" || key === "prototype") return undefined;
    return value;
  });
}
