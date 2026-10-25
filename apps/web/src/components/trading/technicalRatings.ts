import { calculateRSI, calculateSMA, type Candle, type IndicatorPoint } from "./chartIndicators";
import {
  calculateADX,
  calculateStochastic,
  calculateStochasticRSI,
  calculateWilliamsR,
} from "./advancedIndicators";

export type TechnicalAction = "Buy" | "Neutral" | "Sell";
export type TechnicalRating = "Strong Sell" | "Sell" | "Neutral" | "Buy" | "Strong Buy";
export type TechnicalRatingRow = {
  key: string;
  name: string;
  value: number | null;
  action: TechnicalAction | null;
};
export type TechnicalRatingSummary = {
  buy: number;
  neutral: number;
  sell: number;
  unavailable: number;
  score: number | null;
  rating: TechnicalRating | null;
};
export type TechnicalRatingGroup = TechnicalRatingSummary & { rows: TechnicalRatingRow[] };
export type TechnicalRatings = {
  movingAverages: TechnicalRatingGroup;
  oscillators: TechnicalRatingGroup;
  summary: TechnicalRatingSummary;
};

/** Strict boundaries from TradingView/TechnicalRating/3; ±0.1 remain neutral. */
export function technicalRatingCategory(score: number | null): TechnicalRating | null {
  if (score === null || !Number.isFinite(score)) return null;
  if (score < -0.5) return "Strong Sell";
  if (score < -0.1) return "Sell";
  if (score > 0.5) return "Strong Buy";
  return score > 0.1 ? "Buy" : "Neutral";
}

export function summarizeTechnicalRows(
  rows: readonly TechnicalRatingRow[],
): TechnicalRatingSummary {
  const buy = rows.filter((row) => row.action === "Buy").length;
  const sell = rows.filter((row) => row.action === "Sell").length;
  const neutral = rows.filter((row) => row.action === "Neutral").length;
  const available = buy + sell + neutral;
  const score = available ? (buy - sell) / available : null;
  return {
    buy,
    sell,
    neutral,
    unavailable: rows.length - available,
    score,
    rating: technicalRatingCategory(score),
  };
}

const finite = (value: number | null | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value);
const valueOrNull = (value: number | null | undefined) => (finite(value) ? value : null);
const compare = (a: number, b: number): TechnicalAction =>
  a > b ? "Buy" : a < b ? "Sell" : "Neutral";
const row = (
  key: string,
  name: string,
  value: number | null,
  ready: boolean,
  buy: boolean,
  sell: boolean,
): TechnicalRatingRow => ({
  key,
  name,
  value: valueOrNull(value),
  action: ready && finite(value) ? (buy ? "Buy" : sell ? "Sell" : "Neutral") : null,
});

/** Pine EMA seeds with the first source value, unlike the chart's SMA-seeded EMA. */
function ema(values: readonly number[], period: number): number[] {
  const alpha = 2 / (period + 1);
  let previous: number | undefined;
  return values.map((value) => {
    previous = previous === undefined ? value : alpha * value + (1 - alpha) * previous;
    return previous;
  });
}
function mean(values: readonly number[], length: number, end = values.length - 1): number | null {
  if (end < length - 1) return null;
  const window = values.slice(end - length + 1, end + 1);
  return window.every(Number.isFinite)
    ? window.reduce((sum, value) => sum + value / length, 0)
    : null;
}
function wma(values: readonly number[], length: number, end: number): number | null {
  if (end < length - 1) return null;
  let sum = 0;
  for (let i = 0; i < length; i++) sum += values[end - length + 1 + i]! * (i + 1);
  return valueOrNull(sum / ((length * (length + 1)) / 2));
}
function donchianMid(bars: readonly Candle[], length: number, end: number): number | null {
  if (end < length - 1) return null;
  const window = bars.slice(end - length + 1, end + 1);
  return (
    (Math.max(...window.map((bar) => bar.high)) + Math.min(...window.map((bar) => bar.low))) / 2
  );
}
function closeCCI(values: readonly number[], end: number): number | null {
  const average = mean(values, 20, end);
  if (average === null) return null;
  const deviation = values
    .slice(end - 19, end + 1)
    .reduce((sum, value) => sum + Math.abs(value - average) / 20, 0);
  return deviation === 0 ? null : valueOrNull((values[end]! - average) / (0.015 * deviation));
}

/**
 * Independently calculated from chronological selected-contract OHLCV. Rules verified against
 * TradingView/TechnicalRating/3 (2024-11-29), not the older Help Center ADX sell condition.
 * https://www.tradingview.com/script/jDWyb5PG-TechnicalRating/
 * https://www.tradingview.com/support/solutions/43000614331-technical-ratings/
 * Missing warmup/prerequisites remain unavailable, never implicit neutral. Recursive values
 * depend on the supplied history; this is not a claim of server-feed numerical equivalence.
 */
