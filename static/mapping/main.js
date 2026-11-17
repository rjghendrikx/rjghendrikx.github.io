// Strobe Machine, web renderer: the third pair of eyes for the engine's index -> alpha stream.
// Scene: dist/stage.glb (Blender export, blender/export.py), the wall mesh carries _MVINDEX per
// vertex. Programs: dist/programs/<name>.bin (engine/bake.py), uint8 alpha per cell per frame.
// Live: ws://<host>:9002 (engine --out ws) takes over when it answers; the page then controls
// the engine (pattern, knobs, rate, reset) as JSON over the same socket.
// Unlit, as the room: the wall is a ShaderMaterial, alpha -> palette ramp * gain, bloom on top.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/+esm';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js/+esm';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js/+esm';
import { EffectComposer } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/EffectComposer.js/+esm';
import { RenderPass } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/RenderPass.js/+esm';
import { UnrealBloomPass } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/UnrealBloomPass.js/+esm';
import { OutputPass } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/OutputPass.js/+esm';
import { BeatTracker, openMic, listInputs } from './beat.js?v=20261025c';

const q = new URLSearchParams(location.search);
const GATE = q.has('gate');                       // deterministic: no UI, paused at ?t
if (GATE) document.body.classList.add('gate');
const DEMO = 'demo' in document.documentElement.dataset;   // touch-first voting on deck CANDIDATE (demo.js)
const WS_PORT = parseInt(q.get('ws') || '9002', 10);   // ?ws=9012: a test engine on another port
const KEYS = '1234567890qwertyuiopasdfghjklzxcvbnm';     // one program per key, in menu order
const KNOB_ORDER = ['energy', 'density', 'spread', 'chaos', 'pulse'];
const RATE_MIN = 0.4, RATE_MAX = 2.5;

const stage = await (await fetch('dist/stage.json')).json();
const programs = await (await fetch('dist/programs/programs.json', { cache: 'no-cache' })).json();   // decks change on a re-bake
if (programs.count !== stage.count) console.warn('grid mismatch', programs, stage);

// --- renderer, camera ----------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
const hfov = 2 * Math.atan(18 / stage.camera.lens_mm);          // 36 mm sensor, horizontal
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 200);
function setFov() {
  camera.aspect = innerWidth / innerHeight;
  camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(hfov / 2) / camera.aspect));
  camera.updateProjectionMatrix();
}
setFov();
camera.position.fromArray(stage.camera.position);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.fromArray(stage.camera.target);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.52;
controls.update();

// --- wall material: alpha texture sampled by panel index, palette ramp, gain ----------------
const count = stage.count;
const alphaData = new Uint8Array(count);
const alphaTex = new THREE.DataTexture(alphaData, count, 1, THREE.RedFormat, THREE.UnsignedByteType);
alphaTex.minFilter = alphaTex.magFilter = THREE.NearestFilter;
alphaTex.needsUpdate = true;

