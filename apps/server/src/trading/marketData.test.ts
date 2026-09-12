import { describe, it, expect } from "vite-plus/test";
import { normalizeBars, normalizeQuote } from "./marketData.ts";
import { parseWires } from "./news.ts";
describe("Tradovate candle normalization", () => {
  it("orders and merges history updates and rejects invalid prices", () => {
    const bar = {
      timestamp: "2026-09-11T12:00:00Z",
      open: 10,
      high: 12,
      low: 9,
      close: 11,
      upVolume: 5,
      downVolume: 3,
    };
    const result = normalizeBars([
      { ...bar, timestamp: "2026-09-11T12:05:00Z" },
      bar,
      { ...bar, close: 12 },
      { ...bar, timestamp: "bad" },
      { ...bar, high: 1, low: 2 },
    ]);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ close: 12, volume: 8 });
    expect(result[0]!.time).toBeLessThan(result[1]!.time);
  });
  it("treats empty or malformed chart frames as no updates", () => {
    expect(normalizeBars(null)).toEqual([]);
    expect(normalizeBars([null, {}])).toEqual([]);
  });
});
describe("Live Wires RSS adapter", () => {
  it("extracts source-linked headlines without importing HTML or offsite URLs", () => {
    const item = (link: string, title: string) =>
      `<item><title><![CDATA[${title}]]></title><link>${link}</link><pubDate>Fri, 11 Sep 2026 12:00:00 GMT</pubDate><category>Macro</category></item>`;
    const wires = parseWires(
      `<rss><channel>${item("https://investinglive.com/news/example/", "<b>Fed</b> &amp; rates")}${item("javascript:alert(1)", "unsafe")}</channel></rss>`,
    );
    expect(wires).toHaveLength(1);
    expect(wires[0]).toMatchObject({
      title: "Fed &amp; rates",
      category: "Macro",
      source: "investingLive",
    });
  });
});

describe("Tradovate quote normalization", () => {
  it("preserves reported market values without treating settlement as previous close", () => {
    expect(
      normalizeQuote(
        {
          timestamp: "2026-09-11T21:59:38Z",
          entries: {
            Trade: { price: 4356.3 },
            OpeningPrice: { price: 4325.2 },
            HighPrice: { price: 4410.8 },
            LowPrice: { price: 4300.1 },
            TotalTradeVolume: { size: 37209 },
            SettlementPrice: { price: 4374.8 },
          },
        },
        "MGCV6",
      ),
    ).toEqual({
      symbol: "MGCV6",
      last: 4356.3,
      open: 4325.2,
      high: 4410.8,
      low: 4300.1,
      volume: 37209,
      timestamp: "2026-09-11T21:59:38Z",
      source: "quote",
    });
  });
  it("ignores missing trades and invalid optional fields", () => {
    expect(normalizeQuote({ entries: {} }, "NQU6")).toBeNull();
    expect(
      normalizeQuote({ entries: { Trade: { price: 1 }, HighPrice: { price: Infinity } } }, "NQU6")
        ?.high,
    ).toBeUndefined();
  });
});
