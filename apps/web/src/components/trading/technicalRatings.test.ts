import { describe, expect, it } from "vite-plus/test";
import type { Candle } from "./chartIndicators";
import {
  calculateTechnicalRatings,
  summarizeTechnicalRows,
  technicalRatingCategory,
  type TechnicalRatingRow,
} from "./technicalRatings";

function candles(closes: number[]): Candle[] {
  return closes.map((close, index) => ({
    time: 1000 + index * 60,
    open: close,
    high: close + 1,
    low: close - 1,
    close,
    volume: 100 + index,
  }));
}
const get = (bars: Candle[], key: string) => {
  const result = calculateTechnicalRatings(bars);
  return [...result.movingAverages.rows, ...result.oscillators.rows].find(
    (row) => row.key === key,
  )!;
};

describe("technical ratings", () => {
  it("returns all26 constituent rows without inventing readings or neutral votes for missing history", () => {
    const result = calculateTechnicalRatings([]);
    expect(result.movingAverages.rows).toHaveLength(15);
    expect(result.oscillators.rows).toHaveLength(11);
    expect(
      [...result.movingAverages.rows, ...result.oscillators.rows].every(
        (row) => row.value === null && row.action === null,
      ),
    ).toBe(true);
    expect(result.summary).toEqual({
      buy: 0,
      sell: 0,
      neutral: 0,
      unavailable: 26,
      score: null,
      rating: null,
    });
  });

  it.each([
    [-0.50001, "Strong Sell"],
    [-0.5, "Sell"],
    [-0.10001, "Sell"],
    [-0.1, "Neutral"],
    [0.1, "Neutral"],
    [0.10001, "Buy"],
    [0.5, "Buy"],
    [0.50001, "Strong Buy"],
    [null, null],
    [NaN, null],
  ] as const)("classifies boundary score %s as %s", (score, rating) => {
    expect(technicalRatingCategory(score)).toBe(rating);
  });

  it("excludes unavailable votes from means instead of counting them as neutral", () => {
    const rows: TechnicalRatingRow[] = ["Buy", "Neutral", null, null].map((action, index) => ({
      key: String(index),
      name: "Fixture",
      value: action ? 1 : null,
      action: action as TechnicalRatingRow["action"],
    }));
    expect(summarizeTechnicalRows(rows)).toEqual({
      buy: 1,
      sell: 0,
      neutral: 1,
      unavailable: 2,
      score: 0.5,
      rating: "Buy",
    });
  });

  it("weights the moving-average and oscillator groups equally rather than weighting26 constituents equally", () => {
    const result = calculateTechnicalRatings(
      candles(Array.from({ length: 250 }, (_, i) => 100 + i + Math.sin(i))),
    );
    expect(result.movingAverages.unavailable).toBe(0);
    const expected = (result.movingAverages.score! + result.oscillators.score!) / 2;
    expect(result.summary.score).toBe(expected);
    const pooled = (result.summary.buy - result.summary.sell) / (26 - result.summary.unavailable);
    expect(Math.abs(expected - pooled)).toBeGreaterThan(0.01);
    expect(
      result.summary.buy +
        result.summary.neutral +
        result.summary.sell +
        result.summary.unavailable,
    ).toBe(26);
  });

  it("uses the available group when the other group has no rated constituent", () => {
    const result = calculateTechnicalRatings(candles(Array.from({ length: 10 }, (_, i) => i + 1)));
    expect(result.movingAverages.score).toBe(1);
    expect(result.oscillators.score).toBeNull();
    expect(result.summary.score).toBe(1);
    expect(result.summary.unavailable).toBe(24);
  });

  it("calculates long-period means, first-source EMA and weighted means from actual supplied prices/volume", () => {
    const bars = candles(Array.from({ length: 200 }, (_, i) => i + 1));
    expect(get(bars, "sma200")).toMatchObject({ value: 100.5, action: "Buy" });
    const alpha = 2 / 201;
    const expectedEMA = 200 - ((1 - alpha) / alpha) * (1 - (1 - alpha) ** 199);
    expect(get(bars, "ema200").value).toBeCloseTo(expectedEMA, 10);
    const window = bars.slice(-20);
    const expectedVWMA =
      window.reduce((sum, bar) => sum + bar.close * bar.volume, 0) /
      window.reduce((sum, bar) => sum + bar.volume, 0);
    expect(get(bars, "vwma20").value).toBeCloseTo(expectedVWMA, 10);
    expect(get(bars, "hma9").value).toBeCloseTo(200, 10);
    expect(get(bars.slice(0, 199), "sma200").action).toBeNull();
    expect(get(bars.slice(0, 199), "ema200").action).toBeNull();
  });

  it("uses CLOSE for CCI even when typical price differs dramatically", () => {
    const bars = candles(Array.from({ length: 25 }, (_, i) => i + 1)).map((bar, i) => ({
      ...bar,
      high: bar.high + (i === 24 ? 500 : 0),
    }));
    expect(get(bars, "cci20").value).toBeCloseTo(9.5 / (0.015 * 5), 10);
    expect(get(bars, "cci20").action).toBe("Neutral");
  });

  it("uses directional momentum change rather than momentum sign", () => {
    const bars = candles(Array.from({ length: 30 }, (_, i) => 200 - (i * i) / 10));
    expect(get(bars, "momentum10")).toMatchObject({ action: "Sell" });
    bars.at(-1)!.close += 3;
    bars.at(-1)!.high += 3;
    expect(get(bars, "momentum10").value).toBeLessThan(0);
    expect(get(bars, "momentum10").action).toBe("Buy");
  });

  it("rates recovering oversold RSI/CCI/Williams as Buy and weakening overbought RSI as Sell", () => {
    const falling = Array.from({ length: 40 }, (_, i) => 200 - i);
    falling[39] = falling[39]! + 1.5;
    const recovering = candles(falling);
    expect(get(recovering, "rsi14").value).toBeLessThan(30);
    expect(get(recovering, "rsi14").action).toBe("Buy");
    expect(get(recovering, "cci20").value).toBeLessThan(-100);
    expect(get(recovering, "cci20").action).toBe("Buy");
    const williams = candles(Array.from({ length: 40 }, (_, i) => 200 - i));
    williams[39]!.close += 0.5;
    expect(get(williams, "williams14").value).toBeLessThan(-80);
    expect(get(williams, "williams14").action).toBe("Buy");
    const rising = Array.from({ length: 40 }, (_, i) => 200 + i);
    rising[39] = rising[39]! - 1.5;
    expect(get(candles(rising), "rsi14").value).toBeGreaterThan(70);
    expect(get(candles(rising), "rsi14").action).toBe("Sell");
  });

  it("detects AO zero crossings and compares MACD against its signal, not just zero", () => {
    const falling = Array.from({ length: 40 }, (_, i) => 200 - i);
    const crossed = candles([...falling, 700]);
    expect(get(candles(falling), "ao").value).toBeLessThan(0);
    expect(get(crossed, "ao")).toMatchObject({ action: "Buy" });
    const rising = Array.from({ length: 40 }, (_, i) => 200 + i);
    expect(get(candles([...rising, 1]), "ao").action).toBe("Sell");
    const rebound = candles([...Array.from({ length: 100 }, (_, i) => 300 - i), 207, 208, 209]);
    expect(get(rebound, "macd").value).toBeLessThan(0);
    expect(get(rebound, "macd").action).toBe("Buy");
  });

  it("uses7/14/28 buying-pressure ratios for Ultimate Oscillator thresholds", () => {
    const base = candles(Array.from({ length: 35 }, () => 100));
    const nearHigh = base.map((bar) => ({ ...bar, high: 101, low: 90 }));
    const nearLow = base.map((bar) => ({ ...bar, high: 110, low: 99 }));
    expect(get(nearHigh, "ultimate").value).toBeCloseTo(1000 / 11, 10);
    expect(get(nearHigh, "ultimate").action).toBe("Buy");
    expect(get(nearLow, "ultimate").value).toBeCloseTo(100 / 11, 10);
    expect(get(nearLow, "ultimate").action).toBe("Sell");
  });

  it("requires oversold K/D recovery for Stochastic and the trend-filtered Stochastic RSI", () => {
    const prices = Array.from({ length: 111 }, (_, i) => 200 - i * 0.1 + 3 * Math.sin(i / 3));
    const before = candles(prices.slice(0, 110));
    const recovered = candles(prices);
    for (const key of ["stochastic", "stochRsi"]) {
      expect(get(before, key).value).toBeLessThan(20);
      expect(get(before, key).action).toBe("Neutral");
      expect(get(recovered, key).value).toBeLessThan(20);
      expect(get(recovered, key).action).toBe("Buy");
    }
    expect(get(candles(prices.slice(0, 101)), "stochRsi").action).toBe("Sell");
  });

  it("uses EMA50 for Bull Bear trend filtering and EMA13 for recovering powers", () => {
    const bullish = candles([...Array(100).fill(100), ...Array(30).fill(200), 180]);
    bullish[129]!.low = 160;
    bullish[130]!.low = 175;
    // Last close is below EMA13 but above EMA50; recovering negative bear power is bullish.
    expect(get(bullish, "bullBear").action).toBe("Buy");
    const bearish = candles([...Array(100).fill(200), ...Array(30).fill(100), 120]);
    bearish[129]!.high = 140;
    bearish[130]!.high = 125;
    // Last close is above EMA13 but below EMA50; declining positive bull power is bearish.
    expect(get(bearish, "bullBear").action).toBe("Sell");
  });

  it("requires a rising ADX for v3 bearish direction and treats a steady strong trend as neutral", () => {
    const chop = Array.from({ length: 60 }, (_, i) => 200 + (i % 2 ? 1 : -1));
    const bearish = candles([...chop, ...Array.from({ length: 30 }, (_, i) => 199 - i * 2)]);
    expect(get(bearish, "adx14").value).toBeGreaterThan(20);
    expect(get(bearish, "adx14").action).toBe("Sell");
    const steady = candles(Array.from({ length: 80 }, (_, i) => 200 - i));
    expect(get(steady, "adx14")).toMatchObject({ value: 100, action: "Neutral" });
  });

  it("requires the26-bar displaced Ichimoku cloud and never rates an unfinished cloud as neutral", () => {
    const rising = candles(Array.from({ length: 100 }, (_, i) => 100 + i));
    expect(get(rising.slice(0, 77), "ichimoku").action).toBeNull();
    expect(get(rising.slice(0, 78), "ichimoku").action).toBe("Buy");
    expect(get(candles(Array.from({ length: 100 }, (_, i) => 300 - i)), "ichimoku").action).toBe(
      "Sell",
    );
    const inside = rising.map((bar) => ({ ...bar }));
    Object.assign(inside[99]!, { open: 150, close: 150, low: 149, high: 151 });
    expect(get(inside, "ichimoku").action).toBe("Neutral");
  });

  it("leaves volume-weighted and zero-range oscillators unavailable without invalidating usable close-based rows", () => {
    const bars = candles(Array.from({ length: 220 }, () => 100)).map((bar) => ({
      ...bar,
      high: 100,
      low: 100,
      volume: 0,
    }));
    expect(get(bars, "vwma20")).toMatchObject({ value: null, action: null });
    expect(get(bars, "cci20")).toMatchObject({ value: null, action: null });
    expect(get(bars, "stochastic")).toMatchObject({ value: null, action: null });
    expect(get(bars, "ultimate")).toMatchObject({ value: null, action: null });
    expect(get(bars, "sma200")).toMatchObject({ value: 100, action: "Neutral" });
  });

  it("restarts after malformed prices or unordered timestamps and never exposes stale earlier readings", () => {
    const bars = candles(Array.from({ length: 220 }, (_, i) => 100 + i / 10));
    const poisoned = [...bars, { ...bars.at(-1)!, time: bars.at(-1)!.time + 60, close: NaN }];
    expect(calculateTechnicalRatings(poisoned).summary.unavailable).toBe(26);
    const tail = candles(Array.from({ length: 5 }, (_, i) => 100 + i)).map((bar) => ({
      ...bar,
      time: bar.time + 100000,
    }));
    expect(calculateTechnicalRatings([...poisoned, ...tail]).summary.unavailable).toBe(26);
    const duplicate = [...bars, { ...bars.at(-1)! }];
    expect(calculateTechnicalRatings(duplicate).summary.unavailable).toBe(26);
    expect(bars).toEqual(candles(Array.from({ length: 220 }, (_, i) => 100 + i / 10)));
  });
});
