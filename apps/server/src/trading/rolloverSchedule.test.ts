import { describe, expect, it } from "vite-plus/test";
import { getThirdFridayOfMonth, getCmeIndexRollDate, generateRollEvents } from "./rolloverSchedule";

describe("rolloverSchedule", () => {
  it("calculates third Friday of September 2026 correctly", () => {
    // September 2026: Sep 1 is Tuesday. Fridays: Sep 4, Sep 11, Sep 18.
    const thirdFriday = getThirdFridayOfMonth(2026, 8); // month 8 = September
    expect(thirdFriday.getUTCDate()).toBe(18);
    expect(thirdFriday.getUTCDay()).toBe(5); // Friday
  });

  it("calculates CME index roll date 8 days prior to third Friday", () => {
    // 8 days prior to Sep 18, 2026 is Thursday, Sep 10, 2026
    const rollDate = getCmeIndexRollDate(2026, 8);
    expect(rollDate.getUTCDate()).toBe(10);
    expect(rollDate.getUTCDay()).toBe(4); // Thursday
  });

  it("generates chronological rollover events for MNQ", () => {
    const events = generateRollEvents("MNQ", 2025, 2026);
    expect(events.length).toBeGreaterThan(0);
    for (let i = 1; i < events.length; i++) {
      expect(events[i]!.timestamp).toBeGreaterThan(events[i - 1]!.timestamp);
    }
    const u6ToZ6 = events.find((e) => e.fromContract === "MNQU6" && e.toContract === "MNQZ6");
    expect(u6ToZ6).toBeDefined();
    expect(u6ToZ6!.spread).toBeCloseTo(38.5);
    expect(u6ToZ6!.formattedDate).toContain("Sep 10, 2026");
  });

  it("generates rollover events for Gold (MGC)", () => {
    const events = generateRollEvents("MGC", 2025, 2026);
    expect(events.length).toBeGreaterThan(0);
    const goldEvent = events.find((e) => e.root === "MGC");
    expect(goldEvent).toBeDefined();
    expect(goldEvent!.spread).toBeGreaterThan(0);
  });
});
