// Bundle the MCP server into Vercel's Build Output API (v3): one Node
// function that answers every path. Run by Vercel as the build command
// (see vercel.json); the Next.js app itself is deployed to GitHub Pages.
import { build } from "esbuild";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(root, ".vercel/output");
const fn = resolve(out, "functions/mcp.func");

await rm(out, { recursive: true, force: true });
await mkdir(fn, { recursive: true });

await build({
  entryPoints: [resolve(root, "mcp/server.ts")],
  outfile: resolve(fn, "index.mjs"),
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  alias: { "@": resolve(root, "src") },
  logLevel: "info",
});

await writeFile(
  resolve(fn, ".vc-config.json"),
  JSON.stringify({ runtime: "nodejs22.x", handler: "index.mjs", launcherType: "Nodejs", shouldAddHelpers: false, maxDuration: 30 }, null, 2),
);
await writeFile(resolve(out, "config.json"), JSON.stringify({ version: 3, routes: [{ src: "/(.*)", dest: "/mcp" }] }, null, 2));
console.log("MCP server built into .vercel/output");
