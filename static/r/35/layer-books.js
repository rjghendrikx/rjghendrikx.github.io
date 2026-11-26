import { noPick } from './layer-common.js';
import { C, FACES } from './content.js';

const SPINE_CAP = 0.011, AUTHOR_CAP = 0.0085, SPINE_M = 0.014, SPINE_GAP = 0.012;
const COVER_PAD = 0.012, COVER_CAP = 0.019, COVER_ACAP = 0.0085;
const LIFT = 0.0002;
const SQUEEZE = { title: 0.88, serif: 1, serifr: 1 };

export default function mount(live) {
  const { THREE, byName } = live;
  const node = byName('pr_books'), U = node?.userData;
  if (!U?.book_quads || !U.book_quad_keys) return null;
  let mesh0 = null;
  node.traverse((o) => { if (!mesh0 && o.isMesh) mesh0 = o; });
  if (!mesh0) return null;
  node.updateWorldMatrix(true, true);
  const [AW, AH] = U.book_atlas, [SPINE_DPM, COVER_DPM] = U.book_dpm;
  const books = new Map(C.books.map((b) => [b.key, b]));
  const canvas = document.createElement('canvas');
  [canvas.width, canvas.height] = [AW, AH];
  const g = canvas.getContext('2d');
  g.fillStyle = '#28241e'; g.fillRect(0, 0, AW, AH);
  const F = { title: `700 %px ${FACES.narrow}`, serif: `700 %px ${FACES.serif}`, serifr: `400 %px ${FACES.serif}` }, cap1 = {};
  const capOf = (face) => { g.font = F[face].replace('%', '1000'); return g.measureText('H').actualBoundingBoxAscent / 1000; };
  for (const k of Object.keys(F)) cap1[k] = capOf(k);
  const adv = (face, s, cap) => { g.font = F[face].replace('%', '1000'); return g.measureText(s).width / 1000 / cap1[face] * cap * SQUEEZE[face]; };
  const line = (face, s, cap, dpm, ink) => {
    g.font = F[face].replace('%', String(cap * dpm / cap1[face]));
    g.fillStyle = ink; g.textBaseline = 'alphabetic'; g.save(); g.scale(SQUEEZE[face], 1); g.fillText(s, 0, cap * dpm / 2); g.restore();
  };

  const keys = U.book_quad_keys.split('|'), Q = U.book_quads;
  const rows = [], geo = [];
  const pos = [], uv = [], uv1 = [], ground = [], index = [];
  const lin = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
  const mesh = mesh0.geometry, P = mesh.attributes.position, T = mesh.attributes.uv;
  const tri = mesh.index ? mesh.index.array : null, nTri = (tri ? tri.length : P.count) / 3;
  const wv = (i) => new THREE.Vector3().fromBufferAttribute(P, i).applyMatrix4(mesh0.matrixWorld);
  const L = (a) => node.localToWorld(new THREE.Vector3(...a));
  keys.forEach((key, qi) => {
    const q = Q.slice(13 * qi, 13 * qi + 13), b = books.get(key);
    if (!b) return;
    const o = L(q.slice(0, 3)), uE = L(q.slice(0, 3).map((v, i) => v + q[3 + i])).sub(o), vE = L(q.slice(0, 3).map((v, i) => v + q[6 + i])).sub(o);
    const [x0, y0, x1, y1] = q.slice(9, 13), spine = b.kind === 'spine';
    const w = b.size_m[0], h = b.size_m[1], dpm = spine ? SPINE_DPM : COVER_DPM, ink = b.ink ?? '#000000';
    g.save(); g.beginPath(); g.rect(x0, y0, x1 - x0, y1 - y0); g.clip();
    g.fillStyle = b.ground ?? '#808080'; g.fillRect(x0, y0, x1 - x0, y1 - y0);
    const out = [];
    if (spine) {
      g.strokeStyle = ink; g.lineWidth = 2;
      for (const yy of [0.006 * dpm, (y1 - y0) - 0.006 * dpm]) { g.beginPath(); g.moveTo(x0 + 4, y0 + yy); g.lineTo(x1 - 4, y0 + yy); g.stroke(); }
      const lines = b.title, al = adv('title', b.author, AUTHOR_CAP);
      const room = h - 2 * SPINE_M - SPINE_GAP - al;
      const cap = Math.min(SPINE_CAP, ...lines.map((s) => room / Math.max(1e-6, adv('title', s, 1))));
      const lead = cap * 0.5, block = lines.length * cap + (lines.length - 1) * lead;
      const put = (s, c, a0, across) => {
        const a1 = a0 + adv('title', s, c);
        g.save(); g.translate(x0 + across * dpm, y0 + a0 * dpm); g.rotate(Math.PI / 2); line('title', s, c, dpm, ink); g.restore();
        return [across / w, 1 - (a0 + a1) / 2 / h, a1 - a0];
      };
      lines.forEach((s, i) => { const [a, bb, run] = put(s, cap, SPINE_M, w / 2 + block / 2 - cap / 2 - i * (cap + lead)); out.push([s, 'title', a, bb, cap, run]); });
      if (b.author) { const [a, bb, run] = put(b.author, AUTHOR_CAP, h - SPINE_M - al, w / 2); out.push([b.author, 'author', a, bb, AUTHOR_CAP, run]); }
    } else {
      const room = w - 2 * COVER_PAD;
      const cap = Math.min(COVER_CAP, ...b.title.map((s) => room / adv('serif', s, 1)));
      let y = COVER_PAD + 0.018 + cap / 2;
      for (const s of b.title) {
        const run = adv('serif', s, cap);
        g.save(); g.translate(x0 + COVER_PAD * dpm, y0 + y * dpm); line('serif', s, cap, dpm, ink); g.restore();
        out.push([s, 'title', (COVER_PAD + run / 2) / w, 1 - y / h, cap, run]);
        y += cap * 1.6;
      }
      const rule = (y - cap * 0.6) * dpm;
      g.strokeStyle = ink; g.lineWidth = 3; g.beginPath(); g.moveTo(x0 + COVER_PAD * dpm, y0 + rule); g.lineTo(x0 + (w - COVER_PAD) * dpm, y0 + rule); g.stroke();
      if (b.author) {
        const acap = Math.min(COVER_ACAP, room / adv('serifr', b.author, 1)), run = adv('serifr', b.author, acap), cy = h - COVER_PAD - 0.012;
        g.save(); g.translate(x0 + COVER_PAD * dpm, y0 + cy * dpm); line('serifr', b.author, acap, dpm, ink); g.restore();
        out.push([b.author, 'author', (COVER_PAD + run / 2) / w, 1 - cy / h, acap, run]);
      }
    }
    g.restore();
    const lu = q.slice(3, 6), lv = q.slice(6, 9), n = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
    for (const [s, kind, a, bb, cap, run] of out) {
      rows.push(`${key}:${kind}:${s}`);
      const c = q.slice(0, 3).map((v, i) => v + lu[i] * a + lv[i] * bb);
      const capV = (spine ? n(lu) : n(lv)).map((x) => x * cap), runV = (spine ? n(lv).map((x) => -x) : n(lu)).map((x) => x * run);
      geo.push(...c, ...capV, ...runV);
    }
    const nrm = new THREE.Vector3().crossVectors(uE, vE).normalize();
    const M = new THREE.Matrix3().set(uE.x, vE.x, nrm.x, uE.y, vE.y, nrm.y, uE.z, vE.z, nrm.z).invert();
    const S = [];
    for (let t = 0; t < nTri; t++) {
      const ids = [0, 1, 2].map((k) => (tri ? tri[3 * t + k] : 3 * t + k));
      const ps = ids.map(wv), ab = ps.map((p) => p.clone().sub(o).applyMatrix3(M));
      const cen = ab.reduce((s, v) => s.add(v), new THREE.Vector3()).multiplyScalar(1 / 3);
      const tn = new THREE.Vector3().crossVectors(ps[1].clone().sub(ps[0]), ps[2].clone().sub(ps[0])).normalize();
      if (cen.x < 0 || cen.x > 1 || cen.y < 0 || cen.y > 1 || ab.some((v) => Math.abs(v.z) > 0.0006) || tn.dot(nrm) < 0.9) continue;
      ids.forEach((id, k) => S.push([ab[k].x, ab[k].y, T.getX(id), T.getY(id)]));
    }
    if (S.length < 3) return;
    const fit = (col) => {
      const A = new THREE.Matrix3(), r = new THREE.Vector3();
      for (const s of S) { const v = [1, s[0], s[1]]; for (let i = 0; i < 3; i++) { for (let j = 0; j < 3; j++) A.elements[3 * j + i] += v[i] * v[j]; r.setComponent(i, r.getComponent(i) + v[i] * s[col]); } }
      return r.applyMatrix3(A.invert());
    };
    const fu = fit(2), fv = fit(3), base = pos.length / 3;
    for (const [a, bb] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
      const p = o.clone().addScaledVector(uE, a).addScaledVector(vE, bb).addScaledVector(nrm, LIFT);
      pos.push(p.x, p.y, p.z);
      uv.push(fu.x + fu.y * a + fu.z * bb, fv.x + fv.y * a + fv.z * bb);
      uv1.push((x0 + a * (x1 - x0)) / AW, 1 - (y1 - bb * (y1 - y0)) / AH);
      ground.push(...lin(b.ground ?? '#808080'));
    }
    index.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });
  if (!index.length) return null;
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geom.setAttribute('inkUv', new THREE.Float32BufferAttribute(uv1, 2));
  geom.setAttribute('ground', new THREE.Float32BufferAttribute(ground, 3));
  geom.setIndex(index);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 });
  const uniforms = { uInk: { value: tex } };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uInk = uniforms.uInk;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 inkUv; attribute vec3 ground; varying vec2 vInk; varying vec3 vGround;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvInk = inkUv; vGround = ground;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D uInk; varying vec2 vInk; varying vec3 vGround;')
      .replace('#include <map_fragment>', '#include <map_fragment>\nfloat lt = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)) / max(dot(vGround, vec3(0.2126, 0.7152, 0.0722)), 0.002);\ndiffuseColor.rgb = texture2D(uInk, vInk).rgb * lt;');
  };
  const overlay = noPick(new THREE.Mesh(geom, mat));
  overlay.name = 'books_type';
  live.scene.add(overlay);
  const sync = () => { if (mesh0.material.map && mat.map !== mesh0.material.map) { mat.map = mesh0.material.map; mat.needsUpdate = true; } return !!mat.map; };
  if (!sync()) { overlay.visible = false; const t = setInterval(() => { if (sync()) { overlay.visible = true; clearInterval(t); live.render?.(); } }, 100); }
  return { name: 'books', update() {}, api: { lines: () => ({ keys: rows, geo }), info: () => ({ quads: index.length / 6, lines: rows.length }) } };
}
