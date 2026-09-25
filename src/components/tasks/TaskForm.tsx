"use client";

import { useRef, useState, type FormEvent } from "react";
import { useSettledFocus } from "@/lib/hooks";
import { addDays, dayOfWeek, serviceDate } from "@/core/time";
import type { Level, Line, Recurrence, Task } from "@/core/types";
import type { TaskDraft } from "@/state/actions";
import { Button } from "@/components/ui/Button";
import { Field, InterestSlider, LevelPicker, MinutesInput, Toggle } from "@/components/ui/controls";
import { useI18n } from "@/i18n";

export function draftFrom(task?: Task, defaults?: Partial<TaskDraft>): TaskDraft {
  return {
    title: task?.title ?? "",
    description: task?.description ?? "",
    deadline: task?.deadline ?? null,
    estimatedMinutes: task?.estimatedMinutes ?? 60,
    interest: task?.interest ?? 3,
    difficulty: task?.difficulty ?? 3,
    importance: task?.importance ?? 3,
    splittable: task?.splittable ?? true,
    minSessionMinutes: task?.minSessionMinutes ?? 25,
    maxSessionMinutes: task?.maxSessionMinutes ?? 60,
    recurrence: task?.recurrence ?? null,
    lineId: task?.lineId ?? null,
    ...defaults,
  };
}

function nextWeekday(today: string, weekday: number) {
  const diff = (weekday - dayOfWeek(today) + 7) % 7 || 7;
  return addDays(today, diff);
}

