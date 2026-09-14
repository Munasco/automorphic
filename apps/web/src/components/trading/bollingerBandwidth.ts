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
