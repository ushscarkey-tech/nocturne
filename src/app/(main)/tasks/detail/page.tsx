"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { scheduleFor } from "@/core/allocate";
import { clock, formatDuration, formatShortDate, relativeDay, serviceDate } from "@/core/time";
import type { Level } from "@/core/types";
import { Button } from "@/components/ui/Button";
import { MinutesInput } from "@/components/ui/controls";
import { Icon } from "@/components/ui/Icon";
import { Sheet } from "@/components/ui/Sheet";
import { TaskForm, draftFrom } from "@/components/tasks/TaskForm";
import { ConfirmFinish } from "@/components/journey/ConfirmFinish";
import { useNow } from "@/lib/hooks";
import { useForecast } from "@/lib/use-planner";
import { completeTask, deleteTask, logProgress, reopenTask, updateTask } from "@/state/actions";
import { useData } from "@/state/store";

const INTEREST = ["Avoiding it", "Reluctant", "Neutral", "Curious", "Drawn to it"];

export default function TaskDetailPage() {
  return (
    <Suspense>
      <TaskDetail />
    </Suspense>
  );
}

function TaskDetail() {
  const params = useSearchParams();
  const id = params.get("id") ?? "";
  const router = useRouter();
  const data = useData();
  const now = useNow(60_000);
  const forecast = useForecast(data, now);
  const editParam = params.get("edit");
  const [editing, setEditing] = useState(editParam === "deadline" || editParam === "estimate");
  const [logging, setLogging] = useState(false);
  const [logMinutes, setLogMinutes] = useState(30);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const task = data.tasks.find((t) => t.id === id);
  const today = serviceDate(now);

  if (!task) {
    return (
      <div className="animate-fade">
        <BackLink />
        <p className="mt-10 text-mist">This task is no longer on the line.</p>
      </div>
    );
  }

  const line = data.lines.find((l) => l.id === task.lineId);
  const completed = task.recurrence ? 0 : Math.max(0, task.estimatedMinutes - task.remainingMinutes);
  const progress = task.estimatedMinutes > 0 && !task.recurrence ? completed / task.estimatedMinutes : 0;
  const schedule = scheduleFor(forecast, task.id);
  const tonightStations = data.sessions
    .filter((s) => s.taskId === task.id && s.date === today && (s.status === "planned" || s.status === "active"))
    .sort((a, b) => a.plannedStart.localeCompare(b.plannedStart));
  const history = data.sessions
    .filter((s) => s.taskId === task.id && (s.status === "done" || s.status === "partial"))
    .sort((a, b) => b.plannedStart.localeCompare(a.plannedStart));
  const unscheduled = forecast.unscheduled[task.id] ?? 0;
  const later = schedule.filter((s) => s.date !== today);

  return (
    <div className="animate-fade">
      <BackLink />

      <header className="mt-8">
        <p className="eyebrow">
          {task.status === "archived"
            ? "Deleted · kept for past journeys"
            : task.status === "inbox"
              ? "Inbox"
              : task.status === "done"
                ? "Completed"
                : line
                  ? line.title
                  : task.recurrence
                    ? "Recurring"
                    : "Task"}
        </p>
        <h1 className="mt-2 break-words font-display text-4xl leading-tight">{task.title}</h1>
        {task.description && <p className="mt-3 max-w-lg text-sm leading-relaxed text-mist">{task.description}</p>}
      </header>

      <dl className="mt-10 grid grid-cols-2 gap-x-8 gap-y-6 border-t border-rule-soft pt-8 sm:grid-cols-4">
        <Stat label={task.recurrence ? "Repeats" : "Deadline"}>
          {task.recurrence
            ? task.recurrence.freq === "daily"
              ? "Daily"
              : "Weekly"
            : task.deadline
              ? `${formatShortDate(task.deadline)}`
              : "Someday"}
          {task.deadline && !task.recurrence && <span className="block text-xs text-mist">{relativeDay(today, task.deadline)}</span>}
        </Stat>
        <Stat label={task.recurrence ? "Each time" : "Estimated"}>{formatDuration(task.estimatedMinutes)}</Stat>
        {!task.recurrence && <Stat label="Completed">{formatDuration(completed)}</Stat>}
        {!task.recurrence && (
          <Stat label="Remaining" accent>
            {formatDuration(task.remainingMinutes)}
          </Stat>
        )}
      </dl>
      {progress > 0 && (
        <div className="mt-6 h-px w-full bg-rule" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Progress">
          <div className="h-px bg-lamp transition-[width] duration-1000" style={{ width: `${progress * 100}%` }} />
        </div>
      )}

      <div className="mt-8">
        <ConfirmFinish tasks={[task]} compact />
      </div>

      <section className="mt-10 grid grid-cols-3 gap-6" aria-label="How the task feels">
        <Scale label="Interest" value={task.interest} caption={INTEREST[task.interest - 1]} />
        <Scale label="Difficulty" value={task.difficulty} />
        <Scale label="Importance" value={task.importance} />
      </section>

      {task.status === "active" && (
        <section className="mt-12" aria-labelledby="schedule-title">
          <h2 id="schedule-title" className="eyebrow">
            Scheduled
          </h2>
          {unscheduled > 0 && (
            <p className="mt-3 text-sm text-signal">
              {formatDuration(unscheduled)} doesn&rsquo;t fit before the deadline yet.{" "}
              <Link href="/service" className="underline underline-offset-4">
                Add Service Time
              </Link>
            </p>
          )}
          <ul className="mt-3 divide-y divide-rule-soft">
            {tonightStations.map((s) => (
              <li key={s.id} className="flex items-center justify-between py-3 text-sm">
                <span className="text-paper">
                  Tonight <span className="ml-2 font-mono text-xs text-lamp tabular">{clock(s.plannedStart)}</span>
                </span>
                <span className="font-mono text-xs text-mist tabular">{formatDuration(s.plannedMinutes)}</span>
              </li>
            ))}
            {later.slice(0, 8).map((s) => (
              <li key={s.date} className="flex items-center justify-between py-3 text-sm">
                <span className="text-paper-dim">
                  {relativeDay(today, s.date)}
                  <span className="ml-2 text-xs text-haze">{formatShortDate(s.date)}</span>
                </span>
                <span className="font-mono text-xs text-mist tabular">{formatDuration(s.minutes)}</span>
              </li>
            ))}
            {tonightStations.length === 0 && later.length === 0 && unscheduled === 0 && (
              <li className="py-3 text-sm text-mist">Nothing scheduled in the next two weeks.</li>
            )}
          </ul>
        </section>
      )}

      {history.length > 0 && (
        <section className="mt-12" aria-labelledby="history-title">
          <h2 id="history-title" className="eyebrow">
            Journeys
          </h2>
          <ul className="mt-3 divide-y divide-rule-soft">
            {history.slice(0, 8).map((s) => (
              <li key={s.id} className="flex items-center justify-between py-3 text-sm">
                <span className="text-paper-dim">
                  {formatShortDate(s.date)} <span className="ml-2 text-xs text-haze">{s.stationName}</span>
                </span>
                <span className="font-mono text-xs text-mist tabular">
                  {formatDuration(s.completedMinutes)}
                  {s.status === "partial" ? " · partial" : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {task.status !== "archived" && (
      <div className="mt-12 flex flex-wrap gap-3 border-t border-rule-soft pt-8">
        <Button variant="secondary" onClick={() => setEditing(true)}>
          Edit
        </Button>
        {task.status === "active" && !task.recurrence && (
          <Button variant="secondary" onClick={() => setLogging(true)}>
            Log progress
          </Button>
        )}
        {task.status !== "done" ? (
          <Button variant="secondary" onClick={() => completeTask(task.id)}>
            <Icon name="check" size={16} /> Mark complete
          </Button>
        ) : (
          <Button variant="secondary" onClick={() => reopenTask(task.id)}>
            Reopen
          </Button>
        )}
        <Button variant="ghost" onClick={() => setConfirmDelete(true)} className="ml-auto">
          Delete
        </Button>
      </div>
      )}

      <Sheet open={editing} onClose={() => setEditing(false)} title="Edit task" eyebrow={task.title}>
        <TaskForm
          initial={draftFrom(task)}
          lines={data.lines}
          submitLabel="Save changes"
          focusField={editParam === "deadline" ? "deadline" : null}
          onCancel={() => setEditing(false)}
          onSubmit={(d) => {
            updateTask(task.id, d);
            setEditing(false);
          }}
        />
      </Sheet>

      <Sheet open={logging} onClose={() => setLogging(false)} title="Log progress" eyebrow="Work done outside a journey">
        <p className="text-sm text-mist">Nocturne will subtract this from what&rsquo;s left and adjust the plan.</p>
        <div className="mt-6 flex justify-center">
          <MinutesInput label="minutes done" value={logMinutes} onChange={setLogMinutes} step={5} min={5} max={task.remainingMinutes} />
        </div>
        <div className="mt-8 flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setLogging(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              logProgress(task.id, logMinutes);
              setLogging(false);
            }}
          >
            Log {formatDuration(logMinutes)}
          </Button>
        </div>
      </Sheet>

      <Sheet open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete this task?" eyebrow={task.title}>
        <p className="text-sm leading-relaxed text-mist">
          Its future stations will leave the route. Past journeys keep their record.
        </p>
        <div className="mt-8 flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
            Keep it
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              router.push("/tasks");
              deleteTask(task.id);
            }}
          >
            Delete task
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/tasks" className="inline-flex items-center gap-1 text-sm text-mist transition-colors hover:text-paper">
      <Icon name="back" size={16} /> Tasks
    </Link>
  );
}

function Stat({ label, children, accent = false }: { label: string; children: React.ReactNode; accent?: boolean }) {
  return (
    <div>
      <dt className="eyebrow text-[0.625rem]">{label}</dt>
      <dd className={`mt-1.5 font-mono text-lg tabular ${accent ? "text-lamp" : "text-paper"}`}>{children}</dd>
    </div>
  );
}

function Scale({ label, value, caption }: { label: string; value: Level; caption?: string }) {
  return (
    <div>
      <p className="eyebrow text-[0.625rem]">{label}</p>
      <div className="mt-2 flex gap-1" aria-label={`${label} ${value} of 5`} role="img">
        {[1, 2, 3, 4, 5].map((n) => (
          <span key={n} className={`h-1 flex-1 rounded-full ${n <= value ? "bg-lamp/70" : "bg-rule"}`} />
        ))}
      </div>
      {caption && <p className="mt-1.5 text-xs text-mist">{caption}</p>}
    </div>
  );
}
