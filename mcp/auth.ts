/**
 * OAuth 2.1 for Claude's connector, without a database.
 *
 * Every artifact (client id, pending request, code, access and refresh
 * tokens) is sealed with AES-256-GCM under MCP_SECRET, so the server stays
 * stateless. What they carry is the traveller's Firebase refresh token: the
 * server trades it for a short-lived ID token and talks to Firestore as
 * them, so the security rules still decide what it can touch.
 *
 * Consent happens in the Nocturne app (/connect), where the traveller is
 * already signed in: /authorize sends them there, the app posts back to
 * /authorize/complete, and they return to Claude with a code.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { ACCESS_SECONDS, APP_ORIGIN, APP_URL, FIREBASE, allowedRedirect, secret } from "./config";

type Sealed = Record<string, unknown> & { typ: string; exp?: number };

const key = () => createHash("sha256").update(`nocturne-mcp:${secret()}`).digest();
const b64u = (b: Buffer) => b.toString("base64url");

export function seal(payload: Sealed): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([c.update(JSON.stringify(payload), "utf8"), c.final()]);
  return b64u(Buffer.concat([iv, body, c.getAuthTag()]));
}

export function open<T extends Sealed>(token: string, typ: string): T | null {
  try {
    const raw = Buffer.from(token, "base64url");
    if (raw.length < 29) return null;
    const d = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(raw.length - 16));
    const json = Buffer.concat([d.update(raw.subarray(12, raw.length - 16)), d.final()]).toString("utf8");
    const p = JSON.parse(json) as T;
    if (p.typ !== typ) return null;
    if (p.exp && p.exp < Date.now() / 1000) return null;
    return p;
  } catch {
    return null;
  }
}

const now = () => Math.floor(Date.now() / 1000);

// ------------------------------------------------------------- Firebase tokens

const idTokens = new Map<string, { token: string; uid: string; until: number }>();

/** Trade a refresh token for an ID token (cached while this instance is warm). */
export async function idTokenFor(refreshToken: string): Promise<{ token: string; uid: string }> {
  const hit = idTokens.get(refreshToken);
  if (hit && hit.until > Date.now() + 60_000) return hit;
  const res = await fetch(`https://securetoken.googleapis.com/v1/token?key=${FIREBASE.apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
  });
  if (!res.ok) throw new AuthError("The Nocturne sign-in behind this connection has ended. Connect again.");
  const j = (await res.json()) as { id_token: string; user_id: string; expires_in: string };
  const entry = { token: j.id_token, uid: j.user_id, until: Date.now() + Number(j.expires_in) * 1000 };
  idTokens.set(refreshToken, entry);
  return entry;
}

export class AuthError extends Error {}

// ------------------------------------------------------------------ helpers

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers } });

const cors = (origin: string | null, allow: string | "*") => ({
  "Access-Control-Allow-Origin": allow === "*" ? "*" : origin === allow ? allow : "null",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, MCP-Protocol-Version",
  Vary: "Origin",
});

const s256 = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");

function page(title: string, text: string, status = 400) {
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#070a10;color:#e9e1cf;font:15px/1.6 system-ui,sans-serif">
<main style="max-width:26rem;padding:2rem"><p style="letter-spacing:.35em;font-size:11px;color:#8f8a7c">NOCTURNE</p><h1 style="font-weight:400">${title}</h1><p style="color:#a9a394">${text}</p></main>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

// ----------------------------------------------------------------- metadata

export function protectedResource(origin: string) {
  return json(
    { resource: `${origin}/mcp`, authorization_servers: [origin], bearer_methods_supported: ["header"], resource_name: "Nocturne" },
    200,
    cors(null, "*"),
  );
}

export function authorizationServer(origin: string) {
  return json(
    {
      issuer: origin,
      authorization_endpoint: `${origin}/authorize`,
      token_endpoint: `${origin}/token`,
      registration_endpoint: `${origin}/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      scopes_supported: ["nocturne"],
    },
    200,
    cors(null, "*"),
  );
}

// ------------------------------------------------------------- registration

export async function register(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { redirect_uris?: string[]; client_name?: string };
  const uris = Array.isArray(body.redirect_uris) ? body.redirect_uris : [];
  if (uris.length === 0 || !uris.every(allowedRedirect)) {
    return json({ error: "invalid_redirect_uri", error_description: "Only Claude's redirect addresses are accepted." }, 400, cors(null, "*"));
  }
  const name = String(body.client_name ?? "Claude").slice(0, 60);
  const client_id = seal({ typ: "client", r: uris, n: name });
  return json(
    {
      client_id,
      client_name: name,
      redirect_uris: uris,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      client_id_issued_at: now(),
    },
    201,
    cors(null, "*"),
  );
}

// ---------------------------------------------------------------- authorize

