// Baked room viewer: one unlit material per object, lighting comes from the Cycles bake.
// Every asset URL is relative (scene.glb, <object>.jpg) so the page works next to its files.
// This file holds the static room, the viewpoints and the glass; the live layers (projector and
// point cloud, chamber tracks, Geiger + scope, quantum eraser) are layer-*.js, mounted by
// mountLayers() below (CONVENTIONS.md, "Live layers").
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/+esm';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js/+esm';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js/+esm';
// The decoder of the gltfpack release build.py packs with (newer than the one three r160 bundles)
import { MeshoptDecoder } from 'https://cdn.jsdelivr.net/npm/meshoptimizer@1.3.0/meshopt_decoder.mjs';
import { KTX2Loader } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/KTX2Loader.js/+esm';
import makeGlow from './glow.js';

// The model: a GLB, meshopt-compressed by build.py (EXT_meshopt_compression).
const MODEL_URL = 'scene.glb';
const params = new URLSearchParams(location.search);
const GATE = params.has('gate');
const GLASS = !params.has('noglass');
const LIVE = !params.has('nolive');   // ?nolive: the bake alone
// Each module default-exports mount(live) -> layer | null (layer: update(dt) -> needs a frame,
// onView(id), api for the gates). One failing layer must not take the room down.
// layer-terminal.js first (its canvas is ready before the others mount); layer-intro.js last, it takes
// the camera from the room's first frame
const LAYERS = ['layer-terminal.js', 'layer-projector.js', 'layer-chamber.js', 'layer-geiger.js', 'layer-eraser.js', 'layer-rain.js', 'layer-water.js', 'layer-audio.js', 'layer-hotspots.js', 'layer-tags.js', 'layer-walk.js', 'layer-lidar.js', 'layer-stage.js', 'layer-c64.js', 'layer-intro.js'];
// panel 019 action 3b: the polarizer's act says what a press will do, from the eraser's own state ([check] copy)
const POLARIZER = (L) => (L.eraser?.info().inBeam ? 'Take the polarizer out' : 'Insert the polarizer');
// Case cards: one project per work viewpoint (lib/layouts/canal_house.py VIEWS), shown in .case (aria-live)
// when the camera arrives. A view id that the layout lacks is skipped. acts: DOM buttons for the room's picks
// ({ label, run: layer api call }) and links.
// The work cases have one source (panel 015 action 15): kicker, title and text come from index.html #work (also
// the no-JS version); a card adds only `room`, a sentence about what is in front of you, and its acts.
// [check] all copy: facts from llms-full.txt (public), Ruud reads it; see notes/captions.md, "Case copy".
const WORK = {
  // [check] card only, unchanged since 013
  chamber: { room: 'The chamber in front of you works the same way: its rate is scaled from the real flux, about one muon per square centimetre a minute; the tracks are simulated.',   // [check] panel 019 action 13
    acts: [{ label: 'Hear the Geiger counter', run: (L) => L.geiger?.sound(true) }] },
  // [check] card only (panel 015 action 1 wording)
  experiment: { room: 'Watch the projector: its stripes label the vase point by point, and the vase becomes its own point cloud.',
    acts: [{ label: 'Run the scan', run: (L) => L.projector?.start() }] },
  // panel 019 action 9: the colophon link left this card; until Ruud supplies a proof link the mailto is its one act
  // merge 021 (panel 021 action 5): B's servant / sparring / mirror line, parked in captions.md, is the case's room line
  terminal: { room: 'Servant for the chores, sparring partner for the design, mirror for whether it is worth building: the agents go fast, he does the steering.',   // [check]
    acts: [] },
};
// panel 019 action 9: every work card ends with the offer, "Ask him about this", a mailto whose subject names the case.
// Its one copy is the article's own a.ask in index.html #work (the no-JS sheet has it too); `mail` marks it so showCase
// renders it last, after any proof link added later (PLATO.proof). [check] notes/captions.md
function workCase(id, { room, acts }, el = null) {
  const a = el ?? document.querySelector(`#work article[data-view="${id}"]`);
  if (!a) return null;
  const text = (q) => a.querySelector(q)?.textContent.replace(/\s+/g, ' ').trim() ?? '';
  const ask = a.querySelector('a.ask');
  // the label without its visually hidden case name (panel 020 action 4), which showCase adds back as .vh
  const vh = ask?.querySelector('.vh')?.textContent ?? '';
  const mail = ask ? [{ label: ask.textContent.replace(vh, '').trim(), href: ask.getAttribute('href'), mail: true, vh }] : [];
  return { k: text('.k'), t: text('h3'), b: [text('p.text'), room].filter(Boolean).join(' '), acts: [...acts, ...mail] };
}
const CASES = {
  ...Object.fromEntries(Object.entries(WORK).map(([id, w]) => [id, workCase(id, w)]).filter(([, c]) => c)),
  bench: { k: 'Try it', t: 'The bench',
    // merge 021 (panel 021 action 8): the notebook's short form, so a tap visitor reaches it from the Bench card [check]
    b: 'A classical quantum eraser on the breadboard, a cloud chamber, and a Geiger counter wired to the scope. The notebook in front labels every finding: tested, preference or hypothesis.',
    acts: [{ label: POLARIZER, run: (L) => L.eraser?.toggle(false) }, { label: 'Hear the Geiger counter', run: (L) => L.geiger?.sound(true) }] },
  projector: { k: 'Try it', t: 'Structured light',
    b: 'The projector is the scanner’s light source; its stripes label every point on the vase with a column and a row.',   // [check] panel 015 action 1
    acts: [{ label: 'Run the scan', run: (L) => L.projector?.start() }] },
};
// round 021 C (profile.md, "Own cases"): his own three, with their figures. Each is a card of its zone's view, not a view
// of its own: one click on the zone card's act opens it in place (the camera stays, #<case> replaces the view's hash), so
// outside, Esc and browser Back all lead to the room as from the view. One source again: index.html #work
// article[data-case] (the no-JS sheet), `in` naming the view. The zone cards' acts that open them: [check] captions.md
const OWN = { atlas: 'His own: the Atlas', inference: 'His own: a model on the 3090', metal: 'His own: Metal visuals' };
// round 022 C: Metal visuals is the medium the projector plays: its card runs the show (the head becomes the canvas)
const OWN_ACTS = { metal: [{ label: 'Show the idea in the room', run: (L) => L.projector?.start() }] };   // [check] merge 022 (panel 022 action 6): WebGL, not the Metal pipeline
for (const a of document.querySelectorAll('#work article[data-case]')) {
  const id = a.dataset.case, c = OWN[id] && workCase(null, { room: '', acts: [] }, a);
  if (!c || !CASES[a.dataset.in]) continue;
  CASES[id] = { ...c, in: a.dataset.in, acts: [...(OWN_ACTS[id] ?? []), ...c.acts] };
  CASES[a.dataset.in].acts.push({ label: OWN[id], case: id });
}
// wave 5 P2: where the scan target is the Plato head (canal_house) the projector's cards say so. [check] notes/captions.md
const PLATO = {
  projector: { k: 'Try it', t: 'Projection mapping',
    b: 'First the projector measures the head: its stripes label every point with a column and a row, and the camera beside the lens triangulates the depth. Then the head becomes a canvas, as festival stages were for him with Resolume and MadMapper. The buttons step through what a mapping studio shows: white, wire, template, mask, content.',
    acts: [{ label: 'Run the scan and the show', run: (L) => L.projector?.start() }] },
  room: 'Watch the projector: its stripes label the head point by point, the head becomes its own point cloud, and then a canvas for light.',
  scan: ['The projector is scanning Plato', 'Stripes of light label every point on the head; then it becomes its own point cloud, and then a canvas.'],
  pill: 'Scanning Plato · see it up close',
  // merge 018 step 9 (from B): each case card ends with one outbound proof, marked ↗. The head's is the cast at SMK
  // (layer-hotspots.js CAPTIONS plato, a real URL); the Schiphol and agents cases wait for Ruud's links (captions.md)
  proof: { label: 'The cast at SMK', href: 'https://open.smk.dk/artwork/image/KAS2111', ext: true },
  label: 'Projection mapping',   // [check] panel 018 action 9: was "This room"
};
// merge 018 step 3 (A's table, D's rule): a view without a case shows its object's caption as the card, on arrival
// (the hover only names it, with the tag). View id -> layer-hotspots.js CAPTIONS name; a missing caption is skipped.
const CAPTION_OF = { c64: 'c64', optics: 'optics', hifi: 'amp', canal: 'raindrop' };   // canal: 019 action 16, the phone's road to the drop   // not the poster: it is its own text (D)
// panel 018 action 3: the acts of a caption card. The polarizer is in the #optics frame since round 020 C (parked on its
// post beside the card): a click on it or the card's act puts it in the beam, and the fringes on the card come back
// panel 019 actions 5 and 11: a place that is not a case still says, in one line, what a click reaches from it: the furniture
// views here, the walk's standpoints in layer-walk.js (STANDS card). [check] copy, notes/captions.md
const PLACE_CARDS = {
  table: 'From here: the C64, Agents on the laptop, the hi-fi.',
  wall: 'From here: the work files on the shelf, Plato and the projection mapping, the wheel.',
};
const CAPTION_ACTS = { optics: [{ label: POLARIZER, run: (L) => L.eraser?.toggle(false) }] };
// the nav's Work group, in this order (panel 015 action 6); the layout's other views go behind "More views"
const WORK_ORDER = ['chamber', 'terminal', 'experiment'];
const NAV_HINT_KEY = 'room.navhint.v2';   // localStorage: the one-time hint was shown (merge 018 step 7; v2 merge 021: one hint)
// [check] notes/captions.md: the hint, split for touch and mouse (C's grammar: outside is back)
const NAV_HINT = { touch: 'Tap anywhere outside it to go back to the room', mouse: 'Click anywhere outside it, or press Esc, to go back to the room' };
// merge 021 (panel 021 action 4): say once that you can move: on the first hover over walkable floor (mouse) or after the
// fly-in (touch). One hint in all: whichever of this and NAV_HINT comes first is the one shown. [check] notes/captions.md
const MOVE_HINT = { touch: 'Tap the floor to walk · two fingers to slide', mouse: 'Click the floor to walk · right-drag to slide · arrows/WASD · Esc for the room' };
// Click navigation (round 18 C): the objects that go somewhere, node name -> view id (a missing node or view is skipped);
// the window views are reached by a click out of the window. research/click-navigation.md, "The grammar".
const HOT = {
  cloud_chamber: 'chamber', pr_terminal: 'terminal', plato: 'experiment', at_plinth: 'experiment', scan_target: 'experiment',
  projector: 'projector', optics: 'optics', bench: 'bench', geiger: 'bench', scope: 'bench',
  c64: 'c64', pr_c64mon: 'c64', ti83: 'c64', amp: 'hifi', pr_dm603: 'hifi', pr_ifi: 'hifi', pr_hd660: 'hifi', rack: 'hifi',
  pr_poster_action: 'action',
  // round 19 C (panel 018 action 10): the furniture views; FURNITURE makes them the way back from their own close-ups.
  // The wall is reached by the wheel, not the bookcase: the bookcase's box is a third of the hero, and layer-tags keeps
  // tags off hot boxes, which pushed the "Least action" edge tag up under the live card at 1024x768
  cz_table: 'table', pr_wheel: 'wall',
  // round 020 A + panel 020 action 5: the work's three lever-arch files on the bookcase (objects/case_folders.py), one
  // node each, so glow, tags and the click table run through the same code as every other hot object
  case_simulations: 'chamber', case_agents: 'terminal', case_mapping: 'experiment',
  // round 021 B: the record crate and its two named sleeves (objects/pr_records.py) belong to the listening corner
  pr_records: 'hifi', pr_records_sleeves: 'hifi',
  // round 022 C: the RTX 3090 on the bench (objects/pr_3090.py), its own case's object (CASE_OF)
  pr_3090: 'bench',
};
// round 022 C (panel 021, bets for 022, C): the own cases as objects. A click on one of these nodes flies to its view (HOT)
// and opens the own case there (openCase: #<case> replaces the view's entry, so outside, Esc and Back lead home as from the
// view). The case's view is its `in` (index.html #work data-in); a node whose case lives in another view stays a plain view
// link. The tag over it names the case (live.label). The Atlas stays on the laptop's Agents card: the laptop is the
// Agents work case's one object on the phone hero (the binder is off screen there), so it cannot also be the Atlas's.
const CASE_OF = { pr_3090: 'inference', projector: 'metal' };
const OWN_TAG = { inference: 'Local inference', metal: 'Metal visuals' };   // the paper tag's words (layer-tags.js) [check]
// round 020 (panel 019 action 7): part of a node goes somewhere: a hit on it below `y` m (glTF up) leads to `id`. The
// bookcase's lower shelves, under Plato's plinth top, are the Bookcase view's own target; above them the books stay
// scenery, so the case's box (a third of the hero) never becomes a hot box for the tags
const HOT_BELOW = { cz_bookcase: { id: 'wall', y: 0.9 } };
// merge 018 step 4 (from D): a second click on the view's own object, where no layer pick takes it, runs its action
const ACT = { experiment: (L) => L.projector?.start(), projector: (L) => L.projector?.start() };
const FAR_VIEWS = ['canal', 'university'];
const FURNITURE = ['bench', 'table', 'wall'];   // views of a piece of furniture: from a close-up on it, a click there is back
const LEFT_PANE_X = 0;           // glTF x of the window's mullion: left of it is the University pane, right the canal
const TAP_SLOP = 22;             // px: a tap this close to a small hot object counts as on it (44 px targets on a phone)
const PULL_PX = 240;             // wheel delta past the far limit that steps back into the room
const TOAST_MS = 8000;          // the end-of-flight toast's time on screen, at least 8 s (panel 016 action 8)
// the walk's cursor (round 019 A): two steps on the boards, cream on a dark edge; the fallback names a click, never a drag
const WALK_CURSOR = `url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><g fill="#f3e6cf" stroke="#2a1f17" stroke-width="1.2"><ellipse cx="8.5" cy="14" rx="3" ry="5"/><ellipse cx="15.5" cy="9" rx="3" ry="5"/></g></svg>')}") 12 12, pointer`;
const ORBIT_KEY = 0.06;          // rad per arrow-key press (keyboard orbit inside a close-up's cone)
// round 021 D, free movement (Ruud 2026-10-23: "I also want to move in translating directions"): in the room (the hero, a
// standpoint, a spot you walked to) the arrows and WASD step KEY_STEP m (forward, back, sideways), the right button or two
// fingers pan sideways and up/down, a floor click walks there; all through layer-walk.js's clearance table (nav)
const KEY_STEP = 0.3;            // m a key press
const KEY_MS = 220;              // a step's glide (instant under reduced motion)
const FACE_ROOM = 1.2;           // m of room ahead a walk's gaze wants on arrival (else it turns off the wall)
// round 022 D (the premise the 021 merge left open: "frame a hot object" and "keep the floor in frame" conflict mid-room):
// a walk's arrival turns to the nearest hot object within `cone` deg of the way it walked, `near`-`far` m off on the plan,
// seen 12-34 deg down, if that frame keeps >= `floor` of its cells on walkable floor (the next click) and its centre ninth
// at most `wall` on a wall nearer than FACE_ROOM; else it keeps the travel direction at a walker's pitch (12-24 deg down),
// turned off a wall only. The same measures as free_move_gate (frame_after_walk): the whole frame's cells, not a half
// pick: the share main.js asks of its own 48 rays, over the gate's 6 % for the sampling (gate run on 022 D: a pose this
// code read at >= 6 % measured 5 % on the gate's 570 cells); hot: the nearest this many hot objects are tried
// merge 022 (panel 022 action 2, the chair's fallback): back to panel 021's rule, 10 % floor, a hot object within 60 deg of the
// pre-walk gaze or that gaze kept, never a turn past 60 deg; the floor counted by stepOf, the click's own test (as hotMap)
// Ruud 2026-10-23 ("blik iets omlaag"): after a walk the gaze tilts down, 12 deg, then 16 and 20 only if the floor needs it
const ARRIVE = { cone: 60, near: 0.9, far: 6, tilt: [12, 16, 20], hotPitch: 34, floor: 0.10, pick: 0.10, wall: 0.2, hot: 5 };
const WALL_NODES = new Set(['cz_canal', 'cz_ceiling', 'cz_door', 'cz_chimney', 'cz_bookcase']);   // gates.py SHELL_NODES
const SETTLE_M = 0.08;           // m: a pan or a step that moved the gaze's centre this far makes where you stand a spot ('walk')
const RISE_MS = 400;             // merge 021: a pan's release eases the eye back to eye height over this
const SETTLE_MOVE = 5e-4;        // m: a pan change that moves the eye less than this (the damping tail) does not restart the settle timer
// the cursor tells the truth, from one table (rule 1): what a click or a drag here does
const CURSOR = { go: 'pointer', act: 'pointer', pick: 'pointer', walk: WALK_CURSOR, back: 'zoom-out', none: 'grab', stay: 'grab',
  turn: 'grabbing', pan: 'move' };
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const root = document.documentElement;
const state = (window.__room = { mode: 'loading', ready: false });
if (GATE) root.classList.add('gate');

