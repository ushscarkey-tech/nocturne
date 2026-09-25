"use client";

import { upcomingOn } from "@/core/sessions";
import { clock, diffDays, formatDuration, serviceDate } from "@/core/time";
import { journeyFor } from "@/core/journey";
import type { NocturneData } from "@/core/types";

const SENT_KEY = "nocturne:notified";

export function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function notificationsEnabled(): boolean {
  return notificationsSupported() && Notification.permission === "granted";
}

export async function requestNotifications(): Promise<boolean> {
  if (!notificationsSupported()) return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

function sentSet(): Set<string> {
  try {
    return new Set(JSON.parse(window.localStorage.getItem(SENT_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

function markSent(key: string) {
  try {
    const keys = [...sentSet(), key].slice(-60);
    window.localStorage.setItem(SENT_KEY, JSON.stringify(keys));
  } catch {
    /* ignore */
  }
}

function send(key: string, title: string, body: string) {
  if (sentSet().has(key)) return;
  markSent(key);
  try {
    new Notification(title, { body, tag: key, silent: true });
  } catch {
    /* some platforms only allow notifications from a service worker */
  }
}

/**
 * Restrained reminders while Nocturne is open: one departure notice before
 * the first station, and at most one deadline notice per day.
 */
export function checkNotifications(data: NocturneData, now: Date) {
  if (!notificationsEnabled()) return;
  const today = serviceDate(now);
  const journey = journeyFor(data, today);
  const waiting = !journey || journey.phase === "boarding" || journey.phase === "paused";
  const next = upcomingOn(data.sessions, today)[0];
  if (waiting && next) {
    const minutes = (new Date(next.plannedStart).getTime() - now.getTime()) / 60_000;
    if (minutes > 0 && minutes <= 5) {
      const platform = journey?.platform ?? "03";
      send(`depart:${next.id}`, "Your train departs in 5 min", `Platform ${platform} · ${clock(next.plannedStart)}`);
    }
  }

  const soon = data.tasks
    .filter((t) => t.status === "active" && t.deadline && !t.recurrence && t.remainingMinutes > 0)
    .map((t) => ({ t, days: diffDays(today, t.deadline!) }))
    .filter((x) => x.days >= 0 && x.days <= 2)
    .sort((a, b) => a.days - b.days || b.t.remainingMinutes - a.t.remainingMinutes)[0];
  if (soon && now.getHours() >= 16) {
    const label = soon.days === 0 ? "Due today" : soon.days === 1 ? "1 day remaining" : `${soon.days} days remaining`;
    send(`deadline:${today}`, label, `${soon.t.title} · ${formatDuration(soon.t.remainingMinutes)} left`);
  }
}
