import * as THREE from "three";
import { addGrain, cached, paintContext } from "../canvasCache";
import { rng } from "./route";

/**
 * Materials for the world outside the window. Most are ordinary lit
 * materials (so the sun, sky and fog of the hour reach them) with a little
 * shader added: façades grow windows that reflect the sky by day and light
 * up at night; lamps glow; water holds the sky.
 */

const NOISE = /* glsl */ `
float w_hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float w_value(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(w_hash(i), w_hash(i + vec2(1.0, 0.0)), u.x), mix(w_hash(i + vec2(0.0, 1.0)), w_hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float w_fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * w_value(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return v;
}
`;

// ---------------------------------------------------------------------- sky

export function skyDome() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    uniforms: {
      uZenith: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uGlow: { value: new THREE.Color() },
      uSun: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunI: { value: 0 },
      uNight: { value: 1 },
      uClouds: { value: 0.4 },
      uTime: { value: 0 },
      uDrift: { value: 0 },
    },
    vertexShader: /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
    fragmentShader: /* glsl */ `
uniform vec3 uZenith, uHorizon, uGlow, uSun, uSunDir;
uniform float uSunI, uNight, uClouds, uTime, uDrift;
varying vec3 vDir;
${NOISE}
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  // The sky darkens overhead; below the horizon it holds the horizon colour (hidden by land).
  vec3 col = mix(uHorizon, uZenith, smoothstep(-0.02, 0.55, h));
  vec3 s = normalize(uSunDir);
  float toward = max(dot(normalize(vec3(d.x, 0.0, d.z)), normalize(vec3(s.x, 0.0, s.z) + 1e-5)), 0.0);
  // The warm band low toward the sun at dawn and dusk.
  col += uGlow * exp(-max(h, 0.0) * 5.0) * (0.25 + 0.75 * pow(toward, 3.0));
  // Sun disc and its halo (the moon, dimly, at night).
  float cs = dot(d, s);
  float disc = smoothstep(0.99955, 0.99975, cs);
  float halo = pow(max(cs, 0.0), 180.0) * 0.6 + pow(max(cs, 0.0), 12.0) * 0.08;
  vec3 sunCol = uSun * (uSunI * 0.35 + 0.06);
  col += sunCol * (disc * mix(40.0, 3.0, uNight) + halo * (1.0 - uNight * 0.7));
  // Stars, only where it's properly dark.
  vec2 sp = d.xz / max(h + 0.15, 0.1) * 180.0;
  float star = step(0.9965, w_hash(floor(sp))) * smoothstep(0.05, 0.35, h);
  col += vec3(0.8, 0.85, 1.0) * star * uNight * 0.02 * (0.6 + 0.4 * sin(uTime * 2.0 + w_hash(floor(sp) + 3.0) * 30.0));
  // Clouds: a flat layer drifting slowly, lit by the sun and the town below.
  vec2 cuv = d.xz / max(h + 0.06, 0.05) * 0.35 + vec2(uDrift * 0.0004 + uTime * 0.002, uTime * 0.0006);
  float c = w_fbm(cuv * 1.4);
  float cloud = smoothstep(0.62 - uClouds * 0.3, 0.95 - uClouds * 0.2, c) * smoothstep(0.0, 0.12, h);
  // Clouds are white in daylight, lit warm toward the sun, grey-blue at night.
  vec3 lit = mix(uZenith * 1.4 + uHorizon * 0.5, uSun * uSunI * 0.25 + uHorizon * 0.9, 0.5 + 0.5 * toward);
  lit = mix(lit, vec3(dot(uHorizon, vec3(0.3, 0.5, 0.2))) * 1.35 + uSun * uSunI * 0.08, (1.0 - uNight) * 0.6);
  vec3 cloudCol = mix(lit, uHorizon * 1.2 + uGlow * 0.6, exp(-max(h, 0.0) * 4.0));
  col = mix(col, cloudCol, cloud * 0.75);
  gl_FragColor = vec4(col, 1.0);
}`,
  });
}