export function calculateTechnicalRatings(input: readonly Candle[]): TechnicalRatings {
  // Restart at malformed prices/order rather than carrying an earlier reading into the latest bar.
  let start = 0;
  for (let i = 0; i < input.length; i++) {
    const bar = input[i]!;
    if (
      ![bar.time, bar.open, bar.high, bar.low, bar.close].every(Number.isFinite) ||
      bar.low > Math.min(bar.open, bar.close) ||
      bar.high < Math.max(bar.open, bar.close)
    )
      start = i + 1;
    else if (i > start && bar.time <= input[i - 1]!.time) start = i;
  }
  const bars = input.slice(start);
  const closes = bars.map((bar) => bar.close);
  const n = bars.length - 1;
  const close = closes[n] ?? NaN;
  const point = (points: readonly IndicatorPoint[], offset = 0): number | null => {
    const time = bars[n - offset]?.time;
    return valueOrNull(points.findLast((entry) => entry.time === time)?.value);
  };
  const maRows: TechnicalRatingRow[] = [];
  const ma = (key: string, name: string, value: number | null) =>
    maRows.push({
      key,
      name,
      value: valueOrNull(value),
      action: finite(value) && finite(close) ? compare(close, value) : null,
    });
  for (const period of [10, 20, 30, 50, 100, 200]) {
    ma(
      `ema${period}`,
      `Exponential Moving Average (${period})`,
      bars.length >= period ? valueOrNull(ema(closes, period)[n]) : null,
    );
    ma(`sma${period}`, `Simple Moving Average (${period})`, point(calculateSMA(bars, period)));
  }
  const conversion = donchianMid(bars, 9, n);
  const base = donchianMid(bars, 26, n);
  const pastConversion = donchianMid(bars, 9, n - 26);
  const pastBase = donchianMid(bars, 26, n - 26);
  const spanA = finite(pastConversion) && finite(pastBase) ? (pastConversion + pastBase) / 2 : null;
  const spanB = donchianMid(bars, 52, n - 26);
  const cloudReady = [conversion, base, spanA, spanB].every(finite);
  maRows.push(
    row(
      "ichimoku",
      "Ichimoku Base Line (9, 26, 52)",
      base,
      cloudReady,
      cloudReady && spanA! > spanB! && base! > spanA! && conversion! > base! && close > conversion!,
      cloudReady && spanA! < spanB! && base! < spanA! && conversion! < base! && close < conversion!,
    ),
  );
  const volumeWindow = bars.slice(-20);
  const volume = volumeWindow.reduce((sum, bar) => sum + bar.volume, 0);
  ma(
    "vwma20",
    "Volume Weighted Moving Average (20)",
    volumeWindow.length === 20 &&
      volume > 0 &&
      volumeWindow.every((bar) => finite(bar.volume) && bar.volume >= 0)
      ? valueOrNull(volumeWindow.reduce((sum, bar) => sum + bar.close * bar.volume, 0) / volume)
      : null,
  );
  const hullInputs = closes.map((_, index) => {
    const short = wma(closes, 4, index),
      long = wma(closes, 9, index);
    return finite(short) && finite(long) ? 2 * short - long : NaN;
  });
  ma("hma9", "Hull Moving Average (9)", wma(hullInputs, 3, n));

  const rsiSeries = calculateRSI(bars, 14);
  const rsi = point(rsiSeries),
    rsiPrev = point(rsiSeries, 1);
  const stochastic = calculateStochastic(bars, 14, 3, 3);
  const k = point(stochastic.k),
    d = point(stochastic.d),
    dPrev = point(stochastic.d, 1);
  const cci = closeCCI(closes, n),
    cciPrev = closeCCI(closes, n - 1);
  const dmi = calculateADX(bars, 14, 14);
  const adx = point(dmi.adx),
    adxPrev = point(dmi.adx, 1),
    plus = point(dmi.plusDI),
    minus = point(dmi.minusDI);
  const medians = bars.map((bar) => (bar.high + bar.low) / 2);
  const aoAt = (end: number) => {
    const fast = mean(medians, 5, end),
      slow = mean(medians, 34, end);
    return finite(fast) && finite(slow) ? fast - slow : null;
  };
  const ao = aoAt(n),
    aoPrev = aoAt(n - 1),
    aoEarlier = aoAt(n - 2);
  const momentum = n >= 10 ? close - closes[n - 10]! : null;
  const momentumPrev = n >= 11 ? closes[n - 1]! - closes[n - 11]! : null;
  const fastEMA = ema(closes, 12),
    slowEMA = ema(closes, 26);
  const macdSeries = fastEMA.map((value, i) => value - slowEMA[i]!);
  const macd = valueOrNull(macdSeries[n]),
    signal = valueOrNull(ema(macdSeries, 9)[n]);
  const stochRSI = calculateStochasticRSI(bars, 14, 14, 3, 3);
  const rsiK = point(stochRSI.k),
    rsiD = point(stochRSI.d);
  const trend = bars.length >= 50 ? ema(closes, 50)[n]! : null;
  const wrSeries = calculateWilliamsR(bars, 14);
  const wr = point(wrSeries),
    wrPrev = point(wrSeries, 1);
  const powerEMA = ema(closes, 13);
  const bull = n >= 12 ? bars[n]!.high - powerEMA[n]! : null;
  const bear = n >= 12 ? bars[n]!.low - powerEMA[n]! : null;
  const bullPrev = n >= 13 ? bars[n - 1]!.high - powerEMA[n - 1]! : null;
  const bearPrev = n >= 13 ? bars[n - 1]!.low - powerEMA[n - 1]! : null;
  const pressure: number[] = [],
    trueRanges: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const low = Math.min(bars[i]!.low, bars[i - 1]!.close);
    pressure.push(bars[i]!.close - low);
    trueRanges.push(Math.max(bars[i]!.high, bars[i - 1]!.close) - low);
  }
  const ratio = (length: number) => {
    const bp = mean(pressure, length),
      tr = mean(trueRanges, length);
    return finite(bp) && finite(tr) && tr > 0 ? bp / tr : null;
  };
  const u7 = ratio(7),
    u14 = ratio(14),
    u28 = ratio(28);
  const uo = [u7, u14, u28].every(finite) ? (100 * (4 * u7! + 2 * u14! + u28!)) / 7 : null;
  const oscillatorRows = [
    row(
      "rsi14",
      "Relative Strength Index (14)",
      rsi,
      [rsi, rsiPrev].every(finite),
      rsi! < 30 && rsi! > rsiPrev!,
      rsi! > 70 && rsi! < rsiPrev!,
    ),
    row(
      "stochastic",
      "Stochastic %K (14, 3, 3)",
      k,
      [k, d, dPrev].every(finite),
      k! < 20 && d! < 20 && k! > d!,
      k! > 80 && d! > 80 && k! < d!,
    ),
    row(
      "cci20",
      "Commodity Channel Index (20)",
      cci,
      [cci, cciPrev].every(finite),
      cci! < -100 && cci! > cciPrev!,
      cci! > 100 && cci! < cciPrev!,
    ),
    row(
      "adx14",
      "Average Directional Index (14)",
      adx,
      [adx, adxPrev, plus, minus].every(finite),
      adx! > 20 && adx! > adxPrev! && plus! > minus!,
      adx! > 20 && adx! > adxPrev! && plus! < minus!,
    ),
    row(
      "ao",
      "Awesome Oscillator",
      ao,
      [ao, aoPrev].every(finite),
      (ao! > 0 && aoPrev! <= 0) ||
        ([ao, aoPrev, aoEarlier].every(finite) &&
          ao! > 0 &&
          aoPrev! > 0 &&
          ao! > aoPrev! &&
          aoEarlier! > aoPrev!),
      (ao! < 0 && aoPrev! >= 0) ||
        ([ao, aoPrev, aoEarlier].every(finite) &&
          ao! < 0 &&
          aoPrev! < 0 &&
          ao! < aoPrev! &&
          aoEarlier! < aoPrev!),
    ),
    row(
      "momentum10",
      "Momentum (10)",
      momentum,
      [momentum, momentumPrev].every(finite),
      momentum! > momentumPrev!,
      momentum! < momentumPrev!,
    ),
    row(
      "macd",
      "MACD Level (12, 26)",
      bars.length >= 26 ? macd : null,
      bars.length >= 34 && [macd, signal].every(finite),
      macd! > signal!,
      macd! < signal!,
    ),
    row(
      "stochRsi",
      "Stochastic RSI Fast (3, 3, 14, 14)",
      rsiK,
      [rsiK, rsiD, trend].every(finite),
      close < trend! && rsiK! < 20 && rsiD! < 20 && rsiK! > rsiD!,
      close > trend! && rsiK! > 80 && rsiD! > 80 && rsiK! < rsiD!,
    ),
    row(
      "williams14",
      "Williams Percent Range (14)",
      wr,
      [wr, wrPrev].every(finite),
      wr! < -80 && wr! > wrPrev!,
      wr! > -20 && wr! < wrPrev!,
    ),
    row(
      "bullBear",
      "Bull Bear Power (13)",
      finite(bull) && finite(bear) ? bull + bear : null,
      [bull, bear, bullPrev, bearPrev, trend].every(finite),
      close > trend! && bear! < 0 && bear! > bearPrev!,
      close < trend! && bull! > 0 && bull! < bullPrev!,
    ),
    row("ultimate", "Ultimate Oscillator (7, 14, 28)", uo, finite(uo), uo! > 70, uo! < 30),
  ];
  const movingAverages = { rows: maRows, ...summarizeTechnicalRows(maRows) };
  const oscillators = { rows: oscillatorRows, ...summarizeTechnicalRows(oscillatorRows) };
  const groups = [movingAverages.score, oscillators.score].filter(finite);
  const score = groups.length
    ? groups.reduce((sum, value) => sum + value, 0) / groups.length
    : null;
  return {
    movingAverages,
    oscillators,
    summary: {
      ...summarizeTechnicalRows([...maRows, ...oscillatorRows]),
      score,
      rating: technicalRatingCategory(score),
    },
  };
}
