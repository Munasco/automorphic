// @effect-diagnostics globalFetch:off globalDate:off - Tradovate transport and private session lifecycle.
import * as Schema from "effect/Schema";
import {
  connectionSecrets,
  ConnectionError,
  tradingConnectionEnvironment,
  type ConnectionSecrets,
} from "./connectionSecrets.ts";
export type ConnectionRequest = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;
const Saved = Schema.Struct({
  token: Schema.String,
  environment: Schema.Literals(["demo", "live"]),
  expires: Schema.Finite,
});
type Saved = typeof Saved.Type;
const Renewal = Schema.Struct({ accessToken: Schema.String, expirationTime: Schema.String });
const disabled = (value: unknown) =>
  !!value && typeof value === "object" && "disconnected" in value && value.disconnected === true;
export function createTradovateConnection({
  store = connectionSecrets(),
  environment = tradingConnectionEnvironment,
  request = fetch,
  now = Date.now,
}: {
  store?: ConnectionSecrets;
  environment?: () => Promise<NodeJS.ProcessEnv>;
  request?: ConnectionRequest;
  now?: () => number;
} = {}) {
  let generation = 0,
    renewal: Promise<Saved> | null = null,
    mutations = Promise.resolve();
  const serial = <T>(operation: () => Promise<T>): Promise<T> => {
    const task = mutations.then(operation);
    mutations = task.then(
      () => {},
      () => {},
    );
    return task;
  };
  const read = async () => {
    const value = await store.read("tradovate");
    if (value === null) return null;
    if (disabled(value)) throw new ConnectionError("Connect Tradovate in Trading settings.", 401);
    try {
      return Schema.decodeUnknownSync(Saved)(value);
    } catch {
      throw new ConnectionError("Reconnect Tradovate in Trading settings.", 401);
    }
  };
  const renew = async (token: string, target: "demo" | "live"): Promise<Saved> => {
    try {
      const response = await request(
        `https://${target}.tradovateapi.com/v1/auth/renewaccesstoken`,
        {
          headers: { Authorization: `Bearer ${token}` },
          redirect: "error",
          signal: AbortSignal.timeout(15_000),
        },
      );
      if (!response.ok)
        throw new ConnectionError("Tradovate could not verify this session. Sign in again.", 401);
      const data = Schema.decodeUnknownSync(Renewal)(await response.json()),
        expires = Date.parse(data.expirationTime);
      if (
        !/^[A-Za-z0-9._~-]{30,4096}$/.test(data.accessToken) ||
        !Number.isFinite(expires) ||
        expires <= now()
      )
        throw new ConnectionError("Your Tradovate session expired. Sign in again.", 401);
      return { token: data.accessToken, environment: target, expires };
    } catch (error) {
      throw error instanceof ConnectionError
        ? error
        : new ConnectionError("Tradovate is unavailable. Please try again.", 502);
    }
  };
  return {
    async status() {
      const value = await store.read("tradovate"),
        env = await environment();
      if (disabled(value))
        return { configured: true, connected: false, environment: null, source: "none" as const };
      if (value) {
        const saved = await read();
        return {
          configured: true,
          connected: !!saved && saved.expires > now(),
          environment: saved?.environment ?? null,
          source: "browser" as const,
        };
      }
      return {
        configured: true,
        connected: !!env.TRADOVATE_ACCESS_TOKEN,
        environment:
          env.TRADOVATE_ENVIRONMENT === "demo"
            ? ("demo" as const)
            : env.TRADOVATE_ENVIRONMENT === "live"
              ? ("live" as const)
              : null,
        source: env.TRADOVATE_ACCESS_TOKEN ? ("server" as const) : ("none" as const),
      };
    },
    async connect(token: string, target: "demo" | "live") {
      if (!/^[A-Za-z0-9._~-]{30,4096}$/.test(token))
        throw new ConnectionError("Tradovate did not return a valid session.");
      const version = ++generation;
      const saved = await renew(token, target);
      let accounts: unknown;
      try {
        const response = await request(`https://${target}.tradovateapi.com/v1/account/list`, {
          headers: { Authorization: `Bearer ${saved.token}` },
          redirect: "error",
          signal: AbortSignal.timeout(15_000),
        });
        if (!response.ok)
          throw new ConnectionError(
            "This session does not allow account access. Check your Tradovate permissions and selected environment.",
            403,
          );
        accounts = await response.json();
      } catch (error) {
        throw error instanceof ConnectionError
          ? error
          : new ConnectionError("Could not verify your Tradovate accounts.", 502);
      }
      if (!Array.isArray(accounts) || !accounts.length)
        throw new ConnectionError("No Tradovate accounts are available in this environment.", 403);
      return serial(async () => {
        if (version !== generation)
          throw new ConnectionError("The account connection changed. Please retry.", 409);
        await store.write("tradovate", saved);
        return { connected: true };
      });
    },
    async credentials(): Promise<Saved | null> {
      const version = generation,
        value = await read();
      if (!value) return null;
      if (value.expires > now() + 300_000) return value;
      if (value.expires <= now())
        throw new ConnectionError(
          "Your Tradovate session expired. Reconnect in Trading settings.",
          401,
        );
      if (renewal) return renewal;
      renewal = (async () => {
        const next = await renew(value.token, value.environment);
        return serial(async () => {
          if (version !== generation)
            throw new ConnectionError("The account connection changed. Please retry.", 409);
          await store.write("tradovate", next);
          return next;
        });
      })().finally(() => {
        renewal = null;
      });
      return renewal;
    },
    async disconnect() {
      generation++;
      await serial(() => store.write("tradovate", { disconnected: true }));
      return { disconnected: true };
    },
  };
}
export const tradovateConnection = createTradovateConnection();
