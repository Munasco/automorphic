import type { Candle } from "./chartIndicators";

/** Transform a raw bar without changing its exchange metadata or volume.
 * `previous` must be the preceding chronological Heikin Ashi bar. When revising the
 * current bar, reuse that preceding bar, not the current bar's earlier transform.
 */
export function heikinAshiBar(raw: Candle, previous?: Pick<Candle, "open" | "close">): Candle {
  const open = previous ? (previous.open + previous.close) / 2 : (raw.open + raw.close) / 2;
  const close = (raw.open + raw.high + raw.low + raw.close) / 4;
  return {
    ...raw,
    open,
    high: Math.max(raw.high, open, close),
    low: Math.min(raw.low, open, close),
    close,
  };
}

/** Display-only candles in the same chronological order as the raw series.
 * Recalculate after historical corrections: each bar's open depends on the prior
 * transformed bar. The first loaded bar is seeded from its raw open/close midpoint.
 */
export function calculateHeikinAshi(raw: readonly Candle[]): Candle[] {
  const result: Candle[] = [];
  for (const bar of raw) result.push(heikinAshiBar(bar, result.at(-1)));
  return result;
}
