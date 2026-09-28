import * as THREE from "three";

/**
 * Fellow travellers, so a night of study isn't a lonely one: small round
 * characters of Nocturne's own, modelled here from simple shapes.
 *
 * - Hodu (호두), a walnut-brown owl in a rust scarf, always reading.
 * - Bori (보리), a cream tabby cat, curled up asleep.
 * - Mongsil (몽실), a round grey-white seal in headphones, studying with a pencil.
 *
 * Each is built at about one unit tall, facing +z; scale and place it.
 * Every companion keeps to the page's clock, so the same one seen in two
 * scenes (the owl on your window sill) moves identically in both.
 */

export interface Companion {
  group: THREE.Group;
  /** Advance the idle motion (breathing, blinking, a page, a pencil). */
  update: () => void;
  dispose: () => void;
}

type Parts = { geos: THREE.BufferGeometry[]; mats: THREE.Material[] };

function kit() {
  const parts: Parts = { geos: [], mats: [] };
  const felt = (color: THREE.ColorRepresentation, roughness = 0.88) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
    parts.mats.push(m);
    return m;
  };
  const shape = <G extends THREE.BufferGeometry>(g: G) => {
    parts.geos.push(g);
    return g;
  };
  const ball = (r: number, m: THREE.Material, pos: [number, number, number], scale: [number, number, number] = [1, 1, 1], seg = 28) => {
    const mesh = new THREE.Mesh(shape(new THREE.SphereGeometry(r, seg, Math.round(seg * 0.75))), m);
    mesh.position.set(...pos);
    mesh.scale.set(...scale);
    return mesh;
  };
  const dispose = () => {
    parts.geos.forEach((g) => g.dispose());
    parts.mats.forEach((m) => m.dispose());
  };
  return { felt, shape, ball, dispose };
}

const now = () => performance.now() / 1000;
/** A soft blink every few seconds: 1 = open, 0 = shut. */
const blink = (t: number, every: number, offset: number) => {
  const p = (t + offset) % every;
  return p < 0.14 ? Math.abs(p - 0.07) / 0.07 : 1;
};

