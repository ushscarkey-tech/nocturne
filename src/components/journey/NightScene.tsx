"use client";

import { useEffect, useRef } from "react";
import type { CarriageId } from "@/core/types";
import { usePrefersReducedMotion } from "@/lib/hooks";

export type SceneMode = "platform" | "night" | "tunnel" | "still";

/**
 * The view from a late local train. Everything eases: the train pulls away
 * slowly, a rainy platform slides in and comes to rest on arrival, the
 * outside darkens before tunnel lamps appear. Motion explains state and is
 * kept very slow so the Cabin can be watched for an hour.
 */
export function NightScene({
  mode,
  carriage,
  stationName,
}: {
  mode: SceneMode;
  carriage: CarriageId;
  stationName?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const target = useRef({ mode, carriage, stationName });
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    target.current = { mode, carriage, stationName };
  }, [mode, carriage, stationName]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let width = 0;
    let height = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    let seed = 90210;
    const rand = () => {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      return ((seed >>> 0) % 10000) / 10000;
    };
    // A ridge line that tiles seamlessly.
    const ridge = Array.from({ length: 48 }, (_, i) => 0.5 + 0.5 * Math.sin(i * 0.55) * 0.5 + rand() * 0.35);
    ridge.push(ridge[0]);
    const houses = Array.from({ length: 14 }, () => ({
      x: rand(),
      w: 0.03 + rand() * 0.05,
      h: 0.03 + rand() * 0.05,
      lit: rand() > 0.45,
      litX: rand(),
    }));
    const town = Array.from({ length: 50 }, () => ({ x: rand(), y: rand(), r: 0.5 + rand() * 0.9, a: 0.25 + rand() * 0.5 }));
    const stars = Array.from({ length: 40 }, () => ({ x: rand(), y: rand() * 0.35, a: 0.1 + rand() * 0.35 }));
    const drops = Array.from({ length: 60 }, () => ({ x: rand(), y: rand(), len: 5 + rand() * 16, v: 0.015 + rand() * 0.04 }));
    const outsideRain = Array.from({ length: 90 }, () => ({ x: rand(), y: rand(), v: 0.5 + rand() * 0.6 }));

    const start = target.current.mode;
    const state = {
      speed: start === "night" ? 1 : start === "tunnel" ? 1.1 : 0,
      dark: start === "tunnel" ? 1 : 0, // exterior darkening before the tunnel
      tunnel: start === "tunnel" ? 1 : 0,
      still: start === "still" ? 1 : 0,
      platformPos: start === "platform" || start === "still" ? 0 : -3,
      far: 0,
      mid: 0,
      near: 0,
      tunnelOffset: 0,
      nextStation: 0.35 + rand() * 0.3, // a lit station passes by now and then
      passing: -3,
    };

    const ease = (cur: number, to: number, rate: number, dt: number) => cur + (to - cur) * (1 - Math.exp(-rate * dt));
    const wrap = (v: number) => ((v % 1) + 1) % 1;

    let raf = 0;
    let last = performance.now();
    const frame = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      const { mode: m, carriage: c, stationName: name } = target.current;
      const moving = m === "night" || m === "tunnel";
      const goalSpeed = reduced ? 0 : m === "tunnel" ? 1.1 : m === "night" ? 1 : 0;

      // Trains take their time: slow acceleration, slower braking into a platform.
      state.speed = ease(state.speed, goalSpeed, goalSpeed > state.speed ? 0.22 : 0.32, dt);
      state.dark = ease(state.dark, m === "tunnel" ? 1 : 0, m === "tunnel" ? 0.45 : 0.3, dt);
      state.tunnel = ease(state.tunnel, m === "tunnel" && state.dark > 0.75 ? 1 : 0, 0.5, dt);
      state.still = ease(state.still, m === "still" ? 1 : 0, 0.25, dt);

      // Platform: slides in from the right while braking, rests, then slips away left on departure.
      if (!moving) {
        if (state.platformPos < -1.2) state.platformPos = 1.4;
        state.platformPos = ease(state.platformPos, 0, reduced ? 50 : 0.34, dt);
      } else if (state.platformPos > -3) {
        state.platformPos -= dt * state.speed * 0.14 + dt * 0.006;
      }

      const v = state.speed;
      state.far = wrap(state.far + dt * v * 0.0035);
      state.mid = wrap(state.mid + dt * v * 0.016);
      state.near = wrap(state.near + dt * v * 0.06);
      state.tunnelOffset = wrap(state.tunnelOffset + dt * v * 0.35);
      if (m === "night" && v > 0.5 && state.passing < -2) {
        state.nextStation -= dt * 0.004;
        if (state.nextStation <= 0) {
          state.passing = 1.6;
          state.nextStation = 0.6 + Math.random() * 0.6;
        }
      }
      if (state.passing > -2) state.passing -= dt * v * 0.06;

      ctx.clearRect(0, 0, width, height);
      const exterior = (1 - state.dark) * (1 - state.still * 0.55);
      const horizon = height * 0.62;

      // Sky: black-blue with a faint green haze near the horizon.
      const sky = ctx.createLinearGradient(0, 0, 0, horizon);
      sky.addColorStop(0, `rgba(10,14,24,${exterior})`);
      sky.addColorStop(1, `rgba(24,36,40,${exterior})`);
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, width, horizon);

      if (exterior > 0.01) {
        for (const s of stars) {
          ctx.fillStyle = `rgba(232,226,210,${s.a * exterior * (c === "rain" ? 0.2 : 1)})`;
          ctx.fillRect(s.x * width, s.y * height, 1, 1);
        }
        if (c === "moon") {
          const mx = width * 0.76;
          const my = height * 0.16;
          const g = ctx.createRadialGradient(mx, my, 0, mx, my, 110);
          g.addColorStop(0, `rgba(239,230,211,${0.55 * exterior})`);
          g.addColorStop(0.08, `rgba(239,230,211,${0.3 * exterior})`);
          g.addColorStop(1, "rgba(239,230,211,0)");
          ctx.fillStyle = g;
          ctx.fillRect(mx - 110, my - 110, 220, 220);
        }

        // Distant ridge, barely moving.
        ctx.fillStyle = `rgba(12,20,18,${exterior})`;
        ctx.beginPath();
        ctx.moveTo(0, horizon);
        const seg = width / 12;
        for (let i = 0; i <= 13; i++) {
          const idx = (i + state.far * 48) % 48;
          const i0 = Math.floor(idx);
          const f = idx - i0;
          const h = ridge[i0] * (1 - f) + ridge[i0 + 1] * f;
          ctx.lineTo(i * seg - (state.far * 48 % 1) * seg, horizon - height * 0.1 * h);
        }
        ctx.lineTo(width, horizon);
        ctx.closePath();
        ctx.fill();

        // Town lights at the foot of the hills.
        for (const l of town) {
          const x = wrap(l.x - state.far * 2) * width;
          ctx.fillStyle = `rgba(226,178,110,${l.a * exterior})`;
          ctx.beginPath();
          ctx.arc(x, horizon - 4 + l.y * 14, l.r, 0, Math.PI * 2);
          ctx.fill();
        }

        // Fields and houses in the middle distance.
        ctx.fillStyle = `rgba(9,14,14,${exterior})`;
        ctx.fillRect(0, horizon, width, height - horizon);
        for (const h of houses) {
          const x = wrap(h.x - state.mid) * width * 1.2 - width * 0.1;
          const w = h.w * width;
          const hh = h.h * height * 0.6;
          const y = horizon + 12;
          ctx.fillStyle = `rgba(6,9,10,${exterior})`;
          ctx.fillRect(x, y - hh, w, hh);
          ctx.beginPath();
          ctx.moveTo(x - 3, y - hh);
          ctx.lineTo(x + w / 2, y - hh - hh * 0.45);
          ctx.lineTo(x + w + 3, y - hh);
          ctx.fill();
          if (h.lit) {
            ctx.fillStyle = `rgba(236,196,128,${0.55 * exterior})`;
            ctx.fillRect(x + h.litX * (w - 6) + 1, y - hh * 0.6, 4, 5);
          }
        }

        // Catenary poles and sagging wires: the rhythm of a local line.
        const spacing = Math.max(260, width * 0.7);
        const offset = state.near * spacing * 3;
        const wireY = height * 0.12;
        ctx.strokeStyle = `rgba(4,6,8,${0.9 * exterior})`;
        ctx.lineWidth = 1.2;
        for (let i = -1; i < width / spacing + 2; i++) {
          const x = i * spacing - (offset % spacing);
          ctx.fillStyle = `rgba(4,6,8,${0.95 * exterior})`;
          ctx.fillRect(x, wireY - 20, 5, height);
          ctx.fillRect(x - 18, wireY - 10, 40, 3);
          for (const dy of [0, 14]) {
            ctx.beginPath();
            ctx.moveTo(x, wireY + dy);
            ctx.quadraticCurveTo(x + spacing / 2, wireY + dy + 22, x + spacing, wireY + dy);
            ctx.stroke();
          }
        }

        // A lit station slipping past (not stopping).
        if (state.passing > -2) drawPlatform(ctx, width, height, state.passing * width, exterior * 0.9, c === "rain", "", t);

        // Rain outside, seen against the dark.
        if (c === "rain") {
          ctx.strokeStyle = `rgba(190,205,215,${0.12 * exterior})`;
          ctx.lineWidth = 1;
          for (const r of outsideRain) {
            r.y = (r.y + dt * r.v * (reduced ? 0 : 1)) % 1;
            const x = wrap(r.x - state.mid * 2) * width;
            ctx.beginPath();
            ctx.moveTo(x, r.y * height);
            ctx.lineTo(x - 2 - v * 10, r.y * height + 14);
            ctx.stroke();
          }
        }
      }

      // The platform we stop at (it darkens with everything else outside).
      if (state.platformPos > -1.3 && state.platformPos < 1.5) {
        const alpha = 1 - state.still * 0.45;
        drawPlatform(ctx, width, height, state.platformPos * width, alpha, c === "rain", name ?? "", t);
      }

      // Tunnel: the outside is already dark; warm wall lamps pass in rhythm.
      if (state.dark > 0.01) {
        ctx.fillStyle = `rgba(3,4,6,${0.92 * state.dark})`;
        ctx.fillRect(0, 0, width, height);
      }
      if (state.tunnel > 0.01) {
        const spacing = Math.max(240, width * 0.55);
        const offset = state.tunnelOffset * spacing * 4;
        const y = height * 0.3;
        for (let i = -1; i < width / spacing + 2; i++) {
          const x = i * spacing - (offset % spacing);
          const g = ctx.createRadialGradient(x, y, 0, x, y, 140);
          g.addColorStop(0, `rgba(214,150,80,${0.2 * state.tunnel})`);
          g.addColorStop(1, "rgba(214,150,80,0)");
          ctx.fillStyle = g;
          ctx.fillRect(x - 140, y - 140, 280, 280);
          ctx.fillStyle = `rgba(236,180,110,${0.6 * state.tunnel})`;
          ctx.fillRect(x - 8 - v * 22, y, 16 + v * 22, 1.5);
        }
        // Cable runs along the wall.
        ctx.strokeStyle = `rgba(30,32,30,${0.8 * state.tunnel})`;
        for (const yy of [0.58, 0.61]) {
          ctx.beginPath();
          ctx.moveTo(0, height * yy);
          ctx.lineTo(width, height * yy);
          ctx.stroke();
        }
      }

      // Raindrops on the glass slide down, pushed back as the train moves.
      if (c === "rain" && state.still < 0.95) {
        ctx.strokeStyle = `rgba(210,220,225,${0.14 * (1 - state.still)})`;
        ctx.lineWidth = 1;
        for (const d of drops) {
          d.y += d.v * dt * (reduced ? 0 : 3) * (1 - v * 0.4);
          d.x -= dt * v * 0.015;
          if (d.y > 1.05) {
            d.y = -0.05;
            d.x = Math.random();
          }
          if (d.x < -0.05) d.x = 1.05;
          ctx.beginPath();
          ctx.moveTo(d.x * width, d.y * height);
          ctx.lineTo(d.x * width - v * 8, d.y * height + d.len);
          ctx.stroke();
        }
      }

      if (!document.hidden) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const onVisibility = () => {
      if (!document.hidden) {
        last = performance.now();
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(frame);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [reduced]);

  const dim = mode === "tunnel" || mode === "still";
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-night-950" aria-hidden>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      {/* Warm fluorescent light of the carriage, reflected in the glass. */}
      <div
        className="absolute inset-x-0 top-0 h-40 transition-opacity duration-[4000ms]"
        style={{
          opacity: dim ? 0.35 : 1,
          background: "linear-gradient(180deg, rgba(236,214,166,0.10), rgba(236,214,166,0.03) 45%, transparent)",
        }}
      />
      <div className="absolute inset-x-[12%] top-[18%] h-px bg-[rgba(240,222,180,0.08)] blur-[1px]" />
      {/* A soft scrim keeps the centre readable. */}
      <div className="absolute inset-0 bg-[radial-gradient(62%_40%_at_50%_46%,rgba(4,6,10,0.62),transparent_78%)]" />
      {/* Old green seat backs at the bottom of the frame. */}
      <svg className="absolute inset-x-0 bottom-0 h-[13vh] w-full" viewBox="0 0 400 100" preserveAspectRatio="none">
        <defs>
          <linearGradient id="seat" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#2b3a32" />
            <stop offset="1" stopColor="#0c120f" />
          </linearGradient>
        </defs>
        <path d="M-10 100 V38 Q-10 18 14 16 H150 Q176 18 176 40 V100 Z" fill="url(#seat)" opacity="0.85" />
        <path d="M224 100 V40 Q224 18 250 16 H386 Q410 18 410 38 V100 Z" fill="url(#seat)" opacity="0.85" />
        <path d="M14 17 H150" stroke="rgba(236,214,166,0.12)" strokeWidth="1" />
        <path d="M250 17 H386" stroke="rgba(236,214,166,0.12)" strokeWidth="1" />
      </svg>
      {/* Window frame. */}
      <div className="absolute inset-2 rounded-[2rem] border border-white/[0.035] shadow-[inset_0_0_140px_50px_rgba(2,3,6,0.9)] sm:inset-5" />
    </div>
  );
}

