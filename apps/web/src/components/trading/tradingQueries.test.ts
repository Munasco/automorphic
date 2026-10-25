import { describe, expect, it, vi } from "vite-plus/test";
import { QueryClient } from "@tanstack/react-query";
import { contractQueryOptions } from "./tradingQueries";

describe("trading query cache", () => {
  it("shares a market request and separates environments", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    });
    const request = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => Response.json([{ id: 1, name: "MGCZ6" }]));
    try {
      const options = contractQueryOptions(["trading", "server-a"], "MGC", request);
      await Promise.all([client.fetchQuery(options), client.fetchQuery(options)]);
      expect(request).toHaveBeenCalledTimes(1);
      await client.fetchQuery(contractQueryOptions(["trading", "server-b"], "MGC", request));
      expect(request).toHaveBeenCalledTimes(2);
      await client.invalidateQueries({ queryKey: ["trading"], refetchType: "none" });
      await client.fetchQuery(options);
      expect(request).toHaveBeenCalledTimes(3);
    } finally {
      client.clear();
    }
  });
});
