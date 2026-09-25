"use client";

import Link from "next/link";
import { useMemo } from "react";
import { archiveStats, focusByDay, ticketFace } from "@/core/stats";
import { formatDuration, formatHM, parseDateKey, serviceDate, WEEKDAY_SHORT } from "@/core/time";
import { Ticket } from "@/components/ticket/Ticket";
import { useData } from "@/state/store";
import { ticketHref } from "@/lib/paths";

export default function ArchivePage() {
  const data = useData();
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
        <p className="eyebrow">Past journeys</p>
        <h1 className="mt-2 font-display text-5xl leading-none">Archive</h1>
      </header>

      <section className="mt-10" aria-labelledby="tickets-title">
        <h2 id="tickets-title" className="eyebrow">
          Ticket collection
        </h2>
        {journeys.length === 0 ? (
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-mist">
            Tickets appear here after each journey. Board tonight&rsquo;s train to issue your first.
          </p>
        ) : (
          <ul className="-mx-6 mt-5 flex snap-x snap-mandatory gap-4 overflow-x-auto px-6 pb-4 [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0 lg:grid-cols-4">
            {journeys.map((j) => {
              const ticket = data.tickets.find((t) => t.journeyId === j.id)!;
              return (
                <li key={j.id} className="w-40 shrink-0 snap-start md:w-auto">
                  <Link href={ticketHref(j.id)} className="block transition-transform duration-700 ease-[var(--ease-glide)] hover:-translate-y-1" aria-label={`Open ticket for ${j.date}`}>
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
            This week
          </h2>
          {change !== null && Number.isFinite(change) && (
            <span className="font-mono text-xs text-mist tabular">
              {change >= 0 ? "+" : ""}
              {Math.round(change * 100)}% vs last week
            </span>
          )}
        </div>
        <p className="mt-3 font-mono text-4xl font-light tabular">{formatDuration(stats.weekFocused)}</p>
        <p className="text-sm text-mist">focused</p>

        <div className="mt-8 flex h-32 items-end gap-3" role="img" aria-label={`Daily focus this week: ${week.map((d) => `${WEEKDAY_SHORT[parseDateKey(d.date).getDay()]} ${formatDuration(d.minutes)}`).join(", ")}`}>
          {week.map((d) => (
            <div key={d.date} className="flex h-full flex-1 flex-col items-center gap-2">
              <div className="flex h-24 w-full items-end justify-center">
                <div
                  className={`w-full max-w-7 rounded-t-sm ${d.date === today ? "bg-lamp/80" : "bg-paper-dim/25"}`}
                  style={{ height: `${Math.max(2, (d.minutes / maxDay) * 100)}%` }}
                  title={formatDuration(d.minutes)}
                />
              </div>
              <span className={`font-mono text-[0.625rem] ${d.date === today ? "text-lamp" : "text-haze"}`}>
                {WEEKDAY_SHORT[parseDateKey(d.date).getDay()].slice(0, 2)}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-12" aria-labelledby="patterns-title">
        <h2 id="patterns-title" className="eyebrow">
          Last four weeks
        </h2>
        <dl className="mt-5 grid grid-cols-2 gap-x-8 gap-y-7 sm:grid-cols-3">
          <Metric label="Completion rate" value={`${Math.round(stats.completionRate * 100)}%`} note="stations finished as planned" />
          <Metric label="Stations completed" value={String(stats.stationsCompleted)} note="this week" />
          <Metric
            label="Estimated vs actual"
            value={`${formatDuration(stats.estimatedMinutes)} / ${formatDuration(stats.actualMinutes)}`}
            note={
              stats.estimateRatio > 1.08
                ? `Stations run ${Math.round((stats.estimateRatio - 1) * 100)}% longer than planned`
                : stats.estimateRatio < 0.92
                  ? `Stations finish ${Math.round((1 - stats.estimateRatio) * 100)}% early`
                  : "Estimates are close"
            }
          />
          <Metric
            label="Average delay"
            value={Math.abs(stats.averageDelay) < 3 ? "On time" : formatDuration(Math.abs(stats.averageDelay))}
            note={stats.averageDelay >= 3 ? "later than planned" : stats.averageDelay <= -3 ? "ahead of schedule" : "arrivals"}
          />
          <Metric label="Route changes" value={String(stats.routeChanges)} note="adjustments made for you" />
          <Metric
            label="Signal"
            value={`${stats.focusMix.sharp}·${stats.focusMix.steady}·${stats.focusMix.low}`}
            note="sharp · steady · low check-ins"
          />
        </dl>
      </section>

      {stats.byHour.length > 0 && (
        <section className="mt-12" aria-labelledby="hours-title">
          <h2 id="hours-title" className="eyebrow">
            Focus pattern
          </h2>
          <ul className="mt-4 space-y-2.5">
            {stats.byHour.map((h) => (
              <li key={h.hour} className="grid grid-cols-[3.5rem_1fr_4.5rem] items-center gap-3 text-xs">
                <span className="font-mono text-mist tabular">{formatHM(h.hour * 60)}</span>
                <span className="h-1 rounded-full bg-rule">
                  <span className="block h-1 rounded-full bg-paper-dim/50" style={{ width: `${Math.round(h.completion * 100)}%` }} />
                </span>
                <span className="text-right font-mono text-haze tabular">{Math.round(h.completion * 100)}% done</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-haze">Share of stations completed in full, by starting hour.</p>
        </section>
      )}
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
