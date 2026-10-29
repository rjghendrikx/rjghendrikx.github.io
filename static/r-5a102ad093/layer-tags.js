// Discovery by light, not by labels (round 023 B, Ruud 2026-10-23: "ik vind die gele tags niet zo mooi, zou beter zijn als
// het zonder kan, want dat heb je in een game ook niet"). The paper tags of rounds 018-022 are gone; what they did is done
// with light. research/click-navigation.md, "The grammar", rules 1 and 9.
//
// - Hover (mouse): the object under the pointer glows (glow.js) and the cursor says what a click does (main.js CURSOR,
//   the same table as the click). No words in the scene.
// - Rest: in the room the hot objects keep a faint lift of the same warm glow (REST), weighted by the baked luminance, so
//   it shows where the lamps fall and stays out of the shadows; furniture views (table, bench, bookcase) get none, and no
//   close-up does (there the object shows its bake as it is).
// - First look (every device): the work objects glow for GAZE_MS, the touch stand-in for hover.
// - Around the corner: a view whose objects are all out of reach from the hero (the C64, the hi-fi, the poster, the
//   back of the room) gets a cue at that edge of the screen: lamp light spilling in from where the object lies, at its
//   height. One light, one place; it brightens under the pointer and a click or tap goes there (live.go).
// The names stay where they are needed and nowhere else: the cues are aria-hidden and out of the tab order, as the tags
// were; the keyboard and screen-reader roads are the Views control (main.js), the object list (layer-hotspots.js), the
// canvas's description and the no-JS #work sheet (index.html).
// Cost: DOM only, no draw calls (the rest lift rides the existing glow uniforms).

