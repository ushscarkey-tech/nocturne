import * as THREE from "three";

/**
 * The light of the hour, outside and in: sky, sun or moon, fog, how much
 * of the town is lit, how bright the carriage lamps feel against it and how
 * much of the carriage shows in the glass. Keyframes through a day, blended
 * continuously so dusk never cuts to night.
 */

type RGB = [number, number, number];

interface Key {
  h: number;
  zenith: RGB;
  horizon: RGB;
  /** The warm band low in the sky toward the sun (dawn, dusk), linear. */
  glow: RGB;
  /** Sun (or moon) elevation in degrees and its light. */
  elev: number;
  sun: RGB;
  sunI: number;
  hemiSky: RGB;
  hemiGround: RGB;
  hemiI: number;
  fogDensity: number;
  exposure: number;
  /** 0 day … 1 night: lit windows, street lamps, stars. */
  night: number;
  /** How much the carriage's own lamps count (they don't, much, at noon). */
  cabin: number;
  /** Daylight coming in through the window onto the carriage. */
  daylight: RGB;
  /** The carriage reflected in the glass. */
  reflect: number;
  clouds: number;
}

// Linear-light colours. Exposure keeps the page's brightness steady while the world changes.
const KEYS: Key[] = [
  { h: 0, zenith: [0.006, 0.009, 0.02], horizon: [0.02, 0.026, 0.04], glow: [0.03, 0.022, 0.016], elev: 38, sun: [0.32, 0.4, 0.62], sunI: 0.14, hemiSky: [0.055, 0.07, 0.11], hemiGround: [0.006, 0.006, 0.007], hemiI: 1.2, fogDensity: 0.0024, exposure: 1.3, night: 1, cabin: 1, daylight: [0, 0, 0], reflect: 0.12, clouds: 0.45 },
  { h: 4.6, zenith: [0.006, 0.009, 0.02], horizon: [0.02, 0.026, 0.04], glow: [0.02, 0.016, 0.014], elev: 20, sun: [0.32, 0.4, 0.62], sunI: 0.14, hemiSky: [0.055, 0.07, 0.11], hemiGround: [0.006, 0.006, 0.007], hemiI: 1.2, fogDensity: 0.0026, exposure: 1.3, night: 1, cabin: 1, daylight: [0, 0, 0], reflect: 0.12, clouds: 0.4 },
  { h: 5.5, zenith: [0.012, 0.02, 0.05], horizon: [0.07, 0.06, 0.09], glow: [0.16, 0.07, 0.04], elev: -6, sun: [1, 0.5, 0.3], sunI: 0, hemiSky: [0.05, 0.06, 0.1], hemiGround: [0.01, 0.01, 0.012], hemiI: 1, fogDensity: 0.0028, exposure: 1.15, night: 0.85, cabin: 0.95, daylight: [0.02, 0.025, 0.04], reflect: 0.1, clouds: 0.4 },
  { h: 6.3, zenith: [0.06, 0.11, 0.24], horizon: [0.42, 0.3, 0.3], glow: [0.9, 0.38, 0.14], elev: 2, sun: [1, 0.52, 0.26], sunI: 0.9, hemiSky: [0.2, 0.24, 0.36], hemiGround: [0.04, 0.035, 0.03], hemiI: 1.3, fogDensity: 0.0024, exposure: 0.78, night: 0.45, cabin: 0.75, daylight: [0.12, 0.11, 0.12], reflect: 0.07, clouds: 0.35 },
  { h: 7.6, zenith: [0.1, 0.24, 0.58], horizon: [0.66, 0.64, 0.66], glow: [0.5, 0.3, 0.14], elev: 18, sun: [1, 0.84, 0.64], sunI: 2.4, hemiSky: [0.42, 0.5, 0.66], hemiGround: [0.1, 0.09, 0.07], hemiI: 1.7, fogDensity: 0.0017, exposure: 0.58, night: 0.04, cabin: 0.45, daylight: [0.34, 0.33, 0.31], reflect: 0.04, clouds: 0.4 },
  { h: 12, zenith: [0.07, 0.2, 0.62], horizon: [0.55, 0.68, 0.86], glow: [0.14, 0.14, 0.12], elev: 58, sun: [1, 0.97, 0.9], sunI: 3.1, hemiSky: [0.5, 0.6, 0.78], hemiGround: [0.14, 0.12, 0.09], hemiI: 2, fogDensity: 0.0012, exposure: 0.5, night: 0, cabin: 0.35, daylight: [0.42, 0.43, 0.44], reflect: 0.03, clouds: 0.3 },
  { h: 16, zenith: [0.08, 0.2, 0.55], horizon: [0.62, 0.68, 0.8], glow: [0.3, 0.22, 0.12], elev: 30, sun: [1, 0.9, 0.74], sunI: 2.8, hemiSky: [0.46, 0.54, 0.7], hemiGround: [0.13, 0.11, 0.08], hemiI: 1.9, fogDensity: 0.0014, exposure: 0.5, night: 0, cabin: 0.4, daylight: [0.4, 0.38, 0.35], reflect: 0.035, clouds: 0.3 },
  { h: 17.6, zenith: [0.09, 0.17, 0.4], horizon: [0.95, 0.6, 0.34], glow: [1.3, 0.55, 0.2], elev: 8, sun: [1, 0.62, 0.32], sunI: 2.1, hemiSky: [0.34, 0.34, 0.44], hemiGround: [0.12, 0.08, 0.05], hemiI: 1.5, fogDensity: 0.0017, exposure: 0.6, night: 0.1, cabin: 0.55, daylight: [0.42, 0.3, 0.2], reflect: 0.045, clouds: 0.5 },
  { h: 18.5, zenith: [0.05, 0.07, 0.2], horizon: [0.8, 0.32, 0.14], glow: [1.6, 0.45, 0.12], elev: 0.5, sun: [1, 0.36, 0.14], sunI: 0.9, hemiSky: [0.18, 0.15, 0.22], hemiGround: [0.05, 0.03, 0.025], hemiI: 1, fogDensity: 0.002, exposure: 0.78, night: 0.45, cabin: 0.75, daylight: [0.2, 0.1, 0.07], reflect: 0.07, clouds: 0.5 },
  { h: 19.25, zenith: [0.018, 0.034, 0.1], horizon: [0.1, 0.09, 0.17], glow: [0.32, 0.12, 0.05], elev: -6, sun: [0.6, 0.4, 0.4], sunI: 0, hemiSky: [0.07, 0.08, 0.15], hemiGround: [0.012, 0.012, 0.014], hemiI: 1, fogDensity: 0.0022, exposure: 1.1, night: 0.85, cabin: 0.92, daylight: [0.03, 0.035, 0.06], reflect: 0.1, clouds: 0.45 },
  { h: 20.4, zenith: [0.006, 0.009, 0.02], horizon: [0.02, 0.026, 0.04], glow: [0.035, 0.024, 0.016], elev: 20, sun: [0.32, 0.4, 0.62], sunI: 0.14, hemiSky: [0.055, 0.07, 0.11], hemiGround: [0.006, 0.006, 0.007], hemiI: 1.2, fogDensity: 0.0024, exposure: 1.3, night: 1, cabin: 1, daylight: [0, 0, 0], reflect: 0.12, clouds: 0.45 },
  { h: 24, zenith: [0.006, 0.009, 0.02], horizon: [0.02, 0.026, 0.04], glow: [0.03, 0.022, 0.016], elev: 38, sun: [0.32, 0.4, 0.62], sunI: 0.14, hemiSky: [0.055, 0.07, 0.11], hemiGround: [0.006, 0.006, 0.007], hemiI: 1.2, fogDensity: 0.0024, exposure: 1.3, night: 1, cabin: 1, daylight: [0, 0, 0], reflect: 0.12, clouds: 0.45 },
];

