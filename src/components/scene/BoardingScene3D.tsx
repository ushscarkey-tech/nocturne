"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { FXAAPass } from "three/examples/jsm/postprocessing/FXAAPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { CarriageId } from "@/core/types";
import * as bt from "./boarding/textures";
import { CABIN_TINT, CURTAIN_REST, type ClothBacklight } from "./cabin/cloth";
import { Curtain } from "./cabin/curtain";
import { lin, sceneKit } from "./cabin/kit";
import { PT, buildPlatform } from "./cabin/platform";
import { D, cabinLights, rideFov, roundedRect, windowDims, windowMaterials, windowParts, type WindowDims } from "./cabin/window";
import { describe, floatSupport, pickTarget, sceneLog, frameMeter } from "./gl";
import { GradeShader } from "./platform/shaders";

export type BoardingStage = "waiting" | "reading" | "opening" | "entering";

export interface BoardingSceneProps {
  stage: BoardingStage;
  carriage: CarriageId;
  /** The car number painted beside the door. */
  car: string;
  /** The station you board at, on its name board across the platform. */
  stationName?: string;
  className?: string;
  /** This device can't draw it: the caller shows the 2D doors. */
  onFail?: () => void;
  /** The walk is over: you are in your seat. */
  onInside?: () => void;
  /** The first frame is on screen (shaders compiled, textures up): it can be shown. */
  onReady?: () => void;
  /** Where the ticket reader sits on screen (CSS pixels from the scene's top left), to hold the ticket to. */
  onReader?: (x: number, y: number) => void;
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
const WALK = 5.2;
const WINDOWS_X = [-6.6, -4.3, -2.0, 2.0, 4.3, 6.6];
/**
 * Your seat: the bay by the platform-side window just past the door. You
 * sit exactly where the ride's camera sits — eyes the ride's height above
 * the platform, the ride's distance from the glass — so the walk's last
 * frame is the ride's first.
 */
const SEAT_X = 2.0;
const EYE_Y = -PT;
const EYE_Z = SIDE - 0.08 - D;
/** Dropped one at a time while frames keep arriving late (the ride's ladder, so both look alike). */
const QUALITY = [1.5, 1.2, 1];

const STRIPE: Record<CarriageId, number> = { rain: 0x4c6a8e, quiet: 0x55786a, tunnel: 0x9a6431, moon: 0xb69a62 };
/** Seat moquette base colour per carriage (sRGB 0–255). */
const SEAT: Record<CarriageId, [number, number, number]> = { rain: [58, 78, 96], quiet: [68, 92, 76], tunnel: [104, 72, 50], moon: [78, 84, 100] };

const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
/** Layer for things the view through your own window must not include. */
const MAIN_ONLY = 1;

/**
 * Boarding, in 3D: you stand on the platform before tonight's carriage.
 * The ticket touches the reader, the door lamp comes on, the doors slide
 * into the body and you walk in, along the aisle, and sit by the window —
 * and what you see then is what the ride begins with: the same platform,
 * window, curtain and light.
 */
export default function BoardingScene3D({ stage, carriage, car, stationName = "", className = "", onFail, onInside, onReady, onReader }: BoardingSceneProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef({ stage, at: 0 });
  const failRef = useRef(onFail);
  const insideRef = useRef(onInside);
  const readyRef = useRef(onReady);
  const readerRef = useRef(onReader);

  useEffect(() => {
    if (stageRef.current.stage !== stage) stageRef.current = { stage, at: performance.now() };
    failRef.current = onFail;
    insideRef.current = onInside;
    readyRef.current = onReady;
    readerRef.current = onReader;
  }, [stage, onFail, onInside, onReady, onReader]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const log = sceneLog("boarding");
    let renderer: THREE.WebGLRenderer;
    try {
      // The same GPU as the ride and the platform: on a Mac with two, switching between them stalls.
      renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "low-power" });
    } catch (err) {
      log.note(`no WebGL: ${String(err)}`);
      failRef.current?.();
      return () => log.dispose();
    }
    describe(renderer, log);
    const meter = frameMeter(log, renderer);

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
      const K = sceneKit(track);
      const { kit, tex } = K;
      const mat = (p: THREE.MeshStandardMaterialParameters) => track(new THREE.MeshStandardMaterial(p));
      const glow = (color: number, intensity: number) => track(new THREE.MeshStandardMaterial({ color: 0x000000, emissive: color, emissiveIntensity: intensity }));
      const box = (w: number, h: number, d: number) => track(new THREE.BoxGeometry(w, h, d));
      const rounded = (w: number, h: number, d: number, r: number) => track(new RoundedBoxGeometry(w, h, d, 3, r));
      const floatOK = floatSupport(renderer);

