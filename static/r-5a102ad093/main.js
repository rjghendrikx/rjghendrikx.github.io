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
const LAYERS = ['layer-terminal.js', 'layer-projector.js', 'layer-chamber.js', 'layer-geiger.js', 'layer-eraser.js', 'layer-rain.js', 'layer-water.js', 'layer-audio.js', 'layer-hotspots.js', 'layer-lidar.js', 'layer-intro.js'];
// Case cards: one project per work viewpoint (lib/layouts/canal_house.py VIEWS), shown in .case (aria-live)
// when the camera arrives. A view id that the layout lacks is skipped. acts: DOM buttons for the room's picks
// ({ label, run: layer api call }) and links.
// The work cases have one source (panel 015 action 15): kicker, title and text come from index.html #work (also
// the no-JS version); a card adds only `room`, a sentence about what is in front of you, and its acts.
// [check] all copy: facts from llms-full.txt (public), Ruud reads it; see notes/captions.md, "Case copy".
const WORK = {
  // [check] card only, unchanged since 013
  chamber: { room: 'The chamber in front of you works the same way: the cosmic-ray flux is real, the tracks are simulated.',
    acts: [{ label: 'Hear the Geiger counter', run: (L) => L.geiger?.sound(true) }] },
  // [check] card only (panel 015 action 1 wording)
  experiment: { room: 'Watch the projector: its stripes label the vase point by point, and the vase becomes its own point cloud.',
    acts: [{ label: 'Run the scan', run: (L) => L.projector?.start() }, { label: 'How this room was made', href: 'colophon.html' }] },
  terminal: { acts: [{ label: 'How this room was made', href: 'colophon.html' }] },
};
function workCase(id, { room, acts }) {
  const a = document.querySelector(`#work article[data-view="${id}"]`);
  if (!a) return null;
  const text = (q) => a.querySelector(q)?.textContent.replace(/\s+/g, ' ').trim() ?? '';
  return { k: text('.k'), t: text('h3'), b: [text('p.text'), room].filter(Boolean).join(' '), acts };
}
const CASES = {
  ...Object.fromEntries(Object.entries(WORK).map(([id, w]) => [id, workCase(id, w)]).filter(([, c]) => c)),
  bench: { k: 'Try it', t: 'The bench',
    b: 'A classical quantum eraser on the breadboard, a cloud chamber, and a Geiger counter wired to the scope.',
    acts: [{ label: 'Insert the polarizer', run: (L) => L.eraser?.toggle(false) }, { label: 'Hear the Geiger counter', run: (L) => L.geiger?.sound(true) }] },
  projector: { k: 'Try it', t: 'Structured light',
    b: 'The projector is the scanner’s light source; its stripes label every point on the vase with a column and a row.',   // [check] panel 015 action 1
    acts: [{ label: 'Run the scan', run: (L) => L.projector?.start() }] },
};
const ORBIT_KEY = 0.06;          // rad per arrow-key press (keyboard orbit inside the viewpoint's cone)
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const root = document.documentElement;
const state = (window.__room = { mode: 'loading', ready: false });
if (GATE) root.classList.add('gate');

