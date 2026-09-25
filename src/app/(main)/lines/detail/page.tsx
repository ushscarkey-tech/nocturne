"use client";

import { feelPreset, useFeelStep } from "@/components/quickadd/FeelSheet";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { serviceDate } from "@/core/time";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Sheet } from "@/components/ui/Sheet";
import { LineForm } from "@/components/lines/LineForm";
import { LineRoute, lineProgress, lineTasks } from "@/components/lines/LineRoute";
import { TaskForm, draftFrom } from "@/components/tasks/TaskForm";
import { TaskRow } from "@/components/tasks/TaskRow";
import { attachTask, createTask, deleteLine, saveLine } from "@/state/actions";
import { useData } from "@/state/store";
import { useI18n } from "@/i18n";

export default function LineDetailPage() {
  return (
    <Suspense>
      <LineDetail />
    </Suspense>
  );
}

function LineDetail() {
  const { t, fmt } = useI18n();
  const id = useSearchParams().get("id") ?? "";
  const router = useRouter();
  const data = useData();
  const [sheet, setSheet] = useState<null | "edit" | "attach" | "task" | "delete">(null);
  const line = data.lines.find((l) => l.id === id);
  const today = serviceDate(new Date());

  if (!line) {
    return (
      <div className="animate-fade">
        <BackLink />
        <p className="mt-10 text-mist">This line no longer exists.</p>
      </div>
    );
  }

  const tasks = lineTasks(line, data.tasks);
  const p = lineProgress(tasks);
  const unattached = data.tasks.filter((t) => t.lineId !== line.id && (t.status === "active" || t.status === "inbox"));

  return (
    <div className="animate-fade">
      <BackLink />
      <header className="mt-8">
        <p className="eyebrow">{line.targetDate ? fmt.longDate(line.targetDate) : t("lines.noTargetDate")}</p>
        <h1 className="mt-2 font-display text-4xl leading-tight">{line.title}</h1>
        {line.description && <p className="mt-3 max-w-lg text-sm leading-relaxed text-mist">{line.description}</p>}
      </header>

      <dl className="mt-10 grid grid-cols-3 gap-6 border-t border-rule-soft pt-8">
        <div>
          <dt className="eyebrow text-[0.625rem]">{t("lines.progress")}</dt>
          <dd className="mt-1.5 font-mono text-2xl tabular text-lamp">{Math.round(p.fraction * 100)}%</dd>
        </div>
        <div>
          <dt className="eyebrow text-[0.625rem]">{t("lines.workload")}</dt>
          <dd className="mt-1.5 font-mono text-2xl tabular">{fmt.duration(p.total)}</dd>
        </div>
        <div>
          <dt className="eyebrow text-[0.625rem]">{t("lines.remaining")}</dt>
          <dd className="mt-1.5 font-mono text-2xl tabular">{fmt.duration(p.left)}</dd>
        </div>
      </dl>

      <section className="mt-12">
        <LineRoute line={line} tasks={tasks} today={today} />
      </section>

      <section className="mt-12" aria-labelledby="line-tasks">
        <div className="flex items-baseline justify-between">
          <h2 id="line-tasks" className="eyebrow">
            {t("lines.tasksOnThisLine")}
          </h2>
          <div className="flex gap-4 text-sm">
            <button type="button" onClick={() => setSheet("attach")} className="text-mist hover:text-paper">
              {t("lines.attach")}
            </button>
            <button type="button" onClick={() => setSheet("task")} className="inline-flex items-center gap-1 text-mist hover:text-paper">
              <Icon name="plus" size={14} /> {t("lines.newTask")}
            </button>
          </div>
        </div>
        <ul className="mt-2 divide-y divide-rule-soft">
          {tasks.map((t) => (
            <TaskRow key={t.id} task={t} today={today} />
          ))}
        </ul>
        {tasks.length === 0 && <p className="mt-3 text-sm text-mist">{t("lines.attachEmpty")}</p>}
      </section>

      <div className="mt-12 flex gap-3 border-t border-rule-soft pt-8">
        <Button variant="secondary" onClick={() => setSheet("edit")}>
          {t("lines.editLine")}
        </Button>
        <Button variant="ghost" className="ml-auto" onClick={() => setSheet("delete")}>
          {t("common.delete")}
        </Button>
      </div>

      <Sheet open={sheet === "edit"} onClose={() => setSheet(null)} title={t("lines.editLine")} eyebrow={line.title}>
        <LineForm
          initial={line}
          submitLabel={t("common.save")}
          onCancel={() => setSheet(null)}
          onSubmit={(v) => {
            saveLine({ ...v, id: line.id });
            setSheet(null);
          }}
        />
      </Sheet>

      <Sheet open={sheet === "attach"} onClose={() => setSheet(null)} title={t("lines.attachTasks")} eyebrow={line.title}>
        {unattached.length === 0 ? (
          <p className="text-sm text-mist">{t("lines.noAttach")}</p>
        ) : (
          <ul className="divide-y divide-rule-soft">
            {unattached.map((task) => (
              <li key={task.id} className="flex items-center justify-between gap-4 py-3">
                <span className="min-w-0 truncate text-sm text-paper-dim">{task.title}</span>
                <Button variant="quiet" size="sm" onClick={() => attachTask(task.id, line.id)}>
                  {t("lines.attach")}
                </Button>
              </li>
            ))}
          </ul>
        )}
        {tasks.length > 0 && (
          <>
            <p className="eyebrow mt-8">{t("lines.onThisLine")}</p>
            <ul className="mt-2 divide-y divide-rule-soft">
              {tasks.map((task) => (
                <li key={task.id} className="flex items-center justify-between gap-4 py-3">
                  <span className="min-w-0 truncate text-sm text-paper">{task.title}</span>
                  <Button variant="quiet" size="sm" onClick={() => attachTask(task.id, null)}>
                    {t("lines.detach")}
                  </Button>
                </li>
              ))}
            </ul>
          </>
        )}
      </Sheet>

      <Sheet open={sheet === "task"} onClose={() => setSheet(null)} title={t("lines.newTask")} eyebrow={line.title}>
        <TaskForm
          initial={draftFrom(undefined, { lineId: line.id, deadline: line.targetDate })}
          lines={data.lines}
          submitLabel={t("lines.newTask")}
          onCancel={() => setSheet(null)}
          feel={false}
          onSubmit={(d) => {
            const task = createTask(d);
            setSheet(null);
            useFeelStep.getState().ask(task, feelPreset(data, d));
          }}
        />
      </Sheet>

      <Sheet open={sheet === "delete"} onClose={() => setSheet(null)} title={t("lines.deleteQuestion")} eyebrow={line.title}>
        <p className="text-sm text-mist">{t("lines.deleteInfo")}</p>
        <div className="mt-8 flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setSheet(null)}>
            {t("lines.keepIt")}
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              router.push("/lines");
              deleteLine(line.id);
            }}
          >
            {t("lines.deleteLine")}
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

function BackLink() {
  const { t } = useI18n();
  return (
    <Link href="/lines" className="inline-flex items-center gap-1 text-sm text-mist hover:text-paper">
      <Icon name="back" size={16} /> {t("lines.back")}
    </Link>
  );
}