      // Two scenes, lit apart as they are on the ride: the platform and the
      // train's outside under the station lamps; the carriage inside under
      // its own. The carriage is drawn first, the outside over it, sharing
      // depth, so each hides what it should of the other.
      const outside = new THREE.Scene();
      outside.fog = new THREE.FogExp2(lin(0.009, 0.013, 0.017), 0.0065);
      const cabin = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(50, 1, 0.03, 80);
      camera.layers.enable(MAIN_ONLY);
      const addTo = <T extends THREE.Object3D>(scene: THREE.Scene, o: T, x = 0, y = 0, z = 0) => {
        o.position.set(x, y, z);
        scene.add(o);
        return o;
      };

      // ================================================================ PLATFORM
      // The ride's own platform, set down so your seat is where the ride's eyes are.
      const platform = buildPlatform(K, stationName);
      const platRoot = new THREE.Group();
      platRoot.rotation.y = Math.PI;
      platRoot.position.set(SEAT_X, EYE_Y, EYE_Z);
      platRoot.add(platform.group);
      outside.add(platRoot);
      const platformLamp = platform.lights[0].intensity;
      outside.add(new THREE.HemisphereLight(lin(0.045, 0.06, 0.08), lin(0.008, 0.008, 0.008), 0.8));

      // ================================================================= CARRIAGE
      // ShapeGeometry UVs are metres; the textures are placed in metres too.
      const paintMap = tex(bt.bodyPaint(WINDOWS_X, [-12, 12]));
      paintMap.repeat.set(1 / 24, 1 / 4.45);
      paintMap.offset.set(0.5, 1 / 4.45);
      // Stainless steel, satin-brushed along the car, like a Seoul subway car.
      const paint = mat({ map: paintMap, roughness: 0.4, metalness: floatOK ? 0.8 : 0.35 });
      const plainInside = mat({ color: 0xa99d84, roughness: 0.8 });
      const trim = mat({ color: 0xb9bec0, roughness: 0.3, metalness: floatOK ? 0.85 : 0.35, normalMap: kit.relief("brushed", [2, 2]), normalScale: new THREE.Vector2(0.3, 0.3) });
      const stripeMat = mat({ color: STRIPE[carriage], roughness: 0.5, metalness: 0.2 });
      const paneMat = track(new THREE.MeshStandardMaterial({ color: 0x2a3036, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.28, depthWrite: false }));
      const farPaneMat = track(new THREE.MeshStandardMaterial({ color: 0x0b1117, roughness: 0.3, metalness: 0, transparent: true, opacity: 0.32, depthWrite: false }));
      const beadGeo = track(new THREE.CylinderGeometry(0.011, 0.011, 1, 10, 1, false, 0, Math.PI));

      // Your window, as on the ride: its glass shows what's outside (drawn
      // separately each frame, like the ride does), and its curtain is lit through.
      const outTarget = pickTarget(renderer, floatOK);
      const clothBack: ClothBacklight = { outside: outTarget.texture, res: new THREE.Vector2(1, 1), winMin: new THREE.Vector2(), winMax: new THREE.Vector2(), strength: 0.45 };
      const mats = windowMaterials(K, carriage, clothBack);
      mats.glass.uniforms.tOutside.value = outTarget.texture;
      mats.glass.uniforms.uTint.value.copy(CABIN_TINT[carriage]);
      mats.glass.uniforms.uReflect.value = 0;
      // The carriage side is cut to the ride's window, so rebuilt if the screen's shape changes.
      const shell = { outside: new THREE.Group(), cabin: new THREE.Group() };
      outside.add(shell.outside);
      cabin.add(shell.cabin);
      let built: { dispose: () => void } | null = null;
      let seatGlass: THREE.Mesh | null = null;

