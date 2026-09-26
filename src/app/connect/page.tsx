"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { PlatformScene } from "@/components/scene/PlatformScene";
import { useI18n } from "@/i18n";
import { MCP_URL, bootstrap, connectToken } from "@/state/session";

type Step = { kind: "loading" } | { kind: "signin" } | { kind: "ask"; client: string; host: string } | { kind: "busy" } | { kind: "error"; key: "auth.connectExpired" | "auth.connectOff" | "auth.connectFailed" };

function request(): string {
  try {
    return new URLSearchParams(window.location.search).get("req") ?? "";
  } catch {
    return "";
  }
}

/**
 * Where Claude's connector sends the traveller to approve access. The
 * request is sealed by the MCP server; approving hands the server this
 * sign-in so it can act as the traveller (within the same security rules),
 * and the browser returns to Claude with a one-time code.
 */
export default function ConnectPage() {
  const { t } = useI18n();
  const [step, setStep] = useState<Step>({ kind: "loading" });

  useEffect(() => {
    let live = true;
    const req = request();
    (async () => {
      if (!MCP_URL) return setStep({ kind: "error", key: "auth.connectOff" });
      if (!req) return setStep({ kind: "error", key: "auth.connectExpired" });
      const res = await fetch(`${MCP_URL}/authorize/info?req=${encodeURIComponent(req)}`).catch(() => null);
      if (!res?.ok) return live && setStep({ kind: "error", key: "auth.connectExpired" });
      const info = (await res.json()) as { client: string; host: string };
      const token = await connectToken().catch(() => null);
      // A brand-new account gets its data set up here, as the app would on first launch.
      if (token) await bootstrap().catch(() => null);
      if (!live) return;
      setStep(token ? { kind: "ask", client: info.client, host: info.host } : { kind: "signin" });
    })();
    return () => {
      live = false;
    };
  }, []);

  async function decide(approve: boolean) {
    setStep({ kind: "busy" });
    try {
      const refreshToken = approve ? await connectToken() : null;
      if (approve && !refreshToken) return setStep({ kind: "signin" });
      const res = await fetch(`${MCP_URL}/authorize/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(approve ? { req: request(), refreshToken } : { req: request(), deny: true }),
      });
      const body = (await res.json().catch(() => ({}))) as { redirect?: string };
      if (!res.ok || !body.redirect) return setStep({ kind: "error", key: res.status === 400 ? "auth.connectExpired" : "auth.connectFailed" });
      window.location.href = body.redirect;
    } catch {
      setStep({ kind: "error", key: "auth.connectFailed" });
    }
  }

  const back = `/login/?next=${encodeURIComponent(`/connect/?req=${encodeURIComponent(typeof window === "undefined" ? "" : request())}`)}`;

  return (
    <div className="relative isolate min-h-dvh overflow-hidden">
      <PlatformScene className="fixed inset-0 -z-10" stationName="NOCTURNE" fade={false} />
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[linear-gradient(180deg,rgba(4,6,10,0.55)_0%,rgba(4,6,10,0.85)_45%,rgba(4,6,10,0.96)_100%)]" />
      <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-6 py-12">
        <p className="animate-enter font-mono text-xs tracking-[0.4em] text-paper-dim">NOCTURNE</p>
        <h1 className="mt-5 animate-enter font-display text-[2rem] leading-tight" style={{ animationDelay: "120ms" }}>
          {t("auth.connectTitle")}
        </h1>

        {step.kind === "loading" || step.kind === "busy" ? (
          <p className="mt-6 animate-pulse text-sm text-mist">{t("auth.signing")}</p>
        ) : step.kind === "ask" ? (
          <div className="mt-6 animate-enter" style={{ animationDelay: "240ms" }}>
            <p className="text-sm leading-relaxed text-mist">{t("auth.connectBody", { client: step.client, host: step.host })}</p>
            <ul className="mt-5 space-y-2 border-l border-lamp/40 pl-4 text-sm text-paper-dim">
              <li>{t("auth.connectCan1")}</li>
              <li>{t("auth.connectCan2")}</li>
              <li>{t("auth.connectCan3")}</li>
            </ul>
            <p className="mt-5 text-xs leading-relaxed text-haze">{t("auth.connectNote")}</p>
            <Button variant="primary" size="lg" className="mt-8 w-full" onClick={() => void decide(true)}>
              {t("auth.connectAllow")}
            </Button>
            <Button variant="ghost" size="md" className="mt-3 w-full" onClick={() => void decide(false)}>
              {t("auth.connectDeny")}
            </Button>
          </div>
        ) : step.kind === "signin" ? (
          <div className="mt-6 animate-enter" style={{ animationDelay: "240ms" }}>
            <p className="text-sm leading-relaxed text-mist">{t("auth.connectSignIn")}</p>
            <Link href={back} className="mt-8 flex min-h-14 w-full items-center justify-center rounded-full bg-paper text-night-950">
              {t("auth.signIn")}
            </Link>
          </div>
        ) : (
          <p role="alert" className="mt-6 text-sm leading-relaxed text-signal">
            {t(step.key)}
          </p>
        )}
      </main>
    </div>
  );
}
