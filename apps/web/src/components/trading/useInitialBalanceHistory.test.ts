import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { cancelInactiveTradingStream } from "./tradingStreamIterable";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  initialBalanceChartPoints,
  initialBalanceHistoryQueryOptions,
  subscribeInitialBalanceHistory,
  type InitialBalanceHistory,
} from "./useInitialBalanceHistory";
import type { openTradingStream } from "./tradingTransport";
const candle = (time: number, close = 100) => ({
  time,
  open: 100,
  high: 110,
  low: 90,
  close,
  volume: 1,
});
afterEach(() => vi.useRealTimers());
describe("auxiliary initial balance history", () => {
  it("uses same-contract minute history, batches updates, reconnects and ignores disposed events", () => {
    vi.useFakeTimers();
    const callbacks: Parameters<typeof openTradingStream>[1][] = [];
    const close = vi.fn();
    const open = vi.fn<typeof openTradingStream>((_url, cb) => {
      callbacks.push(cb);
      return { close };
    });
    const updates: InitialBalanceHistory[] = [];
    const dispose = subscribeInitialBalanceHistory("NQZ6", (value) => updates.push(value), open);
    expect(open.mock.calls[0]?.[0]).toContain("symbol=NQZ6&interval=1&intervalUnit=minute");
    callbacks[0]!.onMessage(
      JSON.stringify({ type: "bars", intervalKey: "second:1", bars: [candle(20)] }),
    );
    callbacks[0]!.onMessage(
      JSON.stringify({
        type: "bars",
        intervalKey: "minute:1",
        bars: [candle(60), candle(0), { time: 90 }],
      }),
    );
    callbacks[0]!.onMessage(
      JSON.stringify({ type: "bars", intervalKey: "minute:1", bars: [candle(60, 105)] }),
    );
    vi.advanceTimersByTime(16);
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      symbol: "NQZ6",
      status: "",
      bars: [candle(0), candle(60, 105)],
    });
    callbacks[0]!.onMessage(
      JSON.stringify({ type: "bars", intervalKey: "minute:1", bars: [candle(60, 105)] }),
    );
    vi.advanceTimersByTime(16);
    expect(updates).toHaveLength(1);
    callbacks[0]!.onError();
    vi.advanceTimersByTime(5000);
    expect(open).toHaveBeenCalledTimes(2);
    expect(updates.at(-1)?.status).toContain("Reconnecting");
    callbacks[1]!.onMessage(
      JSON.stringify({ type: "bars", intervalKey: "minute:1", bars: [candle(120)] }),
    );
    dispose();
    callbacks[1]!.onError();
    callbacks[1]!.onMessage(
      JSON.stringify({ type: "bars", intervalKey: "minute:1", bars: [candle(180)] }),
    );
    vi.runAllTimers();
    expect(updates).toHaveLength(2);
    expect(open).toHaveBeenCalledTimes(2);
  });
  it("maps study values only onto actual chart times", () => {
    const points = [
      { time: 60, value: 10 },
      { time: 120, value: 20 },
      { time: 180, value: 30 },
    ];
    const bars = [30, 65.125, 70.25, 125.5, 181, 240].map((time) => candle(time));
    expect(initialBalanceChartPoints(points, bars, 200)).toEqual([
      { time: 65.125, value: 10 },
      { time: 70.25, value: 10 },
      { time: 125.5, value: 20 },
      { time: 181, value: 30 },
    ]);
    expect(initialBalanceChartPoints([], bars, 200)).toEqual([]);
    expect(
      initialBalanceChartPoints(
        points,
        [
          { ...candle(1000), actualTime: 65 },
          { ...candle(1000.1), actualTime: 125 },
          { ...candle(1000.2), actualTime: 240 },
        ],
        200,
      ),
    ).toEqual([
      { time: 1000, value: 10 },
      { time: 1000.1, value: 20 },
    ]);
  });
});

