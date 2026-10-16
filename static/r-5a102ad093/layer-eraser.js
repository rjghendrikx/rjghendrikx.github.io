// Live layer 4: the quantum eraser (its classical polarization analogue) on the optics board.
//
// notes/physics.md, "Optical table": HeNe lambda = 632.8 nm, slit spacing d = 0.100 mm, width
// a = 0.020 mm, slit to screen L = 0.200 m (optics.py constants via the node extras).
//   which-path (orthogonal polarizers on the slits): I = I0 sinc^2(pi a y / lambda L), no fringes
//   eraser at +45 deg before the screen:              I = (I0/2) sinc^2 (1 + cos(2 pi d y / lambda L))
// so fringes 1.27 mm apart under an envelope with zeros at +-6.33 mm, every 5th fringe missing (d/a = 5).
// Click or tap the loose polarizer: it stands up into the beam at +45 deg and the fringes appear;
// again, and it goes back to the board. The pattern is box-filtered over each pixel, so fringes
// finer than a pixel show as their mean (half the which-path brightness) instead of aliasing.
//
// Hooks (lib/live.py): optics extras optics_screen(_size), optics_beam, optics_eraser(_dims),
// optics_physics. The polarizer's baked triangles are split out of the optics mesh and moved.
import { easeInOut, noPick, splitPart } from './layer-common.js';

const IN_BEAM = 0.6;            // where the eraser stands: fraction of L from the slits
const ANGLE = 45;               // deg, analyser axis
const MOVE_S = 1.2;             // s, lift, turn and set down
const BEAM_W = 0.0015;          // m, 1/e^2 radius at the card: a ~3 mm expanded/pointer-class beam (unmeasured)
const GLARE = 0.0025;           // m, the card's diffuse glare around the bright line (by eye)

function boardPatch(THREE, node, ex, ey, ez, r, dx) {
  const g = node.geometry, pos = g.attributes.position, uv = g.attributes.uv, idx = g.index.array;
  const P = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const sx = ex + dx, sz = ez;
  for (let i = 0; i < idx.length; i += 3) {
    for (let k = 0; k < 3; k++) P[k].fromBufferAttribute(pos, idx[i + k]);
    if (P.some((v) => Math.abs(v.y - ey) > 1e-4)) continue;           // board top only
    const [a, b, c] = P;
    const det = (b.x - a.x) * (c.z - a.z) - (c.x - a.x) * (b.z - a.z);
    if (Math.abs(det) < 1e-9) continue;
    const bary = (x, z) => {
      const u = ((x - a.x) * (c.z - a.z) - (c.x - a.x) * (z - a.z)) / det;
      const v = ((b.x - a.x) * (z - a.z) - (x - a.x) * (b.z - a.z)) / det;
      return [1 - u - v, u, v];
    };
    const w = bary(sx, sz);
    if (w.some((t) => t < -1e-6)) continue;                         // the triangle under the sample point
    const uvAt = (x, z) => {
      const q = bary(x, z);
      return [0, 1].map((j) => q[0] * uv.getComponent(idx[i], j) + q[1] * uv.getComponent(idx[i + 1], j) + q[2] * uv.getComponent(idx[i + 2], j));
    };
    const geo = new THREE.CircleGeometry(r, 40).rotateX(-Math.PI / 2);
    const gp = geo.attributes.position, gu = geo.attributes.uv;
    for (let k = 0; k < gp.count; k++) gu.setXY(k, ...uvAt(gp.getX(k) + sx, gp.getZ(k) + sz));
    const m = new THREE.Mesh(geo, node.material);
    m.raycast = () => {};
    m.position.set(ex, ey + 0.0002, ez);
    m.visible = false;
    node.add(m);
    return m;
  }
  return null;
}

