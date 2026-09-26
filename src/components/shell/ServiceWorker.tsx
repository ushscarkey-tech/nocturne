"use client";

import { useEffect } from "react";
import { watchInstall } from "@/lib/install";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** Registers the service worker (production only) and starts listening for the install prompt. */
export function ServiceWorker() {
  useEffect(() => {
    watchInstall();
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register(`${BASE}/sw.js`, { scope: `${BASE}/` }).catch(() => {});
  }, []);
  return null;
}
