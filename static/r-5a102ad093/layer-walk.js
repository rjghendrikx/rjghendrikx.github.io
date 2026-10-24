// Walk the room (round 019, variant A): standpoints under C's one-click grammar. A click on the bare floor (the boards or
// the rug) steps to the standpoint nearest that spot; objects still fly to their view in one click from wherever you
// stand. The idea is room-v18-B's walk (there the standpoints were the views themselves, with rings on the floor); here
// they are hand-placed places to stand, no view of their own, no chip, no case card, and nothing drawn in the scene but a
// faint lamp pool on the boards under the pointer while a click there would walk.
//
// main.js owns the grammar: intentAt asks stepOf(hit) for a floor hit in the room (the hero or a standpoint; never in a
// close-up, where the floor stays the way back), the cursor (WALK_CURSOR) and go() read the same intent, and a standpoint
// moves like a view: it pushes #<id>, moving on replaces it, so browser Back lands on the hero and Esc goes home.
//
// Round 021 D (Ruud, 2026-10-23: "I also want to move in translating directions"): the floor is free. A click on it walks to
// that spot at eye height (a standpoint within SNAP of the spot is the stop instead), facing the way you went; main.js adds
// the right-button / two-finger pan and the arrow / WASD steps. All three ask this module's one clearance table (nav): the
// room's shell (the floor's box, inset by SHELL) and the furniture's footprints (the baked boxes, out by BODY), so the
// camera never leaves the shell or stands in a piece of furniture. On the phone too: Ruud's ask overrides 019's mouse-only.
//
// Cost: one hidden disc (+1 draw call only while the pointer is over walkable floor). Not free at rest: main.js runs its
// guardEye (one depth() test against the footprints) and the controls' update every frame (merge 021, panel 021 action 15).
import { noPick } from './layer-common.js';

