
const FURNITURE = ['table', 'bench', 'wall'];
const MIN_REACH = 2 * 48 * 48;
const REACH_SHARE = 0.03;
const SAMPLE = 12;
const MASK_PX = { touch: 12, mouse: 16 };
const GAP = 8;
const WORK_VIEWS = ['simulations', 'terminal', 'ml'];
const CUE_RGB = { decks: '150, 200, 255' };

const CSS = `
.cue { position: fixed; left: 0; top: 0; z-index: 3; margin: 0; padding: 0; border: 0; cursor: pointer; opacity: 0;
  width: 72px; height: 128px; transition: opacity .35s ease; pointer-events: none; touch-action: none;
  --c: 255, 190, 120; background: none; }
/* merge 023 (panel 023 action 6): no orb; the target is a clear box and the only light is a hair of the lamp's colour on
   the frame edge itself, where the light comes in (a light pool on the wall or floor there is action 7, not done) */
.cue::before { content: ""; position: absolute; top: 18%; bottom: 18%; left: 0; width: 2px; border-radius: 2px;
  background: linear-gradient(rgba(var(--c), 0), rgba(var(--c), .75), rgba(var(--c), 0)); }
.cue.right::before { left: auto; right: 0; }
.cue.below::before { top: auto; bottom: 0; left: 18%; right: 18%; width: auto; height: 2px;
  background: linear-gradient(90deg, rgba(var(--c), 0), rgba(var(--c), .75), rgba(var(--c), 0)); }
.cue.below { width: 132px; height: 48px; }
.cue.on { opacity: 1; pointer-events: auto; }
.cue:hover::before, .cue:active::before { filter: brightness(1.6); }
.gate .cue { display: none; }
/* the chips are up (a keyboard visitor, or the "Views" pill): the cues (a pointer's road) step aside */
body:has(.views:focus-within) .cue, body:has(.views.open) .cue { display: none; }
@media (pointer: coarse) { .cue { width: 44px; height: 64px; } .cue.below { width: 72px; height: 44px; } }
@media (prefers-reduced-motion: reduce) { .cue { transition: none; } }
`;