export interface Atmosphere {
  hour: number;
  zenith: THREE.Color;
  horizon: THREE.Color;
  glow: THREE.Color;
  sunDir: THREE.Vector3;
  sun: THREE.Color;
  sunI: number;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemiI: number;
  fog: THREE.Color;
  fogDensity: number;
  exposure: number;
  night: number;
  cabin: number;
  daylight: THREE.Color;
  reflect: number;
  clouds: number;
}

export function atmosphere(): Atmosphere {
  return {
    hour: 0,
    zenith: new THREE.Color(),
    horizon: new THREE.Color(),
    glow: new THREE.Color(),
    sunDir: new THREE.Vector3(),
    sun: new THREE.Color(),
    sunI: 0,
    hemiSky: new THREE.Color(),
    hemiGround: new THREE.Color(),
    hemiI: 0,
    fog: new THREE.Color(),
    fogDensity: 0,
    exposure: 1,
    night: 1,
    cabin: 1,
    daylight: new THREE.Color(),
    reflect: 0.1,
    clouds: 0.4,
  };
}

const smooth = (t: number) => t * t * (3 - 2 * t);
const mixRGB = (out: THREE.Color, a: RGB, b: RGB, t: number) => out.setRGB(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);

/**
 * Where the sun (or moon) is. The window looks toward -z and the train runs
 * toward +x: the sun rises low on the left, crosses behind the carriage at
 * noon (lighting the faces of the buildings you see) and sets low on the
 * right, in view. At night the moon hangs in the same sky.
 */
