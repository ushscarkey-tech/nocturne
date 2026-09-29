import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { rng } from "./route";

/**
 * Geometry for the things outside, each made once and drawn many times.
 * Unit-sized where the size varies (buildings are scaled per instance),
 * real-sized where it doesn't (poles, masts, lamps).
 */

const merge = (parts: THREE.BufferGeometry[]) => {
  // Everything merged must share the same attributes.
  const clean = parts.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(n.attributes)) if (k !== "position" && k !== "normal" && k !== "uv") n.deleteAttribute(k);
    if (!n.attributes.uv) n.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array((n.attributes.position.count * 2) | 0), 2));
    return n;
  });
  const g = mergeGeometries(clean, false)!;
  clean.forEach((c) => c.dispose());
  parts.forEach((p) => p.dispose());
  return g;
};

const at = (g: THREE.BufferGeometry, x: number, y: number, z: number, ry = 0, rz = 0, rx = 0) => {
  if (rx) g.rotateX(rx);
  if (rz) g.rotateZ(rz);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return g;
};

/** A unit box standing on y = 0 (a building: scaled to its width, height and depth). */
export function blockGeometry() {
  return new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
}

/** A small house: walls to 62 % of the height and a gable roof with eaves, unit-sized. */
export function houseGeometry() {
  const walls = new THREE.BoxGeometry(1, 0.62, 1).translate(0, 0.31, 0);
  const roofShape = new THREE.Shape([new THREE.Vector2(-0.56, 0), new THREE.Vector2(0.56, 0), new THREE.Vector2(0, 0.38)]);
  const roof = new THREE.ExtrudeGeometry(roofShape, { depth: 1.08, bevelEnabled: false });
  roof.translate(0, 0.62, -0.54);
  return merge([walls, roof]);
}

/** A works roof of north lights: a row of saw teeth, unit-sized, sitting on y = 0. */
export function sawtoothGeometry(teeth = 5) {
  const s = new THREE.Shape();
  s.moveTo(-0.5, 0);
  const w = 1 / teeth;
  for (let i = 0; i < teeth; i++) {
    const x = -0.5 + i * w;
    s.lineTo(x + w * 0.78, 1);
    s.lineTo(x + w * 0.8, 0);
    s.lineTo(x + w, 0);
  }
  s.lineTo(-0.5, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false });
  g.translate(0, 0, -0.5);
  return g;
}

export function tankGeometry() {
  const body = new THREE.CylinderGeometry(0.5, 0.5, 1, 24, 1).translate(0, 0.5, 0);
  const cap = new THREE.SphereGeometry(0.5, 24, 6, 0, Math.PI * 2, 0, Math.PI / 5).scale(1, 0.35, 1).translate(0, 0.84, 0);
  return merge([body, cap]);
}

export function chimneyGeometry() {
  return new THREE.CylinderGeometry(0.36, 0.5, 1, 14, 1).translate(0, 0.5, 0);
}

/** Plastic greenhouse (a vinyl tunnel), unit length along x. */
export function greenhouseGeometry() {
  const g = new THREE.CylinderGeometry(0.5, 0.5, 1, 14, 1, true, 0, Math.PI);
  g.rotateZ(Math.PI / 2);
  g.rotateX(Math.PI / 2);
  return g;
}

function jitter(g: THREE.BufferGeometry, amount: number, seed: number) {
  const r = rng(seed);
  const p = g.attributes.position as THREE.BufferAttribute;
  // Weld-aware: the same position gets the same nudge, so no cracks open.
  const seen = new Map<string, [number, number, number]>();
  for (let i = 0; i < p.count; i++) {
    const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    let d = seen.get(k);
    if (!d) {
      d = [(r() - 0.5) * amount, (r() - 0.5) * amount, (r() - 0.5) * amount];
      seen.set(k, d);
    }
    p.setXYZ(i, p.getX(i) + d[0], p.getY(i) + d[1], p.getZ(i) + d[2]);
  }
  g.computeVertexNormals();
  return g;
}

/** A conifer: tiers of needles on a short trunk, ~1 m tall at unit scale (scaled per instance). */
export function coniferGeometry() {
  const trunk = new THREE.CylinderGeometry(0.016, 0.026, 0.3, 6).translate(0, 0.15, 0);
  const tiers = [0, 1, 2, 3].map((i) => jitter(new THREE.ConeGeometry(0.3 - i * 0.06, 0.42, 12, 3), 0.025, 20 + i).translate(0, 0.28 + i * 0.18, 0));
  return merge([trunk, ...tiers]);
}

