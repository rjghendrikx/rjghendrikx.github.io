import { inView, seedFrom, SHOULDER } from './layer-common.js';
import { BPM, SECTIONS } from './layer-deck.js';
import { makeFacade, FIELDS, coords } from './facade-life.js';

const TOTAL = SECTIONS.reduce((a, s) => a + s[1], 0) * 4;
const GATE_STEPS = 90;
const LIFT = 0.001;
const GAIN = 0.95;
const OFF = [0.15, 0.142, 0.135], WALL = [0.065, 0.06, 0.057];
const COOL = [0.78, 0.88, 1.0], WARM = [1.0, 0.62, 0.30];
const PATTERNS = [['wave', 'Wave'], ['breathe', 'Breathe'], ['bloom', 'Bloom'], ['sparks', 'Sparks'], ['life', 'Swing and charge']];
const MAPS = [['grid', 'Grid', 'index → (col, row)'], ['cartesian', 'Cartesian', 'index → (x, y)'], ['polar', 'Polar', 'index → (r, θ)']];
const SLIDERS = [['speed', 'Speed', 0.25, 1.5, 0.05, (v) => `${v.toFixed(2)}×`], ['density', 'Density', 0.2, 1, 0.05, (v) => `${Math.round(v * 100)}%`],
  ['attack', 'Attack', 0.02, 1, 0.01, (v) => `${v.toFixed(2)} s`], ['decay', 'Decay', 0.05, 2, 0.05, (v) => `${v.toFixed(2)} s`],
  ['warmth', 'Warmth', 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`]];
const DEFAULT = { mode: 'wave', speed: 0.5, density: 0.75, attack: 0.3, decay: 0.8, warmth: 0.7, mapping: 'cartesian' };

const FS =  `
  uniform sampler2D uL; uniform vec3 uOn; uniform vec3 uOff; uniform vec3 uWall; uniform float uGain; uniform float uAp;
  varying vec2 vUv;
  ${SHOULDER}
  void main() {
    vec2 g = vUv * 16.0, cell = floor(min(g, vec2(15.999))), f = g - cell;
    float L = texture2D(uL, vec2((cell.x + 0.5) / 16.0, (15.5 - cell.y) / 16.0)).r * uGain;   // row 0 at the top (the hook's index)
    vec2 e = abs(f - 0.5);
    float inside = 1.0 - smoothstep(uAp - 0.035, uAp + 0.01, max(e.x, e.y));
    float hot = 1.0 - 0.3 * smoothstep(0.0, uAp * 1.2, length(f - 0.5));   // the diffuser: brightest over the LED
    vec3 cellC = uOff + uOn * L * hot, wallC = uWall + uOn * L * 0.1;
    gl_FragColor = vec4(shoulder(mix(wallC, cellC, inside)), 1.0);
  }`;
const VS =  `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const STYLE = `
.led-ui { position: fixed; z-index: 5; box-sizing: border-box; width: 292px; max-height: calc(100vh - 32px); overflow: auto; padding: 12px 15px 14px;
  border-radius: 10px; color: var(--ink); background: rgba(20, 17, 15, .88); border: 1px solid rgba(239, 230, 218, .14);
  -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px); box-shadow: 0 10px 30px rgba(0, 0, 0, .35);
  font: 13px/1.35 ui-sans-serif, system-ui, sans-serif; animation: led-in .22s ease-out backwards; }
.led-ui[hidden] { display: none; }
@keyframes led-in { from { opacity: 0; translate: 0 4px; } }
@media (prefers-reduced-motion: reduce) { .led-ui { animation: none; } }
.led-ui .k { margin: 0 0 3px; font-size: 10.5px; line-height: 1.2; letter-spacing: .12em; text-transform: uppercase; color: var(--accent); font-weight: 600; }
.led-ui h2 { margin: 0; font: 600 15px/1.25 "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif; }
.led-ui .note { margin: 4px 0 8px; font-size: 12px; color: var(--muted); }
.led-ui .x { position: absolute; top: 6px; right: 6px; width: 32px; height: 32px; border: 0; border-radius: 999px; background: none; color: var(--muted);
  font: 20px/1 ui-sans-serif, system-ui, sans-serif; cursor: pointer; }
.led-ui fieldset { border: 0; margin: 8px 0 0; padding: 0; min-width: 0; }
.led-ui legend { padding: 0; margin: 0 0 4px; font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
.led-ui .chips { display: flex; flex-wrap: wrap; gap: 5px; }
.led-ui .chips label { position: relative; }
.led-ui .chips input { position: absolute; opacity: 0; inset: 0; margin: 0; cursor: pointer; }
.led-ui .chips span { display: inline-flex; align-items: center; min-height: 28px; box-sizing: border-box; padding: 4px 10px; border-radius: 999px; font-size: 12px;
  background: rgba(239, 230, 218, .06); border: 1px solid rgba(227, 163, 91, .35); cursor: pointer; }
.led-ui .chips input:checked + span { background: rgba(227, 163, 91, .22); border-color: var(--accent); }
.led-ui .chips input:focus-visible + span { outline: 2px solid var(--accent); outline-offset: 2px; }
.led-ui fieldset:disabled .chips span { opacity: .45; cursor: default; }
.led-ui .row { display: grid; grid-template-columns: 62px 1fr 52px; align-items: center; gap: 8px; margin-top: 5px; font-size: 12px; }
.led-ui .row output { text-align: right; color: var(--muted); font-variant-numeric: tabular-nums; }
.led-ui input[type=range] { width: 100%; margin: 0; accent-color: var(--accent); min-height: 24px; }
.led-ui input:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.led-ui .map { display: flex; gap: 10px; align-items: center; margin-top: 6px; }
.led-ui .map canvas { width: 56px; height: 56px; flex: none; border-radius: 3px; image-rendering: pixelated; background: #000; }
.led-ui .map p { margin: 0; font-size: 11.5px; color: var(--muted); }
.led-ui .map code { font: 11.5px ui-monospace, "SF Mono", Menlo, monospace; color: var(--ink); }
.led-ui .follow { display: flex; align-items: center; gap: 8px; margin-top: 10px; padding-top: 9px; border-top: 1px solid rgba(239, 230, 218, .1); cursor: pointer; }
.led-ui .follow input { width: 18px; height: 18px; margin: 0; accent-color: var(--accent); cursor: pointer; }
.led-ui .watch { margin-top: 7px; font: inherit; font-size: 12.5px; color: var(--ink); cursor: pointer; min-height: 32px; padding: 6px 11px; border-radius: 999px;
  background: rgba(239, 230, 218, .06); border: 1px solid rgba(227, 163, 91, .5); }
.led-ui .watch[hidden] { display: none; }
.led-ui :is(.x, .watch):focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
@media (max-width: 640px) {
  /* a true bottom sheet over the nav and the back pill (its own close is the way out), low enough to keep the panel in view */
  .led-ui { left: 0 !important; right: 0; top: auto !important; width: auto; bottom: 0; max-height: 40vh; overscroll-behavior: contain;
    border-radius: 14px 14px 0 0; border-width: 1px 0 0; background: rgba(20, 17, 15, .97);
    padding: 10px max(16px, env(safe-area-inset-right, 0px)) max(14px, env(safe-area-inset-bottom, 0px)) max(16px, env(safe-area-inset-left, 0px)); }
  .led-ui .note { margin-bottom: 4px; }
  .led-ui .x { width: 44px; height: 44px; }
  .led-ui .chips span { min-height: 36px; }
  .led-ui input[type=range] { min-height: 32px; }
  .led-ui .watch { min-height: 44px; }
}
/* Ruud 2026-11-25: not too many text blocks at once; while the panel is open it is the only one (its x, Esc and Back
   to the room still close it) */
body.led-open :is(.case, .hs-card, .caption, .nav-hint) { display: none; }`;

export default function mount(live) {
  const { THREE, byName, camera, params } = live;
  const node = byName('pr_ledmatrix');
  const d = node?.userData;
  if (!d?.ledmatrix_grid_center) return null;
  const N = d.ledmatrix_grid_n | 0 || 16;
  if (N !== 16) return null;

  const data = new Uint8Array(N * N * 4);
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  tex.magFilter = tex.minFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  const U = { uL: { value: tex }, uOn: { value: new THREE.Vector3() }, uOff: { value: new THREE.Vector3(...OFF) }, uWall: { value: new THREE.Vector3(...WALL) },
    uGain: { value: GAIN }, uAp: { value: 0.5 * d.ledmatrix_cell / d.ledmatrix_pitch } };
  const [gw, gh] = d.ledmatrix_grid_size;
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(gw, gh), new THREE.ShaderMaterial({ uniforms: U, vertexShader: VS, fragmentShader: FS }));
  quad.name = 'ledmatrix_cells';
  quad.position.fromArray(d.ledmatrix_grid_center).z += LIFT;
  node.add(quad);

  const set = { ...DEFAULT };
  const seed = seedFrom(params, 1616);
  const field = () => !!FIELDS[set.mode];
  const knobs = () => ({ speed: set.speed, density: set.density, attack: set.attack, decay: set.decay, decay_late: set.decay, warmth: set.warmth, mapping: set.mapping });
  let eng = null, beat = 0, steps = -1, stillDirty = true, cost = 0, frames = 0, wasIn = true;
  const build = () => { eng = makeFacade({ W: N, H: N, seed, bpm: BPM, sections: SECTIONS, wy: 1, preset: { mode: set.mode, ...knobs() } }); steps = -1; stillDirty = true; };
  const colour = () => U.uOn.value.set(...COOL.map((c, i) => c + (WARM[i] - c) * set.warmth));
  build(); colour();
  const upload = (L) => { for (let i = 0; i < N * N; i++) data[4 * i] = Math.round(255 * Math.min(1, Math.max(0, L[i]))); tex.needsUpdate = true; };
  function tick(dt) {
    beat += (dt * BPM) / 60 * (field() ? 1 : set.speed);
    if (beat >= TOTAL) beat -= TOTAL;
    const L = eng.frame(dt, beat, 1);
    if (eng.stats.steps === steps) return false;
    steps = eng.stats.steps; upload(L); return true;
  }
  const still = () => live.reduceMotion.matches;
  if (live.gate) { for (let i = 0; i < GATE_STEPS * 2; i++) tick(1 / 60); }
  else if (still()) { upload(eng.still()); stillDirty = false; }
  else tick(1 / 60);

  const style = document.createElement('style'); style.textContent = STYLE; document.head.appendChild(style);
  const ui = document.createElement('div');
  ui.className = 'led-ui'; ui.hidden = true;
  ui.setAttribute('role', 'dialog'); ui.setAttribute('aria-labelledby', 'led-ui-h');
  ui.innerHTML = `<p class="k">Metal visuals</p><h2 id="led-ui-h">The panel's parameters</h2>
    <button type="button" class="x" aria-label="Close the panel's parameters">×</button>
    <p class="note">The engine sends values, not pixels: one alpha per square, 256 of them.</p>
    <fieldset class="pat"><legend>Pattern</legend><div class="chips">${PATTERNS.map(([v, l]) =>
      `<label><input type="radio" name="led-pat" value="${v}"><span>${l}</span></label>`).join('')}</div></fieldset>
    ${SLIDERS.map(([k, l, a, b, s]) => `<label class="row"><span>${l}</span><input type="range" data-k="${k}" min="${a}" max="${b}" step="${s}"><output></output></label>`).join('')}
    <fieldset class="maps"><legend>Mapping</legend><div class="chips">${MAPS.map(([v, l]) =>
      `<label><input type="radio" name="led-map" value="${v}"><span>${l}</span></label>`).join('')}</div>
      <div class="map"><canvas width="${N}" height="${N}" aria-hidden="true"></canvas><p><code></code><br><span class="why"></span></p></div></fieldset>
    <label class="follow"><input type="checkbox" role="switch"><span>Also drive the facade</span></label>
    <button type="button" class="watch" hidden>See the facade</button>`;
  document.body.appendChild(ui);
  const $ = (q) => ui.querySelector(q);
  const mapCanvas = $('.map canvas'), mapG = mapCanvas.getContext('2d'), followBox = $('.follow input'), watch = $('.watch');
  function drawMap() {
    const u = coords(N, N, set.mapping, 1), img = mapG.createImageData(N, N);
    for (let i = 0; i < N * N; i++) { const v = field() ? 20 + 235 * u[i] : 60; img.data.set([v, v * 0.85, v * 0.66, 255], 4 * i); }
    mapG.putImageData(img, 0, 0);
    const m = MAPS.find((x) => x[0] === set.mapping);
    $('.map code').textContent = field() ? m[2] : 'index → (x, y)';
    $('.map .why').textContent = field() ? 'the same values, read in another space' : 'this system keeps its own space';
  }
  function syncUI() {
    for (const r of ui.querySelectorAll('input[name=led-pat]')) r.checked = r.value === set.mode;
    for (const r of ui.querySelectorAll('input[name=led-map]')) r.checked = r.value === set.mapping;
    for (const [k, , , , , fmt] of SLIDERS) { const el = $(`input[data-k=${k}]`); el.value = String(set[k]); el.nextElementSibling.textContent = fmt(set[k]); }
    $('fieldset.maps').disabled = !field();
    drawMap();
  }
  const stage = () => window.__room?.layers?.stage;
  let following = false, stageWasOn = false;
  function drive(on) {
    const S = stage();
    if (on && !following && S?.follow) {
      stageWasOn = !!S.info().on; following = true;
      if (!stageWasOn) S.cue({ beat, university: true });
      S.follow({ mode: set.mode, ...knobs() });
    } else if (!on && following) {
      following = false;
      S?.follow?.(null);
      if (!stageWasOn) S?.set?.(false);
    }
    followBox.checked = following; watch.hidden = !following;
    live.render();
  }
  function changed(rebuild) {
    if (rebuild) build(); else Object.assign(eng.preset, knobs());
    colour(); stillDirty = true; syncUI();
    if (following) stage()?.follow({ mode: set.mode, ...knobs() });
    live.render();
  }
  ui.addEventListener('input', (ev) => {
    const t = ev.target;
    if (t.name === 'led-pat') { set.mode = t.value; changed(true); }
    else if (t.name === 'led-map') { set.mapping = t.value; changed(false); }
    else if (t.dataset.k) { set[t.dataset.k] = +t.value; changed(false); }
    else if (t === followBox) drive(t.checked);
  });
  $('.x').addEventListener('click', () => close(true));
  watch.addEventListener('click', () => live.go('university'));
  let opener = null;
  function place() {
    if (matchMedia('(max-width: 640px)').matches) return;
    const box = new THREE.Box3().setFromObject(quad), r = live.renderer.domElement.getBoundingClientRect();
    const pts = [box.min, box.max].map((p) => p.clone().project(camera));
    const x0 = r.left + (Math.min(pts[0].x, pts[1].x) + 1) / 2 * r.width, x1 = r.left + (Math.max(pts[0].x, pts[1].x) + 1) / 2 * r.width;
    const yc = r.top + (1 - (pts[0].y + pts[1].y) / 2) / 2 * r.height, w = ui.offsetWidth, h = ui.offsetHeight;
    const seen = inView(camera, quad) && pts.every((p) => p.z < 1);
    const left = !seen ? 16 : x0 - 24 - w >= 16 ? x0 - 24 - w : Math.min(innerWidth - w - 16, x1 + 24);
    ui.style.left = `${Math.round(left)}px`;
    ui.style.top = `${Math.round(Math.max(16, Math.min(innerHeight - h - 16, seen ? yc - h / 2 : 80)))}px`;
  }
  function open() {
    if (!ui.hidden) return true;
    opener = document.activeElement !== document.body ? document.activeElement : null;
    syncUI(); ui.hidden = false; document.body.classList.add('led-open');
    place();
    ui.querySelector('input[name=led-pat]:checked')?.focus({ preventScroll: true });
    return true;
  }
  function close(focusBack = false) {
    drive(false);
    if (ui.hidden) return false;
    ui.hidden = true; document.body.classList.remove('led-open');
    if (focusBack && opener?.isConnected) opener.focus({ preventScroll: true });
    opener = null;
    return false;
  }
  addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape' || ui.hidden) return;
    ev.preventDefault(); ev.stopPropagation();
    close(true);
  }, true);
  const keep = (id) => id === 'metal' || (following && id === 'university');
  addEventListener('room:move', (ev) => { if (!ui.hidden && !keep(ev.detail)) close(); });
  addEventListener('room:arrive', () => { if (!ui.hidden) place(); });
  addEventListener('resize', () => { if (!ui.hidden) place(); });
  live.picks.push({ object: quad, accept: () => !live.gate && live.view() === 'metal', onPick: () => (ui.hidden ? open() : close(true)) });

  return {
    name: 'ledmatrix',
    update(dt) {
      if (live.gate) return false;
      const t0 = performance.now();
      if (!inView(camera, quad)) { if (wasIn) { eng.jump(); wasIn = false; } return false; }
      wasIn = true;
      let r = false;
      if (still()) { if (stillDirty) { upload(eng.still()); stillDirty = false; r = true; } }
      else r = tick(dt);
      cost += performance.now() - t0; frames++;
      return r;
    },
    onView(id) { if (!ui.hidden && !keep(id)) close(); },
    api: {
      open, close: () => close(), drive,
      set(k, v) { if (k === 'mode') { set.mode = v; changed(true); } else { set[k] = v; changed(false); } return { ...set }; },
      advance(sec, h = 1 / 60) { let n = Math.round(sec / h); while (n-- > 0) tick(h); live.render(); return steps; },
      values: () => Array.from(data.filter((_, i) => i % 4 === 0), (v) => +(v / 255).toFixed(4)),
      cost() { const r = { ms: frames ? +(cost / frames).toFixed(4) : 0, frames }; cost = 0; frames = 0; return r; },
      info: () => ({ open: !ui.hidden, following, settings: { ...set }, steps, beat: +beat.toFixed(2), inView: inView(camera, quad),
        mean: +eng.stats.mean.toFixed(4), lit: +eng.stats.lit.toFixed(4), held: eng.stats.held }),
    },
  };
}
