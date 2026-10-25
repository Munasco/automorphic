import { describe, expect, it, vi } from "vite-plus/test";
const auth = vi.hoisted(() => ({ safeGetAuthUser: vi.fn() }));
vi.mock("../convex/auth", () => ({ authComponent: auth }));
import { connectionStatus } from "../convex/tradovate";

const run = (
  connectionStatus as unknown as { _handler: (ctx: unknown, args: object) => Promise<unknown> }
)._handler;
const session = {
  ownerEmail: "owner@example.test",
  accessToken: "never-expose-this",
  environment: "demo",
  expiration: 9999,
  lastRenewedAt: 9000,
  status: "valid",
};
const ctx = { db: { query: () => ({ withIndex: () => ({ unique: async () => session }) }) } };
describe("broker status subscription", () => {
  it("exposes renewal metadata without the broker credential", async () => {
    auth.safeGetAuthUser.mockResolvedValue({ email: "owner@example.test", emailVerified: true });
    expect(await run(ctx, {})).toEqual({
      environment: "demo",
      expiration: 9999,
      lastRenewedAt: 9000,
      status: "valid",
    });
  });
  it("does not reveal the owner's connection to another account", async () => {
    auth.safeGetAuthUser.mockResolvedValue({ email: "other@example.test", emailVerified: true });
    expect(await run(ctx, {})).toBeNull();
  });
  it("requires verified authentication", async () => {
    for (const user of [null, { email: "owner@example.test", emailVerified: false }]) {
      auth.safeGetAuthUser.mockResolvedValue(user);
      expect(await run(ctx, {})).toBeNull();
    }
  });
});
