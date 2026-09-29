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

const OVERRIDE_KEY = "nocturne:sky-override";
/** Fired on window when the presenter changes the hour, so scenes redraw their sky at once. */
export const SKY_EVENT = "nocturne:sky-change";

/**
 * A forced hour: `?sky=6.2` in the address (for checking the look), or the one
 * the presenter picked in demo mode (kept for the tab's session). Null: the real clock.
 */
export function forcedHour(): number | null {
  if (typeof window === "undefined") return null;
  const v = new URLSearchParams(window.location.search).get("sky");
  const n = Number(v ?? readOverride());
  if (v === null && readOverride() === null) return null;
  return Number.isFinite(n) ? ((n % 24) + 24) % 24 : null;
}

function readOverride(): string | null {
  try {
    return window.sessionStorage.getItem(OVERRIDE_KEY);
  } catch {
    return null;
  }
}

/** Presenter mode: show this hour everywhere (null goes back to the real clock). */
export function setForcedHour(hour: number | null) {
  try {
    if (hour === null) window.sessionStorage.removeItem(OVERRIDE_KEY);
    else window.sessionStorage.setItem(OVERRIDE_KEY, String(hour));
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new Event(SKY_EVENT));
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
