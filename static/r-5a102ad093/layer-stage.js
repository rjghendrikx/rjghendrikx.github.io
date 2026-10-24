// The stage opposite (round 022 E, an easter egg like Lidar): stand at the window and the University's offices become
// the panels of a light show, the way Ruud's metal-visuals drives a wall of squares, one value per panel (cc-16,
// ~/Documents/Code/Active/metal-visuals: engine/patterns.py, the vocabulary below is ported from it, not imported).
// Every office of the University's ribbon windows, lit or dark, is one fluorescent panel, cool white; the lit windows
// of the canal houses keep their warm bulbs and join in slower: they fade up and out over bars, not beats, in the
// University's rests, so the two banks take turns and overlap at each hand-over.
//
// Trigger: the window views (the "At the window" standpoint, Canal, University), or a free walk that ends within
// NEAR m of the panes looking out. Leaving fades it out. Once seen, a "Light show" toggle joins Lidar's corner and
// plays it from anywhere. ?stage starts it at load; ?gate: nothing moves but api.advance (the position rule still
// decides on/off, so a gate can stand at the window and advance the clock).
// Cost: one InstancedMesh (unit quads posed on the baked panes, +1 draw call), one float per window per frame from
// the CPU; off and faded = invisible, update() returns false and does nothing else.
// Hooks: node cz_canal_far extras show_windows (objects/cz_canal_night.py SHOW, stride 9: centre, normal x z, width,
// height, kind 0 University / 1 house, tone), cz_canal_night extras rain_panes (the window's panes).
// Reduced motion: no clock; a still pattern fades in slowly and stays.
import { noPick } from './layer-common.js';

const BPM = 96;                   // the show's tempo (metal-visuals plays at 120-128; slower reads as a building)
const PHRASE = 16;                // beats per phrase: one pattern each, crossfaded over XFADE beats
const XFADE = 2;
const T_IN = 3.0, T_OUT = 2.5;    // s, the bake to the show and back
const T_STILL = 6.0;              // s, the fade under reduced motion
const NEAR = 1.3, FAR = 1.6;      // m from the pane plane: in (the window standpoint stands 1.22 m off it), out
const SIDE = 2.6;                 // m, half the width either side of the window centre that counts as "at the window"
const OUTWARD = 0.3;              // the gaze must point out: forward . outward normal above this
const PROUD = 0.12;
const RIM = [0.45, 0.4], EDGE = 0.06;   // m added to a panel's width and height: dark (covers the bleed), lit (the frame)               // m off the baked pane along its normal (the panes sit 0.10-0.34 m off the walls)
const TAU_UP = 0.05, TAU_DOWN = 0.22;    // s, a tube's light: quick on, a short afterglow (one-pole per window)
const VIEWS = new Set(['window', 'canal', 'university']);
// display sRGB (ShaderMaterial output is not converted): the fluorescent tubes a little green-blue of white, the
// bulbs as the bake's lit_<K>_mid (objects/cz_canal_night.py), the dark pane as window_dark seen at night
const COOL = [0.78, 0.90, 1.0];
const WARM = [[1.0, 0.55, 0.22], [1.0, 0.62, 0.32], [1.0, 0.70, 0.42], [1.0, 0.77, 0.55]];   // 2200 2700 3000 3500 K
const DARK = [0.008, 0.010, 0.015];
const GAIN = { uni: 0.95, house: 0.9 };

