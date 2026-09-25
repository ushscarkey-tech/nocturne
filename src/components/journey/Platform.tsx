"use client";

import Link from "next/link";
import { useState } from "react";
import { routeOf, sessionsOn } from "@/core/sessions";
import { clock, formatCountdown, formatDuration } from "@/core/time";
import type { FocusLevel, Journey, NocturneData } from "@/core/types";
import { Button } from "@/components/ui/Button";
import { FocusPicker } from "@/components/ui/controls";
import { Icon } from "@/components/ui/Icon";
import { depart, extendStop, reassessFocus, resumeService } from "@/state/actions";
import { SoundControl } from "./SoundControl";

function lastClosed(data: NocturneData, journey: Journey) {
  return sessionsOn(data.sessions, journey.date)
    .filter((s) => s.status === "done" || s.status === "partial")
    .sort((a, b) => (a.actualEnd ?? "").localeCompare(b.actualEnd ?? ""))
    .pop();
}

function nextStation(data: NocturneData, journey: Journey) {
  return routeOf(data.sessions, journey.date).find((s) => s.status === "planned");
}

function TopBar({ now, journey }: { now: Date; journey: Journey }) {
  return (
    <header className="flex items-center justify-between">
      <time className="font-mono text-xs tracking-widest text-mist tabular">{clock(now)}</time>
      <div className="flex items-center gap-1">
        <SoundControl carriage={journey.selectedCarriage} />
        <Link href="/" className="rounded-full p-2 text-mist hover:text-paper" aria-label="Back to Tonight">
          <Icon name="close" size={18} />
        </Link>
      </div>
    </header>
  );
}

/** ARRIVED: the train is still, the next departure counts down. */
export function StationStop({ data, journey, now }: { data: NocturneData; journey: Journey; now: Date }) {
  const closed = lastClosed(data, journey);
  const task = closed ? data.tasks.find((t) => t.id === closed.taskId) : undefined;
  const next = nextStation(data, journey);
  const nextTask = next ? data.tasks.find((t) => t.id === next.taskId) : undefined;
  const left = journey.stopEndsAt ? (new Date(journey.stopEndsAt).getTime() - now.getTime()) / 1000 : 0;
  const overdue = left <= 0;

  return (
    <div className="flex min-h-dvh flex-col px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))]">
      <TopBar now={now} journey={journey} />
      <main className="mx-auto flex w-full max-w-md flex-1 animate-fade flex-col justify-center">
        <p className="eyebrow text-lamp/90">Arrived{closed ? ` · ${closed.stationName}` : ""}</p>
        {task && (
          <>
            <h1 className="mt-4 font-display text-4xl leading-tight">{task.title}</h1>
            <p className="mt-2 font-mono text-sm text-mist tabular">
              {formatDuration(closed!.completedMinutes)} {closed!.status === "partial" ? "focused · the rest continues later" : "completed"}
            </p>
          </>
        )}

        <div className="mt-12 border-t border-rule pt-8">
          <p className="eyebrow">{overdue ? "Ready when you are" : "Next departure"}</p>
          <p className="mt-2 font-mono text-5xl font-light tabular" role="timer" aria-live="off">
            {overdue ? clock(now) : formatCountdown(left)}
          </p>
          {nextTask && next && (
            <p className="mt-3 text-sm text-mist">
              {next.stationName} · <span className="text-paper-dim">{nextTask.title}</span> · {formatDuration(next.plannedMinutes)}
            </p>
          )}
        </div>

        <div className="mt-10">
          <p className="mb-3 text-sm text-paper-dim">How&rsquo;s your energy now?</p>
          <FocusPicker value={journey.focus} onChange={(v) => reassessFocus(v)} label="Energy now" />
        </div>
      </main>
      <div className="mx-auto flex w-full max-w-md gap-3">
        <Button variant="primary" size="lg" className="flex-1" onClick={() => depart()}>
          {overdue ? "Depart" : "Depart early"}
        </Button>
        <Button variant="secondary" size="lg" onClick={() => extendStop(5)}>
          +5 min
        </Button>
      </div>
    </div>
  );
}

/** Between Service windows: the train waits for the next departure. */
export function ServicePaused({ data, journey, now }: { data: NocturneData; journey: Journey; now: Date }) {
  const next = nextStation(data, journey);
  const nextTask = next ? data.tasks.find((t) => t.id === next.taskId) : undefined;
  const [focus, setFocus] = useState<FocusLevel>(journey.focus);
  const departure = next ? new Date(next.plannedStart) : null;
  const left = departure ? (departure.getTime() - now.getTime()) / 1000 : 0;

  return (
    <div className="flex min-h-dvh flex-col px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))]">
      <TopBar now={now} journey={journey} />
      <main className="mx-auto flex w-full max-w-md flex-1 animate-fade flex-col justify-center">
        <p className="eyebrow">Service paused</p>
        <h1 className="mt-4 font-display text-4xl leading-tight">Rest until the next departure.</h1>
        {departure && (
          <div className="mt-10 border-t border-rule pt-8">
            <p className="eyebrow">Next departure</p>
            <p className="mt-2 font-mono text-5xl font-light tabular text-lamp">{clock(departure)}</p>
            {left > 0 && <p className="mt-2 font-mono text-xs text-haze tabular">in {formatCountdown(left)}</p>}
            {nextTask && next && (
              <p className="mt-3 text-sm text-mist">
                {next.stationName} · <span className="text-paper-dim">{nextTask.title}</span> · {formatDuration(next.plannedMinutes)}
              </p>
            )}
          </div>
        )}
        <div className="mt-10">
          <p className="mb-3 text-sm text-paper-dim">When you return — how are you?</p>
          <FocusPicker value={focus} onChange={setFocus} label="Focus when resuming" />
          <p className="mt-3 text-xs text-haze">The route is rebuilt from your actual progress when service resumes.</p>
        </div>
      </main>
      <div className="mx-auto w-full max-w-md">
        <Button variant="primary" size="lg" className="w-full" onClick={() => resumeService(focus)} disabled={!next}>
          Continue journey
        </Button>
      </div>
    </div>
  );
}
