import { describe, expect, it, vi } from "vite-plus/test";
import type { Time } from "lightweight-charts";
import type { ChartDrawing } from "./drawingGeometry";
import {
  createDrawingAlertSession,
  drawingAlertTarget,
  parseDrawingAlerts,
  supportsDrawingAlert,
  DRAWING_ALERTS_KEY,
  type DrawingAlertCondition,
  type DrawingAlertProjection,
  type DrawingAlertSample,
  type DrawingAlertTrigger,
  type NewDrawingAlert,
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

describe("vertical time-boundary alerts", () => {
  const vertical = (time = 5, patch: Partial<ChartDrawing> = {}) =>
    line({
      kind: "vertical",
      anchors: [{ time: time as Time, price: 9000 }],
      ...patch,
    });
  const setup = () => {
    const h = harness();
    h.session.syncDrawings([vertical()]);
    return h;
  };
  const position = (bar: number) => ({ logical: bar, barTime: bar as Time, barId: `bar-${bar}` });

  it("crosses only as an authoritative bar reaches the line, keeping quote price and clock time separate", () => {
    const h = setup();
    expect(supportsDrawingAlert(vertical())).toBe(true);
    expect(drawingAlertTarget(vertical(), 5, projection)).toBeNull();
    const alert = h.add();
    expect(alert.targetKind).toBe("time");
    h.session.observe(h.sample(70, position(4)));
    h.session.observe(h.sample(9500, position(4), 1000));
    expect(h.onTrigger).not.toHaveBeenCalled();
    h.session.observe(h.sample(70, { ...position(5), actualBarTime: EPOCH / 1000 }));
    expect(h.onTrigger).toHaveBeenCalledTimes(1);
    const event = h.onTrigger.mock.lastCall![0];
    expect(event).toMatchObject({
      targetKind: "time",
      targetTime: 5,
      barTime: 5,
      actualBarTime: EPOCH / 1000,
      price: 70,
      condition: "crossing",
    });
    expect(event).not.toHaveProperty("target");
    expect(event.sampleAt).toBeGreaterThan(EPOCH);
    expect(h.session.getSnapshot().alerts[0]).toMatchObject({
      enabled: false,
      disabledReason: "triggered",
    });
    h.session.observe(h.sample(80, position(6)));
    expect(h.onTrigger).toHaveBeenCalledTimes(1);
  });

  it("rejects price-direction conditions, repeating triggers and incompatible persisted time rules", () => {
    const h = setup();
    const alert = h.add();
    h.storage.setItem.mockClear();
    for (const condition of ["above", "below", "crossing-up", "crossing-down"] as const) {
      expect(h.add(condition)).toBeNull();
      expect(h.session.update(alert.id, { ...alert, condition })).toBe(false);
    }
    for (const trigger of ["once-per-bar", "once-per-bar-close", "once-per-minute"] as const) {
      expect(h.add("crossing", trigger)).toBeNull();
      expect(h.session.update(alert.id, { ...alert, trigger })).toBe(false);
    }
    expect(h.storage.setItem).not.toHaveBeenCalled();
    const invalid = parseDrawingAlerts(
      JSON.stringify({ version: 1, alerts: [{ ...alert, trigger: "once-per-bar" }], history: [] }),
    );
    expect(invalid.alerts).toEqual([]);
  });

  it.each(["initial", "reload", "reconnect", "stale"] as const)(
    "does not replay a passed boundary after %s baseline loss",
    (reason) => {
      const h = setup();
      h.add();
      if (reason !== "initial") h.session.observe(h.sample(100, position(4)));
      let session = h.session;
      if (reason === "reload") {
        session.dispose();
        session = h.open();
        session.syncDrawings([vertical()]);
      }
      if (reason === "reconnect") session.resetConnection();
      if (reason === "stale") h.advance(15_001);
      session.observe(h.sample(100, position(5)));
      session.observe(h.sample(100, position(6)));
      expect(h.onTrigger).not.toHaveBeenCalled();
    },
  );

  it("does not reconstruct a crossing from an old bar delivered after a newer bar", () => {
    const h = setup();
    h.add();
    h.session.observe(h.sample(100, position(6)));
    h.session.observe(h.sample(100, position(4)));
    h.session.observe(h.sample(100, position(6)));
    expect(h.onTrigger).not.toHaveBeenCalled();
  });

  it("rejects unassociated and stale events, and never evaluates time alerts on confirmed-close receipts", () => {
    const h = setup();
    h.add();
    h.session.observe(h.sample(100, position(4)));
    h.session.observe(
      h.sample(100, {
        ...position(5),
        source: "bar-close",
        timestamp: EPOCH - 300_000,
        observedAt: h.time() + 1,
      }),
    );
    expect(h.onTrigger).not.toHaveBeenCalled();
    h.session.observe(h.sample(100, { ...position(5), timestamp: EPOCH - 30_000 }));
    expect(h.onTrigger).not.toHaveBeenCalled();
    h.session.observe(h.sample(100, { logical: 5, barId: "bar-5" }));
    h.session.observe(h.sample(100, position(5)));
    expect(h.onTrigger).not.toHaveBeenCalled(); // missing association clears the crossing baseline
  });

  it("ignores stored price and appearance edits but rearms a moved time boundary", () => {
    const h = setup();
    h.add();
    h.session.observe(h.sample(100, position(4)));
    h.session.syncDrawings([
      vertical(5, {
        anchors: [{ time: 5 as Time, price: -200 }],
        extendAcrossPanes: false,
        showTimeLabel: false,
        color: "#ff0000",
      }),
    ]);
    h.session.observe(h.sample(100, position(5)));
    expect(h.onTrigger).toHaveBeenCalledTimes(1);

    const moved = setup();
    const alert = moved.add();
    moved.session.observe(moved.sample(100, position(4)));
    moved.session.syncDrawings([vertical(6)]);
    expect(moved.session.getSnapshot().alerts[0]!.armedAt).toBeGreaterThan(alert.armedAt);
    moved.session.observe(moved.sample(100, position(7)));
    expect(moved.onTrigger).not.toHaveBeenCalled();
  });

  it("retains a crossing across presentation edits and persists typed history and notification fields", () => {
    const h = setup();
    const alert = h.add();
    h.session.observe(h.sample(100, position(4)));
    expect(
      h.session.update(alert.id, {
        ...alert,
        name: "Opening window",
        message: "Check the chart",
        notifications: { toast: false, sound: true, desktop: false },
      }),
    ).toBe(true);
    h.session.observe(h.sample(101, position(5)));
    const expected = h.session.getSnapshot();
    expect(expected.history[0]).toMatchObject({
      name: "Opening window",
      message: "Check the chart",
      notifications: { toast: false, sound: true, desktop: false },
      price: 101,
      targetKind: "time",
      targetTime: 5,
    });
    h.session.dispose();
    const reopened = h.open();
    reopened.syncDrawings([vertical()]);
    expect(reopened.getSnapshot()).toEqual(expected);
    reopened.observe(h.sample(102, position(6)));
    expect(h.onTrigger).toHaveBeenCalledTimes(1);
  });

  it("keeps expiration, deletion, kind changes and explicit resume subject to the same live baseline guards", () => {
    const h = setup();
    const alert = h.add("crossing", "once", h.time() + 10);
    h.session.observe(h.sample(100, position(4)));
    h.advance(10);
    h.session.observe(h.sample(100, position(5)));
    expect(h.onTrigger).not.toHaveBeenCalled();
    expect(h.session.getSnapshot().alerts[0]!.disabledReason).toBe("expired");
    h.session.update(alert.id, { ...alert, expiresAt: null });
    expect(h.session.setEnabled(alert.id, true)).toBe(true);
    h.session.observe(h.sample(100, position(5)));
    expect(h.onTrigger).not.toHaveBeenCalled();
    h.session.syncDrawings([]);
    expect(h.session.getSnapshot().alerts[0]!.disabledReason).toBe("deleted");
    h.session.syncDrawings([line()]);
    expect(h.session.setEnabled(alert.id, true)).toBe(false);
    expect(h.session.update(alert.id, { ...alert, expiresAt: null })).toBe(false);
    h.session.syncDrawings([vertical()]);
    expect(h.session.setEnabled(alert.id, true)).toBe(true);
    h.session.observe(h.sample(100, position(6)));
    expect(h.onTrigger).not.toHaveBeenCalled();
  });

  it("normalizes legacy price targets and rejects malformed or ambiguous time history", () => {
    const h = setup();
    h.add();
    h.session.observe(h.sample(100, position(4)));
    h.session.observe(h.sample(101, position(5)));
    const history = h.session.getSnapshot().history[0]!;
    for (const patch of [
      { targetTime: "bad" },
      { barTime: null },
      { targetKind: "other" },
      { condition: "above" },
      { actualBarTime: "yesterday" },
    ]) {
      expect(
        parseDrawingAlerts(
          JSON.stringify({ version: 1, alerts: [], history: [{ ...history, ...patch }] }),
        ).history,
      ).toEqual([]);
    }
    const price = harness();
    price.add("above");
    price.session.observe(price.sample(101));
    const legacy = JSON.parse(price.values.get(DRAWING_ALERTS_KEY)!);
    delete legacy.alerts[0].targetKind;
    delete legacy.history[0].targetKind;
    expect(parseDrawingAlerts(JSON.stringify(legacy))).toEqual(price.session.getSnapshot());
  });
});

describe("editing drawing alerts", () => {
  it("replaces presentation without losing identity, trigger history, throttles or persisted state", () => {
    const h = harness();
    const alert = h.session.add({
      drawingId: "line",
      condition: "above",
      trigger: "once-per-bar",
      expiresAt: null,
      name: "Original",
      message: "Original message",
    })!;
    h.session.observe(h.sample(101, { sequence: 2, streamId: "quotes" }));
    const before = h.session.getSnapshot();
    const listener = vi.fn();
    h.session.subscribe(listener);
    h.storage.setItem.mockClear();
    expect(
      h.session.update(alert.id, {
        ...alert,
        name: " ",
        message: "",
        notifications: { toast: false, sound: true, desktop: false },
      }),
    ).toBe(true);
    const after = h.session.getSnapshot();
    expect(after.history).toEqual(before.history);
    const expected = {
      ...before.alerts[0]!,
      notifications: { toast: false, sound: true, desktop: false },
    };
    delete expected.name;
    delete expected.message;
    expect(after.alerts).toEqual([expected]);
    expect(h.storage.setItem).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(1);
    h.session.observe(h.sample(102));
    expect(h.onTrigger).toHaveBeenCalledTimes(1);
    h.session.dispose();
    const reopened = h.open();
    reopened.syncDrawings([line()]);
    expect(reopened.getSnapshot()).toEqual(after);
    reopened.observe(h.sample(103));
    expect(h.onTrigger).toHaveBeenCalledTimes(1);
    reopened.observe(h.sample(103, { barId: "bar-2" }));
    expect(h.onTrigger).toHaveBeenCalledTimes(2);
    expect(h.onTrigger.mock.lastCall![0]).not.toHaveProperty("name");
    expect(h.onTrigger.mock.lastCall![0]).not.toHaveProperty("message");
  });

  it("preserves the live crossing baseline across metadata and future-expiry edits", () => {
    const h = harness();
    const alert = h.add("crossing-up", "once-per-bar", h.time() + 10_000);
    h.session.observe(h.sample(99));
    expect(
      h.session.update(alert.id, { ...alert, name: "Renamed", expiresAt: h.time() + 20_000 }),
    ).toBe(true);
    expect(h.session.getSnapshot().alerts[0]?.armedAt).toBe(alert.armedAt);
    h.session.observe(h.sample(100));
    expect(h.onTrigger).toHaveBeenCalledTimes(1);
    expect(h.onTrigger.mock.lastCall![0].name).toBe("Renamed");
  });

  it("does not invent a crossing from the old rule baseline after a condition edit", () => {
    const h = harness();
    const alert = h.add("crossing-down", "once-per-bar");
    h.session.observe(h.sample(99));
    expect(h.session.update(alert.id, { ...alert, condition: "crossing-up" })).toBe(true);
    expect(h.session.getSnapshot().alerts[0]?.armedAt).toBeGreaterThan(alert.armedAt);
    h.session.observe(h.sample(101));
    expect(h.onTrigger).not.toHaveBeenCalled();
    h.session.observe(h.sample(99));
    h.session.observe(h.sample(100));
    expect(h.onTrigger).toHaveBeenCalledTimes(1);
  });

  it("rearms a changed trigger, clears bar suppression, and retains monotonic replay guards", () => {
    const h = harness();
    const alert = h.add("above", "once-per-bar");
    const first = h.sample(101, { sequence: 7, streamId: "quotes" });
    h.session.observe(first);
    const previous = h.session.getSnapshot().alerts[0]!;
    expect(h.session.update(alert.id, { ...alert, trigger: "once-per-bar-close" })).toBe(true);
    const updated = h.session.getSnapshot().alerts[0]!;
    expect(updated).toMatchObject({
      lastBarId: null,
      lastTriggeredAt: previous.lastTriggeredAt,
      lastSampleAt: previous.lastSampleAt,
      lastSampleSequence: 7,
      lastSampleStreamId: "quotes",
    });
    // A fresh receipt cannot replay the already evaluated economic sample.
    h.session.observe({ ...first, source: "bar-close", observedAt: h.time() + 1 });
    expect(h.onTrigger).toHaveBeenCalledTimes(1);
    h.session.observe(
      h.sample(101, { source: "bar-close", barId: "bar-2", sequence: 8, streamId: "quotes" }),
    );
    expect(h.onTrigger).toHaveBeenCalledTimes(2);
  });

  it("keeps minute throttling through presentation edits and rule changes", () => {
    const h = harness();
    const alert = h.add("above", "once-per-minute");
    h.session.observe(h.sample(101));
    expect(h.session.update(alert.id, { ...alert, name: "New name" })).toBe(true);
    h.session.observe(h.sample(102));
    expect(h.session.update(alert.id, { ...alert, condition: "below" })).toBe(true);
    h.session.observe(h.sample(99));
    expect(h.onTrigger).toHaveBeenCalledTimes(1);
    h.session.observe(h.sample(99, {}, 60_000));
    expect(h.onTrigger).toHaveBeenCalledTimes(2);
  });

  it("keeps paused and already-triggered alerts disabled after editing", () => {
    for (const reason of ["user", "triggered"] as const) {
      const h = harness();
      const alert = h.add("above", "once");
      if (reason === "user") h.session.setEnabled(alert.id, false);
      else h.session.observe(h.sample(101));
      const triggers = h.onTrigger.mock.calls.length;
      expect(
        h.session.update(alert.id, { ...alert, trigger: "once-per-bar", name: "Edited" }),
      ).toBe(true);
      expect(h.session.getSnapshot().alerts[0]).toMatchObject({
        enabled: false,
        disabledReason: reason,
      });
      h.session.observe(h.sample(101));
      expect(h.onTrigger).toHaveBeenCalledTimes(triggers);
      expect(h.session.setEnabled(alert.id, true)).toBe(true);
      h.session.observe(h.sample(101));
      expect(h.onTrigger).toHaveBeenCalledTimes(triggers + 1);
    }
  });

  it("allows repaired expiry or restored drawing alerts to resume only after explicit enable", () => {
    for (const reason of ["expired", "deleted"] as const) {
      const h = harness();
      const alert = h.add("above", "once", h.time() + 10);
      if (reason === "expired") {
        h.advance(10);
        h.session.checkExpiration();
      } else {
        h.session.syncDrawings([]);
        h.session.syncDrawings([line()]);
      }
      expect(h.session.getSnapshot().alerts[0]?.disabledReason).toBe(reason);
      expect(h.session.update(alert.id, { ...alert, expiresAt: null })).toBe(true);
      expect(h.session.getSnapshot().alerts[0]).toMatchObject({
        enabled: false,
        disabledReason: "user",
      });
      h.session.observe(h.sample(101));
      expect(h.onTrigger).not.toHaveBeenCalled();
      expect(h.session.setEnabled(alert.id, true)).toBe(true);
      h.session.observe(h.sample(101));
      expect(h.onTrigger).toHaveBeenCalledTimes(1);
    }
  });

  it("rejects missing, foreign, retargeted and invalid edits without storage or listener changes", () => {
    const h = harness();
    const alert = h.add();
    h.session.syncDrawings([line(), line({ id: "another" })]);
    const other = h.open("NQZ6");
    other.syncDrawings([line()]);
    const foreign = other.add({ ...alert, drawingId: "line" })!;
    const listener = vi.fn();
    h.session.subscribe(listener);
    h.storage.setItem.mockClear();
    expect(h.session.update("missing", alert)).toBe(false);
    expect(h.session.update(foreign.id, alert)).toBe(false);
    expect(other.update(alert.id, alert)).toBe(false);
    for (const patch of [
      { drawingId: "another" },
      { condition: "invalid" },
      { trigger: "invalid" },
      { expiresAt: h.time() },
      { expiresAt: h.time() - 1 },
      { expiresAt: NaN },
      { expiresAt: Infinity },
    ])
      expect(h.session.update(alert.id, { ...alert, ...patch } as NewDrawingAlert)).toBe(false);
    expect(h.storage.setItem).not.toHaveBeenCalled();
    expect(listener).not.toHaveBeenCalled();
    h.session.syncDrawings([]);
    h.storage.setItem.mockClear();
    listener.mockClear();
    expect(h.session.update(alert.id, alert)).toBe(false);
    h.session.dispose();
    expect(h.session.update(alert.id, alert)).toBe(false);
    expect(h.storage.setItem).not.toHaveBeenCalled();
    expect(listener).not.toHaveBeenCalled();
  });

  it("merges newer foreign-context writes while preserving both histories", () => {
    const h = harness();
    const alert = h.add("above", "once-per-bar");
    const other = h.open("NQZ6");
    other.syncDrawings([line()]);
    const foreign = other.add({ ...alert, name: "Other" })!;
    h.session.observe(h.sample(101));
    other.observe(h.sample(102, { symbol: "NQZ6" }));
    expect(other.update(foreign.id, { ...foreign, name: "Latest other" })).toBe(true);
    expect(h.session.update(alert.id, { ...alert, name: "Updated own" })).toBe(true);
    const saved = parseDrawingAlerts(h.values.get(DRAWING_ALERTS_KEY)!);
    expect(saved.alerts.map((item) => item.name).sort()).toEqual(["Latest other", "Updated own"]);
    expect(saved.history.map((item) => item.symbol).sort()).toEqual(["GCZ6", "NQZ6"]);
  });

  it("leaves state and the crossing baseline unchanged when an edit cannot be saved", () => {
    const h = harness();
    const alert = h.add("crossing-up", "once-per-bar");
    h.session.observe(h.sample(99));
    const before = h.session.getSnapshot();
    const listener = vi.fn();
    h.session.subscribe(listener);
    h.storage.setItem.mockImplementationOnce(() => {
      throw Error("Storage unavailable");
    });
    expect(() => h.session.update(alert.id, { ...alert, condition: "crossing-down" })).toThrow(
      "Storage unavailable",
    );
    expect(h.session.getSnapshot()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
    h.session.observe(h.sample(101));
    expect(h.onTrigger).toHaveBeenCalledTimes(1);
  });
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
  it("accepts ordered same-ms events, persists their identity, and rejects replay or reordered events", () => {
    const h = harness();
    h.add("above", "once-per-bar");
    const first = h.sample(101, { sequence: 1, streamId: "stream" });
    h.session.observe(first);
    h.session.observe({ ...first, sequence: 2, barId: "bar-2" });
    expect(h.onTrigger).toHaveBeenCalledTimes(2);
    const reopened = h.open();
    reopened.syncDrawings([line()]);
    reopened.observe({ ...first, sequence: 1, barId: "bar-3" });
    reopened.observe({ ...first, sequence: 2, barId: "bar-3" });
    reopened.observe({ ...first, sequence: 3, streamId: "other", barId: "bar-3" });
    expect(h.onTrigger).toHaveBeenCalledTimes(2);
    reopened.observe({ ...first, sequence: 3, barId: "bar-3" });
    expect(h.onTrigger).toHaveBeenCalledTimes(3);
    expect(reopened.getSnapshot().alerts[0]).toMatchObject({
      lastSampleAt: first.timestamp,
      lastSampleSequence: 3,
      lastSampleStreamId: "stream",
    });
  });
  it("normalizes names, messages and notification preferences through persistence and trigger events", () => {
    const h = harness();
    const alert = h.session.add({
      drawingId: "line",
      condition: "above",
      trigger: "once",
      expiresAt: null,
      name: "  My line  ",
      message: "x".repeat(2100),
      notifications: { toast: false, sound: true, desktop: true },
    })!;
    expect(alert).toMatchObject({
      name: "My line",
      message: "x".repeat(2000),
      notifications: { toast: false, sound: true, desktop: true },
    });
    h.session.observe(h.sample(101));
    expect(h.onTrigger.mock.lastCall![0]).toMatchObject({
      name: alert.name,
      message: alert.message,
      notifications: alert.notifications,
    });
    const legacy = { ...alert };
    delete legacy.notifications;
    delete legacy.name;
    delete legacy.message;
    expect(
      parseDrawingAlerts(JSON.stringify({ version: 1, alerts: [legacy], history: [] })).alerts[0]
        ?.notifications,
    ).toEqual({ toast: true, sound: false, desktop: false });
  });
  it("uses fresh explicit close receipt for arming while preserving an old source boundary timestamp and replay guards", () => {
    const h = harness();
    h.add("above", "once-per-bar-close");
    const close = h.sample(101, {
      source: "bar-close",
      timestamp: EPOCH - 86_400_000,
      observedAt: EPOCH + 1,
      sequence: 1,
      streamId: "close-stream",
    });
    h.session.observe(close);
    expect(h.onTrigger).toHaveBeenCalledTimes(1);
    expect(h.onTrigger.mock.lastCall![0].sampleAt).toBe(EPOCH - 86_400_000);
    const reopened = h.open();
    reopened.syncDrawings([line()]);
    reopened.observe({ ...close, observedAt: h.time(), sequence: 2, streamId: "new-stream" });
    expect(h.onTrigger).toHaveBeenCalledTimes(1);
    h.advance(20_000);
    reopened.observe({
      ...close,
      barId: "bar-2",
      timestamp: close.timestamp + 300_000,
      sequence: 3,
    });
    expect(h.onTrigger).toHaveBeenCalledTimes(1); // cached receipt cannot become fresh again
  });
  it("clears only this context's log and does not resurrect it when another chart writes", () => {
    const h = harness();
    h.add("above", "once-per-bar");
    const other = h.open("NQZ6");
    other.syncDrawings([line()]);
    other.add({ drawingId: "line", condition: "above", trigger: "once-per-bar", expiresAt: null });
    h.session.observe(h.sample(101));
    other.observe(h.sample(102, { symbol: "NQZ6" }));
    h.session.clearHistory();
    expect(
      parseDrawingAlerts(h.values.get(DRAWING_ALERTS_KEY)!).history.map((e) => e.symbol),
    ).toEqual(["NQZ6"]);
    other.observe(h.sample(103, { symbol: "NQZ6", barId: "bar-2" }));
    expect(
      parseDrawingAlerts(h.values.get(DRAWING_ALERTS_KEY)!).history.map((e) => e.symbol),
    ).toEqual(["NQZ6", "NQZ6"]);
    h.session.observe(h.sample(104, { barId: "bar-2" }));
    other.clearHistory();
    expect(
      parseDrawingAlerts(h.values.get(DRAWING_ALERTS_KEY)!).history.map((e) => e.symbol),
    ).toEqual(["GCZ6"]);
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
