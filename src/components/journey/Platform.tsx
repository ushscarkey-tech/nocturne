"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { routeOf, sessionsOn } from "@/core/sessions";
import { clock, formatCountdown } from "@/core/time";
import type { CarriageId, FocusLevel, Journey, NocturneData, StudySession } from "@/core/types";
import { useI18n, type MessageKey } from "@/i18n";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { FlipText } from "@/components/scene/FlipText";
import { PlatformClock } from "@/components/scene/PlatformClock";
import { RouteStrip } from "@/components/scene/RouteStrip";
import { depart, extendStop, reassessFocus, resumeService } from "@/state/actions";
import { ConfirmFinish } from "./ConfirmFinish";
import { SoundControl } from "./SoundControl";
import { useSignal } from "./SignalChange";

export const LINE_COLOR: Record<CarriageId, string> = { rain: "#4c5f7a", quiet: "#4f6a5c", tunnel: "#8a5a2b", moon: "#b69a62" };

function lastClosed(data: NocturneData, journey: Journey) {
  return sessionsOn(data.sessions, journey.date)
    .filter((s) => s.status === "done" || s.status === "partial")
    .sort((a, b) => (a.actualEnd ?? "").localeCompare(b.actualEnd ?? ""))
    .pop();
}

function nextStation(data: NocturneData, journey: Journey) {
  return routeOf(data.sessions, journey.date).find((s) => s.status === "planned");
}

/** N01, N02…: the station's place on tonight's line. */
export function stationCode(route: StudySession[], id: string | undefined): string {
  const i = route.findIndex((s) => s.id === id);
  return `N${String(Math.max(1, i + 1)).padStart(2, "0")}`;
}

function TopBar({ now, journey }: { now: Date; journey: Journey }) {
  const { t } = useI18n();
  return (
    <header className="flex h-11 items-center justify-between">
      <span className="flex items-center gap-2">
        <PlatformClock now={now} size={22} className="opacity-70" />
        <time className="font-mono text-xs tracking-widest text-mist tabular">{clock(now)}</time>
      </span>
      <div className="flex items-center gap-1">
        <SoundControl carriage={journey.selectedCarriage} />
        <Link href="/" className="rounded-full p-2 text-mist hover:text-paper" aria-label={t("common.back")}>
          <Icon name="close" size={18} />
        </Link>
      </div>
    </header>
  );
}

/** The lit name board on the platform. */
export function StationSign({
  code,
  name,
  note,
  prev,
  next,
  color,
}: {
  code: string;
  name: string;
  note: string;
  prev?: string;
  next?: string;
  color: string;
}) {
  const { t } = useI18n();
  return (
    <div
      className="relative overflow-hidden rounded-[0.4rem] bg-[linear-gradient(180deg,#f0e9d8,#ddd3bd)] px-5 pb-3 pt-3.5 text-[#1b2024] shadow-[0_0_40px_-6px_rgba(240,228,200,0.35),0_18px_40px_-18px_rgba(0,0,0,0.9)]"
      aria-label={`${t("scene.stationSign")} ${code} ${name}`}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_120%_at_50%_0%,rgba(255,255,255,0.35),transparent_60%)]" aria-hidden />
      <div className="relative flex items-center justify-between">
        <span className="rounded-[3px] border border-[#1b2024]/70 px-1.5 py-px font-mono text-[0.6875rem] font-medium tracking-[0.08em]">{code}</span>
        <span className="font-mono text-[0.625rem] tracking-[0.28em] text-[#1b2024]/60">{note}</span>
      </div>
      <p className="relative mt-2 text-[clamp(1.6rem,8vw,2.1rem)] font-semibold leading-none tracking-[0.07em]">{name}</p>
      <div className="relative mt-3 h-[3px] rounded-full" style={{ background: color }} />
      <div className="relative mt-1.5 flex justify-between font-mono text-[0.5625rem] tracking-[0.2em] text-[#1b2024]/55">
        <span>{prev ? `← ${prev}` : ""}</span>
        <span>{next ? `${next} →` : ""}</span>
      </div>
    </div>
  );
}

/** Dark departure board with amber figures. */
function Board({ children }: { children: ReactNode }) {
  return (
    <div className="mt-3 rounded-[0.4rem] border border-black/60 bg-[#0b0f13]/92 px-5 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] backdrop-blur">
      {children}
    </div>
  );
}

