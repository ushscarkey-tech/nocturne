/**
 * Nocturne's remote MCP server: a stateless Streamable HTTP endpoint at
 * /mcp (JSON responses, no server-sent stream), guarded by OAuth, plus the
 * OAuth endpoints Claude's connector discovers from /.well-known.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { AuthError, authorize, authorizeComplete, authorizeInfo, authorizationServer, bearer, idTokenFor, preflight, protectedResource, register, token } from "./auth";
import { ConflictError, Firestore } from "./firestore";
import { Ctx, TOOLS, ToolError } from "./tools";

const SERVER = { name: "nocturne", title: "Nocturne", version: "1.0.0" };
const PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"];

const INSTRUCTIONS = `Nocturne is the traveller's evening study planner, told as a night train.
Tonight's study plan is a route of stations; each station is one block of one task. Service Time is when they can study.
Use get_tonight for tonight's plan, list_tasks for tasks, quick_add or add_task to add work (a deadline and an estimate let it be planned),
update_task / complete_task / log_progress to change things, and arrival_forecast to answer "will I finish everything in time?".
If something won't fit, never stop at "it can't be done": arrival_forecast includes a rescue_plan (shorter Station Stops, extra study time on specific days and hours,
trimming less important tasks, moving the least urgent deadlines back). Explain it concretely and offer to apply it with apply_rescue_plan.
Changes re-plan the route immediately, exactly as in the app. Answer in the traveller's language.`;

type RpcId = string | number | null;
interface Rpc {
  jsonrpc: "2.0";
  id?: RpcId;
  method: string;
  params?: Record<string, unknown>;
}

const ok = (id: RpcId, result: unknown) => ({ jsonrpc: "2.0", id, result });
const fail = (id: RpcId, code: number, message: string) => ({ jsonrpc: "2.0", id, error: { code, message } });

function unauthorized(origin: string, message = "Sign in to Nocturne to use this connector.") {
  return new Response(JSON.stringify({ error: "invalid_token", error_description: message }), {
    status: 401,
    headers: {
      "Content-Type": "application/json",
      "WWW-Authenticate": `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource", error="invalid_token"`,
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Expose-Headers": "WWW-Authenticate",
    },
  });
}

/** Run a tool again on freshly loaded data when a parallel call saved first. */
export async function withRetry<T>(run: (attempt: number) => Promise<T>, attempts = 6): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await run(attempt);
    } catch (e) {
      if (!(e instanceof ConflictError) || attempt + 1 >= attempts) throw e;
      await new Promise((r) => setTimeout(r, 60 + Math.random() * 240 * (attempt + 1)));
    }
  }
}

async function handleRpc(msg: Rpc, ctx: (fresh?: boolean) => Promise<Ctx>): Promise<object | null> {
  const id = msg.id ?? null;
  const isNote = msg.id === undefined;
  try {
    switch (msg.method) {
      case "initialize": {
        const asked = String(msg.params?.protocolVersion ?? "");
        return ok(id, {
          protocolVersion: PROTOCOLS.includes(asked) ? asked : PROTOCOLS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER,
          instructions: INSTRUCTIONS,
        });
      }
      case "ping":
        return ok(id, {});
      case "tools/list":
        return ok(id, {
          tools: TOOLS.map(({ name, title, description, inputSchema, annotations }) => ({ name, title, description, inputSchema, ...(annotations ? { annotations } : {}) })),
        });
      case "tools/call": {
        const name = String(msg.params?.name ?? "");
        const tool = TOOLS.find((t) => t.name === name);
        if (!tool) return fail(id, -32602, `Unknown tool: ${name}`);
        try {
          const args = (msg.params?.arguments as Record<string, unknown>) ?? {};
          const result = await withRetry(async (attempt) => tool.run(await ctx(attempt > 0), args));
          return ok(id, { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], structuredContent: result });
        } catch (e) {
          if (e instanceof AuthError) throw e;
          const text = e instanceof ToolError ? e.message : `Nocturne couldn't do that: ${e instanceof Error ? e.message : String(e)}`;
          if (!(e instanceof ToolError)) console.error("[nocturne-mcp] tool failed", name, e);
          return ok(id, { content: [{ type: "text", text }], isError: true });
        }
      }
      default:
        if (isNote) return null; // notifications/initialized, cancelled, …
        return fail(id, -32601, `Method not found: ${msg.method}`);
    }
  } catch (e) {
    if (e instanceof AuthError) throw e;
    return fail(id, -32603, e instanceof Error ? e.message : "Internal error");
  }
}

