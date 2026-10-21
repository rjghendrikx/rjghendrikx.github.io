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
// Act 3, where the target is the Plato head (canal_house; objects/plato.py): projection mapping. Plato's cave is
// projection, and this is the craft Ruud did for festivals with Resolume and MadMapper: shader-made visuals are drawn
// into a CW x CH render target in projector image space (as a media server outputs them) and thrown back onto the
// head with the same projective texture as the stripes. Occlusion is a projector depth map: the head and its plinth
// rendered once from the lens into a 512^2 target (linear distance, 16 bit in RG), compared per fragment, so the head
// shadows itself, the plinth and the books behind it (the cave wall) and its shadow volume shows in the haze. The
// looks cycle (contours sweeping up the form, a colour wash along the surface normals, the cave: firelight and the
// shadows of figures passing), then the show ends and the frame holds. At the Projector view a studio "layer stack"
// shows the craft step by step: white, wire, template, mask, content.
//
// Hooks (lib/live.py, objects/projector.py, objects/projector_mini.py): projector extras projector_cam_pos/dir
// (node-local, glTF axes), projector_cam_hfov_deg, projector_cam_aspect; the target (node plato, else scan_target)
// scan_y0, scan_center, and on the vase vase_h, vase_profile (the analytic shadow of the default room).
// Trigger: the Projector viewpoint, and once a few seconds after load.
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
// Projection mapping (the head only)
const CW = 1024, CH = 576;      // content target: the head is ~20 % of a 1.0:1 image's width, so 512 gave it ~100 px
const DEPTH = 512;              // projector depth map (square; static, rendered once)
const DMAX = 4.0;               // m, the depth map's range (16 bit: 0.06 mm steps)
const T_MAP_IN = 1.2, T_LOOK = 7.0, LOOKS = 3, T_MAP_OUT = 1.6;   // s: fade in, each look, fade out
const MAP_HAZE = 0.6;           // the beam's haze under content, relative to HAZE (a colour show in haze, not a wall)
const HEAD_HAZE = 0.6;          // the head's rig throws a 1.0:1 image, twice the Barco's beam: its haze, relative to HAZE,
                                // keeps the beam over the floor under the 2.5-stop ratchet (gates.py beam_floor_gate)
const STUDIO_HOLD = 30;         // s a studio stage animates after the last click, then the frame holds
const STAGES = ['White', 'Wire', 'Template', 'Mask', 'Content'];
// The room at night is ~20x dimmer than the projector's image (a 1000 lm compact over 0.87 m^2 is ~1100 lux on the
// head; a lamp-lit room 20-50 lux; unmeasured), so the projected light is computed from albedo, not from the baked texel
const ALBEDO_K = 20;
const AMBIENT_S = 0.030;        // content redraws at most every 30 ms (main.js AMBIENT_MS)
const STACK_STYLE = `.pm-stack { position: fixed; top: max(16px, env(safe-area-inset-top, 0px)); left: max(16px, env(safe-area-inset-left, 0px));
  display: flex; gap: 2px; padding: 3px; border-radius: 999px; background: rgba(20, 17, 15, .62); border: 1px solid rgba(239, 230, 218, .16); }
.pm-stack[hidden] { display: none; }
.pm-stack button { font: inherit; font-size: 12px; line-height: 1; color: var(--muted, #b9ab98); background: none; border: 0;
  border-radius: 999px; padding: 8px 10px; min-height: 32px; cursor: pointer; }
.pm-stack button:hover { color: var(--ink, #efe6da); }
.pm-stack button[aria-pressed="true"] { color: #14110f; background: var(--ink, #efe6da); }
.pm-stack button:focus-visible { outline: 2px solid var(--accent, #e3a35b); outline-offset: 1px; }
@media (pointer: coarse) { .pm-stack button { min-height: 44px; padding: 8px 9px; font-size: 11px; } }
.gate .pm-stack { display: none; }`;

