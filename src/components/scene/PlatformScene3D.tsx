"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { Reflector } from "three/examples/jsm/objects/Reflector.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { FXAAPass } from "three/examples/jsm/postprocessing/FXAAPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { complete, describe, floatSupport, isApple, pickTarget, sceneLog } from "./gl";
import { surfaceKit, withCavity } from "./surfaces";
import { GradeShader, MAX_LIGHTS, bokehMaterial, hazeMaterial, rainMaterial, skyMaterial, wetFloor } from "./platform/shaders";
import * as tx from "./platform/textures";

export interface PlatformSceneProps {
  /** `final` turns half the lights off and lets the rain stop. */
  mood?: "waiting" | "final";
  rain?: boolean;
  /** Printed on the hanging station sign. */
  stationName?: string;
  className?: string;
}

// The layout, in metres. The platform runs away from the camera along -z;
// the track lies on its left (x < 0), the station building on its right.
const PL_W = 5.2;
const Z_NEAR = 14;
const Z_FAR = -82;
const ROOF_FROM = 11;
const ROOF_TO = -27;
const ROOF_Y = 3.3;
const ROOF_EDGE = 0.35;
const TUBE_X = 1.55;
const TUBE_Y = 3.02;
const COLUMN_X = 3.2;
const RAIL_TOP = -0.84;
const BED_Y = -1.12;
const FOG = 0.021;

const TUBES = [3.2, -1.2, -5.6, -10, -14.4, -18.8, -23.2];
const COLUMNS = [5.4, -3.4, -12.2, -21];
const POSTS = [-38, -54];
const FLICKER = 3;

/** Quality steps, dropped one at a time if the device can't keep up. */
const QUALITY = [
  { dpr: 1.5, reflect: 0.5, bloom: true },
  { dpr: 1, reflect: 0.35, bloom: true },
  { dpr: 0.75, reflect: 0.3, bloom: false },
];

const lin = (r: number, g: number, b: number) => new THREE.Color().setRGB(r, g, b);

/**
 * A small country station at night, nearly empty: wet concrete that holds
 * the lamps, fluorescent tubes under a corrugated canopy, a lit waiting
 * room, two vending machines, rails running off into damp air, hills and a
 * few far lights. The camera only breathes; nothing performs. Rendered at
 * ~30fps, paused off-screen, one still frame for reduced motion, and it
 * steps its own quality down on slow devices.
 */
