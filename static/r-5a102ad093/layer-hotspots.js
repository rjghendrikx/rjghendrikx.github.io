// Interaction layer: the room as a portfolio. Hover (mouse) or tap (touch) an object and a small
// caption card appears, anchored to it; Tab walks the objects, Enter opens, Esc closes.
//
// Captions are keyed by node NAME (CAPTIONS below; the draft copy and its sources are in
// notes/captions.md). A name that is not in the scene is skipped, so one table serves every layout.
//
// Cost: nothing per frame while no card is open (update() returns at once). No raycast of its own
// (panel 019 action 10): the hover reuses main.js's one resolve per frame (hover(it, x, y, r)), a
// tap resolves once; the first baked surface names the spot, else the smallest spot box (made once
// at mount from the baked meshes) the ray enters in front of it (thin things like the TI-83).
// No WebGL draw calls added.
// main.js keeps its own picks (Geiger toggle, eraser): this layer never stops their events.
//
// A11y: a nav of real buttons (visually hidden, the marker on the object is the focus ring), each
// described by the caption text, so a screen reader gets every caption without opening anything.
// The no-JS version of the list belongs in index.html (notes/captions.md, "No-JS list").

// Story order: this is also the Tab order. kicker = small caps line, more = { href, label } (real URLs only).
import { rivulet } from './layer-rain.js';

