/**
 * Day routing: turn a day's allocation into an ordered sequence of stations
 * that fit inside Service Time, with Station Stops between them.
 */
import { breakAfter, type Interval, type Stops } from "./availability";
import { diffDays, roundTo } from "./time";
import type { DateKey, FocusLevel, Task } from "./types";

export interface Chunk {
  /** Stable key so callers can map placed slots back to existing stations. */
  key: string;
  taskId: string;
  /** Clock minutes the station occupies. */
  minutes: number;
  /** Task work the station represents. */
  work: number;
}

export interface Slot extends Chunk {
  start: number;
  end: number;
}

export interface PackResult {
  slots: Slot[];
  overflow: Chunk[];
}

/** Split only when both halves are real stations, never a crumb. */
function canSplitAt(minutes: number, space: number, minSession: number): boolean {
  const take = Math.floor(space / 5) * 5;
  return take >= minSession && minutes - take >= minSession;
}

const FOCUS_CAPACITY: Record<FocusLevel, number> = { low: 0.2, steady: 0.55, sharp: 0.9 };
/** How much capacity fades with each station ridden since focus was last reported. */
const FOCUS_DRIFT = 0.05;

function capacityAt(focus: FocusLevel, position: number): number {
  return Math.max(0.1, FOCUS_CAPACITY[focus] - FOCUS_DRIFT * position);
}

/** How much willpower a task asks for, 0..1. Hard or avoided work is demanding. */
export function demandOf(t: Task): number {
  const diff = (t.difficulty - 1) / 4;
  const reluctance = (5 - t.interest) / 4;
  return 0.7 * diff + 0.3 * reluctance;
}

function urgencyOf(t: Task, date: DateKey): number {
  if (!t.deadline) return 0.05;
  const days = Math.max(0, diffDays(date, t.deadline));
  return 1 / (1 + days);
}

/** Work whose last day is `date` (or already overdue): it cannot wait for another night. */
function dueBy(t: Task, date: DateKey): boolean {
  return !t.recurrence && t.deadline !== null && t.deadline <= date;
}

/** Longest station for a task given tonight's focus: low focus means shorter, easier-to-start stations. */
export function sessionCap(task: Task, focus: FocusLevel = "steady"): number {
  const max = Math.max(task.minSessionMinutes, task.maxSessionMinutes);
  if (focus === "low") return Math.max(task.minSessionMinutes, Math.min(max, 30));
  // Demanding work is kept to realistic blocks even when sharp.
  if (task.difficulty >= 4) return Math.max(task.minSessionMinutes, Math.min(max, focus === "sharp" ? 60 : 50));
  return max;
}

/** Split a task's minutes for the day into realistic stations. */
export function chunksFor(task: Task, minutes: number, focus: FocusLevel = "steady", keyPrefix = task.id): Chunk[] {
  const total = Math.round(minutes);
  if (total <= 0) return [];
  if (!task.splittable) return [{ key: `${keyPrefix}:0`, taskId: task.id, minutes: total, work: total }];
  const cap = sessionCap(task, focus);
  let n = Math.ceil(total / cap);
  while (n > 1 && total / n < task.minSessionMinutes) n--;
  const out: Chunk[] = [];
  let left = total;
  for (let i = 0; i < n; i++) {
    const size = i === n - 1 ? left : roundTo(total / n, 5);
    out.push({ key: `${keyPrefix}:${i}`, taskId: task.id, minutes: size, work: size });
    left -= size;
  }
  return out;
}

export interface OrderContext {
  date: DateKey;
  focus: FocusLevel;
  tasks: Map<string, Task>;
  /** Task of the station immediately before the first slot, if any. */
  previousTaskId?: string | null;
  /** Learned nudge for placing a task at a given minute (0 when unknown). */
  history?: (task: Task, startMinute: number) => number;
  /**
   * Stations already ridden tonight since focus was last reported: the
   * evening's fatigue carries into a re-plan instead of starting fresh.
   */
  startPosition?: number;
}

/**
 * How far each chunk in the pool is from what the traveller can give if it
 * goes next (0 = a perfect match).
 *
 * - Low focus looks at the next station only: begin with what is easy to start.
 * - Steady or Sharp looks at the rest of the night as well. Focus only fades
 *   from here, so the cost of going next includes the best order for the
 *   rest (most demanding work first while capacity lasts). Demanding work
 *   loses the most by waiting, so it goes while the traveller is fresh
 *   instead of drifting to the end of the night.
 */
