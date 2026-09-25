"use client";

/**
 * User intents. Each action derives the next dataset with pure functions
 * from `@/core`, then hands it to the store, which persists the diff.
 */
import * as engine from "@/core/journey";
import { newId } from "@/core/ids";
import { planToday, renumberDay } from "@/core/planner";
import { createSeedData } from "@/core/seed";
import { sessionsOn } from "@/core/sessions";
import { atMinutes, parseHM, toDateKey } from "@/core/time";
import type {
  CarriageId,
  FocusLevel,
  Line,
  NocturneData,
  Profile,
  ReplanReason,
  RouteChange,
  StudySession,
  StudyWindow,
  Task,
} from "@/core/types";
import { useStore } from "./store";

const iso = (d: Date) => d.toISOString();

function current(): NocturneData {
  const data = useStore.getState().data;
  if (!data) throw new Error("Data is not loaded yet.");
  return data;
}

function commit(next: NocturneData, change?: RouteChange | null) {
  useStore.getState().commit(next, change);
}

function recordChange(data: NocturneData, change: RouteChange | null): NocturneData {
  if (!change) return data;
  const journey = engine.journeyFor(data, toDateKey(new Date(change.at)));
  if (!journey || !journey.startedAt) return data;
  const updated = { ...journey, routeChanges: journey.routeChanges + 1, changeLog: [...journey.changeLog, change] };
  return { ...data, journeys: data.journeys.map((j) => (j.id === journey.id ? updated : j)) };
}