export function authorize(url: URL) {
  const q = url.searchParams;
  const client = open<{ typ: "client"; r: string[]; n: string }>(q.get("client_id") ?? "", "client");
  const redirect = q.get("redirect_uri") ?? "";
  if (!client || !client.r.includes(redirect) || !allowedRedirect(redirect)) {
    return page("연결할 수 없어요", "이 연결 요청을 확인할 수 없어요. Claude에서 다시 연결해 주세요. / This connection request can't be verified. Connect again from Claude.");
  }
  const back = (error: string) => {
    const u = new URL(redirect);
    u.searchParams.set("error", error);
    if (q.get("state")) u.searchParams.set("state", q.get("state")!);
    return Response.redirect(u.toString(), 302);
  };
  if (q.get("response_type") !== "code") return back("unsupported_response_type");
  const challenge = q.get("code_challenge") ?? "";
  if (!challenge || (q.get("code_challenge_method") ?? "S256") !== "S256") return back("invalid_request");
  const request = seal({ typ: "req", c: q.get("client_id")!, n: client.n, r: redirect, s: q.get("state") ?? "", cc: challenge, exp: now() + 900 });
  return Response.redirect(`${APP_URL}/connect/?req=${encodeURIComponent(request)}`, 302);
}

type PendingRequest = { typ: "req"; c: string; n: string; r: string; s: string; cc: string; exp: number };

/** What the app shows before the traveller approves. */
export function authorizeInfo(url: URL, origin: string | null) {
  const r = open<PendingRequest>(url.searchParams.get("req") ?? "", "req");
  if (!r) return json({ error: "expired" }, 400, cors(origin, APP_ORIGIN));
  return json({ client: r.n, host: new URL(r.r).host }, 200, cors(origin, APP_ORIGIN));
}

/** The app posts the traveller's decision (and, if approved, their refresh token). */
export async function authorizeComplete(req: Request, origin: string | null) {
  const headers = cors(origin, APP_ORIGIN);
  if (origin !== APP_ORIGIN) return json({ error: "forbidden" }, 403, headers);
  const body = (await req.json().catch(() => ({}))) as { req?: string; refreshToken?: string; deny?: boolean };
  const r = open<PendingRequest>(body.req ?? "", "req");
  if (!r) return json({ error: "expired" }, 400, headers);
  const target = new URL(r.r);
  if (r.s) target.searchParams.set("state", r.s);
  if (body.deny || !body.refreshToken) {
    target.searchParams.set("error", "access_denied");
    return json({ redirect: target.toString() }, 200, headers);
  }
  let uid: string;
  try {
    uid = (await idTokenFor(body.refreshToken)).uid;
  } catch {
    return json({ error: "signin" }, 401, headers);
  }
  const code = seal({ typ: "code", rt: body.refreshToken, uid, cc: r.cc, r: r.r, c: r.c, exp: now() + 300 });
  target.searchParams.set("code", code);
  return json({ redirect: target.toString() }, 200, headers);
}

// -------------------------------------------------------------------- token

async function form(req: Request): Promise<Record<string, string>> {
  const type = req.headers.get("content-type") ?? "";
  if (type.includes("application/json")) return (await req.json().catch(() => ({}))) as Record<string, string>;
  return Object.fromEntries(new URLSearchParams(await req.text()));
}

function issue(rt: string, uid: string, refresh?: string) {
  return json(
    {
      access_token: seal({ typ: "access", rt, uid, exp: now() + ACCESS_SECONDS }),
      token_type: "Bearer",
      expires_in: ACCESS_SECONDS,
      refresh_token: refresh ?? seal({ typ: "refresh", rt, uid }),
      scope: "nocturne",
    },
    200,
    cors(null, "*"),
  );
}

export async function token(req: Request) {
  const f = await form(req);
  const bad = (error: string, description?: string) => json({ error, error_description: description }, 400, cors(null, "*"));
  if (f.grant_type === "authorization_code") {
    const code = open<{ typ: "code"; rt: string; uid: string; cc: string; r: string; c: string }>(f.code ?? "", "code");
    if (!code) return bad("invalid_grant", "The code is invalid or has expired.");
    if (f.redirect_uri && f.redirect_uri !== code.r) return bad("invalid_grant", "redirect_uri does not match.");
    if (f.client_id && f.client_id !== code.c) return bad("invalid_grant", "client_id does not match.");
    if (!f.code_verifier || s256(f.code_verifier) !== code.cc) return bad("invalid_grant", "PKCE verification failed.");
    return issue(code.rt, code.uid);
  }
  if (f.grant_type === "refresh_token") {
    const r = open<{ typ: "refresh"; rt: string; uid: string }>(f.refresh_token ?? "", "refresh");
    if (!r) return bad("invalid_grant", "The refresh token is invalid.");
    try {
      await idTokenFor(r.rt);
    } catch {
      return bad("invalid_grant", "The Nocturne sign-in behind this connection has ended.");
    }
    return issue(r.rt, r.uid, f.refresh_token);
  }
  return bad("unsupported_grant_type");
}

/** The bearer token on an MCP request → the traveller it stands for. */
export function bearer(req: Request): { rt: string; uid: string } | null {
  const h = req.headers.get("authorization") ?? "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  return open<{ typ: "access"; rt: string; uid: string }>(m[1].trim(), "access");
}

export function preflight(origin: string | null, path: string) {
  const allow = path.startsWith("/authorize") ? APP_ORIGIN : "*";
  return new Response(null, { status: 204, headers: cors(origin, allow) });
}