export default function mount(live) {
  const { THREE, camera, renderer, scene } = live;
  if (live.gate || !live.go || !live.where) return null;
  const canvas = renderer.domElement;
  const home = live.home;

  const isBaked = (o) => o.isMesh && o.raycast === THREE.Mesh.prototype.raycast && !o.material?.isShaderMaterial;
  const byView = new Map();
  for (const node of scene.children) {
    const low = live.hot(node) ? null : live.below?.(node);
    const id = low?.id ?? live.hot(node);
    if (!id) continue;
    const box = new THREE.Box3();
    node.updateWorldMatrix(true, true);
    node.traverse((o) => { if (isBaked(o)) { if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); box.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld)); } });
    if (low) box.max.y = Math.min(box.max.y, low.y);
    if (box.isEmpty()) continue;
    if (!byView.has(id)) byView.set(id, []);
    byView.get(id).push({ node, box });
  }
  if (!byView.size) return null;
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const holder = document.createElement('div');
  holder.className = 'cues';
  document.body.appendChild(holder);
  const cues = new Map();
  for (const id of byView.keys()) cues.set(id, make(id));
  function make(id) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'cue';
    b.tabIndex = -1;
    b.setAttribute('aria-hidden', 'true');
    b.dataset.view = b.dataset.go = id;
    if (CUE_RGB[id]) b.style.setProperty('--c', CUE_RGB[id]);
    let press = null;
    b.addEventListener('pointerdown', (ev) => { press = [ev.clientX, ev.clientY]; });
    b.addEventListener('pointermove', (ev) => {
      if (ev.pointerType !== 'touch' || !press || Math.hypot(ev.clientX - press[0], ev.clientY - press[1]) <= 6) return;
      const [x, y] = press;
      press = null;
      if (b.hasPointerCapture(ev.pointerId)) b.releasePointerCapture(ev.pointerId);
      canvas.dispatchEvent(new PointerEvent('pointerdown', { pointerId: ev.pointerId, pointerType: 'touch', isPrimary: ev.isPrimary,
        clientX: x, clientY: y, button: 0, buttons: 1, bubbles: true, cancelable: true }));
      try { canvas.setPointerCapture(ev.pointerId); } catch {   }
    });
    b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const moved = press && ev.detail && Math.hypot(ev.clientX - press[0], ev.clientY - press[1]) > 6;
      press = null;
      if (moved) return;
      hideAll(); live.go(id);
    });
    holder.appendChild(b);
    return { el: b, id, on: false, box: null };
  }
  const coarse = matchMedia('(pointer: coarse)');

  const v = new THREE.Vector3();
  let R = null;
  const r = () => (R ??= canvas.getBoundingClientRect());
  addEventListener('resize', () => { R = null; });
  const toScreen = (p) => { v.copy(p).project(camera); const R = r();
    return { x: R.left + (v.x + 1) / 2 * R.width, y: R.top + (1 - v.y) / 2 * R.height, behind: v.z > 1 }; };
  const onScreen = (s, m = 8) => !s.behind && s.x > m && s.x < innerWidth - m && s.y > m && s.y < innerHeight - m;
  const covers = () => ['.caption', '.controls'].map((q) => document.querySelector(q)?.getBoundingClientRect()).filter((b) => b && b.width);
  const under = (s, B = covers()) => B.some((b) => s.x >= b.left && s.x <= b.right && s.y >= b.top && s.y <= b.bottom);
  const samples = (box, inset = 0.2) => {
    const c = box.getCenter(new THREE.Vector3()), out = [c, new THREE.Vector3(c.x, box.max.y, c.z)];
    for (let i = 0; i < 8; i++) out.push(new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).lerp(c, inset));
    return out;
  };
  const reach = (box) => samples(box).find((p) => { const s = toScreen(p); return onScreen(s) && !under(s); }) ?? null;
  function edgeOf(id) {
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const list = byView.get(id) ?? [];
    if (!list.length) return null;
    const off = (o) => { const q = toScreen(o.box.getCenter(new THREE.Vector3())); return q.behind ? Infinity : Math.hypot(Math.max(0, -q.x, q.x - innerWidth), Math.max(0, -q.y, q.y - innerHeight)); };
    const first = list.reduce((a, b) => (off(b) < off(a) ? b : a));
    const c = first.box.getCenter(new THREE.Vector3()), s = toScreen(c);
    let side = c.clone().sub(camera.position).dot(right) < 0 ? -1 : 1;
    if (onScreen(s) || (!s.behind && s.x > 0 && s.x < innerWidth)) side = 2;
    return { side, x: s.behind ? NaN : s.x, y: s.behind ? NaN : s.y };
  }
  const goesTo = (x, y) => { const it = live.intent?.(x, y, coarse.matches); return it?.kind === 'go' || it?.kind === 'walk' ? it.case ?? it.id : null; };
  function grid(l, t, r2, b, f, max = 160, min = SAMPLE) {
    const w = r2 - l, h = b - t, st = Math.max(min, Math.sqrt((w * h) / max));
    for (let y = t + st / 2; y < b; y += st) for (let x = l + st / 2; x < r2; x += st) if (f(x, y, st) === false) return;
  }
  function reachArea(id) {
    if (!live.intent) return null;
    let area = 0;
    const B = covers();
    for (const { box } of byView.get(id) ?? []) {
      const pts = samples(box, 0).map(toScreen).filter((q) => !q.behind);
      if (!pts.length) continue;
      const l = Math.max(0, Math.min(...pts.map((q) => q.x))), r2 = Math.min(innerWidth, Math.max(...pts.map((q) => q.x)));
      const t = Math.max(0, Math.min(...pts.map((q) => q.y))), b = Math.min(innerHeight, Math.max(...pts.map((q) => q.y)));
      if (r2 <= l || b <= t) continue;
      grid(l, t, r2, b, (x, y, st) => { if (!under({ x, y }, B) && goesTo(x, y) === id) area += st * st; }, 64);
    }
    return area;
  }
  const lattice = new Map();
  function steals(bx, id) {
    let n = 0;
    const MASK = coarse.matches ? MASK_PX.touch : MASK_PX.mouse;
    for (let y = Math.ceil((bx.y - MASK / 2) / MASK) * MASK + MASK / 2; y < bx.y + bx.h; y += MASK)
      for (let x = Math.ceil((bx.x - MASK / 2) / MASK) * MASK + MASK / 2; x < bx.x + bx.w; x += MASK) {
        const k = `${x},${y}`;
        if (!lattice.has(k)) { const it = live.intent?.(x, y, coarse.matches); lattice.set(k, it?.kind === 'go' && !FURNITURE.includes(it.id) ? it.case ?? it.id : ''); }
        const to = lattice.get(k);
        if (to && to !== id) n++;
      }
    return n;
  }

  const OBST = ['.caption', '.prompt:not([hidden])', '.case:not(:empty)', '.back:not([hidden])', '.toast', '.controls', '.views', '.nav-hint.on'];
  const obstacles = () => OBST.map((q) => document.querySelector(q)?.getBoundingClientRect()).filter((b) => b && b.width > 4)
    .map((b) => ({ x: b.left, y: b.top, w: b.width, h: b.height }));
  const meet = (a, b, g = GAP) => a.x < b.x + b.w + g && a.x + a.w > b.x - g && a.y < b.y + b.h + g && a.y + a.h > b.y - g;
  function place(t, e, done) {
    const free = (b) => !done.some((d) => meet(b, d));
    function along(side, want, lo, hi) {
      t.el.classList.toggle('right', side === 1);
      t.el.classList.toggle('below', side === 2);
      const w = t.el.offsetWidth, h = t.el.offsetHeight, top = 52, low = innerHeight - 16 - h;
      const at = (q) => (side === 2 ? { x: Math.min(Math.max(q - w / 2, 8), innerWidth - 8 - w), y: innerHeight - h, w, h }
        : { x: side < 0 ? 0 : innerWidth - w, y: Math.min(Math.max(q - h / 2, top), low), w, h });
      const span = side === 2 ? [Math.max(lo, 8 + w / 2), Math.min(hi, innerWidth - 8 - w / 2)] : [top + h / 2, low + h / 2];
      const qs = [];
      for (let q = span[0]; q <= span[1]; q += 12) qs.push(q);
      qs.sort((a, b) => Math.abs(a - want) - Math.abs(b - want));
      let best = null, cost = Infinity;
      for (const b of qs.map(at).filter(free)) { const c = steals(b, t.id); if (c < cost) { best = b; cost = c; } if (!c) break; }
      return { best: best ?? at(want), cost, side };
    }
    let r = e.side === 2 ? along(2, Number.isFinite(e.x) ? e.x : innerWidth / 2, 0, innerWidth)
      : along(e.side, Number.isFinite(e.y) ? e.y : innerHeight * 0.62);
    if (r.cost > 0 && e.side !== 2) {
      const c = e.side < 0 ? along(2, 0, 0, innerWidth / 2) : along(2, innerWidth, innerWidth / 2, innerWidth);
      if (c.cost < r.cost) r = c;
      else along(e.side, 0);
    }
    t.el.classList.toggle('right', r.side === 1);
    t.el.classList.toggle('below', r.side === 2);
    t.el.style.left = `${Math.round(r.best.x)}px`;
    t.el.style.top = `${Math.round(r.best.y)}px`;
    return (t.box = r.best);
  }

  function hide(t) { t.on = false; t.el.classList.remove('on'); }
  function hideAll() { for (const t of cues.values()) hide(t); }

  const edged = new Set();
  const areas = { key: '', v: {} };
  const edges = () => edgesFor(null);
  let laidAt = -1, homeAt = 0;
  function edgesFor(only) {
    hideAll();
    if ((only ? !live.inRoom?.() : live.view() !== home) || live.moving?.() || live.root.dataset.intro === 'playing') return;
    edged.clear();
    for (const s of coarse.matches || only ? [] : live.stands?.() ?? []) if (!byView.has(s.id)) {
      byView.set(s.id, [{ node: null, place: true, box: new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(s.pos.x, 0.85, s.pos.z), new THREE.Vector3(0.5, 1.7, 0.5)) }]);
      cues.set(s.id, make(s.id));
    }
    const key = `${camera.matrixWorld.elements.map((e) => e.toFixed(4))}|${innerWidth}x${innerHeight}|${covers().map((b) => b.bottom | 0)}`;
    if (areas.key !== key) { areas.key = key; areas.v = {}; lattice.clear(); }
    const area = areas.v, want = [];
    for (const id of byView.keys()) {
      if (only && !only.includes(id)) continue;
      const list = byView.get(id) ?? [];
      if (!list[0]?.place && list.some(({ box }) => { const c = toScreen(box.getCenter(new THREE.Vector3())); return onScreen(c) && !under(c); })) continue;
      const e = edgeOf(id);
      if (!e) continue;
      const need = e.side === 2 ? MIN_REACH : Math.max(MIN_REACH, REACH_SHARE * innerWidth * innerHeight);
      area[id] ??= reachArea(id);
      if (area[id] !== null ? area[id] >= need : list.some(({ box }) => reach(box))) continue;
      want.push({ t: cues.get(id), e });
    }
    want.sort((a, b) => (WORK_VIEWS.includes(b.t.id) - WORK_VIEWS.includes(a.t.id)) || ((a.e.y || 0) - (b.e.y || 0)));
    const done = obstacles();
    for (const { t, e } of want) {
      t.el.classList.add('on');
      t.on = true;
      done.push(place(t, e, done));
      edged.add(t.id);
    }
    if (!only) laidAt = performance.now();
  }

  const inReach = () => WORK_VIEWS.filter((id) => (byView.get(id) ?? []).some(({ box }) => reach(box)));
  addEventListener('room:move', hideAll);
  addEventListener('room:drag', hideAll);
  addEventListener('room:still', () => { if (live.view() === home) edges(); });
  if (live.root.dataset.intro === 'playing') addEventListener('room:intro', () => setTimeout(edges, 500), { once: true });
  else setTimeout(edges, 300);
  addEventListener('resize', () => { edges(); });
  addEventListener('room:intro-prompt', () => requestAnimationFrame(edges));
  const caseEl = document.querySelector('.case');
  if (caseEl) new MutationObserver(() => edges()).observe(caseEl, { childList: true });

  return {
    name: 'tags',
    update: () => false,
    onView(id) {
      if (id === home) { homeAt = performance.now(); requestAnimationFrame(edges); }
      else {
        hideAll();
        if (live.inRoom?.() && coarse.matches) requestAnimationFrame(() => { if (!inReach().length) edgesFor(WORK_VIEWS); });
      }
    },
    api: {
      edges,
      laid: () => laidAt >= homeAt,
      shown: () => [...cues.values()].filter((t) => t.on).map((t) => ({ view: t.id, why: 'edge', box: (({ left, top, right, bottom }) => [left, top, right, bottom])(t.el.getBoundingClientRect()) })),
    },
  };
}
