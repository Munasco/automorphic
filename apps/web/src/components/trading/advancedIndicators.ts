import { calculateEMA, type Candle, type IndicatorPoint } from "./chartIndicators";

export interface IndicatorBands {
  upper: IndicatorPoint[];
  middle: IndicatorPoint[];
  lower: IndicatorPoint[];
}

const validPeriod = (period: number) => Number.isSafeInteger(period) && period > 0;
const validClose = (bar: Candle) => Number.isFinite(bar.time) && Number.isFinite(bar.close);
const validRange = (bar: Candle) =>
  validClose(bar) &&
  Number.isFinite(bar.high) &&
  Number.isFinite(bar.low) &&
  bar.high >= bar.low &&
  bar.close >= bar.low &&
  bar.close <= bar.high;
const emptyBands = (): IndicatorBands => ({ upper: [], middle: [], lower: [] });

/** Callers supply distinct chronological bars. Missing inputs restart every warmup. */
function* segments(bars: readonly Candle[], valid: (bar: Candle) => boolean) {
  let segment: Candle[] = [];
  for (const bar of bars) {
    if (valid(bar)) segment.push(bar);
    else {
      if (segment.length) yield segment;
      segment = [];
    }
  }
  if (segment.length) yield segment;
}

function add(points: IndicatorPoint[], time: number, value: number) {
  if (Number.isFinite(time) && Number.isFinite(value)) points.push({ time, value });
}

/** SMA seed, then the requested alpha. Invalid intermediate values reset the seed. */
function smooth(points: readonly IndicatorPoint[], period: number, alpha: number) {
  const result: IndicatorPoint[] = [];
  let count = 0;
  let average = 0;
  for (const point of points) {
    if (!Number.isFinite(point.value)) {
      count = 0;
      average = 0;
      continue;
    }
    if (count < period) {
      count += 1;
      average = average * ((count - 1) / count) + point.value / count;
    } else average = average * (1 - alpha) + point.value * alpha;
    if (count === period) add(result, point.time, average);
  }
  return result;
}

function sma(points: readonly IndicatorPoint[], period: number) {
  const result: IndicatorPoint[] = [];
  for (let i = period - 1; i < points.length; i += 1) {
    let value = 0;
    for (let j = i - period + 1; j <= i; j += 1) value += points[j]!.value / period;
    add(result, points[i]!.time, value);
  }
  return result;
}

function ranges(bars: readonly Candle[], period: number) {
  const result: { time: number; close: number; high: number; low: number }[] = [];
  for (let i = period - 1; i < bars.length; i += 1) {
    let high = -Infinity;
    let low = Infinity;
    for (let j = i - period + 1; j <= i; j += 1) {
      high = Math.max(high, bars[j]!.high);
      low = Math.min(low, bars[j]!.low);
    }
    result.push({ time: bars[i]!.time, close: bars[i]!.close, high, low });
  }
  return result;
}

/** Close SMA ± population standard deviation; defaults 20 bars / 2 deviations.
 * https://www.tradingview.com/support/solutions/43000501840-bollinger-bands-bb/
 */
export function calculateBollingerBands(
  bars: readonly Candle[],
  period = 20,
  deviations = 2,
): IndicatorBands {
  const result = emptyBands();
  if (!validPeriod(period) || !Number.isFinite(deviations) || deviations < 0) return result;
  for (const segment of segments(bars, validClose)) {
    for (let i = period - 1; i < segment.length; i += 1) {
      const baseline = segment[i - period + 1]!.close;
      let offset = 0;
      for (let j = i - period + 1; j <= i; j += 1)
        offset += (segment[j]!.close - baseline) / period;
      const middle = baseline + offset;
      let variance = 0;
      for (let j = i - period + 1; j <= i; j += 1)
        variance += (segment[j]!.close - middle) ** 2 / period;
      const width = deviations * Math.sqrt(variance);
      if (![middle, width, middle + width, middle - width].every(Number.isFinite)) continue;
      const time = segment[i]!.time;
      add(result.middle, time, middle);
      add(result.upper, time, middle + width);
      add(result.lower, time, middle - width);
    }
  }
  return result;
}

/** SMA-seeded EMAs: 12 minus 26, 9-period EMA signal, MACD minus signal histogram.
 * https://www.tradingview.com/support/solutions/43000502344-moving-average-convergence-divergence-macd-indicator/
 */
