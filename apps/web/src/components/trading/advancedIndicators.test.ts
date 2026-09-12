import { describe, expect, it } from "vite-plus/test";
import type { Candle, IndicatorPoint } from "./chartIndicators";
import {
  calculateADX,
  calculateATR,
  calculateBollingerBands,
  calculateCCI,
  calculateCMF,
  calculateKeltnerChannels,
  calculateROC,
  calculateStochasticRSI,
  calculateDonchian,
  calculateMACD,
  calculateOBV,
  calculateStochastic,
  calculateWilliamsR,
} from "./advancedIndicators";

const bars = (closes: number[]): Candle[] =>
  closes.map((close, index) => ({
    time: 1_700_000_000 + index * 60,
    open: close,
    high: close + 1,
    low: close - 1,
    close,
    volume: 10,
  }));
const values = (points: IndicatorPoint[]) => points.map((point) => point.value);
const near = (points: IndicatorPoint[], expected: number[]) => {
  expect(points).toHaveLength(expected.length);
  points.forEach((point, index) => expect(point.value).toBeCloseTo(expected[index]!, 10));
};
const flatten = (result: ReturnType<(typeof calculators)[number]>): IndicatorPoint[] =>
  Array.isArray(result) ? result : Object.values(result).flat();
const calculators = [
  (input: readonly Candle[]) => calculateBollingerBands(input, 3),
  (input: readonly Candle[]) => calculateMACD(input, 2, 3, 2),
  (input: readonly Candle[]) => calculateATR(input, 2),
  (input: readonly Candle[]) => calculateStochastic(input, 2, 2, 2),
  (input: readonly Candle[]) => calculateADX(input, 2, 2),
  calculateOBV,
  (input: readonly Candle[]) => calculateCMF(input, 3),
  (input: readonly Candle[]) => calculateKeltnerChannels(input, 3, 2),
  (input: readonly Candle[]) => calculateROC(input, 2),
  (input: readonly Candle[]) => calculateStochasticRSI(input, 2, 3, 2, 2),
  (input: readonly Candle[]) => calculateCCI(input, 3),
  (input: readonly Candle[]) => calculateWilliamsR(input, 3),
  (input: readonly Candle[]) => calculateDonchian(input, 3),
];

