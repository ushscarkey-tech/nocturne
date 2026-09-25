"use client";

import Link from "next/link";
import { useMemo } from "react";
import { focusProfile, MIN_PATTERN_SESSIONS } from "@/core/learning";
import { formatHM } from "@/core/time";
import { useI18n } from "@/i18n";
import { useData } from "@/state/store";

/**
 * Only what helps plan the next night: when hard work goes well, when focus
 * fades, and which work usually runs long. Nothing shows until there's enough.
 */
export function FocusInsights() {
  const data = useData();
  const { t } = useI18n();
  const profile = useMemo(() => focusProfile(data, new Date()), [data]);

  if (!data.profile.learnFromSessions) {
    return (
      <section aria-labelledby="insights-title" className="mt-14 border-t border-rule-soft pt-10">
        <h2 id="insights-title" className="eyebrow">
          {t("insights.title")}
        </h2>
        <p className="mt-3 text-sm text-mist">
          {t("insights.off")}{" "}
          <Link href="/settings" className="underline decoration-rule underline-offset-4 hover:text-paper">
            {t("insights.turnOn")}
          </Link>
        </p>
      </section>
    );
  }

  const rows: { label: string; value: string }[] = [];
  if (profile.bestHardWindow) {
    const [from, to] = profile.bestHardWindow;
    rows.push({ label: t("insights.bestHard"), value: `${formatHM(from * 60)}–${formatHM(to * 60)}` });
  }
  if (profile.fadesAfter !== null) rows.push({ label: t("insights.fades"), value: t("insights.after", { at: formatHM(profile.fadesAfter * 60) }) });
  for (const u of profile.underestimated.slice(0, 2)) {
    rows.push({ label: t("insights.underestimated"), value: `${u.example} · ${t("insights.longer", { pct: Math.round((u.ratio - 1) * 100) })}` });
  }

  return (
    <section aria-labelledby="insights-title" className="mt-14 border-t border-rule-soft pt-10">
      <h2 id="insights-title" className="eyebrow">
        {t("insights.title")}
      </h2>
      {!profile.ready || rows.length === 0 ? (
        <div className="mt-3">
          <p className="text-sm text-mist">{t("insights.learning")}</p>
          {!profile.ready && (
            <div className="mt-3 flex items-center gap-3">
              <div className="h-px w-32 bg-rule" aria-hidden>
                <div className="h-px bg-moss-light" style={{ width: `${Math.min(100, (profile.sessions / MIN_PATTERN_SESSIONS) * 100)}%` }} />
              </div>
              <span className="font-mono text-xs text-haze tabular">
                {t("insights.progress", { n: Math.min(profile.sessions, MIN_PATTERN_SESSIONS), total: MIN_PATTERN_SESSIONS })}
              </span>
            </div>
          )}
        </div>
      ) : (
        <dl className="mt-4 divide-y divide-rule-soft">
          {rows.map((r) => (
            <div key={r.label + r.value} className="flex items-baseline justify-between gap-6 py-3">
              <dt className="text-sm text-mist">{r.label}</dt>
              <dd className="truncate text-right font-mono text-sm text-paper tabular">{r.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
