import { inView, noPick } from './layer-common.js';

const COLS = 43, ROWS = 79, CELL = 16, FOOT = 64;
const W = COLS * CELL, H = ROWS * CELL + FOOT;
const STEP_HZ = 4;
const GATE_T = 48;
const RULE = 30;
const INK = 'rgba(34, 22, 14, 0.9)', NOW = 'rgb(168, 36, 22)', CONE = 'rgba(168, 36, 22, 0.6)';
const LEVEL = 1.0;

export default function mount(live) {
  const { THREE, byName } = live;
  const node = byName('pr_tape');
  const d = node?.userData;
  if (!d?.tape_screen_center) return null;

  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.anisotropy = Math.min(4, live.renderer.capabilities.getMaxAnisotropy());
  const [sw, sh] = d.tape_screen_size;
  const quad = noPick(new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), new THREE.MeshBasicMaterial({
    map: tex, transparent: true, depthWrite: false, color: new THREE.Color(LEVEL, LEVEL, LEVEL) })));
  quad.name = 'tape_ink';
  const n = new THREE.Vector3().fromArray(d.tape_screen_normal).normalize();
  quad.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
  quad.position.fromArray(d.tape_screen_center).addScaledVector(n, 0.0008);
  node.add(quad);

  const MAXT = 20000;
  const SPAN = MAXT + COLS;
  let row = new Uint8Array(2 * SPAN + 1), next = new Uint8Array(2 * SPAN + 1);
  row[SPAN] = 1;
  let t = 0;
  const shown = [];
  const half = (COLS - 1) / 2;
  const take = () => { shown.push(row.slice(SPAN - half, SPAN + half + 1)); if (shown.length > ROWS) shown.shift(); };
  take();
  function step() {
    const lo = Math.max(1, SPAN - t - 1), hi = Math.min(2 * SPAN - 1, SPAN + t + 1);
    for (let i = lo; i <= hi; i++) next[i] = (RULE >> ((row[i - 1] << 2) | (row[i] << 1) | row[i + 1])) & 1;
    [row, next] = [next, row];
    t++;
    take();
    return true;
  }

  function draw() {
    g.clearRect(0, 0, W, H);
    const last = shown.length - 1;
    for (let r = 0; r <= last; r++) {
      const cells = shown[r];
      g.fillStyle = r === last ? NOW : INK;
      for (let c = 0; c < COLS; c++) if (cells[c]) g.fillRect(c * CELL + 1, r * CELL + 1, CELL - 2, CELL - 2);
    }
    const cx = half * CELL + CELL / 2, cy = last * CELL + CELL / 2;
    g.strokeStyle = CONE; g.lineWidth = 2;
    g.beginPath();
    g.moveTo(cx - cy, 0); g.lineTo(cx, cy); g.lineTo(cx + cy, 0);
    g.stroke();
    g.fillStyle = INK;
    g.font = '700 40px ui-monospace, Menlo, Consolas, monospace';
    g.textBaseline = 'middle';
    g.textAlign = 'left'; g.fillText('RULE 30', 10, H - FOOT / 2);
    g.textAlign = 'right'; g.fillText(`t = ${t}`, W - 10, H - FOOT / 2);
    g.textAlign = 'left';
    tex.needsUpdate = true;
  }

  const mounted = performance.now();
  let t0 = null;
  const start = () => { if (t0 === null) t0 = performance.now(); };
  addEventListener('room:intro', start, { once: true });
  addEventListener('room:arrive', start, { once: true });
  let still = !!live.gate;
  if (live.gate) { while (t < GATE_T) step(); }
  else if (live.reduceMotion.matches) { while (t < ROWS - 1) step(); still = true; }
  draw();

  return {
    name: 'tape',
    update() {
      if (t0 === null && performance.now() - mounted > 12000) start();
      if (still || t0 === null || !inView(live.camera, quad)) return false;
      const due = Math.min(MAXT, Math.floor((performance.now() - t0) / 1000 * STEP_HZ));
      if (t >= due) return false;
      let k = 0;
      while (t < due && k++ < 4000) step();
      draw();
      return true;
    },
    api: {
      advance(rows = 1) { for (let i = 0; i < rows; i++) step(); draw(); live.render(); return this.info(); },
      info: () => ({ t, cols: COLS, rows: Math.min(ROWS, t + 1), inView: inView(live.camera, quad),
        centre: shown.map((r) => r[half]).join('') }),
    },
  };
}
