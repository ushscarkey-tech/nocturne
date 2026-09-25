"use client";

import { useStore } from "@/state/store";
import { useI18n } from "@/i18n";

/** Quiet indicator shown only when saving fails. */
export function SyncStatus() {
  const { t } = useI18n();
  const syncError = useStore((s) => s.syncError);
  if (!syncError) return null;
  return (
    <p
      role="alert"
      className="fixed left-1/2 top-3 z-40 -translate-x-1/2 rounded-full border border-signal/40 bg-night-850 px-4 py-1.5 text-xs text-signal"
    >
      {t("shell.notSaved", { error: syncError })}
    </p>
  );
}
