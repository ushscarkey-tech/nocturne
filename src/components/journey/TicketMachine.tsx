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
}: {
  data: NocturneData;
  now: Date;
  carriage: CarriageId;
  onCarriage: (c: CarriageId) => void;
  onTaken: (choice: { focus: FocusLevel; carriage: CarriageId }) => void;
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
    later(480, () => sfx.play("printLong"));
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
        <Link href="/" className="-ml-2 rounded-full p-2 text-mist hover:text-paper" aria-label={t("scene.leaveMachine")}>
          <Icon name="close" />
        </Link>
        <p className="font-mono text-[0.625rem] tracking-[0.3em] text-haze">{t("scene.machine").toUpperCase()} · N-{details.platform}</p>
        <span className="w-9" />
      </header>

      {/* The machine. It softens into the background once the ticket is out. */}
      <div
        className={`mx-auto mt-4 w-full max-w-[27rem] animate-enter transition-[opacity,transform] duration-700 ease-[var(--ease-glide)] ${
          stage === "taken" ? "scale-[0.97] opacity-20" : emerged ? "opacity-60" : ""
        }`}
        style={{ animationDelay: "200ms" }}
      >
        <div className="relative rounded-[1.8rem] border border-white/[0.07] bg-[linear-gradient(180deg,#1c2128,#12161b_60%,#0e1115)] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_40px_80px_-30px_rgba(0,0,0,0.95)]">
          {/* Brushed panel and four screws. */}
          <div className="pointer-events-none absolute inset-0 rounded-[1.6rem] opacity-[0.05] [background-image:repeating-linear-gradient(90deg,#fff_0_1px,transparent_1px_3px)]" aria-hidden />
          {[
            "left-2 top-2",
            "right-2 top-2",
            "bottom-2 left-2",
            "bottom-2 right-2",
          ].map((p) => (
            <span key={p} className={`absolute ${p} h-1.5 w-1.5 rounded-full bg-[#0a0c0f] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]`} aria-hidden />
          ))}

          <div className="flex items-center justify-between px-1.5 pb-2.5 pt-0.5">
            <p className="font-mono text-[0.6875rem] tracking-[0.35em] text-paper-dim/70">NOCTURNE</p>
            <p className="flex items-center gap-1.5 font-mono text-[0.5625rem] tracking-[0.25em] text-haze">
              NIGHT LINE
              <span className="h-1.5 w-1.5 rounded-full bg-lamp shadow-[0_0_6px_rgba(224,176,104,0.8)] motion-safe-only animate-led" aria-hidden />
            </p>
          </div>

          <Display>
            <div className="flex justify-between font-mono text-[0.5625rem] tracking-[0.25em] text-paper/45">
              <span>{t("scene.nightService")}</span>
              <span>{t("scene.platform", { n: details.platform })}</span>
            </div>
            <p className="mt-2.5 animate-enter font-mono text-[clamp(2rem,9.5vw,2.5rem)] font-light leading-none tabular text-paper" style={{ animationDelay: "550ms" }}>
              <FlipText text={`${dep} → ${arr}`} stagger={30} />
            </p>
            <p className="mt-2 animate-enter font-mono text-xs tracking-[0.12em] text-paper/55" style={{ animationDelay: "700ms" }}>
              {t("scene.stopsSummary", { n: summary.remaining, min: fmt.duration(summary.plannedMinutes) }).toUpperCase()}
            </p>
            <dl className="mt-3.5 animate-enter space-y-1.5 border-t border-white/[0.07] pt-3 font-mono text-xs tracking-[0.12em]" style={{ animationDelay: "850ms" }}>
              <Row label={t("scene.stepRoute")} active={step === "route"} onClick={() => !printing && setStep("route")}>
                <span className="truncate">{from} → {to}</span>
                {routeOk && <span className="text-lamp/80">✓</span>}
              </Row>
              <Row label={t("scene.stepFocus")} active={step === "focus"} onClick={() => !printing && routeOk && setStep("focus")}>
                {focus ? <FlipText text={t(`common.${focus}` as MessageKey).toUpperCase()} /> : <span className="text-paper/25">—</span>}
              </Row>
              <Row label={t("scene.stepCarriage")} active={step === "carriage"} onClick={() => !printing && focus && setStep("carriage")}>
                {focus ? <FlipText text={carriageName.toUpperCase()} /> : <span className="text-paper/25">—</span>}
              </Row>
            </dl>
            <p className="mt-3.5 min-h-[1.25rem] animate-enter truncate text-sm text-paper-dim/80" aria-live="polite" style={{ animationDelay: "1000ms" }}>
              {printing ? (
                <span className="font-mono text-[0.6875rem] tracking-[0.3em] text-lamp/90">
                  {stage === "printing" ? <>{t("scene.printing")}<span className="motion-safe-only animate-breathe">…</span></> : t("scene.takeTicket").toUpperCase()}
                </span>
              ) : step === "route" ? (
                firstTask && (
                  <>
                    <span className="font-mono text-[0.625rem] tracking-[0.14em] text-paper/40">{t("scene.firstStop")}</span> {firstTask.title}
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
                    className="mt-2 flex h-9 items-center gap-1 px-1 font-mono text-[0.625rem] tracking-[0.2em] text-haze hover:text-mist"
                  >
                    <Icon name="back" size={13} /> {t("scene.back").toUpperCase()}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* The ticket slot. */}
          <div className="relative mx-auto mt-4 h-3 w-[76%] rounded-full bg-black shadow-[inset_0_2px_4px_rgba(0,0,0,0.95),0_1px_0_rgba(255,255,255,0.07)]">
            <span
              className={`absolute inset-x-2 -bottom-1 h-3 rounded-full bg-[radial-gradient(50%_100%_at_50%_0%,rgba(224,176,104,0.55),transparent)] blur-[3px] transition-opacity duration-700 ${
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
              transition: dragging
                ? "none"
                : stage === "printing"
                  ? `transform ${reduced ? 200 : EMERGE_MS}ms cubic-bezier(0.4, 0.02, 0.35, 1) ${reduced ? 0 : 480}ms`
                  : "transform 600ms var(--ease-glide), opacity 400ms",
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
          className={`pointer-events-none absolute inset-x-0 bottom-1 text-center text-xs text-mist transition-opacity duration-700 ${emerged ? "opacity-100" : "opacity-0"}`}
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
    <div className="relative overflow-hidden rounded-xl border border-black/60 bg-[linear-gradient(180deg,#0b1012,#070a0c)] px-4 pb-3.5 pt-3 shadow-[inset_0_0_30px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.03)]">
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
      <dt className={active ? "text-lamp" : "text-paper/40"}>{label}</dt>
      <dd className="flex min-w-0 items-center gap-2 text-paper/85">{children}</dd>
      <span className={`h-3 w-1.5 ${active ? "bg-lamp/80 motion-safe-only animate-breathe" : ""}`} aria-hidden />
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
      className={`group relative flex min-h-14 flex-col items-center justify-center rounded-xl border px-2 py-2 font-mono text-xs tracking-[0.16em] transition-[transform,box-shadow,border-color,color] duration-150 active:translate-y-[2px] ${
        wide ? "w-full" : ""
      } ${
        lit
          ? "border-lamp/35 bg-[linear-gradient(180deg,#3a3022,#262017)] text-lamp shadow-[inset_0_1px_0_rgba(255,236,200,0.12),0_2px_0_#0b0e11,0_4px_10px_rgba(0,0,0,0.5)] active:shadow-[inset_0_1px_0_rgba(255,236,200,0.06)]"
          : "border-white/[0.08] bg-[linear-gradient(180deg,#2a3038,#1a1f25)] text-paper-dim shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_2px_0_#0b0e11,0_4px_10px_rgba(0,0,0,0.5)] active:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
      }`}
    >
      {selected && <span className="absolute right-1.5 top-1.5 h-1 w-1 rounded-full bg-lamp shadow-[0_0_5px_rgba(224,176,104,0.9)]" aria-hidden />}
      <span className="uppercase">{children}</span>
      {sub && <span className="mt-1 max-w-full truncate font-sans text-[0.625rem] tracking-normal text-haze">{sub}</span>}
    </button>
  );
}
