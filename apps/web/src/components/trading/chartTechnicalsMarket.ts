import type { Candle } from "./chartIndicators";
import type { ChartMarketSnapshot } from "./chartMarketQuery";

const NO_CANDLES: readonly Candle[] = [];

/** Keep provider availability distinct from indicator warmup/insufficient history. */
export function chartTechnicalsMarketState(
  snapshot: ChartMarketSnapshot | undefined,
  error: Error | null,
) {
  const status = snapshot?.status;
  const connecting = !snapshot || status === "Connecting to Tradovate…";
  const streamError = status && status !== "Tradovate connected" && !connecting ? status : null;
  return {
    candles: snapshot?.bars ?? NO_CANDLES,
    loading:
      !error && (connecting || (status === "Tradovate connected" && snapshot?.revision === 0)),
    error: error?.message ?? streamError,
  };
}