const SENSOR = 36;              // mm, horizontal sensor fit (lib/scene.py)
// panel 019 action 2 (cinematographer's figures): a move takes 600 ms, 140 ms a metre and 3 ms a degree of turn, held to
// 0.65-1.5 s (018's 260 ms/m and 1.7 s cap left 8 of 16 moves at the cap: long moves uniform again, and slow). The eyes
// travel on easeInOutSine (peak ~1.57x the mean speed, was cubic's 3x); the gaze keeps the cubic, done by 0.7 of the move
// when it turns more than 30 deg. A walk move that turns more than 90 deg turns first (the gaze in the first 40 %), then
// walks, and takes as long as a gaze of at most 300 deg/s needs (it may pass the 1.5 s clamp). Unmeasured on a device:
// perf.py --motion, then Ruud's feel check on his phone.
const MOVE = { base: 600, perMetre: 140, perDegree: 3, min: 650, max: 1500, turnBy: 0.7, turnFrom: 30,
  turnFirst: 90, turnFirstBy: 0.4, walkFrom: 0.3, gazeMax: 300, walkMax: 2400,
  gazeHeadroom: 0.85 };   // timed for 255 deg/s, so the per-frame peak stays under the 300 cap (gate run 1: 343 at exactly 300)
const moveMs = (metres, swing) => Math.min(MOVE.max, Math.max(MOVE.min, MOVE.base + MOVE.perMetre * metres + MOVE.perDegree * swing));
const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);   // easeInOutCubic: the gaze
const easePos = (k) => -(Math.cos(Math.PI * k) - 1) / 2;                          // easeInOutSine: the eyes
// round 021 D: a walk's eyes on the minimum-jerk profile (Flash & Hogan 1985: the path that makes the integral of squared jerk
// stationary, the least-action form a head and a reaching hand follow); peak 1.875x the mean, start and stop with zero
// acceleration, so a walk sets off and comes to rest like a body, not a dolly
const easeWalk = (k) => k * k * k * (10 + k * (6 * k - 15));
const SINE_PEAK = Math.PI / 2;    // easeInOutSine's peak rate over its mean
// merge 021 (panel 021 action 2, "walk like a body"): a walk in the room takes 700 ms a metre over the part the eyes travel,
// a mean of 1.43 m/s, a walker's (the round-021 D build peaked at 5.24 m/s on 140 ms/m); easeWalk's peak is 1.875x the
// mean, 2.68 m/s, under the chair's 2.8. Flights to a close-up keep MOVE. Unmeasured on a device: Ruud's hands decide
const WALK = { perMetre: 700, min: 650, max: 6000 };
// Orbit stays a small cone around each viewpoint: no pan, little zoom.
const ORBIT = { az: 0.35, polarUp: 0.18, polarDown: 0.12, near: 0.85, far: 1.12 };
// Portrait screens: widen the vertical FOV by at most this factor (tan space) and crop the sides,
// instead of keeping the full 16:9 width (which leaves the bench a thin strip on a phone).
const PORTRAIT_MAX = 1.9;
// Portrait, hero view only: the crop looks right and down by this share of the frame (width, height), so the vase and
// its plinth stay in frame and clear the chip strip, instead of the ceiling (panel 015 actions 5-6)
const PORTRAIT_SHIFT = [0.05, 0.14];

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

// Real glass where glass exists (the bake is opaque): faint tint, fresnel alpha, no depth write.
function glassMaterial() {
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { tint: { value: new THREE.Color(0.80, 0.92, 0.90) } },  // display values, no conversion
    vertexShader: `varying vec3 vN; varying vec3 vV;
      void main() { vec4 p = modelViewMatrix * vec4(position, 1.0); vN = normalMatrix * normal; vV = -p.xyz;
        gl_Position = projectionMatrix * p; }`,
    fragmentShader: `uniform vec3 tint; varying vec3 vN; varying vec3 vV;
      void main() { float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 3.0);
        gl_FragColor = vec4(tint, 0.035 + 0.30 * f); }`,
  });
  mat.forceSinglePass = true;                                   // one draw call, not back + front
  return mat;
}

// The cloud chamber's tank: an open box (no face on the plate side), sized from the node extras
// (lib/scene.py _glass_extras).
function addGlass(node) {
  const d = node.userData;
  if (!d.glass_size) return null;
  const [sx, sy, sz] = d.glass_size;
  const geo = new THREE.BoxGeometry(sx, sy, sz);
  const keep = geo.groups.filter((g, i) => i !== 3);          // drop -Y (the face on the plate)
  const idx = geo.index.array;
  geo.setIndex(keep.flatMap((g) => Array.from(idx.slice(g.start, g.start + g.count))));
  geo.clearGroups();
  const glass = new THREE.Mesh(geo, glassMaterial());
  glass.name = `${node.name}_glass`;
  glass.position.fromArray(d.glass_center);
  glass.renderOrder = 1;
  node.add(glass);
  return glass;
}

// Every other glass (domes, bottles, jars, prisms: a module's GLASS dict, written by lib/scene.py as
// glass_lathe [[r, y], ...] about glass_center, or glass_mesh flat triangles, node-local glTF axes):
// one merged mesh in world space, one draw call, never picked (the props under it stay clickable).
function addPropGlass(scene) {
  const pos = [], nrm = [];
  scene.traverse((node) => {
    const d = node.userData;
    let geo = null;
    if (d.glass_lathe) {
      geo = new THREE.LatheGeometry(d.glass_lathe.map(([r, y]) => new THREE.Vector2(r, y)), 32).toNonIndexed();
      geo.translate(...(d.glass_center ?? [0, 0, 0]));
    } else if (d.glass_mesh) {
      geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(d.glass_mesh, 3));
    } else return;
    geo.computeVertexNormals();
    geo.applyMatrix4(node.matrixWorld);
    pos.push(...geo.attributes.position.array);
    nrm.push(...geo.attributes.normal.array);
    geo.dispose();
  });
  if (!pos.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  const glass = new THREE.Mesh(geo, glassMaterial());
  glass.name = 'prop_glass';
  glass.renderOrder = 1;
  glass.raycast = () => {};
  scene.add(glass);
  return glass;
}

