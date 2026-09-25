"use client";

import { useState } from "react";
import { ambience, useAmbienceState } from "@/audio/useAmbience";
import { CARRIAGE_AMBIENCE } from "@/core/journey";
import type { CarriageId } from "@/core/types";
import { useI18n, type MessageKey } from "@/i18n";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Sheet } from "@/components/ui/Sheet";

const CHANNELS = [
  { key: "train", labelKey: "journey.trainAmbience", hintKey: "journey.trainAmbienceHint" },
  { key: "environment", labelKey: "journey.environment", hintKey: "journey.environmentHint" },
  { key: "focus", labelKey: "journey.focusNoise", hintKey: "journey.focusNoiseHint" },
] as const;

/** Sound on/off and the three-channel ambient mixer. */
export function SoundControl({ carriage }: { carriage: CarriageId }) {
  const { t } = useI18n();
  const { enabled, mix } = useAmbienceState();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`rounded-full p-2 transition-colors ${enabled ? "text-paper-dim hover:text-paper" : "text-haze hover:text-mist"}`}
        aria-label={enabled ? t("journey.soundSettings") : t("journey.soundIsOff")}
      >
        <Icon name="sound" size={18} />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={t("journey.ambience")} eyebrow={t("journey.sound")}>
        <div className="space-y-6">
          <Button
            variant={enabled ? "secondary" : "primary"}
            className="w-full"
            onClick={() => (enabled ? ambience.disable() : void ambience.enable(CARRIAGE_AMBIENCE[carriage]))}
          >
            {enabled ? t("journey.turnSoundOff") : t("journey.turnSoundOn")}
          </Button>
          {[{ key: "master", labelKey: "journey.volume", hintKey: "" } as const, ...CHANNELS].map((c) => (
            <label key={c.key} className="block">
              <span className="flex items-baseline justify-between">
                <span className="text-sm text-paper">{t(c.labelKey as MessageKey)}</span>
                <span className="font-mono text-xs text-mist tabular">{Math.round(mix[c.key] * 100)}</span>
              </span>
              {c.hintKey && <span className="block text-xs text-haze">{t(c.hintKey as MessageKey)}</span>}
              <input
                type="range"
                className="rail"
                min={0}
                max={1}
                step={0.05}
                value={mix[c.key]}
                onChange={(e) => ambience.setMix({ ...mix, [c.key]: Number(e.target.value) })}
              />
            </label>
          ))}
        </div>
      </Sheet>
    </>
  );
}
