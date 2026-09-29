"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import type { Locale } from "@/core/types";
import { C, SlideFrame, useCopy, useReducedMotion, useTimeline, type SlideProps } from "../kit";

interface Copy {
  eyebrow: string;
  title: string;
  body: string;
  asideView: string;
  asideLearn: string;
  machine: string;
  nightService: string;
  platform: string;
  now: string;
  route: string;
  focus: string;
  carriage: string;
  routeValue: string;
  focusValue: string;
  carriageValue: string;
  firstStation: string;
  task: string;
  confirm: string;
  ticket: string;
  toStation: string;
  arrivesAt: string;
  carSeat: string;
  stop: string;
  depart: string;
  running: string;
  standing: string;
  servicePaused: string;
  finalAhead: string;
  arrived: string;
  stamp: string;
  ticketLine: string;
  from: string;
  to: string;
}

const COPY: Record<Locale, Copy> = {
  ko: {
    eyebrow: "기능 · 탑승과 집중",
    title: "탑승하면,\n집중이 시작돼요",
    body: "승차권을 받고 타면 타이머가 돌고 창밖이 흘러요. 멈추면 기차도 서고, 끝나면 역에 들어서며 승차권에 도착 도장이 찍혀요.",
    asideView: "창밖은 실제 시각을 따라 새벽, 낮, 노을, 밤으로 바뀌고, 비가 오거나 터널에 들어가요. 터널 모드는 화면을 어둡게 낮춰요.",
    asideLearn: "탄 시간은 기록에 남아요. 예상보다 늘 오래 걸리는 일은 다음부터 내 속도에 맞춰 제안해요.",
    machine: "발권기",
    nightService: "야간 운행",
    platform: "08번 승강장",
    now: "지금",
    route: "노선",
    focus: "컨디션",
    carriage: "객차",
    routeValue: "어스름 → 한밤",
    focusValue: "보통",
    carriageValue: "빗소리 객차",
    firstStation: "첫 정거장",
    task: "물리 문제집",
    confirm: "노선 확인",
    ticket: "승차권",
    toStation: "→ 한밤",
    arrivesAt: "22:40 도착",
    carSeat: "07호차 · 10B",
    stop: "정차",
    depart: "출발",
    running: "운행 중",
    standing: "정차 중",
    servicePaused: "운행 일시 중지",
    finalAhead: "종착역이 다가와요",
    arrived: "도착 · 한밤",
    stamp: "도착",
    ticketLine: "야간 노선 · 빗소리 객차",
    from: "어스름",
    to: "한밤",
  },
  en: {
    eyebrow: "Feature · Ride and focus",
    title: "Board, and\nthe focus begins",
    body: "Take your ticket and board: the timer runs and the view slides by. Stop, and the train stops too. At the end it pulls into the station and your ticket gets its arrival stamp.",
    asideView: "The window follows the real time of day, from dawn to day, dusk and night, with rain and tunnels. Tunnel mode dims everything for deep focus.",
    asideLearn: "Every ride is recorded. Work that keeps running long gets suggested at your real pace next time.",
    machine: "Ticket machine",
    nightService: "Night service",
    platform: "Platform 08",
    now: "Now",
    route: "Route",
    focus: "Focus",
    carriage: "Carriage",
    routeValue: "Blue Hour → Midnight",
    focusValue: "Steady",
    carriageValue: "Rain Car",
    firstStation: "First station",
    task: "Physics workbook",
    confirm: "Confirm route",
    ticket: "Ticket",
    toStation: "→ Midnight",
    arrivesAt: "· arrives 22:40",
    carSeat: "Car 07 · 10B",
    stop: "Stop",
    depart: "Depart",
    running: "Running",
    standing: "Standing",
    servicePaused: "Service paused",
    finalAhead: "Final station ahead",
    arrived: "Arrived · Midnight",
    stamp: "ARRIVED",
    ticketLine: "Night line · Rain car",
    from: "BLUE HOUR",
    to: "MIDNIGHT",
  },
  ja: {
    eyebrow: "機能 · 乗車と集中",
    title: "乗車したら、\n集中が始まります",
    body: "乗車券を受け取って乗ると、タイマーが動き、窓の外が流れます。止めれば列車も止まり、終わると駅に着いて乗車券に到着の印が押されます。",
    asideView: "窓の外は実際の時刻に合わせて夜明け、昼、夕暮れ、夜と変わり、雨やトンネルもあります。トンネルモードは画面を暗く落とします。",
    asideLearn: "乗った時間は記録に残ります。いつも長くかかる仕事は、次から自分のペースに合わせて提案します。",
    machine: "発券機",
    nightService: "夜行便",
    platform: "8番線",
    now: "いま",
    route: "経路",
    focus: "調子",
    carriage: "号車",
    routeValue: "BLUE HOUR → MIDNIGHT",
    focusValue: "ふつう",
    carriageValue: "雨の車両",
    firstStation: "最初の駅",
    task: "物理の問題集",
    confirm: "経路を確認",
    ticket: "乗車券",
    toStation: "→ MIDNIGHT",
    arrivesAt: "22:40 着",
    carSeat: "7号車 · 10B",
    stop: "停車",
    depart: "発車",
    running: "運行中",
    standing: "停車中",
    servicePaused: "運行一時停止",
    finalAhead: "まもなく終着駅",
    arrived: "到着 · MIDNIGHT",
    stamp: "到着",
    ticketLine: "夜行線 · 雨の車両",
    from: "BLUE HOUR",
    to: "MIDNIGHT",
  },
  zh: {
    eyebrow: "功能 · 乘车与专注",
    title: "上了车，\n专注就开始了",
    body: "拿到车票上车，计时开始，窗外风景流动。停下来，列车也停下；结束时列车进站，车票盖上到达印章。",
    asideView: "窗外跟着真实时间变化：黎明、白天、黄昏、夜晚，还有雨和隧道。隧道模式会把画面调暗，方便深度专注。",
    asideLearn: "每次乘车都会记录。总是超时的事，下次会按你真实的速度来建议。",
    machine: "购票机",
    nightService: "夜间班次",
    platform: "08号站台",
    now: "现在",
    route: "路线",
    focus: "状态",
    carriage: "车厢",
    routeValue: "BLUE HOUR → MIDNIGHT",
    focusValue: "平稳",
    carriageValue: "雨声车厢",
    firstStation: "第一站",
    task: "物理练习册",
    confirm: "确认路线",
    ticket: "车票",
    toStation: "→ MIDNIGHT",
    arrivesAt: "22:40 到达",
    carSeat: "07 车厢 · 10B",
    stop: "停车",
    depart: "发车",
    running: "运行中",
    standing: "停车中",
    servicePaused: "运行已暂停",
    finalAhead: "即将到达终点站",
    arrived: "到达 · MIDNIGHT",
    stamp: "到达",
    ticketLine: "夜间线路 · 雨声车厢",
    from: "BLUE HOUR",
    to: "MIDNIGHT",
  },
};

