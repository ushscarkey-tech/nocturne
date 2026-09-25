"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { summarizeJourney, ticketFace } from "@/core/stats";
import { clock, formatDuration, formatLongDate } from "@/core/time";
import { CARRIAGES } from "@/components/journey/Boarding";
import { Icon } from "@/components/ui/Icon";
import { Ticket } from "@/components/ticket/Ticket";
import { useData } from "@/state/store";

export default function TicketPage() {
  return (
    <Suspense>
      <TicketDetail />
    </Suspense>
  );
}

function TicketDetail() {
  const params = useSearchParams();
  const id = params.get("id") ?? "";
  const issued = params.get("issued") === "1";
  const data = useData();
  const journey = data.journeys.find((j) => j.id === id);
  const ticket = data.tickets.find((t) => t.journeyId === id);

  if (!journey) {
    return (
      <div className="animate-fade">
        <BackLink />
        <p className="mt-10 text-mist">This ticket could not be found.</p>
      </div>
    );
  }

  const s = summarizeJourney(data, journey);
  const face = ticketFace(data, journey);
  const titleOf = (taskId: string) => data.tasks.find((t) => t.id === taskId)?.title ?? "Removed task";
  const gained = s.delayMinutes < -2 ? -s.delayMinutes : 0;
  const delayed = s.delayMinutes > 2 ? s.delayMinutes : 0;

  return (
    <div className="animate-fade">
      <BackLink />
      <header className="mt-8">
        <p className="eyebrow">{issued ? "Ticket issued" : "Journey"}</p>
        <h1 className="mt-2 font-display text-4xl leading-tight">{formatLongDate(journey.date)}</h1>
      </header>

      <div className={`mt-10 flex justify-center ${issued ? "animate-rise" : ""}`}>
        <Ticket face={face} style={ticket?.ticketStyle ?? journey.selectedCarriage} />
      </div>

      <dl className="mt-12 grid grid-cols-2 gap-x-8 gap-y-6 border-t border-rule-soft pt-8 sm:grid-cols-4">
        <Stat label="Planned" value={formatDuration(s.plannedMinutes)} />
        <Stat label="Focused" value={formatDuration(s.focusedMinutes)} />
        <Stat label="Stations" value={`${s.stationsCompleted} / ${s.stationsTotal}`} />
        <Stat label="Route changes" value={String(journey.routeChanges)} />
        <Stat label="Delay" value={delayed ? formatDuration(delayed) : "—"} />
        <Stat label="Ahead of schedule" value={gained ? formatDuration(gained) : "—"} />
        <Stat label="Carriage" value={CARRIAGES.find((c) => c.id === journey.selectedCarriage)?.name ?? ""} />
        <Stat label="Seat" value={`Car ${journey.car} · ${journey.seat}`} />
      </dl>

      <section className="mt-12" aria-labelledby="stations-title">
        <h2 id="stations-title" className="eyebrow">
          Stations
        </h2>
        <ol className="mt-3 divide-y divide-rule-soft">
          {s.stations.map((st) => (
            <li key={st.id} className="flex items-center justify-between gap-4 py-3.5 text-sm">
              <span className="min-w-0">
                <span className="block truncate text-paper-dim">{titleOf(st.taskId)}</span>
                <span className="eyebrow text-[0.6rem] text-haze">
                  {st.stationName} · {clock(st.actualStart ?? st.plannedStart)}
                </span>
              </span>
              <span className="shrink-0 text-right font-mono text-xs tabular text-mist">
                {st.status === "done" || st.status === "partial" ? formatDuration(st.completedMinutes) : "not reached"}
                {st.status === "partial" && <span className="block text-haze">partial</span>}
                {st.status === "done" && st.completedMinutes !== st.workMinutes && (
                  <span className="block text-haze">planned {formatDuration(st.workMinutes)}</span>
                )}
              </span>
            </li>
          ))}
        </ol>
      </section>

      {journey.changeLog.length > 0 && (
        <section className="mt-12" aria-labelledby="changes-title">
          <h2 id="changes-title" className="eyebrow">
            Route changes
          </h2>
          <ul className="mt-3 space-y-4">
            {journey.changeLog.map((c) => (
              <li key={c.at} className="border-l border-rule pl-4 text-sm">
                <p className="font-mono text-xs text-haze tabular">{clock(c.at)}</p>
                {c.lines.map((l) => (
                  <p key={l} className="mt-1 text-mist">
                    {l}
                  </p>
                ))}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/archive" className="inline-flex items-center gap-1 text-sm text-mist hover:text-paper">
      <Icon name="back" size={16} /> Archive
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="eyebrow text-[0.625rem]">{label}</dt>
      <dd className="mt-1.5 font-mono text-base tabular text-paper">{value}</dd>
    </div>
  );
}
