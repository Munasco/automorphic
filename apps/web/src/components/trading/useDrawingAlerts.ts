import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { IChartApi, ISeriesApi, SeriesType } from "lightweight-charts";
import {
  createDrawingAlertSession,
  type DrawingAlertEvent,
  type NewDrawingAlert,
  type DrawingAlertState,
} from "./drawingAlerts";
import { createDrawingAlertFeed } from "./drawingAlertFeed";
import { drawingAlertTargetLabel } from "./drawingAlertPresentation";
import { drawingTimeCoordinate } from "./drawingPrimitive";
import { tradingWorkspaceStorage } from "./workspaceStorage";
import { chartIntervalKey, formatChartInterval, type ChartInterval } from "./tradingIntervals";
import type { ChartDrawingsController } from "./useChartDrawings";
import type { ChartMarketSnapshot } from "./chartMarketQuery";
import { useAlertNotifications } from "./useAlertNotifications";

const EMPTY: DrawingAlertState = { alerts: [], history: [] };
const noSubscribe = () => () => {};
const emptySnapshot = () => EMPTY;
const priceText = (price: number) => price.toLocaleString("en-US", { maximumFractionDigits: 6 });
type Session = ReturnType<typeof createDrawingAlertSession>;
type Feed = ReturnType<typeof createDrawingAlertFeed>;