const SHADER_HEAD = `
uniform mat4 uProjVP; uniform vec3 uProjPos; uniform float uOn; uniform float uExpose; uniform vec3 uPat; uniform vec3 uLight;
uniform float uR0; uniform float uCut; uniform vec3 uVaseAxis; uniform float uVaseH; uniform float uVaseY0;
uniform float uProfile[17];
#ifdef LIVE_MAP
uniform sampler2D uContent; uniform sampler2D uDepthMap; uniform float uMap; uniform float uDMax; uniform float uAlbedoK;
float liveUnpack(vec4 c) { return (c.r * 255.0 * 256.0 + c.g * 255.0) / 65535.0; }
// 1 where the point P is the first surface the lens sees along its ray (or in front of it), 0 in its shadow;
// slope-scaled bias b (m)
float liveDepthVis(vec3 P, vec2 ndc, float b) {
  float stored = liveUnpack(texture2D(uDepthMap, ndc * 0.5 + 0.5)) * uDMax;
  return 1.0 - smoothstep(b, b + 0.006, length(P - uProjPos) - stored);
}
#endif
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
  vec3 g = vec3(liveGray(ndc, fw));
  float reach = e.x * e.y * uOn * min(1.0, uR0 * uR0 / (r * r));
#ifdef LIVE_MAP
  // content is generated linear in the target (no sRGB decode); the depth map is the occlusion
  if (uMap > 0.5) g = texture2D(uContent, ndc * 0.5 + 0.5).rgb;
  reach *= liveDepthVis(vLiveW, ndc, 0.004 + 0.012 * (1.0 - cosT));
#elif defined(LIVE_SHADOW)
  reach *= liveVaseShadow(vLiveW);
#endif
  // the same shoulder as the other live layers: the white reference frame on the white vase rolls off
  // instead of clipping (0.15 % of the hero clipped at 1440x900 during the scan)
#ifdef LIVE_MAP
  // the head's room: the bake has no projector light in it, so the projected light is albedo x irradiance, with the
  // albedo read back from the baked texel at the room's own light level (texel = albedo x E_room, E_room ~ 1/uAlbedoK)
  return shoulder(base * (1.0 - uExpose * reach) + min(base * uAlbedoK, vec3(0.9)) * uLight * g * cosT * reach);
#else
  return shoulder(base * (1.0 - uExpose * reach) + base * uLight * g * cosT * reach);
#endif
}
`;

