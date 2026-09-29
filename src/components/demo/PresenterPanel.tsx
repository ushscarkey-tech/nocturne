"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { journeyFor } from "@/core/journey";
import { activeSession } from "@/core/sessions";
import { serviceDate } from "@/core/time";
import type { Locale } from "@/core/types";
import { forcedHour, setForcedHour, SKY_EVENT } from "@/components/scene/ride/hour";
import { useLocale } from "@/i18n";
import { board, demoArriveSoon, demoOverload, demoUrgentTask, finishEarly, lowFocus, needMoreTime, setCarriage } from "@/state/actions";
import { PRESENTING_EVENT, endPresentation, presenting, restartPresentation } from "@/state/presenter";
import { useStore } from "@/state/store";

const COPY: Record<Locale, Record<string, string>> = {
  ko: {
    tab: "DEMO", title: "발표 모드", hint: "D 키로 열고 닫기", go: "화면", tonight: "오늘 밤", tasks: "할 일", route: "노선", machine: "발권기", archive: "기록", intro: "소개",
    plan: "계획이 흔들리는 순간", needRide: "승차 중에 쓸 수 있어요", board: "바로 탑승", more: "시간 연장 +15분", early: "일찍 도착", low: "집중 흐림", urgent: "긴급 할 일 추가", overload: "넘치는 일주일", arrive: "곧 도착",
    window: "창밖", dawn: "새벽", day: "낮", dusk: "노을", night: "밤", now: "지금 시각", rain: "빗소리 객차", quiet: "조용한 객차",
    demo: "데모", restart: "처음부터", end: "데모 끝내기",
    urgentTitle: "내일 아침 쪽지시험 대비", o1: "과학 탐구 보고서 마무리", o2: "영어 발표 준비", o3: "수학 오답 정리",
  },
  en: {
    tab: "DEMO", title: "Presenter", hint: "Press D to open and close", go: "Screens", tonight: "Tonight", tasks: "Tasks", route: "Route", machine: "Ticket machine", archive: "Record", intro: "Intro",
    plan: "When the night slips", needRide: "Available while riding", board: "Board now", more: "More time +15 min", early: "Finished early", low: "Low focus", urgent: "Add an urgent task", overload: "Overbook the week", arrive: "Arrive now",
    window: "Window", dawn: "Dawn", day: "Day", dusk: "Dusk", night: "Night", now: "Real time", rain: "Rain car", quiet: "Quiet car",
    demo: "Demo", restart: "From the top", end: "End the demo",
    urgentTitle: "Quiz prep for tomorrow morning", o1: "Finish the science report", o2: "Prepare the English talk", o3: "Review math mistakes",
  },
  ja: {
    tab: "DEMO", title: "発表モード", hint: "D キーで開閉", go: "画面", tonight: "今夜", tasks: "タスク", route: "路線", machine: "券売機", archive: "記録", intro: "紹介",
    plan: "計画が揺れるとき", needRide: "乗車中に使えます", board: "すぐ乗車", more: "時間延長 +15分", early: "早く到着", low: "集中ぼんやり", urgent: "急ぎのタスク追加", overload: "あふれる一週間", arrive: "まもなく到着",
    window: "車窓", dawn: "夜明け", day: "昼", dusk: "夕焼け", night: "夜", now: "現在時刻", rain: "雨音の車両", quiet: "静かな車両",
    demo: "デモ", restart: "最初から", end: "デモ終了",
    urgentTitle: "明日朝の小テスト対策", o1: "理科レポート仕上げ", o2: "英語発表の準備", o3: "数学の間違い直し",
  },
  zh: {
    tab: "DEMO", title: "演示模式", hint: "按 D 打开/关闭", go: "页面", tonight: "今晚", tasks: "待办", route: "线路", machine: "售票机", archive: "记录", intro: "介绍",
    plan: "计划被打乱时", needRide: "乘车时可用", board: "立即上车", more: "延长 +15分", early: "提前到站", low: "专注模糊", urgent: "加急任务", overload: "塞满一周", arrive: "即将到站",
    window: "车窗", dawn: "清晨", day: "白天", dusk: "黄昏", night: "夜晚", now: "当前时间", rain: "雨声车厢", quiet: "安静车厢",
    demo: "演示", restart: "从头开始", end: "结束演示",
    urgentTitle: "明早小测准备", o1: "完成科学报告", o2: "准备英语演讲", o3: "整理数学错题",
  },
};

const HOURS: [string, number | null][] = [
  ["dawn", 6.1],
  ["day", 13],
  ["dusk", 18.2],
  ["night", 22.5],
  ["now", null],
];

const subscribePresenting = (fn: () => void) => {
  window.addEventListener("storage", fn);
  window.addEventListener(PRESENTING_EVENT, fn);
  return () => {
    window.removeEventListener("storage", fn);
    window.removeEventListener(PRESENTING_EVENT, fn);
  };
};
const subscribeSky = (fn: () => void) => {
  window.addEventListener(SKY_EVENT, fn);
  return () => window.removeEventListener(SKY_EVENT, fn);
};

/**
 * The presenter's levers, on every screen while demo mode is on: a small
 * DEMO tab at the left edge (press D, or tap it) opens them. Each lever is
 * the app's own action, so what the audience sees is what really happens.
 */
