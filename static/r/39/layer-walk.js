import { noPick } from './layer-common.js';

const CARDS = {
  door: 'From here: the C64, Agents on the laptop, the cabinet and the canal.',
  window: 'From here: the elm on the quay, the lantern under it, the canal and the University across the water.',
  seat: 'From here: the hi-fi, the cabinet, the C64.',
};
const FLOOR = new Set(['at_floor', 'cz_rug']);
const FLOOR_Y = 0.06;
const POOL_R = 0.42;
const POOL_A = 0.32;
const POOL_MS = 140;
const SNAP = 0.6;
const SHELL = 0.25;
const BODY = 0.08;
const TALL = [0.9, 0.4];
const TALL_NAMES = /^(plato|at_plinth|cz_plant(_\d+)?|rack)$/;
const TEXEL_PX = Math.max(0.5, +new URLSearchParams(location.search).get('texelpx') || 1.5);
const R_MAX = Math.max(BODY, +new URLSearchParams(location.search).get('rmax') || 0.4);
const BAND = [1.0, 2.2];
const FREE_BAND = [1.45, 1.85];
const MIN_STEP = 0.35;
const STEP_OVER = 0.2;
const SEG = 0.08;
const ROUTE_STEP = 0.2;

export default function mount(live) {
  const { THREE, scene, byName } = live;
  if (live.gate || !live.addStands || !byName('at_floor')) return null;
  const rows = [];
  scene.traverse((o) => { const d = o.userData; if (d.st_label) rows.push({ id: o.name.replace(/^st_/, ''), label: d.st_label, order: d.st_order ?? 0,
    pos: o.getWorldPosition(new THREE.Vector3()), target: new THREE.Vector3(...d.st_target), lens: d.st_lens }); });
  rows.sort((a, b) => a.order - b.order);

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
  const dist2 = (s, p) => (s.pos.x - p.x) ** 2 + (s.pos.z - p.z) ** 2;

  const fb = new THREE.Box3().setFromObject(byName('at_floor'));
  const shell = { x0: fb.min.x + SHELL, x1: fb.max.x - SHELL, z0: fb.min.z + SHELL, z1: fb.max.z - SHELL };
  const boxes = new Map();
  for (const m of solids) { const t = top(m); if (!t || FLOOR.has(t.name)) continue;
    const b = new THREE.Box3().setFromObject(m); boxes.set(t, boxes.has(t) ? boxes.get(t).union(b) : b); }
  const area = (b) => (b.max.x - b.min.x) * (b.max.z - b.min.z), floorArea = area(fb);
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
    if (b.max.y < STEP_OVER || b.min.y > BAND[1] || area(b) > 0.5 * floorArea) continue;
    if (b.max.x < shell.x0 || b.min.x > shell.x1 || b.max.z < shell.z0 || b.min.z > shell.z1) continue;
    const rho = rhoOf(t);
    raw.push(b);
    obstacles.push({ name: t.name, top: +b.max.y.toFixed(3), bottom: +b.min.y.toFixed(3), rho: rho && +rho.toFixed(1) });
  }
  let K = 0;
  const gap2 = (b, p) => [Math.max(b.min.x - p.x, 0, p.x - b.max.x), Math.max(b.min.z - p.z, 0, p.z - b.max.z)];
  obstacles.forEach((o, i) => { const b = raw[i], g = Math.max(0, FREE_BAND[0] - b.max.y, b.min.y - FREE_BAND[1]);
    o.design = +Math.min(...places.map((q) => Math.hypot(...gap2(b, q.pos), g))).toFixed(3);
    o.planCap = Math.min(...places.map((q) => Math.max(...gap2(b, q.pos)))) - 0.002; });
  function sizeClear() {
    K = live.pxPerMetre?.() ?? 0;
    obstacles.forEach((o, i) => {
      const b = raw[i], g = Math.max(0, FREE_BAND[0] - b.max.y, b.min.y - FREE_BAND[1]);
      const D = o.rho && K ? Math.min(K / (TEXEL_PX * o.rho), o.design) : 0;
      const want = Math.sqrt(Math.max(0, D * D - g * g));
      const tall = (b.min.y < 0.05 && b.max.y >= TALL[0]) || TALL_NAMES.test(o.name);
      const r = Math.floor(1000 * Math.max(BODY, Math.min(o.planCap, tall ? R_MAX : BODY))) / 1000;
      Object.assign(o, { x0: b.min.x - r, x1: b.max.x + r, z0: b.min.z - r, z1: b.max.z + r, r, coarse: want > R_MAX + 1e-3, held: want > r + 1e-3 });
    });
    reach?.clear();
  }
  const shellOut = (p) => Math.max(0, shell.x0 - p.x) + Math.max(0, p.x - shell.x1) + Math.max(0, shell.z0 - p.z) + Math.max(0, p.z - shell.z1);
  function depth(p) {
    let d = Math.max(0, shell.x0 - p.x) + Math.max(0, p.x - shell.x1) + Math.max(0, shell.z0 - p.z) + Math.max(0, p.z - shell.z1)
      + Math.max(0, BAND[0] - p.y) + Math.max(0, p.y - BAND[1]);
    let o = 0;
    for (const b of obstacles) if (p.x > b.x0 && p.x < b.x1 && p.z > b.z0 && p.z < b.z1) o = Math.max(o, Math.min(p.x - b.x0, b.x1 - p.x, p.z - b.z0, b.z1 - p.z));
    return d + o;
  }
  const free = (p) => depth(p) === 0;
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
    let was = depth(a), out = shellOut(a);
    for (let i = 1; i <= n; i++) { q.copy(a).lerp(b, i / n); const d = depth(q), o = shellOut(q);
      if (d > was + 1e-6 || o > out + 1e-6) return false; was = Math.min(was, d); out = Math.min(out, o); }
    return true;
  }
  function clamp(a, b) {
    if (pathClear(a, b)) return b.clone();
    for (const c of [new THREE.Vector3(b.x, b.y, a.z), new THREE.Vector3(a.x, b.y, b.z), new THREE.Vector3(a.x, a.y, a.z).setY(b.y)]) if (pathClear(a, c)) return c;
    return a.clone();
  }
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
    for (;;) {
      let k = -1;
      for (let n = 0; n < A + 2; n++) if (!done[n] && dist[n] < Infinity && (k < 0 || dist[n] < dist[k])) k = n;
      if (k < 0) return null;
      if (k === B) break;
      done[k] = 1;
      for (const n of edges(k)) { const d = dist[k] + pts[k].distanceTo(pts[n]); if (d < dist[n]) { dist[n] = d; prev[n] = k; } }
    }
    const chain = [];
    for (let k = B; k >= 0; k = prev[k]) chain.unshift(pts[k]);
    const way = [];
    for (let s = 0; s < chain.length - 1;) {
      let t = chain.length - 1;
      while (t > s + 1 && !pathClear(chain[s], chain[t])) t--;
      if (t < chain.length - 1) way.push(chain[t].clone());
      s = t;
    }
    return way;
  }
  const reach = new Map();
  sizeClear();
  addEventListener('resize', sizeClear);
  function reachable(a, place) {
    const k = `${a.x.toFixed(3)},${a.z.toFixed(3)}>${place.id}`;
    if (!reach.has(k)) { if (reach.size > 256) reach.clear(); reach.set(k, route(a, new THREE.Vector3(place.pos.x, a.y, place.pos.z)) !== null); }
    return reach.get(k);
  }
  const tall = rows.filter((s) => s.pos.y > 1.4);
  const EYE = tall.length ? tall.reduce((a, s) => a + s.pos.y, 0) / tall.length : 1.6;

  function stepOf(hit, cur, from) {
    if (!FLOOR.has(top(hit.object)?.name) || hit.point.y > FLOOR_Y) return null;
    const other = places.filter((p) => p.id !== cur.id);
    const s = other.reduce((a, b) => (dist2(b, hit.point) < dist2(a, hit.point) ? b : a));
    if (!from) return null;
    const start = new THREE.Vector3(from.x, EYE, from.z);
    if (dist2(s, hit.point) <= SNAP * SNAP && reachable(start, s)) return { id: s.id, at: new THREE.Vector3(s.pos.x, 0, s.pos.z) };
    const want = new THREE.Vector3(hit.point.x, EYE, hit.point.z);
    let to = want;
    if (!free(want) || !pathClear(start, want)) {
      const n = Math.ceil(start.distanceTo(want) / SEG);
      to = null;
      for (let i = n - 1; i > 0 && !to; i--) { const c = start.clone().lerp(want, i / n); if (free(c) && pathClear(start, c)) to = c; }
      if (!to) return null;
    }
    if (Math.hypot(to.x - from.x, to.z - from.z) < MIN_STEP) return null;
    return { id: 'walk', at: new THREE.Vector3(to.x, 0, to.z), pos: to };
  }
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
    if (want) pool.position.set(it.at.x, 0.004, it.at.z);
    if (want || shown) live.render();
  }
  live.renderer.domElement.addEventListener('pointerleave', () => { want = 0; live.render(); });
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
      pool: () => ({ on: want > 0, visible: pool.visible, alpha: pool.material.uniforms.a.value, at: pool.position.toArray(), hinted }),
    },
  };
}
