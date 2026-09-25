/**
 * Tonight's route: build it, and adjust it when reality diverges.
 *
 * Invariants (the heart of "a planner that doesn't break"):
 * - completed, partial and skipped stations are never touched;
 * - the active station keeps its place and remaining time;
 * - locked stations never move;
 * - only future, unlocked stations are rebuilt or retimed.
 */
import { allocate, isRecurring, type Forecast } from "./allocate";
import { availabilityForDate, breakAfter, clipIntervals, subtractIntervals, type Interval } from "./availability";
import { newId } from "./ids";
import { chunksFor, packInOrder, packOptimized, type Chunk, type Slot } from "./route";
import { isClosed, remainingSeconds, sessionsOn, spanOf } from "./sessions";
import { stationName } from "./stations";
import { atMinutes, clock, formatDuration, minutesOfDay, roundUp, toDateKey } from "./time";
import type { DateKey, FocusLevel, ReplanReason, RouteChange, StudySession, StudyWindow, Task } from "./types";

export type ReplanMode = "reoptimize" | "retime";

export interface PlanTodayInput {
  tasks: Task[];
  windows: StudyWindow[];
  sessions: StudySession[];
  userId: string;
}

export interface PlanTodayOptions {
  now: Date;
  focus: FocusLevel;
  mode: ReplanMode;
  reason: ReplanReason;
  /** Earliest moment a new station may start (e.g. the end of a Station Stop). */
  startFrom?: Date;
  /** Explicit order of planned station ids (retime only). */
  order?: string[];
  /** Task whose unfinished remainder was just handed back (Low Focus). */
  returnedWork?: { taskId: string; minutes: number };
}

export interface PlanTodayResult {
  /** Full session list with today's future stations replaced. */
  sessions: StudySession[];
  change: RouteChange | null;
  deferred: { taskId: string; minutes: number }[];
}

function isMovable(s: StudySession, today: DateKey): boolean {
  return s.date === today && s.status === "planned" && !s.locked;
}

/** Free Service Time left today for movable stations. */
export function freeTimeToday(
  windows: StudyWindow[],
  sessions: StudySession[],
  now: Date,
  from: number,
): Interval[] {
  const today = toDateKey(now);
  const nowMin = minutesOfDay(now);
  const blocks: Interval[] = [];
  for (const s of sessions) {
    if (s.date !== today) continue;
    // Each busy block carries the Station Stop that follows it.
    if (s.status === "active") {
      blocks.push({ start: nowMin, end: nowMin + remainingSeconds(s, now) / 60 + breakAfter(s.plannedMinutes) });
    } else if (s.status === "planned" && s.locked) {
      const span = spanOf(s);
      blocks.push({ start: span.start, end: span.end + breakAfter(s.plannedMinutes) });
    }
  }
  return subtractIntervals(clipIntervals(availabilityForDate(windows, today), roundUp(from, 5)), blocks);
}

function makeSession(base: Partial<StudySession> & Pick<StudySession, "taskId" | "userId" | "date">): StudySession {
  return {
    id: newId(),
    sequence: 0,
    stationName: "",
    plannedStart: "",
    plannedEnd: "",
    plannedMinutes: 0,
    workMinutes: 0,
    completedMinutes: 0,
    creditedMinutes: 0,
    status: "planned",
    locked: false,
    actualStart: null,
    actualEnd: null,
    elapsedSeconds: 0,
    resumedAt: null,
    focusBefore: null,
    focusAfter: null,
    ...base,
  };
}

/** Assign sequence numbers and position-based station names for a day. */
export function renumberDay(sessions: StudySession[], date: DateKey): StudySession[] {
  const day = sessionsOn(sessions, date).filter((s) => s.status !== "skipped");
  const updates = new Map<string, StudySession>();
  day.forEach((s, i) => {
    const name = isClosed(s) && s.stationName ? s.stationName : stationName(date, i, day.length);
    if (s.sequence !== i || s.stationName !== name) updates.set(s.id, { ...s, sequence: i, stationName: name });
  });
  return updates.size === 0 ? sessions : sessions.map((s) => updates.get(s.id) ?? s);
}

