// Rain at the canal house (layout canal_house): drops and rivulets on the window glass, rain falling
// outside, and one boat passing slowly (the lights on the water: layer-water.js).
// Hooks (objects/cz_canal_night.py, node cz_canal_night, glTF axes): rain_panes (stride 5: centre,
// w, h), rain_room_lights, rain_lamps (stride 3: lantern centres). Node cz_boat (objects/cz_boat.py):
// boat_path (world x from, to), boat_speed (m/s).
// Light rain: ~1 mm/h, drops of 0.5-1 mm falling at ~4 m/s (terminal velocity), drawn as short
// motion-blurred streaks; canal boats keep to 6-7.5 km/h.
// Rain is drawn only in the lanterns' light (rain_lamps, stride 3), with a halo on each head.
// The glass: lens drops that carry the room lamps' glints, and the pane's faint mirror of those lamps
// (rain_room_lights, stride 7: position, colour, radius; panel 013, from variant A).
// Three draw calls (glass, rain, halos) plus the moved boat. ?gate: nothing shows or moves until
// api.advance(). Reduced motion: a still wet pane, no falling rain, boat at rest.
import { rng, seedFrom, inView, noPick, SCREEN, SHOULDER } from './layer-common.js';

const STREAKS = 2200;             // rain segments, shared out over the lanterns in view
const FALL = 3.2;                 // m/s: drizzle to light rain, 0.6-0.8 mm drops (Gunn-Kinzer)
const STREAK_LEN = 0.16;          // m: 0.6 mm at 3.2 m/s smears 6-11 cm at 1/50-1/30 s; the eye smears a bit more
const CONE_R = 2.8;               // m, radius of the lit cylinder around a lantern
const CONE_UP = 1.2;              // m of rain above the lantern (lit faintly, from below)
const CONE_DOWN = 3.5;            // m below it: down to the street (light point 3.4 m)
const GLOW_R = 1.2;               // m, the halo around a lantern head in the drizzle
const WIND = 0.18;                // horizontal drift per metre of fall
const PAUSE = 35;                 // s on the quay between two passes of the boat

