// @effect-diagnostics globalTimers:off -- Quote socket timers live and stop with the response stream.
import { contracts, credentials, normalizeQuote } from "./marketData.ts";

const roots = ["MGC", "MNQ", "GC", "NQ"] as const;
type WatchRoot = (typeof roots)[number];
export function parseWatchlistRoots(value: string): WatchRoot[] {
  const values = [...new Set(value.split(","))];
  if (!values.length || values.some((item) => !roots.includes(item as WatchRoot)))
    throw new Error("Choose MGC, MNQ, GC or NQ for the watchlist.");
  return values as WatchRoot[];
}

export function createWatchlistResponse(
  entries: { root: WatchRoot; name: string; id: number }[],
  token: string,
  createSocket: () => WebSocket = () => new WebSocket("wss://md.tradovateapi.com/v1/websocket"),
) {
  let dispose = () => {};
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const ws = createSocket();
      const encoder = new TextEncoder();
      let ended = false;
      let heartbeat: ReturnType<typeof setInterval> | undefined;
      const emit = (data: object) => {
        if (!ended) controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };
      const finish = () => {
        if (ended) return;
        ended = true;
        clearInterval(heartbeat);
        clearTimeout(timeout);
        clearTimeout(rotate);
        if (ws.readyState === 1) {
          entries.forEach((entry, index) =>
            ws.send(
              `md/unsubscribeQuote\n${100 + index}\n\n${JSON.stringify({ symbol: entry.name })}`,
            ),
          );
        }
        ws.close();
        try {
          controller.close();
        } catch {
          /* Reader already canceled. */
        }
      };
      dispose = finish;
      const timeout = setTimeout(finish, 20_000);
      const rotate = setTimeout(finish, 45 * 60_000);
      emit({ type: "contracts", contracts: entries });
      ws.addEventListener("message", (event) => {
        const raw = String(event.data);
        if (raw === "o") {
          ws.send(`authorize\n1\n\n${token}`);
          heartbeat = setInterval(() => {
            if (ws.readyState === 1) ws.send("[]");
          }, 2500);
          return;
        }
        if (!raw.startsWith("a")) return;
        let messages;
        try {
          messages = JSON.parse(raw.slice(1));
        } catch {
          return;
        }
        if (!Array.isArray(messages)) return;
        for (const message of messages) {
          if (!message || typeof message !== "object") continue;
          if (message.i === 1) {
            if (message.s !== 200) {
              finish();
              return;
            }
            entries.forEach((entry, index) =>
              ws.send(
                `md/subscribeQuote\n${10 + index}\n\n${JSON.stringify({ symbol: entry.name })}`,
              ),
            );
          } else if (
            Number.isInteger(message.i) &&
            message.i >= 10 &&
            message.i < 10 + entries.length
          ) {
            if (message.s !== 200 || message.d?.errorText) {
              emit({ type: "unavailable", root: entries[message.i - 10]!.root });
            }
          } else if (message.e === "md" && Array.isArray(message.d?.quotes)) {
            for (const rawQuote of message.d.quotes) {
              const entry = entries.find((item) => item.id === rawQuote?.contractId);
              if (!entry) continue;
              const quote = normalizeQuote(rawQuote, entry.name, entry.id);
              if (!quote) continue;
              clearTimeout(timeout);
              emit({ type: "quote", root: entry.root, quote });
            }
          }
        }
      });
      ws.addEventListener("close", finish);
      ws.addEventListener("error", finish);
    },
    cancel() {
      dispose();
    },
  });
  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function watchlistStream(value: string) {
  const selected = parseWatchlistRoots(value);
  const session = await credentials();
  const resolved = await Promise.all(
    selected.map(async (root) => ({ root, contract: (await contracts(root))[0] })),
  );
  const entries = resolved.flatMap(({ root, contract }) =>
    contract ? [{ root, ...contract }] : [],
  );
  if (!entries.length) throw new Error("No active contracts available.");
  return createWatchlistResponse(entries, session.token);
}