export function planToday(input: PlanTodayInput, opts: PlanTodayOptions): PlanTodayResult {
  const { tasks, windows, userId } = input;
  const { now, focus, mode, reason } = opts;
  const today = toDateKey(now);
  const tasksById = new Map(tasks.map((t) => [t.id, t]));

  // Stations whose task no longer exists or is finished simply leave the route.
  const sessions = input.sessions.filter(
    (s) => !isMovable(s, today) || (tasksById.get(s.taskId)?.status === "active"),
  );
  const oldMovable = sessionsOn(input.sessions, today).filter((s) => isMovable(s, today));
  const movable = sessionsOn(sessions, today).filter((s) => isMovable(s, today));
  const kept = sessions.filter((s) => !isMovable(s, today));

  const nowMin = minutesOfDay(now);
  const fromMin =
    opts.startFrom && toDateKey(opts.startFrom) === today ? Math.max(nowMin, minutesOfDay(opts.startFrom)) : nowMin;
  const free = freeTimeToday(windows, kept, now, fromMin);
  const minSessionFor = (id: string) => tasksById.get(id)?.minSessionMinutes ?? 25;

  const todays = sessionsOn(kept, today);
  const previousTaskId =
    todays.find((s) => s.status === "active")?.taskId ??
    [...todays].reverse().find((s) => s.status === "done" || s.status === "partial")?.taskId ??
    null;

  let slots: Slot[];
  let overflow: Chunk[];

  if (mode === "retime") {
    const byId = new Map(movable.map((s) => [s.id, s]));
    const ordered = opts.order
      ? [...opts.order.map((id) => byId.get(id)).filter((s): s is StudySession => !!s), ...movable.filter((s) => !opts.order!.includes(s.id))]
      : movable;
    const chunks = ordered.map((s) => ({ key: s.id, taskId: s.taskId, minutes: s.plannedMinutes, work: s.workMinutes }));
    ({ slots, overflow } = packInOrder(chunks, free, (id) => tasksById.get(id)?.splittable ?? true, minSessionFor));
  } else {
    const skippedToday = new Set(
      sessionsOn(sessions, today)
        .filter((s) => s.status === "skipped")
        .map((s) => s.taskId),
    );
    const forecast = allocate({
      tasks,
      windows,
      sessions: kept,
      now,
      keepTodayPlan: false,
      excludeToday: skippedToday,
      todayFrom: fromMin,
    });
    const chunks: Chunk[] = [];
    for (const [taskId, minutes] of Object.entries(forecast.days[0]?.allocations ?? {})) {
      const t = tasksById.get(taskId);
      if (t) chunks.push(...chunksFor(t, minutes));
    }
    ({ slots, overflow } = packOptimized(chunks, free, { date: today, focus, tasks: tasksById, previousTaskId }, minSessionFor));
  }

  // Reuse existing station ids where possible so the UI can animate moves.
  const reusable = new Map<string, StudySession[]>();
  for (const s of movable) reusable.set(s.taskId, [...(reusable.get(s.taskId) ?? []), s]);
  const byId = new Map(movable.map((s) => [s.id, s]));
  const used = new Set<string>();
  const planned: StudySession[] = slots.map((slot) => {
    let prior: StudySession | undefined;
    if (mode === "retime") {
      const candidate = byId.get(slot.key);
      if (candidate && !used.has(candidate.id)) prior = candidate;
    } else {
      prior = (reusable.get(slot.taskId) ?? []).find((s) => !used.has(s.id));
    }
    if (prior) used.add(prior.id);
    const base = prior ?? makeSession({ taskId: slot.taskId, userId, date: today });
    return {
      ...base,
      plannedStart: atMinutes(today, slot.start).toISOString(),
      plannedEnd: atMinutes(today, slot.end).toISOString(),
      plannedMinutes: slot.minutes,
      workMinutes: slot.work,
    };
  });

  const next = renumberDay([...kept, ...planned], today);
  const newPlanned = sessionsOn(next, today).filter((s) => isMovable(s, today));
  const deferred = mergeOverflow(overflow);
  const change =
    reason === "initial" ? null : describeChange(oldMovable, newPlanned, sessionsOn(next, today), tasksById, opts, deferred);
  return { sessions: next, change, deferred };
}

function mergeOverflow(chunks: Chunk[]): { taskId: string; minutes: number }[] {
  const byTask = new Map<string, number>();
  for (const c of chunks) byTask.set(c.taskId, (byTask.get(c.taskId) ?? 0) + c.work);
  return [...byTask].map(([taskId, minutes]) => ({ taskId, minutes }));
}

