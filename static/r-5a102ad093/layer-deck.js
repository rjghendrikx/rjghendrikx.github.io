// Live layer: the DJ corner plays, and the facades opposite play with it (round 023 A; Ruud 2026-10-23: "op die
// draaitafels een track starten en dat dan ook de lichtshow buiten triggert"). Two narrow decks and a two-channel mixer
// on the DJ table by the chimney breast (objects/pr_xdj.py, pr_djm450.py).
//
// The track on deck A is Ruud's choice (title and artist come from the node's hooks, the card links the real release).
// What plays is not that record: no licence, so no audio file. It is a generic deep-house stand-in synthesised here in
// Web Audio at BPM, from SCORE below (intro 16 bars, a long build, drop, breakdown, a second build, drop, outro: 144 bars,
// 4:43). Sound plays only while the room's Sound switch is on (layer-audio.js); without it the deck runs silent.
// The light show (layer-stage.js) reads features(), computed from the same SCORE: an arrangement, not an FFT of a
// recording. The kick gives only the beat phase; the low end (kick + bass, over 1.5 bars) is the energy macro; the hats
// set the sparkle rate; the long envelope (8 bars) the houses' fade level. So the screen and the facade show what the
// synth plays, exactly, with or without sound, and a gate can replay any beat.
//
// The mixer (the room's wiring, said on the card): channel 1's fader is the offices' level and the sound's, channel 2's
// the canal houses', the crossfader balances the offices (left) against the houses (right), a low cut on either low knob
// empties the low end: the facade falls into a breakdown, and the release is a hero flash.
// Click: a deck plays or stops the track; on the mixer, a fader slot sets that fader where you click, a low knob toggles
// the cut. Keys in the Decks view: Space play/stop, [ ] the crossfader, L the low cut. The card's act does play/stop.
// ?gate: nothing starts, api.play / api.advance drive it. Reduced motion: the deck plays, the overlay draws no
// scrolling waveform (a still bar), and the show outside is a slow still fade (layer-stage.js).
// One mesh (the two screens, the fader caps, the low knobs' marks), one ShaderMaterial, one canvas texture: +1 draw call.
// Hooks: lib/live.py PROP_HOOKS pr_xdj (xdj_*), pr_djm450 (djm450_*), node-local glTF axes.
import { noPick } from './layer-common.js';

export const BPM = 122;
// the arrangement: [kind, bars]; per bar the levels below (barInfo)
export const SECTIONS = [['intro', 16], ['build', 16], ['drop', 32], ['breakdown', 16], ['build', 16], ['drop', 32], ['outro', 16]];
export const BARS = SECTIONS.reduce((a, s) => a + s[1], 0);
export const LENGTH = (BARS * 4 * 60) / BPM;   // s
const SEC_START = SECTIONS.reduce((a, s, i) => (a.push(i ? a[i - 1] + SECTIONS[i - 1][1] : 0), a), []);
const CHORDS = [[57, 60, 64, 67], [53, 57, 60, 64], [48, 52, 55, 59], [55, 59, 62, 65]];   // Am7 Fmaj7 Cmaj7 G7 (MIDI)
const ROOTS = [33, 29, 36, 31];   // A1 F1 C2 G1
const midi = (n) => 440 * 2 ** ((n - 69) / 12);

