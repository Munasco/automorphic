// @effect-diagnostics nodeBuiltinImport:off globalFetch:off globalTimers:off globalDate:off - Native WebSocket/ReadableStream adapter; its lifecycle is tied to the HTTP response.
import { activeCandidates, mostActiveContract, readContractActivity } from "./activeContract.ts";
import { tradovateMarketSocket } from "./tradovateMarketSocket.ts";
import * as NodeFSP from "node:fs/promises";
import { tradovateConnection } from "./tradovateConnection.ts";
import { resolveTradingEnvironmentFile, synchronizeTradingSession } from "./runtimeEnv.ts";
import * as NodeUtil from "node:util";
import * as NodeStreamWeb from "node:stream/web";
import {
  createBarFinalizer,
  chartProvenance,
  quoteBarTime,
  type BarProvenance,
} from "./barFinalization.ts";
import { createCalendarSeries, calendarPeriodStart } from "./calendarSeries.ts";
import { resolveChartInterval, type ChartIntervalUnit } from "./chartInterval.ts";
import { createTickSeries, tickHistoryRequestLimit, type TickBarSize } from "./tickSeries.ts";
import { createNativeTickSeries, type NativeTickSize } from "./nativeTickSeries.ts";
import { circuitBreaker } from "./rateLimitCircuitBreaker.ts";

export type Candle = {
  time: number;
  actualTime?: number;
  actualEndTime?: number;
  firstTradeId?: number;
  lastTradeId?: number;
  barId?: string;
  tradeDate?: number;
  tradeCount?: number;
  complete?: boolean;
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

export async function credentials(): Promise<{ token: string; environment: string }> {
  const connected = await tradovateConnection.credentials();
  if (connected) return { token: connected.token, environment: connected.environment };
  const path = resolveTradingEnvironmentFile();
  await synchronizeTradingSession(path);
  const env = NodeUtil.parseEnv(await NodeFSP.readFile(path, "utf8"));
  if (!env.TRADOVATE_ACCESS_TOKEN || !["demo", "live"].includes(env.TRADOVATE_ENVIRONMENT ?? "")) {
    throw new Error("Configure a Tradovate session on the server.");
  }
  const environment = env.TRADOVATE_ENVIRONMENT === "live" ? "live" : "demo";
  return { token: env.TRADOVATE_ACCESS_TOKEN, environment };
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
      if (!response.ok) {
        if (response.status === 429) {
          circuitBreaker.trip429("Tradovate contract lookup returned HTTP 429.");
        }
        throw new Error(`Contract lookup returned HTTP ${response.status}.`);
      }
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
    const front = candidates[0];
    if (!front) throw new Error("No current contracts available.");
    let winner = { id: front.id, name: front.name };
    if (candidates.length > 1) {
      try {
        const activity = await readContractActivity(
          candidates,
          session.token,
          session.environment === "live" ? "live" : "demo",
        );
        winner = mostActiveContract(candidates, activity);
      } catch {
        // Fallback gracefully to front month candidate if volume check fails or times out
        winner = { id: front.id, name: front.name };
      }
    }
    return [winner];
  };
  const pending = lookup();
  const entry = { token: session.token, expires: Date.now() + 60 * 60_000, pending };
  activeContractCache.set(key, entry);
  try {
    return await pending;
  } catch (error) {
    if (activeContractCache.get(key) === entry) activeContractCache.delete(key);
    throw error;
  }
}

