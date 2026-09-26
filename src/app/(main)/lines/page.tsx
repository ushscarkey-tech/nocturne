"use client";

import Link from "next/link";
import { useState } from "react";
import { serviceDate } from "@/core/time";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import {
  LineRoute,
  lineProgress,
  lineTasks,
} from "@/components/lines/LineRoute";
import { LineForm } from "@/components/lines/LineForm";
import { Sheet } from "@/components/ui/Sheet";
import { saveLine } from "@/state/actions";
import { useData } from "@/state/store";
import { lineHref } from "@/lib/paths";
import { useI18n } from "@/i18n";

export default function LinesPage() {
  const { t, fmt } = useI18n();
  const data = useData();
  const [creating, setCreating] = useState(false);
  const today = serviceDate(new Date());
  const lines = [...data.lines].sort((a, b) =>
    (a.targetDate ?? "9999").localeCompare(b.targetDate ?? "9999"),
  );

  return (
    <div className="animate-fade">
      <header className="flex items-end justify-between gap-4">
        <div>
          <p className="eyebrow">{t("lines.longDistance")}</p>
          <h1 className="mt-2 font-display text-5xl leading-none">
            {t("lines.title")}
          </h1>
        </div>
        <Button variant="primary" onClick={() => setCreating(true)}>
          <Icon name="plus" size={16} /> {t("lines.newLine")}
        </Button>
      </header>

      {lines.length === 0 && (
        <p className="mt-12 max-w-sm text-sm text-mist">{t("lines.noLines")}</p>
      )}

      <ul className="mt-10 space-y-14 lg:grid lg:grid-cols-2 lg:gap-8 lg:space-y-0 xl:gap-10">
        {lines.map((line) => {
          const tasks = lineTasks(line, data.tasks);
          const p = lineProgress(tasks);
          return (
            <li key={line.id}>
              <Link
                href={lineHref(line.id)}
                className="group block lg:h-full lg:rounded-2xl lg:border lg:border-rule-soft lg:bg-night-850/40 lg:p-7 lg:transition-colors lg:hover:border-rule"
              >
                <div className="flex items-baseline justify-between gap-4">
                  <h2 className="font-mono text-sm tracking-[0.25em] text-paper transition-colors group-hover:text-lamp">
                    {line.title.toUpperCase()}
                  </h2>
                  <span className="font-mono text-xs text-mist tabular">
                    {Math.round(p.fraction * 100)}%
                  </span>
                </div>
                <p className="mt-1 text-xs text-haze">
                  {t("lines.tasksSummary", {
                    n: tasks.length,
                    time: fmt.duration(p.left),
                    total: fmt.duration(p.total),
                  })}
                </p>
                <div className="mt-5">
                  <LineRoute line={line} tasks={tasks} today={today} />
                </div>
              </Link>
            </li>
          );
        })}
      </ul>

      <Sheet
        open={creating}
        onClose={() => setCreating(false)}
        title={t("lines.newLine")}
        eyebrow={t("lines.aLongTermGoal")}
      >
        <LineForm
          submitLabel={t("lines.createLine")}
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
