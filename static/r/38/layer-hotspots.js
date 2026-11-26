
import { rivulet } from './layer-rain.js';
import { C } from './content.js';

export const CAPTIONS = C.cards;

const TAP_PX = 6, TAP_MS = 600;
const HIDE_MS = 160;

const CSS = `
/* the nav itself is not clipped: the card moves into it on keyboard open and must stay visible */
.hs-nav { position: fixed; left: 0; top: 0; width: 0; height: 0; }
.hs-nav ul { list-style: none; margin: 0; padding: 0; }
.hs-sr, .hs-nav button { position: absolute; padding: 0; margin: -1px; border: 0; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.hs-dot { position: fixed; left: 0; top: 0; width: 10px; height: 10px; margin: -5px 0 0 -5px; border-radius: 50%;
  border: 1.5px solid var(--accent, #e3a35b); background: rgba(227, 163, 91, .18); pointer-events: none;
  box-shadow: 0 0 0 3px rgba(20, 17, 15, .35); opacity: 0; transition: opacity .14s ease; z-index: 3; }
.hs-dot.on { opacity: 1; }
.hs-dot.key { width: 22px; height: 22px; margin: -11px 0 0 -11px; border-width: 2px; }
.hs-card { position: fixed; left: 0; top: 0; z-index: 4; box-sizing: border-box; width: max-content; max-width: min(288px, calc(100vw - 32px));
  padding: 11px 14px 12px; border-radius: 10px; color: var(--ink, #efe6da);
  background: rgba(20, 17, 15, .82); border: 1px solid rgba(239, 230, 218, .14);
  -webkit-backdrop-filter: blur(10px) saturate(1.2); backdrop-filter: blur(10px) saturate(1.2);
  box-shadow: 0 10px 30px rgba(0, 0, 0, .35); opacity: 0; transform: translateY(3px);
  transition: opacity .14s ease, transform .14s ease; pointer-events: none; }
.hs-card.on { opacity: 1; transform: none; }
.hs-card.on.pin { pointer-events: auto; }   /* a hover card never blocks the pointer; a pinned one takes clicks */
.hs-card[hidden], .hs-card [hidden] { display: none; }
.hs-kicker { margin: 0 0 3px; font-size: 10.5px; line-height: 1.2; letter-spacing: .12em; text-transform: uppercase;
  color: var(--accent, #e3a35b); font-weight: 600; }
.hs-title { margin: 0; font: 600 15px/1.25 "Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif;
  letter-spacing: .005em; font-feature-settings: "kern", "liga", "onum"; }
.hs-body { margin: 5px 0 0; font-size: 13px; line-height: 1.45; color: var(--muted, #b9ab98); text-wrap: pretty;
  hanging-punctuation: first; font-feature-settings: "kern"; }
.hs-more { display: inline-block; margin-top: 7px; font-size: 12.5px; color: var(--ink, #efe6da); text-decoration: none;
  border-bottom: 1px solid rgba(227, 163, 91, .55); padding-bottom: 1px; }
.hs-more:hover { border-bottom-color: var(--accent, #e3a35b); }
.hs-more::after { content: " \\2197"; color: var(--accent, #e3a35b); }
.hs-more:focus-visible { outline: 2px solid var(--accent, #e3a35b); outline-offset: 2px; border-radius: 2px; }
.hs-card.peek .hs-body, .hs-card.peek .hs-more { display: none; }
.hs-card.peek { padding: 7px 11px 8px; }
.gate .hs-card, .gate .hs-dot { display: none; }
@media (prefers-reduced-motion: reduce) { .hs-card, .hs-dot { transition: none; transform: none; } }
`;

