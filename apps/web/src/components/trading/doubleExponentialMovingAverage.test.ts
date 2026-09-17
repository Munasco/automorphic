import { describe, expect, it } from "vite-plus/test";
import { calculateDoubleExponentialMovingAverage as dema } from "./doubleExponentialMovingAverage";
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

describe("double exponential moving average", () => {
  it("matches independently seeded EMA stages on irregular values after 2n−1 bars", () => {
    const bars = candles([10, 30, 20, 50, 30, 60, 0, 40]);
    const expected = [215 / 6, 1315 / 24, 95 / 6, 3085 / 96];
    const result = dema(bars, 3);
    expect(result.map((point) => point.time)).toEqual([5, 6, 7, 8]);
    result.forEach((point, index) => expect(point.value).toBeCloseTo(expected[index]!, 10));
    expect(dema(bars.slice(0, 4), 3)).toEqual([]);
  });

  it("routes all seven candle sources through both stages using independent weighted formulas", () => {
    const bars: Candle[] = [
      { time: 1, open: 10, high: 14, low: 0, close: 1, volume: 1 },
      { time: 2, open: 30, high: 40, low: 2, close: 5, volume: 2 },
      { time: 3, open: 20, high: 25, low: 1, close: 2, volume: 3 },
      { time: 4, open: 50, high: 60, low: 3, close: 8, volume: 4 },
    ];
    // For n=2 the first DEMA equals source[2]; the next is
    // (24*source[3] + 5*source[2] - source[0] - source[1]) / 27.
    const expected: Record<PriceSource, [number, number]> = {
      open: [20, 1260 / 27],
      high: [25, 1511 / 27],
      low: [1, 75 / 27],
      close: [2, 196 / 27],
      hl2: [13, 793 / 27],
      hlc3: [28 / 3, 22],
      ohlc4: [12, 3042 / 108],
    };
    for (const source of Object.keys(expected) as PriceSource[]) {
      const result = dema(bars, 2, source);
      expect(result.map((point) => point.time)).toEqual([3, 4]);
      result.forEach((point, index) =>
        expect(point.value).toBeCloseTo(expected[source][index]!, 10),
      );
    }
  });

  it("retains the period-nine close default and its complete 17-bar warmup", () => {
    const bars = candles(Array.from({ length: 20 }, () => 42));
    expect(dema(bars)).toEqual(dema(bars, 9, "close"));
    expect(dema(bars)).toEqual([17, 18, 19, 20].map((time) => ({ time, value: 42 })));
    expect(dema(bars.slice(0, 16))).toEqual([]);
  });

  it("supports zero, negative prices and period one without altering source values", () => {
    const bars = candles([-20, 0, -5, 10, -100]);
    expect(dema(bars, 1)).toEqual(bars.map(({ time, close }) => ({ time, value: close })));
    expect(dema(candles([-7, -7, -7, -7, -7]), 3)).toEqual([{ time: 5, value: -7 }]);
    expect(dema(candles([0, 0, 0, 0, 0]), 3)).toEqual([{ time: 5, value: 0 }]);
  });

  it("keeps constant extreme finite prices representable without overflowing twice the EMA", () => {
    for (const value of [Number.MAX_VALUE, -Number.MAX_VALUE]) {
      const result = dema(candles([value, value, value, value, value]), 3);
      expect(result).toHaveLength(1);
      expect(Number.isFinite(result[0]!.value)).toBe(true);
      expect(result[0]!.value / value).toBeCloseTo(1, 12);
    }
  });

  it("restarts both stages after a missing selected reading rather than joining across gaps", () => {
    const bars = candles([10, 30, 20, 50, 30, NaN, 10, 30, 20, 50, 30]);
    const result = dema(bars, 3);
    expect(result.map((point) => point.time)).toEqual([5, 11]);
    result.forEach((point) => expect(point.value).toBeCloseTo(215 / 6));
  });

  it("resets on invalid chart time and selected source while ignoring invalid unused fields", () => {
    const clean = candles([10, 30, 20, 50, 30, 60, 0, 40, 10, 50, 30]);
    const invalidTime = clean.map((bar, index) => (index === 5 ? { ...bar, time: NaN } : bar));
    expect(dema(invalidTime, 3).map((point) => point.time)).toEqual([5, 11]);
    const selectedGap = clean.map((bar, index) => (index === 5 ? { ...bar, open: NaN } : bar));
    expect(dema(selectedGap, 3, "open").map((point) => point.time)).toEqual([5, 11]);
    expect(dema(selectedGap, 3)).toEqual(dema(clean, 3));
    expect(
      dema(
        clean.map((bar) => ({ ...bar, volume: NaN, high: NaN, low: NaN })),
        3,
      ),
    ).toEqual(dema(clean, 3));
  });

  it("never uses future bars and recomputes a live last-bar correction without mutating input", () => {
    const bars = candles([10, 30, 20, 50, 30, 60, 0, 40]);
    const before = structuredClone(bars);
    const complete = dema(bars, 3);
    for (let count = 1; count <= bars.length; count++) {
      expect(dema(bars.slice(0, count), 3)).toEqual(
        complete.filter((point) => point.time <= count),
      );
    }
    const revised = bars.map((bar, index) => (index === 7 ? { ...bar, close: 80 } : bar));
    const corrected = dema(revised, 3);
    expect(corrected.slice(0, -1)).toEqual(complete.slice(0, -1));
    expect(corrected.at(-1)!.value).toBeCloseTo(5965 / 96, 10);
    expect(bars).toEqual(before);
    expect(dema(bars, 3)).toEqual(complete);
  });

  it("rejects invalid periods and empty or insufficient segments", () => {
    const bars = candles([1, 2, 3, 4, 5]);
    for (const period of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
      expect(dema(bars, period)).toEqual([]);
    expect(dema([], 2)).toEqual([]);
    expect(dema(bars, 4)).toEqual([]);
  });
});
