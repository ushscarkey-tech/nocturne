"use client";

import { useId, useMemo, type CSSProperties, type ReactNode } from "react";
import { ticketRowCount, ticketRows, type TicketFace, type TicketRowId } from "@/core/stats";
import { seeded } from "@/core/stations";
import { formatDuration } from "@/core/time";
import type { CarriageId, Locale } from "@/core/types";
import { useI18n } from "@/i18n";

type Size = "sm" | "md" | "lg";

const INK = "#1d2226";

/** Each carriage prints on the same stock with its own thin colour band. */
const BANDS: Record<CarriageId, { band: string; deep: string }> = {
  rain: { band: "#4c5f7a", deep: "#3a4a60" },
  quiet: { band: "#5a7466", deep: "#2d3d35" },
  tunnel: { band: "#8a5a2b", deep: "#6b4420" },
  moon: { band: "#b69a62", deep: "#8a7243" },
};

/** Small secondary labels in the traveller's language (Japanese when reading in English). */
type LabelId = "dep" | "arr" | "car" | "seat" | "platform" | "stops" | "focused" | "planned";
const SECONDARY: Record<Exclude<Locale, "en">, Record<LabelId, string>> = {
  ko: { dep: "출발", arr: "도착", car: "호차", seat: "좌석", platform: "승강장", stops: "정거장", focused: "집중", planned: "예정" },
  ja: { dep: "出発", arr: "到着", car: "号車", seat: "座席", platform: "番線", stops: "駅数", focused: "集中", planned: "予定" },
  zh: { dep: "出发", arr: "到达", car: "车厢", seat: "座位", platform: "站台", stops: "站数", focused: "专注", planned: "计划" },
};

const ENGLISH: Record<LabelId, string> = {
  dep: "DEP",
  arr: "ARR",
  car: "CAR",
  seat: "SEAT",
  platform: "PLAT",
  stops: "STOPS",
  focused: "FOCUSED",
  planned: "PLANNED",
};

/** Keyframes for the print-out and a shared class; React hoists and dedupes this by href. */
const KEYFRAMES = `
@keyframes nocturne-ink-settle {
  from { opacity: 0; filter: blur(1.4px); }
  60% { opacity: 0.9; }
  to { opacity: 1; filter: blur(0); }
}
.nocturne-ink-settle { animation: nocturne-ink-settle 350ms cubic-bezier(0.22, 1, 0.36, 1) both; }
`;

type RowId = TicketRowId;

export { ticketRowCount };

function hexToRgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** Deterministic bars from the serial; rendered as plain SVG rects. */
function barcodeBars(serial: string): { bars: [number, number][]; width: number } {
  const rand = seeded(`bar:${serial}`);
  const bars: [number, number][] = [];
  let x = 0;
  const push = (w: number, gap: number) => {
    bars.push([x, w]);
    x += w + gap;
  };
  push(1, 1);
  push(1, 1);
  for (let i = 0; i < 30; i++) push(1 + Math.floor(rand() * 3), 1 + Math.floor(rand() * 2));
  push(1, 1);
  push(2, 0);
  return { bars, width: x };
}

/** A small QR-like block: three finder squares and deterministic modules. */
function codeBlockPath(serial: string): string {
  const n = 13;
  const rand = seeded(`qr:${serial}`);
  const inFinder = (x: number, y: number) => (x < 6 && y < 6) || (x > n - 7 && y < 6) || (x < 6 && y > n - 7);
  let d = "";
  const cell = (x: number, y: number) => (d += `M${x} ${y}h1v1h-1z`);
  for (const [ox, oy] of [
    [0, 0],
    [n - 5, 0],
    [0, n - 5],
  ]) {
    for (let i = 0; i < 5; i++) {
      cell(ox + i, oy);
      cell(ox + i, oy + 4);
      if (i > 0 && i < 4) {
        cell(ox, oy + i);
        cell(ox + 4, oy + i);
      }
    }
    cell(ox + 2, oy + 2);
  }
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (!inFinder(x, y) && rand() < 0.46) cell(x, y);
  return d;
}

