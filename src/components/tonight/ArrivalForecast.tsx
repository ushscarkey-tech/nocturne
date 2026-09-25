"use client";

import type { Forecast } from "@/core/allocate";
import { arrivalForecast, type Arrival, type ArrivalSummary } from "@/core/arrival";
import { addDays } from "@/core/time";
import type { DateKey, NocturneData } from "@/core/types";
import { useI18n } from "@/i18n";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Sheet } from "@/components/ui/Sheet";

export function useArrivals(data: NocturneData, forecast: Forecast, today: DateKey): ArrivalSummary {
  return arrivalForecast(forecast, data.tasks, today);
}

/** One line of reassurance (or an honest warning) under tonight's figures. */
export function ArrivalLine({ summary, onOpen, className = "", style }: { summary: ArrivalSummary; onOpen: () => void; className?: string; style?: React.CSSProperties }) {
  const { t } = useI18n();
  const dated = summary.onTime + summary.late;
  if (dated === 0) return null;
  const ok = summary.late === 0;
  return (
    <button type="button" onClick={onOpen} className={`group inline-flex min-h-9 items-center gap-2 text-left text-[0.8125rem] ${ok ? "text-[#a9cdb6]" : "text-signal"} ${className}`} style={style}>
      {ok ? <CheckMark /> : <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-signal animate-breathe" aria-hidden />}
      <span className="underline decoration-current/25 underline-offset-4 group-hover:decoration-current/60">
        {ok ? (dated === 1 ? t("scene.arrival.oneOnTime") : t("scene.arrival.allOnTime", { n: dated })) : t("scene.arrival.someLate", { n: summary.late })}
      </span>
      <Icon name="chevron" size={12} />
    </button>
  );
}

/** The arithmetic and the per-task arrival days, so the plan can be checked, not just trusted. */
export function ArrivalSheet({
  open,
  onClose,
  summary,
  today,
  onResolve,
}: {
  open: boolean;
  onClose: () => void;
  summary: ArrivalSummary;
  today: DateKey;
  onResolve?: () => void;
}) {
  const { t, fmt } = useI18n();
  const spare = summary.availableMinutes - summary.neededMinutes;
  return (
    <Sheet open={open} onClose={onClose} title={t("scene.arrival.title")} eyebrow={t("scene.arrival.eyebrow")}>
      <p className="text-sm leading-relaxed text-mist">{t("scene.arrival.intro")}</p>
      {summary.neededMinutes > 0 && (
        <dl className="mt-5 grid grid-cols-3 gap-3 rounded-xl border border-rule px-4 py-3 font-mono tabular">
          <Figure label={t("scene.arrival.needed")} value={fmt.duration(summary.neededMinutes)} />
          <Figure label={t("scene.arrival.available")} value={fmt.duration(summary.availableMinutes)} />
          <Figure label={t("scene.arrival.spare")} value={spare >= 0 ? fmt.duration(spare) : `−${fmt.duration(-spare)}`} tone={spare >= 0 ? "ok" : "late"} />
        </dl>
      )}
      <ul className="mt-6 space-y-4">
        {summary.arrivals.map((a) => (
          <Row key={a.task.id} a={a} today={today} />
        ))}
      </ul>
      <p className="mt-7 border-t border-rule-soft pt-4 text-xs leading-relaxed text-haze">{t("scene.arrival.recalc")}</p>
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <ButtonLink href="/service" variant="ghost" size="sm">
          {t("scene.arrival.moreTime")}
        </ButtonLink>
        {summary.late > 0 && onResolve && (
          <Button variant="secondary" size="sm" onClick={onResolve}>
            {t("scene.arrival.adjust")}
          </Button>
        )}
      </div>
    </Sheet>
  );
}

function Row({ a, today }: { a: Arrival; today: DateKey }) {
  const { t, fmt } = useI18n();
  // Today / tomorrow by name, anything later by its date (a bare weekday reads ambiguously).
  const day = (key: DateKey) => (key <= addDays(today, 1) ? fmt.relativeDay(today, key) : fmt.shortDate(key));
  const late = a.short > 0 || (a.slackDays !== null && a.slackDays < 0);
  const verdict = late
    ? t("scene.arrival.short", { min: fmt.duration(Math.max(a.short, 0)) })
    : !a.arrives
      ? t("scene.arrival.notPlanned")
      : a.slackDays === null
        ? t("scene.arrival.arrives", { day: day(a.arrives) })
        : a.slackDays === 0
          ? t("scene.arrival.onDeadline")
          : a.slackDays === 1
            ? t("scene.arrival.dayEarly")
            : t("scene.arrival.early", { n: a.slackDays });
  return (
    <li className="border-l border-rule pl-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-paper">{a.task.title}</span>
        <span className={`shrink-0 text-xs ${late ? "text-signal" : "text-[#a9cdb6]"}`}>{verdict}</span>
      </div>
      <p className="mt-0.5 text-xs text-mist">
        {a.task.deadline ? t("scene.arrival.due", { day: day(a.task.deadline) }) : t("scene.arrival.noDeadline")}
        {a.arrives && !late && a.slackDays !== null && <> · {t("scene.arrival.arrives", { day: day(a.arrives) })}</>}
      </p>
      {a.plan.length > 0 && (
        <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[0.6875rem] tabular text-haze">
          {a.plan.slice(0, 6).map((d) => (
            <span key={d.date}>
              {day(d.date)} {fmt.duration(d.minutes)}
            </span>
          ))}
          {a.plan.length > 6 && <span>…</span>}
        </p>
      )}
    </li>
  );
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: "ok" | "late" }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-[0.5625rem] tracking-[0.16em] text-haze">{label.toUpperCase()}</dt>
      <dd className={`mt-1 truncate text-sm ${tone === "ok" ? "text-[#a9cdb6]" : tone === "late" ? "text-signal" : "text-paper"}`}>{value}</dd>
    </div>
  );
}

function CheckMark() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" className="shrink-0" aria-hidden>
      <circle cx="6.5" cy="6.5" r="5.75" fill="none" stroke="currentColor" strokeOpacity="0.5" />
      <path d="M4 6.7 5.8 8.4 9.1 4.9" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
