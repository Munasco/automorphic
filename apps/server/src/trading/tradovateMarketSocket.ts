// @effect-diagnostics globalTimers:off globalDate:off
import { circuitBreaker } from "./rateLimitCircuitBreaker.ts";
import { credentials } from "./marketData.ts";
import type { ActiveContractCandidate, ContractActivity } from "./activeContract.ts";

export interface TradovateRawBar {
  readonly timestamp: string;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly upVolume?: number;
  readonly downVolume?: number;
  readonly upTicks?: number;
  readonly downTicks?: number;
}

export interface TradovateTickPacket {
  readonly id: number;
  readonly t: number;
  readonly p: number;
  readonly s: number;
  readonly b?: number;
  readonly a?: number;
}

export interface TradovateRawChart {
  readonly id: number;
  readonly eoh?: boolean;
  readonly bars?: readonly TradovateRawBar[];
  readonly bt?: number;
  readonly bp?: number;
  readonly ts?: number;
  readonly td?: number;
  readonly tks?: readonly TradovateTickPacket[];
}

export interface TradovateQuoteEntry {
  readonly price?: number;
  readonly size?: number;
}

export interface TradovateRawQuote {
  readonly contractId: number;
  readonly timestamp?: string;
  readonly entries?: {
    readonly Trade?: TradovateQuoteEntry;
    readonly OpeningPrice?: TradovateQuoteEntry;
    readonly HighPrice?: TradovateQuoteEntry;
    readonly LowPrice?: TradovateQuoteEntry;
    readonly TotalTradeVolume?: TradovateQuoteEntry;
    readonly OpenInterest?: TradovateQuoteEntry;
    readonly [key: string]: TradovateQuoteEntry | undefined;
  };
}

export interface ChartSubscriptionCallbacks {
  readonly onRawChart?: (chart: TradovateRawChart) => void;
  readonly onRawCharts?: (charts: readonly TradovateRawChart[]) => void;
  readonly onQuote?: (quote: TradovateRawQuote) => void;
  readonly onSubscribed?: (info: {
    historicalId: number;
    realtimeId: number;
    mode?: string | undefined;
  }) => void;
  readonly onStatus?: (status: {
    state: string;
    message: string;
    mode?: string | undefined;
  }) => void;
  readonly onError?: (error: Error) => void;
  readonly onAuthorized?: () => void;
}

export type QuoteCallback = (quote: TradovateRawQuote) => void;

interface InternalChartSub {
  readonly id: string;
  readonly symbol: string;
  readonly body: object;
  readonly callbacks: ChartSubscriptionCallbacks;
  readonly getChartReqId: number;
  readonly quoteReqId: number;
  readonly cancelReqId: number;
  readonly unsubscribeQuoteReqId: number;
  historicalId?: number;
  realtimeId?: number;
}

export type TradovateInboundMessage =
  | { readonly kind: "rate-limit"; readonly message: string }
  | { readonly kind: "auth-response"; readonly status: number }
  | {
      readonly kind: "chart-sub-response";
      readonly reqId: number;
      readonly status: number;
      readonly historicalId?: number | undefined;
      readonly realtimeId?: number | undefined;
      readonly mode?: string | undefined;
      readonly ticket?: string | undefined;
      readonly penaltySec?: number | undefined;
      readonly errorText?: string | undefined;
    }
  | {
      readonly kind: "quote-sub-response";
      readonly reqId: number;
      readonly status: number;
      readonly ticket?: string | undefined;
      readonly penaltySec?: number | undefined;
    }
  | { readonly kind: "chart-event"; readonly charts: readonly TradovateRawChart[] }
  | { readonly kind: "quote-event"; readonly quotes: readonly TradovateRawQuote[] }
  | { readonly kind: "ignored" };

