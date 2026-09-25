"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { CARRIAGES } from "@/components/journey/Boarding";
import { Button } from "@/components/ui/Button";
import { Field, Toggle } from "@/components/ui/controls";
import { Icon } from "@/components/ui/Icon";
import { Sheet } from "@/components/ui/Sheet";
import { notificationsEnabled, notificationsSupported, requestNotifications } from "@/lib/notify";
import { loadSampleData, updateProfile } from "@/state/actions";
import { isSupabaseConfigured, resetDemo, signOut } from "@/state/session";
import { useData, useStore } from "@/state/store";

export default function SettingsPage() {
  const data = useData();
  const mode = useStore((s) => s.mode);
  const router = useRouter();
  const [name, setName] = useState(data.profile.name);
  const [confirm, setConfirm] = useState<null | "reset" | "sample">(null);
  const [notifyOn, setNotifyOn] = useState(false);
  const supported = useSyncExternalStore(
    () => () => {},
    () => notificationsSupported(),
    () => false,
  );
  const granted = useSyncExternalStore(
    () => () => {},
    () => notificationsEnabled(),
    () => false,
  );

  return (
    <div className="animate-fade">
      <header>
        <p className="eyebrow">Traveller</p>
        <h1 className="mt-2 font-display text-5xl leading-none">Settings</h1>
      </header>

      <section className="mt-12 space-y-8" aria-label="Profile">
        <Field label="Name">
          <input
            className="field"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name.trim() && name !== data.profile.name && updateProfile({ name: name.trim() })}
          />
        </Field>
        <div>
          <p className="eyebrow">Default carriage</p>
          <div className="mt-3 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Default carriage">
            {CARRIAGES.map((c) => (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={data.profile.preferredCarriage === c.id}
                onClick={() => updateProfile({ preferredCarriage: c.id })}
                className={`rounded-xl border px-4 py-3 text-left text-sm transition-colors ${
                  data.profile.preferredCarriage === c.id ? "border-lamp/60 text-paper" : "border-rule text-mist hover:text-paper"
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>
        <div className="divide-y divide-rule-soft border-y border-rule-soft">
          <Toggle
            checked={data.profile.autoTunnel}
            onChange={(v) => updateProfile({ autoTunnel: v })}
            label="Enter the Tunnel automatically"
            description="After a quiet minute of focus, the interface fades to deep focus."
          />
          {supported && (
            <Toggle
              checked={granted || notifyOn}
              onChange={async (v) => {
                if (v) setNotifyOn(await requestNotifications());
              }}
              label="Departure reminders"
              description={granted ? "On. Turn off in your browser's site settings." : "Five minutes before departure, and one deadline note a day."}
            />
          )}
        </div>
        <Link href="/service" className="flex items-center justify-between py-1 text-sm text-paper-dim hover:text-paper">
          Service Time <Icon name="chevron" size={16} />
        </Link>
      </section>

      <section className="mt-14" aria-labelledby="account-title">
        <h2 id="account-title" className="eyebrow">
          {mode === "cloud" ? "Account" : "Demo"}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-mist">
          {mode === "cloud"
            ? "Your tasks and journeys sync to your Nocturne account."
            : "You're exploring with sample data saved in this browser only."}
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          {mode === "cloud" ? (
            <>
              <Button variant="secondary" onClick={() => setConfirm("sample")}>
                Load sample data
              </Button>
              <Button
                variant="ghost"
                onClick={async () => {
                  await signOut();
                  router.replace("/login");
                }}
              >
                Sign out
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setConfirm("reset")}>
                Reset demo
              </Button>
              {isSupabaseConfigured && (
                <Button
                  variant="ghost"
                  onClick={async () => {
                    await signOut();
                    router.replace("/login");
                  }}
                >
                  Sign in instead
                </Button>
              )}
            </>
          )}
        </div>
      </section>

      <Sheet
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm === "reset" ? "Reset the demo?" : "Replace with sample data?"}
        eyebrow="This can't be undone"
      >
        <p className="text-sm leading-relaxed text-mist">
          {confirm === "reset"
            ? "All demo tasks, journeys and tickets in this browser are replaced with fresh sample data."
            : "Your current tasks, lines, journeys and tickets are replaced with sample data."}
        </p>
        <div className="mt-8 flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setConfirm(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={async () => {
              const which = confirm;
              setConfirm(null);
              if (which === "reset") await resetDemo();
              else await loadSampleData();
              router.push("/");
            }}
          >
            {confirm === "reset" ? "Reset demo" : "Replace data"}
          </Button>
        </div>
      </Sheet>
    </div>
  );
}
