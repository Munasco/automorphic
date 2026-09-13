import type { MarketQuote } from "./InstrumentHeader";
import { randomUUID } from "../../lib/utils";

export const CHART_ALERTS_KEY = "automorphic:chart-alerts:v1";
export const ALERT_CONDITIONS = [
  "crossing",
  "crossing-up",
  "crossing-down",
  "above",
  "below",
] as const;
export type AlertCondition = (typeof ALERT_CONDITIONS)[number];
export type ChartPriceAlert = {
  id: string;
  symbol: string;
  price: number;
  condition: AlertCondition;
  repeat: boolean;
  cooldownMs: number;
  enabled: boolean;
  armedAt: number;
  lastTriggeredAt: number | null;
  lastQuoteAt: number | null;
};
export type ChartAlertEvent = {
  id: string;
  alertId: string;
  symbol: string;
  condition: AlertCondition;
  target: number;
  price: number;
  triggeredAt: number;
  quoteAt: number;
};
export type ChartAlertState = { alerts: ChartPriceAlert[]; history: ChartAlertEvent[] };
export type NewChartAlert = Pick<ChartPriceAlert, "price" | "condition" | "repeat" | "cooldownMs">;
type AlertStorage = Pick<Storage, "getItem" | "setItem"> & {
  subscribe?: (listener: () => void) => () => void;
};
type SharedQuoteRuntime = {
  startedAt: number;
  previous: { price: number; timestamp: number } | undefined;
  highWater: number;
  members: number;
};
type PriceAlertPeer = { refresh: () => void };
// Captured workspace objects are shared within one document, not across browser windows.
const sharedPriceAlertStores = new WeakMap<
  object,
  {
    peers: Set<PriceAlertPeer>;
    symbols: Map<string, SharedQuoteRuntime>;
  }
>();
const MAX_QUOTE_AGE_MS = 15_000;
const MAX_ALERTS = 100;
const MAX_HISTORY = 100;
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const stamp = (value: unknown): value is number =>
  finite(value) && value >= 0 && value <= 8_640_000_000_000_000;
const identifier = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 100;
const contract = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Z0-9][A-Z0-9._-]{0,79}$/.test(value);
const condition = (value: unknown): value is AlertCondition =>
  ALERT_CONDITIONS.some((item) => item === value);
const cooldown = (value: unknown): value is number =>
  finite(value) && value >= 1000 && value <= 86_400_000;

export function parseChartAlerts(raw: string | null): ChartAlertState {
  const empty = { alerts: [], history: [] };
  try {
    const value: unknown = JSON.parse(raw ?? "null");
    if (!record(value) || value.version !== 1) return empty;
    const ids = new Set<string>();
    const alerts: ChartPriceAlert[] = [];
    for (const item of Array.isArray(value.alerts) ? value.alerts.slice(0, MAX_ALERTS) : []) {
      if (
        !record(item) ||
        !identifier(item.id) ||
        ids.has(item.id) ||
        !contract(item.symbol) ||
        !finite(item.price) ||
        !condition(item.condition) ||
        typeof item.repeat !== "boolean" ||
        !cooldown(item.cooldownMs) ||
        typeof item.enabled !== "boolean" ||
        !stamp(item.armedAt) ||
        !(item.lastTriggeredAt === null || stamp(item.lastTriggeredAt)) ||
        !(item.lastQuoteAt === null || stamp(item.lastQuoteAt))
      )
        continue;
      ids.add(item.id);
      alerts.push(item as ChartPriceAlert);
    }
    const eventIds = new Set<string>();
    const history: ChartAlertEvent[] = [];
    for (const item of Array.isArray(value.history) ? value.history.slice(0, MAX_HISTORY) : []) {
      if (
        !record(item) ||
        !identifier(item.id) ||
        eventIds.has(item.id) ||
        !identifier(item.alertId) ||
        !contract(item.symbol) ||
        !condition(item.condition) ||
        !finite(item.target) ||
        !finite(item.price) ||
        !stamp(item.triggeredAt) ||
        !stamp(item.quoteAt)
      )
        continue;
      eventIds.add(item.id);
      history.push(item as ChartAlertEvent);
    }
    return { alerts, history };
  } catch {
    return empty;
  }
}

/** A selected chart evaluates actual timestamped quotes. Candles and cached connection snapshots
 * cannot fire alerts; crossings require two fresh quotes from this continuous chart session. */