// one bar of the score: which section, where in it, and the levels 0..1 the synth plays and the features read
export function barInfo(bar) {
  let s = SECTIONS.length - 1;
  while (s > 0 && bar < SEC_START[s]) s--;
  const [kind, len] = SECTIONS[s], j = bar - SEC_START[s], u = j / len;
  const b = { kind, sec: s, j, len, u, kick: 1, bass: 0, hat: 0.4, pad: 0, riser: 0, roll: 0, vac: 0, clap: 0 };
  if (kind === 'intro') Object.assign(b, { bass: u < 0.5 ? 0 : 0.35, hat: u < 0.25 ? 0.2 : 0.45, pad: 0.15 });
  else if (kind === 'build') {
    // choreo.phrase over the last 8 bars: 2 beats of breakdown, the clap grid doubling 1 -> 2 -> 4 per beat, a beat of
    // vacuum before the drop (metal-visuals engine/choreo.py phrase, stages 0.5/0.25/0.25, long build: 32 beats)
    Object.assign(b, { bass: 0.6, hat: 0.45 + 0.5 * u, clap: 1, riser: Math.max(0, (u - 0.5) * 2) ** 1.5, pad: 0.2 });
    const k = len - j;   // bars to go
    b.roll = k > 8 ? 0 : k > 4 ? 1 : k > 2 ? 2 : 4;
    if (k === 8) b.vac = -2;   // the phrase's breakdown: the first two beats without the kick
    if (k === 1) b.vac = 1;    // the vacuum: the last beat silent
  } else if (kind === 'drop') Object.assign(b, { bass: 1, hat: 1, pad: 0.45, clap: 1 });
  else if (kind === 'breakdown') Object.assign(b, { kick: 0, bass: 0.12, hat: 0.12, pad: 1 });
  else Object.assign(b, { bass: 0.5 * (1 - u), hat: 0.5 * (1 - u) + 0.1, kick: u < 0.75 ? 1 : 0, pad: 0.2 * (1 - u) });
  return b;
}
// per beat: the low end (kick + bass, minus the silent beats) and the hats; built once
const LOW = new Float32Array(BARS * 4), HAT = new Float32Array(BARS * 4), PAD = new Float32Array(BARS * 4);
for (let bar = 0; bar < BARS; bar++) {
  const b = barInfo(bar);
  for (let q = 0; q < 4; q++) {
    const silent = (b.vac > 0 && q >= 4 - b.vac) || (b.vac < 0 && q < -b.vac);
    LOW[bar * 4 + q] = silent ? 0 : 0.6 * b.kick + 0.4 * b.bass;
    HAT[bar * 4 + q] = silent ? 0 : b.hat;
    PAD[bar * 4 + q] = b.pad;
  }
}
const mean = (arr, b0, b1) => { let s = 0, n = 0; for (let i = Math.max(0, Math.floor(b0)); i <= Math.min(arr.length - 1, Math.floor(b1)); i++) { s += arr[i]; n++; } return n ? s / n : 0; };
// what the show reads at track beat `beat` (low: the mixer's low cut, 0..1 of the low end kept)
export function features(beat, low = 1) {
  const bb = Math.max(0, Math.min(BARS * 4 - 1e-6, beat)), bar = Math.floor(bb / 4), b = barInfo(bar);
  const energy = mean(LOW, bb - 6, bb) * low;                   // the low-band level over 1.5 bars: the energy macro
  const fade = (mean(LOW, bb - 32, bb) * low + mean(PAD, bb - 32, bb)) / 1.4;   // the long envelope, 8 bars
  return { beat: bb, bar, kind: b.kind, sec: b.sec, u: b.u + (bb / 4 - bar) / b.len, secBeat: (bar - SEC_START[b.sec]) * 4 + (bb % 4),
    secLen: b.len * 4, phase: bb % 1, energy, sparkle: HAT[Math.floor(bb)], fade: Math.min(1, fade), roll: b.roll, vac: b.vac, low };
}

const LOOK = 0.25;                // s of audio scheduled ahead
const LEVEL = 0.32;               // the deck's level under the room's master (layer-audio MASTER 0.55)
const LIFT = 0.0012;              // m over the baked screens
const CAP = [0.018, 0.010, 0.011];   // m: a fader cap (across, along, high)
const CANVAS = [512, 576];        // the two screens stacked, 16:9 each
const DRAW_HZ = 15;               // the screens' redraw rate while playing

const STYLE = `.deck-keys { position: fixed; left: 50%; transform: translateX(-50%); bottom: 64px; font: 12px/1.3 inherit; color: var(--muted, #b9ab98);
  background: rgba(20, 17, 15, .6); border-radius: 8px; padding: 6px 10px; pointer-events: none; transition: opacity .3s; }
.deck-keys[hidden] { display: none; } .gate .deck-keys { display: none; }`;

