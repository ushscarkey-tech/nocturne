"use client";

import Link from "next/link";
import { useState } from "react";
import { journeyFor } from "@/core/journey";
import { clock, serviceDate } from "@/core/time";
import type { FocusLevel } from "@/core/types";
import { Button, ButtonLink } from "@/components/ui/Button";
import { FocusPicker } from "@/components/ui/controls";
import { Icon } from "@/components/ui/Icon";
import { Sheet } from "@/components/ui/Sheet";
import { RouteEditor } from "@/components/route/RouteEditor";
import { useNow } from "@/lib/hooks";
import { routeItems, routeSummary, type RouteItem } from "@/lib/route-view";
import {
  doNow,
  moveSessionTo,
  optimizeRoute,
  reorderRoute,
  resizeSession,
  skipToday,
  toggleLock,
} from "@/state/actions";
import { useData } from "@/state/store";
import { taskHref } from "@/lib/paths";
import { useI18n } from "@/i18n";

type StationItem = Extract<RouteItem, { kind: "station" }>;

export default function RoutePage() {
  const { t, fmt } = useI18n();
  const data = useData();
  const now = useNow(30_000);
  const today = serviceDate(now);
  const items = routeItems(data, today);
  const summary = routeSummary(data, today);
  const journey = journeyFor(data, today);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [optimizing, setOptimizing] = useState(false);
  const [focus, setFocus] = useState<FocusLevel>(journey?.focus ?? "steady");
  const selected =
    items.find(
      (i): i is StationItem =>
        i.kind === "station" && i.session.id === selectedId,
    ) ?? null;
  const riding = journey && journey.startedAt && journey.phase !== "final";
  const nightOver = journey?.phase === "final";

  return (
    <div className="animate-fade">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-mist hover:text-paper"
      >
        <Icon name="back" size={16} /> {t("shell.tonight")}
      </Link>

      <header className="mt-8 flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="eyebrow">{t("route.line")}</p>
          <h1 className="mt-2 font-display text-5xl leading-none">
            {t("route.routeTitle")}
          </h1>
          {summary.departure && summary.arrival && (
            <p className="mt-4 font-mono text-sm tabular text-paper-dim lg:hidden">
              {clock(summary.departure)} <span className="text-haze">→</span>{" "}
              {clock(summary.arrival)}
              <span className="ml-3 text-mist">
                {t("common.nStations", { n: summary.stations })} ·{" "}
                {fmt.duration(summary.plannedMinutes)}
              </span>
            </p>
          )}
        </div>
        {!nightOver && summary.remaining > 0 && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setOptimizing(true)}
          >
            <Icon name="spark" size={15} /> {t("route.optimizeRoute")}
          </Button>
        )}
      </header>

      {/* Wide screens: the stations at left, the night at a glance at right. */}
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-x-16 xl:grid-cols-[minmax(0,1fr)_23rem] xl:gap-x-24">
        {items.length === 0 ? (
          <p className="mt-12 text-sm text-mist">{t("route.noStations")}</p>
        ) : (
          <div className="mt-10">
            <RouteEditor
              items={items}
              onReorder={reorderRoute}
              onOpen={(item) => setSelectedId(item.session.id)}
            />
            <p className="mt-6 text-xs leading-relaxed text-haze">
              {t("route.dragToReorder")}
            </p>
          </div>
        )}

        {(summary.departure || (!nightOver && summary.next)) && (
          <aside className="mt-10 lg:sticky lg:top-16 lg:rounded-2xl lg:border lg:border-rule-soft lg:bg-night-850/50 lg:p-7">
            {summary.departure && summary.arrival && (
              <div className="hidden lg:block">
                <p className="font-mono text-[2.5rem] font-extralight leading-none tabular text-lamp">
                  {clock(summary.departure)}
                  <span className="px-3 text-2xl text-haze">→</span>
                  <span className="text-paper">{clock(summary.arrival)}</span>
                </p>
                <p className="mt-3 font-mono text-sm tabular text-mist">
                  {t("common.nStations", { n: summary.stations })} ·{" "}
                  {fmt.duration(summary.plannedMinutes)}
                </p>
              </div>
            )}
            {!nightOver && summary.next && (
              <ButtonLink
                href="/journey"
                variant="primary"
                size="lg"
                className="lg:mt-8 lg:w-full"
              >
                {riding ? t("route.returnToJourney") : t("route.boardTrain")}
              </ButtonLink>
            )}
          </aside>
        )}
      </div>

      <Sheet
        open={optimizing}
        onClose={() => setOptimizing(false)}
        title={t("route.optimizeRoute")}
        eyebrow={t("route.howAreYouTonight")}
      >
        <p className="mb-6 text-sm leading-relaxed text-mist">
          {t("route.optimizeHelp")}
        </p>
        <FocusPicker
          value={focus}
          onChange={setFocus}
          size="lg"
          label={t("route.howAreYouTonight")}
        />
        <div className="mt-8 flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setOptimizing(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              optimizeRoute(focus);
              setOptimizing(false);
            }}
          >
            {t("route.optimizeRoute")}
          </Button>
        </div>
      </Sheet>

      {selected && (
        <StationSheet item={selected} onClose={() => setSelectedId(null)} />
      )}
    </div>
  );
}

