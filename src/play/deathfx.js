// The Warden's death, played over the death lock (DEATH_LOCK_S) before the walk
// home. Runs last in the frame (rt.poseHero) so it overrides the walk and action
// poses while it plays.
//
// 0.00–0.22  recoil: thrown back, arms flung wide, head snapped up
// 0.22–0.70  the knees go: the body drops, legs fold forward, head bows
// 0.70–1.15  topples onto the back (accelerating), arms splayed
// 1.15–1.45  hits the ground: a small bounce, a dust puff, a jolt of the camera
// then still. The camera drifts up over the body; the screen drains to grey,
// "You have fallen" rises, and it goes to black. In town the black lifts.

import * as THREE from "three";
import { DEATH_LOCK_S } from "../sim/balance.js";

const IMPACT = 1.15;

function clamp01(t) {
  return Math.max(0, Math.min(1, t));
}
function smooth(t) {
  const u = clamp01(t);
  return u * u * (3 - 2 * u);
}
function easeIn(t) {
  const u = clamp01(t);
  return u * u;
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function attachDeathFx(rt) {
  // ---- screen ----
  const veil = document.createElement("div");
  veil.id = "deathfx";
  veil.setAttribute("aria-hidden", "true");
  const words = document.createElement("p");
  words.className = "death-words";
  words.textContent = "You have fallen";
  veil.appendChild(words);
  document.body.appendChild(veil);

  // ---- dust puff on impact ----
  const dustMat = new THREE.MeshLambertMaterial({ color: 0x8a7a62, flatShading: true, transparent: true, opacity: 0, depthWrite: false });
  const dust = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.9, 18), dustMat);
  dust.rotation.x = -Math.PI / 2;
  dust.visible = false;
  dust.name = "deathDust";
  rt.scene.add(dust);

  let t = -1; // seconds into the fall; -1 when not dying
  let wake = -1; // seconds into the fade-in after arriving home
  let shook = false;
  const camFrom = { pitch: 0, dist: 0 };
  rt.dying = false;

  function setVeil(grey, dark, black, text) {
    veil.style.setProperty("--grey", grey.toFixed(3));
    veil.style.setProperty("--dark", dark.toFixed(3));
    veil.style.setProperty("--black", black.toFixed(3));
    words.style.opacity = text.toFixed(3);
    words.style.transform = "translateY(" + ((1 - text) * 14).toFixed(1) + "px)";
    veil.classList.toggle("on", grey > 0.001 || dark > 0.001 || black > 0.001);
  }

  function pose(dt) {
    t += dt;
    const recoil = smooth(t / 0.22);
    const kneel = smooth((t - 0.22) / 0.48);
    const fall = easeIn((t - 0.7) / (IMPACT - 0.7));
    const settle = clamp01((t - IMPACT) / 0.3);
    const bounce = t > IMPACT ? Math.sin(settle * Math.PI) * 0.12 * (1 - settle) : 0;

    // Whole body pivots at the feet: +x tips the top backward.
    const back = lerp(lerp(0, 0.28, recoil) * (1 - kneel) + 0.12 * kneel, 1.5, fall) - bounce;
    rt.body.rotation.set(back, 0, lerp(0, 0.18, fall));
    // Drop to the knees, then come to rest lying at the body's thickness.
    rt.body.position.set(0, lerp(lerp(0, -0.36, kneel), 0.22, fall) + bounce * 0.6, lerp(0, 0.25, fall));

    // Legs fold forward under the drop, then straighten out on the ground.
    const legs = lerp(lerp(0.1 * recoil, -1.25, kneel), -0.2, fall);
    rt.leftLeg.rotation.set(legs, 0, 0.05);
    rt.rightLeg.rotation.set(legs * 0.9 - 0.08 * fall, 0, -0.05);

    // Arms: flung wide, sag as the knees go, splayed on the ground.
    // Down, the arms swing back over the shoulders so the blade lies flat.
    const armX = lerp(lerp(-0.6 * recoil, 0.25, kneel), -1.35, fall);
    const armZ = lerp(lerp(1.0 * recoil, 0.45, kneel), 1.0, fall);
    rt.rightArm.rotation.set(armX, 0, -armZ);
    rt.leftArm.rotation.set(armX * 0.75, 0, armZ * 1.15);

    // Head snaps back, bows with the knees, rolls aside when down.
    if (rt.head) rt.head.rotation.set(lerp(lerp(-0.35 * recoil, 0.4, kneel), -0.15, fall), lerp(0, 0.5, fall), 0);
    if (rt.cape) rt.cape.rotation.x = lerp(0.22, 0.05, fall) + 0.2 * recoil * (1 - kneel);

    if (t >= IMPACT && !shook) {
      shook = true;
      rt.camShake = Math.max(rt.camShake || 0, 0.22);
      dust.visible = true;
      dust.position.set(rt.player.position.x, rt.player.position.y + 0.03, rt.player.position.z);
    }
    if (dust.visible) {
      const d = clamp01((t - IMPACT) / 0.8);
      const r = 0.8 + 2.4 * (1 - (1 - d) * (1 - d));
      dust.scale.set(r, r, r);
      dustMat.opacity = 0.55 * (1 - d);
      if (d >= 1) dust.visible = false;
    }

    // The camera drifts up and in over the fallen Warden.
    const lift = smooth((t - 0.6) / 1.6);
    rt.camPitch = lerp(camFrom.pitch, Math.max(camFrom.pitch, 1.0), lift);
    rt.camDist = lerp(camFrom.dist, Math.min(camFrom.dist, 6.2), lift);

    const end = DEATH_LOCK_S;
    setVeil(
      smooth((t - 0.5) / 1.2),
      smooth((t - 0.9) / 1.4) * 0.75,
      smooth((t - (end - 0.65)) / 0.55),
      smooth((t - 1.3) / 0.6)
    );
  }

  const prevPose = rt.poseHero;
  rt.poseHero = function (dt) {
    if (prevPose) prevPose(dt);
    dt = dt || 0;
    const v = rt.vitals;
    const dead = !!(v && v.deathLock && rt.space === "dungeon");
    if (dead && t < 0) {
      t = 0;
      shook = false;
      wake = -1;
      camFrom.pitch = rt.camPitch;
      camFrom.dist = rt.camDist;
      rt.dying = true;
    }
    if (dead) {
      pose(dt);
      return;
    }
    if (t >= 0) {
      // The lock ended: home in town (or the run was cleared some other way).
      t = -1;
      rt.dying = false;
      dust.visible = false;
      wake = rt.space === "town" ? 0 : -1;
      if (wake < 0) setVeil(0, 0, 0, 0);
    }
    if (wake >= 0) {
      wake += dt;
      const k = 1 - smooth(wake / 1.3);
      setVeil(k, k * 0.75, k, 0);
      if (wake >= 1.3) {
        wake = -1;
        setVeil(0, 0, 0, 0);
      }
    }
  };
  rt.deathFx = { playing: () => t >= 0, waking: () => wake >= 0 };
}
