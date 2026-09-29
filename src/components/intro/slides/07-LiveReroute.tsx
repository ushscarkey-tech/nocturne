"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Locale } from "@/core/types";
import { C, SlideFrame, useCopy, useTimeline, type SlideProps } from "../kit";

/*
 * Slide: live re-routing, the headline. Tonight's route as a time column
 * (bar height = minutes), Service Time 19:40–23:30. Three things happen, one
 * at a time, each from the same starting route:
 *
 *   base   수학 19:40–20:40 · 영어 독해 20:50–21:30 · 화학 21:35–22:25 · 한국사 22:35–23:05 · 영어 단어 23:10–23:30
 *   (Station Stop after a station: 10 min when it is 45 min or longer, else 5 — as in the app.)
 *
 *   1  at 20:38, 시간 연장 +15분: 수학 → 20:55; 영어 독해 21:05, 화학 21:50, 한국사 22:50 (+15 each);
 *      영어 단어 would run 23:25–23:45, past 23:30 → moves to tomorrow's train.
 *   2  at 20:20, 일찍 도착: 수학 ends; a 5-min stop, then 영어 독해 20:25, 화학 21:10, 한국사 22:10,
 *      영어 단어 22:45–23:05 (−25 each) → 25 min spare before 23:30.
 *   3  at 20:30, a task due tonight (과학 수행평가, 20 min) arrives: after 수학 → 20:50–21:10;
 *      영어 독해 21:15, 화학 22:00, 한국사 23:00–23:30 (+25 each); 영어 단어 no longer fits → tomorrow.
 */

type Id = "m" | "r" | "c" | "h" | "v" | "s";
type Tone = "active" | "done" | "plan" | "moved" | "over" | "tomorrow" | "new";
type Place = "col" | "tray" | "incoming" | "hidden";
interface Bar {
  id: Id;
  start: number; // minutes after 19:40
  min: number;
  tone: Tone;
  place: Place;
  fill?: number; // minutes ridden (the active station)
}

interface Scenario {
  caption: string;
  action: string;
  board: [string, string];
}

interface Copy {
  eyebrow: string;
  title: string;
  body: string;
  aside: string;
  now: string;
  tray: string;
  end: string;
  gap: string;
  spare: string;
  signal: string;
  newTask: string;
  due: string;
  dur: (min: number) => string;
  titles: Record<Id, string>;
  scenarios: [Scenario, Scenario, Scenario];
}

