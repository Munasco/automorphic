// @effect-diagnostics globalDate:off - Historical cursor is an absolute UTC timestamp.
import { ChartIntervalError, resolveChartInterval } from "./chartInterval.ts";
import { createCalendarSeries } from "./calendarSeries.ts";
import { getHistoricalBars } from "./mcpMarketData.ts";

// Tradovate bounds intraday history by time as well as bar count. Keep the
// searched window explicit so an empty month is not mistaken for all history.
const HISTORY_START = Date.parse("2017-01-01T00:00:00Z") / 1000;
const HISTORY_WINDOW = 28 * 86400;

export async function readChartHistory(params: URLSearchParams, load = getHistoricalBars) {
  const symbol = params.get("symbol") ?? "";
  const before = Number(params.get("before"));
  const interval = Number(params.get("interval"));
  const unit = resolveChartInterval(interval, params.get("intervalUnit") ?? "minute").intervalUnit;
  if (
    !/^[A-Za-z0-9@._-]{1,40}$/.test(symbol) ||
    !Number.isFinite(before) ||
    before <= 0 ||
    before > 8.64e12
  )
    throw new ChartIntervalError("Choose a valid symbol and history cursor.");
  if (unit === "tick") throw new ChartIntervalError("Older tick history is not available.");
  const calendar = unit === "week" || unit === "month";
  const start =
    unit === "minute" || unit === "second"
      ? Math.max(HISTORY_START, before - HISTORY_WINDOW)
      : HISTORY_START;
  if (before <= HISTORY_START)
    return {
      symbol,
      intervalKey: `${unit}:${interval}`,
      bars: [],
      hasMore: false,
      nextBefore: null,
    };
  const page = await load({
    symbol,
    interval: calendar ? 1 : interval,
    unit: calendar || unit === "day" ? "day" : unit === "second" ? "second" : "minute",
    start: new Date(start * 1000).toISOString(),
    end: new Date(before * 1000).toISOString(),
    limit: 1000,
  });
  let bars = calendar ? createCalendarSeries(unit, interval).accept(page.bars, true) : page.bars;
  // A full daily page can start partway through a week/month. Fetch that entire
  // period on the next request instead of exposing a truncated aggregate candle.
  if (calendar && page.bars.length === 1000 && bars.length > 1) bars = bars.slice(1);
  bars = bars.filter((bar) => bar.time < before);
  const nextBefore = bars[0]?.time ?? start;
  const hasMore = nextBefore > HISTORY_START;
  return {
    symbol,
    intervalKey: `${unit}:${interval}`,
    bars,
    hasMore,
    nextBefore: hasMore ? nextBefore : null,
  };
}
