import { describe, expect, it } from "vitest";
import { calibrate, focusProfile, isSimilar, schedulingProfile, similarityKey, suggestFeel } from "../learning";
import { planToday } from "../planner";
import { createEmptyData } from "../seed";
import { routeOf } from "../sessions";
import { addDays, atMinutes } from "../time";
import { PROFILE_DEFAULTS, type NocturneData, type SessionEnd, type StudySession, type Task } from "../types";

const TODAY = "2026-09-25";
const now = new Date(2026, 8, 25, 19, 0);
let seq = 0;

function task(p: Partial<Task> & { title: string }): Task {
  return {
    id: `t${++seq}`,
    userId: "u",
    description: "",
    deadline: null,
    estimatedMinutes: 60,
    userEstimatedMinutes: null,
    remainingMinutes: 60,
    interest: 3,
    difficulty: 3,
    importance: 3,
    splittable: true,
    minSessionMinutes: 25,
    maxSessionMinutes: 60,
    recurrence: null,
    status: "active",
    lineId: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    completedAt: null,
    ...p,
  };
}

function session(t: Task, date: string, startMin: number, work: number, actual: number, endedBy: SessionEnd = "complete"): StudySession {
  const start = atMinutes(date, startMin).toISOString();
  return {
    id: `s${++seq}`,
    taskId: t.id,
    userId: "u",
    date,
    sequence: 0,
    stationName: "",
    plannedStart: start,
    plannedEnd: atMinutes(date, startMin + actual).toISOString(),
    plannedMinutes: actual,
    workMinutes: work,
    completedMinutes: actual,
    creditedMinutes: endedBy === "low-focus" ? Math.round(actual * 0.5) : work,
    status: endedBy === "low-focus" ? "partial" : "done",
    locked: false,
    actualStart: start,
    actualEnd: atMinutes(date, startMin + actual).toISOString(),
    elapsedSeconds: actual * 60,
    resumedAt: null,
    focusBefore: "steady",
    focusAfter: null,
    endedBy,
    extendedMinutes: Math.max(0, actual - work),
  };
}

function data(tasks: Task[], sessions: StudySession[], profile: Partial<typeof PROFILE_DEFAULTS> = {}): NocturneData {
  const base = createEmptyData({
    id: "u",
    name: "T",
    timezone: "UTC",
    createdAt: "2026-09-01T00:00:00.000Z",
    preferredCarriage: "rain",
    autoTunnel: true,
    ...PROFILE_DEFAULTS,
    ...profile,
  });
  return { ...base, windows: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ id: `w${d}`, userId: "u", dayOfWeek: d, specificDate: null, startTime: "19:40", endTime: "23:30", recurring: true, enabled: true, kind: "available" as const })), tasks, sessions };
}

describe("task similarity", () => {
  it("groups the same subject and kind of work across wording and languages", () => {
    expect(isSimilar({ title: "수학 문제풀이", lineId: null }, { title: "수학 오답", lineId: null })).toBe(true);
    expect(isSimilar({ title: "수학 문제집 3단원", lineId: null }, { title: "Math problem set", lineId: null })).toBe(true);
    expect(isSimilar({ title: "수학 문제집", lineId: null }, { title: "수학 개념 정리", lineId: null })).toBe(false);
    expect(isSimilar({ title: "수학 문제풀이", lineId: null }, { title: "영어 단어 암기", lineId: null })).toBe(false);
    expect(similarityKey({ title: "잡일", lineId: null })).toBeNull();
  });
});

describe("estimate calibration", () => {
  const done = (title: string, estimate: number, actuals: number[]) => {
    const t = task({ title, estimatedMinutes: estimate, remainingMinutes: 0, status: "done" });
    return { t, sessions: actuals.map((a, i) => session(t, addDays(TODAY, -3 - i), 20 * 60, estimate / actuals.length, a)) };
  };

  it("suggests more time when similar work reliably runs long", () => {
    const parts = [done("수학 문제집 1", 60, [85]), done("수학 오답 정리", 60, [80]), done("Math problem set", 60, [90])];
    const d = data(parts.map((p) => p.t), parts.flatMap((p) => p.sessions));
    const c = calibrate(d, { title: "수학 문제풀이 4단원", lineId: null }, 60)!;
    expect(c).not.toBeNull();
    expect(c.suggestedMinutes).toBe(85);
    expect(c.basis).toBe("tasks");
    // An open similar task with no history is never named as the example.
    const open = { ...parts[0].t, id: "open", title: "미적분 기출 풀이", status: "active" as const, updatedAt: "2026-09-30T00:00:00.000Z" };
    const withOpen = data([...parts.map((p) => p.t), open], parts.flatMap((p) => p.sessions));
    expect(calibrate(withOpen, { title: "수학 문제풀이 4단원", lineId: null }, 60)!.example).not.toBe("미적분 기출 풀이");
  });

  it("stays quiet with too little, erratic or unrelated history", () => {
    const two = [done("수학 문제집 1", 60, [85]), done("수학 오답", 60, [85])];
    expect(calibrate(data(two.map((p) => p.t), two.flatMap((p) => p.sessions)), { title: "수학 문제집", lineId: null }, 60)).toBeNull();
    const erratic = [done("수학 문제 A", 60, [30]), done("수학 문제 B", 60, [120]), done("수학 문제 C", 60, [65])];
    expect(calibrate(data(erratic.map((p) => p.t), erratic.flatMap((p) => p.sessions)), { title: "수학 문제", lineId: null }, 60)).toBeNull();
    const parts = [done("수학 문제집 1", 60, [85]), done("수학 오답", 60, [80]), done("수학 문제", 60, [90])];
    const d = data(parts.map((p) => p.t), parts.flatMap((p) => p.sessions));
    expect(calibrate(d, { title: "영어 단어 암기", lineId: null }, 60)).toBeNull();
    expect(calibrate({ ...d, profile: { ...d.profile, autoAdjustEstimates: false } }, { title: "수학 문제", lineId: null }, 60)).toBeNull();
  });
});

