import { describe, expect, it } from "vitest";
import { allocate } from "../allocate";
import { arrivalForecast } from "../arrival";
import { addDays } from "../time";
import type { StudyWindow, Task } from "../types";

const at = (h: number) => new Date(2026, 8, 24, h, 0);
const TODAY = "2026-09-24";
const evenings: StudyWindow[] = [0, 1, 2, 3, 4, 5, 6].map((d) => ({
  id: `w${d}`,
  userId: "u",
  dayOfWeek: d,
  specificDate: null,
  startTime: "19:40",
  endTime: "23:00",
  recurring: true,
  enabled: true,
  kind: "available",
}));

function task(id: string, minutes: number, deadline: string | null): Task {
  return {
    id,
    userId: "u",
    title: id,
    description: "",
    deadline,
    estimatedMinutes: minutes,
    userEstimatedMinutes: null,
    remainingMinutes: minutes,
    interest: 3,
    difficulty: 3,
    importance: 3,
    splittable: true,
    minSessionMinutes: 25,
    maxSessionMinutes: 60,
    recurrence: null,
    status: "active",
    lineId: null,
    createdAt: at(9).toISOString(),
    updatedAt: at(9).toISOString(),
    completedAt: null,
  };
}

describe("arrival forecast", () => {
  it("says every task arrives before its deadline when the time is there", () => {
    const tasks = [task("essay", 180, addDays(TODAY, 3)), task("math", 90, addDays(TODAY, 1))];
    const f = allocate({ tasks, windows: evenings, sessions: [], now: at(12), keepTodayPlan: false });
    const s = arrivalForecast(f, tasks, TODAY);
    expect(s.late).toBe(0);
    expect(s.onTime).toBe(2);
    expect(s.neededMinutes).toBe(270);
    expect(s.availableMinutes).toBeGreaterThan(s.neededMinutes);
    const math = s.arrivals.find((a) => a.task.id === "math")!;
    expect(math.arrives! <= math.task.deadline!).toBe(true);
    expect(math.plan.reduce((a, d) => a + d.minutes, 0)).toBe(90);
  });

  it("names what won't make it, and by how much", () => {
    const tasks = [task("big", 900, addDays(TODAY, 1))];
    const f = allocate({ tasks, windows: evenings, sessions: [], now: at(12), keepTodayPlan: false });
    const s = arrivalForecast(f, tasks, TODAY);
    expect(s.late).toBe(1);
    expect(s.arrivals[0].short).toBeGreaterThan(0);
  });
});
