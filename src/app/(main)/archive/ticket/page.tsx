"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { summarizeJourney, ticketFace } from "@/core/stats";
import { clock } from "@/core/time";
import { CARRIAGES } from "@/components/journey/Boarding";
import { Icon } from "@/components/ui/Icon";
import { Sheet } from "@/components/ui/Sheet";
import { Ticket } from "@/components/ticket/Ticket";
import { useData } from "@/state/store";
import { useI18n, type MessageKey } from "@/i18n";

/**
 * The ticket arrives folded along its perforation and opens: the upper half
 * first, then the stub. With reduced motion it simply fades in.
 */
const UNFOLD = `
.nocturne-unfold article { perspective: 1100px; }
.nocturne-unfold [data-ticket-part="main"] {
  transform-origin: 50% 100%;
  backface-visibility: hidden;
  animation: nocturne-unfold-main 900ms cubic-bezier(0.22, 1, 0.36, 1) 150ms both;
}
.nocturne-unfold [data-ticket-part="stub"] {
  transform-origin: 50% 0%;
  backface-visibility: hidden;
  animation: nocturne-unfold-stub 800ms cubic-bezier(0.22, 1, 0.36, 1) 750ms both;
}
@keyframes nocturne-unfold-main {
  from { transform: rotateX(80deg); opacity: 0; }
  35% { opacity: 1; }
  to { transform: none; opacity: 1; }
}
@keyframes nocturne-unfold-stub {
  from { transform: rotateX(-80deg); opacity: 0; }
  35% { opacity: 1; }
  to { transform: none; opacity: 1; }
}
@keyframes nocturne-unfold-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .nocturne-unfold [data-ticket-part] { animation: nocturne-unfold-fade 500ms ease both; }
}
`;

export default function TicketPage() {
  return (
    <Suspense>
      <TicketDetail />
    </Suspense>
  );
}

function TicketDetail() {
  const { t, tm, fmt } = useI18n();
  const params = useSearchParams();
  const id = params.get("id") ?? "";
  const issued = params.get("issued") === "1";
  const data = useData();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const journey = data.journeys.find((j) => j.id === id);
  const ticket = data.tickets.find((t) => t.journeyId === id);

  if (!journey) {
    return (
      <div className="animate-fade">
        <BackLink />
        <p className="mt-10 text-mist">{t("archive.ticketNotFound")}</p>
      </div>
    );
  }

  const s = summarizeJourney(data, journey);
  const face = ticketFace(data, journey);
  const titleOf = (taskId: string) => data.tasks.find((t) => t.id === taskId)?.title ?? t("archive.removedTask");
  const gained = s.delayMinutes < -2 ? -s.delayMinutes : 0;
  const delayed = s.delayMinutes > 2 ? s.delayMinutes : 0;

  return (
    <div className="animate-fade">
      <style href="nocturne-ticket-unfold" precedence="default">
        {UNFOLD}
      </style>
      <BackLink />
      <header className="mt-6 text-center">
        <p className="eyebrow">{issued ? t("archive.ticketIssued") : t("archive.journey")}</p>
        <h1 className="mt-1.5 font-display text-3xl leading-tight">{fmt.longDate(journey.date)}</h1>
      </header>

      <div className="nocturne-unfold mt-6 flex justify-center">
        <Ticket face={face} style={ticket?.ticketStyle ?? journey.selectedCarriage} size="lg" />
      </div>

      <div className="mt-5 flex justify-center">
        <button
          type="button"
          onClick={() => setDetailsOpen(true)}
          aria-haspopup="dialog"
          className="flex h-11 items-center gap-2 rounded-full px-5 text-sm text-mist transition-colors duration-500 ease-[var(--ease-glide)] hover:text-paper"
        >
          {t("archive.journeyDetails")}
          <Icon name="chevron" size={14} className="-rotate-90" />
        </button>
      </div>

      <Sheet open={detailsOpen} onClose={() => setDetailsOpen(false)} title={t("archive.journeyDetails")} eyebrow={fmt.longDate(journey.date)} wide>
        <dl className="grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-4">
          <Stat label={t("archive.statPlanned")} value={fmt.duration(s.plannedMinutes)} />
          <Stat label={t("archive.statFocused")} value={fmt.duration(s.focusedMinutes)} />
          <Stat label={t("archive.statStations")} value={`${s.stationsCompleted} / ${s.stationsTotal}`} />
          <Stat label={t("archive.statRouteChanges")} value={String(journey.routeChanges)} />
          <Stat label={t("archive.statDelay")} value={delayed ? fmt.duration(delayed) : "—"} />
          <Stat label={t("archive.statAheadOfSchedule")} value={gained ? fmt.duration(gained) : "—"} />
          <Stat label={t("archive.statCarriage")} value={t((CARRIAGES.find((c) => c.id === journey.selectedCarriage)?.nameKey ?? "journey.quietCar") as MessageKey)} />
          <Stat label={t("archive.statSeat")} value={t("archive.carSeat", { car: journey.car, seat: journey.seat })} />
        </dl>

        <section className="mt-10 border-t border-rule-soft pt-8" aria-labelledby="stations-title">
          <h3 id="stations-title" className="eyebrow">
            {t("archive.stations")}
          </h3>
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
                  {st.status === "done" || st.status === "partial" ? fmt.duration(st.completedMinutes) : t("archive.notReached")}
                  {st.status === "partial" && <span className="block text-haze">{t("archive.partial")}</span>}
                  {st.status === "done" && st.completedMinutes !== st.workMinutes && (
                    <span className="block text-haze">
                      {t("archive.planned")} {fmt.duration(st.workMinutes)}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ol>
        </section>

        {journey.changeLog.length > 0 && (
          <section className="mt-10" aria-labelledby="changes-title">
            <h3 id="changes-title" className="eyebrow">
              {t("archive.routeChanges")}
            </h3>
            <ul className="mt-3 space-y-4">
              {journey.changeLog.map((c) => (
                <li key={c.at} className="border-l border-rule pl-4 text-sm">
                  <p className="font-mono text-xs text-haze tabular">{clock(c.at)}</p>
                  {(c.messages ? c.messages.map(tm) : c.lines).map((l, i) => (
                    <p key={i} className="mt-1 text-mist">
                      {l}
                    </p>
                  ))}
                </li>
              ))}
            </ul>
          </section>
        )}
      </Sheet>
    </div>
  );
}

function BackLink() {
  const { t } = useI18n();
  return (
    <Link href="/archive" className="inline-flex items-center gap-1 text-sm text-mist hover:text-paper">
      <Icon name="back" size={16} /> {t("shell.archive")}
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
