"use client";

import { useMemo, useState } from "react";
import { rescuePlan, type RescueStep } from "@/core/rescue";
import { serviceDate } from "@/core/time";
import type { NocturneData } from "@/core/types";
import { Button } from "@/components/ui/Button";
import { applyRescuePlan } from "@/state/actions";
import { useI18n } from "@/i18n";

/** A step's particulars; long lists fold after a few lines. */
function Lines({ lines }: { lines: string[] }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const FOLD = 4;
  const shown = open || lines.length <= FOLD + 1 ? lines : lines.slice(0, FOLD);
  return (
    <ul className="mt-1 space-y-0.5">
      {shown.map((line) => (
        <li key={line} className="truncate font-mono text-[0.75rem] tabular text-mist">
          {line}
        </li>
      ))}
      {shown.length < lines.length && (
        <li>
          <button type="button" onClick={() => setOpen(true)} className="font-mono text-[0.75rem] text-haze underline decoration-rule underline-offset-4 hover:text-mist">
            {t("conflict.rescueMore", { n: lines.length - shown.length })}
          </button>
        </li>
      )}
    </ul>
  );
}

/**
 * When the work won't fit: not "it can't be done" but how it can. Each
 * remedy says what it costs and what it wins back; one tap applies it.
 */
export function RescuePlan({ data, now }: { data: NocturneData; now: Date }) {
  const { t, fmt } = useI18n();
  const minute = Math.floor(now.getTime() / 60_000);
  // Re-plan only when the data or the minute changes.
  const plan = useMemo(() => rescuePlan(data, new Date(minute * 60_000)), [data, minute]);
  if (!plan) return null;
  const today = serviceDate(now);
  const titleOf = (id: string) => data.tasks.find((x) => x.id === id)?.title ?? "—";
  const day = (date: string) => `${fmt.relativeDay(today, date)} · ${fmt.shortDate(date)}`;

  if (plan.steps.length === 0) {
    return (
      <section className="rounded-2xl border border-lamp/30 bg-lamp/[0.04] p-5">
        <p className="text-sm leading-relaxed text-paper-dim">{t("conflict.rescueReplan")}</p>
        <Button variant="primary" size="sm" className="mt-4" onClick={() => applyRescuePlan([])}>
          {t("conflict.rescueReplanButton")}
        </Button>
      </section>
    );
  }

  const label = (s: RescueStep) =>
    s.kind === "shortStops"
      ? t("conflict.rescueShortStops")
      : s.kind === "extraTime"
        ? t("conflict.rescueExtraTime")
        : s.kind === "trim"
          ? t("conflict.rescueTrim")
          : t("conflict.rescuePostpone");

  const details = (s: RescueStep): string[] =>
    s.kind === "shortStops"
      ? [t("conflict.rescueShortStopsDetail")]
      : s.kind === "extraTime"
        ? s.windows.map((w) => `${day(w.date)}  ${w.start}–${w.end}  (${fmt.duration(w.minutes)})`)
        : s.kind === "trim"
          ? s.cuts.map((c) => `${titleOf(c.taskId)}  ${fmt.duration(c.from)} → ${fmt.duration(c.to)}`)
          : [
              ...s.windows.map((w) => `${t("conflict.rescueStudy")} ${day(w.date)}  ${w.start}–${w.end}  (${fmt.duration(w.minutes)})`),
              ...s.moves.map((m) => `${titleOf(m.taskId)}  ${fmt.shortDate(m.from)} → ${day(m.to)}`),
            ];

  return (
    <section aria-labelledby="rescue-title" className="rounded-2xl border border-lamp/30 bg-lamp/[0.04] p-5 sm:p-6">
      <p id="rescue-title" className="text-sm leading-relaxed text-paper">
        {t(plan.left === 0 ? "conflict.rescueLead" : "conflict.rescueLeadPartial", {
          date: fmt.shortDate(plan.deadline),
          min: fmt.duration(plan.shortfall),
        })}
      </p>
      <ol className="mt-4 space-y-4">
        {plan.steps.map((s, i) => (
          <li key={s.kind} className="flex gap-3">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-lamp/50 font-mono text-[0.625rem] text-lamp" aria-hidden>
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm text-paper">{label(s)}</p>
                <span className="shrink-0 font-mono text-xs tabular text-lamp">{t("conflict.rescueGain", { min: fmt.duration(s.gain) })}</span>
              </div>
              <Lines lines={details(s)} />
              {plan.steps.length > 1 && (
                <button
                  type="button"
                  onClick={() => applyRescuePlan([s])}
                  className="mt-1.5 min-h-8 text-xs text-mist underline decoration-rule underline-offset-4 hover:text-paper"
                >
                  {t("conflict.rescueApply")}
                </button>
              )}
            </div>
          </li>
        ))}
      </ol>
      {plan.left > 0 && <p className="mt-4 text-xs leading-relaxed text-signal">{t("conflict.rescueStill", { min: fmt.duration(plan.left) })}</p>}
      <Button variant="primary" size="sm" className="mt-5" onClick={() => applyRescuePlan(plan.steps)}>
        {t("conflict.rescueApplyAll")}
      </Button>
    </section>
  );
}
