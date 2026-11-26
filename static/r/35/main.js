import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/+esm';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js/+esm';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js/+esm';
import { MeshoptDecoder } from 'https://cdn.jsdelivr.net/npm/meshoptimizer@1.3.0/meshopt_decoder.mjs';
import { KTX2Loader } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/KTX2Loader.js/+esm';
import { C } from './content.js';

const MODEL_URL = 'scene.glb';
const params = new URLSearchParams(location.search);
const GATE = params.has('gate');
const GLASS = !params.has('noglass');
const LIVE = !params.has('nolive');
const LAYERS = ['layer-terminal.js', 'layer-projector.js', 'layer-chamber.js', 'layer-geiger.js', 'layer-eraser.js', 'layer-rain.js', 'layer-water.js', 'layer-audio.js', 'layer-hotspots.js', 'layer-tags.js', 'layer-walk.js', 'layer-lidar.js', 'layer-deck.js', 'layer-books.js', 'layer-stage.js', 'layer-ledmatrix.js', 'layer-c64.js', 'layer-hypercard.js', 'layer-tape.js', 'layer-intro.js', 'layer-gpu.js'];
const POLARIZER = (L) => (L.eraser?.info().inBeam ? 'Take the polarizer out' : 'Insert the polarizer');
const WORK = Object.fromEntries(Object.entries(C.work_room).map(([id, room]) => [id, { room, acts: [] }]));
function workCase(id, { room, acts }, el = null) {
  const a = el ?? document.querySelector(`#work article[data-view="${id}"]`);
  if (!a) return null;
  const text = (q) => a.querySelector(q)?.textContent.replace(/\s+/g, ' ').trim() ?? '';
  const ask = a.querySelector('a.ask');
  const vh = ask?.querySelector('.vh')?.textContent ?? '';
  const mail = ask ? [{ label: ask.textContent.replace(vh, '').trim(), href: ask.getAttribute('href'), mail: true, vh }] : [];
  return { k: text('.k'), t: text('h3'), b: [text('p.text'), room].filter(Boolean).join(' '), acts: [...acts, ...mail] };
}
const CASES = {
  ...Object.fromEntries(Object.entries(WORK).map(([id, w]) => [id, workCase(id, w)]).filter(([, c]) => c)),
  bench: { k: 'Try it', t: 'The bench',
    b: 'A classical quantum eraser on the breadboard, a cloud chamber, and a Geiger counter wired to the scope. The notebook in front labels every finding: tested, preference or hypothesis.',
    acts: [{ label: POLARIZER, run: (L) => L.eraser?.toggle(false) }, { label: 'Hear the Geiger counter', run: (L) => L.geiger?.sound(true) }] },
  projector: { k: 'Try it', t: 'Structured light',
    b: 'The projector is the scanner’s light source; its stripes label every point on the vase with a column and a row.',
    acts: [{ label: 'Run the scan', run: (L) => L.projector?.start() }] },
  pc: { k: 'On the desk', t: 'The small PC', b: 'His own build: a small case with the graphics card standing behind its open side. The local models run here.', acts: [] },
  vitrine: { k: 'By the window', t: 'The cabinet', b: 'A cabinet of curiosities: things he keeps for what they make him think about.', acts: [] },
};
const OWN = { atlas: 'His own: the Atlas', inference: 'His own: a model on the 3090', metal: 'His own: Metal visuals' };
const METAL_CUE_BEAT = (16 + 16 - 8) * 4;
const OWN_ACTS = {
  metal: [{ label: 'Show the idea in the room', run: (L) => L.projector?.start(), need: 'projector' },
    { label: 'See it on the facades opposite', run: (L) => L.stage?.cue?.({ beat: METAL_CUE_BEAT, university: true }), go: 'university' },
    { label: 'Play with the panel', run: (L) => L.ledmatrix?.open(), need: 'pr_ledmatrix' }],
  inference: [{ label: 'Replay the measured run', run: (L) => L.gpu?.play() }],
};
const ATLAS_FIG = [['46', 'agents', '46 agents'], ['28', 'minutes', '28 minutes'], ['157', 'cards', '157 cards'], ['651', 'claims', '651 claims'],
  ['8', 'of 2,144 citations unresolved', '2,144 citations, 8 are unresolved']];
const COUNT_MS = 1200;
function countFig(el, text, still) {
  const figs = ATLAS_FIG.filter(([, , src]) => text.includes(src));
  el.classList.add('fig', 'count');
  el.setAttribute('aria-hidden', 'true');
  el.replaceChildren(...figs.map(([n, l]) => {
    const s = document.createElement('span');
    s.innerHTML = `<b data-to="${n}">${still ? n : 0}</b> ${l}`;
    return s;
  }));
  el.dataset.state = still ? 'done' : 'running';
  if (still) return;
  const t0 = performance.now();
  const tick = (now) => {
    if (!el.isConnected) return;
    const k = Math.min(1, (now - t0) / COUNT_MS), e = 1 - (1 - k) ** 3;
    for (const b of el.querySelectorAll('b')) b.textContent = String(Math.round(+b.dataset.to * e));
    if (k < 1) requestAnimationFrame(tick); else el.dataset.state = 'done';
  };
  requestAnimationFrame(tick);
}
const OWN_FIG = {
  atlas: (L, el, c, still) => countFig(el, c.b, still),
  inference: (L, el) => L.gpu?.play(el),
};
for (const a of document.querySelectorAll('#work article[data-case]')) {
  const id = a.dataset.case, c = OWN[id] && workCase(null, { room: '', acts: [] }, a);
  if (!c || !CASES[a.dataset.in]) continue;
  CASES[id] = { ...c, in: a.dataset.in, acts: [...(OWN_ACTS[id] ?? []), ...c.acts] };
  CASES[a.dataset.in].acts.push({ label: OWN[id], case: id });
}
const CAPTION_OF = { disks: 'pr_floppybox', c64: 'c64', optics: 'optics', hifi: 'amp', canal: 'raindrop', decks: 'pr_xdj', tape: 'pr_tape' };
const PLACE_CARDS = C.place_cards;
const DECK_ACT = (L) => (L.deck?.info().playing ? 'Stop the track' : 'Play the track');
const CAPTION_ACTS = { optics: [{ label: POLARIZER, run: (L) => L.eraser?.toggle(false) }], decks: [{ label: DECK_ACT, run: (L) => L.deck?.toggle() }] };
const WORK_ORDER = ['simulations', 'terminal', 'ml'];
const ALIAS = { chamber: 'simulations', experiment: 'ml', mapping: 'ml', projector: 'hifi', bench: 'pc', cryostat: 'pc', table: 'desk', optics: 'overview', walker: 'action', droplet: 'action', books: 'vitrine' };
const CHIP_STANDS = ['window'];
const HINT = { touch: C.hints.first_touch };
const HINT_KEY = 'room.glowhint.v1';
const NAV_HINT_KEY = 'room.navhint.v2';
const NAV_HINT = C.hints.back;
const MOVE_HINT = C.hints.move;
const HOT = {
  cloud_chamber: 'chamber', pr_terminal: 'terminal', at_plinth: 'experiment', scan_target: 'experiment',
  projector: 'projector', optics: 'optics', bench: 'bench', geiger: 'bench', scope: 'bench',
  c64: 'c64', pr_c64mon: 'c64', ti83: 'c64', amp: 'hifi', pr_dm603: 'hifi', pr_ifi: 'hifi', pr_hd660: 'hifi', rack: 'hifi',
  pr_poster_action: 'action',
  cz_table: 'desk', pr_wheel: 'wall',
  pr_nr200: 'pc', pr_1541: 'c64', pr_floppybox: 'disks', cz_vitrine: 'vitrine', pr_books: 'vitrine', pr_brain: 'vitrine', pr_ledmatrix: 'metal',
 
  pr_planaria: 'vitrine', pr_flask: 'vitrine',
  case_simulations: 'simulations', case_agents: 'terminal', case_ml: 'ml',
  pr_records: 'hifi', pr_records_sleeves: 'hifi',
  pr_3090: 'pc',
  pr_xdj: 'decks', pr_djm450: 'decks',
  pr_tape: 'tape',
  pr_midi: 'decks', pr_mapkit: 'decks',
  pr_globe: 'terminal',
};
const CASE_OF = { pr_3090: 'inference', pr_nr200: 'inference', projector: 'metal', pr_ledmatrix: 'metal', pr_globe: 'atlas' };
const OWN_TAG = { inference: 'Local inference', metal: 'Metal visuals', atlas: 'Agentic SWE Atlas' };
const CLOSE = { inference: { node: 'pr_3090', from: 'bench', fill: 0.5 }, metal: { node: 'pr_ledmatrix', from: 'hifi', fill: 0.4 } };
const HOT_BELOW = { cz_bookcase: { id: 'wall', y: 0.9 } };
const ACT = { experiment: (L) => L.projector?.start(), projector: (L) => L.projector?.start() };
const FAR_VIEWS = ['canal', 'university'];
const FURNITURE = ['bench', 'table', 'wall', 'desk', 'vitrine'];
const LEFT_PANE_X = 0;
const CASE_REACH = 0.02;
const CASE_TAP = 64;
const TAP_MIN = 44;
const PULL_PX = 240;
const TOAST_MS = 8000;
const WALK_CURSOR = `url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><g fill="#f3e6cf" stroke="#2a1f17" stroke-width="1.2"><ellipse cx="8.5" cy="14" rx="3" ry="5"/><ellipse cx="15.5" cy="9" rx="3" ry="5"/></g></svg>')}") 12 12, pointer`;
const ORBIT_KEY = 0.06;
const KEY_STEP = 0.3;
const KEY_MS = 220;
const FACE_ROOM = 1.2;
const DESK_ARRIVE = { node: 'cz_table', near: 0.4, y: 0.85 };
const ARRIVE = { cone: 60, near: 0.9, far: 6, tilt: [12, 16, 20], hotPitch: 34, floor: 0.10, pick: 0.10, wall: 0.2, hot: 5 };
const WALL_NODES = new Set(['cz_canal', 'cz_ceiling', 'cz_door', 'cz_chimney', 'cz_bookcase']);
const SETTLE_M = 0.08;
const RISE_MS = 400;
const SETTLE_MOVE = 5e-4;
const CURSOR = { go: 'pointer', act: 'pointer', pick: 'pointer', walk: WALK_CURSOR, back: 'zoom-out', none: 'grab', stay: 'grab',
  turn: 'grabbing', pan: 'move' };
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const root = document.documentElement;
const state = (window.__room = { mode: 'loading', ready: false });
if (GATE) root.classList.add('gate');

