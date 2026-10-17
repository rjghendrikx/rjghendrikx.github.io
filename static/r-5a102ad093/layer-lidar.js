// Lidar mode: the whole room shows its own measurement (portfolio README, "the object shows its own
// measurement"; Radiohead's House of Cards, 2008). A spinning lidar on a tripod beside the projector
// sweeps the room; every return appears as the head passes its azimuth, and the baked room fades to
// black under the cloud. Toggle: the "Lidar" button or key L; key C switches intensity / range colour.
//
// A simulation, not a look: the points are a raycast grid (RINGS elevation rings x AZ azimuth steps),
// not samples scattered on the meshes. On the first toggle the scene is rendered once from the
// scanner into a cube map that stores, per direction, the range to the first surface, cos(theta) of
// the incidence and a reflectance proxy (the baked texel's luminance). The vertex shader of one
// THREE.Points then reads its ray from that map, so shadows (what the scanner cannot see), the
// 1/r^2 drop in density, the visible rings and the sparse far field all follow from geometry:
//   received power  P ~ rho * cos(theta) / r^2       (diffuse target, beam smaller than the target)
//   detection       a soft threshold on P (PMIN); the canal thins out by itself
//   range noise     sigma grows as 1/sqrt(P) from SIGMA0 (low SNR returns are noisier)
//   dropouts        grazing incidence, minimum range, water (specular: the beam glances off)
//   rain            the panes and the air outside give sparse single returns, re-rolled per pass
// Per frame the CPU sets a few uniforms; nothing per point. Off = no draw call, no frame.
// Hooks: node projector (its bounding box places the tripod), cz_table (floor height), cz_canal_night extras rain_panes,
// rain_water_y; node cz_canal_sky (no return), cz_boat (left out of the capture: it moves).
// ?lidar (on at load), ?lidar=range, ?lidar_points=N; ?gate: the clock moves only via api.advance.
// Reduced motion: no sweep, no afterglow; the cloud appears whole and still.
import { noPick, easeInOut } from './layer-common.js';

// Grid and capture: desktop 1536 x 96 = 147,456 rays; coarse pointer (phones) 768 x 52 = 39,936.
// Cube face: 1536 azimuth steps are 384 per 90-degree face edge; the face (1024) is finer than the
// ray spacing everywhere on it, so the rings do not stair-step.
const GRID = { fine: { az: 1536, rings: 96, face: 1024 }, coarse: { az: 768, rings: 52, face: 512 } };
const EL_MIN = -60, EL_MAX = 75;  // deg, ring elevations (a scanning head with a wide vertical field)
const PLACE = { dx: 0.40, dz: 0.10, h: 1.55 };   // m: head beside the projector (+x of its box), centre height
const TRIPOD = { hub: 0.20, spread: 0.26 };     // m: legs meet this far below the head, feet on this radius
const HEAD = { r: 0.0435, h: 0.0736 };   // m, a puck-sized spinning unit (unmeasured, ~Ouster OS1 class)
const REV = 7.0;                  // s per revolution, slowed to be watched (real units spin at 10-20 Hz)
const T_IN = 5.5, T_OUT = 1.6;    // s, room to black (under the first sweep) and back
const GLOW_TAU = 0.7;             // s, afterglow of a fresh return behind the head
const R_NEAR = 0.03, R_FAR = 500; // m, the cube capture's range code (log, 16 bit)
const R_MIN = 0.40;               // m, minimum range (spinning units: ~0.3-0.5 m)
const PMIN = 5e-5;                // detection threshold on rho*cos/r^2 (m^-2): 50 % at 45 m for rho 0.1
                                  // (the range a puck-class unit quotes at 10 % reflectance; unmeasured)
