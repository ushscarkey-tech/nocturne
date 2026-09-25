import { minutesFrom } from "./time";
import type { DateKey, StudySession } from "./types";

export function elapsedSeconds(s: StudySession, now: Date): number {
  const running = s.resumedAt ? Math.max(0, (now.getTime() - new Date(s.resumedAt).getTime()) / 1000) : 0;
  return s.elapsedSeconds + running;
}

export function remainingSeconds(s: StudySession, now: Date): number {
  return Math.max(0, s.plannedMinutes * 60 - elapsedSeconds(s, now));
}

/** Work still owed by an active station, proportional to time left. */
export function remainingWork(s: StudySession, now: Date): number {
  if (s.status !== "active") return s.status === "planned" ? s.workMinutes : 0;
  const fraction = Math.min(1, elapsedSeconds(s, now) / Math.max(60, s.plannedMinutes * 60));
  return Math.max(0, s.workMinutes * (1 - fraction));
}

export const isClosed = (s: StudySession) => s.status === "done" || s.status === "partial" || s.status === "skipped";

export function sessionsOn(sessions: StudySession[], date: DateKey): StudySession[] {
  return sessions
    .filter((s) => s.date === date)
    .sort((a, b) => a.plannedStart.localeCompare(b.plannedStart) || a.sequence - b.sequence);
}

/** Stations shown on a day's route (skipped ones are hidden). */
export function routeOf(sessions: StudySession[], date: DateKey): StudySession[] {
  return sessionsOn(sessions, date).filter((s) => s.status !== "skipped");
}

export function activeSession(sessions: StudySession[]): StudySession | undefined {
  return sessions.find((s) => s.status === "active");
}

export function upcomingOn(sessions: StudySession[], date: DateKey): StudySession[] {
  return routeOf(sessions, date).filter((s) => s.status === "planned");
}

/** Start/end of a session in minutes past midnight of its date. */
export function spanOf(s: StudySession): { start: number; end: number } {
  return { start: minutesFrom(s.date, s.plannedStart), end: minutesFrom(s.date, s.plannedEnd) };
}

export function creditedOn(sessions: StudySession[], taskId: string, date: DateKey): number {
  return sessions
    .filter((s) => s.taskId === taskId && s.date === date && (s.status === "done" || s.status === "partial"))
    .reduce((sum, s) => sum + s.creditedMinutes, 0);
}
