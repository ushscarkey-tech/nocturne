"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { useQuickAdd } from "@/components/quickadd/QuickAdd";
import { useI18n } from "@/i18n";

type TabKey = "shell.tonight" | "shell.tasks" | "shell.lines" | "shell.archive";

const STOPS: { href: string; key: TabKey; match: (p: string) => boolean }[] = [
  { href: "/", key: "shell.tonight", match: (p) => p === "/" || p.startsWith("/route") || p.startsWith("/service") },
  { href: "/tasks", key: "shell.tasks", match: (p) => p.startsWith("/tasks") },
  { href: "/lines", key: "shell.lines", match: (p) => p.startsWith("/lines") },
  { href: "/archive", key: "shell.archive", match: (p) => p.startsWith("/archive") },
];

/**
 * Navigation as a transit line: four stops on one thin rail, the current
 * one lit like a platform lamp, Settings at the end of the line. No bar,
 * no sidebar — it sits in the scene like a route map on the carriage wall.
 */
export function TabBar() {
  const { t } = useI18n();
  const pathname = usePathname();
  const current = STOPS.findIndex((s) => s.match(pathname));
  const onSettings = pathname.startsWith("/settings");

  return (
    <>
    <RailNav current={current} onSettings={onSettings} />
    <nav
      aria-label={t("shell.primaryNav")}
      className="pointer-events-none fixed inset-x-0 bottom-0 z-30 pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      {/* A soft fall of darkness instead of a bar, so the line stays readable over any scene. */}
      <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-b from-transparent via-night-900/80 to-night-900" aria-hidden />
      <div className="pointer-events-auto relative mx-auto flex max-w-md items-start px-6 pb-3 pt-2 md:max-w-lg">
        <ol className="relative grid flex-1 grid-cols-4">
          {/* The rail, and the stretch already travelled up to the current stop. */}
          <span className="absolute left-[12.5%] right-[12.5%] top-[1.375rem] h-px bg-paper/15" aria-hidden />
          {current > 0 && (
            <span
              className="absolute left-[12.5%] top-[1.375rem] h-px bg-lamp/45 transition-[width] duration-700 ease-[var(--ease-glide)]"
              style={{ width: `${current * 25}%` }}
              aria-hidden
            />
          )}
          {STOPS.map((stop, i) => {
            const active = i === current;
            return (
              <li key={stop.href} className="relative flex justify-center">
                <Link
                  href={stop.href}
                  aria-current={active ? "page" : undefined}
                  className="group flex min-h-14 min-w-16 flex-col items-center gap-2 pt-4"
                >
                  <span
                    className={`relative block rounded-full border transition-[width,height,background-color,border-color,box-shadow] duration-500 ${
                      active
                        ? "h-2.5 w-2.5 border-lamp bg-lamp shadow-[0_0_12px_2px_rgba(224,176,104,0.45)]"
                        : "h-2 w-2 border-paper/45 bg-night-900 group-hover:border-paper/80"
                    }`}
                    aria-hidden
                  />
                  <span
                    className={`font-mono text-[0.625rem] uppercase tracking-[0.2em] transition-colors duration-500 ${
                      active ? "text-paper" : "text-haze group-hover:text-mist"
                    }`}
                  >
                    {t(stop.key)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
        {/* End of the line: Settings. */}
        <Link
          href="/settings"
          aria-label={t("shell.settings")}
          aria-current={onSettings ? "page" : undefined}
          className={`ml-1 flex min-h-14 w-10 items-start justify-center pt-[0.8rem] transition-colors duration-500 ${onSettings ? "text-lamp" : "text-haze hover:text-mist"}`}
        >
          <Icon name="settings" size={16} />
        </Link>
      </div>
    </nav>
    </>
  );
}

/** Rail width on wide screens; pages leave this much room on the left. */
export const RAIL = "lg:pl-60";

/**
 * On a wide screen the same line stands upright along the left edge, like
 * the route map beside a carriage door: the four stops top to bottom, a
 * way to add work, and Settings at the end of the line.
 */
function RailNav({ current, onSettings }: { current: number; onSettings: boolean }) {
  const { t } = useI18n();
  const ROW = 3; // rem per stop
  return (
    <nav aria-label={t("shell.primaryNav")} className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col px-9 pb-9 pt-10 lg:flex">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-r from-night-950/90 via-night-900/55 to-transparent" aria-hidden />
      <Link href="/" className="font-mono text-[0.6875rem] tracking-[0.4em] text-paper-dim transition-colors hover:text-paper">
        NOCTURNE
      </Link>

      <ol className="relative mt-16">
        <span className="absolute left-[0.3125rem] w-px bg-paper/15" style={{ top: `${ROW / 2}rem`, bottom: `${ROW / 2}rem` }} aria-hidden />
        {current > 0 && (
          <span
            className="absolute left-[0.3125rem] w-px bg-lamp/45 transition-[height] duration-700 ease-[var(--ease-glide)]"
            style={{ top: `${ROW / 2}rem`, height: `${current * ROW}rem` }}
            aria-hidden
          />
        )}
        {STOPS.map((stop, i) => {
          const active = i === current;
          return (
            <li key={stop.href} style={{ height: `${ROW}rem` }}>
              <Link href={stop.href} aria-current={active ? "page" : undefined} className="group flex h-full items-center gap-5">
                <span className="flex w-[0.6875rem] justify-center" aria-hidden>
                  <span
                    className={`block rounded-full border transition-[width,height,background-color,border-color,box-shadow] duration-500 ${
                      active
                        ? "h-2.5 w-2.5 border-lamp bg-lamp shadow-[0_0_12px_2px_rgba(224,176,104,0.45)]"
                        : "h-2 w-2 border-paper/45 bg-night-900 group-hover:border-paper/80"
                    }`}
                  />
                </span>
                <span
                  className={`font-mono text-[0.6875rem] uppercase tracking-[0.22em] transition-colors duration-500 ${
                    active ? "text-paper" : "text-haze group-hover:text-mist"
                  }`}
                >
                  {t(stop.key)}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>

      <div className="min-h-0 flex-1" />

      <button
        type="button"
        onClick={() => useQuickAdd.getState().show()}
        className="flex h-10 w-fit items-center gap-2.5 rounded-full border border-rule bg-night-850/70 pl-3.5 pr-4 text-sm text-paper-dim backdrop-blur transition-colors duration-500 hover:border-lamp/50 hover:text-paper"
      >
        <Icon name="plus" size={15} />
        {t("tonight.addTask")}
      </button>
      <Link
        href="/settings"
        aria-current={onSettings ? "page" : undefined}
        className={`mt-5 flex items-center gap-3 font-mono text-[0.6875rem] uppercase tracking-[0.22em] transition-colors duration-500 ${
          onSettings ? "text-lamp" : "text-haze hover:text-mist"
        }`}
      >
        <Icon name="settings" size={15} />
        {t("shell.settings")}
      </Link>
    </nav>
  );
}
