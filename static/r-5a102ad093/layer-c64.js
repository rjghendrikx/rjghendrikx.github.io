// Live layer: the C64's green monitor (pr_c64mon) runs BASIC. Click the monitor or the C64 and you are at the
// keyboard: the camera goes to the C64 view, a hidden textarea takes the keys (so a phone shows its keyboard),
// Esc or the Leave chip lets go. Esc while a program runs is RUN/STOP.
//
// The look: a C64 on a green monochrome monitor (Ruud's memory, 2026-10-16). The C64's blue field and light-blue
// text and border become luma levels on a green tube: mid-green text on a dim green field inside a slightly
// brighter frame (research projection-centrepiece.md §4, inferred from the luma levels, no period photo
// checked), a faint glow round each pixel, scanlines, a darker rim. Boot text verified there against the KERNAL
// string at $E473.
//
// The BASIC is hand-written here (~300 lines): no ROM, no emulator, no code from Felix Rieseberg's site (his
// green-screen PC was the pattern only). LIST shows Ruud's story as a program, RUN prints it and flows into the
// 10 PRINT maze; PRINT, GOTO, IF, FOR/NEXT, GOSUB, variables and line entry work as on a C64 in direct mode;
// HELP or ABOUT gives a hint (not C64 commands); anything else is ?SYNTAX  ERROR. Story copy is draft:
// notes/captions.md "C64 BASIC" [check].
//
// Font: our own glyphs, drawn here as 5 x 7 rows and set bold the way the C64's are (each pixel doubled to the
// right) in the 8 x 8 cell, plus the two PETSCII diagonals for the maze. Not C64 Pro Mono: its licence allows
// unmodified web embedding but forbids redistribution for download (style64.org/c64-truetype/license), and a
// woff on GitHub Pages is a download; not the character ROM (Commodore's).
//
// Cost: nothing while the screen is out of view and not focused (the clock and any program pause); in view the
// canvas is redrawn only when a cell or the cursor changes, at most FPS times a second. Gate: invisible until
// api.advance() or another api call; nothing autostarts. Reduced motion: a steady cursor, and RUN shows its
// end state at once (BREAK after one screenful of maze).
//
// Hooks (lib/live.PROP_HOOKS pr_c64mon, node-local glTF axes): c64mon_screen_center, _size, _normal.
import { inView, noPick, rng, seedFrom } from './layer-common.js';

const COLS = 40, ROWS = 25;
const BORDER = [32, 44];        // C64 px, so the frame is 4:3 like the tube (384 x 288)
const S = 2;                    // canvas px per C64 px
const FPS = 30;                 // texture uploads per second, at most
const BLINK_S = 1 / 3;          // the C64 cursor's half period: 20 jiffies (unmeasured on hardware)
const STMT_HZ = 900;            // BASIC statements per second (unmeasured: about a C64's pace for these loops)
const SCREEN_LEVEL = 0.92;      // the unlit screen against the baked night room (by eye)
const C = { border: '#1a4520', field: '#0e2812', text: '#5ccc66', glow: 'rgba(92, 204, 102, 0.22)' };
const BOOT = ['', '    **** COMMODORE 64 BASIC V2 ****', '', ' 64K RAM SYSTEM  38911 BASIC BYTES FREE', '', 'READY.'];
// [check] notes/captions.md "C64 BASIC": the story (README "The story", llms-full.txt), one screen of LIST
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
const HELP = ['TRY LIST, RUN, PRINT 2+2 OR', '10 PRINT "HI":GOTO 10', 'ESC STOPS A PROGRAM, THEN LEAVES.'];   // [check]
const ABOUT = ['A BASIC WRITTEN BY HAND FOR THIS', 'ROOM: NO ROMS, NO EMULATOR.', 'THE ROOM IS A PROGRAM TOO.'];   // [check]

// 5 x 7 glyphs, rows top to bottom, 5 bits each (our own drawing)
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
const DIAG = { 205: (x, y) => x === y || x === y + 1, 206: (x, y) => x + y === 7 || x + y === 6 };   // ╲ ╱, full cell

