import * as THREE from "three";
import {
  floorSpan,
  enemyBudget,
  eliteCount,
  enemyLevel,
  skirmisherHp,
  skirmisherDmg,
  killGold,
  killXp,
  rarityCuts,
  xpToNext,
  upgradeGold,
  upgradeCost,
  affixValue,
  dropIlvl,
  arcHit,
  strikeDamage,
  incomingDamage,
  applyDamage,
  edgeMul,
  strikeArcDeg,
  wardCost,
  wardAbsorb,
  mendHeal,
  mendCost,
  walkSpeed,
  sprintSpeed,
  extractSeconds,
  xpGrant,
  grantXp,
  delverMatBonus,
  foeProfile,
  telegraphSeconds,
  livingCount,
  summonRoom,
  applyFoeDamage,
  stepFoe,
  stepOrb,
  orbHits
} from "../sim/balance.js";
import { generateFloor, setSealedThrows, tileToWorld, SAFE_RADIUS } from "../sim/floorgen.js";
import { mendCastSeconds, MEND_PUSHBACK, mendPushback, DEATH_LOCK_S } from "../sim/balance.js";
import { biomeIndex } from "../sim/biomes.js";
import { TRAP_BASE, TRAP_SPENT, trapDef, trapHurts, makeTrapState, stepTrap, trapHits, trapStrikes, unreachableSwitches, dartVolley, stepDart, dartHits, valveSeconds, trapSenseRange, trapsOnMap, wardedTrapDamage, surefootSlow, surefootHold } from "../sim/traps.js";
import { trapBudget, trapDamage } from "../sim/balance.js";
import { terrainHeight } from "../sim/terrain.js";
import { freshGame as freshSave, migrate, parseSave, ledgerExceedsCap, SAVE_KEY, SAVE_BAK_KEY, SAVE_MAX_CHARS, SCHEMA } from "../sim/save.js";
import { vendorValue, sellValue, addMaterial } from "../ui/panels.js";
import { heroStats, compareEquip, compareUpgrade, trackNext, trackEffects, affixLines } from "../sim/gearstats.js";
import { KEEPERS, WANDERERS, VENDORS, FOLK_RADIUS, HEN_YARDS, BARKS_TIER, buildTownGraph, createWalker, stepWalker, clearanceAt, segmentClear, yardCenter, staticTownColliders, shiftPart } from "../sim/townfolk.js";
import { YARD_D, STAIR_W, townTier, levelTop, groundAtLevel, nextLevel, upperBuildingAt, insideRect } from "../sim/townplan.js";
import { applyTownTime, townDayKeys } from "../view/lights.js";
import { loreState, talkLines, guideHint, rumour, themeOf } from "../sim/townlore.js";
import { upgradeStatus as upgradeStatusRaw } from "../ui/character.js";
import { emptyStats, normalizeStats, recordStat, playTimeText } from "../sim/lifestats.js";
import { emptyQuests, dailyOffers, takeQuest, applyEvent, claimQuest, rollover, requestFor, normalizeQuests, isComplete, QUEST_CAP } from "../sim/quests.js";
import { BUILDINGS, COTTAGES, GATE, HEARTH, TOWN_ARRIVAL, FLOOR_Y, WALL_T, stationWorld, localToWorld, worldToLocal, doorPoint, wallBoxes, buildingAt } from "../sim/townplan.js";
import { affixDef, gearTotals, lootRng, materialDropCount, rollGearDrop, tryCraft, tryUpgrade, killExtras, extrasRng } from "../sim/items.js";

function openEdges(geo) {
  const p = geo.attributes.position;
  const q = 1e3;
  const keyOf = (i) => Math.round(p.getX(i) * q) + "," + Math.round(p.getY(i) * q) + "," + Math.round(p.getZ(i) * q);
  const edges = new Map();
  for (let i = 0; i < p.count; i += 3) {
    const ks = [keyOf(i), keyOf(i + 1), keyOf(i + 2)];
    for (let e = 0; e < 3; e++) {
      const a = ks[e];
      const b = ks[(e + 1) % 3];
      if (a === b) continue;
      const ek = a < b ? a + "|" + b : b + "|" + a;
      edges.set(ek, (edges.get(ek) || 0) + 1);
    }
  }
  let boundary = 0;
  for (const n of edges.values()) if (n !== 2) boundary++;
  return boundary;
}

