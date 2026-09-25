"use client";

import type { StudySession } from "@/core/types";

/**
 * The night as one thin transit line: a dot per station, spaced by planned
 * length. Markers are keyed by station, so when the route is adjusted they
 * glide to their new places instead of jumping, and the line redraws.
 */
export function RouteStrip({
  route,
  activeId,
  fraction = 0,
  changing = false,
  label,
  className = "",
}: {
  route: StudySession[];
  activeId?: string | null;
  /** Progress through the active station, 0..1. */
  fraction?: number;
  /** Dim and redraw while a route change settles. */
  changing?: boolean;
  label: string;
  className?: string;
}) {
  const total = route.reduce((a, s) => a + Math.max(1, s.plannedMinutes), 0) || 1;
  let acc = 0;
  let position = 0;
  const marks: { s: StudySession; at: number }[] = [];
  for (const s of route) {
    marks.push({ s, at: acc / total });
    if (s.id === activeId) position = (acc + fraction * s.plannedMinutes) / total;
    else if (s.status === "done" || s.status === "partial" || s.status === "skipped") position = Math.max(position, (acc + s.plannedMinutes) / total);
    acc += Math.max(1, s.plannedMinutes);
  }
  const signature = route.map((s) => s.id).join(",");

  return (
    <div
      className={`relative h-4 w-full transition-opacity duration-700 ${changing ? "opacity-40" : "opacity-100"} ${className}`}
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(position * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="absolute inset-x-0 top-1/2 h-px bg-paper/15" />
      <div
        key={signature}
        className="motion-safe-only absolute left-0 top-1/2 h-px origin-left animate-[redraw_1100ms_var(--ease-glide)_both] bg-paper-dim/60 transition-[width] duration-1000"
        style={{ width: `${position * 100}%` }}
      />
      {marks.map(({ s, at }) => {
        const done = s.status === "done";
        const partial = s.status === "partial";
        const active = s.id === activeId;
        return (
          <span
            key={s.id}
            className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border transition-[left,background-color,border-color] duration-[1200ms] ease-[var(--ease-glide)] ${
              active
                ? "h-2 w-2 border-lamp bg-lamp/30"
                : done
                  ? "h-1.5 w-1.5 border-paper-dim bg-paper-dim"
                  : partial
                    ? "h-1.5 w-1.5 border-paper-dim bg-paper-dim/40"
                    : s.status === "skipped"
                      ? "h-1.5 w-1.5 border-haze/50"
                      : "h-1.5 w-1.5 border-paper/50 bg-night-900"
            }`}
            style={{ left: `${Math.max(0.5, at * 100)}%` }}
          />
        );
      })}
      {/* The terminus. */}
      <span className="absolute right-0 top-1/2 h-2.5 w-px -translate-y-1/2 bg-paper/40" />
      {activeId && (
        <span
          className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-lamp shadow-[0_0_10px_rgba(224,176,104,0.55)] transition-[left] duration-1000"
          style={{ left: `${position * 100}%` }}
        />
      )}
    </div>
  );
}
