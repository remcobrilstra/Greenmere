// Hero action poses layered over the walk cycle, run last in the frame.
//
// Strike (0.46 s, from rt.strikeInfo): the sword arm cocks high and back with the
// shoulders turned away and the shield up, whips down across the body on a
// diagonal with a forward lunge and step, then eases back into the walk. The arc
// ribbon fades with it.
//
// Hearth (Extract hold, rt.castInfo kind "hearth"): both arms rise, the head lifts,
// the Warden floats a hand's width, and a gold rune ring fills around the feet while
// motes spiral up a column of light.
//
// Mend (held, kind "mend"): hands drawn in to the chest, head bowed, a smaller green
// ring and motes; when it lands (rt.mendBurstT) the ring flares out and the motes scatter.
//
// Rotation conventions (hero.js rig, local −z forward): +x on a limb swings it
// forward; +z on the right arm swings the hand out to the right (−z for the left);
// +y on the body turns the right shoulder forward; −x on the body leans forward.

import { buildHearthChannel } from "../view/dungeon.js";

const WIND_END = 0.18;
const HIT = 0.23;
const END = 0.46;

const KEYS = ["rArmX", "rArmZ", "lArmX", "lArmZ", "twist", "lean", "lunge", "rLeg", "lLeg"];
const WIND = { rArmX: -2.35, rArmZ: 0.6, lArmX: 0.75, lArmZ: 0.55, twist: -0.5, lean: 0.1, lunge: 0.06, rLeg: -0.15, lLeg: 0.12 };
const STRIKE = { rArmX: 1.1, rArmZ: -0.55, lArmX: 0.2, lArmZ: 0.25, twist: 0.6, lean: -0.22, lunge: -0.3, rLeg: 0.55, lLeg: -0.3 };

function smooth(t) {
  const u = Math.max(0, Math.min(1, t));
  return u * u * (3 - 2 * u);
}
function easeOut(t) {
  const u = Math.max(0, Math.min(1, t));
  return 1 - (1 - u) * (1 - u);
}
function easeIn(t) {
  const u = Math.max(0, Math.min(1, t));
  return u * u;
}