async function start() {
  if (!webglAvailable()) { state.mode = 'fallback'; state.ready = true; return; }

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setPixelRatio(GATE ? 1 : Math.min(devicePixelRatio, 2));   // phones: DPR 3 -> 2
  document.querySelector('.stage').appendChild(renderer.domElement);

  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(MODEL_URL);
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);

  // Baked textures: each mesh node names its texture in extras.tex (see CONVENTIONS.md): a KTX2 encode (build.py:
  // ETC1S, transcoded to the GPU's own block format, about 1/4-1/8 of RGBA8) or, in the default room, the baked
  // JPEG. A build without extras.tex served KTX2 for every extras.bake_tex.
  const texLoader = new KTX2Loader()
    .setTranscoderPath('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/basis/')
    .detectSupport(renderer);
  const maxAniso = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  const jpgLoader = new THREE.TextureLoader();
  const loads = [];
  const meshes = [];
  scene.traverse((o) => { if (o.isMesh) meshes.push(o); });
  const glow = makeGlow(THREE, reduceMotion);   // the hover glow on the baked materials (glow.js), zero at rest
  for (const o of meshes) {
    const ud = o.userData.bake_tex ? o.userData : o.parent?.userData ?? {};
    const file = ud.tex ?? ud.bake_tex?.replace(/\.jpg$/, '.ktx2');
    // extras.double_sided: cards seen from both sides (the canal house's leaf clumps)
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: ud.double_sided ? THREE.DoubleSide : THREE.FrontSide });
    o.material = mat;
    glow.attach(mat);
    if (!file) continue;
    loads.push((file.endsWith('.ktx2') ? texLoader : jpgLoader).loadAsync(file).then((t) => {
      t.flipY = false;   // glTF UV convention (a KTX2 is never flipped)
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = maxAniso;
      mat.map = t;
      mat.needsUpdate = true;
    }));
  }
  const byName = (n) => scene.getObjectByName(n);
  const head = !!byName('plato');   // wave 5 P2
  if (head) {
    Object.assign(CASES.projector, PLATO.projector, { acts: [...PLATO.projector.acts, ...CASES.projector.acts.filter((a) => a.case)] });
    if (CASES.experiment) CASES.experiment.b = CASES.experiment.b.replace(WORK.experiment.room, PLATO.room);
  }
  if (GLASS) { const cc = byName('cloud_chamber'); if (cc) addGlass(cc); addPropGlass(scene); }

  // Hero camera from the glTF: same transform and vertical FOV as the Blender still.
  const src = gltf.cameras[0];
  const heroAspect = src.aspect || 16 / 9;
  const camera = new THREE.PerspectiveCamera(src.fov, heroAspect, 0.05, 1000);
  const heroPos = src.getWorldPosition(new THREE.Vector3());
  const tgtData = src.userData.hero_target ?? src.parent?.userData.hero_target;
  const heroTarget = tgtData ? new THREE.Vector3(...tgtData)
    : heroPos.clone().add(new THREE.Vector3(0, 0, -1).applyQuaternion(src.getWorldQuaternion(new THREE.Quaternion())));

  // Viewpoints: empties vp_<id> with label, target and lens (lib/scene.py VIEWS). Lens -> vertical
  // FOV at the hero aspect, the same convention as the hero camera.
  const lensToFov = (lens) => THREE.MathUtils.radToDeg(2 * Math.atan(SENSOR / 2 / lens / heroAspect));
  const views = [];
  scene.traverse((o) => {
    const d = o.userData;
    if (!d.vp_label) return;
    views.push({ id: o.name.replace(/^vp_/, ''), label: d.vp_label, order: d.vp_order ?? 0,
      pos: o.getWorldPosition(new THREE.Vector3()), target: new THREE.Vector3(...d.vp_target), fov: lensToFov(d.vp_lens) });
  });
  views.sort((a, b) => a.order - b.order);
  // The first viewpoint is the hero: use the camera's exact values so the gate's pixel diff holds.
  if (views[0]) Object.assign(views[0], { pos: heroPos.clone(), target: heroTarget.clone(), fov: src.fov });
  else views.push({ id: 'overview', label: 'Overview', order: 0, pos: heroPos.clone(), target: heroTarget.clone(), fov: src.fov });
  for (const v of views) v.shift = v === views[0] ? PORTRAIT_SHIFT : [0, 0];
  // merge 018 step 8 / action 9: where the head is the scan target, the third work view names the offer (its chip, its tag
  // and the Work sheet's kicker); the layout's own label (canal_house.py VIEWS) follows at the next bake. [check]
  if (head) {
    const ex = views.find((v) => v.id === 'experiment');
    if (ex) ex.label = PLATO.label;
    if (CASES.experiment) { CASES.experiment.k = PLATO.label; CASES.experiment.acts = [...CASES.experiment.acts, PLATO.proof]; }
    const k = document.querySelector('#work article[data-view="experiment"] .k');
    if (k) k.textContent = PLATO.label;
  }

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;       // round 021 D: on in the room once the walk's clearance table is up (syncPan)
  controls.screenSpacePanning = true;   // sideways and up/down, never into the frame (that is the walk's)
  controls.rotateSpeed = 0.5;
  controls.enabled = !GATE;
  const applyMotionPref = () => { controls.enableDamping = !reduceMotion.matches; };
  applyMotionPref();
  reduceMotion.addEventListener('change', applyMotionPref);

  let baseFov = src.fov;            // the current view's FOV at the hero aspect
  function fitFov() {
    const a = camera.aspect;
    if (a >= heroAspect) return baseFov;
    const t = Math.tan(THREE.MathUtils.degToRad(baseFov) / 2) * Math.min(heroAspect / a, PORTRAIT_MAX);
    return THREE.MathUtils.radToDeg(2 * Math.atan(t));
  }

  function setLimits(pos, target) {
    controls.target.copy(target);
    const sph = new THREE.Spherical().setFromVector3(pos.clone().sub(target));
    const dist = sph.radius;
    controls.minDistance = dist * ORBIT.near;
    controls.maxDistance = dist * ORBIT.far;
    controls.minAzimuthAngle = sph.theta - ORBIT.az;
    controls.maxAzimuthAngle = sph.theta + ORBIT.az;
    controls.minPolarAngle = Math.max(0.2, sph.phi - ORBIT.polarUp);
    // never below the view's own pose: a view that looks up (merge 019, the Bookcase view pitched up to the cornice) has its
    // camera under its target, past the horizon cap, and was lifted 0.57 m on arrival; every other view is as before
    controls.maxPolarAngle = Math.max(sph.phi, Math.min(Math.PI / 2 - 0.05, sph.phi + ORBIT.polarDown));
  }

  let shift = [0, 0];               // the current view's portrait shift (PORTRAIT_SHIFT on the hero)
  function frame() {                // portrait screens only; a setViewOffset survives the intro's fov changes
    const w = innerWidth, h = innerHeight;   // in px: setViewOffset also sets the aspect to fullWidth / fullHeight
    if (w < h && (shift[0] || shift[1])) camera.setViewOffset(w, h, shift[0] * w, shift[1] * h, w, h);
    else camera.clearViewOffset();
  }
  function place(pos, target, fov, sh = [0, 0]) {
    camera.position.copy(pos);
    camera.lookAt(target);
    baseFov = fov;
    shift = sh;
    camera.fov = fitFov();
    frame();
    camera.updateProjectionMatrix();
  }

  let current = views[0];
  // round 019 A, the walk (layer-walk.js): standpoints, room-level places beside the hero (no chip, no case, no gate row);
  // a view-like { id, label, pos, target, fov, shift, stand: true }, registered once that layer is up
  const stands = [];
  const viewOf = (id) => views.find((x) => x.id === id) ?? stands.find((x) => x.id === id) ?? (id === spot.id && spot.fov ? spot : undefined);
  const inRoom = () => current === views[0] || !!current.stand;   // the hero or a standpoint: not a close-up
  let stepOf = null;                // (hit, current, eye) -> { id, at, pos? } where a click on that floor walks to, or null
  let walkNav = null;               // layer-walk.js's clearance table: { free, depth, clamp, pathClear, eye, band, bounds }
  // round 021 D: the spot a free walk, a pan or a step leaves you at: a standpoint without a name of its own (#walk)
  const spot = { id: 'walk', label: 'Where you stand', pos: new THREE.Vector3(), target: new THREE.Vector3(), fov: 0, shift: [0, 0], stand: true };
  let onArrive = () => {};          // set once the layers are mounted
  let arrivedAt = null;             // merge 021: the hot object the last walk's arrival framed (__room.camera().framed)
  let lastArrival = null;           // round 022 D: the poses the last walk's arrival tried (__room.arrival(), for the gates)
  place(current.pos, current.target, current.fov, current.shift);
  setLimits(current.pos, current.target);
  controls.update();

  // the canvas box, read once per resize: a hover resolves after the frame's writes, where a read forces a layout
  let box = null;
  const canvasBox = () => (box ??= renderer.domElement.getBoundingClientRect());
  function resize() {
    box = null;
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = fitFov();
    frame();
    camera.updateProjectionMatrix();
    needsRender = true;
  }

  let needsRender = true;
  let tween = null;
  let lastMove = null;              // the last animated move: { from, to, ms, metres, swing } (__room.camera().move)
  controls.addEventListener('change', () => { needsRender = true; });
  // a drag or wheel moves the camera: the first-view glows (layer-hotspots.js pulse) would point at nothing
  controls.addEventListener('start', () => document.querySelectorAll('.hs-glow').forEach((e) => e.remove()));
  addEventListener('resize', resize);
  resize();

  // Animate to a viewpoint: position, target and FOV, eased; instant under prefers-reduced-motion.
  function goTo(id) {
    const v = viewOf(id);
    if (!v) return Promise.reject(new Error(`no viewpoint ${id}`));
    const left = current.id;
    current = v;
    rise = null;
    syncNav();
    dispatchEvent(new CustomEvent('room:move', { detail: id }));
    // drop any orbit inertia left from a drag, or the damping would carry the camera past the viewpoint
    const damp = controls.enableDamping;
    controls.enableDamping = false; controls.update(); controls.enableDamping = damp;
    const from = { pos: camera.position.clone(), target: controls.target.clone(), fov: baseFov, shift, id: left };
    if (reduceMotion.matches) {
      tween = null;
      dragged = false;
      place(v.pos, v.target, v.fov, v.shift);
      setLimits(v.pos, v.target);
      resetGuard(v.pos);
      controls.update();
      needsRender = true;
      onArrive(id);
      return Promise.resolve(id);
    }
    controls.enabled = false;
    dragged = false;
    // open the limits while moving, so OrbitControls cannot clamp the path
    Object.assign(controls, { minAzimuthAngle: -Infinity, maxAzimuthAngle: Infinity, minPolarAngle: 0,
      maxPolarAngle: Math.PI, minDistance: 0, maxDistance: Infinity });
    // the card belongs to the view it describes: it goes with the old frame and comes back on arrival (onArrive)
    document.querySelector('.case')?.replaceChildren();
    root.classList.remove('has-case');
    // a head, not a dolly: the eyes travel straight, the gaze turns on the great circle between the two view
    // directions (a big turn done by 0.7 of the move, so the eyes lead), the distance to what is looked at eases
    const d0 = from.target.clone().sub(from.pos), d1 = v.target.clone().sub(v.pos);
    const r0 = d0.length(), r1 = d1.length();
    d0.normalize(); d1.normalize();
    // merge 021 (panel 021 action 2): a walk is a move between two places in the room (the hero, a standpoint, a spot); from
    // a standpoint to a close-up is a flight, as from the hero
    const roomPlace = (x) => !!x && (x === home || !!x.stand);
    const walk = roomPlace(v) && roomPlace(viewOf(left));
    // round 021 D: a walk never crosses furniture: round it by one waypoint where the straight line would (layer-walk.js
    // route); a flight to a close-up is the head's move, as before
    // merge 021: from a pose the code left a hair out of bounds the sampled test may find no route where the click's own test
    // (from the same spot at eye height) did: ask that one too before walking straight
    const found = walk && walkNav ? walkNav.route(from.pos, v.pos) ?? walkNav.route(new THREE.Vector3(from.pos.x, walkNav.eye, from.pos.z), v.pos) : [];
    const via = found ?? [];
    const legs = [from.pos, ...via, v.pos].slice(1).map((p, i, a) => p.distanceTo(i ? a[i - 1] : from.pos));
    const metres = legs.reduce((x, y) => x + y, 0), swing = THREE.MathUtils.radToDeg(d0.angleTo(d1));
    // a walk (to or from a standpoint) that turns more than MOVE.turnFirst: turn first on a sine, then walk, slow enough
    // that the gaze never passes MOVE.gazeMax
    const first = swing > MOVE.turnFirst && (walk || !!viewOf(left)?.stand);   // a flight off a standpoint turns first too
    // round 022 (merge 021 open item c): a walk that turns less than that turned its gaze on the cubic (3x its mean rate) in
    // 0.7 of a move timed by the walk alone: window -> seat, 71.6 deg in 785 ms, peaked at 315-332 deg/s against the 330
    // limit. A walk's gaze now turns on the sine, as its eyes do (1.57x), and every walk is timed by the same gaze cap
    const turnBy = first ? MOVE.turnFirstBy : swing > MOVE.turnFrom ? MOVE.turnBy : 1;
    const gazeMs = first || walk ? 1000 * SINE_PEAK * swing / (turnBy * MOVE.gazeMax * MOVE.gazeHeadroom) : 0;
    // a walk goes at a body's pace (WALK.perMetre over the part of the move the eyes travel), a flight keeps MOVE's
    const ms = walk ? Math.min(WALK.max, Math.max(WALK.min, WALK.perMetre * metres / (first ? 1 - MOVE.walkFrom : 1), gazeMs, MOVE.perDegree * swing))
      : first ? Math.min(MOVE.walkMax, Math.max(moveMs(metres, swing), gazeMs)) : moveMs(metres, swing);
    const turn = new THREE.Quaternion().setFromUnitVectors(d0, d1);
    lastMove = { from: from.id ?? null, to: id, ms: Math.round(ms), metres: +metres.toFixed(3), swing: +swing.toFixed(1), turnFirst: first, walk, via: via.length, routed: found ? (via.length ? 'via' : 'straight') : 'none' };
    return new Promise((resolve) => {
      tween = { from, to: v, t0: performance.now(), ms, d0, r0, r1, turn, first, walk, via, legs, metres,
        turnBy, resolve };
    });
  }

  // Click navigation (round 18, variant C; research/click-navigation.md): the room is its own menu. Only the objects in
  // HOT go somewhere (their view); a click out of the window (past FAR m) goes to the window view that looks most nearly
  // that way. Any other click: nothing in the hero, the way back everywhere else (a step back). A click on the current
  // view's own object is left to its layer (type on the C64, insert the polarizer).
  const FAR = 8;
  const hot = new Map();            // top-level node -> view id, for the nodes and views this layout has
  for (const [name, id] of Object.entries(HOT)) { const o = byName(name); if (o && views.some((v) => v.id === id)) hot.set(o, id); }
  const farViews = views.filter((v) => FAR_VIEWS.includes(v.id));
  const topOf = (obj) => { while (obj?.parent && obj.parent !== scene) obj = obj.parent; return obj; };
  // where a world hit leads: { id, node } (node null for the window), or null for scenery
  function hotOf(p, obj) {
    const top = topOf(obj);
    if (hot.has(top)) return { id: hot.get(top), node: top };
    const low = HOT_BELOW[top?.name];
    if (low && p.y < low.y && views.some((v) => v.id === low.id)) return { id: low.id, node: top };
    if (farViews.length && camera.position.distanceTo(p) > FAR) {
      // out of the window, by the pane it is seen through (merge 018 step 1, from A): the left pane looks at the
      // University, the right one at the canal (canal_house WINDOWS: panes x -1.85..-0.45 and 0.45..1.85 on the window
      // wall, Blender y = 0, which is glTF z = 0)
      const q = camera.position, d = p.clone().sub(q);
      const x0 = d.z < -1e-6 ? q.x + d.x * (-q.z / d.z) : 1;
      const pane = farViews.find((v) => v.id === (x0 < LEFT_PANE_X ? 'university' : 'canal'));
      if (pane) return { id: pane.id, node: null };
      const cost = (x) => Math.abs(x.target.y - p.y);   // a layout with one window view: the one aimed nearest that height
      return { id: farViews.reduce((a, b) => (cost(b) < cost(a) ? b : a)).id, node: null };
    }
    return null;
  }
  // round 022 C: the own case a hot node opens, where its case lives in the node's view (CASE_OF)
  let shown = null, pending = null;   // the case card on show; the own case waiting for its view's arrival (openCase)
  const caseOf = (node) => { const c = CASE_OF[node?.name]; return c && CASES[c]?.in && CASES[c].in === hot.get(node) ? c : null; };
  // where a click leads from here: the window views own no object, so in one of them all of outside is the way back
  // (never the other pane's view: that would be a neighbour, not home)
  const leadOf = (p, obj) => { const to = hotOf(p, obj); return to && !to.node && FAR_VIEWS.includes(current.id) ? null : to; };
  // the screen box of each hot node, for a touch that just misses a small object (TAP_SLOP px)
  const hotBoxes = [...hot.keys()].map((o) => [o, new THREE.Box3().setFromObject(o)]);
  function nearHot(x, y, slop) {
    const r = canvasBox();
    let best = null, bestD = slop;
    for (const [o, b] of hotBoxes) {
      if (hot.get(o) === current.id) continue;
      let l = Infinity, t = Infinity, rr = -Infinity, bb = -Infinity, behind = false;
      for (let i = 0; i < 8; i++) {
        const c = new THREE.Vector3(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).project(camera);
        if (c.z > 1) { behind = true; break; }
        const sx = r.left + (c.x + 1) / 2 * r.width, sy = r.top + (1 - c.y) / 2 * r.height;
        l = Math.min(l, sx); rr = Math.max(rr, sx); t = Math.min(t, sy); bb = Math.max(bb, sy);
      }
      if (behind || rr < 0 || l > innerWidth || bb < 0 || t > innerHeight) continue;
      const d = Math.hypot(Math.max(l - x, 0, x - rr), Math.max(t - y, 0, y - bb));
      if (d < bestD) { bestD = d; best = { id: hot.get(o), node: o }; }
    }
    return best;
  }
  // go(id): every user-driven move. A view gets its own history entry (#id); moving on from one view to another
  // replaces it, so browser Back always lands on the hero (rule 5). Home from a view with an entry is history.back().
  const home = views[0];
  function go(id) {
    if (GATE) return Promise.resolve(current.id);
    dispatchEvent(new CustomEvent('room:skipintro'));
    if (id === home.id) {
      if (history.state?.roomView) history.back();   // popstate then finds the camera already going home
      return goTo(id);
    }
    const url = `${location.pathname}${location.search}#${id}`;
    if (history.state?.roomView) history.replaceState({ roomView: id }, '', url);
    else history.pushState({ roomView: id }, '', url);
    return goTo(id);
  }
  addEventListener('popstate', (ev) => {
    const id = ev.state?.roomView;
    if (id && viewOf(id)) { if (id !== current.id) { if (ev.state.case) pending = ev.state.case; goTo(id); } else if (ev.state.case !== shown && CASES[ev.state.case ?? id]) {
      const was = shown;
      showCase(ev.state.case ?? id);
      // merge 021 (action 7): Back out of an own case gives the focus back to the act that opened it, on the zone's card
      if (CASES[was]?.in === id) caseEl?.querySelector(`[data-case="${was}"]`)?.focus({ preventScroll: true });
    } }
    else if (current !== home && !work?.isOpen()) goTo(home.id);   // goTo sets current at once: a go(home) is not repeated
  });
  // One resolve for the click, the hover (cursor and tag) and the gate's grid (merge 018 step 2, after A): one raycast
  // against a flat list of the baked meshes (non-recursive, built once the layers are up), then the layers' picks, a pick
  // counting only on or in front of that surface. -> { hit: the first baked surface or null, pick: a live.picks entry or null }
  const picks = [];
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const isSolid = (o) => o.isMesh && o.material?.isMeshBasicMaterial && o.material.map && !o.material.transparent;
  let solid = null;
  // the nearest hit, as intersectObjects(list)[0], at a fraction of the cost (panel 018 action 8: the triangle loops were a
  // third of a hover frame at CPU x6): meshes in the order the ray enters their world boxes, triangles only until a hit is
  // nearer than the next box (a box's entry distance bounds every hit inside it). Boxes per call: split parts move.
  const wbox = new THREE.Box3(), entry = new THREE.Vector3(), order = [];
  // A big static mesh (the canal outside: ~29k triangles behind every ray, since its box holds the room) keeps its
  // triangles in runs of CHUNK in index order (gltfpack orders them for locality) with a local box each; a ray tests only
  // the runs whose box it enters. Rebuilt if the mesh ever moves.
  const CHUNK = 256, chunked = new Map(), inv = new THREE.Matrix4(), local = new THREE.Ray();
  const ta = new THREE.Vector3(), tb = new THREE.Vector3(), tc = new THREE.Vector3(), tp = new THREE.Vector3();
  function runsOf(o) {
    const g = o.geometry, idx = g.index, n = idx ? idx.count / 3 : 0;
    if (n < 4 * CHUNK || !g.attributes.position || o.raycast !== THREE.Mesh.prototype.raycast) return null;   // a noPick override stays
    let c = chunked.get(o);
    if (c && c.m.equals(o.matrixWorld)) return c;
    const pos = g.attributes.position, runs = [];
    for (let s = 0; s < n; s += CHUNK) {
      const box = new THREE.Box3(), e = Math.min(n, s + CHUNK);
      for (let i = 3 * s; i < 3 * e; i++) box.expandByPoint(ta.fromBufferAttribute(pos, idx.getX(i)));
      runs.push({ box, s, e });
    }
    chunked.set(o, (c = { m: o.matrixWorld.clone(), runs }));
    return c;
  }
  function hitMesh(o) {
    const c = runsOf(o);
    if (!c) return ray.intersectObject(o, false)[0];
    const pos = o.geometry.attributes.position, idx = o.geometry.index, side = o.material.side;
    local.copy(ray.ray).applyMatrix4(inv.copy(o.matrixWorld).invert());
    let best = null;
    for (const { box, s, e } of c.runs) {
      if (!local.intersectsBox(box)) continue;
      for (let i = 3 * s; i < 3 * e; i += 3) {
        ta.fromBufferAttribute(pos, idx.getX(i)); tb.fromBufferAttribute(pos, idx.getX(i + 1)); tc.fromBufferAttribute(pos, idx.getX(i + 2));
        const p = side === THREE.BackSide ? local.intersectTriangle(tc, tb, ta, true, tp) : local.intersectTriangle(ta, tb, tc, side === THREE.FrontSide, tp);
        if (!p) continue;
        const point = p.clone().applyMatrix4(o.matrixWorld), distance = ray.ray.origin.distanceTo(point);
        if (distance >= ray.near && distance <= ray.far && (!best || distance < best.distance)) best = { distance, point, object: o };
      }
    }
    return best;
  }
  function firstHit(list) {
    order.length = 0;
    for (const o of list) {
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      wbox.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
      if (wbox.containsPoint(ray.ray.origin)) order.push([0, o]);
      else if (ray.ray.intersectBox(wbox, entry)) order.push([entry.distanceTo(ray.ray.origin), o]);
    }
    order.sort((a, b) => a[0] - b[0]);
    let best = null;
    for (const [d, o] of order) {
      if (best && d > best.distance) break;
      const h = hitMesh(o);
      if (h && (!best || h.distance < best.distance)) best = h;
    }
    return best;
  }
  function resolveAt(x, y) {
    const r = canvasBox();
    ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    if (!solid) { solid = []; scene.traverse((o) => { if (isSolid(o)) solid.push(o); }); }
    const hit = firstHit(solid);
    let pick = null;
    const ph = picks.length ? ray.intersectObjects(picks.map((p) => p.object), true) : [];
    if (ph.length && !(hit && ph[0].distance > hit.distance + 0.01)) {
      pick = picks.find((p) => (ph[0].object === p.object || p.object.getObjectById(ph[0].object.id)) && p.accept(ph[0].point)) ?? null;
    }
    return { hit, pick, ray: ray.ray };   // ray: valid until the next resolve (layer-hotspots reads it at once)
  }
  // Where a click leads, the one rule for the click, the cursor, the tags and the gate (round 18 C, spec rules 1-4):
  // { kind: 'go', id, node } another view; 'stay' (its own object, or a layer's pick); 'back' to the hero; 'none' (scenery
  // on the hero). x, y, touch: a tap that just misses one of the hero's small objects still counts (TAP_SLOP).
  const captioned = (hit) => { const n = hit && topOf(hit.object)?.name; return !!n && !hot.has(topOf(hit.object)) && !!state.layers?.hotspots?.list?.().includes(n); };
  function intentAt({ hit, pick }, x, y, touch) {
    let to = hit ? leadOf(hit.point, hit.object) : null;
    // merge 021 (panel 021 action 8): a tap on an object with its own card (the notebook before the chamber) is that card's,
    // never the slop of the hot object behind it
    if (!to && touch && inRoom() && !captioned(hit)) to = nearHot(x, y, TAP_SLOP);
    // panel 018 action 2: in a close-up, outside means back, not the neighbour: the furniture's own view (the bench) and
    // the window are no destinations from there; another object's view still is
    if (to && to.id !== current.id && !inRoom() && (FURNITURE.includes(to.id) || !to.node)) to = null;
    const own = to?.node && caseOf(to.node);
    if (own && own !== shown) return { kind: 'go', id: to.id, node: to.node, case: own, pick: null };
    // action 3: a layer's pick fires only where the camera ends with its effect in frame: here (on the view's own object,
    // or on one that leads nowhere), or in the view the click flies to when that view is the pick's own; never on a
    // step back (B's Geiger toggle + step back)
    const pv = pick ? hot.get(topOf(pick.object)) ?? null : null;
    if (to && to.id !== current.id) return { kind: 'go', id: to.id, node: to.node, pick: pick && pv === to.id ? pick : null };
    if (to && !pick && ACT[current.id]) return { kind: 'act', id: current.id };
    if (pick && (to || pv === null || pv === current.id)) return { kind: 'stay', pick };
    if (to) return { kind: 'stay' };
    // round 019 A: in the room (the hero or a standpoint) the bare floor walks to the standpoint nearest the spot; in a
    // close-up the floor stays outside, the way back (action 2)
    if (!pick && hit && inRoom() && stepOf) { const s = stepOf(hit, current, camera.position); if (s) return { kind: 'walk', id: s.id, at: s.at, pos: s.pos ?? null }; }
    return inRoom() ? { kind: 'none' } : { kind: 'back', id: home.id };
  }
  const fire = (p) => { p.onPick(); dispatchEvent(new CustomEvent('room:pick', { detail: p.object.name })); needsRender = true; };
  // a click that hardly moved, at (x, y)
  function clickAt(x, y, touch) {
    if (tween) return;
    const r = resolveAt(x, y);
    if (GATE) { if (r.pick) fire(r.pick); return; }     // ?gate: the layers' picks work, the camera stays (live gates)
    const it = intentAt(r, x, y, touch);
    if (it.pick) fire(it.pick);
    if (tween) return;                          // the layer's own pick moved the camera (the C64, the laptop)
    if (it.case) openCase(it.case);
    else if (it.kind === 'walk' && it.pos) walkTo(it.pos);
    else if (it.kind === 'go' || it.kind === 'back' || it.kind === 'walk') go(it.id);
    else if (it.kind === 'act') { ACT[it.id](state.layers ?? {}); needsRender = true; }
  }
  // the cursor tells the truth (rule 1), from the one intent: pointer where a click flies somewhere or acts, a step where it
  // walks (round 019 A), zoom-out where it steps back, grab (drag to look) where it does nothing
  const cursorOf = (it) => CURSOR[it.pick ? 'pick' : it.kind] ?? CURSOR.none;
  // round 021 D: a free walk to `pos` (eye height, cleared by layer-walk.js). round 022 D (the arrival's premise, settled):
  // the head turns to the nearest hot object within ARRIVE.cone of the way it walked when that frame keeps ARRIVE.floor of
  // the floor and no near wall at its centre; else it keeps the travel direction (a body faces where it went), and turns
  // off it only to miss a wall closer than FACE_ROOM m. free_move_gate holds every hero walk and the 5th percentile of 200
  // random walks to >= ARRIVE.floor
  function walkTo(pos) {
    const t0 = performance.now();
    const from = camera.position, gaze = controls.target.clone().sub(from);
    const B = walkNav?.bounds(), sh = B?.shell;
    // room ahead along d (on the plan): to the shell, or to the first tall footprint (a wall-like node: the chimney breast, the
    // bookcase, the floor lamp; its own box, not the clearance), whichever comes first
    const walls = (B?.obstacles ?? []).filter((o) => o.bottom < 0.05 && o.top >= B.tall[0]).map((o) => ({ name: o.name, x0: o.x0 + o.r, x1: o.x1 - o.r, z0: o.z0 + o.r, z1: o.z1 - o.r }));
    const run = (d, skip = null) => { if (!sh) return Infinity; let t = Infinity;
      if (d.x) t = Math.min(t, ((d.x > 0 ? sh.x1 : sh.x0) - pos.x) / d.x);
      if (d.z) t = Math.min(t, ((d.z > 0 ? sh.z1 : sh.z0) - pos.z) / d.z);
      for (const w of walls) {
        if (w.name === skip) continue;
        let a = 0, b = Infinity;
        for (const [p, v, lo, hi] of [[pos.x, d.x, w.x0, w.x1], [pos.z, d.z, w.z0, w.z1]]) {
          if (Math.abs(v) < 1e-9) { if (p < lo || p > hi) { a = Infinity; break; } continue; }
          let u = (lo - p) / v, q = (hi - p) / v; if (u > q) [u, q] = [q, u];
          a = Math.max(a, u); b = Math.min(b, q);
        }
        if (a <= b && a < t) t = a;
      }
      return t; };
    const deg = THREE.MathUtils.degToRad;
    const way = new THREE.Vector3(pos.x - from.x, 0, pos.z - from.z);   // the travel direction (lastArrival reports it)
    if (way.lengthSq() < 1e-8) way.set(gaze.x, 0, gaze.z);
    way.normalize();
    // merge 022: every turn is measured from the pre-walk gaze, not the travel direction (panel 022: D's travel-relative
    // turns of 135-180 deg faced the door on 6 of 8 desktop hero walks)
    const look = new THREE.Vector3(gaze.x, 0, gaze.z);
    if (look.lengthSq() < 1e-8) look.copy(way);
    look.normalize();
    let r = Math.max(1.5, Math.min(4, gaze.length()));
    let pitch = deg(ARRIVE.tilt[0]);
    // the poses to try, best first: each hot object within ARRIVE.cone of the pre-walk gaze (nearest first), far enough to
    // frame, with room behind it and seen from a walker's pitch; then that gaze kept, a little lower; then turned off it by
    // 30 and 60 deg. Nothing past ARRIVE.cone: a walk never turns you round (panel 022 merge plan step 2)
    const up = new THREE.Vector3(0, 1, 0), c = new THREE.Vector3(), near = [];
    for (const [o, box] of hotBoxes) {
      box.getCenter(c);
      const v = new THREE.Vector3(c.x - pos.x, 0, c.z - pos.z), d = v.length();
      if (d < ARRIVE.near || d > ARRIVE.far || run(v.normalize(), o.name) < FACE_ROOM) continue;
      const p = Math.atan2(pos.y - c.y, d);
      if (p < deg(ARRIVE.tilt[0]) || p > deg(ARRIVE.hotPitch)) continue;
      const q = Math.min(p, deg(ARRIVE.tilt.at(-1)));   // the object above centre when it lies lower than the cap
      if (v.angleTo(look) <= deg(ARRIVE.cone)) near.push({ d, way: v, pitch: q, r: d / Math.cos(q), name: o.name, node: o });
    }
    // one rule (Ruud 2026-10-23): each direction (a hot object within the cone, the gaze kept, then 30 and 60 deg off it)
    // at the first tilt that keeps ARRIVE.floor of the frame on walkable floor, 12 deg down, 16 or 20 only if needed
    const turns = (list) => list.flatMap((turn) => { const w = look.clone().applyAxisAngle(up, deg(turn)), wall = run(w) < FACE_ROOM;
      return ARRIVE.tilt.map((t) => ({ way: w, pitch: deg(t), r, name: null, node: null, wall })); });
    const nearest = (l) => l.sort((x, y) => x.d - y.d).slice(0, ARRIVE.hot);
    const tries = [...nearest(near), ...turns([0, 30, -30, 60, -60])];
    // what a pose frames: the share of the frame's rays a click would walk on (stepOf, the click's own test, as hotMap
    // counts; D's floorAhead wanted the first straight step clear and so read 0 against furniture while hotMap found 19 %)
    // and the share of the centre ninth's rays on a wall (WALL_NODES) nearer than FACE_ROOM
    const probe = { id: spot.id }, cells = new Map();
    const frameOf = (t) => {
      const f = t.way.clone().multiplyScalar(Math.cos(t.pitch)).setY(-Math.sin(t.pitch)).normalize();
      const rt = f.clone().cross(up).normalize(), u = rt.clone().cross(f);
      const th = Math.tan(deg(home.fov) / 2), ta = th * camera.aspect;
      const hit = (x, y) => { ray.ray.set(pos, f.clone().addScaledVector(rt, x * ta).addScaledVector(u, y * th).normalize()); return solid ? firstHit(solid) : null; };
      // the floor first, by the click code's rays (the meshes; a box test in iteration 2 hid the floor past the table and
      // turned 9 of 12 hero walks round), on the samples, stopped as soon as the share is decided either way; then, for a
      // pose that keeps the floor, the wall by 9 rays
      let wall = 0, floor = 0;
      if (!samples.length || !stepOf) return { floor: 0, wall: 0 };
      const all = 2 * samples.length, need = Math.ceil(ARRIVE.pick * all);   // the upper half counted as no floor
      for (let k = 0; k < samples.length && floor < need && floor + samples.length - k >= need; k++) {
        const [x, y] = samples[k], d = f.clone().addScaledVector(rt, x * ta).addScaledVector(u, y * th).normalize();
        if (d.y >= -1e-6) continue;   // above the horizon: no floor
        const t = -pos.y / d.y, px = pos.x + d.x * t, pz = pos.z + d.z * t;   // where it meets the floor plane: outside the
        if (sh && (px < sh.x0 - 0.3 || px > sh.x1 + 0.3 || pz < sh.z0 - 0.3 || pz > sh.z1 + 0.3)) continue;   // room, no walk
        const h = hit(x, y); if (!h) continue;
        // the click's own test once per 10 cm floor cell a walk (poses and tilts look at the same boards): the pick's cost
        const key = `${Math.round(h.point.x * 10)},${Math.round(h.point.z * 10)},${h.point.y > 0.06 ? 1 : 0}`;
        let ok = cells.get(key); if (ok === undefined) { ok = !!stepOf(h, probe, pos); cells.set(key, ok); }
        if (ok) floor++; }
      if (floor < need) return { floor: floor / all, wall: 0 };
      for (const y of [-1 / 3, 0, 1 / 3]) for (const x of [-1 / 3, 0, 1 / 3]) {
        const h = hit(x, y); if (h && h.distance < FACE_ROOM && WALL_NODES.has(topOf(h.object)?.name)) wall++; }
      return { floor: ARRIVE.pick, wall: wall / 9 };
    };
    // the floor's samples, once a walk: a grid over the frame, its lower half only (a walker's pitch puts the floor
    // there; the upper half counts as none, so the share is a floor under the gate's), bottom row first, less what the page
    // covers (a card, the caption: no click, as in hotMap)
    const samples = [];
    // merge 022: 4 x 2 (was 6 x 3): every pose and tilt casts its own rays, and 15 poses at 18 rays took 116 ms at CPU x6
    for (let j = 0; j < 2; j++) for (let i = 0; i < 4; i++) {
      const x = -0.75 + i * 0.5, y = -0.75 + j * 0.5;
      if (document.elementFromPoint((x + 1) / 2 * innerWidth, (1 - y) / 2 * innerHeight) === renderer.domElement) samples.push([x, y]); }
    let pick = null;
    const log = [];
    for (const t of tries) {
      if (t.wall) continue;
      const fr = frameOf(t), ok = fr.floor >= ARRIVE.pick && fr.wall <= ARRIVE.wall;
      log.push([t.name, Math.round(THREE.MathUtils.radToDeg(t.way.angleTo(look))), +fr.floor.toFixed(3), +fr.wall.toFixed(2), ok]);
      if (ok) { pick = t; break; }
    }
    // none passes: the pre-walk gaze kept (the chair's fallback), not the pose with the most floor somewhere round you
    pick ??= tries.find((t) => !t.name && t.pitch >= deg(ARRIVE.tilt.at(-1)) - 1e-6) ?? tries.find((t) => !t.name);
    lastArrival = { travel: +THREE.MathUtils.radToDeg(Math.atan2(way.x, -way.z)).toFixed(1), turned: Math.round(THREE.MathUtils.radToDeg(pick.way.angleTo(look))), framed: pick.name, tried: log,
      ms: +(performance.now() - t0).toFixed(1) };   // the pick's main-thread cost (perf.py --motion: under a long task)
    way.copy(pick.way); pitch = pick.pitch; r = pick.r;
    arrivedAt = pick.name;
    spot.pos.copy(pos);
    spot.target.copy(pos).addScaledVector(way, r * Math.cos(pitch)).add(new THREE.Vector3(0, -r * Math.sin(pitch), 0));
    spot.fov = home.fov;
    return go(spot.id);
  }
  // a pan or a key step moved you in the room: where you stand is now the spot (#walk, Esc and the pill go home); the
  // camera does not move, only the bookkeeping (no arrival animation)
  function settleSpot() {
    if (tween || !walkNav || !inRoom() || controls.target.distanceTo(current.target) < SETTLE_M) return;
    spot.pos.copy(camera.position); spot.target.copy(controls.target); spot.fov = baseFov;
    arrivedAt = null;
    if (current === spot) { setLimits(spot.pos, spot.target); return; }
    const url = `${location.pathname}${location.search}#${spot.id}`;
    if (history.state?.roomView) history.replaceState({ roomView: spot.id }, '', url);
    else history.pushState({ roomView: spot.id }, '', url);
    current = spot;
    syncNav();
    setLimits(spot.pos, spot.target);
    onArrive(spot.id);
  }
  // the pan stays in the room: each change is checked against the clearance table; what would leave it is undone (camera
  // and gaze together, so the turn is untouched). Orbiting near a wall slides along it the same way
  const okEye = new THREE.Vector3();
  let settleT = 0;
  // the eye's last good place is taken where a drag starts (the camera may stand anywhere the code put it: the intro, a
  // view); from there a move may only stay clear, or get clearer (layer-walk.js pathClear)
  let dragged = false;
  const okTgt = new THREE.Vector3();
  let panned = false;               // this drag moved the gaze's centre (a pan), not only turned round it
  controls.addEventListener('start', () => { dragged = true; panned = false; rise = null; okEye.copy(camera.position); okTgt.copy(controls.target);
    dispatchEvent(new Event('room:drag')); });   // layer-tags.js: the edge tags go while the camera moves
  controls.addEventListener('change', () => {
    if (!walkNav || tween || !dragged || !inRoom()) return;
    const p = camera.position;
    // a turn (the gaze's centre stays) is the view's own orbit cone, as before round 021: the gaze is never slid (gate check:
    // a left drag to the hero's right limit slid the gaze 2.4 m when it was). merge 021 (panel 021 action 3): but the eye
    // stops where the turn would take it further out of the shell or into a footprint (two left drags put it 0.173 m out)
    const turned = controls.target.distanceToSquared(okTgt) < 1e-10;
    if (turned && walkNav.depth(p) > walkNav.depth(okEye) + 1e-6) p.copy(okEye);
    else if (!turned && p.distanceToSquared(okEye) > 1e-12) {
      panned = true;
      const q = walkNav.clamp(okEye, p);
      // the free eye's band (layer-walk.js FREE_BAND): a pan never lifts it past a standing eye; a place below the band (the
      // seat) may only rise
      const [lo, hi] = walkNav.freeBand ?? [-Infinity, Infinity];
      q.y = THREE.MathUtils.clamp(q.y, Math.min(lo, okEye.y), Math.max(hi, okEye.y));
      if (q.distanceToSquared(p) > 1e-12) { const d = q.sub(p); camera.position.add(d); controls.target.add(d); }
    }
    // merge 021 (panel 021 action 1, the UX blocker): the damping tail's 'change' fires every frame for seconds while the eye
    // creeps by microns (probe: 1.35 m pan, still +3 mm at 1.2 s), and each one restarted the timer, so a pan never settled;
    // a key step settles directly, which is why W worked. Only a change that moves the eye SETTLE_MOVE m restarts it
    if (p.distanceTo(okEye) > SETTLE_MOVE || !settleT) { clearTimeout(settleT); settleT = setTimeout(() => { settleT = 0; settleSpot(); }, 200); }
    okEye.copy(camera.position); okTgt.copy(controls.target);
  });
  // and the release itself settles 250 ms on (the pill, #walk and Esc are there while the tail still glides; the tail's
  // later changes only move the spot along, settleSpot's `current === spot` branch)
  controls.addEventListener('end', () => {
    if (!walkNav || !dragged || !inRoom()) return;
    setTimeout(settleSpot, 250);
    // merge 021 (action 2): a pan's release eases the eye back to a standing eye (layer-walk.js EYE) over RISE_MS, camera and
    // gaze together, beside the damping tail; under reduced motion at once
    if (panned && Math.abs(camera.position.y - walkNav.eye) > 0.01) rise = { dy: walkNav.eye - camera.position.y, done: 0, t0: performance.now() };
    setTimeout(() => dispatchEvent(new Event('room:still')), 900);   // the tail has mostly run out: edge tags again (hero)
  });
  // the release's ease to eye height (or null)
  let rise = null;
  function stepRise(now) {
    const k = reduceMotion.matches ? 1 : Math.min(1, (now - rise.t0) / RISE_MS);
    const want = rise.dy * easePos(k), inc = want - rise.done;
    rise.done = want;
    camera.position.y += inc; controls.target.y += inc; okEye.y += inc;
    needsRender = true;
    if (k >= 1) { rise = null; settleSpot(); }
  }
  const syncPan = () => { controls.enablePan = !!walkNav && inRoom() && !GATE; okEye.copy(camera.position); };
  // the one place the room's bound is enforced, every frame outside a move (gate runs 3-5: per-input clamps alone let a
  // pan's damping tail and a key step meet past a footprint's edge): in the room the eye may not get further out of bounds
  // than the last frame it was in; a frame that would is undone, camera and gaze together
  // A turn (the gaze's centre unchanged: the orbit cone, a dolly) is exempt, as above
  const safeEye = new THREE.Vector3(), safeTgt = new THREE.Vector3();
  let safeDepth = Infinity;
  const resetGuard = (p) => { safeEye.copy(p); safeTgt.copy(controls.target); safeDepth = walkNav ? walkNav.depth(p) : Infinity; };
  function guardEye() {
    if (!walkNav || !inRoom()) { safeDepth = Infinity; return; }
    if (safeDepth === Infinity) { resetGuard(camera.position); return; }
    const d = walkNav.depth(camera.position);
    if (controls.target.distanceToSquared(safeTgt) < 1e-10) { safeEye.copy(camera.position); safeDepth = d; return; }
    if (d > safeDepth + 1e-6) {
      const off = safeEye.clone().sub(camera.position);
      camera.position.add(off); controls.target.add(off); camera.lookAt(controls.target);
      okEye.copy(camera.position);
      if (glide) glide = null;
      needsRender = true;
    } else { safeEye.copy(camera.position); safeDepth = d; }
    safeTgt.copy(controls.target);
  }
  // a key step: KEY_STEP m along the floor (forward = the gaze on the plan), glided over KEY_MS, cleared first
  let glide = null;
  function keyStep(fwd, side) {
    const g = controls.target.clone().sub(camera.position).setY(0);
    if (g.lengthSq() < 1e-8) return;
    g.normalize();
    const right = new THREE.Vector3(-g.z, 0, g.x);
    const want = camera.position.clone().addScaledVector(g, fwd * KEY_STEP).addScaledVector(right, side * KEY_STEP);
    const to = walkNav.clamp(camera.position, want), d = to.sub(camera.position);
    if (d.lengthSq() < 1e-8) return;
    if (reduceMotion.matches) { camera.position.add(d); controls.target.add(d); camera.lookAt(controls.target); okEye.copy(camera.position); dragged = true; settleSpot(); controls.update(); needsRender = true; return; }
    dispatchEvent(new Event('room:drag'));
    glide = { p0: camera.position.clone(), t0: controls.target.clone(), d, s: performance.now() };
  }
  function stepGlide(now) {
    const k = Math.min(1, (now - glide.s) / KEY_MS), e = 1 - (1 - k) ** 3;
    camera.position.copy(glide.p0).addScaledVector(glide.d, e);
    controls.target.copy(glide.t0).addScaledVector(glide.d, e);
    camera.lookAt(controls.target);
    okEye.copy(camera.position);
    needsRender = true;
    // the limits follow the new pose before OrbitControls applies them (gate run 2: an update under the old view's azimuth
    // clamp swung the eye 12 mm into the bookcase); from here on its changes are checked like a drag's
    if (k >= 1) { glide = null; dragged = true; settleSpot(); controls.update(); }
  }
  // the physical way back: pull out (wheel past the view's far limit) steps back into the room
  let pull = 0, pullT = 0;
  renderer.domElement.addEventListener('wheel', (ev) => {
    if (GATE || tween || current === home || ev.deltaY <= 0) return;
    if (camera.position.distanceTo(controls.target) < controls.maxDistance * 0.98) { pull = 0; return; }
    clearTimeout(pullT); pullT = setTimeout(() => { pull = 0; }, 500);
    if ((pull += ev.deltaY) > PULL_PX) { pull = 0; go(home.id); }
  }, { passive: true });

  const q = new THREE.Quaternion(), qI = new THREE.Quaternion(), dir = new THREE.Vector3(), eye = new THREE.Vector3(), tgt = new THREE.Vector3();
  function stepTween(now) {
    const { from, to, t0, ms, d0, r0, r1, turn, turnBy, first, walk, via, legs, metres, resolve } = tween;
    const eyes = walk ? easeWalk : easePos;
    const k = Math.min(1, (now - t0) / ms);
    const kt = Math.min(1, k / turnBy);
    // the eyes: a sine over the move, or, turning first, over what is left once the turn is mostly done
    const e = first ? eyes(Math.max(0, (k - MOVE.walkFrom) / (1 - MOVE.walkFrom))) : eyes(k);
    const et = first || walk ? easePos(kt) : ease(kt);
    if (!via.length) eye.copy(from.pos).lerp(to.pos, e);
    else {   // along the legs by arc length
      let s = e * metres, i = 0;
      const pts = [from.pos, ...via, to.pos];
      while (i < legs.length - 1 && s > legs[i]) { s -= legs[i]; i++; }
      eye.copy(pts[i]).lerp(pts[i + 1], legs[i] ? Math.min(1, s / legs[i]) : 1);
    }
    dir.copy(d0).applyQuaternion(q.slerpQuaternions(qI, turn, et));
    if (k >= 1) tgt.copy(to.target); else tgt.copy(eye).addScaledVector(dir, r0 + (r1 - r0) * e);
    place(k >= 1 ? to.pos : eye, tgt, from.fov + (to.fov - from.fov) * e, from.shift.map((s, i) => s + (to.shift[i] - s) * e));
    controls.target.copy(tgt);
    if (k >= 1) {
      tween = null;
      setLimits(to.pos, to.target);
      resetGuard(to.pos);
      controls.enabled = !GATE;
      controls.update();
      onArrive(to.id);
      resolve(to.id);
    }
    needsRender = true;
  }

  // The nav (panel 015 action 6): the work views first, marked with the accent, then the room's views behind
  // "More views" (desktop: a second row above, opened on demand; phone: one sideways strip, everything in it).
  const nav = document.querySelector('.views');
  const buttons = new Map();
  let more = null, roomRow = null, back = null;
  function syncNav() {
    for (const [id, b] of buttons) b.setAttribute('aria-pressed', String(id === current.id));
    if (back) back.hidden = current === views[0];
    root.classList.toggle('away', current !== views[0]);
    // a room view (not the hero) is current: keep its row open, so its pressed chip shows
    if (roomRow && current !== views[0] && roomRow.contains(buttons.get(current.id))) setMore(true);
  }
  function setMore(open) {
    if (!more) return;
    more.setAttribute('aria-expanded', String(open));
    nav.classList.toggle('more-open', open);
  }
  // the way home, shown only away from the hero, named for where it goes (rule 4c); bottom centre, out of the chips,
  // which are the keyboard's road now (index.html: visually hidden until focused)
  back = Object.assign(document.createElement('button'), { type: 'button', className: 'back', hidden: true });
  back.innerHTML = 'Back to the room<span class="esc"> · Esc</span>';
  back.addEventListener('click', () => go(home.id));
  document.body.appendChild(document.createElement('div')).appendChild(back);   // not body > button: those join .controls
  if (nav) {
    const group = (cls, label) => { const g = document.createElement('div'); g.className = cls; g.setAttribute('role', 'group'); g.setAttribute('aria-label', label); return g; };
    const workRow = group('work-row', 'Work');
    roomRow = group('room-row', 'The room');
    roomRow.id = 'room-views';
    const chip = (v) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = v.label;
      b.dataset.view = v.id;
      b.addEventListener('click', () => go(v.id));
      buttons.set(v.id, b);
      return b;
    };
    for (const id of WORK_ORDER) { const v = views.find((x) => x.id === id); if (v) workRow.appendChild(chip(v)).classList.add('w'); }
    for (const v of views) if (!WORK_ORDER.includes(v.id)) roomRow.appendChild(chip(v));
    more = document.createElement('button');
    more.type = 'button';
    more.className = 'more';
    more.textContent = 'More views';
    more.setAttribute('aria-controls', roomRow.id);
    more.addEventListener('click', () => setMore(more.getAttribute('aria-expanded') !== 'true'));
    workRow.appendChild(more);
    nav.append(workRow, roomRow);
    setMore(false);
    syncNav();
    // round 019 (panel 018 action 13): the chips stay the keyboard's road (shown on focus), and one quiet "Views" pill in
    // the controls corner opens them for a visitor who wants a list. Open: focus the first chip; Esc, a chip or a press
    // outside closes it. [check] label, notes/captions.md
    const listBtn = Object.assign(document.createElement('button'), { type: 'button', className: 'views-btn', textContent: 'Views' });
    listBtn.setAttribute('aria-controls', nav.id);
    listBtn.setAttribute('aria-expanded', 'false');
    const setList = (open, focus = false) => {
      listBtn.setAttribute('aria-expanded', String(open));
      nav.classList.toggle('open', open);
      if (open && focus) nav.querySelector('button')?.focus();
    };
    listBtn.addEventListener('click', () => setList(!nav.classList.contains('open'), true));
    // a chip picked from the opened list: the list folds and focus goes back to the pill (else the focused chip keeps it up)
    nav.addEventListener('click', (ev) => { if (ev.target.closest('button[data-view]') && nav.classList.contains('open')) { setList(false); listBtn.focus(); } });
    addEventListener('pointerdown', (ev) => { if (nav.classList.contains('open') && !nav.contains(ev.target) && !listBtn.contains(ev.target)) setList(false); }, true);
    addEventListener('keydown', (ev) => {   // before the global Esc (back to the overview), which skips a handled event
      if (ev.key !== 'Escape' || !nav.classList.contains('open')) return;
      ev.preventDefault();
      setList(false);
      listBtn.focus();
    }, true);
    document.querySelector('.controls')?.prepend(listBtn);
  }

  await Promise.all(loads);
  const layers = LIVE ? await mountLayers({ THREE, scene, camera, renderer, byName, gate: GATE, reduceMotion, picks,
    params, root, view: () => current.id, render: () => { needsRender = true; }, clickAt, resolveAt, intentAt, cursorOf,
    moving: () => !!tween, go: (id, ...a) => (CASES[id]?.in ? openCase(id) : go(id, ...a)), panning: () => controls.enablePan, where: hotOf, glow, intent: (x, y, touch) => intentAt(resolveAt(x, y), x, y, touch), cardOf: (id) => (!CASES[id] && CAPTION_OF[id]) || null,
    hot: (o) => caseOf(topOf(o)) ?? hot.get(topOf(o)) ?? null, label: (id) => viewOf(id)?.label ?? OWN_TAG[id] ?? id, own: (id) => !!OWN_TAG[id], home: home.id, inRoom: () => inRoom(),
    // round 022 D: CSS px a metre at 1 m through the hero's lens at this viewport (portrait-widened as fitFov does)
    pxPerMetre: () => { const a = innerWidth / innerHeight, t = Math.tan(THREE.MathUtils.degToRad(home.fov) / 2) * (a >= heroAspect ? 1 : Math.min(heroAspect / a, PORTRAIT_MAX));
      return innerHeight / (2 * t); },
    fovOf: lensToFov, heroPos: home.pos.clone(), heroTarget: home.target.clone(), stands: () => stands, nav: () => walkNav, cursors: CURSOR,
    addStands: (list, step, table) => { stands.push(...list.map((s) => ({ ...s, shift: [0, 0], stand: true }))); stepOf = step; walkNav = table ?? null; } }) : [];
  syncPan();
  for (const l of layers) l.onView?.(current.id);
  // panel 019 action 10: the hit list and the canal's chunk boxes are built here, at load (the layers' split parts exist
  // now), not on the first hover; the first move of a sweep then pays only for its rays
  scene.updateMatrixWorld(true);
  solid = []; scene.traverse((o) => { if (isSolid(o)) solid.push(o); });
  for (const o of solid) runsOf(o);
  // layer toggles (Lidar, ...) join the page's control cluster instead of stacking on their own
  const cluster = document.querySelector('.controls');
  if (cluster) for (const b of document.querySelectorAll('body > button')) cluster.appendChild(b);
  // the phone caption's right gutter follows the cluster's real width (index.html --controls-w)
  const gutter = () => { if (cluster) root.style.setProperty('--controls-w', `${Math.ceil(cluster.getBoundingClientRect().width) + 10}px`); };
  gutter(); addEventListener('resize', gutter);
  // the bottom-left stack (index.html): caption, chips above it, prompt and toast above those; the heights are live
  const capEl = document.querySelector('.caption');
  const stack = () => {
    if (capEl) root.style.setProperty('--cap-h', `${Math.ceil(capEl.getBoundingClientRect().height)}px`);
    if (nav) root.style.setProperty('--nav-h', `${Math.ceil(nav.getBoundingClientRect().height)}px`);
  };
  stack();
  if (typeof ResizeObserver === 'function') { const ro = new ResizeObserver(stack); for (const e of [capEl, nav]) if (e) ro.observe(e); }
  else addEventListener('resize', stack);
  renderer.render(scene, camera);
  root.classList.add('ready');

  // Render on demand: idle frames cost nothing on a phone. Layers advance their own clocks by the
  // frame time, capped, so a hidden tab (no frames) pauses them and nothing catches up on return.
  // Ambient animation (a layer's update() returning true: rain, chamber trails, the terminal) draws
  // at most every AMBIENT_MS; input, the tween and live.render() (the intro's camera) stay at full rate.
  const AMBIENT_MS = 30;          // ~30 Hz (notes/perf.md); 30, not 33.3, so 60 Hz rAF jitter keeps every 2nd frame
  let last = performance.now(), lastDraw = 0, ambient = false, frameNow = 0;   // frameNow: the clock the camera was last placed by (__room.camera().t)
  renderer.setAnimationLoop((now) => {
    frameNow = now;
    const dt = Math.min(0.25, Math.max(0, (now - last) / 1000));
    last = now;
    if (tween) stepTween(now);
    else if (glide) stepGlide(now);
    else if (controls.enabled && controls.update()) needsRender = true;
    if (rise && !tween && !glide) stepRise(now);
    if (!tween) guardEye();
    // panel 018 action 7: every layer's DOM reads (read()) before any layer writes (update()): a frame forces no layout
    if (!document.hidden) { for (const l of layers) l.read?.(); for (const l of layers) if (l.update(dt)) ambient = true; }
    if (needsRender || (ambient && now - lastDraw >= AMBIENT_MS)) {
      renderer.render(scene, camera);
      needsRender = ambient = false;
      lastDraw = now;
    }
  });
  const api = Object.fromEntries(layers.map((l) => [l.name, l.api]));
  const caseEl = document.querySelector('.case');
  let relabel = () => {};
  addEventListener('room:pick', () => relabel());   // a pick in the scene (the polarizer itself) changes the act's words too
  // round 021 C: an own case opens on its zone's view: in place when the camera is there, else after the flight there
  // (onArrive takes `pending`). Its hash replaces the view's entry, so Back still lands on the hero (rule 5)
  // shown, pending: declared with caseOf (round 022 C: the click code reads `shown` before this point runs)
  function openCase(id) {
    const c = CASES[id];
    if (!c?.in || !viewOf(c.in)) return null;
    if (current.id !== c.in || tween) { pending = id; return current.id === c.in ? null : go(c.in); }   // already flying there: wait
    history.replaceState({ roomView: c.in, case: id }, '', `${location.pathname}${location.search}#${id}`);
    showCase(id);
    // merge 021 (panel 021 action 7): the card the visitor asked for takes the focus (its title, tabindex -1), so a keyboard
    // or a screen reader lands in it; a pointer's click shows no ring there
    caseEl?.querySelector('h2')?.focus({ preventScroll: true });
    // the visitor asked for this card: on the phone its sheet opens whole, so the figures are not under the peek's fold
    if (matchMedia('(max-width: 640px)').matches) caseEl?.querySelector('.grip')?.click();
    said.textContent = `Case: ${c.t}`;
    return Promise.resolve(id);
  }
  function showCase(id) {
    shown = CASES[id] ? id : null;
    relabel = () => {};
    const cap = !CASES[id] && CAPTION_OF[id] ? api.hotspots?.caption?.(CAPTION_OF[id]) : null;
    // step 9 (from B): the caption's real link is the card's outbound proof, marked ↗
    const place = PLACE_CARDS[id] ?? viewOf(id)?.card;
    const c = CASES[id] ?? (cap && { k: cap.kicker, t: cap.title, b: cap.body, acts: [...(CAPTION_ACTS[id] ?? []), ...(cap.more ? [{ label: cap.more.label, href: cap.more.href, ext: true }] : [])] })
      ?? (place && id !== home.id ? { k: 'In the room', t: viewOf(id).label, b: place, place: true } : null);   // [check] kicker
    root.classList.toggle('has-case', !!c);
    if (!caseEl) return;
    caseEl.replaceChildren();
    if (!c) return;
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };
    caseEl.classList.remove('open');
    // phone: a bottom sheet at ~25% height; the grip (or a tap on the body) opens it (index.html; hidden on desktop)
    const grip = Object.assign(el('button', 'grip'), { type: 'button' });
    grip.setAttribute('aria-label', 'Show the whole case');
    // panel 020 action 12: the grip is the phone's (0x0 on desktop, index.html), so a keyboard on desktop never lands on it
    if (!matchMedia('(max-width: 640px)').matches) grip.tabIndex = -1;
    grip.setAttribute('aria-expanded', 'false');
    const toggle = () => grip.setAttribute('aria-expanded', String(caseEl.classList.toggle('open')));
    grip.addEventListener('click', toggle);
    const body = el('p', 'b', c.b);
    body.addEventListener('click', toggle);
    const h = el('h2', '', c.t);
    h.tabIndex = -1;
    caseEl.append(grip, el('p', 'k', c.k), h, body);
    // panel 020 action 4: on touch the offer is the first act and the acts sit under the title, inside the peek sheet's
    // 25% (the Projection mapping body pushed it out of the sheet); with a mouse it stays the last act, under the body
    const first = matchMedia('(pointer: coarse)').matches;
    if (c.acts?.length) {
      const row = el('div', 'acts');
      const live = [];                 // acts whose words follow a layer's state (the polarizer): re-said after each act
      const say = (a) => (typeof a.label === 'function' ? a.label(api) : a.label);
      // a link's ↗ is index.html's .case .acts a::after (the label's own doubled it); the offer has none
      const mails = c.acts.filter((x) => x.mail), rest = c.acts.filter((x) => !x.mail);
      for (const a of first ? [...mails, ...rest] : [...rest, ...mails]) {   // the offer last (action 9), first on touch
        const b = a.href ? Object.assign(el('a', a.mail ? 'mail' : '', say(a)), { href: a.href }, a.ext ? { target: '_blank', rel: 'noopener' } : {})
          : Object.assign(el('button', '', say(a)), { type: 'button' });
        if (a.vh) b.appendChild(el('span', 'vh', a.vh));
        if (typeof a.label === 'function') live.push([b, a]);
        if (a.run) b.addEventListener('click', () => { a.run(api); needsRender = true; relabel(); });
        if (a.case) { b.dataset.case = a.case; b.addEventListener('click', () => openCase(a.case)); }
        row.appendChild(b);
      }
      relabel = () => { for (const [b, a] of live) b.textContent = say(a); };
      if (first) caseEl.insertBefore(row, body); else caseEl.appendChild(row);
    }
  }
  // every arrival is announced, with or without a case card (wave 5); visually hidden
  const said = Object.assign(document.createElement('p'), { className: 'view-status' });
  said.setAttribute('role', 'status');
  said.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;margin:0';
  document.body.appendChild(said);
  // the one-time hint, on the first arrival away from the hero (D's mechanism, C's copy); a blocked storage shows it each time
  const hintEl = Object.assign(document.createElement('p'), { className: 'nav-hint' });
  hintEl.setAttribute('role', 'status');
  document.body.appendChild(hintEl);
  const coarse = matchMedia('(pointer: coarse)');
  // the room's canvas is a focus stop (the arrows and WASD step only while it or the page has focus), named, and described
  // by the move hint's words, so a screen reader has them without the toast
  const canvasEl = renderer.domElement;
  const how = Object.assign(document.createElement('p'), { id: 'room-how', textContent: coarse.matches ? MOVE_HINT.touch : MOVE_HINT.mouse });
  how.style.cssText = said.style.cssText;
  document.body.appendChild(how);
  canvasEl.tabIndex = 0;
  canvasEl.setAttribute('aria-label', 'The room, in 3D');   // [check]
  canvasEl.setAttribute('aria-describedby', how.id);
  if (walkNav) {
    addEventListener('room:floor', () => navHint(MOVE_HINT), { once: true });
    if (coarse.matches) {
      if (root.dataset.intro === 'playing') addEventListener('room:intro', () => setTimeout(() => navHint(MOVE_HINT), 2600), { once: true });
      else setTimeout(() => navHint(MOVE_HINT), 2600);
    }
  }
  let hinted = false;
  function navHint(words = NAV_HINT) {
    if (hinted || GATE) return;
    hinted = true;
    try { if (localStorage.getItem(NAV_HINT_KEY) === '1') return; localStorage.setItem(NAV_HINT_KEY, '1'); } catch { /* blocked: show it */ }
    hintEl.textContent = coarse.matches ? words.touch : words.mouse;
    hintEl.classList.add('on');
    setTimeout(() => hintEl.classList.remove('on'), 6000);
  }
  onArrive = (id) => {
    syncPan();
    dispatchEvent(new CustomEvent('room:arrive', { detail: id }));
    for (const l of layers) l.onView?.(id);
    const own = pending && CASES[pending]?.in === id ? pending : null;
    pending = null;
    showCase(id);
    said.textContent = `Viewpoint: ${viewOf(id)?.label ?? id}`;
    if (id !== home.id && !GATE && !viewOf(id)?.stand) navHint();   // a standpoint is still the room: no "go back" hint
    if (own) openCase(own);
  };
  if (params.has('dev')) import('./dev.js').then((m) => m.default({ params, state, views })).catch((e) => console.warn('room: dev panel', e));
  // the reveal: when the projector starts scanning while the visitor is on the overview, the case card
  // says so and offers the close-up (the vase is small from the back of the room)
  const narrow = matchMedia('(max-width: 640px)');
  if (views.some((v) => v.id === 'experiment')) addEventListener('room:scan', () => {
    if (current.id !== 'overview' || tween || !caseEl) return;
    if (narrow.matches) { scanPill(); return; }
    CASES.overview = { k: 'Live', t: head ? PLATO.scan[0] : 'The projector is scanning the vase',
      b: head ? PLATO.scan[1] : 'Stripes of light label every point on it; in a moment it turns into its own point cloud.',   // [check] panel 015 action 1
      acts: [{ label: 'See it up close', run: () => go('experiment') }] };
    showCase('overview');
    delete CASES.overview;
    setTimeout(() => { if (current.id === 'overview') showCase('overview'); }, 15000);   // the scan is over: clear
  });
  // [check] copy (panel 015 action 6, the phone's scan notice). Only once the prompt is done (after the first pick) and
  // no toast is up, so it never hides "Tap anything that glows" nor comes back under it (panel 016 action 9)
  let picked = false;
  addEventListener('room:pick', () => { picked = true; }, { once: true });
  function scanPill() {
    if (!picked || document.querySelector('.toast')) return;
    const prompt = document.querySelector('.prompt');
    const pill = document.createElement('p');
    pill.className = 'prompt scan';
    const b = Object.assign(document.createElement('button'), { type: 'button', textContent: head ? PLATO.pill : 'Scanning the vase · see it up close' });
    b.addEventListener('click', () => { pill.remove(); go('experiment'); });
    pill.appendChild(b);
    const was = prompt?.hidden;
    if (prompt) prompt.hidden = true;
    document.body.appendChild(pill);
    const done = () => { if (!pill.isConnected) return; pill.remove(); if (prompt && !was) prompt.hidden = false; };
    setTimeout(done, 12000);
    addEventListener('room:pick', () => pill.remove(), { once: true });   // the prompt's own handler hides it for good
  }
  showCase(current.id);
  // a deep link (#c64): the hero becomes the entry under it, so Back lands in the room (rule 8)
  const linked = location.hash.slice(1);
  if (!GATE && linked !== home.id && viewOf(linked)) {
    history.replaceState(null, '', location.pathname + location.search);
    go(linked);
  } else if (!GATE && CASES[linked]?.in) {   // round 021 C: an own case (#atlas) opens on its zone's view
    history.replaceState(null, '', location.pathname + location.search);
    openCase(linked);
  }
  // "Show me in the room" in the Work sheet (setupWork) flies to the case's viewpoint, if this layout has it
  flyTo = (id) => (CASES[id]?.in ? openCase(id) : views.some((v) => v.id === id) ? go(id) : null);
  work?.sync();
  addEventListener('keydown', (ev) => {   // Escape: back to the overview (panel 016 action 7); the Work sheet's own Escape wins
    if (ev.key !== 'Escape' || GATE || ev.defaultPrevented || work?.isOpen() || current === views[0]) return;
    go(views[0].id);
  });
  // round 021 D: in the room the arrows and WASD step (forward, back, sideways); in a close-up the arrows orbit inside the
  // view's cone, as before (OrbitControls' own key pan stays unbound: it would ignore the clearance table)
  const roomFocused = () => { const a = document.activeElement; return !a || a === document.body || a === document.documentElement || a === renderer.domElement; };
  const STEP_KEYS = { ArrowUp: [1, 0], KeyW: [1, 0], ArrowDown: [-1, 0], KeyS: [-1, 0], ArrowLeft: [0, -1], KeyA: [0, -1], ArrowRight: [0, 1], KeyD: [0, 1] };
  addEventListener('keydown', (ev) => {
    if (GATE || tween || glide || ev.altKey || ev.ctrlKey || ev.metaKey || work?.isOpen()) return;
    if (ev.target.closest?.('input, textarea, select, [contenteditable]')) return;
    // merge 021 (panel 021 action 4): only while the room has focus (the page or the canvas): an arrow on a chip, a link or a
    // card's button is that control's, never a step
    if (!roomFocused()) return;
    if (!walkNav || !inRoom()) return;
    const k = STEP_KEYS[ev.code];
    if (!k) return;
    ev.preventDefault();
    keyStep(k[0], k[1]);
  });
  addEventListener('keydown', (ev) => {
    if (GATE || tween || glide || ev.altKey || ev.ctrlKey || ev.metaKey || work?.isOpen()) return;
    if (ev.target.closest?.('input, textarea, select, [contenteditable]')) return;
    if (!roomFocused()) return;
    if (walkNav && inRoom()) return;   // the room's arrows step (above)
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[ev.key];
    if (!d) return;
    ev.preventDefault();
    const off = camera.position.clone().sub(controls.target);
    const sph = new THREE.Spherical().setFromVector3(off);
    sph.theta = THREE.MathUtils.clamp(sph.theta + d[0] * ORBIT_KEY, controls.minAzimuthAngle, controls.maxAzimuthAngle);
    sph.phi = THREE.MathUtils.clamp(sph.phi + d[1] * ORBIT_KEY, controls.minPolarAngle, controls.maxPolarAngle);
    camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(sph));
    camera.lookAt(controls.target);
    controls.update();
    needsRender = true;
  });
  // The prompt: after the intro (or at once), pulse every object that has a caption; gone after the first pick
  const prompt = document.querySelector('.prompt');
  if (prompt && !GATE && api.hotspots) {
    const btn = prompt.querySelector('button');
    if (matchMedia('(pointer: coarse)').matches) btn.textContent = 'Tap a tag or anything that glows';   // [check] panel 018 action 4
    let shown = false;
    const reveal = () => { if (shown) return; shown = true; prompt.hidden = false; };
    const pulse = () => { api.hotspots.pulse(); api.tags?.edges(); api.tags?.gaze(); };   // round 18 C: the tags hang with the glow
    // round 019: on a phone the first-look tags wait for the end-of-flight note to go (else 4-5 papers and the note share
    // the first 6.5 s of a small screen); the glow and the edge tags (the only road out of frame) do not wait
    const firstPulse = () => {
      if (!coarse.matches || !document.querySelector('.toast')) return pulse();
      api.hotspots.pulse(); api.tags?.edges();
      addEventListener('room:toast-gone', () => api.tags?.gaze(), { once: true });
    };
    if (root.dataset.intro === 'playing') {
      // shown by 6 s into the 10 s flight (layer-intro.js PROMPT_AT); the glows wait for the room itself
      addEventListener('room:intro-prompt', reveal, { once: true });
      addEventListener('room:intro', () => setTimeout(() => { reveal(); firstPulse(); }, 400), { once: true });
    } else setTimeout(() => { reveal(); firstPulse(); }, 900);
    btn.addEventListener('click', pulse);
    addEventListener('room:pick', () => { prompt.hidden = true; }, { once: true });
  }

  // The end of the flight: a note that the timing along the wire was solved from the action, with the way to the poster
  // (panel 015 action 7, 016 action 8). Only after most of it was seen (5 s or more), and only if this layout has the
  // poster's viewpoint. Up for TOAST_MS, paused while hovered or focused (WCAG 2.2.1). [check] copy, notes/captions.md
  if (!GATE && root.dataset.intro === 'playing' && views.some((v) => v.id === 'action')) addEventListener('room:intro', () => {
    if ((api.intro?.elapsed?.() ?? 0) < 5) return;
    const toast = document.createElement('p');
    toast.className = 'toast';
    toast.setAttribute('role', 'status');
    const see = Object.assign(document.createElement('button'), { type: 'button', textContent: 'See the maths' });
    const gone = () => { toast.remove(); dispatchEvent(new Event('room:toast-gone')); };
    see.addEventListener('click', () => { gone(); go('action'); });
    toast.append('That flight was a stationary path of the action. ', see);   // [check] not "least": only the timing is solved
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('on'));
    let out = 0, held = 0;
    const arm = () => { clearTimeout(out); out = setTimeout(() => { toast.classList.remove('on'); setTimeout(gone, 400); }, TOAST_MS); };
    const hold = (d) => { held = Math.max(0, held + d); if (held) clearTimeout(out); else arm(); };
    toast.addEventListener('pointerenter', () => hold(1)); toast.addEventListener('pointerleave', () => hold(-1));
    toast.addEventListener('focusin', () => hold(1)); toast.addEventListener('focusout', () => hold(-1));
    arm();
    // panel 019 action 3c: the note belongs to the hero; on a phone it sat over a case card's acts for up to 8 s. Any move
    // away takes it down at once (the move's first frame, before the card comes)
    const leave = () => { if (current.id !== home.id && toast.isConnected) { clearTimeout(out); gone(); } };
    addEventListener('room:move', leave);
    addEventListener('room:arrive', leave);
  }, { once: true });

  // Gate hooks: draw-call count, a forced-render frame-rate sample, camera state, viewpoints.
  state.info = () => { renderer.render(scene, camera); return { ...renderer.info.render, programs: renderer.info.programs.length }; };
  // Composition gate (panel 015 action 5): for each named node, the share of the frame where it is the nearest
  // surface (an ID render of the baked meshes only, at 1/4 size) and its screen box in CSS px [l, t, r, b].
  state.coverage = (names, opts = {}) => {   // opts.mask: also a top-down string, one char per 4x4 px ('0' none, '1'..'9' names[i])
    const W4 = Math.max(1, Math.round(innerWidth / 4)), H4 = Math.max(1, Math.round(innerHeight / 4));
    const rt = new THREE.WebGLRenderTarget(W4, H4);
    const ids = names.map((_, i) => new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB((i + 1) * 16 / 255, 0, 0, THREE.LinearSRGBColorSpace) }));   // a linear target: bytes = (i + 1) * 16
    const black = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const saved = [];
    scene.traverse((o) => {
      if (!(o.isMesh || o.isPoints || o.isLine || o.isSprite)) return;
      let i = -1;
      for (let p = o; p && i < 0; p = p.parent) i = names.indexOf(p.name);
      const keep = o.isMesh && !o.material?.transparent && o.visible;
      saved.push([o, o.material, o.visible]);
      if (!keep) { o.visible = false; return; }
      o.material = i >= 0 ? ids[i] : black;
    });
    renderer.setRenderTarget(rt); renderer.render(scene, camera); renderer.setRenderTarget(null);
    for (const [o, m, v] of saved) { o.material = m; o.visible = v; }
    const px = new Uint8Array(W4 * H4 * 4);
    renderer.readRenderTargetPixels(rt, 0, 0, W4, H4, px);
    rt.dispose(); ids.forEach((m) => m.dispose()); black.dispose();
    const out = Object.fromEntries(names.map((n) => [n, { share: 0, box: null }]));
    for (let y = 0; y < H4; y++) for (let x = 0; x < W4; x++) {
      const i = Math.round(px[4 * (y * W4 + x)] / 16) - 1;
      if (i < 0 || i >= names.length) continue;
      const r = out[names[i]], sx = x * 4, sy = (H4 - 1 - y) * 4;
      r.share++;
      r.box = r.box ? [Math.min(r.box[0], sx), Math.min(r.box[1], sy), Math.max(r.box[2], sx + 4), Math.max(r.box[3], sy + 4)] : [sx, sy, sx + 4, sy + 4];
    }
    for (const r of Object.values(out)) r.share /= W4 * H4;
    if (opts.mask) {
      let m = '';
      for (let y = H4 - 1; y >= 0; y--) for (let x = 0; x < W4; x++) {
        const i = Math.round(px[4 * (y * W4 + x)] / 16);
        m += i >= 1 && i <= Math.min(9, names.length) ? String(i) : '0';
      }
      out._mask = { w: W4, h: H4, data: m };
    }
    needsRender = true;
    return out;
  };
  state.bench = (ms = 3000) => new Promise((resolve) => {
    let frames = 0; const t0 = performance.now();
    const tick = () => {
      renderer.render(scene, camera); frames++;
      const dt = performance.now() - t0;
      if (dt < ms) requestAnimationFrame(tick); else resolve({ frames, fps: frames / (dt / 1000) });
    };
    requestAnimationFrame(tick);
  });
  state.camera = () => ({ az: controls.getAzimuthalAngle(), polar: controls.getPolarAngle(),
    limits: [controls.minAzimuthAngle, controls.maxAzimuthAngle, controls.minPolarAngle, controls.maxPolarAngle],
    pos: camera.position.toArray(), target: controls.target.toArray(), view: current.id, moving: !!tween, move: lastMove, fov: +camera.fov.toFixed(3),
    framed: current === spot ? arrivedAt : null, t: frameNow });
  state.views = () => views.map((v) => ({ id: v.id, label: v.label, pos: v.pos.toArray(), target: v.target.toArray() }));
  state.goTo = goTo;
  state.arrival = () => lastArrival;
  // click navigation gate: a grid of screen points (CSS px, `step` apart), each sorted by where a click there leads, by
  // the click's own code (resolveAt + intentAt; merge 018 step 6, A's targets()): { <view id>: [[x, y], ...],
  // back: [...] (to the hero), stay: [...] (its own object or a pick), none: [...] (hero scenery), 'walk:<standpoint>': [...]
  // (the bare floor, round 019 A) }. touch: a tap's rule.
  state.hotMap = (step = 32, touch = false) => {
    const out = { none: [] };
    for (let y = step / 2; y < innerHeight; y += step) for (let x = step / 2; x < innerWidth; x += step) {
      // panel 020 action 12: a cell the page covers (a card, a tag, the caption) is no click on the room: dropped
      if (document.elementFromPoint(x, y) !== renderer.domElement) continue;
      const it = intentAt(resolveAt(x, y), x, y, touch);
      (out[it.kind === 'go' ? it.id : it.kind === 'walk' ? `walk:${it.id}` : it.kind] ??= []).push([x, y]);
      if (it.case) (out[`case:${it.case}`] ??= []).push([x, y]);   // round 022 C: the cells that open an own case
    }
    return out;
  };
  // where a click at (x, y) leads, for the gates: { kind, id, pick: the pick object's name, hit: the baked surface's }
  state.intent = (x, y, touch = false) => { const r = resolveAt(x, y), it = intentAt(r, x, y, touch);
    return { kind: it.kind, id: it.id ?? null, case: it.case ?? null, pick: it.pick?.object.name ?? null, hit: r.hit?.object.name ?? null,
      top: r.hit ? topOf(r.hit.object)?.name ?? null : null, at: r.hit?.point.toArray().map((c) => +c.toFixed(3)) ?? null,
      to: it.kind === 'walk' ? it.at.toArray().map((c) => +c.toFixed(3)) : null }; };   // round 021 D: where a walk lands (floor)
  // panel 019 action 10: the fast raycaster checked, not trusted. On a grid of rays from the current camera (CSS px, `step`
  // apart) firstHit(solid) against three.js's own ray.intersectObjects(solid)[0]: a mismatch is a hit against a miss or a
  // distance off by more than 0.1 mm (not the object: two coplanar faces tie). chunked: meshes with runs built at load.
  state.rayCheck = (step = 24) => {
    // panel 020 action 12: also against the whole scene (intersectObjects(scene, true), its solid meshes), so a baked mesh
    // missing from `solid` (a layer's split part added late) shows up as `unlisted`
    let rays = 0; const bad = [], off = [], pre = chunked.size;   // pre: built at load, before this grid's first ray
    const near = (a, b) => !a === !b && (!a || Math.abs(a.distance - b.distance) <= 1e-4);
    for (let y = step / 2; y < innerHeight; y += step) for (let x = step / 2; x < innerWidth; x += step) {
      resolveAt(x, y);   // sets the ray as a click there would
      const a = firstHit(solid), b = ray.intersectObjects(solid, false)[0] ?? null;
      const c = ray.intersectObjects(scene.children, true).find((h) => isSolid(h.object)) ?? null;
      rays++;
      if (!near(a, b)) bad.push([x, y, a?.object.name ?? null, b?.object.name ?? null]);
      if (!near(a, c)) off.push([x, y, a?.object.name ?? null, c?.object.name ?? null]);
    }
    return { rays, mismatches: bad.length, bad: bad.slice(0, 5), unlisted: off.length, off: off.slice(0, 5), solid: solid.length, chunked: pre };
  };
  state.layers = api;
  // round 021 D: the clearance table and its test, for the gates (the same table the walk, the pan and the keys use)
  state.bounds = () => walkNav?.bounds() ?? null;
  // round 022: the walk's way between two eye positions ([] straight, [[x, y, z], ...] round furniture, null none)
  state.route = (a, b) => (walkNav ? walkNav.route(new THREE.Vector3(...a), new THREE.Vector3(...b))?.map((p) => p.toArray()) ?? null : null);
  state.free = (p) => (walkNav ? walkNav.depth(new THREE.Vector3(...p)) : null);   // 0: clear; > 0: metres out of bounds
  state.cursors = () => ({ ...CURSOR });
  state.cases = () => Object.keys(CASES).filter((id) => views.some((v) => v.id === id));
  // round 021 C: the own cases, { id: the view they open on }, and which case card is up (null: a caption or place card)
  state.ownCases = () => Object.fromEntries(Object.entries(CASES).filter(([, c]) => c.in && views.some((v) => v.id === c.in)).map(([id, c]) => [id, c.in]));
  state.caseShown = () => shown;
  state.openCase = (id) => openCase(id);
  state.mode = 'webgl';
  state.ready = true;
}

