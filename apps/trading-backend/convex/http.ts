import { authComponent, createAuth } from "./auth";
import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { betaAccess } from "./betaAccess";
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
authComponent.registerRoutes(http, createAuth, { cors: true });
http.route({
  path: "/desktop-start",
  method: "GET",
  handler: httpAction(
    async () =>
      new Response(
        `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sign in to Automorphic</title>
<style>body{background:#0C0E0D;color:#eee;font:16px system-ui;display:grid;place-content:center;min-height:90vh;text-align:center;padding:24px}</style>
<h1>Sign in to Automorphic</h1><p id="status">Connecting to Google…</p>
<script>
(async () => {
  try {
    const params = new URLSearchParams(location.search);
    if (params.get('client_id') !== 'electron' || !params.get('state') || !params.get('code_challenge') || params.get('code_challenge_method') !== 'S256') throw new Error();
    const response = await fetch('/api/auth/sign-in/social?' + params.toString(), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'google', callbackURL: location.origin + '/desktop-auth' })
    });
    const data = await response.json();
    if (!response.ok || !data.url) throw new Error();
    location.replace(data.url);
  } catch { document.getElementById('status').textContent = 'Sign-in could not start. Return to Automorphic and try again.'; }
})();
</script></html>`,
        {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
            "Referrer-Policy": "no-referrer",
            "Content-Security-Policy":
              "default-src 'none'; connect-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
          },
        },
      ),
  ),
});
http.route({
  path: "/desktop-auth",
  method: "GET",
  handler: httpAction(
    async () =>
      new Response(
        `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sign in to Automorphic</title>
<style>body{background:#090b10;color:#eee;font:16px system-ui;display:grid;place-content:center;min-height:90vh;text-align:center;padding:24px}a{color:inherit;padding:14px;border:1px solid #555;border-radius:8px;text-decoration:none}p{color:#aaa}</style>
<h1>Back to your trading workspace.</h1><p id="status">Finishing your sign-in…</p><a id="open" hidden>Open Automorphic</a>
<script>
const entry = document.cookie.split('; ').find(value => value.startsWith('better-auth.electron='));
if (entry) {
  const token = entry.slice(entry.indexOf('=') + 1);
  const target = 'com.automorphic.account://auth/callback#token=' + token;
  const link = document.getElementById('open'); link.href = target; link.hidden = false;
  document.getElementById('status').textContent = 'You can return to Automorphic now.';
  history.replaceState(null, '', '/desktop-auth');
  location.replace(target);
} else { document.getElementById('status').textContent = 'Please return to Automorphic and start sign-in again.'; }
</script></html>`,
        {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
            "Referrer-Policy": "no-referrer",
            "Content-Security-Policy":
              "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
          },
        },
      ),
  ),
});
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
http.route({
  path: "/telegram/app",
  method: "GET",
  handler: httpAction(async () => {
    const id = Number(process.env.AUTOMORPHIC_TELEGRAM_API_ID);
    const hash = process.env.AUTOMORPHIC_TELEGRAM_API_HASH?.trim();
    const headers = {
      "Cache-Control": "public, max-age=300",
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    };
    if (!Number.isSafeInteger(id) || id <= 0 || !hash || !/^[a-f\d]{32}$/i.test(hash)) {
      return new Response(JSON.stringify({ error: "Telegram app not configured" }), {
        status: 404,
        headers,
      });
    }
    return new Response(JSON.stringify({ id, hash }), { status: 200, headers });
  }),
});
http.route({
  path: "/telegram/app",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
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
    const result = await ctx.runMutation(internal.waitlist.join, { email });
    return reply(result, 200);
  } catch {
    return reply({ error: "Could not save your email. Please try again." }, 503);
  }
});
http.route({ path: "/waitlist", method: "POST", handler: waitlistHandler });
http.route({ path: "/waitlist", method: "OPTIONS", handler: waitlistHandler });
http.route({
  path: "/beta/access",
  method: "GET",
  handler: httpAction(async (_ctx, request) => {
    const origin = allowedWaitlistOrigin(
      request.headers.get("Origin"),
      process.env.WAITLIST_ALLOWED_ORIGINS ?? "",
    );
    if (!origin) return new Response(null, { status: 403 });
    return new Response(
      JSON.stringify(
        betaAccess(Date.now(), process.env.BETA_ENDS_AT, process.env.BETA_CONTACT_EMAIL),
      ),
      {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          "Access-Control-Allow-Origin": origin,
          Vary: "Origin",
        },
      },
    );
  }),
});
export default http;
