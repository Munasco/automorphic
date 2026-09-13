import { describe, expect, it } from "vite-plus/test";
import type { Candle } from "./chartIndicators";
import { calculateBollingerPercentB } from "./bollingerPercentB";

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

describe("Bollinger Percent B", () => {
  it.each([
    { prices: [2, 4], deviations: 1, expected: 1 },
    { prices: [4, 2], deviations: 1, expected: 0 },
    { prices: [2, 4], deviations: 2, expected: 0.75 },
    { prices: [4, 2], deviations: 2, expected: 0.25 },
    { prices: [2, 4], deviations: 0.5, expected: 1.5 },
    { prices: [4, 2], deviations: 0.5, expected: -0.5 },
  ])(
    "reports $expected for source $prices and deviation $deviations without clamping",
    ({ prices, deviations, expected }) => {
      const input = bars(prices);
      // Mean=3, population deviation=1, bands=3 +/- chosen deviation multiplier.
      expect(calculateBollingerPercentB(input, 2, deviations)).toEqual([
        { time: input[1]!.time, value: expected },
      ]);
    },
  );

  it("uses population deviation and puts the selected price at the middle or exact outer band", () => {
    const middle = bars([2, 4, 3]);
    expect(calculateBollingerPercentB(middle, 3, 1)).toEqual([
      { time: middle[2]!.time, value: 0.5 },
    ]);
    const outer = bars([2, 4, 4, 4, 5, 5, 7, 9]);
    // Mean=5, population deviation=2, standard two-deviation bands are [1,9].
    expect(calculateBollingerPercentB(outer, 8, 2)).toEqual([{ time: outer[7]!.time, value: 1 }]);
  });

  it("defaults to length20 and permits out-of-band prices even at the default deviations", () => {
    const input = bars([...Array.from({ length: 19 }, () => 0), 10]);
    expect(calculateBollingerPercentB(input.slice(0, 19))).toEqual([]);
    const result = calculateBollingerPercentB(input);
    expect(result).toHaveLength(1);
    expect(result[0]!.time).toBe(input[19]!.time);
    expect(result[0]!.value).toBeCloseTo(0.5 + Math.sqrt(19) / 4, 12);
    expect(result).toEqual(calculateBollingerPercentB(input, 20, 2, "close"));
  });

  it.each(["close", "open", "high", "low", "hl2", "hlc3", "ohlc4"] as const)(
    "uses the selected %s price for both bands and numerator",
    (source) => {
      const input = bars([2, 4]).map((bar) => ({
        ...bar,
        open: bar.close * 2,
        high: bar.close * 3,
        low: bar.close * 0.5,
      }));
      expect(calculateBollingerPercentB(input, 2, 2, source)).toEqual([
        { time: input[1]!.time, value: 0.75 },
      ]);
    },
  );

  it("omits flat windows instead of inventing a neutral reading and resumes with nonzero width", () => {
    const input = bars([1, 2, 2, 2, 3]);
    expect(calculateBollingerPercentB(input, 2, 1)).toEqual([
      { time: input[1]!.time, value: 1 },
      { time: input[4]!.time, value: 1 },
    ]);
    expect(calculateBollingerPercentB(ascending(5), 1)).toEqual([]);
    for (const price of [0, -20, 1.1, 1e308])
      expect(calculateBollingerPercentB(bars(Array.from({ length: 25 }, () => price)))).toEqual([]);
  });

  it.each([{ time: NaN }, { close: NaN }, { close: Infinity }, { close: -Infinity }])(
    "requires full fresh warmup after invalid selected input %j",
    (patch) => {
      const input = ascending(9);
      Object.assign(input[4]!, patch);
      const result = calculateBollingerPercentB(input, 3);
      expect(result).toEqual([
        ...calculateBollingerPercentB(input.slice(0, 4), 3),
        ...calculateBollingerPercentB(input.slice(5), 3),
      ]);
      expect(result.map(({ time }) => time)).toEqual([
        input[2]!.time,
        input[3]!.time,
        input[7]!.time,
        input[8]!.time,
      ]);
    },
  );

  it("resets composite-source gaps while ignoring unused volume and price components", () => {
    const input = ascending(9);
    input[4]!.high = NaN;
    input[4]!.volume = NaN;
    expect(calculateBollingerPercentB(input, 3)).toEqual(
      calculateBollingerPercentB(ascending(9), 3),
    );
    expect(calculateBollingerPercentB(input, 3, 2, "hl2")).toEqual([
      ...calculateBollingerPercentB(input.slice(0, 4), 3, 2, "hl2"),
      ...calculateBollingerPercentB(input.slice(5), 3, 2, "hl2"),
    ]);
  });

  it("supports negative prices and avoids overflow when finite bands span an extreme range", () => {
    const negative = bars([-8, -6]);
    expect(calculateBollingerPercentB(negative, 2, 2)).toEqual([
      { time: negative[1]!.time, value: 0.75 },
    ]);
    const extreme = bars([-1, 1]);
    expect(calculateBollingerPercentB(extreme, 2, 1e308)).toEqual([
      { time: extreme[1]!.time, value: 0.5 },
    ]);
  });

  it("is prefix-stable through live revisions and leaves raw prices unchanged", () => {
    const input = ascending(10);
    const snapshot = structuredClone(input);
    const full = calculateBollingerPercentB(input, 3);
    for (let end = 0; end <= input.length; end++)
      expect(calculateBollingerPercentB(input.slice(0, end), 3)).toEqual(
        full.slice(0, Math.max(0, end - 2)),
      );
    const revised = input.map((bar, index) => (index === 9 ? { ...bar, close: 30 } : bar));
    const after = calculateBollingerPercentB(revised, 3);
    expect(after.slice(0, -1)).toEqual(full.slice(0, -1));
    expect(after.at(-1)!.value).not.toBe(full.at(-1)!.value);
    expect(input).toEqual(snapshot);
    expect(calculateBollingerPercentB(input, 3)).toEqual(full);
  });

  it("rejects invalid lengths or nonpositive deviations and handles empty input", () => {
    expect(calculateBollingerPercentB([])).toEqual([]);
    for (const period of [0, -1, 1.5, NaN, Infinity])
      expect(calculateBollingerPercentB(ascending(25), period)).toEqual([]);
    for (const deviations of [0, -1, NaN, Infinity])
      expect(calculateBollingerPercentB(ascending(25), 3, deviations)).toEqual([]);
  });
});
