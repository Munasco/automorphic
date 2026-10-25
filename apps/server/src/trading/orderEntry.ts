import { createOrderReceiptLedger, type OrderReceiptLedger } from "./orderReceiptLedger.ts";
// @effect-diagnostics globalFetch:off globalDate:off - Native broker adapter with bounded requests; no automatic submission retries.
import {
  TradingOrderRequest,
  tradingOrderValidation,
  type TradingOrderReceipt,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { credentials } from "./marketData.ts";
import { TradingAccountError } from "./accountData.ts";

const decode = Schema.decodeUnknownSync(TradingOrderRequest);
const entity = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const positiveId = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;

/** Cache in-flight and uncertain submissions too: a transport retry must never send another order. */
export function createOrderEntry(
  session = credentials,
  request: (url: string, init?: RequestInit) => Promise<Response> = fetch,
  ledger?: OrderReceiptLedger,
) {
  const submissions = new Map<string, { body: string; result: Promise<TradingOrderReceipt> }>();
  return async (input: unknown): Promise<TradingOrderReceipt> => {
    let order: TradingOrderRequest;
    try {
      order = decode(input);
    } catch {
      throw new TradingAccountError("Invalid order details.", 400);
    }
    const invalid = tradingOrderValidation(order);
    if (invalid) throw new TradingAccountError(invalid, 400);
    const auth = await session();
    if (!auth.token)
      throw new TradingAccountError("Connect a Tradovate trading account first.", 503);
    if (auth.environment !== order.environment)
      throw new TradingAccountError(
        "The broker environment changed. Reopen the order ticket.",
        409,
      );
    const base = `https://${auth.environment}.tradovateapi.com/v1`;
    const headers = { Authorization: `Bearer ${auth.token}`, "Content-Type": "application/json" };
    const accountsResponse = await request(`${base}/account/list`, {
      headers,
      signal: AbortSignal.timeout(15_000),
    });
    if (!accountsResponse.ok)
      throw new TradingAccountError(
        "Could not verify your trading account. Reconnect Tradovate.",
        403,
      );
    const accounts: unknown = await accountsResponse.json();
    const account = Array.isArray(accounts)
      ? accounts.find(
          (row) => entity(row) && row.id === order.accountId && typeof row.name === "string",
        )
      : undefined;
    if (!account || account.active === false)
      throw new TradingAccountError(
        "This account is not available for trading in the current connection.",
        403,
      );
    const key = `${order.environment}:${order.accountId}:${order.requestId}`;
    const body = JSON.stringify(order);
    const previous = submissions.get(key);
    if (previous) {
      if (previous.body !== body)
        throw new TradingAccountError("Order details changed for a submitted request.", 409);
      return previous.result;
    }
    // Refuse rather than evict a receipt whose request could be retried by a client.
    if (submissions.size >= 10_000)
      throw new TradingAccountError(
        "Order service capacity reached. Contact the environment owner.",
        503,
      );
    const result = (async () => {
      const previousReceipt = await ledger?.claim(key, body);
      if (previousReceipt) return previousReceipt;
      // Broker-side client identifier also identifies a submission after an application restart.
      const payload = {
        accountId: order.accountId,
        accountSpec: account.name,
        action: order.side,
        symbol: order.symbol,
        orderQty: order.quantity,
        orderType: order.type,
        timeInForce: order.timeInForce,
        isAutomated: false,
        clOrdId: order.requestId,
        ...(order.type === "Limit" || order.type === "StopLimit" ? { price: order.price } : {}),
        ...(order.type === "Stop" || order.type === "StopLimit"
          ? { stopPrice: order.stopPrice }
          : {}),
      };
      let response: Response;
      try {
        response = await request(`${base}/order/placeOrder`, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(15_000),
        });
      } catch {
        throw new TradingAccountError(
          "Order status is unknown. Check Orders in Tradovate before submitting another order.",
          504,
        );
      }
      const value: unknown = await response.json().catch(() => null);
      if (
        entity(value) &&
        positiveId(value.orderId) &&
        (!value.failureReason || value.failureReason === "Success") &&
        response.ok
      ) {
        const receipt = { orderId: value.orderId };
        // Keep the claim if recording a confirmed result fails; a retry will still never resend.
        await ledger?.complete(key, receipt).catch(() => undefined);
        return receipt;
      }
      if (
        entity(value) &&
        typeof value.failureReason === "string" &&
        value.failureReason !== "Success"
      )
        throw new TradingAccountError(
          typeof value.failureText === "string"
            ? value.failureText.slice(0, 250)
            : "Tradovate rejected this order.",
          422,
        );
      if (response.status >= 400 && response.status < 500)
        throw new TradingAccountError(
          "Tradovate rejected the order request. Check your account permissions and order details.",
          422,
        );
      throw new TradingAccountError(
        "Order status is unknown. Check Orders in Tradovate before submitting another order.",
        502,
      );
    })();
    submissions.set(key, { body, result });
    return result;
  };
}
const environments = new Map<string, ReturnType<typeof createOrderEntry>>();
export function placeTradingOrder(stateDir: string, input: unknown) {
  let entry = environments.get(stateDir);
  if (!entry) {
    entry = createOrderEntry(credentials, fetch, createOrderReceiptLedger(stateDir));
    environments.set(stateDir, entry);
  }
  return entry(input);
}
