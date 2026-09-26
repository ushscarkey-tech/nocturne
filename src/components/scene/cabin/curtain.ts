import * as THREE from "three";

/**
 * The window curtain as cloth: a grid of points joined by springs (Verlet),
 * hung from hooks that slide along a rail at the top of the window.
 *
 * It hangs straight and falls into pleats where its hooks are gathered; it
 * swings back when the train pulls away, forward when it brakes, shivers at
 * the rail joints, and moves when you brush it or pull it across the glass.
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
  /** Plane the rail hangs in; the wall is `wallGap` behind it. */
  z: number;
  wallGap: number;
  /** Nothing hangs below this (the sill). */
  floorY: number;
  /** 0 = pushed aside … 1 = drawn right across. */
  cover: number;
}

const COLS = 29;
const ROWS = 22;
const STEP = 1 / 90;
const ITERATIONS = 6;
const GRAVITY = 9.8;
const DAMPING = 0.986;
const MAX_PLEAT = 0.035;

type Constraint = [number, number, number];

export class Curtain {
  readonly mesh: THREE.Mesh;
  /** How far the curtain is drawn now, and where it is heading. */
  cover: number;
  target: number;
  private readonly o: CurtainOptions;
  private readonly pos: Float32Array;
  private readonly prev: Float32Array;
  private readonly links: Constraint[] = [];
  private readonly geo: THREE.BufferGeometry;
  private readonly rest: number;
  private acc = 0;
  private grabbed = -1;
  private readonly grabAt = new THREE.Vector3();
  /** Where the hand took hold, and how far the curtain was drawn then. */
  private grabX = 0;
  private grabCover = 0;

