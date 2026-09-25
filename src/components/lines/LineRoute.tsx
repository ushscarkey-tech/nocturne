import { formatShortDate } from "@/core/time";
import type { Line, Task } from "@/core/types";

export function lineProgress(tasks: Task[]) {
  const total = tasks.reduce((a, t) => a + (t.recurrence ? 0 : t.estimatedMinutes), 0);
  const left = tasks.reduce((a, t) => a + (t.recurrence ? 0 : t.status === "done" ? 0 : t.remainingMinutes), 0);
  return { total, left, done: total - left, fraction: total > 0 ? (total - left) / total : 0 };
}

export function lineTasks(line: Line, tasks: Task[]): Task[] {
  return tasks
    .filter((t) => t.lineId === line.id && t.status !== "archived")
    .sort((a, b) => (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999") || a.createdAt.localeCompare(b.createdAt));
}

/** A long-distance line: origin ─── destination, with stops for each task. */
export function LineRoute({ line, tasks, today }: { line: Line; tasks: Task[]; today: string }) {
  const p = lineProgress(tasks);
  const origin = tasks.reduce((min, t) => (t.createdAt.slice(0, 10) < min ? t.createdAt.slice(0, 10) : min), line.createdAt.slice(0, 10));
  return (
    <div>
      <div className="flex items-center gap-3 font-mono text-xs text-mist tabular">
        <span>{formatShortDate(origin < today ? origin : today)}</span>
        <span className="relative h-px flex-1 bg-rule" aria-hidden>
          <span className="absolute inset-y-0 left-0 bg-lamp/70" style={{ width: `${p.fraction * 100}%` }} />
          <span
            className="absolute top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-lamp"
            style={{ left: `${p.fraction * 100}%` }}
          />
        </span>
        <span>{line.targetDate ? formatShortDate(line.targetDate) : "Open"}</span>
      </div>
      <ol className="mt-5 space-y-2.5">
        {tasks.map((t) => {
          const done = t.status === "done";
          const started = !done && t.remainingMinutes < t.estimatedMinutes;
          return (
            <li key={t.id} className="flex items-center gap-3 text-sm">
              <span
                className={`h-2 w-2 shrink-0 rounded-full border ${done ? "border-paper-dim bg-paper-dim" : started ? "border-lamp bg-lamp/40" : "border-haze"}`}
                aria-hidden
              />
              <span className={done ? "text-mist" : "text-paper-dim"}>{t.title}</span>
              <span className="sr-only">{done ? "done" : started ? "in progress" : "not started"}</span>
            </li>
          );
        })}
        {line.targetDate && (
          <li className="flex items-center gap-3 text-sm">
            <span className="flex h-3 w-3 shrink-0 items-center justify-center rounded-full border border-lamp/70" aria-hidden>
              <span className="h-1 w-1 rounded-full bg-lamp" />
            </span>
            <span className="text-paper">{line.title}</span>
            <span className="font-mono text-xs text-mist">{formatShortDate(line.targetDate)}</span>
          </li>
        )}
      </ol>
    </div>
  );
}
