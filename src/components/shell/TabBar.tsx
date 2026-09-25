"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/Icon";

const TABS: { href: string; label: string; icon: IconName; match: (p: string) => boolean }[] = [
  { href: "/", label: "Tonight", icon: "moon", match: (p) => p === "/" || p.startsWith("/route") || p.startsWith("/service") },
  { href: "/tasks", label: "Tasks", icon: "list", match: (p) => p.startsWith("/tasks") },
  { href: "/lines", label: "Lines", icon: "line", match: (p) => p.startsWith("/lines") },
  { href: "/archive", label: "Archive", icon: "ticket", match: (p) => p.startsWith("/archive") },
];

export function TabBar() {
  const pathname = usePathname();
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
          Settings
        </Link>
      </div>
    </nav>
  );
}
