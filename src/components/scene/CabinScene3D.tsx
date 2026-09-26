"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { FXAAPass } from "three/examples/jsm/postprocessing/FXAAPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import type { CarriageId } from "@/core/types";
import { farLightsMaterial, fieldMaterial, trackGroundMaterial, tunnelWallMaterial } from "./cabin/shaders";
import * as ct from "./cabin/textures";
import { Curtain } from "./cabin/curtain";
import { CABIN_TINT as TINT, CURTAIN_COLOR as CURTAIN, CURTAIN_REST, type ClothBacklight } from "./cabin/cloth";
import { sceneKit } from "./cabin/kit";
import { PT, buildPlatform } from "./cabin/platform";
import { D, cabinLights, rideFov, roundedRect, windowDims, windowMaterials, windowParts } from "./cabin/window";
import { SCENE_READY, describe, floatSupport, pickTarget, sceneLog } from "./gl";
import { GradeShader, MAX_LIGHTS, hazeMaterial, rainMaterial, skyMaterial } from "./platform/shaders";
import * as tx from "./platform/textures";

export type CabinMode = "platform" | "night" | "tunnel" | "still";

export interface CabinSceneProps {
  mode: CabinMode;
  carriage: CarriageId;
  stationName?: string;
  /** The end of the line: a longer, brighter platform. */
  terminal?: boolean;
  className?: string;
  /** Called if this device can't draw the scene; the caller shows the 2D one. */
  onFail?: () => void;
  /** How far the curtain is drawn beyond its resting place (0 … 1), as you pull it. */
  onCurtain?: (amount: number) => void;
}

// Metres, relative to your eyes. The train runs toward +x, so the world
// slides toward -x past the window.
const GROUND = -2.35; // ballast, just below rail level
const CRUISE = 13;
const TUNNEL_CRUISE = 15;
const BRAKE = 1.4;
const ACCEL = 0.7;
const LAMP_EVERY = 25; // tunnel lamps

/** Steps down, one at a time, while frames keep arriving late: sharpness first, then glow, then frame rate. */
const QUALITY = [
  { dpr: 1.5, bloom: true, fps: 60 },
  { dpr: 1.2, bloom: true, fps: 60 },
  { dpr: 1, bloom: true, fps: 60 },
  { dpr: 1, bloom: false, fps: 30 },
  { dpr: 0.75, bloom: false, fps: 30 },
];

const lin = (r: number, g: number, b: number) => new THREE.Color().setRGB(r, g, b);
const WHITE = new THREE.Color(1, 1, 1);

/** Wrap x into [-span/2, span/2). */
const wrap = (x: number, span: number) => ((((x + span / 2) % span) + span) % span) - span / 2;


/**
 * The view from your seat on a late local train, in 3D: the window beside
 * you with its curtain and the seat in front, rain on the glass, and outside
 * dark fields, a road with a few lamps, houses, flats and hills, a tunnel
 * now and then, and platforms that slide in and come to rest.
 */
