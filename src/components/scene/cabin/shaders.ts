import * as THREE from "three";

const NOISE = /* glsl */ `
float c_hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float c_value(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(c_hash(i), c_hash(i + vec2(1.0, 0.0)), u.x), mix(c_hash(i + vec2(0.0, 1.0)), c_hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float c_fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * c_value(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return v;
}
`;

const FOG = /* glsl */ `
uniform vec3 uFogColor;
uniform float uFogDensity;
vec3 applyFog(vec3 col, float dist) {
  float f = 1.0 - exp(-dist * dist * uFogDensity * uFogDensity);
  return mix(col, uFogColor, clamp(f, 0.0, 1.0));
}
`;

const fogUniforms = (fog: THREE.FogExp2) => ({ uFogColor: { value: fog.color }, uFogDensity: { value: fog.density } });

const WORLD_VERTEX = /* glsl */ `
varying vec3 vWorld;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

/**
 * The glass: whatever is outside (rendered to a texture) seen through
 * raindrops, plus the carriage faintly reflected in it. Drops bead, run
 * and, once the train moves, get pushed back along the window.
 */
export function glassMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      tOutside: { value: null as THREE.Texture | null },
      tReflect: { value: null as THREE.Texture | null },
      uRes: { value: new THREE.Vector2(1, 1) },
      uWin: { value: new THREE.Vector2(1, 0.7) },
      uTime: { value: 0 },
      uRain: { value: 0.3 },
      uSlant: { value: 0 },
      uReflect: { value: 0.1 },
      uTint: { value: new THREE.Color(1, 0.9, 0.75) },
    },
    vertexShader: /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
uniform sampler2D tOutside, tReflect;
uniform vec2 uRes, uWin;
uniform float uTime, uRain, uSlant, uReflect;
uniform vec3 uTint;
varying vec2 vUv;

vec3 N13(float p) {
  vec3 p3 = fract(vec3(p) * vec3(0.1031, 0.11369, 0.13787));
  p3 += dot(p3, p3.yzx + 19.19);
  return fract(vec3((p3.x + p3.y) * p3.z, (p3.x + p3.z) * p3.y, (p3.y + p3.z) * p3.x));
}
float N1(float t) { return fract(sin(t * 12345.564) * 7658.76); }
float saw(float b, float t) { return smoothstep(0.0, b, t) * smoothstep(1.0, b, t); }

// Running drops with trails (after BigWings' "Heartfelt").
vec2 runLayer(vec2 uv, float t) {
  vec2 UV = uv;
  uv.x += uv.y * uSlant;
  uv.y += t * 0.75;
  vec2 a = vec2(6.0, 1.0);
  vec2 grid = a * 2.0;
  vec2 id = floor(uv * grid);
  uv.y += N1(id.x);
  id = floor(uv * grid);
  vec3 n = N13(id.x * 35.2 + id.y * 2376.1);
  vec2 st = fract(uv * grid) - vec2(0.5, 0.0);
  float x = n.x - 0.5;
  float y = UV.y * 20.0;
  x += sin(y + sin(y)) * (0.5 - abs(x)) * (n.z - 0.5);
  x *= 0.7;
  float ti = fract(t + n.z);
  y = (saw(0.85, ti) - 0.5) * 0.9 + 0.5;
  float d = length((st - vec2(x, y)) * a.yx);
  float mainDrop = smoothstep(0.4, 0.0, d);
  float r = sqrt(smoothstep(1.0, y, st.y));
  float cd = abs(st.x - x);
  float trail = smoothstep(0.23 * r, 0.15 * r * r, cd);
  float front = smoothstep(-0.02, 0.02, st.y - y);
  trail *= front * r * r;
  float yy = fract(UV.y * 10.0) + (st.y - 0.5);
  float dd = length(st - vec2(x, yy));
  float droplets = smoothstep(0.3, 0.0, dd);
  return vec2(mainDrop + droplets * r * front, trail);
}

float beads(vec2 uv, float t) {
  uv *= 34.0;
  vec2 id = floor(uv);
  uv = fract(uv) - 0.5;
  vec3 n = N13(id.x * 107.45 + id.y * 3543.654);
  vec2 p = (n.xy - 0.5) * 0.7;
  float d = length(uv - p);
  float fade = saw(0.025, fract(t + n.z));
  return smoothstep(0.3, 0.0, d) * fract(n.z * 10.0) * fade;
}

float drops(vec2 uv, float t, float l0, float l1, float l2) {
  float s = beads(uv, t) * l0;
  vec2 m1 = runLayer(uv, t) * l1;
  vec2 m2 = runLayer(uv * 1.85, t) * l2;
  return smoothstep(0.3, 1.0, s + m1.x + m2.x);
}

void main() {
  vec2 screen = gl_FragCoord.xy / uRes;
  // About 1.4 drop-grid units per 10 cm of glass, whatever the window size.
  vec2 uv = vUv * uWin * 2.6;
  float t = uTime * 0.2;
  vec2 offset = vec2(0.0);
  float c = 0.0;
  if (uRain > 0.01) {
    float l0 = smoothstep(-0.5, 1.0, uRain) * 2.0;
    float l1 = smoothstep(0.25, 0.75, uRain);
    float l2 = smoothstep(0.0, 0.5, uRain);
    c = drops(uv, t, l0, l1, l2);
    vec2 e = vec2(0.0015, 0.0);
    float cx = drops(uv + e, t, l0, l1, l2);
    float cy = drops(uv + e.yx, t, l0, l1, l2);
    offset = vec2(cx - c, cy - c) * 0.55;
  }
  vec3 col = texture2D(tOutside, screen + offset).rgb;
  // Drops gather the carriage light at their edges.
  col += uTint * c * 0.035;
  // The carriage in the glass, stronger where the outside is dark.
  vec3 refl = texture2D(tReflect, vUv).rgb * uTint;
  float dark = 1.0 - smoothstep(0.02, 0.5, dot(col, vec3(0.3, 0.5, 0.2)));
  col += refl * uReflect * (0.35 + 0.65 * dark);
  gl_FragColor = vec4(col, 1.0);
}`,
  });
}