const GAZE_MS = 6500;          // the first-look glow on the work objects
const FLASH_S = 2.2, FLASH_HOLD_S = 2.4;   // s, each captioned object's first-look pulse (reduced motion: all at once, held)
const REST = 0.22;             // the hot objects' resting share of the hover glow
const NO_REST = ['table', 'bench', 'wall'];
const NO_REST_NODES = ['cloud_chamber', 'optics'];   // merge 023 action 6: no resting lift on these nodes   // furniture views: a lifted table or bookcase would read as a selection
// merge 018 action 4: a view whose clickable share of the hero frame (the click code's own grid, off the page's boxes) is
// under MIN_REACH px² gets an edge cue: a sliver at the frame edge is not a road (the desktop hi-fi was 3 cells)
const MIN_REACH = 2 * 48 * 48;
const REACH_SHARE = 0.03;      // ... or under this share of the frame, for a view none of whose objects has its centre in frame
const SAMPLE = 12;             // px, the finest step of those samples
const MASK_PX = { touch: 12, mouse: 16 };   // px, the lattice a cue's place is tested on (steals): the phone's slivers are thinner
const GAP = 8;                 // px kept between two cues, and between a cue and the page's boxes
const WORK_VIEWS = ['chamber', 'terminal', 'experiment'];
// merge 023 (panel 023 merge plan step 4): a cue is the light of what lies that way; the decks' is their own screens' cool
// glow (layer-deck.js), not the lamps' warm one
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

  // the hot nodes per view, with a world box each (baked meshes only, as layer-hotspots.js does)
  const isBaked = (o) => o.isMesh && o.raycast === THREE.Mesh.prototype.raycast && !o.material?.isShaderMaterial;
  const byView = new Map();
  for (const node of scene.children) {
    const id = live.hot(node);
    if (!id) continue;
    const box = new THREE.Box3();
    node.updateWorldMatrix(true, true);
    node.traverse((o) => { if (isBaked(o)) { if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); box.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld)); } });
    if (box.isEmpty()) continue;
    if (!byView.has(id)) byView.set(id, []);
    const mats = [];
    node.traverse((o) => { if (isBaked(o) && o.material) mats.push(o.material); });
    byView.get(id).push({ node, box, mats });
  }
  if (!byView.size) return null;
  // the resting lift is a discovery aid in the room (the hero, a standpoint, a spot walked to); in a close-up the object is
  // the subject and shows its bake as it is (the fringes on the optics card, the fidelity of each view)
  // merge 023 (panel 023 action 6, part): the resting lift stays off the instruments whose contrast is the content (the
  // chamber's plate under its tracks, the optics' screens); their hover glow is unchanged
  const restMats = [...byView].filter(([id]) => !NO_REST.includes(id)).flatMap(([, l]) => l.filter((o) => !NO_REST_NODES.includes(o.node?.name)).flatMap((o) => o.mats));
  const rest = () => live.glow?.rest?.(restMats, live.view() === home || live.inRoom?.() ? REST : 0);
  rest();

  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  // one cue per view (a view is one place to go, however many objects lead there)
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
    // a press that moved (a drag that started on the cue) is not a click (round 019). Panel 020 action 15: on touch that
    // drag orbits, as it does anywhere else on the room: past 6 px the pointer is handed to the canvas
    let press = null;
    b.addEventListener('pointerdown', (ev) => { press = [ev.clientX, ev.clientY]; });
    b.addEventListener('pointermove', (ev) => {
      if (ev.pointerType !== 'touch' || !press || Math.hypot(ev.clientX - press[0], ev.clientY - press[1]) <= 6) return;
      const [x, y] = press;
      press = null;
      if (b.hasPointerCapture(ev.pointerId)) b.releasePointerCapture(ev.pointerId);
      canvas.dispatchEvent(new PointerEvent('pointerdown', { pointerId: ev.pointerId, pointerType: 'touch', isPrimary: ev.isPrimary,
        clientX: x, clientY: y, button: 0, buttons: 1, bubbles: true, cancelable: true }));
      try { canvas.setPointerCapture(ev.pointerId); } catch { /* the pointer ended meanwhile */ }
    });
    // the cue glows its objects too, wherever they are: a hover on the light is a hover on the thing
    b.addEventListener('pointerenter', () => lit(id, true));
    b.addEventListener('pointerleave', () => { if (hoverId !== id) lit(id, false); });
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
  // the canvas box, read once per resize (merge 018 step 2)
  let R = null;
  const r = () => (R ??= canvas.getBoundingClientRect());
  addEventListener('resize', () => { R = null; });
  const toScreen = (p) => { v.copy(p).project(camera); const R = r();
    return { x: R.left + (v.x + 1) / 2 * R.width, y: R.top + (1 - v.y) / 2 * R.height, behind: v.z > 1 }; };
  const onScreen = (s, m = 8) => !s.behind && s.x > m && s.x < innerWidth - m && s.y > m && s.y < innerHeight - m;
  // the page's own boxes (caption, controls) cover part of the frame: an object under them is out of reach
  const covers = () => ['.caption', '.controls'].map((q) => document.querySelector(q)?.getBoundingClientRect()).filter((b) => b && b.width);
  const under = (s, B = covers()) => B.some((b) => s.x >= b.left && s.x <= b.right && s.y >= b.top && s.y <= b.bottom);
  // the points of a box a visitor could click: its centre, top centre and corners pulled 20% in
  const samples = (box, inset = 0.2) => {
    const c = box.getCenter(new THREE.Vector3()), out = [c, new THREE.Vector3(c.x, box.max.y, c.z)];
    for (let i = 0; i < 8; i++) out.push(new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).lerp(c, inset));
    return out;
  };
  const reach = (box) => samples(box).find((p) => { const s = toScreen(p); return onScreen(s) && !under(s); }) ?? null;
  // where the view's objects lie from here (-1 left, 1 right, 2 below the caption), for its cue; the projected box centre
  // of the object nearest the frame gives the height (behind the camera the projection mirrors: the side comes from the
  // camera's right vector)
  function edgeOf(id) {
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const list = byView.get(id) ?? [];
    if (!list.length) return null;
    const off = (o) => { const q = toScreen(o.box.getCenter(new THREE.Vector3())); return q.behind ? Infinity : Math.hypot(Math.max(0, -q.x, q.x - innerWidth), Math.max(0, -q.y, q.y - innerHeight)); };
    const first = list.reduce((a, b) => (off(b) < off(a) ? b : a));
    const c = first.box.getCenter(new THREE.Vector3()), s = toScreen(c);
    let side = c.clone().sub(camera.position).dot(right) < 0 ? -1 : 1;
    if (onScreen(s) || (!s.behind && s.x > 0 && s.x < innerWidth)) side = 2;   // in frame but out of reach, or below it
    return { side, x: s.behind ? NaN : s.x, y: s.behind ? NaN : s.y };
  }
  // where a click at (x, y) goes, by the click code itself (main.js intentAt)
  const goesTo = (x, y) => { const it = live.intent?.(x, y, coarse.matches); return it?.kind === 'go' || it?.kind === 'walk' ? it.case ?? it.id : null; };
  function grid(l, t, r2, b, f, max = 160, min = SAMPLE) {
    const w = r2 - l, h = b - t, st = Math.max(min, Math.sqrt((w * h) / max));
    for (let y = t + st / 2; y < b; y += st) for (let x = l + st / 2; x < r2; x += st) if (f(x, y, st) === false) return;
  }
  // the clickable px² of a view on screen, off the page's boxes
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
  // the cells of a cue's box where a click would reach another place (the cue would take that click): a furniture view and
  // the floor are roads with plenty of room elsewhere; an object (the projector, the laptop) or a pane (the University's,
  // a sliver on the phone hero) is not
  // Sampled on a fixed MASK px lattice and cached with the reach areas (same camera, same frame size): one raycast a lattice
  // point however many candidate places and cues test it (a fresh grid per candidate cost ~40k rays an arrival: the click
  // nav gate's camera never settled under load). The lattice is fine enough for the phone's University sliver (8 px wide)
  const lattice = new Map();
  function steals(bx, id) {
    let n = 0;
    const MASK = coarse.matches ? MASK_PX.touch : MASK_PX.mouse;
    for (let y = Math.ceil((bx.y - MASK / 2) / MASK) * MASK + MASK / 2; y < bx.y + bx.h; y += MASK)
      for (let x = Math.ceil((bx.x - MASK / 2) / MASK) * MASK + MASK / 2; x < bx.x + bx.w; x += MASK) {
        const k = `${x},${y}`;
        if (!lattice.has(k)) { const it = live.intent?.(x, y, coarse.matches); lattice.set(k, it?.kind === 'go' && !NO_REST.includes(it.id) ? it.case ?? it.id : ''); }
        const to = lattice.get(k);
        if (to && to !== id) n++;
      }
    return n;
  }

  // the page's own boxes a cue keeps clear of, read in one go before any cue is written (merge 018 step 2)
  const OBST = ['.caption', '.prompt:not([hidden])', '.case:not(:empty)', '.back:not([hidden])', '.toast', '.controls', '.views', '.nav-hint.on'];
  const obstacles = () => OBST.map((q) => document.querySelector(q)?.getBoundingClientRect()).filter((b) => b && b.width > 4)   // not the chips' 1 px clip
    .map((b) => ({ x: b.left, y: b.top, w: b.width, h: b.height }));
  const meet = (a, b, g = GAP) => a.x < b.x + b.w + g && a.x + a.w > b.x - g && a.y < b.y + b.h + g && a.y + a.h > b.y - g;
  // a cue's place: at the frame edge on its side, at its object's height, else the nearest clear height (or, below the
  // frame, the nearest clear x), clear of the page's boxes, of the cues placed so far and of what a click there reaches
  // a cue's place: at the frame edge on its side, at its object's height, else the nearest clear height (or, below the
  // frame, the nearest clear x), clear of the page's boxes and of the cues placed so far, taking no other place's click
  // (steals). A side edge with no such height (the phone's left edge: the University's pane, the projector, the laptop)
  // hands the light to the bottom edge, in the corner on that side: it still comes from that way
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
      else along(e.side, 0);   // back to the side's classes and size
    }
    t.el.classList.toggle('right', r.side === 1);
    t.el.classList.toggle('below', r.side === 2);
    t.el.style.left = `${Math.round(r.best.x)}px`;
    t.el.style.top = `${Math.round(r.best.y)}px`;
    return (t.box = r.best);
  }

  function hide(t) { t.on = false; t.el.classList.remove('on'); }
  // what a hover or the first look names glows (glow.js, a warm lift of the bake). Panel 019 action 8: a hover lights the
  // hovered object's own meshes only (the Geiger counter, never the bench under it)
  function lit(id, on, node = null) {
    if (live.glow) live.glow.set((byView.get(id) ?? []).filter((o) => !node || o.node === node).flatMap((o) => o.mats), on);
    live.render();
  }
  function hideAll() { for (const t of cues.values()) hide(t); }

  // edge cues: recomputed on arrival and resize, on the hero (and, on a phone, for the work from a walk: `only`)
  const edged = new Set();
  const areas = { key: '', v: {} };
  const edges = () => edgesFor(null);   // as a callback (rAF, an observer): never its argument
  function edgesFor(only) {
    hideAll();
    if ((only ? !live.inRoom?.() : live.view() !== home) || live.root.dataset.intro === 'playing') return;   // not from the flight's camera
    edged.clear();
    // round 020 (panel 019 action 4): the walk's standpoints (desktop) are places too: one out of reach from the hero (the
    // back of the room, behind the camera) gets the cue that points the way; on the phone the floor is that road
    for (const s of coarse.matches || only ? [] : live.stands?.() ?? []) if (!byView.has(s.id)) {
      byView.set(s.id, [{ node: null, place: true, mats: [], box: new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(s.pos.x, 0.85, s.pos.z), new THREE.Vector3(0.5, 1.7, 0.5)) }]);
      cues.set(s.id, make(s.id));
    }
    const key = `${camera.matrixWorld.elements.map((e) => e.toFixed(4))}|${innerWidth}x${innerHeight}|${covers().map((b) => b.bottom | 0)}`;
    if (areas.key !== key) { areas.key = key; areas.v = {}; lattice.clear(); }
    const area = areas.v, want = [];
    for (const id of byView.keys()) {
      if (only && !only.includes(id)) continue;
      // in reach: an object's centre in frame and clear of the page's boxes, or a real share of the frame
      const list = byView.get(id) ?? [];
      if (list.some(({ box }) => { const c = toScreen(box.getCenter(new THREE.Vector3())); return onScreen(c) && !under(c); })) continue;
      const e = edgeOf(id);
      if (!e) continue;
      const need = e.side === 2 ? MIN_REACH : Math.max(MIN_REACH, REACH_SHARE * innerWidth * innerHeight);
      area[id] ??= reachArea(id);
      if (area[id] !== null ? area[id] >= need : list.some(({ box }) => reach(box))) continue;
      want.push({ t: cues.get(id), e });
    }
    // the work first (it is always findable), then the nearer the object to the frame, the nearer its light to its height
    want.sort((a, b) => (WORK_VIEWS.includes(b.t.id) - WORK_VIEWS.includes(a.t.id)) || ((a.e.y || 0) - (b.e.y || 0)));
    const done = obstacles();
    for (const { t, e } of want) {
      t.el.classList.add('on');
      t.on = true;
      done.push(place(t, e, done));
      edged.add(t.id);
    }
  }

  // hover (mouse): the glow of where a click goes; main.js resolves the pointer once per frame and hands its intent here
  let hoverId = null, hoverNode = null;
  function hover(it) {
    const id = it.kind === 'go' ? it.case ?? it.id : null;
    const node = id ? it.node ?? null : null;
    if (id === hoverId && node === hoverNode) return;
    if (hoverId) lit(hoverId, false, hoverNode);
    hoverId = id; hoverNode = node;
    if (id) lit(id, true, node);
  }
  canvas.addEventListener('pointerleave', () => { if (hoverId) lit(hoverId, false, hoverNode); hoverId = hoverNode = null; });
  // gaze: the first look at the room shows where the work is, by its glow
  let gazeT = 0, gazed = [];
  const ungaze = () => { clearTimeout(gazeT); for (const id of gazed) if (id !== hoverId) lit(id, false); gazed = []; };
  canvas.addEventListener('pointerdown', ungaze);
  function gaze() {
    if (live.view() !== home && !live.inRoom?.()) return;   // the hero, or one of the walk's standpoints (panel 019 action 5)
    ungaze();
    gazed = WORK_VIEWS.filter((id) => (byView.get(id) ?? []).some(({ box }) => reach(box)));
    for (const id of gazed) lit(id, true);
    gazeT = setTimeout(ungaze, GAZE_MS);
  }
  // merge 023 (panel 023 action 6): the first-look pulse (layer-hotspots.js pulse()) lights the captioned objects' own
  // surfaces, staggered, for FLASH_S each; it ends without dimming what a hover or the gaze holds lit
  let flashT = [], flashed = [];
  function unflash() {
    for (const t of flashT) clearTimeout(t);
    flashT = [];
    const keep = new Set([hoverId, ...gazed].filter(Boolean).flatMap((id) => (byView.get(id) ?? []).flatMap((o) => o.mats)));
    live.glow?.set(flashed.filter((m) => !keep.has(m)), false);
    flashed = [];
  }
  function flash(list = []) {
    unflash();
    if (live.view() !== home && !live.inRoom?.()) return;
    const still = live.reduceMotion?.matches;
    let end = 0;
    for (const { mats, delay } of list) {
      end = Math.max(end, delay);
      flashT.push(setTimeout(() => { live.glow?.set(mats, true); flashed.push(...mats); }, 1000 * delay));
    }
    flashT.push(setTimeout(unflash, 1000 * (end + (still ? FLASH_HOLD_S : FLASH_S))));
  }
  canvas.addEventListener('pointerdown', unflash);   // a press or a wheel turn: the visitor has started (main.js had the dots go on 'start')
  canvas.addEventListener('wheel', unflash, { passive: true });
  // panel 019 action 8: a click that moves the camera puts the glow out first (main.js room:move); merge 021: the cues go
  // while the camera moves (a light that points the way from a frame you are leaving lies) and come back when it rests
  addEventListener('room:move', () => { hideAll(); ungaze(); unflash(); });
  addEventListener('room:drag', () => { hideAll(); unflash(); });
  addEventListener('room:still', () => { if (live.view() === home) edges(); });
  if (live.root.dataset.intro === 'playing') addEventListener('room:intro', () => setTimeout(edges, 500), { once: true });
  else setTimeout(edges, 300);
  addEventListener('resize', () => { edges(); });
  addEventListener('room:intro-prompt', () => requestAnimationFrame(edges));   // the prompt came up: clear of it
  // the case card filling on the hero is the obstacle changing: place clear again (merge 020)
  const caseEl = document.querySelector('.case');
  if (caseEl) new MutationObserver(() => edges()).observe(caseEl, { childList: true });

  return {
    name: 'tags',
    hover,
    update(dt) { if (live.glow?.tick(dt)) live.render(); return false; },
    onView(id) {
      unflash();
      rest();
      if (id === home) requestAnimationFrame(edges);
      else {
        hideAll();
        if (live.inRoom?.()) requestAnimationFrame(() => {   // a standpoint: the work in reach from here glows
          gaze();
          // merge 021 (action 4): on a phone, a walk whose frame holds no Work object still has one light on its edge
          if (coarse.matches && !gazed.length) edgesFor(WORK_VIEWS);
        });
      }
    },
    api: {
      gaze, edges, flash,
      // the views whose objects glow at full strength now (a hover, the first look): what a visitor sees light up
      lit: () => [...byView].filter(([, l]) => l.some((o) => o.mats.some((m) => m.userData.glow?.want === 1))).map(([id]) => id),
      shown: () => [...cues.values()].filter((t) => t.on).map((t) => ({ view: t.id, why: 'edge', box: (({ left, top, right, bottom }) => [left, top, right, bottom])(t.el.getBoundingClientRect()) })),
    },
  };
}
