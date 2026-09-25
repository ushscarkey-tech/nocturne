"use client";

import { useState } from "react";
import { create } from "zustand";
import { suggestFeel } from "@/core/learning";
import type { Level, NocturneData, Task } from "@/core/types";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/Button";
import { InterestSlider, LevelPicker } from "@/components/ui/controls";
import { Sheet } from "@/components/ui/Sheet";
import { updateTask } from "@/state/actions";

export interface FeelPreset {
  interest: Level;
  difficulty: Level;
  importance: Level;
  source: "text" | "similar" | null;
  example?: string;
}

/**
 * The second step of adding a task: how it feels. Kept apart from the first
 * (what, when, how long) so adding stays quick; filled in from the words
 * typed or from similar tasks when there is something to go on.
 */
export const useFeelStep = create<{ task: Task | null; preset: FeelPreset | null; ask: (task: Task, preset: FeelPreset) => void; close: () => void }>(
  (set) => ({
    task: null,
    preset: null,
    ask: (task, preset) => {
      // Let the first sheet slide away before the second rises.
      setTimeout(() => set({ task, preset }), 380);
    },
    close: () => set({ task: null, preset: null }),
  }),
);

/** Values for the feel step: what the text said, else similar tasks, else neutral. */
export function feelPreset(
  data: NocturneData,
  draft: { title: string; lineId: string | null },
  fromText: Partial<Record<"interest" | "difficulty" | "importance", Level | null>> = {},
): FeelPreset {
  const guess = suggestFeel(data, draft);
  const said = fromText.interest != null || fromText.difficulty != null || fromText.importance != null;
  return {
    interest: fromText.interest ?? guess?.interest ?? 3,
    difficulty: fromText.difficulty ?? guess?.difficulty ?? 3,
    importance: fromText.importance ?? guess?.importance ?? 3,
    source: said ? "text" : guess ? "similar" : null,
    example: guess?.example,
  };
}

export function FeelSheet() {
  const { task, preset, close } = useFeelStep();
  return task && preset ? <FeelBody key={task.id} task={task} preset={preset} onClose={close} /> : null;
}

function FeelBody({ task, preset, onClose }: { task: Task; preset: FeelPreset; onClose: () => void }) {
  const { t } = useI18n();
  const [interest, setInterest] = useState<Level>(preset.interest);
  const [difficulty, setDifficulty] = useState<Level>(preset.difficulty);
  const [importance, setImportance] = useState<Level>(preset.importance);

  function save() {
    if (interest !== task.interest || difficulty !== task.difficulty || importance !== task.importance) {
      updateTask(task.id, { interest, difficulty, importance });
    }
    onClose();
  }

  return (
    <Sheet open onClose={onClose} title={t("quickadd.feelTitle")} eyebrow={t("quickadd.feelStep")}>
      <p className="text-lg text-paper">{task.title}</p>
      {preset.source && (
        <p className="mt-2 text-xs leading-relaxed text-lamp/85">
          {preset.source === "text" ? t("quickadd.feelFromText") : t("quickadd.feelFromSimilar", { task: preset.example ?? "" })}
        </p>
      )}
      <div className="mt-7 space-y-8">
        <InterestSlider value={interest} onChange={setInterest} />
        <LevelPicker label={t("tasks.difficulty")} value={difficulty} onChange={setDifficulty} low={t("tasks.light")} high={t("tasks.demanding")} />
        <LevelPicker label={t("tasks.importance")} value={importance} onChange={setImportance} low={t("tasks.niceToDo")} high={t("tasks.essential")} />
      </div>
      <p className="mt-7 text-xs leading-relaxed text-haze">{t("quickadd.feelWhy")}</p>
      <div className="mt-6 flex justify-end gap-3">
        <Button variant="ghost" onClick={onClose}>
          {t("quickadd.skip")}
        </Button>
        <Button variant="primary" onClick={save}>
          {t("quickadd.save")}
        </Button>
      </div>
    </Sheet>
  );
}
