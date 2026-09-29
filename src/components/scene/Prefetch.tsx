"use client";

import { useEffect } from "react";

let started = false;

/**
 * While you're on the everyday pages, fetch the 3D scenes' code in the
 * background (once, when the browser is idle), so boarding doesn't wait on
 * a download. Skipped on a saving-data connection.
 */
export function ScenePrefetch() {
  useEffect(() => {
    if (started) return;
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (conn?.saveData) return;
    started = true;
    const idle = window.requestIdleCallback ?? ((fn: () => void) => window.setTimeout(fn, 2500));
    idle(
      () => {
        void import("./PlatformScene3D");
        void import("./CabinScene3D");
      },
      { timeout: 6000 },
    );
  }, []);
  return null;
}
