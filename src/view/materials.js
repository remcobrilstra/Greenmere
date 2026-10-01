import * as THREE from "three";

export function paintFaces(geo, hexes, rand) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const p = g.attributes.position;
  const cols = new Float32Array(p.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i += 3) {
    c.set(hexes[Math.floor(rand() * hexes.length)]);
    for (let k = 0; k < 3; k++) {
      cols[(i + k) * 3] = c.r;
      cols[(i + k) * 3 + 1] = c.g;
      cols[(i + k) * 3 + 2] = c.b;
    }
  }
  g.setAttribute("color", new THREE.BufferAttribute(cols, 3));
  g.computeVertexNormals();
  return g;
}

// Dungeon painter. Takes its own rng so it never advances the town generator or global Math.random.
export function paintFacesWith(geo, hexes, rand) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const p = g.attributes.position;
  const cols = new Float32Array(p.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i += 3) {
    c.set(hexes[Math.floor(rand() * hexes.length)]);
    for (let k = 0; k < 3; k++) {
      cols[(i + k) * 3] = c.r;
      cols[(i + k) * 3 + 1] = c.g;
      cols[(i + k) * 3 + 2] = c.b;
    }
  }
  g.setAttribute("color", new THREE.BufferAttribute(cols, 3));
  g.computeVertexNormals();
  return g;
}

export function mergeParts(parts) {
  const geos = parts.map((g) => {
    const ng = g.index ? g.toNonIndexed() : g;
    if (!ng.attributes.normal) ng.computeVertexNormals();
    return ng;
  });
  let count = 0;
  for (const g of geos) count += g.attributes.position.count;
  const pos = new Float32Array(count * 3);
  const nrm = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  let o = 0;
  for (const g of geos) {
    const p = g.attributes.position;
    const n = g.attributes.normal;
    const color = g.attributes.color;
    for (let i = 0; i < p.count; i++) {
      const k = (o + i) * 3;
      pos[k] = p.getX(i);
      pos[k + 1] = p.getY(i);
      pos[k + 2] = p.getZ(i);
      nrm[k] = n.getX(i);
      nrm[k + 1] = n.getY(i);
      nrm[k + 2] = n.getZ(i);
      if (color) {
        col[k] = color.getX(i);
        col[k + 1] = color.getY(i);
        col[k + 2] = color.getZ(i);
      } else {
        col[k] = col[k + 1] = col[k + 2] = 1;
      }
    }
    o += p.count;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return geo;
}

export const lambert = (extra) => new THREE.MeshLambertMaterial(Object.assign({
  vertexColors: true,
  flatShading: true
}, extra));

export function makeMat(color, opts) {
  return new THREE.MeshStandardMaterial(Object.assign({
    color,
    flatShading: true,
    roughness: 0.78,
    metalness: 0.02
  }, opts));
}
