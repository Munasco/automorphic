import { describe, expect, it } from "vite-plus/test";
import { ChartIntervalError, resolveChartInterval } from "./chartInterval.ts";

describe("chart interval requests", () => {
  it("keeps legacy minute requests distinct from second and tick requests of the same size", () => {
    const minute = resolveChartInterval(10);
    const second = resolveChartInterval(10, "second");
    const tick = resolveChartInterval(10, "tick");
    expect(new Set([minute.intervalKey, second.intervalKey, tick.intervalKey]).size).toBe(3);
    expect(minute.chartDescription).toEqual({
      underlyingType: "MinuteBar",
      elementSize: 10,
      elementSizeUnit: "UnderlyingUnits",
    });
    expect(second.chartDescription).toEqual({
      underlyingType: "Tick",
      elementSize: 10,
      elementSizeUnit: "Seconds",
    });
    expect(tick.chartDescription).toEqual({
      underlyingType: "Tick",
      elementSize: 10,
      elementSizeUnit: "UnderlyingUnits",
    });
  });

  it("validates every supported preset against its own unit", () => {
    for (const value of [1, 2, 3, 5, 10, 15, 30, 45, 60, 120, 180, 240])
      expect(resolveChartInterval(value).interval).toBe(value);
    for (const value of [1, 5, 10, 15, 30, 45])
      expect(resolveChartInterval(value, "second").intervalUnit).toBe("second");
    for (const value of [10, 100, 1000])
      expect(resolveChartInterval(value, "tick").intervalUnit).toBe("tick");
    for (const [value, unit] of [
      [0, "minute"],
      [0.5, "minute"],
      [NaN, "minute"],
      [Infinity, "second"],
      [60, "second"],
      [5, "tick"],
      [1000, "minute"],
      [1, "unknown"],
    ] as const)
      expect(() => resolveChartInterval(value, unit)).toThrow(ChartIntervalError);
  });

  it("rejects 1-tick requests explicitly instead of losing distinct trades with equal timestamps", () => {
    expect(() => resolveChartInterval(1, "tick")).toThrow("trade-ID support");
    expect(resolveChartInterval(1, "second").chartDescription.elementSizeUnit).toBe("Seconds");
    expect(resolveChartInterval(1).chartDescription.underlyingType).toBe("MinuteBar");
  });
});
