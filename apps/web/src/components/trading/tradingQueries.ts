import { queryOptions, useQueries } from "@tanstack/react-query";
import { resolvePrimaryEnvironmentHttpUrl } from "../../environments/primary/target";
import { tradingFetch } from "./tradingTransport";
import { INSTRUMENT_ROOTS, type InstrumentRoot } from "./tradingInstruments";
import { loadMarketContracts } from "./contractLoader";

export function tradingQueryScope() {
  return ["trading", resolvePrimaryEnvironmentHttpUrl("/")] as const;
}
export function contractQueryOptions(
  scope: readonly string[],
  root: InstrumentRoot,
  request: typeof fetch = tradingFetch,
) {
  return queryOptions({
    queryKey: [...scope, "contracts", root],
    queryFn: async ({ signal }) => {
      let result: import("./contractLoader").ContractResult | undefined;
      await loadMarketContracts([root], signal, request, (value) => {
        result = value;
      });
      if (signal.aborted) throw new DOMException("Request cancelled", "AbortError");
      if (!result?.contracts) throw new Error(result?.error ?? `Could not load ${root}.`);
      return result.contracts;
    },
    staleTime: 15 * 60_000,
    refetchInterval: 15 * 60_000,
  });
}
export function useTradingContracts() {
  const scope = tradingQueryScope();
  const queries = useQueries({
    queries: INSTRUMENT_ROOTS.map((root) => contractQueryOptions(scope, root)),
  });
  return { queries, contracts: queries.flatMap((query) => query.data ?? []), scope };
}
