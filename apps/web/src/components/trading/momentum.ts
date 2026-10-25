import {
  sourcePrice,
  PRICE_SOURCES,
  type Candle,
  type IndicatorPoint,
  type PriceSource,
} from "./chartIndicators";

/** Price-unit change from exactly N chart bars ago; missing readings restart the lookback. */
export function calculateMomentum(
  bars: readonly Candle[],
  period = 10,
  source: PriceSource = "close",
): IndicatorPoint[] {
  if (
    !Number.isSafeInteger(period) ||
    period < 1 ||
    period >= bars.length ||
    !PRICE_SOURCES.includes(source)
  )
    return [];
  const result: IndicatorPoint[] = [];
  let contiguous = 0;
  for (let index = 0; index < bars.length; index++) {
    const bar = bars[index]!;
    const current = sourcePrice(bar, source);
    if (!Number.isFinite(bar.time) || !Number.isFinite(current)) {
      contiguous = 0;
      continue;
    }
    contiguous++;
    if (contiguous <= period) continue;
    const value = current - sourcePrice(bars[index - period]!, source);
    if (Number.isFinite(value)) result.push({ time: bar.time, value: value === 0 ? 0 : value });
  }
  return result;
}
