import { TickMarkType, type TickMarkFormatter, type Time } from "lightweight-charts";
import type { Candle } from "./chartIndicators";

const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

/** Keep exchange timestamps separate from the unique key needed by the chart engine. */
export function readChartCandle(value: unknown): Candle | null {
  const bar = record(value);
  if (
    !bar ||
    !finite(bar.time) ||
    Math.abs(bar.time) > 8.64e12 ||
    !finite(bar.open) ||
    !finite(bar.high) ||
    !finite(bar.low) ||
    !finite(bar.close) ||
    !finite(bar.volume) ||
    bar.volume < 0 ||
    bar.high < Math.max(bar.open, bar.close) ||
    bar.low > Math.min(bar.open, bar.close)
  )
    return null;
  const result: Candle = {
    time: bar.time,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume: bar.volume,
  };
  for (const key of ["actualTime", "actualEndTime"] as const) {
    if (bar[key] === undefined) continue;
    if (!finite(bar[key]) || Math.abs(bar[key]) > 8.64e12) return null;
    result[key] = bar[key];
  }
  if (
    result.actualTime !== undefined &&
    result.actualEndTime !== undefined &&
    result.actualEndTime < result.actualTime
  )
    return null;
  for (const key of ["firstTradeId", "lastTradeId"] as const) {
    if (bar[key] === undefined) continue;
    if (!finite(bar[key]) || !Number.isSafeInteger(bar[key]) || bar[key] < 0) return null;
    result[key] = bar[key];
  }
  if (bar.barId !== undefined) {
    if (typeof bar.barId !== "string" || !bar.barId || bar.barId.length > 256) return null;
    result.barId = bar.barId;
  }
  return result;
}

export function applyChartBarBatch(
  bars: Map<number, Candle>,
  pending: Map<number, Candle>,
  input: readonly unknown[],
  snapshot: boolean,
): number {
  if (snapshot) {
    bars.clear();
    pending.clear();
  }
  let accepted = 0;
  for (const inputBar of input) {
    const bar = readChartCandle(inputBar);
    if (!bar) continue;
    bars.set(bar.time, bar);
    pending.set(bar.time, bar);
    accepted += 1;
  }
  return accepted;
}

/** Format real exchange time; never expose synthetic microsecond offsets to the user. */
export function createChartTimeFormatters(read: (key: number) => Candle | undefined) {
  const formats = new Map<string, Intl.DateTimeFormat>();
  const formatter = (locale: string, type: TickMarkType | "crosshair") => {
    const key = `${locale}:${type}`;
    let value = formats.get(key);
    if (!value) {
      const options: Intl.DateTimeFormatOptions =
        type === "crosshair"
          ? {
              year: "numeric",
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            }
          : type === TickMarkType.Year
            ? { year: "numeric" }
            : type === TickMarkType.Month
              ? { month: "short" }
              : type === TickMarkType.DayOfMonth
                ? { day: "numeric" }
                : type === TickMarkType.Time
                  ? { hour: "2-digit", minute: "2-digit" }
                  : { hour: "2-digit", minute: "2-digit", second: "2-digit" };
      value = new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC", hourCycle: "h23" });
      formats.set(key, value);
    }
    return value;
  };
  const actual = (time: number) => read(time)?.actualTime ?? time;
  const tickMarkFormatter: TickMarkFormatter = (time, type, locale) =>
    typeof time === "number" ? formatter(locale, type).format(actual(time) * 1000) : null;
  const timeFormatter = (time: Time): string => {
    if (typeof time === "number")
      return formatter("en-US", "crosshair").format(actual(time) * 1000);
    return typeof time === "string"
      ? time
      : `${time.year}-${String(time.month).padStart(2, "0")}-${String(time.day).padStart(2, "0")}`;
  };
  return { tickMarkFormatter, timeFormatter };
}

export type TickHistoryQuality = {
  source: "raw-trades" | "native-tick-bars";
  coverage: "limited-sampled-vendor-history" | "native-vendor-bars";
  availableBars: number;
  historicalCount: number;
};
/** Only recognize the feed's documented quality states; never infer complete session coverage. */
export function readTickHistoryQuality(value: unknown): TickHistoryQuality | null {
  const item = record(value);
  if (
    !item ||
    item.historyComplete !== false ||
    !finite(item.availableBars) ||
    !Number.isSafeInteger(item.availableBars) ||
    item.availableBars < 0
  )
    return null;
  const raw =
    item.source === "raw-trades" && item.historyCoverage === "limited-sampled-vendor-history";
  const native =
    item.source === "native-tick-bars" && item.historyCoverage === "native-vendor-bars";
  if (!raw && !native) return null;
  const count = raw ? item.rawHistoryReceived : item.historyBarsReceived;
  if (!finite(count) || !Number.isSafeInteger(count) || count < 0) return null;
  return {
    source: raw ? "raw-trades" : "native-tick-bars",
    coverage: raw ? "limited-sampled-vendor-history" : "native-vendor-bars",
    availableBars: item.availableBars,
    historicalCount: count,
  };
}
export function tickHistoryNotice(quality: TickHistoryQuality): {
  label: string;
  description: string;
} {
  return quality.source === "raw-trades"
    ? {
        label: "Limited history",
        description: `${quality.historicalCount.toLocaleString("en-US")} historical trades returned. Vendor one-tick history can omit trades, so historical trade counts and volume totals are incomplete. Each bar represents one returned trade.`,
      }
    : {
        label: "Tick history",
        description: `${quality.historicalCount.toLocaleString("en-US")} historical bars returned using native vendor aggregation. History is bounded to the returned bars and may not cover the full session.`,
      };
}
