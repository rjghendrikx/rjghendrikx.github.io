
const ORDER = ['c64', 'pr_xdj', 'pr_globe', 'pr_floppybox', 'pr_books', 'pr_nr200', 'pr_ledmatrix'];
const KEY = 'room.guide.v1';
const IDLE_MS = 6000;
const IN_MS = 600, BREATH_MS = 1600, BREATHS = 2, OUT_MS = 600;
const RING_MS = IN_MS + BREATHS * BREATH_MS + OUT_MS;
const PAUSE_MS = 2400;
const SESSION_RINGS = 2 * ORDER.length;
const PAD = 10;
const GAP = 8;
const TAP_PX = 6, TAP_MS = 600;

const CSS = `
.guide-ring { position: fixed; left: 0; top: 0; width: 40px; height: 40px; margin: -20px 0 0 -20px; pointer-events: none;
  z-index: 2; opacity: 0; transition: opacity ${OUT_MS}ms ease; }
.guide-ring.on { opacity: 1; transition-duration: ${IN_MS}ms; }
.guide-ring.cut { transition: none; }
.guide-ring::before { content: ""; position: absolute; inset: 0; border-radius: 50%; box-sizing: border-box;
  border: 1.5px solid rgba(227, 163, 91, .72); box-shadow: 0 0 0 3px rgba(20, 17, 15, .22), 0 0 14px rgba(227, 163, 91, .2); }
.guide-ring.on::before { animation: guide-breath ${BREATH_MS}ms ease-in-out ${IN_MS}ms ${BREATHS}; }
@keyframes guide-breath { 0%, 100% { transform: scale(1); opacity: .7; } 50% { transform: scale(1.1); opacity: 1; } }
.gate .guide-ring { display: none; }
@media (prefers-reduced-motion: reduce) { .guide-ring.on::before { animation: none; } }
`;

