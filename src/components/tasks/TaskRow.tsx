"use client";

import Link from "next/link";
import { useState } from "react";
import { awaitingConfirmation } from "@/core/journey";
import type { Task, Locale } from "@/core/types";
import { Icon } from "@/components/ui/Icon";
import { taskHref } from "@/lib/paths";
import { completeTask, reopenTask } from "@/state/actions";
import { translate, makeFormatters, useI18n } from "@/i18n";

export function taskMeta(task: Task, today: string, locale: Locale): string {
  const fmt = makeFormatters(locale);
  const parts: string[] = [];
  if (task.recurrence) {
    parts.push(task.recurrence.freq === "daily" ? translate(locale, "tasks.daily") : translate(locale, "tasks.weekly"));
    parts.push(fmt.duration(task.estimatedMinutes));
    return parts.join(" · ");
  }
  if (task.deadline) parts.push(fmt.relativeDay(today, task.deadline));
  if (task.status === "done") parts.push(translate(locale, "tasks.completed"));
  else if (awaitingConfirmation(task)) parts.push(translate(locale, "tasks.planned"));
  else if (task.estimatedMinutes > 0) parts.push(translate(locale, "tasks.remaining", { min: Math.round(task.remainingMinutes) }));
  else parts.push(translate(locale, "tasks.needsEstimate"));
  return parts.join(" · ");
}

export function TaskRow({ task, today, tonightMinutes }: { task: Task; today: string; tonightMinutes?: number }) {
  const { t, fmt, locale } = useI18n();
  const [leaving, setLeaving] = useState(false);
  const progress =
    !task.recurrence && task.estimatedMinutes > 0 ? 1 - task.remainingMinutes / task.estimatedMinutes : 0;
  const overdue = task.deadline && task.deadline < today && task.status !== "done";
  const done = task.status === "done";
  const canComplete = task.status === "active" && !task.recurrence;

  function toggle() {
    if (done) {
      reopenTask(task.id);
      return;
    }
    // Let the row fade before it moves to Completed.
    setLeaving(true);
    setTimeout(() => completeTask(task.id), 450);
  }

  return (
    <li className={`flex items-center gap-1 ${leaving ? "animate-fade-out" : ""}`}>
      {(canComplete || done) && (
        <button
          type="button"
          onClick={toggle}
          aria-label={done ? t("tasks.reopen", { task: task.title }) : t("tasks.mark", { task: task.title })}
          className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-haze transition-colors hover:text-paper"
        >
          <span
            className={`flex h-5 w-5 items-center justify-center rounded-full border transition-colors duration-500 ${
              done || leaving ? "border-moss-light bg-moss text-paper" : "border-haze"
            }`}
          >
            {(done || leaving) && <Icon name="check" size={12} />}
          </span>
        </button>
      )}
      <Link
        href={taskHref(task.id)}
        className={`group flex min-w-0 flex-1 items-center justify-between gap-4 rounded-xl py-4 pr-1 transition-colors duration-500 hover:bg-white/[0.02] ${
          canComplete || done ? "pl-1" : ""
        }`}
      >
        <div className="min-w-0 flex-1">
          <p className={`truncate ${done ? "text-mist line-through decoration-haze" : "text-paper"}`}>{task.title}</p>
          <p className={`mt-1 truncate text-xs tabular ${overdue ? "text-signal" : awaitingConfirmation(task) ? "text-lamp/90" : "text-mist"}`}>
            {taskMeta(task, today, locale)}
          </p>
          {progress > 0 && !done && (
            <div className="mt-2.5 h-px w-full max-w-48 bg-rule" aria-hidden>
              <div className="h-px bg-lamp/70" style={{ width: `${Math.min(100, progress * 100)}%` }} />
            </div>
          )}
        </div>
        {tonightMinutes ? (
          <span className="shrink-0 font-mono text-xs text-lamp/80 tabular" title={t("tasks.scheduleTonight")}>
            {fmt.duration(tonightMinutes)}
            <span className="hidden sm:inline"> {t("common.today")}</span>
          </span>
        ) : null}
      </Link>
    </li>
  );
}
