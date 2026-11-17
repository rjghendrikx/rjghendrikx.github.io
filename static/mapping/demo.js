// Strobe Machine, demo mode (index.html?demo, or <html data-demo> as web/pack_demo.py writes it):
// touch-first taste votes on deck CANDIDATE. One clip at a time in a seeded shuffled order, names
// hidden, three thumb targets with the meaning of the , . / keys. Votes live in localStorage under
// their own key (never mixed with the desktop page's mv-votes) and leave the device as compact JSON
// by share sheet or clipboard: a list `loop.py ingest` reads as engine/loop/votes/mv-votes-<date>.json.
const KEY = 'mv-demo';
const SESSION = 12;                                   // clips per sitting, then a pause card
const LOCK_MS = 1200;                                 // a clip is seen this long before a vote counts

function mulberry32(a) {                              // small seeded rng, for a reproducible order
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function shuffled(names, seed) {                      // Fisher-Yates
  const out = [...names], rnd = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

export function startDemo({ names, hashes, voteEntry, load, play, stop }) {
  const $ = (id) => document.getElementById(id);
  const root = $('demo'), voteBtns = [...document.querySelectorAll('#dvote button')];

  // state: { seed, votes: [entry], sent: how many votes a handover already carried }
  let st = null;
  try { st = JSON.parse(localStorage.getItem(KEY)); } catch { /* private window: this sitting only */ }
  if (!st || !Number.isInteger(st.seed) || !Array.isArray(st.votes)) st = { seed: (Math.random() * 2 ** 32) >>> 0, votes: [], sent: 0 };
  // a stored vote counts only while it is on the bytes this page serves (a later bake under the same URL)
  const mine = (v) => names.includes(v.program) && v.hash === hashes[v.program];
  st.sent = st.votes.slice(0, st.sent).filter(mine).length;
  st.votes = st.votes.filter(mine);
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch { /* ignore */ } };
  const order = shuffled(names, st.seed);
  const total = names.length;
  const left = () => { const done = new Set(st.votes.map((v) => v.program)); return order.filter((n) => !done.has(n)); };
  window.__demo = { order, state: st };                // for the checks, as window.__votes on the desktop page

  let current = null, sitting = 0, lockTimer = null;
  let turn = 0;                                        // every card and every clip is a new turn: a load that ends in an older one is dropped
  let fetching = false;
  async function fetchAhead() {                        // after the start tap the whole queue comes in, in order: no wait per clip, and a dropped connection goes unnoticed
    if (fetching) return;
    fetching = true;
    try { for (const n of left()) await load(n); } catch { /* show() reports it when it reaches that clip */ }
    fetching = false;
  }
  function say(text, warn) { $('dmsg').textContent = text; $('dmsg').className = warn ? 'warn' : ''; }

  function card(title, text, go) {                     // go: label of the big button, or null at the end
    turn++; stop(); current = null; sitting = 0; clearTimeout(lockTimer);   // every card starts a new sitting
    $('dtitle').textContent = title; $('dtext').textContent = text;
    $('dgo').hidden = !go; $('dgo').disabled = false; if (go) $('dgo').textContent = go;
    $('dwarn').hidden = !go;
    $('dsend').hidden = !st.votes.length; $('dsend').textContent = `send my ${st.votes.length} vote${st.votes.length === 1 ? '' : 's'}`;
    say(''); $('dout').hidden = true;
    root.className = 'card';
  }
  function home() {
    const n = st.votes.length;
    if (!n) card(`${total} light patterns for the wall`, 'One clip at a time: skip, like or wow. A few minutes; stop whenever, it remembers where you were.', 'start');
    else if (n < total) card(`${n} of ${total} done`, `${total - n} to go. Carry on, or send what you have so far.`, 'continue');
    else card(`All ${total} done`, 'Thank you. One tap hands your votes over.', null);
  }

  async function show() {
    const queue = left();
    if (!queue.length) { home(); return; }
    const name = queue[0], t = ++turn;
    current = null; clearTimeout(lockTimer); $('dvote').classList.add('lock');
    $('dprog').textContent = `${st.votes.length + 1}/${total}`;
    $('dundo').disabled = st.votes.length <= st.sent;  // a vote that was handed over stays as sent
    root.className = 'play';
    try { await load(name); } catch {
      const n = st.votes.length;
      if (t === turn) card('The next clip did not load', `Check the connection and try again.${n ? ` Your ${n} vote${n === 1 ? ' is' : 's are'} kept on this device.` : ''}`, 'try again');
      return;
    }
    if (t !== turn) return;                            // paused, or another clip asked for, while this one loaded
    await play(name);                                  // loaded: on the wall within this tick
    fetchAhead();
    lockTimer = setTimeout(() => { current = name; $('dvote').classList.remove('lock'); }, LOCK_MS);
  }

  function vote(kind, btn) {
    if (!current) return;
    const entry = voteEntry(kind);
    if (!entry || entry.program !== current) return;   // the vote is on the clip on screen, or it is no vote
    st.votes.push({ ...entry, src: 'demo' }); save();
    current = null; sitting++;
    btn.classList.add('hit'); setTimeout(() => btn.classList.remove('hit'), 220);
    const n = st.votes.length;
    if (n < total && sitting % SESSION === 0) card(`${n} of ${total} done`, `Good moment for a pause. ${total - n} to go: carry on now or later, or send what you have.`, 'continue');
    else show();
  }
  for (const b of voteBtns) b.onclick = () => vote(b.dataset.vote, b);
  $('dgo').onclick = show;
  $('dpause').onclick = home;
  $('dundo').onclick = () => {
    if (st.votes.length <= st.sent) return;
    st.votes.pop(); save(); sitting = Math.max(0, sitting - 1);
    show();
  };

  // handover: share sheet when the browser has one, else the clipboard, else the text itself to copy
  const payload = () => JSON.stringify(st.votes);
  function sent(how) { st.sent = st.votes.length; save(); say(`${how}: ${st.votes.length} vote${st.votes.length === 1 ? '' : 's'}. Thank you.`); }
  function showText(text) {
    const out = $('dout'); out.hidden = false; out.value = text; out.focus(); out.select();
    say('Could not share or copy: select all of the text below, copy it and paste it in a message.', true);
  }
  function copy(text) {
    if (!navigator.clipboard?.writeText) { showText(text); return; }
    navigator.clipboard.writeText(text).then(() => sent('Copied, paste it in a message'), () => showText(text));
  }
  $('dsend').onclick = () => {                          // share() must be called inside the tap
    const text = payload();
    if (!navigator.share) { copy(text); return; }
    navigator.share({ title: `mv-votes-${new Date().toISOString().slice(0, 10)}.json`, text })
      .then(() => sent('Shared'), (e) => { if (e?.name === 'AbortError') say('Not sent. Tap again when you want to.', true); else copy(text); });
  };

  // no pinch zoom, no rubber band (Safari ignores user-scalable=no); the fallback text stays selectable
  addEventListener('gesturestart', (e) => e.preventDefault());
  addEventListener('touchmove', (e) => { if (e.target.id !== 'dout') e.preventDefault(); }, { passive: false });
  addEventListener('dblclick', (e) => e.preventDefault());

  home();
}
