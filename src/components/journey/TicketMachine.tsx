"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ambience } from "@/audio/useAmbience";
import { sfx, soundAllowed } from "@/audio/sfx";
import { CARRIAGE_AMBIENCE } from "@/core/journey";
import { routeOf } from "@/core/sessions";
import { boardingDetails } from "@/core/stations";
import { boardingTicketFace } from "@/core/stats";
import { clock, serviceDate } from "@/core/time";
import type { CarriageId, FocusLevel, NocturneData } from "@/core/types";
import { useI18n, type MessageKey } from "@/i18n";
import { Icon } from "@/components/ui/Icon";
import { Ticket } from "@/components/ticket/Ticket";
import { FlipText } from "@/components/scene/FlipText";
import { haptic } from "@/lib/haptics";
import { usePrefersReducedMotion } from "@/lib/hooks";
import { routeSummary } from "@/lib/route-view";
import { CARRIAGES } from "./Boarding";

type Step = "route" | "focus" | "carriage";
type Stage = "select" | "printing" | "presented" | "taken";

const FOCUS: { id: FocusLevel; code: string }[] = [
  { id: "low", code: "LOW" },
  { id: "steady", code: "STEADY" },
  { id: "sharp", code: "SHARP" },
];
const CAR_CODE: Record<CarriageId, string> = { quiet: "QUIET", rain: "RAIN", tunnel: "TUNNEL", moon: "MOON" };
/** How long the printer takes to push the ticket out of the slot. */
const EMERGE_MS = 2200;

/**
 * Before the night starts, a ticket. A station ticket machine in spirit (not
 * any real one): confirm tonight's route, say how you feel, pick a carriage,
 * then the machine prints — and you take the ticket yourself.
 */
