/**
 * "If I ride the route, do I make it?" — the forecast answered per task:
 * the day each task's last piece of work is planned, against its deadline,
 * plus the arithmetic behind it (needed vs available Service Time).
 */
import { scheduleFor, type Forecast } from "./allocate";
import { diffDays } from "./time";
import type { DateKey, Task } from "./types";

export interface Arrival {
  task: Task;
  /** Planned minutes per day, from today on. */
  plan: { date: DateKey; minutes: number }[];
  /** Day the last planned piece is done; null if nothing is planned. */
  arrives: DateKey | null;
  /** Minutes that could not be placed before the deadline. */
  short: number;
  /** Days between arrival and deadline (0 = on the deadline day). */
  slackDays: number | null;
}

export interface ArrivalSummary {
  arrivals: Arrival[];
  onTime: number;
  late: number;
  /** Work still needed on tasks with deadlines. */
  neededMinutes: number;
  /** Service Time from now until the last deadline. */
  availableMinutes: number;
}

export function arrivalForecast(f: Forecast, tasks: Task[], today: DateKey): ArrivalSummary {
  const open = tasks.filter((t) => t.status === "active" && !t.recurrence && t.estimatedMinutes > 0 && t.remainingMinutes > 0);
  const arrivals: Arrival[] = open.map((task) => {
    const plan = scheduleFor(f, task.id);
    const arrives = plan.length ? plan[plan.length - 1].date : null;
    const short = Math.round(f.unscheduled[task.id] ?? 0);
    const slackDays = task.deadline && arrives ? diffDays(arrives, task.deadline) : null;
    return { task, plan, arrives, short, slackDays };
  });
  // Nearest deadline first; Someday work last.
  arrivals.sort((a, b) => (a.task.deadline ?? "9999").localeCompare(b.task.deadline ?? "9999") || a.task.title.localeCompare(b.task.title));

  const dated = arrivals.filter((a) => a.task.deadline);
  const late = dated.filter((a) => a.short > 0 || (a.slackDays !== null && a.slackDays < 0)).length;
  const lastDeadline = dated.reduce<DateKey | null>((m, a) => (!m || a.task.deadline! > m ? a.task.deadline! : m), null);
  const neededMinutes = Math.round(dated.reduce((s, a) => s + a.task.remainingMinutes, 0));
  const availableMinutes = Math.round(
    lastDeadline ? f.days.filter((d) => d.date >= today && d.date <= lastDeadline).reduce((s, d) => s + d.capacity, 0) : 0,
  );
  return { arrivals, onTime: dated.length - late, late, neededMinutes, availableMinutes };
}
