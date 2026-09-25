"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

/** Current time, refreshed on an interval (aligned to the second). */
export function useNow(intervalMs = 1000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    const tick = () => setNow(new Date());
    const align = setTimeout(() => {
      tick();
      timer = setInterval(tick, intervalMs);
    }, intervalMs - (Date.now() % intervalMs));
    return () => {
      clearTimeout(align);
      if (timer) clearInterval(timer);
    };
  }, [intervalMs]);
  return now;
}

const subscribeNothing = () => () => {};

/** False during server render and hydration, true afterwards. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );
}

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}