// Palettes: the three from stage.json (Blender) plus pastel ramps defined here, each 4 stops
// alpha -> colour, ending in white so a hero flash is always white. Two are spatial: hue by
// column ({hue: saturation}), the ramp then only sets brightness.
const W = [1, 1, 1];
const EXTRA_PALETTES = {
  rose:     [[0, [0.25, 0.05, 0.12]], [0.45, [1.0, 0.55, 0.75]], [0.8, [1.0, 0.82, 0.9]], [1, W]],
  mint:     [[0, [0.0, 0.2, 0.15]], [0.45, [0.5, 1.0, 0.8]], [0.8, [0.82, 1.0, 0.93]], [1, W]],
  lavender: [[0, [0.12, 0.05, 0.25]], [0.45, [0.7, 0.55, 1.0]], [0.8, [0.88, 0.83, 1.0]], [1, W]],
  peach:    [[0, [0.25, 0.1, 0.02]], [0.45, [1.0, 0.7, 0.45]], [0.8, [1.0, 0.88, 0.76]], [1, W]],
  sky:      [[0, [0.02, 0.12, 0.25]], [0.45, [0.5, 0.8, 1.0]], [0.8, [0.83, 0.93, 1.0]], [1, W]],
  lemon:    [[0, [0.2, 0.2, 0.0]], [0.45, [1.0, 0.95, 0.5]], [0.8, [1.0, 1.0, 0.86]], [1, W]],
  candy:    [[0, [0.3, 0.0, 0.3]], [0.3, [1.0, 0.5, 0.8]], [0.6, [0.6, 0.9, 1.0]], [1, [1, 1, 0.92]]],
  aurora:   [[0, [0.0, 0.15, 0.2]], [0.4, [0.2, 0.9, 0.7]], [0.75, [0.6, 0.6, 1.0]], [1, W]],
  sunset:   [[0, [0.3, 0.0, 0.2]], [0.4, [1.0, 0.4, 0.5]], [0.75, [1.0, 0.75, 0.4]], [1, W]],
  lilac_mint: [[0, [0.1, 0.05, 0.2]], [0.4, [0.75, 0.6, 1.0]], [0.75, [0.6, 1.0, 0.85]], [1, W]],
  rainbow:  { hue: 0.9 },
  pastel_rainbow: { hue: 0.45 },
};
const palettes = { ...stage.palettes, ...EXTRA_PALETTES };
const paletteNames = Object.keys(palettes);
function stops(name) {                            // 4 stops as vec4(r,g,b,pos); spatial: white ramp
  const s = Array.isArray(palettes[name]) ? palettes[name] : [[0, W], [1, W]];
  return [0, 1, 2, 3].map((i) => { const [pos, rgb] = s[Math.min(i, s.length - 1)]; return new THREE.Vector4(rgb[0], rgb[1], rgb[2], pos); });
}
function applyPalette(name) {
  wallMat.uniforms.uStops.value = stops(name);
  wallMat.uniforms.uHue.value = Array.isArray(palettes[name]) ? 0.0 : palettes[name].hue;
}
const wallMat = new THREE.ShaderMaterial({
  uniforms: {
    uAlpha: { value: alphaTex }, uCount: { value: count },
    // Blender's AgX swallowed gain 3; ACES + bloom does not. 1.5 clips flashes to white, the
    // bloom pass adds the glow above 0.9. Rest colour dark: an LED panel that is off is black.
    uGain: { value: 1.5 }, uBase: { value: 0.012 },
    uStops: { value: stops('ember') }, uHue: { value: 0.0 }, uCols: { value: stage.cols || 24 },
  },
  vertexShader: /* glsl */`
    attribute float _mvindex;
    varying float vIdx;
    void main() { vIdx = _mvindex; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D uAlpha; uniform float uCount, uGain, uBase, uHue, uCols; uniform vec4 uStops[4];
    varying float vIdx;
    vec3 ramp(float a) {
      vec3 c = uStops[0].rgb;
      for (int i = 0; i < 3; i++) {
        float t = clamp((a - uStops[i].w) / max(uStops[i+1].w - uStops[i].w, 1e-4), 0.0, 1.0);
        c = (a >= uStops[i].w) ? mix(uStops[i].rgb, uStops[i+1].rgb, t) : c;
      }
      return c;
    }
    vec3 hsv(float h, float s, float v) {
      vec3 k = abs(fract(h + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
      return v * mix(vec3(1.0), clamp(k - 1.0, 0.0, 1.0), s);
    }
    void main() {
      float a = texture2D(uAlpha, vec2((vIdx + 0.5) / uCount, 0.5)).r;
      vec3 c = ramp(a);
      if (uHue > 0.0) {                                     // spatial rainbow: hue by column, white at the top
        float col = mod(vIdx + 0.5, uCols) / uCols;
        c = mix(hsv(col, uHue, 1.0), vec3(1.0), smoothstep(0.8, 1.0, a));
      }
      gl_FragColor = vec4(c * a * uGain + vec3(uBase), 1.0);
    }`,
});

