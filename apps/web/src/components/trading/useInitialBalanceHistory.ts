import { chartHistoryLimit } from "./tradingIntervals";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import {
  experimental_streamedQuery,
  queryOptions,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { tradingQueryScope } from "./tradingQueries";
import { tradingWorkspaceStorage } from "./workspaceStorage";
import { cancelInactiveTradingStream, tradingStreamIterable } from "./tradingStreamIterable";
import type { Candle, IndicatorPoint } from "./chartIndicators";
import { openTradingStream } from "./tradingTransport";

export type InitialBalanceHistory = {
  symbol: string;
  bars: readonly Candle[];
  status: string;
};

/** Re-sample auxiliary study points onto existing chart times, never extending its timeline. */
export function initialBalanceChartPoints(
  points: readonly IndicatorPoint[],
  bars: readonly Candle[],
  sessionEnd: number,
): IndicatorPoint[] {
  const result: IndicatorPoint[] = [];
  let index = -1;
  for (const bar of bars) {
    const actualTime = bar.actualTime ?? bar.time;
    while (index + 1 < points.length && points[index + 1]!.time <= actualTime) index += 1;
    const point = points[index];
    if (point && actualTime <= sessionEnd) result.push({ time: bar.time, value: point.value });
  }
  return result;
}

/** Independent minute history covers the opening hour even when the chart only holds seconds. */
export function subscribeInitialBalanceHistory(
  symbol: string,
  onChange: (history: InitialBalanceHistory) => void,
  open: typeof openTradingStream = openTradingStream,
  initialBars: readonly Candle[] = [],
) {
  let disposed = false;
  let source: ReturnType<typeof openTradingStream> | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let notification: ReturnType<typeof setTimeout> | undefined;
  const bars = new Map<number, Candle>(initialBars.map((bar) => [bar.time, bar]));
  let status = "Loading initial balance minute history…";
  const publish = () => {
    if (notification !== undefined || disposed) return;
    notification = setTimeout(() => {
      notification = undefined;
      if (disposed) return;
      const sorted = [...bars.values()]
        .sort((a, b) => a.time - b.time)
        .slice(-chartHistoryLimit({ unit: "minute" }));
      bars.clear();
      for (const bar of sorted) bars.set(bar.time, bar);
      onChange({ symbol, bars: sorted, status });
    }, 16);
  };
  const connect = () => {
    if (disposed) return;
    source = open(
      `/api/trading/stream?${new URLSearchParams({ symbol, interval: "1", intervalUnit: "minute" })}`,
      {
        onMessage(data) {
          if (disposed) return;
          let message;
          try {
            message = JSON.parse(data);
          } catch {
            return;
          }
          if (message.intervalKey !== "minute:1") return;
          if (message.type === "status") {
            if (message.state === "connected") return;
            status =
              message.state === "disconnected"
                ? "Reconnecting initial balance minute history…"
                : "Loading initial balance minute history…";
            publish();
          }
          if (message.type !== "bars" || !Array.isArray(message.bars)) return;
          let changed = false;
          for (const bar of message.bars) {
            if (
              !bar ||
              ![bar.time, bar.open, bar.high, bar.low, bar.close, bar.volume].every(
                Number.isFinite,
              ) ||
              bar.high < bar.low
            )
              continue;
            const previous = bars.get(bar.time);
            if (
              previous &&
              previous.open === bar.open &&
              previous.high === bar.high &&
              previous.low === bar.low &&
              previous.close === bar.close &&
              previous.volume === bar.volume
            )
              continue;
            bars.set(bar.time, {
              time: bar.time,
              open: bar.open,
              high: bar.high,
              low: bar.low,
              close: bar.close,
              volume: bar.volume,
            });
            changed = true;
          }
          const wasLoading = status !== "";
          status = "";
          if (changed || wasLoading) publish();
        },
        onError() {
          if (disposed) return;
          source?.close();
          status = "Reconnecting initial balance minute history…";
          publish();
          clearTimeout(retry);
          retry = setTimeout(connect, 5000);
        },
      },
    );
  };
  connect();
  return () => {
    disposed = true;
    source?.close();
    clearTimeout(retry);
    clearTimeout(notification);
  };
}

export function initialBalanceHistoryQueryOptions(
  scope: readonly string[],
  projectId: string | null,
  symbol: string,
  open: typeof openTradingStream = openTradingStream,
) {
  const initialValue: InitialBalanceHistory = {
    symbol,
    bars: [],
    status: "Loading initial balance minute history…",
  };
  return queryOptions({
    queryKey: [...scope, projectId, "initial-balance-history", symbol, "minute:1"],
    queryFn: experimental_streamedQuery<InitialBalanceHistory, InitialBalanceHistory>({
      refetchMode: "append",
      initialValue,
      reducer: (_previous, snapshot) => snapshot,
      streamFn: ({ signal, client, queryKey }) => {
        const cached = client.getQueryData<InitialBalanceHistory>(queryKey);
        const seed = {
          ...(cached ?? initialValue),
          status: "Loading initial balance minute history…",
        };
        return tradingStreamIterable(
          signal,
          (emit) => subscribeInitialBalanceHistory(symbol, emit, open, seed.bars),
          seed,
        );
      },
    }),
    staleTime: Infinity,
    gcTime: 5 * 60_000,
    refetchOnMount: (query) => (query.state.fetchStatus === "fetching" ? false : "always"),
    refetchOnWindowFocus: false,
    retry: false,
  });
}

export function useInitialBalanceHistory(symbol: string, enabled: boolean): InitialBalanceHistory {
  const workspace = useSyncExternalStore(
    tradingWorkspaceStorage.subscribe,
    tradingWorkspaceStorage.getSnapshot,
  );
  const environmentBase = tradingQueryScope()[1];
  const client = useQueryClient();
  const options = useMemo(
    () =>
      initialBalanceHistoryQueryOptions(["trading", environmentBase], workspace.projectId, symbol),
    [environmentBase, workspace.projectId, symbol],
  );
  const active = enabled && !!symbol && workspace.ready;
  const query = useQuery({ ...options, enabled: active });
  useEffect(() => {
    if (active) return;
    void cancelInactiveTradingStream(client, options.queryKey);
  }, [active, client, options.queryKey]);
  return useMemo(
    () =>
      active && query.data
        ? query.data
        : { symbol, bars: [], status: enabled ? "Loading initial balance minute history…" : "" },
    [active, query.data, symbol, enabled],
  );
}