export default function mount(live) {
  const { THREE, byName } = live;
  const node = byName('optics');
  const d = node?.userData;
  if (!d?.optics_eraser || !d?.optics_physics) return null;
  const [lambda, slitD, slitA, L] = d.optics_physics;
  const [R, H, , rz] = d.optics_eraser_dims;
  const [ex, ey, ez] = d.optics_eraser;

  // the polarizer: every triangle inside its mount's cylinder (its bottom cap only within R)
  const inR = (v, r) => Math.hypot(v.x - ex, v.z - ez) < r;
  const part = splitPart(node, (a, b, c) => {
    const vs = [a, b, c];
    if (!vs.every((v) => inR(v, R + 0.016) && v.y < ey + H + 0.002 && v.y > ey - 0.0005)) return false;
    return (a.y + b.y + c.y) / 3 > ey + 0.0003 || vs.every((v) => inR(v, R + 0.0005));
  }, new THREE.Vector3(ex, ey + H / 2, ez), 'optics_eraser');
  if (!part) return null;
  const rest = { pos: part.position.clone(), q: new THREE.Quaternion() };

  // Where it lay, the bake has a black footprint (that texel was never lit). Cover it while the
  // polarizer is away with a disc of board texels from 100 mm along -X (four hole pitches, so the
  // M6 grid lines up; clear of the footprint and its contact shadow): the board top's UVs are affine
  // in position, so one triangle extends to all.
  const patch = boardPatch(THREE, node, ex, ey, ez, R + 0.014, -0.1);
  const [bx, by, bz] = d.optics_beam;
  const sx = d.optics_screen[0];
  const Q = (axis, deg) => new THREE.Quaternion().setFromAxisAngle(axis, THREE.MathUtils.degToRad(deg));
  const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
  // undo its yaw on the board, set the analyser to +45 deg about its own axis, stand it up (axis -> beam)
  const inBeam = { pos: new THREE.Vector3(bx + (sx - bx) * IN_BEAM, by, bz),
    q: Q(Z, -90).multiply(Q(Y, ANGLE)).multiply(Q(Y, -rz)) };

  // the pattern on the card face (normal -X; plane x -> glTF +Z = across the fringes)
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
  screen.visible = !live.gate;     // ?gate: the bake alone until a gate asks for the layer

  let want = 0, p = 0;             // wanted state, animated progress (0 on the board, 1 in the beam)
  function pose() {
    const k = easeInOut(p);
    part.position.lerpVectors(rest.pos, inBeam.pos, k);
    part.position.y += Math.sin(Math.PI * k) * 0.03;                   // lift over the board
    part.quaternion.slerpQuaternions(rest.q, inBeam.q, k);
    mat.uniforms.uErase.value = THREE.MathUtils.smoothstep(p, 0.8, 1.0);   // fringes once it cuts the beam
    if (patch) patch.visible = p > 0;
  }
  function toggle(instant) {
    want = 1 - want;
    if (instant || live.reduceMotion.matches) { p = want; pose(); }
    live.render();
  }
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
      info: () => ({ inBeam: want === 1, progress: p, erase: mat.uniforms.uErase.value, fringeSpacingMm: lambda * L / slitD * 1e3 }),
      // pixel box of the card and the eraser on screen (for the gates' crops)
      boxes() {
        const r = live.renderer.domElement.getBoundingClientRect();
        const px = (o) => {
          o.updateMatrixWorld();
          const b = new THREE.Box3().setFromObject(o), out = [Infinity, Infinity, -Infinity, -Infinity];
          for (let i = 0; i < 8; i++) {
            const v = new THREE.Vector3(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).project(live.camera);
            const x = (v.x + 1) / 2 * r.width, y = (1 - v.y) / 2 * r.height;
            out[0] = Math.min(out[0], x); out[1] = Math.min(out[1], y); out[2] = Math.max(out[2], x); out[3] = Math.max(out[3], y);
          }
          return out.map(Math.round);
        };
        return { screen: px(screen), eraser: px(part) };
      },
    },
  };
}
