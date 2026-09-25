"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/Icon";
import { useI18n } from "@/i18n";

type TabKey = "shell.tonight" | "shell.tasks" | "shell.lines" | "shell.archive";

const TAB_KEYS = [
  { href: "/", key: "shell.tonight" as TabKey, icon: "moon" as IconName, match: (p: string) => p === "/" || p.startsWith("/route") || p.startsWith("/service") },
  { href: "/tasks", key: "shell.tasks" as TabKey, icon: "list" as IconName, match: (p: string) => p.startsWith("/tasks") },
  { href: "/lines", key: "shell.lines" as TabKey, icon: "line" as IconName, match: (p: string) => p.startsWith("/lines") },
  { href: "/archive", key: "shell.archive" as TabKey, icon: "ticket" as IconName, match: (p: string) => p.startsWith("/archive") },
];

export function TabBar() {
  const { t } = useI18n();
  const pathname = usePathname();
  const TABS = TAB_KEYS.map((tab) => {
    const label = (() => {
      switch (tab.key) {
        case "shell.tonight":
          return t("shell.tonight");
        case "shell.tasks":
          return t("shell.tasks");
        case "shell.lines":
          return t("shell.lines");
        case "shell.archive":
          return t("shell.archive");
      }
    })();
    return { ...tab, label };
  });
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-rule-soft bg-night-900/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:inset-y-0 md:left-0 md:right-auto md:w-56 md:border-r md:border-t-0 md:bg-transparent md:pb-0 md:backdrop-blur-none"
    >
      <div className="hidden px-7 pb-10 pt-9 md:block">
        <p className="font-mono text-xs tracking-[0.4em] text-paper-dim">NOCTURNE</p>
      </div>
      <ul className="mx-auto flex max-w-md justify-around md:max-w-none md:flex-col md:gap-1 md:px-4">
        {TABS.map((t) => {
          const active = t.match(pathname);
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-1 px-4 py-2.5 text-[0.6875rem] tracking-wide transition-colors duration-500 md:flex-row md:gap-3 md:rounded-xl md:px-3 md:text-sm ${
                  active ? "text-paper" : "text-haze hover:text-mist"
                }`}
              >
                <span className="relative">
                  <Icon name={t.icon} size={20} />
                  {active && <span className="absolute -bottom-1.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-lamp md:hidden" />}
                </span>
                <span>{t.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="absolute bottom-8 left-0 hidden w-full px-4 md:block">
        <Link
          href="/settings"
          className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
            pathname.startsWith("/settings") ? "text-paper" : "text-haze hover:text-mist"
          }`}
        >
          <Icon name="settings" size={18} />
          {t("shell.settings")}
        </Link>
      </div>
    </nav>
  );
}
