import type { Candle, IndicatorPoint } from "./chartIndicators";
import type { IndicatorFill } from "./indicatorDefinition";

/** Fill between constant levels only where consecutive chart bars have valid readings. */
export function indicatorLevelFills(
  bars: readonly Pick<Candle, "time">[],
  points: readonly IndicatorPoint[],
  lower: number,
  upper: number,
): IndicatorFill[] {
  if (!Number.isFinite(lower) || !Number.isFinite(upper) || lower >= upper) return [];
  const readings = new Map(points.map((point) => [point.time, point.value]));
  const result: IndicatorFill[] = [];
  const occurrences = new Map<number, number>();
  let times: number[] = [];
  const flush = () => {
    if (times.length >= 2) {
      const first = times[0]!;
      const occurrence = occurrences.get(first) ?? 0;
      occurrences.set(first, occurrence + 1);
      result.push({
        id: `background-${first}${occurrence ? `-${occurrence}` : ""}`,
        styleKey: "background",
        lower: times.map((time) => ({ time, value: lower })),
        upper: times.map((time) => ({ time, value: upper })),
      });
    }
    times = [];
  };
  for (const { time } of bars) {
    const value = readings.get(time);
    if (Number.isFinite(time) && value !== undefined && Number.isFinite(value)) times.push(time);
    else flush();
  }
  flush();
  return result;
}
