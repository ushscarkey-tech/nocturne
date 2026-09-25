import { describe, expect, it } from "vitest";
import { allocate, worstConflict } from "../allocate";
import { availabilityForDate } from "../availability";
import { arrive, board, depart, endJourney, finishEarly, issueTicket, lowFocus, needMoreTime } from "../journey";
import { planToday } from "../planner";
import { createSeedData, createEmptyData } from "../seed";
import { activeSession, routeOf, sessionsOn } from "../sessions";
import { summarizeJourney } from "../stats";
import { addDays, minutesFrom, toDateKey } from "../time";
import type { Level, NocturneData, StudySession, StudyWindow, Task } from "../types";

// Thursday, Sep 24 2026, local time.
const at = (h: number, m = 0, day = 24) => new Date(2026, 8, day, h, m);
const TODAY = "2026-09-24";

function win(day: number | null, start: string, end: string, extra: Partial<StudyWindow> = {}): StudyWindow {
  return {
    id: `${day}-${start}-${extra.specificDate ?? ""}`,
    userId: "u",
    dayOfWeek: day,
    specificDate: null,
    startTime: start,
    endTime: end,
    recurring: day !== null,
    enabled: true,
    kind: "available",
    ...extra,
  };
}

const everyEvening = [0, 1, 2, 3, 4, 5, 6].map((d) => win(d, "19:40", "23:00")); // 200 focus minutes

function task(partial: Partial<Task> & { id: string }): Task {
  return {
    userId: "u",
    title: partial.id,
    description: "",
    deadline: null,
    estimatedMinutes: 60,
    remainingMinutes: partial.estimatedMinutes ?? 60,
    interest: 3 as Level,
    difficulty: 3 as Level,
    importance: 3 as Level,
    splittable: true,
    minSessionMinutes: 25,
    maxSessionMinutes: 60,
    recurrence: null,
    status: "active",
    lineId: null,
    createdAt: at(9).toISOString(),
    updatedAt: at(9).toISOString(),
    completedAt: null,
    ...partial,
  };
}

function data(tasks: Task[], windows = everyEvening, sessions: StudySession[] = []): NocturneData {
  const base = createEmptyData({
    id: "u",
    name: "T",
    timezone: "UTC",
    createdAt: at(9).toISOString(),
    preferredCarriage: "rain",
    autoTunnel: true,
  });
  return { ...base, tasks, windows, sessions };
}

function assertNoOverlap(list: StudySession[]) {
  const sorted = [...list].sort((a, b) => a.plannedStart.localeCompare(b.plannedStart));
  for (let i = 1; i < sorted.length; i++) {
    expect(new Date(sorted[i].plannedStart).getTime()).toBeGreaterThanOrEqual(new Date(sorted[i - 1].plannedEnd).getTime());
  }
}

describe("availability", () => {
  it("combines weekly windows, one-off additions and blocked exceptions", () => {
    const windows = [
      win(4, "17:00", "18:30"),
      win(4, "19:40", "23:30"),
      win(null, "20:00", "21:00", { specificDate: TODAY, kind: "blocked" }),
      win(null, "10:00", "11:00", { specificDate: TODAY }),
    ];
    expect(availabilityForDate(windows, TODAY)).toEqual([
      { start: 600, end: 660 },
      { start: 1020, end: 1110 },
      { start: 1180, end: 1200 },
      { start: 1260, end: 1410 },
    ]);
  });
});

describe("long-term allocation", () => {
  it("spreads a large task before its deadline and keeps the deadline day as buffer", () => {
    const t = task({ id: "bio", estimatedMinutes: 360, maxSessionMinutes: 90, deadline: addDays(TODAY, 4) });
    const f = allocate({ tasks: [t], windows: everyEvening, sessions: [], now: at(12), keepTodayPlan: false });
    const perDay = f.days.slice(0, 5).map((d) => d.allocations.bio ?? 0);
    expect(perDay.reduce((a, b) => a + b, 0)).toBe(360);
    expect(perDay[4]).toBe(0); // buffer
    expect(Math.max(...perDay)).toBeLessThanOrEqual(90);
    expect(f.conflicts).toHaveLength(0);
  });

  it("reports a route conflict instead of silently overbooking", () => {
    const t1 = task({ id: "a", estimatedMinutes: 500, deadline: addDays(TODAY, 1) });
    const t2 = task({ id: "b", estimatedMinutes: 400, deadline: addDays(TODAY, 1) });
    const f = allocate({ tasks: [t1, t2], windows: everyEvening, sessions: [], now: at(12), keepTodayPlan: false });
    const c = worstConflict(f)!;
    // 19:40–23:00 is 200 minutes, 170 of focus once Station Stops are counted.
    expect(c.availableMinutes).toBe(340);
    expect(c.requiredMinutes).toBe(900);
    expect(c.shortfallMinutes).toBe(560);
  });

  it("schedules recurring work on matching days", () => {
    const vocab = task({ id: "v", estimatedMinutes: 30, recurrence: { freq: "weekly", days: [1, 3, 5] } });
    const f = allocate({ tasks: [vocab], windows: everyEvening, sessions: [], now: at(12), keepTodayPlan: false });
    const days = f.days.slice(0, 7).filter((d) => d.allocations.v).map((d) => new Date(d.date + "T12:00").getDay());
    expect(days.sort()).toEqual([1, 3, 5]);
  });
});

