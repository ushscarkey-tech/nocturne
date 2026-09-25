import Link from "next/link";
import type { Conflict } from "@/core/allocate";
import { formatDuration, formatShortDate } from "@/core/time";
import type { Task } from "@/core/types";
import { taskHref } from "@/lib/paths";

/** "Route conflict": not enough Service Time before a deadline. Never hidden, never blaming. */
export function ConflictNotice({ conflict, tasks }: { conflict: Conflict; tasks: Task[] }) {
  const involved = tasks.filter((t) => conflict.taskIds.includes(t.id));
  const soonest = [...involved].sort((a, b) => (a.deadline ?? "").localeCompare(b.deadline ?? ""))[0];
  const largest = [...involved].sort((a, b) => b.remainingMinutes - a.remainingMinutes)[0];
  const lowest = [...involved].sort((a, b) => a.importance - b.importance)[0];

  return (
    <section aria-labelledby="conflict-title" className="animate-rise border-l border-signal/60 py-1 pl-5">
      <p id="conflict-title" className="eyebrow text-signal">
        Route conflict
      </p>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-paper-dim">
        There may not be enough Service Time to finish everything due by {formatShortDate(conflict.deadline)}.
      </p>
      <dl className="mt-4 grid max-w-sm grid-cols-3 gap-4 font-mono tabular">
        <div>
          <dt className="eyebrow text-[0.625rem]">Required</dt>
          <dd className="mt-1 text-paper">{formatDuration(conflict.requiredMinutes)}</dd>
        </div>
        <div>
          <dt className="eyebrow text-[0.625rem]">Available</dt>
          <dd className="mt-1 text-paper">{formatDuration(conflict.availableMinutes)}</dd>
        </div>
        <div>
          <dt className="eyebrow text-[0.625rem]">Shortfall</dt>
          <dd className="mt-1 text-signal">{formatDuration(conflict.shortfallMinutes)}</dd>
        </div>
      </dl>
      <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm">
        <li>
          <Link className="text-paper underline decoration-rule underline-offset-4 hover:decoration-lamp" href="/service">
            Add Study Time
          </Link>
        </li>
        {soonest && (
          <li>
            <Link className="text-paper underline decoration-rule underline-offset-4 hover:decoration-lamp" href={taskHref(soonest.id, "deadline")}>
              Change deadline
            </Link>
          </li>
        )}
        {largest && (
          <li>
            <Link className="text-paper underline decoration-rule underline-offset-4 hover:decoration-lamp" href={taskHref(largest.id, "estimate")}>
              Reduce workload
            </Link>
          </li>
        )}
        {lowest && involved.length > 1 && (
          <li>
            <Link className="text-paper underline decoration-rule underline-offset-4 hover:decoration-lamp" href={taskHref(lowest.id, "deadline")}>
              Delay {lowest.title}
            </Link>
          </li>
        )}
      </ul>
    </section>
  );
}
