import { rng, seedFrom } from './layer-common.js';

const STORE_KEY = 'room.sound';
export const MASTER = 0.6;
const FADE_IN = 0.9, FADE_OUT = 0.35;
const GLASS = 0.35;
const DUCK = 0.4;
const AMB = {
  level: 0.8,
  bed: {
    window: { file: 'rain-window', level: 0.16, spread: 0.3 },
    outside: { file: 'rain-outside', level: 0.07, spread: 0.55, shelf: -10 },
    seg: [16, 30], xf: 5,
    drift: [7, 18], range: 5,
    shelf: -8,
    lull: { gap: [45, 120], len: [18, 45], depth: 0.25 },
  },
  voice: { gap: [8, 34], first: 6, space: 0.2, rest: 240 },
  voices: [
    { file: 'gutter', w: 2, level: 0.42, lp: 1500, pan: [0.35, 0.55], dur: [7, 16] },
    { file: 'coot', w: 1.6, level: 0.26, lp: 2000, pan: [-0.45, 0.45], rate: [0.94, 1.04] },
    { file: 'creak', w: 1.2, level: 0.32, lp: 2000, pan: [-0.25, 0.25], rate: [0.5, 0.7] },
    { file: 'gull', w: 1.4, level: 0.13, lp: 2200, pan: [-0.5, 0.5], dur: [3.5, 7], rate: [0.95, 1.03] },
    { file: 'bell', w: 0.4, level: 0.17, lp: 1100, pan: [-0.3, 0.3], dur: [8, 14.9] },
    { file: 'thunder', w: 0.4, level: 0.45, lp: 450, pan: [-0.2, 0.2], dur: [9, 15] },
    { file: 'blackbird', w: 1.0, level: 0.17, lp: 4500, pan: [-0.35, 0.35], after: 200 },
  ],
  pan: 0.35,
};
const BOAT = { fire: 36, level: 0.12, ref: 8, lpNear: 220, lpFar: 110, procS: 20, procGap: [70, 200] };
const CLICK = { level: 1.2, hp: 1800, ms: 6, tau: 0.0007 };
const C_SOUND = 343;

const TAU = 2 * Math.PI;
const rnd = (rand, [a, b]) => a + (b - a) * rand();
const FADE_UP = Float32Array.from({ length: 64 }, (_, i) => Math.sin(i / 63 * Math.PI / 2));
const FADE_DOWN = FADE_UP.slice().reverse();
export const AUDIO_FILES = [...new Set([AMB.bed.window.file, AMB.bed.outside.file, ...AMB.voices.map((v) => v.file)])];
export const audioUrl = (file) => new URL(`audio/${file}.mp3`, import.meta.url).href;
export const loadAudio = (ctx, file) => fetch(audioUrl(file))
  .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`${file} ${r.status}`)))).then((b) => ctx.decodeAudioData(b));

