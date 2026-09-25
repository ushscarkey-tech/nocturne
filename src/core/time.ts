import type { DateKey } from "./types";

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * A night of study belongs to the evening it started on: the service day
 * rolls over at 04:00, not midnight, so 23:30–00:45 is still "tonight".
 */
export const DAY_START_HOUR = 4;
export const DAY_START_MINUTES = DAY_START_HOUR * 60;

export function toDateKey(d: Date): DateKey {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The service day an instant belongs to. */
export function serviceDate(d: Date): DateKey {
  return toDateKey(new Date(d.getTime() - DAY_START_HOUR * 3_600_000));
}

/** Minutes since midnight of the service day (can exceed 1440 after midnight). */
export function serviceMinutes(d: Date, date: DateKey = serviceDate(d)): number {
  return minutesFrom(date, d);
}

export function parseDateKey(key: DateKey): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key: DateKey, n: number): DateKey {
  const d = parseDateKey(key);
  d.setDate(d.getDate() + n);
  return toDateKey(d);
}

/** Whole days from `a` to `b` (positive when `b` is later). DST-safe. */
export function diffDays(a: DateKey, b: DateKey): number {
  return Math.round((parseDateKey(b).getTime() - parseDateKey(a).getTime()) / 86_400_000);
}

export function dayOfWeek(key: DateKey): number {
  return parseDateKey(key).getDay();
}

export function parseHM(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + (m || 0);
}

export function formatHM(minutes: number): string {
  const m = Math.round(minutes);
  return `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
}

/** Local Date at `minutes` past midnight of `key`. */
export function atMinutes(key: DateKey, minutes: number): Date {
  const d = parseDateKey(key);
  d.setHours(0, 0, 0, 0);
  return new Date(d.getTime() + Math.round(minutes * 60_000));
}

/** Minutes past local midnight (fractional). */
export function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
}

/** Minutes past midnight of `key` for an instant (may exceed 1440 or be negative). */
export function minutesFrom(key: DateKey, iso: string | Date): number {
  const t = typeof iso === "string" ? new Date(iso).getTime() : iso.getTime();
  return (t - parseDateKey(key).getTime()) / 60_000;
}

export function clock(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function roundUp(value: number, step: number): number {
  return Math.ceil(value / step - 1e-9) * step;
}

export function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}

/** "3h 25m", "55m", "2h". */
export function formatDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r}m`;
  if (r === 0) return `${h}h`;
  return `${h}h ${pad(r)}m`;
}

/** "37:42" or "1:02:05". */
export function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.ceil(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Sep 29" */
export function formatShortDate(key: DateKey): string {
  const d = parseDateKey(key);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/** "Thursday, Sep 25" */
export function formatLongDate(key: DateKey): string {
  const d = parseDateKey(key);
  return `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/** Relative deadline label: "Today", "Tomorrow", "Fri", "Sep 29", "2 days overdue". */
export function relativeDay(today: DateKey, key: DateKey): string {
  const n = diffDays(today, key);
  if (n === 0) return "Today";
  if (n === 1) return "Tomorrow";
  if (n === -1) return "Yesterday";
  if (n < 0) return `${-n} days overdue`;
  if (n < 7) return WEEKDAY_SHORT[dayOfWeek(key)];
  return formatShortDate(key);
}

export function monthDayUpper(key: DateKey): string {
  const d = parseDateKey(key);
  return `${MONTHS[d.getMonth()].toUpperCase()} ${pad(d.getDate())} ${d.getFullYear()}`;
}