/** A small rural platform: roof, warm lamps, a bench, a name board, wet concrete. */
function drawPlatform(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  x0: number,
  alpha: number,
  rain: boolean,
  name: string,
  t: number,
) {
  if (alpha <= 0.01) return;
  const len = width * 1.3;
  const edge = height * 0.66;
  const roof = height * 0.2;
  ctx.save();
  ctx.globalAlpha = alpha;
  // Platform surface and edge line.
  ctx.fillStyle = "#121715";
  ctx.fillRect(x0, edge, len, height - edge);
  ctx.fillStyle = "rgba(200,183,150,0.45)";
  ctx.fillRect(x0, edge, len, 2);
  // Roof and pillars.
  ctx.fillStyle = "#0b0f0e";
  ctx.fillRect(x0, roof - 10, len, 12);
  for (let i = 0; i < 4; i++) {
    const px = x0 + (i + 0.5) * (len / 4);
    ctx.fillRect(px - 3, roof, 6, edge - roof);
    // Fluorescent tube and its pool of light.
    const lx = px + len / 8;
    const glow = ctx.createRadialGradient(lx, roof + 8, 0, lx, roof + 8, 170);
    glow.addColorStop(0, "rgba(240,222,176,0.24)");
    glow.addColorStop(1, "rgba(240,222,176,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(lx - 170, roof - 20, 340, 340);
    ctx.fillStyle = "rgba(246,236,206,0.85)";
    ctx.fillRect(lx - 22, roof + 4, 44, 3);
    const pool = ctx.createLinearGradient(0, edge, 0, height);
    pool.addColorStop(0, "rgba(240,222,176,0.10)");
    pool.addColorStop(1, "rgba(240,222,176,0)");
    ctx.fillStyle = pool;
    ctx.fillRect(lx - 30, edge + 2, 60, height - edge);
  }
  // Bench.
  ctx.fillStyle = "#28332d";
  const bx = x0 + len * 0.36;
  ctx.fillRect(bx, edge - 30, 90, 7);
  ctx.fillRect(bx, edge - 48, 90, 5);
  ctx.fillRect(bx + 6, edge - 23, 4, 23);
  ctx.fillRect(bx + 80, edge - 23, 4, 23);
  // Name board hanging under the roof, out of the way of the text.
  const sx = x0 + len * 0.7;
  const sy = roof + 10;
  ctx.fillStyle = "rgba(226,218,198,0.7)";
  ctx.fillRect(sx, sy, 128, 26);
  ctx.fillStyle = "#2d3d35";
  ctx.fillRect(sx, sy + 20, 128, 6);
  if (name) {
    ctx.fillStyle = "#1a201d";
    ctx.font = "600 10px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText(name.slice(0, 18), sx + 64, sy + 14);
  }
  // Rain falling through the lamp light.
  if (rain) {
    ctx.strokeStyle = "rgba(220,226,230,0.18)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 60; i++) {
      const rx = x0 + ((i * 97.3) % len);
      const ry = roof + (((t / 1000) * 0.9 * (0.6 + (i % 5) * 0.1) * (edge - roof) + i * 53) % (edge - roof));
      ctx.beginPath();
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx - 1.5, ry + 10);
      ctx.stroke();
    }
  }
  ctx.restore();
}
