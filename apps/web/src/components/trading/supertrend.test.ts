import { describe, expect, it } from "vite-plus/test";
import type { Candle } from "./chartIndicators";
import { calculateSupertrend } from "./supertrend";

const bars = (ranges: readonly (readonly [number, number, number])[]): Candle[] =>
  ranges.map(([high, low, close], index) => ({
    time: index + 1,
    open: close,
    high,
    low,
    close,
    volume: 100,
  }));

describe("calculateSupertrend", () => {
  it("seeds Wilder ATR after the full period and ratchets both bands across reversals", () => {
    // TR: 2,2,5,4,4,5,4,8; ATR2: 2,3.5,3.75,3.875,4.4375,4.21875,6.109375.
    const input = bars([
      [10, 8, 9],
      [11, 9, 10],
      [15, 11, 14],
      [16, 12, 13],
      [15, 11, 12],
      [11, 7, 8],
      [10, 6, 7],
      [15, 10, 14],
    ]);
    const result = calculateSupertrend(input, 2, 1);
    expect(result.points).toEqual([
      { time: 2, value: 12 },
      { time: 3, value: 9.5 },
      { time: 4, value: 10.25 },
      { time: 5, value: 10.25 },
      { time: 6, value: 13.4375 },
      { time: 7, value: 12.21875 },
      { time: 8, value: 6.390625 },
    ]);
    expect(result.upSegments).toEqual([result.points.slice(1, 4), result.points.slice(6)]);
    expect(result.downSegments).toEqual([result.points.slice(0, 1), result.points.slice(4, 6)]);
    expect(result.reading).toBe(6.390625);
  });
  it("does not reverse when the close merely touches the active band", () => {
    const result = calculateSupertrend(
      bars([
        [2, 0, 1],
        [3, 1, 3],
        [5, 3, 4],
        [4, 2, 2],
        [3, 1, 1],
      ]),
      1,
      1,
    );
    expect(result.downSegments).toEqual([
      [
        { time: 1, value: 3 },
        { time: 2, value: 3 },
      ],
      [{ time: 5, value: 4 }],
    ]);
    expect(result.upSegments).toEqual([
      [
        { time: 3, value: 2 },
        { time: 4, value: 2 },
      ],
    ]);
  });
  it("uses default ATR10 and multiplier3 without mutating input", () => {
    const input = bars(Array.from({ length: 12 }, () => [11, 9, 10] as const));
    const original = structuredClone(input);
    expect(calculateSupertrend(input)).toEqual(calculateSupertrend(input, 10, 3));
    expect(calculateSupertrend(input).points).toEqual(
      [10, 11, 12].map((time) => ({ time, value: 16 })),
    );
    expect(input).toEqual(original);
  });
  it.each([NaN, Infinity, -1, 0, 1.5])("rejects invalid ATR period %s", (period) => {
    expect(calculateSupertrend(bars([[2, 0, 1]]), period).points).toEqual([]);
  });
  it.each([NaN, Infinity, -1])("rejects invalid multiplier %s", (multiplier) => {
    expect(calculateSupertrend(bars([[2, 0, 1]]), 1, multiplier).points).toEqual([]);
  });
  it("handles zero ranges and zero multiplier with finite values", () => {
    const input = bars([
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ]);
    expect(calculateSupertrend(input, 2, 0).points).toEqual([
      { time: 2, value: 0 },
      { time: 3, value: 0 },
    ]);
  });
  it("restarts warmup at invalid ranges, separates same-direction segments and clears stale readings", () => {
    const input = bars([
      [11, 9, 10],
      [11, 9, 10],
      [0, 1, 0],
      [21, 19, 20],
      [21, 19, 20],
    ]);
    const result = calculateSupertrend(input, 2, 1);
    expect(result.downSegments).toEqual([[{ time: 2, value: 12 }], [{ time: 5, value: 22 }]]);
    expect(result.reading).toBe(22);
    expect(calculateSupertrend(input.slice(0, 3), 2, 1).reading).toBeUndefined();
    expect(calculateSupertrend(input.slice(0, 4), 2, 1).reading).toBeUndefined();
    expect(calculateSupertrend([], 2, 1).points).toEqual([]);
  });
});
