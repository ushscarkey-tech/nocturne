"use client";

import { useEffect, useRef } from "react";
import type { CarriageId } from "@/core/types";
import { usePrefersReducedMotion } from "@/lib/hooks";

export type SceneMode = "platform" | "night" | "tunnel" | "still";

type RGB = readonly [number, number, number];

// Lamps are warm and low, signals muted; nothing reaches pure white.
const LAMP: RGB = [236, 196, 128];
const LAMP_DEEP: RGB = [214, 150, 80];
const SODIUM: RGB = [222, 160, 94];
const FLUO: RGB = [240, 222, 176];
const PAPER: RGB = [239, 230, 211];
const TV: RGB = [150, 176, 212];
const COOL: RGB = [190, 204, 208];
const MOUTH: RGB = [176, 190, 196];
const SIG_RED: RGB = [204, 92, 74];
const SIG_AMBER: RGB = [222, 168, 92];
const SIG_GREEN: RGB = [126, 192, 162];
const TAIL: RGB = [176, 72, 60];
const HEAD: RGB = [240, 228, 200];

/** How the carriage light tints its own reflection in the glass. */
const TINT: Record<CarriageId, RGB> = {
  quiet: [226, 204, 166],
  rain: [160, 178, 192],
  tunnel: [222, 168, 102],
  moon: [202, 208, 214],
};

// Parallax: screen widths a layer slides per second at cruising speed.
const K_RIDGE = 0.005;
const K_FAR = 0.008; // distant town, the mountain road
const K_BLOCKS = 0.014;
const K_RIVER = 0.02; // the far bank of a river
const K_MID = 0.024; // houses and fields
const K_POLES = 0.09;
const K_HALT = 0.1;
const K_NEAR = 0.22; // catenary, signals, bridge truss: ~4.5 s across
const K_WALL = 0.45; // tunnel wall, right outside the glass
const LAMP_EVERY = 3.2; // seconds of travel between tunnel lamps
const FRAME_MS = 1000 / 30; // slow scenery gains nothing from 60 fps

