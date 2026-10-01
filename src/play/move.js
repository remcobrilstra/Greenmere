import * as THREE from "three";
import { walkSpeed, sprintSpeed } from "../sim/balance.js";
import { HALF } from "../sim/terrain.js";

const LIMIT = HALF - 12;

export function dampAngle(current, target, lambda, dt) {
  const diff = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + diff * (1 - Math.exp(-lambda * dt));
}

export function attachMovement(rt) {
  const CELL = 8;
  const colliderGrid = new Map();
  rt.colliders = [];
  const _wish = new THREE.Vector3();
  let walkPhase = 0;
  let animBlend = 0;
  let time = 0;

  function bucketAt(gx, gz) {
    const k = gx + ":" + gz;
    let bucket = colliderGrid.get(k);
    if (!bucket) colliderGrid.set(k, bucket = []);
    return bucket;
  }
  function addCollider(x, z, r) {
    const item = { x, z, r };
    rt.colliders.push(item);
    bucketAt(Math.floor(x / CELL), Math.floor(z / CELL)).push(item);
    return item;
  }
  // Oriented box on XZ. hx/hz are half extents in the box frame; yaw rotates it
  // like Object3D.rotation.y. r is the bounding radius, used for bucketing only.
  // A box is filed in every cell its bounding circle touches.
  function addBoxCollider(x, z, hx, hz, yaw) {
    const a = yaw || 0;
    const item = { kind: "box", x, z, hx, hz, yaw: a, c: Math.cos(a), s: Math.sin(a), r: Math.hypot(hx, hz), stamp: 0 };
    rt.colliders.push(item);
    const r = item.r;
    for (let gx = Math.floor((x - r) / CELL); gx <= Math.floor((x + r) / CELL); gx++) {
      for (let gz = Math.floor((z - r) / CELL); gz <= Math.floor((z + r) / CELL); gz++) {
        bucketAt(gx, gz).push(item);
      }
    }
    return item;
  }
  function pushOutOfBox(b, x, z, radius, out) {
    const dx = x - b.x;
    const dz = z - b.z;
    let lx = dx * b.c - dz * b.s;
    let lz = dx * b.s + dz * b.c;
    const qx = Math.max(-b.hx, Math.min(b.hx, lx));
    const qz = Math.max(-b.hz, Math.min(b.hz, lz));
    const ex = lx - qx;
    const ez = lz - qz;
    const d2 = ex * ex + ez * ez;
    if (d2 >= radius * radius) return false;
    if (d2 > 1e-10) {
      const d = Math.sqrt(d2);
      const push = (radius - d) / d;
      lx += ex * push;
      lz += ez * push;
    } else if (b.hx - Math.abs(lx) < b.hz - Math.abs(lz)) {
      lx = (lx < 0 ? -1 : 1) * (b.hx + radius);
    } else {
      lz = (lz < 0 ? -1 : 1) * (b.hz + radius);
    }
    out.x = b.x + lx * b.c + lz * b.s;
    out.z = b.z - lx * b.s + lz * b.c;
    return true;
  }
  let resolveStamp = 0;
  const _pushed = { x: 0, z: 0 };
  // level: 0 ground (default), 1 upstairs. Colliders carry their level; `off`
  // marks town dressing that the current depth tier has not unlocked yet.
  function resolveColliders(x, z, radius, level) {
    const lv = level || 0;
    for (let pass = 0; pass < 3; pass++) {
      resolveStamp++;
      const ix = Math.floor(x / CELL);
      const iz = Math.floor(z / CELL);
      for (let gx = ix - 1; gx <= ix + 1; gx++) {
        for (let gz = iz - 1; gz <= iz + 1; gz++) {
          const bucket = colliderGrid.get(gx + ":" + gz);
          if (!bucket) continue;
          for (const c of bucket) {
            if (c.off || (c.level || 0) !== lv) continue;
            if (c.kind === "box") {
              if (c.stamp === resolveStamp) continue;
              c.stamp = resolveStamp;
              if (pushOutOfBox(c, x, z, radius, _pushed)) {
                x = _pushed.x;
                z = _pushed.z;
              }
              continue;
            }
            const dx = x - c.x;
            const dz = z - c.z;
            const min = radius + c.r;
            const d2 = dx * dx + dz * dz;
            if (d2 < min * min && d2 > 1e-8) {
              const d = Math.sqrt(d2);
              const push = (min - d) / d;
              x += dx * push;
              z += dz * push;
            }
          }
        }
      }
      if (rt.resolveTownActors && lv === 0) {
        const moved = rt.resolveTownActors(x, z, radius);
        if (moved) {
          x = moved.x;
          z = moved.z;
        }
      }
    }
    return { x, z };
  }
  function update(dt) {
    time += dt;
    const keys = rt.keys;
    const forward = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
    const strafe = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
    rt.cameraPlanarBasis();
    _wish.set(0, 0, 0);
    if (forward !== 0 || strafe !== 0) {
      _wish.addScaledVector(rt.fwd, forward).addScaledVector(rt.right, strafe);
      if (_wish.lengthSq() > 0) _wish.normalize();
    }
    const sprint = !!(keys.ShiftLeft || keys.ShiftRight);
    const moving = _wish.lengthSq() > 0;
    const player = rt.player;
    const dungeon = rt.space === "dungeon";
    const windup = dungeon && rt.strikeWindup;
    if (moving) {
      const quick = rt.session && Number.isFinite(rt.session.quick) ? rt.session.quick : 0;
      const delver = rt.session && rt.session.tracks ? rt.session.tracks.delver : 0;
      let speed = (sprint ? sprintSpeed(delver) : walkSpeed(delver)) * (1 + quick / 100);
      if (windup) speed *= 0.35;
      let nx = player.position.x + _wish.x * speed * dt;
      let nz = player.position.z + _wish.z * speed * dt;
      if (dungeon && rt.resolveDungeon) {
        const resolved = rt.resolveDungeon(nx, nz, 0.42, "hero");
        nx = resolved.x;
        nz = resolved.z;
      } else {
        const resolved = resolveColliders(nx, nz, 0.42, rt.heroLevel || 0);
        nx = Math.max(-LIMIT, Math.min(LIMIT, resolved.x));
        nz = Math.max(-LIMIT, Math.min(LIMIT, resolved.z));
      }
      const dx = nx - player.position.x;
      const dz = nz - player.position.z;
      player.position.x = nx;
      player.position.z = nz;
      if (rt.noteExtractMove) rt.noteExtractMove(Math.hypot(dx, dz));
      if (!windup) {
        // Local forward is −z, so the yaw that faces travel d is atan2(−d.x, −d.z).
        const targetYaw = Math.atan2(-_wish.x, -_wish.z);
        player.rotation.y = dampAngle(player.rotation.y, targetYaw, 14, dt);
      }
      walkPhase += dt * (sprint ? 11.5 : 8.2);
    }
    if (dungeon) player.position.y = 0;
    else {
      if (rt.stepHeroLevel) rt.stepHeroLevel(player.position.x, player.position.z);
      player.position.y = rt.heroGroundY ? rt.heroGroundY(player.position.x, player.position.z) : rt.groundY(player.position.x, player.position.z);
    }
    animBlend += ((moving ? 1 : 0) - animBlend) * (1 - Math.exp(-8 * dt));
    const swing = Math.sin(walkPhase) * 0.9 * animBlend;
    rt.leftLeg.rotation.x = swing;
    rt.rightLeg.rotation.x = -swing;
    rt.leftLeg.rotation.z = 0.05;
    rt.rightLeg.rotation.z = -0.05;
    rt.leftArm.rotation.x = -swing * 0.7;
    rt.rightArm.rotation.x = swing * 0.7;
    rt.leftArm.rotation.z = 0.2;
    rt.rightArm.rotation.z = -0.2;
    const bob = Math.abs(Math.sin(walkPhase)) * 0.055 * animBlend;
    const breath = Math.sin(time * 1.8) * 0.012 * (1 - animBlend);
    rt.body.position.y = bob + breath;
    rt.body.rotation.z = Math.sin(walkPhase) * 0.035 * animBlend;
    rt.torso.scale.y = 1 + Math.sin(time * 2.1) * 0.015 * (1 - animBlend);
    rt.cape.rotation.x = 0.22 + Math.sin(walkPhase) * 0.05 * animBlend;
    rt.flame.rotation.y += dt * 2.2;
    const flick = 1 + Math.sin(time * 9.0) * 0.08 + Math.sin(time * 13.0) * 0.05;
    rt.flameOuter.scale.set(flick, 0.92 + flick * 0.12, flick);
    rt.flameInner.scale.set(1, 0.85 + Math.sin(time * 15) * 0.12, 1);
    rt.campLight.intensity = 7.2 + Math.sin(time * 11) * 1.4;
    const clouds = rt.clouds;
    for (let i = 0; i < clouds.length; i++) {
      clouds[i].position.x += dt * (0.45 + i * 0.05);
      if (clouds[i].position.x > HALF + 20) clouds[i].position.x = -HALF - 10;
    }
    if (!dungeon && rt.tickTown) rt.tickTown(dt, time);
    rt.placeCamera(dt, false);
    rt.updateSun();
    if (rt.collectDrops) rt.collectDrops();
    if (!dungeon && rt.refreshTownPrompt) rt.refreshTownPrompt();
    if (rt.tickCombat) rt.tickCombat(dt);
  }
  function resetHero(x, z, yaw) {
    for (const k in rt.keys) rt.keys[k] = false;
    rt.heroLevel = 0;
    rt.player.position.set(x, 0, z);
    rt.player.position.y = rt.groundY(x, z);
    rt.player.rotation.set(0, yaw || 0, 0);
    rt.camYaw = 0;
    rt.camPitch = 0.4;
    rt.camDist = 8;
    rt.placeCamera(0, true);
    rt.updateSun();
  }

  rt.addCollider = addCollider;
  rt.addBoxCollider = addBoxCollider;
  rt.resolveColliders = resolveColliders;
  rt.update = update;
  rt.resetHero = resetHero;
}

export function bindKeys(rt) {
  window.addEventListener("keydown", (e) => {
    if (e.code === "Backquote" && rt.dev && !e.repeat) {
      rt.hideColliders = !rt.hideColliders;
      if (rt.syncColliderOverlay) rt.syncColliderOverlay();
    }
    const typing = e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA");
    if (typing) return;
    rt.keys[e.code] = true;
    if (e.code.startsWith("Arrow") || e.code === "Space") e.preventDefault();
    if (!e.repeat && e.code.length === 6 && e.code.startsWith("Digit") && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const n = e.code.charCodeAt(5) - 49;
      if (n >= 0 && n < 8) {
        if (n === 3 && rt.space === "dungeon") rt.extractKey = true;
        rt.tryAbility(n);
      }
    }
  });
  window.addEventListener("keyup", (e) => {
    rt.keys[e.code] = false;
    if (e.code === "Digit4" && rt.releaseExtract) rt.releaseExtract();
  });
  window.addEventListener("blur", () => {
    for (const k in rt.keys) rt.keys[k] = false;
  });
}
