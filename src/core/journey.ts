/**
 * Journey engine: pure state transitions for a night of focus.
 *
 *   boarding → cabin ⇄ stop → … → paused (between Service windows) → final
 *
 * Every transition takes the full dataset and returns a new one plus an
 * optional RouteChange explanation. The UI layer only renders and persists.
 */
import { newId } from "./ids";
import { planToday, type PlanTodayOptions } from "./planner";
import { availabilityForDate, breakAfter } from "./availability";
import { activeSession, elapsedSeconds, routeOf, sessionsOn, upcomingOn } from "./sessions";
import { boardingDetails } from "./stations";
import { atMinutes, minutesOfDay, toDateKey } from "./time";
import type {
  AmbienceId,
  CarriageId,
  FocusLevel,
  Journey,
  NocturneData,
  ReplanReason,
  RouteChange,
  StudySession,
  Task,
  Ticket,
} from "./types";

export const CARRIAGE_AMBIENCE: Record<CarriageId, AmbienceId> = {
  quiet: "quiet-cabin",
  rain: "rain-window",
  tunnel: "tunnel",
  moon: "night-rail",
};

/** Minimum Station Stop, so arrival never feels like a hard cut. */
export const MIN_STOP_MINUTES = 3;
export const LOW_FOCUS_STOP_MINUTES = 10;

export interface EngineResult {
  data: NocturneData;
  change: RouteChange | null;
}

const iso = (d: Date) => d.toISOString();

export function journeyFor(data: NocturneData, date: string): Journey | undefined {
  return data.journeys.find((j) => j.date === date);
}

function replaceJourney(data: NocturneData, j: Journey): NocturneData {
  const exists = data.journeys.some((x) => x.id === j.id);
  return { ...data, journeys: exists ? data.journeys.map((x) => (x.id === j.id ? j : x)) : [...data.journeys, j] };
}

function replaceSession(sessions: StudySession[], s: StudySession): StudySession[] {
  return sessions.map((x) => (x.id === s.id ? s : x));
}

function replaceTask(tasks: Task[], t: Task): Task[] {
  return tasks.map((x) => (x.id === t.id ? t : x));
}

function withChange(j: Journey, change: RouteChange | null): Journey {
  if (!change) return j;
  return { ...j, routeChanges: j.routeChanges + 1, changeLog: [...j.changeLog, change] };
}

function replan(
  data: NocturneData,
  opts: Omit<PlanTodayOptions, "focus"> & { focus?: FocusLevel },
  focusFallback: FocusLevel,
): { data: NocturneData; change: RouteChange | null } {
  const result = planToday(
    { tasks: data.tasks, windows: data.windows, sessions: data.sessions, userId: data.profile.id },
    { ...opts, focus: opts.focus ?? focusFallback },
  );
  return { data: { ...data, sessions: result.sessions }, change: result.change };
}

/** Apply credited work to a task and close it when nothing is left. */
function creditTask(tasks: Task[], taskId: string, minutes: number, now: Date, completeAll = false): Task[] {
  const t = tasks.find((x) => x.id === taskId);
  if (!t) return tasks;
  if (t.recurrence) return replaceTask(tasks, { ...t, updatedAt: iso(now) });
  const remaining = completeAll ? 0 : Math.max(0, Math.round(t.remainingMinutes - minutes));
  const done = remaining <= 0;
  return replaceTask(tasks, {
    ...t,
    remainingMinutes: remaining,
    status: done ? "done" : t.status,
    completedAt: done ? iso(now) : t.completedAt,
    updatedAt: iso(now),
  });
}

function routeTotals(sessions: StudySession[], date: string) {
  const route = routeOf(sessions, date);
  const planned = route.reduce((sum, s) => sum + s.plannedMinutes, 0);
  return {
    stations: route.length,
    planned,
    departure: route[0]?.plannedStart ?? null,
    arrival: route.length ? route[route.length - 1].plannedEnd : null,
  };
}