export default function CabinScene3D({ mode, carriage, stationName = "", terminal = false, className = "", onFail, onCurtain }: CabinSceneProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const target = useRef({ mode, carriage, stationName, terminal });
  const failRef = useRef(onFail);
  const curtainRef = useRef(onCurtain);
  useEffect(() => {
    curtainRef.current = onCurtain;
  }, [onCurtain]);
  const pokeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    target.current = { mode, carriage, stationName, terminal };
    failRef.current = onFail;
    pokeRef.current?.();
  }, [mode, carriage, stationName, terminal, onFail]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const log = sceneLog("cabin");
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "low-power" });
    } catch (err) {
      log.note(`no WebGL: ${String(err)}`);
      failRef.current?.();
      return () => log.dispose();
    }
    describe(renderer, log);
    const fail = (why: string, err?: unknown) => {
      console.warn(`[nocturne] 3D cabin ${why}:`, err);
      log.note(`${why}: ${err instanceof Error ? err.message : String(err ?? "")}`);
      failRef.current?.();
    };

    const setup = (): (() => void) => {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.0;
      renderer.setClearColor(0x05070b, 1);
      mount.appendChild(renderer.domElement);
      renderer.domElement.style.display = "block";
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";

      const floatOK = floatSupport(renderer);
      log.set("float targets", String(floatOK));
      const disposables: { dispose(): void }[] = [];
      const track = <T extends { dispose(): void }>(x: T) => {
        disposables.push(x);
        return x;
      };
      const K = sceneKit(track);
      const { lambert, basic, tex, kit, std, nv, put, mesh, box } = K;

      // Two scenes: the world outside, rendered to a texture the glass looks
      // through, and the carriage around you.
      const horizon = lin(0.014, 0.02, 0.026);
      const outside = new THREE.Scene();
      const fog = new THREE.FogExp2(lin(0.009, 0.013, 0.017), 0.0065);
      outside.fog = fog;
      const cabin = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(55, 1, 0.03, 1400);
      const outCam = new THREE.PerspectiveCamera(55, 1, 0.3, 1400);


      const fallbacks = new Map<THREE.Material, () => void>();
      const hide = (m: THREE.Material) => () =>
        outside.traverse((o) => {
          if ((o as THREE.Mesh).material === m) o.visible = false;
        });

      // ================================================================ OUTSIDE
      const land = new THREE.Group(); // everything the tunnel hides
      outside.add(land);

      const sky = mesh(land, new THREE.SphereGeometry(900, 32, 16), track(skyMaterial({ horizon, zenith: lin(0.003, 0.005, 0.009), glow: lin(0.05, 0.036, 0.022) })));
      sky.renderOrder = -1;
      fallbacks.set(sky.material as THREE.Material, () => {
        sky.material = basic({ color: horizon, side: THREE.BackSide, fog: false, depthWrite: false });
      });

      // Hills, drawn so they tile: the ridge repeats every HILL_SPAN metres.
      const HILL_SPAN = 600;
      const hills: THREE.Mesh[] = [];
      const hill = (z: number, color: THREE.Color, amp: number, seed: number) => {
        const s = new THREE.Shape();
        s.moveTo(-1000, -30);
        for (let x = -1000; x <= 1600; x += 2) {
          const k = (x / HILL_SPAN) * Math.PI * 2;
          const ridge = 12 + amp * (Math.sin(k + seed) * 0.6 + Math.sin(k * 3 + seed * 2) * 0.28 + Math.sin(k * 7 + seed) * 0.12);
          const i = ((Math.round(x / 2) % (HILL_SPAN / 2)) + HILL_SPAN / 2) % (HILL_SPAN / 2);
          const n = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453;
          const r = n - Math.floor(n);
          s.lineTo(x, ridge + (r < 0.65 ? 0.6 + r * 2.4 : 0));
        }
        s.lineTo(1600, -30);
        const m = mesh(land, new THREE.ShapeGeometry(s), basic({ color, fog: false }), 0, GROUND, z);
        hills.push(m);
      };
      hill(-520, lin(0.009, 0.013, 0.017), 16, 3);
      hill(-400, lin(0.005, 0.007, 0.009), 10, 7);

      // Far lights: villages, a road on a hillside, one red light on a mast.
      const FAR_SPAN = 1400;
      const far = { pos: [] as number[], col: [] as number[], size: [] as number[], phase: [] as number[] };
      {
        const rnd = tx.seeded(401);
        for (let i = 0; i < 150; i++) {
          const z = -220 - rnd() * 150;
          const cluster = Math.floor(rnd() * 9);
          const x = -FAR_SPAN / 2 + ((cluster + rnd() * 0.35) / 9) * FAR_SPAN;
          far.pos.push(x, GROUND + 0.5 + rnd() * (z < -300 ? 16 : 4), z);
          const k = rnd();
          const c = k < 0.7 ? [1, 0.6, 0.28] : k < 0.9 ? [0.95, 0.88, 0.75] : [0.55, 0.75, 1];
          const b = 0.3 + rnd() * 1.1;
          far.col.push(c[0] * b, c[1] * b, c[2] * b);
          far.size.push(2.5 + rnd() * 5);
          far.phase.push(rnd() * 2);
        }
        far.pos.push(-120, GROUND + 34, -470);
        far.col.push(3, 0.25, 0.12);
        far.size.push(6);
        far.phase.push(-0.3);
      }
      const farGeo = track(new THREE.BufferGeometry());
      farGeo.setAttribute("position", new THREE.Float32BufferAttribute(far.pos, 3));
      farGeo.setAttribute("aColor", new THREE.Float32BufferAttribute(far.col, 3));
      farGeo.setAttribute("aSize", new THREE.Float32BufferAttribute(far.size, 1));
      farGeo.setAttribute("aPhase", new THREE.Float32BufferAttribute(far.phase, 1));
      const farMat = track(farLightsMaterial(1, FAR_SPAN));
      const farPoints = new THREE.Points(farGeo, farMat);
      farPoints.frustumCulled = false;
      land.add(farPoints);
      fallbacks.set(farMat, hide(farMat));

      /** Things that slide past and come round again, re-dressed each lap. */
      interface Slot {
        obj: THREE.Object3D;
        base: number;
        span: number;
        last: number;
        dress?: () => void;
        lamp?: THREE.Object3D;
      }
      const slots: Slot[] = [];
      const slot = (obj: THREE.Object3D, base: number, span: number, dress?: () => void) => {
        const s: Slot = { obj, base, span, last: base, dress };
        dress?.();
        slots.push(s);
        return s;
      };
      const chance = tx.seeded((Date.now() % 100000) + 11);

      // Flats and a few tall blocks toward town.
      const flatMats = Array.from({ length: 6 }, (_, i) => {
        const cols = 6 + (i % 3) * 3;
        const rows = 10 + ((i * 7) % 4) * 5;
        return { mat: basic({ map: tex(ct.flats(cols, rows, 900 + i)), color: lin(1.6, 1.6, 1.6) }), cols, rows };
      });
      const flatSide = basic({ color: 0x000000 });
      for (let i = 0; i < 7; i++) {
        const g = new THREE.Group();
        const b = mesh(g, new THREE.BoxGeometry(1, 1, 1), [flatSide, flatSide, flatSide, flatSide, flatMats[0].mat, flatSide]);
        const red = mesh(g, new THREE.SphereGeometry(0.35, 8, 6), basic({ color: lin(3, 0.2, 0.1), fog: false }));
        put(land, g, 0, 0, -150 - chance() * 60);
        slot(g, -400 + i * (800 / 7), 800, () => {
          const f = flatMats[Math.floor(chance() * flatMats.length)];
          const w = f.cols * 2.6;
          const h = f.rows * 2.8;
          (b.material as THREE.Material[])[4] = f.mat;
          b.scale.set(w, h, 10);
          b.position.y = GROUND + h / 2;
          red.position.set(0, GROUND + h + 0.6, 0);
          red.visible = h > 40;
          g.visible = chance() < 0.75;
        });
      }

      // Cedars in dark clumps.
      const cedarMat = basic({ alphaMap: tex(tx.treeline(77)), color: lin(0.004, 0.006, 0.006), transparent: true, alphaTest: 0.35 });
      for (let i = 0; i < 6; i++) {
        const t = mesh(land, new THREE.PlaneGeometry(60, 15), cedarMat, 0, 0, -80 - i * 9);
        slot(t, -250 + i * (500 / 6), 500, () => {
          const s = 0.6 + chance() * 0.8;
          t.scale.set(s, s, 1);
          t.position.y = GROUND + 7.5 * s - 1;
          t.visible = chance() < 0.7;
        });
      }

      // Fields, with flooded paddies holding the sky.
      const fieldMat = track(fieldMaterial(fog));
      const field = mesh(land, new THREE.PlaneGeometry(1400, 600), fieldMat, 0, GROUND - 0.05, -312);
      field.rotation.x = -Math.PI / 2;
      fallbacks.set(fieldMat, () => {
        field.material = lambert({ color: 0x0c110d });
      });

      // A road beside the line, lamps along it, now and then a car.
      const road = mesh(land, new THREE.PlaneGeometry(1400, 5), std({ color: 0x17191c, roughness: 0.75, normalMap: kit.relief("asphalt", [280, 1]), normalScale: nv(0.8) }, 0.5), 0, GROUND - 0.02, -24);
      road.rotation.x = -Math.PI / 2;
      const glowTex = tex(tx.softDot());
      const poolMat = basic({ map: glowTex, color: lin(0.5, 0.33, 0.16), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
      const lampHead = basic({ color: lin(4, 2.8, 1.6) });
      const lampHaze = track(hazeMaterial(lin(1, 0.7, 0.42), 0.09));
      fallbacks.set(lampHaze, hide(lampHaze));
      const poleMat = lambert({ color: 0x1a1d1f });
      const roadLamps: THREE.Object3D[] = [];
      for (let i = 0; i < 7; i++) {
        const g = new THREE.Group();
        mesh(g, new THREE.CylinderGeometry(0.07, 0.09, 6.5, 8), poleMat, 0, GROUND + 3.25, 0);
        box(g, 1.2, 0.08, 0.08, poleMat, 0, GROUND + 6.4, 0.55).rotation.y = Math.PI / 2;
        const head = box(g, 0.5, 0.1, 0.25, lampHead, 0, GROUND + 6.35, 1.1);
        head.rotation.y = Math.PI / 2;
        const cone = new THREE.CylinderGeometry(0.2, 3, 6.3, 16, 1, true);
        mesh(g, cone, lampHaze, 0, GROUND + 3.2, 1.1);
        const pool = mesh(g, new THREE.PlaneGeometry(9, 9), poolMat, 0, GROUND + 0.02, 1.1);
        pool.rotation.x = -Math.PI / 2;
        put(land, g, 0, 0, -27.5);
        roadLamps.push(g);
        slot(g, -210 + i * 60, 420, () => {
          g.visible = chance() < 0.8;
        });
      }
      // The car: a small hatchback, its headlights and their pool, crossing the view.
      const car = new THREE.Group();
      // Paint that shows only where light finds it: under the road lamps it comes up.
      const carPaint = lambert({ color: 0x3a4148, emissive: 0x14181d, emissiveIntensity: 1 });
      const carGlass = lambert({ color: 0x0b0f14, emissive: 0x06080b });
      const carTyre = lambert({ color: 0x07080a });
      box(car, 4.2, 0.62, 1.74, carPaint, 0, GROUND + 0.62, 0);
      box(car, 2.3, 0.56, 1.56, carPaint, -0.35, GROUND + 1.2, 0);
      box(car, 2.18, 0.4, 1.6, carGlass, -0.35, GROUND + 1.21, 0);
      box(car, 0.9, 0.05, 1.5, carPaint, -0.35, GROUND + 1.49, 0);
      for (const wx of [-1.35, 1.35]) {
        for (const wz of [-0.8, 0.8]) {
          const wheel = mesh(car, new THREE.CylinderGeometry(0.32, 0.32, 0.22, 14), carTyre, wx, GROUND + 0.32, wz);
          wheel.rotation.x = Math.PI / 2;
        }
      }
      const carBeam = basic({ map: glowTex, color: lin(2.5, 2.3, 2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
      const tail = basic({ map: glowTex, color: lin(2.5, 0.3, 0.2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
      for (const dz of [-0.7, 0.7]) {
        put(car, new THREE.Sprite(track(new THREE.SpriteMaterial({ map: glowTex, color: lin(2.6, 2.4, 2.1), blending: THREE.AdditiveBlending, depthWrite: false }))), 2.1, GROUND + 0.75, dz).scale.setScalar(0.9);
        put(car, new THREE.Sprite(track(new THREE.SpriteMaterial({ map: glowTex, color: lin(2, 0.2, 0.12), blending: THREE.AdditiveBlending, depthWrite: false }))), -2.1, GROUND + 0.8, dz).scale.setScalar(0.5);
      }
      const carPool = mesh(car, new THREE.PlaneGeometry(14, 4), carBeam, 9, GROUND + 0.03, 0);
      carPool.rotation.x = -Math.PI / 2;
      mesh(car, new THREE.PlaneGeometry(2, 2), tail, -2.6, GROUND + 0.03, 0).rotation.x = -Math.PI / 2;
      put(land, car, 0, 0, -23);
      const carState = { x: 0, v: 0, wait: 6 + chance() * 10, on: false };
      car.visible = false;

      // Houses, a window or two still lit.
      const houseShape = new THREE.Shape([new THREE.Vector2(-3, 0), new THREE.Vector2(3, 0), new THREE.Vector2(3, 3.2), new THREE.Vector2(0, 5.2), new THREE.Vector2(-3, 3.2)]);
      const houseGeo = track(new THREE.ExtrudeGeometry(houseShape, { depth: 7, bevelEnabled: false }));
      const houseMat = lambert({ color: 0x0e1110 });
      const winMats = [basic({ color: lin(2.2, 1.35, 0.55) }), basic({ color: lin(1.8, 1.5, 1.0) }), basic({ color: lin(0.9, 1.1, 1.6) })];
      const winGeo = track(new THREE.PlaneGeometry(1.1, 0.8));
      for (let i = 0; i < 12; i++) {
        const g = new THREE.Group();
        put(g, new THREE.Mesh(houseGeo, houseMat), 0, GROUND, -3.5);
        const wins = [0, 1, 2].map((k) => put(g, new THREE.Mesh(winGeo, winMats[0]), -1.8 + k * 1.8, GROUND + 1.7 + (k === 1 ? 0 : 0), 3.52));
        put(land, g, 0, 0, 0);
        slot(g, -180 + i * 30, 360, () => {
          g.position.z = -34 - chance() * 55;
          g.rotation.y = (chance() - 0.5) * 0.5;
          g.scale.setScalar(0.8 + chance() * 0.5);
          g.visible = chance() < 0.7;
          wins.forEach((w) => {
            w.visible = chance() < 0.35;
            w.material = winMats[chance() < 0.75 ? 0 : chance() < 0.7 ? 1 : 2];
          });
        });
      }

      // Poles right by the line; some carry a lamp that sweeps through the carriage.
      const nearLamps: THREE.Object3D[] = [];
      for (let i = 0; i < 3; i++) {
        const g = new THREE.Group();
        mesh(g, new THREE.CylinderGeometry(0.11, 0.14, 8.5, 8), poleMat, 0, GROUND + 4.25, 0);
        box(g, 0.1, 0.1, 1.8, poleMat, 0, GROUND + 7.8, 0);
        const lampG = new THREE.Group();
        box(lampG, 0.1, 0.1, 1.0, poleMat, 0, GROUND + 5.2, 0.5);
        box(lampG, 0.35, 0.08, 0.2, lampHead, 0, GROUND + 5.15, 1.0);
        mesh(lampG, new THREE.CylinderGeometry(0.15, 2.4, 5.1, 16, 1, true), lampHaze, 0, GROUND + 2.6, 1.0);
        const pool = mesh(lampG, new THREE.PlaneGeometry(7, 7), poolMat, 0, GROUND + 0.03, 1.0);
        pool.rotation.x = -Math.PI / 2;
        g.add(lampG);
        put(land, g, 0, 0, -8.5);
        const s = slot(g, -90 + i * 60, 180, () => {
          lampG.visible = chance() < 0.3;
        });
        s.lamp = lampG;
        nearLamps.push(g);
      }
      // Wires between them (level; the sag is lost at speed).
      const wireMat = track(new THREE.LineBasicMaterial({ color: lin(0.004, 0.005, 0.006) }));
      for (const y of [GROUND + 7.7, GROUND + 7.2]) {
        land.add(new THREE.Line(track(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-400, y, -8.5), new THREE.Vector3(400, y, -8.5)])), wireMat));
      }

      // The ballast and the other track, right beside the train.
      const groundMat = track(trackGroundMaterial(fog, tex(tx.gravel())));
      (groundMat.uniforms.tGravel.value as THREE.Texture).wrapS = THREE.RepeatWrapping;
      (groundMat.uniforms.tGravel.value as THREE.Texture).wrapT = THREE.RepeatWrapping;
      const trackside = mesh(land, new THREE.PlaneGeometry(240, 12), groundMat, 0, GROUND, -7);
      trackside.rotation.x = -Math.PI / 2;
      fallbacks.set(groundMat, () => {
        trackside.material = lambert({ color: 0x141412 });
      });

      outside.add(new THREE.HemisphereLight(lin(0.045, 0.06, 0.08), lin(0.008, 0.008, 0.008), 0.8));

      // ------------------------------------------------------------- tunnel
      const tunnelMat = track(tunnelWallMaterial(fog));
      const tunnelWall = mesh(outside, new THREE.PlaneGeometry(160, 9), tunnelMat, 0, 0.6, -2.2);
      tunnelWall.visible = false;
      fallbacks.set(tunnelMat, () => {
        tunnelWall.material = lambert({ color: 0x0b0b0a });
      });

      // ----------------------------------------------------------- platform
      // The same platform the walk onto the train crossed.
      const platform = buildPlatform(K, target.current.stationName);
      const plat = platform.group;
      plat.visible = false;
      outside.add(plat);
      const half = platform.half;
      const platLights = platform.lights;
      const drawSign = platform.drawSign;

      // ------------------------------------------------------------------ rain
      const rainLights = Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector4(0, -100, 0, 0));
      const rainColors = Array.from({ length: MAX_LIGHTS }, () => lin(1, 0.85, 0.65));
      const rr = tx.seeded(733);
      const quad = track(new THREE.PlaneGeometry(1, 1));
      const rainGeo = track(new THREE.InstancedBufferGeometry());
      rainGeo.index = quad.index;
      rainGeo.setAttribute("position", quad.getAttribute("position"));
      const RAIN = 1400;
      const seeds = new Float32Array(RAIN * 4);
      for (let i = 0; i < RAIN; i++) seeds.set([rr(), rr(), rr() * rr(), rr()], i * 4);
      rainGeo.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seeds, 4));
      rainGeo.instanceCount = RAIN;
      const coverMin = new THREE.Vector3(1, 1, 1);
      const coverMax = new THREE.Vector3(-1, -1, -1);
      const rainMat = track(
        rainMaterial({ lights: rainLights, colors: rainColors, min: new THREE.Vector3(-30, GROUND, -1.2), size: new THREE.Vector3(60, 10, -30), coverMin, coverMax, speed: 8.5, opacity: 0.5, fogDensity: 0.02 }),
      );
      const rain = new THREE.Mesh(rainGeo, rainMat);
      rain.frustumCulled = false;
      outside.add(rain);
      fallbacks.set(rainMat, hide(rainMat));

      // ================================================================= CABIN
      const tint = TINT[target.current.carriage].clone();
      const lights = cabinLights(tint);
      cabin.add(lights.group, lights.fill);
      const cabinLight = lights.main;
      const sweep = lights.sweep;
      // Lit from behind by whatever is outside the glass (set up with the post passes).
      const clothBack: ClothBacklight = { outside: null as unknown as THREE.Texture, res: new THREE.Vector2(1, 1), winMin: new THREE.Vector2(), winMax: new THREE.Vector2(), strength: 0.45 };
      // The carriage: moulded panel, brushed aluminium, a woven curtain.
      const mats = windowMaterials(K, target.current.carriage, clothBack);
      const curtainMat = mats.cloth;
      const glassMat = mats.glass;
      const interior = new THREE.Group();
      cabin.add(interior);
      // The curtain survives a relayout; it keeps how far it was drawn.
      let curtain: Curtain | null = null;
      let curtainCover = CURTAIN_REST;
      let curtainZ = -D + 0.05;
      let parts: ReturnType<typeof windowParts> | null = null;
      let wallGeo: THREE.BufferGeometry | null = null;

      const buildInterior = () => {
        const d = windowDims(camera.fov, camera.aspect);
        parts?.dispose();
        wallGeo?.dispose();
        interior.clear();
        // The wall, with the window cut out of it.
        const wallShape = new THREE.Shape([new THREE.Vector2(-3, -2.5), new THREE.Vector2(3, -2.5), new THREE.Vector2(3, 2.5), new THREE.Vector2(-3, 2.5)]);
        wallShape.holes.push(roundedRect(d.w, d.h, d.r, 0, d.cy));
        wallGeo = new THREE.ShapeGeometry(wallShape, 12);
        put(interior, new THREE.Mesh(wallGeo, mats.wall), 0, 0, -D);
        parts = windowParts(d, mats);
        interior.add(parts.group);
        glassMat.uniforms.uWin.value.set(d.w, d.h);
        curtainZ = parts.curtain.z;
        clothBack.winMin.set(-d.w / 2, d.cy - d.h / 2);
        clothBack.winMax.set(d.w / 2, d.cy + d.h / 2);
        if (curtain) {
          curtainCover = curtain.target;
          curtain.dispose();
        }
        curtain = new Curtain(curtainMat, { ...parts.curtain, cover: curtainCover });
        interior.add(curtain.mesh);
      };

      // ================================================================= POST
      const outTarget = pickTarget(renderer, floatOK);
      const target3 = pickTarget(renderer, floatOK);
      const hdr = target3.texture.type === THREE.HalfFloatType;
      log.set("frame buffer", `${hdr ? "half float" : "8-bit"}, msaa ${target3.samples}`);
      glassMat.uniforms.tOutside.value = outTarget.texture;
      clothBack.outside = outTarget.texture;
      const composer = new EffectComposer(renderer, target3);
      composer.addPass(new RenderPass(cabin, camera));
      const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.32, 0.35, hdr ? 1.0 : 0.85);
      composer.addPass(bloom);
      const output = new OutputPass();
      composer.addPass(output);
      const fxaa = new FXAAPass();
      fxaa.enabled = target3.samples === 0;
      composer.addPass(fxaa);
      const grade = new ShaderPass(GradeShader);
      grade.uniforms.uVignette.value = 0.5;
      composer.addPass(grade);
      fallbacks.set(grade.material, () => {
        grade.enabled = false;
      });
      disposables.push(bloom, output, fxaa, grade, composer, outTarget);

      // ============================================================== MOTION
      const start = target.current.mode;
      const st = {
        v: reduce ? 0 : start === "night" ? CRUISE : start === "tunnel" ? TUNNEL_CRUISE : 0,
        travel: 0,
        time: 0,
        tunnel: { on: start === "tunnel", from: -1e4, to: 1e4 },
        plat: { on: start === "platform" || start === "still", x: 0, end: start === "still" || target.current.terminal },
        jolt: 0,
        joint: 0,
        reflect: start === "tunnel" ? 0.14 : 0.08,
        // Already wet in the rain carriage: the glass you sat down at was.
        rain: target.current.carriage === "rain" ? 1 : 0,
        lastV: 0,
        drawn: 0,
      };
      st.lastV = st.v;
      // Starting at a platform, its light is already in the carriage (as it was as you sat down).
      if (st.plat.on) sweep.intensity = lights.platformSpill();
      if (st.plat.on) drawSign(target.current.stationName, st.plat.end);
      let level = 0;
      let clockAt = 0;
      let halfW = 1;
      let builtFor = "";

      const layout = () => {
        const w = mount.clientWidth || 1;
        const h = mount.clientHeight || 1;
        const q = QUALITY[level];
        const dpr = Math.min(window.devicePixelRatio || 1, q.dpr, Math.sqrt(2.4e6 / (w * h)));
        renderer.setPixelRatio(dpr);
        renderer.setSize(w, h, false);
        composer.setPixelRatio(dpr);
        composer.setSize(w, h);
        outTarget.setSize(Math.round(w * dpr), Math.round(h * dpr));
        bloom.enabled = q.bloom && hdr;
        grade.uniforms.uRes.value.set(w * dpr, h * dpr);
        glassMat.uniforms.uRes.value.set(Math.round(w * dpr), Math.round(h * dpr));
        clothBack.res.set(Math.round(w * dpr), Math.round(h * dpr));
        farMat.uniforms.uPixelRatio.value = dpr;
        const aspect = w / h;
        camera.aspect = outCam.aspect = aspect;
        camera.fov = outCam.fov = rideFov(aspect);
        camera.updateProjectionMatrix();
        outCam.updateProjectionMatrix();
        halfW = D * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * aspect;
        // Rebuild the window only when its shape changes, not on a quality step.
        const shape = `${w}x${h}`;
        if (shape !== builtFor) {
          builtFor = shape;
          buildInterior();
        }
        if (reduce) draw();
      };

      const update = (dt: number) => {
        const { mode: m, carriage: c, terminal: term } = target.current;
        st.time += dt;
        const moving = m === "night" || m === "tunnel";
        const cruise = m === "tunnel" ? TUNNEL_CRUISE : CRUISE;

        // A tunnel mouth arrives from ahead; leaving, its end does.
        if (m === "tunnel" && !st.tunnel.on) st.tunnel = { on: true, from: reduce ? -1e4 : 40, to: 1e4 };
        if (m !== "tunnel" && st.tunnel.on && st.tunnel.to > 1e3) st.tunnel.to = reduce ? -1e4 : 30;

        // A platform comes in far enough ahead to brake for it.
        if ((m === "platform" || m === "still") && !st.plat.on) {
          const brake = (st.v * st.v) / (2 * BRAKE);
          const clear = st.tunnel.on ? st.tunnel.to + half + 10 : 0;
          st.plat = { on: true, x: reduce ? 0 : Math.max(brake, clear, 0), end: m === "still" || term };
          drawSign(target.current.stationName, st.plat.end);
        }

        if (reduce) st.v = 0;
        else if (st.plat.on && !moving) {
          // Brake so the name board comes to rest at the window.
          const x = Math.max(0, st.plat.x);
          st.v = x < 0.02 ? 0 : Math.min(st.v + ACCEL * dt, Math.sqrt(2 * BRAKE * x));
        } else {
          st.v = Math.min(cruise, st.v + ACCEL * dt * (st.v < cruise ? 1 : -1));
          if (Math.abs(st.v - cruise) < ACCEL * dt) st.v = cruise;
        }
        const dx = st.v * dt;
        st.travel += dx;

        if (st.tunnel.on) {
          st.tunnel.from -= dx;
          if (st.tunnel.to < 1e3) st.tunnel.to -= dx;
          if (st.tunnel.to < -80) st.tunnel.on = false;
        }
        if (st.plat.on) {
          st.plat.x = Math.max(moving ? -1e4 : 0, st.plat.x - dx);
          if (reduce && !moving) st.plat.x = 0;
          if (st.plat.x < -(half + 80) || (reduce && moving)) st.plat.on = false;
        }

        // Rail joints: a small knock every 25 m.
        const joint = Math.floor(st.travel / 25);
        let knock = 0;
        if (joint !== st.joint) {
          st.joint = joint;
          st.jolt = Math.min(1, st.v / CRUISE);
          knock = st.jolt;
        }
        st.jolt *= Math.exp(-dt * 9);

        // The curtain feels the train: pulling away, braking, the joints, the roll.
        const accel = dt > 0 ? (st.v - st.lastV) / dt : 0;
        st.lastV = st.v;
        if (curtain) {
          curtain.update(dt, accel, knock, Math.sin(st.time * 0.9) * (st.v / CRUISE) + Math.sin(st.time * 2.3) * 0.3 * (st.v / CRUISE));
          const drawn = Math.max(0, (curtain.cover - CURTAIN_REST) / (1 - CURTAIN_REST));
          if (Math.abs(drawn - st.drawn) > 0.01) {
            st.drawn = drawn;
            curtainRef.current?.(drawn);
          }
        }

        // ---- apply
        const vis = halfW * 3 + 20;
        const covered = st.tunnel.on && st.tunnel.from < -vis && st.tunnel.to > vis;
        land.visible = !covered;
        tunnelWall.visible = st.tunnel.on;
        tunnelMat.uniforms.uStart.value = st.tunnel.from;
        tunnelMat.uniforms.uEnd.value = st.tunnel.to;
        tunnelMat.uniforms.uTravel.value = st.travel;
        tunnelMat.uniforms.uBlur.value = st.v / 30;
        plat.visible = st.plat.on;
        plat.position.x = st.plat.x;

        hills.forEach((h) => (h.position.x = -(st.travel % HILL_SPAN)));
        farMat.uniforms.uTravel.value = st.travel;
        farMat.uniforms.uTime.value = st.time;
        fieldMat.uniforms.uTravel.value = st.travel;
        // The road is one long plane; its surface slides with the distance travelled (5 m per tile).
        const roadRelief = (road.material as THREE.MeshStandardMaterial).normalMap;
        if (roadRelief) roadRelief.offset.x = (st.travel / 5) % 1;
        groundMat.uniforms.uTravel.value = st.travel;
        groundMat.uniforms.uBlur.value = st.v / 30;
        groundMat.uniforms.uSpill.value.copy(TINT[c]).multiplyScalar(0.45);
        const skyMat = sky.material as THREE.ShaderMaterial;
        if (skyMat.uniforms) skyMat.uniforms.uTime.value = st.time;
        for (const s of slots) {
          const x = wrap(s.base - st.travel, s.span);
          if (x > s.last + s.span / 2) s.dress?.();
          s.last = x;
          s.obj.position.x = x;
        }

        // The car on the road.
        if (!carState.on) {
          carState.wait -= dt;
          if (carState.wait <= 0 && !reduce && land.visible) {
            const dir = chance() < 0.5 ? 1 : -1;
            carState.v = dir * (10 + chance() * 8);
            const rel = carState.v - st.v;
            carState.x = rel < 0 ? 140 : -140;
            carState.on = true;
            car.rotation.y = dir > 0 ? 0 : Math.PI;
          }
        } else {
          carState.x += (carState.v - st.v) * dt;
          if (Math.abs(carState.x) > 150) {
            carState.on = false;
            carState.wait = 10 + chance() * 30;
          }
        }
        car.visible = carState.on;
        car.position.x = carState.x;
        if (carState.on) {
          // Nearest lit road lamp: the body catches its light as it passes beneath.
          let lit = 0;
          for (const g of roadLamps) {
            if (!g.visible) continue;
            const d = g.position.x - carState.x;
            lit = Math.max(lit, Math.exp(-(d * d) / 50));
          }
          carPaint.emissiveIntensity = 1 + lit * 5;
        }

        // Rain: outside only on the rain carriage; beads on the glass always a few.
        const wet = c === "rain";
        st.rain += ((wet ? 1 : 0) - st.rain) * Math.min(1, dt * 0.5);
        rain.visible = wet;
        rainMat.uniforms.uTime.value = st.time;
        rainMat.uniforms.uTravel.value = st.travel;
        rainMat.uniforms.uWind.value = -st.v / 8.5;
        if (st.plat.on) {
          coverMin.set(st.plat.x - half, -10, -6.4);
          coverMax.set(st.plat.x + half, PT + 3.2, -1.7);
        } else {
          coverMin.set(1, 1, 1);
          coverMax.set(-1, -1, -1);
        }
        // Rain catches the platform tubes and the road lamps.
        let li = 0;
        if (st.plat.on) for (const l of platLights) if (li < MAX_LIGHTS) rainLights[li++].set(st.plat.x + l.position.x, l.position.y, l.position.z, 1.4);
        for (const s of slots) if (s.lamp?.visible && s.obj.visible && li < MAX_LIGHTS) rainLights[li++].set(s.obj.position.x, GROUND + 5.1, -7.5, 3);
        while (li < MAX_LIGHTS) rainLights[li++].w = 0;

        // What lights the carriage from outside: tunnel lamps, a pole lamp, the platform.
        let sweepI = 0;
        if (st.tunnel.on) {
          // Lamps sit where (x + travel) mod 25 = 12.5; take the nearest.
          const lx = (((LAMP_EVERY / 2 - st.travel) % LAMP_EVERY) + LAMP_EVERY) % LAMP_EVERY;
          const x = lx > LAMP_EVERY / 2 ? lx - LAMP_EVERY : lx;
          if (x > st.tunnel.from && x < st.tunnel.to) {
            sweep.position.set(x, 0.6, -1.9);
            sweep.color.setRGB(1, 0.62, 0.3);
            sweepI = 3.2 * Math.exp(-(x * x) / 6);
          }
        } else if (st.plat.on && Math.abs(st.plat.x) < half) {
          sweep.position.set(0, 1.2, -2.2);
          sweep.color.setRGB(1, 0.9, 0.75);
          sweepI = 1.6;
        } else {
          for (const s of slots) {
            if (!s.lamp?.visible || !s.obj.visible) continue;
            const x = s.obj.position.x;
            if (Math.abs(x) < 12) {
              sweep.position.set(x, 1.6, -4);
              sweep.color.setRGB(1, 0.72, 0.42);
              sweepI = Math.max(sweepI, 2.2 * Math.exp(-(x * x) / 10));
            }
          }
        }
        sweep.intensity += (sweepI - sweep.intensity) * Math.min(1, dt * 12);

        // The carriage: its light, curtain colour, the glass.
        tint.lerp(TINT[c], Math.min(1, dt * 2));
        cabinLight.color.copy(tint);
        curtainMat.color.lerp(new THREE.Color(CURTAIN[c]), Math.min(1, dt * 2));
        curtainMat.sheenColor.copy(curtainMat.color).lerp(WHITE, 0.35);
        const reflectGoal = st.tunnel.on && covered ? 0.14 : st.plat.on && Math.abs(st.plat.x) < half ? 0.04 : 0.08;
        st.reflect += (reflectGoal - st.reflect) * Math.min(1, dt * 1.5);
        glassMat.uniforms.uReflect.value = st.reflect;
        glassMat.uniforms.uTint.value.copy(tint);
        // The page's clock, shared with the boarding view, so the drops carry straight on.
        glassMat.uniforms.uTime.value = performance.now() / 1000;
        glassMat.uniforms.uRain.value = st.rain;
        glassMat.uniforms.uSlant.value = -Math.min(1.4, (st.v / CRUISE) * 1.2);
        grade.uniforms.uTime.value = st.time;

        // You and the carriage ride together; the world outside sways.
        outCam.position.set(0, -0.004 * st.jolt + Math.sin(st.time * 1.7) * 0.0015 * (st.v / CRUISE), 0);
        outCam.rotation.set(Math.sin(st.time * 0.9) * 0.0012 * (st.v / CRUISE), 0, Math.sin(st.time * 0.6) * 0.0015 * (st.v / CRUISE));

        if (st.time - clockAt > 1) {
          clockAt = st.time;
          platform.tick(new Date());
        }
      };

      // ============================================================== RENDER
      let checked = false;
      let broken = false;
      let frames = 0;
      const draw = () => {
        if (broken) return;
        try {
          renderer.setRenderTarget(outTarget);
          renderer.render(outside, outCam);
          renderer.setRenderTarget(null);
          composer.render();
        } catch (err) {
          broken = true;
          fail("render failed", err);
          return;
        }
        frames += 1;
        if (checked) return;
        checked = true;
        const glError = renderer.getContext().getError();
        if (glError) log.note(`gl error after first frame: 0x${glError.toString(16)}`);
        const bad = (m: THREE.Material) => {
          const p = (renderer.properties.get(m) as { currentProgram?: { diagnostics?: { runnable: boolean } } }).currentProgram;
          return !!p?.diagnostics && !p.diagnostics.runnable;
        };
        if (bad(glassMat)) {
          broken = true;
          fail("glass shader failed");
          return;
        }
        fallbacks.forEach((fix, m) => {
          if (bad(m)) {
            log.note(`shader fallback: ${m.type}`);
            fix();
          }
        });
      };

      let raf = 0;
      let last = performance.now();
      let acc = 0;
      let interval = 1 / 60;
      let slowFor = 0;
      let warm = 0;
      let fpsFrom = performance.now();
      const frame = (now: number) => {
        raf = requestAnimationFrame(frame);
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        if (document.hidden) return;
        if (now - fpsFrom > 2000) {
          log.set("fps", String(Math.round((frames * 1000) / (now - fpsFrom))));
          frames = 0;
          fpsFrom = now;
        }
        acc += dt;
        const q = QUALITY[level];
        if (acc < 1 / q.fps - 0.004) return;
        const step = Math.min(acc, 0.1);
        acc = 0;
        update(step);
        draw();
        warm += step;
        interval = interval * 0.94 + dt * 0.06;
        if (warm > 2 && level < QUALITY.length - 1) {
          slowFor = interval > (q.fps >= 60 ? 1 / 45 : 1 / 26) ? slowFor + step : 0;
          if (slowFor > 2.5) {
            level += 1;
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
      // Warm up: draw once with everything that only shows up later (the
      // tunnel, a platform, cars, rain) so its shaders compile and textures
      // upload now, not with a stall halfway through the ride. Only the
      // second frame, drawn in the same task, ever reaches the screen.
      const hidden: THREE.Object3D[] = [];
      for (const s of [outside, cabin]) {
        s.traverse((o) => {
          if (!o.visible) {
            hidden.push(o);
            o.visible = true;
          }
        });
      }
      draw();
      hidden.forEach((o) => (o.visible = false));
      update(0.016);
      draw();
      window.dispatchEvent(new Event(SCENE_READY));
      if (!reduce) raf = requestAnimationFrame(frame);
      pokeRef.current = () => {
        if (reduce) {
          update(0.016);
          draw();
        }
      };
      void document.fonts?.ready.then(() => {
        if (!broken && st.plat.on) drawSign(target.current.stationName, st.plat.end);
      });
      const onVisibility = () => {
        last = performance.now();
      };
      document.addEventListener("visibilitychange", onVisibility);

      // ---- Touching the curtain: brush it, or take hold and pull it across.
      const ray = new THREE.Raycaster();
      const ndc = new THREE.Vector2();
      const onPlane = (e: PointerEvent) => {
        const r = mount.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return null;
        ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
        ray.setFromCamera(ndc, camera);
        const t = (curtainZ - ray.ray.origin.z) / ray.ray.direction.z;
        return t > 0 ? ray.ray.at(t, new THREE.Vector3()) : null;
      };
      const busy = (t: EventTarget | null) =>
        !!(t as Element | null)?.closest?.("button, a, input, textarea, select, label, [role=button], [role=slider], [role=dialog], dialog");
      let lastPoint: THREE.Vector3 | null = null;
      let tookHold = false;
      const cursor = (c: string) => {
        document.documentElement.style.cursor = c;
      };
      const settle = () => {
        if (!reduce || !curtain) return;
        curtain.update(0.2, 0, 0, 0);
        draw();
      };
      const onMove = (e: PointerEvent) => {
        if (!curtain) return;
        const p = onPlane(e);
        if (curtain.holding) {
          if (p) curtain.drag(p.x, p.y);
          settle();
          return;
        }
        const over = !!p && curtain.hit(p.x, p.y) && !busy(e.target);
        cursor(over ? "grab" : "");
        if (over && p && lastPoint) curtain.brush(p.x, p.y, p.x - lastPoint.x, p.y - lastPoint.y);
        lastPoint = over ? p : null;
      };
      const onDown = (e: PointerEvent) => {
        if (!curtain || busy(e.target)) return;
        const p = onPlane(e);
        if (!p || !curtain.hit(p.x, p.y)) return;
        tookHold = true;
        curtain.grab(p.x, p.y);
        cursor("grabbing");
        e.stopPropagation();
      };
      const onUp = () => {
        if (!curtain?.holding) return;
        curtain.release();
        cursor("");
        settle();
      };
      // The press that took the curtain shouldn't also tap whatever lies beneath it.
      const onClick = (e: MouseEvent) => {
        if (!tookHold) return;
        tookHold = false;
        e.stopPropagation();
        e.preventDefault();
      };
      window.addEventListener("pointermove", onMove, { passive: true });
      window.addEventListener("pointerdown", onDown, true);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
      window.addEventListener("click", onClick, true);

      return () => {
        pokeRef.current = null;
        cancelAnimationFrame(raf);
        ro.disconnect();
        document.removeEventListener("visibilitychange", onVisibility);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerdown", onDown, true);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        window.removeEventListener("click", onClick, true);
        cursor("");
        curtainRef.current?.(0);
        interior.children.forEach((c) => (c as THREE.Mesh).geometry?.dispose());
        disposables.forEach((d) => d.dispose());
        target3.dispose();
        log.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
        renderer.domElement.remove();
      };
    };

    try {
      return setup();
    } catch (err) {
      fail("unavailable", err);
      log.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    }
  }, []);

  return <div ref={mountRef} className={className} aria-hidden />;
}
