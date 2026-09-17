import { calculateBollingerBands } from "./advancedIndicators";
import type { Candle, IndicatorPoint } from "./chartIndicators";

/** Standard SMA/population-deviation bands over indicator readings on the original chart timeline. */
export function calculateIndicatorBollingerBands(
  bars: readonly Pick<Candle, "time">[],
  points: readonly IndicatorPoint[],
  period: number,
  deviations: number,
): ReturnType<typeof calculateBollingerBands> {
  const readings = new Map(points.map((point) => [point.time, point.value]));
  const aligned: Candle[] = bars.map(({ time }) => {
    const value = readings.get(time) ?? NaN;
    return { time, open: value, high: value, low: value, close: value, volume: 0 };
  });
  return calculateBollingerBands(aligned, period, deviations);
}