describe("common chart indicators", () => {
  it("calculates Stochastic RSI from RSI extrema before smoothing K and D", () => {
    const input = bars([1, 2, 1, 2, 1, 2, 1, 2]);
    const result = calculateStochasticRSI(input, 2, 3, 2, 2);
    near(result.k, [125 / 3, 125 / 3, 525 / 11]);
    near(result.d, [125 / 3, 1475 / 33]);
    expect(result.k[0]?.time).toBe(input[5]?.time);
    expect(result.d[0]?.time).toBe(input[6]?.time);
    expect(calculateStochasticRSI(bars([10, 10, 10, 10, 10, 10]), 2, 2, 1, 1)).toEqual({
      k: [],
      d: [],
    });
    const longer = bars(Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i)));
    expect(calculateStochasticRSI(longer).k[0]?.time).toBe(longer[29]?.time);
    expect(calculateStochasticRSI(longer).d[0]?.time).toBe(longer[31]?.time);
  });

  it("aligns Keltner EMA and ATR warmups and uses the configured multiplier", () => {
    const input = bars([10, 14, 13, 18]);
    const result = calculateKeltnerChannels(input, 3, 2, 2);
    near(result.middle, [37 / 3, 91 / 6]);
    near(result.upper, [107 / 6, 287 / 12]);
    near(result.lower, [41 / 6, 77 / 12]);
    expect(result.middle[0]?.time).toBe(input[2]?.time);
    expect(calculateKeltnerChannels(input, 2, 4).middle[0]?.time).toBe(input[3]?.time);
    const zeroWidth = calculateKeltnerChannels(input, 3, 2, 0);
    expect(zeroWidth.upper).toEqual(zeroWidth.lower);
    expect(zeroWidth.upper).toEqual(zeroWidth.middle);
  });

  it("weights CMF by volume rather than averaging range positions", () => {
    const input = bars([12, 8, 10, 11]).map((bar, index) => ({
      ...bar,
      high: 12,
      low: 8,
      volume: (index + 1) * 10,
    }));
    near(calculateCMF(input, 2), [-1 / 3, -0.4, 2 / 7]);
    expect(calculateCMF(input, 2)[0]?.time).toBe(input[1]?.time);
    const flat = input.map((bar) => ({ ...bar, high: bar.close, low: bar.close }));
    near(calculateCMF(flat, 2), [0, 0, 0]);
    expect(
      calculateCMF(
        input.map((bar) => ({ ...bar, volume: 0 })),
        2,
      ),
    ).toEqual([]);
    const invalidVolume = input.map((bar, index) => ({
      ...bar,
      volume: index === 1 ? -1 : bar.volume,
    }));
    expect(calculateCMF(invalidVolume, 2)).toEqual(calculateCMF(invalidVolume.slice(2), 2));
  });

  it("uses exactly N prior closes for ROC, skips zero denominators, and supports losses", () => {
    const input = bars([10, 20, 15, 30]);
    near(calculateROC(input, 2), [50, 50]);
    expect(calculateROC(input, 2)[0]?.time).toBe(input[2]?.time);
    near(calculateROC(bars([10, 5, 0, 10, 5]), 1), [-50, -100, -50]);
  });

  it("uses population deviation for Bollinger bands", () => {
    const input = bars([2, 4, 4, 4, 5, 5, 7, 9]);
    const bands = calculateBollingerBands(input, 8);
    near(bands.middle, [5]);
    near(bands.upper, [9]);
    near(bands.lower, [1]);
    expect(bands.middle[0]?.time).toBe(input[7]?.time);
    const flat = calculateBollingerBands(bars([10, 10, 10]), 3);
    expect(values(flat.upper)).toEqual([10]);
    expect(values(flat.lower)).toEqual([10]);
  });

  it("SMA-seeds fast, slow and signal EMAs before computing the MACD histogram", () => {
    const input = bars([1, 2, 3, 4, 8]);
    const result = calculateMACD(input, 2, 3, 2);
    near(result.macd, [0.5, 0.5, 1]);
    near(result.signal, [0.5, 5 / 6]);
    near(result.histogram, [0, 1 / 6]);
    expect(result.macd[0]?.time).toBe(input[2]?.time);
    expect(result.signal[0]?.time).toBe(input[3]?.time);
  });

  it("accounts for price gaps in true range and Wilder-smooths ATR", () => {
    near(calculateATR(bars([10, 14, 13, 18]), 3), [3, 4]);
    near(calculateATR(bars([10, 14, 13]), 1), [2, 5, 2]);
  });

  it("smooths stochastic K before its separate D average", () => {
    const input = bars([1, 2, 3, 2, 1, 2, 4]);
    const result = calculateStochastic(input, 3, 2, 2);
    near(result.k, [325 / 6, 175 / 6, 275 / 6, 220 / 3]);
    near(result.d, [125 / 3, 37.5, 715 / 12]);
    expect(result.k[0]?.time).toBe(input[3]?.time);
    expect(result.d[0]?.time).toBe(input[4]?.time);
  });

  it("computes directional movement and two-stage Wilder ADX including reversals", () => {
    const input = bars([10, 12, 11, 13, 10]);
    const result = calculateADX(input, 2, 2);
    near(result.plusDI, [40, 600 / 11, 200 / 9]);
    near(result.minusDI, [20, 100 / 11, 1300 / 27]);
    near(result.adx, [1100 / 21, (1100 / 21 + 700 / 19) / 2]);
    expect(result.plusDI[0]?.time).toBe(input[2]?.time);
    expect(result.adx[0]?.time).toBe(input[3]?.time);
  });

  it("treats tied directional moves as neither positive nor negative", () => {
    const input = bars([10, 10, 10, 10]).map((bar, i) => ({ ...bar, high: 11 + i, low: 9 - i }));
    const result = calculateADX(input, 2, 2);
    expect(values(result.plusDI)).toEqual([0, 0]);
    expect(values(result.minusDI)).toEqual([0, 0]);
    expect(values(result.adx)).toEqual([0]);
  });

  it("adds volume for up closes, subtracts down closes, and leaves equal closes unchanged", () => {
    const input = bars([10, 12, 12, 9, 11]).map((bar, i) => ({
      ...bar,
      volume: [50, 3, 5, 2, 7][i]!,
    }));
    expect(values(calculateOBV(input))).toEqual([0, 3, 3, 1, 8]);
  });

  it("uses HLC3 and mean absolute deviation for CCI", () => {
    near(calculateCCI(bars([1, 2, 3, 4]), 3), [100, 100]);
    near(calculateCCI(bars([4, 3, 2, 1]), 3), [-100, -100]);
    near(calculateCCI(bars([10, 10, 10]), 3), [0]);
    const flatFractional = bars(Array(20).fill(10.1));
    expect(values(calculateCCI(flatFractional))).toEqual([0]);
    expect(calculateBollingerBands(flatFractional).upper).toEqual(
      calculateBollingerBands(flatFractional).lower,
    );
  });

  it("computes Williams percent R and inclusive rolling Donchian extrema", () => {
    const input = bars([1, 2, 3, 2]);
    near(calculateWilliamsR(input, 3), [-25, -200 / 3]);
    const result = calculateDonchian(input, 3);
    expect(values(result.upper)).toEqual([4, 4]);
    expect(values(result.lower)).toEqual([0, 1]);
    expect(values(result.middle)).toEqual([2, 2.5]);
  });

  it("does not invent range-position readings when every price is identical", () => {
    const input = bars([10, 10, 10, 10]).map((bar) => ({ ...bar, high: 10, low: 10 }));
    expect(calculateStochastic(input, 2, 1, 1)).toEqual({ k: [], d: [] });
    expect(calculateWilliamsR(input, 2)).toEqual([]);
    near(calculateATR(input, 2), [0, 0, 0]);
    near(calculateADX(input, 2, 2).adx, [0]);
  });

  it("waits for full default warmups instead of plotting partial estimates", () => {
    const input = bars(Array.from({ length: 60 }, (_, i) => i + 100));
    const firstTime = (points: IndicatorPoint[], index: number) =>
      expect(points[0]?.time).toBe(input[index]?.time);
    firstTime(calculateBollingerBands(input).middle, 19);
    firstTime(calculateMACD(input).macd, 25);
    firstTime(calculateMACD(input).signal, 33);
    firstTime(calculateATR(input), 13);
    firstTime(calculateStochastic(input).k, 15);
    firstTime(calculateStochastic(input).d, 17);
    firstTime(calculateADX(input).plusDI, 14);
    firstTime(calculateADX(input).adx, 27);
    firstTime(calculateCCI(input), 19);
    firstTime(calculateWilliamsR(input), 13);
    firstTime(calculateDonchian(input).middle, 19);
  });

  it("rejects invalid periods and parameters", () => {
    const input = bars([1, 2, 3, 4]);
    for (const period of [0, -1, 1.5, NaN, Infinity]) {
      expect(flatten(calculateBollingerBands(input, period))).toEqual([]);
      expect(flatten(calculateMACD(input, 1, 2, period))).toEqual([]);
      expect(calculateATR(input, period)).toEqual([]);
      expect(flatten(calculateStochastic(input, period))).toEqual([]);
      expect(flatten(calculateADX(input, period))).toEqual([]);
      expect(calculateCMF(input, period)).toEqual([]);
      expect(calculateROC(input, period)).toEqual([]);
      expect(flatten(calculateKeltnerChannels(input, period))).toEqual([]);
      expect(flatten(calculateKeltnerChannels(input, 2, period))).toEqual([]);
      expect(flatten(calculateStochasticRSI(input, period))).toEqual([]);
      expect(flatten(calculateStochasticRSI(input, 2, period))).toEqual([]);
      expect(flatten(calculateStochasticRSI(input, 2, 2, period))).toEqual([]);
      expect(flatten(calculateStochasticRSI(input, 2, 2, 2, period))).toEqual([]);
      expect(calculateCCI(input, period)).toEqual([]);
      expect(calculateWilliamsR(input, period)).toEqual([]);
      expect(flatten(calculateDonchian(input, period))).toEqual([]);
    }
    expect(flatten(calculateMACD(input, 3, 2))).toEqual([]);
    for (const multiplier of [-1, NaN, Infinity])
      expect(flatten(calculateKeltnerChannels(input, 2, 2, multiplier))).toEqual([]);
    expect(flatten(calculateBollingerBands(input, 2, -1))).toEqual([]);
    expect(flatten(calculateBollingerBands(input, 2, Infinity))).toEqual([]);
  });

  it("restarts each calculation after missing prices without bridging the gap", () => {
    const input = bars([2, 3, 4, NaN, 10, 12, 11, 13, 14, 12, 15]);
    const restart = input.slice(4);
    for (const calculate of calculators) {
      expect(flatten(calculate(input)).filter((point) => point.time >= restart[0]!.time)).toEqual(
        flatten(calculate(restart)),
      );
    }
  });

  it("restarts OBV on invalid volume and never emits nonfinite values", () => {
    const input = bars([1, 2, 3, 4, 5]).map((bar, i) => ({ ...bar, volume: i === 2 ? -1 : 10 }));
    expect(values(calculateOBV(input))).toEqual([0, 10, 0, 10]);
    for (const calculate of calculators) {
      expect(
        flatten(calculate(bars([1, Infinity, 2, NaN, 3, 4, 5, 6, 7]))).every(
          (point) => Number.isFinite(point.value) && Number.isFinite(point.time),
        ),
      ).toBe(true);
    }
  });

  it("never uses future candles or mutates the caller's history", () => {
    const input = Object.freeze(
      bars([10, 13, 11, 15, 18, 16, 17, 14]).map((bar) => Object.freeze(bar)),
    );
    const future = { ...bars([1000])[0]!, time: input.at(-1)!.time + 60 };
    for (const calculate of calculators) {
      const before = flatten(calculate(input));
      const after = flatten(calculate([...input, future])).filter(
        (point) => point.time < future.time,
      );
      expect(after).toEqual(before);
    }
  });
});
