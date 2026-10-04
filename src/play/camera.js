import * as THREE from "three";
import { terrainHeight } from "../sim/terrain.js";

export function createViewCamera() {
  return new THREE.PerspectiveCamera(48, 1, 0.12, 520);
}

export function attachCamera(rt) {
  const UP = new THREE.Vector3(0, 1, 0);
  const _fwd = new THREE.Vector3();
  const _right = new THREE.Vector3();
  const _focus = new THREE.Vector3();
  const _desired = new THREE.Vector3();
  const _rayOrigin = new THREE.Vector3();
  const _rayDir = new THREE.Vector3();
  const _raycaster = new THREE.Raycaster();
  const _mapFwd = new THREE.Vector3();
  const _mapCam = new THREE.Vector3();

  // The terrain mesh's own surface (view/town meshHeight), not a raycast: it is called
  // several times a frame and a ray tests all 20,000 terrain triangles.
  function terrainY(x, z) {
    const at = rt.terrain && rt.terrain.userData.heightAt;
    if (at) return at(x, z);
    _rayOrigin.set(x, 48, z);
    _rayDir.set(0, -1, 0);
    _raycaster.set(_rayOrigin, _rayDir);
    _raycaster.near = 0;
    _raycaster.far = 90;
    const hits = _raycaster.intersectObject(rt.terrain, false);
    return hits.length ? hits[0].point.y : terrainHeight(x, z);
  }
  // Distance along a ray (unit dir) to where it first dips under the terrain, or -1.
  // Marches in 0.5 m steps and refines the crossing by bisection.
  function terrainRayHit(from, dir, far) {
    const at = rt.terrain && rt.terrain.userData.heightAt;
    if (!at) return -1;
    const step = 0.5;
    let prev = 0;
    for (let t = step; ; t += step) {
      const d = Math.min(t, far);
      if (from.y + dir.y * d < at(from.x + dir.x * d, from.z + dir.z * d)) {
        let lo = prev;
        let hi = d;
        for (let k = 0; k < 6; k++) {
          const mid = (lo + hi) / 2;
          if (from.y + dir.y * mid < at(from.x + dir.x * mid, from.z + dir.z * mid)) hi = mid;
          else lo = mid;
        }
        return hi;
      }
      if (d >= far) return -1;
      prev = d;
    }
  }
  function groundY(x, z) {
    const ground = terrainY(x, z);
    // Building floors sit above the flat town core.
    const floor = rt.floorAt ? rt.floorAt(x, z) : null;
    return floor != null && floor > ground ? floor : ground;
  }
  function computeDesiredCamera(out) {
    _focus.copy(rt.player.position);
    _focus.y += 1.4;
    const cp = Math.cos(rt.camPitch);
    out.set(
      _focus.x + Math.sin(rt.camYaw) * cp * rt.camDist,
      _focus.y + Math.sin(rt.camPitch) * rt.camDist,
      _focus.z + Math.cos(rt.camYaw) * cp * rt.camDist
    );
    return out;
  }
  let shakeClock = 0;
  function placeCamera(dt, snap) {
    computeDesiredCamera(_desired);
    _rayDir.copy(_desired).sub(_focus);
    const len = _rayDir.length();
    if (len > 0.001) {
      _rayDir.multiplyScalar(1 / len);
      _raycaster.set(_focus, _rayDir);
      _raycaster.near = 0;
      _raycaster.far = len;
      let hits = [];
      if (rt.space === "dungeon") {
        const occluders = rt.activeOccluders || [];
        if (occluders.length) hits = _raycaster.intersectObjects(occluders, false);
      } else {
        const t = terrainRayHit(_focus, _rayDir, len);
        if (t >= 0) hits = [{ distance: t }];
        else if (!(rt.terrain && rt.terrain.userData.heightAt)) hits = _raycaster.intersectObject(rt.terrain, false);
        const occluders = rt.townOccluders ? rt.townOccluders() : null;
        if (occluders && occluders.length) {
          const more = _raycaster.intersectObjects(occluders, false);
          if (more.length && (!hits.length || more[0].distance < hits[0].distance)) hits = more;
        }
      }
      if (hits.length && hits[0].distance < len - 0.25) {
        _desired.copy(_focus).addScaledVector(_rayDir, Math.max(1.5, hits[0].distance - 0.4));
      }
    }
    if (rt.space !== "dungeon") {
      const gy = rt.groundY(_desired.x, _desired.z);
      if (_desired.y < gy + 0.7) _desired.y = gy + 0.7;
    }
    if (snap) rt.camera.position.copy(_desired);
    else rt.camera.position.lerp(_desired, 1 - Math.exp(-7 * dt));
    rt.camera.lookAt(_focus);
    // Hit shake: a small, fast wobble of the view (not the boom), so the next
    // frame's lookAt starts clean and nothing drifts.
    if (rt.camShake > 0) {
      shakeClock += dt;
      const a = rt.camShake * 0.06;
      rt.camera.rotateX(Math.sin(shakeClock * 61) * a);
      rt.camera.rotateY(Math.sin(shakeClock * 47 + 1.3) * a);
      rt.camShake = Math.max(0, rt.camShake - dt * 1.4);
    }
  }
  function cameraPlanarBasis() {
    rt.camera.getWorldDirection(_fwd);
    _fwd.y = 0;
    if (_fwd.lengthSq() < 1e-8) _fwd.set(0, 0, -1);
    else _fwd.normalize();
    // forward × up = right. With the camera behind the hero, fwd (0,0,-1) → right (1,0,0).
    _right.crossVectors(_fwd, UP);
  }
  function playerPlanarDir() {
    _mapFwd.set(0, 0, -1).applyQuaternion(rt.player.quaternion);
    _mapFwd.y = 0;
    return { x: _mapFwd.x, z: _mapFwd.z };
  }
  function cameraPlanarDir() {
    rt.camera.getWorldDirection(_mapCam);
    _mapCam.y = 0;
    if (_mapCam.lengthSq() < 1e-8) _mapCam.set(0, 0, -1);
    return { x: _mapCam.x, z: _mapCam.z };
  }

  rt.fwd = _fwd;
  rt.right = _right;
  rt.groundY = groundY;
  rt.placeCamera = placeCamera;
  rt.cameraPlanarBasis = cameraPlanarBasis;
  rt.playerPlanarDir = playerPlanarDir;
  rt.cameraPlanarDir = cameraPlanarDir;
}

