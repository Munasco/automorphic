import type { Time } from "lightweight-charts";
import { randomUUID } from "../../lib/utils";
import {
  drawingLineExtensions,
  drawingTimeValue,
  validDrawingAnchors,
  type ChartDrawing,
} from "./drawingGeometry";

export const DRAWING_ALERTS_KEY = "automorphic:drawing-alerts:v1";
export const DRAWING_ALERT_CONDITIONS = [
  "crossing",
  "crossing-up",
  "crossing-down",
  "above",
  "below",
] as const;
export const DRAWING_ALERT_TRIGGERS = [
  "once",
  "once-per-bar",
  "once-per-bar-close",
  "once-per-minute",
] as const;
export type DrawingAlertCondition = (typeof DRAWING_ALERT_CONDITIONS)[number];
export type DrawingAlertTrigger = (typeof DRAWING_ALERT_TRIGGERS)[number];
export type DrawingAlertExtent = "visible" | "infinite";
export type DrawingAlertProjection = {
  /** Use actual chart bar positions, including the drawing renderer's interpolation between bars. */
  logicalAt: (time: Time) => number | null;
  priceToCoordinate: (price: number) => number | null;
  coordinateToPrice: (coordinate: number) => number | null;
};
const KINDS = new Set([
  "trend",
  "info-line",
  "extended-line",
  "trend-angle",
  "ray",
  "arrow",
  "horizontal",
  "horizontal-ray",
]);
export const supportsDrawingAlert = (drawing: ChartDrawing) =>
  KINDS.has(drawing.kind) && validDrawingAnchors(drawing.kind, drawing.anchors);
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const stamp = (value: unknown): value is number =>
  finite(value) && value >= 0 && value <= 8_640_000_000_000_000;
const identifier = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 200;
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const isCondition = (value: unknown): value is DrawingAlertCondition =>
  DRAWING_ALERT_CONDITIONS.some((item) => item === value);
const isTrigger = (value: unknown): value is DrawingAlertTrigger =>
  DRAWING_ALERT_TRIGGERS.some((item) => item === value);

/** Same affine interpolation as the rendered line, in logical X and transformed price Y.
 * Extent is an explicit product policy, not an assumption about the reference platform’s alert extrapolation.
 * Hidden/locked styles do not disarm alerts. */
export function drawingAlertTarget(
  drawing: ChartDrawing,
  logical: number,
  projection: DrawingAlertProjection,
  extent: DrawingAlertExtent = "visible",
): number | null {
  if (!supportsDrawingAlert(drawing) || !finite(logical)) return null;
  try {
    const a = drawing.anchors[0]!;
    if (drawing.kind === "horizontal") return a.price;
    const ax = projection.logicalAt(a.time);
    if (!finite(ax)) return null;
    if (drawing.kind === "horizontal-ray")
      return extent === "infinite" || logical >= ax ? a.price : null;
    const b = drawing.anchors[1]!;
    const bx = projection.logicalAt(b.time);
    if (!finite(bx) || ax === bx) return null;
    const extension = drawingLineExtensions(drawing);
    if (
      extent === "visible" &&
      ((!extension.left && logical < Math.min(ax, bx)) ||
        (!extension.right && logical > Math.max(ax, bx)))
    )
      return null;
    const ay = projection.priceToCoordinate(a.price),
      by = projection.priceToCoordinate(b.price);
    if (!finite(ay) || !finite(by)) return null;
    const price = projection.coordinateToPrice(ay + ((by - ay) * (logical - ax)) / (bx - ax));
    return finite(price) ? price : null;
  } catch {
    return null;
  }
}
function fingerprint(drawing: ChartDrawing) {
  return JSON.stringify([
    drawing.kind,
    drawing.anchors.map((anchor) => [drawingTimeValue(anchor.time), anchor.price]),
    drawingLineExtensions(drawing),
  ]);
}
export type DrawingAlert = {
  id: string;
  symbol: string;
  intervalKey: string;
  drawingId: string;
  geometry: string;
  condition: DrawingAlertCondition;
  trigger: DrawingAlertTrigger;
  expiresAt: number | null;
  enabled: boolean;
  disabledReason: "user" | "deleted" | "expired" | "triggered" | null;
  armedAt: number;
  lastTriggeredAt: number | null;
  lastSampleAt: number | null;
  lastBarId: string | null;
};
export type DrawingAlertEvent = {
  id: string;
  alertId: string;
  drawingId: string;
  symbol: string;
  intervalKey: string;
  condition: DrawingAlertCondition;
  price: number;
  target: number;
  barId: string;
  triggeredAt: number;
  sampleAt: number;
};
export type DrawingAlertState = { alerts: DrawingAlert[]; history: DrawingAlertEvent[] };
export type NewDrawingAlert = Pick<
  DrawingAlert,
  "drawingId" | "condition" | "trigger" | "expiresAt"
