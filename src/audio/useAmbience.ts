"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { DEFAULT_MIX, getAmbience, type MixLevels, type PresetId } from "./engine";

const MIX_KEY = "nocturne:mix";
const WANTED_KEY = "nocturne:sound";

function setWanted(on: boolean) {
  try {
    window.localStorage.setItem(WANTED_KEY, on ? "on" : "off");
  } catch {
    /* ignore */
  }
}

/** Whether the traveller left sound on last time (browsers need a tap to resume it). */
export function soundWanted(): boolean {
  try {
    return window.localStorage.getItem(WANTED_KEY) === "on";
  } catch {
    return false;
  }
}

type Listener = () => void;
const listeners = new Set<Listener>();
let enabled = false;
let mix: MixLevels = DEFAULT_MIX;
let mixLoaded = false;

function emit() {
  listeners.forEach((l) => l());
}

/** The traveller's stored mix, merged over defaults (older mixes lack `effects`). */
export function loadMix(): MixLevels {
  if (mixLoaded) return mix;
  mixLoaded = true;
  try {
    const raw = window.localStorage.getItem(MIX_KEY);
    if (raw) {
      const stored = JSON.parse(raw) as Partial<Record<keyof MixLevels, unknown>> | null;
      const next = { ...DEFAULT_MIX };
      for (const key of Object.keys(DEFAULT_MIX) as (keyof MixLevels)[]) {
        const v = stored?.[key];
        if (typeof v === "number" && Number.isFinite(v)) next[key] = v;
      }
      mix = next;
    }
  } catch {
    /* ignore */
  }
  getAmbience().setMix(mix);
  return mix;
}

export const ambience = {
  /** Call from a user gesture (e.g. Board) so the browser allows audio. */
  async enable(preset: PresetId) {
    loadMix();
    enabled = await getAmbience().start(preset);
    if (enabled) setWanted(true);
    emit();
    return enabled;
  },
  disable(remember = true) {
    getAmbience().stop();
    if (remember) setWanted(false);
    enabled = false;
    emit();
  },
  setPreset(preset: PresetId, fadeSeconds?: number) {
    getAmbience().setPreset(preset, fadeSeconds);
  },
  /** How far the cabin curtain is drawn (0 open … 1 closed). */
  setCurtain(amount: number) {
    getAmbience().setCurtain(amount);
  },
  /** Lower the ambience to `amount` × its level for `seconds`, then restore it. */
  duck(amount: number, seconds: number) {
    getAmbience().duck(amount, seconds);
  },
  setMix(next: MixLevels) {
    mix = next;
    getAmbience().setMix(next);
    try {
      window.localStorage.setItem(MIX_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    emit();
  },
};

function subscribe(l: Listener) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useAmbienceState(): { enabled: boolean; mix: MixLevels } {
  const on = useSyncExternalStore(subscribe, () => enabled, () => false);
  const levels = useSyncExternalStore(
    subscribe,
    () => (typeof window === "undefined" ? DEFAULT_MIX : loadMix()),
    () => DEFAULT_MIX,
  );
  return { enabled: on, mix: levels };
}

/**
 * Follow a scene's preset while sound is enabled. Changes crossfade; the
 * engine is only started by an explicit gesture.
 */
export function useScenePreset(preset: PresetId, fadeSeconds = 5) {
  const { enabled: on } = useAmbienceState();
  useEffect(() => {
    if (on) ambience.setPreset(preset, fadeSeconds);
  }, [on, preset, fadeSeconds]);
}

export function useSoundToggle(preset: PresetId) {
  const { enabled: on } = useAmbienceState();
  const [pending, setPending] = useState(false);
  const toggle = useCallback(async () => {
    if (on) {
      ambience.disable();
      return;
    }
    setPending(true);
    await ambience.enable(preset);
    setPending(false);
  }, [on, preset]);
  return { enabled: on, pending, toggle };
}
