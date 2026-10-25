import {
  calculateEMA,
  type Candle,
  type IndicatorPoint,
  type PriceSource,
} from "./chartIndicators";
import { calculateIndicatorMovingAverage } from "./indicatorMovingAverage";

/** DEMA = 2 * EMA(source, n) - EMA(EMA(source, n), n).
 * Both stages use our SMA-seeded EMA convention; missing readings restart warmup.
 */
export function calculateDoubleExponentialMovingAverage(
  bars: readonly Candle[],
  period = 9,
  source: PriceSource = "close",
): IndicatorPoint[] {
  const first = calculateEMA(bars, period, source);
  const second = calculateIndicatorMovingAverage(bars, first, period, "ema");
  const readings = new Map(first.map((point) => [point.time, point.value]));
  const result: IndicatorPoint[] = [];
  for (const point of second) {
    const initial = readings.get(point.time)!;
    // Avoid overflowing 2 * initial when the final value is still representable.
    const value = initial + (initial - point.value);
    if (Number.isFinite(value)) result.push({ time: point.time, value });
  }
  return result;
}
