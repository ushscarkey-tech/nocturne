"use client";

import { useMemo } from "react";
import { worstConflict, type Forecast } from "@/core/allocate";
import { forecast } from "@/core/planner";
import { toDateKey } from "@/core/time";
import type { NocturneData } from "@/core/types";

/**
 * Multi-day forecast consistent with tonight's saved route. Recomputed when
 * the data changes or the day rolls over (the minute is enough precision).
 */
export function useForecast(data: NocturneData, now: Date): Forecast {
  const minute = Math.floor(now.getTime() / 60_000);
  return useMemo(
    () => forecast({ tasks: data.tasks, windows: data.windows, sessions: data.sessions, userId: data.profile.id }, new Date(minute * 60_000)),
    [data.tasks, data.windows, data.sessions, data.profile.id, minute],
  );
}

export function useConflict(data: NocturneData, now: Date) {
  const f = useForecast(data, now);
  return { forecast: f, conflict: worstConflict(f), today: toDateKey(now) };
}