// The standpoints are the layout's STANDS rows (round 020, panel 019 action 6: lib/layouts/canal_house.py, beside VIEWS),
// exported as empties st_<id> with label, target (glTF axes) and lens, so the bake, the stills and the gates own them. A
// layout without them (the default room) gets no walk. Here only what a click reaches from each: its one-line card.
// [check] cards, notes/captions.md
const CARDS = {
  door: 'From here: the C64, Agents on the laptop, the bench and the canal.',
  // round 020: the STANDS row turned this one out over the sill (it looked back at the bookcase): the card says so
  // round 022 A: the STANDS row now looks down into the right pane (the manuscript, the lantern on the quay)
  // merge 022: turned out through the left pane at the University and the canal (the light show's stage, round 022 E)
  window: 'From here: the canal, the boats and the University across the water.',
  seat: 'From here: the hi-fi, Simulations in the cloud chamber, the C64.',
};
const FLOOR = new Set(['at_floor', 'cz_rug']);
const FLOOR_Y = 0.06;        // m: a hit this low on the floor or the rug is floor (the rug is ~1 cm)
const POOL_R = 0.42;         // m: the lamp pool's radius on the boards
const POOL_A = 0.32;         // its peak alpha, additive: a lift of the bake, never a mark
const POOL_MS = 140;         // its fade, in and out
// round 021 D: the free walk's clearance table
const SNAP = 0.6;            // m: a floor spot this close to a standpoint (or the hero) on the plan walks to it, the stop
const SHELL = 0.25;          // m: the eye stays this far inside the floor's box (the walls, the window wall, the door)
const BODY = 0.08;           // m: and this far off a piece of furniture's footprint (the window standpoint stands 0.09 m off the stool)
// merge 021 (panel 021 action 3): a node standing on the floor that reaches TALL[0] m or higher (the bookcase, the chimney
// breast, the floor lamp) and the eye-height nodes in TALL_NAMES (Plato on his plinth, the plants, the rack) keep the eye
// TALL[1] m off: the near plane stays off Plato, the eye out of the bookcase's lightmap texels (D's eye went to 0.08 m and saw
// the plaid). The bench's instruments need no more than BODY: their tops are <= 0.95 m, so the free eye's band (>= 1.45 m)
// keeps it >= 0.5 m from the optics, the chamber and the scope (free_move_gate); the rest keeps BODY
// round 022 D (the tech artist's texel-aware clearance) replaces that fixed 0.4 m: each node keeps the eye as far off as its
// bake needs, so a texel never covers more than TEXEL_PX CSS px: distance >= K / (TEXEL_PX * rho), K the viewport's px a
// metre at 1 m (main.js pxPerMetre: the hero's lens, portrait-widened) and rho the node's texels a metre (from its UVs).
// On the plan that is r = sqrt(D^2 - g^2), g the height between the free band and the node's box, at least BODY, and capped
// where a designed place (the hero, a standpoint) already stands nearer: the bookcase's 89 texels/m would need 7 m on
// desktop, and the hero shows it at 6.8 px a texel. TALL[0] now only names the wall-like nodes (main.js walkTo's room ahead)
const TALL = [0.9, 0.4];
const TALL_NAMES = /^(plato|at_plinth|cz_plant(_\d+)?|rack)$/;   // merge 022: back from merge 021 (eye-height nodes kept R_MAX off)
// CSS px a texel at most (gates.py TEXEL_PX_MAX); Ruud's eyes on the phone set it: ?texelpx=3 tries another (measure-on-device.md)
const TEXEL_PX = Math.max(0.5, +new URLSearchParams(location.search).get('texelpx') || 1.5);
// ... and never more than R_MAX m on the plan: a node whose bake is too coarse for TEXEL_PX within it (the bookcase, 89
// texels/m, needs 7.2 m on desktop; at 1.5 px everywhere the walkable floor fell from 48 % to 13 % of the room and the
// hero's walk cells from 89 to 27) is held at R_MAX and listed as under-resolved (bounds().coarse): its fix is a bake.
// 0.4 m is the old TALL[1] and, measured on desktop 1440x900, the largest that keeps the designed places connected: at 0.5
// the hero's walks to the window and the seat have no route (?rmax= tries another)
const R_MAX = Math.max(BODY, +new URLSearchParams(location.search).get('rmax') || 0.4);
const BAND = [1.0, 2.2];     // m: the height range any place may have its eye in (a seated standpoint is 1.2)
// merge 021 (panel 021 action 2, open call 5's default): the free eye's own range, the pan's up/down: a standing person's
// eye, not a crane's (D rose to 2.2 m); on release it eases back to EYE (main.js). A place below it (the seat) may only rise
const FREE_BAND = [1.45, 1.85];
const MIN_STEP = 0.35;       // m: a walk shorter than this is no walk (a click at your feet)
const STEP_OVER = 0.2;       // m: a thing lower than this is stepped over (the crash pad by the table, 0.17 m)
const SEG = 0.08;            // m: the walk's path is tested every SEG
const ROUTE_STEP = 0.2;      // m: the grid a walk round a piece of furniture picks its waypoint from

