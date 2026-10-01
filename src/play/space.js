import { generateFloor, mixSeed } from "../sim/floorgen.js";
import * as balance from "../sim/balance.js";
import { freshGame as blankGame, migrate, SCHEMA } from "../sim/save.js";
import { emptyQuests, normalizeQuests } from "../sim/quests.js";
import { applyTownLight, applyDungeonLight, dungeonTheme } from "../view/lights.js";
import { buildFloorMesh, buildColliderOverlay } from "../view/dungeon.js";
import { tileToWorld } from "../sim/floorgen.js";
import { TOWN_ARRIVAL } from "../sim/townplan.js";

function rollSeed() {
  const salt = Math.random();
  const t = performance.now();
  return (Math.floor(t) ^ Math.floor(salt * 4294967296)) >>> 0;
}

export function attachSpace(rt) {
  const session = {
    space: "town",
    level: 1,
    xp: 0,
    skillPoints: 0,
    tracks: { edge: 0, bulwark: 0, mend: 0, delver: 0 },
    pack: [],
    purse: 0,
    bank: 0,
    stash: [],
    materials: { heartwood: 0, rootfiber: 0, slag: 0, emberglass: 0 },
    bestDepth: 0,
    devRun: false,
    name: "Warden",
    nextUid: 1,
    equipped: null,
    townUnlocks: { store: true, smith: true, trainer: true, stall: false },
    quests: emptyQuests(),
    blade: null,
    might: 10,
    guard: 10,
    focus: 10,
    quick: 0,
    wardweave: 0,
    wardAbsorb: 0,
    wardT: 0,
    sunder: null,
    outOfCombat: 4,
    run: null
  };
  rt.session = session;
  rt.groundDrops = [];
  rt.space = "town";
  rt.plan = null;
  rt.dungeonRoot = null;
  rt.activeOccluders = [];
  rt.meters = rt.meters || { lastGenMs: 0, lastMeshMs: 0, drawCalls: 0 };
  rt.colliderOverlay = null;

  function eyebrow(text) {
    const node = document.querySelector("#minimap .eyebrow");
    if (node) node.textContent = text;
  }

  function slot4(name) {
    if (rt.setSlot4Name) rt.setSlot4Name(name);
  }

  function syncColliderOverlay() {
    if (rt.colliderOverlay) {
      rt.scene.remove(rt.colliderOverlay);
      rt.colliderOverlay = null;
    }
    if (!rt.dev || rt.hideColliders) return;
    const group = buildColliderOverlay(rt.space, rt.colliders, rt.plan);
    rt.scene.add(group);
    rt.colliderOverlay = group;
  }

  function disposeDungeon() {
    const root = rt.dungeonRoot;
    if (!root) return root;
    if (root.userData.dispose) root.userData.dispose();
    else if (root.parent) root.parent.remove(root);
    rt.dungeonRoot = null;
    rt.plan = null;
    rt.enemies = [];
    rt.activeOccluders = [];
    return root;
  }

  function clearGroundDrops() {
    const drops = rt.groundDrops;
    if (!drops) {
      rt.groundDrops = [];
      return;
    }
    for (let i = 0; i < drops.length; i++) {
      if (rt.releaseDropMesh) rt.releaseDropMesh(drops[i]);
    }
    drops.length = 0;
  }

  function showTown() {
    clearGroundDrops();
    if (rt.closePanel) rt.closePanel();
    disposeDungeon();
    if (rt.townRoot && !rt.townRoot.parent) rt.scene.add(rt.townRoot);
    rt.space = "town";
    session.space = "town";
    applyTownLight(rt.scene, rt);
    slot4("Hearth");
    eyebrow("Greenmere");
    syncColliderOverlay();
  }

  function placeEntrance(plan) {
    const w = tileToWorld(plan.entrance.col, plan.entrance.row, plan.cols, plan.rows);
    const s = tileToWorld(plan.stairs.col, plan.stairs.row, plan.cols, plan.rows);
    rt.player.position.set(w.x, 0, w.z);
    const dx = s.x - w.x;
    const dz = s.z - w.z;
    rt.player.rotation.set(0, (dx * dx + dz * dz) > 1e-6 ? Math.atan2(-dx, -dz) : 0, 0);
  }

  function clampDungeonCamera() {
    rt.camPitch = Math.max(0.18, Math.min(0.95, rt.camPitch));
    rt.camDist = Math.min(12, Math.max(4.2, rt.camDist));
  }

  function buildAndShow(reason) {
    clearGroundDrops();
    if (rt.closePanel) rt.closePanel();
    const run = session.run;
    const g0 = performance.now();
    const plan = generateFloor(run.runSeed, run.floorIndex);
    const genMs = performance.now() - g0;
    rt.meters.lastGenMs = genMs;
    const t0 = performance.now();
    const root = buildFloorMesh(plan);
    const meshMs = performance.now() - t0;
    rt.meters.lastMeshMs = meshMs;
    if (rt.townRoot && rt.townRoot.parent) rt.scene.remove(rt.townRoot);
    disposeDungeon();
    rt.dungeonRoot = root;
    rt.plan = plan;
    rt.orbs = root.userData.orbs || [];
    rt.scene.add(root);
    rt.space = "dungeon";
    session.space = "dungeon";
    rt.activeOccluders = root.userData.occluders || [];
    if (rt.armSkirmishers) rt.armSkirmishers(root.userData.actors, run);
    else rt.enemies = root.userData.actors;
    if (rt.rehydrateSummons) rt.rehydrateSummons(run);
    if (root.userData.syncActors) root.userData.syncActors(rt.enemies);
    const theme = dungeonTheme(plan.themeId);
    applyDungeonLight(rt.scene, rt, theme.id);
    clampDungeonCamera();
    placeEntrance(plan);
    rt.player.position.y = 0;
    if (rt.placeCamera) rt.placeCamera(0, true);
    if (rt.updateSun) rt.updateSun();
    slot4("Extract");
    eyebrow("Floor " + run.floorIndex + " · " + theme.name);
    if (rt.setStationPrompt) rt.setStationPrompt("");
    syncColliderOverlay();
    if (genMs + meshMs > 20 && rt.say) rt.say("The stair opens…");
    if (rt.questEvent && reason !== "resume") rt.questEvent({ type: "floor", floor: run.floorIndex });
    if (reason === "dev" && rt.say) rt.say("This delve is not written into the town ledger.");
    return { genMs, meshMs, plan };
  }

  function applyHero(doc) {
    const hero = doc.hero;
    session.name = hero.name;
    session.level = hero.level;
    session.xp = hero.xp;
    session.skillPoints = hero.skillPoints;
    session.tracks = hero.tracks;
    session.equipped = hero.equipped;
    session.pack = hero.pack;
    session.purse = hero.purse;
    session.bank = hero.bank;
    session.materials = hero.materials;
    session.bestDepth = hero.bestDepth;
    session.townUnlocks = hero.townUnlocks;
    session.stash = doc.stash;
    session.quests = normalizeQuests(doc.quests);
    session.nextUid = doc.nextUid;
    session.blade = session.equipped && session.equipped.weapon ? session.equipped.weapon : null;
    if (rt.clearBuyback) rt.clearBuyback();
  }

  function liveRun(run) {
    return {
      runSeed: run.runSeed,
      floorIndex: run.floorIndex,
      x: rt.player ? rt.player.position.x : 0,
      z: rt.player ? rt.player.position.z : 0,
      yaw: rt.player ? rt.player.rotation.y : 0,
      hp: rt.vitals ? rt.vitals.hp : 160,
      mp: rt.vitals ? rt.vitals.mp : 80,
      killed: run.killed,
      picked: run.picked,
      enemyHp: run.enemyHp,
      summons: run.summons,
      rngState: run.rngState,
      floorGuard: run.floorGuard,
      oilLeft: run.oilLeft
    };
  }

  function captureSaveDoc() {
    return migrate({
      schemaVersion: SCHEMA,
      savedAt: 0,
      nextUid: session.nextUid || 1,
      hero: {
        name: session.name,
        level: session.level,
        xp: session.xp,
        skillPoints: session.skillPoints,
        tracks: session.tracks,
        equipped: session.equipped,
        pack: session.pack,
        purse: session.purse,
        bank: session.bank,
        materials: session.materials,
        hp: rt.vitals ? rt.vitals.hp : 160,
        mp: rt.vitals ? rt.vitals.mp : 80,
        bestDepth: session.bestDepth,
        townUnlocks: session.townUnlocks
      },
      stash: session.stash,
      quests: session.quests,
      run: session.run ? liveRun(session.run) : null
    });
  }

  function placeTownHero() {
    const a = TOWN_ARRIVAL;
    const y = rt.groundY ? rt.groundY(a.x, a.z) : 0;
    rt.player.position.set(a.x, y, a.z);
    rt.player.rotation.set(0, a.yaw, 0);
    rt.camYaw = a.yaw + 0.42;
    rt.camPitch = 0.38;
    rt.camDist = 7.6;
    if (rt.placeCamera) rt.placeCamera(0, true);
    if (rt.updateSun) rt.updateSun();
  }

  function resumeRun(run) {
    session.run = {
      runSeed: run.runSeed >>> 0,
      floorIndex: run.floorIndex,
      killed: run.killed.slice(),
      picked: run.picked.slice(),
      enemyHp: Object.assign({}, run.enemyHp),
      summons: run.summons.map((entry) => ({
        id: entry.id,
        archetype: entry.archetype,
        x: entry.x,
        z: entry.z,
        hp: entry.hp
      })),
      floorGuard: !!run.floorGuard,
      rngState: run.rngState >>> 0,
      oilLeft: run.oilLeft,
      x: run.x,
      z: run.z,
      yaw: run.yaw,
      hp: run.hp,
      mp: run.mp
    };
    if (rt.clearCombatMotion) rt.clearCombatMotion();
    rt.vitals.deathLock = false;
    rt.vitals.deathLockT = 0;
    if (rt.derivePools) rt.derivePools();
    buildAndShow("resume");
    rt.player.position.set(run.x, 0, run.z);
    rt.player.rotation.set(0, run.yaw || 0, 0);
    rt.camYaw = 0.42;
    rt.camPitch = 0.38;
    rt.camDist = 7.6;
    if (rt.placeCamera) rt.placeCamera(0, true);
    if (rt.updateSun) rt.updateSun();
    rt.vitals.hp = Math.max(0, Math.min(rt.vitals.hpMax, run.hp));
    rt.vitals.mp = Math.max(0, Math.min(rt.vitals.mpMax, run.mp));
    if (rt.syncVitals) rt.syncVitals();
  }

  function applySaveDoc(doc) {
    const clean = migrate(doc);
    applyHero(clean);
    session.devRun = false;
    session.wardAbsorb = 0;
    session.wardT = 0;
    session.sunder = null;
    session.outOfCombat = 4;
    if (rt.cdLeft) {
      for (let i = 0; i < rt.cdLeft.length; i++) rt.cdLeft[i] = 0;
    }
    if (clean.run) resumeRun(clean.run);
    else {
      session.run = null;
      if (rt.clearCombatMotion) rt.clearCombatMotion();
      rt.vitals.deathLock = false;
      rt.vitals.deathLockT = 0;
      showTown();
      if (rt.derivePools) rt.derivePools();
      rt.vitals.hp = Math.max(0, Math.min(rt.vitals.hpMax, clean.hero.hp));
      rt.vitals.mp = Math.max(0, Math.min(rt.vitals.mpMax, clean.hero.mp));
      placeTownHero();
      if (rt.syncVitals) rt.syncVitals();
    }
    return clean;
  }

  function notifySave(reason) {
    if (session.devRun || rt.blockLedger) return;
    if (rt.markSave) rt.markSave(reason);
  }

  function beginNewRun(runSeed, floorIndex, dev) {
    if (dev && rt.holdSaves) rt.holdSaves();
    if (rt.clearCombatMotion) rt.clearCombatMotion();
    session.devRun = !!dev;
    session.run = {
      runSeed: runSeed >>> 0,
      floorIndex: floorIndex || 1,
      killed: [],
      picked: [],
      enemyHp: {},
      summons: [],
      floorGuard: false,
      rngState: mixSeed(runSeed >>> 0, 0x51ed) >>> 0,
      oilLeft: 0
    };
    if (rt.fillPools) rt.fillPools();
    rt.vitals.deathLock = false;
    rt.vitals.deathLockT = 0;
    buildAndShow(dev ? "dev" : "gate");
  }

  function enterFromGate() {
    if (rt.space !== "town" || session.run) return false;
    beginNewRun(rollSeed(), 1, false);
    return true;
  }

  function startRun(seed, floorIndex) {
    beginNewRun(seed >>> 0, floorIndex || 1, false);
    return session.run;
  }

  function playDevQuery(seed, floorIndex) {
    if (rt.holdSaves) rt.holdSaves();
    try {
      rt.devLedger = JSON.parse(JSON.stringify(captureSaveDoc()));
    } catch (err) {
      rt.devLedger = null;
    }
    beginNewRun(seed >>> 0, floorIndex || 1, true);
    return session.run;
  }

  function startDevFloor(seed, floorIndex) {
    return playDevQuery(seed, floorIndex);
  }

  function bossBlocksStairs() {
    const run = session.run;
    if (!run || rt.space !== "dungeon" || run.floorIndex % 5 !== 0) return false;
    const killed = run.killed || [];
    const enemies = rt.enemies || [];
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (!e || !e.boss) continue;
      if (e.hp > 0 && killed.indexOf(e.id) < 0) return true;
    }
    return false;
  }

  function descendFloor() {
    const run = session.run;
    if (!run || rt.space !== "dungeon") return false;
    if (bossBlocksStairs()) return false;
    run.floorIndex += 1;
    run.killed = [];
    run.picked = [];
    run.enemyHp = {};
    run.summons = [];
    run.floorGuard = false;
    session.wardAbsorb = 0;
    session.wardT = 0;
    session.sunder = null;
    if (rt.cancelExtract) rt.cancelExtract();
    if (rt.cancelStrike) rt.cancelStrike();
    buildAndShow("stairs");
    notifySave("floor");
    return true;
  }

  function tryStairs() {
    if (rt.space !== "dungeon" || !session.run || !rt.plan) return false;
    const plan = rt.plan;
    const w = tileToWorld(plan.stairs.col, plan.stairs.row, plan.cols, plan.rows);
    const d = Math.hypot(rt.player.position.x - w.x, rt.player.position.z - w.z);
    if (d > 2) return false;
    return descendFloor();
  }

  function arriveTown(reason) {
    const run = session.run;
    const floorIndex = run ? run.floorIndex : 0;
    if (reason === "extract" && run) {
      if (rt.questEvent) rt.questEvent({ type: "extract", floor: floorIndex });
      session.bestDepth = Math.max(session.bestDepth || 0, floorIndex);
    } else if (reason === "death") {
      session.pack = [];
      session.purse = 0;
    }
    session.run = null;
    session.wardAbsorb = 0;
    session.wardT = 0;
    session.sunder = null;
    if (rt.clearCombatMotion) rt.clearCombatMotion();
    rt.vitals.deathLock = false;
    rt.vitals.deathLockT = 0;
    if (rt.cdLeft) {
      for (let i = 0; i < rt.cdLeft.length; i++) rt.cdLeft[i] = 0;
    }
    showTown();
    if (rt.fillPools) rt.fillPools();
    arriveHero();
    if (reason === "death" && rt.say) rt.say("The Underwood kept what you carried.");
    if (rt.syncVitals) rt.syncVitals();
    notifySave(reason === "death" ? "death" : "arrive");
    return reason || "town";
  }

  // Town arrival: the gate road, facing into town, camera behind the hero.
  function arriveHero() {
    const a = TOWN_ARRIVAL;
    if (rt.resetInterior) rt.resetInterior();
    if (rt.resetHero) rt.resetHero(a.x, a.z, a.yaw);
    rt.player.rotation.y = a.yaw;
    rt.camYaw = a.yaw;
    if (rt.placeCamera) rt.placeCamera(0, true);
  }

  function freshGame() {
    applyHero(blankGame());
    session.devRun = false;
    session.run = null;
    session.wardAbsorb = 0;
    session.wardT = 0;
    session.sunder = null;
    session.outOfCombat = 4;
    if (rt.cdLeft) {
      for (let i = 0; i < rt.cdLeft.length; i++) rt.cdLeft[i] = 0;
    }
    if (rt.clearCombatMotion) rt.clearCombatMotion();
    rt.vitals.deathLock = false;
    rt.vitals.deathLockT = 0;
    showTown();
    if (rt.fillPools) rt.fillPools();
    else {
      rt.vitals.hpMax = 160;
      rt.vitals.mpMax = 80;
      rt.vitals.hp = 160;
      rt.vitals.mp = 80;
    }
    arriveHero();
  }

  rt.syncColliderOverlay = syncColliderOverlay;
  rt.enterFromGate = enterFromGate;
  rt.startRun = startRun;
  rt.startDevFloor = startDevFloor;
  rt.descendFloor = descendFloor;
  rt.tryStairs = tryStairs;
  rt.arriveTown = arriveTown;
  rt.freshGame = freshGame;
  rt.buildAndShow = buildAndShow;
  rt.captureSaveDoc = captureSaveDoc;
  rt.applySaveDoc = applySaveDoc;
  rt.playDevQuery = playDevQuery;

  const game = window.__game = window.__game || {};
  game.generateFloor = generateFloor;
  game.balance = balance;
  game.arriveTown = arriveTown;
  game.meters = rt.meters;
  game.save = function () {
    return rt.flushSave ? rt.flushSave() : captureSaveDoc();
  };
  Object.defineProperty(game, "space", {
    configurable: true,
    get() { return rt.space; }
  });

  freshGame();
}
