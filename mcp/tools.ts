/**
 * What Claude can do with Nocturne. Every tool reads the traveller's data,
 * runs the same core functions as the app (so routes re-plan exactly as they
 * would in-app) and writes back only what changed.
 */
import { arrivalForecast } from "../src/core/arrival";
import { availabilityForDate } from "../src/core/availability";
import * as ops from "../src/core/ops";
import { forecast } from "../src/core/planner";
import { parseQuickAdd } from "../src/core/quickadd";
import { routeOf } from "../src/core/sessions";
import { stationLabel } from "../src/core/stations";
import { addDays, clock, formatHM, serviceDate } from "../src/core/time";
import type { Level, NocturneData, RouteChange, Task } from "../src/core/types";
import { Firestore } from "./firestore";

type Json = Record<string, unknown>;

export interface ToolDef {
  name: string;
  title: string;
  description: string;
  inputSchema: Json;
  annotations?: Json;
  run(ctx: Ctx, args: Json): Promise<Json>;
}

export class ToolError extends Error {}

/** One request's view of the traveller's data. */
export class Ctx {
  private data: NocturneData | null = null;
  private loaded: NocturneData | null = null;
  constructor(private readonly fs: Firestore) {}

  now = new Date();

  async get(): Promise<NocturneData> {
    if (this.data) return this.data;
    const d = await this.fs.load();
    if (!d) throw new ToolError("This Nocturne account has no data yet. Open the app once to set it up.");
    // Times and "today" follow the traveller's own time zone.
    process.env.TZ = d.profile.timezone || "Asia/Seoul";
    this.now = new Date();
    this.loaded = d;
    this.data = ops.ensureDay(d, this.now);
    return this.data;
  }

  set(next: NocturneData) {
    this.data = next;
  }

  /** Persist everything changed since loading (including tonight's route if it was just planned). */
  async save(): Promise<number> {
    if (!this.loaded || !this.data) return 0;
    const n = await this.fs.save(this.loaded, this.data);
    this.loaded = this.data;
    return n;
  }

  station(name: string) {
    return stationLabel(name, this.data?.profile.locale ?? "en");
  }
}

// ----------------------------------------------------------------- shaping

function taskView(t: Task, d: NocturneData) {
  return {
    id: t.id,
    title: t.title,
    status: t.status,
    deadline: t.deadline,
    remaining_minutes: t.remainingMinutes,
    estimated_minutes: t.estimatedMinutes,
    importance: t.importance,
    interest: t.interest,
    difficulty: t.difficulty,
    line: t.lineId ? (d.lines.find((l) => l.id === t.lineId)?.title ?? null) : null,
    recurring: t.recurrence ? t.recurrence.freq : null,
  };
}

function tonight(ctx: Ctx, d: NocturneData, date = serviceDate(ctx.now)) {
  const route = routeOf(d.sessions, date);
  const titles = new Map(d.tasks.map((t) => [t.id, t.title]));
  const journey = d.journeys.find((j) => j.date === date) ?? null;
  const minutes = route.reduce((s, x) => s + x.plannedMinutes, 0);
  return {
    date,
    service_time: availabilityForDate(d.windows, date).map((i) => `${formatHM(i.start)}–${formatHM(i.end)}`),
    journey: journey ? { phase: journey.phase, started: journey.startedAt ? clock(journey.startedAt) : null } : null,
    stations: route.map((s) => ({
      station: ctx.station(s.stationName),
      time: `${clock(s.plannedStart)}–${clock(s.plannedEnd)}`,
      task: titles.get(s.taskId) ?? "(removed task)",
      minutes: s.plannedMinutes,
      status: s.status,
    })),
    total_minutes: minutes,
    departs: route[0] ? clock(route[0].plannedStart) : null,
    arrives: route.length ? clock(route[route.length - 1].plannedEnd) : null,
  };
}

function changeView(c: RouteChange | null) {
  return c ? { reason: c.reason, headline: c.headline, details: c.lines } : null;
}

