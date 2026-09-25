"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
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
    <nav
      aria-label={t("shell.primaryNav")}
      className="pointer-events-none fixed inset-x-0 bottom-0 z-30 pb-[env(safe-area-inset-bottom)]"
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
  );
}
