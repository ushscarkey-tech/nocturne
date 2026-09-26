"use client";

import Link from "next/link";
import { useRef, useState, type ReactNode } from "react";
import { availabilityForDate } from "@/core/availability";
import { awaitingConfirmation, journeyFor } from "@/core/journey";
import { remainingSeconds, routeOf } from "@/core/sessions";
import { clock, formatHM, serviceDate, serviceMinutes } from "@/core/time";
import { Button, ButtonLink, buttonClass } from "@/components/ui/Button";
import { useQuickAdd } from "@/components/quickadd/QuickAdd";
import { Icon } from "@/components/ui/Icon";
import { Sheet } from "@/components/ui/Sheet";
import { ConfirmFinish } from "@/components/journey/ConfirmFinish";
import { RouteLine } from "@/components/route/RouteLine";
import { FlipText } from "@/components/scene/FlipText";
import { PlatformClock } from "@/components/scene/PlatformClock";
import { PlatformScene } from "@/components/scene/PlatformScene";
import { ConflictNotice } from "@/components/tonight/ConflictNotice";
import { DepartureBoard, RecentChangeDetail } from "@/components/tonight/DepartureBoard";
import { ArrivalLine, ArrivalSheet, useArrivals } from "@/components/tonight/ArrivalForecast";
import { useGlossary } from "@/components/help/Glossary";
import { Coach } from "@/components/tonight/Coach";
import { useNow } from "@/lib/hooks";
import { taskHref, ticketHref } from "@/lib/paths";
import { routeItems, routeSummary } from "@/lib/route-view";
import { useConflict } from "@/lib/use-planner";
import { loadSampleData } from "@/state/actions";
import { useI18n } from "@/i18n";
import { useData } from "@/state/store";

type Panel = null | "route" | "conflict" | "overdue" | "confirm" | "arrival";

/**
 * Tonight is one scene: an empty platform at night, the time the train
 * leaves, and the way on board. Everything else is a tap away.
 */