const rgba = (c: RGB, a: number) => `rgba(${c[0]},${c[1]},${c[2]},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (a: number, b: number, v: number) => {
  const x = clamp01((v - a) / (b - a));
  return x * x * (3 - 2 * x);
};
const wrap = (v: number) => ((v % 1) + 1) % 1;
const hash = (i: number) => {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};
function rng(seed: number) {
  let s = seed | 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 10000) / 10000;
  };
}

// A mountain road in hill-local coordinates (u across, e up): switchbacks to a pass.
const ROAD: readonly (readonly [number, number])[] = [
  [0.02, 0],
  [0.38, 0.22],
  [0.22, 0.36],
  [0.52, 0.55],
  [0.44, 0.7],
  [0.62, 0.8],
  [0.8, 0.45],
  [1, 0.04],
];
const ROAD_LEN = (() => {
  const acc = [0];
  for (let i = 1; i < ROAD.length; i++) {
    const du = ROAD[i][0] - ROAD[i - 1][0];
    const de = (ROAD[i][1] - ROAD[i - 1][1]) * 0.4;
    acc.push(acc[i - 1] + Math.hypot(du, de));
  }
  return acc;
})();
/** A point along the road, by fraction of its length. */
function roadAt(s: number): readonly [number, number] {
  const d = clamp01(s) * ROAD_LEN[ROAD_LEN.length - 1];
  let i = 1;
  while (i < ROAD_LEN.length - 1 && ROAD_LEN[i] < d) i++;
  const f = (d - ROAD_LEN[i - 1]) / (ROAD_LEN[i] - ROAD_LEN[i - 1] || 1);
  return [lerp(ROAD[i - 1][0], ROAD[i][0], f), lerp(ROAD[i - 1][1], ROAD[i][1], f)];
}
const ROAD_LAMPS = Array.from({ length: 24 }, (_, i) => roadAt((i + 0.5) / 24));
const hillAt = (u: number) => Math.pow(Math.max(0, Math.sin(Math.PI * clamp01(u))), 0.8);

// Scenery that comes and goes, placed along the line in seconds of travel.
type Block = { x: number; w: number; h: number; cols: number; rows: number; win: Uint8Array; tank: boolean; warn: boolean; seed: number };
type Base = { at: number; k: number; ext: number };
type Piece = Base &
  (
    | { kind: "blocks"; blocks: Block[] }
    | { kind: "signal"; aspect: RGB }
    | { kind: "crossing"; phase: number }
    | { kind: "poles"; count: number; gap: number; lamps: boolean[] }
    | { kind: "river"; span: number; bank: { u: number; a: number; c: RGB }[] }
    | { kind: "road"; car: number; dir: 1 | -1; carNext: number }
    | { kind: "halt"; lit: boolean }
  );
type FarKind = "blocks" | "road" | "river" | "halt";
type NearKind = "signal" | "crossing" | "poles";

type Bead = { x: number; y: number; r: number; run: boolean; vy: number; dx: number; dy: number; trail: number; a: number };

// Cached sprites: one soft gradient per colour, reused for every lamp every frame.
const sprites = new Map<string, HTMLCanvasElement>();
function sprite(key: string, size: number, paint: (g: CanvasRenderingContext2D, s: number) => void) {
  let cv = sprites.get(key);
  if (!cv) {
    cv = document.createElement("canvas");
    cv.width = cv.height = size;
    const g = cv.getContext("2d");
    if (g) paint(g, size);
    sprites.set(key, cv);
  }
  return cv;
}
const halo = (c: RGB) =>
  sprite(`h${c.join(",")}`, 128, (g, s) => {
    const r = s / 2;
    const grad = g.createRadialGradient(r, r, 0, r, r, r);
    grad.addColorStop(0, rgba(c, 1));
    grad.addColorStop(0.15, rgba(c, 0.55));
    grad.addColorStop(0.45, rgba(c, 0.16));
    grad.addColorStop(1, rgba(c, 0));
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
  });
const bandSprite = () =>
  sprite("band", 64, (g, s) => {
    const grad = g.createLinearGradient(0, 0, 0, s);
    grad.addColorStop(0, rgba(PAPER, 0));
    grad.addColorStop(0.5, rgba(PAPER, 1));
    grad.addColorStop(1, rgba(PAPER, 0));
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
  });
const beadSprite = () =>
  sprite("bead", 32, (g, s) => {
    const r = s / 2;
    g.fillStyle = "rgba(6,9,12,0.45)";
    g.beginPath();
    g.arc(r, r, r * 0.85, 0, Math.PI * 2);
    g.fill();
    // Light gathers at the bottom rim and in a tiny highlight.
    g.strokeStyle = "rgba(214,224,228,0.5)";
    g.lineWidth = 3;
    g.beginPath();
    g.arc(r, r, r * 0.66, Math.PI * 0.15, Math.PI * 0.85);
    g.stroke();
    g.fillStyle = "rgba(239,230,211,0.85)";
    g.beginPath();
    g.arc(r * 0.72, r * 0.68, r * 0.2, 0, Math.PI * 2);
    g.fill();
  });

/** Soft light from the sprite cache; multiplies with the current alpha. */
function glow(ctx: CanvasRenderingContext2D, c: RGB, x: number, y: number, rx: number, ry: number, a: number) {
  if (a <= 0.004 || rx <= 0 || ry <= 0) return;
  const prev = ctx.globalAlpha;
  ctx.globalAlpha = prev * Math.min(1, a);
  ctx.drawImage(halo(c), x - rx, y - ry, rx * 2, ry * 2);
  ctx.globalAlpha = prev;
}

/** Tunnel wall tile: horizontal streaks read as a close wall in motion, never as flicker. */
function buildWall(w: number, h: number, dpr: number) {
  const tw = Math.max(320, Math.round(w * 0.9));
  const cv = document.createElement("canvas");
  cv.width = Math.round(tw * dpr);
  cv.height = Math.round(h * dpr);
  const g = cv.getContext("2d");
  if (!g) return null;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const r = rng(4242);
  const base = g.createLinearGradient(0, 0, 0, h);
  base.addColorStop(0, "#030405");
  base.addColorStop(0.3, "#090b0c");
  base.addColorStop(0.72, "#0a0c0d");
  base.addColorStop(1, "#030405");
  g.fillStyle = base;
  g.fillRect(0, 0, tw, h);
  for (let i = 0; i < 520; i++) {
    const y = r() * h;
    const x = r() * tw;
    const len = 20 + r() * 150;
    const th = 1 + r() * 2;
    g.fillStyle = r() > 0.5 ? `rgba(40,44,42,${(0.03 + r() * 0.05).toFixed(3)})` : `rgba(0,0,0,${(0.1 + r() * 0.15).toFixed(3)})`;
    g.fillRect(x, y, len, th);
    if (x + len > tw) g.fillRect(x - tw, y, len, th);
  }
  // Lining ring joints.
  for (let j = 0; j < 3; j++) {
    const x = (j * tw) / 3;
    g.fillStyle = "rgba(0,0,0,0.2)";
    g.fillRect(x, 0, 3, h);
    g.fillStyle = "rgba(44,46,42,0.05)";
    g.fillRect(x + 3, 0, 1, h);
  }
  // Cable runs sagging between brackets.
  const brackets = 6;
  const bw = tw / brackets;
  g.fillStyle = "rgba(2,3,3,0.9)";
  for (let j = 0; j < brackets; j++) g.fillRect(j * bw, h * 0.545, 3, h * 0.07);
  for (const [yy, sag] of [
    [0.555, 3],
    [0.575, 4],
    [0.6, 5],
  ] as const) {
    g.strokeStyle = "rgba(16,18,17,0.95)";
    g.lineWidth = 1.6;
    g.beginPath();
    for (let j = 0; j < brackets; j++) {
      g.moveTo(j * bw, h * yy);
      g.quadraticCurveTo((j + 0.5) * bw, h * yy + sag * 2, (j + 1) * bw, h * yy);
    }
    g.stroke();
    g.strokeStyle = "rgba(70,64,54,0.1)";
    g.lineWidth = 0.8;
    g.stroke();
  }
  // A walkway ledge low on the wall.
  g.fillStyle = "rgba(0,0,0,0.32)";
  g.fillRect(0, h * 0.78, tw, h * 0.03);
  g.fillStyle = "rgba(48,46,40,0.1)";
  g.fillRect(0, h * 0.78, tw, 1);
  return { cv, tw };
}

function roundRectPath(p: Path2D, x: number, y: number, w: number, h: number, r: number) {
  p.moveTo(x + r, y);
  p.lineTo(x + w - r, y);
  p.quadraticCurveTo(x + w, y, x + w, y + r);
  p.lineTo(x + w, y + h - r);
  p.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  p.lineTo(x + r, y + h);
  p.quadraticCurveTo(x, y + h, x, y + h - r);
  p.lineTo(x, y + r);
  p.quadraticCurveTo(x, y, x + r, y);
  p.closePath();
}

/** The carriage reflected in the glass: seat backs across the lower half, the opposite window. */
function reflectionPaths(w: number, h: number) {
  const seats = new Path2D();
  const rests = new Path2D();
  const n = w < 700 ? 3 : 5;
  const pitch = w / n;
  const top = h * 0.6;
  for (let i = 0; i < n; i++) {
    const x = i * pitch + pitch * 0.1;
    const sw = pitch * 0.8;
    const r = Math.min(20, sw * 0.12);
    seats.moveTo(x, h);
    seats.lineTo(x, top + r);
    seats.quadraticCurveTo(x, top, x + r, top);
    seats.lineTo(x + sw - r, top);
    seats.quadraticCurveTo(x + sw, top, x + sw, top + r);
    seats.lineTo(x + sw, h);
    seats.closePath();
    roundRectPath(rests, x + sw * 0.32, top + 5, sw * 0.36, h * 0.03, 4);
  }
  const frame = new Path2D();
  roundRectPath(frame, w * 0.06, h * 0.21, w * 0.88, h * 0.39, 18);
  return { seats, rests, frame };
}

/**
 * The view from a late local train. Everything eases: the train pulls away
 * slowly, a rainy platform slides in and comes to rest on arrival, the
 * outside darkens before tunnel lamps appear. Scenery arrives now and then
 * (blocks of flats, a river, a mountain road, signals) so the window changes
 * every minute or two without ever asking to be watched.
 */
export function NightScene({
  mode,
  carriage,
  stationName,
  terminal = false,
}: {
  mode: SceneMode;
  carriage: CarriageId;
  stationName?: string;
  /** The end of the line: a longer platform with more lamps. */
  terminal?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const target = useRef({ mode, carriage, stationName, terminal });
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    target.current = { mode, carriage, stationName, terminal };
  }, [mode, carriage, stationName, terminal]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let width = 0;
    let height = 0;
    let dpr = 1;
    let dirty = true;
    let wall: { cv: HTMLCanvasElement; tw: number } | null = null;
    let glass = reflectionPaths(1, 1);
    // Offscreen layer for the tunnel wall while it recedes; allocated only then.
    const cover = document.createElement("canvas");
    const cctx = cover.getContext("2d");
    const freeCover = () => {
      cover.width = 0;
      cover.height = 0;
    };
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      wall = null; // rebuilt lazily at the next tunnel
      glass = reflectionPaths(width, height);
      dirty = true;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // Fixed seed for the lie of the land; a fresh one for what passes tonight.
    const rand = rng(90210);
    const chance = rng((Date.now() % 2147483) + 7);
    // A ridge line that tiles seamlessly.
    const ridge = Array.from({ length: 48 }, (_, i) => 0.5 + 0.5 * Math.sin(i * 0.55) * 0.5 + rand() * 0.35);
    ridge.push(ridge[0]);
    const houses = Array.from({ length: 12 }, () => ({
      x: rand(),
      w: 0.03 + rand() * 0.05,
      h: 0.03 + rand() * 0.05,
      lit: rand() > 0.45,
      litX: rand(),
    }));
    const town = Array.from({ length: 46 }, () => ({ x: rand(), y: rand(), r: 0.5 + rand() * 0.9, a: 0.25 + rand() * 0.5 }));
    const stars = Array.from({ length: 40 }, () => ({ x: rand(), y: rand() * 0.35, a: 0.1 + rand() * 0.35 }));
    const outsideRain = Array.from({ length: 90 }, () => ({ x: rand(), y: rand(), v: 0.5 + rand() * 0.6 }));
    const newBead = (settled: boolean): Bead => ({
      x: chance(),
      y: chance() * 0.95,
      r: 0.7 + chance() * 1.6,
      run: false,
      vy: 0,
      dx: 0,
      dy: 1,
      trail: 0,
      a: settled ? 1 : 0,
    });
    const beads = Array.from({ length: 72 }, () => newBead(true));

    const start = target.current.mode;
    const st = {
      speed: start === "night" ? 1 : start === "tunnel" ? 1.1 : 0,
      dark: start === "tunnel" ? 1 : 0, // exterior darkening before the tunnel
      tunnel: start === "tunnel" ? 1 : 0,
      still: start === "still" ? 1 : 0,
      platformPos: start === "platform" || start === "still" ? 0 : -3,
      D: 0, // seconds of travel at cruising speed: where we are along the line
      clock: 0, // scene time; frozen for reduced motion
      tint: [...TINT[target.current.carriage]] as [number, number, number],
      nextFar: 50 + chance() * 40,
      nextNear: 10 + chance() * 15,
      lastFar: "" as FarKind | "",
      lastNear: "" as NearKind | "",
      portal: -1, // travel since the tunnel mouth, while its lamps pass
      exit: -1, // seconds since leaving the tunnel
      sweep: 0,
      rest: 0, // seconds stopped at the platform
      restNext: 70 + chance() * 50,
      farTrain: null as null | { x: number; dir: 1 | -1; cars: number },
    };
    let prevMode = start;
    let drawnKey = "";
    const pieces: Piece[] = [];

    const makeBlocks = (at: number): Piece => {
      const n = 2 + Math.floor(chance() * 3);
      const blocks: Block[] = [];
      let x = 0;
      for (let i = 0; i < n; i++) {
        const cols = 4 + Math.floor(chance() * 5);
        const rows = 7 + Math.floor(chance() * 9);
        const win = new Uint8Array(cols * rows);
        for (let j = 0; j < win.length; j++) if (chance() < 0.13) win[j] = chance() < 0.2 ? 2 : 1;
        const w = 0.03 + chance() * 0.03;
        blocks.push({ x, w, h: 0.08 + chance() * 0.12, cols, rows, win, tank: chance() < 0.5, warn: false, seed: chance() * 100 });
        x += w + 0.008 + chance() * 0.04;
      }
      blocks.reduce((a, b) => (b.h > a.h ? b : a)).warn = chance() < 0.6;
      return { kind: "blocks", at, k: K_BLOCKS, ext: x, blocks };
    };
    const makeRoad = (at: number): Piece => ({ kind: "road", at, k: K_FAR, ext: 0.55, car: -1, dir: 1, carNext: st.clock + 8 + chance() * 25 });
    const makeRiver = (at: number): Piece => {
      const span = 12 + chance() * 5;
      const bank = Array.from({ length: 14 }, () => ({
        u: chance() * 1.3,
        a: 0.3 + chance() * 0.45,
        c: chance() < 0.65 ? SODIUM : chance() < 0.7 ? LAMP : COOL,
      }));
      return { kind: "river", at, k: K_RIVER, ext: span * 1.3 * K_RIVER, span, bank };
    };
    const lead = (k: number) => 0.62 / k; // starts just past the right edge

    const overlaps = (kind: Piece["kind"], from: number, to: number) =>
      pieces.some((p) => {
        if (p.kind !== kind) return false;
        const end = p.kind === "river" ? p.at + p.span : p.at + p.ext / p.k;
        return p.at - 3 < to && end + 3 > from;
      });

    const spawnFar = () => {
      const weights: [FarKind, number][] = [
        ["blocks", 3],
        ["road", 2],
        ["river", 1.3],
        ["halt", 1.5],
      ];
      const pool = weights.filter(([k]) => k !== st.lastFar);
      let pick = chance() * pool.reduce((s, [, w]) => s + w, 0);
      let kind: FarKind = pool[0][0];
      for (const [k, w] of pool) {
        pick -= w;
        if (pick <= 0) {
          kind = k;
          break;
        }
      }
      if (kind === "river") {
        const at = st.D + lead(K_RIVER);
        if (overlaps("halt", at, at + 17) || overlaps("crossing", at, at + 17)) kind = "blocks";
        else pieces.push(makeRiver(at));
      }
      if (kind === "blocks") pieces.push(makeBlocks(st.D + lead(K_BLOCKS)));
      if (kind === "road") pieces.push(makeRoad(st.D + lead(K_FAR)));
      if (kind === "halt") {
        const at = st.D + lead(K_HALT);
        if (overlaps("river", at, at + 10)) return;
        pieces.push({ kind: "halt", at, k: K_HALT, ext: 0.9, lit: chance() < 0.6 });
      }
      st.lastFar = kind;
    };
    const spawnNear = (): boolean => {
      const options: NearKind[] = ["signal", "signal", "signal", "crossing", "poles"];
      const pool = options.filter((k) => k !== st.lastNear || k === "signal");
      const kind = pool[Math.floor(chance() * pool.length)];
      if (kind === "signal") {
        const at = st.D + lead(K_NEAR);
        if (overlaps("river", at, at + 4)) return false;
        const aspect = chance() < 0.7 ? SIG_GREEN : SIG_AMBER;
        pieces.push({ kind: "signal", at, k: K_NEAR, ext: 0.02, aspect });
        if (chance() < 0.3) pieces.push({ kind: "signal", at: at + 2.4 + chance(), k: K_NEAR, ext: 0.02, aspect: SIG_GREEN });
      } else if (kind === "crossing") {
        // The road runs off toward the horizon, so it enters with the far fields.
        const at = st.D + lead(K_MID);
        if (overlaps("river", at - 2, at + 3) || overlaps("halt", at - 2, at + 3)) return false;
        pieces.push({ kind: "crossing", at, k: K_MID, ext: 0.03, phase: chance() * 6 });
      } else {
        const at = st.D + lead(K_POLES);
        const count = 5 + Math.floor(chance() * 5);
        const gap = 3.4;
        if (overlaps("halt", at, at + count * gap) || overlaps("river", at, at + count * gap)) return false;
        const lamps = Array.from({ length: count }, () => chance() < 0.25);
        pieces.push({ kind: "poles", at, k: K_POLES, ext: count * gap * K_POLES + 0.05, count, gap, lamps });
      }
      st.lastNear = kind;
      return true;
    };
    // Something to look at from the first minute (and in the still frame for reduced motion).
    if (chance() < 0.5) pieces.push(makeBlocks(st.D + (0.64 - 0.5) / K_BLOCKS));
    else pieces.push(makeRoad(st.D + (0.06 - 0.5) / K_FAR));
    st.lastFar = pieces[0].kind === "road" ? "road" : "blocks";

    const ease = (cur: number, to: number, rate: number, dt: number) => (reduced ? to : cur + (to - cur) * (1 - Math.exp(-rate * dt)));
    const xOf = (p: Piece) => (0.5 + (p.at - st.D) * p.k) * width;

    // ---- Update --------------------------------------------------------------------------
    const update = (dt: number) => {
      const { mode: m, carriage: c } = target.current;
      const moving = m === "night" || m === "tunnel";
      const goalSpeed = reduced ? 0 : m === "tunnel" ? 1.1 : m === "night" ? 1 : 0;
      const cdt = reduced ? 0 : dt;
      st.clock += cdt;

      // Leaving a tunnel is a sequence: light ahead, the wall recedes, the land returns.
      if (prevMode === "tunnel" && m !== "tunnel" && st.tunnel > 0.2 && !reduced) st.exit = 0;
      if (m === "tunnel" && prevMode !== "tunnel") {
        if (st.exit >= 0) {
          if (st.sweep > 0.2) st.tunnel = 0;
          st.exit = -1;
          st.sweep = 0;
          freeCover();
        }
        if (!reduced && st.dark < 0.5) st.portal = 0;
      }
      prevMode = m;
      if (st.exit >= 0) {
        st.exit += dt;
        st.sweep = smooth(2.6, 6.2, st.exit);
        if (st.exit > 8.5) {
          st.exit = -1;
          st.sweep = 0;
          st.tunnel = 0;
          freeCover();
        }
      }

      // Trains take their time: slow acceleration, slower braking into a platform.
      st.speed = ease(st.speed, goalSpeed, goalSpeed > st.speed ? 0.22 : 0.32, dt);
      const holdDark = st.exit >= 0 && st.exit < 2.8;
      st.dark = ease(st.dark, m === "tunnel" || holdDark ? 1 : 0, m === "tunnel" ? 0.45 : 0.35, dt);
      st.tunnel = ease(st.tunnel, (m === "tunnel" && st.dark > 0.75) || st.exit >= 0 ? 1 : 0, 0.5, dt);
      st.still = ease(st.still, m === "still" ? 1 : 0, 0.25, dt);
      const tint = TINT[c];
      for (let i = 0; i < 3; i++) st.tint[i] = ease(st.tint[i], tint[i], 0.5, dt);

      // Platform: slides in from the right while braking, rests, then slips away left on departure.
      if (!moving) {
        if (st.platformPos < -1.2) st.platformPos = 1.4;
        st.platformPos = ease(st.platformPos, 0, 0.34, dt);
      } else if (reduced) {
        st.platformPos = -3;
      } else if (st.platformPos > -3) {
        st.platformPos -= dt * st.speed * 0.14 + dt * 0.006;
      }

      const v = st.speed;
      st.D += dt * v;
      if (st.portal >= 0) {
        st.portal += dt * v;
        if (st.portal > 7) st.portal = -1;
      }

      // Now and then something new along the line.
      if (m === "night" && st.exit < 0 && !reduced) {
        if (st.D >= st.nextFar) {
          spawnFar();
          st.nextFar = st.D + 55 + chance() * 60;
        }
        if (st.D >= st.nextNear) st.nextNear = st.D + (spawnNear() ? 16 + chance() * 30 : 5);
      }
      for (let i = pieces.length - 1; i >= 0; i--) {
        const p = pieces[i];
        if (0.5 + (p.at - st.D) * p.k + p.ext < -0.2) pieces.splice(i, 1);
      }
      for (const p of pieces) {
        if (p.kind === "blocks" && cdt > 0) {
          // Very rarely someone goes to bed (or gets up).
          for (const b of p.blocks) {
            if (chance() < cdt / 50) {
              const j = Math.floor(chance() * b.win.length);
              if (b.win[j]) b.win[j] = 0;
            } else if (chance() < cdt / 160) {
              b.win[Math.floor(chance() * b.win.length)] = 1;
            }
          }
        } else if (p.kind === "road" && cdt > 0) {
          if (p.car < 0 && st.clock > p.carNext) {
            p.car = 0;
            p.dir = chance() < 0.5 ? 1 : -1;
          } else if (p.car >= 0) {
            p.car += cdt * 0.012;
            if (p.car > 1) {
              p.car = -1;
              p.carNext = st.clock + 25 + chance() * 60;
            }
          }
        }
      }

      // Stopped at the platform, a distant train sometimes slides by behind it.
      if (st.farTrain) {
        st.farTrain.x += cdt * 0.05 * st.farTrain.dir;
        if (st.farTrain.x > 1.2 || st.farTrain.x < -0.3 - st.farTrain.cars * 0.265) st.farTrain = null;
      } else if (m === "platform" && Math.abs(st.platformPos) < 0.02 && cdt > 0) {
        st.rest += cdt;
        if (st.rest >= st.restNext) {
          const dir = chance() < 0.5 ? 1 : -1;
          const cars = 3 + Math.floor(chance() * 3);
          st.farTrain = { dir, cars, x: dir > 0 ? -cars * 0.265 - 0.05 : 1.05 };
          st.rest = 0;
          st.restNext = 120 + chance() * 60;
        }
      }

      // Rain on the glass: beads rest, then now and then one lets go and runs.
      if (c === "rain" && !reduced) {
        for (const r of outsideRain) r.y = (r.y + dt * r.v) % 1;
        const fresh = st.tunnel < 0.5 ? 1 : 0; // nothing new lands in a tunnel
        for (const b of beads) {
          if (b.r <= 0) {
            // Dried off in the tunnel; fresh drops land again outside.
            if (fresh && chance() < dt * 0.3) Object.assign(b, newBead(false));
            continue;
          }
          b.a = Math.min(1, b.a + dt * 0.6);
          if (!b.run) {
            if (b.r > 1.1 && chance() < dt * (0.005 + 0.03 * v) * (0.3 + 0.7 * fresh)) {
              b.run = true;
              b.vy = 0.02 + chance() * 0.04;
              b.trail = 0;
            } else if (v > 0.2) {
              b.x -= dt * v * 0.0015;
            }
          } else {
            // Moving air pushes running drops back along the carriage.
            const vx = -v * 0.022;
            const vy = b.vy * (1 - 0.35 * v);
            b.x += vx * dt;
            b.y += vy * dt;
            const px = vx * width;
            const py = vy * height;
            const len = Math.hypot(px, py) || 1;
            b.dx = px / len;
            b.dy = py / len;
            b.trail = Math.min(46, b.trail + len * dt);
          }
          if (b.y > 1.02 || b.x < -0.02) Object.assign(b, newBead(false), fresh ? {} : { a: 0, r: 0 });
        }
      }
    };

    // ---- Draw ----------------------------------------------------------------------------
    const drawRoad = (p: Extract<Piece, { kind: "road" }>, ex: number, horizon: number) => {
      const x0 = xOf(p);
      const W = p.ext * width;
      const H = Math.min(height * 0.17, W * 0.34); // a hill, not a spike, on narrow screens
      if (x0 > width + 20 || x0 + W < -20) return;
      ctx.fillStyle = `rgba(9,14,14,${ex.toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(x0 - W * 0.05, horizon);
      for (let i = 0; i <= 20; i++) ctx.lineTo(x0 + (i / 20) * W, horizon - H * hillAt(i / 20));
      ctx.lineTo(x0 + W * 1.05, horizon);
      ctx.fill();
      // The road itself, barely lit between the lamps.
      ctx.strokeStyle = rgba(SODIUM, 0.06 * ex);
      ctx.lineWidth = 1.4;
      ctx.lineJoin = "round";
      ctx.beginPath();
      for (const [u, e] of ROAD) ctx.lineTo(x0 + u * W, horizon - e * H);
      ctx.stroke();
      ctx.fillStyle = rgba(SODIUM, 0.8 * ex);
      for (const [u, e] of ROAD_LAMPS) {
        const x = x0 + u * W;
        const y = horizon - e * H;
        glow(ctx, SODIUM, x, y, 7, 7, 0.26 * ex);
        ctx.fillRect(x - 0.7, y - 0.7, 1.4, 1.4);
      }
      if (p.car >= 0) {
        const [u, e] = roadAt(p.dir > 0 ? p.car : 1 - p.car);
        const x = x0 + u * W;
        const y = horizon - e * H - 1;
        const c = p.dir > 0 ? HEAD : TAIL;
        glow(ctx, c, x, y, 9, 7, 0.32 * ex);
        ctx.fillStyle = rgba(c, 0.85 * ex);
        ctx.fillRect(x - 0.9, y - 0.9, 1.8, 1.8);
      }
    };

    const drawBlocks = (p: Extract<Piece, { kind: "blocks" }>, ex: number, horizon: number) => {
      const x0 = xOf(p);
      for (const b of p.blocks) {
        const bx = x0 + b.x * width;
        const bw = b.w * width;
        const bh = Math.min(b.h * height, bw * 4.5);
        const by = horizon + 4 - bh;
        if (bx > width || bx + bw < 0) continue;
        ctx.fillStyle = `rgba(7,10,13,${ex.toFixed(3)})`;
        ctx.fillRect(bx, by, bw, bh);
        if (b.tank) ctx.fillRect(bx + bw * 0.6, by - 5, bw * 0.22, 5);
        const cw = bw / b.cols;
        const rh = (bh - 8) / b.rows;
        const ww = Math.max(1, cw * 0.42);
        const wh = Math.max(1, rh * 0.42);
        for (let i = 0; i < b.win.length; i++) {
          const s = b.win[i];
          if (!s) continue;
          const col = i % b.cols;
          const row = (i / b.cols) | 0;
          const a =
            s === 1 ? (0.32 + hash(i * 7.3 + b.seed) * 0.34) * ex : 0.3 * (0.86 + 0.14 * Math.sin(st.clock * 0.7 + i * 1.3 + b.seed)) * ex;
          ctx.fillStyle = rgba(s === 1 ? LAMP : TV, a);
          ctx.fillRect(bx + col * cw + (cw - ww) / 2, by + 4 + row * rh, ww, wh);
        }
        if (b.warn) {
          // An aircraft warning lamp, breathing rather than blinking.
          const a = (0.3 + 0.15 * Math.sin(st.clock * 0.9 + b.seed)) * ex;
          glow(ctx, SIG_RED, bx + bw / 2, by - 3, 6, 6, a * 0.8);
          ctx.fillStyle = rgba(SIG_RED, a * 1.6);
          ctx.fillRect(bx + bw / 2 - 0.8, by - 3.8, 1.6, 1.6);
        }
      }
    };

    const riverEdges = (p: Extract<Piece, { kind: "river" }>, top: number) => {
      const xf = (tau: number) => (0.5 + (tau - st.D) * K_RIVER) * width;
      const xn = (tau: number) => (0.5 + (tau - st.D) * K_NEAR) * width;
      return { top, l0: xf(p.at), r0: xf(p.at + p.span), l1: xn(p.at), r1: xn(p.at + p.span), xf };
    };

    const streak = (x: number, y: number, c: RGB, a: number, i: number, ex: number) => {
      // A reflection broken into slow ripples that drift down the water.
      const len = height * 0.2 * (0.5 + a);
      const n = 8;
      for (let j = 0; j < n; j++) {
        const f = j / n;
        const sh = 0.55 + 0.45 * Math.sin(st.clock * 0.9 - j * 0.8 + i * 2.3);
        const wv = Math.sin(st.clock * 0.5 + j * 1.7 + i) * 1.6 * f;
        const w = 1.2 + f * 5;
        ctx.fillStyle = rgba(c, a * 0.32 * (1 - f * 0.8) * sh * ex);
        ctx.fillRect(x - w / 2 + wv, y + f * len, w, (len / n) * 0.55);
      }
    };

    const drawRiver = (p: Extract<Piece, { kind: "river" }>, ex: number, horizon: number) => {
      const e = riverEdges(p, horizon + 2);
      if (Math.max(e.r0, e.r1) < 0 || Math.min(e.l0, e.l1) > width) {
        // Only the far shore's lights may still be in view.
      } else {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(e.l0, e.top);
        ctx.lineTo(e.r0, e.top);
        ctx.lineTo(e.r1, height);
        ctx.lineTo(e.l1, height);
        ctx.closePath();
        const water = ctx.createLinearGradient(0, e.top, 0, height);
        water.addColorStop(0, `rgba(21,31,36,${ex.toFixed(3)})`);
        water.addColorStop(0.3, `rgba(12,19,23,${ex.toFixed(3)})`);
        water.addColorStop(1, `rgba(8,12,14,${ex.toFixed(3)})`);
        ctx.fillStyle = water;
        ctx.fill();
        // Dark banks soften the edge where the water meets the fields.
        ctx.strokeStyle = `rgba(5,8,8,${(0.8 * ex).toFixed(3)})`;
        ctx.lineWidth = 7;
        ctx.stroke();
        ctx.clip();
        ctx.fillStyle = `rgba(120,140,150,${(0.025 * ex).toFixed(3)})`;
        for (let j = 1; j < 6; j++) ctx.fillRect(0, e.top + (height - e.top) * (j / 6) ** 1.6, width, 1);
        p.bank.forEach((b, i) => {
          if (b.u <= 1) streak(e.xf(p.at + b.u * p.span), e.top + 1, b.c, b.a, i, ex);
        });
        // The distant town reflects too, where the river opens toward it.
        const lo = e.l0 - 6;
        const hi = e.r0 + 6;
        town.forEach((l, i) => {
          const x = wrap(l.x - st.D * K_FAR) * width;
          if (x > lo && x < hi && i % 2 === 0) streak(x, e.top + 1, LAMP, l.a * 0.6, i + 40, ex);
        });
        ctx.restore();
      }
      for (const b of p.bank) {
        const x = e.xf(p.at + b.u * p.span);
        if (x < -10 || x > width + 10) continue;
        glow(ctx, b.c, x, horizon - 1, 6, 6, b.a * 0.45 * ex);
        ctx.fillStyle = rgba(b.c, b.a * 1.2 * ex);
        ctx.fillRect(x - 0.7, horizon - 1.7, 1.4, 1.4);
      }
    };

    const trussSpan = (p: Extract<Piece, { kind: "river" }>) => {
      const xs = (tau: number) => (0.5 + (tau - st.D) * K_NEAR) * width;
      return { a: xs(p.at - 0.5), b: xs(p.at + p.span + 0.5), xs };
    };

    const drawTruss = (p: Extract<Piece, { kind: "river" }>, ex: number) => {
      const { a, b, xs } = trussSpan(p);
      if (b < -20 || a > width + 20) return;
      const topY = height * 0.12;
      const botY = height * 0.76;
      const n = Math.ceil((p.span + 1) / 1.5);
      const panel = (p.span + 1) / n;
      const dark = `rgba(5,7,9,${(0.96 * ex).toFixed(3)})`;
      ctx.fillStyle = dark;
      const l = Math.max(a, -10);
      const r = Math.min(b, width + 10);
      ctx.fillRect(l, topY - 5, r - l, 10);
      ctx.fillRect(l, botY - 4, r - l, 8);
      ctx.strokeStyle = dark;
      ctx.lineWidth = 5;
      ctx.beginPath();
      const hi: number[] = [];
      for (let i = 0; i <= n; i++) {
        const x = xs(p.at - 0.5 + i * panel);
        const nx = xs(p.at - 0.5 + (i + 1) * panel);
        if (x > width + 60 || (nx < -60 && i < n)) continue;
        ctx.moveTo(x, topY);
        ctx.lineTo(x, botY);
        hi.push(x);
        if (i < n) {
          ctx.moveTo(x, i % 2 ? topY : botY);
          ctx.lineTo(nx, i % 2 ? botY : topY);
        }
      }
      ctx.stroke();
      // The carriage light catches the inner edge of each member.
      ctx.fillStyle = rgba([st.tint[0] | 0, st.tint[1] | 0, st.tint[2] | 0], 0.05 * ex);
      for (const x of hi) ctx.fillRect(x + 2.5, topY + 5, 1, botY - topY - 9);
    };

    const drawSignal = (p: Extract<Piece, { kind: "signal" }>, ex: number) => {
      const x = xOf(p);
      if (x < -40 || x > width + 40) return;
      const base = height * 0.8;
      const headY = height * 0.5;
      ctx.fillStyle = `rgba(5,7,9,${(0.95 * ex).toFixed(3)})`;
      ctx.fillRect(x - 2, headY, 4, base - headY);
      ctx.fillStyle = `rgba(7,9,11,${(0.97 * ex).toFixed(3)})`;
      ctx.fillRect(x - 7, headY - 31, 14, 35);
      // Once we are past, the section behind us shows red.
      const passed = smooth(0.4, 0.25, x / width);
      const lamps: [RGB, number, number][] = [
        [SIG_RED, headY - 24, passed],
        [SIG_AMBER, headY - 14, p.aspect === SIG_AMBER ? 1 - passed : 0],
        [SIG_GREEN, headY - 4, p.aspect === SIG_GREEN ? 1 - passed : 0],
      ];
      for (const [c, y, on] of lamps) {
        ctx.fillStyle = `rgba(22,24,24,${ex.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
        if (on > 0.01) {
          glow(ctx, c, x, y, 13, 13, 0.3 * on * ex);
          ctx.fillStyle = rgba(c, 0.8 * on * ex);
          ctx.beginPath();
          ctx.arc(x, y, 2.3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };

    const drawCrossingRoad = (p: Extract<Piece, { kind: "crossing" }>, ex: number, horizon: number) => {
      const w = 0.6;
      const top = horizon + height * 0.05;
      const xf = (tau: number) => (0.5 + (tau - st.D) * K_MID) * width;
      const xn = (tau: number) => (0.5 + (tau - st.D) * K_NEAR * 1.4) * width;
      if (xf(p.at) > width && xn(p.at) > width) return;
      ctx.fillStyle = `rgba(17,21,21,${(0.9 * ex).toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(xf(p.at), top);
      ctx.lineTo(xf(p.at + w), top);
      ctx.lineTo(xn(p.at + w), height);
      ctx.lineTo(xn(p.at), height);
      ctx.fill();
    };

    const drawCrossing = (p: Extract<Piece, { kind: "crossing" }>, ex: number) => {
      const px = (0.5 + (p.at - 0.25 - st.D) * K_NEAR) * width;
      if (px < -width * 0.2 || px > width + 60) return;
      const base = height * 0.8;
      const dark = `rgba(5,7,9,${(0.95 * ex).toFixed(3)})`;
      ctx.fillStyle = dark;
      ctx.fillRect(px - 2, height * 0.45, 4, base - height * 0.45);
      ctx.fillRect(px - 16, height * 0.535 - 1, 32, 3);
      ctx.strokeStyle = dark;
      ctx.lineWidth = 3;
      ctx.beginPath();
      const cy = height * 0.47;
      ctx.moveTo(px - 12, cy - 7);
      ctx.lineTo(px + 12, cy + 7);
      ctx.moveTo(px - 12, cy + 7);
      ctx.lineTo(px + 12, cy - 7);
      ctx.stroke();
      // Two red lamps trading places, softly.
      const s = Math.sin(st.clock * (Math.PI / 0.65) + p.phase);
      const y = height * 0.535 + 8;
      for (const [lx, on] of [
        [px - 11, Math.max(0, s)],
        [px + 11, Math.max(0, -s)],
      ] as const) {
        ctx.fillStyle = dark;
        ctx.beginPath();
        ctx.arc(lx, y, 5, 0, Math.PI * 2);
        ctx.fill();
        glow(ctx, SIG_RED, lx, y, 14, 14, 0.2 * on * ex);
        ctx.fillStyle = rgba(SIG_RED, (0.1 + 0.42 * on) * ex);
        ctx.beginPath();
        ctx.arc(lx, y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      // The lowered barrier with its small reflectors.
      const armY = height * 0.66;
      const armL = width * 0.13;
      ctx.fillStyle = dark;
      ctx.fillRect(px + 3, armY, armL, 3);
      ctx.fillStyle = `rgba(200,183,150,${(0.16 * ex).toFixed(3)})`;
      for (let x = px + 12; x < px + armL; x += 16) ctx.fillRect(x, armY + 0.5, 4, 2);
    };

    const drawPoles = (p: Extract<Piece, { kind: "poles" }>, ex: number) => {
      const base = height * 0.74;
      const top = height * 0.3;
      const dark = `rgba(6,8,9,${(0.93 * ex).toFixed(3)})`;
      const xs: number[] = [];
      for (let i = 0; i < p.count; i++) xs.push((0.5 + (p.at + i * p.gap - st.D) * K_POLES) * width);
      if (xs[0] > width + 40 || xs[xs.length - 1] < -40) return;
      ctx.strokeStyle = dark;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 1; i < xs.length; i++) {
        if (xs[i] < -10 || xs[i - 1] > width + 10) continue;
        for (const dx of [-11, 11]) {
          ctx.moveTo(xs[i - 1] + dx, top + 6);
          ctx.quadraticCurveTo((xs[i - 1] + xs[i]) / 2 + dx, top + 24, xs[i] + dx, top + 6);
        }
      }
      ctx.stroke();
      xs.forEach((x, i) => {
        if (x < -40 || x > width + 40) return;
        ctx.fillStyle = dark;
        ctx.fillRect(x - 1.5, top, 3.5, base - top);
        ctx.fillRect(x - 13, top + 5, 26, 2.5);
        if (p.lamps[i]) {
          // A lamp over a farm lane: one warm pool of light.
          ctx.fillRect(x, top + 16, 10, 1.5);
          glow(ctx, LAMP, x + 10, top + 19, 26, 26, 0.3 * ex);
          glow(ctx, LAMP, x + 10, base, 44, 8, 0.1 * ex);
          ctx.fillStyle = rgba(LAMP, 0.85 * ex);
          ctx.fillRect(x + 8, top + 17.5, 4, 2);
        }
      });
    };

    const drawTunnel = (g: CanvasRenderingContext2D, a: number) => {
      if (!wall) wall = buildWall(width, height, dpr);
      const v = st.speed;
      if (wall) {
        const off = (((st.D * K_WALL * width) % wall.tw) + wall.tw) % wall.tw;
        g.globalAlpha = a;
        for (let x = -off; x < width; x += wall.tw) g.drawImage(wall.cv, x, 0, wall.tw, height);
        g.globalAlpha = 1;
      }
      // Lamps at a steady, slightly irregular interval, each lighting its patch of wall.
      const y = height * 0.3;
      const span = 0.7 / K_WALL;
      for (let i = Math.floor((st.D - span) / LAMP_EVERY) - 1; i <= Math.ceil((st.D + span) / LAMP_EVERY) + 1; i++) {
        const tau = i * LAMP_EVERY + (hash(i) - 0.5) * 0.8;
        const x = (0.5 + (tau - st.D) * K_WALL) * width;
        if (x < -width * 0.3 || x > width * 1.3) continue;
        glow(g, LAMP_DEEP, x, y, width * 0.16, width * 0.14, 0.22 * a);
        glow(g, LAMP_DEEP, x, y + height * 0.2, width * 0.09, height * 0.24, 0.07 * a);
        glow(g, LAMP, x, height * 0.575, width * 0.06, height * 0.014, 0.12 * a);
        g.fillStyle = `rgba(12,12,10,${a.toFixed(3)})`;
        g.fillRect(x - 11, y - 4, 22, 8);
        g.fillStyle = rgba(LAMP, 0.75 * a);
        g.fillRect(x - 8 - v * 5, y - 1.5, 16 + v * 5, 3);
      }
    };

    const drawGlass = (s: number) => {
      const tint: RGB = [st.tint[0] | 0, st.tint[1] | 0, st.tint[2] | 0];
      // Ceiling light spilling across the top of the glass.
      const spill = ctx.createLinearGradient(0, 0, 0, 160);
      spill.addColorStop(0, rgba(tint, 0.08 * (0.6 + 0.4 * s)));
      spill.addColorStop(0.45, rgba(tint, 0.025 * (0.6 + 0.4 * s)));
      spill.addColorStop(1, rgba(tint, 0));
      ctx.fillStyle = spill;
      ctx.fillRect(0, 0, width, 160);
      // A faint wash: the glass is never quite black.
      ctx.fillStyle = rgba(tint, 0.018 * s);
      ctx.fillRect(0, 0, width, height);
      // Two rows of fluorescent tubes, the far row thinner.
      const band = bandSprite();
      for (const [y, from, len, gap, k] of [
        [height * 0.09, 0.08, 0.19, 0.035, 1],
        [height * 0.165, 0.13, 0.16, 0.03, 0.6],
      ] as const) {
        for (let x = from; x + len <= 0.95; x += len + gap) {
          ctx.globalAlpha = 0.09 * s * k;
          ctx.drawImage(band, x * width, y - 9 * k, len * width, 18 * k);
          ctx.globalAlpha = 1;
          ctx.fillStyle = rgba(tint, 0.2 * s * k);
          ctx.fillRect(x * width, y - 0.6, len * width, 1.2 * k + 0.2);
        }
      }
      // The seat row and the opposite window, only really there when outside is dark.
      ctx.fillStyle = rgba(tint, 0.022 * s);
      ctx.fill(glass.seats);
      ctx.strokeStyle = rgba(tint, 0.05 * s);
      ctx.lineWidth = 1;
      ctx.stroke(glass.seats);
      ctx.fillStyle = rgba(PAPER, 0.016 * s);
      ctx.fill(glass.rests);
      ctx.strokeStyle = rgba(tint, 0.035 * s);
      ctx.lineWidth = 2;
      ctx.stroke(glass.frame);
    };

    const draw = () => {
      const { carriage: c, stationName: name, terminal: term } = target.current;
      const v = st.speed;
      const rain = c === "rain";
      ctx.clearRect(0, 0, width, height);
      const exterior = (1 - st.dark) * (1 - st.still * 0.55);
      const horizon = height * 0.62;

      // Sky: black-blue with a faint green haze near the horizon.
      const sky = ctx.createLinearGradient(0, 0, 0, horizon);
      sky.addColorStop(0, `rgba(10,14,24,${exterior.toFixed(3)})`);
      sky.addColorStop(1, `rgba(24,36,40,${exterior.toFixed(3)})`);
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, width, horizon);

      const rivers = pieces.filter((p): p is Extract<Piece, { kind: "river" }> => p.kind === "river");
      if (exterior > 0.01) {
        for (const s of stars) {
          ctx.fillStyle = rgba(PAPER, s.a * exterior * (rain ? 0.2 : 1));
          ctx.fillRect(s.x * width, s.y * height, 1, 1);
        }
        if (c === "moon") {
          const mx = width * 0.76;
          const my = height * 0.16;
          glow(ctx, PAPER, mx, my, 120, 120, 0.45 * exterior);
          ctx.fillStyle = rgba(PAPER, 0.55 * exterior);
          ctx.beginPath();
          ctx.arc(mx, my, 5.5, 0, Math.PI * 2);
          ctx.fill();
        }

        // Distant ridge, barely moving.
        ctx.fillStyle = `rgba(12,20,18,${exterior.toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(0, horizon);
        const seg = width / 12;
        const rs = st.D * K_RIDGE * 12;
        for (let i = 0; i <= 13; i++) {
          const idx = (((i + rs) % 48) + 48) % 48;
          const i0 = Math.floor(idx);
          const f = idx - i0;
          const h = ridge[i0] * (1 - f) + ridge[i0 + 1] * f;
          ctx.lineTo(i * seg - (rs % 1) * seg, horizon - height * 0.1 * h);
        }
        ctx.lineTo(width, horizon);
        ctx.closePath();
        ctx.fill();

        for (const p of pieces) if (p.kind === "road") drawRoad(p, exterior, horizon);

        // Town lights at the foot of the hills.
        for (const l of town) {
          const x = wrap(l.x - st.D * K_FAR) * width;
          ctx.fillStyle = rgba([226, 178, 110], l.a * exterior);
          ctx.beginPath();
          ctx.arc(x, horizon - 4 + l.y * 14, l.r, 0, Math.PI * 2);
          ctx.fill();
        }
        for (const p of pieces) if (p.kind === "blocks") drawBlocks(p, exterior, horizon);

        // Fields, then water and roads laid on them.
        ctx.fillStyle = `rgba(9,14,14,${exterior.toFixed(3)})`;
        ctx.fillRect(0, horizon, width, height - horizon);
        for (const p of pieces) if (p.kind === "crossing") drawCrossingRoad(p, exterior, horizon);
        for (const p of rivers) drawRiver(p, exterior, horizon);

        // Houses in the middle distance (none standing in the river).
        const hy = horizon + 12;
        const wet = rivers.map((p) => {
          const e = riverEdges(p, horizon + 2);
          const f = (hy - e.top) / (height - e.top);
          return [lerp(e.l0, e.l1, f) - 20, lerp(e.r0, e.r1, f) + 20] as const;
        });
        for (const h of houses) {
          const x = wrap(h.x - (st.D * K_MID) / 1.2) * width * 1.2 - width * 0.1;
          const w = h.w * width;
          if (wet.some(([l, r]) => x + w > l && x < r)) continue;
          const hh = h.h * height * 0.6;
          ctx.fillStyle = `rgba(6,9,10,${exterior.toFixed(3)})`;
          ctx.fillRect(x, hy - hh, w, hh);
          ctx.beginPath();
          ctx.moveTo(x - 3, hy - hh);
          ctx.lineTo(x + w / 2, hy - hh - hh * 0.45);
          ctx.lineTo(x + w + 3, hy - hh);
          ctx.fill();
          if (h.lit) {
            ctx.fillStyle = rgba(LAMP, 0.55 * exterior);
            ctx.fillRect(x + h.litX * (w - 6) + 1, hy - hh * 0.6, 4, 5);
          }
        }

        for (const p of pieces) if (p.kind === "poles") drawPoles(p, exterior);
        // A small halt slipping past (not stopping).
        for (const p of pieces) {
          if (p.kind !== "halt") continue;
          drawPlatform(ctx, width, height, xOf(p), exterior * 0.9, {
            len: p.ext * width,
            lamps: 3,
            lit: p.lit,
            rain,
            name: "",
            clock: st.clock,
            furnished: false,
            terminal: false,
          });
        }

        // Catenary poles and sagging wires: the rhythm of a local line.
        const bridges = rivers.map(trussSpan);
        const spacing = Math.max(260, width * 0.7);
        const offset = st.D * K_NEAR * width;
        const wireY = height * 0.12;
        ctx.strokeStyle = `rgba(4,6,8,${(0.9 * exterior).toFixed(3)})`;
        ctx.lineWidth = 1.2;
        ctx.fillStyle = `rgba(4,6,8,${(0.95 * exterior).toFixed(3)})`;
        ctx.beginPath();
        for (let i = -1; i < width / spacing + 2; i++) {
          const x = i * spacing - (offset % spacing);
          if (!bridges.some((b) => x > b.a - 10 && x < b.b + 10)) {
            ctx.fillRect(x, wireY - 20, 5, height);
            ctx.fillRect(x - 18, wireY - 10, 40, 3);
          }
          for (const dy of [0, 14]) {
            ctx.moveTo(x, wireY + dy);
            ctx.quadraticCurveTo(x + spacing / 2, wireY + dy + 22, x + spacing, wireY + dy);
          }
        }
        ctx.stroke();
        for (const p of rivers) drawTruss(p, exterior);
        for (const p of pieces) {
          if (p.kind === "signal") drawSignal(p, exterior);
          else if (p.kind === "crossing") drawCrossing(p, exterior);
        }

        // A distant train behind the platform: one row of lit windows.
        const ft = st.farTrain;
        if (ft) {
          const bh = Math.max(5, height * 0.018);
          const y = horizon - 1;
          const cw = 0.255 * width;
          glow(ctx, FLUO, (ft.x + ft.cars * 0.13) * width, y - bh / 2, ft.cars * 0.14 * width, bh * 2.2, 0.05 * exterior);
          for (let j = 0; j < ft.cars; j++) {
            const cx = (ft.x + j * 0.265) * width;
            if (cx > width || cx + cw < 0) continue;
            ctx.fillStyle = `rgba(8,11,13,${exterior.toFixed(3)})`;
            ctx.fillRect(cx, y - bh, cw, bh);
            ctx.fillStyle = rgba([222, 206, 168], 0.3 * exterior);
            for (let k = 0; k < 10; k++) ctx.fillRect(cx + ((k + 0.3) * cw) / 10, y - bh * 0.74, cw / 28, bh * 0.36);
          }
        }

        // Rain outside, seen against the dark.
        if (rain) {
          ctx.strokeStyle = `rgba(190,205,215,${(0.12 * exterior).toFixed(3)})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          for (const r of outsideRain) {
            const x = wrap(r.x - st.D * K_MID * 2) * width;
            ctx.moveTo(x, r.y * height);
            ctx.lineTo(x - 2 - v * 10, r.y * height + 14);
          }
          ctx.stroke();
        }
      }

      // The platform we stop at (it darkens with everything else outside).
      if (st.platformPos > -1.6 && st.platformPos < 1.5) {
        drawPlatform(ctx, width, height, st.platformPos * width, 1 - st.still * 0.2, {
          len: width * (term ? 1.5 : 1.3),
          lamps: term ? 6 : 4,
          lit: true,
          rain,
          name: name ?? "",
          clock: st.clock,
          furnished: true,
          terminal: term,
        });
      }

      // Tunnel: the outside darkens first, then the wall and its lamps.
      if (st.dark > 0.01) {
        ctx.fillStyle = `rgba(3,4,6,${(0.92 * st.dark).toFixed(3)})`;
        ctx.fillRect(0, 0, width, height);
      }
      if (st.tunnel > 0.01) {
        if (st.exit >= 0 && st.sweep > 0.001 && cctx) {
          // The wall ends: fade it out from the front of the train backwards.
          if (cover.width !== canvas.width || cover.height !== canvas.height) {
            cover.width = canvas.width;
            cover.height = canvas.height;
          }
          cctx.setTransform(1, 0, 0, 1, 0, 0);
          cctx.clearRect(0, 0, cover.width, cover.height);
          cctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          drawTunnel(cctx, st.tunnel);
          const edge = width * (1.3 - st.sweep * 1.6);
          const soft = width * 0.3;
          const mask = cctx.createLinearGradient(edge - soft, 0, edge, 0);
          mask.addColorStop(0, "rgba(0,0,0,0)");
          mask.addColorStop(1, "rgba(0,0,0,1)");
          cctx.globalCompositeOperation = "destination-out";
          cctx.fillStyle = mask;
          cctx.fillRect(edge - soft, 0, width - edge + soft + 1, height);
          cctx.globalCompositeOperation = "source-over";
          ctx.drawImage(cover, 0, 0, width, height);
        } else {
          drawTunnel(ctx, st.tunnel);
        }
      }
      // Portal lamps: a short burst as the train enters.
      if (st.portal >= 0) {
        for (let i = 0; i < 4; i++) {
          const x = (1.1 - (st.portal - 2.2 - i * 0.55) * 0.62) * width;
          if (x < -40 || x > width + 40) continue;
          const y = height * (0.3 + (i % 2) * 0.035);
          glow(ctx, LAMP, x, y, 60, 50, 0.3);
          ctx.fillStyle = rgba(LAMP, 0.85);
          ctx.fillRect(x - 5 - v * 6, y - 1.5, 10 + v * 6, 3);
        }
      }
      // Light at the end of the tunnel: a point ahead that slowly opens.
      if (st.exit >= 0) {
        const g = smooth(0, 4.5, st.exit);
        const fade = 1 - smooth(4.5, 8.5, st.exit);
        const r = lerp(3, width * 0.55, g * g);
        const gx = width * lerp(0.86, 1.04, g);
        const gy = height * 0.42;
        glow(ctx, MOUTH, gx, gy, r, r * 0.8, (0.5 - 0.32 * g) * fade);
        if (g < 0.6) {
          ctx.fillStyle = rgba(MOUTH, 0.55 * (1 - g / 0.6));
          ctx.fillRect(gx - 1, gy - 1, 2, 2);
        }
      }

      // The carriage reflected in the glass: stronger when the outside is dark.
      const platLit = clamp01(1 - Math.abs(st.platformPos) * 1.4) * (1 - st.dark);
      const refl = (0.4 + 0.6 * Math.max(st.dark, st.tunnel)) * (1 - 0.45 * platLit) * (1 - 0.25 * st.still);
      drawGlass(refl);

      // Raindrops on the glass: resting beads, a few running with thin trails.
      if (rain) {
        const vis = 1 - 0.3 * st.still;
        ctx.strokeStyle = `rgba(210,220,225,${(0.1 * vis).toFixed(3)})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (const b of beads) {
          if (!b.run || b.trail < 1) continue;
          const hx = b.x * width;
          const hy = b.y * height;
          ctx.moveTo(hx - b.dx * b.r, hy - b.dy * b.r);
          ctx.lineTo(hx - b.dx * b.trail, hy - b.dy * b.trail);
        }
        ctx.stroke();
        const spr = beadSprite();
        for (const b of beads) {
          if (b.r <= 0) continue;
          const s = b.r * 1.4;
          ctx.globalAlpha = b.a * 0.85 * vis;
          ctx.drawImage(spr, b.x * width - s, b.y * height - s, s * 2, s * 2);
        }
        ctx.globalAlpha = 1;
      }
    };

    // ---- Loop ----------------------------------------------------------------------------
    let raf = 0;
    let last = performance.now();
    const frame = (t: number) => {
      if (document.hidden) return;
      raf = requestAnimationFrame(frame);
      if (t - last < FRAME_MS - 2) return;
      const dt = Math.min(0.1, (t - last) / 1000);
      last = t;
      update(dt);
      if (!width || !height) return;
      if (reduced) {
        // A still frame, redrawn only when something actually changes.
        const { mode: m, carriage: c, stationName: n, terminal: term } = target.current;
        const key = `${m}|${c}|${n}|${term}|${Math.floor(Date.now() / 60000)}`;
        if (!dirty && key === drawnKey) return;
        drawnKey = key;
      }
      dirty = false;
      draw();
    };
    raf = requestAnimationFrame(frame);
    const onVisibility = () => {
      if (!document.hidden) {
        last = performance.now() - FRAME_MS;
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(frame);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      freeCover();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [reduced]);

  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-night-950" aria-hidden>
      {/* Scenery, tunnel, and the carriage's own reflection in the glass. */}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      {/* A soft scrim keeps the centre readable. */}
      <div className="absolute inset-0 bg-[radial-gradient(62%_40%_at_50%_46%,rgba(4,6,10,0.62),transparent_78%)]" />
      {/* Old green seat backs at the bottom of the frame. */}
      <svg className="absolute inset-x-0 bottom-0 h-[13vh] w-full" viewBox="0 0 400 100" preserveAspectRatio="none">
        <defs>
          <linearGradient id="seat" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#2b3a32" />
            <stop offset="1" stopColor="#0c120f" />
          </linearGradient>
        </defs>
        <path d="M-10 100 V38 Q-10 18 14 16 H150 Q176 18 176 40 V100 Z" fill="url(#seat)" opacity="0.85" />
        <path d="M224 100 V40 Q224 18 250 16 H386 Q410 18 410 38 V100 Z" fill="url(#seat)" opacity="0.85" />
        <path d="M14 17 H150" stroke="rgba(236,214,166,0.12)" strokeWidth="1" />
        <path d="M250 17 H386" stroke="rgba(236,214,166,0.12)" strokeWidth="1" />
      </svg>
      {/* Window frame. */}
      <div className="absolute inset-2 rounded-[2rem] border border-white/[0.035] shadow-[inset_0_0_140px_50px_rgba(2,3,6,0.9)] sm:inset-5" />
    </div>
  );
}

type PlatformOpts = {
  len: number;
  lamps: number;
  /** Unlit halts keep a single dim lamp. */
  lit: boolean;
  rain: boolean;
  name: string;
  clock: number;
  /** The platform we stop at: clock, vending machine, sign, puddles. */
  furnished: boolean;
  terminal: boolean;
};

/** A small rural platform: roof, warm lamps, a bench, a name board, wet concrete. */
function drawPlatform(ctx: CanvasRenderingContext2D, width: number, height: number, x0: number, alpha: number, o: PlatformOpts) {
  if (alpha <= 0.01 || x0 > width + 200 || x0 + o.len < -200) return;
  const len = o.len;
  const edge = height * 0.66;
  const roof = height * 0.2;
  const bay = len / o.lamps;
  ctx.save();
  ctx.globalAlpha = alpha;

  // The end of the line: more of the station lit beyond this platform.
  if (o.terminal) {
    for (let i = 0; i < 12; i++) {
      const x = x0 + width * 0.05 + i * width * 0.085;
      if (x - x0 > width * 0.34 && x - x0 < width * 0.66) continue; // the centre stays calm
      const y = roof + (edge - roof) * 0.7 + (i % 3) * 3;
      glow(ctx, FLUO, x, y, 16, 16, 0.14);
      ctx.fillStyle = rgba(FLUO, 0.4);
      ctx.fillRect(x - 3, y - 0.5, 6, 1.5);
    }
  }

  // Platform surface and edge line, with the tactile strip just behind it.
  ctx.fillStyle = "#121715";
  ctx.fillRect(x0, edge, len, height - edge);
  ctx.fillStyle = "rgba(200,183,150,0.45)";
  ctx.fillRect(x0, edge, len, 2);
  ctx.fillStyle = "rgba(200,176,110,0.1)";
  ctx.fillRect(x0, edge + 8, len, 3);
  // Roof and pillars.
  ctx.fillStyle = "#0b0f0e";
  ctx.fillRect(x0, roof - 10, len, 12);
  for (let i = 0; i < o.lamps; i++) ctx.fillRect(x0 + (i + 0.5) * bay - 3, roof, 6, edge - roof);
  // Fluorescent tubes and their pools of light.
  const lampX: number[] = [];
  for (let i = 0; i < o.lamps; i++) {
    const lx = x0 + (i + 1) * bay;
    const on = o.lit || i === Math.floor(o.lamps / 2);
    const k = o.lit ? 1 : 0.45;
    if (!on) {
      ctx.fillStyle = "rgba(60,62,56,0.5)";
      ctx.fillRect(lx - 22, roof + 4, 44, 3);
      continue;
    }
    lampX.push(lx);
    glow(ctx, FLUO, lx, roof + 8, 190, 170, 0.3 * k);
    ctx.fillStyle = rgba([244, 234, 206], 0.85 * k);
    ctx.fillRect(lx - 22, roof + 4, 44, 3);
    glow(ctx, FLUO, lx, edge + (height - edge) * 0.25, 60, (height - edge) * 0.7, 0.14 * k);
  }

  if (o.furnished) {
    // Station clock on the first pillar, showing the real time.
    const cx = x0 + bay * 0.5;
    const cy = roof + 36;
    const r = o.terminal ? 12 : 10;
    glow(ctx, FLUO, cx, cy, r * 3, r * 3, 0.12);
    ctx.fillStyle = "rgba(226,218,198,0.78)";
    ctx.strokeStyle = "#0b0f0e";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    const now = new Date();
    const min = now.getMinutes() + now.getSeconds() / 60;
    const hr = (now.getHours() % 12) + min / 60;
    ctx.strokeStyle = "#1a201d";
    ctx.lineCap = "round";
    for (const [turn, l, w] of [
      [hr / 12, 0.5, 1.6],
      [min / 60, 0.8, 1.1],
    ] as const) {
      const ang = turn * Math.PI * 2 - Math.PI / 2;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(ang) * r * l, cy + Math.sin(ang) * r * l);
      ctx.stroke();
    }
    ctx.lineCap = "butt";

    // A vending machine: the one cool light on the platform.
    const vx = x0 + width * 0.25;
    glow(ctx, COOL, vx + 13, edge - 28, 50, 50, 0.16);
    glow(ctx, COOL, vx + 13, edge + 10, 56, 12, 0.14);
    ctx.fillStyle = "#0d1113";
    ctx.fillRect(vx, edge - 46, 26, 46);
    ctx.fillStyle = rgba(COOL, 0.5);
    ctx.fillRect(vx + 3, edge - 43, 20, 26);
    ctx.fillStyle = "rgba(40,50,56,0.6)";
    for (let row = 0; row < 3; row++) for (let col = 0; col < 4; col++) ctx.fillRect(vx + 5 + col * 4.4, edge - 40 + row * 8, 3, 4);
    ctx.fillStyle = rgba(COOL, 0.2);
    ctx.fillRect(vx + 5, edge - 12, 16, 4);

    // Puddles holding the lamps' reflections.
    if (o.rain) {
      lampX.forEach((lx, i) => {
        if (lx < -80 || lx > width + 80) return;
        const px = lx + (i % 2 ? 14 : -20);
        const py = edge + (height - edge) * (0.26 + 0.08 * (i % 3));
        const rx = 34 + ((i * 17) % 26);
        const ry = 5 + (i % 3) * 1.5;
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(px, py, rx, ry, 0, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(30,40,44,0.45)";
        ctx.fill();
        ctx.clip();
        const shimmer = 0.85 + 0.15 * Math.sin(o.clock * 1.3 + i * 1.9);
        glow(ctx, FLUO, lx, py, 8, ry * 3, 0.4 * shimmer);
        ctx.restore();
      });
    }
  }

  // Bench.
  ctx.fillStyle = "#28332d";
  const bx = o.furnished ? x0 + width * 0.6 : x0 + len * 0.36;
  ctx.fillRect(bx, edge - 30, 90, 7);
  ctx.fillRect(bx, edge - 48, 90, 5);
  ctx.fillRect(bx + 6, edge - 23, 4, 23);
  ctx.fillRect(bx + 80, edge - 23, 4, 23);

  // Name board hanging under the roof, lit from behind, out of the way of the text.
  const bw = o.terminal ? 168 : o.furnished ? 128 : 96;
  const bh = o.terminal ? 32 : 26;
  const sx = o.furnished ? x0 + Math.min(width * 0.8 - bw / 2, width * 0.96 - bw) : x0 + len * 0.7;
  const sy = roof + 10;
  if (o.furnished || o.lit) glow(ctx, FLUO, sx + bw / 2, sy + bh / 2, bw * 0.8, bh * 1.8, o.furnished ? 0.16 : 0.08);
  ctx.fillStyle = o.furnished ? "rgba(226,218,198,0.72)" : o.lit ? "rgba(200,194,176,0.4)" : "rgba(120,118,108,0.3)";
  ctx.fillRect(sx, sy, bw, bh);
  ctx.fillStyle = "#2d3d35";
  ctx.fillRect(sx, sy + bh - 6, bw, 6);
  if (o.name) {
    ctx.fillStyle = "#1a201d";
    ctx.font = `600 ${o.terminal ? 12 : 10}px ui-monospace, monospace`;
    ctx.textAlign = "center";
    ctx.fillText(o.name.slice(0, o.terminal ? 22 : 18), sx + bw / 2, sy + (bh - 6) / 2 + 4);
  }

  // Terminal: a buffer stop on the track beyond, with its dim red lamp.
  if (o.terminal) {
    const tx = x0 + width * 0.9;
    ctx.fillStyle = "#080a0b";
    ctx.fillRect(tx, edge - 20, 30, 14);
    glow(ctx, SIG_RED, tx + 15, edge - 25, 12, 12, 0.3);
    ctx.fillStyle = rgba(SIG_RED, 0.6);
    ctx.fillRect(tx + 13.5, edge - 26.5, 3, 3);
  }

  // Rain falling through the lamp light.
  if (o.rain) {
    ctx.strokeStyle = "rgba(220,226,230,0.18)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < 60; i++) {
      const rx = x0 + ((i * 97.3) % len);
      const ry = roof + ((o.clock * 0.9 * (0.6 + (i % 5) * 0.1) * (edge - roof) + i * 53) % (edge - roof));
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx - 1.5, ry + 10);
    }
    ctx.stroke();
  }
  ctx.restore();
}
