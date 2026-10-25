import { describe, expect, it, vi } from "vite-plus/test";
import { loadMarketContracts, type ContractResult } from "./contractLoader";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("independent market loading", () => {
  it("publishes successful markets while another is pending, and retries only the requested market", async () => {
    const slow = deferred<Response>();
    const delivered = deferred<void>();
    const results: ContractResult[] = [];
    const request = vi.fn<typeof fetch>(async (url) =>
      String(url).endsWith("MNQ") ? slow.promise : Response.json([{ id: 1, name: "MGCZ6" }]),
    );
    const all = loadMarketContracts(
      ["MNQ", "MGC"],
      new AbortController().signal,
      request,
      (result) => {
        results.push(result);
        if (result.root === "MGC") delivered.resolve();
      },
    );
    await delivered.promise;
    expect(results).toEqual([{ root: "MGC", contracts: [{ root: "MGC", id: 1, name: "MGCZ6" }] }]);
    slow.resolve(new Response(null, { status: 502 }));
    await all;
    expect(results[1]).toMatchObject({ root: "MNQ", error: expect.any(String) });
    request.mockClear();
    request.mockResolvedValue(Response.json([{ id: 2, name: "MNQU6" }]));
    await loadMarketContracts(["MNQ"], new AbortController().signal, request, (result) =>
      results.push(result),
    );
    expect(request).toHaveBeenCalledTimes(1);
    expect(results[2]).toMatchObject({ root: "MNQ", contracts: [{ name: "MNQU6" }] });
  });
  it("ignores results from an aborted workspace and rejects foreign or invalid contracts", async () => {
    const pending = deferred<Response>();
    const abort = new AbortController();
    const publish = vi.fn();
    const run = loadMarketContracts(["NQ"], abort.signal, () => pending.promise, publish);
    abort.abort();
    pending.resolve(Response.json([{ id: 2, name: "NQU6" }]));
    await run;
    expect(publish).not.toHaveBeenCalled();
    await loadMarketContracts(
      ["MGC"],
      new AbortController().signal,
      async () =>
        Response.json([
          { id: 2, name: "NQU6" },
          { id: -1, name: "MGCZ6" },
        ]),
      publish,
    );
    expect(publish).toHaveBeenCalledWith({ root: "MGC", error: expect.any(String) });
  });
});
