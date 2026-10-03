// Level-up flourish: a gold column bursts up around the Warden, three rune rings
// climb it while sparks spiral up and out, and a "Level N" banner rises over the
// action bar. About two seconds; a second level-up restarts it.
// rt.levelUpFx(level) starts it (ui/character.js calls it on a level gained in
// play). The 3D part ticks from rt.poseHero, the banner from rt.tickHud.

import * as THREE from "three";

const LIFE = 2.1;
const SPARKS = 28;

function clamp01(t) {
  return Math.max(0, Math.min(1, t));
}

function glowMat(hex) {
  return new THREE.MeshLambertMaterial({
    color: 0x000000,
    emissive: hex,
    flatShading: true,
    fog: false,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide
  });
}

export function attachLevelUpFx(rt) {
  const group = new THREE.Group();
  group.name = "levelUpFx";
  group.visible = false;
  rt.scene.add(group);

  const colGeo = new THREE.CylinderGeometry(0.85, 1.05, 6, 24, 1, true);
  colGeo.translate(0, 3, 0);
  const column = new THREE.Mesh(colGeo, glowMat(0xffd27a));
  group.add(column);

  const rings = [];
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.08, 36), glowMat(0xffe2a8));
    ring.rotation.x = -Math.PI / 2;
    group.add(ring);
    rings.push(ring);
  }

  const sparkGeo = new THREE.OctahedronGeometry(0.07, 0);
  const sparkMat = glowMat(0xfff0c8);
  const sparks = new THREE.InstancedMesh(sparkGeo, sparkMat, SPARKS);
  sparks.frustumCulled = false;
  group.add(sparks);
  const seeds = [];
  for (let i = 0; i < SPARKS; i++) seeds.push({ a: (i / SPARKS) * Math.PI * 2, r: 0.6 + (i % 4) * 0.18, delay: (i % 7) * 0.06, speed: 2.2 + (i % 5) * 0.35 });
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();

  const banner = document.createElement("div");
  banner.id = "levelup-banner";
  banner.hidden = true;
  const small = document.createElement("span");
  small.className = "small";
  small.textContent = "Level up";
  const big = document.createElement("span");
  big.className = "big";
  banner.append(small, big);
  document.body.appendChild(banner);

  let t = -1;
  let bannerT = -1;

  rt.levelUpFx = function (level) {
    t = 0;
    bannerT = 0;
    big.textContent = "Level " + level;
    banner.hidden = false;
    banner.classList.remove("play");
    void banner.offsetWidth; // restart the CSS animation
    banner.classList.add("play");
  };
  rt.levelUpActive = () => t >= 0;

  function tick3d(dt) {
    if (t < 0) return;
    t += dt;
    const u = clamp01(t / LIFE);
    group.visible = u < 1;
    if (u >= 1) {
      t = -1;
      return;
    }
    group.position.copy(rt.player.position);
    const fade = 1 - clamp01((u - 0.55) / 0.45);
    const grow = clamp01(u / 0.12);
    column.scale.set(1 + 0.25 * u, grow, 1 + 0.25 * u);
    column.material.opacity = 0.3 * fade * (0.85 + 0.15 * Math.sin(t * 30));
    for (let i = 0; i < rings.length; i++) {
      const ru = clamp01((t - i * 0.18) / 1.3);
      const ring = rings[i];
      ring.position.y = 0.08 + ru * 4.2;
      const r = 1.0 + 0.5 * Math.sin(ru * Math.PI);
      ring.scale.set(r, r, r);
      ring.rotation.z = t * (i % 2 ? -2 : 2);
      ring.material.opacity = ru > 0 && ru < 1 ? 0.9 * Math.sin(ru * Math.PI) * fade : 0;
    }
    for (let i = 0; i < SPARKS; i++) {
      const sd = seeds[i];
      const k = Math.max(0, t - sd.delay);
      const a = sd.a + k * sd.speed;
      const rad = sd.r + k * 0.55;
      p.set(Math.cos(a) * rad, 0.2 + k * 2.4, Math.sin(a) * rad);
      const sz = k > 0 ? Math.max(0, 1 - k / (LIFE - sd.delay)) * 1.4 : 0;
      s.set(sz, sz, sz);
      q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, a);
      m.compose(p, q, s);
      sparks.setMatrixAt(i, m);
    }
    sparks.instanceMatrix.needsUpdate = true;
    sparkMat.opacity = fade;
  }

  const prevPose = rt.poseHero;
  rt.poseHero = function (dt) {
    if (prevPose) prevPose(dt);
    tick3d(dt || 0);
  };

  const prevHud = rt.tickHud;
  rt.tickHud = function (dt) {
    if (prevHud) prevHud(dt);
    if (bannerT < 0) return;
    bannerT += dt || 0;
    if (bannerT > 2.6) {
      bannerT = -1;
      banner.hidden = true;
      banner.classList.remove("play");
    }
  };
}
