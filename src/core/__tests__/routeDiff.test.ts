import { describe, expect, it } from "vitest";
import { diffRoutes } from "../routeDiff";
import type { StudySession } from "../types";

const at = (h: number, m = 0) => new Date(2026, 8, 25, h, m).toISOString();
let seq = 0;
function st(taskId: string, h: number, m: number, minutes: number, status: StudySession["status"] = "planned", extra: Partial<StudySession> = {}): StudySession {
  return {
    id: `s${++seq}`,
    taskId,
    userId: "u",
    date: "2026-09-25",
    sequence: 0,
    stationName: "",
    plannedStart: at(h, m),
    plannedEnd: new Date(Date.parse(at(h, m)) + minutes * 60_000).toISOString(),
    plannedMinutes: minutes,
    workMinutes: minutes,
    completedMinutes: 0,
    creditedMinutes: 0,
    status,
    locked: false,
    actualStart: null,
    actualEnd: null,
    elapsedSeconds: 0,
    resumedAt: null,
    focusBefore: null,
    focusAfter: null,
    endedBy: null,
    extendedMinutes: 0,
    ...extra,
  };
}

describe("route diff", () => {
  it("marks stations moved earlier, later, new and split", () => {
    const before = [st("math", 20, 0, 60), st("bio", 21, 5, 30)];
    const after = [st("bio", 20, 0, 30), st("math", 20, 35, 30), st("math", 21, 10, 30), st("eng", 21, 45, 20)];
    const d = diffRoutes(before, after, at(19, 55));
    expect(d.marks[after[0].id]).toMatchObject({ kind: "earlier", from: "21:05", min: 65 });
    expect(d.marks[after[1].id]).toMatchObject({ kind: "later", min: 35 });
    expect(d.marks[after[2].id]).toMatchObject({ kind: "transfer" });
    expect(d.marks[after[3].id]).toMatchObject({ kind: "new" });
    expect(d.transfers).toEqual([]);
  });

  it("reports work that left tonight for another day, minus what was done", () => {
    const before = [st("math", 20, 0, 60, "active"), st("bio", 21, 5, 30)];
    const after = [st("math", 20, 0, 60, "partial", { completedMinutes: 12, actualEnd: at(20, 12) }), st("bio", 20, 20, 30)];
    const d = diffRoutes(before, after, at(20, 11));
    expect(d.transfers).toEqual([{ taskId: "math", minutes: 48 }]);
  });

  it("stays quiet when nothing moved", () => {
    const before = [st("math", 20, 0, 60)];
    const d = diffRoutes(before, [st("math", 20, 1, 60)], at(19, 0));
    expect(d.changed).toBe(false);
  });
});
