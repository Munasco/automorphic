import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { calculateTechnicalRatings } from "./technicalRatings";
import { chartTechnicalsMarketState } from "./chartTechnicalsMarket";
import { chartMarketQueryOptions, emptyChartMarket } from "./chartMarketQuery";
import { cancelInactiveTradingStream } from "./tradingStreamIterable";
import type { openTradingStream } from "./tradingTransport";

const bar = { time: 100, open: 100, high: 110, low: 90, close: 105, volume: 10 };

describe("technicals market availability", () => {
  it.each([
    [502, "Broker market data is temporarily unavailable (HTTP 502). Retrying the connection…"],
    [503, "Broker market data is temporarily unavailable (HTTP 503). Retrying the connection…"],
    [401, "Market-data authentication is required (HTTP 401). Check the trading connection."],
    [403, "Market-data access was denied (HTTP 403). Check trading permissions."],
  ])(
    "classifies HTTP %i without substituting authentication advice for an outage",
    (status, message) => {
      const state = chartTechnicalsMarketState(
        { ...emptyChartMarket(), failure: { kind: "http", status: Number(status) } },
        null,
      );
      expect(state).toMatchObject({ error: message, loading: false, stale: false, candles: [] });
    },
  );
  it("keeps valid same-key ratings explicitly stale through failure and refreshing", () => {
    const candles = Array.from({ length: 260 }, (_, index) => ({
      ...bar,
      time: 100 + index * 60,
      open: 100 + index,
      high: 110 + index,
      low: 90 + index,
      close: 105 + index,
    }));
    const loaded = {
      ...emptyChartMarket(),
      bars: candles,
      revision: 1,
      status: "Tradovate connected",
      awaitingHistory: false,
    };
    const original = calculateTechnicalRatings(candles);
    const outage = chartTechnicalsMarketState(
      { ...loaded, failure: { kind: "http", status: 502 }, awaitingHistory: true },
      null,
    );
    expect(outage.stale).toBe(true);
    expect(calculateTechnicalRatings(outage.candles)).toEqual(original);
    const refreshing = chartTechnicalsMarketState({ ...loaded, awaitingHistory: true }, null);
    expect(refreshing).toMatchObject({ stale: true, loading: true, error: null });
    expect(chartTechnicalsMarketState(loaded, null).stale).toBe(false);
    expect(chartTechnicalsMarketState(undefined, null)).toMatchObject({
      candles: [],
      stale: false,
    });
  });
  it("distinguishes pending history, empty history, usable bars and provider failures", () => {
    expect(chartTechnicalsMarketState(undefined, null)).toMatchObject({
      loading: true,
      error: null,
      candles: [],
    });
    const connected = { ...emptyChartMarket(), status: "Tradovate connected" };
    expect(chartTechnicalsMarketState(connected, null).loading).toBe(true);
    expect(
      chartTechnicalsMarketState({ ...connected, revision: 1, awaitingHistory: false }, null),
    ).toMatchObject({
      loading: false,
      candles: [],
      error: null,
    });
    const loaded = { ...connected, bars: [bar], revision: 1, awaitingHistory: false };
    expect(chartTechnicalsMarketState(loaded, null)).toMatchObject({
      candles: [bar],
      loading: false,
      error: null,
    });
    expect(
      chartTechnicalsMarketState({ ...loaded, status: "Reconnecting to Tradovate…" }, null),
    ).toMatchObject({ candles: [bar], loading: false, error: "Reconnecting to Tradovate…" });
    expect(
      chartTechnicalsMarketState(
        { ...connected, status: "No chart data arrived. Check Tradovate market-data permissions." },
        null,
      ),
    ).toMatchObject({
      loading: false,
      error: "No chart data arrived. Check Tradovate market-data permissions.",
    });
    expect(chartTechnicalsMarketState(undefined, new Error("Request failed"))).toMatchObject({
      loading: false,
      error: "Request failed",
    });
  });
});

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
describe("technicals shared timeframe queries", () => {
  it("shares matching chart history then isolates a new timeframe and contract without changing the chart", async () => {
    const subscriptions: Array<{
      url: string;
      events: Parameters<typeof openTradingStream>[1];
      close: ReturnType<typeof vi.fn>;
    }> = [];
    const open: typeof openTradingStream = (url, events) => {
      const close = vi.fn();
      subscriptions.push({ url, events, close });
      return { close };
    };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const scope = ["trading", "env"];
    const chartOptions = chartMarketQueryOptions(
      scope,
      "workspace",
      "NQU6",
      { unit: "minute", value: 5 },
      open,
    );
    const chart = new QueryObserver(client, chartOptions);
    const stopChart = chart.subscribe(() => {});
    const technicals = new QueryObserver(client, chartOptions);
    const stopTechnicals = technicals.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(0);
    expect(subscriptions).toHaveLength(1);
    subscriptions[0]!.events.onMessage(
      JSON.stringify({
        type: "bars",
        symbol: "NQU6",
        intervalKey: "minute:5",
        bars: [bar],
        snapshot: true,
      }),
    );
    await vi.advanceTimersByTimeAsync(16);
    expect(technicals.getCurrentResult().data?.bars).toEqual([bar]);
    const dailyOptions = chartMarketQueryOptions(
      scope,
      "workspace",
      "NQU6",
      { unit: "day", value: 1 },
      open,
    );
    technicals.setOptions(dailyOptions);
    await vi.advanceTimersByTimeAsync(0);
    expect(subscriptions).toHaveLength(2);
    expect(subscriptions[1]!.url).toContain("intervalUnit=day");
    expect(technicals.getCurrentResult().data?.bars ?? []).toEqual([]);
    expect(chart.getCurrentResult().data?.bars).toEqual([bar]);
    expect(subscriptions[0]!.close).not.toHaveBeenCalled();
    subscriptions[1]!.events.onMessage(
      JSON.stringify({
        type: "bars",
        symbol: "NQU6",
        intervalKey: "day:1",
        bars: [{ ...bar, close: 106 }],
        snapshot: true,
      }),
    );
    await vi.advanceTimersByTimeAsync(16);
    expect(technicals.getCurrentResult().data?.bars[0]?.close).toBe(106);
    technicals.setOptions(
      chartMarketQueryOptions(scope, "workspace", "MGCZ6", { unit: "day", value: 1 }, open),
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(technicals.getCurrentResult().data?.bars ?? []).toEqual([]);
    expect(subscriptions[1]!.close).toHaveBeenCalledOnce();
    expect(subscriptions[2]!.url).toContain("symbol=MGCZ6");
    subscriptions[2]!.events.onError({ kind: "http", status: 503 });
    await vi.advanceTimersByTimeAsync(16);
    const foreignFailure = chartTechnicalsMarketState(technicals.getCurrentResult().data, null);
    expect(foreignFailure).toMatchObject({ candles: [], stale: false, loading: false });
    expect(foreignFailure.error).toContain("HTTP 503");
    // Disabling another observer of the chart cannot terminate its still-active stream.
    await cancelInactiveTradingStream(client, chartOptions.queryKey);
    expect(subscriptions[0]!.close).not.toHaveBeenCalled();
    stopTechnicals();
    await vi.advanceTimersByTimeAsync(0);
    expect(subscriptions[2]!.close).toHaveBeenCalled();
    expect(chart.getCurrentResult().data?.bars).toEqual([bar]);
    stopChart();
    await vi.advanceTimersByTimeAsync(0);
    expect(subscriptions[0]!.close).toHaveBeenCalledOnce();
    client.clear();
  });
});