async function mcp(req: Request, origin: string): Promise<Response> {
  if (req.method === "GET") return new Response("This endpoint speaks MCP over POST.", { status: 405, headers: { Allow: "POST" } });
  if (req.method === "DELETE") return new Response(null, { status: 204 });
  if (req.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });
  const who = bearer(req);
  if (!who) return unauthorized(origin);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json(fail(null, -32700, "Parse error"), { status: 400 });
  }
  let context: Ctx | null = null;
  let signedIn: { token: string; uid: string } | null = null;
  const ctx = async (fresh = false) => {
    signedIn ??= await idTokenFor(who.rt);
    if (!context || fresh) context = new Ctx(new Firestore(signedIn.uid, signedIn.token));
    return context;
  };
  try {
    const batch = Array.isArray(body);
    const msgs = (batch ? body : [body]) as Rpc[];
    const out: object[] = [];
    for (const m of msgs) {
      const r = await handleRpc(m, ctx);
      if (r) out.push(r);
    }
    if (out.length === 0) return new Response(null, { status: 202 });
    return Response.json(batch ? out : out[0], { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof AuthError) return unauthorized(origin, e.message);
    throw e;
  }
}

function home(origin: string) {
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Nocturne MCP</title>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#070a10;color:#e9e1cf;font:15px/1.7 system-ui,sans-serif">
<main style="max-width:30rem;padding:2rem"><p style="letter-spacing:.35em;font-size:11px;color:#8f8a7c">NOCTURNE</p>
<h1 style="font-weight:400">Claude 연결</h1>
<p style="color:#a9a394">Claude 설정 → 커넥터 → 사용자 지정 커넥터 추가에 아래 주소를 넣으세요.<br>In Claude, Settings → Connectors → Add custom connector, and use:</p>
<p><code style="background:#141a22;padding:.4rem .6rem;border-radius:6px">${origin}/mcp</code></p></main>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

/** The whole server as a fetch handler. */
export async function handle(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const origin = url.origin;
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const from = req.headers.get("origin");
  try {
    if (req.method === "OPTIONS") return preflight(from, path);
    if (path === "/mcp") return await mcp(req, origin);
    if (path.startsWith("/.well-known/oauth-protected-resource")) return protectedResource(origin);
    if (path.startsWith("/.well-known/oauth-authorization-server") || path.startsWith("/.well-known/openid-configuration")) return authorizationServer(origin);
    if (path === "/register" && req.method === "POST") return await register(req);
    if (path === "/authorize" && req.method === "GET") return authorize(url);
    if (path === "/authorize/info" && req.method === "GET") return authorizeInfo(url, from);
    if (path === "/authorize/complete" && req.method === "POST") return await authorizeComplete(req, from);
    if (path === "/token" && req.method === "POST") return await token(req);
    if (path === "/") return home(origin);
    return new Response("Not found", { status: 404 });
  } catch (e) {
    console.error("[nocturne-mcp]", e);
    return Response.json({ error: "server_error", error_description: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

/** Node adapter: Vercel's Node runtime hands us (req, res). */
export default async function node(req: IncomingMessage, res: ServerResponse) {
  const proto = (req.headers["x-forwarded-proto"] as string) || "https";
  const host = (req.headers["x-forwarded-host"] as string) || req.headers.host || "localhost";
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(", ") : v);
  const request = new Request(`${proto}://${host}${req.url}`, {
    method: req.method,
    headers,
    body: body && req.method !== "GET" && req.method !== "HEAD" ? body : undefined,
  });
  const response = await handle(request);
  res.statusCode = response.status;
  response.headers.forEach((v, k) => res.setHeader(k, v));
  res.end(Buffer.from(await response.arrayBuffer()));
}
