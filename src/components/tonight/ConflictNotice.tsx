"use client";

import Link from "next/link";
import { useState } from "react";
import type { Conflict } from "@/core/allocate";
import { addDays, formatDuration, formatShortDate, relativeDay, serviceDate } from "@/core/time";
import type { Task } from "@/core/types";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { useNow } from "@/lib/hooks";
import { taskHref } from "@/lib/paths";
import { useConflict } from "@/lib/use-planner";
import { updateTask } from "@/state/actions";
import { useData } from "@/state/store";

/** "Route conflict": not enough Service Time before a deadline. Never hidden, never blaming. */
export function ConflictNotice({ conflict, tasks }: { conflict: Conflict; tasks: Task[] }) {
  const [open, setOpen] = useState(false);
  const involved = tasks.filter((t) => conflict.taskIds.includes(t.id));

  return (
    <section aria-labelledby="conflict-title" className="animate-rise border-l border-signal/60 py-1 pl-5">
      <p id="conflict-title" className="eyebrow text-signal">
        Route conflict
      </p>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-paper-dim">
        There may not be enough Service Time to finish everything due by {formatShortDate(conflict.deadline)}. Nocturne
        won&rsquo;t squeeze in an impossible plan.
      </p>
      <ConflictFigures conflict={conflict} />
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
          Resolve
        </Button>
        <ButtonLink href="/service" variant="ghost" size="sm">
          Add Study Time
        </ButtonLink>
      </div>
      <p className="mt-2 text-xs text-haze">
        {involved.length} {involved.length === 1 ? "task" : "tasks"} involved
      </p>
      <ResolveSheet open={open} onClose={() => setOpen(false)} />
    </section>
  );
}

function ConflictFigures({ conflict }: { conflict: Conflict }) {
  return (
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
  );
}

/**
 * Live resolver: every change re-plans immediately and the figures update,
 * so the traveller can see when the route clears.
 */
function ResolveSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const data = useData();
  const now = useNow(60_000);
  const { conflict } = useConflict(data, now);
  const today = serviceDate(now);
  const involved = conflict
    ? data.tasks
        .filter((t) => conflict.taskIds.includes(t.id))
        .sort((a, b) => a.importance - b.importance || (b.deadline ?? "").localeCompare(a.deadline ?? ""))
    : [];

  return (
    <Sheet open={open} onClose={onClose} title={conflict ? "Resolve route conflict" : "Route clear"} eyebrow="Service Time vs. deadlines">
      {conflict ? (
        <>
          <ConflictFigures conflict={conflict} />
          <p className="mt-6 text-sm leading-relaxed text-mist">
            Lower-priority tasks are listed first. Give one more time, trim the work, or let it wait for another day.
          </p>
          <ul className="mt-4 divide-y divide-rule-soft">
            {involved.map((t) => (
              <li key={t.id} className="py-4">
                <div className="flex items-baseline justify-between gap-3">
                  <Link href={taskHref(t.id)} className="min-w-0 truncate text-paper hover:underline">
                    {t.title}
                  </Link>
                  <span className="shrink-0 font-mono text-xs text-mist tabular">
                    {t.deadline ? relativeDay(today, t.deadline) : "Someday"} · {formatDuration(t.remainingMinutes)}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {t.deadline && (
                    <Button
                      variant="quiet"
                      size="sm"
                      onClick={() => updateTask(t.id, { deadline: addDays(t.deadline! < today ? today : t.deadline!, 2) })}
                    >
                      Deadline +2 days
                    </Button>
                  )}
                  {t.remainingMinutes > 30 && (
                    <Button
                      variant="quiet"
                      size="sm"
                      onClick={() => updateTask(t.id, { estimatedMinutes: t.estimatedMinutes - 30, remainingMinutes: t.remainingMinutes - 30 })}
                    >
                      Reduce by 30m
                    </Button>
                  )}
                  {t.importance <= 3 && (
                    <Button variant="quiet" size="sm" onClick={() => updateTask(t.id, { deadline: null })}>
                      Delay to Someday
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-6 flex justify-between gap-3">
            <ButtonLink href="/service" variant="secondary" size="sm">
              Add Study Time
            </ButtonLink>
            <Button variant="ghost" size="sm" onClick={onClose}>
              Done
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm leading-relaxed text-mist">Everything fits before its deadline again.</p>
          <div className="mt-8 flex justify-end">
            <Button variant="primary" onClick={onClose}>
              Done
            </Button>
          </div>
        </>
      )}
    </Sheet>
  );
}
