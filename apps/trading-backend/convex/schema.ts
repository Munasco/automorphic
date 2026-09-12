import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  brokerSessions: defineTable({
    name: v.literal("owner"),
    accessToken: v.string(),
    environment: v.union(v.literal("demo"), v.literal("live")),
    expiration: v.number(),
    lastRenewedAt: v.number(),
    lastCheckedAt: v.optional(v.number()),
    status: v.optional(v.string()),
    leaseUntil: v.optional(v.number()),
  }).index("by_name", ["name"]),
});
