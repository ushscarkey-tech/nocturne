"use client";

import Link from "next/link";
import { useMemo } from "react";
import { archiveStats, focusByDay, ticketFace } from "@/core/stats";
import { serviceDate } from "@/core/time";
import { Ticket } from "@/components/ticket/Ticket";
import { FocusInsights } from "@/components/insights/FocusInsights";
import { useData } from "@/state/store";
import { ticketHref } from "@/lib/paths";
import { useI18n } from "@/i18n";

export default function ArchivePage() {
  const data = useData();
  const { t, fmt } = useI18n();
  const today = serviceDate(new Date());
  const journeys = useMemo(
    () =>
      data.journeys
        .filter((j) => data.tickets.some((t) => t.journeyId === j.id))
        .sort((a, b) => b.date.localeCompare(a.date)),
    [data.journeys, data.tickets],
  );
  const stats = useMemo(() => archiveStats(data, today), [data, today]);
  const week = useMemo(() => focusByDay(data.sessions, today, 7), [data.sessions, today]);
  const maxDay = Math.max(60, ...week.map((d) => d.minutes));
  const change = stats.previousWeekFocused ? stats.weekFocused / stats.previousWeekFocused - 1 : null;

  return (
    <div className="animate-fade">
      <header>
        <p className="eyebrow">{t("archive.pastJourneys")}</p>
        <h1 className="mt-2 font-display text-5xl leading-none">{t("archive.title")}</h1>
      </header>

      <section className="mt-10" aria-labelledby="tickets-title">
        <h2 id="tickets-title" className="eyebrow">
          {t("archive.ticketCollection")}
        </h2>
        {journeys.length === 0 ? (
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-mist">
            {t("archive.noTickets")}
          </p>
        ) : (
          <ul className="-mx-6 mt-5 flex snap-x snap-mandatory gap-4 overflow-x-auto px-6 pb-4 [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0 lg:grid-cols-4">
            {journeys.map((j) => {
              const ticket = data.tickets.find((t) => t.journeyId === j.id)!;
              return (
                <li key={j.id} className="w-40 shrink-0 snap-start md:w-auto">
                  <Link href={ticketHref(j.id)} className="block transition-transform duration-700 ease-[var(--ease-glide)] hover:-translate-y-1" aria-label={t("archive.openTicket", { date: j.date })}>
                    <Ticket face={ticketFace(data, j)} style={ticket.ticketStyle} size="sm" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mt-14 border-t border-rule-soft pt-10" aria-labelledby="week-title">
        <div className="flex items-baseline justify-between">
          <h2 id="week-title" className="eyebrow">
            {t("archive.thisWeek")}
          </h2>
          {change !== null && Number.isFinite(change) && (
            <span className="font-mono text-xs text-mist tabular">
              {t("archive.vsLastWeek", { change: `${change >= 0 ? "+" : ""}${Math.round(change * 100)}` })}
            </span>
          )}
        </div>
        <p className="mt-3 font-mono text-4xl font-light tabular">{fmt.duration(stats.weekFocused)}</p>
        <p className="text-sm text-mist">{t("archive.focused")}</p>

        <div className="mt-8 flex h-32 items-end gap-3" role="img" aria-label={t("archive.dailyFocusLabel", { days: week.map((d) => `${fmt.weekday(d.date)} ${fmt.duration(d.minutes)}`).join(", ") })}>
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

      <section className="mt-12" aria-labelledby="patterns-title">
        <h2 id="patterns-title" className="eyebrow">
          {t("archive.lastFourWeeks")}
        </h2>
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
          <Metric
            label={t("archive.signal")}
            value={`${stats.focusMix.sharp}·${stats.focusMix.steady}·${stats.focusMix.low}`}
            note={t("archive.signalNote")}
          />
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
