// Live layer 1, the hero moment: the projector measures the vase, and the vase shows its measurement.
//
// A structured-light scan as it happens: the projector casts a binary-reflected Gray-code sequence
// (a white and a black reference frame, then each bit plane coarse to fine, each followed by its
// inverse, the usual way to decode bits robustly) onto the scan target. The stripes are a projective
// texture on the baked materials of the vase, the bench and the wall (onBeforeCompile; no extra draw
// call), seen through the exported projector camera, shaded by cos(theta)/r^2 and shadowed by the
// vase (an analytic test against its radius profile). Then the vase dissolves, scan line by scan line,
// into its own point cloud (scan_points.json, sampled on the mesh in build.py) shaded like a lidar
// return: intensity ~ cos(theta)/r^2 from the projector, a little range noise, dropouts at grazing
// angles and none at all on the side the projector never saw. A point needs two views: the stripes label it
// with a projector column and row, and the machine-vision camera beside the lens (objects/projector.py,
// 0.20 m baseline) sees that label and triangulates its depth; so a point the camera cannot see (n.L_cam <= 0)
// is a dropout too, a shadow band on the vase's far flank from the camera. Then it settles back.
//
// Hooks (lib/scene.py, objects/projector.py): projector extras projector_cam_pos/dir (node-local, glTF
// axes), projector_cam_hfov_deg, projector_cam_aspect; scan_target extras vase_y0, vase_h,
// vase_center, vase_profile. Trigger: the Projector viewpoint, and once a few seconds after load.
import { easeInOut, noPick, SHOULDER } from './layer-common.js';

const BITS = 7;                 // 128 columns over the 0.50 m image: 3.9 mm finest stripe at the vase
const T_REF = [0.45, 0.30];     // white, black reference frames (s)
const T_FRAME = 0.22;           // one bit plane or its inverse (s); a real scanner runs 60-120 Hz,
                                // this is slowed down to be watched
const T_GAP = 0.35, T_DISSOLVE = 1.9, T_HOLD = 4.2, T_SETTLE = 1.9;
const BEAM_NEAR = 0.01, BEAM_REACH = 1.12;   // beam volume: lens glass to just past the vase (x throw)
const HAZE = 0.25;              // scattered fraction per metre of beam, display units (by eye, unmeasured): 0.5
                                // clipped and hatched; at the panel's 0.15 the filtered beam no longer read as sheets
const AUTOSTART = 3.5;          // s after load, once, if the vase is in view
const AUTOSTART_INTRO = 1.0;    // s after the intro lands on the hero: the reveal follows the flight in
const LIGHT = [1.25, 1.3, 1.36];   // projected white relative to the baked texel (cool laser-phosphor white)
// Exposure for the stripes: where the projector's light lands, the baked room light is scaled by
// (1 - EXPOSE), as a camera filming a scan exposes for the projector. Without it the stripes clip
// on the white vase, whose baked texel is already near 1.
const EXPOSE = 0.55;
const RANGE_NOISE = 0.00035;    // m, 1 sigma along the ray (structured light at 0.5 m; unmeasured)
const POINT_SIZE = 0.0014;      // m, rendered size of a return