export function calculateMACD(bars: readonly Candle[], fast = 12, slow = 26, signalPeriod = 9) {
  const result: { macd: IndicatorPoint[]; signal: IndicatorPoint[]; histogram: IndicatorPoint[] } =
    { macd: [], signal: [], histogram: [] };
  if (![fast, slow, signalPeriod].every(validPeriod) || fast >= slow) return result;
  for (const segment of segments(bars, validClose)) {
    const fastPoints = new Map(
      calculateEMA(segment, fast).map((point) => [point.time, point.value]),
    );
    const macd = calculateEMA(segment, slow).map((point) => ({
      time: point.time,
      value: (fastPoints.get(point.time) ?? NaN) - point.value,
    }));
    const signal = smooth(macd, signalPeriod, 2 / (signalPeriod + 1));
    const byTime = new Map(macd.map((point) => [point.time, point.value]));
    for (const point of macd) add(result.macd, point.time, point.value);
    result.signal.push(...signal);
    for (const point of signal)
      add(result.histogram, point.time, (byTime.get(point.time) ?? NaN) - point.value);
  }
  return result;
}

function trueRange(bar: Candle, previous?: Candle) {
  return previous
    ? Math.max(
        bar.high - bar.low,
        Math.abs(bar.high - previous.close),
        Math.abs(bar.low - previous.close),
      )
    : bar.high - bar.low;
}

/** Wilder/RMA ATR14. The first loaded bar uses high-low when no previous close exists.
 * https://www.tradingview.com/support/solutions/43000501823-average-true-range-atr/
 */
export function calculateATR(bars: readonly Candle[], period = 14): IndicatorPoint[] {
  if (!validPeriod(period)) return [];
  const result: IndicatorPoint[] = [];
  for (const segment of segments(bars, validRange)) {
    result.push(
      ...smooth(
        segment.map((bar, index) => ({
          time: bar.time,
          value: trueRange(bar, segment[index - 1]),
        })),
        period,
        1 / period,
      ),
    );
  }
  return result;
}

/** Full stochastic14/3/3: range position, SMA(K), SMA(D). Zero-range bars are
 * undefined, so they reset smoothing rather than inventing an overbought/oversold value.
 * https://www.tradingview.com/support/solutions/43000502332-stochastic-stoch/
 */
export function calculateStochastic(
  bars: readonly Candle[],
  period = 14,
  smoothK = 3,
  periodD = 3,
) {
  const result: { k: IndicatorPoint[]; d: IndicatorPoint[] } = { k: [], d: [] };
  if (![period, smoothK, periodD].every(validPeriod)) return result;
  for (const segment of segments(bars, validRange)) {
    // Keep undefined values in the series so consecutive SMA windows cannot bridge them.
    const raw = ranges(segment, period).map((point) => ({
      time: point.time,
      value:
        point.high === point.low
          ? NaN
          : 100 * ((point.close - point.low) / (point.high - point.low)),
    }));
    const kWindows: IndicatorPoint[] = [];
    let valid: IndicatorPoint[] = [];
    const flush = () => {
      const k = sma(valid, smoothK);
      kWindows.push(...k);
      result.d.push(...sma(k, periodD));
      valid = [];
    };
    for (const point of raw) {
      if (Number.isFinite(point.value)) valid.push(point);
      else flush();
    }
    flush();
    result.k.push(...kWindows);
  }
  return result;
}

/** Wilder DMI14 and ADX14. DM needs a previous bar; ADX needs a full DX seed.
 * Tied up/down moves contribute neither direction. A motionless range produces zero.
 * https://www.tradingview.com/support/solutions/43000589099-average-directional-index-adx/
 */
