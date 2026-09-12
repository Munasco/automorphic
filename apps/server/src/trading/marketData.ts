// @effect-diagnostics nodeBuiltinImport:off globalFetch:off globalTimers:off globalDate:off - Native WebSocket/ReadableStream adapter; its lifecycle is tied to the HTTP response.
import { activeCandidates, mostActiveContract, readContractActivity } from "./activeContract.ts";
import * as NodeFSP from "node:fs/promises";
import { resolveTradingEnvironmentFile, synchronizeTradingSession } from "./runtimeEnv.ts";
import * as NodeUtil from "node:util";
import * as NodeStreamWeb from "node:stream/web";

export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};
export function normalizeBars(bars: unknown): Candle[] {
  if (!Array.isArray(bars)) return [];
  const result = new Map<number, Candle>();
  for (const bar of bars) {
    if (!bar || typeof bar !== "object") continue;
    const time = Date.parse(bar.timestamp) / 1000;
    if (
      ![time, bar.open, bar.high, bar.low, bar.close].every(Number.isFinite) ||
      bar.high < bar.low
    )
      continue;
    result.set(time, {
      time,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: (Number(bar.upVolume) || 0) + (Number(bar.downVolume) || 0),
    });
  }
  return [...result.values()].sort((a, b) => a.time - b.time);
}

export function normalizeQuote(quote: unknown, symbol: string, contractId: number) {
  // Tradovate can batch quotes for multiple contracts in one market-data frame.
  // A requested display symbol alone is not evidence that a quote belongs to it.
  if (
    !Number.isSafeInteger(contractId) ||
    contractId <= 0 ||
    !quote ||
    typeof quote !== "object" ||
    !("contractId" in quote) ||
    quote.contractId !== contractId ||
    !("entries" in quote)
  )
    return null;
  const entries = quote.entries as Record<string, { price?: number; size?: number }>;
  if (!entries || typeof entries !== "object" || !Number.isFinite(entries.Trade?.price))
    return null;
  const finite = (value: unknown): number | undefined =>
    typeof value === "number" && Number.isFinite(value) ? value : undefined;
  return {
    symbol,
    last: entries.Trade!.price!,
    open: finite(entries.OpeningPrice?.price),
    high: finite(entries.HighPrice?.price),
    low: finite(entries.LowPrice?.price),
    volume: finite(entries.TotalTradeVolume?.size),
    timestamp:
      "timestamp" in quote &&
      typeof quote.timestamp === "string" &&
      Number.isFinite(Date.parse(quote.timestamp))
        ? quote.timestamp
        : undefined,
    source: "quote" as const,
  };
}

export async function credentials() {
  const path = resolveTradingEnvironmentFile();
  await synchronizeTradingSession(path);
  const env = NodeUtil.parseEnv(await NodeFSP.readFile(path, "utf8"));
  if (!env.TRADOVATE_ACCESS_TOKEN || !["demo", "live"].includes(env.TRADOVATE_ENVIRONMENT ?? "")) {
    throw new Error("Configure a Tradovate session on the server.");
  }
  return { token: env.TRADOVATE_ACCESS_TOKEN, environment: env.TRADOVATE_ENVIRONMENT };
}

const activeContractCache = new Map<
  string,
  {
    token: string;
    expires: number;
    pending: Promise<{ id: number; name: string }[]>;
  }
>();

export async function contracts(root: string) {
  if (!["MGC", "MNQ", "GC", "NQ"].includes(root)) throw new Error("Choose MGC, MNQ, GC or NQ.");
  const session = await credentials();
  const key = `${session.environment}:${root}`;
  const cached = activeContractCache.get(key);
  if (cached && cached.token === session.token && cached.expires > Date.now())
    return cached.pending;
  const lookup = async () => {
    const get = async (path: string) => {
      const response = await fetch(`https://${session.environment}.tradovateapi.com/v1/${path}`, {
        headers: { Authorization: `Bearer ${session.token}` },
        signal: AbortSignal.timeout(10_000),
        redirect: "error",
      });
      if (!response.ok) throw new Error(`Contract lookup returned HTTP ${response.status}.`);
      const body = await response.json();
      if (!Array.isArray(body)) throw new Error("Invalid contract response.");
      return body;
    };
    const suggested = await get(`contract/suggest?t=${root}&l=12`);
    const matching = suggested.filter(
      (item) =>
        item &&
        typeof item.name === "string" &&
        new RegExp(`^${root}[FGHJKMNQUVXZ]\\d{1,2}$`).test(item.name) &&
        Number.isSafeInteger(item.id) &&
        item.id > 0 &&
        Number.isSafeInteger(item.contractMaturityId),
    );
    if (!matching.length) throw new Error("No current contracts available.");
    const maturities = await get(
      `contractMaturity/items?ids=${matching.map((item) => item.contractMaturityId).join(",")}`,
    );
    const candidates = activeCandidates(
      matching.flatMap((item) => {
        const maturity = maturities.find((value) => value.id === item.contractMaturityId);
        return maturity && !maturity.archived
          ? [
              {
                id: item.id,
                name: item.name,
                expirationDate: maturity.expirationDate,
                ...(maturity.firstIntentDate ? { firstIntentDate: maturity.firstIntentDate } : {}),
              },
            ]
          : [];
      }),
    );
    return [mostActiveContract(candidates, await readContractActivity(candidates, session.token))];
  };
  const pending = lookup();
  const entry = { token: session.token, expires: Date.now() + 15 * 60_000, pending };
  activeContractCache.set(key, entry);
  try {
    return await pending;
  } catch (error) {
    if (activeContractCache.get(key) === entry) activeContractCache.delete(key);
    throw error;
  }
}