function sunDirection(out: THREE.Vector3, hour: number, elevDeg: number) {
  const day = hour >= 5 && hour <= 20.5;
  // Azimuth measured from -z (straight out of the window) toward +x (the right).
  const az = day ? THREE.MathUtils.lerp(-1.15, 1.0, (hour - 5) / 15.5) : THREE.MathUtils.lerp(-0.7, 0.9, ((hour + 3.5) % 24) / 9);
  // Around noon the sun swings behind the train: its light comes toward the window.
  const behind = day ? Math.sin(Math.PI * THREE.MathUtils.clamp((hour - 7) / 11, 0, 1)) : 0;
  const el = THREE.MathUtils.degToRad(elevDeg);
  const horizontal = new THREE.Vector3(Math.sin(az), 0, -Math.cos(az)).lerp(new THREE.Vector3(0.2, 0, 1), behind * 0.85).normalize();
  out.set(horizontal.x * Math.cos(el), Math.sin(el), horizontal.z * Math.cos(el)).normalize();
  return out;
}

/** The atmosphere at a given hour (0 … 24, fractional). */
export function atmosphereAt(out: Atmosphere, hour: number) {
  const h = ((hour % 24) + 24) % 24;
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1].h <= h) i++;
  const a = KEYS[i];
  const b = KEYS[i + 1];
  const t = smooth((h - a.h) / Math.max(1e-6, b.h - a.h));
  const n = (x: number, y: number) => x + (y - x) * t;
  out.hour = h;
  mixRGB(out.zenith, a.zenith, b.zenith, t);
  mixRGB(out.horizon, a.horizon, b.horizon, t);
  mixRGB(out.glow, a.glow, b.glow, t);
  mixRGB(out.sun, a.sun, b.sun, t);
  out.sunI = n(a.sunI, b.sunI);
  mixRGB(out.hemiSky, a.hemiSky, b.hemiSky, t);
  mixRGB(out.hemiGround, a.hemiGround, b.hemiGround, t);
  out.hemiI = n(a.hemiI, b.hemiI);
  out.fog.copy(out.horizon).lerp(out.zenith, 0.25);
  out.fogDensity = n(a.fogDensity, b.fogDensity);
  out.exposure = n(a.exposure, b.exposure);
  out.night = n(a.night, b.night);
  out.cabin = n(a.cabin, b.cabin);
  mixRGB(out.daylight, a.daylight, b.daylight, t);
  out.reflect = n(a.reflect, b.reflect);
  out.clouds = n(a.clouds, b.clouds);
  sunDirection(out.sunDir, h, n(a.elev, b.elev));
  return out;
}

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
