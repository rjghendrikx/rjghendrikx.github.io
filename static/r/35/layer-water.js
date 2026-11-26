import { inView, noPick, SCREEN, SHOULDER } from './layer-common.js';
import { Reflector } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/objects/Reflector.js/+esm';

const MIRROR_LAYER = 5;
const OUTSIDE = /^cz_canal|^cz_boat/;
const RES = { fine: 0.5, coarse: 0.5, maxW: 1024, maxWCoarse: 768 };
const CAM_EPS = 1e-4;
const BOAT_MS = 150;
const REACH = 70;
const STREAK = 1.1;

const WaterShader = {
  name: 'CanalMirror',
  uniforms: { color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null },
    uTime: { value: 0 }, uGain: { value: 1.0 }, uQuays: { value: null }, uN: { value: 0 }, uStreak: { value: 1.0 },
    uLights: { value: null }, uLCol: { value: null }, uMid: { value: null } },
  vertexShader:  `
    uniform mat4 textureMatrix; varying vec4 vUv; varying vec3 vW;
    #include <common>
    #include <logdepthbuf_pars_vertex>
    void main() {
      vUv = textureMatrix * vec4(position, 1.0);
      vW = (modelMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      #include <logdepthbuf_vertex>
    }`,
  fragmentShader:  `
    uniform sampler2D tDiffuse; uniform float uTime, uGain, uStreak; uniform vec2 uQuays, uMid; varying vec4 vUv; varying vec3 vW;
    #define MAXL 64
    uniform vec3 uLights[MAXL], uLCol[MAXL]; uniform int uN;
    #include <common>
    #include <logdepthbuf_pars_fragment>
    float h21(vec2 p) { p = fract(p * vec2(127.1, 311.7)); p += dot(p, p + 34.23); return fract(p.x * p.y); }
    ${SHOULDER}
    // the mirror, its lit panes held to 0.9 (a pane is never the brightest thing on the water: the lamps are)
    vec3 tap(vec2 uv) { return min(texture2D(tDiffuse, uv).rgb, vec3(0.9)); }
    // slope (d/dx, d/dz) of the surface: a few wind waves, mostly travelling across the line of sight
    vec2 waves(vec2 p, float t) {
      vec2 g = vec2(0.0);
      const int N = 4;
      vec3 W[N];                                  // direction (x, z), wavenumber
      W[0] = vec3(0.20, 0.98, 4.1); W[1] = vec3(-0.45, 0.89, 6.7); W[2] = vec3(0.85, 0.52, 9.3); W[3] = vec3(-0.10, 1.0, 13.0);
      for (int i = 0; i < N; i++) {
        vec2 d = normalize(W[i].xy); float k = W[i].z;
        float a = 0.010 / k * 6.0;                // steepness falls with wavenumber
        g += d * k * a * cos(dot(d, p) * k - t * sqrt(9.81 * k) * 0.35 + float(i) * 1.7);
      }
      return g;
    }
    // slope of the rain rings: in each cell a drop lands now and then and its ring runs out
    vec2 rings(vec2 p, float t) {
      const float S = 0.55;
      vec2 g = vec2(0.0);
      for (int j = 0; j < 2; j++) {               // two offset grids, so the rings overlap
        vec2 q = p / S + float(j) * 0.5, c = floor(q), f = fract(q) - 0.5;
        float r0 = h21(c + float(j) * 17.0);
        vec2 o = (vec2(h21(c + 3.1), h21(c + 7.7)) - 0.5) * 0.5;
        float life = fract(t / 0.9 + r0);         // 0..1 over the ring's 0.9 s
        vec2 v = f - o; float r = length(v) + 1e-4;
        float R = life * 0.45;                    // radius in cells (~0.25 m)
        float x = (r - R) / 0.06;
        float amp = (1.0 - life) * (1.0 - life) * step(0.35, r0);
        g += v / r * amp * (-2.0 * x) * exp(-x * x) * 0.5;
      }
      return g;
    }
    void main() {
      #include <logdepthbuf_fragment>
      vec3 V = cameraPosition - vW;
      float dist = length(V); V /= dist;
      float cosT = clamp(V.y, 0.0, 1.0);
      float F = 0.02 + 0.98 * pow(1.0 - cosT, 5.0);         // Schlick, water
      vec2 p = vW.xz;
      vec2 g = waves(p, uTime);
      // rings are sub-pixel far out: fade them by the screen size of a cell
      float px = length(fwidth(p));
      g += rings(p, uTime) * smoothstep(0.12, 0.03, px);
      // grazing view: a tilt along the line of sight moves the image far more than one across it
      vec2 uv = vUv.xy / vUv.w;
      vec2 off = vec2(g.x * 0.010, g.y * 0.035 / max(cosT, 0.12) * 0.12);
      // rain-roughened water widens the mirror's lobe along the line of sight: from up in the room the
      // exact image is mostly the far quay wall, and the lamps and lit windows reach the water only as
      // long broken streaks. So: the sharp image, plus a tail of taps down the screen (towards where
      // a light's exact image lies), jittered per ripple row so the streak breaks up and flickers.
      float row = floor(vW.z * 2.5 + g.y * 6.0);
      float jit = h21(vec2(row, floor(uTime * 6.0 + h21(vec2(row, 1.0)) * 6.0)));
      vec3 sharp = tap(uv + off);
      vec3 acc = vec3(0.0); float ws = 0.0;
      // the taps grow apart down the streak (fi^2): each one is blurred vertically over half the gap to the
      // next, so the tail reads as a smear instead of a ladder of copies
      for (int i = 1; i <= 10; i++) {
        float fi = float(i) + jit;
        float w = exp(-fi / 3.5), y = fi * fi * 0.0016, gap = (2.0 * fi + 1.0) * 0.0016;
        vec2 q = uv + off * 2.0 - vec2(0.0, y);
        acc += (tap(q) + tap(q - vec2(0.0, 0.5 * gap))) * 0.5 * w;
        ws += w;
      }
      float broken = smoothstep(0.25, 0.75, h21(vec2(row, floor(uTime * 3.0))));
      vec3 refl = mix(sharp, acc / ws, 0.55) + acc / ws * broken * 0.6;
      // the lights' own glints: a lobe rough along the line of sight and narrow across it (the ripples tilt
      // the water mostly towards and away from the eye), so every lamp, boat bulb and lit window draws its
      // broken vertical streak towards the viewer, also where the mirror image misses it (from the air)
      vec3 Nn = normalize(vec3(-g.x, 1.0, -g.y));
      vec2 tv = normalize(V.xz + vec2(1e-5, 0.0));
      vec3 Tt = vec3(tv.x, 0.0, tv.y), Bt = vec3(-tv.y, 0.0, tv.x);
      // across the line of sight only a part of the ripple tilt counts: the streak stays a vertical band that
      // breaks along its length, instead of worming along every ripple crest
      float nT = dot(Nn, Tt) / Nn.y, nB = 0.35 * dot(Nn, Bt) / Nn.y;
      float ax = 0.05 + px * 0.03, ay = 0.12;
      vec3 glint = vec3(0.0);
      for (int i = 0; i < MAXL; i++) {
        if (i >= uN) break;
        vec3 Ld = uLights[i] - vW; float r2 = dot(Ld, Ld); Ld *= inversesqrt(r2);
        vec3 H = normalize(V + Ld);
        float sT = dot(H, Tt) / H.y - nT, sB = dot(H, Bt) / H.y - nB;
        glint += uLCol[i] * exp(-(sB * sB / (ax * ax) + sT * sT / (ay * ay))) / (1.0 + r2 * 0.0025);
      }
      // near the quay walls the water is darker: the wall's own image, its shadow, the murk along it
      float dq = min(abs(vW.z - uQuays.x), abs(vW.z - uQuays.y));
      float shade = mix(0.4, 1.0, smoothstep(0.0, 2.5, dq));
      // no seam (panel 015 action 7): the screen-blended mirror fades out towards the plane's ends along the canal,
      // with distance, and for steep views (the aerial: F ~ 0.02 there anyway), so the plane never shows an edge
      float fade = (1.0 - smoothstep(0.45, 0.95, abs(vW.x - uMid.x) / ${REACH.toFixed(1)}))
        * (1.0 - smoothstep(55.0, 95.0, dist)) * (1.0 - smoothstep(0.45, 0.85, cosT));
      gl_FragColor = vec4(shoulder((refl * F * uGain + glint * (0.12 + F) * uStreak) * shade) * fade, 1.0);
      #include <colorspace_fragment>
    }`,
};

