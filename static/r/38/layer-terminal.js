import { inView, noPick } from './layer-common.js';

const DATA_URL = 'colophon.json';
const REPLAY_S = 95;
const MIN_GAP = 0.35;
const WORK = [2.4, 5.5];
const HOLD_S = 14;
const FPS = 10;
const CPS = 70;
const GRID = [3, 2];
const TEX_W = 1024;
const DONE_GLOW_S = 6;
const SCREEN_LEVEL = 1.0;
const C = {
  bg: '#0c0f12', pane: '#0f1316', rule: '#1e252c', title: '#141a1f', text: '#d9d3c7', dim: '#7c8790',
  path: '#8fb0cf', add: '#7cc48a', del: '#d98a7a', ok: '#7cc48a', work: '#e3a35b', idle: '#4a545d', accent: '#e3a35b',
};
const FONT = 'ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, "Liberation Mono", monospace';

export default async function mount(live) {
  const { THREE, byName } = live;
  const node = byName('pr_terminal');
  const d = node?.userData;
  if (!d?.terminal_screen_center) return null;
  let data;
  try {
    const r = await fetch(new URL(DATA_URL, import.meta.url));
    if (!r.ok) return null;
    data = await r.json();
  } catch { return null; }
  if (!data?.commits?.length) return null;

  const [sw, sh] = d.terminal_screen_size;
  const canvas = document.createElement('canvas');
  canvas.width = TEX_W;
  canvas.height = Math.round(TEX_W * sh / sw);
  canvas.className = 'term-canvas';
  const g = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.anisotropy = Math.min(4, live.renderer.capabilities.getMaxAnisotropy());
  const mat = new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(SCREEN_LEVEL, SCREEN_LEVEL, SCREEN_LEVEL) });
  const quad = noPick(new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), mat));
  quad.name = 'terminal_screen';
  const n = new THREE.Vector3().fromArray(d.terminal_screen_normal ?? [0, 0, 1]).normalize();
  quad.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
  quad.position.fromArray(d.terminal_screen_center).addScaledVector(n, 0.0003);
  quad.visible = false;
  node.add(quad);

  const H = canvas.height, W = canvas.width;
  const TOP = 24, BOT = 22, GAP = 4;
  const fs = 13, lh = 17;
  g.font = `${fs}px ${FONT}`;
  const cw = g.measureText('M').width;
  const pw = (W - GAP * (GRID[0] + 1)) / GRID[0];
  const ph = (H - TOP - BOT - GAP * (GRID[1] + 1)) / GRID[1];
  const cols = Math.floor((pw - 16) / cw);
  const rowsFit = Math.floor((ph - 26) / lh);

  const sched = schedule(data);
  const END = sched.end;

  function text(s, x, y, color, font = `${fs}px ${FONT}`) { g.font = font; g.fillStyle = color; g.fillText(s, x, y); }
  function clip(s, n) { return s.length > n ? s.slice(0, Math.max(0, n - 1)) + '…' : s; }

  function draw(t) {
    g.fillStyle = C.bg; g.fillRect(0, 0, W, H);
    g.textBaseline = 'middle';
    g.fillStyle = C.title; g.fillRect(0, 0, W, TOP);
    text('agents · building room/', 10, TOP / 2, C.dim);
    const sp = `replay ×${Math.round(sched.speed)}`;
    text(sp, W - 10 - sp.length * cw, TOP / 2, C.dim);
    for (let i = 0; i < sched.panes.length; i++) {
      const cx = GAP + (i % GRID[0]) * (pw + GAP), cy = TOP + GAP + Math.floor(i / GRID[0]) * (ph + GAP);
      drawPane(sched.panes[i], t, cx, cy);
    }
    const done = sched.doneAt(t);
    g.fillStyle = C.title; g.fillRect(0, H - BOT, W, BOT);
    const left = `room-3d  ${sched.clock(t)}`;
    text(left, 10, H - BOT / 2, C.text);
    const working = sched.panes.filter((p) => p.job(t)?.state === 'work').length;
    const right = `${done}/${sched.commits.length} commits · ${working} working`;
    text(right, W - 10 - right.length * cw, H - BOT / 2, C.dim);
    const it = sched.iteration(t);
    if (it) {
      const room = Math.floor((W - 40 - (left.length + right.length) * cw) / cw) - 4;
      text(clip(`◆ ${it.tag.replace(/^room-iter-/, 'iter ')}: ${it.message}`, room), 22 + (left.length + 2) * cw, H - BOT / 2, C.accent);
    }
  }

  function drawPane(p, t, x, y) {
    const job = p.job(t);
    g.fillStyle = C.pane; g.fillRect(x, y, pw, ph);
    g.strokeStyle = job?.state === 'work' ? 'rgba(227,163,91,0.55)' : C.rule;
    g.lineWidth = 1; g.strokeRect(x + 0.5, y + 0.5, pw - 1, ph - 1);
    g.fillStyle = C.title; g.fillRect(x + 1, y + 1, pw - 2, 20);
    if (!job) { text('●', x + 8, y + 11, C.idle); text('idle', x + 8 + 2 * cw, y + 11, C.dim); return; }
    const c = job.c;
    const glow = job.state === 'work' ? C.work : (t - c.T < DONE_GLOW_S ? C.ok : C.idle);
    text('●', x + 8, y + 11, glow);
    text(clip(c.pane, cols - 12), x + 8 + 2 * cw, y + 11, C.text);
    if (c.agent) text(c.agent, x + pw - 8 - c.agent.length * cw, y + 11, C.dim);
    const shown = [];
    for (const ln of c.lines) {
      if (ln.t > t) break;
      const chars = ln.typed ? Math.floor((t - ln.t) * CPS) : Infinity;
      shown.push({ ...ln, s: ln.s.slice(0, chars), typing: chars < ln.s.length });
    }
    const vis = shown.slice(-rowsFit);
    let yy = y + 21 + lh / 2 + 4;
    for (const ln of vis) {
      drawLine(ln, x + 8, yy);
      yy += lh;
    }
    const last = vis[vis.length - 1];
    if (job.state === 'work' && last && yy < y + ph - 2 && (last.typing || Math.floor(t * 2) % 2 === 0)) {
      g.fillStyle = C.text;
      const cxr = x + 8 + Math.min(cols, last.s.length) * cw;
      const cyr = (last.typing ? yy - lh : yy) - lh / 2 + 3;
      g.fillRect(last.typing ? cxr : x + 8, cyr, cw * 0.9, lh - 5);
    }
  }

  function drawLine(ln, x, y) {
    if (ln.kind === 'file') {
      let cx = x;
      for (const [s, col] of [['  ✎ ', C.dim], [ln.path, C.path], ['  +' + ln.add, C.add], [' −' + ln.del, C.del]]) {
        const room = cols - Math.round((cx - x) / cw);
        if (room <= 0) break;
        const part = clip(s, room);
        text(part, cx, y, col);
        cx += part.length * cw;
      }
      return;
    }
    const col = { task: C.text, body: C.dim, gate: C.ok, done: C.ok, more: C.dim }[ln.kind] ?? C.text;
    text(clip(ln.s, cols), x, y, col);
  }

  function wrapLines(s, width) {
    const out = [];
    let cur = '';
    for (const w of s.split(/\s+/)) {
      if ((cur + ' ' + w).trim().length > width) { if (cur) out.push(cur); cur = w; } else cur = (cur + ' ' + w).trim();
    }
    if (cur) out.push(cur);
    return out;
  }

  function schedule(dat) {
    const cs = dat.commits.slice().sort((a, b) => a.ts - b.ts);
    const span = Math.max(1, cs[cs.length - 1].ts - cs[0].ts);
    const lead = WORK[0] + 1.0;
    const speed = span / (REPLAY_S - lead - MIN_GAP * cs.length);
    let T = lead;
    const commits = cs.map((c, i) => {
      if (i) T += Math.max(MIN_GAP, (c.ts - cs[i - 1].ts) / speed);
      return { ...c, T, index: i, pane: c.scope.split(',')[0].trim() };
    });
    const panes = Array.from({ length: GRID[0] * GRID[1] }, (_, i) => ({ i, jobs: [], lastUsed: -1 - i,
      job(t) {
        let j = null;
        for (const x of this.jobs) { if (x.S <= t) j = x; else break; }
        return j && { c: j.c, state: t < j.c.T ? 'work' : 'done' };
      } }));
    for (const c of commits) {
      const lines = buildLines(c);
      const want = Math.min(WORK[1], WORK[0] + 0.18 * lines.length);
      const free = (p) => !p.jobs.length || p.jobs[p.jobs.length - 1].c.T + 0.4 <= c.T - want;
      let p = panes.find((q) => q.jobs.length && q.jobs[q.jobs.length - 1].c.pane === c.pane && free(q));
      if (!p) p = panes.filter(free).sort((a, b) => a.lastUsed - b.lastUsed)[0];
      if (!p) p = panes.slice().sort((a, b) => (a.jobs.at(-1)?.c.T ?? 0) - (b.jobs.at(-1)?.c.T ?? 0))[0];
      const prevEnd = p.jobs.length ? p.jobs[p.jobs.length - 1].c.T + 0.25 : 0;
      const S = Math.max(prevEnd, c.T - want, 0);
      const typed = lines.filter((l) => l.typed).reduce((a, l) => a + l.s.length, 0) / CPS;
      let tt = S;
      const rest = lines.length - lines.filter((l) => l.typed).length - 1;
      const step = Math.max(0.05, (c.T - S - typed - 0.2) / Math.max(1, rest));
      for (const ln of lines) {
        ln.t = tt;
        tt += ln.typed ? ln.s.length / CPS : step;
        if (ln.kind === 'done') ln.t = c.T;
      }
      c.lines = lines;
      p.jobs.push({ S, c });
      p.lastUsed = c.T;
    }
    const iters = (dat.iterations ?? []).map((it) => ({ ...it, at: commits.find((c) => c.sha === it.commit)?.T }))
      .filter((it) => it.at !== undefined).sort((a, b) => a.at - b.at);
    const end = commits[commits.length - 1].T + 0.5;
    return {
      commits, panes, speed, end,
      doneAt: (t) => commits.filter((c) => c.T <= t).length,
      iteration(t) { let r = null; for (const it of iters) if (it.at <= t) r = it; return r; },
      clock(t) {
        const k = commits.findIndex((c) => c.T > t);
        if (k <= 0) return commits[k === 0 ? 0 : commits.length - 1].clock;
        const a = commits[k - 1], b = commits[k];
        const ts = a.ts + (b.ts - a.ts) * (t - a.T) / (b.T - a.T);
        const [h, m] = a.clock.split(':').map(Number);
        const mins = h * 60 + m + Math.floor((ts - a.ts) / 60);
        return `${String(Math.floor(mins / 60) % 24).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
      },
    };
  }

  function buildLines(c) {
    const L = [];
    wrapLines('› ' + c.subject.replace(/^[^:]{1,60}:\s*/, ''), cols).slice(0, 3)
      .forEach((s, k) => L.push({ kind: 'task', s: k ? '  ' + s : s, typed: true }));
    const body = (c.body || '').split(/\n\s*\n/)[0].replace(/\s+/g, ' ').trim();
    if (body) wrapLines(body, cols - 2).slice(0, 2).forEach((s) => L.push({ kind: 'body', s: '  ' + s }));
    const files = c.files.slice().sort((a, b) => (b.add + b.del) - (a.add + a.del));
    for (const f of files.slice(0, 5)) L.push({ kind: 'file', s: f.path, path: f.path.replace(/^room\//, ''), add: f.add, del: f.del });
    if (files.length > 5) L.push({ kind: 'more', s: `  … ${files.length - 5} more files` });
    for (const gt of c.gates ?? []) L.push({ kind: 'gate', s: '  ✓ ' + gt });
    L.push({ kind: 'done', s: `  ● committed ${c.sha} · ${c.clock}` });
    return L;
  }

  let t = 0, acc = 1, landed = 0, staticShown = false, panelOpen = false;
  function land(upTo) {
    while (landed < sched.commits.length && sched.commits[landed].T <= upTo) {
      const c = sched.commits[landed++];
      document.dispatchEvent(new CustomEvent('room:agent-done', { detail: { scope: c.scope, sha: c.sha, subject: c.subject, index: c.index } }));
    }
  }
  function show() { draw(t); tex.needsUpdate = true; quad.visible = true; }
  function advance(dt) {
    t += dt;
    if (t > END + HOLD_S) { t = 0; landed = 0; }
    land(t);
  }

  const panel = makePanel();
  function makePanel() {
    const css = document.createElement('style');
    css.textContent = `
      .term-panel { position: fixed; inset: 0; z-index: 20; display: grid; place-items: center;
        padding: max(16px, env(safe-area-inset-top, 0px)) max(16px, env(safe-area-inset-right, 0px))
                 max(16px, env(safe-area-inset-bottom, 0px)) max(16px, env(safe-area-inset-left, 0px));
        background: rgba(8, 7, 6, .4); opacity: 0; transition: opacity .35s ease; }   /* merge 021 (panel 021 action 7): dims the room to ~60 %, never covers it */
      .term-panel[hidden] { display: none; }
      .term-panel.open { opacity: 1; }
      .term-card { width: min(760px, 100%); background: #0c0f12; border: 1px solid rgba(239, 230, 218, .14);
        border-radius: 10px; overflow: hidden; box-shadow: 0 20px 60px rgba(0, 0, 0, .55);
        transform: scale(.94); transition: transform .35s ease; }
      .term-panel.open .term-card { transform: none; }
      .term-card canvas { display: block; width: 100%; height: auto; }
      .term-foot { display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center; justify-content: space-between;
        padding: 12px 14px; color: #b9ab98; font: 13px/1.45 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
      .term-foot p { margin: 0; flex: 1 1 280px; }
      .term-foot a { color: #efe6da; text-decoration: none; border: 1px solid #e3a35b; border-radius: 999px; padding: 7px 12px; white-space: nowrap; }
      .term-foot a:hover, .term-foot a:focus-visible { background: rgba(227, 163, 91, .14); outline: none; }
      .term-close { position: absolute; top: max(16px, env(safe-area-inset-top, 0px)); right: max(16px, env(safe-area-inset-right, 0px));
        font: 13px/1 ui-sans-serif, system-ui, sans-serif; color: #efe6da; background: rgba(20, 17, 15, .7); cursor: pointer;
        border: 1px solid rgba(239, 230, 218, .2); border-radius: 999px; padding: 7px 11px; }
      .gate .term-panel { display: none; }
      @media (prefers-reduced-motion: reduce) { .term-panel, .term-card { transition: none; } }`;
    document.head.appendChild(css);
    const el = document.createElement('div');
    el.className = 'term-panel';
    el.hidden = true;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'The agents that built this room');
    el.innerHTML = `<button class="term-close" type="button" aria-label="Close">Close</button>
      <div class="term-card"><div class="term-slot"></div><div class="term-foot">
        <p>This room was built by AI agents working in parallel, one pane each, directed by Ruud. What you see is its real git history, replayed.</p>
        <a href="colophon.html">Read how this room was made</a></div></div>`;
    document.body.appendChild(el);
    el.addEventListener('click', (ev) => {
      if (performance.now() - openedAt < 450) return;
      if (ev.target === el || ev.target.closest('.term-close')) { close(); live.go?.(live.home); }
    });
    addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && panelOpen) close(); });
    return el;
  }
  let openedAt = -1e9;
  function open() {
    if (live.gate) return;
    panelOpen = true;
    openedAt = performance.now();
    panel.querySelector('.term-slot').appendChild(canvas);
    panel.hidden = false;
    requestAnimationFrame(() => panel.classList.add('open'));
    panel.querySelector('a').focus({ preventScroll: true });
    const at = node.getWorldPosition(new THREE.Vector3());
    const v = window.__room?.views?.().find((x) => new THREE.Vector3(...x.target).distanceTo(at) < 0.5);
    if (v && v.id !== live.view()) (live.go ? live.go(v.id) : window.__room.goTo(v.id)).catch(() => {});
    show();
    live.render();
  }
  function close() {
    panelOpen = false;
    panel.classList.remove('open');
    panel.hidden = true;
    live.render();
  }
  live.picks.push({ object: node, accept: () => true, onPick: open });

  return {
    name: 'terminal',
    onView(id) { if (panelOpen && id === live.home) close(); },
    update(dt) {
      if (live.gate) return false;
      const seen = panelOpen || inView(live.camera, quad);
      if (!seen) return false;
      if (live.reduceMotion.matches) {
        if (staticShown) return false;
        staticShown = true; t = END; land(t); show();
        return true;
      }
      staticShown = false;
      const before = t;
      advance(dt);
      acc += dt;
      const still = before > END + 0.2 && t > END + 0.2;
      if (acc < 1 / FPS || (still && quad.visible)) return false;
      acc = 0;
      show();
      return true;
    },
    api: {
      advance(sec, h = 1 / FPS) { let k = Math.round(sec / h); while (k-- > 0) advance(h); show(); live.render(); return this.info(); },
      seek(sec) { t = 0; landed = 0; advance(sec); show(); live.render(); return this.info(); },
      open, close,
      info: () => ({ t, end: END, speed: sched.speed, landed, commits: sched.commits.length, panes: sched.panes.length,
        visible: quad.visible, inView: inView(live.camera, quad), panelOpen, canvas: [canvas.width, canvas.height] }),
    },
  };
}
