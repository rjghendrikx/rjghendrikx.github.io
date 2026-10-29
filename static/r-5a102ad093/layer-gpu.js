// The RTX 3090's own act (round 023 C, panel 022 bet C): when the inference case opens, the card's fans spin up and a
// readout on the case card replays the measured speculative-decoding gain, 30.0 -> 43.2 tokens a second.
// The numbers are the bench's, not a live model: ~/brain/vault/projects/local-inference-3090/README.md, the MTP table
// (2026-09-16, "tg, 55K ctx": no MTP 30.0, draft-mtp --spec-draft-n-max 2 43.2, +44%). The readout says it is a replay.
// The fan rate is a picture, not a measurement: no rpm is shown or claimed.
//
// Fans: the blades and hubs are rotated in place on the baked mesh, so they keep their texels and cost no draw call (0,
// not splitPart's +1 per fan). A fan is its connected parts (each blade, hub and cap is its own piece of the join) that lie
// wholly within FAN_R of the hub and near its plane (objects/pr_3090.py's hook rule, with a band for the blade pitch).
// The front's second fan is not exported as a hook (a bake would add it); it is found from the mesh: the first fan's hub
// and cap, moved (see below).
// Trigger: main.js dispatches room:case { detail: id } whenever a case card is shown (a click on the 3090, Enter on its
// hidden button, the Bench card's act, #inference, Back/forward), and api.play(el) draws the readout into the card.
// The blades are black in a black well, so their turning alone does not read. A spinning fan is seen as its blur: a
// translucent disc a little lighter than the well, with the room's light caught as a streak that stands still while the
// blades turn under it. One mesh (a quad per front fan, +1 draw call while the fans turn, none still) draws that blur;
// its strength follows the spin, so at rest the bake alone shows (the alignment gates see no change).
// Reduced motion: no spin, the final readout at once. ?gate: nothing moves but api.advance.
import { noPick } from './layer-common.js';

const NODE = 'pr_3090';
const CASE = 'inference';
const OMEGA = 2 * Math.PI * 3.2;     // rad/s at full spin: a rate the eye reads as turning at 60 fps (a picture, no rpm)
const TAU_UP = 0.7, TAU_DOWN = 2.2;  // s, spin-up and run-down (one-pole)
const T_BASE = 1.4, T_RAMP = 1.8;    // s: the baseline shown, then the count to the MTP figure
// the bench (README, MTP table, 55K-context column) [check] notes/captions.md
export const BENCH = { off: 30.0, on: 43.2, gain: 44, ctx: '55K' };