/** Create (or return) tonight's journey record in the boarding phase. */
export function ensureJourney(data: NocturneData, now: Date, carriage: CarriageId): { data: NocturneData; journey: Journey } {
  const date = toDateKey(now);
  const existing = journeyFor(data, date);
  if (existing) return { data, journey: existing };
  const totals = routeTotals(data.sessions, date);
  const details = boardingDetails(date);
  const journey: Journey = {
    id: newId(),
    userId: data.profile.id,
    date,
    phase: "boarding",
    ...details,
    plannedMinutes: totals.planned,
    focusedMinutes: 0,
    stationsPlanned: totals.stations,
    stationsCompleted: 0,
    routeChanges: 0,
    selectedCarriage: carriage,
    selectedAmbience: CARRIAGE_AMBIENCE[carriage],
    plannedDeparture: totals.departure,
    plannedArrival: totals.arrival,
    startedAt: null,
    completedAt: null,
    stopEndsAt: null,
    focus: "steady",
    focusLog: [],
    changeLog: [],
  };
  return { data: replaceJourney(data, journey), journey };
}

function startStation(sessions: StudySession[], s: StudySession, now: Date, focus: FocusLevel): StudySession[] {
  const end = new Date(now.getTime() + s.plannedMinutes * 60_000);
  return replaceSession(sessions, {
    ...s,
    status: "active",
    actualStart: s.actualStart ?? iso(now),
    resumedAt: iso(now),
    plannedStart: iso(now),
    plannedEnd: iso(end),
    focusBefore: s.focusBefore ?? focus,
  });
}

/**
 * Board: record focus + carriage, rebuild the route from now for the reported
 * focus, and depart immediately with the first station.
 */
export function board(
  data: NocturneData,
  args: { focus: FocusLevel; carriage: CarriageId },
  now: Date,
): EngineResult {
  const date = toDateKey(now);
  const ensured = ensureJourney(data, now, args.carriage);
  let next = ensured.data;
  let journey = ensured.journey;
  const firstPlanned = upcomingOn(next.sessions, date)[0];
  const late = firstPlanned ? (now.getTime() - new Date(firstPlanned.plannedStart).getTime()) / 60_000 >= 10 : false;
  const reason: ReplanReason = late ? "late-start" : "boarding";

  // A steady traveller keeps the route as planned (and any manual edits);
  // a Low or Sharp signal re-sorts the stations that have not started.
  const hasRoute = upcomingOn(next.sessions, date).length > 0;
  const mode = hasRoute && args.focus === "steady" ? "retime" : "reoptimize";
  // Depart now: the first station may start outside Service Time if the
  // traveller chooses to begin early; the rest follow inside it.
  const planned = replan(next, { now, mode, reason, focus: args.focus }, args.focus);
  next = planned.data;
  const first = upcomingOn(next.sessions, date)[0];
  let change = planned.change;
  if (first) {
    next = { ...next, sessions: startStation(next.sessions, first, now, args.focus) };
    const retimed = replan(next, { now, mode: "retime", reason: "depart" }, args.focus);
    next = retimed.data;
    change = change ?? retimed.change;
  }

  const totals = routeTotals(next.sessions, date);
  journey = {
    ...journey,
    phase: first ? "cabin" : "final",
    selectedCarriage: args.carriage,
    selectedAmbience: CARRIAGE_AMBIENCE[args.carriage],
    focus: args.focus,
    focusLog: [...journey.focusLog, { at: iso(now), level: args.focus }],
    startedAt: journey.startedAt ?? iso(now),
    // The first boarding fixes the planned figures the night is measured against.
    plannedMinutes: journey.startedAt ? journey.plannedMinutes : totals.planned,
    stationsPlanned: journey.startedAt ? journey.stationsPlanned : totals.stations,
    plannedDeparture: journey.startedAt ? journey.plannedDeparture : (journey.plannedDeparture ?? totals.departure),
    plannedArrival: journey.startedAt ? journey.plannedArrival : (journey.plannedArrival ?? totals.arrival),
    stopEndsAt: null,
  };
  journey = withChange(journey, late || reason === "late-start" ? change : null);
  return { data: replaceJourney(next, journey), change: late ? change : null };
}

/** Where the traveller goes after a station closes. */
function afterStation(data: NocturneData, journey: Journey, now: Date, stopMinutes?: number): Journey {
  const date = journey.date;
  const next = upcomingOn(data.sessions, date)[0];
  if (!next) return { ...journey, phase: "final", stopEndsAt: null };
  const gap = (new Date(next.plannedStart).getTime() - now.getTime()) / 60_000;
  // A long gap means the next Service window has not opened yet.
  if (gap > 30) return { ...journey, phase: "paused", stopEndsAt: next.plannedStart };
  const minutes = Math.max(stopMinutes ?? 0, MIN_STOP_MINUTES, Math.round(gap));
  return { ...journey, phase: "stop", stopEndsAt: iso(new Date(now.getTime() + minutes * 60_000)) };
}

