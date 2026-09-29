import * as THREE from "three";
import type { CarriageId } from "@/core/types";
import { CURTAIN_COLOR, clothMaterial, type ClothBacklight } from "./cloth";
import type { CurtainOptions } from "./curtain";
import { lin, type SceneKit } from "./kit";
import { D, rideFov, windowShape } from "./layout";
import { glassMaterial } from "./shaders";
import * as ct from "./textures";

export { D, rideFov };

export interface WindowDims {
  /** The glass: width, height, how far its centre sits above the eyes, corner radius. */
  w: number;
  h: number;
  cy: number;
  r: number;
  /** Where the curtain's rail starts (x), just inside the left edge of the view. */
  left: number;
}

/** The window you sit at, sized to the screen (see layout.ts). */
export function windowDims(fovDeg: number, aspect: number): WindowDims {
  const s = windowShape(aspect);
  const tanV = Math.tan(THREE.MathUtils.degToRad(fovDeg / 2));
  const edgeL = -(D - 0.05) * tanV * aspect;
  return { w: s.w, h: s.h, cy: s.cy, r: s.r, left: Math.max(edgeL + 0.015, -s.w / 2 - 0.1) };
}

/** A rounded rectangle, for the window's opening and its frame. */
export function roundedRect(w: number, h: number, r: number, cx = 0, cy = 0) {
  const s = new THREE.Shape();
  const x = cx - w / 2;
  const y = cy - h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/** A rounded-rectangle hole cut the other way round (for rings). */
function holeOf(w: number, h: number, r: number, cy: number) {
  const s = roundedRect(w, h, r, 0, cy);
  return new THREE.Path(s.getPoints(12));
}

/**
 * The carriage's materials: cream-painted wall panels, wood-grain laminate,
 * brushed aluminium, rubber, the glass, woven curtains, moquette and linen,
 * and a brass plate with the car and seat.
 */
export function windowMaterials(k: SceneKit, carriage: CarriageId, backlight?: ClothBacklight, plate: [string, string] = ["NOCTURNE", "CAR 07 · 12A"]) {
  const { std, tex, kit, nv, track } = k;
  const clothMap = tex(ct.curtainFabric());
  const clothRelief = kit.relief("fabric", [9, 8]);
  const glass = track(glassMaterial());
  glass.uniforms.tReflect.value = tex(ct.cabinReflection());
  const panel = tex(ct.creamPanel(), [1, 1]);
  panel.wrapS = panel.wrapT = THREE.RepeatWrapping;
  const woodMap = (base: string, seed: number, repeat: [number, number]) => {
    const t = tex(ct.woodGrain(base, seed), repeat);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  };
  return {
    /** Upper wall: one texture tile is 1.2 m wide (UVs are set in metres by the builders). */
    wall: std({ map: panel, roughness: 0.78, normalMap: kit.relief("plaster", [3, 3]), normalScale: nv(0.08) }, 0.2),
    lower: std({ map: woodMap("#6a4a31", 21, [1, 1]), roughness: 0.55, normalMap: kit.relief("wood", [2, 2]), normalScale: nv(0.15) }, 0.25),
    sill: std({ map: woodMap("#4a3121", 34, [1, 1]), roughness: 0.38, metalness: 0.0, normalMap: kit.relief("wood", [3, 1]), normalScale: nv(0.12) }),
    frame: std({ color: 0xc4c7c3, roughness: 0.42, metalness: 0.25, normalMap: kit.relief("brushed", [40, 40]), normalScale: nv(0.05) }),
    trim: std({ color: 0x9da19e, roughness: 0.36, metalness: 0.3, normalMap: kit.relief("brushed", [40, 4]), normalScale: nv(0.06) }),
    rubber: std({ color: 0x141414, roughness: 0.92, metalness: 0 }),
    table: std({ map: woodMap("#5a3d27", 55, [1, 1]), roughness: 0.42, normalMap: kit.relief("wood", [2, 1]), normalScale: nv(0.12) }),
    brass: std({ map: tex(ct.plaque(plate[0], plate[1])), roughness: 0.4, metalness: 0.45 }),
    moquette: std({ map: tex(ct.moquette(carriage === "tunnel" ? "#5a3a2a" : carriage === "moon" ? "#3a4058" : "#2f4a3a"), [6, 6]), roughness: 0.95, normalMap: kit.relief("fabric", [14, 14]), normalScale: nv(0.6) }, 0.4),
    linen: std({ color: 0xe6ded0, roughness: 0.9, normalMap: kit.relief("fabric", [10, 10]), normalScale: nv(0.35) }),
    shade: track(new THREE.MeshStandardMaterial({ color: 0xfff1d8, emissive: lin(1, 0.78, 0.5), emissiveIntensity: 0.45, roughness: 0.6 })),
    glass,
    /** The curtain at your own window, lit through by what's outside when `backlight` is given. */
    cloth: track(clothMaterial({ color: CURTAIN_COLOR[carriage], map: clothMap, normalMap: clothRelief, backlight })),
    /** Every other window's curtain. */
    plainCloth: track(clothMaterial({ color: CURTAIN_COLOR[carriage], map: clothMap, normalMap: clothRelief })),
  };
}
export type WindowMaterials = ReturnType<typeof windowMaterials>;

/** UVs in metres (u along x, v along y), divided by the texture tile size. */
function metreUV(g: THREE.BufferGeometry, tileW: number, tileH: number, offX = 0, offY = 0) {
  const p = g.attributes.position as THREE.BufferAttribute;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    uv[i * 2] = (p.getX(i) + offX) / tileW;
    uv[i * 2 + 1] = (p.getY(i) + offY) / tileH;
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return g;
}

/** Where the sill's top sits, below the glass (the wall splits there: cream above, wood below). */
export const sillTopOf = (d: WindowDims) => d.cy - d.h / 2 - 0.05;

/**
 * The upper wall with the window cut out of it, at the wall plane (z = −D),
 * UV'd in metres so its panel joints fall 60 cm apart. `span` is how far it
 * reaches either side.
 */
export function upperWall(d: WindowDims, span = 3) {
  const y0 = sillTopOf(d) - 0.03;
  const s = new THREE.Shape([new THREE.Vector2(-span, y0), new THREE.Vector2(span, y0), new THREE.Vector2(span, 2.5), new THREE.Vector2(-span, 2.5)]);
  s.holes.push(new THREE.Path(roundedRect(d.w + 0.03, d.h + 0.03, d.r + 0.015, 0, d.cy).getPoints(12)));
  return metreUV(new THREE.ShapeGeometry(s, 12), 1.2, 1.2, 0.3, 0);
}

type PartsMats = Omit<Partial<WindowMaterials>, "glass"> & Pick<WindowMaterials, "frame" | "table"> & { glass: THREE.Material | null };

/**
 * Everything at the window except the upper wall it's cut into, in eye space
 * (eyes at the origin, the glass ahead at −z): the aluminium frame with its
 * bevel, the rubber seal and the depth of the opening, the glass, the wood
 * sill with its metal nosing, the laminate panel below, the fold-down table
 * and the curtain rail. With `seat`, also what's round your own seat: the
 * brass plate with the car and seat.
 * Returns the options for the curtain that hangs there.
 */
export function windowParts(d: WindowDims, mats: PartsMats, opts: { seat?: boolean } = {}) {
  const { w, h, cy, r, left } = d;
  const group = new THREE.Group();
  const geos: THREE.BufferGeometry[] = [];
  const add = (geo: THREE.BufferGeometry, m: THREE.Material | undefined, x: number, y: number, z: number) => {
    geos.push(geo);
    if (!m) return null;
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  };
  const ring = (ow: number, oh: number, or: number, iw: number, ih: number, ir: number, depth: number, bevel: number) => {
    const s = roundedRect(ow, oh, or, 0, cy);
    s.holes.push(holeOf(iw, ih, ir, cy));
    return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 3, curveSegments: 14 });
  };
  // The opening's depth: a sleeve from the wall back to the glass, so the window has thickness.
  add(ring(w + 0.03, h + 0.03, r + 0.015, w, h, r, 0.075, 0), mats.trim ?? mats.frame, 0, 0, -D - 0.085);
  // The aluminium frame, proud of the wall, with a bevelled edge.
  add(ring(w + 0.085, h + 0.085, r + 0.042, w + 0.018, h + 0.018, r + 0.009, 0.026, 0.008), mats.frame, 0, 0, -D - 0.012);
  // The rubber seal between frame and glass.
  add(ring(w + 0.018, h + 0.018, r + 0.009, w - 0.006, h - 0.006, r - 0.003, 0.02, 0), mats.rubber, 0, 0, -D - 0.07);
  // The glass, set back in the opening.
  const glass = mats.glass ? add(new THREE.PlaneGeometry(w, h), mats.glass, 0, cy, -D - 0.058) : null;

  // Sill: dark wood with a rounded front, a metal nosing along its edge.
  const sillTop = sillTopOf(d);
  const sillW = w + 0.3;
  const sillShape = new THREE.Shape();
  sillShape.moveTo(-0.03, 0);
  sillShape.lineTo(0.15, 0);
  sillShape.quadraticCurveTo(0.17, 0, 0.17, -0.014);
  sillShape.quadraticCurveTo(0.17, -0.028, 0.15, -0.028);
  sillShape.lineTo(-0.03, -0.028);
  sillShape.lineTo(-0.03, 0);
  const sill = new THREE.ExtrudeGeometry(sillShape, { depth: sillW, bevelEnabled: false, curveSegments: 6 });
  sill.rotateY(-Math.PI / 2);
  sill.translate(sillW / 2, 0, 0);
  // Its UVs run along the grain.
  metreUV(sill, 0.9, 0.15);
  const sillMesh = add(sill, mats.sill ?? mats.table, 0, sillTop, -D);
  if (sillMesh) sillMesh.rotation.set(0, 0, 0);
  add(new THREE.BoxGeometry(sillW + 0.004, 0.01, 0.012), mats.trim ?? mats.frame, 0, sillTop - 0.004, -D + 0.172);

  // The laminate panel under the window (a bay panel, so neighbouring windows don't overlap).
  const lowerW = Math.min(w + 0.9, 2.1);
  const lower = metreUV(new THREE.BoxGeometry(lowerW, 2.2, 0.02), 1.2, 0.6, lowerW / 2, 0);
  add(lower, mats.lower, 0, sillTop - 0.03 - 1.1, -D + 0.004);
  // A thin aluminium bead where cream meets wood, and one at each side of the bay panel.
  add(new THREE.BoxGeometry(lowerW, 0.012, 0.016), mats.trim ?? mats.frame, 0, sillTop - 0.031, -D + 0.01);
  for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.012, 2.2, 0.018), mats.trim ?? mats.frame, (sx * lowerW) / 2, sillTop - 0.03 - 1.1, -D + 0.01);

  // The fold-down table on its two brackets.
  const tY = sillTop - 0.15;
  add(new THREE.BoxGeometry(0.46, 0.022, 0.25), mats.table, 0, tY, -D + 0.145);
  add(new THREE.BoxGeometry(0.464, 0.026, 0.012), mats.trim ?? mats.frame, 0, tY, -D + 0.27);
  for (const bx of [-0.17, 0.17]) {
    const bracket = add(new THREE.BoxGeometry(0.018, 0.16, 0.018), mats.trim ?? mats.frame, bx, tY - 0.075, -D + 0.08);
    if (bracket) bracket.rotation.x = 0.75;
  }

  // The curtain hangs straight from a rail over the window, gathered at the left.
  const cz = -D + 0.05;
  const railY = cy + h / 2 + 0.11;
  const rail = add(new THREE.CylinderGeometry(0.006, 0.006, w / 2 + 0.08 - left, 8), mats.frame, (left + w / 2 + 0.08) / 2, railY + 0.012, cz + 0.035);
  if (rail) rail.rotation.z = Math.PI / 2;
  for (const bx of [left + 0.02, w / 2 + 0.06]) add(new THREE.BoxGeometry(0.02, 0.05, 0.09), mats.trim ?? mats.frame, bx, railY + 0.02, cz - 0.005);

  if (opts.seat) {
    // The brass plate over the window's right corner, under the rail: car and seat.
    // (On a phone held upright the glass runs off the screen: keep the plate on it.)
    const viewRight = (-left * D) / (D - 0.05);
    add(new THREE.BoxGeometry(0.11, 0.041, 0.004), mats.brass, Math.min(w / 2 - 0.1, viewRight - 0.07), cy + h / 2 + 0.072, -D + 0.002);
  }

  const curtain: Omit<CurtainOptions, "cover"> = {
    left,
    railY,
    length: railY - (sillTop + 0.02),
    width: w / 2 + 0.04 - left,
    parked: Math.min(0.1, (w / 2 + 0.04 - left) * 0.12),
    z: cz,
    wallGap: 0.045,
    floorY: sillTop + 0.015,
    hooks: mats.frame,
  };
  return { group, glass, curtain, dispose: () => geos.forEach((g) => g.dispose()) };
}

