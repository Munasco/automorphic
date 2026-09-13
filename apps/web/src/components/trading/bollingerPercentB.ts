import { calculateBollingerBands } from "./advancedIndicators";
import { sourcePrice, type Candle, type IndicatorPoint, type PriceSource } from "./chartIndicators";

/** Position of the selected price within standard SMA/population-deviation bands.
 * Values below zero and above one are intentional. Zero-width windows have no
 * reading; invalid selected prices/timestamps restart the underlying band warmup.
 * Callers supply distinct chronological candles.
 */
export function calculateBollingerPercentB(
  bars: readonly Candle[],
  period = 20,
  deviations = 2,
  source: PriceSource = "close",
): IndicatorPoint[] {
  if (
    !Number.isSafeInteger(period) ||
    period < 1 ||
    !Number.isFinite(deviations) ||
    deviations <= 0
  )
    return [];
  const bands = calculateBollingerBands(bars, period, deviations, source);
  const prices = new Map(bars.map((bar) => [bar.time, sourcePrice(bar, source)]));
  const result: IndicatorPoint[] = [];
  for (let index = 0; index < bands.upper.length; index++) {
    const upper = bands.upper[index]!;
    const lower = bands.lower[index]!.value;
    const price = prices.get(upper.time)!;
    if (upper.value === lower) continue;
    const width = upper.value - lower;
    const distance = price - lower;
    let value = distance / width;
    if (!Number.isFinite(width) || !Number.isFinite(distance)) {
      const scale = Math.max(Math.abs(upper.value), Math.abs(lower), Math.abs(price));
      value = (price / scale - lower / scale) / (upper.value / scale - lower / scale);
    }
    if (Number.isFinite(value)) result.push({ time: upper.time, value });
  }
  return result;
}
