// Portal transits: the Delve Gate in town and the stair well below.
//
// rt.portalTransit(kind, action) plays the "in" half (the Warden spins, shrinks
// and is drawn into the portal while the screen floods with its colour), runs
// `action` (which swaps the space), then the "out" half (the colour clears and
// the Warden pops out of a burst of light: an expanding ring and a column; no
// point light, floors keep to their light budget).
// Movement, abilities and F are held for the length of it; rt.transit is set.
// If the action fails (returns false) the Warden is simply restored.
//
// The stair-well's F prompt is the HUD's (town.js refreshDungeonPrompt).
//
// Ticks from rt.poseHero, so it runs inside rt.update after the hero is posed.

import * as THREE from "three";

const IN_S = 0.6;
const OUT_S = 0.85;
const STYLE = {
  gate: { flash: "rgba(196, 160, 255, 1)", edge: "rgba(30, 14, 60, 1)", ring: 0x9f7cff, column: 0x7ee0cf, rise: 0.5 },
  stairs: { flash: "rgba(255, 228, 160, 1)", edge: "rgba(60, 34, 10, 1)", ring: 0xe2ba60, column: 0xfff0c8, rise: -1.1 }
};

function clamp01(t) {
  return Math.max(0, Math.min(1, t));
}
function easeIn(t) {
  const u = clamp01(t);
  return u * u * u;
}
function easeOutBack(t) {
  const u = clamp01(t) - 1;
  return 1 + u * u * (2.6 * u + 1.6);
}

function buildBurst() {
  const group = new THREE.Group();
  group.name = "portalBurst";
  const ringMat = new THREE.MeshLambertMaterial({ color: 0x000000, emissive: 0xffffff, flatShading: true, fog: false, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.7, 1.0, 40), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.06;
  group.add(ring);
  const colGeo = new THREE.CylinderGeometry(0.75, 0.95, 7, 20, 1, true);
  colGeo.translate(0, 3.5, 0);
  const colMat = new THREE.MeshLambertMaterial({ color: 0x000000, emissive: 0xffffff, flatShading: true, fog: false, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const column = new THREE.Mesh(colGeo, colMat);
  group.add(column);
  group.visible = false;
  return { group, ring, column };
}

export function attachPortalFx(rt) {
  const flash = document.createElement("div");
  flash.id = "portalfx";
  flash.setAttribute("aria-hidden", "true");
  document.body.appendChild(flash);

  const burst = buildBurst();
  rt.scene.add(burst.group);

  let t = null; // { kind, phase: "in" | "out", time, action }
  let burstT = -1;
  rt.transit = false;

  function setFlash(level, style) {
    flash.style.opacity = level.toFixed(3);
    if (style) flash.style.background = "radial-gradient(circle at 50% 55%, " + style.flash + " 0%, " + style.flash + " 30%, " + style.edge + " 100%)";
  }

  function finishIn() {
    const ok = t.action() !== false;
    rt.player.scale.set(1, 1, 1);
    if (!ok) {
      t = null;
      rt.transit = false;
      rt.suspendCombat = false;
      setFlash(0);
      return;
    }
    t.phase = "out";
    t.time = 0;
    const style = STYLE[t.kind];
    burst.ring.material.emissive.setHex(style.ring);
    burst.column.material.emissive.setHex(style.column);
    burstT = 0;
  }

  rt.portalTransit = function (kind, action) {
    if (t) return true;
    t = { kind: STYLE[kind] ? kind : "gate", phase: "in", time: 0, action };
    rt.transit = true;
    rt.suspendCombat = true;
    for (const k in rt.keys) rt.keys[k] = false;
    if (rt.closePanel) rt.closePanel();
    setFlash(0, STYLE[t.kind]);
    return true;
  };

  // Abilities wait out a transit.
  const prevAbility = rt.tryAbility;
  if (prevAbility) {
    rt.tryAbility = function (...args) {
      if (rt.transit) return false;
      return prevAbility.apply(this, args);
    };
  }

  function tickTransit(dt) {
    if (!t) return;
    t.time += dt;
    const style = STYLE[t.kind];
    if (t.phase === "in") {
      const u = clamp01(t.time / IN_S);
      const k = easeIn(u);
      const s = 1 - 0.88 * k;
      rt.player.scale.set(s, 1 + 0.6 * k, s);
      rt.player.position.y += style.rise * k;
      if (rt.body) rt.body.rotation.y += k * 14 * u;
      setFlash(clamp01((u - 0.35) / 0.65));
      if (u >= 1) finishIn();
      return;
    }
    const u = clamp01(t.time / OUT_S);
    const g = easeOutBack(clamp01(u / 0.55));
    const s = 0.12 + 0.88 * g;
    rt.player.scale.set(s, 1 + (1 - g) * 0.5, s);
    if (rt.body) rt.body.rotation.y += (1 - clamp01(u / 0.55)) * 6;
    setFlash(1 - clamp01(u / 0.6));
    if (u >= 1) {
      rt.player.scale.set(1, 1, 1);
      setFlash(0);
      t = null;
      rt.transit = false;
      rt.suspendCombat = false;
    }
  }

  function tickBurst(dt) {
    if (burstT < 0) {
      burst.group.visible = false;
      return;
    }
    burstT += dt;
    const u = clamp01(burstT / 1.1);
    burst.group.visible = u < 1;
    burst.group.position.set(rt.player.position.x, rt.player.position.y, rt.player.position.z);
    const r = 0.4 + 3.2 * (1 - (1 - u) * (1 - u));
    burst.ring.scale.set(r, r, r);
    burst.ring.material.opacity = 0.9 * (1 - u);
    burst.column.scale.set(1 - 0.6 * u, 0.3 + 0.9 * clamp01(u * 3), 1 - 0.6 * u);
    burst.column.material.opacity = 0.55 * (1 - u) * (1 - u);
    if (u >= 1) burstT = -1;
  }

  const prevPose = rt.poseHero;
  rt.poseHero = function (dt) {
    if (prevPose) prevPose(dt);
    tickTransit(dt || 0);
    tickBurst(dt || 0);
  };
}
