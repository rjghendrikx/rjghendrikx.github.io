// Walk the room (round 019, variant A): standpoints under C's one-click grammar. A click on the bare floor (the boards or
// the rug) steps to the standpoint nearest that spot; objects still fly to their view in one click from wherever you
// stand. The idea is room-v18-B's walk (there the standpoints were the views themselves, with rings on the floor); here
// they are hand-placed places to stand, no view of their own, no chip, no case card, and nothing drawn in the scene but a
// faint lamp pool on the boards under the pointer while a click there would walk.
//
// main.js owns the grammar: intentAt asks stepOf(hit) for a floor hit in the room (the hero or a standpoint; never in a
// close-up, where the floor stays the way back), the cursor (WALK_CURSOR) and go() read the same intent, and a standpoint
// moves like a view: it pushes #<id>, moving on replaces it, so browser Back lands on the hero and Esc goes home.
//
// Cost: one hidden disc (+1 draw call only while the pointer is over walkable floor), no per-frame work at rest.
import { noPick } from './layer-common.js';

// The standpoints, hand-placed for the canal house (Blender room metres: x right, y into the room from the window wall,
// z up; eye 1.65 m standing, 1.2 m seated). Each looks at the part of the room the hero frame cannot reach: the C64's
// screen, the hi-fi, the poster. A layout without the canal house's floor and shell gets no walk. [check] labels,
// notes/captions.md. Next: rows in canal_house.py beside VIEWS, exported as extras, at the next bake.
const LAYOUT = 'cz_canal';
const STANDS = [
  // the back corner (merge 019: "From the back of the room" until a door is modelled, panel 019 open call): the table,
  // the C64's green screen face on, the bench and both panes beyond. card: what a click reaches from here ([check])
  { id: 'door', label: 'From the back of the room', loc: [1.95, -5.05, 1.65], target: [-0.9, -0.9, 0.95], lens: 20,
    card: 'From here: the C64, Agents on the laptop, the bench and the canal.' },
  // in front of the bench, the panes at your back: Plato on his plinth, the bookcase and the poster down the right wall
  { id: 'window', label: 'At the window', loc: [0.25, -1.05, 1.62], target: [2.5, -3.4, 1.1], lens: 20,
    card: 'From here: Plato and the projection mapping, the bookcase, the poster.' },
  // seated on the speakers' axis, back from the stool: the Luxman, the B&Ws and the records along the left wall
  { id: 'seat', label: 'The listening seat', loc: [0.85, -1.9, 1.2], target: [-2.4, -1.35, 0.8], lens: 20,
    card: 'From here: the hi-fi, Simulations in the cloud chamber, the C64.' },
];
const FLOOR = new Set(['at_floor', 'cz_rug']);
const FLOOR_Y = 0.06;        // m: a hit this low on the floor or the rug is floor (the rug is ~1 cm)
const REACH = 1.8;           // m: a spot further than this from every other place walks nowhere (a far spot is not a place);
                            // 1.8 (was 1.5) so the floor strip at the hero's lower right reaches the back of the room
const POOL_R = 0.42;         // m: the lamp pool's radius on the boards
const POOL_A = 0.32;         // its peak alpha, additive: a lift of the bake, never a mark
const POOL_MS = 140;         // its fade, in and out