export function TaskForm({
  initial,
  lines,
  submitLabel,
  onSubmit,
  onCancel,
  focusField,
  feel = true,
}: {
  initial: TaskDraft;
  lines: Line[];
  submitLabel: string;
  onSubmit: (d: TaskDraft) => void;
  onCancel?: () => void;
  focusField?: "deadline" | "estimate" | null;
  /** Interest, difficulty and importance; new tasks ask for them in a second step. */
  feel?: boolean;
}) {
  const { t, fmt } = useI18n();
  const [d, setD] = useState<TaskDraft>(initial);
  const [showMore, setShowMore] = useState(
    initial.recurrence !== null || initial.lineId !== null || initial.description.length > 0,
  );
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const deadlineRef = useRef<HTMLInputElement>(null);
  useSettledFocus(titleRef, !focusField);
  useSettledFocus(deadlineRef, focusField === "deadline");
  const today = serviceDate(new Date());
  const set = <K extends keyof TaskDraft>(k: K, v: TaskDraft[K]) => setD((prev) => ({ ...prev, [k]: v }));

  const quickDates: { label: string; value: string | null }[] = [
    { label: t("common.today"), value: today },
    { label: t("common.tomorrow"), value: addDays(today, 1) },
    { label: fmt.weekdayOf(5), value: nextWeekday(today, 5) },
    { label: "In a week", value: addDays(today, 7) },
    { label: t("common.someday"), value: null },
  ];

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!d.title.trim()) {
      setError(t("tasks.nameTask"));
      return;
    }
    if (d.recurrence && d.estimatedMinutes <= 0) {
      setError(t("tasks.estimateDuration"));
      return;
    }
    if (d.minSessionMinutes > d.maxSessionMinutes) {
      setError(t("tasks.sessionLengthError"));
      return;
    }
    onSubmit({ ...d, title: d.title.trim() });
  }

  const recurrenceKind = d.recurrence?.freq ?? "none";
  const weeklyDays = d.recurrence?.freq === "weekly" ? d.recurrence.days : [];

  return (
    <form onSubmit={submit} className="space-y-7" noValidate>
      <Field label={t("tasks.taskField")}>
        <input
          className="field text-lg"
          value={d.title}
          onChange={(e) => set("title", e.target.value)}
          placeholder={t("tasks.taskPlaceholder")}
          ref={titleRef}
          aria-invalid={!!error && !d.title.trim()}
        />
      </Field>

      <div>
        <p className="eyebrow">{d.recurrence ? t("tasks.repeatUntil") : t("tasks.deadline")}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {quickDates.map((q) => {
            const active = d.deadline === q.value;
            return (
              <button
                key={q.label}
                type="button"
                onClick={() => set("deadline", q.value)}
                aria-pressed={active}
                className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors duration-500 ${
                  active ? "border-lamp/60 text-paper" : "border-rule text-mist hover:text-paper"
                }`}
              >
                {q.label}
              </button>
            );
          })}
        </div>
        <input
          type="date"
          className="field mt-2 font-mono text-sm"
          value={d.deadline ?? ""}
          min={today}
          onChange={(e) => set("deadline", e.target.value || null)}
          aria-label={t("tasks.deadline")}
          ref={deadlineRef}
        />
        {d.deadline && <p className="mt-1 text-xs text-haze">{t("tasks.lastDay", { date: fmt.shortDate(d.deadline) })}</p>}
      </div>

      <div>
        <p className="eyebrow">{d.recurrence ? t("tasks.eachTime") : t("tasks.estimatedTime")}</p>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
          <MinutesInput label={t("tasks.estimatedTime")} value={d.estimatedMinutes} onChange={(v) => set("estimatedMinutes", v)} step={15} />
          <div className="flex gap-1.5">
            {[30, 60, 120, 180].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => set("estimatedMinutes", m)}
                className={`rounded-full px-2.5 py-1 font-mono text-xs transition-colors ${
                  d.estimatedMinutes === m ? "text-lamp" : "text-haze hover:text-mist"
                }`}
              >
                {m < 60 ? `${m}m` : `${m / 60}h`}
              </button>
            ))}
          </div>
        </div>
        {d.estimatedMinutes === 0 && <p className="mt-1 text-xs text-haze">{t("tasks.withoutEstimate")}</p>}
      </div>

      {feel && <InterestSlider value={d.interest} onChange={(v) => set("interest", v)} />}

      <div className="border-t border-rule-soft pt-2">
        <button
          type="button"
          onClick={() => setShowMore((v) => !v)}
          aria-expanded={showMore}
          className="flex w-full items-center justify-between py-3 text-sm text-mist hover:text-paper"
        >
          {t("tasks.moreOptions")}
          <span className={`transition-transform duration-500 ${showMore ? "rotate-45" : ""}`} aria-hidden>
            +
          </span>
        </button>
        {showMore && (
          <div className="animate-rise space-y-7 pb-2 pt-3">
            {feel && (
              <>
                <LevelPicker label={t("tasks.difficulty")} value={d.difficulty} onChange={(v: Level) => set("difficulty", v)} low={t("tasks.light")} high={t("tasks.demanding")} />
                <LevelPicker label={t("tasks.importance")} value={d.importance} onChange={(v: Level) => set("importance", v)} low={t("tasks.niceToDo")} high={t("tasks.essential")} />
              </>
            )}

            <div>
              <Toggle
                checked={d.splittable}
                onChange={(v) => set("splittable", v)}
                label={t("tasks.splitIntoSessions")}
                description={t("tasks.splitDesc")}
              />
              {d.splittable && (
                <div className="mt-3 grid grid-cols-2 gap-6">
                  <div>
                    <p className="mb-2 text-xs text-mist">{t("tasks.shortestSession")}</p>
                    <MinutesInput label={t("tasks.shortestSession")} value={d.minSessionMinutes} onChange={(v) => set("minSessionMinutes", Math.max(10, v))} step={5} min={10} max={120} />
                  </div>
                  <div>
                    <p className="mb-2 text-xs text-mist">{t("tasks.longestSession")}</p>
                    <MinutesInput label={t("tasks.longestSession")} value={d.maxSessionMinutes} onChange={(v) => set("maxSessionMinutes", Math.max(15, v))} step={5} min={15} max={180} />
                  </div>
                </div>
              )}
            </div>

            <div>
              <p className="eyebrow">{t("tasks.repeat")}</p>
              <div className="mt-3 flex gap-2" role="radiogroup" aria-label={t("tasks.repeat")}>
                {(["none", "daily", "weekly"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={recurrenceKind === k}
                    onClick={() => {
                      const next: Recurrence | null =
                        k === "none" ? null : k === "daily" ? { freq: "daily" } : { freq: "weekly", days: weeklyDays.length ? weeklyDays : [dayOfWeek(today)] };
                      set("recurrence", next);
                    }}
                    className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
                      recurrenceKind === k ? "border-lamp/60 text-paper" : "border-rule text-mist hover:text-paper"
                    }`}
                  >
                    {k === "none" ? t("tasks.once") : k === "daily" ? t("tasks.daily") : t("tasks.weekly")}
                  </button>
                ))}
              </div>
              {d.recurrence?.freq === "weekly" && (
                <div className="mt-3 flex gap-1.5" role="group" aria-label={t("tasks.dayOfWeek")}>
                  {[0, 1, 2, 3, 4, 5, 6].map((i) => {
                    const on = weeklyDays.includes(i);
                    const label = fmt.weekdayOf(i);
                    return (
                      <button
                        key={i}
                        type="button"
                        aria-pressed={on}
                        onClick={() => {
                          const days = on ? weeklyDays.filter((x) => x !== i) : [...weeklyDays, i].sort();
                          set("recurrence", { freq: "weekly", days: days.length ? days : [i] });
                        }}
                        className={`h-9 flex-1 rounded-lg font-mono text-xs transition-colors ${
                          on ? "bg-lamp/15 text-lamp" : "text-haze hover:text-mist"
                        }`}
                      >
                        {label.slice(0, 2)}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {lines.length > 0 && (
              <Field label={t("tasks.lineField")}>
                <select className="field" value={d.lineId ?? ""} onChange={(e) => set("lineId", e.target.value || null)}>
                  <option value="">{t("common.none")}</option>
                  {lines.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.title}
                    </option>
                  ))}
                </select>
              </Field>
            )}

            <Field label={t("lines.notes")}>
              <textarea
                className="field min-h-20 resize-y"
                value={d.description}
                onChange={(e) => set("description", e.target.value)}
                placeholder="Chapters, page numbers, anything useful at the station."
              />
            </Field>
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm text-signal">
          {error}
        </p>
      )}

      <div className="flex items-center justify-end gap-3 pt-2">
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            {t("common.cancel")}
          </Button>
        )}
        <Button type="submit" variant="primary">
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
