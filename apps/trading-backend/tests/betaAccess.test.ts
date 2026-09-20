import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { internal } from "../convex/_generated/api";
import { betaAccess, betaEmailText } from "../convex/betaAccess";
const modules = import.meta.glob("../convex/**/*.*s");
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe("one-week public beta", () => {
  it("fails closed and ends at the exact deadline", () => {
    const end = "2026-09-19T18:00:00Z",
      time = Date.parse(end);
    expect(betaAccess(time - 1, end, "owner@example.com").available).toBe(true);
    expect(betaAccess(time, end, "owner@example.com").available).toBe(false);
    expect(betaAccess(time + 1, end, "owner@example.com").available).toBe(false);
    for (const value of [undefined, "", "invalid"])
      expect(betaAccess(time, value, undefined).available).toBe(false);
    expect(betaEmailText(time, "owner@example.com")).toContain("TennantCloud/automorphic-releases");
  });
  it("deduplicates signup and sends one email with the correct release link", async () => {
    vi.useFakeTimers();
    vi.stubEnv("BETA_ENDS_AT", new Date(Date.now() + 86400000).toISOString());
    vi.stubEnv("BETA_CONTACT_EMAIL", "owner@example.com");
    vi.stubEnv("AUTH_EMAIL_FROM", "Automorphic <beta@example.com>");
    vi.stubEnv("RESEND_API_KEY", "test-key");
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ id: "email-receipt" })));
    vi.stubGlobal("fetch", fetchMock);
    const t = convexTest(schema, modules);
    const first = await t.mutation(internal.waitlist.join, { email: "  Beta@Example.com " });
    await t.mutation(internal.waitlist.join, { email: "beta@example.com" });
    expect(first.betaAccess.available).toBe(true);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.to).toEqual(["beta@example.com"]);
    expect(body.text).toContain("https://automorphic-six.vercel.app/download");
    expect(body.text).toContain("TennantCloud/automorphic-releases");
    const entries = await t.run((ctx) => ctx.db.query("waitlist").collect());
    expect(entries).toHaveLength(1);
    expect(entries[0]?.betaEmailStatus).toBe("sent");
  });
  it("returns to waitlist after cutoff without sending a download email", async () => {
    vi.useFakeTimers();
    vi.stubEnv("BETA_ENDS_AT", new Date(Date.now() - 1).toISOString());
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const t = convexTest(schema, modules);
    const result = await t.mutation(internal.waitlist.join, { email: "later@example.com" });
    expect(result.betaAccess.available).toBe(false);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await t.run((ctx) => ctx.db.query("waitlist").collect())).toHaveLength(1);
  });
});
