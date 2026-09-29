"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Locale } from "@/core/types";
import { C, SlideFrame, useCopy, useTimeline, type SlideProps } from "../kit";

/*
 * Slide: a route for tonight's focus. The same four tasks, laid out for each
 * focus level in turn (bar height = minutes, from 19:40), then a ride that
 * starts sharp and a "Low focus" press that re-plans what's left.
 *
 *   또렷  수학 50 19:40 · 화학 40 20:40 · 한국사 30 21:25 · 영어 20 22:00         (hard, important first)
 *   보통  화학 40 19:40 · 수학 50 20:25 · 한국사 30 21:25 · 영어 20 22:00         (work matched to energy)
 *   흐림  영어 20 19:40 · 한국사 30 20:05 · 화학 20 20:40 · 수학 25 21:05 · 화학 20 21:35 · 수학 25 22:00
 *         (short, easy wins first; stations capped at 30 min, as the planner does for low focus)
 *   Ride sharp; at 20:10 "집중 흐림": 수학 keeps its 30 min, a 10-min stop, then for low focus:
 *         영어 20:20 · 한국사 20:45 · 화학 21:20 · 수학(남은 20) 21:45 · 화학 22:10–22:30
 * Stops: 10 min after a station of 45 min or more, else 5.
 */

type Level = "low" | "steady" | "sharp";
type Id = "m1" | "m2" | "c1" | "c2" | "h" | "e";
type Task = "m" | "c" | "h" | "e";
const TASK: Record<Id, Task> = { m1: "m", m2: "m", c1: "c", c2: "c", h: "h", e: "e" };
const IDS: Id[] = ["m1", "m2", "c1", "c2", "h", "e"];

interface Copy {
  eyebrow: string;
  title: string;
  body: string;
  aside: string;
  signal: string;
  levels: Record<Level, string>;
  rules: Record<Level, string>;
  first: string;
  longest: string;
  count: (n: number) => string;
  now: string;
  button: string;
  signalChange: string;
  board: [string, string, string];
  dur: (min: number) => string;
  tasks: Record<Task, { title: string; kind: string }>;
}