function closeActive(
  data: NocturneData,
  now: Date,
  kind: "complete" | "early" | "early-all" | "partial",
): { data: NocturneData; closed: StudySession | null } {
  const active = activeSession(data.sessions);
  if (!active) return { data, closed: null };
  const rawSec = elapsedSeconds(active, now);
  const focusedSec = kind === "complete" ? Math.min(rawSec, active.plannedMinutes * 60) : rawSec;
  const focused = Math.round(focusedSec / 60);
  let credited: number;
  switch (kind) {
    case "complete":
    case "early":
      credited = active.workMinutes;
      break;
    case "early-all":
      credited = data.tasks.find((t) => t.id === active.taskId)?.remainingMinutes ?? active.workMinutes;
      break;
    case "partial":
      credited = Math.round((active.workMinutes * focusedSec) / Math.max(60, active.plannedMinutes * 60));
      break;
  }
  const closed: StudySession = {
    ...active,
    status: kind === "partial" ? "partial" : "done",
    completedMinutes: focused,
    creditedMinutes: credited,
    elapsedSeconds: Math.round(focusedSec),
    resumedAt: null,
    actualEnd: iso(now),
    plannedEnd: iso(now),
    plannedMinutes: Math.max(1, focused),
  };
  const tasks = creditTask(data.tasks, active.taskId, credited, now, kind === "early-all");
  let sessions = replaceSession(data.sessions, closed);
  // A task finished outright leaves the rest of tonight's line.
  const task = tasks.find((t) => t.id === active.taskId);
  if (task?.status === "done") sessions = sessions.filter((s) => !(s.taskId === task.id && s.status === "planned" && !s.locked));
  const journey = journeyFor(data, active.date);
  let next: NocturneData = { ...data, tasks, sessions };
  if (journey) {
    const route = sessionsOn(sessions, active.date);
    next = replaceJourney(next, {
      ...journey,
      focusedMinutes: route.reduce((sum, s) => sum + (s.status === "done" || s.status === "partial" ? s.completedMinutes : 0), 0),
      stationsCompleted: route.filter((s) => s.status === "done").length,
    });
  }
  return { data: next, closed };
}

/**
 * The station's time ran out: arrive and step onto the platform. If the app
 * was closed, the station closes at the moment it was due, not when noticed.
 */
export function arrive(data: NocturneData, now: Date): EngineResult {
  const active = activeSession(data.sessions);
  if (!active) return { data, change: null };
  const overrun = elapsedSeconds(active, now) - active.plannedMinutes * 60;
  const due = overrun > 0 ? new Date(now.getTime() - overrun * 1000) : now;
  const { data: closedData, closed } = closeActive(data, due, "complete");
  if (!closed) return { data, change: null };
  const journey = journeyFor(closedData, closed.date);
  if (!journey) return { data: closedData, change: null };
  return { data: replaceJourney(closedData, afterStation(closedData, journey, due)), change: null };
}

/**
 * Close anything left open on earlier days (the app was closed mid-journey):
 * running stations are banked as partial, journeys move to Final Station.
 */
export function settleStale(data: NocturneData, now: Date): NocturneData {
  const today = toDateKey(now);
  let next = data;
  const stale = data.sessions.filter((s) => s.status === "active" && s.date < today);
  for (const s of stale) {
    const end = new Date(Math.min(now.getTime(), new Date(s.plannedEnd).getTime()));
    const focusedSec = Math.min(elapsedSeconds(s, end), s.plannedMinutes * 60);
    const credited = Math.round((s.workMinutes * focusedSec) / Math.max(60, s.plannedMinutes * 60));
    next = {
      ...next,
      tasks: creditTask(next.tasks, s.taskId, credited, now),
      sessions: replaceSession(next.sessions, {
        ...s,
        status: credited >= s.workMinutes ? "done" : "partial",
        completedMinutes: Math.round(focusedSec / 60),
        creditedMinutes: credited,
        elapsedSeconds: Math.round(focusedSec),
        resumedAt: null,
        actualEnd: iso(end),
      }),
    };
  }
  const openJourneys = next.journeys.filter((j) => j.date < today && j.phase !== "final" && j.startedAt);
  for (const j of openJourneys) {
    const day = sessionsOn(next.sessions, j.date).filter((s) => s.status === "done" || s.status === "partial");
    next = replaceJourney(next, {
      ...j,
      phase: "final",
      stopEndsAt: null,
      focusedMinutes: day.reduce((a, s) => a + s.completedMinutes, 0),
      stationsCompleted: day.filter((s) => s.status === "done").length,
      completedAt: j.completedAt ?? day[day.length - 1]?.actualEnd ?? j.startedAt,
    });
  }
  return next;
}

