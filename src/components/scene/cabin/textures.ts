import { cached, paintContext } from "../canvasCache";
import { seeded } from "../platform/textures";

function canvas(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(paintContext(c), w, h);
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
function cabinReflectionPaint() {
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
function wallPanelPaint() {
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
function flatsPaint(cols: number, rows: number, seed: number) {
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
function curtainFabricPaint() {
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

/**
 * The upper carriage wall: cream-painted panels, a joint every 60 cm with a
 * screw at top and bottom, a faint roller texture and a few old scuffs.
 * One tile is 1.2 m wide (two panels).
 */
function creamPanelPaint() {
  return canvas(512, 512, (g, w, h) => {
    g.fillStyle = "#d8cbad";
    g.fillRect(0, 0, w, h);
    const rnd = seeded(12);
    // Roller stipple.
    for (let i = 0; i < 9000; i++) {
      const v = rnd() > 0.5 ? 255 : 60;
      g.fillStyle = `rgba(${v},${v},${v - 20},0.03)`;
      g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 1);
    }
    // Faint yellowing toward the top, where the lamps are.
    const age = g.createLinearGradient(0, 0, 0, h);
    age.addColorStop(0, "rgba(150,110,40,0.08)");
    age.addColorStop(1, "rgba(150,110,40,0)");
    g.fillStyle = age;
    g.fillRect(0, 0, w, h);
    // Panel joints and screws.
    for (const x of [0, w / 2]) {
      g.fillStyle = "rgba(60,45,25,0.5)";
      g.fillRect(x, 0, 2, h);
      g.fillStyle = "rgba(255,250,235,0.4)";
      g.fillRect(x + 2, 0, 1, h);
      for (const y of [24, h - 24]) {
        for (const dx of [-9, 11]) {
          const cx = x + dx;
          const grad = g.createRadialGradient(cx - 1, y - 1, 0, cx, y, 4);
          grad.addColorStop(0, "#f2eee4");
          grad.addColorStop(0.6, "#9d978a");
          grad.addColorStop(1, "rgba(60,50,40,0.6)");
          g.fillStyle = grad;
          g.beginPath();
          g.arc(cx, y, 3.6, 0, Math.PI * 2);
          g.fill();
          g.strokeStyle = "rgba(40,35,30,0.7)";
          g.lineWidth = 1;
          g.beginPath();
          g.moveTo(cx - 2.4, y);
          g.lineTo(cx + 2.4, y);
          g.stroke();
        }
      }
    }
    // A few scuffs, low, where elbows and bags rub.
    for (let i = 0; i < 14; i++) blob(g, rnd() * w, h * (0.6 + rnd() * 0.4), 8 + rnd() * 30, 2 + rnd() * 5, "rgba(90,70,45,A)", 0.07);
  });
}

/** Wood-grain laminate for the lower wall and the table: warm brown, long grain. */
function woodGrainPaint(base = "#6b4a30", seed = 21) {
  return canvas(512, 256, (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    const rnd = seeded(seed);
    for (let i = 0; i < 180; i++) {
      const y = rnd() * h;
      const dark = rnd() < 0.55;
      g.strokeStyle = dark ? `rgba(40,22,10,${0.08 + rnd() * 0.14})` : `rgba(220,170,110,${0.04 + rnd() * 0.08})`;
      g.lineWidth = 0.6 + rnd() * 2.2;
      g.beginPath();
      g.moveTo(0, y);
      const amp = 1 + rnd() * 4;
      const f = 0.004 + rnd() * 0.01;
      for (let x = 0; x <= w; x += 8) g.lineTo(x, y + Math.sin(x * f + i) * amp + Math.sin(x * f * 3.1) * amp * 0.3);
      g.stroke();
    }
    // A couple of knots.
    for (let k = 0; k < 2; k++) {
      const x = rnd() * w;
      const y = rnd() * h;
      for (let r = 12; r > 1; r -= 2) {
        g.strokeStyle = `rgba(35,18,8,${0.08 + (12 - r) * 0.01})`;
        g.beginPath();
        g.ellipse(x, y, r * 2.2, r * 0.6, 0, 0, Math.PI * 2);
        g.stroke();
      }
    }
  });
}

/** Seat moquette: a small woven check, faded where it's been sat on. */
function moquettePaint(base = "#2f4a3a") {
  return canvas(128, 128, (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 4)
      for (let x = 0; x < w; x += 4) {
        const on = ((x >> 2) + (y >> 2)) % 2 === 0;
        g.fillStyle = on ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.12)";
        g.fillRect(x, y, 4, 4);
      }
    const rnd = seeded(5);
    for (let i = 0; i < 1500; i++) {
      g.fillStyle = `rgba(255,255,255,${rnd() * 0.05})`;
      g.fillRect(rnd() * w, rnd() * h, 1, 1);
    }
  });
}

/** The small engraved brass plate by the window: the car and seat. */
function plaquePaint(line1: string, line2: string) {
  return canvas(384, 144, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, "#b8964f");
    grad.addColorStop(0.5, "#d7bc7a");
    grad.addColorStop(1, "#9c7c3c");
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    // Brushed.
    const rnd = seeded(3);
    for (let i = 0; i < 300; i++) {
      g.fillStyle = `rgba(${rnd() < 0.5 ? "255,240,200" : "70,50,20"},0.08)`;
      g.fillRect(0, rnd() * h, w, 1);
    }
    g.strokeStyle = "rgba(60,40,15,0.8)";
    g.lineWidth = 3;
    g.strokeRect(6, 6, w - 12, h - 12);
    // Engraved: dark letters with a light lower edge.
    g.textAlign = "center";
    g.textBaseline = "middle";
    const engrave = (text: string, y: number, size: number, spacing: number) => {
      g.font = `600 ${size}px "IBM Plex Mono", ui-monospace, monospace`;
      const letters = text.split("");
      const widths = letters.map((ch) => g.measureText(ch).width + spacing);
      let x = w / 2 - widths.reduce((a, b) => a + b, 0) / 2;
      letters.forEach((ch, i) => {
        g.fillStyle = "rgba(255,240,200,0.55)";
        g.fillText(ch, x + widths[i] / 2, y + 1.5);
        g.fillStyle = "rgba(40,26,8,0.92)";
        g.fillText(ch, x + widths[i] / 2, y);
        x += widths[i];
      });
    };
    engrave(line1, h * 0.36, 34, 6);
    engrave(line2, h * 0.7, 26, 4);
    // Two screws.
    for (const x of [22, w - 22]) {
      g.fillStyle = "#8a6c32";
      g.beginPath();
      g.arc(x, h / 2, 7, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = "rgba(40,26,8,0.9)";
      g.beginPath();
      g.moveTo(x - 5, h / 2 - 2);
      g.lineTo(x + 5, h / 2 + 2);
      g.stroke();
    }
  });
}

// Painted once per page (see canvasCache).
export const cabinReflection = cached("cabin/cabinReflection", cabinReflectionPaint);
export const wallPanel = cached("cabin/wallPanel", wallPanelPaint);
export const flats = cached("cabin/flats", flatsPaint);
export const curtainFabric = cached("cabin/curtainFabric", curtainFabricPaint);
export const creamPanel = cached("cabin/creamPanel", creamPanelPaint);
export const woodGrain = cached("cabin/woodGrain", woodGrainPaint);
export const moquette = cached("cabin/moquette", moquettePaint);
export const plaque = cached("cabin/plaque", plaquePaint);
