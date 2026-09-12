import { experimental_streamedQuery, queryOptions } from "@tanstack/react-query";
import type { Candle } from "./chartIndicators";
import type { MarketQuote } from "./InstrumentHeader";
import { chartIntervalKey, chartIntervalQuery, type ChartInterval } from "./tradingIntervals";
import { openTradingStream, type TradingStreamFailure } from "./tradingTransport";
import { readChartCandle, readTickHistoryQuality, type TickHistoryQuality } from "./tickChartData";
import { tradingStreamIterable } from "./tradingStreamIterable";

export type ChartMarketSnapshot = {
  bars: readonly Candle[];
  updates: readonly Candle[];
  revision: number;
  replace: boolean;
  status: string;
  failure?: TradingStreamFailure | null;
  awaitingHistory?: boolean;
  quote: MarketQuote | null;
  tickHistory: TickHistoryQuality | null;
};
export const emptyChartMarket = (): ChartMarketSnapshot => ({
  bars: [],
  updates: [],
  revision: 0,
  replace: true,
  status: "Connecting to Tradovate…",
  failure: null,
  awaitingHistory: true,
  quote: null,
  tickHistory: null,
});

/** Publish complete cache snapshots with a revisioned delta for incremental canvas rendering. */
export function subscribeChartMarket(
  symbol: string,
  interval: ChartInterval,
  emit: (snapshot: ChartMarketSnapshot) => void,
  seed = emptyChartMarket(),
  open: typeof openTradingStream = openTradingStream,
) {
  let disposed = false;
  let source: ReturnType<typeof openTradingStream> | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let notification: ReturnType<typeof setTimeout> | undefined;
  let current: ChartMarketSnapshot = {
    ...seed,
    quote: null,
    status: "Connecting to Tradovate…",
    awaitingHistory: true,
  };
  const bars = new Map(seed.bars.map((bar) => [bar.time, bar]));
  const pending = new Map<number, Candle>();
  let replace = false;
  const publish = () => {
    if (disposed || notification !== undefined) return;
    notification = setTimeout(() => {
      notification = undefined;
      if (disposed) return;
      if (pending.size || replace) {
        let sorted = [...bars.values()].sort((a, b) => a.time - b.time);
        if (sorted.length > 1300) {
          sorted = sorted.slice(-1200);
          bars.clear();
          for (const bar of sorted) bars.set(bar.time, bar);
          replace = true;
        }
        current = {
          ...current,
          bars: sorted,
          updates: replace ? sorted : [...pending.values()],
          revision: current.revision + 1,
          replace,
        };
        pending.clear();
        replace = false;
      }
      emit(current);
    }, 16);
  };
  const connect = () => {
    if (disposed) return;
    source = open(
      `/api/trading/stream?${new URLSearchParams({ symbol, ...chartIntervalQuery(interval) })}`,
      {
        onMessage(data) {
          if (disposed) return;
          let message;
          try {
            message = JSON.parse(data);
          } catch {
            return;
          }
          if (!message || typeof message !== "object") return;
          if (message.type === "quote") {
            const input = message.quote;
            if (!input || input.symbol !== symbol || !Number.isFinite(input.last)) return;
            const quote: MarketQuote = { symbol, last: input.last, source: "quote" };
            for (const key of ["open", "high", "low", "volume", "previousClose"] as const)
              if (typeof input[key] === "number" && Number.isFinite(input[key]))
                quote[key] = input[key];
            if (typeof input.timestamp === "string" && Number.isFinite(Date.parse(input.timestamp)))
              quote.timestamp = input.timestamp;
            current = { ...current, quote };
            publish();
            return;
          }
          if (message.intervalKey !== chartIntervalKey(interval)) return;
          if (interval.unit === "tick") {
            const quality = readTickHistoryQuality(message.tickHistory);
            if (quality || message.snapshot === true)
              current = { ...current, tickHistory: quality };
          }
          if (message.type === "status") {
            current = {
              ...current,
              status: typeof message.message === "string" ? message.message : current.status,
              awaitingHistory:
                message.state === "disconnected" || message.state === "connecting"
                  ? true
                  : (current.awaitingHistory ?? true),
              quote:
                message.state === "disconnected" || message.state === "connecting"
                  ? null
                  : current.quote,
            };
            publish();
            return;
          }
          if (
            message.type !== "bars" ||
            !Array.isArray(message.bars) ||
            (message.symbol && message.symbol !== symbol)
          )
            return;
          const received = message.bars.flatMap((item: unknown) => {
            const bar = readChartCandle(item);
            return bar ? [bar] : [];
          });
          // Invalid nonempty replacements are not authoritative empty history. Preserve both
          // the cached bars and any valid updates waiting for the next notification.
          if (message.bars.length > 0 && received.length === 0) return;
          if (message.snapshot === true) {
            bars.clear();
            pending.clear();
            replace = true;
          }
          for (const bar of received) {
            bars.set(bar.time, bar);
            pending.set(bar.time, bar);
          }
          if (received.length > 0 || (message.snapshot === true && message.bars.length === 0))
            current = {
              ...current,
              status: "Tradovate connected",
              failure: null,
              awaitingHistory: false,
            };
          publish();
        },
        onError(failure) {
          if (disposed) return;
          source?.close();
          const serverReason = ![
            "Connecting to Tradovate…",
            "Tradovate connected",
            "Reconnecting to Tradovate…",
          ].includes(current.status);
          current = {
            ...current,
            quote: null,
            status: serverReason ? current.status : "Reconnecting to Tradovate…",
            failure:
              failure?.kind === "closed"
                ? (current.failure ?? failure)
                : (failure ?? { kind: "network" }),
            awaitingHistory: true,
          };
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

export function chartMarketQueryOptions(
  scope: readonly string[],
  projectId: string,
  symbol: string,
  interval: ChartInterval,
  open: typeof openTradingStream = openTradingStream,
) {
  const queryKey = [
    ...scope,
    projectId,
    "chart-history",
    symbol,
    chartIntervalKey(interval),
  ] as const;
  return queryOptions({
    queryKey,
    queryFn: experimental_streamedQuery<ChartMarketSnapshot, ChartMarketSnapshot, typeof queryKey>({
      refetchMode: "append",
      initialValue: emptyChartMarket(),
      reducer: (_previous, next) => next,
      streamFn: ({ signal, client }) => {
        const seed = client.getQueryData<ChartMarketSnapshot>(queryKey) ?? emptyChartMarket();
        const initial = {
          ...seed,
          quote: null,
          status: "Connecting to Tradovate…",
          awaitingHistory: true,
        };
        return tradingStreamIterable<ChartMarketSnapshot>(
          signal,
          (emit) => subscribeChartMarket(symbol, interval, emit, initial, open),
          initial,
        );
      },
    }),
    staleTime: Infinity,
    refetchOnMount: (query) => (query.state.fetchStatus === "fetching" ? false : "always"),
    refetchOnWindowFocus: false,
    gcTime: 5 * 60_000,
    structuralSharing: false,
    retry: false,
  });
}