export default function mount(live) {
  const { camera, renderer, root, byName } = live;
  if (live.gate) return null;
  const canvas = renderer.domElement;
  const coarse = matchMedia('(pointer: coarse)');
  let done = false;
  try { done = localStorage.getItem(KEY) === '1'; } catch {   }

  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const ring = document.createElement('div');
  ring.className = 'guide-ring';
  ring.setAttribute('aria-hidden', 'true');
  document.body.appendChild(ring);

  let quiet = performance.now(), hint = null, pauseUntil = 0, next = 0, tried = 0, spent = false, rings = 0, want = false, place = null, fade = false;
  const shown = [];
  const cam = new Float64Array(16);

  function drop(cut) {
    if (!hint) return;
    hint = null;
    fade = false;
    if (cut) ring.classList.add('cut');
    ring.classList.remove('on');
  }
  function finish() {
    if (done) return;
    done = true;
    drop(true);
    try { localStorage.setItem(KEY, '1'); } catch {   }
  }
  const stir = () => { quiet = performance.now(); spent = false; tried = 0; };
  for (const ev of ['pointerdown', 'wheel', 'keydown']) addEventListener(ev, () => { stir(); drop(true); }, { passive: true, capture: true });
  addEventListener('pointermove', stir, { passive: true, capture: true });
  addEventListener('room:pick', finish);
  let down = null;
  canvas.addEventListener('pointerdown', (ev) => { down = { x: ev.clientX, y: ev.clientY, t: performance.now() }; });
  canvas.addEventListener('pointerup', (ev) => {
    if (done || !down || Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > TAP_PX || performance.now() - down.t > TAP_MS) { down = null; return; }
    down = null;
    const it = live.intent?.(ev.clientX, ev.clientY, ev.pointerType === 'touch');
    if (it && (it.pick || it.kind === 'go' || it.kind === 'act')) finish();
  });

  function still() {
    if (root.dataset.intro === 'playing' || live.moving() || !live.inRoom?.()) return false;
    const e = camera.matrixWorld.elements;
    let same = true;
    for (let i = 0; i < 16; i++) if (cam[i] !== e[i]) { same = false; cam[i] = e[i]; }
    return same;
  }
  const blocked = (hs) => !!hs.state().open || !!document.querySelector('.nav-hint.on, #work.open, .views.open, .views.more-open, .views:focus-within');
  const textBoxes = () => [...document.querySelectorAll('.caption, .views, .controls, .prompt:not([hidden]), .toast, .case:not(:empty), .cue.on, .hs-card.on')]
    .map((e) => e.getBoundingClientRect()).filter((b) => b.width && b.height);

  function choose(hs) {
    const W = innerWidth, H = innerHeight, boxes = textBoxes(), cap = Math.min(110, 0.24 * Math.min(W, H));
    while (tried < ORDER.length) {
      const name = ORDER[next];
      next = (next + 1) % ORDER.length;
      tried++;
      const node = byName(name), r = node && hs.rect(name);
      if (!r) continue;
      const w = r[2] - r[0], h = r[3] - r[1];
      if (Math.max(w, h) < 12) continue;
      const go = live.hot?.(node);
      const pts = [[0, 0], [-0.25, 0], [0.25, 0], [0, -0.25], [0, 0.25]].map(([u, v]) => [(r[0] + r[2]) / 2 + u * w, (r[1] + r[3]) / 2 + v * h]);
      const at = pts.find(([x, y]) => {
        if (x < 0 || y < 0 || x > W || y > H) return false;
        const it = live.intent?.(x, y, coarse.matches);
        return !!it && it.kind === 'go' && (it.case === go || it.id === go);
      });
      if (!at) continue;
      const d = Math.round(Math.min(cap, Math.max(36, Math.hypot(w, h) + 2 * PAD)));
      const [x, y] = at, R = d / 2 + GAP;
      if (x - R < 0 || y - R < 0 || x + R > W || y + R > H) continue;
      if (boxes.some((b) => x + R > b.left && x - R < b.right && y + R > b.top && y - R < b.bottom)) continue;
      return { name, x, y, d };
    }
    return null;
  }

  return {
    name: 'guide',
    read() {
      if (done || (!want && !hint)) return;
      const hs = window.__room?.layers?.hotspots;
      if (!hs) return;
      if (blocked(hs)) { stir(); drop(true); want = false; return; }
      if (want) {
        want = false;
        place = choose(hs);
        if (!place) spent = true;
      }
    },
    update() {
      if (done) return false;
      const now = performance.now();
      if (!still()) { quiet = now; drop(true); want = false; place = null; return false; }
      if (place) {
        const p = place;
        place = null;
        hint = { ...p, t0: now };
        rings++;
        shown.push(p.name);
        ring.classList.remove('cut');
        ring.style.width = ring.style.height = `${p.d}px`;
        ring.style.margin = `${-p.d / 2}px 0 0 ${-p.d / 2}px`;
        ring.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px)`;
        fade = true;
        return false;
      }
      if (hint) {
        if (fade) { fade = false; ring.classList.add('on'); }
        const t = now - hint.t0;
        if (t >= RING_MS - OUT_MS && ring.classList.contains('on')) ring.classList.remove('on');
        if (t >= RING_MS) { hint = null; pauseUntil = now + PAUSE_MS; }
        return false;
      }
      if (!spent && rings < SESSION_RINGS && now - quiet >= IDLE_MS && now >= pauseUntil) want = true;
      return false;
    },
    api: {
      state: () => ({ on: !!hint, name: hint?.name ?? null, x: hint?.x ?? null, y: hint?.y ?? null, d: hint?.d ?? null,
        shown: [...shown], done, spent, rings, idle: Math.round(performance.now() - quiet) }),
      timings: { IDLE_MS, IN_MS, BREATH_MS, BREATHS, OUT_MS, RING_MS, PAUSE_MS, SESSION_RINGS, ORDER },
    },
  };
}