function findTask(d: NocturneData, args: Json): Task {
  const id = typeof args.task_id === "string" ? args.task_id : "";
  if (id) {
    const t = d.tasks.find((x) => x.id === id);
    if (t) return t;
  }
  const q = String(args.task ?? args.task_id ?? "").trim().toLowerCase();
  if (!q) throw new ToolError("Say which task: task_id, or part of its title in `task`.");
  const live = d.tasks.filter((t) => t.status !== "archived");
  const exact = live.filter((t) => t.title.toLowerCase() === q);
  const hits = exact.length ? exact : live.filter((t) => t.title.toLowerCase().includes(q));
  if (hits.length === 1) return hits[0];
  if (hits.length === 0) throw new ToolError(`No task matches "${q}". Use list_tasks to see them.`);
  throw new ToolError(`Several tasks match "${q}": ${hits.map((t) => `${t.title} (${t.id})`).join(", ")}. Pass task_id.`);
}

const level = (v: unknown): Level | undefined => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? (n as Level) : undefined;
};
const minutes = (v: unknown): number | undefined => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 0 && n <= 6000 ? n : undefined;
};
const dateKey = (v: unknown): string | null | undefined => {
  if (v === null) return null;
  if (typeof v !== "string") return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  throw new ToolError(`Dates are YYYY-MM-DD (got "${v}").`);
};

// ------------------------------------------------------------------ schemas

const taskRef = {
  task_id: { type: "string", description: "The task's id (from list_tasks)." },
  task: { type: "string", description: "Or part of the task's title, if there's only one match." },
};
const feel = {
  importance: { type: "integer", minimum: 1, maximum: 5, description: "How much it matters, 1–5 (3 = normal)." },
  interest: { type: "integer", minimum: 1, maximum: 5, description: "How much the traveller wants to do it, 1–5." },
  difficulty: { type: "integer", minimum: 1, maximum: 5, description: "How hard it is, 1–5." },
};

