/**
 * Task operations as pure functions: data in, next data (and the route
 * change it caused) out. The app's actions and the MCP server both use
 * these, so a task added from Claude plans exactly like one added in-app.
 */
import * as engine from "./journey";
import { newId } from "./ids";
import { schedulingProfile } from "./learning";
import { planToday } from "./planner";
import { activeSession } from "./sessions";
import { serviceDate } from "./time";
import type { FocusLevel, NocturneData, ReplanReason, RouteChange, Task } from "./types";

export interface OpResult {
  data: NocturneData;
  change: RouteChange | null;
}

export interface TaskDraft {
  title: string;
  description: string;
  deadline: string | null;
  estimatedMinutes: number;
  interest: Task["interest"];
  difficulty: Task["difficulty"];
  importance: Task["importance"];
  splittable: boolean;
  minSessionMinutes: number;
  maxSessionMinutes: number;
  recurrence: Task["recurrence"];
  lineId: string | null;
  /** Set when the traveller chose a calibrated estimate over their own. */
  userEstimatedMinutes?: number | null;
}

export type TaskPatch = Partial<TaskDraft> & { remainingMinutes?: number };

const iso = (d: Date) => d.toISOString();

export function recordChange(data: NocturneData, change: RouteChange | null): NocturneData {
  if (!change) return data;
  const journey = engine.journeyFor(data, serviceDate(new Date(change.at)));
  if (!journey || !journey.startedAt) return data;
  const updated = { ...journey, routeChanges: journey.routeChanges + 1, changeLog: [...journey.changeLog, change] };
  return { ...data, journeys: data.journeys.map((j) => (j.id === journey.id ? updated : j)) };
}

/** Rebuild or retime tonight's future stations. Skipped once the night has ended. */
export function replan(
  data: NocturneData,
  reason: ReplanReason,
  now: Date,
  opts: { mode?: "reoptimize" | "retime"; order?: string[]; focus?: FocusLevel } = {},
): OpResult {
  const journey = engine.journeyFor(data, serviceDate(now));
  if (journey?.phase === "final") return { data, change: null };
  const startFrom = journey?.phase === "stop" && journey.stopEndsAt ? new Date(journey.stopEndsAt) : undefined;
  const result = planToday(
    { tasks: data.tasks, windows: data.windows, sessions: data.sessions, userId: data.profile.id, focusProfile: schedulingProfile(data, now) },
    {
      now,
      focus: opts.focus ?? journey?.focus ?? "steady",
      mode: opts.mode ?? "reoptimize",
      reason,
      order: opts.order,
      startFrom,
    },
  );
  const next = recordChange({ ...data, sessions: result.sessions }, result.change);
  return { data: next, change: result.change };
}

/** Settle stale journeys and make sure tonight has a route. */
export function ensureDay(data: NocturneData, now: Date): NocturneData {
  const today = serviceDate(now);
  let next = engine.settleStale(data, now);
  const hasToday = next.sessions.some((s) => s.date === today) || engine.journeyFor(next, today);
  if (!hasToday) {
    const planned = planToday(
      { tasks: next.tasks, windows: next.windows, sessions: next.sessions, userId: next.profile.id },
      { now, focus: "steady", mode: "reoptimize", reason: "initial" },
    );
    next = { ...next, sessions: planned.sessions };
  }
  return next;
}

const PLANNING_FIELDS: (keyof Task)[] = [
  "deadline",
  "estimatedMinutes",
  "remainingMinutes",
  "interest",
  "difficulty",
  "importance",
  "splittable",
  "minSessionMinutes",
  "maxSessionMinutes",
  "recurrence",
  "status",
];

function affectsPlan(a: Task | undefined, b: Task | undefined): boolean {
  if (!a || !b) return true;
  return PLANNING_FIELDS.some((f) => JSON.stringify(a[f]) !== JSON.stringify(b[f]));
}

function statusFor(d: Pick<TaskDraft, "estimatedMinutes">): Task["status"] {
  return d.estimatedMinutes > 0 ? "active" : "inbox";
}

export function addTask(data: NocturneData, draft: TaskDraft, now: Date): OpResult & { task: Task } {
  const at = iso(now);
  const task: Task = {
    id: newId(),
    userId: data.profile.id,
    userEstimatedMinutes: null,
    ...draft,
    title: draft.title.trim(),
    remainingMinutes: draft.estimatedMinutes,
    status: statusFor(draft),
    createdAt: at,
    updatedAt: at,
    completedAt: null,
  };
  const next: NocturneData = { ...data, tasks: [...data.tasks, task] };
  if (task.status !== "active") return { data: next, change: null, task };
  return { ...replan(next, "task-change", now), task };
}

export function editTask(data: NocturneData, id: string, patch: TaskPatch, now: Date): OpResult {
  const before = data.tasks.find((t) => t.id === id);
  if (!before) return { data, change: null };
  const merged = { ...before, ...patch };
  // Keep completed work when the estimate changes.
  if (patch.estimatedMinutes !== undefined && patch.remainingMinutes === undefined && !before.recurrence) {
    const done = before.estimatedMinutes - before.remainingMinutes;
    merged.remainingMinutes = Math.max(0, patch.estimatedMinutes - done);
  }
  if (merged.status !== "done") merged.status = statusFor(merged);
  if (merged.status === "active" && merged.remainingMinutes <= 0 && !merged.recurrence) {
    merged.status = "done";
    merged.completedAt = iso(now);
  }
  const after: Task = { ...merged, title: merged.title.trim(), updatedAt: iso(now) };
  const next: NocturneData = { ...data, tasks: data.tasks.map((t) => (t.id === id ? after : t)) };
  if (!affectsPlan(before, after)) return { data: next, change: null };
  return replan(next, "task-change", now);
}

export function finishTask(data: NocturneData, id: string, now: Date): OpResult {
  // Completing the task that's running closes its station as well.
  if (activeSession(data.sessions)?.taskId === id) return engine.finishEarly(data, now, true);
  const at = iso(now);
  const tasks = data.tasks.map((t) => (t.id === id ? { ...t, status: "done" as const, remainingMinutes: 0, completedAt: at, updatedAt: at } : t));
  return replan({ ...data, tasks }, "task-change", now);
}

/** Progress done outside Nocturne (partial completion). */
export function logTaskProgress(data: NocturneData, id: string, minutes: number, now: Date): OpResult {
  const t = data.tasks.find((x) => x.id === id);
  if (!t) return { data, change: null };
  return editTask(data, id, { remainingMinutes: Math.max(0, t.remainingMinutes - minutes) }, now);
}
