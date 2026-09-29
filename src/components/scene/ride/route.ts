/**
 * The line the train runs along: a sequence of stretches of country, each a
 * few hundred metres long, chosen from a seed so the same night always runs
 * through the same places and a long ride never loops a short backdrop.
 * Pure: no three.js, no DOM, so it can be tested.
 */

export type SegmentKind =
  | "urban" // dense city: shops, offices, towers behind a sound wall
  | "apartments" // long slabs of flats
  | "lowrise" // an old neighbourhood of small houses and wires
  | "industrial" // works, tanks, chimneys
  | "yard" // freight sidings and warehouses
  | "station" // the outskirts of a small station (or the one you stop at)
  | "suburb" // houses, gardens, a lit road
  | "fields" // paddies, greenhouses, a farmhouse
  | "forest" // close trees
  | "hills" // orchards on rolling ground
  | "river" // a bridge over water
  | "tunnel";

export interface Segment {
  kind: SegmentKind;
  /** Metres along the line. */
  start: number;
  end: number;
  /** Per-segment seed for its own variation. */
  seed: number;
}

/** A small, fast, deterministic generator (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A stable hash of integers into [0, 1). */
export function hash01(...n: number[]) {
  let h = 2166136261;
  for (const v of n) {
    h ^= Math.floor(v) | 0;
    h = Math.imul(h, 16777619);
    h ^= h >>> 13;
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** How long each kind of country lasts, in metres [min, max]. */
const LENGTH: Record<SegmentKind, [number, number]> = {
  urban: [520, 1100],
  apartments: [420, 900],
  lowrise: [380, 800],
  industrial: [380, 760],
  yard: [260, 520],
  station: [240, 380],
  suburb: [420, 900],
  fields: [600, 1400],
  forest: [420, 1000],
  hills: [500, 1100],
  river: [170, 260],
  tunnel: [280, 900],
};

/** What tends to follow what, as a real line leaves a city and crosses the country. */
const NEXT: Record<SegmentKind, Partial<Record<SegmentKind, number>>> = {
  urban: { apartments: 4, industrial: 2, yard: 1.5, river: 1.5, station: 1.2, lowrise: 1.5 },
  apartments: { urban: 2, lowrise: 2.5, suburb: 2.5, river: 1.2, station: 1, industrial: 1 },
  lowrise: { apartments: 2, suburb: 2.5, station: 1.4, fields: 1.5, industrial: 1 },
  industrial: { yard: 2.5, urban: 1.5, lowrise: 1.5, river: 1.2, fields: 1 },
  yard: { industrial: 2, urban: 2, station: 2, lowrise: 1 },
  station: { lowrise: 2, suburb: 2, urban: 1.5, fields: 1.5, apartments: 1.5 },
  suburb: { fields: 3, lowrise: 1.5, forest: 1.5, station: 1.2, apartments: 1.2, hills: 1 },
  fields: { hills: 2.5, forest: 2, suburb: 2, river: 1.5, station: 1.2, tunnel: 0.6 },
  forest: { tunnel: 2.2, hills: 2, fields: 1.5, river: 1 },
  hills: { tunnel: 2.2, forest: 2, fields: 2, suburb: 1.2 },
  river: { apartments: 1.5, fields: 2, suburb: 1.5, urban: 1.2, forest: 1, industrial: 1 },
  tunnel: { forest: 2.5, hills: 2, fields: 2, suburb: 1, river: 0.8 },
};

function pick(weights: Partial<Record<SegmentKind, number>>, r: number): SegmentKind {
  const entries = Object.entries(weights) as [SegmentKind, number][];
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let x = r * total;
  for (const [k, w] of entries) {
    x -= w;
    if (x <= 0) return k;
  }
  return entries[entries.length - 1][0];
}

export interface Override {
  kind: SegmentKind;
  start: number;
  end: number;
}

/**
 * The line, generated lazily as the train goes: `at(s)` gives the stretch
 * of country at distance s. Overrides (the station you're stopping at, a
 * tunnel asked for) cover whatever the line would have had there.
 */
export class Route {
  private segs: Segment[] = [];
  private next: () => number;
  private overrides: Override[] = [];

  constructor(
    readonly seed: number,
    first: SegmentKind = "station",
  ) {
    this.next = rng(seed);
    const len = 320;
    this.segs.push({ kind: first, start: -400, end: len, seed: Math.floor(this.next() * 1e9) });
  }

  private grow(until: number) {
    while (this.segs[this.segs.length - 1].end < until) {
      const last = this.segs[this.segs.length - 1];
      let kind = pick(NEXT[last.kind], this.next());
      // Never two stations or two tunnels back to back.
      if (kind === last.kind) kind = pick(NEXT[kind], this.next());
      const [lo, hi] = LENGTH[kind];
      const len = lo + (hi - lo) * this.next();
      this.segs.push({ kind, start: last.end, end: last.end + len, seed: Math.floor(this.next() * 1e9) });
    }
  }

  /** The stretch of line under distance s (overrides first). */
  at(s: number): Segment {
    for (const o of this.overrides) if (s >= o.start && s < o.end) return { kind: o.kind, start: o.start, end: o.end, seed: hash01(o.start, 77) * 1e9 };
    this.grow(s + 1);
    let lo = 0;
    let hi = this.segs.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.segs[mid].end <= s) lo = mid + 1;
      else hi = mid;
    }
    return this.segs[lo];
  }

  /** Every stretch overlapping [a, b), in order, with overrides cut in. */
  between(a: number, b: number): Segment[] {
    const out: Segment[] = [];
    let s = a;
    while (s < b) {
      const seg = this.at(s);
      let end = Math.min(seg.end, b);
      const cut = this.overrides.find((o) => o.start > s && o.start < end);
      if (cut) end = cut.start;
      if (end <= s) break;
      out.push({ ...seg, start: s, end });
      s = end;
    }
    return out;
  }

  /** Force a kind of country over [start, end) (a station ahead, a tunnel on request). */
  override(kind: SegmentKind, start: number, end: number) {
    this.overrides = this.overrides.filter((o) => o.end <= start || o.start >= end || o.kind !== kind);
    this.overrides.push({ kind, start, end });
    this.overrides.sort((x, y) => x.start - y.start);
  }

  /** Drop overrides of a kind that start at or after s (a stop that was moved or cancelled). */
  clear(kind: SegmentKind, from = -Infinity) {
    this.overrides = this.overrides.filter((o) => o.kind !== kind || o.start < from);
  }

  /** Forget overrides far behind the train. */
  prune(behind: number) {
    this.overrides = this.overrides.filter((o) => o.end > behind);
  }

  /** The tunnel (if any) that overlaps [a, b], with its full extent (joined across adjacent stretches). */
  tunnelNear(a: number, b: number): [number, number] | null {
    const hit = this.between(a, b).find((seg) => seg.kind === "tunnel");
    if (!hit) return null;
    let start = hit.start;
    let end = hit.end;
    for (let i = 0; i < 20 && this.at(start - 0.5).kind === "tunnel"; i++) start = this.at(start - 0.5).start;
    for (let i = 0; i < 20 && this.at(end).kind === "tunnel"; i++) end = this.at(end).end;
    return [start, end];
  }
}

