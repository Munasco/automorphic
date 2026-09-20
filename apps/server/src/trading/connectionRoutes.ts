// @effect-diagnostics globalTimers:off - SSE heartbeat lifetime is tied to response cancellation.
import * as Schema from "effect/Schema";
import { TradingConnectionCommand } from "@t3tools/contracts";
import { ConnectionError } from "./connectionSecrets.ts";
import { tradovateConnection } from "./tradovateConnection.ts";
import { telegramConnection } from "./telegramDriver.ts";

export async function readConnectionRoute(url: URL): Promise<Response | null> {
  const json = (data: unknown) => Response.json(data, { headers: { "Cache-Control": "no-store" } });
  if (url.pathname === "/api/trading/connections")
    return json({
      tradovate: await tradovateConnection.status(),
      telegram: await telegramConnection.status(),
      rithmic: {
        available: false,
        reason:
          "Rithmic support requires developer access and a verified integration. It is not connected yet.",
      },
    });
  if (url.pathname === "/api/trading/telegram/channels")
    return json(await telegramConnection.channels());
  if (url.pathname === "/api/trading/telegram/messages")
    return json(await telegramConnection.messages(url.searchParams.get("channelId") ?? ""));
  if (url.pathname === "/api/trading/telegram/events") {
    const selected = (url.searchParams.get("channels") ?? "").split(",").filter(Boolean);
    if (selected.length > 100 || selected.some((id) => !/^\d{1,20}$/.test(id)))
      throw new ConnectionError("Choose valid Telegram channels.");
    const available = new Set((await telegramConnection.channels()).map((c) => c.id));
    const watched = new Set(selected.filter((id) => available.has(id)));
    const encoder = new TextEncoder();
    let stop: (() => void) | undefined,
      heartbeat: ReturnType<typeof setInterval> | undefined,
      cancelled = false;
    const cleanup = () => {
      cancelled = true;
      stop?.();
      if (heartbeat) clearInterval(heartbeat);
    };
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (text: string) => {
          if (cancelled) return;
          if ((controller.desiredSize ?? 0) <= 0) {
            if (!cancelled) {
              cleanup();
              controller.close();
            }
            return;
          }
          controller.enqueue(encoder.encode(text));
        };
        try {
          stop = await telegramConnection.subscribe((message) => {
            if (cancelled) return;
            if (!message) {
              send("event: disconnected\ndata: {}\n\n");
              if (!cancelled) {
                cleanup();
                controller.close();
              }
              return;
            }
            if (watched.has(message.channelId)) send(`data: ${JSON.stringify(message)}\n\n`);
          });
          if (cancelled) {
            stop();
            return;
          }
          send(": connected\n\n");
          heartbeat = setInterval(() => send(": heartbeat\n\n"), 20_000);
        } catch (error) {
          cleanup();
          controller.error(error);
        }
      },
      cancel: cleanup,
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-store",
        "X-Accel-Buffering": "no",
      },
    });
  }
  return null;
}
export async function writeConnectionRoute(owner: string, body: unknown) {
  let command: TradingConnectionCommand;
  try {
    command = Schema.decodeUnknownSync(TradingConnectionCommand)(body);
  } catch {
    throw new ConnectionError("Invalid connection request.");
  }
  switch (command.action) {
    case "tradovate.connect":
      return tradovateConnection.connect(command.token, command.environment);
    case "tradovate.disconnect":
      return tradovateConnection.disconnect();
    case "telegram.start":
      return telegramConnection.start(owner, command.phone);
    case "telegram.configure":
      return telegramConnection.configure(command.apiId, command.apiHash);
    case "telegram.code":
      return telegramConnection.verify(owner, command.challenge, command.code, false);
    case "telegram.password":
      return telegramConnection.verify(owner, command.challenge, command.password, true);
    case "telegram.disconnect":
      return telegramConnection.disconnect();
  }
}
