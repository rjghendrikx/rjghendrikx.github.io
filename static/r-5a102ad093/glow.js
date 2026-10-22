// The hover glow (merge 018 step 5, after A; panel 018 action 7): a warm lift of the baked colour (a multiply, A's)
// plus a small warm additive term, so the dark texels read as well. No extra draw call, no outline pass. One shared
// onBeforeCompile (the same function object, so one program cache key): the baked materials keep sharing one program.
// At rest the colour is (1, 1, 1) and the term (0, 0, 0): the bake renders exactly as before (the align and fidelity
// gates). Eased in and out over EASE_S, at once under prefers-reduced-motion.
const LIFT = [0.85, 0.68, 0.38];   // added to the colour multiply at full glow, per channel (linear; A's values)
const ADD = [0.05, 0.035, 0.014];  // added to the shaded colour at full glow (linear): black reads as a dim warm brown
const EASE_S = 0.12;

function patch(shader) {           // called with this = the material (three r160 WebGLRenderer.getProgram)
  shader.uniforms.glowAdd = this.userData.glow.u;
  shader.fragmentShader = 'uniform vec3 glowAdd;\n' + shader.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n\tdiffuseColor.rgb += glowAdd;');
}

export default function makeGlow(THREE, reduceMotion) {
  const live = new Set();          // materials easing or lit
  return {
    attach(mat) {
      mat.userData.glow = { u: { value: new THREE.Vector3() }, k: 0, want: 0 };
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
          m.color.setRGB(1 + LIFT[0] * k, 1 + LIFT[1] * k, 1 + LIFT[2] * k);
          g.u.value.set(ADD[0] * k, ADD[1] * k, ADD[2] * k);
          changed = true;
        }
        if (g.k === g.want && !g.want) live.delete(m);
      }
      return changed;
    },
  };
}
