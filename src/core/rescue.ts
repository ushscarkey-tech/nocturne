/**
 * When the work won't fit before a deadline, don't just say so: work out
 * how it can. Remedies are tried in order of how little they ask of the
 * traveller, each measured by re-running the allocator:
 *
 *   1. shorter Station Stops;
 *   2. a little more study time, spread over the days before the deadline
 *      (which day, from when, until when);
 *   3. trimming the time planned for the less important tasks;
 *   4. as a last resort, moving the least important deadlines back.
 *
 * The most important work (importance 5) is never trimmed or moved.
 *
 * Pure: data in, a plan out. Applying it is up to the caller.
 */
import { allocate, isRecurring, worstConflict, type Forecast } from "./allocate";
import { availabilityForDate, MIN_USEFUL_MINUTES, stopsOf, type Stops } from "./availability";
import { newId } from "./ids";
import { replan, type OpResult } from "./ops";
import { addDays, diffDays, formatHM, roundUp, serviceDate, serviceMinutes } from "./time";
import type { DateKey, NocturneData, StudyWindow, Task } from "./types";

export interface ExtraTime {
  date: DateKey;
  start: string;
  end: string;
  minutes: number;
}

export type RescueStep =
  | { kind: "shortStops"; gain: number }
  | { kind: "extraTime"; windows: ExtraTime[]; gain: number }
  | { kind: "trim"; cuts: { taskId: string; from: number; to: number }[]; gain: number }
  | { kind: "postpone"; moves: { taskId: string; from: DateKey; to: DateKey }[]; windows: ExtraTime[]; gain: number };

export interface RescuePlan {
  /** The deadline that is short. */
  deadline: DateKey;
  /** Focus minutes missing now. */
  shortfall: number;
  steps: RescueStep[];
  /** Minutes still missing after every step (0 = everything fits). */
  left: number;
}

/** Latest a suggested extra stretch may run to, and how much one day may take. */
const LATEST = 24 * 60;
const EXTEND_CAP = 90;
const NEW_DAY_CAP = 120;
const NEW_DAY_START = 19 * 60;
/** How long a topped-up evening may become when moved work needs it. */
const TOP_UP_CAP = 180;
const STEP = 30;
/** Never trim a task by more than this share of what it needed, over all plans. */
const TRIM_SHARE = 0.25;
const POSTPONE_DAYS = 7;

interface Trial {
  tasks: Task[];
  windows: StudyWindow[];
  stops: Stops;
}

/**
 * The route as it would be if re-planned now: today's unstarted stations are
 * open to change, as they are the moment anything is applied.
 */
function evaluate(data: NocturneData, now: Date, trial: Trial): Forecast {
  const today = serviceDate(now);
  const sessions = data.sessions.filter((s) => !(s.date === today && s.status === "planned" && !s.locked));
  return allocate({ tasks: trial.tasks, windows: trial.windows, sessions, now, keepTodayPlan: false, stops: trial.stops });
}

const shortOf = (f: Forecast) => worstConflict(f)?.shortfallMinutes ?? 0;

function extraWindow(userId: string, e: ExtraTime): StudyWindow {
  return {
    id: `rescue-${e.date}-${e.start}`,
    userId,
    dayOfWeek: null,
    specificDate: e.date,
    startTime: e.start,
    endTime: e.end,
    recurring: false,
    enabled: true,
    kind: "available",
  };
}

