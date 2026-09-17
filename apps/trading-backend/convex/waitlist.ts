import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
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
    if (!existing) {
      await ctx.db.insert("waitlist", { email, createdAt: Date.now() });
    }
    return { success: true };
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
