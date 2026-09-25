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

const STEPS = 5;

/** First run: language, a few quiet lines, name, study hours, one task. */
export default function WelcomePage() {
  const data = useData();
  const router = useRouter();
  const { t, locale } = useI18n();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(data.profile.name);
  const [preset, setPreset] = useState<string | null>("split");
  const [everyDay, setEveryDay] = useState(false);

  function next() {
    if (step === 2 && name.trim() !== data.profile.name) updateProfile({ name: name.trim() });
    if (step === 3) {
      const p = PRESETS.find((x) => x.id === preset);
      if (p) {
        const days = everyDay ? [0, 1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5];
        setWeeklyWindows(p.windows.map((w) => ({ ...w, days })));
      }
    }
    setStep((s) => Math.min(STEPS, s + 1));
  }

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
              <div className="space-y-5 font-display text-3xl leading-snug">
                <p>{t("onboarding.introA")}</p>
                <p className="text-paper-dim">{t("onboarding.introB")}</p>
                <p className="text-mist">{t("onboarding.introC")}</p>
              </div>
            </Panel>
          )}

          {step === 2 && (
            <Panel>
              <h1 className="font-display text-3xl">{t("onboarding.nameQ")}</h1>
              <input
                className="field mt-8 text-lg"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("onboarding.namePlaceholder")}
                autoComplete="given-name"
                enterKeyHint="next"
                onKeyDown={(e) => e.key === "Enter" && next()}
              />
            </Panel>
          )}

          {step === 3 && (
            <Panel>
              <h1 className="font-display text-3xl">{t("onboarding.whenQ")}</h1>
              <div className="mt-8 divide-y divide-rule-soft border-y border-rule-soft" role="radiogroup" aria-label={t("onboarding.whenQ")}>
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

          {step === 4 && (
            <Panel>
              <h1 className="mb-6 font-display text-3xl">{t("onboarding.firstTaskQ")}</h1>
              <QuickAddBody initialText="" onDone={() => setStep(5)} askFeel={false} />
              <button type="button" onClick={() => setStep(5)} className="mt-4 min-h-11 text-sm text-mist hover:text-paper">
                {t("onboarding.skip")}
              </button>
            </Panel>
          )}

          {step === 5 && (
            <Panel>
              <h1 className="font-display text-4xl">{t("onboarding.readyQ")}</h1>
              {data.profile.name && <p className="mt-2 text-mist">{data.profile.name}</p>}
            </Panel>
          )}
        </div>

        {step < 4 && (
          <Button variant="primary" size="lg" className="w-full" onClick={next}>
            {t("onboarding.next")}
          </Button>
        )}
        {step === 5 && (
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