function paperColors(hueShift: number) {
  const h = 38 + hueShift * 9;
  const s = 34 + hueShift * 10;
  const l = 87.5 - hueShift * 2.2;
  return {
    top: `hsl(${h} ${s}% ${l + 1.2}%)`,
    mid: `hsl(${h} ${s}% ${l}%)`,
    low: `hsl(${h + 2} ${s - 4}% ${l - 2.6}%)`,
  };
}

/**
 * A daily Ticket: a paper transit ticket for one night. Same stock and layout
 * every time; the paper tone, print and serial vary a little per night.
 *
 * `printed` reveals rows one at a time for a print-out driven by the caller;
 * rows not yet printed keep their space. Leave it undefined to show everything.
 * The two paper halves carry `data-ticket-part="main" | "stub"` so a scene can
 * fold or unfold them along the perforation.
 */
export function Ticket({
  face,
  style,
  size = "lg",
  printed,
  className = "",
}: {
  face: TicketFace;
  style: CarriageId;
  size?: Size;
  printed?: number;
  className?: string;
}) {
  const { t, locale } = useI18n();
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const band = BANDS[style] ?? BANDS.quiet;
  const paper = paperColors(face.hueShift);
  const sm = size === "sm";
  const secondary = SECONDARY[locale === "en" ? "ja" : locale];
  const { rows, split } = ticketRows(size);
  const journey = face.kind !== "boarding";

  const variation = useMemo(() => {
    const rand = seeded(`ink:${face.serialLong}:${face.hueShift}`);
    // A few rows print slightly light, as a real thermal head does.
    const ink = Array.from({ length: 10 }, () => (rand() < 0.28 ? 0.85 + rand() * 0.07 : 1));
    return {
      ink,
      streakX: 18 + rand() * 64,
      seed: 1 + Math.floor(rand() * 400),
      tilt: (rand() - 0.5) * 0.6,
    };
  }, [face.serialLong, face.hueShift]);

  const bar = useMemo(() => barcodeBars(face.serialLong), [face.serialLong]);
  const block = useMemo(() => (sm ? "" : codeBlockPath(face.serialLong)), [face.serialLong, sm]);

  const misregistration = `0.3px 0.15px 0 ${hexToRgba(band.band, 0.5)}`;
  const grain = `${uid}-grain`;
  const fibre = `${uid}-fibre`;
  const notch = "0.6em";

  const cssVars = {
    "--tk-ink": INK,
    "--tk-band": band.band,
    "--tk-band-deep": band.deep,
    color: INK,
    filter: "drop-shadow(0 1.2em 1.6em rgba(0,0,0,0.55)) drop-shadow(0 0.15em 0.25em rgba(0,0,0,0.35))",
  } as CSSProperties;

  const partStyle = (edge: "bottom" | "top"): CSSProperties => {
    const y = edge === "bottom" ? "100%" : "0";
    const mask = `radial-gradient(circle at 0 ${y}, transparent ${notch}, #000 calc(${notch} + 0.5px)), radial-gradient(circle at 100% ${y}, transparent ${notch}, #000 calc(${notch} + 0.5px))`;
    return {
      background: `linear-gradient(${172 + variation.tilt * 10}deg, ${paper.top}, ${paper.mid} 45%, ${paper.low})`,
      boxShadow: "inset 0 0 1.4em rgba(112, 86, 52, 0.16), inset 0 0 0.25em rgba(112, 86, 52, 0.12)",
      maskImage: mask,
      WebkitMaskImage: mask,
      maskSize: "51% 100%",
      WebkitMaskSize: "51% 100%",
      maskPosition: "0 0, 100% 0",
      WebkitMaskPosition: "0 0, 100% 0",
      maskRepeat: "no-repeat",
      WebkitMaskRepeat: "no-repeat",
    };
  };

  const label = (id: LabelId, align: "left" | "right" = "left") => (
    <span className={`flex items-baseline gap-[0.45em] whitespace-nowrap text-[0.5625em] leading-none tracking-[0.18em] ${align === "right" ? "justify-end" : ""}`}>
      <span className="opacity-75">{ENGLISH[id]}</span>
      <span className="font-sans tracking-[0.04em] opacity-55">{secondary[id]}</span>
    </span>
  );

  const field = (id: LabelId, value: string, i: number, span = 1) => (
    <div className={span === 2 ? "col-span-2" : ""}>
      {label(id)}
      <p className="mt-[0.4em] text-[0.875em] font-medium leading-none tracking-[0.06em] tabular" style={{ opacity: variation.ink[i % 10] }}>
        {value}
      </p>
    </div>
  );

  const marks = () =>
    face.stationMarks.length > 0 ? (
      <div className="flex items-center" aria-hidden>
        {face.stationMarks.map((m, i) => (
          <span key={i} className="flex flex-1 items-center last:flex-none">
            <span
              className="relative h-[0.5em] w-[0.5em] shrink-0 overflow-hidden rounded-full border-[0.09em] border-[color:var(--tk-band-deep)]"
              style={{ background: m === "done" ? band.deep : "transparent" }}
            >
              {m === "partial" && <span className="absolute inset-y-0 left-0 w-1/2 bg-[color:var(--tk-band-deep)]" />}
            </span>
            {i < face.stationMarks.length - 1 && <span className="h-[0.07em] flex-1 bg-[color:var(--tk-ink)] opacity-30" />}
          </span>
        ))}
      </div>
    ) : null;

  const content: Record<RowId, ReactNode> = {
    header: (
      <div className="flex items-start justify-between gap-[0.75em]">
        <div>
          <p className="text-[0.8125em] font-semibold leading-none tracking-[0.42em]" style={{ opacity: variation.ink[0], textShadow: misregistration }}>
            NOCTURNE
          </p>
          <p className="mt-[0.55em] text-[0.5625em] leading-none tracking-[0.24em] text-[color:var(--tk-band-deep)]">
            NIGHT LINE · {face.carriage}
          </p>
        </div>
        {sm ? (
          <p className="text-[0.625em] leading-none tracking-[0.14em] tabular" style={{ opacity: variation.ink[1] }}>
            {face.dateLabel}
          </p>
        ) : (
          <p className="rounded-[0.2em] border-[0.08em] border-[color:var(--tk-ink)] px-[0.55em] py-[0.35em] text-[0.5em] leading-none tracking-[0.24em] opacity-80">
            {journey ? "NIGHT TICKET" : "BOARDING PASS"}
          </p>
        )}
      </div>
    ),
    date: (
      <div
        className="flex items-baseline justify-between border-y-[0.06em] border-[rgba(29,34,38,0.28)] py-[0.5em] text-[0.625em] leading-none tracking-[0.18em] tabular"
        style={{ opacity: variation.ink[1] }}
      >
        <span>{face.dateLabel}</span>
        <span className="opacity-80">{face.routeCode}</span>
      </div>
    ),
    times: (
      <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-[0.5em]">
        <div>
          {label("dep")}
          <p
            className={`mt-[0.2em] font-light leading-none tracking-[-0.01em] tabular ${sm ? "text-[1.75em]" : "text-[2.25em]"}`}
            style={{ textShadow: misregistration, opacity: variation.ink[2] }}
          >
            {face.departure}
          </p>
        </div>
        <svg viewBox="0 0 24 8" className={`w-[1.5em] ${sm ? "mb-[0.45em]" : "mb-[0.6em]"}`} aria-hidden>
          <path d="M0 4h22M18 1l4 3-4 3" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.55" />
        </svg>
        <div className="text-right">
          {label("arr", "right")}
          <p
            className={`mt-[0.2em] font-light leading-none tracking-[-0.01em] tabular ${sm ? "text-[1.75em]" : "text-[2.25em]"}`}
            style={{ textShadow: misregistration, opacity: variation.ink[3] }}
          >
            {face.arrival}
          </p>
        </div>
      </div>
    ),
    route: (
      <div className="flex items-center gap-[0.6em] text-[0.5625em] leading-none tracking-[0.16em]" style={{ opacity: variation.ink[4] }}>
        <span className="min-w-0 truncate">{face.from}</span>
        <span className="relative h-[0.08em] min-w-[1.5em] flex-1 bg-[color:var(--tk-ink)] opacity-40" aria-hidden>
          <span className="absolute -top-[0.22em] left-0 h-[0.52em] w-[0.52em] rounded-full bg-[color:var(--tk-ink)]" />
          <span className="absolute -top-[0.22em] right-0 h-[0.52em] w-[0.52em] rounded-full border-[0.1em] border-[color:var(--tk-ink)] bg-transparent" />
        </span>
        <span className="min-w-0 truncate text-right">{face.to}</span>
      </div>
    ),
    grid1: (
      <div className="grid grid-cols-3 gap-[0.75em]">
        {field("stops", String(face.stops), 5)}
        {field("car", face.car, 6)}
        {field("seat", face.seat, 7)}
      </div>
    ),
    grid2: (
      <div className="grid grid-cols-3 gap-[0.75em]">
        {field("platform", face.platform, 8)}
        {field(journey ? "focused" : "planned", formatDuration(face.focused).toUpperCase(), 9, 2)}
      </div>
    ),
    gridSm: (
      <div className="grid grid-cols-3 gap-[0.6em]">
        {field("stops", String(face.stops), 5)}
        {field("car", face.car, 6)}
        {field("seat", face.seat, 7)}
      </div>
    ),
    stub: journey ? (
      <div>
        {marks()}
        <div className="mt-[0.7em] flex items-baseline justify-between gap-[0.5em]">
          <p className="text-[0.5625em] font-semibold leading-none tracking-[0.3em]" style={{ opacity: variation.ink[8] }}>
            {face.status}
          </p>
          <p className="text-[0.8125em] leading-none tracking-[0.08em] text-[color:var(--tk-band-deep)] tabular">{face.completion}%</p>
        </div>
      </div>
    ) : (
      <div>
        {marks()}
        <div className="mt-[0.7em] flex items-baseline justify-between gap-[0.5em]">
          <p className="text-[0.5625em] font-semibold leading-none tracking-[0.3em]">{face.status}</p>
          <p className="text-[0.5em] leading-none tracking-[0.24em] text-[color:var(--tk-band-deep)]">ADMIT ONE</p>
        </div>
      </div>
    ),
    code: (
      <div className="flex items-end gap-[0.9em]">
        <div className="min-w-0 flex-1">
          <svg
            viewBox={`0 0 ${bar.width} 10`}
            preserveAspectRatio="none"
            className={`block w-full ${sm ? "h-[1.6em]" : "h-[2.3em]"}`}
            shapeRendering="crispEdges"
            aria-hidden
            style={{ opacity: variation.ink[9] }}
          >
            {bar.bars.map(([x, w]) => (
              <rect key={x} x={x} y={0} width={w} height={10} fill={INK} />
            ))}
          </svg>
          <p className="mt-[0.5em] flex justify-between text-[0.5em] leading-none tracking-[0.22em] opacity-75 tabular">
            <span>{face.serialLong}</span>
            {!sm && <span>ADULT · 1</span>}
          </p>
        </div>
        {!sm && (
          <svg viewBox="-1 -1 15 15" className="h-[2.9em] w-[2.9em] shrink-0" shapeRendering="crispEdges" aria-hidden>
            <path d={block} fill={INK} opacity={0.9} />
          </svg>
        )}
      </div>
    ),
  };

  const gap: Record<RowId, string> = {
    header: "",
    date: "mt-[0.9em]",
    times: sm ? "mt-[0.85em]" : "mt-[0.95em]",
    route: sm ? "mt-[0.75em]" : "mt-[0.9em]",
    grid1: "mt-[1.05em]",
    grid2: "mt-[0.8em]",
    gridSm: "mt-[0.85em]",
    stub: "",
    code: sm ? "mt-[0.75em]" : "mt-[0.9em]",
  };

  const renderRow = (id: RowId, index: number) => {
    const hidden = printed !== undefined && index >= printed;
    const settling = printed !== undefined && index === printed - 1;
    return (
      <div
        key={id}
        data-ticket-row={index}
        className={`${gap[id]} ${settling ? "nocturne-ink-settle" : ""}`}
        style={hidden ? { visibility: "hidden", opacity: 0 } : undefined}
      >
        {content[id]}
      </div>
    );
  };

  const texture = (
    <svg className="pointer-events-none absolute inset-0 h-full w-full mix-blend-multiply" aria-hidden>
      <rect width="100%" height="100%" filter={`url(#${fibre})`} opacity={0.12} />
      <rect width="100%" height="100%" filter={`url(#${grain})`} opacity={0.42} />
    </svg>
  );

  const ariaLabel = t("archive.ticketLabel", {
    date: face.dateLabel,
    departure: face.departure,
    arrival: face.arrival,
    stops: face.stops,
    focused: formatDuration(face.focused),
    completion: face.completion,
    status: face.status.toLowerCase(),
  });

  return (
    <article
      aria-label={ariaLabel}
      data-ticket={face.kind}
      className={`relative w-full select-none font-mono ${
        size === "lg" ? "max-w-[20rem] text-[1rem]" : size === "md" ? "max-w-[15rem] text-[0.75rem]" : "text-[0.8rem]"
      } ${className}`}
      style={cssVars}
    >
      <style href="nocturne-ticket" precedence="default">
        {KEYFRAMES}
      </style>
      {/* Shared paper filters for this ticket. */}
      <svg width="0" height="0" className="absolute" aria-hidden focusable="false">
        <filter id={grain} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" seed={variation.seed} stitchTiles="stitch" />
          <feColorMatrix type="matrix" values="0 0 0 0 0.26  0 0 0 0 0.21  0 0 0 0 0.15  1.5 0 0 0 -0.6" />
        </filter>
        <filter id={fibre} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.02 0.4" numOctaves="2" seed={variation.seed + 7} />
          <feColorMatrix type="matrix" values="0 0 0 0 0.42  0 0 0 0 0.35  0 0 0 0 0.24  2.6 0 0 0 -1.45" />
        </filter>
      </svg>

      {/* Upper half: the ticket proper. */}
      <div data-ticket-part="main" className="relative overflow-hidden rounded-t-[0.7em]" style={partStyle("bottom")}>
        <div className="h-[0.34em] bg-[color:var(--tk-band)]" aria-hidden />
        <div className="h-[0.06em] bg-[color:var(--tk-band)] opacity-50 mt-[0.14em]" aria-hidden />
        {texture}
        <div className={`relative ${sm ? "px-[1.15em] pb-[1em] pt-[0.9em]" : "px-[1.375em] pb-[1.15em] pt-[1.05em]"}`}>
          {rows.slice(0, split).map((id, i) => renderRow(id, i))}
        </div>
        {/* Faint print-head streak. */}
        <span
          className="pointer-events-none absolute bottom-[8%] top-[14%] w-[0.09em]"
          style={{
            left: `${variation.streakX}%`,
            background: `linear-gradient(to bottom, transparent, ${paper.mid} 18%, ${paper.mid} 82%, transparent)`,
            opacity: 0.55,
          }}
          aria-hidden
        />
      </div>

      {/* Lower half: the stub, behind the perforation. */}
      <div data-ticket-part="stub" className="relative overflow-hidden rounded-b-[0.7em]" style={partStyle("top")}>
        {texture}
        <div
          className="absolute top-0 border-t-[0.09em] border-dashed border-[rgba(29,34,38,0.34)]"
          style={{ left: `calc(${notch} + 0.35em)`, right: `calc(${notch} + 0.35em)` }}
          aria-hidden
        />
        <div className={`relative ${sm ? "px-[1.15em] pb-[1em] pt-[0.95em]" : "px-[1.375em] pb-[1.2em] pt-[1.1em]"}`}>
          {rows.slice(split).map((id, i) => renderRow(id, split + i))}
        </div>
      </div>
    </article>
  );
}