export function finishEarly(data: NocturneData, now: Date, wholeTask: boolean): EngineResult {
  const { data: closedData, closed } = closeActive(data, now, wholeTask ? "early-all" : "early");
  if (!closed) return { data, change: null };
  const journey = journeyFor(closedData, closed.date)!;
  const startFrom = new Date(now.getTime() + breakAfter(closed.completedMinutes) * 60_000);
  const planned = replan(closedData, { now, mode: "retime", reason: "finish-early", startFrom }, journey.focus);
  const j = afterStation(planned.data, withChange(journey, planned.change), now);
  return { data: replaceJourney(planned.data, j), change: planned.change };
}

export function needMoreTime(data: NocturneData, now: Date, minutes: number): EngineResult {
  const active = activeSession(data.sessions);
  if (!active) return { data, change: null };
  const extended: StudySession = {
    ...active,
    plannedMinutes: active.plannedMinutes + minutes,
    plannedEnd: iso(new Date(new Date(active.plannedEnd).getTime() + minutes * 60_000)),
  };
  const next = { ...data, sessions: replaceSession(data.sessions, extended) };
  const journey = journeyFor(next, active.date)!;
  const planned = replan(next, { now, mode: "retime", reason: "more-time" }, journey.focus);
  return { data: replaceJourney(planned.data, withChange(journey, planned.change)), change: planned.change };
}

/**
 * Low Focus: bank what was done, hand the rest back to the planner, take a
 * longer stop and rebuild the remaining route for low focus.
 */
export function lowFocus(data: NocturneData, now: Date): EngineResult {
  const active = activeSession(data.sessions);
  if (!active) return { data, change: null };
  const { data: closedData, closed } = closeActive(data, now, "partial");
  if (!closed) return { data, change: null };
  const returned = Math.max(0, Math.round(active.workMinutes - closed.creditedMinutes));
  const stopEnd = new Date(now.getTime() + LOW_FOCUS_STOP_MINUTES * 60_000);
  const planned = replan(
    { ...closedData, sessions: replaceSession(closedData.sessions, { ...closed, focusAfter: "low" }) },
    {
      now,
      mode: "reoptimize",
      reason: "low-focus",
      focus: "low",
      startFrom: stopEnd,
      returnedWork: returned >= 5 ? { taskId: active.taskId, minutes: returned } : undefined,
    },
    "low",
  );
  let journey = journeyFor(planned.data, active.date)!;
  journey = withChange(
    { ...journey, focus: "low", focusLog: [...journey.focusLog, { at: iso(now), level: "low" }] },
    planned.change,
  );
  journey = afterStation(planned.data, journey, now, LOW_FOCUS_STOP_MINUTES);
  return { data: replaceJourney(planned.data, journey), change: planned.change };
}

export function pause(data: NocturneData, now: Date): EngineResult {
  const active = activeSession(data.sessions);
  if (!active || !active.resumedAt) return { data, change: null };
  const paused = { ...active, elapsedSeconds: elapsedSeconds(active, now), resumedAt: null };
  return { data: { ...data, sessions: replaceSession(data.sessions, paused) }, change: null };
}

export function resume(data: NocturneData, now: Date): EngineResult {
  const active = activeSession(data.sessions);
  if (!active || active.resumedAt) return { data, change: null };
  const remainingMs = (active.plannedMinutes * 60 - active.elapsedSeconds) * 1000;
  const resumed: StudySession = {
    ...active,
    resumedAt: iso(now),
    plannedEnd: iso(new Date(now.getTime() + remainingMs)),
  };
  const next = { ...data, sessions: replaceSession(data.sessions, resumed) };
  const journey = journeyFor(next, active.date)!;
  const planned = replan(next, { now, mode: "retime", reason: "depart" }, journey.focus);
  return { data: planned.data, change: null };
}

