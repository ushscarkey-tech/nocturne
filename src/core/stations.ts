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
 * 이내 (the exact word for the blue hour) is avoided: next to a time on the
 * board it reads as 以內, "within".
 */
const KO: Record<string, string> = {
  "BLUE HOUR": "땅거미", // the dusk that deepens after sunset
  STILLWATER: "물안개", // mist rising off still water
  LANTERN: "반딧불", // a small light in the dark
  FERNHILL: "산마루", // the ridge of a hill
  "SILVER BAY": "물굽이", // where water bends
  NORTHLIGHT: "길잡이별", // the star that shows the way at night
  "CEDAR CROSS": "솔바람", // wind through the pines
  HALCYON: "고요", // stillness
  MOONWELL: "달무리", // the ring of light around the moon
  ASHGROVE: "숲정이", // the grove kept by a village
  "QUIET HARBOR": "나루", // a ferry landing
  EMBER: "잉걸불", // embers glowing red
  WILLOW: "실버들", // thread-thin willow
  "GLASS LAKE": "윤슬", // moonlight glinting on ripples
  "LAST LIGHT": "잔별", // small stars
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
