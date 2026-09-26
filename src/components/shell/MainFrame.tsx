"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Scenes fill the viewport and never scroll; management screens keep a
 * reading column on phones and open into columns beside the rail on wide screens.
 */
export function MainFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/") {
    return <main className="relative h-dvh w-full overflow-hidden">{children}</main>;
  }
  return (
    <main className="mx-auto min-h-dvh w-full max-w-2xl px-6 pb-[calc(7.5rem+env(safe-area-inset-bottom))] pt-[max(2.5rem,env(safe-area-inset-top))] md:px-10 md:pt-14 lg:ml-60 lg:mr-0 lg:max-w-[76rem] lg:px-16 lg:pb-20 lg:pt-16 xl:px-20">
      {children}
    </main>
  );
}
