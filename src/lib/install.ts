"use client";

import { useSyncExternalStore } from "react";

/** Chrome and Edge's install prompt, held until the traveller asks for it. */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export type InstallState = "installed" | "prompt" | "ios" | "mac-safari" | "manual";

let deferred: InstallPromptEvent | null = null;
let installedNow = false;
let watching = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Listen from the first render on, so the browser's one-time event isn't missed. */
export function watchInstall() {
  if (typeof window === "undefined" || watching) return;
  watching = true;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    installedNow = true;
    emit();
  });
}

function state(): InstallState {
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (standalone || installedNow) return "installed";
  if (deferred) return "prompt";
  const ua = navigator.userAgent;
  const touchMac = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  if (/iPhone|iPad|iPod/.test(ua) || touchMac) return "ios";
  if (/Macintosh/.test(ua) && /Safari/.test(ua) && !/Chrome|Chromium|Edg|Firefox|OPR/.test(ua)) return "mac-safari";
  return "manual";
}

export function useInstallState(): InstallState | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    state,
    () => null,
  );
}

/** Show the browser's install dialog; true when the traveller accepted. */
export async function install(): Promise<boolean> {
  if (!deferred) return false;
  const e = deferred;
  deferred = null;
  await e.prompt();
  const { outcome } = await e.userChoice;
  emit();
  return outcome === "accepted";
}
