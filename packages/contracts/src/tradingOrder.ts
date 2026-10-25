import * as Schema from "effect/Schema";

export const TradingOrderRequest = Schema.Struct({
  requestId: Schema.String,
  accountId: Schema.Finite,
  environment: Schema.Literals(["demo", "live"]),
  symbol: Schema.String,
  side: Schema.Literals(["Buy", "Sell"]),
  type: Schema.Literals(["Market", "Limit", "Stop", "StopLimit"]),
  quantity: Schema.Finite,
  price: Schema.optional(Schema.Finite),
  stopPrice: Schema.optional(Schema.Finite),
  timeInForce: Schema.Literals(["Day", "GTC"]),
});
export type TradingOrderRequest = typeof TradingOrderRequest.Type;

export const TradingOrderReceipt = Schema.Struct({ orderId: Schema.Finite });
export type TradingOrderReceipt = typeof TradingOrderReceipt.Type;

export function tradingOrderValidation(order: TradingOrderRequest): string | null {
  if (!/^[a-zA-Z0-9-]{16,50}$/.test(order.requestId)) return "Invalid order request.";
  if (!Number.isSafeInteger(order.accountId) || order.accountId <= 0) return "Choose an account.";
  if (!/^[A-Z0-9]{1,32}$/.test(order.symbol)) return "Choose a valid futures contract.";
  if (!Number.isSafeInteger(order.quantity) || order.quantity <= 0 || order.quantity > 2147483647)
    return "Quantity must be a positive whole number.";
  if ((order.type === "Limit" || order.type === "StopLimit") && !Number.isFinite(order.price))
    return "Enter a limit price.";
  if ((order.type === "Stop" || order.type === "StopLimit") && !Number.isFinite(order.stopPrice))
    return "Enter a stop price.";
  if (
    order.type === "StopLimit" &&
    ((order.side === "Buy" && order.price! < order.stopPrice!) ||
      (order.side === "Sell" && order.price! > order.stopPrice!))
  )
    return "The limit price must be at or beyond the stop price in the order direction.";
  return null;
}
