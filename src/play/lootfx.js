// Gear feedback.
//
// On the ground: gear glints (view/dungeon.js buildGlint) bob and turn once they
// land; their beams breathe, and an epic's beam and ring pulse.
//
// On the Warden: putting on a rare or epic piece flashes a ring and a column of
// light in its rarity colour. Only a change of one or two slots counts, so
// loading a save or starting fresh does not flash.

import * as THREE from "three";
import { RARITY_HEX } from "../view/dungeon.js";

const SLOTS = ["weapon", "offhand", "head", "body", "feet", "trinket"];
const FLASH_S = 0.9;

function glowMat() {
  return new THREE.MeshLambertMaterial({
    color: 0x000000,
    emissive: 0xffffff,
    flatShading: true,
    fog: false,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide
  });
}

export function attachLootFx(rt) {
  let clock = 0;

  function tickGround(dt) {
    const drops = rt.groundDrops;
    if (!drops) return;
    for (let i = 0; i < drops.length; i++) {
      const d = drops[i];
      const m = d && d.mesh;
      if (!m || m.name !== "glint" || d.fly) continue;
      const r = m.userData.rarity || 0;
      const phase = (i * 1.7) % 6.28;
      m.rotation.y += dt * (1.2 + 0.3 * r);
      m.position.y = (d.restY || 0.46) + Math.sin(clock * 2.4 + phase) * 0.06;
      for (const c of m.children) {
        // Keep the beam and ring planted while the gem bobs.
        const bobY = m.position.y - (d.restY || 0.46);
        if (c.name === "glintBeam") {
          c.position.y = -bobY;
          c.material.opacity = (0.22 + 0.06 * r) * (r >= 3 ? 0.75 + 0.35 * Math.sin(clock * 4 + phase) : 0.9 + 0.1 * Math.sin(clock * 2 + phase));
        } else if (c.name === "glintRing") {
          c.position.y = 0.04 - (d.restY || 0.46) - bobY;
          const s = r >= 3 ? 1 + 0.15 * Math.sin(clock * 4 + phase) : 1;
          c.scale.set(s, s, s);
        }
      }
    }
  }

  // ---- equip flash ----
  const group = new THREE.Group();
  group.name = "equipFlash";
  group.visible = false;
  rt.scene.add(group);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.95, 32), glowMat());
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.06;
  group.add(ring);
  const colGeo = new THREE.CylinderGeometry(0.55, 0.75, 2.6, 18, 1, true);
  colGeo.translate(0, 1.3, 0);
  const column = new THREE.Mesh(colGeo, glowMat());
  group.add(column);
  let flashT = -1;

  let worn = null;
  function wornNow() {
    const eq = rt.session && rt.session.equipped;
    const out = {};
    for (const k of SLOTS) {
      const it = eq && eq[k];
      out[k] = it ? { uid: it.uid || "", rarity: Math.floor(Number(it.rarity) || 0) } : null;
    }
    return out;
  }
  function checkEquip() {
    const now = wornNow();
    if (!worn) {
      worn = now;
      return;
    }
    let changed = 0;
    let best = -1;
    for (const k of SLOTS) {
      const a = worn[k];
      const b = now[k];
      if ((a ? a.uid : "") === (b ? b.uid : "")) continue;
      changed++;
      if (b) best = Math.max(best, b.rarity);
    }
    worn = now;
    if (changed >= 1 && changed <= 2 && best >= 2) startFlash(best);
  }
  function startFlash(rarity) {
    const hex = RARITY_HEX[Math.max(0, Math.min(3, rarity))];
    ring.material.emissive.setHex(hex);
    column.material.emissive.setHex(hex);
    flashT = 0;
    group.visible = true;
  }
  rt.equipFlash = startFlash;
  rt.equipFlashActive = () => flashT >= 0;

  // A loaded or fresh ledger is not an equip.
  for (const name of ["applySaveDoc", "freshGame"]) {
    const prev = rt[name];
    if (typeof prev !== "function") continue;
    rt[name] = function (...args) {
      const out = prev.apply(this, args);
      worn = null;
      return out;
    };
  }

  function tickFlash(dt) {
    if (flashT < 0) return;
    flashT += dt;
    const u = Math.min(1, flashT / FLASH_S);
    group.position.copy(rt.player.position);
    const r = 0.6 + 1.6 * (1 - (1 - u) * (1 - u));
    ring.scale.set(r, r, r);
    ring.material.opacity = 0.9 * (1 - u);
    column.scale.set(1 - 0.4 * u, Math.min(1, u * 4), 1 - 0.4 * u);
    column.material.opacity = 0.45 * (1 - u) * (1 - u);
    if (u >= 1) {
      flashT = -1;
      group.visible = false;
    }
  }

  const prevPose = rt.poseHero;
  rt.poseHero = function (dt) {
    if (prevPose) prevPose(dt);
    dt = dt || 0;
    clock += dt;
    tickGround(dt);
    checkEquip();
    tickFlash(dt);
  };
}
