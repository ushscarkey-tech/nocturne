"use client";

import Link from "next/link";
import { availabilityForDate } from "@/core/availability";
import { journeyFor } from "@/core/journey";
import { clock, formatDuration, formatHM, formatLongDate, minutesOfDay, toDateKey } from "@/core/time";
import { ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { RouteLine } from "@/components/route/RouteLine";
import { ConflictNotice } from "@/components/tonight/ConflictNotice";
import { useNow } from "@/lib/hooks";
import { routeItems, routeSummary } from "@/lib/route-view";
import { useConflict } from "@/lib/use-planner";
import { loadSampleData } from "@/state/actions";
import { useData } from "@/state/store";

export default function TonightPage() {
  const data = useData();
  const now = useNow(15_000);
  const today = toDateKey(now);
  const journey = journeyFor(data, today);
  const summary = routeSummary(data, today);
  const items = routeItems(data, today);
  const windows = availabilityForDate(data.windows, today);
  const { conflict } = useConflict(data, now);
  const ticket = journey ? data.tickets.find((t) => t.journeyId === journey.id) : undefined;

  const riding = journey && ["cabin", "stop", "paused"].includes(journey.phase) && journey.startedAt;
  const ended = journey?.phase === "final" && journey.startedAt;
  const serviceLeft = windows.some((w) => w.end > minutesOfDay(now));
  const nextDeparture = summary.next ? new Date(summary.next.plannedStart) : null;
  const departureLabel = nextDeparture
    ? nextDeparture.getTime() <= now.getTime() + 60_000
      ? "Now"
      : clock(nextDeparture)
    : null;
  const isEmptyAccount = data.tasks.length === 0;

  return (
    <div className="animate-fade">
      <header>
        <p className="font-mono text-[0.6875rem] tracking-[0.4em] text-paper-dim md:hidden">NOCTURNE</p>
        <p className="eyebrow mt-8 md:mt-0">{formatLongDate(today)}</p>
        <h1 className="mt-2 font-display text-[3.5rem] leading-none tracking-tight text-paper">Tonight</h1>
        {windows.length > 0 ? (
          <p className="mt-4 font-mono text-lg tabular text-paper-dim" aria-label="Service Time">
            {windows.map((w, i) => (
              <span key={w.start}>
                {i > 0 && <span className="px-2 text-haze">·</span>}
                {formatHM(w.start)} <span className="text-haze">→</span> {formatHM(w.end)}
              </span>
            ))}
          </p>
        ) : (
          <p className="mt-4 text-mist">No Service Time is set for today.</p>
        )}
      </header>

      <section aria-label="Tonight at a glance" className="mt-10 grid grid-cols-2 gap-8 border-t border-rule-soft pt-8">
        <div>
          <p className="font-mono text-3xl tabular text-paper">{summary.stations}</p>
          <p className="eyebrow mt-1">{summary.stations === 1 ? "Station" : "Stations"}</p>
        </div>
        <div>
          <p className="font-mono text-3xl tabular text-paper">{formatDuration(summary.plannedMinutes)}</p>
          <p className="eyebrow mt-1">Planned focus</p>
        </div>
        {!riding && !ended && departureLabel && (
          <div className="col-span-2">
            <p className="eyebrow">Next departure</p>
            <p className="mt-1 font-mono text-2xl tabular text-lamp">{departureLabel}</p>
          </div>
        )}
        {riding && summary.arrival && (
          <div className="col-span-2">
            <p className="eyebrow">Expected final arrival</p>
            <p className="mt-1 font-mono text-2xl tabular text-lamp">{clock(summary.arrival)}</p>
          </div>
        )}
      </section>

      <div className="mt-10 flex flex-wrap items-center gap-4">
        {riding ? (
          <ButtonLink href="/journey" variant="primary" size="lg">
            Return to Journey
          </ButtonLink>
        ) : ended ? (
          <ButtonLink href={ticket ? `/archive/${journey!.id}` : "/journey"} variant="primary" size="lg">
            {ticket ? "View tonight's ticket" : "Issue Ticket"}
          </ButtonLink>
        ) : summary.next ? (
          <ButtonLink href="/journey" variant="primary" size="lg">
            Board Train
          </ButtonLink>
        ) : null}
        {summary.stations > 0 && (
          <ButtonLink href="/route" variant="ghost" size="md">
            View Route <Icon name="chevron" size={14} />
          </ButtonLink>
        )}
      </div>

      {!summary.next && !riding && !ended && (
        <div className="mt-8 max-w-md text-sm leading-relaxed text-mist">
          {isEmptyAccount ? (
            <>
              <p>Your line is empty. Add what you need to do and Nocturne will plan the route.</p>
              <div className="mt-5 flex flex-wrap gap-3">
                <ButtonLink href="/tasks?new=1" variant="secondary">
                  Add a task
                </ButtonLink>
                <button
                  type="button"
                  onClick={() => void loadSampleData()}
                  className="h-11 px-2 text-sm text-mist underline decoration-rule underline-offset-4 hover:text-paper"
                >
                  Explore with sample tasks
                </button>
              </div>
            </>
          ) : !serviceLeft ? (
            <p>
              Service has ended for tonight.{" "}
              <Link href="/service" className="text-paper underline decoration-rule underline-offset-4">
                Adjust Service Time
              </Link>
            </p>
          ) : (
            <p>
              Nothing is scheduled for the rest of tonight — you&rsquo;re ahead of your line.{" "}
              <Link href="/tasks" className="text-paper underline decoration-rule underline-offset-4">
                Review tasks
              </Link>
            </p>
          )}
        </div>
      )}

      {conflict && (
        <div className="mt-12">
          <ConflictNotice conflict={conflict} tasks={data.tasks} />
        </div>
      )}

      {items.length > 0 && (
        <section aria-labelledby="route-preview" className="mt-14">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 id="route-preview" className="eyebrow">
              Route
            </h2>
            <Link href="/service" className="text-xs text-haze transition-colors hover:text-mist">
              Service Time
            </Link>
          </div>
          <RouteLine items={items} compact />
        </section>
      )}
    </div>
  );
}
