# Nocturne MCP server

A remote MCP server so Claude (claude.ai, the apps, Claude Code) can read
and change a traveller's Nocturne: tonight's route, tasks, the arrival
forecast, recent nights.

- **Stateless.** One Node function (`server.ts`) on Vercel. No database.
- **OAuth 2.1** with dynamic client registration and PKCE. Consent happens
  in the Nocturne app (`/connect`), where the traveller is already signed
  in. Codes and tokens are sealed with AES-256-GCM under `MCP_SECRET` and
  carry the traveller's Firebase session, so Firestore's security rules
  still decide what the server can touch.
- **Same planning as the app.** Tools call `src/core` (`ops.ts`, the
  planner, Quick Add), then write only what changed through Firestore's
  REST API.

## Tools

`get_tonight`, `list_tasks`, `add_task`, `quick_add`, `update_task`,
`complete_task`, `log_progress`, `arrival_forecast`, `recent_nights`.

## Deploy (once)

1. On vercel.com, **Add New… → Project**, import this repository and
   deploy. `vercel.json` sets everything else (`node mcp/build.mjs` builds
   the function into `.vercel/output`).
2. In the project's **Settings → Environment Variables**, add
   `MCP_SECRET`: a random string of at least 24 characters. Redeploy.
3. Put the deployment's address (e.g. `https://nocturne-mcp.vercel.app`) in
   the app as `NEXT_PUBLIC_MCP_URL` (the Pages workflow reads it), so the
   app knows which server may receive a traveller's approval.

Optional: `APP_URL` (default: the GitHub Pages app), `FIREBASE_API_KEY`,
`FIREBASE_PROJECT_ID`.

## Connect Claude

Claude → Settings → Connectors → **Add custom connector** →
`https://<deployment>/mcp`. Claude sends you to Nocturne to approve.

## Develop

`npx vitest run mcp` covers the OAuth checks and the MCP handshake.
`node mcp/build.mjs` builds the function locally.
