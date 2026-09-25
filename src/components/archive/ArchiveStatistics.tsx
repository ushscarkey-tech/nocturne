"use client";

import type { ArchiveStats, DayFocus } from "@/core/stats";
import type { DateKey } from "@/core/types";
import { FocusInsights } from "@/components/insights/FocusInsights";
import { useI18n } from "@/i18n";

/** The Archive's secondary layer: weekly focus, four-week patterns and insights. */
export function ArchiveStatistics({ stats, week, today }: { stats: ArchiveStats; week: DayFocus[]; today: DateKey }) {
  const { t, fmt } = useI18n();
  const maxDay = Math.max(60, ...week.map((d) => d.minutes));
  const change = stats.previousWeekFocused ? stats.weekFocused / stats.previousWeekFocused - 1 : null;

  return (
    <div>
      <section aria-labelledby="week-title">
        <div className="flex items-baseline justify-between">
          <h3 id="week-title" className="eyebrow">
            {t("archive.thisWeek")}
          </h3>
          {change !== null && Number.isFinite(change) && (
            <span className="font-mono text-xs text-mist tabular">
              {t("archive.vsLastWeek", { change: `${change >= 0 ? "+" : ""}${Math.round(change * 100)}` })}
            </span>
          )}
        </div>
        <p className="mt-3 font-mono text-4xl font-light tabular">{fmt.duration(stats.weekFocused)}</p>
        <p className="text-sm text-mist">{t("archive.focused")}</p>

        <div
          className="mt-8 flex h-32 items-end gap-3"
          role="img"
          aria-label={t("archive.dailyFocusLabel", { days: week.map((d) => `${fmt.weekday(d.date)} ${fmt.duration(d.minutes)}`).join(", ") })}
        >
          {week.map((d) => (
            <div key={d.date} className="flex h-full flex-1 flex-col items-center gap-2">
              <div className="flex h-24 w-full items-end justify-center">
                <div
                  className={`w-full max-w-7 rounded-t-sm ${d.date === today ? "bg-lamp/80" : "bg-paper-dim/25"}`}
                  style={{ height: `${Math.max(2, (d.minutes / maxDay) * 100)}%` }}
                  title={fmt.duration(d.minutes)}
                />
              </div>
              <span className={`font-mono text-[0.625rem] ${d.date === today ? "text-lamp" : "text-haze"}`}>
                {fmt.weekday(d.date).slice(0, 2)}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-12 border-t border-rule-soft pt-10" aria-labelledby="patterns-title">
        <h3 id="patterns-title" className="eyebrow">
          {t("archive.lastFourWeeks")}
        </h3>
        <dl className="mt-5 grid grid-cols-2 gap-x-8 gap-y-7 sm:grid-cols-3">
          <Metric label={t("archive.completionRate")} value={`${Math.round(stats.completionRate * 100)}%`} note={t("archive.completionRateNote")} />
          <Metric label={t("archive.stationsCompleted")} value={String(stats.stationsCompleted)} note={t("archive.stationsCompletedNote")} />
          <Metric
            label={t("archive.estimatedVsActual")}
            value={`${fmt.duration(stats.estimatedMinutes)} / ${fmt.duration(stats.actualMinutes)}`}
            note={
              stats.estimateRatio > 1.08
                ? t("archive.runLonger", { pct: String(Math.round((stats.estimateRatio - 1) * 100)) })
                : stats.estimateRatio < 0.92
                  ? t("archive.finishEarly", { pct: String(Math.round((1 - stats.estimateRatio) * 100)) })
                  : t("archive.estimatesClose")
            }
          />
          <Metric
            label={t("archive.averageDelay")}
            value={Math.abs(stats.averageDelay) < 3 ? t("archive.onTime") : fmt.duration(Math.abs(stats.averageDelay))}
            note={stats.averageDelay >= 3 ? t("archive.laterThanPlanned") : stats.averageDelay <= -3 ? t("archive.aheadOfSchedule") : t("archive.arrivals")}
          />
          <Metric label={t("archive.routeChanges")} value={String(stats.routeChanges)} note={t("archive.routeChangesNote")} />
          <Metric label={t("archive.signal")} value={`${stats.focusMix.sharp}·${stats.focusMix.steady}·${stats.focusMix.low}`} note={t("archive.signalNote")} />
        </dl>
      </section>

      <FocusInsights />
    </div>
  );
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div>
      <dt className="eyebrow text-[0.625rem]">{label}</dt>
      <dd className="mt-1.5 font-mono text-lg tabular text-paper">{value}</dd>
      <dd className="mt-0.5 text-xs text-mist">{note}</dd>
    </div>
  );
}
