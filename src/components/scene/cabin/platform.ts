import * as THREE from "three";
import * as tx from "../platform/textures";
import { lin, type SceneKit } from "./kit";

/** Metres, relative to a seated traveller's eyes with the window ahead (−z). */
export const PT = -1.25; // platform top: level with the carriage floor
export const PLAT_LEN = 150;
/** The platform's edge, and the eye's distance from the window glass. */
export const EDGE = -0.95;

/**
 * The station platform beside the train, as seen from a seat by the
 * window: concrete, the edge and its tactile strip, the roof on its
 * posts, lamps, the boarded station building behind with a bench or two,
 * a vending machine, the name board facing the train and a hanging clock.
 * Built in one place so the walk onto the train and the ride see the
 * very same platform. Repeated parts are instanced (a few draws, not dozens).
 */
export function buildPlatform(k: SceneKit, stationName: string) {
  const { std, lambert, basic, tex, kit, nv, mesh, box, put, many } = k;
  const plat = new THREE.Group();
  const half = PLAT_LEN / 2;
  const depth = 6.2 + EDGE; // edge to the building
  mesh(plat, new THREE.BoxGeometry(PLAT_LEN, 0.3, depth), std({ map: tex(tx.concrete(), [PLAT_LEN / 2.6, 2]), roughness: 0.6, roughnessMap: kit.roughness(0.8, 0.15, 17, [PLAT_LEN / 3, 2]), normalMap: kit.relief("concrete", [PLAT_LEN / 2, 2.5]), normalScale: nv(0.6) }, 0.5), 0, PT - 0.15, EDGE - depth / 2);
  box(plat, PLAT_LEN, 0.12, 0.4, std({ color: 0x8c8a82, roughness: 0.8, normalMap: kit.relief("concrete", [PLAT_LEN / 2, 0.3]), normalScale: nv(0.6) }, 0.5), 0, PT - 0.05, EDGE - 0.2);
  box(plat, PLAT_LEN, 1.2, 0.2, std({ color: 0x1e1d1b, roughness: 0.95, normalMap: kit.relief("rough", [PLAT_LEN / 2, 1]) }, 0.4), 0, PT - 0.75, EDGE - 0.25);
  const line = mesh(plat, new THREE.PlaneGeometry(PLAT_LEN, 0.08), lambert({ color: 0xc9c3b2 }), 0, PT + 0.012, EDGE - 0.1);
  line.rotation.x = -Math.PI / 2;
  const tactile = mesh(plat, new THREE.PlaneGeometry(PLAT_LEN, 0.3), lambert({ color: 0x8a6d1c }), 0, PT + 0.012, EDGE - 0.65);
  tactile.rotation.x = -Math.PI / 2;
  const roof = mesh(plat, new THREE.PlaneGeometry(PLAT_LEN, 4.6), std({ map: tex(tx.roofSheet(), [PLAT_LEN / 0.24, 1]), roughness: 0.55, metalness: 0.25, normalMap: kit.relief("ribs", [PLAT_LEN / 0.96, 1]), normalScale: nv(0.6) }, 0.3), 0, PT + 3.2, -3.95);
  roof.rotation.x = Math.PI / 2;
  // The roof sheet's ribs should run across the platform here.
  ((roof.material as THREE.MeshStandardMaterial).map as THREE.Texture).rotation = Math.PI / 2;
  box(plat, PLAT_LEN, 0.4, 0.07, lambert({ color: 0xb4ae9c }), 0, PT + 3.1, -1.66);
  const paint = std({ color: 0xb4ae9c, roughness: 0.6, normalMap: kit.relief("plaster", [1, 2]), normalScale: nv(0.4) }, 0.35);
  const beam = std({ color: 0x4d514b, roughness: 0.55, metalness: 0.3, normalMap: kit.relief("brushed", [2, 2]), normalScale: nv(0.4) });
  const posts: [number, number, number][] = [];
  const beams: [number, number, number][] = [];
  for (let x = -half + 4.5; x < half; x += 9) {
    posts.push([x, PT + 1.6, -4.8]);
    beams.push([x, PT + 3.08, -3.95]);
  }
  many(plat, new THREE.CylinderGeometry(0.085, 0.095, 3.2, 12), paint, posts);
  many(plat, new THREE.BoxGeometry(0.12, 0.2, 4.6), beam, beams);
  const tubeMat = basic({ color: lin(2.6, 2.35, 1.95) });
  const housing = lambert({ color: 0xc9c8c0 });
  const tubeGeo = new THREE.CylinderGeometry(0.022, 0.022, 1.24, 8);
  tubeGeo.rotateZ(Math.PI / 2);
  const housings: [number, number, number][] = [];
  const tubes: [number, number, number][] = [];
  for (let x = -half + 2.25; x < half; x += 4.5) {
    housings.push([x, PT + 3.02, -3.0]);
    tubes.push([x, PT + 2.96, -3.0]);
  }
  many(plat, new THREE.BoxGeometry(1.36, 0.07, 0.2), housing, housings);
  many(plat, tubeGeo, tubeMat, tubes);
  const lights = [-6.75, -2.25, 2.25, 6.75].map((x) => put(plat, new THREE.PointLight(lin(1, 0.88, 0.72), 9, 11, 2), x, PT + 2.8, -3.0));
  // The building behind: painted boards, two lit windows, a door.
  const wall = mesh(plat, new THREE.PlaneGeometry(PLAT_LEN, 3.4), std({ map: tex(tx.woodWall(), [PLAT_LEN / 3, 1]), roughness: 0.8, normalMap: kit.relief("boards", [(PLAT_LEN / 3) * 1.8, 1]), normalScale: nv(0.9) }, 0.5), 0, PT + 1.7, -6.2);
  wall.name = "wall";
  const winTex = tex(tx.windowGlow());
  many(plat, new THREE.PlaneGeometry(1.5, 1.1), basic({ map: winTex, color: lin(1.4, 1.3, 1.2) }), [-9, -5, 11, 15].map((x) => [x, PT + 1.55, -6.18]));
  const benchMat = lambert({ color: 0x3f6a70 });
  const benches: [number, number, number][] = [-3.6, 13].map((x) => [x, 0, -5.7]);
  many(plat, new THREE.BoxGeometry(1.5, 0.06, 0.42).translate(0, PT + 0.44, 0), benchMat, benches);
  many(plat, new THREE.BoxGeometry(1.5, 0.4, 0.05).translate(0, PT + 0.7, -0.2), benchMat, benches);
  many(plat, new THREE.BoxGeometry(1.4, 0.05, 0.05).translate(0, PT + 0.2, 0), beam, benches);
  const vending = mesh(plat, new THREE.BoxGeometry(1, 1.84, 0.72), std({ color: 0xdfe2de, roughness: 0.35, metalness: 0.15 }), 3.4, PT + 0.92, -5.8);
  mesh(plat, new THREE.PlaneGeometry(0.96, 1.8), basic({ map: tex(tx.vendingFace("#dfe2de", 61)), color: lin(1.2, 1.25, 1.3) }), 3.4, PT + 0.92, -5.43);
  vending.name = "vending";
  // The station name board, facing the train.
  let signCanvas = tx.stationSign(stationName || "NOCTURNE", tx.pageFonts());
  const signTex = tex(signCanvas);
  box(plat, 2.08, 0.6, 0.1, lambert({ color: 0x2b2a26 }), 0, PT + 1.62, -4.35);
  mesh(plat, new THREE.PlaneGeometry(2, 0.5), basic({ map: signTex, color: lin(1, 1, 0.96) }), 0, PT + 1.62, -4.29);
  many(plat, new THREE.BoxGeometry(0.06, 1.35, 0.06), beam, [-0.9, 0.9].map((dx) => [dx, PT + 0.67, -4.35]));
  const drawSign = (name: string, end: boolean) => {
    signCanvas = tx.stationSign(name || "NOCTURNE", tx.pageFonts(), end ? "END OF THE LINE" : "NOCTURNE LINE");
    (signTex.image as HTMLCanvasElement).getContext("2d")!.drawImage(signCanvas, 0, 0);
    signTex.needsUpdate = true;
  };
  // The clock, hanging from the roof.
  const clockCanvas = tx.clockCanvas();
  tx.drawClock(clockCanvas, new Date());
  const clockTex = tex(clockCanvas);
  let clockMinute = new Date().getMinutes();
  mesh(plat, new THREE.CylinderGeometry(0.25, 0.25, 0.07, 32), lambert({ color: 0x2b2a26 }), 3.2, PT + 2.5, -3.4).rotation.x = Math.PI / 2;
  mesh(plat, new THREE.CircleGeometry(0.23, 40), lambert({ map: clockTex, emissive: lin(0.25, 0.25, 0.24), emissiveMap: clockTex }), 3.2, PT + 2.5, -3.36);
  box(plat, 0.03, 0.62, 0.03, beam, 3.2, PT + 2.9, -3.4);
  /** Keep the clock right (cheap: redraws once a minute). */
  const tick = (now: Date) => {
    const minute = now.getMinutes();
    if (minute === clockMinute) return;
    clockMinute = minute;
    tx.drawClock(clockCanvas, now);
    clockTex.needsUpdate = true;
  };
  return { group: plat, lights, drawSign, tick, half };
}