/*
 * The ride, step by step (ms each step holds):
 * 0 machine · 1 focus set · 2 carriage set · 3 route confirmed, ticket feeds out ·
 * 4 riding · 5 stopped · 6 riding again · 7 braking into the last station · 8 arrived, stamped.
 */
const STEPS = [500, 450, 550, 1600, 2200, 1500, 1500, 1400, 2600];
const STATION = 40 * 60;

/** Keyframes and the few invented classes, all prefixed with this slide's id. */
const CSS = `
@keyframes intro10-slide { from { transform: translate3d(0,0,0); } to { transform: translate3d(-50%,0,0); } }
@keyframes intro10-rain { from { transform: translate3d(0,-50%,0); } to { transform: translate3d(0,0,0); } }
`;

const EASE = "cubic-bezier(0.22,1,0.36,1)";

/** The picture scales with its stage: everything inside is sized in em off the stage's width. */
function Stage({ children }: { children: ReactNode }) {
  return (
    <div className="absolute inset-0" style={{ containerType: "size" }}>
      <div className="absolute inset-0 overflow-hidden" style={{ fontSize: "clamp(8.5px, 2.55cqw, 14px)" }}>
        {children}
      </div>
    </div>
  );
}

const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** The countdown on the glass: runs from `from` to `to` seconds over `ms` (a time-lapse). Remount to restart. */
function Countdown({ from, to, ms, brake = false }: { from: number; to: number; ms: number; brake?: boolean }) {
  const [v, setV] = useState(from);
  useEffect(() => {
    if (from === to) return;
    const t0 = performance.now();
    const id = setInterval(() => {
      const p = Math.min(1, (performance.now() - t0) / ms);
      const e = brake ? 1 - (1 - p) * (1 - p) : p;
      setV(Math.round(from + (to - from) * e));
      if (p >= 1) clearInterval(id);
    }, 50);
    return () => clearInterval(id);
  }, [from, to, ms, brake]);
  return <>{mmss(v)}</>;
}

