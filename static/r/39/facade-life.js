
const TAU = 6.283185307179586;
const STEP = 1 / 30;
const TAU_UP = 0.1, TAU_DOWN = 0.45, TAU_DOWN_LATE = 0.2;
const FLOOR = 0.03;
const PATCH = [4, 6], EV_MAX = 4, AREA = 0.25, GAIN = 1.5, THRESH = 0.1;
const REST = 0.5;
const AFTER = [0.7, 1.0];
const CAP = 0.3;
export const DEFAULTS = {
  mode: 'life',
  density: 1,
  attack: TAU_UP, decay: TAU_DOWN, decay_late: TAU_DOWN_LATE,
  afterglow: 1,
  warmth: 0,
  rate: { intro: [2, 6], build: [6, 70], drop1: [260, 110], drop: [330, 140], breakdown: 4, outro: [35, 2] },
  cluster: 3,
  crackle: 0.09,
  spread: [8, 2.5],
  pulse: 2,
  peak: 0.95,
  front: [0.22, 0.35],
  hum: 0.12,
  hold_glow: 0.3,
  interior: 0,
  speed: 1,
  mapping: 'cartesian',
};
export const FIELDS = {
  breathe: { hz: 0.30, spread: 0.15, shape: 'sine' },
  wave: { hz: 0.32, spread: 1.5, shape: 'sine' },
  bloom: { hz: 0.45, spread: 0.55, shape: 'ad', a: 0.04, d: 0.4, curve: 2 },
};
export const MAPPINGS = ['grid', 'cartesian', 'polar'];
export function coords(W, H, mapping, wy = 1) {
  const N = W * H, u = new Float32Array(N), cx = (W - 1) / 2, cy = (H - 1) / 2, rmax = Math.hypot(cx, cy * wy) || 1;
  for (let i = 0; i < N; i++) {
    const x = i % W, y = (i / W) | 0;
    u[i] = mapping === 'grid' ? i / Math.max(1, N - 1) : mapping === 'polar' ? Math.hypot(x - cx, (y - cy) * wy) / rmax
      : (x / Math.max(1, W - 1) + y / Math.max(1, H - 1)) / 2;
  }
  return u;
}
export function resolve(json, name) {
  const ps = json?.presets || {}, key = name && ps[name] ? name : json?.active && ps[json.active] ? json.active : null;
  const p = key ? ps[key] : {}, rate = { ...DEFAULTS.rate, ...(p.rate || {}) };
  return { ...DEFAULTS, ...p, rate, name: key || 'v34' };
}
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const sm = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export function makeScore(bpm, sections) {
  const secs = []; let b0 = 0, nb = 0, nd = 0;
  for (const [kind, bars] of sections) { secs.push({ kind, b0, b1: b0 + bars * 4, n: kind === 'build' ? nb++ : kind === 'drop' ? nd++ : 0 }); b0 += bars * 4; }
  const total = b0, drops = secs.filter((s) => s.kind === 'drop').map((s) => s.b0);
  const at = (B) => { for (const s of secs) if (B < s.b1) return s; return secs[secs.length - 1]; };
  function knobs(B, o = {}) {
    const s = at(B), u = clamp((B - s.b0) / (s.b1 - s.b0));
    o.kind = s.kind; o.n = s.n; o.u = u; o.wild = 0.3; o.energie = 0.5; o.zwaai = 0.4; o.ghost = 0.4; o.charge = 1; o.cap = 0; o.hold = false;
    if (s.kind === 'intro') { o.build = 0.15 * u; o.dens = 0.25 + 0.25 * u; o.ghost = 0.6; o.zwaai = 0.6; }
    else if (s.kind === 'build') {
      const v = clamp((B - s.b0) / (s.b1 - 2 - s.b0));
      o.hold = B >= s.b1 - 2;
      o.build = o.hold ? 0.97 : s.n === 0 ? 0.15 + 0.8 * v ** 1.3 : 0.2 + 0.75 * v ** 1.15;
      o.dens = o.hold ? 1 : s.n === 0 ? 0.25 + 0.25 * v : 0.4 + 0.4 * v;
    } else if (s.kind === 'drop') { o.build = 0.35; o.dens = s.n === 0 ? 0.5 : 1; o.ghost = 0.3; o.charge = 0.4; o.cap = s.n === 0 ? 1 : 0; }
    else if (s.kind === 'breakdown') { o.build = 0; o.dens = 0.4; o.zwaai = 0.8; o.ghost = 0.8; o.energie = 0.3; }
    else { o.build = 0; o.dens = 1 - 0.7 * u; o.wild = 0.3 + 0.3 * u; }
    return o;
  }
  const spb = 60 / bpm, n = Math.ceil(total * spb / STEP) + 2, Et = new Float32Array(n), At = new Float32Array(n), k = {};
  let E = 0, A = 0, prevB = -1;
  for (let i = 0; i < n; i++) {
    const B = i * STEP / spb; knobs(B, k);
    const d = drops.findIndex((x) => prevB < x && x <= B);
    if (d >= 0) { E = 0; A = AFTER[Math.min(d, 1)]; }
    const b = k.build * k.charge;
    E = clamp(E + STEP * (0.075 * b - (k.build < 0.05 ? 0.25 : 0.01) * E));
    A = Math.max(0, A - STEP / (32 * spb));
    Et[i] = E; At[i] = A; prevB = B;
  }
  const idx = (B) => Math.min(n - 1, Math.max(0, Math.round(B * spb / STEP)));
  return { secs, total, drops, at, knobs, E: (B) => Et[idx(B)], after: (B) => At[idx(B)] };
}

