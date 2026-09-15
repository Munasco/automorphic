import { describe, expect, it } from "vite-plus/test";
import { barCountdown } from "./barCountdown";
import type { Candle } from "./chartIndicators";
import { CHART_INTERVALS, type ChartInterval } from "./tradingIntervals";

const bar: Candle = { time: 1_800_000_000, open: 100, high: 102, low: 99, close: 101, volume: 10 };
const start = bar.time * 1000;
const active = { enabled: true, live: true, replay: false };
const fiveMinutes = { unit: "minute", value: 5 } as const;

describe("bar close countdown", () => {
  it("counts to the actual bar boundary and rounds partial remaining seconds up", () => {
    expect(barCountdown(bar, fiveMinutes, start, active)).toBe("05:00");
    expect(barCountdown(bar, fiveMinutes, start + 240_000, active)).toBe("01:00");
    expect(barCountdown(bar, fiveMinutes, start + 240_001, active)).toBe("01:00");
    expect(barCountdown(bar, fiveMinutes, start + 299_999, active)).toBe("00:01");
    expect(barCountdown(bar, fiveMinutes, start + 300_000, active)).toBeNull();
    expect(barCountdown(bar, fiveMinutes, start + 600_000, active)).toBeNull();
    expect(barCountdown(bar, fiveMinutes, start - 1, active)).toBeNull();
  });

  it("formats second and multi-hour bars without a computer timezone dependency", () => {
    expect(barCountdown(bar, { unit: "second", value: 1 }, start, active)).toBe("00:01");
    expect(barCountdown(bar, { unit: "second", value: 45 }, start + 14001, active)).toBe("00:31");
    expect(barCountdown(bar, { unit: "minute", value: 240 }, start, active)).toBe("4:00:00");
    expect(barCountdown(bar, { unit: "minute", value: 120 }, start + 3601000, active)).toBe(
      "59:59",
    );
    expect(barCountdown(bar, { unit: "minute", value: 120 }, start + 1000, active)).toBe("1:59:59");
  });

  it("hides replay, disconnected and disabled clocks, and unsupported close schedules", () => {
    for (const state of [
      { ...active, enabled: false },
      { ...active, live: false },
      { ...active, replay: true },
    ])
      expect(barCountdown(bar, fiveMinutes, start, state)).toBeNull();
    for (const interval of CHART_INTERVALS.filter(
      ({ unit }) => unit !== "minute" && unit !== "second",
    ))
      expect(barCountdown(bar, interval, start, active)).toBeNull();
    expect(
      barCountdown(bar, { unit: "minute", value: 7 } as unknown as ChartInterval, start, active),
    ).toBeNull();
  });

  it("rejects missing and invalid times without mutating bars or following tick metadata", () => {
    expect(barCountdown(null, fiveMinutes, start, active)).toBeNull();
    for (const invalid of [NaN, Infinity, -Infinity]) {
      expect(barCountdown({ ...bar, time: invalid }, fiveMinutes, start, active)).toBeNull();
      expect(barCountdown(bar, fiveMinutes, invalid, active)).toBeNull();
    }
    const input = Object.freeze({
      ...bar,
      actualTime: bar.time + 120,
      actualEndTime: bar.time + 140,
    });
    expect(barCountdown(input, fiveMinutes, start + 60_000, active)).toBe("04:00");
    expect(input).toEqual({ ...bar, actualTime: bar.time + 120, actualEndTime: bar.time + 140 });
    expect(barCountdown({ ...bar, close: 999 }, fiveMinutes, start + 60_000, active)).toBe("04:00");
  });
});