/** A paper ticket, drawn small: times, stations, perforation, the rain car's band, and the stamp when it has arrived. */
function Ticket({ c, stamped, style }: { c: Copy; stamped: boolean; style?: CSSProperties }) {
  const ink = "#1d2226";
  const red = "#a3332a";
  return (
    <div
      className="relative overflow-hidden rounded-[3px]"
      style={{ width: "17em", background: "#ece2cc", color: ink, boxShadow: "0 0.6em 1.4em -0.6em rgba(0,0,0,0.85)", ...style }}
    >
      <div className="px-[0.9em] pb-[0.5em] pt-[0.65em]">
        <div className="flex items-baseline justify-between font-mono">
          <span className="text-[0.72em] font-bold tracking-[0.24em]">NOCTURNE</span>
          <span className="text-[0.55em] tracking-[0.12em] opacity-70">SEP 29 2026</span>
        </div>
        <p className="mt-[0.15em] font-mono text-[0.5em] tracking-[0.14em] opacity-60">{c.ticketLine.toUpperCase()}</p>
        <div className="mt-[0.35em] flex items-center justify-between font-mono text-[1.35em] leading-none tracking-[0.02em]">
          <span>22:00</span>
          <span className="text-[0.7em] opacity-50">→</span>
          <span>22:40</span>
        </div>
        <div className="mt-[0.4em] flex items-center gap-[0.4em] font-mono text-[0.55em] tracking-[0.08em]">
          <span>{c.from}</span>
          <span className="h-px flex-1" style={{ background: `${ink}55` }} />
          <span>{c.to}</span>
        </div>
      </div>
      {/* perforation */}
      <div className="relative mx-[0.9em] border-t border-dashed" style={{ borderColor: `${ink}55` }} />
      <div className="flex items-center justify-between px-[0.9em] pb-[0.55em] pt-[0.45em] font-mono text-[0.5em] tracking-[0.14em] opacity-70">
        <span>TRAIN NL-0929-08</span>
        <span>{c.carSeat.toUpperCase()}</span>
      </div>
      <div style={{ height: "0.45em", background: "#4c5f7a" }} />
      {/* notches on the perforation */}
      <span className="absolute left-[-0.35em] h-[0.7em] w-[0.7em] rounded-full" style={{ top: "calc(100% - 2.05em)", background: C.panel }} />
      <span className="absolute right-[-0.35em] h-[0.7em] w-[0.7em] rounded-full" style={{ top: "calc(100% - 2.05em)", background: C.panel }} />
      {/* the arrival stamp, brought down across the perforation */}
      <div
        className="pointer-events-none absolute"
        style={{
          right: "3.4em",
          bottom: "-0.1em",
          width: "4.9em",
          height: "4.9em",
          mixBlendMode: "multiply",
          opacity: stamped ? 0.85 : 0,
          transform: stamped ? "rotate(-14deg) scale(1)" : "rotate(-14deg) scale(1.6)",
          transition: stamped ? `opacity 220ms ease-out 450ms, transform 380ms cubic-bezier(0.2,0.9,0.3,1.2) 450ms` : "none",
        }}
        aria-hidden
      >
        <svg viewBox="0 0 100 100" className="h-full w-full">
          <g fill="none" stroke={red}>
            <circle cx="50" cy="50" r="46" strokeWidth="3.6" />
            <circle cx="50" cy="50" r="40" strokeWidth="1.3" />
            <path d="M16 41h68M16 63h68" strokeWidth="1.3" />
          </g>
          <g fill={red} textAnchor="middle">
            <text x="50" y="33" fontSize="8.5" letterSpacing="2.2" fontFamily="var(--font-mono)">
              NOCTURNE
            </text>
            <text x="50" y="58.5" fontSize={c.stamp.length > 3 ? 11 : 15} fontWeight="700" letterSpacing={c.stamp.length > 3 ? 1 : 3} fontFamily="var(--font-sans)">
              {c.stamp}
            </text>
            <text x="50" y="76" fontSize="9.5" letterSpacing="1.2" fontFamily="var(--font-mono)">
              22:40
            </text>
          </g>
        </svg>
      </div>
    </div>
  );
}

