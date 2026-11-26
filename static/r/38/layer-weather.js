import { noPick, inView } from './layer-common.js';

const LAT = 52.3728, LON = 4.8936;
const READOUT_KEY = 'room.weather.readout';
const FACADE = 163;
const RIGHT = FACADE + 90;
const SHELTER = 0.5;
const MOON_R = 380;
const MOON_DIAM = 0.518;
const SKY_Y = -6;
const SLIGHT = { mmh: 1.0, cloud: 0.92 };

const PRESETS = {
  dry: { mmh: 0 }, slight: { mmh: SLIGHT.mmh }, light: { mmh: 1.8 }, moderate: { mmh: 5 }, heavy: { mmh: 12 },
  storm: { mmh: 22, windSpeed: 17, windFrom: 235, cloud: 1 }, clear: { cloud: 0 }, overcast: { cloud: 1 },
};

export default function mount(live) {
  const { THREE, byName, camera } = live;
  const node = byName('cz_canal_night');
  if (!node) return null;

  const nowParam = live.params.get('now');
  const now = () => (nowParam && !isNaN(Date.parse(nowParam)) ? new Date(nowParam) : new Date());
  const mp = (live.params.get('moon') ?? '').split(',').map(Number);
  const moonAt = mp.length === 2 && mp.every(Number.isFinite) ? { az: mp[0], alt: mp[1] } : null;
  let real = null, source = 'fallback', shown = !live.gate;

  const size = MOON_R * Math.tan((MOON_DIAM * Math.PI) / 360) * 2;
  const HALO = 7;
  const moonMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uSun: { value: new THREE.Vector3(0, 0, 1) }, uCloud: { value: 0.9 }, uTime: { value: 0 },
      uWind: { value: new THREE.Vector2(1, 0) }, uFrac: { value: 0.5 } },
    vertexShader: `varying vec2 vQ; void main() { vQ = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 uSun; uniform float uCloud, uTime, uFrac; uniform vec2 uWind; varying vec2 vQ;
      float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + 1.0), f.x), f.y); }
      void main() {
        vec2 q = vQ;                                              // geometry in disc radii
        float r2 = dot(q, q);
        // clouds: two octaves drifting with the wind, the cover fraction sets how much is gap
        vec2 c = q * 0.05 + uWind * uTime * 0.004;
        float n = 0.65 * n2(c) + 0.35 * n2(c * 2.7 + 5.0);
        float gap = smoothstep(uCloud - 0.06, uCloud + 0.10, n);
        float veil = mix(0.18, 1.0, gap);                         // thin cloud still lets a glow through
        // the disc: a sphere lit by the sun direction (disc frame: x right, y up, z towards the viewer)
        float disc = 0.0, lit = 0.0;
        if (r2 < 1.0) {
          vec3 nrm = vec3(q, sqrt(1.0 - r2));
          lit = smoothstep(-0.03, 0.05, dot(nrm, uSun));
          float maria = 0.82 + 0.18 * n2(q * 2.3 + 1.7);            // soft darker seas, no texture
          disc = lit * maria * smoothstep(1.0, 0.94, r2);
        }
        float earthshine = r2 < 1.0 ? 0.035 : 0.0;
        float halo = exp(-max(r2 - 1.0, 0.0) * 0.55) * 0.22 * uFrac * (1.0 - step(r2, 1.0) * 0.6);
        float a = clamp((disc + earthshine) * gap + halo * veil, 0.0, 1.0);
        vec3 col = mix(vec3(0.70, 0.74, 0.82), vec3(1.0, 0.97, 0.90), clamp(disc, 0.0, 1.0));
        gl_FragColor = vec4(col, a);
      }`,
  });
  const moon = noPick(new THREE.Mesh(new THREE.PlaneGeometry(2 * HALO, 2 * HALO), moonMat));
  moon.name = 'weather_moon';
  moon.renderOrder = 1;
  moon.visible = false;
  node.add(moon);

  const dir = (az, alt) => {
    const a = (alt * Math.PI) / 180, ch = Math.cos(a);
    return new THREE.Vector3(ch * Math.cos(((az - RIGHT) * Math.PI) / 180), Math.sin(a), -ch * Math.cos(((az - FACADE) * Math.PI) / 180));
  };

  let params = null, moonPos = null;
  function placeMoon() {
    const t = now(), m = moonAt ?? moonPosition(t, LAT, LON), s = sunPosition(t, LAT, LON), il = moonIllumination(t);
    moonPos = { alt: m.alt, az: m.az, fraction: il.fraction, phase: il.phase, name: phaseName(il.phase) };
    const D = dir(m.az, m.alt), S = dir(s.az, s.alt);
    const R = new THREE.Vector3().crossVectors(D, new THREE.Vector3(0, 1, 0)).normalize();
    const U = new THREE.Vector3().crossVectors(R, D);
    const Z = D.clone().negate();
    moon.matrixAutoUpdate = false;
    const k = size / 2;
    moon.matrix.makeBasis(R.clone().multiplyScalar(k), U.clone().multiplyScalar(k), Z.clone().multiplyScalar(k)).setPosition(D.clone().multiplyScalar(MOON_R).add(new THREE.Vector3(0, SKY_Y, 0)));
    moon.matrixWorldNeedsUpdate = true;
    moonMat.uniforms.uSun.value.set(S.dot(R), S.dot(U), S.dot(Z));
    moonMat.uniforms.uFrac.value = il.fraction;
  }

  function compose() {
    placeMoon();
    const tok = hashTokens();
    const base = real && real.mmh >= 0.1 ? { mmh: real.mmh } : { mmh: SLIGHT.mmh };
    const w = {
      mmh: base.mmh, cloud: real ? real.cloud : SLIGHT.cloud, windSpeed: real ? real.windSpeed : 3, windFrom: real ? real.windFrom : 225,
      tempC: real ? real.tempC : null,
    };
    for (const k of tok) Object.assign(w, PRESETS[k]);
    if (w.mmh > 0 && !tok.includes('clear')) w.cloud = Math.max(w.cloud, 0.6);
    const level = w.mmh <= 0 ? 'dry' : w.mmh < 1.2 ? 'slight' : w.mmh < 2.5 ? 'light' : w.mmh < 10 ? 'moderate' : 'heavy';
    const d0 = 0.89 * Math.pow(Math.max(w.mmh, 0.1), 0.21);
    const fall = 9.65 - 10.3 * Math.exp(-0.6 * d0);
    const toward = w.windFrom + 180, u = w.windSpeed * SHELTER;
    const vx = u * Math.cos(((toward - RIGHT) * Math.PI) / 180);
    params = {
      level, mmh: w.mmh, rain: level === 'dry' ? 0 : +Math.min(4, Math.max(1, Math.sqrt(w.mmh / SLIGHT.mmh))).toFixed(3),
      wet: level === 'dry' ? 0.45 : +Math.min(1.8, 0.8 + 0.2 * Math.sqrt(w.mmh / SLIGHT.mmh)).toFixed(3), rivulets: level !== 'dry',
      fall: +fall.toFixed(2), slantX: +Math.max(-1.2, Math.min(1.2, vx / fall)).toFixed(3),
      towardGlass: +(-u * Math.cos(((toward - FACADE) * Math.PI) / 180)).toFixed(2),
      cloud: w.cloud, tempC: w.tempC, windSpeed: w.windSpeed, windFrom: w.windFrom,
      moon: { ...moonPos, visible: moonPos.alt > -0.5 && w.cloud < 0.98 },
      real, source, tokens: tok,
    };
    moonMat.uniforms.uCloud.value = Math.min(0.97, w.cloud);
    const tw = ((toward - RIGHT) * Math.PI) / 180;
    moonMat.uniforms.uWind.value.set(Math.cos(tw), Math.sin(tw)).multiplyScalar(Math.max(0.5, w.windSpeed));
    live.weather = params;
    window.dispatchEvent(new CustomEvent('room:weather', { detail: params }));
    sync(); readout(); live.render();
  }

  function sync() { moon.visible = shown && !!params?.moon.visible; }

  let box = null, pill = null, open = innerWidth > 640;
  try { const v = localStorage.getItem(READOUT_KEY); if (v) open = v === 'open'; } catch {   }
  function placePill() {
    const c = document.querySelector('.controls') ?? document.querySelector('.sound');
    const r = c?.getBoundingClientRect();
    box.style.top = r?.height ? `${Math.round(r.bottom + 6)}px` : 'max(16px, env(safe-area-inset-top, 0px))';
  }
  function readout() {
    if (live.gate) return;
    if (!pill) {
      box = document.createElement('div');
      box.className = 'weather-readout';
      Object.assign(box.style, { position: 'fixed', top: '50px', right: 'max(16px, env(safe-area-inset-right, 0px))', zIndex: 5,
        maxWidth: 'calc(100vw - 32px)', display: 'flex', justifyContent: 'flex-end' });
      pill = document.createElement('button');
      pill.type = 'button'; pill.className = 'weather';
      Object.assign(pill.style, { font: 'inherit', fontSize: '11.5px', lineHeight: '1.2',
        color: 'var(--muted, #b9ab98)', background: 'rgba(20, 17, 15, .45)', border: '1px solid rgba(239, 230, 218, .12)',
        borderRadius: '999px', padding: '5px 10px', cursor: 'pointer', opacity: '0.7', maxWidth: '100%',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' });
      box.appendChild(pill);
      addEventListener('resize', placePill);
      requestAnimationFrame(placePill); setTimeout(placePill, 1500);
      pill.addEventListener('click', () => {
        open = !open;
        try { localStorage.setItem(READOUT_KEY, open ? 'open' : 'closed'); } catch {   }
        readout();
      });
      document.body.appendChild(box);
    }
    const m = params.moon.name;
    const words = real ? `${real.words}, ${Math.round(real.tempC)} °C, ${m}` : `${m} (weather unavailable)`;
    const shows = real && params.level !== levelOf(real.mmh) ? ` · room: ${params.level === 'dry' ? 'dry glass' : params.level + ' rain'}` : '';
    const full = `Tonight: ${words}${shows}`;
    pill.textContent = open ? full : real ? `Tonight ${Math.round(real.tempC)} °C` : 'Tonight';
    pill.title = open ? 'Hide' : full;
    pill.setAttribute('aria-expanded', String(open));
    pill.setAttribute('aria-label', full);
  }

  function load() {
    real = seeded(now());
    source = 'seeded';
    compose();
  }
  compose();
  if (!live.gate) load();
  addEventListener('hashchange', () => compose());

  let t = 0, acc = 0;
  return {
    name: 'weather',
    update(dt) {
      if (!moon.visible || live.reduceMotion.matches) return false;
      t += live.gate ? 0 : dt; acc += dt;
      moonMat.uniforms.uTime.value = t;
      if (acc < 0.2) return false;
      acc = 0;
      return inView(camera, moon);
    },
    api: {
      show() { shown = true; sync(); live.render(); return this.info(); },
      set(next) { real = next === null ? null : { ...(real ?? {}), ...next }; source = next === null ? 'fallback' : 'test'; compose(); return this.info(); },
      info() {
        moon.updateMatrixWorld(true);
        const v = new THREE.Vector3().setFromMatrixPosition(moon.matrixWorld).project(camera), el = live.renderer.domElement;
        return { ...params, moonInView: moon.visible && inView(camera, moon),
          moonScreen: v.z < 1 ? [Math.round((v.x + 1) / 2 * el.clientWidth), Math.round((1 - v.y) / 2 * el.clientHeight)] : null };
      },
    },
  };
}

function hashTokens() {
  return location.hash.slice(1).toLowerCase().split(/[,&+;]/).filter((k) => k in PRESETS);
}

function levelOf(mmh) { return mmh < 0.1 ? 'dry' : mmh < 1.2 ? 'slight' : mmh < 2.5 ? 'light' : mmh < 10 ? 'moderate' : 'heavy'; }

function seeded(date) {
  let h = 2166136261;
  for (const ch of date.toISOString().slice(0, 10)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const r = () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
  const mmh = +(0.6 + 1.8 * r()).toFixed(2), cloud = +(0.85 + 0.12 * r()).toFixed(2);
  return { mmh, cloud, tempC: +(6 + 8 * r()).toFixed(1), windSpeed: +(2 + 4 * r()).toFixed(1), windFrom: Math.round(180 + 90 * r()),
    code: null, words: describe(mmh, cloud, null, 0) };
}
function describe(mmh, cloud, code, snow) {
  if (code >= 95) return 'thunderstorm';
  if (mmh >= 0.1) {
    const kind = (code >= 71 && code <= 77) || code === 85 || code === 86 || snow > 0 ? 'snow' : code >= 51 && code <= 57 ? 'drizzle' : 'rain';
    return `${levelOf(mmh) === 'slight' ? 'light' : levelOf(mmh)} ${kind}`;
  }
  if (code === 45 || code === 48) return 'fog';
  return cloud < 0.2 ? 'clear' : cloud < 0.7 ? 'partly cloudy' : 'overcast, dry';
}

function phaseName(p) {
  return p < 0.03 || p > 0.97 ? 'new moon' : p < 0.22 ? 'waxing crescent' : p < 0.28 ? 'first quarter' : p < 0.47 ? 'waxing gibbous'
    : p < 0.53 ? 'full moon' : p < 0.72 ? 'waning gibbous' : p < 0.78 ? 'last quarter' : 'waning crescent';
}

const RAD = Math.PI / 180, E = RAD * 23.4397, J2000 = 2451545, J1970 = 2440588;
const days = (date) => date.valueOf() / 86400000 - 0.5 + J1970 - J2000;
const ra = (l, b) => Math.atan2(Math.sin(l) * Math.cos(E) - Math.tan(b) * Math.sin(E), Math.cos(l));
const decl = (l, b) => Math.asin(Math.sin(b) * Math.cos(E) + Math.cos(b) * Math.sin(E) * Math.sin(l));
const sidereal = (d, lw) => RAD * (280.16 + 360.9856235 * d) - lw;
function sunCoords(d) {
  const M = RAD * (357.5291 + 0.98560028 * d);
  const L = M + RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M)) + RAD * 102.9372 + Math.PI;
  return { dec: decl(L, 0), ra: ra(L, 0) };
}
function moonCoords(d) {
  const L = RAD * (218.316 + 13.176396 * d), M = RAD * (134.963 + 13.064993 * d), F = RAD * (93.272 + 13.22935 * d);
  const l = L + RAD * 6.289 * Math.sin(M), b = RAD * 5.128 * Math.sin(F);
  return { ra: ra(l, b), dec: decl(l, b), dist: 385001 - 20905 * Math.cos(M) };
}
function horizontal(c, d, lat, lon, refract) {
  const lw = RAD * -lon, phi = RAD * lat, H = sidereal(d, lw) - c.ra;
  let h = Math.asin(Math.sin(phi) * Math.sin(c.dec) + Math.cos(phi) * Math.cos(c.dec) * Math.cos(H));
  if (refract) { const hh = Math.max(h, 0); h += 0.0002967 / Math.tan(hh + 0.00312536 / (hh + 0.08901179)); }
  const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(c.dec) * Math.cos(phi));
  return { alt: h / RAD, az: ((az / RAD + 180) % 360 + 360) % 360 };
}
export function moonPosition(date, lat, lon) { const d = days(date); return horizontal(moonCoords(d), d, lat, lon, true); }
export function sunPosition(date, lat, lon) { const d = days(date); return horizontal(sunCoords(d), d, lat, lon, false); }
export function moonIllumination(date) {
  const d = days(date), s = sunCoords(d), m = moonCoords(d), sd = 149598000;
  const phi = Math.acos(Math.sin(s.dec) * Math.sin(m.dec) + Math.cos(s.dec) * Math.cos(m.dec) * Math.cos(s.ra - m.ra));
  const inc = Math.atan2(sd * Math.sin(phi), m.dist - sd * Math.cos(phi));
  const angle = Math.atan2(Math.cos(s.dec) * Math.sin(s.ra - m.ra), Math.sin(s.dec) * Math.cos(m.dec) - Math.cos(s.dec) * Math.sin(m.dec) * Math.cos(s.ra - m.ra));
  return { fraction: (1 + Math.cos(inc)) / 2, phase: 0.5 + (0.5 * inc * (angle < 0 ? -1 : 1)) / Math.PI };
}
