"use client";

import Link from "next/link";
import { useState } from "react";
import {
  availabilityForDate,
  totalMinutes,
  windowProblem,
} from "@/core/availability";
import { addDays, serviceDate } from "@/core/time";
import type { StudyWindow, WindowKind } from "@/core/types";
import { Button } from "@/components/ui/Button";
import { Field, Toggle } from "@/components/ui/controls";
import { Icon } from "@/components/ui/Icon";
import { Sheet } from "@/components/ui/Sheet";
import { deleteWindow, saveWindow, saveWindows } from "@/state/actions";
import { useData } from "@/state/store";
import { useI18n } from "@/i18n";

const WEEK = [1, 2, 3, 4, 5, 6, 0];

type Editor =
  | { mode: "weekly"; window?: StudyWindow; days: number[] }
  | { mode: "exception"; window?: StudyWindow; kind: WindowKind };

export default function ServicePage() {
  const data = useData();
  const { t, fmt } = useI18n();
  const [editor, setEditor] = useState<Editor | null>(null);
  const today = serviceDate(new Date());
  const weekly = data.windows.filter((w) => w.recurring);
  const exceptions = data.windows
    .filter((w) => !w.recurring && w.specificDate && w.specificDate >= today)
    .sort((a, b) =>
      `${a.specificDate}${a.startTime}`.localeCompare(
        `${b.specificDate}${b.startTime}`,
      ),
    );
  const weekMinutes = Array.from({ length: 7 }, (_, i) =>
    totalMinutes(availabilityForDate(data.windows, addDays(today, i))),
  ).reduce((a, b) => a + b, 0);

  return (
    <div className="animate-fade">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-mist hover:text-paper"
      >
        <Icon name="back" size={16} /> {t("shell.tonight")}
      </Link>
      <header className="mt-8">
        <p className="eyebrow">{t("service.whenYouCanStudy")}</p>
        <h1 className="mt-2 font-display text-5xl leading-none">
          {t("service.title")}
        </h1>
        <p className="mt-4 max-w-md text-sm leading-relaxed text-mist">
          {t("service.weekSummary")}{" "}
          {t("service.nextSevenDays", { min: fmt.duration(weekMinutes) })}
        </p>
      </header>

      {/* Wide screens: the week at left, one-off changes at right. */}
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:items-start lg:gap-x-16 xl:grid-cols-[minmax(0,1fr)_minmax(0,27rem)] xl:gap-x-24">
        <section className="mt-12" aria-labelledby="weekly-title">
          <div className="flex items-baseline justify-between">
            <h2 id="weekly-title" className="eyebrow">
              {t("service.everyWeek")}
            </h2>
            <button
              type="button"
              onClick={() =>
                setEditor({ mode: "weekly", days: [1, 2, 3, 4, 5] })
              }
              className="inline-flex min-h-11 items-center gap-1 text-sm text-mist hover:text-paper"
            >
              <Icon name="plus" size={14} /> {t("service.addWindow")}
            </button>
          </div>
          <ul className="mt-3 divide-y divide-rule-soft">
            {WEEK.map((day) => {
              const list = weekly
                .filter((w) => w.dayOfWeek === day)
                .sort((a, b) => a.startTime.localeCompare(b.startTime));
              return (
                <li key={day} className="flex items-center gap-4 py-3.5">
                  <span className="w-12 shrink-0 font-mono text-xs uppercase tracking-widest text-mist">
                    {fmt.weekdayOf(day)}
                  </span>
                  <div className="flex flex-1 flex-wrap gap-2">
                    {list.length === 0 && (
                      <span className="text-sm text-haze">
                        {t("service.noService")}
                      </span>
                    )}
                    {list.map((w) => (
                      <button
                        key={w.id}
                        type="button"
                        onClick={() =>
                          setEditor({ mode: "weekly", window: w, days: [day] })
                        }
                        className={`min-h-9 rounded-full border px-3 py-1.5 font-mono text-xs tabular transition-colors ${
                          w.enabled
                            ? "border-rule text-paper hover:border-mist/50"
                            : "border-rule-soft text-haze line-through"
                        }`}
                        aria-label={t("service.windowLabel", {
                          day: fmt.weekdayOf(day),
                          start: w.startTime,
                          end: w.endTime,
                          paused: w.enabled ? "" : t("service.paused"),
                        })}
                      >
                        {w.startTime}–{w.endTime}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditor({ mode: "weekly", days: [day] })}
                    className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-haze hover:text-paper"
                    aria-label={t("service.addWindowOnDay", {
                      day: fmt.weekdayOf(day),
                    })}
                  >
                    <Icon name="plus" size={14} />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section
          className="mt-12 lg:rounded-2xl lg:border lg:border-rule-soft lg:bg-night-850/40 lg:p-6"
          aria-labelledby="exceptions-title"
        >
          <h2 id="exceptions-title" className="eyebrow">
            {t("service.oneOffChanges")}
          </h2>
          <p className="mt-1 text-xs text-haze">
            {t("service.oneOffDescription")}
          </p>
          <ul className="mt-3 divide-y divide-rule-soft">
            {exceptions.map((w) => (
              <li key={w.id}>
                <button
                  type="button"
                  onClick={() =>
                    setEditor({ mode: "exception", window: w, kind: w.kind })
                  }
                  className="flex w-full items-center justify-between gap-4 py-3.5 text-left"
                >
                  <span className="text-sm text-paper-dim">
                    {fmt.longDate(w.specificDate!)}
                  </span>
                  <span
                    className={`font-mono text-xs tabular ${w.kind === "blocked" ? "text-signal" : "text-lamp"}`}
                  >
                    {w.kind === "blocked"
                      ? t("service.noService")
                      : t("service.extra")}{" "}
                    · {w.startTime}–{w.endTime}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                setEditor({ mode: "exception", kind: "available" })
              }
            >
              {t("service.extraTime")}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setEditor({ mode: "exception", kind: "blocked" })}
            >
              {t("service.blockTime")}
            </Button>
          </div>
        </section>
      </div>

      {editor && (
        <WindowEditor editor={editor} onClose={() => setEditor(null)} />
      )}
    </div>
  );
}

function WindowEditor({
  editor,
  onClose,
}: {
  editor: Editor;
  onClose: () => void;
}) {
  const { t, fmt } = useI18n();
  const today = serviceDate(new Date());
  const w = editor.window;
  const [days, setDays] = useState<number[]>(
    editor.mode === "weekly" ? editor.days : [],
  );
  const [date, setDate] = useState(w?.specificDate ?? today);
  const [start, setStart] = useState(
    w?.startTime ??
      (editor.mode === "exception" && editor.kind === "blocked"
        ? "19:40"
        : "19:00"),
  );
  const [end, setEnd] = useState(w?.endTime ?? "22:00");
  const [enabled, setEnabled] = useState(w?.enabled ?? true);
  const [error, setError] = useState<string | null>(null);
  const isWeekly = editor.mode === "weekly";
  const kind: WindowKind =
    editor.mode === "exception" ? editor.kind : "available";

  function save() {
    const problem = windowProblem({ startTime: start, endTime: end });
    if (problem) {
      setError(problem);
      return;
    }
    if (isWeekly) {
      if (days.length === 0) {
        setError(t("service.chooseAtLeastOneDay"));
        return;
      }
      if (w)
        saveWindow({
          ...w,
          dayOfWeek: days[0],
          startTime: start,
          endTime: end,
          enabled,
        });
      else
        saveWindows(
          days.map((day) => ({
            dayOfWeek: day,
            specificDate: null,
            startTime: start,
            endTime: end,
            recurring: true,
            enabled: true,
            kind: "available" as const,
          })),
        );
    } else {
      saveWindow({
        id: w?.id,
        dayOfWeek: null,
        specificDate: date,
        startTime: start,
        endTime: end,
        recurring: false,
        enabled,
        kind,
      });
    }
    onClose();
  }

  const title = isWeekly
    ? w
      ? t("service.editService")
      : t("service.addService")
    : kind === "blocked"
      ? t("service.blockTime")
      : t("service.extraTime");

  return (
    <Sheet open onClose={onClose} title={title} eyebrow="Service Time">
      <div className="space-y-7">
        {isWeekly ? (
          <div>
            <p className="eyebrow">
              {w ? t("service.day") : t("service.days")}
            </p>
            <div
              className="mt-3 flex gap-1.5"
              role="group"
              aria-label={t("service.daysLabel")}
            >
              {WEEK.map((d) => {
                const on = days.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      setDays(
                        w
                          ? [d]
                          : on
                            ? days.filter((x) => x !== d)
                            : [...days, d],
                      )
                    }
                    className={`h-10 flex-1 rounded-lg font-mono text-xs transition-colors ${on ? "bg-lamp/15 text-lamp" : "text-haze hover:text-mist"}`}
                  >
                    {fmt.weekdayOf(d).slice(0, 2)}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <Field label="Date">
            <input
              type="date"
              className="field font-mono"
              value={date}
              min={today}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
        )}
        <div className="grid grid-cols-2 gap-6">
          <Field label="From">
            <input
              type="time"
              className="field font-mono text-lg"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              step={300}
            />
          </Field>
          <Field label="Until">
            <input
              type="time"
              className="field font-mono text-lg"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              step={300}
            />
          </Field>
        </div>
        <p className="-mt-3 text-xs leading-relaxed text-haze">
          {t("service.lateNightsNote", {
            type: isWeekly ? "that day" : "that date",
          })}
        </p>
        {w && isWeekly && (
          <Toggle
            checked={enabled}
            onChange={setEnabled}
            label={t("service.running")}
            description={t("service.pauseDescription")}
          />
        )}
        {error && (
          <p role="alert" className="text-sm text-signal">
            {error}
          </p>
        )}
        <div className="flex items-center justify-between gap-3 pt-2">
          {w ? (
            <Button
              variant="ghost"
              onClick={() => {
                deleteWindow(w.id);
                onClose();
              }}
            >
              {t("common.delete")}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-3">
            <Button variant="ghost" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button variant="primary" onClick={save}>
              {t("common.save")}
            </Button>
          </div>
        </div>
      </div>
    </Sheet>
  );
}
