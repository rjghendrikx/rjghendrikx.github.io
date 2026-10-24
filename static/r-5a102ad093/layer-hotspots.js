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
  // [check] round 021 A, the bench (vault profile.md: measure before you believe, and label how sure you are). Sources:
  // areas/car/notes/zda48-tuning.md (the three labels), areas/hifi/notes/power-supply-and-mains.md (the ripple test),
  // areas/hifi/notes/2026-06-19-dsd-cold-start-mute.md ("not intermittent: deterministic on every cold open")
  // merge 021 (panel 021 action 8): three lines; the ripple figure as on the page and in the source (8-13 mV pp on the
  // OWON handheld, on battery), the cold mute's scope as the 2026-07-09 finding has it (the next start after an album ran out)
  ['pr_notebook', { kicker: 'The bench · how sure', title: 'Lab notebook',
    body: 'Every line ends in one of three labels: tested, preference, hypothesis. Two 12 V adapters on a handheld scope, on battery, no load: 8 to 13 mV peak to peak, the stock one a little lower. Tested. A fault that felt intermittent happened on every cold open after an album ran out; the gap was in what he had watched.' }],
  // [check] panel 015 action 1: the room has no camera, so the stripes label points, they do not range them
  ['projector', { kicker: 'An object shows its own measurement', title: 'Structured light',
    body: 'Gray-code stripes label every point with a projector column and row; the camera beside the lens reads each label and triangulates the depth. Then the scanned object becomes its own point cloud.' }],   // [check] wave 5 P2
  // [check] wave 5 P2: the head that replaced the vase in the canal house
  ['plato', { kicker: 'Plato’s cave · projection mapping', title: 'Plato',
    body: 'A plaster cast of Plato’s head, scanned by the SMK in Copenhagen and in the public domain. In his cave, prisoners take shadows thrown on a wall for the real thing: projection, 2,400 years early. He mapped light onto festival stages with Resolume and MadMapper; here the projector first measures the head, then paints it.',
    more: { href: 'https://open.smk.dk/artwork/image/KAS2111', label: 'The cast at SMK' } }],
  // merge 021 (action 11): the chain from library to cone is named here, once (hifi gear/signal-chain.md; the Zen Stream as
  // "a streamer", no hostnames). [check]
  ['amp', { kicker: 'Listening corner', title: 'Luxman L-308',
    body: 'His own amplifier, the last box in a chain he can name from library to cone: Roon holds the files, HQPlayer upsamples them to DSD256, a streamer hands them to the NEO iDSD 2, the Luxman drives the B&Ws. The real one has no meters, so neither does this one.' }],
  // merge 021 (panel 021 action 11): one voice per card: the records speak to the stance, the chain is named once, on the
  // Luxman's card; the shelf is cut to its definition and the compression line (~35 words). [check] notes/captions.md
  // round 021 B (profile.md zone 4, "mastery of the tool makes flow possible"): the crate's two named sleeves
  // (objects/pr_records.py; records: the builder's pick, no [check]) and the chain from library to cone (hifi
  // gear/signal-chain.md, no hostnames). [check] the rest, notes/captions.md
  ['pr_records', { kicker: 'Listening corner', title: 'The records',
    body: 'The library end of the chain. Know a chain well enough and you stop hearing it; then there is only the music.' }],
  ['pr_records_sleeves', 'pr_records'],
  ['pr_dm603', { kicker: 'Listening corner', title: 'B&W DM603',
    body: 'Three-way floorstanders with the yellow Kevlar midrange B&W is known for. Around 90 dB sensitive: an easy load for the Luxman.' }],
  ['pr_ifi', { kicker: 'Listening corner', title: 'iFi NEO iDSD 2',
    body: 'The DAC. Music reaches it upsampled to DSD256, and the display reads 11M when it locks.' }],
  ['pr_hd660', { kicker: 'Listening corner', title: 'Sennheiser HD 660S2',
    body: 'Open-back, 300 Ω, driven straight from the NEO iDSD 2. The quiet half of the chain.' }],
  ['bookshelf', { kicker: 'Reading', title: 'The shelf',
    // round 021 B (profile.md zone 3, "consciousness is not computation; the map is not the territory"): his own
    // definition (vault faggin/SOUL.md) and Abram's compression chain (abram/README.md). [check] notes/captions.md
    body: 'McGilchrist, Abram, Lane, Koch, Kastrup, Faggin, Levin. His definition: consciousness turns raw information into felt, meaningful experience, not reducible to syntax. AI trains on the last, most compressed layer. The map is not the territory.' }],
  ['cz_bookcase', 'bookshelf'],
  ['pr_brain', { kicker: 'Reading', title: 'Two hemispheres',
    body: 'McGilchrist’s claim is not left-logic, right-creativity. It is about attention: each half attends differently, and so brings forth a different world.' }],
  ['pr_4004', { kicker: 'Reading', title: 'Intel 4004',
    body: 'The first commercial microprocessor, 1971, designed by Federico Faggin, who later concluded that consciousness cannot be computed. Syntax is not semantics.' }],
  ['pr_ledmatrix', { kicker: 'Light', title: 'LED matrix',
    body: 'A grid of squares, each with a live alpha: the core of his Metal visuals engine, the successor to an old Quartz Composer workflow for TVs and LED walls.' }],
  // round 022 C: the 3090 is the local-inference case's object (main.js CASE_OF): its card carries the case's one figure,
  // from projects/local-inference-3090/README.md (MTP speculative decoding, 30.0 -> 43.2 tok/s). [check] notes/captions.md
  ['pr_3090', { kicker: 'His own · local inference', title: 'RTX 3090',
    body: 'A 27-billion-parameter model on one 24 GB card, driving an agent harness. Speculative decoding: +44%, 30.0 to 43.2 tokens a second, measured before believed.' }],
  // round 021 B (profile.md zone 5, "the human still pedals: agency over speed"), merge 021 (panel 021 action 5, open call
  // 1's default): the laptop zone speaks once. The Atlas figures are C's own case card (index.html #work data-case="atlas");
  // servant / sparring / mirror is the Agents case's room line (main.js WORK.terminal); here only the one measured ratio of
  // the command-center review (cc-setup-review-2026-09 research 13, its denominator with it). [check] notes/captions.md
  ['pr_terminal', { kicker: 'Agents · the human still pedals', title: 'The laptop',
    body: 'Measured on his own setup over 16 weeks: the model was at work for 29 of the 89 hours a session was live. The rest of the time was his.' }],
  ['pr_wheel', { kicker: 'Now', title: 'Bicycle wheel',
    body: 'Jobs called the computer a bicycle for the mind. The metaphor assumes the human still pedals; with agents that is a choice. He means to keep pedalling.' }],
  ['pr_poster_action', { kicker: 'How the intro flew', title: 'The principle of least action',
    body: 'Every path between two points gets one number, the action S = ∫L dt with L = T − V. Vary the path, q → q + εη with η zero at both ends, and ask that S does not change to first order, δS = 0. Integrate by parts: the boundary term vanishes and the Euler–Lagrange equation is left, d/dt ∂L/∂q̇ − ∂L/∂q = 0, which for L = ½mq̇² − V is F = ma. With p = ∂L/∂q̇ and H = Σ pq̇ − L, write S = ∫(Σ pq̇ − H) dt and vary q and p independently: integrating the p δq̇ term by parts gives Hamilton\'s equations, q̇ = ∂H/∂p and ṗ = −∂H/∂q. Why stationary? Feynman: every path counts, with a phase e^{iS/ħ}; near δS = 0 the phases agree and add up, elsewhere they cancel. The camera that brought you in rode such a path: a bead on a wire along its route, through an invented landscape. After a lecture by Erik Verlinde (University of Amsterdam). Sources: Goldstein, Poole & Safko, Classical Mechanics, 3rd ed., ch. 2 and §8.5; Feynman Lectures on Physics, Vol. II, ch. 19; Thornton & Marion, Classical Dynamics, 5th ed., ch. 7; Cline, Variational Principles in Classical Mechanics, ch. 9.',
    more: { href: 'https://arxiv.org/abs/1001.0785', label: 'Verlinde: F = ma from entropy' } }],
  // [check] 019 action 16, the raindrop named (Ruud's ask, 2026-10-22; David Abram's Sensing talk, the-body-knew-first
  // notes): no node; one rivulet on the hero pane (layer-rain.js rivulet()) is its spot. In the canal view it is the card
  ['raindrop', { kicker: 'At the window', title: 'A drop on the glass',
    // round 021 (Ruud, 2026-10-23): the source is the Sensing talk, not the book; a few of its lines, no link to a full text.
    // merge 021 (panel 021 action 9): the manuscript's card merged in, one card that points from the drop to the essay
    // (projects/the-body-knew-first/: the talk transcript l.18, l.20; the essay §I opens on the same drop). [check]
    // round 022 A (profile.md, the window: nature, forests and long walks as where he thinks): the nature thread is this
    // card's last line, once (the essay §II, memory/MEMORY.md); the shoes' card no longer repeats it. [check]
    body: 'Watch a drop run down the glass. David Abram, in a talk on sensing: “We cannot even predict just how that drop is going to fall”; science calls it chaotic, but “a much better word for what they mean is wild.” His essay The Body Knew First opens on this drop; it lies in print on the sill, unpublished. The thinking behind it is done outside, on long walks through forests and along the water.' }],
  ['pr_manuscript', 'raindrop'],
  // merge 022 (panel 022 action 9): the barefoot shoes are gone from the room, and their card with them
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
  const { THREE, camera, renderer, byName, scene } = live;
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
    const spot = { name, ...text, alias: typeof entry === 'string' ? entry : null, node, meshes, box, volume: size.x * size.y * size.z,
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
    // merge 021 (panel 021 action 10): an alias whose card has its own spot (the sleeves on the crate's card, the manuscript
    // on the drop's) is a second way in for the pointer, not a second stop for the keyboard
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

  // State: which spot, and how it was opened. hover/peek close on their own; pinned/key wait for Esc
  // or a tap elsewhere. peek = keyboard focus, title only; key = Enter, the full card.
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
    // keyboard: the card sits right after its button, so Tab reaches the link next
    if (how === 'key' || how === 'peek') { if (card.parentNode !== spot.li) spot.li.appendChild(card); }
    else if (card.parentNode !== document.body) document.body.appendChild(card);
    card.hidden = false;
    if (how === 'pinned' || how === 'key') dispatchEvent(new CustomEvent('room:pick', { detail: spot.name }));
    last.x = NaN;                       // update() places it next frame, from read()'s boxes (no forced layout)
    fadeIn = { spot, at: frameNo };     // the fade starts in a later frame's update() (round 022: no write between frames)
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
  // round 022: the grace runs on the frame clock and the hide writes in update(), so no timer writes the DOM between two
  // frames (the next frame's read() then forced a layout: perf --motion, 1 in ~236 hover frames in 2 of 4 runs)
  const hideSoon = () => { hideAt = performance.now() + HIDE_MS; };

  // Place the card above the anchor (below if there is no room), clamped to a 16 px gutter and kept
  // off the page caption (top on phones) and the viewpoint strip (bottom).
  // panel 018 action 7: the boxes it needs, read by read() at the start of the frame (main.js: every read() before any
  // layer writes), or here when called outside the frame (resize)
  let CR = null, RB = null;
  addEventListener('resize', () => { CR = null; });
  const canvasBox = () => (CR ??= canvas.getBoundingClientRect());
  const boxes = () => ({ cap: document.querySelector('.caption')?.getBoundingClientRect(),
    views: document.querySelector('.views')?.getBoundingClientRect(), w: card.offsetWidth, h: card.offsetHeight });
  // the screen box of a world box, CSS px [l, t, r, b], clipped to the window; null when behind the camera
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
  // round 022 (panel 021 action 14): where the frame is dark. One render of the room at 1/LUM_DIV size, read back once per
  // camera pose when a card opens (not per frame), so a card can hang on the darker side of its object, off the lit
  // subject (a screen, the lamp's pool, the top shelf)
  const LUM_DIV = 8, LUM_MS = 400;
  let lum = null;
  function lumAt() {
    const key = camera.matrixWorld.elements.map((e) => e.toFixed(3)).join() + innerWidth + 'x' + innerHeight;
    if (lum && (lum.key === key || performance.now() - lum.t < LUM_MS)) return lum;   // a card that follows a drag re-reads at most every LUM_MS
    const w = Math.max(1, Math.round(innerWidth / LUM_DIV)), h = Math.max(1, Math.round(innerHeight / LUM_DIV));
    const rt = new THREE.WebGLRenderTarget(w, h), px = new Uint8Array(w * h * 4);
    renderer.setRenderTarget(rt); renderer.render(scene, camera); renderer.setRenderTarget(null);
    renderer.readRenderTargetPixels(rt, 0, 0, w, h, px);
    rt.dispose();
    const sum = new Float64Array((w + 1) * (h + 1));   // a summed-area table, rows top-down, of luma 0..1
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = 4 * ((h - 1 - y) * w + x), l = (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255;
      sum[(y + 1) * (w + 1) + x + 1] = l + sum[y * (w + 1) + x + 1] + sum[(y + 1) * (w + 1) + x] - sum[y * (w + 1) + x];
    }
    lum = { key, w, h, sum, t: performance.now() };
    return lum;
  }
  // the mean luma (0..1) under a CSS px rect
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
    const { cap, views, w, h } = RB ?? boxes();
    RB = null;
    if (cap && cap.top < H / 2) top = Math.max(top, cap.bottom + 8);
    if (views && views.height) bottom = Math.min(bottom, views.top - 8);
    // off-screen at this viewpoint: rest above the strip; an object whose anchor is off but whose box shows at the frame's
    // edge (the sill from the bench) hangs by the part in frame
    const R0 = rectOf(open.box), inFrame = R0 && R0[2] - R0[0] >= 8 && R0[3] - R0[1] >= 8;
    if (!vis) { x = inFrame ? (R0[0] + R0[2]) / 2 : W / 2; y = inFrame ? R0[1] : bottom; }
    const fit = ([cx, cy]) => [Math.min(Math.max(cx, g), W - g - w), Math.min(Math.max(cy, top), Math.max(top, bottom - h))];
    let [cx, cy] = fit([x - w / 2, y - 14 - h < top ? y + 14 : y - 14 - h]);
    // round 022 (panel 021 action 14): the card hangs beside the lit subject, never on it. It used to drop below the anchor
    // where above did not fit, onto the object (the laptop's screen, the shelf). Now it takes, of above, below, right and
    // left of the object's screen box, the one that covers least of the object and, of those, the darkest frame under it
    if (inFrame) {
      const R = R0, L = lumAt(), my = (R[1] + R[3]) / 2;
      const over = ([a, b]) => Math.max(0, Math.min(a + w, R[2]) - Math.max(a, R[0])) * Math.max(0, Math.min(b + h, R[3]) - Math.max(b, R[1])) / (w * h);
      let best = null, least = Infinity;
      const cands = [[x - w / 2, R[1] - 14 - h], [x - w / 2, R[3] + 14], [R[2] + 14, my - h / 2], [R[0] - 14 - w, my - h / 2]];
      if (!vis) cands.push([W / 2 - w / 2, bottom - h]);   // a sliver at the edge may also rest above the strip, as before
      for (const c of cands) {
        const f = fit(c), score = 2 * over(f) + lumOf(L, [f[0], f[1], f[0] + w, f[1] + h]);
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
    // merge 022 (panel 022 action 7): Enter on an object that leads somewhere does what a click on it does (the RTX 3090
    // opens #inference, a view's object flies there); the card stays the road for the objects that lead nowhere
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
      // merge 022 (panel 022 action 3): the open card is placed (update() ran position() for it) and faded in; the gates wait
      // for this, not a fixed delay: under load no frame may run in 200 ms and the card is read where the last one hung
      placed: () => !!open && !Number.isNaN(last.x) && !fadeIn,
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
      // round 022: would a hover on this spot show its card here (not an object that leads to another view)
      hoverable: (name) => { const s = spots.find((x) => x.name === name); return !!s && !leads(s); },
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
