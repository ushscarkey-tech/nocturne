/**
 * Long-term allocation: decide how many minutes of each task happen on each
 * day between now and its deadline.
 *
 * Strategy
 * - Earliest deadline first; ties broken by importance.
 * - Each task is water-filled across the days before its deadline, choosing
 *   the least loaded day with a slight bias toward earlier days. The deadline
 *   day itself is kept as a buffer and only used when nothing else fits.
 * - Recurring tasks reserve their daily/weekly occurrence first.
 * - Someday tasks (no deadline) only use spare capacity in the coming week.
 * - Feasibility is checked independently with the EDF cumulative test so a
 *   shortfall is reported instead of silently producing an impossible plan.
 */
import { availabilityForDate, breakAfter, capacityOf, clipIntervals, subtractIntervals, type Interval } from "./availability";
import { creditedOn, remainingSeconds, remainingWork, spanOf } from "./sessions";
import { addDays, dayOfWeek, diffDays, minutesOfDay, roundTo, roundUp, toDateKey } from "./time";
import type { DateKey, StudySession, StudyWindow, Task } from "./types";

export const DEFAULT_HORIZON = 14;
export const MAX_HORIZON = 60;
const PREFERRED_CHUNK = 50;

export interface AllocatorInput {
  tasks: Task[];
  windows: StudyWindow[];
  sessions: StudySession[];
  now: Date;
  /** Treat today's unlocked planned stations as fixed (forecast mode). */
  keepTodayPlan: boolean;
  /** Tasks that must not be placed today (e.g. skipped today). */
  excludeToday?: ReadonlySet<string>;
  /** Minutes past midnight from which today's capacity counts (defaults to now). */
  todayFrom?: number;
}

export interface DayPlan {
  date: DateKey;
  index: number;
  intervals: Interval[];
  capacity: number;
  load: number;
  allocations: Record<string, number>;
  committed: Record<string, number>;
}

export interface Conflict {
  deadline: DateKey;
  requiredMinutes: number;
  availableMinutes: number;
  shortfallMinutes: number;
  taskIds: string[];
}

export interface Forecast {
  today: DateKey;
  days: DayPlan[];
  /** Deadline work that could not be placed before its deadline. */
  unscheduled: Record<string, number>;
  conflicts: Conflict[];
  overdueTaskIds: string[];
}

export function isRecurring(t: Task): boolean {
  return t.recurrence !== null;
}

export function isSchedulable(t: Task): boolean {
  return t.status === "active" && t.estimatedMinutes > 0 && (isRecurring(t) || t.remainingMinutes > 0);
}

export function recursOn(t: Task, date: DateKey): boolean {
  if (!t.recurrence) return false;
  if (t.deadline && date > t.deadline) return false;
  if (t.createdAt && date < toDateKey(new Date(t.createdAt))) return false;
  if (t.recurrence.freq === "daily") return true;
  return t.recurrence.days.includes(dayOfWeek(date));
}

/** Busy blocks (in minutes past midnight) and committed work per task for a day. */
function fixedOn(
  sessions: StudySession[],
  date: DateKey,
  today: DateKey,
  now: Date,
  keepTodayPlan: boolean,
): { blocks: Interval[]; committed: Record<string, number> } {
  const blocks: Interval[] = [];
  const committed: Record<string, number> = {};
  const nowMin = date === today ? minutesOfDay(now) : 0;
  for (const s of sessions) {
    if (s.date !== date) continue;
    let work = 0;
    if (s.status === "active") {
      blocks.push({ start: nowMin, end: nowMin + remainingSeconds(s, now) / 60 + breakAfter(s.plannedMinutes) });
      work = remainingWork(s, now);
    } else if (s.status === "planned" && (s.locked || (keepTodayPlan && date === today))) {
      const span = spanOf(s);
      blocks.push({ start: span.start, end: span.end + breakAfter(s.plannedMinutes) });
      work = s.workMinutes;
    }
    if (work > 0) committed[s.taskId] = (committed[s.taskId] ?? 0) + work;
  }
  return { blocks, committed };
}

