// @effect-diagnostics nodeBuiltinImport:off globalFetch:off globalTimers:off globalDate:off - Bounded native Tradovate transport adapter.
import * as NodeCrypto from "node:crypto";
import { credentials, normalizeBars, type Candle } from "./marketData.ts";
import { resolveChartInterval } from "./chartInterval.ts";

export interface HistoryRequest {
  symbol: string;
  interval: number;
  unit: "second" | "minute" | "day";
  start: string;
  end: string;
  limit?: number;
  cursor?: string;
}

export function historyWindow(input: HistoryRequest) {
  if (!/^[A-Za-z0-9@._-]{1,40}$/.test(input.symbol)) throw new Error("Invalid contract symbol.");
  const start = Date.parse(input.start);
  const end = Date.parse(input.end);
  const limit = input.limit ?? 500;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end)
    throw new Error("Use an ISO start before end; end is exclusive.");
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000)
    throw new Error("Page size must be between 1 and 1000 bars.");
  const { chartDescription } = resolveChartInterval(input.interval, input.unit);
  const fingerprint = NodeCrypto.createHash("sha256")
    .update(JSON.stringify([input.symbol, input.interval, input.unit, start, end, limit]))
    .digest("hex");
  let before = end;
  if (input.cursor) {
    if (input.cursor.length > 512) throw new Error("Invalid history cursor.");
    let value: unknown;
    try {
      value = JSON.parse(Buffer.from(input.cursor, "base64url").toString());
    } catch {
      throw new Error("Invalid history cursor.");
    }
    if (
      !value ||
      typeof value !== "object" ||
      !("key" in value) ||
      value.key !== fingerprint ||
      !("before" in value) ||
      typeof value.before !== "number" ||
      !Number.isFinite(value.before) ||
      value.before <= start ||
      value.before > end
    )
      throw new Error("Cursor does not belong to this history request.");
    before = value.before;
  }
  return { start, end, before, limit, chartDescription, fingerprint };
}

export function historyPage(input: HistoryRequest, rawBars: readonly Candle[]) {
  const window = historyWindow(input);
  const unique = new Map(
    rawBars
      .filter((bar) => bar.time * 1000 >= window.start && bar.time * 1000 < window.before)
      .map((bar) => [bar.time, bar]),
  );
  const bars = [...unique.values()].sort((a, b) => a.time - b.time).slice(-window.limit);
  const earliest = bars[0]?.time;
  return {
    symbol: input.symbol,
    interval: input.interval,
    unit: input.unit,
    source: "Tradovate",
    series: input.symbol.startsWith("@") ? "broker-continuous" : "contract",
    order: "ascending",
    paginationDirection: "backward",
    requestedStart: new Date(window.start).toISOString(),
    requestedEnd: new Date(window.end).toISOString(),
    bars,
    nextCursor:
      earliest !== undefined && earliest * 1000 > window.start
        ? Buffer.from(
            JSON.stringify({ key: window.fingerprint, before: earliest * 1000 }),
          ).toString("base64url")
        : null,
    coverage: {
      firstReturned: earliest === undefined ? null : new Date(earliest * 1000).toISOString(),
      lastReturned: bars.length ? new Date(bars[bars.length - 1]!.time * 1000).toISOString() : null,
      completeRequestedRange: false,
      note: "Observed bars only. Empty pages may indicate a session gap, expiry, retention limit or missing market-data access. No continuous-contract stitching is applied.",
    },
  };
}

