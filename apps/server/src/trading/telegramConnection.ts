// @effect-diagnostics nodeBuiltinImport:off globalDate:off globalTimers:off - Telegram connection lifecycle adapter.
import * as NodeCrypto from "node:crypto";
import * as Schema from "effect/Schema";
import type { TelegramChannel, TelegramChannelMessage } from "@t3tools/contracts";
import { bundledTelegramApp } from "./telegramAppConfig.ts";
import {
  ConnectionError,
  connectionSecrets,
  tradingConnectionEnvironment,
  type ConnectionSecrets,
} from "./connectionSecrets.ts";

export interface TelegramDriver {
  connect(): Promise<void>;
  user(): Promise<string>;
  sendCode(phone: string): Promise<string>;
  signIn(phone: string, hash: string, code: string): Promise<void>;
  password(value: string): Promise<void>;
  session(): string;
  channels(): Promise<TelegramChannel[]>;
  messages(id: string): Promise<TelegramChannelMessage[]>;
  listen(callback: (message: TelegramChannelMessage) => void): void;
  close(logout?: boolean): Promise<void>;
}
const Saved = Schema.Struct({ session: Schema.String, name: Schema.String });
const AppConfig = Schema.Struct({ id: Schema.Finite, hash: Schema.String });
const validConfig = (id: number, hash: string | undefined) =>
  Number.isSafeInteger(id) && id > 0 && !!hash && /^[a-f\d]{32}$/i.test(hash);
