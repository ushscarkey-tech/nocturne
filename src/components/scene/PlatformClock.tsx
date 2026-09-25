"use client";

/** A small station clock: white face gone slightly yellow, thin black hands. */
export function PlatformClock({ now, size = 30, className = "" }: { now: Date; size?: number; className?: string }) {
  const m = now.getMinutes() + now.getSeconds() / 60;
  const h = (now.getHours() % 12) + m / 60;
  const hand = (deg: number, len: number, w: number) => (
    <line
      x1="20"
      y1="20"
      x2={20 + len * Math.sin((deg * Math.PI) / 180)}
      y2={20 - len * Math.cos((deg * Math.PI) / 180)}
      stroke="#1b1f22"
      strokeWidth={w}
      strokeLinecap="round"
    />
  );
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className={className} aria-hidden>
      <circle cx="20" cy="20" r="19" fill="#2a3036" />
      <circle cx="20" cy="20" r="17" fill="#e6dfcc" />
      <circle cx="20" cy="20" r="17" fill="url(#pc-shade)" />
      <defs>
        <radialGradient id="pc-shade" cx="0.35" cy="0.3" r="0.9">
          <stop offset="0.6" stopColor="rgba(0,0,0,0)" />
          <stop offset="1" stopColor="rgba(60,48,30,0.35)" />
        </radialGradient>
      </defs>
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i * 30 * Math.PI) / 180;
        const r1 = i % 3 === 0 ? 12.5 : 14;
        return (
          <line
            key={i}
            x1={20 + r1 * Math.sin(a)}
            y1={20 - r1 * Math.cos(a)}
            x2={20 + 15.5 * Math.sin(a)}
            y2={20 - 15.5 * Math.cos(a)}
            stroke="#2b2f31"
            strokeWidth={i % 3 === 0 ? 1.4 : 0.8}
          />
        );
      })}
      {hand(h * 30, 8.5, 1.8)}
      {hand(m * 6, 12.5, 1.2)}
      <circle cx="20" cy="20" r="1.1" fill="#1b1f22" />
    </svg>
  );
}