const COPY: Record<Locale, Copy> = {
  ko: {
    eyebrow: "해결 · 컨디션 맞춤",
    title: "오늘 컨디션에\n맞춘 노선",
    body: "출발 전 발권기에서 오늘 컨디션을 골라요. 또렷한 날엔 어렵고 중요한 일부터, 흐린 날엔 짧고 가벼운 일부터 짧게 나눠 가요. 타는 중에 흐려지면 ‘집중 흐림’ 한 번으로 남은 노선을 다시 짜요.",
    aside: "같은 할 일, 다른 순서 · 흐림엔 정거장을 30분 이하로 · ‘집중 흐림’은 10분 쉬고 가벼운 일부터",
    signal: "컨디션",
    levels: { low: "흐림", steady: "보통", sharp: "또렷" },
    rules: { low: "짧고 가벼운 일부터 · 짧게 나눠서", steady: "지금 기운에 맞는 일부터", sharp: "어렵고 중요한 일부터" },
    first: "첫 정거장",
    longest: "가장 긴 정거장",
    count: (n) => `정거장 ${n}곳`,
    now: "지금",
    button: "집중 흐림",
    signalChange: "신호 변경",
    board: ["가벼운 것부터.", "다음은 영어 단어.", "수학 남은 20분 → 21:45"],
    dur: (m) => `${m}분`,
    tasks: {
      m: { title: "수학 문제집", kind: "어려움" },
      c: { title: "화학 보고서", kind: "보통" },
      h: { title: "한국사 요약", kind: "흥미" },
      e: { title: "영어 단어", kind: "쉬움" },
    },
  },
  en: {
    eyebrow: "Solution · Focus check",
    title: "A line that fits\ntonight's focus",
    body: "Before boarding, you tell the ticket machine how you feel. Sharp: hard, important work first. Low: short, easy wins first, in shorter stations. If focus drops mid-ride, one “Low focus” press re-plans the rest.",
    aside: "Same tasks, different order · low focus keeps stations to 30 min · “Low focus” takes a 10-min stop, then lighter work",
    signal: "Focus",
    levels: { low: "Low", steady: "Steady", sharp: "Sharp" },
    rules: { low: "Short, easy wins first · shorter stations", steady: "Work matched to your energy", sharp: "Hard, important work first" },
    first: "First station",
    longest: "Longest station",
    count: (n) => `${n} stations`,
    now: "Now",
    button: "Low focus",
    signalChange: "Signal change",
    board: ["Light work first.", "Next: English words.", "Math, 20 min left → 21:45"],
    dur: (m) => `${m} min`,
    tasks: {
      m: { title: "Math problems", kind: "hard" },
      c: { title: "Chem report", kind: "medium" },
      h: { title: "History notes", kind: "fun" },
      e: { title: "English words", kind: "easy" },
    },
  },
  ja: {
    eyebrow: "解決 · コンディション",
    title: "今夜の調子に\n合わせた路線",
    body: "乗る前に券売機で今夜の調子を選びます。冴えている日は難しく大事なことから、低めの日は短く軽いものから、駅を短く区切って。途中で集中が落ちたら「低め」を一度押せば、残りの路線を組み直します。",
    aside: "同じタスク、違う順番 · 低めの日は駅を30分以内に · 「低め」は10分休んで軽いものから",
    signal: "調子",
    levels: { low: "低め", steady: "ふつう", sharp: "冴えている" },
    rules: { low: "短く軽いものから · 駅を短く", steady: "いまの力に合うものから", sharp: "難しく大事なことから" },
    first: "最初の駅",
    longest: "いちばん長い駅",
    count: (n) => `駅 ${n}つ`,
    now: "いま",
    button: "集中が低め",
    signalChange: "信号変更",
    board: ["軽いものから。", "次は英単語。", "数学 残り20分 → 21:45"],
    dur: (m) => `${m}分`,
    tasks: {
      m: { title: "数学の問題集", kind: "難しい" },
      c: { title: "化学レポート", kind: "ふつう" },
      h: { title: "日本史まとめ", kind: "好き" },
      e: { title: "英単語", kind: "軽い" },
    },
  },
  zh: {
    eyebrow: "解决 · 状态匹配",
    title: "按今晚状态\n排的线路",
    body: "上车前在售票机选好今晚的状态。清醒时先做难而重要的，低迷时先做短而轻松的，每站也排得更短。途中专注下降，按一下“低迷”就会重排剩下的线路。",
    aside: "同样的待办，不同的顺序 · 低迷时每站不超过 30 分钟 · 按“低迷”先停 10 分钟，再从轻松的开始",
    signal: "状态",
    levels: { low: "低迷", steady: "平稳", sharp: "清醒" },
    rules: { low: "先做短而轻松的 · 每站更短", steady: "按现在的精力来", sharp: "先做难而重要的" },
    first: "第一站",
    longest: "最长的一站",
    count: (n) => `${n} 站`,
    now: "现在",
    button: "专注低迷",
    signalChange: "信号变更",
    board: ["先做轻松的。", "下一站：英语单词。", "数学 剩 20 分钟 → 21:45"],
    dur: (m) => `${m}分钟`,
    tasks: {
      m: { title: "数学习题", kind: "难" },
      c: { title: "化学报告", kind: "中等" },
      h: { title: "历史笔记", kind: "有兴趣" },
      e: { title: "英语单词", kind: "轻松" },
    },
  },
};

type Tone = "plan" | "active" | "done" | "first";
interface Bar {
  start: number; // minutes after 19:40
  min: number;
  on: boolean;
  tone?: Tone;
  fill?: number;
}
type Layout = Record<Id, Bar>;

