"use client";

import { useMemo, useState } from "react";
import { archiveStats, focusByDay, ticketFace } from "@/core/stats";
import { parseDateKey, serviceDate } from "@/core/time";
import type { Locale } from "@/core/types";
import { ArchiveStatistics } from "@/components/archive/ArchiveStatistics";
import { EmptyWallet } from "@/components/archive/EmptyWallet";
import {
  TicketWallet,
  type WalletMonth,
} from "@/components/archive/TicketWallet";
import { Sheet } from "@/components/ui/Sheet";
import { useData } from "@/state/store";
import { useI18n } from "@/i18n";

const INTL: Record<Locale, string> = {
  en: "en-US",
  ko: "ko-KR",
  ja: "ja-JP",
  zh: "zh-CN",
};

export default function ArchivePage() {
  const data = useData();
  const { t, fmt, locale } = useI18n();
  const today = serviceDate(new Date());
  const [statsOpen, setStatsOpen] = useState(false);

  const months = useMemo<WalletMonth[]>(() => {
    const monthName = new Intl.DateTimeFormat(INTL[locale], {
      year: "numeric",
      month: "long",
    });
    const byMonth = new Map<string, WalletMonth>();
    const journeys = data.journeys
      .filter((j) => data.tickets.some((tk) => tk.journeyId === j.id))
      .sort((a, b) => b.date.localeCompare(a.date));
    for (const j of journeys) {
      const key = j.date.slice(0, 7);
      let month = byMonth.get(key);
      if (!month) {
        month = {
          key,
          label: monthName.format(parseDateKey(j.date)),
          tickets: [],
        };
        byMonth.set(key, month);
      }
      const ticket = data.tickets.find((tk) => tk.journeyId === j.id)!;
      month.tickets.push({
        journeyId: j.id,
        date: j.date,
        face: ticketFace(data, j),
        style: ticket.ticketStyle,
      });
    }
    return [...byMonth.values()];
  }, [data, locale]);

  const stats = useMemo(() => archiveStats(data, today), [data, today]);
  const week = useMemo(
    () => focusByDay(data.sessions, today, 7),
    [data.sessions, today],
  );

  return (
    <div className="animate-fade">
      <header>
        <p className="eyebrow">{t("archive.pastJourneys")}</p>
        <h1 className="mt-2 font-display text-5xl leading-none">
          {t("archive.title")}
        </h1>
      </header>

      {/* Wide screens: the wallet at left, the numbers open beside it. */}
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,34rem)] lg:items-start lg:gap-x-16 xl:gap-x-20">
        <div>
          {months.length === 0 ? (
            <EmptyWallet />
          ) : (
            <TicketWallet months={months} />
          )}

          <div className="mt-3 flex justify-center lg:hidden">
            <button
              type="button"
              onClick={() => setStatsOpen(true)}
              className="flex h-11 items-center gap-3 rounded-full border border-rule px-5 text-sm text-mist transition-colors duration-500 ease-[var(--ease-glide)] hover:border-mist/50 hover:text-paper"
            >
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden>
                <path
                  d="M2.5 13.5v-4M6.5 13.5v-8M10.5 13.5v-6M14 13.5v-10"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                  fill="none"
                />
              </svg>
              <span>{t("archive.statistics")}</span>
              <span className="font-mono text-xs text-haze tabular">
                {fmt.duration(stats.weekFocused)}
              </span>
            </button>
          </div>
        </div>

        <section
          className="hidden lg:mt-10 lg:block lg:rounded-2xl lg:border lg:border-rule-soft lg:bg-night-850/40 lg:p-8"
          aria-label={t("archive.statistics")}
        >
          <h2 className="eyebrow mb-6">{t("archive.statistics")}</h2>
          <ArchiveStatistics stats={stats} week={week} today={today} />
        </section>
      </div>

      <Sheet
        open={statsOpen}
        onClose={() => setStatsOpen(false)}
        title={t("archive.statistics")}
        eyebrow={t("archive.title")}
        wide
      >
        <ArchiveStatistics stats={stats} week={week} today={today} />
      </Sheet>
    </div>
  );
}
