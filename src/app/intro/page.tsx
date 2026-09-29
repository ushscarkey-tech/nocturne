"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { End } from "@/components/intro/End";
import { C } from "@/components/intro/kit";
import { SLIDES } from "@/components/intro/slides";
import { LOCALES, rememberLocale, useI18n } from "@/i18n";
import { markIntroSeen } from "@/lib/intro";
import { startPresentation } from "@/state/presenter";
import { updateProfile } from "@/state/actions";
import { useStore } from "@/state/store";

const TOTAL = SLIDES.length + 1;

const LABEL = {
  ko: { skip: "건너뛰기", prev: "이전", next: "다음", keys: "← → 넘기기 · F 전체 화면" },
  en: { skip: "Skip", prev: "Back", next: "Next", keys: "← → to move · F for full screen" },
  ja: { skip: "スキップ", prev: "前へ", next: "次へ", keys: "← → で移動 · F で全画面" },
  zh: { skip: "跳过", prev: "上一页", next: "下一页", keys: "← → 翻页 · F 全屏" },
} as const;

/**
 * The intro: a short deck, trouble first, then what Nocturne does about it,
 * one part at a time. Works as a presentation too: arrow keys, space, a
 * clicker (Page Up/Down), swipes, F for full screen, `?s=5` to open on a slide.
 */
