import { noPick } from './layer-common.js';
import { C, FACES } from './content.js';
import { masterChain, MASTER } from './layer-audio.js';

export const BPM = 122;
export const EQ = { lowHz: 220, midHz: 1000, midQ: 0.7, highHz: 3200, angle: (150 * Math.PI) / 180 };
const TAPER = [[-5, -30], [-4, -18], [-3, -12], [-2, -7], [-1, -3], [0, 0], [1, 1.5], [2, 3], [3, 4.5], [4, 5.5], [5, 6]];
export const knobDb = (k) => {
  const h = Math.min(5, Math.max(-5, k * 5)), j = Math.min(9, Math.floor(h + 5)), [h0, d0] = TAPER[j], [, d1] = TAPER[j + 1];
  return d0 + (d1 - d0) * (h - h0);
};
export const clock = (c) => (c - 12) / 5;
export const keepOf = (k) => (k <= -1 + 1e-6 ? 0 : 10 ** (knobDb(k) / 20));
export const TREE = { start: [clock(7), clock(9), clock(10.5)], open: clock(11) };
export const REC = { files: ['deck-a.mp3', 'deck-b.mp3'], pre: 0.5, click: 0.25 };
export const recUrl = (i) => new URL(`audio/${REC.files[i]}`, import.meta.url).href;
export function leadOf(buf) {
  const d = buf.getChannelData(0), n = Math.min(d.length, Math.floor(REC.pre * buf.sampleRate));
  let k = 0; for (let i = 1; i < n; i++) if (Math.abs(d[i]) > Math.abs(d[k])) k = i;
  return k / buf.sampleRate - REC.click;
}
const LEAD_BEATS = 2;
const midi = (n) => 440 * 2 ** ((n - 69) / 12);
const hash = (n) => { let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16; return (x >>> 0) / 4294967296; };

function makeTrack(sections, levels) {
  const SEC_START = sections.reduce((a, s, i) => (a.push(i ? a[i - 1] + sections[i - 1][1] : 0), a), []);
  const BARS = sections.reduce((a, s) => a + s[1], 0), LENGTH = (BARS * 4 * 60) / BPM;
  function barInfo(bar) {
    let s = sections.length - 1;
    while (s > 0 && bar < SEC_START[s]) s--;
    const [kind, len] = sections[s], j = bar - SEC_START[s], u = j / len;
    const b = { kind, sec: s, j, len, u, kick: 1, bass: 0, hat: 0.4, pad: 0, riser: 0, roll: 0, vac: 0, clap: 0, stab: 0, perc: 0, seq: 0, cut: 0, rec: 0, drone: 0 };
    levels(b, bar);
    return b;
  }
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
  function features(beat, low = 1) {
    const bb = Math.max(0, Math.min(BARS * 4 - 1e-6, beat)), bar = Math.floor(bb / 4), b = barInfo(bar);
    const energy = mean(LOW, bb - 6, bb) * low;
    const fade = (mean(LOW, bb - 32, bb) * low + mean(PAD, bb - 32, bb)) / 1.4;
    return { beat: bb, bar, kind: b.kind, sec: b.sec, u: b.u + (bb / 4 - bar) / b.len, secBeat: (bar - SEC_START[b.sec]) * 4 + (bb % 4),
      secLen: b.len * 4, phase: bb % 1, energy, sparkle: HAT[Math.floor(bb)], fade: Math.min(1, fade), roll: b.roll, vac: b.vac, low };
  }
  return { SECTIONS: sections, SEC_START, BARS, LENGTH, barInfo, LOW, HAT, PAD, features };
}

const CHORDS = [[57, 60, 64, 67], [53, 57, 60, 64], [48, 52, 55, 59], [55, 59, 62, 65]];
const ROOTS = [33, 29, 36, 31];
const A = makeTrack([['intro', 16], ['build', 16], ['drop', 32], ['breakdown', 16], ['build', 16], ['drop', 32], ['outro', 16]], (b) => {
  const { kind, j, len, u } = b;
  if (kind === 'intro') Object.assign(b, { bass: u < 0.5 ? 0 : 0.35, hat: u < 0.25 ? 0.2 : 0.45, pad: 0.15, stab: u < 0.5 ? 0 : 0.4 });
  else if (kind === 'build') {
    Object.assign(b, { bass: 0.6, hat: 0.45 + 0.5 * u, clap: 1, riser: Math.max(0, (u - 0.5) * 2) ** 1.5, pad: 0.2, stab: 0.55 + 0.3 * u });
    const k = len - j;
    b.roll = k > 8 ? 0 : k > 4 ? 1 : k > 2 ? 2 : 4;
    if (k === 8) b.vac = -2;
    if (k === 1) b.vac = 1;
  } else if (kind === 'drop') Object.assign(b, { bass: 1, hat: 1, pad: 0.45, clap: 1, stab: 1 });
  else if (kind === 'breakdown') Object.assign(b, { kick: 0, bass: 0.12, hat: 0.12, pad: 1, stab: 0.6 });
  else Object.assign(b, { bass: 0.5 * (1 - u), hat: 0.5 * (1 - u) + 0.1, kick: u < 0.75 ? 1 : 0, pad: 0.2 * (1 - u), stab: 0.7 * (1 - u) });
});
const LINE = [57, null, 64, 60, null, 67, 62];
const B = makeTrack([['intro', 16], ['build', 16], ['drop', 32], ['breakdown', 16], ['build', 8], ['drop', 32], ['outro', 16]], (b, bar) => {
  const { kind, j, len, u, sec } = b, drift = 0.5 + 0.5 * Math.sin((bar / 16) * 2 * Math.PI);
  b.rec = 0.3;
  if (kind === 'intro') Object.assign(b, { hat: u < 0.5 ? 0.35 : 0.6, perc: u < 0.5 ? 0 : 0.6, drone: 0.6, pad: 0.25 });
  else if (kind === 'build') {
    Object.assign(b, { bass: 0.7, hat: 0.7 + 0.3 * u, perc: 1, seq: 0.35 + 0.65 * u, cut: 0.15 + 0.5 * u, drone: 0.4 * (1 - u), pad: 0.35 });
    if (len - j === 1) b.vac = 1;
  } else if (kind === 'drop') Object.assign(b, { bass: 1, hat: 1, perc: 1, seq: 1, cut: 0.4 + 0.45 * drift, rec: sec > 3 ? 0.3 + 0.5 * u : 0.3, pad: 0.5 });
  else if (kind === 'breakdown') Object.assign(b, { kick: 0, hat: 0.2, perc: 0.35, seq: 0.8, cut: 0.3, rec: 0.85, drone: 1, pad: 1 });
  else Object.assign(b, { bass: 0.5 * (1 - u), hat: 0.8 * (1 - u) + 0.1, kick: u < 0.75 ? 1 : 0, perc: 1 - u, seq: 0.7 * (1 - u), cut: 0.25, rec: 0.9, pad: 0.3 * (1 - u) });
});
export const TRACKS = [A, B];
export const { SECTIONS, BARS, LENGTH, barInfo, features } = A;

