/**
 * Which hour the window shows, without three.js: the 2D window and the pages
 * use it too, and shouldn't have to load the 3D code to know.
 */

/** Which hour to show: the device's own clock, or a journey from dusk to dawn across the ride. */
export type SkyMode = "local" | "journey";

export function hourFor(mode: SkyMode, now: Date, progress = 0) {
  if (mode === "journey") return (19 + Math.max(0, Math.min(1, progress)) * 11) % 24;
  return now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
}

/** A forced hour for checking the look (`?sky=6.2`), or null. */
export function forcedHour(): number | null {
  if (typeof window === "undefined") return null;
  const v = new URLSearchParams(window.location.search).get("sky");
  if (v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? ((n % 24) + 24) % 24 : null;
}

/** How much daylight there is at an hour, 0 (night) to 1 (full day), on the same clock as the 3D sky. */
export function daylightAt(hour: number) {
  const h = ((hour % 24) + 24) % 24;
  const s = (a: number, b: number, x: number) => {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  return s(5.2, 7.6, h) * (1 - s(17.4, 19.6, h));
}