function EnergyRow({ value, onChange }: { value: FocusLevel; onChange: (v: FocusLevel) => void }) {
  const { t } = useI18n();
  return (
    <div className="mt-4 flex items-center justify-between gap-3" role="radiogroup" aria-label={t("scene.energy")}>
      <span className="font-mono text-[0.625rem] tracking-[0.22em] text-haze">{t("scene.energy").toUpperCase()}</span>
      <div className="flex gap-1.5">
        {(["low", "steady", "sharp"] as const).map((f) => (
          <button
            key={f}
            type="button"
            role="radio"
            aria-checked={value === f}
            onClick={() => onChange(f)}
            className={`min-h-9 rounded-full border px-3 text-xs transition-colors duration-500 ${
              value === f ? "border-lamp/50 text-paper" : "border-rule text-mist hover:text-paper"
            }`}
          >
            {t(`common.${f}` as MessageKey)}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * ARRIVED: the train has stopped at a station. The sign appears once it is
 * still; the next departure counts down on the board.
 */
export function StationStop({ data, journey, now, arriving = false }: { data: NocturneData; journey: Journey; now: Date; arriving?: boolean }) {
  const { t, fmt } = useI18n();
  const changing = useSignal((s) => s.changing);
  const route = routeOf(data.sessions, journey.date);
  const closed = lastClosed(data, journey);
  const task = closed ? data.tasks.find((x) => x.id === closed.taskId) : undefined;
  const next = nextStation(data, journey);
  const nextTask = next ? data.tasks.find((x) => x.id === next.taskId) : undefined;
  const left = journey.stopEndsAt ? (new Date(journey.stopEndsAt).getTime() - now.getTime()) / 1000 : 0;
  const overdue = left <= 0;
  const idx = route.findIndex((s) => s.id === closed?.id);
  const reveal = arriving ? { animationDelay: "2600ms" } : undefined;

  return (
    <div className="flex h-dvh flex-col overflow-hidden px-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))]">
      <TopBar now={now} journey={journey} />
      <div className="min-h-0 flex-1" />
      <main className="mx-auto w-full max-w-md">
        <div className="animate-scene-in" style={reveal}>
          {closed ? (
            <StationSign
              code={stationCode(route, closed.id)}
              name={closed.stationName}
              note={`${t("scene.arrived")} · ${clock(closed.actualEnd ?? now)}`}
              prev={idx > 0 ? route[idx - 1].stationName : undefined}
              next={next?.stationName}
              color={LINE_COLOR[journey.selectedCarriage]}
            />
          ) : (
            <StationSign
              code={`P${journey.platform}`}
              name={route[0]?.stationName ?? "NOCTURNE"}
              note={t("scene.platform", { n: journey.platform })}
              next={next?.stationName}
              color={LINE_COLOR[journey.selectedCarriage]}
            />
          )}
        </div>
        <div className="animate-scene-in" style={arriving ? { animationDelay: "3300ms" } : { animationDelay: "250ms" }}>
          <Board>
            {task && closed ? (
              <div className="flex items-baseline justify-between gap-4 border-b border-white/[0.06] pb-3">
                <span className="min-w-0 truncate text-sm text-paper-dim">{task.title}</span>
                <span className="shrink-0 font-mono text-xs tabular text-[#e8c88f]/90">
                  {fmt.duration(closed.completedMinutes)} ·{" "}
                  {task.status === "archived" ? t("scene.removed") : closed.status === "partial" ? t("scene.continuesLater") : t("scene.done")}
                </span>
              </div>
            ) : (
              <p className="border-b border-white/[0.06] pb-3 text-sm text-paper-dim">{t("journey.trainLeavesShortly")}</p>
            )}
            <div className="mt-3 flex items-end justify-between gap-4">
              <div>
                <p className="font-mono text-[0.625rem] tracking-[0.22em] text-haze">
                  {(overdue ? t("journey.readyWhenYouAre") : t("scene.nextDepartureIn")).toUpperCase()}
                </p>
                <p className="mt-1 font-mono text-[2.5rem] font-light leading-none tabular text-[#e8c88f]" role="timer" aria-live="off">
                  <FlipText text={overdue ? clock(now) : formatCountdown(left)} stagger={0} />
                </p>
              </div>
              {next && nextTask && (
                <p className="min-w-0 text-right text-xs leading-relaxed text-mist">
                  <span className="block font-mono text-[0.625rem] tracking-[0.18em] text-paper-dim/70">{next.stationName}</span>
                  <span className="block truncate text-paper-dim">{nextTask.title}</span>
                  <span className="font-mono tabular">{fmt.duration(next.plannedMinutes)}</span>
                </p>
              )}
            </div>
            <RouteStrip route={route} changing={changing} label={t("journey.routeProgress")} className="mt-4" />
            {task && (
              <div className="mt-4">
                <ConfirmFinish tasks={[task]} compact />
              </div>
            )}
            <EnergyRow value={journey.focus} onChange={(v) => reassessFocus(v)} />
          </Board>
        </div>
      </main>
      <div className="mx-auto mt-4 flex w-full max-w-md gap-3 animate-scene-in" style={arriving ? { animationDelay: "3800ms" } : { animationDelay: "500ms" }}>
        <Button variant="primary" size="lg" className="flex-1" onClick={() => depart()}>
          {overdue ? t("scene.depart") : closed ? t("scene.departEarly") : t("journey.departNow")}
        </Button>
        <Button variant="secondary" size="lg" className="bg-night-950/40 backdrop-blur" onClick={() => extendStop(5)}>
          {t("scene.stayMore", { min: 5 })}
        </Button>
      </div>
    </div>
  );
}

/** Between Service windows: the train waits at the platform for the next departure. */
export function ServicePaused({ data, journey, now }: { data: NocturneData; journey: Journey; now: Date }) {
  const { t, fmt } = useI18n();
  const route = routeOf(data.sessions, journey.date);
  const next = nextStation(data, journey);
  const nextTask = next ? data.tasks.find((x) => x.id === next.taskId) : undefined;
  const [focus, setFocus] = useState<FocusLevel>(journey.focus);
  const departure = next ? new Date(next.plannedStart) : null;
  const left = departure ? (departure.getTime() - now.getTime()) / 1000 : 0;
  const closed = lastClosed(data, journey);

  return (
    <div className="flex h-dvh flex-col overflow-hidden px-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))]">
      <TopBar now={now} journey={journey} />
      <div className="min-h-0 flex-1" />
      <main className="mx-auto w-full max-w-md animate-scene-in">
        <StationSign
          code={closed ? stationCode(route, closed.id) : `P${journey.platform}`}
          name={closed?.stationName ?? route[0]?.stationName ?? "NOCTURNE"}
          note={t("scene.servicePaused")}
          next={next?.stationName}
          color={LINE_COLOR[journey.selectedCarriage]}
        />
        <Board>
          <p className="text-sm text-paper-dim">{closed ? t("journey.restUntilNextDeparture") : t("journey.serviceBegins")}</p>
          {departure && (
            <div className="mt-3 flex items-end justify-between gap-4">
              <div>
                <p className="font-mono text-[0.625rem] tracking-[0.22em] text-haze">{t("scene.nextDepartureIn").toUpperCase()}</p>
                <p className="mt-1 font-mono text-[2.5rem] font-light leading-none tabular text-[#e8c88f]">
                  <FlipText text={clock(departure)} />
                </p>
                {left > 0 && <p className="mt-1 font-mono text-[0.6875rem] tabular text-haze">−{formatCountdown(left)}</p>}
              </div>
              {next && nextTask && (
                <p className="min-w-0 text-right text-xs leading-relaxed text-mist">
                  <span className="block font-mono text-[0.625rem] tracking-[0.18em] text-paper-dim/70">{next.stationName}</span>
                  <span className="block truncate text-paper-dim">{nextTask.title}</span>
                  <span className="font-mono tabular">{fmt.duration(next.plannedMinutes)}</span>
                </p>
              )}
            </div>
          )}
          <EnergyRow value={focus} onChange={setFocus} />
        </Board>
      </main>
      <div className="mx-auto mt-4 w-full max-w-md">
        <Button variant="primary" size="lg" className="w-full" onClick={() => resumeService(focus)} disabled={!next}>
          {closed ? t("journey.continueJourney") : t("journey.departNow")}
        </Button>
      </div>
    </div>
  );
}
