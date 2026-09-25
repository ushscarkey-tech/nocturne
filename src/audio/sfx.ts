/**
 * Procedural one-shot sound effects: the ticket machine, doors, chimes.
 *
 * Like the ambience, nothing here is a recording; each effect is a few
 * envelopes over filtered noise and soft sine partials. Everything is meant
 * to sit quietly under the night: short, dull, analog, never a game beep.
 *
 * Effects share the ambience's AudioContext but play on their own `effects`
 * bus (master × effects), so they work even while the ambience is off.
 */

import { getAmbience } from "./engine";
import { loadMix } from "./useAmbience";

export type SfxName =
  | "click"
  | "key"
  | "print"
  | "printLong"
  | "paper"
  | "chime"
  | "departure"
  | "doorLock"
  | "doors"
  | "brake"
  | "arrival"
  | "flip"
  | "stamp";

const WANTED_KEY = "nocturne:sound";

/** False only when the traveller explicitly turned sound off. */
export function soundAllowed(): boolean {
  try {
    return window.localStorage.getItem(WANTED_KEY) !== "off";
  } catch {
    return true;
  }
}

// ---------------------------------------------------------------------------
// Building blocks

/** Everything one effect creates, so it can be disconnected once it's done. */
interface Kit {
  ctx: AudioContext;
  out: GainNode;
  white: AudioBuffer;
  brown: AudioBuffer;
  nodes: AudioNode[];
}

const buffers = new WeakMap<AudioContext, { white: AudioBuffer; brown: AudioBuffer }>();

/** Two seconds each of white and brown noise, rendered once per context. */
function noiseBuffers(ctx: AudioContext) {
  let b = buffers.get(ctx);
  if (!b) {
    const length = Math.floor(ctx.sampleRate * 2);
    const white = ctx.createBuffer(1, length, ctx.sampleRate);
    const brown = ctx.createBuffer(1, length, ctx.sampleRate);
    const w = white.getChannelData(0);
    const br = brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i++) {
      const x = Math.random() * 2 - 1;
      w[i] = x;
      last = (last + 0.02 * x) / 1.02;
      br[i] = last * 3.5;
    }
    // Crossfade the loop seam so looping sources never click.
    const fade = Math.floor(ctx.sampleRate * 0.05);
    for (const data of [w, br]) {
      for (let i = 0; i < fade; i++) {
        const t = i / fade;
        data[i] = data[i] * t + data[length - fade + i] * (1 - t);
      }
    }
    b = { white, brown };
    buffers.set(ctx, b);
  }
  return b;
}

function track<T extends AudioNode>(k: Kit, node: T): T {
  k.nodes.push(node);
  return node;
}

function gain(k: Kit, value = 1): GainNode {
  const g = track(k, k.ctx.createGain());
  g.gain.value = value;
  return g;
}

function filter(k: Kit, type: BiquadFilterType, frequency: number, q = 0.7): BiquadFilterNode {
  const f = track(k, k.ctx.createBiquadFilter());
  f.type = type;
  f.frequency.value = frequency;
  f.Q.value = q;
  return f;
}

/** Fast linear attack, exponential fall to silence. */
function envelope(k: Kit, t: number, attack: number, peak: number, decay: number): GainNode {
  const g = gain(k, 0);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  return g;
}

function noise(k: Kit, t: number, seconds: number, kind: "white" | "brown" = "white"): AudioBufferSourceNode {
  const src = track(k, k.ctx.createBufferSource());
  src.buffer = kind === "white" ? k.white : k.brown;
  src.loop = true;
  src.start(t, Math.random() * src.buffer.duration);
  src.stop(t + seconds);
  return src;
}

interface BurstOptions {
  type?: BiquadFilterType;
  freq: number;
  q?: number;
  peak: number;
  attack?: number;
  decay: number;
  dest?: AudioNode;
}

