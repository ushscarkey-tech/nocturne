"use client";

/**
 * Shared pieces for the intro deck (src/app/intro). Each slide is its own file
 * under ./slides, exports a default component taking `SlideProps`, keeps its
 * copy for all four languages in the file (`useCopy`), and builds its moving
 * picture from these parts and plain CSS. No 3D, no libraries: transforms and
 * opacity only, and a still, finished frame for reduced motion.
 */

import { useEffect, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import type { Locale } from "@/core/types";
import { useLocale } from "@/i18n";

export interface SlideProps {
  /** On screen now: start (or restart) the animation. Off screen: rest. */
  active: boolean;
}

/** The deck's palette: the app's own (navy night, paper, lamp amber, moss, beige, signal). */
export const C = {
  night: "#05080e",
  panel: "#0c121c",
  panel2: "#111925",
  rule: "#222d38",
  paper: "#efe6d3",
  paperDim: "#cdc3ae",
  mist: "#8f978f",
  haze: "#5b645e",
  lamp: "#dcae6a",
  amber: "#e8b872",
  moss: "#2d3d35",
  mossLight: "#5a7466",
  beige: "#c8b796",
  umber: "#5a4535",
  signal: "#c98a7a",
  navy: "#1e2c44",
} as const;

/** This slide's words in the reader's language. */
export function useCopy<T>(copy: Record<Locale, T>): T {
  return copy[useLocale()] ?? copy.en;
}

const reduceQuery = "(prefers-reduced-motion: reduce)";
const subscribeReduce = (fn: () => void) => {
  const m = window.matchMedia(reduceQuery);
  m.addEventListener("change", fn);
  return () => m.removeEventListener("change", fn);
};
/** True when the reader asked for less motion: show the finished frame, still. */
export function useReducedMotion() {
  return useSyncExternalStore(subscribeReduce, () => window.matchMedia(reduceQuery).matches, () => false);
}

/**
 * A scripted timeline for a looping demonstration: returns the current step
 * (0 … steps.length − 1). Each entry is how long that step holds, in ms. It
 * starts at 0 whenever the slide becomes active, loops while active, and with
 * reduced motion sits on the last step.
 */
export function useTimeline(active: boolean, steps: number[], loop = true) {
  const reduce = useReducedMotion();
  const [step, setStep] = useState(0);
  const key = steps.join(",");
  useEffect(() => {
    if (!active || reduce) return;
    let i = 0;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        i = i + 1;
        if (i >= steps.length) {
          if (!loop) return;
          i = 0;
        }
        setStep(i);
        schedule();
      }, steps[i]);
    };
    // Restart from the top each time the slide comes on.
    const start = setTimeout(() => setStep(0), 0);
    schedule();
    return () => {
      clearTimeout(timer);
      clearTimeout(start);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, reduce, key, loop]);
  if (reduce) return steps.length - 1;
  return active ? step : 0;
}

/**
 * Fades and lifts its content in when the slide is active, after `delay` ms.
 * `from` picks the direction it arrives from.
 */