// ------------------------------------------------------------------ façades

export interface FacadeUniforms {
  uNight: { value: number };
  uGlass: { value: THREE.Color };
  uTime: { value: number };
}

/**
 * Buildings: instanced boxes (and houses, factories) whose sides grow
 * windows in the shader, sized per style, with a per-instance seed and
 * share of lit rooms. `aFacade` = (style, seed, lit share); `aRoof` = roof colour.
 * Styles: 0 flats, 1 offices, 2 low-rise shops, 3 works, 4 plain (sheds, tanks), 5 chimney, 6 house.
 */
export function facadeMaterial(uniforms: FacadeUniforms) {
  const m = new THREE.MeshLambertMaterial({ color: 0xffffff });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
attribute vec3 aFacade;
attribute vec3 aRoof;
varying vec3 vFacN;
varying vec3 vFacP;
varying vec3 vFac;
varying vec3 vRoof;
varying vec3 vFacScale;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
#ifdef USE_INSTANCING
  vFacScale = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
#else
  vFacScale = vec3(1.0);
#endif
  vFacN = normal;
  vFacP = position * vFacScale;
  vFac = aFacade;
  vRoof = aRoof;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
uniform float uNight, uTime;
uniform vec3 uGlass;
varying vec3 vFacN;
varying vec3 vFacP;
varying vec3 vFac;
varying vec3 vRoof;
varying vec3 vFacScale;
${NOISE}
vec3 facadeEmit = vec3(0.0);`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
{
  vec3 n = normalize(vFacN);
  float style = vFac.x;
  // Per-building values arrive through interpolation; round them so they are exactly the same on every pixel.
  float seed = floor(vFac.y + 0.5);
  float lit = vFac.z;
  if (n.y > 0.25) {
    // Roofs: their own colour, weathered.
    diffuseColor.rgb = vRoof * (0.8 + 0.3 * w_value(vFacP.xz * 0.35 + seed * 13.0));
  } else if (n.y > -0.5) {
    float u = abs(n.z) > 0.5 ? vFacP.x * sign(n.z) : vFacP.z * -sign(n.x);
    float v = vFacP.y;
    // Streaks under sills and at the joints, a little variation from floor to floor.
    float stain = w_fbm(vec2(u * 0.35, v * 0.08) + seed * 7.0);
    diffuseColor.rgb *= 0.78 + 0.32 * stain;
    float floorH = 3.0, bay = 2.8, ww = 0.55, wh = 0.46, firstFloor = 1.0;
    if (style > 5.5) {
      // A house: small windows on two floors, none up in the gable.
      floorH = 2.7; bay = 2.6; ww = 0.42; wh = 0.4; firstFloor = 0.0;
      if (v > vFacScale.y * 0.56) ww = 0.0;
    }
    else if (style < 0.5) { floorH = 2.8; bay = 3.3; ww = 0.74; wh = 0.44; }
    else if (style < 1.5) { floorH = 3.7; bay = 1.7; ww = 0.84; wh = 0.66; firstFloor = 0.0; }
    else if (style < 2.5) { floorH = 2.9; bay = 2.7; ww = 0.5; wh = 0.4; firstFloor = 0.0; }
    else if (style < 3.5) { floorH = 6.0; bay = 5.5; ww = 0.8; wh = 0.14; }
    else if (style < 4.5) { ww = 0.0; }
    else {
      // Chimney: red and white bands near the top.
      float band = step(0.5, fract(v / 6.0)) * step(vFacScale.y * 0.6, v);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.55, 0.12, 0.08), band);
      ww = 0.0;
    }
    vec2 cell = vec2(u / bay + seed * 3.7, v / floorH);
    vec2 id = floor(cell);
    vec2 f = fract(cell);
    // Flats: a balcony slab and railing along every floor.
    if (style < 0.5) {
      float bal = smoothstep(0.02, 0.0, abs(f.y - 0.12)) + step(f.y, 0.06) * 0.6;
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.25 + 0.02, clamp(bal, 0.0, 1.0));
    }
    // Floor lines.
    diffuseColor.rgb *= 1.0 - 0.18 * smoothstep(0.03, 0.0, f.y);
    float inWin = step(abs(f.x - 0.5), ww * 0.5) * step(abs(f.y - 0.56), wh * 0.5) * step(firstFloor, id.y);
    if (style > 2.5 && style < 3.5) inWin *= step(0.6, f.y);
    // Window frames and a sill: a thin border round the glass.
    vec2 wq = vec2((f.x - 0.5) / max(ww * 0.5, 1e-3), (f.y - 0.56) / max(wh * 0.5, 1e-3));
    float frameBand = step(abs(f.x - 0.5), ww * 0.5 + 0.035) * step(abs(f.y - 0.56), wh * 0.5 + 0.03) * step(firstFloor, id.y) * (1.0 - inWin) * step(0.01, ww);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.62, 0.6), frameBand * 0.6);
    if (inWin > 0.5) {
      float r = w_hash(id + seed);
      // Mullion down the middle of wider windows.
      float mull = step(abs(wq.x), 0.035) * step(0.6, ww);
      // By day, dark glass that holds the sky; curtains in some.
      vec3 glass = mix(vec3(0.03, 0.035, 0.04), uGlass, 0.25 + 0.5 * r);
      float curtain = step(0.7, w_hash(id + seed + 5.1));
      glass = mix(glass, vec3(0.55, 0.5, 0.42) * 0.5, curtain * 0.5);
      diffuseColor.rgb = mix(glass, vec3(0.5), mull * 0.6);
      // By night, some rooms lit: warm lamps mostly, the blue of a television now and then.
      float on = step(r, lit);
      vec3 warm = mix(vec3(1.0, 0.55, 0.22), vec3(1.0, 0.8, 0.55), w_hash(id + 3.1));
      warm = mix(warm, vec3(0.62, 0.78, 1.0), step(0.88, w_hash(id + 7.7)));
      float flicker = 1.0 - 0.25 * step(0.97, w_hash(id + 9.0)) * step(0.5, fract(uTime * 0.7 + r));
      facadeEmit = warm * on * uNight * (0.45 + 0.55 * w_hash(id + 1.3)) * flicker * 0.5;
    }
  }
}`,
      )
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n  totalEmissiveRadiance += facadeEmit;");
  };
  m.customProgramCacheKey = () => "nocturne-facade";
  return m;
}

