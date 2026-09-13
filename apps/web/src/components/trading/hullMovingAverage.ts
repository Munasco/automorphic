import { sourcePrice, type Candle, type IndicatorPoint, type PriceSource } from "./chartIndicators";

function weightedAverage(values: readonly number[], count: number): number {
  const start = values.length - count;
  const baseline = values[start]!;
  const totalWeight = (count * (count + 1)) / 2;
  let offset = 0;
  for (let index = 0; index < count; index++)
    offset += (values[start + index]! - baseline) * ((index + 1) / totalWeight);
  if (!Number.isFinite(offset)) {
    // Opposite-sign finite extremes can overflow the baseline subtraction.
    let weighted = 0;
    for (let index = 0; index < count; index++)
      weighted += values[start + index]! * ((index + 1) / totalWeight);
    return weighted;
  }
  return baseline + offset;
}

/** Alan Hull's original Integer() convention truncates both derived lengths:
 * WMA(2 * WMA(source, floor(n / 2)) - WMA(source, n), floor(sqrt(n))).
 * Derived lengths are at least one. Distinct chronological bars are required;
 * invalid selected prices/timestamps restart warmup, and no future bars are used.
 * https://alanhull.com/the-hull-moving-average/
 */
export function calculateHullMovingAverage(
  bars: readonly Candle[],
  period = 9,
  source: PriceSource = "close",
): IndicatorPoint[] {
  if (!Number.isSafeInteger(period) || period < 1) return [];
  const half = Math.max(1, Math.floor(period / 2));
  const root = Math.max(1, Math.floor(Math.sqrt(period)));
  const prices: number[] = [];
  const differences: number[] = [];
  const result: IndicatorPoint[] = [];
  for (const bar of bars) {
    const price = sourcePrice(bar, source);
    if (!Number.isFinite(bar.time) || !Number.isFinite(price)) {
      prices.length = 0;
      differences.length = 0;
      continue;
    }
    prices.push(price);
    if (prices.length > period) prices.shift();
    if (prices.length < period) continue;
    const fast = weightedAverage(prices, half);
    // Equivalent to 2 * fast - slow without overflowing a finite flat price.
    const difference = fast + (fast - weightedAverage(prices, period));
    if (!Number.isFinite(difference)) {
      differences.length = 0;
      continue;
    }
    differences.push(difference);
    if (differences.length > root) differences.shift();
    if (differences.length < root) continue;
    const value = weightedAverage(differences, root);
    if (Number.isFinite(value)) result.push({ time: bar.time, value });
    else differences.length = 0;
  }
  return result;
}
