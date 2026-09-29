import * as THREE from "three";
import type { Atmosphere } from "./atmosphere";
import * as M from "./materials";
import * as P from "./props";
import { DRESSING, Route, hash01, rng, type SegmentKind } from "./route";

/**
 * The land outside the window, built as the train goes. The line is cut
 * into 50 m chunks; each chunk dresses itself from the kind of country
 * under it (and a seed), the same way every time it is seen. Everything of
 * one kind is drawn in one instanced call, and the instance lists are only
 * rewritten when the window of chunks around the train moves on.
 *
 * Coordinates: the window looks toward -z, the train runs toward +x, eyes
 * at y = 0 and the ballast at GROUND. `root` slides by −travel each frame.
 */

export const GROUND = -2.35;
const CHUNK = 50;
const RANGE = 280; // metres kept dressed ahead and behind (mid-distance rows)
const FAR_CHUNK = 250;
const FAR_RANGE = 1500;
const REBASE = 2000; // keep numbers small: the root is re-origined every 2 km

type Kind = SegmentKind;

interface Item {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  ry?: number;
  c?: number;
  /** Façade: style, seed, share of lit rooms. */
  f?: [number, number, number];
  roof?: number;
  /** Glow colour, linear, may exceed 1. */
  lin?: THREE.Color;
}

type Pool =
  | "block"
  | "house"
  | "saw"
  | "tank"
  | "chimney"
  | "greenhouse"
  | "conifer"
  | "broadleaf"
  | "mound"
  | "upole"
  | "mast"
  | "lamp"
  | "signal"
  | "flood"
  | "truss"
  | "wagon"
  | "pass"
  | "shelter"
  | "fence"
  | "barrier"
  | "gUrban"
  | "gGrass"
  | "gField"
  | "gGravel"
  | "gRoad"
  | "water"
  | "glow"
  | "pool";

interface Chunk {
  items: Partial<Record<Pool, Item[]>>;
  wires: number[];
  lamps: [number, number, number][];
  /** A road runs through this chunk (cars may drive here). */
  road: boolean;
}

// Palettes (sRGB), East Asian towns: tiled walls, painted concrete, coloured roofs.
const WALLS = [0x9c9b95, 0xb9ab8e, 0xcfc6b0, 0xc4b0a2, 0x9aa6ad, 0xd8d4c8, 0xa9b8a8, 0xb7a58a, 0x8e8a82];
const BRICK = [0x8a5a48, 0x7c5244, 0x94664f];
const ROOFS = [0x3d4145, 0x3b5670, 0x7e4634, 0x4a6650, 0x2c2f33, 0x5b5f63];
const WORKS = [0x8d918e, 0x9aa4a6, 0x7f8b84, 0xa89f8e];
const GREENS = [0x3f5a36, 0x4c6a3c, 0x37502f, 0x56703f, 0x2f4a2e];
const DARK_GREENS = [0x2c4230, 0x31492f, 0x263a28];
const WAGONS = [0x5c3a2c, 0x3d4a52, 0x6a4a34, 0x3f4f3c, 0x7a6a52];

/** Things beside the line that a platform would stand in. */
const BY_THE_LINE = new Set<Pool>(["mast", "signal", "pass", "shelter", "fence", "barrier", "conifer", "broadleaf", "glow", "truss"]);

const pickFrom = <T,>(r: () => number, xs: readonly T[]) => xs[Math.floor(r() * xs.length) % xs.length];

export interface WorldHandle {
  root: THREE.Group;
  route: Route;
  /** Called every frame. */
  update(travel: number, atm: Atmosphere, time: number, dt: number): void;
  /** The platforms the train will stand at (metres), so nothing is built in their way. */
  setStops(stops: number[], travel: number): void;
  /** Lamps near the train (world metres, relative to the train), strongest first. */
  lampsNear(travel: number, out: THREE.Vector4[]): number;
  /** Mean height of the far ridges here (0 … 1), for the sky. */
  dispose(): void;
}

