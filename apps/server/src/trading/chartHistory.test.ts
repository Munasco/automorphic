import { describe, expect, it, vi } from "vite-plus/test";
import { readChartHistory } from "./chartHistory.ts";
import { historyPage } from "./mcpMarketData.ts";
const bar = (time: number) => ({ time, open: 10, high: 12, low: 8, close: 11, volume: 1 });
describe("chart history endpoint", () => {
  const base = Date.parse("2026-01-01T00:00:00Z") / 1000;
  it("requests the selected timeframe before the oldest candle, with a bounded page", async () => {
    const load = vi.fn(async (input: Parameters<typeof historyPage>[0]) =>
      historyPage(input, [bar(base + 100), bar(base + 200), bar(base + 300)]),
    );
    const result = await readChartHistory(
      new URLSearchParams({
        symbol: "NQU6",
        before: String(base + 300),
        interval: "5",
        intervalUnit: "minute",
      }),
      load,
    );
    expect(load).toHaveBeenCalledWith(
      expect.objectContaining({
        symbol: "NQU6",
        interval: 5,
        unit: "minute",
        end: "2026-01-01T00:05:00.000Z",
        limit: 1000,
      }),
    );
    expect(result.bars.map((b) => b.time)).toEqual([base + 100, base + 200]);
    expect(result.intervalKey).toBe("minute:5");
  });
  it("aggregates daily history into calendar weeks using the live feed convention", async () => {
    const monday = Date.parse("2026-09-07T00:00:00Z") / 1000;
    const load = vi.fn(async (input: Parameters<typeof historyPage>[0]) =>
      historyPage(input, [bar(monday), bar(monday + 86400)]),
    );
    const result = await readChartHistory(
      new URLSearchParams({
        symbol: "NQU6",
        before: String(monday + 7 * 86400),
        interval: "1",
        intervalUnit: "week",
      }),
      load,
    );
    expect(load).toHaveBeenCalledWith(expect.objectContaining({ unit: "day", interval: 1 }));
    expect(result.bars).toEqual([{ ...bar(monday), volume: 2 }]);
  });
  it("rejects invalid cursors and unsupported tick paging before contacting the broker", async () => {
    const load = vi.fn();
    for (const params of [
      "symbol=NQU6&interval=5&before=bad",
      "symbol=NQU6&interval=10&intervalUnit=tick&before=300",
    ])
      await expect(readChartHistory(new URLSearchParams(params), load)).rejects.toThrow();
    expect(load).not.toHaveBeenCalled();
  });
});

describe("bounded broker history windows", () => {
  const before = Date.parse("2026-01-01T00:00:00Z") / 1000;
  const params = (time: number) =>
    new URLSearchParams({
      symbol: "@MNQ",
      interval: "240",
      intervalUnit: "minute",
      before: String(time),
    });
  it("continues backward through an empty month to older observed candles", async () => {
    const load = vi.fn(async (input: Parameters<typeof historyPage>[0]) =>
      historyPage(input, input.end.startsWith("2026-01-01") ? [] : [bar(before - 35 * 86400)]),
    );
    const empty = await readChartHistory(params(before), load);
    expect(empty).toMatchObject({ bars: [], hasMore: true, nextBefore: before - 28 * 86400 });
    expect(load.mock.calls[0]?.[0].start).toBe("2025-12-04T00:00:00.000Z");
    const older = await readChartHistory(params(empty.nextBefore!), load);
    expect(older.bars.map((b) => b.time)).toEqual([before - 35 * 86400]);
    expect(older.nextBefore).toBe(before - 35 * 86400);
  });
  it("retains short nonempty pages and stops at the supported history boundary", async () => {
    const load = vi.fn(async (input: Parameters<typeof historyPage>[0]) =>
      historyPage(input, [bar(before - 86400)]),
    );
    const page = await readChartHistory(params(before), load);
    expect(page).toMatchObject({ hasMore: true, nextBefore: before - 86400 });
    const end = await readChartHistory(params(Date.parse("2017-01-01T00:00:00Z") / 1000), load);
    expect(end).toMatchObject({ bars: [], hasMore: false, nextBefore: null });
    expect(load).toHaveBeenCalledTimes(1);
  });
});
