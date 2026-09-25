/**
 * Realistic demo data relative to "now", so the experience is visible
 * immediately: a student with a few deadlines this week, a Biology Midterm
 * line, weekday evening Service Time and a week of past journeys.
 */
import { newId } from "./ids";
import { planToday } from "./planner";
import { boardingDetails, stationName } from "./stations";
import { addDays, atMinutes, parseHM, serviceDate } from "./time";
import type {
  CarriageId,
  Journey,
  Level,
  Line,
  NocturneData,
  Profile,
  StudySession,
  StudyWindow,
  Task,
  Ticket,
} from "./types";
import { CARRIAGE_AMBIENCE } from "./journey";

type TaskSeed = Partial<Task> & { title: string; key: string };

export function defaultWindows(userId: string): StudyWindow[] {
  const out: StudyWindow[] = [];
  const add = (day: number, start: string, end: string) =>
    out.push({
      id: newId(),
      userId,
      dayOfWeek: day,
      specificDate: null,
      startTime: start,
      endTime: end,
      recurring: true,
      enabled: true,
      kind: "available",
    });
  for (const day of [1, 2, 3, 4, 5]) {
    add(day, "17:00", "18:30");
    add(day, "19:40", "23:30");
  }
  for (const day of [0, 6]) {
    add(day, "14:00", "17:00");
    add(day, "19:40", "22:30");
  }
  return out;
}