export const TOOLS: ToolDef[] = [
  {
    name: "get_tonight",
    title: "Tonight's route",
    description:
      "Tonight's study route in Nocturne: each station (one block of one task) with its time, the task, minutes and status, plus the Service Time (the hours the traveller can study). Plans tonight first if it has no route yet.",
    inputSchema: { type: "object", properties: { date: { type: "string", description: "YYYY-MM-DD; defaults to today (the service day)." } } },
    annotations: { readOnlyHint: false },
    async run(ctx, args) {
      const d = await ctx.get();
      await ctx.save();
      return tonight(ctx, d, (dateKey(args.date) as string | undefined) ?? serviceDate(ctx.now));
    },
  },
  {
    name: "list_tasks",
    title: "List tasks",
    description: "The traveller's tasks with deadlines and remaining minutes. Status: active (being planned), inbox (needs an estimate), done.",
    inputSchema: {
      type: "object",
      properties: { status: { type: "string", enum: ["open", "active", "inbox", "done", "all"], description: "Default: open (active + inbox)." } },
    },
    annotations: { readOnlyHint: true },
    async run(ctx, args) {
      const d = await ctx.get();
      const s = String(args.status ?? "open");
      const list = d.tasks.filter((t) =>
        t.status === "archived" ? false : s === "all" ? true : s === "open" ? t.status === "active" || t.status === "inbox" : t.status === s,
      );
      list.sort((a, b) => (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999"));
      return { today: serviceDate(ctx.now), tasks: list.map((t) => taskView(t, d)) };
    },
  },
  {
    name: "add_task",
    title: "Add a task",
    description:
      "Add a study task. Give a deadline and an estimate in minutes so it gets planned; without an estimate it waits in the inbox. The route re-plans at once.",
    inputSchema: {
      type: "object",
      required: ["title"],
      properties: {
        title: { type: "string" },
        deadline: { type: ["string", "null"], description: "Last day to work on it, YYYY-MM-DD. Omit for no deadline." },
        estimated_minutes: { type: "integer", minimum: 0, description: "Total time it needs." },
        ...feel,
        splittable: { type: "boolean", description: "Can it be split across several stations? Default true." },
        max_session_minutes: { type: "integer", minimum: 10, maximum: 240, description: "Longest single block. Default 60." },
      },
    },
    async run(ctx, args) {
      const d = await ctx.get();
      const title = String(args.title ?? "").trim();
      if (!title) throw new ToolError("A title is needed.");
      const max = minutes(args.max_session_minutes) ?? 60;
      const draft: ops.TaskDraft = {
        title,
        description: "",
        deadline: dateKey(args.deadline) ?? null,
        estimatedMinutes: minutes(args.estimated_minutes) ?? 0,
        interest: level(args.interest) ?? 3,
        difficulty: level(args.difficulty) ?? 3,
        importance: level(args.importance) ?? 3,
        splittable: args.splittable === undefined ? true : Boolean(args.splittable),
        maxSessionMinutes: max,
        minSessionMinutes: Math.min(25, max),
        recurrence: null,
        lineId: null,
      };
      const r = ops.addTask(d, draft, ctx.now);
      ctx.set(r.data);
      await ctx.save();
      return { added: taskView(r.task, r.data), route_change: changeView(r.change), tonight: tonight(ctx, r.data) };
    },
  },
  {
    name: "quick_add",
    title: "Quick add (natural language)",
    description:
      "Add a task from one line of natural language, the way the app's Quick Add reads it (Korean, English, Japanese or Chinese), e.g. \"수학 문제집 금요일까지 2시간\" or \"essay outline by Thursday 90m, not urgent\". Returns what was understood.",
    inputSchema: { type: "object", required: ["text"], properties: { text: { type: "string" } } },
    async run(ctx, args) {
      const d = await ctx.get();
      const text = String(args.text ?? "").trim();
      if (!text) throw new ToolError("Give the task as text.");
      const p = parseQuickAdd(text, ctx.now, d.lines);
      const max = p.maxSessionMinutes ?? 60;
      const draft: ops.TaskDraft = {
        title: p.title.trim() || text,
        description: "",
        deadline: p.deadline,
        estimatedMinutes: p.estimatedMinutes ?? 0,
        interest: p.interest ?? 3,
        difficulty: p.difficulty ?? 3,
        importance: p.importance ?? 3,
        recurrence: p.recurrence,
        splittable: p.splittable ?? true,
        maxSessionMinutes: max,
        minSessionMinutes: Math.min(p.minSessionMinutes ?? 25, max),
        lineId: p.lineId,
      };
      const r = ops.addTask(d, draft, ctx.now);
      ctx.set(r.data);
      await ctx.save();
      return {
        added: taskView(r.task, r.data),
        understood: p.found,
        worth_checking: p.unsure,
        route_change: changeView(r.change),
        tonight: tonight(ctx, r.data),
      };
    },
  },
  {
    name: "update_task",
    title: "Change a task",
    description: "Change a task's title, deadline, estimate, remaining time or how it feels. The route re-plans if planning changes.",
    inputSchema: {
      type: "object",
      properties: {
        ...taskRef,
        title: { type: "string" },
        deadline: { type: ["string", "null"], description: "YYYY-MM-DD, or null to remove the deadline." },
        estimated_minutes: { type: "integer", minimum: 0 },
        remaining_minutes: { type: "integer", minimum: 0 },
        ...feel,
      },
    },
    async run(ctx, args) {
      const d = await ctx.get();
      const t = findTask(d, args);
      const patch: ops.TaskPatch = {};
      if (typeof args.title === "string" && args.title.trim()) patch.title = args.title;
      const dl = dateKey(args.deadline);
      if (dl !== undefined) patch.deadline = dl;
      if (minutes(args.estimated_minutes) !== undefined) patch.estimatedMinutes = minutes(args.estimated_minutes);
      if (minutes(args.remaining_minutes) !== undefined) patch.remainingMinutes = minutes(args.remaining_minutes);
      for (const k of ["importance", "interest", "difficulty"] as const) if (level(args[k])) patch[k] = level(args[k]);
      if (Object.keys(patch).length === 0) throw new ToolError("Nothing to change.");
      const r = ops.editTask(d, t.id, patch, ctx.now);
      ctx.set(r.data);
      await ctx.save();
      return { task: taskView(r.data.tasks.find((x) => x.id === t.id)!, r.data), route_change: changeView(r.change) };
    },
  },
  {
    name: "complete_task",
    title: "Mark a task done",
    description: "Mark a task as finished. Its remaining stations leave the route.",
    inputSchema: { type: "object", properties: taskRef },
    async run(ctx, args) {
      const d = await ctx.get();
      const t = findTask(d, args);
      const r = ops.finishTask(d, t.id, ctx.now);
      ctx.set(r.data);
      await ctx.save();
      return { done: t.title, route_change: changeView(r.change), tonight: tonight(ctx, r.data) };
    },
  },
  {
    name: "log_progress",
    title: "Log progress",
    description: "Record minutes of work done on a task outside Nocturne; its remaining time drops and the route re-plans.",
    inputSchema: { type: "object", required: ["minutes"], properties: { ...taskRef, minutes: { type: "integer", minimum: 1 } } },
    async run(ctx, args) {
      const d = await ctx.get();
      const t = findTask(d, args);
      const m = minutes(args.minutes);
      if (!m) throw new ToolError("Give the minutes done.");
      const r = ops.logTaskProgress(d, t.id, m, ctx.now);
      ctx.set(r.data);
      await ctx.save();
      return { task: taskView(r.data.tasks.find((x) => x.id === t.id)!, r.data), route_change: changeView(r.change) };
    },
  },
  {
    name: "arrival_forecast",
    title: "Will everything be done in time?",
    description:
      "If the traveller rides the planned routes, when each task with a deadline is finished, how many minutes short any are, and total work needed vs Service Time available.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
    async run(ctx) {
      const d = await ctx.get();
      const today = serviceDate(ctx.now);
      const f = forecast({ tasks: d.tasks, windows: d.windows, sessions: d.sessions, userId: d.profile.id }, ctx.now);
      const s = arrivalForecast(f, d.tasks, today);
      return {
        today,
        on_time: s.onTime,
        late: s.late,
        needed_minutes: s.neededMinutes,
        available_minutes: s.availableMinutes,
        tasks: s.arrivals.map((a) => ({
          title: a.task.title,
          deadline: a.task.deadline,
          finishes: a.arrives,
          minutes_short: a.short,
          days_to_spare: a.slackDays,
          plan: a.plan.slice(0, 10),
        })),
      };
    },
  },
  {
    name: "recent_nights",
    title: "Recent nights",
    description: "How recent evenings went: minutes focused vs planned, stations completed, how often the route changed.",
    inputSchema: { type: "object", properties: { days: { type: "integer", minimum: 1, maximum: 60, description: "Default 7." } } },
    annotations: { readOnlyHint: true },
    async run(ctx, args) {
      const d = await ctx.get();
      const days = Math.min(60, Math.max(1, Math.round(Number(args.days ?? 7)) || 7));
      const from = addDays(serviceDate(ctx.now), -days + 1);
      const nights = d.journeys
        .filter((j) => j.date >= from && j.startedAt)
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((j) => ({
          date: j.date,
          ended: j.phase === "final",
          focused_minutes: j.focusedMinutes,
          planned_minutes: j.plannedMinutes,
          stations: `${j.stationsCompleted}/${j.stationsPlanned}`,
          route_changes: j.routeChanges,
        }));
      return {
        from,
        nights,
        total_focused_minutes: nights.reduce((s, n) => s + n.focused_minutes, 0),
      };
    },
  },
];