export function rescuePlan(data: NocturneData, now: Date): RescuePlan | null {
  const today = serviceDate(now);
  let trial: Trial = { tasks: data.tasks, windows: data.windows, stops: stopsOf(data.profile) };
  const first = worstConflict(evaluate(data, now, trial));
  if (!first) return null;
  const deadline = first.deadline < today ? today : first.deadline;
  const shortfall = first.shortfallMinutes;
  const steps: RescueStep[] = [];
  let left = shortfall;
  const measure = (t: Trial) => shortOf(evaluate(data, now, t));

  // 1) Shorter Station Stops.
  if (trial.stops === "normal") {
    const next = { ...trial, stops: "short" as const };
    const after = measure(next);
    if (left - after >= 5) {
      steps.push({ kind: "shortStops", gain: left - after });
      trial = next;
      left = after;
    }
  }

  // 2) A little more study time, a little on each day before the deadline.
  if (left > 0) {
    const days = Math.max(0, diffDays(today, deadline));
    const slots: { date: DateKey; start: number; room: number; extra: number }[] = [];
    for (let i = 0; i <= days; i++) {
      const date = addDays(today, i);
      const intervals = availabilityForDate(trial.windows, date);
      const nowMin = i === 0 ? roundUp(serviceMinutes(now, today) + 5, 10) : 0;
      const last = intervals[intervals.length - 1];
      let start: number;
      let cap: number;
      if (last && last.end >= nowMin) {
        start = last.end;
        cap = EXTEND_CAP;
      } else {
        start = Math.max(NEW_DAY_START, nowMin);
        cap = NEW_DAY_CAP;
      }
      const room = Math.min(cap, LATEST - start);
      if (room >= MIN_USEFUL_MINUTES) slots.push({ date, start, room, extra: 0 });
    }
    const build = () =>
      slots
        .filter((s) => s.extra > 0)
        .map((s) => ({ date: s.date, start: formatHM(s.start), end: formatHM(s.start + s.extra), minutes: s.extra }));
    let best = { windows: [] as ExtraTime[], left };
    // Add half an hour at a time to the day that has had the least so far.
    for (let round = 0; round < slots.length * 4 && best.left > 0; round++) {
      const open = slots.filter((s) => s.extra < s.room);
      if (open.length === 0) break;
      const pick = open.reduce((a, b) => (b.extra < a.extra ? b : a));
      pick.extra = Math.min(pick.room, pick.extra + STEP);
      const windows = build();
      const after = measure({ ...trial, windows: [...trial.windows, ...windows.map((e) => extraWindow(data.profile.id, e))] });
      if (after < best.left) best = { windows, left: after };
    }
    if (best.windows.length > 0 && left - best.left >= 5) {
      // Keep only what helped: drop the tail rounds that added nothing.
      steps.push({ kind: "extraTime", windows: best.windows, gain: left - best.left });
      trial = { ...trial, windows: [...trial.windows, ...best.windows.map((e) => extraWindow(data.profile.id, e))] };
      left = best.left;
    }
  }

  // 3) Trim the less important tasks due by then.
  if (left > 0) {
    const involved = trial.tasks
      .filter((t) => t.status === "active" && !isRecurring(t) && t.deadline && t.deadline <= deadline && t.remainingMinutes >= 40 && t.importance < 5)
      .sort((a, b) => a.importance - b.importance || b.remainingMinutes - a.remainingMinutes);
    const cuts: { taskId: string; from: number; to: number }[] = [];
    let tasks = trial.tasks;
    for (const t of involved) {
      if (left <= 0) break;
      const trimmed = t.trimmedMinutes ?? 0;
      const allowance = Math.floor(((t.remainingMinutes + trimmed) * TRIM_SHARE) / 10) * 10 - trimmed;
      const cut = Math.min(allowance, roundUp(left, 10));
      if (cut < 10) continue;
      const next = tasks.map((x) => (x.id === t.id ? { ...x, estimatedMinutes: x.estimatedMinutes - cut, remainingMinutes: x.remainingMinutes - cut } : x));
      const after = measure({ ...trial, tasks: next });
      if (after < left) {
        cuts.push({ taskId: t.id, from: t.remainingMinutes, to: t.remainingMinutes - cut });
        tasks = next;
        left = after;
      }
    }
    if (cuts.length > 0) {
      const before = steps.reduce((sum, s) => sum + s.gain, 0);
      steps.push({ kind: "trim", cuts, gain: shortfall - before - left });
      trial = { ...trial, tasks };
    }
  }

  // 4) Last resort: the least important deadlines move back a little. Work
  //    only moves to days that have study time, so days after the deadline
  //    with none get an evening stretch, the soonest days first.
  if (left > 0) {
    const later: { date: DateKey; start: number; room: number; extra: number }[] = [];
    for (let k = 1; k <= POSTPONE_DAYS; k++) {
      const date = addDays(deadline, k);
      if (availabilityForDate(trial.windows, date).length === 0) later.push({ date, start: NEW_DAY_START, room: NEW_DAY_CAP, extra: 0 });
    }
    // Generous on purpose (stops and chunking eat into it); unused days are dropped below.
    const target = left * 1.5 + 2 * STEP;
    let wall = 0;
    for (const d of later) {
      if (wall >= target) break;
      d.extra = Math.min(d.room, Math.ceil((target - wall) / STEP) * STEP);
      wall += d.extra;
    }
    const laterTime = (upTo: DateKey) =>
      later
        .filter((d) => d.extra > 0 && d.date <= upTo)
        .map((d) => ({ date: d.date, start: formatHM(d.start), end: formatHM(d.start + d.extra), minutes: d.extra }));
    const withTime = (upTo: DateKey, t: Trial): Trial => ({
      ...t,
      windows: [...t.windows, ...laterTime(upTo).map((e) => extraWindow(data.profile.id, e))],
    });
    const lastDay = addDays(deadline, POSTPONE_DAYS);
    const involved = trial.tasks
      .filter((t) => t.status === "active" && !isRecurring(t) && t.deadline && t.deadline <= deadline && t.importance < 5)
      .sort((a, b) => a.importance - b.importance || b.remainingMinutes - a.remainingMinutes);
    const moves: { taskId: string; from: DateKey; to: DateKey }[] = [];
    let tasks = trial.tasks;
    for (const t of involved) {
      if (left <= 0) break;
      const from = t.deadline!;
      // The nearest day that helps most (a day can fill up).
      let best: { to: DateKey; next: Task[]; after: number } | null = null;
      for (let k = 1; k <= POSTPONE_DAYS; k++) {
        const to = addDays(from < today ? today : from, k);
        const next = tasks.map((x) => (x.id === t.id ? { ...x, deadline: to } : x));
        const after = measure(withTime(lastDay, { ...trial, tasks: next }));
        if (!best || after < best.after) best = { to, next, after };
        if (after === 0) break;
      }
      if (best && best.after < left) {
        moves.push({ taskId: t.id, from, to: best.to });
        tasks = best.next;
        left = best.after;
      }
    }
    if (moves.length > 0) {
      // Only the evenings the moved work can reach are needed.
      const upTo = moves.reduce((max, m) => (m.to > max ? m.to : max), deadline);
      left = measure(withTime(upTo, { ...trial, tasks }));
      // Whole stations leave crumbs an evening can't use: top the evenings
      // up half an hour at a time while that still helps.
      for (let round = 0; left > 0 && round < 12; round++) {
        const open = later.filter((d) => d.date <= upTo && d.extra > 0 && d.extra < TOP_UP_CAP);
        if (open.length === 0) break;
        const pick = open.reduce((a, b) => (b.extra < a.extra ? b : a));
        pick.extra = Math.min(TOP_UP_CAP, pick.extra + STEP);
        const after = measure(withTime(upTo, { ...trial, tasks }));
        if (after < left) left = after;
      }
      // Then ask for no more than needed: shorten each added evening while
      // everything still fits, the latest first.
      for (const d of [...later].reverse()) {
        while (d.date <= upTo && d.extra > 0) {
          const was = d.extra;
          d.extra = was - STEP >= MIN_USEFUL_MINUTES + 15 ? was - STEP : 0;
          if (measure(withTime(upTo, { ...trial, tasks })) > left) {
            d.extra = was;
            break;
          }
        }
      }
      trial = withTime(upTo, { ...trial, tasks });
      left = measure(trial);
      const before = steps.reduce((sum, s) => sum + s.gain, 0);
      steps.push({ kind: "postpone", moves, windows: laterTime(upTo), gain: shortfall - before - left });
    }
  }

  return { deadline, shortfall, steps, left };
}

