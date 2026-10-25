// @effect-diagnostics nodeBuiltinImport:off - Isolated temporary receipt directories; never the running environment's state.
import { afterEach, expect, it, vi } from "vite-plus/test";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { createOrderReceiptLedger } from "./orderReceiptLedger.ts";
import { createOrderEntry } from "./orderEntry.ts";
const paths: string[] = [];
afterEach(async () => {
  await Promise.all(
    paths.splice(0).map((path) => NodeFSP.rm(path, { recursive: true, force: true })),
  );
});
const order = {
  requestId: "12345678-1234-1234-1234-123456789012",
  accountId: 7,
  environment: "demo",
  symbol: "NQU6",
  side: "Buy",
  type: "Market",
  quantity: 1,
  timeInForce: "Day",
};
const session = async () => ({ token: "test-only", environment: "demo" });
async function directory() {
  const path = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "automorphic-order-ledger-"));
  paths.push(path);
  return path;
}
it("returns confirmed receipts across adapter restarts without resubmission", async () => {
  const path = await directory();
  const request = vi.fn(
    async (url: string) =>
      new Response(
        JSON.stringify(
          url.endsWith("/account/list") ? [{ id: 7, name: "Demo" }] : { orderId: 321 },
        ),
      ),
  );
  expect(await createOrderEntry(session, request, createOrderReceiptLedger(path))(order)).toEqual({
    orderId: 321,
  });
  expect(await createOrderEntry(session, request, createOrderReceiptLedger(path))(order)).toEqual({
    orderId: 321,
  });
  expect(request.mock.calls.filter(([url]) => url.endsWith("/order/placeOrder"))).toHaveLength(1);
  await expect(
    createOrderEntry(session, request, createOrderReceiptLedger(path))({ ...order, quantity: 2 }),
  ).rejects.toThrow("details changed");
});
it("an uncertain receipt remains blocked across restarts", async () => {
  const path = await directory();
  const request = vi.fn(async (url: string) => {
    if (url.endsWith("/account/list"))
      return new Response(JSON.stringify([{ id: 7, name: "Demo" }]));
    throw Error("connection lost after submit");
  });
  await expect(
    createOrderEntry(session, request, createOrderReceiptLedger(path))(order),
  ).rejects.toThrow("unknown");
  await expect(
    createOrderEntry(session, request, createOrderReceiptLedger(path))(order),
  ).rejects.toThrow("unknown");
  expect(request.mock.calls.filter(([url]) => url.endsWith("/order/placeOrder"))).toHaveLength(1);
});
it("exclusive claims prevent separate adapters racing the same order", async () => {
  const path = await directory();
  const request = vi.fn(
    async (url: string) =>
      new Response(
        JSON.stringify(
          url.endsWith("/account/list") ? [{ id: 7, name: "Demo" }] : { orderId: 321 },
        ),
      ),
  );
  const results = await Promise.allSettled([
    createOrderEntry(session, request, createOrderReceiptLedger(path))(order),
    createOrderEntry(session, request, createOrderReceiptLedger(path))(order),
  ]);
  expect(results.some((r) => r.status === "fulfilled")).toBe(true);
  expect(request.mock.calls.filter(([url]) => url.endsWith("/order/placeOrder"))).toHaveLength(1);
});
