// The opening shot at the canal house (layout canal_house): high over the night canal like an aerial
// photo, down to the water and along it past the moored barge, up to the first-floor window, through a
// rain-wet pane into the room, and round the table to the hero view, where the orbit takes over. 10 s.
// Notes: notes/intro.md.
// The route is the old hand-keyed shot's (17.5 s, KEYS below); the motion along it is physics: a bead on
// a wire along that route, at a stationary point of the discrete action S = sum [1/2 m |dx/dt|^2 - V(x)] dt
// with fixed ends, in an invented landscape V (tools/intro_path.py; the poster pr_poster_action explains
// it). Baked in intro-path.js as [u, v, h] samples every DT s, played back in real time (uniform
// Catmull-Rom between samples, no easing: fast high up, slow at the end because the camera climbs V).
// The look-at point and the FOV are the old shot's keys, replayed at TAU (the old key time at each sample).
// Hooks (objects/cz_canal_night.py, node cz_canal_night, glTF axes): rain_panes (the window the camera
// passes through), rain_water_y; the hero camera from the glTF (its exact pose and FOV are where the
// shot ends). The samples are in a canal frame built from those hooks, so the shot follows the data.
// Plays once per visitor (localStorage, guarded), skipped by any input (pointer, wheel, key) or the
// skip button. Not under ?gate, ?nolive (not mounted), ?nointro or prefers-reduced-motion; ?intro
// plays it again; at the end window gets a 'room:intro' event (detail: done | skipped). It starts after the room is ready, so the still stays the LCP; idle, it costs nothing.
import { DT, N, PTS, TAU } from './intro-path.js';

const DURATION = N * DT;         // s, the whole shot (10)
const KEY = 'room.intro.v1';     // localStorage: seen
const PORTRAIT_MAX = 1.9;        // same widening as main.js (tan space)
// The old shot's look-at keys and FOV: [key time (s), look-at [u, v, h] from the pass point (u along the
// facade, v out of the window, h up), vertical FOV at 16:9 (deg)]; the last is the hero's (filled at mount).
const LOOKS = [
  [0.0, [-17.15, 33.83, -4.2], 42],     // aerial over the canal: the bridge, the university
  [3.75, [-13.15, 19.83, -6.8], 40],    // sweeping down over the houseboat
  [6.8, [-11.15, 14.83, -5.7], 38],     // low on the water, along the canal
  [8.8, [-15.15, 12.83, -5.6], 40],     // alongside the barge
  [10.5, [-0.4, 8.0, -3.6], 40],        // over its roof, the bulbs below
  [12.15, [0.25, 0.83, -0.5], 36],      // over the quay, under the elm: the window, from the left
  [13.5, [1.25, -1.07, -0.75], 40],     // at the wet pane, looking in towards the bookcase
  [14.3, [1.15, -2.07, -1.0], 48],      // through
  [15.15, [0.75, -2.57, -1.05], 52],    // over the table, the vase in the beam
  [16.5, [-0.15, -1.37, -1.25], 46],    // back over the table, turning to the window
  [17.5, null, null],                   // the hero view
];

