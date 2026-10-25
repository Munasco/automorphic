import { describe, expect, it } from "vite-plus/test";
import { chartLastTrade } from "./chartLastTrade";
import type { Candle } from "./chartIndicators";
import type { MarketQuote } from "./InstrumentHeader";
const bar: Candle = { time: 100, open: 100, high: 102, low: 99, close: 101, volume: 20 };
const quote: MarketQuote = {
  symbol: "NQU6",
  last: 104,
  timestamp: new Date(101000).toISOString(),
  source: "quote",
};
describe("chart last trade", () => {
  it("shows a fresh trade before candle delivery without rewriting OHLC", () => {
    const original = { ...bar };
    expect(chartLastTrade(quote, bar, "NQU6")).toBe(104);
    expect(bar).toEqual(original);
  });
  it("falls back when a newer candle supersedes the quote", () => {
    expect(chartLastTrade(quote, { ...bar, time: 102 }, "NQU6")).toBeNull();
  });
  it("uses actual tick timestamps rather than synthetic chart keys", () => {
    expect(
      chartLastTrade(quote, { ...bar, time: 9000, actualTime: 100, actualEndTime: 102 }, "NQU6"),
    ).toBeNull();
    expect(
      chartLastTrade(quote, { ...bar, time: 9000, actualTime: 100, actualEndTime: 101 }, "NQU6"),
    ).toBe(104);
  });
  it("rejects other contracts, unproven time, non-trade quotes and invalid prices", () => {
    for (const patch of [
      { symbol: "MGCZ6" },
      { timestamp: "invalid" },
      { source: "bar" as const },
      { last: NaN },
    ])
      expect(chartLastTrade({ ...quote, ...patch }, bar, "NQU6")).toBeNull();
    const undated = { ...quote };
    delete undated.timestamp;
    expect(chartLastTrade(undated, bar, "NQU6")).toBeNull();
    expect(chartLastTrade(null, bar, "NQU6")).toBeNull();
    expect(chartLastTrade(quote, undefined, "NQU6")).toBeNull();
  });
});
