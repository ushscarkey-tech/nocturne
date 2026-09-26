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
  /** Left end of the rail (the curtain's parked edge), in the parent's space. */
  left: number;
  /** Rail height and the curtain's hanging length. */
  railY: number;
  length: number;
  /** How far the leading edge reaches when drawn right across, and how narrow it gathers when pushed aside. */
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
  /** The gliders that run in the rail, one per fold; left out if not given. */
  hooks?: THREE.Material;
  /** Which curtain this is: each hangs in its own folds. */
  seed?: number;
}

/** Cloth is cut wider than the window, so it still falls in folds when drawn. */
const FULLNESS = 1.5;
/** Fabric in one wave of the heading tape. */
const WAVE = 0.17;
/** Vertices across one wave, and down the drop. */
const PER_WAVE = 10;
const ROWS = 26;
const STEP = 1 / 60;
const MAX_FOLD = 0.03;
/** The pendulum: how fast the drape settles, and how far it may lean. */
const OMEGA = 2.4;
const ZETA = 0.75;
const MAX_LEAN = 0.045;
/** The ripple field. */
const WAVE_SPEED = 60;
const WAVE_SPRING = 22;
const WAVE_DAMP = 5.5;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export class Curtain {
  readonly mesh: THREE.Mesh;
  cover: number;
  target: number;
  private readonly o: CurtainOptions;
  private readonly cols: number;
  private readonly waves: number;
  private readonly fabric: number;
  private readonly pos: Float32Array;
  // Ambient light reaching each point: less deep in a fold.
  private readonly shade: Float32Array;
  private readonly geo: THREE.BufferGeometry;
  private readonly hooks: THREE.InstancedMesh | null = null;
  // Each fold's own depth and how far it wanders from true below the heading.
  private readonly depthOf: Float32Array;
  private readonly driftOf: Float32Array;
  private acc = 0;
  // Lean of the hem along the rail, and a slight sway toward the room.
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
    this.fabric = o.width * FULLNESS;
    this.waves = Math.max(4, Math.round(this.fabric / WAVE));
    this.cols = this.waves * PER_WAVE + 1;
    const cols = this.cols;
    const n = cols * ROWS;
    this.pos = new Float32Array(n * 3);
    this.shade = new Float32Array(n * 3);
    this.bump = new Float32Array(n);
    this.bumpV = new Float32Array(n);
    let seed = o.seed ?? 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    this.depthOf = new Float32Array(this.waves + 2).map(() => 0.72 + rnd() * 0.5);
    this.driftOf = new Float32Array(this.waves + 2).map(() => (rnd() - 0.5) * 2.2);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    const uv = new Float32Array(n * 2);
    const index: number[] = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < cols; c++) {
        uv.set([c / (cols - 1), 1 - r / (ROWS - 1)], (r * cols + c) * 2);
        if (r < ROWS - 1 && c < cols - 1) {
          const a = r * cols + c;
          index.push(a, a + cols, a + 1, a + 1, a + cols, a + cols + 1);
        }
      }
    }
    geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    geo.setAttribute("color", new THREE.BufferAttribute(this.shade, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setIndex(index);
    this.geo = geo;
    this.mesh = new THREE.Mesh(geo, material);
    this.mesh.frustumCulled = false;
    if (o.hooks) {
      const hook = new THREE.BoxGeometry(0.009, 0.016, 0.012);
      this.hooks = new THREE.InstancedMesh(hook, o.hooks, this.waves + 1);
      this.hooks.frustumCulled = false;
      this.mesh.add(this.hooks);
    }
    this.layout();
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
    for (let i = 0; i < this.cols * ROWS; i++) {
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
    const COLS = this.cols;
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

  /** A fold's value at a point across the cloth, eased between folds. */
  private along(values: Float32Array, s: number) {
    const i = Math.floor(s);
    const f = s - i;
    const k = f * f * (3 - 2 * f);
    return values[i] * (1 - k) + values[Math.min(values.length - 1, i + 1)] * k;
  }

  /**
   * Lay the cloth out. The heading tape holds it in even waves; below, each
   * fold keeps its own depth and wanders a little, the hem swings out a
   * touch, and the lean, sway and ripples ride on top.
   */
  private layout() {
    const o = this.o;
    const cols = this.cols;
    const span = o.parked + this.cover * (o.width - o.parked);
    const wave = this.fabric / this.waves;
    const pitch = span / this.waves;
    // The fabric in one wave, folded into less rail: the deeper the gather,
    // the deeper the folds (a zig-zag of that length, softened).
    const depth = Math.min(MAX_FOLD, 0.17 * Math.sqrt(Math.max(0, wave * wave - pitch * pitch)) + 0.003);
    const dy = o.length / (ROWS - 1);
    const mid = o.left + span / 2;
    for (let r = 0; r < ROWS; r++) {
      const t = r / (ROWS - 1);
      const hang = t * t;
      const loose = smooth(0.04, 0.55, t);
      const flare = 1 + 0.045 * t;
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const u = c / (cols - 1);
        const s = u * this.waves;
        const theta = 2 * Math.PI * s + loose * this.along(this.driftOf, s);
        const d = depth * (1 + loose * (this.along(this.depthOf, s) - 1)) * (1 + 0.2 * t);
        const fold = Math.sin(theta);
        // Folds bow toward the room, rounder in front than behind.
        const front = d * (1 + fold);
        const belly = hang * 0.01 * (0.5 + 0.5 * Math.sin(2 * Math.PI * u * 1.15 + 1.3));
        const j = i * 3;
        this.pos[j] = mid + (o.left + span * u - mid) * flare + this.lean * hang + Math.cos(theta) * d * 0.25 * loose;
        // The hem lifts a little where the folds turn back.
        this.pos[j + 1] = Math.max(o.floorY, o.railY - r * dy + t ** 6 * (1 - fold) * d * 0.35);
        // Always in front of the rail's plane (and so of the frame and wall).
        this.pos[j + 2] = o.z + 0.012 + Math.max(0, front + belly + this.bump[i] + this.sway * hang);
        // Deep in a fold less light reaches; the crests catch it all.
        const ao = 0.62 + 0.38 * Math.sqrt(0.5 + 0.5 * fold);
        this.shade[j] = this.shade[j + 1] = this.shade[j + 2] = ao;
      }
    }
    (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    this.geo.computeVertexNormals();
    if (this.hooks) {
      const m = new THREE.Matrix4();
      for (let k = 0; k <= this.waves; k++) {
        const u = Math.min(1, (k + 0.25) / this.waves);
        m.makeTranslation(mid + (o.left + span * u - mid), o.railY + 0.006, o.z + 0.012 + depth * 2 * (k < this.waves ? 1 : 0.5));
        this.hooks.setMatrixAt(k, m);
      }
      this.hooks.instanceMatrix.needsUpdate = true;
    }
  }

  dispose() {
    this.geo.dispose();
    this.hooks?.geometry.dispose();
  }
}
