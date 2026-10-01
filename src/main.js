import * as THREE from "three";
import { applyTownLight } from "./view/lights.js";
import { buildTown, TREE_COUNT, DECOR } from "./view/town.js";
import { buildHero } from "./view/hero.js";
import { createViewCamera, attachCamera, bindOrbit } from "./play/camera.js";
import { attachMovement, bindKeys } from "./play/move.js";
import { attachTown } from "./play/town.js";
import { attachInteriors } from "./play/interiors.js";
import { attachTownfolk } from "./play/townfolk.js";
import { attachAmbience } from "./play/ambience.js";
import { attachDialogue } from "./play/dialogue.js";
import { attachCombat } from "./play/combat.js";
import { attachSpace } from "./play/space.js";
import { attachHud } from "./ui/hud.js";
import { attachPanels } from "./ui/panels.js";
import { attachBarks } from "./ui/barks.js";
import { attachGuide } from "./ui/guide.js";
import { installSelfTest } from "./test/self-test.js";
import { parseSave, migrate, ledgerExceedsCap, SAVE_KEY, SAVE_BAK_KEY } from "./sim/save.js";

const params = new URLSearchParams(location.search);
const rt = {
  keys: Object.create(null),
  camYaw: 0.42,
  camPitch: 0.38,
  camDist: 7.6,
  dev: params.has("dev"),
  // The gold collider wireframes are a debugging aid: in a dev session they are
  // opt-in (&colliders=1, or the ` key), so town previews stay clean.
  hideColliders: !params.has("test") && params.get("colliders") !== "1",
  space: "town",
  TREE_COUNT,
  DECOR
};

const scene = new THREE.Scene();
rt.scene = scene;
applyTownLight(scene, rt);

const camera = createViewCamera();
rt.camera = camera;
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
// Building walls cut away around the hero indoors (per-material clipping planes).
renderer.localClippingEnabled = true;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.prepend(renderer.domElement);
rt.renderer = renderer;

attachMovement(rt);
const town = buildTown(scene, rt.addCollider, rt.addBoxCollider);
rt.terrain = town.terrain;
rt.pines = town.pines;
rt.decs = town.decs;
rt.pineCanopy = town.pineCanopy;
rt.decCanopy = town.decCanopy;
rt.pineTrunk = town.pineTrunk;
rt.decTrunk = town.decTrunk;
rt.bushGeo = town.bushGeo;
rt.rockGeos = town.rockGeos;
rt.treeBases = town.treeBases;
rt.rocks = town.rocks;
rt.camp = town.camp;
rt.townRoot = town.townRoot;
rt.stations = town.stations;
rt.buildings = town.buildings;
rt.setTownTier = town.setTier;
rt.getTownTier = town.getTier;
rt.townTierMeshes = town.tierMeshes;
rt.nightMats = town.nightMats;
rt.townGlow = town.townGlow;
rt.interiorLight = town.interiorLight;
rt.flame = town.flame;
rt.flameOuter = town.flameOuter;
rt.flameInner = town.flameInner;
rt.campLight = town.campLight;

const hero = buildHero(scene);
rt.player = hero.player;
rt.body = hero.body;
rt.leftLeg = hero.leftLeg;
rt.rightLeg = hero.rightLeg;
rt.leftArm = hero.leftArm;
rt.rightArm = hero.rightArm;
rt.torso = hero.torso;
rt.cape = hero.cape;
rt.head = hero.head;
rt.nose = hero.nose;
rt.clouds = town.addClouds();

attachCamera(rt);
rt.player.position.y = rt.groundY(0, 0);
rt.placeCamera(0, true);
rt.updateSun();

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / Math.max(1, window.innerHeight);
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
camera.aspect = window.innerWidth / Math.max(1, window.innerHeight);
camera.updateProjectionMatrix();

attachHud(rt);
attachBarks(rt);
attachGuide(rt);
attachCombat(rt);
attachSpace(rt);
attachTown(rt);
attachInteriors(rt);
attachTownfolk(rt);
attachAmbience(rt);
attachDialogue(rt);
attachPanels(rt);
bindKeys(rt);
bindOrbit(renderer.domElement, rt);

const TOWN_SAVE_MS = 300;
const DUNGEON_SAVE_MS = 2000;
let saveDirty = false;
let saveTimer = 0;

function ledgerBlocked() {
  return !!rt.blockLedger || !!(rt.session && rt.session.devRun);
}

function holdSaves() {
  saveDirty = false;
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = 0;
  }
}

function announceLedger(result) {
  if (!rt.say) return;
  if (result === "full") rt.say("The town ledger is full.");
  else if (result === "error") rt.say("The town ledger could not be written.");
}

function writeJson(json) {
  if (ledgerExceedsCap(json)) return "full";
  try {
    localStorage.setItem(SAVE_KEY, json);
    return "ok";
  } catch (err) {
    return "error";
  }
}

function flushSave() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = 0;
  }
  if (ledgerBlocked() || !rt.captureSaveDoc) {
    saveDirty = false;
    return null;
  }
  try {
    const doc = rt.captureSaveDoc();
    doc.savedAt = Date.now();
    const result = writeJson(JSON.stringify(doc));
    if (result !== "ok") {
      announceLedger(result);
      saveDirty = false;
      return null;
    }
    saveDirty = false;
    return doc;
  } catch (err) {
    saveDirty = false;
    try { announceLedger("error"); } catch (sayErr) { /* keep the frame loop alive */ }
    return null;
  }
}

function persistDocument(doc) {
  try {
    const result = writeJson(JSON.stringify(doc));
    if (result !== "ok") announceLedger(result);
    return result === "ok";
  } catch (err) {
    try { announceLedger("error"); } catch (sayErr) { /* quota or a broken spy */ }
    return false;
  }
}

