"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import type { TicketFace } from "@/core/stats";
import type { CarriageId } from "@/core/types";
import { Ticket } from "@/components/ticket/Ticket";
import { Icon } from "@/components/ui/Icon";
import { ticketHref } from "@/lib/paths";
import { useI18n } from "@/i18n";

export interface WalletTicket {
  journeyId: string;
  date: string;
  face: TicketFace;
  style: CarriageId;
}

export interface WalletMonth {
  /** "2026-09" */
  key: string;
  label: string;
  tickets: WalletTicket[];
}

/** Vertical step between cards peeking out behind the top one. */
const PEEK = 13;
const PEEK_DEPTH = 3;
/** How much of each card shows when the deck is spread out. */
const STRIP = 58;
const MOTION = "transform 650ms var(--ease-glide), opacity 550ms var(--ease-glide)";

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * The Archive's ticket wallet: one page per month, swiped sideways, each
 * holding that month's tickets as a small deck.
 */
export function TicketWallet({ months }: { months: WalletMonth[] }) {
  const { t } = useI18n();
  const scroller = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [spread, setSpread] = useState(false);
  const frame = useRef(0);

  const onScroll = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const el = scroller.current;
      if (!el || !el.clientWidth) return;
      const i = Math.max(0, Math.min(months.length - 1, Math.round(el.scrollLeft / el.clientWidth)));
      if (i !== active) {
        setActive(i);
        setSpread(false);
      }
    });
  }, [active, months.length]);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const go = (i: number) => {
    const el = scroller.current;
    if (!el) return;
    const next = Math.max(0, Math.min(months.length - 1, i));
    el.scrollTo({ left: next * el.clientWidth, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      go(active + 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      go(active - 1);
    }
  };

  const current = months[active] ?? months[0];
  const count = current.tickets.length;

  return (
    <section aria-roledescription="carousel" aria-label={t("archive.walletLabel")} className="mt-7">
      {/* Month label and pointer controls. */}
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => go(active - 1)}
          disabled={active === 0}
          aria-label={t("archive.newerMonth")}
          className="-ml-3 flex h-11 w-11 items-center justify-center rounded-full text-mist transition-opacity duration-500 hover:text-paper disabled:opacity-25"
        >
          <Icon name="back" size={18} />
        </button>
        <div className="min-w-0 text-center" aria-live="polite">
          <p className="truncate font-display text-xl leading-tight">{current.label}</p>
          <p className="mt-0.5 font-mono text-[0.625rem] tracking-[0.16em] text-haze">
            {count === 1 ? t("archive.ticketCountOne") : t("archive.ticketCount", { n: count })}
          </p>
        </div>
        <button
          type="button"
          onClick={() => go(active + 1)}
          disabled={active === months.length - 1}
          aria-label={t("archive.olderMonth")}
          className="-mr-3 flex h-11 w-11 items-center justify-center rounded-full text-mist transition-opacity duration-500 hover:text-paper disabled:opacity-25"
        >
          <Icon name="chevron" size={18} />
        </button>
      </div>

      <div
        ref={scroller}
        onScroll={onScroll}
        onKeyDown={onKeyDown}
        tabIndex={0}
        className="-mx-6 mt-4 flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] md:-mx-10 [&::-webkit-scrollbar]:hidden"
      >
        {months.map((m, i) => (
          <div
            key={m.key}
            role="group"
            aria-roledescription="slide"
            aria-label={m.label}
            aria-hidden={i !== active}
            inert={i !== active}
            className="flex w-full shrink-0 snap-center snap-always justify-center px-6 pb-8 pt-1 md:px-10"
          >
            {Math.abs(i - active) <= 1 ? (
              <Deck key={`${m.key}:${m.tickets.length}`} tickets={m.tickets} live={i === active} spread={spread && i === active} />
            ) : (
              <div className="h-px w-[16rem]" />
            )}
          </div>
        ))}
      </div>

      {months.length > 1 && (
        <div className="-mt-4 flex items-center justify-center gap-2">
          {months.length <= 10 ? (
            months.map((m, i) => (
              <button
                key={m.key}
                type="button"
                onClick={() => go(i)}
                aria-label={t("archive.showMonth", { month: m.label })}
                aria-current={i === active ? "true" : undefined}
                className="flex h-6 w-5 items-center justify-center"
              >
                <span
                  className={`block h-1.5 rounded-full transition-all duration-700 ease-[var(--ease-glide)] ${
                    i === active ? "w-4 bg-paper-dim/80" : "w-1.5 bg-haze/60"
                  }`}
                />
              </button>
            ))
          ) : (
            <span className="font-mono text-[0.625rem] tracking-[0.16em] text-haze tabular">
              {active + 1} / {months.length}
            </span>
          )}
        </div>
      )}

      {count > 1 && (
        <div className="mt-1 flex justify-center">
          <button
            type="button"
            onClick={() => setSpread((s) => !s)}
            aria-expanded={spread}
            className="h-10 px-4 font-mono text-[0.6875rem] tracking-[0.16em] text-mist uppercase transition-colors duration-500 hover:text-paper"
          >
            {spread ? t("archive.stackTickets") : t("archive.spreadTickets")}
          </button>
        </div>
      )}
    </section>
  );
}