/** A soft lump of foliage: a sphere pushed about by a few waves, smooth-shaded. */
function lump(r: number, seed: number) {
  const g = new THREE.SphereGeometry(r, 12, 9);
  const p = g.attributes.position as THREE.BufferAttribute;
  const q = rng(seed);
  const ph = [q() * 6, q() * 6, q() * 6];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const k = 1 + 0.16 * Math.sin(x * 9 / r + ph[0]) * Math.sin(z * 8 / r + ph[1]) + 0.1 * Math.sin(y * 11 / r + ph[2]);
    p.setXYZ(i, x * k, y * k * 0.9, z * k);
  }
  g.computeVertexNormals();
  return g;
}

/** A broadleaf tree: a lumpy crown of a few soft masses on a trunk. */
export function broadleafGeometry() {
  const trunk = new THREE.CylinderGeometry(0.022, 0.036, 0.45, 6).translate(0, 0.22, 0);
  const blobs = [
    [0, 0.62, 0, 0.3],
    [0.17, 0.55, 0.05, 0.22],
    [-0.16, 0.57, -0.04, 0.23],
    [0.02, 0.8, -0.02, 0.21],
    [-0.05, 0.53, 0.17, 0.2],
  ].map(([x, y, z, r], i) => lump(r, 40 + i).translate(x, y, z));
  return merge([trunk, ...blobs]);
}

/** A mound of land (hills, the shoulders of a tunnel), unit radius and height. */
export function moundGeometry() {
  const g = new THREE.SphereGeometry(1, 36, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  const p = g.attributes.position as THREE.BufferAttribute;
  const r = rng(77);
  const bumps = Array.from({ length: 7 }, () => [r() * Math.PI * 2, 0.3 + r() * 0.5, 0.05 + r() * 0.08] as const);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const y = p.getY(i);
    const a = Math.atan2(z, x);
    let k = 1;
    for (const [ph, f, amp] of bumps) k += Math.sin(a * f * 6 + ph) * amp * y;
    // A rounded summit that falls away unevenly: not a dome.
    const crest = 0.75 + 0.25 * Math.sin(a * 2 + 1.3) + 0.12 * Math.sin(a * 5 + 0.4);
    p.setXYZ(i, x * k, Math.pow(y, 1.35) * crest, z * k);
  }
  g.computeVertexNormals();
  return g;
}

/** A concrete utility pole with two crossarms and a transformer can. Real size (≈ 10 m). */
export function utilityPoleGeometry() {
  const pole = new THREE.CylinderGeometry(0.11, 0.17, 10, 8).translate(0, 5, 0);
  const arm1 = new THREE.BoxGeometry(0.1, 0.1, 2.2).translate(0, 9.4, 0);
  const arm2 = new THREE.BoxGeometry(0.1, 0.1, 1.6).translate(0, 8.7, 0);
  const can = new THREE.CylinderGeometry(0.28, 0.28, 0.9, 10).translate(0, 7.5, 0.35);
  const ins = [-1, -0.4, 0.4, 1].map((z) => new THREE.CylinderGeometry(0.04, 0.05, 0.16, 6).translate(0, 9.55, z));
  return merge([pole, arm1, arm2, can, ...ins]);
}

/** A catenary mast beside the other track: an H-section column with its cantilever arm. Real size. */
export function mastGeometry() {
  const col = new THREE.BoxGeometry(0.28, 7.2, 0.22).translate(0, 3.6, 0);
  const web = new THREE.BoxGeometry(0.06, 7.2, 0.3).translate(0, 3.6, 0);
  // Cantilever toward the track (+z), with its brace.
  const arm = new THREE.CylinderGeometry(0.035, 0.035, 2.4, 6);
  at(arm, 0, 6.5, 1.15, 0, 0, Math.PI / 2);
  const brace = new THREE.CylinderGeometry(0.03, 0.03, 2.5, 6);
  at(brace, 0, 5.9, 1.05, 0, 0, Math.PI / 2 - 0.45);
  const insul = new THREE.CylinderGeometry(0.06, 0.06, 0.35, 8);
  at(insul, 0, 6.5, 0.2, 0, 0, Math.PI / 2);
  const foot = new THREE.BoxGeometry(0.7, 0.4, 0.7).translate(0, 0.2, 0);
  return merge([col, web, arm, brace, insul, foot]);
}

/** A street lamp: pole, curved arm, head. The head sits at (0, 7.6, 1.6). Real size. */
export function streetLampGeometry() {
  const pole = new THREE.CylinderGeometry(0.07, 0.11, 7.4, 8).translate(0, 3.7, 0);
  const arm = new THREE.CylinderGeometry(0.045, 0.045, 1.8, 6);
  at(arm, 0, 7.55, 0.85, 0, 0, Math.PI / 2 - 0.12);
  const head = new THREE.BoxGeometry(0.28, 0.12, 0.55).translate(0, 7.6, 1.6);
  return merge([pole, arm, head]);
}

