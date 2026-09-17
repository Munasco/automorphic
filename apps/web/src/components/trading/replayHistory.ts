import type { Candle } from "./chartIndicators";

/** Copy the loaded history and omit the last bar, which may still be forming. */
export function createReplayHistory(bars: readonly Candle[]): readonly Candle[] {
  const sorted = [...new Map(bars.map((bar) => [bar.time, { ...bar }])).values()].sort(
    (a, b) => a.time - b.time,
  );
  return sorted.slice(0, -1);
}

export function replayIndex(index: number, length: number) {
  return Math.max(0, Math.min(length - 1, Math.trunc(Number.isFinite(index) ? index : 0)));
}

export function replayPrefix(bars: readonly Candle[], index: number) {
  return bars.slice(0, replayIndex(index, bars.length) + 1);
}

/** A timestamp between candles selects the most recent candle at or before it. */
export function replayIndexAt(bars: readonly Candle[], timestamp: number): number | null {
  if (!bars.length || !Number.isFinite(timestamp)) return null;
  const first = bars[0]!.actualTime ?? bars[0]!.time;
  const last = bars.at(-1)!.actualTime ?? bars.at(-1)!.time;
  if (timestamp < first || timestamp > last) return null;
  for (let index = bars.length - 1; index >= 0; index -= 1)
    if ((bars[index]!.actualTime ?? bars[index]!.time) <= timestamp) return index;
  return null;
}

/** Auxiliary minute bars must have closed by the replay boundary. */
export function replayMinuteHistory(bars: readonly Candle[], through: number) {
  return bars.filter((bar) => (bar.actualEndTime ?? (bar.actualTime ?? bar.time) + 60) <= through);
}
