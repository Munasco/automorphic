import type { Candle } from "./chartIndicators";
import { isChartInterval, type ChartInterval } from "./tradingIntervals";

/** Fixed-duration bars only: calendar sessions and count bars have no reliable close deadline. */
export function barCountdown(
  bar: Candle | null,
  interval: ChartInterval,
  now: number,
  state: { enabled: boolean; live: boolean; replay: boolean },
): string | null {
  if (
    !state.enabled ||
    !state.live ||
    state.replay ||
    !bar ||
    !Number.isFinite(bar.time) ||
    !Number.isFinite(now) ||
    !isChartInterval(interval) ||
    (interval.unit !== "second" && interval.unit !== "minute")
  )
    return null;
  const start = bar.time * 1000;
  const end = start + interval.value * (interval.unit === "minute" ? 60_000 : 1000);
  if (!Number.isFinite(start) || !Number.isFinite(end) || now < start || now >= end) return null;
  const seconds = Math.ceil((end - now) / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainder = String(seconds % 60).padStart(2, "0");
  return minutes >= 60
    ? `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}:${remainder}`
    : `${String(minutes).padStart(2, "0")}:${remainder}`;
}
