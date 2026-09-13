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
type AlertStorage = Pick<Storage, "getItem" | "setItem">;
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
  let state = parseChartAlerts(storage.getItem(CHART_ALERTS_KEY));
  let startedAt = now();
  let previous: { price: number; timestamp: number } | undefined;
  let highWater = 0;
  const listeners = new Set<() => void>();
  const publish = (next: ChartAlertState) => {
    storage.setItem(CHART_ALERTS_KEY, JSON.stringify({ version: 1, ...next }));
    state = next;
    listeners.forEach((listener) => listener());
  };
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    add: (input: NewChartAlert) => {
      if (!contract(symbol)) throw Error("Select a futures contract first.");
      if (!finite(input.price)) throw Error("Enter a valid target price.");
      if (!condition(input.condition) || !cooldown(input.cooldownMs))
        throw Error("Invalid alert settings.");
      if (state.alerts.length >= MAX_ALERTS)
        throw Error("Delete an alert before adding another (100 per workspace).");
      const alert: ChartPriceAlert = {
        ...input,
        id: newId(),
        symbol,
        enabled: true,
        armedAt: Math.max(now(), highWater + 1),
        lastTriggeredAt: null,
        lastQuoteAt: null,
      };
      publish({ ...state, alerts: [...state.alerts, alert] });
      return alert;
    },
    setEnabled: (id: string, enabled: boolean) => {
      publish({
        ...state,
        alerts: state.alerts.map((alert) =>
          alert.id === id ? { ...alert, enabled, armedAt: Math.max(now(), highWater + 1) } : alert,
        ),
      });
    },
    remove: (id: string) =>
      publish({ ...state, alerts: state.alerts.filter((alert) => alert.id !== id) }),
    clearHistory: () => publish({ ...state, history: [] }),
    observeQuote: (quote: MarketQuote | null) => {
      if (quote === null) {
        startedAt = now();
        previous = undefined;
        return;
      }
      const receivedAt = now();
      const quoteAt = typeof quote.timestamp === "string" ? Date.parse(quote.timestamp) : NaN;
      if (
        quote.symbol !== symbol ||
        quote.source !== "quote" ||
        !finite(quote.last) ||
        !finite(quoteAt) ||
        quoteAt < startedAt ||
        quoteAt <= highWater ||
        receivedAt - quoteAt > MAX_QUOTE_AGE_MS ||
        quoteAt - receivedAt > 5000
      )
        return;
      const before =
        previous && quoteAt - previous.timestamp <= MAX_QUOTE_AGE_MS ? previous : undefined;
      highWater = quoteAt;
      previous = { price: quote.last, timestamp: quoteAt };
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
      publish({
        alerts,
        history: [...events.toReversed(), ...state.history].slice(0, MAX_HISTORY),
      });
      events.forEach((event) => options.onTrigger?.(event));
    },
  };
}