function StationSheet({
  item,
  onClose,
}: {
  item: StationItem;
  onClose: () => void;
}) {
  const { t, fmt } = useI18n();
  const s = item.session;
  const [time, setTime] = useState(clock(s.plannedStart));
  const editable = s.status === "planned";

  const act =
    (fn: () => void, close = false) =>
    () => {
      fn();
      if (close) onClose();
    };

  return (
    <Sheet
      open
      onClose={onClose}
      title={item.task?.title ?? "Station"}
      eyebrow={`${fmt.station(s.stationName)} · ${clock(s.plannedStart)} · ${fmt.duration(s.plannedMinutes)}`}
    >
      {editable ? (
        <div className="space-y-8">
          <div className="grid grid-cols-2 gap-3">
            <Button variant="secondary" onClick={act(() => doNow(s.id), true)}>
              <Icon name="play" size={15} /> {t("route.doNext")}
            </Button>
            <Button variant="secondary" onClick={act(() => toggleLock(s.id))}>
              <Icon name={s.locked ? "unlock" : "lock"} size={15} />{" "}
              {s.locked ? t("route.unlockTime") : t("route.lockTime")}
            </Button>
          </div>

          <div>
            <p className="eyebrow">{t("route.length")}</p>
            <div className="mt-3 flex items-center justify-between gap-2">
              <Button
                variant="quiet"
                size="sm"
                onClick={act(() => resizeSession(s.id, -15))}
                aria-label={t("route.shortenBy", { n: 15 })}
              >
                −15
              </Button>
              <Button
                variant="quiet"
                size="sm"
                onClick={act(() => resizeSession(s.id, -5))}
                aria-label={t("route.shortenBy", { n: 5 })}
              >
                −5
              </Button>
              <span className="font-mono text-lg tabular" aria-live="polite">
                {fmt.duration(s.plannedMinutes)}
              </span>
              <Button
                variant="quiet"
                size="sm"
                onClick={act(() => resizeSession(s.id, 5))}
                aria-label={t("route.extendBy", { n: 5 })}
              >
                +5
              </Button>
              <Button
                variant="quiet"
                size="sm"
                onClick={act(() => resizeSession(s.id, 15))}
                aria-label={t("route.extendBy", { n: 15 })}
              >
                +15
              </Button>
            </div>
          </div>

          <div>
            <label className="eyebrow" htmlFor="move-time">
              {t("route.moveToTime")}
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
              <Button
                variant="secondary"
                size="sm"
                onClick={act(() => moveSessionTo(s.id, time), true)}
              >
                {t("route.moveAndLock")}
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-rule-soft pt-6">
            <Link
              href={taskHref(s.taskId)}
              className="text-sm text-mist hover:text-paper"
            >
              {t("route.openTask")}
            </Link>
            <Button variant="ghost" onClick={act(() => skipToday(s.id), true)}>
              {t("route.skipToday")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <p className="text-sm text-mist">
            {s.status === "active"
              ? t("route.underWay")
              : t("route.completeRecord")}
          </p>
          <Link
            href={taskHref(s.taskId)}
            className="text-sm text-paper underline decoration-rule underline-offset-4"
          >
            {t("route.openTask")}
          </Link>
        </div>
      )}
    </Sheet>
  );
}
