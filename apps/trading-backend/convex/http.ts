import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { normalizeWaitlistEmail, allowedWaitlistOrigin } from "./waitlistValidation";

async function matchesSecret(candidate: string, expected: string) {
  const encode = new TextEncoder();
  const [left, right] = await Promise.all([
    crypto.subtle.digest("SHA-256", encode.encode(candidate)),
    crypto.subtle.digest("SHA-256", encode.encode(expected)),
  ]);
  const a = new Uint8Array(left),
    b = new Uint8Array(right);
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i]! ^ b[i]!;
  return difference === 0;
}
const http = httpRouter();
http.route({
  path: "/tradovate/session",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const secret = process.env.TRADOVATE_SYNC_SECRET;
    const candidate = request.headers.get("Authorization") ?? "";
    const headers = { "Cache-Control": "no-store", "Content-Type": "application/json" };
    if (!secret || secret.length < 32 || !(await matchesSecret(candidate, `Bearer ${secret}`))) {
      return new Response('{"error":"Unauthorized"}', { status: 401, headers });
    }
    const session = await ctx.runQuery(internal.tradovate.session, {});
    if (!session || session.expiration <= Date.now()) {
      return new Response('{"error":"Fresh login token required"}', { status: 503, headers });
    }
    return new Response(
      JSON.stringify({
        accessToken: session.accessToken,
        expirationTime: new Date(session.expiration).toISOString(),
        environment: session.environment,
      }),
      { status: 200, headers },
    );
  }),
});
const waitlistHandler = httpAction(async (ctx, request) => {
  const origin = allowedWaitlistOrigin(
    request.headers.get("Origin"),
    process.env.WAITLIST_ALLOWED_ORIGINS ?? "",
  );
  if (!origin) return new Response(null, { status: 403 });
  const headers = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store",
    "Content-Type": "application/json",
    Vary: "Origin",
  };
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  const reply = (body: object, status: number) =>
    new Response(JSON.stringify(body), { status, headers });
  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > 2048) return reply({ error: "Request too large" }, 413);
    body = JSON.parse(text);
  } catch {
    return reply({ error: "Enter a valid email address." }, 400);
  }
  const email = normalizeWaitlistEmail(
    body && typeof body === "object" && "email" in body ? body.email : null,
  );
  if (!email) return reply({ error: "Enter a valid email address." }, 400);
  try {
    await ctx.runMutation(internal.waitlist.join, { email });
    return reply({ success: true }, 200);
  } catch {
    return reply({ error: "Could not save your email. Please try again." }, 503);
  }
});
http.route({ path: "/waitlist", method: "POST", handler: waitlistHandler });
http.route({ path: "/waitlist", method: "OPTIONS", handler: waitlistHandler });
export default http;
