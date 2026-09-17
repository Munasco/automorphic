import type { MarketQuote } from "./InstrumentHeader";
import type { Candle } from "./chartIndicators";

/** A last-trade marker may lead candle delivery, but must not lag the newest candle's known time. */
export function chartLastTrade(
  quote: MarketQuote | null,
  bar: Candle | undefined,
  symbol: string,
): number | null {
  if (
    !bar ||
    !quote ||
    quote.symbol !== symbol ||
    quote.source !== "quote" ||
    !Number.isFinite(quote.last) ||
    !quote.timestamp
  )
    return null;
  const time = Date.parse(quote.timestamp) / 1000;
  const barTime = bar.actualEndTime ?? bar.actualTime ?? bar.time;
  return Number.isFinite(time) && time >= barTime ? quote.last : null;
}
