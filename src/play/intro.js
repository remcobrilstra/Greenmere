// The first-visit tour. The camera leaves the hero, flies in over the Outer Wood,
// and stops at each keeper (through the cut-away roof), the notice board, and the
// Delve Gate. Each stop shows who stands there (left card) and what you can do
// there (right card); Space, Enter, F, → or a click goes on, ← goes back, Esc skips.
// After the gate the camera settles behind the Warden in the normal place, the
// letterbox opens, and the HUD fades in.
//
// While it runs, rt.cinematic(dt) replaces placeCamera in move.js (the hero is
// frozen), rt.sunAnchor moves the shadow-casting sun with the shot, and
// rt.forceInterior cuts away the building whose keeper is on screen.

import * as THREE from "three";
import { INTRO_STOPS } from "../sim/intro.js";
import { buildingById, localToWorld, PROPS, GATE, FLOOR_Y } from "../sim/townplan.js";
import { keeperPost } from "../sim/townfolk.js";
import { attachIntroUi } from "../ui/intro.js";

// The opening: high over the wood north of the gate, looking down at the town.
const OPENING = { pos: [18, 40, -80], look: [0, 0, -2] };
const FLY_IN = 5.2;
const HOME_TIME = 2.4;
const SKIP_HOME_TIME = 1.4;

const TAU = Math.PI * 2;

// Compass bearing round the square (north, -z, is 0; east, +x, is π/2): growing
// bearings run clockwise on the map.
function bearing(v) {
  return Math.atan2(v.x, -v.z);
}
// The turn from b0 to b1: clockwise (way 1), anticlockwise (way -1) or the short way
// (0). A forward hop that is really a hair anticlockwise does not loop the whole town.
function turn(b0, b1, way) {
  let d = (((b1 - b0) % TAU) + TAU) % TAU;
  if (way > 0) return d > TAU * 0.85 ? d - TAU : d;
  if (way < 0) return d - TAU < -TAU * 0.85 ? d : d - TAU;
  return d > Math.PI ? d - TAU : d;
}
// A point swung round the square: bearing b0 + sweep·k, radius eased from r0 to r1.
function swing(out, b0, sweep, r0, r1, y, k, pull) {
  const b = b0 + sweep * k;
  const r = r0 + (r1 - r0) * k - Math.sin(Math.PI * k) * pull;
  return out.set(Math.sin(b) * r, y, -Math.cos(b) * r);
}

function smoother(t) {
  const x = Math.max(0, Math.min(1, t));
  return x * x * x * (x * (x * 6 - 15) + 10);
}