// --- scene ----------------------------------------------------------------------------------
const gltf = await new GLTFLoader().loadAsync('dist/stage.glb');
let wall = null;
gltf.scene.traverse((o) => {
  if (!o.isMesh) return;
  if (o.name === stage.wall) {
    wall = o;
    console.log('wall attributes', Object.keys(o.geometry.attributes));
    o.material = wallMat;
  } else {                                          // unlit dark set pieces (no lights in the scene)
    o.material = new THREE.MeshBasicMaterial({ color: o.name === 'floor' ? 0x050506 : 0x0c0c0e });
  }
});
if (!wall || !wall.geometry.attributes._mvindex) throw new Error('wall mesh with _mvindex not found');
scene.add(gltf.scene);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.35, 0.3, 0.9));
composer.addPass(new OutputPass());

// --- state ----------------------------------------------------------------------------------
const state = { program: null, data: null, pos: 0, paused: false, rate: 1.0, live: false, frame: -1 };
const ui = Object.fromEntries(['deck', 'program', 'palette', 'readout', 'live', 'uselive', 'knobs', 'reset', 'rate', 'ratev', 'mic', 'bpm', 'input', 'votes', 'dlvotes', 'resetvotes', 'lastvote']
  .map((id) => [id, document.getElementById(id)]));
let engine = { patterns: [], pattern: null, knobs: {}, defaults: {}, rate: 1 };
let ws = null;

