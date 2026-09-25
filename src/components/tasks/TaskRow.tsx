import Link from "next/link";
import { formatDuration, relativeDay } from "@/core/time";
import type { Task } from "@/core/types";
import { taskHref } from "@/lib/paths";

export function taskMeta(task: Task, today: string): string {
  const parts: string[] = [];
  if (task.recurrence) {
    parts.push(task.recurrence.freq === "daily" ? "Daily" : "Weekly");
    parts.push(formatDuration(task.estimatedMinutes));
    return parts.join(" · ");
  }
  if (task.deadline) parts.push(relativeDay(today, task.deadline));
  if (task.status === "done") parts.push("Completed");
  else if (task.estimatedMinutes > 0) parts.push(`${formatDuration(task.remainingMinutes)} remaining`);
  else parts.push("Needs an estimate");
  return parts.join(" · ");
}

export function TaskRow({ task, today, tonightMinutes }: { task: Task; today: string; tonightMinutes?: number }) {
  const progress =
    !task.recurrence && task.estimatedMinutes > 0 ? 1 - task.remainingMinutes / task.estimatedMinutes : 0;
  const overdue = task.deadline && task.deadline < today && task.status !== "done";
  return (
    <li>
      <Link
        href={taskHref(task.id)}
        className="group -mx-3 flex items-center justify-between gap-4 rounded-xl px-3 py-4 transition-colors duration-500 hover:bg-white/[0.02]"
      >
        <div className="min-w-0 flex-1">
          <p className={`truncate ${task.status === "done" ? "text-mist line-through decoration-haze" : "text-paper"}`}>{task.title}</p>
          <p className={`mt-1 text-xs tabular ${overdue ? "text-signal" : "text-mist"}`}>{taskMeta(task, today)}</p>
          {progress > 0 && task.status !== "done" && (
            <div className="mt-2.5 h-px w-full max-w-48 bg-rule" aria-hidden>
              <div className="h-px bg-lamp/70" style={{ width: `${Math.min(100, progress * 100)}%` }} />
            </div>
          )}
        </div>
        {tonightMinutes ? (
          <span className="shrink-0 font-mono text-xs text-lamp/80 tabular" title="Scheduled tonight">
            {formatDuration(tonightMinutes)} tonight
          </span>
        ) : null}
      </Link>
    </li>
  );
}
