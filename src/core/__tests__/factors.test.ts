/**
 * Every planning factor must move the plan, in the intended direction.
 * Each test changes one factor and compares the outcome.
 */
import { describe, expect, it } from "vitest";
import { allocate } from "../allocate";
import { board, lowFocus, reassessFocus } from "../journey";
import { MAX_HISTORY_NUDGE, type FocusProfile } from "../learning";
import * as ops from "../ops";
import { planToday } from "../planner";
import { rescuePlan } from "../rescue";
import { chunksFor, packOptimized } from "../route";
import { createEmptyData } from "../seed";
import { routeOf, upcomingOn } from "../sessions";
import { addDays, atMinutes } from "../time";
import { PROFILE_DEFAULTS, type FocusLevel, type Level, type NocturneData, type StudySession, type StudyWindow, type Task } from "../types";

// Thursday, Sep 24 2026, local time.
const at = (h: number, m = 0) => new Date(2026, 8, 24, h, m);
const TODAY = "2026-09-24";
const TOMORROW = addDays(TODAY, 1);
const FOCUS: FocusLevel[] = ["low", "steady", "sharp"];

const evenings = (start = "19:40", end = "23:00"): StudyWindow[] =>
  [0, 1, 2, 3, 4, 5, 6].map((d) => ({
    id: `w${d}`,
    userId: "u",
    dayOfWeek: d,
    specificDate: null,
    startTime: start,
    endTime: end,
    recurring: true,
    enabled: true,
    kind: "available",
  }));

function task(p: Partial<Task> & { id: string }): Task {
  return {
    userId: "u",
    title: p.id,
    description: "",
    deadline: TOMORROW,
    estimatedMinutes: 50,
    remainingMinutes: p.estimatedMinutes ?? 50,
    interest: 3 as Level,
    difficulty: 3 as Level,
    importance: 3 as Level,
    splittable: true,
    minSessionMinutes: 25,
    maxSessionMinutes: 60,
    recurrence: null,
    userEstimatedMinutes: null,
    status: "active",
    lineId: null,
    createdAt: at(9).toISOString(),
    updatedAt: at(9).toISOString(),
    completedAt: null,
    ...p,
  };
}

function data(tasks: Task[], windows = evenings(), sessions: StudySession[] = []): NocturneData {
  const base = createEmptyData({
    id: "u",
    name: "T",
    timezone: "UTC",
    createdAt: at(9).toISOString(),
    preferredCarriage: "rain",
    autoTunnel: true,
    ...PROFILE_DEFAULTS,
  });
  return { ...base, tasks, windows, sessions };
}

type PlanExtras = { now?: Date; profile?: FocusProfile | null; sessions?: StudySession[]; focusSince?: Date };

function route(tasks: Task[], focus: FocusLevel, x: PlanExtras = {}): StudySession[] {
  const d = data(tasks, evenings("19:40", "23:30"), x.sessions ?? []);
  const r = planToday(
    { ...d, userId: "u", focusProfile: x.profile ?? null },
    { now: x.now ?? at(19), focus, mode: "reoptimize", reason: "optimize", focusSince: x.focusSince },
  );
  return routeOf(r.sessions, TODAY).filter((s) => s.status === "planned");
}

/** Task ids in the order they first appear on the route. */
const order = (list: StudySession[]) => [...new Set(list.map((s) => s.taskId))];
const longest = (list: StudySession[], id?: string) =>
  Math.max(...list.filter((s) => !id || s.taskId === id).map((s) => s.plannedMinutes));

function done(taskId: string, startMin: number, minutes = 25): StudySession {
  const start = atMinutes(TODAY, startMin).toISOString();
  const end = atMinutes(TODAY, startMin + minutes).toISOString();
  return {
    id: `done-${startMin}`,
    taskId,
    userId: "u",
    date: TODAY,
    sequence: 0,
    stationName: "",
    plannedStart: start,
    plannedEnd: end,
    plannedMinutes: minutes,
    workMinutes: minutes,
    completedMinutes: minutes,
    creditedMinutes: minutes,
    status: "done",
    locked: false,
    actualStart: start,
    actualEnd: end,
    elapsedSeconds: minutes * 60,
    resumedAt: null,
    focusBefore: "steady",
    focusAfter: null,
    endedBy: "complete",
    extendedMinutes: 0,
  };
}