const SENSOR = 36;              // mm, horizontal sensor fit (lib/scene.py)
const TWEEN_MS = 1100;
// Orbit stays a small cone around each viewpoint: no pan, little zoom.
const ORBIT = { az: 0.35, polarUp: 0.18, polarDown: 0.12, near: 0.85, far: 1.12 };
// Portrait screens: widen the vertical FOV by at most this factor (tan space) and crop the sides,
// instead of keeping the full 16:9 width (which leaves the bench a thin strip on a phone).
const PORTRAIT_MAX = 1.9;

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
  for (const o of meshes) {
    const ud = o.userData.bake_tex ? o.userData : o.parent?.userData ?? {};
    const file = ud.tex ?? ud.bake_tex?.replace(/\.jpg$/, '.ktx2');
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    o.material = mat;
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

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
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
    controls.maxPolarAngle = Math.min(Math.PI / 2 - 0.05, sph.phi + ORBIT.polarDown);
  }

  function place(pos, target, fov) {
    camera.position.copy(pos);
    camera.lookAt(target);
    baseFov = fov;
    camera.fov = fitFov();
    camera.updateProjectionMatrix();
  }

  let current = views[0];
  let onArrive = () => {};          // set once the layers are mounted
  place(current.pos, current.target, current.fov);
  setLimits(current.pos, current.target);
  controls.update();

  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = fitFov();
    camera.updateProjectionMatrix();
    needsRender = true;
  }

  let needsRender = true;
  let tween = null;
  controls.addEventListener('change', () => { needsRender = true; });
  // a drag or wheel moves the camera: the first-view glows (layer-hotspots.js pulse) would point at nothing
  controls.addEventListener('start', () => document.querySelectorAll('.hs-glow').forEach((e) => e.remove()));
  addEventListener('resize', resize);
  resize();

  // Animate to a viewpoint: position, target and FOV, eased; instant under prefers-reduced-motion.
  function goTo(id) {
    const v = views.find((x) => x.id === id);
    if (!v) return Promise.reject(new Error(`no viewpoint ${id}`));
    current = v;
    syncNav();
    // drop any orbit inertia left from a drag, or the damping would carry the camera past the viewpoint
    const damp = controls.enableDamping;
    controls.enableDamping = false; controls.update(); controls.enableDamping = damp;
    const from = { pos: camera.position.clone(), target: controls.target.clone(), fov: baseFov };
    if (reduceMotion.matches) {
      tween = null;
      place(v.pos, v.target, v.fov);
      setLimits(v.pos, v.target);
      controls.update();
      needsRender = true;
      onArrive(id);
      return Promise.resolve(id);
    }
    controls.enabled = false;
    // open the limits while moving, so OrbitControls cannot clamp the path
    Object.assign(controls, { minAzimuthAngle: -Infinity, maxAzimuthAngle: Infinity, minPolarAngle: 0,
      maxPolarAngle: Math.PI, minDistance: 0, maxDistance: Infinity });
    return new Promise((resolve) => {
      tween = { from, to: v, t0: performance.now(), resolve };
    });
  }

  function stepTween(now) {
    const { from, to, t0, resolve } = tween;
    const k = Math.min(1, (now - t0) / TWEEN_MS);
    const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;   // easeInOutCubic
    const tgt = from.target.clone().lerp(to.target, e);
    place(from.pos.clone().lerp(to.pos, e), tgt, from.fov + (to.fov - from.fov) * e);
    controls.target.copy(tgt);
    if (k >= 1) {
      tween = null;
      setLimits(to.pos, to.target);
      controls.enabled = !GATE;
      controls.update();
      onArrive(to.id);
      resolve(to.id);
    }
    needsRender = true;
  }

  // The nav: one small button per viewpoint, plain-English labels.
  const nav = document.querySelector('.views');
  const buttons = new Map();
  function syncNav() {
    for (const [id, b] of buttons) b.setAttribute('aria-pressed', String(id === current.id));
  }
  if (nav) {
    for (const v of views) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = v.label;
      b.dataset.view = v.id;
      b.addEventListener('click', () => goTo(v.id));
      nav.appendChild(b);
      buttons.set(v.id, b);
    }
    syncNav();
  }

  await Promise.all(loads);
  const layers = LIVE ? await mountLayers({ THREE, scene, camera, renderer, byName, gate: GATE, reduceMotion,
    params, root, view: () => current.id, render: () => { needsRender = true; } }) : [];
  for (const l of layers) l.onView?.(current.id);
  // layer toggles (Lidar, ...) join the page's control cluster instead of stacking on their own
  const cluster = document.querySelector('.controls');
  if (cluster) for (const b of document.querySelectorAll('body > button')) cluster.appendChild(b);
  // the phone caption's right gutter follows the cluster's real width (index.html --controls-w)
  const gutter = () => { if (cluster) root.style.setProperty('--controls-w', `${Math.ceil(cluster.getBoundingClientRect().width) + 10}px`); };
  gutter(); addEventListener('resize', gutter);
  renderer.render(scene, camera);
  root.classList.add('ready');

  // Render on demand: idle frames cost nothing on a phone. Layers advance their own clocks by the
  // frame time, capped, so a hidden tab (no frames) pauses them and nothing catches up on return.
  // Ambient animation (a layer's update() returning true: rain, chamber trails, the terminal) draws
  // at most every AMBIENT_MS; input, the tween and live.render() (the intro's camera) stay at full rate.
  const AMBIENT_MS = 30;          // ~30 Hz (notes/perf.md); 30, not 33.3, so 60 Hz rAF jitter keeps every 2nd frame
  let last = performance.now(), lastDraw = 0, ambient = false;
  renderer.setAnimationLoop((now) => {
    const dt = Math.min(0.25, Math.max(0, (now - last) / 1000));
    last = now;
    if (tween) stepTween(now);
    else if (controls.enabled && controls.update()) needsRender = true;
    if (!document.hidden) for (const l of layers) if (l.update(dt)) ambient = true;
    if (needsRender || (ambient && now - lastDraw >= AMBIENT_MS)) {
      renderer.render(scene, camera);
      needsRender = ambient = false;
      lastDraw = now;
    }
  });
  const api = Object.fromEntries(layers.map((l) => [l.name, l.api]));
  const caseEl = document.querySelector('.case');
  function showCase(id) {
    const c = CASES[id];
    root.classList.toggle('has-case', !!c);
    if (!caseEl) return;
    caseEl.replaceChildren();
    if (!c) return;
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };
    caseEl.classList.remove('open');
    // phone: a bottom sheet at ~25% height; the grip (or a tap on the body) opens it (index.html; hidden on desktop)
    const grip = Object.assign(el('button', 'grip'), { type: 'button' });
    grip.setAttribute('aria-label', 'Show the whole case');
    grip.setAttribute('aria-expanded', 'false');
    const toggle = () => grip.setAttribute('aria-expanded', String(caseEl.classList.toggle('open')));
    grip.addEventListener('click', toggle);
    const body = el('p', 'b', c.b);
    body.addEventListener('click', toggle);
    caseEl.append(grip, el('p', 'k', c.k), el('h2', '', c.t), body);
    if (c.acts?.length) {
      const row = el('div', 'acts');
      for (const a of c.acts) {
        const b = a.href ? Object.assign(el('a', '', a.label), { href: a.href }) : Object.assign(el('button', '', a.label), { type: 'button' });
        if (a.run) b.addEventListener('click', () => { a.run(api); needsRender = true; });
        row.appendChild(b);
      }
      caseEl.appendChild(row);
    }
  }
  onArrive = (id) => { for (const l of layers) l.onView?.(id); showCase(id); };
  // the reveal: when the projector starts scanning while the visitor is on the overview, the case card
  // says so and offers the close-up (the vase is small from the back of the room)
  if (views.some((v) => v.id === 'experiment')) addEventListener('room:scan', () => {
    if (current.id !== 'overview' || tween || !caseEl) return;
    CASES.overview = { k: 'Live', t: 'The projector is scanning the vase',
      b: 'Stripes of light label every point on it; in a moment it turns into its own point cloud.',   // [check] panel 015 action 1
      acts: [{ label: 'See it up close', run: () => goTo('experiment') }] };
    showCase('overview');
    delete CASES.overview;
    setTimeout(() => { if (current.id === 'overview') showCase('overview'); }, 15000);   // the scan is over: clear
  });
  showCase(current.id);
  // "Show me in the room" in the Work sheet (setupWork) flies to the case's viewpoint, if this layout has it
  flyTo = (id) => (views.some((v) => v.id === id) ? goTo(id) : null);
  work?.sync();
  // Arrow keys orbit inside the viewpoint's cone (OrbitControls maps them to pan, which is off here)
  addEventListener('keydown', (ev) => {
    if (GATE || tween || ev.altKey || ev.ctrlKey || ev.metaKey || work?.isOpen()) return;
    if (ev.target.closest?.('input, textarea, select, [contenteditable]')) return;
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
    if (matchMedia('(pointer: coarse)').matches) btn.textContent = 'Tap anything that glows';
    const reveal = () => { prompt.hidden = false; api.hotspots.pulse(); };
    if (root.dataset.intro === 'playing') addEventListener('room:intro', () => setTimeout(reveal, 400), { once: true });
    else setTimeout(reveal, 900);
    btn.addEventListener('click', () => api.hotspots.pulse());
    addEventListener('room:pick', () => { prompt.hidden = true; }, { once: true });
  }

  // Gate hooks: draw-call count, a forced-render frame-rate sample, camera state, viewpoints.
  state.info = () => { renderer.render(scene, camera); return { ...renderer.info.render, programs: renderer.info.programs.length }; };
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
    pos: camera.position.toArray(), target: controls.target.toArray(), view: current.id, moving: !!tween });
  state.views = () => views.map((v) => ({ id: v.id, label: v.label, pos: v.pos.toArray(), target: v.target.toArray() }));
  state.goTo = goTo;
  state.layers = api;
  state.cases = () => Object.keys(CASES).filter((id) => views.some((v) => v.id === id));
  state.mode = 'webgl';
  state.ready = true;
}

