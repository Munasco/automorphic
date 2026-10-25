import {
  calculateEMA,
  type Candle,
  type IndicatorPoint,
  type PriceSource,
} from "./chartIndicators";
import { calculateIndicatorMovingAverage } from "./indicatorMovingAverage";

/** TEMA = 3 * EMA1 - 3 * EMA2 + EMA3. Each SMA-seeded stage restarts after a gap. */
export function calculateTripleExponentialMovingAverage(
  bars: readonly Candle[],
  period = 9,
  source: PriceSource = "close",
): IndicatorPoint[] {
  const first = calculateEMA(bars, period, source);
  const second = calculateIndicatorMovingAverage(bars, first, period, "ema");
  const third = calculateIndicatorMovingAverage(bars, second, period, "ema");
  const firstReadings = new Map(first.map((point) => [point.time, point.value]));
  const secondReadings = new Map(second.map((point) => [point.time, point.value]));
  const result: IndicatorPoint[] = [];
  for (const point of third) {
    const initial = firstReadings.get(point.time)!;
    const double = secondReadings.get(point.time)!;
    // Subtract before multiplying so large, similar EMA values do not overflow separately.
    const value = 3 * (initial - double) + point.value;
    if (Number.isFinite(value)) result.push({ time: point.time, value });
  }
  return result;
}
