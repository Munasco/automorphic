import type { Time } from "lightweight-charts";
import type { Candle } from "./chartIndicators";
import type { ChartMarketSnapshot } from "./chartMarketQuery";
import { chartIntervalKey, type ChartInterval } from "./tradingIntervals";
import type { DrawingAlertSample } from "./drawingAlerts";

export const MAX_DRAWING_ALERT_FEED_EVENTS = 2048;
export type DrawingAlertFeedEvent = { sequence: number; timestamp: number } & (
  | { type: "quote"; price: number; barTime?: number }
  | { type: "bar-close"; bar: Candle; observedAt: number }
);
export type DrawingAlertFeedJournal = {
  streamId: string;
  sequence: number;
  ready: boolean;
  events: readonly DrawingAlertFeedEvent[];
};
export type DrawingAlertFeedProjection = {
  logicalAt: (time: Time) => number | null;
  /** Required for calendar/tick quotes without an authoritative server barTime. */
  quoteBar?: (timestamp: number, bars: readonly Candle[]) => Candle | null;
};
export type DrawingAlertFeedResult = {
  status: "ready" | "warming" | "waiting-for-bar" | "gap" | "unavailable";
  processed: number;
};

/** Consume after the chart has rendered snapshot.bars. The cumulative journal survives both
 * 16ms UI batching and replacement of unread query snapshots. One adapter owns one evaluator.
 * Initial/cache, reconnect and overflow batches only establish a baseline; they cannot fire.
 * No clock-driven bar closure or quote-to-calendar/tick-bar guessing occurs here. */
export function createDrawingAlertFeed(
  context: { symbol: string; interval: ChartInterval },
  sink: { observe: (sample: DrawingAlertSample) => void; resetConnection: () => void },
) {
  let streamId: string | null = null;
  let cursor = 0;
  let disposed = false;
  let ready = false;
  const intervalKey = chartIntervalKey(context.interval);
  return {
    consume(
      snapshot: ChartMarketSnapshot,
      projection: DrawingAlertFeedProjection,
    ): DrawingAlertFeedResult {
      const journal = snapshot.alertFeed;
      if (disposed) return { status: "unavailable", processed: 0 };
      if (!journal || journal.streamId !== streamId || !journal.ready || snapshot.awaitingHistory) {
        sink.resetConnection();
        streamId = journal?.streamId ?? null;
        cursor = journal?.sequence ?? 0;
        ready = !!journal?.ready && !snapshot.awaitingHistory;
        return { status: ready ? "ready" : "warming", processed: 0 };
      }
      if (!ready) {
        sink.resetConnection();
        ready = true;
      }
      const events = journal.events.filter((event) => event.sequence > cursor);
      if (
        (events.length && events[0]!.sequence !== cursor + 1) ||
        (!events.length && journal.sequence > cursor)
      ) {
        sink.resetConnection();
        cursor = journal.sequence;
        return { status: "gap", processed: 0 };
      }
      let processed = 0;
      for (const event of events) {
        let bar: Candle | undefined;
        if (event.type === "bar-close") {
          bar = snapshot.bars.find((candidate) => candidate.time === event.bar.time);
        } else if (event.barTime !== undefined) {
          bar = snapshot.bars.find((candidate) => candidate.time === event.barTime);
        } else if (projection.quoteBar) {
          bar = projection.quoteBar(event.timestamp, snapshot.bars) ?? undefined;
        } else if (context.interval.unit === "minute" || context.interval.unit === "second") {
          const duration =
            context.interval.value * (context.interval.unit === "minute" ? 60_000 : 1000);
          // Work backwards through actual loaded bars. Closed-market gaps remain gaps.
          for (let i = snapshot.bars.length - 1; i >= 0; i--) {
            const candidate = snapshot.bars[i]!;
            const start = (candidate.actualTime ?? candidate.time) * 1000;
            if (start <= event.timestamp) {
              if (event.timestamp < start + duration) bar = candidate;
              break;
            }
          }
          if (
            !bar &&
            event.timestamp >=
              (snapshot.bars.at(-1)?.actualTime ?? snapshot.bars.at(-1)?.time ?? Infinity) * 1000
          )
            return { status: "waiting-for-bar", processed };
        } else {
          sink.resetConnection();
          cursor = event.sequence;
          return { status: "unavailable", processed };
        }
        if (!bar) {
          // A not-yet-rendered explicit bar can arrive in the next batched notification.
          if (event.type === "bar-close" || event.barTime !== undefined)
            return { status: "waiting-for-bar", processed };
          sink.resetConnection();
          cursor = event.sequence;
          continue;
        }
        const logical = projection.logicalAt(bar.time as Time);
        if (logical === null || !Number.isFinite(logical))
          return { status: "waiting-for-bar", processed };
        sink.observe({
          symbol: context.symbol,
          intervalKey,
          source: event.type,
          timestamp: event.timestamp,
          barId: bar.barId ?? `${intervalKey}:${bar.time}`,
          barTime: bar.time as Time,
          ...(bar.actualTime !== undefined ? { actualBarTime: bar.actualTime } : {}),
          logical,
          price: event.type === "quote" ? event.price : event.bar.close,
          ...(event.type === "bar-close" ? { observedAt: event.observedAt } : {}),
          sequence: event.sequence,
          streamId: journal.streamId,
        });
        cursor = event.sequence;
        processed++;
      }
      return { status: "ready", processed };
    },
    reset() {
      streamId = null;
      cursor = 0;
      ready = false;
      sink.resetConnection();
    },
    dispose() {
      disposed = true;
      sink.resetConnection();
    },
  };
}
