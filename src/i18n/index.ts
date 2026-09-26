"use client";

/**
 * Tiny i18n layer. English is the source of truth (`en/*`); other languages
 * may be partial and fall back to English key by key.
 *
 *   const { t, fmt, locale } = useI18n();
 *   t("tasks.remaining", { min: 90 })   // `min` params render as durations
 */
import { stationLabel } from "@/core/stations";
import { useCallback, useMemo, useSyncExternalStore } from "react";
import { fill } from "@/core/messages";
import { addDays, diffDays, parseDateKey } from "@/core/time";
import type { DateKey, Locale, Message } from "@/core/types";
import { useStore } from "@/state/store";
import en from "./en";
import ja from "./ja";
import ko from "./ko";
import zh from "./zh";

export type MessageKey = keyof typeof en;
export type Params = Record<string, string | number>;

export const LOCALES: { id: Locale; name: string }[] = [
  { id: "en", name: "English" },
  { id: "ko", name: "한국어" },
  { id: "ja", name: "日本語" },
  { id: "zh", name: "简体中文" },
];

const DICTIONARIES: Record<Locale, Partial<Record<MessageKey, string>>> = { en, ko, ja, zh };
const INTL: Record<Locale, string> = { en: "en-US", ko: "ko-KR", ja: "ja-JP", zh: "zh-CN" };
const LOCALE_KEY = "nocturne:locale";

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function formatMinutes(locale: Locale, minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const r = m % 60;
  switch (locale) {
    case "ko":
      return h === 0 ? `${r}분` : r === 0 ? `${h}시간` : `${h}시간 ${r}분`;
    case "ja":
      return h === 0 ? `${r}分` : r === 0 ? `${h}時間` : `${h}時間${r}分`;
    case "zh":
      return h === 0 ? `${r}分钟` : r === 0 ? `${h}小时` : `${h}小时${r}分`;
    default:
      return h === 0 ? `${r}m` : r === 0 ? `${h}h` : `${h}h ${String(r).padStart(2, "0")}m`;
  }
}

export function translate(locale: Locale, key: string, params?: Params): string {
  const template = DICTIONARIES[locale][key as MessageKey] ?? en[key as MessageKey] ?? key;
  return fill(template, params, (m) => formatMinutes(locale, m));
}

export function makeFormatters(locale: Locale) {
  const intl = INTL[locale];
  const date = (key: DateKey, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(intl, options).format(parseDateKey(key));
  return {
    duration: (minutes: number) => formatMinutes(locale, minutes),
    /** A station's name as it reads in this language (순우리말 in Korean). */
    station: (name: string) => stationLabel(name, locale),
    /** "Friday, Sep 25" / "9월 25일 금요일" */
    longDate: (key: DateKey) => date(key, { weekday: "long", month: "short", day: "numeric" }),
    /** "Sep 25" / "9월 25일" */
    shortDate: (key: DateKey) => date(key, { month: "short", day: "numeric" }),
    /** "Fri" / "금" */
    weekday: (key: DateKey) => date(key, { weekday: "short" }),
    weekdayOf: (dayIndex: number) => date(addDays("2026-09-27", dayIndex), { weekday: "short" }),
    /** Today / Tomorrow / Fri / Oct 3 / 2 days overdue */
    relativeDay: (today: DateKey, key: DateKey) => {
      const n = diffDays(today, key);
      if (n === 0) return translate(locale, "common.today");
      if (n === 1) return translate(locale, "common.tomorrow");
      if (n === -1) return translate(locale, "common.yesterday");
      if (n < 0) return translate(locale, "common.overdueDays", { n: -n });
      if (n < 7) return date(key, { weekday: "short" });
      return date(key, { month: "short", day: "numeric" });
    },
  };
}

// ---------------------------------------------------------------------------
// Locale selection
// ---------------------------------------------------------------------------

export function detectLocale(): Locale {
  try {
    const saved = window.localStorage.getItem(LOCALE_KEY) as Locale | null;
    if (saved && saved in DICTIONARIES) return saved;
  } catch {
    /* ignore */
  }
  const nav = typeof navigator !== "undefined" ? navigator.language.slice(0, 2) : "en";
  return (["ko", "ja", "zh"].includes(nav) ? nav : "en") as Locale;
}

export function rememberLocale(locale: Locale) {
  try {
    window.localStorage.setItem(LOCALE_KEY, locale);
  } catch {
    /* ignore */
  }
  document.documentElement.lang = locale;
  listeners.forEach((l) => l());
}

const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** The active language: the traveller's profile once loaded, otherwise the device's. */
export function useLocale(): Locale {
  const fromProfile = useStore((s) => s.data?.profile.locale ?? null);
  const detected = useSyncExternalStore(subscribe, detectLocale, () => "en" as Locale);
  return fromProfile ?? detected;
}

export function useI18n() {
  const locale = useLocale();
  const t = useCallback((key: MessageKey, params?: Params) => translate(locale, key, params), [locale]);
  /** Render a core Message (route changes etc.). */
  const tm = useCallback((m: Message) => translate(locale, m.key, m.params), [locale]);
  const fmt = useMemo(() => makeFormatters(locale), [locale]);
  return { t, tm, fmt, locale };
}