export default function TonightPage() {
  const data = useData();
  const { t, fmt } = useI18n();
  const now = useNow(1000);
  const today = serviceDate(now);
  const journey = journeyFor(data, today);
  const summary = routeSummary(data, today);
  const route = routeOf(data.sessions, today);
  const windows = availabilityForDate(data.windows, today);
  const { conflict, forecast } = useConflict(data, now);
  const arrivals = useArrivals(data, forecast, today);
  const [panel, setPanel] = useState<Panel>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const departRef = useRef<HTMLDivElement>(null);
  const boardButtonRef = useRef<HTMLDivElement>(null);
  const ticket = journey ? data.tickets.find((x) => x.journeyId === journey.id) : undefined;
  const tasksById = new Map(data.tasks.map((task) => [task.id, task]));

  const riding = !!journey && ["cabin", "stop", "paused"].includes(journey.phase) && !!journey.startedAt;
  const ended = journey?.phase === "final" && !!journey.startedAt;
  const nowMin = serviceMinutes(now, today);
  const serviceLeft = windows.some((w) => w.end > nowMin);
  const active = summary.active;
  const next = active ?? summary.next;
  const nextTask = next ? tasksById.get(next.taskId) : undefined;
  const departsAt = summary.next ? new Date(summary.next.plannedStart) : null;
  const departsNow = !!departsAt && departsAt.getTime() <= now.getTime() + 60_000;
  const isEmptyAccount = !data.tasks.some((task) => task.status !== "archived");
  const hasAnyService = data.windows.some((w) => w.enabled && w.kind === "available");
  const overdue = data.tasks.filter(
    (task) => task.status === "active" && !task.recurrence && task.deadline && task.deadline < today && task.remainingMinutes > 0,
  );
  const waiting = data.tasks.filter(awaitingConfirmation);

  return (
    <div className="relative isolate flex h-full flex-col">
      {/* An empty platform at night. */}
      <PlatformScene className="absolute inset-0 -z-10" fade={false} stationName={fmt.station(next?.stationName ?? "NOCTURNE")} />
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(4,6,10,0.72)_0%,rgba(4,6,10,0.05)_22%,rgba(4,6,10,0)_40%,rgba(4,6,10,0.78)_70%,rgba(4,6,10,0.96)_100%)]" />

      <header className="flex animate-enter items-center justify-between px-6 pt-[max(1.25rem,env(safe-area-inset-top))] md:px-10 md:pt-8" style={{ animationDelay: "150ms" }}>
        <p className="font-mono text-[0.6875rem] tracking-[0.4em] text-paper-dim">NOCTURNE</p>
        <div className="-mr-2 flex items-center gap-1">
          <PlatformClock now={now} size={26} className="mr-2 opacity-80" />
          <button
            type="button"
            onClick={() => useQuickAdd.getState().show()}
            aria-label={t("quickadd.open")}
            className="flex h-11 w-11 items-center justify-center rounded-full text-mist transition-colors hover:text-paper"
          >
            <Icon name="plus" size={19} />
          </button>
        </div>
      </header>
      <div className="mt-3 flex animate-enter items-baseline justify-between gap-4 px-6 md:px-10" style={{ animationDelay: "350ms" }}>
        <p className="eyebrow text-paper-dim/80">{fmt.longDate(today)}</p>
        {windows.length > 0 && (
          <p className="truncate font-mono text-[0.6875rem] tabular text-mist" aria-label={t("tonight.serviceLabel")}>
            {windows.map((w, i) => (
              <span key={w.start} className={w.end <= nowMin ? "text-haze line-through decoration-haze/40" : ""}>
                {i > 0 && <span className="px-1.5 text-haze no-underline">·</span>}
                {formatHM(w.start)}–{formatHM(w.end)}
              </span>
            ))}
          </p>
        )}
      </div>

      {/* The departure board hanging over the platform. */}
      {route.length > 0 && (
        <div ref={boardRef} className="mt-7 w-full px-6 md:max-w-2xl md:px-10">
          <DepartureBoard data={data} now={now} forecast={forecast} onOpen={() => setPanel("route")} className="animate-enter" style={{ animationDelay: "550ms" }} />
        </div>
      )}

      {/* The platform breathes here. */}
      <div className="min-h-0 flex-1" />

      <section aria-label={t("tonight.next")} className="w-full px-6 pb-[calc(5.75rem+env(safe-area-inset-bottom))] md:max-w-2xl md:px-10">
        {riding && active && nextTask ? (
          <div className="animate-enter" style={{ animationDelay: "700ms" }}>
            <p className="eyebrow text-lamp/90">
              {t("scene.onBoardNow")} · {fmt.station(active.stationName)}
            </p>
            <p className="mt-3 line-clamp-2 break-words font-display text-[2.1rem] leading-tight">{nextTask.title}</p>
            <p className="mt-2 font-mono text-sm tabular text-mist">
              {t("tonight.left", { min: remainingSeconds(active, now) / 60 })}
              {summary.arrival && <> · {t("tonight.finalArrival", { at: clock(summary.arrival) })}</>}
            </p>
          </div>
        ) : riding ? (
          <>
            <p className="eyebrow text-lamp/90">{t("scene.onBoardNow")}</p>
            <p className="mt-3 font-display text-[2.1rem] leading-tight">{t("scene.waiting")}</p>
          </>
        ) : ended ? (
          <>
            <p className="eyebrow text-lamp/90">{t("scene.finalStation")}</p>
            <p className="mt-3 font-display text-[2.1rem] leading-tight">{t("tonight.complete")}</p>
          </>
        ) : summary.next && nextTask ? (
          <div ref={departRef}>
            <p className="eyebrow animate-enter" style={{ animationDelay: "700ms" }}>{t("scene.departure")}</p>
            <p className="mt-1 animate-enter font-mono text-[clamp(4.25rem,21vw,6.5rem)] font-extralight leading-none tracking-tight text-lamp tabular" style={{ animationDelay: "900ms" }}>
              <FlipText text={departsNow ? t("tonight.now") : clock(departsAt!)} />
            </p>
            <p className="mt-4 animate-enter font-mono text-sm tabular text-paper-dim" style={{ animationDelay: "1150ms" }}>
              {t("scene.stopsSummary", { n: summary.remaining, min: fmt.duration(summary.plannedMinutes) })}
              {summary.arrival && (
                <>
                  <span className="px-2 text-haze">·</span>
                  {t("tonight.arrive", { at: clock(summary.arrival) })}
                </>
              )}
            </p>
            <ArrivalLine summary={arrivals} onOpen={() => setPanel("arrival")} className="mt-3 animate-enter" style={{ animationDelay: "1300ms" }} />
          </div>
        ) : (
          <EmptyState
            isEmptyAccount={isEmptyAccount}
            hasAnyService={hasAnyService}
            hasWindows={windows.length > 0}
            serviceLeft={serviceLeft}
          />
        )}

        {!isEmptyAccount && (riding || ended || !summary.next) && (
          <ArrivalLine summary={arrivals} onOpen={() => setPanel("arrival")} className="mt-3 animate-enter" style={{ animationDelay: "1300ms" }} />
        )}

        {(conflict || overdue.length > 0 || waiting.length > 0) && (
          <div className="mt-5 flex animate-enter flex-wrap gap-2" style={{ animationDelay: "1450ms" }}>
            {conflict && (
              <Chip tone="signal" onClick={() => setPanel("conflict")}>
                {t("scene.conflict")}
              </Chip>
            )}
            {overdue.length > 0 && <Chip onClick={() => setPanel("overdue")}>{t("scene.pastDeadline", { n: overdue.length })}</Chip>}
            {waiting.length > 0 && <Chip onClick={() => setPanel("confirm")}>{t("scene.checkTasks", { n: waiting.length })}</Chip>}
          </div>
        )}

        <div ref={boardButtonRef} className="mt-5 animate-enter" style={{ animationDelay: "1750ms" }}>
          {riding ? (
            <ButtonLink href="/journey" variant="primary" size="lg" className="w-full">
              {t("scene.returnToTrain")}
            </ButtonLink>
          ) : ended ? (
            <ButtonLink href={ticket ? ticketHref(journey!.id) : "/journey"} variant="primary" size="lg" className="w-full">
              {ticket ? t("tonight.viewTicket") : t("scene.collectTicket")}
            </ButtonLink>
          ) : summary.next ? (
            <ButtonLink href="/journey" variant="primary" size="lg" className="w-full tracking-[0.3em]">
              {t("scene.board").toUpperCase()}
            </ButtonLink>
          ) : null}
        </div>
      </section>

      {!riding && !ended && summary.next && nextTask && (
        <Coach
          steps={[
            { target: boardRef, title: t("scene.coach1Title"), body: t("scene.coach1") },
            { target: departRef, title: t("scene.coach2Title"), body: t("scene.coach2") },
            { target: boardButtonRef, title: t("scene.coach3Title"), body: t("scene.coach3") },
          ]}
        />
      )}

      <Sheet open={panel === "route"} onClose={() => setPanel(null)} title={t("scene.routeSheet")} eyebrow={fmt.longDate(today)}>
        <RecentChangeDetail data={data} now={now} forecast={forecast} />
        <RouteLine items={routeItems(data, today)} compact />
        <div className="mt-6 flex justify-between gap-3">
          <span className="flex gap-1">
            <ButtonLink href="/service" variant="ghost" size="sm">
              {t("tonight.serviceTime")}
            </ButtonLink>
            <Button variant="ghost" size="sm" onClick={() => useGlossary.getState().show("route")}>
              {t("scene.seeTerms")}
            </Button>
          </span>
          <ButtonLink href="/route" variant="secondary" size="sm">
            {t("scene.editRoute")}
          </ButtonLink>
        </div>
      </Sheet>
      <ArrivalSheet open={panel === "arrival"} onClose={() => setPanel(null)} summary={arrivals} today={today} onResolve={() => setPanel("conflict")} />
      <Sheet open={panel === "conflict"} onClose={() => setPanel(null)} title={t("scene.conflict")}>
        {conflict && <ConflictNotice conflict={conflict} tasks={data.tasks} />}
      </Sheet>
      <Sheet open={panel === "overdue"} onClose={() => setPanel(null)} title={t("tonight.pastDeadline")}>
        <ul className="space-y-3 text-sm">
          {overdue.map((task) => (
            <li key={task.id}>
              <Link href={taskHref(task.id, "deadline")} className="text-paper underline decoration-rule underline-offset-4">
                {task.title}
              </Link>
              <p className="mt-0.5 text-mist">{t("tonight.wasDue", { date: fmt.shortDate(task.deadline!), min: task.remainingMinutes })}</p>
            </li>
          ))}
        </ul>
      </Sheet>
      <Sheet open={panel === "confirm"} onClose={() => setPanel(null)} title={t("journey.plannedTimeUsedUp")}>
        <ConfirmFinish tasks={data.tasks} compact />
        {waiting.length === 0 && (
          <div className="flex justify-end">
            <Button variant="ghost" onClick={() => setPanel(null)}>
              {t("conflict.done")}
            </Button>
          </div>
        )}
      </Sheet>
    </div>
  );
}

