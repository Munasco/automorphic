import { describe, expect, it } from "vite-plus/test";
import { calculateTripleExponentialMovingAverage as tema } from "./tripleExponentialMovingAverage";
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

describe("triple exponential moving average", () => {
  it("matches independent three-stage calculations on irregular prices after 3n−2 bars", () => {
    const bars = candles([10, 30, 20, 50, 30, 60, 0, 40, 10, 50]);
    const result = tema(bars, 3);
    const expected = [95 / 9, 19255 / 576, 15535 / 1152, 12665 / 288];
    expect(result.map((point) => point.time)).toEqual([7, 8, 9, 10]);
    result.forEach((point, index) => expect(point.value).toBeCloseTo(expected[index]!, 10));
    expect(tema(bars.slice(0, 6), 3)).toEqual([]);
  });

  it("routes all seven sources through the three stages using independent weighted results", () => {
    const bars: Candle[] = [
      { time: 1, open: 10, high: 14, low: 0, close: 1, volume: 1 },
      { time: 2, open: 30, high: 40, low: 2, close: 5, volume: 2 },
      { time: 3, open: 20, high: 25, low: 1, close: 2, volume: 3 },
      { time: 4, open: 50, high: 60, low: 3, close: 8, volume: 4 },
      { time: 5, open: 40, high: 55, low: 4, close: 3, volume: 5 },
    ];
    // n=2 weights: first [-1,-1,5,24]/27; next [-2,-2,1,12,234]/243.
    const expected: Record<PriceSource, [number, number]> = {
      open: [140 / 3, 1100 / 27],
      high: [1511 / 27, 13507 / 243],
      low: [25 / 9, 323 / 81],
      close: [196 / 27, 788 / 243],
      hl2: [793 / 27, 7238 / 243],
      hlc3: [22, 1696 / 81],
      ohlc4: [3042 / 108, 25164 / 972],
    };
    for (const source of Object.keys(expected) as PriceSource[]) {
      const result = tema(bars, 2, source);
      expect(result.map((point) => point.time)).toEqual([4, 5]);
      result.forEach((point, index) =>
        expect(point.value).toBeCloseTo(expected[source][index]!, 10),
      );
    }
  });

  it("defaults to period nine close with a complete 25-bar warmup", () => {
    const bars = candles(Array.from({ length: 28 }, () => 42));
    expect(tema(bars)).toEqual(tema(bars, 9, "close"));
    expect(tema(bars).map((point) => point.time)).toEqual([25, 26, 27, 28]);
    tema(bars).forEach((point) => expect(point.value).toBeCloseTo(42, 12));
    expect(tema(bars.slice(0, 24))).toEqual([]);
  });

  it("preserves signed constants and makes period one the selected price itself", () => {
    const bars = candles([-20, 0, -5, 10, -100]);
    expect(tema(bars, 1)).toEqual(bars.map(({ time, close }) => ({ time, value: close })));
    for (const value of [-7, 0, 12])
      expect(tema(candles(Array(7).fill(value)), 3)).toEqual([{ time: 7, value }]);
  });

  it("does not overflow intermediate triples for representable constant extreme prices", () => {
    for (const value of [Number.MAX_VALUE, -Number.MAX_VALUE]) {
      const result = tema(candles(Array(7).fill(value)), 3);
      expect(result).toHaveLength(1);
      expect(Number.isFinite(result[0]!.value)).toBe(true);
      expect(result[0]!.value / value).toBeCloseTo(1, 12);
    }
  });

  it("requires all three stages to warm up again after a missing reading", () => {
    const segment = [10, 30, 20, 50, 30, 60, 0];
    const result = tema(candles([...segment, NaN, ...segment]), 3);
    expect(result.map((point) => point.time)).toEqual([7, 15]);
    result.forEach((point) => expect(point.value).toBeCloseTo(95 / 9, 10));
  });

  it("resets on invalid time or selected source while ignoring unused invalid fields", () => {
    const bars = candles(Array.from({ length: 15 }, (_, index) => 10 + ((index * 7) % 13)));
    const invalidTime = bars.map((bar, index) => (index === 7 ? { ...bar, time: NaN } : bar));
    expect(tema(invalidTime, 3).map((point) => point.time)).toEqual([7, 15]);
    const invalidOpen = bars.map((bar, index) => (index === 7 ? { ...bar, open: Infinity } : bar));
    expect(tema(invalidOpen, 3, "open").map((point) => point.time)).toEqual([7, 15]);
    expect(tema(invalidOpen, 3)).toEqual(tema(bars, 3));
    expect(
      tema(
        bars.map((bar) => ({ ...bar, volume: NaN, high: NaN, low: NaN })),
        3,
      ),
    ).toEqual(tema(bars, 3));
  });

  it("never looks ahead and corrects the last live bar without changing earlier readings or input", () => {
    const bars = candles([10, 30, 20, 50, 30, 60, 0, 40, 10, 50]);
    const before = structuredClone(bars);
    const complete = tema(bars, 3);
    for (let count = 0; count <= bars.length; count++)
      expect(tema(bars.slice(0, count), 3)).toEqual(
        complete.filter((point) => point.time <= count),
      );
    const revised = bars.map((bar, index) => (index === 9 ? { ...bar, close: 80 } : bar));
    const corrected = tema(revised, 3);
    expect(corrected.slice(0, -1)).toEqual(complete.slice(0, -1));
    expect(corrected.at(-1)!.value).toBeCloseTo(20225 / 288, 10);
    expect(bars).toEqual(before);
    expect(tema(bars, 3)).toEqual(complete);
  });

  it("rejects invalid periods and insufficient history", () => {
    const bars = candles([1, 2, 3, 4, 5, 6]);
    for (const period of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
      expect(tema(bars, period)).toEqual([]);
    expect(tema([], 2)).toEqual([]);
    expect(tema(bars, 3)).toEqual([]);
  });
});