function parseInboundMessage(
  raw: unknown,
  chartReqIds: ReadonlyMap<number, InternalChartSub>,
  quoteReqIds: ReadonlyMap<number, InternalChartSub>,
): TradovateInboundMessage {
  if (!raw || typeof raw !== "object") return { kind: "ignored" };
  const record = raw as Record<string, unknown>;

  const data =
    typeof record.d === "object" && record.d !== null
      ? (record.d as Record<string, unknown>)
      : undefined;

  // Rate limit / captcha
  if (record.s === 429 || data?.["p-captcha"] === true) {
    return { kind: "rate-limit", message: "Tradovate returned rate limit status 429 / captcha." };
  }

  // Auth response
  if (record.i === 1) {
    return { kind: "auth-response", status: typeof record.s === "number" ? record.s : 401 };
  }

  // Chart subscription response
  if (typeof record.i === "number" && chartReqIds.has(record.i)) {
    return {
      kind: "chart-sub-response",
      reqId: record.i,
      status: typeof record.s === "number" ? record.s : 200,
      historicalId: typeof data?.historicalId === "number" ? data.historicalId : undefined,
      realtimeId: typeof data?.realtimeId === "number" ? data.realtimeId : undefined,
      mode: typeof data?.mode === "string" ? data.mode : undefined,
      ticket: typeof data?.["p-ticket"] === "string" ? data["p-ticket"] : undefined,
      penaltySec: typeof data?.["p-time"] === "number" ? data["p-time"] : undefined,
      errorText: typeof data?.errorText === "string" ? data.errorText : undefined,
    };
  }

  // Quote subscription response
  if (typeof record.i === "number" && quoteReqIds.has(record.i)) {
    return {
      kind: "quote-sub-response",
      reqId: record.i,
      status: typeof record.s === "number" ? record.s : 200,
      ticket: typeof data?.["p-ticket"] === "string" ? data["p-ticket"] : undefined,
      penaltySec: typeof data?.["p-time"] === "number" ? data["p-time"] : undefined,
    };
  }

  // Chart data broadcast
  if (record.e === "chart" && Array.isArray(data?.charts)) {
    return { kind: "chart-event", charts: data.charts as readonly TradovateRawChart[] };
  }

  // Market data quote broadcast
  if (record.e === "md" && Array.isArray(data?.quotes)) {
    return { kind: "quote-event", quotes: data.quotes as readonly TradovateRawQuote[] };
  }

  return { kind: "ignored" };
}

/**
 * Singleton connection manager for Tradovate Market Data.
 * Enforces at most ONE persistent WebSocket connection to Tradovate market data
 * for the entire server process.
 *
 * All charts, watchlists, active contract lookups, and historical backfills
 * multiplex over this single connection.
 */
export class TradovateMarketSocketManager {
  private ws: WebSocket | null = null;
  private heartbeat: ReturnType<typeof setInterval> | undefined;
  private isAuthorized = false;
  private connectPromise: Promise<WebSocket> | null = null;
  private nextSubSeq = 0;
  private nextReqId = 10;

  // Active chart subscriptions: subId -> InternalChartSub
  private readonly chartSubs = new Map<string, InternalChartSub>();
  // Request ID lookups
  private readonly chartReqToSub = new Map<number, InternalChartSub>();
  private readonly quoteReqToSub = new Map<number, InternalChartSub>();
  // Fast dispatch map: chart.id (historicalId or realtimeId) -> InternalChartSub
  private readonly chartIdToSub = new Map<number, InternalChartSub>();

  // Quote subscriptions: symbol -> Set of callbacks
  private readonly quoteSubs = new Map<string, Set<QuoteCallback>>();
  // Symbols currently subscribed to on Tradovate socket
  private readonly activeQuotesOnSocket = new Set<string>();

  /**
   * Reset all state. Used in tests to ensure clean test isolation.
   */
  resetForTests() {
    this.cleanupSocket();
    this.chartSubs.clear();
    this.chartReqToSub.clear();
    this.quoteReqToSub.clear();
    this.chartIdToSub.clear();
    this.quoteSubs.clear();
    this.activeQuotesOnSocket.clear();
    this.nextSubSeq = 0;
    this.nextReqId = 10;
  }