function makeSystem(W, H, WY) {
  const N = W * H, S = W / 24, A = () => new Float64Array(N);
  const s = { W, H, N, t: 0, Lam: 0, fx: 0, fy: 0, tx: 0, ty: 0, E: 0, holdT: 0, after: 0, dropT: -9, latch: 0, fieldT: 0, R: 10 * S, hold: false, cap: 0, selfDrop: 0, fires: 0,
    gn: new Float64Array(28), th: A(), g: A(), u: A(), u2: A(), q: A(), qq: A(), ref: A(), lvl: A(), amp: A(), pt: A(), gh: A(), coh: A(), hp: A(), hd: A(), thn: A(),
    lag: A(), front: A(), stored: A(), nf: A(), tooth: A(), own: A(), voice: A(), dim: A(), dth: A(), dF: A(), c1: A(), s1: A(), c2: A(), s2: A(), ch: A(), sh: A(),
    ibD: new Float32Array(4096), ibJ: new Int32Array(4096), ibA: new Float32Array(4096), ibN: 0 };
  const X = new Int16Array(N), Y = new Int16Array(N);
  for (let i = 0; i < N; i++) { X[i] = i % W; Y[i] = (i / W) | 0; }
  let rng = Math.random;
  const wave = (n, f) => Array.from({ length: n }, () => ({ kx: (rng() * 2 - 1) * f / S, ky: (rng() * 2 - 1) * f * 1.4, p: rng() * TAU, v: (rng() - 0.5) * 0.5 }));
  function fld(ws, out) {
    let lo = 1e9, hi = -1e9;
    for (let i = 0; i < N; i++) { let h = 0; for (let j = 0; j < ws.length; j++) { const q = ws[j]; h += Math.cos(q.kx * X[i] + q.ky * Y[i] + q.p); } out[i] = h; if (h < lo) lo = h; if (h > hi) hi = h; }
    const k = 2 / (hi - lo + 1e-9); for (let i = 0; i < N; i++) out[i] = (out[i] - lo) * k - 1;
  }
  function reset(seed, b = 0) {
    rng = mulberry(seed);
    Object.assign(s, { t: 0, Lam: 0, E: 0, holdT: 0, after: 0, dropT: -9, latch: 0, fieldT: 0, hold: false, cap: 0, selfDrop: 0, ibN: 0 });
    s.fx = s.tx = W / 2 + (rng() - 0.5) * W * (1 - b); s.fy = s.ty = H / 2 + (rng() - 0.5) * H * (1 - b);
    for (let i = 0; i < N; i++) {
      s.th[i] = rng(); s.u[i] = rng(); s.u2[i] = rng(); s.q[i] = rng() * 0.8; s.hp[i] = rng(); s.hd[i] = rng() * 2 - 1; s.thn[i] = rng() * 2 - 1;
      s.g[i] = 0.5; s.coh[i] = 1; s.ref[i] = 0; s.lvl[i] = 0; s.amp[i] = 0; s.pt[i] = 0; s.gh[i] = 0; s.front[i] = -1; s.dim[i] = -9; s.stored[i] = 0;
    }
    s.gn.fill(0);
    s.wl = wave(4, 0.3); s.wo = wave(3, 0.35); s.wv = wave(3, 0.55); s.wg = wave(2, 0.4);
    s.wf = [s.wl, s.wo, s.wv];
    fld(s.wg, s.lag); fld(s.wl, s.tooth); fld(s.wo, s.own); fld(s.wv, s.voice);
  }
  const dist = (i) => Math.hypot(X[i] - s.fx, (Y[i] - s.fy) * WY);
  function drop(after, cap) {
    const sig2 = 60 * S * S, v = 20 * S, capR = CAP * W;
    for (let i = 0; i < N; i++) {
      const d = dist(i);
      s.stored[i] = Math.min(1, Math.max(0, s.q[i]) * 0.45 + s.E * Math.exp(-d * d / sig2));
      s.front[i] = cap && d > capR * (1 + 0.25 * s.voice[i]) ? -1 : s.t + d / v + 0.04 * rng() + 0.03 * Math.max(0, 1 - s.stored[i]);
    }
    s.dropT = s.t; s.latch = 1; s.after = after; s.E = 0; s.holdT = 0; s.Lam = 0; s.cap = cap ? 1 : 0;
  }
  const push = (d, j, a) => { if (s.ibN < 4096) { s.ibD[s.ibN] = d; s.ibJ[s.ibN] = j; s.ibA[s.ibN] = a; s.ibN++; } };
  function step(dt, clock, k) {
    const w = k.wild, fb = clock.bpm / 60;
    s.t += dt;
    const bRaw = k.build;
    s.after = Math.max(0, s.after - dt / (8 * 4 * 60 / clock.bpm));
    const af = s.after, b = Math.min(1, bRaw), bE = Math.max(b, 0.62 * af);
    if (bRaw < 0.9) s.latch = 0;
    const hold = (bRaw >= 0.965 && !s.latch) || !!k.forceHold;
    s.holdT = hold ? s.holdT + dt : 0;
    if (s.holdT > 2 * 4 * 60 / clock.bpm) s.selfDrop = 1;
    if (!k.forceHold) { const bc = b * (k.charge ?? 1); s.E = clamp(s.E + dt * (0.075 * bc - (b < 0.05 ? 0.25 : 0.01) * s.E)); }
    if (rng() < dt * (0.06 + 0.45 * w) * (1 - 0.9 * b)) { const L = Math.min(16 * S, 1.6 * S / Math.pow(rng() + 0.02, 0.7)), a = rng() * TAU; s.tx = clamp(s.tx + L * Math.cos(a), 0, W - 1); s.ty = clamp(s.ty + 0.5 * L / WY * Math.sin(a), 0, H - 1); }
    const settle = dt * (0.25 * b + 1.5 * sm(0.7, 0.95, b));
    s.tx += (W / 2 - s.tx) * settle; s.ty += (H / 2 - s.ty) * settle;
    const sp = Math.min(1, dt * (0.5 + 2 * b)); s.fx += (s.tx - s.fx) * sp; s.fy += (s.ty - s.fy) * sp;
    for (const ws of s.wf) for (const q of ws) { q.v = clamp(q.v + (rng() - 0.5) * Math.sqrt(dt) * 0.5, -0.6, 0.6); q.p += dt * q.v * (0.25 + 1.2 * w + 0.6 * b); }
    s.fieldT += dt; if (s.fieldT > 0.1) { s.fieldT = 0; fld(s.wl, s.tooth); fld(s.wo, s.own); fld(s.wv, s.voice); }
    const sq = Math.sqrt(dt), G = s.gn; for (let j = 0; j < 28; j++) G[j] += -G[j] * dt * 0.7 + (rng() - 0.5) * sq * 2.4;
    const teeth = 0.4 + 4.6 * Math.pow(1 - b, 1.5), P = 8 * Math.pow(2, -3 * b);
    s.Lam += dt * fb / (4 * P) * (1 - 0.5 * af);
    const conductor = 5 * (1 - w) ** 2 + 2.5 * b * b + 2 * af, K = 1.2 + 3.5 * w + 1.5 * b;
    const noise = 0.45 * w ** 1.5 * (1 - 0.6 * b), detune = fb * (0.03 + 0.16 * w) * (1 - 0.5 * b), quant = Math.max(0, 1 - 2.2 * w);
    const delayAmt = k.zwaai * (1 - 0.85 * b) * (1 - 0.7 * af);
    const gather = 0.3 * sm(0.5, 0.97, b) * (1 - af);
    const dens = 0.33 + 0.3 * k.energie + 0.08 * sm(0, 0.75, b) + 0.25 * af;
    const R = (10 - 4 * sm(0.3, 0.95, b) + 6 * af) * S, maxD = Math.hypot(W, H * WY) * 0.6;
    const alpha = Math.min(0.235 - 0.03 * b, -0.04 + 0.3 * Math.pow(w, 0.85) + 0.07 * b + 0.12 * af);
    const thrSpread = 0.04 + 0.3 * w * w, restT = 0.34 + 0.16 * (1 - b), travel = 0.08 - 0.05 * b;
    const pw = 0.09 + 0.24 * Math.pow(1 - bE, 1.5);
    const att = 0.15 * Math.pow(1 - bE, 2) + 0.002;
    const dG = Math.exp(-dt / (0.04 + 0.9 * k.ghost * (1 - 0.75 * bE))), leak = Math.exp(-dt / (2.5 - 1.5 * b));
    const th = s.th, g = s.g, dth = s.dth, dF = s.dF, c1 = s.c1, s1 = s.s1, c2 = s.c2, s2 = s.s2, ch = s.ch, sh = s.sh;
    for (let i = 0; i < N; i++) { const a = TAU * th[i]; c1[i] = Math.cos(a); s1[i] = Math.sin(a); c2[i] = Math.cos(2 * a); s2[i] = Math.sin(2 * a); ch[i] = Math.cos(0.5 * a); sh[i] = Math.sin(0.5 * a); dF[i] = dist(i); }
    for (let i = 0; i < N; i++) {
      const x = X[i], y = Y[i], d = dF[i], dn = Math.min(1, d / maxD);
      const gx = x / (W - 1) * 6, gy = y / (H - 1) * 3, x0 = Math.min(5, gx | 0), y0 = Math.min(2, gy | 0), uu = gx - x0, vv = gy - y0;
      s.nf[i] = (G[y0 * 7 + x0] * (1 - uu) + G[y0 * 7 + x0 + 1] * uu) * (1 - vv) + (G[(y0 + 1) * 7 + x0] * (1 - uu) + G[(y0 + 1) * 7 + x0 + 1] * uu) * vv;
      const gu = 0.5 + 0.4 * s.lag[i] + 0.1 * s.u[i], t1 = 0.06 + 0.2 * dn + 0.14 * gu, t2 = t1 + 0.2 + 0.06 * gu;
      const gr = bE < t1 ? 0.5 : bE < t2 ? 1 : 2;
      if (gr !== g[i]) { th[i] = (th[i] * g[i] / gr) % 1; g[i] = gr; const a = TAU * th[i]; c1[i] = Math.cos(a); s1[i] = Math.sin(a); c2[i] = Math.cos(2 * a); s2[i] = Math.sin(2 * a); ch[i] = Math.cos(0.5 * a); sh[i] = Math.sin(0.5 * a); }
      const tz = (s.tooth[i] * 0.5 + 0.5) * teeth, tooth = quant * Math.round(tz) + (1 - quant) * tz;
      const delay = delayAmt * (dn * 1.1 + 0.2 * s.lag[i]);
      let ideal = (clock.beat - delay) * gr + tooth * s.Lam - th[i]; ideal -= Math.round(ideal);
      let cs = 0, sn = 0, c = 0;
      for (let dy = -1; dy <= 1; dy++) { const yy = y + dy; if (yy < 0 || yy >= H) continue;
        for (let dx = -1; dx <= 1; dx++) { const xx = x + dx; if (xx < 0 || xx >= W) continue; const j = yy * W + xx, r = gr / g[j];
          if (r === 1) { cs += c1[j]; sn += s1[j]; } else if (r === 2) { cs += c2[j]; sn += s2[j]; } else if (r === 0.5) { cs += ch[j]; sn += sh[j]; }
          else { const a = TAU * th[j] * r; cs += Math.cos(a); sn += Math.sin(a); }
          c++; } }
      cs /= c; sn /= c; const r = Math.hypot(cs, sn); s.coh[i] = r;
      let dd = Math.atan2(sn, cs) / TAU - th[i]; dd -= Math.round(dd);
      dth[i] = dt * (fb * gr + tooth * fb / (4 * P) + detune * gr * s.own[i] + noise * s.nf[i] + conductor * ideal + K * r * Math.sin(TAU * dd) / TAU);
    }
    if (rng() < dt * 5 * w * w) for (let j = 0, n = 1 + Math.floor(rng() * 4 * w); j < n; j++) dth[Math.floor(rng() * N)] += rng() - 0.5;
    let m = 0;
    for (let e = 0; e < s.ibN; e++) { const dl = s.ibD[e] - dt, j = s.ibJ[e];
      if (dl <= 0) { if (s.ref[j] <= 0) s.q[j] = Math.max(-0.6, s.q[j] + s.ibA[e]); } else { s.ibD[m] = dl; s.ibJ[m] = j; s.ibA[m] = s.ibA[e]; m++; } }
    s.ibN = m;
    const Dq = Math.min(0.5, dt * 4 * (1 - w) ** 2), q = s.q, qq = s.qq;
    for (let i = 0; i < N; i++) { const x = X[i], y = Y[i]; let mm = 0, c = 0; if (x > 0) { mm += q[i - 1]; c++; } if (x < W - 1) { mm += q[i + 1]; c++; } if (y > 0) { mm += q[i - W]; c++; } if (y < H - 1) { mm += q[i + W]; c++; } qq[i] = q[i] + Dq * (mm / c - q[i]); }
    q.set(qq);
    const g12 = 12 * S;
    for (let i = 0; i < N; i++) {
      const before = th[i]; th[i] += dth[i]; s.ref[i] -= dt; q[i] *= leak;
      const wrapped = Math.floor(th[i]) !== Math.floor(before) && dth[i] > 0;
      th[i] -= Math.floor(th[i]);
      const dFi = dF[i];
      if (wrapped) {
        const v = 0.5 + 0.3 * s.voice[i] + 0.1 * (s.u2[i] - 0.5) + gather * (dFi / g12 - 0.3 + 0.18 * s.own[i]);
        let amt = clamp(0.3 + 1.7 * (dens - v), 0, 1.15);
        amt *= 1 + 0.7 * w * (rng() - 0.5);
        if (s.ref[i] > 0) { q[i] = Math.min(0.95, q[i] + 0.5 * amt); if (g[i] >= 2 && amt > 0.25 && !hold && s.t - s.dim[i] > 0.22) { const a = Math.min(0.25, 0.3 * amt * bE * bE); if (a > s.lvl[i]) { s.amp[i] = a; s.pt[i] = 0.07; s.dim[i] = s.t; } } }
        else q[i] += amt;
      }
      const thr = 1 + thrSpread * s.thn[i];
      if (q[i] >= thr) {
        if (hold) { q[i] = Math.min(q[i], thr * 1.6); continue; }
        if (s.ref[i] > 0) { q[i] = Math.min(q[i], thr * 0.5); continue; }
        const e = q[i], near = Math.exp(-dFi * dFi / (2 * R * R));
        s.amp[i] = Math.min(1, (0.68 + 0.32 * bE + 0.1 * Math.min(1, e - thr)) * (0.75 + 0.25 * s.coh[i] * s.coh[i]) * (0.7 + 0.3 * near) * (1 - 0.5 * gather * (1 - near)));
        s.pt[i] = pw * (0.8 + 0.4 * rng()); s.ref[i] = Math.max(REST, restT * (0.85 + 0.3 * rng())); q[i] = w * 0.1 * rng(); s.fires++;
        if (alpha) { const give = alpha * Math.min(e, 1.5), x = X[i], y = Y[i];
          if (x < W - 1) push(travel * (0.7 + 0.6 * rng()) * (1 + 0.8 * w * rng()), i + 1, give);
          if (x > 0) push(travel * (0.7 + 0.6 * rng()) * (1 + 0.8 * w * rng()), i - 1, give);
          if (y > 0) push(travel * (0.7 + 0.6 * rng()) * (1 + 0.8 * w * rng()), i - W, give);
          if (y < H - 1) push(travel * (0.7 + 0.6 * rng()) * (1 + 0.8 * w * rng()), i + W, give); }
      }
    }
    if (s.dropT >= 0 && s.t - s.dropT < maxD / (20 * S) + 0.4) for (let i = 0; i < N; i++) if (s.front[i] >= 0 && s.t >= s.front[i]) {
      s.front[i] = -1; s.amp[i] = Math.min(1, 0.55 + 0.6 * s.stored[i]); s.pt[i] = 0.1; s.lvl[i] = s.amp[i]; s.ref[i] = 0.5 + 0.2 * rng(); q[i] = 0;
      th[i] = (clock.beat * g[i] + 0.02) % 1;
    }
    const kAtt = Math.min(1, dt / att), dL = Math.exp(-dt / (pw * 0.8));
    for (let i = 0; i < N; i++) {
      if (s.pt[i] > 0) { s.pt[i] -= dt; s.lvl[i] += (s.amp[i] - s.lvl[i]) * kAtt; } else s.lvl[i] *= dL;
      s.gh[i] = Math.max(s.gh[i] * dG, s.lvl[i] * 0.4);
    }
    const fh = 0.45 + 1.7 * b, spreadH = 0.35 * (1 - b) + 0.15 * w;
    for (let i = 0; i < N; i++) { let ph = s.hp[i] + dt * fh * (1 + spreadH * s.hd[i]); let e = clock.beat - ph; e -= Math.round(e); ph += dt * 6 * b * b * b * e; s.hp[i] = ph - Math.floor(ph); }
    s.R = R; s.b = b; s.hold = hold; s.gather = gather;
    if (s.selfDrop) { s.selfDrop = 0; drop(0.85, 0); }
  }
  function render(out, k) {
    const hold = s.hold, Rh = hold ? Math.max(6 * S, s.R * 1.3 * (1 - 0.8 * s.holdT / 1.4)) : s.R * 1.3;
    const amp = Math.min(hold ? 0.85 : 0.5, (0.04 + 0.34 * s.E) * (hold ? 1 + 1.2 * Math.min(1, s.holdT / 1.2) : 1));
    const capR = CAP * W, cap = k.cap && s.cap, dF = s.dF;
    const depth = hold ? 0.3 : 1 - 0.55 * sm(0.6, 1, s.b || 0);
    let hum = 0;
    for (let i = 0; i < N; i++) {
      const d = dF[i];
      const edge = clamp(1 - d / Rh + 0.4 * s.voice[i] + 0.2 * s.own[i]) ** 1.5;
      const hm = s.E > 0.01 ? amp * edge * (1 - depth + depth * (0.5 + 0.5 * Math.cos(TAU * s.hp[i])) ** 2) : 0;
      let v = Math.min(1, (hold ? 0.35 : 1) * Math.max(s.lvl[i], s.gh[i] * 0.55 * k.afterglow) + hm);
      if (cap) v *= 0.12 + 0.88 * clamp(1.6 - 1.2 * d / (capR * (1 + 0.25 * s.voice[i])));
      out[i] = v; hum += hm;
    }
    s.hum = hum / N;
  }
  return { s, reset, step, render, drop, dist };
}