      const buildShell = (d: WindowDims) => {
        built?.dispose();
        shell.outside.clear();
        shell.cabin.clear();
        const geos: THREE.BufferGeometry[] = [];
        const curtains: Curtain[] = [];
        const partsList: { dispose: () => void }[] = [];
        const keep = <G extends THREE.BufferGeometry>(g: G) => {
          geos.push(g);
          return g;
        };
        const cy = EYE_Y + d.cy;
        const bottom = cy - d.h / 2;
        const top = cy + d.h / 2;
        // Outer skin with the doorway and window openings (a touch larger than the glass).
        const skin = new THREE.Shape([new THREE.Vector2(-12, -1), new THREE.Vector2(12, -1), new THREE.Vector2(12, 3.45), new THREE.Vector2(-12, 3.45)]);
        skin.holes.push(new THREE.Path([new THREE.Vector2(-DOOR_W / 2, FLOOR), new THREE.Vector2(DOOR_W / 2, FLOOR), new THREE.Vector2(DOOR_W / 2, FLOOR + DOOR_H), new THREE.Vector2(-DOOR_W / 2, FLOOR + DOOR_H)]));
        for (const x of WINDOWS_X) skin.holes.push(roundedRect(d.w + 0.06, d.h + 0.06, d.r + 0.03, x, cy));
        const skinMesh = new THREE.Mesh(keep(new THREE.ShapeGeometry(skin, 8)), paint);
        skinMesh.position.z = SIDE;
        shell.outside.add(skinMesh);
        const skirt = new THREE.Mesh(keep(new THREE.BoxGeometry(24, 0.5, 0.06)), paint);
        skirt.position.set(0, -0.2, SIDE - 0.02);
        shell.outside.add(skirt);
        // The line colour: a band under the windows and a thin one above.
        for (const [y, h] of [
          [bottom - 0.1, 0.1],
          [Math.min(FLOOR + DOOR_H + 0.13, top + 0.16), 0.035],
        ] as const) {
          for (const [x0, x1] of [
            [-12, -DOOR_W / 2 - 0.04],
            [DOOR_W / 2 + 0.04, 12],
          ]) {
            const band = new THREE.Mesh(keep(new THREE.BoxGeometry(x1 - x0, h, 0.012)), stripeMat);
            band.position.set((x0 + x1) / 2, y, SIDE + 0.012);
            shell.outside.add(band);
          }
        }
        // Pressed beads: raised horizontal ribs in the steel below the windows
        // and above them, stopping at the door; the window band stays smooth.
        const rows: number[] = [];
        for (let y = 0.02; y <= bottom - 0.2; y += 0.055) rows.push(y);
        for (let y = Math.max(top + 0.26, FLOOR + DOOR_H + 0.2); y <= 3.05; y += 0.055) rows.push(y);
        const segs: [number, number, number][] = [];
        for (const y of rows) {
          if (y < FLOOR + DOOR_H + 0.05) segs.push([y, -12, -DOOR_W / 2 - 0.06], [y, DOOR_W / 2 + 0.06, 12]);
          else segs.push([y, -12, 12]);
        }
        const beads = new THREE.InstancedMesh(beadGeo, paint, segs.length);
        const m4 = new THREE.Matrix4();
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, Math.PI / 2));
        segs.forEach(([y, x0, x1], i) => beads.setMatrixAt(i, m4.compose(new THREE.Vector3((x0 + x1) / 2, y, SIDE), q, new THREE.Vector3(1, x1 - x0, 1))));
        shell.outside.add(beads);
        // The inside walls, in the ride's wall panel, with the ride's window openings.
        const inner = (holesAt: (x: number) => number, door: boolean) => {
          const s = new THREE.Shape([new THREE.Vector2(-12, FLOOR), new THREE.Vector2(12, FLOOR), new THREE.Vector2(12, CEIL), new THREE.Vector2(-12, CEIL)]);
          if (door) s.holes.push(new THREE.Path([new THREE.Vector2(-DOOR_W / 2, FLOOR), new THREE.Vector2(DOOR_W / 2, FLOOR), new THREE.Vector2(DOOR_W / 2, FLOOR + DOOR_H), new THREE.Vector2(-DOOR_W / 2, FLOOR + DOOR_H)]));
          for (const x of WINDOWS_X) s.holes.push(roundedRect(d.w, d.h, d.r, holesAt(x), cy));
          return keep(new THREE.ShapeGeometry(s, 8));
        };
        // The platform side faces into the car (−z): turned round, so its holes are mirrored.
        const near = new THREE.Mesh(inner((x) => -x, true), mats.wall);
        near.rotation.y = Math.PI;
        near.position.z = SIDE - 0.08;
        shell.cabin.add(near);
        const far = new THREE.Mesh(inner((x) => x, false), mats.wall);
        far.position.z = FAR;
        shell.cabin.add(far);
        // Window parts, glass and curtains, each in the ride's eye space.
        WINDOWS_X.forEach((x, i) => {
          for (const side of ["near", "far"] as const) {
            const mine = side === "near" && x === SEAT_X;
            const g = new THREE.Group();
            if (side === "near") {
              g.rotation.y = Math.PI;
              g.position.set(x, EYE_Y, EYE_Z);
            } else g.position.set(x, EYE_Y, FAR + D);
            const parts = windowParts(d, { frame: mats.frame, table: mats.table, glass: mine ? mats.glass : null });
            partsList.push(parts);
            g.add(parts.group);
            if (mine) {
              seatGlass = parts.glass;
              seatGlass!.visible = false;
              mats.glass.uniforms.uWin.value.set(d.w, d.h);
              clothBack.winMin.set(x - d.w / 2, cy - d.h / 2);
              clothBack.winMax.set(x + d.w / 2, cy + d.h / 2);
            }
            // Your curtain hangs exactly as the ride's will; the others each their own way.
            const curtain = new Curtain(mine ? mats.cloth : mats.plainCloth, { ...parts.curtain, cover: CURTAIN_REST, seed: mine ? undefined : 31 + i * 7 + (side === "near" ? 3 : 0) });
            curtains.push(curtain);
            g.add(curtain.mesh);
            shell.cabin.add(g);
            // The outer glass, flush with the skin; your own is left out of the view through it.
            const pane = new THREE.Mesh(keep(new THREE.PlaneGeometry(d.w + 0.06, d.h + 0.06)), side === "near" ? paneMat : farPaneMat);
            pane.position.set(x, cy, side === "near" ? SIDE - 0.03 : FAR - 0.01);
            if (mine) pane.layers.set(MAIN_ONLY);
            shell.outside.add(pane);
          }
        });
        built = {
          dispose: () => {
            geos.forEach((g) => g.dispose());
            curtains.forEach((c) => c.dispose());
            partsList.forEach((p) => p.dispose());
          },
        };
      };

      // The door frame.
      for (const x of [-DOOR_W / 2 - 0.02, DOOR_W / 2 + 0.02]) addTo(outside, new THREE.Mesh(box(0.04, DOOR_H + 0.04, 0.1), trim), x, FLOOR + DOOR_H / 2, SIDE - 0.04);
      addTo(outside, new THREE.Mesh(box(DOOR_W + 0.08, 0.04, 0.1), trim), 0, FLOOR + DOOR_H + 0.02, SIDE - 0.04);
      // The step sits a few millimetres below the carriage floor: level with it,
      // the two fought over the same pixels and the doorway's foot flickered.
      const stepMat = mat({ color: 0x80868a, roughness: 0.62, metalness: floatOK ? 0.55 : 0.3 });
      addTo(outside, new THREE.Mesh(box(DOOR_W, 0.03, 0.22), stepMat), 0, FLOOR - 0.006 - 0.015, SIDE + 0.02);
      addTo(outside, new THREE.Mesh(box(DOOR_W, 0.012, 0.014), mat({ color: 0x151719, roughness: 0.9 })), 0, FLOOR - 0.012, SIDE + 0.124);

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
        outside.add(m);
        return m;
      };
      label(car, 0.34, 0.2, "500 64px 'IBM Plex Mono', ui-monospace, monospace", "#23282c").position.set(DOOR_W / 2 + 0.38, 1.82, SIDE + 0.004);
      label("NOCTURNE", 1.2, 0.12, "400 30px 'IBM Plex Mono', ui-monospace, monospace", "rgba(35,40,44,0.7)").position.set(-3.15, 1.72, SIDE + 0.004);

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
      // Its horizon a little below eye level for someone sitting down.
      addTo(outside, new THREE.Mesh(track(new THREE.PlaneGeometry(40, 12)), track(new THREE.MeshBasicMaterial({ map: nightTex, fog: false }))), 0, 2.2, FAR - 9);

      // The door leaves, in the pocket between the skins: a frame round a
      // tall window, so the lit vestibule shows through even when shut.
      const leafMat = mat({ color: 0xa7adb1, roughness: 0.38, metalness: floatOK ? 0.8 : 0.35 });
      const leafGlass = track(new THREE.MeshStandardMaterial({ color: 0x3a3a34, roughness: 0.1, transparent: true, opacity: 0.3, depthWrite: false }));
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
        addTo(outside, g, (side * DOOR_W) / 4, FLOOR + DOOR_H / 2, SIDE - 0.04);
        return { g, side };
      });

      // Door lamp and the ticket reader.
      const lampMat = glow(0x3a3f44, 1);
      addTo(outside, new THREE.Mesh(track(new THREE.SphereGeometry(0.045, 16, 12)), lampMat), 0, FLOOR + DOOR_H + 0.14, SIDE + 0.03);
      const lampLight = addTo(outside, new THREE.PointLight(lin(1, 0.66, 0.3), 0, 2.2, 2), 0, FLOOR + DOOR_H + 0.1, SIDE + 0.25);
      const READER = new THREE.Vector3(DOOR_W / 2 + 0.24, 1.28, SIDE + 0.06);
      addTo(outside, new THREE.Mesh(box(0.13, 0.22, 0.05), mat({ color: 0x0e1216, roughness: 0.5, metalness: 0.4 })), DOOR_W / 2 + 0.24, 1.25, SIDE + 0.025);
      const ringMat = glow(0x2a3a33, 1);
      addTo(outside, new THREE.Mesh(track(new THREE.TorusGeometry(0.035, 0.006, 8, 32)), ringMat), DOOR_W / 2 + 0.24, 1.28, SIDE + 0.052);

      // =================================================================== INSIDE
      const floor = addTo(cabin, new THREE.Mesh(track(new THREE.PlaneGeometry(24, CAR_W)), mat({ map: tex(bt.floor(), [6, 1]), normalMap: kit.relief("rough", [24, 3]), normalScale: new THREE.Vector2(0.25, 0.25), roughness: 0.62 })), 0, FLOOR, SIDE - CAR_W / 2);
      floor.rotation.x = -Math.PI / 2;
      const ceiling = addTo(cabin, new THREE.Mesh(track(new THREE.PlaneGeometry(24, CAR_W)), mat({ color: 0xbdb39e, roughness: 0.95, normalMap: kit.relief("ribs", [40, 3], Math.PI / 2), normalScale: new THREE.Vector2(0.25, 0.25) })), 0, CEIL, SIDE - CAR_W / 2);
      ceiling.rotation.x = Math.PI / 2;
      const stripMat = glow(0xfff1d8, 0.9);
      for (const z of [SIDE - 0.75, FAR + 0.75]) addTo(cabin, new THREE.Mesh(box(20, 0.03, 0.12), stripMat), 0, CEIL - 0.02, z);
      const WARM = lin(1, 0.84, 0.62);
      const carLights = [-6, -2, 2, 6].map((x) => addTo(cabin, new THREE.PointLight(WARM.clone(), 2, 5.5, 1.8), x, CEIL - 0.25, SIDE - CAR_W / 2));
      const carFill = new THREE.HemisphereLight(lin(0.12, 0.13, 0.16), lin(0.02, 0.02, 0.02), 1);
      cabin.add(carFill);
      // The ride's own light at your seat, faded up as you sit.
      const seatLights = cabinLights(CABIN_TINT[carriage].clone());
      const seatRoot = new THREE.Group();
      seatRoot.rotation.y = Math.PI;
      seatRoot.position.set(SEAT_X, EYE_Y, EYE_Z);
      seatRoot.add(seatLights.group);
      cabin.add(seatRoot, seatLights.fill);
      const spill = seatLights.platformSpill();
      const seatBase = { main: seatLights.main.intensity, reading: seatLights.reading.intensity, fill: seatLights.fill.intensity };

      // Seats in bays of two facing each other, by the windows. Moquette
      // cushions with piped edges, a two-part back, a linen headrest cover,
      // an armrest on the aisle, on a steel plinth — each kind of part drawn
      // for every seat at once.
      const moq = bt.moquette(SEAT[carriage]);
      const fabric = mat({ map: tex(moq, [2.5, 2.5]), normalMap: kit.relief("fabric", [5, 5]), normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.95 });
      const fabricBack = mat({ map: tex(moq, [2.5, 3]), normalMap: kit.relief("fabric", [5, 6]), normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.95 });
      const piping = mat({ color: new THREE.Color().setRGB(SEAT[carriage][0] / 600, SEAT[carriage][1] / 600, SEAT[carriage][2] / 600), roughness: 0.7 });
      const linen = mat({ color: 0xe4dccb, roughness: 0.92, normalMap: kit.relief("fabric", [3, 3]), normalScale: new THREE.Vector2(0.6, 0.6) });
      const plinth = mat({ color: 0x1d2024, roughness: 0.5, metalness: floatOK ? 0.6 : 0.3 });
      const armMat = mat({ color: 0x191b1e, roughness: 0.55 });
      const kinds = {
        plinth: { geo: box(0.42, 0.32, 0.86), mat: plinth },
        cushion: { geo: rounded(0.5, 0.14, 0.94, 0.05), mat: fabric },
        pipe: { geo: track(new THREE.CylinderGeometry(0.011, 0.011, 0.9, 8)), mat: piping },
        lower: { geo: rounded(0.12, 0.42, 0.94, 0.045), mat: fabricBack },
        upper: { geo: rounded(0.12, 0.34, 0.94, 0.045), mat: fabricBack },
        cover: { geo: rounded(0.03, 0.2, 0.46, 0.012), mat: linen },
        arm: { geo: rounded(0.42, 0.05, 0.075, 0.02), mat: armMat },
        rack: { geo: track(new THREE.CylinderGeometry(0.012, 0.012, 1.9, 8)), mat: trim },
      };
      const placed = new Map<keyof typeof kinds, THREE.Matrix4[]>();
      const dummy = new THREE.Object3D();
      const place = (kind: keyof typeof kinds, x: number, y: number, z: number, rx = 0, rz = 0) => {
        dummy.position.set(x, y, z);
        dummy.rotation.set(rx, 0, rz);
        dummy.updateMatrix();
        if (!placed.has(kind)) placed.set(kind, []);
        placed.get(kind)!.push(dummy.matrix.clone());
      };
      const bay = (x: number, wallZ: number, dir: 1 | -1) => {
        const zc = wallZ + dir * 0.52;
        for (const facing of [-1, 1] as const) {
          const sx = x + facing * 0.62;
          place("plinth", sx, FLOOR + 0.18, zc);
          place("cushion", sx, FLOOR + 0.43, zc);
          place("pipe", sx - facing * 0.25, FLOOR + 0.49, zc, Math.PI / 2);
          const bx = sx + facing * 0.24;
          place("lower", bx, FLOOR + 0.73, zc, 0, -facing * 0.08);
          place("upper", bx + facing * 0.03, FLOOR + 1.11, zc, 0, -facing * 0.1);
          place("cover", bx - facing * 0.045, FLOOR + 1.2, zc, 0, -facing * 0.1);
          place("arm", sx, FLOOR + 0.66, wallZ + dir * 0.99);
        }
        // A tubular luggage rack over the window.
        for (const dz of [0.1, 0.28]) place("rack", x, CEIL - 0.3, wallZ + dir * dz, 0, Math.PI / 2);
      };
      for (const x of WINDOWS_X) {
        bay(x, FAR, 1);
        if (Math.abs(x) > 1.5) bay(x, SIDE - 0.08, -1);
      }
      placed.forEach((matrices, kind) => {
        const inst = new THREE.InstancedMesh(kinds[kind].geo, kinds[kind].mat, matrices.length);
        matrices.forEach((m, i) => inst.setMatrixAt(i, m));
        inst.computeBoundingSphere();
        cabin.add(inst);
      });
      // Grab poles by the door and a rail along the ceiling over the aisle.
      for (const px of [-0.78, 0.78]) addTo(cabin, new THREE.Mesh(track(new THREE.CylinderGeometry(0.017, 0.017, CEIL - FLOOR, 12)), trim), px, (CEIL + FLOOR) / 2, SIDE - 0.45);
      addTo(cabin, new THREE.Mesh(track(new THREE.CylinderGeometry(0.014, 0.014, 18, 10)), trim), 0, CEIL - 0.14, SIDE - CAR_W / 2).rotation.z = Math.PI / 2;
      // The ends of the car.
      for (const x of [-10, 10]) addTo(cabin, new THREE.Mesh(track(new THREE.PlaneGeometry(CAR_W, CEIL - FLOOR)), plainInside), x, (CEIL + FLOOR) / 2, SIDE - CAR_W / 2).rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2;

      // Metal needs something to reflect: a soft room, where float targets
      // allow it. It fades as you sit, since the ride has none.
      const ENV = 0.18;
      if (floatOK) {
        const pmrem = new THREE.PMREMGenerator(renderer);
        const room = new RoomEnvironment();
        const env = track(pmrem.fromScene(room, 0.04).texture);
        outside.environment = env;
        cabin.environment = env;
        outside.environmentIntensity = cabin.environmentIntensity = ENV;
        room.dispose();
        pmrem.dispose();
      }

      // ==================================================================== POST
      // The ride's passes, in the ride's order.
      const target = pickTarget(renderer, floatOK);
      const hdr = target.texture.type === THREE.HalfFloatType;
      const composer = new EffectComposer(renderer, target);
      composer.addPass(new RenderPass(cabin, camera));
      const overPass = new RenderPass(outside, camera);
      overPass.clear = false;
      composer.addPass(overPass);
      const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.32, 0.35, hdr ? 1.0 : 0.85);
      bloom.enabled = hdr;
      composer.addPass(bloom);
      composer.addPass(new OutputPass());
      // No multisampling here (Safari's half-float targets): smooth the edges after.
      const fxaa = new FXAAPass();
      fxaa.enabled = target.samples === 0;
      composer.addPass(fxaa);
      const grade = new ShaderPass(GradeShader);
      grade.uniforms.uVignette.value = 0.25;
      composer.addPass(grade);
      disposables.push(bloom, fxaa, grade, composer, outTarget);
      let level = 0;
      let builtFor = "";

      // ===================================================================== WALK
      // Platform → threshold → vestibule → along the aisle → your seat, and
      // you settle facing the window, looking back out at the platform.
      const path = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 1.62, 3.6),
        new THREE.Vector3(0, 1.62, 1.8),
        new THREE.Vector3(0, 1.64, 0.3),
        new THREE.Vector3(0.05, 1.66, SIDE - 0.9),
        new THREE.Vector3(0.9, 1.62, SIDE - 1.5),
        new THREE.Vector3(1.75, 1.45, SIDE - 1.6),
        new THREE.Vector3(SEAT_X, EYE_Y, EYE_Z),
      ]);
      const looks = [
        { t: 0, at: new THREE.Vector3(0, 1.3, SIDE) },
        { t: 0.3, at: new THREE.Vector3(0, 1.35, SIDE - 2) },
        { t: 0.55, at: new THREE.Vector3(3.2, 1.45, SIDE - 1.9) },
        { t: 0.8, at: new THREE.Vector3(SEAT_X + 0.35, EYE_Y + 0.05, SIDE) },
        { t: 1, at: new THREE.Vector3(SEAT_X, EYE_Y, EYE_Z + 1) },
      ];
      // The gaze follows its own smooth curve, so the head turns without stopping at each mark.
      const lookCurve = new THREE.CatmullRomCurve3(looks.map((l) => l.at));
      const lookAtFor = (k: number) => (k >= 1 ? looks[looks.length - 1].at : lookCurve.getPoint(k));
      const walkLength = path.getLength();
      // Speed through the walk: ease up to a steady pace, and ease down into the seat.
      const ACC = 0.2;
      const DEC = 0.32;
      const PACE = 1 / (1 - ACC / 2 - DEC / 2);
      const progress = (u: number) =>
        u <= 0 ? 0 : u >= 1 ? 1 : u < ACC ? (PACE * u * u) / (2 * ACC) : u > 1 - DEC ? 1 - (PACE * (1 - u) * (1 - u)) / (2 * DEC) : PACE * (u - ACC / 2);
      const speedAt = (u: number) => (u < ACC ? u / ACC : u > 1 - DEC ? (1 - u) / DEC : 1);
      /** Where you stand before boarding (no sway): the reader is found from here. */
      const standAt = () => {
        camera.position.set(0, 1.62, path.points[0].z);
        camera.lookAt(looks[0].at);
      };

      const layout = () => {
        const w = mount.clientWidth || 1;
        const h = mount.clientHeight || 1;
        const dpr = Math.min(window.devicePixelRatio || 1, QUALITY[level], Math.sqrt(2.4e6 / (w * h)));
        renderer.setPixelRatio(dpr);
        renderer.setSize(w, h, false);
        composer.setPixelRatio(dpr);
        composer.setSize(w, h);
        const px = [Math.round(w * dpr), Math.round(h * dpr)] as const;
        outTarget.setSize(...px);
        mats.glass.uniforms.uRes.value.set(...px);
        clothBack.res.set(...px);
        grade.uniforms.uRes.value.set(w * dpr, h * dpr);
        camera.aspect = w / h;
        // The ride's lens throughout, so the walk ends on the ride's first frame.
        camera.fov = rideFov(camera.aspect);
        camera.updateProjectionMatrix();
        const shape = `${w}x${h}`;
        if (shape !== builtFor) {
          builtFor = shape;
          buildShell(windowDims(camera.fov, camera.aspect));
        }
        // Tell the page where the reader is, so the ticket goes to it.
        standAt();
        camera.updateMatrixWorld();
        const p = READER.clone().project(camera);
        readerRef.current?.(((p.x + 1) / 2) * w, ((1 - p.y) / 2) * h);
      };

      let arrived = false;
      let settle = 0;
      const update = (now: number) => {
        const { stage: s, at } = stageRef.current;
        const since = (now - at) / 1000;
        const lit = s !== "waiting";
        lampMat.emissive.set(lit ? 0xf0b35e : 0x3a3f44);
        lampMat.emissiveIntensity = lit ? 2.4 + (s === "opening" || s === "entering" ? Math.sin(now / 180) * 0.6 : 0) : 1;
        ringMat.emissive.set(s === "waiting" ? 0x2a3a33 : 0x8fd0a8);
        ringMat.emissiveIntensity = s === "waiting" ? 1 : 2.2;

        const open = s === "opening" ? ease(since / DOOR_SLIDE) : s === "entering" ? 1 : 0;
        const o = reduce && (s === "opening" || s === "entering") ? 1 : open;
        for (const { g, side } of leaves) g.position.x = (side * DOOR_W) / 4 + side * (DOOR_W / 2 + 0.04) * o;

        settle = 0;
        if (s === "entering" && !reduce) {
          const u = Math.min(1, since / WALK);
          const k = progress(u);
          const p = path.getPointAt(k);
          // Steps follow the distance walked (about 70 cm a stride), and fade as you slow to sit.
          const phase = ((k * walkLength) / 0.7) * Math.PI;
          const stepping = speedAt(u) * (1 - ease((u - 0.55) / 0.3));
          const bob = Math.abs(Math.sin(phase)) * 0.012 * stepping;
          const sway = Math.sin(phase / 2) * 0.006 * stepping;
          camera.position.set(p.x + sway, p.y + bob - 0.006 * stepping, p.z);
          camera.lookAt(lookAtFor(k));
          settle = ease((u - 0.55) / 0.45);
          if (u >= 1 && !arrived) {
            arrived = true;
            insideRef.current?.();
          }
        } else {
          // Standing on the platform, breathing.
          const sway = reduce ? 0 : Math.sin(now / 1400) * 0.012;
          camera.position.set(sway, 1.62 + (reduce ? 0 : Math.sin(now / 1900) * 0.006), path.points[0].z);
          camera.lookAt(looks[0].at);
        }
        lampLight.intensity = lit ? 1.4 * (1 - settle) : 0;
        // Standing close under them, the station lamps would glare off the
        // steel; they come up to the ride's strength as you take your seat.
        for (const l of platform.lights) l.intensity = platformLamp * (0.4 + 0.6 * settle);
        // Settling in, the car's lights give way to the ride's light at your seat.
        for (const l of carLights) l.intensity = 2 * (1 - settle);
        carFill.intensity = 1 - settle;
        seatLights.main.intensity = seatBase.main * settle;
        seatLights.reading.intensity = seatBase.reading * settle;
        seatLights.sweep.intensity = spill * settle;
        seatLights.fill.intensity = seatBase.fill * settle;
        outside.environmentIntensity = cabin.environmentIntensity = ENV * (1 - settle);
        renderer.toneMappingExposure = 1.05 - 0.05 * settle;
        grade.uniforms.uVignette.value = 0.25 + 0.25 * settle;
        grade.uniforms.uTime.value = now / 1000;
        // The ride's glass keeps the page's clock, so its drops are where the ride's will be.
        mats.glass.uniforms.uTime.value = performance.now() / 1000;
        mats.glass.uniforms.uRain.value = (carriage === "rain" ? 1 : 0) * settle;
        // The ride's glass takes over from the plain pane as you sit; its reflection comes up with it.
        mats.glass.uniforms.uReflect.value = 0.08 * settle;
        if (seatGlass) seatGlass.visible = settle > 0;
      };

      let broken = false;
      const draw = () => {
        if (broken) return;
        try {
          if (seatGlass?.visible) {
            // What's outside your window, for its glass and curtain, as the ride draws it.
            camera.layers.disable(MAIN_ONLY);
            renderer.setRenderTarget(outTarget);
            renderer.render(outside, camera);
            renderer.setRenderTarget(null);
            camera.layers.enable(MAIN_ONLY);
          }
          composer.render();
        } catch (err) {
          broken = true;
          log.note(`render failed: ${String(err)}`);
          failRef.current?.();
        }
      };

      let raf = 0;
      let last = performance.now();
      let acc = 0;
      let interval = 1 / 60;
      let slowFor = 0;
      let warm = 0;
      const frame = (now: number) => {
        raf = requestAnimationFrame(frame);
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        if (document.hidden) return;
        // At most 60 a second, even on faster displays.
        acc += dt;
        if (acc < 1 / 60 - 0.004) return;
        const step = Math.min(acc, 0.1);
        acc = 0;
        meter(() => {
          update(now);
          draw();
        });
        warm += step;
        interval = interval * 0.94 + dt * 0.06;
        if (warm > 1 && level < QUALITY.length - 1) {
          slowFor = interval > 1 / 45 ? slowFor + step : 0;
          if (slowFor > 1) {
            // Far too slow: drop two steps at once rather than stutter through each.
            level = Math.min(QUALITY.length - 1, level + (interval > 2 / 60 ? 2 : 1));
            slowFor = 0;
            warm = 0;
            log.set("quality", `step ${level}`);
            layout();
          }
        }
      };
      layout();
      const ro = new ResizeObserver(layout);
      ro.observe(mount);
      // Compile every shader first, off the main thread where the browser can
      // (your window's glass too, though it shows only as you sit), while the
      // page behind keeps moving; then draw, and say the scene can be shown.
      if (seatGlass) (seatGlass as THREE.Mesh).visible = true;
      let disposed = false;
      const begin = () => {
        if (disposed || broken) return;
        draw();
        update(performance.now());
        draw();
        last = performance.now();
        raf = requestAnimationFrame(frame);
        requestAnimationFrame(() => {
          if (!disposed && !broken) readyRef.current?.();
        });
      };
      Promise.all([kit.ready(), renderer.compileAsync(cabin, camera), renderer.compileAsync(outside, camera)]).then(begin, begin);

      return () => {
        disposed = true;
        cancelAnimationFrame(raf);
        ro.disconnect();
        built?.dispose();
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
