import { useEffect, useMemo, useState } from "react";
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
) {
  let disposed = false;
  let source: ReturnType<typeof openTradingStream> | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let notification: ReturnType<typeof setTimeout> | undefined;
  const bars = new Map<number, Candle>();
  let status = "Loading initial balance minute history…";
  const publish = () => {
    if (notification !== undefined || disposed) return;
    notification = setTimeout(() => {
      notification = undefined;
      if (disposed) return;
      const sorted = [...bars.values()].sort((a, b) => a.time - b.time).slice(-1200);
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

export function useInitialBalanceHistory(symbol: string, enabled: boolean): InitialBalanceHistory {
  const [history, setHistory] = useState<InitialBalanceHistory>({
    symbol: "",
    bars: [],
    status: "",
  });
  useEffect(() => {
    if (!enabled || !symbol) return;
    return subscribeInitialBalanceHistory(symbol, setHistory);
  }, [symbol, enabled]);
  return useMemo(
    () =>
      enabled && history.symbol === symbol
        ? history
        : { symbol, bars: [], status: enabled ? "Loading initial balance minute history…" : "" },
    [enabled, history, symbol],
  );
}
