// @effect-diagnostics globalDate:off - Quote timestamps are feed-supplied bucket evidence.
import { calendarPeriodStart } from "./calendarSeries.ts";
import type { ChartIntervalUnit } from "./chartInterval.ts";
import type { Candle } from "./marketData.ts";

export type BarProvenance = "historical" | "warmup" | "live";

/** A subscription rollover is evidence of completion; elapsed wall time is not.
 * Each connection starts unarmed so its initial live snapshot cannot replay closes.
 * Late history/corrections never advance this cursor or finalize a bar twice.
 */
export function createBarFinalizer() {
  let current: Candle | undefined;
  return {
    accept(
      bars: readonly Candle[],
      provenance: BarProvenance,
      sourceTimes?: ReadonlyMap<number, number>,
    ) {
      const closed: { bar: Candle; closedAt: number }[] = [];
      if (provenance !== "live" || !bars.length) return closed;
      const ordered = [...bars].sort((a, b) => a.time - b.time);
      if (!current) {
        current = { ...ordered.at(-1)! };
        return closed;
      }
      for (const next of ordered) {
        if (next.time < current.time) continue;
        if (next.time === current.time) {
          current = { ...next };
          continue;
        }
        // Count-bar display times may be synthetic; use their actual feed time.
        // Time-bar timestamps identify the new period, not the packet arrival time.
        const closedAt = (sourceTimes?.get(next.time) ?? next.actualTime ?? next.time) * 1000;
        if (Number.isFinite(closedAt))
          closed.push({ bar: { ...current, complete: true }, closedAt });
        current = { ...next };
      }
      return closed;
    },
  };
}

export function chartProvenance(
  id: number,
  historicalId: number | undefined,
  realtimeId: number | undefined,
  historyComplete: boolean,
): BarProvenance {
  if (id === historicalId && (historicalId !== realtimeId || !historyComplete)) return "historical";
  return id === realtimeId && historyComplete ? "live" : "warmup";
}

/** A quote must belong to an already observed live bucket. Count bars require a trade
 * identity that quote packets do not contain, even when their timestamps coincide. */
export function quoteBarTime(
  timestamp: string | undefined,
  current: Candle | undefined,
  unit: ChartIntervalUnit,
  size: number,
): number | undefined {
  if (!timestamp || !current || unit === "tick") return undefined;
  const time = Date.parse(timestamp) / 1000;
  if (!Number.isFinite(time)) return undefined;
  if (unit === "week" || unit === "month")
    return calendarPeriodStart(time, unit, size) === current.time ? current.time : undefined;
  const duration = size * (unit === "second" ? 1 : unit === "minute" ? 60 : 86400);
  return time >= current.time && time < current.time + duration ? current.time : undefined;
}
