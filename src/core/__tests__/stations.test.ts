import { describe, expect, it } from "vitest";
import { stationLabel, stationName } from "../stations";

describe("station names", () => {
  it("reads every generated name as a Korean word in Korean", () => {
    const names = new Set<string>();
    for (let d = 1; d <= 28; d++) {
      const date = `2026-09-${String(d).padStart(2, "0")}`;
      for (let i = 0; i < 8; i++) names.add(stationName(date, i, 8));
    }
    for (const n of names) expect(stationLabel(n, "ko")).toMatch(/^[가-힣]+$/);
  });

  it("keeps the first and last stops fixed", () => {
    expect(stationLabel(stationName("2026-09-26", 0, 4), "ko")).toBe("땅거미");
    expect(stationLabel(stationName("2026-09-26", 3, 4), "ko")).toBe("한밤");
  });

  it("leaves other languages and unknown names as they are", () => {
    expect(stationLabel("WILLOW", "en")).toBe("WILLOW");
    expect(stationLabel("WILLOW", "ja")).toBe("WILLOW");
    expect(stationLabel("PLATFORM 05", "ko")).toBe("PLATFORM 05");
  });
});