export function createChartAlertSession(
  symbol: string,
  storage: AlertStorage,
  options: {
    now?: () => number;
    id?: () => string;
    onTrigger?: (event: ChartAlertEvent) => void;
  } = {},
) {
  const now = options.now ?? Date.now;
  const newId = options.id ?? randomUUID;
  let persisted = storage.getItem(CHART_ALERTS_KEY);
  let state = parseChartAlerts(persisted);
  let publishing = false;
  let disposed = false;
  let receivedLiveQuote = false;
  let shared = sharedPriceAlertStores.get(storage);
  if (!shared) {
    shared = { peers: new Set(), symbols: new Map() };
    sharedPriceAlertStores.set(storage, shared);
  }
  const coordinator = shared;
  let symbolRuntime = coordinator.symbols.get(symbol);
  if (!symbolRuntime) {
    symbolRuntime = { startedAt: now(), previous: undefined, highWater: 0, members: 0 };
    coordinator.symbols.set(symbol, symbolRuntime);
  }
  const runtime = symbolRuntime;
  runtime.members++;
  const listeners = new Set<() => void>();
  const refresh = () => {
    if (disposed || publishing) return;
    const saved = storage.getItem(CHART_ALERTS_KEY);
    if (saved === persisted) return;
    persisted = saved;
    state = parseChartAlerts(saved);
    // Peer changes have their own arming timestamps. Keep other alerts' quote continuity.
    listeners.forEach((listener) => listener());
  };
  const publish = (next: ChartAlertState) => {
    const serialized = JSON.stringify({ version: 1, ...next });
    publishing = true;
    try {
      storage.setItem(CHART_ALERTS_KEY, serialized);
    } finally {
      publishing = false;
    }
    persisted = serialized;
    state = next;
    for (const peer of coordinator.peers) peer.refresh();
    listeners.forEach((listener) => listener());
  };
  const armTime = (targetSymbol = symbol) =>
    Math.max(now(), (coordinator.symbols.get(targetSymbol)?.highWater ?? 0) + 1);
  const session = {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {
      if (!disposed) listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    add: (input: NewChartAlert) => {
      if (disposed) throw Error("The chart alert session is closed.");
      refresh();
      if (!contract(symbol)) throw Error("Select a futures contract first.");
      if (!finite(input.price)) throw Error("Enter a valid target price.");
      if (
        !condition(input.condition) ||
        typeof input.repeat !== "boolean" ||
        !cooldown(input.cooldownMs)
      )
        throw Error("Invalid alert settings.");
      if (state.alerts.length >= MAX_ALERTS)
        throw Error("Delete an alert before adding another (100 per workspace).");
      const alert: ChartPriceAlert = {
        ...input,
        id: newId(),
        symbol,
        enabled: true,
        armedAt: armTime(),
        lastTriggeredAt: null,
        lastQuoteAt: null,
      };
      publish({ ...state, alerts: [...state.alerts, alert] });
      return alert;
    },
    update: (id: string, input: NewChartAlert): boolean => {
      if (disposed) return false;
      refresh();
      const alert = state.alerts.find((item) => item.id === id && item.symbol === symbol);
      if (
        !alert ||
        !finite(input.price) ||
        !condition(input.condition) ||
        typeof input.repeat !== "boolean" ||
        !cooldown(input.cooldownMs)
      )
        return false;
      if (
        alert.price === input.price &&
        alert.condition === input.condition &&
        alert.repeat === input.repeat &&
        alert.cooldownMs === input.cooldownMs
      )
        return true;
      // Editing changes the next rule evaluation, not whether the alert is paused or
      // the time of its last notification. A running repeating cooldown still applies.
      const updated: ChartPriceAlert = {
        ...alert,
        price: input.price,
        condition: input.condition,
        repeat: input.repeat,
        cooldownMs: input.cooldownMs,
        armedAt: armTime(),
      };
      publish({ ...state, alerts: state.alerts.map((item) => (item === alert ? updated : item)) });
      return true;
    },
    setEnabled: (id: string, enabled: boolean) => {
      if (disposed) return false;
      refresh();
      const alert = state.alerts.find((item) => item.id === id);
      if (!alert || typeof enabled !== "boolean") return false;
      if (alert.enabled === enabled) return true;
      publish({
        ...state,
        alerts: state.alerts.map((item) =>
          item === alert ? { ...alert, enabled, armedAt: armTime(alert.symbol) } : item,
        ),
      });
      return true;
    },
    remove: (id: string) => {
      if (disposed) return false;
      refresh();
      if (!state.alerts.some((alert) => alert.id === id)) return false;
      publish({ ...state, alerts: state.alerts.filter((alert) => alert.id !== id) });
      return true;
    },
    clearHistory: () => {
      if (disposed) return false;
      refresh();
      if (state.history.length) publish({ ...state, history: [] });
      return true;
    },
    observeQuote: (quote: MarketQuote | null) => {
      if (disposed) return;
      refresh();
      if (quote === null) {
        // A newly mounted peer's initial empty snapshot is not a feed disconnect.
        if (receivedLiveQuote) {
          runtime.startedAt = now();
          runtime.previous = undefined;
          receivedLiveQuote = false;
        }
        return;
      }
      const receivedAt = now();
      const quoteAt = typeof quote.timestamp === "string" ? Date.parse(quote.timestamp) : NaN;
      if (
        quote.symbol !== symbol ||
        quote.source !== "quote" ||
        !finite(quote.last) ||
        !finite(quoteAt) ||
        quoteAt < runtime.startedAt ||
        receivedAt - quoteAt > MAX_QUOTE_AGE_MS ||
        quoteAt - receivedAt > 5000
      )
        return;
      receivedLiveQuote = true;
      if (quoteAt <= runtime.highWater) return;
      const previous = runtime.previous;
      const oldHighWater = runtime.highWater;
      const before =
        previous && quoteAt - previous.timestamp <= MAX_QUOTE_AGE_MS ? previous : undefined;
      runtime.highWater = quoteAt;
      runtime.previous = { price: quote.last, timestamp: quoteAt };
      const events: ChartAlertEvent[] = [];
      const alerts = state.alerts.map((alert) => {
        if (
          !alert.enabled ||
          alert.symbol !== symbol ||
          quoteAt < alert.armedAt ||
          (alert.lastQuoteAt !== null && quoteAt <= alert.lastQuoteAt) ||
          (alert.repeat &&
            alert.lastTriggeredAt !== null &&
            receivedAt - alert.lastTriggeredAt < alert.cooldownMs)
        )
          return alert;
        const crossedUp =
          before &&
          before.timestamp >= alert.armedAt &&
          before.price < alert.price &&
          quote.last >= alert.price;
        const crossedDown =
          before &&
          before.timestamp >= alert.armedAt &&
          before.price > alert.price &&
          quote.last <= alert.price;
        const matches =
          alert.condition === "crossing"
            ? crossedUp || crossedDown
            : alert.condition === "crossing-up"
              ? crossedUp
              : alert.condition === "crossing-down"
                ? crossedDown
                : alert.condition === "above"
                  ? quote.last > alert.price
                  : quote.last < alert.price;
        if (!matches) return alert;
        events.push({
          id: newId(),
          alertId: alert.id,
          symbol,
          condition: alert.condition,
          target: alert.price,
          price: quote.last,
          triggeredAt: receivedAt,
          quoteAt,
        });
        return {
          ...alert,
          enabled: alert.repeat,
          lastTriggeredAt: receivedAt,
          lastQuoteAt: quoteAt,
        };
      });
      if (!events.length) return;
      // Save the one-shot/cooldown state before notifying, including when the panel is closed.
      try {
        publish({
          alerts,
          history: [...events.toReversed(), ...state.history].slice(0, MAX_HISTORY),
        });
      } catch (error) {
        // A failed save must not consume the crossing or prevent the same quote being retried.
        if (runtime.highWater === quoteAt) {
          runtime.highWater = oldHighWater;
          runtime.previous = previous;
        }
        throw error;
      }
      events.forEach((event) => options.onTrigger?.(event));
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      unsubscribe?.();
      coordinator.peers.delete(peer);
      runtime.members--;
      if (!runtime.members) coordinator.symbols.delete(symbol);
      if (!coordinator.peers.size) sharedPriceAlertStores.delete(storage);
      listeners.clear();
    },
  };
  const peer: PriceAlertPeer = { refresh };
  coordinator.peers.add(peer);
  const unsubscribe = storage.subscribe?.(refresh);
  return session;
}
