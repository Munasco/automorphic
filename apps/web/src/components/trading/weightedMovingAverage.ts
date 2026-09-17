import { sourcePrice, type Candle, type IndicatorPoint, type PriceSource } from "./chartIndicators";

/** Linear weights from 1 (oldest) to period (newest), divided by their sum.
 * Callers supply distinct chronological candles. Invalid selected prices or times
 * restart warmup; unused price components and volume do not affect the average.
 */
export function calculateWeightedMovingAverage(
  bars: readonly Candle[],
  period = 9,
  source: PriceSource = "close",
): IndicatorPoint[] {
  if (!Number.isSafeInteger(period) || period < 1) return [];
  const prices: number[] = [];
  const result: IndicatorPoint[] = [];
  const totalWeight = (period * (period + 1)) / 2;
  for (const bar of bars) {
    const price = sourcePrice(bar, source);
    if (!Number.isFinite(bar.time) || !Number.isFinite(price)) {
      prices.length = 0;
      continue;
    }
    prices.push(price);
    if (prices.length > period) prices.shift();
    if (prices.length < period) continue;
    const baseline = prices[0]!;
    let offset = 0;
    for (let index = 0; index < period; index++)
      offset += (prices[index]! - baseline) * ((index + 1) / totalWeight);
    let value = baseline + offset;
    if (!Number.isFinite(value)) {
      // Opposite-sign extreme prices may overflow their difference. Normalized
      // weights keep each direct product within the original finite price range.
      value = 0;
      for (let index = 0; index < period; index++)
        value += prices[index]! * ((index + 1) / totalWeight);
    }
    if (Number.isFinite(value)) result.push({ time: bar.time, value });
  }
  return result;
}
