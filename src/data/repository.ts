import type { CollectionName, NocturneData, Profile } from "@/core/types";

export const COLLECTIONS: CollectionName[] = ["lines", "tasks", "windows", "sessions", "journeys", "tickets"];

type Entity = { id: string };

export interface ChangeSet {
  profile: Profile | null;
  upserts: Partial<Record<CollectionName, Entity[]>>;
  deletes: Partial<Record<CollectionName, string[]>>;
}

export interface Repository {
  readonly kind: "local" | "supabase" | "firebase";
  load(): Promise<NocturneData | null>;
  /** Persist a change. Local storage writes the whole snapshot; Supabase applies the diff. */
  save(next: NocturneData, changes: ChangeSet): Promise<void>;
  /** Replace everything (demo reset / loading sample data). */
  replaceAll(next: NocturneData): Promise<void>;
}

/**
 * Entities are updated immutably, so a changed record is a new object
 * reference. That makes diffing cheap and exact.
 */
export function diffData(prev: NocturneData, next: NocturneData): ChangeSet {
  const changes: ChangeSet = { profile: prev.profile !== next.profile ? next.profile : null, upserts: {}, deletes: {} };
  for (const name of COLLECTIONS) {
    const before = prev[name] as Entity[];
    const after = next[name] as Entity[];
    if (before === after) continue;
    const beforeById = new Map(before.map((e) => [e.id, e]));
    const afterIds = new Set(after.map((e) => e.id));
    const upserts = after.filter((e) => beforeById.get(e.id) !== e);
    const deletes = before.filter((e) => !afterIds.has(e.id)).map((e) => e.id);
    if (upserts.length) changes.upserts[name] = upserts;
    if (deletes.length) changes.deletes[name] = deletes;
  }
  return changes;
}

export function isEmptyChange(c: ChangeSet): boolean {
  return !c.profile && Object.keys(c.upserts).length === 0 && Object.keys(c.deletes).length === 0;
}