export async function chartStream(symbol: string, interval: number, intervalUnit = "minute") {
  if (!/^(?:@(MGC|MNQ|GC|NQ)|(MGC|MNQ|GC|NQ)[FGHJKMNQUVXZ]\d{1,2})$/.test(symbol)) {
    throw new Error("Choose a valid MGC, MNQ, GC or NQ contract.");
  }
  const { chartDescription, ...intervalMetadata } = resolveChartInterval(interval, intervalUnit);
  const tickSize = intervalMetadata.intervalUnit === "tick" ? (interval as TickBarSize) : undefined;
  const calendar =
    intervalUnit === "week" || intervalUnit === "month"
      ? createCalendarSeries(intervalUnit, interval)
      : null;
  const historyLimit = tickSize === 1 ? tickHistoryRequestLimit(1) : tickSize ? 500 : 2000;
  const cb = circuitBreaker.status();
  if (cb.blocked && !process.env.VITEST) {
    const encoder = new TextEncoder();
    return new Response(
      new NodeStreamWeb.ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "status",
                state: "disconnected",
                message: `Rate limit cooldown active (${Math.round(cb.remainingMs / 60_000)}m remaining). Requests paused to preserve IP cooldown.`,
                ...intervalMetadata,
              })}\n\n`,
            ),
          );
        },
      }),
      {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-store",
          "X-Accel-Buffering": "no",
        },
      },
    );
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
    if (contractResponse.status === 429) {
      circuitBreaker.trip429("Tradovate contract lookup returned HTTP 429.");
    }
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
      let ended = false;
      let historicalId: number | undefined;
      let realtimeId: number | undefined;
      let finishedHistory = false;
      let receivedBars = false;
      const finalizer = createBarFinalizer();
      let latestLiveBar: Candle | undefined;
      // Never aggregate the vendor's sampled raw history into larger count bars.
      const rawTicks = tickSize === 1 ? createTickSeries(1) : null;
      let nativeTicks: ReturnType<typeof createNativeTickSeries> | undefined;
      const send = (data: object) => {
        if (!ended) controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };
      const sendBars = (
        bars: Candle[],
        provenance: BarProvenance,
        extra: object = {},
        liveBars = bars,
        sourceTimes?: ReadonlyMap<number, number>,
      ) => {
        if (provenance === "live")
          for (const bar of liveBars)
            if (!latestLiveBar || bar.time >= latestLiveBar.time) latestLiveBar = bar;
        send({
          type: "bars",
          bars,
          historical: provenance !== "live",
          provenance,
          historyComplete: finishedHistory,
          symbol,
          ...intervalMetadata,
          ...extra,
        });
        for (const close of finalizer.accept(liveBars, provenance, sourceTimes))
          send({
            type: "bar-close",
            symbol,
            provenance: "live",
            historyComplete: true,
            ...intervalMetadata,
            ...close,
          });
      };
      const finish = (message?: string) => {
        if (ended) return;
        if (message) send({ type: "status", state: "disconnected", message, ...intervalMetadata });
        ended = true;
        clearTimeout(timeout);
        clearTimeout(rotate);
        unsubscribe();
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
      send({
        type: "status",
        state: "connecting",
        message: "Connecting to Tradovate…",
        ...intervalMetadata,
      });
      const unsubscribe = tradovateMarketSocket.subscribeChart(
        symbol,
        {
          symbol,
          chartDescription,
          timeRange: { asMuchAsElements: historyLimit },
        },
        {
          onSubscribed: (info) => {
            historicalId = info.historicalId;
            realtimeId = info.realtimeId;
            if (tickSize && tickSize > 1) {
              nativeTicks = createNativeTickSeries(tickSize as NativeTickSize, {
                historicalId: historicalId!,
                realtimeId: realtimeId!,
                historyLimit,
              });
            }
            send({
              type: "status",
              state: "connected",
              message: "Tradovate connected",
              mode: info.mode,
              ...intervalMetadata,
            });
          },
          onRawCharts: (charts) => {
            if (calendar) {
              const livePeriods = new Map<number, number>();
              let changed = false;
              let provenance: BarProvenance = "historical";
              let bars: Candle[] = calendar.accept([], true);
              for (const chart of charts) {
                if (chart.id !== historicalId && chart.id !== realtimeId) continue;
                const source = chartProvenance(chart.id, historicalId, realtimeId, finishedHistory);
                const incoming = normalizeBars(chart.bars);
                if (incoming.length) {
                  bars = calendar.accept(incoming, source === "historical");
                  changed = true;
                  if (source !== "historical") provenance = source;
                  if (source === "live") {
                    for (const bar of incoming) {
                      const period = calendarPeriodStart(
                        bar.time,
                        intervalUnit as "week" | "month",
                        interval,
                      );
                      livePeriods.set(
                        period,
                        Math.max(livePeriods.get(period) ?? -Infinity, bar.time),
                      );
                    }
                  }
                }
                if (chart.id === historicalId && chart.eoh === true) {
                  finishedHistory = true;
                  changed = true;
                }
              }
              if (changed) {
                receivedBars ||= bars.length > 0;
                if (receivedBars) clearTimeout(timeout);
                sendBars(
                  bars,
                  provenance,
                  { snapshot: true },
                  bars.filter((bar) => livePeriods.has(bar.time)),
                  livePeriods,
                );
              }
              return;
            }

            for (const chart of charts) {
              if (chart.id !== historicalId && chart.id !== realtimeId) continue;
              const provenance = chartProvenance(
                chart.id,
                historicalId,
                realtimeId,
                finishedHistory,
              );
              if (rawTicks || nativeTicks) {
                const result = nativeTicks
                  ? nativeTicks.accept(chart)
                  : rawTicks!.accept(chart, chart.id === historicalId && chart.eoh === true);
                if ("resetRequired" in result) {
                  send({
                    type: "status",
                    state: "disconnected",
                    resetRequired: true,
                    message: result.resetRequired,
                    tickHistory: result.metadata,
                    ...intervalMetadata,
                  });
                  finish();
                  return;
                }
                if (result.bars.length || result.snapshot) {
                  receivedBars ||= result.bars.length > 0;
                  if (receivedBars) clearTimeout(timeout);
                  if (chart.id === historicalId && chart.eoh === true) finishedHistory = true;
                  sendBars(result.bars, result.historical ? "historical" : provenance, {
                    snapshot: result.snapshot,
                    tickHistory: result.metadata,
                  });
                }
                if (chart.id === historicalId && chart.eoh === true) finishedHistory = true;
                continue;
              }
              const bars = normalizeBars(chart.bars);
              const historyEnded = chart.id === historicalId && chart.eoh === true;
              if (historyEnded) finishedHistory = true;
              if (bars.length || historyEnded) {
                receivedBars ||= bars.length > 0;
                if (receivedBars) clearTimeout(timeout);
                sendBars(bars, provenance);
              }
            }
          },
          onQuote: (rawQuote) => {
            const quote = normalizeQuote(rawQuote, symbol, contractId);
            if (quote) {
              const barTime = quoteBarTime(
                quote.timestamp,
                latestLiveBar,
                intervalMetadata.intervalUnit as ChartIntervalUnit,
                interval,
              );
              send({
                type: "quote",
                quote: { ...quote, ...(barTime === undefined ? {} : { barTime }) },
              });
            }
          },
          onError: (error) => {
            finish(error.message);
          },
        },
        session,
      );
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
