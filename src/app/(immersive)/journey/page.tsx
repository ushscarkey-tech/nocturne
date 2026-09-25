"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { PresetId } from "@/audio/engine";
import { ambience, useScenePreset } from "@/audio/useAmbience";
import { CARRIAGE_AMBIENCE, journeyFor } from "@/core/journey";
import { activeSession, upcomingOn } from "@/core/sessions";
import { toDateKey } from "@/core/time";
import type { CarriageId } from "@/core/types";
import { ButtonLink } from "@/components/ui/Button";
import { Boarding } from "@/components/journey/Boarding";
import { Cabin } from "@/components/journey/Cabin";
import { FinalStation } from "@/components/journey/FinalStation";
import { NightScene, type SceneMode } from "@/components/journey/NightScene";
import { ServicePaused, StationStop } from "@/components/journey/Platform";
import { useNow } from "@/lib/hooks";
import { useData } from "@/state/store";

export default function JourneyPage() {
  const data = useData();
  const now = useNow(1000);
  const today = toDateKey(now);
  const journey = journeyFor(data, today);
  const active = activeSession(data.sessions);
  const [tunnel, setTunnel] = useState(false);
  const [boardingCarriage, setBoardingCarriage] = useState<CarriageId>(journey?.selectedCarriage ?? data.profile.preferredCarriage);

  const started = !!journey?.startedAt;
  const phase = !started ? "boarding" : journey!.phase;
  const carriage = started ? journey!.selectedCarriage : boardingCarriage;
  const inTunnel = phase === "cabin" && tunnel && !!active?.resumedAt;

  const scene: SceneMode =
    phase === "cabin" ? (inTunnel ? "tunnel" : "night") : phase === "final" ? "still" : "platform";
  const preset: PresetId =
    phase === "cabin" ? (inTunnel ? "tunnel" : CARRIAGE_AMBIENCE[carriage]) : phase === "final" ? "silence" : "platform";
  useScenePreset(preset, inTunnel ? 8 : 5);

  // The night ends in silence.
  useEffect(() => {
    if (phase !== "final") return;
    const t = setTimeout(() => ambience.disable(), 6000);
    return () => clearTimeout(t);
  }, [phase]);

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
    content = <FinalStation data={data} journey={journey!} />;
  }

  return (
    <div className="relative isolate min-h-dvh overflow-hidden">
      <NightScene mode={scene} carriage={carriage} />
      {content}
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
      <Link href="/" className="text-sm text-mist hover:text-paper">
        Back to Tonight
      </Link>
    </div>
  );
}