export function ambience(ctx, out, rand, load, { voices: withVoices = true } = {}) {
  const sr = ctx.sampleRate, A = AMB, B = A.bed, V = A.voice;
  const filt = (type, f, q = 0.707, g = 0) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; b.gain.value = g; return b; };
  const gain = (v) => { const x = ctx.createGain(); x.gain.value = v; return x; };
  const panAt = (v) => { const p = ctx.createStereoPanner(); p.pan.value = v; return p; };
  const sum = gain(1), level = gain(A.level), duck = gain(1), bedPan = ctx.createStereoPanner(), voices = gain(1);
  sum.connect(level).connect(duck).connect(out);
  bedPan.connect(filt('highshelf', 3000, 0.707, B.shelf)).connect(sum);
  voices.connect(sum);
  const bufs = {};
  const ready = Promise.all(AUDIO_FILES.map((f) => load(f).then((b) => { bufs[f] = b; }, () => {})));

  const space = ctx.createConvolver(), ir = ctx.createBuffer(2, Math.floor(sr * 1.8), sr);
  for (let c = 0; c < 2; c++) { const ch = ir.getChannelData(c), k = 1 - Math.exp(-TAU * 2500 / sr); let y = 0;
    for (let i = 0; i < ch.length; i++) { y += k * ((rand() * 2 - 1) - y); ch[i] = y * Math.exp(-i / (sr * 0.45)) * Math.min(1, i / (sr * 0.012)); } }
  space.buffer = ir;
  const spaceIn = gain(V.space);
  spaceIn.connect(space).connect(sum);

  const beds = ['window', 'outside'].map((k) => {
    const c = B[k], g = gain(c.level), head = c.shelf ? filt('highshelf', 2000, 0.707, c.shelf) : gain(1);
    head.connect(g).connect(bedPan);
    const chains = [-c.spread, c.spread].map((p) => { const pn = panAt(p); pn.connect(head); return { pn, next: 0 }; });
    return { c, g, chains, db: 0 };
  });
  function excerpt(bed, ch, t) {
    const buf = bufs[bed.c.file], len = Math.min(rnd(rand, B.seg), buf.duration - 0.1), off = rand() * (buf.duration - len);
    const s = ctx.createBufferSource(), g = gain(0);
    s.buffer = buf;
    s.connect(g).connect(ch.pn);
    g.gain.setValueCurveAtTime(FADE_UP, t, B.xf);
    g.gain.setValueAtTime(1, t + B.xf);
    g.gain.setValueCurveAtTime(FADE_DOWN, t + len - B.xf, B.xf);
    s.start(t, off, len);
    return t + len - B.xf;
  }
  let nextDrift = 0, nextLull = rnd(rand, B.lull.gap), lullEnd = -1;
  function weather(t) {
    const lull = t < lullEnd;
    for (const b of beds) {
      b.db = Math.max(-B.range, Math.min(B.range, b.db + (rand() * 2 - 1) * B.range * 0.7));
      b.g.gain.setTargetAtTime(b.c.level * 10 ** (b.db / 20) * (lull ? B.lull.depth : 1), t, lull ? 3 : 4);
    }
  }

  const heard = {};
  let nextVoice = V.first, last = null, ducked = false, played = 0;
  const log = [];
  function voice(t) {
    const pool = A.voices.filter((v) => bufs[v.file] && v !== last && !(v.after > t));
    if (!pool.length) return t + 5;
    const w = (x) => x.w * Math.min(1, 0.05 + (t - (heard[x.file] ?? -1e9)) / V.rest);
    let r = rand() * pool.reduce((a, x) => a + w(x), 0), v = pool[0];
    for (const x of pool) { r -= w(x); if (r <= 0) { v = x; break; } }
    const buf = bufs[v.file], rate = v.rate ? rnd(rand, v.rate) : 1;
    const len = v.dur ? Math.min(rnd(rand, v.dur), buf.duration / rate) : buf.duration / rate;
    const off = v.dur ? rand() * (buf.duration - len * rate) : 0, fade = v.dur ? Math.min(1.5, len / 4) : 0;
    const s = ctx.createBufferSource(), g = gain(v.level), lp = filt('lowpass', v.lp), p = panAt(rnd(rand, v.pan));
    s.buffer = buf; s.playbackRate.value = rate;
    s.connect(lp).connect(g).connect(p);
    p.connect(voices); p.connect(spaceIn);
    if (fade) {
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v.level, t + fade);
      g.gain.setValueAtTime(v.level, t + len - fade); g.gain.linearRampToValueAtTime(0, t + len);
    }
    s.start(t, off, len * rate);
    last = v; played++; heard[v.file] = t;
    log.push([+t.toFixed(1), v.file]);
    return t + len + rnd(rand, V.gap);
  }

  function schedule(t0, t1) {
    if (!bufs[B.window.file] && !bufs[B.outside.file]) return;
    for (const b of beds) for (const ch of b.chains) {
      if (!bufs[b.c.file]) continue;
      if (ch.next < t0) ch.next = t0 + 0.1;
      while (ch.next < t1) ch.next = excerpt(b, ch, ch.next);
    }
    for (;;) {
      const t = Math.min(nextDrift, nextLull, lullEnd > 0 ? lullEnd : Infinity);
      if (t >= t1) break;
      const at = Math.max(t, t0);
      if (t === nextLull) { lullEnd = at + rnd(rand, B.lull.len); nextLull = lullEnd + rnd(rand, B.lull.gap); weather(at); }
      else if (t === lullEnd) { lullEnd = -1; weather(at); }
      else { weather(at); nextDrift = at + rnd(rand, B.drift); }
    }
    if (nextVoice < t0) nextVoice = t0 + rnd(rand, V.gap) / 2;
    while (withVoices && nextVoice < t1) nextVoice = ducked ? nextVoice + 5 : voice(nextVoice);
  }
  return {
    out: duck, schedule, ready, info: () => ({ loaded: Object.keys(bufs).length, of: AUDIO_FILES.length, voices: played, log: log.slice(-8) }),
    log,
    duck(on, t = ctx.currentTime) { ducked = on; duck.gain.cancelScheduledValues(t); duck.gain.setTargetAtTime(on ? DUCK : 1, t, 0.33); },
    pan(v, t = ctx.currentTime) { bedPan.pan.setTargetAtTime(Math.max(-1, Math.min(1, v)) * A.pan, t, 0.3); },
  };
}

