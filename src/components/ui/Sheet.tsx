"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Icon } from "./Icon";
import { useI18n } from "@/i18n";

/**
 * Accessible modal built on <dialog>: a bottom sheet on phones, a centered
 * panel on larger screens. Escape and backdrop clicks close it.
 */
export function Sheet({
  open,
  onClose,
  title,
  eyebrow,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  eyebrow?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-label={title}
      className={`m-0 mt-auto w-full max-w-none max-h-[92dvh] overflow-y-auto overscroll-contain bg-transparent p-0 text-paper sm:m-auto sm:max-h-[86dvh] ${wide ? "sm:max-w-2xl" : "sm:max-w-lg"}`}
    >
      {open && (
        <div className="animate-sheet overflow-y-auto rounded-t-3xl border border-rule bg-night-850 px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5 sm:rounded-3xl sm:px-8 sm:pb-8">
          <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-rule sm:hidden" aria-hidden />
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              {eyebrow && <p className="eyebrow mb-1.5">{eyebrow}</p>}
              <h2 className="font-display text-2xl leading-tight">{title}</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="-mr-3 flex h-11 w-11 items-center justify-center rounded-full text-mist transition-colors hover:text-paper"
              aria-label={t("shell.close")}
            >
              <Icon name="close" />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
