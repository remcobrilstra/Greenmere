// hero: { level, might?, tracks?: { edge }, hp, deathLock }
// weapon: { weaponBase, ilvl, affixes: [{ id, t }] } or null (unarmed).
// ward: absorb number, or { absorb, bulwarkRank } for the rank >= 3 reduction.

const EDGE_MUL = [1, 1.12, 1.12, 1.28, 1.28, 1.45];
const KEEN_DEF = { min: 8, max: 18 };
const THEME_MAT = ["heartwood", "rootfiber", "slag", "emberglass"];

// Floors grow by two tiles per biome band (10 floors): 68 m across at floor 1, 108 m at the cap.
export function floorSpan(n) {
  return Math.min(27, 17 + 2 * Math.floor((n - 1) / 10));
}

export function enemyBudget(n) {
  return Math.min(36, 7 + Math.max(1, Math.floor(n)));
}

export function eliteCount(n) {
  if (n % 5 === 0) return 0;
  if (n < 3) return 0;
  return Math.min(3, 1 + Math.floor((n - 3) / 12));
}

// Traps per floor (docs/traps.md §6): none on floors 1-2, then one more every third floor.
export function trapBudget(n) {
  const f = Math.max(1, Math.floor(n));
  if (f < 3) return 0;
  return Math.min(12, 1 + Math.floor((f - 2) / 3));
}

// One trap hit before mitigation: the trap's multiple of a skirmisher hit.
export function trapDamage(n, dmgMul) {
  return Math.max(1, Math.round(skirmisherDmg(n) * (dmgMul > 0 ? dmgMul : 1)));
}

export function enemyLevel(n) {
  return n;
}

export function skirmisherHp(n) {
  return Math.round(28 + 10 * n);
}

export function skirmisherDmg(n) {
  return Math.round(6 + 2.2 * n);
}

export function killGold(n) {
  return Math.round(3 + 1.1 * n);
}

export function killXp(n) {
  return Math.round(8 + 4 * enemyLevel(n));
}

export function rarityCuts(n) {
  const epic = n >= 15 ? 120 + Math.floor(n * 3.5) : 0;
  const rare = epic + 500 + n * 12;
  const uncommon = rare + 2200;
  return { epic, rare, uncommon };
}

export function xpToNext(level) {
  return 30 * level + 8 * level * level;
}

const TRACK_IDS = ["edge", "bulwark", "mend", "delver"];
const MEND_HEAL = [22, 30, 30, 40, 40, 48];
const ABSORB_MUL = [1, 1.2, 1.2, 1.2, 1.2, 1.35];

function clampRank(rank) {
  const n = Math.floor(Number(rank));
  if (!Number.isFinite(n) || n < 0) return 0;
  if (n > 5) return 5;
  return n;
}

export function edgeMul(rank) {
  return EDGE_MUL[clampRank(rank)];
}

export function strikeRange(rank) {
  return clampRank(rank) >= 2 ? 2.35 : 2.1;
}

export function strikeArcDeg(rank) {
  return clampRank(rank) >= 2 ? 120 : 100;
}

export function strikeCooldown(rank) {
  return clampRank(rank) >= 4 ? 0.42 : 0.55;
}

export function wardAbsorbMul(rank) {
  return ABSORB_MUL[clampRank(rank)];
}

export function wardCost(rank) {
  return clampRank(rank) >= 4 ? 6 : 8;
}

export function wardDuration(rank) {
  return clampRank(rank) >= 2 ? 5.5 : 4;
}

export function wardAbsorb(guard, rank, weaveMul) {
  const weave = weaveMul == null ? 1 : weaveMul;
  return Math.round((15 + guard * 1.5) * wardAbsorbMul(rank) * weave);
}

export function mendHeal(rank) {
  return MEND_HEAL[clampRank(rank)];
}

export function mendCost(rank) {
  return clampRank(rank) >= 5 ? 10 : 14;
}

// Mend has no cooldown: the cast time is its price.
export function mendCooldown(rank) {
  return 0;
}

// A hit while mending pushes the cast back this far (it never goes below empty).
// From rank 2 the Warden's hands are steadier: half as far.
export const MEND_PUSHBACK = 0.5;
export function mendPushback(rank) {
  return clampRank(rank) >= 2 ? MEND_PUSHBACK / 2 : MEND_PUSHBACK;
}

