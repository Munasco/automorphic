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
export const DRAWING_ALERT_CHANNEL_BOUNDARIES = ["upper", "lower"] as const;
export type DrawingAlertChannelBoundary = (typeof DRAWING_ALERT_CHANNEL_BOUNDARIES)[number];
const isChannelBoundary = (value: unknown): value is DrawingAlertChannelBoundary =>
  value === "upper" || value === "lower";
const validChannelBoundary = (drawing: ChartDrawing, value: unknown) =>
  drawing.kind === "channel" ? isChannelBoundary(value) : value === undefined;
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
  "vertical",
  "channel",
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
const isChartTime = (value: unknown): value is Time => drawingTimeValue(value) !== null;
const copyTime = (time: Time): Time =>
  typeof time === "object" ? { year: time.year, month: time.month, day: time.day } : time;
const targetKindFor = (drawing: ChartDrawing) =>
  drawing.kind === "vertical" ? ("time" as const) : ("price" as const);
const supportedRule = (
  targetKind: DrawingAlert["targetKind"],
  condition: unknown,
  trigger: unknown,
) =>
  isCondition(condition) &&
  isTrigger(trigger) &&
  (targetKind !== "time" || (condition === "crossing" && trigger === "once"));

/** Same affine interpolation as the rendered line, in logical X and transformed price Y.
 * Extent is an explicit product policy, not an assumption about the reference platform’s alert extrapolation.
 * Hidden/locked styles do not disarm alerts. */
export function drawingAlertTarget(
  drawing: ChartDrawing,
  logical: number,
  projection: DrawingAlertProjection,
  extent: DrawingAlertExtent = "visible",
  channelBoundary?: DrawingAlertChannelBoundary,
): number | null {
  if (
    !supportsDrawingAlert(drawing) ||
    drawing.kind === "vertical" ||
    !finite(logical) ||
    !validChannelBoundary(drawing, channelBoundary)
  )
    return null;
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
    const y = ay + ((by - ay) * (logical - ax)) / (bx - ax);
    const price = projection.coordinateToPrice(y);
    if (!finite(price)) return null;
    if (drawing.kind !== "channel") return price;
    const third = drawing.anchors[2]!;
    const cx = projection.logicalAt(third.time);
    const cy = projection.priceToCoordinate(third.price);
    if (!finite(cx) || !finite(cy)) return null;
    const baselineAtThird = ay + ((by - ay) * (cx - ax)) / (bx - ax);
    const opposite = projection.coordinateToPrice(y + cy - baselineAtThird);
    if (!finite(opposite)) return null;
    // Upper/lower refer to actual price, even if the chart's axis is inverted.
    return channelBoundary === "upper" ? Math.max(price, opposite) : Math.min(price, opposite);
  } catch {
    return null;
  }
}
function fingerprint(drawing: ChartDrawing) {
  if (drawing.kind === "vertical")
    return JSON.stringify([drawing.kind, drawingTimeValue(drawing.anchors[0]!.time)]);
  return JSON.stringify([
    drawing.kind,
    drawing.anchors.map((anchor) => [drawingTimeValue(anchor.time), anchor.price]),
    drawingLineExtensions(drawing),
  ]);
}
export type DrawingAlertNotifications = { toast: boolean; sound: boolean; desktop: boolean };
export type DrawingAlertPresentation = {
  name?: string;
  message?: string;
  notifications?: DrawingAlertNotifications;
};
function presentation(input: {
  name?: unknown;
  message?: unknown;
  notifications?: unknown;
}): DrawingAlertPresentation {
  const notifications = record(input.notifications) ? input.notifications : {};
  return {
    ...(typeof input.name === "string" && input.name.trim()
      ? { name: input.name.trim().slice(0, 100) }
      : {}),
    ...(typeof input.message === "string" && input.message.trim()
      ? { message: input.message.trim().slice(0, 2000) }
      : {}),
    notifications: {
      toast: typeof notifications.toast === "boolean" ? notifications.toast : true,
      sound: notifications.sound === true,
      desktop: notifications.desktop === true,
    },
  };
}
export type DrawingAlert = DrawingAlertPresentation & {
  id: string;
  symbol: string;
  intervalKey: string;
  drawingId: string;
  geometry: string;
  targetKind: "price" | "time";
  channelBoundary?: DrawingAlertChannelBoundary;
  condition: DrawingAlertCondition;
  trigger: DrawingAlertTrigger;
  expiresAt: number | null;
  enabled: boolean;
  disabledReason: "user" | "deleted" | "expired" | "triggered" | null;
  armedAt: number;
  lastTriggeredAt: number | null;
  lastSampleAt: number | null;
  lastSampleSequence: number | null;
  lastSampleStreamId: string | null;
  lastBarId: string | null;
};
export type DrawingAlertEvent = DrawingAlertPresentation & {
  channelBoundary?: DrawingAlertChannelBoundary;
  id: string;
  alertId: string;
  drawingId: string;
  symbol: string;
  intervalKey: string;
  condition: DrawingAlertCondition;
  price: number;
  barId: string;
  triggeredAt: number;
  sampleAt: number;
} & (
    | { targetKind: "price"; target: number }
    | { targetKind: "time"; targetTime: Time; barTime: Time; actualBarTime?: number }
  );
