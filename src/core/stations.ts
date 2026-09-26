import type { DateKey } from "./types";

/**
 * Station names are atmosphere, not data. They are assigned by position on
 * the night's line, so the first stop of the evening always reads like a
 * departure and the last like a late-night arrival.
 */
const NAMES = [
  "BLUE HOUR",
  "STILLWATER",
  "LANTERN",
  "FERNHILL",
  "SILVER BAY",
  "NORTHLIGHT",
  "CEDAR CROSS",
  "HALCYON",
  "MOONWELL",
  "ASHGROVE",
  "QUIET HARBOR",
  "EMBER",
  "WILLOW",
  "GLASS LAKE",
  "LAST LIGHT",
  "MIDNIGHT",
];

/**
 * In Korean the stations are pure Korean words (순우리말) that keep each
 * name's sense. The stored name stays the English one; only display maps.
 */
const KO: Record<string, string> = {
  "BLUE HOUR": "어스름", // the dim light as evening comes on
  STILLWATER: "물비늘", // the glint on still water
  LANTERN: "별뉘", // a small light slipping in through a gap
  FERNHILL: "산마루", // the ridge of a hill
  "SILVER BAY": "윤슬", // sun or moonlight glinting on ripples
  NORTHLIGHT: "샛별", // the bright star before dawn
  "CEDAR CROSS": "솔바람", // wind through the pines
  HALCYON: "고요", // stillness
  MOONWELL: "달무리", // the ring of light around the moon
  ASHGROVE: "들꽃", // wildflowers of the field
  "QUIET HARBOR": "나루", // a ferry landing
  EMBER: "잉걸불", // embers glowing red
  WILLOW: "버들", // the willow
  "GLASS LAKE": "물결", // the ripple of moving water
  "LAST LIGHT": "노을", // the red glow at sunset
  MIDNIGHT: "한밤", // deep night
};

/** How a station's name reads in a language. */
export function stationLabel(name: string, locale: string): string {
  if (locale === "ko") return KO[name] ?? name;
  return name;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function stationName(date: DateKey, position: number, total: number): string {
  if (total > 1 && position === total - 1) return "MIDNIGHT";
  if (position === 0) return "BLUE HOUR";
  const pool = NAMES.slice(1, -1);
  const offset = hash(date) % pool.length;
  return pool[(offset + position - 1) % pool.length];
}

export function seeded(seed: string): () => number {
  let x = hash(seed) || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return ((x >>> 0) % 10_000) / 10_000;
  };
}

/** Aesthetic boarding metadata derived from the date. */
export function boardingDetails(date: DateKey): { platform: string; car: string; seat: string } {
  const rand = seeded(`board:${date}`);
  const platform = String(1 + Math.floor(rand() * 9)).padStart(2, "0");
  const car = String(1 + Math.floor(rand() * 8)).padStart(2, "0");
  const seat = `${1 + Math.floor(rand() * 20)}${"ABCD"[Math.floor(rand() * 4)]}`;
  return { platform, car, seat };
}