describe("focus pattern", () => {
  // Two weeks: hard math finished around 20:00, cut short after 22:30.
  function history() {
    const hard = task({ title: "수학 문제풀이", difficulty: 5, status: "done", remainingMinutes: 0 });
    const easy = task({ title: "영어 단어 암기", difficulty: 1, status: "done", remainingMinutes: 0 });
    const sessions: StudySession[] = [];
    for (let i = 1; i <= 12; i++) {
      const date = addDays(TODAY, -i);
      sessions.push(session(hard, date, 20 * 60, 50, 50));
      sessions.push(session(hard, date, 22 * 60 + 40, 50, 20, "low-focus"));
      sessions.push(session(easy, date, 21 * 60 + 30, 30, 30));
    }
    return { tasks: [hard, easy], sessions };
  }

  it("does not infer anything from a handful of sessions", () => {
    const h = history();
    const thin = data(h.tasks, h.sessions.slice(0, 4));
    expect(focusProfile(thin, now).ready).toBe(false);
    expect(schedulingProfile(thin, now)).toBeNull();
  });

  it("finds the best hour for hard work and when focus fades", () => {
    const h = history();
    const p = focusProfile(data(h.tasks, h.sessions), now);
    expect(p.ready).toBe(true);
    expect(p.bestHardWindow?.[0]).toBe(20);
    expect(p.fadesAfter).toBe(22);
    expect(p.rates.lowFocus).toBeGreaterThan(0.3);
  });

  it("moves demanding work toward its good hours, and stops when switched off", () => {
    const h = history();
    const hardToday = task({ title: "수학 문제집 5단원", difficulty: 5, interest: 3, importance: 3, estimatedMinutes: 50, remainingMinutes: 50, deadline: addDays(TODAY, 1) });
    const mid = task({ title: "화학 보고서", difficulty: 3, interest: 3, importance: 3, estimatedMinutes: 50, remainingMinutes: 50, deadline: addDays(TODAY, 1) });
    const light = task({ title: "독서", difficulty: 2, interest: 4, importance: 3, estimatedMinutes: 50, remainingMinutes: 50, deadline: addDays(TODAY, 1) });
    const withHistory = data([...h.tasks, hardToday, mid, light], h.sessions);
    const plan = (d: NocturneData) =>
      routeOf(planToday({ ...d, userId: "u", focusProfile: schedulingProfile(d, now) }, { now, focus: "steady", mode: "reoptimize", reason: "optimize" }).sessions, TODAY);
    const learned = plan(withHistory);
    const off = plan({ ...withHistory, profile: { ...withHistory.profile, useFocusHistory: false } });
    const startOf = (route: StudySession[]) => route.find((s) => s.taskId === hardToday.id)!.plannedStart;
    expect(new Date(startOf(learned)).getHours()).toBe(20);
    expect(startOf(learned) <= startOf(off)).toBe(true);
    // The general planner alone would not have put it there first.
    expect(startOf(learned) < startOf(off)).toBe(true);
    // With the switch off the planner is exactly the general one.
    const general = routeOf(planToday({ ...withHistory, userId: "u" }, { now, focus: "steady", mode: "reoptimize", reason: "optimize" }).sessions, TODAY);
    expect(off.map((s) => s.taskId)).toEqual(general.map((s) => s.taskId));
  });
});

describe("how a new task feels", () => {
  it("fills interest, difficulty and importance from similar tasks", () => {
    const d = data(
      [
        task({ title: "수학 문제집 1단원", interest: 2, difficulty: 4, importance: 4 }),
        task({ title: "Math problem set 2", interest: 2, difficulty: 5, importance: 4 }),
        task({ title: "영어 에세이", interest: 5, difficulty: 2, importance: 2 }),
      ],
      [],
    );
    const s = suggestFeel(d, { title: "수학 문제풀이 3단원", lineId: null })!;
    expect(s).not.toBeNull();
    expect(s.interest).toBe(2);
    expect(s.difficulty).toBeGreaterThanOrEqual(4);
    expect(s.importance).toBe(4);
    expect(s.samples).toBe(2);
  });

  it("does not guess from one similar task, or when learning is off", () => {
    const one = data([task({ title: "수학 문제집 1단원", interest: 2 })], []);
    expect(suggestFeel(one, { title: "수학 문제풀이", lineId: null })).toBeNull();
    const off = data([task({ title: "수학 문제집 1" }), task({ title: "수학 문제집 2" })], [], { learnFromSessions: false });
    expect(suggestFeel(off, { title: "수학 문제풀이", lineId: null })).toBeNull();
  });
});
