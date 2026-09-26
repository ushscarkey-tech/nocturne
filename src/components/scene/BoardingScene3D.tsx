"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { CarriageId } from "@/core/types";
import * as bt from "./boarding/textures";
import { describe, floatSupport, pickTarget, sceneLog } from "./gl";
import { texture } from "./platform/textures";
import { surfaceKit } from "./surfaces";

export type BoardingStage = "waiting" | "reading" | "opening" | "entering";

export interface BoardingSceneProps {
  stage: BoardingStage;
  carriage: CarriageId;
  /** The car number painted beside the door. */
  car: string;
  className?: string;
  /** This device can't draw it: the caller shows the 2D doors. */
  onFail?: () => void;
  /** The walk is over: you are in your seat. */
  onInside?: () => void;
}

// Metres. The platform runs along x; the train's side is at z = SIDE, the
// platform toward +z. Floor of the platform at y = 0.
const SIDE = -0.32;
const CAR_W = 2.8;
const FAR = SIDE - CAR_W;
const FLOOR = 0.1;
const DOOR_W = 1.3;
const DOOR_H = 2.02;
const CEIL = FLOOR + 2.28;
const DOOR_SLIDE = 1.1;
const WALK = 4.6;

const STRIPE: Record<CarriageId, number> = { rain: 0x4c6a8e, quiet: 0x55786a, tunnel: 0x9a6431, moon: 0xb69a62 };
/** Seat moquette base colour per carriage (sRGB 0–255). */
const SEAT: Record<CarriageId, [number, number, number]> = { rain: [58, 78, 96], quiet: [68, 92, 76], tunnel: [104, 72, 50], moon: [78, 84, 100] };

const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const lin = (r: number, g: number, b: number) => new THREE.Color().setRGB(r, g, b);

/**
 * Boarding, in 3D: you stand on the platform before tonight's carriage.
 * The ticket touches the reader, the door lamp comes on, the doors slide
 * into the body and you walk in, down the aisle, and sit by the window —
 * where the ride begins.
 */
