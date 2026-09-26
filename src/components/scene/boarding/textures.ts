import { seeded } from "../platform/textures";

/**
 * Canvas textures for the boarding scene: a carriage that has done a lot of
 * miles. Seat moquette, a floor worn pale down the aisle, lining panels
 * grubby at kick height, paint streaked below the windows, platform slabs
 * with their stains.
 */

const canvas = (w: number, h: number) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return { c, g: c.getContext("2d")! };
};

/** Fine per-pixel noise, `amount` in 0…255 levels. */
function grain(g: CanvasRenderingContext2D, w: number, h: number, amount: number, seed: number) {
  const rnd = seeded(seed);
  const img = g.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rnd() - 0.5) * amount;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
}

/** Soft blotches of a colour, for grime and wear. */
function blotches(g: CanvasRenderingContext2D, rnd: () => number, n: number, color: string, area: [number, number, number, number], size: [number, number]) {
  const [x0, y0, x1, y1] = area;
  for (let i = 0; i < n; i++) {
    const x = x0 + rnd() * (x1 - x0);
    const y = y0 + rnd() * (y1 - y0);
    const r = size[0] + rnd() * (size[1] - size[0]);
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, color);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

/**
 * Train seat moquette: a small interlocking motif in three tones of the
 * carriage colour, woven tight, with the pile's fleck.
 */
export function moquette(base: [number, number, number], seed = 3) {
  const S = 256;
  const { c, g } = canvas(S, S);
  const tone = (k: number, a = 1) => `rgba(${Math.round(base[0] * k)},${Math.round(base[1] * k)},${Math.round(base[2] * k)},${a})`;
  g.fillStyle = tone(1);
  g.fillRect(0, 0, S, S);
  const cell = 32;
  for (let y = 0; y < S; y += cell) {
    for (let x = 0; x < S; x += cell) {
      const cx = x + cell / 2;
      const cy = y + cell / 2;
      // A diamond with a darker lozenge inside, and small light dots between.
      g.fillStyle = tone(0.72);
      g.beginPath();
      g.moveTo(cx, cy - 12);
      g.lineTo(cx + 12, cy);
      g.lineTo(cx, cy + 12);
      g.lineTo(cx - 12, cy);
      g.closePath();
      g.fill();
      g.fillStyle = tone(1.28);
      g.beginPath();
      g.moveTo(cx, cy - 5);
      g.lineTo(cx + 5, cy);
      g.lineTo(cx, cy + 5);
      g.lineTo(cx - 5, cy);
      g.closePath();
      g.fill();
      g.fillStyle = tone(1.5, 0.8);
      g.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
  }
  // Weave: faint horizontal and vertical threads.
  g.globalAlpha = 0.12;
  for (let i = 0; i < S; i += 2) {
    g.fillStyle = i % 4 ? "#000" : "#fff";
    g.fillRect(0, i, S, 1);
    g.fillRect(i, 0, 1, S);
  }
  g.globalAlpha = 1;
  grain(g, S, S, 26, seed);
  return c;
}

/** Vinyl floor, speckled, worn pale along the aisle and scuffed; grime at the walls. */
export function floor(seed = 11) {
  const W = 1024;
  const H = 256;
  const rnd = seeded(seed);
  const { c, g } = canvas(W, H);
  g.fillStyle = "#4a4640";
  g.fillRect(0, 0, W, H);
  // Speckles of the vinyl.
  for (let i = 0; i < 9000; i++) {
    const k = rnd();
    g.fillStyle = k < 0.5 ? "rgba(30,28,26,0.55)" : k < 0.85 ? "rgba(110,104,94,0.5)" : "rgba(150,140,120,0.5)";
    g.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 1.5, 1 + rnd() * 1.5);
  }
  // The aisle down the middle (v 0.35…0.65) is walked pale and smooth.
  const aisle = g.createLinearGradient(0, 0, 0, H);
  aisle.addColorStop(0.28, "rgba(160,150,132,0)");
  aisle.addColorStop(0.5, "rgba(160,150,132,0.22)");
  aisle.addColorStop(0.72, "rgba(160,150,132,0)");
  g.fillStyle = aisle;
  g.fillRect(0, 0, W, H);
  // Dirt along both walls.
  for (const [y0, y1] of [
    [0, 0.12],
    [0.88, 1],
  ]) {
    const e = g.createLinearGradient(0, y0 * H, 0, y1 * H);
    e.addColorStop(y0 === 0 ? 0 : 1, "rgba(15,13,10,0.55)");
    e.addColorStop(y0 === 0 ? 1 : 0, "rgba(15,13,10,0)");
    g.fillStyle = e;
    g.fillRect(0, y0 * H, W, (y1 - y0) * H);
  }
  // Scuffs from heels and cases.
  g.lineCap = "round";
  for (let i = 0; i < 70; i++) {
    const x = rnd() * W;
    const y = H * (0.25 + rnd() * 0.5);
    g.strokeStyle = rnd() < 0.7 ? "rgba(20,18,15,0.35)" : "rgba(190,180,160,0.18)";
    g.lineWidth = 1 + rnd() * 2;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (rnd() - 0.3) * 40, y + (rnd() - 0.5) * 8);
    g.stroke();
  }
  blotches(g, rnd, 26, "rgba(20,17,13,0.28)", [0, 0, W, H], [6, 22]);
  return c;
}

