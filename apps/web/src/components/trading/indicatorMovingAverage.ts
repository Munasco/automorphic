import { calculateEMA, calculateSMA, type Candle, type IndicatorPoint } from "./chartIndicators";
import { calculateWeightedMovingAverage } from "./weightedMovingAverage";

export type IndicatorMovingAverageType = "sma" | "ema" | "rma" | "wma";

/** Smooth indicator readings on their original chart timeline; missing readings reset warmup. */
export function calculateIndicatorMovingAverage(
  bars: readonly Pick<Candle, "time">[],
  points: readonly IndicatorPoint[],
  period: number,
  type: IndicatorMovingAverageType,
): IndicatorPoint[] {
  if (
    !Number.isSafeInteger(period) ||
    period < 1 ||
    period > bars.length ||
    (type !== "sma" && type !== "ema" && type !== "rma" && type !== "wma")
  )
    return [];
  const readings = new Map(points.map((point) => [point.time, point.value]));
  const aligned: Candle[] = bars.map(({ time }) => {
    const value = readings.get(time) ?? NaN;
    return { time, close: value, open: value, high: value, low: value, volume: 0 };
  });
  if (type === "sma") return calculateSMA(aligned, period);
  if (type === "ema") return calculateEMA(aligned, period);
  if (type === "wma") return calculateWeightedMovingAverage(aligned, period);

  const result: IndicatorPoint[] = [];
  const alpha = 1 / period;
  let count = 0;
  let value = 0;
  for (const bar of aligned) {
    if (!Number.isFinite(bar.time) || !Number.isFinite(bar.close)) {
      count = 0;
      value = 0;
      continue;
    }
    if (count < period) {
      count++;
      value = value * ((count - 1) / count) + bar.close / count;
    } else value = value * (1 - alpha) + bar.close * alpha;
    if (count === period && Number.isFinite(value)) result.push({ time: bar.time, value });
  }
  return result;
}
