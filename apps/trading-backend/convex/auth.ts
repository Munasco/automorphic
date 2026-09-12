import { electron } from "@better-auth/electron";
import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex, crossDomain } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth/minimal";
import { emailOTP } from "better-auth/plugins/email-otp";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { query } from "./_generated/server";
import authConfig from "./auth.config";

export const authComponent = createClient<DataModel>(components.betterAuth);
export const createAuth = (ctx: GenericCtx<DataModel>) => {
  const siteUrl = process.env.SITE_URL!;
  return betterAuth({
    appName: "Automorphic",
    baseURL: process.env.CONVEX_SITE_URL,
    secret: process.env.BETTER_AUTH_SECRET,
    database: authComponent.adapter(ctx),
    trustedOrigins: (process.env.AUTH_ALLOWED_ORIGINS || siteUrl)
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
    rateLimit: { enabled: true, storage: "database", window: 60, max: 60 },
    socialProviders:
      process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
        ? {
            google: {
              clientId: process.env.GOOGLE_CLIENT_ID,
              clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            },
          }
        : {},
    plugins: [
      electron(),
      crossDomain({ siteUrl }),
      convex({ authConfig }),
      emailOTP({
        otpLength: 6,
        expiresIn: 600,
        allowedAttempts: 5,
        storeOTP: "hashed",
        async sendVerificationOTP({ email, otp }) {
          if (!process.env.RESEND_API_KEY || !process.env.AUTH_EMAIL_FROM)
            throw new Error("Email sign-in is unavailable.");
          const response = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: process.env.AUTH_EMAIL_FROM,
              to: [email],
              subject: "Your Automorphic sign-in code",
              text: `Your Automorphic sign-in code is ${otp}.\n\nThis code expires in 10 minutes. If you didn't request it, you can ignore this email.`,
              html: `<div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:40px auto;padding:32px;border:1px solid #ddd;border-radius:16px"><h2>Sign in to Automorphic</h2><p>Enter this code to continue:</p><p style="font-size:32px;font-weight:600;letter-spacing:8px">${otp}</p><p>This code expires in 10 minutes.</p><p style="color:#777;font-size:13px">If you didn't request it, you can ignore this email.</p></div>`,
            }),
          });
          if (!response.ok) throw new Error("Could not send your sign-in code. Please try again.");
        },
      }),
    ],
  });
};

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const user = await authComponent.safeGetAuthUser(ctx);
    if (!user) return null;
    return {
      id: user._id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      image: user.image,
    };
  },
});