export default function mount(live) {
  const { THREE, scene, byName } = live;
  // merge 019 step 2 (UX's conditional blocker): a mouse only. On touch the floor is no hidden gesture: a tap there does what
  // it did before the walk (nothing on the hero, back from a view), and the phone reaches every case by its tag
  if (!matchMedia('(pointer: fine)').matches) return null;
  if (live.gate || !live.addStands || !byName(LAYOUT) || !byName('at_floor')) return null;
  const glPos = ([x, y, z]) => new THREE.Vector3(x, z, -y);   // Blender Z-up to glTF Y-up

  // keep a standpoint only if a ray down through it lands on the floor first (not inside a piece of furniture)
  const down = new THREE.Raycaster();
  const solids = [];
  scene.traverse((o) => { if (o.isMesh && o.material?.isMeshBasicMaterial && o.material.map) solids.push(o); });
  const top = (o) => { while (o?.parent && o.parent !== scene) o = o.parent; return o; };
  const clear = (p) => { down.set(new THREE.Vector3(p.x, 2.2, p.z), new THREE.Vector3(0, -1, 0)); const h = down.intersectObjects(solids, false)[0];
    return !!h && FLOOR.has(top(h.object)?.name) && (2.2 - h.distance) < FLOOR_Y; };
  const stands = [], dropped = [];
  for (const s of STANDS) {
    const pos = glPos(s.loc);
    if (!clear(pos)) { dropped.push(s.id); continue; }
    stands.push({ id: s.id, label: s.label, card: s.card, pos, target: glPos(s.target), fov: live.fovOf(s.lens) });
  }
  if (!stands.length) return null;
  const hero = { id: live.home, pos: live.heroPos };
  const places = [hero, ...stands];
  const dist2 = (s, p) => (s.pos.x - p.x) ** 2 + (s.pos.z - p.z) ** 2;   // on the floor plan
  // the place a click on this floor hit walks to: of the places other than where you stand (the hero among them), the one
  // nearest the spot, within REACH of it. Merge 019 (panel 019 action 5): never "where you stand", so the floor at your
  // feet walks somewhere too: from the hero, the strip at the lower right goes to the back of the room, and every
  // standpoint has floor that goes home
  function stepOf(hit, cur) {
    if (!FLOOR.has(top(hit.object)?.name) || hit.point.y > FLOOR_Y) return null;
    const other = places.filter((p) => p.id !== cur.id);
    const s = other.reduce((a, b) => (dist2(b, hit.point) < dist2(a, hit.point) ? b : a));
    return dist2(s, hit.point) > REACH * REACH ? null : s;
  }
  live.addStands(stands, stepOf);

  // the lamp pool: a soft warm disc on the boards, additive, eased in and out; the only thing the walk draws
  const pool = noPick(new THREE.Mesh(new THREE.CircleGeometry(POOL_R, 40).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
    uniforms: { a: { value: 0 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: 'varying vec2 vP; void main() { vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float a; varying vec2 vP; void main() { float r = length(vP) / ${POOL_R.toFixed(3)};
      float k = a * exp(-3.2 * r * r) * (1.0 - smoothstep(0.82, 1.0, r)); gl_FragColor = vec4(vec3(1.0, 0.78, 0.5) * k, 1.0); }`,
  })));
  pool.visible = false;
  pool.renderOrder = 2;
  scene.add(pool);
  let want = 0, shown = 0;
  const fade = () => (live.reduceMotion?.matches ? Infinity : 1000 / POOL_MS);
  function hover(it) {
    want = it.kind === 'walk' ? 1 : 0;
    if (want) pool.position.set(it.at.x, it.at.y + 0.004, it.at.z);
    if (want || shown) live.render();
  }
  live.renderer.domElement.addEventListener('pointerleave', () => { want = 0; live.render(); });
  // merge 019 (panel 019 action 5): after the fly-in the pool breathes once at the standpoint nearest the hero, no text: the
  // floor is a place you can go. Once, and not if the pointer already found the floor
  const near = stands.reduce((a, b) => (dist2(b, hero.pos) < dist2(a, hero.pos) ? b : a));
  let hinted = false;
  const hint = () => {
    if (hinted || want || live.view() !== live.home || live.reduceMotion?.matches) return;
    hinted = true;
    pool.position.set(near.pos.x, 0.004, near.pos.z);
    want = 1; live.render();
    setTimeout(() => { if (pool.position.x === near.pos.x && pool.position.z === near.pos.z) { want = 0; live.render(); } }, 1100);
  };
  if (live.root.dataset.intro === 'playing') addEventListener('room:intro', () => setTimeout(hint, 1200), { once: true });
  else setTimeout(hint, 1600);

  return {
    name: 'walk',
    hover,
    update(dt) {
      if (shown === want) return false;
      shown = want > shown ? Math.min(want, shown + dt * fade()) : Math.max(want, shown - dt * fade());
      pool.material.uniforms.a.value = POOL_A * shown;
      pool.visible = shown > 0;
      live.render();
      return false;
    },
    onView() { want = shown = 0; pool.visible = false; },
    api: {
      stands: () => stands.map((s) => ({ id: s.id, label: s.label, pos: s.pos.toArray(), target: s.target.toArray() })),
      dropped: () => [...dropped],
      pool: () => ({ on: want > 0, visible: pool.visible, alpha: pool.material.uniforms.a.value, at: pool.position.toArray(), hinted }),   // on: where it is heading
    },
  };
}
