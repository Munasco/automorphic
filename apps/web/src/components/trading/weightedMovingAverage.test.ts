import { describe, expect, it } from "vite-plus/test";
import type { Candle } from "./chartIndicators";
import { calculateWeightedMovingAverage } from "./weightedMovingAverage";

const bars = (prices: number[]): Candle[] =>
  prices.map((close, index) => ({
    time: 1_700_000_000 + index * 60,
    open: close,
    high: close + 1,
    low: close - 1,
    close,
    volume: 10,
  }));
const ascending = (count: number) => bars(Array.from({ length: count }, (_, index) => index + 1));

describe("Weighted Moving Average", () => {
  it("weights the newest candle highest and rolls the fixed window", () => {
    const input = bars([2, 4, 8, 6, 10]);
    const result = calculateWeightedMovingAverage(input, 3);
    // (2 + 2*4 + 3*8)/6, (4 + 2*8 + 3*6)/6, (8 + 2*6 + 3*10)/6.
    expect(result.map(({ time }) => time)).toEqual(input.slice(2).map(({ time }) => time));
    [17 / 3, 19 / 3, 25 / 3].forEach((value, index) =>
      expect(result[index]!.value).toBeCloseTo(value, 12),
    );
  });

  it("defaults to nine candles and emits on the last candle of the completed window", () => {
    const input = ascending(12);
    expect(calculateWeightedMovingAverage(input.slice(0, 8))).toEqual([]);
    const result = calculateWeightedMovingAverage(input);
    expect(result).toHaveLength(4);
    expect(result[0]!.time).toBe(input[8]!.time);
    result.forEach(({ value }, index) => expect(value).toBeCloseTo(19 / 3 + index, 12));
    expect(calculateWeightedMovingAverage(input, 9)).toEqual(result);
  });

  it.each([
    { source: "close", scale: 1 },
    { source: "open", scale: 2 },
    { source: "high", scale: 3 },
    { source: "low", scale: 0 },
    { source: "hl2", scale: 1.5 },
    { source: "hlc3", scale: 4 / 3 },
    { source: "ohlc4", scale: 1.5 },
  ] as const)("uses $source in every weighted contribution", ({ source, scale }) => {
    const input = ascending(5).map((bar) => ({
      ...bar,
      open: bar.close * 2,
      high: bar.close * 3,
      low: 0,
    }));
    const result = calculateWeightedMovingAverage(input, 3, source);
    expect(result).toHaveLength(3);
    result.forEach(({ value }, index) => expect(value).toBeCloseTo((7 / 3 + index) * scale, 12));
  });

  it("supports negative prices and period one without clipping or changing the source", () => {
    const input = bars([-5, -3, 0, 2]);
    expect(calculateWeightedMovingAverage(input, 1)).toEqual(
      input.map(({ time, close }) => ({ time, value: close })),
    );
    const result = calculateWeightedMovingAverage(input, 3);
    expect(result[0]!.value).toBeCloseTo(-11 / 6, 12);
    expect(result[1]!.value).toBeCloseTo(0.5, 12);
  });

  it.each([0, 1.1, -20, 1e308, -1e308])(
    "preserves flat prices %s exactly without accumulation",
    (price) => {
      const input = bars(Array.from({ length: 20 }, () => price));
      expect(calculateWeightedMovingAverage(input)).toEqual(
        input.slice(8).map(({ time }) => ({ time, value: price })),
      );
    },
  );

  it.each([
    [-1e308, 1e308, 1e308 / 3],
    [1e308, -1e308, -1e308 / 3],
  ])(
    "retains finite averages across extreme opposing prices %s / %s",
    (first, second, expected) => {
      const input = bars([first!, second!]);
      const result = calculateWeightedMovingAverage(input, 2);
      expect(result).toHaveLength(1);
      expect(result[0]!.time).toBe(input[1]!.time);
      expect(result[0]!.value / expected!).toBeCloseTo(1, 14);
    },
  );

  it.each([{ time: NaN }, { close: NaN }, { close: Infinity }, { close: -Infinity }])(
    "requires a fresh full window after invalid selected data %j",
    (patch) => {
      const input = ascending(9);
      Object.assign(input[4]!, patch);
      const result = calculateWeightedMovingAverage(input, 3);
      expect(result).toEqual([
        ...calculateWeightedMovingAverage(input.slice(0, 4), 3),
        ...calculateWeightedMovingAverage(input.slice(5), 3),
      ]);
      expect(result.map(({ time }) => time)).toEqual([
        input[2]!.time,
        input[3]!.time,
        input[7]!.time,
        input[8]!.time,
      ]);
    },
  );

  it("resets on a missing composite component but ignores unused price and volume fields", () => {
    const input = ascending(9);
    input[4]!.high = NaN;
    input[4]!.volume = NaN;
    expect(calculateWeightedMovingAverage(input, 3)).toEqual(
      calculateWeightedMovingAverage(ascending(9), 3),
    );
    expect(calculateWeightedMovingAverage(input, 3, "hl2")).toEqual([
      ...calculateWeightedMovingAverage(input.slice(0, 4), 3, "hl2"),
      ...calculateWeightedMovingAverage(input.slice(5), 3, "hl2"),
    ]);
  });

  it("preserves past values under appends and revisions without mutating source data", () => {
    const input = ascending(10);
    const snapshot = structuredClone(input);
    const full = calculateWeightedMovingAverage(input, 3);
    for (let end = 0; end <= input.length; end++)
      expect(calculateWeightedMovingAverage(input.slice(0, end), 3)).toEqual(
        full.slice(0, Math.max(0, end - 2)),
      );
    const revised = input.map((bar, index) => (index === 9 ? { ...bar, close: 30 } : bar));
    const after = calculateWeightedMovingAverage(revised, 3);
    expect(after.slice(0, -1)).toEqual(full.slice(0, -1));
    expect(after.at(-1)!.value).toBeCloseTo((8 + 2 * 9 + 3 * 30) / 6, 12);
    expect(input).toEqual(snapshot);
    expect(calculateWeightedMovingAverage(input, 3)).toEqual(full);
  });

  it("rejects invalid lengths and handles empty history", () => {
    expect(calculateWeightedMovingAverage([])).toEqual([]);
    for (const period of [0, -1, 1.5, NaN, Infinity])
      expect(calculateWeightedMovingAverage(ascending(12), period)).toEqual([]);
  });
});
