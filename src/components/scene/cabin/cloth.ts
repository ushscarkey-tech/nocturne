import * as THREE from "three";
import type { CarriageId } from "@/core/types";
import { CAVITY } from "../surfaces";

const lin = (r: number, g: number, b: number) => new THREE.Color().setRGB(r, g, b);

/** The carriage light, per carriage (shared by boarding and the ride, so one leads into the other). */
export const CABIN_TINT: Record<CarriageId, THREE.Color> = {
  quiet: lin(1, 0.84, 0.62),
  rain: lin(0.74, 0.84, 0.98),
  tunnel: lin(1, 0.7, 0.42),
  moon: lin(0.86, 0.9, 1),
};
/** The curtains' cloth, per carriage. */
export const CURTAIN_COLOR: Record<CarriageId, number> = { quiet: 0x4a6152, rain: 0x3e5261, tunnel: 0x6b4e38, moon: 0x515866 };
/** How far the curtains are drawn over the glass when nobody has touched them. */
export const CURTAIN_REST = 0.04;

export interface ClothBacklight {
  /** What lies behind the window, as rendered this frame, and its size in pixels. */
  outside: THREE.Texture;
  res: THREE.Vector2;
  /** The window's glass, in world space (x, y): only there does light come through. */
  winMin: THREE.Vector2;
  winMax: THREE.Vector2;
  /** How much comes through the weave. */
  strength: number;
}

/**
 * Curtain cloth: a woven map tinted by the carriage, the weave in relief,
 * a soft sheen where light grazes the folds, grime in the weave, and —
 * given what's outside — whatever is behind the glass glowing faintly
 * through it.
 */
export function clothMaterial(p: { color: THREE.ColorRepresentation; map: THREE.Texture; normalMap: THREE.Texture; backlight?: ClothBacklight }) {
  const m = new THREE.MeshPhysicalMaterial({
    color: p.color,
    map: p.map,
    normalMap: p.normalMap,
    normalScale: new THREE.Vector2(0.9, 0.9),
    roughness: 0.92,
    sheen: 0.45,
    sheenRoughness: 0.8,
    side: THREE.DoubleSide,
    // The curtain shades its own folds (see Curtain).
    vertexColors: true,
  });
  m.sheenColor.set(p.color).lerp(new THREE.Color(1, 1, 1), 0.35);
  const back = p.backlight;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uCavity = { value: 0.35 };
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uCavity;")
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>\n${CAVITY}`);
    if (!back) return;
    shader.uniforms.tClothBack = { value: back.outside };
    shader.uniforms.uClothRes = { value: back.res };
    shader.uniforms.uWinMin = { value: back.winMin };
    shader.uniforms.uWinMax = { value: back.winMax };
    shader.uniforms.uClothBack = { value: back.strength };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vClothWorld;")
      .replace("#include <project_vertex>", "#include <project_vertex>\nvClothWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vClothWorld;\nuniform sampler2D tClothBack;\nuniform vec2 uClothRes, uWinMin, uWinMax;\nuniform float uClothBack;",
      )
      .replace(
        "#include <opaque_fragment>",
        /* glsl */ `
{
  // The weave scatters it: a wide, soft blur of what's behind.
  vec2 suv = gl_FragCoord.xy / uClothRes;
  vec2 r = vec2(uClothRes.y / uClothRes.x, 1.0) * 0.03;
  vec3 seen = texture2D(tClothBack, suv).rgb * 0.2;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.7853982;
    vec2 d = vec2(cos(a), sin(a));
    seen += texture2D(tClothBack, suv + d * r).rgb * 0.06;
    seen += texture2D(tClothBack, suv + d * r * 2.3).rgb * 0.04;
  }
  vec2 w = vClothWorld.xy;
  float m = smoothstep(uWinMin.x, uWinMin.x + 0.05, w.x) * (1.0 - smoothstep(uWinMax.x - 0.05, uWinMax.x, w.x))
          * smoothstep(uWinMin.y, uWinMin.y + 0.05, w.y) * (1.0 - smoothstep(uWinMax.y - 0.05, uWinMax.y, w.y));
  outgoingLight += diffuseColor.rgb * seen * m * uClothBack;
}
#include <opaque_fragment>`,
      );
  };
  m.customProgramCacheKey = () => (back ? "nocturne-cloth-back" : "nocturne-cloth");
  return m;
}