const PTOP = 0.30;                // P that maps to the top of the intensity palette
const SIGMA0 = 0.003;             // m, 1 sigma range noise at high SNR (unmeasured; spec sheets 1-3 cm)
const SIGMA_MAX = 0.04;           // m
const GRAZE = [0.04, 0.22];       // cos(theta): below the first no return, above the second all
const WATER_KEEP = 0.03;          // fraction of returns off the canal (specular water)
const RAIN_PANE = 0.025;          // chance a ray through a wet pane returns from a drop, per pass
const RAIN_AIR = 0.0025;          // returns per metre of ray outside (light rain, ~1 mm/h)
const DIVERGENCE = 0.003;         // rad, beam divergence: footprint = EXIT + DIVERGENCE * r
const EXIT = 0.006;               // m, beam diameter at the window
const PX = [1.2, 3.2];            // drawn point size clamp, drawing-buffer px
const DEPTH_BIAS = 0.006;         // fraction of view distance the points move towards the camera
const RHO = [0.25, 0.75];         // rho = RHO0 + RHO1 * baked luminance (a proxy: the bake is visible light)
// One palette for both colourings (display sRGB, ShaderMaterial output is not converted):
// deep indigo -> cobalt -> cyan -> warm white.
const PALETTE = [[0.17, 0.20, 0.52], [0.16, 0.42, 0.76], [0.36, 0.82, 0.86], [0.98, 0.96, 0.90]];

const glsl = (x) => x.toFixed(6);

const CAPTURE_VS = `varying vec3 vW; varying vec2 vUv;
  void main() { vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w; }`;
// RG: 16-bit log range, B: cos(theta), A: rho. Sky: the clear value (white) = no return.
const CAPTURE_FS = `uniform sampler2D map; uniform vec3 uS; uniform float uSky; varying vec3 vW; varying vec2 vUv;
  void main() {
    if (uSky > 0.5) { gl_FragColor = vec4(1.0); return; }
    vec3 L = uS - vW; float r = length(L); L /= r;
    vec3 N = normalize(cross(dFdx(vW), dFdy(vW)));
    float c = abs(dot(N, L));
    float d = clamp(log(r / ${glsl(R_NEAR)}) / log(${glsl(R_FAR / R_NEAR)}), 0.0, 1.0);
    float code = min(floor(d * 65535.0 + 0.5), 65534.0);
    float hi = floor(code / 256.0);
    vec3 t = texture2D(map, vUv).rgb;
    float lum = dot(t, vec3(0.2126, 0.7152, 0.0722));
    gl_FragColor = vec4(hi / 255.0, (code - hi * 256.0) / 255.0, c, ${glsl(RHO[0])} + ${glsl(RHO[1])} * clamp(lum * 1.6, 0.0, 1.0));
  }`;

