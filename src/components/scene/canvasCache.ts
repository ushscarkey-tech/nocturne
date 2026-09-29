/**
 * Painted textures are drawn once per page, not once per scene: the platform
 * the walk crosses is the ride's platform, and coming back to the ride should
 * not repaint the country. Only pure painters go through here (same arguments,
 * same picture); anything drawn into later (signs, the clock) doesn't.
 */
const cache = new Map<string, HTMLCanvasElement>();

export function cached<A extends unknown[]>(name: string, paint: (...args: A) => HTMLCanvasElement) {
  return (...args: A) => {
    const key = `${name}:${JSON.stringify(args)}`;
    let c = cache.get(key);
    if (!c) {
      c = paint(...args);
      cache.set(key, c);
    }
    return c;
  };
}

/** A 2D context that's cheap to read back from (the grain passes read every pixel). */
export function paintContext(c: HTMLCanvasElement) {
  return c.getContext("2d", { willReadFrequently: true })!;
}

/** Fine grain over a whole canvas: a fast xorshift, seeded from the painter's own random. */
export function addGrain(g: CanvasRenderingContext2D, w: number, h: number, amount: number, seed: number) {
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  let s = (Math.floor(seed * 4294967295) ^ 0x9e3779b9) >>> 0 || 1;
  for (let i = 0; i < d.length; i += 4) {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    const n = ((s >>> 0) / 4294967296 - 0.5) * amount;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
}
