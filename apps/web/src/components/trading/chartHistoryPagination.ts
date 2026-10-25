import type { QueryClient, QueryKey } from "@tanstack/react-query";
import type { Candle } from "./chartIndicators";
import { chartIntervalKey, chartIntervalQuery, type ChartInterval } from "./tradingIntervals";
import { tradingFetch } from "./tradingTransport";
import { readChartCandle } from "./tickChartData";

export type OlderChartHistory = {
  bars: readonly Candle[];
  hasMore: boolean;
  nextBefore?: number | null;
  emptyPages?: number;
};
export const olderChartHistoryKey = (marketKey: QueryKey) => [...marketKey, "older-v2"] as const;
export function shouldPrefetchChartHistory(range: { from: number; to: number } | null) {
  return range !== null && range.from <= Math.max(300, (range.to - range.from) * 2);
}

export async function loadOlderChartHistory(
  client: QueryClient,
  marketKey: QueryKey,
  symbol: string,
  interval: ChartInterval,
  before: number,
  request: typeof tradingFetch = tradingFetch,
) {
  const key = olderChartHistoryKey(marketKey);
  const page = await client.fetchQuery({
    queryKey: [...key, before],
    staleTime: Infinity,
    gcTime: 5 * 60_000,
    retry: false,
    queryFn: async ({ signal }): Promise<OlderChartHistory> => {
      const response = await request(
        `/api/trading/history?${new URLSearchParams({
          symbol,
          ...chartIntervalQuery(interval),
          before: String(before),
        })}`,
        { signal },
      );
      if (!response.ok) throw new Error("Older candles could not be loaded. Retry.");
      const data: unknown = await response.json();
      if (
        !data ||
        typeof data !== "object" ||
        !("bars" in data) ||
        !Array.isArray(data.bars) ||
        !("symbol" in data) ||
        data.symbol !== symbol ||
        !("intervalKey" in data) ||
        data.intervalKey !== chartIntervalKey(interval)
      )
        throw new Error("Invalid chart history. Retry.");
      const bars = data.bars.flatMap((item: unknown) => {
        const bar = readChartCandle(item);
        return bar && bar.time < before ? [bar] : [];
      });
      if (data.bars.length && !bars.length) throw new Error("Invalid chart history. Retry.");
      const nextBefore = "nextBefore" in data ? data.nextBefore : (bars[0]?.time ?? null);
      if (
        nextBefore !== null &&
        (typeof nextBefore !== "number" ||
          !Number.isFinite(nextBefore) ||
          nextBefore <= 0 ||
          nextBefore >= before)
      )
        throw new Error("Invalid chart history cursor. Retry.");
      if ("hasMore" in data && typeof data.hasMore !== "boolean")
        throw new Error("Invalid chart history. Retry.");
      const hasMore = "hasMore" in data ? data.hasMore === true : nextBefore !== null;
      if (hasMore && nextBefore === null) throw new Error("Missing chart history cursor. Retry.");
      return { bars, hasMore, nextBefore: hasMore ? (nextBefore as number) : null };
    },
  });
  client.setQueryData<OlderChartHistory>(key, (previous) => ({
    bars: [
      ...new Map([...page.bars, ...(previous?.bars ?? [])].map((bar) => [bar.time, bar])).values(),
    ].sort((a, b) => a.time - b.time),
    hasMore: page.hasMore && previous?.hasMore !== false,
    nextBefore: page.nextBefore ?? null,
    emptyPages: page.bars.length ? 0 : (previous?.emptyPages ?? 0) + 1,
  }));
}

export function prependedChartViewport(
  range: { from: number; to: number } | null,
  oldFirst: number | undefined,
  bars: readonly Candle[],
) {
  if (!range || oldFirst === undefined) return null;
  const count = bars.filter((bar) => bar.time < oldFirst).length;
  return count ? { from: range.from + count, to: range.to + count } : null;
}