// Mend is a held channel: 1.5 s at rank 0, 0.1 s quicker per rank to 1.1 s.
// Moving 0.6 m or letting go breaks it and spends nothing; a hit pushes it back.
export function mendCastSeconds(rank) {
  return Math.round((1.5 - 0.1 * Math.min(4, clampRank(rank))) * 100) / 100;
}

export function mendHot(rank) {
  return clampRank(rank) >= 4 ? 8 : 0;
}

export function walkSpeed(rank) {
  return clampRank(rank) >= 4 ? 7 : 6.4;
}

export function sprintSpeed(rank) {
  return clampRank(rank) >= 1 ? 12.4 : 11.5;
}

export function extractSeconds(rank) {
  return clampRank(rank) >= 2 ? 2 : 2.6;
}

// floor(rng * 100) < 35, not a stored percent. Returns 0 or 1.
export function delverMatBonus(rank, roll) {
  if (clampRank(rank) < 3) return 0;
  return Math.floor(Number(roll) * 100) < 35 ? 1 : 0;
}

export function xpGrant(floorIndex, kind) {
  let elite = 1;
  let boss = 1;
  if (kind === "boss" || (kind && kind.boss)) boss = 6;
  else if (kind === "elite" || (kind && (kind.elite || kind.eliteAffix))) elite = 2.5;
  return killXp(floorIndex) * elite * boss;
}

export function grantXp(hero, amount) {
  if (!hero || !(amount > 0)) return 0;
  hero.xp = (Number(hero.xp) || 0) + amount;
  let level = Math.floor(Number(hero.level) || 1);
  if (level < 1) level = 1;
  let gained = 0;
  while (hero.xp >= xpToNext(level)) {
    const need = xpToNext(level);
    if (!(need > 0)) break;
    hero.xp -= need;
    level += 1;
    hero.skillPoints = Math.floor(Number(hero.skillPoints) || 0) + 1;
    gained += 1;
  }
  hero.level = level;
  return gained;
}

export function raiseRank(hero, track) {
  if (!hero || TRACK_IDS.indexOf(track) < 0) return false;
  if (!hero.tracks || typeof hero.tracks !== "object") return false;
  const rank = clampRank(hero.tracks[track]);
  const points = Math.floor(Number(hero.skillPoints) || 0);
  if (rank >= 5 || points <= 0) return false;
  hero.tracks[track] = rank + 1;
  hero.skillPoints = points - 1;
  return true;
}

export function upgradeGold(ilvl) {
  const k = ilvl + 1;
  return 20 * k + 4 * k * k;
}

export function upgradeCost(ilvl, themeId) {
  const themeMat = THEME_MAT[themeId];
  if (ilvl < 10) return { gold: upgradeGold(ilvl), materials: { [themeMat]: 2 } };
  return { gold: upgradeGold(ilvl), materials: { slag: 2, emberglass: 1 } };
}

// Affix magnitude. The roll (t) sets the value at ilvl 1; every item level after
// that adds AFFIX_GROWTH of it, in a straight line, so each smith upgrade counts
// the same and a good roll keeps its lead.
export const AFFIX_GROWTH = 0.06;
const AFFIX_START = 0.25 + 0.75 / 26;

export function affixValue(def, affix, ilvl) {
  const lv = Math.max(1, Number(ilvl) || 1);
  const span = def.max - def.min;
  const roll = def.min + span * AFFIX_START * (0.55 + 0.45 * affix.t);
  return roll * (1 + AFFIX_GROWTH * (lv - 1));
}

export function dropIlvl(floorIndex, kind) {
  const bonus = kind === "boss" ? 2 : kind === "elite" ? 1 : 0;
  return floorIndex + bonus;
}

export function arcHit(origin, forward, target, range, halfAngleRad, hurtRadius) {
  const dx = target.x - origin.x;
  const dz = target.z - origin.z;
  const dist = Math.hypot(dx, dz);
  if (dist > range + hurtRadius) return false;
  if (dist < 1e-6) return true;
  const dot = (dx / dist) * forward.x + (dz / dist) * forward.z;
  const minDot = Math.cos(halfAngleRad);
  return dot >= minDot;
}

