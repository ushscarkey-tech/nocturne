"use client";

import { useEffect } from "react";
import { nativeBridge, nativeSnapshot } from "@/lib/native";
import { useNow } from "@/lib/hooks";
import { useStore } from "@/state/store";

/** Inside the Mac app, keep its menu bar, floating window and widgets in step with tonight. */
export function NativeBridge() {
  const data = useStore((s) => s.data);
  const now = useNow(15_000);
  const minute = Math.floor(now.getTime() / 15_000);
  useEffect(() => {
    const bridge = nativeBridge();
    if (!bridge || !data) return;
    try {
      bridge.postMessage({ type: "snapshot", snapshot: nativeSnapshot(data, new Date()) });
    } catch {
      // The page keeps working whatever the host does.
    }
  }, [data, minute]);
  return null;
}
