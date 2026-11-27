import { inView, noPick, rng, seedFrom } from './layer-common.js';
import { DISKS, CV, bySlug, byName as diskNamed, number, screenRows, cardText } from './c64-disks.js';
import { FACES } from './content.js';

const COLS = 40, ROWS = 25;
const BORDER = [32, 44];
const S = 2;
const FPS = 30;
const BLINK_S = 1 / 3;
const STMT_HZ = 900;
const SCREEN_LEVEL = 0.92;
const C = { border: '#1a4520', field: '#0e2812', text: '#5ccc66', glow: 'rgba(92, 204, 102, 0.22)' };
const BOOT = ['', '    **** COMMODORE 64 BASIC V2 ****', '', ' 64K RAM SYSTEM  38911 BASIC BYTES FREE', '', 'READY.'];
const STORY = [
  '10 REM RUUD HENDRIKX, A SHORT STORY',
  '20 PRINT "C64: FIRST PROGRAMS, IN BASIC"',
  '30 PRINT "TI-83: LEARNED TO PROGRAM"',
  '40 PRINT "PHYSICS: OPTICS, SPECTROSCOPY"',
  '50 PRINT "LAB SETUPS DRIVEN BY PYTHON"',
  '60 PRINT "DATA SCIENCE: ML MODELS"',
  '70 PRINT "SIMULATIONS FOR SCHIPHOL"',
  '80 PRINT "NOW: AI ENGINEER, AGENTS"',
  '90 PRINT',
  '100 PRINT "A PHYSICIST WHO PROGRAMS"',
  '110 PRINT "INSTRUMENTS. NOW THE"',
  '120 PRINT "INSTRUMENTS ARE AGENTS."',
  '130 PRINT',
  '140 PRINT "RUUDHENDRIKX.NL"',
  '150 FOR T=1 TO 1500:NEXT',
  '160 PRINT CHR$(205.5+RND(1));',
  '170 GOTO 160',
];
const DIR_HEAD = '0 "RUUD HENDRIKX   " RH 2A';
const DIR = [[24, 'UVA.PHYS+PHIL'], [18, 'UVA.MSC.PHYSICS'], [30, 'AMOLF.OPTOMECH'], [42, 'VU.2DES'], [20, 'PGGM.DATASCI'],
  [16, 'WARTSILA.ML'], [22, 'TELE2.VOICE'], [36, 'ING.COLLECTIONS'], [48, 'SCHIPHOL.SIM'], [30, 'STEEL.TWIN'],
  [44, 'ENECO.SQUAD'], [40, 'SCHIPHOL.LLM']];
const DIR_FREE = 664 - DIR.reduce((n, [b]) => n + b, 0);
const DISK_VIEW = { SIMULATIONS: 'simulations', AGENTS: 'terminal', 'MACHINE LEARNING': 'ml' };
const HELP = ['TRY LIST, RUN, PRINT 2+2 OR', '10 PRINT "HI":GOTO 10', 'ESC STOPS A PROGRAM, THEN LEAVES.'];
const ABOUT = ['A BASIC WRITTEN BY HAND FOR THIS', 'ROOM: NO ROMS, NO EMULATOR.', 'THE ROOM IS A PROGRAM TOO.'];

const G5 = {
  A: '01110 10001 10001 11111 10001 10001 10001', B: '11110 10001 10001 11110 10001 10001 11110',
  C: '01110 10001 10000 10000 10000 10001 01110', D: '11100 10010 10001 10001 10001 10010 11100',
  E: '11111 10000 10000 11110 10000 10000 11111', F: '11111 10000 10000 11110 10000 10000 10000',
  G: '01110 10001 10000 10111 10001 10001 01111', H: '10001 10001 10001 11111 10001 10001 10001',
  I: '01110 00100 00100 00100 00100 00100 01110', J: '00111 00010 00010 00010 00010 10010 01100',
  K: '10001 10010 10100 11000 10100 10010 10001', L: '10000 10000 10000 10000 10000 10000 11111',
  M: '10001 11011 10101 10101 10001 10001 10001', N: '10001 10001 11001 10101 10011 10001 10001',
  O: '01110 10001 10001 10001 10001 10001 01110', P: '11110 10001 10001 11110 10000 10000 10000',
  Q: '01110 10001 10001 10001 10101 10010 01101', R: '11110 10001 10001 11110 10100 10010 10001',
  S: '01111 10000 10000 01110 00001 00001 11110', T: '11111 00100 00100 00100 00100 00100 00100',
  U: '10001 10001 10001 10001 10001 10001 01110', V: '10001 10001 10001 10001 10001 01010 00100',
  W: '10001 10001 10001 10101 10101 10101 01010', X: '10001 10001 01010 00100 01010 10001 10001',
  Y: '10001 10001 10001 01010 00100 00100 00100', Z: '11111 00001 00010 00100 01000 10000 11111',
  0: '01110 10001 10011 10101 11001 10001 01110', 1: '00100 01100 00100 00100 00100 00100 01110',
  2: '01110 10001 00001 00010 00100 01000 11111', 3: '11111 00010 00100 00010 00001 10001 01110',
  4: '00010 00110 01010 10010 11111 00010 00010', 5: '11111 10000 11110 00001 00001 10001 01110',
  6: '00110 01000 10000 11110 10001 10001 01110', 7: '11111 00001 00010 00100 01000 01000 01000',
  8: '01110 10001 10001 01110 10001 10001 01110', 9: '01110 10001 10001 01111 00001 00010 01100',
  '.': '00000 00000 00000 00000 00000 01100 01100', ',': '00000 00000 00000 00000 01100 00100 01000',
  ';': '00000 01100 01100 00000 01100 00100 01000', ':': '00000 01100 01100 00000 01100 01100 00000',
  '!': '00100 00100 00100 00100 00100 00000 00100', '?': '01110 10001 00001 00010 00100 00000 00100',
  '"': '01010 01010 01010 00000 00000 00000 00000', "'": '00100 00100 01000 00000 00000 00000 00000',
  '(': '00010 00100 01000 01000 01000 00100 00010', ')': '01000 00100 00010 00010 00010 00100 01000',
  '*': '00000 00100 10101 01110 10101 00100 00000', '+': '00000 00100 00100 11111 00100 00100 00000',
  '-': '00000 00000 00000 11111 00000 00000 00000', '/': '00000 00001 00010 00100 01000 10000 00000',
  '=': '00000 00000 11111 00000 11111 00000 00000', '<': '00010 00100 01000 10000 01000 00100 00010',
  '>': '01000 00100 00010 00001 00010 00100 01000', '$': '00100 01111 10100 01110 00101 11110 00100',
  '#': '01010 01010 11111 01010 11111 01010 01010', '%': '11000 11001 00010 00100 01000 10011 00011',
  '&': '01100 10010 10100 01000 10101 10010 01101', '@': '01110 10001 00001 01101 10101 10101 01110',
  '[': '01110 01000 01000 01000 01000 01000 01110', ']': '01110 00010 00010 00010 00010 00010 01110',
  '^': '00100 01110 10101 00100 00100 00100 00100', _: '00000 00000 00000 00000 00000 00000 11111',
};
const DIAG = { 205: (x, y) => x === y || x === y + 1, 206: (x, y) => x + y === 7 || x + y === 6 };