describe("tonight's route", () => {
  it("builds stations inside Service Time with stops between them", () => {
    const d = data([
      task({ id: "math", estimatedMinutes: 120, deadline: addDays(TODAY, 1), difficulty: 5 }),
      task({ id: "bio", estimatedMinutes: 40, deadline: addDays(TODAY, 1), difficulty: 2, interest: 4 }),
    ]);
    const r = planToday({ ...d, userId: "u" }, { now: at(18), focus: "steady", mode: "reoptimize", reason: "initial" });
    const route = routeOf(r.sessions, TODAY);
    expect(route.length).toBeGreaterThanOrEqual(3);
    assertNoOverlap(route);
    for (const s of route) {
      expect(minutesFrom(TODAY, s.plannedStart)).toBeGreaterThanOrEqual(19 * 60 + 40);
      expect(minutesFrom(TODAY, s.plannedEnd)).toBeLessThanOrEqual(23 * 60);
    }
    expect(route.filter((s) => s.taskId === "math").reduce((a, s) => a + s.workMinutes, 0)).toBe(120);
  });

  it("prefers easier, more interesting work when focus is low", () => {
    const d = data([
      task({ id: "hard", estimatedMinutes: 50, deadline: addDays(TODAY, 1), difficulty: 5, interest: 1 }),
      task({ id: "easy", estimatedMinutes: 30, deadline: addDays(TODAY, 1), difficulty: 1, interest: 5 }),
    ]);
    const low = planToday({ ...d, userId: "u" }, { now: at(19), focus: "low", mode: "reoptimize", reason: "initial" });
    const sharp = planToday({ ...d, userId: "u" }, { now: at(19), focus: "sharp", mode: "reoptimize", reason: "initial" });
    expect(routeOf(low.sessions, TODAY)[0].taskId).toBe("easy");
    expect(routeOf(sharp.sessions, TODAY)[0].taskId).toBe("hard");
  });

  it("never moves locked stations", () => {
    const d = data([
      task({ id: "a", estimatedMinutes: 90, deadline: addDays(TODAY, 1) }),
      task({ id: "b", estimatedMinutes: 60, deadline: addDays(TODAY, 1) }),
    ]);
    const first = planToday({ ...d, userId: "u" }, { now: at(18), focus: "steady", mode: "reoptimize", reason: "initial" });
    const target = routeOf(first.sessions, TODAY)[1];
    const locked = first.sessions.map((s) => (s.id === target.id ? { ...s, locked: true } : s));
    const again = planToday({ ...d, sessions: locked, userId: "u" }, { now: at(19, 50), focus: "low", mode: "reoptimize", reason: "optimize" });
    const kept = again.sessions.find((s) => s.id === target.id)!;
    expect(kept.plannedStart).toBe(target.plannedStart);
    expect(kept.plannedEnd).toBe(target.plannedEnd);
    assertNoOverlap(routeOf(again.sessions, TODAY));
  });
});

