// Live layer: the room's sound. A quiet procedural Web Audio soundscape, no audio files:
//   * rain on the two window panes: filtered pink noise per pane (decorrelated, so stereo), slow
//     gusts, and sparse droplet ticks spread across each pane;
//   * the city behind the glass: brown noise low in the spectrum, far out over the canal;
//   * the boat: a low diesel thrum that follows the rain layer's boat (cz_boat) with distance,
//     pan, air absorption and Doppler; without that node, a procedural ~20 s pass now and then;
//   * the Geiger counter: one click per count of layer-geiger.js (polled from its api), from the
//     counter's grille; skipped while the counter's own toggle sound is on, so it never doubles.
// Every source sits on a PannerNode at its object's position; the listener follows the camera.
// Constants and their sources: notes/audio.md.
//
// Off by default. One sound button (the page's `.sound` button, taken over so the room has one
// switch; created if missing). The choice is remembered; a remembered "on" starts on the visitor's
// first click or key (autoplay rules need a gesture). Off or hidden tab: the AudioContext is
// suspended, so no audio CPU at all.
import { expWait, rng, seedFrom } from './layer-common.js';

const STORE_KEY = 'room.sound';
const MASTER = 0.55;              // overall level; the mix below is relative to it
const FADE_IN = 1.8, FADE_OUT = 0.35;   // s
const GLASS = 0.35;               // level through the closed window (outside sources)
const RAIN = { level: 0.35, hp: 350, lp: 3200, gust: [0.6, 1.25], gustS: 6 };
const TICK = { rate: 3.5, level: 0.6, f: [1800, 5200], tau: [0.0015, 0.005] };   // per pane, per s
const CITY = { level: 0.12, lp: 180, dist: 120 };
const BOAT = { fire: 36, level: 0.9, ref: 8, lpNear: 320, lpFar: 110, procS: 20, procGap: [70, 200] };
const CLICK = { level: 1.2, hp: 1800, ms: 6, tau: 0.0007 };
const C_SOUND = 343;              // m/s