/**
 * A month's tickets as a deck. Stacked: the newest sits on top and a few
 * peek out behind it; tapping the peeking edges brings the next one forward.
 * Spread: the deck opens downward like a wallet so every ticket can be picked.
 */
function Deck({ tickets, live, spread }: { tickets: WalletTicket[]; live: boolean; spread: boolean }) {
  const { t } = useI18n();
  const [order, setOrder] = useState(() => tickets.map((_, i) => i));
  const n = tickets.length;
  // Neighbouring months only need their visible top cards.
  const rendered = live ? order : order.slice(0, PEEK_DEPTH + 1);
  const depthOf = new Map(order.map((idx, d) => [idx, d]));

  const cycle = () => setOrder((o) => [...o.slice(1), o[0]]);

  const place = (d: number, hue: number): CSSProperties => {
    const tilt = hue - 0.5;
    if (spread) {
      // Oldest at the top, the current top card at the bottom, fully visible.
      const row = n - 1 - d;
      return {
        transform: `translateY(${row * STRIP - PEEK * PEEK_DEPTH}px) rotate(${tilt * 0.6}deg)`,
        opacity: 1,
      };
    }
    const depth = Math.min(d, PEEK_DEPTH);
    return {
      transform: `translateY(${-depth * PEEK}px) scale(${1 - depth * 0.035}) rotate(${d === 0 ? tilt * 0.8 : tilt * 3.2}deg)`,
      opacity: d > PEEK_DEPTH ? 0 : 1 - depth * 0.06,
    };
  };

  const extra = spread ? Math.max(0, (n - 1) * STRIP - PEEK * PEEK_DEPTH) : 0;

  return (
    <div
      className="relative w-[16rem] max-w-full"
      style={{
        paddingTop: PEEK * PEEK_DEPTH,
        paddingBottom: extra,
        transition: "padding 650ms var(--ease-glide)",
      }}
    >
      <div className="grid">
        {rendered.map((idx) => {
          const ticket = tickets[idx];
          const d = depthOf.get(idx) ?? 0;
          const interactive = live && (spread || d === 0);
          return (
            <Link
              key={ticket.journeyId}
              href={ticketHref(ticket.journeyId)}
              aria-label={t("archive.openTicket", { date: ticket.date })}
              aria-hidden={!interactive}
              tabIndex={interactive ? 0 : -1}
              className={`col-start-1 row-start-1 block origin-top rounded-[0.6rem] ${interactive ? "" : "pointer-events-none"}`}
              style={{ ...place(d, ticket.face.hueShift), zIndex: n - d, transition: MOTION }}
            >
              <Ticket face={ticket.face} style={ticket.style} size="sm" />
            </Link>
          );
        })}
      </div>

      {live && !spread && n > 1 && (
        <button
          type="button"
          onClick={cycle}
          aria-label={t("archive.nextTicket")}
          className="absolute inset-x-3 top-0 z-[999] rounded-t-[0.6rem]"
          style={{ height: PEEK * PEEK_DEPTH + 6 }}
        />
      )}
    </div>
  );
}
