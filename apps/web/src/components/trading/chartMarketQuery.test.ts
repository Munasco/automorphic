import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import {
  chartMarketQueryOptions,
  subscribeChartMarket,
  type ChartMarketSnapshot,
} from "./chartMarketQuery";
import type { openTradingStream } from "./tradingTransport";
const interval = { unit: "minute", value: 5 } as const;
const bar = (time: number, close = 100) => ({
  time,
  open: 100,
  high: 110,
  low: 90,
  close,
  volume: 10,
});
function transport() {
  const subscriptions: Array<{
    events: Parameters<typeof openTradingStream>[1];
    close: ReturnType<typeof vi.fn>;
  }> = [];
  const open: typeof openTradingStream = (_url, events) => {
    const close = vi.fn();
    subscriptions.push({ events, close });
    return { close };
  };
  const send = (index: number, value: unknown) =>
    subscriptions[index]!.events.onMessage(JSON.stringify(value));
  return { open, subscriptions, send };
}
const batch = (bars: unknown[], snapshot = false) => ({
  type: "bars",
  symbol: "NQU6",
  intervalKey: "minute:5",
  bars,
  snapshot,
});
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
describe("shared chart market history", () => {
  it("bounds cached history and replacement deltas together", async () => {
    const t = transport(),
      emit = vi.fn<(snapshot: ChartMarketSnapshot) => void>();
    const stop = subscribeChartMarket("NQU6", interval, emit, undefined, t.open);
    t.send(
      0,
      batch(
        Array.from({ length: 1400 }, (_, index) => bar(index + 1)),
        true,
      ),
    );
    await vi.advanceTimersByTimeAsync(16);
    const snapshot = emit.mock.lastCall![0];
    expect(snapshot.bars).toHaveLength(1200);
    expect(snapshot.bars[0]!.time).toBe(201);
    expect(snapshot.updates).toBe(snapshot.bars);
    expect(snapshot.replace).toBe(true);
    stop();
  });
  it("batches changes, retains complete history and marks authoritative replacements", async () => {
    const t = transport();
    const emit = vi.fn<(snapshot: ChartMarketSnapshot) => void>();
    const stop = subscribeChartMarket("NQU6", interval, emit, undefined, t.open);
    t.send(0, batch([bar(100), bar(200)]));
    t.send(0, batch([bar(200, 105)]));
    await vi.advanceTimersByTimeAsync(16);
    expect(emit).toHaveBeenCalledTimes(1);
    const first = emit.mock.calls[0]![0];
    expect(first.bars).toEqual([bar(100), bar(200, 105)]);
    expect(first.updates).toEqual(first.bars);
    expect(first.revision).toBe(1);
    t.send(0, { type: "quote", quote: { symbol: "MGCZ6", last: 4400 } });
    t.send(0, { type: "quote", quote: { symbol: "NQU6", last: 106, volume: Infinity } });
    await vi.advanceTimersByTimeAsync(16);
    const quoted = emit.mock.lastCall![0];
    expect(quoted.bars).toBe(first.bars);
    expect(quoted.revision).toBe(1);
    expect(quoted.quote).toEqual({ symbol: "NQU6", last: 106, source: "quote" });
    t.send(0, batch([bar(300)], true));
    await vi.advanceTimersByTimeAsync(16);
    expect(emit.mock.lastCall![0]).toMatchObject({ bars: [bar(300)], revision: 2, replace: true });
    t.send(0, batch([], true));
    await vi.advanceTimersByTimeAsync(16);
    expect(emit.mock.lastCall![0]).toMatchObject({ bars: [], revision: 3, replace: true });
    stop();
    expect(t.subscriptions[0]!.close).toHaveBeenCalledOnce();
  });
  it("rejects foreign intervals and stops queued notifications and reconnects on disposal", async () => {
    const t = transport(),
      emit = vi.fn();
    const stop = subscribeChartMarket("NQU6", interval, emit, undefined, t.open);
    t.send(0, { ...batch([bar(100)]), intervalKey: "second:5" });
    t.send(0, { ...batch([bar(100)]), symbol: "MGCZ6" });
    await vi.advanceTimersByTimeAsync(16);
    expect(emit).not.toHaveBeenCalled();
    t.subscriptions[0]!.events.onError();
    stop();
    await vi.advanceTimersByTimeAsync(6000);
    expect(t.subscriptions).toHaveLength(1);
    expect(emit).not.toHaveBeenCalled();
  });
  it("shares one live stream, keeps cache across invalidation and closes after the last observer", async () => {
    const t = transport();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const options = chartMarketQueryOptions(
      ["trading", "env-a"],
      "workspace-a",
      "NQU6",
      interval,
      t.open,
    );
    const first = new QueryObserver(client, options);
    const stopFirst = first.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(0);
    const second = new QueryObserver(client, options);
    const stopSecond = second.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(0);
    expect(t.subscriptions).toHaveLength(1);
    t.send(0, batch([bar(100)]));
    await vi.advanceTimersByTimeAsync(16);
    expect(client.getQueryData<ChartMarketSnapshot>(options.queryKey)?.bars).toEqual([bar(100)]);
    void client.invalidateQueries({ queryKey: options.queryKey, exact: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(t.subscriptions).toHaveLength(2);
    expect(t.subscriptions[0]!.close).toHaveBeenCalledOnce();
    expect(client.getQueryData<ChartMarketSnapshot>(options.queryKey)?.bars).toEqual([bar(100)]);
    stopFirst();
    await vi.advanceTimersByTimeAsync(0);
    expect(t.subscriptions[1]!.close).not.toHaveBeenCalled();
    stopSecond();
    await vi.advanceTimersByTimeAsync(0);
    expect(t.subscriptions[1]!.close).toHaveBeenCalledOnce();
    expect(client.getQueryData<ChartMarketSnapshot>(options.queryKey)?.bars).toEqual([bar(100)]);
    const reopened = new QueryObserver(client, options);
    const stopReopened = reopened.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(0);
    expect(t.subscriptions).toHaveLength(3);
    expect(reopened.getCurrentResult().data?.bars).toEqual([bar(100)]);
    expect(
      chartMarketQueryOptions(["trading", "env-b"], "workspace-a", "NQU6", interval).queryKey,
    ).not.toEqual(options.queryKey);
    expect(
      chartMarketQueryOptions(["trading", "env-a"], "workspace-b", "NQU6", interval).queryKey,
    ).not.toEqual(options.queryKey);
    stopReopened();
    await vi.advanceTimersByTimeAsync(0);
    client.clear();
  });
});
