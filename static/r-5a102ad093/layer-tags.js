// Paper tags (round 18, variant C: diegetic labels). The room is the menu: no HTML navigation in the default state,
// only handwritten tags that belong to the objects. research/click-navigation.md, "The grammar".
//
// - Hover (mouse): a tag hangs next to the object under the pointer, naming where a click takes you (the view's label;
//   the work views say "Work"). Out of the window: the tag hangs at the pointer.
// - Gaze (every device): when the room is first shown, the work objects' tags hang for GAZE_MS, the touch stand-in for
//   hover; a tap on an object flies at once, no hover step.
// - Around the corner: a view whose objects are all out of frame from the hero (the C64, the hi-fi, the poster) gets a
//   tag at that edge of the screen, pointing the way; it is the only road there, so it stays while on the hero.
// Tags are clickable and go where the object goes (live.go). They are aria-hidden and out of the tab order: the
// keyboard's road is the viewpoint chips (main.js) and the object list (layer-hotspots.js).
// Cost: DOM only, no draw calls; positions are updated per frame only while a tag is up.

const GAZE_MS = 6500;          // the first-look tags, long enough to read three words twice
const EDGE_PAD = 10;           // px from the screen edge
// merge 018 action 4: a view whose clickable share of the hero frame (the click code's own grid, off the page's boxes) is
// under MIN_REACH px² gets an edge tag: a sliver at the frame edge is not a road (the desktop hi-fi was 3 cells)
const MIN_REACH = 2 * 48 * 48;
const REACH_SHARE = 0.03;      // ... or under this share of the frame, for a view none of whose objects has its centre in frame
const TILT = 12;               // px kept between a tag and another box: room for both tilts (w · sin 3.5° on a wide tag)
const SAMPLE = 12;             // px, the finest step of those samples
const WORK_VIEWS = ['chamber', 'terminal', 'experiment'];

