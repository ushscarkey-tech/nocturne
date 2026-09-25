"use client";

import { useState } from "react";
import { calibrate } from "@/core/learning";
import { Button } from "@/components/ui/Button";
import { useI18n } from "@/i18n";
import { applySuggestedEstimate, revertEstimate } from "@/state/actions";
import { useData } from "@/state/store";

/**
 * Quiet note about the estimate: the traveller's own number when a
 * calibrated one is in use (with a way back), or a suggestion when similar
 * work has reliably taken a different amount of time. Never applied silently.
 */
export function EstimateNote({ taskId }: { taskId: string }) {
  const data = useData();
  const { t, fmt } = useI18n();
  const [dismissed, setDismissed] = useState(false);
  const task = data.tasks.find((x) => x.id === taskId);
  if (!task || task.recurrence || task.status !== "active") return null;

  if (task.userEstimatedMinutes !== null) {
    return (
      <p className="text-xs text-haze">
        {t("quickadd.yourEstimate")} {fmt.duration(task.userEstimatedMinutes)} · {t("quickadd.inUse")} {fmt.duration(task.estimatedMinutes)} ·{" "}
        <button type="button" className="min-h-9 underline underline-offset-4 hover:text-mist" onClick={() => revertEstimate(task.id)}>
          {t("quickadd.revert", { min: task.userEstimatedMinutes })}
        </button>
      </p>
    );
  }
  // Only suggest before much work has been done on it.
  if (dismissed || task.remainingMinutes < task.estimatedMinutes * 0.8) return null;
  const c = calibrate(data, task, task.estimatedMinutes);
  if (!c) return null;
  return (
    <div className="animate-rise rounded-xl border border-rule-soft px-4 py-3">
      <p className="text-sm text-paper-dim">
        {c.ratio > 1 ? t("quickadd.calibrationLonger", { task: c.example }) : t("quickadd.calibrationShorter", { task: c.example })}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={() => applySuggestedEstimate(task.id, c.suggestedMinutes)}>
          {t("quickadd.use", { min: c.suggestedMinutes })}
        </Button>
        <Button variant="quiet" size="sm" onClick={() => setDismissed(true)}>
          {t("quickadd.keep", { min: task.estimatedMinutes })}
        </Button>
      </div>
    </div>
  );
}
