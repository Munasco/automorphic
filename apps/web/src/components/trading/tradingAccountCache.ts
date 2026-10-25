import { tradingFetch } from "./tradingTransport";
import * as Schema from "effect/Schema";
import { TradingAccountSnapshot } from "@t3tools/contracts";

const decodeSnapshot = Schema.decodeUnknownSync(TradingAccountSnapshot);
export const ACCOUNT_POLL_MS = 30_000;

export async function fetchTradingAccount(
  accountId: number | null,
  signal: AbortSignal,
  request: typeof fetch = tradingFetch,
) {
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

  return data;
}
