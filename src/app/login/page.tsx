"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { PlatformScene } from "@/components/scene/PlatformScene";
import { enterDemo, hasGoogleSignIn, isCloudConfigured, resetPassword, signIn, signInWithGoogle, signUp } from "@/state/session";
import { useI18n, type MessageKey } from "@/i18n";

/**
 * Accounts are optional: this page is reached from Settings (or when a
 * signed-in session has lapsed). Signing in brings this browser's nights
 * along into the account.
 */
export default function LoginPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const say = (err: unknown) => {
    const text = err instanceof Error ? err.message : "auth.errorDefault";
    if (text === "auth.cancelled") return; // closed the Google window: nothing to say
    setError(text.startsWith("auth.") ? t(text as MessageKey) : text);
  };

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await work();
    } catch (err) {
      say(err);
    } finally {
      setBusy(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    void run(async () => {
      if (mode === "signin") {
        await signIn(email, password);
        router.replace("/");
      } else {
        const result = await signUp(name || "Traveller", email, password);
        if (result === "signed-in") router.replace("/");
        else setMessage(t("auth.checkInbox"));
      }
    });
  }

  function google() {
    void run(async () => {
      await signInWithGoogle();
      router.replace("/");
    });
  }

  function forgot() {
    void run(async () => {
      await resetPassword(email);
      setMessage(t("auth.resetSent"));
    });
  }

  function later() {
    enterDemo();
    router.replace("/");
  }

  return (
    <div className="relative isolate min-h-dvh overflow-hidden">
      <PlatformScene className="fixed inset-0 -z-10" stationName="NOCTURNE" fade={false} />
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[linear-gradient(180deg,rgba(4,6,10,0.55)_0%,rgba(4,6,10,0.82)_45%,rgba(4,6,10,0.96)_100%)]" />

      <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-6 py-12">
        <p className="animate-enter font-mono text-xs tracking-[0.4em] text-paper-dim">NOCTURNE</p>
        <h1 className="mt-5 animate-enter font-display text-[2rem] leading-tight" style={{ animationDelay: "120ms" }}>
          {t("auth.headline")}
        </h1>
        <p className="mt-3 animate-enter text-sm leading-relaxed text-mist" style={{ animationDelay: "240ms" }}>
          {isCloudConfigured ? t("auth.syncPitch") : t("auth.noSupabase")}
        </p>

        {isCloudConfigured && (
          <div className="mt-9 animate-enter" style={{ animationDelay: "360ms" }}>
            {hasGoogleSignIn && (
              <>
                <Button variant="primary" size="lg" className="w-full gap-3" onClick={google} disabled={busy}>
                  <GoogleMark />
                  {t("auth.google")}
                </Button>
                <p className="my-6 flex items-center gap-3 text-[0.6875rem] tracking-[0.2em] text-haze before:h-px before:flex-1 before:bg-rule-soft after:h-px after:flex-1 after:bg-rule-soft">
                  {t("auth.or")}
                </p>
              </>
            )}
            <form onSubmit={submit} className="space-y-5" aria-label={mode === "signin" ? t("auth.signInForm") : t("auth.createAccountForm")}>
              {mode === "signup" && (
                <label className="block">
                  <span className="eyebrow">{t("auth.name")}</span>
                  <input className="field" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
                </label>
              )}
              <label className="block">
                <span className="eyebrow">{t("auth.email")}</span>
                <input className="field" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
              </label>
              <label className="block">
                <span className="eyebrow">{t("auth.password")}</span>
                <input
                  className="field"
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                />
              </label>
              {error && (
                <p role="alert" className="text-sm text-signal">
                  {error}
                </p>
              )}
              {message && (
                <p role="status" className="text-sm text-paper-dim">
                  {message}
                </p>
              )}
              <Button type="submit" variant={hasGoogleSignIn ? "secondary" : "primary"} size="lg" className="w-full" disabled={busy}>
                {busy ? t("auth.signing") : mode === "signin" ? t("auth.signIn") : t("auth.createAccount")}
              </Button>
              <div className="flex items-center justify-between gap-4 text-sm">
                <button type="button" onClick={() => setMode(mode === "signin" ? "signup" : "signin")} className="min-h-10 text-mist hover:text-paper">
                  {mode === "signin" ? t("auth.newHere") : t("auth.alreadyTravelling")}
                </button>
                {mode === "signin" && (
                  <button type="button" onClick={forgot} disabled={busy} className="min-h-10 text-haze hover:text-mist">
                    {t("auth.forgot")}
                  </button>
                )}
              </div>
            </form>
          </div>
        )}

        <div className="mt-8 animate-enter border-t border-rule-soft pt-5" style={{ animationDelay: "480ms" }}>
          <Button variant="ghost" size="md" className="w-full" onClick={later}>
            {isCloudConfigured ? t("auth.later") : t("auth.exploreDemo")}
          </Button>
          <p className="mt-2 text-center text-xs leading-relaxed text-haze">{t("auth.laterNote")}</p>
        </div>
      </main>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z" />
      <path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-2.9-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.2 0-11.5-4.1-13.4-9.8l-7.9 6.1C6.6 42.6 14.6 48 24 48z" />
    </svg>
  );
}
