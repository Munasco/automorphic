import { describe, expect, it } from "vite-plus/test";
import { calculateChartRegression, type RegressionSource } from "./chartRegression";

describe("chart regression", () => {
  it("fits a hand-computable residual series with sample residual deviation and signed bands", () => {
    const result = calculateChartRegression([1, 3, 2].map((close) => ({ close })))!;
    expect(result.count).toBe(3);
    expect(result.slope).toBe(0.5);
    expect(result.base).toEqual({ start: 1.5, end: 2.5 });
    expect(result.standardDeviation).toBeCloseTo(Math.sqrt(0.75));
    expect(result.pearsonR).toBeCloseTo(0.5);
    expect(result.upper.start).toBeCloseTo(1.5 + Math.sqrt(3));
    expect(result.lower.end).toBeCloseTo(2.5 - Math.sqrt(3));
    const signed = calculateChartRegression(
      [1, 3, 2].map((close) => ({ close })),
      { lowerDeviation: 1 },
    )!;
    expect(signed.lower.start).toBeCloseTo(1.5 + Math.sqrt(0.75));
  });

  it("correlates source with fit for decreasing prices and handles a constant series", () => {
    const decreasing = calculateChartRegression([8, 6, 4, 2].map((close) => ({ close })))!;
    expect(decreasing).toMatchObject({
      slope: -2,
      base: { start: 8, end: 2 },
      standardDeviation: 0,
    });
    expect(decreasing.pearsonR).toBeCloseTo(1);
    const constant = calculateChartRegression([{ close: 7 }, { close: 7 }, { close: 7 }])!;
    expect(constant).toMatchObject({ slope: 0, standardDeviation: 0, pearsonR: 0 });
    expect(constant.base).toEqual({ start: 7, end: 7 });
    expect(constant.upper).toEqual(constant.base);
    expect(constant.lower).toEqual(constant.base);
  });

  it("uses each selected OHLC source, including double-weighted close", () => {
    const bar = { open: 2, high: 8, low: 4, close: 6 };
    const expected: Record<RegressionSource, number> = {
      open: 2,
      high: 8,
      low: 4,
      close: 6,
      hl2: 6,
      hlc3: 6,
      ohlc4: 5,
      hlcc4: 6,
    };
    for (const source of Object.keys(expected) as RegressionSource[]) {
      const result = calculateChartRegression([bar, { open: 4, high: 10, low: 6, close: 8 }], {
        source,
      })!;
      expect(result.base.start).toBeCloseTo(expected[source]);
      expect(result.base.end).toBeCloseTo(expected[source] + 2);
    }
    expect(
      calculateChartRegression(
        [
          { high: 10, low: 2, close: 8 },
          { high: 10, low: 2, close: 8 },
        ],
        { source: "hlcc4" },
      )!.base.start,
    ).toBe(7);
  });

  it("replaces disabled deviation multipliers with independent maximum high/low excursions", () => {
    const bars = [
      { close: 1, high: 4, low: 0 },
      { close: 3, high: 5, low: -2 },
      { close: 2, high: 6, low: 1 },
    ];
    const result = calculateChartRegression(bars, {
      useUpperDeviation: false,
      useLowerDeviation: false,
      upperDeviation: 99,
      lowerDeviation: 99,
    })!;
    expect(result.upper).toEqual({ start: 5, end: 6 });
    expect(result.lower).toEqual({ start: -2.5, end: -1.5 });
    const mixed = calculateChartRegression(bars, { useUpperDeviation: false, lowerDeviation: -1 })!;
    expect(mixed.upper).toEqual(result.upper);
    expect(mixed.lower.start).toBeCloseTo(1.5 - Math.sqrt(0.75));
  });

  it("rejects insufficient or missing required data instead of bridging the range", () => {
    expect(calculateChartRegression([])).toBeNull();
    expect(calculateChartRegression([{ close: 1 }])).toBeNull();
    expect(calculateChartRegression([{ close: 1 }, undefined, { close: 3 }])).toBeNull();
    expect(calculateChartRegression([{ close: 1 }, {}])).toBeNull();
    expect(calculateChartRegression([{ close: 1 }, { close: NaN }])).toBeNull();
    expect(calculateChartRegression([{ close: 1 }, { close: Infinity }])).toBeNull();
    expect(calculateChartRegression([{ close: 1 }, { close: 3 }], { source: "hlc3" })).toBeNull();
    expect(
      calculateChartRegression([{ close: 1 }, { close: 3 }], { useUpperDeviation: false }),
    ).toBeNull();
    expect(
      calculateChartRegression([{ close: 1 }, { close: 3 }], { upperDeviation: Infinity }),
    ).toBeNull();
    expect(calculateChartRegression([{ close: 1 }, { close: 3 }])).not.toBeNull();
  });
});
