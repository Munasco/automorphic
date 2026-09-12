import type { Candle, IndicatorPoint } from "./chartIndicators";

export interface InitialBalanceConfig {
  startTime: string;
  timeZone: string;
  durationMinutes: number;
}
export const DEFAULT_INITIAL_BALANCE: InitialBalanceConfig = {
  startTime: "09:30",
  timeZone: "America/New_York",
  durationMinutes: 60,
};
export type InitialBalanceStatus =
  | "waiting"
  | "developing"
  | "complete"
  | "incomplete"
  | "unaligned"
  | "invalid";
export type InitialBalancePoint = IndicatorPoint | { time: number };
export interface InitialBalanceSegment {
  session: string;
  high: IndicatorPoint[];
  low: IndicatorPoint[];
  mid: IndicatorPoint[];
}
export interface InitialBalanceResult {
  high: InitialBalancePoint[];
  low: InitialBalancePoint[];
  mid: InitialBalancePoint[];
  /** Render separate segments: a single Lightweight Charts line can connect across whitespace. */
  segments: InitialBalanceSegment[];
  status: InitialBalanceStatus;
  reason?: string;
}

const partsAt = (formatter: Intl.DateTimeFormat, seconds: number) => {
  const values = Object.fromEntries(
    formatter.formatToParts(seconds * 1000).map((part) => [part.type, part.value]),
  );
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  };
};
const wallSeconds = (parts: ReturnType<typeof partsAt>) =>
  Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) / 1000;

/** Resolve the session's local clock time, including the offset changes on DST dates. */
function sessionStart(
  formatter: Intl.DateTimeFormat,
  day: ReturnType<typeof partsAt>,
  hour: number,
  minute: number,
): number | undefined {
  const target = wallSeconds({ ...day, hour, minute, second: 0 });
  const candidates = new Set<number>();
  for (const delta of [-12 * 3600, 0, 12 * 3600]) {
    const probe = target + delta;
    const offset = wallSeconds(partsAt(formatter, probe)) - probe;
    const candidate = target - offset;
    if (wallSeconds(partsAt(formatter, candidate)) === target) candidates.add(candidate);
  }
  // A repeated wall time uses its first occurrence; a skipped spring-forward time has no match.
  return candidates.size ? Math.min(...candidates) : undefined;
}

/**
 * Initial balance is the high/low of a session's opening time blocks. The default is one hour.
 * https://www.tradingview.com/support/solutions/43000713306-time-price-opportunity-tpo-indicator/
 * Bars are opening timestamps, in chronological order. Only fully contained, contiguous bars
 * participate; a missing or boundary-straddling bar makes the remaining session unavailable.
 * Values develop on each observed bar and are never backfilled with later bars' extremes.
 */
export function calculateInitialBalance(
  bars: readonly Candle[],
  config: InitialBalanceConfig,
  barIntervalMinutes: number,
): InitialBalanceResult {
  const result: InitialBalanceResult = {
    high: [],
    low: [],
    mid: [],
    segments: [],
    status: "waiting",
  };
  const match = /^(\d{2}):(\d{2})$/.exec(config.startTime);
  const hour = Number(match?.[1]);
  const minute = Number(match?.[2]);
  if (
    !match ||
    hour > 23 ||
    minute > 59 ||
    !Number.isSafeInteger(config.durationMinutes) ||
    config.durationMinutes <= 0 ||
    hour * 60 + minute + config.durationMinutes > 1440 ||
    !Number.isSafeInteger(barIntervalMinutes) ||
    barIntervalMinutes <= 0
  ) {
    return {
      ...result,
      status: "invalid",
      reason: "Choose a valid same-day session window and candle interval.",
    };
  }
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: config.timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
  } catch {
    return { ...result, status: "invalid", reason: "Choose a valid session timezone." };
  }
  const interval = barIntervalMinutes * 60;
  let dayKey = "";
  let dayParts: ReturnType<typeof partsAt> | undefined;
  let nextDayStart = -Infinity;
  let start: number | undefined;
  let end = 0;
  let coveredUntil = 0;
  let high = -Infinity;
  let low = Infinity;
  let failed: "incomplete" | "unaligned" | undefined;
  let segment: InitialBalanceSegment | undefined;
  const blank = (time: number) => {
    result.high.push({ time });
    result.low.push({ time });
    result.mid.push({ time });
  };
  const fail = (status: "incomplete" | "unaligned", reason: string) => {
    failed = status;
    result.status = status;
    result.reason = reason;
  };
  for (const bar of bars) {
    if (!Number.isFinite(bar.time) || Math.abs(bar.time) > 8.64e12) continue;
    // Chronological candles share a local date until its next midnight. Avoid formatting every tick.
    if (!dayParts || bar.time >= nextDayStart) {
      dayParts = partsAt(formatter, bar.time);
      nextDayStart =
        sessionStart(formatter, { ...dayParts, day: dayParts.day + 1 }, 0, 0) ?? bar.time + 3600;
    }
    const day = dayParts;
    const key = `${day.year}-${day.month}-${day.day}`;
    if (key !== dayKey) {
      dayKey = key;
      start = sessionStart(formatter, day, hour, minute);
      end = (start ?? 0) + config.durationMinutes * 60;
      coveredUntil = start ?? 0;
      high = -Infinity;
      low = Infinity;
      failed = undefined;
      segment = undefined;
      result.status = "waiting";
      delete result.reason;
    }
    if (start === undefined) {
      fail("unaligned", "This local session start does not exist on this daylight-saving date.");
      blank(bar.time);
      continue;
    }
    if (bar.time < start) {
      if (bar.time + interval > start)
        fail(
          "unaligned",
          "The candle interval straddles the session start. Use a smaller aligned interval.",
        );
      blank(bar.time);
      continue;
    }
    if (failed) {
      result.status = failed;
      blank(bar.time);
      continue;
    }
    if (bar.time < end) {
      if (bar.time + interval > end) {
        fail(
          "unaligned",
          "The candle interval straddles the initial-balance end. Use a smaller aligned interval.",
        );
        blank(bar.time);
        continue;
      }
      if (
        bar.time !== coveredUntil ||
        !Number.isFinite(bar.high) ||
        !Number.isFinite(bar.low) ||
        bar.high < bar.low
      ) {
        fail(
          "incomplete",
          "The opening window contains missing or invalid candles. Load its complete history.",
        );
        blank(bar.time);
        continue;
      }
      high = Math.max(high, bar.high);
      low = Math.min(low, bar.low);
      coveredUntil = bar.time + interval;
      result.status = "developing";
    } else {
      if (coveredUntil !== end || !Number.isFinite(high)) {
        fail("incomplete", "The full initial-balance window is not loaded.");
        blank(bar.time);
        continue;
      }
      result.status = "complete";
    }
    if (!segment) {
      segment = { session: key, high: [], low: [], mid: [] };
      result.segments.push(segment);
    }
    const highPoint = { time: bar.time, value: high };
    const lowPoint = { time: bar.time, value: low };
    const midPoint = { time: bar.time, value: high / 2 + low / 2 };
    result.high.push(highPoint);
    result.low.push(lowPoint);
    result.mid.push(midPoint);
    segment.high.push(highPoint);
    segment.low.push(lowPoint);
    segment.mid.push(midPoint);
  }
  return result;
}
