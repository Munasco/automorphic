import { calculateBollingerBands } from "./advancedIndicators";
import type { Candle, IndicatorPoint, PriceSource } from "./chartIndicators";

/** Standard band width as a percentage of its SMA basis. Zero bases are undefined;
 * negative bases retain the signed ratio. Missing selected prices restart warmup.
 */
export function calculateBollingerBandwidth(
  bars: readonly Candle[],
  period = 20,
  deviations = 2,
  source: PriceSource = "close",
): IndicatorPoint[] {
  const bands = calculateBollingerBands(bars, period, deviations, source);
  const result: IndicatorPoint[] = [];
  for (let index = 0; index < bands.middle.length; index++) {
    const middle = bands.middle[index]!;
    if (middle.value === 0) continue;
    const upper = bands.upper[index]!.value;
    const lower = bands.lower[index]!.value;
    const width = upper - lower;
    // Divide before multiplying by 100, and before subtraction if width overflows.
    const ratio = Number.isFinite(width)
      ? width / middle.value
      : upper / middle.value - lower / middle.value;
    const value = width === 0 ? 0 : ratio * 100;
    if (Number.isFinite(value)) result.push({ time: middle.time, value });
  }
  return result;
}

/** Rolling extrema use chart-bar windows, including missing widths, with partial warmup.
 * A missing current width emits no point; it does not stop older widths from expiring.
 * Callers supply distinct chronological chart bars.
 */
export function calculateBollingerBandwidthExtremes(
  bars: readonly { time: number }[],
  bandwidth: readonly IndicatorPoint[],
  expansionLength = 125,
  contractionLength = 125,
): { highest: IndicatorPoint[]; lowest: IndicatorPoint[] } {
  const widths = new Map(bandwidth.map((point) => [point.time, point.value]));
  const rolling = (length: number, highest: boolean): IndicatorPoint[] => {
    if (!Number.isSafeInteger(length) || length < 1) return [];
    const result: IndicatorPoint[] = [];
    const queue: { index: number; value: number }[] = [];
    let head = 0;
    for (let index = 0; index < bars.length; index++) {
      while (head < queue.length && queue[head]!.index <= index - length) head++;
      const time = bars[index]!.time;
      const value = widths.get(time);
      if (Number.isFinite(time) && value !== undefined && Number.isFinite(value)) {
        while (
          queue.length > head &&
          (highest ? queue.at(-1)!.value <= value : queue.at(-1)!.value >= value)
        )
          queue.pop();
        queue.push({ index, value });
        result.push({ time, value: queue[head]!.value });
      }
      // Reclaim expired storage without an O(window) shift on every chart bar.
      if (head > 1024 && head * 2 >= queue.length) {
        queue.splice(0, head);
        head = 0;
      }
    }
    return result;
  };
  return { highest: rolling(expansionLength, true), lowest: rolling(contractionLength, false) };
}
