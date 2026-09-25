"use client";

import { useI18n } from "@/i18n";

/** An empty ticket sleeve, drawn in outline. */
export function EmptyWallet() {
  const { t } = useI18n();
  return (
    <section className="mt-12 flex flex-col items-center text-center" aria-labelledby="empty-wallet-title">
      <svg viewBox="0 0 200 150" className="w-44 text-haze" fill="none" stroke="currentColor" aria-hidden>
        {/* A ticket waiting to slide in, dashed. */}
        <g opacity="0.55" strokeDasharray="3 4" strokeWidth="1">
          <path d="M62 14h76a6 6 0 0 1 6 6v30a7 7 0 0 0 0 14v26H56V64a7 7 0 0 0 0-14V20a6 6 0 0 1 6-6Z" />
        </g>
        <g strokeWidth="1.2" strokeLinejoin="round">
          {/* Sleeve back and front with a thumb cut. */}
          <path d="M34 52h132a6 6 0 0 1 6 6v74a6 6 0 0 1-6 6H34a6 6 0 0 1-6-6V58a6 6 0 0 1 6-6Z" opacity="0.5" />
          <path d="M28 76h54a18 14 0 0 0 36 0h54v56a6 6 0 0 1-6 6H34a6 6 0 0 1-6-6V76Z" />
          <path d="M44 120h40M44 126h24" opacity="0.5" strokeLinecap="round" />
        </g>
      </svg>
      <p id="empty-wallet-title" className="mt-6 text-sm text-paper-dim">
        {t("archive.noTickets")}
      </p>
      <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-mist">{t("archive.noTicketsHint")}</p>
    </section>
  );
}
