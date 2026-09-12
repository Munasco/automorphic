import * as Schema from "effect/Schema";
import { TradingAccountSnapshot } from "@t3tools/contracts";

const decodeSnapshot = Schema.decodeUnknownSync(TradingAccountSnapshot);
export const ACCOUNT_POLL_MS = 30_000;

/** Short-lived, account-scoped UI cache. Only a visible dock requests updates. */
export function createTradingAccountCache(
  request: typeof fetch = (...args) => fetch(...args),
  now: () => number = () => Date.now(),
) {
  const values = new Map<number | null, { data: TradingAccountSnapshot; receivedAt: number }>();
  return {
    peek: (accountId: number | null) => values.get(accountId)?.data ?? null,
    load: async (accountId: number | null, signal: AbortSignal, force = false) => {
      const cached = values.get(accountId);
      if (!force && cached && now() - cached.receivedAt < ACCOUNT_POLL_MS) return cached.data;
      const response = await request(
        `/api/trading/account${accountId === null ? "" : `?accountId=${accountId}`}`,
        {
          credentials: "same-origin",
          signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]),
        },
      );
      if (!response.ok) {
        const failure: unknown = await response.json().catch(() => null);
        const message =
          failure &&
          typeof failure === "object" &&
          "error" in failure &&
          typeof failure.error === "string"
            ? failure.error.slice(0, 200)
            : "Broker account unavailable. Retry to reconnect.";
        throw Error(message);
      }
      let data: TradingAccountSnapshot;
      try {
        data = decodeSnapshot(await response.json());
      } catch {
        throw Error("The broker returned an unreadable account response.");
      }
      if (signal.aborted) throw new DOMException("Request cancelled", "AbortError");
      if (accountId !== null && data.accountId !== accountId)
        throw Error("The broker returned a different account. Retry to reconnect.");
      const entry = { data, receivedAt: now() };
      values.set(accountId, entry);
      if (data.accountId !== null) values.set(data.accountId, entry);
      return data;
    },
  };
}

export const tradingAccountCache = createTradingAccountCache();
