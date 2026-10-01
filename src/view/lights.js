import * as THREE from "three";

// Fog, ground, and face hexes are the DUN-10 rows. Instance meshes tint these;
// they do not replace them.
export const DUNGEON_THEMES = [
  {
    id: 0,
    name: "Moss",
    fog: 0xc5d4a4,
    density: 0.04,
    ground: 0x3d5a30,
    floor: [0x3c6e2e, 0x4f8c38, 0x2c6b2a],
    wall: [0x4c545e, 0x5e6771, 0x3e4650],
    rock: [0x4c545e, 0x5e6771, 0x3e4650],
    root: [0x3a2416, 0x5a3a24, 0x6b4428],
    accent: 0
  },
  {
    id: 1,
    name: "Root",
    fog: 0xc4b89a,
    density: 0.045,
    ground: 0x3a2a22,
    floor: [0x3a2416, 0x5a3a24, 0x6b4428],
    wall: [0x2f363e, 0x3a2416],
    rock: [0x2f363e, 0x3a2416],
    root: [0x3a2416, 0x5a3a24, 0x6b4428],
    accent: 0
  },
  {
    id: 2,
    name: "Slate",
    fog: 0xb7c0b0,
    density: 0.042,
    ground: 0x2f363e,
    floor: [0x2f363e, 0x4c545e, 0x6e7882],
    wall: [0x1c2228, 0x3e4650],
    rock: [0x2f363e, 0x4c545e, 0x6e7882],
    root: [0x1c2228, 0x3e4650, 0x3a2416],
    accent: 0
  },
  {
    id: 3,
    name: "Ember",
    fog: 0xd5c4a8,
    density: 0.04,
    ground: 0x4a3024,
    floor: [0x3e4650, 0x4a3024, 0x2f363e],
    wall: [0x3a2416, 0x4c545e],
    rock: [0x3e4650, 0x4a3024, 0x2f363e],
    root: [0x3a2416, 0x4a3024, 0x4c545e],
    accent: 0xff8a2a
  }
];

export function dungeonTheme(themeId) {
  const n = Number(themeId);
  const id = Number.isFinite(n) ? ((Math.floor(n) % 4) + 4) % 4 : 0;
  return DUNGEON_THEMES[id];
}

function dropShadowMap(sun) {
  if (sun.shadow.map) {
    sun.shadow.map.dispose();
    sun.shadow.map = null;
  }
}

function setShadow(sun, size, extent) {
  sun.shadow.mapSize.set(size, size);
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 90;
  sun.shadow.camera.left = -extent;
  sun.shadow.camera.right = extent;
  sun.shadow.camera.top = extent;
  sun.shadow.camera.bottom = -extent;
  sun.shadow.bias = -0.00018;
  sun.shadow.normalBias = 0.035;
  sun.shadow.camera.updateProjectionMatrix();
  dropShadowMap(sun);
}

function createLights(scene, rt) {
  const hemi = new THREE.HemisphereLight(0xc5e4ff, 0x4d7a38, 0.72);
  scene.add(hemi);
  const ambient = new THREE.AmbientLight(0xfff3df, 0.28);
  scene.add(ambient);
  const sunDir = new THREE.Vector3(-0.48, 0.86, 0.28).normalize();
  const sun = new THREE.DirectionalLight(0xffd7a4, 2.35);
  sun.castShadow = true;
  setShadow(sun, 2048, 34);
  scene.add(sun);
  scene.add(sun.target);
  rt._lights = { hemi, ambient, sun, sunDir };
  return rt._lights;
}

