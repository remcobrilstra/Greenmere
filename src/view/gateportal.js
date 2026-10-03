// The Delve Gate's portal: a swirling veil that fills the stone opening, motes
// spiralling into it, and a soft pulsing light on the pillars and road.
// Built in the gate's local frame (opening centred on x = 0, standing on y = 0,
// facing ±z). play/town.js calls tick(time) each town frame.

import * as THREE from "three";

const VEIL_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// Twisting the plane's coordinates around the centre (more twist near the
// middle) and reading value noise through them gives spiral arms without a
// seam where atan wraps.
const VEIL_FRAG = /* glsl */ `
uniform float uTime;
uniform vec2 uSize;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
vec2 rot(vec2 p, float a) {
  float c = cos(a);
  float s = sin(a);
  return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
}
void main() {
  vec2 p = (vUv - 0.5) * uSize;
  float r = length(p / (0.5 * uSize));
  float twist = 2.4 / (r + 0.3) - uTime * 0.9;
  vec2 q = rot(p, twist);
  float n1 = noise(q * 1.6 + vec2(0.0, uTime * 0.15));
  float n2 = noise(rot(p, twist * 0.6 + 1.7) * 3.1 - vec2(uTime * 0.2, 0.0));
  float arms = 0.5 + 0.5 * sin(atan(q.y, q.x) * 3.0 + r * 2.0);
  float swirl = smoothstep(0.5, 1.05, arms * 0.6 + n1 * 0.5 + n2 * 0.2);
  vec3 deep = vec3(0.04, 0.02, 0.10);
  vec3 violet = vec3(0.36, 0.16, 0.70);
  vec3 teal = vec3(0.10, 0.62, 0.55);
  vec3 gold = vec3(0.95, 0.75, 0.38);
  vec3 col = mix(deep, mix(violet, teal, n2), swirl);
  float core = exp(-r * r * 16.0);
  col += gold * core * (0.6 + 0.2 * sin(uTime * 2.6));
  col += teal * 0.18 * smoothstep(0.55, 1.0, r) * (0.5 + 0.5 * sin(uTime * 1.3 + r * 6.0));
  vec2 e = min(vUv, 1.0 - vUv);
  float edge = smoothstep(0.0, 0.2, min(e.x * uSize.x, e.y * uSize.y));
  float alpha = edge * clamp(0.82 + 0.18 * swirl + core, 0.0, 1.0);
  gl_FragColor = vec4(col * (0.7 + 0.8 * swirl), alpha);
}
`;

// Each mote runs its own loop: born at the rim, spiralling in to the core.
const MOTE_VERT = /* glsl */ `
attribute float aSeed;
uniform float uTime;
uniform vec2 uSize;
varying float vLife;
void main() {
  float life = fract(aSeed * 7.31 + uTime * (0.16 + 0.08 * fract(aSeed * 3.7)));
  float radius = 1.0 - life;
  float ang = aSeed * 6.2832 + life * 7.0;
  float side = fract(aSeed * 13.1) < 0.5 ? -1.0 : 1.0;
  vec3 pos = vec3(cos(ang) * radius * 0.5 * uSize.x * 0.9, uSize.y * 0.5 + sin(ang) * radius * 0.5 * uSize.y * 0.9, side * (0.12 + radius * 0.5));
  vLife = life;
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_PointSize = (2.5 + 3.5 * radius) * (32.0 / max(1.0, -mv.z));
  gl_Position = projectionMatrix * mv;
}
`;

const MOTE_FRAG = /* glsl */ `
varying float vLife;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  float a = smoothstep(0.5, 0.0, d) * smoothstep(0.0, 0.15, vLife) * smoothstep(1.0, 0.8, vLife);
  vec3 col = mix(vec3(0.35, 0.75, 0.68), vec3(0.85, 0.7, 0.4), vLife) * 0.8;
  gl_FragColor = vec4(col, a);
}
`;

export function buildGatePortal(openingW, openingH) {
  const group = new THREE.Group();
  group.name = "gate portal";
  const uniforms = {
    uTime: { value: 0 },
    uSize: { value: new THREE.Vector2(openingW, openingH) }
  };

  const veil = new THREE.Mesh(
    new THREE.PlaneGeometry(openingW, openingH),
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: VEIL_VERT,
      fragmentShader: VEIL_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide
    })
  );
  veil.name = "portal veil";
  // Town style rule: every material is flagged flat (the shaders ignore it).
  veil.material.flatShading = true;
  veil.position.y = openingH / 2;
  veil.renderOrder = 2;
  group.add(veil);

  const COUNT = 48;
  const seeds = new Float32Array(COUNT);
  const pos = new Float32Array(COUNT * 3);
  for (let i = 0; i < COUNT; i++) seeds[i] = (i + 0.5) / COUNT + Math.sin(i * 12.9898) * 0.003;
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  moteGeo.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
  // Positions are computed in the shader; give the culler the real extent.
  moteGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, openingH / 2, 0), Math.max(openingW, openingH));
  const motes = new THREE.Points(moteGeo, new THREE.ShaderMaterial({
    uniforms,
    vertexShader: MOTE_VERT,
    fragmentShader: MOTE_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  }));
  motes.name = "portal motes";
  motes.material.flatShading = true;
  motes.renderOrder = 3;
  group.add(motes);

  const light = new THREE.PointLight(0x7fe0cc, 6, 9, 2);
  light.position.set(0, openingH * 0.5, 0.6);
  group.add(light);

  function tick(time) {
    uniforms.uTime.value = time;
    light.intensity = 5 + 1.5 * Math.sin(time * 2.6) + 0.6 * Math.sin(time * 7.1);
  }

  return { group, veil, motes, light, tick };
}