function patch(mat, uniforms, defines) {
  mat.defines = { ...(mat.defines || {}), ...Object.fromEntries(defines.map((k) => [k, ''])) };
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
  mat.customProgramCacheKey = () => `live-projector-${defines.join('-')}`;
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


// The media server: one fullscreen pass in projector image space. Modes (the studio layer stack): 0 white, 1 wire,
// 2 template, 3 mask, 4 content. Content mixes three looks by weight (uW). Every pixel knows the surface it lands on:
// the depth map gives the distance along its ray, so position and normal come free (no mesh, no extra pass).
const CONTENT_FRAG = /* glsl */`
precision highp float;
uniform sampler2D uDepthMap; uniform float uDMax, uTime, uMode, uFade, uHeadY, uHeadH;
uniform vec3 uW; uniform vec3 uProjPos, uRight, uUp, uFwd; uniform vec2 uTan, uTexel, uHeadC;
varying vec2 vUv;
float unpack(vec4 c) { return (c.r * 255.0 * 256.0 + c.g * 255.0) / 65535.0; }
vec3 ray(vec2 uv) { return normalize(uFwd + (uv.x * 2.0 - 1.0) * uTan.x * uRight + (uv.y * 2.0 - 1.0) * uTan.y * uUp); }
float dist(vec2 uv) { return unpack(texture2D(uDepthMap, uv)) * uDMax; }
vec3 hsv(float h, float s, float v) { vec3 k = clamp(abs(fract(h + vec3(0.0, 2.0, 1.0) / 3.0) * 6.0 - 3.0) - 1.0, 0.0, 1.0); return v * mix(vec3(1.0), k, s); }
float hash(float n) { return fract(sin(n) * 43758.5453); }
float noise(float x) { float i = floor(x), f = fract(x); return mix(hash(i), hash(i + 1.0), f * f * (3.0 - 2.0 * f)); }
float line(float x, float w) { return smoothstep(0.5 - w, 0.5 - w * 0.4, abs(fract(x) - 0.5)); }   // 1 on the integers, w wide
// a figure in the procession, side on: body, head, an arm raising a jar (Republic 514b-515a: men carrying vessels
// and figures past the fire); p in image units (aspect-corrected), feet at the origin, height ~1
float sdCapsule(vec2 p, vec2 a, vec2 b, float r) { vec2 pa = p - a, ba = b - a; return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0)) - r; }
float figure(vec2 p, float ph) {
  float sw = sin(ph) * 0.12;
  float d = sdCapsule(p, vec2(0.0, 0.45), vec2(0.02, 0.78), 0.11);              // torso
  d = min(d, length(p - vec2(0.05, 0.93)) - 0.085);                              // head
  d = min(d, sdCapsule(p, vec2(0.0, 0.42), vec2(sw, 0.0), 0.05));               // legs
  d = min(d, sdCapsule(p, vec2(0.0, 0.42), vec2(-sw, 0.0), 0.05));
  d = min(d, sdCapsule(p, vec2(0.03, 0.74), vec2(0.16, 1.05), 0.035));          // arm up
  d = min(d, length((p - vec2(0.18, 1.17)) * vec2(1.0, 0.8)) - 0.09);          // the jar on it
  return d;
}
void main() {
  vec2 uv = vUv;
  float d = dist(uv);
  float hit = step(d, uDMax * 0.998);
  vec3 rd = ray(uv), P = uProjPos + rd * d;
  float h = (P.y - uHeadY) / uHeadH;                     // 0 at the socle's foot, 1 at the crown
  float head = hit * step(-0.004, h);
  // normal from the neighbouring texels; facing the lens where a neighbour misses (the silhouette)
  vec2 ex = vec2(uTexel.x, 0.0), ey = vec2(0.0, uTexel.y);
  float dx = dist(uv + ex), dy = dist(uv + ey);
  vec3 N = -rd;
  float edge = 0.0;
  if (hit > 0.5) {
    if (dx < uDMax * 0.998 && dy < uDMax * 0.998 && abs(dx - d) < 0.02 && abs(dy - d) < 0.02)
      N = normalize(cross(ray(uv + ey) * dy - rd * d, ray(uv + ex) * dx - rd * d));
    edge = step(0.02, max(abs(dx - d), abs(dy - d))) + step(uDMax * 0.998, max(dx, dy));
  }
  if (dot(N, rd) > 0.0) N = -N;
  vec3 c = vec3(0.0);
  if (uMode < 0.5) c = vec3(1.0);
  else if (uMode < 1.5) {                                // wire: rings and meridians drawn by light over the form, its outline
    vec2 r = P.xz - uHeadC;
    float l = max(line(h * 18.0, 0.09), line(atan(r.x, r.y) / 6.2831853 * 32.0, 0.09)) * head;
    c = vec3(0.75, 0.95, 1.0) * max(l, min(edge, 1.0) * hit);
  } else if (uMode < 2.5) {                              // template: the pixel map, 16 x 9 cells, numbered by colour
    vec2 g = uv * vec2(16.0, 9.0), cell = floor(g);
    float chk = mod(cell.x + cell.y, 2.0);
    c = mix(vec3(uv.x, uv.y, 0.55), vec3(0.08), 0.55 * chk);
    float gl = max(line(g.x, 0.04), line(g.y, 0.04));
    vec2 cc = (uv - 0.5) * vec2(16.0 / 9.0, 1.0);
    float ring = 1.0 - smoothstep(0.003, 0.006, abs(length(cc) - 0.4));
    float cross_ = (1.0 - smoothstep(0.0015, 0.003, abs(cc.x))) + (1.0 - smoothstep(0.0015, 0.003, abs(cc.y)));
    c = mix(c, vec3(1.0), clamp(gl + ring + cross_, 0.0, 1.0));
  } else if (uMode < 3.5) {                              // mask: the head white, the plinth grey, the rest black
    c = vec3(head + 0.35 * (hit - head));
  } else {
    float t = uTime;
    // 1. contours: iso-height rings sweep up the form, a bright front and fading lines behind it
    float s = fract(t / 3.5) * 1.5 - 0.25;
    float rings = line(h * 40.0, 0.12);
    float front = exp(-abs(h - s) * 28.0), trail = exp(-max(s - h, 0.0) * 5.0) * step(h, s);
    vec3 cA = head * (hsv(0.52 + 0.35 * h, 0.8, 1.0) * rings * (0.25 + 0.95 * trail) + vec3(1.0) * front * 0.9);
    cA += vec3(0.6, 0.85, 1.0) * edge * hit * 0.5;
    // 2. wash: hue by the normal's direction and height, turning slowly; a soft white key sliding across
    float hue = atan(N.x, N.z) / 6.2831853 + 0.6 * h + 0.05 * t;
    vec3 cB = head * hsv(hue, 0.78, 0.95) * (0.65 + 0.35 * sin(t * 0.9 + N.y * 3.0));
    cB += head * vec3(1.0) * 0.35 * exp(-pow((uv.x - fract(t / 5.0) * 1.4 + 0.2) * 6.0, 2.0));
    cB += (1.0 - head) * hit * hsv(hue + 0.5, 0.6, 0.12);
    // 3. the cave: firelight from below flickering over everything, and the shadows of figures carried past it
    float fl = 0.62 + 0.22 * noise(t * 7.0) + 0.12 * noise(t * 17.0 + 3.0);
    vec3 fire = vec3(1.0, 0.52, 0.18) * fl * (0.55 + 0.45 * (1.0 - uv.y));
    vec2 a = vec2(uv.x * 16.0 / 9.0, uv.y);
    float sh = 0.0;
    for (int i = 0; i < 3; i++) {
      float fi = float(i), x = mod(-(t * 0.07) + fi * 0.62, 1.9) - 0.15;
      float sc = 0.42 + 0.06 * fi;
      vec2 p = (a - vec2(x, 0.12 + 0.03 * fi)) / sc;
      float fd = figure(vec2(-p.x, p.y), t * 2.4 + fi * 2.0);
      sh = max(sh, 1.0 - smoothstep(-0.02, 0.06, fd));      // soft: a fire is a big source
    }
    vec3 cC = fire * (1.0 - 0.88 * sh);
    c = uW.x * cA + uW.y * cB + uW.z * cC;
  }
  gl_FragColor = vec4(c * uFade * 0.75, 1.0);   // the media server's master: white at 0.75 keeps the plaster off the shoulder
}`;

export default async function mount(live) {
  const { THREE, byName, camera, renderer } = live;
  const proj = byName('projector'), target = byName('plato') ?? byName('scan_target');
  const d = proj?.userData, v = target?.userData;
  if (!d?.projector_cam_pos || !(v?.vase_profile || v?.scan_center)) return null;
  // the head: projection mapping on top of the scan (WebGL2: derivatives and float precision in the content pass)
  const mapping = target.name === 'plato' && renderer.capabilities.isWebGL2;

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
  const y0 = v.scan_y0 ?? v.vase_y0;
  const axis = new THREE.Vector3(0, y0, 0).applyMatrix4(target.matrixWorld);
  const center = new THREE.Vector3(...(v.scan_center ?? v.vase_center)).applyMatrix4(target.matrixWorld);

  const U = {
    uProjVP: { value: vp }, uProjPos: { value: pos }, uOn: { value: 0 }, uPat: { value: new THREE.Vector3(-1, 0, BITS) },
    uLight: { value: new THREE.Vector3(...LIGHT) }, uExpose: { value: EXPOSE }, uR0: { value: pos.distanceTo(center) }, uCut: { value: 9 },
    uVaseAxis: { value: axis }, uVaseH: { value: v.vase_h ?? 1 }, uVaseY0: { value: y0 }, uProfile: { value: v.vase_profile ?? new Array(17).fill(0) },
    uMap: { value: 0 }, uDMax: { value: DMAX }, uAlbedoK: { value: ALBEDO_K }, uContent: { value: null }, uDepthMap: { value: null },
  };

  // Projection mapping: the depth map (once) and the content target.
  let depthRT = null, contentRT = null, cmat = null, cscene = null, ccam = null;
  if (mapping) {
    depthRT = new THREE.WebGLRenderTarget(DEPTH, DEPTH, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false });
    const dmat = new THREE.ShaderMaterial({
      side: THREE.DoubleSide, uniforms: { uProjPos: U.uProjPos, uDMax: U.uDMax },
      vertexShader: `varying vec3 vW; void main() { vW = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0); }`,
      fragmentShader: `uniform vec3 uProjPos; uniform float uDMax; varying vec3 vW;
        void main() { float q = floor(clamp(length(vW - uProjPos) / uDMax, 0.0, 1.0) * 65535.0 + 0.5);
          gl_FragColor = vec4(floor(q / 256.0) / 255.0, mod(q, 256.0) / 255.0, 0.0, 1.0); }`,
    });
    const dscene = new THREE.Scene();
    for (const o of [target, byName('at_plinth')].filter(Boolean)) {
      const m = new THREE.Mesh(o.geometry, dmat);
      m.matrixAutoUpdate = false;
      m.matrix.copy(o.matrixWorld);
      dscene.add(m);
    }
    const dcam = pcam.clone();
    dcam.near = 0.2; dcam.far = 6;
    dcam.updateProjectionMatrix();
    const prev = renderer.getRenderTarget(), cc = renderer.getClearColor(new THREE.Color()), ca = renderer.getClearAlpha();
    renderer.setRenderTarget(depthRT);
    renderer.setClearColor(0xffff00, 1);      // packs to 1.0: nothing there, the far end
    renderer.clear();
    renderer.render(dscene, dcam);
    renderer.setRenderTarget(prev);
    renderer.setClearColor(cc, ca);
    dmat.dispose();

    contentRT = new THREE.WebGLRenderTarget(CW, CH, { depthBuffer: false, generateMipmaps: false });
    const m = pcam.matrixWorld.elements;
    const box = new THREE.Box3().setFromObject(target);
    cmat = new THREE.ShaderMaterial({
      depthTest: false, depthWrite: false,
      uniforms: { uDepthMap: { value: depthRT.texture }, uDMax: U.uDMax, uTime: { value: 0 }, uMode: { value: 4 }, uFade: { value: 1 },
        uW: { value: new THREE.Vector3(1, 0, 0) }, uHeadY: { value: box.min.y }, uHeadH: { value: box.max.y - box.min.y },
        uHeadC: { value: new THREE.Vector2(center.x, center.z) },
        uProjPos: U.uProjPos, uRight: { value: new THREE.Vector3(m[0], m[1], m[2]) }, uUp: { value: new THREE.Vector3(m[4], m[5], m[6]) },
        uFwd: { value: new THREE.Vector3(-m[8], -m[9], -m[10]) },
        uTan: { value: new THREE.Vector2(Math.tan(hf / 2), Math.tan(hf / 2) / d.projector_cam_aspect) },
        uTexel: { value: new THREE.Vector2(1 / DEPTH, 1 / DEPTH) } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: CONTENT_FRAG,
    });
    cscene = new THREE.Scene();
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), cmat);
    quad.frustumCulled = false;
    cscene.add(quad);
    ccam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    U.uContent.value = contentRT.texture;
    U.uDepthMap.value = depthRT.texture;
  }
  const drawContent = () => {
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(contentRT);
    renderer.render(cscene, ccam);
    renderer.setRenderTarget(prev);
  };

  // Receivers: every baked mesh inside the projector's frustum (any layout), the target with its dissolve.
  const reachCam = pcam.clone();
  reachCam.far = U.uR0.value * 3;
  reachCam.updateProjectionMatrix();
  const reach = new THREE.Frustum().setFromProjectionMatrix(
    new THREE.Matrix4().multiplyMatrices(reachCam.projectionMatrix, reachCam.matrixWorldInverse));
  const box = new THREE.Box3();
  const receivers = [];
  const occ = mapping ? 'LIVE_MAP' : 'LIVE_SHADOW';
  live.scene.traverse((o) => {
    if (!o.isMesh || !o.material?.map || o === proj) return;
    if (o === target) receivers.push([o, mapping ? ['LIVE_VASE', 'LIVE_MAP'] : ['LIVE_VASE']]);
    else if (reach.intersectsBox(box.setFromObject(o))) receivers.push([o, [occ]]);
  });
  for (const [o, defs] of receivers) patch(o.material, U, defs);

  // The beam in haze: the frustum from the lens to just past the target, ray-marched (32 steps) in one
  // additive pass, so the Gray-code planes show as sheets of light while they travel (and the content as colour).
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
    // back faces, depth-tested: where a surface stands in front of the beam's far side (the plant, the target)
    // the beam is not painted over it; the march runs from the back face toward the eye
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide,
    defines: mapping ? { LIVE_MAP: '' } : {},
    uniforms: { ...U, uHaze: { value: HAZE }, uFar: { value: far }, uAxis: { value: dir.clone() }, uSpan: { value: far * 1.2 } },
    vertexShader: `varying vec3 vLiveW; varying vec3 vLiveL;
      void main() { vLiveW = (modelMatrix * vec4(position, 1.0)).xyz; vLiveL = position;
        gl_Position = projectionMatrix * viewMatrix * vec4(vLiveW, 1.0); }`,
    fragmentShader: SHADER_HEAD + `uniform float uHaze, uFar, uSpan; uniform vec3 uAxis;
      void main() {
        vec3 rd = normalize(vLiveW - cameraPosition);
        float dt = uSpan / 32.0;
        vec3 acc = vec3(0.0);
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
          vec3 g = vec3(liveGray(ndc, uPat.y > 1.5 ? dn.y : dn.x));
#ifdef LIVE_MAP
          if (uMap > 0.5) g = texture2D(uContent, ndc * 0.5 + 0.5).rgb;
          float sh = liveDepthVis(p, ndc, 0.003);
#else
          float sh = liveVaseShadow(p);
#endif
          acc += g * inside.x * inside.y * sh * min(4.0, uR0 * uR0 / (r * r));
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
  // The point cloud, node-local in the target (sorted by projector row in build.py).
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

  // the projector-row range the target spans: the dissolve sweeps across it
  const tmp = new THREE.Vector3();
  let yLo = Infinity, yHi = -Infinity;
  const pa = geometry.attributes.position;
  for (let i = 0; i < pa.count; i += 7) {
    tmp.fromBufferAttribute(pa, i).applyMatrix4(target.matrixWorld).applyMatrix4(vp);
    yLo = Math.min(yLo, tmp.y); yHi = Math.max(yHi, tmp.y);
  }
  const cutTop = yHi + 0.06, cutBottom = yLo - 0.06;

  // Timeline: stripes, gap, dissolve, hold, settle; on the head then the mapping show.
  const frames = [[-1, 0, T_REF[0]], [-2, 0, T_REF[1]]];
  // column planes, then row planes (both, for a full projector-camera correspondence); a row plane
  // seen from the side is a sheet of light in the haze. pattern = [bit, inverse + 2 * rows, s]
  for (const rows of [0, 2]) for (let b = 0; b < BITS; b++) frames.push([b, rows, T_FRAME], [b, rows + 1, T_FRAME]);
  const tStripes = frames.reduce((s, f) => s + f[2], 0);
  const tDis = tStripes + T_GAP, tHold = tDis + T_DISSOLVE, tSettle = tHold + T_HOLD, tScanEnd = tSettle + T_SETTLE;
  const tMap = tScanEnd + T_GAP, tMapLen = T_MAP_IN + LOOKS * T_LOOK + T_MAP_OUT;
  const tEnd = mapping ? tMap + tMapLen : tScanEnd;

  const reduce = () => live.reduceMotion.matches;
  let clock = 0, t = -1, autostarted = live.gate, view = live.view(), lastKey = '';
  // the studio layer stack (Projector view): stage index, its own clock, -1 when off
  let stage = -1, stageT = 0, sinceDraw = 1, contentDirty = true;
  // 'room:scan' tells the page a scan began (main.js offers the close-up when it starts in the overview)
  const start = () => { if (t < 0 && !reduce()) { stage = -1; setStage(-1); t = 0; dispatchEvent(new CustomEvent('room:scan')); } };

  // look weights for content time u (s): each look holds, then crossfades into the next over its last second
  function looks(u) {
    const k = Math.max(0, u) / T_LOOK, i = Math.floor(k) % LOOKS, f = THREE.MathUtils.smoothstep(k % 1, 1 - 1 / T_LOOK, 1);
    const w = [0, 0, 0];
    w[i] += 1 - f; w[(i + 1) % LOOKS] += f;
    return { w, i };
  }
  let mapInfo = { mode: null, look: null };
  function apply() {
    let on = 0, pat = [-1, 0], cut = 9, fade = 0, phase = 'idle', map = 0, mode = 4, mfade = 1, u = 0, animate = false;
    if (t >= 0 && t < tStripes) {
      let s = t;
      const f = frames.find((x) => (s -= x[2]) < 0);
      on = 1; pat = f; phase = `stripes ${frames.indexOf(f)}`;
    } else if (t >= tDis && t < tScanEnd) {
      fade = 1;
      if (t < tHold) { cut = cutTop + (cutBottom - cutTop) * easeInOut((t - tDis) / T_DISSOLVE); phase = 'dissolve'; }
      else if (t < tSettle) { cut = cutBottom; phase = 'cloud'; }
      else { cut = cutBottom + (cutTop - cutBottom) * easeInOut((t - tSettle) / T_SETTLE); phase = 'settle'; }
    } else if (mapping && t >= tMap && t < tEnd) {
      u = t - tMap;
      on = 1; map = 1; animate = true;
      mfade = Math.min(1, u / T_MAP_IN, (tMapLen - u) / T_MAP_OUT);
      phase = `map ${looks(u - T_MAP_IN).i}`;
    } else if (mapping && stage >= 0 && view === 'projector') {
      on = 1; map = 1; mode = stage; phase = `studio ${STAGES[stage].toLowerCase()}`;
      u = stage === 4 ? Math.min(stageT, STUDIO_HOLD) : 0;   // a still stage, or the held content frame: no redraws
      animate = stage === 4 && stageT < STUDIO_HOLD && !reduce();
    } else if (t < 0 && reduce() && view === 'projector') {
      if (mapping) { on = 1; map = 1; u = T_LOOK * 1.4; phase = 'static'; }   // one still content frame (the wash)
      else { on = 1; pat = [3, 0]; phase = 'static'; }      // reduced motion: one bit plane, still
    }
    U.uOn.value = on; U.uPat.value.set(pat[0], pat[1], BITS); U.uCut.value = cut; U.uMap.value = map;
    pm.uniforms.uFade.value = fade;
    cloud.visible = fade > 0;
    beam.visible = on > 0 && !reduce();
    beamMat.uniforms.uHaze.value = HAZE * (mapping ? HEAD_HAZE : 1) * (map ? MAP_HAZE : 1);
    if (map) {
      const lw = looks(u - (phase.startsWith('map') ? T_MAP_IN : 0));
      const cu = cmat.uniforms;
      const key = `${mode}|${mfade.toFixed(3)}|${lw.w}|${u.toFixed(3)}`;
      if (key !== cu.__key) {
        cu.__key = key; contentDirty = true;
        cu.uMode.value = mode; cu.uFade.value = Math.max(0, mfade); cu.uTime.value = u; cu.uW.value.set(...lw.w);
      }
      mapInfo = { mode: STAGES[mode].toLowerCase(), look: mode === 4 ? ['contours', 'wash', 'cave'][lw.i] : null };
    } else mapInfo = { mode: null, look: null };
    const key = `${on}|${pat[0]}|${pat[1]}|${cut.toFixed(4)}|${map}|${mode}`;
    const changed = key !== lastKey || animate;
    lastKey = key;
    return { changed, phase, map };
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
    if (stage >= 0) stageT += dt;
    sinceDraw += dt;
    const r = apply();
    phase = r.phase;
    return r;
  }
  // redraw the content target when its uniforms moved, at most every AMBIENT_S (the scene draws at ~30 Hz)
  function flush(force) {
    if (!mapping || !U.uMap.value || !contentDirty || (!force && sinceDraw < AMBIENT_S)) return false;
    drawContent();
    contentDirty = false; sinceDraw = 0;
    return true;
  }

  // The studio layer stack: what a mapping studio shows a client, step by step (Projector view only).
  const bar = mapping && !live.gate ? document.createElement('div') : null;
  const buttons = [];
  function setStage(i) {
    stage = i; stageT = 0;
    buttons.forEach((b, k) => b.setAttribute('aria-pressed', String(k === i)));
    live.render();
  }
  if (bar) {
    const style = document.createElement('style');
    style.textContent = STACK_STYLE;
    document.head.appendChild(style);
    bar.className = 'pm-stack';
    bar.setAttribute('role', 'group');
    bar.setAttribute('aria-label', 'Projection mapping, layer by layer');
    bar.hidden = view !== 'projector';
    STAGES.forEach((label, i) => {
      const b = Object.assign(document.createElement('button'), { type: 'button', textContent: label });
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', () => { t = -1; setStage(stage === i ? -1 : i); });
      buttons.push(b);
      bar.appendChild(b);
    });
    document.body.appendChild(bar);
    addEventListener('resize', () => place());
  }
  // on a phone the name card sits at the top: the stack goes under it (on desktop the card is at the bottom)
  function place() {
    if (!bar || bar.hidden) return;
    const cap = document.querySelector('.caption')?.getBoundingClientRect();
    bar.style.top = cap && cap.top < innerHeight / 3 ? `${Math.round(cap.bottom + 8)}px` : '';
  }

  return {
    name: 'projector',
    update(dt) {
      if (cloud.visible) pm.uniforms.uPx.value = renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
      const r = step(live.gate ? 0 : dt);   // ?gate: the clock moves only through api.advance
      const drew = flush(false);
      return r.changed || drew;
    },
    onView(id) {
      view = id;
      if (bar) { bar.hidden = id !== 'projector'; place(); }
      if (id !== 'projector' && stage >= 0) setStage(-1);
      if (id === 'projector' || id === 'experiment') start();
      live.render();
    },
    api: {
      start() { t = 0; setStage(-1); live.render(); },
      // the studio stack: 0 white, 1 wire, 2 template, 3 mask, 4 content; -1 off (the gates and the buttons)
      stage(i) { if (!mapping) return null; t = -1; setStage(i); step(0); flush(true); return phase; },
      advance(sec, h = 1 / 60) { let n = Math.round(sec / h); while (n-- > 0) step(h); flush(true); live.render(); return phase; },
      info: () => ({ phase, running: t >= 0, t, tEnd, frames: frames.length, bits: BITS, points: count, cloudVisible: cloud.visible,
        camera: d.projector_mv_pos ? camPos.toArray().map((x) => +x.toFixed(4)) : null, baseline: d.projector_mv_baseline ?? null,
        mapping, map: mapInfo, target: target.name, content: mapping ? [CW, CH] : null, depth: mapping ? DEPTH : null }),
    },
  };
}