// --- programs (baked) -----------------------------------------------------------------------
const bins = new Map();                                // name -> promise of the bytes; a failed load is forgotten, so it can be retried
function loadProgram(p) {
  if (!bins.has(p.name)) bins.set(p.name, (async () => {
    const res = await fetch(`dist/programs/${p.file}${p.hash ? `?h=${p.hash}` : ''}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    // an error page or a cut-off body is not the clip: never show it, never let it take a vote
    if (!res.ok || bytes.length !== p.frames * count) throw new Error(`${p.file}: not the baked clip (status ${res.status}, ${bytes.length} bytes)`);
    return bytes;
  })().catch((e) => { bins.delete(p.name); throw e; }));
  return bins.get(p.name);
}
async function selectProgram(name) {
  const p = programs.programs.find((x) => x.name === name) || programs.programs[0];
  state.program = p;
  state.data = await loadProgram(p);
  state.pos = 0; state.frame = -1;
  ui.program.value = p.name;
}
function showFrame(k) {
  const p = state.program;
  k = ((k % p.frames) + p.frames) % p.frames;
  if (k === state.frame) return;
  alphaData.set(state.data.subarray(k * count, (k + 1) * count));
  alphaTex.needsUpdate = true;
  state.frame = k;
  const beat = (k / p.fps) * p.bpm / 60;
  ui.readout.textContent = `${p.name} · ${Math.round(p.bpm * state.rate)} bpm · bar ${1 + Math.floor(beat / 4)} beat ${1 + Math.floor(beat % 4)}${state.paused ? ' · paused' : ''}`;
}

// --- live: binary frames in, JSON status in, JSON control out ------------------------------
function send(msg) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); }
function tryLive() {
  try { ws = new WebSocket(`ws://${location.hostname || 'localhost'}:${WS_PORT}`); } catch { return; }
  ws.binaryType = 'arraybuffer';
  ws.onopen = () => { setLive(true); ui.live.textContent = `engine on :${WS_PORT}`; };
  ws.onclose = () => { ws = null; setLive(false); ui.live.textContent = 'baked programs'; setTimeout(tryLive, 10000); };
  ws.onmessage = (e) => {
    if (typeof e.data === 'string') { onStatus(JSON.parse(e.data)); return; }
    if (!state.live) return;                            // "follow engine" off: keep the baked show
    const bytes = new Uint8Array(e.data);
    if (bytes.length !== count) { ui.readout.textContent = `live grid mismatch: ${bytes.length} cells, page has ${count}`; return; }
    alphaData.set(bytes);
    alphaTex.needsUpdate = true;
  };
}
function setLive(on) {
  state.live = on && ui.uselive.checked && !!ws;
  ui.knobs.classList.toggle('on', state.live);
  if (!state.live) state.frame = -1;
  fillProgramMenu();
}
function onStatus(s) {
  if (s.type !== 'status') return;
  engine = s;
  fillProgramMenu();
  if (!ui.knobs.childElementCount) {
    for (const k of KNOB_ORDER) {
      const label = document.createElement('label'); label.textContent = k;
      const input = document.createElement('input'); input.type = 'range'; input.min = 0; input.max = 1; input.step = 0.01; input.dataset.knob = k;
      const val = document.createElement('span');
      input.oninput = () => { val.textContent = (+input.value).toFixed(2); send({ knob: k, value: +input.value }); };
      ui.knobs.append(label, input, val);
    }
  }
  for (const input of ui.knobs.querySelectorAll('input')) {
    const v = s.knobs[input.dataset.knob] ?? s.defaults[input.dataset.knob] ?? 0;
    input.value = v; input.nextElementSibling.textContent = (+v).toFixed(2);
  }
  setRate(s.rate, false);
  ui.readout.textContent = `live · ${s.pattern}`;
}

// --- decks, menu, keys, rate ------------------------------------------------------------------
// A deck is an ordered list of program names = the key map (like a Resolume deck). programs.json
// carries them; BASIC is the frozen 2026-10-23 layout. ?deck=NAME, remembered in localStorage.
const DECKS = programs.decks || { BASIC: programs.programs.map((p) => p.name).filter((n) => n !== 'gradient') };
let deck = DEMO ? 'CANDIDATE' : q.get('deck');
try { deck = deck || localStorage.getItem('mv-deck'); } catch { /* private window */ }
if (!DECKS[deck]) deck = programs.default_deck && DECKS[programs.default_deck] ? programs.default_deck : Object.keys(DECKS)[0];
for (const n of Object.keys(DECKS)) { const o = document.createElement('option'); o.value = n; o.textContent = `${n} (${DECKS[n].length})`; ui.deck.appendChild(o); }
ui.deck.value = deck;
function deckOrder() { return DECKS[deck]; }
function menuNames() {
  const order = deckOrder();
  if (!state.live) return q.has('program') && !order.includes(q.get('program')) ? [...order, q.get('program')] : order;
  // live: the deck's keys for the programs both know, the engine's extras after that
  const rank = (n) => (order.includes(n) ? order.indexOf(n) : 1000 + engine.patterns.indexOf(n));
  return [...engine.patterns].sort((a, b) => rank(a) - rank(b));
}
function setDeck(name) {
  if (!DECKS[name]) return;
  deck = name; ui.deck.value = name;
  try { localStorage.setItem('mv-deck', name); } catch { /* ignore */ }
  fillProgramMenu();
  const current = state.live ? engine.pattern : state.program?.name;
  if (!menuNames().includes(current)) choose(menuNames()[0]);
}
ui.deck.onchange = () => setDeck(ui.deck.value);
function fillProgramMenu() {
  const names = menuNames();
  const current = state.live ? engine.pattern : state.program?.name;
  ui.program.replaceChildren(...names.map((n, i) => {
    const o = document.createElement('option'); o.value = n;
    const key = KEYS[i] && deckOrder().includes(n) ? `[${KEYS[i]}] ` : '    ';
    const secs = programs.programs.find((p) => p.name === n)?.seconds;
    o.textContent = key + n + (!state.live && secs ? ` (${secs}s)` : '');
    return o;
  }));
  if (current && names.includes(current)) ui.program.value = current;
}
function choose(name) {                               // live: tell the engine; baked: play the file
  if (!name) return;
  if (state.live) { send({ pattern: name }); ui.program.value = name; } else selectProgram(name);
}
function setRate(r, tell = true) {
  state.rate = Math.min(RATE_MAX, Math.max(RATE_MIN, r));
  ui.rate.value = state.rate; ui.ratev.textContent = `${state.rate.toFixed(2)}x`;
  if (tell && state.live) send({ rate: state.rate });
}
function reset() {
  if (state.live) send({ reset: true });
  setRate(1.0);
  state.pos = 0; state.paused = false; state.frame = -1;
}
// Downbeat now: snap the baked clock to the nearest 16-beat phrase boundary (and tell the engine).
function downbeat() {
  if (state.live) send({ sync: true });
  if (state.program) {
    const phrase = 16 * 60 / state.program.bpm;
    state.pos = Math.round(state.pos / phrase) * phrase; state.frame = -1;
  }
}

// --- votes: taste, one key per judgement, kept locally, downloadable as JSON ----------
// '.' like, ',' skip, '/' wow. Each vote records deck, program, position in the loop and tempo;
// the critic's taste weights are to be fitted on these (docs/study-stimulus.md §3d).
let votes = [];
try { votes = JSON.parse(localStorage.getItem('mv-votes') || '[]'); } catch { /* ignore */ }
function voteEntry(kind) {                             // the one shape of a vote (the demo adds src)
  const name = state.live ? engine.pattern : state.program?.name;
  if (!name) return null;
  return { ts: new Date().toISOString(), deck, program: name, vote: kind, t: +state.pos.toFixed(2), rate: +state.rate.toFixed(3), live: state.live,
                  ...(state.live ? { knobs: { ...engine.knobs } } : { hash: state.program?.hash ?? null }) };
}
function vote(kind) {
  const entry = voteEntry(kind);
  if (!entry) return;
  const name = entry.program;
  votes.push(entry);
  try { localStorage.setItem('mv-votes', JSON.stringify(votes)); } catch { /* ignore */ }
  send({ vote: entry });   // with an engine up, the vote also lands in engine/loop/votes/ (docs/LOOP.md)
  ui.votes.textContent = votes.length; ui.lastvote.textContent = `${kind} ${name}${entry.live ? ' (live, no hash: untick follow engine to vote on the bake)' : ''}`;
  window.__votes = votes;
}
ui.votes.textContent = votes.length; window.__votes = votes;
ui.dlvotes.onclick = () => {
  const blob = new Blob([JSON.stringify(votes, null, 1)], { type: 'application/json' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `mv-votes-${new Date().toISOString().slice(0, 10)}.json` });
  a.click(); URL.revokeObjectURL(a.href);
};
// reset: first click arms (3 s), second click clears; download first if you want to keep them
let resetArmed = null;
ui.resetvotes.onclick = () => {
  if (!resetArmed) {
    ui.resetvotes.textContent = 'sure? click again';
    resetArmed = setTimeout(() => { resetArmed = null; ui.resetvotes.textContent = 'reset'; }, 3000);
    return;
  }
  clearTimeout(resetArmed); resetArmed = null; ui.resetvotes.textContent = 'reset';
  votes = []; try { localStorage.removeItem('mv-votes'); } catch { /* ignore */ }
  ui.votes.textContent = 0; ui.lastvote.textContent = 'cleared'; window.__votes = votes;
};

// --- beat follow: microphone -> BPM + phase -> tempo (never a jump in pos) -----------------
const LEAD = parseFloat(q.get('lead') || '0.06');     // s the light runs ahead of the mic: unmeasured
let mic = null, tracker = null, lastSent = 0;
let inputId = null;
try { inputId = localStorage.getItem('mv-input') || null; } catch { /* private window */ }
async function fillInputs() {                         // labels only after the first permission
  const inputs = await listInputs();
  ui.input.replaceChildren(...inputs.map((d) => { const o = document.createElement('option'); o.value = d.id; o.textContent = d.label; return o; }));
  if (inputs.some((d) => d.id === inputId)) ui.input.value = inputId;
  ui.input.hidden = inputs.length < 2;
}
async function toggleMic() {
  if (mic) { mic.close(); mic = null; tracker = null; ui.mic.textContent = 'mic'; ui.bpm.textContent = 'off'; return; }
  const t = new BeatTracker({ prior: state.program?.bpm || 128 });
  try { mic = await openMic(t, inputId); } catch (e) { ui.bpm.textContent = `no input: ${e.name}`; inputId = null; return; }
  tracker = t;
  ui.mic.textContent = 'stop'; ui.bpm.textContent = `listening… (${mic.label})`;
  fillInputs();
}
ui.input.onchange = async () => {
  inputId = ui.input.value || null;
  try { localStorage.setItem('mv-input', inputId || ''); } catch { /* ignore */ }
  if (mic) { await toggleMic(); await toggleMic(); }   // reopen on the new input
};
function followBeat() {
  if (!mic || !tracker) return;
  mic.drain();
  const now = mic.ctx.currentTime;
  const s = tracker.update(now);
  window.__beat = s;
  if (!s.locked) { ui.bpm.textContent = `${s.bpm.toFixed(1)} bpm · ${s.stability < 0.5 && s.confidence > 0.25 ? 'unstable, holding' : 'searching'}`; return; }
  const base = state.program?.bpm || 128;
  let err = 0;
  if (!state.live && state.program) {                   // phase lock: pull the beat grid together
    const prog = (state.pos * base / 60) % 1;
    const det = tracker.phaseAt(now + LEAD);
    err = det - prog; err -= Math.round(err);           // wrap to [-0.5, 0.5)
    window.__beat = { ...s, phaseErr: err };
  }
  const nudge = Math.max(-0.04, Math.min(0.04, 0.3 * err));
  const target = (s.bpm / base) * (1 + nudge);
  const tell = state.live && Math.abs(target - state.rate) > 0.005 && performance.now() - lastSent > 500;
  if (tell) lastSent = performance.now();
  setRate(target, tell);
  ui.bpm.textContent = `${s.bpm.toFixed(1)} bpm · lock ${(s.quality * 100).toFixed(0)}%`;
}
ui.mic.onclick = toggleMic;
fillProgramMenu();
for (const n of paletteNames) { const o = document.createElement('option'); o.value = n; o.textContent = n; ui.palette.appendChild(o); }
ui.program.onchange = () => choose(ui.program.value);
ui.palette.onchange = () => applyPalette(ui.palette.value);
function cyclePalette(step) {
  ui.palette.selectedIndex = (ui.palette.selectedIndex + step + paletteNames.length) % paletteNames.length;
  ui.palette.onchange();
}
ui.uselive.onchange = () => setLive(ui.uselive.checked);
ui.reset.onclick = reset;
ui.rate.oninput = () => setRate(+ui.rate.value);
addEventListener('keydown', (e) => {
  if (DEMO || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') e.target.blur();
  const names = menuNames();
  const i = names.indexOf(ui.program.value);
  const k = e.key.toLowerCase();
  if (KEYS.includes(k) && e.key.length === 1) choose(names[KEYS.indexOf(k)]);
  else if (e.key === ']') choose(names[(i + 1) % names.length]);
  else if (e.key === '[') choose(names[(i - 1 + names.length) % names.length]);
  else if (e.key === 'Tab') { e.preventDefault(); document.body.classList.toggle('hide'); }   // panel away, keys keep working
  else if (e.key === '\\') cyclePalette(1);
  else if (e.key === 'PageDown' || e.key === 'PageUp') {        // next / previous deck
    const names = Object.keys(DECKS), j = names.indexOf(deck);
    setDeck(names[(j + (e.key === 'PageDown' ? 1 : names.length - 1)) % names.length]);
  }
  else if (e.key === '-') setRate(state.rate / 1.08);
  else if (e.key === '=') setRate(state.rate * 1.08);
  else if (e.key === '+') cyclePalette(1);               // shift = : next colour
  else if (e.key === '_') cyclePalette(-1);              // shift - : previous colour
  else if (e.key === 'Backspace') setRate(1.0);
  else if (e.key === 'Enter') downbeat();
  else if (e.key === '.') vote('like');
  else if (e.key === ',') vote('skip');
  else if (e.key === '/') vote('wow');
  else if (e.key === ';') { if (tracker) tracker.octave(0.5); else setRate(state.rate / 2); }
  else if (e.key === "'") { if (tracker) tracker.octave(2); else setRate(state.rate * 2); }
  else if (e.key === 'Escape') reset();
  else if (e.key === ' ') { e.preventDefault(); state.paused = !state.paused; state.frame = -1; }
  else return;
  e.preventDefault();
});

// energy as master dimmer on every program, baked or live: below its default it dims the wall,
// above it the programs that read energy (machine) take over. Experiment with the controllers.
function master() {
  const e = engine.knobs.energy, d = engine.defaults.energy || 0.4;
  return e === undefined ? 1 : Math.min(1, e / d);
}

// --- ?midi: Launchpad + Launch Control 3 via Web MIDI (experiment, see midi.js) -----------------
if (q.has('midi')) {
  const { startMidi } = await import('./midi.js?v=20261028d');
  startMidi({
    deckNames: () => Object.keys(DECKS), deck: () => deck, setDeck, deckOrder,
    program: () => (state.live ? engine.pattern : state.program?.name), choose,
    knob: (k) => engine.knobs[k] ?? engine.defaults[k] ?? 0.5,
    setKnob: (k, v) => { engine.knobs[k] = v; send({ knob: k, value: v }); },
    rate: () => state.rate, setRate, bpm: () => state.program?.bpm || 128,
    micOn: () => !!mic, toggleMic, downbeat, vote, cyclePalette,
    trace: q.get('midi') === 'debug' ? (m) => fetch(`beacon?${encodeURIComponent(m)}`).catch(() => {}) : null,
    palette: () => ui.palette.value, paletteColour: () => { const c = stops(ui.palette.value)[1]; return [c.x, c.y, c.z]; },
  });
}

// --- start ----------------------------------------------------------------------------------
ui.palette.value = paletteNames.includes(q.get('palette')) ? q.get('palette') : 'ember';
ui.palette.onchange();
if (!DEMO) await selectProgram(q.get('program') || deckOrder()[0]);   // demo: the wall stays dark until the start tap
fillProgramMenu();
if (q.has('t')) { state.pos = parseFloat(q.get('t')) || 0; state.paused = true; }
if (!GATE && !DEMO) tryLive();                        // demo: baked only, so every vote carries its hash
if (DEMO) {
  if (!programs.decks?.CANDIDATE) throw new Error('demo: this bake has no deck CANDIDATE');
  controls.enabled = false;                           // one fixed view for every clip; touches are for voting
  const { startDemo } = await import('./demo.js?v=20261117a');
  startDemo({
    names: programs.decks.CANDIDATE, voteEntry,
    hashes: Object.fromEntries(programs.programs.map((p) => [p.name, p.hash ?? null])),
    load: (name) => loadProgram(programs.programs.find((p) => p.name === name)),
    play: async (name) => { await loadProgram(programs.programs.find((p) => p.name === name)); await selectProgram(name); },
    stop: () => { state.program = null; state.data = null; alphaData.fill(0); alphaTex.needsUpdate = true; },
  });
}
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); setFov(); });

let last = performance.now();
function tick(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  followBeat();
  wallMat.uniforms.uGain.value = 1.5 * master();
  if (!state.live && state.program) {
    if (!state.paused) state.pos += dt * state.rate;      // integrate: rate changes never jump
    showFrame(Math.floor(state.pos * state.program.fps));
  }
  controls.update();
  composer.render();
  window.__ready = true;
  if (!GATE) requestAnimationFrame(tick);
}
if (GATE) { showFrame(Math.floor(state.pos * state.program.fps)); composer.render(); window.__ready = true; }
else requestAnimationFrame(tick);
