import type { Candle } from "./chartIndicators";

export interface RollEvent {
  readonly id: string;
  readonly root: string;
  readonly timestamp: number; // UTC seconds
  readonly fromContract: string;
  readonly toContract: string;
  readonly spread: number; // delta = close(new) - close(old)
  readonly formattedDate: string;
}

/**
 * Calculates the Panama back-adjustment offset for a given timestamp.
 * Historical bars prior to a roll date are shifted by the cumulative spread
 * of all subsequent rollover events so that the current front month reflects
 * true market prices without artificial cliffs in history.
 */
export function calculateBackAdjustmentOffset(
  time: number,
  rollEvents: readonly RollEvent[],
): number {
  let offset = 0;
  for (const event of rollEvents) {
    if (event.timestamp > time) {
      offset += event.spread;
    }
  }
  return offset;
}

/**
 * Applies or removes Panama back-adjustment from a series of candles.
 */
export function applyBackAdjustment(
  bars: readonly Candle[],
  rollEvents: readonly RollEvent[],
  enabled = true,
): readonly Candle[] {
  if (!enabled || !rollEvents.length || !bars.length) {
    return bars;
  }

  // Pre-sort roll events chronologically
  const sortedEvents = [...rollEvents].sort((a, b) => a.timestamp - b.timestamp);

  // Quick optimization: if all bars are after the latest roll event, no offset needed
  const earliestRoll = sortedEvents[0]!.timestamp;
  const latestBar = bars[bars.length - 1]!.time;
  if (latestBar < earliestRoll && sortedEvents.length === 0) {
    return bars;
  }

  return bars.map((bar) => {
    const offset = calculateBackAdjustmentOffset(bar.time, sortedEvents);
    if (offset === 0) return bar;
    return {
      ...bar,
      open: Number((bar.open + offset).toFixed(4)),
      high: Number((bar.high + offset).toFixed(4)),
      low: Number((bar.low + offset).toFixed(4)),
      close: Number((bar.close + offset).toFixed(4)),
    };
  });
}
