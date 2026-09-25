"use client";

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";

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

/**
 * FLIP-style reordering: when `signature` changes, children marked with
 * `data-flip="<id>"` glide from their old position to the new one, and
 * newcomers fade in. Uses the Web Animations API; skipped for reduced motion.
 */
export function useFlip(ref: React.RefObject<HTMLElement | null>, signature: string, disabled = false) {
  const positions = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const items = Array.from(root.querySelectorAll<HTMLElement>("[data-flip]"));
    const next = new Map<string, number>();
    const hadPrevious = positions.current.size > 0;
    for (const item of items) {
      const id = item.dataset.flip!;
      const top = item.offsetTop;
      next.set(id, top);
      if (disabled || reduce || typeof item.animate !== "function") continue;
      const prev = positions.current.get(id);
      if (prev !== undefined && Math.abs(prev - top) > 1) {
        item.animate([{ transform: `translateY(${prev - top}px)` }, { transform: "translateY(0)" }], {
          duration: 800,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        });
      } else if (prev === undefined && hadPrevious) {
        item.animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "translateY(0)" }], {
          duration: 700,
          delay: 250,
          easing: "ease-out",
          fill: "backwards",
        });
      }
    }
    positions.current = next;
  }, [ref, signature, disabled]);
}

/**
 * Focus a field only once its sheet or step has settled. On phones the
 * keyboard rising mid-animation breaks the scene, so it waits for the
 * slide to finish; with a mouse it can come a little sooner.
 */
export function useSettledFocus(ref: React.RefObject<HTMLElement | null>, enabled = true, delayMs = 650) {
  useEffect(() => {
    if (!enabled) return;
    const touch = window.matchMedia("(pointer: coarse)").matches;
    const timer = setTimeout(() => ref.current?.focus({ preventScroll: true }), touch ? delayMs : Math.min(delayMs, 300));
    return () => clearTimeout(timer);
  }, [ref, enabled, delayMs]);
}
