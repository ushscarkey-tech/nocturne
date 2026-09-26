"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { sfx } from "@/audio/sfx";
import type { TicketFace } from "@/core/stats";
import type { CarriageId } from "@/core/types";
import { useI18n } from "@/i18n";
import { Ticket } from "@/components/ticket/Ticket";
import { FlipText } from "@/components/scene/FlipText";
import { haptic } from "@/lib/haptics";
import { usePrefersReducedMotion } from "@/lib/hooks";
import { SCENE_READY } from "@/components/scene/gl";

// three.js loads only when someone is at the doors.
const BoardingScene3D = dynamic(() => import("@/components/scene/BoardingScene3D"), { ssr: false, loading: () => null });

let webgl2: boolean | null = null;
function hasWebGL2() {
  if (webgl2 === null) {
    try {
      webgl2 = !!document.createElement("canvas").getContext("webgl2");
    } catch {
      webgl2 = false;
    }
  }
  return webgl2;
}
const noSubscribe = () => () => {};
/** Fallback if the walk never reports that you've sat down (seconds after the doors open). */
const WALK_LIMIT = 9;
/** How long, once seated, to wait for the ride's scene to be ready before fading into it anyway. */
const READY_LIMIT = 2500;

const STRIPE: Record<CarriageId, string> = { rain: "#4c5f7a", quiet: "#4f6a5c", tunnel: "#8a5a2b", moon: "#b69a62" };

type Stage = "waiting" | "reading" | "opening" | "entering";

/**
 * The closed door of tonight's carriage. Touch the ticket to the reader,
 * a soft chime, the door lamp comes on, the doors part, and the view moves
 * inside. A couple of seconds; skippable.
 */
