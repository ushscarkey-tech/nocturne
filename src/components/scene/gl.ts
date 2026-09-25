import * as THREE from "three";

/**
 * Shared set-up for the WebGL scenes: which frame buffers the GPU can really
 * render into, Apple's quirks, and an opt-in readout (`?debug3d`) that shows
 * what the device supports and what fell back, for when a scene won't appear.
 */

/** Apple GPUs (Safari, and Chrome on Mac) go through Metal; iPadOS says "Macintosh". */
export const isApple = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);

/** Whether the GPU can actually render into this target. */
export function complete(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget) {
  const gl = renderer.getContext();
  target.setSize(4, 4);
  renderer.setRenderTarget(target);
  const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  renderer.setRenderTarget(null);
  return ok;
}

export function floatSupport(renderer: THREE.WebGLRenderer) {
  return renderer.extensions.has("EXT_color_buffer_float") || renderer.extensions.has("EXT_color_buffer_half_float");
}

/**
 * The best frame buffer this device renders into. Multisampled half-float is
 * skipped on Apple, where it can report complete and still come out black.
 */
export function pickTarget(renderer: THREE.WebGLRenderer, floatOK: boolean) {
  const apple = isApple();
  const options: [THREE.TextureDataType, number][] = [
    [THREE.HalfFloatType, apple ? 0 : 4],
    [THREE.HalfFloatType, 0],
    [THREE.UnsignedByteType, 4],
    [THREE.UnsignedByteType, 0],
  ];
  for (const [type, samples] of options) {
    if (type === THREE.HalfFloatType && !floatOK) continue;
    const t = new THREE.WebGLRenderTarget(1, 1, { type, samples });
    if (complete(renderer, t)) return t;
    t.dispose();
  }
  return new THREE.WebGLRenderTarget(1, 1);
}

/** Whether the `?debug3d` readout is on (it sticks until `?debug3d=0`). */
function debugOn() {
  try {
    const q = new URLSearchParams(window.location.search).get("debug3d");
    if (q !== null) window.localStorage.setItem("nocturne:debug3d", q === "0" ? "0" : "1");
    return window.localStorage.getItem("nocturne:debug3d") === "1";
  } catch {
    return false;
  }
}

export interface SceneLog {
  note(line: string): void;
  set(key: string, value: string): void;
  dispose(): void;
}

/** A small corner readout for one scene; a no-op unless `?debug3d` is on. */
export function sceneLog(name: string): SceneLog {
  if (typeof window === "undefined" || !debugOn()) return { note: () => {}, set: () => {}, dispose: () => {} };
  const el = document.createElement("pre");
  el.style.cssText =
    "position:fixed;left:8px;bottom:8px;z-index:2147483647;max-width:min(92vw,560px);max-height:45vh;overflow:auto;margin:0;padding:8px 10px;background:rgba(0,0,0,.8);color:#cfe;font:11px/1.4 ui-monospace,monospace;white-space:pre-wrap;pointer-events:none;border-radius:6px";
  document.body.appendChild(el);
  const lines: string[] = [];
  const values = new Map<string, string>();
  const paint = () => {
    el.textContent = [`[${name}]`, ...[...values].map(([k, v]) => `${k}: ${v}`), ...lines].join("\n");
  };
  paint();
  return {
    note(line) {
      lines.push(line);
      if (lines.length > 14) lines.shift();
      paint();
    },
    set(key, value) {
      values.set(key, value);
      paint();
    },
    dispose() {
      el.remove();
    },
  };
}

/** What the device is: shown in the readout. */
export function describe(renderer: THREE.WebGLRenderer, log: SceneLog) {
  const gl = renderer.getContext();
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  log.set("gpu", info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "unknown");
  log.set("ua", navigator.userAgent.replace(/^Mozilla\/5.0 /, "").slice(0, 120));
  log.set("webgl2", String(renderer.capabilities.isWebGL2 !== false));
}