function makeSparks(W, H, WY, c) {
  const N = W * H, S = W / 24, A = () => new Float64Array(N), QN = 1024;
  const s = { W, H, N, t: 0, fx: 0, fy: 0, tx: 0, ty: 0, E: 0, holdT: 0, after: 0, dropT: -9, latch: 0, R: 10 * S, hold: false, cap: 0, selfDrop: 0, fires: 0, hum: 0, b: 0,
    lvl: A(), pt: A(), ref: A(), gh: A(), front: A(), dF: A(), amp: A(), voice: A(),
    qT: new Float64Array(QN), qJ: new Int32Array(QN), qN: 0, rate: 0 };
  const X = new Int16Array(N), Y = new Int16Array(N);
  for (let i = 0; i < N; i++) { X[i] = i % W; Y[i] = (i / W) | 0; }
  let rng = Math.random;
  const dist = (i) => Math.hypot(X[i] - s.fx, (Y[i] - s.fy) * WY);
  function reset(seed, b = 0) {
    rng = mulberry(seed);
    Object.assign(s, { t: 0, E: 0, holdT: 0, after: 0, dropT: -9, latch: 0, hold: false, cap: 0, selfDrop: 0, qN: 0 });
    s.fx = s.tx = W / 2 + (rng() - 0.5) * W * (1 - b); s.fy = s.ty = H / 2 + (rng() - 0.5) * H * (1 - b);
    for (let i = 0; i < N; i++) { s.lvl[i] = 0; s.pt[i] = 0; s.ref[i] = 0; s.gh[i] = 0; s.front[i] = -1; s.voice[i] = rng(); }
  }
  function pop(j, a = c.peak) {
    if (s.ref[j] > 0) return false;
    s.amp[j] = a * (0.75 + 0.25 * rng()); s.pt[j] = c.pulse * STEP - 1e-6; s.ref[j] = REST * (1 + 0.4 * rng()); s.fires++;
    return true;
  }
  function cluster(j, b) {
    if (!pop(j)) return;
    const n = Math.max(0, Math.round(c.cluster * (0.5 + rng())) - 1), gap = c.crackle * (1 - 0.5 * b);
    let x = X[j], y = Y[j], t = s.t;
    for (let m = 0; m < n && s.qN < QN; m++) {
      t += gap * (0.5 + rng());
      if (rng() < 0.8) x = clamp(x + (rng() < 0.5 ? -1 : 1) * (1 + (rng() < 0.3 ? 1 : 0)), 0, W - 1); else y = clamp(y + (rng() < 0.5 ? -1 : 1), 0, H - 1);
      s.qT[s.qN] = t; s.qJ[s.qN] = y * W + x; s.qN++;
    }
  }
  function drop(after, cap) {
    const v = 20 * S, capR = CAP * W;
    for (let i = 0; i < N; i++) { const d = dist(i);
      s.front[i] = (cap && d > capR * (1 + 0.25 * s.voice[i])) || rng() > c.front[cap ? 0 : 1] * (1 + 0.6 * Math.min(1, s.E) * Math.exp(-d / (8 * S))) ? -1 : s.t + d / v + 0.06 * rng(); }
    s.dropT = s.t; s.latch = 1; s.after = after; s.E = 0; s.holdT = 0; s.cap = cap ? 1 : 0; s.qN = 0;
  }
  const lerp = (r, u) => (Array.isArray(r) ? r[0] + (r[1] - r[0]) * u : r);
  function step(dt, clock, k) {
    s.t += dt;
    const bRaw = k.build, b = Math.min(1, bRaw), spb = 60 / clock.bpm;
    s.after = Math.max(0, s.after - dt / (8 * 4 * spb));
    if (bRaw < 0.9) s.latch = 0;
    const hold = (bRaw >= 0.965 && !s.latch) || !!k.forceHold;
    s.holdT = hold ? s.holdT + dt : 0;
    if (s.holdT > 2 * 4 * spb) s.selfDrop = 1;
    if (!k.forceHold) { const bc = b * (k.charge ?? 1); s.E = clamp(s.E + dt * (0.075 * bc - (b < 0.05 ? 0.25 : 0.01) * s.E)); }
    if (rng() < dt * (0.06 + 0.45 * k.wild) * (1 - 0.9 * b)) { const L = Math.min(16 * S, 1.6 * S / Math.pow(rng() + 0.02, 0.7)), a = rng() * TAU; s.tx = clamp(s.tx + L * Math.cos(a), 0, W - 1); s.ty = clamp(s.ty + 0.5 * L / WY * Math.sin(a), 0, H - 1); }
    const settle = dt * (0.25 * b + 1.5 * sm(0.7, 0.95, b));
    s.tx += (W / 2 - s.tx) * settle; s.ty += (H / 2 - s.ty) * settle;
    const sp = Math.min(1, dt * (0.5 + 2 * b)); s.fx += (s.tx - s.fx) * sp; s.fy += (s.ty - s.fy) * sp;
    for (let i = 0; i < N; i++) { s.ref[i] -= dt; s.dF[i] = dist(i); }
    const R = c.rate, u = k.u ?? 0;
    let rate = k.kind === 'intro' ? lerp(R.intro, u) : k.kind === 'build' ? lerp(R.build, b) : k.kind === 'drop' ? lerp(k.n === 0 ? R.drop1 : R.drop, 1 - s.after / AFTER[Math.min(k.n ?? 0, 1)])
      : k.kind === 'breakdown' ? lerp(R.breakdown, u) : lerp(R.outro, u);
    rate *= c.density;
    s.rate = hold ? 0 : rate;
    if (hold) s.qN = 0;
    else {
      let m = 0;
      for (let e = 0; e < s.qN; e++) { if (s.qT[e] <= s.t) pop(s.qJ[e]); else { s.qT[m] = s.qT[e]; s.qJ[m] = s.qJ[e]; m++; } }
      s.qN = m;
      const spread = (k.kind === 'build' ? lerp(c.spread, b) : k.kind === 'drop' ? lerp(c.spread, 0.2) : c.spread[0]) * S;
      for (let n = 0, lam = rate * dt; n < 12; n++) {
        if (rng() >= lam) break; lam -= 1;
        let j = -1;
        for (let tries = 0; tries < 3 && j < 0; tries++) {
          let x, y;
          if (k.kind === 'intro' || k.kind === 'breakdown' || k.kind === 'outro') { x = Math.floor(rng() * W); y = Math.floor(rng() * H); }
          else { const r = spread * Math.sqrt(-2 * Math.log(rng() + 1e-9)), a = rng() * TAU; x = Math.round(clamp(s.fx + r * Math.cos(a), 0, W - 1)); y = Math.round(clamp(s.fy + r * Math.sin(a) / WY, 0, H - 1)); }
          j = y * W + x; if (s.cap && k.cap && s.dF[j] > CAP * W) j = -1;
        }
        if (j >= 0) cluster(j, b);
      }
    }
    if (s.dropT >= 0 && s.t - s.dropT < Math.hypot(W, H * WY) / (20 * S) + 0.4) for (let i = 0; i < N; i++) if (s.front[i] >= 0 && s.t >= s.front[i]) { s.front[i] = -1; s.ref[i] = 0; pop(i, Math.min(1, c.peak * 1.05)); }
    const dG = Math.exp(-dt / 0.6);
    for (let i = 0; i < N; i++) {
      if (s.pt[i] > 0) { s.pt[i] -= dt; s.lvl[i] = s.amp[i]; } else s.lvl[i] = 0;
      s.gh[i] = c.afterglow > 0 ? Math.max(s.gh[i] * dG, s.lvl[i] * 0.25 * c.afterglow) : 0;
    }
    s.R = (10 - 4 * sm(0.3, 0.95, b)) * S; s.b = b; s.hold = hold;
    if (s.selfDrop) { s.selfDrop = 0; drop(0.85, 0); }
  }
  function render(out, k) {
    const hold = s.hold, Rh = hold ? Math.max(5 * S, s.R * (1 - 0.6 * Math.min(1, s.holdT / 1.4))) : s.R;
    const g = hold ? c.hold_glow * (0.5 + 0.5 * Math.min(1, s.holdT / 0.5)) : c.hum * s.E;
    let hum = 0;
    for (let i = 0; i < N; i++) {
      const edge = g > 0.001 ? clamp(1 - s.dF[i] / Rh + 0.3 * (s.voice[i] - 0.5)) ** 2 : 0, hm = g * edge;
      let v = Math.max(s.lvl[i], s.gh[i]) + hm;
      if (k.cap && s.cap) v *= 0.12 + 0.88 * clamp(1.6 - 1.2 * s.dF[i] / (CAP * W * (1 + 0.25 * s.voice[i])));
      out[i] = Math.min(1, v); hum += hm;
    }
    s.hum = hum / N;
  }
  return { s, reset, step, render, drop, dist };
}