describe("journey vertical slice", () => {
  it("boards, adapts to low focus, finishes and issues a ticket", () => {
    const d0 = data([
      task({ id: "math", title: "Math", estimatedMinutes: 60, deadline: addDays(TODAY, 1), difficulty: 5, interest: 2, importance: 5 }),
      task({ id: "bio", title: "Biology", estimatedMinutes: 40, deadline: addDays(TODAY, 1), difficulty: 2, interest: 4 }),
      task({ id: "report", title: "Report", estimatedMinutes: 50, deadline: addDays(TODAY, 1), difficulty: 3, interest: 3 }),
    ]);
    const planned = planToday({ ...d0, userId: "u" }, { now: at(19), focus: "steady", mode: "reoptimize", reason: "initial" });
    let d: NocturneData = { ...d0, sessions: planned.sessions };

    // Board at departure with Sharp focus: math (hard) goes first.
    let r = board(d, { focus: "sharp", carriage: "rain" }, at(19, 40));
    d = r.data;
    expect(d.journeys[0].phase).toBe("cabin");
    const current = activeSession(d.sessions)!;
    expect(current.taskId).toBe("math");

    // 30 minutes in, focus drops.
    r = lowFocus(d, at(20, 10));
    d = r.data;
    const closed = d.sessions.find((s) => s.id === current.id)!;
    expect(closed.status).toBe("partial");
    expect(closed.completedMinutes).toBe(30);
    expect(d.tasks.find((t) => t.id === "math")!.remainingMinutes).toBe(30);
    expect(r.change?.headline).toBe("Route updated");
    expect(r.change?.lines.join(" ")).toMatch(/remaining 30m of Math/);
    expect(d.journeys[0].phase).toBe("stop");
    expect(d.journeys[0].routeChanges).toBe(1);

    const upcoming = sessionsOn(d.sessions, TODAY).filter((s) => s.status === "planned");
    expect(upcoming[0].taskId).not.toBe("math"); // lighter work first
    expect(upcoming.some((s) => s.taskId === "math")).toBe(true); // math later
    assertNoOverlap(routeOf(d.sessions, TODAY));

    // Ride out the rest of the route.
    let clock = at(20, 20);
    for (let guard = 0; guard < 10 && d.journeys[0].phase !== "final"; guard++) {
      r = depart(d, clock);
      d = r.data;
      const s = activeSession(d.sessions)!;
      clock = new Date(clock.getTime() + s.plannedMinutes * 60_000);
      d = arrive(d, clock).data;
      clock = new Date(clock.getTime() + 5 * 60_000);
    }
    expect(d.journeys[0].phase).toBe("final");
    expect(d.tasks.every((t) => t.status === "done")).toBe(true);

    const { data: withTicket, ticket } = issueTicket(d, d.journeys[0].id, clock);
    expect(ticket.serial).toBe("0924");
    const summary = summarizeJourney(withTicket, withTicket.journeys[0]);
    expect(summary.focusedMinutes).toBe(30 + 40 + 50 + 30);
    expect(withTicket.journeys[0].completedAt).not.toBeNull();
  });

  it("need more time pushes later stations and finish early pulls them in", () => {
    const d0 = data([
      task({ id: "a", estimatedMinutes: 50, deadline: addDays(TODAY, 1) }),
      task({ id: "b", estimatedMinutes: 50, deadline: addDays(TODAY, 1) }),
    ]);
    let d: NocturneData = { ...d0, sessions: planToday({ ...d0, userId: "u" }, { now: at(19), focus: "steady", mode: "reoptimize", reason: "initial" }).sessions };
    d = board(d, { focus: "steady", carriage: "quiet" }, at(19, 40)).data;
    const nextBefore = sessionsOn(d.sessions, TODAY).find((s) => s.status === "planned")!;
    d = needMoreTime(d, at(20, 20), 15).data;
    const nextAfter = d.sessions.find((s) => s.id === nextBefore.id)!;
    expect(new Date(nextAfter.plannedStart).getTime() - new Date(nextBefore.plannedStart).getTime()).toBe(15 * 60_000);

    const r = finishEarly(d, at(20, 25), false);
    const pulled = r.data.sessions.find((s) => s.id === nextBefore.id)!;
    expect(new Date(pulled.plannedStart).getTime()).toBeLessThan(new Date(nextAfter.plannedStart).getTime());
    expect(r.change?.lines.join(" ")).toMatch(/Ahead of schedule/);
  });

  it("ends early without losing banked progress", () => {
    const d0 = data([task({ id: "a", estimatedMinutes: 60, deadline: addDays(TODAY, 1) })]);
    let d: NocturneData = { ...d0, sessions: planToday({ ...d0, userId: "u" }, { now: at(19), focus: "steady", mode: "reoptimize", reason: "initial" }).sessions };
    d = board(d, { focus: "steady", carriage: "moon" }, at(19, 40)).data;
    d = endJourney(d, at(20)).data;
    expect(d.tasks[0].remainingMinutes).toBe(40);
    expect(d.journeys[0].phase).toBe("final");
  });
});

describe("seed data", () => {
  it("produces a believable evening route", () => {
    const now = at(16, 30);
    const seed = createSeedData(now);
    const route = routeOf(seed.sessions, toDateKey(now));
    expect(route.length).toBeGreaterThanOrEqual(4);
    assertNoOverlap(route);
    expect(seed.tickets.length).toBeGreaterThan(3);
    const f = allocate({ tasks: seed.tasks, windows: seed.windows, sessions: seed.sessions, now, keepTodayPlan: true });
    expect(f.conflicts).toHaveLength(0);
  });
});

describe("ending early", () => {
  it("returns unreached stations to the planner and never calls it time gained", () => {
    const d0 = data([
      task({ id: "a", estimatedMinutes: 60, deadline: addDays(TODAY, 3) }),
      task({ id: "b", estimatedMinutes: 60, deadline: addDays(TODAY, 1) }),
    ]);
    let d: NocturneData = { ...d0, sessions: planToday({ ...d0, userId: "u" }, { now: at(19), focus: "steady", mode: "reoptimize", reason: "initial" }).sessions };
    d = board(d, { focus: "steady", carriage: "moon" }, at(19, 40)).data;
    d = endJourney(d, at(20)).data;
    expect(sessionsOn(d.sessions, TODAY).some((s) => s.status === "planned")).toBe(false);
    const f = allocate({ tasks: d.tasks, windows: d.windows, sessions: d.sessions, now: at(20, 5), keepTodayPlan: true });
    const later = f.days.slice(1).reduce((sum, day) => sum + (day.allocations.a ?? 0) + (day.allocations.b ?? 0), 0);
    expect(later).toBeGreaterThan(0);
    expect(summarizeJourney(d, d.journeys[0]).delayMinutes).toBeGreaterThanOrEqual(0);
  });
});
