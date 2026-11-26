import { inView, noPick, rng } from './layer-common.js';
import { FACES } from './content.js';

const STEP_S = 5;
const MAX_NODES = 90;
const PREGROWN = 8;
const STILL = 40;
const RELAX = 150;
const CW = 768, CH = 538;
const INK = '#26221d', RULE = 'rgba(38, 34, 29, 0.55)';

export default function mount(live) {
  const { THREE, byName, camera } = live;
  const node = byName('pr_hypercard'), q = node?.userData?.hg_quad;
  if (!q) return null;
  node.updateWorldMatrix(true, true);
  const L = (a) => node.localToWorld(new THREE.Vector3(...a));
  const o = L(q.slice(0, 3)), uE = L(q.slice(0, 3).map((v, i) => v + q[3 + i])).sub(o), vE = L(q.slice(0, 3).map((v, i) => v + q[6 + i])).sub(o);
  const nrm = new THREE.Vector3().crossVectors(uE, vE).normalize();
  const corners = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([a, b]) => o.clone().addScaledVector(uE, a).addScaledVector(vE, b).addScaledVector(nrm, 0.0002));
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(corners.flatMap((p) => [p.x, p.y, p.z]), 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  geom.setIndex([0, 1, 2, 0, 2, 3]);
  const canvas = document.createElement('canvas');
  [canvas.width, canvas.height] = [CW, CH];
  const g = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.MultiplyBlending,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 });
  const mesh = noPick(new THREE.Mesh(geom, mat));
  mesh.name = 'hypercard_ink';
  live.scene.add(mesh);

  const rand = rng(33);
  let edges = [[0, 1, -1], [0, 2, -1]];
  let n = 3;
  const P = new Float64Array(MAX_NODES * 2), F = new Float64Array(MAX_NODES * 2);
  P.set([0, 0, 1, 0.3, 0.4, -0.9]);
  const deps = [];
  const level = [];
  let hot = 0;
  function rewrite() {
    if (n >= MAX_NODES) return false;
    for (let i = 0; i < edges.length; i++) {
      for (let j = i + 1; j < edges.length; j++) {
        const a = edges[i], b = edges[j];
        if (a[0] !== b[0]) continue;
        const [x, y] = a, z = b[1], w = n++, ev = deps.length;
        const d = [...new Set([a[2], b[2]].filter((e) => e >= 0))];
        deps.push(d);
        level.push(d.length ? 1 + Math.max(...d.map((e) => level[e])) : 0);
        edges.splice(j, 1); edges.splice(i, 1);
        edges.push([x, z, ev], [x, w, ev], [y, w, ev], [z, w, ev]);
        for (let k = 0; k < 2; k++) P[w * 2 + k] = (P[x * 2 + k] + P[y * 2 + k] + P[z * 2 + k]) / 3 + (rand() - 0.5) * 0.4;
        hot = RELAX;
        return true;
      }
    }
    return false;
  }
  function relax(step) {
    F.fill(0, 0, n * 2);
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = P[i * 2] - P[j * 2], dy = P[i * 2 + 1] - P[j * 2 + 1];
        const d2 = dx * dx + dy * dy + 0.01;
        const f = 0.3 / (d2 * Math.sqrt(d2));
        F[i * 2] += dx * f; F[i * 2 + 1] += dy * f; F[j * 2] -= dx * f; F[j * 2 + 1] -= dy * f;
      }
    }
    for (const [a, b] of edges) {
      if (a === b) continue;
      const dx = P[b * 2] - P[a * 2], dy = P[b * 2 + 1] - P[a * 2 + 1];
      const d = Math.hypot(dx, dy) + 1e-6, f = 0.5 * (d - 1) / d;
      F[a * 2] += dx * f; F[a * 2 + 1] += dy * f; F[b * 2] -= dx * f; F[b * 2 + 1] -= dy * f;
    }
    let mx = 0, my = 0;
    for (let i = 0; i < n; i++) { mx += P[i * 2]; my += P[i * 2 + 1]; }
    mx /= n; my /= n;
    for (let i = 0; i < n; i++) {
      P[i * 2] += step * Math.max(-0.3, Math.min(0.3, F[i * 2] - 0.01 * (P[i * 2] - mx)));
      P[i * 2 + 1] += step * Math.max(-0.3, Math.min(0.3, F[i * 2 + 1] - 0.01 * (P[i * 2 + 1] - my)));
    }
  }
  function grow(k) { for (let e = 0; e < k; e++) { rewrite(); for (let r = 0; r < 8; r++) relax(1); } for (let r = 0; r < 200; r++) relax(1); hot = 0; }

  const M = 30;
  const HG = { x0: M, y0: M + 34, x1: CW * 0.66 - 14, y1: CH - M - 8 };
  const CG = { x0: CW * 0.66 + 18, y0: M + 34, x1: CW - M, y1: CH - M - 8 };
  let fit = null;
  const C = [];
  function draw() {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < n; i++) { const x = P[i * 2], y = P[i * 2 + 1]; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const s = Math.min((HG.x1 - HG.x0) / Math.max(1e-6, x1 - x0), (HG.y1 - HG.y0) / Math.max(1e-6, y1 - y0));
    const want = [s, (x0 + x1) / 2, (y0 + y1) / 2];
    fit = fit ? fit.map((v, i) => v + (want[i] - v) * 0.08) : want;
    if (fit[0] > want[0]) fit[0] = want[0];
    const cx = (HG.x0 + HG.x1) / 2, cy = (HG.y0 + HG.y1) / 2;
    const X = (i) => cx + (P[i * 2] - fit[1]) * fit[0], Y = (i) => cy + (P[i * 2 + 1] - fit[2]) * fit[0];
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, CW, CH);
    g.strokeStyle = INK; g.fillStyle = INK; g.lineCap = 'round';
    g.font = `400 19px ${FACES.serif}`; g.textBaseline = 'alphabetic';
    g.fillText('{{x,y},{x,z}} → {{x,z},{x,w},{y,w},{z,w}}', M, M + 14);
    g.textAlign = 'right'; g.fillText(`t = ${deps.length}`, CW - M, M + 14); g.textAlign = 'left';
    g.strokeStyle = RULE; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(M, M + 26); g.lineTo(CW - M, M + 26); g.stroke();
    g.beginPath(); g.moveTo(CW * 0.66 + 2, M + 40); g.lineTo(CW * 0.66 + 2, CH - M); g.stroke();
    g.strokeStyle = INK;
    const lw = Math.max(3, 7 - n / 16), r = lw * 1.45;
    g.lineWidth = lw;
    g.beginPath();
    for (const [a, b] of edges) { if (a === b) continue; g.moveTo(X(a), Y(a)); g.lineTo(X(b), Y(b)); }
    g.stroke();
    g.beginPath();
    for (let i = 0; i < n; i++) { g.moveTo(X(i) + r, Y(i)); g.arc(X(i), Y(i), r, 0, 2 * Math.PI); }
    g.fill();
    const layers = [];
    level.forEach((l, e) => (layers[l] ??= []).push(e));
    const nl = Math.max(1, layers.length - 1), lh = Math.min(60, (CG.y1 - CG.y0) / nl);
    layers.forEach((ids, l) => ids.forEach((e, k) => {
      const t = [CG.x0 + (k + 0.5) / ids.length * (CG.x1 - CG.x0), CG.y1 - l * lh];
      C[e] = C[e] ? C[e].map((v, i) => v + (t[i] - v) * 0.08) : t;
    }));
    const cl = Math.max(2.2, lw * 0.7);
    g.lineWidth = cl; g.beginPath();
    deps.forEach((d, e) => d.forEach((f) => { g.moveTo(C[f][0], C[f][1]); g.lineTo(C[e][0], C[e][1]); }));
    g.stroke();
    g.beginPath();
    for (let e = 0; e < deps.length; e++) { g.moveTo(C[e][0] + cl * 1.6, C[e][1]); g.arc(C[e][0], C[e][1], cl * 1.6, 0, 2 * Math.PI); }
    g.fill();
    tex.needsUpdate = true;
  }

  const still = () => live.gate || live.reduceMotion.matches;
  grow(still() ? STILL : PREGROWN);
  for (let k = 0; k < 60; k++) draw();
  let clock = 0, settle = 0, frame = 0;
  const api = {
    info: () => ({ events: deps.length, nodes: n, edges: edges.length, cap: MAX_NODES, still: still(), inView: inView(camera, mesh),
      hash: Array.from(P.subarray(0, n * 2)).reduce((h, v, i) => (h * 31 + Math.round(v * 1000) * (i + 1)) % 1e9, deps.length) }),
    corners: () => {
      const rc = live.renderer.domElement.getBoundingClientRect();
      camera.updateMatrixWorld();
      return corners.map((p) => { const v = p.clone().project(camera); return [rc.left + (v.x + 1) / 2 * rc.width, rc.top + (1 - v.y) / 2 * rc.height, v.z]; });
    },
    advance(sec) { grow(Math.round(sec / STEP_S)); for (let k = 0; k < 60; k++) draw(); live.render(); return api.info(); },
  };
  return {
    name: 'hypercard',
    update(dt) {
      if (still() || document.hidden || !inView(camera, mesh)) return false;
      dt = Math.min(dt, 0.1);
      clock += dt;
      if (clock >= STEP_S) { clock %= STEP_S; if (rewrite()) settle = 40; }
      if (hot <= 0 && settle <= 0) return false;
      if (hot > 0) { relax(0.35); hot--; } else settle--;
      if (++frame % 2) return false;
      draw();
      return true;
    },
    api,
  };
}