const SENSOR = 36;
const MOVE = { frameMax: 250, base: 600, perMetre: 140, perDegree: 3, min: 650, max: 1500, turnBy: 0.7, turnFrom: 30,
  turnFirst: 90, turnFirstBy: 0.4, walkFrom: 0.3, gazeMax: 300, walkMax: 2400,
  gazeHeadroom: 0.85 };
const moveMs = (metres, swing) => Math.min(MOVE.max, Math.max(MOVE.min, MOVE.base + MOVE.perMetre * metres + MOVE.perDegree * swing));
const ATT = { ret: 1.3, inMax: 1150, clickGrace: 350, arc: 0.22, arcMax: 0.55, rise: 0.06, riseMax: 0.18, arcSteps: 8 };
const easeIn = (k) => { const e = 1 - easePos(k); return 1 - e * e; };
const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const easePos = (k) => -(Math.cos(Math.PI * k) - 1) / 2;
const easeWalk = (k) => k * k * k * (10 + k * (6 * k - 15));
const SINE_PEAK = Math.PI / 2;
const WALK = { perMetre: 700, min: 650, max: 6000 };
const ORBIT = { az: 0.35, polarUp: 0.18, polarDown: 0.12, near: 0.85, far: 1.12 };
const PORTRAIT_MAX = 1.9;
const PORTRAIT_SHIFT = [0.05, 0.14];
const PORTRAIT_VIEW = { disks: { shift: [0, -0.10], max: 1.45 }, vitrine: { shift: [-0.05, 0.02], max: 1.4 }, c64: { shift: [-0.16, -0.22], max: 1.6 } };
const PORTRAIT_PAGE = { c64: { shift: [-0.18, -0.18], max: 1.0 } };
const paged = (id) => window.__room?.layers?.[id]?.info?.().disk != null;
const shift3 = (s) => [s?.[0] ?? 0, s?.[1] ?? 0, s?.[2] ?? PORTRAIT_MAX];

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

function glassMaterial() {
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { tint: { value: new THREE.Color(0.80, 0.92, 0.90) } },
    vertexShader: `varying vec3 vN; varying vec3 vV;
      void main() { vec4 p = modelViewMatrix * vec4(position, 1.0); vN = normalMatrix * normal; vV = -p.xyz;
        gl_Position = projectionMatrix * p; }`,
    fragmentShader: `uniform vec3 tint; varying vec3 vN; varying vec3 vV;
      void main() { float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 3.0);
        gl_FragColor = vec4(tint, 0.035 + 0.30 * f); }`,
  });
  mat.forceSinglePass = true;
  return mat;
}