export default function BoardingScene3D({ stage, carriage, car, className = "", onFail, onInside }: BoardingSceneProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef({ stage, at: 0 });
  const failRef = useRef(onFail);
  const insideRef = useRef(onInside);

  useEffect(() => {
    if (stageRef.current.stage !== stage) stageRef.current = { stage, at: performance.now() };
    failRef.current = onFail;
    insideRef.current = onInside;
  }, [stage, onFail, onInside]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const log = sceneLog("boarding");
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    } catch (err) {
      log.note(`no WebGL: ${String(err)}`);
      failRef.current?.();
      return () => log.dispose();
    }
    describe(renderer, log);

    const setup = (): (() => void) => {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      renderer.setClearColor(0x05070b, 1);
      mount.appendChild(renderer.domElement);
      Object.assign(renderer.domElement.style, { display: "block", width: "100%", height: "100%" });

      const disposables: { dispose(): void }[] = [];
      const track = <T extends { dispose(): void }>(x: T) => {
        disposables.push(x);
        return x;
      };
      const mat = (p: THREE.MeshStandardMaterialParameters) => track(new THREE.MeshStandardMaterial(p));
      const glow = (color: number, intensity: number) => track(new THREE.MeshStandardMaterial({ color: 0x000000, emissive: color, emissiveIntensity: intensity }));
      const box = (w: number, h: number, d: number) => track(new THREE.BoxGeometry(w, h, d));
      const rounded = (w: number, h: number, d: number, r: number) => track(new RoundedBoxGeometry(w, h, d, 3, r));
      const tex = (c: HTMLCanvasElement, repeat?: [number, number]) => track(texture(c, { repeat }));
      const kit = surfaceKit(track);
      const floatOK = floatSupport(renderer);

      const scene = new THREE.Scene();
      scene.fog = new THREE.FogExp2(0x05070b, 0.045);
      const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 80);

      // ================================================================ PLATFORM
      const concrete = mat({ map: tex(bt.slabs(), [10, 2.25]), normalMap: kit.relief("concrete", [14, 3]), roughness: 0.86 });
      const platform = new THREE.Mesh(track(new THREE.PlaneGeometry(40, 9)), concrete);
      platform.rotation.x = -Math.PI / 2;
      platform.position.set(0, 0, SIDE + 0.12 + 4.5);
      scene.add(platform);
      const edge = new THREE.Mesh(track(new THREE.PlaneGeometry(40, 0.08)), mat({ color: 0xd8d2c0, roughness: 0.6 }));
      edge.rotation.x = -Math.PI / 2;
      edge.position.set(0, 0.002, SIDE + 0.17);
      scene.add(edge);
      const tactileMat = mat({ map: tex(bt.tactile(), [10, 1]), bumpMap: tex(bt.tactile(true), [10, 1]), bumpScale: 2, roughness: 0.7 });
      tactileMat.bumpMap!.colorSpace = THREE.NoColorSpace;
      const tactile = new THREE.Mesh(track(new THREE.PlaneGeometry(40, 0.32)), tactileMat);
      tactile.rotation.x = -Math.PI / 2;
      tactile.position.set(0, 0.003, SIDE + 0.75);
      scene.add(tactile);
      // Below the edge, the dark gap down to the track.
      const drop = new THREE.Mesh(box(40, 1.2, 0.05), mat({ color: 0x0c0d0f, roughness: 1 }));
      drop.position.set(0, -0.6, SIDE + 0.12);
      scene.add(drop);
      // The canopy and its tubes.
      const canopy = new THREE.Mesh(track(new THREE.PlaneGeometry(40, 9)), mat({ color: 0x15191d, roughness: 0.9 }));
      canopy.rotation.x = Math.PI / 2;
      canopy.position.set(0, 3.7, SIDE + 4.2);
      scene.add(canopy);
      const tubeMat = glow(0xfff1d6, 3.2);
      for (const z of [0.9, 3.6]) {
        for (let x = -12; x <= 12; x += 4) {
          const tube = new THREE.Mesh(box(1.6, 0.05, 0.08), tubeMat);
          tube.position.set(x, 3.62, z);
          scene.add(tube);
        }
      }
      for (const x of [-4, 0, 4]) {
        const l = new THREE.PointLight(lin(1, 0.9, 0.74), 3.6, 9, 1.6);
        l.position.set(x, 3.4, 1.4);
        scene.add(l);
      }
      const column = mat({ color: 0x22272c, roughness: 0.6, metalness: 0.3 });
      for (const x of [-6.5, 6.5]) {
        const c = new THREE.Mesh(box(0.28, 3.7, 0.28), column);
        c.position.set(x, 1.85, SIDE + 3.2);
        scene.add(c);
      }
      scene.add(new THREE.HemisphereLight(lin(0.12, 0.13, 0.16), lin(0.02, 0.02, 0.02), 1));

      // ================================================================= CARRIAGE
      // ShapeGeometry UVs are metres; the textures are placed in metres too.
      const WINDOWS_X = [-6.6, -4.3, -2.0, 2.0, 4.3, 6.6];
      const paintMap = tex(bt.bodyPaint(WINDOWS_X, [-12, 12]));
      paintMap.repeat.set(1 / 24, 1 / 4.45);
      paintMap.offset.set(0.5, 1 / 4.45);
      // Stainless steel, satin-brushed along the car, like a Seoul subway car.
      const paint = mat({ map: paintMap, roughness: 0.4, metalness: floatOK ? 0.8 : 0.35 });
      const liningMap = tex(bt.lining(), [1, 1]);
      liningMap.repeat.set(1 / 4, 1 / (CEIL - FLOOR));
      liningMap.offset.set(0, -FLOOR / (CEIL - FLOOR));
      const inside = mat({ map: liningMap, roughness: 0.7, side: THREE.DoubleSide, normalMap: kit.relief("plaster", [0.5, 0.5]), normalScale: new THREE.Vector2(0.2, 0.2) });
      const plainInside = mat({ color: 0xa99d84, roughness: 0.8 });
      const trim = mat({ color: 0xb9bec0, roughness: 0.3, metalness: floatOK ? 0.85 : 0.35, normalMap: kit.relief("brushed", [2, 2]), normalScale: new THREE.Vector2(0.3, 0.3) });
      const stripeMat = mat({ color: STRIPE[carriage], roughness: 0.5, metalness: 0.2 });

      // A wall along x at z, with the door and windows cut out of it.
      const WINDOWS = WINDOWS_X;
      const wall = (z: number, material: THREE.Material, door: boolean) => {
        const s = new THREE.Shape([new THREE.Vector2(-12, -1), new THREE.Vector2(12, -1), new THREE.Vector2(12, 3.45), new THREE.Vector2(-12, 3.45)]);
        if (door) s.holes.push(new THREE.Path([new THREE.Vector2(-DOOR_W / 2, FLOOR), new THREE.Vector2(DOOR_W / 2, FLOOR), new THREE.Vector2(DOOR_W / 2, FLOOR + DOOR_H), new THREE.Vector2(-DOOR_W / 2, FLOOR + DOOR_H)]));
        for (const x of WINDOWS) {
          s.holes.push(new THREE.Path().absarc(x - 0.6, 1.95, 0.08, Math.PI, Math.PI / 2, true).absarc(x + 0.6, 1.95, 0.08, Math.PI / 2, 0, true).absarc(x + 0.6, 1.12, 0.08, 0, -Math.PI / 2, true).absarc(x - 0.6, 1.12, 0.08, -Math.PI / 2, -Math.PI, true));
        }
        const m = new THREE.Mesh(track(new THREE.ShapeGeometry(s, 6)), material);
        m.position.z = z;
        scene.add(m);
      };
      // Outer skin, the inner lining a hand's width behind it, and the far side.
      wall(SIDE, paint, true);
      wall(SIDE - 0.08, inside, true);
      wall(FAR, inside, false);
      // Roof edge, lower skirt and the carriage's colour.
      const skirt = new THREE.Mesh(box(24, 0.5, 0.06), paint);
      skirt.position.set(0, -0.2, SIDE - 0.02);
      scene.add(skirt);
      // The line colour: a band under the windows and a thin one above.
      for (const [y, h] of [
        [0.99, 0.1],
        [2.15, 0.035],
      ] as const) {
        for (const [x0, x1] of [
          [-12, -DOOR_W / 2 - 0.04],
          [DOOR_W / 2 + 0.04, 12],
        ]) {
          const band = new THREE.Mesh(box(x1 - x0, h, 0.012), stripeMat);
          band.position.set((x0 + x1) / 2, y, SIDE + 0.012);
          scene.add(band);
        }
      }
      // Pressed beads: raised horizontal ribs in the steel below the windows
      // and above them, stopping at the door; the window band stays smooth.
      const beadGeo = track(new THREE.CylinderGeometry(0.011, 0.011, 1, 10, 1, false, 0, Math.PI));
      const beadRows: [number, number, number][] = [];
      for (let y = 0.02; y <= 0.9; y += 0.055) beadRows.push([y, -12, 12]);
      for (let y = 2.26; y <= 3.05; y += 0.055) beadRows.push([y, -12, 12]);
      const beadSegs: [number, number, number][] = [];
      for (const [y, x0, x1] of beadRows) {
        // Below the door head, the doorway interrupts the bead.
        if (y < FLOOR + DOOR_H + 0.05) {
          beadSegs.push([y, x0, -DOOR_W / 2 - 0.06], [y, DOOR_W / 2 + 0.06, x1]);
        } else beadSegs.push([y, x0, x1]);
      }
      const beads = new THREE.InstancedMesh(beadGeo, paint, beadSegs.length);
      const m4 = new THREE.Matrix4();
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, Math.PI / 2));
      beadSegs.forEach(([y, x0, x1], i) => {
        m4.compose(new THREE.Vector3((x0 + x1) / 2, y, SIDE), q, new THREE.Vector3(1, x1 - x0, 1));
        beads.setMatrixAt(i, m4);
      });
      scene.add(beads);
      // The door frame.
      for (const x of [-DOOR_W / 2 - 0.02, DOOR_W / 2 + 0.02]) {
        const jamb = new THREE.Mesh(box(0.04, DOOR_H + 0.04, 0.1), trim);
        jamb.position.set(x, FLOOR + DOOR_H / 2, SIDE - 0.04);
        scene.add(jamb);
      }
      const lintel = new THREE.Mesh(box(DOOR_W + 0.08, 0.04, 0.1), trim);
      lintel.position.set(0, FLOOR + DOOR_H + 0.02, SIDE - 0.04);
      scene.add(lintel);
      const step = new THREE.Mesh(box(DOOR_W, 0.03, 0.22), trim);
      step.position.set(0, FLOOR - 0.015, SIDE + 0.02);
      scene.add(step);

      // The car number and the line's name, painted beside the door.
      const label = (text: string, w: number, h: number, font: string, color: string) => {
        const c = document.createElement("canvas");
        c.width = Math.round(w * 400);
        c.height = Math.round(h * 400);
        const g = c.getContext("2d")!;
        g.fillStyle = color;
        g.font = font;
        g.textBaseline = "middle";
        g.fillText(text, 4, c.height / 2);
        const t = track(new THREE.CanvasTexture(c));
        t.colorSpace = THREE.SRGBColorSpace;
        const m = new THREE.Mesh(track(new THREE.PlaneGeometry(w, h)), track(new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false })));
        scene.add(m);
        return m;
      };
      label(car, 0.34, 0.2, "500 64px 'IBM Plex Mono', ui-monospace, monospace", "#23282c").position.set(DOOR_W / 2 + 0.38, 1.82, SIDE + 0.004);
      label("NOCTURNE", 1.2, 0.12, "400 30px 'IBM Plex Mono', ui-monospace, monospace", "rgba(35,40,44,0.7)").position.set(-3.15, 1.68, SIDE + 0.004);

      // The night on the far side of the train, seen through its windows.
      const night = document.createElement("canvas");
      night.width = 1024;
      night.height = 512;
      {
        const g = night.getContext("2d")!;
        const sky = g.createLinearGradient(0, 0, 0, 512);
        sky.addColorStop(0, "#070a10");
        sky.addColorStop(0.55, "#10151c");
        sky.addColorStop(0.62, "#0a0d11");
        sky.addColorStop(1, "#040506");
        g.fillStyle = sky;
        g.fillRect(0, 0, 1024, 512);
        // A low line of hills, and lights here and there along it.
        g.fillStyle = "#06080a";
        g.beginPath();
        g.moveTo(0, 330);
        for (let x = 0; x <= 1024; x += 32) g.lineTo(x, 318 - Math.sin(x / 90) * 14 - Math.sin(x / 37) * 5);
        g.lineTo(1024, 512);
        g.lineTo(0, 512);
        g.fill();
        let seed = 7;
        const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
        for (let i = 0; i < 26; i++) {
          const x = rnd() * 1024;
          const y = 322 + rnd() * 30;
          g.fillStyle = rnd() < 0.8 ? "rgba(240,190,120,0.9)" : "rgba(170,200,230,0.8)";
          g.beginPath();
          g.arc(x, y, 1.2 + rnd() * 1.4, 0, Math.PI * 2);
          g.fill();
        }
      }
      const nightTex = track(new THREE.CanvasTexture(night));
      nightTex.colorSpace = THREE.SRGBColorSpace;
      const backdrop = new THREE.Mesh(track(new THREE.PlaneGeometry(40, 12)), track(new THREE.MeshBasicMaterial({ map: nightTex, fog: false })));
      // Its horizon a little below eye level for someone sitting down.
      backdrop.position.set(0, 2.4, FAR - 9);
      scene.add(backdrop);
      const farGlass = track(new THREE.MeshStandardMaterial({ color: 0x0b1117, roughness: 0.3, metalness: 0, transparent: true, opacity: 0.32 }));

      // Windows: glass with the lit carriage behind.
      const glass = track(new THREE.MeshStandardMaterial({ color: 0x2a3036, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.28 }));
      for (const x of WINDOWS) {
        const pane = new THREE.Mesh(track(new THREE.PlaneGeometry(1.36, 1.0)), glass);
        pane.position.set(x, 1.535, SIDE - 0.03);
        scene.add(pane);
        const far = new THREE.Mesh(track(new THREE.PlaneGeometry(1.36, 1.0)), farGlass);
        far.position.set(x, 1.535, FAR - 0.01);
        scene.add(far);
      }

      // The door leaves, in the pocket between the skins: a frame round a
      // tall window, so the lit vestibule shows through even when shut.
      const leafMat = mat({ color: 0xa7adb1, roughness: 0.38, metalness: floatOK ? 0.8 : 0.35 });
      const leafGlass = track(new THREE.MeshStandardMaterial({ color: 0x3a3a34, roughness: 0.1, transparent: true, opacity: 0.3 }));
      const rubber = mat({ color: 0x0a0b0c, roughness: 1 });
      const LW = DOOR_W / 2;
      const WIN_W = 0.42;
      const WIN_H = 0.8;
      const WIN_Y = 0.36; // window centre above the leaf's middle
      const leaves = [-1, 1].map((side) => {
        const g = new THREE.Group();
        const part = (w: number, h: number, x: number, y: number) => {
          const m = new THREE.Mesh(box(w, h, 0.035), leafMat);
          m.position.set(x, y, 0);
          g.add(m);
        };
        const winBottom = WIN_Y - WIN_H / 2;
        const winTop = WIN_Y + WIN_H / 2;
        part(LW, winBottom + DOOR_H / 2, 0, (-DOOR_H / 2 + winBottom) / 2);
        part(LW, DOOR_H / 2 - winTop, 0, (winTop + DOOR_H / 2) / 2);
        const stile = (LW - WIN_W) / 2;
        part(stile, WIN_H, -LW / 2 + stile / 2, WIN_Y);
        part(stile, WIN_H, LW / 2 - stile / 2, WIN_Y);
        const pane = new THREE.Mesh(track(new THREE.PlaneGeometry(WIN_W, WIN_H)), leafGlass);
        pane.position.set(0, WIN_Y, 0);
        g.add(pane);
        // The rubber where the two leaves meet.
        const seal = new THREE.Mesh(box(0.02, DOOR_H, 0.04), rubber);
        seal.position.x = -side * (LW / 2 - 0.01);
        g.add(seal);
        g.position.set((side * DOOR_W) / 4, FLOOR + DOOR_H / 2, SIDE - 0.04);
        scene.add(g);
        return { g, side };
      });

      // Door lamp and the ticket reader.
      const lampMat = glow(0x3a3f44, 1);
      const lamp = new THREE.Mesh(track(new THREE.SphereGeometry(0.045, 16, 12)), lampMat);
      lamp.position.set(0, FLOOR + DOOR_H + 0.14, SIDE + 0.03);
      scene.add(lamp);
      const lampLight = new THREE.PointLight(lin(1, 0.66, 0.3), 0, 2.2, 2);
      lampLight.position.set(0, FLOOR + DOOR_H + 0.1, SIDE + 0.25);
      scene.add(lampLight);
      const reader = new THREE.Mesh(box(0.13, 0.22, 0.05), mat({ color: 0x0e1216, roughness: 0.5, metalness: 0.4 }));
      reader.position.set(DOOR_W / 2 + 0.24, 1.25, SIDE + 0.025);
      scene.add(reader);
      const ringMat = glow(0x2a3a33, 1);
      const ring = new THREE.Mesh(track(new THREE.TorusGeometry(0.035, 0.006, 8, 32)), ringMat);
      ring.position.set(DOOR_W / 2 + 0.24, 1.28, SIDE + 0.052);
      scene.add(ring);

      // =================================================================== INSIDE
      const floor = new THREE.Mesh(
        track(new THREE.PlaneGeometry(24, CAR_W)),
        mat({ map: tex(bt.floor(), [6, 1]), normalMap: kit.relief("rough", [24, 3]), normalScale: new THREE.Vector2(0.25, 0.25), roughness: 0.62 }),
      );
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(0, FLOOR, SIDE - CAR_W / 2);
      scene.add(floor);
      const ceiling = new THREE.Mesh(
        track(new THREE.PlaneGeometry(24, CAR_W)),
        mat({ color: 0xbdb39e, roughness: 0.95, normalMap: kit.relief("ribs", [40, 3], Math.PI / 2), normalScale: new THREE.Vector2(0.25, 0.25) }),
      );
      ceiling.rotation.x = Math.PI / 2;
      ceiling.position.set(0, CEIL, SIDE - CAR_W / 2);
      scene.add(ceiling);
      const stripMat = glow(0xfff1d8, 0.9);
      for (const z of [SIDE - 0.75, FAR + 0.75]) {
        const strip = new THREE.Mesh(box(20, 0.03, 0.12), stripMat);
        strip.position.set(0, CEIL - 0.02, z);
        scene.add(strip);
      }
      for (const x of [-6, -2, 2, 6]) {
        const l = new THREE.PointLight(lin(1, 0.84, 0.62), 2, 5.5, 1.8);
        l.position.set(x, CEIL - 0.25, SIDE - CAR_W / 2);
        scene.add(l);
      }
      // Seats in bays of two facing each other, by the windows; a table between.
      // Moquette cushions with piped edges, a two-part back, a linen headrest
      // cover, an armrest on the aisle, on a steel plinth.
      const moq = bt.moquette(SEAT[carriage]);
      const fabric = mat({ map: tex(moq, [2.5, 2.5]), normalMap: kit.relief("fabric", [5, 5]), normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.95 });
      const fabricBack = mat({ map: tex(moq, [2.5, 3]), normalMap: kit.relief("fabric", [5, 6]), normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.95 });
      const piping = mat({ color: new THREE.Color().setRGB(SEAT[carriage][0] / 600, SEAT[carriage][1] / 600, SEAT[carriage][2] / 600), roughness: 0.7 });
      const linen = mat({ color: 0xe4dccb, roughness: 0.92, normalMap: kit.relief("fabric", [3, 3]), normalScale: new THREE.Vector2(0.6, 0.6) });
      const plinth = mat({ color: 0x1d2024, roughness: 0.5, metalness: floatOK ? 0.6 : 0.3 });
      const armMat = mat({ color: 0x191b1e, roughness: 0.55 });
      const tableMat = mat({ color: 0x4a3b2d, roughness: 0.32, normalMap: kit.relief("wood", [1, 1]), normalScale: new THREE.Vector2(0.3, 0.3) });
      const cushionGeo = rounded(0.5, 0.14, 0.94, 0.05);
      const lowerGeo = rounded(0.12, 0.42, 0.94, 0.045);
      const upperGeo = rounded(0.12, 0.34, 0.94, 0.045);
      const coverGeo = rounded(0.03, 0.2, 0.46, 0.012);
      const pipeGeo = track(new THREE.CylinderGeometry(0.011, 0.011, 0.9, 8));
      const armGeo = rounded(0.42, 0.05, 0.075, 0.02);
      const put = (m: THREE.Mesh, x: number, y: number, z: number) => {
        m.position.set(x, y, z);
        scene.add(m);
        return m;
      };
      const bay = (x: number, wallZ: number, dir: 1 | -1) => {
        const zc = wallZ + dir * 0.52;
        for (const facing of [-1, 1] as const) {
          const sx = x + facing * 0.62;
          put(new THREE.Mesh(box(0.42, 0.32, 0.86), plinth), sx, FLOOR + 0.18, zc);
          put(new THREE.Mesh(cushionGeo, fabric), sx, FLOOR + 0.43, zc);
          // Piping along the front edge of the cushion.
          const pipe = put(new THREE.Mesh(pipeGeo, piping), sx - facing * 0.25, FLOOR + 0.49, zc);
          pipe.rotation.x = Math.PI / 2;
          const bx = sx + facing * 0.24;
          const lower = put(new THREE.Mesh(lowerGeo, fabricBack), bx, FLOOR + 0.73, zc);
          lower.rotation.z = -facing * 0.08;
          const upper = put(new THREE.Mesh(upperGeo, fabricBack), bx + facing * 0.03, FLOOR + 1.11, zc);
          upper.rotation.z = -facing * 0.1;
          const cover = put(new THREE.Mesh(coverGeo, linen), bx - facing * 0.045, FLOOR + 1.2, zc);
          cover.rotation.z = -facing * 0.1;
          put(new THREE.Mesh(armGeo, armMat), sx, FLOOR + 0.66, wallZ + dir * 0.99);
        }
        put(new THREE.Mesh(rounded(0.52, 0.035, 0.36, 0.012), tableMat), x, FLOOR + 0.72, wallZ + dir * 0.2);
        // A tubular luggage rack over the window.
        for (const dz of [0.1, 0.28]) {
          const bar = put(new THREE.Mesh(track(new THREE.CylinderGeometry(0.012, 0.012, 1.9, 8)), trim), x, CEIL - 0.3, wallZ + dir * dz);
          bar.rotation.z = Math.PI / 2;
        }
      };
      for (const x of [-6.6, -4.3, -2.0, 2.0, 4.3, 6.6]) {
        bay(x, FAR, 1);
        if (Math.abs(x) > 1.5) bay(x, SIDE - 0.08, -1);
      }
      // Grab poles by the door and a rail along the ceiling over the aisle.
      for (const px of [-0.78, 0.78]) {
        put(new THREE.Mesh(track(new THREE.CylinderGeometry(0.017, 0.017, CEIL - FLOOR, 12)), trim), px, (CEIL + FLOOR) / 2, SIDE - 0.45);
      }
      const rail = put(new THREE.Mesh(track(new THREE.CylinderGeometry(0.014, 0.014, 18, 10)), trim), 0, CEIL - 0.14, SIDE - CAR_W / 2);
      rail.rotation.z = Math.PI / 2;
      // The end of the car: a gangway door with a dark window.
      for (const x of [-10, 10]) {
        const end = new THREE.Mesh(track(new THREE.PlaneGeometry(CAR_W, CEIL - FLOOR)), plainInside);
        end.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2;
        end.position.set(x, (CEIL + FLOOR) / 2, SIDE - CAR_W / 2);
        scene.add(end);
      }

      // Metal needs something to reflect: a soft room, where float targets allow it.
      if (floatOK) {
        const pmrem = new THREE.PMREMGenerator(renderer);
        const room = new RoomEnvironment();
        scene.environment = track(pmrem.fromScene(room, 0.04).texture);
        scene.environmentIntensity = 0.18;
        room.dispose();
        pmrem.dispose();
      }

      // ==================================================================== POST
      const target = pickTarget(renderer, floatOK);
      const hdr = target.texture.type === THREE.HalfFloatType;
      const composer = new EffectComposer(renderer, target);
      composer.addPass(new RenderPass(scene, camera));
      const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.32, 0.4, 0.95);
      bloom.enabled = hdr;
      composer.addPass(bloom);
      composer.addPass(new OutputPass());
      disposables.push(bloom, composer);

      const layout = () => {
        const w = mount.clientWidth || 1;
        const h = mount.clientHeight || 1;
        const dpr = Math.min(window.devicePixelRatio || 1, 1.75, Math.sqrt(2.6e6 / (w * h)));
        renderer.setPixelRatio(dpr);
        renderer.setSize(w, h, false);
        composer.setPixelRatio(dpr);
        composer.setSize(w, h);
        camera.aspect = w / h;
        // Keep the door and its neighbours in frame, tall screen or wide.
        camera.fov = camera.aspect < 0.8 ? 64 : camera.aspect < 1.3 ? 54 : 46;
        camera.updateProjectionMatrix();
      };

      // ===================================================================== WALK
      // Platform → threshold → vestibule → down the aisle → your seat.
      const path = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 1.62, 4.3),
        new THREE.Vector3(0, 1.62, 2.2),
        new THREE.Vector3(0, 1.64, 0.35),
        new THREE.Vector3(0.05, 1.66, SIDE - 0.9),
        new THREE.Vector3(0.9, 1.64, SIDE - 1.45),
        new THREE.Vector3(1.8, 1.5, FAR + 1.55),
        new THREE.Vector3(2.0, 1.3, FAR + 1.3),
      ]);
      const looks = [
        { t: 0, at: new THREE.Vector3(0, 1.3, SIDE) },
        { t: 0.3, at: new THREE.Vector3(0, 1.35, SIDE - 2) },
        { t: 0.55, at: new THREE.Vector3(3, 1.4, SIDE - 1.6) },
        { t: 0.8, at: new THREE.Vector3(2.3, 1.4, FAR) },
        { t: 1, at: new THREE.Vector3(2.0, 1.45, FAR) },
      ];
      const lookAt = new THREE.Vector3();
      const lookAtFor = (u: number) => {
        for (let i = 1; i < looks.length; i++) {
          if (u <= looks[i].t) {
            const a = looks[i - 1];
            const b = looks[i];
            return lookAt.lerpVectors(a.at, b.at, ease((u - a.t) / (b.t - a.t)));
          }
        }
        return lookAt.copy(looks[looks.length - 1].at);
      };
      let arrived = false;

      const update = (now: number) => {
        const { stage: s, at } = stageRef.current;
        const since = (now - at) / 1000;
        const lit = s !== "waiting";
        lampMat.emissive.set(lit ? 0xf0b35e : 0x3a3f44);
        lampMat.emissiveIntensity = lit ? 2.4 + (s === "opening" || s === "entering" ? Math.sin(now / 180) * 0.6 : 0) : 1;
        lampLight.intensity = lit ? 1.4 : 0;
        ringMat.emissive.set(s === "waiting" ? 0x2a3a33 : 0x8fd0a8);
        ringMat.emissiveIntensity = s === "waiting" ? 1 : 2.2;

        const open = s === "opening" ? ease(since / DOOR_SLIDE) : s === "entering" ? 1 : 0;
        const o = reduce && (s === "opening" || s === "entering") ? 1 : open;
        for (const { g, side } of leaves) g.position.x = (side * DOOR_W) / 4 + side * (DOOR_W / 2 + 0.04) * o;

        if (s === "entering" && !reduce) {
          const u = Math.min(1, since / WALK);
          // Walk at an even pace, easing only at the start and at the seat.
          const k = u < 0.12 ? (u * u) / 0.24 : u > 0.85 ? 1 - ((1 - u) * (1 - u)) / 0.3 : u;
          const p = path.getPointAt(Math.min(1, Math.max(0, k)));
          const stride = u < 0.85 ? Math.sin(since * 9.5) * 0.018 : 0;
          camera.position.set(p.x, p.y + stride, p.z);
          camera.lookAt(lookAtFor(k));
          if (u >= 1 && !arrived) {
            arrived = true;
            insideRef.current?.();
          }
        } else {
          // Standing on the platform, breathing.
          const sway = reduce ? 0 : Math.sin(now / 1400) * 0.012;
          camera.position.set(0 + sway, 1.62 + (reduce ? 0 : Math.sin(now / 1900) * 0.006), 4.3);
          camera.lookAt(looks[0].at);
        }
      };

      let broken = false;
      const draw = () => {
        if (broken) return;
        try {
          composer.render();
        } catch (err) {
          broken = true;
          log.note(`render failed: ${String(err)}`);
          failRef.current?.();
        }
      };

      let raf = 0;
      const frame = (now: number) => {
        raf = requestAnimationFrame(frame);
        if (document.hidden) return;
        update(now);
        draw();
      };
      layout();
      const ro = new ResizeObserver(layout);
      ro.observe(mount);
      raf = requestAnimationFrame(frame);

      return () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        disposables.forEach((d) => d.dispose());
        target.dispose();
        log.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
        renderer.domElement.remove();
      };
    };

    try {
      return setup();
    } catch (err) {
      console.warn("[nocturne] 3D boarding unavailable:", err);
      failRef.current?.();
      log.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    }
    // Built once; stage changes arrive through the ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={mountRef} className={className} aria-hidden />;
}
