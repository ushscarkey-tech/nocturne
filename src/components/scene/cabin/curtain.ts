import * as THREE from "three";

/**
 * The window curtain. It hangs straight from hooks that slide along a rail
 * over the window, in soft pleats where the hooks are gathered and nearly
 * flat when it is drawn across the glass.
 *
 * Its shape is laid out, not simulated freely, so the fabric never folds
 * through itself or slips behind the window frame. What moves it is kept
 * calm and physical: the whole drape leans back as the train pulls away and
 * forward as it brakes (a well-damped pendulum), shivers a little at rail
 * joints, and ripples where you brush it (a damped wave across the cloth).
 */
export interface CurtainOptions {
  /** Left end of the rail (the curtain's parked edge), in cabin space. */
  left: number;
  /** Rail height and the curtain's hanging length. */
  railY: number;
  length: number;
  /** The fabric's full width, and how narrow it gathers when pushed aside. */
  width: number;
  parked: number;
  /** Plane the rail hangs in. The fabric never goes behind this. */
  z: number;
  /** Kept for callers; the fabric stays in front of `z`. */
  wallGap: number;
  /** Nothing hangs below this (the sill). */
  floorY: number;
  /** 0 = pushed aside … 1 = drawn right across. */
  cover: number;
}

const COLS = 33;
const ROWS = 24;
const STEP = 1 / 60;
const MAX_PLEAT = 0.028;
/** The pendulum: how fast the drape settles, and how far it may lean. */
const OMEGA = 2.4;
const ZETA = 0.75;
const MAX_LEAN = 0.045;
/** The ripple field. */
const WAVE_SPEED = 30;
const WAVE_SPRING = 22;
const WAVE_DAMP = 5.5;

export class Curtain {
  readonly mesh: THREE.Mesh;
  cover: number;
  target: number;
  private readonly o: CurtainOptions;
  private readonly pos: Float32Array;
  private readonly geo: THREE.BufferGeometry;
  private readonly rest: number;
  private acc = 0;
  // Lean of the hem along the rails (x) and toward the room (z), and their velocities.
  private lean = 0;
  private leanV = 0;
  private sway = 0;
  private swayV = 0;
  private lastCover: number;
  // Ripple height (toward the room) and velocity at every point.
  private readonly bump: Float32Array;
  private readonly bumpV: Float32Array;
  private holdAt: { x: number; y: number } | null = null;
  private grabX = 0;
  private grabCover = 0;

