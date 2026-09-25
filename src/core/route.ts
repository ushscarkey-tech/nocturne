/**
 * Day routing: turn a day's allocation into an ordered sequence of stations
 * that fit inside Service Time, with Station Stops between them.
 */
import { breakAfter, type Interval } from "./availability";
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

/** Split a task's minutes for the day into stations no longer than its max session. */
export function chunksFor(task: Task, minutes: number, keyPrefix = task.id): Chunk[] {
  const total = Math.round(minutes);
  if (total <= 0) return [];
  if (!task.splittable) return [{ key: `${keyPrefix}:0`, taskId: task.id, minutes: total, work: total }];
  const cap = Math.max(task.minSessionMinutes, task.maxSessionMinutes);
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
}

/** Score a chunk for the next position in the route. Higher is better. */
function scoreChunk(c: Chunk, position: number, prev: Chunk | null, ctx: OrderContext): number {
  const t = ctx.tasks.get(c.taskId);
  if (!t) return -Infinity;
  // Reported focus applies now and drifts down gently through the evening.
  const capacity = Math.max(0.1, FOCUS_CAPACITY[ctx.focus] - 0.05 * position);
  const demand = demandOf(t);
  let score = 1.3 * urgencyOf(t, ctx.date) + 0.6 * ((t.importance - 1) / 4) - 1.2 * Math.abs(demand - capacity);
  if (ctx.focus === "low") score += 0.35 * (1 - Math.min(1, c.minutes / 60)) + 0.25 * ((t.interest - 1) / 4);
  const prevTaskId = prev?.taskId ?? (position === 0 ? ctx.previousTaskId : null);
  if (prevTaskId === c.taskId) score -= 0.8;
  if (prev) {
    const pt = ctx.tasks.get(prev.taskId);
    if (pt && demandOf(pt) > 0.6 && demand > 0.6 && prev.minutes >= 45 && c.minutes >= 45) score -= 0.5;
  }
  return score;
}

/**
 * Greedy, focus-aware packing. At every free position pick the best chunk
 * that fits; split splittable chunks to use the tail of a window.
 */
export function packOptimized(
  chunks: Chunk[],
  intervals: Interval[],
  ctx: OrderContext,
  minSessionFor: (taskId: string) => number,
): PackResult {
  const pool = chunks.map((c) => ({ ...c }));
  const slots: Slot[] = [];
  let prev: Chunk | null = null;
  let splitSeq = 0;

  for (const iv of intervals) {
    let cursor = iv.start;
    while (pool.length > 0) {
      const space = iv.end - cursor;
      if (space < 5) break;
      let bestIdx = -1;
      let bestScore = -Infinity;
      let bestFits = false;
      pool.forEach((c, idx) => {
        const fits = c.minutes <= space;
        const t = ctx.tasks.get(c.taskId);
        const canSplit = !!t?.splittable && canSplitAt(c.minutes, space, minSessionFor(c.taskId));
        if (!fits && !canSplit) return;
        const s = scoreChunk(c, slots.length, prev, ctx) + (fits ? 0.2 : 0);
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
      cursor += placed.minutes + breakAfter(placed.minutes);
    }
  }
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
): PackResult {
  const queue = chunks.map((c) => ({ ...c }));
  const slots: Slot[] = [];
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
      cursor += c.minutes + breakAfter(c.minutes);
      queue.shift();
      continue;
    }
    const min = minSessionFor(c.taskId);
    if (splittable(c.taskId) && canSplitAt(c.minutes, space, min)) {
      const take = Math.floor(space / 5) * 5;
      const workTake = Math.round((c.work * take) / c.minutes);
      slots.push({ key: c.key, taskId: c.taskId, minutes: take, work: workTake, start: cursor, end: cursor + take });
      queue[0] = { key: `${c.key}:s${splitSeq++}`, taskId: c.taskId, minutes: c.minutes - take, work: c.work - workTake };
    }
    ivIndex++;
    cursor = intervals[ivIndex]?.start ?? cursor;
  }
  return { slots, overflow: queue };
}
