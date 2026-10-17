// Live layer 2: tracks in the cloud chamber. The chamber shows what passes through it.
//
// Droplet trails in the sensitive layer above the cold plate (notes/physics.md, "Cloud chamber"):
//   muons  ~62 %: long, thin, near-straight; cos^2(theta) per solid angle (PDG Cosmic Rays review), times
//                 cos(theta) for crossing a horizontal layer: cos(theta) = U^(1/4),
//                 length = the layer crossed (thickness / cos(theta), clipped by the tank)
//   alphas ~12 %: short, thick, dense; radon chain in cold air, R = 0.318 E^1.5 cm / 1.2 (Geiger rule):
//                 Rn-222 3.4 cm, Po-218 3.8 cm, Po-214 5.7 cm
//   betas  ~26 %: thin, wiggly, kinked, 1-4 cm, curling at the end
// Visible rate 3 per s: ~1 muon per cm^2 per minute gives ~7/s through the 21 x 21 cm plate, of which the
// lit, sensitive layer shows a share (physics.md; panel 011 asked 2-4/s; unmeasured). Each trail condenses in ~0.15 s,
// fades over 1-2 s, drifts down and spreads. Lit from the side like the LED strip: brighter near it.
// The look follows the ionisation (panel 015 action 12, variant D): an alpha loses ~100x more energy per mm
// than a minimum-ionising muon (Bethe: dE/dx ~ z^2 / beta^2), so its trail is fat, dense and bright, its
// droplets overlapping into a solid rod that thickens toward the Bragg peak at its end; a muon leaves a faint,
// thin, continuous hairline; a beta is thin like the muon and denser where it slows and curls. Between the
// tracks the supersaturated layer drizzles: single droplets condensing on stray ions and dust, falling out
// (DRIZZLE, unmeasured, kept under the gates' 40/255 track threshold). Rates, mix, ranges and fade unchanged.
// One Points draw call, a ring buffer of droplets; the GPU does the ageing.
//
// Hooks (lib/live.py): cloud_chamber extras tracks_plate_y, tracks_w, tracks_layer, tracks_led.
import { expWait, inView, noPick, rng, seedFrom, SCREEN, SHOULDER } from './layer-common.js';

const RATE = 3.0;                                   // visible tracks per second (physics.md: 2-4/s)
const MIX = [['muon', 0.62], ['alpha', 0.12], ['beta', 0.26]];
const ALPHA_RANGE = [0.034, 0.038, 0.057];          // m, physics.md (Geiger rule, cold air)
const DRIFT = 0.004;                                // m/s downward drift of a fading trail (unmeasured)
const POOL = 6000;                                  // droplets in the ring buffer
const LIFE = [1.0, 2.0];                            // s, fade time (physics.md)
// A 1 mm droplet is ~1.2 px across from the chamber view (0.9 m, 40 mm lens) and less from the hero: kept at its
// true size and energy, a track was a few faint specks (panel 013: 117 droplets alive, about one speck seen).
// So no droplet draws smaller than MIN_PX CSS pixels (times the pixel ratio: the same on a phone), and below its
// true size it gives up only part of its brightness: a track reads as a thin bright line, the way the eye sees
// a real one under the LED strip. The physics (rates, mix, ranges, fade) is unchanged.
const MIN_PX = 3.0;
const GAIN = 2.0;                                   // the tracks against the dark plate (unmeasured, by eye)
// per-kind droplet look: step along the track (m), droplet size (m), brightness (end values grow toward the
// stopping end); all by eye (unmeasured), ordered by dE/dx: alpha >> beta (slow end) > muon
const LOOK = {
  muon: { step: 0.0005, size: 0.0008, bright: 1.0, jitter: 0.0002 },
  alpha: { step: 0.0003, size: [0.0016, 0.0026], bright: [1.5, 2.5], jitter: 0.0011 },
  beta: { step: 0.0006, size: 0.0007, bright: [0.7, 1.1], jitter: 0.0002 },
};
// a trail holds until FADE_FROM of its life, then fades out (physics.md: tracks fade in ~1-2 s): the droplets
// stay grown while they fall; it was 0.25, which dimmed a 1 s track below the gates' threshold in half a second
const FADE_FROM = 0.5;
const DRIZZLE = { rate: 40, size: 0.0008, bright: 0.08, life: 0.6 };   // background droplets per s (unmeasured)

