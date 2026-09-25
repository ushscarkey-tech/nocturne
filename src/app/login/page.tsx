"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { enterDemo, isSupabaseConfigured, signIn, signUp } from "@/state/session";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      if (mode === "signin") {
        await signIn(email, password);
        router.replace("/");
      } else {
        const result = await signUp(name || "Traveller", email, password);
        if (result === "signed-in") router.replace("/");
        else setMessage("Check your inbox to confirm your email, then sign in.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  function demo() {
    enterDemo();
    router.replace("/");
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-6 py-16">
      <p className="font-mono text-xs tracking-[0.4em] text-paper-dim">NOCTURNE</p>
      <h1 className="mt-6 font-display text-4xl leading-tight">
        A planner that doesn&rsquo;t break when your plan does.
      </h1>
      <p className="mt-4 text-sm leading-relaxed text-mist">Plan your route. Board the train. Keep moving.</p>

      {isSupabaseConfigured ? (
        <form onSubmit={submit} className="mt-12 space-y-6" aria-label={mode === "signin" ? "Sign in" : "Create account"}>
          {mode === "signup" && (
            <label className="block">
              <span className="eyebrow">Name</span>
              <input className="field" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </label>
          )}
          <label className="block">
            <span className="eyebrow">Email</span>
            <input
              className="field"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </label>
          <label className="block">
            <span className="eyebrow">Password</span>
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
          <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy}>
            {busy ? "One moment…" : mode === "signin" ? "Sign in" : "Create account"}
          </Button>
          <button
            type="button"
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="block w-full text-center text-sm text-mist hover:text-paper"
          >
            {mode === "signin" ? "New here? Create an account" : "Already travelling? Sign in"}
          </button>
        </form>
      ) : (
        <p className="mt-12 text-sm leading-relaxed text-mist">
          Cloud accounts are not configured for this build. Your journey will be saved in this browser.
        </p>
      )}

      <div className="mt-10 border-t border-rule-soft pt-6">
        <Button variant={isSupabaseConfigured ? "ghost" : "primary"} size={isSupabaseConfigured ? "md" : "lg"} className="w-full" onClick={demo}>
          Explore the demo
        </Button>
        <p className="mt-2 text-center text-xs text-haze">Sample tasks, saved only in this browser.</p>
      </div>
    </main>
  );
}
