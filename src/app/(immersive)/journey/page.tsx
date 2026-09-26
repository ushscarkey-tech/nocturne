"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { PresetId } from "@/audio/engine";
import { sfx, soundAllowed } from "@/audio/sfx";
import { ambience, soundWanted, useAmbienceState, useScenePreset } from "@/audio/useAmbience";
import { CARRIAGE_AMBIENCE, journeyFor } from "@/core/journey";
import { activeSession, routeOf, sessionsOn, upcomingOn } from "@/core/sessions";
import { boardingTicketFace } from "@/core/stats";
import { clock, serviceDate } from "@/core/time";
import type { CarriageId, FocusLevel, JourneyPhase } from "@/core/types";
import { useI18n } from "@/i18n";
import { ButtonLink } from "@/components/ui/Button";
import { BoardingDoors } from "@/components/journey/BoardingDoors";
import { Cabin } from "@/components/journey/Cabin";
import { FinalStation } from "@/components/journey/FinalStation";
import { NightScene, type SceneMode } from "@/components/journey/NightScene";
import { ServicePaused, StationStop } from "@/components/journey/Platform";
import { SignalChange } from "@/components/journey/SignalChange";
import { TicketMachine } from "@/components/journey/TicketMachine";
import { PlatformScene } from "@/components/scene/PlatformScene";
import { useNow } from "@/lib/hooks";
import { board, setCarriage } from "@/state/actions";
import { useData, useStore } from "@/state/store";

type TunnelStage = "off" | "rumble" | "deep";
type Phase = JourneyPhase;

/**
 * One continuous journey: the ticket machine on the platform, the carriage
 * door, pulling out, the window, stations, the end of the line. Scenes hand
 * over to each other instead of pages replacing pages.
 */