const LOW: Layout = {
  e: { start: 0, min: 20, on: true, tone: "first" },
  h: { start: 25, min: 30, on: true },
  c1: { start: 60, min: 20, on: true },
  m1: { start: 85, min: 25, on: true },
  c2: { start: 115, min: 20, on: true },
  m2: { start: 140, min: 25, on: true },
};
const STEADY: Layout = {
  c1: { start: 0, min: 40, on: true, tone: "first" },
  c2: { start: 20, min: 20, on: false },
  m1: { start: 45, min: 50, on: true },
  m2: { start: 70, min: 25, on: false },
  h: { start: 105, min: 30, on: true },
  e: { start: 140, min: 20, on: true },
};
const SHARP: Layout = {
  m1: { start: 0, min: 50, on: true, tone: "first" },
  m2: { start: 25, min: 25, on: false },
  c1: { start: 60, min: 40, on: true },
  c2: { start: 80, min: 20, on: false },
  h: { start: 105, min: 30, on: true },
  e: { start: 140, min: 20, on: true },
};
const RIDE_NOW = 30; // 20:10
const RIDE: Layout = { ...SHARP, m1: { start: 0, min: 50, on: true, tone: "active", fill: RIDE_NOW } };
const REPLANNED: Layout = {
  m1: { start: 0, min: 30, on: true, tone: "done" },
  e: { start: 40, min: 20, on: true, tone: "first" },
  h: { start: 65, min: 30, on: true },
  c1: { start: 100, min: 20, on: true },
  m2: { start: 125, min: 20, on: true },
  c2: { start: 150, min: 20, on: true },
};

const hm = (t: number) => {
  const m = 19 * 60 + 40 + t;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

// ---- Geometry (design units; the picture is scaled to the stage). ----
const W = 440;
const H = 330;
const Y0 = 76;
const K = 1.22;
const y = (t: number) => Y0 + t * K;
const COL_X = 54;
const BAR_W = 190;
const RIGHT_X = 258;
const RIGHT_W = W - RIGHT_X - 8;
const BASE_H = 50 * K; // every bar is drawn 50 min long and scaled to its minutes
const EASE = "cubic-bezier(0.22,1,0.36,1)";

/** Draws a fixed-size picture scaled to the stage's width (the stage is 4:3, like W×H). */
function Fit({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setScale(e.contentRect.width / W));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} className="absolute inset-0">
      <div
        className="absolute left-0 top-0"
        style={{ width: W, height: H, transform: `scale(${scale})`, transformOrigin: "0 0", visibility: scale ? "visible" : "hidden" }}
      >
        {children}
      </div>
    </div>
  );
}

// out, 흐림, 보통, 또렷, ride (또렷), press 집중 흐림, re-planned (the still for reduced motion)
const STEPS = [380, 2500, 2500, 2500, 1700, 650, 3600];
type Phase = "out" | "low" | "steady" | "sharp" | "ride" | "press" | "replanned";
const PHASES: Phase[] = ["out", "low", "steady", "sharp", "ride", "press", "replanned"];

