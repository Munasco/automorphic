import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import {
  chartMarketQueryOptions,
  subscribeChartMarket,
  emptyChartMarket,
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
  it("retains server-proven calendar quote membership and captures receipt separately from close source time", async () => {
    const t = transport(),
      emit = vi.fn<(snapshot: ChartMarketSnapshot) => void>();
    const stop = subscribeChartMarket("NQU6", { unit: "month", value: 1 }, emit, undefined, t.open);
    const metadata = { symbol: "NQU6", intervalKey: "month:1", historyComplete: true };
    t.send(0, { type: "bars", ...metadata, bars: [bar(100)], provenance: "historical" });
    t.send(0, {
      type: "quote",
      quote: { symbol: "NQU6", last: 101, timestamp: "2026-09-11T12:00:00Z", barTime: 100 },
    });
    const observedAt = Date.now();
    t.send(0, {
      type: "bar-close",
      ...metadata,
      provenance: "live",
      bar: bar(100),
      closedAt: 200_000,
    });
    await vi.advanceTimersByTimeAsync(16);
    expect(emit.mock.lastCall![0].alertFeed?.events[0]).toMatchObject({
      type: "quote",
      barTime: 100,
    });
    expect(emit.mock.lastCall![0].alertFeed?.events[1]).toMatchObject({
      type: "bar-close",
      timestamp: 200_000,
      observedAt,
    });
    stop();
  });

  it("only journals tick close-price updates with explicit real end timestamps and live provenance", async () => {
    const t = transport(),
      emit = vi.fn<(snapshot: ChartMarketSnapshot) => void>();
    const stop = subscribeChartMarket("NQU6", { unit: "tick", value: 10 }, emit, undefined, t.open);
    const packet = (bars: unknown[], provenance: string) => ({
      type: "bars",
      symbol: "NQU6",
      intervalKey: "tick:10",
      bars,
      provenance,
      historyComplete: true,
    });
    t.send(0, packet([{ ...bar(100), actualEndTime: 101 }], "historical"));
    t.send(0, packet([bar(102)], "live"));
    t.send(
      0,
      packet([{ ...bar(103, 105), actualTime: 103, actualEndTime: 104, barId: "tick-3" }], "live"),
    );
    await vi.advanceTimersByTimeAsync(16);
    expect(emit.mock.lastCall![0].alertFeed?.events).toEqual([
      { type: "quote", price: 105, timestamp: 104000, barTime: 103, sequence: 1 },
    ]);
    stop();
  });

  it("preserves timestamped quote order through notification coalescing and cumulative snapshots", async () => {
    const t = transport(),
      emit = vi.fn<(snapshot: ChartMarketSnapshot) => void>();
    const stop = subscribeChartMarket("NQU6", interval, emit, undefined, t.open);
    t.send(0, {
      ...batch([bar(100)], true),
      historical: true,
      provenance: "historical",
      historyComplete: true,
    });
    await vi.advanceTimersByTimeAsync(16);
    const timestamp = "2026-09-11T12:00:00.001Z";
    for (const last of [99, 101, 99])
      t.send(0, { type: "quote", quote: { symbol: "NQU6", last, timestamp } });
    await vi.advanceTimersByTimeAsync(16);
    const first = emit.mock.lastCall![0];
    expect(first.quote?.last).toBe(99);
    expect(first.alertFeed?.events.map((e) => (e.type === "quote" ? e.price : null))).toEqual([
      99, 101, 99,
    ]);
    expect(first.alertFeed?.events.map((e) => e.timestamp)).toEqual(
      Array(3).fill(Date.parse(timestamp)),
    );
    t.send(0, { type: "quote", quote: { symbol: "NQU6", last: 103, timestamp } });
    await vi.advanceTimersByTimeAsync(16);
    expect(emit.mock.lastCall![0].alertFeed?.events.map((e) => e.sequence)).toEqual([1, 2, 3, 4]);
    expect(first.alertFeed?.events).toHaveLength(3);
    stop();
  });
  it("rejects regressing or undated quotes without changing candles or the accepted trade journal", async () => {
    const t = transport(),
      emit = vi.fn<(snapshot: ChartMarketSnapshot) => void>();
    const stop = subscribeChartMarket("NQU6", interval, emit, undefined, t.open);
    t.send(0, { ...batch([bar(100)], true), historyComplete: true });
    const sendQuote = (last: number, timestamp?: string) =>
      t.send(0, { type: "quote", quote: { symbol: "NQU6", last, timestamp } });
    sendQuote(101, "2026-09-11T12:00:02Z");
    // Rejection also applies before the current 16ms notification is published.
    sendQuote(99, "2026-09-11T12:00:01Z");
    sendQuote(98);
    sendQuote(97, "invalid");
    await vi.advanceTimersByTimeAsync(16);
    const first = emit.mock.lastCall![0];
    expect(first.quote).toMatchObject({ last: 101, timestamp: "2026-09-11T12:00:02Z" });
    expect(first.alertFeed?.events).toMatchObject([{ price: 101, sequence: 1 }]);
    emit.mockClear();
    sendQuote(96, "2026-09-11T12:00:00Z");
    sendQuote(95);
    await vi.advanceTimersByTimeAsync(16);
    expect(emit).not.toHaveBeenCalled();
    sendQuote(102, "2026-09-11T12:00:02Z");
    sendQuote(103, "2026-09-11T12:00:03Z");
    await vi.advanceTimersByTimeAsync(16);
    const next = emit.mock.lastCall![0];
    expect(next.quote?.last).toBe(103);
    expect(next.alertFeed?.events).toMatchObject([
      { price: 101, sequence: 1 },
      { price: 102, sequence: 2 },
      { price: 103, sequence: 3 },
    ]);
    expect(next.bars).toBe(first.bars);
    expect(next.revision).toBe(first.revision);
    stop();
  });

  it("accepts undated quotes until a timestamp arrives and clears ordering on stream disconnection", async () => {
    const t = transport(),
      emit = vi.fn<(snapshot: ChartMarketSnapshot) => void>();
    const stop = subscribeChartMarket("NQU6", interval, emit, undefined, t.open);
    const sendQuote = (last: number, timestamp?: string) =>
      t.send(0, { type: "quote", quote: { symbol: "NQU6", last, timestamp } });
    sendQuote(100);
    sendQuote(101);
    await vi.advanceTimersByTimeAsync(16);
    expect(emit.mock.lastCall![0].quote).toEqual({ symbol: "NQU6", last: 101, source: "quote" });
    sendQuote(102, "2026-09-11T12:00:02Z");
    await vi.advanceTimersByTimeAsync(16);
    expect(emit.mock.lastCall![0].quote?.timestamp).toBe("2026-09-11T12:00:02Z");
    t.send(0, { type: "status", state: "disconnected", intervalKey: "minute:5" });
    await vi.advanceTimersByTimeAsync(16);
    expect(emit.mock.lastCall![0].quote).toBeNull();
    sendQuote(103);
    await vi.advanceTimersByTimeAsync(16);
    expect(emit.mock.lastCall![0].quote?.last).toBe(103);
    stop();
  });

  it("does not journal history/warmup quotes or unproven closes; accepts explicit live finality and resets on disconnect", async () => {
    const t = transport(),
      emit = vi.fn<(snapshot: ChartMarketSnapshot) => void>();
    const stop = subscribeChartMarket("NQU6", interval, emit, undefined, t.open);
    const quote = {
      type: "quote",
      quote: { symbol: "NQU6", last: 101, timestamp: "2026-09-11T12:00:00Z" },
    };
    t.send(0, quote);
    t.send(0, { ...batch([bar(100)], true), historical: true, historyComplete: false });
    await vi.advanceTimersByTimeAsync(16);
    expect(emit.mock.lastCall![0].alertFeed).toMatchObject({ ready: false, events: [] });
    t.send(0, { ...batch([]), historical: true, historyComplete: true });
    const close = {
      type: "bar-close",
      symbol: "NQU6",
      intervalKey: "minute:5",
      bar: bar(100, 102),
      closedAt: Date.parse("2026-09-11T12:05:00Z"),
    };
    t.send(0, close);
    t.send(0, { ...close, provenance: "historical", historyComplete: true });
    await vi.advanceTimersByTimeAsync(16);
    expect(emit.mock.lastCall![0].alertFeed?.events).toHaveLength(0);
    t.send(0, { ...close, provenance: "live", historyComplete: true });
    await vi.advanceTimersByTimeAsync(16);
    const before = emit.mock.lastCall![0];
    expect(before.alertFeed?.events[0]).toMatchObject({
      type: "bar-close",
      bar: bar(100, 102),
      timestamp: close.closedAt,
    });
    expect(before.bars).toEqual([bar(100, 102)]);
    t.subscriptions[0]!.events.onError();
    await vi.advanceTimersByTimeAsync(16);
    expect(emit.mock.lastCall![0].alertFeed).toMatchObject({ ready: false, events: [] });
    expect(emit.mock.lastCall![0].alertFeed?.streamId).not.toBe(before.alertFeed?.streamId);
    stop();
  });
  it("bounds the journal while retaining sequence gaps so consumers can fail closed", async () => {
    const t = transport(),
      emit = vi.fn<(snapshot: ChartMarketSnapshot) => void>();
    const stop = subscribeChartMarket("NQU6", interval, emit, undefined, t.open);
    t.send(0, { ...batch([bar(100)], true), historyComplete: true });
    for (let i = 0; i < 2100; i++)
      t.send(0, {
        type: "quote",
        quote: { symbol: "NQU6", last: 100, timestamp: "2026-09-11T12:00:00Z" },
      });
    await vi.advanceTimersByTimeAsync(16);
    expect(emit.mock.lastCall![0].alertFeed?.events).toHaveLength(2048);
    expect(emit.mock.lastCall![0].alertFeed?.events[0]?.sequence).toBe(53);
    stop();
  });

  it("ignores invalid nonempty snapshots without erasing cached or pending bars, but accepts authoritative empty history", async () => {
    const t = transport(),
      emit = vi.fn<(snapshot: ChartMarketSnapshot) => void>();
    const stop = subscribeChartMarket(
      "NQU6",
      interval,
      emit,
      {
        ...emptyChartMarket(),
        bars: [bar(100)],
        revision: 1,
        failure: { kind: "http", status: 502 },
      },
      t.open,
    );
    t.send(0, {
      type: "status",
      state: "connected",
      intervalKey: "minute:5",
      message: "Tradovate connected",
    });
    t.send(0, batch([{ time: "invalid" }, { ...bar(200), high: -1 }], true));
    await vi.advanceTimersByTimeAsync(16);
    expect(emit.mock.lastCall![0]).toMatchObject({
      bars: [bar(100)],
      revision: 1,
      awaitingHistory: true,
      failure: { kind: "http", status: 502 },
    });
    t.send(0, batch([bar(200)]));
    t.send(0, batch([{ time: "invalid" }], true));
    await vi.advanceTimersByTimeAsync(16);
    expect(emit.mock.lastCall![0]).toMatchObject({
      bars: [bar(100), bar(200)],
      updates: [bar(200)],
      revision: 2,
      replace: false,
    });
    t.send(0, batch([], true));
    await vi.advanceTimersByTimeAsync(16);
    expect(emit.mock.lastCall![0]).toMatchObject({
      bars: [],
      updates: [],
      revision: 3,
      replace: true,
      awaitingHistory: false,
      failure: null,
    });
    stop();
  });
  it("retains cached bars and typed failure until fresh history arrives after reconnect", async () => {
    const t = transport(),
      emit = vi.fn<(snapshot: ChartMarketSnapshot) => void>();
    const stop = subscribeChartMarket(
      "NQU6",
      interval,
      emit,
      { ...emptyChartMarket(), bars: [bar(100)], revision: 1, awaitingHistory: false },
      t.open,
    );
    t.subscriptions[0]!.events.onError({ kind: "http", status: 502 });
    await vi.advanceTimersByTimeAsync(16);
    expect(emit.mock.lastCall![0]).toMatchObject({
      bars: [bar(100)],
      failure: { kind: "http", status: 502 },
      awaitingHistory: true,
    });
    await vi.advanceTimersByTimeAsync(5000);
    t.send(1, {
      type: "status",
      state: "connected",
      intervalKey: "minute:5",
      message: "Tradovate connected",
    });
    await vi.advanceTimersByTimeAsync(16);
    expect(emit.mock.lastCall![0]).toMatchObject({
      bars: [bar(100)],
      failure: { kind: "http", status: 502 },
      awaitingHistory: true,
    });
    t.send(1, batch([{ time: "invalid" }]));
    await vi.advanceTimersByTimeAsync(16);
    expect(emit.mock.lastCall![0].awaitingHistory).toBe(true);
    t.send(1, batch([bar(200)], true));
    await vi.advanceTimersByTimeAsync(16);
    expect(emit.mock.lastCall![0]).toMatchObject({
      bars: [bar(200)],
      failure: null,
      awaitingHistory: false,
      status: "Tradovate connected",
    });
    stop();
  });
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
