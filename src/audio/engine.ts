/**
 * Procedural night-train ambience built on the Web Audio API.
 *
 * No audio files: every layer is synthesised from noise and oscillators, so
 * the app stays light and layers can crossfade freely. Layers are grouped on
 * three user-controlled buses:
 *   train        – rail rumble, wheel joints, cabin hum
 *   environment  – rain, wind, distant night, the empty station
 *   focus        – brown noise and tunnel hum
 * Transitions always ramp; nothing starts or stops abruptly.
 *
 * The same AudioContext also carries one-shot effects (see sfx.ts) on a
 * separate `effects` bus that bypasses the ambience master, so a ticket
 * machine can click even while the ambience is off.
 */

export type LayerId = "rail" | "cabin" | "rain" | "wind" | "night" | "station" | "brown" | "tunnelHum";
export type BusId = "train" | "environment" | "focus";
export type PresetId = "quiet-cabin" | "rain-window" | "night-rail" | "tunnel" | "rumble" | "platform" | "platform-rain" | "silence";

const LAYER_BUS: Record<LayerId, BusId> = {
  rail: "train",
  cabin: "train",
  rain: "environment",
  wind: "environment",
  night: "environment",
  station: "environment",
  brown: "focus",
  tunnelHum: "focus",
};

export const PRESETS: Record<PresetId, Partial<Record<LayerId, number>>> = {
  "quiet-cabin": { cabin: 0.55, rail: 0.14, night: 0.08 },
  "rain-window": { rain: 0.6, rail: 0.3, cabin: 0.18 },
  "night-rail": { wind: 0.42, rail: 0.45, night: 0.3, cabin: 0.1 },
  // Entering a tunnel: the rail deepens before the hum takes over.
  rumble: { rail: 0.55, brown: 0.22, tunnelHum: 0.15, cabin: 0.06 },
  tunnel: { rail: 0.28, tunnelHum: 0.5, brown: 0.55, cabin: 0.06 },
  platform: { cabin: 0.22, night: 0.25, rail: 0.03, station: 0.5 },
  "platform-rain": { cabin: 0.2, rain: 0.38, night: 0.12, station: 0.4 },
  silence: {},
};

export const PRESET_LABELS: Record<Exclude<PresetId, "platform" | "platform-rain" | "rumble" | "silence">, { title: string; detail: string }> = {
  "rain-window": { title: "Rain Window", detail: "Rain on glass, quiet rail movement" },
  "night-rail": { title: "Night Rail", detail: "Soft wind, distant track" },
  tunnel: { title: "Tunnel", detail: "Low mechanical hum, brown noise" },
  "quiet-cabin": { title: "Quiet Cabin", detail: "Very subtle interior ambience" },
};

export interface MixLevels {
  master: number;
  train: number;
  environment: number;
  focus: number;
  /** One-shot sound effects; scaled by `master` but not gated by the ambience. */
  effects: number;
}

export const DEFAULT_MIX: MixLevels = { master: 0.7, train: 0.8, environment: 0.8, focus: 0.7, effects: 0.6 };

interface Layer {
  gain: GainNode;
  stop(): void;
}

function noiseBuffer(ctx: AudioContext, kind: "white" | "pink" | "brown", seconds = 8): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      if (kind === "white") data[i] = white * 0.5;
      else if (kind === "pink") {
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.969 * b2 + white * 0.153852;
        b3 = 0.8665 * b3 + white * 0.3104856;
        b4 = 0.55 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.016898;
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
        b6 = white * 0.115926;
      } else {
        last = (last + 0.02 * white) / 1.02;
        data[i] = last * 3.5;
      }
    }
    // Crossfade the loop seam so it never clicks.
    const fade = Math.floor(ctx.sampleRate * 0.25);
    for (let i = 0; i < fade; i++) {
      const t = i / fade;
      data[i] = data[i] * t + data[length - fade + i] * (1 - t);
    }
  }
  return buffer;
}

/** A decaying noise tail: the impulse response of a large, hard-walled hall. */
function hallImpulse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
  }
  return buffer;
}

