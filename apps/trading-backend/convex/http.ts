import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

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
export default http;
