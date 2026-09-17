import { TradingOrderReceipt, type TradingOrderRequest } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { tradingFetch } from "./tradingTransport";

const decodeReceipt = Schema.decodeUnknownSync(TradingOrderReceipt);

export type ChartOrderDraft = {
  side: "Buy" | "Sell";
  type: "Market" | "Limit" | "Stop" | "StopLimit";
  price: number;
};
export function chartOrderType(
  side: "Buy" | "Sell",
  price: number,
  market: number,
): "Limit" | "Stop" {
  return (side === "Buy" ? price <= market : price >= market) ? "Limit" : "Stop";
}
export async function submitChartOrder(
  order: TradingOrderRequest,
  request: typeof fetch = tradingFetch,
) {
  let response: Response;
  try {
    response = await request("/api/trading/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(order),
      signal: AbortSignal.timeout(45_000),
    });
  } catch {
    throw Error(
      "Order status is unknown. Check Orders in Tradovate before submitting another order.",
    );
  }
  const value: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      value && typeof value === "object" && "error" in value && typeof value.error === "string"
        ? value.error
        : "Order status is unknown. Check Orders in Tradovate.";
    throw Error(message);
  }
  try {
    return decodeReceipt(value);
  } catch {
    throw Error(
      "Order status is unknown. Check Orders in Tradovate before submitting another order.",
    );
  }
}