export function masterChain(ctx) {
  const fade = ctx.createGain(), lim = ctx.createDynamicsCompressor(), trim = ctx.createGain();
  fade.gain.value = 0;
  lim.threshold.value = -3; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.08;
  trim.gain.value = 0.8;
  fade.connect(lim).connect(trim).connect(ctx.destination);
  return { fade, lim, out: trim };
}

export async function renderAmbience(sec = 20, seed = 505, sr = 48000, opts = {}) {
  const ctx = new OfflineAudioContext(2, Math.floor(sec * sr), sr), rand = rng(seed);
  const m = masterChain(ctx);
  m.fade.gain.value = MASTER;
  const a = ambience(ctx, m.fade, rand, (f) => loadAudio(ctx, f), opts);
  await a.ready;
  a.schedule(0, sec);
  const buf = await ctx.startRendering();
  buf.voices = a.log;
  return buf;
}

export default function mount(live) {
  const { THREE, byName, camera } = live;
  const rand = rng(seedFrom(live.params, 505));
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;

  const world = (name, local) => {
    const o = byName(name);
    if (!o) return null;
    o.updateMatrixWorld(true);
    return local ? o.localToWorld(new THREE.Vector3(...local)) : o.getWorldPosition(new THREE.Vector3());
  };
  const night = byName('cz_canal_night')?.userData;
  const panes = [];
  if (night?.rain_panes) {
    for (let k = 0; k < night.rain_panes.length; k += 5) {
      const [cx, cy, cz, w, h] = night.rain_panes.slice(k, k + 5);
      panes.push({ p: world('cz_canal_night', [cx, cy, cz]), w, h });
    }
  }
  const camPos = camera.getWorldPosition(new THREE.Vector3());
  if (!panes.length) {
    for (const sx of [-1, 1]) panes.push({ p: new THREE.Vector3(sx * 1.2, 1.9, camPos.z - 4), w: 1.4, h: 2.4 });
  }
  const winC = panes.reduce((a, q) => a.add(q.p), new THREE.Vector3()).divideScalar(panes.length);
  const gd = byName('geiger')?.userData;
  const geigerPos = world('geiger', gd?.geiger_grille ?? null);
  const boatNode = byName('cz_boat');

  let ctx = null, g = null, on = false, wanted = false;
  const button = setupButton();

  function noiseBuffer(sec) {
    const n = Math.floor(ctx.sampleRate * sec), buf = ctx.createBuffer(1, n, ctx.sampleRate), ch = buf.getChannelData(0);
    let br = 0;
    for (let i = 0; i < n; i++) { br = (br + 0.02 * (rand() * 2 - 1)) / 1.02; ch[i] = br * 3.5; }
    const f = Math.floor(ctx.sampleRate * 0.05);
    for (let i = 0; i < f; i++) { const k = Math.sqrt(i / f); ch[i] = ch[i] * k + ch[n - f + i] * Math.sqrt(1 - k * k); }
    return buf;
  }
  function loop(buf, rate = 1) {
    const s = ctx.createBufferSource();
    s.buffer = buf; s.loop = true; s.playbackRate.value = rate;
    s.loopStart = 0; s.loopEnd = buf.duration - 0.05;
    s.start(0, rand() * buf.duration * 0.9);
    return s;
  }
  function panner(pos, ref, rolloff = 1) {
    const p = ctx.createPanner();
    p.panningModel = 'equalpower';
    p.distanceModel = 'inverse'; p.refDistance = ref; p.rolloffFactor = rolloff; p.maxDistance = 10000;
    setPos(p, pos);
    return p;
  }
  function setPos(p, v) {
    if (p.positionX) { p.positionX.value = v.x; p.positionY.value = v.y; p.positionZ.value = v.z; }
    else p.setPosition(v.x, v.y, v.z);
  }
  const filt = (type, f, q = 0.707) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
  const gain = (v) => { const n = ctx.createGain(); n.gain.value = v; return n; };

  let buildMs = 0, loadMs = 0;
  function build() {
    const t0 = performance.now();
    ctx = new AC({ latencyHint: 'playback' });
    const m = masterChain(ctx), analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    m.out.connect(analyser);
    const master = gain(1);
    master.connect(m.fade);
    const outside = gain(GLASS);
    outside.connect(master);
    const meter = (node) => { const a = ctx.createAnalyser(); a.fftSize = 2048; node.connect(a); return a; };
    const amb = ambience(ctx, master, rand, (f) => loadAudio(ctx, f));
    amb.ready.then(() => { loadMs = Math.round(performance.now() - t0); });
    const track = gain(1);
    track.connect(master);
    const saw = ctx.createOscillator(); saw.type = 'sawtooth'; saw.frequency.value = BOAT.fire;
    const sub = ctx.createOscillator(); sub.type = 'sine'; sub.frequency.value = BOAT.fire / 2;
    const chug = ctx.createOscillator(); chug.type = 'sine'; chug.frequency.value = BOAT.fire / 4;
    const chugDepth = gain(0.35), body = gain(0.65);
    chug.connect(chugDepth).connect(body.gain);
    const burble = loop(noiseBuffer(2.3));
    const boatLp = filt('lowpass', BOAT.lpFar, 0.9);
    saw.connect(gain(0.5)).connect(body); sub.connect(gain(0.8)).connect(body);
    burble.connect(filt('bandpass', 90, 0.8)).connect(gain(1.2)).connect(body);
    const boatLevel = gain(0);
    const boatPan = panner(winC.clone().add(new THREE.Vector3(60, -6, -20)), BOAT.ref, 1);
    body.connect(boatLp).connect(boatLevel).connect(boatPan).connect(outside);
    for (const o of [saw, sub, chug]) o.start();

    const geigerPan = geigerPos ? panner(geigerPos, 0.6, 1) : null;
    geigerPan?.connect(master);

    const meters = { rain: meter(amb.out), outside: meter(outside), track: meter(track), ...(geigerPan ? { geiger: meter(geigerPan) } : {}) };
    g = { fade: m.fade, lim: m.lim, analyser, master, meters, amb, track, saw, sub, chug, burble, boatLp, boatLevel, boatPan, geigerPan,
      lastBoat: null, procBoat: null, procAt: ctx.currentTime + 15 + rand() * 30, counts: null, clicks: 0, ducked: false,
      buf: new Float32Array(analyser.fftSize) };
    buildMs = performance.now() - t0;
  }

  function playClick(when) {
    if (!g.geigerPan) return;
    const n = Math.floor(ctx.sampleRate * CLICK.ms / 1000), b = ctx.createBuffer(1, n, ctx.sampleRate), ch = b.getChannelData(0);
    for (let i = 0; i < n; i++) ch[i] = (rand() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * CLICK.tau));
    const s = ctx.createBufferSource();
    s.buffer = b;
    s.connect(filt('highpass', CLICK.hp)).connect(gain(CLICK.level)).connect(g.geigerPan);
    s.start(when);
    g.clicks++;
  }

  function setSound(next, remember = true) {
    wanted = next;
    if (remember) { try { localStorage.setItem(STORE_KEY, next ? 'on' : 'off'); } catch {   } }
    button.setAttribute('aria-pressed', String(next));
    if (next && !ctx) build();
    if (!ctx) return Promise.resolve();
    const now = ctx.currentTime, m = g.fade.gain;
    m.cancelScheduledValues(now); m.setValueAtTime(m.value, now);
    if (next && !document.hidden) {
      return ctx.resume().then(() => {
        if (!wanted || ctx.state !== 'running') return;
        on = true;
        duck();
        const t = ctx.currentTime; m.cancelScheduledValues(t); m.setValueAtTime(m.value, t); m.linearRampToValueAtTime(MASTER, t + FADE_IN);
      }).catch(() => {});
    }
    on = false;
    g.counts = null;
    m.linearRampToValueAtTime(0, now + FADE_OUT);
    return new Promise((r) => setTimeout(r, FADE_OUT * 1000 + 30)).then(() => { if (!on) return ctx.suspend(); }).catch(() => {});
  }
  function duck() { const d = !!live.show?.playing && on; if (g && d !== g.ducked) { g.ducked = d; g.amb.duck(d); } }
  addEventListener('room:deck', () => duck());

  function setupButton() {
    let b = document.querySelector('.sound');
    if (b) {
      const nb = b.cloneNode(true);
      b.replaceWith(nb); b = nb;
    } else {
      b = document.createElement('button');
      b.className = 'sound'; b.type = 'button';
      Object.assign(b.style, { position: 'fixed', top: '16px', right: '16px', zIndex: 5, font: 'inherit',
        background: 'transparent', color: 'inherit', border: '1px solid currentColor', borderRadius: '999px', padding: '4px 12px', opacity: 0.8 });
      document.body.appendChild(b);
    }
    b.textContent = 'Sound';
    b.setAttribute('aria-label', geigerPos ? 'Room sound: rain, the canal and the Geiger counter' : 'Room sound: rain and the canal');
    b.setAttribute('aria-pressed', 'false');
    b.title = 'Room sound';
    b.hidden = !!live.gate;
    b.addEventListener('click', () => setSound(!wanted));
    return b;
  }
  let remembered = null;
  try { remembered = localStorage.getItem(STORE_KEY); } catch {   }
  if (remembered !== 'off' && !live.gate) {
    button.setAttribute('aria-pressed', 'true');
    wanted = true;
    const evs = ['pointerdown', 'pointerup', 'touchend', 'keydown'];
    const disarm = () => evs.forEach((e) => removeEventListener(e, arm, true));
    const arm = (ev) => {
      if (button.contains(ev.target)) return;
      if (!wanted || (on && ctx?.state === 'running')) { disarm(); return; }
      setSound(true, false);
    };
    evs.forEach((e) => addEventListener(e, arm, true));
  }
  document.addEventListener('visibilitychange', () => {
    if (!ctx || !wanted) return;
    if (document.hidden) { on = false; ctx.suspend().catch(() => {}); }
    else if (navigator.userActivation?.hasBeenActive !== false) setSound(true, false);
  });

  const fwd = new THREE.Vector3(), up = new THREE.Vector3(), tmp = new THREE.Vector3(), lastCam = new THREE.Matrix4();
  function listener() {
    camera.updateMatrixWorld();
    if (lastCam.equals(camera.matrixWorld)) return;
    lastCam.copy(camera.matrixWorld);
    const L = ctx.listener;
    camera.getWorldPosition(tmp);
    fwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
    up.set(0, 1, 0).applyQuaternion(camera.quaternion);
    if (L.positionX) {
      L.positionX.value = tmp.x; L.positionY.value = tmp.y; L.positionZ.value = tmp.z;
      L.forwardX.value = fwd.x; L.forwardY.value = fwd.y; L.forwardZ.value = fwd.z;
      L.upX.value = up.x; L.upY.value = up.y; L.upZ.value = up.z;
    } else { L.setPosition(tmp.x, tmp.y, tmp.z); L.setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z); }
  }

  const winDir = new THREE.Vector3(), right = new THREE.Vector3();
  function rain(now) {
    g.amb.schedule(now, now + 0.25);
    camera.getWorldPosition(tmp);
    winDir.copy(winC).sub(tmp).normalize();
    right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    g.amb.pan(winDir.dot(right), now);
  }

  const boatPos = new THREE.Vector3();
  function boatNow(now) {
    if (boatNode) {
      if (!boatNode.visible) return null;
      return boatNode.getWorldPosition(boatPos);
    }
    if (!g.procBoat && now > g.procAt) g.procBoat = { t0: now, dir: rand() < 0.5 ? -1 : 1 };
    if (!g.procBoat) return null;
    const k = (now - g.procBoat.t0) / BOAT.procS;
    if (k > 1) { g.procBoat = null; g.procAt = now + BOAT.procGap[0] + rand() * (BOAT.procGap[1] - BOAT.procGap[0]); return null; }
    return boatPos.set(winC.x + g.procBoat.dir * (k - 0.5) * 60, winC.y - 6, winC.z - 21);
  }
  function boat(now, dt) {
    const p = boatNow(now);
    if (!p) { g.boatLevel.gain.setTargetAtTime(0, now, 0.8); g.lastBoat = null; return; }
    camera.getWorldPosition(tmp);
    const d = p.distanceTo(tmp);
    setPos(g.boatPan, p);
    if (g.lastBoat && dt > 0) {
      const vr = (d - g.lastBoat) / dt;
      const k = C_SOUND / (C_SOUND + Math.max(-30, Math.min(30, vr)));
      g.saw.frequency.setTargetAtTime(BOAT.fire * k, now, 0.3);
      g.sub.frequency.setTargetAtTime(BOAT.fire / 2 * k, now, 0.3);
      g.chug.frequency.setTargetAtTime(BOAT.fire / 4 * k, now, 0.3);
    }
    g.lastBoat = d;
    const near = Math.max(0, Math.min(1, (60 - d) / 45));
    g.boatLp.frequency.setTargetAtTime(BOAT.lpFar + (BOAT.lpNear - BOAT.lpFar) * near, now, 0.5);
    g.boatLevel.gain.setTargetAtTime(BOAT.level, now, 1.5);
  }

  function geiger(now) {
    const gl = window.__room?.layers?.geiger;
    if (!gl) return;
    const i = gl.info();
    if (g.counts === null || i.soundOn) { g.counts = i.counts; return; }
    for (let n = Math.min(5, i.counts - g.counts); n > 0; n--) playClick(now + 0.005);
    g.counts = i.counts;
  }

  let agentDone = 0;
  document.addEventListener('room:agent-done', () => {
    if (!on || !ctx || ctx.state !== 'running' || !g) return;
    const t = ctx.currentTime + 0.005;
    playClick(t); playClick(t + 0.075);
    agentDone++;
  });

  const DRIVE = { hum: 0.10, humHz: 50, humS: 1.9, clack: 0.9, steps: 9, stepGap: 0.11, step: 0.5 };
  const drivePos = world('pr_1541', null);
  let drivePlays = 0;
  addEventListener('room:drive', () => {
    if (!on || !ctx || ctx.state !== 'running' || !g || !drivePos) return;
    const t = ctx.currentTime + 0.01, out = panner(drivePos, 0.6, 1);
    out.connect(g.master);
    const burst = (when, level, hp, ms) => {
      const n = Math.floor(ctx.sampleRate * ms / 1000), b = ctx.createBuffer(1, n, ctx.sampleRate), ch = b.getChannelData(0);
      for (let i = 0; i < n; i++) ch[i] = (rand() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * ms / 4000));
      const src = ctx.createBufferSource(); src.buffer = b;
      src.connect(filt('highpass', hp)).connect(gain(level)).connect(out); src.start(when);
    };
    burst(t, DRIVE.clack, 600, 18);
    const o = ctx.createOscillator(), og = gain(0);
    o.type = 'sawtooth'; o.frequency.value = DRIVE.humHz;
    o.connect(filt('lowpass', 240)).connect(og).connect(out);
    og.gain.setValueAtTime(0, t); og.gain.linearRampToValueAtTime(DRIVE.hum, t + 0.25);
    og.gain.setValueAtTime(DRIVE.hum, t + DRIVE.humS - 0.3); og.gain.linearRampToValueAtTime(0, t + DRIVE.humS);
    o.start(t); o.stop(t + DRIVE.humS + 0.05);
    for (let k = 0; k < DRIVE.steps; k++) burst(t + 0.7 + k * DRIVE.stepGap * (0.8 + 0.4 * rand()), DRIVE.step, 1200, 6);
    drivePlays++;
  });

  let lastNow = 0;
  return {
    name: 'audio',
    update() {
      if (!on || !ctx || ctx.state !== 'running') return false;
      const now = ctx.currentTime, dt = now - lastNow;
      lastNow = now;
      listener();
      rain(now);
      boat(now, dt);
      geiger(now);
      return false;
    },
    api: {
      on: () => setSound(true, false),
      off: () => setSound(false, false),
      trackInput: () => (g ? { ctx, input: g.track } : null),
      peak() { if (!g) return 0; g.analyser.getFloatTimeDomainData(g.buf); let p = 0; for (const v of g.buf) p = Math.max(p, Math.abs(v)); return p; },
      rms(bus) {
        const a = bus ? g?.meters[bus] : g?.analyser;
        if (!a) return 0;
        a.getFloatTimeDomainData(g.buf);
        let s = 0; for (const v of g.buf) s += v * v;
        return Math.sqrt(s / g.buf.length);
      },
      info: () => ({ state: ctx?.state ?? 'none', on, wanted, panes: panes.length, geiger: !!geigerPos,
        boat: boatNode ? 'cz_boat' : 'procedural', clicks: g?.clicks ?? 0, ducked: !!g?.ducked, buildMs: Math.round(buildMs), loadMs, ...(g ? g.amb.info() : {}), limDb: g ? +g.lim.reduction.toFixed(2) : 0,
        boatGain: g ? +g.boatLevel.gain.value.toFixed(3) : 0, agentDone, drivePlays }),
    },
  };
}
