"use client";

import Link from "next/link";
import { useState } from "react";
import { routeOf, sessionsOn } from "@/core/sessions";
import { clock, formatCountdown } from "@/core/time";
import type { FocusLevel, Journey, NocturneData } from "@/core/types";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/Button";
import { FocusPicker } from "@/components/ui/controls";
import { Icon } from "@/components/ui/Icon";
import { depart, extendStop, reassessFocus, resumeService } from "@/state/actions";
import { ConfirmFinish } from "./ConfirmFinish";
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
  const { t } = useI18n();
  return (
    <header className="flex items-center justify-between">
      <time className="font-mono text-xs tracking-widest text-mist tabular">{clock(now)}</time>
      <div className="flex items-center gap-1">
        <SoundControl carriage={journey.selectedCarriage} />
        <Link href="/" className="rounded-full p-2 text-mist hover:text-paper" aria-label={t("common.back")}>
          <Icon name="close" size={18} />
        </Link>
      </div>
    </header>
  );
}

/** ARRIVED: the train is still, the next departure counts down. */
export function StationStop({ data, journey, now }: { data: NocturneData; journey: Journey; now: Date }) {
  const { t, fmt } = useI18n();
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
        {closed ? (
          <p className="eyebrow text-lamp/90">{t("journey.arrivedAt", { station: closed.stationName })}</p>
        ) : (
          <>
            <p className="eyebrow text-lamp/90">Boarded · Platform {journey.platform}</p>
            <h1 className="mt-4 font-display text-4xl leading-tight">{t("journey.trainLeavesShortly")}</h1>
          </>
        )}
        {task && (
          <>
            <h1 className="mt-4 line-clamp-3 break-words font-display text-4xl leading-tight">{task.title}</h1>
            <p className="mt-2 font-mono text-sm text-mist tabular">
              {fmt.duration(closed!.completedMinutes)}{" "}
              {task.status === "archived"
                ? t("journey.focusedRemovedFromLine")
                : closed!.status === "partial"
                  ? t("journey.focusedContinuesLater")
                  : t("common.done")}
            </p>
          </>
        )}

        <div className="mt-12 border-t border-rule pt-8">
          <p className="eyebrow">{overdue ? t("journey.readyWhenYouAre") : t("journey.nextDeparture")}</p>
          <p className="mt-2 font-mono text-5xl font-light tabular" role="timer" aria-live="off">
            {overdue ? clock(now) : formatCountdown(left)}
          </p>
          {nextTask && next && (
            <p className="mt-3 text-sm text-mist">
              {next.stationName} · <span className="text-paper-dim">{nextTask.title}</span> · {fmt.duration(next.plannedMinutes)}
            </p>
          )}
        </div>

        {task && (
          <div className="mt-8">
            <ConfirmFinish tasks={[task]} compact />
          </div>
        )}

        <div className="mt-10">
          <p className="mb-3 text-sm text-paper-dim">{t("journey.howsYourEnergyNow")}</p>
          <FocusPicker value={journey.focus} onChange={(v) => reassessFocus(v)} label={t("journey.energyNow")} />
        </div>
      </main>
      <div className="mx-auto flex w-full max-w-md gap-3">
        <Button variant="primary" size="lg" className="flex-1" onClick={() => depart()}>
          {overdue ? t("journey.depart") : closed ? t("journey.departEarly") : t("journey.departNow")}
        </Button>
        <Button variant="secondary" size="lg" onClick={() => extendStop(5)}>
          {t("journey.extendStop")}
        </Button>
      </div>
    </div>
  );
}

/** Between Service windows: the train waits for the next departure. */
export function ServicePaused({ data, journey, now }: { data: NocturneData; journey: Journey; now: Date }) {
  const { t, fmt } = useI18n();
  const next = nextStation(data, journey);
  const nextTask = next ? data.tasks.find((t) => t.id === next.taskId) : undefined;
  const [focus, setFocus] = useState<FocusLevel>(journey.focus);
  const departure = next ? new Date(next.plannedStart) : null;
  const left = departure ? (departure.getTime() - now.getTime()) / 1000 : 0;

  return (
    <div className="flex min-h-dvh flex-col px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))]">
      <TopBar now={now} journey={journey} />
      <main className="mx-auto flex w-full max-w-md flex-1 animate-fade flex-col justify-center">
        {lastClosed(data, journey) ? (
          <>
            <p className="eyebrow">{t("journey.servicePaused")}</p>
            <h1 className="mt-4 font-display text-4xl leading-tight">{t("journey.restUntilNextDeparture")}</h1>
          </>
        ) : (
          <>
            <p className="eyebrow">Boarded · Platform {journey.platform}</p>
            <h1 className="mt-4 font-display text-4xl leading-tight">{t("journey.serviceBegins")}</h1>
          </>
        )}
        {departure && (
          <div className="mt-10 border-t border-rule pt-8">
            <p className="eyebrow">{t("journey.nextDeparture")}</p>
            <p className="mt-2 font-mono text-5xl font-light tabular text-lamp">{clock(departure)}</p>
            {left > 0 && <p className="mt-2 font-mono text-xs text-haze tabular">in {formatCountdown(left)}</p>}
            {nextTask && next && (
              <p className="mt-3 text-sm text-mist">
                {next.stationName} · <span className="text-paper-dim">{nextTask.title}</span> · {fmt.duration(next.plannedMinutes)}
              </p>
            )}
          </div>
        )}
        <div className="mt-10">
          <p className="mb-3 text-sm text-paper-dim">{t("journey.whenYouReReady")}</p>
          <FocusPicker value={focus} onChange={setFocus} label={t("journey.focusWhenResuming")} />
        </div>
      </main>
      <div className="mx-auto w-full max-w-md">
        <Button variant="primary" size="lg" className="w-full" onClick={() => resumeService(focus)} disabled={!next}>
          {lastClosed(data, journey) ? t("journey.continueJourney") : t("journey.departNow")}
        </Button>
        {departure && (
          <p className="mt-3 text-center text-xs text-haze">Or rest — the train waits until {clock(departure)}.</p>
        )}
      </div>
    </div>
  );
}