export function BoardingDoors({
  face,
  carriage,
  departure,
  destination,
  stationName,
  onOpen,
  onInside,
  onHoldScene,
  onCovered,
}: {
  face: TicketFace;
  carriage: CarriageId;
  departure: string;
  destination: string;
  /** Where you board, on the name board across the platform. */
  stationName?: string;
  /** The doors are open: board now. */
  onOpen: () => void;
  /** The view is inside the carriage. */
  onInside: () => void;
  /**
   * While true, keep the ride's scene unmounted: one 3D scene at a time,
   * and the ride's is built only once you're sitting still in your seat.
   */
  onHoldScene?: (hold: boolean) => void;
  /** The doors now fill the screen: whatever was showing behind can stop. */
  onCovered?: () => void;
}) {
  const { t } = useI18n();
  const reduced = usePrefersReducedMotion();
  const [stage, setStage] = useState<Stage>("waiting");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const opened = useRef(false);
  // In 3D the doors open and you walk in to your seat; otherwise the drawn doors.
  const canDraw3D = useSyncExternalStore(noSubscribe, hasWebGL2, () => false);
  const [failed3D, setFailed3D] = useState(false);
  const walk = canDraw3D && !failed3D && !reduced;
  const [seated, setSeated] = useState(false);
  // The 3D scene takes a moment to prepare; until it has drawn, the platform
  // behind stays in view (no black screen), and then the scene fades in.
  const [ready3D, setReady3D] = useState(false);
  const covered = !walk || ready3D;
  useEffect(() => {
    if (covered) onCovered?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [covered]);
  useEffect(() => {
    if (covered) return;
    // Far too long: the drawn doors instead.
    const t = setTimeout(() => setFailed3D(true), 15000);
    return () => clearTimeout(t);
  }, [covered]);
  const ticketRef = useRef<HTMLButtonElement>(null);
  const readerRef = useRef<HTMLDivElement>(null);
  const readerAt = useRef<{ x: number; y: number } | null>(null);
  const [tapping, setTapping] = useState(false);
  const insideCalled = useRef(false);
  const goInside = () => {
    if (insideCalled.current) return;
    insideCalled.current = true;
    onInside();
  };
  const [released, setReleased] = useState(false);
  useEffect(() => {
    onHoldScene?.(walk && !released);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walk, released]);
  // Sat down: the ride's scene is built behind this one (you're still, so
  // nobody sees the moment it takes); once it has drawn, fade across.
  const sitDown = () => {
    if (released) return;
    setReleased(true);
    let faded = false;
    const fade = () => {
      if (faded) return;
      faded = true;
      window.removeEventListener(SCENE_READY, fade);
      // A frame for the ride to settle, then the crossfade.
      at(120, () => setSeated(true));
      at(120 + 700, goInside);
    };
    window.addEventListener(SCENE_READY, fade);
    at(READY_LIMIT, fade);
  };

  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const at = (ms: number, fn: () => void) => timers.current.push(setTimeout(fn, ms));

  const open = () => {
    if (opened.current) return;
    opened.current = true;
    onOpen();
  };

  /** Where to hold the ticket: the 3D reader as the scene reports it, or the drawn one. */
  const reader = () => {
    if (walk && readerAt.current) return readerAt.current;
    const r = readerRef.current?.getBoundingClientRect();
    return r && r.width ? { x: r.left + r.width / 2, y: r.top + r.height * 0.4 } : { x: window.innerWidth * 0.62, y: window.innerHeight * 0.46 };
  };

  /**
   * The hand brings the ticket up to the reader, flat against it, presses,
   * holds for the beep, and lowers it away out of view.
   */
  const presentTicket = (contactMs: number) => {
    const el = ticketRef.current;
    if (!el?.animate) return;
    const { x, y } = reader();
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    // The ticket turns about its bottom centre, which sits at (offsetLeft, offsetTop + h).
    const s = Math.min(0.34, Math.max(0.2, 150 / Math.max(1, w)));
    const dx = x - el.offsetLeft;
    const dy = y + (h * s) / 2 - (el.offsetTop + h);
    const pose = (tx: number, ty: number, rot: number, sc: number) => `translateX(-50%) translate(${tx}px, ${ty}px) rotate(${rot}deg) scale(${sc})`;
    const total = contactMs / 0.42;
    el.animate(
      [
        { transform: pose(0, 0, -4, 0.52), opacity: 1, offset: 0, easing: "cubic-bezier(0.35, 0, 0.25, 1)" },
        { transform: pose(dx * 0.92, dy * 0.9 - 6, -1, s * 1.06), opacity: 1, offset: 0.32, easing: "cubic-bezier(0.2, 0, 0.3, 1)" },
        { transform: pose(dx, dy, 0, s), opacity: 1, offset: 0.42, easing: "ease-in-out" },
        { transform: pose(dx, dy + 2, 0, s * 0.97), opacity: 1, offset: 0.5, easing: "linear" },
        { transform: pose(dx, dy + 2, 0, s * 0.97), opacity: 1, offset: 0.64, easing: "cubic-bezier(0.55, 0, 0.9, 0.5)" },
        { transform: pose(dx * 0.75, dy * 0.3 + window.innerHeight * 0.55, -6, s * 1.35), opacity: 0, offset: 1 },
      ],
      { duration: total, fill: "forwards" },
    );
  };

  function touch() {
    if (stage !== "waiting" || !covered || tapping) return;
    setTapping(true);
    haptic("press");
    void sfx.unlock();
    if (reduced) {
      setStage("reading");
      sfx.play("chime", { volume: 0.8 });
      at(300, open);
      at(700, onInside);
      return;
    }
    // Contact: the reader answers — the ring and the lamp light, a beep.
    const CONTACT = 560;
    presentTicket(CONTACT);
    at(CONTACT, () => {
      setStage("reading");
      sfx.play("stamp");
      haptic("tick");
    });
    at(CONTACT + 330, () => sfx.play("chime", { volume: 0.8 }));
    at(CONTACT + 900, () => {
      setStage("opening");
      sfx.play("doors");
      haptic("door");
    });
    at(CONTACT + 2000, () => {
      setStage("entering");
      open();
    });
    // Fetch the ride's scene while you walk, so it's ready when you sit.
    if (walk) void import("@/components/scene/CabinScene3D");
    if (walk) at(CONTACT + 2000 + WALK_LIMIT * 1000, goInside);
    else at(CONTACT + 3300, goInside);
  }

  function skip() {
    timers.current.forEach(clearTimeout);
    open();
    goInside();
  }

  const lit = stage !== "waiting";
  const doorsOpen = stage === "opening" || stage === "entering";
  const stripe = STRIPE[carriage];

  return (
    <div
      className={`fixed inset-0 z-30 overflow-hidden transition-opacity duration-700 ${covered ? "bg-night-950" : "bg-transparent"} ${
        walk ? (seated ? "opacity-0" : "") : stage === "entering" ? "opacity-0 delay-[900ms]" : ""
      }`}
    >
      {walk && (
        <div className={`absolute inset-0 transition-opacity duration-500 ${ready3D ? "opacity-100" : "opacity-0"}`}>
          <BoardingScene3D
            className="absolute inset-0"
            stage={stage}
            carriage={carriage}
            car={face.car}
            stationName={stationName}
            onFail={() => setFailed3D(true)}
            onInside={sitDown}
            onReady={() => setReady3D(true)}
            onReader={(x, y) => (readerAt.current = { x, y })}
          />
        </div>
      )}
      {/* Platform ceiling: two long tubes. */}
      <div className={`absolute inset-x-0 top-0 h-[24%] bg-[linear-gradient(180deg,#07090c,#0d1115)] ${walk ? "hidden" : ""}`} aria-hidden>
        <div className="absolute inset-x-[22%] top-[22%] h-[3px] rounded-full bg-[#f3e6c8]/80 shadow-[0_0_24px_6px_rgba(240,222,176,0.18)]" />
        <div className="absolute inset-x-[30%] top-[18%] h-24 bg-[radial-gradient(50%_60%_at_50%_0%,rgba(240,222,176,0.1),transparent)]" />
      </div>

      {/* Hanging sign. */}
      <div className={`absolute inset-x-0 top-[max(3.5rem,calc(env(safe-area-inset-top)+2.5rem))] z-10 flex justify-center px-6 transition-opacity duration-700 ${stage === "entering" ? "opacity-0" : ""}`}>
        <div className="w-full max-w-xs rounded-md border border-black/50 bg-[#10151a] px-4 py-2.5 shadow-[0_12px_30px_rgba(0,0,0,0.6)]">
          <p className="flex items-baseline justify-between font-mono text-[0.625rem] tracking-[0.3em] text-paper/50">
            <span>{t("scene.boarding")}</span>
            <span className="text-lamp/90">{t("scene.platform", { n: face.platform })}</span>
          </p>
          <p className="mt-1.5 flex items-baseline justify-between gap-3 font-mono text-sm tabular text-[#e8c88f]">
            <FlipText text={departure} />
            <span className="truncate text-xs tracking-[0.18em] text-paper/70">{destination}</span>
            <span className="text-xs text-paper/45">{face.car}</span>
          </p>
        </div>
      </div>

      {/* The carriage, the door, the platform: the camera pushes in through the door. */}
      <div
        className={`absolute inset-0 ${walk ? "hidden" : ""}`}
        style={{
          transformOrigin: "50% 58%",
          transform: stage === "entering" && !reduced ? "scale(3.1)" : "none",
          transition: "transform 1400ms cubic-bezier(0.55, 0, 0.2, 1)",
        }}
        aria-hidden
      >
        {/* Car body. */}
        <div className="absolute inset-x-0 bottom-[13%] top-[27%] bg-[linear-gradient(180deg,#252c33,#181d22_45%,#12161a)]">
          <div className="absolute inset-x-0 top-[9%] h-[3px]" style={{ background: stripe, opacity: 0.85 }} />
          <div className="absolute inset-x-0 bottom-[10%] h-[2px]" style={{ background: stripe, opacity: 0.6 }} />
          {/* Light from the platform tubes, caught along the upper body. */}
          <div className="absolute inset-x-0 top-0 h-[35%] bg-[linear-gradient(180deg,rgba(240,222,176,0.08),transparent)]" />
          <div className="absolute inset-x-0 top-[3%] h-[5%] bg-[linear-gradient(180deg,transparent,rgba(255,255,255,0.045),transparent)]" />
          {[25, 75].map((x) => (
            <div key={x} className="absolute top-0 h-full w-px bg-black/40" style={{ left: `${x}%` }} />
          ))}
          {/* Side windows with the warm cabin behind. */}
          {["left-[4%]", "right-[4%]"].map((side) => (
            <div key={side} className={`absolute ${side} top-[17%] h-[36%] w-[17%] overflow-hidden rounded-md border border-black/60 bg-[linear-gradient(180deg,rgba(236,214,166,0.28),rgba(236,214,166,0.1))]`}>
              <div className="absolute bottom-0 left-[10%] h-[45%] w-[34%] rounded-t-md bg-[#2b3a32]/80" />
              <div className="absolute bottom-0 right-[10%] h-[45%] w-[34%] rounded-t-md bg-[#2b3a32]/80" />
              <div className="absolute left-1/2 top-0 h-[30%] w-px bg-black/30" />
              <div className="absolute inset-0 bg-[linear-gradient(115deg,transparent_40%,rgba(255,255,255,0.06)_48%,transparent_56%)]" />
            </div>
          ))}
          <p className="absolute left-[4%] top-[11%] font-mono text-[0.5rem] tracking-[0.35em] text-paper/35">NOCTURNE</p>
          <p className="absolute right-[4%] top-[9.5%] font-mono text-sm tracking-[0.1em] text-paper/60">{face.car}</p>
        </div>

        {/* Door lamp. */}
        <div className="absolute left-1/2 top-[23.5%] -translate-x-1/2">
          <span
            className={`block h-2.5 w-2.5 rounded-full transition-[background-color,box-shadow] duration-500 ${
              lit ? "bg-[#f0b35e] shadow-[0_0_14px_4px_rgba(240,179,94,0.45)]" : "bg-[#3a3f44]"
            } ${doorsOpen ? "motion-safe-only animate-breathe" : ""}`}
          />
        </div>

        {/* The door opening: warm light and an empty carriage beyond. */}
        <div className="absolute bottom-[13%] left-1/2 top-[26%] w-[38%] max-w-[12.5rem] -translate-x-1/2 overflow-hidden rounded-t-lg border-x-[5px] border-t-[5px] border-[#0b0e11] bg-[linear-gradient(180deg,#e9d8b0,#c9b48a_55%,#6f624c)] shadow-[inset_0_0_40px_rgba(0,0,0,0.5)]">
          <CarriageInterior />
          {/* Door leaves slide into the body. */}
          {(["left", "right"] as const).map((side) => (
            <div
              key={side}
              className={`absolute inset-y-0 w-1/2 bg-[linear-gradient(180deg,#2a3239,#1b2126)] ${side === "left" ? "left-0 border-r border-black/70" : "right-0 border-l border-black/70"}`}
              style={{
                transform: doorsOpen ? `translateX(${side === "left" ? "-100%" : "100%"})` : "none",
                transition: reduced ? "opacity 300ms" : "transform 1100ms cubic-bezier(0.45, 0, 0.2, 1)",
                opacity: reduced && doorsOpen ? 0 : 1,
              }}
            >
              <div className="absolute inset-x-[16%] top-[9%] h-[44%] overflow-hidden rounded-sm border border-black/60 bg-[linear-gradient(180deg,rgba(236,214,166,0.34),rgba(236,214,166,0.14))]">
                <div className="absolute inset-0 bg-[linear-gradient(120deg,transparent_35%,rgba(255,255,255,0.07)_45%,transparent_55%)]" />
              </div>
              <div className={`absolute top-[58%] h-10 w-1 rounded-full bg-black/40 ${side === "left" ? "right-2" : "left-2"}`} />
            </div>
          ))}
        </div>

        {/* Ticket reader beside the door. */}
        <div ref={readerRef} className="absolute left-[calc(50%+min(19vw,6.25rem)+0.6rem)] top-[46%] flex h-12 w-9 flex-col items-center justify-center gap-1.5 rounded-md border border-black/60 bg-[#0e1216] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
          <span className={`h-4 w-4 rounded-full border ${lit ? "border-[#8fd0a8]/70 shadow-[0_0_10px_rgba(143,208,168,0.5)]" : "border-paper/20"}`} />
          <span className={`h-1 w-1 rounded-full ${stage === "waiting" ? "bg-paper/25" : "bg-[#8fd0a8]"}`} />
        </div>

        {/* Platform edge. */}
        <div className="absolute inset-x-0 bottom-0 h-[13%] bg-[linear-gradient(180deg,#1a1d20,#0c0e10)]">
          <div className="absolute inset-x-0 top-0 h-1.5 bg-black" />
          <div className="absolute inset-x-0 top-[22%] h-2 bg-[#b99a4d]/55 [background-image:radial-gradient(circle,rgba(0,0,0,0.35)_1px,transparent_1.5px)] [background-size:6px_6px]" />
          <div className="absolute inset-x-0 top-[22%] h-10 bg-[radial-gradient(60%_100%_at_50%_0%,rgba(240,222,176,0.12),transparent)]" />
        </div>
        {/* Spill of warm light onto the platform once the doors part. */}
        <div
          className={`absolute bottom-[4%] left-1/2 h-[12%] w-[60%] -translate-x-1/2 bg-[radial-gradient(50%_60%_at_50%_0%,rgba(236,214,166,0.3),transparent)] transition-opacity duration-1000 ${doorsOpen ? "opacity-100" : "opacity-0"}`}
        />
      </div>

      {/* Warm light fills the frame as we step in. */}
      <div className={`pointer-events-none absolute inset-0 bg-[#f1dfb8] transition-opacity duration-[1300ms] ${stage === "entering" && !reduced && !walk ? "opacity-25" : "opacity-0"}`} />

      {/* The ticket, held out. */}
      <button
        ref={ticketRef}
        type="button"
        onClick={touch}
        disabled={stage !== "waiting" || !covered || tapping}
        aria-label={t("scene.tapTicket")}
        className="absolute bottom-[max(5.5rem,calc(env(safe-area-inset-bottom)+4.5rem))] left-1/2 z-10 disabled:cursor-default"
        style={{
          transform: "translateX(-50%) rotate(-4deg) scale(0.52)",
          // Dimmed until the doors are ready for it; with reduced motion it simply fades once read.
          opacity: reduced && lit ? 0 : covered ? 1 : 0.55,
          transition: "opacity 450ms",
          transformOrigin: "50% 100%",
        }}
      >
        <Ticket face={face} style={carriage} size="md" />
      </button>
      <p
        className={`absolute inset-x-0 bottom-[max(2.5rem,calc(env(safe-area-inset-bottom)+1.75rem))] text-center text-xs text-mist transition-opacity duration-500 ${stage === "waiting" ? "opacity-100" : "opacity-0"}`}
      >
        {t("scene.tapTicket")}
      </p>
      <p
        aria-live="polite"
        className={`absolute inset-x-0 bottom-[max(2.5rem,calc(env(safe-area-inset-bottom)+1.75rem))] text-center font-mono text-[0.625rem] tracking-[0.3em] text-lamp/80 transition-opacity duration-500 ${doorsOpen && !(walk && stage === "entering") ? "opacity-100" : "opacity-0"}`}
      >
        {doorsOpen ? t("scene.doorsOpening").toUpperCase() : ""}
      </p>

      <button
        type="button"
        onClick={skip}
        className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] z-20 min-h-11 px-3 font-mono text-[0.625rem] tracking-[0.25em] text-haze hover:text-mist"
      >
        {t("scene.skip").toUpperCase()}
      </button>
    </div>
  );
}