export default function mount(live) {
  const { THREE, byName, camera } = live;
  const node = byName('cz_canal_night');
  const d = node?.userData;
  if (!d?.rain_panes) return null;
  const rand = rng(seedFrom(live.params, 404));
  const still = () => live.reduceMotion.matches;
  const group = new THREE.Group();
  group.name = 'rain';
  node.add(group);

  // 1. the glass: both panes in one mesh; aP = position on the pane in metres (droplet size is physical)
  const P = [], U = [], I = [];
  for (let k = 0; k < d.rain_panes.length; k += 5) {
    const [cx, cy, cz, w, h] = d.rain_panes.slice(k, k + 5);
    const b = P.length / 3;
    for (const [sx, sy] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
      P.push(cx + (sx - 0.5) * w, cy + (sy - 0.5) * h, cz);
      U.push(sx * w + k * 3.1, sy * h);                      // offset per pane: different drops
    }
    I.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const gg = new THREE.BufferGeometry();
  gg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  gg.setAttribute('aP', new THREE.Float32BufferAttribute(U, 2));
  gg.setIndex(I);
  // the room's lamps (layout ROOM_LIGHTS via rain_room_lights, stride 7: position, colour, radius): the pane
  // mirrors them faintly, and every drop carries their glint
  const RL = d.rain_room_lights ?? [];
  const NL = 3, lampPos = [], lampCol = [];
  for (let k = 0; k < NL; k++) {
    const o = k * 7, on = o + 7 <= RL.length;
    lampPos.push(on ? new THREE.Vector4(RL[o], RL[o + 1], RL[o + 2], RL[o + 6]) : new THREE.Vector4(0, -100, 0, 0.001));
    lampCol.push(on ? new THREE.Vector3(RL[o + 3], RL[o + 4], RL[o + 5]) : new THREE.Vector3(0, 0, 0));
  }
  const paneZ = d.rain_panes[2];
  const glassMat = new THREE.ShaderMaterial({
    // a screen blend (1 - (1 - dst)(1 - src)): water on glass only ever adds light (the refracted city, the
    // glints, the rims), so a drop over a lit arch can no longer darken it (panel 015 action 10)
    ...SCREEN, side: THREE.DoubleSide,   // wet from outside too (the intro's approach)
    extensions: { derivatives: true },
    uniforms: { uTime: { value: 0 }, uLampPos: { value: lampPos }, uLampCol: { value: lampCol }, uPaneZ: { value: paneZ } },
    vertexShader: `attribute vec2 aP; varying vec2 vP; varying vec3 vW;
      void main() { vP = aP; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w; }`,
    // Drops on a vertical pane at night, as lenses: each is a small plano-convex lens that shows the outside
    // upside down and minified (the lit cloud at its bottom, the warm quay lights at its top) as a faint core,
    // with a bright rim where the curved edge gathers the city glow, and carrying a glint of each room lamp at the
    // point where its surface normal halves lamp and eye. The pane itself mirrors the lamps at ~8 % (Fresnel,
    // rising at grazing angles), fading out when the eye is within ~2 m of the glass (the canal view).
    // Written for this room; the Heartfelt shader (CC BY-NC-SA) was not used.
    fragmentShader: `uniform float uTime, uPaneZ; uniform vec4 uLampPos[${NL}]; uniform vec3 uLampCol[${NL}];
      varying vec2 vP; varying vec3 vW;
      // display values matched to the baked view (cz_canal_night night_sky_*: ~60/255 over the roofs)
      const vec3 SKY = vec3(0.17, 0.155, 0.14), LOW = vec3(0.03, 0.028, 0.027), WARM = vec3(1.0, 0.68, 0.36);
      float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      ${SHOULDER}
      // one layer of drops in cells of size s: (q in the drop's unit disc, coverage, hash)
      vec4 drop(vec2 p, float s, float dens, float r0, float r1, float px) {
        vec2 c = floor(p / s), f = p / s - c;
        if (h21(c) > dens) return vec4(0.0);
        vec2 o = vec2(h21(c + 7.1), h21(c + 3.3)) * 0.5 + 0.25;
        float rad = mix(r0, r1, h21(c + 1.9));
        vec2 q = (f - o) / rad;
        q.y *= q.y > 0.0 ? 1.12 : 0.9;                       // gravity: flatter on top, full at the bottom
        float r = length(q), e = px / (s * rad) * 1.2;      // edge width: about a pixel
        return vec4(q, 1.0 - smoothstep(1.0 - e, 1.0 + e, r), h21(c + 9.7));
      }
      // glints of the room lamps on a drop's dome at q, and their sum for the pane mirror
      vec3 glint(vec2 q, vec3 V) {
        vec3 g = vec3(0.0);
        float zq = sqrt(max(0.0, 1.0 - dot(q, q)));
        for (int i = 0; i < ${NL}; i++) {
          vec3 L = uLampPos[i].xyz - vW;
          vec3 H = normalize(normalize(L) - V);
          vec3 n = vec3(q, zq * sign(-V.z));                  // the dome faces the eye
          float sp = pow(max(dot(n, H), 0.0), 90.0);
          g += uLampCol[i] * sp * 1.6 / (1.0 + 0.25 * dot(L, L));
        }
        return g;
      }
      // rpx: the drop's radius in pixels; the upside-down quay lamps only resolve in a drop of ~4 px or more,
      // smaller they read as a field of warm specks over the pane (panel 013)
      vec3 lens(vec4 dp, vec3 V, float rpx) {
        float see = smoothstep(3.0, 7.0, rpx);
        vec2 q = dp.xy;
        float r = length(q);
        vec3 c = mix(LOW, SKY, smoothstep(0.7, -0.6, q.y)) * 0.45;                // inverted: sky at the bottom, faint
        vec2 sp = vec2(dp.w - 0.5, 0.35 + 0.3 * fract(dp.w * 7.3)) * 0.9;        // a quay lamp, upside down
        c += WARM * smoothstep(0.2, 0.0, length(q - sp)) * 0.9 * see;
        c += WARM * smoothstep(0.16, 0.0, length(q - vec2(0.45 - dp.w, 0.5))) * 0.5 * see * step(0.5, fract(dp.w * 3.1));
        c += SKY * 1.3 * smoothstep(0.55, 0.9, r) * (1.0 - smoothstep(0.9, 1.0, r)) * (0.6 + 0.4 * smoothstep(0.3, -0.5, q.y));   // the bright rim, brightest below
        return c;
      }
      void main() {
        vec3 V = normalize(vW - cameraPosition);
        float px = max(fwidth(vP.x), fwidth(vP.y));                               // metres per pixel on the pane
        vec4 a = drop(vP, 0.014, 0.14, 0.10, 0.24, px), b = drop(vP + 0.37, 0.03, 0.10, 0.12, 0.26, px);
        vec4 g = drop(vP + 1.13, 0.065, 0.06, 0.10, 0.17, px);
        // rivulets: 2-3 per pane, a drop running down now and then, a thin wet trail behind it
        float col = floor(vP.x / 0.5), hc = h21(vec2(col, 2.0));
        float xr = (col + 0.15 + 0.7 * hc) * 0.5 + 0.006 * sin(vP.y * 23.0 + hc * 6.0) + 0.003 * sin(vP.y * 61.0);
        float dx = vP.x - xr;
        float speed = mix(0.05, 0.14, h21(vec2(col, 5.0)));
        float headY = 3.2 - mod(uTime * speed + hc * 9.0, 4.0), above = vP.y - headY, on = step(0.4, hc);
        float tw = max(0.0016, px * 1.6);                                        // never under ~1.5 px: no 1-px crawl
        float trail = on * step(0.0, above) * exp(-above / 0.9) * (1.0 - smoothstep(tw * 0.35, tw, abs(dx)))
                    * min(1.0, 0.0024 / tw * 1.5);                                // wider than the water: fainter, same light
        vec2 hq = vec2(dx, above * (above > 0.0 ? 0.55 : 0.9)) / 0.0042;
        vec4 hd = vec4(hq, on * (1.0 - smoothstep(0.85, 1.0 + px / 0.0042, length(hq))), hc);
        // the trail has swept the drops away
        float clear = 1.0 - on * step(0.0, above) * exp(-above / 0.5) * (1.0 - smoothstep(0.004, 0.009, abs(dx)));
        // drops smaller than ~2 px fade into a faint wet sheen: no shimmering sub-pixel noise from the back of the room
        float fa = 1.0 - smoothstep(0.35, 1.0, px / (0.014 * 0.17));
        float fb = 1.0 - smoothstep(0.35, 1.0, px / (0.03 * 0.19));
        vec3 rgb = vec3(0.0); float al = 0.0;
        vec4 ds[4]; ds[0] = g; ds[1] = b * fb; ds[2] = a * fa; ds[3] = hd;
        vec4 rp = vec4(0.065 * 0.135, 0.03 * 0.19, 0.014 * 0.17, 0.0042) / px;   // mean drop radius per layer, px
        vec2 tq = vec2(0.0); float fw = 0.0, fr0 = 0.0;                                     // the front drop: it carries the glints
        for (int i = 0; i < 4; i++) {
          float w = ds[i].z * (i < 3 ? clear : 1.0) * 0.6;
          if (w <= 0.0) continue;                                                 // most pixels: no drop, no lens
          rgb = rgb * (1.0 - w) + lens(ds[i], V, rp[i]) * w; al = al * (1.0 - w) + w;
          tq = ds[i].xy; fw = w; fr0 = rp[i];
        }
        if (fw > 0.0) rgb += glint(tq, V) * fw * smoothstep(3.0, 7.0, fr0);   // a glint on a sub-4 px drop is a speck
        float sheen = 0.035 + 0.05 * (1.0 - fa);                                  // wet film, unresolved drops
        rgb += vec3(0.30, 0.31, 0.34) * sheen * (1.0 - al); al += sheen * (1.0 - al);
        rgb += (vec3(0.30, 0.31, 0.34) * 0.35 + WARM * 0.12) * trail;            // a running streak: the city and the lamps along it
        // the pane as a faint mirror of the room: Fresnel ~8 % head-on, the lamps as soft discs
        float onRoom = step(uPaneZ, cameraPosition.z);
        float near = smoothstep(1.4, 2.4, abs(cameraPosition.z - uPaneZ));
        float fr = 0.08 + 0.92 * pow(1.0 - abs(V.z), 5.0);
        vec3 refl = vec3(0.06, 0.045, 0.032);                                      // the dim room itself
        for (int i = 0; i < ${NL}; i++) {
          vec3 m = uLampPos[i].xyz; m.z = 2.0 * uPaneZ - m.z;                     // the lamp mirrored through the pane
          vec3 toM = m - cameraPosition;
          float dist = length(toM), ang = length(cross(V, toM / dist)), rad = uLampPos[i].w / dist;
          refl += uLampCol[i] * (exp(-pow(ang / rad, 2.0)) * 5.0 + exp(-ang / (rad * 5.0)) * 0.6);
        }
        rgb += refl * fr * onRoom * near * (1.0 - al * 0.6);
        gl_FragColor = vec4(shoulder(rgb), 1.0);  // screened over the scene: the glints roll off, nothing darkens
      }`,
  });
  const glass = noPick(new THREE.Mesh(gg, glassMat));
  glass.name = 'rain_glass';
  glass.renderOrder = 3;
  group.add(glass);

  // 2. the rain outside: drizzle is seen only where a light is behind it (Garg & Nayar 2005), so every
  // streak lives in a cylinder around one lantern, its brightness follows that lantern's downward cone and
  // the forward-scatter angle between the eye and the lantern
  const lamps = [];
  for (let k = 0; k < (d.rain_lamps?.length ?? 0); k += 3) lamps.push(d.rain_lamps.slice(k, k + 3));
  const nS = lamps.length ? STREAKS : 0;
  // each streak is a camera-facing quad ~1.75 px wide with a soft profile across it (4 corners: end x side),
  // not a 1-px line, which crawled and stair-stepped on the phone (panel 015 action 10)
  const seeds = new Float32Array(nS * 4 * 3), ends = new Float32Array(nS * 4 * 2), at = new Float32Array(nS * 4 * 3);
  const sidx = new Uint32Array(nS * 6);
  for (let i = 0; i < nS; i++) {
    const s = [rand(), rand(), rand()], L = lamps[Math.floor(rand() * lamps.length)];
    for (let c = 0; c < 4; c++) {
      seeds.set(s, (4 * i + c) * 3); at.set(L, (4 * i + c) * 3);
      ends.set([c >> 1, (c & 1) * 2 - 1], (4 * i + c) * 2);
    }
    sidx.set([4 * i, 4 * i + 1, 4 * i + 3, 4 * i, 4 * i + 3, 4 * i + 2], 6 * i);
  }
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.BufferAttribute(seeds, 3));   // the seed doubles as the position slot
  rg.setAttribute('aEnd', new THREE.BufferAttribute(ends, 2));        // (end 0/1, side -1/+1)
  rg.setAttribute('aLamp', new THREE.BufferAttribute(at, 3));
  rg.setIndex(new THREE.BufferAttribute(sidx, 1));
  const rainMat = new THREE.ShaderMaterial({
    ...SCREEN,
    uniforms: { uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) } },
    vertexShader: `uniform float uTime; uniform vec2 uRes; attribute vec2 aEnd; attribute vec3 aLamp; varying float vA; varying float vS;
      vec3 at(vec3 s, float fall, float e) {
        float a = 6.2832 * s.z, r = sqrt(s.x) * ${CONE_R.toFixed(2)};
        return aLamp + vec3(cos(a) * r + (fall + e * ${STREAK_LEN.toFixed(2)}) * ${WIND.toFixed(2)},
                            ${CONE_UP.toFixed(2)} - fall - e * ${STREAK_LEN.toFixed(2)}, sin(a) * r);
      }
      void main() {
        vec3 s = position;
        float H = ${(CONE_UP + CONE_DOWN).toFixed(2)};
        float fall = mod(s.y * H + uTime * ${FALL.toFixed(2)}, H);
        float r = sqrt(s.x) * ${CONE_R.toFixed(2)};
        vec3 p = at(s, fall, aEnd.x);
        float below = max(0.0, aLamp.y - p.y);
        float cone = 0.35 + 0.8 * below;                          // the lantern's reflector throws down and out
        float lit = exp(-r * r / (cone * cone)) * (p.y < aLamp.y ? 1.0 : exp(-(p.y - aLamp.y) * 2.5));
        lit /= 1.0 + 0.12 * dot(p - aLamp, p - aLamp);            // falloff with distance from the lantern
        // a drop shows only with the light behind it: forward scatter, strong within ~25 deg of the line
        // to the lantern, faint otherwise (else every lit drop on the far quay is a white speck)
        vec3 pw = (modelMatrix * vec4(p, 1.0)).xyz, lw = (modelMatrix * vec4(aLamp, 1.0)).xyz;
        float g = dot(normalize(pw - cameraPosition), normalize(lw - pw));
        lit *= 0.06 + 0.94 * smoothstep(0.55, 0.97, g);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vA = lit * clamp(30.0 / -mv.z, 0.0, 1.0) * (1.0 - aEnd.x * 0.7);
        vec4 c0 = projectionMatrix * mv, c1 = projectionMatrix * (modelViewMatrix * vec4(at(s, fall, 1.0 - aEnd.x), 1.0));
        vec2 d = (c1.xy / c1.w - c0.xy / c0.w) * uRes;                      // along the streak, in pixels
        vec2 n = normalize(vec2(-d.y, d.x) + 1e-6);
        c0.xy += n * aEnd.y * 0.875 / uRes * 2.0 * c0.w;                      // +-0.875 px: a 1.75 px band
        vS = aEnd.y;
        gl_Position = c0;
      }`,
    fragmentShader: `varying float vA; varying float vS; ${SHOULDER}
      void main() { float k = 1.0 - vS * vS;                                  // soft across: mean 2/3, as bright as the old line
        gl_FragColor = vec4(shoulder(vec3(1.0, 0.8, 0.56) * vA * 1.8 * k * 0.86), 1.0); }`,
  });
  const rain = noPick(new THREE.Mesh(rg, rainMat));
  rain.name = 'rain_streaks';
  rain.frustumCulled = false;
  group.add(rain);

  // 2b. the lanterns' glow: a soft halo in the wet air around each head, billboards (one draw call)
  const GP = [], GC = [], GI = [];
  lamps.forEach((L, i) => {
    for (const c of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { GP.push(...L); GC.push(...c); }
    GI.push(4 * i, 4 * i + 1, 4 * i + 2, 4 * i, 4 * i + 2, 4 * i + 3);
  });
  const hg = new THREE.BufferGeometry();
  hg.setAttribute('position', new THREE.Float32BufferAttribute(GP, 3));
  hg.setAttribute('aC', new THREE.Float32BufferAttribute(GC, 2));
  hg.setIndex(GI);
  hg.computeBoundingSphere();
  if (hg.boundingSphere) hg.boundingSphere.radius += GLOW_R;
  const glowMat = new THREE.ShaderMaterial({
    ...SCREEN,
    vertexShader: `attribute vec2 aC; varying vec2 vC;
      void main() { vC = aC; vec4 mv = modelViewMatrix * vec4(position, 1.0);
        mv.xy += aC * ${GLOW_R.toFixed(2)}; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying vec2 vC; ${SHOULDER}
      void main() { float r2 = dot(vC, vC); if (r2 > 1.0) discard;
        float a = 0.75 * exp(-r2 * 12.0) + 0.22 * exp(-r2 * 3.0) - 0.011;  // a tight bloom and the wide halo of the mist
        gl_FragColor = vec4(shoulder(vec3(1.0, 0.74, 0.46) * max(a, 0.0)), 1.0); }`,
  });
  const glow = noPick(new THREE.Mesh(hg, glowMat));
  glow.name = 'rain_glow';
  glow.renderOrder = 2;
  group.add(glow);

  // the lights' streaks on the water are layer-water.js's (per light, per view): no strips here
  const boat = byName('cz_boat');
  const bd = boat?.userData;

  // 3. the boat: along the canal, then a pause on the quay, again
  const bx0 = boat ? boat.position.x : 0;
  const [px0, px1] = bd?.boat_path ?? [0, 0];
  const span = Math.abs(px1 - px0), speed = bd?.boat_speed ?? 1, cycle = span / speed + PAUSE;
  let t = 0, boatT = (Math.abs(px0 - 40) / speed) % cycle;  // first pass already under way, so it shows soon
  let shown = !live.gate;

  function place() {
    if (!boat) return;
    const k = boatT % cycle;
    const x = k < span / speed ? px0 + Math.sign(px1 - px0) * speed * k : px1 + 500;   // parked out of sight
    boat.visible = x < 400;
    boat.position.x = boat.visible ? x : bx0;
  }

  function step(dt) {
    if (still()) { glassMat.uniforms.uTime.value = 3.7; return false; }
    t += dt;
    boatT += dt;
    glassMat.uniforms.uTime.value = t;
    rainMat.uniforms.uTime.value = t;
    live.renderer?.getDrawingBufferSize?.(rainMat.uniforms.uRes.value);
    place();
    return true;
  }

  function sync() {
    glass.visible = glow.visible = shown;
    rain.visible = shown && !still();
  }
  sync();
  if (!live.gate && !still()) place();

  return {
    name: 'rain',
    update(dt) {
      sync();
      if (!shown) return false;
      const seen = inView(camera, glass) || inView(camera, rain) || (boat?.visible && inView(camera, boat));
      return step(live.gate ? 0 : dt) && seen;
    },
    api: {
      show() { shown = true; sync(); live.render(); return this.info(); },
      advance(sec, h = 1 / 30) { shown = true; sync(); let n = Math.round(sec / h); while (n-- > 0) step(h); live.render(); return this.info(); },
      info: () => ({ t, boatX: boat ? +boat.position.x.toFixed(2) : null, boatVisible: boat ? boat.visible : false,
        streaks: STREAKS, glass: glass.visible, rain: rain.visible, still: still() }),
    },
  };
}
