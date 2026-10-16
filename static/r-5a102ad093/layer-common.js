// Shared helpers for the live layers (layer-*.js). Pure functions, no state.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/+esm';

// Seeded PRNG (mulberry32): ?gate&seed=N makes a layer's random stream repeatable for the gates.
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedFrom(params, salt) {
  const s = params.get('seed');
  return (s !== null ? Number(s) : Math.floor(Math.random() * 2 ** 31)) + salt;
}

// Exponential waiting time of a Poisson process with `rate` per second.
export const expWait = (rand, rate) => -Math.log(1 - rand()) / rate;

// The live layers' highlights (panel 013, action 6). The baked textures already went through Blender's AgX
// view (layouts' VIEW), so renderer.toneMapping stays off: mapping them again would flatten the room. A layer
// that adds light instead ends its fragment shader with shoulder(): identity up to the knee, then an
// exponential roll-off towards 1, desaturating towards white past it as AgX does with a hot source. An additive
// shader cannot see what it lands on, so the layers blend with `screen` (d + s(1 - d)): on the dark canal that
// is the old additive blend; on a lit pane or lantern glass the sum rolls off below 1 instead of clipping.
export const SHOULDER = /* glsl */`
  vec3 shoulder(vec3 c) {
    const float K = 0.6;
    float m = max(max(c.r, c.g), c.b);
    if (m <= K) return c;
    float t = K + (1.0 - K) * (1.0 - exp(-(m - K) / (1.0 - K)));
    return mix(c * (t / m), vec3(t), 0.6 * smoothstep(K, 4.0, m));
  }`;
export const SCREEN = { transparent: true, depthWrite: false, blending: THREE.CustomBlending,
  blendSrc: THREE.OneMinusDstColorFactor, blendDst: THREE.OneFactor };

// Is any part of `object` in the camera's view? (bounding box vs frustum)
const _frustum = new THREE.Frustum();
const _m = new THREE.Matrix4();
const _box = new THREE.Box3();
export function inView(camera, object) {
  camera.updateMatrixWorld();
  _m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  _frustum.setFromProjectionMatrix(_m);
  return _frustum.intersectsBox(_box.setFromObject(object));
}

// Layer visuals are never what a click is aimed at.
export const noPick = (o) => { o.raycast = () => {}; return o; };

export const easeInOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

// Move the triangles of `mesh` that `inside(a, b, c)` selects (node-local vertices) into a new
// child mesh with the same material: the part keeps its baked texels and can be animated.
// The part's origin is `pivot` (node-local); returns the new mesh, or null if nothing matched.
export function splitPart(mesh, inside, pivot, name) {
  const g = mesh.geometry;
  const pos = g.attributes.position, uv = g.attributes.uv;
  const idx = g.index ? g.index.array : Array.from({ length: pos.count }, (_, i) => i);
  const keep = [], take = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < idx.length; i += 3) {
    a.fromBufferAttribute(pos, idx[i]); b.fromBufferAttribute(pos, idx[i + 1]); c.fromBufferAttribute(pos, idx[i + 2]);
    (inside(a, b, c) ? take : keep).push(idx[i], idx[i + 1], idx[i + 2]);
  }
  if (!take.length) return null;
  g.setIndex(keep);
  const p = new Float32Array(take.length * 3), t = new Float32Array(take.length * 2);
  take.forEach((v, k) => {
    p[3 * k] = pos.getX(v) - pivot.x; p[3 * k + 1] = pos.getY(v) - pivot.y; p[3 * k + 2] = pos.getZ(v) - pivot.z;
    if (uv) { t[2 * k] = uv.getX(v); t[2 * k + 1] = uv.getY(v); }
  });
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(p, 3));
  if (uv) pg.setAttribute('uv', new THREE.BufferAttribute(t, 2));
  const part = new THREE.Mesh(pg, mesh.material);
  part.name = name;
  part.position.copy(pivot);
  mesh.add(part);
  return part;
}
