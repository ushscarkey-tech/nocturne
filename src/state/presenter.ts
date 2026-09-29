"use client";

/**
 * Presenter demo mode: a sample night kept apart from the traveller's own
 * data (its own local namespace, never synced), shaped so it works at any
 * hour of a presentation, and a few levers to show what happens when a
 * night doesn't go to plan. Leaving it puts everything back as it was.
 */
import { newId } from "@/core/ids";
import { activeSession } from "@/core/sessions";
import { createSeedData } from "@/core/seed";
import { serviceDate } from "@/core/time";
import type { Locale, NocturneData, StudyWindow } from "@/core/types";
import { setForcedHour } from "@/components/scene/ride/hour";
import { LocalRepository } from "@/data/local";
import { useStore } from "./store";

const KEY = "nocturne:presenting";
export const PRESENT_NAMESPACE = "present";
/** Fired on window when demo mode starts or ends (the storage event only reaches other tabs). */
export const PRESENTING_EVENT = "nocturne:presenting";

export function presenting(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

/** Into demo mode with a fresh sample night. The traveller's own data is left untouched. */
export function startPresentation() {
  try {
    window.localStorage.setItem(KEY, "1");
    // The first-run tour would cover the screen mid-presentation.
    window.localStorage.setItem("nocturne:coach:tonight", "1");
  } catch {
    /* storage unavailable */
  }
  new LocalRepository(PRESENT_NAMESPACE).clear();
  useStore.getState().reset();
  window.dispatchEvent(new Event(PRESENTING_EVENT));
}

/** Back to the start of the sample night (after a run-through). */
export function restartPresentation() {
  new LocalRepository(PRESENT_NAMESPACE).clear();
  setForcedHour(null);
  useStore.getState().reset();
}

/** Out of demo mode: the traveller's own data comes back. */
export function endPresentation() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
  new LocalRepository(PRESENT_NAMESPACE).clear();
  setForcedHour(null);
  useStore.getState().reset();
  window.dispatchEvent(new Event(PRESENTING_EVENT));
}

const hm = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

/**
 * The sample night: the usual sample tasks and history, plus Service Time
 * open from a few minutes ago for four and a half hours, so the line runs
 * whatever the clock says when the presentation starts.
 */
export function presentationData(now: Date, locale: Locale): NocturneData {
  const data = createSeedData(now, { locale }, locale);
  const start = new Date(now.getTime() - 5 * 60_000);
  start.setMinutes(Math.floor(start.getMinutes() / 5) * 5, 0, 0);
  const end = new Date(start.getTime() + 270 * 60_000);
  const window: StudyWindow = {
    id: newId(),
    userId: data.profile.id,
    dayOfWeek: null,
    specificDate: serviceDate(now),
    startTime: hm(start),
    // Past midnight reads as the small hours of the same service night.
    endTime: end.getDate() !== start.getDate() && end.getHours() >= 4 ? "03:59" : hm(end),
    recurring: false,
    enabled: true,
    kind: "available",
  };
  // Tonight's stations are laid out afresh from now (ensureDay builds them), inside the demo's Service Time.
  const today = serviceDate(now);
  const sessions = data.sessions.filter((x) => !(x.date === today && x.status === "planned"));
  const journeys = data.journeys.filter((j) => j.date !== today);
  return { ...data, windows: [...data.windows, window], sessions, journeys };
}

/** Whether a station is being ridden now (some levers only make sense then). */
export function riding(): boolean {
  const d = useStore.getState().data;
  return !!d && !!activeSession(d.sessions);
}
