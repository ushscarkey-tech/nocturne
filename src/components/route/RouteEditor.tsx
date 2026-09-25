"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useRef, useState } from "react";
import { useFlip } from "@/lib/hooks";
import type { RouteItem } from "@/lib/route-view";
import { Icon } from "@/components/ui/Icon";
import { useI18n } from "@/i18n";
import { RouteRow, routeSignature } from "./RouteLine";

type StationItem = Extract<RouteItem, { kind: "station" }>;

/**
 * Tonight's route with drag-to-reorder for stations that haven't started
 * and aren't locked. Keyboard: focus a handle, Space to lift, arrows to move.
 */
export function RouteEditor({
  items,
  onReorder,
  onOpen,
}: {
  items: RouteItem[];
  onReorder: (orderedIds: string[]) => void;
  onOpen: (item: StationItem) => void;
}) {
  const [dragging, setDragging] = useState<string | null>(null);
  // The frame after a drop is already in place; don't animate it again.
  const [settling, setSettling] = useState(false);
  const movable = items
    .filter((i): i is StationItem => i.kind === "station" && i.session.status === "planned" && !i.session.locked)
    .map((i) => i.session.id);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragStart(e: DragStartEvent) {
    setDragging(String(e.active.id));
  }

  function onDragEnd(e: DragEndEvent) {
    setDragging(null);
    setSettling(true);
    requestAnimationFrame(() => requestAnimationFrame(() => setSettling(false)));
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = movable.indexOf(String(active.id));
    const to = movable.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    onReorder(arrayMove(movable, from, to));
  }

  // While dragging, stops collapse so stations line up cleanly.
  const visible = dragging ? items.filter((i) => i.kind === "station") : items;
  const listRef = useRef<HTMLOListElement>(null);
  useFlip(listRef, routeSignature(visible), !!dragging || settling);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDragging(null)}
      accessibility={{
        screenReaderInstructions: {
          draggable: "To reorder a station, press space or enter to pick it up, use the arrow keys to move it, and press space or enter again to drop it.",
        },
      }}
    >
      <SortableContext items={movable} strategy={verticalListSortingStrategy}>
        <ol ref={listRef} className="relative" aria-label="Tonight's route">
          {visible.map((item, i) => {
            const first = i === 0;
            const last = i === visible.length - 1;
            if (item.kind === "station" && movable.includes(item.session.id)) {
              return <SortableStation key={item.session.id} item={item} first={first} last={last} onOpen={onOpen} />;
            }
            return (
              <RouteRow
                key={item.kind === "station" ? item.session.id : item.key}
                item={item}
                first={first}
                last={last}
                compact={false}
                highlight={false}
                actions={item.kind === "station" ? <MoreButton item={item} onOpen={onOpen} /> : null}
              />
            );
          })}
        </ol>
      </SortableContext>
    </DndContext>
  );
}

function SortableStation({
  item,
  first,
  last,
  onOpen,
}: {
  item: StationItem;
  first: boolean;
  last: boolean;
  onOpen: (item: StationItem) => void;
}) {
  const { t } = useI18n();
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: item.session.id,
  });
  return (
    <RouteRow
      item={item}
      first={first}
      last={last}
      compact={false}
      highlight={false}
      rowProps={{
        ref: setNodeRef,
        style: { transform: CSS.Translate.toString(transform), transition },
        className: isDragging ? "relative z-10 rounded-xl bg-night-800/90 shadow-[0_18px_40px_-18px_rgba(0,0,0,0.9)]" : "",
      }}
      actions={
        <div className="flex shrink-0 items-center">
          <MoreButton item={item} onOpen={onOpen} />
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            aria-label={t("route.reorder", { task: item.task?.title ?? "station" })}
            className="flex h-11 w-10 cursor-grab touch-none items-center justify-center rounded-lg text-haze transition-colors hover:text-paper active:cursor-grabbing"
          >
            <Icon name="grip" size={18} />
          </button>
        </div>
      }
    />
  );
}

function MoreButton({ item, onOpen }: { item: StationItem; onOpen: (item: StationItem) => void }) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      aria-label={t("route.options", { task: item.task?.title ?? "station" })}
      className="flex h-11 w-10 items-center justify-center rounded-lg text-haze transition-colors hover:text-paper"
    >
      <Icon name="dots" size={18} />
    </button>
  );
}