/** Mounted charts coordinate evaluation by workspace, symbol and interval; panels never create sessions. */
export function useDrawingAlerts({
  chart,
  series,
  symbol,
  interval,
  drawings,
  logScale,
}: {
  chart: IChartApi | null;
  series: ISeriesApi<SeriesType> | null;
  symbol: string;
  interval: ChartInterval;
  drawings: ChartDrawingsController;
  logScale: boolean;
}) {
  const workspace = useSyncExternalStore(
    tradingWorkspaceStorage.subscribe,
    tradingWorkspaceStorage.getSnapshot,
  );
  const intervalKey = chartIntervalKey(interval);
  const identity = useMemo(
    () => ({
      chart,
      series,
      symbol,
      intervalKey,
      projectId: workspace.projectId,
      ready: workspace.ready,
    }),
    [chart, series, symbol, intervalKey, workspace.projectId, workspace.ready],
  );
  const [bundle, setBundle] = useState<{
    identity: typeof identity;
    session: Session;
    feed: Feed;
    projection: Parameters<Feed["consume"]>[1];
  } | null>(null);
  const active = bundle?.identity === identity ? bundle : null;
  const { getCommittedDrawings } = drawings;
  const state = useSyncExternalStore(
    active?.session.subscribe ?? noSubscribe,
    active?.session.getSnapshot ?? emptySnapshot,
    emptySnapshot,
  );
  const hasSoundAlerts = state.alerts.some(
    (alert) =>
      alert.enabled &&
      alert.symbol === symbol &&
      alert.intervalKey === intervalKey &&
      alert.notifications?.sound,
  );
  const { prepare, deliver: notify } = useAlertNotifications(hasSoundAlerts);
  const deliver = useCallback(
    (event: DrawingAlertEvent) => {
      notify({
        id: event.id,
        title: event.name || `${event.symbol} drawing alert`,
        body:
          event.message || `Price ${priceText(event.price)} · ${drawingAlertTargetLabel(event)}`,
        ...(event.notifications ? { notifications: event.notifications } : {}),
      });
    },
    [notify],
  );
  useEffect(() => {
    if (!chart || !series || !symbol || !workspace.ready) return;
    const projection = {
      logicalAt: (time: Parameters<typeof drawingTimeCoordinate>[2]) => {
        const x = drawingTimeCoordinate(chart, series, time);
        return x === null ? null : chart.timeScale().coordinateToLogical(x);
      },
      priceToCoordinate: (price: number) => series.priceToCoordinate(price),
      coordinateToPrice: (coordinate: number) => series.coordinateToPrice(coordinate),
    };
    const session = createDrawingAlertSession(
      { symbol, intervalKey },
      tradingWorkspaceStorage.capture(),
      { projection, onTrigger: deliver },
    );
    const committed = getCommittedDrawings();
    if (committed) session.syncDrawings(committed);
    const feed = createDrawingAlertFeed({ symbol, interval }, session);
    // Chart-owned external evaluators are created/disposed in effects, including Strict Mode remounts.
    // eslint-disable-next-line react/set-state-in-effect
    setBundle({ identity, session, feed, projection });
    return () => {
      feed.dispose();
      session.dispose();
    };
  }, [
    identity,
    chart,
    series,
    symbol,
    interval,
    intervalKey,
    workspace.ready,
    getCommittedDrawings,
    deliver,
  ]);
  useEffect(() => {
    if (!active) return;
    const committed = getCommittedDrawings();
    if (committed) active.session.syncDrawings(committed);
    // The committed snapshot changes independently of the stable accessor callback.
    // eslint-disable-next-line react/exhaustive-effect-dependencies
  }, [active, drawings.objects, getCommittedDrawings]);
  useEffect(() => {
    active?.feed.reset();
    // Changing the price transform invalidates the previous line-relative crossing baseline.
    // eslint-disable-next-line react/exhaustive-effect-dependencies
  }, [active, logScale]);
  useEffect(() => {
    if (!active) return;
    const next = state.alerts
      .filter(
        (alert) =>
          alert.symbol === symbol &&
          alert.intervalKey === intervalKey &&
          alert.enabled &&
          alert.expiresAt !== null,
      )
      .reduce((earliest, alert) => Math.min(earliest, alert.expiresAt!), Infinity);
    if (!Number.isFinite(next)) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const remaining = next - Date.now();
      if (remaining <= 0) {
        active.session.checkExpiration();
        return;
      }
      // Browser timers cannot represent more than about 25 days. Continue
      // waiting after that limit instead of losing a month-long expiration.
      timer = setTimeout(schedule, Math.min(2_147_483_647, remaining));
    };
    schedule();
    return () => clearTimeout(timer);
  }, [active, state.alerts, symbol, intervalKey]);
  const saveAlert = useCallback(
    async (input: NewDrawingAlert, alertId?: string): Promise<string | null> => {
      if (!active) return "The chart is still loading. Try again in a moment.";
      const notificationError = await prepare(
        input.notifications ?? { toast: true, sound: false, desktop: false },
      );
      if (notificationError) return notificationError;
      const committed = getCommittedDrawings();
      if (!committed) return "The drawing is no longer available.";
      active.session.syncDrawings(committed);
      try {
        return (alertId ? active.session.update(alertId, input) : active.session.add(input))
          ? null
          : alertId
            ? "Couldn't update the alert. Check the drawing and expiration."
            : "Couldn't create the alert. Check the drawing, expiration, and workspace alert limit.";
      } catch {
        return "Couldn't save the alert. Check your workspace connection and try again.";
      }
    },
    [active, getCommittedDrawings, prepare],
  );
  return useMemo(
    () => ({
      symbol,
      intervalKey,
      intervalLabel: formatChartInterval(interval),
      ready: active !== null,
      alerts: state.alerts.filter(
        (alert) => alert.symbol === symbol && alert.intervalKey === intervalKey,
      ),
      history: state.history.filter(
        (event) => event.symbol === symbol && event.intervalKey === intervalKey,
      ),
      create: (input: NewDrawingAlert) => saveAlert(input),
      update: (alertId: string, input: NewDrawingAlert) => saveAlert(input, alertId),
      drawingForAlert(alertId: string) {
        if (!active) return null;
        const alert = active.session
          .getSnapshot()
          .alerts.find(
            (item) =>
              item.id === alertId && item.symbol === symbol && item.intervalKey === intervalKey,
          );
        return alert
          ? (getCommittedDrawings()?.find((drawing) => drawing.id === alert.drawingId) ?? null)
          : null;
      },
      setEnabled: (id: string, enabled: boolean) =>
        active?.session.setEnabled(id, enabled) ?? false,
      remove: (id: string) => active?.session.remove(id) ?? false,
      clearHistory: () => active?.session.clearHistory() ?? false,
      removeHistoryEvent: (id: string) => active?.session.removeHistoryEvent(id) ?? false,
      consume(snapshot: ChartMarketSnapshot) {
        if (!active) return;
        const committed = getCommittedDrawings();
        if (committed) active.session.syncDrawings(committed);
        return active.feed.consume(snapshot, active.projection);
      },
      reset: () => active?.feed.reset(),
    }),
    [active, state, symbol, interval, intervalKey, getCommittedDrawings, saveAlert],
  );
}
export type DrawingAlertsController = ReturnType<typeof useDrawingAlerts>;
