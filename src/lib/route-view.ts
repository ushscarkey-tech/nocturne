import { availabilityForDate } from "@/core/availability";
import { routeOf } from "@/core/sessions";
import { minutesFrom } from "@/core/time";
import type { DateKey, NocturneData, StudySession, Task } from "@/core/types";

export type RouteItem =
  | { kind: "station"; session: StudySession; task: Task | undefined }
  | { kind: "stop"; start: string; minutes: number; key: string }
  | { kind: "pause"; until: string; key: string };

/** Stations for a day with Station Stops and Service pauses between them. */
export function routeItems(data: NocturneData, date: DateKey): RouteItem[] {
  const tasks = new Map(data.tasks.map((t) => [t.id, t]));
  const windows = availabilityForDate(data.windows, date);
  const route = routeOf(data.sessions, date);
  const items: RouteItem[] = [];
  route.forEach((s, i) => {
    const prev = route[i - 1];
    if (prev) {
      const gap = (new Date(s.plannedStart).getTime() - new Date(prev.plannedEnd).getTime()) / 60_000;
      const prevEnd = minutesFrom(date, prev.plannedEnd);
      const nextStart = minutesFrom(date, s.plannedStart);
      const sameWindow = windows.some((w) => w.start <= prevEnd + 1 && nextStart <= w.end && nextStart >= w.start && prevEnd <= w.end + 1);
      if (gap >= 1 && (sameWindow || gap <= 20)) {
        items.push({ kind: "stop", start: prev.plannedEnd, minutes: Math.round(gap), key: `stop-${s.id}` });
      } else if (gap > 20) {
        items.push({ kind: "pause", until: s.plannedStart, key: `pause-${s.id}` });
      }
    }
    items.push({ kind: "station", session: s, task: tasks.get(s.taskId) });
  });
  return items;
}

export function routeSummary(data: NocturneData, date: DateKey) {
  const route = routeOf(data.sessions, date);
  const upcoming = route.filter((s) => s.status === "planned" || s.status === "active");
  return {
    stations: route.length,
    remaining: upcoming.length,
    plannedMinutes: route.reduce((a, s) => a + (s.status === "planned" ? s.plannedMinutes : s.status === "active" ? s.plannedMinutes : s.completedMinutes), 0),
    departure: route[0]?.plannedStart ?? null,
    arrival: route.length ? route[route.length - 1].plannedEnd : null,
    next: upcoming.find((s) => s.status === "planned") ?? null,
    active: route.find((s) => s.status === "active") ?? null,
  };
}
