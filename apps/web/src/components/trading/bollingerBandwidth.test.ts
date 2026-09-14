import { describe, expect, it } from "vite-plus/test";
import { PRICE_SOURCES, type Candle, type PriceSource } from "./chartIndicators";
import { calculateBollingerBandwidth } from "./bollingerBandwidth";

const bars = (prices: number[]): Candle[] =>
  prices.map((close, index) => ({
    time: index + 1,
    open: close,
    high: close + 1,
    low: close - 1,
    close,
    volume: 10,
  }));

describe("Bollinger BandWidth", () => {
  it.each([
    { prices: [2, 4], deviations: 1, expected: 200 / 3 },
    { prices: [2, 4], deviations: 2, expected: 400 / 3 },
    { prices: [2, 4], deviations: 0.5, expected: 100 / 3 },
    { prices: [-2, -4], deviations: 2, expected: -400 / 3 },
  ])(
    "uses a signed percentage of the SMA basis for $prices at $deviations deviations",
    ({ prices, deviations, expected }) => {
      const result = calculateBollingerBandwidth(bars(prices), 2, deviations);
      expect(result).toHaveLength(1);
      expect(result[0]!.time).toBe(2);
      expect(result[0]!.value).toBeCloseTo(expected, 10);
    },
  );

  it("uses population deviation and the default twenty-bar close basis", () => {
    // Mean 5, population variance 4, width 8: 160%.
    expect(calculateBollingerBandwidth(bars([2, 4, 4, 4, 5, 5, 7, 9]), 8)).toEqual([
      { time: 8, value: 160 },
    ]);
    const input = bars([...Array.from({ length: 19 }, () => 0), 10]);
    expect(calculateBollingerBandwidth(input.slice(0, -1))).toEqual([]);
    const result = calculateBollingerBandwidth(input);
    expect(result).toHaveLength(1);
    expect(result[0]!.time).toBe(20);
    // Mean 0.5, population deviation sqrt(19)/2; width=2sqrt(19).
    expect(result[0]!.value).toBeCloseTo(400 * Math.sqrt(19), 10);
    expect(result).toEqual(calculateBollingerBandwidth(input, 20, 2, "close"));
  });

  const sourceBars = () =>
    bars([6, 10]).map((bar, index) => ({
      ...bar,
      open: [2, 6][index]!,
      high: [10, 14][index]!,
      low: [2, 8][index]!,
    }));
  // For two samples population deviation is half their distance; width at2σ=2*distance.
  const widths: Record<PriceSource, number> = {
    close: 100,
    open: 200,
    high: 200 / 3,
    low: 240,
    hl2: 2000 / 17,
    hlc3: 112,
    ohlc4: 3600 / 29,
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

  it.each(PRICE_SOURCES)("uses hand-calculated %s band width", (source) => {
    const result = calculateBollingerBandwidth(sourceBars(), 2, 2, source);
    expect(result).toHaveLength(1);
    expect(result[0]!.value).toBeCloseTo(widths[source], 10);
  });

  it("returns zero for flat nonzero prices, period one, or zero deviations, and omits zero bases", () => {
    expect(calculateBollingerBandwidth(bars([4, 4, 4]), 2)).toEqual([
      { time: 2, value: 0 },
      { time: 3, value: 0 },
    ]);
    expect(calculateBollingerBandwidth(bars([-4, -4]), 2)).toEqual([{ time: 2, value: 0 }]);
    expect(calculateBollingerBandwidth(bars([2, 4]), 2, 0)).toEqual([{ time: 2, value: 0 }]);
    expect(calculateBollingerBandwidth(bars([0, 0]), 2)).toEqual([]);
    expect(calculateBollingerBandwidth(bars([-2, 2]), 2)).toEqual([]);
    const afterZero = calculateBollingerBandwidth(bars([-2, 2, 4, 8]), 2);
    expect(afterZero.map((point) => point.time)).toEqual([3, 4]);
    for (const point of afterZero) expect(point.value).toBeCloseTo(400 / 3, 10);
    expect(calculateBollingerBandwidth(bars([2, 0, -3]), 1)).toEqual([
      { time: 1, value: 0 },
      { time: 3, value: 0 },
    ]);
  });

  it.each(PRICE_SOURCES)(
    "restarts %s warmup on selected/time gaps and ignores unused fields",
    (source) => {
      const clean = bars([2, 4, 5, 8, 9, 11, 12]);
      for (const field of [...required[source], "time"] as const) {
        for (const invalid of [NaN, Infinity, undefined]) {
          const broken = clean.map((bar, index) =>
            index === 3 ? ({ ...bar, [field]: invalid } as Candle) : bar,
          );
          expect(calculateBollingerBandwidth(broken, 3, 2, source)).toEqual([
            ...calculateBollingerBandwidth(clean.slice(0, 3), 3, 2, source),
            ...calculateBollingerBandwidth(clean.slice(4), 3, 2, source),
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
      expect(calculateBollingerBandwidth(poisoned, 3, 2, source)).toEqual(
        calculateBollingerBandwidth(clean, 3, 2, source),
      );
    },
  );

  it("keeps finite ratios when width subtraction or premature percentage multiplication overflows", () => {
    const input = bars([1e154 - 1e140, 1e154 + 1e140]);
    const deviation = (input[1]!.close - input[0]!.close) / 2;
    for (const multiplier of [5e167, 1e168]) {
      const result = calculateBollingerBandwidth(input, 2, multiplier);
      expect(result).toHaveLength(1);
      const expected = (multiplier / 1e154) * deviation * 200;
      expect(result[0]!.value / expected).toBeCloseTo(1, 12);
      expect(Number.isFinite(result[0]!.value)).toBe(true);
    }
  });

  it.each(PRICE_SOURCES)(
    "recomputes %s revisions without changing earlier readings or input",
    (source) => {
      const candles = bars([2, 4, 5, 8, 9]);
      const snapshot = structuredClone(candles);
      const full = calculateBollingerBandwidth(candles, 3, 2, source);
      expect(calculateBollingerBandwidth(candles.slice(0, -1), 3, 2, source)).toEqual(
        full.slice(0, -1),
      );
      const revised = [
        ...candles.slice(0, -1),
        { ...candles.at(-1)!, open: 20, high: 22, low: 19, close: 21 },
      ];
      const changed = calculateBollingerBandwidth(revised, 3, 2, source);
      expect(changed.slice(0, -1)).toEqual(full.slice(0, -1));
      expect(changed.at(-1)!.value).not.toBe(full.at(-1)!.value);
      expect(candles).toEqual(snapshot);
      expect(calculateBollingerBandwidth(candles, 3, 2, source)).toEqual(full);
    },
  );

  it("rejects invalid windows/deviations and waits for sufficient history", () => {
    for (const period of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
      expect(calculateBollingerBandwidth(bars([2, 4]), period)).toEqual([]);
    for (const deviations of [-1, NaN, Infinity])
      expect(calculateBollingerBandwidth(bars([2, 4]), 2, deviations)).toEqual([]);
    expect(calculateBollingerBandwidth(bars([2, 4]), 3)).toEqual([]);
    expect(calculateBollingerBandwidth([], 1)).toEqual([]);
  });
});