/** The station's ticket machine: the board fills in, the key goes down, the ticket feeds out of the slot. */
function Machine({ c, step }: { c: Copy; step: number }) {
  const focusSet = step >= 1;
  const carSet = step >= 2;
  const pressed = step === 3;
  const out = step >= 3;
  const row = (label: string, value: string, set: boolean) => (
    <div className="flex items-baseline gap-[0.8em] text-[0.78em] leading-[1.9]">
      <span className="w-[5.2em] shrink-0 font-mono tracking-[0.06em]" style={{ color: set ? C.paperDim : C.haze }}>
        {label}
      </span>
      <span className="relative min-w-0 flex-1 truncate" style={{ color: C.amber }}>
        <span style={{ opacity: set ? 0 : 1, transition: "opacity 200ms", color: C.haze }}>—</span>
        <span className="absolute left-0 top-0" style={{ opacity: set ? 1 : 0, transform: set ? "none" : "translateY(0.3em)", transition: `opacity 300ms, transform 400ms ${EASE}` }}>
          {value}
        </span>
      </span>
    </div>
  );
  return (
    <div className="absolute left-1/2 top-[1.1em] w-[23em] -translate-x-1/2">
      <div className="relative z-10 overflow-hidden rounded-[4px]" style={{ background: "#d6c9ad", boxShadow: "0 1em 2em -1em rgba(0,0,0,0.9)" }}>
        <div className="flex items-center justify-between px-[0.9em] py-[0.5em]" style={{ background: C.navy, borderBottom: "2px solid #8a4a3a" }}>
          <span className="font-mono text-[0.68em] font-bold tracking-[0.3em]" style={{ color: C.paper }}>
            NOCTURNE
          </span>
          <span className="flex items-center gap-[0.45em] font-mono text-[0.58em] tracking-[0.12em]" style={{ color: C.paperDim }}>
            {c.machine}
            <span className="inline-block h-[0.55em] w-[0.55em] rounded-full" style={{ background: "#5fa37b" }} />
          </span>
        </div>
        <div className="p-[0.8em]">
          <div className="rounded-[2px] border px-[0.9em] py-[0.7em]" style={{ background: "#0e1210", borderColor: "#2a2e2b" }}>
            <div className="flex justify-between font-mono text-[0.55em] tracking-[0.14em]" style={{ color: C.lamp }}>
              <span>{c.nightService.toUpperCase()}</span>
              <span>{c.platform.toUpperCase()}</span>
            </div>
            <p className="mt-[0.25em] font-mono text-[1.9em] leading-[1.15]" style={{ color: C.paper }}>
              {c.now} <span style={{ color: C.paperDim }}>→</span> 22:40
            </p>
            <div className="mt-[0.35em] border-t pt-[0.3em]" style={{ borderColor: "#262a27" }}>
              {row(c.route, c.routeValue, true)}
              {row(c.focus, c.focusValue, focusSet)}
              {row(c.carriage, c.carriageValue, carSet)}
            </div>
            <p className="mt-[0.2em] text-[0.72em]" style={{ color: C.paperDim }}>
              <span className="font-mono text-[0.85em] tracking-[0.06em]" style={{ color: C.mist }}>
                {c.firstStation}
              </span>{" "}
              <span style={{ color: C.amber }}>{c.task}</span>
            </p>
          </div>
          <div
            className="mt-[0.7em] flex h-[2.3em] items-center justify-center rounded-[3px] text-[0.8em] font-medium"
            style={{
              background: pressed || out ? "#c98534" : "#e39a3e",
              color: "#1b1a16",
              boxShadow: pressed ? "inset 0 0.15em 0 rgba(0,0,0,0.25)" : "0 0.2em 0 #9c6424",
              transform: pressed ? "translateY(0.2em)" : "none",
              transition: "transform 120ms, box-shadow 120ms, background 200ms",
            }}
          >
            {c.confirm}
          </div>
          <p className="mt-[0.55em] text-center font-mono text-[0.55em] tracking-[0.2em]" style={{ color: "#6d6452" }}>
            ▼ {c.ticket.toUpperCase()}
          </p>
          <div className="mx-auto -mb-[0.35em] mt-[0.3em] h-[0.55em] w-[19em] rounded-[1px]" style={{ background: "#0a0c0e" }} />
        </div>
      </div>
      {/* the ticket, fed out from under the slot */}
      <div className="relative mx-auto -mt-[0.9em] h-[9em] w-[19em] overflow-hidden">
        <div
          className="absolute left-1/2 top-0"
          style={{
            transform: out ? "translate3d(-50%,0,0)" : "translate3d(-50%,-100%,0)",
            transition: out ? `transform 850ms cubic-bezier(0.45,0,0.2,1) 150ms` : "none",
          }}
        >
          <Ticket c={c} stamped={false} />
        </div>
      </div>
    </div>
  );
}

