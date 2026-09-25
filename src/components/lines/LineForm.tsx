"use client";

import { useState, type FormEvent } from "react";
import { toDateKey } from "@/core/time";
import type { Line } from "@/core/types";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/controls";

export type LineInput = Pick<Line, "title" | "description" | "targetDate">;

export function LineForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: LineInput;
  submitLabel: string;
  onSubmit: (v: LineInput) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [targetDate, setTargetDate] = useState(initial?.targetDate ?? "");
  const [error, setError] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError("Name the line.");
      return;
    }
    onSubmit({ title: title.trim(), description: description.trim(), targetDate: targetDate || null });
  }

  return (
    <form onSubmit={submit} className="space-y-7" noValidate>
      <Field label="Name">
        <input className="field text-lg" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Biology Midterm" autoFocus />
      </Field>
      <Field label="Target date" hint="The exam, presentation or goal date.">
        <input type="date" className="field font-mono" value={targetDate} min={toDateKey(new Date())} onChange={(e) => setTargetDate(e.target.value)} />
      </Field>
      <Field label="Notes">
        <textarea className="field min-h-16 resize-y" value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      {error && (
        <p role="alert" className="text-sm text-signal">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-3">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="primary">
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
