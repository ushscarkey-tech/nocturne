"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { journeyFor } from "@/core/journey";
import { activeSession, remainingSeconds } from "@/core/sessions";
import { serviceDate } from "@/core/time";
import { checkNotifications } from "@/lib/notify";
import { arrive, depart, ensureToday } from "@/state/actions";
import { bootstrap } from "@/state/session";
import { useStore } from "@/state/store";
import { Button } from "@/components/ui/Button";

/** Loads the traveller's data (or sends them to sign in) before rendering. */
export function DataGate({ children }: { children: ReactNode }) {
  const status = useStore((s) => s.status);
  const error = useStore((s) => s.error);
  const router = useRouter();

  useEffect(() => {
    if (status !== "idle") return;
    bootstrap().then((r) => {
      if (r === "login") router.replace("/login");
    });
  }, [status, router]);

  if (status === "error") {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-8 text-center">
        <p className="eyebrow">Signal lost</p>
        <p className="max-w-sm text-mist">{error}</p>
        <Button variant="secondary" onClick={() => useStore.getState().reset()}>
          Try again
        </Button>
      </div>
    );
  }

  if (status !== "ready") {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-5" role="status" aria-live="polite">
        <span className="h-1.5 w-1.5 animate-breathe rounded-full bg-lamp" aria-hidden />
        <p className="eyebrow">Preparing your route</p>
      </div>
    );
  }

  return (
    <>
      <JourneyDaemon />
      {children}
    </>
  );
}

/**
 * Keeps the night moving wherever the traveller is in the app: stations
 * arrive when their time is up, short stops depart on schedule, and the day
 * rolls over at midnight.
 */
function JourneyDaemon() {
  const lastDay = useRef(serviceDate(new Date()));

  useEffect(() => {
    const tick = () => {
      const data = useStore.getState().data;
      if (!data) return;
      const now = new Date();
      const today = serviceDate(now);
      if (today !== lastDay.current) {
        lastDay.current = today;
        ensureToday();
        return;
      }
      const active = activeSession(data.sessions);
      if (active?.resumedAt && remainingSeconds(active, now) <= 0) {
        arrive();
        return;
      }
      const journey = journeyFor(data, today);
      if (journey?.phase === "stop" && journey.stopEndsAt) {
        const over = now.getTime() - new Date(journey.stopEndsAt).getTime();
        // Depart on time, but never whisk someone away who has been gone a while.
        if (over >= 0 && over < 90_000) depart();
      }
      if (now.getSeconds() === 0) checkNotifications(data, now);
    };
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return null;
}