/**
 * Wall lining panels: warm off-white, a seam every panel, grubby toward the
 * floor and where hands go, a few scuffs from bags.
 */
export function lining(seed = 5) {
  const W = 1024;
  const H = 512;
  const rnd = seeded(seed);
  const { c, g } = canvas(W, H);
  g.fillStyle = "#b9ad93";
  g.fillRect(0, 0, W, H);
  // Faint vertical streaks in the laminate.
  for (let i = 0; i < 160; i++) {
    g.fillStyle = `rgba(${rnd() < 0.5 ? "90,82,66" : "230,222,200"},${0.04 + rnd() * 0.05})`;
    g.fillRect(rnd() * W, 0, 1 + rnd() * 3, H);
  }
  // Kick zone: darker toward the floor (v = 1 is the floor).
  const kick = g.createLinearGradient(0, H * 0.7, 0, H);
  kick.addColorStop(0, "rgba(40,34,26,0)");
  kick.addColorStop(1, "rgba(40,34,26,0.55)");
  g.fillStyle = kick;
  g.fillRect(0, H * 0.7, W, H * 0.3);
  // Panel seams.
  for (let x = 0; x < W; x += 256) {
    g.fillStyle = "rgba(40,34,26,0.45)";
    g.fillRect(x, 0, 2, H);
    g.fillStyle = "rgba(255,248,230,0.18)";
    g.fillRect(x + 2, 0, 1, H);
  }
  // Hand-height smudges, faint; heavier grime only down at the floor.
  blotches(g, rnd, 14, "rgba(60,50,36,0.07)", [0, H * 0.4, W, H * 0.65], [20, 50]);
  blotches(g, rnd, 22, "rgba(40,34,26,0.14)", [0, H * 0.82, W, H], [14, 40]);
  g.lineCap = "round";
  for (let i = 0; i < 40; i++) {
    const x = rnd() * W;
    const y = H * (0.55 + rnd() * 0.4);
    g.strokeStyle = "rgba(45,38,28,0.35)";
    g.lineWidth = 1 + rnd() * 1.5;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (rnd() - 0.5) * 50, y + (rnd() - 0.5) * 10);
    g.stroke();
  }
  grain(g, W, H, 10, seed);
  return c;
}

/**
 * The carriage's side, stainless like a Seoul subway car: satin grey, with
 * rain streaks running down from the windows, brake dust and road dirt
 * thrown up along the bottom, faint panel joints.
 */
