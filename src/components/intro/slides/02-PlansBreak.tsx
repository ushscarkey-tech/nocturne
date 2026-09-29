"use client";

import type { CSSProperties } from "react";
import type { Locale } from "@/core/types";
import { C, Reveal, SlideFrame, Tag, useCopy, useReducedMotion, useTimeline, type SlideProps } from "../kit";

interface Copy {
  eyebrow: string;
  title: string;
  body: string;
  /** The two other everyday frustrations, folded in under the main one. */
  more: { label: string; text: string }[];
  plan: string;
  written: string;
  now: string;
  over: string;
  end: string;
  redo: string;
  tasks: [string, string, string, string];
}

const COPY: Record<Locale, Copy> = {
  ko: {
    eyebrow: "문제",
    title: "아침에 짠 계획은\n저녁이면 틀어져요",
    body: "한 과목이 길어지면 뒤의 일정이 전부 밀려요. 남은 저녁은 결국 손으로 다시 짜야 해요.",
    more: [
      { label: "순서", text: "무엇부터 할지 매일 다시 고민해요. 마감·중요도·흥미·난이도가 서로 부딪혀요." },
      { label: "집중", text: "집중이 흐린 날에도 계획은 그대로예요. 타이머는 시간만 세요." },
    ],
    plan: "오늘 저녁 계획",
    written: "아침 07:40 작성",
    now: "지금",
    over: "+70분",
    end: "저녁 끝",
    redo: "손으로 다시\n짜야 해요",
    tasks: ["수학", "영어", "물리", "과제"],
  },
  en: {
    eyebrow: "The problem",
    title: "Morning plans\nbreak by evening",
    body: "One subject runs long and everything after it slides. The rest of the evening has to be redone by hand.",
    more: [
      { label: "Order", text: "Every day you decide again what comes first, with deadline, importance, interest and difficulty pulling apart." },
      { label: "Focus", text: "On a low-focus day the plan stays the same, and a timer only counts the minutes." },
    ],
    plan: "Tonight's plan",
    written: "written 07:40 am",
    now: "now",
    over: "+70 min",
    end: "evening ends",
    redo: "Redo it\nby hand",
    tasks: ["Math", "English", "Physics", "Essay"],
  },
  ja: {
    eyebrow: "問題",
    title: "朝立てた計画は、\n夜には崩れる",
    body: "一科目が長引くと、その後ろが全部ずれます。残りの夜は、手で組み直すことになります。",
    more: [
      { label: "順番", text: "何から始めるか、毎日また迷います。締切・重要度・興味・難しさがぶつかります。" },
      { label: "集中", text: "集中できない日も、計画はそのまま。タイマーは時間を数えるだけです。" },
    ],
    plan: "今夜の計画",
    written: "朝 07:40 作成",
    now: "いま",
    over: "+70分",
    end: "夜の終わり",
    redo: "手で組み直し",
    tasks: ["数学", "英語", "物理", "課題"],
  },
  zh: {
    eyebrow: "问题",
    title: "早上排好的计划，\n到晚上就乱了",
    body: "一门课拖长，后面的安排全都往后推。剩下的晚上只能手动重排。",
    more: [
      { label: "顺序", text: "每天都要重新纠结先做哪个：截止、重要性、兴趣、难度互相打架。" },
      { label: "专注", text: "状态差的日子，计划照旧，计时器也只会计时。" },
    ],
    plan: "今晚的计划",
    written: "早上 07:40 制定",
    now: "现在",
    over: "+70分钟",
    end: "晚间结束",
    redo: "只能手动重排",
    tasks: ["数学", "英语", "物理", "作业"],
  },
};

/*
 * The picture is laid out in container units (1cqw = 1% of the stage's width;
 * the stage is 4:3, so its height is 75cqw), so it scales as one piece from a
 * phone to a projector.
 *
 * Time runs down the stage: 19:30 near the top, midnight at the bottom.
 */
const TOP = 12; // cqw, where 19:30 sits
const START = 19 * 60 + 30;
const PER_MIN = 62 / 270; // cqw per minute: 19:30 → 24:00 fills 62cqw
const y = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return TOP + (h * 60 + m - START) * PER_MIN;
};
const cq = (n: number) => `${n.toFixed(2)}cqw`;

const OVER_MIN = 70;
const SHIFT = OVER_MIN * PER_MIN;
const X0 = 17; // blocks' left edge
const X1 = 63; // blocks' right edge

/** The evening as written in the morning, and where each block ends up after the first one runs 70 minutes over. */
const BLOCKS = [
  { from: "19:40", to: "20:30", moved: null },
  { from: "20:30", to: "21:10", moved: ["21:40", "22:20"] },
  { from: "21:10", to: "22:00", moved: ["22:20", "23:10"] },
  { from: "22:00", to: "22:40", moved: ["23:10", "23:50"] },
] as const;

