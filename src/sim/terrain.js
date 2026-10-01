export const WORLD = 400;
export const HALF = WORLD / 2;

export function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function terrainHeight(x, z) {
  let h =
    Math.sin(x * 0.016) * Math.cos(z * 0.0145) * 5.2 +
    Math.sin(x * 0.043 + 1.3) * Math.sin(z * 0.039 + 0.4) * 2.15 +
    Math.cos(x * 0.011 - z * 0.013) * 2.7 +
    Math.sin(x * 0.105 + Math.cos(z * 0.08)) * 0.62;
  const dist = Math.hypot(x, z);
  // The town core is flat to radius 36 so buildings, roads, and floors sit at y = 0.
  const meadow = smoothstep(36, 64, dist);
  const ripple = Math.sin(x * 0.11) * Math.cos(z * 0.1) * 0.16 * smoothstep(34, 46, dist);
  h = h * meadow + (1 - meadow) * ripple;
  const edge = Math.max(Math.abs(x), Math.abs(z)) / HALF;
  if (edge > 0.84) {
    const t = (edge - 0.84) / 0.16;
    h += t * t * 16;
  }
  return h;
}
