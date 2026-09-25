"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ambience } from "@/audio/useAmbience";
import { sfx } from "@/audio/sfx";
import { serviceLeft } from "@/core/journey";
import { routeOf } from "@/core/sessions";
import { summarizeJourney, ticketFace, ticketRowCount } from "@/core/stats";
import { clock } from "@/core/time";
import type { Journey, NocturneData } from "@/core/types";
import { useI18n } from "@/i18n";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Sheet } from "@/components/ui/Sheet";
import { Ticket } from "@/components/ticket/Ticket";
import { FlipText } from "@/components/scene/FlipText";
import { haptic } from "@/lib/haptics";
import { usePrefersReducedMotion } from "@/lib/hooks";
import { ticketHref } from "@/lib/paths";
import { continueService, issueTicket } from "@/state/actions";
import { ConfirmFinish } from "./ConfirmFinish";
import { LINE_COLOR, StationSign, stationCode } from "./Platform";

/**
 * The end of the line. The train has stopped, the cabin has gone quiet, and
 * only the fluorescent hum is left. A short summary, then the ticket.
 */
export function FinalStation({ data, journey, now, arriving = false }: { data: NocturneData; journey: Journey; now: Date; arriving?: boolean }) {
  const { t, fmt } = useI18n();
  const [nothingDue, setNothingDue] = useState(false);
  const [details, setDetails] = useState(false);
  const [printing, setPrinting] = useState(false);
  const left = serviceLeft(data, now);
  const s = summarizeJourney(data, journey);
  const route = routeOf(data.sessions, journey.date);
  const last = route[route.length - 1];
  const ticket = data.tickets.find((x) => x.journeyId === journey.id);
  const unfinished = data.tasks.filter((x) => s.taskIds.includes(x.id) && x.status === "active" && !x.recurrence && x.remainingMinutes > 0);
  const focusPath = journey.focusLog.map((f) => t(`common.${f.level}` as const));
  const tonightTasks = data.tasks.filter((x) => s.taskIds.includes(x.id));
  const delay = (ms: number) => ({ animationDelay: `${arriving ? ms + 2800 : ms}ms` });

  return (
    <div className="flex h-dvh flex-col overflow-hidden px-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))]">
      <header className="flex h-11 items-center justify-end">
        <Link href="/" className="rounded-full p-2 text-mist hover:text-paper" aria-label={t("common.back")}>
          <Icon name="close" size={18} />
        </Link>
      </header>
      <div className="min-h-0 flex-1" />

      <main className="mx-auto w-full max-w-md">
        <div className="animate-scene-in" style={delay(0)}>
          <StationSign
            code={last ? stationCode(route, last.id) : "N01"}
            name={last?.stationName ?? "MIDNIGHT"}
            note={t("scene.finalStation")}
            prev={route.length > 1 ? route[route.length - 2].stationName : undefined}
            color={LINE_COLOR[journey.selectedCarriage]}
          />
        </div>
        <div className="animate-scene-in" style={delay(700)}>
          <div className="mt-3 rounded-[0.4rem] border border-black/60 bg-[#0b0f13]/92 px-5 py-4 backdrop-blur">
            <div className="flex items-end justify-between">
              <p className="font-mono text-[0.625rem] tracking-[0.22em] text-haze">{t("scene.arrived")}</p>
              <p className="font-mono text-[2.6rem] font-extralight leading-none tabular text-[#e8c88f]">
                <FlipText text={s.arrival ? clock(s.arrival) : "--:--"} />
              </p>
            </div>
            <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-white/[0.06] pt-3.5 font-mono tabular">
              <Figure label={t("journey.focusedTimeLabel")} value={fmt.duration(s.focusedMinutes)} />
              <Figure label={t("journey.stationsLabel")} value={`${s.stationsCompleted}/${s.stationsTotal}`} />
              <Figure label={t("journey.plannedWorkLabel")} value={`${Math.round(s.completionRate * 100)}%`} />
            </dl>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 [&>*]:whitespace-nowrap">
              <button type="button" onClick={() => setDetails(true)} className="min-h-9 text-xs text-mist underline decoration-rule underline-offset-4 hover:text-paper">
                {unfinished.length > 0 ? t("scene.unfinished", { n: unfinished.length }) : t("scene.details")}
              </button>
              {left >= 20 && !ticket && (
                nothingDue ? (
                  <span className="text-xs text-haze">{t("journey.nothingDueNow")}</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setNothingDue(!continueService())}
                    className="min-h-9 text-right text-xs text-mist underline decoration-rule underline-offset-4 hover:text-paper"
                  >
                    {t("journey.serviceTimeLeft", { duration: fmt.duration(left) })}
                  </button>
                )
              )}
            </div>
            <div className="mt-2 empty:hidden">
              <ConfirmFinish tasks={tonightTasks} compact />
            </div>
          </div>
        </div>
      </main>

      <div className="mx-auto mt-4 w-full max-w-md animate-scene-in" style={delay(1300)}>
        {ticket && !printing ? (
          <ButtonLink href={ticketHref(journey.id)} variant="primary" size="lg" className="w-full">
            {t("scene.viewTicket")}
          </ButtonLink>
        ) : (
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            onClick={() => {
              void sfx.unlock();
              issueTicket(journey.id);
              setPrinting(true);
            }}
          >
            {t("scene.collectTicket")}
          </Button>
        )}
      </div>

      <Sheet open={details} onClose={() => setDetails(false)} title={t("journey.tonightJourney")} eyebrow={t("scene.finalStation")}>
        <ul className="space-y-2.5 text-sm">
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
      </Sheet>

      {printing && <JourneyTicketPrinter data={data} journey={journey} onClose={() => setPrinting(false)} />}
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="truncate font-mono text-[0.5625rem] tracking-[0.18em] text-haze">{label.toUpperCase()}</dt>
      <dd className="mt-1 truncate text-lg text-paper">{value}</dd>
    </div>
  );
}

