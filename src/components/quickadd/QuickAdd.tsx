"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { create } from "zustand";
import { calibrate } from "@/core/learning";
import { parseQuickAdd, type ParsedTask, type QuickField } from "@/core/quickadd";
import { addDays, serviceDate } from "@/core/time";
import type { Level, Recurrence } from "@/core/types";
import { Button } from "@/components/ui/Button";
import { InterestSlider, LevelPicker, MinutesInput, Toggle } from "@/components/ui/controls";
import { Icon } from "@/components/ui/Icon";
import { Sheet } from "@/components/ui/Sheet";
import { TaskForm, draftFrom } from "@/components/tasks/TaskForm";
import { useI18n, type MessageKey } from "@/i18n";
import { createTask, type TaskDraft } from "@/state/actions";
import { useData, useStore } from "@/state/store";

/** Open the Quick Add sheet from anywhere, optionally with text already typed. */
export const useQuickAdd = create<{ open: boolean; text: string; show: (text?: string) => void; hide: () => void }>()((set) => ({
  open: false,
  text: "",
  show: (text = "") => set({ open: true, text }),
  hide: () => set({ open: false, text: "" }),
}));

/** Round button above the tab bar. */
export function QuickAddButton() {
  const { t } = useI18n();
  const show = useQuickAdd((s) => s.show);
  return (
    <button
      type="button"
      onClick={() => show()}
      aria-label={t("quickadd.open")}
      className="fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom))] right-5 z-30 flex h-13 w-13 items-center justify-center rounded-full border border-rule bg-night-850/90 text-paper shadow-[0_12px_30px_-12px_rgba(0,0,0,0.9)] backdrop-blur transition-colors duration-500 hover:border-lamp/50 md:bottom-8 md:right-8"
    >
      <Icon name="plus" size={20} />
    </button>
  );
}

type Overrides = Partial<{
  title: string;
  deadline: string | null;
  estimatedMinutes: number | null;
  interest: Level | null;
  difficulty: Level | null;
  importance: Level | null;
  recurrence: Recurrence | null;
  splittable: boolean | null;
  maxSessionMinutes: number | null;
  lineId: string | null;
  userEstimatedMinutes: number | null;
}>;

export function QuickAddSheet() {
  const { t } = useI18n();
  const { open, text: initialText, hide } = useQuickAdd();
  return (
    <Sheet open={open} onClose={hide} title={t("quickadd.title")}>
      {open && <QuickAddBody key={initialText} initialText={initialText} onDone={hide} />}
    </Sheet>
  );
}

