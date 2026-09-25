"use client";

import { awaitingConfirmation } from "@/core/journey";
import type { Task } from "@/core/types";
import { Button } from "@/components/ui/Button";
import { addTaskTime, completeTask } from "@/state/actions";

/**
 * When a task's estimate runs out, Nocturne asks rather than assumes:
 * finished, or does it need a little more time?
 */
export function ConfirmFinish({ tasks, compact = false }: { tasks: Task[]; compact?: boolean }) {
  const waiting = tasks.filter(awaitingConfirmation);
  if (waiting.length === 0) return null;
  return (
    <section aria-label="Planned time used up" className={compact ? "space-y-4" : "space-y-5 border-t border-rule pt-6"}>
      {waiting.map((t) => (
        <div key={t.id} className="animate-rise">
          <p className="text-sm text-paper-dim">
            <span className="text-paper">{t.title}</span> has used its planned time. Is it finished?
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => completeTask(t.id)}>
              Yes, complete
            </Button>
            <Button variant="quiet" size="sm" onClick={() => addTaskTime(t.id, 30)}>
              Needs 30 min more
            </Button>
            <Button variant="quiet" size="sm" onClick={() => addTaskTime(t.id, 60)}>
              1 hour more
            </Button>
          </div>
        </div>
      ))}
    </section>
  );
}
