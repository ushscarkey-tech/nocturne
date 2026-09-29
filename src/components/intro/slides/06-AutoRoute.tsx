"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Locale } from "@/core/types";
import { Board, C, SlideFrame, useCopy, useTimeline, type SlideProps } from "../kit";

/*
 * Slide: the idea and the automatic route. Five loose task cards, each with
 * the factors it carries, are weighed (the deciding factor lights up, a
 * number appears) and settle into tonight's line as stations with departure
 * times; a small train sets off from the first one.
 *
 * Tonight (Wednesday), Service Time 19:40–23:30, Station Stops 10 min after a
 * station of 45 min or more, 5 min otherwise:
 *   19:40 화학 50 → 20:40 수학 60 → 21:50 한국사 40 → 22:35 영어 20 → 23:00 독서록 30 → 23:30
 */

type Id = "chem" | "math" | "hist" | "eng" | "read";
type TaskCopy = { title: string; tags: string[]; key: number; why: string };

interface Copy {
  eyebrow: string;
  title: string;
  body: string;
  aside: string;
  loose: string;
  weighing: string;
  line: string;
  service: string;
  board: string;
  dur: (min: number) => string;
  tasks: Record<Id, TaskCopy>;
}

const COPY: Record<Locale, Copy> = {
  ko: {
    eyebrow: "해결 · 자동 노선",
    title: "할 일은 역,\n오늘 밤은 노선",
    body: "할 일을 적어 두면 순서는 Nocturne이 정해요. 마감, 중요도, 흥미, 난이도, 예상 시간을 따져 오늘 밤 운행 시간 안에 노선을 깔아요.",
    aside: "오늘 마감은 맨 앞 · 컨디션이 좋으면 어려운 일 먼저 · 지난 기록으로 예상 시간을 조금씩 보정",
    loose: "할 일 5개 · 순서 없음",
    weighing: "따져 보는 중",
    line: "오늘 밤 노선",
    service: "운행 19:40 – 23:30",
    board: "정거장 5곳 · 19:40 출발 → 23:30 도착",
    dur: (m) => (m >= 60 ? `${Math.floor(m / 60)}시간${m % 60 ? ` ${m % 60}분` : ""}` : `${m}분`),
    tasks: {
      chem: { title: "화학 보고서", tags: ["마감 오늘", "중요도 높음"], key: 0, why: "오늘 마감이라 먼저" },
      math: { title: "수학 문제집", tags: ["마감 금", "난이도 높음"], key: 1, why: "어려운 일은 기운 있을 때" },
      hist: { title: "한국사 요약", tags: ["흥미 높음", "마감 목"], key: 0, why: "끌리는 일로 이어 가기" },
      eng: { title: "영어 단어", tags: ["난이도 낮음"], key: 0, why: "짧고 쉬운 일" },
      read: { title: "독서록", tags: ["마감 다음 주"], key: 0, why: "마감이 넉넉해요" },
    },
  },
  en: {
    eyebrow: "Solution · Auto route",
    title: "Tasks are stations,\ntonight is the line",
    body: "Write down what you have to do and Nocturne sets the order. It weighs deadline, importance, interest, difficulty and estimated time, and lays tonight's line inside your Service Time.",
    aside: "Due tonight goes first · hard work first when you're sharp · estimates nudged by your history",
    loose: "5 tasks · no order",
    weighing: "Weighing",
    line: "Tonight's line",
    service: "Service 19:40 – 23:30",
    board: "5 stations · depart 19:40 → arrive 23:30",
    dur: (m) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}` : `${m} min`),
    tasks: {
      chem: { title: "Chem report", tags: ["Due today", "Important"], key: 0, why: "Due tonight, so first" },
      math: { title: "Math problems", tags: ["Due Fri", "Hard"], key: 1, why: "Hard work while fresh" },
      hist: { title: "History notes", tags: ["Interesting", "Due Thu"], key: 0, why: "Something you like next" },
      eng: { title: "English words", tags: ["Easy"], key: 0, why: "Short and easy" },
      read: { title: "Book report", tags: ["Due next week"], key: 0, why: "Plenty of time left" },
    },
  },
  ja: {
    eyebrow: "解決 · 自動の路線",
    title: "タスクは駅、\n今夜は路線",
    body: "やることを書いておけば、順番は Nocturne が決めます。締切・重要度・興味・難しさ・予想時間を見て、今夜の運行時間の中に路線を敷きます。",
    aside: "今日締切はいちばん前 · 冴えている日は難しいことから · 過去の記録で予想時間を少しずつ補正",
    loose: "タスク 5件 · 順番なし",
    weighing: "比べています",
    line: "今夜の路線",
    service: "運行 19:40 – 23:30",
    board: "駅 5つ · 19:40 発 → 23:30 着",
    dur: (m) => (m >= 60 ? `${Math.floor(m / 60)}時間${m % 60 ? `${m % 60}分` : ""}` : `${m}分`),
    tasks: {
      chem: { title: "化学レポート", tags: ["締切 今日", "重要度 高"], key: 0, why: "今日締切なので先に" },
      math: { title: "数学の問題集", tags: ["締切 金", "難しさ 高"], key: 1, why: "難しいことは元気なうちに" },
      hist: { title: "日本史まとめ", tags: ["興味 高", "締切 木"], key: 0, why: "好きなことでつなぐ" },
      eng: { title: "英単語", tags: ["難しさ 低"], key: 0, why: "短くて軽い" },
      read: { title: "読書感想文", tags: ["締切 来週"], key: 0, why: "締切に余裕あり" },
    },
  },
  zh: {
    eyebrow: "解决 · 自动排线",
    title: "待办是站，\n今晚是线路",
    body: "把要做的事写下来，顺序交给 Nocturne。它会权衡截止、重要度、兴趣、难度和预计时间，在今晚的运行时间里铺好线路。",
    aside: "今天截止的排最前 · 状态好时先做难的 · 按过往记录慢慢校准预计时间",
    loose: "5 件待办 · 没有顺序",
    weighing: "正在权衡",
    line: "今晚的线路",
    service: "运行 19:40 – 23:30",
    board: "5 站 · 19:40 出发 → 23:30 到达",
    dur: (m) => (m >= 60 ? `${Math.floor(m / 60)}小时${m % 60 ? `${m % 60}分` : ""}` : `${m}分钟`),
    tasks: {
      chem: { title: "化学报告", tags: ["今天截止", "重要"], key: 0, why: "今天截止，排第一" },
      math: { title: "数学习题", tags: ["周五截止", "难"], key: 1, why: "难的趁精神好" },
      hist: { title: "历史笔记", tags: ["有兴趣", "周四截止"], key: 0, why: "接着做感兴趣的" },
      eng: { title: "英语单词", tags: ["简单"], key: 0, why: "短而轻松" },
      read: { title: "读书报告", tags: ["下周截止"], key: 0, why: "离截止还早" },
    },
  },
};

/** Settled order, minutes and departure times (see the header comment). */
const ORDER: { id: Id; min: number; at: string; loose: [number, number, number] }[] = [
  { id: "chem", min: 50, at: "19:40", loose: [226, 146, -2.5] },
  { id: "math", min: 60, at: "20:40", loose: [222, 44, 2] },
  { id: "hist", min: 40, at: "21:50", loose: [118, 234, 1.5] },
  { id: "eng", min: 20, at: "22:35", loose: [8, 132, 2] },
  { id: "read", min: 30, at: "23:00", loose: [10, 50, -3] },
];

const W = 440;
const H = 330;
const ROW_Y = (i: number) => 38 + i * 52;
const ROW_H = 46;
const CARD_X = 70;
const CARD_W = 206;
const LINE_X = 58;
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

// out → loose → weigh → settle → depart (the last one is the still for reduced motion)
const STEPS = [380, 1900, 1900, 1500, 5600];

export default function AutoRoute({ active }: SlideProps) {
  const c = useCopy(COPY);
  const step = useTimeline(active, STEPS);
  // Step 0 fades the finished picture out; step 1 snaps to the loose pile while faded in.
  const phase = step === 0 ? 4 : step;
  const loose = phase === 1;
  const weighed = phase >= 2;
  const settled = phase >= 3;
  const departed = phase >= 4;
  const tr = (ms: number, delay = 0) => (step === 1 ? "none" : `transform ${ms}ms ${EASE} ${delay}ms, opacity 500ms ease ${delay}ms`);

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
            style={{ opacity: step === 0 ? 0 : 1, transition: `opacity ${step === 0 ? 320 : 520}ms ease` }}
            aria-hidden
          >
            {/* Header: a pile of tasks, then tonight's line. */}
            <div className="absolute left-3 right-3 top-2.5 flex items-center justify-between font-mono text-[11px] tracking-[0.12em]">
              <span style={{ color: C.paperDim }}>{settled ? c.line : c.loose}</span>
              <span style={{ color: C.amber, opacity: loose ? 0 : 1, transition: "opacity 400ms ease" }}>{settled ? c.service : c.weighing}</span>
            </div>

            {/* The line and its stations. */}
            <div
              className="absolute"
              style={{
                left: LINE_X - 1,
                top: ROW_Y(0) + ROW_H / 2,
                width: 2,
                height: ROW_Y(4) - ROW_Y(0),
                background: C.lamp,
                opacity: settled ? 0.7 : 0,
                transform: `scaleY(${settled ? 1 : 0})`,
                transformOrigin: "top",
                transition: step === 1 ? "none" : `transform 1100ms ${EASE} 250ms, opacity 400ms ease 250ms`,
              }}
            />
            {ORDER.map((o, i) => {
              const cy = ROW_Y(i) + ROW_H / 2;
              return (
                <div key={`t-${o.id}`}>
                  <span
                    className="absolute rounded-full border-2"
                    style={{
                      left: LINE_X - 6,
                      top: cy - 6,
                      width: 12,
                      height: 12,
                      borderColor: C.lamp,
                      background: i === 0 ? C.paper : C.panel,
                      opacity: settled ? 1 : 0,
                      transition: tr(400, 350 + i * 120),
                    }}
                  />
                  <span
                    className="absolute text-right font-mono text-[12px] tracking-[0.04em]"
                    style={{
                      left: 2,
                      width: 44,
                      top: cy - 8,
                      color: i === 0 ? C.amber : C.paperDim,
                      opacity: settled ? 1 : 0,
                      transform: settled ? "none" : "translate3d(-6px,0,0)",
                      transition: tr(500, 450 + i * 120),
                    }}
                  >
                    {o.at}
                  </span>
                  <span
                    className="absolute font-mono text-[11px] leading-[1.3] tracking-[0.02em]"
                    style={{
                      left: CARD_X + CARD_W + 12,
                      width: W - (CARD_X + CARD_W + 12) - 6,
                      top: cy - 8,
                      color: i === 0 ? C.amber : C.mist,
                      opacity: departed ? 1 : 0,
                      transform: departed ? "none" : "translate3d(-8px,0,0)",
                      transition: tr(500, 200 + i * 160),
                    }}
                  >
                    ← {c.tasks[o.id].why}
                  </span>
                </div>
              );
            })}

            {/* The task cards: loose and tilted, then in order along the line. */}
            {ORDER.map((o, i) => {
              const t = c.tasks[o.id];
              const [lx, ly, rot] = o.loose;
              const dx = lx - CARD_X;
              const dy = ly - ROW_Y(i);
              const first = i === 0;
              return (
                <div
                  key={o.id}
                  className="absolute rounded-[3px] border-l-4 px-2.5 py-[5px] shadow-[0_6px_14px_-8px_rgba(0,0,0,0.9)]"
                  style={{
                    left: CARD_X,
                    top: ROW_Y(i),
                    width: CARD_W,
                    height: ROW_H,
                    background: "#e9dfc9",
                    color: "#1d2226",
                    borderLeftColor: settled && first ? C.lamp : "#bfb49c",
                    transform: settled ? "none" : `translate3d(${dx}px,${dy}px,0) rotate(${rot}deg)`,
                    transition: step === 1 ? "none" : `transform 1000ms ${EASE} ${i * 90}ms, border-color 400ms ease`,
                    zIndex: 5 - i,
                  }}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[13px] font-medium leading-[1.2]">{t.title}</span>
                    <span className="shrink-0 font-mono text-[11px] opacity-70">{c.dur(o.min)}</span>
                  </div>
                  <div className="mt-[5px] flex gap-1">
                    {t.tags.map((tag, k) => {
                      const lit = weighed && k === t.key;
                      return (
                        <span
                          key={tag}
                          className="rounded-[2px] border px-1 py-[2px] font-mono text-[10px] leading-none tracking-[0.04em]"
                          style={{
                            color: lit ? C.amber : "#4a4b45",
                            background: lit ? "#1d2226" : "transparent",
                            borderColor: lit ? "#1d2226" : "#1d222633",
                            transition: "background 400ms ease, color 400ms ease, border-color 400ms ease",
                          }}
                        >
                          {tag}
                        </span>
                      );
                    })}
                  </div>
                  {/* Rank, while weighing. */}
                  <span
                    className="absolute -left-2.5 -top-2.5 flex h-5 w-5 items-center justify-center rounded-[2px] font-mono text-[11px] font-semibold"
                    style={{
                      background: first ? C.lamp : C.beige,
                      color: "#1d2226",
                      opacity: weighed && !settled ? 1 : 0,
                      transform: weighed && !settled ? "none" : "scale(0.6)",
                      transition: tr(350, weighed && !settled ? 300 + i * 140 : 0),
                    }}
                  >
                    {i + 1}
                  </span>
                </div>
              );
            })}

            {/* The train sets off from the first station. */}
            <div
              className="absolute"
              style={{
                left: LINE_X - 5,
                top: ROW_Y(0) + ROW_H / 2 - 9,
                width: 10,
                height: 18,
                opacity: settled ? 1 : 0,
                transform: `translate3d(0,${departed ? 30 : 0}px,0)`,
                transition: step === 1 ? "none" : `transform 4200ms linear 700ms, opacity 400ms ease 700ms`,
                zIndex: 10,
              }}
            >
              <div className="h-full w-full rounded-[2px] border" style={{ background: C.amber, borderColor: "#0b0d0f" }}>
                <div className="mx-auto mt-[3px] h-[4px] w-[6px] rounded-[1px]" style={{ background: "#0b0d0f" }} />
              </div>
            </div>

            <div
              className="absolute"
              style={{
                left: CARD_X,
                right: 6,
                top: ROW_Y(4) + ROW_H + 8,
                opacity: departed ? 1 : 0,
                transform: departed ? "none" : "translate3d(0,6px,0)",
                transition: tr(600, 400),
              }}
            >
              <Board className="text-[11px]">{c.board}</Board>
            </div>
          </div>
        </Fit>
      }
    />
  );
}