const SHADER_HEAD = `
uniform mat4 uProjVP; uniform vec3 uProjPos; uniform float uOn; uniform float uExpose; uniform vec3 uPat; uniform vec3 uLight;
uniform float uR0; uniform float uCut; uniform vec3 uVaseAxis; uniform float uVaseH; uniform float uVaseY0;
uniform float uProfile[17];
varying vec3 vLiveW; varying vec3 vLiveL;
float liveHash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float liveVaseShadow(vec3 P) {
  vec2 a = uVaseAxis.xz, p = P.xz, d = uProjPos.xz - P.xz;
  float t = clamp(dot(a - p, d) / dot(d, d), 0.0, 1.0);
  float h = (mix(P.y, uProjPos.y, t) - uVaseAxis.y) / uVaseH;
  if (h < 0.0 || h > 1.0) return 1.0;
  float fi = h * 16.0; int i = int(floor(fi));
  float r = mix(uProfile[i], uProfile[min(i + 1, 16)], fract(fi));
  return smoothstep(r - 0.003, r + 0.003, length(p + d * t - a));
}
// The projected frame at image column colc (0..2^bits): reference frames, or one Gray-code bit plane
// (MSB, the coarsest, first) or its inverse. Bit plane j with p = 2^(bits-1-j) columns per half-step is a
// square wave of period 4p, high on [p, 3p) (b_j xor b_j+1). It is box-filtered over the footprint w (in
// ndc along the stripe axis: a pixel's, or one ray-march step's) through the wave's integral
// F(u) = floor(u)/2 + min(fract(u), 1/2), so a stripe narrower than the footprint shows as its mean
// instead of crawling (panel 015 action 4; the old floor()/mod() wave aliased into moire on the floor).
${SHOULDER}
float liveSqInt(float u) { return floor(u) * 0.5 + min(fract(u), 0.5); }
float liveGray(vec2 ndc, float w) {
  if (uPat.x < -1.5) return 0.0;          // black reference
  if (uPat.x < -0.5) return 1.0;          // white reference
  float n = exp2(uPat.z), p = exp2(uPat.z - 1.0 - uPat.x);
  float colc = ((uPat.y > 1.5 ? ndc.y : ndc.x) * 0.5 + 0.5) * n;   // columns, then rows
  float u = (colc - p) / (4.0 * p), wu = max(w * 0.5 * n / (4.0 * p), 1e-4);
  float g = (liveSqInt(u + 0.5 * wu) - liveSqInt(u - 0.5 * wu)) / wu;
  return mod(uPat.y, 2.0) > 0.5 ? 1.0 - g : g;
}
vec3 liveScan(vec3 base) {
  if (uOn <= 0.0) return base;
  vec4 pc = uProjVP * vec4(vLiveW, 1.0);
  vec2 ndc = pc.xy / max(pc.w, 1e-4);
  float sa = uPat.y > 1.5 ? ndc.y : ndc.x;                   // derivatives before any branch: the footprint
  float fw = length(vec2(dFdx(sa), dFdy(sa)));                // of this pixel along the stripe axis (ndc)
  if (pc.w <= 0.0) return base;
  vec2 e = smoothstep(1.0, 0.98, abs(ndc));
  if (e.x * e.y <= 0.0) return base;
  vec3 N = normalize(cross(dFdx(vLiveW), dFdy(vLiveW)));   // facet normal (the GLB has none)
  vec3 L = uProjPos - vLiveW; float r = length(L); L /= r;
  float cosT = dot(N, L);
  if (cosT <= 0.0) return base;
  float g = liveGray(ndc, fw);
  float reach = e.x * e.y * uOn * min(1.0, uR0 * uR0 / (r * r));
#ifdef LIVE_SHADOW
  reach *= liveVaseShadow(vLiveW);
#endif
  // the same shoulder as the other live layers: the white reference frame on the white vase rolls off
  // instead of clipping (0.15 % of the hero clipped at 1440x900 during the scan)
  return shoulder(base * (1.0 - uExpose * reach) + base * uLight * g * cosT * reach);
}
`;

function patch(mat, uniforms, define) {
  mat.defines = { ...(mat.defines || {}), [define]: '' };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = 'varying vec3 vLiveW; varying vec3 vLiveL;\n' + sh.vertexShader.replace('#include <project_vertex>',
      '#include <project_vertex>\n vLiveW = (modelMatrix * vec4(transformed, 1.0)).xyz; vLiveL = transformed;');
    sh.fragmentShader = SHADER_HEAD + sh.fragmentShader
      .replace('#include <map_fragment>', `#include <map_fragment>
#ifdef LIVE_VASE
  if (vLiveL.y > uVaseY0 + 0.0004) {
    vec4 pcv = uProjVP * vec4(vLiveW, 1.0);
    if (pcv.y / pcv.w > uCut + (liveHash(floor(vLiveW * 1400.0)) - 0.5) * 0.05) discard;
  }
#endif`)
      .replace('#include <opaque_fragment>', 'outgoingLight = liveScan(outgoingLight);\n#include <opaque_fragment>');
  };
  mat.customProgramCacheKey = () => `live-projector-${define}`;
  mat.needsUpdate = true;
}

async function loadPoints(THREE) {
  const doc = await (await fetch(new URL('scan_points.json', import.meta.url))).json();
  const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)).buffer;
  const q = new Uint16Array(b64(doc.pos)), n = new Int8Array(b64(doc.nrm));
  const p = new Float32Array(q.length);
  for (let i = 0; i < q.length; i++) {
    const k = i % 3;
    p[i] = doc.min[k] + (q[i] / 65535) * (doc.max[k] - doc.min[k]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(n, 3, true));
  return { geometry: g, count: doc.count };
}

