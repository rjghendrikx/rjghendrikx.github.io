// The real Amsterdam night: on load, the current weather in the city centre (Open-Meteo, no key, one
// fetch per visit, cached 15 min) and the real moon (phase and position, computed here, no API).
// Ruud's art direction is the default: always night, and when the API fails or Amsterdam is dry the
// room shows slight rain. Notes: room/notes/weather.md.
//
// Hook for the other layers: `live.weather` (set at mount, before any fetch) and a window event
// `room:weather` (detail = the same object) on every change. Fields:
//   level      'dry' | 'slight' | 'light' | 'moderate' | 'heavy'  what the room shows
//   mmh        rain rate shown, mm/h
//   rain       streak density multiplier: 0 dry, 1 = layer-rain.js as drawn today (slight), up to 4
//   wet        glass wetness multiplier: 0.45 dry (old drops, no rivulets), 1 slight, up to 1.8
//   rivulets   bool, drops running down the glass
//   fall       m/s, fall speed of the median drop (Marshall-Palmer D0, Atlas 1973 terminal velocity)
//   slantX     horizontal drift per metre of fall along room/glTF +x (layer-rain's WIND)
//   towardGlass  m/s of wind blowing onto the facade (+) or away from it (-)
//   cloud      0..1 cloud cover shown;  tempC, windSpeed (m/s, 10 m), windFrom (deg)
//   moon       { alt, az (deg, compass), fraction (lit 0..1), phase (0 new, .5 full), name, visible }
//   real       what Amsterdam reports ({ mmh, cloud, tempC, words } or null), source 'api'|'cache'|'fallback'
// Testing: #dry #slight #light #moderate #heavy #storm #clear #overcast (combine with commas;
// #debug stays its own), ?now=<ISO time> for the moon, ?moon=az,alt to place it (phase still from now). ?gate: no fetch, nothing shows until api.show().
// One draw call (the moon, only when it is above the horizon and the cover is not total).
import { noPick, inView } from './layer-common.js';

const LAT = 52.3728, LON = 4.8936;          // Amsterdam, Dam square: the city's public coordinates
const API = 'https://api.open-meteo.com/v1/forecast';
const FIELDS = 'temperature_2m,precipitation,rain,showers,snowfall,cloud_cover,wind_speed_10m,wind_direction_10m,weather_code';
const CACHE_KEY = 'room.weather.v1', CACHE_MS = 15 * 60 * 1000, FAIL_MS = 5 * 60 * 1000, TIMEOUT_MS = 4000;
const READOUT_KEY = 'room.weather.readout';
const FACADE = 163;                          // deg, the canal facade faces SSE (notes/canal-house.md); room +y
const RIGHT = FACADE + 90;                   // room +x
const SHELTER = 0.5;                         // wind at the 1st-floor window vs the 10 m value (canal canyon), unmeasured
const MOON_R = 380;                          // m from the room origin, inside the 420 m sky dome
const MOON_DIAM = 0.518;                     // deg, mean apparent diameter
const SKY_Y = -6;                            // glTF y of the sky dome centre (cz_canal_night._sky)
const SLIGHT = { mmh: 1.0, cloud: 0.92 };    // the art-direction fallback: layer-rain.js as drawn

// Test presets (hash tokens): override what the room shows; the readout still says what is real.
const PRESETS = {
  dry: { mmh: 0 }, slight: { mmh: SLIGHT.mmh }, light: { mmh: 1.8 }, moderate: { mmh: 5 }, heavy: { mmh: 12 },
  storm: { mmh: 22, windSpeed: 17, windFrom: 235, cloud: 1 }, clear: { cloud: 0 }, overcast: { cloud: 1 },
};

