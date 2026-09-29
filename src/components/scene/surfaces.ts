import * as THREE from "three";
import { addGrain, cached, paintContext } from "./canvasCache";
import { seeded } from "./platform/textures";

/**
 * Real surface relief for the scenes: CC0 normal maps (public/textures/
 * normals, from @pmndrs/assets), roughness that varies across a surface,
 * and grime that settles into the grooves the normal map describes.
 */

export type Relief = "concrete" | "gravel" | "boards" | "wood" | "plaster" | "asphalt" | "brushed" | "fabric" | "rough" | "ribs";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
// Keep loaded relief images for the page's lifetime: the walk and the ride use the same ones.
THREE.Cache.enabled = true;

export function surfaceKit(track: <T extends { dispose(): void }>(x: T) => T) {
  const loader = new THREE.TextureLoader();
  const sources = new Map<Relief, THREE.Texture>();
  /** Copies waiting for their image: flagged for upload only once it's there. */
  const waiting = new Map<Relief, THREE.Texture[]>();
  const loading: Promise<unknown>[] = [];

  /** A tiling normal map; each call gets its own repeat but shares the image. */
  const relief = (name: Relief, repeat: [number, number], rotation = 0) => {
    let src = sources.get(name);
    if (!src) {
      let done: () => void = () => {};
      loading.push(new Promise<void>((resolve) => (done = resolve)));
      // Until it arrives the surface would shade black, so a scene waits for `ready` before it shows.
      const key = name;
      src = track(
        loader.load(
          `${BASE}/textures/normals/${name}.webp`,
          () => {
            for (const t of waiting.get(key) ?? []) t.needsUpdate = true;
            waiting.delete(key);
            done();
          },
          undefined,
          () => done(),
        ),
      );
      waiting.set(key, []);
      src.wrapS = src.wrapT = THREE.RepeatWrapping;
      src.colorSpace = THREE.NoColorSpace;
      src.anisotropy = 8;
      sources.set(name, src);
    }
    const t = track(src.clone());
    // `clone` flags the copy for upload; with no image yet that only makes three.js complain every frame.
    const pending = waiting.get(name);
    if (pending) {
      t.version = 0;
      pending.push(t);
    }
    t.repeat.set(...repeat);
    t.rotation = rotation;
    return t;
  };

  /** Grey roughness: mostly `base`, with blotches that are smoother or rougher. */
  const roughness = (base: number, spread: number, seed: number, repeat: [number, number]) => {
    const c = roughnessCanvas(base, spread, seed);
    const t = track(new THREE.CanvasTexture(c));
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.NoColorSpace;
    t.repeat.set(...repeat);
    return t;
  };

  /** Every relief map asked for so far has loaded (or failed). */
  const ready = () => Promise.all(loading).then(() => undefined);

  return { relief, roughness, ready };
}

/** GLSL: darken where the normal map tilts away (grooves, gaps, pits). */
export const CAVITY = /* glsl */ `
#ifdef USE_NORMALMAP_TANGENTSPACE
  diffuseColor.rgb *= mix(1.0, smoothstep(0.35, 0.97, mapN.z / max(length(mapN), 1e-3)), uCavity);
#endif
`;

/** Grime in the grooves for an ordinary material. */
export function withCavity<T extends THREE.MeshStandardMaterial>(material: T, amount = 0.6): T {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uCavity = { value: amount };
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uCavity;")
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>\n${CAVITY}`);
  };
  material.customProgramCacheKey = () => "nocturne-cavity";
  return material;
}

/** The picture behind a roughness map: painted once per page for each look (see canvasCache). */
const roughnessCanvas = cached("surfaces/roughness", (base: number, spread: number, seed: number) => {
  const rnd = seeded(seed);
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = paintContext(c);
  const v = (x: number) => Math.round(Math.max(0, Math.min(1, x)) * 255);
  g.fillStyle = `rgb(${v(base)},${v(base)},${v(base)})`;
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 90; i++) {
    const r = base + (rnd() - 0.5) * 2 * spread;
    const grad = g.createRadialGradient(0, 0, 0, 0, 0, 1);
    grad.addColorStop(0, `rgba(${v(r)},${v(r)},${v(r)},0.5)`);
    grad.addColorStop(1, `rgba(${v(r)},${v(r)},${v(r)},0)`);
    g.save();
    g.translate(rnd() * 256, rnd() * 256);
    g.scale(10 + rnd() * 50, 8 + rnd() * 40);
    g.fillStyle = grad;
    g.beginPath();
    g.arc(0, 0, 1, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  addGrain(g, 256, 256, spread * 90, rnd());
  return c;
});