/** A filtered noise burst: the grain of clicks, snips and thumps. */
function burst(k: Kit, t: number, o: BurstOptions) {
  const attack = o.attack ?? 0.001;
  const f = filter(k, o.type ?? "bandpass", o.freq, o.q ?? 1);
  const env = envelope(k, t, attack, o.peak, o.decay);
  noise(k, t, attack + o.decay + 0.02).connect(f).connect(env).connect(o.dest ?? k.out);
}

interface ToneOptions {
  freq: number;
  /** Glide to this pitch over `glide` seconds (defaults to the whole note). */
  to?: number;
  glide?: number;
  type?: OscillatorType;
  peak: number;
  attack?: number;
  decay: number;
  dest?: AudioNode;
}

/** One enveloped partial. */
function tone(k: Kit, t: number, o: ToneOptions) {
  const attack = o.attack ?? 0.005;
  const osc = track(k, k.ctx.createOscillator());
  osc.type = o.type ?? "sine";
  osc.frequency.setValueAtTime(o.freq, t);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + (o.glide ?? attack + o.decay));
  osc.connect(envelope(k, t, attack, o.peak, o.decay)).connect(o.dest ?? k.out);
  osc.start(t);
  osc.stop(t + attack + o.decay + 0.05);
}

/** Dry signal plus a soft, darkening feedback echo: a hint of a room. */
function echo(k: Kit, delay: number, feedback: number, wet: number, darken = 2200): GainNode {
  const input = gain(k);
  input.connect(k.out);
  const d = track(k, k.ctx.createDelay(1));
  d.delayTime.value = delay;
  const lp = filter(k, "lowpass", darken);
  input.connect(d).connect(lp).connect(gain(k, feedback)).connect(d);
  lp.connect(gain(k, wet)).connect(k.out);
  return input;
}

/** A little variation so repeated presses never sound identical. */
function jitter(value: number, amount: number) {
  return value * (1 + (Math.random() * 2 - 1) * amount);
}

// ---------------------------------------------------------------------------
// The effects. Each schedules itself at `t` and returns its length in seconds.

/** Thermal ticket printer: fine ticking over a motor hum, then the cutter. */
function printer(k: Kit, t: number, length: number, rate: number): number {
  const { ctx } = k;
  const run = length - 0.15;

  // Motor and paper feed, ramping in and out together.
  const hum = gain(k, 0);
  hum.gain.setValueAtTime(0, t);
  hum.gain.linearRampToValueAtTime(1, t + 0.12);
  hum.gain.setValueAtTime(1, t + run - 0.15);
  hum.gain.linearRampToValueAtTime(0, t + run);
  hum.connect(k.out);
  const motor = track(k, ctx.createOscillator());
  motor.type = "triangle";
  motor.frequency.setValueAtTime(82, t);
  motor.frequency.linearRampToValueAtTime(94, t + 0.15);
  motor.connect(filter(k, "lowpass", 280)).connect(gain(k, 0.05)).connect(hum);
  motor.start(t);
  motor.stop(t + run + 0.05);
  noise(k, t, run + 0.05, "brown").connect(filter(k, "bandpass", 180, 1)).connect(gain(k, 0.25)).connect(hum);
  noise(k, t, run + 0.05).connect(filter(k, "highpass", 3200)).connect(gain(k, 0.012)).connect(hum);

  // The head: one noise source, gated into tiny ticks with a line accent.
  const ticks = gain(k, 0);
  noise(k, t, run + 0.05).connect(filter(k, "bandpass", 4200, 2.5)).connect(ticks).connect(k.out);
  let i = 0;
  for (let at = t + 0.08; at < t + run - 0.1; at += 1 / rate, i++) {
    const peak = (i % 4 === 0 ? 0.5 : 0.3) * (0.8 + Math.random() * 0.4);
    ticks.gain.setValueAtTime(0, at);
    ticks.gain.linearRampToValueAtTime(peak, at + 0.0008);
    ticks.gain.setTargetAtTime(0, at + 0.0008, 0.0025);
  }

  // Cutter snip.
  const cut = t + run + 0.03;
  burst(k, cut, { freq: 5200, q: 2, peak: 0.35, decay: 0.012 });
  burst(k, cut + 0.018, { freq: 3000, q: 1.5, peak: 0.4, decay: 0.025 });
  tone(k, cut + 0.018, { freq: 190, to: 140, peak: 0.08, attack: 0.002, decay: 0.04 });
  return cut + 0.1 - t;
}