export class AmbienceEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private effects: GainNode | null = null;
  private buses = new Map<BusId, GainNode>();
  private layers = new Map<LayerId, Layer>();
  private buffers = new Map<string, AudioBuffer>();
  private preset: PresetId = "silence";
  private mix: MixLevels = { ...DEFAULT_MIX };
  private timers: ReturnType<typeof setInterval>[] = [];
  private running = false;
  private starting = false;
  /** Context time until which one-shot effects still need the context awake. */
  private awakeUntil = 0;
  private duckLevel = 1;
  private duckUntil = 0;

  get isRunning() {
    return this.running && this.ctx?.state === "running";
  }

  get currentPreset() {
    return this.preset;
  }

  /** Must be called from a user gesture the first time (autoplay policies). */
  async start(preset: PresetId, fadeSeconds = 3): Promise<boolean> {
    try {
      const ctx = this.ensureContext();
      if (!ctx) return false;
      if (this.layers.size === 0) this.buildLayers();
      this.starting = true;
      try {
        if (ctx.state !== "running") await ctx.resume();
      } finally {
        this.starting = false;
      }
      this.running = ctx.state === "running";
      if (!this.running) return false;
      this.duckUntil = 0;
      this.master!.gain.cancelScheduledValues(ctx.currentTime);
      this.master!.gain.setTargetAtTime(this.mix.master, ctx.currentTime, fadeSeconds / 3);
      this.setPreset(preset, fadeSeconds);
      return true;
    } catch {
      return false;
    }
  }

  /** Fade everything out and let the context rest. */
  stop(fadeSeconds = 2.5) {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    this.running = false;
    this.duckUntil = 0;
    this.master.gain.cancelScheduledValues(ctx.currentTime);
    this.master.gain.setTargetAtTime(0, ctx.currentTime, fadeSeconds / 3);
    setTimeout(() => this.rest(), fadeSeconds * 1000 + 400);
  }

  /**
   * Briefly lower the ambience to `amount` × its level (e.g. while a ticket
   * is lifted from the tray), then bring it back after `seconds`.
   */
  duck(amount: number, seconds: number) {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.running) return;
    this.duckLevel = Math.min(1, Math.max(0, amount));
    this.duckUntil = ctx.currentTime + Math.max(0, seconds);
    this.applyMaster(0.12);
  }

  /**
   * The shared AudioContext, created on first use with the bus graph in
   * place but no ambience playing (master stays at 0). Null when Web Audio
   * is unavailable. It may still be suspended; resume it from a gesture.
   */
  ensureContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      try {
        this.buildCore();
      } catch {
        this.ctx = null;
        this.buses.clear();
      }
    }
    return this.ctx;
  }

  /** Where one-shot effects connect: master × effects, independent of the ambience. */
  effectsBus(): GainNode | null {
    return this.ensureContext() ? this.effects : null;
  }

  /** Keep the context from resting while an effect is still sounding. */
  keepAwake(seconds: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    this.awakeUntil = Math.max(this.awakeUntil, ctx.currentTime + seconds);
    setTimeout(() => this.rest(), seconds * 1000 + 400);
  }

  setPreset(preset: PresetId, fadeSeconds = 4) {
    this.preset = preset;
    const ctx = this.ctx;
    if (!ctx) return;
    const targets = PRESETS[preset];
    for (const [id, layer] of this.layers) {
      const level = targets[id] ?? 0;
      layer.gain.gain.cancelScheduledValues(ctx.currentTime);
      layer.gain.gain.setTargetAtTime(level, ctx.currentTime, Math.max(0.05, fadeSeconds / 3));
    }
  }

  setMix(mix: MixLevels) {
    this.mix = { ...mix };
    const ctx = this.ctx;
    if (!ctx) return;
    for (const bus of ["train", "environment", "focus"] as BusId[]) {
      this.buses.get(bus)?.gain.setTargetAtTime(mix[bus], ctx.currentTime, 0.25);
    }
    this.effects?.gain.setTargetAtTime(mix.master * mix.effects, ctx.currentTime, 0.25);
    if (!this.running) return;
    if (ctx.currentTime < this.duckUntil) this.applyMaster(0.25);
    else this.master?.gain.setTargetAtTime(mix.master, ctx.currentTime, 0.25);
  }

  dispose() {
    this.timers.forEach(clearInterval);
    this.timers = [];
    this.layers.forEach((l) => l.stop());
    this.layers.clear();
    this.buses.clear();
    void this.ctx?.close();
    this.ctx = null;
    this.master = null;
    this.effects = null;
    this.running = false;
  }

  // ---------------------------------------------------------------------------

  /** Context, compressor, master, buses and the effects bus; no layers yet. */
  private buildCore() {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) throw new Error("Web Audio unavailable");
    const ctx = new Ctx();
    this.ctx = ctx;
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.ratio.value = 3;
    compressor.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(compressor);
    for (const bus of ["train", "environment", "focus"] as BusId[]) {
      const g = ctx.createGain();
      g.gain.value = this.mix[bus];
      g.connect(this.master);
      this.buses.set(bus, g);
    }
    this.effects = ctx.createGain();
    this.effects.gain.value = this.mix.master * this.mix.effects;
    this.effects.connect(compressor);
  }

  /** The continuous layers only exist once the ambience is first started. */
  private buildLayers() {
    this.layers.set("rail", this.railLayer());
    this.layers.set("cabin", this.cabinLayer());
    this.layers.set("rain", this.rainLayer());
    this.layers.set("wind", this.windLayer());
    this.layers.set("night", this.nightLayer());
    this.layers.set("station", this.stationLayer());
    this.layers.set("brown", this.brownLayer());
    this.layers.set("tunnelHum", this.tunnelLayer());
  }

  /** Ramp the ambience master to its level, honouring an active duck. */
  private applyMaster(timeConstant: number) {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const now = ctx.currentTime;
    const gain = this.master.gain;
    gain.cancelScheduledValues(now);
    if (now < this.duckUntil) {
      gain.setTargetAtTime(this.mix.master * this.duckLevel, now, timeConstant);
      gain.setTargetAtTime(this.mix.master, this.duckUntil, 0.5);
    } else {
      gain.setTargetAtTime(this.mix.master, now, timeConstant);
    }
  }

  /**
   * Suspend the context once nothing needs it: the ambience is off and no
   * effect is still ringing. Only worth it once layers exist, since those
   * keep running silently; an effects-only context stays awake so later
   * effects don't have to resume it outside a gesture.
   */
  private rest() {
    const ctx = this.ctx;
    if (!ctx || this.running || this.starting || this.layers.size === 0) return;
    if (ctx.state !== "running" || ctx.currentTime < this.awakeUntil) return;
    void ctx.suspend();
  }

  private buffer(kind: "white" | "pink" | "brown"): AudioBuffer {
    let b = this.buffers.get(kind);
    if (!b) {
      b = noiseBuffer(this.ctx!, kind);
      this.buffers.set(kind, b);
    }
    return b;
  }

  private layerOut(id: LayerId): GainNode {
    const g = this.ctx!.createGain();
    g.gain.value = 0;
    g.connect(this.buses.get(LAYER_BUS[id])!);
    return g;
  }

  private loop(kind: "white" | "pink" | "brown", offset = Math.random() * 6): AudioBufferSourceNode {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.buffer(kind);
    src.loop = true;
    src.start(0, offset);
    return src;
  }

  private filter(type: BiquadFilterType, frequency: number, q = 0.7): BiquadFilterNode {
    const f = this.ctx!.createBiquadFilter();
    f.type = type;
    f.frequency.value = frequency;
    f.Q.value = q;
    return f;
  }

  private lfo(target: AudioParam, rate: number, depth: number): OscillatorNode {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.frequency.value = rate;
    const amt = ctx.createGain();
    amt.gain.value = depth;
    osc.connect(amt).connect(target);
    osc.start();
    return osc;
  }

  /** Rumble plus the soft "ta-dum … ta-dum" of rail joints. */
  private railLayer(): Layer {
    const ctx = this.ctx!;
    const out = this.layerOut("rail");
    const rumble = this.loop("brown");
    const low = this.filter("lowpass", 170);
    const rumbleGain = ctx.createGain();
    rumbleGain.gain.value = 0.9;
    rumble.connect(low).connect(rumbleGain).connect(out);
    const sway = this.lfo(rumbleGain.gain, 0.13, 0.18);

    const joints = ctx.createGain();
    joints.gain.value = 0.55;
    joints.connect(out);
    const clickBuffer = this.buffer("white");
    let nextAt = ctx.currentTime + 0.5;
    const period = 1.85;
    const hit = (time: number, strength: number) => {
      const src = ctx.createBufferSource();
      src.buffer = clickBuffer;
      const bp = this.filter("bandpass", 95 + Math.random() * 30, 1.4);
      const tick = this.filter("bandpass", 1400 + Math.random() * 500, 2.2);
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, time);
      env.gain.linearRampToValueAtTime(strength, time + 0.008);
      env.gain.exponentialRampToValueAtTime(0.0001, time + 0.22);
      const tickEnv = ctx.createGain();
      tickEnv.gain.value = 0.12;
      src.connect(bp).connect(env);
      src.connect(tick).connect(tickEnv).connect(env);
      env.connect(joints);
      src.start(time, Math.random() * 4, 0.3);
    };
    const schedule = () => {
      while (nextAt < ctx.currentTime + 0.6) {
        const s = 0.8 + Math.random() * 0.3;
        hit(nextAt, s);
        hit(nextAt + 0.14 + Math.random() * 0.01, s * 0.8);
        nextAt += period + (Math.random() - 0.5) * 0.08;
      }
    };
    const timer = setInterval(schedule, 200);
    this.timers.push(timer);
    return {
      gain: out,
      stop: () => {
        clearInterval(timer);
        rumble.stop();
        sway.stop();
      },
    };
  }

  private cabinLayer(): Layer {
    const ctx = this.ctx!;
    const out = this.layerOut("cabin");
    const air = this.loop("pink");
    const lp = this.filter("lowpass", 380);
    const airGain = ctx.createGain();
    airGain.gain.value = 0.35;
    air.connect(lp).connect(airGain).connect(out);
    const hums = [55, 110.4].map((f, i) => {
      const o = ctx.createOscillator();
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = i === 0 ? 0.035 : 0.012;
      o.connect(g).connect(out);
      o.start();
      return o;
    });
    const drift = this.lfo(airGain.gain, 0.05, 0.08);
    return { gain: out, stop: () => [air, drift, ...hums].forEach((n) => n.stop()) };
  }

  private rainLayer(): Layer {
    const ctx = this.ctx!;
    const out = this.layerOut("rain");
    const wash = this.loop("pink");
    const hp = this.filter("highpass", 850);
    const lp = this.filter("lowpass", 6500);
    const washGain = ctx.createGain();
    washGain.gain.value = 0.5;
    wash.connect(hp).connect(lp).connect(washGain).connect(out);
    const gust = this.lfo(washGain.gain, 0.07, 0.15);

    // Individual drops on the window.
    const drops = ctx.createGain();
    drops.gain.value = 0.35;
    drops.connect(out);
    const white = this.buffer("white");
    const timer = setInterval(() => {
      const now = ctx.currentTime;
      const count = 2 + Math.floor(Math.random() * 4);
      for (let i = 0; i < count; i++) {
        const t = now + Math.random() * 0.2;
        const src = ctx.createBufferSource();
        src.buffer = white;
        const bp = this.filter("bandpass", 2500 + Math.random() * 3500, 6);
        const env = ctx.createGain();
        const peak = 0.2 + Math.random() * 0.5;
        env.gain.setValueAtTime(0, t);
        env.gain.linearRampToValueAtTime(peak, t + 0.003);
        env.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
        const pan = ctx.createStereoPanner();
        pan.pan.value = Math.random() * 2 - 1;
        src.connect(bp).connect(env).connect(pan).connect(drops);
        src.start(t, Math.random() * 7, 0.06);
      }
    }, 200);
    this.timers.push(timer);
    return {
      gain: out,
      stop: () => {
        clearInterval(timer);
        wash.stop();
        gust.stop();
      },
    };
  }

  private windLayer(): Layer {
    const ctx = this.ctx!;
    const out = this.layerOut("wind");
    const src = this.loop("pink");
    const bp = this.filter("bandpass", 480, 0.9);
    const g = ctx.createGain();
    g.gain.value = 0.6;
    src.connect(bp).connect(g).connect(out);
    const sweep = this.lfo(bp.frequency, 0.045, 220);
    const swell = this.lfo(g.gain, 0.03, 0.25);
    return { gain: out, stop: () => [src, sweep, swell].forEach((n) => n.stop()) };
  }

  private nightLayer(): Layer {
    const ctx = this.ctx!;
    const out = this.layerOut("night");
    const far = this.loop("brown");
    const lp = this.filter("lowpass", 90);
    const hiss = this.loop("white");
    const hp = this.filter("highpass", 5000);
    const hissGain = ctx.createGain();
    hissGain.gain.value = 0.04;
    far.connect(lp).connect(out);
    hiss.connect(hp).connect(hissGain).connect(out);
    return { gain: out, stop: () => [far, hiss].forEach((n) => n.stop()) };
  }

  /**
   * A large empty platform at night: low room tone in a long hall, an
   * occasional faint PA hum swelling and fading, and now and then a train
   * passing far away.
   */
  private stationLayer(): Layer {
    const ctx = this.ctx!;
    const out = this.layerOut("station");
    const hall = ctx.createConvolver();
    hall.buffer = hallImpulse(ctx, 3.2, 2.6);
    const wet = ctx.createGain();
    wet.gain.value = 0.6;
    hall.connect(wet).connect(out);

    const air = this.loop("brown");
    const airLp = this.filter("lowpass", 140);
    const airGain = ctx.createGain();
    airGain.gain.value = 0.5;
    air.connect(airLp).connect(airGain).connect(out);
    const breathe = this.lfo(airGain.gain, 0.035, 0.1);
    const room = this.loop("pink");
    const roomBp = this.filter("bandpass", 320, 0.6);
    const roomGain = ctx.createGain();
    roomGain.gain.value = 0.05;
    room.connect(roomBp).connect(roomGain);
    roomGain.connect(out);
    roomGain.connect(hall);

    // Distant PA: mains hum with a faint tone, heard mostly as reflection.
    const paSwell = (t: number) => {
      const hold = 1.5 + Math.random() * 2.5;
      const end = t + 1.8 + hold + 2.5;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(0.022, t + 1.8);
      env.gain.setValueAtTime(0.022, t + 1.8 + hold);
      env.gain.linearRampToValueAtTime(0, end);
      const bp = this.filter("bandpass", 420, 0.7);
      bp.connect(env);
      env.connect(hall);
      const dry = ctx.createGain();
      dry.gain.value = 0.25;
      env.connect(dry).connect(out);
      const partials: [number, number][] = [[100, 0.6], [200, 0.35], [300, 0.15], [Math.random() < 0.5 ? 392 : 440, 0.2]];
      partials.forEach(([f, level], i) => {
        const o = ctx.createOscillator();
        o.frequency.value = f;
        const g = ctx.createGain();
        g.gain.value = level;
        o.connect(g).connect(bp);
        o.start(t);
        o.stop(end + 0.1);
        if (i === 0) o.onended = () => [env, dry, bp].forEach((n) => n.disconnect());
      });
    };

    // A train passing far off: filtered brown noise swelling across ~8s.
    const passTrain = (t: number) => {
      const len = 7 + Math.random() * 2;
      const src = ctx.createBufferSource();
      src.buffer = this.buffer("brown");
      src.loop = true;
      const lp = this.filter("lowpass", 160);
      lp.frequency.setValueAtTime(160, t);
      lp.frequency.linearRampToValueAtTime(480, t + len * 0.5);
      lp.frequency.linearRampToValueAtTime(150, t + len);
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, t);
      env.gain.exponentialRampToValueAtTime(0.4, t + len * 0.5);
      env.gain.exponentialRampToValueAtTime(0.0001, t + len);
      const pan = ctx.createStereoPanner();
      const side = Math.random() < 0.5 ? -1 : 1;
      pan.pan.setValueAtTime(-0.7 * side, t);
      pan.pan.linearRampToValueAtTime(0.7 * side, t + len);
      src.connect(lp).connect(env).connect(pan).connect(out);
      pan.connect(hall);
      src.onended = () => [lp, env, pan].forEach((n) => n.disconnect());
      src.start(t, Math.random() * 4);
      src.stop(t + len + 0.1);
    };

    let nextPa = ctx.currentTime + 20 + Math.random() * 40;
    let nextTrain = ctx.currentTime + 60 + Math.random() * 90;
    const timer = setInterval(() => {
      const now = ctx.currentTime;
      const audible = out.gain.value > 0.001;
      if (now >= nextPa) {
        if (audible) paSwell(now + 0.1);
        nextPa = now + 40 + Math.random() * 50;
      }
      if (now >= nextTrain) {
        if (audible) passTrain(now + 0.1);
        nextTrain = now + 120 + Math.random() * 120;
      }
    }, 1000);
    this.timers.push(timer);
    return {
      gain: out,
      stop: () => {
        clearInterval(timer);
        [air, breathe, room].forEach((n) => n.stop());
      },
    };
  }

  private brownLayer(): Layer {
    const out = this.layerOut("brown");
    const src = this.loop("brown");
    const lp = this.filter("lowpass", 520);
    src.connect(lp).connect(out);
    return { gain: out, stop: () => src.stop() };
  }

  private tunnelLayer(): Layer {
    const ctx = this.ctx!;
    const out = this.layerOut("tunnelHum");
    const saw = ctx.createOscillator();
    saw.type = "sawtooth";
    saw.frequency.value = 46;
    const lp = this.filter("lowpass", 130);
    const sawGain = ctx.createGain();
    sawGain.gain.value = 0.1;
    saw.connect(lp).connect(sawGain).connect(out);
    saw.start();
    const body = this.loop("brown");
    const bp = this.filter("bandpass", 210, 1.2);
    const bodyGain = ctx.createGain();
    bodyGain.gain.value = 0.8;
    body.connect(bp).connect(bodyGain).connect(out);
    const throb = this.lfo(bodyGain.gain, 0.21, 0.2);
    return { gain: out, stop: () => [saw, body, throb].forEach((n) => n.stop()) };
  }
}

let engine: AmbienceEngine | null = null;

export function getAmbience(): AmbienceEngine {
  engine ??= new AmbienceEngine();
  return engine;
}