/** A colour-light signal on its post; the lamps sit at (0, 4.9 … 5.3, 0.15). Real size. */
export function signalGeometry() {
  const post = new THREE.CylinderGeometry(0.07, 0.09, 5, 8).translate(0, 2.5, 0);
  const head = new THREE.BoxGeometry(0.42, 1.0, 0.25).translate(0, 5.1, 0);
  const hood1 = new THREE.BoxGeometry(0.3, 0.05, 0.22).translate(0, 5.42, 0.2);
  const hood2 = new THREE.BoxGeometry(0.3, 0.05, 0.22).translate(0, 5.02, 0.2);
  const ladder = new THREE.BoxGeometry(0.35, 4.6, 0.04).translate(0, 2.3, -0.2);
  return merge([post, head, hood1, hood2, ladder]);
}

/** A floodlight tower in a freight yard; the lamps sit at y ≈ 18. Real size. */
export function floodTowerGeometry() {
  const mast = new THREE.CylinderGeometry(0.18, 0.3, 18, 8).translate(0, 9, 0);
  const frame = new THREE.BoxGeometry(2.4, 1.0, 0.4).translate(0, 18.2, 0.1);
  return merge([mast, frame]);
}

/** One 6 m bay of a plate-girder bridge side: the girder, a railing and a post. */
export function trussGeometry() {
  const L = 6;
  const girder = new THREE.BoxGeometry(L, 1.3, 0.3).translate(0, 0.65, 0);
  const flange = new THREE.BoxGeometry(L, 0.08, 0.6).translate(0, 1.32, -0.15);
  const post = new THREE.BoxGeometry(0.08, 1.1, 0.08).translate(-L / 2, 1.9, 0);
  const rail = new THREE.BoxGeometry(L, 0.06, 0.06).translate(0, 2.42, 0);
  const mid = new THREE.BoxGeometry(L, 0.04, 0.04).translate(0, 1.95, 0);
  const stiff = [-1.5, 0, 1.5].map((x) => new THREE.BoxGeometry(0.06, 1.2, 0.14).translate(x, 0.65, 0.18));
  return merge([girder, flange, post, rail, mid, ...stiff]);
}

/** A covered goods wagon on its bogies, 14 m long. Real size. */
export function wagonGeometry() {
  const body = new THREE.BoxGeometry(14, 2.6, 2.8).translate(0, 2.4, 0);
  const roof = new THREE.CylinderGeometry(1.5, 1.5, 14, 16, 1, false, -Math.PI / 2, Math.PI);
  at(roof, 0, 3.4, 0, 0, Math.PI / 2);
  roof.scale(1, 0.3, 0.93);
  const bogies = [-5, 5].map((x) => new THREE.BoxGeometry(2.6, 0.7, 2.2).translate(x, 0.75, 0));
  const ribs = [-4.5, -1.5, 1.5, 4.5].map((x) => new THREE.BoxGeometry(0.08, 2.5, 2.86).translate(x, 2.4, 0));
  return merge([body, roof, ...bogies, ...ribs]);
}

/** A low island platform for passing stations, unit length along x. */
export function passPlatformGeometry() {
  const slab = new THREE.BoxGeometry(1, 1.0, 3.2).translate(0, 0.5, 0);
  return slab;
}

/** A platform shelter: roof on posts, 12 m long. Real size. */
export function shelterGeometry() {
  const roof = new THREE.BoxGeometry(12, 0.14, 2.6).translate(0, 3.1, 0);
  const posts = [-5, 0, 5].map((x) => new THREE.CylinderGeometry(0.06, 0.06, 3, 6).translate(x, 1.55, -0.6));
  const back = new THREE.BoxGeometry(12, 1.8, 0.05).translate(0, 1.9, -1.2);
  const bench = new THREE.BoxGeometry(4, 0.08, 0.4).translate(-2, 0.45, -0.9);
  return merge([roof, ...posts, back, bench]);
}

/** A car, 4.2 m long, pointing +x. Real size. */
export function carGeometry() {
  const body = new THREE.BoxGeometry(4.2, 0.62, 1.74).translate(0, 0.62, 0);
  const cabin = new THREE.BoxGeometry(2.3, 0.56, 1.56).translate(-0.35, 1.2, 0);
  const wheels = [-1.35, 1.35].flatMap((x) =>
    [-0.8, 0.8].map((z) => {
      const w = new THREE.CylinderGeometry(0.32, 0.32, 0.22, 12);
      w.rotateX(Math.PI / 2);
      return w.translate(x, 0.32, z);
    }),
  );
  return merge([body, cabin, ...wheels]);
}

/** A wooden or concrete fence post, and a unit panel for fences and sound walls. */
export function panelGeometry() {
  return new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
}

/** A flat tile of ground, unit size, lying on y = 0. */
export function tileGeometry() {
  return new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
}

/** A camera-facing quad for glows. */
export function glowGeometry() {
  return new THREE.PlaneGeometry(1, 1);
}
