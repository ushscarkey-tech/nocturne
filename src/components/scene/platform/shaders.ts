import * as THREE from "three";

/** Shared GLSL: hash, value noise and fbm. */
const NOISE = /* glsl */ `
float n_hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n_value(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(n_hash(i), n_hash(i + vec2(1.0, 0.0)), u.x), mix(n_hash(i + vec2(0.0, 1.0)), n_hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float n_fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * n_value(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return v;
}
`;

export const MAX_LIGHTS = 12;

export interface FloorUniforms {
  tReflect: { value: THREE.Texture | null };
  textureMatrix: { value: THREE.Matrix4 };
  uTime: { value: number };
  uRain: { value: number };
  /** Canopy: x of its front edge, z from, z to. */
  uRoof: { value: THREE.Vector3 };
}

/**
 * Turns a standard material into wet concrete: darker and glossier where
 * damp, puddles flat and mirror-smooth, grime in the concrete's pits, the
 * painted edge line and tactile strip, and a blurred planar reflection
 * that sharpens in puddles and at grazing angles, rippling in the rain.
 */
export function wetFloor(material: THREE.MeshStandardMaterial, uniforms: FloorUniforms) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms, { uCavity: { value: 0.55 } });
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
uniform mat4 textureMatrix;
varying vec4 vReflUv;
varying vec3 vWorldP;`,
      )
      .replace(
        "#include <project_vertex>",
        `#include <project_vertex>
vReflUv = textureMatrix * vec4(transformed, 1.0);
vWorldP = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
uniform sampler2D tReflect;
uniform float uTime;
uniform float uRain;
uniform float uCavity;
uniform vec3 uRoof;
varying vec4 vReflUv;
varying vec3 vWorldP;
${NOISE}
// x: how wet (damp under the canopy, soaked in the open), y: standing water.
vec2 wetness(vec3 p) {
  float n = n_fbm(p.xz * vec2(0.8, 0.3));
  float puddle = smoothstep(0.5, 0.64, n);
  float covered = smoothstep(uRoof.x - 0.05, uRoof.x + 0.9, p.x) * smoothstep(uRoof.z - 2.5, uRoof.z + 1.5, p.z) * (1.0 - smoothstep(uRoof.y - 1.5, uRoof.y + 2.5, p.z));
  float damp = mix(0.9, 0.28, covered);
  return vec2(clamp(max(damp, puddle), 0.0, 1.0), puddle);
}
vec2 ripples(vec2 p, float t) {
  vec2 acc = vec2(0.0);
  for (int l = 0; l < 2; l++) {
    float fl = float(l);
    vec2 q = p * (2.6 + fl * 1.7) + fl * 7.13;
    vec2 cell = floor(q);
    vec2 f = fract(q) - 0.5;
    float h = n_hash(cell + fl * 3.7);
    vec2 c = (vec2(n_hash(cell + 1.3), n_hash(cell + 2.7)) - 0.5) * 0.5;
    float phase = fract(t * (0.55 + 0.3 * h) + h * 7.0);
    vec2 d = f - c;
    float r = length(d);
    float ring = exp(-pow((r - phase * 0.42) * 26.0, 2.0)) * (1.0 - phase) * (1.0 - phase);
    acc += d / max(r, 1e-3) * ring;
  }
  return acc;
}`,
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
vec2 wp = wetness(vWorldP);
float wet = wp.x;
float puddle = wp.y;
float px = vWorldP.x;
// The painted edge line and the tactile strip.
diffuseColor.rgb = mix(vec3(0.5, 0.49, 0.45), diffuseColor.rgb, smoothstep(0.1, 0.115, px));
vec2 dcell = fract(vec2(px, vWorldP.z) / 0.075) - 0.5;
float bump = 1.0 - smoothstep(0.2, 0.3, length(dcell));
float tactile = smoothstep(0.58, 0.59, px) * (1.0 - smoothstep(0.88, 0.89, px));
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.34, 0.22, 0.03) * (0.82 + 0.3 * bump), tactile);
diffuseColor.rgb *= mix(1.0, 0.5, wet);`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, roughnessFactor * 0.68, wet);
roughnessFactor = mix(roughnessFactor, 0.05, puddle);`,
      )
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
vec2 relief = vec2(0.0);
#ifdef USE_NORMALMAP_TANGENTSPACE
  relief = mapN.xy;
  // Grime in the pits, washed out where water stands.
  diffuseColor.rgb *= mix(1.0, smoothstep(0.35, 0.97, mapN.z / max(length(mapN), 1e-3)), uCavity * (1.0 - puddle));
#endif
// Standing water is flat.
normal = normalize(mix(normal, nonPerturbedNormal, puddle * 0.92));`,
      )
      .replace(
        "#include <opaque_fragment>",
        `{
  vec2 ruv = vReflUv.xy / vReflUv.w;
  ruv += ripples(vWorldP.xz, uTime) * 0.014 * uRain * wet;
  ruv += relief * 0.012 * (1.0 - puddle);
  float rough = 1.0 - wet;
  float spread = 0.003 + rough * 0.028;
  float bias = 0.5 + rough * 4.0;
  vec3 refl = vec3(0.0);
  refl += texture2D(tReflect, ruv + vec2(0.0, -2.0 * spread), bias).rgb * 0.12;
  refl += texture2D(tReflect, ruv + vec2(0.0, -spread), bias).rgb * 0.22;
  refl += texture2D(tReflect, ruv, bias).rgb * 0.32;
  refl += texture2D(tReflect, ruv + vec2(0.0, spread), bias).rgb * 0.22;
  refl += texture2D(tReflect, ruv + vec2(0.0, 2.0 * spread), bias).rgb * 0.12;
  vec3 V = normalize(cameraPosition - vWorldP);
  float fres = 0.05 + 0.95 * pow(1.0 - max(V.y, 0.0), 5.0);
  outgoingLight += refl * mix(0.08, 0.95, wet) * mix(0.2, 1.0, fres);
}
#include <opaque_fragment>`,
      );
  };
  material.customProgramCacheKey = () => "nocturne-wet-floor";
}

