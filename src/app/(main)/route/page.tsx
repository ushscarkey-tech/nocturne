"use client";

import Link from "next/link";
import { useState } from "react";
import { journeyFor } from "@/core/journey";
import { clock, formatDuration, toDateKey } from "@/core/time";
import type { FocusLevel } from "@/core/types";
import { Button, ButtonLink } from "@/components/ui/Button";
import { FocusPicker } from "@/components/ui/controls";
import { Icon } from "@/components/ui/Icon";
import { Sheet } from "@/components/ui/Sheet";
import { RouteEditor } from "@/components/route/RouteEditor";
import { useNow } from "@/lib/hooks";
import { routeItems, routeSummary, type RouteItem } from "@/lib/route-view";
import { doNow, moveSessionTo, optimizeRoute, reorderRoute, resizeSession, skipToday, toggleLock } from "@/state/actions";
import { useData } from "@/state/store";
import { taskHref } from "@/lib/paths";

type StationItem = Extract<RouteItem, { kind: "station" }>;

export default function RoutePage() {
  const data = useData();
  const now = useNow(30_000);
  const today = toDateKey(now);
  const items = routeItems(data, today);
  const summary = routeSummary(data, today);
  const journey = journeyFor(data, today);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [optimizing, setOptimizing] = useState(false);
  const [focus, setFocus] = useState<FocusLevel>(journey?.focus ?? "steady");
  const selected = items.find((i): i is StationItem => i.kind === "station" && i.session.id === selectedId) ?? null;
  const riding = journey && journey.startedAt && journey.phase !== "final";
  const nightOver = journey?.phase === "final";

  return (
    <div className="animate-fade">
      <Link href="/" className="inline-flex items-center gap-1 text-sm text-mist hover:text-paper">
        <Icon name="back" size={16} /> Tonight
      </Link>

      <header className="mt-8 flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="eyebrow">Tonight&rsquo;s line</p>
          <h1 className="mt-2 font-display text-5xl leading-none">Route</h1>
          {summary.departure && summary.arrival && (
            <p className="mt-4 font-mono text-sm tabular text-paper-dim">
              {clock(summary.departure)} <span className="text-haze">→</span> {clock(summary.arrival)}
              <span className="ml-3 text-mist">
                {summary.stations} stations · {formatDuration(summary.plannedMinutes)}
              </span>
            </p>
          )}
        </div>
        {!nightOver && summary.remaining > 0 && (
          <Button variant="secondary" size="sm" onClick={() => setOptimizing(true)}>
            <Icon name="spark" size={15} /> Optimize route
          </Button>
        )}
      </header>

      {items.length === 0 ? (
        <p className="mt-12 text-sm text-mist">No stations tonight.</p>
      ) : (
        <div className="mt-10">
          <RouteEditor items={items} onReorder={reorderRoute} onOpen={(item) => setSelectedId(item.session.id)} />
          <p className="mt-6 text-xs leading-relaxed text-haze">
            Drag stations to reorder. Locked stations keep their time when the route adjusts.
          </p>
        </div>
      )}

      {!nightOver && summary.next && (
        <div className="mt-10">
          <ButtonLink href="/journey" variant="primary" size="lg">
            {riding ? "Return to Journey" : "Board Train"}
          </ButtonLink>
        </div>
      )}

      <Sheet open={optimizing} onClose={() => setOptimizing(false)} title="Optimize route" eyebrow="How are you tonight?">
        <p className="mb-6 text-sm leading-relaxed text-mist">
          Nocturne rebuilds the stations that haven&rsquo;t started around deadlines and your focus. Completed and locked
          stations stay where they are.
        </p>
        <FocusPicker value={focus} onChange={setFocus} size="lg" />
        <div className="mt-8 flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setOptimizing(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              optimizeRoute(focus);
              setOptimizing(false);
            }}
          >
            Optimize
          </Button>
        </div>
      </Sheet>

      {selected && <StationSheet item={selected} onClose={() => setSelectedId(null)} />}
    </div>
  );
}

function StationSheet({ item, onClose }: { item: StationItem; onClose: () => void }) {
  const s = item.session;
  const [time, setTime] = useState(clock(s.plannedStart));
  const editable = s.status === "planned";

  const act = (fn: () => void, close = false) => () => {
    fn();
    if (close) onClose();
  };

  return (
    <Sheet open onClose={onClose} title={item.task?.title ?? "Station"} eyebrow={`${s.stationName} · ${clock(s.plannedStart)} · ${formatDuration(s.plannedMinutes)}`}>
      {editable ? (
        <div className="space-y-8">
          <div className="grid grid-cols-2 gap-3">
            <Button variant="secondary" onClick={act(() => doNow(s.id), true)}>
              <Icon name="play" size={15} /> Do next
            </Button>
            <Button variant="secondary" onClick={act(() => toggleLock(s.id))}>
              <Icon name={s.locked ? "unlock" : "lock"} size={15} /> {s.locked ? "Unlock" : "Lock time"}
            </Button>
          </div>

          <div>
            <p className="eyebrow">Length</p>
            <div className="mt-3 flex items-center justify-between gap-2">
              <Button variant="quiet" size="sm" onClick={act(() => resizeSession(s.id, -15))} aria-label="Shorten by 15 minutes">
                −15
              </Button>
              <Button variant="quiet" size="sm" onClick={act(() => resizeSession(s.id, -5))} aria-label="Shorten by 5 minutes">
                −5
              </Button>
              <span className="font-mono text-lg tabular" aria-live="polite">
                {formatDuration(s.plannedMinutes)}
              </span>
              <Button variant="quiet" size="sm" onClick={act(() => resizeSession(s.id, 5))} aria-label="Extend by 5 minutes">
                +5
              </Button>
              <Button variant="quiet" size="sm" onClick={act(() => resizeSession(s.id, 15))} aria-label="Extend by 15 minutes">
                +15
              </Button>
            </div>
          </div>

          <div>
            <label className="eyebrow" htmlFor="move-time">
              Move to a set time
            </label>
            <div className="mt-2 flex items-end gap-3">
              <input
                id="move-time"
                type="time"
                step={300}
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="field max-w-36 font-mono text-lg"
              />
              <Button variant="secondary" size="sm" onClick={act(() => moveSessionTo(s.id, time), true)}>
                Move & lock
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-rule-soft pt-6">
            <Link href={taskHref(s.taskId)} className="text-sm text-mist hover:text-paper">
              Open task
            </Link>
            <Button variant="ghost" onClick={act(() => skipToday(s.id), true)}>
              Skip today
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <p className="text-sm text-mist">
            {s.status === "active" ? "This station is under way." : "This station is complete and stays on the record."}
          </p>
          <Link href={taskHref(s.taskId)} className="text-sm text-paper underline decoration-rule underline-offset-4">
            Open task
          </Link>
        </div>
      )}
    </Sheet>
  );
}
