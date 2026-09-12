import { describe, expect, it, vi } from "vite-plus/test";
import type { Time } from "lightweight-charts";
import type { ChartDrawing } from "./drawingGeometry";
import {
  createDrawingAlertSession,
  drawingAlertTarget,
  parseDrawingAlerts,
  DRAWING_ALERTS_KEY,
  type DrawingAlertCondition,
  type DrawingAlertProjection,
  type DrawingAlertSample,
  type DrawingAlertTrigger,
} from "./drawingAlerts";

const EPOCH = Date.parse("2026-09-11T12:00:00Z");
const line = (patch: Partial<ChartDrawing> = {}): ChartDrawing => ({
  id: "line",
  kind: "trend",
  color: "#2962ff",
  width: 2,
  anchors: [
    { time: 0 as Time, price: 100 },
    { time: 10 as Time, price: 100 },
  ],
  ...patch,
});
const projection: DrawingAlertProjection = {
  logicalAt: (time) => Number(time),
  priceToCoordinate: (price) => -price,
  coordinateToPrice: (y) => -y,
};
function harness() {
  let time = EPOCH,
    nextId = 0;
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
  };
  const onTrigger = vi.fn();
  const open = (symbol = "GCZ6", intervalKey = "minute:5") =>
    createDrawingAlertSession({ symbol, intervalKey }, storage, {
      projection,
      now: () => time,
      id: () => `id-${++nextId}`,
      onTrigger,
    });
  const session = open();
  session.syncDrawings([line()]);
  const add = (
    condition: DrawingAlertCondition = "crossing",
    trigger: DrawingAlertTrigger = "once",
    expiresAt: number | null = null,
  ) => session.add({ drawingId: "line", condition, trigger, expiresAt })!;
  const sample = (
    price: number,
    patch: Partial<DrawingAlertSample> = {},
    advance = 1,
  ): DrawingAlertSample => {
    time += advance;
    return {
      symbol: "GCZ6",
      intervalKey: "minute:5",
      source: "quote",
      timestamp: time,
      barId: "bar-1",
      logical: 5,
      price,
      ...patch,
    };
  };
  return {
    session,
    open,
    add,
    sample,
    storage,
    values,
    onTrigger,
    advance: (ms: number) => {
      time += ms;
    },
    time: () => time,
  };
}

describe("drawing alert line projection", () => {
  it("uses actual logical spacing across closed-market gaps, not timestamp distance", () => {
    const times = [0, 60, 259260];
    const d = line({
      anchors: [
        { time: 0 as Time, price: 100 },
        { time: 259260 as Time, price: 120 },
      ],
    });
    expect(
      drawingAlertTarget(d, 1, { ...projection, logicalAt: (t) => times.indexOf(Number(t)) }),
    ).toBe(110);
  });
  it("interpolates in transformed chart coordinates for logarithmic price scales", () => {
    const d = line({
      anchors: [
        { time: 0 as Time, price: 100 },
        { time: 10 as Time, price: 400 },
      ],
    });
    expect(
      drawingAlertTarget(d, 5, {
        ...projection,
        priceToCoordinate: Math.log,
        coordinateToPrice: Math.exp,
      }),
    ).toBeCloseTo(200);
    expect(drawingAlertTarget(d, 5, projection)).toBe(250);
  });
  it("makes extent policy explicit, honors reversed rays, and handles horizontal lines", () => {
    const d = line({
      anchors: [
        { time: 10 as Time, price: 200 },
        { time: 0 as Time, price: 100 },
      ],
    });
    expect(drawingAlertTarget(d, 12, projection)).toBeNull();
    expect(drawingAlertTarget(d, 12, projection, "infinite")).toBe(220);
    expect(drawingAlertTarget({ ...d, extendRight: true }, 12, projection)).toBe(220);
    expect(drawingAlertTarget({ ...d, kind: "ray" }, -2, projection)).toBe(80);
    expect(drawingAlertTarget({ ...d, kind: "ray" }, 12, projection)).toBeNull();
    expect(drawingAlertTarget({ ...d, kind: "extended-line" }, 12, projection)).toBe(220);
    const horizontal = line({ kind: "horizontal", anchors: [{ time: 5 as Time, price: 42 }] });
    expect(drawingAlertTarget(horizontal, -10, projection)).toBe(42);
    expect(drawingAlertTarget({ ...horizontal, kind: "horizontal-ray" }, 4, projection)).toBeNull();
    expect(drawingAlertTarget({ ...horizontal, kind: "horizontal-ray" }, 5, projection)).toBe(42);
  });
  it("returns unavailable for missing projections, vertical lines, unsupported shapes, or invalid prices", () => {
    expect(drawingAlertTarget(line(), 5, { ...projection, logicalAt: () => null })).toBeNull();
    expect(
      drawingAlertTarget(line(), 5, { ...projection, priceToCoordinate: () => NaN }),
    ).toBeNull();
    expect(
      drawingAlertTarget(line(), 5, {
        ...projection,
        coordinateToPrice: () => {
          throw Error("disposed");
        },
      }),
    ).toBeNull();
    expect(
      drawingAlertTarget(
        line({
          anchors: [
            { time: 0 as Time, price: 100 },
            { time: 0 as Time, price: 110 },
          ],
        }),
        0,
        projection,
      ),
    ).toBeNull();
    expect(drawingAlertTarget(line({ kind: "rectangle" }), 5, projection)).toBeNull();
  });
});

