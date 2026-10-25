import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { Api, TelegramClient } from "teleproto";
import { PhoneMigrateError, FloodWaitError } from "teleproto/errors/index.js";
import type { RequestState } from "teleproto/network/RequestState.js";
import { telegramDriver } from "./telegramDriver.ts";

afterEach(() => vi.restoreAllMocks());

function transport(onRequest: (state: RequestState) => void) {
  vi.spyOn(TelegramClient.prototype, "connect").mockImplementation(
    async function (this: TelegramClient) {
      Object.defineProperty(this, "_sender", {
        configurable: true,
        value: { addStateToQueue: onRequest, userDisconnected: false },
      });
      this._connectedDeferred.resolve();
      return true;
    },
  );
  vi.spyOn(TelegramClient.prototype, "isUserAuthorized").mockResolvedValue(false);
  return vi.spyOn(TelegramClient.prototype, "_switchDC").mockResolvedValue(true);
}

describe("Telegram login transport", () => {
  it("sends the code after Telegram redirects a new session to its home data center", async () => {
    let requests = 0;
    const migrate = transport((state) => {
      requests++;
      if (requests === 1) {
        state.reject(new PhoneMigrateError({ request: state.request, capture: 1 }));
      } else {
        state.resolve(
          new Api.auth.SentCode({
            type: new Api.auth.SentCodeTypeApp({ length: 5 }),
            phoneCodeHash: "test-code-hash",
          }),
        );
      }
    });
    const driver = await telegramDriver(123, "a".repeat(32), "");
    await driver.connect();
    await expect(driver.sendCode("+14165551234")).resolves.toBe("test-code-hash");
    expect(migrate).toHaveBeenCalledWith(1);
    expect(requests).toBe(2);
  });

  it("does not retry a rate-limited code request", async () => {
    let requests = 0;
    transport((state) => {
      requests++;
      state.reject(new FloodWaitError({ request: state.request, capture: 60 }));
    });
    const driver = await telegramDriver(123, "a".repeat(32), "");
    await driver.connect();
    await expect(driver.sendCode("+14165551234")).rejects.toBeInstanceOf(FloodWaitError);
    expect(requests).toBe(1);
  });
});
