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
import { tunnelWallMaterial } from "./cabin/shaders";
import { Curtain } from "./cabin/curtain";
import { CABIN_TINT as TINT, CURTAIN_COLOR as CURTAIN, CURTAIN_REST, type ClothBacklight } from "./cabin/cloth";
import { sceneKit } from "./cabin/kit";
import { PT, buildPlatform } from "./cabin/platform";
import { D, cabinLights, rideFov, roundedRect, windowDims, windowMaterials, windowParts } from "./cabin/window";
import { SCENE_READY, describe, floatSupport, pickTarget, sceneLog, frameMeter } from "./gl";
import { GradeShader, MAX_LIGHTS, rainMaterial } from "./platform/shaders";
import * as tx from "./platform/textures";
import { atmosphere, atmosphereAt, forcedHour, hourFor, type SkyMode } from "./ride/atmosphere";
import { skyDome } from "./ride/materials";
import { stepTrain, trainState, timetable, type Leg, CRUISE } from "./ride/train";
import { GROUND, buildWorld } from "./ride/world";

export type CabinMode = "platform" | "night" | "tunnel" | "still";

/** The station being ridden, for tying the train to the timer. */
export interface RideLeg {
  key: string;
  /** Planned seconds for this station (grows when time is added). */
  total: number;
  /** Seconds ridden when `at` (ms, Date.now()) was measured, and whether the clock is running. */
  elapsed: number;
  at: number;
  paused: boolean;
}

export interface CabinSceneProps {
  mode: CabinMode;
  carriage: CarriageId;
  stationName?: string;
  /** The end of the line: a longer, brighter platform. */
  terminal?: boolean;
  /** The station being ridden, if any (the train keeps time with it). */
  leg?: RideLeg | null;
  /** Seeds the country the line runs through (one night, one line). */
  seed?: number;
  /** Which hour the window shows: the clock's, or dusk to dawn across the ride. */
  sky?: SkyMode;
  className?: string;
  /** Called if this device can't draw the scene; the caller shows the 2D one. */
  onFail?: () => void;
  /** How far the curtain is drawn beyond its resting place (0 … 1), as you pull it. */
  onCurtain?: (amount: number) => void;
}

const TUNNEL_EXPOSURE = 1.25;

/** Steps down, one at a time, while frames keep arriving late: sharpness first, then glow, then frame rate. */
const QUALITY = [
  { dpr: 1.5, bloom: true, fps: 60, rain: 1 },
  { dpr: 1.2, bloom: true, fps: 60, rain: 1 },
  { dpr: 1, bloom: true, fps: 60, rain: 0.7 },
  { dpr: 1, bloom: false, fps: 30, rain: 0.5 },
  { dpr: 0.75, bloom: false, fps: 30, rain: 0.35 },
];

const lin = (r: number, g: number, b: number) => new THREE.Color().setRGB(r, g, b);
const WHITE = new THREE.Color(1, 1, 1);
/** A colour to work in, so the frame loop allocates nothing. */
const scratch = new THREE.Color();

/** The line curves gently: how far the train's heading has turned at distance s (radians). */
const heading = (s: number) => 0.014 * Math.sin(s / 1100 + 1.3) + 0.009 * Math.sin(s / 430 + 0.4) + 0.004 * Math.sin(s / 170);

/**
 * The view from your seat on an old express, in 3D: the window beside you
 * with its curtain, and outside a line that runs through towns, works,
 * rivers, fields, hills and tunnels, under the sky of the hour. The train
 * keeps time with the station you're riding: it pulls away as the timer
 * starts, stops when you pause, and brakes into the next platform as the
 * timer ends.
 */
