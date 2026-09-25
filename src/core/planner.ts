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
import { isClosed, remainingSeconds, remainingWork, sessionsOn, spanOf } from "./sessions";
import { stationName } from "./stations";
import { atMinutes, clock, formatHM, roundUp, serviceDate, serviceMinutes } from "./time";
import { historyNudge, type FocusProfile } from "./learning";
import type { DateKey, FocusLevel, Message, ReplanReason, RouteChange, StudySession, StudyWindow, Task } from "./types";
import { msg, renderEnglish } from "./messages";

export type ReplanMode = "reoptimize" | "retime";

export interface PlanTodayInput {
  tasks: Task[];
  windows: StudyWindow[];
  sessions: StudySession[];
  userId: string;
  /** Learned focus pattern; null/undefined = general rules only. */
  focusProfile?: FocusProfile | null;
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
  /**
   * `tonight` re-sorts and re-chunks only the work already on tonight's route
   * (a signal change never adds work); `all` (default) lets the planner pull
   * in whatever tonight should hold.
   */
  scope?: "tonight" | "all";
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
  const today = serviceDate(now);
  const nowMin = serviceMinutes(now, today);
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
    endedBy: null,
    extendedMinutes: 0,
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
  const today = serviceDate(now);
  const tasksById = new Map(tasks.map((t) => [t.id, t]));

  // Stations whose task no longer exists or is finished simply leave the route.
  const sessions = input.sessions.filter(
    (s) => !isMovable(s, today) || (tasksById.get(s.taskId)?.status === "active"),
  );
  const oldMovable = sessionsOn(input.sessions, today).filter((s) => isMovable(s, today));
  const movable = sessionsOn(sessions, today).filter((s) => isMovable(s, today));
  const kept = sessions.filter((s) => !isMovable(s, today));

  const nowMin = serviceMinutes(now, today);
  const fromMin =
    opts.startFrom && serviceDate(opts.startFrom) === today ? Math.max(nowMin, serviceMinutes(opts.startFrom, today)) : nowMin;
  const free = freeTimeToday(windows, kept, now, fromMin);
  const minSessionFor = (id: string) => tasksById.get(id)?.minSessionMinutes ?? 25;

  const todays = sessionsOn(kept, today);
  const previousTaskId =
    todays.find((s) => s.status === "active")?.taskId ??
    [...todays].reverse().find((s) => s.status === "done" || s.status === "partial")?.taskId ??
    null;