const CSS = `
.tag { position: fixed; left: 0; top: 0; z-index: 3; margin: 0; padding: 8px; border: 0; background: none; cursor: pointer;
  font: 600 16.5px/1.1 "Bradley Hand", "Noteworthy", "Segoe Print", "Comic Neue", cursive; color: #2b2119; white-space: nowrap;
  filter: drop-shadow(0 3px 6px rgba(0, 0, 0, .45)); opacity: 0; transform: rotate(var(--r, -3deg)) translateY(3px);
  transition: opacity .18s ease, transform .18s ease; pointer-events: none; }
/* the paper; the button around it is an invisible 8 px margin that takes the click too (merge 018 action 4) */
.tag .p { position: relative; display: block; padding: 5px 11px 6px 17px; background: linear-gradient(#efe3c9, #e4d5b6);
  border-radius: 3px 9px 9px 3px; clip-path: polygon(9px 0, 100% 0, 100% 100%, 9px 100%, 0 50%); }
.tag .p::before { content: ""; position: absolute; left: 7px; top: 50%; width: 5px; height: 5px; margin-top: -2.5px; border-radius: 50%;
  background: rgba(20, 17, 15, .75); }
.tag .w { display: block; font: 700 9.5px/1 ui-sans-serif, system-ui, sans-serif; letter-spacing: .14em; text-transform: uppercase;
  color: #a4471d; margin-bottom: 2px; }
.tag .t + .t::before { content: "·"; padding: 0 .4em; color: #7a6650; }
.tag.on { opacity: 1; transform: rotate(var(--r, -3deg)); pointer-events: auto; }
.tag.edge .p { clip-path: none; border-radius: 9px; padding-left: 11px; }
.tag.edge .p::before { display: none; }
.tag:hover .p { background: linear-gradient(#f6ebd3, #ead9b7); }
.tag-line { position: fixed; left: 0; top: 0; z-index: 2; height: 1px; transform-origin: 0 50%; pointer-events: none;
  background: rgba(239, 230, 218, .7); opacity: 0; transition: opacity .18s ease; }
.tag-line.on { opacity: 1; }
.gate .tag, .gate .tag-line { display: none; }
/* a keyboard visitor has the chips up: the tags (a pointer's road) step aside */
body:has(.views:focus-within) .tag, body:has(.views:focus-within) .tag-line { display: none; }
/* touch: no invisible margin, a 44 px paper; each place on a shared edge tag is its own 44 px target. The canvas takes the
   touch (a drag that starts on a tag still turns the view) and main.js asks tapAt() where a tap on a tag goes */
@media (pointer: coarse) { .tag { font-size: 16px; padding: 0; } .tag.on { pointer-events: none; }
  .tag .p { padding-top: 8px; padding-bottom: 9px; min-height: 44px; box-sizing: border-box; }
  .tag.edge .p { padding-top: 0; padding-bottom: 0; }
  .tag.edge .t { display: inline-flex; align-items: center; min-height: 44px; } }
@media (prefers-reduced-motion: reduce) { .tag, .tag-line { transition: none; transform: rotate(var(--r, -3deg)); } }
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

  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  // one tag element per view (a view is one place to go, however many objects lead there)
  const holder = document.createElement('div');
  holder.className = 'tags';
  document.body.appendChild(holder);
  const tags = new Map();
  for (const id of byView.keys()) tags.set(id, make(id));
  for (const id of ['canal', 'university']) if (!tags.has(id) && live.label(id) !== id) tags.set(id, make(id));
  function make(id) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tag';
    b.tabIndex = -1;
    b.setAttribute('aria-hidden', 'true');
    b.dataset.view = id;
    b.innerHTML = '<span class="p"></span>';
    b.style.setProperty('--r', `${((id.length * 7) % 5) - 3.5}deg`);   // each its own small tilt, stable
    // a shared edge tag (touch: "← C64 · Hi-fi") holds one place per view: the place under the finger is where it goes
    b.addEventListener('click', (ev) => { ev.stopPropagation(); const to = ev.target.closest?.('[data-go]')?.dataset.go ?? id; hideAll(); live.go(to); });
    holder.appendChild(b);
    const line = document.createElement('div');
    line.className = 'tag-line';
    holder.appendChild(line);
    const t = { el: b, line, id, at: null, edge: null, why: null };
    text(t);
    return t;
  }
  // the tag's words: its view's label (work views with the small "Work" line), or on an edge the way to one or more views
  function text(t, ids = null, side = 0) {
    const p = t.el.firstChild;
    p.replaceChildren();
    if (!ids && WORK_VIEWS.includes(t.id)) p.appendChild(Object.assign(document.createElement('span'), { className: 'w', textContent: 'Work' }));
    for (const [i, id] of (ids ?? [t.id]).entries()) {
      const label = live.label(id);
      const word = side < 0 && i === 0 ? `← ${label}` : side === 1 && i === (ids.length - 1) ? `${label} →` : side === 2 && i === (ids.length - 1) ? `${label} ↓` : label;
      const sp = Object.assign(document.createElement('span'), { className: 't', textContent: word });
      sp.dataset.go = id;
      p.appendChild(sp);
    }
  }
  const coarse = matchMedia('(pointer: coarse)');
  const pad = () => (coarse.matches ? 0 : 8);   // the invisible margin round the paper (CSS .tag padding)

  const v = new THREE.Vector3();
  // the canvas box, read once per resize (never between a tag's writes: merge 018 step 2)
  let R = null;
  const r = () => (R ??= canvas.getBoundingClientRect());
  addEventListener('resize', () => { R = null; });
  const toScreen = (p) => { v.copy(p).project(camera); const R = r();
    return { x: R.left + (v.x + 1) / 2 * R.width, y: R.top + (1 - v.y) / 2 * R.height, behind: v.z > 1 }; };
  const onScreen = (s, m = 8) => !s.behind && s.x > m && s.x < innerWidth - m && s.y > m && s.y < innerHeight - m;
  // the anchor of a view's tag: the top middle of its biggest on-screen object
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
  function anchorOf(id) {
    let best = null, bestA = 0;
    for (const { box } of byView.get(id) ?? []) {
      const p = reach(box);
      if (!p) continue;
      const a = box.getSize(new THREE.Vector3()).length();
      if (a > bestA) { bestA = a; best = p.clone(); }
    }
    return best;
  }
  // where the view's objects lie from here (-1 left, 1 right, 2 below the caption), for its edge tag; the projected box
  // centre of the first object gives the height (behind the camera the projection mirrors: the side comes from the
  // camera's right vector)
  function edgeOf(id) {
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const first = (byView.get(id) ?? [])[0];
    if (!first) return null;
    const c = first.box.getCenter(new THREE.Vector3()), s = toScreen(c);
    let side = c.clone().sub(camera.position).dot(right) < 0 ? -1 : 1;
    if (onScreen(s) || (!s.behind && s.x > 0 && s.x < innerWidth)) side = 2;   // in frame but out of reach, or below it
    return { side, x: s.behind ? NaN : s.x, y: s.behind ? innerHeight / 2 : s.y, ay: s.behind ? NaN : s.y };
  }
  // where a click at (x, y) goes, by the click code itself (main.js intentAt): sampled only where it matters (inside a
  // view's projected boxes, inside a tag's box), never the whole frame (a full 24 px grid cost ~2 s on desktop)
  const goesTo = (x, y) => { const it = live.intent?.(x, y, coarse.matches); return it?.kind === 'go' ? it.id : null; };
  function grid(l, t, r2, b, f, max = 160) {
    const w = r2 - l, h = b - t, st = Math.max(SAMPLE, Math.sqrt((w * h) / max));
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
  // a tag's box over the window glass (a click there would go out of the window)
  function overGlass(bx) {
    let glass = false;
    grid(bx.x, bx.y, bx.x + bx.w, bx.y + bx.h, (x, y) => { const g = goesTo(x, y); if (g === 'canal' || g === 'university') { glass = true; return false; } return true; }, 40);
    return glass;
  }

  const x0 = (t) => (t.edge ? (t.edge.side < 0 ? 0 : t.edge.side === 1 ? innerWidth : t.edge.x) : toScreen(t.at).x);
  // the page's own boxes a tag keeps clear of, read in one go before any tag is written (merge 018 step 2)
  const OBST = ['.prompt:not([hidden])', '.case:not(:empty)', '.back:not([hidden])', '.toast'];
  function measure() {
    const rect = (q) => { const b = document.querySelector(q)?.getBoundingClientRect(); return b && b.width ? b : null; };
    return { cap: document.querySelector('.caption')?.getBoundingClientRect(), obst: OBST.map(rect).filter(Boolean) };
  }
  const bounds = (t, cap, h) => {
    const top = cap && cap.top < innerHeight / 2 ? cap.bottom + 10 : 16;
    const bottom = innerHeight - 16 - (cap && cap.top >= innerHeight / 2 && x0(t) < cap.right ? innerHeight - cap.top + 10 : 0);
    return [top, Math.max(top, bottom - h)];
  };
  // a string from (ax, ay) to (bx, by)
  function string(t, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    t.line.style.width = `${Math.hypot(dx, dy)}px`;
    t.line.style.transform = `translate(${ax}px, ${ay}px) rotate(${Math.atan2(dy, dx)}rad)`;
    t.line.classList.add('on');
  }
  function place(t, m = measure(), w = t.el.offsetWidth, h = t.el.offsetHeight, avoid = []) {
    const el = t.el, cap = m.cap, P = pad();
    const [top, low] = bounds(t, cap, h);
    let x, y;
    if (t.edge) {
      x = t.edge.side < 0 ? EDGE_PAD - P : t.edge.side === 1 ? innerWidth - EDGE_PAD - w + P : t.edge.x - w / 2;
      y = t.edge.side === 2 ? (cap && cap.top >= innerHeight / 2 && t.edge.x < cap.right + 20 ? cap.top - 12 - h : innerHeight - 16 - h) : t.edge.y;
    } else {
      const s = toScreen(t.at);
      x = s.x + 16 - P; y = s.y - 26 - h / 2;
      if (x + w > innerWidth - 12) x = s.x - 16 - w + P;       // no room on the right: hang on the left
    }
    y = Math.min(Math.max(y, top), low);
    x = Math.min(Math.max(x, 8 - P), innerWidth - 8 - w + P);
    // never over the page's own pills and cards, nor over another tag up at the same time: the nearest free height
    // just above or below one of them, inside the frame's band (else above the obstacle, as before)
    const boxes = [...m.obst.map((o) => [o.left, o.top, o.right, o.bottom]), ...avoid.map((o) => [o.x, o.y, o.x + o.w, o.y + o.h])];
    // TILT: the tags hang tilted (up to 3.5°), so their screen boxes are taller than their layout boxes
    const clash = (yy) => boxes.some(([l, tt, rr, bb]) => x < rr + TILT && x + w > l - TILT && yy < bb + TILT && yy + h > tt - TILT);
    if (clash(y)) {
      const c = boxes.flatMap(([, tt, , bb]) => [tt - h - TILT - 2, bb + TILT + 2]).filter((yy) => yy >= top && yy <= low && !clash(yy));
      y = c.length ? c.reduce((a, b) => (Math.abs(b - y) < Math.abs(a - y) ? b : a)) : (m.obst.find((o) => x < o.right && x + w > o.left && y < o.bottom && y + h > o.top)?.top ?? y + h + 8) - h - 8;
    }
    el.style.left = `${Math.round(x)}px`;
    el.style.top = `${Math.round(y)}px`;
    if (!t.edge) {
      const s = toScreen(t.at);
      string(t, s.x, s.y, x < s.x ? x + w - P : x + P, y + h / 2);
    } else if (t.edge.side !== 2) {
      // every edge tag hangs by its string from the frame edge on the side its object lies, at the object's height (or
      // above the tag), never floats (action 4)
      const ex = t.edge.side < 0 ? 0 : innerWidth, tx = t.edge.side < 0 ? x + P + 14 : x + w - P - 14;
      const ay = Math.max(top - 6, Math.min(Number.isFinite(t.edge.ay) ? t.edge.ay : y - 30, y + P - 14));
      string(t, ex, ay, tx, y + P);
    } else {
      string(t, x + w / 2, innerHeight, x + w / 2, y + h - P);   // below the frame: the string runs down to it
    }
    return (t.box = { x, y, w, h });
  }

  function show(id, why, at = null) {
    const t = tags.get(id);
    if (!t || id === live.view()) return;
    t.why = why; t.at = at; t.edge = null;
    t.el.classList.add('on');
    lit(id, true);
    live.render();                 // update() places it, with the frame's other reads
  }
  function hide(t) { if (t.why && t.why !== 'edge') lit(t.id, false); t.why = null; t.el.classList.remove('on'); t.line.classList.remove('on'); }
  // merge 018 step 5: what a hover or first-look tag names glows with it (glow.js, a warm lift of the bake)
  function lit(id, on) { if (live.glow) live.glow.set((byView.get(id) ?? []).flatMap((o) => o.mats), on); live.render(); }
  function hideAll(keepEdge = false) { for (const t of tags.values()) if (!(keepEdge && t.why === 'edge')) hide(t); }

  // edge tags: recomputed on arrival and resize, only on the hero
  const edged = new Set();         // the views an edge tag names (the gaze leaves them to it)
  const areas = { key: '', v: {} };
  function edges() {
    for (const t of tags.values()) if (t.why === 'edge') hide(t);
    for (const t of tags.values()) if (!t.why) { t.el.classList.remove('edge', 'left', 'right'); text(t); }
    if (live.view() !== home || live.root.dataset.intro === 'playing') return;   // not from the flight's camera
    edged.clear();
    // the areas hold while the camera and the frame do (edges() runs on arrival, at the first-look pulse and on resize)
    const key = `${camera.matrixWorld.elements.map((e) => e.toFixed(4))}|${innerWidth}x${innerHeight}|${covers().map((b) => b.bottom | 0)}`;
    if (areas.key !== key) { areas.key = key; areas.v = {}; }
    const area = areas.v;
    const per = { [-1]: [], [1]: [], [2]: [] };
    for (const id of byView.keys()) {
      // in reach: an object's centre in frame and clear of the page's boxes (a small object on the bench is found by its
      // glow and its tag), or a real share of the frame (the clickable px² of the click code's own grid); without the grid,
      // any sample point of an object
      const list = byView.get(id) ?? [];
      if (list.some(({ box }) => { const c = toScreen(box.getCenter(new THREE.Vector3())); return onScreen(c) && !under(c); })) continue;
      const e = edgeOf(id);
      if (!e) continue;
      // off frame (left, right): a sliver at the edge is no road; in frame under the caption (below): a real patch is
      const need = e.side === 2 ? MIN_REACH : Math.max(MIN_REACH, REACH_SHARE * innerWidth * innerHeight);
      area[id] ??= reachArea(id);
      if (area[id] !== null ? area[id] >= need : list.some(({ box }) => reach(box))) continue;
      per[e.side].push({ t: tags.get(id), e });
    }
    const m = measure();
    const busy = [];
    for (const [, list] of byView) for (const { box } of list) {
      const pts = samples(box, 0).map(toScreen).filter((q) => onScreen(q, 0) && !under(q));
      if (pts.length) busy.push([Math.min(...pts.map((q) => q.x)), Math.min(...pts.map((q) => q.y)), Math.max(...pts.map((q) => q.x)), Math.max(...pts.map((q) => q.y))]);
    }
    const near = (a, b, g = 6) => a.x < b[2] + g && a.x + a.w > b[0] - g && a.y < b[3] + g && a.y + a.h > b[1] - g;
    const hits = (b) => busy.some((q) => near(b, q));
    const done = [];                 // every side's tags placed so far: no two meet (a long shared tag on a phone)
    for (const side of [-1, 1, 2]) {
      let list = per[side];
      if (!list.length) continue;
      // touch: one edge tag per side, the nearer view's, naming every view that way ("← C64 · Hi-fi"), one place each
      if (coarse.matches && list.length > 1) {
        const dist = (q) => (side < 0 ? -q.e.x : side === 1 ? q.e.x : -q.e.y);
        list.sort((a, b) => (Number.isFinite(dist(a)) ? dist(a) : 1e9) - (Number.isFinite(dist(b)) ? dist(b) : 1e9));
        list = [{ t: list[0].t, e: list[0].e, ids: list.map((q) => q.t.id) }];
      }
      for (const q of list) {
        const t = q.t;
        for (const id of q.ids ?? [t.id]) { const o = tags.get(id); if (o.why && o.why !== 'edge') hide(o); }   // a first-look tag gives way
        t.why = 'edge'; t.edge = { ...q.e }; t.at = null;
        t.el.classList.add('edge', side < 0 ? 'left' : 'right', 'on');
        text(t, q.ids ?? [t.id], side);
        for (const id of q.ids ?? [t.id]) edged.add(id);
      }
      if (side === 2) {   // below: in a row, in their projected order
        let right = -Infinity;
        for (const { t } of list.sort((a, b) => a.e.x - b.e.x)) { let b = place(t, m, undefined, undefined, done); if (b.x < right) { t.edge.x += right - b.x; b = place(t, m, undefined, undefined, done); } right = Math.max(b.x, right) + b.w + 8; done.push(b); }
        continue;
      }
      for (const { t } of list.sort((a, b) => a.e.y - b.e.y)) {
        const h = t.el.offsetHeight;
        if (coarse.matches) {
          // touch: vertically centred below the header, then clear of the window glass and of what a finger can tap
          const [top, low] = bounds(t, m.cap, h);
          t.edge.y = (top + low) / 2;
          let b = place(t, m, undefined, undefined, done);
          for (let k = 0; k < 30 && overGlass(b) && b.y < low; k++) { t.edge.y = b.y + 12; b = place(t, m, undefined, undefined, done); }
          for (let k = 0; k < 60 && hits(b) && b.y < low; k++) {
            t.edge.y = b.y + 8;
            const nb = place(t, m, undefined, undefined, done);
            if (nb.y <= b.y) break;             // an obstacle (a pill, the toast) holds it: stay above the object instead
            b = nb;
          }
          done.push(b);
          continue;
        }
        // mouse: at the object's height, climbing until clear of what a visitor can click here and of each other
        let b = place(t, m);
        const clash = (q) => hits(q) || done.some((d) => near(q, [d.x, d.y, d.x + d.w, d.y + d.h], TILT));
        for (let k = 0; k < 120 && clash(b); k++) { t.edge.y = b.y - 8; const nb = place(t, m); if (nb.y === b.y) break; b = nb; }
        if (clash(b)) { t.edge.y = Math.max(...done.map((d) => d.y + d.h + 10), b.y); b = place(t, m); }   // stuck at the top
        done.push(b);
      }
    }
  }

  // hover (mouse): the tag of where a click goes; main.js resolves the pointer once per frame and hands its intent here
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let hoverId = null;
  function hover(it, x, y) {
    const id = it.kind === 'go' ? it.id : null;
    if (id === hoverId) return;
    if (hoverId && tags.get(hoverId)?.why === 'hover') hide(tags.get(hoverId));
    hoverId = id;
    if (!id || tags.get(id)?.why === 'edge') return;
    // the window has no object: the tag hangs where the pointer is, on the glass
    const at = it.node ? anchorOf(id) : (() => { const B = r(); ndc.set(((x - B.left) / B.width) * 2 - 1, -((y - B.top) / B.height) * 2 + 1);
      ray.setFromCamera(ndc, camera); return ray.ray.at(3, new THREE.Vector3()); })();
    if (at) show(id, 'hover', at);
  }
  canvas.addEventListener('pointerleave', () => { if (hoverId && tags.get(hoverId)?.why === 'hover') hide(tags.get(hoverId)); hoverId = null; });
  canvas.addEventListener('pointerdown', (ev) => { if (tagAt(ev.clientX, ev.clientY)) return; for (const t of tags.values()) if (t.why === 'gaze') hide(t); });

  // touch: the view a tap at (x, y) on a tag goes to (each place of a shared edge tag its own), or null
  function tagAt(x, y) {
    if (!coarse.matches) return null;
    for (const t of tags.values()) {
      if (!t.why) continue;
      for (const e of [...t.el.querySelectorAll('[data-go]'), t.el]) {
        const b = e.getBoundingClientRect();
        if (x >= b.left && x <= b.right && y >= b.top && y <= b.bottom) return e.dataset.go ?? t.id;
      }
    }
    return null;
  }

  // gaze: the first look at the room shows where the work is
  let gazeT = 0;
  function gaze() {
    if (live.view() !== home) return;
    clearTimeout(gazeT);
    for (const id of WORK_VIEWS) { const at = anchorOf(id); if (at && !edged.has(id)) show(id, 'gaze', at); }
    gazeT = setTimeout(() => { for (const t of tags.values()) if (t.why === 'gaze') hide(t); }, GAZE_MS);
  }
  // the edges at once (the only road to what is out of frame); the gaze comes with main.js's first-look glow (pulse)
  if (live.root.dataset.intro === 'playing') addEventListener('room:intro', () => setTimeout(edges, 500), { once: true });
  else setTimeout(edges, 300);
  addEventListener('resize', () => { edges(); });
  addEventListener('room:intro-prompt', () => requestAnimationFrame(edges));   // the prompt pill came up: hang clear of it

  return {
    name: 'tags',
    hover,
    update(dt) {
      if (live.glow?.tick(dt)) live.render();
      const up = [...tags.values()].filter((t) => t.why && t.why !== 'edge');
      if (!up.length) return false;
      // every read first (the page's boxes, each tag's size), then the writes: no forced layout per tag
      const m = measure(), size = up.map((t) => [t.el.offsetWidth, t.el.offsetHeight]);
      const edge = [...tags.values()].filter((t) => t.why === 'edge').map((t) => t.box).filter(Boolean);
      const done = [...edge];
      up.forEach((t, i) => done.push(place(t, m, ...size[i], done)));
      return false;
    },
    onView(id) {
      for (const t of tags.values()) if (t.why !== 'edge' || id !== home) hide(t);
      for (const t of tags.values()) if (!t.why) { t.el.classList.remove('edge', 'left', 'right'); text(t); }
      if (id === home) requestAnimationFrame(edges);
    },
    // touch: the view a tap at (x, y) on a tag goes to (each place of a shared edge tag its own), or null
    tapAt(x, y) { const id = tagAt(x, y); if (id) hideAll(); return id; },
    api: {
      gaze, edges, tagAt,
      shown: () => [...tags.values()].filter((t) => t.why).map((t) => ({ view: t.id, why: t.why, box: (({ left, top, right, bottom }) => [left, top, right, bottom])(t.el.getBoundingClientRect()) })),
    },
  };
}
