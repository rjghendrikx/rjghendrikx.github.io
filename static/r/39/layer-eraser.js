import { easeInOut, noPick, splitPart } from './layer-common.js';

const IN_BEAM = 0.7;
const ANGLE = 45;
const MOVE_S = 1.2;
const LIFT = 0.02;
const BEAM_W = 0.0015;
const GLARE = 0.0025;
const PICK_PAD = 0.0006;

export default function mount(live) {
  const { THREE, byName } = live;
  const node = byName('optics');
  const d = node?.userData;
  if (!d?.optics_eraser || !d?.optics_physics) return null;
  const [lambda, slitD, slitA, L] = d.optics_physics;
  const [R, H, , rz] = d.optics_eraser_dims;
  const [ex, , ez] = d.optics_eraser;
  const [bx, by, bz] = d.optics_beam;
  const sx = d.optics_screen[0];

  const foot = by - H + 0.0002;
  const part = splitPart(node, (...vs) => vs.every((v) => Math.abs(v.x - ex) < R + 0.006 && Math.abs(v.z - ez) < R + 0.006
    && v.y > foot && v.y < by + R + 0.008), new THREE.Vector3(ex, by, ez), 'optics_eraser');
  if (!part) return null;
  const ring = splitPart(part, (...vs) => vs.every((v) => Math.hypot(v.x, v.y) < R - 0.0013), new THREE.Vector3(), 'optics_eraser_ring');
  const post = splitPart(part, (...vs) => vs.every((v) => v.y < -R - 0.00005), new THREE.Vector3(), 'optics_eraser_post');
  const Q = (axis, deg) => new THREE.Quaternion().setFromAxisAngle(axis, THREE.MathUtils.degToRad(deg));
  const still = new THREE.Quaternion();
  const rest = part.position.clone();
  const inBeam = { pos: new THREE.Vector3(bx + (sx - bx) * IN_BEAM, by, bz), q: Q(new THREE.Vector3(0, 1, 0), -90),
    ring: Q(new THREE.Vector3(0, 0, 1), ANGLE - rz) };

  const [W, Hc] = d.optics_screen_size;
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uErase: { value: 0 }, uSize: { value: new THREE.Vector2(W, Hc) },
      uKa: { value: Math.PI * slitA / (lambda * L) }, uKd: { value: 2 * Math.PI * slitD / (lambda * L) } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uErase, uKa, uKd; uniform vec2 uSize; varying vec2 vUv;
      float sinc(float x) { return abs(x) < 1e-4 ? 1.0 : sin(x) / x; }
      void main() {
        float y = (vUv.x - 0.5) * uSize.x, z = (vUv.y - 0.5) * uSize.y;
        float fy = fwidth(y);
        float s = sinc(uKa * y); float env = s * s;                     // sinc^2 envelope
        float fr = cos(uKd * y) * sinc(uKd * fy * 0.5);                 // cos, box-filtered over the pixel
        float I = mix(env, 0.5 * env * (1.0 + fr), uErase);             // which-path -> erased (I0/2)(1+cos)
        float beam = exp(-2.0 * z * z / ${(BEAM_W * BEAM_W).toExponential(4)});
        float glare = exp(-length(vec2(y * 0.35, z)) / ${GLARE.toFixed(5)}) * 0.10;
        float e = I * beam * 2.2 + glare * (1.0 - 0.5 * uErase);
        // a laser on a lit white card reads as saturated red: it dominates the card's own colour
        vec3 red = mix(vec3(0.92, 0.06, 0.03), vec3(1.0, 0.62, 0.5), smoothstep(1.2, 2.2, e));
        gl_FragColor = vec4(red, clamp(e, 0.0, 1.0));
      }`,
  });
  const screen = noPick(new THREE.Mesh(new THREE.PlaneGeometry(W, Hc), mat));
  screen.name = 'optics_pattern';
  screen.position.fromArray(d.optics_screen).add(new THREE.Vector3(-0.0004, 0, 0));
  screen.rotation.y = -Math.PI / 2;
  node.add(screen);
  screen.visible = !live.gate;

  let want = 0, p = 0;
  function pose() {
    const k = easeInOut(p);
    part.position.lerpVectors(rest, inBeam.pos, k);
    part.position.y += Math.sin(Math.PI * k) * LIFT;
    part.quaternion.slerpQuaternions(still, inBeam.q, k);
    ring?.quaternion.slerpQuaternions(still, inBeam.ring, k);
    post?.quaternion.copy(part.quaternion).invert();
    mat.uniforms.uErase.value = THREE.MathUtils.smoothstep(p, 0.8, 1.0);
  }
  function toggle(instant) {
    want = 1 - want;
    if (instant || live.reduceMotion.matches) { p = want; pose(); }
    live.render();
  }
  const bb = new THREE.Box3(), v = new THREE.Vector3(), P = part.geometry.attributes.position;
  for (const i of part.geometry.index.array) bb.expandByPoint(v.fromBufferAttribute(P, i));
  if (ring) { ring.geometry.computeBoundingBox(); bb.union(ring.geometry.boundingBox); }
  const mountBox = bb.clone();
  bb.expandByScalar(PICK_PAD);
  const hit = new THREE.Mesh(new THREE.BoxGeometry(...bb.getSize(new THREE.Vector3()).toArray()), new THREE.MeshBasicMaterial({ visible: false }));
  bb.getCenter(hit.position);
  part.add(hit);
  live.picks.push({ object: part, accept: () => true, onPick: () => toggle(false) });

  return {
    name: 'eraser',
    update(dt) {
      if (p === want) return false;
      p = want > p ? Math.min(want, p + dt / MOVE_S) : Math.max(want, p - dt / MOVE_S);
      pose();
      return true;
    },
    api: {
      show() { screen.visible = true; live.render(); },
    toggle: (instant = true) => { screen.visible = true; toggle(instant); return want; },
      hold(at) { screen.visible = true; want = p = at; pose(); live.render(); },
      info: () => ({ inBeam: want === 1, progress: p, erase: mat.uniforms.uErase.value, fringeSpacingMm: lambda * L / slitD * 1e3 }),
      boxes() {
        const r = live.renderer.domElement.getBoundingClientRect();
        const px = (o, local = null) => {
          o.updateMatrixWorld();
          const b = local ? local.clone().applyMatrix4(o.matrixWorld) : new THREE.Box3().setFromObject(o), out = [Infinity, Infinity, -Infinity, -Infinity];
          for (let i = 0; i < 8; i++) {
            const v = new THREE.Vector3(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).project(live.camera);
            const x = (v.x + 1) / 2 * r.width, y = (1 - v.y) / 2 * r.height;
            out[0] = Math.min(out[0], x); out[1] = Math.min(out[1], y); out[2] = Math.max(out[2], x); out[3] = Math.max(out[3], y);
          }
          return out.map(Math.round);
        };
        return { screen: px(screen), eraser: px(part), pick: px(hit), mount: px(part, mountBox) };
      },
    },
  };
}
