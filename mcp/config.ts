/**
 * Server settings. The Firebase web config is public (it ships in the app
 * page); MCP_SECRET is the one secret and must be set on the host.
 */
export const FIREBASE = {
  apiKey: process.env.FIREBASE_API_KEY || "AIzaSyDj2FLqTTl86djgucEqfaUaGW3cAx9oZvU",
  projectId: process.env.FIREBASE_PROJECT_ID || "nocturne-7cb72",
};

/** The Nocturne app, where travellers approve a connection. */
export const APP_URL = (process.env.APP_URL || "https://ushscarkey-tech.github.io/nocturne").replace(/\/$/, "");
export const APP_ORIGIN = new URL(APP_URL).origin;

export function secret(): string {
  const s = process.env.MCP_SECRET;
  if (!s || s.length < 24) throw new Error("MCP_SECRET is not set (use a random string of at least 24 characters).");
  return s;
}

/** Where OAuth may send people back to: Claude on the web, and local clients. */
export function allowedRedirect(uri: string): boolean {
  try {
    const u = new URL(uri);
    if (u.protocol === "https:" && ["claude.ai", "claude.com", "www.claude.ai"].includes(u.hostname)) return true;
    if (u.protocol === "http:" && ["localhost", "127.0.0.1"].includes(u.hostname)) return true;
    return false;
  } catch {
    return false;
  }
}

export const ACCESS_SECONDS = 3600;
