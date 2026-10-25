import { afterEach, describe, expect, it } from "vite-plus/test";
import { QueryClient } from "@tanstack/react-query";
import {
  loadOlderChartHistory,
  olderChartHistoryKey,
  prependedChartViewport,
  shouldPrefetchChartHistory,
  type OlderChartHistory,
} from "./chartHistoryPagination";
const clients: QueryClient[] = [];
afterEach(() => clients.splice(0).forEach((client) => client.clear()));
const bar = (time: number) => ({ time, open: 10, high: 12, low: 8, close: 11, volume: 1 });
const interval = { unit: "minute", value: 5 } as const;
describe("scroll-back chart history", () => {
  it("prefetches multiple viewports before the edge and preserves the same visible candles", () => {
    expect(shouldPrefetchChartHistory({ from: 250, to: 350 })).toBe(true);
    expect(shouldPrefetchChartHistory({ from: 1000, to: 1600 })).toBe(true);
    expect(shouldPrefetchChartHistory({ from: 1500, to: 1600 })).toBe(false);
    expect(
      prependedChartViewport({ from: -20, to: 80 }, 300, [bar(100), bar(200), bar(300)]),
    ).toEqual({ from: -18, to: 82 });
  });
  it("deduplicates in-flight pages, retains cached pages, and isolates timeframes", async () => {
    const client = new QueryClient();
    clients.push(client);
    const key = ["chart", "NQU6", "minute:5"];
    let calls = 0;
    const request: typeof fetch = async () => {
      calls++;
      return Response.json({ symbol: "NQU6", intervalKey: "minute:5", bars: [bar(100), bar(200)] });
    };
    await Promise.all([
      loadOlderChartHistory(client, key, "NQU6", interval, 300, request),
      loadOlderChartHistory(client, key, "NQU6", interval, 300, request),
    ]);
    await loadOlderChartHistory(client, key, "NQU6", interval, 300, request);
    expect(calls).toBe(1);
    expect(
      client.getQueryData<OlderChartHistory>(olderChartHistoryKey(key))?.bars.map((b) => b.time),
    ).toEqual([100, 200]);
    expect(
      client.getQueryData(olderChartHistoryKey(["chart", "NQU6", "minute:1"])),
    ).toBeUndefined();
    await loadOlderChartHistory(client, key, "NQU6", interval, 100, async () =>
      Response.json({ symbol: "NQU6", intervalKey: "minute:5", bars: [] }),
    );
    expect(client.getQueryData<OlderChartHistory>(olderChartHistoryKey(key))?.hasMore).toBe(false);
  });
  it("keeps loaded data on provider errors and rejects a response for the wrong interval", async () => {
    const client = new QueryClient();
    clients.push(client);
    const key = ["chart", "NQU6", "minute:5"];
    client.setQueryData(olderChartHistoryKey(key), { bars: [bar(100)], hasMore: true });
    await expect(
      loadOlderChartHistory(
        client,
        key,
        "NQU6",
        interval,
        100,
        async () => new Response("", { status: 502 }),
      ),
    ).rejects.toThrow("Retry");
    await expect(
      loadOlderChartHistory(client, key, "NQU6", interval, 100, async () =>
        Response.json({ symbol: "NQU6", intervalKey: "minute:1", bars: [bar(50)] }),
      ),
    ).rejects.toThrow("Invalid chart history");
    expect(client.getQueryData<OlderChartHistory>(olderChartHistoryKey(key))?.bars).toEqual([
      bar(100),
    ]);
  });
});

it("advances an empty-page cursor without losing candles and respects the server's terminal flag", async () => {
  const client = new QueryClient();
  clients.push(client);
  const key = ["chart", "@MNQ", "minute:240"];
  const fourHour = { unit: "minute", value: 240 } as const;
  client.setQueryData(olderChartHistoryKey(key), { bars: [bar(500)], hasMore: true });
  await loadOlderChartHistory(client, key, "@MNQ", fourHour, 500, async () =>
    Response.json({
      symbol: "@MNQ",
      intervalKey: "minute:240",
      bars: [],
      hasMore: true,
      nextBefore: 300,
    }),
  );
  expect(client.getQueryData(olderChartHistoryKey(key))).toMatchObject({
    bars: [bar(500)],
    hasMore: true,
    nextBefore: 300,
    emptyPages: 1,
  });
  await loadOlderChartHistory(client, key, "@MNQ", fourHour, 300, async () =>
    Response.json({
      symbol: "@MNQ",
      intervalKey: "minute:240",
      bars: [bar(100)],
      hasMore: false,
      nextBefore: null,
    }),
  );
  expect(client.getQueryData(olderChartHistoryKey(key))).toMatchObject({
    bars: [bar(100), bar(500)],
    hasMore: false,
    nextBefore: null,
    emptyPages: 0,
  });
});
it("rejects non-advancing cursors instead of repeatedly loading the same empty page", async () => {
  const client = new QueryClient();
  clients.push(client);
  await expect(
    loadOlderChartHistory(client, ["chart", "@MNQ"], "@MNQ", interval, 300, async () =>
      Response.json({
        symbol: "@MNQ",
        intervalKey: "minute:5",
        bars: [],
        hasMore: true,
        nextBefore: 300,
      }),
    ),
  ).rejects.toThrow("cursor");
});