const COPY: Record<Locale, Copy> = {
  ko: {
    eyebrow: "해결 · 실시간 재조정",
    title: "계획이 틀어지면,\n노선이 다시 맞춰요",
    body: "손으로 다시 짤 필요가 없어요. 무슨 일이 있었는지만 누르면 뒤 정거장이 다시 맞춰지고, 운행 시간 안에 못 들어가는 일은 지워지지 않고 내일 열차로 옮겨 가요.",
    aside: "시간 연장 · 일찍 도착 · 집중 흐림 · 늦은 출발 · 새 할 일 → 바뀐 점은 ‘신호 변경’ 안내판에 떠요",
    now: "지금",
    tray: "내일 열차",
    end: "운행 종료",
    gap: "빈 30분",
    spare: "여유 25분",
    signal: "신호 변경",
    newTask: "새 할 일",
    due: "오늘 마감",
    dur: (m) => `${m}분`,
    titles: { m: "수학 문제집", r: "영어 독해", c: "화학 보고서", h: "한국사 요약", v: "영어 단어", s: "과학 수행평가" },
    scenarios: [
      { caption: "수학이 예상보다 길어져요", action: "시간 연장 +15분", board: ["뒤 정거장 3곳 15분씩 뒤로", "영어 단어 → 내일 열차"] },
      { caption: "수학을 일찍 끝냈어요", action: "일찍 도착", board: ["뒤 정거장 4곳 25분 당겨짐", "23:05 도착 · 25분 여유"] },
      { caption: "오늘 마감인 일이 생겼어요", action: "", board: ["과학 수행평가 20:50 승차", "영어 단어 → 내일 열차"] },
    ],
  },
  en: {
    eyebrow: "Solution · Live re-planning",
    title: "When the plan slips,\nthe line re-plans",
    body: "Nothing to redo by hand. Press what happened and the later stations re-plan; whatever no longer fits before Service Time ends moves to tomorrow's train instead of disappearing.",
    aside: "More time · finish early · low focus · late start · new task → what changed shows on the “Signal change” board",
    now: "Now",
    tray: "Tomorrow's train",
    end: "Service ends",
    gap: "30 min empty",
    spare: "25 min spare",
    signal: "Signal change",
    newTask: "New task",
    due: "Due today",
    dur: (m) => `${m} min`,
    titles: { m: "Math problems", r: "English reading", c: "Chem report", h: "History notes", v: "English words", s: "Science task" },
    scenarios: [
      { caption: "Math is running over", action: "More time +15 min", board: ["3 later stops: +15 min", "English words → tomorrow"] },
      { caption: "Math finished early", action: "Finish early", board: ["4 later stops: 25 min earlier", "Arrive 23:05 · 25 min spare"] },
      { caption: "Something due tonight comes in", action: "", board: ["Science task boards 20:50", "English words → tomorrow"] },
    ],
  },
  ja: {
    eyebrow: "解決 · その場で組み直し",
    title: "計画がずれたら、\n路線が合わせ直す",
    body: "手で組み直す必要はありません。起きたことを押すだけで後ろの駅が組み直され、運行時間に入らないものは消えずに明日の列車へ移ります。",
    aside: "もっと時間 · 早く終わる · 集中が落ちた · 出発が遅れた · 新しいタスク → 変わった点は「信号変更」の案内板に",
    now: "いま",
    tray: "明日の列車",
    end: "運行終了",
    gap: "空き 30分",
    spare: "余裕 25分",
    signal: "信号変更",
    newTask: "新しいタスク",
    due: "今日締切",
    dur: (m) => `${m}分`,
    titles: { m: "数学の問題集", r: "英語の読解", c: "化学レポート", h: "日本史まとめ", v: "英単語", s: "理科の課題" },
    scenarios: [
      { caption: "数学が予定より長引く", action: "もっと時間 +15分", board: ["後ろの駅 3つ 15分ずつ後へ", "英単語 → 明日の列車"] },
      { caption: "数学が早く終わった", action: "早く終わる", board: ["後ろの駅 4つ 25分前へ", "23:05 着 · 25分の余裕"] },
      { caption: "今日締切のタスクが入った", action: "", board: ["理科の課題 20:50 乗車", "英単語 → 明日の列車"] },
    ],
  },
  zh: {
    eyebrow: "解决 · 实时重排",
    title: "计划被打乱，\n线路自己重排",
    body: "不用手动重排。按一下发生了什么，后面的站就会重新排好；运行时间内放不下的，不会被删掉，而是移到明天的列车。",
    aside: "更多时间 · 提前完成 · 专注低迷 · 晚出发 · 新待办 → 改了什么，显示在“信号变更”看板上",
    now: "现在",
    tray: "明天的列车",
    end: "运行结束",
    gap: "空出 30 分钟",
    spare: "余 25 分钟",
    signal: "信号变更",
    newTask: "新待办",
    due: "今天截止",
    dur: (m) => `${m}分钟`,
    titles: { m: "数学习题", r: "英语阅读", c: "化学报告", h: "历史笔记", v: "英语单词", s: "科学作业" },
    scenarios: [
      { caption: "数学超时了", action: "更多时间 +15分钟", board: ["后面 3 站各推后 15 分钟", "英语单词 → 明天的列车"] },
      { caption: "数学提前做完了", action: "提前完成", board: ["后面 4 站提前 25 分钟", "23:05 到达 · 空出 25 分钟"] },
      { caption: "来了一件今天截止的事", action: "", board: ["科学作业 20:50 上车", "英语单词 → 明天的列车"] },
    ],
  },
};

// ---- The night, in numbers (see the header comment). ----

