import { describe, expect, it, vi } from "vite-plus/test";
import { chartOrderType, submitChartOrder } from "./chartOrderEntry";
import { tradingOrderValidation, type TradingOrderRequest } from "@t3tools/contracts";
const order: TradingOrderRequest = {
  requestId: "12345678-1234-1234-1234-123456789012",
  accountId: 1,
  environment: "demo",
  symbol: "NQU6",
  side: "Buy",
  type: "Limit",
  quantity: 1,
  price: 100,
  timeInForce: "Day",
};
describe("chart order entry", () => {
  it("selects a limit toward price improvement and a stop beyond the market", () => {
    expect(chartOrderType("Buy", 90, 100)).toBe("Limit");
    expect(chartOrderType("Buy", 110, 100)).toBe("Stop");
    expect(chartOrderType("Sell", 110, 100)).toBe("Limit");
    expect(chartOrderType("Sell", 90, 100)).toBe("Stop");
    expect(chartOrderType("Buy", 100, 100)).toBe("Limit");
  });
  it("validates stop-limit direction for both sides and accepts negative futures prices", () => {
    expect(
      tradingOrderValidation({ ...order, type: "StopLimit", price: 100, stopPrice: 101 }),
    ).toMatch(/direction/);
    expect(
      tradingOrderValidation({
        ...order,
        type: "StopLimit",
        side: "Sell",
        price: 102,
        stopPrice: 101,
      }),
    ).toMatch(/direction/);
    expect(tradingOrderValidation({ ...order, price: -1 })).toBeNull();
  });
  it("posts once and returns the confirmed broker receipt", async () => {
    const request = vi.fn(
      async (_url: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ orderId: 23 })),
    );
    expect(await submitChartOrder(order, request)).toEqual({ orderId: 23 });
    expect(request).toHaveBeenCalledTimes(1);
    expect(JSON.parse(request.mock.calls[0]![1]!.body as string)).toEqual(order);
  });
  it("does not retry transport failures or treat malformed success as confirmation", async () => {
    const request = vi.fn(async () => {
      throw Error("offline");
    });
    await expect(submitChartOrder(order, request)).rejects.toThrow("unknown");
    expect(request).toHaveBeenCalledTimes(1);
    await expect(submitChartOrder(order, async () => new Response("{}"))).rejects.toThrow(
      "unknown",
    );
  });
});