export default function mount(live) {
  const { THREE, byName, camera, renderer } = live;
  const node = byName('cloud_chamber');
  const d = node?.userData;
  if (!d?.tracks_plate_y) return null;
  // two streams: `rand` decides the tracks (when, which kind, where, which way, how long they live), `jr` the
  // droplets along them and the drizzle, so the look can be tuned without reshuffling the seeded timeline
  const rand = rng(seedFrom(live.params, 202)), jr = rng(seedFrom(live.params, 203));
  const half = d.tracks_w / 2 - 0.004;
  const y0 = d.tracks_plate_y + d.tracks_layer[0], y1 = d.tracks_plate_y + d.tracks_layer[1];

  const pos = new Float32Array(POOL * 3), birth = new Float32Array(POOL).fill(-99), shape = new Float32Array(POOL * 3);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aBirth', new THREE.BufferAttribute(birth, 1));
  g.setAttribute('aShape', new THREE.BufferAttribute(shape, 3));   // size (m), brightness, life (s)
  const mat = new THREE.ShaderMaterial({
    ...SCREEN,                                        // overlapping droplets saturate softly (layer-common.js)
    uniforms: { uTime: { value: 0 }, uPx: { value: 800 }, uMinPx: { value: MIN_PX }, uDrift: { value: DRIFT }, uLed: { value: new THREE.Vector3(...d.tracks_led) },
      uSpan: { value: d.tracks_w } },
    vertexShader: `#define FADE_FROM ${FADE_FROM.toFixed(2)}
      attribute float aBirth; attribute vec3 aShape;
      uniform float uTime, uPx, uMinPx, uDrift, uSpan; uniform vec3 uLed; varying float vA;
      void main() {
        float age = uTime - aBirth, life = aShape.z;
        vec3 p = position; p.y -= uDrift * max(age, 0.0);
        float grow = smoothstep(0.0, 0.15, age), fade = 1.0 - smoothstep(FADE_FROM * life, life, age);
        float led = 0.55 + 0.45 * exp(-(p.x - uLed.x) / (0.6 * uSpan));   // falls off away from the strip
        vA = (age < 0.0 || age > life) ? 0.0 : aShape.y * grow * fade * led;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float px = uPx * aShape.x * (1.0 + 0.8 * age / life) / -mv.z;   // trails spread as they fade
        float size = max(px, uMinPx);
        vA *= mix(0.45, 1.0, min(1.0, px / uMinPx)) * ${GAIN.toFixed(2)};  // enlarged: dimmer, but never a ghost
        gl_PointSize = vA > 0.0 ? size : 0.0;
      }`,
    fragmentShader: `varying float vA; ${SHOULDER}
      void main() {
        float q = length(gl_PointCoord - 0.5) * 2.0;
        gl_FragColor = vec4(shoulder(vec3(0.86, 0.92, 1.0) * vA * smoothstep(1.0, 0.2, q)), 1.0);
      }`,
  });
  const pts = noPick(new THREE.Points(g, mat));
  pts.name = 'chamber_tracks';
  pts.frustumCulled = false;
  pts.renderOrder = 0.5;              // under the glass
  node.add(pts);

  let head = 0, t = 0, next = expWait(rand, RATE), spawned = { muon: 0, alpha: 0, beta: 0 }, lastBirth = -99;
  const inside = (p) => Math.abs(p.x) < half && Math.abs(p.z) < half && p.y > y0 && p.y < y1;
  function drop(p, size, bright, life, jitter) {
    const i = head; head = (head + 1) % POOL;
    pos[3 * i] = p.x + (jr() - 0.5) * jitter; pos[3 * i + 1] = p.y + (jr() - 0.5) * jitter; pos[3 * i + 2] = p.z + (jr() - 0.5) * jitter;
    birth[i] = t + (jr() * 0.06);
    shape[3 * i] = size * (0.7 + 0.6 * jr()); shape[3 * i + 1] = bright; shape[3 * i + 2] = life;
  }
  // walk from p along dir, laying droplets every `step` while inside the layer; `turn` bends the path
  function trail(p, dir, len, step, look, turn) {
    const life = LIFE[0] + (LIFE[1] - LIFE[0]) * rand();
    for (let s = 0; s < len; s += step) {
      if (inside(p)) look(p, s / len, life);
      p.addScaledVector(dir, step);
      turn?.(dir, s / len);
    }
  }
  const randDir = (r0 = rand) => {
    const u = 2 * r0() - 1, a = 2 * Math.PI * r0(), r = Math.sqrt(1 - u * u);
    return new THREE.Vector3(r * Math.cos(a), u, r * Math.sin(a));
  };
  const kick = (dir, sigma) => dir.add(randDir(jr).multiplyScalar(sigma)).normalize();

  // forced: { kind, mid, dir } for the gates' look measurement (api.inject); otherwise a random track
  function spawn(forced) {
    let u = rand(), kind = forced?.kind ?? MIX[0][0];
    if (!forced) for (const [k, w] of MIX) { if ((u -= w) < 0) { kind = k; break; } }
    spawned[kind]++;
    const mid = forced?.mid?.clone() ?? new THREE.Vector3((2 * rand() - 1) * half, y0 + (y1 - y0) * rand(), (2 * rand() - 1) * half);
    if (kind === 'muon') {
      // zenith: cos^2(theta) per solid angle, times cos(theta) for a horizontal layer -> cos(theta) = U^(1/4)
      const c = Math.pow(rand(), 0.25), s = Math.sqrt(1 - c * c), a = 2 * Math.PI * rand();
      const dir = forced?.dir ?? new THREE.Vector3(s * Math.cos(a), -c, s * Math.sin(a));
      const L = 0.6;
      const m = LOOK.muon;
      trail(mid.clone().addScaledVector(dir, -L / 2), dir, L, m.step,
        (p, f, life) => drop(p, m.size, m.bright, life, m.jitter), (dv) => kick(dv, 0.0005));   // multiple scattering
    } else if (kind === 'alpha') {
      const R = ALPHA_RANGE[Math.floor(rand() * 3)];
      const dir = forced?.dir ?? randDir(); dir.y *= 0.35; dir.normalize();   // the ones we see lie in the thin layer
      const a = LOOK.alpha;
      trail(mid, dir, R, a.step, (p, f, life) => {
        const k = f * f;                                                    // the Bragg peak is at the end
        drop(p, a.size[0] + (a.size[1] - a.size[0]) * k, a.bright[0] + (a.bright[1] - a.bright[0]) * k, life, a.jitter);
      });
    } else {
      const L = 0.01 + 0.03 * rand(), dir = randDir();
      const b = LOOK.beta;
      trail(mid, dir, L, b.step, (p, f, life) => drop(p, b.size, b.bright[0] + (b.bright[1] - b.bright[0]) * f, life, b.jitter),
        (dv, f) => kick(dv, jr() < 0.08 ? 0.9 : 0.12 + 0.5 * f * f));   // kinks, curling at the end
    }
    lastBirth = t;
    for (const k of ['position', 'aBirth', 'aShape']) g.attributes[k].needsUpdate = true;
  }

  // the drizzle: one faint droplet at a random place in the layer (no lastBirth: it alone keeps no frames going)
  let nextDrizzle = expWait(jr, DRIZZLE.rate);
  function drizzle() {
    const p = new THREE.Vector3((2 * jr() - 1) * half, y0 + (y1 - y0) * jr(), (2 * jr() - 1) * half);
    drop(p, DRIZZLE.size, DRIZZLE.bright, DRIZZLE.life, 0);
    for (const k of ['position', 'aBirth', 'aShape']) g.attributes[k].needsUpdate = true;
  }

  // reduced motion: three trails, frozen at a readable age, no new ones
  const still = () => live.reduceMotion.matches;
  function freeze() {
    t = 0; spawn(); spawn(); spawn();
    t = 0.5; mat.uniforms.uTime.value = t;
  }
  let frozen = false;

  function step(dt) {
    if (still()) { if (!frozen) { freeze(); frozen = true; return true; } return false; }
    frozen = false;
    t += dt;
    if (t >= next) { spawn(); next = t + expWait(rand, RATE); }
    while (t >= nextDrizzle) { drizzle(); nextDrizzle += expWait(jr, DRIZZLE.rate); }
    mat.uniforms.uTime.value = t;
    return t - lastBirth < LIFE[1] + 0.2;          // something on the plate is still fading
  }

  return {
    name: 'chamber',
    update(dt) {
      const seen = inView(camera, node);
      pts.visible = seen && (t - lastBirth < LIFE[1] + 0.2 || still());   // nothing to draw: no draw call
      if (!seen) return false;
      mat.uniforms.uPx.value = renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
      mat.uniforms.uMinPx.value = MIN_PX * renderer.getPixelRatio();
      return step(live.gate ? 0 : dt);   // ?gate: the clock moves only through api.advance
    },
    api: {
      // the gates' look measurement: clear the plate, then lay one track of `kind` across its middle, flat
      inject(kind, az = 0.6) {
        birth.fill(-99); g.attributes.aBirth.needsUpdate = true;
        const mid = new THREE.Vector3(kind === 'alpha' ? -0.015 : 0, (y0 + y1) / 2, 0);
        const dir = new THREE.Vector3(Math.cos(az), kind === 'muon' ? -0.12 : 0, Math.sin(az)).normalize();
        spawn({ kind, mid, dir }); next = Infinity; nextDrizzle = Infinity; live.render(); return this.info();
      },
      advance(sec, h = 1 / 30) { let n = Math.round(sec / h); while (n-- > 0) step(h); live.render(); return this.info(); },
      // the sensitive layer on screen, CSS px [x0, y0, x1, y1] (gates.py crops the track count to it)
      box() {
        const r = renderer.domElement.getBoundingClientRect(), b = [Infinity, Infinity, -Infinity, -Infinity], v = new THREE.Vector3();
        node.updateWorldMatrix(true, false);
        for (let k = 0; k < 8; k++) {
          node.localToWorld(v.set(k & 1 ? half : -half, k & 2 ? y1 : y0, k & 4 ? half : -half)).project(camera);
          const x = r.left + (v.x + 1) / 2 * r.width, y = r.top + (1 - v.y) / 2 * r.height;
          b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y);
        }
        return b.map(Math.round);
      },
      info: () => ({ t, rate: RATE, spawned: { ...spawned }, alive: Array.from(birth).filter((b) => t - b >= 0 && t - b < LIFE[1]).length, visible: pts.visible }),
    },
  };
}