export async function chartStream(symbol: string, interval: number) {
  if (
    !/^(MGC|MNQ|GC|NQ)[FGHJKMNQUVXZ]\d{1,2}$/.test(symbol) ||
    ![1, 2, 3, 5, 10, 15, 30, 45, 60, 120, 180, 240].includes(interval)
  ) {
    throw new Error("Choose a valid MGC, MNQ, GC or NQ contract and chart interval.");
  }
  const session = await credentials();
  // https://api.tradovate.com/: contract/find binds the requested expiry to its ID.
  const contractResponse = await fetch(
    `https://${session.environment}.tradovateapi.com/v1/contract/find?name=${encodeURIComponent(symbol)}`,
    {
      headers: { Authorization: `Bearer ${session.token}` },
      signal: AbortSignal.timeout(10_000),
      redirect: "error",
    },
  );
  if (!contractResponse.ok) {
    throw new Error(`Tradovate contract lookup returned HTTP ${contractResponse.status}.`);
  }
  const contract = await contractResponse.json();
  if (
    !contract ||
    typeof contract !== "object" ||
    !("name" in contract) ||
    !("id" in contract) ||
    contract.name !== symbol ||
    typeof contract.id !== "number" ||
    !Number.isSafeInteger(contract.id) ||
    contract.id <= 0
  ) {
    throw new Error("Tradovate did not confirm the selected contract.");
  }
  const contractId: number = contract.id;
  let dispose = () => {};
  const body = new NodeStreamWeb.ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      const ws = new WebSocket("wss://md.tradovateapi.com/v1/websocket");
      let ended = false;
      let heartbeat: ReturnType<typeof setInterval> | undefined;
      let historicalId: number | undefined;
      let realtimeId: number | undefined;
      let finishedHistory = false;
      let receivedBars = false;
      const send = (data: object) => {
        if (!ended) controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };
      const finish = (message?: string) => {
        if (ended) return;
        if (message) send({ type: "status", state: "disconnected", message });
        ended = true;
        clearInterval(heartbeat);
        clearTimeout(timeout);
        clearTimeout(rotate);
        if (ws.readyState === WebSocket.OPEN && realtimeId !== undefined)
          ws.send(`md/cancelChart\n3\n\n${JSON.stringify({ subscriptionId: realtimeId })}`);
        if (ws.readyState === WebSocket.OPEN)
          ws.send(`md/unsubscribeQuote\n5\n\n${JSON.stringify({ symbol })}`);
        ws.close();
        try {
          controller.close();
        } catch {
          /* Consumer already cancelled. */
        }
      };
      dispose = () => finish();
      const timeout = setTimeout(() => {
        if (!receivedBars)
          finish("No chart data arrived. Check Tradovate market-data permissions.");
      }, 20_000);
      // Reconnect periodically so a long-running chart picks up Convex's renewed token.
      const rotate = setTimeout(() => finish("Refreshing market-data connection…"), 45 * 60_000);
      send({ type: "status", state: "connecting", message: "Connecting to Tradovate…" });
      ws.addEventListener("message", (event) => {
        const raw = String(event.data);
        if (raw === "o") {
          ws.send(`authorize\n1\n\n${session.token}`);
          heartbeat = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) ws.send("[]");
          }, 2500);
          return;
        }
        if (raw === "h") return;
        if (!raw.startsWith("a")) return;
        let messages;
        try {
          messages = JSON.parse(raw.slice(1));
        } catch {
          return;
        }
        if (!Array.isArray(messages)) return;
        for (const message of messages) {
          if (message.i === 1) {
            if (message.s !== 200) {
              finish("Tradovate rejected market-data authorization.");
              return;
            }
            ws.send(
              `md/getChart\n2\n\n${JSON.stringify({ symbol, chartDescription: { underlyingType: "MinuteBar", elementSize: interval, elementSizeUnit: "UnderlyingUnits" }, timeRange: { asMuchAsElements: 500 } })}`,
            );
            ws.send(`md/subscribeQuote\n4\n\n${JSON.stringify({ symbol })}`);
          } else if (message.i === 2) {
            if (message.s !== 200 || message.d?.errorText) {
              finish("Chart subscription rejected. Check market-data access for this contract.");
              return;
            }
            historicalId = message.d?.historicalId;
            realtimeId = message.d?.realtimeId;
            send({
              type: "status",
              state: "connected",
              message: "Tradovate connected",
              mode: message.d?.mode,
            });
          } else if (message.e === "md" && Array.isArray(message.d?.quotes)) {
            for (const rawQuote of message.d.quotes) {
              const quote = normalizeQuote(rawQuote, symbol, contractId);
              if (quote) send({ type: "quote", quote });
            }
          } else if (message.e === "chart" && Array.isArray(message.d?.charts)) {
            for (const chart of message.d.charts) {
              if (chart.id !== historicalId && chart.id !== realtimeId) continue;
              const bars = normalizeBars(chart.bars);
              if (bars.length) {
                receivedBars = true;
                clearTimeout(timeout);
                send({ type: "bars", bars, historical: !finishedHistory, symbol });
              }
              if (chart.eoh) finishedHistory = true;
            }
          }
        }
      });
      ws.addEventListener("error", () => finish("Market-data connection failed. Retrying…"));
      ws.addEventListener("close", () => finish("Market-data connection closed. Retrying…"));
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