const DESIGNS: Record<SfxName, (k: Kit, t: number) => number> = {
  /** A tiny mechanical switch. */
  click(k, t) {
    burst(k, t, { freq: jitter(3200, 0.08), q: 0.9, peak: 0.35, decay: 0.015 });
    burst(k, t, { type: "lowpass", freq: 420, peak: 0.8, decay: 0.03 });
    tone(k, t, { freq: 140, to: 90, peak: 0.2, attack: 0.002, decay: 0.05 });
    return 0.1;
  },

  /** A machine keypad button: lighter than a click. */
  key(k, t) {
    burst(k, t, { freq: jitter(2300, 0.1), q: 1.2, peak: 0.16, decay: 0.01 });
    burst(k, t, { type: "lowpass", freq: 600, peak: 0.35, decay: 0.02 });
    tone(k, t, { freq: jitter(220, 0.05), to: 160, peak: 0.08, attack: 0.002, decay: 0.035 });
    return 0.08;
  },

  print: (k, t) => printer(k, t, 1.1, 32),
  printLong: (k, t) => printer(k, t, 2.4, 36),

  /** Paper sliding across a counter, fibres catching as it goes. */
  paper(k, t) {
    const len = jitter(0.35, 0.1);
    const bp = filter(k, "bandpass", 2600, 0.8);
    bp.frequency.setValueAtTime(2600, t);
    bp.frequency.linearRampToValueAtTime(4000, t + len);
    const env = gain(k, 0);
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.3, t + len * 0.35);
    env.gain.linearRampToValueAtTime(0.22, t + len * 0.7);
    env.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.03);
    const grain = gain(k, 0.6);
    noise(k, t, len + 0.05).connect(filter(k, "lowpass", 90)).connect(gain(k, 8)).connect(grain.gain);
    noise(k, t, len + 0.05).connect(bp).connect(filter(k, "highpass", 1200)).connect(grain).connect(env).connect(k.out);
    return len + 0.1;
  },

  /** A quiet ticket-gate confirmation: E5 then A5. */
  chime(k, t) {
    const soft = filter(k, "lowpass", 3200);
    soft.connect(k.out);
    for (const [f, at] of [[659.25, 0], [880, 0.16]]) {
      tone(k, t + at, { freq: f, peak: 0.1, attack: 0.008, decay: 1.2, dest: soft });
      tone(k, t + at, { freq: f * 2, peak: 0.018, attack: 0.008, decay: 0.45, dest: soft });
    }
    return 1.45;
  },

  /** A platform departure melody, heard from along the platform. */
  departure(k, t) {
    const room = echo(k, 0.28, 0.3, 0.28, 1800);
    const soft = filter(k, "lowpass", 2400);
    soft.connect(room);
    const notes: [number, number, number][] = [
      [587.33, 0, 0.9],
      [739.99, 0.42, 0.9],
      [659.25, 0.84, 0.9],
      [880, 1.3, 1.3],
    ];
    for (const [f, at, decay] of notes) {
      tone(k, t + at, { freq: f, peak: 0.08, attack: 0.025, decay, dest: soft });
      tone(k, t + at, { freq: f, type: "triangle", peak: 0.03, attack: 0.03, decay: decay * 0.6, dest: soft });
    }
    return 3.8;
  },

  /** Pneumatic door closing: a swell of air, then a soft dull lock. */
  doorLock(k, t) {
    const bp = filter(k, "bandpass", 2000, 0.7);
    bp.frequency.setValueAtTime(2000, t);
    bp.frequency.linearRampToValueAtTime(3400, t + 0.3);
    const env = gain(k, 0);
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.3, t + 0.25);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
    noise(k, t, 0.45).connect(bp).connect(filter(k, "highpass", 1200)).connect(env).connect(k.out);
    const thud = t + 0.34;
    tone(k, thud, { freq: 78, to: 50, peak: 0.3, attack: 0.004, decay: 0.18 });
    burst(k, thud, { type: "lowpass", freq: 260, peak: 0.8, attack: 0.002, decay: 0.08 });
    burst(k, thud + 0.05, { freq: 1800, q: 1.5, peak: 0.1, decay: 0.015 });
    return 0.65;
  },

  /** Doors sliding open: an airy hiss with a low rumble underneath. */
  doors(k, t) {
    const len = 0.9;
    const bp = filter(k, "bandpass", 1800, 0.6);
    bp.frequency.setValueAtTime(1800, t);
    bp.frequency.linearRampToValueAtTime(1100, t + len);
    const hiss = gain(k, 0);
    hiss.gain.setValueAtTime(0, t);
    hiss.gain.linearRampToValueAtTime(0.28, t + 0.06);
    hiss.gain.linearRampToValueAtTime(0.14, t + 0.6);
    hiss.gain.exponentialRampToValueAtTime(0.0001, t + len);
    noise(k, t, len + 0.05).connect(bp).connect(hiss).connect(k.out);
    const rumble = gain(k, 0.0001);
    rumble.gain.setValueAtTime(0.0001, t);
    rumble.gain.exponentialRampToValueAtTime(0.5, t + 0.15);
    rumble.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.25);
    noise(k, t, len + 0.3, "brown").connect(filter(k, "lowpass", 160)).connect(rumble).connect(k.out);
    tone(k, t + len - 0.08, { freq: 70, to: 55, peak: 0.1, attack: 0.01, decay: 0.2 });
    return len + 0.35;
  },

  /** Braking into a station: falling rumble, slowing joints, a faint squeal. */
  brake(k, t) {
    const { ctx } = k;
    const len = 3;
    const lp = filter(k, "lowpass", 320);
    lp.frequency.setValueAtTime(320, t);
    lp.frequency.exponentialRampToValueAtTime(90, t + len);
    const body = gain(k, 0.0001);
    body.gain.setValueAtTime(0.0001, t);
    body.gain.exponentialRampToValueAtTime(0.55, t + 0.25);
    body.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.2);
    noise(k, t, len + 0.25, "brown").connect(lp).connect(body).connect(k.out);

    // Rail joints, spacing out as the train slows.
    for (let at = 0.15, gap = 0.32; at < len - 0.6; at += gap, gap *= 1.35) {
      const peak = 1.5 * (1 - at / len);
      burst(k, t + at, { freq: 110, q: 1.4, peak, attack: 0.006, decay: 0.18 });
      burst(k, t + at + 0.13, { freq: 105, q: 1.4, peak: peak * 0.8, attack: 0.006, decay: 0.18 });
    }

    // The squeal: a thin, filtered glide far below the rumble.
    const s = t + 0.5;
    const squeal = track(k, ctx.createOscillator());
    squeal.frequency.setValueAtTime(1900, s);
    squeal.frequency.linearRampToValueAtTime(1500, s + 2.1);
    const vibrato = track(k, ctx.createOscillator());
    vibrato.frequency.value = 5.5;
    vibrato.connect(gain(k, 7)).connect(squeal.frequency);
    const sqEnv = gain(k, 0);
    sqEnv.gain.setValueAtTime(0, s);
    sqEnv.gain.linearRampToValueAtTime(0.012, s + 0.9);
    sqEnv.gain.linearRampToValueAtTime(0.008, s + 1.7);
    sqEnv.gain.linearRampToValueAtTime(0, s + 2.25);
    squeal.connect(filter(k, "bandpass", 1700, 3)).connect(sqEnv).connect(k.out);
    squeal.start(s);
    vibrato.start(s);
    squeal.stop(s + 2.3);
    vibrato.stop(s + 2.3);

    // Air let out as it settles.
    burst(k, t + len - 0.2, { type: "highpass", freq: 2200, peak: 0.12, attack: 0.06, decay: 0.45 });
    return len + 0.4;
  },

  /** A platform-speaker chime: two descending notes through a small PA. */
  arrival(k, t) {
    const pa = echo(k, 0.19, 0.35, 0.3, 2600);
    const hp = filter(k, "highpass", 300);
    hp.connect(filter(k, "lowpass", 3000)).connect(pa);
    for (const [f, at] of [[659.25, 0], [523.25, 0.55]]) {
      tone(k, t + at, { freq: f, peak: 0.1, attack: 0.01, decay: 1.1, dest: hp });
      tone(k, t + at, { freq: f * 2, peak: 0.025, attack: 0.01, decay: 0.6, dest: hp });
      tone(k, t + at, { freq: f * 3, peak: 0.012, attack: 0.01, decay: 0.35, dest: hp });
    }
    return 2.7;
  },

  /** One split-flap card falling. */
  flip(k, t) {
    burst(k, t, { freq: jitter(2800, 0.1), q: 2, peak: 0.22, decay: 0.008 });
    burst(k, t + 0.007, { freq: jitter(1800, 0.1), q: 1.6, peak: 0.14, decay: 0.012 });
    burst(k, t, { type: "lowpass", freq: 700, peak: 0.25, decay: 0.015 });
    return 0.05;
  },

  /** A soft rubber stamp, or a gate punching a ticket. */
  stamp(k, t) {
    tone(k, t, { freq: 95, to: 55, glide: 0.08, peak: 0.35, attack: 0.003, decay: 0.12 });
    burst(k, t, { type: "lowpass", freq: 320, peak: 0.9, attack: 0.002, decay: 0.06 });
    burst(k, t + 0.004, { freq: 2600, q: 1.5, peak: 0.07, decay: 0.01 });
    return 0.2;
  },
};

