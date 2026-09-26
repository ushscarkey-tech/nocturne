"use client";

import type { Forecast } from "@/core/allocate";
import { diffRoutes, type RouteDiff, type StationMark } from "@/core/routeDiff";
import { routeOf } from "@/core/sessions";
import { clock, serviceDate } from "@/core/time";
import type { DateKey, Message, NocturneData, StudySession } from "@/core/types";
import { useI18n } from "@/i18n";
import { FlipText } from "@/components/scene/FlipText";
import { useStore } from "@/state/store";

/** How long a route change stays marked on the board. */
const RECENT_MS = 30 * 60_000;

/** The route change still worth pointing out on tonight's board, if any. */
export function useRecentChange(data: NocturneData, now: Date): { diff: RouteDiff; at: string; lines: string[]; messages?: Message[] } | null {
  const memo = useStore((s) => s.routeMemo);
  const today = serviceDate(now);
  if (!memo || memo.date !== today || now.getTime() - Date.parse(memo.at) > RECENT_MS) return null;
  const diff = diffRoutes(memo.before, routeOf(data.sessions, today), memo.at);
  return diff.changed ? { diff, at: memo.at, lines: memo.lines, messages: memo.messages } : null;
}

/** First later day the forecast puts this task on: the train its work transfers to. */
export function transferDay(forecast: Forecast, taskId: string, today: DateKey): DateKey | null {
  return forecast.days.find((d) => d.date > today && (d.allocations[taskId] ?? 0) > 0)?.date ?? null;
}

/**
 * The platform departure board: tonight's next stations, one line each,
 * with what the last route adjustment did to them — earlier, delayed, new,
 * or a transfer.
 */
export function DepartureBoard({
  data,
  now,
  forecast,
  onOpen,
  className = "",
  style,
}: {
  data: NocturneData;
  now: Date;
  forecast: Forecast;
  onOpen: () => void;
  className?: string;
  style?: React.CSSProperties;
}) {
  const { t, fmt } = useI18n();
  const today = serviceDate(now);
  const rows = routeOf(data.sessions, today).filter((s) => s.status === "planned" || s.status === "active");
  const recent = useRecentChange(data, now);
  if (rows.length === 0) return null;
  const title = (id: string) => data.tasks.find((x) => x.id === id)?.title ?? "—";
  // Four lines on a phone; the tall board on a wide screen shows up to eight.
  const shown = rows.slice(0, 8);
  const more = (n: number) => rows.length - Math.min(rows.length, n);
  const transfers = recent?.diff.transfers.slice(0, 2) ?? [];

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={t("scene.openRoute")}
      className={`relative block w-full rounded-md border border-black/70 bg-[#090d11]/88 px-3.5 pb-2.5 pt-2 text-left lg:px-5 lg:pb-4 lg:pt-3.5 shadow-[0_18px_40px_-20px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.04)] transition-colors hover:border-white/10 ${className}`}
      style={style}
    >
      {/* Hangers: the board hangs from the canopy. */}
      <span className="absolute -top-3 left-[18%] h-3 w-px bg-white/10" aria-hidden />
      <span className="absolute -top-3 right-[18%] h-3 w-px bg-white/10" aria-hidden />
      <div className="flex items-center justify-between font-mono text-[0.5625rem] tracking-[0.28em] text-paper/45 lg:text-[0.625rem]">
        <span>{t("scene.departures").toUpperCase()}</span>
        {recent ? (
          <span className="flex items-center gap-1.5 text-lamp/90">
            <span className="h-1 w-1 rounded-full bg-lamp motion-safe-only animate-led" aria-hidden />
            {t("scene.routeChangedAt", { at: clock(recent.at) })}
          </span>
        ) : (
          <span className="tabular">{clock(now)}</span>
        )}
      </div>
      <ol className="mt-1.5 lg:mt-3">
        {shown.map((s, i) => (
          <Row key={s.id} s={s} title={title(s.taskId)} mark={recent?.diff.marks[s.id]} hideOnShort={i >= 2} wideOnly={i >= 4} />
        ))}
      </ol>
      {more(4) > 0 && (
        <p className="mt-1 text-right font-mono text-[0.5625rem] tracking-[0.2em] text-haze lg:hidden">{t("scene.moreStations", { n: more(4) })}</p>
      )}
      {more(8) > 0 && (
        <p className="mt-2 hidden text-right font-mono text-[0.625rem] tracking-[0.2em] text-haze lg:block">{t("scene.moreStations", { n: more(8) })}</p>
      )}
      {transfers.map((x) => {
        const day = transferDay(forecast, x.taskId, today);
        return (
          <p key={x.taskId} className="mt-1.5 flex animate-enter items-center gap-2 border-t border-white/[0.05] pt-1.5 text-[0.75rem] text-lamp/85">
            <TransferIcon />
            <span className="truncate">
              {t("scene.transferOut", { task: title(x.taskId), min: fmt.duration(x.minutes), day: day ? fmt.relativeDay(today, day) : t("scene.anotherDay") })}
            </span>
          </p>
        );
      })}
    </button>
  );
}

