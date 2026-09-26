/**
 * Firestore over REST, as the signed-in traveller (their ID token), so the
 * security rules apply exactly as they do in the app. Same layout as
 * src/data/firebase.ts: users/{uid} is the profile, and each collection
 * lives under it.
 */
import { COLLECTIONS, diffData, isEmptyChange } from "../src/data/repository";
import { normalizeData, type CollectionName, type NocturneData, type Profile } from "../src/core/types";
import { FIREBASE } from "./config";

const HISTORY_DAYS = 120;
const BATCH_LIMIT = 450;

type FsValue =
  | { nullValue: null }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { doubleValue: number }
  | { stringValue: string }
  | { timestampValue: string }
  | { arrayValue: { values?: FsValue[] } }
  | { mapValue: { fields?: Record<string, FsValue> } };

interface FsDoc {
  name: string;
  fields?: Record<string, FsValue>;
}

const base = () => `https://firestore.googleapis.com/v1/projects/${FIREBASE.projectId}/databases/(default)/documents`;

export function decode(v: FsValue): unknown {
  if ("nullValue" in v) return null;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("stringValue" in v) return v.stringValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("arrayValue" in v) return (v.arrayValue.values ?? []).map(decode);
  if ("mapValue" in v) return decodeFields(v.mapValue.fields ?? {});
  return null;
}

function decodeFields(fields: Record<string, FsValue>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, decode(v)]));
}

/** Like the JS SDK: integers as integerValue, undefined dropped. */
export function encode(v: unknown): FsValue | undefined {
  if (v === undefined) return undefined;
  if (v === null) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isSafeInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === "string") return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map((x) => encode(x) ?? { nullValue: null }) } };
  if (typeof v === "object") return { mapValue: { fields: encodeFields(v as Record<string, unknown>) } };
  return { nullValue: null };
}

function encodeFields(o: Record<string, unknown>): Record<string, FsValue> {
  const out: Record<string, FsValue> = {};
  for (const [k, v] of Object.entries(o)) {
    const e = encode(v);
    if (e) out[k] = e;
  }
  return out;
}

export class Firestore {
  constructor(
    private readonly uid: string,
    private readonly idToken: string,
  ) {}

  private async call<T>(path: string, init: RequestInit = {}): Promise<T | null> {
    const res = await fetch(`${base()}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${this.idToken}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Firestore ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return (await res.json()) as T;
  }

  private docPath(name: CollectionName | null, id?: string) {
    return name ? `/users/${this.uid}/${name}/${encodeURIComponent(id ?? "")}` : `/users/${this.uid}`;
  }

  private fullName(name: CollectionName | null, id?: string) {
    return `projects/${FIREBASE.projectId}/databases/(default)/documents${this.docPath(name, id)}`;
  }

  private async list(name: CollectionName): Promise<Record<string, unknown>[]> {
    const out: Record<string, unknown>[] = [];
    let page = "";
    do {
      const r = await this.call<{ documents?: FsDoc[]; nextPageToken?: string }>(`/users/${this.uid}/${name}?pageSize=300${page ? `&pageToken=${page}` : ""}`);
      for (const d of r?.documents ?? []) out.push({ ...decodeFields(d.fields ?? {}), id: d.name.split("/").pop() });
      page = r?.nextPageToken ?? "";
    } while (page);
    return out;
  }

  private async since(name: CollectionName, date: string): Promise<Record<string, unknown>[]> {
    const rows = await this.call<{ document?: FsDoc }[]>(`/users/${this.uid}:runQuery`, {
      method: "POST",
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: name }],
          where: { fieldFilter: { field: { fieldPath: "date" }, op: "GREATER_THAN_OR_EQUAL", value: { stringValue: date } } },
        },
      }),
    });
    return (rows ?? []).filter((r) => r.document).map((r) => ({ ...decodeFields(r.document!.fields ?? {}), id: r.document!.name.split("/").pop() }));
  }

  /** Everything the app would load, or null for an account with no data yet. */
  async load(): Promise<NocturneData | null> {
    const profile = await this.call<FsDoc>(this.docPath(null));
    if (!profile) return null;
    const since = new Date(Date.now() - HISTORY_DAYS * 86_400_000).toISOString().slice(0, 10);
    const entries = await Promise.all(
      COLLECTIONS.map(async (name) => [name, name === "sessions" || name === "journeys" ? await this.since(name, since) : await this.list(name)] as const),
    );
    const collections = Object.fromEntries(entries) as unknown as Pick<NocturneData, CollectionName>;
    return normalizeData({ profile: { ...(decodeFields(profile.fields ?? {}) as unknown as Profile), id: this.uid }, ...collections });
  }

  /** Write what changed between two snapshots (whole documents, like the SDK's set). */
  async save(prev: NocturneData, next: NocturneData): Promise<number> {
    const changes = diffData(prev, next);
    if (isEmptyChange(changes)) return 0;
    const writes: object[] = [];
    if (changes.profile) writes.push({ update: { name: this.fullName(null), fields: encodeFields({ ...changes.profile }) } });
    for (const name of COLLECTIONS) {
      for (const e of (changes.upserts[name] ?? []) as { id: string }[]) writes.push({ update: { name: this.fullName(name, e.id), fields: encodeFields({ ...e }) } });
      for (const id of changes.deletes[name] ?? []) writes.push({ delete: this.fullName(name, id) });
    }
    for (let i = 0; i < writes.length; i += BATCH_LIMIT) {
      await this.call(`:commit`, { method: "POST", body: JSON.stringify({ writes: writes.slice(i, i + BATCH_LIMIT) }) });
    }
    return writes.length;
  }
}
