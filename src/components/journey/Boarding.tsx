"use client";

import Link from "next/link";
import { useState } from "react";
import { CARRIAGE_AMBIENCE } from "@/core/journey";
import { clock, serviceDate } from "@/core/time";
import type { CarriageId, FocusLevel, NocturneData } from "@/core/types";
import { useI18n, type MessageKey } from "@/i18n";
import { Button } from "@/components/ui/Button";
import { FocusPicker } from "@/components/ui/controls";
import { Icon } from "@/components/ui/Icon";
import { routeSummary } from "@/lib/route-view";
import { boardingDetails } from "@/core/stations";
import { ambience } from "@/audio/useAmbience";
import { board, setCarriage } from "@/state/actions";

export const CARRIAGES: { id: CarriageId; name?: string; detail?: string; nameKey: string; detailKey: string }[] = [
  { id: "quiet", name: "Quiet Car", detail: "Very subtle cabin ambience", nameKey: "journey.quietCar", detailKey: "journey.quietCarDetail" },
  { id: "rain", name: "Rain Car", detail: "Rain against the windows, rail ambience", nameKey: "journey.rainCar", detailKey: "journey.rainCarDetail" },
  { id: "tunnel", name: "Tunnel Car", detail: "Low mechanical hum and brown noise", nameKey: "journey.tunnelCar", detailKey: "journey.tunnelCarDetail" },
  { id: "moon", name: "Moon Car", detail: "Soft, distant night ambience", nameKey: "journey.moonCar", detailKey: "journey.moonCarDetail" },
];

// STEPS keys are now in i18n: journey.boardingStep1, journey.boardingStep2, journey.boardingStep3, journey.boardingStep4
const STEPS = ["journey.boardingStep1", "journey.boardingStep2", "journey.boardingStep3", "journey.boardingStep4"] as const;

