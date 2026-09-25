"use client";

import type { ReactNode } from "react";
import { clock, formatDuration } from "@/core/time";
import type { RouteItem } from "@/lib/route-view";
import { Icon } from "@/components/ui/Icon";

/**
 * The vertical train line. Stations are filled dots, stops are hollow,
 * a service pause breaks the line. Pure presentation.
 */
export function RouteLine({
  items,
  compact = false,
  renderActions,
  highlightId,
}: {
  items: RouteItem[];
  compact?: boolean;
  renderActions?: (item: Extract<RouteItem, { kind: "station" }>) => ReactNode;
  highlightId?: string | null;
}) {
  return (
    <ol className="relative" aria-label="Route">
      {items.map((item, i) => (
        <RouteRow
          key={item.kind === "station" ? item.session.id : item.key}
          item={item}
          first={i === 0}
          last={i === items.length - 1}
          compact={compact}
          actions={item.kind === "station" ? renderActions?.(item) : null}
          highlight={item.kind === "station" && item.session.id === highlightId}
        />
      ))}
    </ol>
  );
}

export function RouteRow({
  item,
  first,
  last,
  compact,
  actions,
  highlight,
  rowProps,
}: {
  item: RouteItem;
  first: boolean;
  last: boolean;
  compact: boolean;
  actions: ReactNode;
  highlight: boolean;
  rowProps?: React.LiHTMLAttributes<HTMLLIElement> & { ref?: React.Ref<HTMLLIElement> };
}) {
  if (item.kind === "stop") {
    return (
      <li className="grid grid-cols-[3.25rem_1.5rem_1fr]" aria-label={`Station stop, ${item.minutes} minutes`}>
        <span />
        <Rail first={first} last={last}>
          <span className="h-2 w-2 rounded-full border border-haze bg-night-900" />
        </Rail>
        <p className={`eyebrow self-center text-haze ${compact ? "py-2" : "py-3"}`}>
          Station stop · {formatDuration(item.minutes)}
        </p>
      </li>
    );
  }
  if (item.kind === "pause") {
    return (
      <li className="grid grid-cols-[3.25rem_1.5rem_1fr]" aria-label={`Service paused until ${clock(item.until)}`}>
        <span />
        <div className="relative flex h-full min-h-12 justify-center" aria-hidden>
          <span className="absolute top-0 h-3 w-px bg-rule" />
          <span className="absolute top-1/2 h-px w-3 bg-haze" />
          <span className="absolute bottom-0 h-3 w-px bg-rule" />
        </div>
        <p className="eyebrow self-center py-4 text-haze">Service paused · resumes {clock(item.until)}</p>
      </li>
    );
  }

  const { session: s, task } = item;
  const done = s.status === "done" || s.status === "partial";
  const active = s.status === "active";
  return (
    <li
      {...rowProps}
      className={`group grid grid-cols-[3.25rem_1.5rem_1fr] transition-colors duration-700 ${highlight ? "animate-rise" : ""} ${rowProps?.className ?? ""}`}
    >
      <time
        dateTime={s.plannedStart}
        className={`pt-[0.95rem] font-mono text-xs tabular ${done ? "text-haze" : active ? "text-lamp" : "text-mist"}`}
      >
        {clock(s.plannedStart)}
      </time>
      <Rail first={first} last={last}>
        <span
          className={`relative mt-[1.1rem] h-2.5 w-2.5 self-start rounded-full transition-colors duration-700 ${
            active
              ? "bg-lamp shadow-[0_0_14px_2px_rgba(224,176,104,0.45)]"
              : done
                ? "bg-haze"
                : "bg-paper"
          }`}
        >
          {active && <span className="absolute inset-0 animate-ping rounded-full bg-lamp/40" />}
        </span>
      </Rail>
      <div className={`flex min-w-0 items-start justify-between gap-3 ${compact ? "py-2.5" : "py-3.5"}`}>
        <div className="min-w-0">
          <p className={`eyebrow ${active ? "text-lamp/90" : ""}`}>
            {s.stationName}
            {s.locked && (
              <span className="ml-2 inline-flex translate-y-[1px] text-mist" title="Locked">
                <Icon name="lock" size={11} aria-label="Locked" />
              </span>
            )}
          </p>
          <p className={`mt-1 truncate ${compact ? "text-[0.95rem]" : "text-base"} ${done ? "text-mist line-through decoration-haze/60" : "text-paper"}`}>
            {task?.title ?? "Removed task"}
          </p>
          <p className="mt-0.5 text-xs text-mist tabular">
            {done
              ? `${formatDuration(s.completedMinutes)} ${s.status === "partial" ? "· continued later" : "completed"}`
              : active
                ? `Now · ${formatDuration(s.plannedMinutes)}`
                : formatDuration(s.plannedMinutes)}
          </p>
        </div>
        {actions}
      </div>
    </li>
  );
}

export function Rail({ first, last, children }: { first: boolean; last: boolean; children: ReactNode }) {
  return (
    <div className="relative flex items-center justify-center" aria-hidden>
      <span className={`absolute w-px bg-rule ${first ? "top-[1.1rem]" : "top-0"} ${last ? "h-[1.1rem]" : "bottom-0"}`} />
      {children}
    </div>
  );
}
