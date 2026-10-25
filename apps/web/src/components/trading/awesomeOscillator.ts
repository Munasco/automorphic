import type { Candle, IndicatorPoint } from "./chartIndicators";

/** Difference between fast and slow simple averages of HL2 (defaults 5 and 34).
 * Distinct chronological candles are required. Invalid timestamps or price ranges
 * restart warmup. Colors belong to the renderer, not the calculation.
 */
export function calculateAwesomeOscillator(
  bars: readonly Candle[],
  fast = 5,
  slow = 34,
): IndicatorPoint[] {
  if (!Number.isSafeInteger(fast) || !Number.isSafeInteger(slow) || fast < 1 || fast >= slow)
    return [];
  const prices: number[] = [];
  const result: IndicatorPoint[] = [];
  for (const bar of bars) {
    if (
      !Number.isFinite(bar.time) ||
      !Number.isFinite(bar.high) ||
      !Number.isFinite(bar.low) ||
      bar.high < bar.low
    ) {
      prices.length = 0;
      continue;
    }
    prices.push(bar.high / 2 + bar.low / 2);
    if (prices.length > slow) prices.shift();
    if (prices.length < slow) continue;
    const baseline = prices[0]!;
    let fastOffset = 0;
    let slowOffset = 0;
    for (let index = 0; index < slow; index++) {
      const offset = prices[index]! - baseline;
      slowOffset += offset / slow;
      if (index >= slow - fast) fastOffset += offset / fast;
    }
    let value = fastOffset - slowOffset;
    if (!Number.isFinite(value)) {
      // Opposite-sign extremes can overflow baseline subtraction even when the
      // weighted means and their difference remain representable.
      let fastAverage = 0;
      let slowAverage = 0;
      for (let index = 0; index < slow; index++) {
        slowAverage += prices[index]! / slow;
        if (index >= slow - fast) fastAverage += prices[index]! / fast;
      }
      value = fastAverage - slowAverage;
    }
    if (Number.isFinite(value)) result.push({ time: bar.time, value });
  }
  return result;
}