// ------------------------------------------------------ ground and foliage

export interface WorldUniforms {
  /** Distance travelled, wrapped, so patterns stay put on the land as it slides by. */
  uShift: { value: number };
}

const WORLD_POS = /* glsl */ `
#ifdef USE_INSTANCING
  vWp = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
#else
  vWp = (modelMatrix * vec4(transformed, 1.0)).xyz;
#endif
  vWp.x += uShift;`;

/**
 * Ground: the texture is laid in world space (metres / tile), so tiles of
 * any size join without seams and the pattern stays on the land.
 */
export function groundMaterial(map: THREE.Texture, tile: number, uniforms: WorldUniforms, tint = 1) {
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  const m = new THREE.MeshLambertMaterial({ map, color: new THREE.Color(tint, tint, tint) });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uShift = uniforms.uShift;
    shader.uniforms.uTile = { value: tile };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uShift;\nvarying vec3 vWp;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>\n${WORLD_POS}`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\nuniform float uTile;\nvarying vec3 vWp;\n${NOISE}`)
      .replace(
        "#include <map_fragment>",
        `vec2 gUv = vWp.xz / uTile;
  // Two scales of the same texture, turned against each other: no visible repeat.
  vec4 g1 = texture2D(map, gUv);
  vec4 g2 = texture2D(map, vec2(gUv.y, -gUv.x) * 0.37 + 0.5);
  float blend = w_fbm(vWp.xz * 0.02);
  diffuseColor *= mix(g1, g2, smoothstep(0.35, 0.65, blend)) * (0.85 + 0.3 * w_value(vWp.xz * 0.05));`,
      );
  };
  m.customProgramCacheKey = () => `nocturne-ground-${tile}`;
  return m;
}

