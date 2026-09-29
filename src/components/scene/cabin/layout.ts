/**
 * Where the window sits in the view, as plain numbers (no three.js), shared
 * by the 3D carriage and the page laid over it: the timer plate goes on the
 * wall under the glass, the route on the panel above it.
 */

/** From the eyes to the window glass, seated (metres). */
export const D = 0.7;

/** The ride's lens: wide on a phone held upright, narrower on a wide screen. */
export const rideFov = (aspect: number) => (aspect < 0.8 ? 62 : aspect < 1.2 ? 56 : 48);

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export interface WindowShape {
  /** The glass: width, height, how far its centre sits above the eyes, corner radius (metres at the wall). */
  w: number;
  h: number;
  cy: number;
  r: number;
  /** Half the view's width and height at the wall (metres). */
  halfW: number;
  halfH: number;
}

/**
 * The window you sit at, sized to the screen. On a wide screen it is big but
 * framed by the carriage wall (the sill and table below, wall above); on a
 * phone held upright the glass runs past both edges and fills the top of the
 * screen, leaving the lower part for the timer and the controls.
 */
export function windowShape(aspect: number): WindowShape {
  const tanV = Math.tan(((rideFov(aspect) / 2) * Math.PI) / 180);
  const halfH = D * tanV;
  const halfW = halfH * aspect;
  const k = smooth(0.55, 1.5, aspect);
  const w = halfW * 2 * lerp(1.3, 0.74, k);
  const h = halfH * 2 * lerp(0.5, 0.58, k);
  const cy = halfH * lerp(0.2, 0.08, k);
  return { w, h, cy, r: Math.min(0.075, h * 0.2), halfW, halfH };
}

/** The glass's edges on screen, as fractions of the viewport (0 = left/top, 1 = right/bottom). */
export function windowOnScreen(width: number, height: number) {
  const s = windowShape(width / Math.max(1, height));
  return {
    left: 0.5 - s.w / 2 / s.halfW / 2,
    right: 0.5 + s.w / 2 / s.halfW / 2,
    top: 0.5 - (s.cy + s.h / 2) / s.halfH / 2,
    bottom: 0.5 - (s.cy - s.h / 2) / s.halfH / 2,
    /** The top of the sill under the frame (see window.ts: sillTopOf). */
    sill: 0.5 - (s.cy - s.h / 2 - 0.05) / s.halfH / 2,
  };
}
