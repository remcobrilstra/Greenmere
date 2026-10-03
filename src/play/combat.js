import * as THREE from "three";
import {
  arcHit,
  strikeDamage,
  incomingDamage,
  applyDamage,
  skirmisherDmg,
  strikeRange,
  strikeArcDeg,
  strikeCooldown,
  wardAbsorb,
  wardDuration,
  extractSeconds,
  mendCastSeconds,
  mendPushback,
  xpGrant,
  grantXp,
  foeProfile,
  applyFoeDamage,
  stepFoe,
  stepOrb,
  livingCount,
  PLAYER_HURT
} from "../sim/balance.js";
import { tileToWorld, CHEST_BASE } from "../sim/floorgen.js";
import { gearTotals, lootRng, rollGearDrop, killExtras, extrasRng } from "../sim/items.js";
import { buildStrikeCrescent, buildGlint, buildLootMesh } from "../view/dungeon.js";

const SKIRM_HURT = 0.45;


function edgeRank(session) {
  return session.tracks && session.tracks.edge ? session.tracks.edge : 0;
}

function delverRank(session) {
  return session.tracks && session.tracks.delver ? session.tracks.delver : 0;
}

export function attachCombat(rt) {
  const session = () => rt.session;
  function noteRunDirty() {
    const s = session();
    if (!s || !s.run || s.devRun) return;
    if (rt.markSave) rt.markSave("dungeon");
  }
  const strike = { windup: 0, recovery: 0, locked: null };
  const extract = { t: 0, hold: false, moved: 0, key: false };
  // Mend channel: started by hud.tryAbility with the apply step as `done`.
  const mend = { t: 0, total: 0, key: false, moved: 0, done: null };
  const CHEST_REACH = 2.1;
  const _fwd = new THREE.Vector3();
  const _proj = new THREE.Vector3();
  let crescentT = 0;
  const CRESCENT_LIFE = 0.16;

  const crescent = buildStrikeCrescent();
  rt.player.add(crescent);
  rt.strikeCrescent = crescent;
  rt.suspendCombat = false;
  rt.enemies = [];
  rt.strikeWindup = false;

  function derive() {
    const s = session();
    if (!s) return;
    const level = s.level || 1;
    const gear = gearTotals(s.equipped);
    s.might = 9 + level + gear.might;
    s.guard = 9 + level + gear.guard;
    s.focus = 9 + level + gear.focus;
    s.quick = gear.quick;
    s.wardweave = gear.wardweave;
    s.blade = s.equipped && s.equipped.weapon ? s.equipped.weapon : null;
    rt.vitals.hpMax = 40 + s.might * 8 + s.guard * 4 + gear.flatHp;
    rt.vitals.mpMax = 20 + s.focus * 6 + gear.flatMp;
    if (rt.vitals.hp > rt.vitals.hpMax) rt.vitals.hp = rt.vitals.hpMax;
    if (rt.vitals.mp > rt.vitals.mpMax) rt.vitals.mp = rt.vitals.mpMax;
  }

  function fillPools() {
    derive();
    rt.vitals.hp = rt.vitals.hpMax;
    rt.vitals.mp = rt.vitals.mpMax;
    if (rt.syncVitals) rt.syncVitals();
  }

  function heroForward() {
    _fwd.set(0, 0, -1).applyQuaternion(rt.player.quaternion);
    _fwd.y = 0;
    if (_fwd.lengthSq() < 1e-8) return { x: 0, z: -1 };
    _fwd.normalize();
    return { x: _fwd.x, z: _fwd.z };
  }

  function cancelExtract() {
    extract.t = 0;
    extract.hold = false;
    extract.moved = 0;
    extract.key = false;
    rt.extractKey = false;
  }

  function cancelMend() {
    mend.t = 0;
    mend.total = 0;
    mend.key = false;
    mend.moved = 0;
    mend.done = null;
  }

  // Hold 3 to mend. Moving 0.6 m, letting go, a strike, or the hearth breaks it;
  // a broken mend spends nothing. A hit pushes the cast back (mendPushback) rather
  // than breaking it. On completion `done` applies cost and heal.
  function beginMend(done) {
    const s = session();
    if (!s || rt.vitals.deathLock) return { ok: false, reason: "cooldown" };
    if (mend.t > 0) return { ok: false, reason: "channel" };
    if (extract.t > 0) cancelExtract();
    mend.t = 0.0001;
    mend.total = mendCastSeconds(s.tracks ? s.tracks.mend : 0);
    mend.key = !!rt.mendKey;
    mend.moved = 0;
    mend.done = done || null;
    return { ok: true, reason: "channel" };
  }

  function pushBackMend() {
    if (!(mend.t > 0)) return;
    const s = session();
    mend.t = Math.max(0.0001, mend.t - mendPushback(s && s.tracks ? s.tracks.mend : 0));
    rt.mendPushT = 0.35;
  }

  function releaseMend() {
    if (!mend.key) return;
    if (mend.t > 0 && mend.t < mend.total) cancelMend();
  }

  function tickMend(dt) {
    if (!(mend.t > 0)) return;
    if (rt.vitals.deathLock) {
      cancelMend();
      return;
    }
    mend.t += dt;
    if (mend.t < mend.total) return;
    const done = mend.done;
    cancelMend();
    const res = done ? done() : { ok: true };
    if (res && res.ok !== false) rt.mendBurstT = 0.55;
  }

  function cancelStrike() {
    strike.windup = 0;
    strike.recovery = 0;
    strike.locked = null;
    rt.strikeWindup = false;
    crescent.visible = false;
    crescentT = 0;
  }

  function clearCombatMotion() {
    cancelExtract();
    cancelMend();
    cancelStrike();
    const s = session();
    if (!s) return;
    s.wardAbsorb = 0;
    s.wardT = 0;
    s.sunder = null;
    s.mendHotLeft = 0;
    s.mendHotT = 0;
    s.mendHotAcc = 0;
  }

  function grantKill(enemy) {
    const s = session();
    const run = s && s.run;
    if (!run) return;
    if (rt.questEvent) rt.questEvent({ type: "kill", archetype: enemy.archetype, elite: !!enemy.eliteAffix, boss: !!enemy.boss, floor: run.floorIndex });
    const levels = grantXp(s, xpGrant(run.floorIndex, enemy));
    if (!levels) return;
    const hp = rt.vitals.hp;
    const mp = rt.vitals.mp;
    derive();
    rt.vitals.hp = Math.min(rt.vitals.hpMax, hp);
    rt.vitals.mp = Math.min(rt.vitals.mpMax, mp);
  }

  function pushPair(a, b) {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const min = (a.r || a.hurt || SKIRM_HURT) + (b.r || b.hurt || SKIRM_HURT);
    const d2 = dx * dx + dz * dz;
    if (d2 >= min * min) return;
    if (d2 <= 1e-8) {
      a.x -= min * 0.5;
      b.x += min * 0.5;
      return;
    }
    const d = Math.sqrt(d2);
    const push = (min - d) / d * 0.5;
    a.x -= dx * push;
    a.z -= dz * push;
    b.x += dx * push;
    b.z += dz * push;
  }

  function separateSkirmishers(list) {
    const living = [];
    for (let i = 0; i < list.length; i++) if (list[i].hp > 0) living.push(list[i]);
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 0; i < living.length; i++) {
        for (let j = i + 1; j < living.length; j++) pushPair(living[i], living[j]);
      }
    }
    return living;
  }

  function pushTiles(x, z, radius) {
    const plan = rt.plan;
    if (!plan) return { x, z };
    const cols = plan.cols;
    const rows = plan.rows;
    const tiles = plan.tiles;
    const cc = Math.round(x / 4 + (cols - 1) / 2);
    const rr = Math.round(z / 4 + (rows - 1) / 2);
    for (let r = rr - 1; r <= rr + 1; r++) {
      for (let c = cc - 1; c <= cc + 1; c++) {
        const outside = r < 0 || c < 0 || r >= rows || c >= cols;
        const solid = outside || tiles[r * cols + c] !== 1;
        if (!solid) continue;
        const cx = (c - (cols - 1) / 2) * 4;
        const cz = (r - (rows - 1) / 2) * 4;
        const hx = 2;
        const hz = 2;
        const closestX = Math.max(cx - hx, Math.min(x, cx + hx));
        const closestZ = Math.max(cz - hz, Math.min(z, cz + hz));
        let dx = x - closestX;
        let dz = z - closestZ;
        const d2 = dx * dx + dz * dz;
        if (d2 >= radius * radius) continue;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          const push = (radius - d) / d;
          x += dx * push;
          z += dz * push;
        } else {
          const penX = hx - Math.abs(x - cx);
          const penZ = hz - Math.abs(z - cz);
          if (penX < penZ) x += (x < cx ? -1 : 1) * (penX + radius);
          else z += (z < cz ? -1 : 1) * (penZ + radius);
        }
      }
    }
    return { x, z };
  }

  function pushStaticCircles(x, z, radius, extras) {
    for (let i = 0; i < extras.length; i++) {
      const c = extras[i];
      const dx = x - c.x;
      const dz = z - c.z;
      const min = radius + c.r;
      const d2 = dx * dx + dz * dz;
      if (d2 >= min * min || d2 <= 1e-8) continue;
      const d = Math.sqrt(d2);
      const push = (min - d) / d;
      x += dx * push;
      z += dz * push;
    }
    return { x, z };
  }

  function resolveDungeon(x, z, radius, skip) {
    const props = (rt.dungeonRoot && rt.dungeonRoot.userData.propColliders) || [];
    const circles = [];
    for (let i = 0; i < props.length; i++) circles.push(props[i]);
    const enemies = rt.enemies || [];
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (e === skip || e.hp <= 0) continue;
      circles.push({ x: e.x, z: e.z, r: e.hurt || SKIRM_HURT });
    }
    if (skip !== "hero") circles.push({ x: rt.player.position.x, z: rt.player.position.z, r: PLAYER_HURT });
    for (let pass = 0; pass < 3; pass++) {
      const tiled = pushTiles(x, z, radius);
      x = tiled.x;
      z = tiled.z;
      const circled = pushStaticCircles(x, z, radius, circles);
      x = circled.x;
      z = circled.z;
    }
    return { x, z };
  }

  function cellOf(x, z) {
    const plan = rt.plan;
    return {
      c: Math.round(x / 4 + (plan.cols - 1) / 2),
      r: Math.round(z / 4 + (plan.rows - 1) / 2)
    };
  }

  function traceClear(x0, z0, x1, z1) {
    const plan = rt.plan;
    if (!plan) return false;
    const a = cellOf(x0, z0);
    const b = cellOf(x1, z1);
    let c = a.c;
    let r = a.r;
    const dc = Math.abs(b.c - a.c);
    const dr = Math.abs(b.r - a.r);
    const sc = a.c < b.c ? 1 : -1;
    const sr = a.r < b.r ? 1 : -1;
    let err = dc - dr;
    for (;;) {
      if (c < 0 || r < 0 || c >= plan.cols || r >= plan.rows) return false;
      if (plan.tiles[r * plan.cols + c] !== 1) return false;
      if (c === b.c && r === b.r) return true;
      const e2 = 2 * err;
      if (e2 > -dr) {
        err -= dr;
        c += sc;
      }
      if (e2 < dc) {
        err += dc;
        r += sr;
      }
    }
  }

  // One Bresenham pass can clip a corner in only one direction. Both must be open.
  function losClear(x0, z0, x1, z1) {
    return traceClear(x0, z0, x1, z1) && traceClear(x1, z1, x0, z0);
  }

  function savedHp(saved, id) {
    if (!saved) return null;
    if (saved[id] != null) return saved[id];
    const key = String(id);
    if (saved[key] != null) return saved[key];
    return null;
  }

  function armSkirmishers(actors, run) {
    const floorIndex = run ? run.floorIndex : 1;
    const killed = run && run.killed ? run.killed : [];
    const saved = run && run.enemyHp ? run.enemyHp : {};
    if (rt.orbs) rt.orbs.length = 0;
    const living = [];
    for (let i = 0; i < actors.length; i++) {
      const e = actors[i];
      const profile = foeProfile(floorIndex, e.archetype, e.eliteAffix, e.boss);
      e.hpMax = profile.hp;
      e.hurt = profile.hurt;
      e.speed = profile.speed;
      e.range = profile.range;
      e.dmg = profile.dmg;
      e.telegraphBase = profile.telegraph;
      e.state = "idle";
      e.telegraph = 0;
      e.attack = null;
      e.lockYaw = false;
      e.shadeAbsorb = 0;
      e.shadeT = 0;
      e.shadeUsed = false;
      e.wardAbsorb = 0;
      e.wardBroken = false;
      e.summoned60 = false;
      e.summoned30 = false;
      const dead = killed.indexOf(e.id) >= 0 || killed.indexOf(Number(e.id)) >= 0;
      if (dead) {
        e.hp = 0;
        spawnKillLoot(e, run);
        continue;
      }
      const hp = savedHp(saved, e.id);
      e.hp = hp != null ? hp : e.hpMax;
      if (e.eliteAffix === "warding") {
        e.wardAbsorb = Math.round(e.hpMax * 0.15);
        e.wardMax = e.wardAbsorb;
      }
      if (e.archetype === "shade" && e.hp <= e.hpMax * 0.5) e.shadeUsed = true;
      if (e.boss && e.hpMax > 0 && e.hp <= e.hpMax * 0.6) e.summoned60 = true;
      if (e.boss && e.hpMax > 0 && e.hp <= e.hpMax * 0.3) e.summoned30 = true;
      living.push(e);
    }
    rt.enemies = actors;
    restoreChests(run);
    return living;
  }

  function stampFoe(floorIndex, spec) {
    const profile = foeProfile(floorIndex, spec.archetype, spec.eliteAffix, spec.boss);
    return {
      id: spec.id,
      archetype: spec.archetype || "skirmisher",
      eliteAffix: spec.eliteAffix || null,
      boss: !!spec.boss,
      summon: !!spec.summon,
      x: spec.x,
      z: spec.z,
      spawnX: spec.x,
      spawnZ: spec.z,
      yaw: spec.yaw || 0,
      slot: spec.slot,
      hp: profile.hp,
      hpMax: profile.hp,
      hurt: profile.hurt,
      speed: profile.speed,
      range: profile.range,
      dmg: profile.dmg,
      telegraphBase: profile.telegraph,
      state: "idle",
      telegraph: 0,
      attack: null,
      lockYaw: false,
      shadeAbsorb: 0,
      shadeT: 0,
      shadeUsed: false,
      wardAbsorb: 0,
      wardBroken: false,
      summoned60: false,
      summoned30: false
    };
  }

  function resolveStrikeAt(origin, forward, targets) {
    const s = session();
    const edge = edgeRank(s);
    const range = strikeRange(edge);
    const half = (strikeArcDeg(edge) / 2) * Math.PI / 180;
    const hits = [];
    const list = targets || rt.enemies || [];
    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      if (!t || t.hp <= 0) continue;
      const hurt = t.hurt != null ? t.hurt : SKIRM_HURT;
      if (!arcHit(origin, forward, t, range, half, hurt)) continue;
      hits.push({ t, dist: Math.hypot(t.x - origin.x, t.z - origin.z) });
    }
    hits.sort((a, b) => a.dist - b.dist);
    const dmg = applyOil(s, strikeDamage(
      { level: s.level, might: s.might, tracks: s.tracks },
      s.blade
    ));
    const applied = [];
    for (let i = 0; i < hits.length && i < 5; i++) {
      const t = hits[i].t;
      let dealt = dmg;
      if (t.sunder > 0) dealt = Math.round(dmg * 1.08);
      applyFoeDamage(t, dealt);
      if (edge >= 5) t.sunder = 5;
      applied.push(t);
      if (rt.pushFloater) rt.pushFloater(String(dealt), t.x, 1.45, t.z, "#f4e7c8");
      if (t.eliteAffix === "thick" && dealt > 0) {
        const raw = Math.round(dealt * 0.1);
        if (raw > 0) applyIncoming(raw);
      }
      if (t.boss) checkBossSummons(t);
      if (t.hp === 0 && !t.killed) {
        t.killed = true;
        t.state = "dead";
        t.telegraph = 0;
        if (s.run) {
          if (s.run.killed.indexOf(t.id) < 0) s.run.killed.push(t.id);
          if (s.run.enemyHp) delete s.run.enemyHp[t.id];
          if (t.summon && Array.isArray(s.run.summons)) {
            s.run.summons = s.run.summons.filter((entry) => entry && entry.id !== t.id);
          }
          noteRunDirty();
        }
        if (t.spawnX != null || t.spawnZ != null) spawnKillLoot(t, s.run, true);
        grantKill(t);
      } else if (s.run && s.run.enemyHp && t.id != null) {
        s.run.enemyHp[t.id] = t.hp;
        noteRunDirty();
      }
    }
    s.outOfCombat = 0;
    return { damage: dmg, hit: applied, considered: hits.length };
  }

  function applyOil(s, dmg) {
    if (!s) return dmg;
    const pack = Array.isArray(s.pack) ? s.pack : null;
    let index = -1;
    if (pack) {
      for (let i = 0; i < pack.length; i++) {
        const it = pack[i];
        if (it && it.kind === "consumable" && it.consumableId === "oil" && Math.floor(Number(it.charges) || 0) > 0) {
          index = i;
          break;
        }
      }
    }
    const run = s.run;
    const left = run ? Math.floor(Number(run.oilLeft) || 0) : 0;
    if (index < 0 && !(left > 0)) return dmg;
    if (index >= 0) {
      const it = pack[index];
      it.charges = Math.floor(Number(it.charges) || 0) - 1;
      if (run) run.oilLeft = it.charges > 0 ? it.charges : 0;
      if (it.charges <= 0) pack.splice(index, 1);
    } else if (run) {
      run.oilLeft = left - 1;
    }
    return Math.round(dmg * 1.15);
  }

  function beginStrike() {
    const s = session();
    if (!s || rt.space !== "dungeon") return { ok: false, reason: "missing" };
    if (rt.vitals.deathLock) return { ok: false, reason: "cooldown" };
    if (rt.cdLeft[0] > 0 || strike.recovery > 0 || strike.windup > 0) {
      if (rt.say) rt.say("Strike is not ready.");
      return { ok: false, reason: "cooldown" };
    }
    cancelMend();
    const fwd = heroForward();
    strike.locked = { x: fwd.x, z: fwd.z };
    strike.windup = 0.18;
    rt.strikeWindup = true;
    rt.cdLeft[0] = strikeCooldown(edgeRank(s));
    if (rt.syncCooldowns) rt.syncCooldowns();
    return { ok: true };
  }

  function beginExtract() {
    if (rt.space !== "dungeon" || !session() || !session().run) return { ok: false, reason: "missing" };
    if (rt.vitals.deathLock) return { ok: false, reason: "cooldown" };
    cancelMend();
    extract.hold = true;
    extract.key = !!rt.extractKey;
    if (extract.t <= 0) {
      extract.t = 0.0001;
      extract.moved = 0;
      if (rt.say) rt.say("The hearth pulls…");
    }
    return { ok: true, reason: "channel" };
  }

  function releaseExtract() {
    if (!extract.key) return;
    extract.hold = false;
    extract.key = false;
    if (extract.t > 0 && extract.t < extractSeconds(delverRank(session()))) cancelExtract();
  }

  function noteExtractMove(dist) {
    if (mend.t > 0 && dist > 0) {
      mend.moved += dist;
      if (mend.moved >= 0.6) cancelMend();
    }
    if (extract.t <= 0 || !(dist > 0)) return;
    extract.moved += dist;
    if (extract.moved >= 1) cancelExtract();
  }

  function guardFirstHit(loss) {
    const s = session();
    const run = s && s.run;
    if (!(loss > 0) || !s || !run || delverRank(s) < 5 || run.floorGuard) return loss;
    run.floorGuard = true;
    return Math.max(1, Math.round(loss * 0.5));
  }

  function hurtHero(hpLoss) {
    const loss = guardFirstHit(hpLoss);
    cancelExtract();
    if (loss > 0) pushBackMend();
    const s = session();
    if (s) s.outOfCombat = 0;
    applyDamage(rt.vitals, loss);
    if (loss > 0 && rt.heroHurtFx) rt.heroHurtFx(loss);
    if (rt.syncVitals) rt.syncVitals();
    noteRunDirty();
  }

  function applyIncoming(raw) {
    const s = session();
    const run = s && s.run;
    if (!s || !run || rt.vitals.deathLock) return 0;
    const dealt = incomingDamage(raw, s.guard, {
      absorb: s.wardAbsorb || 0,
      bulwarkRank: s.tracks.bulwark || 0
    });
    s.wardAbsorb = dealt.wardLeft;
    const loss = guardFirstHit(dealt.hpLoss);
    cancelExtract();
    if (loss > 0) pushBackMend();
    s.outOfCombat = 0;
    applyDamage(rt.vitals, loss);
    noteRunDirty();
    if (loss > 0 && rt.heroHurtFx) rt.heroHurtFx(loss);
    if (rt.pushFloater) {
      rt.pushFloater(String(loss), rt.player.position.x, 1.6, rt.player.position.z, "#b64034");
    }
    if (rt.syncVitals) rt.syncVitals();
    return loss;
  }

  function enemyHit(enemy) {
    const s = session();
    const run = s && s.run;
    if (!run || rt.vitals.deathLock) return;
    const raw = enemy && enemy.dmg != null ? enemy.dmg : Math.round(skirmisherDmg(run.floorIndex));
    applyIncoming(raw);
  }

  function grantWard() {
    const s = session();
    if (!s) return;
    const rank = s.tracks.bulwark || 0;
    const weave = 1 + (s.wardweave || 0) / 100;
    s.wardAbsorb = wardAbsorb(s.guard, rank, weave);
    s.wardT = wardDuration(rank);
    if (rank >= 5) {
      const enemies = rt.enemies || [];
      const px = rt.player.position.x;
      const pz = rt.player.position.z;
      for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        if (!e || e.hp <= 0) continue;
        if (Math.hypot(e.x - px, e.z - pz) <= 2.4) e.stagger = 0.35;
      }
    }
  }

  function regen(dt) {
    const s = session();
    if (!s) return;
    const base = 1.5 + (s.focus || 10) * 0.05;
    let rate = base * 3;
    if (rt.space === "dungeon") {
      s.outOfCombat = (s.outOfCombat || 0) + dt;
      rate = s.outOfCombat >= 4 ? base * 3 : base;
    }
    rt.vitals.mp = Math.min(rt.vitals.mpMax, rt.vitals.mp + rate * dt);
  }

  function foeWorld() {
    return {
      px: rt.player.position.x,
      pz: rt.player.position.z,
      los: losClear,
      resolve: (x, z, radius, self) => resolveDungeon(x, z, radius, self)
    };
  }

  function stepEnemy(e, dt) {
    const s = session();
    const result = stepFoe(e, dt, foeWorld());
    if (!result) return;
    if (result.leashed) {
      if (s && s.run && s.run.enemyHp) s.run.enemyHp[e.id] = e.hp;
      noteRunDirty();
      return;
    }
    if (result.orb) launchOrb(e, result.orb);
    if (result.hit) {
      enemyHit(e);
      if (result.push) pushPlayer(e, result.push);
    }
  }

  function pushPlayer(from, dist) {
    const px = rt.player.position.x;
    const pz = rt.player.position.z;
    let dx = px - from.x;
    let dz = pz - from.z;
    const d = Math.hypot(dx, dz) || 1;
    const resolved = resolveDungeon(px + (dx / d) * dist, pz + (dz / d) * dist, PLAYER_HURT, "hero");
    rt.player.position.x = resolved.x;
    rt.player.position.z = resolved.z;
  }

  function cellBlocked(x, z) {
    const plan = rt.plan;
    if (!plan) return true;
    const c = Math.round(x / 4 + (plan.cols - 1) / 2);
    const r = Math.round(z / 4 + (plan.rows - 1) / 2);
    if (r < 0 || c < 0 || r >= plan.rows || c >= plan.cols) return true;
    return plan.tiles[r * plan.cols + c] !== 1;
  }

  function launchOrb(enemy, spec) {
    const mesh = rt.dungeonRoot && rt.dungeonRoot.userData.orbMesh;
    if (!mesh || !rt.orbs) return;
    if (rt.orbs.length >= mesh.count) return;
    const dx = spec.vx || 0;
    const dz = spec.vz || 0;
    const d = Math.hypot(dx, dz) || 1;
    rt.orbs.push({
      x: spec.x,
      z: spec.z,
      vx: dx / d,
      vz: dz / d,
      age: 0,
      dmg: enemy.dmg
    });
  }

  function stepOrbs(dt) {
    const orbs = rt.orbs;
    if (!orbs || rt.space !== "dungeon") return;
    const player = { x: rt.player.position.x, z: rt.player.position.z };
    for (let i = orbs.length - 1; i >= 0; i--) {
      const orb = orbs[i];
      const res = stepOrb(orb, dt, player, cellBlocked);
      if (res.hit) enemyHit({ dmg: orb.dmg });
      if (res.removed) orbs.splice(i, 1);
    }
  }

  function nextSummonId(run) {
    let n = 1000;
    const summons = run.summons || [];
    for (let i = 0; i < summons.length; i++) {
      if (summons[i] && summons[i].id >= n) n = summons[i].id + 1;
    }
    const killed = run.killed || [];
    for (let i = 0; i < killed.length; i++) {
      if (killed[i] >= 1000 && killed[i] + 1 > n) n = killed[i] + 1;
    }
    return n;
  }

  function neighborSpots(plan, boss) {
    const c0 = Math.round(boss.x / 4 + (plan.cols - 1) / 2);
    const r0 = Math.round(boss.z / 4 + (plan.rows - 1) / 2);
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const spots = [];
    for (let i = 0; i < dirs.length; i++) {
      const c = c0 + dirs[i][0];
      const r = r0 + dirs[i][1];
      if (c < 0 || r < 0 || c >= plan.cols || r >= plan.rows) continue;
      if (plan.tiles[r * plan.cols + c] !== 1) continue;
      const w = tileToWorld(c, r, plan.cols, plan.rows);
      let busy = false;
      const list = rt.enemies || [];
      for (let k = 0; k < list.length; k++) {
        const e = list[k];
        if (!e || e.hp <= 0) continue;
        if (Math.hypot(e.x - w.x, e.z - w.z) < 1.2) busy = true;
      }
      if (!busy) spots.push(w);
    }
    return spots;
  }

  function spawnBossWave(boss) {
    const s = session();
    const run = s && s.run;
    const plan = rt.plan;
    const claim = rt.dungeonRoot && rt.dungeonRoot.userData.claimSlot;
    if (!boss || !run || !plan || !claim) return 0;
    if (!run.summons) run.summons = [];
    if (!run.enemyHp) run.enemyHp = {};
    const spots = neighborSpots(plan, boss);
    let spawned = 0;
    for (let i = 0; i < spots.length && spawned < 2; i++) {
      if (livingCount(rt.enemies) >= 36) break;
      const slot = claim("skirmisher");
      if (slot < 0) break;
      const foe = stampFoe(run.floorIndex, {
        id: nextSummonId(run),
        archetype: "skirmisher",
        x: spots[i].x,
        z: spots[i].z,
        slot,
        summon: true
      });
      rt.enemies.push(foe);
      run.summons.push({ id: foe.id, archetype: "skirmisher", x: foe.x, z: foe.z, hp: foe.hp });
      run.enemyHp[foe.id] = foe.hp;
      spawned++;
    }
    if (spawned) noteRunDirty();
    return spawned;
  }

  function checkBossSummons(boss) {
    if (!boss || !boss.boss || !(boss.hp > 0) || !(boss.hpMax > 0)) return 0;
    const ratio = boss.hp / boss.hpMax;
    let n = 0;
    if (!boss.summoned60 && ratio <= 0.6) {
      boss.summoned60 = true;
      n += spawnBossWave(boss);
    }
    if (!boss.summoned30 && ratio <= 0.3) {
      boss.summoned30 = true;
      n += spawnBossWave(boss);
    }
    return n;
  }

  function rehydrateSummons(run) {
    if (!run || !Array.isArray(run.summons)) return;
    const claim = rt.dungeonRoot && rt.dungeonRoot.userData.claimSlot;
    const killed = run.killed || [];
    for (let i = 0; i < run.summons.length; i++) {
      const src = run.summons[i];
      if (!src || killed.indexOf(src.id) >= 0) continue;
      if (livingCount(rt.enemies) >= 36) break;
      const slot = claim ? claim("skirmisher") : -1;
      if (slot < 0) break;
      const foe = stampFoe(run.floorIndex, {
        id: src.id,
        archetype: src.archetype || "skirmisher",
        x: src.x,
        z: src.z,
        slot,
        summon: true
      });
      const hp = savedHp(run.enemyHp, src.id);
      foe.hp = hp != null ? hp : (src.hp > 0 ? src.hp : foe.hpMax);
      rt.enemies.push(foe);
    }
  }

  function tickMendHot(dt) {
    const s = session();
    if (!s || !(s.mendHotLeft > 0)) return;
    const step = dt > 0 ? dt : 0;
    s.mendHotT = (s.mendHotT || 0) - step;
    s.mendHotAcc = (s.mendHotAcc || 0) + 2 * step;
    let whole = Math.floor(s.mendHotAcc + 1e-9);
    if (s.mendHotT <= 0) whole = s.mendHotLeft;
    if (whole > s.mendHotLeft) whole = s.mendHotLeft;
    if (whole > 0) {
      s.mendHotAcc -= whole;
      if (s.mendHotAcc < 0) s.mendHotAcc = 0;
      s.mendHotLeft -= whole;
      rt.vitals.hp = Math.min(rt.vitals.hpMax, rt.vitals.hp + whole);
    }
    if (s.mendHotLeft <= 0 || s.mendHotT <= 0) {
      s.mendHotLeft = 0;
      s.mendHotT = 0;
      s.mendHotAcc = 0;
    }
  }

  function tickCombat(dt) {
    const s = session();
    if (s && s.wardT > 0) {
      s.wardT -= dt;
      if (s.wardT <= 0) {
        s.wardT = 0;
        s.wardAbsorb = 0;
      }
    }
    if (rt.vitals.deathLock && rt.space === "dungeon") {
      rt.vitals.deathLockT -= dt;
      if (rt.vitals.deathLockT <= 0) {
        rt.vitals.deathLock = false;
        rt.vitals.deathLockT = 0;
        if (rt.arriveTown) rt.arriveTown("death");
        return;
      }
    }
    if (strike.windup > 0) {
      strike.windup -= dt;
      if (strike.windup <= 0) {
        strike.windup = 0;
        rt.strikeWindup = false;
        strike.recovery = 0.28;
        crescent.visible = true;
        crescentT = CRESCENT_LIFE;
        if (strike.locked && rt.space === "dungeon") {
          resolveStrikeAt(
            { x: rt.player.position.x, z: rt.player.position.z },
            strike.locked,
            rt.enemies
          );
        }
        strike.locked = null;
      }
    } else if (strike.recovery > 0) {
      strike.recovery = Math.max(0, strike.recovery - dt);
    }
    rt.strikeWindup = strike.windup > 0;
    if (crescentT > 0) {
      crescentT -= dt;
      if (crescentT <= 0) crescent.visible = false;
    }
    if (extract.t > 0 && extract.hold && rt.space === "dungeon" && !rt.vitals.deathLock) {
      if (extract.moved >= 1) cancelExtract();
      else {
        extract.t += dt;
        if (extract.t >= extractSeconds(delverRank(s))) {
          cancelExtract();
          if (rt.arriveTown) rt.arriveTown("extract");
          return;
        }
      }
    }
    tickMend(dt);
    stepDropFlights(dt);
    stepChests(dt);
    regen(dt);
    tickMendHot(dt);
    if (rt.space !== "dungeon" || rt.suspendCombat || rt.vitals.deathLock) {
      if (rt.dungeonRoot && rt.dungeonRoot.userData.syncActors) {
        rt.dungeonRoot.userData.syncActors(rt.enemies);
      }
      return;
    }
    const enemies = rt.enemies || [];
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (e.sunder > 0) e.sunder = Math.max(0, e.sunder - dt);
      if (e.shadeT > 0) {
        e.shadeT = Math.max(0, e.shadeT - dt);
        if (e.shadeT === 0) e.shadeAbsorb = 0;
      }
      if (e.hp > 0) stepEnemy(e, dt);
    }
    stepOrbs(dt);
    separateSkirmishers(enemies);
    if (rt.dungeonRoot && rt.dungeonRoot.userData.syncActors) {
      rt.dungeonRoot.userData.syncActors(rt.enemies);
    }
  }

  rt.projectWorld = function (x, y, z) {
    _proj.set(x, y, z).project(rt.camera);
    return {
      x: (_proj.x * 0.5 + 0.5) * window.innerWidth,
      y: (-_proj.y * 0.5 + 0.5) * window.innerHeight,
      behind: _proj.z > 1
    };
  };

  function releaseDropMesh(drop) {
    const mesh = drop && drop.mesh;
    if (!mesh) return;
    if (mesh.parent) mesh.parent.remove(mesh);
    // A gear glint carries its beam and ring as children.
    mesh.traverse((o) => {
      if (o.geometry && o.geometry.dispose) o.geometry.dispose();
      if (o.material && o.material.dispose) o.material.dispose();
    });
    drop.mesh = null;
  }

  // ---- Loot burst ----
  // A kill throws its drops out of the body: each flies a short arc to its own spot
  // 1-1.7 m away, bounces once, and settles. The spot comes from the drop id, so the
  // same kill always scatters the same way. Airborne drops cannot be picked up.
  const BURST_TIME = 0.62;
  function idHash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
    return (h >>> 0) / 4294967296;
  }
  function spotClear(x, z) {
    if (rt.space !== "dungeon" || !rt.plan) return true;
    const m = 0.3;
    if (cellBlocked(x - m, z - m) || cellBlocked(x + m, z - m) || cellBlocked(x - m, z + m) || cellBlocked(x + m, z + m)) return false;
    const props = (rt.dungeonRoot && rt.dungeonRoot.userData.propColliders) || [];
    for (let i = 0; i < props.length; i++) {
      const p = props[i];
      if (Math.hypot(p.x - x, p.z - z) < p.r + 0.25) return false;
    }
    return true;
  }
  // Ordinal 0 is gear, 1 gold, 2 material: three directions about 120 degrees apart.
  function landingSpot(ox, oz, uid, ordinal) {
    const kill = uid.slice(0, uid.lastIndexOf("-"));
    const a = idHash(kill) * Math.PI * 2 + ordinal * 2.1 + (idHash(uid) - 0.5) * 0.6;
    const r = 1.0 + idHash(uid + "r") * 0.7;
    for (let k = 0; k < 6; k++) {
      const ang = a + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.9;
      const rr = k < 3 ? r : r * 0.6;
      const x = ox + Math.cos(ang) * rr;
      const z = oz + Math.sin(ang) * rr;
      if (spotClear(x, z)) return { x, z };
    }
    return { x: ox, z: oz };
  }
  function launch(drop, ox, oz, restY) {
    drop.restY = restY;
    if (ox == null) {
      drop.mesh.position.set(drop.x, restY, drop.z);
      return;
    }
    drop.fly = { t: 0, x0: ox, z0: oz, spin: (idHash(String(drop.uid)) - 0.5) * 14 };
    drop.mesh.position.set(ox, 0.9, oz);
  }
  function stepDropFlights(dt) {
    const drops = rt.groundDrops;
    if (!drops) return;
    for (let i = 0; i < drops.length; i++) {
      const d = drops[i];
      if (!d || !d.fly || !d.mesh) continue;
      const f = d.fly;
      f.t += dt;
      const u = Math.min(1, f.t / BURST_TIME);
      // Main arc covers 85% of the way; a small hop covers the rest.
      let reach;
      let lift;
      if (u < 0.78) {
        const v = u / 0.78;
        reach = v * 0.85;
        lift = 0.9 * (1 - v) + 1.25 * 4 * v * (1 - v);
      } else {
        const v = (u - 0.78) / 0.22;
        reach = 0.85 + v * 0.15;
        lift = 0.28 * 4 * v * (1 - v);
      }
      d.mesh.position.set(f.x0 + (d.x - f.x0) * reach, d.restY + lift, f.z0 + (d.z - f.z0) * reach);
      d.mesh.rotation.y += f.spin * dt * (1 - u);
      if (u >= 1) {
        d.mesh.position.set(d.x, d.restY, d.z);
        d.fly = null;
      }
    }
  }

  function placeGearDrop(item, x, z, fromX, fromZ) {
    if (!item) return null;
    const drop = { kind: "gear", uid: item.uid, item, x, z };
    drop.mesh = buildGlint(item.rarity);
    launch(drop, fromX, fromZ, 0.46);
    const parent = rt.dungeonRoot || rt.scene;
    if (parent) parent.add(drop.mesh);
    if (!rt.groundDrops) rt.groundDrops = [];
    rt.groundDrops.push(drop);
    return drop;
  }

  // Gold and theme materials per kill (uids "-1" and "-2"; gear stays "-0").
  function placeLootDrop(drop, fromX, fromZ) {
    drop.mesh = buildLootMesh(drop.kind, drop.material);
    launch(drop, fromX, fromZ, drop.kind === "gold" ? 0.08 : 0.16);
    const parent = rt.dungeonRoot || rt.scene;
    parent.add(drop.mesh);
    if (!rt.groundDrops) rt.groundDrops = [];
    rt.groundDrops.push(drop);
    return drop;
  }
  function spawnKillExtras(enemy, run, kind, burst) {
    const picked = run.picked || [];
    const drops = rt.groundDrops || [];
    const base = "drop-" + run.floorIndex + "-" + enemy.id + "-";
    const s = session();
    const extra = killExtras(extrasRng(run.runSeed, run.floorIndex, enemy.id), {
      floorIndex: run.floorIndex,
      kind,
      delver: s && s.tracks ? s.tracks.delver : 0
    });
    const x = enemy.x;
    const z = enemy.z;
    const fromX = burst ? x : null;
    const exists = (uid) => picked.indexOf(uid) >= 0 || drops.some((d) => d && d.uid === uid);
    if (extra.gold > 0 && !exists(base + "1")) {
      const at = landingSpot(x, z, base + "1", 1);
      placeLootDrop({ kind: "gold", uid: base + "1", amount: extra.gold, x: at.x, z: at.z }, fromX, z);
    }
    if (extra.material && !exists(base + "2")) {
      const at = landingSpot(x, z, base + "2", 2);
      placeLootDrop({ kind: "material", uid: base + "2", material: extra.material.key, amount: extra.material.count, x: at.x, z: at.z }, fromX, z);
    }
  }

  // ---- Treasure chests ----
  // F next to a shut chest throws the lid open and bursts its loot: one forced gear
  // roll at elite quality, plus elite gold and the 40% material. The open chest is
  // recorded in run.killed as CHEST_BASE + id, so a resumed floor shows it open and
  // lays out whatever was not picked up.
  function floorChests() {
    return (rt.dungeonRoot && rt.dungeonRoot.userData.chests) || [];
  }
  function chestNear() {
    if (rt.space !== "dungeon") return null;
    const p = rt.player.position;
    let best = null;
    let bestD = CHEST_REACH;
    for (const c of floorChests()) {
      if (c.opened) continue;
      const d = Math.hypot(p.x - c.x, p.z - c.z);
      if (d <= bestD) {
        bestD = d;
        best = c;
      }
    }
    return best;
  }
  function chestLoot(c, run, burst) {
    const sid = CHEST_BASE + c.id;
    const picked = run.picked || [];
    const drops = rt.groundDrops || [];
    const exists = (uid) => picked.indexOf(uid) >= 0 || drops.some((d) => d && d.uid === uid);
    const base = "drop-" + run.floorIndex + "-" + sid + "-";
    // Loot leaves through the open front (local −z), so aim the burst a step out.
    const yaw = c.group ? c.group.rotation.y : 0;
    const ox = c.x - Math.sin(yaw) * 0.9;
    const oz = c.z - Math.cos(yaw) * 0.9;
    const s = session();
    const extra = killExtras(extrasRng(run.runSeed, run.floorIndex, sid), {
      floorIndex: run.floorIndex,
      kind: "elite",
      delver: s && s.tracks ? s.tracks.delver : 0
    });
    if (extra.gold > 0 && !exists(base + "1")) {
      const at = landingSpot(ox, oz, base + "1", 1);
      placeLootDrop({ kind: "gold", uid: base + "1", amount: extra.gold, x: at.x, z: at.z }, burst ? c.x : null, c.z);
    }
    if (extra.material && !exists(base + "2")) {
      const at = landingSpot(ox, oz, base + "2", 2);
      placeLootDrop({ kind: "material", uid: base + "2", material: extra.material.key, amount: extra.material.count, x: at.x, z: at.z }, burst ? c.x : null, c.z);
    }
    if (!exists(base + "0")) {
      const item = rollGearDrop(lootRng(run.runSeed, run.floorIndex, sid), {
        floorIndex: run.floorIndex,
        spawnId: sid,
        kind: "elite",
        ordinal: 0,
        force: true
      });
      if (item) {
        const at = landingSpot(ox, oz, base + "0", 0);
        if (burst) placeGearDrop(item, at.x, at.z, c.x, c.z);
        else placeGearDrop(item, at.x, at.z);
      }
    }
  }
  function openChest(c) {
    const s = session();
    const run = s && s.run;
    if (!c || c.opened || !run) return false;
    c.opened = true;
    c.openT = 0;
    if (!Array.isArray(run.killed)) run.killed = [];
    if (run.killed.indexOf(CHEST_BASE + c.id) < 0) run.killed.push(CHEST_BASE + c.id);
    noteRunDirty();
    chestLoot(c, run, true);
    if (rt.say) rt.say("The chest gives up its hoard.");
    if (rt.questEvent) rt.questEvent({ type: "chest", floor: run.floorIndex });
    return true;
  }
  function tryOpenChest() {
    return openChest(chestNear());
  }
  function restoreChests(run) {
    const killed = (run && run.killed) || [];
    for (const c of floorChests()) {
      if (killed.indexOf(CHEST_BASE + c.id) < 0) continue;
      c.opened = true;
      c.openT = 1;
      chestLoot(c, run, false);
    }
  }
  // Lid swings open with a small overshoot; the gem fades, the hoard glows.
  function stepChests(dt) {
    const list = floorChests();
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (!c.opened) {
        if (c.gem) {
          c.gem.rotation.y += dt * 2;
          c.gem.position.y = 1.25 + Math.sin(performance.now() / 400 + i) * 0.06;
        }
        continue;
      }
      if (c.openT == null) c.openT = 0;
      c.openT = Math.min(1, c.openT + dt / 0.45);
      const u = c.openT;
      const swing = u < 1 ? 1.95 * (1 - Math.pow(1 - u, 3)) + Math.sin(u * Math.PI) * 0.25 : 1.95;
      if (c.lid) c.lid.rotation.x = swing;
      if (c.gem) c.gem.visible = false;
      if (c.hoard) c.hoard.visible = true;
    }
  }

  // Live kills burst from where the foe fell; a resumed floor lays the same drops
  // out around the spawn point (where resume stands the dead), already settled.
  function spawnKillLoot(enemy, run, burst) {
    if (!enemy || enemy.id == null || !run) return null;
    const uid = "drop-" + run.floorIndex + "-" + enemy.id + "-0";
    const picked = run.picked || [];
    if (picked.indexOf(uid) >= 0) return null;
    const drops = rt.groundDrops || [];
    for (let i = 0; i < drops.length; i++) {
      if (drops[i] && drops[i].uid === uid) return drops[i];
    }
    const kind = enemy.boss ? "boss" : enemy.eliteAffix ? "elite" : "normal";
    spawnKillExtras(enemy, run, kind, burst);
    const item = rollGearDrop(lootRng(run.runSeed, run.floorIndex, enemy.id), {
      floorIndex: run.floorIndex,
      spawnId: enemy.id,
      kind,
      ordinal: 0
    });
    if (!item) return null;
    const at = landingSpot(enemy.x, enemy.z, uid, 0);
    return burst ? placeGearDrop(item, at.x, at.z, enemy.x, enemy.z) : placeGearDrop(item, at.x, at.z);
  }

  rt.derivePools = derive;
  rt.fillPools = fillPools;
  rt.placeGearDrop = placeGearDrop;
  rt.releaseDropMesh = releaseDropMesh;
  rt.beginMend = beginMend;
  rt.releaseMend = releaseMend;
  rt.cancelMend = cancelMend;
  rt.chestNear = chestNear;
  rt.tryOpenChest = tryOpenChest;
  // The cast in progress, for the cast bar and the pose layer.
  rt.castInfo = function () {
    if (mend.t > 0) return { kind: "mend", name: "Mend", t: mend.t, total: mend.total };
    if (extract.t > 0 && rt.space === "dungeon") return { kind: "hearth", name: "Hearth", t: extract.t, total: extractSeconds(delverRank(session())) };
    return null;
  };
  // Read by play/heroanim.js (pose, arc fade) and ui/castbar.js (Extract bar).
  // s runs 0 → 0.46 through windup (0.18) and recovery (0.28).
  rt.strikeInfo = function () {
    if (strike.windup > 0) return { s: 0.18 - strike.windup, arc: 0 };
    if (strike.recovery > 0) return { s: 0.18 + (0.28 - strike.recovery), arc: crescentT / CRESCENT_LIFE };
    return null;
  };
  rt.extractInfo = function () {
    if (!(extract.t > 0) || rt.space !== "dungeon") return null;
    return { t: extract.t, total: extractSeconds(delverRank(session())) };
  };
  rt.spawnKillLoot = spawnKillLoot;
  rt.tickCombat = tickCombat;
  rt.stepCombat = tickCombat;
  rt.beginStrike = beginStrike;
  rt.beginExtract = beginExtract;
  rt.releaseExtract = releaseExtract;
  rt.cancelExtract = cancelExtract;
  rt.cancelStrike = cancelStrike;
  rt.clearCombatMotion = clearCombatMotion;
  rt.noteExtractMove = noteExtractMove;
  rt.hurtHero = hurtHero;
  rt.grantWard = grantWard;
  rt.resolveDungeon = resolveDungeon;
  rt.resolveStrikeAt = resolveStrikeAt;
  rt.separateSkirmishers = separateSkirmishers;
  rt.losClear = losClear;
  rt.armSkirmishers = armSkirmishers;
  rt.rehydrateSummons = rehydrateSummons;
  rt.spawnBossWave = spawnBossWave;
  rt.heroForward = heroForward;
}
