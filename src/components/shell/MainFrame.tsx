"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** Scenes fill the viewport and never scroll; management screens keep a reading column. */
export function MainFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/") {
    return <main className="relative h-dvh w-full overflow-hidden md:pl-56">{children}</main>;
  }
  return (
    <div className="md:pl-56">
      <main className="mx-auto min-h-dvh w-full max-w-2xl px-6 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-[max(2.5rem,env(safe-area-inset-top))] md:px-10 md:pb-16 md:pt-14">
        {children}
      </main>
    </div>
  );
}
