import { describe, expect, it } from "vitest";
import { board, endJourney } from "@/core/journey";
import * as ops from "@/core/ops";
import { createEmptyData } from "@/core/seed";
import { PROFILE_DEFAULTS, type NocturneData } from "@/core/types";
import { nativeSnapshot } from "../native";

const at = (h: number, m = 0) => new Date(2026, 8, 26, h, m);
const TODAY = "2026-09-26";

function evening(): NocturneData {
  const base = createEmptyData({
    id: "u",
    name: "T",
    timezone: "UTC",
    createdAt: at(8).toISOString(),
    preferredCarriage: "rain",
    autoTunnel: true,
    ...PROFILE_DEFAULTS,
    locale: "ko",
  });
  let d: NocturneData = {
    ...base,
    windows: [{ id: "w", userId: "u", dayOfWeek: null, specificDate: TODAY, startTime: "19:00", endTime: "23:00", recurring: false, enabled: true, kind: "available" }],
  };
  for (const title of ["수학", "영어"]) {
    d = ops.addTask(d, { title, description: "", deadline: TODAY, estimatedMinutes: 50, interest: 3, difficulty: 3, importance: 3, splittable: false, minSessionMinutes: 25, maxSessionMinutes: 60, recurrence: null, lineId: null }, at(18)).data;
  }
  return d;
}

describe("the Mac app's snapshot", () => {
  it("waits for departure with the first station, named in the traveller's language", () => {
    const s = nativeSnapshot(evening(), at(18));
    expect(s.state).toBe("waiting");
    expect(s.next).toMatchObject({ station: "어스름", minutes: 50 });
    expect(new Date(s.next!.at).getTime()).toBe(at(19).getTime());
    expect(s.stops).toHaveLength(2);
    expect(s.remaining).toBe(2);
  });

  it("counts down the station on board, then says the night is done", () => {
    let d = board(evening(), { focus: "steady", carriage: "rain" }, at(19)).data;
    const riding = nativeSnapshot(d, at(19, 20));
    expect(riding.state).toBe("riding");
    expect(riding.current?.remainingSec).toBe(30 * 60);
    expect(new Date(riding.current!.endsAt).getTime()).toBe(at(19, 50).getTime());
    expect(riding.stops[0].current).toBe(true);
    d = endJourney(d, at(19, 30)).data;
    expect(nativeSnapshot(d, at(19, 31)).state).toBe("done");
  });
});