export function buildWorld(seed: number, track: <T extends { dispose(): void }>(x: T) => T): WorldHandle {
  const route = new Route(seed);
  const root = new THREE.Group();
  const shift: M.WorldUniforms = { uShift: { value: 0 } };
  const facadeU: M.FacadeUniforms = { uNight: { value: 1 }, uGlass: { value: new THREE.Color(0.2, 0.25, 0.3) }, uTime: { value: 0 } };

  // --------------------------------------------------------------- materials
  const tex = (c: HTMLCanvasElement) => track(new THREE.CanvasTexture(c));
  const facade = track(M.facadeMaterial(facadeU));
  const foliage = track(M.foliageMaterial(shift, 0.9));
  const hillSkin = track(M.foliageMaterial(shift, 0.16));
  const plain = track(new THREE.MeshLambertMaterial({ color: 0xffffff }));
  const metal = track(new THREE.MeshLambertMaterial({ color: 0xffffff }));
  const plastic = track(new THREE.MeshLambertMaterial({ color: 0xdfe4e0, side: THREE.DoubleSide, emissive: 0x000000 }));
  const fenceTex = tex(M.fenceTexture());
  fenceTex.wrapS = THREE.RepeatWrapping;
  fenceTex.colorSpace = THREE.SRGBColorSpace;
  const fence = track(new THREE.MeshLambertMaterial({ map: fenceTex, alphaTest: 0.35, side: THREE.DoubleSide, color: 0xc8cbc8 }));
  const barrierTex = tex(M.barrierTexture());
  barrierTex.colorSpace = THREE.SRGBColorSpace;
  const barrier = track(new THREE.MeshLambertMaterial({ map: barrierTex, color: 0xffffff }));
  const ground = {
    gUrban: track(M.groundMaterial(tex(M.urbanTexture()), 22, shift, 0.9)),
    gGrass: track(M.groundMaterial(tex(M.grassTexture()), 16, shift)),
    gField: track(M.groundMaterial(tex(M.fieldTexture()), 36, shift)),
    gGravel: track(M.groundMaterial(tex(M.gravelTexture()), 6, shift, 0.95)),
    gRoad: track(M.groundMaterial(tex(M.roadTexture()), 9, shift, 0.85)),
  };
  const water = track(M.waterMaterial());
  const glowMat = track(M.glowMaterial());
  const poolTex = tex(M.softDot());
  const poolMat = track(M.poolMaterial(poolTex));

  // ------------------------------------------------------------------- pools
  interface PoolDef {
    geo: THREE.BufferGeometry;
    mat: THREE.Material;
    cap: number;
    facade?: boolean;
    color?: boolean;
    order?: number;
  }
  const defs: Record<Pool, PoolDef> = {
    block: { geo: P.blockGeometry(), mat: facade, cap: 700, facade: true, color: true },
    house: { geo: P.houseGeometry(), mat: facade, cap: 500, facade: true, color: true },
    saw: { geo: P.sawtoothGeometry(), mat: facade, cap: 80, facade: true, color: true },
    tank: { geo: P.tankGeometry(), mat: facade, cap: 80, facade: true, color: true },
    chimney: { geo: P.chimneyGeometry(), mat: facade, cap: 40, facade: true, color: true },
    greenhouse: { geo: P.greenhouseGeometry(), mat: plastic, cap: 200, color: true },
    conifer: { geo: P.coniferGeometry(), mat: foliage, cap: 1400, color: true },
    broadleaf: { geo: P.broadleafGeometry(), mat: foliage, cap: 1400, color: true },
    mound: { geo: P.moundGeometry(), mat: hillSkin, cap: 80, color: true },
    upole: { geo: P.utilityPoleGeometry(), mat: plain, cap: 80, color: true },
    mast: { geo: P.mastGeometry(), mat: metal, cap: 40, color: true },
    lamp: { geo: P.streetLampGeometry(), mat: metal, cap: 80, color: true },
    signal: { geo: P.signalGeometry(), mat: metal, cap: 12, color: true },
    flood: { geo: P.floodTowerGeometry(), mat: metal, cap: 16, color: true },
    truss: { geo: P.trussGeometry(), mat: metal, cap: 120, color: true },
    wagon: { geo: P.wagonGeometry(), mat: plain, cap: 120, color: true },
    pass: { geo: P.passPlatformGeometry(), mat: plain, cap: 16, color: true },
    shelter: { geo: P.shelterGeometry(), mat: metal, cap: 16, color: true },
    fence: { geo: P.panelGeometry(), mat: fence, cap: 500 },
    barrier: { geo: new THREE.BoxGeometry(1, 1, 0.16).translate(0, 0.5, 0), mat: barrier, cap: 400 },
    gUrban: { geo: P.tileGeometry(), mat: ground.gUrban, cap: 80 },
    gGrass: { geo: P.tileGeometry(), mat: ground.gGrass, cap: 80 },
    gField: { geo: P.tileGeometry(), mat: ground.gField, cap: 80 },
    gGravel: { geo: P.tileGeometry(), mat: ground.gGravel, cap: 80 },
    gRoad: { geo: P.tileGeometry(), mat: ground.gRoad, cap: 40 },
    water: { geo: P.tileGeometry(), mat: water, cap: 40 },
    glow: { geo: P.glowGeometry(), mat: glowMat, cap: 700, color: true, order: 5 },
    pool: { geo: P.tileGeometry(), mat: poolMat, cap: 200, order: 4 },
  };
  const meshes = {} as Record<Pool, THREE.InstancedMesh>;
  const facadeAttr = {} as Record<Pool, { f: THREE.InstancedBufferAttribute; roof: THREE.InstancedBufferAttribute }>;
  for (const [name, d] of Object.entries(defs) as [Pool, PoolDef][]) {
    track(d.geo);
    if (d.facade) {
      const f = new THREE.InstancedBufferAttribute(new Float32Array(d.cap * 3), 3);
      const roof = new THREE.InstancedBufferAttribute(new Float32Array(d.cap * 3), 3);
      d.geo.setAttribute("aFacade", f);
      d.geo.setAttribute("aRoof", roof);
      facadeAttr[name] = { f, roof };
    }
    const m = new THREE.InstancedMesh(d.geo, d.mat, d.cap);
    m.count = 0;
    m.frustumCulled = false;
    if (d.order) m.renderOrder = d.order;
    if (d.color) m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(d.cap * 3), 3);
    root.add(m);
    meshes[name] = m;
  }

  // Wires between utility poles and along the catenary.
  const WIRE_CAP = 3000;
  const wireGeo = track(new THREE.BufferGeometry());
  const wirePos = new Float32Array(WIRE_CAP * 3);
  wireGeo.setAttribute("position", new THREE.BufferAttribute(wirePos, 3));
  wireGeo.setDrawRange(0, 0);
  const wireMat = track(new THREE.LineBasicMaterial({ color: 0x1a1c1d }));
  const wires = new THREE.LineSegments(wireGeo, wireMat);
  wires.frustumCulled = false;
  root.add(wires);
  // The contact wire and messenger over the other track: they don't move, being straight and level.
  const cat = track(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-3000, GROUND + 5.55, -3.55), new THREE.Vector3(3000, GROUND + 5.55, -3.55), new THREE.Vector3(-3000, GROUND + 6.6, -3.55), new THREE.Vector3(3000, GROUND + 6.6, -3.55)]));
  const catenary = new THREE.LineSegments(cat, wireMat);
  catenary.frustumCulled = false;

  // --------------------------------------------------------- far: mountains
  const RIDGE_STEP = 24;
  const RIDGE_COLS = Math.ceil((FAR_RANGE * 2 + 400) / RIDGE_STEP) + 1;
  const ridges = [
    { z0: -520, z1: -900, rows: 5, height: 120, seed: 11, mesh: null as unknown as THREE.Mesh },
    { z0: -1000, z1: -1600, rows: 4, height: 260, seed: 23, mesh: null as unknown as THREE.Mesh },
  ];
  for (const rd of ridges) {
    const g = track(new THREE.BufferGeometry());
    const pos = new Float32Array(RIDGE_COLS * rd.rows * 3);
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const idx: number[] = [];
    for (let c = 0; c < RIDGE_COLS - 1; c++)
      for (let r = 0; r < rd.rows - 1; r++) {
        const a = c * rd.rows + r;
        const b = (c + 1) * rd.rows + r;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    g.setIndex(idx);
    const mat = track(M.foliageMaterial(shift, 0.012));
    mat.color.set(rd.seed === 11 ? 0x3c4f3a : 0x4b5a55);
    rd.mesh = new THREE.Mesh(g, mat);
    rd.mesh.frustumCulled = false;
    root.add(rd.mesh);
  }

  // A far plain beyond the dressed land, sunk a little so nothing meets it edge to edge.
  const plainMat = track(M.groundMaterial(tex(M.grassTexture()), 60, shift, 0.75));
  const farPlain = new THREE.Mesh(track(new THREE.PlaneGeometry(8000, 1400).rotateX(-Math.PI / 2)), plainMat);
  farPlain.position.set(0, GROUND - 0.6, -300 - 700);
  root.add(farPlain);

  // ------------------------------------------------------------------ cars
  const CARS = 4;
  const carMesh = new THREE.InstancedMesh(track(P.carGeometry()), track(new THREE.MeshLambertMaterial({ color: 0xffffff })), CARS);
  carMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CARS * 3), 3);
  carMesh.frustumCulled = false;
  root.add(carMesh);
  const carGlow = new THREE.InstancedMesh(glowGeoShared(track), glowMat, CARS * 4);
  carGlow.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CARS * 4 * 3), 3);
  carGlow.frustumCulled = false;
  carGlow.renderOrder = 5;
  root.add(carGlow);
  const cars = Array.from({ length: CARS }, (_, i) => ({ x: 0, v: 0, lane: i % 2, on: false, wait: 4 + i * 7, color: new THREE.Color(pickFrom(rng(90 + i), [0xd8d8d4, 0x2a2d31, 0x6a7078, 0x7a2a26, 0x8a8f94])) }));

  // ------------------------------------------------------------ generation
  let stops: number[] = [];
  const nearStop = (x: number, pad = 0) => stops.some((s) => Math.abs(x - s) < 78 + pad);
  const kindAt = (x: number): Kind => route.at(x).kind;

  const cache = new Map<number, Chunk>();
  const farCache = new Map<number, Chunk>();

  const add = (ch: Chunk, pool: Pool, it: Item) => {
    (ch.items[pool] ??= []).push(it);
  };
  // Glows keep their exact linear colour (a hex would clamp anything brighter than white).
  const glow = (ch: Chunk, x: number, y: number, z: number, size: number, hex: number, k = 1, blink = false) =>
    add(ch, "glow", { x, y, z, sx: size, sy: size, sz: blink ? -1 : 1, lin: new THREE.Color(hex).multiplyScalar(k) });
  const building = (ch: Chunk, pool: Pool, x: number, z: number, w: number, h: number, d: number, style: number, r: () => number, wall: number, roof: number, lit: number, ry = 0) => {
    add(ch, pool, { x, y: GROUND, z, sx: w, sy: h, sz: d, ry, c: wall, f: [style, Math.floor(r() * 97), lit], roof });
  };

  const genChunk = (i: number): Chunk => {
    const ch: Chunk = { items: {}, wires: [], lamps: [], road: false };
    const x0 = i * CHUNK;
    const x1 = x0 + CHUNK;
    const mid = x0 + CHUNK / 2;
    const kind = kindAt(mid);
    const dress = DRESSING[kind];
    const R = (lane: number) => rng(Math.floor(hash01(seed, i, lane) * 4294967296));
    const onBridge = kind === "river";
    const inTunnel = kind === "tunnel";
    const roadKinds: Kind[] = ["urban", "lowrise", "suburb", "apartments", "station"];
    const hasRoad = roadKinds.includes(kind) && !nearStop(mid, 40);
    ch.road = hasRoad;

    // Ground: bands that meet edge to edge, never overlapping.
    const gPool = (g: string): Pool => (g === "urban" ? "gUrban" : g === "grass" ? "gGrass" : g === "field" ? "gField" : g === "water" ? "water" : "gGravel");
    const band = (pool: Pool, z0: number, z1: number, y = GROUND) => add(ch, pool, { x: mid, y, z: (z0 + z1) / 2, sx: CHUNK, sy: 1, sz: Math.abs(z1 - z0) });
    if (onBridge) {
      band("water", -1.4, -300, GROUND - 6);
    } else {
      band("gGravel", -1.4, -13);
      if (hasRoad) {
        band(gPool(dress.ground), -13, -15.6);
        band("gRoad", -15.6, -22.4);
        band(gPool(dress.ground), -22.4, -70);
      } else band(gPool(dress.ground === "water" ? "grass" : dress.ground), -13, -70);
      band(gPool(dress.ground === "water" ? "grass" : kind === "fields" ? "field" : dress.ground === "urban" ? "urban" : "grass"), -70, -300);
    }
    if (inTunnel) return ch;

    // ---- Near the line
    const near = R(1);
    // Catenary masts every 50 m (the chunk grid), beside the other track.
    if (!nearStop(x0, 10)) {
      add(ch, "mast", { x: x0 + 3, y: GROUND, z: -5.3, sx: 1, sy: 1, sz: 1, c: onBridge ? 0x6e7a7c : 0x7c8683 });
    }
    // Signals now and then.
    if (hash01(seed, i, 900) < 0.07 && !nearStop(mid, 30)) {
      const sx = x0 + 20;
      add(ch, "signal", { x: sx, y: GROUND, z: -6.2, sx: 1, sy: 1, sz: 1, c: 0x2a2d2e });
      const aspect = hash01(seed, i, 901);
      glow(ch, sx, GROUND + 5.25, -6.0, 0.9, aspect < 0.6 ? 0x42ff9a : aspect < 0.85 ? 0xffb33a : 0xff3322, 2.2);
    }
    if (onBridge) {
      // The bridge's plate girder and railing right outside; posts tick past.
      for (let x = x0; x < x1; x += 6) add(ch, "truss", { x: x + 3, y: GROUND - 0.45, z: -3.0, sx: 1, sy: 1, sz: 1, c: 0x5b6769 });
    } else if (!nearStop(mid, 20)) {
      // Sound walls through towns, fences by works and yards, hedges in the country.
      // Low walls (you see over them, sitting up high) along some stretches of town only.
      const wall = kind === "urban" && hash01(seed, Math.floor(mid / 200), 31) < 0.55;
      const fenced = kind === "industrial" || kind === "yard" || kind === "lowrise" || kind === "station" || kind === "apartments" || (kind === "urban" && !wall) || (kind === "suburb" && near() < 0.5);
      if (wall) {
        for (let x = x0; x < x1; x += 2) add(ch, "barrier", { x: x + 1, y: GROUND, z: -6.6, sx: 2, sy: 1.9, sz: 1, ry: 0 });
      } else if (fenced) {
        for (let x = x0; x < x1; x += 2.5) if (near() > 0.04) add(ch, "fence", { x: x + 1.25, y: GROUND, z: -7.2, sx: 2.5, sy: 1.9, sz: 1 });
      }
      // Scrub and young trees along the cess.
      const scrub = kind === "forest" ? 14 : kind === "hills" || kind === "fields" || kind === "suburb" ? 6 : kind === "lowrise" ? 3 : 1;
      for (let k = 0; k < scrub; k++) {
        const x = x0 + near() * CHUNK;
        const z = -8.5 - near() * 5;
        const s = 0.7 + near() * 1.6;
        add(ch, near() < 0.3 ? "conifer" : "broadleaf", { x, y: GROUND, z, sx: s * 1.3, sy: s * 1.2, sz: s * 1.3, ry: near() * 6.3, c: pickFrom(near, GREENS) });
      }
    }

    // ---- Road, lamps, utility poles
    const rr = R(2);
    if (hasRoad) {
      for (let x = x0 + 8; x < x1; x += 31) {
        add(ch, "lamp", { x, y: GROUND, z: -14.6, sx: 1, sy: 1, sz: 1, ry: 0, c: 0x55595c });
        const on = rr() < 0.92;
        if (on) {
          glow(ch, x, GROUND + 7.5, -13.0, 2.2, 0xffb866, 2.6);
          add(ch, "pool", { x, y: GROUND + 0.02, z: -15.8, sx: 11, sy: 1, sz: 9 });
          ch.lamps.push([x, GROUND + 7.4, -13.0]);
        }
      }
    }
    const poles = kind === "lowrise" || kind === "suburb" || kind === "fields" || kind === "hills";
    if (poles) {
      const pz = hasRoad ? -23.6 : -12.5;
      for (let x = x0 + 5; x < x1; x += 37) {
        add(ch, "upole", { x, y: GROUND, z: pz, sx: 1, sy: 1, sz: 1, ry: 0, c: 0x9a9890 });
        // Three sagging wires to the next pole.
        for (const dz of [-1, -0.4, 0.4]) {
          const ax = x;
          const bx = x + 37;
          for (let s = 0; s < 6; s++) {
            const t0 = s / 6;
            const t1 = (s + 1) / 6;
            const sag = (t: number) => -1.1 * 4 * t * (1 - t);
            ch.wires.push(ax + (bx - ax) * t0, GROUND + 9.5 + sag(t0), pz + dz, ax + (bx - ax) * t1, GROUND + 9.5 + sag(t1), pz + dz);
          }
        }
      }
    }

    // ---- Middle distance, by kind
    const m = R(3);
    const lit = dress.lights;
    const row = (z0: number, z1: number, cell: number, lane: number, fn: (x: number, w: number, z: number, r: () => number) => void) => {
      const first = Math.ceil(x0 / cell) * cell;
      for (let cx = first; cx < x1; cx += cell) {
        const r = rng(Math.floor(hash01(seed, Math.round(cx / cell), lane) * 4294967296));
        if (nearStop(cx + cell / 2, 10) && z0 > -12) continue;
        if (kindAt(cx + cell / 2) !== kind) continue;
        fn(cx + cell / 2, cell, z0 + (z1 - z0) * r(), r);
      }
    };
    switch (kind) {
      case "urban": {
        row(-27, -33, 16, 10, (x, w, z, r) => {
          const fw = w - 1 - r() * 3;
          const floors = 3 + Math.floor(r() * 5);
          building(ch, "block", x, z, fw, floors * 3.2, 10 + r() * 8, r() < 0.6 ? 2 : 1, r, pickFrom(r, [...WALLS, ...BRICK]), 0x4a4d50, lit * (0.45 + r() * 0.35));
          if (r() < 0.3) glow(ch, x - fw * 0.3, GROUND + 3.5, z + 5.5, 1.4, r() < 0.5 ? 0xff5c7a : 0x6fd1ff, 1.4);
        });
        row(-46, -70, 24, 11, (x, w, z, r) => {
          const floors = 8 + Math.floor(r() * 16);
          building(ch, "block", x, z, w - 3 - r() * 6, floors * 3.4, 14 + r() * 14, r() < 0.5 ? 1 : 0, r, pickFrom(r, WALLS), 0x3c3f42, lit * (0.35 + r() * 0.35));
          if (floors > 14) glow(ch, x, GROUND + floors * 3.4 + 1, z, 1.6, 0xff2a18, 2.4, true);
        });
        row(-90, -150, 30, 12, (x, w, z, r) => {
          const floors = 12 + Math.floor(r() * 22);
          building(ch, "block", x, z, w - 4 - r() * 8, floors * 3.5, 18 + r() * 16, r() < 0.6 ? 1 : 0, r, pickFrom(r, WALLS), 0x3c3f42, lit * (0.3 + r() * 0.3));
          if (floors > 18) glow(ch, x, GROUND + floors * 3.5 + 1, z, 2, 0xff2a18, 2.4, true);
        });
        break;
      }
      case "apartments": {
        row(-26, -34, 9, 20, (x, _w, z, r) => {
          if (r() < 0.75) add(ch, "broadleaf", { x, y: GROUND, z, sx: 5 + r() * 3, sy: 6 + r() * 4, sz: 5 + r() * 3, ry: r() * 6, c: pickFrom(r, GREENS) });
        });
        row(-55, -70, 64, 21, (x, w, z, r) => {
          const floors = 12 + Math.floor(r() * 11);
          building(ch, "block", x, z, w - 12 - r() * 14, floors * 2.8, 12, 0, r, pickFrom(r, [0xd8d4c8, 0xcfc6b0, 0xc9ccc6, 0xd2c7b8]), 0x5a5f63, lit * (0.45 + r() * 0.3));
          glow(ch, x, GROUND + floors * 2.8 + 1.2, z, 1.4, 0xff2a18, 2.2, true);
        });
        row(-105, -130, 70, 22, (x, w, z, r) => {
          const floors = 14 + Math.floor(r() * 12);
          building(ch, "block", x, z, w - 14 - r() * 16, floors * 2.8, 12, 0, r, pickFrom(r, [0xd8d4c8, 0xcfc6b0, 0xc4c8c4]), 0x5a5f63, lit * (0.4 + r() * 0.3));
        });
        break;
      }
      case "lowrise":
      case "station": {
        const houses = (z0: number, z1: number, lane: number, spacing: number) =>
          row(z0, z1, spacing, lane, (x, w, z, r) => {
            if (r() < 0.12) return;
            if (r() < 0.72) {
              const hw = w - 1.2 - r() * 2;
              building(ch, "house", x, z, hw, 5.6 + r() * 2.4, 7 + r() * 3, 6, r, pickFrom(r, WALLS), pickFrom(r, ROOFS), lit * (0.35 + r() * 0.3), (r() - 0.5) * 0.12);
            } else {
              const floors = 2 + Math.floor(r() * 3);
              building(ch, "block", x, z, w - 1 - r() * 2, floors * 3, 9 + r() * 5, 2, r, pickFrom(r, [...WALLS, ...BRICK]), 0x55585a, lit * (0.4 + r() * 0.3));
              if (floors === 2 && r() < 0.25) glow(ch, x, GROUND + 2.6, z + 5.2, 1.1, 0xfff0c8, 1.6);
            }
          });
        houses(-26, -30, 30, 11);
        houses(-36, -44, 31, 12);
        houses(-52, -66, 32, 13);
        if (kind === "station") {
          // A passing island platform with its shelter and lamps (not where the train stops).
          const px = Math.round(mid / 200) * 200;
          if (px >= x0 && px < x1 && !nearStop(px, 60)) {
            add(ch, "pass", { x: px, y: GROUND, z: -6.2, sx: 110, sy: 1.05, sz: 1, c: 0x8e8b84 });
            add(ch, "shelter", { x: px - 20, y: GROUND + 1.05, z: -6.4, sx: 1, sy: 1, sz: 1, c: 0x5d6563 });
            add(ch, "shelter", { x: px + 18, y: GROUND + 1.05, z: -6.4, sx: 1, sy: 1, sz: 1, c: 0x5d6563 });
            for (let lx = px - 50; lx <= px + 50; lx += 12.5) {
              glow(ch, lx, GROUND + 4.2, -5.8, 0.8, 0xf2eee0, 2.2);
              ch.lamps.push([lx, GROUND + 4, -5.8]);
            }
          }
          row(-14, -16, 60, 33, (x, _w, z, r) => {
            building(ch, "block", x, z - 6, 22, 7, 10, 2, r, 0xd8d4c8, 0x3b5670, lit * 0.8);
            glow(ch, x, GROUND + 4.5, z - 0.7, 1.4, 0xfff4dc, 1.6);
          });
        }
        break;
      }
      case "suburb": {
        row(-28, -48, 20, 40, (x, w, z, r) => {
          if (r() < 0.35) return;
          building(ch, "house", x, z, 7 + r() * 3, 5.8 + r() * 2, 8 + r() * 3, 6, r, pickFrom(r, WALLS), pickFrom(r, ROOFS), lit * (0.3 + r() * 0.3), (r() - 0.5) * 0.3);
          for (let k = 0; k < 2; k++) if (r() < 0.6) add(ch, "broadleaf", { x: x + (r() - 0.5) * w, y: GROUND, z: z + 5 + r() * 4, sx: 3 + r() * 3, sy: 4 + r() * 4, sz: 3 + r() * 3, ry: r() * 6, c: pickFrom(r, GREENS) });
        });
        row(-70, -110, 26, 41, (x, _w, z, r) => {
          if (r() < 0.5) building(ch, "house", x, z, 8 + r() * 3, 6 + r() * 2, 8 + r() * 3, 6, r, pickFrom(r, WALLS), pickFrom(r, ROOFS), lit * 0.35);
          else add(ch, "broadleaf", { x, y: GROUND, z, sx: 6 + r() * 4, sy: 7 + r() * 5, sz: 6 + r() * 4, ry: r() * 6, c: pickFrom(r, GREENS) });
        });
        break;
      }
      case "industrial": {
        row(-50, -64, 48, 50, (x, w, z, r) => {
          const fw = w - 8 - r() * 10;
          const h = 7 + r() * 5;
          const d = 24 + r() * 16;
          building(ch, "block", x, z, fw, h, d, 3, r, pickFrom(r, WORKS), 0x6c7174, lit * 0.6);
          if (r() < 0.6) add(ch, "saw", { x, y: GROUND + h, z, sx: fw, sy: 2.4, sz: d, c: pickFrom(r, WORKS), f: [4, Math.floor(r() * 50), 0], roof: 0x70777a });
          if (r() < 0.5) glow(ch, x - fw * 0.3, GROUND + h - 1.5, z + d / 2 + 0.4, 1.5, 0xffc27a, 2.2);
        });
        row(-70, -120, 40, 51, (x, w, z, r) => {
          const t = r();
          if (t < 0.4) {
            const rad = 9 + r() * 8;
            building(ch, "tank", x, z, rad, 8 + r() * 10, rad, 4, r, pickFrom(r, [0xc9ccc8, 0xb5b9b4, 0x9ea6a4]), 0x8a8f8c, 0);
          } else if (t < 0.65) {
            const h = 30 + r() * 24;
            building(ch, "chimney", x, z, 2.6, h, 2.6, 5, r, 0xd6d4ce, 0x303030, 0);
            glow(ch, x, GROUND + h + 0.5, z, 1.6, 0xff2a18, 2.4, true);
          } else building(ch, "block", x, z, w - 8, 10 + r() * 8, 20 + r() * 10, 3, r, pickFrom(r, WORKS), 0x6c7174, lit * 0.5);
        });
        break;
      }
      case "yard": {
        // Goods wagons on the sidings, warehouses behind, floodlights.
        for (const [lane, z] of [[60, -10.5], [61, -15]] as const)
          row(z, z, 15, lane, (x, _w, zz, r) => {
            if (r() < 0.22) return;
            add(ch, "wagon", { x, y: GROUND, z: zz, sx: 1, sy: 1, sz: 1, c: pickFrom(r, WAGONS) });
          });
        row(-30, -36, 80, 62, (x, w, z, r) => building(ch, "block", x, z, w - 8, 7 + r() * 3, 22, 4, r, pickFrom(r, WORKS), 0x5f6468, 0));
        row(-24, -24, 100, 63, (x, _w, z) => {
          add(ch, "flood", { x, y: GROUND, z, sx: 1, sy: 1, sz: 1, c: 0x6a6f70 });
          for (const dx of [-0.8, 0, 0.8]) glow(ch, x + dx, GROUND + 18.2, z + 0.4, 2.6, 0xfff2d6, 2.6);
          ch.lamps.push([x, GROUND + 18, z]);
        });
        break;
      }
      case "fields": {
        row(-26, -40, 60, 70, (x, _w, z, r) => {
          if (r() < 0.45) return;
          // A row of vinyl greenhouses.
          for (let k = 0; k < 4; k++) add(ch, "greenhouse", { x, y: GROUND, z: z - k * 9, sx: 34 + r() * 10, sy: 3.4, sz: 7, c: 0xe2e6e2 });
        });
        row(-80, -130, 70, 71, (x, _w, z, r) => {
          if (r() < 0.5) building(ch, "house", x, z, 9, 6.4, 9, 6, r, pickFrom(r, WALLS), pickFrom(r, ROOFS), lit * 0.5);
          for (let k = 0; k < 6; k++) add(ch, "broadleaf", { x: x + (r() - 0.5) * 60, y: GROUND, z: z - 14 - r() * 8, sx: 5 + r() * 3, sy: 6 + r() * 4, sz: 5 + r() * 3, ry: r() * 6, c: pickFrom(r, GREENS) });
        });
        break;
      }
      case "forest": {
        for (let k = 0; k < 64; k++) {
          const x = x0 + m() * CHUNK;
          const z = -20 - m() * m() * 150;
          // Smaller at the edge of the wood, taller further in.
          const s = 4 + m() * 4 + Math.min(6, (-z - 20) * 0.08);
          add(ch, m() < 0.7 ? "conifer" : "broadleaf", { x, y: GROUND, z, sx: s * 0.8, sy: s * 1.5, sz: s * 0.8, ry: m() * 6.3, c: pickFrom(m, [...DARK_GREENS, ...GREENS]) });
        }
        break;
      }
      case "hills": {
        row(-110, -170, 120, 80, (x, _w, z, r) => add(ch, "mound", { x, y: GROUND - 3, z, sx: 110 + r() * 80, sy: 22 + r() * 22, sz: 70 + r() * 30, ry: r() * 6, c: pickFrom(r, GREENS) }));
        for (let k = 0; k < 24; k++) {
          const x = x0 + m() * CHUNK;
          const z = -20 - m() * 60;
          const s = 3 + m() * 2;
          add(ch, "broadleaf", { x, y: GROUND, z, sx: s, sy: s * 1.1, sz: s, ry: m() * 6.3, c: pickFrom(m, GREENS) });
        }
        row(-40, -60, 90, 81, (x, _w, z, r) => {
          if (r() < 0.5) building(ch, "house", x, z, 8, 6, 8, 6, r, pickFrom(r, WALLS), pickFrom(r, ROOFS), lit * 0.5);
        });
        break;
      }
      case "river": {
        // The far bank: a line of flats and lamps along the embankment road.
        row(-230, -250, 60, 90, (x, w, z, r) => {
          const floors = 10 + Math.floor(r() * 14);
          building(ch, "block", x, z, w - 10 - r() * 12, floors * 2.8, 12, 0, r, pickFrom(r, [0xd8d4c8, 0xcfc6b0]), 0x5a5f63, 0.5);
        });
        row(-205, -205, 25, 91, (x, _w, z) => glow(ch, x, GROUND + 5, z, 2.4, 0xffb866, 2.2));
        break;
      }
    }

    // Shoulders of land where a tunnel goes in or comes out.
    for (const seg of route.between(x0 - 120, x1 + 120)) {
      if (seg.kind !== "tunnel") continue;
      for (const edge of [seg.start, seg.end])
        if (edge >= x0 && edge < x1) {
          const r = rng(Math.floor(hash01(seed, Math.round(edge), 5) * 4294967296));
          add(ch, "mound", { x: edge, y: GROUND - 6, z: -40, sx: 120 + r() * 40, sy: 36 + r() * 16, sz: 50, ry: r() * 6, c: pickFrom(r, DARK_GREENS) });
          add(ch, "mound", { x: edge, y: GROUND - 4, z: -100, sx: 200, sy: 55, sz: 80, ry: r() * 6, c: pickFrom(r, GREENS) });
        }
    }
    return ch;
  };

  // Far: skylines behind towns, hills beyond the country.
  const genFar = (j: number): Chunk => {
    const ch: Chunk = { items: {}, wires: [], lamps: [], road: false };
    const x0 = j * FAR_CHUNK;
    const r = rng(Math.floor(hash01(seed, j, 777) * 4294967296));
    for (let x = x0; x < x0 + FAR_CHUNK; x += 22 + r() * 30) {
      const kind = kindAt(x);
      const town = kind === "urban" || kind === "apartments" || kind === "industrial" || kind === "river" || kind === "yard";
      if (town || r() < 0.08) {
        const z = -330 - r() * 380;
        const floors = town ? 10 + Math.floor(r() * 26) : 6 + Math.floor(r() * 8);
        building(ch, "block", x, z, 16 + r() * 26, floors * 3.3, 16 + r() * 16, r() < 0.5 ? 0 : 1, r, pickFrom(r, WALLS), 0x3c3f42, 0.25 + r() * 0.3);
        if (floors > 20) glow(ch, x, GROUND + floors * 3.3 + 2, z, 5, 0xff2a18, 2.2, true);
      } else if (r() < 0.25) {
        add(ch, "mound", { x, y: GROUND - 6, z: -320 - r() * 200, sx: 220 + r() * 160, sy: 26 + r() * 30, sz: 110, ry: r() * 6, c: pickFrom(r, GREENS) });
      }
    }
    return ch;
  };

  // ------------------------------------------------------------ pools fill
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  let origin = 0;
  let windowKey = "";

  const fill = (travel: number) => {
    const lo = Math.floor((travel - RANGE) / CHUNK);
    const hi = Math.floor((travel + RANGE) / CHUNK);
    const flo = Math.floor((travel - FAR_RANGE) / FAR_CHUNK);
    const fhi = Math.floor((travel + FAR_RANGE) / FAR_CHUNK);
    const key = `${lo}:${hi}:${flo}:${fhi}:${origin}`;
    if (key === windowKey) return;
    windowKey = key;
    for (const k of cache.keys()) if (k < lo - 2 || k > hi + 2) cache.delete(k);
    for (const k of farCache.keys()) if (k < flo - 1 || k > fhi + 1) farCache.delete(k);
    const chunks: Chunk[] = [];
    for (let i = lo; i <= hi; i++) {
      let c = cache.get(i);
      if (!c) cache.set(i, (c = genChunk(i)));
      chunks.push(c);
    }
    for (let j = flo; j <= fhi; j++) {
      let c = farCache.get(j);
      if (!c) farCache.set(j, (c = genFar(j)));
      chunks.push(c);
    }
    const counts = {} as Record<Pool, number>;
    for (const name of Object.keys(meshes) as Pool[]) counts[name] = 0;
    let wi = 0;
    for (const c of chunks) {
      for (const [name, items] of Object.entries(c.items) as [Pool, Item[]][]) {
        const mesh = meshes[name];
        const cap = defs[name].cap;
        const trackside = BY_THE_LINE.has(name);
        for (const it of items) {
          const n = counts[name];
          if (n >= cap) break;
          // Nothing stands where a platform is (a stop called at short notice included).
          if (trackside && it.z > -9 && nearStop(it.x)) continue;
          dummy.position.set(it.x - origin, it.y, it.z);
          dummy.rotation.set(0, it.ry ?? 0, 0);
          dummy.scale.set(it.sx, it.sy, it.sz);
          dummy.updateMatrix();
          mesh.setMatrixAt(n, dummy.matrix);
          if (mesh.instanceColor) {
            if (it.lin) col.copy(it.lin);
            else col.setHex(it.c ?? 0xffffff);
            mesh.setColorAt(n, col);
          }
          const fa = facadeAttr[name];
          if (fa) {
            fa.f.setXYZ(n, it.f?.[0] ?? 4, it.f?.[1] ?? 0, it.f?.[2] ?? 0);
            col.setHex(it.roof ?? 0x444444);
            fa.roof.setXYZ(n, col.r, col.g, col.b);
          }
          counts[name] = n + 1;
        }
      }
      for (let k = 0; k + 5 < c.wires.length && wi + 2 <= WIRE_CAP; k += 6) {
        wirePos.set([c.wires[k] - origin, c.wires[k + 1], c.wires[k + 2], c.wires[k + 3] - origin, c.wires[k + 4], c.wires[k + 5]], wi * 3);
        wi += 2;
      }
    }
    for (const [name, mesh] of Object.entries(meshes) as [Pool, THREE.InstancedMesh][]) {
      mesh.count = counts[name];
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      const fa = facadeAttr[name];
      if (fa) {
        fa.f.needsUpdate = true;
        fa.roof.needsUpdate = true;
      }
    }
    wireGeo.setDrawRange(0, wi);
    (wireGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    buildRidges(travel);
  };

  // Ridges: a height field, taller behind hills and forest, low behind towns.
  const ridgeNoise = (x: number, s: number) => {
    let v = 0;
    let a = 0.55;
    let f = 1 / 900;
    for (let o = 0; o < 5; o++) {
      v += a * Math.sin(x * f * Math.PI * 2 + s * (o + 1) * 1.7 + Math.sin(x * f * 0.7 + o) * 1.3);
      a *= 0.5;
      f *= 2.1;
    }
    return 0.5 + 0.5 * v;
  };
  const relief = (x: number) => {
    let r = 0;
    for (let k = -3; k <= 3; k++) r += DRESSING[kindAt(x + k * 220)].relief;
    return r / 7;
  };
  const buildRidges = (travel: number) => {
    const startX = Math.floor((travel - FAR_RANGE - 200) / RIDGE_STEP) * RIDGE_STEP;
    const rel: number[] = [];
    for (let c = 0; c < RIDGE_COLS; c++) rel.push(0.25 + 0.75 * relief(startX + c * RIDGE_STEP));
    for (const rd of ridges) {
      const pos = rd.mesh.geometry.attributes.position as THREE.BufferAttribute;
      for (let c = 0; c < RIDGE_COLS; c++) {
        const x = startX + c * RIDGE_STEP;
        const crest = rd.height * rel[c] * (0.35 + 0.9 * ridgeNoise(x, rd.seed));
        for (let r = 0; r < rd.rows; r++) {
          const t = r / (rd.rows - 1);
          // A slope rising from the plain to the crest, with some roughness on its face.
          const y = GROUND - 8 + crest * Math.sin(t * Math.PI * 0.5) * (0.92 + 0.16 * ridgeNoise(x * 3.1 + r * 40, rd.seed + r));
          pos.setXYZ(c * rd.rows + r, x - origin, y, rd.z0 + (rd.z1 - rd.z0) * t);
        }
      }
      pos.needsUpdate = true;
      rd.mesh.geometry.computeVertexNormals();
    }
  };

  // ---------------------------------------------------------------- update
  let lastTravel = 0;
  const update = (travel: number, atm: Atmosphere, time: number, dt: number) => {
    if (travel - origin > REBASE || travel - origin < -REBASE) {
      origin = Math.floor(travel / REBASE) * REBASE;
      windowKey = "";
    }
    fill(travel);
    root.position.x = -(travel - origin);
    shift.uShift.value = travel % 4096;
    facadeU.uNight.value = atm.night;
    facadeU.uTime.value = time;
    // Glass in the façades holds the sky by day and goes dark at night.
    facadeU.uGlass.value.copy(atm.horizon).lerp(atm.zenith, 0.5).multiplyScalar(1.4);
    const wm = water as THREE.ShaderMaterial;
    wm.uniforms.uSky.value.copy(atm.horizon);
    wm.uniforms.uZenith.value.copy(atm.zenith);
    wm.uniforms.uGlow.value.copy(atm.glow);
    wm.uniforms.uNight.value = atm.night;
    wm.uniforms.uTime.value = time;
    wm.uniforms.uOrigin.value = travel % 4096;
    // Lamps come on as it gets dark; greenhouses glow a little at night (they're lit inside).
    (glowMat as THREE.ShaderMaterial).uniforms.uOn.value = THREE.MathUtils.smoothstep(atm.night, 0.15, 0.6);
    (glowMat as THREE.ShaderMaterial).uniforms.uTime.value = time;
    poolMat.opacity = THREE.MathUtils.smoothstep(atm.night, 0.2, 0.7);
    plastic.emissive.setRGB(0.05, 0.06, 0.05).multiplyScalar(atm.night * 0.6);

    // Cars on whatever road there is.
    const moved = travel - lastTravel;
    lastTravel = travel;
    let gi = 0;
    for (let k = 0; k < CARS; k++) {
      const car = cars[k];
      if (!car.on) {
        car.wait -= dt;
        const spawnX = travel + (k % 2 ? 160 : -160);
        const c = cache.get(Math.floor(spawnX / CHUNK));
        if (car.wait <= 0 && c?.road) {
          car.on = true;
          car.x = spawnX;
          car.v = (k % 2 ? -1 : 1) * (9 + hash01(seed, k, Math.floor(time)) * 7);
          car.lane = k % 2;
        }
      } else {
        car.x += car.v * dt;
        const c = cache.get(Math.floor(car.x / CHUNK));
        if (Math.abs(car.x - travel) > 200 || !c?.road) {
          car.on = false;
          car.wait = 6 + hash01(seed, k, Math.floor(time * 3)) * 20;
        }
      }
      const z = car.lane ? -20.4 : -17.6;
      dummy.position.set(car.x - origin, GROUND, z);
      dummy.rotation.set(0, car.v < 0 ? Math.PI : 0, 0);
      dummy.scale.setScalar(car.on ? 1 : 0.0001);
      dummy.updateMatrix();
      carMesh.setMatrixAt(k, dummy.matrix);
      carMesh.setColorAt(k, car.color);
      // Headlights ahead, tail lights behind.
      const dir = car.v < 0 ? -1 : 1;
      for (const [dx, hex, k2] of [
        [2.2 * dir, 0xfff1d6, 2.2],
        [-2.2 * dir, 0xff2a18, 1.4],
      ] as const)
        for (const dz of [-0.6, 0.6]) {
          dummy.position.set(car.x - origin + dx, GROUND + 0.7, z + dz + 0.9);
          dummy.rotation.set(0, 0, 0);
          dummy.scale.setScalar(car.on ? 0.9 : 0.0001);
          dummy.updateMatrix();
          carGlow.setMatrixAt(gi, dummy.matrix);
          carGlow.setColorAt(gi, col.setHex(hex).multiplyScalar(k2 * (0.25 + 0.75 * atm.night)));
          gi++;
        }
    }
    carMesh.instanceMatrix.needsUpdate = true;
    if (carMesh.instanceColor) carMesh.instanceColor.needsUpdate = true;
    carGlow.instanceMatrix.needsUpdate = true;
    if (carGlow.instanceColor) carGlow.instanceColor.needsUpdate = true;
    void moved;
  };

  const lampsNear = (travel: number, out: THREE.Vector4[]) => {
    let n = 0;
    const i0 = Math.floor((travel - 40) / CHUNK);
    const i1 = Math.floor((travel + 40) / CHUNK);
    for (let i = i0; i <= i1 && n < out.length; i++) {
      const c = cache.get(i);
      if (!c) continue;
      for (const [x, y, z] of c.lamps) {
        if (n >= out.length) break;
        const rel = x - travel;
        if (Math.abs(rel) > 40) continue;
        out[n++].set(rel, y, z, 1);
      }
    }
    return n;
  };

  return {
    root,
    route,
    update,
    lampsNear,
    setStops(next, travel) {
      const changed = next.length !== stops.length || next.some((s, i) => Math.abs(s - stops[i]) > 0.5);
      if (!changed) return;
      stops = next.slice();
      // A stop well ahead gets a proper station approach (that country isn't built yet);
      // one called at short notice just keeps its platform clear (see fill).
      for (const s of stops) if (s - travel > RANGE + 420) {
        route.clear("station", s - 2000);
        route.override("station", s - 360, s + 220);
      }
      windowKey = "";
    },
    dispose() {
      root.clear();
    },
    catenary,
  } as WorldHandle & { catenary: THREE.LineSegments };
}

function glowGeoShared(track: <T extends { dispose(): void }>(x: T) => T) {
  return track(P.glowGeometry());
}