export default function JourneyPage() {
  const data = useData();
  const now = useNow(1000);
  const today = serviceDate(now);
  const journey = journeyFor(data, today);
  const active = activeSession(data.sessions);
  const [tunnel, setTunnel] = useState(false);
  const [stage, setStage] = useState<TunnelStage>("off");
  const [machineCarriage, setMachineCarriage] = useState<CarriageId>(journey?.selectedCarriage ?? data.profile.preferredCarriage);
  const [choice, setChoice] = useState<{ focus: FocusLevel; carriage: CarriageId } | null>(null);
  const [atDoors, setAtDoors] = useState(false);
  const [departing, setDeparting] = useState(false);
  // While walking in, the ride's scene waits (see BoardingDoors).
  const [holdScene, setHoldScene] = useState(false);
  // At the doors the platform stays in view until the doors' own scene is ready.
  const [doorsCovered, setDoorsCovered] = useState(false);
  const { enabled: soundOn } = useAmbienceState();

  const started = !!journey?.startedAt;
  const phase: Phase = !started ? "boarding" : journey!.phase;
  const carriage = started ? journey!.selectedCarriage : (choice?.carriage ?? machineCarriage);
  const inTunnel = phase === "cabin" && tunnel && !!active?.resumedAt;

  // Remember how we got here, so arrivals and departures can be staged.
  const [seen, setSeen] = useState<{ phase: Phase; arrival: { kind: Phase; at: number } | null; departure: number }>({
    phase,
    arrival: null,
    departure: 0,
  });
  if (seen.phase !== phase) {
    const arrived = seen.phase === "cabin" && (phase === "stop" || phase === "final" || phase === "paused");
    const leaving = (seen.phase === "stop" || seen.phase === "paused") && phase === "cabin";
    setSeen({
      phase,
      arrival: arrived ? { kind: phase, at: now.getTime() } : seen.arrival,
      departure: leaving ? seen.departure + 1 : seen.departure,
    });
  }
  const arriving = !!seen.arrival && seen.arrival.kind === phase && now.getTime() - seen.arrival.at < 8000;

  // Braking, then the platform chime.
  const arrivalAt = seen.arrival?.at;
  useEffect(() => {
    if (!arrivalAt) return;
    sfx.play("brake", { volume: 0.9 });
    const chime = setTimeout(() => sfx.play("arrival", { volume: 0.75 }), 2700);
    return () => clearTimeout(chime);
  }, [arrivalAt]);

  // Leaving a station: doors, then a short melody.
  useEffect(() => {
    if (!seen.departure) return;
    sfx.play("doorLock", { volume: 0.8 });
    const melody = setTimeout(() => sfx.play("departure", { volume: 0.55 }), 800);
    return () => clearTimeout(melody);
  }, [seen.departure]);

  // Tunnel sound deepens in two steps: rail → low rumble → tunnel hum.
  useEffect(() => {
    if (!inTunnel) {
      const t = setTimeout(() => setStage("off"), 0);
      return () => clearTimeout(t);
    }
    const a = setTimeout(() => setStage("rumble"), 0);
    const b = setTimeout(() => setStage("deep"), 7000);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, [inTunnel]);

  const onPlatform = phase === "stop" || phase === "paused" || (phase === "cabin" && !active);
  const scene: SceneMode = phase === "final" ? "still" : departing || onPlatform ? "platform" : inTunnel ? "tunnel" : "night";
  const platformPreset: PresetId = carriage === "rain" ? "platform-rain" : "platform";
  const preset: PresetId =
    phase === "boarding" || phase === "final" || onPlatform
      ? platformPreset
      : departing
        ? "quiet-cabin"
        : stage === "deep"
          ? "tunnel"
          : stage === "rumble"
            ? "rumble"
            : CARRIAGE_AMBIENCE[carriage];
  useScenePreset(preset, departing ? 3 : stage === "deep" ? 9 : 6);

  // The name board on the platform: where we just arrived, or tonight's platform.
  const lastStation = sessionsOn(data.sessions, today)
    .filter((s) => s.status === "done" || s.status === "partial")
    .pop()?.stationName;
  const { fmt } = useI18n();
  const boardName = lastStation ? fmt.station(lastStation) : journey ? `PLATFORM ${journey.platform}` : "NOCTURNE";

  // Browsers need a gesture to resume audio after a reload: the first tap does it.
  function resumeSound() {
    void sfx.unlock();
    if (!soundOn && started && soundWanted()) void ambience.enable(preset);
  }

  // Pulling out: doors lock, a melody, then the platform starts to slide.
  const pulling = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => pulling.current.forEach(clearTimeout), []);
  // At the ticket machine, fetch the doors' 3D scene ahead of time.
  useEffect(() => {
    if (phase === "boarding") void import("@/components/scene/BoardingScene3D");
  }, [phase]);
  function pullOut() {
    const d = useStore.getState().data;
    // Boarded before Service Time: the train waits at the platform instead.
    if (!d || journeyFor(d, serviceDate(new Date()))?.phase !== "cabin") {
      setDeparting(false);
      return;
    }
    const at = (ms: number, fn: () => void) => pulling.current.push(setTimeout(fn, ms));
    at(600, () => sfx.play("doorLock", { volume: 0.8 }));
    at(1500, () => sfx.play("departure", { volume: 0.55 }));
    at(4200, () => setDeparting(false));
  }

  const route = routeOf(data.sessions, today);
  const upcoming = upcomingOn(data.sessions, today);

  let content: React.ReactNode;
  if (phase === "boarding") {
    content = upcoming.length > 0 && !atDoors ? (
      <TicketMachine
        data={data}
        now={now}
        carriage={machineCarriage}
        onCarriage={setMachineCarriage}
        onTaken={(c) => {
          setChoice(c);
          setDoorsCovered(false);
          setAtDoors(true);
        }}
        onQuickBoard={() => {
          void sfx.unlock();
          if (soundAllowed()) void ambience.enable(CARRIAGE_AMBIENCE[machineCarriage]);
          setCarriage(machineCarriage);
          setDeparting(true);
          board("steady", machineCarriage);
          pullOut();
        }}
      />
    ) : upcoming.length === 0 && !atDoors ? (
      <NoService />
    ) : null;
  } else if (phase === "cabin" && active) {
    content = <Cabin data={data} journey={journey!} active={active} now={now} tunnel={inTunnel} onTunnel={setTunnel} departing={departing} />;
  } else if (phase === "stop" || (phase === "cabin" && !active)) {
    content = <StationStop data={data} journey={journey!} now={now} arriving={arriving} />;
  } else if (phase === "paused") {
    content = <ServicePaused data={data} journey={journey!} now={now} />;
  } else {
    content = <FinalStation data={data} journey={journey!} now={now} arriving={arriving} />;
  }

  const first = route.find((s) => s.status === "planned");

  return (
    <div className="relative isolate h-dvh overflow-hidden" onPointerDown={resumeSound}>
      {phase === "boarding" ? (
        // At the doors, once their scene is up, draw only that.
        !(atDoors && doorsCovered) && (
          <>
            {/* Standing on the platform, at the ticket machine. */}
            <PlatformScene className="fixed inset-0 -z-10" fade={false} mood="waiting" rain={carriage === "rain"} stationName={boardName} />
            <div className="pointer-events-none fixed inset-0 -z-10 bg-[linear-gradient(180deg,rgba(4,6,10,0.55)_0%,rgba(4,6,10,0.78)_50%,rgba(4,6,10,0.94)_100%)]" />
          </>
        )
      ) : atDoors && holdScene ? null : (
        <NightScene mode={scene} carriage={carriage} stationName={boardName} terminal={phase === "final"} />
      )}
      <div key={phase} className="h-full animate-fade">
        {content}
      </div>
      {atDoors && choice && (
        <BoardingDoors
          face={boardingTicketFace(data, today, choice.carriage)}
          carriage={choice.carriage}
          departure={first ? clock(first.plannedStart) : "--:--"}
          destination={fmt.station(route[route.length - 1]?.stationName ?? "NOCTURNE")}
          stationName={boardName}
          onHoldScene={setHoldScene}
          onCovered={() => setDoorsCovered(true)}
          onOpen={() => {
            setCarriage(choice.carriage);
            setDeparting(true);
            board(choice.focus, choice.carriage);
          }}
          onInside={() => {
            setAtDoors(false);
            pullOut();
          }}
        />
      )}
      <SignalChange />
    </div>
  );
}

function NoService() {
  const { t } = useI18n();
  return (
    <div className="mx-auto flex h-dvh max-w-sm flex-col items-center justify-center gap-6 px-6 text-center">
      <p className="eyebrow">{t("journey.noDepartures")}</p>
      <p className="font-display text-3xl">{t("journey.noStationsLeft")}</p>
      <div className="flex gap-3">
        <ButtonLink href="/tasks" variant="secondary">
          {t("journey.reviewTasks")}
        </ButtonLink>
        <ButtonLink href="/service" variant="ghost">
          {t("journey.serviceTime")}
        </ButtonLink>
      </div>
      <Link href="/" className="py-2 text-sm text-mist hover:text-paper">
        {t("common.back")}
      </Link>
    </div>
  );
}
