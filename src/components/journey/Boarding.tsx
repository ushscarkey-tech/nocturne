"use client";

import Link from "next/link";
import { useState } from "react";
import { PRESET_LABELS } from "@/audio/engine";
import { ambience } from "@/audio/useAmbience";
import { boardingDetails } from "@/core/stations";
import { CARRIAGE_AMBIENCE } from "@/core/journey";
import { clock, formatDuration, toDateKey } from "@/core/time";
import type { CarriageId, FocusLevel, NocturneData } from "@/core/types";
import { Button } from "@/components/ui/Button";
import { FocusPicker } from "@/components/ui/controls";
import { Icon } from "@/components/ui/Icon";
import { routeSummary } from "@/lib/route-view";
import { board, setCarriage } from "@/state/actions";

export const CARRIAGES: { id: CarriageId; name: string; detail: string }[] = [
  { id: "quiet", name: "Quiet Car", detail: "Very subtle cabin ambience" },
  { id: "rain", name: "Rain Car", detail: "Rain against the windows, rail ambience" },
  { id: "tunnel", name: "Tunnel Car", detail: "Low mechanical hum and brown noise" },
  { id: "moon", name: "Moon Car", detail: "Soft, distant night ambience" },
];

const STEPS = ["Journey", "Current state", "Carriage", "Board"] as const;

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
  const today = toDateKey(now);
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
          <button type="button" onClick={() => setStep(step - 1)} className="-ml-2 rounded-full p-2 text-mist hover:text-paper" aria-label="Back">
            <Icon name="back" />
          </button>
        ) : (
          <Link href="/" className="-ml-2 rounded-full p-2 text-mist hover:text-paper" aria-label="Back to Tonight">
            <Icon name="close" />
          </Link>
        )}
        <ol className="flex gap-2" aria-label={`Step ${step + 1} of ${STEPS.length}: ${STEPS[step]}`}>
          {STEPS.map((s, i) => (
            <li key={s} className={`h-1 rounded-full transition-all duration-700 ${i === step ? "w-6 bg-lamp" : i < step ? "w-2 bg-paper-dim" : "w-2 bg-rule"}`} />
          ))}
        </ol>
        <span className="w-9" />
      </div>

      <div key={step} className="flex flex-1 animate-rise flex-col justify-center py-10">
        {step === 0 && (
          <section aria-labelledby="board-journey">
            <p className="eyebrow">Tonight&rsquo;s service</p>
            <h1 id="board-journey" className="mt-3 font-display text-4xl leading-tight">
              Your train is on the platform.
            </h1>
            <dl className="mt-10 grid grid-cols-2 gap-y-8 border-y border-rule py-8 font-mono tabular">
              <div>
                <dt className="eyebrow text-[0.625rem]">Platform</dt>
                <dd className="mt-1.5 text-3xl text-paper">{details.platform}</dd>
              </div>
              <div>
                <dt className="eyebrow text-[0.625rem]">Departure</dt>
                <dd className="mt-1.5 text-3xl text-lamp">{departsLabel}</dd>
              </div>
              <div>
                <dt className="eyebrow text-[0.625rem]">Arrival</dt>
                <dd className="mt-1.5 text-3xl text-paper">{summary.arrival ? clock(summary.arrival) : "—"}</dd>
              </div>
              <div>
                <dt className="eyebrow text-[0.625rem]">Stations</dt>
                <dd className="mt-1.5 text-3xl text-paper">{summary.remaining}</dd>
              </div>
            </dl>
            <p className="mt-6 text-sm text-mist">
              First station · <span className="text-paper">{data.tasks.find((t) => t.id === summary.next?.taskId)?.title}</span>
              {summary.next && <> · {formatDuration(summary.next.plannedMinutes)}</>}
            </p>
          </section>
        )}

        {step === 1 && (
          <section aria-labelledby="board-state">
            <p className="eyebrow">Signal check</p>
            <h1 id="board-state" className="mt-3 font-display text-4xl leading-tight">
              How are you tonight?
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-mist">
              Nocturne will fine-tune the order of stations that haven&rsquo;t started.
            </p>
            <div className="mt-10">
              <FocusPicker value={focus} onChange={setFocus} size="lg" label="How are you tonight?" />
            </div>
          </section>
        )}

        {step === 2 && (
          <section aria-labelledby="board-carriage">
            <p className="eyebrow">Choose a carriage</p>
            <h1 id="board-carriage" className="mt-3 font-display text-4xl leading-tight">
              Where would you like to sit?
            </h1>
            <div role="radiogroup" aria-label="Carriage" className="mt-8 divide-y divide-rule-soft border-y border-rule-soft">
              {CARRIAGES.map((c) => {
                const checked = carriage === c.id;
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
                      <span className={`block text-base ${checked ? "text-paper" : "text-paper-dim"}`}>{c.name}</span>
                      <span className="mt-0.5 block text-xs text-mist">
                        {c.detail} · {PRESET_LABELS[CARRIAGE_AMBIENCE[c.id] as keyof typeof PRESET_LABELS].title}
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
              <Icon name="sound" size={16} /> {previewing ? "Stop preview" : "Preview sound"}
            </button>
          </section>
        )}

        {step === 3 && (
          <section aria-labelledby="board-final" className="text-center">
            <p className="eyebrow">{CARRIAGES.find((c) => c.id === carriage)?.name}</p>
            <h1 id="board-final" className="mt-3 font-display text-5xl">
              Car {details.car} · Seat {details.seat}
            </h1>
            <p className="mx-auto mt-5 max-w-xs text-sm leading-relaxed text-mist">
              {summary.remaining} stations · arriving around {summary.arrival ? clock(summary.arrival) : "—"}. Phones face down; the
              route will adjust if you need it to.
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
            Continue
          </Button>
        ) : (
          <Button variant="primary" size="lg" className="w-full" onClick={() => void doBoard()} disabled={boarding}>
            {boarding ? "Departing…" : "Board"}
          </Button>
        )}
        {step === 1 && !focus && <p className="text-xs text-haze">Choose one to continue.</p>}
      </div>
    </div>
  );
}