const EASE = "cubic-bezier(0.22,1,0.36,1)";

/*
 * Steps: 0 the plan as written, math under way · 1 math runs 70 min over while
 * the clock moves on · 2 everything after it is shoved down, past 23:00 turns
 * red · 3 the last one slides off, the plan is struck, "redo by hand" · 4 fade
 * out before the loop starts again.
 */
const STEPS = [2000, 1900, 1500, 3600, 500];

/** Problem: a plan made in the morning comes apart by evening (and the two other everyday snags, briefly). */
export default function PlansBreak({ active }: SlideProps) {
  const c = useCopy(COPY);
  return (
    <SlideFrame
      active={active}
      tone="problem"
      eyebrow={c.eyebrow}
      title={c.title}
      body={
        <>
          <p>{c.body}</p>
          <Reveal active={active} delay={3400}>
            <ul className="mt-5 space-y-3 border-t pt-4 md:mt-6" style={{ borderColor: C.rule }}>
              {c.more.map((m) => (
                <li key={m.label} className="flex items-start gap-3">
                  <Tag color={C.signal} className="mt-[3px] shrink-0">
                    {m.label}
                  </Tag>
                  <span className="text-[0.875rem] leading-snug text-paper-dim md:text-[0.9375rem]">{m.text}</span>
                </li>
              ))}
            </ul>
          </Reveal>
        </>
      }
      visual={<Evening active={active} c={c} />}
    />
  );
}