// Live layers: import each module, mount it, and route canvas clicks/hover to what the layers made
// pickable ({ object, accept(worldPoint) -> bool, onPick() }). A click is a press that hardly moved.
async function mountLayers(live) {
  const canvas = live.renderer.domElement;
  const layers = [];
  for (const file of LAYERS) {
    try {
      const mod = await import(new URL(file, import.meta.url).href);
      const layer = await mod.default(live);
      if (layer) layers.push(layer);
    } catch (err) {
      console.warn(`room: layer ${file} not mounted:`, err);
    }
  }
  // a click is the main button's (or one finger's): a right press is the pan's, a second finger makes the touch a gesture
  // (round 021 D: a two-finger pan ending on one lifted finger was a tap)
  let down = null;
  const fingers = new Set();
  canvas.addEventListener('pointerdown', (ev) => {
    fingers.add(ev.pointerId);
    down = ev.button === 0 && fingers.size === 1 ? { x: ev.clientX, y: ev.clientY, t: performance.now(), id: ev.pointerId } : null;
    // the drag's own cursor, from the same table: turn (left) or pan (right, where the room pans)
    if (ev.pointerType === 'mouse') canvas.style.cursor = ev.button === 2 && live.panning() ? live.cursors.pan : ev.button === 0 ? live.cursors.turn : canvas.style.cursor;
  });
  const lift = (ev) => { fingers.delete(ev.pointerId); };
  canvas.addEventListener('pointercancel', (ev) => { lift(ev); down = null; });
  canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());   // the right button pans, never a menu
  canvas.addEventListener('pointerup', (ev) => {
    lift(ev);
    if (ev.pointerType === 'mouse') lastX = lastY = -1e3;   // the hover re-resolves the cursor after a drag
    if (!down || down.id !== ev.pointerId || Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > 6 || performance.now() - down.t > 600) { down = null; return; }
    down = null;
    live.clickAt(ev.clientX, ev.clientY, ev.pointerType === 'touch');
  });
  // hover (mouse): one resolve per frame at most, none while the camera flies; the layers (the tags) read its result
  // panel 018 action 7: a move under 2 px from the last resolved point resolves nothing (a resting hand jitters)
  var queued = null, lastX = -1e3, lastY = -1e3;   // var: the pointerup above resets them
  addEventListener('room:arrive', () => { lastX = lastY = -1e3; });   // the frame changed under a still pointer
  canvas.addEventListener('pointermove', (ev) => {
    if (ev.pointerType !== 'mouse' || ev.buttons) return;
    if (!queued && Math.hypot(ev.clientX - lastX, ev.clientY - lastY) < 2) return;
    if (!queued) requestAnimationFrame(() => {
      const { x, y } = queued; queued = null;
      if (live.moving()) return;
      lastX = x; lastY = y;
      const r = live.resolveAt(x, y), it = live.intentAt(r, x, y, false);
      if (it.kind === 'walk') dispatchEvent(new Event('room:floor'));   // the move hint's first trigger (merge 021)
      const cur = live.cursorOf(it);
      if (canvas.style.cursor !== cur) canvas.style.cursor = cur;
      for (const l of layers) l.hover?.(it, x, y, r);   // r: the one resolve, reused by the hotspot cards (action 10)
    });
    queued = { x: ev.clientX, y: ev.clientY };
  });
  return layers;
}