/**
 * The ground right beside the train: ballast and the sleepers of the other
 * track, blurred by speed, lit by the carriage windows' own light.
 */
export function trackGroundMaterial(fog: THREE.FogExp2, gravel: THREE.Texture) {
  return new THREE.ShaderMaterial({
    uniforms: {
      tGravel: { value: gravel },
      uTravel: { value: 0 },
      uBlur: { value: 0 },
      uSpill: { value: new THREE.Color(0.5, 0.42, 0.3) },
      uAmbient: { value: new THREE.Color(0.012, 0.015, 0.02) },
      ...fogUniforms(fog),
    },
    vertexShader: WORLD_VERTEX,
    fragmentShader: /* glsl */ `
uniform sampler2D tGravel;
uniform float uTravel, uBlur;
uniform vec3 uSpill, uAmbient;
varying vec3 vWorld;
${FOG}
vec3 ground(float x, float z) {
  vec3 g = texture2D(tGravel, vec2(x, z) / 1.6).rgb;
  // Sleepers of the other track.
  float sleeper = step(fract(x / 0.6), 0.36) * step(-4.9, z) * step(z, -2.7);
  g = mix(g, vec3(0.2, 0.19, 0.17), sleeper * 0.8);
  // Its rails catch a line of light.
  float rail = (1.0 - smoothstep(0.0, 0.03, abs(z + 3.0))) + (1.0 - smoothstep(0.0, 0.03, abs(z + 4.07)));
  return g + rail * 0.5;
}
void main() {
  float x = vWorld.x + uTravel;
  vec3 g = vec3(0.0);
  for (int i = 0; i < 6; i++) g += ground(x + uBlur * (float(i) / 5.0 - 0.5), vWorld.z);
  g /= 6.0;
  // Light from the windows of this carriage, falling on the ballast.
  float wx = fract((vWorld.x + 0.55) / 2.4);
  float win = smoothstep(0.0, 0.12, wx) * smoothstep(0.66, 0.54, wx);
  float near = smoothstep(-9.5, -1.2, vWorld.z);
  vec3 col = g * (uAmbient + uSpill * win * near * near);
  gl_FragColor = vec4(applyFog(col, length(vWorld - cameraPosition)), 1.0);
}`,
  });
}