export default function mount(live) {
  const { THREE, byName } = live;
  const node = byName('pr_c64mon');
  const d = node?.userData;
  if (!d?.c64mon_screen_center) return null;

  const W = (COLS * 8 + 2 * BORDER[0]) * S, H = (ROWS * 8 + 2 * BORDER[1]) * S;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d');
  const atlas = makeAtlas();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.anisotropy = Math.min(4, live.renderer.capabilities.getMaxAnisotropy());
  const [sw, sh] = d.c64mon_screen_size;
  const quad = noPick(new THREE.Mesh(new THREE.PlaneGeometry(sw, sh),
    new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(SCREEN_LEVEL, SCREEN_LEVEL, SCREEN_LEVEL) })));
  quad.name = 'c64_screen';
  const n = new THREE.Vector3().fromArray(d.c64mon_screen_normal).normalize();
  quad.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
  quad.position.fromArray(d.c64mon_screen_center).addScaledVector(n, 0.0003);
  quad.visible = false;
  node.add(quad);

  function makeAtlas() {
    const a = document.createElement('canvas');
    a.width = 256 * 8 * S; a.height = 3 * 8 * S;
    const x = a.getContext('2d');
    for (let code = 0; code < 256; code++) {
      const on = bits(code);
      if (!on) continue;
      for (let py = 0; py < 8; py++) for (let px = 0; px < 8; px++) {
        if (!on(px, py)) continue;
        x.fillStyle = C.text; x.fillRect((code * 8 + px) * S, py * S, S, S);
        x.fillStyle = C.glow; x.fillRect((code * 8 + px) * S - 1, 8 * S + py * S - 1, S + 2, S + 2);
        x.fillStyle = C.field; x.fillRect((code * 8 + px) * S, 16 * S + py * S, S, S);
      }
    }
    return a;
  }
  function bits(code) {
    if (DIAG[code]) return DIAG[code];
    if (code === 160) return () => true;
    const rows = G5[String.fromCharCode(code)]?.split(' ');
    if (!rows) return null;
    return (x, y) => y < 7 && ((x >= 1 && x <= 5 && rows[y][x - 1] === '1') || (x >= 2 && x <= 6 && rows[y][x - 2] === '1'));
  }

  const grid = new Uint8Array(COLS * ROWS).fill(32);
  const inv = new Uint8Array(COLS * ROWS);
  let cx = 0, cy = 0, dirty = true, rvs = false;
  function scroll() { grid.copyWithin(0, COLS); grid.fill(32, COLS * (ROWS - 1)); inv.copyWithin(0, COLS); inv.fill(0, COLS * (ROWS - 1)); cy = ROWS - 1; }
  function clear() { grid.fill(32); inv.fill(0); cx = cy = 0; dirty = true; }
  function bar(s) {
    if (cx) newline();
    const t = s.padEnd(COLS).slice(0, COLS);
    for (let k = 0; k < COLS; k++) { grid[cy * COLS + k] = t.charCodeAt(k); inv[cy * COLS + k] = 1; }
    if (out.length < 40) out.push(s);
    newline();
  }
  function newline() { cx = 0; if (++cy >= ROWS) scroll(); dirty = true; }
  function putc(code) {
    if (code === 13) { rvs = false; newline(); return; }
    if (code === 18) { rvs = true; return; }
    if (code === 146) { rvs = false; return; }
    if (rvs && code === 32) code = 160;
    if (code === 147) { clear(); return; }
    grid[cy * COLS + cx] = code; inv[cy * COLS + cx] = 0;
    if (++cx >= COLS) newline();
    dirty = true;
  }
  const out = [];
  function print(s) { for (const ch of s) putc(ch.charCodeAt(0)); if (out.length < 40) out.push(s); }
  function println(s = '') { rvs = false; if (cx) newline(); print(s); newline(); }

  function draw(cursorOn) {
    g.fillStyle = C.border; g.fillRect(0, 0, W, H);
    const ox = BORDER[0] * S, oy = BORDER[1] * S;
    g.fillStyle = C.field; g.fillRect(ox, oy, COLS * 8 * S, ROWS * 8 * S);
    const cell = 8 * S;
    for (const row of [1, 0]) {
      for (let i = 0; i < grid.length; i++) {
        let code = grid[i];
        if (cursorOn && i === cy * COLS + cx) code = code === 32 ? 160 : code;
        const x0 = ox + (i % COLS) * cell, y0 = oy + Math.floor(i / COLS) * cell;
        if (inv[i]) {
          g.drawImage(atlas, 160 * cell, row * cell, cell, cell, x0, y0, cell, cell);
          if (row === 0 && code !== 32) g.drawImage(atlas, code * cell, 2 * cell, cell, cell, x0, y0, cell, cell);
          continue;
        }
        if (code === 32) continue;
        g.drawImage(atlas, code * cell, row * cell, cell, cell, x0, y0, cell, cell);
      }
    }
    g.fillStyle = 'rgba(0, 0, 0, 0.26)';
    for (let y = 1; y < H; y += 2) g.fillRect(0, y, W, 1);
    const v = g.createRadialGradient(W / 2, H / 2, H * 0.42, W / 2, H / 2, H * 0.86);
    v.addColorStop(0, 'rgba(0, 0, 0, 0)'); v.addColorStop(1, 'rgba(0, 0, 0, 0.5)');
    g.fillStyle = v; g.fillRect(0, 0, W, H);
    tex.needsUpdate = true;
    quad.visible = true;
  }

  const rand = rng(seedFrom(live.params, 64));
  const prog = new Map();
  const vars = new Map();
  const arrays = new Map();
  let run = null;
  let tape = false;
  let dir = false;
  const drive = !!byName('pr_1541');
  class Bad extends Error {}
  const err = (m) => { throw new Bad(m); };
  const KEYS = ['PRINT', 'GOTO', 'GOSUB', 'RETURN', 'IF', 'FOR', 'NEXT', 'LET', 'REM', 'END', 'STOP', 'LIST', 'RUN',
    'NEW', 'CLR', 'POKE', 'SYS', 'LOAD', 'HELP', 'ABOUT', 'DATA', 'DIM'];

  function load(lines) { prog.clear(); for (const l of lines) store(l); }
  function store(text) {
    const m = /^\s*(\d+)\s?(.*)$/.exec(text);
    const num = Number(m[1]);
    if (num > 63999) err('SYNTAX');
    if (m[2].trim()) prog.set(num, m[2]); else prog.delete(num);
  }
  function split(text) {
    const st = [];
    let cur = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '"') q = !q;
      if (ch === ':' && !q) { st.push(cur); cur = ''; continue; }
      cur += ch;
      if (!q && /^\s*REM/.test(cur)) { cur += text.slice(i + 1); break; }
    }
    st.push(cur);
    return st.map((s) => s.trim()).filter(Boolean);
  }
  const sorted = () => [...prog.keys()].sort((a, b) => a - b).map((num) => ({ num, stmts: split(prog.get(num)) }));

  function parser(s) {
    let i = 0;
    const ws = () => { while (s[i] === ' ') i++; };
    const peek = (t) => { ws(); return s.startsWith(t, i); };
    const eat = (t) => { if (peek(t)) { i += t.length; return true; } return false; };
    const want = (t) => { if (!eat(t)) err('SYNTAX'); };
    const ident = () => { ws(); const m = /^[A-Z][A-Z0-9]*\$?/.exec(s.slice(i)); if (!m) return null;
      const k = KEYS.concat(['TO', 'STEP', 'THEN', 'AND', 'OR', 'NOT']).find((w) => m[0].startsWith(w));
      return k ? null : m[0]; };
    const num = (v) => { if (typeof v !== 'number') err('TYPE MISMATCH'); return v; };
    const FN = { RND: () => rand(), INT: Math.floor, ABS: Math.abs, SGN: Math.sign, SQR: Math.sqrt, SIN: Math.sin,
      COS: Math.cos, TAN: Math.tan, ATN: Math.atan, EXP: Math.exp, LOG: Math.log };
    function expr() {
      let a = and();
      while (eat('OR')) { const b = and(); a = num(a) || num(b) ? -1 : 0; }
      return a;
    }
    function and() { let a = not(); while (eat('AND')) { const b = not(); a = num(a) && num(b) ? -1 : 0; } return a; }
    function not() { return eat('NOT') ? (num(not()) ? 0 : -1) : cmp(); }
    function cmp() {
      const a = add();
      for (const op of ['<=', '>=', '<>', '=', '<', '>']) {
        if (!eat(op)) continue;
        const b = add();
        if (typeof a !== typeof b) err('TYPE MISMATCH');
        return { '<=': a <= b, '>=': a >= b, '<>': a !== b, '=': a === b, '<': a < b, '>': a > b }[op] ? -1 : 0;
      }
      return a;
    }
    function add() {
      let a = mul();
      for (;;) {
        if (eat('+')) { const b = mul(); if (typeof a !== typeof b) err('TYPE MISMATCH'); a = a + b; }
        else if (eat('-')) a = num(a) - num(mul());
        else return a;
      }
    }
    function mul() {
      let a = pow();
      for (;;) {
        if (eat('*')) a = num(a) * num(pow());
        else if (eat('/')) { const b = num(pow()); if (b === 0) err('DIVISION BY ZERO'); a = num(a) / b; }
        else return a;
      }
    }
    function pow() { let a = unary(); while (eat('^')) a = num(a) ** num(unary()); return a; }
    function unary() { return eat('-') ? -num(unary()) : eat('+') ? num(unary()) : atom(); }
    function atom() {
      ws();
      if (eat('(')) { const v = expr(); want(')'); return v; }
      if (eat('"')) { const j = s.indexOf('"', i); const v = s.slice(i, j < 0 ? s.length : j); i = j < 0 ? s.length : j + 1; return v; }
      const m = /^(\d+\.?\d*|\.\d+)(E[+-]?\d+)?/.exec(s.slice(i));
      if (m) { i += m[0].length; return Number(m[0]); }
      for (const f of ['CHR$', 'ASC', 'LEN', 'STR$', 'VAL', ...Object.keys(FN)]) {
        if (!eat(f)) continue;
        want('('); const v = expr(); want(')');
        if (f === 'CHR$') return String.fromCharCode(Math.floor(num(v)) & 255);
        if (f === 'ASC') return typeof v === 'string' && v ? v.charCodeAt(0) : err(typeof v === 'string' ? 'ILLEGAL QUANTITY' : 'TYPE MISMATCH');
        if (f === 'LEN') return typeof v === 'string' ? v.length : err('TYPE MISMATCH');
        if (f === 'STR$') return fmt(num(v)).trimEnd();
        if (f === 'VAL') return typeof v === 'string' ? (parseFloat(v) || 0) : err('TYPE MISMATCH');
        return FN[f](num(v));
      }
      const id = ident();
      if (!id) err('SYNTAX');
      i += id.length;
      if (eat('(')) { const k = num(expr()); want(')'); return cell(id, k).get(); }
      return getVar(id);
    }
    return { expr, eat, peek, want, ident, ws, rest: () => s.slice(i).trim(), end: () => { ws(); return i >= s.length; },
      skip: (k) => { i += k; } };
  }
  const key = (id) => id.replace(/\$$/, '').slice(0, 2) + (id.endsWith('$') ? '$' : '');
  function cell(id, k, dim) {
    const name = key(id) + '(';
    if (dim != null) { if (arrays.has(name)) err("REDIM'D ARRAY"); arrays.set(name, new Array(dim + 1).fill(id.endsWith('$') ? '' : 0)); }
    if (!arrays.has(name)) arrays.set(name, new Array(11).fill(id.endsWith('$') ? '' : 0));
    const a = arrays.get(name), j = Math.floor(k);
    if (dim == null && (j < 0 || j >= a.length)) err('BAD SUBSCRIPT');
    return { get: () => a[j], set: (v) => { if (id.endsWith('$') !== (typeof v === 'string')) err('TYPE MISMATCH'); a[j] = v; } };
  }
  const getVar = (id) => vars.get(key(id)) ?? (id.endsWith('$') ? '' : 0);
  function setVar(id, v) {
    if (id.endsWith('$') !== (typeof v === 'string')) err('TYPE MISMATCH');
    vars.set(key(id), v);
  }
  function fmt(v) {
    if (!Number.isFinite(v)) err('OVERFLOW');
    let t = Math.abs(v) >= 1e9 || (Math.abs(v) < 0.01 && v !== 0) ? Math.abs(v).toExponential(8).replace(/\.?0+e/, 'E')
      : String(Number(Math.abs(v).toPrecision(9)));
    t = t.replace(/^0\./, '.').replace(/E([+-])(\d)$/, 'E$10$2');
    return (v < 0 ? '-' : ' ') + t + ' ';
  }

  function goLine(num) {
    const lines = run.lines.length ? run.lines : sorted();
    const line = lines.find((l) => l.num === num);
    if (!line) err("UNDEF'D STATEMENT");
    run.lines = lines; run.line = line; run.si = 0;
  }
  function nextLine() { const k = run.lines.indexOf(run.line); run.line = run.lines[k + 1] ?? null; run.si = 0; }

  function exec(st) {
    const p = parser(st);
    const kw = KEYS.find((k) => st.startsWith(k)) ?? (st.startsWith('?') ? 'PRINT' : null);
    if (kw) p.skip(st.startsWith('?') ? 1 : kw.length);
    switch (kw) {
      case 'REM': case 'DATA': return;
      case 'DIM': {
        do {
          const id = p.ident(); if (!id) err('SYNTAX');
          p.skip(id.length); p.want('('); const n = p.expr(); p.want(')');
          cell(id, 0, typeof n === 'number' ? Math.floor(n) : err('TYPE MISMATCH'));
        } while (p.eat(','));
        if (!p.end()) err('SYNTAX');
        return;
      }
      case 'PRINT': {
        let nl = true;
        while (!p.end()) {
          nl = true;
          if (p.eat(';')) { nl = false; continue; }
          if (p.eat(',')) { nl = false; print(' '.repeat(10 - (cx % 10))); continue; }
          const v = p.expr();
          print(typeof v === 'number' ? fmt(v) : v);
        }
        if (nl) newline();
        return;
      }
      case 'GOTO': { const n = p.expr(); if (!p.end()) err('SYNTAX'); goLine(n); return; }
      case 'GOSUB': { const n = p.expr(); run.subs.push([run.line, run.si]); goLine(n); return; }
      case 'RETURN': { const r = run.subs.pop(); if (!r) err('RETURN WITHOUT GOSUB'); [run.line, run.si] = r; return; }
      case 'IF': {
        const c = p.expr();
        if (!p.eat('THEN') && !p.peek('GOTO')) err('SYNTAX');
        if (!c) { if (run.line.num === null) run.line = null; else nextLine(); return; }
        const rest = p.rest();
        if (/^\d+$/.test(rest)) { goLine(Number(rest)); return; }
        if (rest) exec(rest);
        return;
      }
      case 'FOR': {
        const id = p.ident(); if (!id || id.endsWith('$')) err('SYNTAX');
        p.skip(id.length); p.want('='); const a = p.expr(); p.want('TO'); const b = p.expr();
        const step = p.eat('STEP') ? p.expr() : 1;
        setVar(id, a);
        run.fors = run.fors.filter((f) => f.v !== key(id));
        run.fors.push({ v: key(id), end: b, step, line: run.line, si: run.si });
        return;
      }
      case 'NEXT': {
        const id = p.ident();
        let k = run.fors.length - 1;
        if (id) k = run.fors.findLastIndex((f) => f.v === key(id));
        if (k < 0) err('NEXT WITHOUT FOR');
        const f = run.fors[k];
        run.fors.length = k + 1;
        const v = vars.get(f.v) + f.step;
        vars.set(f.v, v);
        if (f.step >= 0 ? v <= f.end : v >= f.end) { run.line = f.line; run.si = f.si; } else run.fors.pop();
        return;
      }
      case 'END': run.line = null; return;
      case 'STOP': stopped(); return;
      case 'LIST': {
        if (dir) { if (cx) newline(); listDir(); return; }
        const m = /^(\d*)\s*(-?)\s*(\d*)$/.exec(p.rest());
        if (!m) err('SYNTAX');
        const lo = m[1] ? Number(m[1]) : 0, hi = m[3] ? Number(m[3]) : m[2] || !m[1] ? Infinity : lo;
        if (cx) newline();
        for (const num of [...prog.keys()].sort((a, b) => a - b)) if (num >= lo && num <= hi) println(`${num} ${prog.get(num)}`);
        return;
      }
      case 'RUN': {
        vars.clear(); arrays.clear(); run.fors = []; run.subs = [];
        const lines = sorted();
        if (!lines.length) { run.line = null; return; }
        const n = p.end() ? lines[0].num : p.expr();
        goLine(n);
        return;
      }
      case 'NEW': dir = false; prog.clear(); vars.clear(); arrays.clear(); run.line = null; return;
      case 'CLR': vars.clear(); arrays.clear(); return;
      case 'POKE': p.expr(); p.want(','); p.expr(); return;
      case 'SYS': if (p.expr() === 64738) { run = null; boot(); } return;
      case 'LOAD': {
        const m = /^"([^"]*)"?\s*(?:,\s*(\d+))?\s*$/.exec(p.rest().trim());
        if (!drive || !m || m[2] !== '8') { println('PRESS PLAY ON TAPE'); tape = true; run = null; return; }
        loadDisk(m[1]); run = null; println('READY.'); return;
      }
      case 'HELP': for (const l of HELP) println(l); return;
      case 'ABOUT': for (const l of ABOUT) println(l); return;
      case 'LET': default: {
        const id = p.ident();
        if (!id) err('SYNTAX');
        p.skip(id.length);
        let at = null;
        if (p.eat('(')) { at = p.expr(); p.want(')'); }
        p.want('=');
        const v = p.expr();
        if (!p.end()) err('SYNTAX');
        if (at === null) setVar(id, v); else cell(id, typeof at === 'number' ? at : err('TYPE MISMATCH')).set(v);
      }
    }
  }
  function listDir() {
    println(DIR_HEAD);
    for (const [b, name, type = 'PRG'] of DIR) println(`${String(b).padEnd(5)}${`"${name}"`.padEnd(19)}${type}`);
    println(`${DIR_FREE} BLOCKS FREE.`);
  }
  let loadingTo = null;
  function loadDisk(name) {
    const cvd = drive && diskNamed(name);
    if (cvd?.page) { run = null; open(cvd.slug, { typed: true }); return; }
    println(`SEARCHING FOR ${name}`);
    if (drive && name === 'RULIAD') { println('LOADING'); println('?OUT OF MEMORY  ERROR'); return; }

    const known = name === '$' || DISK_VIEW[name];
    if (!known) { println('?FILE NOT FOUND  ERROR'); return; }
    println('LOADING');
    if (name === '$') { dir = true; return; }
    dir = false;
    const v = DISK_VIEW[name];
    if (window.__room?.views?.().some((x) => x.id === v)) {
      loadingTo = v;
      queueMicrotask(() => (live.go ? live.go(v) : window.__room.goTo(v))?.catch?.(() => {}));
    }
  }
  function stopped() { const num = run.line?.num; run = null; println(num != null ? `BREAK IN ${num}` : 'BREAK'); println('READY.'); }
  function step(budget) {
    while (run && budget-- > 0) {
      if (!run.line || run.si >= run.line.stmts.length) {
        if (run.line && run.line.num !== null) { nextLine(); continue; }
        run = null;
        if (cx) newline();
        println('READY.');
        break;
      }
      const line = run.line, st = line.stmts[run.si++];
      try { exec(st); } catch (e) {
        if (!(e instanceof Bad)) throw e;
        run = null;
        if (cx) newline();
        println(`?${e.message}  ERROR${line.num !== null ? ` IN ${line.num}` : ''}`);
        println('READY.');
      }
    }
    return !!run;
  }

  let input = '';
  function boot() {
    clear(); vars.clear(); arrays.clear(); tape = false; dir = false; input = '';
    for (const l of BOOT) println(l);
    load(STORY);
    dirty = true;
  }
  function enter() {
    const line = input.trim();
    input = '';
    newline();
    out.length = 0;
    if (!line) return;
    if (/^\d/.test(line)) {
      dir = false;
      try { store(line); } catch { println('?SYNTAX  ERROR'); println('READY.'); }
      return;
    }
    run = { lines: [], line: { num: null, stmts: split(line) }, si: 0, fors: [], subs: [] };
    step(400);
    announce();
  }
  function typeChar(ch) {
    if (run || tape || seq) return;
    const code = ch.charCodeAt(0);
    if (!G5[ch] && ch !== ' ') return;
    if (input.length >= 79) return;
    input += ch;
    putc(code);
  }
  function backspace() {
    if (run || tape || !input) return;
    input = input.slice(0, -1);
    if (cx) cx--; else if (cy) { cy--; cx = COLS - 1; }
    grid[cy * COLS + cx] = 32;
    dirty = true;
  }
  function brk() {
    if (tape) { tape = false; println('BREAK'); println('READY.'); return true; }
    if (run) { stopped(); return true; }
    return false;
  }
  function feed(s) {
    for (const ch of s.toUpperCase()) {
      if (ch === '\n' || ch === '\r') enter(); else typeChar(ch);
    }
  }

  const ta = document.createElement('textarea');
  Object.assign(ta, { autocomplete: 'off', spellcheck: false, rows: 1 });
  ta.setAttribute('autocapitalize', 'characters');
  ta.setAttribute('autocorrect', 'off');
  ta.setAttribute('aria-label', 'Commodore 64, BASIC. Type LIST or RUN and press Enter; HELP for a hint. Escape leaves.');
  ta.className = 'c64-input';
  const sr = document.createElement('p');
  sr.className = 'c64-sr';
  sr.setAttribute('aria-live', 'polite');
  const chip = Object.assign(document.createElement('button'), { type: 'button', className: 'c64-leave', hidden: true });
  const css = document.createElement('style');
  css.textContent = `
    .c64-input { position: fixed; top: 0; left: 0; width: 1px; height: 1px; opacity: 0; border: 0; padding: 0;
      font-size: 16px; resize: none; pointer-events: none; }
    .c64-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; margin: 0; }
    .c64-leave { font: 13px/1 ui-sans-serif, system-ui, -apple-system, sans-serif; color: #d6f5d9; cursor: pointer;
      background: rgba(10, 30, 14, .82); border: 1px solid rgba(92, 204, 102, .5); border-radius: 999px; padding: 8px 14px; }
    .c64-leave:hover, .c64-leave:focus-visible { background: rgba(30, 70, 36, .9); outline: none; }
    .c64-leave[hidden], .gate .c64-leave { display: none; }`;
  document.head.appendChild(css);
  document.body.append(ta, sr, chip);
  function announce() { const t = out.join(' ').replace(/\s+/g, ' ').trim(); if (t) sr.textContent = t; }
  ta.addEventListener('keydown', (ev) => {
    ev.stopPropagation();
    if (ev.key === 'Escape') { ev.preventDefault(); brk(); blur(); live.go?.(live.home)?.catch?.(() => {}); }
    else if (ev.key === 'Enter') { ev.preventDefault(); if (!run && !tape && !seq) { enter(); } }
    else if (ev.key === 'Backspace') { ev.preventDefault(); backspace(); }
    else return;
    poke();
  });
  ta.addEventListener('beforeinput', (ev) => {
    if (!ev.cancelable) return;
    ev.preventDefault();
    if (ev.inputType === 'insertText' && ev.data) feed(ev.data);
    else if (ev.inputType === 'insertLineBreak' || ev.inputType === 'insertParagraph') { if (!run && !tape) enter(); }
    else if (ev.inputType === 'deleteContentBackward') backspace();
    poke();
  });
  ta.addEventListener('input', () => { if (ta.value) { feed(ta.value); ta.value = ''; poke(); } });
  ta.addEventListener('focus', () => { focused = true; syncChip(); poke(); });
  ta.addEventListener('blur', () => { focused = false; syncChip(); poke(); });
  chip.addEventListener('pointerdown', (ev) => ev.preventDefault());
  chip.addEventListener('click', () => { if (!brk()) blur(); poke(); });
  function syncChip() { chip.hidden = !focused; chip.textContent = run || tape ? 'Stop the program' : 'Leave the C64'; }
  function blur() { ta.blur(); }
  addEventListener('room:move', (ev) => { if (ev.detail !== 'c64' && focused) blur(); });
  addEventListener('room:move', (ev) => {
    const name = Object.keys(DISK_VIEW).find((k) => DISK_VIEW[k] === ev.detail);
    if (!drive || !name || !booted || run || tape || ev.detail === loadingTo) { loadingTo = null; return; }
    if (input) return;
    if (cx) newline();
    print(`LOAD"${name}",8`); newline();
    println(`SEARCHING FOR ${name}`); println('LOADING'); println('READY.');
    dirty = true;
  });

  const SEQ = { type: [0.10, 0.85], seated: 0.95, search: 1.25, steady: 1.6, loading: 2.45, ready: 2.95, run: [3.0, 3.12],
    clear: 3.3, row: 0.06, leave: 1.3 };
  const FLY = { arc: 0.70, slide: 0.25, lift: 0.032, over: 0.10, hover: 0.032, out: 0.003 };
  const box = byName('pr_floppybox'), drv = byName('pr_1541');
  const bx = box?.userData ?? {}, dx = drv?.userData ?? {};
  const slabs = drive && box && bx.floppybox_pitch != null;
  let seq = null, loaded = null, hovered = -1, ledOn = false, loads = 0;
  const frame = (o) => { if (!o) return null; const f = new THREE.Object3D(); f.rotation.x = -Math.PI / 2; o.add(f); f.updateWorldMatrix(true, false); return f; };
  const boxF = slabs ? frame(box) : null, drvF = drive && dx['1541_slot_pos'] ? frame(drv) : null;
  const lean = THREE.MathUtils.degToRad(bx.floppybox_lean ?? 12), SZ = bx.floppybox_size ?? 0.133, TH = bx.floppybox_thick ?? 0.0018;
  const toB = (v) => new THREE.Vector3(v[0], -v[2], v[1]);
  const slabQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -lean);
  const slabUp = new THREE.Vector3(0, 0, 1).applyQuaternion(slabQ), slabN = new THREE.Vector3(0, 1, 0).applyQuaternion(slabQ);
  const slabO = (i) => new THREE.Vector3(0, bx.floppybox_disk0_y + i * bx.floppybox_pitch, bx.floppybox_disk0_z + i * bx.floppybox_step);
  const diskOfSlab = (i) => DISKS[DISKS.length - 1 - i];
  function slabAt(p) {
    if (!slabs) return -1;
    const q = boxF.worldToLocal(p.clone());
    let best = -1, bd = Infinity;
    for (let i = 0; i < DISKS.length; i++) {
      const r = q.clone().sub(slabO(i)), d = Math.abs(r.dot(slabN) + TH / 2), h = r.dot(slabUp);
      if (h < SZ * 0.55 || h > SZ + 0.003 || Math.abs(r.x) > SZ / 2 + 0.002 || d > TH + 0.004) continue;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  let disk = null, diskCanvas = null;
  const BOXLAB = { stripe: 0.040, x: 0.064, nameTop: 0.14, nameCap: 0.40, detailTop: 0.63, detailCap: 0.16, right: 0.135 };
  function diskMesh(d) {
    const N = 1024;
    if (!disk) {
      diskCanvas = Object.assign(document.createElement('canvas'), { width: N, height: N });
      const t = new THREE.CanvasTexture(diskCanvas); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
      disk = noPick(new THREE.Mesh(new THREE.BoxGeometry(SZ, TH, SZ), new THREE.MeshBasicMaterial({ map: t, color: new THREE.Color(0.8, 0.8, 0.8) })));
      disk.name = 'c64_disk';
    }
    const x = diskCanvas.getContext('2d'), k = N / SZ;
    x.fillStyle = '#121214'; x.fillRect(0, 0, N, N);
    x.fillStyle = '#2a2a2e'; x.beginPath(); x.arc(N / 2, N * 0.59, N * 0.12, 0, 7); x.fill();
    x.fillStyle = '#050505'; x.beginPath(); x.arc(N / 2, N * 0.59, N * 0.055, 0, 7); x.fill(); x.fillRect(N * 0.46, N * 0.77, N * 0.08, N * 0.2);
    const [sw, sh] = bx.floppybox_strip ?? [0.124, 0.016], w = sw * k, h = sh * k, x0 = (N - w) / 2, y0 = 0.002 * k;
    x.fillStyle = '#ece4ce'; x.fillRect(x0, y0, w, h);
    x.fillStyle = d.stripe; x.fillRect(x0, y0, BOXLAB.stripe * w, h);
    x.textBaseline = 'alphabetic';
    const fit = (txt, font, cap, maxW) => {
      x.font = font.replace('$', `${(cap / 0.70).toFixed(1)}px`);
      const tw = x.measureText(txt).width;
      if (tw > maxW) x.font = font.replace('$', `${(cap / 0.70 * maxW / tw).toFixed(1)}px`);
    };
    const tx = x0 + BOXLAB.x * w, maxW = w * (1 - BOXLAB.x - BOXLAB.right);
    x.fillStyle = '#221e1c';
    fit((d.label ?? d.name).replace(/'/g, '\u2019'), `700 $ ${FACES.narrow}`, BOXLAB.nameCap * h, maxW);
    x.fillText((d.label ?? d.name).replace(/'/g, '\u2019'), tx, y0 + (BOXLAB.nameTop + BOXLAB.nameCap) * h);
    if (d.detail) {
      x.fillStyle = '#3a342e';
      fit(d.detail, `400 $ ${FACES.serif}`, BOXLAB.detailCap * h, maxW);
      x.fillText(d.detail, tx, y0 + (BOXLAB.detailTop + BOXLAB.detailCap) * h);
    }
    disk.material.map.needsUpdate = true;
    return disk;
  }
  const P = new THREE.Vector3(), Q = new THREE.Quaternion(), M = new THREE.Matrix4();
  function worldPose(f, pos, quat) { M.compose(pos, quat, new THREE.Vector3(1, 1, 1)).premultiply(f.matrixWorld); const p = new THREE.Vector3(), q = new THREE.Quaternion(); M.decompose(p, q, new THREE.Vector3()); return [p, q]; }
  const atSlab = (i, up = 0, out = 0) => worldPose(boxF, slabO(i).addScaledVector(slabUp, SZ / 2 + up).addScaledVector(slabN, -out), slabQ);
  const flatQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
  const atSlot = (k) => { const s0 = toB(dx['1541_slot_pos']); return worldPose(drvF, s0.add(new THREE.Vector3(0, -SZ / 2 - 0.015 + k * (SZ + 0.015), 0)), flatQ); };
  function place(fl) {
    if (!disk || fl.slab == null) return false;
    const t = fl.t;
    if (t >= FLY.arc + FLY.slide) { scene().remove(disk); return false; }
    if (t < FLY.arc) {
      const u = t / FLY.arc, e = u * u * (3 - 2 * u);
      const [a, qa] = atSlab(fl.slab, FLY.lift, FLY.out), [b, qb] = atSlot(0);
      const c = a.clone().lerp(b, 0.5); c.y = Math.max(a.y, b.y) + FLY.over;
      disk.position.copy(a).multiplyScalar((1 - e) * (1 - e)).addScaledVector(c, 2 * e * (1 - e)).addScaledVector(b, e * e);
      disk.quaternion.copy(qa).slerp(qb, Math.min(1, e * 1.4));
    } else {
      const [p, q] = atSlot((t - FLY.arc) / FLY.slide);
      disk.position.copy(p); disk.quaternion.copy(q);
    }
    return true;
  }
  const scene = () => { let o = node; while (o.parent) o = o.parent; return o; };
  let led = null;
  if (drvF && dx['1541_led_pos']) {
    led = noPick(new THREE.Mesh(new THREE.CircleGeometry(0.0027, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.12, 0.06) })));
    led.name = 'c64_drive_led';
    led.position.copy(toB(dx['1541_led_pos'])).add(new THREE.Vector3(0, -0.0002, 0));
    led.rotation.x = Math.PI / 2;
    led.visible = false;
    drvF.add(led);
  }
  function setLed(on) { if (led && led.visible !== on) { led.visible = on; live.render(); } ledOn = on; }
  function events(d) {
    const E = [];
    const cmd = `LOAD"${d.name}",8`;
    for (let j = 0; j < cmd.length; j++) E.push([SEQ.type[0] + j * (SEQ.type[1] - SEQ.type[0]) / cmd.length, () => putc(cmd.charCodeAt(j))]);
    E.push([SEQ.type[1] + 0.05, () => newline()]);
    E.push([SEQ.seated, () => { setLed(true); dispatchEvent(new CustomEvent('room:drive', { detail: { slug: d.slug } })); }]);
    E.push([SEQ.search, () => println(`SEARCHING FOR ${d.name}`)]);
    E.push([SEQ.loading, () => println('LOADING')]);
    E.push([SEQ.ready, () => { println('READY.'); setLed(false); prog.clear(); vars.clear(); arrays.clear();
      store(`10 REM ${d.name}`); }]);
    for (let j = 0; j < 3; j++) E.push([SEQ.run[0] + j * (SEQ.run[1] - SEQ.run[0]) / 2, () => putc('RUN'.charCodeAt(j))]);
    E.push([SEQ.clear, () => clear()]);
    E.push([SEQ.clear, () => bar(`${number(d)}/${String(CV).padStart(2, '0')} ${d.name}`)]);
    const rows = ['', ...screenRows(d), '', 'READY.'];
    rows.forEach((r, j) => E.push([SEQ.clear + (j + 1) * SEQ.row, () => println(r)]));
    E.push([SEQ.clear + (rows.length + 1) * SEQ.row, () => { announce(); card(d); }]);
    return E;
  }
  function card(d) {
    const n = DISKS.indexOf(d) + 1;
    live.card?.({ k: `Disk ${n} of ${CV}`, t: d.name, b: cardText(d), pre: true,
      acts: (d.links ?? []).map((l) => ({ label: l.label, href: l.href, ext: true })) });
  }
  function open(slug, { typed = false, history = true } = {}) {
    const d = bySlug(slug);
    if (!d || !drive) return false;
    if (!booted) { boot(); booted = true; }
    if (run) stopped();
    tape = false;
    if (input) { input = ''; newline(); }
    const at = typed ? SEQ.seated - 0.01 : 0;
    const E = events(d).filter(([t]) => t >= at);
    const slab = typed || !slabs || live.reduceMotion.matches ? null : DISKS.length - 1 - DISKS.indexOf(d);
    seq = { d, t: at, E, k: 0, fl: { t: 0, slab } };
    if (slab != null) { if (disk) scene().remove(disk); scene().add(diskMesh(d)); place(seq.fl); }
    hovered = -1; hovSlab = -1; if (hovRaf) cancelAnimationFrame(hovRaf); hovRaf = 0;
    loads++;
    const sub = `disk-${slug}`, here = live.view();
    if (history && !live.gate) {
      seq.via = !typed && slabs && !live.reduceMotion.matches && here !== 'c64';
      live.go?.(seq.via ? 'disks' : 'c64', sub)?.catch?.(() => {});
      if (seq.via) seq.E.push([SEQ.leave, () => live.go?.('c64', sub)?.catch?.(() => {})]), seq.E.sort((a, b) => a[0] - b[0]);
    }
    if (live.reduceMotion.matches) {
      for (const [, f] of seq.E) f();
      seq.E = []; setLed(true); seq.ledUntil = seq.t + 1;
    }
    syncStrip(); dirty = true; live.render();
    return true;
  }
  function eject() {
    if (!seq && !loaded) return;
    if (disk) scene().remove(disk);
    seq = null; loaded = null; setLed(false);
    if (run) run = null;
    clear(); println('READY.');
    load(STORY);
    syncStrip(); dirty = true;
  }
  function seqTick(dt) {
    if (!seq) return false;
    seq.t += dt; seq.fl.t += dt;
    while (seq.k < seq.E.length && seq.E[seq.k][0] <= seq.t) seq.E[seq.k++][1]();
    if (seq.fl.slab != null && !place(seq.fl)) seq.fl.slab = null;
    if (seq.ledUntil != null && seq.t >= seq.ledUntil) { setLed(false); seq.ledUntil = null; }
    else if (ledOn && seq.t > SEQ.steady && seq.t < SEQ.ready - 0.1) led.visible = Math.sin(seq.t * 47) + Math.sin(seq.t * 29) > -0.3;
    if (seq.k >= seq.E.length && seq.fl.slab == null && seq.ledUntil == null) { loaded = seq.d; seq = null; if (led) led.visible = ledOn; }
    dirty = true;
    return true;
  }
  let aimed = -1;
  if (slabs) live.picks.push({ object: box, accept: (p) => { aimed = live.view() === 'disks' && !live.moving() ? slabAt(p) : -1; return aimed >= 0; },
    onPick: () => { if (aimed >= 0) open(diskOfSlab(aimed).slug); } });
  const hray = new THREE.Raycaster(), hndc = new THREE.Vector2();
  if (slabs) live.renderer.domElement.addEventListener('pointermove', (ev) => {
    if (ev.pointerType !== 'mouse' || seq || live.view() !== 'disks' || live.moving()) { if (hovered >= 0 && !seq) unhover(); return; }
    const r = live.renderer.domElement.getBoundingClientRect();
    hndc.set((ev.clientX - r.left) / r.width * 2 - 1, -(ev.clientY - r.top) / r.height * 2 + 1);
    hray.setFromCamera(hndc, live.camera);
    const h = hray.intersectObject(box, true)[0];
    hover(h ? slabAt(h.point) : -1);
  });
  let hovSlab = -1, hovUp = 0, hovRaf = 0, hovCap = FLY.hover;
  function liftCap(i) {
    const r = live.renderer.domElement.getBoundingClientRect(), m = new THREE.Matrix4();
    const topY = (up) => { const [p, q] = atSlab(i, up, FLY.out); m.compose(p, q, new THREE.Vector3(1, 1, 1));
      return Math.min(...[-1, 1].map((sx) => (1 - new THREE.Vector3(sx * SZ / 2, -TH / 2, SZ / 2).applyMatrix4(m).project(live.camera).y) / 2 * r.height)); };
    if (topY(FLY.hover) >= 6) return FLY.hover;
    let lo = 0, hi = FLY.hover;
    for (let k = 0; k < 10; k++) { const mid = (lo + hi) / 2; if (topY(mid) >= 6) lo = mid; else hi = mid; }
    return lo;
  }
  function hoverPose() { const [p, q] = atSlab(hovSlab, hovUp, FLY.out); disk.position.copy(p); disk.quaternion.copy(q); }
  function hoverStep() {
    hovRaf = 0;
    if (seq || hovSlab < 0) return;
    const goal = hovered >= 0 ? hovCap : 0;
    hovUp = live.reduceMotion.matches ? goal : hovUp + (goal - hovUp) * 0.28;
    if (Math.abs(goal - hovUp) < 0.0003) hovUp = goal;
    if (hovUp === 0 && hovered < 0) { scene().remove(disk); hovSlab = -1; live.render(); return; }
    hoverPose(); live.render();
    if (hovUp !== goal) hovRaf = requestAnimationFrame(hoverStep);
  }
  function hover(i, now = false) {
    if (i === hovered && !now) return;
    if (i >= 0 && i !== hovSlab) { hovSlab = i; hovUp = 0; hovCap = liftCap(i); scene().add(diskMesh(diskOfSlab(i))); }
    hovered = i;
    if (now) { if (hovRaf) cancelAnimationFrame(hovRaf); hovRaf = 0; hovUp = i >= 0 ? hovCap : 0; if (hovSlab >= 0) hoverStep(); return; }
    if (!hovRaf) hovRaf = requestAnimationFrame(hoverStep);
  }
  function unhover() { hover(-1); }
  const strip = document.createElement('nav');
  strip.className = 'c64-strip'; strip.hidden = true;
  strip.setAttribute('aria-label', 'The disks');
  if (drive) {
    for (const d of DISKS) {
      const a = Object.assign(document.createElement('a'), { href: `#disk-${d.slug}`, textContent: d.name });
      a.style.setProperty('--edge', d.stripe);
      a.dataset.slug = d.slug;
      a.addEventListener('click', (ev) => { ev.preventDefault(); open(d.slug); });
      strip.appendChild(a);
    }
    const st = document.createElement('style');
    st.textContent = `
      .c64-strip { position: fixed; left: 50%; transform: translateX(-50%); bottom: calc(max(16px, env(safe-area-inset-bottom, 0px)) + 96px);
        z-index: 4; display: flex; gap: 6px; overflow-x: auto; max-width: min(820px, calc(100vw - 32px)); padding: 4px; box-sizing: border-box;
        scrollbar-width: thin; overscroll-behavior-x: contain; }
      .c64-strip[hidden], .gate .c64-strip { display: none; }
      .c64-strip a { flex: 0 0 auto; min-width: 88px; min-height: 44px; box-sizing: border-box; display: flex; align-items: center;
        padding: 0 12px 0 16px; border-radius: 3px; background: linear-gradient(90deg, var(--edge) 0 7px, #ece6d2 7px);
        color: #1b1b4a; font: 600 12px/1 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .02em; text-decoration: none;
        box-shadow: 0 1px 3px rgba(0, 0, 0, .5); }
      .c64-strip a:hover, .c64-strip a:focus-visible { outline: 2px solid #5ccc66; outline-offset: 1px; }
      .c64-strip a[aria-current] { box-shadow: 0 0 0 2px #5ccc66, 0 1px 3px rgba(0, 0, 0, .5); }
      @media (max-width: 640px) { .c64-strip { left: 0; right: 0; transform: none; max-width: none; padding: 4px 16px;
        bottom: calc(max(16px, env(safe-area-inset-bottom, 0px)) + 62px); } }`;
    document.head.appendChild(st);
    document.body.appendChild(strip);
  }
  function syncStrip() {
    const v = live.view();
    strip.hidden = !drive || !(v === 'disks' || v === 'c64');
    document.documentElement.classList.toggle('has-strip', !strip.hidden);
    const on = (seq ?? { d: loaded })?.d?.slug;
    for (const a of strip.children) {
      a.toggleAttribute('aria-current', a.dataset.slug === on);
      if (a.dataset.slug === on && !strip.hidden) a.scrollIntoView({ inline: 'nearest', block: 'nearest' });
    }
  }
  addEventListener('room:move', (ev) => { if (ev.detail !== 'c64' && !(seq?.via && ev.detail === 'disks')) eject(); syncStrip(); });
  addEventListener('popstate', (ev) => { const m = /^disk-(.+)$/.exec(ev.state?.sub ?? ''); if (m) open(m[1], { history: false }); });

  let focused = false, booted = false, blinkT = 0, cursorOn = true, acc = 1;
  const poke = () => { dirty = true; live.render(); };
  let holdUntil = 0;
  document.addEventListener('mousedown', (ev) => { if (performance.now() < holdUntil) ev.preventDefault(); }, true);
  function focus() {
    if (!booted) { boot(); booted = true; }
    ta.focus({ preventScroll: true });
    holdUntil = performance.now() + 600;
    window.__room?.layers?.hotspots?.close?.();
    const v = window.__room?.views?.().find((x) => x.id === 'c64');
    if (v && live.view() !== 'c64') (live.go ? live.go('c64') : window.__room.goTo('c64')).catch(() => {});
    poke();
  }
  for (const name of ['pr_c64mon', 'c64']) { const o = byName(name); if (o) live.picks.push({ object: o, accept: () => true, onPick: focus }); }

  function tick(dt) {
    if (!booted) { boot(); booted = true; }
    seqTick(dt);
    if (run) {
      if (live.reduceMotion.matches) {
        step(1200);
        if (run) stopped();
      } else step(Math.max(1, Math.round(dt * STMT_HZ)));
      if (!run) { announce(); syncChip(); }
    }
    const blink = !run && !tape && !live.reduceMotion.matches;
    if (blink) {
      blinkT += dt;
      if (blinkT >= BLINK_S) { blinkT %= BLINK_S; cursorOn = !cursorOn; dirty = true; }
    } else if (!cursorOn || run) { cursorOn = !run; dirty = true; }
    return dirty;
  }
  function show() { draw(cursorOn && !run && !tape); dirty = false; }

  return {
    name: 'c64',
    onView(id) { if (id !== 'c64' && focused) blur(); syncChip(); syncStrip(); if (id === 'c64' && loaded?.page) queueMicrotask(() => card(loaded)); },
    update(dt) {
      if (seq) {
        tick(dt); acc += dt;
        if (acc >= 1 / FPS || !quad.visible) { acc = 0; show(); }
        return true;
      }
      if (live.gate && !quad.visible) return false;
      if (!focused && !inView(live.camera, quad)) return false;
      const changed = tick(dt);
      acc += dt;
      if (!changed && quad.visible) return false;
      if (acc < 1 / FPS && quad.visible) return true;
      acc = 0;
      syncChip();
      show();
      return true;
    },
    api: {
      advance(sec, h = 1 / FPS) { let k = Math.round(sec / h); while (k-- > 0) tick(h); show(); live.render(); return this.info(); },
      focus,
      blur,
      type(s) { if (!booted) { boot(); booted = true; } feed(s); show(); live.render(); return this.info(); },
      loadDisk(slug) { const ok = open(slug, { history: false }); show(); live.render(); return ok; },
      open: (slug) => open(slug),
      eject() { eject(); show(); live.render(); },
      disks: () => DISKS.map((d) => ({ slug: d.slug, name: d.name, rows: d.page ? screenRows(d) : null, card: d.page ? cardText(d) : null })),
      strip: () => [...strip.children].map((a) => { const r = a.getBoundingClientRect(); return { slug: a.dataset.slug, x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; }),
      hoverSlab(i) {
        if (!slabs) return null;
        hover(i, true);
        if (i < 0) return { out: !!disk?.parent };
        live.render(); disk.updateWorldMatrix(true, false);
        const r = live.renderer.domElement.getBoundingClientRect(), [sw, sh] = bx.floppybox_strip ?? [0.124, 0.016];
        const at = (fx, fy) => disk.localToWorld(new THREE.Vector3((fx - 0.5) * sw, -TH / 2 - 0.0002, SZ / 2 - 0.002 - fy * sh));
        const px = (v) => { const p = v.clone().project(live.camera); return [(p.x + 1) / 2 * r.width, (1 - p.y) / 2 * r.height, p.z]; };
        const cs = [at(0, 0), at(1, 0), at(0, 1), at(1, 1)].map(px);
        const meshes = []; scene().traverse((m) => { if (m.isMesh && m.visible && m !== disk) meshes.push(m); });
        let clear = 0, n = 0;
        for (const fx of [0.08, 0.3, 0.5, 0.7, 0.92]) for (const fy of [0.15, 0.5, 0.85]) {
          const w = at(fx, fy), p = px(w); n++;
          hray.setFromCamera(new THREE.Vector2(p[0] / r.width * 2 - 1, 1 - p[1] / r.height * 2), live.camera);
          const hit = hray.intersectObjects(meshes, false)[0];
          if (!hit || hit.distance > live.camera.position.distanceTo(w) - 0.0005) clear++;
        }
        const xs = cs.map((c) => c[0]), ys = cs.map((c) => c[1]);
        const capPx = Math.hypot(...[0, 1].map((k) => px(at(0.5, BOXLAB.nameTop))[k] - px(at(0.5, BOXLAB.nameTop + BOXLAB.nameCap))[k]));
        return { slab: i, slug: diskOfSlab(i).slug, box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
          inFrame: Math.min(...xs) >= 0 && Math.min(...ys) >= 0 && Math.max(...xs) <= r.width && Math.max(...ys) <= r.height,
          clear, of: n, capPx: +capPx.toFixed(1), W: r.width, H: r.height };
      },
      slabPx(slug) {
        const d = bySlug(slug);
        if (!slabs || !d) return null;
        const i = DISKS.length - 1 - DISKS.indexOf(d);
        const v = boxF.localToWorld(slabO(i).addScaledVector(slabUp, SZ - 0.007).addScaledVector(slabN, -TH)).project(live.camera);
        const r = live.renderer.domElement.getBoundingClientRect();
        return v.z > 1 ? null : { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height, slab: i };
      },
      capPx() {
        const r = live.renderer.domElement.getBoundingClientRect(), px = (v) => { v.project(live.camera); return [(v.x + 1) / 2 * r.width, (1 - v.y) / 2 * r.height]; };
        const a = px(quad.localToWorld(new THREE.Vector3(0, sh / 2, 0))), b = px(quad.localToWorld(new THREE.Vector3(0, -sh / 2, 0)));
        return +(Math.hypot(a[0] - b[0], a[1] - b[1]) * 7 / (ROWS * 8 + 2 * BORDER[1])).toFixed(2);
      },
      fieldPx() {
        const r = live.renderer.domElement.getBoundingClientRect(), Wc = COLS * 8 + 2 * BORDER[0];
        const at = (c64x) => { const v = quad.localToWorld(new THREE.Vector3((c64x / Wc - 0.5) * sw, 0, 0)).project(live.camera); return Math.round((v.x + 1) / 2 * r.width); };
        return [at(BORDER[0]), at(BORDER[0] + 37 * 8 + 7)];
      },
      ledPx() {
        if (!led) return null;
        const v = led.getWorldPosition(new THREE.Vector3()).project(live.camera);
        const r = live.renderer.domElement.getBoundingClientRect();
        return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height, inFrame: Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1 && v.z < 1 };
      },
      text: () => Array.from({ length: ROWS }, (_, r) => String.fromCharCode(...grid.slice(r * COLS, r * COLS + COLS))
        .replace(/[\xcd]/g, '\\').replace(/[\xce]/g, '/').replace(/\xa0/g, '#').trimEnd()),
      hash() {
        const px = g.getImageData(0, 0, W, H).data;
        let h = 0x811c9dc5;
        for (let i = 0; i < px.length; i += 4) { h ^= px[i + 1]; h = Math.imul(h, 0x01000193); }
        return (h >>> 0).toString(16);
      },
      screenPx() {
        const v = quad.getWorldPosition(new THREE.Vector3()).project(live.camera);
        const r = live.renderer.domElement.getBoundingClientRect();
        return v.z > 1 ? null : { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height };
      },
      info: () => ({ focused, running: !!run, disk: seq?.d.slug ?? loaded?.slug ?? null, loading: !!seq, t: seq ? +seq.t.toFixed(3) : null,
        led: !!led?.visible, ledOn, diskOut: !!disk?.parent, loads, strip: !strip.hidden, hooks: !!slabs && !!led, visible: quad.visible, inView: inView(live.camera, quad), cursor: [cx, cy],
        lines: prog.size, canvas: [W, H] }),
    },
  };
}