function makeField(W, H, WY, c) {
  const N = W * H, s = { t: 0, fires: 0, E: 0, hum: 0, hold: false, R: 0, b: 0, rate: 0, dF: new Float64Array(N) };
  let key = null, U = null;
  const coord = () => { if (key !== c.mapping) { key = c.mapping; U = coords(W, H, c.mapping, WY); } return U; };
  function render(out) {
    const f = FIELDS[c.mode], u = coord(), p0 = f.hz * s.t;
    for (let i = 0; i < N; i++) {
      const p = p0 - f.spread * u[i];
      if (f.shape === 'sine') out[i] = 0.5 + 0.5 * Math.sin(TAU * p);
      else { const q = p - Math.floor(p); out[i] = clamp(q < f.a ? q / f.a : 1 - (q - f.a) / f.d) ** f.curve; }
    }
  }
  return { s, render, reset() {}, drop() {}, dist: () => 0,
    step(dt) { s.t += dt * clamp(c.speed ?? 1, 0.25, 1.5); } };
}

function makeReveal(N) {
  const st = { m: 0.05, T: 0 }, act = new Float32Array(N);
  function apply(x, y, dt, dens) {
    let mx = 0, n = 0;
    for (let i = 0; i < N; i++) { const v = x[i]; if (v > mx) mx = v; if (v > 0.02) act[n++] = v; }
    st.m = Math.max(0.05, mx, st.m * Math.exp(-dt / 2));
    const m = st.m;
    let target = 0;
    if (dens < 1) { if (n) { const a = act.subarray(0, n).sort(); target = a[Math.min(n - 1, Math.floor((1 - dens) * n))]; } else target = m; }
    st.T += (target - st.T) * (1 - Math.exp(-dt / 0.15)); if (dens >= 1 && st.T < 1e-6) st.T = 0;
    const Te = Math.min(0.999 * m, st.T);
    for (let i = 0; i < N; i++) { const xi = x[i]; y[i] = Te > 0 ? (xi <= Te ? 0 : (xi - Te) * m / (m - Te)) : xi; }
  }
  return { apply, reset() { st.m = 0.05; st.T = 0; } };
}

