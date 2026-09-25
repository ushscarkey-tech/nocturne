"use client";

import { useState } from "react";

function bump(prev: { text: string; v: number[] }, text: string) {
  const old = [...prev.text];
  return { text, v: [...text].map((c, i) => (old[i] === c ? (prev.v[i] ?? 0) : (prev.v[i] ?? 0) + 1)) };
}

/**
 * Timetable-style text: when a character changes it turns over like a
 * split-flap board. Unchanged characters stay still; reduced motion is
 * handled by the global `prefers-reduced-motion` rule on `.motion-safe-only`.
 */
export function FlipText({ text, className = "", stagger = 40 }: { text: string; className?: string; stagger?: number }) {
  // Each character keeps a version counter, so only changed ones re-mount (and flip).
  const [state, setState] = useState(() => ({ text, v: [...text].map(() => 0) }));
  let current = state;
  if (state.text !== text) {
    current = bump(state, text);
    setState(current);
  }
  return (
    <span className={`inline-block whitespace-nowrap [perspective:400px] ${className}`} aria-label={text} role="text">
      {[...text].map((c, i) => (
        <span
          key={`${i}:${current.v[i]}`}
          aria-hidden
          className={`motion-safe-only inline-block origin-[50%_55%] whitespace-pre ${current.v[i] ? "animate-flip" : ""}`}
          style={current.v[i] ? { animationDelay: `${i * stagger}ms` } : undefined}
        >
          {c}
        </span>
      ))}
    </span>
  );
}
