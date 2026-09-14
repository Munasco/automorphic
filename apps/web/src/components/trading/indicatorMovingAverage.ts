import { calculateEMA, calculateSMA, type Candle, type IndicatorPoint } from "./chartIndicators";
import { calculateWeightedMovingAverage } from "./weightedMovingAverage";

export type IndicatorMovingAverageType = "sma" | "ema" | "rma" | "wma" | "vwma";

/** Smooth indicator readings on their original chart timeline; missing readings reset warmup. */
export function calculateIndicatorMovingAverage(
  bars: readonly (Pick<Candle, "time"> & Partial<Pick<Candle, "volume">>)[],
  points: readonly IndicatorPoint[],
  period: number,
  type: IndicatorMovingAverageType,
): IndicatorPoint[] {
  if (
    !Number.isSafeInteger(period) ||
    period < 1 ||
    period > bars.length ||
    (type !== "sma" && type !== "ema" && type !== "rma" && type !== "wma" && type !== "vwma")
  )
    return [];
  const readings = new Map(points.map((point) => [point.time, point.value]));
  if (type === "vwma") {
    const window: { value: number; volume: number }[] = [];
    const result: IndicatorPoint[] = [];
    for (const bar of bars) {
      const value = readings.get(bar.time);
      if (
        !Number.isFinite(bar.time) ||
        value === undefined ||
        !Number.isFinite(value) ||
        bar.volume === undefined ||
        !Number.isFinite(bar.volume) ||
        bar.volume < 0
      ) {
        window.length = 0;
        continue;
      }
      window.push({ value, volume: bar.volume });
      if (window.length > period) window.shift();
      if (window.length < period) continue;
      let maxVolume = 0,
        maxValue = 0;
      for (const sample of window) {
        maxVolume = Math.max(maxVolume, sample.volume);
        if (sample.volume > 0) maxValue = Math.max(maxValue, Math.abs(sample.value));
      }
      if (maxVolume === 0) continue;
      let weighted = 0,
        weight = 0;
      for (const sample of window) {
        const normalizedVolume = sample.volume / maxVolume;
        weight += normalizedVolume;
        if (normalizedVolume > 0 && maxValue > 0)
          weighted += (sample.value / maxValue) * normalizedVolume;
      }
      // Normalize both factors before summing; neither huge volumes nor readings overflow.
      // A weighted mean remains in the normalized range despite floating-point rounding.
      const average = Math.max(-1, Math.min(1, weighted / weight)) * maxValue;
      if (Number.isFinite(average)) result.push({ time: bar.time, value: average });
    }
    return result;
  }
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
