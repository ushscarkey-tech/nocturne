"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { PresetId } from "@/audio/engine";
import { ambience, soundWanted, useAmbienceState, useScenePreset } from "@/audio/useAmbience";
import { CARRIAGE_AMBIENCE, journeyFor } from "@/core/journey";
import { activeSession, sessionsOn, upcomingOn } from "@/core/sessions";
import { serviceDate } from "@/core/time";
import type { CarriageId } from "@/core/types";
import { ButtonLink } from "@/components/ui/Button";
import { Boarding } from "@/components/journey/Boarding";
import { Cabin } from "@/components/journey/Cabin";
import { FinalStation } from "@/components/journey/FinalStation";
import { NightScene, type SceneMode } from "@/components/journey/NightScene";
import { ServicePaused, StationStop } from "@/components/journey/Platform";
import { useNow } from "@/lib/hooks";
import { useData } from "@/state/store";

type TunnelStage = "off" | "rumble" | "deep";

export default function JourneyPage() {
  const data = useData();
  const now = useNow(1000);
  const today = serviceDate(now);
  const journey = journeyFor(data, today);
  const active = activeSession(data.sessions);
  const [tunnel, setTunnel] = useState(false);
  const [stage, setStage] = useState<TunnelStage>("off");
  const [boardingCarriage, setBoardingCarriage] = useState<CarriageId>(journey?.selectedCarriage ?? data.profile.preferredCarriage);
  const { enabled: soundOn } = useAmbienceState();

  const started = !!journey?.startedAt;
  const phase = !started ? "boarding" : journey!.phase;
  const carriage = started ? journey!.selectedCarriage : boardingCarriage;
  const inTunnel = phase === "cabin" && tunnel && !!active?.resumedAt;

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

  const onPlatform = phase === "stop" || phase === "paused" || phase === "boarding" || (phase === "cabin" && !active);
  const scene: SceneMode = phase === "final" ? "still" : onPlatform ? "platform" : inTunnel ? "tunnel" : "night";
  const preset: PresetId =
    phase === "final"
      ? "silence"
      : onPlatform
        ? carriage === "rain"
          ? "platform-rain"
          : "platform"
        : stage === "deep"
          ? "tunnel"
          : stage === "rumble"
            ? "rumble"
            : CARRIAGE_AMBIENCE[carriage];
  useScenePreset(preset, stage === "deep" ? 9 : 5);

  // The name board on the platform: where we just arrived, or tonight's platform.
  const lastStation = sessionsOn(data.sessions, today)
    .filter((s) => s.status === "done" || s.status === "partial")
    .pop()?.stationName;
  const boardName = lastStation ?? (journey ? `PLATFORM ${journey.platform}` : "NOCTURNE");

  // The night ends in silence (the preference to have sound is kept).
  useEffect(() => {
    if (phase !== "final") return;
    const t = setTimeout(() => ambience.disable(false), 6000);
    return () => clearTimeout(t);
  }, [phase]);

  // Browsers need a gesture to resume audio after a reload: the first tap does it.
  function resumeSound() {
    if (!soundOn && started && phase !== "final" && soundWanted()) void ambience.enable(preset);
  }

  let content: React.ReactNode;
  if (phase === "boarding") {
    content =
      upcomingOn(data.sessions, today).length > 0 ? (
        <Boarding data={data} now={now} carriage={boardingCarriage} onCarriage={setBoardingCarriage} />
      ) : (
        <NoService />
      );
  } else if (phase === "cabin" && active) {
    content = <Cabin data={data} journey={journey!} active={active} now={now} tunnel={inTunnel} onTunnel={setTunnel} />;
  } else if (phase === "stop" || (phase === "cabin" && !active)) {
    content = <StationStop data={data} journey={journey!} now={now} />;
  } else if (phase === "paused") {
    content = <ServicePaused data={data} journey={journey!} now={now} />;
  } else {
    content = <FinalStation data={data} journey={journey!} now={now} />;
  }

  return (
    <div className="relative isolate min-h-dvh overflow-hidden" onPointerDown={resumeSound}>
      <NightScene mode={scene} carriage={carriage} stationName={boardName} />
      <div key={phase} className={phase === "cabin" ? "animate-sway" : undefined}>
        {content}
      </div>
    </div>
  );
}

function NoService() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-6 px-6 text-center">
      <p className="eyebrow">No departures</p>
      <p className="font-display text-3xl">There are no stations left on tonight&rsquo;s route.</p>
      <div className="flex gap-3">
        <ButtonLink href="/tasks" variant="secondary">
          Review tasks
        </ButtonLink>
        <ButtonLink href="/service" variant="ghost">
          Service Time
        </ButtonLink>
      </div>
      <Link href="/" className="py-2 text-sm text-mist hover:text-paper">
        Back to Tonight
      </Link>
    </div>
  );
}