export interface RainUniforms {
  [key: string]: THREE.IUniform;
}

/**
 * GPU rain: each streak is an instanced quad that falls in the vertex
 * shader and borrows colour from the nearby lamps, so it shows mostly where
 * light catches it. Nothing moves on the CPU.
 */
export interface RainOptions {
  lights: THREE.Vector4[];
  colors: THREE.Color[];
  min: THREE.Vector3;
  size: THREE.Vector3;
  /** Drops inside this box (a canopy and the dry air under it) are hidden. */
  coverMin?: THREE.Vector3;
  coverMax?: THREE.Vector3;
  speed: number;
  opacity: number;
  fogDensity: number;
}

export function rainMaterial(opts: RainOptions) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: opts.opacity },
      uSpeed: { value: opts.speed },
      uMin: { value: opts.min },
      uSize: { value: opts.size },
      uCoverMin: { value: opts.coverMin ?? new THREE.Vector3(1, 1, 1) },
      uCoverMax: { value: opts.coverMax ?? new THREE.Vector3(-1, -1, -1) },
      // Sideways drift: wind, or the air a moving train pushes back.
      uWind: { value: 0.05 },
      // Distance travelled: the rain field slides past a moving camera.
      uTravel: { value: 0 },
      uFog: { value: opts.fogDensity },
      uLights: { value: opts.lights },
      uColors: { value: opts.colors },
    },
    defines: { NL: MAX_LIGHTS },
    vertexShader: /* glsl */ `
attribute vec4 aSeed;
uniform float uTime, uOpacity, uSpeed, uFog, uWind, uTravel;
uniform vec3 uMin, uSize, uCoverMin, uCoverMax;
uniform vec4 uLights[NL];
uniform vec3 uColors[NL];
varying vec3 vCol;
varying float vA;
varying float vV;
void main() {
  float spd = uSpeed * (0.85 + 0.3 * aSeed.w);
  float y = uMin.y + mod(aSeed.y * uSize.y - uTime * spd, uSize.y);
  float x = mod(aSeed.x * uSize.x - uTravel, uSize.x);
  vec3 p = vec3(uMin.x + x, y, uMin.z + aSeed.z * uSize.z);
  p.x += (y - uMin.y) * uWind;
  vec3 dir = normalize(vec3(uWind, -1.0, 0.0));
  vec3 toCam = cameraPosition - p;
  float dist = length(toCam);
  vec3 side = normalize(cross(dir, toCam));
  float w = max(0.005, dist * 0.0016);
  float len = (0.2 + 0.22 * aSeed.w) * (1.0 + dist * 0.01);
  vec3 pos = p + side * position.x * w + dir * position.y * len;
  gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);

  vec3 lit = vec3(0.012, 0.016, 0.02);
  for (int i = 0; i < NL; i++) {
    vec3 d = uLights[i].xyz - p;
    lit += uColors[i] * uLights[i].w / (1.0 + dot(d, d) * 1.1);
  }
  vCol = lit;
  vec3 inside = step(uCoverMin, p) * step(p, uCoverMax);
  float hidden = inside.x * inside.y * inside.z;
  float fog = exp(-dist * dist * uFog * uFog);
  vA = uOpacity * (1.0 - hidden) * fog * min(1.0, 0.006 / w) * smoothstep(1.5, 4.5, dist);
  vV = position.y + 0.5;
}`,
    fragmentShader: /* glsl */ `
varying vec3 vCol;
varying float vA;
varying float vV;
void main() {
  float a = vA * sin(vV * 3.14159) * (0.4 + 0.6 * vV);
  gl_FragColor = vec4(vCol * a, a);
}`,
  });
}