/** Hodu the owl, reading a small book; now and then a page turns. */
export function makeOwl(): Companion {
  const k = kit();
  const g = new THREE.Group();
  const brown = k.felt(0x8a6446);
  const cream = k.felt(0xefe0c4);
  const dark = k.felt(0x1d1a18, 0.4);
  const gold = k.felt(0xd9a441, 0.6);
  const rust = k.felt(0xb5563f, 0.95);
  const orange = k.felt(0xc98a4a, 0.7);

  const body = new THREE.Group();
  g.add(body);
  body.add(k.ball(0.42, brown, [0, 0.46, 0], [1, 1.12, 0.95]));
  body.add(k.ball(0.3, cream, [0, 0.38, 0.2], [1, 1.1, 0.55]));
  // Face discs and eyes.
  const eyes = new THREE.Group();
  for (const x of [-0.14, 0.14]) {
    body.add(k.ball(0.15, cream, [x, 0.68, 0.3], [1, 1, 0.4]));
    const eye = new THREE.Group();
    eye.position.set(x, 0.68, 0.37);
    eye.add(k.ball(0.066, dark, [0, 0, 0]));
    eye.add(k.ball(0.018, k.felt(0xffffff, 0.3), [0.022, 0.024, 0.055]));
    eyes.add(eye);
  }
  body.add(eyes);
  const beak = new THREE.Mesh(k.shape(new THREE.ConeGeometry(0.04, 0.09, 12)), gold);
  beak.position.set(0, 0.6, 0.41);
  beak.rotation.x = Math.PI + 0.35;
  body.add(beak);
  // Ear tufts.
  for (const s of [-1, 1]) {
    const tuft = new THREE.Mesh(k.shape(new THREE.ConeGeometry(0.075, 0.2, 14)), brown);
    tuft.position.set(0.21 * s, 0.93, 0.02);
    tuft.rotation.z = -0.45 * s;
    body.add(tuft);
  }
  // Wings, folded forward to hold the book.
  for (const s of [-1, 1]) {
    const wing = k.ball(0.22, brown, [0.36 * s, 0.4, 0.12], [0.36, 0.78, 0.72]);
    wing.rotation.y = -0.5 * s;
    body.add(wing);
  }
  // Feet.
  for (const x of [-0.12, 0.12]) body.add(k.ball(0.07, orange, [x, 0.04, 0.22], [1, 0.5, 1.3]));
  // The scarf: a loop round the neck and a tail hanging over the chest.
  const scarf = new THREE.Mesh(k.shape(new THREE.TorusGeometry(0.41, 0.07, 12, 40)), rust);
  scarf.position.y = 0.53;
  scarf.rotation.x = Math.PI / 2;
  scarf.scale.set(1, 0.93, 1);
  body.add(scarf);
  const tail = new THREE.Mesh(k.shape(new THREE.BoxGeometry(0.1, 0.24, 0.05)), rust);
  tail.position.set(0.17, 0.4, 0.38);
  tail.rotation.z = 0.15;
  body.add(tail);
  // The book, open in its wings.
  const book = new THREE.Group();
  book.position.set(0, 0.3, 0.42);
  book.rotation.x = -0.9;
  const coverMat = k.felt(0x3e5261, 0.7);
  const pageMat = k.felt(0xf4ecdc, 0.9);
  for (const s of [-1, 1]) {
    const half = new THREE.Group();
    half.rotation.y = 0.28 * s;
    const cover = new THREE.Mesh(k.shape(new THREE.BoxGeometry(0.16, 0.2, 0.012)), coverMat);
    cover.position.x = 0.08 * s;
    const pages = new THREE.Mesh(k.shape(new THREE.BoxGeometry(0.15, 0.19, 0.02)), pageMat);
    pages.position.set(0.08 * s, 0, 0.014);
    half.add(cover, pages);
    book.add(half);
  }
  const leaf = new THREE.Mesh(k.shape(new THREE.PlaneGeometry(0.14, 0.18).translate(0.07, 0, 0)), pageMat);
  leaf.material = pageMat;
  (pageMat as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
  leaf.position.z = 0.026;
  book.add(leaf);
  body.add(book);

  const update = () => {
    const t = now();
    body.scale.y = 1 + Math.sin(t * 1.4) * 0.012;
    body.rotation.z = Math.sin(t * 0.35) * 0.05;
    body.rotation.x = 0.06 + Math.sin(t * 0.5) * 0.02;
    eyes.scale.y = Math.max(0.12, blink(t, 4.3, 0.8));
    // A page every nine seconds or so.
    const p = (t % 9) / 1.1;
    leaf.rotation.y = p < 1 ? -Math.PI * (p * p * (3 - 2 * p)) : 0;
  };
  update();
  return { group: g, update, dispose: k.dispose };
}

/** Bori the cat, curled up asleep: slow breaths, an ear that twitches, the tail tip. */
export function makeCat(): Companion {
  const k = kit();
  const g = new THREE.Group();
  const fur = k.felt(0xd9a066);
  const stripe = k.felt(0xb77c45);
  const light = k.felt(0xf3dcb8);
  const dark = k.felt(0x2a211c, 0.5);
  const pink = k.felt(0xd98c8c, 0.6);

  const body = new THREE.Group();
  g.add(body);
  body.add(k.ball(0.4, fur, [0, 0.22, 0], [1.25, 0.55, 0.95]));
  for (const x of [-0.22, 0, 0.22]) body.add(k.ball(0.13, stripe, [x, 0.4, -0.05], [0.35, 0.2, 1.3]));
  const head = new THREE.Group();
  head.position.set(0.34, 0.3, 0.16);
  head.rotation.y = -0.35;
  head.add(k.ball(0.2, fur, [0, 0, 0], [1.05, 0.88, 0.95]));
  head.add(k.ball(0.09, light, [0, -0.06, 0.13], [1.3, 0.8, 0.7]));
  head.add(k.ball(0.02, pink, [0, -0.02, 0.19]));
  // Closed eyes: two short dark lines, slightly smiling.
  for (const s of [-1, 1]) {
    const lid = new THREE.Mesh(k.shape(new THREE.TorusGeometry(0.04, 0.008, 6, 12, Math.PI)), dark);
    lid.position.set(0.075 * s, 0.03, 0.17);
    lid.rotation.z = Math.PI;
    head.add(lid);
  }
  const ears: THREE.Mesh[] = [];
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(k.shape(new THREE.ConeGeometry(0.075, 0.13, 3)), fur);
    ear.position.set(0.11 * s, 0.17, 0);
    ear.rotation.z = -0.35 * s;
    head.add(ear);
    ears.push(ear);
  }
  body.add(head);
  // The tail wraps round the front.
  const tail = new THREE.Mesh(k.shape(new THREE.TorusGeometry(0.4, 0.075, 12, 36, Math.PI * 0.95)), fur);
  tail.position.set(-0.02, 0.1, 0.02);
  tail.rotation.x = Math.PI / 2;
  tail.rotation.z = 0.2;
  tail.scale.set(1.12, 0.9, 1);
  body.add(tail);
  const tip = k.ball(0.08, stripe, [0.4, 0.1, 0.22]);
  body.add(tip);

  const update = () => {
    const t = now();
    const breath = Math.sin(t * 1.1);
    body.scale.set(1 + breath * 0.015, 1 + breath * 0.035, 1 + breath * 0.015);
    const twitch = (t % 7.3) < 0.25 ? Math.sin(((t % 7.3) / 0.25) * Math.PI) : 0;
    ears[0].rotation.z = 0.35 + twitch * 0.35;
    tip.position.y = 0.1 + Math.max(0, Math.sin(t * 0.8)) * 0.04;
  };
  update();
  return { group: g, update, dispose: k.dispose };
}