export function attachHeroAnim(rt) {
  const channel = buildHearthChannel();
  rt.player.add(channel);
  rt.hearthChannel = channel;
  const mendFx = buildHearthChannel({
    name: "mendChannel", lit: 0xc8f08a, glow: 0x6fbf3a, dim: 0x2c4a22, dimGlow: 0x1d3a16, column: 0xd8f8b0, columnGlow: 0x8ed15a
  });
  mendFx.scale.set(0.8, 0.75, 0.8);
  rt.player.add(mendFx);
  rt.mendChannel = mendFx;
  let clock = 0;
  let hearthBlend = 0;
  let mendBlend = 0;
  const loco = {};
  const pose = {};

  function mix(a, b, t) {
    for (const k of KEYS) pose[k] = a[k] + (b[k] - a[k]) * t;
  }

  function strikePose(s) {
    if (s <= WIND_END) mix(loco, WIND, easeOut(s / WIND_END));
    else if (s <= HIT) mix(WIND, STRIKE, easeIn((s - WIND_END) / (HIT - WIND_END)));
    else mix(STRIKE, loco, smooth((s - HIT) / (END - HIT)));
  }

  function toward(key, value, k) {
    pose[key] += (value - pose[key]) * k;
  }

  // Ring, petals, motes, column. `burst` (0..1, 1 = just landed) throws the ring
  // wide and the motes outward as the cast completes.
  function driveFx(group, blend, p, burst) {
    const fx = group.userData;
    group.visible = blend > 0.02 || burst > 0;
    if (!group.visible) return;
    const lit = Math.floor(p * fx.petals.length + 1e-6);
    for (let i = 0; i < fx.petals.length; i++) fx.petals[i].material = i < lit ? fx.gold : fx.dim;
    const pulse = 1 + Math.sin(clock * 6) * 0.04;
    const open = 1 + (burst > 0 ? (1 - burst) * 1.8 : 0);
    const size = Math.max(blend, burst) * pulse * open;
    fx.ring.scale.set(size, 1, size);
    fx.ring.rotation.y = clock * 0.8;
    for (let i = 0; i < fx.motes.length; i++) {
      const m = fx.motes[i];
      const a = i * 2.39996 + clock * (1.6 + p * 2);
      if (burst > 0) {
        const out = 0.5 + (1 - burst) * 2.2;
        m.position.set(Math.cos(a) * out, 0.6 + (1 - burst) * 1.4, Math.sin(a) * out);
        m.scale.setScalar(burst * 1.4);
      } else {
        const phase = (clock * (0.55 + p * 0.5) + i / fx.motes.length) % 1;
        const r = 1.05 * (1 - phase * 0.65);
        m.position.set(Math.cos(a) * r, 0.1 + phase * 2.8, Math.sin(a) * r);
        m.scale.setScalar(blend * (1 - phase) * (0.8 + p));
      }
      m.rotation.y = a;
    }
    fx.column.material.opacity = burst > 0 ? 0.4 * burst : blend * (0.04 + 0.26 * p * p);
  }

  function poseHero(dt) {
    clock += dt;
    // What the walk cycle wrote this frame is the neutral pose.
    loco.rArmX = rt.rightArm.rotation.x;
    loco.rArmZ = rt.rightArm.rotation.z;
    loco.lArmX = rt.leftArm.rotation.x;
    loco.lArmZ = rt.leftArm.rotation.z;
    loco.rLeg = rt.rightLeg.rotation.x;
    loco.lLeg = rt.leftLeg.rotation.x;
    loco.twist = 0;
    loco.lean = 0;
    loco.lunge = 0;
    for (const k of KEYS) pose[k] = loco[k];

    const hit = rt.strikeInfo ? rt.strikeInfo() : null;
    if (hit) strikePose(hit.s);

    const cast = rt.castInfo ? rt.castInfo() : null;
    const ease = 1 - Math.exp(-10 * dt);
    hearthBlend += ((cast && cast.kind === "hearth" ? 1 : 0) - hearthBlend) * ease;
    mendBlend += ((cast && cast.kind === "mend" ? 1 : 0) - mendBlend) * ease;
    // Hearth: both arms raised to the sky.
    if (hearthBlend > 0.001) {
      toward("rArmX", 2.55, hearthBlend);
      toward("lArmX", 2.55, hearthBlend);
      toward("rArmZ", 0.38, hearthBlend);
      toward("lArmZ", -0.38, hearthBlend);
    }
    // Mend: hands drawn in to the chest, a slight bow, a slow breath.
    if (mendBlend > 0.001) {
      const breath = Math.sin(clock * 5) * 0.06;
      toward("rArmX", 1.35 + breath, mendBlend);
      toward("lArmX", 1.35 + breath, mendBlend);
      toward("rArmZ", -0.62, mendBlend);
      toward("lArmZ", 0.62, mendBlend);
      toward("lean", -0.08, mendBlend);
    }

    const motion = rt.heroMotion || (rt.heroMotion = {});
    motion.strike = hit ? hit.s : -1;
    motion.hearth = hearthBlend;
    motion.mend = mendBlend;

    rt.rightArm.rotation.x = pose.rArmX;
    rt.rightArm.rotation.z = pose.rArmZ;
    rt.leftArm.rotation.x = pose.lArmX;
    rt.leftArm.rotation.z = pose.lArmZ;
    rt.rightLeg.rotation.x = pose.rLeg;
    rt.leftLeg.rotation.x = pose.lLeg;
    rt.body.rotation.y = pose.twist;
    rt.body.rotation.x = pose.lean;
    rt.body.position.z = pose.lunge;
    if (rt.head) rt.head.rotation.x = 0.3 * hearthBlend - 0.22 * mendBlend;
    rt.body.position.y += hearthBlend * (0.07 + 0.035 * Math.sin(clock * 4));

    const crescent = rt.strikeCrescent;
    if (crescent && crescent.userData.material) {
      const life = hit ? Math.max(0, hit.arc) : 0;
      crescent.userData.material.opacity = 0.85 * life;
      const grow = 0.85 + 0.25 * (1 - life);
      crescent.scale.set(grow, 1, grow);
    }

    const p = cast ? Math.min(1, cast.t / cast.total) : 1;
    driveFx(channel, hearthBlend, cast && cast.kind === "hearth" ? p : 1, 0);
    let burst = 0;
    if (rt.mendBurstT > 0) {
      rt.mendBurstT = Math.max(0, rt.mendBurstT - dt);
      burst = rt.mendBurstT / 0.55;
    }
    driveFx(mendFx, mendBlend, cast && cast.kind === "mend" ? p : 1, burst);
  }

  rt.poseHero = poseHero;
}
