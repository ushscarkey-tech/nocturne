"use client";

import type { CSSProperties } from "react";
import type { TicketFace } from "@/core/stats";
import { formatDuration } from "@/core/time";
import type { CarriageId } from "@/core/types";
import { useI18n } from "@/i18n";

const STYLES: Record<CarriageId, { from: string; to: string; ink: string; accent: string }> = {
  rain: { from: "#1a2336", to: "#101727", ink: "#dfe4ee", accent: "#9fb4d6" },
  quiet: { from: "#1f2a25", to: "#101714", ink: "#e9e2d2", accent: "#b9c2a6" },
  tunnel: { from: "#17181c", to: "#0c0d10", ink: "#ddd6c8", accent: "#e0b068" },
  moon: { from: "#2a221c", to: "#151210", ink: "#efe6d3", accent: "#e3c79a" },
};

/**
 * A daily Ticket: a quiet, collectible record of the night. Each one varies
 * slightly (angle, grain, station marks) while keeping one visual system.
 */
export function Ticket({ face, style, size = "lg" }: { face: TicketFace; style: CarriageId; size?: "sm" | "lg" }) {
  const { t } = useI18n();
  const s = STYLES[style];
  const angle = 150 + Math.round(face.hueShift * 40);
  const lg = size === "lg";
  const cssVars = {
    "--ticket-ink": s.ink,
    "--ticket-accent": s.accent,
    background: `linear-gradient(${angle}deg, ${s.from}, ${s.to})`,
  } as CSSProperties;

  return (
    <article
      aria-label={t("archive.ticketLabel", { date: face.dateLabel, departure: face.departure, arrival: face.arrival, stops: face.stops, focused: formatDuration(face.focused), completion: face.completion, status: face.status.toLowerCase() })}
      className={`relative overflow-hidden rounded-[1.1rem] border border-white/[0.07] text-[color:var(--ticket-ink)] shadow-[0_30px_80px_-40px_rgba(0,0,0,0.9)] ${
        lg ? "w-full max-w-[20rem] px-7 pb-7 pt-8" : "w-full px-4 pb-4 pt-5"
      }`}
      style={cssVars}
    >
      {/* Fine guilloche-like lines, offset per ticket. */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        aria-hidden
        style={{
          backgroundImage: `repeating-linear-gradient(${angle + 90}deg, var(--ticket-ink) 0 1px, transparent 1px ${6 + Math.round(face.hueShift * 5)}px)`,
        }}
      />
      <div className="relative">
        <div className="flex items-start justify-between">
          <p className={`font-mono tracking-[0.35em] ${lg ? "text-[0.7rem]" : "text-[0.55rem]"}`}>NOCTURNE</p>
          <span className={`rounded-full border border-current opacity-40 ${lg ? "h-3 w-3" : "h-2 w-2"}`} aria-hidden />
        </div>
        <p className={`mt-1 font-mono tracking-[0.2em] opacity-60 ${lg ? "text-[0.65rem]" : "text-[0.5rem]"}`}>NIGHT LINE {face.serial}</p>

        <p className={`font-mono tracking-[0.18em] text-[color:var(--ticket-accent)] ${lg ? "mt-7 text-xs" : "mt-3 text-[0.55rem]"}`}>{face.dateLabel}</p>

        <div className={`font-mono tabular ${lg ? "mt-5 text-4xl font-light" : "mt-2 text-lg"}`}>
          <p>{face.departure}</p>
          <p className={`opacity-40 ${lg ? "my-1 text-base" : "text-[0.6rem] leading-3"}`} aria-hidden>
            ↓
          </p>
          <p>{face.arrival}</p>
        </div>
      </div>

      {/* Perforation with side notches. */}
      <div className={`relative ${lg ? "-mx-7 my-7" : "-mx-4 my-3"}`} aria-hidden>
        <div className="border-t border-dashed border-current opacity-20" />
        <span className={`absolute top-1/2 -translate-y-1/2 rounded-full bg-night-900 ${lg ? "-left-2.5 h-5 w-5" : "-left-1.5 h-3 w-3"}`} />
        <span className={`absolute top-1/2 -translate-y-1/2 rounded-full bg-night-900 ${lg ? "-right-2.5 h-5 w-5" : "-right-1.5 h-3 w-3"}`} />
      </div>

      <div className="relative">
        <dl className={`grid grid-cols-2 font-mono tracking-[0.14em] ${lg ? "gap-y-4 text-[0.72rem]" : "gap-y-1.5 text-[0.5rem]"}`}>
          <div>
            <dt className="sr-only">Stops</dt>
            <dd>{face.stops} STOPS</dd>
          </div>
          <div>
            <dt className="sr-only">Focused</dt>
            <dd>{formatDuration(face.focused).toUpperCase()}</dd>
          </div>
          <div>
            <dt className="sr-only">Carriage</dt>
            <dd>{face.carriage}</dd>
          </div>
          <div>
            <dt className="sr-only">Seat</dt>
            <dd>SEAT {face.seat}</dd>
          </div>
        </dl>

        {lg && face.stationMarks.length > 0 && (
          <div className="mt-6 flex items-center gap-0" aria-hidden>
            {face.stationMarks.map((m, i) => (
              <span key={i} className="flex flex-1 items-center last:flex-none">
                <span
                  className={`h-2 w-2 shrink-0 rounded-full border border-[color:var(--ticket-accent)] ${
                    m === "done" ? "bg-[color:var(--ticket-accent)]" : m === "partial" ? "bg-[color:var(--ticket-accent)]/40" : ""
                  }`}
                />
                {i < face.stationMarks.length - 1 && <span className="h-px flex-1 bg-current opacity-25" />}
              </span>
            ))}
          </div>
        )}

        <div className={`flex items-baseline justify-between gap-2 font-mono text-[color:var(--ticket-accent)] ${lg ? "mt-6" : "mt-3"}`}>
          <p className={`tracking-[0.3em] ${lg ? "text-[0.72rem]" : "text-[0.5rem]"}`}>{face.status}</p>
          <p className={`tabular tracking-[0.1em] ${lg ? "text-[0.72rem]" : "text-[0.5rem]"}`}>{face.completion}%</p>
        </div>
      </div>
    </article>
  );
}