  constructor(material: THREE.Material, o: CurtainOptions) {
    this.o = o;
    this.cover = this.target = o.cover;
    const n = COLS * ROWS;
    this.pos = new Float32Array(n * 3);
    this.prev = new Float32Array(n * 3);
    this.rest = o.width / (COLS - 1);
    const dy = o.length / (ROWS - 1);
    const idx = (c: number, r: number) => r * COLS + c;

    // Springs: along the weave, down it, across (shear), and every other
    // point down the length so the fabric has a little body.
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (c < COLS - 1) this.links.push([idx(c, r), idx(c + 1, r), this.rest]);
        if (r < ROWS - 1) this.links.push([idx(c, r), idx(c, r + 1), dy]);
        if (c < COLS - 1 && r < ROWS - 1) {
          const d = Math.hypot(this.rest, dy);
          this.links.push([idx(c, r), idx(c + 1, r + 1), d]);
          this.links.push([idx(c + 1, r), idx(c, r + 1), d]);
        }
        if (r < ROWS - 2) this.links.push([idx(c, r), idx(c, r + 2), dy * 2]);
      }
    }

    // Start hanging from the hooks, already pleated.
    const hooks = this.hooks();
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const i = idx(c, r) * 3;
        this.pos[i] = hooks[c * 3];
        this.pos[i + 1] = o.railY - r * dy;
        this.pos[i + 2] = hooks[c * 3 + 2];
      }
    }
    this.prev.set(this.pos);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    const uv = new Float32Array(n * 2);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) uv.set([c / (COLS - 1), 1 - r / (ROWS - 1)], idx(c, r) * 2);
    geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    const index: number[] = [];
    for (let r = 0; r < ROWS - 1; r++) {
      for (let c = 0; c < COLS - 1; c++) {
        const a = idx(c, r);
        const b = idx(c + 1, r);
        const d = idx(c, r + 1);
        const e = idx(c + 1, r + 1);
        index.push(a, d, b, b, d, e);
      }
    }
    geo.setIndex(index);
    geo.computeVertexNormals();
    this.geo = geo;
    this.mesh = new THREE.Mesh(geo, material);
    this.mesh.frustumCulled = false;
    // Let it settle before anyone sees it.
    for (let i = 0; i < 120; i++) this.tick(0, 0, 0);
    this.commit();
  }

  /**
   * Hook positions along the rail. Gathered, the heading tape waves in and
   * out (one pleat every four points), which is what folds the cloth below.
   */
  private hooks(): Float32Array {
    const o = this.o;
    const span = o.parked + this.cover * (o.width - o.parked);
    const gap = span / (COLS - 1);
    // Enough depth that the tape's length along the wave matches the fabric's.
    const depth = Math.min(MAX_PLEAT, 0.45 * Math.sqrt(Math.max(0, this.rest * this.rest - gap * gap)) * 1.6);
    const out = new Float32Array(COLS * 3);
    for (let c = 0; c < COLS; c++) {
      out[c * 3] = o.left + gap * c;
      out[c * 3 + 1] = o.railY;
      out[c * 3 + 2] = o.z + depth * (1 + Math.sin((c * Math.PI) / 2));
    }
    return out;
  }

  /** The curtain's leading edge, where a hand would take hold of it. */
  get edgeX(): number {
    return this.o.left + this.o.parked + this.cover * (this.o.width - this.o.parked);
  }

  /** Is this point (on the curtain's plane) on the fabric? */
  hit(x: number, y: number): boolean {
    return x >= this.o.left - 0.03 && x <= this.edgeX + 0.05 && y <= this.o.railY + 0.03 && y >= this.o.railY - this.o.length - 0.03;
  }

  /** Brush the fabric at a point, moving (dx, dy) in the plane. */
  brush(x: number, y: number, dx: number, dy: number) {
    const radius = 0.09;
    for (let i = COLS; i < COLS * ROWS; i++) {
      const p = i * 3;
      const d = Math.hypot(this.pos[p] - x, this.pos[p + 1] - y);
      if (d > radius) continue;
      const k = 1 - d / radius;
      // Nudge the previous position: Verlet turns that into velocity.
      this.prev[p] -= dx * 0.35 * k;
      this.prev[p + 1] -= dy * 0.2 * k;
      this.prev[p + 2] += 0.004 * k;
    }
  }

  /** Take hold of the fabric nearest to a point. */
  grab(x: number, y: number) {
    let best = -1;
    let bestD = Infinity;
    for (let i = COLS; i < COLS * ROWS; i++) {
      const d = Math.hypot(this.pos[i * 3] - x, this.pos[i * 3 + 1] - y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    this.grabbed = best;
    this.grabAt.set(x, y, this.o.z + 0.03);
    this.grabX = x;
    this.grabCover = this.target;
  }

  /** Pull the held fabric: across the window draws it, the hooks follow. */
  drag(x: number, y: number) {
    if (this.grabbed < 0) return;
    this.grabAt.set(x, y, this.o.z + 0.03);
    // The leading edge moves as far as the hand does.
    this.target = Math.min(1, Math.max(0, this.grabCover + (x - this.grabX) / (this.o.width - this.o.parked)));
  }

  release() {
    this.grabbed = -1;
  }

  get holding(): boolean {
    return this.grabbed >= 0;
  }

  /**
   * Advance the cloth. `accel` is the train's acceleration along the rails
   * (m/s², forward = +x), `jolt` a knock from a rail joint (0…1), `sway` the
   * slow roll of the carriage.
   */
  update(dt: number, accel: number, jolt: number, sway: number) {
    this.acc += Math.min(dt, 0.1);
    let steps = 0;
    while (this.acc >= STEP && steps < 8) {
      this.acc -= STEP;
      steps += 1;
      this.tick(accel, jolt, sway);
      jolt = 0;
    }
    if (steps > 0) this.commit();
  }

  private tick(accel: number, jolt: number, sway: number) {
    const o = this.o;
    this.cover += (this.target - this.cover) * 0.12;
    const hooks = this.hooks();
    const pos = this.pos;
    const prev = this.prev;
    const dt2 = STEP * STEP;
    // The train speeding up leaves the cloth behind; braking throws it forward.
    const ax = -accel * 1.6;
    const az = sway * 0.35;
    for (let i = COLS; i < COLS * ROWS; i++) {
      const p = i * 3;
      const row = Math.floor(i / COLS) / (ROWS - 1);
      for (let k = 0; k < 3; k++) {
        const v = (pos[p + k] - prev[p + k]) * DAMPING;
        prev[p + k] = pos[p + k];
        pos[p + k] += v;
      }
      pos[p] += ax * dt2 * row;
      pos[p + 1] -= GRAVITY * dt2;
      pos[p + 2] += az * dt2 * row;
      if (jolt > 0) {
        pos[p + 1] += (Math.random() - 0.3) * 0.0012 * jolt * row;
        pos[p + 2] += (Math.random() - 0.5) * 0.002 * jolt * row;
      }
    }
    for (let it = 0; it < ITERATIONS; it++) {
      // Top row rides on its hooks.
      for (let c = 0; c < COLS; c++) {
        pos[c * 3] = hooks[c * 3];
        pos[c * 3 + 1] = hooks[c * 3 + 1];
        pos[c * 3 + 2] = hooks[c * 3 + 2];
      }
      if (this.grabbed >= 0) {
        // Held: the fabric under the hand lifts toward it a little.
        const p = this.grabbed * 3;
        pos[p + 1] += (this.grabAt.y - pos[p + 1]) * 0.08;
        pos[p + 2] += (this.grabAt.z - pos[p + 2]) * 0.2;
      }
      for (const [a, b, rest] of this.links) {
        const pa = a * 3;
        const pb = b * 3;
        const dx = pos[pb] - pos[pa];
        const dy = pos[pb + 1] - pos[pa + 1];
        const dz = pos[pb + 2] - pos[pa + 2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
        // Cloth resists stretching far more than it resists bunching up.
        const diff = (d - rest) / d;
        const k = diff > 0 ? 0.5 : 0.2;
        const aPinned = a < COLS ? 0 : 1;
        const bPinned = b < COLS ? 0 : 1;
        const wa = aPinned / Math.max(1, aPinned + bPinned);
        const wb = bPinned / Math.max(1, aPinned + bPinned);
        pos[pa] += dx * diff * k * 2 * wa;
        pos[pa + 1] += dy * diff * k * 2 * wa;
        pos[pa + 2] += dz * diff * k * 2 * wa;
        pos[pb] -= dx * diff * k * 2 * wb;
        pos[pb + 1] -= dy * diff * k * 2 * wb;
        pos[pb + 2] -= dz * diff * k * 2 * wb;
      }
      // The wall and glass behind, the sill below.
      for (let i = COLS; i < COLS * ROWS; i++) {
        const p = i * 3;
        if (pos[p + 2] < o.z - o.wallGap) pos[p + 2] = o.z - o.wallGap;
        if (pos[p + 1] < o.floorY) pos[p + 1] = o.floorY;
      }
    }
  }

  private commit() {
    (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    this.geo.computeVertexNormals();
  }

  dispose() {
    this.geo.dispose();
  }
}
