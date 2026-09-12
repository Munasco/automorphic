import { describe, expect, it } from "vite-plus/test";
import {
  calculateEMA,
  calculateRSI,
  calculateSMA,
  calculateVWAP,
  type Candle,
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

  it("uses Wilder smoothing of gains and losses for RSI", () => {
    const input = bars([10, 12, 11, 14, 13, 13, 15]);
    const result = calculateRSI(input, 3);
    expect(result[0]?.time).toBe(input[3]?.time);
    const expected = [(100 * 5) / 6, (100 * 2) / 3, (100 * 2) / 3, (100 * 94) / 114];
    values(result).forEach((value, index) => expect(value).toBeCloseTo(expected[index]!, 10));
    expect(calculateRSI(input.slice(0, 3), 3)).toEqual([]);
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