export default function mount(live) {
  const { THREE, camera, renderer, byName, scene } = live;
  if (live.gate) return null;
  const canvas = renderer.domElement;
  const isBaked = (o) => o.isMesh && o.raycast === THREE.Mesh.prototype.raycast && !o.material?.isShaderMaterial;

  const table = new Map(CAPTIONS);
  const spots = [];
  const owner = new Map();
  const glass = byName('cz_canal_night');
  function rainSpot(text) {
    if (!glass || !live.heroTarget) return null;
    glass.updateWorldMatrix(true, false);
    const rv = rivulet(glass.userData, glass.worldToLocal(live.heroTarget.clone()));
    if (!rv) return null;
    const h = rv.y1 - rv.y0;
    const box = new THREE.Box3(new THREE.Vector3(rv.x - 0.11, rv.y0 + h / 3, rv.z - 0.02), new THREE.Vector3(rv.x + 0.11, rv.y1 - h / 3, rv.z + 0.02))
      .applyMatrix4(glass.matrixWorld);
    const size = box.getSize(new THREE.Vector3());
    return { name: 'raindrop', ...text, node: null, meshes: [], box, volume: size.x * size.y * size.z,
      anchor: new THREE.Vector3((box.min.x + box.max.x) / 2, box.max.y, (box.min.z + box.max.z) / 2) };
  }
  for (const [name, entry] of CAPTIONS) {
    if (name === 'raindrop') { const s = rainSpot(entry); if (s) spots.push(s); continue; }
    const node = byName(name);
    if (!node) continue;
    const own = node.userData?.card;
    const pick = own && table.has(own) ? table.get(own) : entry;
    const text = typeof pick === 'string' ? table.get(pick) : pick;
    const meshes = [];
    node.traverse((o) => { if (isBaked(o)) meshes.push(o); });
    if (!meshes.length) continue;
    node.updateWorldMatrix(true, true);
    const box = new THREE.Box3();
    for (const m of meshes) {
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      box.union(m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld));
    }
    const size = box.getSize(new THREE.Vector3());
    const spot = { name, ...text, alias: typeof entry === 'string' ? entry : null, node, meshes, box, volume: size.x * size.y * size.z,
      anchor: new THREE.Vector3((box.min.x + box.max.x) / 2, box.max.y, (box.min.z + box.max.z) / 2) };
    for (const m of meshes) owner.set(m, spot);
    spots.push(spot);
  }
  if (!spots.length) return null;

  document.querySelector('.hs-static')?.remove();
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const nav = document.createElement('nav');
  nav.className = 'hs-nav';
  nav.setAttribute('aria-label', 'Objects in the room');
  const ul = document.createElement('ul');
  nav.appendChild(ul);
  const card = document.createElement('div');
  card.className = 'hs-card';
  card.id = 'hs-card';
  card.hidden = true;
  card.setAttribute('role', 'group');
  card.innerHTML = '<p class="hs-kicker"></p><h2 class="hs-title" id="hs-card-title"></h2><p class="hs-body"></p><a class="hs-more" target="_blank" rel="noopener"></a>';
  card.setAttribute('aria-labelledby', 'hs-card-title');
  const [kickerEl, titleEl, bodyEl, moreEl] = card.children;
  const dot = document.createElement('div');
  dot.className = 'hs-dot';
  dot.setAttribute('aria-hidden', 'true');
  for (const s of spots) {
    if (s.alias && spots.some((o) => o.name === s.alias)) continue;
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = s.title;
    b.dataset.hotspot = s.name;
    b.setAttribute('aria-expanded', 'false');
    b.setAttribute('aria-controls', 'hs-card');
    const d = document.createElement('span');
    d.className = 'hs-sr';
    d.id = `hs-desc-${s.name}`;
    d.textContent = s.body + (s.more ? ` Link: ${s.more.label}.` : '');
    b.setAttribute('aria-describedby', d.id);
    li.append(b, d);
    ul.appendChild(li);
    s.button = b;
    s.li = li;
  }
  for (const s of spots) if (!s.button) { const o = spots.find((x) => x.name === s.alias); s.button = o.button; s.li = o.li; }
  document.body.append(nav, dot, card);

  let open = null, mode = null, hideAt = 0, fadeIn = null, frameNo = 0;
  const last = { x: NaN, y: NaN, vis: null };
  const v = new THREE.Vector3();

  function show(spot, how) {
    hideAt = 0;
    if (open && open !== spot) open.button.setAttribute('aria-expanded', 'false');
    const changed = open !== spot;
    open = spot; mode = how;
    if (changed) {
      kickerEl.textContent = spot.kicker ?? '';
      kickerEl.hidden = !spot.kicker;
      titleEl.textContent = spot.title;
      bodyEl.textContent = spot.body;
      moreEl.hidden = !spot.more;
      if (spot.more) { moreEl.href = spot.more.href; moreEl.textContent = spot.more.label; }
    }
    card.classList.toggle('peek', how === 'peek');
    card.classList.toggle('pin', how === 'pinned' || how === 'key');
    dot.classList.toggle('key', how === 'peek' || how === 'key');
    spot.button.setAttribute('aria-expanded', String(how !== 'peek'));
    if (how === 'key' || how === 'peek') { if (card.parentNode !== spot.li) spot.li.appendChild(card); }
    else if (card.parentNode !== document.body) document.body.appendChild(card);
    card.hidden = false;
    if (how === 'pinned' || how === 'key') dispatchEvent(new CustomEvent('room:pick', { detail: spot.name }));
    last.x = NaN;
    fadeIn = { spot, at: frameNo };
  }

  function hide() {
    hideAt = 0;
    if (!open) return;
    open.button.setAttribute('aria-expanded', 'false');
    open = null; mode = null;
    card.classList.remove('on');
    dot.classList.remove('on', 'key');
    card.hidden = true;
  }
  const hideSoon = () => { hideAt = performance.now() + HIDE_MS; };

  let CR = null, RB = null;
  addEventListener('resize', () => { CR = null; });
  const canvasBox = () => (CR ??= canvas.getBoundingClientRect());
  const boxes = () => ({ cap: document.querySelector('.caption')?.getBoundingClientRect(),
    views: document.querySelector('.views')?.getBoundingClientRect(), w: card.offsetWidth, h: card.offsetHeight,
    kase: document.querySelector('.case:not(:empty)')?.getBoundingClientRect() });
  const rc = new THREE.Vector3();
  function rectOf(box, from = 0) {
    const r = canvasBox(), out = [Infinity, Infinity, -Infinity, -Infinity];
    const y0 = box.min.y + from * (box.max.y - box.min.y);
    for (let i = 0; i < 8; i++) {
      rc.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : y0, i & 4 ? box.max.z : box.min.z).project(camera);
      if (rc.z > 1) return null;
      const x = r.left + (rc.x + 1) / 2 * r.width, y = r.top + (1 - rc.y) / 2 * r.height;
      out[0] = Math.min(out[0], x); out[1] = Math.min(out[1], y); out[2] = Math.max(out[2], x); out[3] = Math.max(out[3], y);
    }
    return [Math.max(out[0], 0), Math.max(out[1], 0), Math.min(out[2], innerWidth), Math.min(out[3], innerHeight)];
  }
  const LUM_DIV = 8, LUM_MS = 400;
  let lum = null;
  function lumAt() {
    const key = camera.matrixWorld.elements.map((e) => e.toFixed(3)).join() + innerWidth + 'x' + innerHeight;
    if (lum && (lum.key === key || performance.now() - lum.t < LUM_MS)) return lum;
    const w = Math.max(1, Math.round(innerWidth / LUM_DIV)), h = Math.max(1, Math.round(innerHeight / LUM_DIV));
    const rt = new THREE.WebGLRenderTarget(w, h), px = new Uint8Array(w * h * 4);
    renderer.setRenderTarget(rt); renderer.render(scene, camera); renderer.setRenderTarget(null);
    renderer.readRenderTargetPixels(rt, 0, 0, w, h, px);
    rt.dispose();
    const sum = new Float64Array((w + 1) * (h + 1));
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = 4 * ((h - 1 - y) * w + x), l = (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255;
      sum[(y + 1) * (w + 1) + x + 1] = l + sum[y * (w + 1) + x + 1] + sum[(y + 1) * (w + 1) + x] - sum[y * (w + 1) + x];
    }
    lum = { key, w, h, sum, t: performance.now() };
    return lum;
  }
  function lumOf(L, [a, b, c, d]) {
    const cl = (v, n) => Math.min(n, Math.max(0, Math.round(v / LUM_DIV)));
    const x0 = cl(a, L.w), x1 = cl(c, L.w), y0 = cl(b, L.h), y1 = cl(d, L.h), W1 = L.w + 1;
    const n = (x1 - x0) * (y1 - y0);
    return n > 0 ? (L.sum[y1 * W1 + x1] - L.sum[y0 * W1 + x1] - L.sum[y1 * W1 + x0] + L.sum[y0 * W1 + x0]) / n : 0;
  }
  function position() {
    if (!open) return;
    const r = canvasBox();
    v.copy(open.anchor).project(camera);
    const behind = v.z > 1;
    let x = r.left + (v.x + 1) / 2 * r.width, y = r.top + (1 - v.y) / 2 * r.height;
    const vis = !behind && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    if (Math.abs(x - last.x) < 0.5 && Math.abs(y - last.y) < 0.5 && vis === last.vis) return;
    last.x = x; last.y = y; last.vis = vis;
    const W = innerWidth, H = innerHeight, g = 16;
    let top = g, bottom = H - g;
    const { cap, views, w, h, kase } = RB ?? boxes();
    RB = null;
    if (cap && cap.top < H / 2) top = Math.max(top, cap.bottom + 8);
    if (views && views.height) bottom = Math.min(bottom, views.top - 8);
    const R0 = rectOf(open.box), inFrame = R0 && R0[2] - R0[0] >= 8 && R0[3] - R0[1] >= 8;
    if (!vis) { x = inFrame ? (R0[0] + R0[2]) / 2 : W / 2; y = inFrame ? R0[1] : bottom; }
    const fit = ([cx, cy]) => [Math.min(Math.max(cx, g), W - g - w), Math.min(Math.max(cy, top), Math.max(top, bottom - h))];
    let [cx, cy] = fit([x - w / 2, y - 14 - h < top ? y + 14 : y - 14 - h]);
    const docked = !live.inRoom?.();
    if (inFrame || docked) {
      const R = R0 ?? [x, y, x, y], L = lumAt(), my = (R[1] + R[3]) / 2;
      const ov = ([a, b], q) => q ? Math.max(0, Math.min(a + w, q[2]) - Math.max(a, q[0])) * Math.max(0, Math.min(b + h, q[3]) - Math.max(b, q[1])) / (w * h) : 0;
      const K = kase && [kase.left - 8, kase.top - 8, kase.right + 8, kase.bottom + 8];
      const over = (f) => ov(f, R);
      const others = docked ? spots.filter((t) => t !== open).map((t) => rectOf(t.box)).filter((q) => q && q[2] - q[0] >= 8 && q[3] - q[1] >= 8) : [];
      const crowd = (f) => others.reduce((m, q) => Math.max(m, ov(f, q)), 0);
      let best = null, least = Infinity;
      const cands = docked ? [[g, top], [g, bottom - h], [W - g - w, top], [W - g - w, bottom - h]]
        : [[x - w / 2, R[1] - 14 - h], [x - w / 2, R[3] + 14], [R[2] + 14, my - h / 2], [R[0] - 14 - w, my - h / 2]];
      if (!vis && !docked) cands.push([W / 2 - w / 2, bottom - h]);
      for (const c of cands) {
        const f = fit(c), score = 2 * over(f) + 4 * ov(f, K) + crowd(f) + lumOf(L, [f[0], f[1], f[0] + w, f[1] + h]);
        if (score < least) { least = score; best = f; }
      }
      [cx, cy] = best;
    }
    card.style.transform = '';
    card.style.left = `${Math.round(cx)}px`;
    card.style.top = `${Math.round(cy)}px`;
    dot.style.display = vis ? '' : 'none';
    dot.style.left = `${x}px`;
    dot.style.top = `${y}px`;
  }

  const hitPt = new THREE.Vector3();
  function spotOf({ hit, ray }) {
    for (let o = hit?.object; o; o = o.parent) if (owner.has(o)) return owner.get(o);
    const cands = spots.filter((s) => ray.intersectBox(s.box, hitPt) && (!hit || ray.origin.distanceTo(hitPt) < hit.distance));
    return cands.length ? cands.reduce((a, b) => (b.volume < a.volume ? b : a)) : null;
  }
  const spotAt = (clientX, clientY) => spotOf(live.resolveAt(clientX, clientY));

  const onShow = (s) => { const t = document.querySelector('.case h2')?.textContent; return !!t && t === s.title && !document.querySelector('.case')?.hidden; };
  const leads = (s) => { const id = live.hot?.(s.node); return onShow(s) || (!!id && (id !== live.view() || live.cardOf?.(id) === s.name || !!live.own?.(id))); };
  let down = null;
  function hover(it, x, y, r) {
    if (mode === 'pinned' || mode === 'key') return;
    const s = spotOf(r);
    if (s && !leads(s)) show(s, 'hover'); else if (mode === 'hover') hideSoon();
  }
  canvas.addEventListener('pointerleave', () => { if (mode === 'hover') hideSoon(); });
  canvas.addEventListener('pointerdown', (ev) => { down = { x: ev.clientX, y: ev.clientY, t: performance.now() }; });
  canvas.addEventListener('pointerup', (ev) => {
    if (!down || Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > TAP_PX || performance.now() - down.t > TAP_MS) { down = null; return; }
    down = null;
    const go = window.__room?.intent?.(ev.clientX, ev.clientY, ev.pointerType === 'touch')?.kind;
    if (go === 'go' || go === 'back') { hide(); return; }
    const s = spotAt(ev.clientX, ev.clientY);
    if (s && !leads(s)) show(s, 'pinned'); else hide();
  });
  card.addEventListener('click', (ev) => { if (mode === 'pinned' && !ev.target.closest('a')) hide(); });

  ul.addEventListener('focusin', (ev) => {
    const name = ev.target.dataset?.hotspot;
    const s = name && spots.find((x) => x.name === name);
    if (s && !(open === s && mode === 'key')) show(s, 'peek');
  });
  ul.addEventListener('focusout', (ev) => {
    if (!nav.contains(ev.relatedTarget) && (mode === 'peek' || mode === 'key')) hide();
  });
  ul.addEventListener('click', (ev) => {
    const name = ev.target.closest('button')?.dataset.hotspot;
    const s = name && spots.find((x) => x.name === name);
    if (!s) return;
    const to = live.hot?.(s.node);
    if (to && leads(s)) { hide(); live.go?.(to); return; }
    if (open === s && mode === 'key') show(s, 'peek'); else show(s, 'key');
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape' || !open) return;
    const s = open;
    if (mode === 'key' && document.activeElement && nav.contains(document.activeElement)) {
      s.button.focus();
      show(s, 'peek');
    } else hide();
  });
  addEventListener('resize', () => { last.x = NaN; position(); });

  return {
    name: 'hotspots',
    hover,
    read() { RB = open ? boxes() : null; },
    update() {
      frameNo++;
      if (hideAt && performance.now() >= hideAt) hide();
      if (fadeIn && frameNo > fadeIn.at) { if (open === fadeIn.spot) { card.classList.add('on'); dot.classList.add('on'); } fadeIn = null; }
      if (open) position();
      return false;
    },
    onView() { if (mode === 'hover') hide(); },
    api: {
      list: () => spots.map((s) => s.name),
      caption: (name) => { const s = spots.find((x) => x.name === name); return s && { kicker: s.kicker, title: s.title, body: s.body, more: s.more }; },
      open: (name) => { const s = spots.find((x) => x.name === name); if (s) show(s, 'pinned'); return !!s; },
      close: hide,
      placed: () => !!open && !Number.isNaN(last.x) && !fadeIn,
      state: () => ({ open: open?.name ?? null, mode }),
      hoverable: (name) => { const s = spots.find((x) => x.name === name); return !!s && !leads(s); },
      anchors: () => {
        const r = canvas.getBoundingClientRect();
        const px = (p) => { v.copy(p).project(camera); return v.z > 1 ? null
          : { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height }; };
        return Object.fromEntries(spots.map((s) => [s.name, { anchor: px(s.anchor), center: px(s.box.getCenter(new THREE.Vector3())) }]));
      },
      boxes: () => Object.fromEntries(spots.map((s) => [s.name, s.box.getSize(new THREE.Vector3()).toArray().map((n) => +n.toFixed(3))])),
      rect: (name) => {
        const s = spots.find((x) => x.name === name), r = canvas.getBoundingClientRect();
        if (!s) return null;
        const out = [Infinity, Infinity, -Infinity, -Infinity];
        for (let i = 0; i < 8; i++) {
          v.set(i & 1 ? s.box.max.x : s.box.min.x, i & 2 ? s.box.max.y : s.box.min.y, i & 4 ? s.box.max.z : s.box.min.z).project(camera);
          if (v.z > 1) return null;
          const x = r.left + (v.x + 1) / 2 * r.width, y = r.top + (1 - v.y) / 2 * r.height;
          out[0] = Math.min(out[0], x); out[1] = Math.min(out[1], y); out[2] = Math.max(out[2], x); out[3] = Math.max(out[3], y);
        }
        return out.map(Math.round);
      },
    },
  };
}