export function strikeDamage(hero, weapon) {
  const level = hero && Number.isFinite(hero.level) ? hero.level : 1;
  const might = hero && hero.might != null ? hero.might : 9 + level;
  const mul = edgeMul(hero && hero.tracks ? hero.tracks.edge : 0);
  const weaponBase = weapon && weapon.weaponBase ? weapon.weaponBase : 0;
  let keenMul = 1;
  const affixes = weapon && weapon.affixes;
  if (affixes) {
    for (let i = 0; i < affixes.length; i++) {
      if (affixes[i].id === "keen") {
        keenMul = 1 + affixValue(KEEN_DEF, affixes[i], weapon.ilvl || 1) / 100;
        break;
      }
    }
  }
  return Math.round(weaponBase * (1 + might * 0.04) * mul * keenMul);
}

export function incomingDamage(raw, guard, ward) {
  let absorb = 0;
  let bulwarkRank = 0;
  if (ward && typeof ward === "object") {
    absorb = ward.absorb || 0;
    bulwarkRank = ward.bulwarkRank || 0;
  } else if (typeof ward === "number") {
    absorb = ward;
  }
  if (!(raw > 0)) return { hpLoss: 0, wardLeft: absorb };
  const g = guard > 0 ? guard : 0;
  const mitigation = g / (g + 50);
  let post = Math.max(1, Math.round(raw * (1 - mitigation)));
  if (absorb > 0 && bulwarkRank >= 3) post = Math.max(1, Math.round(post * 0.92));
  if (absorb > 0) {
    const blocked = Math.min(absorb, post);
    return { hpLoss: post - blocked, wardLeft: absorb - blocked };
  }
  return { hpLoss: post, wardLeft: 0 };
}

// How long the Warden lies fallen before waking in town (play/deathfx.js plays
// the fall over it).
export const DEATH_LOCK_S = 3.2;

function beginDeathLock(unit) {
  unit.deathLock = true;
  unit.deathLockT = DEATH_LOCK_S;
  unit.deathTransitions = (unit.deathTransitions || 0) + 1;
}

export function applyDamage(unit, hpLoss) {
  if (unit.deathLock) return;
  const prev = unit.hp;
  unit.hp = Math.max(0, prev - hpLoss);
  if (prev > 0 && unit.hp === 0) beginDeathLock(unit);
}

const FOE = {
  skirmisher: { speed: 4.6, range: 1.5, hpMul: 1, dmgMul: 1, hurt: 0.45, telegraph: 0.45 },
  brute: { speed: 3.1, range: 2.0, hpMul: 2.1, dmgMul: 1.35, hurt: 0.55, telegraph: 0.70 },
  spitter: { speed: 3.4, range: 6.5, hpMul: 0.75, dmgMul: 0.85, hurt: 0.45, telegraph: 0.40 },
  shade: { speed: 4.2, range: 1.7, hpMul: 1.3, dmgMul: 1.1, hurt: 0.45, telegraph: 0.50 },
  boss: { speed: 3.3, range: 2.4, hpMul: 8, dmgMul: 2.1, hurt: 0.9, telegraph: 0.60 }
};

export const ORB_RADIUS = 0.25;
export const PLAYER_HURT = 0.42;
const LEASH = 16;
const AGGRO = 9;

export function telegraphSeconds(base, eliteAffix) {
  if (eliteAffix === "hasted") return Math.max(0.35, base - 0.1);
  return base;
}

export function foeProfile(floorIndex, archetype, eliteAffix, boss) {
  const isBoss = !!boss || archetype === "boss";
  const row = FOE[isBoss ? "boss" : archetype] || FOE.skirmisher;
  const elite = !isBoss && !!eliteAffix;
  let hp = isBoss ? skirmisherHp(floorIndex) * 8 : Math.round(skirmisherHp(floorIndex) * row.hpMul);
  if (elite) hp = Math.round(hp * 2.4);
  if (elite && eliteAffix === "thick") hp = Math.round(hp * 1.4);
  let dmg = isBoss ? Math.round(skirmisherDmg(floorIndex) * 2.1) : Math.round(skirmisherDmg(floorIndex) * row.dmgMul);
  if (elite) dmg = Math.round(dmg * 1.55);
  let speed = row.speed;
  if (elite && eliteAffix === "hasted") speed *= 1.25;
  return { hp, dmg, speed, range: row.range, hurt: row.hurt, telegraph: row.telegraph };
}

export function livingCount(list) {
  let n = 0;
  if (!list) return 0;
  for (let i = 0; i < list.length; i++) if (list[i] && list[i].hp > 0) n++;
  return n;
}

export function summonRoom(living) {
  return Math.max(0, 36 - (living | 0));
}

