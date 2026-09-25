import type { SVGProps } from "react";

export type IconName =
  | "moon"
  | "list"
  | "line"
  | "ticket"
  | "lock"
  | "unlock"
  | "plus"
  | "close"
  | "chevron"
  | "back"
  | "grip"
  | "clock"
  | "play"
  | "pause"
  | "skip"
  | "sound"
  | "settings"
  | "check"
  | "spark"
  | "dots"
  | "arrow";

const PATHS: Record<IconName, string> = {
  moon: "M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z",
  list: "M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01",
  line: "M6 3v18M6 7h.01M6 12h.01M6 17h.01M10 7h8M10 12h6M10 17h8",
  ticket: "M4 7a2 2 0 0 0 2-2h12a2 2 0 0 0 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 0-2 2H6a2 2 0 0 0-2-2v-3a2 2 0 0 0 0-4Z M13 5v14",
  lock: "M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3",
  unlock: "M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 6.7-1.4",
  plus: "M12 5v14M5 12h14",
  close: "M6 6l12 12M18 6 6 18",
  chevron: "m9 6 6 6-6 6",
  back: "m15 6-6 6 6 6",
  grip: "M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01",
  clock: "M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  play: "M8 5.5v13l10-6.5z",
  pause: "M8 5v14M16 5v14",
  skip: "M6 12h12M13 7l5 5-5 5",
  sound: "M4 10v4h3l5 4V6L7 10H4Zm12-1.5a4.5 4.5 0 0 1 0 7M18.5 6a8 8 0 0 1 0 12",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2.1-1.2L14 3h-4l-.5 2.7a7 7 0 0 0-2.1 1.2l-2.3-1-2 3.4 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2.1 1.2L10 21h4l.5-2.7a7 7 0 0 0 2.1-1.2l2.3 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2Z",
  check: "m5 12.5 4.5 4.5L19 7.5",
  spark: "M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6",
  dots: "M5 12h.01M12 12h.01M19 12h.01",
  arrow: "M5 12h14M13 6l6 6-6 6",
};

export function Icon({ name, size = 18, ...rest }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
