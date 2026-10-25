import { describe, expect, it } from "vite-plus/test";
import type { Candle } from "./chartIndicators";
import { calculateHullMovingAverage } from "./hullMovingAverage";

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

describe("Hull Moving Average", () => {
  it("combines newest-weighted half/full averages and smooths their difference", () => {
    const input = bars([1, 3, 2, 5, 4, 8]);
    const result = calculateHullMovingAverage(input, 4);
    // Full WMA: 33/10, 38/10, 56/10; half WMA: 4, 13/3, 20/3.
    // Differences: 47/10, 73/15, 116/15; final WMA length 2.
    expect(result.map(({ time }) => time)).toEqual(input.slice(4).map(({ time }) => time));
    expect(result[0]!.value).toBeCloseTo(433 / 90, 12);
    expect(result[1]!.value).toBeCloseTo(61 / 9, 12);
  });

  it.each([
    { period: 5, firstIndex: 5, firstValue: 19 / 3 },
    { period: 7, firstIndex: 7, firstValue: 25 / 3 },
    { period: 9, firstIndex: 10, firstValue: 11 },
  ])(
    "truncates half and square-root lengths for period $period",
    ({ period, firstIndex, firstValue }) => {
      const input = ascending(14);
      const result = calculateHullMovingAverage(input, period);
      expect(result[0]!.time).toBe(input[firstIndex]!.time);
      expect(result[0]!.value).toBeCloseTo(firstValue, 12);
      result.forEach(({ value }, index) => expect(value).toBeCloseTo(firstValue + index, 12));
      if (period === 9) expect(calculateHullMovingAverage(input)).toEqual(result);
    },
  );

  it("supports period one, negative and zero prices without clipping overshoot", () => {
    const input = bars([-8, -7, -6, -5, -4, -3, -2, -1]);
    expect(calculateHullMovingAverage(input, 1)).toEqual(
      input.map(({ time, close }) => ({ time, value: close })),
    );
    const negative = calculateHullMovingAverage(input, 5);
    expect(negative[0]!.value).toBeCloseTo(-8 / 3, 12);
    expect(negative.at(-1)!.value).toBeCloseTo(-2 / 3, 12);
    expect(calculateHullMovingAverage(bars([0, 0, 0, 0, 0, 0]), 5)).toEqual([
      { time: input[5]!.time, value: 0 },
    ]);
  });

  it.each([
    { source: "close", scale: 1 },
    { source: "open", scale: 2 },
    { source: "high", scale: 3 },
    { source: "low", scale: 0 },
    { source: "hl2", scale: 1.5 },
    { source: "hlc3", scale: 4 / 3 },
    { source: "ohlc4", scale: 1.5 },
  ] as const)("uses $source throughout both WMA stages", ({ source, scale }) => {
    const input = ascending(9).map((bar) => ({
      ...bar,
      open: 2 * bar.close,
      high: 3 * bar.close,
      low: 0,
    }));
    const result = calculateHullMovingAverage(input, 5, source);
    result.forEach(({ value }, index) => expect(value).toBeCloseTo((19 / 3 + index) * scale, 12));
    expect(result).toHaveLength(4);
  });

  it.each([{ time: NaN }, { close: NaN }, { close: Infinity }, { close: -Infinity }])(
    "restarts both stages after invalid selected data %j",
    (invalid) => {
      const input = ascending(14);
      Object.assign(input[6]!, invalid);
      const actual = calculateHullMovingAverage(input, 5);
      expect(actual).toEqual([
        ...calculateHullMovingAverage(input.slice(0, 6), 5),
        ...calculateHullMovingAverage(input.slice(7), 5),
      ]);
      expect(actual.map(({ time }) => time)).toEqual([
        input[5]!.time,
        input[12]!.time,
        input[13]!.time,
      ]);
    },
  );

  it("restarts after an invalid component of a composite source but ignores unused fields", () => {
    const input = ascending(14);
    input[6]!.high = NaN;
    expect(calculateHullMovingAverage(input, 5, "hl2")).toEqual([
      ...calculateHullMovingAverage(input.slice(0, 6), 5, "hl2"),
      ...calculateHullMovingAverage(input.slice(7), 5, "hl2"),
    ]);
    input[6]!.volume = NaN;
    expect(calculateHullMovingAverage(input, 5)).toEqual(
      calculateHullMovingAverage(ascending(14), 5),
    );
  });

  it("keeps past values unchanged through appends and revisions and never mutates source candles", () => {
    const input = ascending(15);
    const snapshot = structuredClone(input);
    const full = calculateHullMovingAverage(input, 5);
    for (let end = 0; end <= input.length; end++)
      expect(calculateHullMovingAverage(input.slice(0, end), 5)).toEqual(
        full.slice(0, Math.max(0, end - 5)),
      );
    const revised = input.map((bar, index) =>
      index === input.length - 1 ? { ...bar, close: 30 } : bar,
    );
    const after = calculateHullMovingAverage(revised, 5);
    expect(after.slice(0, -1)).toEqual(full.slice(0, -1));
    expect(after.at(-1)!.value).not.toBe(full.at(-1)!.value);
    const historical = input.map((bar, index) => (index === 8 ? { ...bar, close: 30 } : bar));
    const corrected = calculateHullMovingAverage(historical, 5);
    expect(corrected.slice(0, 3)).toEqual(full.slice(0, 3));
    expect(corrected[3]!.value).not.toBe(full[3]!.value);
    expect(input).toEqual(snapshot);
    expect(calculateHullMovingAverage(input, 5)).toEqual(full);
  });

  it.each([1.1, 1e308])(
    "preserves finite flat prices %s without accumulation or multiplication overflow",
    (price) => {
      const input = bars(Array.from({ length: 20 }, () => price));
      expect(calculateHullMovingAverage(input)).toEqual(
        input.slice(10).map(({ time }) => ({ time, value: price })),
      );
    },
  );

  it("returns no values before complete warmup or for invalid periods", () => {
    expect(calculateHullMovingAverage([])).toEqual([]);
    expect(calculateHullMovingAverage(ascending(10))).toEqual([]);
    for (const period of [0, -1, 1.5, NaN, Infinity])
      expect(calculateHullMovingAverage(ascending(20), period)).toEqual([]);
  });

  it("preserves finite results across opposite-sign extreme prices", () => {
    const result = calculateHullMovingAverage(bars([-1e308, 1e308]), 2);
    expect(result).toHaveLength(1);
    expect(result[0]!.value / 1e308).toBeCloseTo(5 / 3, 12);
  });
});
