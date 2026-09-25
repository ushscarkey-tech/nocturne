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
