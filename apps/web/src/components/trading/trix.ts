import {
  calculateEMA,
  PRICE_SOURCES,
  type Candle,
  type IndicatorPoint,
  type PriceSource,
} from "./chartIndicators";
import { calculateIndicatorMovingAverage } from "./indicatorMovingAverage";

/** One-bar percent change of a triple EMA, with an independently warmed EMA signal. */
export function calculateTRIX(
  bars: readonly Candle[],
  period = 18,
  source: PriceSource = "close",
  signalPeriod = 9,
): { trix: IndicatorPoint[]; signal: IndicatorPoint[] } {
  if (!PRICE_SOURCES.includes(source)) return { trix: [], signal: [] };
  const first = calculateEMA(bars, period, source);
  const second = calculateIndicatorMovingAverage(bars, first, period, "ema");
  const third = calculateIndicatorMovingAverage(bars, second, period, "ema");
  const readings = new Map(third.map((point) => [point.time, point.value]));
  const trix: IndicatorPoint[] = [];
  let previous: number | undefined;
  // Walk chart bars rather than the compact readings array so gaps cannot create a false return.
  for (const bar of bars) {
    const current = Number.isFinite(bar.time) ? readings.get(bar.time) : undefined;
    if (current === undefined || !Number.isFinite(current)) {
      previous = undefined;
      continue;
    }
    if (previous !== undefined && previous !== 0) {
      const delta = current - previous;
      // Subtraction preserves small returns; ratio form avoids overflow across opposite extremes.
      const value = (Number.isFinite(delta) ? delta / previous : current / previous - 1) * 100;
      if (Number.isFinite(value)) trix.push({ time: bar.time, value });
    }
    previous = current;
  }
  return {
    trix,
    signal: calculateIndicatorMovingAverage(bars, trix, signalPeriod, "ema"),
  };
}