export default function mount(live) {
  const { THREE, scene, byName } = live;
  // round 021 D: on touch too (Ruud's ask overrides merge 019 step 2's mouse-only ruling): tap the floor to walk
  if (live.gate || !live.addStands || !byName('at_floor')) return null;
  const rows = [];
  scene.traverse((o) => { const d = o.userData; if (d.st_label) rows.push({ id: o.name.replace(/^st_/, ''), label: d.st_label, order: d.st_order ?? 0,
    pos: o.getWorldPosition(new THREE.Vector3()), target: new THREE.Vector3(...d.st_target), lens: d.st_lens }); });
  rows.sort((a, b) => a.order - b.order);

  // keep a standpoint only if a ray down through it lands on the floor first (not inside a piece of furniture)
  const down = new THREE.Raycaster();
  const solids = [];
  scene.traverse((o) => { if (o.isMesh && o.material?.isMeshBasicMaterial && o.material.map) solids.push(o); });
  const top = (o) => { while (o?.parent && o.parent !== scene) o = o.parent; return o; };
  const clear = (p) => { down.set(new THREE.Vector3(p.x, 2.2, p.z), new THREE.Vector3(0, -1, 0)); const h = down.intersectObjects(solids, false)[0];
    return !!h && FLOOR.has(top(h.object)?.name) && (2.2 - h.distance) < FLOOR_Y; };
  const stands = [], dropped = [];
  for (const s of rows) {
    if (!clear(s.pos)) { dropped.push(s.id); continue; }
    stands.push({ id: s.id, label: s.label, card: CARDS[s.id] ?? null, pos: s.pos, target: s.target, fov: live.fovOf(s.lens) });
  }
  if (!stands.length) return null;
  const hero = { id: live.home, pos: live.heroPos };
  const places = [hero, ...stands];
  const dist2 = (s, p) => (s.pos.x - p.x) ** 2 + (s.pos.z - p.z) ** 2;   // on the floor plan

  // the clearance table (round 021 D), from the baked meshes' world boxes grouped by top-level node: the shell is the floor's
  // box; an obstacle is a node that stands in the room (on the floor plan, below head height, not flat, not the shell or the
  // canal outside). A node wholly outside the inset shell (the door, the poster, a wall's plinth) is the shell's business
  const fb = new THREE.Box3().setFromObject(byName('at_floor'));
  const shell = { x0: fb.min.x + SHELL, x1: fb.max.x - SHELL, z0: fb.min.z + SHELL, z1: fb.max.z - SHELL };
  const boxes = new Map();
  for (const m of solids) { const t = top(m); if (!t || FLOOR.has(t.name)) continue;
    const b = new THREE.Box3().setFromObject(m); boxes.set(t, boxes.has(t) ? boxes.get(t).union(b) : b); }
  const area = (b) => (b.max.x - b.min.x) * (b.max.z - b.min.z), floorArea = area(fb);
  // round 022 D: each node's baked texel density, texels a metre: the texture's side times sqrt(UV area / world area) over
  // its meshes (Smart UV Project packs every island at one scale, so the mean is the density)
  const texels = new Map();
  { const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    for (const m of solids) {
      const t = top(m), g = m.geometry, P = g.attributes.position, U = g.attributes.uv, S = m.material.map?.image?.width;
      if (!t || !U || !S) continue;
      const ix = g.index, n = ix ? ix.count : P.count, at = (k) => (ix ? ix.getX(k) : k);
      let wa = 0, ua = 0;
      for (let k = 0; k < n; k += 3) {
        const i = at(k), j = at(k + 1), l = at(k + 2);
        a.fromBufferAttribute(P, i).applyMatrix4(m.matrixWorld); b.fromBufferAttribute(P, j).applyMatrix4(m.matrixWorld); c.fromBufferAttribute(P, l).applyMatrix4(m.matrixWorld);
        wa += b.sub(a).cross(c.sub(a)).length() / 2;
        ua += Math.abs((U.getX(j) - U.getX(i)) * (U.getY(l) - U.getY(i)) - (U.getX(l) - U.getX(i)) * (U.getY(j) - U.getY(i))) / 2 * S * S;
      }
      const e = texels.get(t) ?? { wa: 0, ua: 0 }; e.wa += wa; e.ua += ua; texels.set(t, e);
    } }
  const rhoOf = (t) => { const e = texels.get(t); return e && e.wa > 0 ? Math.sqrt(e.ua / e.wa) : null; };
  const obstacles = [], raw = [];
  for (const [t, b] of boxes) {
    if (b.max.y < STEP_OVER || b.min.y > BAND[1] || area(b) > 0.5 * floorArea) continue;   // low enough to step over: no obstacle
    if (b.max.x < shell.x0 || b.min.x > shell.x1 || b.max.z < shell.z0 || b.min.z > shell.z1) continue;
    const rho = rhoOf(t);
    raw.push(b);
    obstacles.push({ name: t.name, top: +b.max.y.toFixed(3), bottom: +b.min.y.toFixed(3), rho: rho && +rho.toFixed(1) });
  }
  // the texel clearance, per viewport (a phone turned, a window resized): K changes, so the footprints do
  let K = 0;
  // a designed place's distance to a node as the free eye would have it standing there (in the free band: g), and the
  // footprint's own metric for the cap (a box grown by r on each side: a place is out when max(dx, dz) >= r)
  const gap2 = (b, p) => [Math.max(b.min.x - p.x, 0, p.x - b.max.x), Math.max(b.min.z - p.z, 0, p.z - b.max.z)];
  obstacles.forEach((o, i) => { const b = raw[i], g = Math.max(0, FREE_BAND[0] - b.max.y, b.min.y - FREE_BAND[1]);
    o.design = +Math.min(...places.map((q) => Math.hypot(...gap2(b, q.pos), g))).toFixed(3);
    o.planCap = Math.min(...places.map((q) => Math.max(...gap2(b, q.pos)))) - 0.002; });
  function sizeClear() {
    K = live.pxPerMetre?.() ?? 0;
    obstacles.forEach((o, i) => {
      const b = raw[i], g = Math.max(0, FREE_BAND[0] - b.max.y, b.min.y - FREE_BAND[1]);
      // the texel rule, capped at the nearest a designed place (the hero, a standpoint) already stands: a node whose bake the
      // hero shows coarser than TEXEL_PX (the bookcase: 89 texels/m, 6.8 px a texel from the hero) is kept at least as far
      // as that place, never pushed out of the room
      const D = o.rho && K ? Math.min(K / (TEXEL_PX * o.rho), o.design) : 0;
      // and on the plan never past a designed place (gate run 1 of 022 D: the free band's g is under a standing place's own,
      // so its r passed the hero by 5 cm and the window place by 45; a move from a place that is not clear may only get
      // clearer, and the hero's pan froze). Rounded down to the mm, so the place stays clear
      const want = Math.sqrt(Math.max(0, D * D - g * g));
      // merge 022 (panel 022 D, the tech artist's probe: the worst reachable texel unchanged at 26.7 px, 15 % of the clear eye
      // cells lost): the texel rule is a report and a regression gate only (want, coarse, held); the footprint is merge
      // 021's, R_MAX for the wall-like and eye-height nodes, BODY for the rest, still never past a designed place. The fix
      // for a coarse node is its bake (bet 023-D)
      const tall = (b.min.y < 0.05 && b.max.y >= TALL[0]) || TALL_NAMES.test(o.name);
      const r = Math.floor(1000 * Math.max(BODY, Math.min(o.planCap, tall ? R_MAX : BODY))) / 1000;
      Object.assign(o, { x0: b.min.x - r, x1: b.max.x + r, z0: b.min.z - r, z1: b.max.z + r, r, coarse: want > R_MAX + 1e-3, held: want > r + 1e-3 });   // held: nearer than the texel rule (a place, or R_MAX)
    });
    reach?.clear();
  }
  // how far p (an eye position) is from allowed: 0 when clear, else the sum of the shell's overshoot and the deepest way
  // into an obstacle's footprint (its shortest way out)
  const shellOut = (p) => Math.max(0, shell.x0 - p.x) + Math.max(0, p.x - shell.x1) + Math.max(0, shell.z0 - p.z) + Math.max(0, p.z - shell.z1);
  function depth(p) {
    let d = Math.max(0, shell.x0 - p.x) + Math.max(0, p.x - shell.x1) + Math.max(0, shell.z0 - p.z) + Math.max(0, p.z - shell.z1)
      + Math.max(0, BAND[0] - p.y) + Math.max(0, p.y - BAND[1]);
    let o = 0;
    for (const b of obstacles) if (p.x > b.x0 && p.x < b.x1 && p.z > b.z0 && p.z < b.z1) o = Math.max(o, Math.min(p.x - b.x0, b.x1 - p.x, p.z - b.z0, b.z1 - p.z));
    return d + o;
  }
  const free = (p) => depth(p) === 0;
  // a straight move a -> b stays clear. From a clear place exactly: b clear (the shell and the band are convex) and the
  // segment through no footprint (a 2D slab test; gate run 3: sampling every SEG cut a corner of the plinth by 2 mm). From
  // a place that is itself not clear (a pose the code put there) sampled: it may only get clearer
  function crosses(a, b, o) {
    let t0 = 0, t1 = 1;
    for (const [p, d, lo, hi] of [[a.x, b.x - a.x, o.x0, o.x1], [a.z, b.z - a.z, o.z0, o.z1]]) {
      if (Math.abs(d) < 1e-12) { if (p <= lo || p >= hi) return false; continue; }
      let u = (lo - p) / d, v = (hi - p) / d;
      if (u > v) [u, v] = [v, u];
      t0 = Math.max(t0, u); t1 = Math.min(t1, v);
      if (t1 - t0 <= 1e-9) return false;
    }
    return true;
  }
  function pathClear(a, b) {
    if (depth(a) === 0) return depth(b) === 0 && !obstacles.some((o) => crosses(a, b, o));
    const n = Math.max(1, Math.ceil(a.distanceTo(b) / SEG)), q = new THREE.Vector3();
    // round 022 D: and never further out of the shell (gate run 1: from deep in a footprint the sum let a key step trade the
    // footprint's depth for 1.06 m past the window wall)
    let was = depth(a), out = shellOut(a);
    for (let i = 1; i <= n; i++) { q.copy(a).lerp(b, i / n); const d = depth(q), o = shellOut(q);
      if (d > was + 1e-6 || o > out + 1e-6) return false; was = Math.min(was, d); out = Math.min(out, o); }
    return true;
  }
  // a move from a toward b, as far as it stays clear: the whole of it, else sliding along one axis, else nothing
  function clamp(a, b) {
    if (pathClear(a, b)) return b.clone();
    for (const c of [new THREE.Vector3(b.x, b.y, a.z), new THREE.Vector3(a.x, b.y, b.z), new THREE.Vector3(a.x, a.y, a.z).setY(b.y)]) if (pathClear(a, c)) return c;
    return a.clone();
  }
  // a walk between two places whose straight line crosses a footprint goes round it: the one waypoint (on a ROUTE_STEP grid
  // of clear spots) that makes the shortest clear two-leg walk; [] when the straight line is clear, null when nothing is
  function route(a, b) {
    if (pathClear(a, b)) return [];
    let best = null, len = Infinity;
    const w = new THREE.Vector3();
    for (let x = shell.x0; x <= shell.x1 + 1e-6; x += ROUTE_STEP) for (let z = shell.z0; z <= shell.z1 + 1e-6; z += ROUTE_STEP) {
      w.set(x, (a.y + b.y) / 2, z);
      const l = a.distanceTo(w) + w.distanceTo(b);
      if (l >= len || !free(w) || !pathClear(a, w) || !pathClear(w, b)) continue;
      best = w.clone(); len = l;
    }
    return best ? [best] : grid(a, b);
  }
  // round 022: where no one waypoint does (gate run on 06898ac: a walk from a spot by the table to the window found none and
  // went straight, 61-101 mm through a footprint), the shortest way over the ROUTE_STEP grid of clear spots (8 neighbours,
  // each edge a clear straight move; a and b join every spot they see), pulled tight to the fewest waypoints; null when the
  // grid has none either. Run per click only (a hover's reach is cached per spot): ~600 spots, ~5k short segment tests
  function grid(a, b) {
    const nx = Math.floor((shell.x1 - shell.x0) / ROUTE_STEP) + 1, nz = Math.floor((shell.z1 - shell.z0) / ROUTE_STEP) + 1, y = (a.y + b.y) / 2;
    const pts = [], ok = [];
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) { const w = new THREE.Vector3(shell.x0 + i * ROUTE_STEP, y, shell.z0 + j * ROUTE_STEP); pts.push(w); ok.push(free(w)); }
    const A = pts.length, B = A + 1;
    pts.push(a, b);
    const dist = new Float64Array(A + 2).fill(Infinity), prev = new Int32Array(A + 2).fill(-1), done = new Uint8Array(A + 2);
    const edges = (k) => {
      if (k === A) return pts.slice(0, A).map((w, n) => n).filter((n) => ok[n] && pathClear(a, pts[n]));
      const i = Math.floor(k / nz), j = k % nz, out = [];
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
        const n = (i + di) * nz + j + dj;
        if ((di || dj) && i + di >= 0 && i + di < nx && j + dj >= 0 && j + dj < nz && ok[n] && pathClear(pts[k], pts[n])) out.push(n);
      }
      if (pathClear(pts[k], b)) out.push(B);
      return out;
    };
    dist[A] = 0;
    for (;;) {   // Dijkstra: ~600 nodes, a linear scan for the nearest is fine
      let k = -1;
      for (let n = 0; n < A + 2; n++) if (!done[n] && dist[n] < Infinity && (k < 0 || dist[n] < dist[k])) k = n;
      if (k < 0) return null;
      if (k === B) break;
      done[k] = 1;
      for (const n of edges(k)) { const d = dist[k] + pts[k].distanceTo(pts[n]); if (d < dist[n]) { dist[n] = d; prev[n] = k; } }
    }
    const chain = [];
    for (let k = B; k >= 0; k = prev[k]) chain.unshift(pts[k]);
    const way = [];   // pull tight: from each kept point, on to the farthest one in a clear straight line
    for (let s = 0; s < chain.length - 1;) {
      let t = chain.length - 1;
      while (t > s + 1 && !pathClear(chain[s], chain[t])) t--;
      if (t < chain.length - 1) way.push(chain[t].clone());
      s = t;
    }
    return way;
  }
  // is there a clear walk from `a` to the place? Asked by every hover over a snap disc: cached per (spot, place)
  const reach = new Map();
  sizeClear();
  addEventListener('resize', sizeClear);
  function reachable(a, place) {
    const k = `${a.x.toFixed(3)},${a.z.toFixed(3)}>${place.id}`;   // merge 021: to the mm (a cm key let a walk 2 mm away reuse a 'yes')
    if (!reach.has(k)) { if (reach.size > 256) reach.clear(); reach.set(k, route(a, new THREE.Vector3(place.pos.x, a.y, place.pos.z)) !== null); }
    return reach.get(k);
  }
  const tall = rows.filter((s) => s.pos.y > 1.4);
  const EYE = tall.length ? tall.reduce((a, s) => a + s.pos.y, 0) / tall.length : 1.6;   // the standing standpoints' eye

  // the place a click on this floor hit walks to (round 021 D): a named place (a standpoint, or the hero) within SNAP of the
  // spot on the plan, never the one you stand at; else the spot itself at eye height ('walk'), when the straight walk there
  // stays clear; a spot in a footprint or past the shell walks as far as it can toward it. from: the eye now
  function stepOf(hit, cur, from) {
    if (!FLOOR.has(top(hit.object)?.name) || hit.point.y > FLOOR_Y) return null;
    const other = places.filter((p) => p.id !== cur.id);
    const s = other.reduce((a, b) => (dist2(b, hit.point) < dist2(a, hit.point) ? b : a));
    if (!from) return null;
    const start = new THREE.Vector3(from.x, EYE, from.z);
    // a stop only if a clear walk there exists, straight or round one piece of furniture (gate run 1: the seat -> window walk
    // crossed the table; main.js goTo takes the same route); else the spot is walked toward like any other
    if (dist2(s, hit.point) <= SNAP * SNAP && reachable(start, s)) return { id: s.id, at: new THREE.Vector3(s.pos.x, 0, s.pos.z) };
    const want = new THREE.Vector3(hit.point.x, EYE, hit.point.z);
    let to = want;
    if (!free(want) || !pathClear(start, want)) {
      // back along the line toward you to the farthest clear spot the walk reaches
      const n = Math.ceil(start.distanceTo(want) / SEG);
      to = null;
      for (let i = n - 1; i > 0 && !to; i--) { const c = start.clone().lerp(want, i / n); if (free(c) && pathClear(start, c)) to = c; }
      if (!to) return null;
    }
    if (Math.hypot(to.x - from.x, to.z - from.z) < MIN_STEP) return null;
    return { id: 'walk', at: new THREE.Vector3(to.x, 0, to.z), pos: to };
  }
  // round 022 D: stepOf's cheap twin for the arrival's framing (main.js walkTo asks it of up to 36 rays a pose): the hit is
  // bare floor at least MIN_STEP off on the plan and the first MIN_STEP toward it is clear, so a click there walks (stepOf's
  // routes and its walk-back made a walk's pick 927 ms at CPU x6)
  // the same test before any mesh ray, exact for a miss: where the ray meets the floor plane (outside the floor's box, under
  // MIN_STEP, or with the first step blocked, no mesh hit can make it a walk). It spares the walk's pick most of its rays
  function floorMaybe(from, dir) {
    if (dir.y >= -1e-6) return false;
    const t = -from.y / dir.y, px = from.x + dir.x * t, pz = from.z + dir.z * t;
    if (px < fb.min.x || px > fb.max.x || pz < fb.min.z || pz > fb.max.z) return false;
    const dx = px - from.x, dz = pz - from.z, l = Math.hypot(dx, dz);
    if (l < MIN_STEP) return false;
    return pathClear(new THREE.Vector3(from.x, EYE, from.z), new THREE.Vector3(from.x + dx / l * MIN_STEP, EYE, from.z + dz / l * MIN_STEP));
  }
  function floorAhead(hit, from) {
    if (!FLOOR.has(top(hit.object)?.name) || hit.point.y > FLOOR_Y) return false;
    const dx = hit.point.x - from.x, dz = hit.point.z - from.z, l = Math.hypot(dx, dz);
    if (l < MIN_STEP) return false;
    const a = new THREE.Vector3(from.x, EYE, from.z);
    return pathClear(a, new THREE.Vector3(from.x + dx / l * MIN_STEP, EYE, from.z + dz / l * MIN_STEP));
  }
  live.addStands(stands, stepOf, { free, depth, clamp, pathClear, route, floorAhead, floorMaybe, eye: EYE, band: BAND, freeBand: FREE_BAND,
    bounds: () => ({ shell: { ...shell }, obstacles: obstacles.map((o) => ({ ...o })), shellInset: SHELL, body: BODY, tall: TALL, band: BAND, freeBand: FREE_BAND, eye: EYE, snap: SNAP, texelPx: TEXEL_PX, rMax: R_MAX, K: +K.toFixed(1), coarse: obstacles.filter((o) => o.coarse).map((o) => o.name),
      rho: Object.fromEntries([...texels.keys()].map((t) => [t.name, +rhoOf(t).toFixed(1)])) }) });

  // the lamp pool: a soft warm disc on the boards, additive, eased in and out; the only thing the walk draws
  const pool = noPick(new THREE.Mesh(new THREE.CircleGeometry(POOL_R, 40).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
    uniforms: { a: { value: 0 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: 'varying vec2 vP; void main() { vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float a; varying vec2 vP; void main() { float r = length(vP) / ${POOL_R.toFixed(3)};
      float k = a * exp(-3.2 * r * r) * (1.0 - smoothstep(0.82, 1.0, r)); gl_FragColor = vec4(vec3(1.0, 0.78, 0.5) * k, 1.0); }`,
  })));
  pool.visible = false;
  pool.renderOrder = 2;
  scene.add(pool);
  let want = 0, shown = 0;
  const fade = () => (live.reduceMotion?.matches ? Infinity : 1000 / POOL_MS);
  function hover(it) {
    want = it.kind === 'walk' ? 1 : 0;
    if (want) pool.position.set(it.at.x, 0.004, it.at.z);   // where you will stand, not where the pointer is
    if (want || shown) live.render();
  }
  live.renderer.domElement.addEventListener('pointerleave', () => { want = 0; live.render(); });
  // merge 019 (panel 019 action 5): after the fly-in the pool breathes once at the standpoint nearest the hero, no text: the
  // floor is a place you can go. Once, and not if the pointer already found the floor
  const near = stands.reduce((a, b) => (dist2(b, hero.pos) < dist2(a, hero.pos) ? b : a));
  let hinted = false;
  const hint = () => {
    if (hinted || want || live.view() !== live.home || live.reduceMotion?.matches) return;
    hinted = true;
    pool.position.set(near.pos.x, 0.004, near.pos.z);
    want = 1; live.render();
    setTimeout(() => { if (pool.position.x === near.pos.x && pool.position.z === near.pos.z) { want = 0; live.render(); } }, 1100);
  };
  if (live.root.dataset.intro === 'playing') addEventListener('room:intro', () => setTimeout(hint, 1200), { once: true });
  else setTimeout(hint, 1600);

  return {
    name: 'walk',
    hover,
    update(dt) {
      if (shown === want) return false;
      shown = want > shown ? Math.min(want, shown + dt * fade()) : Math.max(want, shown - dt * fade());
      pool.material.uniforms.a.value = POOL_A * shown;
      pool.visible = shown > 0;
      live.render();
      return false;
    },
    onView() { want = shown = 0; pool.visible = false; },
    api: {
      stands: () => stands.map((s) => ({ id: s.id, label: s.label, pos: s.pos.toArray(), target: s.target.toArray() })),
      dropped: () => [...dropped],
      bounds: () => live.nav?.()?.bounds() ?? null,
      pool: () => ({ on: want > 0, visible: pool.visible, alpha: pool.material.uniforms.a.value, at: pool.position.toArray(), hinted }),   // on: where it is heading
    },
  };
}
