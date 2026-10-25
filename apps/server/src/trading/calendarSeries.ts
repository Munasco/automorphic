// @effect-diagnostics globalDate:off - Calendar buckets use UTC dates from native daily bars.
import type { Candle } from "./marketData.ts";

export function calendarPeriodStart(time: number, unit: "week" | "month", size: number): number {
  const date = new Date(time * 1000);
  if (unit === "month") {
    return Date.UTC(date.getUTCFullYear(), Math.floor(date.getUTCMonth() / size) * size, 1) / 1000;
  }
  const midnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return (midnight - ((date.getUTCDay() + 6) % 7) * 86_400_000) / 1000;
}

/** Replacing daily values prevents duplicate history and live updates from inflating volume. */
export function createCalendarSeries(unit: "week" | "month", size: number) {
  const daily = new Map<number, Candle>();
  const realtime = new Set<number>();
  return {
    accept(bars: readonly Candle[], historical: boolean): Candle[] {
      for (const bar of bars) {
        if (historical && realtime.has(bar.time)) continue;
        daily.set(bar.time, bar);
        if (!historical) realtime.add(bar.time);
      }
      const ordered = [...daily.values()].sort((a, b) => a.time - b.time);
      const result = new Map<number, Candle>();
      for (const bar of ordered) {
        const time = calendarPeriodStart(bar.time, unit, size);
        const previous = result.get(time);
        if (previous) {
          previous.high = Math.max(previous.high, bar.high);
          previous.low = Math.min(previous.low, bar.low);
          previous.close = bar.close;
          previous.volume += bar.volume;
        } else {
          result.set(time, { ...bar, time });
        }
      }
      return [...result.values()];
    },
  };
}
