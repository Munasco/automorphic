import { describe, expect, it } from "vite-plus/test";
import { calculateMomentum } from "./momentum";
import type { Candle, PriceSource } from "./chartIndicators";

const candles = (values: number[]): Candle[] =>
  values.map((close, index) => ({
    time: index + 1,
    open: close,
    high: close,
    low: close,
    close,
    volume: 1,
  }));

describe("Momentum oscillator", () => {
  it("subtracts the price exactly N bars ago in price units, without percentage scaling", () => {
    const result = calculateMomentum(candles([10, 30, 20, 50, 30, 60, 0, 40]), 3);
    expect(result).toEqual(
      [40, 0, 40, -50, 10].map((value, index) => ({ time: index + 4, value })),
    );
  });

  it("defaults to ten-bar close lookback and needs eleven valid bars for its first value", () => {
    const bars = candles(Array.from({ length: 13 }, (_, i) => 100 + i * i));
    expect(calculateMomentum(bars)).toEqual([
      { time: 11, value: 100 },
      { time: 12, value: 120 },
      { time: 13, value: 140 },
    ]);
    expect(calculateMomentum(bars)).toEqual(calculateMomentum(bars, 10, "close"));
    expect(calculateMomentum(bars.slice(0, 10))).toEqual([]);
  });

  it("supports period one, zero and signed prices without treating zero as an invalid baseline", () => {
    expect(calculateMomentum(candles([-10, 0, 5, -20, -20]), 1)).toEqual([
      { time: 2, value: 10 },
      { time: 3, value: 5 },
      { time: 4, value: -25 },
      { time: 5, value: 0 },
    ]);
    for (const value of [0, -10, 20])
      expect(calculateMomentum(candles(Array(5).fill(value)), 2)).toEqual(
        [3, 4, 5].map((time) => ({ time, value: 0 })),
      );
  });

  it("routes all seven price sources through the exact lookback subtraction", () => {
    const bars: Candle[] = [
      { time: 1, open: 10, high: 14, low: 0, close: 1, volume: 1 },
      { time: 2, open: 30, high: 40, low: 2, close: 5, volume: 2 },
      { time: 3, open: 20, high: 25, low: 1, close: 2, volume: 3 },
      { time: 4, open: 50, high: 60, low: 3, close: 8, volume: 4 },
      { time: 5, open: 40, high: 55, low: 4, close: 3, volume: 5 },
    ];
    const expected: Record<PriceSource, number[]> = {
      open: [10, 20, 20],
      high: [11, 20, 30],
      low: [1, 1, 3],
      close: [1, 3, 1],
      hl2: [6, 10.5, 16.5],
      hlc3: [13 / 3, 8, 34 / 3],
      ohlc4: [23 / 4, 11, 13.5],
    };
    for (const source of Object.keys(expected) as PriceSource[]) {
      const result = calculateMomentum(bars, 2, source);
      expect(result.map(({ time }) => time)).toEqual([3, 4, 5]);
      result.forEach(({ value }, i) => expect(value).toBeCloseTo(expected[source][i]!, 12));
    }
  });

  it("restarts contiguous lookback after missing source data or invalid timestamps", () => {
    const values = [10, 20, 30, 40, 50, 60, 80];
    const expected = [
      { time: 3, value: 20 },
      { time: 7, value: 30 },
    ];
    for (const invalid of [NaN, Infinity, -Infinity]) {
      const sourceGap = candles(values).map((bar, i) =>
        i === 3 ? { ...bar, close: invalid } : bar,
      );
      expect(calculateMomentum(sourceGap, 2)).toEqual(expected);
      const timeGap = candles(values).map((bar, i) => (i === 3 ? { ...bar, time: invalid } : bar));
      expect(calculateMomentum(timeGap, 2)).toEqual(expected);
    }
    const gapsAtEveryThirdBar = candles([1, 2, NaN, 4, 5, NaN, 7, 8]);
    expect(calculateMomentum(gapsAtEveryThirdBar, 2)).toEqual([]);
  });

  it("only invalidates the selected source and counts chart bars instead of elapsed time", () => {
    const bars = candles([10, 20, 30]).map((bar, i) => ({
      ...bar,
      time: [10, 40, 4000][i]!,
      volume: NaN,
      open: NaN,
      high: NaN,
      low: NaN,
    }));
    expect(calculateMomentum(bars, 2)).toEqual([{ time: 4000, value: 20 }]);
    expect(calculateMomentum(bars, 2, "open")).toEqual([]);
    expect(calculateMomentum(bars, 2, "ohlc4")).toEqual([]);
  });

  it("omits unrepresentable subtraction but resumes from real prices rather than resetting the input history", () => {
    const extreme = Number.MAX_VALUE;
    expect(calculateMomentum(candles([extreme, -extreme, -extreme / 2, 0]), 1)).toEqual([
      { time: 3, value: extreme / 2 },
      { time: 4, value: extreme / 2 },
    ]);
    expect(calculateMomentum(candles([extreme, extreme, extreme]), 1)).toEqual([
      { time: 2, value: 0 },
      { time: 3, value: 0 },
    ]);
  });

  it("recalculates a live last-bar correction without mutating input or leaking future values", () => {
    const bars = candles([10, 30, 20, 50, 30, 60, 0, 40]);
    const before = structuredClone(bars);
    const complete = calculateMomentum(bars, 3);
    for (let count = 0; count <= bars.length; count++)
      expect(calculateMomentum(bars.slice(0, count), 3)).toEqual(
        complete.filter(({ time }) => time <= count),
      );
    const revised = bars.map((bar, i) => (i === 7 ? { ...bar, close: 80 } : bar));
    const corrected = calculateMomentum(revised, 3);
    expect(corrected.slice(0, -1)).toEqual(complete.slice(0, -1));
    expect(corrected.at(-1)).toEqual({ time: 8, value: 50 });
    expect(bars).toEqual(before);
    expect(calculateMomentum(bars, 3)).toEqual(complete);
  });

  it("rejects invalid periods, sources, empty input and insufficient valid history", () => {
    const bars = candles([1, 2, 3]);
    for (const period of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, 3, 10])
      expect(calculateMomentum(bars, period)).toEqual([]);
    expect(calculateMomentum(bars, 1, "time" as PriceSource)).toEqual([]);
    expect(calculateMomentum([], 1)).toEqual([]);
  });
});
