import { describe, expect, it } from "vite-plus/test";
import {
  calculateEMA,
  calculateRSI,
  calculateSMA,
  calculateVWAP,
  calculateVWAPBands,
  type Candle,
  type PriceSource,
} from "./chartIndicators";

const epoch = Date.parse("2026-09-14T14:00:00Z") / 1000;
const bars = (closes: number[]): Candle[] =>
  closes.map((close, index) => ({
    time: epoch + index * 60,
    open: close,
    high: close,
    low: close,
    close,
    volume: 1,
  }));
const values = (points: { value: number }[]) => points.map((point) => point.value);
const timed = (time: string, close: number, volume = 1): Candle => ({
  ...bars([close])[0]!,
  time: Date.parse(time) / 1000,
  volume,
});

describe("chart indicators", () => {
  it("calculates SMA windows after a complete warmup", () => {
    const input = bars([10, 11, 13, 12, 15, 14]);
    const result = calculateSMA(input, 3);
    expect(result.map((point) => point.time)).toEqual(input.slice(2).map((bar) => bar.time));
    expect(values(result)).toEqual([34 / 3, 12, 40 / 3, 41 / 3]);
    expect(calculateSMA(input.slice(0, 2), 3)).toEqual([]);
  });

  it("SMA-seeds EMA and applies exponential weighting to each later close", () => {
    const input = bars([10, 11, 13, 12, 15, 14]);
    const result = calculateEMA(input, 3);
    expect(result[0]?.time).toBe(input[2]?.time);
    const expected = [34 / 3, 35 / 3, 40 / 3, 41 / 3];
    values(result).forEach((value, index) => expect(value).toBeCloseTo(expected[index]!, 12));
    expect(calculateEMA(input.slice(0, 2), 3)).toEqual([]);
  });

  it.each([
    { source: "close", sma: [12, 22, 36], ema: [12, 68 / 3, 332 / 9] },
    { source: "open", sma: [6, 14, 30], ema: [6, 46 / 3, 286 / 9] },
    { source: "high", sma: [18, 30, 48], ema: [18, 30, 50] },
    { source: "low", sma: [2, 8, 18], ema: [2, 26 / 3, 170 / 9] },
    { source: "hl2", sma: [10, 19, 33], ema: [10, 58 / 3, 310 / 9] },
    { source: "hlc3", sma: [32 / 3, 20, 34], ema: [32 / 3, 184 / 9, 952 / 27] },
    { source: "ohlc4", sma: [9.5, 18.5, 33], ema: [9.5, 115 / 6, 619 / 18] },
  ] as const)(
    "calculates SMA and EMA from $source without changing candle data",
    ({ source, sma, ema }) => {
      const input = bars([8, 16, 28, 44]).map((bar, index) => ({
        ...bar,
        open: [4, 8, 20, 40][index]!,
        high: [12, 24, 36, 60][index]!,
        low: [0, 4, 12, 24][index]!,
      }));
      const original = structuredClone(input);
      for (const [calculate, expected] of [
        [calculateSMA, sma],
        [calculateEMA, ema],
      ] as const) {
        const points = calculate(input, 2, source);
        expect(points.map((point) => point.time)).toEqual(input.slice(1).map((bar) => bar.time));
        values(points).forEach((value, index) => expect(value).toBeCloseTo(expected[index]!, 12));
        if (source === "close") expect(calculate(input, 2)).toEqual(points);
      }
      expect(input).toEqual(original);
    },
  );

  it.each([
    { source: "close", field: "close" },
    { source: "open", field: "open" },
    { source: "high", field: "high" },
    { source: "low", field: "low" },
    { source: "hl2", field: "high" },
    { source: "hlc3", field: "close" },
    { source: "ohlc4", field: "open" },
  ] as const)("restarts $source warmup after missing or nonfinite $field", ({ source, field }) => {
    for (const invalid of [undefined, NaN, Infinity, -Infinity]) {
      const input = bars([1, 2, 3, 4, 5, 6]);
      Object.assign(input[2]!, { [field]: invalid });
      for (const calculate of [calculateSMA, calculateEMA]) {
        const points = calculate(input, 2, source);
        expect(points.map((point) => point.time)).toEqual([
          input[1]!.time,
          input[4]!.time,
          input[5]!.time,
        ]);
        values(points).forEach((value, index) =>
          expect(value).toBeCloseTo([1.5, 4.5, 5.5][index]!, 12),
        );
      }
    }
  });

  it.each([
    { source: "close", field: "open" },
    { source: "open", field: "close" },
    { source: "high", field: "low" },
    { source: "low", field: "high" },
    { source: "hl2", field: "close" },
    { source: "hlc3", field: "open" },
    { source: "ohlc4", field: "volume" },
  ] as const)(
    "does not let unused $field values poison the $source average",
    ({ source, field }) => {
      const input = bars([1, 2, 3, 4]).map((bar) => ({ ...bar, [field]: NaN }));
      for (const calculate of [calculateSMA, calculateEMA])
        expect(calculate(input, 2, source)).toEqual(calculate(bars([1, 2, 3, 4]), 2, source));
    },
  );

  it("resets selected-source warmup when the chart time is invalid", () => {
    const input = bars([1, 2, 3, 4, 5]);
    input[2]!.time = NaN;
    for (const calculate of [calculateSMA, calculateEMA])
      for (const source of ["open", "hl2", "ohlc4"] satisfies PriceSource[])
        expect(calculate(input, 2, source).map((point) => point.time)).toEqual([
          input[1]!.time,
          input[4]!.time,
        ]);
  });

  it("uses Wilder smoothing of gains and losses for RSI", () => {
    const input = bars([10, 12, 11, 14, 13, 13, 15]);
    const result = calculateRSI(input, 3);
    expect(result[0]?.time).toBe(input[3]?.time);
    const expected = [(100 * 5) / 6, (100 * 2) / 3, (100 * 2) / 3, (100 * 94) / 114];
    values(result).forEach((value, index) => expect(value).toBeCloseTo(expected[index]!, 10));
    expect(calculateRSI(input.slice(0, 3), 3)).toEqual([]);
  });

  it.each([
    { source: "close", expected: [60, 100 / 3, 2300 / 29] },
    { source: "open", expected: [200 / 3, 800 / 9, 800 / 13] },
    { source: "high", expected: [100 / 3, 900 / 11, 60] },
    { source: "low", expected: [75, 87.5, 35] },
    { source: "hl2", expected: [400 / 7, 1600 / 19, 1600 / 35] },
    { source: "hlc3", expected: [100, 100, 100] },
    { source: "ohlc4", expected: [80, 1800 / 19, 1800 / 19] },
  ] as const)("uses $source changes for RSI gain/loss smoothing", ({ source, expected }) => {
    const input = bars([12, 10, 13, 11, 16]).map((bar, index) => ({
      ...bar,
      open: [10, 12, 11, 14, 13][index]!,
      high: [15, 16, 14, 18, 17][index]!,
      low: [5, 8, 7, 9, 6][index]!,
    }));
    const original = structuredClone(input);
    const result = calculateRSI(input, 2, source);
    expect(result.map((point) => point.time)).toEqual(input.slice(2).map((bar) => bar.time));
    values(result).forEach((value, index) => expect(value).toBeCloseTo(expected[index]!, 10));
    if (source === "close") expect(calculateRSI(input, 2)).toEqual(result);
    expect(input).toEqual(original);
  });

  it.each([
    { source: "close", field: "close" },
    { source: "open", field: "open" },
    { source: "high", field: "high" },
    { source: "low", field: "low" },
    { source: "hl2", field: "high" },
    { source: "hlc3", field: "close" },
    { source: "ohlc4", field: "open" },
  ] as const)(
    "restarts RSI's price baseline and warmup for an invalid $source component",
    ({ source, field }) => {
      for (const invalid of [undefined, NaN, Infinity, -Infinity]) {
        const input = bars([1, 2, 3, 4, 5, 6, 7, 6]);
        Object.assign(input[3]!, { [field]: invalid });
        const result = calculateRSI(input, 2, source);
        expect(result.map((point) => point.time)).toEqual([
          input[2]!.time,
          input[6]!.time,
          input[7]!.time,
        ]);
        values(result).forEach((value, index) =>
          expect(value).toBeCloseTo([100, 100, 50][index]!, 10),
        );
      }
    },
  );

  it("resets RSI source warmup for missing chart times while ignoring unused price fields", () => {
    const input = bars([1, 2, 3, 4, 5, 6, 7]);
    input[3]!.time = NaN;
    expect(calculateRSI(input, 2, "open")).toEqual([
      { time: input[2]!.time, value: 100 },
      { time: input[6]!.time, value: 100 },
    ]);
    for (const { source, unused } of [
      { source: "open", unused: "close" },
      { source: "hl2", unused: "close" },
      { source: "hlc3", unused: "open" },
      { source: "ohlc4", unused: "volume" },
    ] as const) {
      const incomplete = bars([1, 2, 3, 4]).map((bar) => ({ ...bar, [unused]: NaN }));
      expect(values(calculateRSI(incomplete, 2, source))).toEqual([100, 100]);
    }
  });

  it("handles rising, falling and unchanged prices without NaN RSI", () => {
    expect(values(calculateRSI(bars([1, 2, 3, 4, 5]), 3))).toEqual([100, 100]);
    expect(values(calculateRSI(bars([5, 4, 3, 2, 1]), 3))).toEqual([0, 0]);
    expect(values(calculateRSI(bars([5, 5, 5, 5, 5]), 3))).toEqual([50, 50]);
  });

  it("supports period one and rejects invalid periods without emitting points", () => {
    const input = bars([1, 3, 2]);
    expect(values(calculateSMA(input, 1))).toEqual([1, 3, 2]);
    expect(values(calculateEMA(input, 1))).toEqual([1, 3, 2]);
    expect(values(calculateRSI(input, 1))).toEqual([100, 0]);
    for (const calculate of [calculateSMA, calculateEMA, calculateRSI]) {
      for (const period of [0, -1, 1.5, NaN, Infinity])
        expect(calculate(input, period)).toEqual([]);
      expect(calculate([], 14)).toEqual([]);
    }
  });

  it("restarts price-indicator warmup after missing closes", () => {
    const input = bars([1, 2, NaN, 5, 6, 7, 8]);
    for (const calculate of [calculateSMA, calculateEMA]) {
      const result = calculate(input, 3);
      expect(result.map((point) => point.time)).toEqual([input[5]!.time, input[6]!.time]);
      expect(values(result)).toEqual([6, 7]);
    }
    expect(calculateRSI(input, 3)).toEqual([{ time: input[6]!.time, value: 100 }]);
  });

  it("weights typical HLC3 prices by volume", () => {
    const input = [
      { ...bars([11])[0]!, high: 14, low: 8, volume: 2 },
      { ...bars([13])[0]!, time: epoch + 60, high: 16, low: 10, volume: 6 },
    ];
    expect(values(calculateVWAP(input))).toEqual([11, 12.5]);
  });

  it("omits zero-volume initial bars and carries an established VWAP through zero volume", () => {
    const input = bars([100, 10, 100, 20]).map((bar, index) => ({
      ...bar,
      volume: [0, 2, 0, 2][index]!,
    }));
    expect(calculateVWAP(input)).toEqual([
      { time: input[1]!.time, value: 10 },
      { time: input[2]!.time, value: 10 },
      { time: input[3]!.time, value: 15 },
    ]);
    expect(calculateVWAP(bars([1, 2]).map((bar) => ({ ...bar, volume: 0 })))).toEqual([]);
  });

  it("uses exchange timestamps for session resets while retaining unique chart keys", () => {
    const boundary = Date.parse("2026-09-11T22:00:00Z") / 1000;
    const input = bars([10, 20, 40]).map((bar, index) => ({
      ...bar,
      high: bar.close,
      low: bar.close,
      volume: 1,
      time: boundary + index * 0.000_01,
      actualTime: index < 2 ? boundary - 0.001 : boundary,
    }));
    expect(calculateVWAP(input)).toEqual([
      { time: input[0]!.time, value: 10 },
      { time: input[1]!.time, value: 15 },
      { time: input[2]!.time, value: 40 },
    ]);
  });
  it("resets VWAP at the Chicago 17:00 session boundary, not midnight", () => {
    const input = [
      timed("2026-09-14T20:59:00Z", 10),
      timed("2026-09-14T22:00:00Z", 20),
      timed("2026-09-15T05:00:00Z", 30),
      timed("2026-09-15T22:00:00Z", 40),
    ];
    expect(values(calculateVWAP(input))).toEqual([10, 20, 25, 40]);
  });

  it.each([
    [
      "2026-03-06T21:00:00Z",
      "2026-03-08T22:00:00Z",
      "2026-03-09T14:00:00Z",
      "2026-03-09T22:00:00Z",
    ],
    [
      "2026-10-30T20:00:00Z",
      "2026-11-01T23:00:00Z",
      "2026-11-02T14:00:00Z",
      "2026-11-02T23:00:00Z",
    ],
  ])("keeps VWAP session anchoring across DST weekend starting %s", (...dates) => {
    const input = dates.map((date, index) => timed(date, (index + 1) * 10));
    expect(values(calculateVWAP(input))).toEqual([10, 20, 25, 40]);
  });

  it("never emits nonfinite indicator values for invalid input", () => {
    const input = [
      ...bars([1, NaN, Infinity, 4, 5, 6]),
      { ...bars([7])[0]!, time: NaN },
      { ...bars([8])[0]!, time: epoch + 420, volume: -1 },
      { ...bars([9])[0]!, time: epoch + 480, volume: Infinity },
    ];
    const weighted = calculateVWAP(input);
    expect(weighted.map((point) => point.time)).toEqual([
      epoch,
      epoch + 180,
      epoch + 240,
      epoch + 300,
    ]);
    for (const result of [
      weighted,
      calculateEMA(input, 2),
      calculateSMA(input, 2),
      calculateRSI(input, 2),
    ]) {
      expect(
        result.every((point) => Number.isFinite(point.time) && Number.isFinite(point.value)),
      ).toBe(true);
    }
  });

  it("emits VWAP bands from the first funded observation with volume-weighted population deviation", () => {
    const input = bars([10, 14]).map((bar, index) => ({
      ...bar,
      high: bar.close,
      low: bar.close,
      volume: index ? 3 : 1,
    }));
    const result = calculateVWAPBands(input);
    expect(result.middle.map((point) => point.value)).toEqual([10, 13]);
    for (const [index, band] of result.bands.entries()) {
      expect(band.upper[0]).toEqual({ time: input[0]!.time, value: 10 });
      expect(band.lower[0]).toEqual({ time: input[0]!.time, value: 10 });
      expect(band.upper[1]!.value).toBeCloseTo(13 + (index + 1) * Math.sqrt(3));
      expect(band.lower[1]!.value).toBeCloseTo(13 - (index + 1) * Math.sqrt(3));
    }
    const percentage = calculateVWAPBands(input, [2], "percentage");
    expect(percentage.bands[0]!.upper[1]!.value).toBeCloseTo(13.26);
    expect(percentage.bands[0]!.lower[1]!.value).toBeCloseTo(12.74);
  });

  it("keeps small VWAP dispersion precise at large price magnitudes", () => {
    const input = bars([1e9, 1e9 + 2]).map((bar) => ({
      ...bar,
      high: bar.close,
      low: bar.close,
      volume: 1,
    }));
    const result = calculateVWAPBands(input, [1]);
    expect(result.bands[0]!.upper.at(-1)!.value).toBeCloseTo(1e9 + 2);
    expect(result.bands[0]!.lower.at(-1)!.value).toBeCloseTo(1e9);
  });

  it("carries bands through zero volume and resets variance using actual session time", () => {
    const boundary = Date.parse("2026-09-11T22:00:00Z") / 1000;
    const input = bars([100, 10, 14, 999, 40]).map((bar, index) => ({
      ...bar,
      high: bar.close,
      low: bar.close,
      volume: [0, 1, 1, 0, 1][index]!,
      time: boundary + index * 0.00001,
      actualTime: index < 4 ? boundary - 0.001 : boundary,
    }));
    const result = calculateVWAPBands(input, [1]);
    expect(result.middle.map((p) => p.value)).toEqual([10, 12, 12, 40]);
    expect(result.bands[0]!.upper.map((p) => p.value)).toEqual([10, 14, 14, 40]);
    expect(result.bands[0]!.lower.map((p) => p.value)).toEqual([10, 10, 10, 40]);
    expect(result.bands[0]!.upper.map((p) => p.time)).toEqual(
      input.slice(1).map((bar) => bar.time),
    );
    expect(
      calculateVWAPBands(input.map((bar) => ({ ...bar, volume: 0 }))).bands.every(
        (band) => !band.upper.length && !band.lower.length,
      ),
    ).toBe(true);
  });

  it("preserves caller-owned candles", () => {
    const input = Object.freeze(bars([10, 13, 11, 15]).map((bar) => Object.freeze(bar)));
    expect(() => {
      calculateSMA(input, 2);
      calculateEMA(input, 2);
      calculateRSI(input, 2);
      calculateVWAP(input);
    }).not.toThrow();
    expect(input.map((bar) => bar.close)).toEqual([10, 13, 11, 15]);
  });
});
