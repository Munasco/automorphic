import { describe, expect, it, vi } from "vite-plus/test";
import { QueryClient } from "@tanstack/react-query";
import { ACCOUNT_POLL_MS, fetchTradingAccount } from "./tradingAccountCache";
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
const json = (value: unknown) => Response.json(value);
const signal = () => new AbortController().signal;
describe("broker account queries", () => {
  it("deduplicates reads, separates accounts, and retains data when refresh fails", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    });
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json(snapshot(1)))
      .mockResolvedValueOnce(json(snapshot(2)))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "Session expired" }), { status: 401 }),
      );
    const options = (id: number) => ({
      queryKey: ["trading", "test-environment", "account", id],
      queryFn: ({ signal }: { signal: AbortSignal }) => fetchTradingAccount(id, signal, request),
      staleTime: ACCOUNT_POLL_MS,
    });
    try {
      const [first, duplicate] = await Promise.all([
        client.fetchQuery(options(1)),
        client.fetchQuery(options(1)),
      ]);
      expect(first).toBe(duplicate);
      expect(request).toHaveBeenCalledTimes(1);
      await client.fetchQuery(options(2));
      await client.invalidateQueries({ queryKey: options(1).queryKey, refetchType: "none" });
      await expect(client.fetchQuery(options(1))).rejects.toThrow("Session expired");
      expect(client.getQueryData(options(1).queryKey)).toMatchObject({ accountId: 1 });
      expect(client.getQueryData(options(2).queryKey)).toMatchObject({ accountId: 2 });
    } finally {
      client.clear();
    }
  });
  it("accepts a connected account with no trades without inventing rows", async () => {
    expect(
      await fetchTradingAccount(null, signal(), async () => json(snapshot(null))),
    ).toMatchObject({ accounts: [], accountId: null, positions: [], orders: [], history: [] });
  });
  it("rejects late responses after cancellation", async () => {
    const abort = new AbortController();
    const request: typeof fetch = async () => {
      abort.abort();
      return json(snapshot());
    };
    await expect(fetchTradingAccount(1, abort.signal, request)).rejects.toMatchObject({
      name: "AbortError",
    });
  });
  it("rejects malformed and mismatched accounts", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ ...snapshot(), positions: [{ id: "invalid" }] }))
      .mockResolvedValueOnce(json(snapshot(2)));
    await expect(fetchTradingAccount(1, signal(), request)).rejects.toThrow("unreadable");
    await expect(fetchTradingAccount(1, signal(), request)).rejects.toThrow("different account");
  });
});
