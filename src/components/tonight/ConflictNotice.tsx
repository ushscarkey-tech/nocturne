"use client";

import Link from "next/link";
import { useState } from "react";
import type { Conflict } from "@/core/allocate";
import { addDays, serviceDate } from "@/core/time";
import type { Task } from "@/core/types";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { useNow } from "@/lib/hooks";
import { taskHref } from "@/lib/paths";
import { useConflict } from "@/lib/use-planner";
import { updateTask } from "@/state/actions";
import { useData } from "@/state/store";
import { useI18n } from "@/i18n";

/** "Route conflict": not enough Service Time before a deadline. Never hidden, never blaming. */
export function ConflictNotice({ conflict, tasks }: { conflict: Conflict; tasks: Task[] }) {
  const { t, fmt } = useI18n();
  const [open, setOpen] = useState(false);
  const involved = tasks.filter((t) => conflict.taskIds.includes(t.id));

  return (
    <section aria-labelledby="conflict-title" className="animate-rise border-l border-signal/60 py-1 pl-5">
      <p id="conflict-title" className="eyebrow text-signal">
        {t("conflict.routeConflict")}
      </p>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-paper-dim">
        {t("conflict.notEnoughTime", { date: fmt.shortDate(conflict.deadline) })}
      </p>
      <ConflictFigures conflict={conflict} />
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
          {t("conflict.resolve")}
        </Button>
        <ButtonLink href="/service" variant="ghost" size="sm">
          {t("conflict.addStudyTime")}
        </ButtonLink>
      </div>
      <p className="mt-2 text-xs text-haze">
        {involved.length} {t(involved.length === 1 ? "conflict.taskSingular" : "conflict.taskPlural")} {t("conflict.involved")}
      </p>
      <ResolveSheet open={open} onClose={() => setOpen(false)} />
    </section>
  );
}

function ConflictFigures({ conflict }: { conflict: Conflict }) {
  const { t, fmt } = useI18n();
  return (
    <dl className="mt-4 grid max-w-sm grid-cols-3 gap-4 font-mono tabular">
      <div>
        <dt className="eyebrow text-[0.625rem]">{t("conflict.required")}</dt>
        <dd className="mt-1 text-paper">{fmt.duration(conflict.requiredMinutes)}</dd>
      </div>
      <div>
        <dt className="eyebrow text-[0.625rem]">{t("conflict.available")}</dt>
        <dd className="mt-1 text-paper">{fmt.duration(conflict.availableMinutes)}</dd>
      </div>
      <div>
        <dt className="eyebrow text-[0.625rem]">{t("conflict.shortfall")}</dt>
        <dd className="mt-1 text-signal">{fmt.duration(conflict.shortfallMinutes)}</dd>
      </div>
    </dl>
  );
}

/**
 * Live resolver: every change re-plans immediately and the figures update,
 * so the traveller can see when the route clears.
 */
function ResolveSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, fmt } = useI18n();
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
    <Sheet open={open} onClose={onClose} title={conflict ? t("conflict.resolveTitle") : t("conflict.clearTitle")} eyebrow={t("conflict.eyebrow")}>
      {conflict ? (
        <>
          <ConflictFigures conflict={conflict} />
          <p className="mt-6 text-sm leading-relaxed text-mist">
            {t("conflict.resolutionNote")}
          </p>
          <ul className="mt-4 divide-y divide-rule-soft">
            {involved.map((task) => (
              <li key={task.id} className="py-4">
                <div className="flex items-baseline justify-between gap-3">
                  <Link href={taskHref(task.id)} className="min-w-0 truncate text-paper hover:underline">
                    {task.title}
                  </Link>
                  <span className="shrink-0 font-mono text-xs text-mist tabular">
                    {task.deadline ? fmt.relativeDay(today, task.deadline) : t("common.someday")} · {fmt.duration(task.remainingMinutes)}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {task.deadline && (
                    <Button
                      variant="quiet"
                      size="sm"
                      onClick={() => updateTask(task.id, { deadline: addDays(task.deadline! < today ? today : task.deadline!, 2) })}
                    >
                      {t("conflict.deadlinePlus")}
                    </Button>
                  )}
                  {task.remainingMinutes > 30 && (
                    <Button
                      variant="quiet"
                      size="sm"
                      onClick={() => updateTask(task.id, { estimatedMinutes: task.estimatedMinutes - 30, remainingMinutes: task.remainingMinutes - 30 })}
                    >
                      {t("conflict.reduceBy30m")}
                    </Button>
                  )}
                  {task.importance <= 3 && (
                    <Button variant="quiet" size="sm" onClick={() => updateTask(task.id, { deadline: null })}>
                      {t("conflict.delayToSomeday")}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-6 flex justify-between gap-3">
            <ButtonLink href="/service" variant="secondary" size="sm">
              {t("conflict.addStudyTime")}
            </ButtonLink>
            <Button variant="ghost" size="sm" onClick={onClose}>
              {t("conflict.done")}
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm leading-relaxed text-mist">{t("conflict.everythingFits")}</p>
          <div className="mt-8 flex justify-end">
            <Button variant="primary" onClick={onClose}>
              {t("conflict.done")}
            </Button>
          </div>
        </>
      )}
    </Sheet>
  );
}
