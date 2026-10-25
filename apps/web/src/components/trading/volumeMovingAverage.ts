import type { Candle, IndicatorPoint } from "./chartIndicators";

/** SMA of chronological candle volumes; missing or negative volume restarts warmup. */
export function calculateVolumeMovingAverage(
  bars: readonly Candle[],
  period = 20,
): IndicatorPoint[] {
  if (!Number.isSafeInteger(period) || period < 1) return [];
  const window: number[] = [];
  const result: IndicatorPoint[] = [];
  for (const bar of bars) {
    if (!Number.isFinite(bar.time) || !Number.isFinite(bar.volume) || bar.volume < 0) {
      window.length = 0;
      continue;
    }
    window.push(bar.volume);
    if (window.length > period) window.shift();
    if (window.length < period) continue;
    // Center before summing to preserve flat values and avoid overflowing raw totals.
    const baseline = window[0]!;
    let offset = 0;
    for (const volume of window) offset += (volume - baseline) / period;
    const value = baseline + offset;
    if (Number.isFinite(value)) result.push({ time: bar.time, value });
  }
  return result;
}
