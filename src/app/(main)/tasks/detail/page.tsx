"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { scheduleFor } from "@/core/allocate";
import { clock, serviceDate } from "@/core/time";
import type { Level } from "@/core/types";
import { Button } from "@/components/ui/Button";
import { MinutesInput } from "@/components/ui/controls";
import { Icon } from "@/components/ui/Icon";
import { Sheet } from "@/components/ui/Sheet";
import { TaskForm, draftFrom } from "@/components/tasks/TaskForm";
import { ConfirmFinish } from "@/components/journey/ConfirmFinish";
import { EstimateNote } from "@/components/tasks/EstimateNote";
import { useNow } from "@/lib/hooks";
import { useForecast } from "@/lib/use-planner";
import {
  completeTask,
  deleteTask,
  logProgress,
  reopenTask,
  updateTask,
} from "@/state/actions";
import { useData } from "@/state/store";
import { useI18n } from "@/i18n";

export default function TaskDetailPage() {
  return (
    <Suspense>
      <TaskDetail />
    </Suspense>
  );
}

function TaskDetail() {
  const { t, fmt } = useI18n();
  const params = useSearchParams();
  const id = params.get("id") ?? "";
  const router = useRouter();
  const data = useData();
  const now = useNow(60_000);
  const forecast = useForecast(data, now);
  const editParam = params.get("edit");
  const [editing, setEditing] = useState(
    editParam === "deadline" || editParam === "estimate",
  );
  const [logging, setLogging] = useState(false);
  const [logMinutes, setLogMinutes] = useState(30);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const task = data.tasks.find((t) => t.id === id);
  const today = serviceDate(now);

  if (!task) {
    return (
      <div className="animate-fade">
        <BackLink />
        <p className="mt-10 text-mist">{t("tasks.noTaskFound")}</p>
      </div>
    );
  }

  const line = data.lines.find((l) => l.id === task.lineId);
  const completed = task.recurrence
    ? 0
    : Math.max(0, task.estimatedMinutes - task.remainingMinutes);
  const progress =
    task.estimatedMinutes > 0 && !task.recurrence
      ? completed / task.estimatedMinutes
      : 0;
  const schedule = scheduleFor(forecast, task.id);
  const tonightStations = data.sessions
    .filter(
      (s) =>
        s.taskId === task.id &&
        s.date === today &&
        (s.status === "planned" || s.status === "active"),
    )
    .sort((a, b) => a.plannedStart.localeCompare(b.plannedStart));
  const history = data.sessions
    .filter(
      (s) =>
        s.taskId === task.id && (s.status === "done" || s.status === "partial"),
    )
    .sort((a, b) => b.plannedStart.localeCompare(a.plannedStart));
  const unscheduled = forecast.unscheduled[task.id] ?? 0;
  const later = schedule.filter((s) => s.date !== today);

  return (
    <div className="animate-fade">
      <BackLink />

      {/* Wide screens: the task at left, its schedule and past journeys at right. */}
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:grid-rows-[auto_1fr] lg:gap-x-16 xl:grid-cols-[minmax(0,1fr)_minmax(0,27rem)] xl:gap-x-24">
        <div className="lg:col-start-1 lg:row-start-1">
          <header className="mt-8">
            <p className="eyebrow">
              {task.status === "archived"
                ? t("tasks.archivedStatus")
                : task.status === "inbox"
                  ? t("tasks.inbox")
                  : task.status === "done"
                    ? t("tasks.completeStatus")
                    : line
                      ? line.title
                      : task.recurrence
                        ? t("tasks.recurring")
                        : t("tasks.task")}
            </p>
            <h1 className="mt-2 break-words font-display text-4xl leading-tight">
              {task.title}
            </h1>
            {task.description && (
              <p className="mt-3 max-w-lg text-sm leading-relaxed text-mist">
                {task.description}
              </p>
            )}
          </header>

          <dl className="mt-10 grid grid-cols-2 gap-x-8 gap-y-6 border-t border-rule-soft pt-8 sm:grid-cols-4">
            <Stat
              label={task.recurrence ? t("tasks.repeats") : t("tasks.deadline")}
            >
              {task.recurrence
                ? task.recurrence.freq === "daily"
                  ? t("tasks.daily")
                  : t("tasks.weekly")
                : task.deadline
                  ? `${fmt.shortDate(task.deadline)}`
                  : t("common.someday")}
              {task.deadline && !task.recurrence && (
                <span className="block text-xs text-mist">
                  {fmt.relativeDay(today, task.deadline)}
                </span>
              )}
            </Stat>
            <Stat
              label={
                task.recurrence ? t("tasks.eachTime") : t("tasks.estimated")
              }
            >
              {fmt.duration(task.estimatedMinutes)}
            </Stat>
            {!task.recurrence && (
              <Stat label={t("tasks.completed")}>
                {fmt.duration(completed)}
              </Stat>
            )}
            {!task.recurrence && (
              <Stat label={t("tasks.remainingTime")} accent>
                {fmt.duration(task.remainingMinutes)}
              </Stat>
            )}
          </dl>
          {progress > 0 && (
            <div
              className="mt-6 h-px w-full bg-rule"
              role="progressbar"
              aria-valuenow={Math.round(progress * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Progress"
            >
              <div
                className="h-px bg-lamp transition-[width] duration-1000"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
          )}

          <div className="mt-8 space-y-4">
            <ConfirmFinish tasks={[task]} compact />
            <EstimateNote taskId={task.id} />
          </div>

          <section
            className="mt-10 grid grid-cols-3 gap-6"
            aria-label={t("tasks.howTaskFeel")}
          >
            <Scale
              label={t("tasks.interest")}
              value={task.interest}
              caption={t(`common.interest.${task.interest}` as const)}
            />
            <Scale label={t("tasks.difficulty")} value={task.difficulty} />
            <Scale label={t("tasks.importance")} value={task.importance} />
          </section>
        </div>

        <aside className="lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:pt-8">
          {task.status === "active" && (
            <section
              className="mt-12 lg:mt-0 lg:rounded-2xl lg:border lg:border-rule-soft lg:bg-night-850/40 lg:p-6"
              aria-labelledby="schedule-title"
            >
              <h2 id="schedule-title" className="eyebrow">
                {t("tasks.scheduled")}
              </h2>
              {unscheduled > 0 && (
                <p className="mt-3 text-sm text-signal">
                  {fmt.duration(unscheduled)} doesn&rsquo;t fit before the
                  deadline yet.{" "}
                  <Link
                    href="/service"
                    className="underline underline-offset-4"
                  >
                    Add Service Time
                  </Link>
                </p>
              )}
              <ul className="mt-3 divide-y divide-rule-soft">
                {tonightStations.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between py-3 text-sm"
                  >
                    <span className="text-paper">
                      {t("tasks.tonight", { at: clock(s.plannedStart) })}
                    </span>
                    <span className="font-mono text-xs text-mist tabular">
                      {fmt.duration(s.plannedMinutes)}
                    </span>
                  </li>
                ))}
                {later.slice(0, 8).map((s) => (
                  <li
                    key={s.date}
                    className="flex items-center justify-between py-3 text-sm"
                  >
                    <span className="text-paper-dim">
                      {fmt.relativeDay(today, s.date)}
                      <span className="ml-2 text-xs text-haze">
                        {fmt.shortDate(s.date)}
                      </span>
                    </span>
                    <span className="font-mono text-xs text-mist tabular">
                      {fmt.duration(s.minutes)}
                    </span>
                  </li>
                ))}
                {tonightStations.length === 0 &&
                  later.length === 0 &&
                  unscheduled === 0 && (
                    <li className="py-3 text-sm text-mist">
                      {t("tasks.nothingScheduled")}
                    </li>
                  )}
              </ul>
            </section>
          )}

          {history.length > 0 && (
            <section
              className="mt-12 lg:mt-6 lg:rounded-2xl lg:border lg:border-rule-soft lg:bg-night-850/40 lg:p-6"
              aria-labelledby="history-title"
            >
              <h2 id="history-title" className="eyebrow">
                {t("tasks.journeys")}
              </h2>
              <ul className="mt-3 divide-y divide-rule-soft">
                {history.slice(0, 8).map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between py-3 text-sm"
                  >
                    <span className="text-paper-dim">
                      {fmt.shortDate(s.date)}{" "}
                      <span className="ml-2 text-xs text-haze">
                        {fmt.station(s.stationName)}
                      </span>
                    </span>
                    <span className="font-mono text-xs text-mist tabular">
                      {fmt.duration(s.completedMinutes)}
                      {s.status === "partial" ? " · " + t("tasks.partial") : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>

        {task.status !== "archived" && (
          <div className="mt-12 flex flex-wrap gap-3 border-t border-rule-soft pt-8 lg:col-start-1 lg:row-start-2 lg:self-start">
            <Button variant="secondary" onClick={() => setEditing(true)}>
              {t("tasks.edit")}
            </Button>
            {task.status === "active" && !task.recurrence && (
              <Button variant="secondary" onClick={() => setLogging(true)}>
                {t("tasks.logProgress")}
              </Button>
            )}
            {task.status !== "done" ? (
              <Button variant="secondary" onClick={() => completeTask(task.id)}>
                <Icon name="check" size={16} /> {t("tasks.markComplete")}
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => reopenTask(task.id)}>
                {t("tasks.reopenButton")}
              </Button>
            )}
            <Button
              variant="ghost"
              onClick={() => setConfirmDelete(true)}
              className="ml-auto"
            >
              {t("common.delete")}
            </Button>
          </div>
        )}
      </div>

      <Sheet
        open={editing}
        onClose={() => setEditing(false)}
        title={t("tasks.editingTitle")}
        eyebrow={task.title}
      >
        <TaskForm
          initial={draftFrom(task)}
          lines={data.lines}
          submitLabel={t("tasks.saveChanges")}
          focusField={editParam === "deadline" ? "deadline" : null}
          onCancel={() => setEditing(false)}
          onSubmit={(d) => {
            updateTask(task.id, d);
            setEditing(false);
          }}
        />
      </Sheet>

      <Sheet
        open={logging}
        onClose={() => setLogging(false)}
        title={t("tasks.logProgress")}
        eyebrow={t("tasks.logWorkDone")}
      >
        <p className="text-sm text-mist">{t("tasks.logHelp")}</p>
        <div className="mt-6 flex justify-center">
          <MinutesInput
            label={t("tasks.logLabel")}
            value={logMinutes}
            onChange={setLogMinutes}
            step={5}
            min={5}
            max={task.remainingMinutes}
          />
        </div>
        <div className="mt-8 flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setLogging(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              logProgress(task.id, logMinutes);
              setLogging(false);
            }}
          >
            Log {fmt.duration(logMinutes)}
          </Button>
        </div>
      </Sheet>

      <Sheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={t("tasks.deleteQuestion")}
        eyebrow={task.title}
      >
        <p className="text-sm leading-relaxed text-mist">
          {t("tasks.deleteInfo")}
        </p>
        <div className="mt-8 flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
            {t("tasks.keepIt")}
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              router.push("/tasks");
              deleteTask(task.id);
            }}
          >
            {t("tasks.deleteTask")}
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

function BackLink() {
  const { t } = useI18n();
  return (
    <Link
      href="/tasks"
      className="inline-flex items-center gap-1 text-sm text-mist transition-colors hover:text-paper"
    >
      <Icon name="back" size={16} /> {t("tasks.back")}
    </Link>
  );
}

function Stat({
  label,
  children,
  accent = false,
}: {
  label: string;
  children: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div>
      <dt className="eyebrow text-[0.625rem]">{label}</dt>
      <dd
        className={`mt-1.5 font-mono text-lg tabular ${accent ? "text-lamp" : "text-paper"}`}
      >
        {children}
      </dd>
    </div>
  );
}

function Scale({
  label,
  value,
  caption,
}: {
  label: string;
  value: Level;
  caption?: string;
}) {
  const { t } = useI18n();
  return (
    <div>
      <p className="eyebrow text-[0.625rem]">{label}</p>
      <div
        className="mt-2 flex gap-1"
        aria-label={t("common.levelOf", { label, n: value })}
        role="img"
      >
        {[1, 2, 3, 4, 5].map((n) => (
          <span
            key={n}
            className={`h-1 flex-1 rounded-full ${n <= value ? "bg-lamp/70" : "bg-rule"}`}
          />
        ))}
      </div>
      {caption && <p className="mt-1.5 text-xs text-mist">{caption}</p>}
    </div>
  );
}
