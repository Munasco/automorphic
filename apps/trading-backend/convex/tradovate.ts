import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";

// Every database entry point is internal: tokens are never exposed as client queries.
export const session = internalQuery({
  args: {},
  handler: (ctx) =>
    ctx.db
      .query("brokerSessions")
      .withIndex("by_name", (q) => q.eq("name", "owner"))
      .unique(),
});

export const claimRenewal = internalMutation({
  args: { force: v.boolean() },
  handler: async (ctx, { force }) => {
    const session = await ctx.db
      .query("brokerSessions")
      .withIndex("by_name", (q) => q.eq("name", "owner"))
      .unique();
    if (!session) return null;
    const now = Date.now();
    if ((session.leaseUntil ?? 0) > now) return null;
    if (session.expiration <= now) {
      await ctx.db.patch(session._id, { status: "expired-login-required", lastCheckedAt: now });
      return null;
    }
    if (!force && session.expiration - now > 15 * 60_000) {
      await ctx.db.patch(session._id, { status: "valid", lastCheckedAt: now });
      return null;
    }
    await ctx.db.patch(session._id, { leaseUntil: now + 60_000, lastCheckedAt: now });
    return session;
  },
});

export const finishRenewal = internalMutation({
  args: {
    id: v.id("brokerSessions"),
    previousToken: v.string(),
    status: v.string(),
    accessToken: v.optional(v.string()),
    expiration: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const current = await ctx.db.get(args.id);
    if (!current || current.accessToken !== args.previousToken) return;
    await ctx.db.patch(args.id, {
      status: args.status,
      leaseUntil: 0,
      ...(args.accessToken && args.expiration
        ? {
            accessToken: args.accessToken,
            expiration: args.expiration,
            lastRenewedAt: Date.now(),
          }
        : {}),
    });
  },
});

export const renew = internalAction({
  args: { force: v.optional(v.boolean()) },
  handler: async (ctx, args): Promise<{ status: string }> => {
    const current = await ctx.runMutation(internal.tradovate.claimRenewal, {
      force: args.force ?? false,
    });
    if (!current) return { status: "not-due-or-unavailable" };
    const host =
      current.environment === "live"
        ? "https://live.tradovateapi.com"
        : "https://demo.tradovateapi.com";
    let status = "network-error";
    try {
      const response = await fetch(`${host}/v1/auth/renewaccesstoken`, {
        method: "GET",
        redirect: "error",
        headers: { Authorization: `Bearer ${current.accessToken}`, Accept: "application/json" },
        signal: AbortSignal.timeout(15_000),
      });
      status = `rejected-${response.status}`;
      if (response.ok) {
        const body = await response.json();
        const expiration = Date.parse(body.expirationTime);
        if (
          !body.errorText &&
          typeof body.accessToken === "string" &&
          /^[A-Za-z0-9._~-]{30,}$/.test(body.accessToken) &&
          Number.isFinite(expiration) &&
          expiration > Date.now() + 60_000
        ) {
          await ctx.runMutation(internal.tradovate.finishRenewal, {
            id: current._id,
            previousToken: current.accessToken,
            status: "renewed",
            accessToken: body.accessToken,
            expiration,
          });
          return { status: "renewed" };
        }
        status = "invalid-response";
      }
    } catch {
      /* Never log a request, response body, or credential. */
    }
    await ctx.runMutation(internal.tradovate.finishRenewal, {
      id: current._id,
      previousToken: current.accessToken,
      status,
    });
    return { status };
  },
});

export const status = internalQuery({
  args: {},
  handler: async (ctx) => {
    const current = await ctx.db
      .query("brokerSessions")
      .withIndex("by_name", (q) => q.eq("name", "owner"))
      .unique();
    return current
      ? {
          environment: current.environment,
          expiration: current.expiration,
          lastRenewedAt: current.lastRenewedAt,
          lastCheckedAt: current.lastCheckedAt,
          status: current.status,
        }
      : { status: "not-configured" };
  },
});