describe("drawing alert sessions", () => {
  it("detects the line crossing stationary price as its bar-relative target changes", () => {
    const h = harness();
    h.session.syncDrawings([
      line({
        anchors: [
          { time: 0 as Time, price: 90 },
          { time: 10 as Time, price: 110 },
        ],
      }),
    ]);
    h.add("crossing-down");
    h.session.observe(h.sample(100, { logical: 4 }));
    h.onTrigger.mockImplementation(() => {
      const saved = parseDrawingAlerts(h.values.get(DRAWING_ALERTS_KEY)!);
      expect(saved.history[0]).toMatchObject({ price: 100, target: 100 });
      expect(saved.alerts[0]?.enabled).toBe(false);
    });
    h.session.observe(h.sample(100, { logical: 5 }));
    expect(h.onTrigger).toHaveBeenCalledTimes(1);
    h.session.observe(h.sample(99, { logical: 6 }));
    expect(h.onTrigger).toHaveBeenCalledTimes(1);
    expect(h.storage.setItem).toHaveBeenCalledTimes(2);
  });
  it.each([
    ["crossing-up", 99, 100],
    ["crossing-down", 101, 100],
    ["crossing", 99, 100],
    ["above", 100, 101],
    ["below", 100, 99],
  ] as const)(
    "evaluates %s with strict sides and inclusive crossings",
    (condition, first, last) => {
      const h = harness();
      h.add(condition);
      h.session.observe(h.sample(first));
      expect(h.onTrigger).not.toHaveBeenCalled();
      h.session.observe(h.sample(last));
      expect(h.onTrigger).toHaveBeenCalledTimes(1);
    },
  );
  it("suppresses repeated triggers in one bar, preserves suppression on reload, and admits the next bar", () => {
    const h = harness();
    h.add("above", "once-per-bar");
    h.session.observe(h.sample(101));
    h.session.observe(h.sample(102));
    const reopened = h.open();
    reopened.syncDrawings([line()]);
    reopened.observe(h.sample(103));
    expect(h.onTrigger).toHaveBeenCalledTimes(1);
    reopened.observe(h.sample(103, { barId: "bar-2", logical: 6 }));
    expect(h.onTrigger).toHaveBeenCalledTimes(2);
  });
  it("enforces a full sixty-second cooldown rather than a calendar-minute boundary", () => {
    const h = harness();
    h.add("above", "once-per-minute");
    h.session.observe(h.sample(101));
    h.session.observe(h.sample(101, {}, 59_999));
    expect(h.onTrigger).toHaveBeenCalledTimes(1);
    h.session.observe(h.sample(101));
    expect(h.onTrigger).toHaveBeenCalledTimes(2);
  });
  it("uses confirmed close samples only and compares consecutive close prices rather than intrabar quotes", () => {
    const h = harness();
    h.add("crossing-up", "once-per-bar-close");
    h.session.observe(h.sample(99, { source: "bar-close" }));
    h.session.observe(h.sample(101));
    h.session.observe(h.sample(110, { source: "bar-close" })); // same bar must not replace its confirmed close
    expect(h.onTrigger).not.toHaveBeenCalled();
    h.session.observe(h.sample(100, { source: "bar-close", barId: "bar-2", logical: 6 }, 300_000));
    expect(h.onTrigger).toHaveBeenCalledTimes(1);
    expect(h.session.getSnapshot().history[0]?.price).toBe(100);
  });
  it("ignores foreign, historical, stale, duplicate, future and out-of-order samples", () => {
    const h = harness();
    h.add();
    const first = h.sample(99);
    h.session.observe(first);
    for (const patch of [
      { symbol: "NQZ6" },
      { intervalKey: "minute:1" },
      { source: "snapshot" },
      { timestamp: first.timestamp },
      { timestamp: EPOCH - 1 },
      { timestamp: h.time() + 100_000 },
      { price: NaN },
      { logical: NaN },
    ])
      h.session.observe(h.sample(101, patch as Partial<DrawingAlertSample>));
    expect(h.onTrigger).not.toHaveBeenCalled();
    h.session.observe(h.sample(100));
    expect(h.onTrigger).toHaveBeenCalledTimes(1);
  });
  it("does not synthesize crossings across disconnects, stale gaps, unavailable geometry, or reload", () => {
    for (const gap of ["disconnect", "stale", "outside", "reload"] as const) {
      const h = harness();
      h.add();
      h.session.observe(h.sample(99));
      let session = h.session;
      if (gap === "disconnect") session.resetConnection();
      if (gap === "stale") h.advance(15_001);
      if (gap === "outside") session.observe(h.sample(99, { logical: 11 }));
      if (gap === "reload") {
        session = h.open();
        session.syncDrawings([line()]);
      }
      session.observe(h.sample(101));
      expect(h.onTrigger).not.toHaveBeenCalled();
      session.observe(h.sample(99));
      expect(h.onTrigger).toHaveBeenCalledTimes(1);
    }
  });
  it("re-arms geometry edits but ignores appearance changes, and snapshots are detached from callers", () => {
    const h = harness();
    h.add();
    h.session.observe(h.sample(99));
    const edited = line({
      anchors: [
        { time: 0 as Time, price: 99 },
        { time: 10 as Time, price: 99 },
      ],
    });
    h.session.syncDrawings([edited]);
    edited.anchors[0]!.price = 1000;
    h.session.observe(h.sample(100));
    expect(h.onTrigger).not.toHaveBeenCalled();
    h.session.syncDrawings([
      line({
        anchors: [
          { time: 0 as Time, price: 99 },
          { time: 10 as Time, price: 99 },
        ],
        color: "#ff0000",
        locked: true,
        hidden: true,
      }),
    ]);
    h.session.observe(h.sample(98));
    expect(h.onTrigger).toHaveBeenCalledTimes(1);
  });
  it("disables deleted targets and requires explicit enable after undo restores the drawing", () => {
    const h = harness();
    const a = h.add("above", "once-per-bar");
    h.session.syncDrawings([]);
    expect(h.session.getSnapshot().alerts[0]).toMatchObject({
      enabled: false,
      disabledReason: "deleted",
    });
    expect(h.session.setEnabled(a.id, true)).toBe(false);
    h.session.syncDrawings([line()]);
    h.session.observe(h.sample(101));
    expect(h.onTrigger).not.toHaveBeenCalled();
    expect(h.session.setEnabled(a.id, true)).toBe(true);
    h.session.observe(h.sample(101));
    expect(h.onTrigger).toHaveBeenCalledTimes(1);
  });
  it("expires at its deadline even with no quotes and cannot be re-enabled after expiration", () => {
    const h = harness();
    const a = h.add("above", "once", h.time() + 10);
    h.advance(10);
    h.session.checkExpiration();
    expect(h.session.getSnapshot().alerts[0]).toMatchObject({
      enabled: false,
      disabledReason: "expired",
    });
    expect(h.session.setEnabled(a.id, true)).toBe(false);
    h.session.observe(h.sample(101));
    expect(h.onTrigger).not.toHaveBeenCalled();
    expect(h.add("above", "once", h.time())).toBeNull();
  });
  it("preserves other symbols/intervals, rejects invalid additions, enforces limits, and disposes cleanly", () => {
    const h = harness();
    h.add();
    const other = h.open("NQZ6");
    other.syncDrawings([line()]);
    expect(other.getSnapshot().alerts).toHaveLength(1);
    expect(other.remove(other.getSnapshot().alerts[0]!.id)).toBe(false);
    expect(
      other.add({ drawingId: "missing", condition: "above", trigger: "once", expiresAt: null }),
    ).toBeNull();
    for (let i = 1; i < 100; i++) h.add();
    expect(h.add()).toBeNull();
    const listener = vi.fn();
    h.session.subscribe(listener);
    h.session.dispose();
    h.session.observe(h.sample(101));
    h.session.syncDrawings([]);
    expect(h.add()).toBeNull();
    expect(listener).not.toHaveBeenCalled();
  });
  it("does not overwrite another symbol's alerts or events when chart sessions interleave writes", () => {
    const h = harness();
    h.add("above", "once-per-bar");
    const other = h.open("NQZ6");
    other.syncDrawings([line()]);
    other.add({ drawingId: "line", condition: "above", trigger: "once", expiresAt: null });
    h.session.observe(h.sample(101));
    other.observe(h.sample(102, { symbol: "NQZ6" }));
    const persisted = parseDrawingAlerts(h.values.get(DRAWING_ALERTS_KEY)!);
    expect(persisted.alerts.map((a) => a.symbol).sort()).toEqual(["GCZ6", "NQZ6"]);
    expect(persisted.history.map((e) => e.symbol).sort()).toEqual(["GCZ6", "NQZ6"]);
  });
  it("strictly normalizes persisted data and does not import methods or unknown fields", () => {
    const h = harness();
    h.add("above");
    h.session.observe(h.sample(101));
    const state = h.session.getSnapshot();
    const parsed = parseDrawingAlerts(
      JSON.stringify({
        version: 1,
        alerts: [
          { ...state.alerts[0], evil: "ignored" },
          state.alerts[0],
          { ...state.alerts[0], id: "bad", condition: "eval" },
        ],
        history: [{ ...state.history[0], evil: "ignored" }],
      }),
    );
    expect(parsed).toEqual(state);
    expect(parseDrawingAlerts("{malformed")).toEqual({ alerts: [], history: [] });
    expect(parseDrawingAlerts(JSON.stringify({ version: 2, ...state }))).toEqual({
      alerts: [],
      history: [],
    });
  });
});
