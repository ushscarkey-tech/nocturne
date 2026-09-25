import { addDays, clock, diffDays, parseDateKey, toDateKey } from "./time";
import type { DateKey, FocusLevel, Journey, NocturneData, StudySession } from "./types";

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
  const delay =
    arrival && journey.plannedArrival
      ? Math.round((new Date(arrival).getTime() - new Date(journey.plannedArrival).getTime()) / 60_000)
      : 0;
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
  serial: string;
  dateLabel: string;
  departure: string;
  arrival: string;
  stops: number;
  focused: number;
  carriage: string;
  seat: string;
  car: string;
  platform: string;
  status: "ROUTE COMPLETE" | "PARTIAL ROUTE" | "SHORT JOURNEY";
  /** 0..1 values that drive subtle per-ticket variation. */
  hueShift: number;
  stationMarks: ("done" | "partial" | "open")[];
}

const CARRIAGE_LABEL = { quiet: "QUIET CAR", rain: "RAIN CAR", tunnel: "TUNNEL CAR", moon: "MOON CAR" } as const;

export function ticketFace(data: NocturneData, journey: Journey): TicketFace {
  const s = summarizeJourney(data, journey);
  const d = parseDateKey(journey.date);
  const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const status: TicketFace["status"] =
    s.completionRate >= 0.9 ? "ROUTE COMPLETE" : s.completionRate >= 0.5 ? "PARTIAL ROUTE" : "SHORT JOURNEY";
  return {
    serial: `${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`,
    dateLabel: `${months[d.getMonth()]} ${String(d.getDate()).padStart(2, "0")} ${d.getFullYear()}`,
    departure: s.departure ? clock(s.departure) : "--:--",
    arrival: s.arrival ? clock(s.arrival) : "--:--",
    stops: s.stationsTotal,
    focused: s.focusedMinutes,
    carriage: CARRIAGE_LABEL[journey.selectedCarriage],
    seat: journey.seat,
    car: journey.car,
    platform: journey.platform,
    status,
    hueShift: ((s.focusedMinutes * 7 + d.getDate() * 13) % 100) / 100,
    stationMarks: s.stations.map((x) => (x.status === "done" ? "done" : x.status === "partial" ? "partial" : "open")),
  };
}

export function isToday(date: DateKey, now: Date): boolean {
  return date === toDateKey(now);
}
