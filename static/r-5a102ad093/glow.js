// The hover glow (merge 018 step 5, after A; panel 018 action 7): a warm lift of the baked colour (a multiply, A's)
// plus a small warm additive term, so the dark texels read as well. No extra draw call, no outline pass. One shared
// onBeforeCompile (the same function object, so one program cache key): the baked materials keep sharing one program.
// At rest the colour is (1, 1, 1) and the term (0, 0, 0): the bake renders exactly as before (the align and fidelity
// gates). Eased in and out over EASE_S, at once under prefers-reduced-motion.
//
// Panel 019 action 8: the glow as light, not selection. A third of 018's strength; the lift is weighted by the baked
// luminance (smoothstep over SHADOW, linear), so the mids rise and a deep shadow keeps ~70 % of its darkness; the
// increase stops at CAP (linear, under the lampshade's lit mouth), so a hovered object never outshines the lamps.
const LIFT = [0.28, 0.23, 0.13];   // colour multiply at full glow, per channel (linear; 018's 0.85/0.68/0.38 over 3)
const ADD = [0.017, 0.012, 0.005]; // added at full glow (linear), weighted like the lift
const SHADOW = [0.0, 0.06];        // linear luminance: below the first a texel gets 30 % of the glow, above the second all of it
const CAP = 0.55;                  // linear: the glow never lifts a texel past this (the shade's mouth bakes brighter)
const EASE_S = 0.12;

function patch(shader) {           // called with this = the material (three r160 WebGLRenderer.getProgram)
  const g = this.userData.glow;
  shader.uniforms.glowAdd = g.u;
  shader.uniforms.glowLift = g.l;
  shader.fragmentShader = 'uniform vec3 glowAdd;\nuniform vec3 glowLift;\n' + shader.fragmentShader.replace('#include <map_fragment>',
    `#include <map_fragment>
\t{ float gL = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
\t  float gW = mix(0.3, 1.0, smoothstep(${SHADOW[0].toFixed(3)}, ${SHADOW[1].toFixed(3)}, gL));
\t  vec3 gUp = (diffuseColor.rgb * glowLift + glowAdd) * gW;
\t  diffuseColor.rgb += min(gUp, max(vec3(${CAP.toFixed(2)}) - diffuseColor.rgb, 0.0)); }`);
}

export default function makeGlow(THREE, reduceMotion) {
  const live = new Set();          // materials easing or lit
  return {
    attach(mat) {
      mat.userData.glow = { u: { value: new THREE.Vector3() }, l: { value: new THREE.Vector3() }, k: 0, want: 0 };
      mat.onBeforeCompile = patch;
    },
    // light (on) or dim a set of materials
    set(mats, on) {
      for (const m of mats) { const g = m.userData.glow; if (!g) continue; g.want = on ? 1 : 0; live.add(m); }
    },
    // -> true while something changed (the caller draws a frame)
    tick(dt) {
      let changed = false;
      for (const m of live) {
        const g = m.userData.glow;
        const k = reduceMotion?.matches ? g.want : g.k + Math.sign(g.want - g.k) * Math.min(Math.abs(g.want - g.k), dt / EASE_S);
        if (k !== g.k) {
          g.k = k;
          g.l.value.set(LIFT[0] * k, LIFT[1] * k, LIFT[2] * k);
          g.u.value.set(ADD[0] * k, ADD[1] * k, ADD[2] * k);
          changed = true;
        }
        if (g.k === g.want && !g.want) live.delete(m);
      }
      return changed;
    },
  };
}
