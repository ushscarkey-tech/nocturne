"use client";

import { useState, type FormEvent } from "react";
import { addDays, dayOfWeek, formatShortDate, toDateKey, WEEKDAY_SHORT } from "@/core/time";
import type { Level, Line, Recurrence, Task } from "@/core/types";
import type { TaskDraft } from "@/state/actions";
import { Button } from "@/components/ui/Button";
import { Field, InterestSlider, LevelPicker, MinutesInput, Toggle } from "@/components/ui/controls";

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
}: {
  initial: TaskDraft;
  lines: Line[];
  submitLabel: string;
  onSubmit: (d: TaskDraft) => void;
  onCancel?: () => void;
  focusField?: "deadline" | "estimate" | null;
}) {
  const [d, setD] = useState<TaskDraft>(initial);
  const [showMore, setShowMore] = useState(
    initial.recurrence !== null || initial.lineId !== null || initial.description.length > 0,
  );
  const [error, setError] = useState<string | null>(null);
  const today = toDateKey(new Date());
  const set = <K extends keyof TaskDraft>(k: K, v: TaskDraft[K]) => setD((prev) => ({ ...prev, [k]: v }));

  const quickDates: { label: string; value: string | null }[] = [
    { label: "Today", value: today },
    { label: "Tomorrow", value: addDays(today, 1) },
    { label: WEEKDAY_SHORT[5], value: nextWeekday(today, 5) },
    { label: "In a week", value: addDays(today, 7) },
    { label: "Someday", value: null },
  ];

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!d.title.trim()) {
      setError("Give the task a name.");
      return;
    }
    if (d.recurrence && d.estimatedMinutes <= 0) {
      setError("Recurring tasks need a duration for each occurrence.");
      return;
    }
    if (d.minSessionMinutes > d.maxSessionMinutes) {
      setError("The shortest session can't be longer than the longest.");
      return;
    }
    onSubmit({ ...d, title: d.title.trim() });
  }

  const recurrenceKind = d.recurrence?.freq ?? "none";
  const weeklyDays = d.recurrence?.freq === "weekly" ? d.recurrence.days : [];

  return (
    <form onSubmit={submit} className="space-y-7" noValidate>
      <Field label="Task">
        <input
          className="field text-lg"
          value={d.title}
          onChange={(e) => set("title", e.target.value)}
          placeholder="Physics workbook"
          autoFocus={!focusField}
          aria-invalid={!!error && !d.title.trim()}
        />
      </Field>

      <div>
        <p className="eyebrow">{d.recurrence ? "Repeat until" : "Deadline"}</p>
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
          aria-label="Deadline date"
          autoFocus={focusField === "deadline"}
        />
        {d.deadline && <p className="mt-1 text-xs text-haze">Last day to work on it: {formatShortDate(d.deadline)}</p>}
      </div>

      <div>
        <p className="eyebrow">{d.recurrence ? "Each time" : "Estimated time"}</p>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
          <MinutesInput label="estimated time" value={d.estimatedMinutes} onChange={(v) => set("estimatedMinutes", v)} step={15} />
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
        {d.estimatedMinutes === 0 && <p className="mt-1 text-xs text-haze">Without an estimate, the task waits in your Inbox.</p>}
      </div>

      <InterestSlider value={d.interest} onChange={(v) => set("interest", v)} />

      <div className="border-t border-rule-soft pt-2">
        <button
          type="button"
          onClick={() => setShowMore((v) => !v)}
          aria-expanded={showMore}
          className="flex w-full items-center justify-between py-3 text-sm text-mist hover:text-paper"
        >
          More options
          <span className={`transition-transform duration-500 ${showMore ? "rotate-45" : ""}`} aria-hidden>
            +
          </span>
        </button>
        {showMore && (
          <div className="animate-rise space-y-7 pb-2 pt-3">
            <LevelPicker label="Difficulty" value={d.difficulty} onChange={(v: Level) => set("difficulty", v)} low="Light" high="Demanding" />
            <LevelPicker label="Importance" value={d.importance} onChange={(v: Level) => set("importance", v)} low="Nice to do" high="Essential" />

            <div>
              <Toggle
                checked={d.splittable}
                onChange={(v) => set("splittable", v)}
                label="Split into sessions"
                description="Let Nocturne spread this over several stations and days."
              />
              {d.splittable && (
                <div className="mt-3 grid grid-cols-2 gap-6">
                  <div>
                    <p className="mb-2 text-xs text-mist">Shortest session</p>
                    <MinutesInput label="shortest session" value={d.minSessionMinutes} onChange={(v) => set("minSessionMinutes", Math.max(10, v))} step={5} min={10} max={120} />
                  </div>
                  <div>
                    <p className="mb-2 text-xs text-mist">Longest session</p>
                    <MinutesInput label="longest session" value={d.maxSessionMinutes} onChange={(v) => set("maxSessionMinutes", Math.max(15, v))} step={5} min={15} max={180} />
                  </div>
                </div>
              )}
            </div>

            <div>
              <p className="eyebrow">Repeat</p>
              <div className="mt-3 flex gap-2" role="radiogroup" aria-label="Repeat">
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
                    className={`rounded-full border px-3.5 py-1.5 text-sm capitalize transition-colors ${
                      recurrenceKind === k ? "border-lamp/60 text-paper" : "border-rule text-mist hover:text-paper"
                    }`}
                  >
                    {k === "none" ? "Once" : k}
                  </button>
                ))}
              </div>
              {d.recurrence?.freq === "weekly" && (
                <div className="mt-3 flex gap-1.5" role="group" aria-label="Days of the week">
                  {WEEKDAY_SHORT.map((label, i) => {
                    const on = weeklyDays.includes(i);
                    return (
                      <button
                        key={label}
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
              <Field label="Line">
                <select className="field" value={d.lineId ?? ""} onChange={(e) => set("lineId", e.target.value || null)}>
                  <option value="">None</option>
                  {lines.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.title}
                    </option>
                  ))}
                </select>
              </Field>
            )}

            <Field label="Notes">
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
            Cancel
          </Button>
        )}
        <Button type="submit" variant="primary">
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
