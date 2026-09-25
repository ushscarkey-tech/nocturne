import * as THREE from "three";

type Draw = (g: CanvasRenderingContext2D, w: number, h: number) => void;

function canvas(w: number, h: number, draw: Draw) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!, w, h);
  return c;
}

export function texture(c: HTMLCanvasElement, opts: { repeat?: [number, number]; srgb?: boolean } = {}) {
  const tex = new THREE.CanvasTexture(c);
  if (opts.repeat) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(...opts.repeat);
  }
  if (opts.srgb !== false) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** A seeded random, so the station looks the same every night. */
export function seeded(seed = 7) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function grain(g: CanvasRenderingContext2D, w: number, h: number, amount: number, rnd: () => number) {
  const img = g.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rnd() - 0.5) * amount;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
}

function blotches(g: CanvasRenderingContext2D, w: number, h: number, color: string, count: number, rnd: () => number, alpha = 0.08, size = 60) {
  g.fillStyle = color;
  for (let i = 0; i < count; i++) {
    g.globalAlpha = alpha * (0.4 + rnd());
    g.beginPath();
    g.ellipse(rnd() * w, rnd() * h, 6 + rnd() * size, 4 + rnd() * size * 0.6, rnd() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
}

/** Platform concrete: slabs, joints, old stains. One tile is 2.6 m square. */
export function concrete() {
  const rnd = seeded(11);
  return canvas(512, 512, (g, w, h) => {
    g.fillStyle = "#5b5a55";
    g.fillRect(0, 0, w, h);
    blotches(g, w, h, "#3d3c38", 40, rnd, 0.07, 80);
    blotches(g, w, h, "#8a877e", 26, rnd, 0.05, 50);
    grain(g, w, h, 22, rnd);
    g.strokeStyle = "rgba(30,30,28,0.55)";
    g.lineWidth = 2;
    for (let i = 0; i <= 2; i++) {
      g.beginPath();
      g.moveTo(0, i * (h / 2));
      g.lineTo(w, i * (h / 2));
      g.stroke();
      g.beginPath();
      g.moveTo(i * (w / 2), 0);
      g.lineTo(i * (w / 2), h);
      g.stroke();
    }
  });
}

export function gravel() {
  const rnd = seeded(23);
  return canvas(256, 256, (g, w, h) => {
    g.fillStyle = "#34332f";
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) {
      const v = 30 + rnd() * 70;
      g.fillStyle = `rgb(${v},${v * 0.97},${v * 0.92})`;
      const s = 1 + rnd() * 3;
      g.fillRect(rnd() * w, rnd() * h, s, s * (0.6 + rnd() * 0.6));
    }
    blotches(g, w, h, "#1a1916", 14, rnd, 0.2, 40);
  });
}

export function grass() {
  const rnd = seeded(5);
  return canvas(256, 256, (g, w, h) => {
    g.fillStyle = "#18221a";
    g.fillRect(0, 0, w, h);
    blotches(g, w, h, "#0a100b", 30, rnd, 0.3, 50);
    blotches(g, w, h, "#2a3624", 20, rnd, 0.15, 40);
    grain(g, w, h, 30, rnd);
  });
}

/** Corrugated roof sheet seen from below; ribs run across the platform. */
export function roofSheet() {
  return canvas(64, 64, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "#5d5f59");
    grad.addColorStop(0.35, "#7b7d76");
    grad.addColorStop(0.5, "#8a8b84");
    grad.addColorStop(0.65, "#6c6e68");
    grad.addColorStop(1, "#5d5f59");
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  });
}

/** Painted vertical boards on the station building. */
export function woodWall() {
  const rnd = seeded(31);
  return canvas(512, 512, (g, w, h) => {
    g.fillStyle = "#8d887a";
    g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 32) {
      g.fillStyle = `rgba(0,0,0,${0.1 + rnd() * 0.08})`;
      g.fillRect(x, 0, 2, h);
      g.fillStyle = `rgba(255,255,255,${0.03 + rnd() * 0.03})`;
      g.fillRect(x + 2, 0, 1, h);
    }
    blotches(g, w, h, "#5a564c", 50, rnd, 0.035, 30);
    g.fillStyle = "#3b4540";
    g.fillRect(0, h * 0.78, w, h * 0.22);
    g.fillStyle = "rgba(255,255,255,0.05)";
    g.fillRect(0, h * 0.78, w, 3);
    grain(g, w, h, 16, rnd);
  });
}

