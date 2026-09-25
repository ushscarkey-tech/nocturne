"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { QuickAddBody } from "@/components/quickadd/QuickAdd";
import { PlatformScene } from "@/components/scene/PlatformScene";
import { LOCALES, rememberLocale, useI18n, type MessageKey } from "@/i18n";
import { finishOnboarding, loadSampleData, setWeeklyWindows, updateProfile } from "@/state/actions";
import { useData } from "@/state/store";

type Preset = { id: string; label: MessageKey; windows: { start: string; end: string }[] };

const PRESETS: Preset[] = [
  { id: "evening", label: "onboarding.presetEvening", windows: [{ start: "19:00", end: "22:00" }] },
  { id: "split", label: "onboarding.presetSplit", windows: [{ start: "17:00", end: "18:30" }, { start: "19:40", end: "23:30" }] },
  { id: "late", label: "onboarding.presetLate", windows: [{ start: "21:00", end: "00:30" }] },
];

const STEPS = 4;

/** First run, kept short: language, how it works, study hours, one task, done. */
export default function WelcomePage() {
  const data = useData();
  const router = useRouter();
  const { t, locale } = useI18n();
  const [step, setStep] = useState(0);
  const [preset, setPreset] = useState<string | null>("split");
  const [everyDay, setEveryDay] = useState(false);

  function next() {
    if (step === 2) {
      const p = PRESETS.find((x) => x.id === preset);
      if (p) {
        const days = everyDay ? [0, 1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5];
        setWeeklyWindows(p.windows.map((w) => ({ ...w, days })));
      }
    }
    setStep((s) => Math.min(STEPS, s + 1));
  }

  const weekly = data.windows.filter((w) => w.enabled && w.kind === "available" && w.recurring);
  const serviceText = [...new Set(weekly.map((w) => `${w.startTime}–${w.endTime}`))].join(" · ");
  const taskCount = data.tasks.filter((x) => x.status !== "archived").length;

  function finish() {
    finishOnboarding();
    router.replace("/");
  }

  async function withSamples() {
    await loadSampleData();
    finishOnboarding();
    router.replace("/");
  }

  return (
    <div className="relative isolate min-h-dvh overflow-hidden">
      <PlatformScene className="fixed inset-0 -z-10" stationName="NOCTURNE" fade={false} />
      <div className="pointer-events-none fixed inset-0 -z-10 bg-gradient-to-t from-night-950 via-night-950/70 to-transparent" />

      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))]">
        <div className="flex h-11 items-center justify-between">
          {step > 0 ? (
            <button type="button" onClick={() => setStep(step - 1)} className="-ml-3 flex h-11 w-11 items-center justify-center text-mist hover:text-paper" aria-label={t("common.back")}>
              <Icon name="back" />
            </button>
          ) : (
            <span />
          )}
          <span className="font-mono text-xs text-haze tabular">{t("onboarding.step", { n: step + 1, total: STEPS + 1 })}</span>
        </div>

        <div key={step} className="flex flex-1 animate-rise flex-col justify-end pb-10">
          {step === 0 && (
            <Panel>
              <p className="font-mono text-xs tracking-[0.4em] text-paper-dim">NOCTURNE</p>
              <div className="mt-10 grid grid-cols-2 gap-2" role="radiogroup" aria-label={t("onboarding.language")}>
                {LOCALES.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    role="radio"
                    lang={l.id}
                    aria-checked={locale === l.id}
                    onClick={() => {
                      rememberLocale(l.id);
                      updateProfile({ locale: l.id });
                    }}
                    className={`min-h-12 rounded-xl border px-4 text-left transition-colors ${locale === l.id ? "border-lamp/60 text-paper" : "border-rule text-mist hover:text-paper"}`}
                  >
                    {l.name}
                  </button>
                ))}
              </div>
            </Panel>
          )}

          {step === 1 && (
            <Panel>
              <h1 className="font-display text-3xl leading-snug">{t("onboarding.howTitle")}</h1>
              {/* Three stops on one line: the whole app. */}
              <ol className="relative mt-8 space-y-6">
                <span className="absolute bottom-3 left-[0.3rem] top-3 w-px bg-paper/15" aria-hidden />
                {(["1", "2", "3"] as const).map((n, i) => (
                  <li key={n} className="relative flex animate-enter gap-4 pl-0" style={{ animationDelay: `${250 + i * 220}ms` }}>
                    <span className={`relative mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full border ${i === 2 ? "border-lamp bg-lamp shadow-[0_0_10px_rgba(224,176,104,0.5)]" : "border-paper/60 bg-night-900"}`} aria-hidden />
                    <span>
                      <span className="block text-paper">{t(`onboarding.how${n}` as MessageKey)}</span>
                      <span className="mt-0.5 block text-sm leading-relaxed text-mist">{t(`onboarding.how${n}d` as MessageKey)}</span>
                    </span>
                  </li>
                ))}
              </ol>
              <p className="mt-8 animate-enter text-xs leading-relaxed text-haze" style={{ animationDelay: "1000ms" }}>
                {t("onboarding.metaphor")}
              </p>
            </Panel>
          )}

          {step === 2 && (
            <Panel>
              <h1 className="font-display text-3xl">{t("onboarding.whenQ")}</h1>
              <p className="mt-2 text-sm text-mist">{t("onboarding.whenHint")}</p>
              <div className="mt-6 divide-y divide-rule-soft border-y border-rule-soft" role="radiogroup" aria-label={t("onboarding.whenQ")}>
                {PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    role="radio"
                    aria-checked={preset === p.id}
                    onClick={() => setPreset(p.id)}
                    className="flex min-h-14 w-full items-center justify-between gap-4 text-left"
                  >
                    <span className={preset === p.id ? "text-paper" : "text-paper-dim"}>{t(p.label)}</span>
                    <span className="font-mono text-sm text-mist tabular">{p.windows.map((w) => `${w.start}–${w.end}`).join(" · ")}</span>
                  </button>
                ))}
                <button
                  type="button"
                  role="radio"
                  aria-checked={preset === null}
                  onClick={() => setPreset(null)}
                  className={`flex min-h-14 w-full items-center text-left text-sm ${preset === null ? "text-paper" : "text-mist"}`}
                >
                  {t("onboarding.custom")}
                </button>
              </div>
              {preset && (
                <div className="mt-5 flex gap-2">
                  {[false, true].map((all) => (
                    <button
                      key={String(all)}
                      type="button"
                      aria-pressed={everyDay === all}
                      onClick={() => setEveryDay(all)}
                      className={`min-h-10 rounded-full border px-4 text-sm ${everyDay === all ? "border-lamp/60 text-paper" : "border-rule text-mist"}`}
                    >
                      {all ? t("onboarding.everyDay") : t("onboarding.weekdays")}
                    </button>
                  ))}
                </div>
              )}
            </Panel>
          )}

          {step === 3 && (
            <Panel>
              <h1 className="font-display text-3xl">{t("onboarding.firstTaskQ")}</h1>
              <p className="mb-6 mt-2 text-sm text-mist">{t("onboarding.firstTaskHint")}</p>
              <QuickAddBody initialText="" onDone={() => setStep(4)} askFeel={false} />
              <button type="button" onClick={() => setStep(4)} className="mt-4 min-h-11 text-sm text-mist hover:text-paper">
                {t("onboarding.skip")}
              </button>
            </Panel>
          )}

          {step === 4 && (
            <Panel>
              <h1 className="font-display text-4xl">{t("onboarding.readyTitle")}</h1>
              <ul className="mt-6 space-y-2 font-mono text-sm tabular text-paper-dim">
                {serviceText && <li className="animate-enter" style={{ animationDelay: "250ms" }}>{t("onboarding.readyService", { time: serviceText })}</li>}
                <li className="animate-enter" style={{ animationDelay: "400ms" }}>{t("onboarding.readyTasks", { n: taskCount })}</li>
              </ul>
              <p className="mt-6 animate-enter text-sm leading-relaxed text-mist" style={{ animationDelay: "600ms" }}>
                {t("onboarding.readyNext")}
              </p>
            </Panel>
          )}
        </div>

        {step < 3 && (
          <Button variant="primary" size="lg" className="w-full" onClick={next}>
            {t("onboarding.next")}
          </Button>
        )}
        {step === 4 && (
          <div className="space-y-2">
            <Button variant="primary" size="lg" className="w-full" onClick={finish}>
              {t("onboarding.start")}
            </Button>
            {!data.tasks.some((x) => x.status !== "archived") && (
              <Button variant="ghost" className="w-full" onClick={() => void withSamples()}>
                {t("onboarding.sample")}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Panel({ children }: { children: ReactNode }) {
  return <section>{children}</section>;
}