/* The view: three layers of the same night sliding past at different speeds, each tile drawn twice so it loops. */
const W = 200;

function Hills() {
  return <path d="M0 64 C 18 56 30 52 48 58 S 80 50 100 56 S 132 62 150 54 S 185 58 200 64 V100 H0Z" fill="#161e2b" />;
}

function Town() {
  const blocks = [
    { x: 6, w: 18, h: 30 },
    { x: 27, w: 12, h: 20 },
    { x: 44, w: 22, h: 38 },
    { x: 70, w: 14, h: 24 },
    { x: 90, w: 20, h: 32 },
    { x: 116, w: 10, h: 18 },
    { x: 130, w: 24, h: 42 },
    { x: 158, w: 14, h: 26 },
    { x: 176, w: 18, h: 34 },
  ];
  const lit = new Set(["0-0", "0-2", "2-1", "2-4", "3-0", "4-2", "6-0", "6-3", "6-5", "7-1", "8-2", "8-0"]);
  return (
    <g>
      {blocks.map((b, i) => (
        <g key={i}>
          <rect x={b.x} y={88 - b.h} width={b.w} height={b.h + 12} fill="#0b1017" />
          {Array.from({ length: Math.floor((b.h - 6) / 6) }, (_, r) =>
            Array.from({ length: Math.floor((b.w - 3) / 5) }, (_, k) => {
              const on = lit.has(`${i}-${r * 2 + k}`);
              return (
                <rect
                  key={`${r}-${k}`}
                  x={b.x + 2.2 + k * 5}
                  y={88 - b.h + 3 + r * 6}
                  width={2.4}
                  height={2.8}
                  fill={on ? C.lamp : "#151c27"}
                  opacity={on ? 0.9 : 1}
                />
              );
            }),
          )}
        </g>
      ))}
    </g>
  );
}

function Trackside() {
  return (
    <g fill="#07090c">
      <rect x="0" y="89" width={W} height="11" />
      {[10, 60, 110, 160].map((x) => (
        <g key={x}>
          <rect x={x} y="20" width="1.8" height="72" />
          <rect x={x - 3} y="24" width="8" height="1.2" />
        </g>
      ))}
      {Array.from({ length: 20 }, (_, i) => (
        <rect key={i} x={i * 10 + 3} y="84" width="1" height="6" />
      ))}
      <rect x="0" y="84.5" width={W} height="0.8" />
    </g>
  );
}