/** A lit window, frosted in its lower half. */
export function windowGlow() {
  const rnd = seeded(41);
  return canvas(256, 256, (g, w, h) => {
    const grad = g.createRadialGradient(w * 0.45, h * 0.3, 10, w * 0.5, h * 0.5, w * 0.8);
    grad.addColorStop(0, "#ffe2b0");
    grad.addColorStop(0.5, "#e9a866");
    grad.addColorStop(1, "#8a5230");
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    // A shelf and a plant, out of focus.
    g.filter = "blur(6px)";
    g.fillStyle = "rgba(60,30,15,0.55)";
    g.fillRect(w * 0.1, h * 0.52, w * 0.45, 10);
    g.beginPath();
    g.ellipse(w * 0.75, h * 0.42, 26, 38, 0, 0, Math.PI * 2);
    g.fill();
    g.filter = "none";
    // Curtain on the left.
    const cg = g.createLinearGradient(0, 0, w * 0.22, 0);
    cg.addColorStop(0, "rgba(120,60,30,0.85)");
    cg.addColorStop(1, "rgba(120,60,30,0)");
    g.fillStyle = cg;
    g.fillRect(0, 0, w * 0.22, h);
    // Frosted lower half.
    g.fillStyle = "rgba(255,236,210,0.28)";
    g.fillRect(0, h * 0.58, w, h * 0.42);
    grain(g, w, h, 10, rnd);
    // Frame.
    g.strokeStyle = "#2b231c";
    g.lineWidth = 8;
    g.strokeRect(4, 4, w - 8, h - 8);
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(w / 2, 0);
    g.lineTo(w / 2, h);
    g.moveTo(0, h * 0.58);
    g.lineTo(w, h * 0.58);
    g.stroke();
  });
}

/** Front of a vending machine: lit rows of bottles, price buttons, coin panel. */
export function vendingFace(body: string, seed: number) {
  const rnd = seeded(seed);
  return canvas(256, 512, (g, w, h) => {
    g.fillStyle = body;
    g.fillRect(0, 0, w, h);
    const win = g.createLinearGradient(0, 18, 0, 300);
    win.addColorStop(0, "#f4fbff");
    win.addColorStop(1, "#c9dce6");
    g.fillStyle = win;
    g.fillRect(14, 18, w - 28, 290);
    const colors = ["#b8433a", "#2f6ea8", "#d9b14a", "#3f7d52", "#ece6d6", "#8c4a6e", "#e07a3a", "#5b8f9a"];
    for (let row = 0; row < 3; row++) {
      const y = 30 + row * 94;
      for (let col = 0; col < 7; col++) {
        const x = 24 + col * 31;
        g.fillStyle = colors[Math.floor(rnd() * colors.length)];
        g.beginPath();
        // A rounded bottle (arcTo, since older Safari has no roundRect).
        g.moveTo(x + 5, y + 14);
        g.arcTo(x + 20, y + 14, x + 20, y + 66, 5);
        g.arcTo(x + 20, y + 66, x, y + 66, 5);
        g.arcTo(x, y + 66, x, y + 14, 5);
        g.arcTo(x, y + 14, x + 20, y + 14, 5);
        g.fill();
        g.fillStyle = "rgba(255,255,255,0.35)";
        g.fillRect(x + 4, y + 18, 3, 42);
        g.fillStyle = "#e8e8e8";
        g.fillRect(x + 5, y + 6, 10, 9);
        g.fillStyle = "#1c2328";
        g.fillRect(x, y + 72, 20, 8);
        g.fillStyle = rnd() > 0.2 ? "#5fe08a" : "#ff5a4a";
        g.fillRect(x + 7, y + 74, 6, 4);
      }
    }
    g.fillStyle = "#20262b";
    g.fillRect(150, 330, 80, 70);
    g.fillStyle = "#9fe3ff";
    g.fillRect(160, 342, 60, 14);
    g.fillStyle = "#0d1114";
    g.fillRect(26, 430, w - 52, 50);
    g.fillStyle = "rgba(255,255,255,0.08)";
    g.fillRect(26, 430, w - 52, 4);
  });
}

/** Lightbox station sign: name, the line band, neighbouring stops. */
export function stationSign(name: string, font: { sans: string; mono: string }, band = "NOCTURNE LINE") {
  return canvas(1024, 256, (g, w, h) => {
    const bg = g.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, "#f6f3ea");
    bg.addColorStop(1, "#e4dfd2");
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#1c2421";
    g.textAlign = "center";
    g.textBaseline = "middle";
    let size = 92;
    g.font = `500 ${size}px ${font.sans}`;
    (g as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = "10px";
    const label = name.toUpperCase().slice(0, 18);
    while (g.measureText(label).width > w - 120 && size > 40) {
      size -= 4;
      g.font = `500 ${size}px ${font.sans}`;
    }
    g.fillText(label, w / 2, 100);
    g.fillStyle = "#2f6f68";
    g.fillRect(0, 170, w, 30);
    g.fillStyle = "#f6f3ea";
    g.font = `500 20px ${font.mono}`;
    (g as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = "6px";
    g.fillText(band, w / 2, 186);
    g.fillStyle = "#56605b";
    g.font = `400 22px ${font.mono}`;
    g.textAlign = "left";
    g.fillText("◂", 36, 228);
    g.textAlign = "right";
    g.fillText("▸", w - 36, 228);
  });
}

/** Station clock face with the real time. */
export function drawClock(c: HTMLCanvasElement, now: Date) {
  const g = c.getContext("2d")!;
  const s = c.width;
  const r = s / 2;
  g.clearRect(0, 0, s, s);
  g.fillStyle = "#f2efe6";
  g.beginPath();
  g.arc(r, r, r - 2, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = "#1d2320";
  g.lineWidth = 10;
  g.stroke();
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    const long = i % 5 === 0;
    g.lineWidth = long ? 7 : 2.5;
    g.beginPath();
    g.moveTo(r + Math.sin(a) * (r - 18), r - Math.cos(a) * (r - 18));
    g.lineTo(r + Math.sin(a) * (r - (long ? 44 : 28)), r - Math.cos(a) * (r - (long ? 44 : 28)));
    g.stroke();
  }
  const hand = (a: number, len: number, width: number) => {
    g.lineWidth = width;
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(r - Math.sin(a) * 14, r + Math.cos(a) * 14);
    g.lineTo(r + Math.sin(a) * len, r - Math.cos(a) * len);
    g.stroke();
  };
  const m = now.getMinutes();
  const hr = (now.getHours() % 12) + m / 60;
  hand((hr / 12) * Math.PI * 2, r * 0.5, 13);
  hand((m / 60) * Math.PI * 2, r * 0.76, 9);
}

export function clockCanvas() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  return c;
}