// Live layers: import each module, mount it, and route canvas clicks/hover to what the layers made
// pickable ({ object, accept(worldPoint) -> bool, onPick() }). A click is a press that hardly moved.
async function mountLayers(live) {
  const canvas = live.renderer.domElement;
  live.picks = [];
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
  const ray = new live.THREE.Raycaster();
  const ndc = new live.THREE.Vector2();
  function pickAt(ev) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, live.camera);
    const hits = ray.intersectObjects(live.scene.children, true);
    if (!hits.length) return null;
    return live.picks.find((p) => (hits[0].object === p.object || p.object.getObjectById(hits[0].object.id))
      && p.accept(hits[0].point)) ?? null;
  }
  let down = null;
  canvas.addEventListener('pointerdown', (ev) => { down = { x: ev.clientX, y: ev.clientY, t: performance.now() }; });
  canvas.addEventListener('pointerup', (ev) => {
    if (!down || Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > 6 || performance.now() - down.t > 600) return;
    down = null;
    const p = pickAt(ev);
    if (p) { p.onPick(); dispatchEvent(new CustomEvent('room:pick', { detail: p.object.name })); }
  });
  let hoverQueued = false;
  canvas.addEventListener('pointermove', (ev) => {
    if (ev.pointerType !== 'mouse' || ev.buttons || hoverQueued) return;
    hoverQueued = true;
    requestAnimationFrame(() => { hoverQueued = false; canvas.style.cursor = pickAt(ev) ? 'pointer' : ''; });
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
  const link = document.querySelector('[data-work]');
  const title = sheet.querySelector('#work-title');
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  let opener = null, inerted = [];
  const isOpen = () => sheet.classList.contains('open');
  const sync = () => { for (const b of sheet.querySelectorAll('.show')) b.hidden = !flyTo; };
  function open(from) {
    if (isOpen()) return;
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
    if (location.hash === '#work') history.replaceState(null, '', location.pathname + location.search);
    const to = focusTo ?? (opener?.isConnected && opener !== document.body ? opener : link);
    to?.focus();
  }
  link?.addEventListener('click', (ev) => { ev.preventDefault(); open(link); });
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
  for (const art of sheet.querySelectorAll('article[data-view]')) {
    art.querySelector('.show')?.addEventListener('click', () => {
      const id = art.dataset.view;
      // focus lands on the viewpoint's chip; the case card (aria-live) announces the case when the camera arrives
      close(document.querySelector(`.views button[data-view="${id}"]`) ?? link);
      flyTo?.(id);
    });
  }
  // a #work link or a reload on #work opens the sheet too
  if (location.hash === '#work') open(link);
  addEventListener('hashchange', () => { if (location.hash === '#work') open(link); });
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