export const gains = (x) => [x <= 0.5 ? 1 : Math.cos((x - 0.5) * Math.PI), x >= 0.5 ? 1 : Math.sin(x * Math.PI)];
export const LINES = TRACKS.map((T) => new Set(T.SECTIONS.flatMap(([, len], k) => Array.from({ length: Math.ceil(len / 16) }, (_, j) => T.SEC_START[k] + 16 * j))));
export const MIX = { phrase: 4, wait: 16, swapBeats: 0.25, crossBeats: 2 };
export function mixPlan(i, cue, bm) {
  const O = TRACKS[1 - i], I = TRACKS[i], P = 4 * MIX.phrase, e0 = (P * Math.ceil((bm + LEAD_BEATS) / P)) / 4, e1 = Math.floor(bm / 4) + MIX.wait;
  const kickI = (b) => b < I.BARS && I.barInfo(b).kick > 0 && I.barInfo(b).vac >= 0, kickO = (b) => b >= 0 && b < O.BARS && O.barInfo(b).kick > 0;
  const rideOf = (L) => (L >= 24 ? 8 : 4);
  let best = null;
  for (let e = e0; e <= e1; e += MIX.phrase) {
    for (let L = 32; L >= 8; L -= 4) {
      const sIn = cue + L, sOut = e + L;
      if (!kickI(sIn) || sOut + 1 + rideOf(L) > O.BARS || ![1, 2, 3, 4, 5, 6, 7, 8].every((k) => kickO(sOut - k))) continue;
      const key = [I.SEC_START.includes(sIn) ? 2 : LINES[i].has(sIn) ? 1 : 0, O.SEC_START.includes(sOut) ? 2 : LINES[1 - i].has(sOut) ? 1 : 0, L, -e];
      const d = best ? key.findIndex((v, k) => v !== best.key[k]) : 0;
      if (!best || (d >= 0 && key[d] > best.key[d])) best = { key, e, L };
    }
  }
  let e = best?.e ?? e0, L = best?.L ?? Math.max(4, Math.min(8, 4 * Math.floor((O.BARS - e0 - 2) / 4) - 4)), ride = rideOf(L);
  if (!best) ride = Math.max(1, Math.min(ride, O.BARS - e - L - 1));
  const X = L >= 16 ? L - 8 : L / 2, sw = 4 * L, s2 = MIX.swapBeats / 2;
  const sh = kickO(e + L) ? 0 : -s2;
  return { inB: 4 * e, bc: bm - 4 * e, L, X, fb: Math.min(4, X / 4), hiEnd: Math.min(8, X / 2), ms: 4 * X, sw, swA: sw + sh - s2, swB: sw + sh + s2, ride, end: sw + 4 + 4 * ride,
    sIn: cue + L, sOut: e + L, fit: !!best };
}
const lin = (x, a, b) => (b <= a ? +(x >= b) : Math.min(1, Math.max(0, (x - a) / (b - a))));
export const ease = (x, a, b) => 0.5 - 0.5 * Math.cos(Math.PI * lin(x, a, b));
const to = (a, c, u) => a + (c - a) * u;
export const knobOfAmp = (a) => {
  const d = 20 * Math.log10(Math.max(a, 1e-9));
  if (d <= TAPER[0][1]) return -1;
  for (let j = 0; j < 5; j++) { const [h0, d0] = TAPER[j], [h1, d1] = TAPER[j + 1]; if (d <= d1) return (h0 + ((d - d0) / (d1 - d0)) * (h1 - h0)) / 5; }
  return 0;
};
export function mixAt(m, b) {
  const [L0, M0, H0] = TREE.start, k0 = m.k0 ?? [0, 0, 0], e0 = m.e0 ?? [0, 0, 0], f1 = m.f1 ?? 0;
  const w = ease(b, m.bc, m.bc + Math.min(4, -m.bc)), c2 = MIX.crossBeats / 2;
  const hi = ease(b, 2 * m.fb, 4 * m.hiEnd), op = ease(b, 4 * m.hiEnd, m.ms - c2 - 0.5), x = ease(b, m.ms - c2, m.ms + c2), u = ease(b, m.swA, m.swB);
  const nLow = b < m.swA ? to(k0[0], L0, w) : knobOfAmp(u), oLow = b < m.swA ? to(e0[0], 0, w) : knobOfAmp(1 - u);
  const nMid = to(to(k0[1], M0 + (TREE.open - M0) * op, w), 0, x), nHi = to(to(k0[2], H0 * (1 - hi), w), 0, x);
  const oMid = to(to(e0[1], 0, w), M0, x), oHi = to(to(e0[2], 0, w), H0, x);
  const eq = [[oLow, oMid, oHi], [nLow, nMid, nHi]];
  const us = lin(b, m.swA, m.sw + 4);
  const keep = [[keepOf(to(e0[0], 0, w)) * (1 - us), keepOf(oMid), keepOf(oHi)], [us, keepOf(nMid), keepOf(nHi)]];
  const ch = [m.f0 * (1 - ease(b, m.sw + 4, m.end)), b < 0 ? f1 * (1 - w) : ease(b, 0, 4 * m.fb)];
  return { ch, eq, keep };
}
export const TIDY = { knobs: [2, 3], fader: [3, 4], stop: [0, 2] };
export const glideAt = (g, t) => { const u = ease(t, g.delay, g.delay + g.dur); return Array.isArray(g.from) ? g.from.map((v, k) => to(v, g.to[k], u)) : to(g.from, g.to, u); };

function kit(E, at) {
  const { ctx } = E;
  const g = () => ctx.createGain();
  const osc = (type, f) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; return o; };
  const filt = (type, f, Q = 0.7) => { const x = ctx.createBiquadFilter(); x.type = type; x.frequency.value = f; x.Q.value = Q; return x; };
  const env = (node, t, a, peak, d) => { node.gain.setValueAtTime(0, t); node.gain.linearRampToValueAtTime(peak, t + a); node.gain.exponentialRampToValueAtTime(0.0008, t + a + d); };
  const noiseHit = (t, f, Q, type, peak, d, off = 0, send = 0) => {
    const s = ctx.createBufferSource(), fl = filt(type, f, Q), a = g();
    s.buffer = E.noise; env(a, t, 0.001, peak, d);
    s.connect(fl).connect(a).connect(E.in); s.start(t, off); s.stop(t + d + 0.05);
    if (send) { const w = g(); w.gain.value = send; a.connect(w).connect(E.send); }
  };
  return { g, osc, filt, env, noiseHit, at };
}
const KICK = [135, 46, 0.11];
const kick = (K, E, at, peak, d) => {
  const o = K.osc('sine', KICK[0]), a = K.g();
  o.frequency.setValueAtTime(KICK[0], at); o.frequency.exponentialRampToValueAtTime(KICK[1], at + KICK[2]);
  K.env(a, at, 0.002, peak, d); o.connect(a).connect(E.in); o.start(at); o.stop(at + d + 0.08);
};
const SWING = 0.56;
export const SCORE = { CHORDS, ROOTS, LINE, KICK, SWING };
function voiceA(E, T, step, at) {
  const bar = Math.floor(step / 16), q = step % 16, b = T.barInfo(bar), beat = Math.floor(q / 4), sp = 60 / BPM / 4;
  if ((b.vac > 0 && beat >= 4 - b.vac) || (b.vac < 0 && beat < -b.vac)) return;
  const { ctx } = E, K = kit(E, at), h = hash(step), off = (step % 97) / 97 * 0.8;
  const t = at + (q % 2 ? (SWING - 0.5) * 2 * sp : 0);
  if (q === 0) {
    const s = ctx.createBufferSource(), f = K.filt('highpass', 900, 0.5), a = K.g();
    s.buffer = E.dust; a.gain.value = 0.05 * (1.2 - 0.4 * Math.min(1, b.hat));
    s.connect(f).connect(a).connect(E.in); s.start(at, (bar * 0.37) % 1.4); s.stop(at + sp * 16);
  }
  if (b.kick && q % 4 === 0) kick(K, E, at, 0.9, 0.36);
  if (b.hat > 0 && q % 4 === 2) K.noiseHit(t, 8200, 0.7, 'bandpass', 0.2 * b.hat * (0.9 + 0.2 * h), 0.15, off);
  else if (b.hat > 0.3 && q % 2 === 0) K.noiseHit(t, 7000, 0.7, 'highpass', 0.06 * b.hat * (0.85 + 0.3 * h), 0.03, off);
  else if (b.hat > 0.7 && q % 2) K.noiseHit(t, 9000, 0.7, 'highpass', 0.03 * b.hat * (0.6 + 0.8 * h), 0.02, off);
  const rollOn = b.roll && (q % (4 / b.roll) === 0);
  if (b.clap && (q === 4 || q === 12) && !b.roll) {
    K.noiseHit(at, 1250, 1, 'bandpass', 0.2, 0.09, off, 0.15); K.noiseHit(at + 0.011, 1350, 1, 'bandpass', 0.17, 0.14, off, 0.15);
  } else if (rollOn) K.noiseHit(at, 1500, 1.2, 'bandpass', 0.16 + 0.09 * b.roll, 0.12, off);
  if (b.bass && [2, 6, 10, 14, 11].includes(q)) {
    const n = ROOTS[bar % 4] + (q === 11 ? 12 : 0), a = K.g(), f = K.filt('lowpass', 210 + 260 * b.bass, 2), s = K.osc('sine', midi(n)), w = K.osc('sawtooth', midi(n)), ws = K.g();
    ws.gain.value = 0.35; w.connect(ws).connect(f); s.connect(f);
    K.env(a, t, 0.005, 0.3 * b.bass, sp * 1.7); f.connect(a).connect(E.in);
    for (const o of [s, w]) { o.start(t); o.stop(t + sp * 2.2); }
  }
  if (b.stab && (q === 3 || q === 10 || (bar % 2 && q === 14))) {
    const a = K.g(), f = K.filt('lowpass', 2400, 1.1), end = t + 0.36, w = K.g();
    f.frequency.setValueAtTime(2400 + 500 * h, t); f.frequency.exponentialRampToValueAtTime(650, t + 0.24);
    K.env(a, t, 0.005, 0.034 * b.stab, 0.3); f.connect(a).connect(E.in); w.gain.value = 0.55; a.connect(w).connect(E.send);
    for (const n of CHORDS[bar % 4]) for (const det of [-9, 7]) { const o = K.osc('sawtooth', midi(n)); o.detune.value = det; o.connect(f); o.start(t); o.stop(end); }
  }
  if (b.pad && q === 0) {
    const a = K.g(), f = K.filt('lowpass', 420 + 1100 * b.pad, 0.8), end = at + sp * 16;
    a.gain.setValueAtTime(0, at); a.gain.linearRampToValueAtTime(0.04 * b.pad, at + sp * 4); a.gain.linearRampToValueAtTime(0, end);
    f.connect(a).connect(E.in);
    for (const n of CHORDS[bar % 4]) for (const det of [-6, 6]) { const o = K.osc('sawtooth', midi(n)); o.detune.value = det; o.connect(f); o.start(at); o.stop(end + 0.05); }
  }
  if (b.riser && q === 0) {
    const s = ctx.createBufferSource(); s.buffer = E.noise; s.loop = true;
    const f = K.filt('bandpass', 400, 2), a = K.g(), end = at + sp * 16;
    f.frequency.setValueAtTime(300 + 4000 * b.riser, at); f.frequency.exponentialRampToValueAtTime(600 + 6000 * b.riser, end);
    a.gain.setValueAtTime(0.02 + 0.07 * b.riser, at); a.gain.linearRampToValueAtTime(0.03 + 0.1 * b.riser, end);
    s.connect(f).connect(a).connect(E.in); s.start(at); s.stop(end);
  }
}
function voiceB(E, T, step, at) {
  const bar = Math.floor(step / 16), q = step % 16, b = T.barInfo(bar), beat = Math.floor(q / 4), sp = 60 / BPM / 4;
  if ((b.vac > 0 && beat >= 4 - b.vac) || (b.vac < 0 && beat < -b.vac)) return;
  const K = kit(E, at), h = hash(step + 7919), off = (step % 89) / 89 * 0.8;
  if (b.kick && q % 4 === 0) { kick(K, E, at, 0.95, 0.24); K.noiseHit(at, 3500, 0.7, 'highpass', 0.06, 0.004, off); }
  if (b.hat > 0 && q % 4 === 2) K.noiseHit(at, 8500, 0.7, 'highpass', 0.12 * b.hat, 0.08, off);
  else if (b.hat > 0.5 || (b.hat > 0 && q % 2 === 0)) K.noiseHit(at, 10000, 0.7, 'highpass', [0.06, 0.03, 0, 0.04][q % 4] * b.hat * (0.92 + 0.16 * h), 0.022, off);
  if (b.perc && [3, 6, 9, 13].includes(q)) {
    const n = q === 6 ? 55 : q === 13 ? 52 : 57, o = K.osc('sine', midi(n)), a = K.g();
    o.frequency.setValueAtTime(midi(n), at); o.frequency.exponentialRampToValueAtTime(midi(n) * 0.85, at + 0.1);
    K.env(a, at, 0.002, 0.11 * b.perc, 0.11); o.connect(a).connect(E.in); const w = K.g(); w.gain.value = 0.25; a.connect(w).connect(E.send);
    o.start(at); o.stop(at + 0.16);
  }
  if (b.perc && q === 12 && bar % 2) K.noiseHit(at, 2400, 3, 'bandpass', 0.11 * b.perc, 0.035, off, 0.35);
  if (b.bass && [2, 7, 10, 15].includes(q)) {
    const n = 33 + (q === 15 ? 12 : 0), s = K.osc('sine', midi(n)), w = K.osc('triangle', midi(n)), f = K.filt('lowpass', 300, 1), a = K.g();
    s.connect(f); w.connect(f); K.env(a, at, 0.004, 0.24 * b.bass, sp * 1.3); f.connect(a).connect(E.in);
    for (const o of [s, w]) { o.start(at); o.stop(at + sp * 1.8); }
  }
  const n = LINE[step % LINE.length];
  if (b.seq && n != null) {
    const o = K.osc('square', midi(n)), o2 = K.osc('triangle', midi(n + 12)), f = K.filt('lowpass', 300 + 2600 * b.cut * b.seq, 5), a = K.g(), dry = K.g(), wet = K.g();
    const o2g = K.g(); o2g.gain.value = 0.5; o2.connect(o2g).connect(f); o.connect(f);
    K.env(a, at, 0.003, 0.05 * b.seq * (0.85 + 0.3 * h), 0.2); f.connect(a);
    dry.gain.value = 1 - 0.6 * b.rec; wet.gain.value = 0.3 + 0.6 * b.rec;
    a.connect(dry).connect(E.in); a.connect(wet).connect(E.send);
    for (const x of [o, o2]) { x.start(at); x.stop(at + 0.3); }
  }
  if (b.drone && q === 0 && bar % 2 === 0) {
    const a = K.g(), f = K.filt('lowpass', 900, 0.7), end = at + sp * 32, w = K.g();
    a.gain.setValueAtTime(0, at); a.gain.linearRampToValueAtTime(0.03 * b.drone, at + sp * 12); a.gain.linearRampToValueAtTime(0, end);
    f.connect(a).connect(E.in); w.gain.value = 0.4; a.connect(w).connect(E.send);
    for (const m of [45, 52, 59, 60]) for (const type of ['sine', 'triangle']) { const o = K.osc(type, midi(m)); o.detune.value = type === 'sine' ? -4 : 4; o.connect(f); o.start(at); o.stop(end + 0.05); }
  }
}
const VOICES = [voiceA, voiceB];

