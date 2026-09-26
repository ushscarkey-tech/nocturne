import { seeded } from "../platform/textures";

function canvas(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!, w, h);
  return c;
}

/** A soft blob, drawn with a radial gradient (canvas blur isn't everywhere). */
function blob(g: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, color: string, alpha: number) {
  g.save();
  g.translate(x, y);
  g.scale(rx, ry);
  const grad = g.createRadialGradient(0, 0, 0, 0, 0, 1);
  grad.addColorStop(0, color.replace("A", String(alpha)));
  grad.addColorStop(1, color.replace("A", "0"));
  g.fillStyle = grad;
  g.beginPath();
  g.arc(0, 0, 1, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

/**
 * The carriage as the glass reflects it, soft and grey: the ceiling light
 * strip, the luggage rack, the windows across the aisle and the tops of the
 * seat backs with their white headrest covers. Tinted in the shader.
 */
export function cabinReflection() {
  return canvas(512, 512, (g, w, h) => {
    g.fillStyle = "#000";
    g.fillRect(0, 0, w, h);
    // Ceiling light strip, running the length of the car.
    const strip = g.createLinearGradient(0, h * 0.04, 0, h * 0.16);
    strip.addColorStop(0, "rgba(255,255,255,0)");
    strip.addColorStop(0.5, "rgba(255,255,255,0.9)");
    strip.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = strip;
    g.fillRect(0, h * 0.04, w, h * 0.12);
    // Luggage rack.
    g.fillStyle = "rgba(255,255,255,0.12)";
    g.fillRect(0, h * 0.24, w, 3);
    g.fillRect(0, h * 0.27, w, 2);
    // The windows across the aisle: darker panes in a lighter wall.
    g.fillStyle = "rgba(255,255,255,0.07)";
    g.fillRect(0, h * 0.3, w, h * 0.32);
    g.fillStyle = "#000";
    for (let x = -60; x < w; x += 250) g.fillRect(x + 20, h * 0.33, 200, h * 0.26);
    // Seat backs, and their headrest covers catching the light.
    for (let x = 30; x < w + 100; x += 128) {
      blob(g, x, h * 0.92, 58, 190, "rgba(120,140,130,A)", 0.55);
      blob(g, x, h * 0.66, 34, 16, "rgba(255,255,255,A)", 0.5);
    }
  });
}

/** The carriage wall: moulded panel with a faint texture. */
export function wallPanel() {
  return canvas(256, 256, (g, w, h) => {
    g.fillStyle = "#b9b4a6";
    g.fillRect(0, 0, w, h);
    const rnd = seeded(8);
    for (let i = 0; i < 4000; i++) {
      const v = rnd() > 0.5 ? 255 : 0;
      g.fillStyle = `rgba(${v},${v},${v},0.025)`;
      g.fillRect(rnd() * w, rnd() * h, 1, 1);
    }
  });
}

/** A block of flats at night: a grid of windows, a few still lit. */
export function flats(cols: number, rows: number, seed: number) {
  const rnd = seeded(seed);
  return canvas(cols * 16, rows * 16, (g, w, h) => {
    g.fillStyle = "#000";
    g.fillRect(0, 0, w, h);
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const k = rnd();
        if (k > 0.2) continue;
        g.fillStyle = k < 0.03 ? "#8fb4ff" : k < 0.12 ? "#ffcf8a" : "#ffe6c0";
        g.globalAlpha = 0.5 + rnd() * 0.5;
        g.fillRect(c * 16 + 3, r * 16 + 4, 10, 8);
      }
    g.globalAlpha = 1;
  });
}

/**
 * The curtain's cloth, across its whole width (u) and drop (v; top of the
 * canvas is the heading). Near-white, so the carriage's colour tints it: a
 * tone-on-tone jacquard, the weave, the stitched heading, side hem and
 * weighted bottom hem, sun-fading up top and where hands take the edge.
 */
export function curtainFabric() {
  return canvas(1024, 1024, (g, w, h) => {
    const rnd = seeded(417);
    g.fillStyle = "rgb(236,236,236)";
    g.fillRect(0, 0, w, h);

    // Jacquard: a small, tone-on-tone lozenge where the pattern thread
    // floats and catches the light, in a half-drop repeat.
    g.fillStyle = "rgba(255,255,255,0.05)";
    for (let y = 0, row = 0; y < h + 20; y += 16, row++) {
      for (let x = row % 2 ? 9 : 0; x < w + 20; x += 18) {
        g.beginPath();
        g.moveTo(x, y - 5);
        g.lineTo(x + 5, y);
        g.lineTo(x, y + 5);
        g.lineTo(x - 5, y);
        g.closePath();
        g.fill();
      }
    }

    // The weave: warp and weft threads, never quite even.
    for (let x = 0; x < w; x += 2) {
      const v = (rnd() - 0.5) * 0.09;
      g.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`;
      g.fillRect(x, 0, 1, h);
    }
    for (let y = 0; y < h; y += 2) {
      const v = (rnd() - 0.5) * 0.07;
      g.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`;
      g.fillRect(0, y, w, 1);
    }
    // Slubs: the odd thicker thread.
    for (let i = 0; i < 260; i++) {
      g.fillStyle = `rgba(255,255,255,${0.05 + rnd() * 0.06})`;
      g.fillRect(rnd() * w, rnd() * h, 6 + rnd() * 26, 1);
    }

    // Mottle, then the years: faded where the sun reaches over the glass,
    // greyed where hands take the leading edge, a water mark near the hem.
    for (let i = 0; i < 60; i++) blob(g, rnd() * w, rnd() * h, 30 + rnd() * 90, 20 + rnd() * 70, rnd() > 0.5 ? "rgba(255,255,255,A)" : "rgba(0,0,0,A)", 0.04);
    blob(g, w * 0.7, h * 0.12, w * 0.45, h * 0.3, "rgba(255,248,235,A)", 0.12);
    blob(g, w * 0.97, h * 0.5, w * 0.06, h * 0.2, "rgba(40,34,28,A)", 0.14);
    blob(g, w * 0.99, h * 0.62, w * 0.03, h * 0.08, "rgba(30,26,22,A)", 0.12);
    blob(g, w * 0.3, h * 0.9, w * 0.05, h * 0.03, "rgba(60,50,40,A)", 0.08);

    const stitch = (x0: number, y0: number, x1: number, y1: number) => {
      g.save();
      g.setLineDash([5, 3]);
      g.strokeStyle = "rgba(255,255,255,0.28)";
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x1, y1);
      g.stroke();
      g.restore();
    };
    // Heading tape: stiffened, a shade flatter, stitched along both edges.
    const head = h * 0.05;
    g.fillStyle = "rgba(0,0,0,0.05)";
    g.fillRect(0, 0, w, head);
    stitch(0, 6, w, 6);
    stitch(0, head - 4, w, head - 4);
    // Bottom hem: a doubled, weighted fold with its crease and stitching.
    const hem = h * 0.065;
    const hemGrad = g.createLinearGradient(0, h - hem - 6, 0, h - hem + 4);
    hemGrad.addColorStop(0, "rgba(0,0,0,0)");
    hemGrad.addColorStop(1, "rgba(0,0,0,0.14)");
    g.fillStyle = hemGrad;
    g.fillRect(0, h - hem - 6, w, 10);
    g.fillStyle = "rgba(0,0,0,0.04)";
    g.fillRect(0, h - hem, w, hem);
    stitch(0, h - hem + 8, w, h - hem + 8);
    g.fillStyle = "rgba(0,0,0,0.18)";
    g.fillRect(0, h - 3, w, 3);
    // Side hem at the leading edge, a little worn along its fold.
    const side = 14;
    g.fillStyle = "rgba(0,0,0,0.05)";
    g.fillRect(w - side, 0, side, h);
    stitch(w - side + 3, 0, w - side + 3, h);
    g.fillStyle = "rgba(255,255,255,0.12)";
    g.fillRect(w - 2, 0, 2, h);
  });
}