/** An empty carriage seen through the open door: long seats, straps, lights running to the far end. */
function CarriageInterior() {
  const vx = 50;
  const vy = 62;
  const windows = [0, 1, 2, 3].map((i) => {
    const a = 1 - i * 0.22;
    const b = a - 0.15;
    const x = (t: number, side: -1 | 1) => vx + side * 50 * t;
    const y = (t: number, top: number) => vy + (top - vy) * t;
    return { a, b, x, y };
  });
  return (
    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 160" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <linearGradient id="ci-wall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#efe1bf" />
          <stop offset="1" stopColor="#a8966f" />
        </linearGradient>
        <linearGradient id="ci-floor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6d6352" />
          <stop offset="1" stopColor="#3e382e" />
        </linearGradient>
      </defs>
      <rect width="100" height="160" fill="url(#ci-wall)" />
      {/* Ceiling and its two light strips. */}
      <polygon points={`0,0 100,0 ${vx + 7},${vy - 9} ${vx - 7},${vy - 9}`} fill="#f3e8cc" />
      {[-1, 1].map((side) => (
        <line key={side} x1={vx + side * 24} y1={0} x2={vx + side * 3.4} y2={vy - 9} stroke="#fffaf0" strokeWidth={2.2} strokeLinecap="round" opacity={0.95} />
      ))}
      {/* Far end: the gangway door with a dark window. */}
      <rect x={vx - 7} y={vy - 9} width={14} height={20} fill="#b9a67f" />
      <rect x={vx - 3} y={vy - 7} width={6} height={9} rx={0.6} fill="#121a20" />
      {/* Floor. */}
      <polygon points={`0,160 100,160 ${vx + 7},${vy + 11} ${vx - 7},${vy + 11}`} fill="url(#ci-floor)" />
      {/* Side windows, dark with night, getting smaller toward the far end. */}
      {windows.map(({ a, b, x, y }, i) =>
        ([-1, 1] as const).map((side) => (
          <polygon
            key={`${i}${side}`}
            points={`${x(a, side)},${y(a, 18)} ${x(b, side)},${y(b, 18)} ${x(b, side)},${y(b, 70)} ${x(a, side)},${y(a, 70)}`}
            fill="#141c22"
            opacity={0.92}
          />
        )),
      )}
      {/* Long seats along both walls. */}
      {([-1, 1] as const).map((side) => (
        <g key={side}>
          <polygon points={`${vx + side * 50},96 ${vx + side * 7},${vy + 6} ${vx + side * 7},${vy + 9} ${vx + side * 50},124`} fill="#2f4137" />
          <polygon points={`${vx + side * 50},124 ${vx + side * 7},${vy + 9} ${vx + side * 6.2},${vy + 10} ${vx + side * 38},132`} fill="#26352d" />
        </g>
      ))}
      {/* Hand straps on the rails. */}
      {([-1, 1] as const).map((side) =>
        [0.95, 0.72, 0.52, 0.36].map((t) => {
          const x = vx + side * 30 * t;
          const top = vy - 9 + (8 - vy) * t;
          return (
            <g key={`${side}${t}`} opacity={0.55}>
              <line x1={x} y1={top} x2={x} y2={top + 10 * t} stroke="#5d5a52" strokeWidth={0.5 * t + 0.2} />
              <circle cx={x} cy={top + 11.5 * t} r={1.6 * t} fill="none" stroke="#5d5a52" strokeWidth={0.5 * t + 0.2} />
            </g>
          );
        }),
      )}
    </svg>
  );
}