function Chip({ children, onClick, tone = "lamp" }: { children: ReactNode; onClick: () => void; tone?: "lamp" | "signal" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex min-h-9 items-center gap-2 rounded-full border bg-night-900/75 px-3.5 text-xs transition-colors ${
        tone === "signal" ? "border-signal/40 text-signal hover:border-signal/70" : "border-lamp/30 text-lamp/90 hover:border-lamp/60"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full animate-breathe ${tone === "signal" ? "bg-signal" : "bg-lamp"}`} aria-hidden />
      {children}
    </button>
  );
}

function EmptyState({
  isEmptyAccount,
  hasAnyService,
  hasWindows,
  serviceLeft,
}: {
  isEmptyAccount: boolean;
  hasAnyService: boolean;
  hasWindows: boolean;
  serviceLeft: boolean;
}) {
  const { t } = useI18n();
  const link = "text-paper underline decoration-rule underline-offset-4";
  return (
    <div className="max-w-md">
      <p className="eyebrow">{t("scene.departure")}</p>
      <p className="mt-2 font-mono text-[clamp(3.5rem,17vw,5rem)] font-extralight leading-none text-paper/30 tabular">--:--</p>
      <div className="mt-5 text-sm leading-relaxed text-mist">
        {isEmptyAccount ? (
          <>
            <p>{t("tonight.emptyLine")}</p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => useQuickAdd.getState().show()} className={buttonClass("primary", "md")}>
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
        ) : !hasWindows ? (
          <p>
            {t("tonight.noServiceSpread")}{" "}
            <Link href="/service" className={link}>
              {t("tonight.addTimeToday")}
            </Link>
          </p>
        ) : !serviceLeft ? (
          <p>
            {t("tonight.serviceEnded")}{" "}
            <Link href="/service" className={link}>
              {t("tonight.adjustService")}
            </Link>
          </p>
        ) : (
          <p>
            {t("tonight.nothingDue")}{" "}
            <Link href="/route" className={link}>
              {t("tonight.pullForward")}
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