export default function mount(live) {
  const { THREE, byName, camera } = live;
  const rand = rng(seedFrom(live.params, 505));
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;

  // world positions of the sources (null if the object is not in this layout)
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
  if (!panes.length) {                       // no window in this layout: rain from "ahead", 3 m off
    for (const sx of [-1, 1]) panes.push({ p: new THREE.Vector3(sx * 1.2, 1.9, camPos.z - 4), w: 1.4, h: 2.4 });
  }
  const winC = panes.reduce((a, q) => a.add(q.p), new THREE.Vector3()).divideScalar(panes.length);
  const gd = byName('geiger')?.userData;
  const geigerPos = world('geiger', gd?.geiger_grille ?? null);
  const boatNode = byName('cz_boat');

  let ctx = null, g = null, on = false, wanted = false;
  const button = setupButton();

  // ---- the graph, built on the first gesture ----
  function noiseBuffer(sec, kind) {
    const n = Math.floor(ctx.sampleRate * sec), buf = ctx.createBuffer(1, n, ctx.sampleRate), ch = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, br = 0;
    for (let i = 0; i < n; i++) {
      const w = rand() * 2 - 1;
      if (kind === 'brown') { br = (br + 0.02 * w) / 1.02; ch[i] = br * 3.5; continue; }
      // pink (Paul Kellet's filter)
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.96900 * b2 + w * 0.1538520;
      b3 = 0.86650 * b3 + w * 0.3104856; b4 = 0.55000 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.0168980;
      ch[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
    }
    // cross-fade the ends so the loop has no click
    const f = Math.floor(ctx.sampleRate * 0.05);
    for (let i = 0; i < f; i++) { const k = i / f; ch[i] = ch[i] * k + ch[n - f + i] * (1 - k); }
    return buf;
  }
  function loop(buf, rate = 1) {
    const s = ctx.createBufferSource();
    s.buffer = buf; s.loop = true; s.playbackRate.value = rate;
    s.loopStart = 0.05; s.loopEnd = buf.duration;
    s.start(0, rand() * buf.duration * 0.9);
    return s;
  }
  function panner(pos, ref, rolloff = 1) {
    const p = ctx.createPanner();
    p.panningModel = 'equalpower';          // cheap; HRTF is not worth it at these levels
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

  function build() {
    ctx = new AC({ latencyHint: 'playback' });
    const master = gain(0), analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    master.connect(analyser).connect(ctx.destination);
    const outside = gain(GLASS);              // everything beyond the window goes through the glass
    outside.connect(master);
    const meter = (node) => { const a = ctx.createAnalyser(); a.fftSize = 2048; node.connect(a); return a; };

    // rain: one pink loop per pane, its own panner at the pane; plus ticks on the pane
    const pink = [noiseBuffer(3.1, 'pink'), noiseBuffer(3.7, 'pink')];
    const rainBus = gain(RAIN.level);
    rainBus.connect(master);
    const paneOut = panes.map((q, i) => {
      const pan = panner(q.p, 1.5, 0.6);
      const hiss = loop(pink[i % 2], 1 - 0.03 * i);
      hiss.connect(filt('highpass', RAIN.hp)).connect(filt('lowpass', RAIN.lp)).connect(pan);
      pan.connect(rainBus);
      const tickIn = gain(1);
      tickIn.connect(pan);
      return { pan, tickIn };
    });
    // the city: far out over the water, straight out of the window
    const city = loop(noiseBuffer(5.3, 'brown'), 0.9);
    const cityPan = panner(new THREE.Vector3(winC.x - 40, winC.y + 5, winC.z - CITY.dist), CITY.dist, 1);
    city.connect(filt('lowpass', CITY.lp)).connect(gain(CITY.level)).connect(cityPan).connect(outside);

    // the boat: firing pulse (sawtooth), half-order chug, both through a distance-driven lowpass
    const saw = ctx.createOscillator(); saw.type = 'sawtooth'; saw.frequency.value = BOAT.fire;
    const sub = ctx.createOscillator(); sub.type = 'sine'; sub.frequency.value = BOAT.fire / 2;
    const chug = ctx.createOscillator(); chug.type = 'sine'; chug.frequency.value = BOAT.fire / 4;
    const chugDepth = gain(0.35), body = gain(0.65);
    chug.connect(chugDepth).connect(body.gain);
    const burble = loop(noiseBuffer(2.3, 'brown'));
    const boatLp = filt('lowpass', BOAT.lpFar, 0.9);
    saw.connect(gain(0.5)).connect(body); sub.connect(gain(0.8)).connect(body);
    burble.connect(filt('bandpass', 90, 0.8)).connect(gain(1.2)).connect(body);
    const boatLevel = gain(0);
    const boatPan = panner(winC.clone().add(new THREE.Vector3(60, -6, -20)), BOAT.ref, 1);
    body.connect(boatLp).connect(boatLevel).connect(boatPan).connect(outside);
    for (const o of [saw, sub, chug]) o.start();

    // Geiger clicks: one short buffer per click, through the counter's panner
    const geigerPan = geigerPos ? panner(geigerPos, 0.6, 1) : null;
    geigerPan?.connect(master);

    // droplet ticks: a few damped-sine buffers, picked at random
    const ticks = Array.from({ length: 8 }, () => {
      const f = TICK.f[0] + rand() * (TICK.f[1] - TICK.f[0]), tau = TICK.tau[0] + rand() * (TICK.tau[1] - TICK.tau[0]);
      const n = Math.floor(ctx.sampleRate * tau * 6), b = ctx.createBuffer(1, n, ctx.sampleRate), ch = b.getChannelData(0);
      for (let i = 0; i < n; i++) { const t = i / ctx.sampleRate; ch[i] = Math.exp(-t / tau) * (Math.sin(2 * Math.PI * f * t) * 0.8 + (rand() * 2 - 1) * 0.2); }
      return b;
    });
    const meters = { rain: meter(rainBus), outside: meter(outside), ...(geigerPan ? { geiger: meter(geigerPan) } : {}) };
    g = { master, analyser, meters, paneOut, rainBus, saw, sub, chug, burble, boatLp, boatLevel, boatPan, geigerPan, ticks,
      nextTick: panes.map(() => 0), gustAt: 0, lastBoat: null, procBoat: null, procAt: ctx.currentTime + 15 + rand() * 30, counts: null,
      clicks: 0, scheduledTicks: 0, buf: new Float32Array(analyser.fftSize) };
  }

  function playTick(i, when) {
    const s = ctx.createBufferSource(), st = ctx.createStereoPanner ? ctx.createStereoPanner() : null, a = gain(TICK.level * (0.3 + rand()));
    s.buffer = g.ticks[Math.floor(rand() * g.ticks.length)];
    s.playbackRate.value = 0.85 + rand() * 0.3;
    if (st) { st.pan.value = (rand() - 0.5) * 0.5; s.connect(a).connect(st).connect(g.paneOut[i].tickIn); }
    else s.connect(a).connect(g.paneOut[i].tickIn);
    s.start(when);
    g.scheduledTicks++;
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

  // ---- on / off ----
  function setSound(next, remember = true) {
    wanted = next;
    if (remember) { try { localStorage.setItem(STORE_KEY, next ? 'on' : 'off'); } catch { /* private mode */ } }
    button.setAttribute('aria-pressed', String(next));
    if (next && !ctx) build();
    if (!ctx) return Promise.resolve();
    const now = ctx.currentTime, m = g.master.gain;
    m.cancelScheduledValues(now); m.setValueAtTime(m.value, now);
    if (next && !document.hidden) {
      on = true;
      return ctx.resume().then(() => { const t = ctx.currentTime; m.setValueAtTime(0, t); m.linearRampToValueAtTime(MASTER, t + FADE_IN); }).catch(() => {});
    }
    on = false;
    g.counts = null;                          // counts while muted are not played back later
    m.linearRampToValueAtTime(0, now + FADE_OUT);
    return new Promise((r) => setTimeout(r, FADE_OUT * 1000 + 30)).then(() => { if (!on) return ctx.suspend(); }).catch(() => {});
  }

  function setupButton() {
    let b = document.querySelector('.sound');
    if (b) {                                  // the page's button: drop the Geiger-only listener
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
    b.setAttribute('aria-label', 'Room sound: rain, the canal and the Geiger counter');
    b.setAttribute('aria-pressed', 'false');
    b.title = 'Room sound';
    b.hidden = !!live.gate;
    b.addEventListener('click', () => setSound(!wanted));
    return b;
  }
  let remembered = null;
  try { remembered = localStorage.getItem(STORE_KEY); } catch { /* blocked storage: stay off */ }
  if (remembered === 'on' && !live.gate) {
    // a remembered "on": wait for the visitor's first gesture anywhere on the page
    button.setAttribute('aria-pressed', 'true');
    wanted = true;
    const arm = (ev) => {
      if (ev.target === button) return;       // the button's own click decides
      removeEventListener('pointerup', arm, true); removeEventListener('keydown', arm, true);
      if (wanted && !on) setSound(true, false);
    };
    addEventListener('pointerup', arm, true); addEventListener('keydown', arm, true);
  }
  document.addEventListener('visibilitychange', () => {
    if (!ctx || !wanted) return;
    if (document.hidden) { on = false; ctx.suspend().catch(() => {}); }
    else if (navigator.userActivation?.hasBeenActive !== false) setSound(true, false);
  });

  // ---- per frame (only while on) ----
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

  function rain(now) {
    if (now > g.gustAt) {                    // a slow random walk of the rain's strength
      const k = RAIN.gust[0] + rand() * (RAIN.gust[1] - RAIN.gust[0]);
      g.rainBus.gain.setTargetAtTime(RAIN.level * k, now, RAIN.gustS / 3);
      g.gustAt = now + RAIN.gustS * (0.5 + rand());
    }
    for (let i = 0; i < panes.length; i++) {
      if (g.nextTick[i] < now) g.nextTick[i] = now + expWait(rand, TICK.rate);
      while (g.nextTick[i] < now + 0.2) { playTick(i, g.nextTick[i]); g.nextTick[i] += expWait(rand, TICK.rate); }
    }
  }

  // the boat's position: the rain layer's moving cz_boat, or a procedural pass
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
    // Doppler from the radial speed; air and glass take more highs the further it is
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

  // an agent finished (layer-terminal.js replays the room's commits): the workbench's Geiger
  // double-click, from the counter's grille; not the Poisson counter, whose clock stays its own
  let agentDone = 0;
  document.addEventListener('room:agent-done', () => {
    if (!on || !ctx || ctx.state !== 'running' || !g) return;
    const t = ctx.currentTime + 0.005;
    playClick(t); playClick(t + 0.075);
    agentDone++;
  });

  let lastNow = 0;
  return {
    name: 'audio',
    update() {
      if (!on || !ctx || ctx.state !== 'running') return false;   // muted: nothing at all
      const now = ctx.currentTime, dt = now - lastNow;
      lastNow = now;
      listener();
      rain(now);
      boat(now, dt);
      geiger(now);
      return false;                                                // never needs a frame
    },
    api: {
      on: () => setSound(true, false),
      off: () => setSound(false, false),
      // RMS of the master output, or of one bus before the master gain ('rain', 'outside', 'geiger')
      rms(bus) {
        const a = bus ? g?.meters[bus] : g?.analyser;
        if (!a) return 0;
        a.getFloatTimeDomainData(g.buf);
        let s = 0; for (const v of g.buf) s += v * v;
        return Math.sqrt(s / g.buf.length);
      },
      info: () => ({ state: ctx?.state ?? 'none', on, wanted, panes: panes.length, geiger: !!geigerPos,
        boat: boatNode ? 'cz_boat' : 'procedural', clicks: g?.clicks ?? 0, ticks: g?.scheduledTicks ?? 0,
        boatGain: g ? +g.boatLevel.gain.value.toFixed(3) : 0, agentDone }),
    },
  };
}