type Pending = {
  version: number;
  timer: ReturnType<typeof setTimeout>;
  owner: string;
  phone: string;
  hash: string;
  driver: TelegramDriver;
  expires: number;
  attempts: number;
  password: boolean;
  busy: boolean;
};
export function telegramError(error: unknown): ConnectionError {
  const code =
    error && typeof error === "object" && "errorMessage" in error ? String(error.errorMessage) : "";
  if (code === "PHONE_CODE_INVALID")
    return new ConnectionError("That Telegram code is incorrect. Try again.");
  if (code === "PHONE_CODE_EXPIRED")
    return new ConnectionError("Your Telegram code expired. Start sign-in again.");
  if (code === "PHONE_NUMBER_INVALID")
    return new ConnectionError("Enter your phone number with its country code.");
  if (code === "PASSWORD_HASH_INVALID")
    return new ConnectionError("That Telegram password is incorrect. Try again.");
  if (code === "API_ID_INVALID" || code === "API_ID_PUBLISHED_FLOOD")
    return new ConnectionError("Check your API ID and API hash in Telegram app settings.");
  if (code.startsWith("FLOOD_WAIT"))
    return new ConnectionError(
      "Telegram has limited sign-in attempts. Wait before trying again.",
      429,
    );
  if (code === "SESSION_PASSWORD_NEEDED")
    return new ConnectionError("Telegram needs your two-step verification password.", 428);
  if (error instanceof ConnectionError) return error;
  return new ConnectionError(
    "Telegram could not complete this request. Check your connection and try again.",
    502,
  );
}
export function createTelegramConnection({
  store = connectionSecrets(),
  environment = tradingConnectionEnvironment,
  driver,
  now = Date.now,
}: {
  store?: ConnectionSecrets;
  environment?: () => Promise<NodeJS.ProcessEnv>;
  driver: (id: number, hash: string, session: string) => Promise<TelegramDriver>;
  now?: () => number;
}) {
  let current: TelegramDriver | null = null,
    name: string | null = null,
    opening: Promise<TelegramDriver> | null = null;
  let generation = 0;
  let mutations = Promise.resolve();
  const serial = <T>(operation: () => Promise<T>): Promise<T> => {
    const task = mutations.then(operation);
    mutations = task.then(
      () => {},
      () => {},
    );
    return task;
  };
  const pending = new Map<string, Pending>();
  const listeners = new Set<(message: TelegramChannelMessage | null) => void>();
  const config = async () => {
    const env = await environment(),
      id = Number(env.TELEGRAM_API_ID ?? env.AUTOMORPHIC_TELEGRAM_API_ID),
      hash = (env.TELEGRAM_API_HASH ?? env.AUTOMORPHIC_TELEGRAM_API_HASH)?.trim();
    if (validConfig(id, hash) && hash) return { id, hash };
    const saved = await store.read("telegram-app");
    if (!saved) return bundledTelegramApp();
    try {
      const app = Schema.decodeUnknownSync(AppConfig)(saved);
      return validConfig(app.id, app.hash) ? app : bundledTelegramApp();
    } catch {
      return bundledTelegramApp();
    }
  };
  const attach = (client: TelegramDriver) =>
    client.listen((message) => {
      if (client === current) for (const listener of listeners) listener(message);
    });
  const client = async () => {
    if (current) return current;
    if (opening) return opening;
    const version = generation;
    opening = (async () => {
      const conf = await config();
      if (!conf)
        throw new ConnectionError(
          "Telegram sign-in has not been enabled for this installation yet.",
          503,
        );
      const value = await store.read("telegram");
      if (!value) throw new ConnectionError("Connect your Telegram account to see channels.", 401);
      let saved: typeof Saved.Type;
      try {
        saved = Schema.decodeUnknownSync(Saved)(value);
      } catch {
        throw new ConnectionError("Reconnect your Telegram account.", 401);
      }
      const next = await driver(conf.id, conf.hash, saved.session);
      try {
        await next.connect();
        const display = await next.user();
        if (version !== generation)
          throw new ConnectionError("The Telegram connection changed. Try again.", 409);
        current = next;
        name = display;
        attach(next);
        return next;
      } catch (error) {
        await next.close().catch(() => {});
        throw telegramError(error);
      }
    })().finally(() => {
      opening = null;
    });
    return opening;
  };
  const prune = async () => {
    for (const [id, p] of pending)
      if (p.expires <= now()) {
        pending.delete(id);
        clearTimeout(p.timer);
        await p.driver.close().catch(() => {});
      }
  };
  const finish = async (challenge: string, p: Pending) => {
    const display = await p.driver.user();
    return serial(async () => {
      if (p.version !== generation || pending.get(challenge) !== p || p.expires <= now())
        throw new ConnectionError("This Telegram sign-in expired. Start again.", 403);
      await store.write("telegram", { session: p.driver.session(), name: display });
      if (p.version !== generation)
        throw new ConnectionError("The Telegram connection changed. Try again.", 409);
      const previous = current;
      generation++;
      current = p.driver;
      name = display;
      attach(p.driver);
      pending.delete(challenge);
      clearTimeout(p.timer);
      if (previous && previous !== current) await previous.close().catch(() => {});
      return { connected: true, name: display };
    });
  };
  return {
    async configure(id: number, hash: string) {
      hash = hash.trim();
      if (!validConfig(id, hash))
        throw new ConnectionError("Enter the API ID and 32-character API hash from Telegram.");
      return serial(async () => {
        const env = await environment();
        const envId = Number(env.TELEGRAM_API_ID ?? env.AUTOMORPHIC_TELEGRAM_API_ID);
        const envHash = (env.TELEGRAM_API_HASH ?? env.AUTOMORPHIC_TELEGRAM_API_HASH)?.trim();
        if (validConfig(envId, envHash))
          throw new ConnectionError("Telegram app settings are managed by this installation.", 409);
        if (current || opening || pending.size || (await store.read("telegram")))
          throw new ConnectionError("Disconnect Telegram before changing its app settings.", 409);
        await store.write("telegram-app", { id, hash });
        return { configured: true };
      });
    },
    async status() {
      const conf = await config();
      if (!conf) return { configured: false, connected: false, name: null };
      const saved = await store.read("telegram");
      if (!current && saved) {
        try {
          await client();
        } catch {
          return { configured: true, connected: false, name: null };
        }
      }
      return { configured: true, connected: current !== null, name };
    },
    async start(owner: string, phone: string) {
      if (!/^\+[1-9]\d{6,14}$/.test(phone))
        throw new ConnectionError(
          "Enter your phone number with its country code, such as +14165551234.",
        );
      await prune();
      for (const [id, p] of pending)
        if (p.owner === owner) {
          pending.delete(id);
          clearTimeout(p.timer);
          await p.driver.close().catch(() => {});
        }
      if (pending.size >= 8)
        throw new ConnectionError("Too many sign-in attempts. Try again shortly.", 429);
      const conf = await config();
      if (!conf)
        throw new ConnectionError(
          "Telegram sign-in has not been enabled for this installation yet.",
          503,
        );
      const version = generation;
      const next = await driver(conf.id, conf.hash, "");
      try {
        await next.connect();
        const hash = await next.sendCode(phone),
          challenge = NodeCrypto.randomBytes(24).toString("hex");
        if (version !== generation)
          throw new ConnectionError("The Telegram connection changed. Try again.", 409);
        const timer = setTimeout(() => {
          const item = pending.get(challenge);
          if (item) {
            pending.delete(challenge);
            void item.driver.close().catch(() => {});
          }
        }, 300_000);
        timer.unref();
        pending.set(challenge, {
          version,
          timer,
          owner,
          phone,
          hash,
          driver: next,
          expires: now() + 300_000,
          attempts: 0,
          password: false,
          busy: false,
        });
        return { challenge, step: "code" as const };
      } catch (error) {
        await next.close().catch(() => {});
        throw telegramError(error);
      }
    },
    async verify(owner: string, challenge: string, value: string, password: boolean) {
      await prune();
      const p = pending.get(challenge);
      if (!p || p.owner !== owner)
        throw new ConnectionError("This Telegram sign-in expired. Start again.", 403);
      if (p.busy) throw new ConnectionError("A sign-in check is already running.", 409);
      if (
        password !== p.password ||
        !value ||
        value.length > 256 ||
        (!password && !/^\d{4,8}$/.test(value))
      )
        throw new ConnectionError(
          password
            ? "Enter your Telegram two-step verification password."
            : "Enter the code Telegram sent you.",
        );
      if (++p.attempts > 5) {
        pending.delete(challenge);
        clearTimeout(p.timer);
        await p.driver.close();
        throw new ConnectionError("Too many attempts. Start sign-in again.", 429);
      }
      p.busy = true;
      try {
        if (password) await p.driver.password(value);
        else await p.driver.signIn(p.phone, p.hash, value);
        return await finish(challenge, p);
      } catch (error) {
        const failure = telegramError(error);
        if (failure.status === 428) {
          p.password = true;
          return { connected: false, step: "password" as const, challenge };
        }
        throw failure;
      } finally {
        p.busy = false;
      }
    },
    async channels() {
      try {
        return await (await client()).channels();
      } catch (error) {
        throw telegramError(error);
      }
    },
    async messages(id: string) {
      if (!/^\d{1,20}$/.test(id)) throw new ConnectionError("Choose a Telegram channel.");
      try {
        return await (await client()).messages(id);
      } catch (error) {
        throw telegramError(error);
      }
    },
    async subscribe(callback: (message: TelegramChannelMessage | null) => void) {
      await client();
      listeners.add(callback);
      return () => {
        listeners.delete(callback);
      };
    },
    async disconnect() {
      generation++;
      const previous = current;
      current = null;
      name = null;
      const attempts = [...pending.values()];
      pending.clear();
      for (const p of attempts) {
        clearTimeout(p.timer);
        await p.driver.close().catch(() => {});
      }
      await serial(() => store.remove("telegram"));
      for (const listener of listeners) listener(null);
      listeners.clear();
      if (previous) await previous.close(true).catch(() => {});
      return { disconnected: true };
    },
  };
}