/** Disconnect an effect's nodes once the context has played past its end. */
function reap(k: Kit, end: number, tries = 0) {
  if (k.ctx.state !== "closed" && k.ctx.currentTime < end && tries < 20) {
    setTimeout(() => reap(k, end, tries + 1), 500);
    return;
  }
  k.nodes.forEach((n) => n.disconnect());
}

export const sfx = {
  /** Play one effect. Safe anywhere: a silent no-op without audio or with sound off. */
  play(name: SfxName, opts?: { volume?: number }): void {
    if (typeof window === "undefined" || !soundAllowed()) return;
    const volume = Math.min(2, Math.max(0, opts?.volume ?? 1));
    if (volume === 0) return;
    try {
      loadMix();
      const engine = getAmbience();
      const ctx = engine.ensureContext();
      const bus = engine.effectsBus();
      if (!ctx || !bus) return;
      if (ctx.state === "suspended") ctx.resume().catch(() => undefined);
      const out = ctx.createGain();
      out.gain.value = volume;
      out.connect(bus);
      const k: Kit = { ctx, out, ...noiseBuffers(ctx), nodes: [out] };
      const t = ctx.currentTime + 0.01;
      const length = DESIGNS[name](k, t);
      engine.keepAwake(length + 0.2);
      setTimeout(() => reap(k, t + length), (length + 0.3) * 1000);
    } catch {
      /* audio unavailable */
    }
  },

  /** Create or resume the shared AudioContext. Call from a user gesture. */
  async unlock(): Promise<void> {
    if (typeof window === "undefined" || !soundAllowed()) return;
    try {
      loadMix();
      const ctx = getAmbience().ensureContext();
      if (!ctx) return;
      // A silent sample started inside the gesture also unlocks older WebKit.
      const src = ctx.createBufferSource();
      src.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      src.connect(ctx.destination);
      src.start();
      if (ctx.state !== "running") await ctx.resume();
    } catch {
      /* audio unavailable */
    }
  },
};