/** Rebuild or retime tonight's future stations. Skipped once the night has ended. */
function replan(
  data: NocturneData,
  reason: ReplanReason,
  opts: { mode?: "reoptimize" | "retime"; order?: string[]; focus?: FocusLevel } = {},
): { data: NocturneData; change: RouteChange | null } {
  const now = new Date();
  const journey = engine.journeyFor(data, toDateKey(now));
  if (journey?.phase === "final") return { data, change: null };
  const startFrom = journey?.phase === "stop" && journey.stopEndsAt ? new Date(journey.stopEndsAt) : undefined;
  const result = planToday(
    { tasks: data.tasks, windows: data.windows, sessions: data.sessions, userId: data.profile.id },
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

// ---------------------------------------------------------------------------
// Day maintenance
// ---------------------------------------------------------------------------

/** Settle stale journeys and make sure tonight has a route. */
export function ensureToday() {
  const now = new Date();
  const today = toDateKey(now);
  let data = engine.settleStale(current(), now);
  const hasToday = data.sessions.some((s) => s.date === today) || engine.journeyFor(data, today);
  if (!hasToday) {
    const planned = planToday(
      { tasks: data.tasks, windows: data.windows, sessions: data.sessions, userId: data.profile.id },
      { now, focus: "steady", mode: "reoptimize", reason: "initial" },
    );
    data = { ...data, sessions: planned.sessions };
  }
  commit(data);
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

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

function statusFor(d: Pick<TaskDraft, "estimatedMinutes" | "deadline" | "recurrence">): Task["status"] {
  return d.estimatedMinutes > 0 ? "active" : "inbox";
}

export function createTask(draft: TaskDraft): Task {
  const data = current();
  const now = iso(new Date());
  const task: Task = {
    id: newId(),
    userId: data.profile.id,
    ...draft,
    title: draft.title.trim(),
    remainingMinutes: draft.estimatedMinutes,
    status: statusFor(draft),
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  };
  let next: NocturneData = { ...data, tasks: [...data.tasks, task] };
  let change: RouteChange | null = null;
  if (task.status === "active") ({ data: next, change } = replan(next, "task-change"));
  commit(next, change);
  return task;
}

export function updateTask(id: string, patch: Partial<TaskDraft> & { remainingMinutes?: number }) {
  const data = current();
  const before = data.tasks.find((t) => t.id === id);
  if (!before) return;
  const merged = { ...before, ...patch };
  // Keep completed work when the estimate changes.
  if (patch.estimatedMinutes !== undefined && patch.remainingMinutes === undefined && !before.recurrence) {
    const done = before.estimatedMinutes - before.remainingMinutes;
    merged.remainingMinutes = Math.max(0, patch.estimatedMinutes - done);
  }
  if (merged.status !== "done") merged.status = statusFor(merged);
  if (merged.status === "active" && merged.remainingMinutes <= 0 && !merged.recurrence) {
    merged.status = "done";
    merged.completedAt = iso(new Date());
  }
  const after: Task = { ...merged, title: merged.title.trim(), updatedAt: iso(new Date()) };
  let next: NocturneData = { ...data, tasks: data.tasks.map((t) => (t.id === id ? after : t)) };
  let change: RouteChange | null = null;
  if (affectsPlan(before, after)) ({ data: next, change } = replan(next, "task-change"));
  commit(next, change);
}

export function completeTask(id: string) {
  const data = current();
  const now = iso(new Date());
  const tasks = data.tasks.map((t) =>
    t.id === id ? { ...t, status: "done" as const, remainingMinutes: 0, completedAt: now, updatedAt: now } : t,
  );
  const { data: next, change } = replan({ ...data, tasks }, "task-change");
  commit(next, change);
}

export function reopenTask(id: string) {
  const data = current();
  const now = iso(new Date());
  const tasks = data.tasks.map((t) =>
    t.id === id
      ? { ...t, status: "active" as const, remainingMinutes: Math.max(t.remainingMinutes, 30), completedAt: null, updatedAt: now }
      : t,
  );
  const { data: next, change } = replan({ ...data, tasks }, "task-change");
  commit(next, change);
}

/** Log progress done outside Nocturne (partial completion). */
export function logProgress(id: string, minutes: number) {
  const t = current().tasks.find((x) => x.id === id);
  if (!t) return;
  updateTask(id, { remainingMinutes: Math.max(0, t.remainingMinutes - minutes) });
}

export function deleteTask(id: string) {
  const data = current();
  const today = toDateKey(new Date());
  const tasks = data.tasks.filter((t) => t.id !== id);
  // History stays with its journey; future stations for the task go away.
  const sessions = data.sessions.filter((s) => s.taskId !== id);
  const base = { ...data, tasks, sessions: renumberDay(sessions, today) };
  const { data: next, change } = replan(base, "task-change");
  commit(next, change);
}

// ---------------------------------------------------------------------------
// Service Time
// ---------------------------------------------------------------------------

type WindowInput = Omit<StudyWindow, "id" | "userId"> & { id?: string };

export function saveWindows(list: WindowInput[]) {
  const data = current();
  let windows = data.windows;
  for (const w of list) {
    const window: StudyWindow = { ...w, id: w.id ?? newId(), userId: data.profile.id };
    const exists = windows.some((x) => x.id === window.id);
    windows = exists ? windows.map((x) => (x.id === window.id ? window : x)) : [...windows, window];
  }
  const { data: next, change } = replan({ ...data, windows }, "task-change");
  commit(next, change);
}

export function saveWindow(w: WindowInput) {
  saveWindows([w]);
}

export function deleteWindow(id: string) {
  const data = current();
  const { data: next, change } = replan({ ...data, windows: data.windows.filter((w) => w.id !== id) }, "task-change");
  commit(next, change);
}

// ---------------------------------------------------------------------------
// Lines
// ---------------------------------------------------------------------------

export function saveLine(line: Omit<Line, "id" | "userId" | "createdAt"> & { id?: string }): Line {
  const data = current();
  const existing = data.lines.find((l) => l.id === line.id);
  const saved: Line = {
    ...line,
    id: line.id ?? newId(),
    userId: data.profile.id,
    createdAt: existing?.createdAt ?? iso(new Date()),
  };
  const lines = existing ? data.lines.map((l) => (l.id === saved.id ? saved : l)) : [...data.lines, saved];
  commit({ ...data, lines });
  return saved;
}

export function deleteLine(id: string) {
  const data = current();
  commit({
    ...data,
    lines: data.lines.filter((l) => l.id !== id),
    tasks: data.tasks.map((t) => (t.lineId === id ? { ...t, lineId: null } : t)),
  });
}

export function attachTask(taskId: string, lineId: string | null) {
  const data = current();
  commit({ ...data, tasks: data.tasks.map((t) => (t.id === taskId ? { ...t, lineId, updatedAt: iso(new Date()) } : t)) });
}

// ---------------------------------------------------------------------------
// Route editing
// ---------------------------------------------------------------------------

function patchSession(data: NocturneData, id: string, patch: Partial<StudySession>): NocturneData {
  return { ...data, sessions: data.sessions.map((s) => (s.id === id ? { ...s, ...patch } : s)) };
}

export function optimizeRoute(focus?: FocusLevel) {
  const { data, change } = replan(current(), "optimize", { focus });
  commit(data, change ?? { at: iso(new Date()), reason: "optimize", headline: "Route optimized", lines: ["Tonight's stations were already in the best order."] });
}

export function reorderRoute(orderedIds: string[]) {
  const { data, change } = replan(current(), "reorder", { mode: "retime", order: orderedIds });
  commit(data, change);
}

export function toggleLock(id: string) {
  const data = current();
  const s = data.sessions.find((x) => x.id === id);
  if (!s) return;
  commit(patchSession(data, id, { locked: !s.locked }));
}

export function skipToday(id: string) {
  const data = current();
  const s = data.sessions.find((x) => x.id === id);
  if (!s || s.status !== "planned") return;
  const skipped = patchSession(data, id, { status: "skipped", locked: false });
  const { data: next, change } = replan(skipped, "skip", { mode: "retime" });
  commit(next, change);
}

export function doNow(id: string) {
  const data = current();
  const today = toDateKey(new Date());
  const planned = sessionsOn(data.sessions, today).filter((s) => s.status === "planned" && !s.locked);
  const order = [id, ...planned.map((s) => s.id).filter((x) => x !== id)];
  const unlocked = patchSession(data, id, { locked: false });
  const { data: next, change } = replan(unlocked, "reorder", { mode: "retime", order });
  commit(next, change);
}

export function resizeSession(id: string, delta: number) {
  const data = current();
  const s = data.sessions.find((x) => x.id === id);
  const task = data.tasks.find((t) => t.id === s?.taskId);
  if (!s || !task || s.status !== "planned") return;
  const otherToday = data.sessions
    .filter((x) => x.taskId === task.id && x.id !== id && x.status === "planned" && x.date === s.date)
    .reduce((a, x) => a + x.workMinutes, 0);
  const ceiling = task.recurrence ? task.estimatedMinutes * 2 : Math.max(10, task.remainingMinutes - otherToday);
  const minutes = Math.max(10, Math.min(ceiling, s.plannedMinutes + delta));
  const next = patchSession(data, id, { plannedMinutes: minutes, workMinutes: minutes });
  const { data: retimed, change } = replan(next, "edit", { mode: "retime" });
  commit(retimed, change);
}

/** Pin a station to a clock time. Moved stations are locked. */
export function moveSessionTo(id: string, hhmm: string) {
  const data = current();
  const s = data.sessions.find((x) => x.id === id);
  if (!s || s.status !== "planned") return;
  const start = atMinutes(s.date, parseHM(hhmm));
  const end = new Date(start.getTime() + s.plannedMinutes * 60_000);
  const moved = patchSession(data, id, { plannedStart: iso(start), plannedEnd: iso(end), locked: true });
  const { data: next, change } = replan({ ...moved, sessions: renumberDay(moved.sessions, s.date) }, "edit", { mode: "retime" });
  commit(next, change);
}

// ---------------------------------------------------------------------------
// Journey
// ---------------------------------------------------------------------------

function run(fn: (d: NocturneData, now: Date) => engine.EngineResult) {
  const { data, change } = fn(current(), new Date());
  commit(data, change);
}

export const board = (focus: FocusLevel, carriage: CarriageId) => run((d, now) => engine.board(d, { focus, carriage }, now));
export const arrive = () => run((d, now) => engine.arrive(d, now));
export const finishEarly = (wholeTask: boolean) => run((d, now) => engine.finishEarly(d, now, wholeTask));
export const needMoreTime = (minutes: number) => run((d, now) => engine.needMoreTime(d, now, minutes));
export const lowFocus = () => run((d, now) => engine.lowFocus(d, now));
export const pause = () => run((d, now) => engine.pause(d, now));
export const resume = () => run((d, now) => engine.resume(d, now));
export const depart = () => run((d, now) => engine.depart(d, now));
export const extendStop = (minutes: number) => run((d, now) => engine.extendStop(d, now, minutes));
export const reassessFocus = (level: FocusLevel) => run((d, now) => engine.reassessFocus(d, now, level));
export const resumeService = (focus: FocusLevel) => run((d, now) => engine.resumeService(d, now, focus));
export const endJourney = () => run((d, now) => engine.endJourney(d, now));

export function issueTicket(journeyId: string): string {
  const { data, ticket } = engine.issueTicket(current(), journeyId, new Date());
  commit(data);
  return ticket.id;
}

export function setCarriage(carriage: CarriageId) {
  const data = current();
  const journey = engine.journeyFor(data, toDateKey(new Date()));
  let next = updateProfileData(data, { preferredCarriage: carriage });
  if (journey) {
    next = {
      ...next,
      journeys: next.journeys.map((j) =>
        j.id === journey.id ? { ...j, selectedCarriage: carriage, selectedAmbience: engine.CARRIAGE_AMBIENCE[carriage] } : j,
      ),
    };
  }
  commit(next);
}

// ---------------------------------------------------------------------------
// Profile & data
// ---------------------------------------------------------------------------

function updateProfileData(data: NocturneData, patch: Partial<Profile>): NocturneData {
  return { ...data, profile: { ...data.profile, ...patch } };
}

export function updateProfile(patch: Partial<Profile>) {
  commit(updateProfileData(current(), patch));
}

export async function loadSampleData() {
  const data = current();
  const seeded = createSeedData(new Date(), { id: data.profile.id, name: data.profile.name, createdAt: data.profile.createdAt });
  await useStore.getState().replaceAll(seeded);
}