const POINTS_VS = `uniform samplerCube uCube; uniform vec3 uS; uniform float uTurns, uFade, uPx, uGlow, uRange, uWaterY, uPaneZ;
  uniform vec4 uPanes[4]; uniform int uPaneN;
  varying vec3 vC; varying float vA;
  float h1(vec3 p) { p = fract(p * vec3(443.897, 441.423, 437.195)); p += dot(p, p.yzx + 19.19); return fract((p.x + p.y) * p.z); }
  vec3 pal(float t) {
    vec3 c0 = vec3(${PALETTE[0].join(',')}), c1 = vec3(${PALETTE[1].join(',')}), c2 = vec3(${PALETTE[2].join(',')}), c3 = vec3(${PALETTE[3].join(',')});
    t = clamp(t, 0.0, 1.0) * 3.0;
    return t < 1.0 ? mix(c0, c1, t) : t < 2.0 ? mix(c1, c2, t - 1.0) : mix(c2, c3, t - 2.0);
  }
  void main() {
    float az = position.x, el = position.y;              // az in turns, el in radians
    float ang = az * 6.2831853;
    vec3 dir = vec3(cos(el) * cos(ang), sin(el), cos(el) * sin(ang));
    float since = uTurns - az;                           // turns since the head first passed this ray
    float pass = floor(since);
    vec3 seed = vec3(az, el, position.z + pass * 0.618034);
    vec4 s = texture(uCube, dir);
    float code = floor(s.r * 255.0 + 0.5) * 256.0 + floor(s.g * 255.0 + 0.5);
    float r = ${glsl(R_NEAR)} * exp(code / 65535.0 * log(${glsl(R_FAR / R_NEAR)}));
    float c = s.b, rho = s.a;
    float keep = step(0.0, since) * step(code, 65534.5) * step(${glsl(R_MIN)}, r);
    // grazing returns: too little energy back along the ray
    keep *= step(smoothstep(${glsl(GRAZE[1])}, ${glsl(GRAZE[0])}, c), h1(seed + 3.1));
    vec3 hit = uS + dir * r;
    keep *= hit.y < uWaterY + 0.08 ? step(h1(seed + 5.7), ${glsl(WATER_KEEP)}) : 1.0;
    // rain: a drop on a wet pane, or in the air outside, before the surface
    if (dir.z < -1e-4) {
      float tp = (uPaneZ - uS.z) / dir.z;
      if (tp > ${glsl(R_MIN)} && tp < r) {
        vec3 x = uS + dir * tp;
        bool wet = false;
        for (int i = 0; i < 4; i++) {
          if (i >= uPaneN) break;
          vec4 p = uPanes[i];
          if (abs(x.x - p.x) < 0.5 * p.z && abs(x.y - p.y) < 0.5 * p.w) wet = true;
        }
        float u = h1(seed + 9.3);
        float air = 1.0 - exp(-${glsl(RAIN_AIR)} * min(r - tp, 60.0));
        if (wet && u < ${glsl(RAIN_PANE)}) { r = tp; c = abs(dir.z); rho = 0.25; keep = step(0.0, since); }
        else if (u > 1.0 - air) { r = tp + h1(seed + 2.2) * min(r - tp, 60.0); c = 0.8; rho = 0.3; keep = step(0.0, since); }
      }
    }
    float P = rho * c / (r * r);
    keep *= step(h1(seed + 7.9), smoothstep(0.5, 2.0, P / ${glsl(PMIN)}));
    // range noise along the ray (Box-Muller), larger at low SNR
    float u1 = max(h1(seed), 1e-4), u2 = h1(seed + 1.3);
    float sig = min(${glsl(SIGMA0)} * max(1.0, sqrt(0.02 / P)), ${glsl(SIGMA_MAX)});
    vec3 w = uS + dir * (r + sig * sqrt(-2.0 * log(u1)) * cos(6.2831853 * u2));
    float ti = (log(P) - log(${glsl(PMIN)})) / log(${glsl(PTOP / PMIN)});
    float tr = 1.0 - log(max(r, 0.5) / 0.5) / log(120.0);
    float t = mix(ti, tr, uRange);
    float glow = uGlow * exp(-fract(since) * ${glsl(REV / GLOW_TAU)}) * step(since, 1e6);
    vC = mix(pal(t), pal(1.0) * 1.25, glow * 0.8);
    vA = keep * uFade * (0.6 + 0.4 * clamp(t, 0.0, 1.0)) * (1.0 + 1.5 * glow);
    vec4 mv = viewMatrix * vec4(w, 1.0);
    float px = clamp(uPx * (${glsl(EXIT)} + ${glsl(DIVERGENCE)} * r) / -mv.z, ${PX[0].toFixed(2)}, ${PX[1].toFixed(2)});
    vA *= min(1.0, px / ${PX[0].toFixed(2)}) * (0.2 + 0.8 * smoothstep(${glsl(R_MIN)}, 2.0, r));   // dense near field
    gl_Position = projectionMatrix * vec4(mv.xyz * (1.0 - ${glsl(DEPTH_BIAS)}), 1.0);
    gl_PointSize = vA > 0.002 ? px : 0.0;
  }`;
const POINTS_FS = `varying vec3 vC; varying float vA;
  void main() {
    if (vA <= 0.002) discard;
    float q = length(gl_PointCoord - 0.5) * 2.0;
    gl_FragColor = vec4(vC, vA * smoothstep(1.0, 0.35, q));
  }`;