>;
export type DrawingAlertSample = {
  symbol: string;
  intervalKey: string;
  source: "quote" | "bar-close";
  /** Actual event time in milliseconds, not a chart's synthetic tick display key. */
  timestamp: number;
  barId: string;
  logical: number;
  price: number;
};
export function parseDrawingAlerts(raw: string | null): DrawingAlertState {
  const empty: DrawingAlertState = { alerts: [], history: [] };
  if (!raw || raw.length > 500_000) return empty;
  try {
    const value: unknown = JSON.parse(raw);
    if (!record(value) || value.version !== 1) return empty;
    const ids = new Set<string>();
    for (const a of Array.isArray(value.alerts) ? value.alerts.slice(0, 100) : []) {
      if (
        !record(a) ||
        !identifier(a.id) ||
        ids.has(a.id) ||
        !identifier(a.symbol) ||
        !identifier(a.intervalKey) ||
        !identifier(a.drawingId) ||
        typeof a.geometry !== "string" ||
        a.geometry.length > 2000 ||
        !isCondition(a.condition) ||
        !isTrigger(a.trigger) ||
        !(a.expiresAt === null || stamp(a.expiresAt)) ||
        typeof a.enabled !== "boolean" ||
        ![null, "user", "deleted", "expired", "triggered"].includes(a.disabledReason as null) ||
        !stamp(a.armedAt) ||
        !(a.lastTriggeredAt === null || stamp(a.lastTriggeredAt)) ||
        !(a.lastSampleAt === null || stamp(a.lastSampleAt)) ||
        !(a.lastBarId === null || identifier(a.lastBarId))
      )
        continue;
      ids.add(a.id);
      empty.alerts.push({
        id: a.id,
        symbol: a.symbol,
        intervalKey: a.intervalKey,
        drawingId: a.drawingId,
        geometry: a.geometry,
        condition: a.condition,
        trigger: a.trigger,
        expiresAt: a.expiresAt,
        enabled: a.enabled,
        disabledReason: a.disabledReason as DrawingAlert["disabledReason"],
        armedAt: a.armedAt,
        lastTriggeredAt: a.lastTriggeredAt,
        lastSampleAt: a.lastSampleAt,
        lastBarId: a.lastBarId,
      });
    }
    ids.clear();
    for (const e of Array.isArray(value.history) ? value.history.slice(0, 100) : []) {
      if (
        !record(e) ||
        !identifier(e.id) ||
        ids.has(e.id) ||
        !identifier(e.alertId) ||
        !identifier(e.drawingId) ||
        !identifier(e.symbol) ||
        !identifier(e.intervalKey) ||
        !identifier(e.barId) ||
        !isCondition(e.condition) ||
        !finite(e.price) ||
        !finite(e.target) ||
        !stamp(e.triggeredAt) ||
        !stamp(e.sampleAt)
      )
        continue;
      ids.add(e.id);
      empty.history.push({
        id: e.id,
        alertId: e.alertId,
        drawingId: e.drawingId,
        symbol: e.symbol,
        intervalKey: e.intervalKey,
        barId: e.barId,
        condition: e.condition,
        price: e.price,
        target: e.target,
        triggeredAt: e.triggeredAt,
        sampleAt: e.sampleAt,
      });
    }
    return empty;
  } catch {
    return empty;
  }
}
type Previous = { difference: number; timestamp: number; barId: string };
/** One evaluator per symbol/interval. Pass only committed drawing snapshots and fresh live feed events.
 * Geometry edits re-arm; deletion disables, including after undo until explicitly re-enabled.
 * Close events must be confirmed by the feed, once for each actual completed bar. Their timestamp
 * is the close event time, not the candle start. Reload/reconnect never reconstruct crossings from history.
 * Call resetConnection on feed replacement or price-scale mode changes. Same-ms samples are
 * conservatively rejected: supporting distinct same-ms trades requires authoritative feed sequence IDs. */