// --- the pattern vocabulary (metal-visuals engine/patterns.py, synth.py), per panel: u, v in 0..1 across the
// facade as seen from the window, f the storey, c the column, b the beat clock. Each returns 0..1.
const fract = (x) => x - Math.floor(x);
const unipolar = (x) => 0.5 + 0.5 * x;
// env_ad: attack-decay envelope on a phase 0..1 (synth.env_ad: a fast rise, a curved tail)
const envAD = (ph, a, d, curve) => (ph < a ? ph / a : ph < a + d ? (1 - (ph - a) / d) ** curve : 0);
// Bjorklund E(k, n): which of n steps fire (synth.euclid)
const euclid = (k, n) => Array.from({ length: n }, (_, i) => Math.floor((i * k) / n) !== Math.floor(((i - 1) * k) / n) || i === 0);
const TRESILLO = euclid(3, 8);    // x..x..x.
const PATTERNS = [
  // wave: a soft diagonal sine, the whole wall breathing in a travelling band (patterns.wave)
  { name: 'wave', f: (p, b) => unipolar(Math.sin(2 * Math.PI * (b / 8 - 0.9 * (p.u + 0.6 * p.v)))) ** 3 },
  // chase: a pulse that runs left to right every two beats (patterns.chase: env_ad on a phasor with a spatial offset)
  { name: 'chase', f: (p, b) => envAD(fract(b / 2 - 0.8 * p.u), 0.05, 0.5, 1.5) },
  // scan: each beat a two-storey band climbs the building with a short afterglow (patterns._scan)
  { name: 'scan', f: (p, b, n) => { const d = fract(b / 2) * (n.floors + 2) - 1 - p.f; return d >= 0 && d < 2.5 ? Math.exp(-1.6 * d) : 0; } },
  // tresillo: E(3, 8) on the eighths, each panel a step later along the diagonal (patterns.euclid_chase)
  { name: 'tresillo', f: (p, b) => {
    const x = b * 2 - 2.4 * (p.u + 0.5 * p.v), s = Math.floor(x);
    return TRESILLO[((s % 8) + 8) % 8] ? envAD(x - s, 0.08, 0.85, 2.0) : 0;
  } },
  // checker: 2 x 1 blocks of offices swap every beat (patterns._checker, slowed to the beat: no strobe)
  { name: 'checker', f: (p, b) => {
    const s = Math.floor(b), par = (Math.floor(p.c / 2) + p.f) % 2;
    return par === s % 2 ? envAD(b - s, 0.06, 0.9, 1.2) : 0.04;
  } },
  // bloom: rings out from the middle of the wall on the half bar (patterns.bloom)
  { name: 'bloom', f: (p, b) => envAD(fract(b / 2 - 1.1 * p.r), 0.04, 0.45, 2.0) },
];
// the two banks take turns: the University plays the body of each phrase and rests at its end; the houses rise in
// that rest and hold across the bar line, so each hand-over overlaps by about two beats (beats in the phrase)
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const uniGain = (q) => Math.max(0.12, smooth(0, 2, q) * (1 - smooth(11, 14, q)));
const houseGain = (q) => smooth(9.5, 13.5, q) + (1 - smooth(2, 7, q));   // q wraps: up at 9.5-13.5, down at 2-7 of the next
// a house window answers in one of three groups, in turn per phrase; a third of them play in both of their neighbours'
const houseLevel = (p, b) => {
  const q = b % PHRASE, ph = Math.floor((b + PHRASE - 9.5) / PHRASE);   // the hand-over this house slot belongs to
  const on = p.g === ((ph % 3) + 3) % 3 || (p.both && p.g === ((ph + 1) % 3 + 3) % 3);
  const swell = 0.6 + 0.4 * unipolar(Math.sin(2 * Math.PI * (b / 12 - p.u)));   // a slow ripple along the quay
  return on ? houseGain(q) * swell : 0.04;
};

// dark, a panel covers its pane and the rim the bake bled round it (RIM); lit, it shrinks to the pane (aLit, the
// lit size over the dark one), so the offices stay offices and do not run into bands.
// An office the bake left dark keeps its baked pane (the sky's reflection) until its tube comes on; a baked lit one is
// covered from the start, so it can go dark
const VS = `attribute float aLevel; attribute vec4 aTone; attribute vec2 aLit; uniform vec3 uDark; uniform float uK; varying vec3 vC; varying float vA;
  void main() { vC = mix(uDark, aTone.rgb, aLevel); vA = uK * max(aTone.a, clamp(aLevel * 6.0, 0.0, 1.0)); vec2 s = mix(vec2(1.0), aLit, smoothstep(0.04, 0.25, aLevel));
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position.xy * s, position.z, 1.0); }`;
const FS = `varying vec3 vC; varying float vA; void main() { gl_FragColor = vec4(vC, vA); }`;