export default function IntroPage() {
  const router = useRouter();
  const { locale } = useI18n();
  const l = LABEL[locale] ?? LABEL.en;
  const [index, setIndex] = useState(0);
  const touch = useRef<{ x: number; y: number } | null>(null);

  // Open on the slide in the address (?s=N, 1-based), for presenting and for checking one slide.
  useEffect(() => {
    const s = Number(new URLSearchParams(window.location.search).get("s"));
    if (Number.isFinite(s) && s >= 1) {
      const t = setTimeout(() => setIndex(Math.min(TOTAL - 1, Math.floor(s) - 1)), 0);
      return () => clearTimeout(t);
    }
  }, []);

  const go = useCallback((i: number) => {
    const next = Math.max(0, Math.min(TOTAL - 1, i));
    setIndex(next);
    const url = new URL(window.location.href);
    url.searchParams.set("s", String(next + 1));
    window.history.replaceState(null, "", url);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest("input,textarea,select")) return;
      // Space and Enter on a focused button press the button, not the deck.
      if ((e.key === " " || e.key === "Enter") && e.target instanceof HTMLButtonElement) return;
      if (["ArrowRight", "PageDown", " ", "Enter"].includes(e.key)) {
        e.preventDefault();
        go(index + 1);
      } else if (["ArrowLeft", "PageUp", "Backspace"].includes(e.key)) {
        e.preventDefault();
        go(index - 1);
      } else if (e.key === "Home") go(0);
      else if (e.key === "End") go(TOTAL - 1);
      else if (e.key === "f" || e.key === "F") {
        if (document.fullscreenElement) void document.exitFullscreen();
        else void document.documentElement.requestFullscreen?.().catch(() => {});
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, go]);

  function start() {
    markIntroSeen();
    const d = useStore.getState().data;
    router.push(d?.profile.onboardedAt ? "/" : "/welcome");
  }

  function demo() {
    markIntroSeen();
    startPresentation();
    router.push("/");
  }

  function setLang(id: (typeof LOCALES)[number]["id"]) {
    rememberLocale(id);
    if (useStore.getState().status === "ready") updateProfile({ locale: id });
  }

  return (
    <div
      className="relative flex h-dvh flex-col overflow-hidden"
      style={{ background: C.night }}
      onTouchStart={(e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
      onTouchEnd={(e) => {
        const t = touch.current;
        touch.current = null;
        if (!t) return;
        const dx = e.changedTouches[0].clientX - t.x;
        const dy = e.changedTouches[0].clientY - t.y;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.4) go(index + (dx < 0 ? 1 : -1));
      }}
    >
      {/* Top: the name, the language, a way out. */}
      <header className="relative z-10 flex h-14 shrink-0 items-center justify-between px-5 pt-[env(safe-area-inset-top)] md:px-8">
        <p className="font-mono text-[0.6875rem] tracking-[0.35em] text-paper-dim">NOCTURNE</p>
        <div className="flex items-center gap-4">
          <div className="flex gap-0.5" role="group" aria-label="Language">
            {LOCALES.map((x) => (
              <button
                key={x.id}
                type="button"
                onClick={() => setLang(x.id)}
                aria-pressed={locale === x.id}
                className={`min-h-8 rounded-[2px] px-1.5 font-mono text-[0.625rem] tracking-[0.12em] transition-colors ${locale === x.id ? "text-paper" : "text-haze hover:text-mist"}`}
              >
                {x.id.toUpperCase()}
              </button>
            ))}
          </div>
          {index < TOTAL - 1 && (
            <button type="button" onClick={() => go(TOTAL - 1)} className="min-h-8 text-xs text-mist hover:text-paper">
              {l.skip}
            </button>
          )}
        </div>
      </header>

      {/* The slides, stacked; only the current one is shown and running. */}
      <main className="relative min-h-0 flex-1">
        {[...SLIDES.map((S, i) => ({ S, i })), { S: null, i: SLIDES.length }].map(({ S, i }) => {
          const active = i === index;
          return (
            <section
              key={i}
              aria-hidden={!active}
              aria-roledescription="slide"
              aria-label={`${i + 1} / ${TOTAL}`}
              className="absolute inset-0 flex items-center transition-[opacity,transform] duration-[650ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
              style={{
                opacity: active ? 1 : 0,
                transform: active ? "none" : `translate3d(${i < index ? -28 : 28}px,0,0)`,
                pointerEvents: active ? "auto" : "none",
                visibility: Math.abs(i - index) > 1 ? "hidden" : "visible",
              }}
            >
              {S ? <S active={active} /> : <End active={active} onStart={start} onDemo={demo} onRestart={() => go(0)} />}
            </section>
          );
        })}
      </main>

      {/* Bottom: where we are on the line, and the way on. */}
      <footer className="relative z-10 shrink-0 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 md:px-8">
        <div className="mx-auto flex max-w-6xl items-center gap-4">
          <button type="button" onClick={() => go(index - 1)} disabled={index === 0} className="grid size-10 shrink-0 place-items-center rounded-[3px] border border-[#2a333d] text-mist transition-colors hover:text-paper disabled:opacity-30" aria-label={l.prev}>
            ←
          </button>
          {/* The deck as a line of stations. */}
          <div className="relative flex h-10 min-w-0 flex-1 items-center" aria-hidden>
            <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2" style={{ background: C.rule }} />
            <div className="absolute left-0 top-1/2 h-px -translate-y-1/2 transition-[width] duration-700" style={{ width: `${(index / (TOTAL - 1)) * 100}%`, background: C.lamp }} />
            <div className="relative flex w-full justify-between">
              {Array.from({ length: TOTAL }, (_, i) => (
                <button
                  key={i}
                  type="button"
                  tabIndex={-1}
                  onClick={() => go(i)}
                  className="grid size-4 place-items-center"
                >
                  <span
                    className="block rounded-full border transition-all duration-500"
                    style={{
                      width: i === index ? 10 : 6,
                      height: i === index ? 10 : 6,
                      background: i < index ? C.lamp : i === index ? C.paper : C.night,
                      borderColor: i <= index ? C.lamp : C.haze,
                    }}
                  />
                </button>
              ))}
            </div>
          </div>
          <p className="hidden shrink-0 font-mono text-[0.6875rem] tracking-[0.14em] text-mist tabular sm:block">
            {String(index + 1).padStart(2, "0")} / {String(TOTAL).padStart(2, "0")}
          </p>
          <button type="button" onClick={() => go(index + 1)} disabled={index === TOTAL - 1} className="grid size-10 shrink-0 place-items-center rounded-[3px] border border-[#3b3f3c] bg-[#e4d6b8] text-[#1b1a16] transition-colors hover:bg-[#efe3c8] disabled:opacity-30" aria-label={l.next}>
            →
          </button>
        </div>
        <p className="mt-1 hidden text-center font-mono text-[0.625rem] tracking-[0.14em] text-haze md:block">{l.keys}</p>
      </footer>
    </div>
  );
}
