import { describe, expect, it, vi } from "vite-plus/test";
import { createOrderEntry } from "./orderEntry.ts";
const order = {
  requestId: "12345678-1234-1234-1234-123456789012",
  accountId: 7,
  environment: "demo",
  symbol: "NQU6",
  side: "Buy",
  type: "Limit",
  quantity: 2,
  price: 21000,
  timeInForce: "Day",
};
function fixture(result: unknown = { orderId: 99 }) {
  const request = vi.fn(
    async (url: string | URL | Request, _init?: RequestInit) =>
      new Response(
        JSON.stringify(
          String(url).endsWith("/account/list") ? [{ id: 7, name: "Demo", active: true }] : result,
        ),
        { status: 200 },
      ),
  );
  const place = createOrderEntry(
    async () => ({ token: "test-only", environment: "demo" }),
    request,
  );
  return { place, request };
}
describe("manual order submission", () => {
  it("uses the verified account name and only sends the prices required by each order type", async () => {
    for (const type of ["Market", "Limit", "Stop", "StopLimit"]) {
      const { place, request } = fixture({ orderId: 99, failureReason: "Success" });
      expect(await place({ ...order, type, stopPrice: 20999 })).toEqual({ orderId: 99 });
      const body = JSON.parse(request.mock.calls[1]![1]!.body as string);
      expect(body).toMatchObject({
        accountId: 7,
        accountSpec: "Demo",
        action: "Buy",
        orderType: type,
        isAutomated: false,
        clOrdId: order.requestId,
      });
      expect(body.price).toBe(type === "Limit" || type === "StopLimit" ? 21000 : undefined);
      expect(body.stopPrice).toBe(type === "Stop" || type === "StopLimit" ? 20999 : undefined);
    }
  });
  it("deduplicates concurrent requests and rejects reused IDs with different details", async () => {
    const { place, request } = fixture();
    await Promise.all([place(order), place(order)]);
    expect(
      request.mock.calls.filter(([url]) => String(url).endsWith("/order/placeOrder")),
    ).toHaveLength(1);
    await expect(place({ ...order, quantity: 3 })).rejects.toThrow("details changed");
  });
  it("refuses foreign accounts, switched environments, malformed symbols and fractional quantities", async () => {
    const { place, request } = fixture();
    for (const bad of [
      { accountId: 8 },
      { environment: "live" },
      { symbol: "NQ/../" },
      { quantity: 1.2 },
      { price: NaN },
      { requestId: "short" },
      { type: "StopLimit", stopPrice: 22000 },
    ])
      await expect(place({ ...order, ...bad })).rejects.toThrow();
    expect(
      request.mock.calls.filter(([url]) => String(url).endsWith("/order/placeOrder")),
    ).toHaveLength(0);
  });
  it("never automatically resends an uncertain broker submission", async () => {
    const { place, request } = fixture();
    request.mockImplementation(async (url) => {
      if (String(url).endsWith("/account/list"))
        return new Response(JSON.stringify([{ id: 7, name: "Demo" }]));
      throw Error("Network interrupted");
    });
    await expect(place(order)).rejects.toThrow("status is unknown");
    await expect(place(order)).rejects.toThrow("status is unknown");
    expect(
      request.mock.calls.filter(([url]) => String(url).endsWith("/order/placeOrder")),
    ).toHaveLength(1);
  });
  it("reports broker rejections without claiming the order was submitted", async () => {
    const { place } = fixture({
      failureReason: "RiskRejected",
      failureText: "Account risk limit exceeded",
    });
    await expect(place(order)).rejects.toThrow("Account risk limit exceeded");
  });
});