export function TicketMachine({
  data,
  now,
  carriage,
  onCarriage,
  onTaken,
  onQuickBoard,
}: {
  data: NocturneData;
  now: Date;
  carriage: CarriageId;
  onCarriage: (c: CarriageId) => void;
  onTaken: (choice: { focus: FocusLevel; carriage: CarriageId }) => void;
  /** Skip the ticket and the doors: board straight away. */
  onQuickBoard?: () => void;
}) {
  const { t, fmt } = useI18n();
  const reduced = usePrefersReducedMotion();
  const today = serviceDate(now);
  const summary = routeSummary(data, today);
  const details = boardingDetails(today);
  const route = routeOf(data.sessions, today).filter((s) => s.status !== "skipped");
  const firstTask = data.tasks.find((x) => x.id === summary.next?.taskId);
  const [step, setStep] = useState<Step>("route");
  const [routeOk, setRouteOk] = useState(false);
  const [focus, setFocus] = useState<FocusLevel | null>(null);
  const [stage, setStage] = useState<Stage>("select");
  const [previewing, setPreviewing] = useState(false);
  const [drag, setDrag] = useState(0);
  const dragStart = useRef<{ y: number; moved: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const face = boardingTicketFace(data, today, carriage);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const later = (ms: number, fn: () => void) => timers.current.push(setTimeout(fn, reduced ? Math.min(ms, 250) : ms));

  const departure = summary.next ? new Date(summary.next.plannedStart) : null;
  const dep = departure && departure.getTime() > now.getTime() + 60_000 ? clock(departure) : t("tonight.now").toUpperCase();
  const arr = summary.arrival ? clock(summary.arrival) : "--:--";
  const from = route[0]?.stationName ?? "NOCTURNE";
  const to = route[route.length - 1]?.stationName ?? "NOCTURNE";
  const carriageName = t((CARRIAGES.find((c) => c.id === carriage)?.nameKey ?? "journey.quietCar") as MessageKey);

  function press(fn: () => void) {
    haptic("tick");
    sfx.play("key", { volume: 0.7 });
    fn();
  }

  function confirmRoute() {
    press(() => {
      setRouteOk(true);
      later(420, () => setStep("focus"));
    });
  }

  function chooseFocus(f: FocusLevel) {
    press(() => {
      setFocus(f);
      later(520, () => setStep("carriage"));
    });
  }

  function chooseCarriage(c: CarriageId) {
    press(() => {
      onCarriage(c);
      if (previewing) ambience.setPreset(CARRIAGE_AMBIENCE[c], 2);
    });
  }

  async function togglePreview() {
    haptic("tick");
    if (previewing) {
      ambience.disable();
      setPreviewing(false);
    } else {
      setPreviewing(await ambience.enable(CARRIAGE_AMBIENCE[carriage]));
    }
  }

  function issue() {
    haptic("press");
    void sfx.unlock();
    sfx.play("click");
    setStage("printing");
    // Standing on the platform: the station's own quiet sound.
    if (soundAllowed()) void ambience.enable(carriage === "rain" ? "platform-rain" : "platform");
    later(480, () => sfx.play("printLong", { volume: 0.6 }));
    // The feed rollers take the ticket out in four heavy steps (see the `feed` keyframes).
    for (const f of [0, 0.26, 0.52, 0.78]) later(480 + f * EMERGE_MS, () => sfx.play("clunk", { volume: 0.8 }));
    later(480 + EMERGE_MS + 150, () => {
      setStage("presented");
      haptic("settle");
      ambience.duck(0.45, 3.5);
    });
  }

  function take() {
    if (stage !== "presented") return;
    haptic("press");
    sfx.play("paper");
    setStage("taken");
    setDrag(0);
    later(1900, () => onTaken({ focus: focus ?? "steady", carriage }));
  }

  // The ticket can be pulled out of the slot, or tapped.
  const pointer = {
    onPointerDown: (e: React.PointerEvent) => {
      if (stage !== "presented") return;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      dragStart.current = { y: e.clientY, moved: false };
      setDragging(true);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (!dragStart.current) return;
      const dy = e.clientY - dragStart.current.y;
      if (Math.abs(dy) > 4) dragStart.current.moved = true;
      setDrag(Math.max(-40, Math.min(160, dy)));
    },
    onPointerUp: (e: React.PointerEvent) => {
      if (!dragStart.current) return;
      const dy = e.clientY - dragStart.current.y;
      const tapped = !dragStart.current.moved;
      dragStart.current = null;
      setDragging(false);
      if (tapped || Math.abs(dy) > 56) take();
      else setDrag(0);
    },
  };

  const printing = stage !== "select";
  const emerged = stage === "presented";

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
      <header className={`flex animate-enter items-center justify-between transition-opacity duration-700 ${stage === "taken" ? "opacity-0" : ""}`}>
        <Link href="/" className="-ml-2 rounded-[3px] p-2 text-mist hover:text-paper" aria-label={t("scene.leaveMachine")}>
          <Icon name="close" />
        </Link>
        <p className="font-mono text-[0.625rem] tracking-[0.3em] text-haze">{t("scene.machine").toUpperCase()} · N-{details.platform}</p>
        {onQuickBoard && !printing ? (
          <button type="button" onClick={onQuickBoard} className="-mr-2 min-h-11 px-2 text-xs text-mist underline decoration-rule underline-offset-4 hover:text-paper">
            {t("scene.quickBoard")}
          </button>
        ) : (
          <span className="w-9" />
        )}
      </header>

      {/* The machine. It softens into the background once the ticket is out. */}
      <div
        className={`mx-auto mt-4 w-full max-w-[27rem] animate-enter transition-[opacity,transform,filter] duration-700 ease-[var(--ease-glide)] lg:mt-[5vh] lg:[zoom:1.15] [@media(min-width:64rem)_and_(min-height:900px)]:[zoom:1.3] ${
          stage === "taken" ? "scale-[0.97] opacity-20" : emerged ? "brightness-[0.7]" : ""
        }`}
        style={{ animationDelay: "200ms" }}
      >
        <div
          className={`relative overflow-hidden rounded-[9px] border border-[#877e69] bg-[linear-gradient(180deg,#d8cfb8,#c9bfa5_55%,#b9ad92)] p-4 pt-0 text-[#2a2822] shadow-[inset_0_1px_0_rgba(255,255,255,0.55),inset_0_-3px_0_rgba(60,50,35,0.25),0_40px_80px_-30px_rgba(0,0,0,0.95)] ${
            stage === "printing" ? "motion-safe-only animate-[thunk_2200ms_linear_480ms_both]" : ""
          }`}
        >
          {/* Painted steel, worn at the edges, and four screws. */}
          <div className="pointer-events-none absolute inset-0 opacity-[0.06] mix-blend-multiply [background-image:repeating-linear-gradient(0deg,#000_0_1px,transparent_1px_4px)]" aria-hidden />
          <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_24px_rgba(90,70,40,0.35)]" aria-hidden />
          {[
            "left-2 top-2",
            "right-2 top-2",
            "bottom-2 left-2",
            "bottom-2 right-2",
          ].map((p) => (
            <span key={p} className={`absolute ${p} z-10 h-1.5 w-1.5 rounded-full bg-[#8d846f] shadow-[inset_0_1px_1px_rgba(0,0,0,0.45),0_1px_0_rgba(255,255,255,0.5)]`} aria-hidden />
          ))}

          {/* The railway's navy band across the top, lettered in white. */}
          <div className="relative -mx-4 mb-3.5 flex items-center justify-between border-b-2 border-[#8c2f25] bg-[#1e2c44] px-5 py-2.5">
            <p className="font-mono text-[0.6875rem] tracking-[0.35em] text-[#e9e4d6]">NOCTURNE</p>
            <p className="flex items-center gap-1.5 font-mono text-[0.5625rem] tracking-[0.25em] text-[#b9c0cc]">
              {t("scene.machine").toUpperCase()}
              <span className="h-1.5 w-1.5 rounded-full bg-[#5fd37a] shadow-[0_0_5px_rgba(95,211,122,0.8)] motion-safe-only animate-led" aria-hidden />
            </p>
          </div>

          <Display>
            <div className="flex justify-between font-mono text-[0.5625rem] tracking-[0.25em] text-[#f0c27a]/50">
              <span>{t("scene.nightService")}</span>
              <span>{t("scene.platform", { n: details.platform })}</span>
            </div>
            <p className="mt-2.5 animate-enter font-mono text-[clamp(2rem,9.5vw,2.5rem)] font-light leading-none tabular text-paper" style={{ animationDelay: "550ms" }}>
              <FlipText text={`${dep} → ${arr}`} stagger={30} />
            </p>
            <p className="mt-2 animate-enter font-mono text-xs tracking-[0.12em] text-[#f0c27a]/60" style={{ animationDelay: "700ms" }}>
              {t("scene.stopsSummary", { n: summary.remaining, min: fmt.duration(summary.plannedMinutes) }).toUpperCase()}
            </p>
            <dl className="mt-3.5 animate-enter space-y-1.5 border-t border-[#f0c27a]/10 pt-3 font-mono text-xs tracking-[0.12em]" style={{ animationDelay: "850ms" }}>
              <Row label={t("scene.stepRoute")} active={step === "route"} onClick={() => !printing && setStep("route")}>
                <span className="truncate">{fmt.station(from)} → {fmt.station(to)}</span>
                {routeOk && <span className="text-[#f4c67c]">OK</span>}
              </Row>
              <Row label={t("scene.stepFocus")} active={step === "focus"} onClick={() => !printing && routeOk && setStep("focus")}>
                {focus ? <FlipText text={t(`common.${focus}` as MessageKey).toUpperCase()} /> : <span className="text-[#f0c27a]/25">—</span>}
              </Row>
              <Row label={t("scene.stepCarriage")} active={step === "carriage"} onClick={() => !printing && focus && setStep("carriage")}>
                {focus ? <FlipText text={carriageName.toUpperCase()} /> : <span className="text-[#f0c27a]/25">—</span>}
              </Row>
            </dl>
            <p className="mt-3.5 min-h-[1.25rem] animate-enter truncate text-sm text-[#e3b06a]" aria-live="polite" style={{ animationDelay: "1000ms" }}>
              {printing ? (
                <span className="font-mono text-[0.6875rem] tracking-[0.3em] text-[#f4c67c]">
                  {stage === "printing" ? <>{t("scene.printing")}<span className="motion-safe-only animate-breathe">…</span></> : t("scene.takeTicket").toUpperCase()}
                </span>
              ) : step === "route" ? (
                firstTask && (
                  <>
                    <span className="font-mono text-[0.625rem] tracking-[0.14em] text-[#f0c27a]/45">{t("scene.firstStop")}</span> {firstTask.title}
                  </>
                )
              ) : step === "focus" ? (
                t("scene.chooseFocus")
              ) : (
                <>
                  {t((CARRIAGES.find((c) => c.id === carriage)?.detailKey ?? "journey.quietCarDetail") as MessageKey)}
                </>
              )}
            </p>
          </Display>

          {/* Keys: they fold away once the machine starts printing. */}
          <div className={`grid transition-[grid-template-rows,opacity] duration-700 ease-[var(--ease-glide)] ${printing ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr]"}`}>
            <div className="overflow-hidden">
              <div key={step} className={`pt-4 ${routeOk ? "animate-[enter_700ms_var(--ease-glide)_both]" : "animate-enter"}`} style={{ animationDelay: routeOk ? "80ms" : "1150ms" }}>
                {step === "route" && (
                  <Key wide onClick={confirmRoute} lit>
                    {t("scene.confirmRoute")}
                  </Key>
                )}
                {step === "focus" && (
                  <div className="grid grid-cols-3 gap-2">
                    {FOCUS.map((f) => (
                      <Key key={f.id} onClick={() => chooseFocus(f.id)} selected={focus === f.id} sub={t(`common.${f.id}` as MessageKey)}>
                        {f.code}
                      </Key>
                    ))}
                  </div>
                )}
                {step === "carriage" && (
                  <>
                    <div className="grid grid-cols-4 gap-2">
                      {CARRIAGES.map((c) => (
                        <Key key={c.id} onClick={() => chooseCarriage(c.id)} selected={carriage === c.id} sub={t(c.nameKey as MessageKey)}>
                          {CAR_CODE[c.id]}
                        </Key>
                      ))}
                    </div>
                    <div className="mt-2 grid grid-cols-[auto_1fr] gap-2">
                      <Key onClick={() => void togglePreview()} selected={previewing} label={previewing ? t("scene.stopPreview") : t("scene.previewSound")}>
                        <Icon name="sound" size={15} />
                      </Key>
                      <Key wide lit onClick={issue}>
                        {t("scene.issueTicket")}
                      </Key>
                    </div>
                  </>
                )}
                {step !== "route" && (
                  <button
                    type="button"
                    onClick={() => setStep(step === "carriage" ? "focus" : "route")}
                    className="mt-2 flex h-9 items-center gap-1 px-1 font-mono text-[0.625rem] tracking-[0.2em] text-[#5b5547] hover:text-[#2a2822]"
                  >
                    <Icon name="back" size={13} /> {t("scene.back").toUpperCase()}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* The ticket slot. */}
          <p className="mt-4 text-center font-mono text-[0.5625rem] tracking-[0.35em] text-[#5b5547]" aria-hidden>
            ▼ {t("scene.ticketSlot")}
          </p>
          <div className="relative mx-auto mt-1.5 h-3.5 w-[76%] rounded-[2px] border border-[#7a715d] bg-[#0b0b0a] shadow-[inset_0_3px_4px_rgba(0,0,0,0.95),0_1px_0_rgba(255,255,255,0.5)]">
            <span
              className={`absolute inset-x-2 -bottom-1 h-3 bg-[radial-gradient(50%_100%_at_50%_0%,rgba(224,176,104,0.45),transparent)] blur-[3px] transition-opacity duration-700 ${
                stage === "printing" ? "opacity-100" : emerged ? "opacity-40" : "opacity-0"
              }`}
              aria-hidden
            />
          </div>
        </div>
      </div>

      {/* Out of the slot, into your hand. */}
      <div className="relative mx-auto w-full max-w-[27rem] flex-1">
        <div className="absolute inset-x-0 top-0 flex h-full justify-center overflow-hidden">
          <div
            className={`relative h-fit touch-none select-none will-change-transform ${stage === "taken" ? "opacity-0" : ""}`}
            style={{
              transform: `translate3d(0, ${stage === "select" ? "-102%" : emerged || stage === "taken" ? `calc(-6% + ${drag}px)` : "-6%"}, 0)`,
              // Printing: out of the slot in heavy steps; then it follows the hand.
              animation: stage === "printing" && !reduced ? `feed ${EMERGE_MS}ms linear 480ms both` : undefined,
              transition: dragging ? "none" : stage === "printing" ? (reduced ? "transform 200ms" : "none") : "transform 600ms var(--ease-glide), opacity 400ms",
            }}
            role={emerged ? "button" : undefined}
            tabIndex={emerged ? 0 : -1}
            aria-label={emerged ? t("scene.takeTicket") : undefined}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && take()}
            {...pointer}
          >
            {/* The printer's feed shakes the paper a little; kept on its own layer. */}
            <div className={stage === "printing" ? "motion-safe-only animate-jitter" : ""}>
              <Ticket face={face} style={carriage} size="md" />
            </div>
          </div>
        </div>
        <p
          className={`pointer-events-none absolute inset-x-0 bottom-1 text-center text-xs text-mist transition-opacity duration-700 [@media(max-height:940px)]:hidden ${emerged ? "opacity-100" : "opacity-0"}`}
          aria-hidden={!emerged}
        >
          <span className="motion-safe-only inline-block animate-hint">↓</span> {t("scene.takeTicketHint")}
        </p>
      </div>

      {/* Taken: the ticket in hand, everything else out of focus. */}
      {stage === "taken" && (
        <div className="pointer-events-none fixed inset-0 z-20 flex items-center justify-center bg-night-950/50">
          <div className="motion-safe-only animate-[lift_900ms_var(--ease-glide)_both]">
            <Ticket face={face} style={carriage} size="lg" />
          </div>
        </div>
      )}
    </div>
  );
}