export function attachIntro(rt) {
  const camPos = new THREE.Vector3();
  const camLook = new THREE.Vector3();
  const fromPos = new THREE.Vector3();
  const fromLook = new THREE.Vector3();
  const toPos = new THREE.Vector3();
  const toLook = new THREE.Vector3();
  const anchor = new THREE.Vector3();
  const _v = new THREE.Vector3();

  let active = false;
  let ui = null;
  let index = -1;            // the stop being flown to or held; stops.length = home
  let state = "idle";        // "wait" (behind the loading card), "fly", "hold", "home"
  let t = 0;
  let dur = 1;
  let lift = 0;
  let holdT = 0;
  let pendingInterior;       // building id to cut away once the camera is halfway there
  // A hop either flies straight (the opening, going home) or orbits the square.
  const orbitCam = { on: false, b0: 0, sweep: 0, r0: 0, r1: 0, pull: 0 };
  const orbitLook = { on: false, b0: 0, sweep: 0, r0: 0, r1: 0 };
  let onDone = null;
  const stops = INTRO_STOPS;

  // ---- framing ----

  function frontOf(b, lx, lz) {
    const a = localToWorld(b, lx, lz);
    const c = localToWorld(b, lx, lz + 1);
    return { x: c.x - a.x, z: c.z - a.z };
  }

  // A camera dist metres from the look point, raised by pitch, swung off the
  // subject's front by side radians.
  function orbit(look, front, side, pitch, dist, outPos) {
    const fl = Math.hypot(front.x, front.z) || 1;
    const fx = front.x / fl;
    const fz = front.z / fl;
    const c = Math.cos(side);
    const s = Math.sin(side);
    const dx = fx * c - fz * s;
    const dz = fx * s + fz * c;
    const h = Math.cos(pitch) * dist;
    outPos.set(look.x + dx * h, look.y + Math.sin(pitch) * dist, look.z + dz * h);
  }

  function shotFor(stop, outPos, outLook) {
    if (stop.focus === "square") {
      outLook.set(0, 1.0, 1.0);
      outPos.set(7, 17, -25);
      return null;
    }
    if (stop.focus === "keeper") {
      const b = buildingById(stop.building);
      const post = keeperPost({ building: stop.building });
      const front = frontOf(b, b.keeper.x, b.keeper.z);
      outLook.set(post.x + front.x * 0.4, FLOOR_Y + 1.2, post.z + front.z * 0.4);
      orbit(outLook, front, 0.42, 0.62, 5.6, outPos);
      return b.id;
    }
    if (stop.focus === "board") {
      const p = PROPS.find((q) => q.type === "notice");
      const st = (rt.stations || []).find((s) => s.id === "board");
      const front = st ? { x: st.x - p.x, z: st.z - p.z } : { x: 1, z: 0 };
      outLook.set(p.x, 1.35, p.z);
      outLook.y += rt.groundY ? rt.groundY(p.x, p.z) : 0;
      orbit(outLook, front, 0.5, 0.3, 4.8, outPos);
      return null;
    }
    // the gate: from the town side, off to one side so the veil reads
    outLook.set(GATE.x, 2.4, GATE.z + 0.6);
    outLook.y += rt.groundY ? rt.groundY(GATE.x, GATE.z) : 0;
    orbit(outLook, { x: 0, z: 1 }, 0.62, 0.2, 9.5, outPos);
    return null;
  }

  // Where the normal follow camera sits behind the hero, and what it looks at.
  function homeShot(outPos, outLook) {
    const keepPos = rt.camera.position.clone();
    const keepQuat = rt.camera.quaternion.clone();
    rt.placeCamera(0, true);
    outPos.copy(rt.camera.position);
    outLook.copy(rt.player.position);
    outLook.y += 1.4;
    rt.camera.position.copy(keepPos);
    rt.camera.quaternion.copy(keepQuat);
  }

  // ---- flow ----

  // way: 1 clockwise (on), -1 anticlockwise (back), 0 straight.
  function flyTo(i, time, way) {
    fromPos.copy(camPos);
    fromLook.copy(camLook);
    index = i;
    if (i >= stops.length) {
      homeShot(toPos, toLook);
      pendingInterior = null;
      state = "home";
    } else {
      pendingInterior = shotFor(stops[i], toPos, toLook);
      state = "fly";
    }
    const d = fromPos.distanceTo(toPos);
    const rFrom = Math.hypot(fromPos.x, fromPos.z);
    const rTo = Math.hypot(toPos.x, toPos.z);
    orbitCam.on = !!way && rFrom > 4 && rTo > 4;
    if (orbitCam.on) {
      // Round the square: the camera rises and draws in over it while it turns,
      // and the gaze pans round the ring of buildings with it.
      orbitCam.b0 = bearing(fromPos);
      orbitCam.sweep = turn(orbitCam.b0, bearing(toPos), way);
      orbitCam.r0 = rFrom;
      orbitCam.r1 = rTo;
      orbitCam.pull = Math.min(rFrom, rTo) * 0.3;
      const lFrom = Math.hypot(fromLook.x, fromLook.z);
      const lTo = Math.hypot(toLook.x, toLook.z);
      orbitLook.on = lFrom > 6 && lTo > 6;
      orbitLook.b0 = bearing(fromLook);
      orbitLook.sweep = turn(orbitLook.b0, bearing(toLook), way);
      orbitLook.r0 = lFrom;
      orbitLook.r1 = lTo;
      const arc = Math.abs(orbitCam.sweep);
      dur = time || Math.max(2.6, Math.min(4.6, 2.2 + arc * 1.3 + Math.abs(rTo - rFrom) / 18));
      lift = Math.min(9, 4.5 + arc * 3);
    } else {
      orbitLook.on = false;
      dur = time || Math.max(1.7, Math.min(3.4, 1.4 + d / 22));
      // Long hops arc up over the roofs; short ones barely leave the street.
      lift = Math.min(16, d * 0.28);
    }
    t = 0;
    if (ui) {
      ui.away();
      ui.ready(state !== "home");
    }
  }

  function arrive() {
    if (state === "home") {
      finish();
      return;
    }
    state = "hold";
    holdT = 0;
    if (ui) ui.show(stops[index], index, stops.length, index === stops.length - 1);
  }

  function next() {
    if (!active || state === "wait" || state === "home") return;
    // the last stop flies home straight; the rest go on round the square
    flyTo(index + 1, 0, index + 1 < stops.length ? 1 : 0);
  }
  function back() {
    if (!active || state === "wait" || state === "home" || index <= 0) return;
    flyTo(index - 1, 0, -1);
  }
  function skip() {
    if (!active || state === "home") return;
    if (state === "wait") {
      finish(true);
      return;
    }
    flyTo(stops.length, SKIP_HOME_TIME);
  }

  function tick(dt) {
    if (!active) return;
    if (state === "fly" || state === "home") {
      t += dt;
      const k = smoother(t / dur);
      const y = fromPos.y + (toPos.y - fromPos.y) * k + Math.sin(Math.PI * k) * lift;
      if (orbitCam.on) swing(camPos, orbitCam.b0, orbitCam.sweep, orbitCam.r0, orbitCam.r1, y, k, orbitCam.pull);
      else camPos.lerpVectors(fromPos, toPos, k).setY(y);
      if (orbitLook.on) {
        swing(camLook, orbitLook.b0, orbitLook.sweep, orbitLook.r0, orbitLook.r1, fromLook.y + (toLook.y - fromLook.y) * k, k, 0);
      } else camLook.lerpVectors(fromLook, toLook, k);
      if (pendingInterior !== undefined && k >= 0.5) {
        if (rt.forceInterior) rt.forceInterior(pendingInterior);
        pendingInterior = undefined;
      }
      if (state === "home" && k >= 0.35 && rt.forceInterior) rt.forceInterior(null);
      if (t >= dur) {
        camPos.copy(toPos);
        camLook.copy(toLook);
        arrive();
      }
    } else if (state === "hold") {
      // A slow drift round the subject so the held shot stays alive.
      holdT += dt;
      const sway = Math.sin(holdT * 0.32) * 0.07;
      _v.copy(toPos).sub(toLook).applyAxisAngle(THREE.Object3D.DEFAULT_UP, sway);
      camPos.copy(toLook).add(_v);
      camLook.copy(toLook);
    }
    if (!active) return;
    rt.camera.position.copy(camPos);
    rt.camera.lookAt(camLook);
    anchor.copy(camLook);
    anchor.y = 0;
  }

  // ---- input (capture phase, so nothing else hears it while the tour runs) ----

  const NEXT_KEYS = new Set(["Space", "Enter", "NumpadEnter", "KeyF", "ArrowRight", "KeyD"]);
  const BACK_KEYS = new Set(["ArrowLeft", "KeyA", "Backspace"]);
  function onKey(e) {
    if (!active) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.type !== "keydown" || e.repeat) return;
    if (e.code === "Escape") skip();
    else if (NEXT_KEYS.has(e.code)) next();
    else if (BACK_KEYS.has(e.code)) back();
  }
  function onPointer(e) {
    if (!active || !rt.renderer || e.target !== rt.renderer.domElement) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.type === "pointerdown" && e.button === 0) next();
  }

  // ---- start and finish ----

  function start(opts) {
    if (active || rt.space !== "town") return false;
    const o = opts || {};
    active = true;
    onDone = o.onDone || null;
    for (const k in rt.keys) rt.keys[k] = false;
    rt.mouseButtons = 0;
    rt.mouseLook = false;
    document.body.classList.add("intro-on");
    document.body.classList.remove("intro-out");
    ui = attachIntroUi(rt, { next, skip });
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("keyup", onKey, true);
    for (const type of ["pointerdown", "pointermove", "pointerup", "wheel", "contextmenu"]) {
      window.addEventListener(type, onPointer, { capture: true, passive: false });
    }
    rt.cinematic = tick;
    rt.sunAnchor = anchor;

    // &intro=<stop id> in dev: hold that stop at once (for shots).
    const at = o.at ? stops.findIndex((s) => s.id === o.at) : -1;
    if (at >= 0) {
      const b = shotFor(stops[at], camPos, camLook);
      if (rt.forceInterior) rt.forceInterior(b);
      fromPos.copy(camPos);
      fromLook.copy(camLook);
      toPos.copy(camPos);
      toLook.copy(camLook);
      index = at;
      arrive();
    } else {
      camPos.fromArray(OPENING.pos);
      camLook.fromArray(OPENING.look);
      state = "wait";
      ui.ready(false);
      // The fly-in waits for the loading card, so it is seen from the start.
      Promise.resolve(o.after).then(() => {
        if (active && state === "wait") flyTo(0, FLY_IN);
      });
    }
    tick(0);
    return true;
  }

  function finish(now) {
    if (!active) return;
    active = false;
    state = "idle";
    window.removeEventListener("keydown", onKey, true);
    window.removeEventListener("keyup", onKey, true);
    for (const type of ["pointerdown", "pointermove", "pointerup", "wheel", "contextmenu"]) {
      window.removeEventListener(type, onPointer, { capture: true });
    }
    rt.cinematic = null;
    rt.sunAnchor = null;
    if (rt.forceInterior) rt.forceInterior(undefined);
    for (const k in rt.keys) rt.keys[k] = false;
    rt.placeCamera(0, true);
    if (ui) ui.finish();
    ui = null;
    document.body.classList.add("intro-out");
    document.body.classList.remove("intro-on");
    setTimeout(() => document.body.classList.remove("intro-out"), now ? 0 : 1800);
    if (onDone) onDone();
  }

  rt.startIntro = start;
  rt.endIntro = function () { finish(true); };
  Object.defineProperty(rt, "introActive", { configurable: true, get() { return active; } });
}