export const CAPTIONS = [
  ['c64', { kicker: 'Where it started', title: 'Commodore 64',
    body: 'His first programs, in BASIC. The room you are looking at is a program too: Python driving Blender, one module per object.' }],
  ['ti83', { kicker: 'Then', title: 'TI-83',
    body: 'The graphing calculator he learned to program on, one 96 × 64 pixel screen at a time.' }],
  ['optics', { kicker: 'The lab years', title: 'Quantum eraser, classical version',
    body: 'Crossed polarizers on the two slits mark the path, so no fringes. Drop the polarizer into the beam at 45° and they come back. The quantum version needs entangled photons; this one is plain polarization optics.',
    more: { href: 'https://doi.org/10.1038/srep20834', label: 'His 2D spectroscopy paper' } }],
  ['cloud_chamber', { kicker: 'Cosmic rays · live', title: 'Cloud chamber',
    body: 'Dry ice, isopropanol, a cold black plate. At sea level a cosmic-ray muon crosses each square centimetre about once a minute: several a second through this plate. The vapour shows the ones it catches: steep ones as short stubs, shallow ones as long lines, the odd fat alpha and a curling beta. The flux is real, the tracks are simulated.' }],
  ['geiger', { kicker: 'Background · live', title: 'Geiger counter',
    body: 'An SBM-20 tube at background: about 20 counts a minute, Poisson-timed. The rate is real, the counts are simulated. Flip the toggle to hear it.' }],
  // [check] panel 015 action 12: the sweep in numbers
  ['scope', { kicker: 'Pulses · live', title: 'Oscilloscope',
    body: 'Its probe is hooked onto the Geiger counter’s test point. Each count is one 0.5 ms sweep at 50 µs/div: a negative spike that recovers in ~50 µs, a P31 glow gone in ~50 ms. One instrument reads the other.' }],
  // [check] panel 015 action 1: the room has no camera, so the stripes label points, they do not range them
  ['projector', { kicker: 'An object shows its own measurement', title: 'Structured light',
    body: 'Gray-code stripes label every point with a projector column and row; the camera beside the lens reads each label and triangulates the depth. Then the scanned object becomes its own point cloud.' }],   // [check] wave 5 P2
  // [check] wave 5 P2: the head that replaced the vase in the canal house
  ['plato', { kicker: 'Plato’s cave · projection mapping', title: 'Plato',
    body: 'A plaster cast of Plato’s head, scanned by the SMK in Copenhagen and in the public domain. In his cave, prisoners take shadows thrown on a wall for the real thing: projection, 2,400 years early. He mapped light onto festival stages with Resolume and MadMapper; here the projector first measures the head, then paints it.',
    more: { href: 'https://open.smk.dk/artwork/image/KAS2111', label: 'The cast at SMK' } }],
  ['amp', { kicker: 'Listening corner', title: 'Luxman L-308',
    body: 'His own amplifier, last box in a chain he can name from library to speaker cone. The real one has no meters, so neither does this one.' }],
  ['pr_dm603', { kicker: 'Listening corner', title: 'B&W DM603',
    body: 'Three-way floorstanders with the yellow Kevlar midrange B&W is known for. Around 90 dB sensitive: an easy load for the Luxman.' }],
  ['pr_ifi', { kicker: 'Listening corner', title: 'iFi NEO iDSD 2',
    body: 'The DAC. Music reaches it upsampled to DSD256, and the display reads 11M when it locks.' }],
  ['pr_hd660', { kicker: 'Listening corner', title: 'Sennheiser HD 660S2',
    body: 'Open-back, 300 Ω, driven straight from the NEO iDSD 2. The quiet half of the chain.' }],
  ['bookshelf', { kicker: 'Reading', title: 'The shelf',
    body: 'McGilchrist, Abram, Lane, Koch, Kastrup, Faggin, and a binder of Levin papers: the thinkers he keeps whole collections of notes on.' }],
  ['cz_bookcase', 'bookshelf'],
  ['pr_brain', { kicker: 'Reading', title: 'Two hemispheres',
    body: 'McGilchrist’s claim is not left-logic, right-creativity. It is about attention: each half attends differently, and so brings forth a different world.' }],
  ['pr_4004', { kicker: 'Reading', title: 'Intel 4004',
    body: 'The first commercial microprocessor, 1971, designed by Federico Faggin, who later concluded that consciousness cannot be computed. Syntax is not semantics.' }],
  ['pr_perfume', { kicker: 'Reading', title: 'Perfume',
    body: 'Luca Turin’s idea: the nose reads molecular vibrations, not shapes. Smell as spectroscopy. Not proven, not refuted.' }],
  ['pr_ventjar', { kicker: 'Reading', title: 'Vent rock',
    body: 'Nick Lane’s case for where life began: alkaline vents, where a proton gradient across thin mineral walls does for free what every cell still does.' }],
  ['pr_prism', { kicker: 'Light', title: 'Prism',
    body: 'White light, taken apart. Every spectrometer since Newton’s does a version of this.' }],
  ['pr_ledmatrix', { kicker: 'Light', title: 'LED matrix',
    body: 'A grid of squares, each with a live alpha: the core of his Metal visuals engine, the successor to an old Quartz Composer workflow for TVs and LED walls.' }],
  ['pr_3090', { kicker: 'Now', title: 'RTX 3090',
    body: '24 GB of GPU on his own hardware: open models driving an agent harness, for cheap loops, private code and offline work.' }],
  ['pr_wheel', { kicker: 'Now', title: 'Bicycle wheel',
    body: 'Jobs called the computer a bicycle for the mind. The metaphor assumes the human still pedals; with agents that is a choice. He means to keep pedalling.' }],
  ['pr_climb', { kicker: 'Off the bench', title: 'Climbing shoes',
    body: 'Yellow and black barefoot climbing shoes. Bouldering: a puzzle you solve with your body.' }],
  ['pr_poster_action', { kicker: 'How the intro flew', title: 'The principle of least action',
    body: 'Every path between two points gets one number, the action S = ∫L dt with L = T − V. Vary the path, q → q + εη with η zero at both ends, and ask that S does not change to first order, δS = 0. Integrate by parts: the boundary term vanishes and the Euler–Lagrange equation is left, d/dt ∂L/∂q̇ − ∂L/∂q = 0, which for L = ½mq̇² − V is F = ma. With p = ∂L/∂q̇ and H = Σ pq̇ − L, write S = ∫(Σ pq̇ − H) dt and vary q and p independently: integrating the p δq̇ term by parts gives Hamilton\'s equations, q̇ = ∂H/∂p and ṗ = −∂H/∂q. Why stationary? Feynman: every path counts, with a phase e^{iS/ħ}; near δS = 0 the phases agree and add up, elsewhere they cancel. The camera that brought you in rode such a path: a bead on a wire along its route, through an invented landscape. After a lecture by Erik Verlinde (University of Amsterdam). Sources: Goldstein, Poole & Safko, Classical Mechanics, 3rd ed., ch. 2 and §8.5; Feynman Lectures on Physics, Vol. II, ch. 19; Thornton & Marion, Classical Dynamics, 5th ed., ch. 7; Cline, Variational Principles in Classical Mechanics, ch. 9.',
    more: { href: 'https://arxiv.org/abs/1001.0785', label: 'Verlinde: F = ma from entropy' } }],
  // [check] 019 action 16, the raindrop named (Ruud's ask, 2026-10-22; David Abram's Sensing talk, the-body-knew-first
  // notes): no node; one rivulet on the hero pane (layer-rain.js rivulet()) is its spot. In the canal view it is the card
  ['raindrop', { kicker: 'At the window', title: 'A drop on the glass',
    body: 'Watch a drop run down the glass. No model predicts whether it swerves left or right. Not chaos: wild. Out of our control, not out of order. (David Abram, The Spell of the Sensuous, on the shelf.)' }],
];