/** Posters on the building wall: a sea at dusk and a mountain line. */
export function poster(kind: 0 | 1) {
  const rnd = seeded(51 + kind);
  return canvas(128, 180, (g, w, h) => {
    const sky = g.createLinearGradient(0, 0, 0, h);
    if (kind === 0) {
      sky.addColorStop(0, "#2d4a63");
      sky.addColorStop(0.55, "#d98c5f");
      sky.addColorStop(0.56, "#35546a");
      sky.addColorStop(1, "#1d3446");
    } else {
      sky.addColorStop(0, "#e8e0cc");
      sky.addColorStop(1, "#b9c7bf");
    }
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);
    if (kind === 1) {
      g.fillStyle = "#3f5f55";
      g.beginPath();
      g.moveTo(0, 120);
      for (let x = 0; x <= w; x += 8) g.lineTo(x, 95 + Math.sin(x * 0.07) * 18 + rnd() * 4);
      g.lineTo(w, h);
      g.lineTo(0, h);
      g.fill();
    }
    g.fillStyle = kind === 0 ? "rgba(255,240,220,0.85)" : "#2b3a35";
    g.fillRect(12, h - 34, w * 0.55, 6);
    g.fillRect(12, h - 22, w * 0.35, 4);
    g.strokeStyle = "#f2efe6";
    g.lineWidth = 6;
    g.strokeRect(0, 0, w, h);
  });
}

/** A row of cedars, drawn as a soft-edged silhouette mask (white on clear). */
export function treeline(seed: number) {
  const rnd = seeded(seed);
  return canvas(1024, 256, (g, w, h) => {
    g.fillStyle = "#fff";
    g.beginPath();
    g.moveTo(0, h);
    let x = 0;
    while (x < w) {
      const tw = 14 + rnd() * 26;
      const th = 90 + rnd() * 130;
      const base = h - 20 - rnd() * 20;
      g.lineTo(x, base);
      // A cedar: a jagged spire.
      const steps = 7;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        g.lineTo(x + (tw / 2) * t + (rnd() - 0.5) * 3, base - th * t + (i % 2 ? 6 : 0));
      }
      for (let i = steps - 1; i >= 0; i--) {
        const t = i / steps;
        g.lineTo(x + tw - (tw / 2) * t + (rnd() - 0.5) * 3, base - th * t + (i % 2 ? 6 : 0));
      }
      x += tw * (0.55 + rnd() * 0.5);
    }
    g.lineTo(w, h);
    g.closePath();
    g.fill();
  });
}

/** Low shrubs behind the fence. */
export function shrubs(seed: number) {
  const rnd = seeded(seed);
  return canvas(512, 128, (g, w, h) => {
    g.fillStyle = "#fff";
    g.fillRect(0, h - 24, w, 24);
    for (let i = 0; i < 70; i++) {
      g.beginPath();
      g.arc(rnd() * w, h - 20 - rnd() * 40, 10 + rnd() * 26, 0, Math.PI * 2);
      g.fill();
    }
  });
}

/** A radial falloff used for soft glows and contact shadows. */
export function softDot() {
  return canvas(128, 128, (g, w) => {
    const grad = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.35, "rgba(255,255,255,0.45)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, w, w);
  });
}

/** Resolve the page's own type (next/font renames families) for canvas text. */
export function pageFonts() {
  const probe = (cls: string) => {
    const el = document.createElement("span");
    el.className = cls;
    el.style.position = "absolute";
    el.style.visibility = "hidden";
    document.body.appendChild(el);
    const family = getComputedStyle(el).fontFamily;
    el.remove();
    return family;
  };
  return {
    sans: probe("font-sans") || "'Helvetica Neue', Arial, sans-serif",
    mono: probe("font-mono") || "ui-monospace, Menlo, monospace",
  };
}
