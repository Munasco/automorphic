import { describe, expect, it } from "vite-plus/test";
import { indicatorLevelFills } from "./indicatorLevelFill";

const bars = (times: number[]) => times.map((time) => ({ time }));
const points = (times: number[], value = 50) => times.map((time) => ({ time, value }));

describe("indicator level fills", () => {
  it("creates constant boundaries for each contiguous reading run, preserving zero and out-of-range readings", () => {
    const readings = [
      { time: 1, value: 0 },
      { time: 2, value: 100 },
      { time: 4, value: -20 },
      { time: 5, value: 120 },
    ];
    const result = indicatorLevelFills(bars([1, 2, 3, 4, 5]), readings, 30, 70);
    expect(result).toHaveLength(2);
    expect(result.map((fill) => fill.styleKey)).toEqual(["background", "background"]);
    expect(result.map((fill) => fill.lower)).toEqual([points([1, 2], 30), points([4, 5], 30)]);
    expect(result.map((fill) => fill.upper)).toEqual([points([1, 2], 70), points([4, 5], 70)]);
    expect(new Set(result.map((fill) => fill.id)).size).toBe(2);
  });

  it("starts after warmup and omits empty or single-point runs", () => {
    expect(
      indicatorLevelFills(bars([1, 2, 3, 4, 5, 6, 7]), points([2, 4, 5, 7]), 20, 80).map(
        (fill) => fill.upper,
      ),
    ).toEqual([points([4, 5], 80)]);
    expect(indicatorLevelFills(bars([1, 2, 3]), points([3]), 20, 80)).toEqual([]);
    expect(indicatorLevelFills(bars([1, 2, 3]), [], 20, 80)).toEqual([]);
    expect(indicatorLevelFills([], points([1, 2]), 20, 80)).toEqual([]);
  });

  it("splits on nonfinite readings and raw chart timestamps", () => {
    for (const invalid of [NaN, Infinity, -Infinity]) {
      const validTimes = [1, 2, 3, 4, 5];
      const invalidReading = points(validTimes).map((point) =>
        point.time === 3 ? { ...point, value: invalid } : point,
      );
      const expected = [points([1, 2], 70), points([4, 5], 70)];
      expect(
        indicatorLevelFills(bars(validTimes), invalidReading, 30, 70).map((fill) => fill.upper),
      ).toEqual(expected);
      expect(
        indicatorLevelFills(
          bars([1, 2, invalid, 4, 5]),
          [...points(validTimes), { time: invalid, value: 50 }],
          30,
          70,
        ).map((fill) => fill.upper),
      ).toEqual(expected);
    }
  });

  it("follows raw bar order and adjacency, ignoring off-chart points and elapsed time gaps", () => {
    const chart = bars([1, 1000, 100000]);
    const readings = points([100000, -1, 1, 999, 1000]);
    const result = indicatorLevelFills(chart, readings, -100.5, 100.5);
    expect(result).toHaveLength(1);
    expect(result[0]!.lower).toEqual(points([1, 1000, 100000], -100.5));
    expect(result[0]!.upper).toEqual(points([1, 1000, 100000], 100.5));
  });

  it("rejects invalid bounds and accepts any ordered finite boundary pair", () => {
    const chart = bars([1, 2]);
    const readings = points([1, 2]);
    for (const [lower, upper] of [
      [30, 30],
      [70, 30],
      [NaN, 70],
      [30, NaN],
      [-Infinity, 70],
      [30, Infinity],
    ])
      expect(indicatorLevelFills(chart, readings, lower!, upper!)).toEqual([]);
    const result = indicatorLevelFills(chart, readings, -Number.MAX_VALUE, Number.MAX_VALUE);
    expect(result[0]!.lower).toEqual(points([1, 2], -Number.MAX_VALUE));
    expect(result[0]!.upper).toEqual(points([1, 2], Number.MAX_VALUE));
  });

  it("keeps run IDs stable when readings, bounds or trailing history change", () => {
    const original = indicatorLevelFills(bars([1, 2, 3, 4, 5]), points([1, 2, 4, 5]), 30, 70);
    const revised = indicatorLevelFills(
      bars([1, 2, 3, 4, 5, 6]),
      points([1, 2, 4, 5, 6], 99),
      20,
      80,
    );
    expect(revised.map((fill) => fill.id)).toEqual(original.map((fill) => fill.id));
    const prefixed = indicatorLevelFills(
      bars([-2, -1, 0, 1, 2, 3, 4, 5]),
      points([-2, -1, 1, 2, 4, 5]),
      30,
      70,
    );
    expect(prefixed.slice(1).map((fill) => fill.id)).toEqual(original.map((fill) => fill.id));
  });

  it("does not mutate source arrays or reuse mutable boundary points", () => {
    const chart = bars([1, 2, 3]);
    const readings = points([1, 2, 3]);
    const snapshot = structuredClone({ chart, readings });
    const result = indicatorLevelFills(chart, readings, 30, 70);
    expect({ chart, readings }).toEqual(snapshot);
    expect(result[0]!.lower[0]).not.toBe(readings[0]);
    expect(result[0]!.lower[0]).not.toBe(result[0]!.upper[0]);
    expect(indicatorLevelFills(chart, readings, 30, 70)).toEqual(result);
  });
});
