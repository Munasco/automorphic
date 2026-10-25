import { describe, expect, it } from "vite-plus/test";
import type { Candle } from "./chartIndicators";
import { calculateAwesomeOscillator } from "./awesomeOscillator";

const bars = (prices: number[]): Candle[] =>
  prices.map((price, index) => ({
    time: 1_700_000_000 + index * 60,
    open: price,
    high: price + 1,
    low: price - 1,
    close: price,
    volume: 10,
  }));
const ascending = (count: number) => bars(Array.from({ length: count }, (_, index) => index + 1));

describe("Awesome Oscillator", () => {
  it("subtracts hand-computed slow HL2 averages from fast averages", () => {
    const input = bars([1, 3, 2, 6, 4, 8]);
    const result = calculateAwesomeOscillator(input, 2, 3);
    // Fast: 5/2, 4, 5, 6; slow: 2, 11/3, 4, 6.
    expect(result.map(({ time }) => time)).toEqual(input.slice(2).map(({ time }) => time));
    const expected = [0.5, 1 / 3, 1, 0];
    result.forEach(({ value }, index) => expect(value).toBeCloseTo(expected[index]!, 12));
  });

  it("uses the range midpoint even when closes do not move", () => {
    const input = bars([9, 9, 9]).map((bar, index) => ({
      ...bar,
      high: [10, 14, 18][index]!,
      low: [2, 4, 8][index]!,
    }));
    // HL2 is 6, 9, 13: one-bar mean minus two-bar mean is 1.5, then 2.
    expect(calculateAwesomeOscillator(input, 1, 2)).toEqual([
      { time: input[1]!.time, value: 1.5 },
      { time: input[2]!.time, value: 2 },
    ]);
    const unused = input.map((bar) => ({ ...bar, open: NaN, close: Infinity, volume: NaN }));
    expect(calculateAwesomeOscillator(unused, 1, 2)).toEqual(
      calculateAwesomeOscillator(input, 1, 2),
    );
  });

  it("defaults to 5/34 with the first result on the 34th valid candle", () => {
    const input = ascending(40);
    expect(calculateAwesomeOscillator(input.slice(0, 33))).toEqual([]);
    const result = calculateAwesomeOscillator(input);
    expect(result).toHaveLength(7);
    expect(result[0]!.time).toBe(input[33]!.time);
    result.forEach(({ value }) => expect(value).toBeCloseTo(14.5, 12));
    expect(calculateAwesomeOscillator(input, 5, 34)).toEqual(result);
  });

  it.each([0, -20, 1.1, 1e308])(
    "returns exact zero for flat prices %s without cancellation artifacts",
    (price) => {
      const input = bars(Array.from({ length: 40 }, () => price));
      expect(calculateAwesomeOscillator(input)).toEqual(
        input.slice(33).map(({ time }) => ({ time, value: 0 })),
      );
    },
  );

  it("supports negative prices and preserves bearish negative output", () => {
    const input = bars([-1, -2, -3, -4, -5, -6]);
    expect(calculateAwesomeOscillator(input, 1, 3)).toEqual(
      input.slice(2).map(({ time }) => ({ time, value: -1 })),
    );
  });

  it.each([
    { time: NaN },
    { high: Infinity },
    { low: -Infinity },
    { high: NaN },
    { low: NaN },
    { high: 1, low: 2 },
  ])("restarts full warmup after invalid data %j", (patch) => {
    const input = ascending(9);
    Object.assign(input[4]!, patch);
    const actual = calculateAwesomeOscillator(input, 2, 3);
    expect(actual).toEqual([
      ...calculateAwesomeOscillator(input.slice(0, 4), 2, 3),
      ...calculateAwesomeOscillator(input.slice(5), 2, 3),
    ]);
    expect(actual.map(({ time }) => time)).toEqual([
      input[2]!.time,
      input[3]!.time,
      input[7]!.time,
      input[8]!.time,
    ]);
  });

  it("keeps finite results for opposite-sign extremes whose baseline subtraction overflows", () => {
    const input = bars([-1e308, 1e308]);
    expect(calculateAwesomeOscillator(input, 1, 2)).toEqual([
      { time: input[1]!.time, value: 1e308 },
    ]);
  });

  it("preserves earlier outputs during appends and revisions without changing raw candles", () => {
    const input = ascending(12);
    const snapshot = structuredClone(input);
    const full = calculateAwesomeOscillator(input, 2, 4);
    for (let end = 0; end <= input.length; end++)
      expect(calculateAwesomeOscillator(input.slice(0, end), 2, 4)).toEqual(
        full.slice(0, Math.max(0, end - 3)),
      );
    const revised = input.map((bar, index) => (index === 11 ? { ...bar, high: 30, low: 20 } : bar));
    const after = calculateAwesomeOscillator(revised, 2, 4);
    expect(after.slice(0, -1)).toEqual(full.slice(0, -1));
    expect(after.at(-1)!.value).not.toBe(full.at(-1)!.value);
    expect(input).toEqual(snapshot);
    expect(calculateAwesomeOscillator(input, 2, 4)).toEqual(full);
  });

  it("rejects invalid periods and empty history", () => {
    expect(calculateAwesomeOscillator([])).toEqual([]);
    for (const [fast, slow] of [
      [0, 3],
      [-1, 3],
      [1.5, 3],
      [NaN, 3],
      [1, Infinity],
      [1, 3.5],
      [3, 3],
      [4, 3],
    ])
      expect(calculateAwesomeOscillator(ascending(10), fast, slow)).toEqual([]);
  });
});
