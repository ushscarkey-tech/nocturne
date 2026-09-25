import { DAY_START_MINUTES, dayOfWeek, parseHM } from "./time";
import type { DateKey, StudyWindow } from "./types";

/** Half-open interval in minutes past local midnight. */
export interface Interval {
  start: number;
  end: number;
}

/** Break inserted between stations, and the rough cadence used for capacity. */
export const BREAK_SHORT = 5;
export const BREAK_LONG = 10;
/** Fragments shorter than this are not worth a station. */
export const MIN_USEFUL_MINUTES = 15;

export function mergeIntervals(list: Interval[]): Interval[] {
  const sorted = list.filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const cur of sorted) {
    const last = out[out.length - 1];
    if (last && cur.start <= last.end) last.end = Math.max(last.end, cur.end);
    else out.push({ ...cur });
  }
  return out;
}

export function subtractIntervals(base: Interval[], cuts: Interval[]): Interval[] {
  let result = mergeIntervals(base);
  for (const cut of mergeIntervals(cuts)) {
    const next: Interval[] = [];
    for (const iv of result) {
      if (cut.end <= iv.start || cut.start >= iv.end) {
        next.push(iv);
        continue;
      }
      if (cut.start > iv.start) next.push({ start: iv.start, end: cut.start });
      if (cut.end < iv.end) next.push({ start: cut.end, end: iv.end });
    }
    result = next;
  }
  return result;
}

export function clipIntervals(list: Interval[], from: number): Interval[] {
  return list
    .map((i) => ({ start: Math.max(i.start, from), end: i.end }))
    .filter((i) => i.end - i.start > 0);
}

/**
 * A window's minutes on its service day. Times before 04:00 belong to the
 * same night (after midnight), and an end earlier than the start crosses
 * midnight: 22:00–01:00 is 1320–1500.
 */
export function windowInterval(w: Pick<StudyWindow, "startTime" | "endTime">): Interval {
  let start = parseHM(w.startTime);
  let end = parseHM(w.endTime);
  if (start < DAY_START_MINUTES) {
    start += 1440;
    end += 1440;
  } else if (end <= start) {
    end += 1440;
  }
  return { start, end };
}

/** Why a window can't be saved, or null when it is valid. */
export function windowProblem(w: Pick<StudyWindow, "startTime" | "endTime">): string | null {
  const { start, end } = windowInterval(w);
  if (end <= start) return "Service must end after it starts.";
  if (end > 1440 + DAY_START_MINUTES) return "A night's service has to end by 04:00.";
  if (end - start < MIN_USEFUL_MINUTES) return `Windows need at least ${MIN_USEFUL_MINUTES} minutes.`;
  return null;
}

export function windowAppliesTo(w: StudyWindow, date: DateKey): boolean {
  if (!w.enabled) return false;
  if (w.recurring) return w.dayOfWeek === dayOfWeek(date);
  return w.specificDate === date;
}

/** Service Time for a date: weekly windows + one-off additions − blocked exceptions. */
export function availabilityForDate(windows: StudyWindow[], date: DateKey): Interval[] {
  const applicable = windows.filter((w) => windowAppliesTo(w, date));
  const toInterval = windowInterval;
  const available = applicable.filter((w) => w.kind === "available").map(toInterval);
  const blocked = applicable.filter((w) => w.kind === "blocked").map(toInterval);
  return subtractIntervals(available, blocked);
}

export function totalMinutes(list: Interval[]): number {
  return list.reduce((sum, i) => sum + (i.end - i.start), 0);
}

/**
 * Focus minutes that realistically fit a stretch of time once Station Stops
 * are accounted for (roughly one 10-minute stop per hour).
 */
export function focusCapacity(length: number): number {
  if (length < MIN_USEFUL_MINUTES) return 0;
  const stops = Math.max(0, Math.ceil(length / 60) - 1);
  return Math.max(0, length - stops * BREAK_LONG);
}

export function capacityOf(list: Interval[]): number {
  return list.reduce((sum, i) => sum + focusCapacity(i.end - i.start), 0);
}

export function breakAfter(minutes: number): number {
  return minutes >= 45 ? BREAK_LONG : BREAK_SHORT;
}
