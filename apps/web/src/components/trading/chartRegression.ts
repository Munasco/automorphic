import type { Candle } from "./chartIndicators";

export type RegressionSource =
  | "open"
  | "high"
  | "low"
  | "close"
  | "hl2"
  | "hlc3"
  | "ohlc4"
  | "hlcc4";
export type RegressionBar = Partial<Pick<Candle, "open" | "high" | "low" | "close">>;
export interface RegressionOptions {
  source?: RegressionSource;
  upperDeviation?: number;
  lowerDeviation?: number;
  useUpperDeviation?: boolean;
  useLowerDeviation?: boolean;
}
export interface RegressionLine {
  start: number;
  end: number;
}
export interface ChartRegression {
  count: number;
  /** Price change per bar, in the supplied chronological order. */
  slope: number;
  base: RegressionLine;
  upper: RegressionLine;
  lower: RegressionLine;
  standardDeviation: number;
  /** Correlation of source prices with fitted prices, not with time. */
  pearsonR: number;
}

function sourcePrice(bar: RegressionBar, source: RegressionSource): number {
  switch (source) {
    case "open":
    case "high":
    case "low":
    case "close":
      return bar[source] ?? NaN;
    case "hl2":
      return (bar.high ?? NaN) / 2 + (bar.low ?? NaN) / 2;
    case "hlc3":
      return (bar.high ?? NaN) / 3 + (bar.low ?? NaN) / 3 + (bar.close ?? NaN) / 3;
    case "ohlc4":
      return (
        (bar.open ?? NaN) / 4 +
        (bar.high ?? NaN) / 4 +
        (bar.low ?? NaN) / 4 +
        (bar.close ?? NaN) / 4
      );
    case "hlcc4":
      return (bar.high ?? NaN) / 4 + (bar.low ?? NaN) / 4 + (bar.close ?? NaN) / 2;
  }
}

/**
 * Fit the caller's selected, inclusive bar range in chronological order.
 * Missing required values invalidate the range instead of silently removing bars.
 * Uses TradingView's published OLS/residual-deviation example, including its
 * source-versus-fit Pearson coefficient and high/low excursion fallback:
 * https://www.tradingview.com/pine-script-docs/v4/essential/drawings/#linear-regression
 * This is not a claim of equivalence to the current proprietary drawing tool.
 */
export function calculateChartRegression(
  bars: readonly (RegressionBar | null | undefined)[],
  options: RegressionOptions = {},
): ChartRegression | null {
  const count = bars.length;
  const source = options.source ?? "close";
  const upperMultiplier = options.upperDeviation ?? 2;
  const lowerMultiplier = options.lowerDeviation ?? -2;
  const useUpper = options.useUpperDeviation ?? true;
  const useLower = options.useLowerDeviation ?? true;
  if (count < 2 || !Number.isFinite(upperMultiplier) || !Number.isFinite(lowerMultiplier))
    return null;

  const prices: number[] = [];
  let average = 0;
  for (let index = 0; index < count; index++) {
    const bar = bars[index];
    if (!bar) return null;
    const price = sourcePrice(bar, source);
    if (!Number.isFinite(price)) return null;
    if ((!useUpper && !Number.isFinite(bar.high)) || (!useLower && !Number.isFinite(bar.low)))
      return null;
    prices.push(price);
    average += (price - average) / (index + 1);
  }

  const midpoint = (count - 1) / 2;
  let sumXX = 0;
  let sumXY = 0;
  for (let index = 0; index < count; index++) {
    const x = index - midpoint;
    sumXX += x * x;
    sumXY += x * (prices[index]! - average);
  }
  const slope = sumXY / sumXX;
  const base = { start: average - slope * midpoint, end: average + slope * midpoint };
  let residualSquares = 0;
  let sourceSquares = 0;
  let fittedSquares = 0;
  let covariance = 0;
  let upperExcursion = 0;
  let lowerExcursion = 0;
  for (let index = 0; index < count; index++) {
    const price = prices[index]!;
    const fitted = average + slope * (index - midpoint);
    residualSquares += (price - fitted) ** 2;
    sourceSquares += (price - average) ** 2;
    fittedSquares += (fitted - average) ** 2;
    covariance += (price - average) * (fitted - average);
    if (!useUpper) upperExcursion = Math.max(upperExcursion, bars[index]!.high! - fitted);
    if (!useLower) lowerExcursion = Math.max(lowerExcursion, fitted - bars[index]!.low!);
  }
  const standardDeviation = Math.sqrt(residualSquares / (count - 1));
  const pearsonR =
    sourceSquares === 0 || fittedSquares === 0
      ? 0
      : Math.max(-1, Math.min(1, covariance / Math.sqrt(sourceSquares) / Math.sqrt(fittedSquares)));
  const upperOffset = useUpper ? upperMultiplier * standardDeviation : upperExcursion;
  const lowerOffset = useLower ? lowerMultiplier * standardDeviation : -lowerExcursion;
  const upper = { start: base.start + upperOffset, end: base.end + upperOffset };
  const lower = { start: base.start + lowerOffset, end: base.end + lowerOffset };
  if (
    ![
      slope,
      standardDeviation,
      pearsonR,
      base.start,
      base.end,
      upper.start,
      upper.end,
      lower.start,
      lower.end,
    ].every(Number.isFinite)
  )
    return null;
  return { count, slope, base, upper, lower, standardDeviation, pearsonR };
}
