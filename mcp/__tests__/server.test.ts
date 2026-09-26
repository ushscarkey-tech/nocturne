import { createHash, randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { open, seal } from "../auth";
import { handle } from "../server";

const O = "https://mcp.example";
const CALLBACK = "https://claude.ai/api/mcp/auth_callback";
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  handle(new Request(`${O}${path}`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) }));

beforeAll(() => {
  process.env.MCP_SECRET = randomBytes(24).toString("hex");
});

describe("sealed tokens", () => {
  it("round-trip, and refuse the wrong type, tampering and expiry", () => {
    const t = seal({ typ: "access", rt: "r", uid: "u", exp: Math.floor(Date.now() / 1000) + 60 });
    expect(open(t, "access")).toMatchObject({ rt: "r", uid: "u" });
    expect(open(t, "refresh")).toBeNull();
    expect(open(t.slice(0, -2) + (t.endsWith("A") ? "BB" : "AA"), "access")).toBeNull();
    expect(open(seal({ typ: "access", exp: 1 }), "access")).toBeNull();
  });
});

describe("oauth", () => {
  it("asks for a token and points at its metadata", async () => {
    const r = await post("/mcp", { jsonrpc: "2.0", id: 1, method: "initialize" });
    expect(r.status).toBe(401);
    expect(r.headers.get("www-authenticate")).toContain(`${O}/.well-known/oauth-protected-resource`);
    const meta = await (await handle(new Request(`${O}/.well-known/oauth-authorization-server`))).json();
    expect(meta.code_challenge_methods_supported).toEqual(["S256"]);
  });

  it("only registers Claude's (or local) redirect addresses", async () => {
    expect((await post("/register", { redirect_uris: ["https://evil.example/cb"] })).status).toBe(400);
    expect((await post("/register", { redirect_uris: [CALLBACK] })).status).toBe(201);
  });

  it("sends the traveller to the app to approve, and only the app may answer", async () => {
    const { client_id } = await (await post("/register", { redirect_uris: [CALLBACK] })).json();
    const verifier = randomBytes(32).toString("base64url");
    const u = new URL(`${O}/authorize`);
    for (const [k, v] of Object.entries({
      response_type: "code",
      client_id,
      redirect_uri: CALLBACK,
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
      state: "s1",
    }))
      u.searchParams.set(k, v);
    const r = await handle(new Request(u));
    expect(r.status).toBe(302);
    const to = new URL(r.headers.get("location")!);
    expect(to.pathname).toBe("/nocturne/connect/");
    const req = to.searchParams.get("req")!;
    expect((await post("/authorize/complete", { req, refreshToken: "x" }, { Origin: "https://evil.example" })).status).toBe(403);
    const denied = await (await post("/authorize/complete", { req, deny: true }, { Origin: "https://ushscarkey-tech.github.io" })).json();
    expect(new URL(denied.redirect).searchParams.get("error")).toBe("access_denied");
    expect(new URL(denied.redirect).searchParams.get("state")).toBe("s1");
  });

  it("won't redirect to an address the client didn't register", async () => {
    const { client_id } = await (await post("/register", { redirect_uris: [CALLBACK] })).json();
    const r = await handle(new Request(`${O}/authorize?response_type=code&client_id=${client_id}&redirect_uri=${encodeURIComponent("https://claude.ai/other")}&code_challenge=x`));
    expect(r.status).toBe(400);
  });

  it("checks PKCE when trading a code", async () => {
    const code = seal({ typ: "code", rt: "r", uid: "u", cc: "expected", r: CALLBACK, c: "c", exp: Math.floor(Date.now() / 1000) + 60 });
    const r = await handle(
      new Request(`${O}/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "authorization_code", code, code_verifier: "wrong", redirect_uri: CALLBACK }),
      }),
    );
    expect(r.status).toBe(400);
    expect((await r.json()).error).toBe("invalid_grant");
  });
});

describe("mcp", () => {
  const auth = () => ({ Authorization: `Bearer ${seal({ typ: "access", rt: "r", uid: "u", exp: Math.floor(Date.now() / 1000) + 60 })}` });

  it("initializes and lists the tools", async () => {
    const init = await (await post("/mcp", { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } }, auth())).json();
    expect(init.result.protocolVersion).toBe("2025-06-18");
    expect(init.result.capabilities.tools).toBeTruthy();
    expect((await post("/mcp", { jsonrpc: "2.0", method: "notifications/initialized" }, auth())).status).toBe(202);
    const list = await (await post("/mcp", { jsonrpc: "2.0", id: 2, method: "tools/list" }, auth())).json();
    const names = list.result.tools.map((t: { name: string }) => t.name);
    expect(names).toEqual(expect.arrayContaining(["get_tonight", "list_tasks", "quick_add", "add_task", "complete_task", "arrival_forecast"]));
    for (const t of list.result.tools) expect(t.inputSchema.type).toBe("object");
  });

  it("answers unknown methods with a JSON-RPC error", async () => {
    const r = await (await post("/mcp", { jsonrpc: "2.0", id: 3, method: "nope" }, auth())).json();
    expect(r.error.code).toBe(-32601);
  });
});
