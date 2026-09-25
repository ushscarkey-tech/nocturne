import type { NextConfig } from "next";

// Set NEXT_PUBLIC_BASE_PATH (e.g. "/nocturne") when hosting under a sub-path such as GitHub Pages.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || undefined;

const nextConfig: NextConfig = {
  // Nocturne is fully client-side, so it ships as static files.
  output: "export",
  trailingSlash: true,
  basePath,
  images: { unoptimized: true },
};

export default nextConfig;