export default function PlatformScene3D({ mood = "waiting", rain = true, stationName = "NOCTURNE", className = "" }: PlatformSceneProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const moodRef = useRef(mood);
  const rainRef = useRef(rain);
  const nameRef = useRef(stationName);
  const apiRef = useRef<{ setName(name: string): void; poke(): void } | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "low-power" });
    } catch (err) {
      const log = sceneLog("platform");
      log.note(`no WebGL: ${String(err)}`);
      return () => log.dispose(); // The gradient behind stays.
    }
    const log = sceneLog("platform");
    describe(renderer, log);
    // Built in one go; if anything in it fails on this device, the page
    // keeps its quiet gradient instead of a broken canvas.
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
      /** Custom shaders, each with a plainer stand-in if it won't compile here. */
      const fallbacks = new Map<THREE.Material, () => void>();
      const hide = (m: THREE.Material) => () => scene.traverse((o) => {
        if ((o as THREE.Mesh).material === m) o.visible = false;
      });
      const disposables: { dispose(): void }[] = [];
      const track = <T extends { dispose(): void }>(x: T) => {
        disposables.push(x);
        return x;
      };

      const horizon = lin(0.014, 0.02, 0.026);
      const scene = new THREE.Scene();
      scene.fog = new THREE.FogExp2(lin(0.009, 0.013, 0.017), FOG);
      const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 600);

      const add = <T extends THREE.Object3D>(o: T, x = 0, y = 0, z = 0) => {
        o.position.set(x, y, z);
        scene.add(o);
        return o;
      };
      const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], x = 0, y = 0, z = 0) => add(new THREE.Mesh(track(geo), mat), x, y, z);
      const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number) => mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z);
      const lambert = (p: THREE.MeshLambertMaterialParameters) => track(new THREE.MeshLambertMaterial(p));
      const basic = (p: THREE.MeshBasicMaterialParameters) => track(new THREE.MeshBasicMaterial(p));
      const tex = (c: HTMLCanvasElement, repeat?: [number, number]) => track(tx.texture(c, { repeat }));

      // --------------------------------------------------------------- environment
      // A tiny studio for metal to reflect: a dark sky and one warm strip
      // overhead. It renders in half float, so only where the GPU can.
      let envMap: THREE.Texture | null = null;
      if (floatOK) {
        const pmrem = new THREE.PMREMGenerator(renderer);
        const envScene = new THREE.Scene();
        envScene.background = lin(0.012, 0.016, 0.022);
        const envStrip = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 40), new THREE.MeshBasicMaterial({ color: lin(2.5, 2.2, 1.8) }));
        envStrip.position.set(1, 3, 0);
        envScene.add(envStrip);
        const envGlow = new THREE.Mesh(new THREE.PlaneGeometry(80, 6), new THREE.MeshBasicMaterial({ color: lin(0.08, 0.07, 0.06) }));
        envGlow.position.set(0, 1, -30);
        envScene.add(envGlow);
        envMap = track(pmrem.fromScene(envScene, 0.03).texture);
        envStrip.geometry.dispose();
        (envStrip.material as THREE.Material).dispose();
        envGlow.geometry.dispose();
        (envGlow.material as THREE.Material).dispose();
        pmrem.dispose();
      }

      // ----------------------------------------------------------------- materials
      const floorLen = Z_NEAR - Z_FAR;
      const kit = surfaceKit(track);
      const std = (p: THREE.MeshStandardMaterialParameters, cavity = 0) => {
        const m = track(new THREE.MeshStandardMaterial(p));
        return cavity ? withCavity(m, cavity) : m;
      };
      const n = (x: number, y = x) => new THREE.Vector2(x, y);
      const mat = {
        coping: std({ color: 0x8c8a82, roughness: 0.85, normalMap: kit.relief("concrete", [0.4, floorLen / 2]), normalScale: n(0.7) }, 0.5),
        face: std({ color: 0x2c2b28, roughness: 0.95, normalMap: kit.relief("rough", [1, floorLen / 2]), normalScale: n(0.8) }, 0.4),
        gravel: std({ map: tex(tx.gravel(), [3, 44]), roughness: 0.92, normalMap: kit.relief("gravel", [4, 60]), normalScale: n(1.4) }, 0.7),
        sleeper: std({ color: 0x55534d, roughness: 0.9, normalMap: kit.relief("rough", [1, 1]), normalScale: n(0.8) }, 0.4),
        rail: track(new THREE.MeshStandardMaterial({ color: 0x9a9d9b, metalness: envMap ? 1 : 0.6, roughness: 0.3, envMap, normalMap: kit.relief("brushed", [1, 200]), normalScale: n(0.3) })),
        metal: track(new THREE.MeshStandardMaterial({ color: 0x3a403d, metalness: 0.7, roughness: 0.45, envMap, envMapIntensity: 0.6, normalMap: kit.relief("brushed", [1, 1]), normalScale: n(0.4) })),
        paint: std({ color: 0xb4ae9c, roughness: 0.6, normalMap: kit.relief("plaster", [1, 2]), normalScale: n(0.4) }, 0.35),
        beam: std({ color: 0x565a54, roughness: 0.55, metalness: 0.3, normalMap: kit.relief("brushed", [2, 2]), normalScale: n(0.4) }),
        roof: std(
          {
            map: tex(tx.roofSheet(), [1, (ROOF_FROM - ROOF_TO) / 0.24]),
            roughness: 0.55,
            metalness: 0.25,
            normalMap: kit.relief("ribs", [1, (ROOF_FROM - ROOF_TO) / 0.96], Math.PI / 2),
            normalScale: n(0.6),
          },
          0.3,
        ),
        housing: std({ color: 0xc9c8c0, roughness: 0.5 }),
        wall: std({ map: tex(tx.woodWall(), [30 / 3, 1]), roughness: 0.8, normalMap: kit.relief("boards", [(30 / 3) * 1.8, 1]), normalScale: n(0.9) }, 0.5),
        frame: std({ color: 0x2b2a26, roughness: 0.6 }),
        seat: std({ color: 0x3f6a70, roughness: 0.42 }),
        grass: lambert({ map: tex(tx.grass(), [40, 60]) }),
        dark: lambert({ color: 0x121513 }),
        shadow: basic({ map: tex(tx.softDot()), color: 0x000000, transparent: true, opacity: 0.6, depthWrite: false }),
      };

      // -------------------------------------------------------------------- lights
      // Every lamp also lights the rain; the shader reads these slots.
      const rainLights = Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector4(0, -100, 0, 0));
      const rainColors = Array.from({ length: MAX_LIGHTS }, () => new THREE.Color(0, 0, 0));
      interface Lamp {
        light: THREE.PointLight;
        base: number;
        rain: number;
        slot: number;
        ratio: number;
        glow?: THREE.MeshBasicMaterial;
        glowColor?: THREE.Color;
        haze?: THREE.ShaderMaterial;
        hazeBase?: number;
      }
      const lamps: Lamp[] = [];
      const lamp = (color: THREE.Color, intensity: number, distance: number, pos: THREE.Vector3, rainWeight: number) => {
        const light = add(new THREE.PointLight(color, intensity, distance, 2), pos.x, pos.y, pos.z);
        const slot = lamps.length;
        rainLights[slot].set(pos.x, pos.y, pos.z, rainWeight);
        rainColors[slot].copy(color);
        const l: Lamp = { light, base: intensity, rain: rainWeight, slot, ratio: 1 };
        lamps.push(l);
        return l;
      };

      /** A soft shaft of light: an open frustum from the lamp down to the floor. */
      const frustum = (top: [number, number], bottom: [number, number], height: number) => {
        const [tx0, tz0] = top;
        const [bx0, bz0] = bottom;
        const t = [
          [-tx0, height, -tz0],
          [tx0, height, -tz0],
          [tx0, height, tz0],
          [-tx0, height, tz0],
        ];
        const b = [
          [-bx0, 0, -bz0],
          [bx0, 0, -bz0],
          [bx0, 0, bz0],
          [-bx0, 0, bz0],
        ];
        const pos: number[] = [];
        const uv: number[] = [];
        for (let i = 0; i < 4; i++) {
          const j = (i + 1) % 4;
          pos.push(...b[i], ...b[j], ...t[j], ...b[i], ...t[j], ...t[i]);
          uv.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
        geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
        geo.computeVertexNormals();
        return geo;
      };

      // --------------------------------------------------------------- the floor
      // Wet concrete with a real (blurred) reflection of everything above it.
      const floor = new Reflector(track(new THREE.PlaneGeometry(PL_W, floorLen)), { textureWidth: 256, textureHeight: 256, multisample: 0 });
      const reflectTarget = floor.getRenderTarget();
      // Mipmapped half-float needs a colour-buffer extension; bytes otherwise.
      // Half float keeps the lamps bright in puddles; 8-bit (mipmaps on it work
      // everywhere) on Apple and on GPUs without float targets.
      if (!floatOK || isApple() || !complete(renderer, reflectTarget)) {
        reflectTarget.dispose();
        reflectTarget.texture.type = THREE.UnsignedByteType;
      }
      log.set("reflection", `${reflectTarget.texture.type === THREE.HalfFloatType ? "half float" : "8-bit"}, ${complete(renderer, reflectTarget) ? "ok" : "incomplete"}`);
      reflectTarget.texture.generateMipmaps = true;
      reflectTarget.texture.minFilter = THREE.LinearMipmapLinearFilter;
      const reflectorMaterial = floor.material as THREE.ShaderMaterial;
      const floorUniforms = {
        tReflect: { value: reflectTarget.texture as THREE.Texture },
        textureMatrix: { value: reflectorMaterial.uniforms.textureMatrix.value as THREE.Matrix4 },
        uTime: { value: 0 },
        uRain: { value: rainRef.current ? 1 : 0 },
        uRoof: { value: new THREE.Vector3(ROOF_EDGE, ROOF_FROM, ROOF_TO) },
      };
      reflectorMaterial.dispose();
      const floorMat = track(
        new THREE.MeshStandardMaterial({
          map: tex(tx.concrete(), [2, floorLen / 2.6]),
          roughness: 1,
          roughnessMap: kit.roughness(0.82, 0.14, 91, [3, floorLen / 3]),
          normalMap: kit.relief("concrete", [2.6, floorLen / 2]),
          normalScale: new THREE.Vector2(0.55, 0.55),
        }),
      );
      wetFloor(floorMat, floorUniforms);
      fallbacks.set(floorMat, () => {
        floorMat.onBeforeCompile = () => {};
        floorMat.customProgramCacheKey = () => "nocturne-plain-floor";
        floorMat.needsUpdate = true;
      });
      floor.material = floorMat;
      floor.rotation.x = -Math.PI / 2;
      add(floor, PL_W / 2, 0, (Z_NEAR + Z_FAR) / 2);
      disposables.push({ dispose: () => floor.dispose() });

      // The coping stone and the dark face of the platform under it.
      box(0.46, 0.14, floorLen, mat.coping, 0.2, -0.072, (Z_NEAR + Z_FAR) / 2);
      box(0.3, 1.0, floorLen, mat.face, 0.32, -0.64, (Z_NEAR + Z_FAR) / 2);

      // ------------------------------------------------------------------ the track
      const bed = mesh(new THREE.PlaneGeometry(8, floorLen + 60), mat.gravel, -3.55, BED_Y, (Z_NEAR + Z_FAR) / 2 - 20);
      bed.rotation.x = -Math.PI / 2;
      const SLEEPERS = 240;
      const sleepers = new THREE.InstancedMesh(track(new THREE.BoxGeometry(2.1, 0.15, 0.22)), mat.sleeper, SLEEPERS);
      const m4 = new THREE.Matrix4();
      for (let i = 0; i < SLEEPERS; i++) {
        m4.makeTranslation(-1.735, BED_Y + 0.09, Z_NEAR + 4 - i * 0.6);
        sleepers.setMatrixAt(i, m4);
      }
      scene.add(sleepers);
      for (const x of [-1.2, -2.27]) box(0.07, 0.16, floorLen + 70, mat.rail, x, RAIL_TOP - 0.08, (Z_NEAR + Z_FAR) / 2 - 30);
      const field = mesh(new THREE.PlaneGeometry(220, 400), mat.grass, -117.5, BED_Y - 0.04, -150);
      field.rotation.x = -Math.PI / 2;

      // --------------------------------------------------------------- the canopy
      const roofLen = ROOF_FROM - ROOF_TO;
      const roofZ = (ROOF_FROM + ROOF_TO) / 2;
      const roofW = PL_W - ROOF_EDGE;
      const roof = mesh(new THREE.PlaneGeometry(roofW, roofLen), mat.roof, ROOF_EDGE + roofW / 2, ROOF_Y, roofZ);
      roof.rotation.x = Math.PI / 2;
      box(0.07, 0.44, roofLen, mat.paint, ROOF_EDGE, ROOF_Y - 0.1, roofZ); // fascia
      const gutter = mesh(new THREE.CylinderGeometry(0.05, 0.05, roofLen, 10), mat.metal, ROOF_EDGE - 0.07, ROOF_Y + 0.06, roofZ);
      gutter.rotation.x = Math.PI / 2;
      box(0.14, 0.24, roofLen, mat.beam, COLUMN_X, ROOF_Y - 0.12, roofZ);
      for (const z of COLUMNS) {
        mesh(new THREE.CylinderGeometry(0.085, 0.095, ROOF_Y, 16), mat.paint, COLUMN_X, ROOF_Y / 2, z);
        mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.08, 16), mat.beam, COLUMN_X, 0.04, z);
        box(roofW, 0.22, 0.12, mat.beam, ROOF_EDGE + roofW / 2, ROOF_Y - 0.11, z);
        // Diagonal brace toward the platform edge.
        const brace = box(1.5, 0.08, 0.08, mat.beam, COLUMN_X - 0.62, ROOF_Y - 0.42, z);
        brace.rotation.z = -0.5;
        const shadow = mesh(new THREE.PlaneGeometry(0.9, 0.9), mat.shadow, COLUMN_X, 0.003, z);
        shadow.rotation.x = -Math.PI / 2;
      }

      // Fluorescent fittings. Each tube has its own material so it can dim.
      const tubeColor = lin(2.6, 2.35, 1.95);
      const tubeGeo = track(new THREE.CylinderGeometry(0.022, 0.022, 1.24, 10));
      tubeGeo.rotateX(Math.PI / 2);
      TUBES.forEach((z, i) => {
        box(0.2, 0.07, 1.36, mat.housing, TUBE_X, TUBE_Y + 0.06, z);
        box(0.03, ROOF_Y - TUBE_Y - 0.08, 0.03, mat.metal, TUBE_X, (ROOF_Y + TUBE_Y + 0.08) / 2, z - 0.5);
        box(0.03, ROOF_Y - TUBE_Y - 0.08, 0.03, mat.metal, TUBE_X, (ROOF_Y + TUBE_Y + 0.08) / 2, z + 0.5);
        // Old tubes never quite match: one runs a little green, one a little pink.
        const tint = i === 2 ? lin(0.94, 1, 0.9) : i === 5 ? lin(1, 0.95, 0.96) : lin(1, 1, 1);
        const color = tubeColor.clone().multiply(tint);
        const glow = basic({ color: color.clone() });
        add(new THREE.Mesh(tubeGeo, glow), TUBE_X, TUBE_Y, z);
        const l = lamp(lin(1, 0.88, 0.72).multiply(tint), 6.5, 10, new THREE.Vector3(TUBE_X, TUBE_Y - 0.15, z), 1.6);
        l.glow = glow;
        l.glowColor = color;
        const haze = track(hazeMaterial(lin(1, 0.88, 0.7), 0.045));
        fallbacks.set(haze, hide(haze));
        add(new THREE.Mesh(track(frustum([0.12, 0.66], [1.5, 2.1], TUBE_Y - 0.05)), haze), TUBE_X, 0, z);
        l.haze = haze;
        l.hazeBase = 0.045;
      });

      // ------------------------------------------------------ the station building
      const WALL_FROM = 7;
      const WALL_TO = -19;
      const wall = mesh(new THREE.PlaneGeometry(WALL_FROM - WALL_TO, ROOF_Y + 0.1), mat.wall, PL_W, (ROOF_Y + 0.1) / 2, (WALL_FROM + WALL_TO) / 2);
      wall.rotation.y = -Math.PI / 2;
      const wallShadow = mesh(new THREE.PlaneGeometry(0.9, WALL_FROM - WALL_TO), mat.shadow, PL_W - 0.1, 0.003, (WALL_FROM + WALL_TO) / 2);
      wallShadow.rotation.x = -Math.PI / 2;
      box(0.4, ROOF_Y + 0.1, 0.4, mat.frame, PL_W + 0.1, (ROOF_Y + 0.1) / 2, WALL_TO); // corner post

      const windowTex = tex(tx.windowGlow());
      for (const z of [-9.5, -13.5]) {
        const w = mesh(new THREE.PlaneGeometry(1.5, 1.1), basic({ map: windowTex, color: lin(1.5, 1.4, 1.3) }), PL_W - 0.012, 1.6, z);
        w.rotation.y = -Math.PI / 2;
        box(0.08, 0.06, 1.66, mat.frame, PL_W - 0.04, 1.02, z); // sill
        box(0.05, 0.06, 1.6, mat.frame, PL_W - 0.02, 2.18, z);
      }
      const windowLight = lamp(lin(1, 0.6, 0.3), 2.4, 6, new THREE.Vector3(PL_W - 0.9, 1.6, -11.5), 0);

      // The door, with a small lit sign over it.
      const door = mesh(new THREE.PlaneGeometry(1.6, 2.15), basic({ color: lin(0.09, 0.05, 0.028) }), PL_W - 0.012, 1.075, -17);
      door.rotation.y = -Math.PI / 2;
      box(0.06, 2.2, 0.05, mat.frame, PL_W - 0.03, 1.1, -17);
      const doorSign = document.createElement("canvas");
      doorSign.width = 256;
      doorSign.height = 56;
      const fonts = tx.pageFonts();
      {
        const g = doorSign.getContext("2d")!;
        g.fillStyle = "#efe9dc";
        g.fillRect(0, 0, 256, 56);
        g.fillStyle = "#23302b";
        g.font = `500 22px ${fonts.mono}`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText("WAITING ROOM", 128, 29);
      }
      const doorSignMesh = mesh(new THREE.PlaneGeometry(0.9, 0.2), basic({ map: tex(doorSign), color: lin(0.9, 0.88, 0.85) }), PL_W - 0.03, 2.45, -17);
      doorSignMesh.rotation.y = -Math.PI / 2;

      // Posters near the camera.
      ([0, 1] as const).forEach((k) => {
        const p = mesh(new THREE.PlaneGeometry(0.56, 0.78), lambert({ map: tex(tx.poster(k)) }), PL_W - 0.012, 1.5, 1.2 - k * 1.1);
        p.rotation.y = -Math.PI / 2;
      });

      // Two vending machines: the one cool light on the platform.
      ([
        [-4.6, "#dfe2de", 61],
        [-5.65, "#a0322c", 62],
      ] as const).forEach(([z, body, seed]) => {
        const bodyMat = std({ color: new THREE.Color(body), roughness: 0.35, metalness: 0.15 });
        box(0.72, 1.84, 1.0, bodyMat, PL_W - 0.38, 0.92, z);
        const face = mesh(new THREE.PlaneGeometry(0.96, 1.8), basic({ map: tex(tx.vendingFace(body, seed)), color: lin(1.2, 1.25, 1.3) }), PL_W - 0.745, 0.92, z);
        face.rotation.y = -Math.PI / 2;
        const s = mesh(new THREE.PlaneGeometry(1.5, 1.6), mat.shadow, PL_W - 0.5, 0.003, z);
        s.rotation.x = -Math.PI / 2;
      });
      lamp(lin(0.72, 0.87, 1), 4.2, 6, new THREE.Vector3(PL_W - 1.3, 1.2, -5.1), 0);

      // Benches: moulded seats on a steel rail, facing the track.
      const seatGeo = track(new RoundedBoxGeometry(0.46, 0.06, 0.42, 2, 0.025));
      const backGeo = track(new RoundedBoxGeometry(0.46, 0.4, 0.05, 2, 0.02));
      for (const zc of [-11.5, -22.5]) {
        box(0.08, 0.06, 1.6, mat.metal, PL_W - 0.5, 0.38, zc);
        for (const dz of [-0.62, 0.62]) box(0.06, 0.38, 0.06, mat.metal, PL_W - 0.5, 0.19, zc + dz);
        for (const dz of [-0.5, 0, 0.5]) {
          const seat = add(new THREE.Mesh(seatGeo, mat.seat), PL_W - 0.52, 0.44, zc + dz);
          seat.rotation.y = Math.PI / 2;
          const back = add(new THREE.Mesh(backGeo, mat.seat), PL_W - 0.3, 0.68, zc + dz);
          back.rotation.y = Math.PI / 2;
          back.rotation.x = -0.12;
        }
        const s = mesh(new THREE.PlaneGeometry(1.1, 2.2), mat.shadow, PL_W - 0.5, 0.003, zc);
        s.rotation.x = -Math.PI / 2;
      }

      // The hanging station sign, a lightbox.
      const signCanvas = tx.stationSign(nameRef.current, fonts);
      const signTex = tex(signCanvas);
      box(1.98, 0.52, 0.1, mat.frame, TUBE_X, 2.5, -7.8);
      const signFace = mesh(new THREE.PlaneGeometry(1.9, 0.475), basic({ map: signTex, color: lin(0.95, 0.95, 0.92) }), TUBE_X, 2.5, -7.745);
      signFace.renderOrder = 1;
      for (const dx of [-0.8, 0.8]) box(0.025, ROOF_Y - 2.76, 0.025, mat.metal, TUBE_X + dx, (ROOF_Y + 2.76) / 2, -7.8);
      const setName = (name: string) => {
        const next = tx.stationSign(name, tx.pageFonts());
        signCanvas.getContext("2d")!.drawImage(next, 0, 0);
        signTex.needsUpdate = true;
      };

      // The platform clock on a column.
      const clockCanvas = tx.clockCanvas();
      tx.drawClock(clockCanvas, new Date());
      const clockTex = tex(clockCanvas);
      let clockMinute = new Date().getMinutes();
      mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.07, 32), mat.frame, COLUMN_X, 2.45, COLUMNS[1] + 0.14).rotation.x = Math.PI / 2;
      mesh(new THREE.CircleGeometry(0.23, 40), lambert({ map: clockTex, emissive: lin(0.25, 0.25, 0.24), emissiveMap: clockTex }), COLUMN_X, 2.45, COLUMNS[1] + 0.18);
      box(0.05, 0.05, 0.12, mat.metal, COLUMN_X, 2.45, COLUMNS[1] + 0.06);

      // ------------------------------------------------ beyond the canopy, right
      // Lamp posts in the open, where the rain shows.
      POSTS.forEach((z) => {
        mesh(new THREE.CylinderGeometry(0.055, 0.07, 4.4, 10), mat.metal, PL_W - 0.5, 2.2, z);
        box(0.9, 0.06, 0.06, mat.metal, PL_W - 0.9, 4.35, z);
        box(0.46, 0.08, 0.22, mat.frame, PL_W - 1.3, 4.3, z);
        const color = lin(3, 2.1, 1.25);
        const glow = basic({ color: color.clone() });
        const head = mesh(new THREE.PlaneGeometry(0.4, 0.18), glow, PL_W - 1.3, 4.255, z);
        head.rotation.x = Math.PI / 2;
        const l = lamp(lin(1, 0.7, 0.42), 20, 16, new THREE.Vector3(PL_W - 1.3, 4.1, z), 5);
        l.glow = glow;
        l.glowColor = color;
        const haze = track(hazeMaterial(lin(1, 0.72, 0.45), 0.07));
        fallbacks.set(haze, hide(haze));
        add(new THREE.Mesh(track(frustum([0.2, 0.12], [2.6, 2.6], 4.2)), haze), PL_W - 1.3, 0, z);
        l.haze = haze;
        l.hazeBase = 0.07;
      });

      // A fence, and dark shrubs behind it.
      for (let z = WALL_TO - 1; z > Z_FAR; z -= 2.4) box(0.05, 1.1, 0.05, mat.metal, PL_W - 0.1, 0.55, z);
      for (const y of [0.55, 1.05]) box(0.035, 0.035, WALL_TO - Z_FAR, mat.metal, PL_W - 0.1, y, (WALL_TO + Z_FAR) / 2);
      const silhouette = (c: HTMLCanvasElement, color: THREE.Color) => basic({ alphaMap: tex(c), color, transparent: true, alphaTest: 0.35, depthWrite: true });
      const shrubsMesh = mesh(new THREE.PlaneGeometry(WALL_TO - Z_FAR, 2.2), silhouette(tx.shrubs(71), lin(0.006, 0.009, 0.008)), PL_W + 1.6, 1.0, (WALL_TO + Z_FAR) / 2);
      shrubsMesh.rotation.y = -Math.PI / 2;
      const cedarsRight = mesh(new THREE.PlaneGeometry(90, 16), silhouette(tx.treeline(73), lin(0.004, 0.006, 0.006)), 22, 6.8, -60);
      cedarsRight.rotation.y = -Math.PI / 2.6;

      // ------------------------------------------------- beyond the track, left
      // Utility poles with sagging wires.
      const poleZ = [16, -16, -48, -80, -112, -144];
      poleZ.forEach((z) => {
        mesh(new THREE.CylinderGeometry(0.1, 0.13, 9, 8), mat.dark, -7.2, BED_Y + 4.5, z);
        box(1.7, 0.1, 0.1, mat.dark, -7.2, BED_Y + 8.2, z);
      });
      const wireMat = track(new THREE.LineBasicMaterial({ color: lin(0.003, 0.004, 0.005), transparent: true, opacity: 0.85 }));
      for (const dx of [-0.75, 0.75]) {
        const pts: THREE.Vector3[] = [];
        for (let i = 0; i < poleZ.length - 1; i++) {
          for (let k = 0; k <= 16; k++) {
            const t = k / 16;
            pts.push(new THREE.Vector3(-7.2 + dx, BED_Y + 8.25 - Math.sin(t * Math.PI) * 0.55, poleZ[i] + (poleZ[i + 1] - poleZ[i]) * t));
          }
        }
        scene.add(new THREE.Line(track(new THREE.BufferGeometry().setFromPoints(pts)), wireMat));
      }

      // A signal far down the line: green while waiting, red at the end of the night.
      mesh(new THREE.CylinderGeometry(0.06, 0.07, 3.8, 8), mat.dark, -3.4, BED_Y + 1.9, -62);
      box(0.32, 0.72, 0.18, mat.dark, -3.4, BED_Y + 3.9, -62);
      const signalColor = lin(0.15, 3.2, 1.5);
      const signalLens = basic({ color: signalColor.clone(), fog: false });
      mesh(new THREE.CircleGeometry(0.075, 20), signalLens, -3.4, BED_Y + 4.05, -61.9);
      const glowTex = tex(tx.softDot());
      const signalGlow = new THREE.SpriteMaterial({ map: glowTex, color: lin(0.05, 0.6, 0.3), blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
      track(signalGlow);
      add(new THREE.Sprite(signalGlow), -3.4, BED_Y + 4.05, -61.8).scale.setScalar(1.3);

      // ------------------------------------------------------------ sky and hills
      const sky = mesh(new THREE.SphereGeometry(500, 32, 16), track(skyMaterial({ horizon, zenith: lin(0.003, 0.005, 0.009), glow: lin(0.05, 0.036, 0.022) })));
      sky.renderOrder = -1;
      fallbacks.set(sky.material as THREE.Material, () => {
        sky.material = basic({ color: horizon, side: THREE.BackSide, fog: false, depthWrite: false });
      });
      const hills = (z: number, color: THREE.Color, amp: number, seed: number) => {
        const rnd = tx.seeded(seed);
        const s = new THREE.Shape();
        s.moveTo(-420, -10);
        let x = -420;
        while (x <= 420) {
          const ridge = 10 + Math.sin(x * 0.011 + seed) * amp + Math.sin(x * 0.037 + seed * 2) * amp * 0.35;
          // Cedars along the ridge: uneven spires, with gaps.
          const w = 0.6 + rnd() * 1.6;
          const tall = rnd() < 0.7 ? 0.5 + rnd() * rnd() * 2.6 : 0;
          s.lineTo(x, ridge);
          if (tall) s.lineTo(x + w / 2, ridge + tall);
          x += w;
        }
        s.lineTo(420, -10);
        const m = mesh(new THREE.ShapeGeometry(s), basic({ color, fog: false }), 0, BED_Y, z);
        m.renderOrder = 0;
        return m;
      };
      hills(-300, lin(0.009, 0.013, 0.017), 9, 3);
      hills(-200, lin(0.005, 0.007, 0.009), 6, 7);

      // Far lights: windows, street lamps, one slow red light on a mast.
      const rnd = tx.seeded(97);
      const far: number[] = [];
      const farColor: number[] = [];
      const farSize: number[] = [];
      const farPhase: number[] = [];
      for (let i = 0; i < 80; i++) {
        const z = -45 - rnd() * 150;
        const x = -150 + rnd() * 170;
        if (x > -8) continue;
        far.push(x, BED_Y + 0.4 + rnd() * (z < -170 ? 10 : 2.5), z);
        const k = rnd();
        const c = k < 0.7 ? [1, 0.6, 0.28] : k < 0.9 ? [0.95, 0.88, 0.75] : [0.55, 0.75, 1];
        const b = 0.35 + rnd() * 1.2;
        farColor.push(c[0] * b, c[1] * b, c[2] * b);
        farSize.push(3 + rnd() * 6);
        farPhase.push(rnd() * 2);
      }
      far.push(-70, BED_Y + 26, -290);
      farColor.push(3, 0.25, 0.12);
      farSize.push(7);
      farPhase.push(-0.3);
      const farGeo = track(new THREE.BufferGeometry());
      farGeo.setAttribute("position", new THREE.Float32BufferAttribute(far, 3));
      farGeo.setAttribute("aColor", new THREE.Float32BufferAttribute(farColor, 3));
      farGeo.setAttribute("aSize", new THREE.Float32BufferAttribute(farSize, 1));
      farGeo.setAttribute("aPhase", new THREE.Float32BufferAttribute(farPhase, 1));
      const farMat = track(bokehMaterial(1));
      fallbacks.set(farMat, hide(farMat));
      scene.add(new THREE.Points(farGeo, farMat));

      scene.add(new THREE.HemisphereLight(lin(0.045, 0.06, 0.08), lin(0.008, 0.008, 0.008), 0.9));

      // ---------------------------------------------------------------- the rain
      // On its own layer, so the floor doesn't reflect it.
      const quad = track(new THREE.PlaneGeometry(1, 1));
      const rainMesh = (count: number, opts: Parameters<typeof rainMaterial>[0], seed: (i: number) => [number, number, number, number]) => {
        const geo = track(new THREE.InstancedBufferGeometry());
        geo.index = quad.index;
        geo.setAttribute("position", quad.getAttribute("position"));
        const seeds = new Float32Array(count * 4);
        for (let i = 0; i < count; i++) seeds.set(seed(i), i * 4);
        geo.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seeds, 4));
        geo.instanceCount = count;
        const m = track(rainMaterial(opts));
      fallbacks.set(m, hide(m));
        const obj = new THREE.Mesh(geo, m);
        obj.frustumCulled = false;
        obj.layers.set(1);
        scene.add(obj);
        return m;
      };
      const coverMin = new THREE.Vector3(ROOF_EDGE, -10, ROOF_TO);
      const coverMax = new THREE.Vector3(100, ROOF_Y, ROOF_FROM);
      const rr = tx.seeded(131);
      const RAIN_OPACITY = 0.45;
      const rainMat = rainMesh(
        2000,
        { lights: rainLights, colors: rainColors, min: new THREE.Vector3(-7, BED_Y, -50), size: new THREE.Vector3(12.2, 10, 62), coverMin, coverMax, speed: 8.5, opacity: RAIN_OPACITY, fogDensity: FOG },
        () => [rr(), rr(), rr(), rr()],
      );
      const drips = (ROOF_FROM - ROOF_TO) / 0.35;
      const dripMat = rainMesh(
        150,
        { lights: rainLights, colors: rainColors, min: new THREE.Vector3(ROOF_EDGE - 0.1, 0, ROOF_TO), size: new THREE.Vector3(0.06, ROOF_Y, ROOF_FROM - ROOF_TO), speed: 6, opacity: 0.8, fogDensity: FOG },
        () => [rr(), rr(), Math.floor(rr() * drips) / drips, rr()],
      );

      // ----------------------------------------------------------------- post
      // HDR with MSAA where the GPU can render to it; plainer targets where not.
      const target = pickTarget(renderer, floatOK);
      log.set("frame buffer", `${target.texture.type === THREE.HalfFloatType ? "half float" : "8-bit"}, msaa ${target.samples}`);
      const composer = new EffectComposer(renderer, target);
      composer.addPass(new RenderPass(scene, camera));
      const hdr = target.texture.type === THREE.HalfFloatType;
      const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.36, 0.3, hdr ? 1.0 : 0.82);
      composer.addPass(bloom);
      const output = new OutputPass();
      composer.addPass(output);
      // Without MSAA, smooth edges after tone mapping instead.
      const fxaa = new FXAAPass();
      fxaa.enabled = target.samples === 0;
      composer.addPass(fxaa);
      const grade = new ShaderPass(GradeShader);
      composer.addPass(grade);
      fallbacks.set(grade.material, () => {
        grade.enabled = false;
      });
      disposables.push(bloom, output, fxaa, grade, composer);

      // The reflection camera is cloned from ours on first use; make it now,
      // before the rain layer is switched on, so puddles don't show the rain.
      floor.getReflectionCamera(camera);
      camera.layers.enable(1);

      // ------------------------------------------------------------------ loop
      let level = 0;
      const resize = () => {
        const w = mount.clientWidth || 1;
        const h = mount.clientHeight || 1;
        const q = QUALITY[level];
        const dpr = Math.min(window.devicePixelRatio || 1, q.dpr, Math.sqrt(2.4e6 / (w * h)));
        renderer.setPixelRatio(dpr);
        renderer.setSize(w, h, false);
        composer.setPixelRatio(dpr);
        composer.setSize(w, h);
        reflectTarget.setSize(Math.max(64, Math.round(w * dpr * q.reflect)), Math.max(64, Math.round(h * dpr * q.reflect)));
        bloom.enabled = q.bloom && hdr; // bloom renders in half float too
        grade.uniforms.uRes.value.set(w * dpr, h * dpr);
        farMat.uniforms.uPixelRatio.value = dpr;
        camera.aspect = w / h;
        // Narrow (portrait) frames need a taller view to keep the canopy in shot.
        camera.fov = camera.aspect < 0.8 ? 56 : camera.aspect < 1.2 ? 48 : 40;
        camera.updateProjectionMatrix();
        if (reduce) draw();
      };

      const base = new THREE.Vector3(2.3, 1.6, 9.5);
      const look = new THREE.Vector3(0.95, 1.32, -40);
      let time = 0;
      let rainAmount = rainRef.current ? 1 : 0;
      let flicker = 0;
      let settled = false;
      const signalGo = lin(0.15, 3.2, 1.5);
      const signalStop = lin(3.6, 0.22, 0.12);
      const glowGo = lin(0.05, 0.6, 0.3);
      const glowStop = lin(0.7, 0.05, 0.03);

      const update = (step: number) => {
        const final = moodRef.current === "final";
        camera.position.set(base.x + Math.sin(time * 0.07) * 0.05, base.y + Math.sin(time * 0.19) * 0.012, base.z + Math.sin(time * 0.05) * 0.08);
        camera.lookAt(look.x + Math.sin(time * 0.04) * 0.3, look.y, look.z);

        const wantRain = rainRef.current && !final ? 1 : 0;
        rainAmount += (wantRain - rainAmount) * (settled ? Math.min(1, step * 0.6) : 1);
        rainMat.uniforms.uOpacity.value = RAIN_OPACITY * rainAmount;
        dripMat.uniforms.uOpacity.value = 0.8 * rainAmount;
        for (const m of [rainMat, dripMat]) m.uniforms.uTime.value = time;
        floorUniforms.uTime.value = time;
        floorUniforms.uRain.value = rainAmount;
        const skyMat = sky.material as THREE.ShaderMaterial;
      if (skyMat.uniforms) skyMat.uniforms.uTime.value = time;
        farMat.uniforms.uTime.value = time;
        grade.uniforms.uTime.value = time;

        // One tube hums and, now and then, stutters.
        if (!final && flicker <= 0 && Math.random() < step * 0.03) flicker = 0.5 + Math.random() * 0.4;
        if (flicker > 0) flicker -= step;
        lamps.forEach((l, i) => {
          let want = 1;
          if (final && l.glow && i % 2 === 1) want = 0;
          if (i === FLICKER && flicker > 0) want = Math.random() > 0.45 ? 1 : 0.05;
          const speed = settled && !(i === FLICKER && flicker > 0) ? Math.min(1, step * 1.2) : 1;
          l.ratio += (want - l.ratio) * speed;
          l.light.intensity = l.base * l.ratio;
          rainLights[l.slot].w = l.rain * l.ratio;
          if (l.glow && l.glowColor) l.glow.color.copy(l.glowColor).multiplyScalar(0.03 + 0.97 * l.ratio);
          if (l.haze && l.hazeBase) l.haze.uniforms.uStrength.value = l.hazeBase * l.ratio;
        });
        windowLight.light.intensity = windowLight.base * (final ? 0.6 : 1);
        settled = true;

        signalLens.color.lerpColors(signalGo, signalStop, final ? 1 : 0);
        signalGlow.color.lerpColors(glowGo, glowStop, final ? 1 : 0);

        const minute = new Date().getMinutes();
        if (minute !== clockMinute) {
          clockMinute = minute;
          tx.drawClock(clockCanvas, new Date());
          clockTex.needsUpdate = true;
        }
      };

      // A shader this GPU can't compile gets its plainer stand-in after the
      // first frame, instead of leaving a hole in the picture.
      let checked = false;
      let broken = false;
      let frames = 0;
      const draw = () => {
        if (broken) return;
        try {
          composer.render();
        } catch (err) {
          // Stop drawing rather than throw every frame; the gradient shows.
          broken = true;
          renderer.domElement.style.visibility = "hidden";
          console.warn("[nocturne] 3D platform stopped:", err);
          log.note(`render failed: ${String(err)}`);
          return;
        }
        frames += 1;
        if (checked) return;
        checked = true;
        const glError = renderer.getContext().getError();
        if (glError) log.note(`gl error after first frame: 0x${glError.toString(16)}`);
        let fixed = false;
        fallbacks.forEach((fix, m) => {
          const program = (renderer.properties.get(m) as { currentProgram?: { diagnostics?: { runnable: boolean } } }).currentProgram;
          if (program?.diagnostics && !program.diagnostics.runnable) {
            console.warn("[nocturne] shader fallback:", m.name || m.type);
            log.note(`shader fallback: ${m.name || m.type}`);
            fix();
            fixed = true;
          }
        });
        if (fixed) composer.render();
      };

      let raf = 0;
      let last = performance.now();
      let acc = 0;
      let visible = true;
      let interval = 1 / 60;
      let slowFor = 0;
      let warm = 0;

      let fpsFrom = performance.now();
      const frame = (now: number) => {
        if (now - fpsFrom > 2000) {
          log.set("fps", `${Math.round((frames * 1000) / (now - fpsFrom))} (visible ${visible})`);
          frames = 0;
          fpsFrom = now;
        }
        raf = requestAnimationFrame(frame);
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        if (!visible) return;
        acc += dt;
        if (acc < 1 / 30 - 0.004) return;
        const step = Math.min(acc, 0.1);
        acc = 0;
        time += step;
        update(step);
        draw();

        // If frames keep arriving late, drop a quality step.
        warm += step;
        interval = interval * 0.94 + dt * 0.06;
        if (warm > 2 && level < QUALITY.length - 1) {
          slowFor = interval > 1 / 36 ? slowFor + step : 0;
          if (slowFor > 2.5) {
            level += 1;
            log.set("quality", `step ${level}`);
            slowFor = 0;
            warm = 0;
            resize();
          }
        }
      };

      resize();
      const ro = new ResizeObserver(resize);
      ro.observe(mount);

      if (reduce) {
        time = 20;
        update(1);
        camera.position.copy(base);
        camera.lookAt(look);
        draw();
      } else {
        raf = requestAnimationFrame(frame);
      }

      // Web fonts may land after the first frame: redraw the sign with them.
      let disposed = false;
      void document.fonts?.ready.then(() => {
        if (!disposed) {
          setName(nameRef.current);
          if (reduce) draw();
        }
      });
      apiRef.current = {
        setName: (name) => {
          setName(name);
          if (reduce) draw();
        },
        poke: () => {
          if (reduce) {
            update(1);
            draw();
          }
        },
      };

      const io = new IntersectionObserver(([e]) => {
        visible = e.isIntersecting && !document.hidden;
      });
      io.observe(mount);
      const onVisibility = () => {
        visible = !document.hidden;
        last = performance.now();
      };
      document.addEventListener("visibilitychange", onVisibility);

      return () => {
        disposed = true;
        log.dispose();
        apiRef.current = null;
        cancelAnimationFrame(raf);
        ro.disconnect();
        io.disconnect();
        document.removeEventListener("visibilitychange", onVisibility);
        disposables.forEach((d) => d.dispose());
        target.dispose();
        renderer.dispose();
        // Browsers cap live WebGL contexts; give this one back now.
        renderer.forceContextLoss();
        renderer.domElement.remove();
      };
    };
    try {
      return setup();
    } catch (err) {
      console.warn("[nocturne] 3D platform unavailable:", err);
      log.note(`failed: ${err instanceof Error ? `${err.message}\n${err.stack?.split("\n").slice(0, 4).join("\n")}` : String(err)}`);
      apiRef.current = null;
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    }
  }, []);

  useEffect(() => {
    moodRef.current = mood;
    rainRef.current = rain;
    apiRef.current?.poke();
  }, [mood, rain]);

  useEffect(() => {
    if (nameRef.current === stationName) return;
    nameRef.current = stationName;
    apiRef.current?.setName(stationName);
  }, [stationName]);

  return <div ref={mountRef} className={className} aria-hidden />;
}
