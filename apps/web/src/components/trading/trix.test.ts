import { describe, expect, it } from "vite-plus/test";
import { calculateTRIX } from "./trix";
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

describe("TRIX oscillator", () => {
  it("matches independently calculated triple-EMA returns and signal on irregular values", () => {
    const result = calculateTRIX(candles([10, 30, 20, 50, 30, 60, 0, 40, 10, 50]), 3, "close", 2);
    expect(result.trix.map(({ time }) => time)).toEqual([8, 9, 10]);
    const expected = [-2075 / 934, -33550 / 3653, 4240 / 1327];
    result.trix.forEach((point, index) => expect(point.value).toBeCloseTo(expected[index]!, 10));
    expect(result.signal.map(({ time }) => time)).toEqual([9, 10]);
    expect(result.signal[0]!.value).toBeCloseTo(-38915675 / 6823804, 10);
    expect(result.signal[1]!.value).toBeCloseTo(2074919065 / 9055187908, 10);
  });

  it("uses eighteen-bar EMA stages and a nine-reading signal by default", () => {
    const bars = candles(Array(64).fill(42));
    const result = calculateTRIX(bars);
    expect(result).toEqual(calculateTRIX(bars, 18, "close", 9));
    expect(result.trix.map(({ time }) => time)).toEqual(
      Array.from({ length: 12 }, (_, i) => i + 53),
    );
    expect(result.signal.map(({ time }) => time)).toEqual([61, 62, 63, 64]);
    [...result.trix, ...result.signal].forEach(({ value }) => expect(value).toBeCloseTo(0, 12));
    expect(calculateTRIX(bars.slice(0, 52))).toEqual({ trix: [], signal: [] });
    expect(calculateTRIX(bars.slice(0, 60)).signal).toEqual([]);
  });

  it("returns positive momentum for rising prices and negative momentum for falling positive prices", () => {
    for (const rising of [true, false]) {
      const bars = candles(Array.from({ length: 30 }, (_, i) => (rising ? 100 + i : 100 - i)));
      const result = calculateTRIX(bars, 3, "close", 2);
      expect(result.trix).toHaveLength(23);
      expect(result.trix.every(({ value }) => (rising ? value > 0 : value < 0))).toBe(true);
      expect(result.signal.every(({ value }) => (rising ? value > 0 : value < 0))).toBe(true);
    }
  });

  it("routes all seven selected sources through three smoothing stages", () => {
    const bars: Candle[] = [
      { time: 1, open: 10, high: 14, low: 0, close: 1, volume: 1 },
      { time: 2, open: 30, high: 40, low: 2, close: 5, volume: 2 },
      { time: 3, open: 20, high: 25, low: 1, close: 2, volume: 3 },
      { time: 4, open: 50, high: 60, low: 3, close: 8, volume: 4 },
      { time: 5, open: 40, high: 55, low: 4, close: 3, volume: 5 },
    ];
    const expected: Record<PriceSource, number> = {
      open: 250 / 9,
      high: 246400 / 8199,
      low: 8000 / 117,
      close: 8600 / 927,
      hl2: 5408 / 171,
      hlc3: 31000 / 1053,
      ohlc4: 17000 / 591,
    };
    for (const source of Object.keys(expected) as PriceSource[]) {
      const result = calculateTRIX(bars, 2, source, 1);
      expect(result.trix).toHaveLength(1);
      expect(result.trix[0]!.time).toBe(5);
      expect(result.trix[0]!.value).toBeCloseTo(expected[source], 10);
      expect(result.signal).toEqual(result.trix);
    }
  });

  it("uses the actual signed denominator at period one and omits undefined returns from zero", () => {
    const result = calculateTRIX(candles([-10, -20, -10, 0, 10, 20]), 1, "close", 2);
    expect(result.trix).toEqual([
      { time: 2, value: 100 },
      { time: 3, value: -50 },
      { time: 4, value: -100 },
      { time: 6, value: 100 },
    ]);
    expect(result.signal.map(({ time }) => time)).toEqual([3, 4]);
    expect(result.signal[0]!.value).toBe(25);
    expect(result.signal[1]!.value).toBeCloseTo(-175 / 3, 10);
  });

  it("does not bridge missing source readings or invalid timestamps in the oscillator or signal", () => {
    const source = candles([1, 2, 4, NaN, 8, 16, 32]);
    const expected = {
      trix: [2, 3, 6, 7].map((time) => ({ time, value: 100 })),
      signal: [3, 7].map((time) => ({ time, value: 100 })),
    };
    expect(calculateTRIX(source, 1, "close", 2)).toEqual(expected);
    const invalidTime = candles([1, 2, 4, 6, 8, 16, 32]).map((bar, i) =>
      i === 3 ? { ...bar, time: NaN } : bar,
    );
    expect(calculateTRIX(invalidTime, 1, "close", 2)).toEqual(expected);
    const invalidOpen = source.map((bar) => ({ ...bar, open: bar.close, close: 1 }));
    expect(calculateTRIX(invalidOpen, 1, "open", 2)).toEqual(expected);
    expect(calculateTRIX(invalidOpen, 1, "close", 2).trix).toHaveLength(6);
  });

  it("fully warms all three stages after a gap before calculating a new return", () => {
    const segment = [10, 30, 20, 50, 30, 60, 0, 40];
    const result = calculateTRIX(candles([...segment, NaN, ...segment]), 3, "close", 1);
    expect(result.trix.map(({ time }) => time)).toEqual([8, 17]);
    result.trix.forEach(({ value }) => expect(value).toBeCloseTo(-2075 / 934, 10));
    expect(result.signal).toEqual(result.trix);
  });

  it("avoids needless overflow across opposite extreme values and omits unrepresentable returns", () => {
    const large = Number.MAX_VALUE;
    const result = calculateTRIX(candles([large, -large, large]), 1, "close", 1);
    expect(result.trix).toEqual([
      { time: 2, value: -200 },
      { time: 3, value: -200 },
    ]);
    expect(result.signal).toEqual(result.trix);
    expect(calculateTRIX(candles([Number.MIN_VALUE, large, large / 2]), 1, "close", 2)).toEqual({
      trix: [{ time: 3, value: -50 }],
      signal: [],
    });
    expect(
      calculateTRIX(candles(Array(12).fill(large)), 3, "close", 2).trix.every(
        ({ value }) => value === 0,
      ),
    ).toBe(true);
  });

  it("recomputes last-bar revisions without mutation or future leakage", () => {
    const bars = candles([10, 30, 20, 50, 30, 60, 0, 40, 10, 50]);
    const before = structuredClone(bars);
    const complete = calculateTRIX(bars, 3, "close", 2);
    for (let count = 0; count <= bars.length; count++) {
      const result = calculateTRIX(bars.slice(0, count), 3, "close", 2);
      expect(result.trix).toEqual(complete.trix.filter(({ time }) => time <= count));
      expect(result.signal).toEqual(complete.signal.filter(({ time }) => time <= count));
    }
    const revised = bars.map((bar, i) => (i === 9 ? { ...bar, close: 80 } : bar));
    const corrected = calculateTRIX(revised, 3, "close", 2);
    expect(corrected.trix.slice(0, -1)).toEqual(complete.trix.slice(0, -1));
    expect(corrected.signal.slice(0, -1)).toEqual(complete.signal.slice(0, -1));
    expect(corrected.trix.at(-1)!.value).toBeCloseTo(21520 / 1327, 10);
    expect(corrected.signal.at(-1)!.value).toBeCloseTo(80685141145 / 9055187908, 10);
    expect(bars).toEqual(before);
  });

  it("rejects invalid main inputs while keeping TRIX available if only the signal length is invalid", () => {
    const bars = candles([1, 2, 4, 8]);
    const invalidPeriods = [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1];
    for (const period of invalidPeriods)
      expect(calculateTRIX(bars, period)).toEqual({ trix: [], signal: [] });
    expect(calculateTRIX(bars, 1, "time" as PriceSource)).toEqual({ trix: [], signal: [] });
    expect(calculateTRIX([], 1)).toEqual({ trix: [], signal: [] });
    const trix = [2, 3, 4].map((time) => ({ time, value: 100 }));
    for (const signalPeriod of [...invalidPeriods, 5])
      expect(calculateTRIX(bars, 1, "close", signalPeriod)).toEqual({ trix, signal: [] });
  });
});
