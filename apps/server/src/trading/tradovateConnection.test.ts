// @effect-diagnostics globalDate:off - Fixed clock and broker transport fixtures.
import { describe, it, expect } from "vite-plus/test";
import { createTradovateConnection, type ConnectionRequest } from "./tradovateConnection.ts";
import type { ConnectionSecrets } from "./connectionSecrets.ts";
const token = "safe-test-token-for-fixture-only-123456789",
  nextToken = "renewed-test-token-for-fixture-123456789";
function fixture() {
  let saved: unknown = null,
    now = 1_000_000;
  const calls: string[] = [];
  const store: ConnectionSecrets = {
    read: async () => saved,
    write: async (_name, value) => {
      saved = value;
    },
    remove: async () => {
      saved = null;
    },
  };
  const request: ConnectionRequest = async (input) => {
    const url = String(input);
    calls.push(url);
    if (url.endsWith("account/list")) return Response.json([{ id: 1 }]);
    return Response.json({
      accessToken: nextToken,
      expirationTime: new Date(now + 3_600_000).toISOString(),
    });
  };
  return {
    store,
    request,
    calls,
    now: () => now,
    setNow: (value: number) => {
      now = value;
    },
    saved: () => saved,
    setSaved: (value: unknown) => {
      saved = value;
    },
  };
}
describe("Tradovate browser session", () => {
  it("verifies account access before saving and never returns tokens in status", async () => {
    const f = fixture(),
      c = createTradovateConnection({ ...f, environment: async () => ({}) });
    expect(await c.connect(token, "demo")).toEqual({ connected: true });
    expect(f.calls).toEqual([
      "https://demo.tradovateapi.com/v1/auth/renewaccesstoken",
      "https://demo.tradovateapi.com/v1/account/list",
    ]);
    expect(JSON.stringify(await c.status())).not.toContain(nextToken);
    expect((await c.credentials())?.token).toBe(nextToken);
  });
  it("does not save a session without account access", async () => {
    const f = fixture(),
      request: ConnectionRequest = async (input, init) =>
        String(input).endsWith("account/list") ? Response.json([]) : f.request(input, init),
      c = createTradovateConnection({ ...f, request });
    await expect(c.connect(token, "live")).rejects.toThrow("No Tradovate accounts");
    expect(f.saved()).toBeNull();
  });
  it("disconnect prevents fallback to an older server token", async () => {
    const f = fixture(),
      c = createTradovateConnection({
        ...f,
        environment: async () => ({ TRADOVATE_ACCESS_TOKEN: token }),
      });
    await c.disconnect();
    expect((await c.status()).connected).toBe(false);
    await expect(c.credentials()).rejects.toThrow("Connect Tradovate");
  });
  it("does not resurrect a connection disconnected during verification", async () => {
    const f = fixture();
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const request: ConnectionRequest = async (input, init) => {
      await gate;
      return f.request(input, init);
    };
    const c = createTradovateConnection({ ...f, request });
    const pending = c.connect(token, "demo");
    await c.disconnect();
    release();
    await expect(pending).rejects.toThrow("connection changed");
    expect(f.saved()).toEqual({ disconnected: true });
  });
  it("renews near expiry and rejects expired credentials", async () => {
    const f = fixture(),
      c = createTradovateConnection({ ...f });
    f.setSaved({ token, environment: "live", expires: f.now() + 120_000 });
    expect((await c.credentials())?.token).toBe(nextToken);
    f.setNow(f.now() + 4_000_000);
    await expect(c.credentials()).rejects.toThrow("expired");
  });
  it("rejects non-token text without contacting the broker", async () => {
    const f = fixture(),
      c = createTradovateConnection({ ...f });
    await expect(c.connect("password", "demo")).rejects.toThrow("valid session");
    expect(f.calls).toHaveLength(0);
  });
});