export default function FocusCheck({ active }: SlideProps) {
  const c = useCopy(COPY);
  const step = useTimeline(active, STEPS);
  const phase = PHASES[step];
  const shown: Phase = phase === "out" ? "replanned" : phase;
  const snap = phase === "low";
  const layout = { low: LOW, steady: STEADY, sharp: SHARP, ride: RIDE, press: RIDE, replanned: REPLANNED, out: REPLANNED }[shown];
  const level: Level = shown === "low" || shown === "replanned" ? "low" : shown === "steady" ? "steady" : "sharp";
  const riding = shown === "ride" || shown === "press" || shown === "replanned";
  const replanned = shown === "replanned";
  const now = replanned ? 40 : RIDE_NOW;
  const onBars = IDS.filter((id) => layout[id].on);
  const firstId = onBars.find((id) => layout[id].tone === "first") ?? onBars[0];
  const longest = Math.max(...onBars.map((id) => layout[id].min));
  const end = Math.max(...onBars.map((id) => layout[id].start + layout[id].min));

  return (
    <SlideFrame
      active={active}
      tone="solution"
      eyebrow={c.eyebrow}
      title={c.title}
      body={c.body}
      aside={c.aside}
      visual={
        <Fit>
          <div
            className="absolute inset-0"
            style={{ opacity: phase === "out" ? 0 : 1, transition: `opacity ${phase === "out" ? 320 : 480}ms ease` }}
            aria-hidden
          >
            {/* The focus selector, as at the ticket machine. */}
            <div className="absolute left-3 right-2 top-2 flex items-center justify-between gap-3">
              <span className="font-mono text-[11px] tracking-[0.16em]" style={{ color: C.paperDim }}>
                {c.signal.toUpperCase()}
              </span>
              <div className="flex rounded-[3px] border p-[3px]" style={{ borderColor: "#3b3f3c", background: "#0b0d0f" }}>
                {(["low", "steady", "sharp"] as Level[]).map((l) => {
                  const on = l === level;
                  return (
                    <span
                      key={l}
                      className="flex h-7 min-w-[72px] items-center justify-center rounded-[2px] px-2.5 text-[13px] font-medium"
                      style={{
                        background: on ? C.lamp : "transparent",
                        color: on ? "#1b1a16" : C.mist,
                        transition: snap ? "none" : "background 300ms ease, color 300ms ease",
                      }}
                    >
                      {c.levels[l]}
                    </span>
                  );
                })}
              </div>
            </div>
            <p className="absolute left-3 right-3 font-mono text-[11px] tracking-[0.06em]" style={{ top: 48, color: C.amber }}>
              <span key={level} className="intro08-in inline-block">
                {c.levels[level]} · {c.rules[level]}
              </span>
            </p>

            {/* The stations. */}
            {IDS.map((id, i) => (
              <Station
                key={id}
                bar={layout[id]}
                title={c.tasks[TASK[id]].title}
                kind={c.tasks[TASK[id]].kind}
                dur={c.dur(layout[id].min)}
                snap={snap}
                delay={i * 50}
              />
            ))}

            {/* Right: what this level does to the line. */}
            <div
              className="absolute font-mono"
              style={{
                left: RIGHT_X,
                width: RIGHT_W,
                top: y(0) - 2,
                opacity: riding ? 0 : 1,
                transform: riding ? "translate3d(0,-6px,0)" : "none",
                transition: snap ? "none" : "opacity 400ms ease, transform 500ms ease",
              }}
            >
              <Stat label={c.first} value={c.tasks[TASK[firstId]].title} />
              <Stat label={c.longest} value={c.dur(longest)} />
              <Stat label={c.count(onBars.length)} value={`${hm(0)} → ${hm(end)}`} />
            </div>

            {/* Mid-ride: focus drops, one press. */}
            <div
              className="absolute"
              style={{
                left: RIGHT_X,
                width: RIGHT_W,
                top: y(0) - 2,
                opacity: riding ? 1 : 0,
                transition: snap ? "none" : "opacity 400ms ease",
              }}
            >
              <p className="font-mono text-[11px] tracking-[0.1em]" style={{ color: C.amber }}>
                {c.now} {hm(now)}
              </p>
              <div
                className="mt-1.5 flex h-9 items-center justify-center rounded-[3px] border px-3 text-[13px] font-medium"
                style={{
                  background: shown === "press" || replanned ? C.lamp : "#0e1216",
                  color: shown === "press" || replanned ? "#1b1a16" : C.paper,
                  borderColor: shown === "press" || replanned ? C.lamp : "#4a4f4a",
                  transform: shown === "press" ? "scale(0.95)" : "none",
                  transition: snap ? "none" : "transform 160ms ease, background 200ms ease, color 200ms ease",
                }}
              >
                {c.button}
              </div>
              <div
                className="mt-3 rounded-[2px] border px-3 py-2.5 font-mono text-[11px] leading-[1.55] tracking-[0.03em]"
                style={{
                  background: "#0b0d0f",
                  borderColor: "#3b3f3c",
                  color: C.amber,
                  opacity: replanned ? 1 : 0,
                  transform: replanned ? "perspective(400px) rotateX(0deg)" : "perspective(400px) rotateX(-80deg)",
                  transformOrigin: "top",
                  transition: snap ? "none" : `transform 520ms ${EASE} 700ms, opacity 300ms ease 700ms`,
                }}
              >
                <p className="text-[11px] tracking-[0.16em]">■ {c.signalChange.toUpperCase()}</p>
                <p className="mt-1" style={{ color: C.paper }}>{c.board[0]}</p>
                <p style={{ color: C.paper }}>{c.board[1]}</p>
                <p style={{ color: C.paperDim }}>{c.board[2]}</p>
              </div>
            </div>

            <style>{`@keyframes intro08-in{from{opacity:0;transform:translate3d(0,4px,0)}to{opacity:1;transform:none}}.intro08-in{animation:intro08-in 450ms cubic-bezier(0.22,1,0.36,1) both}@media (prefers-reduced-motion: reduce){.intro08-in{animation:none}}`}</style>
          </div>
        </Fit>
      }
    />
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-3 border-l-2 pl-2.5" style={{ borderColor: C.rule }}>
      <p className="text-[10px] tracking-[0.12em]" style={{ color: C.mist }}>
        {label}
      </p>
      <p className="mt-1 truncate font-sans text-[14px] font-medium" style={{ color: C.paper }}>
        {value}
      </p>
    </div>
  );
}

