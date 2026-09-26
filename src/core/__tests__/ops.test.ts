import { describe, expect, it } from "vitest";
import { worstConflict } from "../allocate";
import { board, endJourney, journeyFor } from "../journey";
import * as ops from "../ops";
import { forecast } from "../planner";
import { createEmptyData } from "../seed";
import { upcomingOn } from "../sessions";
import { PROFILE_DEFAULTS, type NocturneData, type StudyWindow } from "../types";

// Saturday, Sep 26 2026, local time.
const at = (h: number, m = 0) => new Date(2026, 8, 26, h, m);
const TODAY = "2026-09-26";
const allDay: StudyWindow = {
  id: "w",
  userId: "u",
  dayOfWeek: null,
  specificDate: TODAY,
  startTime: "07:00",
  endTime: "23:00",
  recurring: false,
  enabled: true,
  kind: "available",
};

const draft = (title: string, minutes = 60): ops.TaskDraft => ({
  title,
  description: "",
  deadline: TODAY,
  estimatedMinutes: minutes,
  interest: 3,
  difficulty: 3,
  importance: 3,
  splittable: true,
  minSessionMinutes: 25,
  maxSessionMinutes: 60,
  recurrence: null,
  lineId: null,
});

function start(): NocturneData {
  const base = createEmptyData({
    id: "u",
    name: "T",
    timezone: "UTC",
    createdAt: at(7).toISOString(),
    preferredCarriage: "rain",
    autoTunnel: true,
    ...PROFILE_DEFAULTS,
  });
  return { ...base, windows: [allDay] };
}

/** Rode for a bit in the morning, then ended the journey. */
function endedMorning(): NocturneData {
  let d = ops.addTask(start(), draft("warm-up", 30), at(8)).data;
  d = board(d, { focus: "steady", carriage: "rain" }, at(8)).data;
  d = endJourney(d, at(8, 20)).data;
  expect(journeyFor(d, TODAY)?.phase).toBe("final");
  return d;
}

describe("a day whose journey already ended", () => {
  it("opens the line again when work is added and Service Time is left", () => {
    let d = endedMorning();
    for (let i = 0; i < 22; i++) d = ops.addTask(d, draft(`task ${i}`), at(13)).data;
    const upcoming = upcomingOn(d.sessions, TODAY);
    expect(upcoming.length).toBeGreaterThan(5);
    expect(new Date(upcoming[0].plannedStart).getTime()).toBeGreaterThanOrEqual(at(13).getTime());
    const journey = journeyFor(d, TODAY)!;
    expect(journey.phase).toBe("boarding");
    expect(journey.completedAt).toBeNull();
    // What didn't fit is still a real conflict, but today carries what it can.
    const conflict = worstConflict(forecast({ tasks: d.tasks, windows: d.windows, sessions: d.sessions, userId: "u" }, at(13)))!;
    expect(conflict.shortfallMinutes).toBeLessThan(22 * 60 + 30 - 8 * 60);
  });

  it("hands back the stations left behind when the night ended", () => {
    let d = endedMorning();
    d = ops.addTask(d, draft("essay"), at(13)).data;
    const warmUp = d.tasks.find((t) => t.title === "warm-up")!;
    expect(upcomingOn(d.sessions, TODAY).some((s) => s.taskId === warmUp.id)).toBe(true);
  });

  it("stays ended for anything but the traveller's own changes, or when time is up", () => {
    const d = endedMorning();
    expect(ops.replan(d, "optimize", at(13)).data).toBe(d);
    const late = ops.addTask(d, draft("late"), at(22, 55)).data;
    expect(journeyFor(late, TODAY)?.phase).toBe("final");
    expect(upcomingOn(late.sessions, TODAY)).toHaveLength(0);
  });
});