export default function mount(live) {
  const { THREE, byName, gate, reduceMotion } = live;
  const node = byName(NODE);
  const ud = node?.userData;
  const c1 = ud?.['3090_fan_front_center'], axisA = ud?.['3090_fan_axis'], R = ud?.['3090_fan_r'], SLAB = ud?.['3090_fan_slab'];
  if (!node || !c1 || !axisA || !R || !SLAB) return null;
  let mesh = null;
  node.traverse((o) => { if (!mesh && o.isMesh) mesh = o; });
  if (!mesh) return null;

  // node space <-> mesh space (the mesh may be the node or a child of it)
  node.updateMatrixWorld(true);
  const toNode = new THREE.Matrix4().copy(node.matrixWorld).invert().multiply(mesh.matrixWorld);
  const toMesh = toNode.clone().invert();
  const g = mesh.geometry, pos = g.attributes.position;
  const idx = g.index ? g.index.array : Array.from({ length: pos.count }, (_, i) => i);
  const axis = new THREE.Vector3(...axisA).normalize();
  const P = Array.from({ length: pos.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(toNode));
  const plane = (c) => { const o = new THREE.Vector3(...c); return (p) => Math.abs(p.clone().sub(o).dot(axis)); };
  const radial = (c) => { const o = new THREE.Vector3(...c); return (p) => { const d = p.clone().sub(o); return d.sub(axis.clone().multiplyScalar(d.dot(axis))).length(); }; };

  // the parts: connected pieces of the joined mesh (blades, hubs, the shroud never share a vertex across a join)
  const parent = Int32Array.from({ length: pos.count }, (_, i) => i);
  const find = (i) => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
  for (let i = 0; i < idx.length; i += 3) for (const j of [1, 2]) parent[find(idx[i + j])] = find(idx[i]);
  const parts = new Map();
  for (let i = 0; i < pos.count; i++) { const r = find(i); if (!parts.has(r)) parts.set(r, []); parts.get(r).push(i); }
  const BAND = 3 * SLAB;   // a pitched blade stands a few mm either side of its mid-plane
  // the small parts in a fan's plane, wholly inside its tip radius: blades and hub (the ring and the well lie outside)
  const fanParts = (c, list) => list.filter((vs) => vs.every((v) => radial(c)(P[v]) < R));
  const inBand = (c) => [...parts.values()].filter((vs) => vs.every((v) => plane(c)(P[v]) < BAND));
  const fans = [];   // [centre, sign, vertex lists]
  const front = inBand(c1);
  fans.push([new THREE.Vector3(...c1), 1, fanParts(c1, front)]);
  const ud2 = ud['3090_fan_back_center'];
  if (ud2) fans.push([new THREE.Vector3(...ud2), -1, fanParts(ud2, inBand(ud2))]);   // push-pull: the back fan the other way
  {
    // the front's second fan (no hook; objects/pr_3090.py builds it with the same _fan, mirrored): its hub and hub cap
    // are the first fan's, moved. Each part of the first fan votes for the move to a part of the same size and box in
    // the front plane; two or more agreeing votes place it. Mirrored blades: it turns the other way (sign -1).
    const small = front.filter((vs) => vs.every((v) => radial(c1)(P[v]) > R + 0.006));
    const boxOf = (vs) => { const b = new THREE.Box3(); for (const v of vs) b.expandByPoint(P[v]); return b; };
    const votes = [];
    for (const A of fans[0][2]) {
      const ba = boxOf(A), sa = ba.getSize(new THREE.Vector3()), ca = ba.getCenter(new THREE.Vector3());
      for (const B of small) {
        if (B.length !== A.length) continue;
        const bb = boxOf(B);
        if (bb.getSize(new THREE.Vector3()).distanceTo(sa) > 0.0005) continue;
        const t = bb.getCenter(new THREE.Vector3()).sub(ca);
        const hit = votes.find((x) => x.t.distanceTo(t) < 0.001);
        if (hit) hit.n++; else votes.push({ t, n: 1 });
      }
    }
    const best = votes.sort((x, y) => y.n - x.n)[0];
    if (best?.n >= 2) {
      const c2 = new THREE.Vector3(...c1).add(best.t);
      const sizes = new Set(fans[0][2].map((vs) => vs.length));   // only parts the first fan also has (blade, hub, cap)
      fans.push([c2, -1, fanParts(c2.toArray(), small).filter((vs) => sizes.has(vs.length))]);
    }
  }
  const owner = new Int16Array(pos.count).fill(-1);
  fans.forEach(([, , list], f) => { for (const vs of list) for (const v of vs) owner[v] = f; });
  const moving = fans.map(([, , list]) => list.reduce((n, vs) => n + vs.length, 0));
  if (!moving.some(Boolean)) return null;

  // the blur: a quad on each front fan (the fans in the first fan's plane), just proud of the blades, facing out
  const centre = new THREE.Box3().setFromObject(node).getCenter(new THREE.Vector3()).applyMatrix4(new THREE.Matrix4().copy(node.matrixWorld).invert());
  const out = axis.clone().multiplyScalar(Math.sign(new THREE.Vector3(...c1).sub(centre).dot(axis)) || 1);
  const faces = fans.map(([c, sgn], f) => [c, sgn, f]).filter(([c]) => Math.abs(c.clone().sub(new THREE.Vector3(...c1)).dot(axis)) < SLAB);
  const quads = faces.map(([c, , f]) => {
    const q = new THREE.PlaneGeometry(2 * R, 2 * R);
    q.lookAt(out);
    q.translate(...c.clone().addScaledVector(out, SLAB).toArray());   // just in front of the blades' mid-plane
    q.setAttribute('fan', new THREE.BufferAttribute(new Float32Array(4).fill(f), 1));
    return q;
  });
  const blurU = { uSpin: { value: 0 }, uAngle: { value: fans.map(() => 0) }, uSign: { value: fans.map(([, s]) => s) }, uHub: { value: 0.35 } };
  const blur = noPick(new THREE.Mesh(mergeQuads(THREE, quads), new THREE.ShaderMaterial({
    uniforms: blurU, transparent: true, depthWrite: false,
    vertexShader: `attribute float fan; varying vec2 vP; varying float vF;
      void main() { vP = uv * 2.0 - 1.0; vF = fan; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float uSpin; uniform float uAngle[${fans.length}]; uniform float uSign[${fans.length}]; uniform float uHub;
      varying vec2 vP; varying float vF;
      void main() {
        float r = length(vP);
        if (r > 1.0 || r < uHub) discard;
        int f = int(vF + 0.5); float a = 0.0, s = 1.0;
        for (int i = 0; i < ${fans.length}; i++) if (i == f) { a = uAngle[i]; s = uSign[i]; }
        float th = atan(vP.y, vP.x);
        // seven swept blades, blurred toward their mean as the spin rises
        float blades = 0.5 + 0.5 * cos(7.0 * (th - s * a) - s * 4.0 * r);
        float b = mix(blades, 0.5, 0.65 * smoothstep(0.2, 0.9, uSpin));   // a ghost of the blades stays (a 60 Hz eye)
        // the room's light caught by the turning blades: a streak that stays put (upper left, toward the lamp)
        float streak = pow(max(0.0, cos(th - 2.3)), 4.0) * smoothstep(uHub, 0.7, r);
        float edge = smoothstep(1.0, 0.92, r) * smoothstep(uHub, uHub + 0.08, r);
        float alpha = uSpin * edge * (0.13 * b + 0.38 * streak);
        gl_FragColor = vec4(vec3(0.62, 0.58, 0.54), alpha);
      }`,
  })));
  blur.name = 'pr_3090_fanblur';
  blur.renderOrder = 2;
  blur.visible = false;
  mesh.add(blur);
  blur.applyMatrix4(toMesh);   // built in node space, hung on the mesh

  let angle = 0, omega = 0, target = 0, t = 0, playing = false, el = null, shownAt = -1;
  const q = new THREE.Quaternion(), v = new THREE.Vector3();
  function pose() {
    for (let i = 0; i < pos.count; i++) {
      const f = owner[i];
      if (f < 0) continue;
      const [c, s] = fans[f];
      q.setFromAxisAngle(axis, s * angle);
      v.copy(P[i]).sub(c).applyQuaternion(q).add(c).applyMatrix4(toMesh);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    pos.needsUpdate = true;
  }
  // the readout: the baseline first, then the count to the MTP figure; the words say it is the bench's, replayed
  const fmt = (x) => x.toFixed(1);
  function draw(final = false) {
    if (!el) return;
    const k = final ? 1 : Math.min(1, Math.max(0, (t - T_BASE) / T_RAMP));
    const e = 1 - (1 - k) ** 3;
    const on = final || t >= T_BASE;
    const val = BENCH.off + (BENCH.on - BENCH.off) * e;
    el.querySelector('.n').textContent = fmt(val);
    el.querySelector('.s').textContent = on ? (k >= 1 ? `speculative decoding on: +${BENCH.gain}%` : 'speculative decoding on') : 'speculative decoding off';   // [check]
    el.dataset.state = k >= 1 ? 'done' : 'running';
    el.dataset.value = fmt(val);
  }
  function play(into) {
    if (into) {
      el = into;
      el.classList.add('fig', 'readout');
      el.replaceChildren();
      const row = document.createElement('p');
      row.className = 'big';
      row.innerHTML = '<span class="n"></span> <span class="u">tokens/s</span>';
      const s = Object.assign(document.createElement('p'), { className: 's' });
      const note = Object.assign(document.createElement('p'), { className: 'note',
        textContent: `A replay of the measured bench, not a live model: decode at ${BENCH.ctx} context.` });   // [check]
      // the counting digits are for the eye; the card is a live region, so a screen reader gets the result once
      row.setAttribute('aria-hidden', 'true'); s.setAttribute('aria-hidden', 'true');
      const said = Object.assign(document.createElement('span'), { className: 'vh',
        textContent: `Decode speed: ${fmt(BENCH.off)} tokens a second without speculative decoding, ${fmt(BENCH.on)} with it, +${BENCH.gain}%.` });   // [check]
      el.append(row, s, note, said);
    }
    playing = true;
    t = 0;
    shownAt = performance.now();
    target = reduceMotion.matches ? 0 : OMEGA;
    draw(reduceMotion.matches);
    live.render();
  }
  function stop() { playing = false; target = 0; el = null; }
  addEventListener('room:case', (ev) => { if (ev.detail !== CASE) stop(); });

  function step(dt) {
    if (!playing && omega < 1e-3) return false;
    if (playing) { t += dt; draw(reduceMotion.matches); }
    const tau = target > omega ? TAU_UP : TAU_DOWN;
    omega += (target - omega) * (1 - Math.exp(-dt / tau));
    if (target === 0 && omega < 0.05) omega = 0;
    angle = (angle + omega * dt) % (2 * Math.PI);
    pose();
    blurU.uSpin.value = Math.min(1, omega / OMEGA);
    blurU.uAngle.value = fans.map(() => angle);
    blur.visible = omega > 0.05;
    if (playing && t > T_BASE + T_RAMP + 0.1 && reduceMotion.matches) playing = false;
    return omega > 0 || (playing && t < T_BASE + T_RAMP + 0.1);
  }

  return {
    name: 'gpu',
    update(dt) { return step(gate ? 0 : dt); },
    api: {
      play, stop,
      advance(sec, h = 1 / 60) { let n = Math.round(sec / h); while (n-- > 0) step(h); live.render(); return this.info(); },
      info: () => ({ playing, omega: +omega.toFixed(3), target, t: +t.toFixed(2), fans: fans.length, moving,
        centres: fans.map(([c]) => c.toArray().map((x) => +x.toFixed(4))), readout: el?.dataset.value ?? null,
        state: el?.dataset.state ?? null, since: shownAt }),
    },
  };
}

// the quads as one geometry (one draw call): position, uv and the fan index
function mergeQuads(THREE, qs) {
  const g = new THREE.BufferGeometry();
  for (const k of ['position', 'uv', 'fan']) {
    const n = qs[0].attributes[k].itemSize;
    g.setAttribute(k, new THREE.BufferAttribute(Float32Array.from(qs.flatMap((q) => Array.from(q.attributes[k].array))), n));
  }
  g.setIndex(qs.flatMap((q, i) => Array.from(q.index.array, (v) => v + 4 * i)));
  return g;
}
