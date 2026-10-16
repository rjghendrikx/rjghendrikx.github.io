// Live layer 3: the Geiger counter counts the background, the scope shows each pulse.
//
// One Poisson clock (notes/physics.md, "Geiger counter + oscilloscope"): an SBM-20 at natural
// background gives ~19 CPM at 0.12 uSv/h (pocketmagic.net/?p=4761), so a mean of 20 CPM; its 190 us
// dead time (datasheet) loses nothing at this rate. Each count:
//   * the LED on the Geiger board blinks;
//   * the scope (50 us/div, 10 x 8 div) draws one triggered sweep: a negative spike with a ~1 us
//     edge and an exponential recovery, tau = RC ~ 50 us (5.1 MOhm anode resistor; the shape is
//     unmeasured), in P31 green that fades in ~0.2 s (a flash; a non-storage scope keeps nothing); the fast edge is faint because the beam
//     writes it ~150x faster than the baseline, as on a real CRT;
//   * a soft click (Web Audio), only after the visitor flips the counter's toggle or the sound button.
//
// Hooks (lib/live.py): scope extras scope_screen_center/size, scope_div; geiger extras geiger_toggle,
// geiger_led, geiger_lever (pivot + lever angle, the toggle is modelled OFF).
import { expWait, noPick, rng, seedFrom, splitPart } from './layer-common.js';

const CPM = 20;
const RATE = CPM / 60;
// div: 1 us = 0.02 div, 50 us = 1 div; the spike starts at the left edge, a 2215 shows no pre-trigger (panel 015 action 12)
const SWEEP = { trig: 0.02, edge: 0.02, tau: 1.0, amp: 3.0, base: 1.6 };
const GLOW_TAU = 0.05;          // s, P31 afterglow as seen: a flash, gone in ~0.2 s (physics.md; panel 011: ~50 ms)
const LED_TAU = 0.035;          // s, LED blink
const NECK_R = 0.0028;          // m, the toggle's threaded neck (geiger._toggle_and_led)

