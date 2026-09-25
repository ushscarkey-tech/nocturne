"use client";

import { useCallback, useEffect, useLayoutEffect, useState, useSyncExternalStore, type RefObject } from "react";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/Button";
import { useStore } from "@/state/store";

export interface CoachStep {
  target: RefObject<HTMLElement | null>;
  title: string;
  body: string;
}

const KEY = "nocturne:coach:tonight";
const listeners = new Set<() => void>();
function seen(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return true;
  }
}
function markSeen() {
  try {
    window.localStorage.setItem(KEY, "1");
  } catch {
    /* storage unavailable */
  }
  listeners.forEach((l) => l());
}

/** Whether the first-visit tour of Tonight still needs showing. */
export function useCoachPending(): boolean {
  return !useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    seen,
    () => true,
  );
}

type Rect = { top: number; left: number; width: number; height: number };

/**
 * A three-stop tour of Tonight on the first visit: a soft spotlight moves
 * from the departure board to the departure time to Board, with one plain
 * sentence each. Shown once; skippable at every step.
 */
export function Coach({ steps, delayMs = 2600 }: { steps: CoachStep[]; delayMs?: number }) {
  const { t } = useI18n();
  const pending = useCoachPending();
  const [ready, setReady] = useState(false);
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);

  // Wait for Tonight to finish arriving before starting.
  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => {
      useStore.getState().dismissNotice();
      setReady(true);
    }, delayMs);
    return () => clearTimeout(timer);
  }, [pending, delayMs]);

  const measure = useCallback(() => {
    const el = steps[i]?.target.current;
    if (!el) return setRect(null);
    const r = el.getBoundingClientRect();
    const pad = 8;
    setRect({ top: r.top - pad, left: r.left - pad, width: r.width + pad * 2, height: r.height + pad * 2 });
  }, [steps, i]);

  useLayoutEffect(() => {
    if (!ready) return;
    const frame = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(frame);
  }, [ready, measure]);

  useEffect(() => {
    if (!ready) return;
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [ready, measure]);

  if (!pending || !ready || !rect) return null;
  const step = steps[i];
  const last = i === steps.length - 1;
  const below = rect.top + rect.height + 220 < window.innerHeight;

  return (
    <div className="fixed inset-0 z-50 animate-fade" role="dialog" aria-modal="true" aria-label={step.title}>
      {/* The spotlight: everything else dims. */}
      <div
        className="pointer-events-none absolute rounded-2xl border border-lamp/40 shadow-[0_0_0_200vmax_rgba(3,5,10,0.74)] transition-[top,left,width,height] duration-700 ease-[var(--ease-glide)]"
        style={rect}
        aria-hidden
      />
      <div
        key={i}
        className="absolute inset-x-4 mx-auto max-w-sm animate-enter rounded-2xl border border-rule bg-night-850 px-5 py-4 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.9)]"
        style={below ? { top: rect.top + rect.height + 14 } : { top: Math.max(16, rect.top - 14 - 200) }}
      >
        <p className="font-mono text-[0.625rem] tracking-[0.22em] text-lamp/90">{t("scene.coachStep", { n: i + 1, total: steps.length })}</p>
        <p className="mt-1.5 font-display text-xl leading-snug text-paper">{step.title}</p>
        <p className="mt-2 text-sm leading-relaxed text-mist">{step.body}</p>
        <div className="mt-4 flex items-center justify-between">
          <button type="button" onClick={markSeen} className="min-h-10 px-1 text-sm text-haze hover:text-mist">
            {t("scene.coachSkip")}
          </button>
          <Button variant="primary" size="sm" onClick={() => (last ? markSeen() : setI(i + 1))}>
            {last ? t("scene.coachDone") : t("scene.coachNext")}
          </Button>
        </div>
      </div>
    </div>
  );
}
