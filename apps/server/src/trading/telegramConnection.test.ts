import { describe, it, expect, vi } from "vite-plus/test";
import { createTelegramConnection, type TelegramDriver } from "./telegramConnection.ts";
import type { ConnectionSecrets } from "./connectionSecrets.ts";
function fixture() {
  let saved: unknown = null,
    now = 1_000_000;
  const driver: TelegramDriver = {
    connect: async () => {},
    user: async () => "Tester",
    sendCode: async () => "code-hash",
    signIn: async () => {},
    password: async () => {},
    session: () => "private-session",
    channels: async () => [],
    messages: async () => [],
    listen: () => {},
    close: vi.fn(async () => {}),
  };
  const store: ConnectionSecrets = {
    read: async () => saved,
    write: async (_key, value) => {
      saved = value;
    },
    remove: async () => {
      saved = null;
    },
  };
  const c = createTelegramConnection({
    store,
    driver: async () => driver,
    environment: async () => ({
      AUTOMORPHIC_TELEGRAM_API_ID: "123",
      AUTOMORPHIC_TELEGRAM_API_HASH: "a".repeat(32),
    }),
    now: () => now,
  });
  return {
    c,
    driver,
    saved: () => saved,
    advance: () => {
      now += 300_001;
    },
  };
}
describe("Telegram sign-in", () => {
  it("binds the code to the initiating app session", async () => {
    const f = fixture(),
      attempt = await f.c.start("owner", "+14165551234");
    await expect(f.c.verify("other", attempt.challenge, "12345", false)).rejects.toThrow("expired");
    expect(f.saved()).toBeNull();
    await f.c.disconnect();
  });
  it("supports Telegram two-step verification without exposing its saved session", async () => {
    const f = fixture();
    f.driver.signIn = async () => {
      throw { errorMessage: "SESSION_PASSWORD_NEEDED" };
    };
    const a = await f.c.start("owner", "+14165551234");
    expect(await f.c.verify("owner", a.challenge, "12345", false)).toMatchObject({
      step: "password",
    });
    expect(await f.c.verify("owner", a.challenge, "secret-password", true)).toMatchObject({
      connected: true,
    });
    expect(JSON.stringify(await f.c.status())).not.toContain("private-session");
    await f.c.disconnect();
    expect(f.saved()).toBeNull();
  });
  it("expires sign-in codes and closes the temporary connection", async () => {
    const f = fixture(),
      a = await f.c.start("owner", "+14165551234");
    f.advance();
    await expect(f.c.verify("owner", a.challenge, "12345", false)).rejects.toThrow("expired");
    expect(f.driver.close).toHaveBeenCalled();
  });
  it("does not restore credentials after disconnect during sign-in", async () => {
    const f = fixture();
    let release!: () => void;
    f.driver.signIn = () =>
      new Promise((r) => {
        release = r;
      });
    const a = await f.c.start("owner", "+14165551234");
    const pending = f.c.verify("owner", a.challenge, "12345", false);
    await vi.waitFor(() => expect(release).toBeDefined());
    await f.c.disconnect();
    release();
    await expect(pending).rejects.toThrow("expired");
    expect(f.saved()).toBeNull();
  });
  it("has a clean unconfigured status without opening Telegram", async () => {
    const driver = vi.fn();
    const c = createTelegramConnection({
      driver,
      environment: async () => ({}),
      request: async () => new Response("Not found", { status: 404 }),
      store: {
        read: async () => null,
        write: async () => {},
        remove: async () => {},
      },
    });
    expect(await c.status()).toEqual({ configured: false, connected: false, name: null });
    expect(driver).not.toHaveBeenCalled();
  });
  it("loads app settings from Convex remote endpoint when unconfigured locally", async () => {
    const driver = vi.fn();
    const c = createTelegramConnection({
      driver,
      environment: async () => ({
        AUTOMORPHIC_CONVEX_SITE_URL: "https://mock.convex.site",
      }),
      request: async (input) => {
        expect(input.toString()).toBe("https://mock.convex.site/telegram/app");
        return new Response(JSON.stringify({ id: 98765, hash: "d".repeat(32) }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
      store: {
        read: async () => null,
        write: async () => {},
        remove: async () => {},
      },
    });
    expect(await c.status()).toEqual({ configured: true, connected: false, name: null });
    await expect(c.configure(12345, "e".repeat(32))).rejects.toThrow(
      "managed by this installation",
    );
    expect(driver).not.toHaveBeenCalled();
  });
  it("persists app setup privately and uses it for phone sign-in after a restart", async () => {
    const values = new Map<string, unknown>();
    const store: ConnectionSecrets = {
      read: async (key) => values.get(key) ?? null,
      write: async (key, value) => {
        values.set(key, value);
      },
      remove: async (key) => {
        values.delete(key);
      },
    };
    const f = fixture();
    const driver = vi.fn(async () => f.driver);
    const options = {
      store,
      driver,
      environment: async () => ({}),
      request: async () => new Response("Not found", { status: 404 }),
    };
    const first = createTelegramConnection(options);
    await expect(first.configure(0, "bad")).rejects.toThrow("API ID");
    expect(values.size).toBe(0);
    await first.configure(123, "b".repeat(32));
    const reopened = createTelegramConnection(options);
    expect(await reopened.status()).toEqual({ configured: true, connected: false, name: null });
    expect(driver).not.toHaveBeenCalled();
    const attempt = await reopened.start("owner", "+14165551234");
    expect(driver).toHaveBeenCalledWith(123, "b".repeat(32), "");
    await expect(reopened.configure(456, "c".repeat(32))).rejects.toThrow("Disconnect");
    await reopened.verify("owner", attempt.challenge, "12345", false);
    expect(JSON.stringify(await reopened.status())).not.toContain("bbbb");
    await reopened.disconnect();
    expect(values.has("telegram")).toBe(false);
    expect(values.has("telegram-app")).toBe(true);
  });
});
