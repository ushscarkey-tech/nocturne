"use client";

import { useEffect, useRef } from "react";
import type { CarriageId } from "@/core/types";
import { usePrefersReducedMotion } from "@/lib/hooks";

export type SceneMode = "platform" | "night" | "tunnel" | "still";

/**
 * The view from the window. A lightweight canvas whose speed, darkness and
 * tunnel lighting ease toward the target state, so departures accelerate,
 * arrivals slow to a stop and tunnels close in gradually. Motion explains
 * state; it is never decoration for its own sake.
 */
export function NightScene({ mode, carriage }: { mode: SceneMode; carriage: CarriageId }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const target = useRef({ mode, carriage });
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    target.current = { mode, carriage };
  }, [mode, carriage]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

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

    // Deterministic-ish scenery.
    const rand = (() => {
      let x = 88172645;
      return () => {
        x ^= x << 13;
        x ^= x >>> 17;
        x ^= x << 5;
        return ((x >>> 0) % 10000) / 10000;
      };
    })();
    const far = Array.from({ length: 70 }, () => ({ x: rand(), y: 0.7 + rand() * 0.1, r: 0.6 + rand() * 1.1, a: 0.25 + rand() * 0.5, warm: rand() > 0.35 }));
    const mid = Array.from({ length: 26 }, () => ({ x: rand(), y: 0.76 + rand() * 0.1, r: 1 + rand() * 1.6, a: 0.35 + rand() * 0.5 }));
    const stars = Array.from({ length: 60 }, () => ({ x: rand(), y: rand() * 0.42, a: 0.15 + rand() * 0.5 }));
    const drops = Array.from({ length: 55 }, () => ({ x: rand(), y: rand(), len: 6 + rand() * 18, v: 0.02 + rand() * 0.05 }));

    const initial = target.current.mode;
    const state = {
      speed: initial === "night" ? 1 : initial === "tunnel" ? 1.2 : 0,
      tunnel: initial === "tunnel" ? 1 : 0,
      platform: initial === "platform" ? 1 : 0,
      dim: initial === "still" ? 1 : 0,
      offsetFar: 0,
      offsetMid: 0,
      offsetTunnel: 0,
      pole: 0,
    };

    let raf = 0;
    let last = performance.now();
    const frame = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      const { mode: m, carriage: c } = target.current;
      const goal = {
        speed: reduced ? 0 : m === "night" ? 1 : m === "tunnel" ? 1.25 : 0,
        tunnel: m === "tunnel" ? 1 : 0,
        platform: m === "platform" ? 1 : 0,
        dim: m === "still" ? 1 : 0,
      };
      // Slow, physical easing: trains don't jump to speed.
      const ease = (cur: number, to: number, rate: number) => cur + (to - cur) * (1 - Math.exp(-rate * dt));
      state.speed = ease(state.speed, goal.speed, goal.speed > state.speed ? 0.35 : 0.55);
      state.tunnel = ease(state.tunnel, goal.tunnel, 0.45);
      state.platform = ease(state.platform, goal.platform, 0.6);
      state.dim = ease(state.dim, goal.dim, 0.4);
      state.offsetFar = (state.offsetFar + dt * state.speed * 0.012) % 1;
      state.offsetMid = (state.offsetMid + dt * state.speed * 0.05) % 1;
      state.offsetTunnel = (state.offsetTunnel + dt * state.speed * 0.9) % 1;
      state.pole = (state.pole + dt * state.speed * 0.32) % 1;

      ctx.clearRect(0, 0, width, height);
      const exterior = (1 - state.tunnel) * (1 - state.dim * 0.7);

      // Sky and stars (moon car gets a soft moon).
      if (exterior > 0.01) {
        for (const s of stars) {
          ctx.fillStyle = `rgba(220,226,240,${s.a * exterior * 0.6})`;
          ctx.fillRect(s.x * width, s.y * height, 1, 1);
        }
        if (c === "moon") {
          const mx = width * 0.78;
          const my = height * 0.2;
          const g = ctx.createRadialGradient(mx, my, 0, mx, my, 90);
          g.addColorStop(0, `rgba(236,228,212,${0.5 * exterior})`);
          g.addColorStop(0.12, `rgba(236,228,212,${0.25 * exterior})`);
          g.addColorStop(1, "rgba(236,228,212,0)");
          ctx.fillStyle = g;
          ctx.fillRect(mx - 90, my - 90, 180, 180);
        }
        // Horizon haze.
        const hz = ctx.createLinearGradient(0, height * 0.6, 0, height * 0.9);
        hz.addColorStop(0, "rgba(40,52,84,0)");
        hz.addColorStop(0.5, `rgba(40,52,84,${0.35 * exterior})`);
        hz.addColorStop(1, "rgba(40,52,84,0)");
        ctx.fillStyle = hz;
        ctx.fillRect(0, height * 0.6, width, height * 0.3);

        // Distant town lights drift; nearer lights move faster (parallax).
        for (const l of far) {
          const x = ((l.x - state.offsetFar + 1) % 1) * width;
          ctx.fillStyle = l.warm ? `rgba(232,184,110,${l.a * exterior})` : `rgba(190,205,235,${l.a * exterior * 0.8})`;
          ctx.beginPath();
          ctx.arc(x, l.y * height, l.r, 0, Math.PI * 2);
          ctx.fill();
        }
        const blur = Math.min(1, state.speed);
        for (const l of mid) {
          const x = ((l.x - state.offsetMid + 1) % 1) * width;
          const streak = 1 + blur * 14;
          ctx.fillStyle = `rgba(236,210,160,${l.a * exterior * 0.8})`;
          ctx.fillRect(x, l.y * height, l.r + streak, l.r);
        }
        // A trackside lamp sweeping past now and then.
        if (state.speed > 0.2) {
          const px = (1 - state.pole) * width * 1.6 - width * 0.3;
          const g = ctx.createLinearGradient(px - 40, 0, px + 40, 0);
          g.addColorStop(0, "rgba(236,200,140,0)");
          g.addColorStop(0.5, `rgba(236,200,140,${0.08 * exterior * state.speed})`);
          g.addColorStop(1, "rgba(236,200,140,0)");
          ctx.fillStyle = g;
          ctx.fillRect(px - 40, 0, 80, height);
        }
      }

      // Tunnel: walls close in, lamps pass at a steady rhythm.
      if (state.tunnel > 0.01) {
        ctx.fillStyle = `rgba(4,6,11,${0.85 * state.tunnel})`;
        ctx.fillRect(0, 0, width, height);
        const spacing = Math.max(220, width * 0.45);
        const count = Math.ceil(width / spacing) + 2;
        for (let i = 0; i < count; i++) {
          const x = ((i * spacing - state.offsetTunnel * spacing * 4) % (count * spacing) + count * spacing) % (count * spacing) - spacing;
          const y = height * 0.34;
          const g = ctx.createRadialGradient(x, y, 0, x, y, 120);
          g.addColorStop(0, `rgba(224,176,104,${0.22 * state.tunnel})`);
          g.addColorStop(1, "rgba(224,176,104,0)");
          ctx.fillStyle = g;
          ctx.fillRect(x - 120, y - 120, 240, 240);
          ctx.fillStyle = `rgba(240,200,140,${0.55 * state.tunnel})`;
          ctx.fillRect(x - 10 - state.speed * 16, y, 20 + state.speed * 16, 1.5);
        }
      }

      // Platform: still lamps and the edge of the platform.
      if (state.platform > 0.01) {
        const edge = height * 0.72;
        ctx.fillStyle = `rgba(28,36,56,${0.8 * state.platform})`;
        ctx.fillRect(0, edge, width, height - edge);
        ctx.fillStyle = `rgba(224,176,104,${0.35 * state.platform})`;
        ctx.fillRect(0, edge, width, 1);
        for (let i = 0; i < 3; i++) {
          const x = width * (0.2 + i * 0.3);
          const g = ctx.createRadialGradient(x, edge - 120, 0, x, edge - 120, 180);
          g.addColorStop(0, `rgba(236,210,160,${0.18 * state.platform})`);
          g.addColorStop(1, "rgba(236,210,160,0)");
          ctx.fillStyle = g;
          ctx.fillRect(x - 180, edge - 300, 360, 360);
        }
      }

      // Rain on the glass slides down regardless of speed, pushed back as we move.
      if (c === "rain" && state.dim < 0.95) {
        ctx.strokeStyle = `rgba(200,212,235,${0.16 * (1 - state.dim)})`;
        ctx.lineWidth = 1;
        for (const d of drops) {
          d.y += d.v * dt * (reduced ? 0 : 4);
          d.x -= dt * state.speed * 0.02;
          if (d.y > 1.05) {
            d.y = -0.05;
            d.x = Math.random();
          }
          if (d.x < -0.05) d.x = 1.05;
          const x = d.x * width;
          const y = d.y * height;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x - state.speed * 6, y + d.len);
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

  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
      <div
        className="absolute inset-0 transition-opacity duration-[3000ms]"
        style={{
          background:
            "radial-gradient(140% 90% at 50% 0%, #17213a 0%, #0b1122 45%, #05080f 100%)",
          opacity: mode === "tunnel" || mode === "still" ? 0.55 : 1,
        }}
      />
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      {/* A soft scrim keeps the centre readable over passing lights. */}
      <div className="absolute inset-0 bg-[radial-gradient(60%_42%_at_50%_48%,rgba(5,8,15,0.6),transparent_75%)]" />
      {/* Window frame and cabin reflection. */}
      <div className="absolute inset-3 rounded-[2.25rem] border border-white/[0.04] shadow-[inset_0_0_120px_40px_rgba(3,5,10,0.85)] sm:inset-6" />
      <div className="absolute inset-0 bg-[linear-gradient(115deg,rgba(255,255,255,0.025)_0%,transparent_35%,transparent_70%,rgba(255,255,255,0.015)_100%)]" />
    </div>
  );
}