export default function mount(live) {
  const { THREE, byName } = live;
  const scope = byName('scope'), geiger = byName('geiger');
  const s = scope?.userData, gd = geiger?.userData;
  if (!s?.scope_screen_center || !gd?.geiger_led) return null;
  const rand = rng(seedFrom(live.params, 303));

  // the trace: a quad just in front of the CRT face (face normal glTF +Z)
  const [sw, sh] = s.scope_screen_size;
  const divs = [Math.round(sw / s.scope_div), Math.round(sh / s.scope_div)];
  const ages = new THREE.Vector3(99, 99, 99);
  const traceMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uAges: { value: ages }, uDiv: { value: new THREE.Vector2(...divs) }, uGlow: { value: GLOW_TAU } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 uAges; uniform vec2 uDiv; uniform float uGlow; varying vec2 vUv;
      const float T0 = ${SWEEP.trig.toFixed(3)}, TE = ${(SWEEP.trig + SWEEP.edge).toFixed(3)}, TAU = ${SWEEP.tau.toFixed(3)};
      const float A = ${SWEEP.amp.toFixed(3)}, YB = ${SWEEP.base.toFixed(3)};
      void main() {
        float x = vUv.x * uDiv.x, y = (vUv.y - 0.5) * uDiv.y;
        float f, df;
        if (x < T0) { f = YB; df = 0.0; }
        else if (x < TE) { df = -A / (TE - T0); f = YB + df * (x - T0); }
        else { float e = exp(-(x - TE) / TAU); f = YB - A * e; df = A / TAU * e; }
        float k = inversesqrt(1.0 + df * df);          // 1 / writing speed
        float d = abs(y - f) * k;                      // distance to the trace
        float px = length(vec2(fwidth(x), fwidth(y)));
        float w = 0.035;                               // beam spot, div (~0.35 mm)
        float core = exp(-pow(d / (w + px), 2.0)) * w / (w + px);
        float halo = exp(-d / 0.18) * 0.12;
        float b = 0.0;
        for (int i = 0; i < 3; i++) b += exp(-uAges[i] / uGlow);
        float i0 = (core + halo) * max(k, 0.06) * b;
        vec3 p31 = vec3(0.25, 1.0, 0.42);
        gl_FragColor = vec4(p31 * i0 + vec3(0.6, 1.0, 0.7) * pow(core * b, 3.0) * 0.5, 1.0);
      }`,
  });
  const trace = noPick(new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), traceMat));
  trace.name = 'scope_trace';
  trace.position.fromArray(s.scope_screen_center).add(new THREE.Vector3(0, 0, 0.0005));
  trace.visible = false;
  scope.add(trace);

  // the LED: one glowing point on its dome
  const ledMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uOn: { value: 0 }, uPx: { value: 800 } },
    vertexShader: 'uniform float uPx; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = max(3.0, uPx * 0.014 / -mv.z); }',
    fragmentShader: `uniform float uOn; void main() { float q = length(gl_PointCoord - 0.5) * 2.0;
      gl_FragColor = vec4(vec3(1.0, 0.18, 0.08) * uOn * (smoothstep(1.0, 0.0, q) * 0.6 + smoothstep(0.3, 0.0, q)), 1.0); }`,
  });
  const ledGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(gd.geiger_led, 3));
  const led = noPick(new THREE.Points(ledGeo, ledMat));
  led.name = 'geiger_led_glow';
  led.visible = false;
  geiger.add(led);

  // the toggle lever: its baked triangles become a part that flips (OFF leans -X, ON leans +X)
  let lever = null, leverAngle = 0;
  if (gd.geiger_lever) {
    const [px, py, pz, deg] = gd.geiger_lever;
    const pivot = new THREE.Vector3(px, py, pz);
    // the lever and its tip, including the stub inside the neck; not the neck (its verts sit on the
    // neck radius) nor the neck's top cap (all verts at the pivot height)
    const r = (v) => Math.hypot(v.x - px, v.z - pz);
    lever = splitPart(geiger, (a, b, c) => {
      const vs = [a, b, c], cy = (a.y + b.y + c.y) / 3;
      if (cy < py - 0.0019 || vs.some((v) => r(v) > 0.012)) return false;
      if (vs.every((v) => Math.abs(v.y - py) < 1e-5)) return false;
      return !vs.every((v) => Math.abs(r(v) - NECK_R) < 2e-4);
    }, pivot, 'geiger_lever');
    leverAngle = THREE.MathUtils.degToRad(2 * deg);
  }

  // sound: created on the visitor's first flip, never before
  let audio = null, soundOn = false;
  const button = document.querySelector('.sound');
  function click() {
    if (!audio || audio.state !== 'running') return;
    const n = Math.floor(audio.sampleRate * 0.006);
    const buf = audio.createBuffer(1, n, audio.sampleRate), ch = buf.getChannelData(0);
    for (let i = 0; i < n; i++) ch[i] = (rand() * 2 - 1) * Math.exp(-i / (audio.sampleRate * 0.0007));
    const src = audio.createBufferSource(), hp = audio.createBiquadFilter(), gain = audio.createGain();
    hp.type = 'highpass'; hp.frequency.value = 1800; gain.gain.value = 0.22;
    src.buffer = buf;
    src.connect(hp).connect(gain).connect(audio.destination);
    src.start();
  }
  function setSound(on) {
    soundOn = on;
    if (on && !audio) audio = new (window.AudioContext || window.webkitAudioContext)();
    if (audio) (on ? audio.resume() : audio.suspend()).catch(() => {});
    if (lever) lever.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, -1), on ? leverAngle : 0);
    button?.setAttribute('aria-pressed', String(on));
    live.render();
  }
  if (button) { button.hidden = false; button.addEventListener('click', () => setSound(!soundOn)); }
  const tog = new THREE.Vector3().fromArray(gd.geiger_toggle);
  // the counter and its lever (a child): a click within 2 cm of the toggle flips it
  live.picks.push({ object: geiger, accept: (p) => geiger.worldToLocal(p.clone()).distanceTo(tog) < 0.02, onPick: () => setSound(!soundOn) });
  document.addEventListener('visibilitychange', () => {
    if (audio && soundOn) (document.hidden ? audio.suspend() : audio.resume()).catch(() => {});
  });

  let t = 0, next = expWait(rand, RATE), counts = 0, lastCount = -99, staticShown = false;
  const hist = [-99, -99, -99];            // times of the last three counts (long ago)
  function count() {
    counts++;
    lastCount = t;
    hist.unshift(t); hist.length = 3;
    if (soundOn) click();
  }
  function step(dt, visual = true) {
    t += dt;
    while (t >= next) { count(); next += expWait(rand, RATE); }
    if (!visual) return false;
    if (live.reduceMotion.matches) {        // static but correct: one pulse on the screen, no blinking
      ages.set(0.15, 99, 99); led.visible = false; trace.visible = true;
      const first = !staticShown; staticShown = true;
      return first;
    }
    staticShown = false;
    ages.set(t - hist[0], t - hist[1], t - hist[2]);
    const glow = Math.exp(-ages.x / GLOW_TAU) > 0.01;
    const ledOn = Math.exp(-(t - lastCount) / LED_TAU);
    ledMat.uniforms.uOn.value = ledOn;
    const changed = glow || trace.visible || led.visible;
    trace.visible = glow;
    led.visible = ledOn > 0.01;
    return changed;
  }

  return {
    name: 'geiger',
    update(dt) {
      ledMat.uniforms.uPx.value = live.renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(live.camera.fov) / 2));
      return step(live.gate ? 0 : dt);
    },
    api: {
      // fast-forward the counter's clock without drawing: returns the counts in that time
      fastForward(sec) { const c0 = counts; const n = Math.ceil(sec / 0.05); for (let i = 0; i < n; i++) step(sec / n, false); return counts - c0; },
      advance(sec, h = 1 / 60) { let n = Math.round(sec / h); while (n-- > 0) step(h); live.render(); return this.info(); },
      count() { count(); step(0); live.render(); },
      sound: (on) => setSound(on),
      info: () => ({ t, counts, cpm: CPM, soundOn, audio: audio?.state ?? 'none', lever: !!lever, traceVisible: trace.visible, ledVisible: led.visible }),
    },
  };
}
