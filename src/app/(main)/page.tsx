"use client";

import Link from "next/link";
import { availabilityForDate } from "@/core/availability";
import { journeyFor } from "@/core/journey";
import { remainingSeconds } from "@/core/sessions";
import { clock, formatDuration, formatHM, formatLongDate, formatShortDate, serviceDate, serviceMinutes } from "@/core/time";
import { ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { ConfirmFinish } from "@/components/journey/ConfirmFinish";
import { RouteLine } from "@/components/route/RouteLine";
import { ConflictNotice } from "@/components/tonight/ConflictNotice";
import { useNow } from "@/lib/hooks";
import { taskHref, ticketHref } from "@/lib/paths";
import { routeItems, routeSummary } from "@/lib/route-view";
import { useConflict } from "@/lib/use-planner";
import { loadSampleData } from "@/state/actions";
import { useData } from "@/state/store";

export default function TonightPage() {
  const data = useData();
  const now = useNow(15_000);
  const today = serviceDate(now);
  const journey = journeyFor(data, today);
  const summary = routeSummary(data, today);
  const items = routeItems(data, today);
  const windows = availabilityForDate(data.windows, today);
  const { conflict } = useConflict(data, now);
  const ticket = journey ? data.tickets.find((t) => t.journeyId === journey.id) : undefined;
  const tasksById = new Map(data.tasks.map((t) => [t.id, t]));

  const riding = journey && ["cabin", "stop", "paused"].includes(journey.phase) && !!journey.startedAt;
  const ended = journey?.phase === "final" && !!journey.startedAt;
  const nowMin = serviceMinutes(now, today);
  const serviceLeft = windows.some((w) => w.end > nowMin);
  const next = summary.active ?? summary.next;
  const nextTask = next ? tasksById.get(next.taskId) : undefined;
  const departsAt = summary.next ? new Date(summary.next.plannedStart) : null;
  const departsNow = !!departsAt && departsAt.getTime() <= now.getTime() + 60_000;
  const isEmptyAccount = !data.tasks.some((t) => t.status !== "archived");
  const hasAnyService = data.windows.some((w) => w.enabled && w.kind === "available");
  const overdue = data.tasks.filter(
    (t) => t.status === "active" && !t.recurrence && t.deadline && t.deadline < today && t.remainingMinutes > 0,
  );

  return (
    <div className="animate-fade">
      <header>
        <p className="font-mono text-[0.6875rem] tracking-[0.4em] text-paper-dim md:hidden">NOCTURNE</p>
        <p className="eyebrow mt-8 md:mt-0">{formatLongDate(today)}</p>
        <h1 className="mt-2 font-display text-[3.5rem] leading-none tracking-tight text-paper">Tonight</h1>
        {windows.length > 0 ? (
          <p className="mt-4 font-mono text-base tabular text-paper-dim" aria-label="Service Time tonight">
            {windows.map((w, i) => (
              <span key={w.start}>
                {i > 0 && <span className="px-2 text-haze">·</span>}
                <span className={w.end <= nowMin ? "text-haze line-through decoration-haze/40" : ""}>
                  {formatHM(w.start)}
                  <span className="text-haze">–</span>
                  {formatHM(w.end)}
                </span>
              </span>
            ))}
          </p>
        ) : (
          <p className="mt-4 text-sm text-mist">No Service Time today.</p>
        )}
      </header>

      {/* What happens next — the one thing to read. */}
      <section aria-label="Next" className="mt-10 border-t border-rule-soft pt-8">
        {riding && summary.active && nextTask ? (
          <>
            <p className="eyebrow text-lamp/90">On board · {summary.active.stationName}</p>
            <p className="mt-3 line-clamp-2 break-words font-display text-3xl leading-tight">{nextTask.title}</p>
            <p className="mt-2 font-mono text-sm tabular text-mist">
              {formatDuration(remainingSeconds(summary.active, now) / 60)} left
              {summary.arrival && <> · final arrival {clock(summary.arrival)}</>}
            </p>
          </>
        ) : !ended && summary.next && nextTask ? (
          <>
            <p className="eyebrow">Next departure</p>
            <p className="mt-2 font-mono text-5xl font-light tabular text-lamp">{departsNow ? "Now" : clock(departsAt!)}</p>
            <p className="mt-4 line-clamp-2 break-words text-lg text-paper">{nextTask.title}</p>
            <p className="mt-1 font-mono text-xs tabular text-mist">
              {summary.next.stationName} · {formatDuration(summary.next.plannedMinutes)}
            </p>
          </>
        ) : ended ? (
          <>
            <p className="eyebrow">Final station</p>
            <p className="mt-3 font-display text-3xl leading-tight">Tonight&rsquo;s journey is complete.</p>
          </>
        ) : null}

        {summary.stations > 0 && (
          <p className="mt-6 font-mono text-sm tabular text-paper-dim">
            {summary.stations} {summary.stations === 1 ? "station" : "stations"}
            <span className="px-2 text-haze">·</span>
            {formatDuration(summary.plannedMinutes)} focus
            {summary.arrival && !ended && (
              <>
                <span className="px-2 text-haze">·</span>arrive {clock(summary.arrival)}
              </>
            )}
          </p>
        )}

        <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-3">
          {riding ? (
            <ButtonLink href="/journey" variant="primary" size="lg">
              Return to Journey
            </ButtonLink>
          ) : ended ? (
            <ButtonLink href={ticket ? ticketHref(journey!.id) : "/journey"} variant="primary" size="lg">
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
          <div className="max-w-md text-sm leading-relaxed text-mist">
            {isEmptyAccount ? (
              <>
                <p>Your line is empty. Add what you need to do and Nocturne will plan the route.</p>
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <ButtonLink href="/tasks?new=1" variant="primary">
                    Add a task
                  </ButtonLink>
                  <button
                    type="button"
                    onClick={() => void loadSampleData()}
                    className="min-h-11 px-2 text-sm text-mist underline decoration-rule underline-offset-4 hover:text-paper"
                  >
                    Explore with sample tasks
                  </button>
                </div>
              </>
            ) : !hasAnyService ? (
              <>
                <p>Nocturne needs to know when you can study before it can plan a route.</p>
                <div className="mt-5">
                  <ButtonLink href="/service" variant="primary">
                    Set your Service Time
                  </ButtonLink>
                </div>
              </>
            ) : windows.length === 0 ? (
              <p>
                No service today — the planner is spreading work across your other days.{" "}
                <Link href="/service" className="text-paper underline decoration-rule underline-offset-4">
                  Add time today
                </Link>
              </p>
            ) : !serviceLeft ? (
              <p>
                Service has ended for tonight.{" "}
                <Link href="/service" className="text-paper underline decoration-rule underline-offset-4">
                  Adjust Service Time
                </Link>
              </p>
            ) : (
              <p>
                Nothing is due on tonight&rsquo;s line — you&rsquo;re ahead.{" "}
                <Link href="/route" className="text-paper underline decoration-rule underline-offset-4">
                  Pull work forward
                </Link>
              </p>
            )}
          </div>
        )}
      </section>

      <div className="mt-10 space-y-8">
        <ConfirmFinish tasks={data.tasks} />
        {overdue.length > 0 && (
          <section aria-label="Past deadline" className="border-l border-lamp/50 pl-5">
            <p className="eyebrow text-lamp/90">Past deadline</p>
            <ul className="mt-2 space-y-1.5 text-sm">
              {overdue.map((t) => (
                <li key={t.id} className="text-paper-dim">
                  <Link href={taskHref(t.id, "deadline")} className="underline decoration-rule underline-offset-4 hover:text-paper">
                    {t.title}
                  </Link>{" "}
                  <span className="text-mist">
                    was due {formatShortDate(t.deadline!)} · {formatDuration(t.remainingMinutes)} left, first in line
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {conflict && <ConflictNotice conflict={conflict} tasks={data.tasks} />}
      </div>

      {items.length > 0 && (
        <section aria-labelledby="route-preview" className="mt-12">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 id="route-preview" className="eyebrow">
              Route
            </h2>
            <Link href="/service" className="py-2 text-xs text-haze transition-colors hover:text-mist">
              Service Time
            </Link>
          </div>
          <RouteLine items={items} compact />
        </section>
      )}
    </div>
  );
}
