"use client";

import { useState } from "react";
import { ambience, useAmbienceState } from "@/audio/useAmbience";
import { CARRIAGE_AMBIENCE } from "@/core/journey";
import type { CarriageId } from "@/core/types";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Sheet } from "@/components/ui/Sheet";

const CHANNELS = [
  { key: "train", label: "Train ambience", hint: "Rail, wheels, cabin" },
  { key: "environment", label: "Environment", hint: "Rain, wind, night" },
  { key: "focus", label: "Focus noise", hint: "Brown noise, tunnel hum" },
] as const;

/** Sound on/off and the three-channel ambient mixer. */
export function SoundControl({ carriage }: { carriage: CarriageId }) {
  const { enabled, mix } = useAmbienceState();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`rounded-full p-2 transition-colors ${enabled ? "text-paper-dim hover:text-paper" : "text-haze hover:text-mist"}`}
        aria-label={enabled ? "Sound settings" : "Sound is off. Open sound settings"}
      >
        <Icon name="sound" size={18} />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Ambience" eyebrow="Sound">
        <div className="space-y-6">
          <Button
            variant={enabled ? "secondary" : "primary"}
            className="w-full"
            onClick={() => (enabled ? ambience.disable() : void ambience.enable(CARRIAGE_AMBIENCE[carriage]))}
          >
            {enabled ? "Turn sound off" : "Turn sound on"}
          </Button>
          {[{ key: "master", label: "Volume", hint: "" } as const, ...CHANNELS].map((c) => (
            <label key={c.key} className="block">
              <span className="flex items-baseline justify-between">
                <span className="text-sm text-paper">{c.label}</span>
                <span className="font-mono text-xs text-mist tabular">{Math.round(mix[c.key] * 100)}</span>
              </span>
              {c.hint && <span className="block text-xs text-haze">{c.hint}</span>}
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
          <p className="text-xs leading-relaxed text-haze">Sound fades gently between the cabin, tunnels and platforms.</p>
        </div>
      </Sheet>
    </>
  );
}
