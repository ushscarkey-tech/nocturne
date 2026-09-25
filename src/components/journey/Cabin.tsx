"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { elapsedSeconds, remainingSeconds, routeOf } from "@/core/sessions";
import { clock, formatCountdown, formatDuration } from "@/core/time";
import type { Journey, NocturneData, StudySession } from "@/core/types";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Sheet } from "@/components/ui/Sheet";
import { endJourney, finishEarly, lowFocus, needMoreTime, pause, resume } from "@/state/actions";
import { SoundControl } from "./SoundControl";

const REVEAL_MS = 7000;
const TUNNEL_AFTER_MS = 75_000;

/**
 * The focus screen. Only what matters is visible; controls surface on tap,
 * swipe or any key, then fade away again. After a quiet stretch the train
 * enters the Tunnel (deep focus) and nearly everything disappears.
 */
export function Cabin({
  data,
  journey,
  active,
  now,
  tunnel,
  onTunnel,
}: {
  data: NocturneData;
  journey: Journey;
  active: StudySession;
  now: Date;
  tunnel: boolean;
  onTunnel: (on: boolean) => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const [sheet, setSheet] = useState<null | "early" | "more" | "end">(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastInteraction = useRef(0);

  const task = data.tasks.find((t) => t.id === active.taskId);
  const route = routeOf(data.sessions, journey.date);
  const index = route.findIndex((s) => s.id === active.id);
  const next = route.slice(index + 1).find((s) => s.status === "planned");
  const nextTask = next ? data.tasks.find((t) => t.id === next.taskId) : undefined;
  const arrival = route.length ? route[route.length - 1].plannedEnd : null;
  const remaining = remainingSeconds(active, now);
  const paused = !active.resumedAt;
  const fraction = Math.min(1, elapsedSeconds(active, now) / Math.max(1, active.plannedMinutes * 60));

  const reveal = useCallback(() => {
    lastInteraction.current = Date.now();
    setRevealed(true);
    if (tunnel) onTunnel(false);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setRevealed(false), REVEAL_MS);
  }, [tunnel, onTunnel]);

  // Any key or swipe reveals controls.
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
    if (!data.profile.autoTunnel || paused || sheet) return;
    const quiet = Date.now() - lastInteraction.current;
    if (!tunnel && quiet > TUNNEL_AFTER_MS && remaining > 8 * 60 && !revealed) onTunnel(true);
    if (tunnel && remaining < 120) onTunnel(false);
  }, [now, data.profile.autoTunnel, paused, sheet, tunnel, remaining, revealed, onTunnel]);

  const showControls = revealed || paused || !!sheet;

  if (tunnel) {
    return (
      <button
        type="button"
        onClick={reveal}
        className="flex min-h-dvh w-full animate-fade flex-col items-center justify-end pb-[max(3rem,env(safe-area-inset-bottom))]"
        aria-label={`Tunnel mode. ${formatCountdown(remaining)} remaining. Tap to show controls.`}
      >
        <span className="font-mono text-sm tracking-[0.2em] text-paper-dim/70 tabular" aria-live="off">
          {formatCountdown(remaining)}
        </span>
      </button>
    );
  }

  return (
    <div
      className="relative flex min-h-dvh flex-col px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))]"
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("button,a,input,dialog")) return;
        reveal();
      }}
      onTouchEnd={() => reveal()}
    >
      <header className="flex items-center justify-between">
        <time className="font-mono text-xs tracking-widest text-mist tabular">{clock(now)}</time>
        <div className={`flex items-center gap-1 transition-opacity duration-700 ${showControls ? "opacity-100" : "pointer-events-none opacity-0"}`}>
          <SoundControl carriage={journey.selectedCarriage} />
          <Link href="/" className="rounded-full p-2 text-mist hover:text-paper" aria-label="Back to Tonight (the journey continues)">
            <Icon name="close" size={18} />
          </Link>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center text-center">
        <p className="eyebrow text-lamp/90">{active.stationName}</p>
        <h1 className="mt-4 max-w-lg font-display text-3xl leading-tight sm:text-4xl">{task?.title ?? "Station"}</h1>
        <p
          className={`mt-8 font-mono text-[4.5rem] font-light leading-none tracking-tight tabular sm:text-[6rem] ${paused ? "text-mist" : "text-paper"}`}
          role="timer"
          aria-live="off"
          aria-label={`${formatCountdown(remaining)} remaining`}
        >
          {formatCountdown(remaining)}
        </p>
        {paused && <p className="eyebrow mt-4 animate-breathe">Paused</p>}

        <RouteProgress route={route} activeId={active.id} fraction={fraction} />

        <div className="mt-10 space-y-1 text-sm">
          {next ? (
            <p className="text-mist">
              Next stop · <span className="text-paper-dim">{nextTask?.title}</span> · {formatDuration(next.plannedMinutes)}
            </p>
          ) : (
            <p className="text-mist">Final station ahead</p>
          )}
          {arrival && <p className="text-haze">Expected arrival {clock(arrival)}</p>}
        </div>
      </main>

      <footer
        className={`transition-all duration-700 ease-[var(--ease-glide)] ${showControls ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"}`}
        aria-hidden={!showControls}
      >
        <div className="mx-auto grid max-w-md grid-cols-2 gap-2 sm:grid-cols-4">
          {paused ? (
            <Button variant="primary" onClick={() => resume()} tabIndex={showControls ? 0 : -1}>
              <Icon name="play" size={15} /> Resume
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => { pause(); reveal(); }} tabIndex={showControls ? 0 : -1}>
              <Icon name="pause" size={15} /> Pause
            </Button>
          )}
          <Button variant="secondary" onClick={() => setSheet("early")} tabIndex={showControls ? 0 : -1}>
            Finish early
          </Button>
          <Button variant="secondary" onClick={() => setSheet("more")} tabIndex={showControls ? 0 : -1}>
            More time
          </Button>
          <Button variant="secondary" onClick={() => lowFocus()} tabIndex={showControls ? 0 : -1}>
            Low focus
          </Button>
        </div>
        <div className="mt-3 flex justify-center gap-6 text-xs">
          <button type="button" onClick={() => onTunnel(true)} className="text-haze hover:text-mist" tabIndex={showControls ? 0 : -1}>
            Enter tunnel
          </button>
          <button type="button" onClick={() => setSheet("end")} className="text-haze hover:text-mist" tabIndex={showControls ? 0 : -1}>
            End tonight&rsquo;s journey
          </button>
        </div>
      </footer>
      {!showControls && <p className="pointer-events-none absolute inset-x-0 bottom-6 text-center text-[0.6875rem] tracking-widest text-haze/60">TAP FOR CONTROLS</p>}

      <Sheet open={sheet === "early"} onClose={() => setSheet(null)} title="Finished early?" eyebrow={task?.title}>
        <div className="grid gap-3">
          <Button variant="secondary" size="lg" onClick={() => { setSheet(null); finishEarly(false); }}>
            This station&rsquo;s work is done
          </Button>
          <Button variant="secondary" size="lg" onClick={() => { setSheet(null); finishEarly(true); }}>
            The whole task is complete
          </Button>
        </div>
        <p className="mt-5 text-xs leading-relaxed text-haze">The rest of the route moves earlier. Time gained is yours.</p>
      </Sheet>

      <Sheet open={sheet === "more"} onClose={() => setSheet(null)} title="Need more time?" eyebrow={task?.title}>
        <div className="grid grid-cols-3 gap-3">
          {[5, 10, 15].map((m) => (
            <Button key={m} variant="secondary" size="lg" onClick={() => { setSheet(null); needMoreTime(m); }}>
              +{m} min
            </Button>
          ))}
        </div>
        <p className="mt-5 text-xs leading-relaxed text-haze">Later stations shift to make room. Locked stations stay put.</p>
      </Sheet>

      <Sheet open={sheet === "end"} onClose={() => setSheet(null)} title="End tonight's journey?" eyebrow="Final station">
        <p className="text-sm leading-relaxed text-mist">
          Everything you&rsquo;ve done is kept. Unfinished stations return to the planner for another day.
        </p>
        <div className="mt-8 flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setSheet(null)}>
            Keep riding
          </Button>
          <Button variant="primary" onClick={() => { setSheet(null); endJourney(); }}>
            End journey
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