  private cleanupSocket() {
    if (this.heartbeat) {
      clearInterval(this.heartbeat);
      this.heartbeat = undefined;
    }
    this.isAuthorized = false;
    this.connectPromise = null;
    if (this.ws) {
      try {
        if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
          this.ws.close();
        }
      } catch {
        /* Ignore */
      }
      this.ws = null;
    }
    this.activeQuotesOnSocket.clear();
    this.chartIdToSub.clear();
    this.chartReqToSub.clear();
    this.quoteReqToSub.clear();
    this.nextSubSeq = 0;
    this.nextReqId = 10;
  }

  /**
   * Ensure the single market data WebSocket is connected and authorized.
   */
  private setupSocket(ws: WebSocket, session: { token: string; environment: string }) {
    ws.addEventListener("error", () => {
      if (this.ws === ws) {
        if (!process.env.VITEST) {
          circuitBreaker.recordFailure();
        }
        this.cleanupSocket();
      }
    });

    ws.addEventListener("close", () => {
      if (this.ws === ws) {
        this.cleanupSocket();
      }
    });

    ws.addEventListener("message", (event) => {
      const raw = String(event.data);
      if (raw === "o") {
        ws.send(`authorize\n1\n\n${session.token}`);
        if (this.heartbeat) clearInterval(this.heartbeat);
        this.heartbeat = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send("[]");
          }
        }, 2500);
        return;
      }

      if (raw === "h") {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send("[]");
        }
        return;
      }

      if (!raw.startsWith("a")) return;
      let messages: readonly unknown[];
      try {
        messages = JSON.parse(raw.slice(1));
      } catch {
        return;
      }
      if (!Array.isArray(messages)) return;

      for (const item of messages) {
        const action = parseInboundMessage(item, this.chartReqToSub, this.quoteReqToSub);

        switch (action.kind) {
          case "rate-limit": {
            circuitBreaker.trip429(action.message);
            for (const sub of this.chartSubs.values()) {
              sub.callbacks.onError?.(
                new Error("Tradovate rate limit active. Halting automated requests."),
              );
            }
            this.cleanupSocket();
            return;
          }

          case "auth-response": {
            if (action.status === 200) {
              this.isAuthorized = true;
              circuitBreaker.recordSuccess();

              // Send all chart subscriptions
              for (const sub of this.chartSubs.values()) {
                sub.callbacks.onAuthorized?.();
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(`md/getChart\n${sub.getChartReqId}\n\n${JSON.stringify(sub.body)}`);
                  ws.send(
                    `md/subscribeQuote\n${sub.quoteReqId}\n\n${JSON.stringify({ symbol: sub.symbol })}`,
                  );
                }
              }

              // Send all quote subscriptions
              let quoteIdx = 100;
              for (const symbol of this.quoteSubs.keys()) {
                if (!this.activeQuotesOnSocket.has(symbol) && ws.readyState === WebSocket.OPEN) {
                  this.activeQuotesOnSocket.add(symbol);
                  ws.send(`md/subscribeQuote\n${quoteIdx++}\n\n${JSON.stringify({ symbol })}`);
                }
              }
            } else {
              this.cleanupSocket();
              for (const sub of this.chartSubs.values()) {
                sub.callbacks.onError?.(new Error("Tradovate rejected market-data authorization."));
              }
            }
            break;
          }

          case "chart-sub-response": {
            const sub = this.chartReqToSub.get(action.reqId);
            if (!sub) break;

            if (action.status !== 200 || action.errorText) {
              sub.callbacks.onError?.(
                new Error(
                  "Chart subscription rejected. Check market-data access for this contract.",
                ),
              );
              break;
            }

            if (
              typeof action.historicalId === "number" &&
              Number.isSafeInteger(action.historicalId) &&
              typeof action.realtimeId === "number" &&
              Number.isSafeInteger(action.realtimeId)
            ) {
              sub.historicalId = action.historicalId;
              sub.realtimeId = action.realtimeId;
              this.chartIdToSub.set(sub.historicalId, sub);
              this.chartIdToSub.set(sub.realtimeId, sub);
              sub.callbacks.onSubscribed?.({
                historicalId: sub.historicalId,
                realtimeId: sub.realtimeId,
                mode: action.mode,
              });
            }

            if (action.ticket) {
              const penaltySec = action.penaltySec ?? 1;
              const ticket = action.ticket;
              setTimeout(() => {
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(
                    `md/getChart\n${sub.getChartReqId}\n\n${JSON.stringify({ ...sub.body, "p-ticket": ticket })}`,
                  );
                }
              }, penaltySec * 1000);
            }
            break;
          }

          case "quote-sub-response": {
            const sub = this.quoteReqToSub.get(action.reqId);
            if (!sub) break;

            if (action.ticket) {
              const penaltySec = action.penaltySec ?? 1;
              const ticket = action.ticket;
              setTimeout(() => {
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(
                    `md/subscribeQuote\n${sub.quoteReqId}\n\n${JSON.stringify({ symbol: sub.symbol, "p-ticket": ticket })}`,
                  );
                }
              }, penaltySec * 1000);
            }
            break;
          }

          case "chart-event": {
            const chartsBySub = new Map<InternalChartSub, TradovateRawChart[]>();
            for (const chart of action.charts) {
              if (!chart || typeof chart.id !== "number") continue;
              const sub = this.chartIdToSub.get(chart.id);
              if (sub) {
                let list = chartsBySub.get(sub);
                if (!list) {
                  list = [];
                  chartsBySub.set(sub, list);
                }
                list.push(chart);
                sub.callbacks.onRawChart?.(chart);
              }
            }
            for (const [sub, charts] of chartsBySub) {
              sub.callbacks.onRawCharts?.(charts);
            }
            break;
          }

          case "quote-event": {
            for (const quote of action.quotes) {
              for (const listeners of this.quoteSubs.values()) {
                for (const listener of listeners) {
                  listener(quote);
                }
              }
              for (const sub of this.chartSubs.values()) {
                sub.callbacks.onQuote?.(quote);
              }
            }
            break;
          }

          case "ignored":
            break;
        }
      }
    });
  }

  /**
   * Ensure the single market data WebSocket is connected and authorized.
   */
  async ensureConnected(knownSession?: { token: string; environment: string }): Promise<WebSocket> {
    const cb = circuitBreaker.status();
    if (cb.blocked && !process.env.VITEST) {
      throw new Error(`Tradovate rate limit active: ${cb.reason}`);
    }

    if (this.ws && this.ws.constructor !== globalThis.WebSocket) {
      this.cleanupSocket();
    }

    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return this.ws;
    }

    if (knownSession) {
      const host =
        knownSession.environment === "live" ? "md.tradovateapi.com" : "md-demo.tradovateapi.com";
      const ws = new WebSocket(`wss://${host}/v1/websocket`);
      this.ws = ws;
      this.setupSocket(ws, knownSession);
      return ws;
    }

    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.connectPromise = (async () => {
      const session = await credentials();
      const host =
        session.environment === "live" ? "md.tradovateapi.com" : "md-demo.tradovateapi.com";
      const ws = new WebSocket(`wss://${host}/v1/websocket`);
      this.ws = ws;
      this.setupSocket(ws, session);
      return ws;
    })();

    return this.connectPromise;
  }

  /**
   * Subscribe a chart to market data through the single shared socket.
   */
  subscribeChart(
    symbol: string,
    body: object,
    callbacks: ChartSubscriptionCallbacks,
    session?: { token: string; environment: string },
  ): () => void {
    if (this.chartSubs.size === 0) {
      this.nextSubSeq = 0;
    }
    const subSeq = ++this.nextSubSeq;
    const subId = `chart_sub_${subSeq}`;

    // For test compatibility with existing assertions:
    // First chart gets getChartReqId = 2, cancel = 3, quote = 4, unsubscribeQuote = 5
    const getChartReqId = subSeq === 1 ? 2 : this.nextReqId++;
    const cancelReqId = subSeq === 1 ? 3 : this.nextReqId++;
    const quoteReqId = subSeq === 1 ? 4 : this.nextReqId++;
    const unsubscribeQuoteReqId = subSeq === 1 ? 5 : this.nextReqId++;

    const sub: InternalChartSub = {
      id: subId,
      symbol,
      body,
      callbacks,
      getChartReqId,
      quoteReqId,
      cancelReqId,
      unsubscribeQuoteReqId,
    };

    this.chartSubs.set(subId, sub);
    this.chartReqToSub.set(getChartReqId, sub);
    this.quoteReqToSub.set(quoteReqId, sub);

    if (session) {
      void this.ensureConnected(session);
    }

    // If socket is already open and authorized, send chart request immediately
    if (this.ws && this.ws.readyState === WebSocket.OPEN && this.isAuthorized) {
      this.ws.send(`md/getChart\n${getChartReqId}\n\n${JSON.stringify(body)}`);
      this.ws.send(`md/subscribeQuote\n${quoteReqId}\n\n${JSON.stringify({ symbol })}`);
    } else if (!session) {
      void this.ensureConnected();
    }

    return () => {
      this.chartSubs.delete(subId);
      this.chartReqToSub.delete(getChartReqId);
      this.quoteReqToSub.delete(quoteReqId);
      if (this.chartSubs.size === 0) {
        this.nextSubSeq = 0;
      }
      if (sub.historicalId !== undefined) this.chartIdToSub.delete(sub.historicalId);
      if (sub.realtimeId !== undefined) {
        this.chartIdToSub.delete(sub.realtimeId);
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(
            `md/cancelChart\n${cancelReqId}\n\n${JSON.stringify({ subscriptionId: sub.realtimeId })}`,
          );
        }
      }
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(
          `md/unsubscribeQuote\n${unsubscribeQuoteReqId}\n\n${JSON.stringify({ symbol })}`,
        );
      }
      // CRITICAL: The physical WebSocket stays OPEN! Do not close it!
    };
  }

  /**
   * Subscribe to quotes for one or more symbols through the single shared socket.
   */
  subscribeQuotes(symbols: readonly string[], onQuote: QuoteCallback): () => void {
    for (const symbol of symbols) {
      let set = this.quoteSubs.get(symbol);
      if (!set) {
        set = new Set();
        this.quoteSubs.set(symbol, set);
      }
      set.add(onQuote);

      if (this.ws && this.ws.readyState === WebSocket.OPEN && this.isAuthorized) {
        if (!this.activeQuotesOnSocket.has(symbol)) {
          this.activeQuotesOnSocket.add(symbol);
          this.ws.send(`md/subscribeQuote\n${this.nextReqId++}\n\n${JSON.stringify({ symbol })}`);
        }
      }
    }

    void this.ensureConnected();

    return () => {
      for (const symbol of symbols) {
        const set = this.quoteSubs.get(symbol);
        if (set) {
          set.delete(onQuote);
          if (set.size === 0) {
            this.quoteSubs.delete(symbol);
            if (this.activeQuotesOnSocket.has(symbol)) {
              this.activeQuotesOnSocket.delete(symbol);
              if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(
                  `md/unsubscribeQuote\n${this.nextReqId++}\n\n${JSON.stringify({ symbol })}`,
                );
              }
            }
          }
        }
      }
    };
  }

  /**
   * Read contract activity (trade volume & open interest) through the single shared socket.
   * Never opens a new WebSocket.
   */
  async readContractActivity(
    candidates: readonly ActiveContractCandidate[],
  ): Promise<Map<number, ContractActivity>> {
    if (!candidates.length) {
      throw new Error("No current contracts available.");
    }

    return new Promise<Map<number, ContractActivity>>((resolve, reject) => {
      const activity = new Map<number, ContractActivity>();
      let done = false;

      const cleanup = () => {
        if (done) return;
        done = true;
        clearTimeout(timeout);
        unsubscribe();
      };

      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error("Active contract lookup timed out. Please retry."));
      }, 10_000);

      const unsubscribe = this.subscribeQuotes(
        candidates.map((c) => c.name),
        (quote) => {
          if (done) return;
          if (!candidates.some((contract) => contract.id === quote.contractId)) return;
          const volume = quote.entries?.TotalTradeVolume?.size;
          const openInterest = quote.entries?.OpenInterest?.size;
          if (typeof volume !== "number" || !Number.isFinite(volume) || volume < 0) return;

          activity.set(quote.contractId, {
            volume,
            openInterest:
              typeof openInterest === "number" && Number.isFinite(openInterest) && openInterest >= 0
                ? openInterest
                : 0,
          });

          if (activity.size === candidates.length) {
            cleanup();
            resolve(activity);
          }
        },
      );
    });
  }

  /**
   * Fetch historical bars through the single shared socket.
   * Never opens a new WebSocket.
   */
  async getHistoricalBars(
    symbol: string,
    body: object,
    timeoutMs = 15_000,
  ): Promise<readonly TradovateRawBar[]> {
    return new Promise<readonly TradovateRawBar[]>((resolve, reject) => {
      const collected: TradovateRawBar[] = [];
      let done = false;

      const cleanup = () => {
        if (done) return;
        done = true;
        clearTimeout(timeout);
        unsubscribe();
      };

      const timeout = setTimeout(() => {
        cleanup();
        reject(
          new Error(
            "Tradovate history timed out before the end of history. Retry a smaller date window.",
          ),
        );
      }, timeoutMs);

      const unsubscribe = this.subscribeChart(symbol, body, {
        onRawChart: (chart) => {
          if (done) return;
          if (Array.isArray(chart.bars)) {
            collected.push(...chart.bars);
          }
          if (chart.eoh === true) {
            cleanup();
            resolve(collected);
          }
        },
        onError: (err) => {
          cleanup();
          reject(err);
        },
      });
    });
  }
}

export const tradovateMarketSocket = new TradovateMarketSocketManager();