/** Each bar's drawn length at rest; the actual length is a scale of it. */
const BASE_MIN: Record<Id, number> = { m: 60, r: 40, c: 50, h: 30, v: 20, s: 20 };
const ORDER: Id[] = ["m", "s", "r", "c", "h", "v"];
const SERVICE_END = 230; // 23:30
const hm = (t: number) => {
  const m = 19 * 60 + 40 + t;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

const base = (fill: number): Bar[] => [
  { id: "m", start: 0, min: 60, tone: "active", place: "col", fill },
  { id: "r", start: 70, min: 40, tone: "plan", place: "col" },
  { id: "c", start: 115, min: 50, tone: "plan", place: "col" },
  { id: "h", start: 175, min: 30, tone: "plan", place: "col" },
  { id: "v", start: 210, min: 20, tone: "plan", place: "col" },
  { id: "s", start: 70, min: 20, tone: "new", place: "hidden" },
];

type Stage = "before" | "shift" | "settle";
interface Script {
  now: number;
  bars: Record<Stage, Bar[]>;
  gap?: [number, number];
  spare?: [number, number];
}

const SCRIPTS: [Script, Script, Script] = [
  {
    now: 58,
    bars: {
      before: base(58),
      shift: [
        { id: "m", start: 0, min: 75, tone: "active", place: "col", fill: 58 },
        { id: "r", start: 85, min: 40, tone: "moved", place: "col" },
        { id: "c", start: 130, min: 50, tone: "moved", place: "col" },
        { id: "h", start: 190, min: 30, tone: "moved", place: "col" },
        { id: "v", start: 225, min: 20, tone: "over", place: "col" },
        { id: "s", start: 70, min: 20, tone: "new", place: "hidden" },
      ],
      settle: [
        { id: "m", start: 0, min: 75, tone: "active", place: "col", fill: 58 },
        { id: "r", start: 85, min: 40, tone: "moved", place: "col" },
        { id: "c", start: 130, min: 50, tone: "moved", place: "col" },
        { id: "h", start: 190, min: 30, tone: "moved", place: "col" },
        { id: "v", start: 225, min: 20, tone: "tomorrow", place: "tray" },
        { id: "s", start: 70, min: 20, tone: "new", place: "hidden" },
      ],
    },
  },
  {
    now: 40,
    gap: [40, 70],
    spare: [205, 230],
    bars: {
      before: base(40),
      shift: [
        { id: "m", start: 0, min: 40, tone: "done", place: "col", fill: 40 },
        { id: "r", start: 70, min: 40, tone: "plan", place: "col" },
        { id: "c", start: 115, min: 50, tone: "plan", place: "col" },
        { id: "h", start: 175, min: 30, tone: "plan", place: "col" },
        { id: "v", start: 210, min: 20, tone: "plan", place: "col" },
        { id: "s", start: 70, min: 20, tone: "new", place: "hidden" },
      ],
      settle: [
        { id: "m", start: 0, min: 40, tone: "done", place: "col", fill: 40 },
        { id: "r", start: 45, min: 40, tone: "moved", place: "col" },
        { id: "c", start: 90, min: 50, tone: "moved", place: "col" },
        { id: "h", start: 150, min: 30, tone: "moved", place: "col" },
        { id: "v", start: 185, min: 20, tone: "moved", place: "col" },
        { id: "s", start: 70, min: 20, tone: "new", place: "hidden" },
      ],
    },
  },
  {
    now: 50,
    bars: {
      before: [...base(50).slice(0, 5), { id: "s", start: 70, min: 20, tone: "new", place: "incoming" }],
      shift: [
        { id: "m", start: 0, min: 60, tone: "active", place: "col", fill: 50 },
        { id: "s", start: 70, min: 20, tone: "new", place: "col" },
        { id: "r", start: 95, min: 40, tone: "moved", place: "col" },
        { id: "c", start: 140, min: 50, tone: "moved", place: "col" },
        { id: "h", start: 200, min: 30, tone: "moved", place: "col" },
        { id: "v", start: 235, min: 20, tone: "over", place: "col" },
      ],
      settle: [
        { id: "m", start: 0, min: 60, tone: "active", place: "col", fill: 50 },
        { id: "s", start: 70, min: 20, tone: "new", place: "col" },
        { id: "r", start: 95, min: 40, tone: "moved", place: "col" },
        { id: "c", start: 140, min: 50, tone: "moved", place: "col" },
        { id: "h", start: 200, min: 30, tone: "moved", place: "col" },
        { id: "v", start: 235, min: 20, tone: "tomorrow", place: "tray" },
      ],
    },
  },
];

// ---- Geometry (design units; the picture is scaled to the stage). ----

const W = 440;
const H = 330;
const Y0 = 48;
const K = 1.08; // px per minute
const y = (t: number) => Y0 + t * K;
const COL_X = 54;
const BAR_W = 176;
const RIGHT_X = 248;
const RIGHT_W = W - RIGHT_X - 8;
const ACTION_Y = 58;
const BOARD_Y = 128;
const TRAY_Y = 250;
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

// Per scenario: out (fade the last picture), in (new start, snapped), press, shift, settle, board.
const PHASES = ["out", "in", "press", "shift", "settle", "board"] as const;
type Phase = (typeof PHASES)[number];
const PHASE_MS = [380, 1500, 750, 1500, 1300, 2900];
const STEPS = [...PHASE_MS, ...PHASE_MS, ...PHASE_MS];

const TONE: Record<Tone, { bg: string; ink: string; edge: string; label: string }> = {
  active: { bg: "#e9dfc9", ink: "#1d2226", edge: C.lamp, label: C.amber },
  done: { bg: "#3a3a33", ink: C.paperDim, edge: C.lamp, label: C.mist },
  plan: { bg: "#e9dfc9", ink: "#1d2226", edge: "#bfb49c", label: C.paperDim },
  moved: { bg: "#e9dfc9", ink: "#1d2226", edge: C.amber, label: C.amber },
  over: { bg: "#d9c9b6", ink: "#1d2226", edge: C.signal, label: C.signal },
  tomorrow: { bg: "#2a2f33", ink: C.paperDim, edge: C.signal, label: C.signal },
  new: { bg: "#e9dfc9", ink: "#1d2226", edge: C.signal, label: C.amber },
};

export default function LiveReroute({ active }: SlideProps) {
  const c = useCopy(COPY);
  const step = useTimeline(active, STEPS);
  const k = Math.floor(step / PHASES.length);
  const phase: Phase = PHASES[step % PHASES.length];
  // "out" still shows the previous scenario's finished picture while it fades.
  const shownK = phase === "out" ? (k + 2) % 3 : k;
  const shownPhase: Phase = phase === "out" ? "board" : phase;
  const script = SCRIPTS[shownK];
  const sc = c.scenarios[shownK];
  const stage: Stage = shownPhase === "shift" ? "shift" : shownPhase === "settle" || shownPhase === "board" ? "settle" : "before";
  // Always in the same order, so a station's element never moves in the DOM (that would cut its transition).
  const bars = ORDER.map((id) => script.bars[stage].find((b) => b.id === id)!);
  const snap = phase === "in";
  const tr = (ms: number, delay = 0) => (snap ? "none" : `transform ${ms}ms ${EASE} ${delay}ms, opacity 450ms ease ${delay}ms`);
  const pressed = shownPhase !== "in";
  const boardOn = shownPhase === "board";

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
            {/* Caption: which of the three, what happened, and the time. */}
            <div className="absolute left-3 right-3 top-2.5 flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="flex shrink-0 gap-[3px]">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="h-[7px] w-[7px] rounded-[1px]" style={{ background: i === shownK ? C.lamp : C.rule }} />
                  ))}
                </div>
                <span className="truncate text-[13.5px] font-medium text-paper">{sc.caption}</span>
              </div>
              <span className="shrink-0 font-mono text-[11px] tracking-[0.1em]" style={{ color: C.amber }}>
                {c.now} {hm(script.now)}
              </span>
            </div>
            <div className="absolute left-3 right-3" style={{ top: 34, height: 1, background: C.rule }} />

            {/* End of Service Time. */}
            <div
              className="absolute"
              style={{ left: COL_X - 4, width: BAR_W + 8, top: y(SERVICE_END), height: 0, borderTop: `1.5px dashed ${C.signal}` }}
            />
            <span
              className="absolute text-right font-mono text-[10px] leading-none tracking-[0.08em]"
              style={{ left: COL_X, width: BAR_W, top: y(SERVICE_END) + 6, color: C.signal }}
            >
              {c.end} {hm(SERVICE_END)}
            </span>

            {/* The empty stretch after finishing early, then the spare time at the end. */}
            {script.gap && (
              <Band top={y(script.gap[0])} height={(script.gap[1] - script.gap[0]) * K} label={c.gap} on={shownPhase === "shift"} snap={snap} />
            )}
            {script.spare && (
              <Band top={y(script.spare[0])} height={(script.spare[1] - script.spare[0]) * K} label={c.spare} on={stage === "settle"} snap={snap} delay={500} />
            )}

            {/* Tomorrow's train: where what doesn't fit goes. */}
            <p className="absolute font-mono text-[10px] tracking-[0.14em]" style={{ left: RIGHT_X, top: TRAY_Y - 16, color: C.mist }}>
              {c.tray.toUpperCase()}
            </p>
            <div
              className="absolute rounded-[3px] border border-dashed"
              style={{ left: RIGHT_X, width: RIGHT_W, top: TRAY_Y, height: 34, borderColor: C.haze }}
            />

            {/* What happened: a button pressed, or a new task arriving. */}
            {shownK < 2 ? (
              <div className="absolute" style={{ left: RIGHT_X, top: ACTION_Y, width: RIGHT_W }}>
                <div
                  className="flex h-9 items-center justify-center rounded-[3px] border px-3 text-[13px] font-medium"
                  style={{
                    background: pressed ? C.lamp : "#0e1216",
                    color: pressed ? "#1b1a16" : C.paper,
                    borderColor: pressed ? C.lamp : "#4a4f4a",
                    transform: shownPhase === "press" ? "scale(0.95)" : "none",
                    transition: snap ? "none" : "transform 160ms ease, background 200ms ease, color 200ms ease, border-color 200ms ease",
                  }}
                >
                  {sc.action}
                </div>
              </div>
            ) : (
              <p className="absolute font-mono text-[10px] tracking-[0.14em]" style={{ left: RIGHT_X, top: ACTION_Y - 16, color: C.signal }}>
                {c.newTask.toUpperCase()} · {c.due}
              </p>
            )}

            {/* The stations. */}
            {bars.map((b, i) => (
              <Station key={b.id} bar={b} title={c.titles[b.id]} dur={c.dur(b.min)} now={script.now} tr={tr} snap={snap} delay={i * 60} />
            ))}

            {/* The signal-change board flips on. */}
            <div
              className="absolute rounded-[2px] border px-3 py-2.5 font-mono text-[11px] leading-[1.55] tracking-[0.04em]"
              style={{
                left: RIGHT_X,
                width: RIGHT_W,
                top: BOARD_Y,
                background: "#0b0d0f",
                borderColor: "#3b3f3c",
                color: C.amber,
                opacity: boardOn ? 1 : 0,
                transform: boardOn ? "perspective(400px) rotateX(0deg)" : "perspective(400px) rotateX(-80deg)",
                transformOrigin: "top",
                transition: snap ? "none" : `transform 520ms ${EASE}, opacity 300ms ease`,
              }}
            >
              <p className="flex items-center gap-1.5 text-[11px] tracking-[0.16em]">
                <span className="h-[6px] w-[6px] rounded-[1px]" style={{ background: C.amber, animation: boardOn ? "intro07-blink 1.1s steps(2, jump-none) infinite" : "none" }} />
                {c.signal.toUpperCase()}
              </p>
              <p className="mt-1" style={{ color: C.paper }}>{sc.board[0]}</p>
              <p style={{ color: C.paperDim }}>{sc.board[1]}</p>
            </div>
            <style>{`@keyframes intro07-blink{0%{opacity:1}100%{opacity:.25}}@media (prefers-reduced-motion: reduce){[style*="intro07-blink"]{animation:none!important}}`}</style>
          </div>
        </Fit>
      }
    />
  );
}

