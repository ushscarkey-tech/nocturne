"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { elapsedSeconds, remainingSeconds, routeOf } from "@/core/sessions";
import { clock, formatCountdown } from "@/core/time";
import type { Journey, NocturneData, StudySession } from "@/core/types";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Sheet } from "@/components/ui/Sheet";
import { RouteStrip } from "@/components/scene/RouteStrip";
import { endJourney, finishEarly, lowFocus, needMoreTime, pause, resume } from "@/state/actions";
import { SoundControl } from "./SoundControl";
import { useSignal } from "./SignalChange";

const REVEAL_MS = 7000;
const TUNNEL_AFTER_MS = 75_000;

/**
 * The focus scene: mostly window. A car and seat label, the task, the time
 * left and a thin transit line; controls surface on tap and fade again.
 * In the Tunnel only the task and its time remain.
 */
export function Cabin({
  data,
  journey,
  active,
  now,
  tunnel,
  onTunnel,
  departing = false,
}: {
  data: NocturneData;
  journey: Journey;
  active: StudySession;
  now: Date;
  tunnel: boolean;
  onTunnel: (on: boolean) => void;
  /** Just boarded: the train is still pulling out, the cabin UI waits. */
  departing?: boolean;
}) {
  const { t, fmt } = useI18n();
  const [revealed, setRevealed] = useState(false);
  const [hintVisible, setHintVisible] = useState(true);
  const [sheet, setSheet] = useState<null | "early" | "more" | "end">(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastInteraction = useRef(0);
  const changing = useSignal((s) => s.changing);

  const task = data.tasks.find((x) => x.id === active.taskId);
  const route = routeOf(data.sessions, journey.date);
  const index = route.findIndex((s) => s.id === active.id);
  const next = route.slice(index + 1).find((s) => s.status === "planned");
  const nextTask = next ? data.tasks.find((x) => x.id === next.taskId) : undefined;
  const arrival = route.length ? route[route.length - 1].plannedEnd : null;
  const remaining = remainingSeconds(active, now);
  const paused = !active.resumedAt;
  const fraction = Math.min(1, elapsedSeconds(active, now) / Math.max(1, active.plannedMinutes * 60));

  const reveal = useCallback(() => {
    if (departing) return;
    lastInteraction.current = Date.now();
    setRevealed(true);
    if (tunnel) onTunnel(false);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setRevealed(false), REVEAL_MS);
  }, [tunnel, onTunnel, departing]);

  useEffect(() => {
    const timer = setTimeout(() => setHintVisible(false), departing ? 14_000 : 8000);
    return () => clearTimeout(timer);
  }, [departing]);

  // Any key reveals controls.
  useEffect(() => {
    lastInteraction.current = Date.now();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Tab" || e.key === "Escape" || e.key === " " || e.key === "Enter") reveal();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [reveal]);

  // Enter the Tunnel after a quiet stretch; leave it as the station approaches.
  useEffect(() => {
    if (!data.profile.autoTunnel || paused || sheet || departing) return;
    const quiet = Date.now() - lastInteraction.current;
    if (!tunnel && quiet > TUNNEL_AFTER_MS && remaining > 8 * 60 && !revealed) onTunnel(true);
    if (tunnel && remaining < 120) onTunnel(false);
  }, [now, data.profile.autoTunnel, paused, sheet, tunnel, remaining, revealed, onTunnel, departing]);

  const showControls = (revealed || paused || !!sheet) && !tunnel && !departing;
  // Chrome (labels, line, next stop) fades for the Tunnel and while pulling out.
  const chrome = tunnel || departing ? "opacity-0" : "opacity-100";

  return (
    <div
      className="relative h-dvh overflow-hidden px-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))]"
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("button,a,input,dialog")) return;
        reveal();
      }}
    >
      <div className="motion-safe-only flex h-full animate-drift flex-col">
        <header className="flex h-11 items-center justify-between">
          <p className={`font-mono text-[0.625rem] tracking-[0.3em] text-paper-dim/55 transition-opacity duration-[2000ms] ${chrome}`}>
            {t("scene.carSeat", { car: journey.car, seat: journey.seat })}
          </p>
          <div className={`flex items-center gap-1 transition-opacity duration-700 ${showControls ? "opacity-100" : "pointer-events-none opacity-0"}`}>
            <time className="mr-1 font-mono text-xs tracking-widest text-mist tabular">{clock(now)}</time>
            <SoundControl carriage={journey.selectedCarriage} />
            <Link href="/" className="rounded-full p-2 text-mist hover:text-paper" aria-label={t("common.back")} tabIndex={showControls ? 0 : -1}>
              <Icon name="close" size={18} />
            </Link>
          </div>
        </header>
        <ExitSign className={`mt-1 self-end transition-opacity duration-[2000ms] ${departing ? "opacity-0" : "opacity-100"}`} />

        <main className="flex flex-1 flex-col items-center justify-center text-center">
          <div className={`transition-opacity duration-[2500ms] ${departing ? "opacity-0" : tunnel ? "opacity-75 delay-[1200ms]" : "opacity-100"}`}>
            <p className={`eyebrow text-paper-dim/50 transition-opacity duration-[2000ms] ${chrome}`}>→ {active.stationName}</p>
            <h1 className="mt-3 line-clamp-3 max-w-lg break-words font-display text-[1.9rem] leading-tight [text-shadow:0_2px_24px_rgba(0,0,0,0.7)] sm:text-4xl">
              {task?.title ?? "—"}
            </h1>
            <p
              className={`mt-6 font-mono text-[4rem] font-extralight leading-none tracking-tight tabular [text-shadow:0_2px_30px_rgba(0,0,0,0.7)] sm:text-[5.5rem] ${paused ? "text-mist" : "text-paper"}`}
              role="timer"
              aria-live="off"
              aria-label={t("journey.countdownRemaining", { countdown: formatCountdown(remaining) })}
            >
              {formatCountdown(remaining)}
            </p>
            {paused && <p className="eyebrow mt-4 animate-breathe">{t("journey.paused")}</p>}
          </div>
        </main>

        <footer className="relative h-[9.75rem] sm:h-[8.75rem]">
          {/* Where the train is: next stop and the line. */}
          <div
            className={`absolute inset-x-0 bottom-2 mx-auto max-w-sm text-center transition-opacity duration-[1500ms] ${showControls ? "opacity-0" : chrome}`}
            aria-hidden={showControls || tunnel}
          >
            <p className="truncate text-sm text-mist">
              {next ? (
                <>
                  <span className="font-mono text-[0.625rem] tracking-[0.2em] text-haze">{t("scene.nextStop").toUpperCase()}</span>
                  <span className="px-2 text-haze">·</span>
                  <span className="text-paper-dim">{nextTask?.title}</span>
                  <span className="text-haze"> · {fmt.duration(next.plannedMinutes)}</span>
                </>
              ) : (
                t("scene.lastStop")
              )}
            </p>
            <RouteStrip route={route} activeId={active.id} fraction={fraction} changing={changing} label={t("journey.routeProgress")} className="mt-4" />
            <p className="mt-2 flex justify-between font-mono text-[0.625rem] tracking-[0.14em] text-haze">
              <span>{clock(active.plannedEnd)} {active.stationName}</span>
              <span>{arrival ? clock(arrival) : ""}</span>
            </p>
          </div>

          {/* Controls, on tap. */}
          <div
            className={`absolute inset-x-0 bottom-0 transition-all duration-700 ease-[var(--ease-glide)] ${showControls ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"}`}
            aria-hidden={!showControls}
            aria-label={t("scene.controls")}
            role="group"
          >
            <div className="mx-auto grid max-w-md grid-cols-2 gap-2 sm:grid-cols-4">
              {paused ? (
                <Button variant="primary" size="sm" className="h-11 whitespace-nowrap" onClick={() => resume()} tabIndex={showControls ? 0 : -1}>
                  <Icon name="play" size={14} /> {t("common.continue")}
                </Button>
              ) : (
                <Button variant="secondary" size="sm" className="h-11 whitespace-nowrap bg-night-950/70" onClick={() => { pause(); reveal(); }} tabIndex={showControls ? 0 : -1}>
                  <Icon name="pause" size={14} /> {t("journey.pauseButton")}
                </Button>
              )}
              <Button variant="secondary" size="sm" className="h-11 whitespace-nowrap bg-night-950/70" onClick={() => setSheet("early")} tabIndex={showControls ? 0 : -1}>
                {t("journey.finishEarlyButton")}
              </Button>
              <Button variant="secondary" size="sm" className="h-11 whitespace-nowrap bg-night-950/70" onClick={() => setSheet("more")} tabIndex={showControls ? 0 : -1}>
                {t("journey.moreTimeButton")}
              </Button>
              <Button variant="secondary" size="sm" className="h-11 whitespace-nowrap bg-night-950/70" onClick={() => lowFocus()} tabIndex={showControls ? 0 : -1}>
                {t("journey.lowFocusButton")}
              </Button>
            </div>
            <div className="mt-3 flex justify-center gap-6 text-xs">
              <button type="button" onClick={() => onTunnel(true)} className="min-h-9 text-haze hover:text-mist" tabIndex={showControls ? 0 : -1}>
                {t("journey.enterTunnel")}
              </button>
              <button type="button" onClick={() => setSheet("end")} className="min-h-9 text-haze hover:text-mist" tabIndex={showControls ? 0 : -1}>
                {t("journey.endTonightButton")}
              </button>
            </div>
          </div>
        </footer>
      </div>

      {/* As the doors lock, the cabin lights settle a shade warmer. */}
      <div
        className="pointer-events-none fixed inset-0 -z-[1] bg-[#f1dfb8] transition-opacity duration-[3500ms]"
        style={{ opacity: departing ? 0.06 : 0 }}
        aria-hidden
      />
      {/* Pulling out of the platform. */}
      <p
        aria-live="polite"
        className={`pointer-events-none absolute inset-x-0 top-[42%] text-center font-mono text-[0.6875rem] tracking-[0.4em] text-paper-dim/70 transition-opacity duration-[1500ms] ${departing ? "opacity-100" : "opacity-0"}`}
      >
        {departing ? t("scene.departing").toUpperCase() : ""}
      </p>
      <p
        className={`pointer-events-none absolute inset-x-0 bottom-[max(0.5rem,env(safe-area-inset-bottom))] text-center text-[0.6875rem] tracking-widest text-haze/60 transition-opacity duration-[1500ms] ${
          hintVisible && !showControls && !tunnel && !departing ? "opacity-100 delay-[2500ms]" : "opacity-0"
        }`}
      >
        {t("journey.tapForControls")}
      </p>

      <Sheet open={sheet === "early"} onClose={() => setSheet(null)} title={t("journey.finishedEarly")} eyebrow={task?.title}>
        <div className="grid gap-3">
          <Button variant="secondary" size="lg" onClick={() => { setSheet(null); finishEarly(false); }}>
            {t("journey.thisStationDone")}
          </Button>
          <Button variant="secondary" size="lg" onClick={() => { setSheet(null); finishEarly(true); }}>
            {t("journey.wholeTaskComplete")}
          </Button>
        </div>
        <p className="mt-5 text-xs leading-relaxed text-haze">{t("journey.laterStationsMoveUp")}</p>
      </Sheet>

      <Sheet open={sheet === "more"} onClose={() => setSheet(null)} title={t("journey.needMoreTime")} eyebrow={task?.title}>
        <div className="grid grid-cols-3 gap-3">
          {[5, 10, 15].map((m) => (
            <Button key={m} variant="secondary" size="lg" onClick={() => { setSheet(null); needMoreTime(m); }}>
              +{fmt.duration(m)}
            </Button>
          ))}
        </div>
        <p className="mt-5 text-xs leading-relaxed text-haze">{t("journey.laterStationsShift")}</p>
      </Sheet>

      <Sheet open={sheet === "end"} onClose={() => setSheet(null)} title={t("journey.endTonightJourney")} eyebrow={t("journey.finalStation")}>
        <div className="mt-8 flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setSheet(null)}>
            {t("journey.keepRiding")}
          </Button>
          <Button variant="primary" onClick={() => { setSheet(null); endJourney(); }}>
            {t("journey.endJourney")}
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

/** The small green exit sign above the carriage door, as every train has. */
function ExitSign({ className = "" }: { className?: string }) {
  return (
    <svg width="26" height="13" viewBox="0 0 26 13" className={`opacity-40 ${className}`} aria-hidden>
      <rect width="26" height="13" rx="1.5" fill="#1f5a40" />
      <rect x="2" y="2" width="7" height="9" rx="0.5" fill="none" stroke="#cfe8d9" strokeWidth="1" />
      <path d="M12 6.5h10M19 3.8l3 2.7-3 2.7" fill="none" stroke="#cfe8d9" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
