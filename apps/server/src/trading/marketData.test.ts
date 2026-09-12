// @effect-diagnostics nodeBuiltinImport:off - Temporary native env-file fixtures for the WebSocket adapter.
import { describe, it, expect, vi, afterEach } from "vite-plus/test";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { chartStream, normalizeBars, normalizeQuote } from "./marketData.ts";
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
          contractId: 123456,
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
        123456,
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
    expect(normalizeQuote({ contractId: 123456, entries: {} }, "NQU6", 123456)).toBeNull();
    expect(
      normalizeQuote(
        { contractId: 123456, entries: { Trade: { price: 1 }, HighPrice: { price: Infinity } } },
        "NQU6",
        123456,
      )?.high,
    ).toBeUndefined();
  });
});

describe("selected Tradovate contract", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("rejects foreign, absent, and malformed contract IDs instead of relabeling quotes", () => {
    const entries = { Trade: { price: 4000 }, OpeningPrice: { price: 3990 } };
    for (const contractId of [undefined, null, "123456", 987654, NaN]) {
      expect(normalizeQuote({ contractId, entries }, "MGCV6", 123456)).toBeNull();
    }
    expect(normalizeQuote({ contractId: 123456, entries }, "MGCV6", 123456)).toMatchObject({
      symbol: "MGCV6",
      open: 3990,
    });
  });

  it("resolves the exact expiry and emits only its quotes from a mixed websocket batch", async () => {
    const directory = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "automorphic-md-test-"));
    let response: Response | undefined;
    try {
      const envFile = NodePath.join(directory, ".env");
      await NodeFSP.writeFile(
        envFile,
        "TRADOVATE_ACCESS_TOKEN=test-session\nTRADOVATE_ENVIRONMENT=demo\n",
      );
      vi.stubEnv("AUTOMORPHIC_ENV_FILE", envFile);
      const lookup = vi.fn(async (_url: string, _options: RequestInit) =>
        Response.json({ id: 123456, name: "MGCV6" }),
      );
      vi.stubGlobal("fetch", lookup);
      const sockets: FakeSocket[] = [];
      class FakeSocket extends EventTarget {
        static OPEN = 1;
        readyState = 1;
        messages: string[] = [];
        constructor() {
          super();
          sockets.push(this);
        }
        send(data: string) {
          this.messages.push(data);
        }
        close() {
          this.readyState = 3;
        }
        receive(data: string) {
          this.dispatchEvent(new MessageEvent("message", { data }));
        }
      }
      vi.stubGlobal("WebSocket", FakeSocket);
      response = await chartStream("MGCV6", 15);
      expect(lookup.mock.calls[0]?.[0]).toBe(
        "https://demo.tradovateapi.com/v1/contract/find?name=MGCV6",
      );
      const socket = sockets[0]!;
      socket.receive("o");
      socket.receive('a[{"i":1,"s":200}]');
      expect(socket.messages.some((message) => message.startsWith("md/subscribeQuote\n4"))).toBe(
        true,
      );
      socket.receive(
        'a[{"e":"md","d":{"quotes":[{"contractId":987654,"entries":{"Trade":{"price":20000},"OpeningPrice":{"price":19000}}},{"contractId":123456,"entries":{"Trade":{"price":4356.3},"OpeningPrice":{"price":4325.2},"HighPrice":{"price":4410.8},"LowPrice":{"price":4300.1}}}]}}]',
      );
      socket.receive('a[{"i":1,"s":401}]'); // End the stream after the supplied batch.
      const output = await response.text();
      expect(output).toContain('"open":4325.2');
      expect(output).toContain('"high":4410.8');
      expect(output).toContain('"low":4300.1');
      expect(output).not.toContain("19000");
      expect(output.match(/"type":"quote"/g)).toHaveLength(1);
      expect(socket.readyState).toBe(3);
      lookup.mockResolvedValueOnce(Response.json({ id: 987654, name: "MGCZ6" }));
      await expect(chartStream("MGCV6", 15)).rejects.toThrow(
        "did not confirm the selected contract",
      );
      expect(sockets).toHaveLength(1);
    } finally {
      if (response?.body && !response.bodyUsed) await response.body.cancel();
      await NodeFSP.rm(directory, { recursive: true, force: true });
    }
  });
});