describe("importance", () => {
  it("puts the more important of two otherwise equal tasks first, at every focus level", () => {
    for (const focus of FOCUS) {
      expect(order(route([task({ id: "minor", importance: 1 }), task({ id: "major", importance: 5 })], focus))[0]).toBe("major");
      expect(order(route([task({ id: "minor", importance: 5 }), task({ id: "major", importance: 1 })], focus))[0]).toBe("minor");
    }
  });

  it("decides which of two tasks due the same day is protected when time runs short", () => {
    const pair = (a: Level, b: Level) => [
      task({ id: "a", estimatedMinutes: 200, importance: a }),
      task({ id: "b", estimatedMinutes: 200, importance: b }),
    ];
    // Tonight and tomorrow give 340 focus minutes; 400 are due.
    const f1 = allocate({ tasks: pair(5, 2), windows: evenings(), sessions: [], now: at(12), keepTodayPlan: false });
    expect(f1.unscheduled.a).toBeUndefined();
    expect(f1.unscheduled.b).toBeGreaterThan(0);
    const f2 = allocate({ tasks: pair(2, 5), windows: evenings(), sessions: [], now: at(12), keepTodayPlan: false });
    expect(f2.unscheduled.b).toBeUndefined();
    expect(f2.unscheduled.a).toBeGreaterThan(0);
  });

  it("gives important Someday work the spare time first", () => {
    const someday = (a: Level, b: Level) => [
      task({ id: "a", deadline: null, estimatedMinutes: 100, importance: a }),
      task({ id: "b", deadline: null, estimatedMinutes: 100, importance: b }),
    ];
    const firstDay = (tasks: Task[], id: string) => {
      const f = allocate({ tasks, windows: evenings(), sessions: [], now: at(12), keepTodayPlan: false });
      return f.days.findIndex((d) => (d.allocations[id] ?? 0) > 0);
    };
    expect(firstDay(someday(5, 1), "a")).toBeLessThan(firstDay(someday(5, 1), "b"));
    expect(firstDay(someday(1, 5), "b")).toBeLessThan(firstDay(someday(1, 5), "a"));
  });

  it("is what a rescue plan trims first, and the most important work is never trimmed", () => {
    let d = data([], [{ id: "t", userId: "u", dayOfWeek: null, specificDate: TODAY, startTime: "19:00", endTime: "23:00", recurring: false, enabled: true, kind: "available" }]);
    const levels: Level[] = [5, 4, 2, 3, 2, 5];
    for (const [i, importance] of levels.entries()) d.tasks.push(task({ id: `t${i}`, deadline: TODAY, estimatedMinutes: 60, importance }));
    d = { ...d, tasks: [...d.tasks] };
    const plan = rescuePlan(d, at(13))!;
    const trim = plan.steps.find((s) => s.kind === "trim");
    if (trim?.kind !== "trim") throw new Error("expected a trim step");
    const importanceOf = (id: string) => d.tasks.find((t) => t.id === id)!.importance;
    const trimmed = trim.cuts.map((c) => importanceOf(c.taskId));
    expect(trimmed).toEqual([...trimmed].sort((a, b) => a - b));
    expect(trimmed[0]).toBe(2);
    expect(trimmed).not.toContain(5);
  });
});