export type DrawingAlertState = { alerts: DrawingAlert[]; history: DrawingAlertEvent[] };
export type NewDrawingAlert = Pick<
  DrawingAlert,
  "drawingId" | "condition" | "trigger" | "expiresAt"
> &
  DrawingAlertPresentation & { channelBoundary?: DrawingAlertChannelBoundary };
export type DrawingAlertSample = {
  symbol: string;
  intervalKey: string;
  source: "quote" | "bar-close";
  /** Actual event time in milliseconds, not a chart's synthetic tick display key. */
  timestamp: number;
  /** Ordered transport journal identity; both fields are required to distinguish same-ms events. */
  /** Receipt time is permitted only for explicit live finality, never historical/cached closes. */
  observedAt?: number;
  sequence?: number;
  streamId?: string;
  barId: string;
  logical: number;
  price: number;
  /** Authoritative chart bar key, never a quote receipt time or an inferred clock bucket. */
  barTime?: Time;
  /** Real opening time in epoch seconds when the chart uses a synthetic bar key. */
  actualBarTime?: number;
};
export function parseDrawingAlerts(raw: string | null): DrawingAlertState {
  const empty: DrawingAlertState = { alerts: [], history: [] };
  if (!raw || raw.length > 1_000_000) return empty;
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
        ![undefined, "price", "time"].includes(a.targetKind as undefined) ||
        !supportedRule(a.targetKind === "time" ? "time" : "price", a.condition, a.trigger) ||
        (a.channelBoundary !== undefined &&
          (!isChannelBoundary(a.channelBoundary) || a.targetKind === "time")) ||
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
        ...presentation(a),
        ...(isChannelBoundary(a.channelBoundary) ? { channelBoundary: a.channelBoundary } : {}),
        id: a.id,
        symbol: a.symbol,
        intervalKey: a.intervalKey,
        drawingId: a.drawingId,
        geometry: a.geometry,
        targetKind: a.targetKind === "time" ? "time" : "price",
        condition: a.condition as DrawingAlertCondition,
        trigger: a.trigger as DrawingAlertTrigger,
        expiresAt: a.expiresAt,
        enabled: a.enabled,
        disabledReason: a.disabledReason as DrawingAlert["disabledReason"],
        armedAt: a.armedAt,
        lastTriggeredAt: a.lastTriggeredAt,
        lastSampleAt: a.lastSampleAt,
        lastSampleSequence:
          Number.isSafeInteger(a.lastSampleSequence) && (a.lastSampleSequence as number) >= 0
            ? (a.lastSampleSequence as number)
            : null,
        lastSampleStreamId: identifier(a.lastSampleStreamId) ? a.lastSampleStreamId : null,
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
        (e.channelBoundary !== undefined &&
          (!isChannelBoundary(e.channelBoundary) || e.targetKind === "time")) ||
        !finite(e.price) ||
        !(e.targetKind === "time"
          ? e.condition === "crossing" &&
            isChartTime(e.targetTime) &&
            isChartTime(e.barTime) &&
            (e.actualBarTime === undefined || finite(e.actualBarTime))
          : (e.targetKind === undefined || e.targetKind === "price") && finite(e.target)) ||
        !stamp(e.triggeredAt) ||
        !stamp(e.sampleAt)
      )
        continue;
      ids.add(e.id);
      empty.history.push({
        ...presentation(e),
        ...(isChannelBoundary(e.channelBoundary) ? { channelBoundary: e.channelBoundary } : {}),
        id: e.id,
        alertId: e.alertId,
        drawingId: e.drawingId,
        symbol: e.symbol,
        intervalKey: e.intervalKey,
        barId: e.barId,
        condition: e.condition,
        price: e.price,
        ...(e.targetKind === "time"
          ? {
              targetKind: "time" as const,
              targetTime: copyTime(e.targetTime as Time),
              barTime: copyTime(e.barTime as Time),
              ...(e.actualBarTime !== undefined
                ? { actualBarTime: e.actualBarTime as number }
                : {}),
            }
          : { targetKind: "price" as const, target: e.target as number }),
        triggeredAt: e.triggeredAt,
        sampleAt: e.sampleAt,
      });
    }
    return empty;
  } catch {
    return empty;
  }
}
type Previous = {
  difference: number;
  timestamp: number;
  observedAt: number;
  barId: string;
  barTime: number | null;
};
type DrawingAlertStorage = Pick<Storage, "getItem" | "setItem"> & {
  subscribe?: (listener: () => void) => () => void;
};
type SharedAlertPeer = {
  refresh: () => void;
  reset: () => void;
  observe: (sample: DrawingAlertSample) => void;
  projection: DrawingAlertProjection;
  armTime: () => number;
};
// A captured workspace store is shared by mounted charts in one document. Never key
// this coordination by symbol alone: separate workspaces can use identical contracts.
const sharedAlertStores = new WeakMap<
  object,
  {
    peers: Set<SharedAlertPeer>;
    evaluators: Map<string, Set<SharedAlertPeer>>;
  }
