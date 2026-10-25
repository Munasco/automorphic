import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { betaEmailText } from "./betaAccess";

export const send = internalAction({
  args: { id: v.id("waitlist"), attempt: v.number() },
  handler: async (ctx, { id, attempt }): Promise<void> => {
    const entry = await ctx.runQuery(internal.waitlist.emailEntry, { id });
    if (!entry || entry.betaEmailStatus !== "queued") return;
    if (
      !entry.betaEmailEndsAt ||
      Date.now() >= entry.betaEmailEndsAt ||
      !process.env.RESEND_API_KEY ||
      !entry.betaEmailFrom
    ) {
      await ctx.runMutation(internal.waitlist.emailResult, { id, status: "failed" });
      return;
    }
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `automorphic-beta/${id}`,
        },
        body: JSON.stringify({
          from: entry.betaEmailFrom,
          to: [entry.email],
          ...(entry.betaEmailContact ? { reply_to: entry.betaEmailContact } : {}),
          subject: "Your Automorphic beta is ready",
          text: betaEmailText(entry.betaEmailEndsAt, entry.betaEmailContact ?? null),
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) {
        if (response.status === 429 || response.status >= 500)
          throw new Error("Temporary email failure");
        await ctx.runMutation(internal.waitlist.emailResult, { id, status: "failed" });
        return;
      }
      const result = await response.json();
      if (typeof result.id !== "string") throw new Error("Missing email receipt");
      await ctx.runMutation(internal.waitlist.emailResult, {
        id,
        status: "sent",
        emailId: result.id,
      });
    } catch {
      if (attempt < 4)
        await ctx.scheduler.runAfter(60_000 * 2 ** attempt, internal.betaEmail.send, {
          id,
          attempt: attempt + 1,
        });
      else await ctx.runMutation(internal.waitlist.emailResult, { id, status: "failed" });
    }
  },
});
