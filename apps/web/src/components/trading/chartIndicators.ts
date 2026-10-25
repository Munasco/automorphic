export interface Candle {
  /** Unique chart key in Unix seconds; colliding trade times may be separated by fractions. */
  time: number;
  /** Original exchange timestamps for session calculations and labels. */
  actualTime?: number;
  actualEndTime?: number;
  barId?: string;
  firstTradeId?: number;
  lastTradeId?: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface IndicatorPoint {
  time: number;
  value: number;
}

export const PRICE_SOURCES = ["close", "open", "high", "low", "hl2", "hlc3", "ohlc4"] as const;
export type PriceSource = (typeof PRICE_SOURCES)[number];

export function sourcePrice(bar: Candle, source: PriceSource): number {
  switch (source) {
    case "hl2":
      return Number.isFinite(bar.high) && Number.isFinite(bar.low)
        ? bar.high / 2 + bar.low / 2
        : NaN;
    case "hlc3":
      return Number.isFinite(bar.high) && Number.isFinite(bar.low) && Number.isFinite(bar.close)
        ? bar.high / 3 + bar.low / 3 + bar.close / 3
        : NaN;
    case "ohlc4":
      return Number.isFinite(bar.open) &&
        Number.isFinite(bar.high) &&
        Number.isFinite(bar.low) &&
        Number.isFinite(bar.close)
        ? bar.open / 4 + bar.high / 4 + bar.low / 4 + bar.close / 4
        : NaN;
    default:
      return bar[source];
  }
}

function validPeriod(period: number): boolean {
  return Number.isSafeInteger(period) && period > 0;
}

/** Invalid selected prices restart the warmup instead of bridging missing data. */
export function calculateSMA(
  bars: readonly Candle[],
  period: number,
  source: PriceSource = "close",
): IndicatorPoint[] {
  if (!validPeriod(period) || bars.length < period) return [];
  const points: IndicatorPoint[] = [];
  const window: number[] = [];
  let sum = 0;
  let cursor = 0;
  for (const bar of bars) {
    const price = sourcePrice(bar, source);
    if (!Number.isFinite(bar.time) || !Number.isFinite(price)) {
      window.length = 0;
      sum = 0;
      cursor = 0;
      continue;
    }
    if (window.length === period) {
      sum -= window[cursor]!;
      window[cursor] = price;
      cursor = (cursor + 1) % period;
    } else {
      window.push(price);
    }
    sum += price;
    const value = sum / period;
    if (window.length === period && Number.isFinite(value)) points.push({ time: bar.time, value });
  }
  return points;
}

/** SMA seed followed by alpha = 2 / (period + 1), using the selected candle source. */
export function calculateEMA(
  bars: readonly Candle[],
  period: number,
  source: PriceSource = "close",
): IndicatorPoint[] {
  if (!validPeriod(period) || bars.length < period) return [];
  const points: IndicatorPoint[] = [];
  const alpha = 2 / (period + 1);
  let samples = 0;
  let value = 0;
  for (const bar of bars) {
    const price = sourcePrice(bar, source);
    if (!Number.isFinite(bar.time) || !Number.isFinite(price)) {
      samples = 0;
      value = 0;
      continue;
    }
    if (samples < period) {
      samples += 1;
      value = value * ((samples - 1) / samples) + price / samples;
    } else {
      value = value * (1 - alpha) + price * alpha;
    }
    if (samples === period && Number.isFinite(value)) points.push({ time: bar.time, value });
  }
  return points;
}

const chicagoDate = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Chicago",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
});

function futuresSession(time: number): number | null {
  const date = new Date(time * 1000);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = chicagoDate.formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((entry) => entry.type === type)?.value);
  // Increment the civil date, not elapsed UTC hours: the weekend may cross DST.
  return Date.UTC(part("year"), part("month") - 1, part("day") + (part("hour") >= 17 ? 1 : 0));
}

/**
 * HLC3 VWAP anchored at 17:00 Chicago time. A partial first session uses only the
 * available bars; this is not a full-session VWAP unless that history was loaded.
 * Invalid price/volume bars are omitted. Zero volume carries the last value, but
 * never invents an initial VWAP. No holiday calendar is required for actual bars.
 */