const STYLE = `.lidar { position: fixed; top: calc(max(16px, env(safe-area-inset-top, 0px)) + 32px); right: max(16px, env(safe-area-inset-right, 0px));
  font: inherit; font-size: 12px; line-height: 1; color: var(--muted, #b9ab98); background: rgba(20, 17, 15, .55); cursor: pointer;
  border: 1px solid rgba(239, 230, 218, .16); border-radius: 999px; padding: 6px 10px; opacity: 0; transition: opacity .6s ease, color .2s, border-color .2s; }
.ready .lidar { opacity: 1; }   /* no opacity on the label: 5.18:1 (panel 015 action 6) */
.lidar:hover { color: var(--ink, #efe6da); opacity: 1; }
.lidar[aria-pressed="true"] { color: var(--ink, #efe6da); border-color: #45bdcb; opacity: 1; }
.lidar:focus-visible { outline: 2px solid var(--accent, #e3a35b); outline-offset: 2px; }
.gate .lidar { display: none; }`;

export default function mount(live) {
  const { THREE, scene, renderer, camera, byName, params } = live;
  const proj = byName('projector');
  if (!proj || !renderer.capabilities.isWebGL2) return null;

  const coarse = matchMedia('(pointer: coarse)').matches;
  const grid = { ...GRID[coarse ? 'coarse' : 'fine'] };
  const want = Number(params.get('lidar_points'));
  if (want > 0) {
    grid.rings = Math.max(4, Math.round(Math.sqrt(want / 16)));
    grid.az = Math.round(want / grid.rings);
    grid.face = grid.az > 1024 ? 1024 : 512;
  }
  const count = grid.az * grid.rings;

  const box = new THREE.Box3().setFromObject(proj);
  // on the floor beside the projector's table, on the side towards the plinth (world +x)
  const floorY = byName('cz_table') ? new THREE.Box3().setFromObject(byName('cz_table')).min.y : 0;
  const S = new THREE.Vector3(box.max.x + PLACE.dx, floorY + PLACE.h, (box.min.z + box.max.z) / 2 + PLACE.dz);

  // the wet panes (node-local in cz_canal_night, transformed to world)
  const night = byName('cz_canal_night')?.userData ?? {};
  const panes = [];
  const rp = night.rain_panes ?? [];
  const nm = byName('cz_canal_night')?.matrixWorld ?? new THREE.Matrix4();
  for (let k = 0; k + 4 < rp.length && panes.length < 4; k += 5) {
    const c = new THREE.Vector3(rp[k], rp[k + 1], rp[k + 2]).applyMatrix4(nm);
    panes.push(new THREE.Vector4(c.x, c.y, rp[k + 3], rp[k + 4]));
  }
  const paneZ = panes.length ? new THREE.Vector3(rp[0], rp[1], rp[2]).applyMatrix4(nm).z : -1e3;
  while (panes.length < 4) panes.push(new THREE.Vector4(0, 0, 0, 0));
  const waterY = night.rain_water_y ?? -1e3;

  // The grid: position = (azimuth in turns, elevation in rad, a per-ray seed).
  const pos = new Float32Array(count * 3);
  const el0 = THREE.MathUtils.degToRad(EL_MIN), el1 = THREE.MathUtils.degToRad(EL_MAX);
  for (let j = 0, i = 0; j < grid.rings; j++) {
    const el = el0 + (el1 - el0) * (j + 0.5) / grid.rings;
    for (let a = 0; a < grid.az; a++, i++) {
      pos[3 * i] = (a + 0.5) / grid.az; pos[3 * i + 1] = el; pos[3 * i + 2] = ((i * 0.7548776662) % 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));

  let rt = null;
  const U = {
    uCube: { value: null }, uS: { value: S }, uTurns: { value: 0 }, uFade: { value: 0 }, uPx: { value: 800 },
    uGlow: { value: 1 }, uRange: { value: params.get('lidar') === 'range' ? 1 : 0 }, uWaterY: { value: waterY },
    uPaneZ: { value: paneZ }, uPanes: { value: panes }, uPaneN: { value: Math.min(4, Math.floor(rp.length / 5)) },
  };
  const mat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: POINTS_VS, fragmentShader: POINTS_FS,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const cloud = noPick(new THREE.Points(geo, mat));
  cloud.name = 'lidar_points';
  cloud.frustumCulled = false;
  cloud.visible = false;
  cloud.renderOrder = 901;

  // Everything else to black: one full-screen quad over the scene, under the cloud.
  const veil = noPick(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    uniforms: { uK: { value: 0 } }, transparent: true, depthTest: false, depthWrite: false,
    vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: 'uniform float uK; void main() { gl_FragColor = vec4(0.0, 0.0, 0.0, uK); }',
  })));
  veil.name = 'lidar_veil';
  veil.frustumCulled = false;
  veil.visible = false;
  veil.renderOrder = 900;

  // The scanner: a puck on a tripod beside the projector; a faint ring where its window is.
  const rod = (a, b, r) => {
    const g = new THREE.CylinderGeometry(r, r, a.distanceTo(b), 8, 1, true);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()));
    return g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  };
  const tint = (g, f) => {
    g = g.toNonIndexed();
    const p = g.attributes.position, c = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) c.set(f(p.getY(i)), 3 * i);
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    return g;
  };
  const dark = () => [0.03, 0.032, 0.038];
  const parts = [tint(new THREE.CylinderGeometry(HEAD.r, HEAD.r, HEAD.h, 28, 4), (y) => (Math.abs(y) < HEAD.h / 8 ? [0.08, 0.30, 0.34] : [0.035, 0.038, 0.045]))];
  const hub = new THREE.Vector3(0, -HEAD.h / 2 - TRIPOD.hub, 0);
  parts.push(tint(rod(new THREE.Vector3(0, -HEAD.h / 2, 0), hub, 0.012), dark));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    parts.push(tint(rod(hub, new THREE.Vector3(Math.cos(a) * TRIPOD.spread, -S.y + floorY, Math.sin(a) * TRIPOD.spread), 0.009), dark));
  }
  const merged = new THREE.BufferGeometry();
  for (const name of ['position', 'color']) {
    const arrs = parts.map((g) => g.attributes[name].array);
    const out = new Float32Array(arrs.reduce((n, a) => n + a.length, 0));
    let o = 0; for (const a of arrs) { out.set(a, o); o += a.length; }
    merged.setAttribute(name, new THREE.BufferAttribute(out, 3));
  }
  const bodyMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, side: THREE.DoubleSide });
  bodyMat.forceSinglePass = true;                     // one draw call, not back + front
  const body = noPick(new THREE.Mesh(merged, bodyMat));
  body.name = 'lidar_scanner';
  body.position.copy(S);
  body.visible = false;
  body.renderOrder = 902;

  // One capture from the scanner, on the first toggle: baked meshes only, each with a capture material.
  function capture() {
    rt = new THREE.WebGLCubeRenderTarget(grid.face, { type: THREE.UnsignedByteType, format: THREE.RGBAFormat,
      minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false, depthBuffer: true });
    const cube = new THREE.CubeCamera(0.02, R_FAR, rt);
    cube.position.copy(S);
    scene.add(cube);
    cube.updateMatrixWorld(true);
    const sky = byName('cz_canal_sky'), boat = byName('cz_boat');
    const under = (o, root) => { for (let p = o; p; p = p.parent) if (p === root) return true; return false; };
    const swapped = [], hidden = [];
    scene.traverse((o) => {
      if (!(o.isMesh || o.isPoints || o.isLine || o.isSprite)) return;
      const baked = o.isMesh && o.material?.map && !(boat && under(o, boat));
      if (!baked) { if (o.visible) { hidden.push(o); o.visible = false; } return; }
      const m = new THREE.ShaderMaterial({ vertexShader: CAPTURE_VS, fragmentShader: CAPTURE_FS, side: THREE.DoubleSide,
        uniforms: { map: { value: o.material.map }, uS: { value: S }, uSky: { value: sky && under(o, sky) ? 1 : 0 } } });
      swapped.push([o, o.material]);
      o.material = m;
    });
    const clear = renderer.getClearColor(new THREE.Color()), alpha = renderer.getClearAlpha();
    renderer.setClearColor(0xffffff, 1);
    cube.update(renderer, scene);
    renderer.setClearColor(clear, alpha);
    for (const [o, m] of swapped) { o.material.dispose(); o.material = m; }
    for (const o of hidden) o.visible = true;
    scene.remove(cube);
    U.uCube.value = rt.texture;
    scene.add(cloud, veil, body);
  }

  const reduce = () => live.reduceMotion.matches;
  let on = false, k = 0, turns = 0, settled = true, lastKey = '';
  addEventListener('resize', () => { if (cloud.visible) settled = false; });   // point size follows the canvas
  const button = document.createElement('button');
  function set(v) {
    if (v && !rt) capture();
    on = v;
    if (on) { turns = 0; settled = false; }
    if (reduce()) k = on ? 1 : 0;
    settled = false;
    button.setAttribute('aria-pressed', String(on));
    live.render();
    return on;
  }
  const toggle = () => set(!on);
  const setColour = (mode) => { U.uRange.value = mode === 'range' ? 1 : 0; settled = false; live.render(); return mode; };

  if (!live.gate) {
    const style = document.createElement('style');
    style.textContent = STYLE;
    document.head.appendChild(style);
    button.type = 'button';
    button.className = 'lidar';
    button.textContent = 'Lidar';
    button.title = 'Lidar mode (L)';
    button.setAttribute('aria-pressed', 'false');
    button.setAttribute('aria-label', 'Lidar mode: the room as its own point cloud');
    button.addEventListener('click', toggle);
    document.body.appendChild(button);
    addEventListener('keydown', (ev) => {
      if (ev.metaKey || ev.ctrlKey || ev.altKey || ev.repeat || /^(INPUT|TEXTAREA|SELECT)$/.test(ev.target?.tagName)) return;
      if (ev.key === 'l' || ev.key === 'L') toggle();
      else if ((ev.key === 'c' || ev.key === 'C') && on) setColour(U.uRange.value > 0.5 ? 'intensity' : 'range');
    });
  }
  if (params.has('lidar')) set(true);

  function step(dt) {
    if (settled) return false;
    const still = reduce();
    k = still ? (on ? 1 : 0) : THREE.MathUtils.clamp(k + (on ? dt / T_IN : -dt / T_OUT), 0, 1);
    if (on && !still) turns += dt / REV;
    const e = easeInOut(k);
    U.uTurns.value = still ? 1e3 : turns;
    U.uGlow.value = still ? 0 : 1;
    U.uFade.value = on ? Math.min(1, k * 3) : e;    // the cloud arrives with the head, leaves with the room
    veil.material.uniforms.uK.value = e;
    bodyMat.opacity = e;
    cloud.visible = veil.visible = body.visible = k > 0;
    if (cloud.visible) U.uPx.value = renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    // nothing changes any more: off and faded, or a still cloud under reduced motion
    if ((!on && k === 0) || (still && on)) settled = true;
    const key = `${on}|${k}|${turns}|${U.uRange.value}|${U.uPx.value}`;
    const changed = key !== lastKey;           // ?gate (dt = 0): no frame unless something moved
    lastKey = key;
    return changed;
  }

  return {
    name: 'lidar',
    update(dt) { return step(live.gate ? 0 : dt); },
    onView() { if (cloud.visible) { settled = false; } },
    api: {
      toggle, set, colour: setColour,
      // what a ray from the scanner towards a world point hits first (CPU raycast, for tests)
      probe(x, y, z) {
        const ray = new THREE.Raycaster(S, new THREE.Vector3(x, y, z).sub(S).normalize(), 0.02, R_FAR);
        const hit = ray.intersectObjects(scene.children, true).find((h) => h.object.material?.map);
        return hit ? { name: hit.object.name, r: +hit.distance.toFixed(3) } : null;
      },
      advance(sec, h = 1 / 60) { let n = Math.round(sec / h); while (n-- > 0) { settled = false; step(h); } live.render(); return k; },
      info: () => ({ on, k, turns, points: count, grid: { ...grid }, scanner: S.toArray().map((x) => +x.toFixed(3)),
        captured: !!rt, visible: cloud.visible, range: U.uRange.value > 0.5 }),
    },
  };
}
