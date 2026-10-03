// Ward made visible.
//
// 3D: a faceted bubble around the Warden while a ward holds. It is brightest when
// fresh and thins as it soaks damage (opacity and a slight shrink follow the share
// left). An absorbed hit flashes it and ripples it out; a hit that empties it
// shatters it into shards that fly off and fade; running out of time fades it,
// flickering through the last second as a warning.
//
// HUD: a pale shield segment on the health bar sized to what is left to absorb,
// and a thin line along the bar's foot for the time left.
//
// Reads rt.session.wardAbsorb / wardT only; the ward's full size is taken as the
// value it had when it was raised (any increase starts a new ward).

import * as THREE from "three";

const SHARDS = 26;
const WARD_BLUE = new THREE.Color(0x7fb8ff);
const WHITE = new THREE.Color(0xffffff);
const SHATTER_S = 0.7;

function clamp01(t) {
  return Math.max(0, Math.min(1, t));
}

function glowMat(hex, opacity) {
  return new THREE.MeshLambertMaterial({
    color: 0x000000,
    emissive: hex,
    flatShading: true,
    fog: false,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide
  });
}

export function attachWardFx(rt) {
  // ---- 3D bubble ----
  const group = new THREE.Group();
  group.name = "wardFx";
  group.visible = false;
  rt.scene.add(group);

  const shellMat = glowMat(0x7fb8ff, 0);
  const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(1.08, 1), shellMat);
  shell.position.y = 1.0;
  shell.scale.set(1, 1.12, 1);
  group.add(shell);
  // Bright facet edges over the soft shell.
  const edgeMat = new THREE.LineBasicMaterial({ color: 0xa8d0ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  edgeMat.flatShading = true;
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(shell.geometry), edgeMat);
  shell.add(edges);
  // Ground ring under the bubble.
  const ringMat = glowMat(0x9ccaff, 0);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.95, 1.12, 32), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.05;
  group.add(ring);

  const shardMat = glowMat(0xcfe6ff, 0);
  const shardGeo = new THREE.TetrahedronGeometry(0.16, 0);
  const shards = new THREE.InstancedMesh(shardGeo, shardMat, SHARDS);
  shards.frustumCulled = false;
  shards.visible = false;
  rt.scene.add(shards);
  const shardData = [];
  for (let i = 0; i < SHARDS; i++) {
    const a = (i / SHARDS) * Math.PI * 2 + (i % 3) * 0.4;
    const up = ((i * 7) % 11) / 11;
    shardData.push({
      dir: new THREE.Vector3(Math.cos(a) * (1 - up * 0.6), 0.3 + up * 0.9, Math.sin(a) * (1 - up * 0.6)).normalize(),
      spin: 4 + (i % 5) * 2,
      speed: 3.2 + (i % 4) * 0.7
    });
  }
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const origin = new THREE.Vector3();

  // ---- HUD ----
  const hpBar = document.getElementById("hp-bar");
  const overlay = document.createElement("span");
  overlay.className = "ward-overlay";
  overlay.hidden = true;
  const timer = document.createElement("i");
  timer.className = "ward-timer";
  timer.hidden = true;
  if (hpBar) {
    // Under the "hp / max" label.
    const label = hpBar.querySelector("em");
    hpBar.insertBefore(overlay, label);
    hpBar.insertBefore(timer, label);
  }

  let max = 0;
  let maxT = 0;
  let last = 0;
  let hitFlash = 0;
  let ripple = 0;
  let shatterT = -1;
  let fadeT = 0;
  let clock = 0;

  function startShatter() {
    shatterT = 0;
    origin.set(rt.player.position.x, rt.player.position.y + 1.0, rt.player.position.z);
    shards.visible = true;
  }

  function tick3d(dt) {
    clock += dt;
    const s = rt.session || {};
    const absorb = s.wardAbsorb > 0 ? s.wardAbsorb : 0;
    const t = s.wardT > 0 ? s.wardT : 0;
    const live = absorb > 0 && t > 0;
    if (absorb > last + 1e-6) {
      // A new ward (or a stronger one) was raised.
      max = absorb;
      maxT = t;
      ripple = 1;
      shatterT = -1;
      shards.visible = false;
    } else if (absorb < last - 1e-6) {
      if (absorb <= 0 && t > 0) startShatter();
      else {
        hitFlash = 1;
        ripple = Math.max(ripple, 0.6);
      }
    }
    if (last > 0 && absorb <= 0 && t <= 0 && shatterT < 0) fadeT = 0.3; // ran out of time
    last = absorb;

    hitFlash = Math.max(0, hitFlash - dt * 4);
    ripple = Math.max(0, ripple - dt * 3);
    if (fadeT > 0) fadeT = Math.max(0, fadeT - dt);

    const share = max > 0 ? clamp01(absorb / max) : 0;
    const showing = live || fadeT > 0;
    group.visible = showing;
    if (showing) {
      group.position.copy(rt.player.position);
      // Flicker through the last second.
      const warn = live && t < 1 ? 0.55 + 0.45 * Math.abs(Math.sin(clock * 18)) : 1;
      const fade = live ? 1 : fadeT / 0.3;
      const base = (0.1 + 0.16 * share) * warn * fade;
      shellMat.opacity = base + 0.35 * hitFlash;
      edgeMat.opacity = (0.16 + 0.34 * share) * warn * fade + 0.4 * hitFlash;
      ringMat.opacity = (0.2 + 0.35 * share) * warn * fade;
      const breathe = 1 + 0.02 * Math.sin(clock * 3);
      const r = (0.88 + 0.12 * share) * breathe + 0.18 * Math.sin(ripple * Math.PI);
      shell.scale.set(r, 1.12 * r, r);
      ring.scale.set(r, r, r);
      shell.rotation.y += dt * 0.6;
      shellMat.emissive.copy(WARD_BLUE).lerp(WHITE, hitFlash * 0.7);
    }

    if (shatterT >= 0) {
      shatterT += dt;
      const u = clamp01(shatterT / SHATTER_S);
      shardMat.opacity = 0.9 * (1 - u);
      for (let i = 0; i < SHARDS; i++) {
        const d = shardData[i];
        const dist = 1.05 + d.speed * shatterT;
        p.copy(origin).addScaledVector(d.dir, dist);
        p.y -= 4.5 * shatterT * shatterT;
        e.set(d.spin * shatterT, d.spin * 0.7 * shatterT, 0);
        q.setFromEuler(e);
        const k = 1 - 0.6 * u;
        sc.set(k, k, k);
        m4.compose(p, q, sc);
        shards.setMatrixAt(i, m4);
      }
      shards.instanceMatrix.needsUpdate = true;
      if (u >= 1) {
        shatterT = -1;
        shards.visible = false;
      }
    }

    // HUD segment.
    const v = rt.vitals;
    if (live && v && v.hpMax > 0) {
      const hpPct = clamp01(v.hp / v.hpMax) * 100;
      const w = Math.min(100, (absorb / v.hpMax) * 100);
      const left = Math.min(hpPct, 100 - w);
      overlay.hidden = false;
      overlay.style.left = left.toFixed(1) + "%";
      overlay.style.width = w.toFixed(1) + "%";
      overlay.classList.toggle("hit", hitFlash > 0.2);
      timer.hidden = false;
      timer.style.width = (maxT > 0 ? clamp01(t / maxT) * 100 : 0).toFixed(1) + "%";
      timer.classList.toggle("ending", t < 1);
      if (hpBar) hpBar.setAttribute("data-ward", String(Math.round(absorb)));
    } else if (!overlay.hidden) {
      overlay.hidden = true;
      timer.hidden = true;
      if (hpBar) hpBar.removeAttribute("data-ward");
    }
  }

  const prevPose = rt.poseHero;
  rt.poseHero = function (dt) {
    if (prevPose) prevPose(dt);
    tick3d(dt || 0);
  };
  rt.wardFx = {
    visible: () => group.visible,
    shattering: () => shatterT >= 0,
    overlayShown: () => !overlay.hidden
  };
}
