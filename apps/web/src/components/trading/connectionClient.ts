import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Schema from "effect/Schema";
import { TradingConnectionStatus, type TradingConnectionCommand } from "@t3tools/contracts";
import { tradingFetch } from "./tradingTransport";
import { tradingQueryScope } from "./tradingQueries";
export async function readConnectionResponse(response: Response): Promise<unknown> {
  if (response.status === 401)
    throw new Error("Your app session has expired. Sign in again to manage connections.");
  if (response.status === 403)
    throw new Error("This app session does not have permission to manage connections.");
  const unavailable = "The connection service is unavailable. Please try again.";
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new Error(unavailable);
  }
  if (!response.ok)
    throw new Error(
      value && typeof value === "object" && "error" in value && typeof value.error === "string"
        ? value.error
        : unavailable,
    );
  if (!value || typeof value !== "object") throw new Error(unavailable);
  return value;
}
export async function connectionRequest(
  path: string,
  body?: TradingConnectionCommand,
  signal?: AbortSignal,
): Promise<unknown> {
  const response = await tradingFetch(`/api/trading/${path}`, {
    ...(signal ? { signal } : {}),
    ...(body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });
  return readConnectionResponse(response);
}
export function useTradingConnections() {
  const client = useQueryClient(),
    scope = tradingQueryScope();
  const query = useQuery({
    queryKey: [...scope, "connections"],
    queryFn: async ({ signal }) =>
      Schema.decodeUnknownSync(TradingConnectionStatus)(
        await connectionRequest("connections", undefined, signal),
      ),
    staleTime: 10_000,
    refetchInterval: 30_000,
    retry: false,
  });
  return { ...query, refresh: () => client.invalidateQueries({ queryKey: scope }) };
}
