import { afterEach, expect, it, vi } from "vite-plus/test";
import type { TelegramChannelMessage } from "@t3tools/contracts";

const telegram = vi.hoisted(() => ({ status: vi.fn(), channels: vi.fn(), subscribe: vi.fn() }));
const tradovate = vi.hoisted(() => ({ status: vi.fn() }));
vi.mock("./telegramDriver.ts", () => ({ telegramConnection: telegram }));
vi.mock("./tradovateConnection.ts", () => ({ tradovateConnection: tradovate }));
import { readConnectionRoute } from "./connectionRoutes.ts";

afterEach(() => vi.clearAllMocks());

it("loads Telegram independently when Tradovate is unavailable", async () => {
  tradovate.status.mockImplementation(() => new Promise(() => {}));
  telegram.status.mockResolvedValue({ configured: true, connected: true, name: "Trader" });
  const response = await readConnectionRoute(
    new URL("http://localhost/api/trading/connections/telegram"),
  );
  expect(await response!.json()).toEqual({ configured: true, connected: true, name: "Trader" });
  expect(tradovate.status).not.toHaveBeenCalled();
});
it("loads broker status independently when Telegram is unavailable", async () => {
  telegram.status.mockImplementation(() => new Promise(() => {}));
  tradovate.status.mockResolvedValue({ connected: false });
  const response = await readConnectionRoute(
    new URL("http://localhost/api/trading/connections/tradovate"),
  );
  expect(await response!.json()).toEqual({ connected: false });
  expect(telegram.status).not.toHaveBeenCalled();
});

it("opens an unbuffered Telegram stream, filters posts and releases the subscription on cancel", async () => {
  telegram.channels.mockResolvedValue([{ id: "1", title: "Trading room" }]);
  let emit!: (message: TelegramChannelMessage | null) => void;
  const stop = vi.fn();
  telegram.subscribe.mockImplementation(async (callback) => {
    emit = callback;
    return stop;
  });
  const response = await readConnectionRoute(
    new URL("http://localhost/api/trading/telegram/events?channels=1"),
  );
  expect(response?.headers.get("cache-control")).toContain("no-transform");
  const reader = response!.body!.getReader();
  const decode = (chunk: Awaited<ReturnType<typeof reader.read>>) =>
    new TextDecoder().decode(chunk.value);
  try {
    expect(decode(await reader.read())).toBe(": connected\n\n");
    const message = { id: 10, channelId: "1", text: "New setup", date: 123, media: false };
    const next = reader.read();
    emit({ ...message, channelId: "2" });
    emit(message);
    expect(decode(await next)).toBe(`data: ${JSON.stringify(message)}\n\n`);
  } finally {
    await reader.cancel();
  }
  expect(stop).toHaveBeenCalledOnce();
});
