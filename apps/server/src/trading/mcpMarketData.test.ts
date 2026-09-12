import { describe, expect, it, vi, afterEach } from "vite-plus/test";
import {
  historyPage,
  historyWindow,
  searchInstruments,
  type HistoryRequest,
} from "./mcpMarketData.ts";
import { calculateRisk } from "../mcp/toolkits/trading/index.ts";
vi.mock("./runtimeEnv.ts", () => ({
  resolveTradingEnvironmentFile: () => "unused",
  synchronizeTradingSession: async () => undefined,
}));
vi.mock("node:fs/promises", () => ({
  readFile: async () => "TRADOVATE_ACCESS_TOKEN=private-token\nTRADOVATE_ENVIRONMENT=demo",
}));
const input: HistoryRequest = {
  symbol: "ESZ6",
  interval: 1,
  unit: "day",
  start: "2020-01-01T00:00:00Z",
  end: "2021-01-01T00:00:00Z",
  limit: 2,
};
const candle = (time: number) => ({ time, open: 1, high: 3, low: 1, close: 2, volume: 10 });
afterEach(() => vi.unstubAllGlobals());
describe("MCP historical data", () => {
  it("pages backwards without overlapping bars and keeps end exclusive", () => {
    const times = [0, 1, 2, 3].map((day) => Date.parse(input.start) / 1000 + day * 86400);
    const first = historyPage(input, [...times.map(candle), candle(Date.parse(input.end) / 1000)]);
    expect(first.bars.map((bar) => bar.time)).toEqual(times.slice(2));
    const second = historyPage({ ...input, cursor: first.nextCursor! }, times.map(candle));
    expect(second.bars.map((bar) => bar.time)).toEqual(times.slice(0, 2));
    expect(second.nextCursor).toBeNull();
  });
  it("binds cursors to symbol, time bounds, interval and page size", () => {
    const page = historyPage(input, [candle(Date.parse(input.start) / 1000 + 86400)]);
    for (const change of [{ symbol: "CLZ6" }, { limit: 1 }, { interval: 2 }, { end: "2022-01-01" }])
      expect(() => historyWindow({ ...input, ...change, cursor: page.nextCursor! })).toThrow(
        "Cursor",
      );
  });
  it("reports missing history without claiming complete coverage", () => {
    const page = historyPage(input, []);
    expect(page.nextCursor).toBeNull();
    expect(page.coverage.firstReturned).toBeNull();
    expect(page.coverage.completeRequestedRange).toBe(false);
  });
  it("rejects excessive page sizes and invalid date ranges", () => {
    expect(() => historyWindow({ ...input, limit: 1001 })).toThrow();
    expect(() => historyWindow({ ...input, start: input.end })).toThrow();
    expect(() => historyWindow({ ...input, start: "bad" })).toThrow();
  });
  it("searches contracts outside the chart allowlist without leaking broker credentials", async () => {
    const fetch = vi.fn(async (_input: string, _init?: RequestInit) =>
      Response.json([{ id: 33, name: "CLZ6" }]),
    );
    vi.stubGlobal("fetch", fetch);
    const result = await searchInstruments("CL");
    expect(result.instruments[0].name).toBe("CLZ6");
    expect(fetch.mock.calls[0]?.[0]).toContain("contract/suggest?t=CL");
    expect(JSON.stringify(result)).not.toContain("private-token");
  });
});
it("sizes long and short plans after costs and rejects inverted stops", () => {
  expect(
    calculateRisk({
      entry: 100,
      stop: 98,
      target: 106,
      direction: "long",
      pointValue: 50,
      riskBudget: 250,
      roundTripCosts: 10,
    }),
  ).toMatchObject({ riskPerContract: 110, rewardPerContract: 290, maxContracts: 2 });
  expect(
    calculateRisk({
      entry: 100,
      stop: 102,
      target: 94,
      direction: "short",
      pointValue: 50,
      riskBudget: 250,
    }),
  ).toMatchObject({ maxContracts: 2 });
  expect(() =>
    calculateRisk({
      entry: 100,
      stop: 102,
      target: 106,
      direction: "long",
      pointValue: 50,
      riskBudget: 250,
    }),
  ).toThrow();
});