export function applyTownLight(scene, rt) {
  const lights = rt._lights || createLights(scene, rt);
  scene.background = new THREE.Color(0xd5e4b8);
  scene.fog = new THREE.FogExp2(0xd5e4b8, 0.0105);
  lights.hemi.color.setHex(0xc5e4ff);
  lights.hemi.groundColor.setHex(0x4d7a38);
  lights.hemi.intensity = 0.72;
  lights.ambient.color.setHex(0xfff3df);
  lights.ambient.intensity = 0.28;
  lights.sun.color.setHex(0xffd7a4);
  setShadow(lights.sun, 2048, 34);
  resetTownTime(scene, rt);

  if (lights.sky) {
    rt.updateSun = lights.updateSun;
    return;
  }

  const { sun, sunDir } = lights;

  const skyGeo = new THREE.SphereGeometry(460, 18, 10);
  const skyPos = skyGeo.attributes.position;
  const skyCols = new Float32Array(skyPos.count * 3);
  const skyTop = new THREE.Color(0x7eb6ef);
  const skyMid = new THREE.Color(0xc5def5);
  const skyHor = new THREE.Color(0xd5e4b8);
  const skyTmp = new THREE.Color();
  for (let i = 0; i < skyPos.count; i++) {
    const t = skyPos.getY(i) / 460;
    if (t > 0.08) skyTmp.copy(skyMid).lerp(skyTop, Math.min(1, (t - 0.08) / 0.7));
    else skyTmp.copy(skyHor).lerp(skyMid, Math.max(0, (t + 0.25) / 0.33));
    skyCols[i * 3] = skyTmp.r;
    skyCols[i * 3 + 1] = skyTmp.g;
    skyCols[i * 3 + 2] = skyTmp.b;
  }
  skyGeo.setAttribute("color", new THREE.BufferAttribute(skyCols, 3));
  const sky = new THREE.Mesh(skyGeo, new THREE.MeshLambertMaterial({
    vertexColors: true,
    side: THREE.BackSide,
    fog: false,
    depthWrite: false,
    flatShading: true,
    emissive: 0xb7c8d4,
    emissiveIntensity: 0.55
  }));
  sky.frustumCulled = false;
  scene.add(sky);
  const sunMesh = new THREE.Mesh(
    new THREE.IcosahedronGeometry(16, 0),
    new THREE.MeshLambertMaterial({
      color: 0xffe2a8,
      emissive: 0xffd27a,
      emissiveIntensity: 0.9,
      fog: false,
      flatShading: true
    })
  );
  sunMesh.position.copy(sunDir).multiplyScalar(280);
  scene.add(sunMesh);

  function updateSun() {
    sun.position.copy(rt.player.position).addScaledVector(sunDir, 40);
    sun.target.position.copy(rt.player.position);
    sun.target.updateMatrixWorld();
  }
  lights.sky = sky;
  lights.sunMesh = sunMesh;
  lights.updateSun = updateSun;
  rt.updateSun = updateSun;
}

export function applyDungeonLight(scene, rt, themeId) {
  const theme = dungeonTheme(themeId);
  const lights = rt._lights || createLights(scene, rt);
  scene.background = new THREE.Color(theme.fog);
  scene.fog = new THREE.FogExp2(theme.fog, theme.density);
  lights.hemi.color.setHex(0xc5e4ff);
  lights.hemi.groundColor.setHex(theme.ground);
  lights.sun.color.setHex(0xffd7a4);
  setShadow(lights.sun, 1024, 18);
  resetTownTime(scene, rt);
}

// ---------- Town day and night ----------
// phase 0..1 is one town day: 0 midnight, 0.5 noon. Across the midday plateau
// (0.32–0.68) every value equals the locked ART-01 town constants exactly.
const DAY = {
  bg: 0xd5e4b8, fog: 0.0105, sky: 0xc5e4ff, ground: 0x4d7a38, hemi: 0.72,
  amb: 0xfff3df, ambI: 0.28, sun: 0xffd7a4, sunI: 2.35, skyMul: 0xffffff, skyEm: 0xb7c8d4, skyEmI: 0.55,
  dir: [-0.48, 0.86, 0.28], night: 0
};
const DUSK = {
  bg: 0xd9a988, fog: 0.012, sky: 0xf0b890, ground: 0x4a5a30, hemi: 0.6,
  amb: 0xffd8b0, ambI: 0.26, sun: 0xff9a5a, sunI: 1.5, skyMul: 0xffc09a, skyEm: 0xd89a7a, skyEmI: 0.45,
  dir: [-0.85, 0.32, 0.3], night: 0.55
};
const NIGHT = {
  bg: 0x1e2a40, fog: 0.015, sky: 0x41528a, ground: 0x1c2a1c, hemi: 0.5,
  amb: 0x8a9ac8, ambI: 0.24, sun: 0xa8b8e8, sunI: 0.6, skyMul: 0x2c3a5c, skyEm: 0x1c2848, skyEmI: 0.5,
  dir: [0.3, 0.8, -0.4], night: 1
};
const DAWN = {
  bg: 0xd6c4b4, fog: 0.012, sky: 0xd8c8e0, ground: 0x4a6a38, hemi: 0.6,
  amb: 0xfff0e0, ambI: 0.26, sun: 0xffc090, sunI: 1.5, skyMul: 0xffe0d0, skyEm: 0xc8b8c0, skyEmI: 0.5,
  dir: [0.85, 0.32, 0.3], night: 0.45
};
const DAY_KEYS = [[0, NIGHT], [0.2, NIGHT], [0.26, DAWN], [0.32, DAY], [0.68, DAY], [0.74, DUSK], [0.8, NIGHT], [1, NIGHT]];