function Evening({ active, c }: { active: boolean; c: Copy }) {
  const reduce = useReducedMotion();
  const step = useTimeline(active, STEPS);
  // Reduced motion: the finished picture, still (not the fade-out step).
  const s = reduce ? 3 : step;
  const still = reduce || s === 0; // snap back invisibly while fading in
  const tr = (props: string, ms: number, delay = 0) =>
    still ? "none" : props.split(",").map((p) => `${p.trim()} ${ms}ms ${EASE} ${delay}ms`).join(", ");

  const running = s >= 1;
  const shoved = s >= 2;
  const broken = s >= 3;

  const text: CSSProperties = { fontSize: `max(${cq(3.3)}, 11.5px)` };
  const mono: CSSProperties = { fontSize: `max(${cq(2.35)}, 9px)` };

  return (
    <div
      className="absolute inset-0 select-none"
      style={{
        containerType: "size",
        opacity: s === 4 ? 0 : 1,
        transition: reduce ? "none" : "opacity 450ms ease",
      }}
      aria-hidden
    >
      {/* Header: the plan's name (struck through once it's wrong) and when it was written. */}
      <div className="absolute flex items-baseline justify-between" style={{ left: cq(4), right: cq(4), top: cq(3.6) }}>
        <span className="relative font-mono tracking-[0.14em] text-paper-dim" style={mono}>
          {c.plan.toUpperCase()}
          <span
            className="absolute left-[-2%] top-1/2 h-[2px] w-[104%] origin-left"
            style={{ background: C.signal, transform: broken ? "scaleX(1)" : "scaleX(0)", transition: tr("transform", 500, 500) }}
          />
        </span>
        <span className="font-mono tracking-[0.08em]" style={{ ...mono, color: C.haze }}>
          {c.written}
        </span>
      </div>

      {/* Hour lines and times down the left. */}
      {["20:00", "21:00", "22:00"].map((t) => (
        <div key={t} className="absolute" style={{ left: cq(4), right: cq(4), top: cq(y(t)) }}>
          <div className="absolute h-px" style={{ left: cq(9.5), right: 0, background: C.rule }} />
          <span className="absolute -translate-y-1/2 font-mono tabular-nums" style={{ ...mono, color: C.haze }}>
            {t}
          </span>
        </div>
      ))}

      {/* The end of the evening, and the red zone past it. */}
      <div className="absolute inset-x-0 bottom-0" style={{ top: cq(y("23:00")), background: `${C.signal}26` }} />
      <div className="absolute" style={{ left: cq(4), right: cq(4), top: cq(y("23:00")) }}>
        <div className="absolute border-t-2 border-dashed" style={{ left: cq(9.5), right: 0, borderColor: C.signal }} />
        <span className="absolute -translate-y-1/2 font-mono tabular-nums" style={{ ...mono, color: C.signal }}>
          23:00
        </span>
        <span className="absolute right-0 -translate-y-[125%] whitespace-nowrap font-mono tracking-[0.08em]" style={{ ...mono, color: C.signal }}>
          {c.end}
        </span>
      </div>

      {/* Math runs over: a hatched tail grows under its block while the clock moves on. */}
      <div
        className="absolute origin-top rounded-b-[3px] border border-t-0 border-dashed"
        style={{
          left: cq(X0),
          width: cq(X1 - X0),
          top: cq(y("20:30")),
          height: cq(SHIFT),
          borderColor: C.signal,
          background: `repeating-linear-gradient(135deg, ${C.signal}73 0 6px, ${C.signal}26 6px 12px)`,
          transform: running ? "scaleY(1)" : "scaleY(0)",
          transition: s === 1 ? `transform 1320ms linear 380ms` : tr("transform", 400),
        }}
      >
        <span
          className="absolute inset-0 grid place-items-center font-mono font-medium tracking-[0.06em]"
          style={{ fontSize: `max(${cq(3.4)}, 11px)`, color: C.paper, opacity: running ? 1 : 0, transition: tr("opacity", 400, 900) }}
        >
          {c.over}
        </span>
      </div>

      {/* The four blocks. */}
      {BLOCKS.map((b, i) => {
        const moved = b.moved && shoved;
        const past = moved && y(b.moved[1]) > y("23:00") + 0.1;
        const falls = i === 3 && broken;
        const dy = moved ? SHIFT : 0;
        const transform = falls ? `translate3d(${cq(2)},${cq(dy + 3)},0) rotate(-6deg)` : `translate3d(0,${cq(dy)},0)`;
        const time = moved ? `${b.moved[0]}–${b.moved[1]}` : `${b.from}–${b.to}`;
        return (
          <div
            key={i}
            className="absolute"
            style={{
              left: cq(X0),
              width: cq(X1 - X0),
              top: cq(y(b.from) + 0.35),
              height: cq(y(b.to) - y(b.from) - 0.7),
              transform,
              opacity: falls ? 0.85 : 1,
              transition: tr("transform, opacity", falls ? 900 : 850, falls ? 150 : shoved && !broken ? 90 * i : 0),
            }}
          >
            <div
              className="relative flex h-full items-center justify-between gap-2 overflow-hidden rounded-[3px] border-l-4 shadow-[0_6px_14px_-8px_rgba(0,0,0,0.8)]"
              style={{
                paddingLeft: cq(2.4),
                paddingRight: cq(2.4),
                background: "#e9dfc9",
                color: "#1d2226",
                borderLeftColor: i === 0 ? C.lamp : past ? "#8e5446" : "#bfb49c",
              }}
            >
              {/* Turns signal red once it no longer fits the evening. */}
              <div className="absolute inset-0" style={{ background: C.signal, opacity: past ? 1 : 0, transition: tr("opacity", 500, 350) }} />
              <span className="relative truncate font-medium leading-none" style={text}>
                {c.tasks[i]}
              </span>
              <span className="relative shrink-0 font-mono tabular-nums leading-none" style={{ ...mono, color: moved ? "#5a1f14" : "#4a4a44" }}>
                {time}
              </span>
            </div>
          </div>
        );
      })}

      {/* Now: an amber line moving down while math is still going. */}
      <div
        className="absolute"
        style={{
          left: cq(X0 - 2),
          right: cq(3),
          top: cq(y("19:40")),
          transform: `translate3d(0,${cq((running ? y("21:40") : y("20:10")) - y("19:40"))},0)`,
          transition: s === 1 ? "transform 1700ms linear" : tr("transform", 400),
        }}
      >
        <div className="absolute h-[2px]" style={{ left: 0, width: cq(X1 - X0 + 4), background: C.amber, top: -1 }} />
        <span
          className="absolute -translate-y-1/2 rounded-[2px] font-mono tracking-[0.1em]"
          style={{ ...mono, left: cq(X1 - X0 + 5), color: "#0b0d0f", background: C.amber, padding: `${cq(0.5)} ${cq(1.2)}` }}
        >
          {c.now}
        </span>
      </div>

      {/* The verdict: the plan is wrong now, and fixing it is on you. */}
      <div
        className="absolute whitespace-pre-line rounded-[2px] border font-mono leading-snug tracking-[0.06em]"
        style={{
          right: cq(3),
          width: cq(31),
          top: cq(y("23:12")),
          wordBreak: "keep-all",
          padding: `${cq(1.4)} ${cq(1.8)}`,
          fontSize: `max(${cq(2.9)}, 10px)`,
          background: "#0b0d0f",
          borderColor: `${C.signal}99`,
          color: C.signal,
          opacity: broken ? 1 : 0,
          transform: broken ? "none" : `translate3d(0,${cq(1.5)},0)`,
          transition: tr("opacity, transform", 600, 600),
        }}
      >
        {c.redo}
      </div>
    </div>
  );
}