/** Dark fields, with the ridges between paddies catching the sky. */
export function fieldMaterial(fog: THREE.FogExp2) {
  return new THREE.ShaderMaterial({
    uniforms: { uTravel: { value: 0 }, uSky: { value: new THREE.Color(0.03, 0.04, 0.05) }, ...fogUniforms(fog) },
    vertexShader: WORLD_VERTEX,
    fragmentShader: /* glsl */ `
uniform float uTravel;
uniform vec3 uSky;
varying vec3 vWorld;
${NOISE}
${FOG}
void main() {
  vec2 p = vec2(vWorld.x + uTravel, vWorld.z);
  float n = c_fbm(p * 0.08);
  vec3 col = mix(vec3(0.008, 0.012, 0.009), vec3(0.018, 0.022, 0.016), n);
  // Flooded paddies: still water that holds a little of the sky.
  vec2 cell = fract(p / vec2(22.0, 14.0));
  float ridge = smoothstep(0.02, 0.0, min(cell.x, cell.y));
  float water = step(0.45, c_value(floor(p / vec2(22.0, 14.0)) + 3.0));
  vec3 V = normalize(cameraPosition - vWorld);
  float fres = pow(1.0 - max(V.y, 0.0), 4.0);
  col = mix(col, uSky * (0.35 + fres * 0.9), water * (1.0 - ridge) * 0.7);
  col += ridge * 0.01;
  gl_FragColor = vec4(applyFog(col, length(vWorld - cameraPosition)), 1.0);
}`,
  });
}

/**
 * A tunnel wall right outside the glass: segments, cable trays and a lamp
 * every 25 m, all blurred by speed. It only exists between uStart and uEnd
 * (world x), so its mouth can sweep across the window.
 */
export function tunnelWallMaterial(fog: THREE.FogExp2) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTravel: { value: 0 },
      uBlur: { value: 0 },
      uStart: { value: 1e5 },
      uEnd: { value: 1e5 },
      uLamp: { value: new THREE.Color(1, 0.62, 0.3) },
      ...fogUniforms(fog),
    },
    vertexShader: WORLD_VERTEX,
    fragmentShader: /* glsl */ `
uniform float uTravel, uBlur, uStart, uEnd;
uniform vec3 uLamp;
varying vec3 vWorld;
${NOISE}
${FOG}
vec3 wall(float x, float y) {
  vec3 c = vec3(0.05, 0.05, 0.048) * (0.55 + 0.7 * c_fbm(vec2(x, y) * 0.9));
  c *= 0.75 + 0.25 * smoothstep(0.0, 0.06, abs(fract(x / 10.0) - 0.5) * 2.0);
  float tray = step(0.28, y) * step(y, 0.36) + step(0.52, y) * step(y, 0.57);
  c = mix(c, vec3(0.02), tray);
  c += step(0.355, y) * step(y, 0.365) * 0.03;
  // Lamps: a small warm box and the light it throws on the wall.
  float lx = mod(x, 25.0) - 12.5;
  float box = step(abs(lx), 0.22) * step(abs(y - 0.95), 0.07);
  float pool = exp(-lx * lx * 0.35) * exp(-(y - 0.95) * (y - 0.95) * 1.2);
  c += uLamp * pool * 0.12;
  c += uLamp * box * 6.0;
  return c;
}
void main() {
  if (vWorld.x < uStart || vWorld.x > uEnd) discard;
  float x = vWorld.x + uTravel;
  vec3 col = vec3(0.0);
  for (int i = 0; i < 7; i++) col += wall(x + uBlur * (float(i) / 6.0 - 0.5), vWorld.y);
  col /= 7.0;
  // The mouth: daylight-less, but the concrete edge is a little lighter.
  float edge = min(vWorld.x - uStart, uEnd - vWorld.x);
  col += vec3(0.02, 0.022, 0.024) * (1.0 - smoothstep(0.0, 1.2, edge));
  gl_FragColor = vec4(applyFog(col, length(vWorld - cameraPosition)), 1.0);
}`,
  });
}

/** Out-of-focus far lights that slide by with the distance travelled. */
export function farLightsMaterial(pixelRatio: number, span: number) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
    uniforms: { uTime: { value: 0 }, uTravel: { value: 0 }, uSpan: { value: span }, uPixelRatio: { value: pixelRatio } },
    vertexShader: /* glsl */ `
attribute float aSize;
attribute vec3 aColor;
attribute float aPhase;
uniform float uTime, uPixelRatio, uTravel, uSpan;
varying vec3 vCol;
void main() {
  vec3 p = position;
  p.x = mod(p.x - uTravel + uSpan * 0.5, uSpan) - uSpan * 0.5;
  float tw = aPhase < 0.0
    ? smoothstep(0.55, 0.6, fract(uTime / 3.2 - aPhase)) * (1.0 - smoothstep(0.85, 0.95, fract(uTime / 3.2 - aPhase)))
    : 0.85 + 0.15 * sin(uTime * (0.4 + aPhase) + aPhase * 30.0);
  vCol = aColor * tw;
  gl_PointSize = aSize * uPixelRatio;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
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