export default function mount(live) {
  const { THREE, byName, camera } = live;
  const node = byName('cz_canal_night');
  if (!node) return null;                    // other layouts: no outside, no weather

  const nowParam = live.params.get('now');
  const now = () => (nowParam && !isNaN(Date.parse(nowParam)) ? new Date(nowParam) : new Date());
  const mp = (live.params.get('moon') ?? '').split(',').map(Number);              // ?moon=az,alt: test placement
  const moonAt = mp.length === 2 && mp.every(Number.isFinite) ? { az: mp[0], alt: mp[1] } : null;
  let real = null, source = 'fallback', shown = !live.gate;

  // ---- the moon: one billboard, disc lit by the real sun direction, cloud gaps drifting over it ----
  const size = MOON_R * Math.tan((MOON_DIAM * Math.PI) / 360) * 2;      // disc diameter, m (~3.4)
  const HALO = 7;                                                      // quad = 7 discs across
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
  moon.renderOrder = 1;                      // before the reflections (2) and the wet glass (3)
  moon.visible = false;
  node.add(moon);

  // compass az/alt (deg) -> unit vector in the node frame (glTF: x = room x, y = up, z = -room y)
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
    const k = size / 2;                                    // disc radii -> metres
    moon.matrix.makeBasis(R.clone().multiplyScalar(k), U.clone().multiplyScalar(k), Z.clone().multiplyScalar(k)).setPosition(D.clone().multiplyScalar(MOON_R).add(new THREE.Vector3(0, SKY_Y, 0)));
    moon.matrixWorldNeedsUpdate = true;
    moonMat.uniforms.uSun.value.set(S.dot(R), S.dot(U), S.dot(Z));
    moonMat.uniforms.uFrac.value = il.fraction;
  }

  function compose() {
    placeMoon();
    const tok = hashTokens();
    const base = real && real.mmh >= 0.1 ? { mmh: real.mmh } : { mmh: SLIGHT.mmh };   // dry or failed: slight rain
    const w = {
      mmh: base.mmh, cloud: real ? real.cloud : SLIGHT.cloud, windSpeed: real ? real.windSpeed : 3, windFrom: real ? real.windFrom : 225,
      tempC: real ? real.tempC : null,
    };
    for (const k of tok) Object.assign(w, PRESETS[k]);
    if (w.mmh > 0 && !tok.includes('clear')) w.cloud = Math.max(w.cloud, 0.6);          // rain falls from cloud
    const level = w.mmh <= 0 ? 'dry' : w.mmh < 1.2 ? 'slight' : w.mmh < 2.5 ? 'light' : w.mmh < 10 ? 'moderate' : 'heavy';
    const d0 = 0.89 * Math.pow(Math.max(w.mmh, 0.1), 0.21);                              // mm, median drop
    const fall = 9.65 - 10.3 * Math.exp(-0.6 * d0);                                      // m/s
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

  // ---- the readout: one small pill under the top-right control cluster (.controls); click folds it.
  // It sits in its own fixed box, not as a body > button, which main.js would move into the cluster.
  let box = null, pill = null, open = innerWidth > 640;    // phones start folded
  try { const v = localStorage.getItem(READOUT_KEY); if (v) open = v === 'open'; } catch { /* blocked storage */ }
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
      requestAnimationFrame(placePill); setTimeout(placePill, 1500);   // after main.js has filled the cluster
      pill.addEventListener('click', () => {
        open = !open;
        try { localStorage.setItem(READOUT_KEY, open ? 'open' : 'closed'); } catch { /* fine */ }
        readout();
      });
      document.body.appendChild(box);
    }
    const m = params.moon.name;
    const words = real ? `${real.words}, ${Math.round(real.tempC)} °C, ${m}` : `${m} (weather unavailable)`;
    const shows = real && params.level !== levelOf(real.mmh) ? ` · room: ${params.level === 'dry' ? 'dry glass' : params.level + ' rain'}` : '';
    const full = `Amsterdam, now: ${words}${shows}`;
    pill.textContent = open ? full : real ? `Amsterdam ${Math.round(real.tempC)} °C` : 'Amsterdam';
    pill.title = open ? 'Hide' : full;
    pill.setAttribute('aria-expanded', String(open));
    pill.setAttribute('aria-label', full);
  }

  // ---- the weather: cache, else one fetch (never in gate mode) ----
  async function load() {
    try {
      const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (c && Date.now() - c.t < (c.real ? CACHE_MS : FAIL_MS)) { real = c.real; source = c.real ? 'cache' : 'fallback'; return compose(); }
    } catch { /* blocked or broken storage: fetch */ }
    try {
      const url = `${API}?latitude=${LAT}&longitude=${LON}&current=${FIELDS}&wind_speed_unit=ms&timezone=Europe%2FAmsterdam`;
      const r = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), referrerPolicy: 'no-referrer', credentials: 'omit', cache: 'no-store' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      real = parse(await r.json());
      source = 'api';
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), real })); } catch { /* fine */ }
    } catch (err) {
      real = null; source = 'fallback';
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), real: null })); } catch { /* fine */ }
      console.info('room: weather unavailable, slight rain:', String(err?.message ?? err));
    }
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
      if (acc < 0.2) return false;            // the clouds drift slowly: 5 frames a second is plenty
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

// Open-Meteo `current`: precipitation is the sum over the preceding `interval` seconds (900 s).
function parse(j) {
  const c = j?.current;
  if (!c || typeof c.temperature_2m !== 'number') throw new Error('no current conditions');
  const per = 3600 / (c.interval || 3600);
  const mmh = Math.max(0, (c.precipitation ?? (c.rain ?? 0) + (c.showers ?? 0)) * per);
  const cloud = Math.max(0, Math.min(1, (c.cloud_cover ?? 90) / 100));
  return { mmh: +mmh.toFixed(2), cloud, tempC: c.temperature_2m, windSpeed: c.wind_speed_10m ?? 3, windFrom: c.wind_direction_10m ?? 225,
    code: c.weather_code ?? null, words: describe(mmh, cloud, c.weather_code, c.snowfall) };
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

// ---- astronomy: after suncalc (V. Agafonkin, BSD-2), itself after Meeus / aa.quae.nl; ~0.3 deg ----
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
  const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(c.dec) * Math.cos(phi));   // from south
  return { alt: h / RAD, az: ((az / RAD + 180) % 360 + 360) % 360 };                                     // compass
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
