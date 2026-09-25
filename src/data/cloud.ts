import type { Repository } from "./repository";

/**
 * Cloud accounts are optional. Firebase is used when its keys are set,
 * otherwise Supabase; with neither, Nocturne keeps everything in the browser.
 * Backends are loaded on demand so a local-only build never downloads them.
 */

export interface CloudUser {
  id: string;
  email: string | null;
  name: string | null;
}

export interface CloudBackend {
  kind: "firebase" | "supabase";
  currentUser(): Promise<CloudUser | null>;
  signIn(email: string, password: string): Promise<void>;
  signUp(name: string, email: string, password: string): Promise<"signed-in" | "confirm-email">;
  signOut(): Promise<void>;
  repository(userId: string, onLateError?: (message: string) => void): Repository;
}

const firebaseConfigured = Boolean(
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY &&
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN &&
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID &&
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
);
const supabaseConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
);

export const isCloudConfigured = firebaseConfigured || supabaseConfigured;

let backend: Promise<CloudBackend> | null = null;

export function getCloud(): Promise<CloudBackend> {
  if (!isCloudConfigured) return Promise.reject(new Error("No cloud backend is configured."));
  backend ??= firebaseConfigured
    ? import("./firebase").then((m) => m.firebaseBackend)
    : import("./supabase").then((m) => m.supabaseBackend);
  return backend;
}
