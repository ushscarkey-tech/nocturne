/**
 * Tiny tactile cues where the device supports them. Always optional and
 * always short: a press, a tick of the printer, the ticket settling.
 */
const PATTERNS = {
  press: [8],
  tick: [4],
  settle: [12, 40, 8],
  door: [10, 60, 14],
} as const;

export type HapticKind = keyof typeof PATTERNS;

export function haptic(kind: HapticKind) {
  if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
  try {
    navigator.vibrate?.([...PATTERNS[kind]]);
  } catch {
    /* not allowed here */
  }
}