function Row({ s, title, mark, hideOnShort, wideOnly }: { s: StudySession; title: string; mark?: StationMark; hideOnShort: boolean; wideOnly: boolean }) {
  const { t, fmt } = useI18n();
  const running = s.status === "active";
  return (
    <li
      className={`grid-cols-[2.9rem_minmax(0,4.6rem)_minmax(0,1fr)_auto] items-baseline gap-2 border-t border-white/[0.045] py-[0.3rem] first:border-t-0 lg:grid-cols-[3.6rem_minmax(0,5.5rem)_minmax(0,1fr)_auto] lg:gap-3 lg:py-2.5 ${
        wideOnly ? "hidden lg:grid" : "grid"
      } ${hideOnShort ? "[@media(max-height:740px)]:max-lg:hidden" : ""}`}
    >
      <span className="font-mono text-[0.8125rem] tabular text-[#e8c88f] lg:text-[1.0625rem]">
        <FlipText text={clock(s.plannedStart)} stagger={25} />
      </span>
      <span className="station-label truncate font-mono text-[0.5625rem] tracking-[0.14em] text-paper/50 lg:text-[0.6875rem]">{fmt.station(s.stationName)}</span>
      <span className="truncate text-[0.8125rem] text-paper-dim lg:text-[0.9375rem]">{title}</span>
      <span key={mark?.kind ?? (running ? "run" : "same")} className="animate-enter whitespace-nowrap text-right font-mono text-[0.625rem] tracking-[0.06em] lg:text-[0.75rem]">
        {running ? (
          <span className="inline-flex items-center gap-1 text-[#9fd4b4]">
            <span className="h-1 w-1 rounded-full bg-[#9fd4b4] motion-safe-only animate-breathe" aria-hidden />
            {t("scene.status.running")}
          </span>
        ) : !mark || mark.kind === "same" ? (
          <span className="text-haze">{fmt.duration(s.plannedMinutes)}</span>
        ) : mark.kind === "earlier" ? (
          <span className="text-lamp" title={t("scene.wasAt", { at: mark.from })}>
            <span className="mr-1 text-haze line-through decoration-haze/60">{mark.from}</span>
            {t("scene.status.earlier")}
          </span>
        ) : mark.kind === "later" ? (
          <span className="text-signal" title={t("scene.wasAt", { at: mark.from })}>
            {t("scene.status.later", { min: fmt.duration(mark.min) })}
          </span>
        ) : mark.kind === "new" ? (
          <span className="text-paper">{t("scene.status.new")}</span>
        ) : (
          <span className="inline-flex items-center gap-1 text-lamp">
            <TransferIcon />
            {t("scene.status.transfer")}
          </span>
        )}
      </span>
    </li>
  );
}

/** Two lines changing tracks: the transfer mark. */
export function TransferIcon() {
  return (
    <svg width="12" height="10" viewBox="0 0 12 10" className="shrink-0" aria-hidden>
      <path d="M1 3h8.5M7.5 1l2 2-2 2M11 7H2.5M4.5 5l-2 2 2 2" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** In the route sheet: why the route changed, then what each station did. */
export function RecentChangeDetail({ data, now, forecast }: { data: NocturneData; now: Date; forecast: Forecast }) {
  const { t, tm, fmt } = useI18n();
  const recent = useRecentChange(data, now);
  if (!recent) return null;
  const today = serviceDate(now);
  const route = routeOf(data.sessions, today);
  const title = (id: string) => data.tasks.find((x) => x.id === id)?.title ?? "—";
  const moved = route.filter((s) => recent.diff.marks[s.id] && recent.diff.marks[s.id].kind !== "same");
  const reasons = recent.messages ? recent.messages.map(tm) : recent.lines;
  return (
    <section className="mb-7 rounded-xl border border-lamp/20 bg-lamp/[0.03] px-4 py-3.5" aria-label={t("scene.recentChange")}>
      <p className="flex items-center justify-between font-mono text-[0.625rem] tracking-[0.22em] text-lamp/90">
        <span>{t("scene.recentChange").toUpperCase()}</span>
        <span className="tabular">{clock(recent.at)}</span>
      </p>
      <div className="mt-2 space-y-0.5 text-sm text-paper-dim">
        {reasons.slice(0, 2).map((l, i) => (
          <p key={i}>{l}</p>
        ))}
      </div>
      {(moved.length > 0 || recent.diff.transfers.length > 0) && (
        <ul className="mt-3 space-y-1.5 border-t border-white/[0.06] pt-3 text-[0.8125rem]">
          {moved.map((s) => {
            const m = recent.diff.marks[s.id];
            const at = clock(s.plannedStart);
            const text =
              m.kind === "earlier"
                ? t("scene.changeEarlier", { at, min: fmt.duration(m.min) })
                : m.kind === "later"
                  ? t("scene.changeLater", { at, min: fmt.duration(m.min) })
                  : m.kind === "new"
                    ? t("scene.changeNew", { at })
                    : t("scene.changeTransfer", { station: fmt.station(s.stationName), at });
            return (
              <li key={s.id} className="flex gap-2">
                <span className={`mt-[0.45rem] h-1.5 w-1.5 shrink-0 rounded-full ${m.kind === "later" ? "bg-signal" : "bg-lamp"}`} aria-hidden />
                <span className="min-w-0">
                  <span className="text-paper">{title(s.taskId)}</span> <span className="text-mist">{text}</span>
                </span>
              </li>
            );
          })}
          {recent.diff.transfers.map((x) => {
            const day = transferDay(forecast, x.taskId, today);
            return (
              <li key={x.taskId} className="flex items-center gap-2 text-lamp/90">
                <TransferIcon />
                <span className="min-w-0">
                  {t("scene.transferOut", { task: title(x.taskId), min: fmt.duration(x.minutes), day: day ? fmt.relativeDay(today, day) : t("scene.anotherDay") })}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
