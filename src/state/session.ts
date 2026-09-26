"use client";

import { newId } from "@/core/ids";
import { createEmptyData, defaultWindows } from "@/core/seed";
import { detectLocale } from "@/i18n";
import { COLLECTIONS } from "@/data/repository";
import { PROFILE_DEFAULTS, type NocturneData } from "@/core/types";
import { cloudKind, getCloud, isCloudConfigured } from "@/data/cloud";
import { LocalRepository } from "@/data/local";
import { ensureToday } from "./actions";
import { useStore } from "./store";

const MODE_KEY = "nocturne:mode";

function readMode(): string | null {
  try {
    return window.localStorage.getItem(MODE_KEY);
  } catch {
    return null;
  }
}

/**
 * "cloud" once someone has signed in on this browser; anything else means
 * the data lives here. Accounts are optional: nobody meets a login wall.
 */
function writeMode(mode: "cloud" | "demo" | null) {
  try {
    if (mode) window.localStorage.setItem(MODE_KEY, mode);
    else window.localStorage.removeItem(MODE_KEY);
  } catch {
    /* storage unavailable */
  }
}

export type BootResult = "ready" | "login";

let booting: Promise<BootResult> | null = null;

/** Load the traveller's data once per page lifetime. */
export function bootstrap(): Promise<BootResult> {
  const { status } = useStore.getState();
  if (status === "ready") return Promise.resolve("ready");
  booting ??= doBootstrap().finally(() => {
    booting = null;
  });
  return booting;
}

async function doBootstrap(): Promise<BootResult> {
  const store = useStore.getState();
  try {
    const useCloud = isCloudConfigured && readMode() === "cloud";
    if (useCloud) {
      const cloud = await getCloud();
      const user = await cloud.currentUser();
      // Signed out elsewhere or expired: ask again (with a way to carry on locally).
      if (!user) return "login";
      const repo = cloud.repository(user.id, (message) => useStore.setState({ syncError: message }));
      store.begin("cloud", repo);
      let data: NocturneData | null = await repo.load();
      if (!data) {
        // First sign-in: bring along what this browser already holds, or start fresh.
        data = await localDataFor(user.id, user.name);
        data ??= createEmptyData({
          id: user.id,
          name: user.name ?? user.email?.split("@")[0] ?? "",
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          createdAt: new Date().toISOString(),
          preferredCarriage: "rain",
          autoTunnel: true,
          ...PROFILE_DEFAULTS,
          locale: detectLocale(),
        });
        await repo.replaceAll(data);
      } else if (data.windows.length === 0 && data.tasks.length === 0 && data.journeys.length === 0) {
        // Start with sensible Service Time.
        const windows = defaultWindows(user.id);
        data = { ...data, windows };
        await repo.save(data, { profile: null, upserts: { windows }, deletes: {} });
      }
      useStore.getState().ready(data);
    } else {
      const repo = new LocalRepository("demo");
      store.begin("demo", repo);
      let data = await repo.load();
      if (!data) {
        // A first visit starts empty; the welcome guide sets things up.
        data = createEmptyData({
          id: newId(),
          name: "",
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          createdAt: new Date().toISOString(),
          preferredCarriage: "rain",
          autoTunnel: true,
          ...PROFILE_DEFAULTS,
          locale: detectLocale(),
        });
        await repo.replaceAll(data);
      }
      useStore.getState().ready(data);
    }
    ensureToday();
    return "ready";
  } catch (e) {
    useStore.getState().fail(e instanceof Error ? e.message : "Nocturne could not load your data.");
    return "ready";
  }
}

export function enterDemo() {
  writeMode("demo");
  useStore.getState().reset();
}

/** The browser's own data, re-keyed to a cloud account — only if it holds anything. */
async function localDataFor(userId: string, name: string | null): Promise<NocturneData | null> {
  const local = await new LocalRepository("demo").load();
  if (!local || (local.tasks.length === 0 && local.journeys.length === 0 && !local.profile.onboardedAt)) return null;
  const rekey = <T extends { userId: string }>(list: T[]) => list.map((e) => ({ ...e, userId }));
  const data = { ...local, profile: { ...local.profile, id: userId, name: local.profile.name || name || "" } } as NocturneData;
  for (const c of COLLECTIONS) (data as unknown as Record<string, unknown>)[c] = rekey(local[c] as { userId: string }[]);
  return data;
}

export async function signIn(email: string, password: string) {
  await (await getCloud()).signIn(email, password);
  writeMode("cloud");
  useStore.getState().reset();
}

export async function signUp(name: string, email: string, password: string): Promise<"signed-in" | "confirm-email"> {
  const result = await (await getCloud()).signUp(name, email, password);
  if (result === "signed-in") writeMode("cloud");
  useStore.getState().reset();
  return result;
}

export async function signInWithGoogle() {
  const cloud = await getCloud();
  if (!cloud.signInWithGoogle) throw new Error("auth.errorProviderOff");
  await cloud.signInWithGoogle();
  writeMode("cloud");
  useStore.getState().reset();
}

export async function resetPassword(email: string) {
  if (!email.trim()) throw new Error("auth.resetNeedEmail");
  const cloud = await getCloud();
  if (!cloud.resetPassword) throw new Error("auth.errorDefault");
  await cloud.resetPassword(email.trim());
}

/** The signed-in traveller's session credential, for connecting Claude; null when not signed in. */
export async function connectToken(): Promise<string | null> {
  if (!isCloudConfigured || readMode() !== "cloud") return null;
  const cloud = await getCloud();
  if (!(await cloud.currentUser())) return null;
  return (await cloud.sessionToken?.()) ?? null;
}

/** Where Claude's connector lives (the MCP server), if one is set up. */
export const MCP_URL = (process.env.NEXT_PUBLIC_MCP_URL ?? "").replace(/\/$/, "");

/** Whether this backend offers Google sign-in (known without loading it). */
export const hasGoogleSignIn = cloudKind === "firebase";

export async function signOut() {
  const { mode } = useStore.getState();
  if (mode === "cloud") await (await getCloud()).signOut();
  writeMode(null);
  useStore.getState().reset();
}

/** Wipe the demo traveller and start over with fresh sample data. */
export async function resetDemo() {
  const repo = new LocalRepository("demo");
  repo.clear();
  useStore.getState().reset();
  await bootstrap();
}

export { isCloudConfigured };
