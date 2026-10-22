// Live layer 4: the quantum eraser (its classical polarization analogue) on the optics board.
//
// notes/physics.md, "Optical table": HeNe lambda = 632.8 nm, slit spacing d = 0.100 mm, width
// a = 0.020 mm, slit to screen L = 0.200 m (optics.py constants via the node extras).
//   which-path (orthogonal polarizers on the slits): I = I0 sinc^2(pi a y / lambda L), no fringes
//   eraser at +45 deg before the screen:              I = (I0/2) sinc^2 (1 + cos(2 pi d y / lambda L))
// so fringes 1.27 mm apart under an envelope with zeros at +-6.33 mm, every 5th fringe missing (d/a = 5).
// The polarizer stands on its post in a holder beside the card post, facing the room, in the #optics frame (panel 019
// bet C). Click or tap it: it lifts out, turns to face the beam with its analyser ring at +45 deg and drops into the
// empty holder in the beam, and the fringes appear; again, and it goes back to its holder. The pattern is box-filtered over each pixel, so fringes
// finer than a pixel show as their mean (half the which-path brightness) instead of aliasing.
//
// Hooks (lib/live.py): optics extras optics_screen(_size), optics_beam, optics_eraser(_dims),
// optics_physics. The polarizer's baked triangles are split out of the optics mesh and moved.
import { easeInOut, noPick, splitPart } from './layer-common.js';

const IN_BEAM = 0.7;            // where the eraser stands: fraction of L from the slits (optics.py IN_BEAM, the drop-in holder)
const ANGLE = 45;               // deg, analyser axis
const MOVE_S = 1.2;             // s, lift, turn and set down
const LIFT = 0.02;              // m, the post clears its holder on the way (0.035 left the desktop frame at the apex)
const BEAM_W = 0.0015;          // m, 1/e^2 radius at the card: a ~3 mm expanded/pointer-class beam (unmeasured)
const GLARE = 0.0025;           // m, the card's diffuse glare around the bright line (by eye)
const PICK_PAD = 0.0006;        // m round the mount: 8 px at 1440x900, ~4 at 390 wide in the #optics frame (api.boxes(), merge 020)

export default function mount(live) {
  const { THREE, byName } = live;
  const node = byName('optics');
  const d = node?.userData;
  if (!d?.optics_eraser || !d?.optics_physics) return null;
  const [lambda, slitD, slitA, L] = d.optics_physics;
  const [R, H, , rz] = d.optics_eraser_dims;     // mount r, its centre above the holder's top, film r, parked reading
  const [ex, , ez] = d.optics_eraser;             // the parked holder (x, -y in Blender)
  const [bx, by, bz] = d.optics_beam;             // slit plane on the beam axis
  const sx = d.optics_screen[0];

  // the polarizer: the mount and its post, everything above the holder's top near the holder's axis (the post's foot
  // stands 0.4 mm clear of the holder, so the holder and its dark bore stay where they are: no footprint to cover)
  const foot = by - H + 0.0002;
  const part = splitPart(node, (...vs) => vs.every((v) => Math.abs(v.x - ex) < R + 0.006 && Math.abs(v.z - ez) < R + 0.006
    && v.y > foot && v.y < by + R + 0.008), new THREE.Vector3(ex, by, ez), 'optics_eraser');
  if (!part) return null;
  // the rotating ring (film, retainer, hairline, scale) turns in the fixed body: everything inside the ring's radius
  // about the mount's axis, which faces the room while parked (glTF Z)
  const ring = splitPart(part, (...vs) => vs.every((v) => Math.hypot(v.x, v.y) < R - 0.0013), new THREE.Vector3(), 'optics_eraser_ring');
  // panel 020 action 6: the post (everything under the barrel: optics.py stops it 0.15 mm short) only translates, so its
  // bake keeps facing the lamp it was baked under; it turns back against the head's -90 deg about its own axis
  const post = splitPart(part, (...vs) => vs.every((v) => v.y < -R - 0.00005), new THREE.Vector3(), 'optics_eraser_post');
  const Q = (axis, deg) => new THREE.Quaternion().setFromAxisAngle(axis, THREE.MathUtils.degToRad(deg));
  const still = new THREE.Quaternion();
  const rest = part.position.clone();
  // in the drop-in holder on the beam: the post turned -90 deg about the vertical (the scale side to the slits), the
  // analyser ring from its parked reading to +45 deg about the mount's axis
  const inBeam = { pos: new THREE.Vector3(bx + (sx - bx) * IN_BEAM, by, bz), q: Q(new THREE.Vector3(0, 1, 0), -90),
    ring: Q(new THREE.Vector3(0, 0, 1), ANGLE - rz) };

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
    part.position.lerpVectors(rest, inBeam.pos, k);
    part.position.y += Math.sin(Math.PI * k) * LIFT;                   // out of one holder, over, into the other
    part.quaternion.slerpQuaternions(still, inBeam.q, k);
    ring?.quaternion.slerpQuaternions(still, inBeam.ring, k);
    post?.quaternion.copy(part.quaternion).invert();
    mat.uniforms.uErase.value = THREE.MathUtils.smoothstep(p, 0.8, 1.0);   // fringes once it cuts the beam
  }
  function toggle(instant) {
    want = 1 - want;
    if (instant || live.reduceMotion.matches) { p = want; pose(); }
    live.render();
  }
  // the pick: the mount's box (barrel and ring, not the post) grown by PICK_PAD, about 8 px at the #optics frame
  // (panel 020 action 6; invisible, never drawn), so a click on the dial or just beside it takes it
  // (from the index: splitPart keeps the split-off vertices in the attribute, so computeBoundingBox would count the post)
  const bb = new THREE.Box3(), v = new THREE.Vector3(), P = part.geometry.attributes.position;
  for (const i of part.geometry.index.array) bb.expandByPoint(v.fromBufferAttribute(P, i));
  if (ring) { ring.geometry.computeBoundingBox(); bb.union(ring.geometry.boundingBox); }
  const mountBox = bb.clone();   // for boxes(): the mount alone
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
      // panel 020 action 12: hold the polarizer part-way (p 0..1) for the raycast gate's mid-move sample
      hold(at) { screen.visible = true; want = p = at; pose(); live.render(); },
      info: () => ({ inBeam: want === 1, progress: p, erase: mat.uniforms.uErase.value, fringeSpacingMm: lambda * L / slitD * 1e3 }),
      // pixel box of the card and the eraser on screen (for the gates' crops)
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
