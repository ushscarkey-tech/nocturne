"use client";

import Link from "next/link";
import { availabilityForDate } from "@/core/availability";
import { journeyFor } from "@/core/journey";
import { remainingSeconds } from "@/core/sessions";
import { clock, formatHM, serviceDate, serviceMinutes } from "@/core/time";
import { ButtonLink, buttonClass } from "@/components/ui/Button";
import { useQuickAdd } from "@/components/quickadd/QuickAdd";
import { Icon } from "@/components/ui/Icon";
import { ConfirmFinish } from "@/components/journey/ConfirmFinish";
import { RouteLine } from "@/components/route/RouteLine";
import { PlatformScene } from "@/components/scene/PlatformScene";
import { ConflictNotice } from "@/components/tonight/ConflictNotice";
import { useNow } from "@/lib/hooks";
import { taskHref, ticketHref } from "@/lib/paths";
import { routeItems, routeSummary } from "@/lib/route-view";
import { useConflict } from "@/lib/use-planner";
import { loadSampleData } from "@/state/actions";
import { useI18n } from "@/i18n";
import { useData } from "@/state/store";

export default function TonightPage() {
  const data = useData();
  const { t, fmt } = useI18n();
  const now = useNow(15_000);
  const today = serviceDate(now);
  const journey = journeyFor(data, today);
  const summary = routeSummary(data, today);
  const items = routeItems(data, today);
  const windows = availabilityForDate(data.windows, today);
  const { conflict } = useConflict(data, now);
  const ticket = journey ? data.tickets.find((x) => x.journeyId === journey.id) : undefined;
  const tasksById = new Map(data.tasks.map((task) => [task.id, task]));

  const riding = journey && ["cabin", "stop", "paused"].includes(journey.phase) && !!journey.startedAt;
  const ended = journey?.phase === "final" && !!journey.startedAt;
  const nowMin = serviceMinutes(now, today);
  const serviceLeft = windows.some((w) => w.end > nowMin);
  const next = summary.active ?? summary.next;
  const nextTask = next ? tasksById.get(next.taskId) : undefined;
  const departsAt = summary.next ? new Date(summary.next.plannedStart) : null;
  const departsNow = !!departsAt && departsAt.getTime() <= now.getTime() + 60_000;
  const isEmptyAccount = !data.tasks.some((task) => task.status !== "archived");
  const hasAnyService = data.windows.some((w) => w.enabled && w.kind === "available");
  const overdue = data.tasks.filter(
    (task) => task.status === "active" && !task.recurrence && task.deadline && task.deadline < today && task.remainingMinutes > 0,
  );

  return (
    <div className="animate-fade">
      <header className="relative">
        {/* A quiet platform at night, behind the evening's summary. */}
        <PlatformScene
          className="absolute -top-[max(2.5rem,env(safe-area-inset-top))] left-1/2 -z-10 h-[min(62vh,560px)] w-screen -translate-x-1/2 md:-top-14 md:w-full md:rounded-b-3xl"
          stationName={next?.stationName ?? "NOCTURNE"}
        />
        <div className="flex items-center justify-between">
          <p className="font-mono text-[0.6875rem] tracking-[0.4em] text-paper-dim md:invisible">NOCTURNE</p>
          <Link href="/settings" aria-label={t("shell.settings")} className="-mr-3 flex h-11 w-11 items-center justify-center text-mist hover:text-paper md:hidden">
            <Icon name="settings" size={18} />
          </Link>
        </div>
        <p className="eyebrow mt-[min(30vh,15rem)] md:mt-[12rem]">{fmt.longDate(today)}</p>
        <h1 className="mt-2 font-display text-[3.5rem] leading-none tracking-tight text-paper">{t("tonight.title")}</h1>
        {windows.length > 0 ? (
          <p className="mt-4 font-mono text-base tabular text-paper-dim" aria-label={t("tonight.serviceLabel")}>
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
          <p className="mt-4 text-sm text-mist">{t("tonight.noServiceToday")}</p>
        )}
      </header>

      {/* What happens next — the one thing to read. */}
      <section aria-label={t("tonight.next")} className="mt-10 border-t border-rule-soft pt-8">
        {riding && summary.active && nextTask ? (
          <>
            <p className="eyebrow text-lamp/90">
              {t("tonight.onBoard")} · {summary.active.stationName}
            </p>
            <p className="mt-3 line-clamp-2 break-words font-display text-3xl leading-tight">{nextTask.title}</p>
            <p className="mt-2 font-mono text-sm tabular text-mist">
              {t("tonight.left", { min: remainingSeconds(summary.active, now) / 60 })}
              {summary.arrival && <> · {t("tonight.finalArrival", { at: clock(summary.arrival) })}</>}
            </p>
          </>
        ) : !ended && summary.next && nextTask ? (
          <>
            <p className="eyebrow">{t("tonight.nextDeparture")}</p>
            <p className="mt-2 font-mono text-5xl font-light tabular text-lamp">{departsNow ? t("tonight.now") : clock(departsAt!)}</p>
            <p className="mt-4 line-clamp-2 break-words text-lg text-paper">{nextTask.title}</p>
            <p className="mt-1 font-mono text-xs tabular text-mist">
              {summary.next.stationName} · {fmt.duration(summary.next.plannedMinutes)}
            </p>
          </>
        ) : ended ? (
          <>
            <p className="eyebrow">{t("tonight.finalStation")}</p>
            <p className="mt-3 font-display text-3xl leading-tight">{t("tonight.complete")}</p>
          </>
        ) : null}

        {summary.stations > 0 && (
          <p className="mt-6 font-mono text-sm tabular text-paper-dim">
            {summary.stations === 1 ? t("common.oneStation") : t("common.nStations", { n: summary.stations })}
            <span className="px-2 text-haze">·</span>
            {t("tonight.focus", { min: summary.plannedMinutes })}
            {summary.arrival && !ended && (
              <>
                <span className="px-2 text-haze">·</span>
                {t("tonight.arrive", { at: clock(summary.arrival) })}
              </>
            )}
          </p>
        )}

        <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-3">
          {riding ? (
            <ButtonLink href="/journey" variant="primary" size="lg">
              {t("tonight.return")}
            </ButtonLink>
          ) : ended ? (
            <ButtonLink href={ticket ? ticketHref(journey!.id) : "/journey"} variant="primary" size="lg">
              {ticket ? t("tonight.viewTicket") : t("tonight.issueTicket")}
            </ButtonLink>
          ) : summary.next ? (
            <ButtonLink href="/journey" variant="primary" size="lg">
              {t("tonight.board")}
            </ButtonLink>
          ) : null}
          {summary.stations > 0 && (
            <ButtonLink href="/route" variant="ghost" size="md">
              {t("tonight.viewRoute")} <Icon name="chevron" size={14} />
            </ButtonLink>
          )}
        </div>

        {!summary.next && !riding && !ended && (
          <div className="max-w-md text-sm leading-relaxed text-mist">
            {isEmptyAccount ? (
              <>
                <p>{t("tonight.emptyLine")}</p>
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => useQuickAdd.getState().show()}
                    className={buttonClass("primary", "md")}
                  >
                    {t("tonight.addTask")}
                  </button>
                  <button
                    type="button"
                    onClick={() => void loadSampleData()}
                    className="min-h-11 px-2 text-sm text-mist underline decoration-rule underline-offset-4 hover:text-paper"
                  >
                    {t("tonight.sample")}
                  </button>
                </div>
              </>
            ) : !hasAnyService ? (
              <>
                <p>{t("tonight.needService")}</p>
                <div className="mt-5">
                  <ButtonLink href="/service" variant="primary">
                    {t("tonight.setService")}
                  </ButtonLink>
                </div>
              </>
            ) : windows.length === 0 ? (
              <p>
                {t("tonight.noServiceSpread")}{" "}
                <Link href="/service" className="text-paper underline decoration-rule underline-offset-4">
                  {t("tonight.addTimeToday")}
                </Link>
              </p>
            ) : !serviceLeft ? (
              <p>
                {t("tonight.serviceEnded")}{" "}
                <Link href="/service" className="text-paper underline decoration-rule underline-offset-4">
                  {t("tonight.adjustService")}
                </Link>
              </p>
            ) : (
              <p>
                {t("tonight.nothingDue")}{" "}
                <Link href="/route" className="text-paper underline decoration-rule underline-offset-4">
                  {t("tonight.pullForward")}
                </Link>
              </p>
            )}
          </div>
        )}
      </section>

      <div className="mt-10 space-y-8">
        <ConfirmFinish tasks={data.tasks} />
        {overdue.length > 0 && (
          <section aria-label={t("tonight.pastDeadline")} className="border-l border-lamp/50 pl-5">
            <p className="eyebrow text-lamp/90">{t("tonight.pastDeadline")}</p>
            <ul className="mt-2 space-y-1.5 text-sm">
              {overdue.map((task) => (
                <li key={task.id} className="text-paper-dim">
                  <Link href={taskHref(task.id, "deadline")} className="underline decoration-rule underline-offset-4 hover:text-paper">
                    {task.title}
                  </Link>{" "}
                  <span className="text-mist">
                    {t("tonight.wasDue", { date: fmt.shortDate(task.deadline!), min: task.remainingMinutes })}
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
              {t("tonight.route")}
            </h2>
            <Link href="/service" className="py-2 text-xs text-haze transition-colors hover:text-mist">
              {t("tonight.serviceTime")}
            </Link>
          </div>
          <RouteLine items={items} compact />
        </section>
      )}
    </div>
  );
}
