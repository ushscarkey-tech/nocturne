import { journeyFor } from "@/core/journey";
import { remainingSeconds, routeOf } from "@/core/sessions";
import { stationLabel } from "@/core/stations";
import { serviceDate } from "@/core/time";
import type { NocturneData } from "@/core/types";

/**
 * What the Mac app shows outside the page (menu bar, floating window,
 * widgets): tonight at a glance. Names are already in the traveller's
 * language; the Mac app adds only its own few words.
 */
export interface NativeSnapshot {
  v: 1;
  at: string;
  locale: string;
  /** empty: nothing tonight · waiting: before departure or between windows · riding · paused (station on hold) · stop (Station Stop) · done */
  state: "empty" | "waiting" | "riding" | "paused" | "stop" | "done";
  current: { station: string; task: string; endsAt: string; remainingSec: number; minutes: number } | null;
  next: { station: string; task: string; at: string; minutes: number } | null;
  stops: { station: string; task: string; at: string; minutes: number; done: boolean; current: boolean }[];
  remaining: number;
  arrival: string | null;
  focusedMinutes: number;
}

export function nativeSnapshot(data: NocturneData, now: Date): NativeSnapshot {
  const date = serviceDate(now);
  const locale = data.profile.locale ?? "en";
  const tasks = new Map(data.tasks.map((t) => [t.id, t.title]));
  const route = routeOf(data.sessions, date);
  const journey = journeyFor(data, date);
  const active = route.find((s) => s.status === "active");
  const nextUp = route.find((s) => s.status === "planned");
  const name = (station: string) => stationLabel(station, locale);
  const left = active ? remainingSeconds(active, now) : 0;

  let state: NativeSnapshot["state"];
  if (journey?.phase === "final" && journey.startedAt) state = "done";
  else if (active) state = active.resumedAt ? "riding" : "paused";
  else if (journey?.phase === "stop" && nextUp) state = "stop";
  else if (nextUp) state = "waiting";
  else state = route.length > 0 ? "done" : "empty";

  const stopEnds = journey?.phase === "stop" && journey.stopEndsAt ? journey.stopEndsAt : null;
  return {
    v: 1,
    at: now.toISOString(),
    locale,
    state,
    current: active
      ? {
          station: name(active.stationName),
          task: tasks.get(active.taskId) ?? "",
          endsAt: new Date(now.getTime() + left * 1000).toISOString(),
          remainingSec: Math.round(left),
          minutes: active.plannedMinutes,
        }
      : null,
    next: nextUp
      ? { station: name(nextUp.stationName), task: tasks.get(nextUp.taskId) ?? "", at: stopEnds ?? nextUp.plannedStart, minutes: nextUp.plannedMinutes }
      : null,
    stops: route.slice(0, 12).map((s) => ({
      station: name(s.stationName),
      task: tasks.get(s.taskId) ?? "",
      at: s.status === "done" || s.status === "partial" ? (s.actualStart ?? s.plannedStart) : s.plannedStart,
      minutes: s.plannedMinutes,
      done: s.status === "done" || s.status === "partial",
      current: s.status === "active",
    })),
    remaining: route.filter((s) => s.status === "planned" || s.status === "active").length,
    arrival: route.length ? route[route.length - 1].plannedEnd : null,
    focusedMinutes: route.reduce((sum, s) => sum + (s.status === "done" || s.status === "partial" ? s.completedMinutes : 0), 0),
  };
}

type Bridge = { postMessage(message: unknown): void };

/** The Mac app's message handler, when Nocturne runs inside it. */
export function nativeBridge(): Bridge | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { webkit?: { messageHandlers?: { nocturne?: Bridge } } };
  return w.webkit?.messageHandlers?.nocturne ?? null;
}