export default function mount(live) {
  const { THREE, byName } = live;
  const node = byName('pr_c64mon');
  const d = node?.userData;
  if (!d?.c64mon_screen_center) return null;

  // ---------------------------------------------------------------- canvas, glyph atlas, quad
  const W = (COLS * 8 + 2 * BORDER[0]) * S, H = (ROWS * 8 + 2 * BORDER[1]) * S;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d');
  const atlas = makeAtlas();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;   // mipmapped: the 1-px scanlines and 2-px strokes alias into moire
  tex.anisotropy = Math.min(4, live.renderer.capabilities.getMaxAnisotropy());   // when 768 px land on ~350
  const [sw, sh] = d.c64mon_screen_size;
  const quad = noPick(new THREE.Mesh(new THREE.PlaneGeometry(sw, sh),
    new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(SCREEN_LEVEL, SCREEN_LEVEL, SCREEN_LEVEL) })));
  quad.name = 'c64_screen';
  const n = new THREE.Vector3().fromArray(d.c64mon_screen_normal).normalize();
  quad.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
  quad.position.fromArray(d.c64mon_screen_center).addScaledVector(n, 0.0003);
  quad.visible = false;
  node.add(quad);

  function makeAtlas() {   // 2 rows of 256 cells: crisp glyphs, then their glow
    const a = document.createElement('canvas');
    a.width = 256 * 8 * S; a.height = 2 * 8 * S;
    const x = a.getContext('2d');
    for (let code = 0; code < 256; code++) {
      const on = bits(code);
      if (!on) continue;
      for (let py = 0; py < 8; py++) for (let px = 0; px < 8; px++) {
        if (!on(px, py)) continue;
        x.fillStyle = C.text; x.fillRect((code * 8 + px) * S, py * S, S, S);
        x.fillStyle = C.glow; x.fillRect((code * 8 + px) * S - 1, 8 * S + py * S - 1, S + 2, S + 2);
      }
    }
    return a;
  }
  function bits(code) {
    if (DIAG[code]) return DIAG[code];
    if (code === 160) return () => true;                          // reverse space: the cursor block
    const rows = G5[String.fromCharCode(code)]?.split(' ');
    if (!rows) return null;
    // 5 x 7 at column 1, bold to the right like the C64's 2-px stems
    return (x, y) => y < 7 && ((x >= 1 && x <= 5 && rows[y][x - 1] === '1') || (x >= 2 && x <= 6 && rows[y][x - 2] === '1'));
  }

  // ---------------------------------------------------------------- the screen: 40 x 25 cells
  const grid = new Uint8Array(COLS * ROWS).fill(32);
  let cx = 0, cy = 0, dirty = true;
  function scroll() { grid.copyWithin(0, COLS); grid.fill(32, COLS * (ROWS - 1)); cy = ROWS - 1; }
  function newline() { cx = 0; if (++cy >= ROWS) scroll(); dirty = true; }
  function putc(code) {
    if (code === 13) { newline(); return; }
    if (code === 147) { grid.fill(32); cx = cy = 0; dirty = true; return; }   // CHR$(147): clear screen
    grid[cy * COLS + cx] = code;
    if (++cx >= COLS) newline();
    dirty = true;
  }
  const out = [];                 // the text since the last Enter, for the screen-reader line
  function print(s) { for (const ch of s) putc(ch.charCodeAt(0)); if (out.length < 40) out.push(s); }
  function println(s = '') { if (cx) newline(); print(s); newline(); }

  function draw(cursorOn) {
    g.fillStyle = C.border; g.fillRect(0, 0, W, H);
    const ox = BORDER[0] * S, oy = BORDER[1] * S;
    g.fillStyle = C.field; g.fillRect(ox, oy, COLS * 8 * S, ROWS * 8 * S);
    const cell = 8 * S;
    for (const row of [1, 0]) {   // glow under, crisp over
      for (let i = 0; i < grid.length; i++) {
        let code = grid[i];
        if (cursorOn && i === cy * COLS + cx) code = code === 32 ? 160 : code;
        if (code === 32) continue;
        g.drawImage(atlas, code * cell, row * cell, cell, cell, ox + (i % COLS) * cell, oy + Math.floor(i / COLS) * cell, cell, cell);
      }
    }
    g.fillStyle = 'rgba(0, 0, 0, 0.26)';                               // scanlines: every other canvas row
    for (let y = 1; y < H; y += 2) g.fillRect(0, y, W, 1);
    const v = g.createRadialGradient(W / 2, H / 2, H * 0.42, W / 2, H / 2, H * 0.86);   // the tube's darker rim
    v.addColorStop(0, 'rgba(0, 0, 0, 0)'); v.addColorStop(1, 'rgba(0, 0, 0, 0.5)');
    g.fillStyle = v; g.fillRect(0, 0, W, H);
    tex.needsUpdate = true;
    quad.visible = true;
  }

  // ---------------------------------------------------------------- BASIC
  const rand = rng(seedFrom(live.params, 64));
  const prog = new Map();
  const vars = new Map();
  let run = null;                 // { lines, line, si, fors, subs } while a program or a direct line runs
  let tape = false;               // LOAD: waiting for a tape that never comes
  class Bad extends Error {}
  const err = (m) => { throw new Bad(m); };
  const KEYS = ['PRINT', 'GOTO', 'GOSUB', 'RETURN', 'IF', 'FOR', 'NEXT', 'LET', 'REM', 'END', 'STOP', 'LIST', 'RUN',
    'NEW', 'CLR', 'POKE', 'SYS', 'LOAD', 'HELP', 'ABOUT', 'DATA'];

  function load(lines) { prog.clear(); for (const l of lines) store(l); }
  function store(text) {
    const m = /^\s*(\d+)\s?(.*)$/.exec(text);
    const num = Number(m[1]);
    if (num > 63999) err('SYNTAX');
    if (m[2].trim()) prog.set(num, m[2]); else prog.delete(num);
  }
  function split(text) {          // statements on a line: ':' outside quotes; REM swallows the rest
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

  // expressions: recursive descent over one statement's text
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
      while (eat('OR')) a = (num(a) || num(and())) ? -1 : 0;
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
      return getVar(id);
    }
    return { expr, eat, peek, want, ident, ws, rest: () => s.slice(i).trim(), end: () => { ws(); return i >= s.length; },
      skip: (k) => { i += k; } };
  }
  const key = (id) => id.replace(/\$$/, '').slice(0, 2) + (id.endsWith('$') ? '$' : '');   // C64: two letters count
  const getVar = (id) => vars.get(key(id)) ?? (id.endsWith('$') ? '' : 0);
  function setVar(id, v) {
    if (id.endsWith('$') !== (typeof v === 'string')) err('TYPE MISMATCH');
    vars.set(key(id), v);
  }
  function fmt(v) {                // C64 PRINT of a number: a sign column, no leading 0, a trailing space
    if (!Number.isFinite(v)) err('OVERFLOW');
    let t = Math.abs(v) >= 1e9 || (Math.abs(v) < 0.01 && v !== 0) ? Math.abs(v).toExponential(8).replace(/\.?0+e/, 'E')
      : String(Number(Math.abs(v).toPrecision(9)));
    t = t.replace(/^0\./, '.').replace(/E([+-])(\d)$/, 'E$10$2');
    return (v < 0 ? '-' : ' ') + t + ' ';
  }

  function goLine(num) {
    const lines = run.lines.length ? run.lines : sorted();   // parsed once per run (no edits while it runs)
    const line = lines.find((l) => l.num === num);
    if (!line) err("UNDEF'D STATEMENT");
    run.lines = lines; run.line = line; run.si = 0;
  }
  function nextLine() { const k = run.lines.indexOf(run.line); run.line = run.lines[k + 1] ?? null; run.si = 0; }

  function exec(st) {               // one statement; may move run.line / run.si
    const p = parser(st);
    const kw = KEYS.find((k) => st.startsWith(k)) ?? (st.startsWith('?') ? 'PRINT' : null);
    if (kw) p.skip(st.startsWith('?') ? 1 : kw.length);
    switch (kw) {
      case 'REM': case 'DATA': return;
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
        const m = /^(\d*)\s*(-?)\s*(\d*)$/.exec(p.rest());
        if (!m) err('SYNTAX');
        const lo = m[1] ? Number(m[1]) : 0, hi = m[3] ? Number(m[3]) : m[2] || !m[1] ? Infinity : lo;
        if (cx) newline();
        for (const num of [...prog.keys()].sort((a, b) => a - b)) if (num >= lo && num <= hi) println(`${num} ${prog.get(num)}`);
        return;
      }
      case 'RUN': {
        vars.clear(); run.fors = []; run.subs = [];
        const lines = sorted();
        if (!lines.length) { run.line = null; return; }
        const n = p.end() ? lines[0].num : p.expr();
        goLine(n);
        return;
      }
      case 'NEW': prog.clear(); vars.clear(); run.line = null; return;
      case 'CLR': vars.clear(); return;
      case 'POKE': p.expr(); p.want(','); p.expr(); return;          // no memory behind it
      case 'SYS': if (p.expr() === 64738) { run = null; boot(); } return;   // the reset vector: boot again
      case 'LOAD': println('PRESS PLAY ON TAPE'); tape = true; run = null; return;   // waits for Esc (RUN/STOP)
      case 'HELP': for (const l of HELP) println(l); return;
      case 'ABOUT': for (const l of ABOUT) println(l); return;
      case 'LET': default: {        // assignment
        const id = p.ident();
        if (!id) err('SYNTAX');
        p.skip(id.length); p.want('=');
        const v = p.expr();
        if (!p.end()) err('SYNTAX');
        setVar(id, v);
      }
    }
  }
  function stopped() { const num = run.line?.num; run = null; println(num != null ? `BREAK IN ${num}` : 'BREAK'); println('READY.'); }
  function step(budget) {           // run up to `budget` statements; returns whether it is still running
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

  // ---------------------------------------------------------------- input
  let input = '';
  function boot() {
    grid.fill(32); cx = cy = 0; vars.clear(); tape = false; input = '';
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
      try { store(line); } catch { println('?SYNTAX  ERROR'); println('READY.'); }
      return;
    }
    run = { lines: [], line: { num: null, stmts: split(line) }, si: 0, fors: [], subs: [] };
    step(400);                        // direct commands answer at once; a long run continues in update()
    announce();
  }
  function typeChar(ch) {           // one typed character (already upper case)
    if (run || tape) return;
    const code = ch.charCodeAt(0);
    if (!G5[ch] && ch !== ' ') return;
    if (input.length >= 79) return;   // a logical line is two screen rows
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
  function feed(s) {                // text from the keyboard, or from the gates; '\n' is Return
    for (const ch of s.toUpperCase()) {
      if (ch === '\n' || ch === '\r') enter(); else typeChar(ch);
    }
  }

  // the hidden textarea: the phone's keyboard, and a label for screen readers
  const ta = document.createElement('textarea');
  Object.assign(ta, { autocomplete: 'off', spellcheck: false, rows: 1 });
  ta.setAttribute('autocapitalize', 'characters');
  ta.setAttribute('autocorrect', 'off');
  ta.setAttribute('aria-label', 'Commodore 64, BASIC. Type LIST or RUN and press Enter; HELP for a hint. Escape leaves.');   // [check]
  ta.className = 'c64-input';
  const sr = document.createElement('p');
  sr.className = 'c64-sr';
  sr.setAttribute('aria-live', 'polite');
  // a body > button: main.js moves it into the page's control cluster (top right) with the other toggles
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
    if (ev.key === 'Escape') { ev.preventDefault(); if (!brk()) blur(); }
    else if (ev.key === 'Enter') { ev.preventDefault(); if (!run && !tape) { enter(); } }
    else if (ev.key === 'Backspace') { ev.preventDefault(); backspace(); }
    else return;
    poke();
  });
  ta.addEventListener('beforeinput', (ev) => {
    if (!ev.cancelable) return;                    // e.g. a composition: the input event below takes it
    ev.preventDefault();
    if (ev.inputType === 'insertText' && ev.data) feed(ev.data);
    else if (ev.inputType === 'insertLineBreak' || ev.inputType === 'insertParagraph') { if (!run && !tape) enter(); }
    else if (ev.inputType === 'deleteContentBackward') backspace();
    poke();
  });
  ta.addEventListener('input', () => { if (ta.value) { feed(ta.value); ta.value = ''; poke(); } });
  ta.addEventListener('focus', () => { focused = true; syncChip(); poke(); });
  ta.addEventListener('blur', () => { focused = false; syncChip(); poke(); });
  chip.addEventListener('pointerdown', (ev) => ev.preventDefault());   // keep the textarea's focus while pressing
  chip.addEventListener('click', () => { if (!brk()) blur(); poke(); });
  function syncChip() { chip.hidden = !focused; chip.textContent = run || tape ? 'Stop the program' : 'Leave the C64'; }   // [check]
  function blur() { ta.blur(); }

  // ---------------------------------------------------------------- focus, picking, the loop
  let focused = false, booted = false, blinkT = 0, cursorOn = true, acc = 1;
  const poke = () => { dirty = true; live.render(); };
  // a tap's compatibility mousedown comes after the pointerup that focused the textarea and would blur it again
  let holdUntil = 0;
  document.addEventListener('mousedown', (ev) => { if (performance.now() < holdUntil) ev.preventDefault(); }, true);
  function focus() {
    if (!booted) { boot(); booted = true; }
    ta.focus({ preventScroll: true });
    holdUntil = performance.now() + 600;
    window.__room?.layers?.hotspots?.close?.();
    const v = window.__room?.views?.().find((x) => x.id === 'c64');
    if (v && live.view() !== 'c64') window.__room.goTo('c64').catch(() => {});
    poke();
  }
  for (const name of ['pr_c64mon', 'c64']) { const o = byName(name); if (o) live.picks.push({ object: o, accept: () => true, onPick: focus }); }

  function tick(dt) {               // advance the program and the cursor; true if the screen changed
    if (!booted) { boot(); booted = true; }
    if (run) {
      if (live.reduceMotion.matches) {   // the end state at once: the story, a screenful of maze, BREAK
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
    update(dt) {
      if (live.gate && !quad.visible) return false;
      if (!focused && !inView(live.camera, quad)) return false;   // off screen: paused, no uploads
      const changed = tick(dt);
      acc += dt;
      if (!changed && quad.visible) return false;
      if (acc < 1 / FPS && quad.visible) return true;            // ask for another frame; upload on the next
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
      text: () => Array.from({ length: ROWS }, (_, r) => String.fromCharCode(...grid.slice(r * COLS, r * COLS + COLS))
        .replace(/[\xcd]/g, '\\').replace(/[\xce]/g, '/').trimEnd()),
      hash() {                      // FNV-1a over the canvas pixels (the gates' "the screen changed")
        const px = g.getImageData(0, 0, W, H).data;
        let h = 0x811c9dc5;
        for (let i = 0; i < px.length; i += 4) { h ^= px[i + 1]; h = Math.imul(h, 0x01000193); }
        return (h >>> 0).toString(16);
      },
      // the screen's centre in CSS px (null off screen), for clicking it in a test
      screenPx() {
        const v = quad.getWorldPosition(new THREE.Vector3()).project(live.camera);
        const r = live.renderer.domElement.getBoundingClientRect();
        return v.z > 1 ? null : { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height };
      },
      info: () => ({ focused, running: !!run, visible: quad.visible, inView: inView(live.camera, quad), cursor: [cx, cy],
        lines: prog.size, canvas: [W, H] }),
    },
  };
}