function fitCosts(pool: Chunk[], ctx: OrderContext, position: number): number[] {
  const demand = pool.map((c) => {
    const t = ctx.tasks.get(c.taskId);
    return t ? demandOf(t) : 0;
  });
  const now = capacityAt(ctx.focus, position);
  if (ctx.focus === "low") return demand.map((d) => Math.abs(d - now));
  const order = demand.map((d, i) => ({ d, i })).sort((a, b) => b.d - a.d);
  return demand.map((d, idx) => {
    let cost = Math.abs(d - now);
    let q = position + 1;
    for (const x of order) {
      if (x.i === idx) continue;
      cost += Math.abs(x.d - capacityAt(ctx.focus, q++));
    }
    return cost;
  });
}

/** Score a chunk for the next position in the route. Higher is better. */
function scoreChunk(
  c: Chunk,
  position: number,
  first: boolean,
  prev: Chunk | null,
  ctx: OrderContext,
  startMinute: number,
  fit: number,
): number {
  const t = ctx.tasks.get(c.taskId);
  if (!t) return -Infinity;
  const demand = demandOf(t);
  const importance = (t.importance - 1) / 4;
  // `fit`: how far the work is from the focus the traveller has left (see fitCosts).
  let score = 1.3 * urgencyOf(t, ctx.date) + 0.6 * importance - 1.2 * fit;
  // Low focus: favour a low barrier to entry — short, easy, appealing.
  if (ctx.focus === "low") score += 0.35 * (1 - Math.min(1, c.minutes / 60)) + 0.25 * ((t.interest - 1) / 4);
  // Sharp focus is the time for hard or important work.
  if (ctx.focus === "sharp") score += 0.35 * importance + 0.2 * ((t.difficulty - 1) / 4);
  // Important work the traveller is avoiding goes early while they're fresh,
  // so low interest never quietly pushes it to the end of every night.
  if (ctx.focus !== "low" && t.interest <= 2 && t.importance >= 4 && position <= 1) score += 0.3;
  // What the traveller's own history says about this hour (small by design:
  // never outweighs deadlines, importance or how they feel right now).
  if (ctx.history) score += ctx.history(t, startMinute);
  const prevTaskId = prev?.taskId ?? (first ? ctx.previousTaskId : null);
  if (prevTaskId === c.taskId) score -= 0.8;
  if (prev) {
    const pt = ctx.tasks.get(prev.taskId);
    if (pt && demandOf(pt) > 0.6 && demand > 0.6 && prev.minutes >= 45 && c.minutes >= 45) score -= 0.5;
  }
  return score;
}

/**
 * Greedy, focus-aware packing. At every free position pick the best chunk
 * that fits; split splittable chunks to use the tail of a window. Work due
 * tonight is never pushed out by work that could wait for another night.
 */