export function calculateADX(bars: readonly Candle[], period = 14, adxPeriod = 14) {
  const result: { adx: IndicatorPoint[]; plusDI: IndicatorPoint[]; minusDI: IndicatorPoint[] } = {
    adx: [],
    plusDI: [],
    minusDI: [],
  };
  if (![period, adxPeriod].every(validPeriod)) return result;
  for (const segment of segments(bars, validRange)) {
    const tr: IndicatorPoint[] = [];
    const plus: IndicatorPoint[] = [];
    const minus: IndicatorPoint[] = [];
    for (let i = 1; i < segment.length; i += 1) {
      const bar = segment[i]!;
      const previous = segment[i - 1]!;
      const up = bar.high - previous.high;
      const down = previous.low - bar.low;
      tr.push({ time: bar.time, value: trueRange(bar, previous) });
      plus.push({ time: bar.time, value: up > down && up > 0 ? up : 0 });
      minus.push({ time: bar.time, value: down > up && down > 0 ? down : 0 });
    }
    const averageTR = smooth(tr, period, 1 / period);
    const averagePlus = new Map(
      smooth(plus, period, 1 / period).map((point) => [point.time, point.value]),
    );
    const averageMinus = new Map(
      smooth(minus, period, 1 / period).map((point) => [point.time, point.value]),
    );
    const dx: IndicatorPoint[] = [];
    for (const point of averageTR) {
      const plusDI =
        point.value === 0 ? 0 : 100 * ((averagePlus.get(point.time) ?? NaN) / point.value);
      const minusDI =
        point.value === 0 ? 0 : 100 * ((averageMinus.get(point.time) ?? NaN) / point.value);
      add(result.plusDI, point.time, plusDI);
      add(result.minusDI, point.time, minusDI);
      dx.push({
        time: point.time,
        value: plusDI + minusDI === 0 ? 0 : (100 * Math.abs(plusDI - minusDI)) / (plusDI + minusDI),
      });
    }
    result.adx.push(...smooth(dx, adxPeriod, 1 / adxPeriod));
  }
  return result;
}

/** Cumulative signed volume, anchored to zero at the first available bar.
 * Absolute OBV depends on loaded history. Invalid volume resets that local baseline.
 * https://www.tradingview.com/support/solutions/43000502593-on-balance-volume-obv/
 */
export function calculateOBV(bars: readonly Candle[]): IndicatorPoint[] {
  const result: IndicatorPoint[] = [];
  for (const segment of segments(
    bars,
    (bar) => validClose(bar) && Number.isFinite(bar.volume) && bar.volume >= 0,
  )) {
    let total = 0;
    for (let i = 0; i < segment.length; i += 1) {
      const bar = segment[i]!;
      const previous = segment[i - 1];
      if (previous) total += Math.sign(bar.close - previous.close) * bar.volume;
      add(result, bar.time, total);
    }
  }
  return result;
}

/** HLC3 CCI20 with mean absolute deviation and Lambert's 0.015 constant; flat = 0.
 * https://www.tradingview.com/support/solutions/43000502001-commodity-channel-index-cci/
 */
export function calculateCCI(bars: readonly Candle[], period = 20): IndicatorPoint[] {
  if (!validPeriod(period)) return [];
  const result: IndicatorPoint[] = [];
  for (const segment of segments(bars, validRange)) {
    const typical = segment.map((bar) => bar.high / 3 + bar.low / 3 + bar.close / 3);
    for (let i = period - 1; i < typical.length; i += 1) {
      const baseline = typical[i - period + 1]!;
      let offset = 0;
      for (let j = i - period + 1; j <= i; j += 1) offset += (typical[j]! - baseline) / period;
      const mean = baseline + offset;
      let deviation = 0;
      for (let j = i - period + 1; j <= i; j += 1)
        deviation += Math.abs(typical[j]! - mean) / period;
      add(result, segment[i]!.time, deviation === 0 ? 0 : (typical[i]! - mean) / deviation / 0.015);
    }
  }
  return result;
}

/** Williams %R14. A zero high-low span is undefined and omitted.
 * https://www.tradingview.com/support/solutions/43000501985-williams-r-r/
 */
export function calculateWilliamsR(bars: readonly Candle[], period = 14): IndicatorPoint[] {
  if (!validPeriod(period)) return [];
  const result: IndicatorPoint[] = [];
  for (const segment of segments(bars, validRange)) {
    for (const point of ranges(segment, period)) {
      if (point.high !== point.low)
        add(result, point.time, -100 * ((point.high - point.close) / (point.high - point.low)));
    }
  }
  return result;
}

/** Highest high / lowest low over20 bars including the current bar; midpoint basis.
 * https://www.tradingview.com/support/solutions/43000502253-donchian-channels-dc/
 */
export function calculateDonchian(bars: readonly Candle[], period = 20): IndicatorBands {
  const result = emptyBands();
  if (!validPeriod(period)) return result;
  for (const segment of segments(bars, validRange)) {
    for (const point of ranges(segment, period)) {
      add(result.upper, point.time, point.high);
      add(result.lower, point.time, point.low);
      add(result.middle, point.time, point.high / 2 + point.low / 2);
    }
  }
  return result;
}
