"use client";

import { feelPreset, useFeelStep } from "@/components/quickadd/FeelSheet";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState, type FormEvent } from "react";
import { recursOn } from "@/core/allocate";
import { routeOf } from "@/core/sessions";
import { serviceDate } from "@/core/time";
import type { Task } from "@/core/types";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Sheet } from "@/components/ui/Sheet";
import { TaskForm, draftFrom } from "@/components/tasks/TaskForm";
import { TaskRow } from "@/components/tasks/TaskRow";
import { createTask } from "@/state/actions";
import { useData } from "@/state/store";
import { useQuickAdd } from "@/components/quickadd/QuickAdd";
import { useI18n } from "@/i18n";

export default function TasksPage() {
  return (
    <Suspense>
      <TasksView />
    </Suspense>
  );
}

function TasksView() {
  const data = useData();
  const router = useRouter();
  const params = useSearchParams();
  const [formOpen, setFormOpen] = useState(params.get("new") === "1");
  const [capture, setCapture] = useState("");
  const { t } = useI18n();
  const [showDone, setShowDone] = useState(false);
  const today = serviceDate(new Date());

  const tonight = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of routeOf(data.sessions, today)) {
      if (s.status === "planned" || s.status === "active") m.set(s.taskId, (m.get(s.taskId) ?? 0) + s.plannedMinutes);
    }
    return m;
  }, [data.sessions, today]);

  const sections = useMemo(() => {
    const byDeadline = (a: Task, b: Task) =>
      (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999") || b.importance - a.importance;
    const inbox: Task[] = [];
    const todayList: Task[] = [];
    const upcoming: Task[] = [];
    const someday: Task[] = [];
    const done: Task[] = [];
    for (const t of data.tasks) {
      if (t.status === "archived") continue;
      if (t.status === "done") done.push(t);
      else if (t.status === "inbox") inbox.push(t);
      else if (tonight.has(t.id) || (t.deadline && t.deadline <= today && !t.recurrence) || (t.recurrence && recursOn(t, today))) todayList.push(t);
      else if (t.deadline || t.recurrence) upcoming.push(t);
      else someday.push(t);
    }
    return {
      inbox: inbox.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      today: todayList.sort(byDeadline),
      upcoming: upcoming.sort(byDeadline),
      someday: someday.sort((a, b) => b.importance - a.importance),
      done: done.sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? "")),
    };
  }, [data.tasks, tonight, today]);

  // Typing here hands the sentence to Quick Add, which reads it and shows a preview.
  function quickCapture(e: FormEvent) {
    e.preventDefault();
    const text = capture.trim();
    if (!text) return;
    setCapture("");
    useQuickAdd.getState().show(text);
  }

  function closeForm() {
    setFormOpen(false);
    if (params.get("new")) router.replace("/tasks");
  }

  const empty = !data.tasks.some((task) => task.status !== "archived");

  return (
    <div className="animate-fade">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-5xl leading-none">{t("tasksPage.title")}</h1>
        </div>
        <Button variant="primary" size="md" onClick={() => setFormOpen(true)}>
          <Icon name="plus" size={16} /> {t("tasksPage.newTask")}
        </Button>
      </header>

      <form onSubmit={quickCapture} className="mt-10">
        <label className="sr-only" htmlFor="capture">
          {t("quickadd.placeholder")}
        </label>
        <div className="flex items-center gap-3 border-b border-rule focus-within:border-lamp-dim">
          <Icon name="plus" size={16} className="text-haze" />
          <input
            id="capture"
            value={capture}
            onChange={(e) => setCapture(e.target.value)}
            placeholder={t("quickadd.placeholder")}
            enterKeyHint="done"
            autoComplete="off"
            className="w-full bg-transparent py-3 text-base text-paper placeholder:text-haze focus:outline-none"
          />
        </div>
      </form>

      {empty && (
        <p className="mt-12 max-w-sm text-sm leading-relaxed text-mist">
          {t("tasksPage.empty")}
        </p>
      )}

      <TaskSection id="inbox" title={t("tasksPage.inbox")} hint={t("tasksPage.inboxHint")} tasks={sections.inbox} today={today} tonight={tonight} />
      <TaskSection id="today" title={t("tasksPage.today")} tasks={sections.today} today={today} tonight={tonight} />
      <TaskSection id="upcoming" title={t("tasksPage.upcoming")} tasks={sections.upcoming} today={today} tonight={tonight} />
      <TaskSection id="someday" title={t("tasksPage.someday")} hint={t("tasksPage.somedayHint")} tasks={sections.someday} today={today} tonight={tonight} />

      {sections.done.length > 0 && (
        <section className="mt-12">
          <button
            type="button"
            onClick={() => setShowDone((v) => !v)}
            aria-expanded={showDone}
            className="eyebrow flex items-center gap-2 hover:text-paper"
          >
            {t("tasksPage.completed")} · {sections.done.length}
            <Icon name="chevron" size={12} className={`transition-transform duration-500 ${showDone ? "rotate-90" : ""}`} />
          </button>
          {showDone && (
            <ul className="mt-2 animate-rise divide-y divide-rule-soft">
              {sections.done.map((t) => (
                <TaskRow key={t.id} task={t} today={today} />
              ))}
            </ul>
          )}
        </section>
      )}

      <Sheet open={formOpen} onClose={closeForm} title={t("tasksPage.newTask")}>
        <TaskForm
          initial={draftFrom()}
          lines={data.lines}
          submitLabel={t("quickadd.confirm")}
          onCancel={closeForm}
          feel={false}
          onSubmit={(d) => {
            const task = createTask(d);
            closeForm();
            useFeelStep.getState().ask(task, feelPreset(data, d));
          }}
        />
      </Sheet>
    </div>
  );
}

function TaskSection({
  id,
  title,
  hint,
  tasks,
  today,
  tonight,
}: {
  id: string;
  title: string;
  hint?: string;
  tasks: Task[];
  today: string;
  tonight: Map<string, number>;
}) {
  if (tasks.length === 0) return null;
  return (
    <section className="mt-12" aria-labelledby={`section-${id}`}>
      <div className="flex items-baseline justify-between">
        <h2 id={`section-${id}`} className="eyebrow">
          {title}
        </h2>
        <span className="font-mono text-xs text-haze">{tasks.length}</span>
      </div>
      {hint && <p className="mt-1 text-xs text-haze">{hint}</p>}
      <ul className="mt-2 divide-y divide-rule-soft">
        {tasks.map((t) => (
          <TaskRow key={t.id} task={t} today={today} tonightMinutes={tonight.get(t.id)} />
        ))}
      </ul>
    </section>
  );
}
