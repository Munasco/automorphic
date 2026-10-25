import { describe, expect, it } from "vite-plus/test";
import {
  PRICE_SOURCES,
  type PriceSource,
  type Candle,
  type IndicatorPoint,
} from "./chartIndicators";
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
const stochasticSourceBars = () =>
  bars([12, 10, 12, 11, 16, 9, 14, 12]).map((bar, index) => ({
    ...bar,
    open: [10, 12, 11, 14, 13, 12, 10, 15][index]!,
    high: [15, 16, 14, 18, 17, 15, 16, 18][index]!,
    low: [5, 8, 7, 9, 6, 7, 8, 9][index]!,
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

  it.each([
    {
      source: "close",
      k: [50, 65000 / 2079, 13295098 / 234927],
      d: [84475 / 2079, 10320049 / 234927],
      first: 5,
    },
    { source: "open", k: [0, 0, 50], d: [0, 25], first: 5 },
    {
      source: "high",
      k: [55 / 2, 5500 / 141, 12550 / 141],
      d: [18755 / 564, 9025 / 141],
      first: 5,
    },
    { source: "low", k: [2600 / 147, 9950 / 147, 100], d: [6275 / 147, 12325 / 147], first: 5 },
    { source: "hl2", k: [0, 50, 100], d: [25, 75], first: 5 },
    {
      source: "hlc3",
      k: [50, 193375 / 6176, 502175 / 6176],
      d: [502175 / 12352, 347775 / 6176],
      first: 5,
    },
    { source: "ohlc4", k: [50, 20350 / 783, 59500 / 783], d: [29750 / 783, 39925 / 783], first: 5 },
  ] as const)(
    "calculates stochastic RSI K/D from $source's distinct trajectory",
    ({ source, k, d, first }) => {
      const input = stochasticSourceBars();
      const original = structuredClone(input);
      const result = calculateStochasticRSI(input, 2, 3, 2, 2, source);
      near(result.k, [...k]);
      near(result.d, [...d]);
      expect(result.k.map((point) => point.time)).toEqual(
        input.slice(first).map((bar) => bar.time),
      );
      expect(result.d.map((point) => point.time)).toEqual(
        input.slice(first + 1).map((bar) => bar.time),
      );
      if (source === "close") expect(calculateStochasticRSI(input, 2, 3, 2, 2)).toEqual(result);
      expect(input).toEqual(original);
    },
  );

  it.each([
    { source: "close", used: "close", unused: "open" },
    { source: "open", used: "open", unused: "close" },
    { source: "high", used: "high", unused: "low" },
    { source: "low", used: "low", unused: "high" },
    { source: "hl2", used: "low", unused: "close" },
    { source: "hlc3", used: "high", unused: "open" },
    { source: "ohlc4", used: "open", unused: "volume" },
  ] as const)(
    "restarts all stochastic RSI warmups for invalid $source data but ignores unused $unused",
    ({ source, used, unused }) => {
      const before = stochasticSourceBars();
      const after = stochasticSourceBars().map((bar) => ({ ...bar, time: bar.time + 9 * 60 }));
      for (const patch of [
        { [used]: NaN },
        { [used]: Infinity },
        { [used]: undefined },
        { time: NaN },
      ]) {
        const invalid = { ...before[0]!, time: before[0]!.time + 8 * 60, ...patch };
        const result = calculateStochasticRSI([...before, invalid, ...after], 2, 3, 2, 2, source);
        const first = calculateStochasticRSI(before, 2, 3, 2, 2, source);
        const second = calculateStochasticRSI(after, 2, 3, 2, 2, source);
        expect(result).toEqual({ k: [...first.k, ...second.k], d: [...first.d, ...second.d] });
      }
      const incomplete = before.map((bar) => ({ ...bar, [unused]: NaN }));
      expect(calculateStochasticRSI(incomplete, 2, 3, 2, 2, source)).toEqual(
        calculateStochasticRSI(before, 2, 3, 2, 2, source),
      );
    },
  );

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

  it.each([
    { source: "close", middle: [12, 22], width: [8, 12] },
    { source: "open", middle: [6, 14], width: [4, 12] },
    { source: "high", middle: [18, 30], width: [12, 12] },
    { source: "low", middle: [2, 8], width: [4, 8] },
    { source: "hl2", middle: [10, 19], width: [8, 10] },
    { source: "hlc3", middle: [32 / 3, 20], width: [8, 32 / 3] },
    { source: "ohlc4", middle: [9.5, 18.5], width: [7, 11] },
  ] as const)(
    "uses $source for both the Bollinger mean and population spread",
    ({ source, middle, width }) => {
      const input = bars([8, 16, 28]).map((bar, index) => ({
        ...bar,
        open: [4, 8, 20][index]!,
        high: [12, 24, 36][index]!,
        low: [0, 4, 12][index]!,
      }));
      const original = structuredClone(input);
      const result = calculateBollingerBands(input, 2, 2, source);
      expect(result.middle.map((point) => point.time)).toEqual(
        input.slice(1).map((bar) => bar.time),
      );
      near(result.middle, [...middle]);
      near(
        result.upper,
        middle.map((value, index) => value + width[index]!),
      );
      near(
        result.lower,
        middle.map((value, index) => value - width[index]!),
      );
      if (source === "close") expect(calculateBollingerBands(input, 2, 2)).toEqual(result);
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
  ] as const)(
    "restarts Bollinger $source warmup after an invalid selected component",
    ({ source, field }) => {
      for (const invalid of [undefined, NaN, Infinity, -Infinity]) {
        const input = bars([1, 2, 3, 4, 5, 6]).map((bar) => ({
          ...bar,
          high: bar.close,
          low: bar.close,
        }));
        Object.assign(input[2]!, { [field]: invalid });
        const result = calculateBollingerBands(input, 2, 2, source);
        expect(result.middle.map((point) => point.time)).toEqual([
          input[1]!.time,
          input[4]!.time,
          input[5]!.time,
        ]);
        near(result.middle, [1.5, 4.5, 5.5]);
        near(result.upper, [2.5, 5.5, 6.5]);
        near(result.lower, [0.5, 3.5, 4.5]);
      }
    },
  );

  it.each([
    { source: "close", field: "open" },
    { source: "open", field: "close" },
    { source: "high", field: "low" },
    { source: "low", field: "high" },
    { source: "hl2", field: "close" },
    { source: "hlc3", field: "open" },
    { source: "ohlc4", field: "volume" },
  ] as const)(
    "ignores unused $field when computing $source Bollinger bands",
    ({ source, field }) => {
      const input = bars([1, 3, 2, 5]).map((bar) => ({ ...bar, [field]: NaN }));
      expect(calculateBollingerBands(input, 2, 2, source)).toEqual(
        calculateBollingerBands(bars([1, 3, 2, 5]), 2, 2, source),
      );
    },
  );

  it("restarts selected-source Bollinger windows after invalid chart times", () => {
    const input = bars([1, 2, 3, 4, 5]);
    input[2]!.time = NaN;
    const result = calculateBollingerBands(input, 2, 2, "open");
    expect(result.middle).toEqual([
      { time: input[1]!.time, value: 1.5 },
      { time: input[4]!.time, value: 4.5 },
    ]);
    near(result.upper, [2.5, 5.5]);
    near(result.lower, [0.5, 3.5]);
  });

  it.each([
    {
      oscillatorMA: "ema",
      signalMA: "ema",
      macd: [-1 / 6, 13 / 18, -1 / 27, 275 / 324, 91 / 1944],
      signal: [5 / 18, 11 / 162, 143 / 243, 221 / 972],
      histogram: [4 / 9, -17 / 162, 253 / 972, -13 / 72],
    },
    {
      oscillatorMA: "ema",
      signalMA: "sma",
      macd: [-1 / 6, 13 / 18, -1 / 27, 275 / 324, 91 / 1944],
      signal: [5 / 18, 37 / 108, 263 / 648, 1741 / 3888],
      histogram: [4 / 9, -41 / 108, 287 / 648, -1559 / 3888],
    },
    {
      oscillatorMA: "sma",
      signalMA: "ema",
      macd: [2 / 3, 1 / 6, 1, -1 / 3, 4 / 3],
      signal: [5 / 12, 29 / 36, 5 / 108, 293 / 324],
      histogram: [-1 / 4, 7 / 36, -41 / 108, 139 / 324],
    },
    {
      oscillatorMA: "sma",
      signalMA: "sma",
      macd: [2 / 3, 1 / 6, 1, -1 / 3, 4 / 3],
      signal: [5 / 12, 7 / 12, 1 / 3, 1 / 2],
      histogram: [-1 / 4, 5 / 12, -2 / 3, 5 / 6],
    },
  ] as const)(
    "calculates $oscillatorMA MACD with a $signalMA signal on nonlinear prices",
    ({ oscillatorMA, signalMA, macd, signal, histogram }) => {
      const input = bars([2, 5, 3, 8, 4, 10, 6]);
      const original = structuredClone(input);
      const result = calculateMACD(input, 2, 3, 2, { oscillatorMA, signalMA });
      near(result.macd, [...macd]);
      near(result.signal, [...signal]);
      near(result.histogram, [...histogram]);
      expect(result.macd.map((point) => point.time)).toEqual(input.slice(2).map((bar) => bar.time));
      expect(result.signal.map((point) => point.time)).toEqual(
        input.slice(3).map((bar) => bar.time),
      );
      expect(result.histogram.map((point) => point.time)).toEqual(
        result.signal.map((point) => point.time),
      );
      if (oscillatorMA === "ema" && signalMA === "ema") {
        expect(calculateMACD(input, 2, 3, 2)).toEqual(result);
        expect(calculateMACD(input, 2, 3, 2, {})).toEqual(result);
        expect(calculateMACD(input, 2, 3, 2, { source: "close", oscillatorMA, signalMA })).toEqual(
          result,
        );
      }
      expect(input).toEqual(original);
    },
  );

  it.each([
    { source: "close", prices: [12, 10, 13, 11, 16] },
    { source: "open", prices: [10, 12, 11, 14, 13] },
    { source: "high", prices: [15, 16, 14, 18, 17] },
    { source: "low", prices: [5, 8, 7, 9, 6] },
    { source: "hl2", prices: [10, 12, 10.5, 13.5, 11.5] },
    { source: "hlc3", prices: [32 / 3, 34 / 3, 34 / 3, 38 / 3, 13] },
    { source: "ohlc4", prices: [10.5, 11.5, 11.25, 13, 13] },
  ] as const)("routes $source into both fast and slow MACD averages", ({ source, prices }) => {
    const input = bars([12, 10, 13, 11, 16]).map((bar, index) => ({
      ...bar,
      open: [10, 12, 11, 14, 13][index]!,
      high: [15, 16, 14, 18, 17][index]!,
      low: [5, 8, 7, 9, 6][index]!,
    }));
    for (const oscillatorMA of ["ema", "sma"] as const) {
      const options = { oscillatorMA, signalMA: "sma" as const };
      const actual = calculateMACD(input, 2, 3, 2, { ...options, source });
      const expected = calculateMACD(bars([...prices]), 2, 3, 2, options);
      for (const key of ["macd", "signal", "histogram"] as const) {
        expect(actual[key].map((point) => point.time)).toEqual(
          expected[key].map((point) => point.time),
        );
        near(actual[key], values(expected[key]));
      }
    }
  });

  it.each([
    { oscillatorMA: "ema", signalMA: "ema" },
    { oscillatorMA: "ema", signalMA: "sma" },
    { oscillatorMA: "sma", signalMA: "ema" },
    { oscillatorMA: "sma", signalMA: "sma" },
  ] as const)(
    "restarts $oscillatorMA/$signalMA MACD after missing selected prices or times",
    (modes) => {
      for (const missing of ["open", "time"] as const) {
        const input = bars([2, 5, 3, 8, 9, 4, 10, 6, 8, 2]);
        input[4]![missing] = NaN;
        const options = { ...modes, source: "open" as const };
        const result = calculateMACD(input, 2, 3, 2, options);
        const before = calculateMACD(input.slice(0, 4), 2, 3, 2, options);
        const after = calculateMACD(input.slice(5), 2, 3, 2, options);
        expect(result.macd.map((point) => point.time)).toEqual([
          input[2]!.time,
          input[3]!.time,
          input[7]!.time,
          input[8]!.time,
          input[9]!.time,
        ]);
        expect(result.signal.map((point) => point.time)).toEqual([
          input[3]!.time,
          input[8]!.time,
          input[9]!.time,
        ]);
        for (const key of ["macd", "signal", "histogram"] as const)
          expect(result[key]).toEqual([...before[key], ...after[key]]);
      }
      const complete = bars([2, 5, 3, 8, 4, 10, 6]);
      const unusedMissing = complete.map((bar) => ({ ...bar, close: NaN }));
      expect(calculateMACD(unusedMissing, 2, 3, 2, { ...modes, source: "open" })).toEqual(
        calculateMACD(complete, 2, 3, 2, { ...modes, source: "open" }),
      );
    },
  );

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

  it.each([
    { smoothing: "rma", expected: [3, 4, 16 / 3, 50 / 9] },
    { smoothing: "sma", expected: [3, 13 / 3, 16 / 3, 20 / 3] },
    { smoothing: "ema", expected: [3, 4.5, 6.25, 49 / 8] },
    { smoothing: "wma", expected: [3, 4.5, 19 / 3, 20 / 3] },
  ] as const)("smooths gapped true ranges with ATR $smoothing", ({ smoothing, expected }) => {
    // Intrabar ranges are all 2; previous closes expand true range to [2, 5, 2, 6, 8, 6].
    const input = bars([10, 14, 13, 18, 11, 16]);
    const original = structuredClone(input);
    const result = calculateATR(input, 3, smoothing);
    near(result, [...expected]);
    expect(result.map((point) => point.time)).toEqual(input.slice(2).map((bar) => bar.time));
    near(calculateATR(input, 1, smoothing), [2, 5, 2, 6, 8, 6]);
    expect(calculateATR(input.slice(0, 2), 3, smoothing)).toEqual([]);
    if (smoothing === "rma") expect(calculateATR(input, 3)).toEqual(result);
    expect(input).toEqual(original);
  });

  it.each(["rma", "sma", "ema", "wma"] as const)(
    "restarts ATR %s range history and warmup after invalid bars",
    (smoothing) => {
      for (const patch of [
        { high: NaN },
        { low: Infinity },
        { time: NaN },
        { close: 2000 },
        { high: 0 },
      ]) {
        const input = bars([10, 14, 13, 18, 999, 11, 16, 14, 18, 13]);
        Object.assign(input[4]!, patch);
        const result = calculateATR(input, 3, smoothing);
        expect(result.map((point) => point.time)).toEqual([
          input[2]!.time,
          input[3]!.time,
          input[7]!.time,
          input[8]!.time,
          input[9]!.time,
        ]);
        expect(result).toEqual([
          ...calculateATR(input.slice(0, 4), 3, smoothing),
          ...calculateATR(input.slice(5), 3, smoothing),
        ]);
        expect(calculateATR(input.slice(5), 1, smoothing)[0]).toEqual({
          time: input[5]!.time,
          value: 2,
        });
        expect(result.every((point) => Number.isFinite(point.value))).toBe(true);
      }
      const input = bars([10, 14, 13, 18]).map((bar) => ({ ...bar, open: NaN, volume: NaN }));
      expect(calculateATR(input, 3, smoothing)).toEqual(
        calculateATR(bars([10, 14, 13, 18]), 3, smoothing),
      );
      for (const period of [0, -1, 1.5, NaN, Infinity])
        expect(calculateATR(input, period, smoothing)).toEqual([]);
    },
  );

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

describe("Bollinger Bands basis moving average", () => {
  const basisTypes = ["sma", "ema", "rma", "wma", "vwma"] as const;
  const input = () =>
    bars([2, 4, 8, 6, 10]).map((bar, index) => ({
      ...bar,
      volume: [1, 2, 1, 4, 2][index]!,
    }));

  it.each([
    { basis: "sma", centers: [14 / 3, 6, 8] },
    { basis: "ema", centers: [14 / 3, 16 / 3, 23 / 3] },
    { basis: "rma", centers: [14 / 3, 46 / 9, 182 / 27] },
    { basis: "wma", centers: [17 / 3, 19 / 3, 25 / 3] },
    { basis: "vwma", centers: [4.5, 40 / 7, 52 / 7] },
  ] as const)(
    "centers $basis bands on its average while keeping the unweighted population spread",
    ({ basis, centers }) => {
      const result = calculateBollingerBands(input(), 3, 2, "close", basis);
      const widths = [2 * Math.sqrt(56 / 9), 2 * Math.sqrt(8 / 3), 2 * Math.sqrt(8 / 3)];
      near(result.middle, [...centers]);
      near(
        result.upper,
        centers.map((center, index) => center + widths[index]!),
      );
      near(
        result.lower,
        centers.map((center, index) => center - widths[index]!),
      );
      expect(result.middle.map((point) => point.time)).toEqual(
        input()
          .slice(2)
          .map((bar) => bar.time),
      );
      if (basis === "sma") expect(result).toEqual(calculateBollingerBands(input(), 3, 2, "close"));
    },
  );

  it.each(basisTypes)("uses the selected source in both %s basis and spread", (basis) => {
    const original = input();
    const selected = original.map((bar) => ({ ...bar, open: bar.close * 2 }));
    const result = calculateBollingerBands(selected, 3, 2, "open", basis);
    const close = calculateBollingerBands(original, 3, 2, "close", basis);
    near(
      result.middle,
      values(close.middle).map((value) => value * 2),
    );
    near(
      result.upper,
      values(close.upper).map((value) => value * 2),
    );
    near(
      result.lower,
      values(close.lower).map((value) => value * 2),
    );
    expect(calculateBollingerBands(selected, 3, 2, "close", basis)).toEqual(close);
  });

  it.each(basisTypes)("restarts %s basis and variance after a selected-price gap", (basis) => {
    const source = bars([2, 4, 8, 99, 10, 12, 14, 18]);
    source[3]!.close = NaN;
    const result = calculateBollingerBands(source, 3, 2, "close", basis);
    const before = calculateBollingerBands(source.slice(0, 3), 3, 2, "close", basis);
    const after = calculateBollingerBands(source.slice(4), 3, 2, "close", basis);
    expect(result).toEqual({
      middle: [...before.middle, ...after.middle],
      upper: [...before.upper, ...after.upper],
      lower: [...before.lower, ...after.lower],
    });
  });

  it("requires valid nonnegative volume only for VWMA and restarts its warmup after invalid volume", () => {
    for (const volume of [NaN, Infinity, -1]) {
      const source = bars([2, 4, 8, 6, 10, 12, 14]);
      const changed = source.map((bar, index) => (index === 3 ? { ...bar, volume } : bar));
      for (const basis of ["sma", "ema", "rma", "wma"] as const)
        expect(calculateBollingerBands(changed, 3, 2, "close", basis)).toEqual(
          calculateBollingerBands(source, 3, 2, "close", basis),
        );
      expect(
        calculateBollingerBands(changed, 3, 2, "close", "vwma").middle.map((point) => point.time),
      ).toEqual([source[2]!.time, source[6]!.time]);
    }
  });

  it("omits VWMA zero-volume windows and resumes as soon as a weighted bar enters the window", () => {
    const source = bars([2, 4, 8, 6, 10, 12, 14]).map((bar, index) => ({
      ...bar,
      volume: index === 3 ? 10 : 0,
    }));
    const result = calculateBollingerBands(source, 3, 2, "close", "vwma");
    expect(result.middle).toEqual(source.slice(3, 6).map((bar) => ({ time: bar.time, value: 6 })));
    expect(result.upper).toHaveLength(3);
    expect(result.lower).toHaveLength(3);
    expect(
      calculateBollingerBands(
        source.map((bar) => ({ ...bar, volume: 0 })),
        3,
        2,
        "close",
        "vwma",
      ),
    ).toEqual({ middle: [], upper: [], lower: [] });
  });

  it.each(basisTypes)(
    "preserves %s prefix values and updates the revised last candle without mutating input",
    (basis) => {
      const source = input();
      const snapshot = structuredClone(source);
      const full = calculateBollingerBands(source, 3, 2, "close", basis);
      for (let end = 1; end <= source.length; end++) {
        const prefix = calculateBollingerBands(source.slice(0, end), 3, 2, "close", basis);
        for (const key of ["middle", "upper", "lower"] as const)
          expect(prefix[key]).toEqual(full[key].slice(0, Math.max(0, end - 2)));
      }
      const revised = [...source.slice(0, -1), { ...source.at(-1)!, close: 20, volume: 20 }];
      const changed = calculateBollingerBands(revised, 3, 2, "close", basis);
      for (const key of ["middle", "upper", "lower"] as const) {
        expect(changed[key].slice(0, -1)).toEqual(full[key].slice(0, -1));
        expect(changed[key].at(-1)!.value).not.toBe(full[key].at(-1)!.value);
      }
      expect(calculateBollingerBands(source, 3, 2, "close", basis)).toEqual(full);
      expect(source).toEqual(snapshot);
    },
  );

  it.each(basisTypes)(
    "keeps %s flat fractional bands exactly zero-width and supports period one",
    (basis) => {
      const source = bars(Array.from({ length: 30 }, () => 1.1));
      const flat = calculateBollingerBands(source, 20, 2, "close", basis);
      expect(flat.upper).toEqual(flat.middle);
      expect(flat.lower).toEqual(flat.middle);
      const one = calculateBollingerBands(input(), 1, 2, "close", basis);
      expect(one.middle).toEqual(input().map((bar) => ({ time: bar.time, value: bar.close })));
      expect(one.upper).toEqual(one.middle);
      expect(one.lower).toEqual(one.middle);
    },
  );

  it("computes VWMA without overflowing finite volume sums or source-volume products", () => {
    const source = bars([1e12, 1e12 + 2, 1e12 + 4]).map((bar) => ({ ...bar, volume: 1e308 }));
    const result = calculateBollingerBands(source, 3, 2, "close", "vwma");
    const sma = calculateBollingerBands(source, 3, 2);
    expect(result).toEqual(sma);
    expect(result.middle[0]!.value).toBe(1e12 + 2);
  });
});

describe("ROC price sources", () => {
  const input = () =>
    bars([20, 10, 30, 40]).map((bar, index) => ({
      ...bar,
      open: [10, 20, 25, 10][index]!,
      high: [30, 40, 50, 60][index]!,
      low: [0, 5, 10, 20][index]!,
    }));
  const expected: Record<PriceSource, number[]> = {
    close: [50, 300],
    open: [150, -50],
    high: [200 / 3, 50],
    low: [300],
    hl2: [100, 700 / 9],
    hlc3: [80, 1300 / 11],
    ohlc4: [275 / 3, 220 / 3],
  };
  const required: Record<PriceSource, (keyof Pick<Candle, "open" | "high" | "low" | "close">)[]> = {
    close: ["close"],
    open: ["open"],
    high: ["high"],
    low: ["low"],
    hl2: ["high", "low"],
    hlc3: ["high", "low", "close"],
    ohlc4: ["open", "high", "low", "close"],
  };

  it.each(PRICE_SOURCES)("calculates hand-computed %s changes exactly two bars apart", (source) => {
    const result = calculateROC(input(), 2, source);
    near(result, expected[source]);
    expect(result.map((point) => point.time)).toEqual(
      input()
        .slice(source === "low" ? 3 : 2)
        .map((bar) => bar.time),
    );
  });

  it("preserves default close behavior and the default nine-bar lookback", () => {
    expect(calculateROC(input(), 2)).toEqual(calculateROC(input(), 2, "close"));
    const source = bars([10, 9, 8, 7, 6, 5, 4, 3, 2, 15, 18]);
    near(calculateROC(source), [50, 100]);
    expect(calculateROC(source)[0]!.time).toBe(source[9]!.time);
  });

  it.each(PRICE_SOURCES)(
    "restarts %s warmup on invalid required inputs or time, ignoring unused fields",
    (source) => {
      const clean = bars([10, 20, 30, 40, 50, 60, 70]);
      for (const field of [...required[source], "time"] as const) {
        for (const invalid of [NaN, Infinity, undefined]) {
          const broken = clean.map((bar, index) =>
            index === 3 ? ({ ...bar, [field]: invalid } as Candle) : bar,
          );
          expect(calculateROC(broken, 2, source)).toEqual([
            ...calculateROC(clean.slice(0, 3), 2, source),
            ...calculateROC(clean.slice(4), 2, source),
          ]);
        }
      }
      const unused = (["open", "high", "low", "close"] as const).filter(
        (field) => !required[source].includes(field),
      );
      const poisoned = clean.map((bar) => ({
        ...bar,
        volume: NaN,
        ...Object.fromEntries(unused.map((field) => [field, NaN])),
      }));
      expect(calculateROC(poisoned, 2, source)).toEqual(calculateROC(clean, 2, source));
    },
  );

  it("omits zero baselines without moving the lookback or treating elapsed time as bar count", () => {
    const source = bars([0, 10, 20, 0, 40, 50]).map((bar, index) => ({
      ...bar,
      time: bar.time + index * index * 1000,
    }));
    expect(calculateROC(source, 2)).toEqual([
      { time: source[3]!.time, value: -100 },
      { time: source[4]!.time, value: 100 },
    ]);
    near(calculateROC(bars([0, 10, 20, 0, 40, 50]), 1), [100, -100, 25]);
  });

  it("retains representable changes when subtraction overflows and omits unrepresentable results", () => {
    near(
      calculateROC(bars([Number.MAX_VALUE, -Number.MAX_VALUE, Number.MAX_VALUE]), 1),
      [-200, -200],
    );
    expect(calculateROC(bars([Number.MIN_VALUE, Number.MAX_VALUE]), 1)).toEqual([]);
  });

  it.each(PRICE_SOURCES)(
    "recalculates %s current-bar revisions without changing prior results or input",
    (source) => {
      const candles = input();
      const original = structuredClone(candles);
      const full = calculateROC(candles, 2, source);
      expect(calculateROC(candles.slice(0, -1), 2, source)).toEqual(full.slice(0, -1));
      const revised = [
        ...candles.slice(0, -1),
        { ...candles.at(-1)!, open: 100, high: 120, low: 80, close: 110 },
      ];
      const result = calculateROC(revised, 2, source);
      expect(result.slice(0, -1)).toEqual(full.slice(0, -1));
      expect(result.at(-1)!.value).not.toBe(full.at(-1)!.value);
      expect(candles).toEqual(original);
      expect(calculateROC(candles, 2, source)).toEqual(full);
    },
  );

  it("rejects invalid periods and insufficient history for any source", () => {
    for (const source of PRICE_SOURCES) {
      for (const period of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
        expect(calculateROC(input(), period, source)).toEqual([]);
      expect(calculateROC(input(), 4, source)).toEqual([]);
      expect(calculateROC([], 1, source)).toEqual([]);
    }
  });
});

describe("CCI price sources", () => {
  const input = () =>
    bars([20, 10, 30, 40]).map((bar, index) => ({
      ...bar,
      open: [10, 20, 25, 10][index]!,
      high: [30, 40, 50, 60][index]!,
      low: [0, 5, 10, 20][index]!,
    }));
  // Three-bar windows, mean absolute deviation, and Lambert's 0.015 divisor.
  const expected: Record<PriceSource, number[]> = {
    close: [100, 80],
    open: [80, -100],
    high: [100, 100],
    low: [100, 100],
    hl2: [100, 100],
    hlc3: [100, 95],
    ohlc4: [100, 1400 / 19],
  };
  const required: Record<PriceSource, (keyof Pick<Candle, "open" | "high" | "low" | "close">)[]> = {
    close: ["close"],
    open: ["open"],
    high: ["high"],
    low: ["low"],
    hl2: ["high", "low"],
    hlc3: ["high", "low", "close"],
    ohlc4: ["open", "high", "low", "close"],
  };

  it.each(PRICE_SOURCES)("calculates hand-computed %s windows", (source) => {
    const result = calculateCCI(input(), 3, source);
    near(result, expected[source]);
    expect(result.map((point) => point.time)).toEqual(
      input()
        .slice(2)
        .map((bar) => bar.time),
    );
  });

  it("keeps HLC3 as the default source and twenty bars as the default window", () => {
    expect(calculateCCI(input(), 3)).toEqual(calculateCCI(input(), 3, "hlc3"));
    const candles = bars(Array.from({ length: 21 }, (_, index) => index + 1));
    near(calculateCCI(candles), [380 / 3, 380 / 3]);
    expect(calculateCCI(candles)[0]!.time).toBe(candles[19]!.time);
  });

  it.each(PRICE_SOURCES)(
    "restarts %s warmup after invalid selected fields or time, without requiring unused fields",
    (source) => {
      const clean = bars([10, 20, 30, 40, 50, 60, 70]);
      for (const field of [...required[source], "time"] as const) {
        for (const invalid of [NaN, Infinity, undefined]) {
          const broken = clean.map((bar, index) =>
            index === 3 ? ({ ...bar, [field]: invalid } as Candle) : bar,
          );
          expect(calculateCCI(broken, 3, source)).toEqual([
            ...calculateCCI(clean.slice(0, 3), 3, source),
            ...calculateCCI(clean.slice(4), 3, source),
          ]);
        }
      }
      const unused = (["open", "high", "low", "close"] as const).filter(
        (field) => !required[source].includes(field),
      );
      const poisoned = clean.map((bar) => ({
        ...bar,
        volume: NaN,
        ...Object.fromEntries(unused.map((field) => [field, NaN])),
      }));
      expect(calculateCCI(poisoned, 3, source)).toEqual(calculateCCI(clean, 3, source));
    },
  );

  it.each(PRICE_SOURCES)("returns zero for flat %s prices and period one", (source) => {
    const flat = bars([1.1, 1.1, 1.1, 1.1]);
    expect(values(calculateCCI(flat, 3, source))).toEqual([0, 0]);
    expect(values(calculateCCI(input(), 1, source))).toEqual([0, 0, 0, 0]);
  });

  it.each(PRICE_SOURCES)(
    "recalculates %s revisions without changing earlier windows or input",
    (source) => {
      const candles = input();
      const snapshot = structuredClone(candles);
      const full = calculateCCI(candles, 3, source);
      expect(calculateCCI(candles.slice(0, -1), 3, source)).toEqual(full.slice(0, -1));
      const revised = [
        ...candles.slice(0, -1),
        { ...candles.at(-1)!, open: 5, high: 6, low: 4, close: 5 },
      ];
      const result = calculateCCI(revised, 3, source);
      expect(result.slice(0, -1)).toEqual(full.slice(0, -1));
      expect(result.at(-1)!.value).not.toBe(full.at(-1)!.value);
      expect(candles).toEqual(snapshot);
      expect(calculateCCI(candles, 3, source)).toEqual(full);
    },
  );

  it("rescales extreme finite prices when intermediate arithmetic overflows", () => {
    const huge = bars([Number.MAX_VALUE, -Number.MAX_VALUE, 0, Number.MAX_VALUE]);
    near(calculateCCI(huge, 3, "close"), [0, 100]);
    expect(calculateCCI(huge, 3, "close").map((point) => point.value)).toEqual(
      calculateCCI(bars([1, -1, 0, 1]), 3, "close").map((point) => point.value),
    );
  });

  it("rejects invalid periods and waits for a complete window", () => {
    for (const source of PRICE_SOURCES) {
      for (const period of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
        expect(calculateCCI(input(), period, source)).toEqual([]);
      expect(calculateCCI(input(), 5, source)).toEqual([]);
      expect(calculateCCI([], 1, source)).toEqual([]);
    }
  });
});

describe("Keltner channel price sources", () => {
  const input = () =>
    bars([11, 22, 15, 27, 18]).map((bar, index) => ({
      ...bar,
      open: [10, 20, 16, 25, 19][index]!,
      high: [12, 24, 20, 28, 23][index]!,
      low: [8, 18, 14, 21, 17][index]!,
    }));
  // Three-sample SMA seed, then EMA alpha 1/2, calculated independently for each source.
  const middle: Record<PriceSource, number[]> = {
    close: [16, 21.5, 19.75],
    open: [46 / 3, 121 / 6, 235 / 12],
    high: [56 / 3, 70 / 3, 139 / 6],
    low: [40 / 3, 103 / 6, 205 / 12],
    hl2: [16, 20.25, 20.125],
    hlc3: [16, 62 / 3, 20],
    ohlc4: [95 / 6, 493 / 24, 955 / 48],
  };
  // Actual H/L and previous close produce TR [4,13,8,13,10], Wilder ATR2 below.
  const atr = [33 / 4, 85 / 8, 165 / 16];

  it.each(PRICE_SOURCES)("uses %s for the EMA while retaining actual-price ATR", (source) => {
    const result = calculateKeltnerChannels(input(), 3, 2, 2, source);
    near(result.middle, middle[source]);
    near(
      result.upper,
      middle[source].map((value, index) => value + 2 * atr[index]!),
    );
    near(
      result.lower,
      middle[source].map((value, index) => value - 2 * atr[index]!),
    );
    for (const series of [result.upper, result.middle, result.lower])
      expect(series.map((point) => point.time)).toEqual(
        input()
          .slice(2)
          .map((bar) => bar.time),
      );
  });

  it("preserves close defaults and aligns both warmups, including a zero multiplier", () => {
    const candles = input();
    expect(calculateKeltnerChannels(candles)).toEqual(
      calculateKeltnerChannels(candles, 20, 10, 2, "close"),
    );
    expect(calculateKeltnerChannels(candles, 3, 2, 2)).toEqual(
      calculateKeltnerChannels(candles, 3, 2, 2, "close"),
    );
    const laterATR = calculateKeltnerChannels(candles, 2, 4, 2, "open");
    expect(laterATR.middle.map((point) => point.time)).toEqual(
      candles.slice(3).map((bar) => bar.time),
    );
    for (const source of PRICE_SOURCES) {
      const zero = calculateKeltnerChannels(candles, 3, 2, 0, source);
      near(zero.middle, middle[source]);
      expect(zero.upper).toEqual(zero.middle);
      expect(zero.lower).toEqual(zero.middle);
    }
  });

  it.each(["open", "ohlc4"] as const)(
    "rewarms %s after missing open without resetting valid ATR history",
    (source) => {
      const candles = input();
      const broken = candles.map((bar, index) => (index === 1 ? { ...bar, open: NaN } : bar));
      const result = calculateKeltnerChannels(broken, 2, 2, 1, source);
      expect(result.middle.map((point) => point.time)).toEqual(
        candles.slice(3).map((bar) => bar.time),
      );
      result.upper.forEach((point, index) =>
        expect(point.value - result.middle[index]!.value).toBeCloseTo(
          [85 / 8, 165 / 16][index]!,
          10,
        ),
      );
      const afterGapOnly = calculateKeltnerChannels(candles.slice(2), 2, 2, 1, source);
      expect(result.middle).toEqual(afterGapOnly.middle);
      expect(result.upper).not.toEqual(afterGapOnly.upper);
    },
  );

  it.each(PRICE_SOURCES)(
    "resets both calculations after invalid ATR fields or time for %s",
    (source) => {
      const candles = input();
      for (const field of ["high", "low", "close", "time"] as const) {
        for (const invalid of [NaN, Infinity, undefined]) {
          const broken = candles.map((bar, index) =>
            index === 1 ? ({ ...bar, [field]: invalid } as Candle) : bar,
          );
          expect(calculateKeltnerChannels(broken, 2, 2, 1, source)).toEqual(
            calculateKeltnerChannels(candles.slice(2), 2, 2, 1, source),
          );
        }
      }
    },
  );

  it("ignores missing unused open and volume for sources that do not require them", () => {
    const candles = input();
    const poisoned = candles.map((bar) => ({ ...bar, open: NaN, volume: NaN }));
    for (const source of ["close", "high", "low", "hl2", "hlc3"] as const)
      expect(calculateKeltnerChannels(poisoned, 3, 2, 2, source)).toEqual(
        calculateKeltnerChannels(candles, 3, 2, 2, source),
      );
  });

  it.each(PRICE_SOURCES)(
    "recomputes %s candle revisions without altering prior windows or input",
    (source) => {
      const candles = input();
      const snapshot = structuredClone(candles);
      const full = calculateKeltnerChannels(candles, 3, 2, 2, source);
      const prefix = calculateKeltnerChannels(candles.slice(0, -1), 3, 2, 2, source);
      const revised = [
        ...candles.slice(0, -1),
        { ...candles.at(-1)!, open: 30, high: 35, low: 28, close: 32 },
      ];
      const changed = calculateKeltnerChannels(revised, 3, 2, 2, source);
      for (const key of ["middle", "upper", "lower"] as const) {
        expect(prefix[key]).toEqual(full[key].slice(0, -1));
        expect(changed[key].slice(0, -1)).toEqual(full[key].slice(0, -1));
      }
      expect(changed.middle.at(-1)!.value).not.toBe(full.middle.at(-1)!.value);
      expect(candles).toEqual(snapshot);
      expect(calculateKeltnerChannels(candles, 3, 2, 2, source)).toEqual(full);
    },
  );
});

describe("Keltner moving-average basis", () => {
  const input = () =>
    bars([11, 22, 15, 27, 18]).map((bar, index) => ({
      ...bar,
      open: [10, 20, 16, 25, 19][index]!,
      high: [12, 24, 20, 28, 23][index]!,
      low: [8, 18, 14, 21, 17][index]!,
    }));
  const means: Record<PriceSource, number[]> = {
    close: [16, 64 / 3, 20],
    open: [46 / 3, 61 / 3, 20],
    high: [56 / 3, 24, 71 / 3],
    low: [40 / 3, 53 / 3, 52 / 3],
    hl2: [16, 125 / 6, 20.5],
    hlc3: [16, 21, 61 / 3],
    ohlc4: [95 / 6, 125 / 6, 81 / 4],
  };
  // Wilder ATR2 from actual true ranges [4,13,8,13,10], aligned with three-bar means.
  const atr = [33 / 4, 85 / 8, 165 / 16];

  it.each(PRICE_SOURCES)("uses independent rolling %s SMA means without changing ATR", (source) => {
    const result = calculateKeltnerChannels(input(), 3, 2, 2, source, "sma");
    near(result.middle, means[source]);
    near(
      result.upper,
      means[source].map((value, index) => value + 2 * atr[index]!),
    );
    near(
      result.lower,
      means[source].map((value, index) => value - 2 * atr[index]!),
    );
    const exponential = calculateKeltnerChannels(input(), 3, 2, 2, source, "ema");
    expect(result.middle[0]!.value).toBeCloseTo(exponential.middle[0]!.value, 10);
    expect(result.middle.at(-1)!.value).not.toBeCloseTo(exponential.middle.at(-1)!.value, 10);
    expect(result.middle.map((point) => point.time)).toEqual(
      input()
        .slice(2)
        .map((bar) => bar.time),
    );
  });

  it("retains EMA defaults and rejects unknown runtime basis types instead of using SMA", () => {
    const candles = input();
    expect(calculateKeltnerChannels(candles, 3, 2, 2, "open")).toEqual(
      calculateKeltnerChannels(candles, 3, 2, 2, "open", "ema"),
    );
    expect(calculateKeltnerChannels(candles)).toEqual(
      calculateKeltnerChannels(candles, 20, 10, 2, "close", "ema"),
    );
    for (const invalid of [null, "", "EMA", "wma", false, 0, {}, ["sma"]])
      expect(calculateKeltnerChannels(candles, 3, 2, 2, "close", invalid as "ema")).toEqual({
        upper: [],
        middle: [],
        lower: [],
      });
  });

  it.each(["open", "ohlc4"] as const)(
    "rewarms %s SMA after an open gap without resetting valid ATR",
    (source) => {
      const candles = input();
      const broken = candles.map((bar, index) => (index === 1 ? { ...bar, open: NaN } : bar));
      const result = calculateKeltnerChannels(broken, 2, 2, 1, source, "sma");
      expect(result.middle.map((point) => point.time)).toEqual(
        candles.slice(3).map((bar) => bar.time),
      );
      near(result.middle, source === "open" ? [20.5, 22] : [20.75, 22.25]);
      result.upper.forEach((point, index) =>
        expect(point.value - result.middle[index]!.value).toBeCloseTo(
          [85 / 8, 165 / 16][index]!,
          10,
        ),
      );
      const afterGapOnly = calculateKeltnerChannels(candles.slice(2), 2, 2, 1, source, "sma");
      expect(result.middle).toEqual(afterGapOnly.middle);
      expect(result.upper).not.toEqual(afterGapOnly.upper);
    },
  );

  it("aligns SMA and ATR warmups and supports zero multiplier and period one", () => {
    const candles = input();
    const laterATR = calculateKeltnerChannels(candles, 2, 4, 1, "open", "sma");
    expect(laterATR.middle.map((point) => point.time)).toEqual(
      candles.slice(3).map((bar) => bar.time),
    );
    near(laterATR.middle, [20.5, 22]);
    near(laterATR.upper, [30, 31.625]);
    const zero = calculateKeltnerChannels(candles, 3, 2, 0, "close", "sma");
    near(zero.middle, means.close);
    expect(zero.upper).toEqual(zero.middle);
    expect(zero.lower).toEqual(zero.middle);
    const one = calculateKeltnerChannels(candles, 1, 1, 1, "close", "sma");
    near(one.middle, [11, 22, 15, 27, 18]);
    near(one.upper, [15, 35, 23, 40, 28]);
  });

  it("recomputes revised SMA windows without mutating input and resets invalid price-range history", () => {
    const candles = input();
    const snapshot = structuredClone(candles);
    const original = calculateKeltnerChannels(candles, 3, 2, 2, "close", "sma");
    const changed = calculateKeltnerChannels(
      [...candles.slice(0, -1), { ...candles.at(-1)!, high: 35, low: 28, close: 32 }],
      3,
      2,
      2,
      "close",
      "sma",
    );
    near(changed.middle, [16, 64 / 3, 74 / 3]);
    for (const key of ["upper", "middle", "lower"] as const)
      expect(changed[key].slice(0, -1)).toEqual(original[key].slice(0, -1));
    expect(candles).toEqual(snapshot);
    expect(calculateKeltnerChannels(candles, 3, 2, 2, "close", "sma")).toEqual(original);
    const gap = candles.map((bar, index) => (index === 1 ? { ...bar, high: NaN } : bar));
    expect(calculateKeltnerChannels(gap, 2, 2, 1, "open", "sma")).toEqual(
      calculateKeltnerChannels(candles.slice(2), 2, 2, 1, "open", "sma"),
    );
    for (const period of [0, -1, 1.5, Infinity, NaN]) {
      expect(flatten(calculateKeltnerChannels(candles, period, 2, 1, "close", "sma"))).toEqual([]);
      expect(flatten(calculateKeltnerChannels(candles, 2, period, 1, "close", "sma"))).toEqual([]);
    }
    for (const multiplier of [-1, Infinity, NaN])
      expect(flatten(calculateKeltnerChannels(candles, 2, 2, multiplier, "close", "sma"))).toEqual(
        [],
      );
  });
});

describe("Keltner range styles", () => {
  const input = () =>
    [10, 20, 15, 25, 24].map((close, i) => ({
      time: i + 1,
      open: close - 1,
      close,
      high: close + 2 + i,
      low: close - 2,
      volume: 10,
    }));
  it.each(["ema", "sma"] as const)(
    "uses unsmoothed true range and MA-length Wilder high-low with %s basis",
    (basis) => {
      const candles = input();
      const expected = {
        atr: [8.5, 7.75, 11.375, 9.6875],
        trueRange: [13, 7, 15, 8],
        highLow: [4.5, 5.25, 6.125, 7.0625],
      };
      for (const mode of ["atr", "trueRange", "highLow"] as const) {
        const result = calculateKeltnerChannels(candles, 2, 2, 1, "close", basis, mode);
        expect(result.middle).toHaveLength(4);
        result.middle.forEach((point, i) => {
          expect(result.upper[i]!.value - point.value).toBeCloseTo(expected[mode][i]!, 10);
          expect(point.value - result.lower[i]!.value).toBeCloseTo(expected[mode][i]!, 10);
        });
        if (mode !== "atr") {
          expect(calculateKeltnerChannels(candles, 2, 500, 1, "close", basis, mode)).toEqual(
            result,
          );
        }
      }
      expect(calculateKeltnerChannels(candles, 2, 2, 1, "close", basis)).toEqual(
        calculateKeltnerChannels(candles, 2, 2, 1, "close", basis, "atr"),
      );
    },
  );
  it.each(["trueRange", "highLow"] as const)(
    "restarts %s range and basis after invalid OHLC, with independent source gaps",
    (mode) => {
      const candles = [...input(), ...input().map((b) => ({ ...b, time: b.time + 5 }))];
      const broken = candles.map((b, i) => (i === 4 ? { ...b, high: NaN } : b));
      const actual = calculateKeltnerChannels(broken, 2, 3, 2, "open", "ema", mode);
      const before = calculateKeltnerChannels(candles.slice(0, 4), 2, 3, 2, "open", "ema", mode);
      const after = calculateKeltnerChannels(candles.slice(5), 2, 3, 2, "open", "ema", mode);
      for (const key of ["upper", "middle", "lower"] as const)
        expect(actual[key]).toEqual([...before[key], ...after[key]]);
      const sourceGap = candles.map((b, i) => (i === 4 ? { ...b, open: NaN } : b));
      const gapped = calculateKeltnerChannels(sourceGap, 2, 3, 2, "open", "ema", mode);
      const whole = calculateKeltnerChannels(candles, 2, 3, 2, "open", "ema", mode);
      expect(gapped.middle.some((p) => p.time === 5 || p.time === 6)).toBe(false);
      const index = whole.middle.findIndex((p) => p.time === 7);
      const resumed = gapped.middle.findIndex((p) => p.time === 7);
      expect(gapped.upper[resumed]!.value - gapped.middle[resumed]!.value).toBeCloseTo(
        whole.upper[index]!.value - whole.middle[index]!.value,
        10,
      );
    },
  );
  it("rejects invalid styles and never emits nonfinite bands after overflowing ranges", () => {
    for (const mode of ["", "ATR", null, undefined, 0]) {
      if (mode === undefined) continue;
      expect(calculateKeltnerChannels(input(), 2, 2, 1, "close", "ema", mode as "atr")).toEqual({
        upper: [],
        middle: [],
        lower: [],
      });
    }
    for (const mode of ["atr", "trueRange", "highLow"] as const) {
      const extreme = [
        { time: 0, open: 0, high: 1e308, low: -1e308, close: 0, volume: 0 },
        ...input(),
      ];
      const result = calculateKeltnerChannels(extreme, 1, 1, 1, "close", "ema", mode);
      expect(result.middle.at(-1)!.time).toBe(5);
      for (const key of ["upper", "middle", "lower"] as const)
        expect(result[key].every((p) => Number.isFinite(p.value))).toBe(true);
    }
  });
});
