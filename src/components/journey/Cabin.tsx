"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { elapsedSeconds, remainingSeconds, routeOf } from "@/core/sessions";
import { clock, formatCountdown } from "@/core/time";
import type { Journey, NocturneData, StudySession } from "@/core/types";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Sheet } from "@/components/ui/Sheet";
import { windowOnScreen } from "@/components/scene/cabin/layout";
import { endJourney, finishEarly, lowFocus, needMoreTime, pause, resume } from "@/state/actions";
import { SoundControl } from "./SoundControl";

const REVEAL_MS = 7000;
const TUNNEL_AFTER_MS = 75_000;

/**
 * The focus scene: mostly window. The carriage's info board above it, the
 * task and the time left large on the glass, the leg's progress on a slim
 * plate under it, and the four keys at the foot. In the Tunnel only the
 * task and its time remain.
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
  const [sheet, setSheet] = useState<null | "early" | "more" | "end">(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastInteraction = useRef(0);

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

  const showControls = (revealed || !!sheet) && !tunnel && !departing;
  // Chrome (the info bar, the controls) goes for the Tunnel and while pulling out.
  const chrome = tunnel || departing ? "pointer-events-none opacity-0" : "opacity-100";
  const glass = useWindowOnScreen();
  const stationLabel = fmt.station(active.stationName);

  return (
    <div
      className="relative h-dvh overflow-hidden"
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("button,a,input,dialog")) return;
        reveal();
      }}
    >
      {/* Over the window: the carriage's own info board, amber on black. */}
      <header
        className={`absolute inset-x-0 top-[max(0.625rem,env(safe-area-inset-top))] flex justify-start px-4 sm:justify-center transition-opacity duration-[2000ms] ${chrome}`}
      >
        <div className="flex h-8 max-w-[calc(100vw-8.5rem)] items-center gap-2.5 overflow-hidden rounded-[2px] sm:max-w-full sm:gap-3 border border-[#3b3f3c] bg-[#0b0d0f]/90 px-3 font-mono text-[0.6875rem] tracking-[0.14em] text-[#d9a45c] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          <time className="tabular text-[#e8b872]">{clock(now)}</time>
          <span className="h-3 w-px bg-[#3b3f3c]" aria-hidden />
          <span className="truncate">→ {stationLabel}</span>
          <span className="hidden shrink-0 text-[#a5814c] min-[420px]:inline">{t("journey.arrivesAt", { time: clock(active.plannedEnd) })}</span>
          <span className="h-3 w-px bg-[#3b3f3c]" aria-hidden />
          <span className="shrink-0 text-[#a5814c]">{t("scene.carSeat", { car: journey.car, seat: journey.seat })}</span>
        </div>
      </header>

      {/* On the window: where you're going, the task, and the time left, large. */}
      <main
        className={`absolute inset-x-0 flex -translate-y-1/2 justify-center px-6 text-center transition-opacity duration-[2500ms] ${departing ? "opacity-0" : tunnel ? "opacity-75 delay-[1200ms]" : "opacity-100"}`}
        style={{ top: `${(((glass.top + glass.bottom) / 2) * 100).toFixed(2)}%` }}
      >
        <div className="relative isolate">
          {/* A soft pool of shade so the words stay readable over a lit platform or a bright sky. */}
          <div className="pointer-events-none absolute -inset-x-20 -inset-y-12 -z-10 bg-[radial-gradient(closest-side,rgba(5,7,10,0.55),rgba(5,7,10,0.25)_60%,transparent)]" aria-hidden />
          <p className={`font-mono text-[0.6875rem] tracking-[0.3em] text-paper-dim/75 transition-opacity duration-[2000ms] [text-shadow:0_1px_8px_rgba(0,0,0,0.8)] ${tunnel ? "opacity-0" : ""}`}>
            {paused ? t("journey.standing").toUpperCase() : `→ ${stationLabel}`}
          </p>
          <h1 className="mt-2.5 line-clamp-2 max-w-lg break-words font-display text-[1.75rem] leading-tight [text-shadow:0_2px_24px_rgba(0,0,0,0.75)] sm:text-4xl">
            {task?.title ?? "—"}
          </h1>
          <p
            className={`mt-4 font-mono text-[4rem] font-extralight leading-none tracking-tight tabular [text-shadow:0_2px_30px_rgba(0,0,0,0.75)] sm:text-[5.5rem] ${paused ? "text-mist" : "text-paper"}`}
            role="timer"
            aria-live="off"
            aria-label={t("journey.countdownRemaining", { countdown: formatCountdown(remaining) })}
          >
            {formatCountdown(remaining)}
          </p>
        </div>
      </main>

      {/* Under the glass: the leg so far and the next stop, on a slim plate. */}
      <section
        className={`absolute left-1/2 w-[min(calc(100vw-2rem),30rem)] -translate-x-1/2 transition-opacity duration-[1500ms] ${chrome}`}
        style={{ top: `min(calc(${(glass.bottom * 100).toFixed(2)}% + 0.75rem), calc(100% - 10.5rem))` }}
        aria-label={t("journey.routeProgress")}
      >
        <div className="rounded-[2px] border border-[#3b3f3c] bg-[#0e1318]/90 px-3.5 py-2.5">
          <div className="relative h-[3px] bg-[#232b33]" role="progressbar" aria-label={t("journey.routeProgress")} aria-valuenow={Math.round(fraction * 100)} aria-valuemin={0} aria-valuemax={100}>
            <div className="absolute inset-y-0 left-0 bg-[#b58f5a] transition-[width] duration-1000 ease-linear" style={{ width: `${fraction * 100}%` }} />
            {[0.25, 0.5, 0.75].map((q) => (
              <span key={q} className="absolute -top-[2px] h-[7px] w-px bg-[#4a525a]" style={{ left: `${q * 100}%` }} aria-hidden />
            ))}
          </div>
          <p className="mt-2 flex justify-between gap-3 font-mono text-[0.625rem] tracking-[0.12em] text-haze">
            <span className="truncate">
              {next ? `${t("scene.nextStop")} · ${nextTask?.title ?? ""} · ${fmt.duration(next.plannedMinutes)}` : t("scene.lastStop")}
            </span>
            <span className="shrink-0 tabular">{arrival ? clock(arrival) : ""}</span>
          </p>
        </div>
      </section>

      {/* At the foot of the screen: the four keys, always there; quieter until you reach for them. */}
      <footer className={`absolute inset-x-0 bottom-[max(0.75rem,env(safe-area-inset-bottom))] px-4 transition-opacity duration-700 ${chrome}`}>
        <div
          className={`mx-auto grid max-w-[34rem] grid-cols-4 gap-1.5 transition-opacity duration-500 ${showControls || paused ? "opacity-100" : "opacity-60 hover:opacity-100 focus-within:opacity-100"}`}
          aria-label={t("scene.controls")}
          role="group"
        >
          {paused ? (
            <CabinKey strong onClick={() => resume()}>
              <Icon name="play" size={13} /> {t("journey.goTrain")}
            </CabinKey>
          ) : (
            <CabinKey onClick={() => { pause(); reveal(); }}>
              <Icon name="pause" size={13} /> {t("journey.pauseButton")}
            </CabinKey>
          )}
          <CabinKey onClick={() => setSheet("early")}>{t("journey.finishEarlyButton")}</CabinKey>
          <CabinKey onClick={() => setSheet("more")}>{t("journey.moreTimeButton")}</CabinKey>
          <CabinKey onClick={() => lowFocus()}>{t("journey.lowFocusButton")}</CabinKey>
        </div>
        <div className="mx-auto mt-1 flex max-w-[34rem] items-center justify-center gap-6 text-xs">
          <button type="button" onClick={() => onTunnel(true)} className="min-h-9 text-haze hover:text-mist">
            {t("journey.enterTunnel")}
          </button>
          <button type="button" onClick={() => setSheet("end")} className="min-h-9 text-haze hover:text-mist">
            {t("journey.endTonightButton")}
          </button>
        </div>
      </footer>

      {/* Top right corner: sound and the way out, out of the way of the keys. */}
      <div className={`absolute right-3 top-[max(0.5rem,env(safe-area-inset-top))] flex items-center gap-1 transition-opacity duration-700 ${chrome}`}>
        <SoundControl carriage={journey.selectedCarriage} />
        <Link href="/" className="grid size-11 place-items-center rounded-[3px] border border-[#3b3f3c] bg-[#0e1216]/90 text-mist hover:text-paper" aria-label={t("common.back")}>
          <Icon name="close" size={16} />
        </Link>
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
        className={`pointer-events-none absolute inset-x-0 top-[42%] text-center font-mono text-[0.6875rem] tracking-[0.4em] text-paper-dim/80 [text-shadow:0_1px_8px_rgba(0,0,0,0.8)] transition-opacity duration-[1500ms] ${departing ? "opacity-100" : "opacity-0"}`}
      >
        {departing ? t("scene.departing").toUpperCase() : ""}
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

/** A carriage control: a square-cornered key, dark enamel with a metal edge. */
function CabinKey({ strong = false, className = "", ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { strong?: boolean }) {
  return (
    <button
      type="button"
      className={`inline-flex h-11 min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[3px] border px-1.5 font-mono text-[0.75rem] tracking-[0.02em] sm:gap-2 sm:px-3 sm:tracking-[0.1em] transition-colors duration-300 active:translate-y-px ${
        strong ? "border-[#c9b48c] bg-[#e4d6b8] text-[#1b1a16] hover:bg-[#efe3c8]" : "border-[#3b3f3c] bg-[#0e1216]/90 text-paper-dim hover:border-[#6a6e68] hover:text-paper"
      } ${className}`}
      {...rest}
    />
  );
}

const onResize = (fn: () => void) => {
  window.addEventListener("resize", fn);
  return () => window.removeEventListener("resize", fn);
};
const viewKey = () => `${window.innerWidth}x${window.innerHeight}`;

/** Where the 3D window's glass sits on this screen, so the plate goes just under it. */
function useWindowOnScreen() {
  const key = useSyncExternalStore(onResize, viewKey, () => "1280x800");
  const [w, h] = key.split("x").map(Number);
  return windowOnScreen(w, h);
}