const TONE: Record<Tone, { bg: string; ink: string; edge: string; label: string }> = {
  plan: { bg: "#e9dfc9", ink: "#1d2226", edge: "#bfb49c", label: C.paperDim },
  first: { bg: "#e9dfc9", ink: "#1d2226", edge: C.lamp, label: C.amber },
  active: { bg: "#e9dfc9", ink: "#1d2226", edge: C.lamp, label: C.amber },
  done: { bg: "#3a3a33", ink: C.paperDim, edge: C.lamp, label: C.mist },
};

/** One station: its departure time at left, a bar as long as its minutes, moved by translate. */
function Station({ bar, title, kind, dur, snap, delay }: { bar: Bar; title: string; kind: string; dur: string; snap: boolean; delay: number }) {
  const t = TONE[bar.tone ?? "plan"];
  const h = bar.min * K;
  const fill = bar.tone === "active" && bar.fill ? bar.fill / bar.min : 0;
  const tr = snap ? "none" : `transform 950ms ${EASE} ${delay}ms, opacity 450ms ease ${delay}ms`;
  return (
    <div
      className="absolute left-0 top-0"
      style={{ width: BAR_W, transform: `translate3d(${COL_X}px,${y(bar.start)}px,0)`, opacity: bar.on ? 1 : 0, transition: tr, zIndex: bar.on ? 2 : 1 }}
    >
      <div
        className="absolute left-0 top-0 overflow-hidden rounded-[2px] shadow-[0_5px_12px_-8px_rgba(0,0,0,0.9)]"
        style={{
          width: BAR_W,
          height: BASE_H,
          background: t.bg,
          transform: `scaleY(${h / BASE_H})`,
          transformOrigin: "top",
          transition: snap ? "none" : `transform 950ms ${EASE} ${delay}ms, background 400ms ease`,
        }}
      >
        <div className="absolute inset-y-0 left-0 w-[3px]" style={{ background: t.edge }} />
        <div
          className="absolute inset-0"
          style={{ background: `${C.lamp}55`, transform: `scaleY(${fill})`, transformOrigin: "top", transition: snap ? "none" : `transform 950ms ${EASE}` }}
        />
      </div>
      {bar.tone === "active" && bar.fill !== undefined && (
        <div className="absolute" style={{ left: -4, width: BAR_W + 8, top: bar.fill * K - 1, height: 2, background: C.lamp }} />
      )}
      <div className="absolute left-0 top-0 flex items-center justify-between gap-2 pl-2.5 pr-2 leading-none" style={{ width: BAR_W, height: 24, color: t.ink }}>
        <span className="flex min-w-0 items-baseline gap-1.5">
          <span className="truncate text-[12px] font-medium">{title}</span>
          <span className="shrink-0 font-mono text-[9.5px] opacity-60">{kind}</span>
        </span>
        <span className="shrink-0 font-mono text-[10.5px] opacity-75">{dur}</span>
      </div>
      <span className="absolute text-right font-mono text-[11px] leading-none" style={{ left: -52, width: 44, top: 7, color: t.label, transition: "color 400ms ease" }}>
        {hm(bar.start)}
      </span>
    </div>
  );
}