export function QuickAddBody({ initialText, onDone }: { initialText: string; onDone: () => void }) {
  const data = useData();
  const { t, fmt } = useI18n();
  const [text, setText] = useState(initialText);
  const [overrides, setOverrides] = useState<Overrides>({});
  const [editing, setEditing] = useState<QuickField | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [fullForm, setFullForm] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const today = serviceDate(new Date());
  const activeLines = data.lines;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const parsed: ParsedTask | null = useMemo(
    () => (text.trim() ? parseQuickAdd(text, new Date(), activeLines) : null),
    [text, activeLines],
  );

  const v = {
    title: overrides.title ?? parsed?.title ?? "",
    deadline: "deadline" in overrides ? overrides.deadline! : (parsed?.deadline ?? null),
    estimatedMinutes: "estimatedMinutes" in overrides ? overrides.estimatedMinutes! : (parsed?.estimatedMinutes ?? null),
    interest: "interest" in overrides ? overrides.interest! : (parsed?.interest ?? null),
    difficulty: "difficulty" in overrides ? overrides.difficulty! : (parsed?.difficulty ?? null),
    importance: "importance" in overrides ? overrides.importance! : (parsed?.importance ?? null),
    recurrence: "recurrence" in overrides ? overrides.recurrence! : (parsed?.recurrence ?? null),
    splittable: "splittable" in overrides ? overrides.splittable! : (parsed?.splittable ?? null),
    maxSessionMinutes: "maxSessionMinutes" in overrides ? overrides.maxSessionMinutes! : (parsed?.maxSessionMinutes ?? null),
    lineId: "lineId" in overrides ? overrides.lineId! : (parsed?.lineId ?? null),
  };
  const unsure = new Set(parsed?.unsure ?? []);
  for (const k of Object.keys(overrides)) unsure.delete(k === "estimatedMinutes" ? "estimate" : (k as QuickField));
  const found = new Set(parsed?.found ?? []);

  const set = (patch: Overrides) => setOverrides((o) => ({ ...o, ...patch }));

  const own = overrides.userEstimatedMinutes ?? null;
  const calibration =
    v.estimatedMinutes && own === null && !("calibrationDismissed" in overrides)
      ? calibrate(data, { title: v.title, lineId: v.lineId }, v.estimatedMinutes)
      : null;

  function toDraft(): TaskDraft {
    const max = v.maxSessionMinutes ?? 60;
    return {
      ...draftFrom(),
      title: v.title.trim() || text.trim(),
      deadline: v.deadline,
      estimatedMinutes: v.estimatedMinutes ?? 0,
      interest: v.interest ?? 3,
      difficulty: v.difficulty ?? 3,
      importance: v.importance ?? 3,
      recurrence: v.recurrence,
      splittable: v.splittable ?? true,
      maxSessionMinutes: max,
      minSessionMinutes: Math.min(parsed?.minSessionMinutes ?? 25, max),
      lineId: v.lineId,
      userEstimatedMinutes: own,
    };
  }

  function submit(e?: FormEvent) {
    e?.preventDefault();
    if (!text.trim() && !v.title.trim()) return;
    const task = createTask(toDraft());
    useStore.getState().notify({
      headline: task.status === "inbox" ? t("quickadd.addedInbox") : t("quickadd.added"),
      lines: [task.title],
      tone: "info",
    });
    onDone();
  }

  if (fullForm) {
    return (
      <TaskForm
        initial={toDraft()}
        lines={data.lines}
        submitLabel={t("quickadd.confirm")}
        onCancel={() => setFullForm(false)}
        onSubmit={(d) => {
          createTask(d);
          onDone();
        }}
      />
    );
  }

  const levelWord = (n: Level | null) => (n ? t(`quickadd.level.${n}` as MessageKey) : t("quickadd.notSet"));
  const interestWord = (n: Level | null) => (n ? t(`common.interest.${n}` as MessageKey) : t("quickadd.notSet"));
  const repeatWord = (r: Recurrence | null) =>
    !r ? t("quickadd.notSet") : r.freq === "daily" ? t("quickadd.daily") : `${t("quickadd.weekly")} · ${r.days.map((d) => fmt.weekdayOf(d)).join(" ")}`;
  const splitWord =
    v.splittable === false
      ? t("quickadd.oneGo")
      : v.maxSessionMinutes
        ? t("quickadd.chunks", { min: v.maxSessionMinutes })
        : v.splittable
          ? t("quickadd.splitAuto")
          : t("quickadd.notSet");
  const lineWord = v.lineId ? (data.lines.find((l) => l.id === v.lineId)?.title ?? t("quickadd.notSet")) : t("quickadd.notSet");

  const rows: { field: QuickField; label: string; value: string; editor: ReactNode; always?: boolean }[] = [
    {
      field: "deadline",
      label: t("quickadd.deadline"),
      value: v.deadline ? `${fmt.relativeDay(today, v.deadline)} · ${fmt.shortDate(v.deadline)}` : t("quickadd.notSet"),
      always: true,
      editor: (
        <div className="flex flex-wrap items-center gap-2">
          {[today, addDays(today, 1), addDays(today, 7)].map((d, i) => (
            <Chip key={d} active={v.deadline === d} onClick={() => set({ deadline: d })}>
              {i === 2 ? fmt.shortDate(d) : fmt.relativeDay(today, d)}
            </Chip>
          ))}
          <input
            type="date"
            className="field max-w-40 font-mono text-sm"
            value={v.deadline ?? ""}
            min={today}
            onChange={(e) => set({ deadline: e.target.value || null })}
            aria-label={t("quickadd.deadline")}
          />
          <Chip active={false} onClick={() => set({ deadline: null })}>
            {t("quickadd.clear")}
          </Chip>
        </div>
      ),
    },
    {
      field: "estimate",
      label: t("quickadd.estimate"),
      value: v.estimatedMinutes ? fmt.duration(v.estimatedMinutes) : t("quickadd.notSet"),
      always: true,
      editor: (
        <MinutesInput
          label={t("quickadd.estimate")}
          value={v.estimatedMinutes ?? 60}
          onChange={(m) => set({ estimatedMinutes: m, userEstimatedMinutes: null })}
          step={15}
          min={0}
        />
      ),
    },
    {
      field: "interest",
      label: t("quickadd.interest"),
      value: interestWord(v.interest),
      editor: <InterestSlider value={v.interest ?? 3} onChange={(n) => set({ interest: n })} />,
    },
    {
      field: "importance",
      label: t("quickadd.importance"),
      value: levelWord(v.importance),
      editor: (
        <LevelPicker label={t("quickadd.importance")} value={v.importance ?? 3} onChange={(n) => set({ importance: n })} low={t("quickadd.level.1")} high={t("quickadd.level.5")} />
      ),
    },
    {
      field: "difficulty",
      label: t("quickadd.difficulty"),
      value: levelWord(v.difficulty),
      editor: (
        <LevelPicker label={t("quickadd.difficulty")} value={v.difficulty ?? 3} onChange={(n) => set({ difficulty: n })} low={t("quickadd.level.1")} high={t("quickadd.level.5")} />
      ),
    },
    {
      field: "recurrence",
      label: t("quickadd.repeat"),
      value: repeatWord(v.recurrence),
      editor: (
        <div className="flex flex-wrap gap-2">
          <Chip active={!v.recurrence} onClick={() => set({ recurrence: null })}>
            {t("quickadd.once")}
          </Chip>
          <Chip active={v.recurrence?.freq === "daily"} onClick={() => set({ recurrence: { freq: "daily" } })}>
            {t("quickadd.daily")}
          </Chip>
          {[1, 2, 3, 4, 5, 6, 0].map((d) => {
            const days = v.recurrence?.freq === "weekly" ? v.recurrence.days : [];
            const on = days.includes(d);
            return (
              <Chip
                key={d}
                active={on}
                onClick={() => {
                  const next = on ? days.filter((x) => x !== d) : [...days, d].sort();
                  set({ recurrence: next.length ? { freq: "weekly", days: next } : null });
                }}
              >
                {fmt.weekdayOf(d)}
              </Chip>
            );
          })}
        </div>
      ),
    },
    {
      field: "split",
      label: t("quickadd.split"),
      value: splitWord,
      editor: (
        <div className="space-y-2">
          <Toggle checked={v.splittable !== false} onChange={(on) => set({ splittable: on })} label={t("quickadd.splitAuto")} />
          {v.splittable !== false && (
            <MinutesInput
              label={t("quickadd.split")}
              value={v.maxSessionMinutes ?? 60}
              onChange={(m) => set({ maxSessionMinutes: Math.max(15, m), splittable: true })}
              step={15}
              min={15}
              max={180}
            />
          )}
        </div>
      ),
    },
  ];
  if (data.lines.length > 0) {
    rows.push({
      field: "line",
      label: t("quickadd.line"),
      value: lineWord,
      editor: (
        <select className="field" value={v.lineId ?? ""} onChange={(e) => set({ lineId: e.target.value || null })} aria-label={t("quickadd.line")}>
          <option value="">{t("quickadd.notSet")}</option>
          {data.lines.map((l) => (
            <option key={l.id} value={l.id}>
              {l.title}
            </option>
          ))}
        </select>
      ),
    });
  }
  const visible = rows.filter((r) => showAll || r.always || found.has(r.field) || r.field in overrides || editing === r.field);
  const hiddenCount = rows.length - visible.length;

  return (
    <form onSubmit={submit} className="space-y-6">
      <input
        ref={inputRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t("quickadd.placeholder")}
        enterKeyHint="done"
        autoComplete="off"
        className="field text-lg"
        aria-label={t("quickadd.placeholder")}
      />
      {!parsed && <p className="-mt-3 text-xs text-haze">{t("quickadd.example")}</p>}

      {parsed && (
        <div className="animate-fade">
          <div className="border-b border-rule-soft pb-3">
            <p className="eyebrow">{t("quickadd.task")}</p>
            {editing === "title" ? (
              <input
                className="field text-base"
                value={v.title}
                onChange={(e) => set({ title: e.target.value })}
                onBlur={() => setEditing(null)}
                autoFocus
                aria-label={t("quickadd.task")}
              />
            ) : (
              <button type="button" onClick={() => setEditing("title")} className="mt-1 block w-full break-words text-left text-lg text-paper">
                {v.title}
                {unsure.has("title") && <UnsureMark label={t("quickadd.check")} />}
              </button>
            )}
          </div>
          <dl className="divide-y divide-rule-soft">
            {visible.map((r) => (
              <div key={r.field} className="py-1">
                <button
                  type="button"
                  onClick={() => setEditing(editing === r.field ? null : r.field)}
                  aria-expanded={editing === r.field}
                  className="flex min-h-11 w-full items-center justify-between gap-4 text-left"
                >
                  <dt className="text-sm text-mist">{r.label}</dt>
                  <dd className={`text-right text-sm ${r.value === t("quickadd.notSet") ? "text-haze" : "text-paper"}`}>
                    {r.value}
                    {unsure.has(r.field) && <UnsureMark label={t("quickadd.check")} />}
                  </dd>
                </button>
                {editing === r.field && <div className="animate-rise pb-3 pt-1">{r.editor}</div>}
                {r.field === "estimate" && calibration && v.estimatedMinutes && (
                  <div className="mb-2 animate-rise rounded-xl border border-rule-soft px-4 py-3">
                    <p className="text-sm text-paper-dim">
                      {calibration.ratio > 1
                        ? t("quickadd.calibrationLonger", { task: calibration.example })
                        : t("quickadd.calibrationShorter", { task: calibration.example })}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => set({ userEstimatedMinutes: v.estimatedMinutes, estimatedMinutes: calibration.suggestedMinutes })}
                      >
                        {t("quickadd.use", { min: calibration.suggestedMinutes })}
                      </Button>
                      <Button variant="quiet" size="sm" onClick={() => setOverrides((o) => ({ ...o, calibrationDismissed: true }) as Overrides)}>
                        {t("quickadd.keep", { min: v.estimatedMinutes })}
                      </Button>
                    </div>
                  </div>
                )}
                {r.field === "estimate" && own !== null && v.estimatedMinutes !== own && (
                  <p className="mb-2 text-xs text-haze">
                    {t("quickadd.yourEstimate")} {fmt.duration(own)} ·{" "}
                    <button type="button" className="underline underline-offset-4" onClick={() => set({ estimatedMinutes: own, userEstimatedMinutes: null })}>
                      {t("quickadd.keep", { min: own })}
                    </button>
                  </p>
                )}
              </div>
            ))}
          </dl>
          <div className="mt-2 flex gap-4 text-xs text-haze">
            {(hiddenCount > 0 || showAll) && (
              <button type="button" className="min-h-9 hover:text-mist" onClick={() => setShowAll(!showAll)}>
                {showAll ? t("quickadd.fewer") : `${t("quickadd.more")} · ${hiddenCount}`}
              </button>
            )}
            <button type="button" className="min-h-9 hover:text-mist" onClick={() => setFullForm(true)}>
              {t("quickadd.fullForm")}
            </button>
          </div>
        </div>
      )}

      {parsed && !v.estimatedMinutes && <p className="text-xs text-haze">{t("quickadd.inboxHint")}</p>}
      <div className="flex justify-end">
        <Button type="submit" variant="primary" disabled={!parsed}>
          {parsed && !v.estimatedMinutes ? t("quickadd.confirmInbox") : t("quickadd.confirm")}
        </Button>
      </div>
    </form>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`min-h-9 rounded-full border px-3 text-xs transition-colors ${active ? "border-lamp/60 text-paper" : "border-rule text-mist hover:text-paper"}`}
    >
      {children}
    </button>
  );
}

function UnsureMark({ label }: { label: string }) {
  return <span className="ml-2 rounded-full border border-lamp/40 px-1.5 py-0.5 align-middle font-mono text-[0.625rem] text-lamp/90">{label}</span>;
}