/** A dashed stretch of time with a label: empty after finishing early, spare at the end. */
function Band({ top, height, label, on, snap, delay = 0 }: { top: number; height: number; label: string; on: boolean; snap: boolean; delay?: number }) {
  return (
    <div
      className="absolute flex items-center justify-center rounded-[2px] border border-dashed font-mono text-[10px] tracking-[0.1em]"
      style={{
        left: COL_X,
        width: BAR_W,
        top,
        height,
        borderColor: C.mossLight,
        background: `${C.moss}88`,
        color: C.paperDim,
        opacity: on ? 1 : 0,
        transition: snap ? "none" : `opacity 450ms ease ${on ? delay : 0}ms`,
      }}
    >
      {label}
    </div>
  );
}

/** One station: its departure time at left, a bar as long as its minutes, moved by translate. */
function Station({
  bar,
  title,
  dur,
  now,
  tr,
  snap,
  delay,
}: {
  bar: Bar;
  title: string;
  dur: string;
  now: number;
  tr: (ms: number, delay?: number) => string;
  snap: boolean;
  delay: number;
}) {
  const t = TONE[bar.tone];
  const base = BASE_MIN[bar.id];
  const inCol = bar.place === "col";
  const x = bar.place === "col" ? COL_X : RIGHT_X + (RIGHT_W - BAR_W) / 2;
  const top = bar.place === "col" ? y(bar.start) : bar.place === "tray" ? TRAY_Y + 6 : ACTION_Y;
  const h = bar.min * K;
  const fill = bar.fill !== undefined && bar.tone === "active" ? Math.min(1, bar.fill / bar.min) : 0;
  return (
    <div
      className="absolute left-0 top-0"
      style={{
        width: BAR_W,
        transform: `translate3d(${x}px,${top}px,0)`,
        opacity: bar.place === "hidden" ? 0 : 1,
        transition: tr(bar.place === "tray" ? 900 : 1000, delay),
        zIndex: bar.tone === "new" || bar.tone === "over" ? 3 : 2,
      }}
    >
      {/* The bar itself, stretched to its minutes. */}
      <div
        className="absolute left-0 top-0 overflow-hidden rounded-[2px] shadow-[0_5px_12px_-8px_rgba(0,0,0,0.9)]"
        style={{
          width: BAR_W,
          height: base * K,
          background: t.bg,
          transform: `scaleY(${h / (base * K)})`,
          transformOrigin: "top",
          transition: snap ? "none" : `transform 1000ms ${EASE} ${delay}ms, background 400ms ease`,
        }}
      >
        <div className="absolute inset-y-0 left-0 w-[3px]" style={{ background: t.edge, transition: "background 400ms ease" }} />
        <div
          className="absolute inset-x-0 top-0"
          style={{
            height: "100%",
            background: `${C.lamp}55`,
            transform: `scaleY(${fill})`,
            transformOrigin: "top",
            transition: snap ? "none" : `transform 1000ms ${EASE} ${delay}ms`,
          }}
        />
      </div>
      {/* Now, on the station being ridden. */}
      {bar.tone === "active" && (
        <div className="absolute" style={{ left: -4, width: BAR_W + 8, top: now * K - 1, height: 2, background: C.lamp }} />
      )}
      {/* Title and minutes. */}
      <div
        className="absolute left-0 top-0 flex items-center justify-between gap-2 pl-2.5 pr-2 text-[12px] leading-none"
        style={{ width: BAR_W, height: Math.min(22, h), color: t.ink }}
      >
        <span className="truncate font-medium">{title}</span>
        <span className="shrink-0 font-mono text-[10.5px] opacity-75">{dur}</span>
      </div>
      {/* Departure time at left (hidden once the station leaves the column). */}
      <span
        className="absolute text-right font-mono text-[11px] leading-none"
        style={{
          left: -52,
          width: 44,
          top: 6,
          color: t.label,
          opacity: inCol ? 1 : 0,
          transition: snap ? "none" : "opacity 300ms ease, color 400ms ease",
        }}
      >
        {hm(bar.start)}
      </span>
    </div>
  );
}
