import type { MetadataRoute } from "next";

export const dynamic = "force-static";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** Installed, Nocturne opens full screen like any other app on the phone. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: `${BASE}/`,
    name: "Nocturne",
    short_name: "Nocturne",
    description: "A planner that doesn't break when your plan does.",
    start_url: `${BASE}/`,
    scope: `${BASE}/`,
    display: "standalone",
    background_color: "#04060a",
    theme_color: "#070a10",
    icons: [
      { src: `${BASE}/icons/icon-192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: `${BASE}/icons/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: `${BASE}/icons/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: `${BASE}/icons/icon.svg`, sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