export default function mount(live) {
  const { THREE, byName, camera, params } = live;
  const d = byName('cz_canal_night')?.userData;
  if (!d?.rain_panes || live.gate || params.has('nointro')) return null;
  let seen = false;
  try { seen = localStorage.getItem(KEY) === '1'; } catch { /* private mode: play */ }
  if ((seen && !params.has('intro')) || live.reduceMotion.matches) return null;

  // the canal frame from the hooks: the right-hand pane, out of the window = -z (glTF)
  const panes = [];
  for (let k = 0; k < d.rain_panes.length; k += 5) panes.push(d.rain_panes.slice(k, k + 5));
  const [px, py, pz] = panes.reduce((a, b) => (b[0] > a[0] ? b : a));
  const passH = panes[0][4] * 0.125;  // between the glazing bars: the upper sash's lower row of lights
  const P = (u, v, h) => new THREE.Vector3(px + u, py + passH + h, pz - v);

  // the hero: main.js has placed the camera there; the look-at point from the glTF camera's extras
  const heroPos = camera.position.clone(), heroQuat = camera.quaternion.clone();
  let src = null;
  live.scene.traverse((o) => { if (!src && o.isPerspectiveCamera) src = o; });
  const tgtData = src?.userData.hero_target ?? src?.parent?.userData.hero_target;
  const heroTarget = tgtData ? new THREE.Vector3(...tgtData)
    : heroPos.clone().add(new THREE.Vector3(0, 0, -4).applyQuaternion(heroQuat));
  const heroFov = src?.fov ?? camera.fov;
  let endFov = camera.fov;                           // the hero FOV as main.js fitted it to this screen

  // the samples in the world; the path was solved to end at the layout's hero, so the remainder (a few mm
  // when the layout and the bake agree) is spread linearly along it, keeping the cut to the orbit seamless
  const X = [];
  for (let i = 0; i <= N; i++) X.push(P(PTS[3 * i], PTS[3 * i + 1], PTS[3 * i + 2]));
  const endFix = heroPos.clone().sub(X[N]);
  X.forEach((p, i) => p.addScaledVector(endFix, i / N));
  const tPane = Math.floor(PTS.findIndex((p, k) => k % 3 === 1 && p < 0) / 3) * DT;   // first sample inside the glass

  function at(t, out) {                              // uniform Catmull-Rom through the samples
    const s = Math.min(N, Math.max(0, t / DT)), i = Math.min(N - 1, Math.floor(s)), f = s - i;
    const p0 = X[Math.max(0, i - 1)], p1 = X[i], p2 = X[i + 1], p3 = X[Math.min(N, i + 2)];
    const f2 = f * f, f3 = f2 * f;
    return out.set(0, 0, 0)
      .addScaledVector(p0, -0.5 * f3 + f2 - 0.5 * f)
      .addScaledVector(p1, 1.5 * f3 - 2.5 * f2 + 1)
      .addScaledVector(p2, -1.5 * f3 + 2 * f2 + 0.5 * f)
      .addScaledVector(p3, 0.5 * f3 - 0.5 * f2);
  }

  // the old look-at and FOV splines: non-uniform Catmull-Rom (Barry-Goldman, knots = key times), reflected
  // phantom ends, evaluated at the old key time TAU of the new path
  const KT = LOOKS.map((k) => k[0]);
  const KL = LOOKS.map(([, l]) => (l ? P(...l) : heroTarget.clone()));
  const KF = LOOKS.map(([, , f]) => f ?? heroFov);
  const ext = (arr, lerp) => [lerp(arr[0], arr[1], -1), ...arr, lerp(arr.at(-1), arr.at(-2), -1)];
  const sl = (a, b, k) => a + (b - a) * k;
  const TT = ext(KT, sl), LL = ext(KL, (a, b, k) => a.clone().lerp(b, k)), FF = ext(KF, sl);
  const _a = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()], _b = [new THREE.Vector3(), new THREE.Vector3()];
  function cr(PP, tau, out) {
    let i = 1;
    while (i < TT.length - 3 && tau > TT[i + 1]) i++;
    const [t0, t1, t2, t3] = TT.slice(i - 1, i + 3), [p0, p1, p2, p3] = PP.slice(i - 1, i + 3);
    const w = (ta, tb) => (tau - ta) / (tb - ta);
    if (typeof p0 === 'number') {
      const a1 = sl(p0, p1, w(t0, t1)), a2 = sl(p1, p2, w(t1, t2)), a3 = sl(p2, p3, w(t2, t3));
      return sl(sl(a1, a2, w(t0, t2)), sl(a2, a3, w(t1, t3)), w(t1, t2));
    }
    _a[0].copy(p0).lerp(p1, w(t0, t1)); _a[1].copy(p1).lerp(p2, w(t1, t2)); _a[2].copy(p2).lerp(p3, w(t2, t3));
    _b[0].copy(_a[0]).lerp(_a[1], w(t0, t2)); _b[1].copy(_a[1]).lerp(_a[2], w(t1, t3));
    return out.copy(_b[0]).lerp(_b[1], w(t1, t2));
  }
  const tauAt = (t) => {                             // the old key time at t (linear between samples)
    const s = Math.min(N, Math.max(0, t / DT)), i = Math.min(N - 1, Math.floor(s));
    return sl(TAU[i], TAU[i + 1], s - i);
  };

  const pos = new THREE.Vector3(), look = new THREE.Vector3();
  const portrait = () => Math.tan(THREE.MathUtils.degToRad(endFov) / 2) / Math.tan(THREE.MathUtils.degToRad(heroFov) / 2);
  function pose(t) {
    const tau = tauAt(t);
    at(t, pos);
    cr(LL, tau, look);
    camera.position.copy(pos);
    camera.lookAt(look);
    const f = THREE.MathUtils.degToRad(cr(FF, tau));
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.min(PORTRAIT_MAX, portrait()) * Math.tan(f / 2)));
    camera.updateProjectionMatrix();
  }

  // the skip affordance: a quiet pill, shown after a moment; any input skips as well
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'intro-skip';
  btn.textContent = 'Skip intro';
  // phone: docked bottom-centre above the chip strip, in the prompt's slot (the prompt only shows after the
  // intro), so it never covers the caption's contact row at the top (panel 013, action 1)
  const narrow = matchMedia('(max-width: 640px)').matches;
  Object.assign(btn.style, {
    position: 'fixed', zIndex: 5, left: '50%', transform: 'translateX(-50%)',
    bottom: narrow ? 'calc(max(16px, env(safe-area-inset-bottom, 0px)) + 62px)' : 'max(16px, env(safe-area-inset-bottom, 0px))',
    font: 'inherit', fontSize: '12.5px', lineHeight: '1', color: '#efe6da', cursor: 'pointer',
    background: 'rgba(20, 17, 15, .55)', border: '1px solid rgba(239, 230, 218, .22)', borderRadius: '999px',
    padding: '7px 12px', opacity: '0', transition: 'opacity .6s ease', backdropFilter: 'blur(6px)', webkitBackdropFilter: 'blur(6px)',
  });
  document.body.appendChild(btn);
  const showBtn = setTimeout(() => { btn.style.opacity = '0.85'; }, 900);

  let t = 0, playing = true;
  const EVENTS = ['pointerdown', 'wheel', 'keydown', 'touchstart'];
  function finish(why) {
    if (!playing) return;
    playing = false;
    clearTimeout(showBtn);
    for (const e of EVENTS) removeEventListener(e, onInput, true);
    removeEventListener('resize', onResize);
    live.reduceMotion.removeEventListener?.('change', onMotion);
    btn.remove();
    camera.position.copy(heroPos);
    camera.quaternion.copy(heroQuat);
    camera.fov = endFov;
    camera.updateProjectionMatrix();
    root.dataset.intro = why;
    dispatchEvent(new CustomEvent('room:intro', { detail: why }));   // for layers that wait for the room (projector)
    live.render();
  }
  const { root } = live;
  const onInput = () => finish('skipped');
  // main.js's resize handler runs first (registered earlier) and refits the hero FOV: take it as the end
  const onResize = () => { if (playing) { endFov = camera.fov; pose(t); } };
  const onMotion = () => { if (live.reduceMotion.matches) finish('skipped'); };
  for (const e of EVENTS) addEventListener(e, onInput, { capture: true, passive: true });
  addEventListener('resize', onResize);
  live.reduceMotion.addEventListener?.('change', onMotion);
  try { localStorage.setItem(KEY, '1'); } catch { /* storage blocked: it plays again next time */ }
  root.dataset.intro = 'playing';
  pose(0);                                            // the first frame main.js draws is the aerial

  return {
    name: 'intro',
    update(dt) {
      if (!playing) return false;
      t += dt;
      if (t >= DURATION) { finish('done'); return true; }
      pose(t);
      live.render();                                  // the camera moves: full frame rate, not the ambient cap
      return true;
    },
    api: {
      playing: () => playing,
      // gates and frame captures: hold the shot at a fraction k of its length
      at(k) { if (!playing) return null; t = k * DURATION; pose(t); live.render(); return { t, pos: pos.toArray(), look: look.toArray(), fov: camera.fov }; },
      skip: () => finish('skipped'),
      path: () => ({ dt: DT, n: N, tPane, tau: TAU, endFix: endFix.toArray(), pts: X.map((v) => v.toArray()) }),
    },
  };
}