/** Trees, hedges, hills: canopy-like variation laid on in world space, colour per instance. */
export function foliageMaterial(uniforms: WorldUniforms, scale = 0.35) {
  const m = new THREE.MeshLambertMaterial({ color: 0xffffff });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uShift = uniforms.uShift;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uShift;\nvarying vec3 vWp;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>\n${WORLD_POS}`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\nvarying vec3 vWp;\n${NOISE}`)
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
  float leaf = w_fbm(vWp.xz * ${scale.toFixed(3)} + vWp.y * ${(scale * 0.8).toFixed(3)});
  diffuseColor.rgb *= 0.6 + 0.75 * leaf;`,
      );
  };
  m.customProgramCacheKey = () => `nocturne-foliage-${scale}`;
  return m;
}

// -------------------------------------------------------------------- water

export function waterMaterial() {
  return new THREE.ShaderMaterial({
    fog: true,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uSky: { value: new THREE.Color() },
        uZenith: { value: new THREE.Color() },
        uGlow: { value: new THREE.Color() },
        uNight: { value: 1 },
        uTime: { value: 0 },
        uOrigin: { value: 0 },
      },
    ]),
    vertexShader: /* glsl */ `
#include <fog_pars_vertex>
varying vec3 vWorld;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  #ifdef USE_INSTANCING
  wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
  #endif
  vWorld = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`,
    fragmentShader: /* glsl */ `
#include <fog_pars_fragment>
uniform vec3 uSky, uZenith, uGlow;
uniform float uNight, uTime, uOrigin;
varying vec3 vWorld;
${NOISE}
void main() {
  vec3 V = normalize(cameraPosition - vWorld);
  float fres = 0.08 + 0.92 * pow(1.0 - max(V.y, 0.0), 5.0);
  vec2 p = vec2(vWorld.x + uOrigin, vWorld.z);
  float ripple = w_fbm(p * vec2(0.05, 0.18) + vec2(uTime * 0.05, 0.0));
  vec3 sky = mix(uSky, uZenith, 0.35 + 0.3 * ripple) + uGlow * 0.4;
  vec3 deep = vec3(0.01, 0.018, 0.02);
  vec3 col = mix(deep, sky, fres);
  // Broken reflections of lamps on the far bank at night.
  float streak = smoothstep(0.75, 1.0, w_value(vec2(p.x * 0.12, p.y * 2.0 + uTime * 0.3))) * smoothstep(-40.0, -160.0, vWorld.z);
  col += vec3(1.0, 0.62, 0.3) * streak * uNight * 0.35;
  gl_FragColor = vec4(col, 1.0);
  #include <fog_fragment>
}`,
  });
}

// -------------------------------------------------------------------- glows

/** Soft lamp glows (camera-facing quads, instanced): street lamps, red lights on masts, signals. */
export function glowMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
    uniforms: { uOn: { value: 1 }, uTime: { value: 0 } },
    vertexShader: /* glsl */ `
varying vec2 vUv;
varying vec3 vCol;
varying float vBlink;
void main() {
  vUv = uv;
  vCol = vec3(1.0);
  #ifdef USE_INSTANCING_COLOR
  vCol = instanceColor;
  #endif
  vec4 center = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  float size = length(instanceMatrix[0].xyz);
  // Blinking lights (red on masts) are marked with a negative z scale.
  vBlink = instanceMatrix[2].z < 0.0 ? 1.0 : 0.0;
  vec4 mv = center + vec4(position.xy * size, 0.0, 0.0);
  gl_Position = projectionMatrix * mv;
}`,
    fragmentShader: /* glsl */ `
