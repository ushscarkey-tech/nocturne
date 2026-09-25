"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import type { CarriageId } from "@/core/types";
import { Button } from "@/components/ui/Button";
import { Field, Toggle } from "@/components/ui/controls";
import { Icon } from "@/components/ui/Icon";
import { Sheet } from "@/components/ui/Sheet";
import { LOCALES, rememberLocale, useI18n, type MessageKey } from "@/i18n";
import { notificationsEnabled, notificationsSupported, requestNotifications } from "@/lib/notify";
import { loadSampleData, updateProfile } from "@/state/actions";
import { isSupabaseConfigured, resetDemo, signOut } from "@/state/session";
import { useData, useStore } from "@/state/store";

const CARRIAGES: CarriageId[] = ["quiet", "rain", "tunnel", "moon"];

export default function SettingsPage() {
  const data = useData();
  const { t } = useI18n();
  const mode = useStore((s) => s.mode);
  const router = useRouter();
  const [name, setName] = useState(data.profile.name);
  const [confirm, setConfirm] = useState<null | "reset" | "sample">(null);
  const [notifyOn, setNotifyOn] = useState(false);
  const supported = useSyncExternalStore(
    () => () => {},
    () => notificationsSupported(),
    () => false,
  );
  const granted = useSyncExternalStore(
    () => () => {},
    () => notificationsEnabled(),
    () => false,
  );
  const p = data.profile;

  return (
    <div className="animate-fade">
      <header>
        <h1 className="font-display text-5xl leading-none">{t("settings.title")}</h1>
      </header>

      <section className="mt-12 space-y-8">
        <Field label={t("settings.name")}>
          <input
            className="field"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name.trim() && name !== p.name && updateProfile({ name: name.trim() })}
          />
        </Field>

        <div>
          <p className="eyebrow">{t("settings.language")}</p>
          <div className="mt-3 grid grid-cols-2 gap-2" role="radiogroup" aria-label={t("settings.language")}>
            {LOCALES.map((l) => (
              <button
                key={l.id}
                type="button"
                role="radio"
                aria-checked={p.locale === l.id}
                lang={l.id}
                onClick={() => {
                  rememberLocale(l.id);
                  updateProfile({ locale: l.id });
                }}
                className={`min-h-11 rounded-xl border px-4 text-left text-sm transition-colors ${
                  p.locale === l.id ? "border-lamp/60 text-paper" : "border-rule text-mist hover:text-paper"
                }`}
              >
                {l.name}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="eyebrow">{t("settings.carriage")}</p>
          <div className="mt-3 grid grid-cols-2 gap-2" role="radiogroup" aria-label={t("settings.carriage")}>
            {CARRIAGES.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={p.preferredCarriage === c}
                onClick={() => updateProfile({ preferredCarriage: c })}
                className={`min-h-11 rounded-xl border px-4 text-left text-sm transition-colors ${
                  p.preferredCarriage === c ? "border-lamp/60 text-paper" : "border-rule text-mist hover:text-paper"
                }`}
              >
                {t(`settings.carriage.${c}` as MessageKey)}
              </button>
            ))}
          </div>
        </div>

        <div className="divide-y divide-rule-soft border-y border-rule-soft">
          <Toggle
            checked={p.autoTunnel}
            onChange={(v) => updateProfile({ autoTunnel: v })}
            label={t("settings.autoTunnel")}
            description={t("settings.autoTunnelHint")}
          />
          {supported && (
            <Toggle
              checked={granted || notifyOn}
              onChange={async (v) => {
                if (v) setNotifyOn(await requestNotifications());
              }}
              label={t("settings.reminders")}
              description={granted ? t("settings.remindersOn") : t("settings.remindersHint")}
            />
          )}
        </div>
        <Link href="/service" className="flex min-h-11 items-center justify-between text-sm text-paper-dim hover:text-paper">
          {t("settings.serviceTime")} <Icon name="chevron" size={16} />
        </Link>
      </section>

      <section className="mt-14" aria-labelledby="personal-title">
        <h2 id="personal-title" className="eyebrow">
          {t("settings.personal")}
        </h2>
        <div className="mt-3 divide-y divide-rule-soft border-y border-rule-soft">
          <Toggle
            checked={p.learnFromSessions}
            onChange={(v) => updateProfile({ learnFromSessions: v })}
            label={t("settings.learn")}
            description={t("settings.learnHint")}
          />
          <div className={p.learnFromSessions ? "" : "pointer-events-none opacity-40"} aria-disabled={!p.learnFromSessions}>
            <Toggle checked={p.autoAdjustEstimates && p.learnFromSessions} onChange={(v) => updateProfile({ autoAdjustEstimates: v })} label={t("settings.adjust")} />
          </div>
          <div className={p.learnFromSessions ? "" : "pointer-events-none opacity-40"} aria-disabled={!p.learnFromSessions}>
            <Toggle checked={p.useFocusHistory && p.learnFromSessions} onChange={(v) => updateProfile({ useFocusHistory: v })} label={t("settings.focusHistory")} />
          </div>
        </div>
      </section>

      <section className="mt-14" aria-labelledby="account-title">
        <h2 id="account-title" className="eyebrow">
          {mode === "cloud" ? t("settings.account") : t("settings.demo")}
        </h2>
        <p className="mt-2 text-sm text-mist">{mode === "cloud" ? t("settings.cloudNote") : t("settings.demoNote")}</p>
        <div className="mt-5 flex flex-wrap gap-3">
          {mode === "cloud" ? (
            <>
              <Button variant="secondary" onClick={() => setConfirm("sample")}>
                {t("settings.loadSample")}
              </Button>
              <Button
                variant="ghost"
                onClick={async () => {
                  await signOut();
                  router.replace("/login");
                }}
              >
                {t("settings.signOut")}
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setConfirm("reset")}>
                {t("settings.resetDemo")}
              </Button>
              {isSupabaseConfigured && (
                <Button
                  variant="ghost"
                  onClick={async () => {
                    await signOut();
                    router.replace("/login");
                  }}
                >
                  {t("settings.signIn")}
                </Button>
              )}
            </>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            updateProfile({ onboardedAt: null });
            router.push("/welcome");
          }}
          className="mt-6 min-h-11 text-sm text-mist underline decoration-rule underline-offset-4 hover:text-paper"
        >
          {t("settings.guide")}
        </button>
      </section>

      <Sheet
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm === "reset" ? t("settings.confirmReset") : t("settings.confirmSample")}
        eyebrow={t("settings.cantUndo")}
      >
        <p className="text-sm leading-relaxed text-mist">{confirm === "reset" ? t("settings.resetBody") : t("settings.sampleBody")}</p>
        <div className="mt-8 flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setConfirm(null)}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="danger"
            onClick={async () => {
              const which = confirm;
              setConfirm(null);
              if (which === "reset") await resetDemo();
              else await loadSampleData();
              router.push("/");
            }}
          >
            {confirm === "reset" ? t("settings.resetDemo") : t("settings.replace")}
          </Button>
        </div>
      </Sheet>
    </div>
  );
}
