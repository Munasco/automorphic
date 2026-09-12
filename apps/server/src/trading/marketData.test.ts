// @effect-diagnostics nodeBuiltinImport:off - Temporary native env-file fixtures for the WebSocket adapter.
import { describe, it, expect, vi, afterEach } from "vite-plus/test";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { chartStream, contracts, normalizeBars, normalizeQuote } from "./marketData.ts";
import * as ActiveContract from "./activeContract.ts";
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
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("rejects invalid units and unsupported tick counts before opening a connection or reading market data", async () => {
    const fetch = vi.fn(),
      socket = vi.fn();
    vi.stubGlobal("fetch", fetch);
    vi.stubGlobal("WebSocket", socket);
    await expect(chartStream("MNQU6", 2, "tick")).rejects.toThrow("supported tick interval");
    await expect(chartStream("MNQU6", 5, "unknown")).rejects.toThrow("supported chart interval");
    await expect(chartStream("MNQU6", 0.5, "minute")).rejects.toThrow("supported minute interval");
    expect(fetch).not.toHaveBeenCalled();
    expect(socket).not.toHaveBeenCalled();
  });

  it.each(["MGC", "MNQ", "GC", "NQ"])(
    "selects the active %s expiry using only exact-root candidates and their activity IDs",
    async (root) => {
      const directory = await NodeFSP.mkdtemp(
        NodePath.join(NodeOS.tmpdir(), "automorphic-contract-test-"),
      );
      try {
        const envFile = NodePath.join(directory, ".env");
        await NodeFSP.writeFile(
          envFile,
          "TRADOVATE_ACCESS_TOKEN=test-contract-session\nTRADOVATE_ENVIRONMENT=demo\nTRADOVATE_TOKEN_EXPIRATION=2099-01-01T00:00:00.000Z\n",
        );
        vi.stubEnv("AUTOMORPHIC_ENV_FILE", envFile);
        const lookup = vi.fn(async (url: string) => {
          if (url.includes("contract/suggest"))
            return Response.json([
              { id: 11, name: `${root}Z6`, contractMaturityId: 101 },
              { id: 12, name: `${root}H7`, contractMaturityId: 102 },
              { id: 13, name: `${root}Z5`, contractMaturityId: 103 },
              ...["MGC", "MNQ", "GC", "NQ"]
                .filter((other) => other !== root)
                .map((other, index) => ({
                  id: 50 + index,
                  name: `${other}Z6`,
                  contractMaturityId: 150 + index,
                })),
            ]);
          return Response.json([
            { id: 101, expirationDate: "2098-12-01", firstIntentDate: "2098-11-25" },
            { id: 102, expirationDate: "2099-03-01", firstIntentDate: "2099-02-25" },
            { id: 103, expirationDate: "2000-01-01" },
          ]);
        });
        vi.stubGlobal("fetch", lookup);
        const activity = vi.spyOn(ActiveContract, "readContractActivity").mockResolvedValue(
          new Map([
            [11, { volume: 100, openInterest: 1000 }],
            [12, { volume: 500, openInterest: 2000 }],
          ]),
        );
        expect(await contracts(root)).toEqual([{ id: 12, name: `${root}H7` }]);
        expect(lookup.mock.calls[0]?.[0]).toBe(
          `https://demo.tradovateapi.com/v1/contract/suggest?t=${root}&l=12`,
        );
        expect(lookup.mock.calls[1]?.[0]).toBe(
          "https://demo.tradovateapi.com/v1/contractMaturity/items?ids=101,102,103",
        );
        expect(activity.mock.calls[0]?.[0].map(({ id, name }) => ({ id, name }))).toEqual([
          { id: 11, name: `${root}Z6` },
          { id: 12, name: `${root}H7` },
        ]);
      } finally {
        await NodeFSP.rm(directory, { recursive: true, force: true });
      }
    },
  );

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

  it.each([
    ["MGCV6", 15, undefined],
    ["MNQU6", 3, "minute"],
    ["GCZ6", 30, "minute"],
    ["NQU6", 240, "minute"],
    ["NQU6", 1, "day"],
    ["NQU6", 3, "day"],
    ["NQU6", 1, "week"],
    ["GCZ6", 1, "month"],
    ["GCZ6", 12, "month"],
    ["MNQU6", 1, "second"],
    ["MNQU6", 5, "second"],
    ["MNQU6", 10, "second"],
    ["MNQU6", 15, "second"],
    ["MNQU6", 30, "second"],
    ["MNQU6", 45, "second"],
    ["MNQU6", 1, "tick"],
    ["MNQU6", 10, "tick"],
    ["MNQU6", 100, "tick"],
    ["MNQU6", 1000, "tick"],
  ] as const)(
    "resolves %s at %d %s and emits only its quotes and chart subscription from mixed batches",
    async (symbol, interval, intervalUnit) => {
      const directory = await NodeFSP.mkdtemp(
        NodePath.join(NodeOS.tmpdir(), "automorphic-md-test-"),
      );
      let response: Response | undefined;
      try {
        const envFile = NodePath.join(directory, ".env");
        await NodeFSP.writeFile(
          envFile,
          "TRADOVATE_ACCESS_TOKEN=test-session\nTRADOVATE_ENVIRONMENT=demo\nTRADOVATE_TOKEN_EXPIRATION=2099-01-01T00:00:00.000Z\n",
        );
        vi.stubEnv("AUTOMORPHIC_ENV_FILE", envFile);
        const lookup = vi.fn(async (_url: string, _options: RequestInit) =>
          Response.json({ id: 123456, name: symbol }),
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
        response = await chartStream(symbol, interval, intervalUnit);
        expect(lookup.mock.calls[0]?.[0]).toBe(
          `https://demo.tradovateapi.com/v1/contract/find?name=${symbol}`,
        );
        const socket = sockets[0]!;
        socket.receive("o");
        socket.receive('a[{"i":1,"s":200}]');
        expect(socket.messages.some((message) => message.startsWith("md/subscribeQuote\n4"))).toBe(
          true,
        );
        expect(socket.messages).toContain(`md/subscribeQuote\n4\n\n${JSON.stringify({ symbol })}`);
        const chartRequest = socket.messages.find((message) =>
          message.startsWith("md/getChart\n2"),
        )!;
        expect(JSON.parse(chartRequest.split("\n\n")[1]!)).toMatchObject({
          symbol,
          chartDescription: {
            underlyingType:
              intervalUnit === "day" || intervalUnit === "week" || intervalUnit === "month"
                ? "DailyBar"
                : intervalUnit === "second" || intervalUnit === "tick"
                  ? "Tick"
                  : "MinuteBar",
            elementSize: intervalUnit === "week" || intervalUnit === "month" ? 1 : interval,
            elementSizeUnit: intervalUnit === "second" ? "Seconds" : "UnderlyingUnits",
          },
        });
        const bar = {
          timestamp: "2026-09-11T12:00:00Z",
          open: 100,
          high: 102,
          low: 99,
          close: 101,
          upVolume: 7,
          downVolume: 11,
        };
        socket.receive(
          `a${JSON.stringify([{ e: "chart", d: { charts: [{ bars: [{ ...bar, open: 77777 }] }] } }])}`,
        );
        socket.receive('a[{"i":2,"s":200,"d":{"historicalId":31,"realtimeId":32}}]');
        if (intervalUnit === "tick" && interval === 1) {
          const raw = { bt: Date.parse(bar.timestamp), bp: 400, ts: 0.25, td: 20260911 };
          socket.receive(
            `a${JSON.stringify([
              {
                e: "chart",
                d: {
                  charts: [
                    { id: 999, ...raw, tks: [{ id: 9000, t: 0, p: 88888, s: 1 }] },
                    {
                      id: 31,
                      ...raw,
                      tks: Array.from({ length: interval + 1 }, (_, index) => ({
                        id: index + 1,
                        t: 0,
                        p: 0,
                        s: 1,
                      })),
                    },
                    { id: 31, eoh: true },
                    { id: 32, ...raw, tks: [{ id: interval + 2, t: 0, p: 1, s: 1 }] },
                    { id: 32, ...raw, tks: [{ id: interval + 2, t: 0, p: 1, s: 1 }] },
                  ],
                },
              },
            ])}`,
          );
        } else if (intervalUnit === "tick") {
          socket.receive(
            `a${JSON.stringify([
              {
                e: "chart",
                d: {
                  charts: [
                    { id: 999, bars: [{ ...bar, open: 88888 }] },
                    {
                      id: 31,
                      bars: [
                        { ...bar, upTicks: interval, downTicks: 0 },
                        { ...bar, upTicks: 2, downTicks: 0 },
                      ],
                      eoh: true,
                    },
                    { id: 32, bars: [{ ...bar, upTicks: interval, downTicks: 0, upVolume: 8 }] },
                  ],
                },
              },
            ])}`,
          );
        } else {
          socket.receive(
            `a${JSON.stringify([
              {
                e: "chart",
                d: {
                  charts: [
                    { id: 999, bars: [{ ...bar, open: 88888 }] },
                    { id: 31, bars: [bar], eoh: true },
                    { id: 32, bars: [{ ...bar, close: 102 }] },
                  ],
                },
              },
            ])}`,
          );
        }
        socket.receive(
          'a[{"e":"md","d":{"quotes":[{"contractId":987654,"entries":{"Trade":{"price":20000},"OpeningPrice":{"price":19000}}},{"contractId":123456,"entries":{"Trade":{"price":4356.3},"OpeningPrice":{"price":4325.2},"HighPrice":{"price":4410.8},"LowPrice":{"price":4300.1}}}]}}]',
        );
        if (intervalUnit === "tick" && interval === 1)
          socket.receive(
            `a${JSON.stringify([{ e: "chart", d: { charts: [{ id: 32, bt: Date.parse(bar.timestamp), bp: 400, ts: 0.25, td: 20260911, tks: [{ id: 0, t: 0, p: 1, s: 1 }] }] } }])}`,
          );
        if (intervalUnit === "tick" && interval > 1)
          socket.receive(
            `a${JSON.stringify([{ e: "chart", d: { charts: [{ id: 32, bars: [{ ...bar, upTicks: interval, downTicks: 0, upVolume: 8 }] }] } }])}`,
          );
        socket.receive('a[{"i":1,"s":401}]'); // End the stream after the supplied batch.
        const output = await response.text();
        const messages = output
          .split("\n\n")
          .filter(Boolean)
          .map((frame) => JSON.parse(frame.slice(6)));
        expect(messages[0]).toMatchObject({
          state: "connecting",
          interval,
          intervalUnit: intervalUnit ?? "minute",
          intervalKey: `${intervalUnit ?? "minute"}:${interval}`,
        });
        if (intervalUnit !== "tick")
          expect(messages.at(-1)).toMatchObject({
            type: "status",
            state: "disconnected",
            message: "Tradovate rejected market-data authorization.",
            interval,
            intervalUnit: intervalUnit ?? "minute",
            intervalKey: `${intervalUnit ?? "minute"}:${interval}`,
          });
        const barMessages = messages.filter((message) => message.type === "bars");
        expect(barMessages.map((message) => message.bars[0].volume)).toEqual(
          intervalUnit === "tick" ? (interval === 1 ? [1, 1] : [18, 19]) : [18, 18],
        );
        if (intervalUnit === "tick") {
          expect(messages).toContainEqual(
            expect.objectContaining({ type: "status", state: "disconnected", resetRequired: true }),
          );
          expect(barMessages[0]).toMatchObject({
            snapshot: true,
            tickHistory:
              interval === 1
                ? {
                    rawHistoryReceived: 2,
                    historyCoverage: "limited-sampled-vendor-history",
                    historyComplete: false,
                    groupingOrigin: "oldest-loaded-trade",
                  }
                : {
                    source: "native-tick-bars",
                    historyCoverage: "native-vendor-bars",
                    historyBarsReceived: 2,
                    historicalTimestampCollisions: 1,
                  },
          });
          expect(barMessages[0].bars).toHaveLength(2);
          expect(barMessages[0].bars[0].actualTime).toBe(barMessages[0].bars[1].actualTime);
          expect(barMessages[0].bars[0].time).toBeLessThan(barMessages[0].bars[1].time);
          expect(barMessages[0].bars[0].barId).not.toBe(barMessages[0].bars[1].barId);
        }
        expect(output).toContain('"open":4325.2');
        expect(output).toContain('"high":4410.8');
        expect(output).toContain('"low":4300.1');
        expect(output).not.toContain("19000");
        expect(output.match(/"type":"quote"/g)).toHaveLength(1);
        expect(output.match(/"type":"bars"/g)).toHaveLength(2);
        expect(output).not.toContain("88888");
        expect(output).not.toContain("77777");
        expect(output).toContain(`"symbol":"${symbol}"`);
        expect(socket.readyState).toBe(3);
        lookup.mockResolvedValueOnce(Response.json({ id: 987654, name: "MGCZ6" }));
        await expect(chartStream(symbol, interval, intervalUnit)).rejects.toThrow(
          "did not confirm the selected contract",
        );
        expect(sockets).toHaveLength(1);
      } finally {
        if (response?.body && !response.bodyUsed) await response.body.cancel();
        await NodeFSP.rm(directory, { recursive: true, force: true });
      }
    },
  );
});
