"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { summarizeJourney } from "@/core/stats";
import { clock } from "@/core/time";
import type { Journey, NocturneData } from "@/core/types";
import { useI18n } from "@/i18n";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { continueService, issueTicket } from "@/state/actions";
import { serviceLeft } from "@/core/journey";
import { useState } from "react";
import { ConfirmFinish } from "./ConfirmFinish";
import { ticketHref } from "@/lib/paths";

// FOCUS_WORD values are now localized via i18n keys: common.low, common.steady, common.sharp

/** The motion has stopped. A calm summary of the night, then the ticket. */
export function FinalStation({ data, journey, now }: { data: NocturneData; journey: Journey; now: Date }) {
  const { t, fmt } = useI18n();
  const router = useRouter();
  const [nothingDue, setNothingDue] = useState(false);
  const left = serviceLeft(data, now);
  const s = summarizeJourney(data, journey);
  const ticket = data.tickets.find((t) => t.journeyId === journey.id);
  const unfinished = data.tasks.filter(
    (t) => s.taskIds.includes(t.id) && t.status === "active" && !t.recurrence && t.remainingMinutes > 0,
  );
  const focusPath = journey.focusLog.map((f) => t(`common.${f.level}` as const));
  const tonightTasks = data.tasks.filter((t) => s.taskIds.includes(t.id));

  return (
    <div className="flex min-h-dvh flex-col px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))]">
      <header className="flex justify-end">
        <Link href="/" className="rounded-full p-2 text-mist hover:text-paper" aria-label={t("common.back")}>
          <Icon name="close" size={18} />
        </Link>
      </header>
      <main className="mx-auto w-full max-w-md flex-1 animate-fade py-8">
        <p className="eyebrow text-lamp/90">{t("journey.finalStation")}</p>
        <p className="mt-4 font-mono text-6xl font-light tabular">{s.arrival ? clock(s.arrival) : "—"}</p>

        <h1 className="mt-12 eyebrow">{t("journey.tonightJourney")}</h1>
        <dl className="mt-5 grid grid-cols-2 gap-y-7 border-y border-rule py-7">
          <div>
            <dt className="eyebrow text-[0.625rem]">{t("journey.focusedTimeLabel")}</dt>
            <dd className="mt-1.5 font-mono text-2xl tabular">{fmt.duration(s.focusedMinutes)}</dd>
          </div>
          <div>
            <dt className="eyebrow text-[0.625rem]">{t("journey.plannedWorkLabel")}</dt>
            <dd className="mt-1.5 font-mono text-2xl tabular">{Math.round(s.completionRate * 100)}%</dd>
          </div>
          <div>
            <dt className="eyebrow text-[0.625rem]">{t("journey.stationsLabel")}</dt>
            <dd className="mt-1.5 font-mono text-2xl tabular">{s.stationsTotal}</dd>
          </div>
          <div>
            <dt className="eyebrow text-[0.625rem]">{t("journey.stationsCompletedLabel")}</dt>
            <dd className="mt-1.5 font-mono text-2xl tabular">{s.stationsCompleted}</dd>
          </div>
        </dl>

        <ul className="mt-6 space-y-2.5 text-sm">
          <li className="flex justify-between">
            <span className="text-mist">{t("journey.routeChangesLabel")}</span>
            <span className="font-mono tabular text-paper-dim">{journey.routeChanges}</span>
          </li>
          <li className="flex justify-between gap-6">
            <span className="text-mist">{t("journey.timingLabel")}</span>
            <span className="text-right font-mono tabular text-paper-dim">
              {unfinished.length > 0 && s.delayMinutes <= 2
                ? t("journey.endedEarly")
                : Math.abs(s.delayMinutes) < 3
                  ? t("journey.onTime")
                  : s.delayMinutes > 0
                    ? t("journey.laterThanPlanned", { duration: fmt.duration(s.delayMinutes) })
                    : t("journey.ahead", { duration: fmt.duration(-s.delayMinutes) })}
            </span>
          </li>
          {focusPath.length > 0 && (
            <li className="flex justify-between gap-6">
              <span className="text-mist">{t("journey.signalLabel")}</span>
              <span className="text-right text-paper-dim">{focusPath.join(" → ")}</span>
            </li>
          )}
        </ul>

        <div className="mt-8">
          <ConfirmFinish tasks={tonightTasks} />
        </div>

        {unfinished.length > 0 && (
          <div className="mt-8">
            <p className="eyebrow">{t("journey.continuesAnotherDay")}</p>
            <ul className="mt-2 space-y-1.5 text-sm">
              {unfinished.map((task) => (
                <li key={task.id} className="flex justify-between gap-4">
                  <span className="truncate text-paper-dim">{task.title}</span>
                  <span className="shrink-0 font-mono text-xs text-mist tabular">{t("journey.durationLeft", { duration: fmt.duration(task.remainingMinutes) })}</span>
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
              <p className="text-xs text-haze">{t("journey.nothingDueNow")}</p>
            ) : (
              <button
                type="button"
                onClick={() => setNothingDue(!continueService())}
                className="min-h-11 px-3 text-sm text-mist underline decoration-rule underline-offset-4 hover:text-paper"
              >
                {t("journey.serviceTimeLeft", { duration: fmt.duration(left) })}
              </button>
            )}
          </div>
        )}
        {ticket ? (
          <ButtonLink href={ticketHref(journey.id)} variant="primary" size="lg" className="w-full">
            {t("journey.viewTicket")}
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
            {t("journey.issueTicket")}
          </Button>
        )}
      </div>
    </div>
  );
}
