import { readFile, writeFile, rename, unlink } from "node:fs/promises";
import { parseEnv } from "node:util";
import { randomUUID } from "node:crypto";

const MINUTE = 60_000;
const HOSTS = { demo: "https://demo.tradovateapi.com", live: "https://live.tradovateapi.com" };
const TOKEN_KEY = "TRADOVATE_ACCESS_TOKEN";

export function tokenExpiry(token) {
  try {
    const expiry = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()).exp;
    return Number.isFinite(expiry) ? expiry * 1000 : 0;
  } catch {
    return 0;
  }
}

// The server reads this file on every cycle, so manually replacing a token recovers without a restart.
export async function renewTradovateSession({
  envPath,
  force = false,
  fetchImpl = fetch,
  now = Date.now,
}) {
  let source;
  try {
    source = await readFile(envPath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return { status: "missing" };
    throw error;
  }
  const env = parseEnv(source);
  const token = env[TOKEN_KEY];
  const syncUrl = env.TRADOVATE_SYNC_URL;
  if (!token && !syncUrl) return { status: "missing" };
  const host = HOSTS[env.TRADOVATE_ENVIRONMENT];
  if (!host) return { status: "environment-required" };
  const expiration = Date.parse(env.TRADOVATE_TOKEN_EXPIRATION ?? "") || tokenExpiry(token);
  if (!syncUrl && expiration && expiration <= now()) return { status: "expired" };
  if (!syncUrl && !force && expiration - now() > 15 * MINUTE)
    return { status: "valid", expiration };

  let endpoint = `${host}/v1/auth/renewaccesstoken`;
  let credential = token;
  if (syncUrl) {
    let url;
    try {
      url = new URL(syncUrl);
    } catch {
      return { status: "sync-config-error" };
    }
    if (
      url.protocol !== "https:" ||
      !/^[a-z0-9-]+\.convex\.site$/.test(url.hostname) ||
      url.pathname !== "/tradovate/session" ||
      url.search ||
      url.username ||
      url.password ||
      !env.TRADOVATE_SYNC_SECRET ||
      env.TRADOVATE_SYNC_SECRET.length < 32
    ) {
      return { status: "sync-config-error" };
    }
    endpoint = url.href;
    credential = env.TRADOVATE_SYNC_SECRET;
  }
  let response;
  try {
    response = await fetchImpl(endpoint, {
      method: "GET",
      headers: { Authorization: `Bearer ${credential}`, Accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return { status: "network-error" };
  }
  if (!response.ok) return { status: "rejected", httpStatus: response.status };
  let renewal;
  try {
    renewal = await response.json();
  } catch {
    return { status: "invalid-response" };
  }
  const nextExpiration = Date.parse(renewal.expirationTime);
  if (
    renewal.errorText ||
    (syncUrl && renewal.environment !== env.TRADOVATE_ENVIRONMENT) ||
    typeof renewal.accessToken !== "string" ||
    !/^[A-Za-z0-9._~-]{30,}$/.test(renewal.accessToken) ||
    !Number.isFinite(nextExpiration) ||
    nextExpiration <= now() + MINUTE
  ) {
    return { status: "invalid-response" };
  }
  // Preserve unrelated edits made while the network request was in flight; never overwrite a newer token.
  const latest = await readFile(envPath, "utf8");
  const latestEnv = parseEnv(latest);
  if (
    latestEnv[TOKEN_KEY] !== token ||
    latestEnv.TRADOVATE_ENVIRONMENT !== env.TRADOVATE_ENVIRONMENT
  ) {
    return { status: "superseded" };
  }
  const status = syncUrl ? "synced" : "renewed";
  if (renewal.accessToken === token && expiration === nextExpiration) return { status, expiration };
  const lines = latest
    .split(/\r?\n/)
    .filter(
      (line) => !/^\s*(?:export\s+)?TRADOVATE_(?:ACCESS_TOKEN|TOKEN_EXPIRATION)\s*=/.test(line),
    );
  while (lines.at(-1) === "") lines.pop();
  lines.push(
    `${TOKEN_KEY}=${renewal.accessToken}`,
    `TRADOVATE_TOKEN_EXPIRATION=${new Date(nextExpiration).toISOString()}`,
  );
  const temporary = `${envPath}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, lines.join("\n") + "\n", { mode: 0o600, flag: "wx" });
    await rename(temporary, envPath);
  } finally {
    await unlink(temporary).catch(() => {});
  }
  return { status, expiration: nextExpiration };
}

export function startTradovateRenewal(envPath, log = console.info) {
  let stopped = false;
  let timer;
  let previousStatus;
  const cycle = async (force) => {
    let result;
    try {
      result = await renewTradovateSession({ envPath, force });
    } catch {
      result = { status: "file-error" };
    }
    if (result.status !== previousStatus || result.status === "renewed") {
      const messages = {
        missing: "No local token configured.",
        "environment-required": "Set TRADOVATE_ENVIRONMENT to demo or live in .env.",
        expired: "Token expired. Copy a fresh login token into .env; the app remains available.",
        renewed: "Token renewed and saved to .env.",
        synced: "Latest hosted token synced to .env. Convex handles renewal.",
        "sync-config-error": "Check the Convex sync URL and private sync secret in .env.",
        rejected: `Renewal rejected (HTTP ${result.httpStatus}). App remains available; a new login token or API access may be required.`,
        "invalid-response": "Renewal returned no usable token. Existing .env preserved.",
        "network-error": "Renewal could not reach Tradovate. Retrying in one minute.",
        "file-error": "Could not read or save the token file. App remains available.",
      };
      if (messages[result.status]) log(`[Tradovate] ${messages[result.status]}`);
    }
    previousStatus = result.status;
    // Startup renews once; subsequent checks renew only within 15 minutes of expiry.
    if (!stopped) timer = setTimeout(() => void cycle(false), MINUTE).unref();
  };
  void cycle(true);
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
