import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createEmptyData } from "../../src/core/seed";
import { serviceDate } from "../../src/core/time";
import { PROFILE_DEFAULTS, type StudySession } from "../../src/core/types";
import { seal } from "../auth";
import { decode, encode } from "../firestore";
import { handle } from "../server";

type Fields = Record<string, ReturnType<typeof encode>>;

/**
 * Just enough of Firestore's REST API to hold one traveller, answer slowly
 * (so parallel calls interleave) and enforce commit preconditions.
 */
function fakeFirestore(seed: Record<string, Record<string, unknown>>) {
  const docs = new Map<string, { fields: Fields; updateTime: string }>();
  let clock = 0;
  const tick = () => new Date(Date.UTC(2026, 0, 1, 0, 0, 0, ++clock)).toISOString();
  const encodeAll = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, encode(v)]).filter(([, v]) => v)) as Fields;
  for (const [path, value] of Object.entries(seed)) docs.set(path, { fields: encodeAll(value), updateTime: tick() });
  const root = "projects/nocturne-7cb72/databases/(default)/documents";
  const out = (path: string) => ({ name: `${root}/${path}`, ...docs.get(path)! });
  const reply = async (body: unknown, status = 200) => {
    await new Promise((r) => setTimeout(r, Math.random() * 15));
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
  };

  const fetcher = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.hostname === "securetoken.googleapis.com") return reply({ id_token: "id", user_id: "u", expires_in: "3600" });
    const path = decodeURIComponent(url.pathname.split("/documents/")[1] ?? "");
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    if (url.pathname.endsWith(":commit")) {
      const writes = body.writes as { update?: { name: string; fields: Fields }; delete?: string; updateMask?: { fieldPaths: string[] }; currentDocument?: { updateTime?: string } }[];
      const key = (name: string) => name.slice(root.length + 1);
      for (const w of writes) {
        const at = docs.get(key(w.update?.name ?? w.delete!));
        if (w.currentDocument?.updateTime && at?.updateTime !== w.currentDocument.updateTime) return reply({ error: { status: "FAILED_PRECONDITION" } }, 400);
      }
      const time = tick();
      for (const w of writes) {
        if (w.delete) docs.delete(key(w.delete));
        else {
          const k = key(w.update!.name);
          const fields = w.updateMask ? { ...docs.get(k)?.fields, ...w.update!.fields } : w.update!.fields;
          docs.set(k, { fields, updateTime: time });
        }
      }
      return reply({ writeResults: writes.map(() => ({ updateTime: time })) });
    }
    if (url.pathname.endsWith(":runQuery")) {
      const collection = body.structuredQuery.from[0].collectionId;
      return reply([...docs.keys()].filter((k) => k.startsWith(`users/u/${collection}/`)).map((k) => ({ document: out(k) })));
    }
    if (path.split("/").length === 3) {
      return reply({ documents: [...docs.keys()].filter((k) => k.startsWith(`${path}/`)).map(out) });
    }
    return docs.has(path) ? reply(out(path)) : reply("{}", 404);
  };

  const collection = <T,>(name: string) =>
    [...docs.entries()]
      .filter(([k]) => k.startsWith(`users/u/${name}/`))
      .map(([, d]) => Object.fromEntries(Object.entries(d.fields).map(([k, v]) => [k, decode(v!)])) as T);
  return { fetcher, collection };
}

beforeAll(() => {
  process.env.MCP_SECRET = randomBytes(24).toString("hex");
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 8, 26, 12, 0) });
});
afterAll(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("parallel tool calls", () => {
  it("each land on the data the others saved, so the route never double-books", async () => {
    const base = createEmptyData({
      id: "u",
      name: "T",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      createdAt: new Date().toISOString(),
      preferredCarriage: "rain",
      autoTunnel: true,
      ...PROFILE_DEFAULTS,
    });
    const profile: Record<string, unknown> = { ...base.profile };
    delete profile.id;
    const window = { userId: "u", dayOfWeek: null, specificDate: serviceDate(new Date()), startTime: "13:00", endTime: "23:00", recurring: false, enabled: true, kind: "available" };
    const fs = fakeFirestore({ "users/u": profile, "users/u/windows/w": window });
    vi.stubGlobal("fetch", fs.fetcher);

    const token = seal({ typ: "access", rt: "r", uid: "u", exp: Math.floor(Date.now() / 1000) + 600 });
    const call = (title: string) =>
      handle(
        new Request("https://mcp.example/mcp", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: title,
            method: "tools/call",
            params: { name: "add_task", arguments: { title, deadline: serviceDate(new Date()), estimated_minutes: 40 } },
          }),
        }),
      ).then((r) => r.json());

    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => call(`task ${i}`)));
    for (const r of results) expect(r.result.isError).toBeUndefined();

    expect(fs.collection("tasks")).toHaveLength(8);
    const route = fs
      .collection<StudySession>("sessions")
      .filter((s) => s.status === "planned")
      .sort((a, b) => a.plannedStart.localeCompare(b.plannedStart));
    for (let i = 1; i < route.length; i++) expect(route[i].plannedStart >= route[i - 1].plannedEnd).toBe(true);
    expect(route.reduce((sum, s) => sum + s.workMinutes, 0)).toBe(8 * 40);
  });
});