/** ────────●──────── : the whole night at a glance. */
function RouteProgress({ route, activeId, fraction }: { route: StudySession[]; activeId: string; fraction: number }) {
  const total = route.reduce((a, s) => a + Math.max(1, s.plannedMinutes), 0);
  let acc = 0;
  let position = 0;
  const ticks: number[] = [];
  for (const s of route) {
    ticks.push(acc / total);
    if (s.id === activeId) position = (acc + fraction * s.plannedMinutes) / total;
    acc += Math.max(1, s.plannedMinutes);
  }
  return (
    <div className="relative mt-12 h-3 w-full max-w-sm" role="progressbar" aria-label="Route progress" aria-valuenow={Math.round(position * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div className="absolute top-1/2 h-px w-full bg-rule" />
      <div className="absolute top-1/2 h-px bg-paper-dim/60 transition-[width] duration-1000" style={{ width: `${position * 100}%` }} />
      {ticks.map((t, i) => (
        <span key={i} className="absolute top-1/2 h-1.5 w-px -translate-y-1/2 bg-haze" style={{ left: `${t * 100}%` }} />
      ))}
      <span className="absolute right-0 top-1/2 h-2 w-2 -translate-y-1/2 translate-x-1/2 rounded-full border border-haze" />
      <span
        className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-lamp shadow-[0_0_14px_rgba(224,176,104,0.6)] transition-[left] duration-1000"
        style={{ left: `${position * 100}%` }}
      />
    </div>
  );
}
