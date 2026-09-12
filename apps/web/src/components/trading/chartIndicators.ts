export interface Candle {
  /** Unix seconds; callers provide distinct bars in chronological order. */
  time: number;
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

function validPeriod(period: number): boolean {
  return Number.isSafeInteger(period) && period > 0;
}

function validClose(bar: Candle): boolean {
  return Number.isFinite(bar.time) && Number.isFinite(bar.close);
}

/** Close-price SMA. Invalid prices restart the warmup instead of bridging missing data. */
export function calculateSMA(bars: readonly Candle[], period: number): IndicatorPoint[] {
  if (!validPeriod(period) || bars.length < period) return [];
  const points: IndicatorPoint[] = [];
  const window: number[] = [];
  let sum = 0;
  let cursor = 0;
  for (const bar of bars) {
    if (!validClose(bar)) {
      window.length = 0;
      sum = 0;
      cursor = 0;
      continue;
    }
    if (window.length === period) {
      sum -= window[cursor]!;
      window[cursor] = bar.close;
      cursor = (cursor + 1) % period;
    } else {
      window.push(bar.close);
    }
    sum += bar.close;
    const value = sum / period;
    if (window.length === period && Number.isFinite(value)) points.push({ time: bar.time, value });
  }
  return points;
}

/** SMA seed followed by alpha = 2 / (period + 1), using available close-price history. */
export function calculateEMA(bars: readonly Candle[], period: number): IndicatorPoint[] {
  if (!validPeriod(period) || bars.length < period) return [];
  const points: IndicatorPoint[] = [];
  const alpha = 2 / (period + 1);
  let samples = 0;
  let value = 0;
  for (const bar of bars) {
    if (!validClose(bar)) {
      samples = 0;
      value = 0;
      continue;
    }
    if (samples < period) {
      samples += 1;
      value = value * ((samples - 1) / samples) + bar.close / samples;
    } else {
      value = value * (1 - alpha) + bar.close * alpha;
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
  const points: IndicatorPoint[] = [];
  let session: number | null = null;
  let volume = 0;
  let value = 0;
  for (const bar of bars) {
    const nextSession = futuresSession(bar.time);
    if (nextSession === null) continue;
    if (nextSession !== session) {
      session = nextSession;
      volume = 0;
      value = 0;
    }
    if (![bar.high, bar.low, bar.close, bar.volume].every(Number.isFinite) || bar.volume < 0)
      continue;
    if (bar.volume > 0) {
      const total = volume + bar.volume;
      if (!Number.isFinite(total)) continue;
      const weight = bar.volume / total;
      const typical = bar.high / 3 + bar.low / 3 + bar.close / 3;
      value = value * (1 - weight) + typical * weight;
      volume = total;
    }
    if (volume > 0 && Number.isFinite(value)) points.push({ time: bar.time, value });
  }
  return points;
}

/** Wilder RSI: SMA-seeded gains/losses, then alpha = 1 / period; flat series = 50. */
export function calculateRSI(bars: readonly Candle[], period: number): IndicatorPoint[] {
  if (!validPeriod(period) || bars.length <= period) return [];
  const points: IndicatorPoint[] = [];
  let previous: number | undefined;
  let changes = 0;
  let gain = 0;
  let loss = 0;
  for (const bar of bars) {
    if (!validClose(bar)) {
      previous = undefined;
      changes = 0;
      gain = 0;
      loss = 0;
      continue;
    }
    if (previous === undefined) {
      previous = bar.close;
      continue;
    }
    const delta = bar.close - previous;
    previous = bar.close;
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
