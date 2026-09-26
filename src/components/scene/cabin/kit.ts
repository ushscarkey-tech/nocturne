import * as THREE from "three";
import { texture } from "../platform/textures";
import { surfaceKit, withCavity } from "../surfaces";

export const lin = (r: number, g: number, b: number) => new THREE.Color().setRGB(r, g, b);

/**
 * The little helpers a scene builds with, shared so the ride and the walk
 * onto the train make the same things the same way. Everything made here
 * is handed to `track`, which disposes of it with the scene.
 */
export function sceneKit(track: <T extends { dispose(): void }>(x: T) => T) {
  const kit = surfaceKit(track);
  const tex = (c: HTMLCanvasElement, repeat?: [number, number]) => track(texture(c, { repeat }));
  const std = (p: THREE.MeshStandardMaterialParameters, cavity = 0) => {
    const m = track(new THREE.MeshStandardMaterial(p));
    return cavity ? withCavity(m, cavity) : m;
  };
  const lambert = (p: THREE.MeshLambertMaterialParameters) => track(new THREE.MeshLambertMaterial(p));
  const basic = (p: THREE.MeshBasicMaterialParameters) => track(new THREE.MeshBasicMaterial(p));
  const nv = (x: number, y = x) => new THREE.Vector2(x, y);
  const put = <T extends THREE.Object3D>(parent: THREE.Object3D, o: T, x = 0, y = 0, z = 0) => {
    o.position.set(x, y, z);
    parent.add(o);
    return o;
  };
  const mesh = (parent: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material | THREE.Material[], x = 0, y = 0, z = 0) =>
    put(parent, new THREE.Mesh(track(geo), m), x, y, z);
  const box = (parent: THREE.Object3D, w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number) =>
    mesh(parent, new THREE.BoxGeometry(w, h, d), m, x, y, z);
  /** Many copies of one thing in one draw: `at` gives each copy's position (and optional y rotation). */
  const many = (parent: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material, at: [number, number, number, number?][]) => {
    const inst = new THREE.InstancedMesh(track(geo), m, at.length);
    const o = new THREE.Object3D();
    at.forEach(([x, y, z, ry = 0], i) => {
      o.position.set(x, y, z);
      o.rotation.set(0, ry, 0);
      o.updateMatrix();
      inst.setMatrixAt(i, o.matrix);
    });
    inst.computeBoundingSphere();
    parent.add(inst);
    return inst;
  };
  return { track, kit, tex, std, lambert, basic, nv, put, mesh, box, many };
}

export type SceneKit = ReturnType<typeof sceneKit>;
