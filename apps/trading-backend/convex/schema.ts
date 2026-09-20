import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  waitlist: defineTable({
    email: v.string(),
    createdAt: v.number(),
    betaEmailStatus: v.optional(
      v.union(v.literal("queued"), v.literal("sent"), v.literal("failed")),
    ),
    betaEmailEndsAt: v.optional(v.number()),
    betaEmailContact: v.optional(v.string()),
    betaEmailFrom: v.optional(v.string()),
    betaEmailId: v.optional(v.string()),
  }).index("by_email", ["email"]),
  brokerSessions: defineTable({
    name: v.literal("owner"),
    ownerEmail: v.optional(v.string()),
    accessToken: v.string(),
    environment: v.union(v.literal("demo"), v.literal("live")),
    expiration: v.number(),
    lastRenewedAt: v.number(),
    lastCheckedAt: v.optional(v.number()),
    status: v.optional(v.string()),
    leaseUntil: v.optional(v.number()),
  }).index("by_name", ["name"]),
});
