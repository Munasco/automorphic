import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renewTradovateSession } from "./tradovate-session.mjs";
const now = 1_800_000_000_000;
const oldToken =
  "old." +
  Buffer.from(JSON.stringify({ exp: (now + 3_600_000) / 1000 })).toString("base64url") +
  ".signature";
const newToken = "renewed-token-for-fixture-only-123456789";
async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), "automorphic-token-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const envPath = join(dir, ".env");
  await writeFile(
    envPath,
    `OTHER=value\nTRADOVATE_ENVIRONMENT=demo\nTRADOVATE_ACCESS_TOKEN=${oldToken}\n`,
  );
  return { envPath, now: () => now, force: true };
}
const good = () =>
  Response.json({ accessToken: newToken, expirationTime: new Date(now + 4_800_000).toISOString() });
test("renewal saves a private file without losing unrelated settings", async (t) => {
  const options = await fixture(t);
  const result = await renewTradovateSession({
    ...options,
    fetchImpl: async (url, request) => {
      assert.equal(url, "https://demo.tradovateapi.com/v1/auth/renewaccesstoken");
      assert.equal(request.headers.Authorization, `Bearer ${oldToken}`);
      return good();
    },
  });
  assert.equal(result.status, "renewed");
  const saved = await readFile(options.envPath, "utf8");
  assert.ok(saved.includes("OTHER=value"));
  assert.ok(saved.includes(newToken));
  assert.ok(!saved.includes(oldToken));
  assert.equal((await stat(options.envPath)).mode & 0o777, 0o600);
  assert.ok(!JSON.stringify(result).includes(newToken));
});
test("regular checks do not renew early", async (t) => {
  const options = await fixture(t);
  const result = await renewTradovateSession({
    ...options,
    force: false,
    fetchImpl: () => {
      throw Error("must not fetch");
    },
  });
  assert.equal(result.status, "valid");
});
test("rejected renewal preserves the existing token", async (t) => {
  const options = await fixture(t);
  const before = await readFile(options.envPath, "utf8");
  const result = await renewTradovateSession({
    ...options,
    fetchImpl: async () => new Response("", { status: 401 }),
  });
  assert.equal(result.status, "rejected");
  assert.equal(await readFile(options.envPath, "utf8"), before);
});
test("expired token requests a fresh login without a network call", async (t) => {
  const options = await fixture(t);
  const result = await renewTradovateSession({
    ...options,
    now: () => now + 4_000_000,
    fetchImpl: () => {
      throw Error("must not fetch");
    },
  });
  assert.equal(result.status, "expired");
});
test("token replacement during renewal wins over the in-flight request", async (t) => {
  const options = await fixture(t);
  const result = await renewTradovateSession({
    ...options,
    fetchImpl: async () => {
      await writeFile(
        options.envPath,
        "TRADOVATE_ENVIRONMENT=demo\nTRADOVATE_ACCESS_TOKEN=manually-replaced\n",
      );
      return good();
    },
  });
  assert.equal(result.status, "superseded");
  assert.ok((await readFile(options.envPath, "utf8")).includes("manually-replaced"));
});
test("malformed or failed API response never replaces a good token", async (t) => {
  const options = await fixture(t);
  const before = await readFile(options.envPath, "utf8");
  const result = await renewTradovateSession({
    ...options,
    fetchImpl: async () => Response.json({ errorText: "denied", accessToken: newToken }),
  });
  assert.equal(result.status, "invalid-response");
  assert.equal(await readFile(options.envPath, "utf8"), before);
});

test("cloud sync recovers an expired local token and uses the private sync credential", async (t) => {
  const options = await fixture(t);
  const secret = "private-test-sync-secret-not-real-123456789";
  await writeFile(
    options.envPath,
    (await readFile(options.envPath, "utf8")) +
      `TRADOVATE_SYNC_URL=https://test-deployment.convex.site/tradovate/session\nTRADOVATE_SYNC_SECRET=${secret}\n`,
  );
  const result = await renewTradovateSession({
    ...options,
    now: () => now + 4_000_000,
    fetchImpl: async (url, request) => {
      assert.equal(url, "https://test-deployment.convex.site/tradovate/session");
      assert.equal(request.headers.Authorization, `Bearer ${secret}`);
      return Response.json({
        accessToken: newToken,
        expirationTime: new Date(now + 8_000_000).toISOString(),
        environment: "demo",
      });
    },
  });
  assert.equal(result.status, "synced");
  assert.ok((await readFile(options.envPath, "utf8")).includes(newToken));
});

test("cloud sync refuses an untrusted destination without sending credentials", async (t) => {
  const options = await fixture(t);
  await writeFile(
    options.envPath,
    (await readFile(options.envPath, "utf8")) +
      "TRADOVATE_SYNC_URL=https://example.com/tradovate/session\nTRADOVATE_SYNC_SECRET=fixture-private-secret-1234567890123456789\n",
  );
  const result = await renewTradovateSession({
    ...options,
    fetchImpl: () => {
      throw Error("must not fetch");
    },
  });
  assert.equal(result.status, "sync-config-error");
});

test("cloud sync refuses a different trading environment", async (t) => {
  const options = await fixture(t);
  await writeFile(
    options.envPath,
    (await readFile(options.envPath, "utf8")) +
      "TRADOVATE_SYNC_URL=https://test-deployment.convex.site/tradovate/session\nTRADOVATE_SYNC_SECRET=fixture-private-secret-1234567890123456789\n",
  );
  const before = await readFile(options.envPath, "utf8");
  const result = await renewTradovateSession({
    ...options,
    fetchImpl: async () =>
      Response.json({
        accessToken: newToken,
        expirationTime: new Date(now + 8_000_000).toISOString(),
        environment: "live",
      }),
  });
  assert.equal(result.status, "invalid-response");
  assert.equal(await readFile(options.envPath, "utf8"), before);
});
