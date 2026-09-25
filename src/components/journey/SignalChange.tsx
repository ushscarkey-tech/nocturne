"use client";

import { useEffect, useState } from "react";
import { create } from "zustand";
import { useI18n } from "@/i18n";
import { useStore, type Notice } from "@/state/store";

/** While a route change settles, transit lines dim and redraw. */
export const useSignal = create<{ changing: boolean }>(() => ({ changing: false }));

export function isRouteChange(n: Notice | null): boolean {
  return !!n && n.headlineKey === "change.headline";
}

/**
 * A route change on the train is not a pop-up: a small SIGNAL CHANGE lamp
 * blinks first, the line redraws, then a short note says what moved.
 */
export function SignalChange() {
  const { t, tm } = useI18n();
  const notice = useStore((s) => s.notice);
  const dismiss = useStore((s) => s.dismissNotice);
  const [stage, setStage] = useState<{ id: number; step: "signal" | "note" } | null>(null);
  const current = isRouteChange(notice) ? notice : null;

  if (current && stage?.id !== current.id) setStage({ id: current.id, step: "signal" });
  if (!current && stage) setStage(null);

  useEffect(() => {
    if (!current) return;
    useSignal.setState({ changing: true });
    const a = setTimeout(() => setStage({ id: current.id, step: "note" }), 1100);
    const b = setTimeout(() => useSignal.setState({ changing: false }), 1500);
    const c = setTimeout(dismiss, 9000);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
      clearTimeout(c);
      useSignal.setState({ changing: false });
    };
  }, [current, dismiss]);

  if (!current || !stage) return null;
  const lines = current.messages ? current.messages.map(tm) : current.lines;

  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-[max(3.75rem,calc(env(safe-area-inset-top)+3.25rem))] z-40 flex justify-center px-6">
      <div
        role="status"
        className="pointer-events-auto flex max-w-sm flex-col items-center text-center"
        onClick={dismiss}
      >
        <p className="flex items-center gap-2 rounded-full border border-lamp/25 bg-night-950/85 px-3 py-1 font-mono text-[0.625rem] tracking-[0.3em] text-lamp/90 animate-fade">
          <span className="h-1.5 w-1.5 rounded-full bg-lamp motion-safe-only animate-[led_900ms_steps(1)_3]" aria-hidden />
          {stage.step === "signal" ? t("scene.signalChange") : t("scene.routeAdjusted").toUpperCase()}
        </p>
        {stage.step === "note" && (
          <div className="mt-3 space-y-1 text-sm leading-relaxed text-paper-dim [text-shadow:0_1px_12px_rgba(0,0,0,0.8)]">
            {lines.slice(0, 3).map((l, i) => (
              <p key={i} className="animate-rise" style={{ animationDelay: `${i * 180}ms` }}>
                {l}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