function makeBus(ctx, dest, i) {
  const G = (v = 1) => { const x = ctx.createGain(); x.gain.value = v; return x; };
  const F = (type, f, Q = 0.7) => { const x = ctx.createBiquadFilter(); x.type = type; x.frequency.value = f; x.Q.value = Q; return x; };
  const input = G(), send = G(), shelf = F('lowshelf', EQ.lowHz), mid = F('peaking', EQ.midHz, EQ.midQ), hi = F('highshelf', EQ.highHz), hp = F('highpass', FILT_OPEN[0], 0.9), lp = F('lowpass', FILT_OPEN[1], 0.9);
  const fader = G(), xfg = G(), out = G(0), rec = G(), tone = F('lowpass', i ? 16000 : 8500, 0.5);
  shelf.gain.value = 0; mid.gain.value = 0; hi.gain.value = 0;
  let head = input;
  if (!i) {
    const sat = ctx.createWaveShaper(), k = 0.8, c = new Float32Array(1025);
    for (let n = 0; n < c.length; n++) { const x = (n / 512) - 1; c[n] = Math.tanh(k * x) / k; }
    sat.curve = c; sat.oversample = 'none'; head = input.connect(sat);
  }
  head.connect(tone).connect(shelf).connect(mid).connect(hi).connect(hp).connect(lp).connect(fader).connect(xfg).connect(out).connect(dest);
  const dl = ctx.createDelay(2), fbF = F('lowpass', i ? 2000 : 1600, 0.5), fb = G(i ? 0.52 : 0.4), wet = G(i ? 0.6 : 0.45);
  dl.delayTime.value = (3 * 60) / BPM / 4;
  send.connect(dl); dl.connect(fbF).connect(fb).connect(dl); dl.connect(wet).connect(shelf);
  rec.connect(shelf);
  return { input, send, shelf, mid, hi, hp, lp, fader, xfg, out, rec, eq: [shelf, mid, hi] };
}
function buffers(ctx) {
  const n = ctx.sampleRate, noise = ctx.createBuffer(1, n, n), d = noise.getChannelData(0);
  let s = 22222; for (let i = 0; i < n; i++) { s = (s * 16807) % 2147483647; d[i] = (s / 2147483647) * 2 - 1; }
  const dust = ctx.createBuffer(1, 2 * n, n), u = dust.getChannelData(0);
  let r = 4242; const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < u.length; i++) u[i] = (rnd() * 2 - 1) * 0.02;
  for (let k = 0; k < 18; k++) { const at = Math.floor(rnd() * (u.length - 200)), amp = (0.2 + 0.8 * rnd() ** 2) * (rnd() < 0.5 ? -1 : 1); for (let j = 0; j < 120; j++) u[at + j] += amp * Math.exp(-j / 18); }
  return { noise, dust };
}