export default function mount(live) {
  const { THREE, byName, camera, renderer, scene } = live;
  const node = byName('cz_canal_night');
  const d = node?.userData;
  if (!d?.rain_quays || d.rain_water_y === undefined) return null;
  const still = () => live.reduceMotion.matches;
  const coarse = matchMedia('(pointer: coarse)').matches;

  const outside = [];
  scene.traverse((o) => {
    let n = o;
    while (n && !OUTSIDE.test(n.name ?? '')) n = n.parent;
    if (n && o.isMesh && o.material?.map) { o.layers.enable(MIRROR_LAYER); outside.push(o); }
  });

  const [zNear, zFar] = d.rain_quays;
  const zMin = Math.min(zNear, zFar) - 2, zMax = Math.max(zNear, zFar) + 2;
  const geo = new THREE.PlaneGeometry(2 * REACH, zMax - zMin);
  const size = new THREE.Vector2();
  const rtSize = () => {
    renderer.getDrawingBufferSize(size);
    const k = coarse ? RES.coarse : RES.fine, maxW = coarse ? RES.maxWCoarse : RES.maxW;
    const w = Math.min(maxW, Math.round(size.x * k));
    return [Math.max(64, w), Math.max(32, Math.round(w * size.y / Math.max(1, size.x)))];
  };
  const [tw, th] = rtSize();
  const water = noPick(new Reflector(geo, { textureWidth: tw, textureHeight: th, clipBias: 0.003, multisample: 0, shader: WaterShader }));
  water.name = 'water_mirror';
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, d.rain_water_y + 0.012, (zMin + zMax) / 2);
  water.camera.layers.set(MIRROR_LAYER);
  const mat = water.material;
  Object.assign(mat, SCREEN);
  node.updateWorldMatrix(true, false);
  const L = d.rain_lights ?? [], v3 = new THREE.Vector3();
  const nL = Math.min(coarse ? 24 : 64, Math.floor(L.length / 6));
  mat.uniforms.uLights.value = Array.from({ length: 64 }, (_, i) => (i < nL ? node.localToWorld(v3.fromArray(L, i * 6)).clone() : new THREE.Vector3()));
  const gain = (i) => (L[i * 6 + 3] < 0.8 ? 0.3 : 1.0);
  mat.uniforms.uLCol.value = Array.from({ length: 64 }, (_, i) => (i < nL ? new THREE.Vector3().fromArray(L, i * 6 + 3).multiplyScalar(gain(i)) : new THREE.Vector3()));
  mat.uniforms.uN.value = nL;
  mat.uniforms.uStreak.value = STREAK;
  mat.uniforms.uQuays.value = new THREE.Vector2(...[zNear, zFar].map((z) => node.localToWorld(new THREE.Vector3(0, 0, z)).z));
  water.renderOrder = 1;
  node.add(water);
  water.updateWorldMatrix(true, false);
  const mid = water.getWorldPosition(new THREE.Vector3());
  mat.uniforms.uMid.value = new THREE.Vector2(mid.x, mid.z);

  const panes = new THREE.Box3();
  for (let k = 0; k < (d.rain_panes?.length ?? 0); k += 5) {
    const [cx, cy, cz, w, h] = d.rain_panes.slice(k, k + 5);
    panes.expandByPoint(new THREE.Vector3(cx - w / 2, cy - h / 2, cz)).expandByPoint(new THREE.Vector3(cx + w / 2, cy + h / 2, cz));
  }
  const paneProbe = new THREE.Mesh(new THREE.BoxGeometry(...panes.getSize(new THREE.Vector3()).toArray().map((v) => v + 0.01)));
  paneProbe.position.copy(panes.getCenter(new THREE.Vector3()));
  paneProbe.visible = false;
  node.add(paneProbe);

  const pass = water.onBeforeRender;
  const lastCam = new THREE.Matrix4(), lastProj = new THREE.Matrix4();
  const moved = (a, b, eps) => a.elements.some((v, i) => Math.abs(v - b.elements[i]) > eps * Math.max(1, Math.abs(v)));
  const boat = byName('cz_boat');
  const trips = {};
  const bbox = new THREE.Box3(), wpos = new THREE.Vector3(), c = new THREE.Vector3();
  const rect = (box, cam) => {
    const r = [Infinity, Infinity, -Infinity, -Infinity];
    for (let k = 0; k < 8; k++) {
      c.set(k & 1 ? box.max.x : box.min.x, k & 2 ? box.max.y : box.min.y, k & 4 ? box.max.z : box.min.z).project(cam);
      if (c.z > 1) return [-1, -1, 1, 1];
      r[0] = Math.min(r[0], c.x); r[1] = Math.min(r[1], c.y); r[2] = Math.max(r[2], c.x); r[3] = Math.max(r[3], c.y);
    }
    return r;
  };
  const overlap = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
  const boatImageSeen = (cam) => {
    bbox.setFromObject(boat);
    const y = water.getWorldPosition(wpos).y, lo = 2 * y - bbox.max.y;
    bbox.max.y = 2 * y - bbox.min.y; bbox.min.y = lo;
    const img = rect(bbox, cam);
    return overlap(img, [-1, -1, 1, 1]) && (outdoors() || overlap(img, rect(bbox.setFromObject(paneProbe), cam)));
  };
  let lastBoat = NaN, lastPass = 0, passes = 0, passCalls = 0, dirty = true, t = 0, shown = !live.gate;
  water.onBeforeRender = function (r, s, cam) {
    const boatX = boat?.visible ? boat.position.x : NaN;
    const boatMoved = !Object.is(boatX, lastBoat) && performance.now() - lastPass > BOAT_MS
      && (Number.isNaN(boatX) || Number.isNaN(lastBoat) || boatImageSeen(cam));
    const why = dirty ? 'dirty' : moved(cam.matrixWorld, lastCam, CAM_EPS) ? 'cam'
      : moved(cam.projectionMatrix, lastProj, 1e-5) ? 'proj' : boatMoved ? 'boat' : '';
    if (why) {
      trips[why] = (trips[why] ?? 0) + 1;
      const before = r.info.render.calls;
      const auto = r.info.autoReset;
      r.info.autoReset = false;
      pass.call(this, r, s, cam);
      r.info.autoReset = auto;
      passCalls = r.info.render.calls - before;
      lastCam.copy(cam.matrixWorld); lastProj.copy(cam.projectionMatrix); lastBoat = boatX; lastPass = performance.now(); dirty = false; passes++;
    }
  };
  addEventListener('resize', () => { const [w, h] = rtSize(); water.getRenderTarget().setSize(w, h); dirty = true; });

  const sync = () => { water.visible = shown; };
  sync();
  const camLocal = new THREE.Vector3();
  const outdoors = () => node.worldToLocal(camera.getWorldPosition(camLocal)).z < panes.min.z;
  const seen = () => inView(camera, water) && (outdoors() || inView(camera, paneProbe));

  function step(dt) {
    if (still()) { mat.uniforms.uTime.value = 2.3; return false; }
    t += dt;
    mat.uniforms.uTime.value = t;
    return true;
  }

  return {
    name: 'water',
    update(dt) {
      sync();
      if (!shown) return false;
      const moving = step(live.gate ? 0 : dt);
      return moving && seen();
    },
    api: {
      show() { shown = true; dirty = true; sync(); live.render(); return this.info(); },
      advance(sec, h = 1 / 30) { shown = true; dirty = true; sync(); let n = Math.round(sec / h); while (n-- > 0) step(h); live.render(); return this.info(); },
      info: () => ({ t, shown, visible: water.visible, outside: outside.length, passes, trips: { ...trips }, passCalls,
        rt: [water.getRenderTarget().width, water.getRenderTarget().height], still: still() }),
    },
  };
}