export function applyFoeDamage(enemy, amount) {
  let left = amount > 0 ? amount : 0;
  const incoming = left;
  if (enemy.shadeAbsorb > 0 && enemy.shadeT > 0 && left > 0) {
    const use = Math.min(enemy.shadeAbsorb, left);
    enemy.shadeAbsorb -= use;
    left -= use;
  }
  if (enemy.wardAbsorb > 0 && left > 0) {
    const use = Math.min(enemy.wardAbsorb, left);
    enemy.wardAbsorb -= use;
    left -= use;
    if (enemy.wardAbsorb <= 0) {
      enemy.wardAbsorb = 0;
      enemy.wardBroken = true;
    }
  }
  if (left > 0) applyDamage(enemy, left);
  if (enemy.archetype === "shade" && !enemy.shadeUsed && enemy.hp > 0 && enemy.hpMax > 0 && enemy.hp <= enemy.hpMax * 0.5) {
    enemy.shadeUsed = true;
    enemy.shadeAbsorb = Math.round(enemy.hp * 0.2);
    enemy.shadeT = 3;
  }
  return { soaked: incoming - left, hp: enemy.hp };
}

export function orbHits(ox, oz, px, pz) {
  return Math.hypot(px - ox, pz - oz) <= ORB_RADIUS + PLAYER_HURT;
}

export function stepOrb(orb, dt, player, blocked) {
  const nx = orb.x + orb.vx * 7 * dt;
  const nz = orb.z + orb.vz * 7 * dt;
  if (blocked && blocked(nx, nz)) return { removed: true, hit: false };
  orb.x = nx;
  orb.z = nz;
  if (player && orbHits(nx, nz, player.x, player.z)) return { removed: true, hit: true };
  orb.age = (orb.age || 0) + dt;
  if (orb.age > 4) return { removed: true, hit: false };
  return { removed: false, hit: false };
}

function beginTelegraph(e, dx, dz, px, pz, dist) {
  if (e.boss) e.attack = dist <= 2.4 ? "cleave" : "ring";
  else if (e.archetype === "brute") e.attack = "arc";
  else if (e.archetype === "spitter") e.attack = "orb";
  else e.attack = "circle";
  const base = e.boss ? (e.attack === "ring" ? 0.9 : 0.6) : (e.telegraphBase || 0.45);
  e.telegraph = telegraphSeconds(base, e.boss ? null : e.eliteAffix);
  e.lockYaw = e.archetype === "brute" || (!!e.boss && e.attack === "cleave");
  e.yaw = Math.atan2(-dx, -dz);
  if (e.attack === "ring") {
    e.markX = px;
    e.markZ = pz;
  }
  e.state = "telegraph";
}

function resolveAttack(e, px, pz) {
  e.state = "approach";
  e.telegraph = 0;
  if (e.attack === "orb") {
    return { orb: { x: e.x, z: e.z, vx: px - e.x, vz: pz - e.z } };
  }
  if (e.attack === "ring") {
    const markX = e.markX != null ? e.markX : e.x;
    const markZ = e.markZ != null ? e.markZ : e.z;
    const d = Math.hypot(px - markX, pz - markZ);
    if (d >= 2 && d <= 5) return { hit: true };
    return null;
  }
  if (e.attack === "arc" || e.attack === "cleave") {
    const yaw = e.yaw || 0;
    const fwd = { x: -Math.sin(yaw), z: -Math.cos(yaw) };
    const range = e.attack === "cleave" ? 2.4 : 2.0;
    if (arcHit({ x: e.x, z: e.z }, fwd, { x: px, z: pz }, range, 35 * Math.PI / 180, PLAYER_HURT)) {
      return { hit: true, push: e.archetype === "brute" ? 1.2 : 0 };
    }
    return null;
  }
  if (Math.hypot(px - e.x, pz - e.z) <= (e.range || 1.5) + PLAYER_HURT) return { hit: true };
  return null;
}

// Idle foes stroll around their spawn: pick a point within WANDER_R, walk there at a
// fraction of their speed, rest, repeat. Each foe carries its own xorshift state, so
// wandering never touches Math.random or the run's combat RNG. Bosses hold still.
const WANDER_R = 2.6;
const WANDER_PACE = 0.32;

