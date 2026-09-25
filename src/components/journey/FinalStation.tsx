"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { summarizeJourney } from "@/core/stats";
import { clock, formatDuration } from "@/core/time";
import type { Journey, NocturneData } from "@/core/types";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { issueTicket } from "@/state/actions";
import { ticketHref } from "@/lib/paths";

const FOCUS_WORD = { low: "Low", steady: "Steady", sharp: "Sharp" } as const;

/** The motion has stopped. A calm summary of the night, then the ticket. */
export function FinalStation({ data, journey }: { data: NocturneData; journey: Journey }) {
  const router = useRouter();
  const s = summarizeJourney(data, journey);
  const ticket = data.tickets.find((t) => t.journeyId === journey.id);
  const unfinished = data.tasks.filter(
    (t) => s.taskIds.includes(t.id) && t.status === "active" && !t.recurrence && t.remainingMinutes > 0,
  );
  const focusPath = journey.focusLog.map((f) => FOCUS_WORD[f.level]);

  return (
    <div className="flex min-h-dvh flex-col px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))]">
      <header className="flex justify-end">
        <Link href="/" className="rounded-full p-2 text-mist hover:text-paper" aria-label="Back to Tonight">
          <Icon name="close" size={18} />
        </Link>
      </header>
      <main className="mx-auto w-full max-w-md flex-1 animate-fade py-8">
        <p className="eyebrow text-lamp/90">Final station</p>
        <p className="mt-4 font-mono text-6xl font-light tabular">{s.arrival ? clock(s.arrival) : "—"}</p>

        <h1 className="mt-12 eyebrow">Tonight&rsquo;s journey</h1>
        <dl className="mt-5 grid grid-cols-2 gap-y-7 border-y border-rule py-7">
          <div>
            <dt className="eyebrow text-[0.625rem]">Focused</dt>
            <dd className="mt-1.5 font-mono text-2xl tabular">{formatDuration(s.focusedMinutes)}</dd>
          </div>
          <div>
            <dt className="eyebrow text-[0.625rem]">Planned work</dt>
            <dd className="mt-1.5 font-mono text-2xl tabular">{Math.round(s.completionRate * 100)}%</dd>
          </div>
          <div>
            <dt className="eyebrow text-[0.625rem]">Stations</dt>
            <dd className="mt-1.5 font-mono text-2xl tabular">{s.stationsTotal}</dd>
          </div>
          <div>
            <dt className="eyebrow text-[0.625rem]">Completed</dt>
            <dd className="mt-1.5 font-mono text-2xl tabular">{s.stationsCompleted}</dd>
          </div>
        </dl>

        <ul className="mt-6 space-y-2.5 text-sm">
          <li className="flex justify-between">
            <span className="text-mist">Route changes</span>
            <span className="font-mono tabular text-paper-dim">{journey.routeChanges}</span>
          </li>
          <li className="flex justify-between">
            <span className="text-mist">{s.delayMinutes > 0 ? "Delay" : "Time gained"}</span>
            <span className="font-mono tabular text-paper-dim">
              {Math.abs(s.delayMinutes) < 3 ? "On time" : formatDuration(Math.abs(s.delayMinutes))}
            </span>
          </li>
          {focusPath.length > 0 && (
            <li className="flex justify-between gap-6">
              <span className="text-mist">Signal</span>
              <span className="text-right text-paper-dim">{focusPath.join(" → ")}</span>
            </li>
          )}
        </ul>

        {unfinished.length > 0 && (
          <div className="mt-8">
            <p className="eyebrow">Continues on another day</p>
            <ul className="mt-2 space-y-1.5 text-sm">
              {unfinished.map((t) => (
                <li key={t.id} className="flex justify-between gap-4">
                  <span className="truncate text-paper-dim">{t.title}</span>
                  <span className="shrink-0 font-mono text-xs text-mist tabular">{formatDuration(t.remainingMinutes)} left</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>
      <div className="mx-auto w-full max-w-md">
        {ticket ? (
          <ButtonLink href={ticketHref(journey.id)} variant="primary" size="lg" className="w-full">
            View ticket
          </ButtonLink>
        ) : (
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            onClick={() => {
              issueTicket(journey.id);
              router.push(ticketHref(journey.id, true));
            }}
          >
            Issue Ticket
          </Button>
        )}
      </div>
    </div>
  );
}