const hold = (p, at) => { if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(at); else { const v = p.value; p.cancelScheduledValues(at); p.setValueAtTime(v, at); } };
export function makeEngine(ctx, dest) {
  const { noise, dust } = buffers(ctx);
  const decks = TRACKS.map((T, i) => { const bus = makeBus(ctx, dest, i); return { T, i, bus, E: { ctx, in: bus.input, send: bus.send, noise, dust }, anchor: 0, next: 0, on: false, end: Infinity, downbeat: null,
    buf: null, lead: 0, src: null, fileStep: Infinity, mix: null }; });
  const sp = 60 / BPM / 4;
  const fileAt = (d, when) => {
    const s = ctx.createBufferSource(), g = ctx.createGain();
    s.buffer = d.buf; g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(1, when + 0.004);
    s.connect(g).connect(d.bus.rec); s.start(when, Math.max(0, REC.pre + d.lead + when - d.anchor)); d.src = { s, g, when };
  };
  const cut = (d, at) => { if (!d.src) return; const { s, g } = d.src; hold(g.gain, at); g.gain.linearRampToValueAtTime(0, at + 0.01); s.stop(at + 0.02); d.src = null; };
  return {
    ctx, decks,
    useFile(i, buf, lead = 0) { const d = decks[i]; d.buf = buf; d.lead = lead; if (!buf) { cut(d, ctx.currentTime); d.fileStep = Infinity; } },
    move(i, anchor, next) {
      const d = decks[i]; d.anchor = anchor; if (next != null) d.next = next;
      if (d.src) { const now = ctx.currentTime; cut(d, now); fileAt(d, Math.max(now + 0.01, anchor)); }
    },
    source: (i) => (decks[i].src && ctx.currentTime >= decks[i].src.when ? 'file' : 'synth'),
    start(i, anchor, from, at = ctx.currentTime) {
      const d = decks[i]; d.anchor = anchor; d.next = Math.ceil(from * 4 - 1e-6); d.on = true; d.end = Infinity;
      d.bus.out.gain.cancelScheduledValues(at); d.bus.out.gain.setTargetAtTime(LEVEL, at, 0.05);
      cut(d, at); d.fileStep = Infinity;
      if (d.buf) { d.fileStep = d.next; fileAt(d, Math.max(at, anchor + from * 4 * sp)); }
    },
    stop(i, at = ctx.currentTime) {
      const d = decks[i]; d.on = false; d.bus.out.gain.cancelScheduledValues(at); d.bus.out.gain.setTargetAtTime(0, at, 0.04);
      cut(d, at + 0.25); d.fileStep = Infinity;
    },
    schedule(until) {
      for (const d of decks) {
        if (!d.on) continue;
        if (d.buf && !d.src && d.fileStep === Infinity) {
          const s = Math.ceil(d.next / 16) * 16;
          if (s < d.T.BARS * 16) { d.fileStep = s; fileAt(d, d.anchor + s * sp); }
        }
        while (d.anchor + d.next * sp < until && d.next < d.T.BARS * 16) {
          const at = d.anchor + d.next * sp;
          if (at >= ctx.currentTime - 1e-4 && at < d.end) {
            if (d.next < d.fileStep) VOICES[d.i](d.E, d.T, d.next, at);
            if (d.next % 16 === 0) {
              d.downbeat = at; const m = decks.find((x) => x.mix)?.mix, ts = m && m.t0 + m.sw * 4 * sp;
              if (m && Math.abs(at - ts) < 8 * sp) (m.db ??= [null, null])[d.i] = +((at - ts) * 1000).toFixed(3);
            }
          }
          d.next++;
        }
      }
    },
    xf(x, at = ctx.currentTime) { gains(x).forEach((v, i) => { const p = decks[i].bus.xfg.gain; hold(p, at); p.setTargetAtTime(v, at, 0.03); }); },
    mix(m) {
      const now = ctx.currentTime, b0 = Math.max(m.bc, (now - m.t0) / (4 * sp));
      const knots = [b0];
      for (let b = Math.ceil(b0 * 8 + 1e-6) / 8; b < m.end + 1e-6; b += 0.125) if (b < m.swA || b > m.swB) knots.push(b);
      for (let b = m.swA; b <= m.swB + 1e-9; b += 1 / 64) if (b > b0) knots.push(b);
      knots.sort((x, y) => x - y);
      const at = (b) => Math.max(now, m.t0 + b * 4 * sp);
      const params = [];
      for (const [k, i] of [[0, m.from], [1, m.to]]) {
        params.push([decks[i].bus.fader.gain, (r) => r.ch[k] ** 2]);
        for (const band of [0, 1, 2]) params.push([decks[i].bus.eq[band].gain, (r) => knobDb(r.eq[k][band])]);
      }
      const rs = knots.map((b) => mixAt(m, b));
      for (const [p, f] of params) {
        hold(p, now); p.setValueAtTime(f(rs[0]), now);
        knots.forEach((b, n) => { if (n && at(b) > now) p.linearRampToValueAtTime(f(rs[n]), at(b)); });
      }
      decks[m.to].mix = m;
    },
    glide(g) {
      const now = ctx.currentTime, d = decks[g.i]?.bus, left = g.delay + g.dur - g.t;
      const ps = g.what === 'xf' ? [0, 1].map((k) => [decks[k].bus.xfg.gain, (v) => gains(v)[k]]) : g.what === 'ch' ? [[d.fader.gain, (v) => v * v]]
        : [0, 1, 2].map((k) => [d.eq[k].gain, (v) => knobDb(v[k])]);
      for (const [p, f] of ps) {
        hold(p, now); p.setValueAtTime(f(glideAt(g, g.t)), now);
        for (let t = 0.02; t < left + 0.02; t += 0.02) p.linearRampToValueAtTime(f(glideAt(g, g.t + Math.min(t, left))), now + Math.min(t, left));
      }
    },
    unmix() { const now = ctx.currentTime; for (const d of decks) { for (const p of [d.bus.xfg, d.bus.fader, ...d.bus.eq]) hold(p.gain, now); d.mix = null; } },
    strip(i, { ch, eq, filt }) {
      const b = decks[i].bus, t = ctx.currentTime, [fhp, flp] = filterHz(filt);
      if (ch != null) { hold(b.fader.gain, t); b.fader.gain.setTargetAtTime(ch ** 2, t, 0.03); }
      if (eq) b.eq.forEach((f, k) => { hold(f.gain, t); f.gain.setTargetAtTime(knobDb(eq[k]), t, 0.03); });
      b.hp.frequency.setTargetAtTime(fhp, t, 0.02); b.lp.frequency.setTargetAtTime(flp, t, 0.02);
    },
  };
}

export async function renderDecks({ sec = 75, sr = 48000, deck = 0, from = 0, mix = false, at = 20, limiter = true, file = false } = {}) {
  const ctx = new OfflineAudioContext(2, Math.floor(sec * sr), sr), spb = 60 / BPM;
  let dest;
  if (limiter) { const m = masterChain(ctx); m.fade.gain.value = MASTER; dest = m.fade; }
  else { dest = ctx.createGain(); dest.gain.value = MASTER; dest.connect(ctx.destination); }
  const e = makeEngine(ctx, dest), log = [];
  for (const d of e.decks) d.bus.out.gain.value = 0;
  if (file) for (const i of [0, 1]) { const b = await ctx.decodeAudioData(await (await fetch(recUrl(i))).arrayBuffer()); e.useFile(i, b, leadOf(b)); }
  if (!mix) {
    e.start(deck, -from * spb, from, 0); gains(deck).forEach((v, i) => { e.decks[i].bus.xfg.gain.value = v; });
  } else {
    e.start(0, -from * spb, from, 0); gains(0.5).forEach((v, i) => { e.decks[i].bus.xfg.gain.value = v; });
    const pl = mixPlan(1, 0, from + at / spb), t0 = (pl.inB - from) * spb, t1 = t0 + pl.end * spb, m = { ...pl, k0: [0, 0, 0], f1: 1, e0: [0, 0, 0], f0: 1, from: 0, to: 1, t0 };
    e.start(1, t0, 0, t0 - 0.2); e.mix(m); e.decks[0].end = t1;
    e.decks[0].bus.out.gain.setTargetAtTime(0, t1, 0.04);
    const sec_ = (k) => k * spb, tidy = (what, from_, to_, [d, n]) => ({ what, from: from_, to: to_, delay: sec_(d), dur: sec_(n) });
    const end = mixAt(m, pl.end), gk = tidy('eq', end.eq[0], [0, 0, 0], TIDY.knobs), gf = tidy('ch', end.ch[0], 1, TIDY.fader), tEnd = t1 + gf.delay + gf.dur;
    const track = [];
    for (let t = t0 + pl.bc * spb; t <= tEnd + 1e-9; t += 0.01) {
      const b = (t - t0) / spb;
      if (b <= pl.end) { const r = mixAt(m, b); track.push([t, b, r.ch[0], r.ch[1], ...r.eq[0], ...r.eq[1]]); }
      else track.push([t, b, glideAt(gf, t - t1), 1, ...glideAt(gk, t - t1), 0, 0, 0]);
    }
    log.push({ click: t0 + pl.bc * spb, in: t0, faderUp: t0 + 4 * pl.fb * spb, hi: t0 + 2 * pl.fb * spb, hiFull: t0 + 4 * pl.hiEnd * spb, op: t0 + 4 * pl.hiEnd * spb, opEnd: t0 + (pl.ms - MIX.crossBeats / 2 - 0.5) * spb,
      ms: t0 + pl.ms * spb, sw: t0 + pl.sw * spb, ride: t0 + (pl.sw + 4) * spb, done: t1, reset: tEnd, barA: pl.inB / 4, swBars: pl.sw / 4, plan: pl, track });
  }
  e.schedule(sec);
  const buf = await ctx.startRendering();
  buf.log = log;
  return buf;
}

const LOOK = 0.25;
export const LEVEL = 0.65;
const LIFT = 0.0012;
const CAP = [0.018, 0.010, 0.011];
const CANVAS = [512, 576];
const DRAW_HZ = 15;
const FILT_OPEN = [12, 22000];
const FILT_ANGLE = 2.36;
export const filterHz = (f) => [f > 0 ? FILT_OPEN[0] * (6000 / FILT_OPEN[0]) ** f : FILT_OPEN[0], f < 0 ? FILT_OPEN[1] * (180 / FILT_OPEN[1]) ** -f : FILT_OPEN[1]];

const STYLE = `.deck-keys { position: fixed; left: 50%; transform: translateX(-50%); bottom: 64px; font: 12px/1.3 inherit; color: var(--muted, #b9ab98);
  background: rgba(20, 17, 15, .6); border-radius: 8px; padding: 6px 10px; pointer-events: none; transition: opacity .3s; }
.deck-keys[hidden] { display: none; } .gate .deck-keys { display: none; }`;