describe("initial balance query ownership", () => {
  it("restarts on shared invalidation even if the vendor has never sent a bar", async () => {
    vi.useFakeTimers();
    const client = new QueryClient();
    const close = vi.fn();
    const open = vi.fn<typeof openTradingStream>(() => ({ close }));
    const options = initialBalanceHistoryQueryOptions(
      ["trading", "https://one.test"],
      "workspace-a",
      "NQZ6",
      open,
    );
    const observer = new QueryObserver(client, options);
    const unsubscribe = observer.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(0);
    expect(open).toHaveBeenCalledTimes(1);
    const renewal = client.invalidateQueries({ queryKey: ["trading"] });
    await vi.advanceTimersByTimeAsync(0);
    expect(open).toHaveBeenCalledTimes(2);
    expect(close).toHaveBeenCalledTimes(1);
    unsubscribe();
    await vi.advanceTimersByTimeAsync(0);
    await renewal;
    expect(close).toHaveBeenCalledTimes(2);
    client.clear();
  });
  it("deduplicates observers, retains cache on renewal and releases the SSE when disabled", async () => {
    vi.useFakeTimers();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const connections: {
      callbacks: Parameters<typeof openTradingStream>[1];
      close: ReturnType<typeof vi.fn>;
    }[] = [];
    const open = vi.fn<typeof openTradingStream>((_url, callbacks) => {
      const close = vi.fn();
      connections.push({ callbacks, close });
      return { close };
    });
    const options = initialBalanceHistoryQueryOptions(
      ["trading", "https://one.test"],
      "workspace-a",
      "NQZ6",
      open,
    );
    const first = new QueryObserver(client, options),
      second = new QueryObserver(client, options);
    const unsubscribeFirst = first.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(0);
    expect(open).toHaveBeenCalledTimes(1);
    expect(client.getQueryData(options.queryKey)).toMatchObject({
      bars: [],
      status: "Loading initial balance minute history…",
    });
    const unsubscribeSecond = second.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(0);
    expect(open).toHaveBeenCalledTimes(1);
    connections[0]!.callbacks.onMessage(
      JSON.stringify({ type: "bars", intervalKey: "minute:1", bars: [candle(60)] }),
    );
    await vi.advanceTimersByTimeAsync(16);
    expect(client.getQueryData(options.queryKey)).toMatchObject({ bars: [candle(60)], status: "" });
    const renewal = client.invalidateQueries({ queryKey: ["trading"] });
    await vi.advanceTimersByTimeAsync(0);
    expect(open).toHaveBeenCalledTimes(2);
    expect(connections[0]!.close).toHaveBeenCalledTimes(1);
    expect(client.getQueryData(options.queryKey)).toMatchObject({ bars: [candle(60)] });
    first.setOptions({ ...options, enabled: false });
    await cancelInactiveTradingStream(client, options.queryKey);
    expect(connections[1]!.close).not.toHaveBeenCalled();
    second.setOptions({ ...options, enabled: false });
    await cancelInactiveTradingStream(client, options.queryKey);
    await vi.advanceTimersByTimeAsync(0);
    await renewal;
    expect(connections[1]!.close).toHaveBeenCalledTimes(1);
    expect(client.getQueryData(options.queryKey)).toMatchObject({ bars: [candle(60)] });
    connections[1]!.callbacks.onError();
    await vi.advanceTimersByTimeAsync(5000);
    expect(open).toHaveBeenCalledTimes(2);
    unsubscribeFirst();
    unsubscribeSecond();
    client.clear();
  });
  it("keeps project/environment/symbol caches isolated and aborts the last unmounted observer", async () => {
    vi.useFakeTimers();
    const client = new QueryClient();
    const close = vi.fn();
    const open = vi.fn<typeof openTradingStream>(() => ({ close }));
    const options = initialBalanceHistoryQueryOptions(
      ["trading", "https://one.test"],
      "workspace-a",
      "NQZ6",
      open,
    );
    client.setQueryData(options.queryKey, { symbol: "NQZ6", bars: [candle(60)], status: "" });
    for (const other of [
      initialBalanceHistoryQueryOptions(
        ["trading", "https://one.test"],
        "workspace-b",
        "NQZ6",
        open,
      ),
      initialBalanceHistoryQueryOptions(
        ["trading", "https://two.test"],
        "workspace-a",
        "NQZ6",
        open,
      ),
      initialBalanceHistoryQueryOptions(
        ["trading", "https://one.test"],
        "workspace-a",
        "GCZ6",
        open,
      ),
    ])
      expect(client.getQueryData(other.queryKey)).toBeUndefined();
    const observer = new QueryObserver(client, options);
    const unsubscribe = observer.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(0);
    expect(open).toHaveBeenCalledTimes(1);
    expect(client.getQueryData(options.queryKey)).toMatchObject({ bars: [candle(60)] });
    unsubscribe();
    await vi.advanceTimersByTimeAsync(0);
    expect(close).toHaveBeenCalledTimes(1);
    expect(client.getQueryData(options.queryKey)).toMatchObject({ bars: [candle(60)] });
    client.clear();
  });
});