export function makeFacade({ W, H, seed = 1, bpm, sections, wy = 2.0, preset = {} }) {
  const c = { ...DEFAULTS, ...preset, rate: { ...DEFAULTS.rate, ...(preset.rate || {}) } }, sparks = c.mode === 'sparks', field = !!FIELDS[c.mode];
  const N = W * H, sys = field ? makeField(W, H, wy, c) : sparks ? makeSparks(W, H, wy, c) : makeSystem(W, H, wy), rev = makeReveal(N), score = makeScore(bpm, sections), spb = 60 / bpm;
  const clk = { beat: 0, bpm }, raw = new Float32Array(N), tgt = new Float32Array(N), L = new Float32Array(N), k = {};
  const last = new Float32Array(N), dirn = new Int8Array(N), cand = new Int8Array(N), blk = new Uint8Array(N), Lprev = new Float32Array(N);
  const [pr, pc] = [Math.min(PATCH[0], H), Math.min(PATCH[1], W)], PX = W - pc + 1, PY = H - pr + 1, NP = PX * PY + 1;
  const ring = new Uint8Array(NP * 30), cnt = new Uint8Array(NP), up = new Int32Array((W + 1) * (H + 1)), dn = new Int32Array((W + 1) * (H + 1));
  let ri = 0, acc = 0, prevB = -1e9, tickB = -1e9, jumpNext = true, lowSince = -1, selfDone = false, held = 0;
  const stats = { steps: 0, fires: 0, firesHold: 0, hold: false, hum: 0, E: 0, mean: 0, lit: 0, held: 0, jumps: 0 };
  function sat(src) {
    up.fill(0); dn.fill(0);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x, o = (y + 1) * (W + 1) + x + 1, c = src[i];
      up[o] = (c === 1 ? 1 : 0) + up[o - 1] + up[o - W - 1] - up[o - W - 2]; dn[o] = (c === -1 ? 1 : 0) + dn[o - 1] + dn[o - W - 1] - dn[o - W - 2]; }
  }
  const box = (T, x, y) => { const a = y * (W + 1) + x, b = (y + pr) * (W + 1) + x; return T[b + pc] - T[b] - T[a + pc] + T[a]; };
  const need = Math.ceil(AREA * pr * pc), needW = Math.ceil(AREA * N);
  function limit() {
    for (let i = 0; i < N; i++) { const v = Math.min(1, GAIN * (FLOOR + (1 - FLOOR) * L[i])), d = v - last[i]; cand[i] = d >= THRESH && dirn[i] <= 0 ? 1 : d <= -THRESH && dirn[i] >= 0 ? -1 : 0; blk[i] = 0; }
    sat(cand);
    let any = false;
    for (let p = 0; p < NP - 1; p++) { if (cnt[p] < EV_MAX) continue; const x = p % PX, y = (p / PX) | 0;
      const u = box(up, x, y), d = box(dn, x, y);
      if (u >= need || d >= need) { any = true; for (let yy = y; yy < y + pr; yy++) for (let xx = x; xx < x + pc; xx++) { const i = yy * W + xx; if ((u >= need && cand[i] === 1) || (d >= need && cand[i] === -1)) blk[i] = 1; } } }
    if (cnt[NP - 1] >= EV_MAX) { const u = up[up.length - 1], d = dn[dn.length - 1]; if (u >= needW || d >= needW) { any = true; for (let i = 0; i < N; i++) if ((u >= needW && cand[i] === 1) || (d >= needW && cand[i] === -1)) blk[i] = 1; } }
    if (any) for (let i = 0; i < N; i++) if (blk[i]) { L[i] = Lprev[i]; cand[i] = 0; held++; }
    for (let i = 0; i < N; i++) { const v = Math.min(1, GAIN * (FLOOR + (1 - FLOOR) * L[i]));
      if (cand[i] === 1) { dirn[i] = 1; last[i] = v; } else if (cand[i] === -1) { dirn[i] = -1; last[i] = v; }
      else if ((dirn[i] === 1 && v > last[i]) || (dirn[i] === -1 && v < last[i])) last[i] = v; }
    sat(cand);
    for (let p = 0; p < NP; p++) { const old = ring[p * 30 + ri]; let ev = 0;
      if (p < NP - 1) { const x = p % PX, y = (p / PX) | 0; ev = box(up, x, y) >= need || box(dn, x, y) >= need ? 1 : 0; }
      else ev = up[up.length - 1] >= needW || dn[dn.length - 1] >= needW ? 1 : 0;
      ring[p * 30 + ri] = ev; cnt[p] += ev - old; }
    ri = (ri + 1) % 30;
  }
  function resync(B) {
    const b0 = score.knobs(B, k).build;
    sys.reset((seed * 7919 + Math.floor(B * 4)) >>> 0, b0);
    const s = sys.s;
    s.E = score.E(B); s.after = score.after(B);
    const d = score.drops.findIndex((x) => B >= x && B - x < 2.5);
    if (d >= 0) { s.E = score.E(score.drops[d] - 0.01); sys.drop(AFTER[Math.min(d, 1)], d === 0); }
    else { const d2 = score.drops.findIndex((x, j) => B >= x && B < x + 128); if (d2 >= 0) { s.latch = 1; s.cap = d2 === 0 ? 1 : 0; } }
    rev.reset(); acc = 0; tickB = B; lowSince = -1; selfDone = false;
    L.fill(0); Lprev.fill(0); last.fill(GAIN * FLOOR); dirn.fill(0); ring.fill(0); cnt.fill(0); ri = 0;
    stats.jumps++;
  }
  function tick(B, low) {
    score.knobs(B, k); k.afterglow = c.afterglow;
    const s = sys.s;
    const d = score.drops.findIndex((x) => tickB < x && x <= B);
    if (d >= 0) { sys.drop(AFTER[Math.min(d, 1)], d === 0); }
    const lowHeld = low < 0.5 && (k.kind === 'build' || k.kind === 'drop');
    if (lowHeld) { if (lowSince < 0) { lowSince = B; selfDone = false; } k.forceHold = !selfDone; }
    else if (lowSince >= 0) { if (B - lowSince >= 4 && !selfDone) sys.drop(0.85, 0); lowSince = -1; }
    const fBefore = s.fires;
    clk.beat = B; sys.step(STEP, clk, k);
    if (lowHeld && s.latch && !selfDone && s.dropT === s.t) selfDone = true;
    sys.render(raw, k);
    if (sparks) tgt.set(raw);
    else if (field) rev.apply(raw, tgt, STEP, clamp(c.density, 0.05, 1));
    else rev.apply(raw, tgt, STEP, c.density === 1 ? k.dens : clamp(k.dens * c.density));
    const late = k.kind === 'build' ? sm(0.8, 0.9, k.build) : 0, td = c.decay + (c.decay_late - c.decay) * late;
    const ka = 1 - Math.exp(-STEP / c.attack), kd = 1 - Math.exp(-STEP / td);
    Lprev.set(L);
    let mean = 0, lit = 0;
    for (let i = 0; i < N; i++) { const t = tgt[i], c = L[i]; L[i] = c + (t - c) * (t > c ? ka : kd); }
    limit();
    for (let i = 0; i < N; i++) { mean += L[i]; if (L[i] > 0.3) lit++; }
    stats.steps++; stats.fires = s.fires; if (s.hold) stats.firesHold += s.fires - fBefore;
    stats.hold = s.hold; stats.hum = s.hum; stats.E = s.E; stats.mean = mean / N; stats.lit = lit / N; stats.held = held; stats.build = k.build; stats.kind = k.kind;
    tickB = B;
  }
  return {
    N, L, score, stats, sys, preset: c,
    frame(dt, B, low = 1) {
      if (jumpNext || (!field && Math.abs(B - (prevB + dt / spb)) > 0.5)) { resync(B); jumpNext = false; }
      prevB = B; acc += dt;
      let n = 0;
      if (acc >= STEP - 1e-9) { acc = Math.min(acc - STEP, STEP); n++; tick(B - acc / spb, low); }
      return L;
    },
    jump() { jumpNext = true; },
    still() {
      if (field) {
        sys.s.t = 2; resync(0); for (let n = 0; n < 60; n++) tick(0, 1);
        const out = Float32Array.from(L, (v) => 0.85 * v); jumpNext = true; return out;
      }
      if (sparks) {
        resync(136); for (let n = 0; n < 30; n++) tick(136 + n * STEP / spb, 1);
        const out = Float32Array.from(L, (v) => 0.85 * v); jumpNext = true; return out;
      }
      sys.reset(seed >>> 0, 1); const s = sys.s; s.E = 0.4; s.R = 8 * W / 24; s.hold = false;
      for (let i = 0; i < N; i++) { s.hp[i] = 0; s.dF[i] = sys.dist(i); }
      sys.render(raw, { cap: 0, afterglow: c.afterglow });
      let mx = 1e-6; for (let i = 0; i < N; i++) mx = Math.max(mx, raw[i]);
      const a = Float32Array.from(raw).sort(), T = a[Math.floor(0.5 * N)];
      const out = new Float32Array(N);
      for (let i = 0; i < N; i++) out[i] = raw[i] <= T ? 0 : 0.85 * (raw[i] - T) / (mx - T);
      jumpNext = true;
      return out;
    },
    houseBias(B) { const kk = score.knobs(B, {}); return (kk.kind === 'build' ? 0.3 * score.E(B) + 0.1 * kk.u : 0) - 0.25 * score.after(B); },
    resetHeld() { held = 0; },
  };
}
