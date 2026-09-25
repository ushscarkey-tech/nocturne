/**
 * Messages produced by the core (route changes, calibration notes). The core
 * only emits keys + params; the UI renders them in the traveller's language.
 * English templates live here so the core stays readable and testable.
 *
 * Param conventions: `task` = a task title, `at` = a clock time, `min` =
 * a duration in minutes (formatted by the renderer), `pct` = a percentage.
 */
import { formatDuration } from "./time";
import type { Message } from "./types";

export const EN_TEMPLATES = {
  "change.headline": "Route updated",
  "change.lowFocus": "Something lighter first. {task} is next.",
  "change.signalSharp": "{task} moves up while you're sharp.",
  "change.signalLow": "Shorter stops for now. {task} is next.",
  "change.rebalanced": "Stations rearranged.",
  "change.lateStart": "Departing at {at}.",
  "change.finishEarly": "Done early. Everything after moves up.",
  "change.moreTime": "Later stations shift back.",
  "change.skip": "Skipped for tonight.",
  "change.next": "{task} is next.",
  "change.history": "You tend to do hard work best around {at}, so {task} goes earlier.",
  "change.returned": "The other {min} of {task} moves to {at}.",
  "change.returnedLater": "The other {min} of {task} waits for another day.",
  "change.rests": "{task} rests tonight.",
  "change.deferred": "{task} ({min}) moves to another day.",
  "change.joins": "{task} ({min}) joins at {at}.",
  "arrival.stays": "Arrival still {at}.",
  "arrival.ahead": "Arriving {at}, ahead of plan.",
  "arrival.later": "Arriving {at}.",
  "arrival.none": "No more stations tonight.",
} as const;

export type CoreMessageKey = keyof typeof EN_TEMPLATES;

export function msg(key: CoreMessageKey, params?: Message["params"]): Message {
  return params ? { key, params } : { key };
}

/** Fill `{name}` placeholders; `min` params are formatted as durations. */
export function fill(template: string, params: Message["params"] = {}, formatMinutes = formatDuration): string {
  return template.replace(/\{(\w+)\}/g, (_, name: string) => {
    const v = params[name];
    if (v === undefined) return "";
    return name === "min" && typeof v === "number" ? formatMinutes(v) : String(v);
  });
}

export function renderEnglish(m: Message): string {
  const template = (EN_TEMPLATES as Record<string, string>)[m.key] ?? m.key;
  return fill(template, m.params);
}