export function allocate(input: AllocatorInput): Forecast {
  const { tasks, windows, sessions, now, keepTodayPlan } = input;
  const today = toDateKey(now);
  const excludeToday = input.excludeToday ?? new Set<string>();

  const active = tasks.filter(isSchedulable);
  const deadlineTasks = active.filter((t) => !isRecurring(t) && t.deadline !== null);
  const somedayTasks = active.filter((t) => !isRecurring(t) && t.deadline === null);
  const recurringTasks = active.filter(isRecurring);

  const lastDeadline = deadlineTasks.reduce((max, t) => Math.max(max, diffDays(today, t.deadline!)), 0);
  const horizon = Math.min(MAX_HORIZON, Math.max(DEFAULT_HORIZON, lastDeadline + 1));

  // ---- Day capacities -------------------------------------------------------
  const days: DayPlan[] = [];
  for (let i = 0; i < horizon; i++) {
    const date = addDays(today, i);
    let intervals = availabilityForDate(windows, date);
    const { blocks, committed } = fixedOn(sessions, date, today, now, keepTodayPlan);
    if (i === 0) intervals = clipIntervals(intervals, roundUp(input.todayFrom ?? minutesOfDay(now), 5));
    intervals = subtractIntervals(intervals, blocks);
    days.push({ date, index: i, intervals, capacity: capacityOf(intervals), load: 0, allocations: {}, committed });
  }

  const committedTotal = (taskId: string) => days.reduce((sum, d) => sum + (d.committed[taskId] ?? 0), 0);
  const free = (d: DayPlan) => Math.max(0, d.capacity - d.load);
  const give = (d: DayPlan, taskId: string, minutes: number) => {
    if (minutes <= 0) return;
    d.allocations[taskId] = (d.allocations[taskId] ?? 0) + minutes;
    d.load += minutes;
  };
  // In forecast mode tonight's route is authoritative, so nothing new lands today.
  const allowedOn = (t: Task, d: DayPlan) => !(d.index === 0 && (keepTodayPlan || excludeToday.has(t.id)));

  // ---- Recurring occurrences ------------------------------------------------
  const recurringNeed: Record<string, number>[] = days.map(() => ({}));
  for (const d of days) {
    for (const t of recurringTasks) {
      if (!recursOn(t, d.date) || !allowedOn(t, d)) continue;
      let need = t.estimatedMinutes - (d.committed[t.id] ?? 0);
      if (d.index === 0) need -= creditedOn(sessions, t.id, d.date);
      need = Math.max(0, need);
      recurringNeed[d.index][t.id] = need;
      give(d, t.id, Math.min(need, free(d)));
    }
  }

  // ---- Deadline work (EDF) ---------------------------------------------------
  const deadlineIndex = (t: Task) => Math.max(0, diffDays(today, t.deadline!));
  const byUrgency = [...deadlineTasks].sort(
    (a, b) => deadlineIndex(a) - deadlineIndex(b) || b.importance - a.importance || a.createdAt.localeCompare(b.createdAt),
  );
  const unscheduled: Record<string, number> = {};
  const allocatable: Record<string, number> = {};

  for (const t of byUrgency) {
    let left = Math.max(0, t.remainingMinutes - committedTotal(t.id));
    allocatable[t.id] = left;
    if (left <= 0) continue;
    const dl = Math.min(deadlineIndex(t), horizon - 1);
    const soft = dl >= 1 ? dl - 1 : 0;
    // 1) spread across the days before the buffer; 2) let those days take
    // more; 3) only then touch the deadline day itself.
    left = distribute(t, left, days.slice(0, soft + 1), false);
    if (left > 0) left = distribute(t, left, days.slice(0, soft + 1), true);
    if (left > 0) left = distribute(t, left, days.slice(0, dl + 1), true);
    if (left > 0) unscheduled[t.id] = left;
  }

  // ---- Someday work in spare capacity -----------------------------------------
  const someday = [...somedayTasks].sort(
    (a, b) => b.importance - a.importance || a.createdAt.localeCompare(b.createdAt),
  );
  for (const t of someday) {
    const left = Math.max(0, t.remainingMinutes - committedTotal(t.id));
    if (left > 0) distribute(t, left, days.slice(0, 7), false, true);
  }

  function distribute(t: Task, amount: number, range: DayPlan[], tight: boolean, spareOnly = false): number {
    let left = amount;
    if (range.length === 0) return left;
    const chunkMin = Math.min(t.minSessionMinutes, left);
    const chunkMax = t.splittable ? Math.max(t.maxSessionMinutes, chunkMin) : left;
    const target = t.splittable
      ? Math.min(chunkMax, Math.max(chunkMin, roundTo(Math.max(left / range.length, Math.min(PREFERRED_CHUNK, chunkMax)), 5)))
      : left;
    // A task normally takes at most one long station per day; when time is
    // tight it may take whatever the day can give.
    const dailyCap = tight ? Infinity : Math.max(chunkMax, target);
    const excluded = new Set<number>();

    while (left > 0) {
      let best: DayPlan | null = null;
      let bestScore = Infinity;
      for (const d of range) {
        if (excluded.has(d.index) || !allowedOn(t, d)) continue;
        const already = d.allocations[t.id] ?? 0;
        const room = Math.min(free(d), dailyCap - already);
        const needed = t.splittable ? Math.min(chunkMin, left) : left;
        if (room < needed) continue;
        if (spareOnly && (already > 0 || (d.load + needed) / Math.max(1, d.capacity) > 0.9)) continue;
        const ratio = d.capacity > 0 ? d.load / d.capacity : 1;
        const score = ratio + 0.15 * (d.index / Math.max(1, range.length)) + (already > 0 ? 0.6 : 0);
        if (score < bestScore) {
          bestScore = score;
          best = d;
        }
      }
      if (!best) break;
      const already = best.allocations[t.id] ?? 0;
      const room = Math.min(free(best), dailyCap - already);
      let give_ = Math.min(target, left, room);
      if (t.splittable && give_ < left) {
        const rounded = Math.floor(give_ / 5) * 5;
        give_ = rounded >= chunkMin ? rounded : give_;
        // Avoid leaving a crumb smaller than a useful session behind.
        if (left - give_ > 0 && left - give_ < chunkMin && room >= left) give_ = left;
      }
      if (give_ <= 0) {
        excluded.add(best.index);
        continue;
      }
      give(best, t.id, give_);
      left -= give_;
      if (spareOnly) excluded.add(best.index);
    }
    return left;
  }

  // ---- Feasibility (EDF cumulative test) ----------------------------------------
  const conflicts: Conflict[] = [];
  const deadlines = [...new Set(byUrgency.map((t) => Math.min(deadlineIndex(t), horizon - 1)))].sort((a, b) => a - b);
  for (const dl of deadlines) {
    const involved = byUrgency.filter((t) => Math.min(deadlineIndex(t), horizon - 1) <= dl);
    let required = involved.reduce((sum, t) => sum + (allocatable[t.id] ?? 0), 0);
    for (let i = 0; i <= dl; i++) required += Object.values(recurringNeed[i]).reduce((a, b) => a + b, 0);
    const available = days.slice(0, dl + 1).reduce((sum, d) => sum + d.capacity, 0);
    if (required > available + 0.5) {
      conflicts.push({
        deadline: days[dl].date,
        requiredMinutes: Math.round(required),
        availableMinutes: Math.round(available),
        shortfallMinutes: Math.round(required - available),
        taskIds: involved.map((t) => t.id),
      });
    }
  }
  // Tasks whose chunking constraints left work unplaced even though totals fit.
  const unplacedIds = Object.keys(unscheduled).filter((id) => !conflicts.some((c) => c.taskIds.includes(id)));
  if (unplacedIds.length > 0) {
    const tasksById = new Map(byUrgency.map((t) => [t.id, t]));
    for (const id of unplacedIds) {
      const t = tasksById.get(id)!;
      const dl = Math.min(deadlineIndex(t), horizon - 1);
      conflicts.push({
        deadline: days[dl].date,
        requiredMinutes: Math.round(allocatable[id]),
        availableMinutes: Math.round(allocatable[id] - unscheduled[id]),
        shortfallMinutes: Math.round(unscheduled[id]),
        taskIds: [id],
      });
    }
  }

  const overdueTaskIds = deadlineTasks.filter((t) => t.deadline! < today).map((t) => t.id);
  return { today, days, unscheduled, conflicts, overdueTaskIds };
}

/** The single most severe conflict, for the "Route conflict" notice. */
export function worstConflict(f: Forecast): Conflict | null {
  return f.conflicts.reduce<Conflict | null>((w, c) => (!w || c.shortfallMinutes > w.shortfallMinutes ? c : w), null);
}

/** Per-task list of future days with allocated minutes (for task detail). */
export function scheduleFor(f: Forecast, taskId: string): { date: DateKey; minutes: number }[] {
  return f.days
    .map((d) => ({ date: d.date, minutes: Math.round((d.allocations[taskId] ?? 0) + (d.committed[taskId] ?? 0)) }))
    .filter((d) => d.minutes > 0);
}