describe("deadline", () => {
  it("dominates importance: a closer deadline is placed first no matter how important the later one is", () => {
    const tasks = (later: Level) => [
      task({ id: "soon", estimatedMinutes: 300, deadline: TOMORROW, importance: 1 }),
      task({ id: "later", estimatedMinutes: 200, deadline: addDays(TODAY, 3), importance: later }),
    ];
    const f5 = allocate({ tasks: tasks(5), windows: evenings(), sessions: [], now: at(12), keepTodayPlan: false });
    const f1 = allocate({ tasks: tasks(1), windows: evenings(), sessions: [], now: at(12), keepTodayPlan: false });
    expect(f5.unscheduled.soon).toBeUndefined();
    expect(f5.days[0].allocations.soon).toBeGreaterThan(f5.days[0].allocations.later ?? 0);
    // Importance never reorders different deadlines.
    expect(f5.days.map((d) => d.allocations)).toEqual(f1.days.map((d) => d.allocations));
  });

  it("puts tonight's due work ahead of less urgent work when all else is equal", () => {
    const tasks = [task({ id: "later", deadline: addDays(TODAY, 2), estimatedMinutes: 100 }), task({ id: "due", deadline: TODAY, estimatedMinutes: 50 })];
    for (const focus of FOCUS) expect(order(route(tasks, focus))[0]).toBe("due");
  });

  it("under Low focus, all of tonight's due work comes before work due later, however hard it is", () => {
    const tasks = [
      task({ id: "hardDue", deadline: TODAY, difficulty: 5, interest: 1, estimatedMinutes: 60 }),
      task({ id: "easyLater", deadline: addDays(TODAY, 3), difficulty: 1, interest: 5, estimatedMinutes: 150 }),
    ];
    const low = route(tasks, "low");
    expect(low.some((s) => s.taskId === "easyLater")).toBe(true);
    expect(low[0].taskId).toBe("hardDue");
    const lastDue = Math.max(...low.map((s, i) => (s.taskId === "hardDue" ? i : -1)));
    const firstLater = low.findIndex((s) => s.taskId === "easyLater");
    expect(lastDue).toBeLessThan(firstLater);
  });

  it("under Low focus, tonight's due work still eases in lighter-first", () => {
    const tasks = [
      task({ id: "hardDue", deadline: TODAY, difficulty: 5, interest: 1, estimatedMinutes: 50 }),
      task({ id: "easyDue", deadline: TODAY, difficulty: 1, interest: 5, estimatedMinutes: 50 }),
    ];
    expect(route(tasks, "low")[0].taskId).toBe("easyDue");
  });

  it("never lets work that could wait push tonight's due work off the route", () => {
    const due = task({ id: "due", deadline: TODAY, difficulty: 5, interest: 1, importance: 1, estimatedMinutes: 60 });
    const a = task({ id: "a", deadline: addDays(TODAY, 3), difficulty: 1, interest: 5, importance: 5, estimatedMinutes: 60 });
    const b = task({ id: "b", deadline: addDays(TODAY, 3), difficulty: 1, interest: 5, importance: 5, estimatedMinutes: 60 });
    const tasks = new Map([due, a, b].map((t) => [t.id, t]));
    for (const focus of FOCUS) {
      const chunks = [due, a, b].flatMap((t) => chunksFor(t, 60, focus));
      // 130 minutes cannot hold all 180: the less urgent work is what waits.
      const r = packOptimized(chunks, [{ start: 1180, end: 1310 }], { date: TODAY, focus, tasks }, () => 25);
      const placed = r.slots.filter((s) => s.taskId === "due").reduce((sum, s) => sum + s.work, 0);
      expect(placed).toBe(60);
      expect(r.overflow.every((c) => c.taskId !== "due")).toBe(true);
    }
  });
});

