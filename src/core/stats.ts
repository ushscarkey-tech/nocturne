import { routeOf } from "./sessions";
import { boardingDetails, seeded } from "./stations";
import { addDays, clock, diffDays, parseDateKey, serviceDate } from "./time";
import type { CarriageId, DateKey, FocusLevel, Journey, NocturneData, StudySession } from "./types";

const closed = (s: StudySession) => s.status === "done" || s.status === "partial";

export interface JourneySummary {
  journey: Journey;
  stations: StudySession[];
  focusedMinutes: number;
  plannedMinutes: number;
  stationsCompleted: number;
  stationsTotal: number;
  departure: string | null;
  arrival: string | null;
  /** Positive = arrived later than planned, negative = ahead of schedule. */
  delayMinutes: number;
  completionRate: number;
  taskIds: string[];
}

export function summarizeJourney(data: NocturneData, journey: Journey): JourneySummary {
  const stations = data.sessions
    .filter((s) => s.date === journey.date && s.status !== "skipped")
    .sort((a, b) => a.plannedStart.localeCompare(b.plannedStart));
  const done = stations.filter(closed);
  const focusedMinutes = done.reduce((sum, s) => sum + s.completedMinutes, 0);
  const departure = done[0]?.actualStart ?? journey.startedAt;
  const lastEnd = done.length ? done[done.length - 1].actualEnd : null;
  const arrival = lastEnd ?? journey.completedAt;
  const rawDelay =
    arrival && journey.plannedArrival
      ? Math.round((new Date(arrival).getTime() - new Date(journey.plannedArrival).getTime()) / 60_000)
      : 0;
  // Stopping early is not "ahead of schedule": only a finished route gains time.
  const routeFinished = stations.every((s) => s.status === "done") && stations.length >= journey.stationsPlanned;
  const delay = rawDelay < 0 && !routeFinished ? 0 : rawDelay;
  const plannedMinutes = journey.plannedMinutes || stations.reduce((sum, s) => sum + s.workMinutes, 0);
  const completedWork = done.reduce((sum, s) => sum + s.creditedMinutes, 0);
  return {
    journey,
    stations,
    focusedMinutes,
    plannedMinutes,
    stationsCompleted: stations.filter((s) => s.status === "done").length,
    stationsTotal: Math.max(journey.stationsPlanned, stations.length),
    departure,
    arrival,
    delayMinutes: delay,
    completionRate: plannedMinutes > 0 ? Math.min(1, completedWork / plannedMinutes) : 0,
    taskIds: [...new Set(stations.map((s) => s.taskId))],
  };
}

export interface DayFocus {
  date: DateKey;
  minutes: number;
}

export function focusByDay(sessions: StudySession[], today: DateKey, days = 7): DayFocus[] {
  const out: DayFocus[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(today, -i);
    const minutes = sessions.filter((s) => s.date === date && closed(s)).reduce((sum, s) => sum + s.completedMinutes, 0);
    out.push({ date, minutes });
  }
  return out;
}

export interface ArchiveStats {
  weekFocused: number;
  previousWeekFocused: number;
  stationsCompleted: number;
  completionRate: number;
  estimatedMinutes: number;
  actualMinutes: number;
  /** actual / estimated for finished stations. */
  estimateRatio: number;
  averageDelay: number;
  routeChanges: number;
  byHour: { hour: number; minutes: number; completion: number }[];
  focusMix: Record<FocusLevel, number>;
}

export function archiveStats(data: NocturneData, today: DateKey): ArchiveStats {
  const past = data.sessions.filter((s) => diffDays(s.date, today) >= 0 && diffDays(s.date, today) < 28);
  const week = past.filter((s) => diffDays(s.date, today) < 7);
  const prevWeek = past.filter((s) => diffDays(s.date, today) >= 7 && diffDays(s.date, today) < 14);
  const sum = (list: StudySession[]) => list.filter(closed).reduce((a, s) => a + s.completedMinutes, 0);

  // Stations that were on a past route: finished, cut short, skipped, or left behind.
  const considered = past.filter((s) => s.date < today || closed(s) || s.status === "skipped");
  const done = considered.filter((s) => s.status === "done");
  const finished = past.filter((s) => s.status === "done");
  const estimated = finished.reduce((a, s) => a + s.workMinutes, 0);
  const actual = finished.reduce((a, s) => a + s.completedMinutes, 0);

  const journeys = data.journeys.filter((j) => diffDays(j.date, today) < 28 && j.startedAt);
  const delays = journeys.map((j) => summarizeJourney(data, j).delayMinutes);

  const hours = new Map<number, { minutes: number; done: number; total: number }>();
  for (const s of past.filter((x) => closed(x) && x.actualStart)) {
    const hour = new Date(s.actualStart!).getHours();
    const h = hours.get(hour) ?? { minutes: 0, done: 0, total: 0 };
    h.minutes += s.completedMinutes;
    h.total += 1;
    if (s.status === "done") h.done += 1;
    hours.set(hour, h);
  }

  const focusMix: Record<FocusLevel, number> = { low: 0, steady: 0, sharp: 0 };
  for (const j of journeys) for (const f of j.focusLog) focusMix[f.level] += 1;

  return {
    weekFocused: sum(week),
    previousWeekFocused: sum(prevWeek),
    stationsCompleted: week.filter((s) => s.status === "done").length,
    completionRate: considered.length ? done.length / considered.length : 0,
    estimatedMinutes: estimated,
    actualMinutes: actual,
    estimateRatio: estimated ? actual / estimated : 1,
    averageDelay: delays.length ? Math.round(delays.reduce((a, b) => a + b, 0) / delays.length) : 0,
    routeChanges: journeys.reduce((a, j) => a + j.routeChanges, 0),
    byHour: [...hours.entries()]
      .map(([hour, h]) => ({ hour, minutes: h.minutes, completion: h.total ? h.done / h.total : 0 }))
      .sort((a, b) => a.hour - b.hour),
    focusMix,
  };
}

