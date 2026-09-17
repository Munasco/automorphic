import { describe, expect, it, vi } from "vite-plus/test";
import type { Time } from "lightweight-charts";
import { createDrawingAlertFeed, type DrawingAlertFeedEvent } from "./drawingAlertFeed";
import { createDrawingAlertSession } from "./drawingAlerts";
import { emptyChartMarket, type ChartMarketSnapshot } from "./chartMarketQuery";
import type { Candle } from "./chartIndicators";
const START = Date.parse("2026-09-11T12:00:00Z");
const interval = { unit: "minute", value: 5 } as const;
const candle = (time = START / 1000, close = 100): Candle => ({
  time,
  open: 100,
  high: 110,
  low: 90,
  close,
  volume: 10,
});
const projection = { logicalAt: (time: Time) => (Number(time) - START / 1000) / 300 };
const event = (
  sequence: number,
  price = 100,
  timestamp = START + sequence,
): Extract<DrawingAlertFeedEvent, { type: "quote" }> => ({
  sequence,
  type: "quote",
  price,
  timestamp,
});
const snapshot = (
  events: DrawingAlertFeedEvent[] = [],
  patch: Partial<ChartMarketSnapshot> = {},
): ChartMarketSnapshot => ({
  ...emptyChartMarket(),
  bars: [candle()],
  awaitingHistory: false,
  alertFeed: { streamId: "stream-1", sequence: events.at(-1)?.sequence ?? 0, ready: true, events },
  ...patch,
});
function harness() {
  const sink = { observe: vi.fn(), resetConnection: vi.fn() };
  const feed = createDrawingAlertFeed({ symbol: "GCZ6", interval }, sink);
  feed.consume(snapshot(), projection);
  return { sink, feed };
}

