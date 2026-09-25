"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { formatDuration, formatLongDate, toDateKey } from "@/core/time";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Sheet } from "@/components/ui/Sheet";
import { LineForm } from "@/components/lines/LineForm";
import { LineRoute, lineProgress, lineTasks } from "@/components/lines/LineRoute";
import { TaskForm, draftFrom } from "@/components/tasks/TaskForm";
import { TaskRow } from "@/components/tasks/TaskRow";
import { attachTask, createTask, deleteLine, saveLine } from "@/state/actions";
import { useData } from "@/state/store";

export default function LineDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const data = useData();
  const [sheet, setSheet] = useState<null | "edit" | "attach" | "task" | "delete">(null);
  const line = data.lines.find((l) => l.id === id);
  const today = toDateKey(new Date());

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
  const unattached = data.tasks.filter((t) => t.lineId !== line.id && t.status !== "done");

  return (
    <div className="animate-fade">
      <BackLink />
      <header className="mt-8">
        <p className="eyebrow">{line.targetDate ? formatLongDate(line.targetDate) : "No target date"}</p>
        <h1 className="mt-2 font-display text-4xl leading-tight">{line.title}</h1>
        {line.description && <p className="mt-3 max-w-lg text-sm leading-relaxed text-mist">{line.description}</p>}
      </header>

      <dl className="mt-10 grid grid-cols-3 gap-6 border-t border-rule-soft pt-8">
        <div>
          <dt className="eyebrow text-[0.625rem]">Progress</dt>
          <dd className="mt-1.5 font-mono text-2xl tabular text-lamp">{Math.round(p.fraction * 100)}%</dd>
        </div>
        <div>
          <dt className="eyebrow text-[0.625rem]">Workload</dt>
          <dd className="mt-1.5 font-mono text-2xl tabular">{formatDuration(p.total)}</dd>
        </div>
        <div>
          <dt className="eyebrow text-[0.625rem]">Remaining</dt>
          <dd className="mt-1.5 font-mono text-2xl tabular">{formatDuration(p.left)}</dd>
        </div>
      </dl>

      <section className="mt-12">
        <LineRoute line={line} tasks={tasks} today={today} />
      </section>

      <section className="mt-12" aria-labelledby="line-tasks">
        <div className="flex items-baseline justify-between">
          <h2 id="line-tasks" className="eyebrow">
            Tasks on this line
          </h2>
          <div className="flex gap-4 text-sm">
            <button type="button" onClick={() => setSheet("attach")} className="text-mist hover:text-paper">
              Attach
            </button>
            <button type="button" onClick={() => setSheet("task")} className="inline-flex items-center gap-1 text-mist hover:text-paper">
              <Icon name="plus" size={14} /> New
            </button>
          </div>
        </div>
        <ul className="mt-2 divide-y divide-rule-soft">
          {tasks.map((t) => (
            <TaskRow key={t.id} task={t} today={today} />
          ))}
        </ul>
        {tasks.length === 0 && <p className="mt-3 text-sm text-mist">Attach existing tasks or add new ones.</p>}
      </section>

      <div className="mt-12 flex gap-3 border-t border-rule-soft pt-8">
        <Button variant="secondary" onClick={() => setSheet("edit")}>
          Edit line
        </Button>
        <Button variant="ghost" className="ml-auto" onClick={() => setSheet("delete")}>
          Delete
        </Button>
      </div>

      <Sheet open={sheet === "edit"} onClose={() => setSheet(null)} title="Edit line" eyebrow={line.title}>
        <LineForm
          initial={line}
          submitLabel="Save"
          onCancel={() => setSheet(null)}
          onSubmit={(v) => {
            saveLine({ ...v, id: line.id });
            setSheet(null);
          }}
        />
      </Sheet>

      <Sheet open={sheet === "attach"} onClose={() => setSheet(null)} title="Attach tasks" eyebrow={line.title}>
        {unattached.length === 0 ? (
          <p className="text-sm text-mist">Every open task is already on this line.</p>
        ) : (
          <ul className="divide-y divide-rule-soft">
            {unattached.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-4 py-3">
                <span className="min-w-0 truncate text-sm text-paper-dim">{t.title}</span>
                <Button variant="quiet" size="sm" onClick={() => attachTask(t.id, line.id)}>
                  Attach
                </Button>
              </li>
            ))}
          </ul>
        )}
        {tasks.length > 0 && (
          <>
            <p className="eyebrow mt-8">On this line</p>
            <ul className="mt-2 divide-y divide-rule-soft">
              {tasks.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-4 py-3">
                  <span className="min-w-0 truncate text-sm text-paper">{t.title}</span>
                  <Button variant="quiet" size="sm" onClick={() => attachTask(t.id, null)}>
                    Detach
                  </Button>
                </li>
              ))}
            </ul>
          </>
        )}
      </Sheet>

      <Sheet open={sheet === "task"} onClose={() => setSheet(null)} title="New task" eyebrow={line.title}>
        <TaskForm
          initial={draftFrom(undefined, { lineId: line.id, deadline: line.targetDate })}
          lines={data.lines}
          submitLabel="Add task"
          onCancel={() => setSheet(null)}
          onSubmit={(d) => {
            createTask(d);
            setSheet(null);
          }}
        />
      </Sheet>

      <Sheet open={sheet === "delete"} onClose={() => setSheet(null)} title="Delete this line?" eyebrow={line.title}>
        <p className="text-sm text-mist">Its tasks stay in your list; they just won&rsquo;t belong to a line.</p>
        <div className="mt-8 flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setSheet(null)}>
            Keep it
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              router.push("/lines");
              deleteLine(line.id);
            }}
          >
            Delete line
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/lines" className="inline-flex items-center gap-1 text-sm text-mist hover:text-paper">
      <Icon name="back" size={16} /> Lines
    </Link>
  );
}