function addGlass(node) {
  const d = node.userData;
  if (!d.glass_size) return null;
  const [sx, sy, sz] = d.glass_size;
  const geo = new THREE.BoxGeometry(sx, sy, sz);
  const keep = geo.groups.filter((g, i) => i !== 3);
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

function stillLine(text) {
  const s = document.querySelector('.status');
  if (s) { s.textContent = text; s.hidden = false; }
}

async function start() {
  if (!webglAvailable()) { stillLine(C.status.no_webgl); state.mode = 'fallback'; state.ready = true; return; }

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setPixelRatio(GATE ? 1 : Math.min(devicePixelRatio, 2));
  document.querySelector('.stage').appendChild(renderer.domElement);

  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(MODEL_URL);
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);

  const texLoader = new KTX2Loader()
    .setTranscoderPath('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/basis/')
    .detectSupport(renderer);
  const maxAniso = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  const jpgLoader = new THREE.TextureLoader();
  const loads = [];
  const meshes = [];
  scene.traverse((o) => { if (o.isMesh) meshes.push(o); });
  for (const o of meshes) {
    const ud = o.userData.bake_tex ? o.userData : o.parent?.userData ?? {};
    const file = ud.tex ?? ud.bake_tex?.replace(/\.jpg$/, '.ktx2');
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: ud.double_sided ? THREE.DoubleSide : THREE.FrontSide });
    o.material = mat;
    if (!file) continue;
    loads.push((file.endsWith('.ktx2') ? texLoader : jpgLoader).loadAsync(file).then((t) => {
      t.flipY = false;
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = maxAniso;
      mat.map = t;
      mat.needsUpdate = true;
    }));
  }
  const byName = (n) => scene.getObjectByName(n);
  for (const c of Object.values(CASES)) if (c.acts) c.acts = c.acts.filter((a) => !a.need || byName(a.need));
  if (GLASS) { const cc = byName('cloud_chamber'); if (cc) addGlass(cc); addPropGlass(scene); }

  const src = gltf.cameras[0];
  const heroAspect = src.aspect || 16 / 9;
  const camera = new THREE.PerspectiveCamera(src.fov, heroAspect, 0.05, 1000);
  const heroPos = src.getWorldPosition(new THREE.Vector3());
  const tgtData = src.userData.hero_target ?? src.parent?.userData.hero_target;
  const heroTarget = tgtData ? new THREE.Vector3(...tgtData)
    : heroPos.clone().add(new THREE.Vector3(0, 0, -1).applyQuaternion(src.getWorldQuaternion(new THREE.Quaternion())));

  const lensToFov = (lens) => THREE.MathUtils.radToDeg(2 * Math.atan(SENSOR / 2 / lens / heroAspect));
  const views = [];
  scene.traverse((o) => {
    const d = o.userData;
    if (!d.vp_label) return;
    views.push({ id: o.name.replace(/^vp_/, ''), label: d.vp_label, order: d.vp_order ?? 0,
      pos: o.getWorldPosition(new THREE.Vector3()), target: new THREE.Vector3(...d.vp_target), fov: lensToFov(d.vp_lens) });
  });
  views.sort((a, b) => a.order - b.order);
  if (views[0]) Object.assign(views[0], { pos: heroPos.clone(), target: heroTarget.clone(), fov: src.fov });
  else views.push({ id: 'overview', label: 'Overview', order: 0, pos: heroPos.clone(), target: heroTarget.clone(), fov: src.fov });
  for (const [id, c] of Object.entries(CLOSE)) {
    const node = scene.getObjectByName(c.node), from = views.find((v) => v.id === c.from);
    if (!node || !from || !CASES[id]) continue;
    const box = new THREE.Box3().setFromObject(node), target = box.getCenter(new THREE.Vector3());
    const r = box.getBoundingSphere(new THREE.Sphere()).radius, fov = from.fov;
    const d = r / Math.tan(THREE.MathUtils.degToRad(fov) * c.fill / 2);
    const pos = target.clone().add(from.pos.clone().sub(target).normalize().multiplyScalar(d));
    views.push({ id, label: OWN_TAG[id] ?? id, order: from.order + 0.5, pos, target, fov, close: true });
    CASES[id].in = id;
    HOT[c.node] = id;
  }
  if (views.some((v) => v.id === 'agents') && CASES.terminal) {
    CASES.agents = { ...CASES.terminal, acts: [...CASES.terminal.acts] };
    HOT.case_agents = 'agents';
    WORK_ORDER[WORK_ORDER.indexOf('terminal')] = 'agents';
  }
  views.sort((a, b) => a.order - b.order);
  const heroShift = src.userData.portrait_shift ?? src.parent?.userData.portrait_shift ?? PORTRAIT_SHIFT;
  for (const v of views) v.shift = v === views[0] ? shift3(heroShift) : shift3([...(PORTRAIT_VIEW[v.id]?.shift ?? [0, 0]), PORTRAIT_VIEW[v.id]?.max]);
  for (const v of views) if (PORTRAIT_PAGE[v.id]) {
    const page = shift3([...PORTRAIT_PAGE[v.id].shift, PORTRAIT_PAGE[v.id].max]), own = v.shift;
    Object.defineProperty(v, 'shift', { get: () => (paged(v.id) ? page : own) });
    v.reframes = true;
  }
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.screenSpacePanning = true;
  controls.rotateSpeed = 0.5;
  controls.panSpeed = src.userData.pan_gain ?? src.parent?.userData.pan_gain ?? 1;
  controls.enabled = !GATE;
  const applyMotionPref = () => { controls.enableDamping = !reduceMotion.matches; };
  applyMotionPref();
  reduceMotion.addEventListener('change', applyMotionPref);

  let baseFov = src.fov;
  function fitFov() {
    const a = camera.aspect;
    if (a >= heroAspect) return baseFov;
    const t = Math.tan(THREE.MathUtils.degToRad(baseFov) / 2) * Math.min(heroAspect / a, shift3(shift)[2]);
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
    controls.maxPolarAngle = Math.max(sph.phi, Math.min(Math.PI / 2 - 0.05, sph.phi + ORBIT.polarDown));
  }

  let shift = [0, 0];
  function frame() {
    const w = innerWidth, h = innerHeight;
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
  const stands = [];
  const viewOf = (id) => views.find((x) => x.id === id) ?? stands.find((x) => x.id === id) ?? (id === spot.id && spot.fov ? spot : undefined);
  const inRoom = () => current === views[0] || !!current.stand;
  let stepOf = null;
  let walkNav = null;
  const spot = { id: 'walk', label: 'Where you stand', pos: new THREE.Vector3(), target: new THREE.Vector3(), fov: 0, shift: [0, 0], stand: true };
  let onArrive = () => {};
  let arrivedAt = null;
  let lastArrival = null;
  place(current.pos, current.target, current.fov, current.shift);
  setLimits(current.pos, current.target);
  controls.update();

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
  let lastMove = null;
  controls.addEventListener('change', () => { needsRender = true; });
  addEventListener('resize', resize);
  resize();

  const roomPlace = (x) => !!x && (x === home || !!x.stand);
  const closeUp = (v) => !roomPlace(v) && !FAR_VIEWS.includes(v.id);

  function goTo(id) {
    const v = viewOf(id);
    if (!v) return Promise.reject(new Error(`no viewpoint ${id}`));
    const left = current.id;
    current = v;
    rise = null;
    syncNav();
    dispatchEvent(new CustomEvent('room:move', { detail: id }));
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
    Object.assign(controls, { minAzimuthAngle: -Infinity, maxAzimuthAngle: Infinity, minPolarAngle: 0,
      maxPolarAngle: Math.PI, minDistance: 0, maxDistance: Infinity });
    document.querySelector('.case')?.replaceChildren();
    root.classList.remove('has-case');
    const d0 = from.target.clone().sub(from.pos), d1 = v.target.clone().sub(v.pos);
    const r0 = d0.length(), r1 = d1.length();
    d0.normalize(); d1.normalize();
    const walk = roomPlace(v) && roomPlace(viewOf(left));
    const out = !walk && roomPlace(v) && !!viewOf(left) && !roomPlace(viewOf(left));
    const found = walk && walkNav ? walkNav.route(from.pos, v.pos) ?? walkNav.route(new THREE.Vector3(from.pos.x, walkNav.eye, from.pos.z), v.pos) : [];
    const via = found ?? [];
    const legs = [from.pos, ...via, v.pos].slice(1).map((p, i, a) => p.distanceTo(i ? a[i - 1] : from.pos));
    const metres = legs.reduce((x, y) => x + y, 0), swing = THREE.MathUtils.radToDeg(d0.angleTo(d1));
    const first = swing > MOVE.turnFirst && (walk || !!viewOf(left)?.stand);
    const turnBy = first ? MOVE.turnFirstBy : swing > MOVE.turnFrom ? MOVE.turnBy : 1;
    const gazeMs = first || walk ? 1000 * SINE_PEAK * swing / (turnBy * MOVE.gazeMax * MOVE.gazeHeadroom) : 0;
    const flight = Math.min(ATT.inMax, moveMs(metres, swing));
    const ms = walk ? Math.min(WALK.max, Math.max(WALK.min, WALK.perMetre * metres / (first ? 1 - MOVE.walkFrom : 1), gazeMs, MOVE.perDegree * swing))
      : first ? Math.min(MOVE.walkMax, Math.max(moveMs(metres, swing), gazeMs)) : out ? flight * ATT.ret : flight;
    const turn = new THREE.Quaternion().setFromUnitVectors(d0, d1);
    const arc = out && !first ? arcOver(from.pos, v.pos, metres) : null;
    const inward = closeUp(v);
    lastMove = { from: from.id ?? null, to: id, ms: Math.round(ms), metres: +metres.toFixed(3), swing: +swing.toFixed(1), turnFirst: first, walk, via: via.length, routed: found ? (via.length ? 'via' : 'straight') : 'none', out, arc: !!arc };
    return new Promise((resolve) => {
      tween = { from, to: v, t0: performance.now(), flown: 0, seen: performance.now(), ms, d0, r0, r1, turn, first, walk, via, legs, metres,
        turnBy, out, arc, inward, resolve };
    });
  }

  const arcP = new THREE.Vector3(), arcQ = new THREE.Vector3();
  const arcAt = (A, C, B, u, out) => out.copy(A).multiplyScalar((1 - u) * (1 - u)).addScaledVector(C, 2 * u * (1 - u)).addScaledVector(B, u * u);
  function arcOver(A, B, metres) {
    const n = new THREE.Vector3(B.z - A.z, 0, A.x - B.x);
    if (n.lengthSq() < 1e-6 || !solid) return null;
    n.normalize();
    const reach = Math.min(ATT.arcMax, ATT.arc * metres), rise = Math.min(ATT.riseMax, ATT.rise * metres);
    const mid = A.clone().lerp(B, 0.5);
    const middle = views.reduce((c, x) => c.add(x.pos), new THREE.Vector3()).divideScalar(views.length);
    const side = n.dot(middle.sub(mid)) >= 0 ? 1 : -1;
    for (const s of [side, -side]) {
      const C = mid.clone().addScaledVector(n, s * reach);
      C.y += rise;
      let clear = true;
      for (let i = 0; i < ATT.arcSteps && clear; i++) {
        arcAt(A, C, B, i / ATT.arcSteps, arcP); arcAt(A, C, B, (i + 1) / ATT.arcSteps, arcQ);
        const len = arcP.distanceTo(arcQ);
        ray.ray.origin.copy(arcP); ray.ray.direction.copy(arcQ).sub(arcP).normalize();
        const h = firstHit(solid);
        clear = !h || h.distance > len + 0.12;
      }
      if (clear) return C;
    }
    return null;
  }

  const FAR = 8;
  const hot = new Map();
  for (const [name, id] of Object.entries(HOT)) { const o = byName(name); if (o && views.some((v) => v.id === id)) hot.set(o, id); }
  const farViews = views.filter((v) => FAR_VIEWS.includes(v.id));
  const topOf = (obj) => { while (obj?.parent && obj.parent !== scene) obj = obj.parent; return obj; };
  function hotOf(p, obj) {
    const top = topOf(obj);
    if (hot.has(top)) return { id: hot.get(top), node: top };
    const low = HOT_BELOW[top?.name];
    if (low && p.y < low.y && views.some((v) => v.id === low.id)) return { id: low.id, node: top };
    if (farViews.length && camera.position.distanceTo(p) > FAR) {
      const q = camera.position, d = p.clone().sub(q);
      const x0 = d.z < -1e-6 ? q.x + d.x * (-q.z / d.z) : 1;
      const pane = farViews.find((v) => v.id === (x0 < LEFT_PANE_X ? 'university' : 'canal'));
      if (pane) return { id: pane.id, node: null };
      const cost = (x) => Math.abs(x.target.y - p.y);
      return { id: farViews.reduce((a, b) => (cost(b) < cost(a) ? b : a)).id, node: null };
    }
    return null;
  }
  let shown = null, pending = null;
  const caseOf = (node) => { const c = CASE_OF[node?.name]; return c && CASES[c]?.in && CASES[c].in === hot.get(node) ? c : null; };
  const leadOf = (p, obj) => { const to = hotOf(p, obj); return to && !to.node && FAR_VIEWS.includes(current.id) ? null : to; };
  const hotBoxes = [...hot.keys()].map((o) => [o, new THREE.Box3().setFromObject(o)]);
  const opensCase = (o) => !!caseOf(o) || WORK_ORDER.includes(hot.get(o));
  function padOf(o, w, h, touch) {
    if (touch) { const m = opensCase(o) ? CASE_TAP : TAP_MIN; return [Math.max(0, (m - w) / 2), Math.max(0, (m - h) / 2)]; }
    const A = CASE_REACH * innerWidth * innerHeight;
    if (!opensCase(o) || w * h >= A) return [0, 0];
    const p = (Math.sqrt((w + h) ** 2 - 4 * (w * h - A)) - (w + h)) / 4;
    return [p, p];
  }
  function caseCore(x, y) {
    const r = canvasBox(), h = TAP_MIN / 2;
    let best = null, bestD = Infinity;
    for (const [o, b] of hotBoxes) {
      if (!opensCase(o) || hot.get(o) === current.id) continue;
      let l = Infinity, t = Infinity, rr = -Infinity, bb = -Infinity, behind = false;
      for (let i = 0; i < 8; i++) {
        const c = new THREE.Vector3(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).project(camera);
        if (c.z > 1) { behind = true; break; }
        const sx = r.left + (c.x + 1) / 2 * r.width, sy = r.top + (1 - c.y) / 2 * r.height;
        l = Math.min(l, sx); rr = Math.max(rr, sx); t = Math.min(t, sy); bb = Math.max(bb, sy);
      }
      if (behind || rr < 0 || l > innerWidth || bb < 0 || t > innerHeight) continue;
      const cx = Math.min(Math.max((Math.max(l, 0) + Math.min(rr, innerWidth)) / 2, h), innerWidth - h);
      const cy = Math.min(Math.max((Math.max(t, 0) + Math.min(bb, innerHeight)) / 2, h), innerHeight - h);
      const d = Math.max(Math.abs(x - cx), Math.abs(y - cy));
      if (d <= h && d < bestD) { bestD = d; best = { id: hot.get(o), node: o }; }
    }
    return best;
  }
  function nearHot(x, y, only = null, touch = true) {
    const r = canvasBox();
    let best = null, bestD = Infinity;
    for (const [o, b] of hotBoxes) {
      if (only ? o !== only : hot.get(o) === current.id) continue;
      let l = Infinity, t = Infinity, rr = -Infinity, bb = -Infinity, behind = false;
      for (let i = 0; i < 8; i++) {
        const c = new THREE.Vector3(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).project(camera);
        if (c.z > 1) { behind = true; break; }
        const sx = r.left + (c.x + 1) / 2 * r.width, sy = r.top + (1 - c.y) / 2 * r.height;
        l = Math.min(l, sx); rr = Math.max(rr, sx); t = Math.min(t, sy); bb = Math.max(bb, sy);
      }
      if (behind || rr < 0 || l > innerWidth || bb < 0 || t > innerHeight) continue;
      const [px, py] = padOf(o, rr - l, bb - t, touch);
      if (!px && !py) { if (only) return null; continue; }
      if (only) return { id: hot.get(o), node: o };
      if (x < l - px || x > rr + px || y < t - py || y > bb + py) continue;
      const d = Math.hypot(Math.max(l - x, 0, x - rr), Math.max(t - y, 0, y - bb));
      if (d < bestD) { bestD = d; best = { id: hot.get(o), node: o }; }
    }
    return best;
  }
  const home = views[0];
  function go(id, sub = null) {
    if (GATE) return Promise.resolve(current.id);
    dispatchEvent(new CustomEvent('room:skipintro'));
    if (id === home.id) {
      if (history.state?.roomView) history.back();
      return goTo(id);
    }
    const url = `${location.pathname}${location.search}#${sub ?? id}`;
    const st = sub ? { roomView: id, sub } : { roomView: id };
    if (history.state?.roomView) history.replaceState(st, '', url);
    else history.pushState(st, '', url);
    if (sub && current.id === id && !tween) return Promise.resolve(id);
    return goTo(id);
  }
  addEventListener('popstate', (ev) => {
    const id = ev.state?.roomView;
    if (id && viewOf(id)) { if (id !== current.id) { if (ev.state.case) pending = ev.state.case; goTo(id); } else if (ev.state.case !== shown && CASES[ev.state.case ?? id]) {
      const was = shown;
      showCase(ev.state.case ?? id);
      if (CASES[was]?.in === id) caseEl?.querySelector(`[data-case="${was}"]`)?.focus({ preventScroll: true });
    } }
    else if (current !== home && !work?.isOpen()) goTo(home.id);
  });
  const picks = [];
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const isSolid = (o) => o.isMesh && o.material?.isMeshBasicMaterial && o.material.map && !o.material.transparent;
  let solid = null;
  const OUTSIDE = /^(cz_canal_|cz_boat)/;
  let inside = null;
  const insideOf = () => (inside ??= solid.filter((o) => !OUTSIDE.test(topOf(o)?.name ?? o.name)));
  const wbox = new THREE.Box3(), entry = new THREE.Vector3(), order = [];
  const CHUNK = 256, chunked = new Map(), inv = new THREE.Matrix4(), local = new THREE.Ray();
  const ta = new THREE.Vector3(), tb = new THREE.Vector3(), tc = new THREE.Vector3(), tp = new THREE.Vector3();
  function runsOf(o) {
    const g = o.geometry, idx = g.index, n = idx ? idx.count / 3 : 0;
    if (n < 4 * CHUNK || !g.attributes.position || o.raycast !== THREE.Mesh.prototype.raycast) return null;
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
    return { hit, pick, ray: ray.ray };
  }
  const captioned = (hit) => { const n = hit && topOf(hit.object)?.name; return !!n && !hot.has(topOf(hit.object)) && !!state.layers?.hotspots?.list?.().includes(n); };
  function intentAt({ hit, pick }, x, y, touch) {
    let to = hit ? leadOf(hit.point, hit.object) : null;
    if (touch && !captioned(hit) && !(to?.node && nearHot(x, y, to.node))) {
      const small = nearHot(x, y);
      if (small && (inRoom() || caseOf(small.node))) to = small;
    }
    if (touch && inRoom()) { const core = caseCore(x, y); if (core && (!pick || opensCase(topOf(pick.object)))) { to = core; if (pick && topOf(pick.object) !== core.node) pick = null; } }
    if (!touch && !pick && inRoom() && !captioned(hit) && (!to || FURNITURE.includes(to.id))) {
      const small = nearHot(x, y, null, false);
      if (small) to = small;
    }
    if (to && to.id !== current.id && !inRoom() && (FURNITURE.includes(to.id) || !to.node)) to = null;
    const own = to?.node && caseOf(to.node);
    if (own && own !== shown) return { kind: 'go', id: to.id, node: to.node, case: own, pick: null };
    const pv = pick ? hot.get(topOf(pick.object)) ?? null : null;
    if (to && to.id !== current.id) return { kind: 'go', id: to.id, node: to.node, pick: pick && pv === to.id ? pick : null };
    if (to && !pick && ACT[current.id]) return { kind: 'act', id: current.id };
    if (pick && (to || pv === null || pv === current.id)) return { kind: 'stay', pick };
    if (to) return { kind: 'stay' };
    if (!pick && hit && inRoom() && stepOf) { const s = stepOf(hit, current, camera.position); if (s) return { kind: 'walk', id: s.id, at: s.at, pos: s.pos ?? null }; }
    return inRoom() ? { kind: 'none' } : { kind: 'back', id: home.id };
  }
  const fire = (p) => { p.onPick(); dispatchEvent(new CustomEvent('room:pick', { detail: p.object.name })); needsRender = true; };
  function clickAt(x, y, touch) {
    if (tween) {
      if (GATE || tween.walk || performance.now() - tween.t0 < ATT.clickGrace) return;
      const it = intentAt(resolveAt(x, y), x, y, touch);
      if (it.kind === 'go') { if (it.case) openCase(it.case); else go(it.id); }
      return;
    }
    const r = resolveAt(x, y);
    if (GATE) { if (r.pick) fire(r.pick); return; }
    const it = intentAt(r, x, y, touch);
    if (it.pick) fire(it.pick);
    if (tween) return;
    if (it.case) openCase(it.case);
    else if (it.kind === 'walk' && it.pos) walkTo(it.pos);
    else if (it.kind === 'go' || it.kind === 'back' || it.kind === 'walk') go(it.id);
    else if (it.kind === 'act') { ACT[it.id](state.layers ?? {}); needsRender = true; }
  }
  const cursorOf = (it) => CURSOR[it.pick ? 'pick' : it.kind] ?? CURSOR.none;
  function walkTo(pos) {
    const t0 = performance.now();
    const from = camera.position, gaze = controls.target.clone().sub(from);
    const B = walkNav?.bounds(), sh = B?.shell;
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
    const way = new THREE.Vector3(pos.x - from.x, 0, pos.z - from.z);
    if (way.lengthSq() < 1e-8) way.set(gaze.x, 0, gaze.z);
    way.normalize();
    const look = new THREE.Vector3(gaze.x, 0, gaze.z);
    if (look.lengthSq() < 1e-8) look.copy(way);
    look.normalize();
    let r = Math.max(1.5, Math.min(4, gaze.length()));
    let pitch = deg(ARRIVE.tilt[0]);
    const up = new THREE.Vector3(0, 1, 0), c = new THREE.Vector3(), near = [];
    for (const [o, box] of hotBoxes) {
      box.getCenter(c);
      const v = new THREE.Vector3(c.x - pos.x, 0, c.z - pos.z), d = v.length();
      if (d < ARRIVE.near || d > ARRIVE.far || run(v.normalize(), o.name) < FACE_ROOM) continue;
      const p = Math.atan2(pos.y - c.y, d);
      if (p < deg(ARRIVE.tilt[0]) || p > deg(ARRIVE.hotPitch)) continue;
      const q = Math.min(p, deg(ARRIVE.tilt.at(-1)));
      if (v.angleTo(look) <= deg(ARRIVE.cone)) near.push({ d, way: v, pitch: q, r: d / Math.cos(q), name: o.name, node: o });
    }
    const turns = (list) => list.flatMap((turn) => { const w = look.clone().applyAxisAngle(up, deg(turn)), wall = run(w) < FACE_ROOM;
      return ARRIVE.tilt.map((t) => ({ way: w, pitch: deg(t), r, name: null, node: null, wall })); });
    const nearest = (l) => l.sort((x, y) => x.d - y.d).slice(0, ARRIVE.hot);
    const desk = (B?.obstacles ?? []).find((o) => o.name === DESK_ARRIVE.node), atDesk = [];
    if (desk) {
      const x0 = desk.x0 + desk.r, x1 = desk.x1 - desk.r, back = desk.z0 + desk.r, front = desk.z1 - desk.r;
      if (pos.x > x0 && pos.x < x1 && pos.z >= front && pos.z - front <= DESK_ARRIVE.near) {
        const v = new THREE.Vector3(0, 0, (back + front) / 2 - pos.z), d = v.length();
        if (d > 1e-3 && v.normalize().angleTo(look) <= deg(ARRIVE.cone)) {
          const p = Math.atan2(pos.y - DESK_ARRIVE.y, d);
          atDesk.push({ d, way: v, pitch: p, r: d / Math.cos(p), name: null, node: null, desk: true });
        }
      }
    }
    const tries = [...atDesk, ...nearest(near), ...turns([0, 30, -30, 60, -60])];
    const probe = { id: spot.id }, cells = new Map();
    const frameOf = (t) => {
      const f = t.way.clone().multiplyScalar(Math.cos(t.pitch)).setY(-Math.sin(t.pitch)).normalize();
      const rt = f.clone().cross(up).normalize(), u = rt.clone().cross(f);
      const th = Math.tan(deg(home.fov) / 2), ta = th * camera.aspect;
      const hit = (x, y) => { ray.ray.set(pos, f.clone().addScaledVector(rt, x * ta).addScaledVector(u, y * th).normalize()); return solid ? firstHit(insideOf()) : null; };
      let wall = 0, floor = 0;
      if (!samples.length || !stepOf) return { floor: 0, wall: 0 };
      const all = 2 * samples.length, need = Math.ceil(ARRIVE.pick * all);
      for (let k = 0; k < samples.length && floor < need && floor + samples.length - k >= need; k++) {
        const [x, y] = samples[k], d = f.clone().addScaledVector(rt, x * ta).addScaledVector(u, y * th).normalize();
        if (d.y >= -1e-6) continue;
        const t = -pos.y / d.y, px = pos.x + d.x * t, pz = pos.z + d.z * t;
        if (sh && (px < sh.x0 - 0.3 || px > sh.x1 + 0.3 || pz < sh.z0 - 0.3 || pz > sh.z1 + 0.3)) continue;
        const h = hit(x, y); if (!h) continue;
        const key = `${Math.round(h.point.x * 10)},${Math.round(h.point.z * 10)},${h.point.y > 0.06 ? 1 : 0}`;
        let ok = cells.get(key); if (ok === undefined) { ok = !!stepOf(h, probe, pos); cells.set(key, ok); }
        if (ok) floor++; }
      if (floor < need) return { floor: floor / all, wall: 0 };
      for (const y of [-1 / 3, 0, 1 / 3]) for (const x of [-1 / 3, 0, 1 / 3]) {
        const h = hit(x, y); if (h && h.distance < FACE_ROOM && WALL_NODES.has(topOf(h.object)?.name)) wall++; }
      return { floor: ARRIVE.pick, wall: wall / 9 };
    };
    const samples = [];
    for (let j = 0; j < 2; j++) for (let i = 0; i < 4; i++) {
      const x = -0.75 + i * 0.5, y = -0.75 + j * 0.5;
      if (document.elementFromPoint((x + 1) / 2 * innerWidth, (1 - y) / 2 * innerHeight) === renderer.domElement) samples.push([x, y]); }
    let pick = null;
    const log = [];
    for (const t of tries) {
      if (t.wall) continue;
      const fr = t.desk ? { floor: 0, wall: 0 } : frameOf(t), ok = t.desk || (fr.floor >= ARRIVE.pick && fr.wall <= ARRIVE.wall);
      log.push([t.desk ? DESK_ARRIVE.node : t.name, Math.round(THREE.MathUtils.radToDeg(t.way.angleTo(look))), +fr.floor.toFixed(3), +fr.wall.toFixed(2), ok]);
      if (ok) { pick = t; break; }
    }
    pick ??= tries.find((t) => !t.name && t.pitch >= deg(ARRIVE.tilt.at(-1)) - 1e-6) ?? tries.find((t) => !t.name);
    lastArrival = { travel: +THREE.MathUtils.radToDeg(Math.atan2(way.x, -way.z)).toFixed(1), turned: Math.round(THREE.MathUtils.radToDeg(pick.way.angleTo(look))), framed: pick.name, tried: log,
      ms: +(performance.now() - t0).toFixed(1) };
    way.copy(pick.way); pitch = pick.pitch; r = pick.r;
    arrivedAt = pick.name;
    spot.pos.copy(pos);
    spot.target.copy(pos).addScaledVector(way, r * Math.cos(pitch)).add(new THREE.Vector3(0, -r * Math.sin(pitch), 0));
    spot.fov = home.fov;
    return go(spot.id);
  }
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
  const okEye = new THREE.Vector3();
  let settleT = 0;
  let dragged = false;
  const okTgt = new THREE.Vector3();
  let panned = false;
  controls.addEventListener('start', () => { dragged = true; panned = false; rise = null; okEye.copy(camera.position); okTgt.copy(controls.target);
    dispatchEvent(new Event('room:drag')); });
  controls.addEventListener('change', () => {
    if (!walkNav || tween || !dragged || !inRoom()) return;
    const p = camera.position;
    const turned = controls.target.distanceToSquared(okTgt) < 1e-10;
    if (turned && walkNav.depth(p) > walkNav.depth(okEye) + 1e-6) p.copy(okEye);
    else if (!turned && p.distanceToSquared(okEye) > 1e-12) {
      panned = true;
      const q = walkNav.clamp(okEye, p);
      const [lo, hi] = walkNav.freeBand ?? [-Infinity, Infinity];
      q.y = THREE.MathUtils.clamp(q.y, Math.min(lo, okEye.y), Math.max(hi, okEye.y));
      if (q.distanceToSquared(p) > 1e-12) { const d = q.sub(p); camera.position.add(d); controls.target.add(d); }
    }
    if (p.distanceTo(okEye) > SETTLE_MOVE || !settleT) { clearTimeout(settleT); settleT = setTimeout(() => { settleT = 0; settleSpot(); }, 200); }
    okEye.copy(camera.position); okTgt.copy(controls.target);
  });
  controls.addEventListener('end', () => {
    if (!walkNav || !dragged || !inRoom()) return;
    setTimeout(settleSpot, 250);
    if (panned && Math.abs(camera.position.y - walkNav.eye) > 0.01) rise = { dy: walkNav.eye - camera.position.y, done: 0, t0: performance.now() };
    setTimeout(() => dispatchEvent(new Event('room:still')), 900);
  });
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
    if (k >= 1) { glide = null; dragged = true; settleSpot(); controls.update(); }
  }
  let pull = 0, pullT = 0;
  renderer.domElement.addEventListener('wheel', (ev) => {
    if (GATE || tween || current === home || ev.deltaY <= 0) return;
    if (camera.position.distanceTo(controls.target) < controls.maxDistance * 0.98) { pull = 0; return; }
    clearTimeout(pullT); pullT = setTimeout(() => { pull = 0; }, 500);
    if ((pull += ev.deltaY) > PULL_PX) { pull = 0; go(home.id); }
  }, { passive: true });

  const q = new THREE.Quaternion(), qI = new THREE.Quaternion(), dir = new THREE.Vector3(), eye = new THREE.Vector3(), tgt = new THREE.Vector3();
  function stepTween(now) {
    const { from, to, t0, ms, d0, r0, r1, turn, turnBy, first, walk, via, legs, metres, out, arc, inward, resolve } = tween;
    const eyes = walk ? easeWalk : first || out || !inward ? easePos : easeIn;
    tween.flown += Math.min(now - tween.seen, GATE ? Infinity : MOVE.frameMax); tween.seen = now;
    const k = Math.min(1, tween.flown / ms);
    const kt = Math.min(1, k / turnBy);
    const e = first ? eyes(Math.max(0, (k - MOVE.walkFrom) / (1 - MOVE.walkFrom))) : eyes(k);
    const et = first || walk ? easePos(kt) : ease(kt);
    if (arc) arcAt(from.pos, arc, to.pos, e, eye);
    else if (!via.length) eye.copy(from.pos).lerp(to.pos, e);
    else {
      let s = e * metres, i = 0;
      const pts = [from.pos, ...via, to.pos];
      while (i < legs.length - 1 && s > legs[i]) { s -= legs[i]; i++; }
      eye.copy(pts[i]).lerp(pts[i + 1], legs[i] ? Math.min(1, s / legs[i]) : 1);
    }
    dir.copy(d0).applyQuaternion(q.slerpQuaternions(qI, turn, et));
    if (k >= 1) tgt.copy(to.target); else tgt.copy(eye).addScaledVector(dir, r0 + (r1 - r0) * e);
    place(k >= 1 ? to.pos : eye, tgt, from.fov + (to.fov - from.fov) * e, shift3(from.shift).map((s, i) => s + (shift3(to.shift)[i] - s) * e));
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

  const nav = document.querySelector('.views');
  const buttons = new Map();
  let more = null, roomRow = null, back = null, addChip = null;
  function syncNav() {
    for (const [id, b] of buttons) b.setAttribute('aria-pressed', String(id === current.id));
    if (back) back.hidden = current === views[0];
    root.classList.toggle('away', current !== views[0]);
    if (roomRow && current !== views[0] && roomRow.contains(buttons.get(current.id))) setMore(true);
  }
  function setMore(open) {
    if (!more) return;
    more.setAttribute('aria-expanded', String(open));
    nav.classList.toggle('more-open', open);
  }
  back = Object.assign(document.createElement('button'), { type: 'button', className: 'back', hidden: true });
  back.innerHTML = 'Back to the room<span class="esc"> · Esc</span>';
  back.addEventListener('click', () => go(home.id));
  document.body.appendChild(document.createElement('div')).appendChild(back);
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
    addChip = (v) => { if (!buttons.has(v.id)) roomRow.appendChild(chip(v)); };
    for (const id of WORK_ORDER) { const v = views.find((x) => x.id === id); if (v) workRow.appendChild(chip(v)).classList.add('w'); }
    for (const v of views) if (!WORK_ORDER.includes(v.id)) roomRow.appendChild(chip(v));
    more = document.createElement('button');
    more.type = 'button';
    more.className = 'more';
    more.textContent = 'More views';
    more.setAttribute('aria-controls', roomRow.id);
    more.addEventListener('click', () => setMore(more.getAttribute('aria-expanded') !== 'true'));
    workRow.appendChild(more);
    if (!reduceMotion.matches && !params.has('nointro')) {
      const again = Object.assign(document.createElement('button'), { type: 'button', className: 'again', textContent: 'Fly in again' });
      again.addEventListener('click', () => {
        const u = new URL(location.href);
        u.searchParams.delete('intro');
        u.hash = '';
        location.assign(u.pathname + (u.search ? u.search + '&intro' : '?intro'));
      });
      roomRow.appendChild(again);
    }
    nav.append(workRow, roomRow);
    setMore(false);
    syncNav();
    const listBtn = Object.assign(document.createElement('button'), { type: 'button', className: 'views-btn', textContent: 'Views' });
    listBtn.setAttribute('aria-controls', nav.id);
    listBtn.setAttribute('aria-expanded', 'false');
    const setList = (open, focus = false) => {
      listBtn.setAttribute('aria-expanded', String(open));
      nav.classList.toggle('open', open);
      if (open && focus) nav.querySelector('button')?.focus();
    };
    listBtn.addEventListener('click', () => setList(!nav.classList.contains('open'), true));
    nav.addEventListener('click', (ev) => { if (ev.target.closest('button[data-view]') && nav.classList.contains('open')) { setList(false); listBtn.focus(); } });
    addEventListener('pointerdown', (ev) => { if (nav.classList.contains('open') && !nav.contains(ev.target) && !listBtn.contains(ev.target)) setList(false); }, true);
    addEventListener('keydown', (ev) => {
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
    moving: () => !!tween, go: (id, ...a) => (CASES[id]?.in ? openCase(id) : go(id, ...a)), card: (c) => showCase(current.id, c), panning: () => controls.enablePan, where: hotOf, intent: (x, y, touch) => intentAt(resolveAt(x, y), x, y, touch), cardOf: (id) => (!CASES[id] && CAPTION_OF[id]) || null,
    hot: (o) => caseOf(topOf(o)) ?? hot.get(topOf(o)) ?? null, below: (o) => { const b = HOT_BELOW[topOf(o)?.name]; return b && views.some((v) => v.id === b.id) ? b : null; }, label: (id) => viewOf(id)?.label ?? OWN_TAG[id] ?? id, own: (id) => !!OWN_TAG[id], home: home.id, inRoom: () => inRoom(),
    pxPerMetre: () => { const a = innerWidth / innerHeight, t = Math.tan(THREE.MathUtils.degToRad(home.fov) / 2) * (a >= heroAspect ? 1 : Math.min(heroAspect / a, PORTRAIT_MAX));
      return innerHeight / (2 * t); },
    fovOf: lensToFov, heroPos: home.pos.clone(), heroTarget: home.target.clone(), stands: () => stands, nav: () => walkNav, cursors: CURSOR,
    addStands: (list, step, table) => { stands.push(...list.map((s) => ({ ...s, shift: [0, 0], stand: true }))); stepOf = step; walkNav = table ?? null;
      for (const s of stands) if (CHIP_STANDS.includes(s.id)) addChip?.(s);
      syncNav(); } }) : [];
  syncPan();
  for (const l of layers) l.onView?.(current.id);
  scene.updateMatrixWorld(true);
  solid = []; scene.traverse((o) => { if (isSolid(o)) solid.push(o); }); inside = null;
  for (const o of solid) runsOf(o);
  const cluster = document.querySelector('.controls');
  if (cluster) for (const b of document.querySelectorAll('body > button')) cluster.appendChild(b);
  const gutter = () => { if (cluster) root.style.setProperty('--controls-w', `${Math.ceil(cluster.getBoundingClientRect().width) + 10}px`); };
  gutter(); addEventListener('resize', gutter);
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

  const AMBIENT_MS = 30;
  let last = performance.now(), lastDraw = 0, ambient = false, frameNow = 0;
  renderer.setAnimationLoop((now) => {
    frameNow = now;
    const dt = Math.min(0.25, Math.max(0, (now - last) / 1000));
    last = now;
    if (tween) stepTween(now);
    else if (glide) stepGlide(now);
    else if (controls.enabled && controls.update()) needsRender = true;
    if (rise && !tween && !glide) stepRise(now);
    if (!tween && current.reframes) {
      const want = shift3(current.shift);
      if (want.some((s, i) => Math.abs(s - (shift[i] ?? 0)) > 1e-4)) {
        const a = reduceMotion.matches ? 1 : Math.min(1, dt / 0.35);
        place(camera.position, controls.target, baseFov, want.map((s, i) => (Math.abs(s - (shift[i] ?? 0)) < 2e-3 ? s : (shift[i] ?? 0) + (s - (shift[i] ?? 0)) * a)));
        needsRender = true;
      }
    }
    if (!tween) guardEye();
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
  addEventListener('room:pick', () => relabel());
  function openCase(id) {
    const c = CASES[id];
    if (!c?.in || !viewOf(c.in)) return null;
    if (current.id !== c.in || tween) { pending = id; return current.id === c.in ? null : go(c.in); }
    history.replaceState({ roomView: c.in, case: id }, '', `${location.pathname}${location.search}#${id}`);
    showCase(id);
    caseEl?.querySelector('h2')?.focus({ preventScroll: true });
    if (matchMedia('(max-width: 640px)').matches) caseEl?.querySelector('.grip')?.click();
    said.textContent = `Case: ${c.t}`;
    return Promise.resolve(id);
  }
  function showCase(id, given = null) {
    shown = CASES[id] && !given ? id : null;
    dispatchEvent(new CustomEvent('room:case', { detail: shown }));
    relabel = () => {};
    const cap = !CASES[id] && CAPTION_OF[id] ? api.hotspots?.caption?.(CAPTION_OF[id]) : null;
    const place = PLACE_CARDS[id] ?? viewOf(id)?.card;
    const c = given ?? CASES[id] ?? (cap && { k: cap.kicker, t: cap.title, b: cap.body, acts: [...(CAPTION_ACTS[id] ?? []), ...(cap.more ? [{ label: cap.more.label, href: cap.more.href, ext: true }] : [])] })
      ?? (place && id !== home.id ? { k: 'In the room', t: viewOf(id).label, b: place, place: true } : null);
    root.classList.toggle('has-case', !!c);
    if (!caseEl) return;
    caseEl.replaceChildren();
    if (!c) return;
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };
    caseEl.classList.remove('open');
    const grip = Object.assign(el('button', 'grip'), { type: 'button' });
    grip.setAttribute('aria-label', 'Show the whole case');
    if (!matchMedia('(max-width: 640px)').matches) grip.tabIndex = -1;
    grip.setAttribute('aria-expanded', 'false');
    const toggle = () => grip.setAttribute('aria-expanded', String(caseEl.classList.toggle('open')));
    grip.addEventListener('click', toggle);
    const body = el('p', 'b', c.b);
    if (c.pre) body.style.whiteSpace = 'pre-line';
    body.addEventListener('click', toggle);
    const h = el('h2', '', c.t);
    h.tabIndex = -1;
    caseEl.append(grip, el('p', 'k', c.k), h, body);
    const first = matchMedia('(pointer: coarse)').matches;
    if (c.acts?.length) {
      const row = el('div', 'acts');
      const live = [];
      const say = (a) => (typeof a.label === 'function' ? a.label(api) : a.label);
      const mails = c.acts.filter((x) => x.mail), rest = c.acts.filter((x) => !x.mail);
      for (const a of first ? [...mails, ...rest] : [...rest, ...mails]) {
        const b = a.href ? Object.assign(el('a', a.mail ? 'mail' : '', say(a)), { href: a.href }, a.ext ? { target: '_blank', rel: 'noopener' } : {})
          : Object.assign(el('button', '', say(a)), { type: 'button' });
        if (a.vh) b.appendChild(el('span', 'vh', a.vh));
        if (typeof a.label === 'function') live.push([b, a]);
        if (a.run) b.addEventListener('click', () => { a.run(api); needsRender = true; relabel(); });
        if (a.case) { b.dataset.case = a.case; b.addEventListener('click', () => openCase(a.case)); }
        if (a.go) { b.dataset.go = a.go; b.addEventListener('click', () => go(a.go)); }
        row.appendChild(b);
      }
      relabel = () => { for (const [b, a] of live) b.textContent = say(a); };
      if (first) caseEl.insertBefore(row, body); else caseEl.appendChild(row);
    }
    if (OWN_FIG[id]) {
      const fig = el('div', 'fig');
      caseEl.insertBefore(fig, body);
      OWN_FIG[id](api, fig, c, GATE || reduceMotion.matches);
    }
  }
  const said = Object.assign(document.createElement('p'), { className: 'view-status' });
  said.setAttribute('role', 'status');
  said.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;margin:0';
  document.body.appendChild(said);
  const hintEl = Object.assign(document.createElement('p'), { className: 'nav-hint' });
  hintEl.setAttribute('role', 'status');
  document.body.appendChild(hintEl);
  const coarse = matchMedia('(pointer: coarse)');
  const canvasEl = renderer.domElement;
  const how = Object.assign(document.createElement('p'), { id: 'room-how', textContent: coarse.matches ? MOVE_HINT.touch : MOVE_HINT.mouse });
  how.style.cssText = said.style.cssText;
  document.body.appendChild(how);
  canvasEl.tabIndex = 0;
  canvasEl.setAttribute('aria-label', 'The room, in 3D');
  canvasEl.setAttribute('aria-describedby', how.id);
  if (walkNav) {
    const moveHint = () => { if (!document.querySelector('.prompt:not([hidden])')) navHint(MOVE_HINT); };
    const onFloor = () => { moveHint(); if (hinted) removeEventListener('room:floor', onFloor); };
    addEventListener('room:floor', onFloor);
    if (coarse.matches) {
      if (root.dataset.intro === 'playing') addEventListener('room:intro', () => setTimeout(moveHint, 2600), { once: true });
      else setTimeout(moveHint, 2600);
    }
  }
  let hinted = false;
  function navHint(words = NAV_HINT) {
    if (hinted || GATE) return;
    hinted = true;
    try { if (localStorage.getItem(NAV_HINT_KEY) === '1') return; localStorage.setItem(NAV_HINT_KEY, '1'); } catch {   }
    hintEl.textContent = coarse.matches ? words.touch : words.mouse;
    const cap = innerWidth <= 640 && document.querySelector('.caption')?.getBoundingClientRect();
    hintEl.style.top = cap ? `${Math.round(cap.bottom + 6)}px` : '';
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
    if (id !== home.id && !GATE && !viewOf(id)?.stand) navHint();
    if (own) openCase(own);
  };
  if (params.has('dev')) import('./dev.js').then((m) => m.default({ params, state, views })).catch((e) => console.warn('room: dev panel', e));
  const narrow = matchMedia('(max-width: 640px)');
  if (views.some((v) => v.id === 'experiment')) addEventListener('room:scan', () => {
    if (current.id !== 'overview' || tween || !caseEl) return;
    if (narrow.matches) { scanPill(); return; }
    CASES.overview = { k: 'Live', t: 'The projector is scanning the vase',
      b: 'Stripes of light label every point on it; in a moment it turns into its own point cloud.',
      acts: [{ label: 'See it up close', run: () => go('experiment') }] };
    showCase('overview');
    delete CASES.overview;
    setTimeout(() => { if (current.id === 'overview') showCase('overview'); }, 15000);
  });
  let picked = false;
  addEventListener('room:pick', () => { picked = true; }, { once: true });
  function scanPill() {
    if (!picked || document.querySelector('.toast')) return;
    const prompt = document.querySelector('.prompt');
    const pill = document.createElement('p');
    pill.className = 'prompt scan';
    const b = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Scanning the vase · see it up close' });
    b.addEventListener('click', () => { pill.remove(); go('experiment'); });
    pill.appendChild(b);
    const was = prompt?.hidden;
    if (prompt) prompt.hidden = true;
    document.body.appendChild(pill);
    const done = () => { if (!pill.isConnected) return; pill.remove(); if (prompt && !was) prompt.hidden = false; };
    setTimeout(done, 12000);
    addEventListener('room:pick', () => pill.remove(), { once: true });
  }
  showCase(current.id);
  const hashId = location.hash.slice(1);
  const linked = !viewOf(hashId) && viewOf(ALIAS[hashId]) ? ALIAS[hashId] : hashId;
  if (!GATE && linked !== hashId) history.replaceState(null, '', location.pathname + location.search + (linked === home.id ? '' : `#${linked}`));
  if (!GATE && linked !== home.id && viewOf(linked)) {
    history.replaceState(null, '', location.pathname + location.search);
    go(linked);
  } else if (!GATE && CASES[linked]?.in) {
    history.replaceState(null, '', location.pathname + location.search);
    openCase(linked);
  } else if (!GATE && /^disk-/.test(linked) && viewOf('c64') && api.c64?.open) {
    history.replaceState(null, '', location.pathname + location.search);
    if (!api.c64.open(linked.slice(5))) history.replaceState(null, '', location.pathname + location.search);
  }
  flyTo = (id) => (CASES[id]?.in ? openCase(id) : views.some((v) => v.id === id) ? go(id) : null);
  work?.sync();
  addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape' || GATE || ev.defaultPrevented || work?.isOpen() || current === views[0]) return;
    go(views[0].id);
  });
  const roomFocused = () => { const a = document.activeElement; return !a || a === document.body || a === document.documentElement || a === renderer.domElement; };
  const STEP_KEYS = { ArrowUp: [1, 0], KeyW: [1, 0], ArrowDown: [-1, 0], KeyS: [-1, 0], ArrowLeft: [0, -1], KeyA: [0, -1], ArrowRight: [0, 1], KeyD: [0, 1] };
  addEventListener('keydown', (ev) => {
    if (GATE || tween || glide || ev.altKey || ev.ctrlKey || ev.metaKey || work?.isOpen()) return;
    if (ev.target.closest?.('input, textarea, select, [contenteditable]')) return;
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
    if (walkNav && inRoom()) return;
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
  const prompt = document.querySelector('.prompt');
  if (prompt && !GATE && api.hotspots) {
    const btn = prompt.querySelector('button');
    if (matchMedia('(pointer: coarse)').matches) btn.textContent = HINT.touch;
    let shown = false;
    const reveal = () => { if (shown) return; shown = true;
      try { if (localStorage.getItem(HINT_KEY) === '1') return; localStorage.setItem(HINT_KEY, '1'); } catch {   }
      prompt.hidden = false; };
    const edges = () => api.tags?.edges();
    if (root.dataset.intro === 'playing') {
      addEventListener('room:intro-prompt', reveal, { once: true });
      addEventListener('room:intro', () => setTimeout(() => { reveal(); edges(); }, 400), { once: true });
    } else setTimeout(() => { reveal(); edges(); }, 900);
    btn.addEventListener('click', edges);
    addEventListener('room:pick', () => { prompt.hidden = true; }, { once: true });
  }

  if (!GATE && root.dataset.intro === 'playing' && views.some((v) => v.id === 'action')) addEventListener('room:intro', () => {
    if ((api.intro?.elapsed?.() ?? 0) < 5) return;
    const toast = document.createElement('p');
    toast.className = 'toast';
    toast.setAttribute('role', 'status');
    const see = Object.assign(document.createElement('button'), { type: 'button', textContent: 'See the maths' });
    const gone = () => { toast.remove(); dispatchEvent(new Event('room:toast-gone')); };
    see.addEventListener('click', () => { gone(); go('action'); });
    toast.append('That flight was a stationary path of the action. ', see);
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('on'));
    let out = 0, held = 0;
    const arm = () => { clearTimeout(out); out = setTimeout(() => { toast.classList.remove('on'); setTimeout(gone, 400); }, TOAST_MS); };
    const hold = (d) => { held = Math.max(0, held + d); if (held) clearTimeout(out); else arm(); };
    toast.addEventListener('pointerenter', () => hold(1)); toast.addEventListener('pointerleave', () => hold(-1));
    toast.addEventListener('focusin', () => hold(1)); toast.addEventListener('focusout', () => hold(-1));
    arm();
    const leave = () => { if (current.id !== home.id && toast.isConnected) { clearTimeout(out); gone(); } };
    addEventListener('room:move', leave);
    addEventListener('room:arrive', leave);
  }, { once: true });

  state.info = () => { renderer.render(scene, camera); return { ...renderer.info.render, programs: renderer.info.programs.length }; };
  state.coverage = (names, opts = {}) => {
    const W4 = Math.max(1, Math.round(innerWidth / 4)), H4 = Math.max(1, Math.round(innerHeight / 4));
    const rt = new THREE.WebGLRenderTarget(W4, H4);
    const ids = names.map((_, i) => new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB((i + 1) * 16 / 255, 0, 0, THREE.LinearSRGBColorSpace) }));
    const black = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const saved = [];
    scene.traverse((o) => {
      if (!(o.isMesh || o.isPoints || o.isLine || o.isSprite)) return;
      let i = -1;
      for (let p = o; p && i < 0; p = p.parent) i = names.indexOf(p.name);
      const keep = o.isMesh && !o.material?.transparent && o.visible && !(opts.alone && i < 0);
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
  const b2t = (p) => new THREE.Vector3(p[0], p[2], -p[1]);
  state.pose = (eye, target, fov) => {
    camera.position.copy(b2t(eye)); controls.target.copy(b2t(target));
    if (fov) camera.fov = fov;
    camera.updateProjectionMatrix(); camera.lookAt(controls.target); renderer.render(scene, camera);
  };
  if (GATE) state.three = { scene, camera, THREE };
  state.project = (p) => { const v = b2t(p).project(camera); return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight, v.z]; };
  state.arrival = () => lastArrival;
  state.hotNames = () => [...hot.keys()].map((o) => o.name);
  state.screenOf = (name) => { const o = scene.getObjectByName(name); if (!o) return null;
    const v = new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3()).project(camera); return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight]; };
  state.hotMap = (step = 32, touch = coarse.matches) => {
    const out = { none: [] };
    for (let y = step / 2; y < innerHeight; y += step) for (let x = step / 2; x < innerWidth; x += step) {
      if (document.elementFromPoint(x, y) !== renderer.domElement) continue;
      const it = intentAt(resolveAt(x, y), x, y, touch);
      (out[it.kind === 'go' ? it.id : it.kind === 'walk' ? `walk:${it.id}` : it.kind] ??= []).push([x, y]);
      if (it.case) (out[`case:${it.case}`] ??= []).push([x, y]);
    }
    return out;
  };
  state.intent = (x, y, touch = coarse.matches) => { const r = resolveAt(x, y), it = intentAt(r, x, y, touch);
    return { kind: it.kind, id: it.id ?? null, case: it.case ?? null, pick: it.pick?.object.name ?? null, hit: r.hit?.object.name ?? null,
      top: r.hit ? topOf(r.hit.object)?.name ?? null : null, at: r.hit?.point.toArray().map((c) => +c.toFixed(3)) ?? null,
      to: it.kind === 'walk' ? it.at.toArray().map((c) => +c.toFixed(3)) : null }; };
  state.rayCheck = (step = 24) => {
    let rays = 0; const bad = [], off = [], pre = chunked.size;
    const near = (a, b) => !a === !b && (!a || Math.abs(a.distance - b.distance) <= 1e-4);
    for (let y = step / 2; y < innerHeight; y += step) for (let x = step / 2; x < innerWidth; x += step) {
      resolveAt(x, y);
      const a = firstHit(solid), b = ray.intersectObjects(solid, false)[0] ?? null;
      const c = ray.intersectObjects(scene.children, true).find((h) => isSolid(h.object)) ?? null;
      rays++;
      if (!near(a, b)) bad.push([x, y, a?.object.name ?? null, b?.object.name ?? null]);
      if (!near(a, c)) off.push([x, y, a?.object.name ?? null, c?.object.name ?? null]);
    }
    return { rays, mismatches: bad.length, bad: bad.slice(0, 5), unlisted: off.length, off: off.slice(0, 5), solid: solid.length, chunked: pre };
  };
  state.layers = api;
  state.bounds = () => walkNav?.bounds() ?? null;
  state.route = (a, b) => (walkNav ? walkNav.route(new THREE.Vector3(...a), new THREE.Vector3(...b))?.map((p) => p.toArray()) ?? null : null);
  state.free = (p) => (walkNav ? walkNav.depth(new THREE.Vector3(...p)) : null);
  state.cursors = () => ({ ...CURSOR });
  state.cases = () => Object.keys(CASES).filter((id) => views.some((v) => v.id === id));
  state.ownCases = () => Object.fromEntries(Object.entries(CASES).filter(([, c]) => c.in && views.some((v) => v.id === c.in)).map(([id, c]) => [id, c.in]));
  state.caseShown = () => shown;
  state.openCase = (id) => openCase(id);
  state.mode = 'webgl';
  state.ready = true;
}

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
  let down = null;
  const fingers = new Set();
  canvas.addEventListener('pointerdown', (ev) => {
    fingers.add(ev.pointerId);
    down = ev.button === 0 && fingers.size === 1 ? { x: ev.clientX, y: ev.clientY, t: performance.now(), id: ev.pointerId } : null;
    if (ev.pointerType === 'mouse') canvas.style.cursor = ev.button === 2 && live.panning() ? live.cursors.pan : ev.button === 0 ? live.cursors.turn : canvas.style.cursor;
  });
  const lift = (ev) => { fingers.delete(ev.pointerId); };
  canvas.addEventListener('pointercancel', (ev) => { lift(ev); down = null; });
  canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());
  canvas.addEventListener('pointerup', (ev) => {
    lift(ev);
    if (ev.pointerType === 'mouse') lastX = lastY = -1e3;
    if (!down || down.id !== ev.pointerId || Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > 6 || performance.now() - down.t > 600) { down = null; return; }
    down = null;
    live.clickAt(ev.clientX, ev.clientY, ev.pointerType === 'touch');
  });
  var queued = null, lastX = -1e3, lastY = -1e3;
  addEventListener('room:arrive', () => { lastX = lastY = -1e3; });
  canvas.addEventListener('pointermove', (ev) => {
    if (ev.pointerType !== 'mouse' || ev.buttons) return;
    if (!queued && Math.hypot(ev.clientX - lastX, ev.clientY - lastY) < 2) return;
    if (!queued) requestAnimationFrame(() => {
      const { x, y } = queued; queued = null;
      if (live.moving()) return;
      lastX = x; lastY = y;
      const r = live.resolveAt(x, y), it = live.intentAt(r, x, y, false);
      if (it.kind === 'walk') dispatchEvent(new Event('room:floor'));
      const cur = live.cursorOf(it);
      if (canvas.style.cursor !== cur) canvas.style.cursor = cur;
      for (const l of layers) l.hover?.(it, x, y, r);
    });
    queued = { x: ev.clientX, y: ev.clientY };
  });
  return layers;
}