>();

/** One evaluator per symbol/interval. Pass only committed drawing snapshots and fresh live feed events.
 * Geometry edits re-arm; deletion disables, including after undo until explicitly re-enabled.
 * Close events must be confirmed by the feed, once for each actual completed bar. Their timestamp
 * is the close event time, not the candle start. Reload/reconnect never reconstruct crossings from history.
 * Call resetConnection on feed replacement or price-scale mode changes. Same-ms samples are
 * accepted only with an ordered transport sequence in the same stream epoch; event timestamps remain unchanged. */
export function createDrawingAlertSession(
  context: { symbol: string; intervalKey: string },
  storage: DrawingAlertStorage,
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
  let persisted = storage.getItem(DRAWING_ALERTS_KEY);
  let state = parseDrawingAlerts(persisted);
  let publishing = false;
  let shared = sharedAlertStores.get(storage);
  if (!shared) {
    shared = { peers: new Set(), evaluators: new Map() };
    sharedAlertStores.set(storage, shared);
  }
  const coordinator = shared;
  const contextKey = JSON.stringify([context.symbol, context.intervalKey]);
  let startedAt = now(),
    disposed = false;
  let drawings = new Map<string, ChartDrawing>();
  const previous = new Map<string, Previous>();
  const highWater = { quote: -1, "bar-close": -1 };
  let lastClosedBar: string | null = null;
  const orders = new Map<
    string,
    { timestamp: number; sequence: number | null; streamId: string | null }
  >();
  const after = (
    sample: DrawingAlertSample,
    previous: { timestamp: number; sequence: number | null; streamId: string | null },
  ) =>
    sample.timestamp > previous.timestamp ||
    (sample.timestamp === previous.timestamp &&
      sample.streamId !== undefined &&
      sample.streamId === previous.streamId &&
      sample.sequence !== undefined &&
      previous.sequence !== null &&
      sample.sequence > previous.sequence);
  const listeners = new Set<() => void>();
  const relevant = (a: Pick<DrawingAlert, "symbol" | "intervalKey">) =>
    a.symbol === context.symbol && a.intervalKey === context.intervalKey;
  const localArmTime = () => Math.max(now(), highWater.quote + 1, highWater["bar-close"] + 1);
  const armTime = () =>
    Math.max(
      localArmTime(),
      coordinator.evaluators.get(contextKey)?.values().next().value?.armTime() ?? 0,
    );
  const refresh = () => {
    if (disposed || publishing) return;
    const saved = storage.getItem(DRAWING_ALERTS_KEY);
    if (saved === persisted) return;
    const next = parseDrawingAlerts(saved);
    for (const alert of state.alerts.filter(relevant)) {
      const updated = next.alerts.find((item) => item.id === alert.id && relevant(item));
      if (
        !updated ||
        updated.enabled !== alert.enabled ||
        updated.geometry !== alert.geometry ||
        updated.armedAt !== alert.armedAt ||
        updated.condition !== alert.condition ||
        updated.trigger !== alert.trigger ||
        updated.targetKind !== alert.targetKind ||
        updated.channelBoundary !== alert.channelBoundary
      )
        previous.delete(alert.id);
    }
    persisted = saved;
    state = next;
    listeners.forEach((listener) => listener());
  };
  const publish = (next: DrawingAlertState) => {
    // Other chart contexts share workspace persistence; preserve their most recent writes.
    const saved = parseDrawingAlerts(storage.getItem(DRAWING_ALERTS_KEY));
    const history = [
      ...new Map(
        [
          ...saved.history.filter((event) => !relevant(event)),
          ...next.history.filter(relevant),
        ].map((event) => [event.id, event]),
      ).values(),
    ]
      .sort((a, b) => b.triggeredAt - a.triggeredAt)
      .slice(0, 100);
    const merged = {
      alerts: [...saved.alerts.filter((a) => !relevant(a)), ...next.alerts.filter(relevant)],
      history,
    };
    const serialized = JSON.stringify({ version: 1, ...merged });
    publishing = true;
    try {
      storage.setItem(DRAWING_ALERTS_KEY, serialized);
    } finally {
      publishing = false;
    }
    persisted = serialized;
    state = merged;
    for (const peer of coordinator.peers) peer.refresh();
    listeners.forEach((listener) => listener());
  };
  const expire = (alerts: DrawingAlert[], time: number) =>
    alerts.map((a) =>
      relevant(a) && a.enabled && a.expiresAt !== null && time >= a.expiresAt
        ? { ...a, enabled: false, disabledReason: "expired" as const }
        : a,
    );
  const session = {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      if (!disposed) listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    syncDrawings(snapshot: readonly ChartDrawing[]) {
      if (disposed) return;
      refresh();
      drawings = new Map(
        snapshot.filter(supportsDrawingAlert).map((d) => [d.id, structuredClone(d)]),
      );
      const alerts = expire(
        state.alerts.map((a) => {
          if (!relevant(a)) return a;
          const drawing = drawings.get(a.drawingId);
          if (
            !drawing ||
            targetKindFor(drawing) !== a.targetKind ||
            !validChannelBoundary(drawing, a.channelBoundary)
          ) {
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
      if (disposed) return null;
      refresh();
      const drawing = drawings.get(input.drawingId);
      if (
        disposed ||
        !drawing ||
        !validChannelBoundary(drawing, input.channelBoundary) ||
        !identifier(context.symbol) ||
        !identifier(context.intervalKey) ||
        !supportedRule(targetKindFor(drawing), input.condition, input.trigger) ||
        !(input.expiresAt === null || (stamp(input.expiresAt) && input.expiresAt > now())) ||
        parseDrawingAlerts(storage.getItem(DRAWING_ALERTS_KEY)).alerts.filter((a) => !relevant(a))
          .length +
          state.alerts.filter(relevant).length >=
          100
      )
        return null;
      const alert: DrawingAlert = {
        ...presentation(input),
        ...(input.channelBoundary ? { channelBoundary: input.channelBoundary } : {}),
        id: id(),
        ...context,
        drawingId: input.drawingId,
        condition: input.condition,
        trigger: input.trigger,
        expiresAt: input.expiresAt,
        geometry: fingerprint(drawing),
        targetKind: targetKindFor(drawing),
        enabled: true,
        disabledReason: null,
        armedAt: armTime(),
        lastTriggeredAt: null,
        lastSampleAt: null,
        lastSampleSequence: null,
        lastSampleStreamId: null,
        lastBarId: null,
      };
      publish({ ...state, alerts: [...state.alerts, alert] });
      return alert;
    },
    update(alertId: string, input: NewDrawingAlert): boolean {
      if (disposed) return false;
      refresh();
      const alert = state.alerts.find((item) => item.id === alertId && relevant(item));
      if (
        !alert ||
        input.drawingId !== alert.drawingId ||
        !drawings.has(alert.drawingId) ||
        targetKindFor(drawings.get(alert.drawingId)!) !== alert.targetKind ||
        !validChannelBoundary(drawings.get(alert.drawingId)!, input.channelBoundary) ||
        !supportedRule(alert.targetKind, input.condition, input.trigger) ||
        !(input.expiresAt === null || (stamp(input.expiresAt) && input.expiresAt > now()))
      )
        return false;
      const rearm =
        alert.condition !== input.condition ||
        alert.trigger !== input.trigger ||
        alert.channelBoundary !== input.channelBoundary;
      const retained = { ...alert };
      // Editable presentation fields are replacements, so clearing a field removes its old value.
      delete retained.name;
      delete retained.message;
      delete retained.channelBoundary;
      const updated: DrawingAlert = {
        ...retained,
        ...presentation(input),
        ...(input.channelBoundary ? { channelBoundary: input.channelBoundary } : {}),
        condition: input.condition,
        trigger: input.trigger,
        expiresAt: input.expiresAt,
        disabledReason:
          !alert.enabled &&
          (alert.disabledReason === "expired" || alert.disabledReason === "deleted")
            ? "user"
            : alert.disabledReason,
        ...(rearm ? { armedAt: armTime(), lastBarId: null } : {}),
      };
      publish({
        ...state,
        alerts: state.alerts.map((item) => (item === alert ? updated : item)),
      });
      // Leave the evaluator intact if persistence fails; a saved rule change starts fresh.
      if (rearm) previous.delete(alertId);
      return true;
    },
    setEnabled(alertId: string, enabled: boolean) {
      if (disposed) return false;
      refresh();
      const a = state.alerts.find((a) => a.id === alertId && relevant(a));
      if (
        !a ||
        a.enabled === enabled ||
        (enabled &&
          (!drawings.has(a.drawingId) ||
            targetKindFor(drawings.get(a.drawingId)!) !== a.targetKind ||
            !validChannelBoundary(drawings.get(a.drawingId)!, a.channelBoundary) ||
            (a.expiresAt !== null && a.expiresAt <= now())))
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
      if (disposed) return false;
      refresh();
      if (!state.alerts.some((a) => a.id === alertId && relevant(a))) return false;
      previous.delete(alertId);
      publish({ ...state, alerts: state.alerts.filter((a) => a.id !== alertId || !relevant(a)) });
      return true;
    },
    removeHistoryEvent(id: string) {
      if (disposed) return false;
      refresh();
      if (!state.history.some((event) => event.id === id && relevant(event))) return false;
      publish({
        ...state,
        history: state.history.filter((event) => event.id !== id || !relevant(event)),
      });
      return true;
    },
    clearHistory() {
      if (disposed) return false;
      refresh();
      if (!state.history.some(relevant)) return true;
      publish({ ...state, history: state.history.filter((event) => !relevant(event)) });
      return true;
    },
    resetConnection() {
      startedAt = now();
      previous.clear();
    },
    checkExpiration() {
      if (disposed) return;
      refresh();
      const alerts = expire(state.alerts, now());
      if (alerts.some((a, i) => a !== state.alerts[i])) publish({ ...state, alerts });
    },
    observe(sample: DrawingAlertSample) {
      if (disposed) return;
      refresh();
      const evaluator = coordinator.evaluators.get(contextKey)?.values().next().value;
      if (evaluator && evaluator !== peer) {
        let forwarded = sample;
        if (sample.barTime !== undefined) {
          try {
            const logical = evaluator.projection.logicalAt(sample.barTime);
            if (logical === null || !Number.isFinite(logical)) return;
            forwarded = { ...sample, logical };
          } catch {
            return;
          }
        }
        evaluator.observe(forwarded);
        return;
      }
      const time = now();
      const observedAt =
        sample.source === "bar-close" ? (sample.observedAt ?? sample.timestamp) : sample.timestamp;
      let alerts = expire(state.alerts, time);
      const events: DrawingAlertEvent[] = [];
      if (
        sample.symbol === context.symbol &&
        sample.intervalKey === context.intervalKey &&
        (sample.source === "quote" || sample.source === "bar-close") &&
        stamp(sample.timestamp) &&
        stamp(observedAt) &&
        observedAt >= startedAt &&
        ((sample.sequence === undefined && sample.streamId === undefined) ||
          (Number.isSafeInteger(sample.sequence) &&
            sample.sequence! >= 0 &&
            identifier(sample.streamId))) &&
        after(
          sample,
          orders.get(sample.source) ?? { timestamp: -1, sequence: null, streamId: null },
        ) &&
        (sample.source !== "bar-close" || sample.barId !== lastClosedBar) &&
        time - observedAt <= 15_000 &&
        observedAt - time <= 5000 &&
        sample.timestamp - time <= 5000 &&
        finite(sample.price) &&
        finite(sample.logical) &&
        identifier(sample.barId)
      ) {
        const previousStream = orders.get(sample.source)?.streamId;
        if (
          sample.streamId !== undefined &&
          previousStream != null &&
          sample.streamId !== previousStream
        )
          previous.clear();
        highWater[sample.source] = sample.timestamp;
        orders.set(sample.source, {
          timestamp: sample.timestamp,
          sequence: sample.sequence ?? null,
          streamId: sample.streamId ?? null,
        });
        if (sample.source === "bar-close") lastClosedBar = sample.barId;
        alerts = alerts.map((a) => {
          if (
            !relevant(a) ||
            !a.enabled ||
            (a.trigger === "once-per-bar-close") !== (sample.source === "bar-close") ||
            observedAt < a.armedAt ||
            (a.lastSampleAt !== null &&
              !after(sample, {
                timestamp: a.lastSampleAt,
                sequence: a.lastSampleSequence,
                streamId: a.lastSampleStreamId,
              }))
          )
            return a;
          const drawing = drawings.get(a.drawingId);
          const timeRule = a.targetKind === "time";
          const barTime = drawingTimeValue(sample.barTime);
          let target: number | null = null;
          if (drawing && targetKindFor(drawing) === a.targetKind) {
            if (timeRule) {
              try {
                target = options.projection.logicalAt(drawing.anchors[0]!.time);
              } catch {
                /* A detached chart cannot supply a time-boundary projection. */
              }
            } else
              target = drawingAlertTarget(
                drawing,
                sample.logical,
                options.projection,
                options.extent,
                a.channelBoundary,
              );
          }
          if (
            !finite(target) ||
            (timeRule &&
              (barTime === null ||
                (sample.actualBarTime !== undefined && !finite(sample.actualBarTime))))
          ) {
            previous.delete(a.id);
            return a;
          }
          const before = previous.get(a.id);
          if (
            timeRule &&
            before?.barTime !== undefined &&
            before.barTime !== null &&
            barTime! < before.barTime
          ) {
            previous.delete(a.id);
            return a;
          }
          // Time rules compare rendered bar positions, not market price or wall-clock time.
          const difference = (timeRule ? sample.logical : sample.price) - target;
          if (!finite(difference)) {
            previous.delete(a.id);
            return a;
          }
          previous.set(a.id, {
            difference,
            timestamp: sample.timestamp,
            observedAt,
            barId: sample.barId,
            barTime,
          });
          const continuous =
            before &&
            before.observedAt >= a.armedAt &&
            (sample.source === "bar-close"
              ? before.barId !== sample.barId
              : sample.timestamp - before.timestamp <= 15_000);
          const up = continuous && before.difference < 0 && difference >= 0;
          const down = continuous && before.difference > 0 && difference <= 0;
          const matches = timeRule
            ? up &&
              before.barId !== sample.barId &&
              before.barTime !== null &&
              barTime !== null &&
              barTime > before.barTime
            : a.condition === "above"
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
            ...presentation(a),
            ...(a.channelBoundary ? { channelBoundary: a.channelBoundary } : {}),
            id: id(),
            alertId: a.id,
            drawingId: a.drawingId,
            ...context,
            condition: a.condition,
            price: sample.price,
            ...(timeRule
              ? {
                  targetKind: "time" as const,
                  targetTime: copyTime(drawing!.anchors[0]!.time),
                  barTime: copyTime(sample.barTime!),
                  ...(sample.actualBarTime !== undefined
                    ? { actualBarTime: sample.actualBarTime }
                    : {}),
                }
              : { targetKind: "price" as const, target }),
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
            lastSampleSequence: sample.sequence ?? null,
            lastSampleStreamId: sample.streamId ?? null,
            lastBarId: sample.barId,
          };
        });
      }
      if (alerts.some((a, i) => a !== state.alerts[i]))
        publish({ alerts, history: [...events, ...state.history].slice(0, 100) });
      events.forEach((event) => options.onTrigger?.(event));
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribe?.();
      coordinator.peers.delete(peer);
      const evaluators = coordinator.evaluators.get(contextKey);
      const owned = evaluators?.values().next().value === peer;
      evaluators?.delete(peer);
      if (!evaluators?.size) coordinator.evaluators.delete(contextKey);
      else if (owned) evaluators.values().next().value?.reset();
      if (!coordinator.peers.size) sharedAlertStores.delete(storage);
      previous.clear();
      drawings.clear();
      listeners.clear();
    },
  };
  const peer: SharedAlertPeer = {
    refresh,
    reset: session.resetConnection,
    observe: session.observe,
    projection: options.projection,
    armTime: localArmTime,
  };
  coordinator.peers.add(peer);
  let evaluators = coordinator.evaluators.get(contextKey);
  if (!evaluators) {
    evaluators = new Set();
    coordinator.evaluators.set(contextKey, evaluators);
  }
  evaluators.add(peer);
  const unsubscribe = storage.subscribe?.(refresh);
  return session;
}