export default function mount(live) {
  const { THREE, scene, byName, params, camera } = live;
  const dk = byName('pr_xdj'), mx = byName('pr_djm450');
  const D = dk?.userData, M = mx?.userData;
  if (!D?.xdj_screen_center || !M?.djm450_xf_center) return null;
  dk.updateMatrixWorld(true); mx.updateMatrixWorld(true);
  const [title, artist] = D.xdj_track ?? ['', ''];
  const V = (a) => new THREE.Vector3(...a);
  const wDk = (v) => V(v).applyMatrix4(dk.matrixWorld), wMx = (v) => V(v).applyMatrix4(mx.matrixWorld);
  const axisOf = (node, a) => V(a).transformDirection(node.matrixWorld);
  const ex = axisOf(dk, [1, 0, 0]), ez = axisOf(dk, [0, 0, 1]), ey = axisOf(dk, [0, 1, 0]);   // glTF: x across, -z to the back
  const mxX = axisOf(mx, [1, 0, 0]), mxZ = axisOf(mx, [0, 0, 1]);

  // --- the overlay: quads and boxes in world space, kind per vertex, one shader
  const pos = [], uv = [], kind = [];
  const quad = (c, ax, ay, k, u0 = 0, v0 = 0, u1 = 1, v1 = 1) => {
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]]) {
      pos.push(...c.clone().addScaledVector(ax, sx).addScaledVector(ay, sy).toArray());
      uv.push(sx < 0 ? u0 : u1, sy < 0 ? v0 : v1); kind.push(k);
    }
  };
  const [sw, sh] = D.xdj_screen_size, sc = D.xdj_screen_center;
  D.xdj_deck_x.forEach((dx, i) => {
    const c = wDk([sc[0] + dx, sc[1] + LIFT, sc[2]]);
    // glTF screen centre z is -y_blender; the image's top lies towards the back (-z glTF)
    quad(c, ex.clone().multiplyScalar(sw / 2), ez.clone().multiplyScalar(-sh / 2), i, 0, i ? 0 : 0.5, 1, i ? 0.5 : 1);
  });
  const box = (c, a, b, k) => {   // a cap: a box of half sizes a (across), b (along), CAP[2]/2 up, top face and four sides
    const h = ey.clone().multiplyScalar(CAP[2] / 2), cc = c.clone().add(h);
    quad(cc.clone().add(h), a, b, k);
    quad(cc.clone().add(b), a, h, k); quad(cc.clone().sub(b), a, h, k);
    quad(cc.clone().add(a), b, h, k); quad(cc.clone().sub(a), b, h, k);
  };
  const top = M.djm450_top_z;
  const chC = M.djm450_ch_centers.map((p) => wMx(p)), xfC = wMx(M.djm450_xf_center), lowC = M.djm450_low_knobs.map((p) => wMx(p));
  chC.forEach((c, i) => box(c, mxX.clone().multiplyScalar(CAP[0] / 2), mxZ.clone().multiplyScalar(CAP[1] / 2), 2 + i));
  box(xfC, mxX.clone().multiplyScalar(CAP[1] / 2), mxZ.clone().multiplyScalar(CAP[0] / 2), 4);
  const kr = M.djm450_knob_r;
  lowC.forEach((c, i) => quad(c.clone().addScaledVector(ey, 0.0152), mxX.clone().multiplyScalar(kr * 1.3), mxZ.clone().multiplyScalar(kr * 1.3), 5 + i));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('aKind', new THREE.Float32BufferAttribute(kind, 1));

  const canvas = document.createElement('canvas');
  [canvas.width, canvas.height] = CANVAS;
  const g2 = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;   // ShaderMaterial output is display sRGB: sample the canvas as it is
  const U = { uTex: { value: tex }, uOff: { value: [0, 0, 0, 0, 0, 0, 0] }, uCh: { value: new THREE.Vector3() }, uXf: { value: new THREE.Vector3() },
    uChAxis: { value: mxZ.clone().multiplyScalar(-1) }, uXfAxis: { value: mxX.clone() }, uKr: { value: kr }, uLow: { value: new THREE.Vector2() },
    uKnobX: { value: mxX.clone() }, uKnobZ: { value: mxZ.clone() }, uLit: { value: 0.75 } };
  const mat = new THREE.ShaderMaterial({ uniforms: U, side: THREE.DoubleSide, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
    vertexShader: `attribute float aKind; uniform float uOff[7]; uniform vec3 uChAxis, uXfAxis; varying vec2 vUv; varying float vK;
      void main() { vUv = uv; vK = aKind; vec3 p = position; int k = int(aKind + 0.5);
        if (k == 2 || k == 3) p += uChAxis * uOff[k]; if (k == 4) p += uXfAxis * uOff[4];
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0); }`,
    fragmentShader: `uniform sampler2D uTex; uniform vec2 uLow; uniform float uLit; varying vec2 vUv; varying float vK;
      void main() { int k = int(vK + 0.5);
        if (k <= 1) { gl_FragColor = vec4(texture2D(uTex, vUv).rgb * uLit, 1.0); return; }
        if (k <= 4) { float e = step(0.82, max(abs(vUv.x - 0.5), abs(vUv.y - 0.5)) * 2.0); gl_FragColor = vec4(mix(vec3(0.62, 0.6, 0.57), vec3(0.2), e) * uLit, 1.0); return; }
        // a low knob's mark: an amber ring at the knob's rim while it cuts
        float r = length(vUv - 0.5) * 2.0, on = k == 5 ? uLow.x : uLow.y;
        float ring = smoothstep(0.62, 0.7, r) * (1.0 - smoothstep(0.86, 0.94, r));
        gl_FragColor = vec4(vec3(1.0, 0.58, 0.2) * uLit, ring * on); }`,
  });
  const mesh = noPick(new THREE.Mesh(geo, mat));
  mesh.name = 'deck_overlay';
  mesh.frustumCulled = false;
  scene.add(mesh);

  // --- state
  const reduce = () => live.reduceMotion.matches;
  const S = { playing: false, t: 0, xf: 0.5, ch: [1, 1], low: [false, false], lowK: 1 };
  let ctx = null, bus = null, anchor = 0, nextStep = 0, noise = null, drawT = 0, cost = 0, frames = 0;
  // what the stage layer reads each frame (layer-deck mounts before layer-stage, so this is current when it updates)
  live.show = { get playing() { return S.playing; }, get beat() { return (S.t * BPM) / 60; }, get xf() { return S.xf; },
    get ch() { return S.ch; }, get low() { return S.lowK; }, stop: () => play(false) };   // stop: merge 023 action 1 (the show's chip)

  function soundOn() { return !live.gate && !!window.__room?.layers?.audio?.info?.().on; }
  function audioUp() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC({ latencyHint: 'playback' });
    const out = ctx.createGain(), shelf = ctx.createBiquadFilter(), ch = ctx.createGain();
    shelf.type = 'lowshelf'; shelf.frequency.value = 220; shelf.gain.value = 0;
    out.gain.value = LEVEL;
    ch.connect(shelf).connect(out).connect(ctx.destination);
    bus = { out, shelf, ch };
    const n = ctx.sampleRate, buf = ctx.createBuffer(1, n, n), d = buf.getChannelData(0);
    let s = 22222; for (let i = 0; i < n; i++) { s = (s * 16807) % 2147483647; d[i] = (s / 2147483647) * 2 - 1; }
    noise = buf;
    return ctx;
  }
  // the synth: one 16th of the score at audio time `at`
  function voice(step, at) {
    const bar = Math.floor(step / 16), q = step % 16, b = barInfo(bar), beat = Math.floor(q / 4), sp = 60 / BPM / 4;
    const silent = (b.vac > 0 && beat >= 4 - b.vac) || (b.vac < 0 && beat < -b.vac);
    const env = (node, a, peak, d) => { node.gain.setValueAtTime(0, at); node.gain.linearRampToValueAtTime(peak, at + a); node.gain.exponentialRampToValueAtTime(0.0008, at + a + d); };
    const osc = (type, f) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; return o; };
    const g = () => ctx.createGain();
    const filt = (type, f, Q = 0.7) => { const x = ctx.createBiquadFilter(); x.type = type; x.frequency.value = f; x.Q.value = Q; return x; };
    const hit = (src, node, end) => { src.connect(node); node.connect(bus.ch); src.start(at); src.stop(end); };
    const noiseHit = (f, Q, type, peak, d) => {
      const s = ctx.createBufferSource(), fl = filt(type, f, Q), a = g();
      s.buffer = noise; env(a, 0.001, peak, d);
      s.connect(fl).connect(a).connect(bus.ch); s.start(at, (step % 97) / 97 * 0.8); s.stop(at + d + 0.05);
    };
    if (silent) return;
    if (b.kick && q % 4 === 0) {   // a sine with a falling pitch
      const o = osc('sine', 120), a = g();
      o.frequency.setValueAtTime(130, at); o.frequency.exponentialRampToValueAtTime(46, at + 0.12);
      env(a, 0.002, 0.95, 0.32); hit(o, a, at + 0.4);
    }
    if (b.hat > 0.7 || (b.hat > 0.3 && q % 2 === 0) || (b.hat > 0 && q % 4 === 2)) noiseHit(8000, 0.8, 'highpass', (q % 4 === 2 ? 0.22 : 0.09) * b.hat, q % 4 === 2 ? 0.12 : 0.035);
    const rollOn = b.roll && (q % (4 / b.roll) === 0);
    if ((b.clap && (q === 4 || q === 12) && !b.roll) || rollOn) noiseHit(1500, 1.2, 'bandpass', b.roll ? 0.18 + 0.1 * b.roll : 0.3, 0.12);
    if (b.bass && [2, 6, 10, 14, 11].includes(q)) {   // the off-beat bass, the bar's chord root
      const o = osc('sawtooth', midi(ROOTS[bar % 4] + (q === 11 ? 12 : 0))), f = filt('lowpass', 260 + 340 * b.bass, 3), a = g();
      o.connect(f); env(a, 0.004, 0.32 * b.bass, sp * 1.6); f.connect(a); a.connect(bus.ch); o.start(at); o.stop(at + sp * 2);
    }
    if (b.pad && q === 0) {   // a chord over the bar, slow in, through a low-pass that opens with the level
      const a = g(), f = filt('lowpass', 500 + 1400 * b.pad, 0.8), end = at + sp * 16;
      a.gain.setValueAtTime(0, at); a.gain.linearRampToValueAtTime(0.05 * b.pad, at + sp * 4); a.gain.linearRampToValueAtTime(0, end);
      f.connect(a); a.connect(bus.ch);
      for (const n of CHORDS[bar % 4]) for (const det of [-6, 6]) { const o = osc('sawtooth', midi(n)); o.detune.value = det; o.connect(f); o.start(at); o.stop(end + 0.05); }
    }
    if (b.riser && q === 0) {   // noise through a band-pass that climbs over the bar
      const s = ctx.createBufferSource(); s.buffer = noise; s.loop = true;
      const f = filt('bandpass', 400, 2), a = g(), end = at + sp * 16;
      f.frequency.setValueAtTime(300 + 4000 * b.riser, at); f.frequency.exponentialRampToValueAtTime(600 + 6000 * b.riser, end);
      a.gain.setValueAtTime(0.02 + 0.08 * b.riser, at); a.gain.linearRampToValueAtTime(0.03 + 0.12 * b.riser, end);
      s.connect(f).connect(a).connect(bus.ch); s.start(at); s.stop(end);
    }
  }
  function mixAudio() {
    if (!bus) return;
    const t = ctx.currentTime;
    bus.ch.gain.setTargetAtTime(S.ch[0] ** 2, t, 0.03);
    bus.shelf.gain.setTargetAtTime(S.lowK < 0.5 ? -30 : 0, t, 0.03);
  }
  function schedule() {
    if (!ctx || ctx.state !== 'running') return;
    const sp = 60 / BPM / 4, until = S.t + LOOK;
    while (nextStep * sp < until && nextStep < BARS * 16) { const at = anchor + nextStep * sp; if (at >= ctx.currentTime) voice(nextStep, at); nextStep++; }
  }
  function syncAudio() {
    const want = S.playing && soundOn();
    if (want) {
      if (!audioUp()) return;
      if (ctx.state !== 'running') ctx.resume().catch(() => {});
      if (!bus.live) { bus.live = true; anchor = ctx.currentTime + 0.05 - S.t; nextStep = Math.ceil((S.t * BPM * 4) / 60); bus.out.gain.setTargetAtTime(LEVEL, ctx.currentTime, 0.05); mixAudio(); }
    } else if (ctx && bus?.live) {
      bus.live = false;
      bus.out.gain.setTargetAtTime(0, ctx.currentTime, 0.04);
      setTimeout(() => { if (!bus.live && ctx.state === 'running') ctx.suspend().catch(() => {}); }, 300);
    }
  }

  // --- the screens: deck A playing (or cued), deck B empty
  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  function draw() {
    const [w] = CANVAS, h = CANVAS[1] / 2, ink = '#ecd6ba', mute = '#968068', amber = '#e69646';
    g2.fillStyle = '#100b08'; g2.fillRect(0, 0, w, CANVAS[1]);
    g2.textBaseline = 'top';
    g2.font = 'bold 38px "DIN Condensed", "Arial Narrow", sans-serif'; g2.fillStyle = ink; g2.fillText(title, 16, 12, w - 140);
    g2.font = '24px "DIN Condensed", "Arial Narrow", sans-serif'; g2.fillStyle = mute; g2.fillText(artist, 16, 54);
    g2.font = 'bold 38px "DIN Condensed", "Arial Narrow", sans-serif'; g2.fillStyle = ink; g2.fillText(BPM.toFixed(1), w - 110, 12);
    g2.font = '24px "DIN Condensed", "Arial Narrow", sans-serif'; g2.fillStyle = mute; g2.fillText('BPM', w - 110, 54);
    g2.fillText(`-${fmt(LENGTH - S.t)}`, w - 110, 84);
    g2.fillStyle = '#e3a35b'; g2.fillText('STAND-IN', w - 230, 54); g2.fillStyle = mute;   // merge 023 action 9: the BPM and the time are the stand-in's
    const f = features((S.t * BPM) / 60, S.lowK);
    g2.fillStyle = S.playing ? '#9fd27a' : amber;
    g2.fillText(S.playing ? `PLAY  ${f.bar + 1}.${Math.floor(f.beat % 4) + 1}  ${f.kind.toUpperCase()}` : 'CUE', 16, 84);
    // the zoomed waveform: +-2 bars round the playhead, the three bands of the score (low amber, mid peach, high white)
    const y0 = 124, y1 = 222, mid = (y0 + y1) / 2, beats = 8, B = (S.t * BPM) / 60;
    for (let x = 0; x < w; x += 2) {
      const bt = B + ((x - w / 2) / w) * 2 * beats;
      if (bt < 0 || bt >= BARS * 4) continue;
      const i = Math.floor(bt), ph = bt - i, kick = LOW[i] > 0.3 ? Math.exp(-ph * 6) : 0;
      const lo = (0.5 * kick + 0.25 * LOW[i]) * (S.lowK), hi = HAT[i] * (0.4 + 0.6 * Math.abs(Math.sin(ph * Math.PI * 4))) * 0.35;
      g2.fillStyle = '#b8642a'; g2.fillRect(x, mid - lo * 48, 2, lo * 96);
      g2.fillStyle = '#f0c8a0'; g2.fillRect(x, mid - (PAD[i] * 0.3) * 48, 2, PAD[i] * 0.3 * 96);
      g2.fillStyle = '#fff4e6'; g2.fillRect(x, mid - hi * 48, 2, hi * 96);
    }
    g2.fillStyle = amber; g2.fillRect(w / 2 - 1, y0 - 4, 3, y1 - y0 + 8);
    // the overview: the whole track by beat, played part dimmed
    const o0 = 238, o1 = 278;
    for (let x = 16; x < w - 16; x++) {
      const i = Math.floor(((x - 16) / (w - 32)) * BARS * 4), e = LOW[i] * 0.7 + PAD[i] * 0.2 + HAT[i] * 0.1;
      g2.fillStyle = i < B ? '#5a3a24' : '#c87837'; g2.fillRect(x, (o0 + o1) / 2 - e * 18, 1, e * 36 + 1);
    }
    g2.fillStyle = ink; g2.fillRect(16 + (B / (BARS * 4)) * (w - 32), o0 - 2, 2, o1 - o0 + 4);
    // deck B
    g2.font = 'bold 38px "DIN Condensed", "Arial Narrow", sans-serif'; g2.fillStyle = mute; g2.fillText('No track loaded', 16, h + 12);
    g2.font = '24px "DIN Condensed", "Arial Narrow", sans-serif'; g2.fillStyle = '#6e5c4a'; g2.fillText('Browse to load', 16, h + 54);
    tex.needsUpdate = true;
  }
  function controls() {
    U.uOff.value[2] = (S.ch[0] - 0.5) * M.djm450_ch_len;
    U.uOff.value[3] = (S.ch[1] - 0.5) * M.djm450_ch_len;
    U.uOff.value[4] = (S.xf - 0.5) * M.djm450_xf_len;
    U.uLow.value.set(S.low[0] ? 1 : 0, S.low[1] ? 1 : 0);
  }
  draw(); controls();

  function play(v = !S.playing) {
    S.playing = !!v;
    if (S.playing && S.t >= LENGTH - 0.05) S.t = 0;
    // merge 023 (panel 023 action 9): the deck tells the truth on every surface: the title is cued, the stand-in plays
    status(S.playing ? `Deck 1 cued with ${title}; playing a synthesised stand-in at ${BPM} BPM; the facades opposite play with it` : `Stopped the stand-in at ${fmt(S.t)}`);
    syncAudio(); draw(); live.render();
    dispatchEvent(new CustomEvent('room:deck', { detail: { playing: S.playing } }));
    return S.playing;
  }
  function set(k, v) {
    if (k === 'xf') S.xf = Math.min(1, Math.max(0, v));
    else if (k === 'ch1' || k === 'ch2') S.ch[k === 'ch1' ? 0 : 1] = Math.min(1, Math.max(0, v));
    else if (k === 'low') { S.low = [!!v, !!v]; }
    S.lowK = S.low[0] || S.low[1] ? 0 : 1;
    controls(); mixAudio(); live.render();
  }
  // an aria-live line for the deck's state (the page's own status line if there is one)
  const live_ = document.querySelector('[role="status"]');
  const status = (s) => { if (live_ && !live.gate) live_.textContent = s; };

  // picks: a deck plays or stops; on the mixer the slot or knob under the click (node-local hit, glTF axes)
  let lastHit = null;
  live.picks.push({ object: dk, accept: (p) => dk.worldToLocal(p.clone()).y > D.xdj_top - 0.02, onPick: () => play() });
  live.picks.push({ object: mx, accept: (p) => { lastHit = mx.worldToLocal(p.clone()); return !!control(lastHit); }, onPick: () => { const c = control(lastHit); if (c) c(); } });
  function control(l) {
    if (!l || l.y < top - 0.006) return null;
    const near = (c, ax, len) => Math.abs(l.x - c[0]) < (ax === 'x' ? len / 2 + 0.01 : 0.014) && Math.abs(l.z - c[2]) < (ax === 'z' ? len / 2 + 0.01 : 0.014);
    const xf = M.djm450_xf_center, L = M.djm450_xf_len;
    if (near(xf, 'x', L)) return () => set('xf', (l.x - xf[0]) / L + 0.5);
    for (let i = 0; i < 2; i++) {
      const c = M.djm450_ch_centers[i];
      if (near(c, 'z', M.djm450_ch_len)) return () => set(`ch${i + 1}`, 0.5 - (l.z - c[2]) / M.djm450_ch_len);   // up = towards the back (-z)
      const k = M.djm450_low_knobs[i];
      if (Math.hypot(l.x - k[0], l.z - k[2]) < M.djm450_knob_r * 1.6) return () => set('low', !S.low[i]);
    }
    return null;
  }
  // keys, only in the Decks view (the walk's keys stay the walk's)
  if (!live.gate) {
    const style = document.createElement('style'); style.textContent = STYLE; document.head.appendChild(style);
    addEventListener('keydown', (ev) => {
      if (live.view() !== 'decks' || ev.defaultPrevented || ev.target?.closest?.('input, textarea, [contenteditable]')) return;
      if (ev.code === 'Space') { ev.preventDefault(); play(); } else if (ev.code === 'BracketLeft') set('xf', S.xf - 0.1);
      else if (ev.code === 'BracketRight') set('xf', S.xf + 0.1); else if (ev.code === 'KeyL') set('low', !(S.low[0] || S.low[1]));
    });
  }
  if (params.has('deck') && !live.gate) play(true);
  live.deckStep = (h) => { if (S.playing) timed(h); };   // layer-stage api.advance: the deck in lockstep under ?gate

  function step(dt) {
    syncAudio();
    if (!S.playing) return false;
    if (ctx && bus?.live && ctx.state === 'running') S.t = ctx.currentTime - anchor;   // the audio clock leads when it plays
    else S.t += dt;
    if (S.t >= LENGTH) { S.t = LENGTH; play(false); S.t = 0; draw(); return true; }
    schedule();
    drawT += dt;
    if (drawT >= 1 / DRAW_HZ && (!reduce() || drawT >= 1)) { drawT = 0; draw(); }
    return true;
  }
  function timed(dt) { const t0 = performance.now(), r = step(dt); cost += performance.now() - t0; frames++; return r; }

  // merge 023 (panel 023 action 1): in the Decks view the way home says the track keeps playing (the stop is the card's act
  // here and the "Stop the show" chip everywhere); elsewhere the pill keeps main.js's words
  let backWas = null;
  function backPill(view = live.view()) {
    const el = document.querySelector('.back');
    if (!el || live.gate) return;
    backWas ??= el.innerHTML;
    el.innerHTML = view === 'decks' && S.playing ? 'Back to the room · the track keeps playing<span class="esc"> · Esc</span>' : backWas;
  }
  addEventListener('room:deck', () => backPill());

  return {
    name: 'deck',
    onView: (id) => backPill(id),
    update(dt) { return live.gate ? false : timed(dt); },
    api: {
      play: (v) => play(v ?? true), stop: () => play(false), toggle: () => play(), set,
      seek(beat) { S.t = Math.max(0, (beat * 60) / BPM); nextStep = Math.ceil((S.t * BPM * 4) / 60); if (ctx) anchor = ctx.currentTime + 0.05 - S.t; draw(); live.render(); return S.t; },
      advance(sec, h = 1 / 60) { let s = Math.round(sec / h); while (s-- > 0) timed(h); live.render(); return +S.t.toFixed(3); },
      features: (beat) => features(beat ?? (S.t * BPM) / 60, S.lowK),
      // a control's screen point in CSS px (the gates' clicks): 'deck0', 'deck1', 'xf', 'ch1', 'ch2', 'low1'
      screen(what) {
        const p = what.startsWith('deck') ? wDk([D.xdj_deck_x[+what[4]], D.xdj_top, D.xdj_jog_center[2]])
          : what === 'xf' ? xfC.clone().addScaledVector(mxX, (S.xf - 0.5) * M.djm450_xf_len) : what.startsWith('ch') ? chC[+what[2] - 1].clone() : lowC[+what[3] - 1].clone();
        const q = p.project(camera), r = live.renderer.domElement.getBoundingClientRect();
        return q.z > 1 ? null : [r.left + ((q.x + 1) / 2) * r.width, r.top + ((1 - q.y) / 2) * r.height];
      },
      cost() { const r = { ms: frames ? +(cost / frames).toFixed(4) : 0, frames }; cost = 0; frames = 0; return r; },
      info: () => ({ playing: S.playing, t: +S.t.toFixed(2), beat: +((S.t * BPM) / 60).toFixed(2), bpm: BPM, length: +LENGTH.toFixed(1), title, artist,
        xf: S.xf, ch: [...S.ch], low: S.lowK < 0.5, audio: ctx?.state ?? 'none', sounding: !!bus?.live }),
    },
  };
}