/** A faint shaft of light in the damp air under a lamp. */
export function hazeMaterial(color: THREE.Color, strength: number) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: color }, uStrength: { value: strength } },
    vertexShader: /* glsl */ `
varying float vH;
varying vec3 vN;
varying vec3 vWP;
void main() {
  vH = uv.y;
  vN = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWP = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`,
    fragmentShader: /* glsl */ `
uniform vec3 uColor;
uniform float uStrength;
varying float vH;
varying vec3 vN;
varying vec3 vWP;
void main() {
  vec3 V = normalize(cameraPosition - vWP);
  float edge = pow(abs(dot(normalize(vN), V)), 2.0);
  float a = uStrength * edge * pow(vH, 1.8);
  gl_FragColor = vec4(uColor * a, a);
}`,
  });
}

/** Overcast night sky: town glow low on the horizon, slow clouds lit from below. */
export function skyMaterial(c: { horizon: THREE.Color; zenith: THREE.Color; glow: THREE.Color }) {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { uTime: { value: 0 }, uHorizon: { value: c.horizon }, uZenith: { value: c.zenith }, uGlow: { value: c.glow } },
    vertexShader: /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
    fragmentShader: /* glsl */ `
uniform float uTime;
uniform vec3 uHorizon, uZenith, uGlow;
varying vec3 vDir;
${NOISE}
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(uHorizon, uZenith, smoothstep(-0.02, 0.5, h));
  float glow = exp(-max(h, 0.0) * 7.0) * (0.55 + 0.45 * smoothstep(-0.6, 1.0, -d.z - d.x * 0.4));
  col += uGlow * glow;
  vec2 cuv = d.xz / max(h + 0.08, 0.06) * 0.5 + vec2(uTime * 0.003, uTime * 0.001);
  float c = n_fbm(cuv * 1.3);
  float cloud = smoothstep(0.38, 0.78, c) * smoothstep(0.0, 0.12, h);
  vec3 cloudCol = uZenith * 1.8 + uGlow * exp(-max(h, 0.0) * 3.5) * 0.9;
  col = mix(col, cloudCol, cloud * 0.7);
  vec3 moon = normalize(vec3(-0.55, 0.32, -0.77));
  col += vec3(0.022, 0.028, 0.034) * pow(max(dot(d, moon), 0.0), 18.0) * (1.0 - cloud * 0.4);
  col += (n_hash(gl_FragCoord.xy) - 0.5) * 0.002;
  gl_FragColor = vec4(col, 1.0);
}`,
  });
}

/** Distant lights, drawn as soft out-of-focus discs. */
export function bokehMaterial(pixelRatio: number) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
    uniforms: { uTime: { value: 0 }, uPixelRatio: { value: pixelRatio } },
    vertexShader: /* glsl */ `
attribute float aSize;
attribute vec3 aColor;
attribute float aPhase;
uniform float uTime, uPixelRatio;
varying vec3 vCol;
void main() {
  float tw = aPhase < 0.0
    ? smoothstep(0.55, 0.6, fract(uTime / 3.2 - aPhase)) * (1.0 - smoothstep(0.85, 0.95, fract(uTime / 3.2 - aPhase)))
    : 0.82 + 0.18 * sin(uTime * (0.4 + aPhase) + aPhase * 30.0);
  vCol = aColor * tw;
  gl_PointSize = aSize * uPixelRatio;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
    fragmentShader: /* glsl */ `
varying vec3 vCol;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.55, r) * 0.55 + smoothstep(0.35, 0.0, r) * 0.45;
  gl_FragColor = vec4(vCol * a, a);
}`,
  });
}

/** Final touch in display space: vignette, a little split toning, film grain. */
export const GradeShader = {
  name: "NocturneGrade",
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
    uVignette: { value: 0.42 },
    uGrain: { value: 0.045 },
  },
  vertexShader: /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
uniform sampler2D tDiffuse;
uniform float uTime, uVignette, uGrain;
uniform vec2 uRes;
varying vec2 vUv;
float g_hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void main() {
  vec3 c = texture2D(tDiffuse, vUv).rgb;
  vec2 q = vUv - 0.5;
  q.x *= uRes.x / uRes.y;
  float vig = smoothstep(1.05, 0.2, length(q * vec2(0.9, 1.1)));
  c *= mix(1.0 - uVignette, 1.0, vig);
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c += vec3(-0.004, 0.003, 0.012) * (1.0 - l) + vec3(0.012, 0.005, -0.01) * l;
  float n = g_hash(vUv * uRes + fract(uTime * 7.3) * 91.0) - 0.5;
  c += n * uGrain * (1.0 - l * 0.7);
  gl_FragColor = vec4(c, 1.0);
}`,
};
