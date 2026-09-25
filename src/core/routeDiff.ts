/**
 * What a route adjustment actually did, station by station, so the
 * departure board can say it the way stations do: earlier, delayed, new,
 * or work that changes trains (continues at another stop, or on another
 * day's train).
 */
import { clock } from "./time";
import type { StudySession } from "./types";

export type StationMark =
  | { kind: "same" }
  | { kind: "new" }
  /** The task continues here from another stop: a transfer within tonight. */
  | { kind: "transfer" }
  | { kind: "earlier"; from: string; min: number }
  | { kind: "later"; from: string; min: number };

export interface RouteDiff {
  marks: Record<string, StationMark>;
  /** Work that left tonight's route: it changes to another day's train. */
  transfers: { taskId: string; minutes: number }[];
  changed: boolean;
}

const SHIFT_MIN = 3;
const LOST_MIN = 5;

function byTask(list: StudySession[]): Map<string, StudySession[]> {
  const map = new Map<string, StudySession[]>();
  for (const s of list) {
    const l = map.get(s.taskId) ?? [];
    l.push(s);
    map.set(s.taskId, l);
  }
  return map;
}

/**
 * Compare tonight's route before an adjustment (`before`: stations that were
 * planned or running) with the route now (`after`: all of tonight's
 * stations). Stations are matched per task, in order.
 */
export function diffRoutes(before: StudySession[], after: StudySession[], since: string): RouteDiff {
  const prior = byTask(before);
  const seen = new Map<string, number>();
  const marks: Record<string, StationMark> = {};
  let changed = false;

  const upcoming = after.filter((s) => s.status === "planned" || s.status === "active");
  for (const s of upcoming) {
    const k = seen.get(s.taskId) ?? 0;
    seen.set(s.taskId, k + 1);
    if (s.status === "active") continue;
    const list = prior.get(s.taskId);
    const prev = list?.[k];
    let mark: StationMark;
    if (!prev) mark = list?.length ? { kind: "transfer" } : { kind: "new" };
    else {
      const delta = Math.round((Date.parse(s.plannedStart) - Date.parse(prev.plannedStart)) / 60_000);
      mark =
        delta <= -SHIFT_MIN
          ? { kind: "earlier", from: clock(prev.plannedStart), min: -delta }
          : delta >= SHIFT_MIN
            ? { kind: "later", from: clock(prev.plannedStart), min: delta }
            : { kind: "same" };
    }
    if (mark.kind !== "same") changed = true;
    marks[s.id] = mark;
  }

  // Minutes that were on tonight's route and no longer are — minus what got
  // done in the meantime — have gone to another day.
  const transfers: RouteDiff["transfers"] = [];
  const now = byTask(upcoming);
  const closedSince = after.filter((s) => (s.status === "done" || s.status === "partial") && (s.actualEnd ?? "") >= since);
  const done = byTask(closedSince);
  for (const [taskId, list] of prior) {
    const planned = list.reduce((a, s) => a + s.workMinutes, 0);
    const still = (now.get(taskId) ?? []).reduce((a, s) => a + s.workMinutes, 0);
    const worked = (done.get(taskId) ?? []).reduce((a, s) => a + s.completedMinutes, 0);
    // A task finished outright doesn't transfer anywhere.
    if ((done.get(taskId) ?? []).some((s) => s.status === "done" && s.completedMinutes >= s.workMinutes) && !now.has(taskId)) continue;
    const lost = planned - still - worked;
    if (lost >= LOST_MIN) {
      transfers.push({ taskId, minutes: Math.round(lost) });
      changed = true;
    }
  }
  return { marks, transfers, changed };
}