describe("drawing alert live feed adapter", () => {
  it("replays every unseen quote in order after skipped cache snapshots without replaying old events", () => {
    const { sink, feed } = harness();
    feed.consume(snapshot([event(1, 99)]), projection);
    feed.consume(snapshot([event(1, 99), event(2, 101), event(3, 99)]), projection);
    feed.consume(snapshot([event(1, 99), event(2, 101), event(3, 99)]), projection);
    expect(sink.observe.mock.calls.map(([sample]) => sample.price)).toEqual([99, 101, 99]);
    expect(sink.observe.mock.calls.map(([sample]) => sample.sequence)).toEqual([1, 2, 3]);
    expect(sink.observe.mock.calls[0]![0]).toMatchObject({
      logical: 0,
      barId: `minute:5:${START / 1000}`,
      streamId: "stream-1",
    });
  });
  it("does not replay a newly mounted view's cached events or cross a reconnect/history boundary", () => {
    const { sink, feed } = harness();
    const cached = snapshot([event(1, 101)]);
    const mounted = createDrawingAlertFeed({ symbol: "GCZ6", interval }, sink);
    mounted.consume(cached, projection);
    expect(sink.observe).not.toHaveBeenCalled();
    feed.consume(snapshot([event(1, 99)]), projection);
    feed.consume(
      { ...cached, alertFeed: { ...cached.alertFeed!, streamId: "stream-2" } },
      projection,
    );
    expect(sink.observe).toHaveBeenCalledTimes(1);
    feed.consume({ ...cached, awaitingHistory: true }, projection);
    expect(sink.observe).toHaveBeenCalledTimes(1);
    expect(sink.resetConnection.mock.calls.length).toBeGreaterThan(2);
  });
  it("keeps ordered calendar events across full canvas replacements and resets only at a new feed epoch", () => {
    const sink = { observe: vi.fn(), resetConnection: vi.fn() };
    const feed = createDrawingAlertFeed(
      { symbol: "GCZ6", interval: { unit: "month", value: 1 } },
      sink,
    );
    const month = candle(Date.parse("2026-09-01T00:00:00Z") / 1000);
    const calendar = (events: DrawingAlertFeedEvent[], revision: number, streamId = "stream-1") =>
      snapshot(events, {
        bars: [month],
        // Calendar updates are complete snapshots; skipped revisions also require setData.
        replace: true,
        revision,
        alertFeed: { streamId, sequence: events.at(-1)?.sequence ?? 0, ready: true, events },
      });
    const quotes = [
      { ...event(1, 99), barTime: month.time },
      { ...event(2, 101), barTime: month.time },
    ];
    feed.consume(calendar([], 1), projection);
    feed.consume(calendar(quotes.slice(0, 1), 2), projection);
    feed.consume(calendar(quotes, 4), projection);
    expect(sink.observe.mock.calls.map(([sample]) => sample.price)).toEqual([99, 101]);
    expect(sink.resetConnection).toHaveBeenCalledTimes(1);

    // Reconnection may contain cached events, which must not replay or bridge a crossing.
    feed.consume(calendar(quotes, 5, "stream-2"), projection);
    expect(sink.observe).toHaveBeenCalledTimes(2);
    expect(sink.resetConnection).toHaveBeenCalledTimes(2);
    feed.consume(
      calendar([...quotes, { ...event(3, 98), barTime: month.time }], 6, "stream-2"),
      projection,
    );
    expect(sink.observe.mock.lastCall![0]).toMatchObject({
      price: 98,
      sequence: 3,
      streamId: "stream-2",
      intervalKey: "month:1",
    });
  });
  it("fails closed on a truncated journal gap rather than joining prices across missing events", () => {
    const { sink, feed } = harness();
    expect(feed.consume(snapshot([event(5, 101), event(6, 99)]), projection).status).toBe("gap");
    expect(sink.observe).not.toHaveBeenCalled();
    expect(feed.consume(snapshot([event(6, 99), event(7, 101)]), projection).processed).toBe(1);
  });
  it("waits for the correct new bar rather than putting an early quote in the prior bar", () => {
    const { sink, feed } = harness();
    const update = event(1, 101, START + 300_001);
    expect(feed.consume(snapshot([update]), projection).status).toBe("waiting-for-bar");
    expect(sink.observe).not.toHaveBeenCalled();
    feed.consume(snapshot([update], { bars: [candle(), candle(START / 1000 + 300)] }), projection);
    expect(sink.observe.mock.lastCall![0]).toMatchObject({
      logical: 1,
      barId: `minute:5:${START / 1000 + 300}`,
    });
  });
  it("does not associate a quote inside a market gap with an old candle", () => {
    const { sink, feed } = harness();
    feed.consume(
      snapshot([event(1, 101, START + 400_000)], { bars: [candle(), candle(START / 1000 + 3600)] }),
      projection,
    );
    expect(sink.observe).not.toHaveBeenCalled();
  });
  it("retains closed-bar values even if later chart corrections differ, and never derives closes from snapshots", () => {
    const { sink, feed } = harness();
    feed.consume(snapshot([], { bars: [candle(), candle(START / 1000 + 300)] }), projection);
    expect(sink.observe).not.toHaveBeenCalled();
    const closed: DrawingAlertFeedEvent = {
      sequence: 1,
      type: "bar-close",
      observedAt: START + 300_001,
      timestamp: START + 300_000,
      bar: candle(START / 1000, 101),
    };
    feed.consume(
      snapshot([closed], { bars: [candle(START / 1000, 105), candle(START / 1000 + 300)] }),
      projection,
    );
    expect(sink.observe.mock.lastCall![0]).toMatchObject({
      source: "bar-close",
      timestamp: START + 300_000,
      price: 101,
      logical: 0,
    });
  });
  it("requires explicit association for calendar/tick quotes, preserving synthetic display keys and real timestamps", () => {
    const sink = { observe: vi.fn(), resetConnection: vi.fn() };
    const feed = createDrawingAlertFeed(
      { symbol: "GCZ6", interval: { unit: "month", value: 1 } },
      sink,
    );
    feed.consume(snapshot(), projection);
    expect(feed.consume(snapshot([event(1)]), projection).status).toBe("unavailable");
    const tickFeed = createDrawingAlertFeed(
      { symbol: "GCZ6", interval: { unit: "tick", value: 10 } },
      sink,
    );
    const tick = {
      ...candle(),
      time: START / 1000 + 0.000001,
      actualTime: START / 1000,
      barId: "native:10:stable",
    };
    tickFeed.consume(snapshot([], { bars: [tick] }), projection);
    tickFeed.consume(snapshot([{ ...event(1), barTime: tick.time }], { bars: [tick] }), projection);
    expect(sink.observe.mock.lastCall![0]).toMatchObject({
      timestamp: START + 1,
      barId: tick.barId,
      barTime: tick.time,
      actualBarTime: tick.actualTime,
    });
  });
  it.each(["live", "reconnect", "overflow"] as const)(
    "evaluates vertical boundaries only from an intact live bar journal (%s)",
    (mode) => {
      for (const unit of ["minute", "tick"] as const) {
        const values = new Map<string, string>();
        let now = START;
        const onTrigger = vi.fn();
        const selectedInterval =
          unit === "minute"
            ? ({ unit: "minute", value: 5 } as const)
            : ({ unit: "tick", value: 10 } as const);
        const bars =
          unit === "minute"
            ? [candle(), candle(START / 1000 + 300)]
            : [
                { ...candle(100), actualTime: START / 1000 },
                { ...candle(101), actualTime: START / 1000 + 300 },
              ];
        const project = { logicalAt: (time: Time) => bars.findIndex((bar) => bar.time === time) };
        const engine = createDrawingAlertSession(
          { symbol: "GCZ6", intervalKey: `${unit}:${selectedInterval.value}` },
          {
            getItem: (key) => values.get(key) ?? null,
            setItem: (key, value) => {
              values.set(key, value);
            },
          },
          {
            now: () => now,
            onTrigger,
            projection: {
              ...project,
              priceToCoordinate: () => null,
              coordinateToPrice: () => null,
            },
          },
        );
        engine.syncDrawings([
          {
            id: "vertical",
            kind: "vertical",
            anchors: [{ time: bars[1]!.time as Time, price: 9000 }],
            color: "#2962ff",
            width: 2,
          },
        ]);
        expect(
          engine.add({
            drawingId: "vertical",
            condition: "crossing",
            trigger: "once",
            expiresAt: null,
          }),
        ).not.toBeNull();
        const feed = createDrawingAlertFeed({ symbol: "GCZ6", interval: selectedInterval }, engine);
        feed.consume(snapshot([], { bars }), project);
        now = START + 299_999;
        const first = { ...event(1, 88, now), barTime: bars[0]!.time };
        feed.consume(snapshot([first], { bars }), project);
        now++;
        const next = { ...event(mode === "overflow" ? 3 : 2, 89, now), barTime: bars[1]!.time };
        const update = snapshot([first, next], { bars });
        if (mode === "reconnect")
          update.alertFeed = { ...update.alertFeed!, streamId: "new-connection" };
        feed.consume(update, project);
        expect(onTrigger).toHaveBeenCalledTimes(mode === "live" ? 1 : 0);
        if (mode === "live")
          expect(onTrigger.mock.lastCall![0]).toMatchObject({
            targetKind: "time",
            targetTime: bars[1]!.time,
            barTime: bars[1]!.time,
            price: 89,
            sampleAt: now,
          });
        engine.dispose();
        feed.dispose();
      }
    },
  );
  it("feeds distinct same-ms quote crossings through the real engine without inventing timestamps", () => {
    const values = new Map<string, string>();
    const onTrigger = vi.fn();
    let now = START;
    const engine = createDrawingAlertSession(
      { symbol: "GCZ6", intervalKey: "minute:5" },
      {
        getItem: (k) => values.get(k) ?? null,
        setItem: (k, v) => {
          values.set(k, v);
        },
      },
      {
        now: () => now,
        onTrigger,
        projection: { ...projection, priceToCoordinate: (p) => p, coordinateToPrice: (p) => p },
      },
    );
    engine.syncDrawings([
      {
        id: "line",
        kind: "trend",
        color: "#2962ff",
        width: 1,
        anchors: [
          { time: (START / 1000) as Time, price: 100 },
          { time: (START / 1000 + 300) as Time, price: 100 },
        ],
      },
    ]);
    engine.add({ drawingId: "line", condition: "crossing-up", trigger: "once", expiresAt: null });
    const feed = createDrawingAlertFeed({ symbol: "GCZ6", interval }, engine);
    feed.consume(snapshot(), projection);
    now = START + 1;
    feed.consume(snapshot([event(1, 99, now), event(2, 101, now), event(3, 99, now)]), projection);
    expect(onTrigger).toHaveBeenCalledTimes(1);
    expect(onTrigger.mock.lastCall![0]).toMatchObject({ price: 101, sampleAt: now });
    feed.dispose();
    expect(feed.consume(snapshot([event(4)]), projection).status).toBe("unavailable");
  });
});