export function Reveal({
  active,
  delay = 0,
  from = "up",
  className = "",
  style,
  children,
}: {
  active: boolean;
  delay?: number;
  from?: "up" | "down" | "left" | "right" | "none";
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const offset = { up: "translate3d(0,14px,0)", down: "translate3d(0,-14px,0)", left: "translate3d(-18px,0,0)", right: "translate3d(18px,0,0)", none: "none" }[from];
  // The slide the deck opens on is active from its first render: wait a frame so it still plays in.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const on = active && mounted;
  return (
    <div
      className={`motion-safe-only ${className}`}
      style={{
        opacity: on ? 1 : 0,
        transform: on ? "none" : offset,
        transition: `opacity 700ms cubic-bezier(0.22,1,0.36,1) ${on ? delay : 0}ms, transform 800ms cubic-bezier(0.22,1,0.36,1) ${on ? delay : 0}ms`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/**
 * The frame every slide shares: the words on one side (eyebrow, title, a line
 * or two), the moving picture on the other; stacked on a phone. `visual` sits
 * in a fixed 4:3 stage so every slide's picture has the same footprint.
 */
export function SlideFrame({
  active,
  eyebrow,
  title,
  body,
  visual,
  aside,
  tone = "default",
}: {
  active: boolean;
  /** Small mono line above the title, e.g. "문제 1" or "기능 · 실시간 재조정". */
  eyebrow: string;
  /** One or two short lines. `\n` breaks the line. */
  title: string;
  /** One or two plain sentences. */
  body?: ReactNode;
  visual: ReactNode;
  /** Optional small footnote under the body (a key fact, a number). */
  aside?: ReactNode;
  /** "problem" tints the eyebrow in signal red; "solution" in lamp amber. */
  tone?: "default" | "problem" | "solution";
}) {
  const eyebrowColor = tone === "problem" ? C.signal : tone === "solution" ? C.lamp : C.mist;
  return (
    <div className="mx-auto grid h-full w-full max-w-6xl grid-rows-[auto_1fr] items-center gap-6 px-6 pb-4 pt-2 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] md:grid-rows-1 md:gap-12 md:px-10">
      <div className="min-w-0">
        <Reveal active={active} delay={80}>
          <p className="font-mono text-[0.6875rem] tracking-[0.28em]" style={{ color: eyebrowColor }}>
            {eyebrow.toUpperCase()}
          </p>
        </Reveal>
        <Reveal active={active} delay={200}>
          <h2 className="mt-3 whitespace-pre-line font-display text-[1.75rem] leading-[1.15] text-paper sm:text-[2.25rem] md:text-[2.75rem]">{title}</h2>
        </Reveal>
        {body && (
          <Reveal active={active} delay={380}>
            <div className="mt-4 max-w-md text-[0.9375rem] leading-relaxed text-paper-dim md:mt-5 md:text-base">{body}</div>
          </Reveal>
        )}
        {aside && (
          <Reveal active={active} delay={560}>
            <div className="mt-5 max-w-md border-l-2 pl-3 font-mono text-xs leading-relaxed tracking-[0.04em] text-mist" style={{ borderColor: C.rule }}>
              {aside}
            </div>
          </Reveal>
        )}
      </div>
      <Reveal active={active} delay={300} from="none" className="min-w-0">
        <div className="relative mx-auto aspect-[4/3] w-full max-w-[34rem] overflow-hidden rounded-[4px] border" style={{ background: C.panel, borderColor: C.rule }}>
          {visual}
        </div>
      </Reveal>
    </div>
  );
}

/** A task as a small paper card: title, a line of detail, an optional tag at right. */
export function TaskChip({
  title,
  meta,
  tag,
  tone = "paper",
  className = "",
  style,
}: {
  title: string;
  meta?: string;
  tag?: ReactNode;
  /** paper: a planned task. dim: pushed aside. lamp: the one that matters now. signal: in trouble. */
  tone?: "paper" | "dim" | "lamp" | "signal";
  className?: string;
  style?: CSSProperties;
}) {
  const bg = tone === "dim" ? "#2a2f33" : "#e9dfc9";
  const ink = tone === "dim" ? C.mist : "#1d2226";
  const edge = tone === "lamp" ? C.lamp : tone === "signal" ? C.signal : tone === "dim" ? "#3a3f44" : "#bfb49c";
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-[3px] border-l-4 px-3 py-2 shadow-[0_6px_14px_-8px_rgba(0,0,0,0.8)] ${className}`}
      style={{ background: bg, color: ink, borderLeftColor: edge, ...style }}
    >
      <div className="min-w-0">
        <p className="truncate text-[0.8125rem] font-medium leading-tight">{title}</p>
        {meta && <p className="mt-0.5 truncate font-mono text-[0.625rem] tracking-[0.06em] opacity-70">{meta}</p>}
      </div>
      {tag && <div className="shrink-0 font-mono text-[0.625rem] tracking-[0.08em]">{tag}</div>}
    </div>
  );
}

/** A small label, square-cornered: for factors (중요도, 마감…), states, times. */
export function Tag({ children, color = C.mist, className = "" }: { children: ReactNode; color?: string; className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-[2px] border px-1.5 py-0.5 font-mono text-[0.625rem] leading-none tracking-[0.08em] ${className}`} style={{ color, borderColor: `${color}66` }}>
      {children}
    </span>
  );
}

/**
 * The amber-on-black board the carriage and the ticket machine use, for a
 * line of status in a picture ("신호 변경", "22:40 도착" …).
 */
export function Board({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-[2px] border px-2.5 py-1.5 font-mono text-[0.6875rem] tracking-[0.12em] ${className}`} style={{ background: "#0b0d0f", borderColor: "#3b3f3c", color: C.amber }}>
      {children}
    </div>
  );
}

/** A station on the line: a dot, filled once passed, ringed while it's the current one. */
export function StationDot({ state = "open", size = 12 }: { state?: "done" | "now" | "open" | "moved"; size?: number }) {
  const fill = state === "done" ? C.lamp : state === "now" ? C.paper : "transparent";
  const border = state === "open" ? C.haze : state === "moved" ? C.signal : C.lamp;
  return (
    <span
      className="inline-block shrink-0 rounded-full border-2"
      style={{ width: size, height: size, background: fill, borderColor: border, boxShadow: state === "now" ? `0 0 0 3px ${C.lamp}33` : undefined }}
      aria-hidden
    />
  );
}
