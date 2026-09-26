import * as THREE from "three";
import type { CarriageId } from "@/core/types";
import { CURTAIN_COLOR, clothMaterial, type ClothBacklight } from "./cloth";
import type { CurtainOptions } from "./curtain";
import { lin, type SceneKit } from "./kit";
import { glassMaterial } from "./shaders";
import * as ct from "./textures";

/** From the eyes to the window glass, seated. */
export const D = 0.7;

/** The ride's lens: wide on a phone held upright, narrower on a wide screen. */
export const rideFov = (aspect: number) => (aspect < 0.8 ? 62 : aspect < 1.2 ? 56 : 48);

export interface WindowDims {
  /** The glass: width, height, how far its centre sits above the eyes, corner radius. */
  w: number;
  h: number;
  cy: number;
  r: number;
  /** Where the curtain's rail starts (x), just inside the left edge of the view. */
  left: number;
}

/**
 * The window you sit at, sized to the screen: nearly the full width of
 * the view and about three quarters of its height, a little above your eyes.
 */
export function windowDims(fovDeg: number, aspect: number): WindowDims {
  const tanV = Math.tan(THREE.MathUtils.degToRad(fovDeg / 2));
  const halfH = D * tanV;
  const halfW = halfH * aspect;
  const w = Math.min(Math.max(halfW * 2 * 0.84, 0.95), 1.3);
  const h = Math.min(halfH * 2 * 0.74, 0.86);
  const cy = halfH * 0.1;
  const edgeL = -(D - 0.05) * tanV * aspect;
  return { w, h, cy, r: 0.08, left: Math.max(edgeL + 0.015, -w / 2 - 0.1) };
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

/** The carriage's materials: moulded wall panel, brushed aluminium, the table, the glass, woven curtains. */
export function windowMaterials(k: SceneKit, carriage: CarriageId, backlight?: ClothBacklight) {
  const { std, tex, kit, nv, track } = k;
  const clothMap = tex(ct.curtainFabric());
  const clothRelief = kit.relief("fabric", [9, 8]);
  const glass = track(glassMaterial());
  glass.uniforms.tReflect.value = tex(ct.cabinReflection());
  return {
    wall: std({ map: tex(ct.wallPanel(), [1, 1]), roughness: 0.85, normalMap: kit.relief("fabric", [9, 9]), normalScale: nv(0.12) }),
    frame: std({ color: 0xa4a9a8, roughness: 0.38, metalness: 0.5 }),
    table: std({ color: 0x2a2f31, roughness: 0.4 }),
    glass,
    /** The curtain at your own window, lit through by what's outside when `backlight` is given. */
    cloth: track(clothMaterial({ color: CURTAIN_COLOR[carriage], map: clothMap, normalMap: clothRelief, backlight })),
    /** Every other window's curtain. */
    plainCloth: track(clothMaterial({ color: CURTAIN_COLOR[carriage], map: clothMap, normalMap: clothRelief })),
  };
}
export type WindowMaterials = ReturnType<typeof windowMaterials>;

/**
 * Everything at the window except the wall it's cut into, in eye space
 * (eyes at the origin, the glass ahead at −z): the aluminium frame, the
 * glass, sill, fold-down table and the curtain rail. Returns the options
 * for the curtain that hangs there.
 */
export function windowParts(d: WindowDims, mats: { frame: THREE.Material; table: THREE.Material; glass: THREE.Material | null }) {
  const { w, h, cy, r, left } = d;
  const group = new THREE.Group();
  const geos: THREE.BufferGeometry[] = [];
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) => {
    geos.push(geo);
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  };
  // The aluminium frame, set into the wall.
  const ring = roundedRect(w + 0.1, h + 0.1, r + 0.05, 0, cy);
  ring.holes.push(roundedRect(w, h, r, 0, cy));
  add(new THREE.ExtrudeGeometry(ring, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.008, bevelSegments: 2, curveSegments: 12 }), mats.frame, 0, 0, -D - 0.04);
  // The glass, a little behind the frame's face.
  const glass = mats.glass ? add(new THREE.PlaneGeometry(w, h), mats.glass, 0, cy, -D - 0.035) : null;
  // Sill and the little fold-down table.
  const bottom = cy - h / 2;
  add(new THREE.BoxGeometry(w + 0.24, 0.025, 0.14), mats.frame, 0, bottom - 0.06, -D + 0.06);
  add(new THREE.BoxGeometry(0.44, 0.022, 0.26), mats.table, 0, bottom - 0.16, -D + 0.14);
  // The curtain hangs straight from a rail over the window, gathered at the left.
  const cz = -D + 0.05;
  const railY = cy + h / 2 + 0.11;
  const rail = add(new THREE.CylinderGeometry(0.006, 0.006, w / 2 + 0.08 - left, 8), mats.frame, (left + w / 2 + 0.08) / 2, railY + 0.012, cz + 0.035);
  rail.rotation.z = Math.PI / 2;
  const span = w / 2 + 0.04 - left;
  const curtain: Omit<CurtainOptions, "cover"> = {
    left,
    railY,
    length: railY - (bottom - 0.03),
    width: span,
    parked: Math.min(0.1, span * 0.12),
    z: cz,
    wallGap: 0.045,
    floorY: bottom - 0.035,
    hooks: mats.frame,
  };
  return { group, glass, curtain, dispose: () => geos.forEach((g) => g.dispose()) };
}

/**
 * The light in your corner of the carriage, in eye space: the carriage
 * light behind you, a small reading light by the curtain, a little spill
 * through the window from outside, and the faint fill of the whole car.
 */
export function cabinLights(tint: THREE.Color) {
  const group = new THREE.Group();
  const main = new THREE.PointLight(tint, 3.2, 5, 2);
  main.position.set(0.3, 1.45, 0.25);
  const sweep = new THREE.PointLight(lin(1, 0.7, 0.4), 0, 5, 2);
  sweep.position.set(0, 0.4, -1.6);
  const fill = new THREE.HemisphereLight(lin(0.05, 0.05, 0.05), lin(0.01, 0.01, 0.01), 1);
  const reading = new THREE.PointLight(lin(1, 0.86, 0.66), 0.9, 1.8, 2);
  reading.position.set(-0.35, 0.55, -0.15);
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