describe("difficulty and interest", () => {
  const four = () => [
    task({ id: "hardest", difficulty: 5, interest: 2 }),
    task({ id: "mid", difficulty: 3 }),
    task({ id: "lighter", difficulty: 2 }),
    task({ id: "easy", difficulty: 1, interest: 4 }),
  ];

  it("puts the most demanding work first while the traveller is fresh, not at the end of the night", () => {
    expect(order(route(four(), "steady"))[0]).toBe("hardest");
    expect(order(route(four(), "sharp"))[0]).toBe("hardest");
    const low = order(route(four(), "low"));
    expect(low[0]).toBe("easy");
    expect(low.indexOf("hardest")).toBeGreaterThan(low.indexOf("easy"));
  });

  it("difficulty alone: hard first when steady or sharp, easy first when low", () => {
    const tasks = [task({ id: "hard", difficulty: 5 }), task({ id: "easy", difficulty: 1 })];
    expect(order(route(tasks, "sharp"))[0]).toBe("hard");
    expect(order(route(tasks, "steady"))[0]).toBe("hard");
    expect(order(route(tasks, "low"))[0]).toBe("easy");
  });

  it("interest alone: the appealing task opens a low-focus night, the avoided one goes early otherwise", () => {
    const tasks = [task({ id: "boring", interest: 1 }), task({ id: "fun", interest: 5 })];
    expect(order(route(tasks, "low"))[0]).toBe("fun");
    expect(order(route(tasks, "steady"))[0]).toBe("boring");
    expect(order(route(tasks, "sharp"))[0]).toBe("boring");
  });
});

describe("focus level", () => {
  it("sets station length: short when low, longest when sharp", () => {
    const tasks = [task({ id: "hard", difficulty: 4, estimatedMinutes: 120, maxSessionMinutes: 90 })];
    const low = longest(route(tasks, "low"));
    const steady = longest(route(tasks, "steady"));
    const sharp = longest(route(tasks, "sharp"));
    expect(low).toBeLessThanOrEqual(30);
    expect(steady).toBeGreaterThan(low);
    expect(sharp).toBeGreaterThan(steady);
  });

  it("re-plans mid-journey: Low Focus shortens and lightens the rest, a Sharp signal restores it", () => {
    const tasks = [
      task({ id: "hard", difficulty: 5, interest: 2, estimatedMinutes: 100, minSessionMinutes: 15 }),
      task({ id: "mid", difficulty: 3, estimatedMinutes: 60, minSessionMinutes: 15 }),
      task({ id: "easy", difficulty: 1, interest: 5, estimatedMinutes: 30, minSessionMinutes: 15 }),
    ];
    let d = data(tasks, evenings("19:40", "23:30"));
    d = { ...d, sessions: planToday({ ...d, userId: "u" }, { now: at(19), focus: "steady", mode: "reoptimize", reason: "initial" }).sessions };
    d = board(d, { focus: "steady", carriage: "rain" }, at(19, 40)).data;
    const steadyRest = upcomingOn(d.sessions, TODAY);
    expect(longest(steadyRest)).toBeGreaterThan(30);

    d = lowFocus(d, at(20)).data;
    const lowRest = upcomingOn(d.sessions, TODAY);
    expect(d.journeys[0].focus).toBe("low");
    expect(longest(lowRest)).toBeLessThanOrEqual(30);
    expect(lowRest[0].taskId).toBe("easy");

    d = reassessFocus(d, at(20, 5), "sharp").data;
    const sharpRest = upcomingOn(d.sessions, TODAY);
    expect(longest(sharpRest)).toBeGreaterThan(30);
    // Hard work comes back ahead of the light work (not straight after its own interrupted station).
    expect(order(sharpRest).indexOf("hard")).toBeLessThan(order(sharpRest).indexOf("easy"));
    expect(sharpRest[0].taskId).not.toBe("easy");
  });

  it("keeps a focus reported in Optimize for the rest of the night", () => {
    const tasks = [task({ id: "a", difficulty: 2, estimatedMinutes: 100 }), task({ id: "b", difficulty: 2, estimatedMinutes: 60 })];
    let d = data(tasks, evenings("19:40", "23:30"));
    d = { ...d, sessions: planToday({ ...d, userId: "u" }, { now: at(19), focus: "steady", mode: "reoptimize", reason: "initial" }).sessions };
    d = board(d, { focus: "steady", carriage: "rain" }, at(19, 40)).data;
    d = ops.replan(d, "optimize", at(19, 45), { focus: "low" }).data;
    expect(d.journeys[0].focus).toBe("low");
    expect(longest(upcomingOn(d.sessions, TODAY))).toBeLessThanOrEqual(30);
    // A later task edit re-plans for the focus the traveller reported, not the boarding one.
    d = ops.editTask(d, "b", { importance: 4 }, at(19, 50)).data;
    expect(longest(upcomingOn(d.sessions, TODAY))).toBeLessThanOrEqual(30);
  });

  it("carries the evening's fatigue into a re-plan until focus is reported again", () => {
    // "avoided": important but unappealing; it only earns its fresh-start boost early in the night.
    const tasks = [
      task({ id: "avoided", difficulty: 1, interest: 1, importance: 4 }),
      task({ id: "core", difficulty: 3, interest: 3, importance: 5 }),
      task({ id: "earlier", deadline: TODAY, status: "done", remainingMinutes: 0 }),
    ];
    const now = at(21, 30);
    const ridden = [done("earlier", 19 * 60 + 40), done("earlier", 20 * 60 + 10), done("earlier", 20 * 60 + 40)];
    expect(order(route(tasks, "steady", { now }))[0]).toBe("avoided");
    expect(order(route(tasks, "steady", { now, sessions: ridden }))[0]).toBe("core");
    // A fresh report resets it.
    expect(order(route(tasks, "steady", { now, sessions: ridden, focusSince: now }))[0]).toBe("avoided");
  });
});

