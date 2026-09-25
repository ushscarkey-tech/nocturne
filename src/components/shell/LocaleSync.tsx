"use client";

import { useEffect } from "react";
import { useLocale } from "@/i18n";

/** Keeps <html lang> in step with the chosen language (fonts and screen readers follow it). */
export function LocaleSync() {
  const locale = useLocale();
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return null;
}