export function PresenterPanel() {
  const on = useSyncExternalStore(subscribePresenting, presenting, () => false);
  const ready = useStore((s) => s.status === "ready");
  const data = useStore((s) => s.data);
  const locale = useLocale();
  const c = COPY[locale] ?? COPY.en;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const hour = useSyncExternalStore(subscribeSky, forcedHour, () => null);

  useEffect(() => {
    if (!on) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target instanceof HTMLElement && e.target.closest("input,textarea,select,[contenteditable=true]")) return;
      if (e.key === "d" || e.key === "D") setOpen((o) => !o);
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [on]);

  if (!on || !ready || !data) return null;
  const rideOn = !!activeSession(data.sessions);
  const phase = journeyFor(data, serviceDate(new Date()))?.phase;
  const safely = (fn: () => void) => () => {
    try {
      fn();
    } catch (err) {
      console.warn("[nocturne] demo lever:", err);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="fixed left-0 top-1/2 z-[60] -translate-y-1/2 rounded-r-[3px] border border-l-0 border-[#3b3f3c] bg-[#0b0d0f]/90 px-1 py-2.5 font-mono text-[0.5625rem] tracking-[0.2em] text-[#e8b872] [writing-mode:vertical-rl]"
        aria-expanded={open}
        aria-label={c.title}
      >
        {c.tab}
      </button>
      {open && (
        <aside
          className="fixed left-3 top-1/2 z-[61] max-h-[88dvh] w-[18.5rem] -translate-y-1/2 overflow-y-auto rounded-[3px] border border-[#3b3f3c] bg-[#0b0d0f]/95 p-3 text-paper shadow-[0_20px_50px_-20px_rgba(0,0,0,0.9)] animate-rise"
          aria-label={c.title}
        >
          <div className="flex items-baseline justify-between">
            <p className="font-mono text-[0.6875rem] tracking-[0.2em] text-[#e8b872]">{c.title.toUpperCase()}</p>
            <button type="button" onClick={() => setOpen(false)} className="px-1 text-mist hover:text-paper" aria-label="close">
              ×
            </button>
          </div>
          <p className="mt-0.5 text-[0.6875rem] text-haze">{c.hint}</p>

          <Section label={c.go}>
            <div className="grid grid-cols-3 gap-1">
              {[
                ["/", c.tonight],
                ["/tasks", c.tasks],
                ["/route", c.route],
                ["/journey", c.machine],
                ["/archive", c.archive],
                ["/intro", c.intro],
              ].map(([href, label]) => (
                <Link key={href} href={href} onClick={() => setOpen(false)} className={KEY}>
                  {label}
                </Link>
              ))}
            </div>
          </Section>

          <Section label={c.plan}>
            <div className="grid grid-cols-2 gap-1">
              <Lever
                disabled={rideOn || (phase !== undefined && phase !== "boarding")}
                onClick={safely(() => {
                  board("steady", data.profile.preferredCarriage);
                  setOpen(false);
                  router.push("/journey");
                })}
              >
                {c.board}
              </Lever>
              <Lever disabled={!rideOn} onClick={safely(() => demoArriveSoon(8))}>{c.arrive}</Lever>
              <Lever disabled={!rideOn} onClick={safely(() => needMoreTime(15))}>{c.more}</Lever>
              <Lever disabled={!rideOn} onClick={safely(() => finishEarly(false))}>{c.early}</Lever>
              <Lever disabled={!rideOn} onClick={safely(() => lowFocus())}>{c.low}</Lever>
              <Lever onClick={safely(() => demoUrgentTask(c.urgentTitle))}>{c.urgent}</Lever>
              <Lever onClick={safely(() => demoOverload([c.o1, c.o2, c.o3]))} className="col-span-2">
                {c.overload}
              </Lever>
            </div>
            {!rideOn && <p className="mt-1 text-[0.625rem] text-haze">{c.needRide}: {c.more} · {c.early} · {c.low} · {c.arrive}</p>}
          </Section>

          <Section label={c.window}>
            <div className="grid grid-cols-5 gap-1">
              {HOURS.map(([k, h]) => (
                <Lever key={k} active={hour === h || (h === null && hour === null)} onClick={() => setForcedHour(h)}>
                  {c[k]}
                </Lever>
              ))}
            </div>
            <div className="mt-1 grid grid-cols-2 gap-1">
              <Lever active={data.profile.preferredCarriage === "rain"} onClick={safely(() => setCarriage("rain"))}>{c.rain}</Lever>
              <Lever active={data.profile.preferredCarriage === "quiet"} onClick={safely(() => setCarriage("quiet"))}>{c.quiet}</Lever>
            </div>
          </Section>

          <Section label={c.demo}>
            <div className="grid grid-cols-2 gap-1">
              <Lever
                onClick={() => {
                  setOpen(false);
                  restartPresentation();
                  router.push("/");
                }}
              >
                {c.restart}
              </Lever>
              <Lever
                onClick={() => {
                  setOpen(false);
                  endPresentation();
                  router.push("/");
                }}
              >
                {c.end}
              </Lever>
            </div>
          </Section>
        </aside>
      )}
    </>
  );
}

const KEY =
  "flex min-h-9 items-center justify-center rounded-[3px] border border-[#3b3f3c] bg-[#12171c] px-1.5 text-center text-[0.75rem] leading-tight text-paper-dim transition-colors hover:border-[#6a6e68] hover:text-paper disabled:cursor-not-allowed disabled:opacity-35";

function Lever({ children, onClick, disabled, active, className = "" }: { children: ReactNode; onClick: () => void; disabled?: boolean; active?: boolean; className?: string }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-pressed={active} className={`${KEY} ${active ? "border-[#b58f5a] text-[#e8b872]" : ""} ${className}`}>
      {children}
    </button>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="mt-3 border-t border-[#22282e] pt-2.5">
      <p className="mb-1.5 font-mono text-[0.5625rem] tracking-[0.2em] text-mist">{label.toUpperCase()}</p>
      {children}
    </section>
  );
}