type PrintStage = "opening" | "printing" | "printed" | "keeping";

/**
 * The night's record prints line by line — departure, stations, focus,
 * carriage — and slides out of the slot. You keep it yourself.
 */
function JourneyTicketPrinter({ data, journey, onClose }: { data: NocturneData; journey: Journey; onClose: () => void }) {
  const { t } = useI18n();
  const router = useRouter();
  const reduced = usePrefersReducedMotion();
  const [stage, setStage] = useState<PrintStage>("opening");
  const [printed, setPrinted] = useState(0);
  const [drag, setDrag] = useState(0);
  const dragStart = useRef<{ y: number; moved: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const face = ticketFace(data, journey);
  const rows = ticketRowCount(face);
  // The timeline runs once, whatever the data does meanwhile.
  const rowsAtStart = useRef(rows);

  useEffect(() => {
    const rows = rowsAtStart.current;
    const list = timers.current;
    const at = (ms: number, fn: () => void) => list.push(setTimeout(fn, ms));
    if (reduced) {
      at(200, () => {
        setPrinted(rows);
        setStage("printed");
      });
    } else {
      at(700, () => {
        setStage("printing");
        sfx.play("printLong");
      });
      for (let i = 1; i <= rows; i++) at(700 + i * 300, () => setPrinted(i));
      at(700 + rows * 300 + 450, () => {
        setStage("printed");
        haptic("settle");
        ambience.duck(0.4, 3);
      });
    }
    return () => list.forEach(clearTimeout);
  }, [reduced]);

  function keep() {
    if (stage !== "printed") return;
    haptic("press");
    sfx.play("paper");
    setStage("keeping");
    timers.current.push(setTimeout(() => router.push(ticketHref(journey.id, true)), reduced ? 200 : 1100));
  }

  const out = stage === "printed" || stage === "keeping";
  const ratio = rows ? printed / rows : 0;
  const pointer = {
    onPointerDown: (e: React.PointerEvent) => {
      if (stage !== "printed") return;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      dragStart.current = { y: e.clientY, moved: false };
      setDragging(true);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (!dragStart.current) return;
      const dy = e.clientY - dragStart.current.y;
      if (Math.abs(dy) > 4) dragStart.current.moved = true;
      setDrag(Math.max(-30, Math.min(180, dy)));
    },
    onPointerUp: (e: React.PointerEvent) => {
      if (!dragStart.current) return;
      const dy = e.clientY - dragStart.current.y;
      const tapped = !dragStart.current.moved;
      dragStart.current = null;
      setDragging(false);
      if (tapped || dy > 56) keep();
      else setDrag(0);
    },
  };

  return (
    <div className="fixed inset-0 z-40 flex flex-col items-center bg-night-950/75 px-6 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-[3px] animate-fade" role="dialog" aria-label={t("scene.journeyRecord")}>
      <div className="flex w-full max-w-md justify-end">
        <button type="button" onClick={onClose} className={`rounded-full p-2 text-mist hover:text-paper ${stage === "printing" || stage === "opening" ? "invisible" : ""}`} aria-label={t("shell.close")}>
          <Icon name="close" size={18} />
        </button>
      </div>
      {/* A slim printer under the station clock. */}
      <div className="mt-2 w-full max-w-[21rem] animate-rise rounded-2xl border border-white/[0.07] bg-[linear-gradient(180deg,#1c2128,#101418)] px-4 pb-3 pt-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_30px_60px_-30px_rgba(0,0,0,0.9)]">
        <div className="flex items-center justify-between font-mono text-[0.5625rem] tracking-[0.3em] text-paper-dim/60">
          <span>NOCTURNE</span>
          <span className="flex items-center gap-1.5">
            {t("scene.journeyRecord")}
            <span className={`h-1.5 w-1.5 rounded-full ${stage === "printing" ? "bg-lamp shadow-[0_0_6px_rgba(224,176,104,0.9)]" : "bg-[#3a3f44]"}`} aria-hidden />
          </span>
        </div>
        <div className="relative mx-auto mt-3 h-2.5 w-[86%] rounded-full bg-black shadow-[inset_0_2px_4px_rgba(0,0,0,0.95),0_1px_0_rgba(255,255,255,0.07)]">
          <span
            className={`absolute inset-x-2 -bottom-1 h-3 rounded-full bg-[radial-gradient(50%_100%_at_50%_0%,rgba(224,176,104,0.55),transparent)] blur-[3px] transition-opacity duration-700 ${stage === "printing" ? "opacity-100" : "opacity-0"}`}
            aria-hidden
          />
        </div>
      </div>

      <div className="relative w-full max-w-[21rem] flex-1 overflow-hidden">
        <div
          className={`mx-auto w-fit touch-none select-none ${stage === "printing" ? "motion-safe-only animate-jitter" : ""}`}
          style={{
            transform:
              stage === "keeping"
                ? "translateY(60vh) scale(0.3) rotate(4deg)"
                : `translateY(calc(${-100 + (out ? 96 : ratio * 90)}% + ${drag}px))`,
            opacity: stage === "keeping" ? 0 : 1,
            transition: dragging
              ? "none"
              : stage === "keeping"
                ? "transform 1000ms cubic-bezier(0.5, 0, 0.2, 1), opacity 700ms 300ms"
                : stage === "printing"
                  ? "transform 300ms steps(3, end)"
                  : "transform 600ms var(--ease-glide)",
          }}
          role={stage === "printed" ? "button" : undefined}
          tabIndex={stage === "printed" ? 0 : -1}
          aria-label={stage === "printed" ? t("scene.keepTicket") : undefined}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && keep()}
          {...pointer}
        >
          <Ticket face={face} style={journey.selectedCarriage} size="lg" printed={out ? undefined : printed} />
        </div>
      </div>

      <div className={`w-full max-w-md pb-[max(1.25rem,env(safe-area-inset-bottom))] transition-opacity duration-700 ${stage === "printed" ? "opacity-100" : "pointer-events-none opacity-0"}`}>
        <p className="mb-3 text-center text-xs text-mist">
          <span className="motion-safe-only inline-block animate-hint">↓</span> {t("scene.keepHint")}
        </p>
        <Button variant="primary" size="lg" className="w-full" onClick={keep} tabIndex={stage === "printed" ? 0 : -1}>
          {t("scene.keepTicket")}
        </Button>
      </div>
    </div>
  );
}
