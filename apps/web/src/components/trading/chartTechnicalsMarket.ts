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
  const failure = snapshot?.failure;
  let failureMessage: string | null = null;
  if (failure?.kind === "http") {
    const code = failure.status;
    failureMessage =
      code === 401
        ? "Market-data authentication is required (HTTP 401). Check the trading connection."
        : code === 403
          ? "Market-data access was denied (HTTP 403). Check trading permissions."
          : [502, 503, 504].includes(code)
            ? `Broker market data is temporarily unavailable (HTTP ${code}). Retrying the connection…`
            : `The market-data request failed (HTTP ${code}).`;
  } else if (failure?.kind === "invalid-response") {
    failureMessage = "The market-data service returned an invalid stream response. Please retry.";
  } else if (failure && (!streamError || streamError === "Reconnecting to Tradovate…")) {
    failureMessage = "The market-data connection was interrupted. Retrying the connection…";
  }
  const message = error?.message ?? failureMessage ?? streamError;
  const loading =
    !message &&
    (connecting ||
      snapshot?.awaitingHistory === true ||
      (status === "Tradovate connected" && snapshot?.revision === 0));
  const candles = snapshot?.bars ?? NO_CANDLES;
  return { candles, loading, error: message, stale: candles.length > 0 && (loading || !!message) };
}
