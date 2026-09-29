"use client";

import type { Locale } from "@/core/types";
import { C, Reveal, useCopy, type SlideProps } from "./kit";

const COPY: Record<Locale, { eyebrow: string; title: string; body: string; start: string; startSub: string; demo: string; demoSub: string; again: string }> = {
  ko: {
    eyebrow: "승차 안내",
    title: "오늘 밤 노선,\n지금 짜 볼까요?",
    body: "할 일을 넣으면 노선이 됩니다. 계획이 틀어져도 노선이 다시 맞춰요.",
    start: "시작하기",
    startSub: "공부 시간과 첫 할 일을 정해요",
    demo: "데모로 둘러보기",
    demoSub: "예시 하루로 바로 타 봐요 · 내 기록은 그대로",
    again: "처음부터 다시",
  },
  en: {
    eyebrow: "Boarding",
    title: "Shall we lay out\ntonight's line?",
    body: "Add what you have to do and it becomes a line. When the plan slips, the line re-plans itself.",
    start: "Get started",
    startSub: "Set your study hours and a first task",
    demo: "Try the demo",
    demoSub: "Ride a sample night right away · your own data stays as it is",
    again: "From the top",
  },
  ja: {
    eyebrow: "ご乗車案内",
    title: "今夜の路線、\nいま組んでみますか？",
    body: "やることを入れると路線になります。計画がずれても、路線が組み直します。",
    start: "はじめる",
    startSub: "勉強時間と最初のタスクを決めます",
    demo: "デモで見てみる",
    demoSub: "サンプルの一日にすぐ乗れます · 自分の記録はそのまま",
    again: "最初から",
  },
  zh: {
    eyebrow: "乘车指南",
    title: "今晚的线路，\n现在排一下？",
    body: "放入要做的事，就成了一条线路。计划被打乱时，线路会自己重排。",
    start: "开始",
    startSub: "设定学习时间和第一件事",
    demo: "先看演示",
    demoSub: "直接乘坐一个示例夜晚 · 你的数据保持不变",
    again: "从头再看",
  },
};

/** The last slide: the way in — set up for real, or ride the demo night. */
export function End({ active, onStart, onDemo, onRestart }: SlideProps & { onStart: () => void; onDemo: () => void; onRestart: () => void }) {
  const c = useCopy(COPY);
  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col items-center justify-center px-6 text-center">
      <Reveal active={active} delay={80}>
        <p className="font-mono text-[0.6875rem] tracking-[0.28em]" style={{ color: C.lamp }}>
          {c.eyebrow.toUpperCase()}
        </p>
      </Reveal>
      <Reveal active={active} delay={200}>
        <h2 className="mt-3 whitespace-pre-line font-display text-[2rem] leading-[1.15] text-paper sm:text-[2.75rem]">{c.title}</h2>
      </Reveal>
      <Reveal active={active} delay={360}>
        <p className="mx-auto mt-4 max-w-md text-paper-dim">{c.body}</p>
      </Reveal>
      <Reveal active={active} delay={520} className="mt-9 grid w-full max-w-xl gap-2.5 sm:grid-cols-2">
        <button
          type="button"
          onClick={onStart}
          className="group flex flex-col items-start rounded-[3px] border border-[#c9b48c] bg-[#e4d6b8] px-4 py-3.5 text-left text-[#1b1a16] transition-colors hover:bg-[#efe3c8]"
        >
          <span className="text-[0.9375rem] font-medium">{c.start} →</span>
          <span className="mt-1 text-xs text-[#4a453a]">{c.startSub}</span>
        </button>
        <button
          type="button"
          onClick={onDemo}
          className="group flex flex-col items-start rounded-[3px] border border-[#3b3f3c] bg-[#0e1216] px-4 py-3.5 text-left text-paper transition-colors hover:border-[#6a6e68]"
        >
          <span className="text-[0.9375rem] font-medium">{c.demo}</span>
          <span className="mt-1 text-xs text-mist">{c.demoSub}</span>
        </button>
      </Reveal>
      <Reveal active={active} delay={680}>
        <button type="button" onClick={onRestart} className="mt-6 min-h-10 px-2 font-mono text-[0.6875rem] tracking-[0.2em] text-haze hover:text-mist">
          ↺ {c.again.toUpperCase()}
        </button>
      </Reveal>
    </div>
  );
}
