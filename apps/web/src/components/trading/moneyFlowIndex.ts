import type { Candle, IndicatorPoint } from "./chartIndicators";

/** Volume-weighted typical-price movement over `period` comparisons.
 * Callers supply distinct chronological candles. Equal typical prices contribute
 * neither positive nor negative flow; a window with no flow is neutral (50).
 * Invalid inputs, negative volume/typical price, or overflowing flow restart warmup.
 */
export function calculateMoneyFlowIndex(bars: readonly Candle[], period = 14): IndicatorPoint[] {
  if (!Number.isSafeInteger(period) || period < 1) return [];
  const result: IndicatorPoint[] = [];
  const window: { positive: number; negative: number }[] = [];
  let previous: number | undefined;
  let cursor = 0;
  let positive = 0;
  let negative = 0;
  let positiveCount = 0;
  let negativeCount = 0;
  const reset = () => {
    window.length = 0;
    previous = undefined;
    cursor = 0;
    positive = 0;
    negative = 0;
    positiveCount = 0;
    negativeCount = 0;
  };
  for (const bar of bars) {
    const typical = (bar.high + bar.low + bar.close) / 3;
    const flow = typical * bar.volume;
    if (
      !Number.isFinite(bar.time) ||
      !Number.isFinite(bar.high) ||
      !Number.isFinite(bar.low) ||
      !Number.isFinite(bar.close) ||
      !Number.isFinite(bar.volume) ||
      bar.high < bar.low ||
      bar.close < bar.low ||
      bar.close > bar.high ||
      bar.volume < 0 ||
      typical < 0 ||
      !Number.isFinite(flow)
    ) {
      reset();
      continue;
    }
    if (previous === undefined) {
      previous = typical;
      continue;
    }
    const next = {
      positive: typical > previous ? flow : 0,
      negative: typical < previous ? flow : 0,
    };
    previous = typical;
    const expired = window[cursor];
    positiveCount += Number(next.positive > 0) - Number((expired?.positive ?? 0) > 0);
    negativeCount += Number(next.negative > 0) - Number((expired?.negative ?? 0) > 0);
    // Removing the last contributing bar must remove rounding residue too.
    positive = positiveCount ? Math.max(0, positive - (expired?.positive ?? 0)) + next.positive : 0;
    negative = negativeCount ? Math.max(0, negative - (expired?.negative ?? 0)) + next.negative : 0;
    if (!Number.isFinite(positive) || !Number.isFinite(negative)) {
      reset();
      continue;
    }
    window[cursor] = next;
    cursor = (cursor + 1) % period;
    if (window.length < period) continue;
    // Ratio form avoids overflowing positive + negative and handles one-sided flow.
    const ratio = positive < negative ? positive / negative : negative / positive;
    const value =
      positive === 0 && negative === 0
        ? 50
        : positive < negative
          ? (100 * ratio) / (1 + ratio)
          : 100 / (1 + ratio);
    result.push({ time: bar.time, value });
  }
  return result;
}