export async function tradovateRead(path: string) {
  const session = await credentials();
  const response = await fetch(`https://${session.environment}.tradovateapi.com/v1/${path}`, {
    headers: { Authorization: `Bearer ${session.token}` },
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok)
    throw new Error(
      `Tradovate returned HTTP ${response.status}. Check the connected account's API permissions.`,
    );
  const body: unknown = await response.json();
  return body;
}

export async function searchInstruments(search: string, limit = 30) {
  if (!search.trim() || search.length > 80 || !Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new Error("Enter a symbol or product name and a limit between 1 and 100.");
  const body = await tradovateRead(`contract/suggest?t=${encodeURIComponent(search)}&l=${limit}`);
  if (!Array.isArray(body)) throw new Error("Tradovate returned an invalid contract list.");
  return {
    instruments: body,
    access:
      "Catalog matches; market-data entitlement is checked by Tradovate when history is requested.",
  };
}

export async function listProducts(offset = 0, limit = 50) {
  if (
    !Number.isInteger(offset) ||
    offset < 0 ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100
  )
    throw new Error("Invalid product page.");
  const body = await tradovateRead("product/list");
  if (!Array.isArray(body)) throw new Error("Tradovate returned an invalid product catalog.");
  return {
    products: body.slice(offset, offset + limit),
    nextOffset: offset + limit < body.length ? offset + limit : null,
    total: body.length,
    access: "Catalog visibility does not guarantee market-data or order permissions.",
  };
}

/** A finite historical subscription. Never silently return a partial response on timeout. */
export async function getHistoricalBars(input: HistoryRequest) {
  const window = historyWindow(input);
  const session = await credentials();
  const bars = await new Promise<Candle[]>((resolve, reject) => {
    const socket = new WebSocket("wss://md.tradovateapi.com/v1/websocket");
    let historicalId: number | undefined;
    let realtimeId: number | undefined;
    let done = false;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    const collected: Candle[] = [];
    const finish = (error?: Error) => {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      clearInterval(heartbeat);
      if (socket.readyState === WebSocket.OPEN && realtimeId !== undefined)
        socket.send(`md/cancelChart\n3\n\n${JSON.stringify({ subscriptionId: realtimeId })}`);
      socket.close();
      if (error) reject(error);
      else resolve(collected);
    };
    const timeout = setTimeout(
      () =>
        finish(
          new Error(
            "Tradovate history timed out before the end of history. Retry a smaller date window.",
          ),
        ),
      25_000,
    );
    socket.addEventListener("error", () =>
      finish(new Error("Tradovate history connection failed.")),
    );
    socket.addEventListener("close", () =>
      finish(new Error("Tradovate closed the connection before history completed.")),
    );
    socket.addEventListener("message", (event) => {
      const raw = String(event.data);
      if (raw === "o") {
        socket.send(`authorize\n1\n\n${session.token}`);
        heartbeat = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) socket.send("[]");
        }, 2500);
        return;
      }
      if (!raw.startsWith("a")) return;
      try {
        const messages = JSON.parse(raw.slice(1));
        if (!Array.isArray(messages)) return;
        for (const message of messages) {
          if (done) return;
          if (message.i === 1) {
            if (message.s !== 200)
              return finish(new Error("Tradovate rejected market-data authorization."));
            socket.send(
              `md/getChart\n2\n\n${JSON.stringify({
                symbol: input.symbol,
                chartDescription: window.chartDescription,
                timeRange: {
                  asFarAsTimestamp: new Date(window.start).toISOString(),
                  closestTimestamp: new Date(window.before - 1).toISOString(),
                  asMuchAsElements: window.limit,
                },
              })}`,
            );
          } else if (message.i === 2) {
            if (
              message.s !== 200 ||
              message.d?.errorText ||
              !Number.isSafeInteger(message.d?.historicalId)
            )
              return finish(
                new Error(
                  "Tradovate rejected history for this symbol. Check contract and market-data entitlement.",
                ),
              );
            historicalId = message.d.historicalId;
            realtimeId = message.d.realtimeId;
          } else if (message.e === "chart" && Array.isArray(message.d?.charts)) {
            for (const chart of message.d.charts) {
              if (historicalId === undefined || chart?.id !== historicalId) continue;
              collected.push(...normalizeBars(chart.bars));
              if (collected.length > 10000)
                return finish(new Error("Tradovate exceeded the history page limit."));
              if (chart.eoh) return finish();
            }
          }
        }
      } catch {
        finish(new Error("Tradovate sent malformed history data."));
      }
    });
  });
  return historyPage(input, bars);
}