function arrivalOf(day: StudySession[], planned: StudySession[]): number | null {
  const ends = [...day.filter((s) => s.status === "active" || (s.status === "planned" && s.locked)), ...planned].map((s) =>
    new Date(s.plannedEnd).getTime(),
  );
  return ends.length ? Math.max(...ends) : null;
}

function minutesByTask(list: StudySession[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of list) m.set(s.taskId, (m.get(s.taskId) ?? 0) + s.workMinutes);
  return m;
}

/** Plain-language explanation of what moved, without blame. */
export function describeChange(
  before: StudySession[],
  after: StudySession[],
  dayAfter: StudySession[],
  tasks: Map<string, Task>,
  opts: PlanTodayOptions,
  deferred: { taskId: string; minutes: number }[],
): RouteChange | null {
  const title = (id: string) => tasks.get(id)?.title ?? "A task";
  const lines: string[] = [];
  const oldMin = minutesByTask(before);
  const newMin = minutesByTask(after);

  if (opts.reason === "late-start" && after[0]) {
    lines.push(`Departure moved to ${clock(after[0].plannedStart)}.`);
  }

  if (opts.returnedWork && opts.returnedWork.minutes >= 5) {
    const { taskId, minutes } = opts.returnedWork;
    const placed = after.find((s) => s.taskId === taskId);
    lines.push(
      placed
        ? `The remaining ${formatDuration(minutes)} of ${title(taskId)} ${minutes === 1 ? "was" : "were"} moved later, to ${clock(placed.plannedStart)}.`
        : `The remaining ${formatDuration(minutes)} of ${title(taskId)} will continue on another day.`,
    );
  }

  for (const d of deferred) {
    if (d.minutes < 5 || d.taskId === opts.returnedWork?.taskId) continue;
    const t = tasks.get(d.taskId);
    const where = t && isRecurring(t) ? "is set aside for tonight" : "moved to a later day";
    lines.push(`${title(d.taskId)} · ${formatDuration(d.minutes)} ${where}.`);
  }

  for (const [taskId, minutes] of newMin) {
    const was = oldMin.get(taskId) ?? 0;
    if (was === 0 && before.length > 0 && taskId !== opts.returnedWork?.taskId) {
      const first = after.find((s) => s.taskId === taskId)!;
      lines.push(`${title(taskId)} · ${formatDuration(minutes)} joins the route at ${clock(first.plannedStart)}.`);
    }
  }
  for (const [taskId, minutes] of oldMin) {
    if (!newMin.has(taskId) && !deferred.some((d) => d.taskId === taskId) && tasks.get(taskId)?.status === "active") {
      lines.push(`${title(taskId)} · ${formatDuration(minutes)} moved to a later day.`);
    }
  }

  const firstBefore = before[0]?.taskId;
  const firstAfter = after[0]?.taskId;
  const reordered = before.map((s) => s.taskId).join() !== after.map((s) => s.taskId).join();
  if (reordered && firstAfter && firstAfter !== firstBefore && opts.reason !== "late-start" && !opts.returnedWork) {
    lines.push(`${title(firstAfter)} is now the next station.`);
  }

  const beforeArrival = arrivalOf(dayAfter, before);
  const afterArrival = arrivalOf(dayAfter, after);
  const shift = beforeArrival !== null && afterArrival !== null ? (afterArrival - beforeArrival) / 60_000 : 0;
  const meaningful = lines.length > 0 || Math.abs(shift) >= 5;
  if (!meaningful) return null;

  if (afterArrival !== null) {
    const at = clock(new Date(afterArrival));
    if (Math.abs(shift) < 5) lines.push(`Your expected arrival remains ${at}.`);
    else if (shift < 0) lines.push(`Ahead of schedule · expected arrival is now ${at}.`);
    else lines.push(`Expected arrival is now ${at}.`);
  } else if (before.length > 0) {
    lines.push("No further stations tonight.");
  }

  return { at: opts.now.toISOString(), reason: opts.reason, headline: "Route updated", lines: lines.slice(0, 4) };
}

/** Future-days forecast consistent with the persisted route for today. */
export function forecast(input: PlanTodayInput, now: Date): Forecast {
  return allocate({ tasks: input.tasks, windows: input.windows, sessions: input.sessions, now, keepTodayPlan: true });
}

export { makeSession };