/** A short ritual before departure: four quiet steps. */
export function Boarding({
  data,
  now,
  carriage,
  onCarriage,
}: {
  data: NocturneData;
  now: Date;
  carriage: CarriageId;
  onCarriage: (c: CarriageId) => void;
}) {
  const { t, fmt } = useI18n();
  const today = serviceDate(now);
  const summary = routeSummary(data, today);
  const details = boardingDetails(today);
  const [step, setStep] = useState(0);
  const [focus, setFocus] = useState<FocusLevel | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [boarding, setBoarding] = useState(false);

  const departure = summary.next ? new Date(summary.next.plannedStart) : null;
  const departsLabel = departure && departure.getTime() > now.getTime() + 60_000 ? clock(departure) : "Now";

  async function doBoard() {
    setBoarding(true);
    // A faint shudder as the doors close, where the device supports it.
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.([10, 60, 14]);
    setCarriage(carriage);
    // Starting audio here counts as the user gesture browsers require.
    await ambience.enable(CARRIAGE_AMBIENCE[carriage]);
    board(focus ?? "steady", carriage);
  }

  async function preview(c: CarriageId) {
    onCarriage(c);
    if (previewing) ambience.setPreset(CARRIAGE_AMBIENCE[c], 2);
  }

  async function togglePreview() {
    if (previewing) {
      ambience.disable();
      setPreviewing(false);
    } else {
      setPreviewing(await ambience.enable(CARRIAGE_AMBIENCE[carriage]));
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))]">
      <div className="flex items-center justify-between">
        {step > 0 ? (
          <button type="button" onClick={() => setStep(step - 1)} className="-ml-2 rounded-full p-2 text-mist hover:text-paper" aria-label={t("common.back")}>
            <Icon name="back" />
          </button>
        ) : (
          <Link href="/" className="-ml-2 rounded-full p-2 text-mist hover:text-paper" aria-label={t("common.back")}>
            <Icon name="close" />
          </Link>
        )}
        <ol className="flex gap-2" aria-label={t("journey.stepIndicator", { n: step + 1, total: STEPS.length, step: t(STEPS[step] as MessageKey) })}>
          {STEPS.map((s, i) => (
            <li key={s} className={`h-1 rounded-full transition-all duration-700 ${i === step ? "w-6 bg-lamp" : i < step ? "w-2 bg-paper-dim" : "w-2 bg-rule"}`} />
          ))}
        </ol>
        <span className="w-9" />
      </div>

      <div key={step} className="flex flex-1 animate-rise flex-col justify-center py-10">
        {step === 0 && (
          <section aria-labelledby="board-journey">
            <p className="eyebrow">{t("journey.tonightService")}</p>
            <h1 id="board-journey" className="mt-3 font-display text-4xl leading-tight">
              {t("journey.onPlatform")}
            </h1>
            <dl className="mt-10 grid grid-cols-2 gap-y-8 border-y border-rule py-8 font-mono tabular">
              <div>
                <dt className="eyebrow text-[0.625rem]">{t("journey.platformLabel")}</dt>
                <dd className="mt-1.5 text-3xl text-paper">{details.platform}</dd>
              </div>
              <div>
                <dt className="eyebrow text-[0.625rem]">{t("journey.departureLabel")}</dt>
                <dd className="mt-1.5 text-3xl text-lamp">{departsLabel}</dd>
              </div>
              <div>
                <dt className="eyebrow text-[0.625rem]">{t("journey.arrivalLabel")}</dt>
                <dd className="mt-1.5 text-3xl text-paper">{summary.arrival ? clock(summary.arrival) : "—"}</dd>
              </div>
              <div>
                <dt className="eyebrow text-[0.625rem]">{t("journey.stationsLabel")}</dt>
                <dd className="mt-1.5 text-3xl text-paper">{summary.remaining}</dd>
              </div>
            </dl>
            <p className="mt-6 text-sm text-mist">
              {t("journey.firstStation")} · <span className="text-paper">{data.tasks.find((t) => t.id === summary.next?.taskId)?.title}</span>
              {summary.next && <> · {fmt.duration(summary.next.plannedMinutes)}</>}
            </p>
          </section>
        )}

        {step === 1 && (
          <section aria-labelledby="board-state">
            <p className="eyebrow">{t("journey.signalCheck")}</p>
            <h1 id="board-state" className="mt-3 font-display text-4xl leading-tight">
              {t("journey.howAreYouTonight")}
            </h1>
            <div className="mt-10">
              <FocusPicker value={focus} onChange={setFocus} size="lg" label={t("journey.howAreYouTonight")} />
            </div>
          </section>
        )}

        {step === 2 && (
          <section aria-labelledby="board-carriage">
            <p className="eyebrow">{t("journey.chooseCarriage")}</p>
            <h1 id="board-carriage" className="mt-3 font-display text-4xl leading-tight">
              {t("journey.whereWouldYouSit")}
            </h1>
            <div role="radiogroup" aria-label={t("journey.carriageRadio")} className="mt-8 divide-y divide-rule-soft border-y border-rule-soft">
              {CARRIAGES.map((c) => {
                const checked = carriage === c.id;
                const soundKey = c.id === "quiet" ? "journey.soundQuietCabin" : c.id === "rain" ? "journey.soundRain" : c.id === "tunnel" ? "journey.soundTunnel" : "journey.soundNightRail";
                return (
                  <button
                    key={c.id}
                    type="button"
                    role="radio"
                    aria-checked={checked}
                    onClick={() => void preview(c.id)}
                    className="flex w-full items-center justify-between gap-4 py-4 text-left"
                  >
                    <span>
                      <span className={`block text-base ${checked ? "text-paper" : "text-paper-dim"}`}>{t(c.nameKey as MessageKey)}</span>
                      <span className="mt-0.5 block text-xs text-mist">
                        {t(c.detailKey as MessageKey)} · {t(soundKey as MessageKey)}
                      </span>
                    </span>
                    <span
                      className={`h-3 w-3 shrink-0 rounded-full border transition-colors duration-500 ${checked ? "border-lamp bg-lamp" : "border-haze"}`}
                      aria-hidden
                    />
                  </button>
                );
              })}
            </div>
            <button type="button" onClick={() => void togglePreview()} className="mt-5 inline-flex items-center gap-2 text-sm text-mist hover:text-paper">
              <Icon name="sound" size={16} /> {previewing ? t("journey.stopPreview") : t("journey.previewSound")}
            </button>
          </section>
        )}

        {step === 3 && (
          <section aria-labelledby="board-final" className="text-center">
            <p className="eyebrow">{t((CARRIAGES.find((c) => c.id === carriage)?.nameKey ?? "journey.quietCar") as MessageKey)}</p>
            <h1 id="board-final" className="mt-3 font-display text-5xl">
              {t("journey.carSeat", { car: details.car, seat: details.seat })}
            </h1>
            <p className="mx-auto mt-5 max-w-xs text-sm leading-relaxed text-mist">
              {t("journey.stationsAndArriving", { remaining: summary.remaining, arrival: summary.arrival ? clock(summary.arrival) : "—" })}
            </p>
          </section>
        )}
      </div>

      <div className="flex flex-col items-center gap-3">
        {step < 3 ? (
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            onClick={() => setStep(step + 1)}
            disabled={step === 1 && !focus}
          >
            {t("common.continue")}
          </Button>
        ) : (
          <Button variant="primary" size="lg" className="w-full" onClick={() => void doBoard()} disabled={boarding}>
            {boarding ? t("journey.departingLoading") : t("journey.boardButton")}
          </Button>
        )}
        {step === 1 && !focus && <p className="text-xs text-haze">{t("journey.chooseOneHint")}</p>}
      </div>
    </div>
  );
}