export function createSeedData(now: Date, profileBase?: Partial<Profile>): NocturneData {
  const today = serviceDate(now);
  const userId = profileBase?.id ?? newId();
  const stamp = (daysAgo: number) => atMinutes(addDays(today, -daysAgo), 12 * 60).toISOString();

  const profile: Profile = {
    id: userId,
    name: "Traveller",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    createdAt: stamp(10),
    preferredCarriage: "rain",
    autoTunnel: true,
    ...profileBase,
  };

  const lines: Line[] = [
    {
      id: newId(),
      userId,
      title: "Biology Midterm",
      description: "Ecology, photosynthesis and cellular respiration.",
      targetDate: addDays(today, 17),
      createdAt: stamp(9),
    },
    {
      id: newId(),
      userId,
      title: "Research Presentation",
      description: "Report and slides for the science fair.",
      targetDate: addDays(today, 20),
      createdAt: stamp(8),
    },
  ];
  const [bio, research] = lines;

  const task = (seed: TaskSeed): Task & { key: string } => ({
    id: newId(),
    userId,
    description: "",
    deadline: null,
    estimatedMinutes: 60,
    remainingMinutes: seed.estimatedMinutes ?? 60,
    interest: 3 as Level,
    difficulty: 3 as Level,
    importance: 3 as Level,
    splittable: true,
    minSessionMinutes: 25,
    maxSessionMinutes: 60,
    recurrence: null,
    status: "active",
    lineId: null,
    createdAt: stamp(7),
    updatedAt: stamp(1),
    completedAt: null,
    ...seed,
  });

  const seeds = [
    task({ key: "math", title: "Mathematics problem set", description: "Chapter 4 — differentiation, problems 1–40.", deadline: addDays(today, 2), estimatedMinutes: 180, remainingMinutes: 150, interest: 2, difficulty: 4, importance: 5 }),
    task({ key: "physics", title: "Physics workbook", description: "Kinematics review pages 58–91.", deadline: addDays(today, 4), estimatedMinutes: 180, remainingMinutes: 110, interest: 2, difficulty: 4, importance: 4 }),
    task({ key: "bio", title: "Biology memorization", description: "Ecosystem vocabulary and energy flow diagrams.", deadline: addDays(today, 5), estimatedMinutes: 240, remainingMinutes: 240, interest: 3, difficulty: 2, importance: 4, lineId: bio.id, maxSessionMinutes: 45 }),
    task({ key: "report", title: "Science report", description: "Draft the results and discussion sections.", deadline: addDays(today, 6), estimatedMinutes: 150, remainingMinutes: 150, interest: 4, difficulty: 3, importance: 3, lineId: research.id }),
    task({ key: "vocab", title: "English vocabulary", description: "30 words from the daily list.", estimatedMinutes: 30, remainingMinutes: 30, interest: 3, difficulty: 1, importance: 3, recurrence: { freq: "daily" }, maxSessionMinutes: 30, minSessionMinutes: 15 }),
    task({ key: "photo", title: "Photosynthesis review", deadline: addDays(today, 10), estimatedMinutes: 120, remainingMinutes: 120, interest: 4, difficulty: 3, importance: 4, lineId: bio.id }),
    task({ key: "resp", title: "Cellular respiration", deadline: addDays(today, 14), estimatedMinutes: 120, remainingMinutes: 120, interest: 3, difficulty: 4, importance: 4, lineId: bio.id }),
    task({ key: "slides", title: "Presentation slides", deadline: addDays(today, 18), estimatedMinutes: 180, remainingMinutes: 180, interest: 4, difficulty: 2, importance: 3, lineId: research.id }),
    task({ key: "popeco", title: "Population ecology", deadline: addDays(today, -2), estimatedMinutes: 100, remainingMinutes: 0, interest: 3, difficulty: 3, importance: 4, lineId: bio.id, status: "done", completedAt: stamp(3) }),
    task({ key: "community", title: "Community ecology", deadline: addDays(today, -1), estimatedMinutes: 90, remainingMinutes: 0, interest: 4, difficulty: 2, importance: 4, lineId: bio.id, status: "done", completedAt: stamp(1) }),
    task({ key: "chem", title: "Chemistry lab notes", deadline: addDays(today, -3), estimatedMinutes: 80, remainingMinutes: 0, interest: 3, difficulty: 2, importance: 3, status: "done", completedAt: stamp(4) }),
    task({ key: "book", title: "Read “The Selfish Gene”", description: "For fun, a chapter at a time.", estimatedMinutes: 240, remainingMinutes: 240, interest: 5, difficulty: 2, importance: 2 }),
    task({ key: "essay", title: "History essay outline", status: "inbox", estimatedMinutes: 0, remainingMinutes: 0, createdAt: stamp(0) }),
  ];
  const byKey = Object.fromEntries(seeds.map((t) => [t.key, t.id]));
  const tasks: Task[] = seeds.map((seed) => {
    const t: Task & { key?: string } = { ...seed };
    delete t.key;
    return t;
  });

  const windows = defaultWindows(userId);
  // A one-off extra window this weekend, to show exceptions.
  windows.push({
    id: newId(),
    userId,
    dayOfWeek: null,
    specificDate: addDays(today, ((6 - now.getDay() + 7) % 7) || 7),
    startTime: "10:00",
    endTime: "12:00",
    recurring: false,
    enabled: true,
    kind: "available",
  });

  // ---- Past week of journeys -------------------------------------------------
  type Stop = [key: string, planned: number, actual: number, status?: "done" | "partial"];
  const history: { daysAgo: number; carriage: CarriageId; stops: Stop[]; changes: number; focus: ("low" | "steady" | "sharp")[] }[] = [
    { daysAgo: 6, carriage: "quiet", stops: [["chem", 50, 55], ["vocab", 30, 30], ["popeco", 50, 48]], changes: 0, focus: ["steady"] },
    { daysAgo: 5, carriage: "rain", stops: [["popeco", 50, 52], ["vocab", 30, 25], ["chem", 30, 34], ["math", 30, 30]], changes: 1, focus: ["sharp", "steady"] },
    { daysAgo: 4, carriage: "rain", stops: [["community", 45, 45], ["vocab", 30, 30], ["physics", 35, 40]], changes: 0, focus: ["steady"] },
    { daysAgo: 2, carriage: "tunnel", stops: [["physics", 30, 15, "partial"], ["vocab", 30, 28], ["community", 45, 50]], changes: 2, focus: ["steady", "low"] },
    { daysAgo: 1, carriage: "moon", stops: [["vocab", 30, 30], ["physics", 20, 20]], changes: 0, focus: ["sharp"] },
  ];

  const sessions: StudySession[] = [];
  const journeys: Journey[] = [];
  const tickets: Ticket[] = [];
  for (const day of history) {
    const date = addDays(today, -day.daysAgo);
    let cursor = parseHM("19:40") + (day.daysAgo === 2 ? 25 : 0);
    const plannedStartMin = parseHM("19:40");
    let plannedCursor = plannedStartMin;
    const daySessions: StudySession[] = day.stops.map(([key, planned, actual, status], i) => {
      const start = cursor;
      cursor += actual + (actual >= 45 ? 10 : 5);
      plannedCursor += planned + (planned >= 45 ? 10 : 5);
      return {
        id: newId(),
        taskId: byKey[key],
        userId,
        date,
        sequence: i,
        stationName: stationName(date, i, day.stops.length),
        plannedStart: atMinutes(date, start).toISOString(),
        plannedEnd: atMinutes(date, start + actual).toISOString(),
        plannedMinutes: planned,
        workMinutes: planned,
        completedMinutes: actual,
        creditedMinutes: status === "partial" ? actual : planned,
        status: status ?? "done",
        locked: false,
        actualStart: atMinutes(date, start).toISOString(),
        actualEnd: atMinutes(date, start + actual).toISOString(),
        elapsedSeconds: actual * 60,
        resumedAt: null,
        focusBefore: day.focus[0],
        focusAfter: day.focus[day.focus.length - 1],
      };
    });
    sessions.push(...daySessions);
    const focused = daySessions.reduce((a, s) => a + s.completedMinutes, 0);
    const first = daySessions[0];
    const last = daySessions[daySessions.length - 1];
    const journey: Journey = {
      id: newId(),
      userId,
      date,
      phase: "final",
      ...boardingDetails(date),
      plannedMinutes: daySessions.reduce((a, s) => a + s.workMinutes, 0),
      focusedMinutes: focused,
      stationsPlanned: daySessions.length,
      stationsCompleted: daySessions.filter((s) => s.status === "done").length,
      routeChanges: day.changes,
      selectedCarriage: day.carriage,
      selectedAmbience: CARRIAGE_AMBIENCE[day.carriage],
      plannedDeparture: atMinutes(date, plannedStartMin).toISOString(),
      plannedArrival: atMinutes(date, plannedCursor - 5).toISOString(),
      startedAt: first.actualStart,
      completedAt: last.actualEnd,
      stopEndsAt: null,
      focus: day.focus[day.focus.length - 1],
      focusLog: day.focus.map((level, i) => ({ at: atMinutes(date, plannedStartMin + i * 60).toISOString(), level })),
      changeLog: [],
    };
    journeys.push(journey);
    tickets.push({
      id: newId(),
      journeyId: journey.id,
      userId,
      generatedAt: last.actualEnd!,
      ticketStyle: day.carriage,
      serial: date.slice(5).replace("-", ""),
    });
  }

  const base: NocturneData = { profile, tasks, windows, sessions, lines, journeys, tickets };
  // Tonight's route, built by the real planner.
  const planned = planToday(
    { tasks, windows, sessions, userId },
    { now, focus: "steady", mode: "reoptimize", reason: "initial" },
  );
  return { ...base, sessions: planned.sessions };
}

/** A fresh, empty account with default Service Time. */
export function createEmptyData(profile: Profile): NocturneData {
  return {
    profile,
    tasks: [],
    windows: defaultWindows(profile.id),
    sessions: [],
    lines: [],
    journeys: [],
    tickets: [],
  };
}
