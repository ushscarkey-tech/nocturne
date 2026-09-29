"use client";

import { useEffect } from "react";
import type { Locale } from "@/core/types";
import { useLocale } from "@/i18n";

/** Each language's own faces (Google Fonts); English needs none beyond the site's. */
const CJK: Partial<Record<Locale, string>> = {
  ko: "family=IBM+Plex+Sans+KR:wght@400;500&family=Noto+Serif+KR:wght@300;400",
  ja: "family=IBM+Plex+Sans+JP:wght@400;500&family=Shippori+Mincho:wght@400;500",
  zh: "family=Noto+Sans+SC:wght@400;500&family=Noto+Serif+SC:wght@400;500",
};

/**
 * Keeps <html lang> in step with the chosen language (fonts and screen readers
 * follow it), and brings in that language's faces after the page is up, so
 * they never hold up the first paint; text shows in the fallback and swaps.
 */
export function LocaleSync() {
  const locale = useLocale();
  useEffect(() => {
    document.documentElement.lang = locale;
    const families = CJK[locale];
    if (!families) return;
    const id = `nocturne-fonts-${locale}`;
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?${families}&display=swap`;
    document.head.appendChild(link);
  }, [locale]);
  return null;
}