export function packOptimized(
  chunks: Chunk[],
  intervals: Interval[],
  ctx: OrderContext,
  minSessionFor: (taskId: string) => number,
  stops: Stops = "normal",
): PackResult {
  const pool = chunks.map((c) => ({ ...c }));
  const slots: Slot[] = [];
  let prev: Chunk | null = null;
  let splitSeq = 0;
  const offset = ctx.startPosition ?? 0;
  const isDue = (c: Chunk) => {
    const t = ctx.tasks.get(c.taskId);
    return !!t && dueBy(t, ctx.date);
  };

  intervals.forEach((iv, ivIndex) => {
    const later = intervals.slice(ivIndex + 1).reduce((sum, x) => sum + (x.end - x.start), 0);
    let cursor = iv.start;
    while (pool.length > 0) {
      const space = iv.end - cursor;
      if (space < 5) break;
      const position = offset + slots.length;
      const fit = fitCosts(pool, ctx, position);
      // Room the work due tonight still needs, Station Stops included.
      const dueNeed = pool.reduce((sum, c) => sum + (isDue(c) ? c.minutes + breakAfter(c.minutes, stops) : 0), 0);
      const placeable = (c: Chunk) => {
        const t = ctx.tasks.get(c.taskId);
        return c.minutes <= space || (!!t?.splittable && canSplitAt(c.minutes, space, minSessionFor(c.taskId)));
      };
      // Low focus eases in with lighter work, but only among tonight's due
      // stations: all of them come before work that could wait for another
      // night (which may still fill a gap too small for any due station).
      const dueFirst = ctx.focus === "low" && pool.some((c) => isDue(c) && placeable(c));
      let bestIdx = -1;
      let bestScore = -Infinity;
      let bestFits = false;
      pool.forEach((c, idx) => {
        if (!placeable(c)) return;
        const fits = c.minutes <= space;
        if (dueFirst && !isDue(c)) return;
        if (dueNeed > 0 && !isDue(c)) {
          const used = fits ? c.minutes : Math.floor(space / 5) * 5;
          if (space - used - breakAfter(used, stops) + later < dueNeed) return;
        }
        const s = scoreChunk(c, position, slots.length === 0, prev, ctx, cursor, fit[idx]) + (fits ? 0.2 : 0);
        if (s > bestScore) {
          bestScore = s;
          bestIdx = idx;
          bestFits = fits;
        }
      });
      if (bestIdx < 0) break;
      const chosen = pool[bestIdx];
      let placed: Chunk;
      if (bestFits) {
        placed = chosen;
        pool.splice(bestIdx, 1);
      } else {
        const take = Math.floor(space / 5) * 5;
        const workTake = Math.round((chosen.work * take) / chosen.minutes);
        placed = { key: chosen.key, taskId: chosen.taskId, minutes: take, work: workTake };
        pool[bestIdx] = {
          key: `${chosen.key}:s${splitSeq++}`,
          taskId: chosen.taskId,
          minutes: chosen.minutes - take,
          work: chosen.work - workTake,
        };
      }
      slots.push({ ...placed, start: cursor, end: cursor + placed.minutes });
      prev = placed;
      cursor += placed.minutes + breakAfter(placed.minutes, stops);
    }
  });
  return { slots, overflow: pool };
}

/**
 * Keep the given order and only recompute times. Splittable stations that
 * straddle the end of a window are split; others roll to the next window.
 */
export function packInOrder(
  chunks: Chunk[],
  intervals: Interval[],
  splittable: (taskId: string) => boolean,
  minSessionFor: (taskId: string) => number,
  stops: Stops = "normal",
): PackResult {
  const queue = chunks.map((c) => ({ ...c }));
  const slots: Slot[] = [];
  const overflow: Chunk[] = [];
  let splitSeq = 0;
  let ivIndex = 0;
  let cursor = intervals[0]?.start ?? 0;

  while (queue.length > 0 && ivIndex < intervals.length) {
    const iv = intervals[ivIndex];
    cursor = Math.max(cursor, iv.start);
    const space = iv.end - cursor;
    const c = queue[0];
    if (c.minutes <= space) {
      slots.push({ ...c, start: cursor, end: cursor + c.minutes });
      cursor += c.minutes + breakAfter(c.minutes, stops);
      queue.shift();
      continue;
    }
    const min = minSessionFor(c.taskId);
    const take = Math.floor(space / 5) * 5;
    if (splittable(c.taskId) && canSplitAt(c.minutes, space, min)) {
      const workTake = Math.round((c.work * take) / c.minutes);
      slots.push({ key: c.key, taskId: c.taskId, minutes: take, work: workTake, start: cursor, end: cursor + take });
      queue[0] = { key: `${c.key}:s${splitSeq++}`, taskId: c.taskId, minutes: c.minutes - take, work: c.work - workTake };
    } else if (splittable(c.taskId) && take >= min && ivIndex === intervals.length - 1) {
      // Last window of the night: shorten the station to fit; the rest returns to the planner.
      const workTake = Math.round((c.work * take) / c.minutes);
      slots.push({ key: c.key, taskId: c.taskId, minutes: take, work: workTake, start: cursor, end: cursor + take });
      overflow.push({ key: `${c.key}:rest`, taskId: c.taskId, minutes: c.minutes - take, work: c.work - workTake });
      queue.shift();
    }
    ivIndex++;
    cursor = intervals[ivIndex]?.start ?? cursor;
  }
  return { slots, overflow: [...overflow, ...queue] };
}
