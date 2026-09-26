import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { normalizeData, type CollectionName, type NocturneData, type Profile } from "@/core/types";
import { COLLECTIONS, type ChangeSet, type Repository } from "./repository";
import type { CloudBackend } from "./cloud";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && key);

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!isSupabaseConfigured) throw new Error("Supabase is not configured.");
  client ??= createClient(url!, key!, { auth: { persistSession: true, autoRefreshToken: true } });
  return client;
}

const TABLES: Record<CollectionName, string> = {
  lines: "lines",
  tasks: "tasks",
  windows: "study_windows",
  sessions: "study_sessions",
  journeys: "journeys",
  tickets: "tickets",
};

/** Timestamp columns are normalised to `toISOString()` so string ordering stays valid. */
const TIMESTAMPS: Record<CollectionName, string[]> = {
  lines: ["createdAt"],
  tasks: ["createdAt", "updatedAt", "completedAt"],
  windows: [],
  sessions: ["plannedStart", "plannedEnd", "actualStart", "actualEnd", "resumedAt"],
  journeys: ["plannedDeparture", "plannedArrival", "startedAt", "completedAt", "stopEndsAt"],
  tickets: ["generatedAt"],
};

/** Parent tables first so foreign keys resolve on insert; reverse for deletes. */
const WRITE_ORDER: CollectionName[] = ["lines", "tasks", "windows", "journeys", "sessions", "tickets"];

const toSnake = (s: string) => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const toCamel = (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

function toRow(entity: object): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(entity)) row[toSnake(k)] = v;
  return row;
}

function fromRow<T>(name: CollectionName, row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) out[toCamel(k)] = v;
  for (const f of TIMESTAMPS[name]) if (typeof out[f] === "string") out[f] = new Date(out[f] as string).toISOString();
  if (name === "windows") {
    out.startTime = String(out.startTime).slice(0, 5);
    out.endTime = String(out.endTime).slice(0, 5);
  }
  return out as T;
}

function profileFromRow(row: Record<string, unknown>): Profile {
  return {
    id: row.id as string,
    name: (row.name as string) ?? "Traveller",
    timezone: (row.timezone as string) ?? "UTC",
    createdAt: new Date(row.created_at as string).toISOString(),
    preferredCarriage: (row.preferred_carriage as Profile["preferredCarriage"]) ?? "rain",
    autoTunnel: (row.auto_tunnel as boolean) ?? true,
    locale: ((row.locale as Profile["locale"]) ?? "en"),
    onboardedAt: row.onboarded_at ? new Date(row.onboarded_at as string).toISOString() : null,
    learnFromSessions: (row.learn_from_sessions as boolean) ?? true,
    autoAdjustEstimates: (row.auto_adjust_estimates as boolean) ?? true,
    useFocusHistory: (row.use_focus_history as boolean) ?? true,
    shortStops: (row.short_stops as boolean) ?? false,
  };
}

export class SupabaseRepository implements Repository {
  readonly kind = "supabase" as const;
  constructor(private readonly userId: string) {}

  private get db() {
    return getSupabase();
  }

  async load(): Promise<NocturneData | null> {
    const { data: profileRow, error: profileError } = await this.db.from("profiles").select("*").eq("id", this.userId).maybeSingle();
    if (profileError) throw profileError;
    if (!profileRow) return null;

    const since = new Date(Date.now() - 120 * 86_400_000).toISOString().slice(0, 10);
    const results = await Promise.all(
      COLLECTIONS.map(async (name) => {
        let query = this.db.from(TABLES[name]).select("*").eq("user_id", this.userId);
        if (name === "sessions" || name === "journeys") query = query.gte("date", since);
        const { data, error } = await query;
        if (error) throw error;
        return [name, (data ?? []).map((r) => fromRow(name, r))] as const;
      }),
    );
    const collections = Object.fromEntries(results) as Pick<NocturneData, CollectionName>;
    return normalizeData({ profile: profileFromRow(profileRow), ...collections });
  }

  async save(_next: NocturneData, changes: ChangeSet): Promise<void> {
    if (changes.profile) await this.saveProfile(changes.profile);
    for (const name of WRITE_ORDER) {
      const rows = changes.upserts[name];
      if (rows?.length) {
        const { error } = await this.db.from(TABLES[name]).upsert(rows.map(toRow));
        if (error) throw error;
      }
    }
    for (const name of [...WRITE_ORDER].reverse()) {
      const ids = changes.deletes[name];
      if (ids?.length) {
        const { error } = await this.db.from(TABLES[name]).delete().in("id", ids);
        if (error) throw error;
      }
    }
  }

  async replaceAll(next: NocturneData): Promise<void> {
    for (const name of [...WRITE_ORDER].reverse()) {
      const { error } = await this.db.from(TABLES[name]).delete().eq("user_id", this.userId);
      if (error) throw error;
    }
    const upserts = Object.fromEntries(COLLECTIONS.map((n) => [n, next[n]]));
    await this.save(next, { profile: next.profile, upserts, deletes: {} });
  }

  private async saveProfile(p: Profile) {
    const { error } = await this.db.from("profiles").upsert({
      id: p.id,
      name: p.name,
      timezone: p.timezone,
      preferred_carriage: p.preferredCarriage,
      auto_tunnel: p.autoTunnel,
      locale: p.locale,
      onboarded_at: p.onboardedAt,
      learn_from_sessions: p.learnFromSessions,
      auto_adjust_estimates: p.autoAdjustEstimates,
      use_focus_history: p.useFocusHistory,
    });
    if (error) throw error;
  }
}

export const supabaseBackend: CloudBackend = {
  kind: "supabase",
  async currentUser() {
    const { data } = await getSupabase().auth.getSession();
    const u = data.session?.user;
    return u ? { id: u.id, email: u.email ?? null, name: (u.user_metadata?.name as string | undefined) ?? null } : null;
  },
  async signIn(email, password) {
    const { error } = await getSupabase().auth.signInWithPassword({ email, password });
    if (error) throw error;
  },
  async signUp(name, email, password) {
    const { data, error } = await getSupabase().auth.signUp({ email, password, options: { data: { name } } });
    if (error) throw error;
    return data.session ? "signed-in" : "confirm-email";
  },
  async signOut() {
    await getSupabase().auth.signOut();
  },
  repository(userId) {
    return new SupabaseRepository(userId);
  },
};