export default function CabinScene3D({ mode, carriage, stationName = "", terminal = false, leg = null, seed = 1, sky = "local", className = "", onFail, onCurtain }: CabinSceneProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const target = useRef({ mode, carriage, stationName, terminal, leg, sky });
  const failRef = useRef(onFail);
  const curtainRef = useRef(onCurtain);
  const seedRef = useRef(seed);
  useEffect(() => {
    curtainRef.current = onCurtain;
  }, [onCurtain]);
  const pokeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    target.current = { mode, carriage, stationName, terminal, leg, sky };
    failRef.current = onFail;
    pokeRef.current?.();
  }, [mode, carriage, stationName, terminal, leg, sky, onFail]);

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
    const meter = frameMeter(log, renderer);
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
      const { kit, put } = K;
      const atm = atmosphere();

      // Two scenes: the world outside, rendered to a texture the glass looks
      // through, and the carriage around you.
      const outside = new THREE.Scene();
      const fog = new THREE.FogExp2(0x05070b, 0.0024);
      outside.fog = fog;
      const cabin = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(55, 1, 0.03, 60);
      // Near enough for the platform edge, far enough for the mountains, and no further.
      const outCam = new THREE.PerspectiveCamera(55, 1, 0.5, 3200);

      const fallbacks = new Map<THREE.Material, () => void>();
      const hide = (m: THREE.Material) => () =>
        outside.traverse((o) => {
          if ((o as THREE.Mesh).material === m) o.visible = false;
        });

      // ================================================================ OUTSIDE
      const skyMat = track(skyDome());
      const skyMesh = new THREE.Mesh<THREE.BufferGeometry, THREE.Material>(track(new THREE.SphereGeometry(2400, 32, 16)), skyMat);
      skyMesh.renderOrder = -10;
      skyMesh.frustumCulled = false;
      outside.add(skyMesh);
      fallbacks.set(skyMat, () => {
        skyMesh.material = track(new THREE.MeshBasicMaterial({ color: 0x0b0f14, side: THREE.BackSide, fog: false, depthTest: false }));
      });

      const sun = new THREE.DirectionalLight(0xffffff, 0);
      outside.add(sun, sun.target);
      const hemi = new THREE.HemisphereLight(0x223040, 0x080808, 1);
      outside.add(hemi);

      const world = buildWorld(seedRef.current, track);
      outside.add(world.root);
      outside.add((world as unknown as { catenary: THREE.Object3D }).catenary);

      // ------------------------------------------------------------- tunnel
      const tunnelMat = track(tunnelWallMaterial(fog));
      const tunnelWall = new THREE.Mesh<THREE.BufferGeometry, THREE.Material>(track(new THREE.PlaneGeometry(400, 9)), tunnelMat);
      tunnelWall.position.set(0, 0.6, -2.2);
      tunnelWall.visible = false;
      outside.add(tunnelWall);
      fallbacks.set(tunnelMat, () => {
        tunnelWall.material = track(new THREE.MeshLambertMaterial({ color: 0x0b0b0a }));
      });

      // ----------------------------------------------------------- platform
      // The same platform the walk onto the train crossed; it's where the train stops.
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
      const lampScratch = Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector4());

      // ================================================================= CABIN
      const tint = TINT[target.current.carriage].clone();
      const lights = cabinLights(tint);
      cabin.add(lights.group, lights.fill);
      const cabinLight = lights.main;
      const reading = lights.reading;
      const sweep = lights.sweep;
      // Daylight through the window, filling the carriage from above and in front.
      const daylight = new THREE.HemisphereLight(0xffffff, 0x444444, 0);
      cabin.add(daylight);
      // Lit from behind by whatever is outside the glass (set up with the post passes).
      const clothBack: ClothBacklight = { outside: null as unknown as THREE.Texture, res: new THREE.Vector2(1, 1), winMin: new THREE.Vector2(), winMax: new THREE.Vector2(), strength: 0.45 };
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
      const train = trainState();
      // For checking the look: start further down the line (`?travel=12000`).
      const jump = Number(new URLSearchParams(window.location.search).get("travel"));
      if (Number.isFinite(jump) && jump > 0) train.s = jump;
      // Arriving at the seat from the platform: the train is standing at it.
      train.stopAt = start === "platform" || start === "still" ? 0 : null;
      const st = {
        time: 0,
        forced: { on: false, from: 0, to: Infinity },
        reflect: 0.1,
        tunnel: 0,
        // Already wet in the rain carriage: the glass you sat down at was.
        rain: target.current.carriage === "rain" ? 1 : 0,
        lastV: 0,
        jolt: 0,
        joint: 0,
        drawn: 0,
        /** The platform shown: the one you're at, or the next as it comes. */
        platAt: train.stopAt ?? -1e9,
        hour: -1,
        hourAt: -10,
      };
      const legView: Leg = { key: "", total: 1, paused: false, elapsed: () => 0 };
      if (train.stopAt !== null) {
        sweep.intensity = lights.platformSpill();
        drawSign(target.current.stationName, start === "still" || target.current.terminal);
      }
      let level = 0;
      let clockAt = 0;
      let halfW = 1;
      let builtFor = "";
      let signFor = "";

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
        rainGeo.instanceCount = Math.round(RAIN * q.rain);
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

      const applyAtmosphere = (progress: number) => {
        const forced = forcedHour();
        const hour = forced ?? hourFor(target.current.sky, new Date(), progress);
        atmosphereAt(atm, hour);
        const su = skyMat.uniforms;
        su.uZenith.value.copy(atm.zenith);
        su.uHorizon.value.copy(atm.horizon);
        su.uGlow.value.copy(atm.glow);
        su.uSun.value.copy(atm.sun);
        su.uSunDir.value.copy(atm.sunDir);
        su.uSunI.value = atm.sunI;
        su.uNight.value = atm.night;
        su.uClouds.value = atm.clouds;
        fog.color.copy(atm.fog);
        fog.density = atm.fogDensity;
        sun.color.copy(atm.sun);
        sun.intensity = atm.sunI;
        sun.position.copy(atm.sunDir).multiplyScalar(500);
        hemi.color.copy(atm.hemiSky);
        hemi.groundColor.copy(atm.hemiGround);
        hemi.intensity = atm.hemiI;
      };

      const update = (dt: number) => {
        const { mode: m, carriage: c, terminal: term, leg: legIn } = target.current;
        st.time += dt;
        const moving = m === "night" || m === "tunnel";

        // Keep time with the station being ridden.
        let leg: Leg | null = null;
        if (legIn && moving) {
          legView.key = legIn.key;
          legView.total = Math.max(1, legIn.total);
          legView.paused = legIn.paused;
          const at = legIn.at;
          const base = legIn.elapsed;
          legView.elapsed = legIn.paused ? () => base : () => base + (Date.now() - at) / 1000;
          leg = legView;
        }
        if (reduce) {
          // A still picture: no travel at all.
          train.v = 0;
        } else stepTrain(train, dt, leg, !moving);
        const s = train.s;

        // The platform: the one you're standing at, or the next one as it comes into view.
        if (train.stopAt !== null) st.platAt = train.stopAt;
        else if (Number.isFinite(train.legEnd) && train.legEnd - s < half + 500) st.platAt = train.legEnd;
        world.setStops(Number.isFinite(train.legEnd) && train.stopAt === null ? [train.legEnd] : [st.platAt], s);
        const platX = st.platAt - s;
        plat.visible = Math.abs(platX) < half + 420;
        plat.position.x = platX;
        const end = m === "still" || term;
        const signKey = `${target.current.stationName}|${end}`;
        if (plat.visible && signKey !== signFor) {
          signFor = signKey;
          drawSign(target.current.stationName, end);
        }

        // A tunnel asked for (deep focus) runs from just ahead until it's let go.
        if (m === "tunnel" && !st.forced.on) st.forced = { on: true, from: s + (reduce ? -2000 : 40), to: Infinity };
        if (m !== "tunnel" && st.forced.on && st.forced.to === Infinity) st.forced.to = s + (reduce ? -2000 : 30);
        if (st.forced.on && st.forced.to < s - 300) st.forced.on = false;
        const routeTunnel = world.route.tunnelNear(s - 300, s + 300);
        const tun = st.forced.on ? ([st.forced.from, st.forced.to] as const) : routeTunnel;
        const vis = halfW * 3 + 20;
        const tFrom = tun ? tun[0] - s : 1e5;
        const tTo = tun ? tun[1] - s : 1e5;
        const covered = !!tun && tFrom < -vis && tTo > vis;
        tunnelWall.visible = !!tun && tFrom < 200 && tTo > -200;
        tunnelMat.uniforms.uStart.value = tFrom;
        tunnelMat.uniforms.uEnd.value = tTo;
        tunnelMat.uniforms.uTravel.value = s;
        tunnelMat.uniforms.uBlur.value = train.v / 30;
        // How much of the view the tunnel fills, eased: the eye adjusts over a second or two.
        const inside = !tun ? 0 : covered ? 1 : Math.max(0, Math.min(1, (Math.min(tTo, vis) - Math.max(tFrom, -vis)) / (2 * vis)));
        st.tunnel += (inside - st.tunnel) * Math.min(1, dt * 1.2);

        // Rail joints: a small knock every 25 m.
        const joint = Math.floor(s / 25);
        let knock = 0;
        if (joint !== st.joint) {
          st.joint = joint;
          st.jolt = Math.min(1, train.v / CRUISE);
          knock = st.jolt;
        }
        st.jolt *= Math.exp(-dt * 9);

        // The curtain feels the train: pulling away, braking, the joints, the roll.
        const accel = dt > 0 ? (train.v - st.lastV) / dt : 0;
        st.lastV = train.v;
        const vr = train.v / CRUISE;
        if (curtain) {
          curtain.update(dt, accel, knock, Math.sin(st.time * 0.9) * vr + Math.sin(st.time * 2.3) * 0.3 * vr);
          const drawn = Math.max(0, (curtain.cover - CURTAIN_REST) / (1 - CURTAIN_REST));
          if (Math.abs(drawn - st.drawn) > 0.01) {
            st.drawn = drawn;
            curtainRef.current?.(drawn);
          }
        }

        // ---- the hour
        const progress = leg ? Math.min(1, leg.elapsed() / leg.total) : 0;
        if (st.time - st.hourAt > 0.5 || st.hour < 0) {
          st.hourAt = st.time;
          applyAtmosphere(progress);
          st.hour = atm.hour;
        }
        skyMat.uniforms.uTime.value = st.time;
        skyMat.uniforms.uDrift.value = s;

        // ---- the world
        world.root.visible = !covered;
        skyMesh.visible = !covered;
        world.update(s, atm, st.time, dt);

        // Rain: outside only on the rain carriage; on the glass too.
        const wet = c === "rain";
        st.rain += ((wet ? 1 : 0) - st.rain) * Math.min(1, dt * 0.5);
        rain.visible = wet && !covered;
        rainMat.uniforms.uTime.value = st.time;
        rainMat.uniforms.uTravel.value = s;
        rainMat.uniforms.uWind.value = -train.v / 8.5;
        if (plat.visible) {
          coverMin.set(platX - half, -10, -6.4);
          coverMax.set(platX + half, PT + 3.2, -1.7);
        } else {
          coverMin.set(1, 1, 1);
          coverMax.set(-1, -1, -1);
        }
        // Rain catches the platform tubes and the lamps along the line.
        let li = 0;
        if (plat.visible) for (const l of platLights) if (li < MAX_LIGHTS && Math.abs(platX + l.position.x) < 40) rainLights[li++].set(platX + l.position.x, l.position.y, l.position.z, 1.4);
        const nl = world.lampsNear(s, lampScratch);
        for (let k = 0; k < nl && li < MAX_LIGHTS; k++) rainLights[li++].set(lampScratch[k].x, lampScratch[k].y, lampScratch[k].z, 2.4 * atm.night);
        while (li < MAX_LIGHTS) rainLights[li++].w = 0;

        // What lights the carriage from outside: tunnel lamps, a lamp passing, the platform.
        let sweepI = 0;
        if (tun && tFrom < 0 && tTo > 0) {
          const EVERY = 25;
          const lx = (((EVERY / 2 - s) % EVERY) + EVERY) % EVERY;
          const x = lx > EVERY / 2 ? lx - EVERY : lx;
          if (x > tFrom && x < tTo) {
            sweep.position.set(x, 0.6, -1.9);
            sweep.color.setRGB(1, 0.62, 0.3);
            sweepI = 3.2 * Math.exp(-(x * x) / 6);
          }
        } else if (plat.visible && Math.abs(platX) < half) {
          sweep.position.set(0, 1.2, -2.2);
          sweep.color.setRGB(1, 0.9, 0.75);
          sweepI = 1.6 * (0.3 + 0.7 * atm.night);
        } else {
          for (let k = 0; k < nl; k++) {
            const x = lampScratch[k].x;
            const i = 1.6 * Math.exp(-(x * x) / 40) * atm.night;
            if (i > sweepI) {
              sweep.position.set(x, 1.6, -4);
              sweep.color.setRGB(1, 0.72, 0.42);
              sweepI = i;
            }
          }
        }
        sweep.intensity += (sweepI - sweep.intensity) * Math.min(1, dt * 12);

        // The carriage: its lamps (they matter less at noon), daylight, curtain colour, the glass.
        const dark = Math.max(atm.cabin, st.tunnel);
        tint.lerp(TINT[c], Math.min(1, dt * 2));
        cabinLight.color.copy(tint);
        cabinLight.intensity = 3.2 * (0.55 + 0.45 * dark);
        reading.intensity = 0.9 * (0.4 + 0.6 * dark);
        daylight.color.copy(atm.daylight).multiplyScalar(1 - st.tunnel);
        daylight.groundColor.copy(atm.daylight).multiplyScalar(0.35 * (1 - st.tunnel));
        daylight.intensity = 2.2;
        curtainMat.color.lerp(scratch.setHex(CURTAIN[c]), Math.min(1, dt * 2));
        curtainMat.sheenColor.copy(curtainMat.color).lerp(WHITE, 0.35);
        const atPlatform = plat.visible && Math.abs(platX) < half;
        const reflectGoal = THREE.MathUtils.lerp(atPlatform ? Math.min(atm.reflect, 0.05) : atm.reflect, 0.16, st.tunnel);
        st.reflect += (reflectGoal - st.reflect) * Math.min(1, dt * 1.5);
        glassMat.uniforms.uReflect.value = st.reflect;
        glassMat.uniforms.uTint.value.copy(tint);
        // The page's clock, shared with the boarding view, so the drops carry straight on.
        glassMat.uniforms.uTime.value = performance.now() / 1000;
        glassMat.uniforms.uRain.value = st.rain;
        glassMat.uniforms.uSlant.value = -Math.min(1.4, vr * 1.2);
        grade.uniforms.uTime.value = st.time;
        // The eye adjusts: bright days are exposed down, a tunnel back up.
        renderer.toneMappingExposure = THREE.MathUtils.lerp(atm.exposure, TUNNEL_EXPOSURE, st.tunnel);

        // You and the carriage ride together; the world outside turns with the curves and sways.
        const yaw = heading(s) - heading(s - 40);
        outCam.position.set(
          Math.sin(st.time * 0.37) * 0.004 * vr,
          -0.004 * st.jolt + Math.sin(st.time * 1.7) * 0.0015 * vr + Math.sin(st.time * 0.53 + 1.1) * 0.002 * vr,
          Math.sin(st.time * 0.29 + 0.5) * 0.006 * vr,
        );
        outCam.rotation.set(Math.sin(st.time * 0.9) * 0.0012 * vr, yaw * 1.4, Math.sin(st.time * 0.6) * 0.0015 * vr);

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
          log.set("travel", `${Math.round(train.s)} m · ${world.route.at(train.s).kind} · ${train.v.toFixed(1)} m/s · ${atm.hour.toFixed(2)} h`);
          frames = 0;
          fpsFrom = now;
        }
        acc += dt;
        const q = QUALITY[level];
        if (acc < 1 / q.fps - 0.004) return;
        const step = Math.min(acc, 0.1);
        acc = 0;
        meter(() => {
          update(step);
          draw();
        });
        warm += step;
        interval = interval * 0.94 + dt * 0.06;
        if (warm > 2 && level < QUALITY.length - 1) {
          slowFor = interval > (q.fps >= 60 ? 1 / 45 : 1 / 26) ? slowFor + step : 0;
          if (slowFor > 2.5) {
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
      // Warm up: draw once with everything that only shows up later (the
      // tunnel, a platform, rain) so its shaders compile and textures upload
      // now, not with a stall halfway through the ride.
      update(0.016);
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
      // Ready to be seen once the surface maps are in (before, surfaces shade black).
      let gone = false;
      void kit.ready().then(() => {
        if (gone || broken) return;
        draw();
        requestAnimationFrame(() => !gone && window.dispatchEvent(new Event(SCENE_READY)));
      });
      if (!reduce) raf = requestAnimationFrame(frame);
      pokeRef.current = () => {
        if (reduce) {
          update(0.016);
          draw();
        }
      };
      void document.fonts?.ready.then(() => {
        if (!broken && plat.visible) drawSign(target.current.stationName, target.current.mode === "still" || target.current.terminal);
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
      void timetable;

      return () => {
        gone = true;
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
        world.dispose();
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
