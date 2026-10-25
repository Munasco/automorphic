import * as NodeAssert from "node:assert/strict";
import * as NodeCrypto from "node:crypto";
import * as NodeTest from "node:test";
import { betterAuth } from "better-auth/minimal";
import { memoryAdapter } from "better-auth/adapters/memory";
import { emailOTP } from "better-auth/plugins/email-otp";
import { electron } from "@better-auth/electron";

function fixture() {
  let code = "";
  const auth = betterAuth({
    baseURL: "https://accounts.example.test",
    secret: "test-only-automorphic-auth-secret-longer-than-32-characters",
    database: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
    trustedOrigins: ["https://accounts.example.test", "com.automorphic.account:/"],
    logger: { disabled: true },
    plugins: [
      electron(),
      emailOTP({
        storeOTP: "hashed",
        allowedAttempts: 5,
        async sendVerificationOTP({ otp }) {
          code = otp;
        },
      }),
    ],
  });
  const request = (path: string, body?: Record<string, unknown>, cookie?: string) =>
    auth.handler(
      new Request(`https://accounts.example.test/api/auth${path}`, {
        method: body ? "POST" : "GET",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://accounts.example.test",
          ...(cookie ? { Cookie: cookie } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
    );
  const begin = async () => {
    const response = await request("/email-otp/send-verification-otp", {
      email: "trader@example.test",
      type: "sign-in",
    });
    NodeAssert.equal(response.status, 200);
    NodeAssert.match(code, /^\d{6}$/);
  };
  const cookieOf = (response: Response) =>
    response.headers
      .getSetCookie()
      .map((cookie) => cookie.split(";")[0])
      .join("; ");
  return { request, begin, code: () => code, cookieOf };
}

NodeTest.test("account entry requires a verified session, which sign-out invalidates", async () => {
  const f = fixture();
  NodeAssert.equal(await (await f.request("/get-session")).json(), null);
  await f.begin();
  const wrong = await f.request("/sign-in/email-otp", {
    email: "trader@example.test",
    otp: "not-a-code",
  });
  NodeAssert.ok(wrong.status >= 400);
  const verified = await f.request("/sign-in/email-otp", {
    email: "trader@example.test",
    otp: f.code(),
    name: "Trader",
  });
  NodeAssert.equal(verified.status, 200);
  const cookie = f.cookieOf(verified);
  const session = await (await f.request("/get-session", undefined, cookie)).json();
  NodeAssert.equal(session.user.emailVerified, true);
  NodeAssert.equal(session.user.name, "Trader");
  const logout = await f.request("/sign-out", {}, cookie);
  NodeAssert.equal(logout.status, 200);
  NodeAssert.equal(await (await f.request("/get-session", undefined, cookie)).json(), null);
});

async function desktopTransfer() {
  const f = fixture();
  const verifier = NodeCrypto.randomBytes(32).toString("base64url");
  const challenge = NodeCrypto.createHash("sha256").update(verifier).digest("base64url");
  const state = NodeCrypto.randomBytes(16).toString("hex");
  await f.begin();
  const query = new URLSearchParams({
    client_id: "electron",
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
  });
  const response = await f.request(`/sign-in/email-otp?${query}`, {
    email: "trader@example.test",
    name: "Trader",
    otp: f.code(),
  });
  NodeAssert.equal(response.status, 200);
  const cookie = response.headers
    .getSetCookie()
    .find((value) => value.startsWith("better-auth.electron="));
  NodeAssert.ok(cookie);
  const token = JSON.parse(
    Buffer.from(
      decodeURIComponent(cookie.split(";")[0]!.slice("better-auth.electron=".length)),
      "base64url",
    ).toString(),
  ) as { identifier: string; state: string };
  return { ...f, verifier, state, token: token.identifier };
}

NodeTest.test(
  "desktop handoff requires PKCE and accepts the authorization code only once",
  async () => {
    const f = await desktopTransfer();
    const input = { token: f.token, state: f.state, code_verifier: f.verifier };
    const response = await f.request("/electron/token", input);
    NodeAssert.equal(response.status, 200);
    NodeAssert.equal((await response.json()).user.emailVerified, true);
    NodeAssert.ok((await f.request("/electron/token", input)).status >= 400);
  },
);

NodeTest.test("desktop handoff rejects the wrong verifier", async () => {
  const f = await desktopTransfer();
  const response = await f.request("/electron/token", {
    token: f.token,
    state: f.state,
    code_verifier: NodeCrypto.randomBytes(32).toString("base64url"),
  });
  NodeAssert.equal(response.status, 400);
});

NodeTest.test("desktop handoff rejects a substituted state", async () => {
  const f = await desktopTransfer();
  const response = await f.request("/electron/token", {
    token: f.token,
    state: "another-login",
    code_verifier: f.verifier,
  });
  NodeAssert.equal(response.status, 400);
});

NodeTest.test("unknown desktop authorization codes cannot establish a session", async () => {
  const f = fixture();
  const response = await f.request("/electron/token", {
    token: "missing",
    state: "missing",
    code_verifier: "missing",
  });
  NodeAssert.ok(response.status >= 400);
  NodeAssert.equal(await (await f.request("/get-session")).json(), null);
});
