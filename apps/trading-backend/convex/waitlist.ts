import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { betaAccess } from "./betaAccess";
import { normalizeWaitlistEmail } from "./waitlistValidation";

export const join = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const email = normalizeWaitlistEmail(args.email);
    if (!email) throw new Error("Invalid email address");
    const existing = await ctx.db
      .query("waitlist")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    const id = existing?._id ?? (await ctx.db.insert("waitlist", { email, createdAt: Date.now() }));
    const access = betaAccess(Date.now(), process.env.BETA_ENDS_AT, process.env.BETA_CONTACT_EMAIL);
    if (access.available && access.endsAt && !existing?.betaEmailStatus) {
      await ctx.db.patch(id, {
        betaEmailStatus: "queued",
        betaEmailEndsAt: access.endsAt,
        betaEmailContact: access.contactEmail ?? undefined,
        betaEmailFrom: process.env.AUTH_EMAIL_FROM,
      });
      await ctx.scheduler.runAfter(0, internal.betaEmail.send, { id, attempt: 0 });
    }
    return { success: true, betaAccess: access };
  },
});

// Private administration: remove an address without exposing the list publicly.
export const remove = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const email = normalizeWaitlistEmail(args.email);
    if (!email) return false;
    const entry = await ctx.db
      .query("waitlist")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    if (!entry) return false;
    await ctx.db.delete(entry._id);
    return true;
  },
});

export const emailEntry = internalQuery({
  args: { id: v.id("waitlist") },
  handler: (ctx, { id }) => ctx.db.get(id),
});
export const emailResult = internalMutation({
  args: {
    id: v.id("waitlist"),
    status: v.union(v.literal("sent"), v.literal("failed")),
    emailId: v.optional(v.string()),
  },
  handler: async (ctx, { id, status, emailId }) => {
    if (await ctx.db.get(id))
      await ctx.db.patch(id, { betaEmailStatus: status, betaEmailId: emailId });
  },
});