/** Mongsil the seal, headphones on, a pencil tapping to the music. */
export function makeSeal(): Companion {
  const k = kit();
  const g = new THREE.Group();
  const white = k.felt(0xe6eaec);
  const grey = k.felt(0xc3cbd0);
  const dark = k.felt(0x1d1f22, 0.4);
  const cheek = k.felt(0xf0b6b0, 0.7);
  const band = k.felt(0x2d3d35, 0.5);
  const lamp = k.felt(0xdcae6a, 0.45);
  const yellow = k.felt(0xe7c35a, 0.6);
  const paper = k.felt(0xf4ecdc, 0.9);

  const body = new THREE.Group();
  g.add(body);
  body.add(k.ball(0.42, white, [0, 0.44, 0], [1, 1.08, 0.95]));
  body.add(k.ball(0.3, grey, [0, 0.12, -0.05], [1.2, 0.5, 1.1]));
  const eyes = new THREE.Group();
  for (const x of [-0.13, 0.13]) {
    const eye = new THREE.Group();
    eye.position.set(x, 0.58, 0.37);
    eye.add(k.ball(0.052, dark, [0, 0, 0]));
    eye.add(k.ball(0.014, k.felt(0xffffff, 0.3), [0.016, 0.018, 0.045]));
    eyes.add(eye);
    body.add(k.ball(0.06, cheek, [x * 1.45, 0.47, 0.33], [1, 0.6, 0.4]));
  }
  body.add(eyes);
  body.add(k.ball(0.035, dark, [0, 0.5, 0.41], [1.2, 0.8, 0.8]));
  // Headphones.
  const arc = new THREE.Mesh(k.shape(new THREE.TorusGeometry(0.39, 0.03, 8, 30, Math.PI)), band);
  arc.position.set(0, 0.5, 0);
  body.add(arc);
  for (const s of [-1, 1]) {
    const cup = new THREE.Mesh(k.shape(new THREE.CylinderGeometry(0.1, 0.1, 0.07, 20)), lamp);
    cup.position.set(0.4 * s, 0.5, 0);
    cup.rotation.z = Math.PI / 2;
    body.add(cup);
  }
  // Flippers, and a pencil in the right one.
  const flippers: THREE.Mesh[] = [];
  for (const s of [-1, 1]) {
    const f = k.ball(0.14, grey, [0.3 * s, 0.26, 0.26], [0.5, 0.35, 1]);
    f.rotation.y = 0.4 * s;
    body.add(f);
    flippers.push(f);
  }
  const pencil = new THREE.Group();
  pencil.position.set(0.3, 0.3, 0.34);
  const shaft = new THREE.Mesh(k.shape(new THREE.CylinderGeometry(0.014, 0.014, 0.2, 8)), yellow);
  const nib = new THREE.Mesh(k.shape(new THREE.ConeGeometry(0.014, 0.035, 8)), dark);
  nib.position.y = -0.117;
  nib.rotation.x = Math.PI;
  pencil.add(shaft, nib);
  pencil.rotation.set(0.9, 0, -0.4);
  body.add(pencil);
  // A notebook on the lap.
  const notebook = new THREE.Mesh(k.shape(new THREE.BoxGeometry(0.34, 0.02, 0.24)), paper);
  notebook.position.set(0, 0.2, 0.38);
  notebook.rotation.x = 0.35;
  body.add(notebook);

  const update = () => {
    const t = now();
    body.scale.y = 1 + Math.sin(t * 1.3) * 0.012;
    // Nodding along to whatever is in the headphones.
    body.rotation.z = Math.sin(t * 2.2) * 0.035;
    body.rotation.x = 0.1 + Math.max(0, Math.sin(t * 2.2)) * 0.03;
    eyes.scale.y = Math.max(0.12, blink(t, 3.7, 2.1));
    pencil.rotation.x = 0.9 + Math.max(0, Math.sin(t * 6)) * 0.25 * (Math.sin(t * 0.4) > 0 ? 1 : 0);
  };
  update();
  return { group: g, update, dispose: k.dispose };
}

/**
 * Your neighbour on the window sill, in the ride's eye space (eyes at the
 * origin, the glass ahead at −z): the same owl on the ride and at the end
 * of the walk in, so the hand-over still can't be seen.
 */
export function sillCompanion(d: { w: number; h: number; cy: number }, eyeToGlass: number): Companion {
  const owl = makeOwl();
  owl.group.scale.setScalar(0.1);
  const sillTop = d.cy - d.h / 2 - 0.06 + 0.0125;
  owl.group.position.set(d.w / 2 - 0.17, sillTop, -eyeToGlass + 0.075);
  // Turned a little toward you, reading.
  owl.group.rotation.y = -0.35;
  return owl;
}
