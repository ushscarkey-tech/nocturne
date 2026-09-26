"use client";

/**
 * User intents. Each action derives the next dataset with pure functions
 * from `@/core`, then hands it to the store, which persists the diff.
 */
import * as engine from "@/core/journey";
import { newId } from "@/core/ids";
import * as ops from "@/core/ops";
import { applyRescue, type RescueStep } from "@/core/rescue";
import { renumberDay } from "@/core/planner";
import { createSeedData } from "@/core/seed";
import { sessionsOn } from "@/core/sessions";
import { atMinutes, DAY_START_MINUTES, parseHM, serviceDate } from "@/core/time";
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

/** Rebuild or retime tonight's future stations. Skipped once the night has ended. */
function replan(
  data: NocturneData,
  reason: ReplanReason,
  opts: { mode?: "reoptimize" | "retime"; order?: string[]; focus?: FocusLevel } = {},
): { data: NocturneData; change: RouteChange | null } {
  return ops.replan(data, reason, new Date(), opts);
}

// ---------------------------------------------------------------------------
// Day maintenance
// ---------------------------------------------------------------------------

/** Settle stale journeys and make sure tonight has a route. */
export function ensureToday() {
  commit(ops.ensureDay(current(), new Date()));
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export type TaskDraft = ops.TaskDraft;

export function createTask(draft: TaskDraft): Task {
  const { data, change, task } = ops.addTask(current(), draft, new Date());
  commit(data, change);
  return task;
}

export function updateTask(id: string, patch: ops.TaskPatch) {
  const { data, change } = ops.editTask(current(), id, patch, new Date());
  commit(data, change);
}

export function completeTask(id: string) {
  const { data, change } = ops.finishTask(current(), id, new Date());
  commit(data, change);
}

/**
 * Use a calibrated estimate. The traveller's own number is kept so they can
 * go back to it at any time.
 */
export function applySuggestedEstimate(id: string, minutes: number) {
  const t = current().tasks.find((x) => x.id === id);
  if (!t || minutes === t.estimatedMinutes) return;
  const delta = minutes - t.estimatedMinutes;
  const own = t.userEstimatedMinutes ?? t.estimatedMinutes;
  commitTaskEstimate(id, {
    estimatedMinutes: minutes,
    remainingMinutes: Math.max(0, t.remainingMinutes + delta),
    userEstimatedMinutes: own === minutes ? null : own,
  });
}

/** Back to the traveller's own estimate. */
export function revertEstimate(id: string) {
  const t = current().tasks.find((x) => x.id === id);
  if (!t || t.userEstimatedMinutes === null) return;
  const delta = t.userEstimatedMinutes - t.estimatedMinutes;
  commitTaskEstimate(id, {
    estimatedMinutes: t.userEstimatedMinutes,
    remainingMinutes: Math.max(0, t.remainingMinutes + delta),
    userEstimatedMinutes: null,
  });
}

function commitTaskEstimate(id: string, patch: Pick<Task, "estimatedMinutes" | "remainingMinutes" | "userEstimatedMinutes">) {
  const data = current();
  const tasks = data.tasks.map((t) => (t.id === id ? { ...t, ...patch, updatedAt: iso(new Date()) } : t));
  const { data: next, change } = replan({ ...data, tasks }, "task-change");
  commit(next, change);
}

/** The estimate ran out but the work isn't finished: add time and re-plan. */
export function addTaskTime(id: string, minutes: number) {
  const t = current().tasks.find((x) => x.id === id);
  if (!t) return;
  updateTask(id, { estimatedMinutes: t.estimatedMinutes + minutes, remainingMinutes: t.remainingMinutes + minutes });
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
  run((d, now) => engine.removeTask(d, id, now));
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
  const skipped = patchSession(data, id, { status: "skipped", locked: false, endedBy: "skipped" });
  const { data: next, change } = replan(skipped, "skip", { mode: "retime" });
  commit(next, change);
}

export function doNow(id: string) {
  const data = current();
  const today = serviceDate(new Date());
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
  // Times after midnight belong to the same night.
  const minutes = parseHM(hhmm) < DAY_START_MINUTES ? parseHM(hhmm) + 1440 : parseHM(hhmm);
  const start = atMinutes(s.date, minutes);
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
export function reassessFocus(level: FocusLevel) {
  const { data, change } = engine.reassessFocus(current(), new Date(), level);
  commit(data, change);
  if (!change) {
    const word = { low: "Low", steady: "Steady", sharp: "Sharp" }[level];
    useStore.getState().notify({ headline: `Signal · ${word}`, lines: ["The route already suits how you feel."], tone: "info" });
  }
}
export const resumeService = (focus: FocusLevel) => run((d, now) => engine.resumeService(d, now, focus));
export const endJourney = () => run((d, now) => engine.endJourney(d, now));

/** After an early finish, keep riding with upcoming work. Returns false if nothing is due soon. */
export function continueService(): boolean {
  const result = engine.continueService(current(), new Date());
  if (result.added) commit(result.data);
  return result.added;
}

export function issueTicket(journeyId: string): string {
  const { data, ticket } = engine.issueTicket(current(), journeyId, new Date());
  commit(data);
  return ticket.id;
}

export function setCarriage(carriage: CarriageId) {
  const data = current();
  const journey = engine.journeyFor(data, serviceDate(new Date()));
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
  // Stop length changes how much fits, so the route follows at once.
  if (patch.shortStops !== undefined && patch.shortStops !== current().profile.shortStops) {
    const { data, change } = ops.replan(updateProfileData(current(), patch), "task-change", new Date());
    commit(data, change);
    return;
  }
  commit(updateProfileData(current(), patch));
}

/** Carry out a rescue plan (or some of its steps). */
export function applyRescuePlan(steps: RescueStep[]) {
  const { data, change } = applyRescue(current(), steps, new Date());
  commit(data, change);
}

export async function loadSampleData() {
  const data = current();
  const seeded = createSeedData(new Date(), { ...data.profile, onboardedAt: data.profile.onboardedAt ?? new Date().toISOString() }, data.profile.locale);
  await useStore.getState().replaceAll(seeded);
}

/** Replace weekly Service Time (used by the welcome guide). */
export function setWeeklyWindows(list: { days: number[]; start: string; end: string }[]) {
  const data = current();
  const windows: StudyWindow[] = [
    ...data.windows.filter((w) => !w.recurring),
    ...list.flatMap((w) =>
      w.days.map((day) => ({
        id: newId(),
        userId: data.profile.id,
        dayOfWeek: day,
        specificDate: null,
        startTime: w.start,
        endTime: w.end,
        recurring: true,
        enabled: true,
        kind: "available" as const,
      })),
    ),
  ];
  const { data: next } = replan({ ...data, windows }, "initial");
  commit(next);
}

export function finishOnboarding() {
  const data = current();
  commit({ ...data, profile: { ...data.profile, onboardedAt: new Date().toISOString() } });
  ensureToday();
}