const TAP_PX = 6, TAP_MS = 600;   // main.js's click rule: a press that hardly moved
const HIDE_MS = 160;              // grace before a hover card goes, so it does not flicker between parts

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
/* the first-view pulse ("click anything that glows"): one soft warm glow per object cluster, no ring outline,
   staggered left to right (pulse() sets the delay) */
.hs-glow { position: fixed; left: 0; top: 0; width: 52px; height: 52px; margin: -26px 0 0 -26px; border-radius: 50%; pointer-events: none; z-index: 2;
  background: radial-gradient(closest-side, rgba(255, 214, 150, .82), rgba(227, 163, 91, .36) 50%, rgba(227, 163, 91, 0));
  opacity: 0; animation: hs-glow 2.2s ease-in-out 1 both; }
@keyframes hs-glow { 0% { opacity: 0; transform: scale(.7); } 35% { opacity: 1; transform: scale(1); } 100% { opacity: 0; transform: scale(1.1); } }
.gate .hs-card, .gate .hs-dot, .gate .hs-glow { display: none; }
@media (prefers-reduced-motion: reduce) { .hs-card, .hs-dot { transition: none; transform: none; }
  .hs-glow { animation: none; opacity: .85; } }
`;

export default function mount(live) {
  const { THREE, camera, renderer, byName } = live;
  if (live.gate) return null;            // the gates measure the bake alone: no DOM, no listeners
  const canvas = renderer.domElement;
  const isBaked = (o) => o.isMesh && o.raycast === THREE.Mesh.prototype.raycast && !o.material?.isShaderMaterial;

  // Hotspots: one world box per present object, from its own baked meshes (not setFromObject: that
  // would count layer visuals such as the beam, the glass or the point cloud).
  const table = new Map(CAPTIONS);
  const spots = [];
  const owner = new Map();               // mesh -> spot
  // 019 action 16: the raindrop's spot, a box round one rivulet's trail on the pane the hero looks at: 0.22 m across (about
  // 50 px on the 1440 hero), the middle third of the pane's height, 2 cm either side of the glass
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
    const text = typeof entry === 'string' ? table.get(entry) : entry;
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
    const spot = { name, ...text, node, meshes, box, volume: size.x * size.y * size.z,
      anchor: new THREE.Vector3((box.min.x + box.max.x) / 2, box.max.y, (box.min.z + box.max.z) / 2) };
    for (const m of meshes) owner.set(m, spot);
    spots.push(spot);
  }
  if (!spots.length) return null;

  // DOM: styles, the screen-reader list, one card, one marker. A static no-JS list in index.html
  // (.hs-static, notes/captions.md) gives way to this one; without WebGL it stays.
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
  document.body.append(nav, dot, card);

  // State: which spot, and how it was opened. hover/peek close on their own; pinned/key wait for Esc
  // or a tap elsewhere. peek = keyboard focus, title only; key = Enter, the full card.
  let open = null, mode = null, hideTimer = 0;
  const last = { x: NaN, y: NaN, vis: null };
  const v = new THREE.Vector3();

  function show(spot, how) {
    clearTimeout(hideTimer);
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
    // keyboard: the card sits right after its button, so Tab reaches the link next
    if (how === 'key' || how === 'peek') { if (card.parentNode !== spot.li) spot.li.appendChild(card); }
    else if (card.parentNode !== document.body) document.body.appendChild(card);
    card.hidden = false;
    if (how === 'pinned' || how === 'key') dispatchEvent(new CustomEvent('room:pick', { detail: spot.name }));
    last.x = NaN;                       // update() places it next frame, from read()'s boxes (no forced layout)
    requestAnimationFrame(() => { if (open === spot) { card.classList.add('on'); dot.classList.add('on'); } });
  }

  function hide() {
    clearTimeout(hideTimer);
    if (!open) return;
    open.button.setAttribute('aria-expanded', 'false');
    open = null; mode = null;
    card.classList.remove('on');
    dot.classList.remove('on', 'key');
    card.hidden = true;
  }
  const hideSoon = () => { clearTimeout(hideTimer); hideTimer = setTimeout(hide, HIDE_MS); };

  // Place the card above the anchor (below if there is no room), clamped to a 16 px gutter and kept
  // off the page caption (top on phones) and the viewpoint strip (bottom).
  // panel 018 action 7: the boxes it needs, read by read() at the start of the frame (main.js: every read() before any
  // layer writes), or here when called outside the frame (resize)
  let CR = null, RB = null;
  addEventListener('resize', () => { CR = null; });
  const canvasBox = () => (CR ??= canvas.getBoundingClientRect());
  const boxes = () => ({ cap: document.querySelector('.caption')?.getBoundingClientRect(),
    views: document.querySelector('.views')?.getBoundingClientRect(), w: card.offsetWidth, h: card.offsetHeight });
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
    const { cap, views, w, h } = RB ?? boxes();
    RB = null;
    if (cap && cap.top < H / 2) top = Math.max(top, cap.bottom + 8);
    if (views && views.height) bottom = Math.min(bottom, views.top - 8);
    if (!vis) { x = W / 2; y = bottom; }             // off-screen at this viewpoint: rest above the strip
    let cy = y - 14 - h;
    if (cy < top) cy = y + 14;
    cy = Math.min(Math.max(cy, top), Math.max(top, bottom - h));
    const cx = Math.min(Math.max(x - w / 2, g), W - g - w);
    card.style.transform = '';
    card.style.left = `${Math.round(cx)}px`;
    card.style.top = `${Math.round(cy)}px`;
    dot.style.display = vis ? '' : 'none';
    dot.style.left = `${x}px`;
    dot.style.top = `${y}px`;
  }

  // Hit test (panel 019 action 10): main.js's one resolve (resolveAt, its fast raycaster), no second raycast here. The
  // first baked surface names its spot through `owner` (a split part through its parents); where that surface is no
  // spot's, a spot whose box the ray enters in front of it still counts, the smallest (the TI-83 behind its own slop).
  const hitPt = new THREE.Vector3();
  function spotOf({ hit, ray }) {
    for (let o = hit?.object; o; o = o.parent) if (owner.has(o)) return owner.get(o);
    const cands = spots.filter((s) => ray.intersectBox(s.box, hitPt) && (!hit || ray.origin.distanceTo(hitPt) < hit.distance));
    return cands.length ? cands.reduce((a, b) => (b.volume < a.volume ? b : a)) : null;
  }
  const spotAt = (clientX, clientY) => spotOf(live.resolveAt(clientX, clientY));

  // round 18 C: an object that leads to another view shows its paper tag (layer-tags.js) and flies on a click; its card
  // belongs to its own view, where hovering it shows the card
  // merge 018 step 3: in its own view the object's caption is the case card (main.js), so no hover card there either
  const leads = (s) => { const id = live.hot?.(s.node); return !!id && (id !== live.view() || live.cardOf?.(id) === s.name); };
  // Pointer: hover for a mouse, tap (or click) to pin; never stops main.js's own picks.
  let down = null;
  // hover: main.js's pointermove resolves once per frame (none while the camera flies) and calls hover() with it
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
    // a click that moves the camera (another view, or back to the room from a close-up) pins no card: it would ride along
    const go = window.__room?.intent?.(ev.clientX, ev.clientY, ev.pointerType === 'touch')?.kind;
    if (go === 'go' || go === 'back') { hide(); return; }
    const s = spotAt(ev.clientX, ev.clientY);
    if (s && !leads(s)) show(s, 'pinned'); else hide();
  });
  card.addEventListener('click', (ev) => { if (mode === 'pinned' && !ev.target.closest('a')) hide(); });   // tap the card to dismiss it

  // Keyboard: focus peeks (marker + title), Enter/click opens the card, Esc closes it.
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
      if (open) position();             // follow the camera; DOM only, no WebGL frame needed
      return false;
    },
    onView() { if (mode === 'hover') hide(); document.querySelectorAll('.hs-glow').forEach((e) => e.remove()); },
    api: {
      list: () => spots.map((s) => s.name),
      // merge 018 step 3 (from A): a caption as data, for the case card of a view that has no case of its own
      caption: (name) => { const s = spots.find((x) => x.name === name); return s && { kicker: s.kicker, title: s.title, body: s.body, more: s.more }; },
      open: (name) => { const s = spots.find((x) => x.name === name); if (s) show(s, 'pinned'); return !!s; },
      close: hide,
      // glow on the captioned objects in view (the box centre), once: at most one per cluster (objects whose centres
      // lie within GLOW_GAP px; the biggest stands for its neighbours), staggered left to right over GLOW_SPREAD s.
      // Reduced motion: all at once, no animation, gone after GLOW_HOLD. Returns how many glowed.
      pulse() {
        document.querySelectorAll('.hs-glow').forEach((e) => e.remove());
        const r = canvas.getBoundingClientRect();
        const GLOW_GAP = Math.max(64, Math.min(r.width, r.height) * 0.12), GLOW_SPREAD = 2.0, GLOW_DUR = 2.2, GLOW_HOLD = 2.4;
        const seen = [];
        for (const s of spots) {
          v.copy(s.box.getCenter(new THREE.Vector3())).project(camera);
          const x = r.left + (v.x + 1) / 2 * r.width, y = r.top + (1 - v.y) / 2 * r.height;
          if (v.z > 1 || x < r.left + 8 || x > r.right - 8 || y < r.top + 8 || y > r.bottom - 8) continue;
          seen.push({ x, y, vol: s.volume });
        }
        const kept = [];
        for (const p of seen.sort((a, b) => b.vol - a.vol)) {
          if (!kept.some((k) => Math.hypot(k.x - p.x, k.y - p.y) < GLOW_GAP)) kept.push(p);
        }
        kept.sort((a, b) => a.x - b.x);
        const still = live.reduceMotion.matches;
        const x0 = kept[0]?.x ?? 0, span = Math.max(1, (kept.at(-1)?.x ?? 0) - x0);
        for (const p of kept) {
          const delay = still ? 0 : GLOW_SPREAD * (p.x - x0) / span;
          const g = document.createElement('div');
          g.className = 'hs-glow';
          g.setAttribute('aria-hidden', 'true');
          g.style.left = `${p.x}px`; g.style.top = `${p.y}px`;
          g.style.animationDelay = `${delay.toFixed(2)}s`;
          document.body.appendChild(g);
          setTimeout(() => g.remove(), 1000 * (still ? GLOW_HOLD : delay + GLOW_DUR) + 100);
        }
        return kept.length;
      },
      state: () => ({ open: open?.name ?? null, mode }),
      // screen px of each hotspot's anchor and box centre, for tests (null if off-screen)
      anchors: () => {
        const r = canvas.getBoundingClientRect();
        const px = (p) => { v.copy(p).project(camera); return v.z > 1 ? null
          : { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height }; };
        return Object.fromEntries(spots.map((s) => [s.name, { anchor: px(s.anchor), center: px(s.box.getCenter(new THREE.Vector3())) }]));
      },
      boxes: () => Object.fromEntries(spots.map((s) => [s.name, s.box.getSize(new THREE.Vector3()).toArray().map((n) => +n.toFixed(3))])),
      // a spot's box on screen, CSS px [left, top, right, bottom] (the raindrop's >= 44 px check), or null if behind
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