export default function mount(live) {
  const { THREE, scene, byName, params, camera } = live;
  const dk = byName('pr_xdj'), mx = byName('pr_djm450');
  const D = dk?.userData, M = mx?.userData;
  if (!D?.xdj_screen_center || !M?.djm450_xf_center) return null;
  dk.updateMatrixWorld(true); mx.updateMatrixWorld(true);
  const META = [C.deck, C.deck_b ?? C.deck];
  const V = (a) => new THREE.Vector3(...a);
  const wDk = (v) => V(v).applyMatrix4(dk.matrixWorld), wMx = (v) => V(v).applyMatrix4(mx.matrixWorld);
  const axisOf = (node, a) => V(a).transformDirection(node.matrixWorld);
  const ex = axisOf(dk, [1, 0, 0]), ez = axisOf(dk, [0, 0, 1]), ey = axisOf(dk, [0, 1, 0]);
  const mxX = axisOf(mx, [1, 0, 0]), mxZ = axisOf(mx, [0, 0, 1]);

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
    quad(c, ex.clone().multiplyScalar(sw / 2), ez.clone().multiplyScalar(-sh / 2), i, 0, i ? 0 : 0.5, 1, i ? 0.5 : 1);
  });
  const box = (c, a, b, k) => {
    const h = ey.clone().multiplyScalar(CAP[2] / 2), cc = c.clone().add(h);
    quad(cc.clone().add(h), a, b, k);
    quad(cc.clone().add(b), a, h, k, 0, 0, 0, 0); quad(cc.clone().sub(b), a, h, k, 0, 0, 0, 0);
    quad(cc.clone().add(a), b, h, k, 0, 0, 0, 0); quad(cc.clone().sub(a), b, h, k, 0, 0, 0, 0);
  };
  const top = M.djm450_top_z;
  const chC = M.djm450_ch_centers.map((p) => wMx(p)), xfC = wMx(M.djm450_xf_center), lowC = M.djm450_low_knobs.map((p) => wMx(p));
  chC.forEach((c, i) => box(c, mxX.clone().multiplyScalar(CAP[0] / 2), mxZ.clone().multiplyScalar(CAP[1] / 2), 2 + i));
  box(xfC, mxX.clone().multiplyScalar(CAP[1] / 2), mxZ.clone().multiplyScalar(CAP[0] / 2), 4);
  const kr = M.djm450_knob_r;
  lowC.forEach((c, i) => quad(c.clone().addScaledVector(ey, 0.0152), mxX.clone().multiplyScalar(kr * 1.3), mxZ.clone().multiplyScalar(kr * 1.3), 5 + i));
  const fr = M.djm450_filter_r ?? kr, filtC = (M.djm450_filter_knobs ?? []).map((p) => wMx(p));
  filtC.forEach((c, i) => quad(c.clone().addScaledVector(ey, 0.0141), mxX.clone().multiplyScalar(fr * 0.72), mxZ.clone().multiplyScalar(fr * 0.72), 7 + i));
  const jc = D.xdj_jog_center, JD = 0.0228;
  const jogC = D.xdj_deck_x.map((dx) => wDk([jc[0] + dx, jc[1] + 0.0009, jc[2]]));
  jogC.forEach((c, i) => quad(c, ex.clone().multiplyScalar(JD), ez.clone().multiplyScalar(JD), 9 + i));
  const EQ_TOP = 0.0131, eqC = M.djm450_low_knobs.map((p) => [0, 1, 2].map((band) => [p[0], p[1], p[2] - 0.025 * band]));
  eqC.forEach((ch, i) => ch.forEach((p, band) => quad(wMx(p).addScaledVector(ey, EQ_TOP), mxX.clone().multiplyScalar(kr * 0.95), mxZ.clone().multiplyScalar(kr * 0.95), 11 + 3 * i + band)));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('aKind', new THREE.Float32BufferAttribute(kind, 1));

  const canvas = document.createElement('canvas');
  [canvas.width, canvas.height] = CANVAS;
  const g2 = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;
  const U = { uTex: { value: tex }, uOff: { value: [0, 0, 0, 0, 0, 0, 0] }, uCh: { value: new THREE.Vector3() }, uXf: { value: new THREE.Vector3() },
    uChAxis: { value: mxZ.clone().multiplyScalar(-1) }, uXfAxis: { value: mxX.clone() }, uKr: { value: kr }, uLow: { value: new THREE.Vector2() },
    uKnobX: { value: mxX.clone() }, uKnobZ: { value: mxZ.clone() }, uLit: { value: 0.75 }, uFilt: { value: new THREE.Vector2() }, uJog: { value: new THREE.Vector2() },
    uEq: { value: [0, 0, 0, 0, 0, 0] } };
  const mat = new THREE.ShaderMaterial({ uniforms: U, side: THREE.DoubleSide, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
    vertexShader: `attribute float aKind; uniform float uOff[7]; uniform vec3 uChAxis, uXfAxis; varying vec2 vUv; varying float vK;
      void main() { vUv = uv; vK = aKind; vec3 p = position; int k = int(aKind + 0.5);
        if (k == 2 || k == 3) p += uChAxis * uOff[k]; if (k == 4) p += uXfAxis * uOff[4];
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0); }`,
    fragmentShader: `uniform sampler2D uTex; uniform vec2 uLow, uFilt, uJog; uniform float uLit, uEq[6]; varying vec2 vUv; varying float vK;
      // a pale line from r0 to r1 (uv: 0.5 = the rim) at angle a, clockwise from the back (-v), 0 elsewhere
      float hand(float a, float r0, float r1, float w) { vec2 p = vUv - 0.5, d = vec2(sin(a), -cos(a)); float t = dot(p, d);
        return step(r0, t) * step(t, r1) * (1.0 - smoothstep(w * 0.6, w, abs(p.x * d.y - p.y * d.x))); }
      void main() { int k = int(vK + 0.5);
        if (k <= 1) { gl_FragColor = vec4(texture2D(uTex, vUv).rgb * uLit, 1.0); return; }
        // v34 step 3: a long-throw cap, satin black with a pale line across its middle (the crossfader's runs along its travel's normal)
        if (k <= 4) { float e = step(0.84, max(abs(vUv.x - 0.5), abs(vUv.y - 0.5)) * 2.0), l = 1.0 - smoothstep(0.05, 0.08, abs((k == 4 ? vUv.x : vUv.y) - 0.5));
          gl_FragColor = vec4(mix(mix(vec3(0.11, 0.11, 0.115), vec3(0.04), e), vec3(0.58, 0.57, 0.55), l) * uLit, 1.0); return; }
        if (k == 7 || k == 8) { float a = hand(k == 7 ? uFilt.x : uFilt.y, 0.08, 0.47, 0.05); gl_FragColor = vec4(vec3(0.82, 0.81, 0.78) * uLit, a); return; }
        if (k >= 11) { float r = length(vUv - 0.5) * 2.0, a = hand(uEq[k - 11], 0.105, 0.44, 0.035);
          gl_FragColor = vec4(mix(vec3(0.27, 0.27, 0.285), vec3(0.78, 0.77, 0.75), a) * uLit, 1.0 - smoothstep(0.9, 1.0, r)); return; }
        if (k >= 9) { float a = hand(k == 9 ? uJog.x : uJog.y, 0.27, 0.41, 0.05); gl_FragColor = vec4(vec3(1.0, 0.62, 0.3) * 0.55 * uLit, a); return; }
        // a low knob's mark: an amber ring at the knob's rim while it cuts
        float r = length(vUv - 0.5) * 2.0, on = k == 5 ? uLow.x : uLow.y;
        float ring = smoothstep(0.62, 0.7, r) * (1.0 - smoothstep(0.86, 0.94, r));
        gl_FragColor = vec4(vec3(1.0, 0.58, 0.2) * uLit, ring * on); }`,
  });
  const mesh = noPick(new THREE.Mesh(geo, mat));
  mesh.name = 'deck_overlay';
  mesh.frustumCulled = false;
  scene.add(mesh);

  const reduce = () => live.reduceMotion.matches;
  const S = { xf: 0, ch: [1, 1], low: [false, false], eq: [[0, 0, 0], [0, 0, 0]], lowK: [1, 1], midK: [1, 1], hiK: [1, 1], filt: [0, 0], jog: [0, 0], d: [0, 1].map(() => ({ playing: false, t: 0, tin: 0 })), fade: null };
  let glides = [];
  const gliding = (i, what) => glides.some((g) => g.i === i && g.what === what);
  const getV = (i, what) => (what === 'xf' ? S.xf : what === 'ch' ? S.ch[i] : [...S.eq[i]]);
  const putV = (i, what, v) => { if (what === 'xf') S.xf = v; else if (what === 'ch') S.ch[i] = v; else S.eq[i] = v; };
  function glide(i, what, target, [d, n]) {
    glides = glides.filter((g) => !(g.i === i && g.what === what));
    const from = getV(i, what);
    if (Array.isArray(from) ? from.every((v, k) => Math.abs(v - target[k]) < 1e-9) : Math.abs(from - target) < 1e-9) return;
    const g = { i, what, from, to: target, delay: d * SPB, dur: n * SPB, t: 0 };
    glides.push(g);
    if (eng && live_on) eng.glide(g);
  }
  function stepGlides(dt) {
    if (!glides.length) return false;
    for (const g of glides) { g.t += dt; putV(g.i, g.what, glideAt(g, g.t)); }
    glides = glides.filter((g) => g.t < g.delay + g.dur);
    keepAll(); controls(); return true;
  }
  const JOG_REV = 1.8;
  const SPB = 60 / BPM;
  let ctx = null, eng = null, live_on = false, drawT = 0, cost = 0, frames = 0, lastMix = null;
  const beatOf = (i) => (S.d[i].t * BPM) / 60;
  const any = () => S.d[0].playing || S.d[1].playing;
  const heard = (i) => S.d[i].playing && S.d[i].t >= S.d[i].tin - 1e-6;
  const weights = () => { const g = gains(S.xf); return [0, 1].map((i) => (heard(i) ? S.ch[i] ** 2 * g[i] : 0)); };
  function parts() {
    const w = weights(), sum = w[0] + w[1], on = [0, 1].filter((i) => heard(i));
    if (!on.length) { const i = S.d[1].playing && !S.d[0].playing ? 1 : 0; return [{ i, beat: Math.max(0, beatOf(i)), w: 1, low: S.lowK[i] }]; }
    return on.map((i) => ({ i, beat: beatOf(i), w: sum > 1e-6 ? w[i] / sum : 1 / on.length, low: S.lowK[i], raw: w[i] })).sort((a, b) => b.w - a.w);
  }
  function lowHeard() {
    const w = weights(), m = Math.max(w[0], w[1]);
    return m > 1e-6 ? Math.min(1, (w[0] * S.lowK[0] + w[1] * S.lowK[1]) / m) : Math.min(S.lowK[0], S.lowK[1]);
  }
  function mixed() {
    const P = parts(), f = TRACKS[P[0].i].features(P[0].beat, P[0].low);
    if (P.length > 1) {
      const g = TRACKS[P[1].i].features(P[1].beat, P[1].low), a = P[0].w, b = P[1].w;
      const by = (K) => { const x = P.map((p) => p.raw * S[K][p.i]), t = x[0] + x[1]; return t > 1e-6 ? [x[0] / t, x[1] / t] : [a, b]; };
      for (const [k, K] of [['fade', 'midK'], ['sparkle', 'hiK']]) { const [u, v] = by(K); f[k] = u * f[k] + v * g[k]; }
      const e = P.map((p) => p.raw * p.low), d = Math.max(e[0] + e[1], P[0].raw, P[1].raw);
      f.energy = d > 1e-6 ? (e[0] * TRACKS[P[0].i].features(P[0].beat).energy + e[1] * TRACKS[P[1].i].features(P[1].beat).energy) / d : 0;
      f.low = lowHeard();
    }
    return f;
  }
  const keepAll = () => { for (const i of [0, 1]) { [S.lowK[i], S.midK[i], S.hiK[i]] = S.eq[i].map(keepOf); S.low[i] = S.eq[i][0] <= -0.5; } };
  live.show = { get playing() { return any(); }, get beat() { return parts()[0].beat; }, get xf() { return 0.5; },
    get ch() { const w = weights(), g = Math.min(1, w[0] + w[1]); return [g, g]; }, get low() { return lowHeard(); },
    stop: () => stopAll(), parts, features: mixed, sections: (i) => TRACKS[i].SECTIONS };

  function soundOn() { return !live.gate && !!window.__room?.layers?.audio?.info?.().on; }
  let own = false;
  function audioUp() {
    if (eng) return ctx;
    const shared = window.__room?.layers?.audio?.trackInput?.();
    let dest;
    if (shared) { ctx = shared.ctx; dest = shared.input; }
    else {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC({ latencyHint: 'playback' }); dest = ctx.destination; own = true;
    }
    eng = makeEngine(ctx, dest);
    return ctx;
  }
  const running = () => eng && live_on && ctx.state === 'running';
  const rec = [0, 1].map(() => ({ state: 'none', bytes: null, ms: 0, lead: 0, timer: 0 }));
  const SYNTH_ONLY = matchMedia('(pointer: coarse)').matches && !new URLSearchParams(location.search).has('records');
  function load(i) {
    const r = rec[i];
    if (r.state !== 'none' || !eng) return;
    if (SYNTH_ONLY) { r.state = 'synth'; return; }
    r.state = 'loading'; const t0 = performance.now();
    (r.bytes ? Promise.resolve(r.bytes) : fetch(recUrl(i)).then((res) => { if (!res.ok) throw new Error(res.status); return res.arrayBuffer(); }))
      .then((b) => { r.bytes = b; return ctx.decodeAudioData(b.slice(0)); })
      .then((buf) => { r.state = 'ready'; r.ms = Math.round(performance.now() - t0); r.lead = leadOf(buf); eng.useFile(i, buf, r.lead); })
      .catch(() => { r.state = 'failed'; });
  }
  function release(i) {
    clearTimeout(rec[i].timer);
    rec[i].timer = setTimeout(() => { if (!S.d[i].playing && rec[i].state === 'ready') { eng.useFile(i, null); rec[i].state = 'none'; } }, 30000);
  }
  function mixAudio() {
    if (!eng) return;
    for (const i of [0, 1]) eng.strip(i, { ch: S.fade || gliding(i, 'ch') ? null : S.ch[i], eq: S.fade || gliding(i, 'eq') ? null : S.eq[i], filt: S.filt[i] });
    if (!S.fade && !gliding(-1, 'xf')) eng.xf(S.xf);
  }
  function rampAudio() { const m = S.fade.m; m.t0 = eng.decks[m.to].anchor + S.d[m.to].tin; eng.mix(m); }
  function syncAudio() {
    const want = any() && soundOn();
    if (want) {
      if (!audioUp()) return;
      if (ctx.state !== 'running') ctx.resume().catch(() => {});
      if (!live_on) {
        live_on = true;
        const now = ctx.currentTime + 0.05;
        for (const i of [0, 1]) if (S.d[i].playing) eng.start(i, now - S.d[i].t, Math.max(S.d[i].t, S.d[i].tin) / SPB);
        mixAudio(); if (S.fade) rampAudio();
        for (const g of glides) eng.glide(g);
      }
      for (const i of [0, 1]) if (S.d[i].playing) load(i);
    } else if (live_on) {
      live_on = false;
      for (const i of [0, 1]) eng.stop(i);
      if (own) setTimeout(() => { if (!live_on && ctx.state === 'running') ctx.suspend().catch(() => {}); }, 300);
    }
  }

  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;
  function drawDeck(i) {
    const [w] = CANVAS, y = i * (CANVAS[1] / 2), ink = '#ecd6ba', mute = '#968068', amber = '#e69646';
    const T = TRACKS[i], d = S.d[i], { title, artist, tag } = META[i];
    const F = (px, bold = false) => `${bold ? '700 ' : ''}${px}px ${FACES.narrow}`;
    g2.font = F(38, true); g2.fillStyle = ink; g2.fillText(title, 16, y + 12, w - 140);
    g2.font = F(24); g2.fillStyle = mute; g2.fillText(artist, 16, y + 54, w - 250);
    g2.font = F(38, true); g2.fillStyle = ink; g2.fillText(BPM.toFixed(1), w - 110, y + 12);
    g2.font = F(24); g2.fillStyle = mute; g2.fillText('BPM', w - 110, y + 54);
    g2.fillText(`-${fmt(T.LENGTH - Math.max(0, d.t))}`, w - 110, y + 84);
    g2.fillStyle = '#e3a35b'; g2.fillText(tag, w - 230, y + 54);
    const B = Math.max(0, beatOf(i)), f = T.features(B, S.lowK[i]), wait = d.playing && d.t < d.tin;
    const fd = S.fade && (S.fade.to === i || S.fade.from === i), cutTxt = S.low[i] ? '  LOW CUT' : '';
    g2.fillStyle = wait ? amber : d.playing ? '#9fd27a' : amber;
    g2.fillText(wait ? `SYNC  in ${Math.ceil(((d.tin - d.t) * BPM) / 60)}${cutTxt}` : d.playing ? `PLAY  ${f.bar + 1}.${Math.floor(f.beat % 4) + 1}  ${f.kind.toUpperCase()}${fd ? '  MIX' : ''}${cutTxt}` : 'CUE', 16, y + 84, w - 140);
    const y0 = y + 124, y1 = y + 222, mid = (y0 + y1) / 2, beats = 8;
    for (let x = 0; x < w; x += 2) {
      const bt = B + ((x - w / 2) / w) * 2 * beats;
      if (bt < 0 || bt >= T.BARS * 4) continue;
      const k = Math.floor(bt), ph = bt - k, kick = T.LOW[k] > 0.3 ? Math.exp(-ph * 6) : 0;
      const lo = (0.5 * kick + 0.25 * T.LOW[k]) * S.lowK[i], hi = T.HAT[k] * (0.4 + 0.6 * Math.abs(Math.sin(ph * Math.PI * 4))) * 0.35 * S.hiK[i], pad = T.PAD[k] * 0.3 * S.midK[i];
      g2.fillStyle = '#b8642a'; g2.fillRect(x, mid - lo * 48, 2, lo * 96);
      g2.fillStyle = '#f0c8a0'; g2.fillRect(x, mid - pad * 48, 2, pad * 96);
      g2.fillStyle = '#fff4e6'; g2.fillRect(x, mid - hi * 48, 2, hi * 96);
    }
    g2.fillStyle = amber; g2.fillRect(w / 2 - 1, y0 - 4, 3, y1 - y0 + 8);
    const o0 = y + 238, o1 = y + 278;
    for (let x = 16; x < w - 16; x++) {
      const k = Math.floor(((x - 16) / (w - 32)) * T.BARS * 4), e = T.LOW[k] * 0.7 + T.PAD[k] * 0.2 + T.HAT[k] * 0.1;
      g2.fillStyle = k < B ? '#5a3a24' : '#c87837'; g2.fillRect(x, (o0 + o1) / 2 - e * 18, 1, e * 36 + 1);
    }
    g2.fillStyle = ink; g2.fillRect(16 + (B / (T.BARS * 4)) * (w - 32), o0 - 2, 2, o1 - o0 + 4);
  }
  function draw() {
    g2.fillStyle = '#100b08'; g2.fillRect(0, 0, CANVAS[0], CANVAS[1]);
    g2.textBaseline = 'top';
    drawDeck(0); drawDeck(1);
    tex.needsUpdate = true;
  }
  function controls() {
    U.uOff.value[2] = (S.ch[0] - 0.5) * M.djm450_ch_len;
    U.uOff.value[3] = (S.ch[1] - 0.5) * M.djm450_ch_len;
    U.uOff.value[4] = (S.xf - 0.5) * M.djm450_xf_len;
    U.uLow.value.set(S.low[0] ? 1 : 0, S.low[1] ? 1 : 0);
    S.eq.forEach((e, i) => e.forEach((k, band) => { U.uEq.value[3 * i + band] = k * EQ.angle; }));
    U.uFilt.value.set(S.filt[0] * FILT_ANGLE, S.filt[1] * FILT_ANGLE);
    U.uJog.value.set(S.jog[0] + (S.d[0].t / JOG_REV) * 2 * Math.PI, S.jog[1] + (S.d[1].t / JOG_REV) * 2 * Math.PI);
  }
  draw(); controls();

  function endMix() { S.fade = null; if (eng && live_on) eng.unmix(); }
  function play(v = true, i = 0) {
    const d = S.d[i], o = 1 - i;
    if (!v) {
      if (!d.playing) return false;
      d.playing = false; d.t = Math.max(0, d.t);
      if (eng && live_on) eng.stop(i);
      release(i);
      if (S.fade) {
        const { f0, from } = S.fade.m; endMix();
        const w = S.d[o];
        if (from === i && w.playing && w.t < w.tin - 1e-6) { w.t = w.tin; if (eng && live_on) eng.start(o, ctx.currentTime + 0.05 - w.t, w.t / SPB); }
        for (const k of [0, 1]) { glide(k, 'eq', [0, 0, 0], TIDY.stop); glide(k, 'ch', k === from ? f0 : 1, TIDY.stop); }
        mixAudio();
      }
      status(any() ? `Deck ${o + 1} playing ${META[o].title}` : `Stopped ${META[i].title} at ${fmt(d.t)}`);
      emit(); return false;
    }
    if (d.playing) return true;
    clearTimeout(rec[i].timer);
    if (d.t >= TRACKS[i].LENGTH - 0.05) d.t = 0;
    if (heard(o)) {
      const bm = beatOf(o), cueBar = Math.floor(Math.max(0, beatOf(i)) / 4), cue = 4 * cueBar * SPB, pl = mixPlan(i, cueBar, bm);
      d.tin = cue; d.t = cue - (pl.inB - bm) * SPB;
      glides = glides.filter((g) => g.what === 'xf');
      S.fade = { from: o, to: i, m: { ...pl, k0: [...S.eq[i]], f1: S.ch[i], e0: [...S.eq[o]], f0: S.ch[o], from: o, to: i, t0: 0, db: null } }; lastMix = S.fade.m;
      glide(-1, 'xf', 0.5, TIDY.stop);
      d.playing = true;
      if (eng && live_on) { const anchor = eng.decks[o].anchor + pl.inB * SPB - cue; eng.start(i, anchor, cue / SPB); rampAudio(); }
      status(`Deck ${i + 1} mixing in from its bar ${cueBar + 1} over ${pl.L} bars: mids and highs cross after ${pl.X}, the lows swap on its bar ${pl.sIn + 1}`);
    } else {
      if (S.fade) endMix();
      d.tin = d.t; d.playing = true; glide(-1, 'xf', 0.5, TIDY.stop); glide(i, 'ch', 1, TIDY.stop);
      if (eng && live_on) { eng.start(i, ctx.currentTime + 0.05 - d.t, d.t / SPB); mixAudio(); }
      status(`Deck ${i + 1} playing ${META[i].title}, synthesised at ${BPM} BPM; the facades opposite play with it`);
    }
    controls(); syncAudio(); emit();
    return true;
  }
  function stopAll() { for (const i of [0, 1]) play(false, i); return false; }
  function toggle(i) {
    if (i == null) return any() ? stopAll() : play(true, 0);
    return play(!S.d[i].playing, i);
  }
  function emit() { draw(); live.render(); dispatchEvent(new CustomEvent('room:deck', { detail: { playing: any() } })); }
  function set(k, v) {
    if (glides.length && k !== 'f1' && k !== 'f2') { for (const g of glides) putV(g.i, g.what, Array.isArray(g.to) ? [...g.to] : g.to); glides = []; if (eng && live_on) eng.unmix(); }
    if (k === 'xf') S.xf = Math.min(1, Math.max(0, v));
    else if (k === 'ch1' || k === 'ch2') S.ch[k === 'ch1' ? 0 : 1] = Math.min(1, Math.max(0, v));
    else if (k === 'low') S.eq.forEach((e) => { e[0] = v ? -1 : 0; });
    else if (k === 'low1' || k === 'low2') S.eq[k === 'low1' ? 0 : 1][0] = v ? -1 : 0;
    else if (/^(mid|hi)[12]$/.test(k)) S.eq[+k.at(-1) - 1][k.startsWith('mid') ? 1 : 2] = Math.min(1, Math.max(-1, v));
    else if (k === 'f1' || k === 'f2') S.filt[k === 'f1' ? 0 : 1] = Math.min(1, Math.max(-1, Math.abs(v) < 0.04 ? 0 : v));
    if (S.fade && k !== 'f1' && k !== 'f2') endMix();
    keepAll();
    controls(); mixAudio(); live.render();
  }
  const live_ = document.querySelector('[role="status"]');
  const status = (s) => { if (live_ && !live.gate) live_.textContent = s; };

  let lastHit = null, deckHit = 0;
  const nearestDeck = (x) => (Math.abs(x - D.xdj_deck_x[0]) <= Math.abs(x - D.xdj_deck_x[1]) ? 0 : 1);
  live.picks.push({ object: dk, accept: (p) => { const l = dk.worldToLocal(p.clone()); deckHit = nearestDeck(l.x); return l.y > D.xdj_top - 0.02; }, onPick: () => toggle(deckHit) });
  live.picks.push({ object: mx, accept: (p) => { lastHit = mx.worldToLocal(p.clone()); return !!control(lastHit); }, onPick: () => { const c = control(lastHit); if (c) c(); } });
  function control(l) {
    if (!l || l.y < top - 0.006) return null;
    const near = (c, ax, len) => Math.abs(l.x - c[0]) < (ax === 'x' ? len / 2 + 0.01 : 0.014) && Math.abs(l.z - c[2]) < (ax === 'z' ? len / 2 + 0.01 : 0.014);
    const xf = M.djm450_xf_center, L = M.djm450_xf_len;
    if (near(xf, 'x', L)) return () => set('xf', (l.x - xf[0]) / L + 0.5);
    for (let i = 0; i < 2; i++) {
      const c = M.djm450_ch_centers[i];
      if (near(c, 'z', M.djm450_ch_len)) return () => set(`ch${i + 1}`, 0.5 - (l.z - c[2]) / M.djm450_ch_len);
      const band = eqC[i].findIndex((k) => Math.hypot(l.x - k[0], l.z - k[2]) < M.djm450_knob_r * 1.4);
      if (band === 0) return () => set(`low${i + 1}`, !S.low[i]);
      if (band > 0) return () => set(`${band === 1 ? 'mid' : 'hi'}${i + 1}`, S.eq[i][band] <= -1 + 1e-6 ? 0 : -1);
    }
    return null;
  }
  if (!live.gate) {
    const style = document.createElement('style'); style.textContent = STYLE; document.head.appendChild(style);
    addEventListener('keydown', (ev) => {
      if (live.view() !== 'decks' || ev.defaultPrevented || ev.target?.closest?.('input, textarea, [contenteditable]')) return;
      if (ev.code === 'Space') { ev.preventDefault(); toggle(); } else if (ev.code === 'Digit1') toggle(0); else if (ev.code === 'Digit2') toggle(1);
      else if (ev.code === 'BracketLeft') set('xf', S.xf - 0.1);
      else if (ev.code === 'BracketRight') set('xf', S.xf + 0.1); else if (ev.code === 'KeyL') set('low', !(S.low[0] || S.low[1]));
    });
  }
  const JOG_S = 0.12;
  const targets = () => [
    ...filtC.map((c, i) => ({ kind: 'f', i, c, r: fr * 1.35 })),
    ...jogC.map((c, i) => ({ kind: 'jog', i, c, r: D.xdj_jog_r })),
  ];
  function grabAt(cx, cy) {
    if (live.view() !== 'decks' || live.moving?.()) return null;
    const r = live.renderer.domElement.getBoundingClientRect();
    const px = (p) => { const q = p.clone().project(camera); return [r.left + ((q.x + 1) / 2) * r.width, r.top + ((1 - q.y) / 2) * r.height]; };
    for (const t of targets()) {
      const [x, y] = px(t.c), [x1, y1] = px(t.c.clone().addScaledVector(ex, t.r));
      if (Math.hypot(cx - x, cy - y) < Math.hypot(x1 - x, y1 - y)) return { ...t, x, y };
    }
    return null;
  }
  function turn(g, d) {
    if (g.kind === 'f') { set(`f${g.i + 1}`, S.filt[g.i] + d); return; }
    S.jog[g.i] += d;
    const s = S.d[g.i];
    if (s.playing && s.t >= s.tin) {
      s.t = Math.min(TRACKS[g.i].LENGTH - 0.1, Math.max(0, s.t + d * JOG_S));
      if (running()) eng.move(g.i, ctx.currentTime - s.t);
    }
    controls(); live.render();
  }
  if (!live.gate) {
    const canvas_ = live.renderer.domElement;
    let held = null;
    addEventListener('pointerdown', (ev) => {
      if (ev.pointerType !== 'mouse' || ev.button !== 0 || ev.target !== canvas_) return;
      const g = grabAt(ev.clientX, ev.clientY);
      if (!g) return;
      ev.stopImmediatePropagation(); ev.preventDefault();
      held = { ...g, id: ev.pointerId, lastY: ev.clientY, lastA: Math.atan2(ev.clientX - g.x, g.y - ev.clientY) };
      canvas_.style.cursor = g.kind === 'f' ? 'ns-resize' : 'grabbing';
    }, true);
    addEventListener('pointermove', (ev) => {
      if (!held || ev.pointerId !== held.id) return;
      ev.stopImmediatePropagation();
      if (held.kind === 'f') { turn(held, (held.lastY - ev.clientY) / 160); held.lastY = ev.clientY; return; }
      const a = Math.atan2(ev.clientX - held.x, held.y - ev.clientY);
      let d = a - held.lastA;
      d -= Math.round(d / (2 * Math.PI)) * 2 * Math.PI;
      held.lastA = a;
      turn(held, d);
    }, true);
    const drop = (ev) => { if (!held || ev.pointerId !== held.id) return; ev.stopImmediatePropagation(); held = null; canvas_.style.cursor = ''; };
    addEventListener('pointerup', drop, true);
    addEventListener('pointercancel', drop, true);
    addEventListener('wheel', (ev) => {
      if (ev.target !== canvas_) return;
      const g = grabAt(ev.clientX, ev.clientY);
      if (!g) return;
      ev.stopImmediatePropagation(); ev.preventDefault();
      turn(g, g.kind === 'f' ? -Math.sign(ev.deltaY) * 0.08 : -Math.sign(ev.deltaY) * 0.25);
    }, { capture: true, passive: false });
  }
  if (params.has('deck') && !live.gate) play(true, params.get('deck') === '2' ? 1 : 0);
  live.deckStep = (h) => { if (any() || glides.length) timed(h); };

  function step(dt) {
    syncAudio();
    const gl = stepGlides(dt);
    if (!any()) { if (gl) draw(); return gl; }
    const audio = running();
    for (const i of [0, 1]) {
      const d = S.d[i];
      if (!d.playing) continue;
      if (audio) d.t = ctx.currentTime - eng.decks[i].anchor;
      else d.t += dt;
      if (d.t >= TRACKS[i].LENGTH) { d.t = TRACKS[i].LENGTH; play(false, i); d.t = 0; }
    }
    const f = S.fade;
    if (f) {
      const b = (S.d[f.to].t - S.d[f.to].tin) / SPB, r = mixAt(f.m, b), ends = [f.from, f.to];
      ends.forEach((i, k) => { S.ch[i] = r.ch[k]; S.eq[i] = r.eq[k]; [S.lowK[i], S.midK[i], S.hiK[i]] = r.keep[k]; S.low[i] = r.eq[k][0] <= -0.5; });
      if (b >= f.m.end) {
        const o = f.from; endMix(); play(false, o); S.d[o].t = 0; S.d[o].tin = 0;
        glide(o, 'eq', [0, 0, 0], TIDY.knobs); glide(o, 'ch', f.m.f0, TIDY.fader); keepAll(); mixAudio();
      }
      controls();
    }
    if (!any()) { draw(); return true; }
    if (audio) eng.schedule(ctx.currentTime + LOOK);
    U.uJog.value.set(S.jog[0] + (S.d[0].t / JOG_REV) * 2 * Math.PI, S.jog[1] + (S.d[1].t / JOG_REV) * 2 * Math.PI);
    drawT += dt;
    if (drawT >= 1 / DRAW_HZ && (!reduce() || drawT >= 1)) { drawT = 0; draw(); }
    return true;
  }
  function timed(dt) { const t0 = performance.now(), r = step(dt); cost += performance.now() - t0; frames++; return r; }

  let backWas = null;
  function backPill(view = live.view()) {
    const el = document.querySelector('.back');
    if (!el || live.gate) return;
    backWas ??= el.innerHTML;
    el.innerHTML = view === 'decks' && any() ? 'Back to the room · the track keeps playing<span class="esc"> · Esc</span>' : backWas;
  }
  addEventListener('room:deck', () => backPill());

  const fold = (x, n) => ((((x % n) + 1.5 * n) % n) - n / 2);
  function phase() {
    const bar = 4 * SPB, both = heard(0) && heard(1);
    const clock = both ? +(fold(S.d[1].t - S.d[0].t, bar) * 1000).toFixed(3) : null;
    const db = eng?.decks.map((d) => d.downbeat);
    const audio = both && db?.[0] != null && db?.[1] != null ? +(fold(db[1] - db[0], bar) * 1000).toFixed(3) : null;
    return { clock, audio, db: db?.map((v) => v && +v.toFixed(4)), src: eng?.decks.map((d) => d.src && +d.src.when.toFixed(4)), anchor: eng?.decks.map((d) => +d.anchor.toFixed(4)) };
  }
  const seek = (beat, i = 0) => {
    const d = S.d[i]; d.t = Math.max(0, beat * SPB); d.tin = Math.min(d.tin, d.t);
    if (running() && d.playing) eng.move(i, ctx.currentTime + 0.05 - d.t, Math.ceil(beat * 4));
    draw(); live.render(); return d.t;
  };

  return {
    name: 'deck',
    onView: (id) => backPill(id),
    update(dt) { return live.gate ? false : timed(dt); },
    api: {
      play: (v, i = 0) => play(v ?? true, i), stop: (i) => (i == null ? stopAll() : play(false, i)), toggle, set, seek,
      advance(sec, h = 1 / 60) { let s = Math.round(sec / h); while (s-- > 0) timed(h); live.render(); return +S.d[0].t.toFixed(3); },
      features: (beat, i) => (beat == null && i == null ? mixed() : TRACKS[i ?? 0].features(beat ?? beatOf(i ?? 0), S.lowK[i ?? 0])),
      screen(what) {
        const pp = D.xdj_play_pos, p = what.startsWith('deck') ? wDk(pp ? [pp[0] + D.xdj_deck_x[+what[4]], D.xdj_top, pp[2]] : [D.xdj_deck_x[+what[4]], D.xdj_top, D.xdj_jog_center[2]])
          : what === 'xf' ? xfC.clone().addScaledVector(mxX, (S.xf - 0.5) * M.djm450_xf_len) : what.startsWith('ch') ? chC[+what[2] - 1].clone()
          : wMx(eqC[+what.at(-1) - 1][what.startsWith('low') ? 0 : what.startsWith('mid') ? 1 : 2]).addScaledVector(ey, EQ_TOP);
        const q = p.project(camera), r = live.renderer.domElement.getBoundingClientRect();
        return q.z > 1 ? null : [r.left + ((q.x + 1) / 2) * r.width, r.top + ((1 - q.y) / 2) * r.height];
      },
      recCheck(i, bars) {
        const d = eng?.decks[i]; if (!d?.buf) return null;
        const b = d.buf, x = b.getChannelData(0), y = b.getChannelData(b.numberOfChannels > 1 ? 1 : 0), sr = b.sampleRate, a = 1 - Math.exp((-2 * Math.PI * 150) / sr), out = [];
        for (const bar of bars) {
          const bi = TRACKS[i].barInfo(bar); if (!bi.kick || bi.vac < 0) continue;
          const t = REC.pre + d.lead + bar * 4 * SPB, i0 = Math.floor((t - 0.04) * sr), n = Math.floor(0.12 * sr), e = new Float32Array(n);
          let s = 0, m = 0, k = 0;
          for (let j = 0; j < n; j++) { s += a * ((x[i0 + j] + y[i0 + j]) / 2 - s); e[j] = Math.abs(s); m = Math.max(m, e[j]); }
          while (k < n && e[k] < 0.5 * m) k++;
          out.push(+(((i0 + k) / sr - t) * 1000).toFixed(2));
        }
        return out;
      },
      grabAt: (x, y) => { const g = grabAt(x, y); return g && { kind: g.kind, i: g.i, x: g.x, y: g.y }; },
      cost() { const r = { ms: frames ? +(cost / frames).toFixed(4) : 0, frames }; cost = 0; frames = 0; return r; },
      info: () => ({ playing: any(), t: +S.d[0].t.toFixed(2), beat: +beatOf(0).toFixed(2), bpm: BPM, length: +A.LENGTH.toFixed(1), title: META[0].title, artist: META[0].artist,
        decks: S.d.map((d, i) => ({ playing: d.playing, heard: heard(i), waiting: d.playing && d.t < d.tin, t: +d.t.toFixed(3), tin: +d.tin.toFixed(3), beat: +beatOf(i).toFixed(3),
          title: META[i].title, length: +TRACKS[i].LENGTH.toFixed(1), sounding: !!eng?.decks[i].on && ctx?.state === 'running',
          source: eng ? eng.source(i) : 'synth', rec: { state: rec[i].state, ms: rec[i].ms, lead: +(rec[i].lead * 1000).toFixed(3), bytes: rec[i].bytes?.byteLength ?? 0 } })),
        fade: S.fade && { from: S.fade.from, to: S.fade.to, ...S.fade.m, bars: S.fade.m.end / 4, swBars: S.fade.m.sw / 4,
          at: +((S.d[S.fade.to].t - S.d[S.fade.to].tin) / SPB).toFixed(3) },
        glides: glides.map((g) => `${g.i}${g.what}`), weights: weights().map((w) => +w.toFixed(4)), phaseMs: phase(), lowHeard: +lowHeard().toFixed(4), lowK: [...S.lowK],
        lowDb: eng ? eng.decks.map((d) => +d.bus.shelf.gain.value.toFixed(2)) : null, xfg: eng ? eng.decks.map((d) => +d.bus.xfg.gain.value.toFixed(4)) : null,
        eq: S.eq.map((e) => e.map((k) => +k.toFixed(4))), eqDb: S.eq.map((e) => e.map((k) => +knobDb(k).toFixed(2))),
        eqLive: eng ? eng.decks.map((d) => d.bus.eq.map((f) => +f.gain.value.toFixed(2))) : null, faderG: eng ? eng.decks.map((d) => +d.bus.fader.gain.value.toFixed(4)) : null,
        keep: [0, 1].map((i) => [S.lowK[i], S.midK[i], S.hiK[i]].map((v) => +v.toFixed(4))),
        lastMix,
        xf: S.xf, ch: [...S.ch], low: S.low[0] || S.low[1], lows: [...S.low], filter: [...S.filt], filterHz: eng ? [eng.decks[0].bus.hp.frequency.value, eng.decks[0].bus.lp.frequency.value] : null,
        audio: ctx?.state ?? 'none', sounding: live_on && ctx?.state === 'running' }),
    },
  };
}