export default async function mount(live) {
  const { THREE, byName, camera, renderer } = live;
  const proj = byName('projector'), target = byName('scan_target');
  const d = proj?.userData, v = target?.userData;
  if (!d?.projector_cam_pos || !v?.vase_profile) return null;

  // The projector's view, from the exported intrinsics (throw ratio -> hfov; shift_y is 0 in this scene).
  const pos = new THREE.Vector3(...d.projector_cam_pos).applyMatrix4(proj.matrixWorld);
  const dir = new THREE.Vector3(...d.projector_cam_dir).transformDirection(proj.matrixWorld);
  const hf = THREE.MathUtils.degToRad(d.projector_cam_hfov_deg);
  const pcam = new THREE.PerspectiveCamera(THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(hf / 2) / d.projector_cam_aspect)),
    d.projector_cam_aspect, 0.05, 30);
  pcam.position.copy(pos);
  pcam.up.set(0, 1, 0).transformDirection(proj.matrixWorld);
  pcam.lookAt(pos.clone().add(dir));
  pcam.updateMatrixWorld();
  pcam.updateProjectionMatrix();
  const vp = new THREE.Matrix4().multiplyMatrices(pcam.projectionMatrix, pcam.matrixWorldInverse);
  const axis = new THREE.Vector3(0, v.vase_y0, 0).applyMatrix4(target.matrixWorld);
  const center = new THREE.Vector3(...v.vase_center).applyMatrix4(target.matrixWorld);

  const U = {
    uProjVP: { value: vp }, uProjPos: { value: pos }, uOn: { value: 0 }, uPat: { value: new THREE.Vector3(-1, 0, BITS) },
    uLight: { value: new THREE.Vector3(...LIGHT) }, uExpose: { value: EXPOSE }, uR0: { value: pos.distanceTo(center) }, uCut: { value: 9 },
    uVaseAxis: { value: axis }, uVaseH: { value: v.vase_h }, uVaseY0: { value: v.vase_y0 }, uProfile: { value: v.vase_profile },
  };
  // Receivers: every baked mesh inside the projector's frustum (any layout), the vase with its dissolve.
  const reachCam = pcam.clone();
  reachCam.far = U.uR0.value * 3;
  reachCam.updateProjectionMatrix();
  const reach = new THREE.Frustum().setFromProjectionMatrix(
    new THREE.Matrix4().multiplyMatrices(reachCam.projectionMatrix, reachCam.matrixWorldInverse));
  const box = new THREE.Box3();
  const receivers = [];
  live.scene.traverse((o) => {
    if (!o.isMesh || !o.material?.map || o === proj) return;
    if (o === target) receivers.push([o, 'LIVE_VASE']);
    else if (reach.intersectsBox(box.setFromObject(o))) receivers.push([o, 'LIVE_SHADOW']);
  });
  for (const [o, def] of receivers) patch(o.material, U, def);

  // The beam in haze: the frustum from the lens to just past the vase, ray-marched (32 steps) in one
  // additive pass, so the Gray-code planes show as sheets of light while they travel.
  const far = U.uR0.value * BEAM_REACH;
  const tx = Math.tan(hf / 2), ty = tx / d.projector_cam_aspect;
  const bg = new THREE.BoxGeometry(2, 2, 2);
  const bp = bg.attributes.position;
  for (let i = 0; i < bp.count; i++) {      // box -> frustum in projector space: z=+1 near, z=-1 far
    const depth = BEAM_NEAR + (far - BEAM_NEAR) * (1 - bp.getZ(i)) / 2;
    bp.setXYZ(i, bp.getX(i) * tx * depth, bp.getY(i) * ty * depth, -depth);
  }
  bg.applyMatrix4(pcam.matrixWorld);
  const beamMat = new THREE.ShaderMaterial({
    // back faces, depth-tested: where a surface stands in front of the beam's far side (the plant, the vase)
    // the beam is not painted over it; the march runs from the back face toward the eye
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide,
    uniforms: { ...U, uHaze: { value: HAZE }, uFar: { value: far }, uAxis: { value: dir.clone() }, uSpan: { value: far * 1.2 } },
    vertexShader: `varying vec3 vLiveW; varying vec3 vLiveL;
      void main() { vLiveW = (modelMatrix * vec4(position, 1.0)).xyz; vLiveL = position;
        gl_Position = projectionMatrix * viewMatrix * vec4(vLiveW, 1.0); }`,
    fragmentShader: SHADER_HEAD + `uniform float uHaze, uFar, uSpan; uniform vec3 uAxis;
      void main() {
        vec3 rd = normalize(vLiveW - cameraPosition);
        float dt = uSpan / 32.0, acc = 0.0;
        float j = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) * dt;   // IGN
        for (int i = 0; i < 32; i++) {
          vec3 p = vLiveW - rd * (j + float(i) * dt);
          vec4 pc = uProjVP * vec4(p, 1.0);
          float z = dot(p - uProjPos, uAxis);
          if (pc.w <= 0.0 || z > uFar) continue;
          vec2 ndc = pc.xy / pc.w;
          vec4 pn = uProjVP * vec4(p - rd * dt, 1.0);              // the next step: its footprint filters the stripes
          vec2 dn = abs(pn.xy / max(pn.w, 1e-4) - ndc) + 1e-4;
          // the share of this step inside the frustum's sides, not all-or-nothing: a hard cut flipped one step
          // in or out from pixel to pixel with the jitter and hatched the beam's edges
          vec2 inside = clamp((1.0 - abs(ndc)) / dn + 0.5, 0.0, 1.0);
          if (inside.x * inside.y <= 0.0) continue;
          float r = length(p - uProjPos);
          float g = liveGray(ndc, uPat.y > 1.5 ? dn.y : dn.x);
          acc += g * inside.x * inside.y * liveVaseShadow(p) * min(4.0, uR0 * uR0 / (r * r));
        }
        gl_FragColor = vec4(uLight * acc * dt * uHaze * uOn, 1.0);
      }`,
  });
  const beam = noPick(new THREE.Mesh(bg, beamMat));
  beam.name = 'projector_beam';
  beam.visible = false;
  beam.renderOrder = 2;
  live.scene.add(beam);

  // The camera's projection centre (projector extras, node-local glTF axes); without it, points keep the
  // projector-only test (another layout's older projector), placed where the projector is.
  const camPos = d.projector_mv_pos ? new THREE.Vector3(...d.projector_mv_pos).applyMatrix4(proj.matrixWorld) : pos.clone();
  // The point cloud, node-local in the scan target (sorted by projector row in build.py).
  const { geometry, count } = await loadPoints(THREE);
  const pm = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uProjVP: U.uProjVP, uProjPos: U.uProjPos, uR0: U.uR0, uCut: U.uCut, uFade: { value: 0 }, uPx: { value: 800 },
      uCamPos: { value: camPos } },
    vertexShader: `uniform mat4 uProjVP; uniform vec3 uProjPos, uCamPos; uniform float uR0, uCut, uFade, uPx;
      varying float vI; varying float vA;
      float h1(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vec3 n = normalize(mat3(modelMatrix) * normal);
        vec3 L = uProjPos - w.xyz; float r = length(L); L /= r;
        float c = dot(n, L);
        vec3 s = position * 1000.0;
        float u1 = max(h1(s), 1e-4), u2 = h1(s + 17.0), u3 = h1(s + 41.0);
        // dropouts: the side the projector never lit, and grazing returns too weak to decode
        float keep = step(0.0, c) * step(smoothstep(0.30, 0.05, c), u3);
        // and the camera must see it: no second view, no triangulation, no point
        float cc = dot(n, normalize(uCamPos - w.xyz));
        keep *= step(0.0, cc) * step(smoothstep(0.20, 0.03, cc), h1(s + 73.0));
        // range noise along the ray (Box-Muller)
        w.xyz -= L * sqrt(-2.0 * log(u1)) * cos(6.2831853 * u2) * ${RANGE_NOISE.toFixed(6)};
        vec4 pc = uProjVP * w;
        float reveal = smoothstep(uCut - 0.015, uCut + 0.015, pc.y / pc.w);
        vI = clamp(c * uR0 * uR0 / (r * r), 0.0, 1.2);
        vA = keep * reveal * uFade;
        vec4 mv = viewMatrix * w;
        gl_Position = projectionMatrix * mv;
        gl_PointSize = vA > 0.0 ? max(1.0, uPx * ${POINT_SIZE.toFixed(5)} / -mv.z) : 0.0;
      }`,
    fragmentShader: `varying float vI; varying float vA;
      void main() {
        if (vA <= 0.0) discard;
        float q = length(gl_PointCoord - 0.5) * 2.0;
        float disc = smoothstep(1.0, 0.45, q);
        vec3 lo = vec3(0.10, 0.30, 0.42), hi = vec3(0.95, 0.97, 1.0);   // weak -> strong return
        gl_FragColor = vec4(mix(lo, hi, smoothstep(0.1, 1.0, vI)) * (0.35 + 0.65 * vI), disc * vA * 0.85);
      }`,
  });
  const cloud = noPick(new THREE.Points(geometry, pm));
  cloud.name = 'scan_points';
  cloud.visible = false;
  cloud.frustumCulled = false;
  target.add(cloud);

  // the projector-row range the vase spans: the dissolve sweeps across it
  const tmp = new THREE.Vector3();
  let yLo = Infinity, yHi = -Infinity;
  const pa = geometry.attributes.position;
  for (let i = 0; i < pa.count; i += 7) {
    tmp.fromBufferAttribute(pa, i).applyMatrix4(target.matrixWorld).applyMatrix4(vp);
    yLo = Math.min(yLo, tmp.y); yHi = Math.max(yHi, tmp.y);
  }
  const cutTop = yHi + 0.06, cutBottom = yLo - 0.06;

  // Timeline: stripes, gap, dissolve, hold, settle.
  const frames = [[-1, 0, T_REF[0]], [-2, 0, T_REF[1]]];
  // column planes, then row planes (both, for a full projector-camera correspondence); a row plane
  // seen from the side is a sheet of light in the haze. pattern = [bit, inverse + 2 * rows, s]
  for (const rows of [0, 2]) for (let b = 0; b < BITS; b++) frames.push([b, rows, T_FRAME], [b, rows + 1, T_FRAME]);
  const tStripes = frames.reduce((s, f) => s + f[2], 0);
  const tDis = tStripes + T_GAP, tHold = tDis + T_DISSOLVE, tSettle = tHold + T_HOLD, tEnd = tSettle + T_SETTLE;

  const reduce = () => live.reduceMotion.matches;
  let clock = 0, t = -1, autostarted = live.gate, view = live.view(), lastKey = '';
  // 'room:scan' tells the page a scan began (main.js offers the close-up when it starts in the overview)
  const start = () => { if (t < 0 && !reduce()) { t = 0; dispatchEvent(new CustomEvent('room:scan')); } };

  function apply() {
    let on = 0, pat = [-1, 0], cut = 9, fade = 0, phase = 'idle';
    if (t >= 0 && t < tStripes) {
      let s = t;
      const f = frames.find((x) => (s -= x[2]) < 0);
      on = 1; pat = f; phase = `stripes ${frames.indexOf(f)}`;
    } else if (t >= tDis && t < tEnd) {
      fade = 1;
      if (t < tHold) { cut = cutTop + (cutBottom - cutTop) * easeInOut((t - tDis) / T_DISSOLVE); phase = 'dissolve'; }
      else if (t < tSettle) { cut = cutBottom; phase = 'cloud'; }
      else { cut = cutBottom + (cutTop - cutBottom) * easeInOut((t - tSettle) / T_SETTLE); phase = 'settle'; }
    } else if (t < 0 && reduce() && view === 'projector') {
      on = 1; pat = [3, 0]; phase = 'static';      // reduced motion: one bit plane, still
    }
    U.uOn.value = on; U.uPat.value.set(pat[0], pat[1], BITS); U.uCut.value = cut;
    pm.uniforms.uFade.value = fade;
    cloud.visible = fade > 0;
    beam.visible = on > 0 && !reduce();
    const key = `${on}|${pat[0]}|${pat[1]}|${cut.toFixed(4)}`;
    const changed = key !== lastKey;
    lastKey = key;
    return { changed, phase };
  }
  let phase = 'idle';

  // the intro (layer-intro.js) owns the first seconds: the autostart count runs only once it has
  // ended ('room:intro', which sets root.dataset.intro from 'playing' to done/skipped) or never played
  let wait = AUTOSTART;
  addEventListener('room:intro', () => { clock = 0; wait = AUTOSTART_INTRO; }, { once: true });
  function step(dt) {
    if (live.root?.dataset.intro !== 'playing') clock += dt;
    if (!autostarted && clock > wait) {
      autostarted = true;
      if (['overview', 'projector', 'experiment'].includes(view)) start();
    }
    if (t >= 0) { t += dt; if (t >= tEnd) t = -1; }
    const r = apply();
    phase = r.phase;
    return r.changed;
  }

  return {
    name: 'projector',
    update(dt) {
      if (cloud.visible) pm.uniforms.uPx.value = renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
      return step(live.gate ? 0 : dt);   // ?gate: the clock moves only through api.advance
    },
    onView(id) { view = id; if (id === 'projector' || id === 'experiment') start(); live.render(); },
    api: {
      start() { t = 0; live.render(); },
      advance(sec, h = 1 / 60) { let n = Math.round(sec / h); while (n-- > 0) step(h); live.render(); return phase; },
      info: () => ({ phase, running: t >= 0, t, tEnd, frames: frames.length, bits: BITS, points: count, cloudVisible: cloud.visible,
        camera: d.projector_mv_pos ? camPos.toArray().map((v) => +v.toFixed(4)) : null, baseline: d.projector_mv_baseline ?? null }),
    },
  };
}