export function bodyPaint(windows: number[], span: [number, number], seed = 9) {
  const W = 2048;
  const H = 512;
  const rnd = seeded(seed);
  const { c, g } = canvas(W, H);
  const [x0, x1] = span;
  const u = (x: number) => ((x - x0) / (x1 - x0)) * W;
  g.fillStyle = "#a3a9ad";
  g.fillRect(0, 0, W, H);
  // Streaks from under each window (v: 0 top of the side, 1 the skirt).
  for (const wx of windows) {
    for (let i = 0; i < 26; i++) {
      const x = u(wx) + (rnd() - 0.5) * 120;
      const top = H * (0.52 + rnd() * 0.05);
      const len = H * (0.1 + rnd() * 0.35);
      const s = g.createLinearGradient(0, top, 0, top + len);
      s.addColorStop(0, `rgba(40,42,44,${0.18 + rnd() * 0.2})`);
      s.addColorStop(1, "rgba(12,14,16,0)");
      g.fillStyle = s;
      g.fillRect(x, top, 1 + rnd() * 2.5, len);
    }
  }
  // Road dirt and brake dust along the bottom.
  const dirt = g.createLinearGradient(0, H * 0.72, 0, H);
  dirt.addColorStop(0, "rgba(70,52,34,0)");
  dirt.addColorStop(1, "rgba(70,52,34,0.5)");
  g.fillStyle = dirt;
  g.fillRect(0, H * 0.72, W, H * 0.28);
  blotches(g, rnd, 70, "rgba(80,60,40,0.22)", [0, H * 0.78, W, H], [8, 40]);
  // Panel joints and rivet lines.
  for (let x = 0; x < W; x += 170) {
    g.fillStyle = "rgba(8,10,12,0.5)";
    g.fillRect(x, 0, 2, H);
  }
  for (let x = 6; x < W; x += 14) {
    g.fillStyle = "rgba(200,210,220,0.12)";
    g.fillRect(x, H * 0.08, 2, 2);
    g.fillRect(x, H * 0.9, 2, 2);
  }
  grain(g, W, H, 8, seed);
  return c;
}

/** Platform slabs: joints, stains, the odd blackened gum. */
export function slabs(seed = 13) {
  const S = 512;
  const rnd = seeded(seed);
  const { c, g } = canvas(S, S);
  g.fillStyle = "#56595b";
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 12000; i++) {
    const k = rnd();
    g.fillStyle = k < 0.5 ? "rgba(40,42,44,0.4)" : "rgba(120,122,120,0.35)";
    g.fillRect(rnd() * S, rnd() * S, 1.2, 1.2);
  }
  blotches(g, rnd, 30, "rgba(28,30,32,0.3)", [0, 0, S, S], [12, 60]);
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(22,22,22,${0.5 + rnd() * 0.3})`;
    g.beginPath();
    g.arc(rnd() * S, rnd() * S, 1.5 + rnd() * 3, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = "rgba(20,21,22,0.7)";
  for (let x = 0; x < S; x += 128) g.fillRect(x, 0, 3, S);
  for (let y = 0; y < S; y += 128) g.fillRect(0, y, S, 3);
  grain(g, S, S, 14, seed);
  return c;
}

/** Tactile paving: yellow, raised dots, worn dull where people stand. Also its bump map. */
export function tactile(bump = false, seed = 17) {
  const W = 512;
  const H = 64;
  const rnd = seeded(seed);
  const { c, g } = canvas(W, H);
  g.fillStyle = bump ? "#000" : "#b3923f";
  g.fillRect(0, 0, W, H);
  for (let y = 8; y < H; y += 16) {
    for (let x = 8; x < W; x += 16) {
      const grad = g.createRadialGradient(x, y, 0, x, y, 5.5);
      grad.addColorStop(0, bump ? "#fff" : "rgba(214,184,100,1)");
      grad.addColorStop(1, bump ? "#000" : "rgba(179,146,63,0)");
      g.fillStyle = grad;
      g.fillRect(x - 6, y - 6, 12, 12);
    }
  }
  if (!bump) {
    blotches(g, rnd, 24, "rgba(60,52,36,0.3)", [0, 0, W, H], [6, 20]);
    grain(g, W, H, 16, seed);
  }
  return c;
}