function Display({ children }: { children: ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-[3px] border-[3px] border-[#34322c] bg-[linear-gradient(180deg,#0e110d,#080a08)] px-4 pb-3.5 pt-3 shadow-[inset_0_0_30px_rgba(0,0,0,0.9),0_1px_0_rgba(255,255,255,0.45)]">
      {/* Fine scan lines and a faint glass sheen. */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:repeating-linear-gradient(0deg,#fff_0_1px,transparent_1px_3px)]" aria-hidden />
      <div className="pointer-events-none absolute -left-1/4 -top-1/2 h-full w-[150%] rotate-[-8deg] bg-[linear-gradient(180deg,rgba(255,255,255,0.045),transparent)]" aria-hidden />
      <div className="relative">{children}</div>
    </div>
  );
}

function Row({ label, active, onClick, children }: { label: string; active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="grid w-full grid-cols-[4.75rem_1fr_auto] items-center gap-2 text-left">
      <dt className={active ? "text-[#f4c67c]" : "text-[#f0c27a]/40"}>{label}</dt>
      <dd className="flex min-w-0 items-center gap-2 text-[#f0c27a]/90">{children}</dd>
      <span className={`h-3 w-1.5 ${active ? "bg-[#f4c67c]/80 motion-safe-only animate-led" : ""}`} aria-hidden />
    </button>
  );
}

function Key({
  children,
  onClick,
  selected = false,
  lit = false,
  wide = false,
  sub,
  label,
}: {
  children: ReactNode;
  onClick: () => void;
  selected?: boolean;
  lit?: boolean;
  wide?: boolean;
  sub?: string;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected || undefined}
      aria-label={label}
      className={`group relative mb-[3px] flex min-h-14 flex-col items-center justify-center rounded-[4px] border px-2 py-2 font-mono text-xs tracking-[0.16em] transition-[transform,box-shadow] duration-100 active:translate-y-[2px] ${
        wide ? "w-full" : ""
      } ${
        lit
          ? "border-[#94591a] bg-[linear-gradient(180deg,#e7a347,#cf862c)] text-[#2b1a07] shadow-[inset_0_1px_0_rgba(255,236,200,0.6),0_3px_0_#7a4812,0_5px_8px_rgba(0,0,0,0.35)] active:shadow-[inset_0_1px_0_rgba(255,236,200,0.4),0_1px_0_#7a4812]"
          : "border-[#8e8672] bg-[linear-gradient(180deg,#f1ecdf,#ddd5c3)] text-[#26241f] shadow-[inset_0_1px_0_#fff,0_3px_0_#7d7563,0_5px_8px_rgba(0,0,0,0.3)] active:shadow-[inset_0_1px_0_#fff,0_1px_0_#7d7563]"
      }`}
    >
      {selected && <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[#e0452f] shadow-[0_0_5px_rgba(224,69,47,0.9)]" aria-hidden />}
      <span className="uppercase">{children}</span>
      {sub && <span className="mt-1 max-w-full truncate font-sans text-[0.625rem] tracking-normal text-[#5b5547]">{sub}</span>}
    </button>
  );
}
