"use client";

import { useEffect } from "react";
import { useStore } from "@/state/store";
import { Icon } from "@/components/ui/Icon";

/** "Route updated" and other quiet announcements. */
export function NoticeToast({ placement = "tabs" }: { placement?: "tabs" | "immersive" }) {
  const notice = useStore((s) => s.notice);
  const dismiss = useStore((s) => s.dismissNotice);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(dismiss, notice.tone === "error" ? 12_000 : 9_000);
    return () => clearTimeout(t);
  }, [notice, dismiss]);

  return (
    <div
      aria-live="polite"
      className={`pointer-events-none fixed inset-x-0 z-40 flex justify-center px-4 ${
        placement === "tabs" ? "bottom-[calc(5.5rem+env(safe-area-inset-bottom))] md:bottom-8 md:left-56" : "top-[max(3.5rem,calc(env(safe-area-inset-top)+3rem))]"
      }`}
    >
      {notice && (
        <div
          key={notice.id}
          role="status"
          className="pointer-events-auto w-full max-w-md animate-rise rounded-2xl border border-rule bg-night-850/95 px-5 py-4 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8)] backdrop-blur"
        >
          <div className="flex items-start gap-3">
            <span
              className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${notice.tone === "error" ? "bg-signal" : "bg-lamp"} animate-breathe`}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-paper">{notice.headline}</p>
              {notice.lines.map((l) => (
                <p key={l} className="mt-1 text-sm leading-relaxed text-mist">
                  {l}
                </p>
              ))}
            </div>
            <button type="button" onClick={dismiss} className="-m-1 p-1 text-haze hover:text-paper" aria-label="Dismiss">
              <Icon name="close" size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