  let slots: Slot[];
  let overflow: Chunk[];
  let historyNote: Message | null = null;

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
    let dayWork: Record<string, number>;
    if (opts.scope === "tonight") {
      dayWork = {};
      for (const s of movable) dayWork[s.taskId] = (dayWork[s.taskId] ?? 0) + s.workMinutes;
      if (opts.returnedWork) {
        const { taskId, minutes } = opts.returnedWork;
        dayWork[taskId] = (dayWork[taskId] ?? 0) + minutes;
      }
      // Never more than the task still needs beyond what's running or locked.
      for (const id of Object.keys(dayWork)) {
        const t = tasksById.get(id);
        if (!t || t.status !== "active") {
          delete dayWork[id];
          continue;
        }
        const committed = kept
          .filter((s) => s.taskId === id && s.date === today && (s.status === "active" || (s.status === "planned" && s.locked)))
          .reduce((sum, s) => sum + (s.status === "active" ? remainingWork(s, now) : s.workMinutes), 0);
        const ceiling = t.recurrence ? t.estimatedMinutes : t.remainingMinutes;
        dayWork[id] = Math.max(0, Math.min(dayWork[id], Math.round(ceiling - committed)));
      }
    } else {
      const forecast = allocate({
        tasks,
        windows,
        sessions: kept,
        now,
        keepTodayPlan: false,
        excludeToday: skippedToday,
        todayFrom: fromMin,
      });
      dayWork = forecast.days[0]?.allocations ?? {};
    }
    const chunks: Chunk[] = [];
    for (const [taskId, minutes] of Object.entries(dayWork)) {
      const t = tasksById.get(taskId);
      if (t) chunks.push(...chunksFor(t, minutes, focus));
    }
    const ctx = { date: today, focus, tasks: tasksById, previousTaskId };
    const profile = input.focusProfile ?? null;
    if (profile) {
      ({ slots, overflow } = packOptimized(chunks, free, { ...ctx, history: (t, m) => historyNudge(profile, t, m) }, minSessionFor));
      // Say so when history, not the general rules, moved demanding work earlier.
      if (profile.bestHardWindow && reason !== "initial") {
        const plain = packOptimized(chunks, free, ctx, minSessionFor).slots;
        for (const slot of slots) {
          const t = tasksById.get(slot.taskId);
          if (!t || t.difficulty < 4) continue;
          const without = plain.find((x) => x.taskId === slot.taskId);
          if (without && without.start - slot.start >= 20) {
            historyNote = msg("change.history", { at: formatHM(profile.bestHardWindow[0] * 60), task: t.title });
          }
          break;
        }
      }
    } else {
      ({ slots, overflow } = packOptimized(chunks, free, ctx, minSessionFor));
    }
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
    reason === "initial" ? null : describeChange(oldMovable, newPlanned, sessionsOn(next, today), tasksById, opts, deferred, historyNote);
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

/**
 * What moved and why: the reason first, then the one detail that matters,
 * then the arrival. Short, and never framed as failure.
 */
export function describeChange(
  before: StudySession[],
  after: StudySession[],
  dayAfter: StudySession[],
  tasks: Map<string, Task>,
  opts: PlanTodayOptions,
  deferred: { taskId: string; minutes: number }[],
  historyNote: Message | null = null,
): RouteChange | null {
  const title = (id: string) => tasks.get(id)?.title ?? "—";
  const oldMin = minutesByTask(before);
  const newMin = minutesByTask(after);
  const next = after[0];
  const reasons: Message[] = [];
  const details: Message[] = [];

  const reordered = before.map((s) => s.taskId).join() !== after.map((s) => s.taskId).join();
  const nextChanged = !!next && next.taskId !== before[0]?.taskId;

  switch (opts.reason) {
    case "low-focus":
      if (next) reasons.push(msg("change.lowFocus", { task: title(next.taskId) }));
      break;
    case "signal-change":
    case "boarding":
      if (nextChanged && next && opts.focus === "sharp") reasons.push(msg("change.signalSharp", { task: title(next.taskId) }));
      else if (nextChanged && next && opts.focus === "low") reasons.push(msg("change.signalLow", { task: title(next.taskId) }));
      else if (reordered) reasons.push(msg("change.rebalanced"));
      break;
    case "late-start":
      if (next) reasons.push(msg("change.lateStart", { at: clock(next.plannedStart) }));
      break;
    case "finish-early":
      reasons.push(msg("change.finishEarly"));
      break;
    case "more-time":
      reasons.push(msg("change.moreTime"));
      break;
    case "skip":
      reasons.push(msg("change.skip"));
      break;
    default:
      if (nextChanged && next && before.length > 0 && opts.reason !== "reorder") reasons.push(msg("change.next", { task: title(next.taskId) }));
  }
  if (historyNote) reasons.unshift(historyNote);

  if (opts.returnedWork && opts.returnedWork.minutes >= 5) {
    const { taskId, minutes } = opts.returnedWork;
    const placed = after.find((s) => s.taskId === taskId);
    details.push(
      placed
        ? msg("change.returned", { task: title(taskId), min: minutes, at: clock(placed.plannedStart) })
        : msg("change.returnedLater", { task: title(taskId), min: minutes }),
    );
  }
  for (const d of deferred) {
    if (d.minutes < 5 || d.taskId === opts.returnedWork?.taskId) continue;
    const t = tasks.get(d.taskId);
    details.push(t && isRecurring(t) ? msg("change.rests", { task: title(d.taskId) }) : msg("change.deferred", { task: title(d.taskId), min: d.minutes }));
  }
  for (const [taskId, minutes] of newMin) {
    if ((oldMin.get(taskId) ?? 0) === 0 && before.length > 0 && taskId !== opts.returnedWork?.taskId) {
      const first = after.find((s) => s.taskId === taskId)!;
      details.push(msg("change.joins", { task: title(taskId), min: minutes, at: clock(first.plannedStart) }));
    }
  }
  for (const [taskId, minutes] of oldMin) {
    if (!newMin.has(taskId) && !deferred.some((d) => d.taskId === taskId) && tasks.get(taskId)?.status === "active" && opts.reason !== "skip") {
      details.push(msg("change.deferred", { task: title(taskId), min: minutes }));
    }
  }

  const beforeArrival = arrivalOf(dayAfter, before);
  const afterArrival = arrivalOf(dayAfter, after);
  const shift = beforeArrival !== null && afterArrival !== null ? (afterArrival - beforeArrival) / 60_000 : 0;
  if (reasons.length === 0 && details.length === 0 && Math.abs(shift) < 5) return null;

  let arrival: Message | null = null;
  if (afterArrival !== null) {
    const at = clock(new Date(afterArrival));
    arrival = Math.abs(shift) < 5 ? msg("arrival.stays", { at }) : shift < 0 ? msg("arrival.ahead", { at }) : msg("arrival.later", { at });
  } else if (before.length > 0) {
    arrival = msg("arrival.none");
  }

  const messages = [...reasons.slice(0, 1), ...details.slice(0, reasons.length ? 1 : 2), ...(arrival ? [arrival] : [])];
  return {
    at: opts.now.toISOString(),
    reason: opts.reason,
    headline: renderEnglish(msg("change.headline")),
    lines: messages.map(renderEnglish),
    messages,
  };
}

/** Future-days forecast consistent with the persisted route for today. */
export function forecast(input: PlanTodayInput, now: Date): Forecast {
  return allocate({ tasks: input.tasks, windows: input.windows, sessions: input.sessions, now, keepTodayPlan: true });
}

export { makeSession };