describe("learned focus pattern", () => {
  const profileGoodAt = (hour: number): FocusProfile => ({
    ready: true,
    sessions: 40,
    days: 14,
    hours: [{ hour, sessions: 10, completion: 1, hardSessions: 10, hardCompletion: 1, focus: null }],
    overallCompletion: 0.7,
    overallHardCompletion: 0.5,
    bestHardWindow: [hour, hour + 1],
    fadesAfter: null,
    rates: { finishEarly: 0, moreTime: 0, lowFocus: 0 },
    completionByDifficulty: {},
    postponedByInterest: {},
    weekday: [0, 0, 0, 0, 0, 0, 0],
    underestimated: [],
  });
  // Nearly the same demand (the other task is slightly more demanding), but
  // only "hard" counts as hard work for history.
  const pair = (hardImportance: Level) => [
    task({ id: "hard", difficulty: 4, interest: 5, importance: hardImportance }),
    task({ id: "other", difficulty: 3, interest: 2, importance: 3 }),
  ];

  it("breaks a near-tie toward the hour hard work usually goes well", () => {
    expect(order(route(pair(3), "steady"))[0]).toBe("other");
    expect(order(route(pair(3), "steady", { profile: profileGoodAt(19) }))[0]).toBe("hard");
    // Only at that hour: planned from 21:00 it changes nothing.
    expect(order(route(pair(3), "steady", { profile: profileGoodAt(19), now: at(21) }))[0]).toBe("other");
  });

  it("is weaker than one step of importance", () => {
    expect(MAX_HISTORY_NUDGE).toBeLessThan(0.6 / 4);
    expect(order(route(pair(2), "steady", { profile: profileGoodAt(19) }))[0]).toBe("other");
  });
});

describe("estimate calibration", () => {
  it("an accepted calibrated estimate is what the planner schedules", () => {
    const d = data([task({ id: "a", estimatedMinutes: 60, deadline: TODAY })]);
    const planned = (x: NocturneData) =>
      routeOf(ops.replan(x, "task-change", at(19)).data.sessions, TODAY).reduce((sum, s) => sum + s.workMinutes, 0);
    const calibrated = ops.editTask(d, "a", { estimatedMinutes: 85, userEstimatedMinutes: 60 }, at(19)).data;
    expect(planned(d)).toBe(60);
    expect(planned(calibrated)).toBe(85);
  });
});
