import { describe, expect, it } from "vite-plus/test";
import {
  CHART_INTERVALS,
  chartIntervalFromKey,
  chartIntervalKey,
  chartIntervalMinutes,
  chartIntervalQuery,
  formatChartInterval,
  normalizeChartInterval,
} from "./tradingIntervals";
describe("typed chart intervals", () => {
  it("keeps same-sized different units distinct in labels, queries and keys", () => {
    for (const interval of CHART_INTERVALS) {
      expect(chartIntervalFromKey(chartIntervalKey(interval))).toEqual(interval);
      expect(chartIntervalQuery(interval)).toEqual({
        interval: String(interval.value),
        intervalUnit: interval.unit,
      });
    }
    expect(new Set(CHART_INTERVALS.map(chartIntervalKey)).size).toBe(CHART_INTERVALS.length);
    expect(formatChartInterval({ unit: "second", value: 5 })).toBe("5s");
    expect(formatChartInterval({ unit: "minute", value: 5 })).toBe("5m");
    expect(formatChartInterval({ unit: "minute", value: 240 })).toBe("4h");
    expect(formatChartInterval({ unit: "tick", value: 1000 })).toBe("1000T");
    expect(formatChartInterval({ unit: "day", value: 3 })).toBe("3D");
    expect(formatChartInterval({ unit: "week", value: 1 })).toBe("1W");
    expect(formatChartInterval({ unit: "month", value: 12 })).toBe("12M");
  });
  it("converts fixed durations without assigning a fake duration to tick bars", () => {
    expect(chartIntervalMinutes({ unit: "second", value: 1 })).toBe(1 / 60);
    expect(chartIntervalMinutes({ unit: "tick", value: 10 })).toBeNull();
    expect(chartIntervalMinutes({ unit: "month", value: 1 })).toBeNull();
    expect(chartIntervalMinutes({ unit: "day", value: 1 })).toBe(1440);
    expect(chartIntervalMinutes({ unit: "week", value: 1 })).toBe(10080);
    expect(normalizeChartInterval(5)).toEqual({ unit: "minute", value: 5 });
    for (const invalid of [
      null,
      {},
      0.5,
      "second:5",
      { unit: "tick", value: 1 },
      { unit: "tick", value: 10 },
      { unit: "tick", value: 100 },
      { unit: "tick", value: 1000 },
      { unit: "second", value: 2 },
      { unit: "minute", value: "5" },
    ])
      expect(normalizeChartInterval(invalid)).toBeUndefined();
  });
});
