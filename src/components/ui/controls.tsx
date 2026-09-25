"use client";

import { useId, type ReactNode } from "react";
import type { FocusLevel, Level } from "@/core/types";
import { useI18n, type MessageKey } from "@/i18n";

export const FOCUS_OPTIONS: { value: FocusLevel; label: MessageKey; hint: MessageKey }[] = [
  { value: "low", label: "common.low", hint: "common.focusLow.hint" },
  { value: "steady", label: "common.steady", hint: "common.focusSteady.hint" },
  { value: "sharp", label: "common.sharp", hint: "common.focusSharp.hint" },
];

/** Low / Steady / Sharp as an accessible radio group. */
export function FocusPicker({
  value,
  onChange,
  size = "md",
  label,
}: {
  value: FocusLevel | null;
  onChange: (v: FocusLevel) => void;
  size?: "md" | "lg";
  label: string;
}) {
  const { t } = useI18n();
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-3 gap-2">
      {FOCUS_OPTIONS.map((o) => {
        const checked = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={checked}
            onClick={() => onChange(o.value)}
            className={`group rounded-2xl border text-left transition-all duration-500 ease-[var(--ease-glide)] ${
              size === "lg" ? "px-4 py-5" : "px-3 py-3"
            } ${checked ? "border-lamp/60 bg-lamp/[0.06]" : "border-rule hover:border-mist/40"}`}
          >
            <span className="mb-2 flex items-end gap-[3px]" aria-hidden>
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className={`w-[3px] rounded-full transition-colors duration-500 ${
                    i <= FOCUS_OPTIONS.indexOf(o) ? (checked ? "bg-lamp" : "bg-mist/70") : "bg-rule"
                  }`}
                  style={{ height: 6 + i * 4 }}
                />
              ))}
            </span>
            <span className={`block ${size === "lg" ? "text-base" : "text-sm"} ${checked ? "text-paper" : "text-paper-dim"}`}>
              {t(o.label)}
            </span>
            {size === "lg" && <span className="mt-1 block text-xs text-mist">{t(o.hint)}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Emotional interest input: Avoiding ←→ Drawn to it. Stored as 1–5. */
export function InterestSlider({ value, onChange }: { value: Level; onChange: (v: Level) => void }) {
  const id = useId();
  const { t } = useI18n();
  const word = t(`common.interest.${value}` as MessageKey);
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm text-paper-dim">
        {t("common.interestQuestion")}
      </label>
      <input
        id={id}
        type="range"
        min={1}
        max={5}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value) as Level)}
        aria-valuetext={word}
        className="rail"
      />
      <div className="flex justify-between text-xs text-mist">
        <span className={value <= 2 ? "text-paper-dim" : ""}>{t("common.interestLow")}</span>
        <span className="font-mono text-[0.7rem] tracking-wider text-lamp/80">{word}</span>
        <span className={value >= 4 ? "text-paper-dim" : ""}>{t("common.interestHigh")}</span>
      </div>
    </div>
  );
}

/** 1–5 scale as five quiet marks (difficulty, importance). */
export function LevelPicker({
  label,
  value,
  onChange,
  low,
  high,
}: {
  label: string;
  value: Level;
  onChange: (v: Level) => void;
  low: string;
  high: string;
}) {
  const { t } = useI18n();
  return (
    <div>
      <p className="mb-2 text-sm text-paper-dim">{label}</p>
      <div role="radiogroup" aria-label={label} className="flex items-center gap-1.5">
        {([1, 2, 3, 4, 5] as Level[]).map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={t("common.levelOf", { label, n })}
            onClick={() => onChange(n)}
            className="flex h-9 flex-1 items-center justify-center rounded-lg transition-colors hover:bg-white/[0.03]"
          >
            <span
              className={`h-2 w-full max-w-10 rounded-full transition-colors duration-500 ${n <= value ? "bg-lamp/80" : "bg-rule"}`}
            />
          </button>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-xs text-mist">
        <span>{low}</span>
        <span>{high}</span>
      </div>
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="eyebrow block">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-haze">{hint}</span>}
    </label>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 py-3 text-left"
    >
      <span>
        <span className="block text-sm text-paper">{label}</span>
        {description && <span className="block text-xs text-mist">{description}</span>}
      </span>
      <span
        className={`relative h-6 w-10 shrink-0 rounded-full border transition-colors duration-500 ${
          checked ? "border-lamp/60 bg-lamp/20" : "border-rule bg-night-800"
        }`}
      >
        <span
          className={`absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full transition-all duration-500 ease-[var(--ease-glide)] ${
            checked ? "left-5 bg-lamp" : "left-1 bg-mist"
          }`}
        />
      </span>
    </button>
  );
}

/** Minutes stepper for durations. */
export function MinutesInput({
  value,
  onChange,
  step = 15,
  min = 0,
  max = 24 * 60,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  label: string;
}) {
  const { t, fmt } = useI18n();
  return (
    <div className="flex items-center gap-3" role="group" aria-label={label}>
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - step))}
        className="h-9 w-9 rounded-full border border-rule text-mist transition-colors hover:text-paper"
        aria-label={t("common.decrease", { label })}
      >
        −
      </button>
      <output className="min-w-20 text-center font-mono text-lg tabular" aria-live="polite">
        {fmt.duration(value)}
      </output>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + step))}
        className="h-9 w-9 rounded-full border border-rule text-mist transition-colors hover:text-paper"
        aria-label={t("common.increase", { label })}
      >
        +
      </button>
    </div>
  );
}
