import { noPick, easeInOut } from './layer-common.js';
import { C, FACES } from './content.js';

const VIEW = 'vitrine';
const PAD = 0.012, FOOT = 0.012;
const BOARD = 0.0022, SQUARE = 0.0025;
const OPEN_DEG = 176, NEAR_MM = 0.012, DIM = 0.68;
const T = { lift: 0.85, open: 0.75, back: 0.6 };
const PAPER = '#f2ead8', ENDPAPER = '#e7dcc4', PRINT = '#1f1b17', PEN = '#18203c';
const AW = 2048, AH = 1536, CELL = 660, ROW = 1140, ROW2 = 1164;

export const penLine = (ins) => { const s = String(ins?.line ?? '').trim(); return s && s !== '—' ? s : null; };
export const penYear = (ins, fmt) => (penLine(ins) && fmt?.showYear !== false ? String(ins?.year ?? '').trim() || null : null);
export const penName = (ins, fmt, owner) => String(ins?.name ?? fmt?.sign ?? owner ?? '').trim() || null;

export default function mount(live) {
  const { THREE, byName, camera } = live;
  const node = byName('pr_books'), U = node?.userData;
  if (!U?.book_lines || !U.book_geo) return null;
  const UI = C.book_ui ?? {}, INS = C.book_inscriptions ?? {}, FMT = C.book_titlepage ?? {};
  const OWNER = C.page?.name ?? '';
  const reduced = () => !!live.reduceMotion?.matches;

  const books = [];
  const names = U.book_lines.split('|'), G = U.book_geo;
  const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
  for (const b of C.books) {
    if (b.kind !== 'spine' && b.kind !== 'cover') continue;
    const i = names.findIndex((s) => s.startsWith(`${b.key}:author:`));
    if (i < 0) continue;
    const c = V(G.slice(9 * i, 9 * i + 3)), capV = V(G.slice(9 * i + 3, 9 * i + 6)), runV = V(G.slice(9 * i + 6, 9 * i + 9));
    let W, H, Tk, pos, quat, x0, x1, out;
    if (b.kind === 'spine') {
      [Tk, H, W] = b.size_m;
      x0 = c.x - Tk / 2; x1 = c.x + Tk / 2;
      pos = new THREE.Vector3(c.x, H / 2, c.z - W / 2);
      quat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
      out = new THREE.Vector3(0, 0, 1);
    } else {
      [W, H, Tk] = b.size_m;
      const up = capV.clone().normalize(), right = new THREE.Vector3(1, 0, 0), n = new THREE.Vector3().crossVectors(right, up);
      const corner = c.clone().addScaledVector(right, -(PAD + runV.length() / 2)).addScaledVector(up, -(PAD + FOOT));
      x0 = corner.x; x1 = corner.x + W;
      pos = corner.clone().addScaledVector(right, W / 2).addScaledVector(up, H / 2).addScaledVector(n, -Tk / 2);
      quat = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, n));
      out = n.clone().multiplyScalar(0.4).add(new THREE.Vector3(0, 0.6, 0));
    }
    books.push({ key: b.key, b, W, H, Tk, x0, x1, pos, quat, out, page: INS[b.key]?.title ? INS[b.key] : null });
  }
  if (!books.length) return null;
  books.sort((a, z) => a.x0 - z.x0);
  const byKey = new Map(books.map((s) => [s.key, s]));

  let baked = null;
  function bakedTris() {
    if (baked) return baked;
    baked = [];
    node.updateWorldMatrix(true, true);
    const inv = new THREE.Matrix4().copy(node.matrixWorld).invert(), p = new THREE.Vector3();
    node.traverse((m) => {
      if (!m.isMesh || m === book || m === dim) return;
      const P = m.geometry.attributes.position, M = new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld);
      const xs = new Float32Array(P.count);
      for (let i = 0; i < P.count; i++) xs[i] = p.fromBufferAttribute(P, i).applyMatrix4(M).x;
      const idx = m.geometry.index ? Array.from(m.geometry.index.array) : Array.from({ length: P.count }, (_, i) => i);
      const owner = new Int16Array(idx.length / 3).fill(-1);
      const side = (s, x) => Math.abs(x - s.x0) < 4e-4 || Math.abs(x - s.x1) < 4e-4;
      for (let t = 0; t < owner.length; t++) {
        const a = xs[idx[3 * t]], b = xs[idx[3 * t + 1]], c = xs[idx[3 * t + 2]];
        owner[t] = books.findIndex((s) => side(s, a) && side(s, b) && side(s, c));
      }
      baked.push({ mesh: m, idx, owner, index0: m.geometry.index });
    });
    return baked;
  }
  function gap(slot) {
    const k = slot ? books.indexOf(slot) : -1;
    for (const r of bakedTris()) {
      if (k < 0) { r.mesh.geometry.setIndex(r.index0); continue; }
      const keep = [];
      for (let t = 0; t < r.owner.length; t++) if (r.owner[t] !== k) keep.push(r.idx[3 * t], r.idx[3 * t + 1], r.idx[3 * t + 2]);
      r.mesh.geometry.setIndex(keep);
    }
  }
  const trisOf = (slot) => bakedTris().reduce((n, r) => n + r.owner.filter((o) => o === books.indexOf(slot)).length, 0);

  function bookAt(pw) {
    const x = node.worldToLocal(pw.clone()).x;
    let best = null, bd = NEAR_MM;
    for (const s of books) { const d = Math.max(s.x0 - x, x - s.x1, 0); if (d < bd) { bd = d; best = s; } }
    return best;
  }

  let book = null, dim = null, canvas = null, tex = null, front = null, hand = null, lastPaint = null;
  const state = { slot: null, phase: null, t: 0, open: 0, wantOpen: false, yaw: 0, pitch: 0, sway: 0, drawn: null, from: null };
  const face = (b, k) => `${k} %px ${(b.style?.face ?? 'narrow') === 'serif' ? FACES.serif : FACES.narrow}`;
  const titleOf = (s) => s.page?.title ?? s.b.title.join(' ');
  const authorOf = (s) => s.page?.author ?? s.b.author;

  function build(s) {
    const { W, H, Tk } = s, x0 = -W / 2, x1 = W / 2, y0 = -H / 2, y1 = H / 2, z0 = -Tk / 2, z1 = Tk / 2;
    const c = Math.min(ROW / H, CELL / W);
    const cell = (i) => [i * (CELL + 14), 0, i * (CELL + 14) + Math.round(W * c), Math.round(H * c)];
    const R = { front: cell(0), back: cell(1), page: cell(2), spine: [0, ROW2, Math.round(H * c), ROW2 + Math.max(8, Math.round(Tk * c))],
      end: [1160, ROW2, 1160 + 400, ROW2 + 360], edge: [1580, ROW2, 1580 + 256, ROW2 + 64], cloth: [1580, ROW2 + 80, 1580 + 96, ROW2 + 176] };
    const pos = [], uv = [], col = [], index = [], turn = [];
    const quad = (pts, [u0, v0, u1, v1], shade, rot = false, turns = false) => {
      const base = pos.length / 3, T0 = 1 - v0 / AH, B0 = 1 - v1 / AH, L = u0 / AW, Rr = u1 / AW;
      const uvs = rot ? [[Rr, B0], [Rr, T0], [L, T0], [L, B0]] : [[L, B0], [Rr, B0], [Rr, T0], [L, T0]];
      pts.forEach((p, i) => { pos.push(...p); uv.push(...uvs[i]); col.push(shade, shade, shade); if (turns) turn.push(base + i); });
      index.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };
    const Zp = (z, a, b, e, f) => [[a, e, z], [b, e, z], [b, f, z], [a, f, z]], Zn = (z, a, b, e, f) => [[b, e, z], [a, e, z], [a, f, z], [b, f, z]];
    const Xn = (x, e, f, a, b) => [[x, e, a], [x, e, b], [x, f, b], [x, f, a]], Xp = (x, e, f, a, b) => [[x, e, b], [x, e, a], [x, f, a], [x, f, b]];
    const Yp = (y, a, b, e, f) => [[a, y, f], [b, y, f], [b, y, e], [a, y, e]], Yn = (y, a, b, e, f) => [[a, y, e], [b, y, e], [b, y, f], [a, y, f]];
    const zb = z0 + BOARD, zf = z1 - BOARD, bx0 = x0 + BOARD, bx1 = x1 - SQUARE, by0 = y0 + SQUARE, by1 = y1 - SQUARE;
    quad(Zp(z1, x0, x1, y0, y1), R.front, 1, false, true);
    quad(Zn(zf, x0, x1, y0, y1), R.end, 0.97, false, true);
    quad(Xp(x1, y0, y1, zf, z1), R.cloth, 0.8, false, true);
    quad(Yp(y1, x0, x1, zf, z1), R.cloth, 0.95, false, true);
    quad(Yn(y0, x0, x1, zf, z1), R.cloth, 0.7, false, true);
    quad(Zn(z0, x0, x1, y0, y1), R.back, 0.9);
    quad(Xp(x1, y0, y1, z0, zb), R.cloth, 0.8);
    quad(Yp(y1, x0, x1, z0, zb), R.cloth, 0.95);
    quad(Yn(y0, x0, x1, z0, zb), R.cloth, 0.7);
    quad(Xn(x0, y0, y1, z0, zf), R.spine, 0.94, true);
    quad(Yp(y1, x0, bx0, zb, zf), R.cloth, 0.95);
    quad(Yn(y0, x0, bx0, zb, zf), R.cloth, 0.7);
    quad(Zp(zf, bx0, bx1, by0, by1), R.page, 1);
    quad(Xp(bx1, by0, by1, zb, zf), R.edge, 0.86, true);
    quad(Yp(by1, bx0, bx1, zb, zf), R.edge, 0.96);
    quad(Yn(by0, bx0, bx1, zb, zf), R.edge, 0.7);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(index);
    front = { ids: turn, rest: turn.map((i) => [pos[3 * i], pos[3 * i + 2]]), hx: x0, hz: z1 };
    s.pageBox = [bx0, bx1, by0, by1, zf];
    lastPaint = () => paint(s, R, c);
    lastPaint();
    return geo;
  }
  function swing(deg) {
    const P = book.geometry.attributes.position, a = THREE.MathUtils.degToRad(deg), cs = Math.cos(a), sn = Math.sin(a);
    front.ids.forEach((id, k) => {
      const dx = front.rest[k][0] - front.hx, dz = front.rest[k][1] - front.hz;
      P.setX(id, front.hx + dx * cs - dz * sn); P.setZ(id, front.hz + dx * sn + dz * cs);
    });
    P.needsUpdate = true;
  }

  const rnd = (seed) => { let x = seed >>> 0 || 1; return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; };
  const seedOf = (s) => [...s].reduce((h, ch) => (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0, 7);
  let weave = null;
  function cloth(g, [a, b, c, d], ground, r) {
    const w = c - a, h = d - b;
    g.save(); g.beginPath(); g.rect(a, b, w, h); g.clip();
    g.fillStyle = ground; g.fillRect(a, b, w, h);
    if (!weave) {
      weave = Object.assign(document.createElement('canvas'), { width: 8, height: 8 });
      const x = weave.getContext('2d');
      for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) { const over = ((i >> 1) + (j >> 1)) % 2; x.fillStyle = over ? `rgba(255,255,255,${i % 2 ? 0.10 : 0.05})` : `rgba(0,0,0,${j % 2 ? 0.12 : 0.05})`; x.fillRect(i, j, 1, 1); }
    }
    g.fillStyle = g.createPattern(weave, 'repeat'); g.fillRect(a, b, w, h);
    for (let i = 0; i < w * h / 900; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '0,0,0'},${0.02 + r() * 0.04})`; g.fillRect(a + r() * w, b + r() * h, 1 + r() * 3, 1); }
    const lg = g.createLinearGradient(a, b, a, d);
    lg.addColorStop(0, 'rgba(255,255,255,.06)'); lg.addColorStop(0.5, 'rgba(0,0,0,0)'); lg.addColorStop(1, 'rgba(0,0,0,.14)');
    g.fillStyle = lg; g.fillRect(a, b, w, h);
    g.restore();
  }
  function paper(g, [a, b, c, d], ground, r, gutter) {
    const w = c - a, h = d - b;
    g.save(); g.beginPath(); g.rect(a, b, w, h); g.clip();
    g.fillStyle = ground; g.fillRect(a, b, w, h);
    for (let i = 0; i < w * h / 260; i++) { g.fillStyle = `rgba(${r() < 0.6 ? '120,96,60' : '255,255,255'},${0.015 + r() * 0.035})`; g.fillRect(a + r() * w, b + r() * h, 1 + r() * 2, 1 + r()); }
    const gx = g.createLinearGradient(gutter === 'left' ? a : c, 0, gutter === 'left' ? a + w * 0.16 : c - w * 0.16, 0);
    gx.addColorStop(0, 'rgba(40,28,14,.42)'); gx.addColorStop(0.35, 'rgba(40,28,14,.12)'); gx.addColorStop(1, 'rgba(40,28,14,0)');
    g.fillStyle = gx; g.fillRect(a, b, w, h);
    const gy = g.createLinearGradient(0, b, 0, d);
    gy.addColorStop(0, 'rgba(255,255,255,.05)'); gy.addColorStop(1, 'rgba(60,40,20,.10)');
    g.fillStyle = gy; g.fillRect(a, b, w, h);
    g.restore();
  }
  const fit = (g, font, s, px, room) => { g.font = font.replace('%', String(px)); const w = g.measureText(s).width; return w > room ? px * room / w : px; };
  function wrap(g, font, s, px, room) {
    g.font = font.replace('%', String(px));
    const out = [];
    for (const w of s.split(/\s+/)) { const t = out.length ? `${out.at(-1)} ${w}` : w; if (out.length && g.measureText(t).width <= room) out[out.length - 1] = t; else out.push(w); }
    return out;
  }
  function pen(g, s, x, y, px, r) {
    let dx = 0;
    const drift = (r() - 0.5) * 0.05, wave = 0.6 + r() * 0.8;
    g.save(); g.globalCompositeOperation = 'multiply'; g.textBaseline = 'alphabetic'; g.fillStyle = PEN;
    let last = null;
    for (const ch of s.normalize('NFD')) {
      if (/\p{M}/u.test(ch)) { if (ch === '\u0308' && last) for (const k of [0.3, 0.7]) { g.beginPath(); g.arc(last.x + last.w * k, last.y - px * 0.62, px * 0.055, 0, 7); g.fill(); } continue; }
      const p = px * (0.97 + r() * 0.06);
      g.font = `${p}px ${HAND}`;
      const yy = y + dx * drift + Math.sin(dx / px * wave) * px * 0.035 + (r() - 0.5) * px * 0.05;
      g.globalAlpha = 0.78 + r() * 0.2;
      if (ch !== ' ') g.fillText(ch, x + dx, yy);
      last = { x: x + dx, y: yy, w: g.measureText(ch).width };
      dx += g.measureText(ch).width * (ch === ' ' ? 0.9 : 0.96 + r() * 0.05);
    }
    g.restore();
    return dx;
  }
  const HAND = '"Kalam", "Segoe Print", "Bradley Hand", cursive';

  function paint(s, R, c) {
    const g = canvas.getContext('2d'), b = s.b, r = rnd(seedOf(s.key)), ink = b.ink ?? '#111', ground = b.ground ?? '#777';
    const { W, H, Tk } = s;
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    g.fillStyle = ground; g.fillRect(0, 0, AW, AH);
    g.textBaseline = 'alphabetic'; g.textAlign = 'left';
    const title = titleOf(s), author = authorOf(s), aink = b.style?.author_ink ?? ink;
    {
      const [a, t, e, f] = R.front, w = e - a, room = w - 2 * PAD * c - 0.008 * c, x = a + PAD * c + 0.008 * c;
      cloth(g, R.front, ground, r);
      const lines = b.kind === 'cover' ? b.title : wrap(g, face(b, 700), title, 0.026 * c, room);
      let px = 0.026 * c; for (const l of lines) px = Math.min(px, fit(g, face(b, 700), l, px, room));
      let y = t + (PAD + 0.018) * c + px * 0.8;
      g.fillStyle = ink;
      for (const l of lines) { g.font = face(b, 700).replace('%', String(px)); g.fillText(l, x, y); y += px * 1.22; }
      g.fillRect(x, y - px * 0.72, room, Math.max(2, 0.0007 * c));
      const apx = fit(g, face(b, 400), author, 0.0115 * c, room);
      g.fillStyle = aink; g.font = face(b, 400).replace('%', String(apx)); g.fillText(author, x, f - (PAD + FOOT) * c + apx * 0.36);
      const jx = a + 0.008 * c, jg = g.createLinearGradient(jx - 6, 0, jx + 7, 0);
      jg.addColorStop(0, 'rgba(0,0,0,0)'); jg.addColorStop(0.45, 'rgba(0,0,0,.30)'); jg.addColorStop(0.6, 'rgba(255,255,255,.10)'); jg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = jg; g.fillRect(jx - 6, t, 13, f - t);
    }
    {
      const [, t, e, f] = R.back;
      cloth(g, R.back, ground, r);
      const jx = e - 0.008 * c, jg = g.createLinearGradient(jx - 7, 0, jx + 6, 0);
      jg.addColorStop(0, 'rgba(0,0,0,0)'); jg.addColorStop(0.4, 'rgba(255,255,255,.10)'); jg.addColorStop(0.55, 'rgba(0,0,0,.30)'); jg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = jg; g.fillRect(jx - 7, t, 13, f - t);
    }
    {
      const [a, t, e, f] = R.spine, w = e - a, h = f - t, m = 0.014 * c, gapx = 0.012 * c;
      cloth(g, R.spine, ground, r);
      const lines = b.kind === 'spine' ? b.title : [title.toUpperCase()], sa = b.kind === 'spine' ? b.author : author.split(' ').at(-1).toUpperCase();
      const apx = Math.min(0.0085 * c / 0.72, h * 0.5), ax = (g.font = face(b, 700).replace('%', String(apx)), g.measureText(sa).width);
      const room = w - 2 * m - gapx - ax, n = lines.length;
      let px = Math.min(0.011 * c / 0.72, h * 0.78 / (n * 1.18));
      for (const l of lines) px = Math.min(px, fit(g, face(b, 700), l, px, room));
      const lead = px * 1.18, y0 = t + h / 2 - (n * lead) / 2 + px * 0.86;
      g.fillStyle = ink; g.font = face(b, 700).replace('%', String(px));
      lines.forEach((l, i) => g.fillText(l, a + m, y0 + i * lead));
      g.fillStyle = aink; g.font = face(b, 700).replace('%', String(apx)); g.fillText(sa, e - m - ax, t + h / 2 + apx * 0.36);
      g.fillStyle = ink;
      for (const xx of [a + 0.006 * c, e - 0.006 * c]) g.fillRect(xx - 1, t + 3, 2, h - 6);
      const rg = g.createLinearGradient(0, t, 0, f);
      rg.addColorStop(0, 'rgba(0,0,0,.34)'); rg.addColorStop(0.22, 'rgba(0,0,0,0)'); rg.addColorStop(0.5, 'rgba(255,255,255,.07)'); rg.addColorStop(0.78, 'rgba(0,0,0,0)'); rg.addColorStop(1, 'rgba(0,0,0,.34)');
      g.fillStyle = rg; g.fillRect(a, t, w, h);
    }
    paper(g, R.end, ENDPAPER, r, 'right');
    {
      const [a, t, e, f] = R.edge;
      g.fillStyle = '#e4dac4'; g.fillRect(a, t, e - a, f - t);
      for (let y = t; y < f; y += 2) { g.fillStyle = `rgba(90,70,40,${0.10 + r() * 0.22})`; g.fillRect(a, y, e - a, 1); }
    }
    cloth(g, R.cloth, ground, r);
    const drawn = { title: [], author: [], name: null, year: null, line: null };
    {
      const [a, t, e, f] = R.page, w = e - a, h = f - t, cx = a + w * 0.53, room = w * 0.72;
      paper(g, R.page, PAPER, r, 'left');
      g.fillStyle = PRINT; g.textAlign = 'center';
      const T700 = `700 %px ${FACES.serif}`, T400 = `400 %px ${FACES.serif}`;
      let px = 0.0118 * c;
      let lines = wrap(g, T700, title, px, room);
      if (lines.length > 4) { px *= 0.86; lines = wrap(g, T700, title, px, room); }
      for (const l of lines) px = Math.min(px, fit(g, T700, l, px, room));
      let y = Math.max(t + h * 0.215, t + h * 0.30 - (lines.length - 1) * px * 0.62);
      g.font = T700.replace('%', String(px));
      for (const l of lines) { g.fillText(l, cx, y); y += px * 1.3; drawn.title.push(l); }
      if (s.page?.volume) { g.font = T400.replace('%', String(0.0062 * c)); g.fillText(s.page.volume.toUpperCase(), cx, y + 0.004 * c); y += 0.012 * c; drawn.volume = s.page.volume; }
      y += 0.010 * c;
      g.fillRect(cx - 0.016 * c, y, 0.032 * c, Math.max(1.5, 0.0004 * c));
      g.save(); g.translate(cx, y); g.rotate(Math.PI / 4); g.fillRect(-0.0016 * c, -0.0016 * c, 0.0032 * c, 0.0032 * c); g.restore();
      y += 0.020 * c;
      const apx = 0.0072 * c, al = wrap(g, T400, author, apx, room);
      g.font = T400.replace('%', String(apx));
      for (const l of al) { g.fillText(l, cx, y); y += apx * 1.45; drawn.author.push(l); }
      g.textAlign = 'left';
      const ins = INS[s.key], name = penName(ins, FMT, OWNER), line = penLine(ins), year = penYear(ins, FMT), hpx = 0.0086 * c;
      if (name && !line) {
        g.save(); g.translate(a + w * 0.9, t + h * 0.09); g.rotate(-0.07);
        g.font = `${hpx}px ${HAND}`;
        const nw = g.measureText(name).width;
        pen(g, name, -nw, 0, hpx, r); drawn.name = name;
        if (year) { pen(g, year, -g.measureText(year).width - hpx * 0.2, hpx * 1.25, hpx * 0.92, r); drawn.year = year; }
        g.restore();
      }
      if (line) {
        const sig = [name, year].filter(Boolean).join(', '), foot = t + h * 0.945, floor = y + 0.012 * c;
        let px = hpx, ll, top, tall;
        for (let k = 0; k < 6; k++, px *= 0.9) {
          ll = wrap(g, `%px ${HAND}`, line, px, w * 0.70);
          tall = (ll.length * 1.5 + (sig ? 0.35 : -0.5) + 0.3) * px;
          top = Math.min(Math.max(y + 0.03 * c, t + h * 0.70), foot - tall);
          if (top >= floor) break;
        }
        g.save(); g.translate(a + w * 0.17, top); g.rotate(-0.045);
        const runs = ll.map((l, i) => (i ? px * 0.3 : 0) + pen(g, l, i ? px * 0.3 : 0, i * px * 1.5, px, r));
        if (sig) { g.font = `${px}px ${HAND}`; pen(g, sig, w * 0.70 - g.measureText(sig).width, ll.length * px * 1.5 + px * 0.35, px, r); drawn.name = name; drawn.year = year; }
        g.restore(); drawn.line = line;
        drawn.pen = { lines: ll.length, bottom: +((top + tall - t) / h).toFixed(3), right: +(0.17 + Math.max(...runs) / w).toFixed(3), clear: +((top - px - y + apx * 1.45) / h).toFixed(3), px: +(px / c * 1000).toFixed(2) };
      }
    }
    state.drawn = drawn;
    tex.needsUpdate = true;
  }

  const tmpQ = new THREE.Quaternion(), tmpV = new THREE.Vector3(), E = new THREE.Euler();
  function slotPose(s) {
    node.updateWorldMatrix(true, false);
    const p = s.pos.clone().applyMatrix4(node.matrixWorld), q = node.getWorldQuaternion(new THREE.Quaternion()).multiply(s.quat);
    const out = s.out.clone().transformDirection(node.matrixWorld);
    return { p, q, mid: p.clone().addScaledVector(out, (s.b.kind === 'spine' ? s.W : 0.1) + 0.05).add(new THREE.Vector3(0, 0.04, 0)) };
  }
  const portrait = () => innerWidth < innerHeight * 0.8;
  function handPose(s, k) {
    const r = live.renderer.domElement.getBoundingClientRect(), top = 20, bottom = scrim.querySelector('.book-acts').offsetHeight + 34;
    const fw = r.width - 24, fh = r.height - top - bottom, P5 = camera.projectionMatrix.elements[5];
    const closed = Math.min(0.62 * fh / s.H, 0.74 * fw / (s.W + s.Tk)), tall = portrait();
    const open = tall ? Math.min(0.84 * fh / s.H, 0.90 * fw / s.W) : Math.min(0.84 * fh / s.H, 0.92 * fw / (2 * s.W));
    const ppm = closed + (open - closed) * k, D = Math.max(0.16, r.height * P5 / (2 * ppm));
    camera.updateMatrixWorld();
    const ndcY = 1 - 2 * (top + fh / 2) / r.height;
    const dir = tmpV.set(0, ndcY, 0.5).unproject(camera).sub(camera.position).normalize();
    const fwd = camera.getWorldDirection(new THREE.Vector3());
    const p = camera.position.clone().addScaledVector(dir, D / dir.dot(fwd));
    const sway = reduced() ? 0 : Math.sin(state.sway * 0.55) * 0.2;
    E.set(state.pitch * (1 - 0.7 * k) - 0.04 * k, (0.42 + sway + state.yaw) * (1 - k) + state.yaw * 0.25 * k, 0, 'YXZ');
    const q = camera.getWorldQuaternion(new THREE.Quaternion()).multiply(tmpQ.setFromEuler(E));
    const ax = k * (tall ? 0 : -s.W / 2), az = k * s.Tk / 2;
    p.sub(new THREE.Vector3(ax, 0, az).applyQuaternion(q));
    return { p, q };
  }
  function place() {
    const s = state.slot, k = easeInOut(state.open);
    const h = handPose(s, k);
    if (state.phase === 'lift' || state.phase === 'back') {
      const e = easeInOut(state.phase === 'lift' ? state.t : 1 - state.t), a = state.from;
      book.position.copy(a.p).multiplyScalar((1 - e) * (1 - e)).addScaledVector(a.mid, 2 * e * (1 - e)).addScaledVector(h.p, e * e);
      book.quaternion.copy(a.q).slerp(h.q, Math.min(1, Math.max(0, (e - 0.15) / 0.75)));
      dim.material.opacity = DIM * e;
    } else { book.position.copy(h.p); book.quaternion.copy(h.q); dim.material.opacity = DIM; }
    swing(OPEN_DEG * k);
    dim.position.copy(camera.position).addScaledVector(camera.getWorldDirection(tmpV), 0.3);
    dim.quaternion.copy(camera.quaternion);
  }

  const scrim = Object.assign(document.createElement('div'), { className: 'book-scrim', hidden: true });
  scrim.setAttribute('role', 'dialog'); scrim.setAttribute('aria-modal', 'true');
  scrim.innerHTML = `<p class="book-cap" aria-live="polite"><b></b> <span></span></p><div class="book-acts">
    <button type="button" class="prev" aria-label="${UI.prev ?? 'Previous book'}">&#8249;</button><button type="button" class="open"></button>
    <button type="button" class="put">${UI.back ?? 'Put back'}</button><button type="button" class="next" aria-label="${UI.next ?? 'Next book'}">&#8250;</button></div>`;
  document.body.append(scrim);
  const $ = (q) => scrim.querySelector(q);
  const syncUI = () => {
    const s = state.slot; if (!s) return;
    $('.book-cap b').textContent = titleOf(s) + (s.page?.volume ? `, ${s.page.volume}` : ''); $('.book-cap span').textContent = authorOf(s);
    scrim.setAttribute('aria-label', titleOf(s));
    $('.open').textContent = state.wantOpen ? (UI.close ?? 'Close') : (UI.open ?? 'Open');
    $('.open').setAttribute('aria-pressed', String(state.wantOpen));
  };
  const rc = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function onBook(x, y) {
    if (!book) return false;
    const r = live.renderer.domElement.getBoundingClientRect(), hits = [];
    ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    rc.setFromCamera(ndc, camera); book.updateMatrixWorld();
    THREE.Mesh.prototype.raycast.call(book, rc, hits);
    return hits.length > 0;
  }
  let press = null;
  scrim.addEventListener('pointerdown', (ev) => {
    if (ev.target.closest('button') || (ev.pointerType === 'mouse' && ev.button !== 0)) return;
    press = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, lx: ev.clientX, ly: ev.clientY, moved: false };
    scrim.setPointerCapture?.(ev.pointerId); ev.preventDefault();
  });
  scrim.addEventListener('pointermove', (ev) => {
    if (!press || ev.pointerId !== press.id) return;
    if (!press.moved && Math.hypot(ev.clientX - press.x, ev.clientY - press.y) < 7) return;
    press.moved = true;
    state.yaw += (ev.clientX - press.lx) * 0.011; state.pitch = Math.max(-0.9, Math.min(0.9, state.pitch + (ev.clientY - press.ly) * 0.008));
    press.lx = ev.clientX; press.ly = ev.clientY; live.render();
  });
  const release = (ev) => {
    if (!press || ev.pointerId !== press.id) return;
    const p = press; press = null;
    if (ev.type === 'pointercancel' || p.moved || !state.slot) return;
    if (onBook(ev.clientX, ev.clientY)) toggle(); else put();
  };
  scrim.addEventListener('pointerup', release); scrim.addEventListener('pointercancel', release);
  scrim.addEventListener('wheel', (ev) => ev.preventDefault(), { passive: false });
  $('.open').addEventListener('click', () => toggle());
  $('.put').addEventListener('click', () => put());
  const step = (d) => { const i = books.indexOf(state.slot); if (i >= 0) take(books[(i + d + books.length) % books.length].key); };
  $('.prev').addEventListener('click', () => step(-1));
  $('.next').addEventListener('click', () => step(1));
  addEventListener('keydown', (ev) => {
    if (!state.slot) return;
    if (ev.key === 'Escape') { ev.preventDefault(); ev.stopImmediatePropagation(); put(); }
    else if ((ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') && !ev.target.closest?.('input, textarea')) { ev.preventDefault(); ev.stopImmediatePropagation(); step(ev.key === 'ArrowLeft' ? -1 : 1); }
  }, true);

  let opener = null;
  function take(key) {
    const s = byKey.get(key ?? books[0].key);
    if (!s || live.view() !== VIEW) return false;
    if (state.slot) drop(false);
    if (!hand) { hand = new FontFace('Kalam', `url(${new URL('./kalam-tags.woff2', import.meta.url)})`); document.fonts.add(hand); hand.load().then(() => { if (state.slot) { repaint(); live.render(); } }, () => {}); }
    canvas = Object.assign(document.createElement('canvas'), { width: AW, height: AH });
    tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const geo = build(s);
    book = noPick(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, vertexColors: true, transparent: true, color: new THREE.Color(0.96, 0.93, 0.88) })));
    book.name = 'book_in_hand'; book.renderOrder = 11; book.frustumCulled = false;
    dim = noPick(new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshBasicMaterial({ color: 0x070504, transparent: true, opacity: 0, depthTest: false, depthWrite: false })));
    dim.name = 'book_dim'; dim.renderOrder = 10; dim.frustumCulled = false;
    Object.assign(state, { slot: s, phase: 'lift', t: reduced() ? 1 : 0, open: 0, wantOpen: false, yaw: 0, pitch: 0.06, sway: 0, from: slotPose(s) });
    gap(s);
    live.scene.add(dim, book);
    if (scrim.hidden) { opener = document.activeElement !== document.body ? document.activeElement : null; scrim.hidden = false; document.body.classList.add('book-out'); }
    syncUI(); place();
    $('.open').focus({ preventScroll: true });
    live.render();
    return true;
  }
  const repaint = () => lastPaint?.();
  function toggle(want = !state.wantOpen) { if (!state.slot || state.phase === 'back') return false; state.wantOpen = want; syncUI(); if (reduced()) state.open = want ? 1 : 0; live.render(); return true; }
  function put() { if (!state.slot) return false; if (reduced()) return drop(true); state.wantOpen = false; state.phase = 'back'; state.t = 0; state.from = slotPose(state.slot); syncUI(); live.render(); return true; }
  function drop(closeUI = true) {
    if (!state.slot) return false;
    gap(null);
    live.scene.remove(book, dim);
    book.geometry.dispose(); book.material.dispose(); tex.dispose(); dim.geometry.dispose(); dim.material.dispose();
    book = dim = canvas = tex = front = lastPaint = null; press = null;
    Object.assign(state, { slot: null, phase: null, drawn: null });
    if (closeUI) { scrim.hidden = true; document.body.classList.remove('book-out'); if (opener?.isConnected) opener.focus({ preventScroll: true }); opener = null; }
    live.render();
    return true;
  }
  addEventListener('room:move', () => drop());
  addEventListener('popstate', () => drop());

  let aimed = null;
  live.picks.push({ object: node, accept: (p) => { aimed = !state.slot && live.view() === VIEW && !live.moving() ? bookAt(p) : null; return !!aimed; },
    onPick: () => { if (aimed) take(aimed.key); } });

  function tick(dt) {
    const s = state;
    if (!s.slot) return false;
    if (live.view() !== VIEW) { drop(); return false; }
    let busy = false;
    if (s.phase === 'lift') { s.t = Math.min(1, s.t + dt / T.lift); if (s.t >= 1) s.phase = 'held'; busy = true; }
    else if (s.phase === 'back') {
      if (s.open > 0) s.open = Math.max(0, s.open - dt / (T.open * 0.6));
      else { s.t = Math.min(1, s.t + dt / T.back); if (s.t >= 1) { drop(); return false; } }
      busy = true;
    } else {
      const want = s.wantOpen ? 1 : 0;
      if (s.open !== want) { s.open = want > s.open ? Math.min(1, s.open + dt / T.open) : Math.max(0, s.open - dt / T.open); busy = true; }
      else if (!press) s.sway += dt;
    }
    place();
    if (busy || press) live.render();
    return !reduced() && !s.wantOpen;
  }
  const toPx = (v) => { const r = live.renderer.domElement.getBoundingClientRect(), p = v.clone().project(camera); return [r.left + (p.x + 1) / 2 * r.width, r.top + (1 - p.y) / 2 * r.height]; };
  const boxOf = (pts) => { const xy = pts.map(toPx); return [Math.min(...xy.map((p) => p[0])), Math.min(...xy.map((p) => p[1])), Math.max(...xy.map((p) => p[0])), Math.max(...xy.map((p) => p[1]))].map((v) => +v.toFixed(1)); };
  function shelfBox(s) {
    node.updateWorldMatrix(true, false);
    const L = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(node.matrixWorld);
    if (s.b.kind === 'spine') { const z = s.pos.z + s.W / 2; return boxOf([L(s.x0, 0, z), L(s.x1, 0, z), L(s.x1, s.H, z), L(s.x0, s.H, z)]); }
    const f = (x, y) => new THREE.Vector3(x * s.W / 2, y * s.H / 2, s.Tk / 2).applyQuaternion(s.quat).add(s.pos).applyMatrix4(node.matrixWorld);
    return boxOf([f(-1, -1), f(1, -1), f(1, 1), f(-1, 1)]);
  }
  return { name: 'takebook', update: tick,
    api: {
      keys: () => books.map((s) => s.key),
      boxes: () => books.map((s) => ({ key: s.key, kind: s.b.kind, box: shelfBox(s), tris: trisOf(s) })),
      shelf: () => bakedTris().reduce((n, r) => n + (r.mesh.geometry.index?.count ?? r.mesh.geometry.attributes.position.count), 0),
      take, open: () => toggle(true), close: () => toggle(false), put, drop,
      settle() { const s = state; if (!s.slot) return false; if (s.phase === 'back') return drop(); s.phase = 'held'; s.t = 1; s.open = s.wantOpen ? 1 : 0; place(); live.render(); return true; },
      info() {
        const s = state.slot;
        if (!s) return { out: null, phase: null, meshes: ['book_in_hand', 'book_dim'].filter((n) => live.scene.getObjectByName(n)).length, scrim: !scrim.hidden };
        book.updateMatrixWorld();
        const W = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(book.matrixWorld), [a, b, c, d, z] = s.pageBox, h = [s.W / 2, s.H / 2, s.Tk / 2];
        const corners = []; for (const i of [-1, 1]) for (const j of [-1, 1]) for (const k of [-1, 1]) corners.push(W(i * h[0], j * h[1], k * h[2]));
        return { out: s.key, phase: state.phase, open: +state.open.toFixed(3), wantOpen: state.wantOpen, drawn: state.drawn, hand: hand?.status ?? null,
          inscription: { line: penLine(INS[s.key]), year: penYear(INS[s.key], FMT), name: penName(INS[s.key], FMT, OWNER) },
          rect: boxOf(corners), pageRect: boxOf([W(a, c, z), W(b, c, z), W(b, d, z), W(a, d, z)]), meshes: ['book_in_hand', 'book_dim'].filter((n) => live.scene.getObjectByName(n)).length, scrim: !scrim.hidden };
      },
    } };
}
