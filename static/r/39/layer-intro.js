import { DT, N, PTS, TAU } from './intro-path.js';

const DURATION = N * DT;
const KEY = 'room.intro.v1';
const PROMPT_AT = 6;
const PORTRAIT_MAX = 1.9;
const LOOKS = [
  [0.0, [-17.15, 33.83, -4.2], 42],
  [3.75, [-13.15, 19.83, -6.8], 40],
  [6.8, [-11.15, 14.83, -5.7], 38],
  [8.8, [-15.15, 12.83, -5.6], 40],
  [10.5, [-0.4, 8.0, -3.6], 40],
  [12.15, [0.25, 0.83, -0.5], 36],
  [13.5, [1.25, -1.07, -0.75], 40],
  [14.3, [1.15, -2.07, -1.0], 48],
  [15.15, [0.75, -2.57, -1.05], 52],
  [16.5, [-0.15, -1.37, -1.25], 46],
  [17.5, null, null],
];

export default function mount(live) {
  const { THREE, byName, camera, params } = live;
  const d = byName('cz_canal_night')?.userData;
  if (!d?.rain_panes || live.gate || params.has('nointro')) return null;
  let seen = false;
  try { seen = localStorage.getItem(KEY) === '1'; } catch {   }
  if ((seen && !params.has('intro')) || live.reduceMotion.matches) return null;
  if (document.querySelector('#work.open')) return null;

  const panes = [];
  for (let k = 0; k < d.rain_panes.length; k += 5) panes.push(d.rain_panes.slice(k, k + 5));
  const [px, py, pz] = panes.reduce((a, b) => (b[0] > a[0] ? b : a));
  const passH = panes[0][4] * 0.125;
  const P = (u, v, h) => new THREE.Vector3(px + u, py + passH + h, pz - v);

  const heroPos = camera.position.clone(), heroQuat = camera.quaternion.clone();
  let src = null;
  live.scene.traverse((o) => { if (!src && o.isPerspectiveCamera) src = o; });
  const tgtData = src?.userData.hero_target ?? src?.parent?.userData.hero_target;
  const heroTarget = tgtData ? new THREE.Vector3(...tgtData)
    : heroPos.clone().add(new THREE.Vector3(0, 0, -4).applyQuaternion(heroQuat));
  const heroFov = src?.fov ?? camera.fov;
  const vo = () => (camera.view?.enabled ? [camera.view.offsetX / camera.view.fullWidth, camera.view.offsetY / camera.view.fullHeight] : null);
  const shiftBy = (k) => {
    const w = innerWidth, h = innerHeight;
    if (k > 0) camera.setViewOffset(w, h, heroShift[0] * k * w, heroShift[1] * k * h, w, h); else camera.clearViewOffset();
  };
  let heroShift = vo();
  let endFov = camera.fov;

  const X = [];
  for (let i = 0; i <= N; i++) X.push(P(PTS[3 * i], PTS[3 * i + 1], PTS[3 * i + 2]));
  const endFix = heroPos.clone().sub(X[N]);
  X.forEach((p, i) => p.addScaledVector(endFix, i / N));
  const tPane = Math.floor(PTS.findIndex((p, k) => k % 3 === 1 && p < 0) / 3) * DT;

  function at(t, out) {
    const s = Math.min(N, Math.max(0, t / DT)), i = Math.min(N - 1, Math.floor(s)), f = s - i;
    const p0 = X[Math.max(0, i - 1)], p1 = X[i], p2 = X[i + 1], p3 = X[Math.min(N, i + 2)];
    const f2 = f * f, f3 = f2 * f;
    return out.set(0, 0, 0)
      .addScaledVector(p0, -0.5 * f3 + f2 - 0.5 * f)
      .addScaledVector(p1, 1.5 * f3 - 2.5 * f2 + 1)
      .addScaledVector(p2, -1.5 * f3 + 2 * f2 + 0.5 * f)
      .addScaledVector(p3, 0.5 * f3 - 0.5 * f2);
  }

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
  const tauAt = (t) => {
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
    const k = heroShift ? THREE.MathUtils.smoothstep(t, DURATION - 1.5, DURATION) : 0;
    shiftBy(k);
    camera.updateProjectionMatrix();
  }

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'intro-skip';
  btn.textContent = 'Skip intro';
  const narrow = matchMedia('(max-width: 640px)').matches;
  Object.assign(btn.style, {
    position: 'fixed', zIndex: 5, left: '50%', transform: 'translateX(-50%)',
    bottom: narrow ? 'calc(max(16px, env(safe-area-inset-bottom, 0px)) + 62px)' : 'max(16px, env(safe-area-inset-bottom, 0px))',
    font: 'inherit', fontSize: '12.5px', lineHeight: '1', color: '#efe6da', cursor: 'pointer',
    background: 'rgba(20, 17, 15, .55)', border: '1px solid rgba(239, 230, 218, .22)', borderRadius: '999px',
    padding: '7px 12px', opacity: '0', transition: 'opacity .6s ease', backdropFilter: 'blur(6px)', webkitBackdropFilter: 'blur(6px)',
  });
  btn.style.background = 'rgba(20, 17, 15, .8)';
  document.body.appendChild(btn);
  const showBtn = setTimeout(() => { btn.style.opacity = '1'; }, 900);
  let prompted = false;
  function cue() {
    if (prompted || t < PROMPT_AT) return;
    prompted = true;
    if (narrow) btn.remove();
    dispatchEvent(new CustomEvent('room:intro-prompt'));
  }

  let t = 0, playing = true, elapsed = 0;
  const EVENTS = ['pointerdown', 'wheel', 'keydown', 'touchstart'];
  function finish(why) {
    if (!playing) return;
    playing = false;
    clearTimeout(showBtn);
    for (const e of EVENTS) removeEventListener(e, onInput, true);
    removeEventListener('resize', onResize);
    removeEventListener('room:skipintro', onInput);
    live.reduceMotion.removeEventListener?.('change', onMotion);
    btn.remove();
    camera.position.copy(heroPos);
    camera.quaternion.copy(heroQuat);
    camera.fov = endFov;
    if (heroShift) shiftBy(1);
    camera.updateProjectionMatrix();
    root.dataset.intro = why;
    elapsed = t;
    dispatchEvent(new CustomEvent('room:intro', { detail: why }));
    live.render();
  }
  const { root } = live;
  const onInput = () => finish('skipped');
  const onResize = () => { if (playing) { endFov = camera.fov; heroShift = vo(); pose(t); } };
  const onMotion = () => { if (live.reduceMotion.matches) finish('skipped'); };
  for (const e of EVENTS) addEventListener(e, onInput, { capture: true, passive: true });
  addEventListener('resize', onResize);
  addEventListener('room:skipintro', onInput);
  live.reduceMotion.addEventListener?.('change', onMotion);
  try { localStorage.setItem(KEY, '1'); } catch {   }
  root.dataset.intro = 'playing';
  pose(0);

  return {
    name: 'intro',
    update(dt) {
      if (!playing) return false;
      t += dt;
      cue();
      if (t >= DURATION) { finish('done'); return true; }
      pose(t);
      live.render();
      return true;
    },
    api: {
      playing: () => playing,
      elapsed: () => (playing ? t : elapsed),
      at(k) { if (!playing) return null; t = k * DURATION; pose(t); cue(); live.render(); return { t, pos: pos.toArray(), look: look.toArray(), fov: camera.fov }; },
      skip: () => finish('skipped'),
      path: () => ({ dt: DT, n: N, tPane, tau: TAU, endFix: endFix.toArray(), pts: X.map((v) => v.toArray()) }),
    },
  };
}