/** Ticket face values derived from a journey. */
export interface TicketFace {
  /** "boarding": printed before the night starts; "journey": the record after it. */
  kind: "boarding" | "journey";
  serial: string;
  /** Line code: month-day + platform, e.g. "NL-0925-04". */
  routeCode: string;
  /** First and last station names of the night. */
  from: string;
  to: string;
  /** Stable long serial, e.g. "N0925·0417·83". */
  serialLong: string;
  dateLabel: string;
  departure: string;
  arrival: string;
  stops: number;
  focused: number;
  carriage: string;
  seat: string;
  car: string;
  platform: string;
  status: "ROUTE COMPLETE" | "PARTIAL ROUTE" | "SHORT JOURNEY" | "VALID TONIGHT";
  /** Share of planned work completed, 0..100. */
  completion: number;
  /** 0..1 values that drive subtle per-ticket variation. */
  hueShift: number;
  stationMarks: ("done" | "partial" | "open")[];
}

const CARRIAGE_LABEL = { quiet: "QUIET CAR", rain: "RAIN CAR", tunnel: "TUNNEL CAR", moon: "MOON CAR" } as const;
const MONTHS_UPPER = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const pad2 = (n: number) => String(n).padStart(2, "0");

/** Ticket identity shared by the boarding pass and the night's ticket (both derive from the date). */
function ticketIdentity(date: DateKey, platform: string) {
  const d = parseDateKey(date);
  const md = `${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
  const rand = seeded(`ticket:${date}`);
  const block = String(Math.floor(rand() * 10_000)).padStart(4, "0");
  const check = pad2(Math.floor(rand() * 100));
  return {
    serial: md,
    dateLabel: `${MONTHS_UPPER[d.getMonth()]} ${pad2(d.getDate())} ${d.getFullYear()}`,
    routeCode: `NL-${md}-${platform.padStart(2, "0")}`,
    serialLong: `N${md}·${block}·${check}`,
    day: d.getDate(),
  };
}

function endpoints(stations: StudySession[]): { from: string; to: string } {
  const from = stations[0]?.stationName || "NOCTURNE";
  const to = stations[stations.length - 1]?.stationName || "NOCTURNE";
  return { from, to };
}

export function ticketFace(data: NocturneData, journey: Journey): TicketFace {
  const s = summarizeJourney(data, journey);
  const id = ticketIdentity(journey.date, journey.platform);
  const status: TicketFace["status"] =
    s.completionRate >= 0.9 ? "ROUTE COMPLETE" : s.completionRate >= 0.5 ? "PARTIAL ROUTE" : "SHORT JOURNEY";
  return {
    kind: "journey",
    serial: id.serial,
    routeCode: id.routeCode,
    ...endpoints(s.stations),
    serialLong: id.serialLong,
    dateLabel: id.dateLabel,
    departure: s.departure ? clock(s.departure) : "--:--",
    arrival: s.arrival ? clock(s.arrival) : "--:--",
    stops: s.stationsTotal,
    focused: s.focusedMinutes,
    carriage: CARRIAGE_LABEL[journey.selectedCarriage],
    seat: journey.seat,
    car: journey.car,
    platform: journey.platform,
    status,
    completion: Math.round(s.completionRate * 100),
    hueShift: ((s.focusedMinutes * 7 + id.day * 13) % 100) / 100,
    stationMarks: s.stations.map((x) => (x.status === "done" ? "done" : x.status === "partial" ? "partial" : "open")),
  };
}

/**
 * Printable rows of a ticket, in print order. Rows before `split` sit above
 * the perforation. The Ticket component renders exactly these rows.
 */
export type TicketRowId = "header" | "date" | "times" | "route" | "grid1" | "grid2" | "gridSm" | "stub" | "code";

export function ticketRows(size: "sm" | "md" | "lg" = "lg"): { rows: TicketRowId[]; split: number } {
  if (size === "sm") return { rows: ["header", "times", "route", "gridSm", "stub", "code"], split: 4 };
  return { rows: ["header", "date", "times", "route", "grid1", "grid2", "stub", "code"], split: 6 };
}

/** How many rows the printer lays down for a ticket (drives the Ticket `printed` prop). */
export function ticketRowCount(face: TicketFace, size: "sm" | "md" | "lg" = "lg"): number {
  void face;
  return ticketRows(size).rows.length;
}

/** The boarding pass printed before tonight's journey starts: planned figures only. */
export function boardingTicketFace(data: NocturneData, date: DateKey, carriage: CarriageId): TicketFace {
  const route = routeOf(data.sessions, date);
  const details = boardingDetails(date);
  const id = ticketIdentity(date, details.platform);
  const planned = route.reduce((sum, s) => sum + s.workMinutes, 0);
  const last = route[route.length - 1];
  return {
    kind: "boarding",
    serial: id.serial,
    routeCode: id.routeCode,
    ...endpoints(route),
    serialLong: id.serialLong,
    dateLabel: id.dateLabel,
    departure: route[0] ? clock(route[0].plannedStart) : "--:--",
    arrival: last ? clock(last.plannedEnd) : "--:--",
    stops: route.length,
    focused: planned,
    carriage: CARRIAGE_LABEL[carriage],
    seat: details.seat,
    car: details.car,
    platform: details.platform,
    status: "VALID TONIGHT",
    completion: 0,
    hueShift: ((planned * 7 + id.day * 13) % 100) / 100,
    stationMarks: route.map(() => "open"),
  };
}

export function isToday(date: DateKey, now: Date): boolean {
  return date === serviceDate(now);
}
