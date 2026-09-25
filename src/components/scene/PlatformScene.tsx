"use client";

import dynamic from "next/dynamic";
import type { PlatformSceneProps } from "./PlatformScene3D";

// three.js is only fetched in the browser, when a scene is actually shown.
const Scene3D = dynamic(() => import("./PlatformScene3D"), { ssr: false, loading: () => null });

/**
 * The 3D platform with a quiet gradient underneath (what you see while it
 * loads, or if WebGL is unavailable) and a fade into the page below.
 */
export function PlatformScene({ className = "", fade = true, ...props }: PlatformSceneProps & { fade?: boolean }) {
  return (
    <div className={`pointer-events-none overflow-hidden ${className}`} aria-hidden>
      <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_60%_30%,#141c1c_0%,#070a10_70%)]" />
      <Scene3D {...props} className="absolute inset-0 animate-[fade_2400ms_ease-out_both]" />
      {fade && <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-b from-transparent via-night-900/70 to-night-900" />}
    </div>
  );
}
