"use client";

import Link from "next/link";
import { useState } from "react";
import { formatDuration, toDateKey } from "@/core/time";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { LineRoute, lineProgress, lineTasks } from "@/components/lines/LineRoute";
import { LineForm } from "@/components/lines/LineForm";
import { Sheet } from "@/components/ui/Sheet";
import { saveLine } from "@/state/actions";
import { useData } from "@/state/store";
import { lineHref } from "@/lib/paths";

export default function LinesPage() {
  const data = useData();
  const [creating, setCreating] = useState(false);
  const today = toDateKey(new Date());
  const lines = [...data.lines].sort((a, b) => (a.targetDate ?? "9999").localeCompare(b.targetDate ?? "9999"));

  return (
    <div className="animate-fade">
      <header className="flex items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Long-distance</p>
          <h1 className="mt-2 font-display text-5xl leading-none">Lines</h1>
        </div>
        <Button variant="primary" onClick={() => setCreating(true)}>
          <Icon name="plus" size={16} /> New line
        </Button>
      </header>
      <p className="mt-4 max-w-md text-sm leading-relaxed text-mist">
        Exams, projects and goals. Tasks on a line are spread across the days before their deadlines.
      </p>

      {lines.length === 0 && (
        <p className="mt-12 max-w-sm text-sm text-mist">No lines yet. Create one for your next exam or project.</p>
      )}

      <ul className="mt-10 space-y-14">
        {lines.map((line) => {
          const tasks = lineTasks(line, data.tasks);
          const p = lineProgress(tasks);
          return (
            <li key={line.id}>
              <Link href={lineHref(line.id)} className="group block">
                <div className="flex items-baseline justify-between gap-4">
                  <h2 className="font-mono text-sm tracking-[0.25em] text-paper transition-colors group-hover:text-lamp">
                    {line.title.toUpperCase()}
                  </h2>
                  <span className="font-mono text-xs text-mist tabular">{Math.round(p.fraction * 100)}%</span>
                </div>
                <p className="mt-1 text-xs text-haze">
                  {tasks.length} tasks · {formatDuration(p.left)} of {formatDuration(p.total)} left
                </p>
                <div className="mt-5">
                  <LineRoute line={line} tasks={tasks} today={today} />
                </div>
              </Link>
            </li>
          );
        })}
      </ul>

      <Sheet open={creating} onClose={() => setCreating(false)} title="New line" eyebrow="A long-term goal">
        <LineForm
          submitLabel="Create line"
          onCancel={() => setCreating(false)}
          onSubmit={(v) => {
            saveLine(v);
            setCreating(false);
          }}
        />
      </Sheet>
    </div>
  );
}