/** How a kind of country dresses: which props, how dense, and the hills behind. */
export interface Dressing {
  /** Height of the far ridges (0 flat … 1 mountains). */
  relief: number;
  /** Lit windows and lamps at night (0 … 1). */
  lights: number;
  ground: "urban" | "grass" | "field" | "gravel" | "water";
}

export const DRESSING: Record<SegmentKind, Dressing> = {
  urban: { relief: 0.15, lights: 1, ground: "urban" },
  apartments: { relief: 0.3, lights: 0.9, ground: "urban" },
  lowrise: { relief: 0.35, lights: 0.6, ground: "urban" },
  industrial: { relief: 0.2, lights: 0.7, ground: "gravel" },
  yard: { relief: 0.2, lights: 0.6, ground: "gravel" },
  station: { relief: 0.3, lights: 0.8, ground: "urban" },
  suburb: { relief: 0.45, lights: 0.5, ground: "grass" },
  fields: { relief: 0.6, lights: 0.15, ground: "field" },
  forest: { relief: 0.85, lights: 0.05, ground: "grass" },
  hills: { relief: 0.9, lights: 0.15, ground: "grass" },
  river: { relief: 0.4, lights: 0.4, ground: "water" },
  tunnel: { relief: 1, lights: 0, ground: "grass" },
};
