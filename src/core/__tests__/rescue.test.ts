import { describe, expect, it } from "vitest";
import { worstConflict } from "../allocate";
import { windowProblem } from "../availability";
import * as ops from "../ops";
import { forecast } from "../planner";
import { applyRescue, rescuePlan } from "../rescue";
import { createEmptyData } from "../seed";
import { upcomingOn } from "../sessions";
import { addDays } from "../time";
import { PROFILE_DEFAULTS, type Level, type NocturneData, type StudyWindow } from "../types";

// Saturday, Sep 26 2026, local time.
const at = (h: number, m = 0, day = 26) => new Date(2026, 8, day, h, m);
const TODAY = "2026-09-26";

function traveller(windows: StudyWindow[]): NocturneData {
  const base = createEmptyData({ id: "u", name: "T", timezone: "UTC", createdAt: at(7).toISOString(), preferredCarriage: "rain", autoTunnel: true, ...PROFILE_DEFAULTS });
  return { ...base, windows };
}

const daily = (start: string, end: string): StudyWindow[] =>
  [0, 1, 2, 3, 4, 5, 6].map((d) => ({ id: `w${d}`, userId: "u", dayOfWeek: d, specificDate: null, startTime: start, endTime: end, recurring: true, enabled: true, kind: "available" }));

function add(d: NocturneData, title: string, minutes: number, deadline: string, importance: Level = 3, now = at(13)) {
  return ops.addTask(d, { title, description: "", deadline, estimatedMinutes: minutes, interest: 3, difficulty: 3, importance, splittable: true, minSessionMinutes: 25, maxSessionMinutes: 60, recurrence: null, lineId: null }, now).data;
}

const stillShort = (d: NocturneData, now: Date) =>
  worstConflict(forecast({ tasks: d.tasks, windows: d.windows, sessions: d.sessions, userId: "u", stops: d.profile.shortStops ? "short" : "normal" }, now));

describe("rescue plan", () => {
  it("has nothing to say when everything fits", () => {
    const d = add(traveller(daily("19:00", "22:00")), "essay", 120, addDays(TODAY, 3));
    expect(rescuePlan(d, at(13))).toBeNull();
  });

  it("closes a small gap with shorter stops and a little more time on a few evenings", () => {
    let d = traveller(daily("20:00", "22:00"));
    const due = addDays(TODAY, 4);
    // Five evenings of 2 h ≈ 9 h of focus; 10 h 20 m is due.
    for (const [title, min] of [["math", 240], ["physics", 200], ["english", 180]] as const) d = add(d, title, min, due);
    const plan = rescuePlan(d, at(13))!;
    expect(plan.shortfall).toBeGreaterThan(0);
    expect(plan.left).toBe(0);
    expect(plan.steps.map((s) => s.kind)).toEqual(["shortStops", "extraTime"]);
    const extra = plan.steps.find((s) => s.kind === "extraTime")!;
    if (extra.kind !== "extraTime") throw new Error();
    // A little on several days rather than one long night, each a valid window.
    expect(extra.windows.length).toBeGreaterThan(1);
    for (const w of extra.windows) {
      expect(w.minutes).toBeLessThanOrEqual(90);
      expect(w.start).toBe("22:00");
      expect(windowProblem({ startTime: w.start, endTime: w.end })).toBeNull();
    }
    const applied = applyRescue(d, plan.steps, at(13)).data;
    expect(applied.profile.shortStops).toBe(true);
    expect(stillShort(applied, at(13))).toBeNull();
  });

  it("gets a hopeless day done anyway: less break, later night, shorter tasks, and only then later deadlines", () => {
    let d = traveller([{ id: "today", userId: "u", dayOfWeek: null, specificDate: TODAY, startTime: "07:00", endTime: "23:00", recurring: false, enabled: true, kind: "available" }, ...daily("19:00", "23:00").map((w) => ({ ...w, id: `e${w.id}` }))]);
    for (let i = 0; i < 22; i++) d = add(d, `task ${i}`, 60, TODAY, (i < 4 ? 5 : i < 12 ? 3 : 2) as Level);
    const plan = rescuePlan(d, at(13))!;
    expect(plan.steps.map((s) => s.kind)).toEqual(["shortStops", "extraTime", "trim", "postpone"]);
    expect(plan.left).toBe(0);
    const extra = plan.steps[1];
    if (extra.kind !== "extraTime") throw new Error();
    expect(extra.windows).toEqual([{ date: TODAY, start: "23:00", end: "00:00", minutes: 60 }]);
    // The most important work stays whole and on time.
    const important = d.tasks.filter((t) => t.importance === 5).map((t) => t.id);
    for (const s of plan.steps) {
      if (s.kind === "trim") expect(s.cuts.some((c) => important.includes(c.taskId))).toBe(false);
      if (s.kind === "postpone") expect(s.moves.some((m) => important.includes(m.taskId))).toBe(false);
    }
    const applied = applyRescue(d, plan.steps, at(13)).data;
    expect(stillShort(applied, at(13))).toBeNull();
    expect(upcomingOn(applied.sessions, TODAY).length).toBeGreaterThan(8);
  });
});

describe("rescue plan with nothing planned after today", () => {
  function onlyToday() {
    let d = traveller([{ id: "today", userId: "u", dayOfWeek: null, specificDate: TODAY, startTime: "07:00", endTime: "23:00", recurring: false, enabled: true, kind: "available" }]);
    for (let i = 0; i < 22; i++) d = add(d, `task ${i}`, 60, TODAY, (i < 4 ? 5 : i < 12 ? 3 : 2) as Level);
    return d;
  }

  it("moves what can't be done today to days it gives study time to, soonest first", () => {
    const d = onlyToday();
    const plan = rescuePlan(d, at(13))!;
    expect(plan.left).toBe(0);
    const postpone = plan.steps.find((s) => s.kind === "postpone");
    if (postpone?.kind !== "postpone") throw new Error("no postpone step");
    expect(postpone.windows[0]).toMatchObject({ date: addDays(TODAY, 1), start: "19:00" });
    for (const w of postpone.windows) expect(windowProblem({ startTime: w.start, endTime: w.end })).toBeNull();
    const applied = applyRescue(d, plan.steps, at(13)).data;
    expect(stillShort(applied, at(13))).toBeNull();
  });

  it("never trims the same task twice over", () => {
    const d = onlyToday();
    const plan = rescuePlan(d, at(13))!;
    const trim = plan.steps.find((s) => s.kind === "trim");
    if (trim?.kind !== "trim") throw new Error("no trim step");
    // Apply only the trim, then ask again: those tasks are not trimmed further.
    const after = applyRescue(d, [trim], at(13)).data;
    const again = rescuePlan(after, at(13))!;
    const trimmedIds = new Set(trim.cuts.map((c) => c.taskId));
    for (const s of again.steps) if (s.kind === "trim") expect(s.cuts.some((c) => trimmedIds.has(c.taskId))).toBe(false);
  });
});
