"use client";

import { useState, type FormEvent } from "react";
import { serviceDate } from "@/core/time";
import type { Line } from "@/core/types";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/controls";
import { useI18n } from "@/i18n";

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
  const { t } = useI18n();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [targetDate, setTargetDate] = useState(initial?.targetDate ?? "");
  const [error, setError] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError(t("lines.nameRequired"));
      return;
    }
    onSubmit({ title: title.trim(), description: description.trim(), targetDate: targetDate || null });
  }

  return (
    <form onSubmit={submit} className="space-y-7" noValidate>
      <Field label={t("lines.lineName")}>
        <input className="field text-lg" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Biology Midterm" autoFocus />
      </Field>
      <Field label={t("lines.targetDate")} hint={t("lines.targetDateHint")}>
        <input type="date" className="field font-mono" value={targetDate} min={serviceDate(new Date())} onChange={(e) => setTargetDate(e.target.value)} />
      </Field>
      <Field label={t("lines.notes")}>
        <textarea className="field min-h-16 resize-y" value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      {error && (
        <p role="alert" className="text-sm text-signal">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-3">
        <Button variant="ghost" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" variant="primary">
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