const DUNGEON_CLAMPS = { pitchMin: 0.18, pitchMax: 0.95, distMin: 4.2, distMax: 12 };
const TOWN_CLAMPS = { pitchMin: 0.12, pitchMax: 1.05, distMin: 3.6, distMax: 16 };
// Indoors the camera looks down into the cut-away room from above the walls.
export const INDOOR_CLAMPS = { pitchMin: 0.55, pitchMax: 1.15, distMin: 3.6, distMax: 8.5 };

export function cameraClamps(rt) {
  if (rt.space === "dungeon") return DUNGEON_CLAMPS;
  return rt.insideBuilding ? INDOOR_CLAMPS : TOWN_CLAMPS;
}

export function bindOrbit(dom, rt) {
  dom.addEventListener("contextmenu", (e) => e.preventDefault());
  // Right button held: mouselook, the hero turns with the camera. Both buttons
  // held: the hero also walks forward (rt.mouseButtons, read by move.js).
  // A second button pressed while one is down arrives as a pointermove, not a
  // pointerdown, so every pointer event resyncs the button state.
  const syncButtons = (e) => {
    rt.mouseButtons = e.buttons & 3;
    rt.mouseLook = !!(e.buttons & 2);
  };
  const clearButtons = () => {
    rt.mouseButtons = 0;
    rt.mouseLook = false;
  };
  rt.mouseButtons = 0;
  dom.addEventListener("pointerdown", (e) => {
    if (e.button === 0 || e.button === 2) dom.setPointerCapture(e.pointerId);
    syncButtons(e);
  });
  dom.addEventListener("pointerup", syncButtons);
  dom.addEventListener("lostpointercapture", clearButtons);
  window.addEventListener("blur", clearButtons);
  dom.addEventListener("pointermove", (e) => {
    syncButtons(e);
    if (!(e.buttons & 3)) return;
    // Dragging up tips the camera down toward the horizon (and down raises it).
    rt.camYaw -= e.movementX * 0.005;
    rt.camPitch += e.movementY * 0.0035;
    const k = cameraClamps(rt);
    rt.camPitch = Math.max(k.pitchMin, Math.min(k.pitchMax, rt.camPitch));
  });
  dom.addEventListener("wheel", (e) => {
    e.preventDefault();
    const step = Math.sign(e.deltaY) * 0.55;
    const k = cameraClamps(rt);
    rt.camDist = Math.min(k.distMax, Math.max(k.distMin, rt.camDist + step));
  }, { passive: false });
}