/** Carry out some or all of a plan's steps, then re-plan tonight once. */
export function applyRescue(data: NocturneData, steps: RescueStep[], now: Date): OpResult {
  const at = now.toISOString();
  let next = data;
  for (const step of steps) {
    if (step.kind === "shortStops") {
      next = { ...next, profile: { ...next.profile, shortStops: true } };
    } else if (step.kind === "extraTime") {
      next = { ...next, windows: [...next.windows, ...step.windows.map((e) => ({ ...extraWindow(next.profile.id, e), id: newId() }))] };
    } else if (step.kind === "trim") {
      const cut = new Map(step.cuts.map((c) => [c.taskId, c.from - c.to]));
      next = {
        ...next,
        tasks: next.tasks.map((t) =>
          cut.has(t.id)
            ? {
                ...t,
                estimatedMinutes: Math.max(0, t.estimatedMinutes - cut.get(t.id)!),
                remainingMinutes: Math.max(0, t.remainingMinutes - cut.get(t.id)!),
                trimmedMinutes: (t.trimmedMinutes ?? 0) + cut.get(t.id)!,
                updatedAt: at,
              }
            : t,
        ),
      };
    } else {
      const to = new Map(step.moves.map((m) => [m.taskId, m.to]));
      next = {
        ...next,
        tasks: next.tasks.map((t) => (to.has(t.id) ? { ...t, deadline: to.get(t.id)!, updatedAt: at } : t)),
        windows: [...next.windows, ...step.windows.map((e) => ({ ...extraWindow(next.profile.id, e), id: newId() }))],
      };
    }
  }
  return replan(next, "task-change", now);
}
