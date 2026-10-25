import { calculateATR } from "./advancedIndicators";
import type { Candle, IndicatorPoint } from "./chartIndicators";

export interface SupertrendResult {
  points: IndicatorPoint[];
  upSegments: IndicatorPoint[][];
  downSegments: IndicatorPoint[][];
  reading: number | undefined;
}

const validBar = (bar: Candle) =>
  Number.isFinite(bar.time) &&
  Number.isFinite(bar.high) &&
  Number.isFinite(bar.low) &&
  Number.isFinite(bar.close) &&
  bar.high >= bar.low &&
  bar.close >= bar.low &&
  bar.close <= bar.high;

/** Final-band ratchets and close-based reversals, with Wilder ATR.
 * Callers supply distinct chronological candles. Invalid ranges restart warmup.
 * Each directional segment must be rendered separately or with explicit gaps.
 */
export function calculateSupertrend(
  bars: readonly Candle[],
  period = 10,
  multiplier = 3,
): SupertrendResult {
  const result: SupertrendResult = {
    points: [],
    upSegments: [],
    downSegments: [],
    reading: undefined,
  };
  if (!Number.isSafeInteger(period) || period < 1 || !Number.isFinite(multiplier) || multiplier < 0)
    return result;

  const calculateSegment = (segment: readonly Candle[]) => {
    result.reading = undefined;
    const atr = new Map(
      calculateATR(segment, period, "rma").map((point) => [point.time, point.value]),
    );
    let previous: { upper: number; lower: number; close: number; value: number } | undefined;
    let active: IndicatorPoint[] | undefined;
    let wasUp = false;
    for (const bar of segment) {
      result.reading = undefined;
      const range = atr.get(bar.time);
      if (range === undefined) {
        previous = undefined;
        active = undefined;
        continue;
      }
      const middle = bar.high / 2 + bar.low / 2;
      const basicUpper = middle + multiplier * range;
      const basicLower = middle - multiplier * range;
      if (!Number.isFinite(basicUpper) || !Number.isFinite(basicLower)) {
        previous = undefined;
        active = undefined;
        continue;
      }
      const upper =
        !previous || basicUpper < previous.upper || previous.close > previous.upper
          ? basicUpper
          : previous.upper;
      const lower =
        !previous || basicLower > previous.lower || previous.close < previous.lower
          ? basicLower
          : previous.lower;
      const up = previous
        ? previous.value === previous.upper
          ? bar.close > upper
          : bar.close >= lower
        : false;
      const value = up ? lower : upper;
      const point = { time: bar.time, value };
      if (!active || up !== wasUp) {
        active = [];
        (up ? result.upSegments : result.downSegments).push(active);
      }
      active.push(point);
      result.points.push(point);
      result.reading = value;
      previous = { upper, lower, close: bar.close, value };
      wasUp = up;
    }
  };
  let segment: Candle[] = [];
  for (const bar of bars) {
    if (validBar(bar)) segment.push(bar);
    else {
      if (segment.length) calculateSegment(segment);
      segment = [];
      result.reading = undefined;
    }
  }
  if (segment.length) calculateSegment(segment);
  return result;
}
