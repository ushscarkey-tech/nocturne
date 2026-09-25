"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { create } from "zustand";
import { useI18n, type MessageKey } from "@/i18n";
import { Sheet } from "@/components/ui/Sheet";

export type Term = "station" | "route" | "transfer" | "service" | "stop" | "tunnel" | "signal" | "carriage" | "line" | "final";
const TERMS: Term[] = ["station", "route", "transfer", "service", "stop", "tunnel", "signal", "carriage", "line", "final"];

export const useGlossary = create<{ open: boolean; term: Term | null; show: (term?: Term) => void; hide: () => void }>((set) => ({
  open: false,
  term: null,
  show: (term) => set({ open: true, term: term ?? null }),
  hide: () => set({ open: false }),
}));

/** The few words the night uses, in one quiet sheet. */
export function GlossarySheet() {
  const { t } = useI18n();
  const { open, term, hide } = useGlossary();
  const focused = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !term) return;
    const timer = setTimeout(() => focused.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 450);
    return () => clearTimeout(timer);
  }, [open, term]);

  return (
    <Sheet open={open} onClose={hide} title={t("scene.glossary")} eyebrow={t("scene.glossaryEyebrow")}>
      <p className="text-sm leading-relaxed text-mist">{t("scene.glossaryIntro")}</p>
      <dl className="mt-6 space-y-5">
        {TERMS.map((id) => (
          <div
            key={id}
            ref={id === term ? focused : undefined}
            className={`border-l pl-4 transition-colors duration-700 ${id === term ? "border-lamp" : "border-rule"}`}
          >
            <dt className={`text-[0.95rem] ${id === term ? "text-paper" : "text-paper-dim"}`}>{t(`scene.term.${id}` as MessageKey)}</dt>
            <dd className="mt-1 text-sm leading-relaxed text-mist">{t(`scene.term.${id}Desc` as MessageKey)}</dd>
          </div>
        ))}
      </dl>
    </Sheet>
  );
}

/** A station's name that explains itself when tapped. */
export function StationName({ name, className = "" }: { name: string; className?: string }) {
  return (
    <button
      type="button"
      onClick={() => useGlossary.getState().show("station")}
      className={`underline decoration-dotted decoration-1 underline-offset-[5px] transition-colors hover:text-mist ${className}`}
    >
      {name}
    </button>
  );
}

const HINT_KEY = "nocturne:hint:stations";
const hintListeners = new Set<() => void>();
function hintSeen(): boolean {
  try {
    return window.localStorage.getItem(HINT_KEY) === "1";
  } catch {
    return true;
  }
}

/** Whether the one-time "what is a station" note still needs showing. */
export function useStationHint(): [boolean, () => void] {
  const seen = useSyncExternalStore(
    (cb) => {
      hintListeners.add(cb);
      return () => hintListeners.delete(cb);
    },
    hintSeen,
    () => true,
  );
  const dismiss = () => {
    try {
      window.localStorage.setItem(HINT_KEY, "1");
    } catch {
      /* storage unavailable */
    }
    hintListeners.forEach((l) => l());
  };
  return [!seen, dismiss];
}
