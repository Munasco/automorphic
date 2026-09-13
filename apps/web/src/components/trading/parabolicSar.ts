import type { Candle, IndicatorPoint } from "./chartIndicators";

const validBar = (bar: Candle) =>
  Number.isFinite(bar.time) &&
  Number.isFinite(bar.high) &&
  Number.isFinite(bar.low) &&
  Number.isFinite(bar.close) &&
  bar.high >= bar.low &&
  bar.close >= bar.low &&
  bar.close <= bar.high;

/** Two-bar initialization followed by accelerated extreme-point tracking.
 * Reversal checks precede the previous-two-bar clamp; touching SAR is not a reversal.
 * Callers supply distinct chronological candles. Invalid ranges restart initialization.
 */
export function calculateParabolicSAR(
  bars: readonly Candle[],
  start = 0.02,
  increment = 0.02,
  maximum = 0.2,
): IndicatorPoint[] {
  if (
    ![start, increment, maximum].every((value) => Number.isFinite(value) && value >= 0) ||
    maximum < start
  )
    return [];
  const points: IndicatorPoint[] = [];
  let previous: Candle | undefined;
  let older: Candle | undefined;
  let state: { sar: number; extreme: number; acceleration: number; up: boolean } | undefined;
  for (const bar of bars) {
    if (!validBar(bar)) {
      previous = undefined;
      older = undefined;
      state = undefined;
      continue;
    }
    if (!previous) {
      previous = bar;
      continue;
    }
    let first = !state;
    if (!state) {
      const up = bar.close > previous.close;
      state = {
        sar: up ? previous.low : previous.high,
        extreme: up ? bar.high : bar.low,
        acceleration: start,
        up,
      };
    }
    let { sar, extreme, acceleration, up } = state;
    sar += acceleration * (extreme - sar);
    if (!Number.isFinite(sar)) {
      state = undefined;
      older = undefined;
      previous = bar;
      continue;
    }
    if (up ? sar > bar.low : sar < bar.high) {
      sar = up ? Math.max(bar.high, extreme) : Math.min(bar.low, extreme);
      up = !up;
      extreme = up ? bar.high : bar.low;
      acceleration = start;
      first = true;
    }
    if (!first && (up ? bar.high > extreme : bar.low < extreme)) {
      extreme = up ? bar.high : bar.low;
      acceleration = Math.min(acceleration + increment, maximum);
    }
    sar = up
      ? Math.min(sar, previous.low, older?.low ?? previous.low)
      : Math.max(sar, previous.high, older?.high ?? previous.high);
    points.push({ time: bar.time, value: sar });
    state = { sar, extreme, acceleration, up };
    older = previous;
    previous = bar;
  }
  return points;
}
