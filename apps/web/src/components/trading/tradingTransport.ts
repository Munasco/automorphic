import { readDesktopPrimaryBearerToken } from "../../environments/primary/desktopAuth";
import { resolvePrimaryEnvironmentHttpUrl } from "../../environments/primary/target";

/** Use the same backend target and desktop session as the rest of the application. */
export const tradingFetch: typeof fetch = async (input, init) => {
  const endpoint =
    typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!endpoint.startsWith("/api/trading/")) throw Error("Invalid trading endpoint.");
  const url = new URL(endpoint, resolvePrimaryEnvironmentHttpUrl("/")).toString();
  const headers = new Headers(init?.headers);
  const bearer = await readDesktopPrimaryBearerToken();
  if (bearer) headers.set("Authorization", `Bearer ${bearer}`);
  const sameOriginBrowser =
    typeof window !== "undefined" &&
    !window.desktopBridge &&
    new URL(url).origin === window.location.origin;
  return globalThis.fetch(url, {
    ...init,
    headers,
    credentials: sameOriginBrowser ? "include" : "omit",
  });
};

export type TradingStreamFailure =
  | { kind: "http"; status: number }
  | { kind: "network" | "closed" | "invalid-response" };

/** Fetch-based SSE supports the desktop bearer header, unlike browser EventSource. */
export function openTradingStream(
  endpoint: string,
  callbacks: {
    onMessage: (data: string) => void;
    onError: (failure?: TradingStreamFailure) => void;
  },
  request: typeof fetch = tradingFetch,
) {
  const abort = new AbortController();
  void (async () => {
    try {
      const response = await request(endpoint, {
        headers: { Accept: "text/event-stream" },
        signal: abort.signal,
      });
      if (!response.ok) {
        // Preserve status only: broker/proxy HTML can contain internal details and is not UI data.
        await response.body?.cancel().catch(() => undefined);
        if (!abort.signal.aborted) callbacks.onError({ kind: "http", status: response.status });
        return;
      }
      if (!response.body) {
        if (!abort.signal.aborted) callbacks.onError({ kind: "invalid-response" });
        return;
      }
      const reader = response.body.getReader();
      const cancelReader = () => void reader.cancel().catch(() => undefined);
      abort.signal.addEventListener("abort", cancelReader, { once: true });
      const decoder = new TextDecoder();
      let buffer = "";
      try {
        while (!abort.signal.aborted) {
          const chunk = await reader.read();
          if (chunk.done) break;
          buffer += decoder.decode(chunk.value, { stream: true });
          let boundary: RegExpExecArray | null;
          while ((boundary = /\r?\n\r?\n/.exec(buffer))) {
            const event = buffer.slice(0, boundary.index);
            buffer = buffer.slice(boundary.index + boundary[0].length);
            const lines = event.split(/\r?\n/);
            const eventType = lines
              .find((line) => line.startsWith("event:"))
              ?.slice(6)
              .trim();
            const data = lines
              .filter((line) => line.startsWith("data:"))
              .map((line) => line.slice(5).replace(/^ /, ""));
            if (data.length && (!eventType || eventType === "message") && !abort.signal.aborted)
              callbacks.onMessage(data.join("\n"));
          }
          if (buffer.length > 8 * 1024 * 1024) throw Error("Trading stream event too large.");
        }
      } finally {
        abort.signal.removeEventListener("abort", cancelReader);
        await reader.cancel().catch(() => undefined);
        reader.releaseLock();
      }
      if (!abort.signal.aborted) callbacks.onError({ kind: "closed" });
    } catch {
      if (!abort.signal.aborted) callbacks.onError({ kind: "network" });
    }
  })();
  return { close: () => abort.abort() };
}