uniform float uOn, uTime;
varying vec2 vUv;
varying vec3 vCol;
varying float vBlink;
void main() {
  float r = length(vUv - 0.5) * 2.0;
  float a = exp(-r * r * 5.0) * 0.8 + smoothstep(0.18, 0.0, r) * 0.9;
  float blink = mix(1.0, step(0.55, fract(uTime / 1.6)), vBlink);
  gl_FragColor = vec4(vCol * a * uOn * blink, 1.0);
}`,
  });
}

/** Light pooled on the ground under a lamp (flat, additive). */
export function poolMaterial(tex: THREE.Texture) {
  return new THREE.MeshBasicMaterial({
    map: tex,
    color: new THREE.Color(0.5, 0.34, 0.17),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    fog: true,
  });
}

// ------------------------------------------------------------------ textures

/** A canvas that tiles: whatever is drawn near an edge wraps round to the other side. */
function tiling(size: number, draw: (g: CanvasRenderingContext2D, at: (fn: (dx: number, dy: number) => void) => void) => void) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = paintContext(c);
  const at = (fn: (dx: number, dy: number) => void) => {
    for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) fn(dx, dy);
  };
  draw(g, at);
  return c;
}

function blotches(g: CanvasRenderingContext2D, at: (fn: (dx: number, dy: number) => void) => void, size: number, n: number, seed: number, color: (r: () => number) => string, rMin: number, rMax: number, squash = 1) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const x = r() * size;
    const y = r() * size;
    const rad = rMin + r() * (rMax - rMin);
    const col = color(r);
    at((dx, dy) => {
      const grad = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, rad);
      grad.addColorStop(0, col);
      grad.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = grad;
      g.save();
      g.translate(x + dx, y + dy);
      g.scale(1, squash);
      g.translate(-(x + dx), -(y + dy));
      g.beginPath();
      g.arc(x + dx, y + dy, rad, 0, Math.PI * 2);
      g.fill();
      g.restore();
    });
  }
}

function grain(g: CanvasRenderingContext2D, size: number, amount: number, seed: number) {
  addGrain(g, size, size, amount, rng(seed)());
}

function grassTexturePaint() {
  return tiling(256, (g, at) => {
    g.fillStyle = "#56613f";
    g.fillRect(0, 0, 256, 256);
    blotches(g, at, 256, 90, 11, (r) => (r() < 0.5 ? "rgba(98,108,62,0.55)" : r() < 0.6 ? "rgba(120,104,70,0.45)" : "rgba(62,74,44,0.55)"), 6, 34);
    grain(g, 256, 26, 12);
  });
}

function fieldTexturePaint() {
  // Paddies and dry fields in strips, the ridges between them paler.
  return tiling(256, (g, at) => {
    g.fillStyle = "#5f6242";
    g.fillRect(0, 0, 256, 256);
    const r = rng(21);
    for (let y = 0; y < 256; y += 32) {
      const tone = r();
      g.fillStyle = tone < 0.4 ? "#6c6b44" : tone < 0.7 ? "#56663e" : "#7a6c4a";
      g.fillRect(0, y + 2, 256, 28);
      g.fillStyle = "rgba(160,150,110,0.45)";
      g.fillRect(0, y, 256, 2);
      for (let x = 0; x < 256; x += 4) {
        g.fillStyle = `rgba(40,50,26,${0.12 + r() * 0.1})`;
        g.fillRect(x, y + 3, 1, 26);
      }
    }
    blotches(g, at, 256, 40, 22, () => "rgba(40,44,30,0.35)", 8, 30);
    grain(g, 256, 20, 23);
  });
}

function urbanTexturePaint() {
  return tiling(256, (g, at) => {
    g.fillStyle = "#5c5b57";
    g.fillRect(0, 0, 256, 256);
    blotches(g, at, 256, 70, 31, (r) => (r() < 0.5 ? "rgba(40,40,40,0.35)" : "rgba(110,106,98,0.35)"), 10, 40);
    // Slabs and patched joints.
    g.strokeStyle = "rgba(30,30,30,0.35)";
    g.lineWidth = 1;
    for (let i = 0; i <= 256; i += 64) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i, 256);
      g.stroke();
      g.beginPath();
      g.moveTo(0, i);
      g.lineTo(256, i);
      g.stroke();
    }
    grain(g, 256, 22, 32);
  });
}

function gravelTexturePaint() {
  return tiling(256, (g, at) => {
    g.fillStyle = "#5a5650";
    g.fillRect(0, 0, 256, 256);
    blotches(g, at, 256, 50, 41, (r) => (r() < 0.5 ? "rgba(60,48,36,0.4)" : "rgba(120,114,104,0.3)"), 8, 30);
    const r = rng(42);
    for (let i = 0; i < 2600; i++) {
      const v = 60 + r() * 90;
      g.fillStyle = `rgb(${v},${v - 4},${v - 10})`;
      g.fillRect(r() * 256, r() * 256, 1 + r() * 2, 1 + r() * 2);
    }
    grain(g, 256, 18, 43);
  });
}

function roadTexturePaint() {
  // Asphalt with a broken centre line along its length (u runs along the road).
  return tiling(256, (g, at) => {
    g.fillStyle = "#3a3a3b";
    g.fillRect(0, 0, 256, 256);
    blotches(g, at, 256, 60, 51, (r) => (r() < 0.5 ? "rgba(20,20,22,0.4)" : "rgba(80,80,80,0.25)"), 8, 30);
    g.fillStyle = "rgba(200,190,150,0.8)";
    for (let x = 0; x < 256; x += 64) g.fillRect(x, 126, 34, 4);
    g.fillStyle = "rgba(210,210,200,0.6)";
    g.fillRect(0, 8, 256, 3);
    g.fillRect(0, 245, 256, 3);
    grain(g, 256, 16, 52);
  });
}

/** Chain-link fence (alpha). */
function fenceTexturePaint() {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 64;
  const g = c.getContext("2d")!;
  g.clearRect(0, 0, 128, 64);
  g.strokeStyle = "rgba(170,175,172,0.9)";
  g.lineWidth = 1;
  for (let i = -64; i < 192; i += 6) {
    g.beginPath();
    g.moveTo(i, 4);
    g.lineTo(i + 56, 60);
    g.stroke();
    g.beginPath();
    g.moveTo(i + 56, 4);
    g.lineTo(i, 60);
    g.stroke();
  }
  g.fillStyle = "rgba(120,124,122,1)";
  g.fillRect(0, 2, 128, 3);
  g.fillRect(0, 60, 128, 3);
  g.fillRect(0, 0, 3, 64);
  return c;
}

/** Sound wall: ribbed concrete below, a band of clear panels above. */
function barrierTexturePaint() {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#8a8a84";
  g.fillRect(0, 0, 128, 256);
  for (let x = 0; x < 128; x += 8) {
    g.fillStyle = x % 16 === 0 ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.06)";
    g.fillRect(x, 96, 8, 160);
  }
  // Upper clear panels: faint, alpha lower.
  g.clearRect(0, 0, 128, 90);
  g.fillStyle = "rgba(170,190,200,0.25)";
  g.fillRect(0, 0, 128, 90);
  g.fillStyle = "rgba(90,96,100,1)";
  g.fillRect(0, 88, 128, 8);
  g.fillRect(0, 0, 128, 5);
  g.fillRect(0, 0, 5, 256);
  grain(g, 128, 12, 61);
  return c;
}

function softDotPaint() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.4, "rgba(255,255,255,0.35)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return c;
}

// Painted once per page (see canvasCache).
export const grassTexture = cached("ride/grassTexture", grassTexturePaint);
export const fieldTexture = cached("ride/fieldTexture", fieldTexturePaint);
export const urbanTexture = cached("ride/urbanTexture", urbanTexturePaint);
export const gravelTexture = cached("ride/gravelTexture", gravelTexturePaint);
export const roadTexture = cached("ride/roadTexture", roadTexturePaint);
export const fenceTexture = cached("ride/fenceTexture", fenceTexturePaint);
export const barrierTexture = cached("ride/barrierTexture", barrierTexturePaint);
export const softDot = cached("ride/softDot", softDotPaint);
