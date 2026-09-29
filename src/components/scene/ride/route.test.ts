import { describe, expect, it } from "vitest";
import { Route } from "./route";

describe("Route", () => {
  it("is the same line for the same seed", () => {
    const a = new Route(42);
    const b = new Route(42);
    for (let s = 0; s < 30000; s += 777) expect(a.at(s)).toEqual(b.at(s));
  });

  it("changes country often enough that a long ride never feels like a loop", () => {
    const r = new Route(7);
    // A 90-minute leg at line speed covers ~86 km.
    const segs = r.between(0, 86000);
    expect(segs.length).toBeGreaterThan(60);
    expect(new Set(segs.map((s) => s.kind)).size).toBeGreaterThanOrEqual(10);
    for (let i = 1; i < segs.length; i++) expect(segs[i].start).toBeCloseTo(segs[i - 1].end, 6);
  });

  it("different nights run through different country", () => {
    const a = new Route(1).between(0, 20000).map((s) => s.kind).join();
    const b = new Route(2).between(0, 20000).map((s) => s.kind).join();
    expect(a).not.toBe(b);
  });

  it("a stop ahead overrides whatever was there, and tunnels report their full length", () => {
    const r = new Route(3);
    r.override("station", 5000, 5400);
    expect(r.at(5200).kind).toBe("station");
    r.override("tunnel", 9000, 9600);
    const t = r.tunnelNear(9100, 9200)!;
    expect(t[0]).toBeLessThanOrEqual(9000);
    expect(t[1]).toBeGreaterThanOrEqual(9600);
  });
});
