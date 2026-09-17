import { describe, expect, it } from "vite-plus/test";
import { isIndicatorVisibleOnTimeframe } from "./indicatorTimeframeVisibility";
import { normalizeIndicatorAppearance } from "./indicatorStyles";
import { sanitizeDrawingVisibility } from "./drawingVisibility";
import type { ChartInterval } from "./tradingIntervals";

describe("indicator timeframe visibility", () => {
  it.each([
    { unit: "tick", value: 100 },
    { unit: "second", value: 5 },
    { unit: "minute", value: 5 },
    { unit: "minute", value: 60 },
    { unit: "day", value: 1 },
    { unit: "week", value: 1 },
    { unit: "month", value: 1 },
  ] as ChartInterval[])("keeps legacy appearances visible on %j", (interval) => {
    expect(isIndicatorVisibleOnTimeframe({}, interval)).toBe(true);
    expect(normalizeIndicatorAppearance("rsi", { color: "#123456" })).not.toHaveProperty(
      "timeframeVisibility",
    );
  });
  it("honors inclusive unit ranges and treats equivalent hour/day intervals consistently", () => {
    const timeframeVisibility = sanitizeDrawingVisibility(undefined);
    timeframeVisibility.minutes = { enabled: true, min: 5, max: 15 };
    timeframeVisibility.hours = { enabled: false, min: 1, max: 24 };
    timeframeVisibility.days = { enabled: false, min: 1, max: 366 };
    timeframeVisibility.ticks = false;
    const appearance = { timeframeVisibility };
    for (const value of [5, 10, 15])
      expect(
        isIndicatorVisibleOnTimeframe(appearance, { unit: "minute", value } as ChartInterval),
      ).toBe(true);
    for (const value of [1, 4, 16, 60, 120, 1440])
      expect(
        isIndicatorVisibleOnTimeframe(appearance, { unit: "minute", value } as ChartInterval),
      ).toBe(false);
    expect(isIndicatorVisibleOnTimeframe(appearance, { unit: "day", value: 1 })).toBe(false);
    expect(isIndicatorVisibleOnTimeframe(appearance, { unit: "tick", value: 100 })).toBe(false);
    expect(isIndicatorVisibleOnTimeframe(appearance, { unit: "second", value: 30 })).toBe(true);
  });
  it("sanitizes and copies nested rules without losing other plot styling", () => {
    const raw = {
      minutes: { enabled: false, min: 50, max: 5 },
      hours: { enabled: true, min: NaN, max: Infinity },
      ticks: "false",
    };
    const saved = normalizeIndicatorAppearance("rsi", {
      timeframeVisibility: raw,
      color: "#123456",
      plots: { main: { lineWidth: 3 } },
    });
    expect(saved.timeframeVisibility?.minutes).toEqual({ enabled: false, min: 5, max: 50 });
    expect(saved.timeframeVisibility?.hours).toEqual({ enabled: true, min: 1, max: 24 });
    expect(saved.timeframeVisibility?.ticks).toBe(true);
    raw.minutes.min = 1;
    expect(saved.timeframeVisibility?.minutes.min).toBe(5);
    expect(saved.color).toBe("#123456");
  });
});
