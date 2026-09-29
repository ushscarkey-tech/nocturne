/** Whether this browser has seen the intro deck (newcomers are sent to it first). */
const KEY = "nocturne:intro-seen";

export function introSeen(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return true;
  }
}

export function markIntroSeen() {
  try {
    window.localStorage.setItem(KEY, "1");
  } catch {
    /* storage unavailable */
  }
}
