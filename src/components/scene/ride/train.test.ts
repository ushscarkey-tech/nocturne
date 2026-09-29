import { describe, expect, it } from "vitest";
import { BRAKE, CRUISE, stepTrain, timetable, trainState, type Leg } from "./train";

const DT = 1 / 30;
const STEP_MAX = (CRUISE * 1.3) / 30;

describe("timetable", () => {
  it("starts and ends at rest and runs at line speed in between", () => {
    const T = 50 * 60;
    expect(timetable(0, T).v).toBe(0);
    expect(timetable(T, T).v).toBeCloseTo(0, 6);
    expect(timetable(T / 2, T).v).toBe(CRUISE);
    // Progress is nearly linear in time (elapsed / total).
    const { s, length } = timetable(T / 2, T);
    expect(s / length).toBeGreaterThan(0.49);
    expect(s / length).toBeLessThan(0.51);
  });
  it("longer rides go further", () => {
    expect(timetable(0, 90 * 60).length).toBeGreaterThan(timetable(0, 50 * 60).length);
    expect(timetable(0, 50 * 60).length).toBeGreaterThan(timetable(0, 25 * 60).length);
  });
  it("short legs never exceed their own peak and still stop at the end", () => {
    const T = 20;
    expect(timetable(T / 2, T).v).toBeLessThan(CRUISE);
    expect(timetable(T, T).s).toBeCloseTo(timetable(0, T).length, 6);
  });
});

describe("stepTrain", () => {
  const T = 600;
  let clock = 0;
  const leg = (paused = false, total = T): Leg => ({ key: "a", total, elapsed: () => clock, paused });
  const fresh = () => {
    const st = trainState();
    st.fresh = false;
    return st;
  };

  it("follows the timer and arrives at the platform as it ends", () => {
    const st = fresh();
    for (let t = 0; t < T + 5; t += DT) {
      clock = Math.min(T, t);
      stepTrain(st, DT, leg(), false);
    }
    expect(st.s).toBeCloseTo(st.legEnd, 1);
    expect(st.v).toBe(0);
    expect(st.stopAt).toBeCloseTo(st.legEnd, 1);
  });

  it("pausing brakes to a stop; resuming continues without a jump and catches up", () => {
    const st = fresh();
    for (let t = 0; t < 200; t += DT) {
      clock = t;
      stepTrain(st, DT, leg(), false);
    }
    const before = st.s;
    let maxStep = 0;
    for (let i = 0; i < 60 * 30; i++) {
      const p = st.s;
      stepTrain(st, DT, leg(true), false);
      maxStep = Math.max(maxStep, st.s - p);
    }
    expect(st.v).toBe(0);
    expect(st.s - before).toBeLessThan((CRUISE * CRUISE) / (2 * BRAKE) + 1);
    expect(maxStep).toBeLessThan(STEP_MAX);
    const resumeAt = st.s;
    let jump = 0;
    for (let k = 0; k < 250 * 30; k++) {
      clock = 200 + k * DT;
      const p = st.s;
      stepTrain(st, DT, leg(), false);
      jump = Math.max(jump, st.s - p);
    }
    expect(st.s).toBeGreaterThan(resumeAt);
    expect(jump).toBeLessThan(STEP_MAX);
    const target = st.legStart + timetable(clock, T).s;
    expect(Math.abs(st.s - target)).toBeLessThan(15);
  });

  it("joins a ride already under way where the timer is", () => {
    const st = trainState();
    clock = 300;
    stepTrain(st, DT, leg(), false);
    expect(st.v).toBeGreaterThan(CRUISE * 0.9);
    expect(Math.abs(st.s - st.legStart - timetable(300, T).s)).toBeLessThan(STEP_MAX);
  });

  it("finishing early brakes to a platform just ahead", () => {
    const st = fresh();
    for (let t = 0; t < 120; t += DT) {
      clock = t;
      stepTrain(st, DT, leg(), false);
    }
    const v0 = st.v;
    const s0 = st.s;
    for (let t = 0; t < 60; t += DT) stepTrain(st, DT, null, true);
    expect(st.v).toBe(0);
    expect(Math.abs(st.s - s0 - (v0 * v0) / (2 * BRAKE))).toBeLessThan(2);
  });

  it("adding time mid-ride moves only the end, not the train", () => {
    const st = fresh();
    for (let t = 0; t < 200; t += DT) {
      clock = t;
      stepTrain(st, DT, leg(), false);
    }
    const s = st.s;
    const end = st.legEnd;
    stepTrain(st, DT, leg(false, T + 600), false);
    expect(st.s - s).toBeLessThan(STEP_MAX);
    expect(st.legEnd).toBeGreaterThan(end + 600 * CRUISE * 0.9);
  });
});