const STYLE = `.stage-toggle { font: inherit; font-size: 12px; line-height: 1; color: var(--muted, #b9ab98); background: rgba(20, 17, 15, .55); cursor: pointer;
  border: 1px solid rgba(239, 230, 218, .16); border-radius: 999px; padding: 6px 10px; transition: color .2s, border-color .2s; }
.stage-toggle:hover { color: var(--ink, #efe6da); }
.stage-toggle[aria-pressed="true"] { color: var(--ink, #efe6da); border-color: #c9dcf0; }
.stage-toggle:focus-visible { outline: 2px solid var(--accent, #e3a35b); outline-offset: 2px; }
.stage-toggle[hidden] { display: none; }
.gate .stage-toggle { display: none; }`;
const SEEN_KEY = 'room.stage';

export default function mount(live) {
  const { THREE, scene, camera, byName, params } = live;
  const far = byName('cz_canal_far'), night = byName('cz_canal_night');
  const raw = far?.userData?.show_windows, rp = night?.userData?.rain_panes;
  if (!raw?.length || !rp?.length) return null;

  // the window: its centre and the pane plane (cz_canal_night node-local -> world), outward = -z (glTF)
  night.updateMatrixWorld(true); far.updateMatrixWorld(true);
  const winC = new THREE.Vector3();
  let paneZ = 0;
  for (let k = 0; k + 4 < rp.length; k += 5) winC.add(new THREE.Vector3(rp[k], rp[k + 1], rp[k + 2]).applyMatrix4(night.matrixWorld));
  winC.divideScalar(Math.floor(rp.length / 5));
  paneZ = winC.z;
  const outward = new THREE.Vector3(0, 0, -1);

  // the panels: posed quads, and per panel its place on the "wall" as seen from the window
  const N = Math.floor(raw.length / 9);
  const mesh = noPick(new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), null, N));
  const panels = [];
  const m = new THREE.Matrix4(), c = new THREE.Vector3(), n = new THREE.Vector3(), t = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const tone = new Float32Array(N * 4), lit = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) {
    const [x, y, z, nx, nz, w, h, kind, tn] = raw.slice(9 * i, 9 * i + 9);
    c.set(x, y, z).applyMatrix4(far.matrixWorld);
    n.set(nx, 0, nz).normalize();
    t.crossVectors(up, n);
    c.addScaledVector(n, PROUD);
    m.makeBasis(t.clone().multiplyScalar(w + RIM[0]), up.clone().multiplyScalar(h + RIM[1]), n).setPosition(c);   // the bake bleeds ~0.2 m
    lit.set([(w + EDGE) / (w + RIM[0]), (h + EDGE) / (h + RIM[1])], 2 * i);
    mesh.setMatrixAt(i, m);
    tone.set([...(kind === 0 ? COOL.map((v) => v * GAIN.uni) : WARM[tn].map((v) => v * GAIN.house)), kind === 1 || tn === 1 ? 1 : 0], 4 * i);
    const d = c.clone().sub(winC);
    panels.push({ pos: c.clone(), kind, lit: kind === 1 || tn === 1, az: Math.atan2(d.x, -d.z), el: Math.atan2(d.y - 0, Math.hypot(d.x, d.z)), y: c.y,
      u: 0, v: 0, r: 0, f: 0, c: 0, g: 0, both: false, level: 0 });
  }
  // normalise per bank: u (left to right as seen), v (bottom to top), storeys and columns of the University
  const norm = { floors: 1 };
  for (const kind of [0, 1]) {
    const ps = panels.filter((p) => p.kind === kind);
    if (!ps.length) continue;
    const lo = (k) => Math.min(...ps.map((p) => p[k])), hi = (k) => Math.max(...ps.map((p) => p[k]));
    const [a0, a1, e0, e1, y0] = [lo('az'), hi('az'), lo('el'), hi('el'), lo('y')];
    const step = (a1 - a0) / Math.max(1, Math.round(Math.sqrt(ps.length) * 1.5));
    for (const p of ps) {
      p.u = (p.az - a0) / (a1 - a0 || 1);
      p.v = (p.el - e0) / (e1 - e0 || 1);
      p.r = Math.hypot(p.u - 0.5, (p.v - 0.5) * 0.6) * 1.6;
      p.f = Math.round((p.y - y0) / 3.8);
      p.c = Math.floor((p.az - a0) / (step || 1));
      if (kind === 0) norm.floors = Math.max(norm.floors, p.f + 1);
    }
  }
  // the houses' groups: a stable hash per window, so neighbours differ
  panels.forEach((p, i) => { const hsh = fract(Math.sin(i * 12.9898 + 78.233) * 43758.5453); p.g = Math.floor(hsh * 3); p.both = fract(hsh * 7.31) < 0.33; });

  const level = new THREE.InstancedBufferAttribute(new Float32Array(N), 1);
  level.setUsage(THREE.DynamicDrawUsage);
  mesh.geometry.setAttribute('aLevel', level);
  mesh.geometry.setAttribute('aTone', new THREE.InstancedBufferAttribute(tone, 4));
  mesh.geometry.setAttribute('aLit', new THREE.InstancedBufferAttribute(lit, 2));
  const U = { uK: { value: 0 }, uDark: { value: new THREE.Vector3(...DARK) } };
  mesh.material = new THREE.ShaderMaterial({ uniforms: U, vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8 });
  mesh.name = 'stage_windows';
  mesh.frustumCulled = false;
  mesh.visible = false;
  mesh.instanceMatrix.needsUpdate = true;
  scene.add(mesh);

  // state: want (the position rule or the toggle), k the fade, b the beat clock
  const reduce = () => live.reduceMotion.matches;
  let near = false, forced = params.has('stage'), k = 0, b = 0, settled = true, cost = 0, frames = 0, seen = false;
  const fwd = new THREE.Vector3();
  function atWindow() {
    if (VIEWS.has(live.view())) return true;
    if (!live.inRoom?.()) return false;
    const p = camera.position, d = p.z - paneZ;
    camera.getWorldDirection(fwd);
    const lim = near ? FAR : NEAR;
    return d > -0.2 && d < lim && Math.abs(p.x - winC.x) < SIDE && fwd.dot(outward) > OUTWARD;
  }

  // the toggle: hidden until the show has been seen once (here, or on an earlier visit)
  const button = document.createElement('button');
  try { seen = localStorage.getItem(SEEN_KEY) === '1'; } catch { /* storage blocked: rediscover it */ }
  if (!live.gate) {
    const style = document.createElement('style');
    style.textContent = STYLE;
    document.head.appendChild(style);
    button.type = 'button';
    button.className = 'stage-toggle';
    button.textContent = 'Light show';
    button.title = 'The light show on the facades opposite';
    button.setAttribute('aria-pressed', String(forced));
    button.setAttribute('aria-label', 'Light show: the University windows opposite as a stage');
    button.hidden = !seen;
    button.addEventListener('click', () => set(!forced));
    (document.querySelector('.controls') ?? document.body).appendChild(button);
  }
  function discover() {
    if (seen) return;
    seen = true;
    button.hidden = false;
    dispatchEvent(new Event('resize'));   // main.js re-reads the control cluster's width (the phone caption's gutter)
    try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* fine: the button shows for this visit */ }
  }
  function set(v) { forced = !!v; button.setAttribute('aria-pressed', String(forced)); settled = false; live.render(); return forced; }

  function timed(dt) { const t0 = performance.now(), r = step(dt); cost += performance.now() - t0; frames++; return r; }
  function step(dt) {
    near = atWindow();
    const want = forced || near;
    if (settled && !want && k === 0) return false;
    if (want) { settled = false; if (k === 0) b = 0; if (!live.gate) discover(); }
    const still = reduce(), k0 = k;
    k = Math.min(1, Math.max(0, k + (want ? dt / (still ? T_STILL : T_IN) : -dt / (still ? T_STILL : T_OUT))));
    if (!still) b += (dt * BPM) / 60;
    const was = mesh.visible;
    mesh.visible = k > 0;
    if (k === 0) { if (!want) settled = true; return was; }
    if (still && k === k0 && was) return false;   // reduced motion: a still picture once faded in
    U.uK.value = k * k * (3 - 2 * k);
    // the program: the University's pattern of this phrase (crossfaded into the next), the houses' slow answer
    const bb = still ? 6.5 : b;   // reduced motion: one still moment of the wave
    const ph = Math.floor(bb / PHRASE), q = bb - ph * PHRASE;
    const A = PATTERNS[ph % PATTERNS.length], B = PATTERNS[(ph + 1) % PATTERNS.length];
    const x = still ? 0 : smooth(PHRASE - XFADE, PHRASE, q), ug = still ? 1 : uniGain(q);
    const arr = level.array, ka = still ? 1 : 1 - Math.exp(-dt / TAU_UP), kd = still ? 1 : 1 - Math.exp(-dt / TAU_DOWN);
    for (let i = 0; i < N; i++) {
      const p = panels[i];
      let target;
      if (p.kind === 0) target = 0.03 + 0.97 * ug * ((1 - x) * A.f(p, bb, norm) + (x ? x * B.f(p, bb, norm) : 0));
      else target = still ? 0.75 : houseLevel(p, bb);
      const cur = arr[i];
      arr[i] = cur + (target - cur) * (target > cur ? ka : kd);
    }
    level.needsUpdate = true;
    return true;
  }

  return {
    name: 'stage',
    update(dt) { return live.gate ? false : timed(dt); },   // ?gate: only advance() moves it
    onView() { settled = false; },
    api: {
      set, toggle: () => set(!forced),
      advance(sec, h = 1 / 60) { let s = Math.round(sec / h); while (s-- > 0) timed(h); live.render(); return k; },
      // jump the show's clock to `beat` (it plays the last beat to get there, so the tubes' afterglow is real), k kept
      at(beat, h = 1 / 60) { b = Math.max(0, beat - 1); let s = Math.round(60 / BPM / h); while (s-- > 0) timed(h); live.render(); return +b.toFixed(3); },
      // panel i's centre in CSS px (for the gates' colour crop), null behind the camera
      screen(i) {
        const q = panels[i].pos.clone().project(camera);
        if (q.z > 1) return null;
        const r = live.renderer.domElement.getBoundingClientRect();
        return [r.left + (q.x + 1) / 2 * r.width, r.top + (1 - q.y) / 2 * r.height];
      },
      values: () => Array.from(level.array, (v) => +v.toFixed(4)),
      kinds: () => panels.map((p) => p.kind),
      // the mean update() time per frame since the last call (ms), and the frames it covers
      cost() { const r = { ms: frames ? +(cost / frames).toFixed(4) : 0, frames }; cost = 0; frames = 0; return r; },
      info: () => ({ on: forced || near, near, forced, k: +k.toFixed(3), beat: +b.toFixed(2), visible: mesh.visible, settled, seen,
        panels: N, university: panels.filter((p) => p.kind === 0).length, houses: panels.filter((p) => p.kind === 1).length,
        pattern: PATTERNS[Math.floor(b / PHRASE) % PATTERNS.length].name, floors: norm.floors }),
    },
  };
}