  constructor(material: THREE.Material, o: CurtainOptions) {
    this.o = o;
    this.cover = this.target = this.lastCover = o.cover;
    const n = COLS * ROWS;
    this.pos = new Float32Array(n * 3);
    this.bump = new Float32Array(n);
    this.bumpV = new Float32Array(n);
    this.rest = o.width / (COLS - 1);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    const uv = new Float32Array(n * 2);
    const index: number[] = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        uv.set([c / (COLS - 1), 1 - r / (ROWS - 1)], (r * COLS + c) * 2);
        if (r < ROWS - 1 && c < COLS - 1) {
          const a = r * COLS + c;
          index.push(a, a + COLS, a + 1, a + 1, a + COLS, a + COLS + 1);
        }
      }
    }
    geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    geo.setIndex(index);
    this.geo = geo;
    this.layout();
    this.mesh = new THREE.Mesh(geo, material);
    this.mesh.frustumCulled = false;
  }

  /** The curtain's leading edge, where a hand would take hold of it. */
  get edgeX(): number {
    return this.o.left + this.o.parked + this.cover * (this.o.width - this.o.parked);
  }

  get holding(): boolean {
    return this.holdAt !== null;
  }

  /** Is this point (on the curtain's plane) on the fabric? */
  hit(x: number, y: number): boolean {
    return x >= this.o.left - 0.03 && x <= this.edgeX + 0.04 && y <= this.o.railY + 0.03 && y >= this.o.railY - this.o.length - 0.03;
  }

  /** Brush the fabric at a point, moving (dx, dy): it gives a little and ripples. */
  brush(x: number, y: number, dx: number, dy: number) {
    const speed = Math.min(1, Math.hypot(dx, dy) * 12);
    if (speed < 0.02) return;
    this.poke(x, y, -0.06 * speed, 0.07);
  }

  grab(x: number, y: number) {
    this.holdAt = { x, y };
    this.grabX = x;
    this.grabCover = this.target;
  }

  /** Pull the held fabric: the leading edge moves as far as the hand does. */
  drag(x: number, y: number) {
    if (!this.holdAt) return;
    this.holdAt = { x, y };
    this.target = Math.min(1, Math.max(0, this.grabCover + (x - this.grabX) / (this.o.width - this.o.parked)));
  }

  release() {
    this.holdAt = null;
  }

  /** Push the ripple field around a point (velocity toward the room is positive). */
  private poke(x: number, y: number, v: number, radius: number) {
    for (let i = 0; i < COLS * ROWS; i++) {
      const d = Math.hypot(this.pos[i * 3] - x, this.pos[i * 3 + 1] - y);
      if (d < radius) this.bumpV[i] += v * (1 - d / radius);
    }
  }

  /**
   * Advance. `accel` is the train's acceleration along the rails (m/s²,
   * forward = +x), `jolt` a knock from a rail joint (0…1), `sway` the slow
   * roll of the carriage (about −1…1).
   */
  update(dt: number, accel: number, jolt: number, sway: number) {
    this.acc += Math.min(dt, 0.1);
    let stepped = false;
    while (this.acc >= STEP) {
      this.acc -= STEP;
      this.tick(accel, jolt, sway);
      jolt = 0;
      stepped = true;
    }
    if (stepped) this.layout();
  }

  private tick(accel: number, jolt: number, sway: number) {
    const o = this.o;
    this.cover += (this.target - this.cover) * 0.1;
    const coverV = (this.cover - this.lastCover) / STEP;
    this.lastCover = this.cover;

    // The drape leans the way a pendulum would under the train's
    // acceleration (hem back when pulling away), and trails a hand that
    // draws it; well damped, so it settles rather than swings.
    const leanTarget = Math.max(-MAX_LEAN, Math.min(MAX_LEAN, -o.length * (accel / 9.8) * 0.5 - coverV * (o.width - o.parked) * 0.06));
    this.leanV += (-OMEGA * OMEGA * (this.lean - leanTarget) - 2 * ZETA * OMEGA * this.leanV) * STEP;
    this.lean += this.leanV * STEP;
    const swayTarget = sway * 0.004;
    this.swayV += (-OMEGA * OMEGA * (this.sway - swayTarget) - 2 * ZETA * OMEGA * this.swayV) * STEP;
    if (jolt > 0) this.swayV += (Math.random() - 0.5) * 0.02 * jolt;
    this.sway += this.swayV * STEP;

    // Where it's held, the fabric lifts a touch toward the hand.
    if (this.holdAt) this.poke(this.holdAt.x, this.holdAt.y, 0.02, 0.06);

    // The ripple field: a damped wave, never deep enough to fold the cloth.
    const b = this.bump;
    const v = this.bumpV;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const i = r * COLS + c;
        if (r === 0) {
          b[i] = 0;
          v[i] = 0;
          continue;
        }
        const l = c > 0 ? b[i - 1] : b[i];
        const rr = c < COLS - 1 ? b[i + 1] : b[i];
        const u = b[i - COLS];
        const d = r < ROWS - 1 ? b[i + COLS] : b[i];
        const lap = l + rr + u + d - 4 * b[i];
        v[i] += (WAVE_SPEED * lap - WAVE_SPRING * b[i] - WAVE_DAMP * v[i]) * STEP;
      }
    }
    for (let i = 0; i < b.length; i++) b[i] = Math.max(-0.008, Math.min(0.03, b[i] + v[i] * STEP));
  }

  /** Lay the fabric out from the hooks, the lean and the ripples. */
  private layout() {
    const o = this.o;
    const span = o.parked + this.cover * (o.width - o.parked);
    const gap = span / (COLS - 1);
    // Gathered hooks make deep pleats; drawn across, the cloth is almost flat.
    const depth = Math.max(0.004, Math.min(MAX_PLEAT, 0.5 * Math.sqrt(Math.max(0, this.rest * this.rest - gap * gap))));
    const dy = o.length / (ROWS - 1);
    const mid = o.left + span / 2;
    for (let r = 0; r < ROWS; r++) {
      const t = r / (ROWS - 1);
      const hang = t * t;
      // The fabric flares a little toward the hem.
      const flare = 1 + 0.05 * t;
      for (let c = 0; c < COLS; c++) {
        const i = (r * COLS + c) * 3;
        const hookX = o.left + gap * c;
        const pleat = depth * (1 + Math.sin((c * Math.PI) / 2));
        this.pos[i] = mid + (hookX - mid) * flare + this.lean * hang;
        this.pos[i + 1] = Math.max(o.floorY, o.railY - r * dy);
        // Always in front of the rail's plane (and so of the frame and wall).
        this.pos[i + 2] = o.z + 0.012 + Math.max(0, pleat + this.bump[r * COLS + c] + this.sway * hang);
      }
    }
    (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    this.geo.computeVertexNormals();
  }

  dispose() {
    this.geo.dispose();
  }
}
