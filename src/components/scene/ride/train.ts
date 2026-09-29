/**
 * How the train moves, tied to the focus timer. A station leg of T seconds
 * covers a fixed distance: pull away, run at line speed, brake into the
 * next platform exactly as the timer ends. The train you see chases that
 * timetable smoothly: pausing brakes to a stop, resuming pulls away again
 * and quietly makes up the lost ground, and nothing ever jumps.
 * Pure: no three.js, no DOM.
 */

export const CRUISE = 16; // m/s, an old express between towns
export const ACCEL = 0.55; // m/s², pulling away
export const BRAKE = 0.9; // m/s², service braking

/** Where the timetable puts the train after `e` seconds of a leg lasting `T` seconds, and how long the leg is. */
export function timetable(e: number, T: number) {
  const ta = CRUISE / ACCEL;
  const tb = CRUISE / BRAKE;
  // Short legs never reach line speed: scale the peak so accelerating and braking meet.
  const vPeak = T >= ta + tb ? CRUISE : (T * ACCEL * BRAKE) / (ACCEL + BRAKE);
  const t1 = vPeak / ACCEL;
  const t2 = Math.max(t1, T - vPeak / BRAKE);
  const length = 0.5 * ACCEL * t1 * t1 + vPeak * (t2 - t1) + 0.5 * BRAKE * (T - t2) ** 2;
  const x = Math.max(0, Math.min(T, e));
  let s: number;
  let v: number;
  if (x < t1) {
    s = 0.5 * ACCEL * x * x;
    v = ACCEL * x;
  } else if (x < t2) {
    s = 0.5 * ACCEL * t1 * t1 + vPeak * (x - t1);
    v = vPeak;
  } else {
    const r = T - x;
    s = length - 0.5 * BRAKE * r * r;
    v = BRAKE * r;
  }
  return { s, v, length };
}

export interface Leg {
  /** Identifies the station leg (a new key starts a new leg from where the train stands). */
  key: string;
  /** Planned length of the leg in seconds (grows when time is added). */
  total: number;
  /** Seconds of the leg already ridden, at this moment. */
  elapsed: () => number;
  /** The timer is paused. */
  paused: boolean;
}

export interface TrainState {
  /** Distance along the line, metres. */
  s: number;
  /** Speed, m/s. */
  v: number;
  /** Where the current leg started and where its platform is. */
  legStart: number;
  legEnd: number;
  legKey: string;
  /** Standing at a platform (the leg's end, or a stop called early). */
  stopAt: number | null;
  /** Nothing ridden yet since the scene appeared: the first leg is joined where the timer already is. */
  fresh: boolean;
}

export function trainState(): TrainState {
  return { s: 0, v: 0, legStart: 0, legEnd: Infinity, legKey: "", stopAt: 0, fresh: true };
}

/**
 * Advance the train by dt seconds.
 * - `leg`: the station being ridden, or null when standing at a platform.
 * - `stopNow`: the ride ended early (finish early, end of night): brake to a platform just ahead.
 * Returns the new state (mutated in place, also returned for convenience).
 */
export function stepTrain(st: TrainState, dt: number, leg: Leg | null, stopNow: boolean): TrainState {
  if (dt <= 0) return st;
  if (leg && !stopNow) {
    const plan = timetable(leg.elapsed(), leg.total);
    if (leg.key !== st.legKey) {
      st.legKey = leg.key;
      st.stopAt = null;
      if (st.fresh) {
        // Opened mid-ride (a reload, coming back to the page): already under way, where the timer says.
        st.legStart = st.s - plan.s;
        st.v = leg.paused ? 0 : plan.v;
      } else {
        // A new leg starts from wherever the train is standing.
        st.legStart = st.s;
      }
    }
    st.fresh = false;
    st.legEnd = st.legStart + plan.length;
    const target = st.legStart + plan.s;
    let goal: number;
    if (leg.paused) goal = 0;
    else {
      // Follow the timetable, making up (or giving back) ground gently: at most 25 % off line speed.
      const err = target - st.s;
      goal = Math.max(0, Math.min(plan.v + err * 0.04, Math.max(plan.v, 2) * 1.25));
      if (plan.v === 0 && err <= 0.05) goal = 0;
    }
    // Never overrun the platform: the braking curve to it caps the speed.
    const left = st.legEnd - st.s;
    goal = Math.min(goal, Math.sqrt(2 * BRAKE * Math.max(0, left)));
    st.v = approach(st.v, goal, dt);
    st.s = Math.min(st.s + st.v * dt, st.legEnd);
    if (st.s >= st.legEnd - 0.02 && st.v < 0.3) {
      st.v = 0;
      st.stopAt = st.legEnd;
    }
    return st;
  }
  // No leg (or stop called): brake to a platform.
  st.fresh = false;
  if (st.stopAt === null) {
    // Stop ahead at a comfortable braking distance; if a leg was nearly done, its own platform.
    const brakeDist = (st.v * st.v) / (2 * BRAKE);
    const natural = Number.isFinite(st.legEnd) && st.legEnd - st.s >= brakeDist - 1 && st.legEnd - st.s < brakeDist + 400 ? st.legEnd : st.s + brakeDist;
    st.stopAt = st.v < 0.05 ? st.s : natural;
  }
  const left = Math.max(0, st.stopAt - st.s);
  const goal = Math.sqrt(2 * BRAKE * left);
  st.v = Math.min(approach(st.v, goal, dt), goal);
  st.s = Math.min(st.s + st.v * dt, st.stopAt);
  if (left < 0.02) st.v = 0;
  // Leaving this stop starts a fresh leg.
  st.legKey = "";
  return st;
}

function approach(v: number, goal: number, dt: number) {
  return goal > v ? Math.min(goal, v + ACCEL * dt) : Math.max(goal, v - BRAKE * dt);
}
