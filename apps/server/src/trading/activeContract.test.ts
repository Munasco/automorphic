import { describe, it, expect, vi, afterEach } from "vite-plus/test";
import { activeCandidates, mostActiveContract, readContractActivity } from "./activeContract.ts";

const gold = [
  {
    id: 1,
    name: "MGCV6",
    expirationDate: "2026-10-28T17:30Z",
    firstIntentDate: "2026-09-30T00:00Z",
  },
  {
    id: 2,
    name: "MGCZ6",
    expirationDate: "2026-12-29T18:30Z",
    firstIntentDate: "2026-11-30T00:00Z",
  },
  {
    id: 3,
    name: "MGCG7",
    expirationDate: "2027-02-24T18:30Z",
    firstIntentDate: "2027-01-29T00:00Z",
  },
];
describe("active futures contract", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("uses the liquid December gold contract instead of the nearest October maturity", () => {
    const candidates = activeCandidates(gold.toReversed(), Date.parse("2026-09-12T00:00Z"));
    expect(
      mostActiveContract(
        candidates,
        new Map([
          [1, { volume: 37209, openInterest: 18805 }],
          [2, { volume: 362522, openInterest: 65815 }],
          [3, { volume: 2409, openInterest: 2539 }],
        ]),
      ),
    ).toEqual({ id: 2, name: "MGCZ6" });
  });
  it("excludes expired and delivery-month contracts, including at the year boundary", () => {
    expect(activeCandidates(gold, Date.parse("2026-11-30T00:00Z")).map((c) => c.name)).toEqual([
      "MGCG7",
    ]);
    expect(
      activeCandidates(
        [{ id: 4, name: "MNQU6", expirationDate: "2026-09-18T13:30Z" }],
        Date.parse("2026-09-18T13:30Z"),
      ),
    ).toEqual([]);
  });
  it("uses open interest when session volume resets and refuses incomplete activity", () => {
    expect(
      mostActiveContract(
        gold.slice(0, 2),
        new Map([
          [1, { volume: 0, openInterest: 10 }],
          [2, { volume: 0, openInterest: 500 }],
        ]),
      ).name,
    ).toBe("MGCZ6");
    expect(() =>
      mostActiveContract(gold, new Map([[1, { volume: 500, openInterest: 1 }]])),
    ).toThrow("confirm");
    expect(() =>
      mostActiveContract(gold.slice(0, 1), new Map([[1, { volume: 0, openInterest: 0 }]])),
    ).toThrow("No trading activity");
  });
  it("reads exact contract IDs across batches and releases subscriptions on completion", async () => {
    const sockets: FakeSocket[] = [];
    class FakeSocket extends EventTarget {
      sent: string[] = [];
      closed = false;
      constructor() {
        super();
        sockets.push(this);
      }
      send(message: string) {
        this.sent.push(message);
      }
      close() {
        this.closed = true;
      }
      receive(value: string) {
        this.dispatchEvent(new MessageEvent("message", { data: value }));
      }
    }
    vi.stubGlobal("WebSocket", FakeSocket);
    const result = readContractActivity(gold.slice(0, 2), "test-token");
    const socket = sockets[0]!;
    socket.receive("o");
    socket.receive('a[{"i":1,"s":200}]');
    expect(socket.sent.filter((m) => m.startsWith("md/subscribeQuote"))).toHaveLength(2);
    socket.receive(
      'a[{"d":{"quotes":[{"contractId":999,"entries":{"TotalTradeVolume":{"size":9999}}},{"contractId":1,"entries":{"TotalTradeVolume":{"size":10}}}]}}]',
    );
    expect(socket.closed).toBe(false);
    socket.receive(
      'a[{"d":{"quotes":[{"contractId":2,"entries":{"TotalTradeVolume":{"size":200},"OpenInterest":{"size":100}}}]}}]',
    );
    expect(mostActiveContract(gold.slice(0, 2), await result).name).toBe("MGCZ6");
    expect(socket.closed).toBe(true);
  });
  it("fails on denied market data without substituting a different contract", async () => {
    const sockets: EventTarget[] = [];
    class DeniedSocket extends EventTarget {
      constructor() {
        super();
        sockets.push(this);
      }
      send() {}
      close() {}
    }
    vi.stubGlobal("WebSocket", DeniedSocket);
    const result = readContractActivity(gold, "test-token");
    sockets[0]!.dispatchEvent(new MessageEvent("message", { data: 'a[{"i":1,"s":401}]' }));
    await expect(result).rejects.toThrow("Could not read contract activity");
  });
});