/** Leave the platform: start the next station now and retime the rest. */
export function depart(data: NocturneData, now: Date): EngineResult {
  const date = toDateKey(now);
  const journey = journeyFor(data, date);
  if (!journey) return { data, change: null };
  const next = upcomingOn(data.sessions, date)[0];
  if (!next) return { data: replaceJourney(data, { ...journey, phase: "final", stopEndsAt: null }), change: null };
  const started: NocturneData = { ...data, sessions: startStation(data.sessions, next, now, journey.focus) };
  const planned = replan(started, { now, mode: "retime", reason: "depart" }, journey.focus);
  return { data: replaceJourney(planned.data, { ...journey, phase: "cabin", stopEndsAt: null }), change: null };
}

export function extendStop(data: NocturneData, now: Date, minutes: number): EngineResult {
  const journey = journeyFor(data, toDateKey(now));
  if (!journey?.stopEndsAt) return { data, change: null };
  const end = new Date(Math.max(now.getTime(), new Date(journey.stopEndsAt).getTime()) + minutes * 60_000);
  const planned = replan(data, { now, mode: "retime", reason: "edit", startFrom: end }, journey.focus);
  return { data: replaceJourney(planned.data, { ...journey, stopEndsAt: iso(end) }), change: null };
}

/** Signal change at a Station Stop or before resuming service. */
export function reassessFocus(data: NocturneData, now: Date, level: FocusLevel): EngineResult {
  const journey = journeyFor(data, toDateKey(now));
  if (!journey || journey.focus === level) return { data, change: null };
  const startFrom = journey.stopEndsAt ? new Date(journey.stopEndsAt) : now;
  const planned = replan(data, { now, mode: "reoptimize", reason: "signal-change", focus: level, startFrom }, level);
  const updated = withChange(
    { ...journey, focus: level, focusLog: [...journey.focusLog, { at: iso(now), level }] },
    planned.change,
  );
  return { data: replaceJourney(planned.data, updated), change: planned.change };
}

/** Resume after "Service paused": rebuild with actual progress, then depart. */
export function resumeService(data: NocturneData, now: Date, focus: FocusLevel): EngineResult {
  const journey = journeyFor(data, toDateKey(now));
  if (!journey) return { data, change: null };
  const planned = replan(data, { now, mode: "reoptimize", reason: "service-resume", focus }, focus);
  const updated = withChange(
    { ...journey, focus, focusLog: [...journey.focusLog, { at: iso(now), level: focus }] },
    planned.change,
  );
  const departed = depart(replaceJourney(planned.data, updated), now);
  return { data: departed.data, change: planned.change };
}

/**
 * End the night: bank any running station, and hand every station that was
 * not reached back to the planner so its work flows to later days.
 */
export function endJourney(data: NocturneData, now: Date): EngineResult {
  const date = toDateKey(now);
  let next = data;
  const active = activeSession(data.sessions);
  if (active && elapsedSeconds(active, now) >= 60) next = closeActive(data, now, "partial").data;
  else if (active) next = { ...next, sessions: replaceSession(next.sessions, { ...active, status: "planned", resumedAt: null }) };
  next = { ...next, sessions: next.sessions.filter((s) => !(s.date === date && s.status === "planned")) };
  const journey = journeyFor(next, date);
  if (!journey) return { data: next, change: null };
  return { data: replaceJourney(next, { ...journey, phase: "final", stopEndsAt: null }), change: null };
}

export function issueTicket(data: NocturneData, journeyId: string, now: Date): { data: NocturneData; ticket: Ticket } {
  const existing = data.tickets.find((t) => t.journeyId === journeyId);
  const journey = data.journeys.find((j) => j.id === journeyId)!;
  if (existing) return { data, ticket: existing };
  const [, m, d] = journey.date.split("-");
  const ticket: Ticket = {
    id: newId(),
    journeyId,
    userId: data.profile.id,
    generatedAt: iso(now),
    ticketStyle: journey.selectedCarriage,
    serial: `${m}${d}`,
  };
  const completed: Journey = { ...journey, phase: "final", completedAt: journey.completedAt ?? iso(now) };
  return { data: { ...replaceJourney(data, completed), tickets: [...data.tickets, ticket] }, ticket };
}

/** Where the next departure is, for "Service paused" and Tonight. */
export function nextDeparture(data: NocturneData, now: Date): Date | null {
  const next = upcomingOn(data.sessions, toDateKey(now))[0];
  return next ? new Date(next.plannedStart) : null;
}

export function windowStartAfter(data: NocturneData, now: Date): Date | null {
  const date = toDateKey(now);
  const nowMin = minutesOfDay(now);
  const w = availabilityForDate(data.windows, date).find((i) => i.start > nowMin);
  return w ? atMinutes(date, w.start) : null;
}
