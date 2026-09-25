"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { summarizeJourney } from "@/core/stats";
import { clock, formatDuration } from "@/core/time";
import type { Journey, NocturneData } from "@/core/types";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { continueService, issueTicket } from "@/state/actions";
import { serviceLeft } from "@/core/journey";
import { useState } from "react";
import { ConfirmFinish } from "./ConfirmFinish";
import { ticketHref } from "@/lib/paths";

const FOCUS_WORD = { low: "Low", steady: "Steady", sharp: "Sharp" } as const;

/** The motion has stopped. A calm summary of the night, then the ticket. */
export function FinalStation({ data, journey, now }: { data: NocturneData; journey: Journey; now: Date }) {
  const router = useRouter();
  const [nothingDue, setNothingDue] = useState(false);
  const left = serviceLeft(data, now);
  const s = summarizeJourney(data, journey);
  const ticket = data.tickets.find((t) => t.journeyId === journey.id);
  const unfinished = data.tasks.filter(
    (t) => s.taskIds.includes(t.id) && t.status === "active" && !t.recurrence && t.remainingMinutes > 0,
  );
  const focusPath = journey.focusLog.map((f) => FOCUS_WORD[f.level]);
  const tonightTasks = data.tasks.filter((t) => s.taskIds.includes(t.id));

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
          <li className="flex justify-between gap-6">
            <span className="text-mist">Timing</span>
            <span className="text-right font-mono tabular text-paper-dim">
              {unfinished.length > 0 && s.delayMinutes <= 2
                ? "Ended early"
                : Math.abs(s.delayMinutes) < 3
                  ? "On time"
                  : s.delayMinutes > 0
                    ? `${formatDuration(s.delayMinutes)} later than planned`
                    : `${formatDuration(-s.delayMinutes)} ahead`}
            </span>
          </li>
          {focusPath.length > 0 && (
            <li className="flex justify-between gap-6">
              <span className="text-mist">Signal</span>
              <span className="text-right text-paper-dim">{focusPath.join(" → ")}</span>
            </li>
          )}
        </ul>

        <div className="mt-8">
          <ConfirmFinish tasks={tonightTasks} />
        </div>

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
        {left >= 20 && !ticket && (
          <div className="mb-4 text-center">
            {nothingDue ? (
              <p className="text-xs text-haze">Nothing else is due soon — the night is yours.</p>
            ) : (
              <button
                type="button"
                onClick={() => setNothingDue(!continueService())}
                className="min-h-11 px-3 text-sm text-mist underline decoration-rule underline-offset-4 hover:text-paper"
              >
                {formatDuration(left)} of Service Time left · keep going with upcoming work
              </button>
            )}
          </div>
        )}
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
