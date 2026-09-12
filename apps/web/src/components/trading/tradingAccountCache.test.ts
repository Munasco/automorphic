import { describe, expect, it, vi } from "vite-plus/test";
import { ACCOUNT_POLL_MS, createTradingAccountCache } from "./tradingAccountCache";

const snapshot = (accountId: number | null = 1) => ({
  accounts: accountId === null ? [] : [{ id: accountId, name: `Account ${accountId}` }],
  accountId,
  environment: "demo",
  positions: [],
  orders: [],
  history: [],
  fetchedAt: "2026-09-12T02:00:00.000Z",
  historyScope: "available-session-fills",
});
const json = (value: unknown) => new Response(JSON.stringify(value));
const signal = () => new AbortController().signal;

describe("broker account cache", () => {
  it("reuses fresh snapshots, aliases the selected account, and refreshes expired data", async () => {
    let now = 1000;
    const request = vi.fn<typeof fetch>().mockImplementation(async () => json(snapshot()));
    const cache = createTradingAccountCache(request, () => now);
    const first = await cache.load(null, signal());
    expect(await cache.load(1, signal())).toBe(first);
    expect(request).toHaveBeenCalledTimes(1);
    now += ACCOUNT_POLL_MS;
    await cache.load(1, signal());
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1]?.[0]).toBe("/api/trading/account?accountId=1");
  });
  it("forces refresh on request and keeps account snapshots separate", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json(snapshot(1)))
      .mockResolvedValueOnce(json(snapshot(2)))
      .mockResolvedValueOnce(json(snapshot(1)));
    const cache = createTradingAccountCache(request);
    await cache.load(1, signal());
    await cache.load(2, signal());
    await cache.load(1, signal(), true);
    expect(cache.peek(1)?.accountId).toBe(1);
    expect(cache.peek(2)?.accountId).toBe(2);
    expect(request).toHaveBeenCalledTimes(3);
    expect(
      request.mock.calls.every(
        ([, options]) => options?.method === undefined && options?.body === undefined,
      ),
    ).toBe(true);
  });
  it("accepts a connected demo response with no accounts without inventing rows", async () => {
    const cache = createTradingAccountCache(
      vi.fn<typeof fetch>().mockResolvedValue(json(snapshot(null))),
    );
    const data = await cache.load(null, signal());
    expect(data).toMatchObject({
      accounts: [],
      accountId: null,
      environment: "demo",
      positions: [],
      orders: [],
      history: [],
    });
  });
  it("retains the last snapshot after a failed refresh and returns the server error", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json(snapshot()))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "Session expired" }), { status: 401 }),
      );
    const cache = createTradingAccountCache(request);
    await cache.load(1, signal());
    await expect(cache.load(1, signal(), true)).rejects.toThrow("Session expired");
    expect(cache.peek(1)?.accountId).toBe(1);
  });
  it("does not cache a late response after the dock closes or switches account", async () => {
    let finish!: (value: Response) => void;
    const response = new Promise<Response>((resolve) => {
      finish = resolve;
    });
    const cache = createTradingAccountCache(vi.fn<typeof fetch>().mockReturnValue(response));
    const controller = new AbortController();
    const pending = cache.load(1, controller.signal);
    controller.abort();
    finish(json(snapshot()));
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(cache.peek(1)).toBeNull();
  });
  it("rejects malformed and mismatched account responses", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ ...snapshot(), positions: [{ id: "invalid" }] }))
      .mockResolvedValueOnce(json(snapshot(2)));
    const cache = createTradingAccountCache(request);
    await expect(cache.load(1, signal())).rejects.toThrow("unreadable");
    await expect(cache.load(1, signal())).rejects.toThrow("different account");
    expect(cache.peek(1)).toBeNull();
  });
});