function markSave(reason) {
  if (ledgerBlocked()) return;
  const immediate = reason === "floor" || reason === "extract" || reason === "death" || reason === "arrive" || reason === "hidden" || reason === "unload";
  if (immediate) {
    saveDirty = true;
    flushSave();
    return;
  }
  saveDirty = true;
  if (reason === "town") {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = 0;
      if (saveDirty) flushSave();
    }, TOWN_SAVE_MS);
    return;
  }
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = 0;
    if (saveDirty) flushSave();
  }, DUNGEON_SAVE_MS);
}

function backupRaw(raw) {
  if (rt.blockLedger) return;
  try {
    if (localStorage.getItem(SAVE_BAK_KEY) == null) localStorage.setItem(SAVE_BAK_KEY, raw);
  } catch (err) { /* the session still starts fresh */ }
}

function loadStoredGame() {
  let raw = null;
  try {
    raw = localStorage.getItem(SAVE_KEY);
  } catch (err) {
    try { if (rt.say) rt.say("The town ledger could not be opened."); } catch (sayErr) { /* ignore */ }
    if (rt.freshGame) rt.freshGame();
    return null;
  }
  if (raw == null || raw === "") {
    if (rt.freshGame) rt.freshGame();
    return null;
  }
  try {
    const doc = migrate(parseSave(raw));
    return rt.applySaveDoc(doc);
  } catch (err) {
    backupRaw(raw);
    try { if (rt.say) rt.say("The town ledger was unreadable. A copy was kept."); } catch (sayErr) { /* ignore */ }
    if (rt.freshGame) rt.freshGame();
    return null;
  }
}

rt.holdSaves = holdSaves;
rt.flushSave = flushSave;
rt.persistDocument = persistDocument;
rt.markSave = markSave;
rt.loadStoredGame = loadStoredGame;
if (window.__game) window.__game.save = flushSave;

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "hidden" || !saveDirty) return;
  try { flushSave(); } catch (err) { /* hidden tab must not throw */ }
});
window.addEventListener("beforeunload", () => {
  if (ledgerBlocked()) return;
  try { flushSave(); } catch (err) { /* leaving the page must not throw */ }
});

let last = performance.now();
let fpsAccum = 0;
let fpsFrames = 0;
const fpsEl = document.getElementById("fps");
function takeDt(now) {
  // rAF timestamps can trail performance.now(); a negative step would run the sim backwards.
  const dt = Math.max(0, Math.min(0.033, (now - last) / 1000));
  last = now;
  return dt;
}
function frame(now) {
  const dt = takeDt(now);
  rt.update(dt);
  rt.tickHud(dt);
  renderer.render(scene, camera);
  fpsAccum += dt;
  fpsFrames++;
  if (fpsAccum >= 0.4) {
    fpsEl.textContent = Math.round(fpsFrames / fpsAccum) + " fps";
    fpsAccum = 0;
    fpsFrames = 0;
  }
  requestAnimationFrame(frame);
}
rt.paint = function () { renderer.render(scene, camera); };
rt.pumpFrame = function (now) {
  const dt = takeDt(now);
  rt.update(dt);
  rt.tickHud(dt);
  return dt;
};
renderer.render(scene, camera);

installSelfTest(rt);
if (params.has("test")) {
  window.__selfTestControls();
} else if (rt.dev && params.has("floor")) {
  rt.blockLedger = true;
  try { loadStoredGame(); } catch (err) { if (rt.freshGame) rt.freshGame(); }
  const floorIndex = Math.max(1, Math.floor(Number(params.get("floor")) || 1));
  const seed = params.has("seed") ? Math.floor(Number(params.get("seed")) || 1) : 1;
  rt.playDevQuery(seed, floorIndex);
  requestAnimationFrame(frame);
} else {
  try { loadStoredGame(); } catch (err) { if (rt.freshGame) rt.freshGame(); }
  if (rt.dev) rt.syncColliderOverlay();
  // ?dev=1&time=0..1 sets the hour (0.5 noon); &depth=N previews the town grown to that depth.
  if (rt.dev && params.has("time")) rt.townClock.phase = ((Number(params.get("time")) || 0) % 1 + 1) % 1;
  if (rt.dev && params.has("depth")) rt.session.bestDepth = Math.max(0, Math.floor(Number(params.get("depth")) || 0));
  // ?dev=1&warp=S runs S seconds of town life first (townsfolk, pets, clock).
  if (rt.dev && params.has("warp")) {
    const steps = Math.min(20000, Math.max(0, Math.floor((Number(params.get("warp")) || 0) / 0.033)));
    for (let i = 0; i < steps; i++) rt.update(0.033);
  }
  // ?dev=1&at=x,z[,yaw]&cam=yaw,pitch,dist places the hero and camera for town inspection.
  if (rt.dev && params.has("at")) {
    const at = params.get("at").split(",").map(Number);
    const cam = params.has("cam") ? params.get("cam").split(",").map(Number) : null;
    rt.resetHero(at[0] || 0, at[1] || 0, at[2] || 0);
    if (params.get("level") === "1") {
      rt.heroLevel = 1;
      rt.player.position.y = rt.heroGroundY(rt.player.position.x, rt.player.position.z);
    }
    if (cam) {
      rt.camYaw = cam[0];
      rt.camPitch = cam[1];
      rt.camDist = cam[2];
    }
    rt.placeCamera(0, true);
  }
  // ?dev=1&open=store|smith|still|trainer|inn|bank opens that counter's panel.
  if (rt.dev && params.has("open")) {
    const st = (rt.stations || []).find((s) => s.panel === params.get("open"));
    if (st) rt.openPanel(st.panel, st);
  }
  requestAnimationFrame(frame);
}

