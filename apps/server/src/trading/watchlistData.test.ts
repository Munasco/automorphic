import { describe, expect, it, vi, afterEach } from "vite-plus/test";
import { createWatchlistResponse, parseWatchlistRoots } from "./watchlistData.ts";

class QuoteSocket extends EventTarget {
  readyState = 1;
  send = vi.fn();
  close = vi.fn(() => {
    this.readyState = 3;
  });
  receive(data: string) {
    this.dispatchEvent(new MessageEvent("message", { data }));
  }
}
const entries = [
  { root: "MGC" as const, name: "MGCZ6", id: 101 },
  { root: "NQ" as const, name: "NQU6", id: 202 },
];
const decode = (value: Uint8Array | undefined) =>
  JSON.parse(new TextDecoder().decode(value).slice(6));

afterEach(() => vi.useRealTimers());
describe("watchlist quote stream", () => {
  it("subscribes on one socket, routes exact contract quotes, and releases subscriptions on cancel", async () => {
    vi.useFakeTimers();
    const socket = new QuoteSocket();
    const factory = vi.fn(() => socket as unknown as WebSocket);
    const reader = createWatchlistResponse(entries, "test-token", factory).body!.getReader();
    expect(decode((await reader.read()).value)).toEqual({ type: "contracts", contracts: entries });
    socket.receive("o");
    expect(socket.send).toHaveBeenCalledWith("authorize\n1\n\ntest-token");
    socket.receive('a[{"i":1,"s":200}]');
    expect(factory).toHaveBeenCalledTimes(1);
    expect(socket.send).toHaveBeenCalledWith('md/subscribeQuote\n10\n\n{"symbol":"MGCZ6"}');
    expect(socket.send).toHaveBeenCalledWith('md/subscribeQuote\n11\n\n{"symbol":"NQU6"}');
    socket.receive(
      "a" +
        JSON.stringify([
          null,
          {
            e: "md",
            d: {
              quotes: [
                { contractId: 999, entries: { Trade: { price: 99 } } },
                {
                  contractId: 202,
                  entries: { Trade: { price: 200 }, OpeningPrice: { price: 190 } },
                },
              ],
            },
          },
        ]),
    );
    expect(decode((await reader.read()).value)).toMatchObject({
      type: "quote",
      root: "NQ",
      quote: { symbol: "NQU6", last: 200, open: 190 },
    });
    await reader.cancel();
    expect(socket.send).toHaveBeenCalledWith('md/unsubscribeQuote\n100\n\n{"symbol":"MGCZ6"}');
    expect(socket.send).toHaveBeenCalledWith('md/unsubscribeQuote\n101\n\n{"symbol":"NQU6"}');
    expect(socket.close).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("closes on rejected authentication without requesting quotes", async () => {
    vi.useFakeTimers();
    const socket = new QuoteSocket();
    const reader = createWatchlistResponse(
      entries,
      "test-token",
      () => socket as unknown as WebSocket,
    ).body!.getReader();
    await reader.read();
    socket.receive('a[{"i":1,"s":401}]');
    expect(await reader.read()).toEqual({ done: true, value: undefined });
    expect(socket.send.mock.calls.some(([value]) => value.startsWith("md/subscribeQuote"))).toBe(
      false,
    );
    expect(vi.getTimerCount()).toBe(0);
  });
  it("deduplicates supported roots and rejects arbitrary subscriptions", () => {
    expect(parseWatchlistRoots("NQ,MGC,NQ,MNQ,GC")).toEqual(["NQ", "MGC", "MNQ", "GC"]);
    for (const value of ["", "ES", "NQU6", "MGC,ES"])
      expect(() => parseWatchlistRoots(value)).toThrow();
  });
});
