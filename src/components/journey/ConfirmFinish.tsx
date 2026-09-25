"use client";

import { awaitingConfirmation } from "@/core/journey";
import type { Task } from "@/core/types";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/Button";
import { addTaskTime, completeTask } from "@/state/actions";

/**
 * When a task's estimate runs out, Nocturne asks rather than assumes:
 * finished, or does it need a little more time?
 */
export function ConfirmFinish({ tasks, compact = false }: { tasks: Task[]; compact?: boolean }) {
  const { t } = useI18n();
  const waiting = tasks.filter(awaitingConfirmation);
  if (waiting.length === 0) return null;
  return (
    <section aria-label={t("journey.plannedTimeUsedUp")} className={compact ? "space-y-4" : "space-y-5 border-t border-rule pt-6"}>
      {waiting.map((task) => (
        <div key={task.id} className="animate-rise">
          <p className="text-sm text-paper-dim">
            {t("journey.hasUsedTime", { title: task.title })}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => completeTask(task.id)}>
              {t("journey.yesComplete")}
            </Button>
            <Button variant="quiet" size="sm" onClick={() => addTaskTime(task.id, 30)}>
              {t("journey.needs30MinMore")}
            </Button>
            <Button variant="quiet" size="sm" onClick={() => addTaskTime(task.id, 60)}>
              {t("journey.needs1HourMore")}
            </Button>
          </div>
        </div>
      ))}
    </section>
  );
}