/**
 * The light in your corner of the carriage, in eye space: the carriage
 * light behind you, the rack lamp over your seat, a little spill through the
 * window from outside, and the faint fill of the whole car.
 */
export function cabinLights(tint: THREE.Color) {
  const group = new THREE.Group();
  const main = new THREE.PointLight(tint, 3.2, 5, 2);
  main.position.set(0.3, 1.45, 0.25);
  const sweep = new THREE.PointLight(lin(1, 0.7, 0.4), 0, 5, 2);
  sweep.position.set(0, 0.4, -1.6);
  const fill = new THREE.HemisphereLight(lin(0.05, 0.05, 0.05), lin(0.01, 0.01, 0.01), 1);
  // The luggage-rack lamp over your seat: warm, soft, from above and behind.
  const reading = new THREE.PointLight(lin(1, 0.8, 0.55), 0.18, 2.6, 2);
  reading.position.set(0.15, 0.85, 0.15);
  // The fill takes its direction from where it sits, so it goes in the scene itself, not in `group`.
  group.add(main, sweep, reading);
  /** A standing platform lights the carriage through the glass. */
  const platformSpill = () => {
    sweep.position.set(0, 1.2, -2.2);
    sweep.color.setRGB(1, 0.9, 0.75);
    return 1.6;
  };
  return { group, main, sweep, fill, reading, platformSpill };
}