function setupCaption() {
  const cap = document.querySelector('.caption');
  const btn = cap?.querySelector('.cap-more');
  btn?.addEventListener('click', () => btn.setAttribute('aria-expanded', String(cap.classList.toggle('open'))));
}

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
    dispatchEvent(new CustomEvent('room:skipintro'));
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
  const own = document.querySelector('[data-own]'), ownTitle = sheet.querySelector('#work-own');
  own?.addEventListener('click', (ev) => { ev.preventDefault(); open(own); ownTitle?.focus({ preventScroll: true }); ownTitle?.scrollIntoView({ block: 'start' }); });
  sheet.querySelector('.work-close')?.addEventListener('click', (ev) => { ev.preventDefault(); close(); });
  document.addEventListener('keydown', (ev) => {
    if (!isOpen()) return;
    if (ev.key === 'Escape') { ev.preventDefault(); ev.stopImmediatePropagation(); close(); return; }
    if (ev.key !== 'Tab') return;
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
      close(document.querySelector(`.views button[data-view="${id}"]`) ?? link);
      flyTo?.(id);
    });
  }
  if (location.hash === '#work') open(link);
  else if (location.hash === '#work-own') own?.click();
  addEventListener('hashchange', () => { if (location.hash === '#work') open(link); else if (location.hash === '#work-own') own?.click(); });
  return { open, close, isOpen, sync };
}

root.classList.add('js');
setupCaption();
const work = setupWork();

function report() {
  if (location.hash !== '#debug') return;
  const p = document.querySelector('.caption p');
  if (p) p.textContent = `viewer: ${state.mode}${state.error ? ' (' + state.error + ')' : ''}`;
}
start().catch((err) => {
  console.error('room viewer failed, showing the still:', err);
  stillLine(C.status.failed);
  state.mode = 'fallback'; state.error = String(err); state.ready = true;
}).finally(report);