// The caption on a phone: name + contact row, the offer behind "About" (index.html .cap-more; display:none without
// JS, so the offer stays readable). Runs with or without WebGL.
function setupCaption() {
  const cap = document.querySelector('.caption');
  const btn = cap?.querySelector('.cap-more');
  btn?.addEventListener('click', () => btn.setAttribute('aria-expanded', String(cap.classList.toggle('open'))));
}

// "Work" opens #work as a modal sheet: the rest of the page inert, focus on its heading, Esc or the close button
// closes it and focus returns to what opened it. Without JS the same section opens via :target (index.html).
// "Show me in the room" (one per case, data-view) is shown only once the room is live (flyTo set by start()).
let flyTo = null;
function setupWork() {
  const sheet = document.getElementById('work');
  if (!sheet) return null;
  const link = document.querySelector('[data-work]:not([data-own])');
  const title = sheet.querySelector('#work-title');
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  let opener = null, inerted = [];
  const isOpen = () => sheet.classList.contains('open');
  const sync = () => { for (const b of sheet.querySelectorAll('.show')) b.hidden = !flyTo; };
  function open(from) {
    if (isOpen()) return;
    dispatchEvent(new CustomEvent('room:skipintro'));   // layer-intro.js: Work ends the flight (panel 015 action 7)
    opener = from ?? document.activeElement;
    sync();
    inerted = [...document.body.children].filter((e) => e !== sheet && !e.inert && e.tagName !== 'SCRIPT' && e.tagName !== 'STYLE');
    for (const e of inerted) e.inert = true;
    sheet.classList.add('open');
    sheet.scrollTop = 0;
    title?.focus();
  }
  function close(focusTo) {
    if (!isOpen()) return;
    sheet.classList.remove('open');
    for (const e of inerted) e.inert = false;
    inerted = [];
    if (location.hash === '#work' || location.hash === '#work-own') history.replaceState(null, '', location.pathname + location.search);
    const to = focusTo ?? (opener?.isConnected && opener !== document.body ? opener : link);
    to?.focus();
  }
  link?.addEventListener('click', (ev) => { ev.preventDefault(); open(link); });
  // merge 021 (panel 021 action 7): "His own" in the caption's link row, one click from the hero to his own three: the sheet
  // opens on its heading (without JS, #work-own opens it by :target too)
  const own = document.querySelector('[data-own]'), ownTitle = sheet.querySelector('#work-own');
  own?.addEventListener('click', (ev) => { ev.preventDefault(); open(own); ownTitle?.focus({ preventScroll: true }); ownTitle?.scrollIntoView({ block: 'start' }); });
  sheet.querySelector('.work-close')?.addEventListener('click', (ev) => { ev.preventDefault(); close(); });
  document.addEventListener('keydown', (ev) => {
    if (!isOpen()) return;
    if (ev.key === 'Escape') { ev.preventDefault(); ev.stopImmediatePropagation(); close(); return; }
    if (ev.key !== 'Tab') return;
    // keep Tab inside the sheet: wrap from the last control to the first and back
    const f = [...sheet.querySelectorAll('a[href], button:not([hidden])')].filter((e) => e.offsetParent);
    const first = f[0], last = f.at(-1);
    if (!first) return;
    const out = !sheet.contains(document.activeElement);
    if (ev.shiftKey && (out || document.activeElement === first || document.activeElement === title)) { ev.preventDefault(); last.focus(); }
    else if (!ev.shiftKey && (out || document.activeElement === last)) { ev.preventDefault(); first.focus(); }
  }, true);
  for (const art of sheet.querySelectorAll('article[data-view], article[data-case]')) {
    art.querySelector('.show')?.addEventListener('click', () => {
      const id = art.dataset.case ?? art.dataset.view;
      // focus lands on the viewpoint's chip; the case card (aria-live) announces the case when the camera arrives
      close(document.querySelector(`.views button[data-view="${id}"]`) ?? link);
      flyTo?.(id);
    });
  }
  // a #work link or a reload on #work opens the sheet too
  if (location.hash === '#work') open(link);
  else if (location.hash === '#work-own') own?.click();
  addEventListener('hashchange', () => { if (location.hash === '#work') open(link); else if (location.hash === '#work-own') own?.click(); });
  return { open, close, isOpen, sync };
}

root.classList.add('js');
setupCaption();
const work = setupWork();

// #debug in the URL shows which mode the viewer ended in (webgl or the still fallback).
function report() {
  if (location.hash !== '#debug') return;
  const p = document.querySelector('.caption p');
  if (p) p.textContent = `viewer: ${state.mode}${state.error ? ' (' + state.error + ')' : ''}`;
}
start().catch((err) => {
  console.error('room viewer failed, showing the still:', err);
  state.mode = 'fallback'; state.error = String(err); state.ready = true;
}).finally(report);
