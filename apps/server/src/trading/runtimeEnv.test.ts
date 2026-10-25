import { describe, it, expect, vi } from "vite-plus/test";
import { resolveTradingEnvironmentFile, createTradingSessionSync } from "./runtimeEnv.ts";
describe("installed trading session configuration", () => {
  it("uses the private application env file and preserves explicit development overrides", () => {
    expect(resolveTradingEnvironmentFile({}, "/test/home")).toBe("/test/home/.automorphic/.env");
    expect(resolveTradingEnvironmentFile({ AUTOMORPHIC_ENV_FILE: "/dev/.env" }, "/test/home")).toBe(
      "/dev/.env",
    );
  });
  it("coalesces concurrent refreshes and throttles repeated credential reads per file", async () => {
    let now = 1000;
    let finish!: () => void;
    const renew = vi.fn(
      () =>
        new Promise<{ status: string }>((resolve) => {
          finish = () => resolve({ status: "synced" });
        }),
    );
    const sync = createTradingSessionSync(renew, () => now);
    const first = sync("/app/.env"),
      second = sync("/app/.env");
    expect(renew).toHaveBeenCalledTimes(1);
    finish();
    await Promise.all([first, second]);
    await sync("/app/.env");
    expect(renew).toHaveBeenCalledTimes(1);
    now += 60_001;
    const next = sync("/app/.env");
    expect(renew).toHaveBeenCalledTimes(2);
    finish();
    await next;
  });
  it("keeps startup usable when the sync service fails", async () => {
    const sync = createTradingSessionSync(async () => {
      throw new Error("Unavailable");
    });
    await expect(sync("/app/.env")).resolves.toBeUndefined();
  });
});