function wanderRoll(e) {
  let x = e.wanderSeed >>> 0;
  if (!x) x = (Math.imul((e.id | 0) + 1, 2654435761) ^ 0x5bd1e995) >>> 0 || 1;
  x ^= x << 13;
  x >>>= 0;
  x ^= x >>> 17;
  x ^= x << 5;
  x >>>= 0;
  e.wanderSeed = x;
  return x / 4294967296;
}

function wander(e, dt, world) {
  if (e.boss || e.spawnX == null || !(e.speed > 0)) return;
  if (e.wanderT == null) e.wanderT = 0.5 + wanderRoll(e) * 2.5;
  e.wanderT -= dt;
  if (!e.wanderTo) {
    if (e.wanderT > 0) return;
    const a = wanderRoll(e) * Math.PI * 2;
    const r = 0.6 + wanderRoll(e) * (WANDER_R - 0.6);
    e.wanderTo = { x: e.spawnX + Math.cos(a) * r, z: e.spawnZ + Math.sin(a) * r };
    e.wanderT = 4;
  }
  const dx = e.wanderTo.x - e.x;
  const dz = e.wanderTo.z - e.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.15 || e.wanderT <= 0) {
    e.wanderTo = null;
    e.wanderT = 1.5 + wanderRoll(e) * 3;
    return;
  }
  const step = Math.min(d, e.speed * WANDER_PACE * dt);
  const nx = e.x + (dx / d) * step;
  const nz = e.z + (dz / d) * step;
  const resolved = world.resolve ? world.resolve(nx, nz, e.hurt || 0.45, e) : { x: nx, z: nz };
  e.x = resolved.x;
  e.z = resolved.z;
  e.yaw = Math.atan2(-dx, -dz);
}

export function stepFoe(e, dt, world) {
  if (!e || !(e.hp > 0)) return null;
  if (e.stagger > 0) {
    e.stagger -= dt;
    return null;
  }
  const px = world.px;
  const pz = world.pz;
  const home = Math.hypot(e.x - e.spawnX, e.z - e.spawnZ);
  if (e.state !== "return" && home > LEASH) {
    e.state = "return";
    e.telegraph = 0;
  }
  if (e.state === "return") {
    const dx = e.spawnX - e.x;
    const dz = e.spawnZ - e.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.25) {
      e.x = e.spawnX;
      e.z = e.spawnZ;
      e.hp = e.hpMax;
      e.state = "idle";
      e.wanderTo = null;
      e.telegraph = 0;
      e.sunder = 0;
      e.shadeAbsorb = 0;
      e.shadeT = 0;
      e.shadeUsed = false;
      return { leashed: true };
    }
    const step = Math.min(dist, (e.speed || 0) * dt);
    const nx = e.x + (dx / dist) * step;
    const nz = e.z + (dz / dist) * step;
    const resolved = world.resolve ? world.resolve(nx, nz, e.hurt || 0.45, e) : { x: nx, z: nz };
    e.x = resolved.x;
    e.z = resolved.z;
    e.yaw = Math.atan2(-dx, -dz);
    return null;
  }
  const dx = px - e.x;
  const dz = pz - e.z;
  const dist = Math.hypot(dx, dz) || 0.0001;
  if (e.state === "idle") {
    const seen = dist <= AGGRO && world.los && world.los(e.x, e.z, px, pz);
    if (!seen) {
      wander(e, dt, world);
      return null;
    }
    e.wanderTo = null;
    e.state = "approach";
  }
  if (e.state === "approach") {
    const engage = e.boss ? 8 : (e.range || 1.5);
    if (dist <= engage) beginTelegraph(e, dx, dz, px, pz, dist);
    else {
      const step = (e.speed || 0) * dt;
      const nx = e.x + (dx / dist) * step;
      const nz = e.z + (dz / dist) * step;
      const resolved = world.resolve ? world.resolve(nx, nz, e.hurt || 0.45, e) : { x: nx, z: nz };
      e.x = resolved.x;
      e.z = resolved.z;
      e.yaw = Math.atan2(-dx, -dz);
    }
  }
  if (e.state === "telegraph") {
    if (!e.lockYaw) {
      const aimX = px - e.x;
      const aimZ = pz - e.z;
      if (aimX * aimX + aimZ * aimZ > 1e-6) e.yaw = Math.atan2(-aimX, -aimZ);
    }
    e.telegraph -= dt;
    if (e.telegraph > 0) return null;
    return resolveAttack(e, px, pz);
  }
  return null;
}