export function createDrawingAlertSession(
  context: { symbol: string; intervalKey: string },
  storage: Pick<Storage, "getItem" | "setItem">,
  options: {
    projection: DrawingAlertProjection;
    extent?: DrawingAlertExtent;
    now?: () => number;
    id?: () => string;
    onTrigger?: (event: DrawingAlertEvent) => void;
  },
) {
  const now = options.now ?? Date.now,
    id = options.id ?? randomUUID;
  let state = parseDrawingAlerts(storage.getItem(DRAWING_ALERTS_KEY));
  let startedAt = now(),
    disposed = false;
  let drawings = new Map<string, ChartDrawing>();
  const previous = new Map<string, Previous>();
  const highWater = { quote: -1, "bar-close": -1 };
  let lastClosedBar: string | null = null;
  const listeners = new Set<() => void>();
  const relevant = (a: DrawingAlert) =>
    a.symbol === context.symbol && a.intervalKey === context.intervalKey;
  const armTime = () => Math.max(now(), highWater.quote + 1, highWater["bar-close"] + 1);
  const publish = (next: DrawingAlertState) => {
    // Other chart contexts share workspace persistence; preserve their most recent writes.
    const saved = parseDrawingAlerts(storage.getItem(DRAWING_ALERTS_KEY));
    const history = [
      ...new Map([...saved.history, ...next.history].map((event) => [event.id, event])).values(),
    ]
      .sort((a, b) => b.triggeredAt - a.triggeredAt)
      .slice(0, 100);
    const merged = {
      alerts: [...saved.alerts.filter((a) => !relevant(a)), ...next.alerts.filter(relevant)],
      history,
    };
    storage.setItem(DRAWING_ALERTS_KEY, JSON.stringify({ version: 1, ...merged }));
    state = merged;
    listeners.forEach((listener) => listener());
  };
  const expire = (alerts: DrawingAlert[], time: number) =>
    alerts.map((a) =>
      relevant(a) && a.enabled && a.expiresAt !== null && time >= a.expiresAt
        ? { ...a, enabled: false, disabledReason: "expired" as const }
        : a,
    );
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      if (!disposed) listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    syncDrawings(snapshot: readonly ChartDrawing[]) {
      if (disposed) return;
      drawings = new Map(
        snapshot.filter(supportsDrawingAlert).map((d) => [d.id, structuredClone(d)]),
      );
      const alerts = expire(
        state.alerts.map((a) => {
          if (!relevant(a)) return a;
          const drawing = drawings.get(a.drawingId);
          if (!drawing) {
            previous.delete(a.id);
            return a.enabled ? { ...a, enabled: false, disabledReason: "deleted" as const } : a;
          }
          const geometry = fingerprint(drawing);
          if (a.geometry === geometry) return a;
          previous.delete(a.id);
          return { ...a, geometry, armedAt: armTime() };
        }),
        now(),
      );
      if (alerts.some((a, i) => a !== state.alerts[i])) publish({ ...state, alerts });
    },
    add(input: NewDrawingAlert): DrawingAlert | null {
      const drawing = drawings.get(input.drawingId);
      if (
        disposed ||
        !drawing ||
        !identifier(context.symbol) ||
        !identifier(context.intervalKey) ||
        !isCondition(input.condition) ||
        !isTrigger(input.trigger) ||
        !(input.expiresAt === null || (stamp(input.expiresAt) && input.expiresAt > now())) ||
        parseDrawingAlerts(storage.getItem(DRAWING_ALERTS_KEY)).alerts.filter((a) => !relevant(a))
          .length +
          state.alerts.filter(relevant).length >=
          100
      )
        return null;
      const alert: DrawingAlert = {
        id: id(),
        ...context,
        drawingId: input.drawingId,
        condition: input.condition,
        trigger: input.trigger,
        expiresAt: input.expiresAt,
        geometry: fingerprint(drawing),
        enabled: true,
        disabledReason: null,
        armedAt: armTime(),
        lastTriggeredAt: null,
        lastSampleAt: null,
        lastBarId: null,
      };
      publish({ ...state, alerts: [...state.alerts, alert] });
      return alert;
    },
    setEnabled(alertId: string, enabled: boolean) {
      if (disposed) return false;
      const a = state.alerts.find((a) => a.id === alertId && relevant(a));
      if (
        !a ||
        a.enabled === enabled ||
        (enabled && (!drawings.has(a.drawingId) || (a.expiresAt !== null && a.expiresAt <= now())))
      )
        return false;
      previous.delete(alertId);
      publish({
        ...state,
        alerts: state.alerts.map((item) =>
          item === a
            ? { ...a, enabled, disabledReason: enabled ? null : "user", armedAt: armTime() }
            : item,
        ),
      });
      return true;
    },
    remove(alertId: string) {
      if (disposed || !state.alerts.some((a) => a.id === alertId && relevant(a))) return false;
      previous.delete(alertId);
      publish({ ...state, alerts: state.alerts.filter((a) => a.id !== alertId || !relevant(a)) });
      return true;
    },
    resetConnection() {
      startedAt = now();
      previous.clear();
    },
    checkExpiration() {
      if (disposed) return;
      const alerts = expire(state.alerts, now());
      if (alerts.some((a, i) => a !== state.alerts[i])) publish({ ...state, alerts });
    },
    observe(sample: DrawingAlertSample) {
      if (disposed) return;
      const time = now();
      let alerts = expire(state.alerts, time);
      const events: DrawingAlertEvent[] = [];
      if (
        sample.symbol === context.symbol &&
        sample.intervalKey === context.intervalKey &&
        (sample.source === "quote" || sample.source === "bar-close") &&
        stamp(sample.timestamp) &&
        sample.timestamp >= startedAt &&
        sample.timestamp > highWater[sample.source] &&
        (sample.source !== "bar-close" || sample.barId !== lastClosedBar) &&
        time - sample.timestamp <= 15_000 &&
        sample.timestamp - time <= 5000 &&
        finite(sample.price) &&
        finite(sample.logical) &&
        identifier(sample.barId)
      ) {
        highWater[sample.source] = sample.timestamp;
        if (sample.source === "bar-close") lastClosedBar = sample.barId;
        alerts = alerts.map((a) => {
          if (
            !relevant(a) ||
            !a.enabled ||
            (a.trigger === "once-per-bar-close") !== (sample.source === "bar-close") ||
            sample.timestamp < a.armedAt ||
            (a.lastSampleAt !== null && sample.timestamp <= a.lastSampleAt)
          )
            return a;
          const drawing = drawings.get(a.drawingId);
          const target = drawing
            ? drawingAlertTarget(drawing, sample.logical, options.projection, options.extent)
            : null;
          if (target === null) {
            previous.delete(a.id);
            return a;
          }
          const before = previous.get(a.id);
          const difference = sample.price - target;
          if (!finite(difference)) {
            previous.delete(a.id);
            return a;
          }
          previous.set(a.id, { difference, timestamp: sample.timestamp, barId: sample.barId });
          const continuous =
            before &&
            before.timestamp >= a.armedAt &&
            (sample.source === "bar-close"
              ? before.barId !== sample.barId
              : sample.timestamp - before.timestamp <= 15_000);
          const up = continuous && before.difference < 0 && difference >= 0;
          const down = continuous && before.difference > 0 && difference <= 0;
          const matches =
            a.condition === "above"
              ? difference > 0
              : a.condition === "below"
                ? difference < 0
                : a.condition === "crossing-up"
                  ? up
                  : a.condition === "crossing-down"
                    ? down
                    : up || down;
          if (
            !matches ||
            ((a.trigger === "once-per-bar" || a.trigger === "once-per-bar-close") &&
              a.lastBarId === sample.barId) ||
            (a.trigger === "once-per-minute" &&
              a.lastTriggeredAt !== null &&
              time - a.lastTriggeredAt < 60_000)
          )
            return a;
          events.push({
            id: id(),
            alertId: a.id,
            drawingId: a.drawingId,
            ...context,
            condition: a.condition,
            price: sample.price,
            target,
            barId: sample.barId,
            triggeredAt: time,
            sampleAt: sample.timestamp,
          });
          return {
            ...a,
            enabled: a.trigger !== "once",
            disabledReason: a.trigger === "once" ? "triggered" : null,
            lastTriggeredAt: time,
            lastSampleAt: sample.timestamp,
            lastBarId: sample.barId,
          };
        });
      }
      if (alerts.some((a, i) => a !== state.alerts[i]))
        publish({ alerts, history: [...events, ...state.history].slice(0, 100) });
      events.forEach((event) => options.onTrigger?.(event));
    },
    dispose() {
      disposed = true;
      previous.clear();
      drawings.clear();
      listeners.clear();
    },
  };
}