const _ca = new THREE.Color();
const _cb = new THREE.Color();
function mixHex(target, a, b, t) {
  if (t <= 0) return target.setHex(a);
  if (t >= 1) return target.setHex(b);
  _ca.setHex(a);
  _cb.setHex(b);
  return target.copy(_ca).lerp(_cb, t);
}
function mix(a, b, t) {
  return t <= 0 ? a : t >= 1 ? b : a + (b - a) * t;
}

export function townDayKeys(phase) {
  const p = ((phase % 1) + 1) % 1;
  for (let i = 0; i < DAY_KEYS.length - 1; i++) {
    const [t0, k0] = DAY_KEYS[i];
    const [t1, k1] = DAY_KEYS[i + 1];
    if (p >= t0 && p <= t1) {
      const u = t1 > t0 ? (p - t0) / (t1 - t0) : 0;
      // Smooth the blend so the light eases in and out of each key.
      return { a: k0, b: k1, t: u * u * (3 - 2 * u) };
    }
  }
  return { a: DAY, b: DAY, t: 0 };
}

export function nightFactor(phase) {
  const { a, b, t } = townDayKeys(phase);
  return mix(a.night, b.night, t);
}

// Apply the town light for `phase`. Glow materials (windows, lanterns) brighten at night.
export function applyTownTime(scene, rt, phase, glowMats) {
  const lights = rt._lights;
  if (!lights) return 0;
  const { a, b, t } = townDayKeys(phase);
  if (scene.background && scene.background.isColor) mixHex(scene.background, a.bg, b.bg, t);
  if (scene.fog && scene.fog.isFogExp2) {
    mixHex(scene.fog.color, a.bg, b.bg, t);
    scene.fog.density = mix(a.fog, b.fog, t);
  }
  mixHex(lights.hemi.color, a.sky, b.sky, t);
  mixHex(lights.hemi.groundColor, a.ground, b.ground, t);
  lights.hemi.intensity = mix(a.hemi, b.hemi, t);
  mixHex(lights.ambient.color, a.amb, b.amb, t);
  lights.ambient.intensity = mix(a.ambI, b.ambI, t);
  mixHex(lights.sun.color, a.sun, b.sun, t);
  lights.sun.intensity = mix(a.sunI, b.sunI, t);
  if (t <= 0 || t >= 1) {
    const k = t >= 1 ? b : a;
    lights.sunDir.set(k.dir[0], k.dir[1], k.dir[2]).normalize();
  } else {
    lights.sunDir.set(mix(a.dir[0], b.dir[0], t), mix(a.dir[1], b.dir[1], t), mix(a.dir[2], b.dir[2], t)).normalize();
  }
  if (lights.sky) {
    mixHex(lights.sky.material.color, a.skyMul, b.skyMul, t);
    mixHex(lights.sky.material.emissive, a.skyEm, b.skyEm, t);
    lights.sky.material.emissiveIntensity = mix(a.skyEmI, b.skyEmI, t);
  }
  const night = mix(a.night, b.night, t);
  if (lights.sunMesh) {
    lights.sunMesh.position.copy(lights.sunDir).multiplyScalar(280);
    mixHex(lights.sunMesh.material.emissive, 0xffd27a, 0xd8e4ff, night);
    mixHex(lights.sunMesh.material.color, 0xffe2a8, 0xe8eeff, night);
    lights.sunMesh.scale.setScalar(1 - night * 0.45);
  }
  if (glowMats) {
    for (const m of glowMats.windows) m.emissiveIntensity = 0.32 + night * 0.95;
    if (glowMats.lamp) glowMats.lamp.emissiveIntensity = 0.18 + night * 1.25;
  }
  return night;
}

// Leaving a day/night town for the dungeon or a test: put the sun back to the locked values.
export function resetTownTime(scene, rt) {
  const lights = rt._lights;
  if (!lights) return;
  lights.sun.intensity = DAY.sunI;
  lights.hemi.intensity = DAY.hemi;
  lights.ambient.color.setHex(DAY.amb);
  lights.ambient.intensity = DAY.ambI;
  lights.sunDir.set(DAY.dir[0], DAY.dir[1], DAY.dir[2]).normalize();
  if (lights.sky) {
    lights.sky.material.color.setHex(DAY.skyMul);
    lights.sky.material.emissive.setHex(DAY.skyEm);
    lights.sky.material.emissiveIntensity = DAY.skyEmI;
  }
  if (lights.sunMesh) {
    lights.sunMesh.position.copy(lights.sunDir).multiplyScalar(280);
    lights.sunMesh.material.emissive.setHex(0xffd27a);
    lights.sunMesh.material.color.setHex(0xffe2a8);
    lights.sunMesh.scale.setScalar(1);
  }
}
