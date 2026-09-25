"use client";

import { createEmptyData, createSeedData, defaultWindows } from "@/core/seed";
import type { NocturneData } from "@/core/types";
import { LocalRepository } from "@/data/local";
import { getSupabase, isSupabaseConfigured, SupabaseRepository } from "@/data/supabase";
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

function writeMode(mode: "demo" | null) {
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
    const useCloud = isSupabaseConfigured && readMode() !== "demo";
    if (useCloud) {
      const { data: auth } = await getSupabase().auth.getSession();
      const user = auth.session?.user;
      if (!user) return "login";
      const repo = new SupabaseRepository(user.id);
      store.begin("cloud", repo);
      let data: NocturneData | null = await repo.load();
      if (!data) {
        const name = (user.user_metadata?.name as string | undefined) ?? user.email?.split("@")[0] ?? "Traveller";
        data = createEmptyData({
          id: user.id,
          name,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          createdAt: new Date().toISOString(),
          preferredCarriage: "rain",
          autoTunnel: true,
        });
        await repo.replaceAll(data);
      } else if (data.windows.length === 0 && data.tasks.length === 0 && data.journeys.length === 0) {
        // First sign-in: start with sensible Service Time.
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
        data = createSeedData(new Date());
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

export async function signIn(email: string, password: string) {
  const { error } = await getSupabase().auth.signInWithPassword({ email, password });
  if (error) throw error;
  writeMode(null);
  useStore.getState().reset();
}

export async function signUp(name: string, email: string, password: string): Promise<"signed-in" | "confirm-email"> {
  const { data, error } = await getSupabase().auth.signUp({ email, password, options: { data: { name } } });
  if (error) throw error;
  writeMode(null);
  useStore.getState().reset();
  return data.session ? "signed-in" : "confirm-email";
}

export async function signOut() {
  const { mode } = useStore.getState();
  if (mode === "cloud") await getSupabase().auth.signOut();
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

export { isSupabaseConfigured };