function Rain() {
  // Short slanted streaks, placed by a fixed pattern so the picture is the same every time.
  const drops = Array.from({ length: 46 }, (_, i) => ({ x: (i * 37) % 100, y: (i * 61) % 100, l: 3 + ((i * 7) % 4) }));
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="block h-1/2 w-full">
      {drops.map((d, i) => (
        <line key={i} x1={d.x} y1={d.y} x2={d.x - d.l * 0.5} y2={d.y + d.l} stroke="#aab4c2" strokeWidth="0.35" opacity="0.35" vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  );
}

function Layer({ seconds, running, offset, braking, children }: { seconds: number; running: boolean; offset: number; braking: number; children: ReactNode }) {
  return (
    <div
      className="absolute inset-y-0 left-0 w-[200%]"
      style={{ transform: `translate3d(${-offset}%,0,0)`, transition: braking ? `transform ${braking}ms cubic-bezier(0.15,0.6,0.3,1)` : "none" }}
    >
      <div className="absolute inset-0 flex" style={{ animation: `intro10-slide ${seconds}s linear infinite`, animationPlayState: running ? "running" : "paused" }}>
        {[0, 1].map((k) => (
          <svg key={k} viewBox={`0 0 ${W} 100`} preserveAspectRatio="none" className="h-full w-1/2 shrink-0">
            {children}
          </svg>
        ))}
      </div>
    </div>
  );
}

/** Inside the carriage: the window with the countdown on the glass, the stop key, and the ticket at the end. */
function Cabin({ c, step, reduce }: { c: Copy; step: number; reduce: boolean }) {
  const running = !reduce && (step === 4 || step === 6);
  const stopped = step === 5;
  const braking = step === 7;
  const arrived = step >= 8;
  // How far each layer rolls on after the brakes go on (percent of its own strip), so stopping eases out.
  const rolled = (k: number) => (step >= 7 ? k * 2.6 : step >= 5 ? k : 0);
  const brakeMs = step >= 7 ? 1400 : step >= 5 ? 800 : 0;

  const countdown =
    step <= 4 ? <Countdown key="a" from={STATION} to={step === 4 ? 28 * 60 : STATION} ms={2300} />
    : step <= 5 ? <Countdown key="b" from={28 * 60} to={28 * 60} ms={1} />
    : step === 6 ? <Countdown key="c" from={28 * 60} to={4 * 60} ms={1500} />
    : step === 7 ? <Countdown key="d" from={4 * 60} to={0} ms={1300} brake />
    : <Countdown key="e" from={0} to={0} ms={1} />;
  const progress = step <= 3 ? 0 : step <= 5 ? 0.3 : step === 6 ? 0.9 : 1;
  const progressMs = step === 4 ? 2300 : step === 6 ? 1500 : step === 7 ? 1300 : 0;

  const board = arrived ? c.arrived : braking ? c.finalAhead : stopped ? c.servicePaused : `22:00 ${c.toStation} ${c.arrivesAt}`;

  return (
    <div className="absolute inset-0">
      {/* the board over the window */}
      <div className="absolute left-1/2 top-[0.8em] z-10 -translate-x-1/2 whitespace-nowrap rounded-[2px] border px-[0.9em] py-[0.35em] font-mono text-[0.74em] tracking-[0.1em]" style={{ background: "#0b0d0f", borderColor: "#3b3f3c", color: stopped ? C.signal : C.amber }}>
        {board}
        <span className="mx-[0.7em] opacity-40">|</span>
        {c.carSeat}
      </div>

      {/* the window */}
      <div className="absolute left-[1.3em] right-[1.3em] top-[3em] h-[20.6em] rounded-[1.7em] p-[0.85em]" style={{ background: "#5c615e", boxShadow: "inset 0 0.15em 0 #7d827e, inset 0 -0.2em 0 #3d413f" }}>
        <div className="relative h-full w-full overflow-hidden rounded-[1.1em]" style={{ background: "linear-gradient(180deg,#0b1220 0%,#1a2539 58%,#2c374a 100%)", boxShadow: "inset 0 0 0 0.25em #1c1f1e" }}>
          {/* stars and moon stay put: they're far away */}
          <svg viewBox="0 0 200 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
            {[
              [22, 12],
              [48, 22],
              [75, 9],
              [118, 18],
              [96, 30],
              [140, 8],
              [182, 26],
            ].map(([x, y]) => (
              <rect key={`${x}`} x={x} y={y} width="0.7" height="1.2" fill="#c9c1ae" opacity="0.55" />
            ))}
          </svg>
          <div className="absolute right-[16%] top-[12%] h-[2.2em] w-[2.2em] rounded-full" style={{ background: "#e6dcc4", opacity: 0.85 }} />

          <Layer seconds={40} running={running} offset={rolled(0.4)} braking={brakeMs}>
            <Hills />
          </Layer>
          <Layer seconds={13} running={running} offset={rolled(1.3)} braking={brakeMs}>
            <Town />
          </Layer>
          <Layer seconds={1.8} running={running} offset={rolled(7)} braking={brakeMs}>
            <Trackside />
          </Layer>

          {/* rain keeps falling, moving or not */}
          <div className="absolute inset-x-0 top-0 h-[200%]" style={{ animation: "intro10-rain 0.7s linear infinite", animationPlayState: reduce ? "paused" : "running" }} aria-hidden>
            <Rain />
            <Rain />
          </div>

          {/* the countdown on the glass */}
          <div className="absolute bottom-[0.9em] left-[0.9em] rounded-[3px] px-[0.9em] pb-[0.6em] pt-[0.5em]" style={{ background: "rgba(5,8,14,0.62)", width: "15.5em" }}>
            <div className="flex items-baseline justify-between gap-[0.6em]">
              <span className="truncate text-[0.85em]" style={{ color: C.paper }}>
                {c.task}
              </span>
              <span className="shrink-0 font-mono text-[0.72em] tracking-[0.08em]" style={{ color: stopped ? C.signal : C.lamp }}>
                {arrived ? c.stamp : stopped ? c.standing : c.toStation}
              </span>
            </div>
            <p className="mt-[0.05em] font-mono text-[3.1em] leading-none tracking-[0.02em]" style={{ color: stopped ? C.paperDim : C.paper, fontVariantNumeric: "tabular-nums" }}>
              {countdown}
            </p>
            <div className="mt-[0.5em] h-[0.18em] w-full" style={{ background: "#2a323c" }}>
              <div className="h-full origin-left" style={{ background: C.lamp, transform: `scaleX(${progress})`, transition: progressMs ? `transform ${progressMs}ms ${step === 7 ? "cubic-bezier(0.2,0.6,0.3,1)" : "linear"}` : "none" }} />
            </div>
          </div>
        </div>
      </div>

      {/* controls under the window */}
      <div className="absolute left-[1.3em] right-[1.3em] top-[24.6em] flex items-center gap-[0.8em]">
        <div
          className="flex h-[2.5em] w-[12em] items-center justify-center gap-[0.5em] rounded-[3px] border text-[0.8em]"
          style={{
            background: stopped ? "#e4d6b8" : "#0e1216",
            borderColor: stopped ? "#c9b48c" : "#3b3f3c",
            color: stopped ? "#1b1a16" : C.paper,
            opacity: arrived ? 0.35 : 1,
            transition: "background 250ms, color 250ms, opacity 400ms",
          }}
        >
          <span className="font-mono text-[0.85em]">{stopped ? "▷" : "‖"}</span>
          {stopped ? c.depart : c.stop}
        </div>
        <span className="flex items-center gap-[0.5em] font-mono text-[0.72em] tracking-[0.1em]" style={{ color: stopped ? C.signal : C.mist }}>
          <span className="inline-block h-[0.6em] w-[0.6em] rounded-full" style={{ background: stopped ? C.signal : arrived ? C.lamp : "#5fa37b" }} />
          {(arrived ? c.arrived : stopped ? c.standing : c.running).toUpperCase()}
        </span>
        <span className="ml-auto hidden font-mono text-[0.62em] tracking-[0.12em] sm:inline" style={{ color: C.haze }}>
          {c.carriageValue}
        </span>
      </div>

      {/* arrival: the window dims, the ticket comes up and takes its stamp */}
      <div className="pointer-events-none absolute inset-0" style={{ background: "rgba(5,8,14,0.55)", opacity: arrived ? 1 : 0, transition: "opacity 500ms" }} />
      <div
        className="absolute left-1/2 top-[7.5em]"
        style={{
          transform: arrived ? "translate3d(-50%,0,0) rotate(-2deg)" : "translate3d(-50%,24em,0) rotate(4deg)",
          transition: arrived ? `transform 700ms ${EASE}` : "none",
        }}
      >
        <Ticket c={c} stamped={arrived} style={{ fontSize: "1.12em" }} />
      </div>
    </div>
  );
}

/** Riding is focusing: the ticket machine, the window with the timer, a stop, and the arrival stamp. */
export default function Ride({ active }: SlideProps) {
  const c = useCopy(COPY);
  const reduce = useReducedMotion();
  const step = useTimeline(active, STEPS);
  const inCabin = step >= 4;
  return (
    <SlideFrame
      active={active}
      tone="solution"
      eyebrow={c.eyebrow}
      title={c.title}
      body={c.body}
      aside={
        <>
          <p>{c.asideView}</p>
          <p className="mt-2">{c.asideLearn}</p>
        </>
      }
      visual={
        <Stage>
          <style>{CSS}</style>
          <div className="absolute inset-0" style={{ background: C.panel }} />
          <div className="absolute inset-0" style={{ opacity: inCabin ? 0 : 1, transform: inCabin ? "scale(0.97)" : "none", transition: `opacity 450ms ease, transform 600ms ${EASE}` }}>
            <Machine c={c} step={step} />
          </div>
          <div className="absolute inset-0" style={{ opacity: inCabin ? 1 : 0, transform: inCabin ? "none" : "scale(1.03)", transition: `opacity 500ms ease 150ms, transform 700ms ${EASE} 150ms` }}>
            <Cabin c={c} step={step} reduce={reduce} />
          </div>
        </Stage>
      }
    />
  );
}