export function calculateVWAP(bars: readonly Candle[]): IndicatorPoint[] {
  return calculateVWAPBands(bars, []).middle;
}

/** Volume-weighted population variance of the same HLC3 source as VWAP. Online weighted
 * moments avoid cancellation in E[x²] - E[x]² when price is large and dispersion is small.
 * Band width is zero on the first positive-volume bar, not absent. Partial loaded sessions
 * intentionally use only available volume; missing history is never reconstructed.
 */
export function calculateVWAPBands(
  bars: readonly Candle[],
  multipliers: readonly number[] = [1, 2, 3],
  mode: "standard-deviation" | "percentage" = "standard-deviation",
) {
  const middle: IndicatorPoint[] = [];
  const bands = multipliers.map(() => ({
    upper: [] as IndicatorPoint[],
    lower: [] as IndicatorPoint[],
  }));
  let session: number | null = null,
    volume = 0,
    value = 0,
    variance = 0;
  for (const bar of bars) {
    if (!Number.isFinite(bar.time)) continue;
    const nextSession = futuresSession(bar.actualTime ?? bar.time);
    if (nextSession === null) continue;
    if (nextSession !== session) {
      session = nextSession;
      volume = 0;
      value = 0;
      variance = 0;
    }
    if (![bar.high, bar.low, bar.close, bar.volume].every(Number.isFinite) || bar.volume < 0)
      continue;
    if (bar.volume > 0) {
      const total = volume + bar.volume;
      if (!Number.isFinite(total)) continue;
      const weight = bar.volume / total;
      const typical = bar.high / 3 + bar.low / 3 + bar.close / 3;
      if (volume === 0) {
        value = typical;
        variance = 0;
      } else {
        const delta = typical - value;
        variance = (1 - weight) * (variance + weight * delta * delta);
        value = value * (1 - weight) + typical * weight;
      }
      volume = total;
    }
    if (volume <= 0 || !Number.isFinite(value)) continue;
    middle.push({ time: bar.time, value });
    const deviation =
      mode === "percentage" ? Math.abs(value) / 100 : Math.sqrt(Math.max(0, variance));
    for (let index = 0; index < multipliers.length; index++) {
      const multiplier = multipliers[index]!;
      if (!Number.isFinite(multiplier) || multiplier < 0 || !Number.isFinite(deviation)) continue;
      const upper = value + deviation * multiplier,
        lower = value - deviation * multiplier;
      if (Number.isFinite(upper) && Number.isFinite(lower)) {
        bands[index]!.upper.push({ time: bar.time, value: upper });
        bands[index]!.lower.push({ time: bar.time, value: lower });
      }
    }
  }
  return { middle, bands };
}

/** Wilder RSI: SMA-seeded gains/losses, then alpha = 1 / period; flat series = 50. */
export function calculateRSI(
  bars: readonly Candle[],
  period: number,
  source: PriceSource = "close",
): IndicatorPoint[] {
  if (!validPeriod(period) || bars.length <= period) return [];
  const points: IndicatorPoint[] = [];
  let previous: number | undefined;
  let changes = 0;
  let gain = 0;
  let loss = 0;
  for (const bar of bars) {
    const price = sourcePrice(bar, source);
    if (!Number.isFinite(bar.time) || !Number.isFinite(price)) {
      previous = undefined;
      changes = 0;
      gain = 0;
      loss = 0;
      continue;
    }
    if (previous === undefined) {
      previous = price;
      continue;
    }
    const delta = price - previous;
    previous = price;
    if (!Number.isFinite(delta)) {
      changes = 0;
      gain = 0;
      loss = 0;
      continue;
    }
    changes += 1;
    const divisor = Math.min(changes, period);
    gain = gain * ((divisor - 1) / divisor) + Math.max(delta, 0) / divisor;
    loss = loss * ((divisor - 1) / divisor) + Math.max(-delta, 0) / divisor;
    if (changes < period) continue;
    const value = gain === 0 && loss === 0 ? 50 : loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
    if (Number.isFinite(value)) points.push({ time: bar.time, value });
  }
  return points;
}
