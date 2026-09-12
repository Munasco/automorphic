import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { IChartApi, ISeriesApi, SeriesType } from "lightweight-charts";
import {
  createDrawingAlertSession,
  type DrawingAlertEvent,
  type NewDrawingAlert,
  type DrawingAlertState,
} from "./drawingAlerts";
import { createDrawingAlertFeed } from "./drawingAlertFeed";
import { drawingTimeCoordinate } from "./drawingPrimitive";
import { tradingWorkspaceStorage } from "./workspaceStorage";
import { chartIntervalKey, type ChartInterval } from "./tradingIntervals";
import type { ChartDrawingsController } from "./useChartDrawings";
import type { ChartMarketSnapshot } from "./chartMarketQuery";
import { toastManager } from "../ui/toast";

const EMPTY: DrawingAlertState = { alerts: [], history: [] };
const noSubscribe = () => () => {};
const emptySnapshot = () => EMPTY;
const priceText = (price: number) => price.toLocaleString("en-US", { maximumFractionDigits: 6 });
type Session = ReturnType<typeof createDrawingAlertSession>;
type Feed = ReturnType<typeof createDrawingAlertFeed>;

/** The mounted chart owns one evaluator; opening a dialog/sidebar never creates another. */
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
  const sound = useRef<AudioContext | null>(null);
  const prepareSound = useCallback(async () => {
    if (!sound.current || sound.current.state === "closed") sound.current = new AudioContext();
    const context = sound.current;
    if (context.state !== "running") await context.resume();
    return context.state === "running";
  }, []);
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
  const deliver = useCallback((event: DrawingAlertEvent) => {
    const title = event.name || `${event.symbol} drawing alert`;
    const description =
      event.message || `Price ${priceText(event.price)} · Line ${priceText(event.target)}`;
    if (event.notifications?.toast !== false)
      toastManager.add({ type: "info", title, description });
    if (
      event.notifications?.desktop &&
      typeof Notification !== "undefined" &&
      Notification.permission === "granted"
    ) {
      try {
        const notification = new Notification(title, { body: description, tag: event.id });
        notification.addEventListener(
          "click",
          () => {
            window.focus();
            notification.close();
          },
          { once: true },
        );
      } catch {
        /* Toast and history remain available when the OS rejects delivery. */
      }
    }
    if (event.notifications?.sound && sound.current?.state === "running") {
      const context = sound.current;
      for (const [offset, frequency] of [
        [0, 880],
        [0.15, 1174],
      ] as const) {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0, context.currentTime + offset);
        gain.gain.linearRampToValueAtTime(0.12, context.currentTime + offset + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + offset + 0.2);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(context.currentTime + offset);
        oscillator.stop(context.currentTime + offset + 0.21);
        oscillator.addEventListener(
          "ended",
          () => {
            oscillator.disconnect();
            gain.disconnect();
          },
          { once: true },
        );
      }
    }
  }, []);
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
  useEffect(
    () => () => {
      const context = sound.current;
      sound.current = null;
      if (context && context.state !== "closed") void context.close().catch(() => {});
    },
    [],
  );
  const state = useSyncExternalStore(
    active?.session.subscribe ?? noSubscribe,
    active?.session.getSnapshot ?? emptySnapshot,
    emptySnapshot,
  );
  const hasSoundAlerts = state.alerts.some(
    (alert) =>
      alert.symbol === symbol && alert.intervalKey === intervalKey && alert.notifications?.sound,
  );
  useEffect(() => {
    if (!active || !hasSoundAlerts) return;
    // Saved alerts survive reloads, AudioContexts do not. Resume on an ordinary
    // user gesture as well as Create, including after the browser suspends audio.
    const activate = () => {
      void prepareSound().catch(() => {});
    };
    document.addEventListener("pointerdown", activate, true);
    document.addEventListener("keydown", activate, true);
    return () => {
      document.removeEventListener("pointerdown", activate, true);
      document.removeEventListener("keydown", activate, true);
    };
  }, [active, hasSoundAlerts, prepareSound]);
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
  return useMemo(
    () => ({
      symbol,
      intervalKey,
      ready: active !== null,
      alerts: state.alerts.filter(
        (alert) => alert.symbol === symbol && alert.intervalKey === intervalKey,
      ),
      history: state.history.filter(
        (event) => event.symbol === symbol && event.intervalKey === intervalKey,
      ),
      async create(input: NewDrawingAlert): Promise<string | null> {
        if (!active) return "The chart is still loading. Try again in a moment.";
        if (input.notifications?.desktop) {
          if (typeof Notification === "undefined")
            return "Desktop notifications aren't supported here. Choose a toast or sound instead.";
          const permission =
            Notification.permission === "default"
              ? await Notification.requestPermission()
              : Notification.permission;
          if (permission !== "granted")
            return "Allow desktop notifications, or turn that option off.";
        }
        if (input.notifications?.sound) {
          try {
            if (!(await prepareSound()))
              return "Sound couldn't start. Turn sound off or try again.";
          } catch {
            return "Sound isn't available here. Turn sound off to create the alert.";
          }
        }
        const committed = getCommittedDrawings();
        if (!committed) return "The drawing is no longer available.";
        active.session.syncDrawings(committed);
        try {
          return active.session.add(input)
            ? null
            : "Couldn't create the alert. Check the drawing, expiration, and workspace alert limit.";
        } catch {
          return "Couldn't save the alert. Check your workspace connection and try again.";
        }
      },
      setEnabled: (id: string, enabled: boolean) =>
        active?.session.setEnabled(id, enabled) ?? false,
      remove: (id: string) => active?.session.remove(id) ?? false,
      clearHistory: () => active?.session.clearHistory() ?? false,
      consume(snapshot: ChartMarketSnapshot) {
        if (!active) return;
        const committed = getCommittedDrawings();
        if (committed) active.session.syncDrawings(committed);
        return active.feed.consume(snapshot, active.projection);
      },
      reset: () => active?.feed.reset(),
    }),
    [active, state, symbol, intervalKey, getCommittedDrawings, prepareSound],
  );
}
export type DrawingAlertsController = ReturnType<typeof useDrawingAlerts>;