export function installSelfTest(rt) {
  function modelFront() {
    const headPos = new THREE.Vector3();
    const nosePos = new THREE.Vector3();
    rt.head.getWorldPosition(headPos);
    rt.nose.getWorldPosition(nosePos);
    return nosePos.sub(headPos).setY(0).normalize();
  }
  function facingVector() {
    return new THREE.Vector3(0, 0, -1).applyQuaternion(rt.player.quaternion);
  }

  function upgradeStatusText(session, item) {
    const st = upgradeStatusRaw(session, item);
    return st ? st.text : "";
  }
  function atArrival() {
    const p = rt.player.position;
    const d = rt.player.rotation.y - TOWN_ARRIVAL.yaw;
    const yawErr = Math.abs(Math.atan2(Math.sin(d), Math.cos(d)));
    return Math.abs(p.x - TOWN_ARRIVAL.x) < 0.05 && Math.abs(p.z - TOWN_ARRIVAL.z) < 0.05 && yawErr < 1e-6;
  }
  function stationNamed(name) {
    return (rt.stations || []).find((st) => st.name === name) || null;
  }
  // A point `out` metres from a building's station, on the customer (door) side.
  function besideStation(name, out) {
    const b = BUILDINGS.find((bd) => bd.name === name);
    return localToWorld(b, b.station.x, b.station.z + out);
  }

  async function selfTestControls() {
    // Wandering townsfolk would make collider and prompt checks depend on where
    // they happen to be; the townsfolk block re-enables them for its own checks.
    rt.townfolkSolid = false;
    // Noon, and a town that has not grown: the locked light values and tier 0.
    const clockWas = { phase: rt.townClock.phase, frozen: rt.townClock.frozen };
    rt.townClock.phase = 0.5;
    rt.townClock.frozen = true;
    applyTownTime(rt.scene, rt, 0.5, rt.nightMats);
    const lines = [];
    const fails = [];
    function check(cond, msg) {
      lines.push((cond ? "PASS  " : "FAIL  ") + msg);
      if (!cond) fails.push(msg);
    }
    const {
      pines, decs, TREE_COUNT, scene, camera, player, keys,
      pineCanopy, decCanopy, pineTrunk, decTrunk, bushGeo, rockGeos,
      slots, abilities, vitals, cdLeft, castLine, mapCanvas, mapCtx
    } = rt;
    const _fwd = rt.fwd;
    const _right = rt.right;
    const resetHero = rt.resetHero;
    const cameraPlanarBasis = rt.cameraPlanarBasis;
    const placeCamera = rt.placeCamera;
    const update = rt.update;
    const groundY = rt.groundY;
    const tryAbility = rt.tryAbility;
    const tickHud = rt.tickHud;
    const worldToMap = rt.worldToMap;
    const mapAngleFromPlanar = rt.mapAngleFromPlanar;
    const playerMapAngle = rt.playerMapAngle;
    const cameraMapAngle = rt.cameraMapAngle;
    const drawMinimap = rt.drawMinimap;
    const resetHud = rt.resetHud;

    const treeTotal = pines.length + decs.length;
    check(treeTotal === TREE_COUNT, "tree count " + treeTotal + " === " + TREE_COUNT);
    check(pines.length + decs.length === 3050, "pines + decs === 3050");
    const flatMiss = [];
    scene.traverse((o) => {
      if (!o.material) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) if (!m.flatShading) flatMiss.push(o.type + " " + (m.type || ""));
    });
    check(flatMiss.length === 0, "flatShading on every material" + (flatMiss.length ? " missing " + flatMiss.slice(0, 4).join(", ") : ""));
    check(scene.fog && scene.fog.isFogExp2, "FogExp2 present");

    resetHero(0, 0, 0);
    camera.updateMatrixWorld(true);
    cameraPlanarBasis();
    check(_fwd.z < -0.9 && Math.abs(_fwd.x) < 0.08, "yaw 0 camera forward is -z (" + _fwd.x.toFixed(2) + "," + _fwd.z.toFixed(2) + ")");
    check(_right.x > 0.9 && Math.abs(_right.z) < 0.08, "yaw 0 right is +x (" + _right.x.toFixed(2) + "," + _right.z.toFixed(2) + ")");

    const beforeX = camera.getWorldDirection(new THREE.Vector3()).x;
    rt.camYaw -= 0.35;
    placeCamera(0, true);
    const afterDir = camera.getWorldDirection(new THREE.Vector3());
    check(afterDir.x > beforeX + 0.05, "decreasing yaw turns the view toward +x");

    const samples = [
      ["KeyW", "f", +1],
      ["KeyS", "f", -1],
      ["KeyD", "r", +1],
      ["KeyA", "r", -1],
      ["ArrowUp", "f", +1],
      ["ArrowRight", "r", +1]
    ];
    for (const [code, axis, sign] of samples) {
      resetHero(0, 0, 0);
      camera.updateMatrixWorld(true);
      cameraPlanarBasis();
      const basis = { f: _fwd.clone(), r: _right.clone() };
      const p0 = player.position.clone();
      keys[code] = true;
      let acc = 0;
      while (acc < 0.36) {
        update(0.016);
        acc += 0.016;
      }
      keys[code] = false;
      const d = player.position.clone().sub(p0);
      d.y = 0;
      const len = d.length();
      check(len > 0.8, code + " displaced " + len.toFixed(2) + "m");
      if (len > 0.05) {
        const along = d.clone().normalize().dot(basis[axis]) * sign;
        check(along > 0.9, code + " camera-relative axis cos " + along.toFixed(3));
        const face = facingVector().dot(d.clone().normalize());
        check(face > 0.9, code + " faces travel cos " + face.toFixed(3));
        const noseDot = modelFront().dot(facingVector());
        check(noseDot > 0.9, code + " nose matches heading cos " + noseDot.toFixed(3));
      }
    }

    resetHero(24, -18, 0);
    update(0.016);
    const gy = groundY(player.position.x, player.position.z);
    check(Math.abs(player.position.y - gy) < 0.05, "grounded on terrain (" + player.position.y.toFixed(3) + " vs " + gy.toFixed(3) + ")");
    check(Number.isFinite(player.position.y), "player height finite");

    const solids = [
      ["pine canopy", pineCanopy],
      ["broadleaf canopy", decCanopy],
      ["pine trunk", pineTrunk],
      ["broadleaf trunk", decTrunk],
      ["bush", bushGeo]
    ];
    for (let i = 0; i < rockGeos.length; i++) solids.push(["rock " + i, rockGeos[i]]);
    for (const [name, geo] of solids) {
      const open = openEdges(geo);
      check(open === 0, name + " is a closed shell (" + open + " open edges)");
    }

    check(slots.filter(Boolean).length === 6 && abilities.length === 8, "six action slots: five on the bar, Extract in its own");
    check(!!document.getElementById("hp-bar") && !!document.getElementById("mp-bar") && !!mapCanvas, "vitals and minimap are in the page");

    vitals.hp = 100;
    vitals.mp = 80;
    cdLeft[2] = 0;
    // Mend is a held channel: nothing happens until it completes.
    const mend = tryAbility(2);
    check(mend.ok && mend.reason === "channel" && vitals.hp === 100 && vitals.mp === 80 && rt.castInfo().kind === "mend", "Mend starts a channel and spends nothing yet");
    rt.stepCombat(0.7);
    check(vitals.hp === 100 && rt.castInfo() && rt.castInfo().t > 0.6, "mid-channel Mend has not healed");
    rt.stepCombat(0.79);
    const mpBeforeLand = vitals.mp;
    rt.stepCombat(0.02);
    check(!rt.castInfo() && vitals.hp === 122 && Math.abs(vitals.mp - (mpBeforeLand - 14)) < 0.2, "Mend heals 22 and spends 14 mana when the channel lands (" + vitals.hp + " hp, " + vitals.mp.toFixed(1) + " mp)");
    check(document.getElementById("hp-label").textContent === "122 / 160", "health label tracks the bar");
    check(castLine.textContent === "The wood steadies you.", "Mend speaks in the cast line");
    check(cdLeft[2] === 0, "Mend leaves no cooldown");
    const again = tryAbility(2);
    check(again.ok && again.reason === "channel", "Mend can be cast again straight away");
    rt.stepCombat(0.8);
    const tBefore = rt.castInfo().t;
    rt.hurtHero(5);
    check(!!rt.castInfo() && Math.abs(rt.castInfo().t - Math.max(0.0001, tBefore - MEND_PUSHBACK)) < 1e-6 && vitals.hp === 117, "a hit pushes Mend back instead of breaking it");
    check(mendPushback(0) === MEND_PUSHBACK && mendPushback(1) === MEND_PUSHBACK && mendPushback(2) === MEND_PUSHBACK / 2 && mendPushback(5) === MEND_PUSHBACK / 2, "from Mend rank 2 a hit pushes the cast back half as far");
    rt.stepCombat(0.1);
    rt.hurtHero(5);
    rt.hurtHero(5);
    check(!!rt.castInfo() && rt.castInfo().t > 0 && rt.castInfo().t < 0.01, "pushback never goes below an empty bar");
    rt.cancelMend();
    vitals.hp = 122;

    // Ward is visible: a bubble and a shield segment while it holds, shards when broken.
    if (rt.wardFx) {
      check(!rt.wardFx.visible() && !rt.wardFx.overlayShown(), "no ward, no bubble or shield segment");
      rt.session.wardAbsorb = 30;
      rt.session.wardT = 4;
      rt.update(0.016);
      check(rt.wardFx.visible() && rt.wardFx.overlayShown(), "a raised ward shows its bubble and a shield segment on the health bar");
      rt.session.wardAbsorb = 12;
      rt.update(0.016);
      check(rt.wardFx.visible() && !rt.wardFx.shattering(), "a worn ward still shows");
      rt.session.wardAbsorb = 0;
      rt.update(0.016);
      check(!rt.wardFx.visible() && rt.wardFx.shattering() && !rt.wardFx.overlayShown(), "a ward emptied by damage shatters");
      rt.session.wardT = 0;
      for (let i = 0; i < 20; i++) rt.update(0.05);
      check(!rt.wardFx.shattering(), "the shards clear");
    }

    vitals.mp = 3;
    cdLeft[1] = 0;
    const poor = tryAbility(1);
    check(!poor.ok && poor.reason === "mana" && vitals.mp === 3, "Ward refuses without mana");
    check(slots[1].classList.contains("deny"), "empty mana shakes the slot");

    vitals.hp = 160;
    vitals.mp = 80;
    cdLeft[2] = 0;
    const hale = tryAbility(2);
    check(!hale.ok && hale.reason === "full" && vitals.hp === 160 && vitals.mp === 80, "Mend does nothing at full health");
    check(mendCastSeconds(0) === 1.5 && mendCastSeconds(4) === 1.1 && mendCastSeconds(9) === 1.1, "Mend channels 1.5 s, down to 1.1 s by rank 4");
    vitals.hp = 100;
    vitals.mp = 80;
    cdLeft[2] = 0;
    tryAbility(2);
    rt.noteExtractMove(0.7);
    rt.stepCombat(2);
    check(!rt.castInfo() && vitals.hp === 100 && vitals.mp === 80 && cdLeft[2] === 0, "moving breaks Mend and spends nothing");
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit3", bubbles: true }));
    rt.stepCombat(0.3);
    window.dispatchEvent(new KeyboardEvent("keyup", { code: "Digit3", bubbles: true }));
    rt.stepCombat(2);
    check(!rt.castInfo() && vitals.hp === 100 && vitals.mp === 80, "letting go of 3 early breaks Mend");
    vitals.hp = 160;

    resetHud();
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", bubbles: true }));
    window.dispatchEvent(new KeyboardEvent("keyup", { code: "Digit1", bubbles: true }));
    check(cdLeft[0] > 0 && castLine.textContent === "You cut the air.", "the 1 key uses Strike");
    keys.Digit1 = false;

    slots[3].click();
    check(rt.hearthT === 1 && castLine.textContent === "The campfire answers.", "Hearth click rings the campfire");

    tickHud(0.016);
    const barSlots = Array.from(document.querySelectorAll("#actionbar .slot")).map((n) => n.querySelector(".key").textContent + ":" + n.querySelector(".name").textContent);
    check(barSlots.join(",") === "1:Strike,2:Ward,3:Mend,4:Draught,5:Focus", "the action bar holds Strike, Ward, Mend, Draught, Focus on 1 to 5 (" + barSlots.join(",") + ")");
    check(!document.querySelector("#actionbar .slot.empty") && !document.querySelector('[data-index="7"]'), "no empty slot and no Sprint slot (Shift runs)");
    check(document.getElementById("extractbar").hidden, "the Extract bar is hidden in town");

    resetHero(0, 0, 0);
    const origin = worldToMap(0, 0);
    const northPt = worldToMap(0, -10);
    const eastPt = worldToMap(10, 0);
    const mid = mapCanvas.width / 2;
    check(Math.abs(origin.x - mid) < 0.01 && Math.abs(origin.y - mid) < 0.01, "player sits at the minimap center");
    check(northPt.y < origin.y, "north (-z) is up on the minimap");
    check(eastPt.x > origin.x, "east (+x) is right on the minimap");
    check(Math.abs(mapAngleFromPlanar(new THREE.Vector3(0, 0, -1))) < 1e-6, "map angle of -z is up");
    check(Math.abs(mapAngleFromPlanar(new THREE.Vector3(1, 0, 0)) - Math.PI / 2) < 1e-6, "map angle of +x is right");
    check(Math.abs(mapAngleFromPlanar(new THREE.Vector3(-1, 0, 0)) + Math.PI / 2) < 1e-6, "map angle of -x is left");
    check(Math.abs(playerMapAngle()) < 1e-6, "yaw 0 heading points up on the minimap");
    rt.camYaw = Math.PI / 2;
    placeCamera(0, true);
    const camAng = cameraMapAngle();
    check(camAng < -1.4 && camAng > -1.75, "camera yaw +π/2 looks west on the minimap (" + camAng.toFixed(3) + ")");
    rt.camYaw = 0;
    placeCamera(0, true);
    drawMinimap();
    const arrowPix = mapCtx.getImageData(mid, mid, 1, 1).data;
    check(arrowPix[0] > 200 && arrowPix[1] > 180 && arrowPix[2] > 140, "minimap arrow is parchment at the player (" + arrowPix[0] + "," + arrowPix[1] + "," + arrowPix[2] + ")");
    const square = worldToMap(0, 4);
    const squarePix = mapCtx.getImageData(Math.round(square.x), Math.round(square.y), 1, 1).data;
    check(Math.abs(squarePix[0] - squarePix[2]) < 24 && squarePix[0] > 120, "the square reads as grey cobble on the minimap (" + squarePix[0] + "," + squarePix[1] + "," + squarePix[2] + ")");
    const green = worldToMap(9, 12);
    const meadowPix = mapCtx.getImageData(Math.round(green.x), Math.round(green.y), 1, 1).data;
    check(meadowPix[1] > meadowPix[0] && meadowPix[1] > 160, "the town green reads green on the minimap (" + meadowPix[0] + "," + meadowPix[1] + "," + meadowPix[2] + ")");

    resetHud();
    resetHero(0, 0, 0);
    rt.camYaw = 0.42;
    rt.camPitch = 0.38;
    rt.camDist = 7.6;
    placeCamera(0, true);

    const stationPlace = [["Hearth", HEARTH.x, HEARTH.z], ["Delve Gate", GATE.x, GATE.z]];
    for (let i = 0; i < BUILDINGS.length; i++) {
      const bd = BUILDINGS[i];
      if (!bd.panel) continue;
      const sp = stationWorld(bd);
      stationPlace.push([bd.name, sp.x, sp.z]);
    }
    check(stationPlace.length === 8, "eight stations: hearth, gate, store, smith, still, circle, inn, counting house (" + stationPlace.length + ")");
    check(rt.townRoot && rt.terrain.parent === rt.townRoot, "townRoot contains the terrain");
    for (let i = 0; i < stationPlace.length; i++) {
      const [name] = stationPlace[i];
      const s = stationNamed(name);
      check(!!s && s.group && s.group.parent === rt.townRoot, name + " is under townRoot");
    }
    const sunLight = scene.children.find((o) => o.isDirectionalLight);
    check(!!sunLight && sunLight.parent === scene, "directional light is a direct child of the scene");
    const skyDome = scene.children.find((o) => o.isMesh && o.geometry && o.geometry.type === "SphereGeometry");
    check(!!skyDome && skyDome.parent === scene, "sky is a direct child of the scene");
    for (let i = 0; i < stationPlace.length; i++) {
      const [name, x, z] = stationPlace[i];
      const s = stationNamed(name);
      check(!!s && Math.abs(s.x - x) < 1e-9 && Math.abs(s.z - z) < 1e-9, name + " stands at (" + x.toFixed(2) + ", " + z.toFixed(2) + ")");
      if (!s) continue;
      if (s.building) {
        check(Math.abs(groundY(x, z) - FLOOR_Y) < 1e-6, name + " counter stands on the building floor (" + groundY(x, z).toFixed(3) + ")");
        check(!!buildingAt(x, z) && buildingAt(x, z).id === s.building, name + " station is inside its own building");
      } else if (s.footMesh) {
        s.footMesh.updateWorldMatrix(true, true);
        const foot = new THREE.Box3().setFromObject(s.footMesh).min.y;
        const gy = groundY(x, z);
        const th = terrainHeight(x, z);
        check(
          Math.abs(foot - gy) < 0.05 || Math.abs(foot - th) < 0.05,
          name + " feet within 0.05 of the ground (" + foot.toFixed(3) + " vs " + gy.toFixed(3) + " / " + th.toFixed(3) + ")"
        );
      }
      if (s.building) {
        // Wall blocking is proven by the door and back-wall walks below; here the
        // walls must be live colliders, each one deep enough to stop a 0.42 hero.
        const walls = s.colliders.filter((col) => col.kind === "box");
        check(walls.length >= 5 && walls.every((col) => rt.colliders.indexOf(col) >= 0), name + " walls are registered colliders (" + walls.length + ")");
        continue;
      }
      let held = s.colliders && s.colliders.length > 0;
      for (let c = 0; held && c < s.colliders.length; c++) {
        const col = s.colliders[c];
        let ox = col.x - s.x;
        let oz = col.z - s.z;
        const olen = Math.hypot(ox, oz);
        const step = Math.min(0.2, col.r * 0.45);
        if (olen < 1e-4) {
          ox = step;
          oz = 0;
        } else {
          ox = ox / olen * step;
          oz = oz / olen * step;
        }
        const resolved = rt.resolveColliders(col.x + ox, col.z + oz, 0.42);
        const dist = Math.hypot(resolved.x - col.x, resolved.z - col.z);
        if (dist + 1e-3 < col.r + 0.42) held = false;
      }
      check(held, name + " footprint stops a hero of radius 0.42");
    }

    // Life-size buildings: doors admit the hero, walls do not, interiors cut away.
    for (const bd of BUILDINGS.concat(COTTAGES)) {
      const door = bd.doors[0];
      const outside = doorPoint(bd, door, 1.2);
      const inside = doorPoint(bd, door, -1.6);
      const ow = localToWorld(bd, outside.x, outside.z);
      const iw = localToWorld(bd, inside.x, inside.z);
      let px = ow.x;
      let pz = ow.z;
      for (let k = 1; k <= 24; k++) {
        const t = k / 24;
        const r = rt.resolveColliders(ow.x + (iw.x - ow.x) * t, ow.z + (iw.z - ow.z) * t, 0.42);
        px = r.x;
        pz = r.z;
      }
      check(Math.hypot(px - iw.x, pz - iw.z) < 0.05, bd.name + " door admits a hero of radius 0.42");
      const backOut = localToWorld(bd, 0, -bd.d / 2 - 1.2);
      const backIn = localToWorld(bd, 0, -bd.d / 2 + 0.9);
      px = backOut.x;
      pz = backOut.z;
      for (let k = 1; k <= 24; k++) {
        const r = rt.resolveColliders(px + (backIn.x - backOut.x) / 24, pz + (backIn.z - backOut.z) / 24, 0.42);
        px = r.x;
        pz = r.z;
      }
      const backLocal = worldToLocal(bd, px, pz);
      check(backLocal.z <= -bd.d / 2 - 0.4, bd.name + " back wall stops the hero outside (" + backLocal.z.toFixed(2) + ")");
    }
    let wallsOk = true;
    for (let i = 0; i < BUILDINGS.length; i++) {
      for (const w of wallBoxes(BUILDINGS[i])) if (Math.min(w.hx, w.hz) < WALL_T / 2 - 1e-9) wallsOk = false;
    }
    check(wallsOk, "every wall segment is at least one wall thickness deep");
    {
      const store = rt.buildings.find((bb) => bb.def.id === "store");
      const sp = stationWorld(store.def);
      player.position.set(sp.x, 0, sp.z);
      rt.update(0.016);
      check(rt.insideBuilding === store.def, "standing at the counter puts the hero inside Bramble & Board");
      check(store.shell.castShadow === true && store.shellMat.clipShadows === false, "inside, the roof is cut away but still casts its shadow");
      check(Math.abs(store.clip.constant - (FLOOR_Y + 1.5)) < 1e-6 && store.caps.visible && store.shellMat.clippingPlanes[0] === store.clip && rt.renderer.localClippingEnabled, "inside, the walls are cut to waist height and capped");
      check(rt.townOccluders().indexOf(store.shell) < 0 && rt.townOccluders().indexOf(rt.buildings.find((bb) => bb.def.id === "smith").shell) >= 0, "inside, only the other buildings block the camera");
      check(Math.abs(player.position.y - FLOOR_Y) < 1e-6, "inside, the hero stands on the floor (" + player.position.y.toFixed(3) + ")");
      for (let k = 0; k < 30; k++) rt.update(0.016);
      check(rt.interiorLight.intensity > 1, "the interior light comes up indoors (" + rt.interiorLight.intensity.toFixed(2) + ")");
      check(rt.camPitch >= 0.3, "the camera tips down into the room (" + rt.camPitch.toFixed(2) + ")");
      const eb = document.querySelector("#minimap .eyebrow");
      check(eb && eb.textContent === "Bramble & Board", "the minimap eyebrow names the building indoors");
      const out = localToWorld(store.def, 0, store.def.d / 2 + 3);
      player.position.set(out.x, 0, out.z);
      rt.update(0.016);
      check(rt.insideBuilding === null && store.clip.constant > 1000 && !store.caps.visible, "stepping out restores the full walls and roof");
      check(eb && eb.textContent === "Greenmere", "outside, the eyebrow reads Greenmere again");
      check(Math.abs(player.position.y - groundY(out.x, out.z)) < 1e-6 && Math.abs(player.position.y) < 0.05, "outside, the hero is back on the street");
      rt.resetInterior();
    }
    // Cottages are homes you can walk into, each with a fenced yard.
    {
      let open = true;
      for (const c of COTTAGES) if (!buildingAt(c.x, c.z) || buildingAt(c.x, c.z).id !== c.id) open = false;
      check(open, "every cottage is an interior");
      let yards = true;
      for (const c of COTTAGES) {
        const gate = localToWorld(c, c.yard.gate.x, c.yard.gate.z);
        const step = doorPoint(c, c.doors[0], 1.1);
        const sw = localToWorld(c, step.x, step.z);
        let px = gate.x;
        let pz = gate.z;
        for (let k = 1; k <= 30; k++) {
          const r = rt.resolveColliders(gate.x + (sw.x - gate.x) * k / 30, gate.z + (sw.z - gate.z) * k / 30, 0.42);
          px = r.x;
          pz = r.z;
        }
        if (Math.hypot(px - sw.x, pz - sw.z) > 0.05) yards = false;
        // Straight through the fence beside the gate is blocked.
        const side = localToWorld(c, c.yard.gate.x + 2.4 * (c.yard.gate.x > 0 ? -1 : 1), c.d / 2 + YARD_D + 1.0);
        const inYard = localToWorld(c, c.yard.gate.x + 2.4 * (c.yard.gate.x > 0 ? -1 : 1), c.d / 2 + YARD_D - 1.0);
        px = side.x;
        pz = side.z;
        for (let k = 1; k <= 30; k++) {
          const r = rt.resolveColliders(px + (inYard.x - side.x) / 30, pz + (inYard.z - side.z) / 30, 0.42);
          px = r.x;
          pz = r.z;
        }
        if (worldToLocal(c, px, pz).z < c.d / 2 + YARD_D) yards = false;
      }
      check(yards, "each yard gate lets the hero to the door and the fence beside it does not");
    }

    // Upstairs: the store and the inn have a flight to a walkable second floor.
    {
      const store = rt.buildings.find((bb) => bb.def.id === "store");
      const sd = store.def;
      const st = sd.stairs;
      const top = levelTop(sd);
      const foot = localToWorld(sd, st.x, st.z0 + Math.sign(st.z1 - st.z0) * 0.1);
      const head = localToWorld(sd, st.x, st.z1 - Math.sign(st.z1 - st.z0) * 0.1);
      check(Math.abs(groundAtLevel(foot.x, foot.z, 0) - FLOOR_Y) < 0.1 && Math.abs(groundAtLevel(head.x, head.z, 0) - top) < 0.1, "the stairs rise from the floor to the upstairs floor");
      check(nextLevel(foot.x, foot.z, 0) === 0 && nextLevel(head.x, head.z, 0) === 1, "the top half of the flight puts the hero upstairs");
      // Climb with the real movement step, one stair-length at a time.
      rt.resetInterior();
      player.position.set(foot.x, 0, foot.z);
      let maxY = 0;
      for (let k = 0; k <= 40; k++) {
        const t = k / 40;
        const p = localToWorld(sd, st.x, st.z0 + (st.z1 - st.z0) * (0.02 + t * 0.96));
        player.position.x = p.x;
        player.position.z = p.z;
        rt.update(0.016);
        maxY = Math.max(maxY, player.position.y);
      }
      check(rt.heroLevel === 1 && Math.abs(maxY - top) < 0.15, "climbing the flight ends upstairs (" + maxY.toFixed(2) + " vs " + top.toFixed(2) + ")");
      const room = localToWorld(sd, 1.0, 0.4);
      player.position.set(room.x, player.position.y, room.z);
      rt.update(0.016);
      check(rt.heroLevel === 1 && Math.abs(player.position.y - top) < 1e-6, "upstairs, the hero walks the upper floor (" + player.position.y.toFixed(2) + ")");
      check(rt.insideBuilding === sd && Math.abs(store.clip.constant - (top + 1.5)) < 1e-6 && store.caps1.visible && !store.caps.visible, "upstairs, the cut moves up a storey");
      const eb = document.querySelector("#minimap .eyebrow");
      check(eb && eb.textContent === "Bramble & Board", "upstairs, the eyebrow still names the building");
      rt.refreshTownPrompt();
      check(castLine.textContent.indexOf("F —") < 0, "upstairs, the counter below does not answer");
      // The stairwell is railed upstairs: stepping off the floor into it from the side is blocked.
      const roomSide = st.x < 0 ? 1 : -1;
      const besideWell = localToWorld(sd, st.x + roomSide * (STAIR_W / 2 + 0.6), (st.z0 + st.z1) / 2);
      const intoWell = localToWorld(sd, st.x, (st.z0 + st.z1) / 2);
      let wx = besideWell.x;
      let wz = besideWell.z;
      for (let k = 1; k <= 20; k++) {
        const r = rt.resolveColliders(wx + (intoWell.x - besideWell.x) / 20, wz + (intoWell.z - besideWell.z) / 20, 0.42, 1);
        wx = r.x;
        wz = r.z;
      }
      const wl = worldToLocal(sd, wx, wz);
      check(Math.abs(wl.x - st.x) >= STAIR_W / 2 + 0.4, "upstairs, the rail keeps the hero out of the stairwell");
      // Downstairs walls do not exist up here, and the upper walls do not exist down there.
      const sp = stationWorld(sd);
      check(rt.resolveColliders(sp.x, sp.z, 0.42, 1).x === sp.x, "upper colliders and ground colliders are separate");
      // Back down.
      for (let k = 40; k >= 0; k--) {
        const t = k / 40;
        const p = localToWorld(sd, st.x, st.z0 + (st.z1 - st.z0) * (0.02 + t * 0.96));
        player.position.x = p.x;
        player.position.z = p.z;
        rt.update(0.016);
      }
      check(rt.heroLevel === 0 && Math.abs(player.position.y - FLOOR_Y) < 0.15 && Math.abs(store.clip.constant - (FLOOR_Y + 1.5)) < 1e-6, "walking down returns the hero to the ground floor");
      check(!!upperBuildingAt(localToWorld(rt.buildings.find((bb) => bb.def.id === "inn").def, 0, 0).x, localToWorld(rt.buildings.find((bb) => bb.def.id === "inn").def, 0, 0).z), "the inn has an upstairs too");
      rt.resetInterior();
    }

    // The town grows with the deepest extract.
    {
      check(townTier(0) === 0 && townTier(3) === 1 && townTier(6) === 2 && townTier(10) === 3 && townTier(99) === 3, "town tiers unlock at depths 3, 6, and 10");
      const depthWas = rt.session.bestDepth;
      rt.session.bestDepth = 0;
      rt.syncTownTier();
      const tierColliders = rt.colliders.filter((c) => c.tier);
      check(tierColliders.length > 0 && tierColliders.every((c) => c.off) && rt.townTierMeshes.slice(1).every((m) => !m || !m.visible), "a fresh town hides every growth piece");
      rt.session.bestDepth = 7;
      rt.syncTownTier();
      check(rt.townTierMeshes[1].visible && rt.townTierMeshes[2].visible && !rt.townTierMeshes[3].visible, "depth 7 shows tiers 1 and 2, not 3");
      check(tierColliders.every((c) => c.off === c.tier > 2), "only unlocked growth pieces block movement");
      const maud = rt.keeperAt("maud");
      maud.lastBark = -1e9;
      maud.near = false;
      maud.toldTier = 0;
      if (rt.barks) rt.barks.clear();
      const sp = besideStation("Bramble & Board", 0);
      player.position.set(sp.x, 0, sp.z);
      rt.townfolkSolid = false;
      for (let k = 0; k < 5; k++) rt.update(0.016);
      check(rt.barks.text("maud").indexOf(BARKS_TIER.shopkeeper[2]) >= 0 && maud.toldTier === 2, "Maud remarks on the town's growth first");
      rt.barks.clear();
      rt.session.bestDepth = depthWas;
      rt.syncTownTier();
      maud.toldTier = 0;
      rt.resetInterior();
    }

    // Kill drops (spec: gold killGold(n) x3 elite x8 boss; 40% theme material).
    {
      const e10 = killExtras(extrasRng(7, 10, 3), { floorIndex: 10, kind: "boss" });
      check(e10.gold === killGold(10) * 8, "a floor-10 boss drops killGold(10) x 8 gold (" + e10.gold + ")");
      check(killExtras(extrasRng(7, 3, 1), { floorIndex: 3, kind: "elite" }).gold === killGold(3) * 3, "an elite drops three times the gold");
      const a1 = killExtras(extrasRng(42, 6, 5), { floorIndex: 6, kind: "normal" });
      const a2 = killExtras(extrasRng(42, 6, 5), { floorIndex: 6, kind: "normal" });
      check(JSON.stringify(a1) === JSON.stringify(a2), "kill drops are a pure function of seed, floor, and spawn");
      let mats = 0;
      let wrongTheme = 0;
      for (let id = 0; id < 400; id++) {
        const x = killExtras(extrasRng(99, 2, id), { floorIndex: 2, kind: "normal" });
        if (x.material) {
          mats++;
          if (x.material.key !== "rootfiber" || x.material.count !== 1) wrongTheme++;
        }
      }
      check(mats > 120 && mats < 200 && wrongTheme === 0, "about 40% of floor-2 kills drop one rootfiber (" + mats + "/400)");
      // Pickup: gold to the purse, materials to the counters, both remembered as picked.
      rt.suspendCombat = true;
      rt.startRun(5, 1);
      const purse0 = rt.session.purse;
      const heart0 = rt.session.materials.heartwood;
      const px = player.position.x;
      const pz = player.position.z;
      rt.groundDrops.push({ kind: "gold", uid: "drop-1-90-1", amount: 6, x: px, z: pz });
      rt.groundDrops.push({ kind: "material", uid: "drop-1-90-2", material: "heartwood", amount: 2, x: px, z: pz });
      rt.collectDrops();
      check(rt.session.purse === purse0 + 6 && rt.session.materials.heartwood === heart0 + 2, "walking over kill drops fills the purse and the material counters");
      check(rt.session.run.picked.indexOf("drop-1-90-1") >= 0 && rt.session.run.picked.indexOf("drop-1-90-2") >= 0, "picked gold and materials are remembered for the floor");
      rt.arriveTown("extract");
      rt.suspendCombat = false;
      rt.session.materials.heartwood = heart0;
    }

    // Phase 4: keepers talk, the inn rents rooms, the Counting House keeps gold and gear, a guide points the way.
    {
      const panelNode = document.getElementById("panel");
      // Pure lore.
      const fresh = loreState({ level: 1, bestDepth: 0, skillPoints: 0, materials: {}, pack: [], stash: [], purse: 0, bank: 0 }, 0.5);
      check(guideHint(fresh).target === "gate", "a new Warden is pointed at the Delve Gate");
      check(guideHint(Object.assign({}, fresh, { points: 2, bestDepth: 2, level: 3 })).target === "trainer", "unspent points point at The Circle");
      check(guideHint(Object.assign({}, fresh, { heartwood: 2, bestDepth: 1 })).target === "still", "heartwood in hand points at The Still");
      check(guideHint(Object.assign({}, fresh, { purse: 140, bestDepth: 1 })).target === "bank", "a heavy purse points at the Counting House");
      check(rumour({ bestDepth: 4 })[0].indexOf("floor 5") >= 0 && themeOf(5).name === "Moss" && themeOf(4).name === "Ember", "rumours name the next floor and its theme");
      const orrinLines = talkLines("orrin", Object.assign({}, fresh, { part: "night" }));
      check(orrinLines.length >= 3 && orrinLines[0].indexOf("sleep") >= 0, "Orrin greets by the hour and has more to say");
      check(talkLines("tamsin", fresh).some((l) => l.indexOf("Spitters") >= 0), "Old Tamsin warns of what the next floors bring");

      // Store no longer banks; the Counting House does, with Aldous at the grille.
      rt.openPanel("store", stationNamed("Bramble & Board"));
      check(!panelNode.querySelector('[data-act="deposit"]') && !panelNode.querySelector('[data-act="stash"]') && !!panelNode.querySelector('[data-act="buy-hp"]'), "Bramble & Board sells, but no longer banks or stashes");
      check(!!panelNode.querySelector(".panel-talk") && panelNode.querySelector(".panel-talk").textContent.length > 4, "Maud says something when the panel opens");
      const bank = stationNamed("The Counting House");
      check(!!bank && bank.panel === "bank", "the Counting House is a station");
      if (bank) {
        player.position.set(bank.x, 0, bank.z);
        rt.update(0.016);
        rt.refreshTownPrompt();
        check(rt.keyPrompt.label() === "The Counting House", "the F prompt names The Counting House at the grille");
        tap("KeyF");
        check(!panelNode.hidden && panelNode.querySelector(".eyebrow").textContent === "The Counting House" && panelNode.textContent.indexOf("Aldous Penn") >= 0 && !!panelNode.querySelector('[data-act="deposit"]') && !panelNode.querySelector('[data-act="sell"]'), "F at the grille opens the Counting House with Aldous");
      }
      // Talking cycles through the keeper's lines and wraps.
      rt.openPanel("smith", stationNamed("The Quench"));
      const first = panelNode.querySelector(".panel-talk").textContent;
      const ask = panelNode.querySelector('[data-act="talk"]');
      if (ask) ask.click();
      const second = panelNode.querySelector(".panel-talk").textContent;
      check(!!ask && first !== second, "Ask more moves Orrin to his next line");
      for (let k = 0; k < 8; k++) {
        const more = panelNode.querySelector('[data-act="talk"]');
        if (more) more.click();
      }
      check(!!panelNode.querySelector(".panel-talk"), "talk wraps around without emptying the plaque");
      rt.openPanel("smith", stationNamed("The Quench"));
      check(panelNode.querySelector(".panel-talk").textContent === first, "reopening a panel starts with the greeting again");
      // The inn: talk and rest.
      const inn = stationNamed("The Banked Fire");
      check(!!inn && inn.panel === "inn", "the Banked Fire has a counter");
      rt.townClock.phase = 0.9;
      rt.openPanel("inn", inn);
      const rest = panelNode.querySelector('[data-act="rest"]');
      check(!!rest && rest.textContent.indexOf("morning") >= 0 && panelNode.textContent.indexOf("Pell") >= 0, "at night Pell offers a room until morning");
      if (rest) rest.click();
      check(Math.abs(rt.townClock.phase - 0.3) < 1e-9 && castLine.textContent.indexOf("morning") >= 0, "a night's rest wakes the hero in the morning");
      rt.townClock.phase = 0.5;
      applyTownTime(scene, rt, 0.5, rt.nightMats);
      rt.closePanel();

      // The guide plaque and its minimap pin.
      const sessionWas = { bestDepth: rt.session.bestDepth, level: rt.session.level, skillPoints: rt.session.skillPoints, pack: rt.session.pack, materials: Object.assign({}, rt.session.materials), purse: rt.session.purse };
      rt.session.bestDepth = 0;
      rt.session.level = 1;
      rt.session.skillPoints = 0;
      rt.session.pack = [];
      rt.session.materials = { heartwood: 0, rootfiber: 0, slag: 0, emberglass: 0 };
      rt.session.purse = 0;
      player.position.set(0, 0, 0);
      rt.tickGuide(0, true);
      rt.tickHud(0.016);
      const guideNode = document.getElementById("guide");
      check(!!rt.guide && rt.guide.target === "gate" && Math.abs(rt.guide.z - GATE.z) < 1e-9 && !!guideNode && !guideNode.hidden && guideNode.textContent.indexOf("Delve Gate") >= 0, "the guide plaque points a new Warden at the gate");
      const guideFont = getComputedStyle(guideNode).fontFamily.toLowerCase();
      check(guideNode.classList.contains("plaque") && guideFont.indexOf("sans-serif") < 0, "the guide is a serif plaque");
      player.position.set(GATE.x, 0, GATE.z + 3);
      rt.tickGuide(0, true);
      rt.tickHud(0.016);
      check(rt.guide === null && guideNode.hidden, "the guide goes quiet at its target");
      rt.session.bestDepth = sessionWas.bestDepth;
      rt.session.level = sessionWas.level;
      rt.session.skillPoints = sessionWas.skillPoints;
      rt.session.pack = sessionWas.pack;
      rt.session.materials = sessionWas.materials;
      rt.session.purse = sessionWas.purse;

      // A villager answers F when no counter is in reach.
      const walker = rt.townfolk.find((f) => f.kind === "walker");
      rt.townfolkSolid = true;
      walker.w.mode = "linger";
      walker.w.t = 30;
      player.position.set(walker.x + 1.0, 0, walker.z);
      rt.update(0.016);
      player.position.set(walker.x + 1.0, 0, walker.z);
      rt.refreshTownPrompt();
      const offered = rt.keyPrompt.label();
      if (rt.barks) rt.barks.clear();
      tap("KeyF");
      check(offered === "Talk to " + walker.name && rt.barks.has(walker.id) && rt.barks.text(walker.id).indexOf(walker.name) === 0, "F beside " + walker.name + " starts a word with them (" + offered + ")");
      rt.townfolkSolid = false;
      rt.barks.clear();
      resetHero(0, 0, 0);
      rt.refreshTownPrompt();
    }

    // Quests: daily notices, keeper requests, events in, rewards out, saved.
    {
      const day = "2026-10-02";
      const o1 = dailyOffers(day, 3);
      const o2 = dailyOffers(day, 3);
      check(o1.length === 3 && JSON.stringify(o1) === JSON.stringify(o2), "the board's three notices are a pure function of the date and depth");
      check(JSON.stringify(dailyOffers("2026-10-03", 3)) !== JSON.stringify(o1), "a new day puts up different notices");
      let gated = true;
      for (let k = 0; k < 30; k++) for (const o of dailyOffers("2026-11-" + (k + 1), 0)) if (o.key.indexOf(":elites") >= 0 || o.key.indexOf(":home") >= 0) gated = false;
      check(gated, "a Warden who has never extracted is not asked for elites or deep extracts");

      const q = emptyQuests();
      rollover(q, day);
      const cull = { key: "daily:" + day + ":cull", kind: "daily", giver: "board", day, title: "Thin", text: "", objective: { type: "kill", count: 3 }, reward: { gold: 10, xp: 5, materials: {} } };
      const marked = { key: "daily:" + day + ":elites", kind: "daily", giver: "board", day, title: "Marked", text: "", objective: { type: "kill", elite: true, count: 1 }, reward: { gold: 10, xp: 5, materials: {} } };
      check(takeQuest(q, cull).ok && takeQuest(q, marked).ok && !takeQuest(q, cull).ok, "a notice is taken once");
      applyEvent(q, { type: "kill", archetype: "skirmisher" });
      applyEvent(q, { type: "kill", archetype: "brute" });
      check(q.active[0].progress === 2 && q.active[1].progress === 0, "plain kills count for a cull but not for an elite hunt");
      applyEvent(q, { type: "kill", archetype: "brute", elite: true });
      check(q.active[0].progress === 3 && q.active[1].progress === 1, "an elite kill counts for both");
      applyEvent(q, { type: "kill" });
      check(q.active[0].progress === 3, "progress stops at the goal");
      const hero = { level: 1, xp: 0, skillPoints: 0, purse: 5, materials: { heartwood: 0, rootfiber: 5, slag: 0, emberglass: 0 } };
      const res = claimQuest(q, cull.key, hero);
      check(res.ok && hero.purse === 15 && hero.xp === 5 && q.claimedDaily[cull.key] === day && !takeQuest(q, cull).ok, "claiming pays out and the notice cannot be taken again today");
      const deliver = { key: "request:wen-roots", kind: "request", giver: "wen", day: "", title: "Roots", text: "", objective: { type: "deliver", material: "rootfiber", count: 4 }, reward: { gold: 40, xp: 0, materials: { heartwood: 2 } } };
      takeQuest(q, deliver);
      check(isComplete(q.active.find((a) => a.key === deliver.key), hero), "a delivery is ready when the materials are in hand");
      claimQuest(q, deliver.key, hero);
      check(hero.materials.rootfiber === 1 && hero.materials.heartwood === 2 && q.doneRequests.indexOf("wen-roots") >= 0, "handing over takes the materials and pays in kind");
      const sellQ = { key: "daily:" + day + ":trade", kind: "daily", giver: "board", day, title: "Trade", text: "", objective: { type: "sell", count: 3 }, reward: { gold: 1, xp: 1, materials: {} } };
      takeQuest(q, sellQ);
      applyEvent(q, { type: "sell" });
      applyEvent(q, { type: "sell" });
      applyEvent(q, { type: "unsell" });
      check(q.active.find((a) => a.key === sellQ.key).progress === 1, "buying a sale back takes it off the count");
      const reach = { key: "daily:" + day + ":deeper", kind: "daily", giver: "board", day, title: "Down", text: "", objective: { type: "reach", floor: 4, count: 1 }, reward: { gold: 1, xp: 1, materials: {} } };
      takeQuest(q, reach);
      applyEvent(q, { type: "floor", floor: 3 });
      const reachQ = q.active.find((a) => a.key === reach.key);
      const shallow = reachQ.progress;
      applyEvent(q, { type: "floor", floor: 4 });
      check(shallow === 0 && reachQ.progress === 1, "reaching a floor counts only at that depth or below it");
      rollover(q, "2026-10-03");
      check(!q.active.some((a) => a.kind === "daily") && Object.keys(q.claimedDaily).length === 0, "at midnight the unfinished notices come down");
      for (let k = 0; k < QUEST_CAP; k++) takeQuest(q, Object.assign({}, cull, { key: "daily:x:" + k, day: "2026-10-03" }));
      check(q.active.length === QUEST_CAP && takeQuest(q, Object.assign({}, cull, { key: "daily:x:99" })).reason === "full", "the Warden carries six quests at most");

      const rq = emptyQuests();
      check(requestFor(rq, "tamsin", 0).quest.key === "request:tamsin-first" && requestFor(rq, "wen", 1) === null && requestFor(rq, "wen", 2).quest.key === "request:wen-roots", "keeper requests open with depth");
      rq.doneRequests.push("tamsin-first");
      check(requestFor(rq, "tamsin", 2) === null && requestFor(rq, "tamsin", 4).quest.key === "request:tamsin-boss", "a keeper's next request follows the last one");
      const dirty = normalizeQuests({ day: day, active: [{ key: "k", objective: { type: "nonsense" } }, { key: "ok", kind: "daily", objective: { type: "kill", count: 5 }, progress: 99, reward: { gold: 3 } }], claimedDaily: JSON.parse('{"__proto__":{"x":1},"a":"' + day + '"}'), doneRequests: ["tamsin-first", "made-up"] });
      check(dirty.active.length === 1 && dirty.active[0].progress === 5 && dirty.claimedDaily.a === day && !({}).x && dirty.doneRequests.join() === "tamsin-first", "a stored quest log is clamped and stripped of unknowns");
      const migratedV1 = migrate({ schemaVersion: 1, hero: { level: 2 }, stash: [] });
      check(migratedV1.schemaVersion === 2 && migratedV1.quests.active.length === 0, "a schema-1 ledger migrates to 2 with an empty quest log");

      // In play: the board in the square, the tracker, a claim, and a keeper's request.
      const sessionWas = { quests: rt.session.quests, purse: rt.session.purse, bestDepth: rt.session.bestDepth, devRun: rt.session.devRun };
      rt.session.quests = emptyQuests();
      rt.session.bestDepth = 3;
      rt.session.devRun = false;
      rt.questDayOverride = day;
      const board = stationNamed("Notice Board");
      check(!!board && board.panel === "board", "the notice board in the square is a station");
      player.position.set(board.x, 0, board.z);
      rt.refreshTownPrompt();
      check(rt.keyPrompt.label() === "Notice Board", "the F prompt names the Notice Board in front of it");
      tap("KeyF");
      const panelNode = document.getElementById("panel");
      const takes = panelNode.querySelectorAll('[data-act="quest-take"]');
      check(!panelNode.hidden && panelNode.querySelector(".eyebrow").textContent === "Notice Board" && takes.length === 3, "the board lists today's three notices");
      takes[0].click();
      check(rt.session.quests.active.length === 1 && panelNode.querySelectorAll('[data-act="quest-take"]').length === 2, "taking a notice moves it to your quests");
      rt.tickHud(0.016);
      const log = document.getElementById("quest-log");
      const taken = rt.session.quests.active[0];
      check(!!log && !log.hidden && log.textContent.indexOf(taken.title) >= 0, "the tracker shows the quest under the minimap");
      // Finish it by pushing the events its objective asks for.
      const o = taken.objective;
      const evt = o.type === "kill" ? { type: "kill", elite: true, boss: true } : o.type === "reach" ? { type: "floor", floor: 99 } : o.type === "extract" ? { type: "extract", floor: 99 } : o.type === "gather" ? { type: "material", material: o.material, amount: 999 } : o.type === "gold" ? { type: "gold", amount: 99999 } : o.type === "craft" ? { type: "craft", recipe: "draught-hp" } : { type: o.type };
      for (let k = 0; k < 40 && !rt.questComplete(taken); k++) rt.questEvent(evt);
      check(rt.questComplete(taken), "the quest's own events complete it (" + o.type + ")");
      player.position.set(0, 0, 0);
      rt.tickGuide(0, true);
      check(!!rt.guide && rt.guide.target === "board" && rt.guide.text.indexOf("is done") >= 0, "the guide points back to the board for a finished notice");
      rt.openPanel("board", board);
      const purseBefore = rt.session.purse;
      const claimBtn = panelNode.querySelector('[data-act="quest-claim"]');
      if (claimBtn) claimBtn.click();
      check(!!claimBtn && rt.session.purse === purseBefore + taken.reward.gold && rt.session.quests.active.length === 0, "claiming at the board pays the purse (+" + taken.reward.gold + ")");
      check(panelNode.querySelectorAll('[data-act="quest-take"]').length === 2, "a claimed notice does not come back today");
      // A keeper's request.
      rt.openPanel("trainer", stationNamed("The Circle"));
      const accept = panelNode.querySelector('[data-act="quest-take"][data-source="request"]');
      check(!!accept && panelNode.textContent.indexOf("First Blood") >= 0, "Old Tamsin offers her first request");
      if (accept) accept.click();
      for (let k = 0; k < 10; k++) rt.questEvent({ type: "kill", archetype: "skirmisher" });
      rt.openPanel("trainer", stationNamed("The Circle"));
      const handIn = panelNode.querySelector('[data-act="quest-claim"]');
      const xpBefore = rt.session.xp + rt.session.level * 1e6;
      if (handIn) handIn.click();
      check(!!handIn && rt.session.quests.doneRequests.indexOf("tamsin-first") >= 0 && rt.session.xp + rt.session.level * 1e6 > xpBefore, "handing in to Old Tamsin pays experience");
      // Saved, and dev runs do not count.
      const doc = rt.captureSaveDoc();
      check(doc.schemaVersion === 2 && doc.quests.doneRequests.indexOf("tamsin-first") >= 0, "the quest log is written into the ledger");
      rt.session.devRun = true;
      check(rt.questEvent({ type: "kill" }).length === 0, "a dev delve does not move quests");
      rt.closePanel();
      rt.session.quests = sessionWas.quests;
      rt.session.purse = sessionWas.purse;
      rt.session.bestDepth = sessionWas.bestDepth;
      rt.session.devRun = sessionWas.devRun;
      rt.questDayOverride = null;
      rt.tickHud(0.016);
      resetHero(0, 0, 0);
      rt.refreshTownPrompt();
    }

    // The Warden's own numbers: xp bar, character sheet, upgrade costs, loot rules below.
    {
      const xpBar = document.getElementById("xp-bar");
      rt.tickHud(0.016);
      check(!!xpBar && xpBar.closest("#vitals") && xpBar.textContent.indexOf("Lv " + rt.session.level) === 0, "the vitals plaque shows level and experience (" + (xpBar && xpBar.textContent) + ")");
      const levelWas = rt.session.level;
      const xpWas = rt.session.xp;
      const ptsWas = rt.session.skillPoints;
      castLine.textContent = "";
      grantXp(rt.session, xpToNext(rt.session.level) - rt.session.xp);
      rt.tickHud(0.016);
      check(rt.session.level === levelWas + 1 && castLine.textContent.indexOf("Level " + (levelWas + 1) + "!") === 0, "gaining a level says so on the cast line");
      check(xpBar.textContent.indexOf("Lv " + (levelWas + 1)) === 0 && xpBar.textContent.indexOf("pt") > 0, "the bar shows the new level and the unspent point");
      rt.session.level = levelWas;
      rt.session.xp = xpWas;
      rt.session.skillPoints = ptsWas;
      rt.tickHud(0.016);
      const ledgerLevel = rt.session.level;
      castLine.textContent = "";
      const highDoc = rt.captureSaveDoc();
      highDoc.hero.level = ledgerLevel + 3;
      rt.applySaveDoc(highDoc);
      rt.tickHud(0.016);
      check(castLine.textContent.indexOf("Level ") !== 0, "loading a higher-level ledger is not announced as a level-up");
      rt.session.level = ledgerLevel;
      rt.tickHud(0.016);

      // Upgrade status in plain words.
      const blade = { kind: "gear", slot: "weapon", ilvl: 2, themeId: 0, name: "Blade" };
      const cost = upgradeCost(2, 0);
      check(upgradeStatusText({ bestDepth: 2, purse: 999, materials: { heartwood: 9 } }, blade).indexOf("floor 3") >= 0, "the sheet says when an upgrade needs a deeper extract");
      check(upgradeStatusText({ bestDepth: 5, purse: cost.gold, materials: { heartwood: 2 } }, blade).indexOf("now") >= 0, "the sheet says when Orrin can upgrade now");
      check(upgradeStatusText({ bestDepth: 5, purse: 0, bank: 9999, materials: { heartwood: 2 } }, blade).indexOf("withdraw it at the Counting House") >= 0, "the sheet points at the bank when the gold is banked, not carried");

      // The sheet itself.
      rt.closePanel();
      const sheet = document.getElementById("sheet");
      rt.session.pack = [{ uid: "sheet-1", kind: "gear", slot: "head", rarity: 2, ilvl: 3, name: "Rare Moss Circlet", affixes: [{ id: "stout", t: 0.5 }] }];
      tap("KeyC");
      check(!!sheet && !sheet.hidden && rt.sheetOpen, "C opens the character sheet");
      const text = sheet.textContent;
      check(text.indexOf("Level ") >= 0 && text.indexOf("Purse") >= 0 && text.indexOf("Bank") >= 0 && text.indexOf("Heartwood") >= 0 && text.indexOf("Rare Moss Circlet") >= 0 && text.indexOf("Pack 1 / 24") >= 0, "the sheet lists level, gold, materials, and the pack");
      check(text.indexOf("Weapon") >= 0 && text.indexOf("ilvl") >= 0 && text.indexOf("How loot works") >= 0, "the sheet lists worn gear and the loot rules");
      check(getComputedStyle(sheet).fontFamily.toLowerCase().indexOf("sans-serif") < 0 && sheet.classList.contains("plaque"), "the sheet is a serif plaque");
      rt.tickHud(0.016);
      const guideNode = document.getElementById("guide");
      check(!guideNode || guideNode.hidden, "the guide steps aside while the sheet is open");
      tap("Escape");
      check(sheet.hidden && !rt.sheetOpen, "Escape closes the sheet");
      rt.session.pack = [];

      // Sheet tabs, the paper doll's slots, and tooltips.
      rt.openSheet("character");
      const dollSlots = sheet.querySelectorAll('.doll-stage [data-tip^="eq:"]');
      check(dollSlots.length === 6 && !!sheet.querySelector(".doll-stage .doll-frame"), "the doll stands between six worn slots (" + dollSlots.length + ")");
      const tipNode = document.getElementById("ui-tip");
      const weaponCell = sheet.querySelector('[data-tip="eq:weapon"]');
      weaponCell.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
      check(!!tipNode && !tipNode.hidden && tipNode.textContent.indexOf("ilvl") >= 0 && tipNode.textContent.indexOf("base damage") >= 0, "a worn slot's tooltip lists the piece's numbers");
      weaponCell.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
      check(tipNode.hidden, "the tooltip goes when focus leaves");
      const mightRow = sheet.querySelector('[data-tip="a:might"]');
      check(!!mightRow && mightRow.textContent.indexOf(String(Math.round(heroStats(rt.session).might))) >= 0, "the attribute column shows Might as heroStats has it");
      sheet.querySelector('[data-tab="ledger"]').click();
      const ledgerPane = sheet.querySelector('[data-pane="ledger"]');
      check(rt.sheetTab === "ledger" && !!ledgerPane && !ledgerPane.hidden && ledgerPane.textContent.indexOf("Foes slain") >= 0 && ledgerPane.textContent.indexOf("Time played") >= 0, "the Ledger tab shows the lifetime tally");
      check(sheet.querySelector('[data-pane="character"]').hidden, "only the chosen tab shows");
      tap("Escape");
      tap("KeyI");
      check(rt.sheetOpen && rt.sheetTab === "pack" && sheet.textContent.indexOf("Pack 0 / 24") >= 0, "I opens the sheet on the pack");
      tap("KeyI");
      check(!rt.sheetOpen, "I again closes it");
      rt.sheetTab = "character";

      // Lifetime tally: events in, ledger out, kept across a save.
      const tally = emptyStats();
      recordStat(tally, { type: "kill", archetype: "brute", elite: true });
      recordStat(tally, { type: "kill", archetype: "boss", boss: true });
      recordStat(tally, { type: "floor", floor: 7 });
      recordStat(tally, { type: "floor", floor: 3 });
      recordStat(tally, { type: "gold", amount: 12 });
      recordStat(tally, { type: "gear", rarity: 2 });
      recordStat(tally, { type: "sell" });
      recordStat(tally, { type: "unsell" });
      check(tally.kills === 2 && tally.elites === 1 && tally.bosses === 1 && tally.killsBy.brute === 1 && tally.killsBy.boss === 1, "kills count by kind, elites, and guardians");
      check(tally.deepestFloor === 7 && tally.goldFound === 12 && tally.gearByRarity[2] === 1 && tally.sold === 0, "depth keeps the deepest; gold, gear, and sales add up");
      const odd = normalizeStats({ kills: -4, playSeconds: "x", delveSeconds: 99, killsBy: { brute: 2.7 }, gearByRarity: [1, "2"] });
      check(odd.kills === 0 && odd.playSeconds === 0 && odd.delveSeconds === 0 && odd.killsBy.brute === 2 && odd.gearByRarity[1] === 2, "a hand-edited tally clamps instead of breaking");
      check(playTimeText(3725) === "1h 02m" && playTimeText(65) === "1m 05s" && playTimeText(9) === "9s", "play time reads as h/m/s");
      const devWas = rt.session.devRun;
      rt.session.devRun = false;
      const killsWas = rt.session.stats.kills;
      rt.questEvent({ type: "kill", archetype: "shade", floor: 1 });
      check(rt.session.stats.kills === killsWas + 1, "a kill in play lands in the tally");
      const statsDoc = rt.captureSaveDoc();
      check(statsDoc.hero.stats && statsDoc.hero.stats.kills === killsWas + 1, "the tally is written with the hero");
      statsDoc.hero.stats.kills = 4242;
      rt.applySaveDoc(statsDoc);
      check(rt.session.stats.kills === 4242, "the tally loads back from a ledger");
      rt.session.stats.kills = killsWas;
      rt.session.devRun = true;
      rt.questEvent({ type: "kill", archetype: "shade", floor: 1 });
      check(rt.session.stats.kills === killsWas, "dev floors count nothing");
      rt.session.devRun = devWas;
      check(!freshSave().hero.stats.kills && migrate({ schemaVersion: 2, hero: {} }).hero.stats.kills === 0, "old ledgers start with an empty tally");

      // Below ground: the guide states the loot rules; pickups float their amount.
      const depthWas = rt.session.bestDepth;
      rt.session.bestDepth = 0;
      rt.suspendCombat = true;
      rt.startRun(11, 1);
      rt.tickHud(0.016);
      check(!guideNode.hidden && guideNode.textContent.indexOf("hold X") >= 0, "below ground the guide explains extracting");
      let floated = "";
      const pushWas = rt.pushFloater;
      rt.pushFloater = (t) => { floated = t; };
      rt.questEvent({ type: "gold", amount: 7 });
      rt.pushFloater = pushWas;
      check(floated === "+7 gold", "picking up gold floats the amount (" + floated + ")");
      rt.arriveTown("extract");
      rt.suspendCombat = false;
      rt.session.bestDepth = depthWas;
      rt.tickHud(0.016);
    }

    // Shifts: keepers and vendors work by day, go out in the evening, and some go home at night.
    {
      const folk = rt.townfolk;
      const staff = folk.filter((f) => f.kind === "keeper");
      const vendors = folk.filter((f) => f.vendor);
      const kids = folk.filter((f) => f.role === "child");
      check(vendors.length === VENDORS.length && vendors.every((f) => f.mode === "post"), "three market vendors stand at their stalls by day");
      check(kids.length === 3 && kids.every((f) => (f.def.look.height || 1) < 0.75), "three children run about the square");
      check(shiftPart(0.5) === "day" && shiftPart(0.78) === "evening" && shiftPart(0.9) === "night" && shiftPart(0.1) === "night", "the day splits into day, evening, and night shifts");
      const cols = staticTownColliders();
      let routesOk = true;
      for (const f of staff) {
        if (!f.route || f.route.length < 2) routesOk = false;
        for (let k = 0; f.route && k + 1 < f.route.length; k++) if (!segmentClear(cols, f.route[k].x, f.route[k].z, f.route[k + 1].x, f.route[k + 1].z, 0.25)) routesOk = false;
      }
      check(routesOk, "every keeper and vendor has a clear way between the door and the post");
      const orrin = rt.keeperAt("orrin");
      const pell = rt.keeperAt("pell");
      const maud = rt.keeperAt("maud");
      const hesk = rt.keeperAt("hesk");
      const smith = BUILDINGS.find((b) => b.id === "smith");
      const run = (phase, steps, until) => {
        rt.townClock.phase = phase;
        for (let k = 0; k < steps; k++) {
          rt.tickTownfolk(0.033, k * 0.033);
          if (until && until()) return k;
        }
        return steps;
      };
      rt.resetInterior();
      player.position.set(0, 0, 0);
      run(0.78, 2400, () => orrin.mode === "away" && maud.mode === "away");
      check(orrin.mode === "away" && !insideRect(smith, orrin.x, orrin.z, 0) && maud.mode === "away", "in the evening Orrin and Maud leave their shops");
      check(pell.mode === "post", "Pell never leaves the bar");
      // Walk into the Quench: Orrin comes back to the anvil.
      const sp = stationWorld(smith);
      player.position.set(sp.x, FLOOR_Y, sp.z);
      rt.update(0.016);
      const back = run(0.78, 4000, () => orrin.mode === "post");
      check(orrin.mode === "post" && Math.hypot(orrin.x - orrin.post.x, orrin.z - orrin.post.z) < 1e-6, "walking into the Quench brings Orrin back to his anvil (" + back + " steps)");
      // Night: Orrin walks home to his cottage; the vendors pack up.
      player.position.set(0, 0, 0);
      rt.update(0.016);
      rt.resetInterior();
      const home = COTTAGES.find((c) => c.id === "cottage-1");
      run(0.9, 9000, () => orrin.mode === "away" && orrin.w && insideRect(home, orrin.x, orrin.z, 0.3));
      check(orrin.mode === "away" && insideRect(home, orrin.x, orrin.z, 0.3), "at night Orrin sleeps in his cottage");
      check(hesk.mode !== "post", "at night Hesk has left the apple stall");
      // Morning: everyone back at work.
      run(0.5, 12000, () => staff.every((f) => f.mode === "post"));
      check(staff.every((f) => f.mode === "post"), "by day every keeper and vendor is back at the post");
      rt.townClock.phase = 0.5;
      applyTownTime(scene, rt, 0.5, rt.nightMats);
      resetHero(0, 0, 0);
      rt.refreshTownPrompt();
    }

    // Day and night: noon is the locked palette; midnight is dark with lit windows.
    {
      const noon = townDayKeys(0.5);
      check(noon.a.bg === 0xd5e4b8 && noon.b.bg === 0xd5e4b8, "noon uses the locked town palette");
      applyTownTime(scene, rt, 0.0, rt.nightMats);
      const nightBg = scene.background.clone();
      const nightWin = rt.nightMats.windows[0].emissiveIntensity;
      const nightLamp = rt.nightMats.lamp.emissiveIntensity;
      applyTownTime(scene, rt, 0.5, rt.nightMats);
      check(nightBg.r + nightBg.g + nightBg.b < 0.8 && scene.background.getHex() === 0xd5e4b8, "midnight is dark and noon returns exactly");
      check(nightWin > rt.nightMats.windows[0].emissiveIntensity + 0.5 && nightLamp > rt.nightMats.lamp.emissiveIntensity + 0.8, "windows and lanterns glow at night");
      const hemiNoon = scene.children.find((o) => o.isHemisphereLight);
      check(hemiNoon.color.getHex() === 0xc5e4ff && Math.abs(hemiNoon.intensity - 0.72) < 1e-6, "noon hemisphere light is the locked value");
    }

    // Ambience: smoke, hens in their yards, pets on the paths, seats taken.
    {
      check(!!rt.smoke && rt.smoke.count >= 7 * 10 && rt.smoke.mesh.material.flatShading === true, "chimneys smoke (" + (rt.smoke && rt.smoke.count) + " puffs)");
      const graph = buildTownGraph();
      let henOk = true;
      for (let k = 0; k < 600; k++) rt.tickAmbience(0.033, k * 0.033);
      for (const e of rt.hens) {
        const home = e.h.home;
        if (Math.hypot(e.h.x - home.x, e.h.z - home.z) > 2.0) henOk = false;
        if (clearanceAt(graph.colliders, e.h.x, e.h.z) < 0.1) henOk = false;
      }
      check(rt.hens.length === HEN_YARDS.length * 2 && henOk, "hens stay in their yards and out of the fences");
      check(rt.pets.length === 3 && rt.pets.every((pt) => clearanceAt(graph.colliders, pt.w.x, pt.w.z) >= FOLK_RADIUS - 1e-3), "two cats and a dog roam the paths");
      const seatNode = graph.nodes.find((nd) => nd.seat && nd.inside === "inn");
      check(!!seatNode, "the inn has stools to sit on");
      const sitter = createWalker(WANDERERS[1], graph, 77);
      sitter.mode = "walk";
      const firstPath = [seatNode.i];
      sitter.x = seatNode.x + 0.3;
      sitter.z = seatNode.z;
      sitter.path = firstPath;
      for (let k = 0; k < 20; k++) stepWalker(sitter, 0.033, graph, false);
      check(sitter.mode === "linger" && sitter.seat === seatNode.seat, "a patron who reaches a stool takes the seat");
      check(yardCenter(COTTAGES[0]) && townTier(rt.session.bestDepth) >= 0, "yards and tiers are pure data");
    }

    {
      const sp = besideStation("The Quench", 1.6);
      player.position.x = sp.x;
      player.position.z = sp.z;
      rt.refreshTownPrompt();
      check(rt.keyPrompt.label() === "The Quench", "the F prompt names The Quench within 2.4 of the smith's anvil (" + rt.keyPrompt.label() + ")");
    }

    // Townsfolk: keepers at their counters, wanderers on a connected, clear graph.
    {
      const folk = rt.townfolk || [];
      const keepers = folk.filter((f) => f.kind === "keeper" && !f.vendor);
      const walkers = folk.filter((f) => f.kind === "walker");
      check(keepers.length === KEEPERS.length && walkers.length === WANDERERS.length && folk.every((f) => f.v.root.parent === rt.townRoot), "every keeper and wanderer lives under townRoot (" + keepers.length + " + " + walkers.length + ")");
      let posted = true;
      for (const k of keepers) {
        const at = buildingAt(k.x, k.z);
        if (!at || at.id !== k.building.id) posted = false;
      }
      check(posted, "every keeper stands inside their own building");
      let flat = true;
      for (const f of folk) f.v.root.traverse((o) => { if (o.isMesh && (!o.material.flatShading || o.material.type !== "MeshLambertMaterial")) flat = false; });
      check(flat, "townsfolk are flat-shaded Lambert");
      const graph = buildTownGraph();
      const seen = new Set([0]);
      const queue = [0];
      while (queue.length) {
        const u = queue.pop();
        for (const e of graph.edges[u]) if (!seen.has(e.to)) { seen.add(e.to); queue.push(e.to); }
      }
      check(seen.size === graph.nodes.length, "the town waypoint graph is connected (" + seen.size + "/" + graph.nodes.length + ")");
      let edgesClear = true;
      for (let a = 0; a < graph.nodes.length; a++) {
        for (const e of graph.edges[a]) {
          const na = graph.nodes[a];
          const nb = graph.nodes[e.to];
          if (!segmentClear(graph.colliders, na.x, na.z, nb.x, nb.z, FOLK_RADIUS)) edgesClear = false;
        }
      }
      check(edgesClear, "every waypoint edge is clear of walls and props for a villager");
      const a1 = createWalker(WANDERERS[0], graph, 1234);
      const a2 = createWalker(WANDERERS[0], graph, 1234);
      let stuck = 0;
      const crowd = WANDERERS.map((d, i) => createWalker(d, graph, 900 + i));
      for (let k = 0; k < 3600; k++) {
        stepWalker(a1, 0.033, graph, false);
        stepWalker(a2, 0.033, graph, false);
        for (const w of crowd) {
          stepWalker(w, 0.033, graph, false);
          if (clearanceAt(graph.colliders, w.x, w.z) < FOLK_RADIUS - 1e-3) stuck++;
        }
      }
      check(a1.x === a2.x && a1.z === a2.z && a1.node === a2.node, "the same seed walks the same route");
      check(stuck === 0, "two simulated minutes: no villager inside a wall or prop (" + stuck + ")");
      check(crowd.some((w) => w.node !== crowd[0].node), "villagers spread out across town");

      // Hero bumps into a villager rather than through them.
      rt.townfolkSolid = true;
      const w0 = walkers[0];
      const pushed = rt.resolveColliders(w0.x + 0.1, w0.z, 0.42);
      check(Math.hypot(pushed.x - w0.x, pushed.z - w0.z) >= 0.42 + FOLK_RADIUS - 1e-3, "the hero cannot walk through a villager");
      rt.townfolkSolid = false;

      // Walk up to Maud: she turns to face the hero and greets them.
      const maud = rt.keeperAt("maud");
      maud.lastBark = -1e9;
      maud.near = false;
      if (rt.barks) rt.barks.clear();
      const sp = besideStation("Bramble & Board", 0);
      player.position.set(sp.x, 0, sp.z);
      for (let k = 0; k < 60; k++) rt.update(0.016);
      const toHero = Math.atan2(-(player.position.x - maud.x), -(player.position.z - maud.z));
      const yawErr = Math.abs(Math.atan2(Math.sin(maud.yaw - toHero), Math.cos(maud.yaw - toHero)));
      check(yawErr < 0.2, "Maud turns to face the hero at her counter (" + yawErr.toFixed(2) + ")");
      check(rt.barks && rt.barks.has("maud") && rt.barks.text("maud").indexOf("Maud Bramble") === 0, "Maud greets the hero with a named bark");
      const barkNode = document.querySelector("#barks .bark");
      check(!!barkNode && !barkNode.querySelector("script") && getComputedStyle(barkNode).fontFamily.toLowerCase().indexOf("sans-serif") < 0, "barks are serif plaques built from text");
      const orrin = rt.keeperAt("orrin");
      check(orrin.near === false && !rt.barks.has("orrin"), "keepers in other buildings stay quiet");
      rt.barks.clear();
      rt.resetInterior();

      // Out in the streets one greeting does not set off the next villager.
      {
        const realRandom = Math.random;
        Math.random = () => 0;
        const outdoor = rt.townfolk.filter((f) => f.kind === "walker" && !buildingAt(f.x, f.z));
        const saved = rt.townfolk.map((f) => [f, f.lastBark, f.near]);
        for (const f of rt.townfolk) f.lastBark = 1e9;
        rt.barks.clear();
        rt.resetGreetings();
        const a = outdoor[0];
        const b = outdoor[1];
        let first = false;
        let second = false;
        if (a && b) {
          a.near = false;
          a.lastBark = -1e9;
          player.position.set(a.x + 1, 0, a.z);
          rt.update(0.016);
          first = rt.barks.has(a.id);
          b.near = false;
          b.lastBark = -1e9;
          player.position.set(b.x + 1, 0, b.z);
          rt.update(0.016);
          second = rt.barks.has(b.id);
        }
        check(!!a && !!b && first && !second, "only one unprompted street greeting at a time (" + first + ", " + second + ")");
        Math.random = realRandom;
        for (const [f, last, near] of saved) {
          f.lastBark = last;
          f.near = near;
        }
        rt.barks.clear();
        rt.resetInterior();
      }
    }
    resetHero(0, 0, 0);
    rt.camYaw = 0.42;
    rt.camPitch = 0.38;
    rt.camDist = 7.6;
    placeCamera(0, true);
    rt.refreshTownPrompt();

    // ES Math.round is half-up for positive values: positive halves round away
    // from zero via floor(x+0.5). enemyBudget uses Math.round, so floor 10's
    // 4 + 10 * 0.85 = 12.5 becomes 13.
    check(Math.round(12.5) === 13 && Math.floor(12.5 + 0.5) === 13, "ES Math.round half-up (12.5 → 13)");
    lines.push("note: ES Math.round half-up for positive values; enemyBudget rounds halves away from zero via floor(x+0.5).");

    const table = [
      [1, 17, 8, 38, 91, 304, 8, 4, 12, 0, 512, 2712],
      [5, 17, 12, 78, 187, 624, 17, 9, 28, 0, 560, 2760],
      [10, 17, 17, 128, 307, 1024, 28, 14, 48, 0, 620, 2820],
      [25, 21, 32, 278, 667, 2224, 61, 31, 108, 207, 1007, 3207],
      [50, 25, 36, 528, 1267, 4224, 116, 58, 208, 295, 1395, 3595],
      [100, 27, 36, 1028, 2467, 8224, 226, 113, 408, 470, 2170, 4370]
    ];
    for (let i = 0; i < table.length; i++) {
      const [n, span, budget, hp, ehp, bhp, dmg, gold, xp, epic, rare, unc] = table[i];
      const cuts = rarityCuts(n);
      check(floorSpan(n) === span, "floor " + n + " span " + floorSpan(n) + " === " + span);
      check(enemyBudget(n) === budget, "floor " + n + " budget " + enemyBudget(n) + " === " + budget);
      check(skirmisherHp(n) === hp, "floor " + n + " skirm hp " + skirmisherHp(n) + " === " + hp);
      check(Math.round(skirmisherHp(n) * 2.4) === ehp, "floor " + n + " elite hp " + Math.round(skirmisherHp(n) * 2.4) + " === " + ehp);
      check(skirmisherHp(n) * 8 === bhp, "floor " + n + " boss hp " + skirmisherHp(n) * 8 + " === " + bhp);
      check(skirmisherDmg(n) === dmg, "floor " + n + " skirm dmg " + skirmisherDmg(n) + " === " + dmg);
      check(killGold(n) === gold, "floor " + n + " gold " + killGold(n) + " === " + gold);
      check(killXp(n) === xp && enemyLevel(n) === n, "floor " + n + " xp " + killXp(n) + " level " + enemyLevel(n));
      check(cuts.epic === epic && cuts.rare === rare && cuts.uncommon === unc, "floor " + n + " cuts " + cuts.epic + "/" + cuts.rare + "/" + cuts.uncommon);
    }
    check(eliteCount(1) === 0 && eliteCount(4) === 1 && eliteCount(5) === 0 && eliteCount(16) === 2, "elite counts 0, 1, 0, 2");
    check(xpToNext(1) === 38 && xpToNext(10) === 1100, "xpToNext 38 and 1100");
    let xpPool = 5 * killXp(1);
    let level = 1;
    let points = 0;
    while (xpPool >= xpToNext(level)) {
      xpPool -= xpToNext(level);
      level += 1;
      points += 1;
    }
    check(level === 2 && xpPool === 22 && points === 1, "five floor-1 kills reach level 2 with 22 xp");
    check(upgradeGold(1) === 56 && upgradeGold(5) === 264 && upgradeGold(10) === 704, "upgradeGold 56, 264, 704");
    const cost1 = upgradeCost(1, 0);
    const cost10 = upgradeCost(10, 0);
    check(cost1.gold === 56 && cost1.materials.heartwood === 2, "upgradeCost ilvl 1 theme 0 is 56 gold and 2 heartwood");
    check(cost10.gold === 704 && cost10.materials.slag === 2 && cost10.materials.emberglass === 1, "upgradeCost ilvl 10 pays slag and emberglass");
    check(dropIlvl(10, "normal") === 10 && dropIlvl(10, "elite") === 11 && dropIlvl(10, "boss") === 12, "dropIlvl normal 10, elite 11, boss 12");
    const keen = affixValue({ min: 8, max: 18 }, { id: "keen", t: 0 }, 1);
    check(Math.abs(keen - 9.533653846153846) < 1e-9, "affixValue keen t=0 ilvl 1");
    const might = 9 + 1;
    const guard = 9 + 1;
    const focus = 9 + 1;
    check(might === 10 && guard === 10 && focus === 10, "naked level 1 Might Guard Focus are 10");
    check(40 + might * 8 + guard * 4 === 160 && 20 + focus * 6 === 80, "naked level 1 pools 160 hp and 80 mana");
    check(40 + 11 * 8 + 11 * 4 === 172 && 20 + 11 * 6 === 86, "level 2 naked pools 172 hp and 86 mana");
    const mitigated = incomingDamage(8, 10, 0);
    check(mitigated.hpLoss === 7 && mitigated.wardLeft === 0, "guard 10 mitigates 8 raw to 7");

    const half = 50 * Math.PI / 180;
    const arcOrigin = { x: 0, z: 0 };
    const arcForward = { x: 0, z: -1 };
    check(arcHit(arcOrigin, arcForward, { x: 0, z: -2 }, 2.1, half, 0), "arcHit hits a target 2.0 m along local -z");
    check(!arcHit(arcOrigin, arcForward, { x: 0, z: 2 }, 2.1, half, 0), "arcHit misses a target 2.0 m along local +z");

    const strike = strikeDamage({ level: 1, tracks: { edge: 0 } }, { weaponBase: 12, ilvl: 1, affixes: [] });
    check(strike === 17, "level-1 strikeDamage is 17 with Might 10 and Edge 0 (" + strike + ")");
    check(strikeDamage({ level: 1, tracks: { edge: 0 } }, null) === 0, "unarmed strikeDamage is 0");

    let sameDrop = true;
    let seeded = null;
    for (let id = 0; id < 80; id++) {
      const spec = { floorIndex: 10, spawnId: id, kind: "normal", ordinal: 0 };
      const a = rollGearDrop(lootRng(4, 10, id), spec);
      const b = rollGearDrop(lootRng(4, 10, id), spec);
      if (JSON.stringify(a) !== JSON.stringify(b)) sameDrop = false;
      if (a && !seeded) seeded = a;
    }
    check(sameDrop && !!seeded && seeded.ilvl === 10 && seeded.uid.indexOf("drop-10-") === 0 && seeded.uid.endsWith("-0"), "same seed produces the same drop (" + (seeded ? seeded.uid : "none") + ")");
    const bossDrop = rollGearDrop(lootRng(1, 10, 0), { floorIndex: 10, spawnId: 0, kind: "boss", ordinal: 0 });
    check(!!bossDrop && bossDrop.ilvl === 12 && bossDrop.rarity >= 2 && bossDrop.uid === "drop-10-0-0" && !Object.prototype.hasOwnProperty.call(bossDrop, "identified") && typeof bossDrop.name === "string" && bossDrop.affixes.length >= 2, "a floor-10 boss drop is identified at ilvl 12");
    let earlyEpic = false;
    let badAffix = "";
    let rich = null;
    let paired = null;
    for (let n = 1; n < 15; n++) {
      for (let id = 0; id < 20; id++) {
        const item = rollGearDrop(lootRng(n * 19 + 3, n, id), { floorIndex: n, spawnId: id, kind: "boss", ordinal: 0 });
        if (item && item.rarity >= 3) earlyEpic = true;
      }
    }
    for (let id = 0; id < 240; id++) {
      const item = rollGearDrop(lootRng(8, 25, id), { floorIndex: 25, spawnId: id, kind: "normal", ordinal: 0 });
      if (!item) continue;
      const seen = Object.create(null);
      for (let i = 0; i < item.affixes.length; i++) {
        const affix = item.affixes[i];
        const keys = Object.keys(affix).sort().join(",");
        if (keys !== "id,t") badAffix = keys;
        const def = affixDef(affix.id);
        if (!def || def.slots.indexOf(item.slot) < 0) badAffix = (affix.id || "?") + " on " + item.slot;
        if (seen[affix.id]) badAffix = "dup " + affix.id;
        seen[affix.id] = true;
      }
      if (item.ilvl !== 25) badAffix = "ilvl " + item.ilvl;
      if (!rich && item.affixes.length) rich = item;
      if (!paired && item.affixes.length >= 2) paired = item;
    }
    check(!earlyEpic, "epic cannot roll before floor 15");
    check(!badAffix && !!paired && paired.affixes[0].id !== paired.affixes[1].id, "two affixes on one item differ and every id is legal (" + badAffix + ")");
    const heirs = freshSave().hero.equipped;
    check(heirs.weapon && heirs.weapon.themeId === 0 && heirs.offhand.themeId === 0 && heirs.head.themeId === 0 && heirs.body.themeId === 0 && heirs.feet.themeId === 0 && heirs.trinket === null && heirs.weapon.weaponBase === 12 && heirs.weapon.baseId === "blade", "themeId 0 heirloom");
    const nakedGear = gearTotals(heirs);
    check(nakedGear.might === 0 && nakedGear.guard === 0 && nakedGear.focus === 0 && nakedGear.flatHp === 0 && nakedGear.flatMp === 0, "heirlooms add no Might, Guard, Focus, or flat pools");
    const keptT = rich.affixes[0].t;
    const richDef = affixDef(rich.affixes[0].id);
    const readAt = affixValue(richDef, rich.affixes[0], rich.ilvl);
    rich.ilvl += 1;
    const readNext = affixValue(richDef, rich.affixes[0], rich.ilvl);
    check(rich.affixes[0].t === keptT && readNext !== readAt, "affix t is stable across an ilvl read");

    const wounded = { hp: 10 };
    applyDamage(wounded, 50);
    check(wounded.hp === 0, "applyDamage clamps HP at 0");
    check(wounded.deathLock === true && wounded.deathTransitions === 1, "death transition when HP goes from above 0 to 0");
    applyDamage(wounded, 50);
    check(wounded.hp === 0 && wounded.deathTransitions === 1, "death lock does not start a second transition");
    const fine = { hp: 30 };
    applyDamage(fine, 12);
    check(fine.hp === 18 && !fine.deathLock && !fine.deathTransitions, "a hit that leaves HP above 0 is not death");
    const already = { hp: 0 };
    applyDamage(already, 4);
    check(already.hp === 0 && !already.deathLock, "HP already 0 does not start the death transition");

    const cell0 = tileToWorld(0, 0, 7, 7);
    const cellMid = tileToWorld(3, 3, 7, 7);
    check(cell0.x === -12 && cell0.z === -12, "tileToWorld centers the corner of a 7x7 floor");
    check(cellMid.x === 0 && cellMid.z === 0, "tileToWorld puts the grid center at the origin");

    function inRoom(room, col, row) {
      return col >= room.col && row >= room.row && col < room.col + room.w && row < room.row + room.h;
    }
    function reached(plan) {
      const cols = plan.cols;
      const rows = plan.rows;
      const tiles = plan.tiles;
      const seen = new Uint8Array(tiles.length);
      const start = plan.entrance.row * cols + plan.entrance.col;
      if (tiles[start] !== 1) return false;
      seen[start] = 1;
      const q = [start];
      let qi = 0;
      while (qi < q.length) {
        const i = q[qi++];
        const r = (i / cols) | 0;
        const c = i - r * cols;
        if (c > 0 && tiles[i - 1] === 1 && !seen[i - 1]) {
          seen[i - 1] = 1;
          q.push(i - 1);
        }
        if (c + 1 < cols && tiles[i + 1] === 1 && !seen[i + 1]) {
          seen[i + 1] = 1;
          q.push(i + 1);
        }
        if (r > 0 && tiles[i - cols] === 1 && !seen[i - cols]) {
          seen[i - cols] = 1;
          q.push(i - cols);
        }
        if (r + 1 < rows && tiles[i + cols] === 1 && !seen[i + cols]) {
          seen[i + cols] = 1;
          q.push(i + cols);
        }
      }
      for (let i = 0; i < tiles.length; i++) if (tiles[i] === 1 && !seen[i]) return false;
      return true;
    }
    function canon(plan) {
      let tiles = "";
      for (let i = 0; i < plan.tiles.length; i++) tiles += plan.tiles[i] ? "1" : "0";
      let spawns = "";
      for (let i = 0; i < plan.spawns.length; i++) {
        const s = plan.spawns[i];
        spawns += s.id + "@" + s.col + "," + s.row + ";";
      }
      return tiles + "#e" + plan.entrance.col + "," + plan.entrance.row + "#s" + plan.stairs.col + "," + plan.stairs.row + "#r" + plan.stairsRoomId + "#" + spawns;
    }

    setSealedThrows(true);
    const floors = [1, 5, 10, 25, 50, 100];
    let spawnFail = "";
    let reachFail = "";
    let bossFail = "";
    let detFail = "";
    let layoutFail = "";
    let safeFail = "";
    let lastGenMs = 0;
    let maxGenMs = 0;
    const random = Math.random;
    let randomCalls = 0;
    Math.random = function () {
      randomCalls++;
      return random();
    };
    try {
      for (let fi = 0; fi < floors.length; fi++) {
        const n = floors[fi];
        const need = Math.min(36, enemyBudget(n));
        for (let seed = 1; seed <= 50; seed++) {
          const t0 = performance.now();
          let plan = null;
          try {
            plan = generateFloor(seed, n);
          } catch (err) {
            layoutFail = layoutFail || "seed " + seed + " floor " + n + " threw " + (err && err.message ? err.message : err);
            continue;
          }
          const ms = performance.now() - t0;
          lastGenMs = ms;
          if (ms > maxGenMs) maxGenMs = ms;
          if (ms > 40 && !layoutFail) layoutFail = "seed " + seed + " floor " + n + " took " + ms.toFixed(3) + " ms";
          const again = generateFloor(seed, n);
          if (canon(plan) !== canon(again) && !detFail) detFail = "seed " + seed + " floor " + n + " diverged";
          if (!reached(plan) && !reachFail) reachFail = "seed " + seed + " floor " + n + " has a sealed cell";
          if ((plan.stairs.col === plan.entrance.col && plan.stairs.row === plan.entrance.row) && !reachFail) {
            reachFail = "seed " + seed + " floor " + n + " stairs are the entrance";
          }
          if (plan.spawns.length !== need && !spawnFail) {
            spawnFail = "seed " + seed + " floor " + n + " spawns " + plan.spawns.length + " !== " + need;
          }
          if (plan.spawns.length > 36 && !spawnFail) spawnFail = "seed " + seed + " floor " + n + " exceeds 36";
          const stairRoom = plan.rooms.find((room) => room.id === plan.stairsRoomId);
          const boss = plan.spawns.filter((s) => s.boss);
          if (n % 5 === 0) {
            const cellOk = boss.length === 1 && boss[0].col === plan.stairs.col && boss[0].row === plan.stairs.row;
            const inside = stairRoom && inRoom(stairRoom, plan.stairs.col, plan.stairs.row);
            if ((!cellOk || !inside) && !bossFail) {
              bossFail = "seed " + seed + " floor " + n + " boss/stairs mismatch";
            }
          }
          for (let s = 0; s < plan.spawns.length; s++) {
            if (inRoom(plan.rooms[0], plan.spawns[s].col, plan.spawns[s].row) && !spawnFail) {
              spawnFail = "seed " + seed + " floor " + n + " spawned inside the entrance room";
            }
            const gap = Math.hypot(plan.spawns[s].col - plan.entrance.col, plan.spawns[s].row - plan.entrance.row) * 4;
            if (gap < SAFE_RADIUS && !safeFail) safeFail = "seed " + seed + " floor " + n + " spawn " + s + " at " + gap.toFixed(1) + " m";
          }
        }
      }
      const tDeep = performance.now();
      let deep = null;
      try {
        deep = generateFloor(1, 1000);
      } catch (err) {
        layoutFail = layoutFail || "floor 1000 threw " + (err && err.message ? err.message : err);
      }
      const deepMs = performance.now() - tDeep;
      lastGenMs = deepMs;
      if (deepMs > maxGenMs) maxGenMs = deepMs;
      if (deepMs > 40 && !layoutFail) layoutFail = "floor 1000 took " + deepMs.toFixed(3) + " ms";
      if (deep) {
        const deepRoom = deep.rooms.find((room) => room.id === deep.stairsRoomId);
        check(deep.cols === 27 && deep.enemyBudget === 36 && deep.spawns.length === 36, "floor 1000 span 27 budget 36 spawns 36");
        check(!!deepRoom && inRoom(deepRoom, deep.stairs.col, deep.stairs.row), "floor 1000 stairs sit inside a room");
        check(canon(deep) === canon(generateFloor(1, 1000)), "floor 1000 plan is deterministic");
      }
      const pairA = generateFloor(0xa11ce, 10);
      const pairB = generateFloor(0xa11ce, 10);
      check(canon(pairA) === canon(pairB), "generateFloor(0xA11CE, 10) matches a second call");
      check(canon(pairA) !== canon(generateFloor(0xa11ce, 11)), "a different floor index changes the plan");
    } finally {
      Math.random = random;
      setSealedThrows(false);
    }
    check(!spawnFail, "spawns.length === min(36, enemyBudget) for seeds 1..50" + (spawnFail ? " (" + spawnFail + ")" : ""));
    check(!reachFail, "every floor cell is reachable from the entrance" + (reachFail ? " (" + reachFail + ")" : ""));
    check(!safeFail && SAFE_RADIUS > 9, "no planned spawn within SAFE_RADIUS of the entrance, beyond 9 m aggro" + (safeFail ? " (" + safeFail + ")" : ""));
    check(!bossFail, "boss cell equals the stairs cell inside stairsRoomId" + (bossFail ? " (" + bossFail + ")" : ""));
    check(!detFail, "same seed and floor rebuild the same tiles, entrance, stairs, and spawn ids" + (detFail ? " (" + detFail + ")" : ""));
    check(randomCalls === 0, "floor generation does not call Math.random (" + randomCalls + ")");
    check(!layoutFail && maxGenMs <= 40, "layout fails only above 40 ms" + (layoutFail ? " (" + layoutFail + ")" : ""));
    lines.push("lastGenMs " + lastGenMs.toFixed(3));
    const meters = ((window.__game = window.__game || {}).meters = (window.__game && window.__game.meters) || {});
    meters.lastGenMs = lastGenMs;

    let lastMeshMs = 0;
    let meshOver = "";
    function noteMesh(label) {
      const ms = rt.meters.lastMeshMs;
      lastMeshMs = ms;
      if (ms > 60 && !meshOver) meshOver = label + " took " + ms.toFixed(3) + " ms";
    }

    rt.freshGame();
    check(rt.session.run === null && rt.space === "town", "a fresh game has no run and stands in town");
    rt.questMarks.refresh();
    const tamsinMark = rt.scene.getObjectByName("questMark:tamsin");
    check(rt.questMarks.stateOf("tamsin") === "bang" && !!tamsinMark && tamsinMark.visible && tamsinMark.getObjectByName("questBang").visible, "Old Tamsin wears a yellow ! for her first request");
    check(rt.questMarks.stateOf("maud") === "" && !rt.scene.getObjectByName("questMark:maud").visible, "a keeper with nothing to offer yet wears no mark");
    check(rt.vitals.hp === rt.vitals.hpMax && rt.vitals.hpMax === 160, "fresh health is the maximum 160 (" + rt.vitals.hp + "/" + rt.vitals.hpMax + ")");
    check(rt.vitals.mp === rt.vitals.mpMax && rt.vitals.mpMax === 80, "fresh mana is the maximum 80 (" + rt.vitals.mp + "/" + rt.vitals.mpMax + ")");
    check(window.__game.generateFloor === generateFloor && window.__game.balance && window.__game.balance.arcHit === arcHit, "window.__game exposes generateFloor and balance");
    check(typeof window.__game.arriveTown === "function" && window.__game.space === "town", "window.__game.arriveTown and space read the live session");

    const pumpNow = performance.now();
    rt.pumpFrame(pumpNow);
    keys.KeyW = true;
    keys.ShiftLeft = true;
    const pumpFrom = player.position.clone();
    const cappedDt = rt.pumpFrame(pumpNow + 500);
    const pumpMoved = Math.hypot(player.position.x - pumpFrom.x, player.position.z - pumpFrom.z);
    keys.KeyW = false;
    keys.ShiftLeft = false;
    check(Math.abs(cappedDt - 0.033) < 1e-9, "pumpFrame caps dt at 0.033 (" + cappedDt + ")");
    check(pumpMoved <= 11.5 * 0.033 + 0.05, "a capped sprint step stays within 11.5 m/s (" + pumpMoved.toFixed(3) + ")");

    vitals.mp = 5;
    cdLeft[5] = 0;
    const emptySlot = tryAbility(5);
    check(!emptySlot.ok && emptySlot.reason === "empty" && vitals.mp === 5 && cdLeft[5] === 0, "slot 6 is empty and does nothing");
    check(!slots[5] && !rt.abilityTip(5), "the unused ability has no slot and no tooltip");
    // Debug keys: F2 hides the UI, F3 reports where the Warden is.
    if (rt.setUiHidden && rt.locationReport) {
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "F2", bubbles: true }));
      const hudHidden = getComputedStyle(document.getElementById("hud")).display === "none" && getComputedStyle(rt.renderer.domElement).display !== "none";
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "F2", bubbles: true }));
      check(hudHidden && !rt.uiHidden && getComputedStyle(document.getElementById("hud")).display !== "none", "F2 hides the UI and shows it again, the 3D view stays");
      const rep = rt.locationReport();
      check(rep.url.indexOf("?dev=1&at=") > 0 && rep.text.indexOf("character level") >= 0 && rep.text.indexOf("storey") >= 0, "F3's report names the spot, storey and level and carries a dev URL back to it");
    }
    check(rt.DECOR && rt.DECOR.join(",") === "flowers,grass,mushrooms,flame", "decor list is flowers, grass, mushrooms, flame");

    check(!rt.colliderOverlay, "collider overlay stays off without ?dev=1");
    rt.dev = true;
    rt.syncColliderOverlay();
    check(!!rt.colliderOverlay && rt.colliderOverlay.children.length === rt.colliders.length, "dev overlay child count matches town colliders (" + (rt.colliderOverlay ? rt.colliderOverlay.children.length : 0) + ")");
    const overlayMat = rt.colliderOverlay && rt.colliderOverlay.children[0] && rt.colliderOverlay.children[0].material;
    check(!!overlayMat && overlayMat.color.getHex() === 0xe2ba60 && overlayMat.flatShading === true, "overlay is gold and flat shaded");
    rt.dev = false;
    rt.syncColliderOverlay();
    check(!rt.colliderOverlay, "turning dev off removes the overlay");

    let stored = 0;
    const randomFn = Math.random;
    const setItem = localStorage.setItem.bind(localStorage);
    localStorage.setItem = function () {
      stored++;
      return setItem.apply(localStorage, arguments);
    };
    function countRandom(fn) {
      let n = 0;
      Math.random = function () {
        n++;
        return 0;
      };
      try {
        fn();
      } finally {
        Math.random = randomFn;
      }
      return n;
    }
    {
      // Walking through the gate's portal starts a delve; standing on the gate line does not.
      rt.freshGame();
      const gateSt = rt.stations.find((st) => st.id === "gate");
      const o = gateSt && gateSt.opening;
      check(!!gateSt && !!gateSt.portal && gateSt.portal.veil.isMesh && gateSt.portal.veil.visible, "the gate opening holds a portal veil");
      if (o) {
        rt.resetInterior();
        player.position.set(o.x, 0, o.z + 0.6);
        rt.update(0.016);
        player.position.set(o.x, 0, o.z);
        rt.update(0.016);
        check(rt.space === "town", "standing on the gate line does not delve");
        player.position.set(o.x + 2.6, 0, o.z + 0.4);
        rt.update(0.016);
        player.position.set(o.x + 2.6, 0, o.z - 0.4);
        rt.update(0.016);
        check(rt.space === "town", "passing beside the gate does not delve");
        player.position.set(o.x, 0, o.z + 0.4);
        rt.update(0.016);
        player.position.set(o.x, 0, o.z - 0.3);
        rt.update(0.016);
        check(!!rt.transit && rt.space === "town", "walking through the portal starts the transit");
        player.position.set(o.x, 0, o.z + 0.4);
        rt.update(0.016);
        check(!!rt.transit, "stepping back mid-transit does not start a second one");
        for (let i = 0; i < 60 && rt.transit; i++) rt.update(0.05);
        check(!rt.transit && rt.player.scale.x === 1, "the transit finishes and the Warden is full size again");
        check(rt.space === "dungeon" && !!rt.session.run && rt.session.run.floorIndex === 1, "walking through the portal enters floor 1");
        // Crossing in a frame that ends inside the line's 5 cm band still counts.
        rt.freshGame();
        rt.resetInterior();
        player.position.set(o.x, 0, o.z + 0.3);
        rt.update(0.016);
        player.position.set(o.x, 0, o.z - 0.03);
        rt.update(0.016);
        player.position.set(o.x, 0, o.z - 0.2);
        rt.update(0.016);
        for (let i = 0; i < 60 && rt.transit; i++) rt.update(0.05);
        check(rt.space === "dungeon", "a crossing that pauses inside the gate line's band still delves");
      }
    }
    rt.freshGame();
    const injectedRolls = countRandom(function () { rt.startRun(0, 1); });
    rt.freshGame();
    const nowFn = performance.now;
    performance.now = function () { return 0; };
    let gateRolls = 0;
    try {
      gateRolls = countRandom(function () { rt.enterFromGate(); });
    } finally {
      performance.now = nowFn;
    }
    check(gateRolls === injectedRolls + 1, "the Delve Gate adds exactly one Math.random outside floor generation (" + gateRolls + " vs " + injectedRolls + ")");
    check(stored === 0, "entering a floor does not write localStorage");
    check(rt.space === "dungeon" && window.__game.space === "dungeon", "the gate sets space to dungeon");
    check(!!rt.session.run && rt.session.run.floorIndex === 1 && rt.session.run.runSeed === 0, "floorIndex starts at 1");
    noteMesh("gate floor");
    localStorage.setItem = setItem;

    rt.startRun(2, 1);
    noteMesh("floor 1");
    check(rt.session.devRun === false, "a seeded run is not a dev ledger delve");
    const townRoot = rt.townRoot;
    check(townRoot.parent === null, "townRoot is unparented during a floor");
    const sunDuring = scene.children.find((o) => o.isDirectionalLight);
    const skyDuring = scene.children.find((o) => o.isMesh && o.geometry && o.geometry.type === "SphereGeometry");
    check(!!sunDuring && sunDuring.parent === scene, "the directional light stays on the scene in the dungeon");
    check(!!skyDuring && skyDuring.parent === scene, "the sky stays on the scene in the dungeon");
    check(player.position.y === 0, "hero Y in the dungeon is 0");
    check(rt.dungeonRoot && rt.dungeonRoot.parent === scene, "dungeonRoot is parented for the floor");
    const floorMesh = rt.dungeonRoot.userData.floorMesh;
    const wallMesh = rt.dungeonRoot.userData.wallMesh;
    floorMesh.updateWorldMatrix(true, true);
    const floorNormal = new THREE.Vector3(0, 0, 1).transformDirection(floorMesh.matrixWorld);
    check(floorNormal.y > 0.9, "dungeon floor normal is +Y (" + floorNormal.y.toFixed(3) + ")");
    check(floorMesh.material.side === THREE.FrontSide, "dungeon floor is FrontSide");
    check(!!wallMesh && wallMesh.material.side === THREE.DoubleSide, "dungeon walls are DoubleSide");
    const telegraphMesh = rt.dungeonRoot.userData.telegraphMesh;
    check(!!telegraphMesh && telegraphMesh.material.flatShading === true && telegraphMesh.material.side === THREE.DoubleSide, "skirmisher telegraph is flat and DoubleSide");
    const muzzle = rt.dungeonRoot.userData.enemyMesh && rt.dungeonRoot.userData.enemyMesh.userData.muzzleLocal;
    check(!!muzzle && muzzle.z < 0 && Math.abs(muzzle.x) < 1e-6, "skirmisher muzzle is on local -z");
    let propClear = true;
    const propCols = rt.dungeonRoot.userData.propColliders || [];
    for (let i = 0; i < propCols.length; i++) {
      const col = propCols[i];
      if (Math.hypot(col.x - col.tileX, col.z - col.tileZ) < 0.9 + col.r) propClear = false;
    }
    check(propClear, "props leave the center 0.9 m of each floor tile clear");
    const roomRay = new THREE.Raycaster();
    const roomOrigin = player.position.clone();
    roomOrigin.y = 1.2;
    let wallHits = 0;
    const cardinals = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (let i = 0; i < cardinals.length; i++) {
      roomRay.set(roomOrigin, new THREE.Vector3(cardinals[i][0], 0, cardinals[i][1]));
      if (roomRay.intersectObject(wallMesh, false).length) wallHits++;
    }
    check(wallHits >= 1, "a wall raycast from inside the room hits the wall mesh (" + wallHits + ")");
    const eyebrowNode = document.querySelector("#minimap .eyebrow");
    check(eyebrowNode && eyebrowNode.textContent === "Floor 1 · Mossy Caves", "minimap eyebrow reads Floor 1 · Mossy Caves");
    check(slots[3].querySelector(".name").textContent === "Extract", "slot 4 is Extract in the dungeon");
    rt.tickHud(0.016);
    const xBar = document.getElementById("extractbar");
    const xBox = xBar.getBoundingClientRect();
    const mainBox = document.getElementById("actionbar").getBoundingClientRect();
    check(!xBar.hidden && xBox.left >= mainBox.right && slots[3].querySelector(".key").textContent === "X", "below ground Extract shows in its own bar right of the action bar, on X");
    let dungeonFlatMiss = [];
    rt.dungeonRoot.traverse((o) => {
      if (!o.material) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (let i = 0; i < mats.length; i++) if (!mats[i].flatShading) dungeonFlatMiss.push(o.name || o.type);
    });
    check(dungeonFlatMiss.length === 0, "dungeon materials are flat shaded" + (dungeonFlatMiss.length ? " " + dungeonFlatMiss.slice(0, 3).join(", ") : ""));

    let gyCalls = 0;
    const gyFn = rt.groundY;
    rt.groundY = function (x, z) {
      gyCalls++;
      return gyFn(x, z);
    };
    rt.suspendCombat = true;
    const savedHp = (rt.enemies || []).map((e) => e.hp);
    for (let i = 0; i < (rt.enemies || []).length; i++) rt.enemies[i].hp = 0;
    const plan = rt.plan;
    let openCell = null;
    for (let r = 1; r < plan.rows - 1 && !openCell; r++) {
      for (let c = 1; c < plan.cols - 1 && !openCell; c++) {
        let open = true;
        for (let dr = -1; dr <= 1 && open; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (plan.tiles[(r + dr) * plan.cols + (c + dc)] !== 1) open = false;
          }
        }
        if (!open) continue;
        const w = tileToWorld(c, r, plan.cols, plan.rows);
        let blocked = false;
        for (let i = 0; i < propCols.length; i++) {
          if (Math.hypot(propCols[i].x - w.x, propCols[i].z - w.z) < 1.7) blocked = true;
        }
        if (!blocked) openCell = w;
      }
    }
    if (openCell) player.position.set(openCell.x, 0, openCell.z);
    player.position.y = 0;
    rt.camYaw = 0.8;
    placeCamera(0, true);
    const dungeonSamples = [
      ["KeyW", "f", +1],
      ["KeyS", "f", -1],
      ["KeyD", "r", +1],
      ["KeyA", "r", -1],
      ["ArrowUp", "f", +1],
      ["ArrowRight", "r", +1]
    ];
    for (let s = 0; s < dungeonSamples.length; s++) {
      const code = dungeonSamples[s][0];
      const axis = dungeonSamples[s][1];
      const sign = dungeonSamples[s][2];
      if (openCell) player.position.set(openCell.x, 0, openCell.z);
      player.position.y = 0;
      player.rotation.y = 0;
      rt.camYaw = 0.8;
      placeCamera(0, true);
      camera.updateMatrixWorld(true);
      cameraPlanarBasis();
      const basis = { f: _fwd.clone(), r: _right.clone() };
      const p0 = player.position.clone();
      keys[code] = true;
      let acc = 0;
      while (acc < 0.2) {
        update(0.016);
        acc += 0.016;
      }
      keys[code] = false;
      const d = player.position.clone().sub(p0);
      d.y = 0;
      const len = d.length();
      check(len > 0.8, "dungeon " + code + " displaced " + len.toFixed(2) + "m");
      check(player.position.y === 0, "dungeon " + code + " keeps hero Y at 0");
      if (len > 0.05) {
        const along = d.clone().normalize().dot(basis[axis]) * sign;
        check(along > 0.9, "dungeon " + code + " camera-relative axis cos " + along.toFixed(3));
        const face = facingVector().dot(d.clone().normalize());
        check(face > 0.9, "dungeon " + code + " faces travel cos " + face.toFixed(3));
        const noseDot = modelFront().dot(facingVector());
        check(noseDot > 0.9, "dungeon " + code + " nose matches heading cos " + noseDot.toFixed(3));
      }
    }
    check(gyCalls === 0, "dungeon placeCamera and movement do not call groundY (" + gyCalls + ")");
    rt.groundY = gyFn;
    for (let i = 0; i < savedHp.length; i++) rt.enemies[i].hp = savedHp[i];
    rt.armSkirmishers(rt.enemies, rt.session.run);
    if (openCell) player.position.set(openCell.x, 0, openCell.z);
    player.position.y = 0;

    player.rotation.set(0, 0, 0);
    player.updateMatrixWorld(true);
    const strikeFwd = rt.heroForward();
    check(strikeFwd.z < -0.9 && Math.abs(strikeFwd.x) < 0.08, "strike aims along local -z (" + strikeFwd.x.toFixed(2) + "," + strikeFwd.z.toFixed(2) + ")");
    check(modelFront().dot(facingVector()) > 0.9, "nose matches local -z when the strike faces a target");
    const sox = player.position.x;
    const soz = player.position.z;
    const frontTarget = { x: sox, z: soz - 2, hp: 100, hurt: 0.45, id: 901 };
    const backTarget = { x: sox, z: soz + 2, hp: 100, hurt: 0.45, id: 902 };
    const arcRes = rt.resolveStrikeAt({ x: sox, z: soz }, { x: 0, z: -1 }, [frontTarget, backTarget]);
    check(arcRes.damage === 17 && frontTarget.hp === 83 && backTarget.hp === 100, "arc strike hits only the forward target for 17");
    const crowd = [];
    for (let i = 0; i < 6; i++) {
      const dist = 1.2 + i * 0.15;
      crowd.push({ x: sox, z: soz - dist, hp: 100, hurt: 0.45, id: 910 + i });
    }
    const wideAng = 80 * Math.PI / 180;
    const wideTarget = {
      x: sox + Math.sin(wideAng) * 1.5,
      z: soz - Math.cos(wideAng) * 1.5,
      hp: 100,
      hurt: 0.45,
      id: 940
    };
    const crowdRes = rt.resolveStrikeAt({ x: sox, z: soz }, { x: 0, z: -1 }, crowd.concat([wideTarget]));
    check(crowdRes.hit.length === 5 && crowd[0].hp === 83 && crowd[5].hp === 100 && wideTarget.hp === 100, "strike keeps the five closest and misses outside the arc");

    const sepA = { x: 0, z: 0, hp: 10, hurt: 0.45 };
    const sepB = { x: 0.1, z: 0, hp: 10, hurt: 0.45 };
    rt.separateSkirmishers([sepA, sepB]);
    check(Math.hypot(sepA.x - sepB.x, sepA.z - sepB.z) >= 0.7, "two skirmishers separate to at least 0.7 m");

    let losPair = null;
    for (let r = 0; r < plan.rows && !losPair; r++) {
      for (let c = 0; c < plan.cols && !losPair; c++) {
        if (plan.tiles[r * plan.cols + c] !== 1) continue;
        for (let r2 = r; r2 < plan.rows && !losPair; r2++) {
          for (let c2 = 0; c2 < plan.cols && !losPair; c2++) {
            if (r2 === r && c2 <= c) continue;
            if (plan.tiles[r2 * plan.cols + c2] !== 1) continue;
            const a = tileToWorld(c, r, plan.cols, plan.rows);
            const b = tileToWorld(c2, r2, plan.cols, plan.rows);
            const span = Math.hypot(a.x - b.x, a.z - b.z);
            if (span < 4 || span > 12) continue;
            if (!rt.losClear(a.x, a.z, b.x, b.z)) losPair = { a: a, b: b, span: span };
          }
        }
      }
    }
    check(!!losPair, "a floor has two walkable cells with a wall between them");
    if (losPair && rt.enemies && rt.enemies[0]) {
      const foe = rt.enemies[0];
      const dx = losPair.a.x - losPair.b.x;
      const dz = losPair.a.z - losPair.b.z;
      const span = Math.hypot(dx, dz) || 1;
      let fx = losPair.b.x;
      let fz = losPair.b.z;
      const stepIn = Math.max(0, span - 4.2) / span;
      const nx = losPair.b.x + dx * stepIn;
      const nz = losPair.b.z + dz * stepIn;
      const nc = Math.round(nx / 4 + (plan.cols - 1) / 2);
      const nr = Math.round(nz / 4 + (plan.rows - 1) / 2);
      const nIn = nr >= 0 && nc >= 0 && nr < plan.rows && nc < plan.cols && plan.tiles[nr * plan.cols + nc] === 1;
      if (nIn && !rt.losClear(losPair.a.x, losPair.a.z, nx, nz)) {
        fx = nx;
        fz = nz;
      }
      for (let i = 1; i < rt.enemies.length; i++) rt.enemies[i].hp = 0;
      foe.hp = foe.hpMax;
      foe.state = "idle";
      foe.telegraph = 0;
      // Floors are big enough that the fixture spot can sit past the 16 m leash; home it there.
      const homeX = foe.spawnX;
      const homeZ = foe.spawnZ;
      foe.spawnX = fx;
      foe.spawnZ = fz;
      foe.x = fx;
      foe.z = fz;
      player.position.set(losPair.a.x, 0, losPair.a.z);
      rt.vitals.hp = 140;
      rt.vitals.deathLock = false;
      rt.suspendCombat = false;
      const hpBeforeLos = rt.vitals.hp;
      const losNow = rt.losClear(foe.x, foe.z, player.position.x, player.position.z);
      rt.stepCombat(0.016);
      check(!losNow && foe.state === "idle" && rt.vitals.hp === hpBeforeLos, "a skirmisher across a wall does not aggro (" + foe.state + ")");
      rt.suspendCombat = true;
      foe.spawnX = homeX;
      foe.spawnZ = homeZ;
      foe.x = foe.spawnX;
      foe.z = foe.spawnZ;
      foe.state = "idle";
      rt.armSkirmishers(rt.enemies, rt.session.run);
    }

    const duelist = rt.enemies && rt.enemies[0];
    check(!!duelist, "floor 1 arms at least one skirmisher");
    if (duelist) {
      for (let i = 1; i < rt.enemies.length; i++) rt.enemies[i].hp = 0;
      duelist.x = duelist.spawnX;
      duelist.z = duelist.spawnZ;
      duelist.hp = duelist.hpMax;
      duelist.state = "idle";
      duelist.telegraph = 0;
      player.position.set(duelist.x + 1, 0, duelist.z);
      rt.vitals.hp = 100;
      rt.vitals.deathLock = false;
      rt.session.wardAbsorb = 0;
      rt.suspendCombat = false;
      rt.stepCombat(0.016);
      check(duelist.state === "telegraph" && rt.vitals.hp === 100, "skirmisher telegraphs before the hit (" + duelist.state + ", hp " + rt.vitals.hp + ")");
      rt.stepCombat(0.2);
      check(duelist.state === "telegraph" && rt.vitals.hp === 100, "the telegraph holds through 0.2 s");
      const expectedLoss = incomingDamage(skirmisherDmg(1), rt.session.guard, 0).hpLoss;
      rt.stepCombat(0.4);
      check(rt.vitals.hp === 100 - expectedLoss, "skirmisher damage uses incomingDamage (" + rt.vitals.hp + ", loss " + expectedLoss + ")");
      rt.suspendCombat = true;

      let home = null;
      for (let r = 0; r < plan.rows && !home; r++) {
        for (let c = 0; c < plan.cols && !home; c++) {
          if (plan.tiles[r * plan.cols + c] !== 1) continue;
          const w = tileToWorld(c, r, plan.cols, plan.rows);
          const away = Math.hypot(w.x - duelist.spawnX, w.z - duelist.spawnZ);
          if (away > 16 && rt.losClear(duelist.spawnX, duelist.spawnZ, w.x, w.z)) home = w;
        }
      }
      check(!!home, "a walkable cell sits beyond the 16 m leash");
      if (home) {
        duelist.x = home.x;
        duelist.z = home.z;
        duelist.hp = 11;
        duelist.hpMax = skirmisherHp(1);
        duelist.state = "idle";
        duelist.telegraph = 0;
        player.position.set(home.x, 0, home.z);
        rt.vitals.hp = 160;
        rt.vitals.deathLock = false;
        rt.suspendCombat = false;
        for (let n = 0; n < 160; n++) rt.stepCombat(0.05);
        const back = Math.hypot(duelist.x - duelist.spawnX, duelist.z - duelist.spawnZ);
        check(back < 0.35 && duelist.hp === duelist.hpMax && duelist.state === "idle", "leash returns the skirmisher to full health (" + back.toFixed(2) + " m, hp " + duelist.hp + ")");
        rt.suspendCombat = true;
        player.position.set(duelist.spawnX + 3, 0, duelist.spawnZ);
      }
    }

    rt.vitals.hp = 80;
    rt.vitals.deathLock = false;
    rt.vitals.deathTransitions = 0;
    cdLeft[0] = 0;
    const swung = rt.beginStrike();
    check(swung.ok && !rt.vitals.invuln, "strike has no invulnerability flag");
    rt.cancelStrike();
    rt.hurtHero(10);
    rt.hurtHero(10);
    check(rt.vitals.hp === 60 && rt.space === "dungeon", "two hits for 10 each land with no invulnerability frames");

    rt.extractKey = false;
    const channel = tryAbility(3);
    check(channel.ok && channel.reason === "channel" && castLine.textContent === "The hearth pulls…", "slot 4 channels Extract");
    window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyX", bubbles: true }));
    rt.stepCombat(0.05);
    check(rt.space === "dungeon" && rt.session.run, "a click channel ignores a key release");
    rt.cancelExtract();
    rt.beginExtract();
    rt.noteExtractMove(1);
    rt.stepCombat(3);
    check(rt.space === "dungeon" && rt.session.run, "moving 1 m cancels Extract");
    rt.vitals.hp = 70;
    rt.vitals.deathLock = false;
    rt.beginExtract();
    rt.hurtHero(5);
    rt.stepCombat(3);
    check(rt.space === "dungeon" && rt.session.run && rt.vitals.hp === 65, "damage cancels Extract and stays on the floor");

    const stairRun = rt.session.run;
    const stairSeed = stairRun.runSeed;
    const stairRng = 123456;
    stairRun.rngState = stairRng;
    stairRun.oilLeft = 4;
    stairRun.killed = [0];
    stairRun.picked = [3];
    stairRun.enemyHp = { 1: 5 };
    stairRun.summons = [{ id: 9 }];
    stairRun.floorGuard = true;
    rt.session.pack = [{ id: "pack-a" }, { id: "pack-b" }];
    rt.vitals.hp = 40;
    rt.vitals.mp = 20;
    cdLeft[1] = 1.25;
    rt.suspendCombat = true;
    check(rt.descendFloor() === true, "descendFloor advances the same run");
    noteMesh("floor 2");
    check(rt.session.run === stairRun && stairRun.floorIndex === 2 && stairRun.runSeed === stairSeed, "stairs keep the run, seed, and floor 2");
    check(stairRun.killed.length === 0 && stairRun.picked.length === 0 && Object.keys(stairRun.enemyHp).length === 0 && stairRun.summons.length === 0 && stairRun.floorGuard === false, "stairs clear killed, picked, enemyHp, summons, and floorGuard");
    check(stairRun.rngState === stairRng && stairRun.oilLeft === 4, "stairs keep rngState and oilLeft");
    check(rt.vitals.hp === 40 && rt.vitals.mp === 20, "stairs keep 40 hp and 20 mana");
    check(cdLeft[1] === 1.25, "stairs keep the cooldown");
    check(rt.session.pack.length === 2, "stairs keep the pack");
    const lived = (rt.enemies || []).find((e) => e.id === 0);
    check(stairRun.killed.indexOf(0) < 0 && (!lived || lived.hp > 0), "a cleared kill does not stay dead on the next floor");
    check(player.position.y === 0 && rt.townRoot.parent === null, "floor 2 still unparents the town and keeps the hero at Y 0");
    const stairDoc = rt.flushSave ? rt.flushSave() : null;
    const stairRaw = localStorage.getItem(SAVE_KEY);
    const stairStored = stairRaw ? JSON.parse(stairRaw) : null;
    check(!!stairDoc && !!stairStored && stairStored.run && stairStored.run.floorIndex === 2 && stairStored.run.runSeed === stairSeed && stairStored.run.killed.length === 0 && stairStored.run.picked.length === 0 && Object.keys(stairStored.run.enemyHp).length === 0 && stairStored.run.summons.length === 0 && stairStored.run.floorGuard === false, "a save after stairs stores the cleared per-floor slice");

    const keptBlade = rt.session.blade;
    rt.session.pack = [{ id: "lost-a" }, { id: "lost-b" }];
    rt.session.purse = 50;
    rt.session.bank = 80;
    rt.session.stash = [{ id: "stashed" }];
    rt.session.bestDepth = 4;
    rt.vitals.hp = 10;
    rt.vitals.deathLock = false;
    rt.vitals.deathTransitions = 0;
    rt.suspendCombat = true;
    rt.hurtHero(50);
    check(rt.vitals.hp === 0 && rt.space === "dungeon" && rt.vitals.deathTransitions === 1, "lethal damage starts one death lock and stays in the dungeon");
    rt.hurtHero(50);
    check(rt.space === "dungeon" && rt.vitals.deathTransitions === 1, "a second hit during the lock does not arrive twice");
    rt.stepCombat(DEATH_LOCK_S - 0.1);
    check(rt.space === "dungeon" && rt.vitals.deathLock, "the Warden lies fallen for the length of the death lock");
    rt.stepCombat(0.15);
    check(rt.session.run === null && rt.space === "town", "death sets run to null and returns to town");
    check(rt.session.pack.length === 0 && rt.session.purse === 0, "death empties the pack and the purse");
    check(rt.session.bank === 80 && rt.session.stash.length === 1 && rt.session.blade === keptBlade && rt.session.bestDepth === 4, "death leaves the bank, stash, blade, and bestDepth");
    check(castLine.textContent === "The Underwood kept what you carried.", "death says the Underwood kept what you carried");
    check(atArrival(), "death returns the hero to the gate road facing into town");
    check(rt.vitals.hp === rt.vitals.hpMax && rt.vitals.mp === rt.vitals.mpMax, "death arrival refills both pools");

    rt.startRun(4, 7);
    noteMesh("floor 7");
    rt.suspendCombat = true;
    const keptPack = [{ id: "kept-a" }, { id: "kept-b" }];
    rt.session.pack = keptPack;
    rt.session.purse = 40;
    rt.session.bestDepth = 1;
    rt.extractKey = false;
    rt.vitals.hp = 33;
    rt.vitals.mp = 12;
    const extracted = rt.beginExtract();
    check(extracted.reason === "channel", "Extract begins a channel");
    rt.stepCombat(2.6);
    check(rt.session.run === null && rt.space === "town", "a finished Extract returns to town");
    check(rt.session.pack === keptPack && rt.session.pack.length === 2 && rt.session.purse === 40, "Extract keeps the pack and the purse");
    check(rt.session.bestDepth >= 7, "Extract advances bestDepth to the floor you left (" + rt.session.bestDepth + ")");
    check(rt.vitals.hp === 160 && rt.vitals.mp === 80, "Extract arrival refills to 160 and 80");

    rt.startRun(2, 3);
    noteMesh("floor 3");
    rt.vitals.hp = 1;
    rt.vitals.mp = 4;
    rt.arriveTown("extract");
    check(rt.space === "town" && rt.session.run === null, "arriveTown clears the run");
    check(rt.vitals.hp === rt.vitals.hpMax && rt.vitals.mp === rt.vitals.mpMax && rt.vitals.hp === 160 && rt.vitals.mp === 80, "arriveTown from 1 hp refills to the maxima");
    check(atArrival(), "arriveTown places the hero at TOWN_ARRIVAL facing into town");
    check(rt.townRoot.parent === scene && (!rt.dungeonRoot || rt.dungeonRoot.parent === null), "arriveTown parents townRoot and drops the dungeon");

    let devWrites = 0;
    const setItemDev = localStorage.setItem.bind(localStorage);
    localStorage.setItem = function () {
      devWrites++;
      return setItemDev.apply(localStorage, arguments);
    };
    try {
      rt.startDevFloor(1, 1);
    } finally {
      localStorage.setItem = setItemDev;
    }
    noteMesh("dev floor 1");
    check(devWrites === 0 && rt.session.devRun === true, "a dev floor does not write storage");
    check(castLine.textContent === "This delve is not written into the town ledger.", "dev floor says it is not written into the town ledger");
    rt.dev = true;
    rt.syncColliderOverlay();
    let solidTiles = 0;
    const devPlan = rt.plan;
    for (let i = 0; i < devPlan.tiles.length; i++) if (devPlan.tiles[i] !== 1) solidTiles++;
    check(!!rt.colliderOverlay && rt.colliderOverlay.children.length === solidTiles, "dungeon dev overlay matches solid tiles (" + (rt.colliderOverlay ? rt.colliderOverlay.children.length : 0) + " vs " + solidTiles + ")");
    rt.dev = false;
    rt.syncColliderOverlay();
    check(!rt.colliderOverlay, "dungeon overlay is removed when dev is off");

    const devLedgerBefore = localStorage.getItem(SAVE_KEY);
    const devDepth = rt.devLedger && rt.devLedger.hero ? rt.devLedger.hero.bestDepth : null;
    const devPurse = rt.devLedger && rt.devLedger.hero ? rt.devLedger.hero.purse : null;
    let devLater = 0;
    const setItemLater = localStorage.setItem.bind(localStorage);
    localStorage.setItem = function () {
      devLater++;
      return setItemLater.apply(localStorage, arguments);
    };
    try {
      rt.session.purse = 777;
      rt.session.pack = [{ id: "dev-loot" }];
      rt.session.bestDepth = (rt.session.bestDepth || 0) + 40;
      rt.arriveTown("extract");
      if (rt.flushSave) rt.flushSave();
      if (rt.markSave) rt.markSave("unload");
    } finally {
      localStorage.setItem = setItemLater;
      if (rt.holdSaves) rt.holdSaves();
    }
    check(devLater === 0 && rt.session.devRun === true, "a dev floor does not call setItem");
    check(localStorage.getItem(SAVE_KEY) === devLedgerBefore, "dev extract does not write bestDepth or loot back");
    check(rt.devLedger && rt.devLedger.hero.bestDepth === devDepth && rt.devLedger.hero.purse === devPurse, "dev bestDepth does not stick on the loaded ledger");

    rt.startRun(1, 1);
    noteMesh("mesh floor 1");
    rt.startRun(1, 10);
    noteMesh("mesh floor 10");
    rt.startRun(1, 100);
    noteMesh("mesh floor 100");
    check(!meshOver, "mesh build fails only above 60 ms" + (meshOver ? " (" + meshOver + ")" : ""));

    const migrated = migrate({ schemaVersion: 0, hero: { level: 3 } });
    check(migrated.schemaVersion === SCHEMA && migrated.hero.level === 3, "version 0 migrates to the current schema at level 3");
    check(migrated.hero.tracks.edge === 0 && migrated.hero.tracks.bulwark === 0 && migrated.hero.tracks.mend === 0 && migrated.hero.tracks.delver === 0, "a version 0 hero without tracks keeps every track at 0");
    const heirWeapon = migrated.hero.equipped.weapon;
    check(!!heirWeapon && heirWeapon.baseId === "blade" && heirWeapon.weaponBase === 12 && heirWeapon.themeId === 0 && migrated.hero.equipped.trinket === null && migrated.hero.equipped.offhand && migrated.hero.equipped.head && migrated.hero.equipped.body && migrated.hero.equipped.feet, "missing equipped keeps the placeholder heirlooms");
    check(migrated.hero.townUnlocks.stall === false, "stall stays false");
    const keptEquip = {
      weapon: { uid: "kept" },
      offhand: null,
      head: null,
      body: null,
      feet: null,
      trinket: null
    };
    const migratedKeep = migrate({
      schemaVersion: 0,
      hero: {
        xp: 10,
        purse: 40,
        bank: 15,
        bestDepth: 2,
        tracks: { edge: 1, oath: 2 },
        materials: { heartwood: 3 },
        equipped: keptEquip
      }
    });
    check(migratedKeep.hero.xp === 10 && migratedKeep.hero.purse === 40 && migratedKeep.hero.bank === 15 && migratedKeep.hero.bestDepth === 2 && migratedKeep.hero.tracks.edge === 1 && migratedKeep.hero.materials.heartwood === 3, "version 0 keeps xp, purse, bank, bestDepth, edge, and heartwood");
    check(migratedKeep.hero.equipped.weapon && migratedKeep.hero.equipped.weapon.uid === "kept" && !migratedKeep.hero.equipped.weapon.baseId && migratedKeep.hero.equipped.trinket === null, "heirlooms are not written over a present equipped");
    check(migratedKeep.hero.tracks.oath === 2 && migratedKeep.hero.townUnlocks.stall === false, "an extra track round-trips and stall stays false");
    const parsedProto = parseSave('{"schemaVersion":0,"hero":{"level":4,"tracks":{"edge":1,"__proto__":{"polluted":1}}}}');
    const migratedProto = migrate(parsedProto);
    check(migratedProto.hero.level === 4 && migratedProto.hero.tracks.edge === 1 && !Object.prototype.hasOwnProperty.call(migratedProto.hero.tracks, "__proto__") && !Object.prototype.polluted, "__proto__ keys in JSON are dropped");
    check(SCHEMA === 2 && freshSave().schemaVersion === 2 && freshSave().run === null && Array.isArray(freshSave().quests.active), "schema version is 2 and a fresh ledger carries an empty quest log");

    rt.freshGame();
    const freshStrike = strikeDamage({ level: rt.session.level, might: rt.session.might, tracks: rt.session.tracks }, rt.session.blade);
    check(freshStrike === 17 && rt.session.blade.weaponBase === 12 && rt.session.blade.themeId === 0 && rt.session.townUnlocks.stall === false, "level-1 strike stays 17 and stall stays false");
    check(typeof window.__game.save === "function", "window.__game.save flushes the ledger");

    let burst = 0;
    const burstSet = localStorage.setItem.bind(localStorage);
    localStorage.setItem = function () {
      burst++;
      return burstSet.apply(localStorage, arguments);
    };
    try {
      if (rt.holdSaves) rt.holdSaves();
      rt.startRun(8, 1);
      for (let i = 0; i < 36; i++) rt.markSave("dungeon");
      check(burst === 0, "killing one enemy does not call setItem 36 times (" + burst + ")");
    } finally {
      localStorage.setItem = burstSet;
      if (rt.holdSaves) rt.holdSaves();
    }
    noteMesh("save floor");

    rt.freshGame();
    rt.suspendCombat = true;
    let resumeSeed = 1;
    for (let seed = 1; seed <= 40; seed++) {
      const preview = generateFloor(seed, 1);
      let skirmishers = 0;
      for (let i = 0; i < preview.spawns.length; i++) if (preview.spawns[i].archetype === "skirmisher") skirmishers++;
      if (skirmishers >= 2) {
        resumeSeed = seed;
        break;
      }
    }
    rt.startRun(resumeSeed, 1);
    noteMesh("resume floor");
    const resumeFoes = (rt.enemies || []).filter((e) => e && e.hp > 0);
    check(resumeFoes.length >= 2, "the resume floor has two living foes");
    const liveFoe = resumeFoes[0];
    const deadFoe = resumeFoes[1];
    const liveId = liveFoe.id;
    const killedId = deadFoe.id;
    rt.session.run.killed = [killedId];
    rt.session.run.picked = ["drop-9-4"];
    rt.session.run.enemyHp = {};
    rt.session.run.enemyHp[liveId] = 5;
    rt.session.run.rngState = 99;
    rt.session.run.oilLeft = 3;
    rt.vitals.hp = 40;
    rt.vitals.mp = 22;
    const resumeX = rt.player.position.x;
    const resumeZ = rt.player.position.z;
    const resumeSaved = rt.flushSave();
    check(!!resumeSaved && resumeSaved.run && resumeSaved.run.floorIndex === 1 && resumeSaved.run.runSeed === (resumeSeed >>> 0) && resumeSaved.run.killed[0] === killedId && resumeSaved.run.enemyHp[liveId] === 5, "the checkpoint keeps the floor, the kill, and the living hp");
    rt.freshGame();
    check(rt.session.run === null && rt.space === "town", "wiping memory leaves town before the ledger is loaded");
    rt.loadStoredGame();
    check(rt.space === "dungeon" && rt.session.run && rt.session.run.floorIndex === 1 && rt.session.run.runSeed === (resumeSeed >>> 0), "a loaded run resumes the same floor");
    check(rt.session.run.killed.length === 1 && rt.session.run.killed[0] === killedId, "a loaded run keeps the same killed ids");
    const resumedLive = (rt.enemies || []).find((e) => e.id === liveId);
    const resumedDead = (rt.enemies || []).find((e) => e.id === killedId);
    check(!!resumedLive && resumedLive.hp === 5, "enemy HP is preserved across save and load (" + (resumedLive ? resumedLive.hp : "missing") + ")");
    check(!!resumedDead && resumedDead.hp === 0, "a killed id is not alive after load");
    check(rt.session.run.picked[0] === "drop-9-4" && rt.session.run.rngState === 99 && rt.session.run.oilLeft === 3, "picked ids, rngState, and oilLeft round-trip");
    check(rt.vitals.hp === 40 && rt.vitals.mp === 22, "resume keeps the hero pools (" + rt.vitals.hp + "/" + rt.vitals.mp + ")");
    check(Math.abs(rt.player.position.x - resumeX) < 0.05 && Math.abs(rt.player.position.z - resumeZ) < 0.05, "resume keeps the hero pose");
    const loadedStrike = strikeDamage({ level: rt.session.level, might: rt.session.might, tracks: rt.session.tracks }, rt.session.blade);
    check(loadedStrike === 17 && rt.session.blade.weaponBase === 12 && rt.session.blade.themeId === 0, "a loaded level-1 strike stays 17");

    rt.arriveTown("extract");
    const townDoc = JSON.parse(localStorage.getItem(SAVE_KEY));
    check(townDoc && townDoc.run === null, "a save after arriveTown stores run null");
    rt.session.run = { runSeed: 3, floorIndex: 8, killed: [1], picked: [], enemyHp: {}, summons: [], floorGuard: true };
    rt.space = "dungeon";
    rt.loadStoredGame();
    check(rt.session.run === null && rt.space === "town", "loading that document leaves run null and the hero in town");
    check(atArrival(), "the loaded town hero stands at TOWN_ARRIVAL");
    check(rt.townRoot.parent === scene && (!rt.dungeonRoot || rt.dungeonRoot.parent === null), "the loaded town parents townRoot");

    localStorage.removeItem(SAVE_BAK_KEY);
    localStorage.setItem(SAVE_KEY, "{");
    rt.loadStoredGame();
    check(rt.session.run === null && rt.session.level === 1 && rt.space === "town" && rt.session.townUnlocks.stall === false, "corrupt JSON loads a fresh game");
    check(localStorage.getItem(SAVE_BAK_KEY) === "{", "corrupt JSON is kept aside once");
    check(castLine.textContent === "The town ledger was unreadable. A copy was kept.", "corrupt JSON tells the player the ledger was unreadable");

    const fullDoc = freshSave();
    for (let i = 0; i < 48; i++) {
      fullDoc.stash.push({
        uid: "stash-" + i,
        kind: "gear",
        slot: "weapon",
        consumableId: null,
        charges: 1,
        stack: 1,
        rarity: i % 4,
        ilvl: (i % 20) + 1,
        baseId: "blade",
        themeId: i % 4,
        weaponBase: 12 + (i % 5),
        affixes: [{ id: "keen", t: 0.42 }, { id: "might", t: 0.2 }],
        name: "Keen Moss Blade " + i
      });
    }
    for (let i = 0; i < 24; i++) {
      fullDoc.hero.pack.push({
        uid: "pack-" + i,
        kind: "gear",
        slot: "body",
        consumableId: null,
        charges: 1,
        stack: 1,
        rarity: i % 4,
        ilvl: (i % 12) + 1,
        baseId: "tunic",
        themeId: i % 4,
        affixes: [{ id: "guard", t: 0.33 }],
        name: "Warden Tunic " + i
      });
    }
    fullDoc.run = {
      runSeed: 1,
      floorIndex: 36,
      x: 1,
      z: -2,
      yaw: 0.2,
      hp: 40,
      mp: 20,
      killed: [],
      picked: [],
      enemyHp: {},
      summons: [],
      rngState: 1,
      floorGuard: false,
      oilLeft: 0
    };
    for (let i = 0; i < 36; i++) fullDoc.run.enemyHp[String(i)] = 80 + i;
    const fullJson = JSON.stringify(fullDoc);
    check(fullJson.length < 32 * 1024, "a full stash, pack, and 36-enemy checkpoint is under 32 KiB (" + fullJson.length + ")");
    check(fullJson.length < SAVE_MAX_CHARS, "the checkpoint is under the 256 KiB cap");

    let guardThrew = false;
    let guardRefused = false;
    try {
      guardRefused = ledgerExceedsCap(new Array(SAVE_MAX_CHARS + 2).join("a"));
    } catch (err) {
      guardThrew = true;
    }
    check(!guardThrew && guardRefused === true, "the save guard refuses a string over 256 KiB and does not throw");
    check(ledgerExceedsCap("{\"schemaVersion\":1}") === false, "the save guard accepts a small ledger string");

    let hugeWrites = 0;
    const hugeSet = localStorage.setItem.bind(localStorage);
    localStorage.setItem = function () {
      hugeWrites++;
      return hugeSet.apply(localStorage, arguments);
    };
    try {
      const huge = freshSave();
      huge.hero.name = "n".repeat(300 * 1024);
      const wroteHuge = rt.persistDocument(huge);
      check(wroteHuge === false && hugeWrites === 0, "an oversized ledger does not call setItem");
      check(castLine.textContent === "The town ledger is full.", "an oversized ledger says the town ledger is full");
    } finally {
      localStorage.setItem = hugeSet;
    }

    rt.freshGame();
    rt.suspendCombat = true;
    rt.startRun(1, 1);
    let quotaThrew = false;
    const quotaSet = localStorage.setItem.bind(localStorage);
    localStorage.setItem = function () {
      const err = new Error("quota");
      err.name = "QuotaExceededError";
      throw err;
    };
    try {
      rt.flushSave();
    } catch (err) {
      quotaThrew = true;
    } finally {
      localStorage.setItem = quotaSet;
    }
    check(!quotaThrew && castLine.textContent === "The town ledger could not be written.", "a quota failure stays in the session");
    check(rt.space === "dungeon" && rt.session.run, "the session keeps playing after the ledger refuses");

    rt.freshGame();
    rt.suspendCombat = false;
    const backFlat = [];
    scene.traverse((o) => {
      if (!o.material) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (let i = 0; i < mats.length; i++) if (!mats[i].flatShading) backFlat.push(o.type + " " + (mats[i].type || ""));
    });
    check(backFlat.length === 0, "flatShading still on every material after returning to town" + (backFlat.length ? " missing " + backFlat.slice(0, 4).join(", ") : ""));
    check(pines.length + decs.length === TREE_COUNT && TREE_COUNT === 3050, "TREE_COUNT is still 3050");
    check(scene.fog && scene.fog.isFogExp2 && Math.abs(scene.fog.density - 0.0105) < 1e-6 && scene.fog.color.getHex() === 0xd5e4b8, "town fog is restored");
    check(scene.background && scene.background.getHex() === 0xd5e4b8, "town background is restored");
    const hemiBack = scene.children.find((o) => o.isHemisphereLight);
    const ambBack = scene.children.find((o) => o.isAmbientLight);
    const sunBack = scene.children.find((o) => o.isDirectionalLight);
    check(!!hemiBack && hemiBack.color.getHex() === 0xc5e4ff && hemiBack.groundColor.getHex() === 0x4d7a38 && Math.abs(hemiBack.intensity - 0.72) < 1e-6, "town hemisphere light is restored");
    check(!!ambBack && ambBack.color.getHex() === 0xfff3df && Math.abs(ambBack.intensity - 0.28) < 1e-6, "town ambient light is restored");
    check(!!sunBack && sunBack.shadow.mapSize.x === 2048 && sunBack.shadow.camera.left === -34 && sunBack.shadow.camera.right === 34 && sunBack.shadow.camera.top === 34 && sunBack.shadow.camera.bottom === -34, "town shadow map is 2048 with frustum ±34");
    check(eyebrowNode.textContent === "Greenmere", "minimap eyebrow returns to Greenmere");
    check(slots[3].querySelector(".name").textContent === "Hearth", "slot 4 returns to Hearth");
    slots[3].click();
    check(rt.hearthT === 1 && castLine.textContent === "The campfire answers.", "Hearth click still rings the campfire");
    check(!rt.colliderOverlay, "the overlay is absent when the suite ends");

    const rareBlade = {
      uid: "rare-3",
      kind: "gear",
      slot: "weapon",
      consumableId: null,
      charges: 1,
      stack: 1,
      rarity: 2,
      ilvl: 3,
      baseId: "blade",
      themeId: 0,
      weaponBase: 14,
      affixes: [],
      name: "Rare Moss Blade"
    };
    function gearList(n, prefix) {
      const list = [];
      for (let i = 0; i < n; i++) {
        list.push({
          uid: prefix + "-" + i,
          kind: "gear",
          slot: "weapon",
          consumableId: null,
          charges: 1,
          stack: 1,
          rarity: 0,
          ilvl: 1,
          baseId: "blade",
          themeId: 0,
          affixes: [],
          name: prefix + " " + i
        });
      }
      return list;
    }
    function tap(code) {
      window.dispatchEvent(new KeyboardEvent("keydown", { code: code, bubbles: true }));
      window.dispatchEvent(new KeyboardEvent("keyup", { code: code, bubbles: true }));
      keys[code] = false;
    }
    const mats = { heartwood: 999, slag: 0, rootfiber: 0, emberglass: 998 };
    check(vendorValue(rareBlade) === 36 && sellValue(rareBlade) === 10, "ilvl 3 rare vendors at 36 and sells for 10");
    check(sellValue(rareBlade) === Math.floor(36 * 3 / 10) && sellValue.toString().indexOf("0.3") < 0, "sell uses floor(vendor * 3 / 10), not 0.3");
    check(addMaterial(mats, "heartwood", 1) === 0 && mats.heartwood === 999, "a 1000th material unit is not added");
    check(addMaterial(mats, "emberglass", 5) === 1 && mats.emberglass === 999, "materials cap at 999");

    // Gear previews: the stat sums match derive(), the shop compares against
    // what is worn, the smith shows what +1 buys, the Circle shows the next rank.
    {
      if (rt.derivePools) rt.derivePools();
      const st = heroStats(rt.session);
      check(st.hp === rt.vitals.hpMax && st.mp === rt.vitals.mpMax && st.might === rt.session.might && st.guard === rt.session.guard, "heroStats matches derive() (" + st.hp + " / " + rt.vitals.hpMax + ")");
      const worn = rt.session.equipped.weapon;
      const strong = { uid: "cmp-strong", kind: "gear", slot: "weapon", rarity: 1, ilvl: 3, baseId: "blade", themeId: 0, weaponBase: (worn ? worn.weaponBase : 12) + 10, affixes: [{ id: "might", t: 1 }], name: "Strong Blade" };
      const weak = Object.assign({}, strong, { uid: "cmp-weak", weaponBase: 1, affixes: [], name: "Weak Blade" });
      const up = compareEquip(rt.session, strong);
      const down = compareEquip(rt.session, weak);
      check(up.verdict === "better" && up.changes.some((c) => c.key === "damage" && c.delta > 0 && c.good), "a stronger blade compares as better with more strike damage");
      check(down.verdict === "worse" && down.changes.every((c) => !c.good), "a weaker blade compares as worse");
      const hollow = compareUpgrade(rt.session, { kind: "gear", slot: "head", ilvl: 1, themeId: 0, affixes: [] });
      check(hollow.hollow === true && !hollow.changes.length, "upgrading a piece with no affixes is flagged as changing nothing");
      const blade = compareUpgrade(rt.session, strong);
      check(blade.changes.some((c) => c.key === "damage" && c.delta > 0), "upgrading a blade shows the strike damage it gains");
      const edge0 = trackNext("edge", 0);
      check(edge0.length === 1 && edge0[0][0] === "Strike damage" && edge0[0][2] === "×1.12", "the Circle shows Edge rank 1 as strike damage x1.12");
      check(trackNext("delver", 5).length === 0, "a mastered track has nothing next");
      const packWas = rt.session.pack;
      rt.session.pack = [strong, weak];
      rt.openPanel("store", { x: -6.5, z: 2.5, id: "store" });
      const panelNow = document.getElementById("panel");
      const rows = panelNow.querySelectorAll(".pack-row");
      const verdicts = panelNow.querySelectorAll(".verdict");
      check(verdicts.length === 2 && verdicts[0].classList.contains("better") && verdicts[1].classList.contains("worse"), "the store marks each carried piece better or worse than worn");
      check(panelNow.textContent.indexOf("vs " + (worn ? worn.name : "empty weapon")) >= 0 && !!panelNow.querySelector(".pack-row .up") && !!panelNow.querySelector(".pack-row .down"), "the store lists the stat changes against the worn piece");
      const sellBtn = panelNow.querySelector('[data-act="sell"]');
      check(!!sellBtn && sellBtn.textContent.indexOf(sellValue(strong) + " gold") >= 0, "the sell control names the gold it pays");
      check(rows.length > 0, "store rows render");
      rt.closePanel();
      rt.session.pack = packWas;
    }

    keys.KeyW = false;
    keys.KeyA = false;
    keys.KeyS = false;
    keys.KeyD = false;
    keys.ShiftLeft = false;
    keys.ShiftRight = false;
    {
      const sp = besideStation("Bramble & Board", 1.5);
      player.position.x = sp.x;
      player.position.z = sp.z;
    }
    rt.refreshTownPrompt();
    check(rt.keyPrompt.label() === "Bramble & Board" && rt.keyPrompt.sub() === "Buy and sell" && !rt.keyPrompt.node.hidden, "the F prompt shows Bramble & Board and what you do there");
    tap("KeyF");
    const panel = document.getElementById("panel");
    const vitalsBox = document.getElementById("vitals").getBoundingClientRect();
    const panelBox = panel.getBoundingClientRect();
    const panelStyle = getComputedStyle(panel);
    check(!!panel && panel.tagName === "SECTION" && panel.classList.contains("plaque") && document.querySelectorAll("#panel").length === 1, "one #panel plaque");
    check(!panel.hidden, "F at Bramble & Board opens the store");
    const barBox = document.getElementById("actionbar").getBoundingClientRect();
    check(panelBox.width <= 940 && panelBox.width > vitalsBox.width, "the keeper window is a wide window, at most 940 (" + panelBox.width.toFixed(1) + ")");
    check(Math.abs(panelBox.left + panelBox.width / 2 - window.innerWidth / 2) < 2, "the keeper window is centred");
    check(panelBox.bottom <= barBox.top + 1, "the keeper window clears the action bar");
    check(panelStyle.transform === "none", "panel is not transformed onto the viewport");
    check(!!panel.querySelector(".kp-keeper .panel-talk") && !!panel.querySelector(".kp-counter .kp-tabs"), "the keeper speaks on the left; the counter has tabs on the right");
    check(document.body.classList.contains("window-open") && getComputedStyle(rt.keyPrompt.node).display === "none", "the F prompt steps aside while the window is open");
    check(panelStyle.backgroundImage.indexOf("gradient") >= 0, "panel uses the plaque gradient");
    check(panelStyle.boxShadow.indexOf("122, 90, 38") >= 0, "panel frame carries the brass line (" + panelStyle.boxShadow.slice(0, 60) + ")");
    const panelFont = panelStyle.fontFamily.toLowerCase();
    check(panelFont.indexOf("sans-serif") < 0 && (panelFont.indexOf("palatino") >= 0 || panelFont.indexOf("antiqua") >= 0 || panelFont.indexOf("serif") >= 0), "panel stays in the serif plaque stack (" + panelFont + ")");
    check(panel.querySelector(".eyebrow") && panel.querySelector(".eyebrow").textContent === "Bramble & Board", "the plaque names Bramble & Board");
    rt.session.pack = [{
      uid: "markup",
      kind: "gear",
      slot: "weapon",
      rarity: 0,
      ilvl: 1,
      affixes: [],
      name: "<img src=x onerror=alert(1)>"
    }];
    rt.session.stash = [];
    rt.session.purse = 7;
    rt.session.bank = 0;
    rt.openPanel("store", { x: -6.5, z: 2.5, id: "store" });
    const marked = panel.querySelector(".slot.pack-row .name");
    check(!!marked && marked.textContent === "<img src=x onerror=alert(1)>" && panel.innerHTML.indexOf("<img") < 0, "item names are textContent, never parsed HTML");
    const markedRow = panel.querySelector(".slot.pack-row");
    check(!!markedRow && markedRow.style.borderTopWidth === "2px", "a pack slot keeps a 2 px rarity edge");

    rt.session.pack = [rareBlade];
    rt.session.purse = 7;
    rt.openPanel("store", { x: -6.5, z: 2.5, id: "store" });
    check(panel.textContent.indexOf("Rare Moss Blade") >= 0, "the store lists the pack gear");
    const sellBtn = panel.querySelector('[data-act="sell"]');
    check(!!sellBtn && sellBtn.textContent.indexOf("10") >= 0, "the listed sale shows 10 gold");
    if (sellBtn) sellBtn.click();
    check(rt.session.purse === 17 && rt.session.pack.length === 0, "selling the listed rare adds floor(vendor * 3 / 10) to the purse");
    check(rt.listBuyback().length === 1 && rt.listBuyback()[0].price === 10, "the sale is remembered for buyback");

    rt.session.pack = [{ uid: "kept", kind: "gear", slot: "weapon", rarity: 0, ilvl: 1, affixes: [], name: "Kept Blade" }];
    rt.session.purse = 24;
    rt.openPanel("store", { x: -6.5, z: 2.5, id: "store" });
    const packBefore = JSON.stringify(rt.session.pack);
    const buyBtn = panel.querySelector('[data-act="buy-hp"]');
    if (buyBtn) buyBtn.click();
    check(!!buyBtn && buyBtn.classList.contains("slot") && buyBtn.classList.contains("deny"), "a short purse shakes the buy control");
    check(JSON.stringify(rt.session.pack) === packBefore && rt.session.purse === 24, "a short purse does not change the pack");

    rt.session.purse = 50;
    rt.session.pack = [{
      uid: "stack",
      kind: "consumable",
      consumableId: "draught-hp",
      charges: 1,
      stack: 19,
      rarity: 0,
      ilvl: 1,
      affixes: [],
      name: "Health Draught"
    }];
    rt.openPanel("store", { x: -6.5, z: 2.5, id: "store" });
    const mergeBtn = panel.querySelector('[data-act="buy-hp"]');
    if (mergeBtn) mergeBtn.click();
    check(rt.session.pack.length === 1 && rt.session.pack[0].stack === 20 && rt.session.purse === 25, "a health draught merges into a stack until 20");
    const overflowBtn = panel.querySelector('[data-act="buy-hp"]');
    if (overflowBtn) overflowBtn.click();
    check(rt.session.pack.length === 2 && rt.session.pack[0].stack === 20 && rt.session.pack[1].stack === 1 && rt.session.pack[1].consumableId === "draught-hp" && rt.session.purse === 0, "the 21st draught overflows into another slot");

    rt.session.purse = 25;
    rt.session.pack = gearList(24, "full");
    const fullBefore = JSON.stringify(rt.session.pack);
    rt.openPanel("store", { x: -6.5, z: 2.5, id: "store" });
    const fullBuy = panel.querySelector('[data-act="buy-hp"]');
    if (fullBuy) fullBuy.click();
    check(rt.session.pack.length === 24 && JSON.stringify(rt.session.pack) === fullBefore && rt.session.purse === 25, "a full pack refuses a draught and keeps its gold");

    rt.session.purse = 10;
    rt.session.bank = 3;
    rt.openPanel("bank", stationNamed("The Counting House"));
    const poorDeposit = panel.querySelector('[data-act="deposit"]');
    const amount = panel.querySelector("#panel-amount");
    if (amount) amount.value = "40";
    if (poorDeposit) poorDeposit.click();
    check(rt.session.purse === 10 && rt.session.bank === 3 && !!poorDeposit && poorDeposit.classList.contains("deny"), "a short purse does not deposit");
    rt.session.purse = 90;
    rt.session.bank = 10;
    rt.openPanel("bank", stationNamed("The Counting House"));
    const deposit = panel.querySelector('[data-act="deposit"]');
    const amount40 = panel.querySelector("#panel-amount");
    if (amount40) amount40.value = "40";
    if (deposit) deposit.click();
    check(rt.session.purse === 50 && rt.session.bank === 50, "deposit of 40 moves 40 from purse to bank");
    const withdraw = panel.querySelector('[data-act="withdraw"]');
    const amountBack = panel.querySelector("#panel-amount");
    if (amountBack) amountBack.value = "40";
    if (withdraw) withdraw.click();
    check(rt.session.purse === 90 && rt.session.bank === 10, "withdraw of 40 moves 40 from bank to purse");

    rt.session.pack = gearList(1, "mv");
    rt.session.stash = [];
    rt.openPanel("bank", stationNamed("The Counting House"));
    const toStash = panel.querySelector('[data-act="stash"]');
    if (toStash) toStash.click();
    check(rt.session.pack.length === 0 && rt.session.stash.length === 1 && rt.session.stash[0].uid === "mv-0", "gear moves from the pack into the stash");
    const toPack = panel.querySelector('[data-act="pack"]');
    if (toPack) toPack.click();
    check(rt.session.pack.length === 1 && rt.session.stash.length === 0 && rt.session.pack[0].uid === "mv-0", "gear moves from the stash into the pack");

    rt.session.stash = gearList(48, "st");
    rt.session.pack = gearList(1, "extra");
    rt.openPanel("bank", stationNamed("The Counting House"));
    const overStash = panel.querySelector('[data-act="stash"]');
    if (overStash) overStash.click();
    check(rt.session.stash.length === 48 && rt.session.pack.length === 1 && rt.session.pack[0].uid === "extra-0", "stash cannot exceed 48");
    check(!!overStash && overStash.classList.contains("deny"), "a full stash shakes the control");

    rt.session.pack = gearList(24, "pk");
    rt.session.stash = gearList(1, "back");
    rt.openPanel("bank", stationNamed("The Counting House"));
    const overPack = panel.querySelector('[data-act="pack"]');
    if (overPack) overPack.click();
    check(rt.session.pack.length === 24 && rt.session.stash.length === 1, "pack cannot exceed 24");

    rt.session.pack = [];
    rt.session.stash = [];
    rt.session.purse = 0;
    rt.openPanel("store", { x: -6.5, z: 2.5, id: "store" });
    rt.session.pack = [rareBlade];
    rt.openPanel("store", { x: -6.5, z: 2.5, id: "store" });
    const firstSell = panel.querySelector('[data-act="sell"]');
    if (firstSell) firstSell.click();
    for (let i = 0; i < 8; i++) {
      rt.session.pack = [{
        uid: "bb-" + i,
        kind: "gear",
        slot: "weapon",
        rarity: 0,
        ilvl: 1,
        affixes: [],
        name: "Board " + i
      }];
      rt.openPanel("store", { x: -6.5, z: 2.5, id: "store" });
      const again = panel.querySelector('[data-act="sell"]');
      if (again) again.click();
    }
    const remembered = rt.listBuyback();
    const saved = rt.captureSaveDoc();
    const savedJson = JSON.stringify(saved);
    check(remembered.length === 8 && remembered.every((entry) => entry.uid !== "rare-3") && remembered.some((entry) => entry.uid === "bb-7"), "the session keeps the last 8 sales");
    check(!Object.prototype.hasOwnProperty.call(saved, "buyback") && !Object.prototype.hasOwnProperty.call(saved.hero, "buyback") && savedJson.indexOf("buyback") < 0 && savedJson.indexOf("bb-7") < 0 && savedJson.indexOf("rare-3") < 0, "buyback is not written into the save");
    const buyBackBtn = panel.querySelector('[data-act="buyback"]');
    const purseBeforeBack = rt.session.purse;
    if (buyBackBtn) buyBackBtn.click();
    check(rt.session.pack.length === 1 && rt.session.pack[0].uid === "bb-7" && rt.session.purse === purseBeforeBack - 1 && rt.listBuyback().length === 7, "buyback returns the sale for the gold it paid");

    tap("Escape");
    check(panel.hidden, "Escape closes the store");
    rt.refreshTownPrompt();
    rt.keyPrompt.node.click();
    check(!panel.hidden, "a click on the prompt opens the store");
    const flameBefore = rt.flame.rotation.y;
    update(0.05);
    check(Math.abs(rt.flame.rotation.y - flameBefore) > 0.001 && !panel.hidden, "town time is not frozen while the store is open");
    {
      const sp = besideStation("Bramble & Board", 4);
      player.position.x = sp.x;
      player.position.z = sp.z;
    }
    rt.refreshTownPrompt();
    check(panel.hidden, "walking past 3.2 m closes the store");

    rt.openPanel("store", stationNamed("Bramble & Board"));
    {
      const sp = besideStation("The Quench", 1.6);
      player.position.x = sp.x;
      player.position.z = sp.z;
    }
    tap("KeyF");
    check(!panel.hidden && panel.querySelector(".eyebrow") && panel.querySelector(".eyebrow").textContent === "The Quench" && panel.textContent.indexOf("Bramble") < 0, "F at the Quench closes the store and opens the smith");

    check(abilities[4].id === "draught" && slots[4].querySelector(".name").textContent === "Draught", "slot 5 is Draught");
    vitals.hp = 100;
    rt.session.pack = [];
    tap("Digit4");
    check(vitals.hp === 100 && castLine.textContent === "You have no draught." && slots[4].classList.contains("deny"), "an empty pack shakes slot 5 and says you have no draught");
    rt.session.pack = [{
      uid: "mp-only",
      kind: "consumable",
      consumableId: "draught-mp",
      charges: 1,
      stack: 1,
      rarity: 0,
      ilvl: 1,
      affixes: [],
      name: "Mana Draught"
    }];
    tap("Digit4");
    check(vitals.hp === 100 && rt.session.pack[0].stack === 1, "slot 5 does not drink a mana draught");
    rt.session.pack = [{
      uid: "hp-1",
      kind: "consumable",
      consumableId: "draught-hp",
      charges: 1,
      stack: 1,
      rarity: 0,
      ilvl: 1,
      affixes: [],
      name: "Health Draught"
    }];
    cdLeft[4] = 0;
    tap("Digit4");
    check(vitals.hp === 145 && rt.session.pack.length === 0 && cdLeft[4] === 0, "slot 5 drinks one health draught for 45");
    rt.session.pack = [{
      uid: "hp-2",
      kind: "consumable",
      consumableId: "draught-hp",
      charges: 1,
      stack: 2,
      rarity: 0,
      ilvl: 1,
      affixes: [],
      name: "Health Draught"
    }];
    vitals.hp = 150;
    tryAbility(4);
    check(vitals.hp === 160 && rt.session.pack[0].stack === 1, "a health draught stops at full health");
    tryAbility(4);
    check(vitals.hp === 160 && rt.session.pack[0].stack === 1 && castLine.textContent === "You are already hale.", "full health does not spend a draught");

    // Open town green: no station, building, or road.
    player.position.x = 9;
    player.position.z = 12;
    rt.refreshTownPrompt();
    const px = player.position.x;
    const pz = player.position.z;
    rt.session.purse = 0;
    rt.session.pack = [];
    rt.groundDrops.length = 0;
    rt.groundDrops.push(
      { kind: "gold", amount: 3, x: px + 1, z: pz },
      { kind: "gold", amount: 4, x: px, z: pz + 1 },
      { kind: "gold", amount: 5, x: px - 1, z: pz },
      { kind: "gold", amount: 1, x: px + 1.35, z: pz },
      { kind: "gold", amount: 8, x: px, z: pz + 1.36 },
      { kind: "draught", consumableId: "draught-hp", stack: 2, x: px + 0.4, z: pz },
      { kind: "draught", consumableId: "draught-mp", stack: 1, x: px + 3, z: pz },
      { kind: "gear", uid: "ground-gear", x: px + 0.2, z: pz }
    );
    update(0.016);
    check(rt.session.purse === 13, "three gold piles at 1 m join the purse after one update (" + rt.session.purse + ")");
    check(rt.groundDrops.some((drop) => drop.kind === "gold" && drop.amount === 8), "gold past 1.35 m stays on the ground");
    check(rt.groundDrops.some((drop) => drop.kind === "gear" && drop.uid === "ground-gear"), "ground gear is not picked up");
    const takenDraught = rt.session.pack.find((item) => item && item.consumableId === "draught-hp");
    check(!!takenDraught && takenDraught.stack === 2 && !rt.groundDrops.some((drop) => drop.consumableId === "draught-hp"), "a health draught within 1.35 m is taken");
    check(rt.groundDrops.some((drop) => drop.consumableId === "draught-mp"), "a draught past 1.35 m stays on the ground");

    rt.session.pack = [{
      uid: "pre",
      kind: "consumable",
      consumableId: "draught-hp",
      charges: 1,
      stack: 19,
      rarity: 0,
      ilvl: 1,
      affixes: [],
      name: "Health Draught"
    }];
    rt.groundDrops.length = 0;
    rt.groundDrops.push({ kind: "draught", consumableId: "draught-hp", stack: 2, x: player.position.x, z: player.position.z });
    update(0.016);
    check(rt.session.pack.length === 2 && rt.session.pack[0].stack === 20 && rt.session.pack[1].stack === 1 && rt.groundDrops.length === 0, "picked draughts merge until 20 and then overflow");

    rt.session.pack = gearList(24, "fullpick");
    rt.session.purse = 0;
    rt.groundDrops.length = 0;
    rt.groundDrops.push(
      { kind: "gold", amount: 6, x: player.position.x + 0.5, z: player.position.z },
      { kind: "draught", consumableId: "draught-hp", stack: 1, x: player.position.x, z: player.position.z + 0.5 }
    );
    update(0.016);
    check(rt.session.purse === 6 && rt.session.pack.length === 24 && rt.groundDrops.some((drop) => drop.kind === "draught"), "a full pack leaves the draught and still takes the gold");
    check(castLine.textContent === "Your pack is full.", "a full pack says Your pack is full.");
    check(rt.session.townUnlocks.stall === false, "the store does not raise a stall");

    const keepMesh = rt.meters.lastMeshMs;
    const keepGen = rt.meters.lastGenMs;
    rt.groundDrops.length = 0;
    rt.groundDrops.push({ kind: "gold", amount: 2, x: 1, z: 1 });
    rt.suspendCombat = true;
    rt.startRun(4, 1);
    check(rt.groundDrops.length === 0, "ground drops die when the floor changes");
    rt.groundDrops.push({ kind: "gold", amount: 4, x: 0, z: 0 });
    rt.freshGame();
    rt.suspendCombat = false;
    check(rt.groundDrops.length === 0 && rt.listBuyback().length === 0, "entering town clears ground drops and a loaded session has no buyback");
    rt.meters.lastMeshMs = keepMesh;
    rt.meters.lastGenMs = keepGen;
    if (rt.flushSave) rt.flushSave();

    keys.KeyW = false;
    keys.KeyA = false;
    keys.KeyS = false;
    keys.KeyD = false;
    player.position.set(9, groundY(9, 12), 12);
    rt.refreshTownPrompt();
    let sample = null;
    for (let id = 0; id < 80 && !sample; id++) {
      sample = rollGearDrop(lootRng(21, 6, id), { floorIndex: 6, spawnId: id, kind: "normal", ordinal: 0 });
    }
    check(!!sample && typeof sample.name === "string" && sample.name.length > 0 && !Object.prototype.hasOwnProperty.call(sample, "identified"), "a dropped item's name is known on the roll");
    rt.session.pack = [];
    rt.groundDrops.length = 0;
    const near = rt.placeGearDrop(sample, player.position.x + 0.4, player.position.z);
    update(0.016);
    check(rt.session.pack.length === 1 && rt.session.pack[0] === sample && !near.mesh, "gear within 1.35 m enters the pack and the glint goes");
    rt.session.pack = [];
    const farGear = rt.placeGearDrop(sample, player.position.x + 2, player.position.z);
    update(0.016);
    check(rt.groundDrops.indexOf(farGear) >= 0 && farGear.mesh && farGear.mesh.parent, "gear past 1.35 m keeps its glint");
    check(rt.tryPickupGear() === true && rt.session.pack[0] === sample && !farGear.mesh, "F takes the nearest gear within 2.2 m");
    rt.session.pack = gearList(24, "glintfull");
    const held = rollGearDrop(lootRng(2, 9, 1), { floorIndex: 9, spawnId: 1, kind: "boss", ordinal: 0 });
    const glint = rt.placeGearDrop(held, player.position.x, player.position.z);
    const glintMesh = glint.mesh;
    update(0.016);
    check(rt.session.pack.length === 24 && rt.groundDrops.indexOf(glint) >= 0 && glintMesh.parent && glintMesh.material.flatShading === true && glintMesh.material.type === "MeshLambertMaterial" && !glintMesh.material.map, "a full pack does not consume the glint");
    check(castLine.textContent === "Your pack is full.", "a full pack of gear says Your pack is full.");
    check(glintMesh.userData.rarity === held.rarity && held.rarity >= 2 && !!glintMesh.getObjectByName("glintBeam") && !!glintMesh.getObjectByName("glintRing"), "a boss drop stands in a beam and ring of its rarity");
    rt.suspendCombat = true;
    rt.startRun(3, 1);
    check(!glintMesh.parent && rt.groundDrops.indexOf(glint) < 0, "leaving the floor deletes the glint");
    rt.freshGame();
    // Putting on a rare or better piece flashes; a fresh ledger does not.
    update(0.016);
    for (let i = 0; i < 25; i++) update(0.05);
    rt.session.equipped[held.slot] = Object.assign({}, held, { uid: "flash-test" });
    update(0.016);
    check(rt.equipFlashActive && rt.equipFlashActive(), "equipping a rare or better piece flashes on the Warden");
    for (let i = 0; i < 25; i++) update(0.05);
    rt.freshGame();
    update(0.016);
    check(rt.equipFlashActive && !rt.equipFlashActive(), "a fresh ledger does not flash");
    rt.suspendCombat = false;
    player.position.set(-6.5, groundY(-6.5, 4.5), 4.5);
    rt.openPanel("store", { x: -6.5, z: 2.5, id: "store" });
    const offBtn = panel.querySelector('[data-act="unequip"][data-slot="weapon"]');
    if (offBtn) offBtn.click();
    const unarmed = strikeDamage({ level: rt.session.level, might: rt.session.might, tracks: rt.session.tracks }, rt.session.blade);
    check(unarmed === 0 && rt.session.equipped.weapon === null && rt.session.equipped.offhand && rt.session.equipped.offhand.baseId === "shield", "unequip drops strike to 0 when the weapon was the only base (" + unarmed + ")");
    const onBtn = panel.querySelector('[data-act="equip"]');
    if (onBtn) onBtn.click();
    const armed = strikeDamage({ level: rt.session.level, might: rt.session.might, tracks: rt.session.tracks }, rt.session.blade);
    check(armed === 17 && rt.session.blade && rt.session.blade.themeId === 0 && rt.session.blade.weaponBase === 12, "equipping the heirloom blade returns strike to 17 at level 1 (" + armed + ")");
    const prevHead = rt.session.equipped.head;
    const hat = {
      uid: "hat",
      kind: "gear",
      slot: "head",
      rarity: 1,
      ilvl: 1,
      baseId: "circlet",
      themeId: 0,
      affixes: [{ id: "might", t: 0 }],
      name: "Mighty Moss Circlet"
    };
    const expectMight = Math.round(affixValue(affixDef("might"), hat.affixes[0], 1));
    rt.session.equipped.head = hat;
    rt.derivePools();
    check(rt.session.might === 9 + rt.session.level + expectMight && rt.vitals.hpMax === 40 + rt.session.might * 8 + rt.session.guard * 4 + gearTotals(rt.session.equipped).flatHp, "equipped Might raises the pool through gearTotals");
    rt.session.equipped.head = prevHead;
    rt.derivePools();
    rt.vitals.hp = rt.vitals.hpMax;
    rt.vitals.mp = rt.vitals.mpMax;
    rt.session.pack = [];
    if (rt.closePanel) rt.closePanel();

    const edgeMuls = [1, 1.12, 1.12, 1.28, 1.28, 1.45];
    const arcDegs = [100, 100, 120, 120, 120, 120];
    const wardCosts = [8, 8, 8, 8, 6, 6];
    const mendHeals = [22, 30, 30, 40, 40, 48];
    const walks = [6.4, 6.4, 6.4, 6.4, 7, 7];
    const sprints = [11.5, 12.4, 12.4, 12.4, 12.4, 12.4];
    for (let rank = 0; rank <= 5; rank++) {
      check(edgeMul(rank) === edgeMuls[rank], "edge " + rank + " damage multiplier " + edgeMul(rank));
      check(strikeArcDeg(rank) === arcDegs[rank], "edge " + rank + " arc " + strikeArcDeg(rank));
      check(wardCost(rank) === wardCosts[rank], "bulwark " + rank + " ward cost " + wardCost(rank));
      check(mendHeal(rank) === mendHeals[rank], "mend " + rank + " heal " + mendHeal(rank));
      check(walkSpeed(rank) === walks[rank], "delver " + rank + " walk " + walkSpeed(rank));
      check(sprintSpeed(rank) === sprints[rank], "delver " + rank + " sprint " + sprintSpeed(rank));
    }
    check(extractSeconds(0) === 2.6 && extractSeconds(2) === 2 && extractSeconds(5) === 2, "delver extract is 2.6 s, then 2.0 s from rank 2");
    check(wardAbsorb(10, 0, 1) === 30, "ward at guard 10 rank 0 grants 30");
    check(mendHeal(0) === 22 && mendCost(0) === 14 && mendHeal(5) === 48 && mendCost(5) === 10, "mend rank 0 is 22 for 14 and rank 5 is 48 for 10");
    const xpHero = { level: 1, xp: 0, skillPoints: 0 };
    grantXp(xpHero, 5 * killXp(1));
    check(xpHero.level === 2 && xpHero.xp === 22 && xpHero.skillPoints === 1, "five floor-1 kills reach level 2 with 22 xp and 1 point");
    const chainHero = { level: 1, xp: 0, skillPoints: 0 };
    grantXp(chainHero, xpToNext(1) + xpToNext(2));
    check(chainHero.level === 3 && chainHero.xp === 0 && chainHero.skillPoints === 2, "level-up chains and banks a point per level");
    check(xpGrant(1) === 12 && xpGrant(1, { elite: true }) === 30 && xpGrant(1, { boss: true }) === 72 && xpGrant(1, { elite: true, boss: true }) === 72, "kill xp uses elite 2.5 and boss 6, and a boss is not also elite");

    rt.session.level = 1;
    rt.session.xp = 0;
    rt.session.skillPoints = 0;
    rt.session.tracks = { edge: 0, bulwark: 0, mend: 0, delver: 0, oath: 2 };
    if (rt.derivePools) rt.derivePools();
    {
      const sp = stationWorld(BUILDINGS.find((bd) => bd.id === "trainer"));
      player.position.set(sp.x, groundY(sp.x, sp.z), sp.z);
    }
    rt.refreshTownPrompt();
    check(rt.keyPrompt.label() === "The Circle", "the F prompt names The Circle");
    tap("KeyF");
    check(!panel.hidden && panel.querySelector(".eyebrow") && panel.querySelector(".eyebrow").textContent === "The Circle", "F at the Circle opens the trainer");
    const trainerBox = panel.getBoundingClientRect();
    check(trainerBox.width <= 940 && Math.abs(trainerBox.left + trainerBox.width / 2 - window.innerWidth / 2) < 2 && panel.querySelectorAll(".track-grid .track").length === 4, "the Circle opens the same centred window with four training cards (" + trainerBox.width.toFixed(1) + ")");
    check(getComputedStyle(panel).transform === "none", "the trainer plaque is not moved to the viewport center");
    check(panel.textContent.indexOf("Edge") >= 0 && panel.textContent.indexOf("Bulwark") >= 0 && panel.textContent.indexOf("Mend") >= 0 && panel.textContent.indexOf("Delver") >= 0 && panel.textContent.indexOf("Unspent points 0") >= 0, "the trainer lists the four tracks and unspent points");
    check(panel.textContent.indexOf("oath") < 0 && panel.innerHTML.indexOf("<img") < 0, "extra tracks are not painted and names stay text");
    const raises = panel.querySelectorAll('[data-act="raise"]');
    check(raises.length === 4 && raises[0].textContent === "Raise" && raises[3].textContent === "Raise", "one Raise control per track");
    raises[0].click();
    check(rt.session.tracks.edge === 0 && rt.session.skillPoints === 0 && raises[0].classList.contains("deny"), "the trainer refuses a raise at 0 points");

    rt.session.run = { runSeed: 1, floorIndex: 1, killed: [], picked: [], enemyHp: {}, summons: [], floorGuard: false };
    function smack(flags, id) {
      const foe = { x: player.position.x, z: player.position.z - 1.2, hp: 1, hurt: 0.45, id: id };
      if (flags && flags.elite) foe.elite = true;
      if (flags && flags.boss) foe.boss = true;
      rt.resolveStrikeAt({ x: player.position.x, z: player.position.z }, { x: 0, z: -1 }, [foe]);
    }
    smack({ elite: true }, 8100);
    check(rt.session.level === 1 && rt.session.xp === xpGrant(1, { elite: true }), "a floor-1 elite kill grants killXp times 2.5 (" + rt.session.xp + ")");
    rt.session.xp = 0;
    smack({ boss: true }, 8101);
    check(rt.session.level === 2 && rt.session.xp === 34 && rt.session.skillPoints === 1, "a floor-1 boss kill grants 72 xp and chains one level");
    rt.session.level = 1;
    rt.session.xp = 0;
    rt.session.skillPoints = 0;
    if (rt.derivePools) rt.derivePools();
    for (let i = 0; i < 5; i++) smack(null, 8200 + i);
    check(rt.session.level === 2 && rt.session.xp === 22 && rt.session.skillPoints === 1 && rt.session.tracks.oath === 2, "five floor-1 kills in the run grant 60 xp");
    rt.session.run = null;

    rt.openPanel("trainer", { x: 0.5, z: 7.5, id: "trainer" });
    const edgeBtn = panel.querySelector('[data-act="raise"][data-track="edge"]');
    if (edgeBtn) edgeBtn.click();
    const raised = strikeDamage({ level: 1, might: 10, tracks: { edge: 1 } }, { weaponBase: 12, ilvl: 1, affixes: [] });
    check(rt.session.tracks.edge === 1 && rt.session.skillPoints === 0 && edgeMul(rt.session.tracks.edge) === 1.12 && raised === Math.round(12 * (1 + 10 * 0.04) * 1.12), "one Edge raise sets rank 1 and the strike multiplier 1.12 (" + raised + ")");
    check(rt.session.tracks.oath === 2, "raising Edge leaves an extra track in place");
    rt.session.tracks.edge = 5;
    rt.session.skillPoints = 2;
    rt.openPanel("trainer", { x: 0.5, z: 7.5, id: "trainer" });
    const capBtn = panel.querySelector('[data-act="raise"][data-track="edge"]');
    if (capBtn) capBtn.classList.remove("deny");
    if (capBtn) capBtn.click();
    check(rt.session.tracks.edge === 5 && rt.session.skillPoints === 2 && capBtn && capBtn.classList.contains("deny"), "rank 5 refuses another raise");
    rt.session.skillPoints = 0;
    rt.session.tracks.edge = 1;
    rt.openPanel("trainer", { x: 0.5, z: 7.5, id: "trainer" });
    const broke = panel.querySelector('[data-act="raise"][data-track="edge"]');
    if (broke) broke.click();
    check(rt.session.tracks.edge === 1 && rt.session.skillPoints === 0 && broke && broke.classList.contains("deny"), "0 points refuses another raise");

    rt.session.tracks.edge = 1;
    rt.session.tracks.oath = 2;
    rt.session.skillPoints = 4;
    rt.session.xp = 22;
    const rankDoc = rt.flushSave();
    check(!!rankDoc && rankDoc.hero.tracks.edge === 1 && rankDoc.hero.tracks.oath === 2 && rankDoc.hero.skillPoints === 4, "the ledger stores edge, the extra track, and unspent points");
    rt.session.tracks = { edge: 0, bulwark: 0, mend: 0, delver: 0 };
    rt.session.skillPoints = 0;
    rt.loadStoredGame();
    check(rt.session.tracks.edge === 1 && rt.session.tracks.oath === 2 && rt.session.skillPoints === 4 && rt.session.level === 2 && rt.session.xp === 22, "ranks and the extra track round-trip through save and load");

    rt.session.tracks.mend = 0;
    vitals.hp = 100;
    vitals.mp = 80;
    cdLeft[2] = 0;
    const mendRank0 = tryAbility(2);
    rt.stepCombat(1.49);
    const mpRank0 = vitals.mp;
    rt.stepCombat(0.02);
    check(mendRank0.ok && vitals.hp === 122 && Math.abs(vitals.mp - (mpRank0 - 14)) < 0.2, "Mend rank 0 still heals 22 and spends 14 mana (" + vitals.hp + " hp, " + vitals.mp + " mp)");

    if (rt.closePanel) rt.closePanel();
    rt.freshGame();
    if (rt.holdSaves) rt.holdSaves();

    check(delverMatBonus(0, 0) === 0 && materialDropCount("normal", 0, 0) === 1 && materialDropCount("normal", 2, 0) === 1 && materialDropCount("elite", 0, 0.1) === 2 && materialDropCount("boss", 0, 0) === 4 && materialDropCount("normal", 3, 0) === 2 && materialDropCount("normal", 3, 0.4) === 1, "delver's material bonus is 0 at rank 0 and only adds 1 once rank is high enough");
    const capped = { kind: "gear", slot: "weapon", ilvl: 4, themeId: 0, weaponBase: 15, affixes: [{ id: "might", t: 0.2 }] };
    const capState = { purse: 1000, bestDepth: 4, pack: [], materials: { heartwood: 9, rootfiber: 0, slag: 0, emberglass: 0 } };
    check(tryUpgrade(capState, capped).ok === false && capped.ilvl === 4 && capped.affixes[0].t === 0.2 && capState.materials.heartwood === 9 && capState.purse === 1000, "an ilvl-4 upgrade is refused when bestDepth is 4");
    capState.bestDepth = 5;
    check(tryUpgrade(capState, capped).ok === true && capped.ilvl === 5 && capped.weaponBase === 16 && capped.affixes[0].id === "might" && capped.affixes[0].t === 0.2 && capState.materials.heartwood === 7, "bestDepth 5 raises that same item to ilvl 5 without changing t");
    const fullCraft = { purse: 10, nextUid: 3, bestDepth: 0, pack: [], tracks: { delver: 0 }, materials: { heartwood: 1, rootfiber: 0, slag: 0, emberglass: 0 } };
    for (let i = 0; i < 24; i++) fullCraft.pack.push({ kind: "gear", name: "Full " + i });
    check(tryCraft(fullCraft, "draught-hp").ok === false && fullCraft.materials.heartwood === 1 && fullCraft.purse === 10 && fullCraft.pack.length === 24, "a full pack refuses a craft and consumes nothing");
    const kitState = { purse: 56, bestDepth: 2, pack: [{ kind: "consumable", consumableId: "kit", stack: 1, charges: 1 }], materials: { heartwood: 0, rootfiber: 0, slag: 0, emberglass: 0 } };
    const kitBlade = { kind: "gear", slot: "weapon", ilvl: 1, themeId: 0, weaponBase: 12, affixes: [{ id: "keen", t: 0.42 }] };
    check(tryUpgrade(kitState, kitBlade, true).ok === true && kitBlade.ilvl === 2 && kitBlade.weaponBase === 13 && kitBlade.affixes[0].id === "keen" && kitBlade.affixes[0].t === 0.42 && kitState.purse === 0 && kitState.materials.heartwood === 0 && kitState.pack.length === 0, "a kit covers the material half and 56 gold is still due");

    const quenched = rt.session.equipped.weapon;
    const keptAffix = { id: "keen", t: 0.42 };
    quenched.affixes = [keptAffix];
    rt.session.bestDepth = 0;
    rt.session.purse = 56;
    rt.session.pack = [];
    rt.session.nextUid = 1;
    rt.session.materials.heartwood = 2;
    rt.session.materials.rootfiber = 0;
    rt.session.materials.slag = 0;
    rt.session.materials.emberglass = 0;
    player.position.set(6.2, groundY(6.2, 3.4), 3.4);
    rt.openPanel("smith", { x: 6.2, z: 3.4, id: "smith", name: "The Quench" });
    check(!panel.hidden && panel.querySelector(".eyebrow") && panel.querySelector(".eyebrow").textContent === "The Quench", "The Quench opens on the shared plaque");
    const depth0 = panel.querySelector('[data-act="upgrade"][data-slot="weapon"]');
    if (depth0) depth0.click();
    check(!!depth0 && quenched.ilvl === 1 && quenched.weaponBase === 12 && rt.session.materials.heartwood === 2 && rt.session.purse === 56 && quenched.affixes[0] === keptAffix, "bestDepth 0 refuses the ilvl-1 heirloom");
    rt.session.bestDepth = 1;
    rt.openPanel("smith", { x: 6.2, z: 3.4, id: "smith" });
    const depth1 = panel.querySelector('[data-act="upgrade"][data-slot="weapon"]');
    if (depth1) depth1.click();
    check(!!depth1 && quenched.ilvl === 1 && quenched.weaponBase === 12 && rt.session.materials.heartwood === 2 && rt.session.purse === 56 && keptAffix.t === 0.42, "bestDepth 1, a floor-1 extract, still refuses the ilvl-1 heirloom");
    rt.session.bestDepth = 2;
    rt.session.purse = 55;
    rt.openPanel("smith", { x: 6.2, z: 3.4, id: "smith" });
    const shortGold = panel.querySelector('[data-act="upgrade"][data-slot="weapon"]');
    if (shortGold) shortGold.classList.remove("deny");
    if (shortGold) shortGold.click();
    check(!!shortGold && quenched.ilvl === 1 && rt.session.materials.heartwood === 2 && rt.session.purse === 55 && shortGold.classList.contains("deny"), "short gold refuses the upgrade and does not consume heartwood");
    rt.session.purse = 10;
    rt.session.materials.heartwood = 1;
    rt.session.pack = [];
    rt.session.nextUid = 1;
    rt.openPanel("smith", { x: 6.2, z: 3.4, id: "smith" });
    check(!panel.querySelector('[data-act="craft"][data-recipe="draught-hp"]') && !!panel.querySelector('[data-act="craft"][data-recipe="kit"]'), "the Quench lists oil and kits but no draughts");
    rt.openPanel("still", stationNamed("The Still"));
    check(!panel.hidden && panel.querySelector(".eyebrow") && panel.querySelector(".eyebrow").textContent === "The Still" && panel.textContent.indexOf("Sister Wen") >= 0, "The Still opens with Sister Wen at the counter");
    const craftHp = panel.querySelector('[data-act="craft"][data-recipe="draught-hp"]');
    if (craftHp) craftHp.click();
    const crafted = rt.session.pack[0];
    check(!!craftHp && !!crafted && crafted.consumableId === "draught-hp" && crafted.stack === 3 && crafted.uid === "craft-1" && rt.session.materials.heartwood === 0 && rt.session.purse === 0 && rt.session.pack.length === 1, "draught-hp consumes 1 heartwood and 10 gold and stacks 3");
    rt.session.pack = [];
    rt.session.materials.heartwood = 2;
    rt.session.purse = 56;
    rt.session.bestDepth = 2;
    rt.openPanel("smith", { x: 6.2, z: 3.4, id: "smith" });
    const depth2 = panel.querySelector('[data-act="upgrade"][data-slot="weapon"]');
    if (depth2) depth2.click();
    check(!!depth2 && quenched.ilvl === 2 && quenched.weaponBase === 13 && quenched.affixes[0] === keptAffix && keptAffix.id === "keen" && keptAffix.t === 0.42 && rt.session.materials.heartwood === 0 && rt.session.purse === 0, "bestDepth 2 spends 56 gold and 2 heartwood and keeps the affix id and t");
    let smithRaise = false;
    const smithButtons = panel.querySelectorAll("button");
    for (let i = 0; i < smithButtons.length; i++) {
      if (smithButtons[i].textContent.toLowerCase().indexOf("raise") >= 0) smithRaise = true;
    }
    check(!smithRaise && rt.session.townUnlocks && rt.session.townUnlocks.stall === false, "the quench has no raise control and stall stays false");
    quenched.ilvl = 1;
    quenched.weaponBase = 12;
    quenched.affixes = [];
    rt.session.bestDepth = 0;
    rt.session.purse = 0;
    rt.session.pack = [];
    rt.session.materials.heartwood = 0;
    if (rt.derivePools) rt.derivePools();

    check(telegraphSeconds(0.45, "hasted") === 0.35 && telegraphSeconds(0.40, "hasted") === 0.35 && telegraphSeconds(0.70, "hasted") === 0.6 && telegraphSeconds(0.45, null) === 0.45, "hasted telegraph is max(0.35, base - 0.1)");
    const hastedSpeed = foeProfile(4, "skirmisher", "hasted", false).speed;
    check(Math.abs(hastedSpeed - 4.6 * 1.25) < 1e-9 && foeProfile(1, "brute", null, false).hp === Math.round(skirmisherHp(1) * 2.1) && enemyLevel(1) === 1, "hasted speed is 4.6 × 1.25 and a brute keeps enemy level 1");
    const hasted = {
      archetype: "skirmisher",
      eliteAffix: "hasted",
      state: "approach",
      x: 0,
      z: 0,
      spawnX: 0,
      spawnZ: 0,
      hp: 10,
      hpMax: 10,
      speed: hastedSpeed,
      range: 1.5,
      hurt: 0.45,
      telegraphBase: 0.45,
      telegraph: 0,
      yaw: 1
    };
    const quietWorld = { px: 1, pz: 0, los: function () { return true; }, resolve: function (x, z) { return { x: x, z: z }; } };
    stepFoe(hasted, 0.016, quietWorld);
    check(hasted.state === "telegraph" && Math.abs(hasted.telegraph - (0.35 - 0.016)) < 1e-6, "a hasted skirmisher telegraph is 0.35 s (" + hasted.telegraph + ")");
    const heldTell = stepFoe(hasted, 0.30, quietWorld);
    check(hasted.state === "telegraph" && hasted.telegraph > 0 && !heldTell, "the hasted telegraph does not resolve before 0.35 s");
    const brute = {
      archetype: "brute",
      state: "telegraph",
      telegraph: 0.7,
      lockYaw: true,
      attack: "arc",
      yaw: 0.4,
      x: 1,
      z: 2,
      spawnX: 1,
      spawnZ: 2,
      speed: 3.1,
      range: 2,
      hurt: 0.55,
      hp: 20,
      hpMax: 20
    };
    const bruteStep = stepFoe(brute, 0.2, { px: 8, pz: -4, los: function () { return true; }, resolve: function (x, z) { return { x: x, z: z }; } });
    check(bruteStep == null && brute.yaw === 0.4 && brute.x === 1 && brute.z === 2 && brute.state === "telegraph", "a brute windup locks facing and feet");
    const shade = { archetype: "shade", hp: 100, hpMax: 100, shadeAbsorb: 0, shadeT: 0, shadeUsed: false };
    applyFoeDamage(shade, 60);
    check(shade.hp === 40 && shade.shadeAbsorb === Math.round(40 * 0.2) && shade.shadeT === 3, "a shade at half health absorbs round(hp * 0.2)");
    applyFoeDamage(shade, 5);
    check(shade.hp === 40 && shade.shadeAbsorb === 3, "shade absorb is spent before hit points");
    check(orbHits(0, 0, 0.6, 0) === true && orbHits(0, 0, 0.8, 0) === false, "a spitter orb hits inside 0.25 + 0.42 and misses outside");
    const orb = { x: 0, z: 0, vx: 1, vz: 0, age: 0 };
    const blockedOrb = stepOrb(orb, 0.2, { x: 5, z: 0 }, function () { return true; });
    check(blockedOrb.removed === true && blockedOrb.hit === false && orb.x === 0, "an orb whose next step enters a wall is removed and deals 0");
    const packed = [];
    for (let i = 0; i < 36; i++) packed.push({ hp: 1 });
    check(livingCount(packed) === 36 && summonRoom(36) === 0, "36 living foes leave no summon room");
    packed[3].hp = 0;
    check(livingCount(packed) === 35 && summonRoom(35) === 1, "a dead foe does not count as living");
    let floor1Odd = "";
    let floor2Odd = "";
    for (let seed = 1; seed <= 40; seed++) {
      const early = generateFloor(seed, 1);
      for (let i = 0; i < early.spawns.length; i++) {
        if (early.spawns[i].archetype !== "skirmisher" || early.spawns[i].boss) floor1Odd = "seed " + seed;
      }
      const next = generateFloor(seed, 2);
      for (let i = 0; i < next.spawns.length; i++) {
        const name = next.spawns[i].archetype;
        if (name === "brute" || name === "shade") floor2Odd = "seed " + seed + " " + name;
      }
    }
    check(!floor1Odd, "floor 1 spawns are skirmishers" + (floor1Odd ? " (" + floor1Odd + ")" : ""));
    check(!floor2Odd, "seeds 1..40 on floor 2 have no brutes or shades" + (floor2Odd ? " (" + floor2Odd + ")" : ""));

    rt.suspendCombat = true;
    rt.startRun(1, 5);
    const stairBoss = (rt.enemies || []).find(function (e) { return e && e.boss; });
    const stairW = tileToWorld(rt.plan.stairs.col, rt.plan.stairs.row, rt.plan.cols, rt.plan.rows);
    check(!!stairBoss && Math.abs(stairBoss.x - stairW.x) < 1e-6 && Math.abs(stairBoss.z - stairW.z) < 1e-6, "the floor 5 boss stands on the stairs cell");
    player.position.set(stairW.x, 0, stairW.z);
    const stairHeld = rt.tryStairs();
    check(stairHeld === false && rt.session.run && rt.session.run.floorIndex === 5, "stairs refuse to descend while the boss lives");
    const bossExtract = rt.beginExtract();
    check(bossExtract.ok === true, "extract still starts during the boss");
    rt.cancelExtract();
    stairBoss.hp = 0;
    if (rt.session.run.killed.indexOf(stairBoss.id) < 0) rt.session.run.killed.push(stairBoss.id);
    check(rt.tryStairs() === true && rt.session.run.floorIndex === 6, "stairs descend once that boss is dead");

    rt.suspendCombat = true;
    rt.startRun(1, 5);
    const capBoss = (rt.enemies || []).find(function (e) { return e && e.boss; });
    while (livingCount(rt.enemies) < 36) rt.enemies.push({ hp: 1, id: 7300 + rt.enemies.length });
    const summoned = rt.spawnBossWave(capBoss);
    check(summoned === 0 && livingCount(rt.enemies) <= 36, "boss summons stop at 36 living");

    function foeSeed(floor, name) {
      for (let seed = 1; seed <= 40; seed++) {
        const plan = generateFloor(seed, floor);
        for (let i = 0; i < plan.spawns.length; i++) if (plan.spawns[i].archetype === name) return seed;
      }
      return 0;
    }
    const spitSeed = foeSeed(2, "spitter");
    rt.startRun(spitSeed || 1, 2);
    const orbMesh = rt.dungeonRoot && rt.dungeonRoot.userData.orbMesh;
    check(spitSeed > 0 && !!orbMesh && orbMesh.material.flatShading === true && !orbMesh.material.map && orbMesh.material.type === "MeshLambertMaterial", "spitter orbs are code-built, flat shaded, and untextured");
    const bruteSeed = foeSeed(3, "brute");
    rt.startRun(bruteSeed || 1, 3);
    let bruteFlat = false;
    if (rt.dungeonRoot) {
      rt.dungeonRoot.traverse(function (o) {
        if (o.name === "brute" && o.material && o.material.flatShading && o.material.type === "MeshLambertMaterial") bruteFlat = true;
      });
    }
    check(bruteSeed > 0 && bruteFlat, "brutes use a flat Lambert instance");
    const shadeSeed = foeSeed(6, "shade");
    rt.startRun(shadeSeed || 1, 6);
    let shadeFlat = false;
    if (rt.dungeonRoot) {
      rt.dungeonRoot.traverse(function (o) {
        if (o.name === "shade" && o.material && o.material.flatShading && o.material.type === "MeshLambertMaterial") shadeFlat = true;
      });
    }
    check(shadeSeed > 0 && shadeFlat, "shades use a flat Lambert instance");

    rt.suspendCombat = true;
    rt.startRun(1, 5);
    const resumeBoss = (rt.enemies || []).find(function (e) { return e && e.boss; });
    check(!!resumeBoss && resumeBoss.hp === resumeBoss.hpMax && resumeBoss.hpMax === skirmisherHp(5) * 8, "a fresh floor 5 boss starts at full boss hp");
    rt.session.run.enemyHp[resumeBoss.id] = 50;
    rt.vitals.hp = 90;
    rt.vitals.mp = 40;
    const bossSave = rt.flushSave();
    check(!!bossSave && bossSave.run && bossSave.run.enemyHp[resumeBoss.id] === 50, "the boss checkpoint stores 50 hp");
    rt.freshGame();
    rt.loadStoredGame();
    const resumedBoss = (rt.enemies || []).find(function (e) { return e && e.boss; });
    check(!!resumedBoss && resumedBoss.hp === 50 && resumedBoss.hpMax === skirmisherHp(5) * 8, "a resumed boss keeps the saved hp (" + (resumedBoss ? resumedBoss.hp : "missing") + ")");
    rt.freshGame();
    rt.suspendCombat = false;

    check(generateFloor(1, 1).themeId === 0 && generateFloor(1, 10).themeId === 0, "floors 1-10 are the Mossy Caves");
    check(generateFloor(1, 11).themeId === 1 && generateFloor(1, 20).themeId === 1, "floors 11-20 are the Sunken Temple");
    check(generateFloor(1, 41).themeId === 4 && generateFloor(1, 50).biomeKey === "forge", "floors 41-50 are the Ember Forge");
    check(biomeIndex(51) === 0 && generateFloor(1, 51).biomeKey === "cave", "floor 51 loops back to the caves");
    rt.suspendCombat = true;
    rt.startRun(1, 11);
    check(document.querySelector("#minimap .eyebrow").textContent === "Floor 11 · Sunken Temple", "floor 11 eyebrow reads Floor 11 · Sunken Temple");
    rt.startRun(1, 41);
    const emberBrow = document.querySelector("#minimap .eyebrow");
    check(!!rt.plan && rt.plan.themeId === 4 && emberBrow && emberBrow.textContent === "Floor 41 · Ember Forge", "floor 41 builds as the Ember Forge");
    const stroller = { id: 3, archetype: "skirmisher", state: "idle", hp: 10, hpMax: 10, x: 0, z: 0, spawnX: 0, spawnZ: 0, speed: 4.6, hurt: 0.45 };
    const farWorld = { px: 40, pz: 40, los: function () { return true; }, resolve: function (x, z) { return { x: x, z: z }; } };
    let strolled = 0;
    let strayed = 0;
    const strollRandom = countRandom(function () {
      for (let i = 0; i < 600; i++) {
        stepFoe(stroller, 0.033, farWorld);
        strolled = Math.max(strolled, Math.hypot(stroller.x, stroller.z));
      }
    });
    strayed = Math.hypot(stroller.x, stroller.z);
    check(strolled > 0.5 && strolled <= 2.65 && strayed <= 2.65 && stroller.state === "idle", "an idle foe strolls near its spawn and stays within 2.6 m (" + strolled.toFixed(2) + ")");
    check(strollRandom === 0, "idle strolling does not call Math.random");
    const wardenNear = { px: 1.5, pz: 0, los: function () { return true; }, resolve: function (x, z) { return { x: x, z: z }; } };
    stepFoe(stroller, 0.016, wardenNear);
    check(stroller.state !== "idle" && !stroller.wanderTo, "a strolling foe that sees the Warden drops the stroll");
    const atlasPlan = rt.plan;
    rt.tickHud(0.2);
    check(!!rt.tileSeen && rt.tileSeen(atlasPlan.entrance.col, atlasPlan.entrance.row) && !rt.tileSeen(atlasPlan.stairs.col, atlasPlan.stairs.row), "the atlas has seen the arrival tile and not yet the stairs");
    rt.toggleAtlas();
    const atlasNode = document.getElementById("atlas");
    check(rt.atlasOpen && atlasNode && !atlasNode.hidden && atlasNode.querySelector(".eyebrow").textContent === "Floor 41 · Ember Forge", "M opens the floor atlas with the floor title");
    rt.toggleAtlas();
    check(!rt.atlasOpen && atlasNode.hidden, "the atlas closes again");
    const barFoe = rt.enemies.find((e) => e && e.hp > 0 && !e.boss);
    const entW = tileToWorld(atlasPlan.entrance.col + 1, atlasPlan.entrance.row, atlasPlan.cols, atlasPlan.rows);
    const barHome = { x: barFoe.x, z: barFoe.z, hp: barFoe.hp };
    barFoe.x = entW.x;
    barFoe.z = entW.z;
    barFoe.hp = barFoe.hpMax;
    rt.tickHud(0.016);
    check(rt.foeBars.count() === 0, "a foe at full health shows no health bar");
    barFoe.hp = Math.round(barFoe.hpMax * 0.5);
    rt.tickHud(0.016);
    const barNode = document.querySelector("#foebars .foebar");
    check(rt.foeBars.visibleCount() === 1 && !!barNode && parseFloat(barNode.querySelector(".foebar-fill").style.width) === 50, "a wounded foe in sight shows a bar at its health (" + (barNode ? barNode.querySelector(".foebar-fill").style.width : "none") + ")");
    barFoe.hp = 0;
    rt.tickHud(0.016);
    check(rt.foeBars.count() === 0, "the bar goes when the foe dies");
    barFoe.hp = barHome.hp;
    rt.groundDrops.length = 0;
    const burstRun = rt.session.run;
    const burstX = barFoe.x;
    const burstZ = barFoe.z;
    burstRun.picked = [];
    rt.spawnKillLoot(barFoe, burstRun, true);
    const burstDrops = rt.groundDrops.slice();
    check(burstDrops.length > 0 && burstDrops.every((d) => !!d.fly), "kill loot leaves the body airborne (" + burstDrops.length + ")");
    player.position.set(burstDrops[0].x, 0, burstDrops[0].z);
    const burstPurse = rt.session.purse;
    const burstPack = rt.session.pack.length;
    rt.tickHud(0.016);
    check(rt.groundDrops.length === burstDrops.length && rt.session.purse === burstPurse && rt.session.pack.length === burstPack, "airborne loot cannot be picked up");
    player.position.set(burstX + 30, 0, burstZ + 30);
    for (let i = 0; i < 30; i++) rt.stepCombat(0.033);
    let burstOk = true;
    for (let i = 0; i < burstDrops.length; i++) {
      const d = burstDrops[i];
      const c = Math.round(d.x / 4 + (atlasPlan.cols - 1) / 2);
      const r = Math.round(d.z / 4 + (atlasPlan.rows - 1) / 2);
      const spread = Math.hypot(d.x - burstX, d.z - burstZ);
      if (d.fly || atlasPlan.tiles[r * atlasPlan.cols + c] !== 1 || spread > 1.75 || Math.abs(d.mesh.position.x - d.x) > 1e-6 || Math.abs(d.mesh.position.y - d.restY) > 1e-6) burstOk = false;
    }
    check(burstOk, "burst loot lands on floor within 1.75 m of the fallen foe and settles");
    for (let i = 0; i < burstDrops.length; i++) rt.releaseDropMesh(burstDrops[i]);
    rt.groundDrops.length = 0;
    barFoe.x = barHome.x;
    barFoe.z = barHome.z;
    rt.heroHurtFx(40);
    check(rt.hurtFlash() > 0.4 && rt.camShake > 0, "a hit flashes the screen edge red and shakes the camera");
    rt.tickHud(2);
    check(rt.hurtFlash() === 0, "the hurt flash fades out");
    rt.camShake = 0;
    rt.cdLeft[0] = 0;
    for (let i = 0; i < rt.enemies.length; i++) rt.enemies[i].stagger = 99;
    const swingStart = rt.beginStrike();
    rt.stepCombat(0.17);
    rt.poseHero(0);
    const swingCocked = rt.rightArm.rotation.x;
    const swingTwist = rt.body.rotation.y;
    rt.stepCombat(0.05);
    rt.stepCombat(0.05);
    rt.poseHero(0);
    const swingDone = rt.rightArm.rotation.x;
    const swingLunge = rt.body.position.z;
    const swingArc = rt.strikeCrescent.userData.material.opacity;
    check(swingStart.ok && swingCocked < -1.5 && swingTwist < -0.3 && swingDone > 0.6 && swingLunge < -0.15 && swingArc > 0.2, "the strike cocks the blade back, then whips it across with a lunge (" + swingCocked.toFixed(2) + " → " + swingDone.toFixed(2) + ")");
    for (let i = 0; i < 20; i++) rt.stepCombat(0.033);
    rt.poseHero(0);
    check(!rt.strikeInfo() && Math.abs(rt.body.rotation.y) < 1e-9 && Math.abs(rt.body.position.z) < 1e-9, "after the strike the body settles back to the walk pose");
    for (let i = 0; i < rt.enemies.length; i++) rt.enemies[i].stagger = 0;
    const hearthBegin = rt.beginExtract();
    rt.stepCombat(0.5);
    for (let i = 0; i < 20; i++) rt.poseHero(0.033);
    rt.tickHud(0.016);
    const hearthBar = document.getElementById("castbar");
    check(hearthBegin.ok && rt.hearthChannel.visible && rt.rightArm.rotation.x > 2 && rt.leftArm.rotation.x > 2, "holding the hearth raises both arms inside the rune ring");
    check(rt.castBar.shown() && /^Hearth/.test(rt.castBar.text()) && parseFloat(hearthBar.querySelector(".cast-track span").style.width) > 10, "the hearth shows a filling cast bar (" + rt.castBar.text() + ")");
    rt.noteExtractMove(2);
    rt.tickHud(0.016);
    check(!rt.extractInfo() && rt.castBar.shown() && /^Interrupted/.test(rt.castBar.text()), "moving breaks the hearth and the bar says Interrupted");
    rt.tickHud(1.2);
    for (let i = 0; i < 30; i++) rt.poseHero(0.033);
    check(!rt.castBar.shown() && !rt.hearthChannel.visible, "the bar and the rune ring clear away");
    let chestSeed = 0;
    for (let seed = 1; seed < 60 && !chestSeed; seed++) if (generateFloor(seed, 3).chests.length) chestSeed = seed;
    check(chestSeed > 0, "some floors hold a treasure chest");
    rt.startRun(chestSeed, 3);
    const chest = rt.dungeonRoot.userData.chests[0];
    const chestPlan = rt.plan.chests[0];
    const chestTile = tileToWorld(chestPlan.col, chestPlan.row, rt.plan.cols, rt.plan.rows);
    check(!!chest && !chest.opened && chest.gem.visible && Math.hypot(chestPlan.ox, chestPlan.oz) - (chestPlan.r || 0.55) >= 0.9, "a shut chest sits in a tile corner with its gem lit");
    player.position.set(chestTile.x, 0, chestTile.z);
    check(rt.chestNear() === chest, "standing by the chest offers it to F");
    rt.groundDrops.length = 0;
    check(rt.tryOpenChest() && chest.opened && rt.session.run.killed.indexOf(5000 + chest.id) >= 0, "F opens the chest and the run remembers it");
    const chestDrops = rt.groundDrops.slice();
    check(chestDrops.some((d) => d.kind === "gear") && chestDrops.some((d) => d.kind === "gold") && chestDrops.every((d) => !!d.fly), "the chest bursts out gear and gold (" + chestDrops.length + " drops)");
    player.position.set(chestTile.x + 30, 0, chestTile.z + 30);
    for (let i = 0; i < 30; i++) rt.stepCombat(0.033);
    check(chest.lid.rotation.x > 1.8 && !chest.gem.visible && chestDrops.every((d) => !d.fly), "the lid swings open and the loot settles");
    check(!rt.tryOpenChest(), "an open chest cannot be opened again");
    const chestDoc = JSON.parse(JSON.stringify(rt.captureSaveDoc()));
    rt.applySaveDoc(chestDoc);
    const reChest = rt.dungeonRoot.userData.chests[0];
    check(reChest.opened && rt.groundDrops.length === chestDrops.length && rt.groundDrops.every((d) => !d.fly), "a resumed floor shows the chest open with its loot already on the ground");

    // ---- Traps (docs/traps.md) ----
    let trapEarly = 0;
    let trapNearEntrance = 0;
    let trapRouteBad = 0;
    let trapTotal = 0;
    let trapOnThing = 0;
    let fireSeed = 0;
    let fireFloor = 0;
    let plateSeed = 0;
    for (let seed = 1; seed <= 40; seed++) {
      for (const floor of [1, 2, 3, 6, 9, 14, 25, 33, 45, 58]) {
        const plan = generateFloor(seed, floor);
        if (floor < 3) trapEarly += plan.traps.length;
        trapTotal += plan.traps.length;
        trapRouteBad += unreachableSwitches(plan).length;
        const ent = tileToWorld(plan.entrance.col, plan.entrance.row, plan.cols, plan.rows);
        for (const t of plan.traps) {
          const w = tileToWorld(t.col, t.row, plan.cols, plan.rows);
          if (Math.hypot(w.x - ent.x, w.z - ent.z) < SAFE_RADIUS) trapNearEntrance++;
          // Candles sit on their stands; the trap's own cell is just the room's middle.
          const cells = t.parts ? t.parts : [t];
          for (const at of cells) {
            if ((at.col === plan.stairs.col && at.row === plan.stairs.row) || plan.chests.some((c) => c.col === at.col && c.row === at.row) || plan.spawns.some((s) => s.col === at.col && s.row === at.row)) trapOnThing++;
          }
          if (t.kind === "fireWall" && !fireSeed && floor === 45) {
            fireSeed = seed;
            fireFloor = floor;
          }
          if (t.kind === "spikes" && !plateSeed && floor === 3) plateSeed = seed;
        }
      }
    }
    check(trapEarly === 0 && trapBudget(1) === 0 && trapBudget(2) === 0 && trapBudget(3) === 1, "floors 1 and 2 hold no traps; floor 3 has a budget of one");
    check(trapTotal > 200, "deeper floors hold traps (" + trapTotal + " over 400 plans)");
    check(trapNearEntrance === 0, "no trap within the entrance keep-out");
    check(trapOnThing === 0, "no trap on the stairs, a chest, or a foe's spawn cell");
    check(trapRouteBad === 0, "every fire wall's valve is reachable from the entrance with all fire walls standing");
    check(JSON.stringify(generateFloor(7, 30).traps) === JSON.stringify(generateFloor(7, 30).traps), "trap placement is deterministic");

    const jetDef = trapDef("flameJet");
    const jet = makeTrapState({ id: 0, kind: "flameJet", x: 0, z: 0, axis: "x", phase: 0 });
    stepTrap(jet, 0.01, jetDef.glow + jetDef.fire + 0.2, false);
    check(!jet.hot && trapHits(jet, 0, 0) && !trapStrikes(jet, "hero", 0), "a flame jet in its off window does not burn");
    stepTrap(jet, 0.01, jetDef.glow + 0.1, false);
    check(jet.hot && trapStrikes(jet, "hero", 1) && !trapStrikes(jet, "hero", 1 + jetDef.tick * 0.5) && trapStrikes(jet, "hero", 1 + jetDef.tick), "a firing jet burns on contact, then once per tick");
    check(!trapHits(jet, 0, jetDef.across + 0.5) && !trapHits(jet, jetDef.along + 0.5, 0), "the jet's footprint ends at its grate");
    const plate = makeTrapState({ id: 1, kind: "spikes", x: 0, z: 0 });
    stepTrap(plate, 0.016, 0, true);
    check(plate.state === "arming" && !plate.hot, "stepping on a plate arms it without hurting yet");
    stepTrap(plate, trapDef("spikes").arm + 0.01, 0, false);
    check(plate.hot && trapStrikes(plate, "hero", 0) && !trapStrikes(plate, "hero", 0.3), "the spikes hit each target once per firing");

    check(fireSeed > 0, "an Ember Forge floor holds a fire wall (seed " + fireSeed + ", floor " + fireFloor + ")");
    rt.startRun(fireSeed || 1, fireFloor || 3);
    rt.fillPools();
    const fireStates = rt.trapStates();
    const fireIdx = fireStates.findIndex((t) => t.kind === "fireWall");
    const fireView = rt.dungeonRoot.userData.traps[fireIdx];
    const fire = fireStates[fireIdx];
    check(!!fireView && !!fireView.sw && fireView.tongues.children.length > 0, "a fire wall is built with flames and a valve");
    const fireGuard = rt.session.guard;
    rt.session.wardAbsorb = 0;
    const hpBefore = rt.vitals.hp;
    player.position.set(fire.x, 0, fire.z);
    rt.tickTraps(0.016, true);
    check(rt.vitals.hp < hpBefore && hpBefore - rt.vitals.hp === incomingDamage(trapDamage(rt.session.run.floorIndex, trapDef("fireWall").dmgMul), fireGuard, 0).hpLoss, "walking into a fire wall burns for the trap's damage after guard (" + (hpBefore - rt.vitals.hp) + ")");
    const foe = (rt.enemies || []).find((e) => e && e.hp > 0);
    const foeHp = foe ? foe.hp : 0;
    if (foe) {
      foe.x = fire.x;
      foe.z = fire.z;
    }
    player.position.set(fireView.sw.x, 0, fireView.sw.z);
    rt.tickTraps(0.5, true);
    check(!!foe && foe.hp < foeHp, "a foe standing in the fire wall burns too");
    if (foe) {
      foe.x = foe.spawnX;
      foe.z = foe.spawnZ;
    }
    rt.fillPools();
    check(!!rt.valveNear() && rt.valveNear().trap === fire, "standing by the valve offers it to F");
    check(rt.tryUseValve() && rt.castInfo() && rt.castInfo().kind === "valve", "F starts turning the valve");
    for (let i = 0; i < 40; i++) rt.tickTraps(0.033, false);
    check(fire.disabled && !fire.hot && !fireView.tongues.visible && rt.session.run.killed.indexOf(TRAP_BASE + fire.id) >= 0, "the turned valve puts the fire wall out and the run remembers it");
    check(!rt.valveNear(), "a shut valve is not offered again");
    const trapDoc = JSON.parse(JSON.stringify(rt.captureSaveDoc()));
    rt.applySaveDoc(trapDoc);
    check(rt.trapStates()[fireIdx].disabled, "a resumed floor keeps the fire wall out");
    rt.trapStates()[fireIdx].disabled = false;
    rt.fillPools();
    const valveAgain = rt.dungeonRoot.userData.traps[fireIdx].sw;
    player.position.set(valveAgain.x, 0, valveAgain.z);
    rt.tryUseValve();
    player.position.set(valveAgain.x + 2, 0, valveAgain.z);
    rt.tickTraps(0.033, false);
    check(!rt.castInfo() || rt.castInfo().kind !== "valve", "stepping away lets the valve spin back");

    check(plateSeed > 0, "a floor 3 plan holds a spike plate");
    rt.startRun(plateSeed || 1, 3);
    rt.fillPools();
    const plates = rt.trapStates();
    const plateLive = plates.find((t) => t.kind === "spikes");
    const plateHp = rt.vitals.hp;
    player.position.set(plateLive.x, 0, plateLive.z);
    for (let i = 0; i < 20; i++) rt.tickTraps(0.033, true);
    check(rt.vitals.hp < plateHp, "standing on a spike plate gets the Warden spiked");
    const afterSpike = rt.vitals.hp;
    for (let i = 0; i < 10; i++) rt.tickTraps(0.033, true);
    check(rt.vitals.hp === afterSpike, "one firing spikes only once");
    rt.fillPools();

    // Phase 2: darts, gongs, biome weights, Delver hooks.
    const biomeTally = (from, to, kind) => {
      let n = 0;
      for (let seed = 1; seed <= 30; seed++) for (let f = from; f <= to; f++) n += generateFloor(seed, f).traps.filter((t) => t.kind === kind).length;
      return n;
    };
    check(biomeTally(31, 38, "gong") > biomeTally(1, 8, "gong"), "the Slate Crypt rings more gongs than the Mossy Caves");
    check(biomeTally(41, 48, "flameJet") > biomeTally(1, 8, "flameJet"), "the Ember Forge burns more flame jets than the Mossy Caves");
    let capBad = 0;
    let dartSeed = 0;
    let dartFloor = 0;
    let gongSeed = 0;
    let gongFloor = 0;
    let dartRunBad = 0;
    for (let seed = 1; seed <= 40; seed++) {
      for (const floor of [4, 7, 12, 16, 33, 36]) {
        const plan = generateFloor(seed, floor);
        const count = (k) => plan.traps.filter((t) => t.kind === k).length;
        if (count("gong") > 1 || count("darts") > 2 || count("fireWall") > 2) capBad++;
        for (const t of plan.traps) {
          if (t.kind === "darts") {
            const sameLine = t.axis === "x" ? t.from.row === t.row && t.to.row === t.row : t.from.col === t.col && t.to.col === t.col;
            const between = t.axis === "x" ? (t.from.col - t.col) * (t.to.col - t.col) < 0 : (t.from.row - t.row) * (t.to.row - t.row) < 0;
            if (!sameLine || !between) dartRunBad++;
            if (!dartSeed) {
              dartSeed = seed;
              dartFloor = floor;
            }
          }
          if (t.kind === "gong" && !gongSeed) {
            gongSeed = seed;
            gongFloor = floor;
          }
        }
      }
    }
    check(capBad === 0, "a floor holds at most 1 gong, 2 dart runs and 2 fire walls");
    check(dartSeed > 0 && dartRunBad === 0, "a dart plate sits mid-run, between its launcher and the far end");
    const dartDef = trapDef("darts");
    const volley = dartVolley(dartDef, "x", { x: 0, z: 0 }, { x: 12, z: 0 });
    check(volley.length === 3 && volley.every((d) => d.dx === 1 && d.dz === 0 && d.left >= 16) && volley[2].delay > 0, "a volley is three staggered darts flying down the run");
    const dart0 = { x: 0, z: 0, dx: 1, dz: 0, left: 1 };
    check(stepDart(dart0, 0.02, dartDef.volley.speed) && dart0.x > 0.3 && dartHits(dart0, dart0.x + 0.4, 0, 0.42) && !dartHits(dart0, dart0.x, 1.2, 0.42), "darts fly straight and hit what they touch");
    check(!trapHurts("darts") && !trapHurts("gong") && trapHurts("spikes"), "dart plates and gong wires do not hurt by themselves");

    rt.startRun(dartSeed || 1, dartFloor || 4);
    rt.fillPools();
    const dartIdx = rt.plan.traps.findIndex((t) => t.kind === "darts");
    const dartView = rt.dungeonRoot.userData.traps[dartIdx];
    check(!!dartView && !!dartView.fromW && !!rt.dungeonRoot.userData.trapDarts, "a dart run is built with its launcher and dart mesh");
    const dartHp = rt.vitals.hp;
    rt.session.wardAbsorb = 0;
    player.position.set(dartView.x, 0, dartView.z);
    let flew = 0;
    for (let i = 0; i < 60; i++) {
      rt.tickTraps(0.033, true);
      flew = Math.max(flew, rt.trapDarts().length);
    }
    check(flew > 0 && rt.dungeonRoot.userData.trapDarts.count >= 0, "stepping on the plate looses darts (" + flew + " in flight)");
    check(rt.vitals.hp < dartHp, "a dart down the run hits the Warden on the plate");
    rt.fillPools();

    rt.startRun(gongSeed || 1, gongFloor || 4);
    rt.fillPools();
    const gongIdx = rt.plan.traps.findIndex((t) => t.kind === "gong");
    const gongView = rt.dungeonRoot.userData.traps[gongIdx];
    const gongTrap = rt.trapStates()[gongIdx];
    const sleeper = (rt.enemies || []).find((e) => e && e.hp > 0);
    if (sleeper) {
      sleeper.x = gongView.x + (gongView.axis === "x" ? 2 : 0);
      sleeper.z = gongView.z + (gongView.axis === "z" ? 2 : 0);
      sleeper.state = "idle";
    }
    player.position.set(gongView.x, 0, gongView.z);
    for (let i = 0; i < 4; i++) rt.tickTraps(0.033, true);
    check(gongTrap.disabled && rt.session.run.killed.indexOf(TRAP_SPENT + gongTrap.id) >= 0, "crossing the wire rings the gong once, and the run remembers it");
    check(!!sleeper && sleeper.state === "approach", "the gong wakes a sleeping foe nearby");
    check(!gongView.wire.visible, "the rung gong's wire is gone");
    if (sleeper) {
      sleeper.x = sleeper.spawnX;
      sleeper.z = sleeper.spawnZ;
      sleeper.state = "idle";
    }
    rt.startRun(gongSeed || 1, gongFloor || 4);
    rt.fillPools();
    const gongView2 = rt.dungeonRoot.userData.traps[gongIdx];
    const gongTrap2 = rt.trapStates()[gongIdx];
    const back = gongView2.axis === "x" ? { x: -1.6, z: 0 } : { x: 0, z: -1.6 };
    const dropsBefore = (rt.groundDrops || []).length;
    const cut = rt.strikeTraps({ x: gongView2.x + back.x, z: gongView2.z + back.z }, { x: -back.x / 1.6, z: -back.z / 1.6 }, 2.4, 0.9);
    check(cut && gongTrap2.disabled && rt.session.run.killed.indexOf(TRAP_BASE + gongTrap2.id) >= 0, "a strike cuts the tripwire before it rings");
    check((rt.groundDrops || []).length > dropsBefore, "a cut wire leaves spoils");
    check(!rt.strikeTraps({ x: gongView2.x + back.x, z: gongView2.z + back.z }, { x: -back.x / 1.6, z: -back.z / 1.6 }, 2.4, 0.9), "a cut wire cannot be cut again");

    check(valveSeconds(0) === 1.2 && valveSeconds(5) === 0.6 && trapSenseRange(0) === 0 && trapSenseRange(1) > 0 && !trapsOnMap(2) && trapsOnMap(3), "Delver ranks sense traps, map them, and turn valves faster");
    const delverWas = rt.session.tracks.delver;
    rt.session.tracks.delver = 0;
    check(rt.trapMarks().length === 0, "without Delver rank 3 no traps go on the map");
    rt.session.tracks.delver = 3;
    check(rt.trapMarks().length === rt.plan.traps.length && rt.trapMarks().some((m) => m.off), "at Delver rank 3 the floor's traps go on the map, put-out ones dimmed");
    rt.session.tracks.delver = delverWas;
    const delverRows = trackEffects("delver", 3).map((row) => row[0]);
    check(delverRows.indexOf("Traps on the map") >= 0 && delverRows.indexOf("Valve turn") >= 0, "the trainer lists the Delver trap ranks");

    // Phase 3: biome traps, trap gear, trapwise elites.
    function findKind(kind, from, to) {
      for (let seed = 1; seed <= 30; seed++) {
        for (let f = from; f <= to; f++) {
          if (f % 5 === 0) continue;
          const idx = generateFloor(seed, f).traps.findIndex((t) => t.kind === kind);
          if (idx >= 0) return { seed, floor: f, idx };
        }
      }
      return null;
    }
    const BAND_KINDS = [["cave", 3, 9, ["sporePuff", "rockfall", "sporeVent"]], ["temple", 11, 19, ["pendulum", "flood"]], ["root", 21, 29, ["grasp", "thornWall", "briar"]], ["crypt", 31, 39, ["sarcophagus", "candles"]], ["forge", 41, 49, ["tripHammer", "slagPool"]]];
    const missing = [];
    const found = {};
    for (const [, from, to, kinds] of BAND_KINDS) for (const k of kinds) {
      found[k] = findKind(k, from, to);
      if (!found[k]) missing.push(k);
    }
    check(missing.length === 0, "every biome places its own traps (" + (missing.join(", ") || "all found") + ")");
    let wrongBand = 0;
    for (let seed = 1; seed <= 20; seed++) {
      for (const f of [4, 8]) if (generateFloor(seed, f).traps.some((t) => ["pendulum", "tripHammer", "candles", "grasp"].indexOf(t.kind) >= 0)) wrongBand++;
    }
    check(wrongBand === 0, "the Mossy Caves hold none of the other biomes' traps");
    let earlyWise = 0;
    let deepWise = 0;
    for (let seed = 1; seed <= 40; seed++) {
      for (const f of [6, 9, 13]) earlyWise += generateFloor(seed, f).spawns.filter((s) => s.eliteAffix === "trapwise").length;
      for (const f of [16, 27, 38]) deepWise += generateFloor(seed, f).spawns.filter((s) => s.eliteAffix === "trapwise").length;
    }
    check(earlyWise === 0 && deepWise > 0, "trapwise elites appear only from floor 15 (" + deepWise + " deeper)");

    const pend = makeTrapState({ id: 0, kind: "pendulum", x: 0, z: 0, axis: "x", phase: 0 });
    stepTrap(pend, 0.01, trapDef("pendulum").period / 4, false);
    check(pend.hot && trapHits(pend, 0, pend.swing) && !trapHits(pend, 0, -pend.swing), "the pendulum hits where its blade is, not across the corridor");
    const fall = makeTrapState({ id: 1, kind: "rockfall", x: 0, z: 0 });
    check(!trapHits(fall, 1.3, 0) && trapHits(fall, 1.3, 0, null, true), "a rockfall springs on a small spot and lands wide");
    check(wardedTrapDamage(100, 20) === 80 && wardedTrapDamage(100, 200) === 40 && surefootSlow(0.6, 50) === 0.8 && surefootHold(1, 50) === 0.5, "trapward cuts trap damage (capped at 60%), surefoot eases slows and holds");
    const trapGear = gearTotals({ body: { ilvl: 10, affixes: [{ id: "trapward", t: 1 }] }, feet: { ilvl: 10, affixes: [{ id: "surefoot", t: 0.5 }] }, head: { ilvl: 10, affixes: [{ id: "wary", t: 0 }] } });
    check(trapGear.trapward > 10 && trapGear.surefoot > 30 && trapGear.wary >= 6, "trap affixes add up on worn gear");
    check(trapSenseRange(0, trapGear.wary) >= 6 && trapsOnMap(0, trapGear.wary), "wary gear senses and maps traps without Delver ranks");
    check(/trap damage/.test(affixLines({ slot: "body", ilvl: 10, affixes: [{ id: "trapward", t: 1 }] }).join(" ")), "trapward reads as less trap damage");

    function onTrap(kind) {
      const at = found[kind];
      if (!at) return null;
      rt.startRun(at.seed, at.floor);
      rt.fillPools();
      rt.trapHold = 0;
      rt.session.wardAbsorb = 0;
      return { trap: rt.trapStates()[at.idx], view: rt.dungeonRoot.userData.traps[at.idx], plan: rt.plan.traps[at.idx] };
    }
    function farFoes() {
      for (const e of rt.enemies || []) {
        if (!e || !(e.hp > 0)) continue;
        e.x = e.spawnX;
        e.z = e.spawnZ;
      }
    }

    let on = onTrap("sporePuff");
    if (on) {
      player.position.set(on.trap.x + 0.5, 0, on.trap.z);
      const hp0 = rt.vitals.hp;
      for (let i = 0; i < 150; i++) rt.tickTraps(0.033, true);
      check(rt.vitals.hp < hp0, "a spore puff poisons whoever stands in its cloud");
    }
    on = onTrap("flood");
    if (on) {
      player.position.set(on.trap.x, 0, on.trap.z);
      rt.tickTraps(0.033, true);
      check(rt.trapSlow > 0.55 && rt.trapSlow < 0.65, "the flooded channel slows the Warden (" + rt.trapSlow.toFixed(2) + ")");
      rt.session.surefoot = 90;
      rt.tickTraps(0.033, true);
      check(rt.trapSlow > 0.95, "surefoot gear wades through");
      rt.session.surefoot = 0;
      const lever = on.view.sw;
      player.position.set(lever.x, 0, lever.z);
      check(rt.switchNear() && rt.switchNear().label === "Pull the sluice lever", "the flood's switch is a sluice lever");
      rt.tryUseSwitch();
      check(rt.castInfo() && rt.castInfo().name === "Lever", "pulling it shows a Lever cast");
      for (let i = 0; i < 45; i++) rt.tickTraps(0.033, false);
      check(on.trap.disabled && !on.view.water.visible, "the pulled lever drains the channel");
    }
    on = onTrap("grasp");
    if (on) {
      player.position.set(on.trap.x, 0, on.trap.z);
      for (let i = 0; i < 12; i++) rt.tickTraps(0.033, true);
      check(rt.trapHold > 0.5, "grasping roots hold the Warden in place");
      rt.trapHold = 0;
    }
    on = onTrap("sarcophagus");
    if (on) {
      const before = livingCount(rt.enemies);
      player.position.set(on.trap.x, 0, on.trap.z);
      for (let i = 0; i < 30; i++) rt.tickTraps(0.033, true);
      check(livingCount(rt.enemies) > before && on.trap.disabled && rt.session.run.killed.indexOf(TRAP_SPENT + on.trap.id) >= 0, "passing a sarcophagus lets the dead out, once (" + (livingCount(rt.enemies) - before) + ")");
    }
    on = onTrap("thornWall");
    if (on) {
      const room = on.view.room;
      const cell = on.plan.row * rt.plan.cols + on.plan.col;
      player.position.set((room.x0 + room.x1) / 2, 0, (room.z0 + room.z1) / 2);
      for (let i = 0; i < 30; i++) rt.tickTraps(0.033, true);
      check(rt.plan.tiles[cell] === 0 && on.view.wall.visible, "entering a guarded room grows thorns across the doorway");
      for (const e of rt.enemies || []) if (e && e.x >= room.x0 && e.x < room.x1 && e.z >= room.z0 && e.z < room.z1) e.hp = 0;
      rt.tickTraps(0.033, true);
      check(rt.plan.tiles[cell] === 1 && on.trap.disabled, "clearing the room opens the doorway again");
    }
    on = onTrap("briar");
    if (on) {
      const heart = on.view.sw;
      const from = { x: heart.x + 1.2, z: heart.z };
      const aim = { x: -1, z: 0 };
      let hits = 0;
      for (let i = 0; i < 3; i++) if (rt.strikeTraps({ x: heart.x + 1.2, z: heart.z }, aim, 2.4, 0.9) || rt.strikeTraps({ x: heart.x, z: heart.z + 1.2 }, { x: 0, z: -1 }, 2.4, 0.9) || rt.strikeTraps({ x: heart.x, z: heart.z - 1.2 }, { x: 0, z: 1 }, 2.4, 0.9) || rt.strikeTraps({ x: heart.x - 1.2, z: heart.z }, { x: 1, z: 0 }, 2.4, 0.9)) hits++;
      check(hits === 3 && on.trap.disabled && rt.session.run.killed.indexOf(TRAP_BASE + on.trap.id) >= 0 && !!from, "three strikes on the root heart wither the briars");
      check(!rt.switchNear() || rt.switchNear().view !== on.view, "a root heart is struck, not turned with F");
    }
    on = onTrap("candles");
    if (on) {
      const room = on.view.room;
      const ward = { x: (room.x0 + room.x1) / 2, z: (room.z0 + room.z1) / 2 };
      check(Math.abs(rt.foeDamageMul(ward) - 0.7) < 1e-9 && rt.foeDamageMul({ x: room.x1 + 20, z: room.z1 + 20 }) === 1, "cursed candles soften blows on foes in their room only");
      for (const part of on.view.parts) {
        player.position.set(part.x + 0.6, 0, part.z);
        rt.tryUseSwitch();
        for (let i = 0; i < 20; i++) rt.tickTraps(0.033, false);
      }
      check(on.trap.disabled && rt.foeDamageMul(ward) === 1, "snuffing all three candles lifts the curse");
    }
    on = onTrap("tripHammer");
    if (on) {
      farFoes();
      player.position.set(on.trap.x, 0, on.trap.z);
      const hp0 = rt.vitals.hp;
      for (let i = 0; i < 160; i++) rt.tickTraps(0.033, true);
      check(rt.vitals.hp < hp0, "the trip hammer slams whoever stands under it");
      const wiseFoe = (rt.enemies || []).find((e) => e && e.hp > 0);
      if (wiseFoe) {
        wiseFoe.eliteAffix = "trapwise";
        wiseFoe.x = on.trap.x;
        wiseFoe.z = on.trap.z;
        const foeHp0 = wiseFoe.hp;
        player.position.set(on.trap.x + 30, 0, on.trap.z + 30);
        for (let i = 0; i < 160; i++) rt.tickTraps(0.033, true);
        check(wiseFoe.hp === foeHp0, "a trapwise elite stands under the hammer untouched");
      }
    }
    rt.trapHold = 0;
    rt.fillPools();
    rt.startRun(1, 41);
    let brazierLights = 0;
    let brazierShadow = false;
    if (rt.dungeonRoot) {
      rt.dungeonRoot.traverse(function (o) {
        if (!o.isPointLight) return;
        brazierLights++;
        if (o.castShadow) brazierShadow = true;
      });
    }
    check(brazierLights <= 4 && !brazierShadow, "ember braziers add at most 4 unshadowed point lights (" + brazierLights + ")");
    rt.startRun(1, 20);
    noteMesh("budget floor");
    check(rt.meters.lastMeshMs <= 60, "budget floor mesh build fails only above 60 ms (" + rt.meters.lastMeshMs.toFixed(3) + ")");
    check(rt.townRoot.parent === null, "during a floor, townRoot.parent is null");
    let treesInScene = false;
    let pointLights = 0;
    let shadowLights = 0;
    scene.traverse(function (o) {
      if (o === pineCanopy || o === decCanopy || o === pineTrunk || o === decTrunk) treesInScene = true;
      if (o.isPointLight) pointLights++;
      if (o.isLight && o.castShadow) shadowLights++;
    });
    check(!treesInScene && TREE_COUNT === 3050, "the 3050 town trees are not in the scene graph during a floor");
    check(pointLights <= 4, "point lights on a floor stay at most 4 (" + pointLights + ")");
    check(shadowLights === 1, "one shadow-casting light (" + shadowLights + ")");
    rt.paint();
    const drawCalls = rt.renderer.info.render.calls;
    meters.drawCalls = drawCalls;
    lines.push("drawCalls " + drawCalls);
    check(drawCalls <= 80, "dungeon draw calls stay at most 80 (" + drawCalls + ")");
    const budgetFlat = [];
    rt.dungeonRoot.traverse(function (o) {
      if (!o.material) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (let i = 0; i < mats.length; i++) if (!mats[i].flatShading) budgetFlat.push(o.name || o.type);
    });
    check(budgetFlat.length === 0, "flatShading stays on during the budget floor");
    check(!rt.player.isInstancedMesh, "the hero is not merged into an instance");
    rt.arriveTown("extract");
    check(rt.townRoot.parent === scene && (!rt.dungeonRoot || rt.dungeonRoot.parent === null), "after arriveTown, dungeonRoot is gone and townRoot is parented");
    const hemiAfterEmber = scene.children.find((o) => o.isHemisphereLight);
    check(scene.fog && scene.fog.isFogExp2 && scene.fog.color.getHex() === 0xd5e4b8 && Math.abs(scene.fog.density - 0.0105) < 1e-6, "arriveTown after an ember floor restores town fog");
    check(!!hemiAfterEmber && hemiAfterEmber.color.getHex() === 0xc5e4ff && hemiAfterEmber.groundColor.getHex() === 0x4d7a38, "arriveTown after an ember floor restores hemisphere colors");
    const mapSpace = rt.space;
    const mapPlan = rt.plan;
    const mapFoes = rt.enemies;
    const mapX = player.position.x;
    const mapY = player.position.y;
    const mapZ = player.position.z;
    rt.space = "dungeon";
    rt.plan = {
      themeId: 0,
      floorIndex: 1,
      cols: 3,
      rows: 3,
      tile: 4,
      tiles: new Uint8Array([1, 0, 0, 1, 1, 0, 0, 1, 1]),
      entrance: { col: 0, row: 0 },
      stairs: { col: 2, row: 2 }
    };
    const mapHero = tileToWorld(0, 0, 3, 3);
    player.position.set(mapHero.x, 0, mapHero.z);
    rt.enemies = [{ x: mapHero.x, z: mapHero.z + 4, hp: 8, state: "approach" }, { x: mapHero.x + 4, z: mapHero.z, hp: 8, state: "idle" }];
    drawMinimap();
    const stairCell = tileToWorld(2, 2, 3, 3);
    const wallCell = tileToWorld(2, 0, 3, 3);
    const stairPt = worldToMap(stairCell.x, stairCell.z);
    const wallPt = worldToMap(wallCell.x, wallCell.z);
    const stairPix = mapCtx.getImageData(Math.round(stairPt.x), Math.round(stairPt.y), 1, 1).data;
    const wallPix = mapCtx.getImageData(Math.round(wallPt.x), Math.round(wallPt.y), 1, 1).data;
    check(stairPix[0] !== wallPix[0] || stairPix[1] !== wallPix[1] || stairPix[2] !== wallPix[2], "minimap stairs cell differs from a wall (" + stairPix[0] + "," + stairPix[1] + "," + stairPix[2] + " vs " + wallPix[0] + "," + wallPix[1] + "," + wallPix[2] + ")");
    rt.space = mapSpace;
    rt.plan = mapPlan;
    rt.enemies = mapFoes;
    player.position.set(mapX, mapY, mapZ);

    resetHero(0, 0, 0);
    rt.camYaw = 0.42;
    rt.camPitch = 0.38;
    rt.camDist = 7.6;
    placeCamera(0, true);

    rt.session.purse = 86;
    rt.session.bank = 120;
    rt.session.pack = [rareBlade, {
      uid: "show-draught",
      kind: "consumable",
      consumableId: "draught-hp",
      charges: 1,
      stack: 3,
      rarity: 0,
      ilvl: 1,
      affixes: [],
      name: "Health Draught"
    }];
    rt.session.stash = [{
      uid: "show-circlet",
      kind: "gear",
      slot: "head",
      rarity: 1,
      ilvl: 2,
      baseId: "circlet",
      themeId: 0,
      affixes: [],
      name: "Warden Circlet"
    }];
    player.position.x = -6.5;
    player.position.z = 4.5;
    player.position.y = groundY(-6.5, 4.5);
    rt.camYaw = 0.42;
    rt.camPitch = 0.38;
    rt.camDist = 7.6;
    placeCamera(0, true);
    rt.openPanel("store", { x: -6.5, z: 2.5, id: "store", name: "Bramble & Board" });
    const shotAmount = document.getElementById("panel-amount");
    if (shotAmount) shotAmount.value = "40";
    castLine.textContent = "";
    if (rt.paint) rt.paint();
    const openPanel = document.getElementById("panel");
    check(!!openPanel && !openPanel.hidden && openPanel.textContent.indexOf("Bramble & Board") >= 0 && openPanel.textContent.indexOf("Rare Moss Blade") >= 0, "the harness leaves Bramble & Board open");

    lines.push("lastMeshMs " + lastMeshMs.toFixed(3));
    meters.lastMeshMs = lastMeshMs;

    rt.townfolkSolid = true;
    rt.townClock.phase = clockWas.phase;
    rt.townClock.frozen = clockWas.frozen;
    const report = lines.join("\n") + (fails.length ? "\n\n" + fails.length + " FAILED" : "\n\nALL PASSED");
    const out = document.getElementById("test-out");
    out.textContent = report;
    out.classList.add("show");
    if (fails.length) out.classList.add("fail");
    console.log(report);
    return { pass: fails.length === 0, fails, report };
  }

  window.__selfTestControls = selfTestControls;
}
