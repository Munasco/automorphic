import { describe, expect, it, vi } from "vite-plus/test";
import type { MarketQuote } from "./InstrumentHeader";
import {
  CHART_ALERTS_KEY,
  createChartAlertSession,
  parseChartAlerts,
  type NewChartAlert,
} from "./chartAlerts";

const EPOCH = Date.parse("2026-09-11T12:00:00Z");
function harness() {
  let currentTime = EPOCH;
  let id = 0;
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
  };
  const onTrigger = vi.fn();
  const open = (symbol = "MGCV6") =>
    createChartAlertSession(symbol, storage, {
      now: () => currentTime,
      id: () => `id-${++id}`,
      onTrigger,
    });
  const quote = (price: number, advance = 1, patch: Partial<MarketQuote> = {}) => {
    currentTime += advance;
    return {
      symbol: "MGCV6",
      last: price,
      source: "quote" as const,
      timestamp: new Date(currentTime).toISOString(),
      ...patch,
    };
  };
  return {
    open,
    quote,
    storage,
    values,
    onTrigger,
    advance: (ms: number) => {
      currentTime += ms;
    },
  };
}
const crossing = { price: 100, condition: "crossing" as const, repeat: false, cooldownMs: 60_000 };

describe("active chart price alerts", () => {
  it("requires two fresh quotes, fires exactly once on crossing, and saves before notifying", () => {
    const h = harness();
    const session = h.open();
    session.add(crossing);
    session.observeQuote(h.quote(99));
    expect(h.onTrigger).not.toHaveBeenCalled();
    h.onTrigger.mockImplementation(() => {
      const saved = parseChartAlerts(h.values.get(CHART_ALERTS_KEY)!);
      expect(saved.alerts[0]?.enabled).toBe(false);
      expect(saved.history).toHaveLength(1);
    });
    const crossingQuote = h.quote(100);
    session.observeQuote(crossingQuote);
    session.observeQuote(crossingQuote);
    session.observeQuote(h.quote(101, 60_000));
    expect(h.onTrigger).toHaveBeenCalledTimes(1);
    expect(session.getSnapshot().history[0]).toMatchObject({ target: 100, price: 100 });
    expect(h.storage.setItem).toHaveBeenCalledTimes(2);
  });

  it("rejects bars, other contracts, invalid timestamps, replayed, stale, and future quotes", () => {
    const h = harness();
    const session = h.open();
    session.add({ ...crossing, condition: "above" });
    session.observeQuote(h.quote(105, 1, { source: "bar" }));
    session.observeQuote(h.quote(105, 1, { symbol: "NQU6" }));
    session.observeQuote(h.quote(105, 1, { timestamp: "invalid" }));
    session.observeQuote(h.quote(105, 1, { timestamp: new Date(EPOCH - 1).toISOString() }));
    session.observeQuote(h.quote(105, 1, { timestamp: new Date(EPOCH + 100_000).toISOString() }));
    const old = h.quote(105);
    h.advance(20_000);
    session.observeQuote(old);
    const valid = h.quote(95);
    session.observeQuote(valid);
    session.observeQuote({ ...valid, last: 105 });
    expect(h.onTrigger).not.toHaveBeenCalled();
    session.observeQuote(h.quote(105));
    expect(h.onTrigger).toHaveBeenCalledTimes(1);
  });

  it("keeps disabled one-shot alerts and history after reload", () => {
    const h = harness();
    const session = h.open();
    session.add({ ...crossing, condition: "below" });
    session.observeQuote(h.quote(99));
    session.dispose();
    const reopened = h.open();
    reopened.observeQuote(h.quote(98, 120_000));
    expect(h.onTrigger).toHaveBeenCalledTimes(1);
    expect(reopened.getSnapshot().history).toHaveLength(1);
    expect(reopened.getSnapshot().alerts[0]?.enabled).toBe(false);
  });

  it("preserves repeating cooldown across reload and needs a newer actual quote", () => {
    const h = harness();
    const session = h.open();
    session.add({ ...crossing, condition: "above", repeat: true });
    const first = h.quote(101);
    session.observeQuote(first);
    session.dispose();
    const reopened = h.open();
    reopened.observeQuote(first);
    reopened.observeQuote(h.quote(102, 30_000));
    expect(h.onTrigger).toHaveBeenCalledTimes(1);
    reopened.observeQuote(h.quote(103, 30_000));
    expect(h.onTrigger).toHaveBeenCalledTimes(2);
    expect(reopened.getSnapshot().history).toHaveLength(2);
  });

  it("does not infer crossings across reload, disconnect, or a long quote gap", () => {
    const h = harness();
    const session = h.open();
    session.add({ ...crossing, repeat: true });
    session.observeQuote(h.quote(99));
    session.dispose();
    const reopened = h.open();
    reopened.observeQuote(h.quote(101));
    reopened.observeQuote(null);
    reopened.observeQuote(h.quote(99));
    reopened.observeQuote(h.quote(101, 20_000));
    expect(h.onTrigger).not.toHaveBeenCalled();
    reopened.observeQuote(h.quote(99));
    expect(h.onTrigger).toHaveBeenCalledTimes(1);
  });

  it("does not defer crossings that happened during cooldown", () => {
    const h = harness();
    const session = h.open();
    session.add({ ...crossing, repeat: true, cooldownMs: 1000 });
    session.observeQuote(h.quote(99));
    session.observeQuote(h.quote(101));
    session.observeQuote(h.quote(99, 100));
    session.observeQuote(h.quote(98, 1000));
    expect(h.onTrigger).toHaveBeenCalledTimes(1);
    session.observeQuote(h.quote(101));
    expect(h.onTrigger).toHaveBeenCalledTimes(2);
  });

  it("starts crossing detection after creation or re-enabling and supports deleting and clearing history", () => {
    const h = harness();
    const session = h.open();
    session.observeQuote(h.quote(99));
    const alert = session.add(crossing);
    session.observeQuote(h.quote(101));
    expect(h.onTrigger).not.toHaveBeenCalled();
    session.setEnabled(alert.id, false);
    session.observeQuote(h.quote(99));
    session.setEnabled(alert.id, true);
    session.observeQuote(h.quote(101));
    expect(h.onTrigger).not.toHaveBeenCalled();
    session.observeQuote(h.quote(99));
    expect(h.onTrigger).toHaveBeenCalledTimes(1);
    session.remove(alert.id);
    expect(session.getSnapshot().alerts).toEqual([]);
    expect(session.getSnapshot().history).toHaveLength(1);
    session.clearHistory();
    expect(h.open().getSnapshot()).toEqual({ alerts: [], history: [] });
  });

  it("allows a manually rearmed one-shot alert without applying the repeating cooldown", () => {
    const h = harness();
    const session = h.open();
    const alert = session.add({ ...crossing, condition: "above" });
    session.observeQuote(h.quote(101));
    session.setEnabled(alert.id, true);
    session.observeQuote(h.quote(102));
    expect(h.onTrigger).toHaveBeenCalledTimes(2);
  });

  it("waits for the alert's actual contract and preserves alerts when changing selection", () => {
    const h = harness();
    h.open().add({ ...crossing, condition: "above" });
    const nq = h.open("NQU6");
    nq.add({ ...crossing, condition: "above" });
    nq.observeQuote(h.quote(105));
    expect(h.onTrigger).not.toHaveBeenCalled();
    nq.observeQuote(h.quote(105, 1, { symbol: "NQU6" }));
    expect(h.onTrigger).toHaveBeenCalledTimes(1);
    expect(
      h
        .open()
        .getSnapshot()
        .alerts.find((alert) => alert.symbol === "MGCV6")?.enabled,
    ).toBe(true);
    h.open().observeQuote(h.quote(105));
    expect(h.onTrigger).toHaveBeenCalledTimes(2);
  });

  it("ignores malformed persisted records and rejects invalid new alerts", () => {
    const h = harness();
    const session = h.open();
    session.add(crossing);
    const saved = JSON.parse(h.values.get(CHART_ALERTS_KEY)!);
    saved.alerts.push({ ...saved.alerts[0], id: "invalid", cooldownMs: -1 });
    saved.alerts.push(saved.alerts[0]);
    saved.history = [{ id: "bad" }];
    expect(parseChartAlerts(JSON.stringify(saved))).toEqual(session.getSnapshot());
    expect(parseChartAlerts("broken")).toEqual({ alerts: [], history: [] });
    expect(() => session.add({ ...crossing, price: NaN })).toThrow("valid target");
  });
});

describe("directional chart price alerts", () => {
  it.each([
    ["crossing-up", 99, 100, true],
    ["crossing-up", 99, 101, true],
    ["crossing-up", 101, 100, false],
    ["crossing-up", 101, 99, false],
    ["crossing-up", 100, 101, false],
    ["crossing-up", 100, 100, false],
    ["crossing-down", 101, 100, true],
    ["crossing-down", 101, 99, true],
    ["crossing-down", 99, 100, false],
    ["crossing-down", 99, 101, false],
    ["crossing-down", 100, 99, false],
    ["crossing-down", 100, 100, false],
  ] as const)(
    "evaluates %s from %s to %s with inclusive arrival only",
    (condition, first, next, fires) => {
      const h = harness();
      const session = h.open();
      session.add({ ...crossing, condition });
      session.observeQuote(h.quote(first));
      expect(h.onTrigger).not.toHaveBeenCalled();
      const quote = h.quote(next);
      session.observeQuote(quote);
      session.observeQuote(quote);
      expect(h.onTrigger).toHaveBeenCalledTimes(fires ? 1 : 0);
      expect(session.getSnapshot().alerts[0]!.enabled).toBe(!fires);
      if (fires)
        expect(session.getSnapshot().history[0]).toMatchObject({
          condition,
          target: 100,
          price: next,
        });
    },
  );

  it.each(["crossing-up", "crossing-down"] as const)(
    "persists %s rules and event history and rejects unknown direction names",
    (condition) => {
      const h = harness();
      const session = h.open();
      const first = condition === "crossing-up" ? 99 : 101;
      session.add({ ...crossing, condition });
      session.dispose();
      const reopened = h.open();
      expect(reopened.getSnapshot().alerts[0]!.condition).toBe(condition);
      reopened.observeQuote(h.quote(first));
      reopened.observeQuote(h.quote(100));
      const saved = parseChartAlerts(h.values.get(CHART_ALERTS_KEY)!);
      expect(saved.alerts[0]!.condition).toBe(condition);
      expect(saved.history[0]).toMatchObject({ condition, price: 100, target: 100 });
      expect(h.open().getSnapshot()).toEqual(saved);
      const bad = JSON.parse(h.values.get(CHART_ALERTS_KEY)!);
      bad.alerts.push({ ...bad.alerts[0], id: "bad-rule", condition: "crossing-sideways" });
      bad.history.push({ ...bad.history[0], id: "bad-event", condition: "crossing-sideways" });
      expect(parseChartAlerts(JSON.stringify(bad))).toEqual(saved);
    },
  );

  it.each(["crossing-up", "crossing-down"] as const)(
    "requires fresh continuous quotes for %s after reload, disconnect, gaps and rearming",
    (condition) => {
      const first = condition === "crossing-up" ? 99 : 101;
      const next = condition === "crossing-up" ? 101 : 99;
      for (const reason of ["reload", "disconnect", "gap", "rearm"] as const) {
        const h = harness();
        let session = h.open();
        const alert = session.add({ ...crossing, condition });
        session.observeQuote(h.quote(first));
        if (reason === "reload") {
          session.dispose();
          session = h.open();
        }
        if (reason === "disconnect") session.observeQuote(null);
        if (reason === "gap") h.advance(15_001);
        if (reason === "rearm") {
          session.setEnabled(alert.id, false);
          session.setEnabled(alert.id, true);
        }
        session.observeQuote(h.quote(next));
        expect(h.onTrigger).not.toHaveBeenCalled();
        session.observeQuote(h.quote(first));
        expect(h.onTrigger).not.toHaveBeenCalled();
        session.observeQuote(h.quote(100));
        expect(h.onTrigger).toHaveBeenCalledTimes(1);
      }
    },
  );

  it.each(["crossing-up", "crossing-down"] as const)(
    "does not defer a %s crossing during cooldown, including after reload",
    (condition) => {
      const h = harness();
      let session = h.open();
      const first = condition === "crossing-up" ? 99 : 101;
      const next = condition === "crossing-up" ? 101 : 99;
      session.add({ ...crossing, condition, repeat: true, cooldownMs: 1000 });
      session.observeQuote(h.quote(first));
      const triggered = h.quote(next);
      session.observeQuote(triggered);
      expect(h.onTrigger).toHaveBeenCalledTimes(1);
      session.dispose();
      session = h.open();
      session.observeQuote(triggered);
      session.observeQuote(h.quote(first, 100));
      session.observeQuote(h.quote(next, 100));
      session.observeQuote(h.quote(next, 1000));
      expect(h.onTrigger).toHaveBeenCalledTimes(1);
      session.observeQuote(h.quote(first));
      session.observeQuote(h.quote(100));
      expect(h.onTrigger).toHaveBeenCalledTimes(2);
      expect(parseChartAlerts(h.values.get(CHART_ALERTS_KEY)!).history).toHaveLength(2);
    },
  );
});

describe("editing chart price alerts", () => {
  it("rejects invalid, missing and foreign-symbol edits without a write or state change", () => {
    const h = harness();
    const session = h.open();
    const alert = session.add(crossing);
    const before = session.getSnapshot();
    const writes = h.storage.setItem.mock.calls.length;
    for (const patch of [
      { price: NaN },
      { price: Infinity },
      { condition: "crossing-sideways" },
      { cooldownMs: 999 },
      { cooldownMs: 86_400_001 },
      { repeat: "yes" },
    ])
      expect(session.update(alert.id, { ...crossing, ...patch } as NewChartAlert)).toBe(false);
    expect(session.update("missing", crossing)).toBe(false);
    const other = h.open("NQU6");
    expect(other.update(alert.id, { ...crossing, price: 200 })).toBe(false);
    expect(session.getSnapshot()).toBe(before);
    expect(other.getSnapshot()).toEqual(before);
    expect(h.storage.setItem).toHaveBeenCalledTimes(writes);
  });

  it("accepts a valid no-op without resetting an established crossing baseline", () => {
    const h = harness();
    const session = h.open();
    const alert = session.add(crossing);
    session.observeQuote(h.quote(99));
    const before = session.getSnapshot();
    const writes = h.storage.setItem.mock.calls.length;
    h.advance(100);
    expect(session.update(alert.id, crossing)).toBe(true);
    expect(session.getSnapshot()).toBe(before);
    expect(h.storage.setItem).toHaveBeenCalledTimes(writes);
    session.observeQuote(h.quote(100));
    expect(h.onTrigger).toHaveBeenCalledTimes(1);
  });

  it("keeps identity and paused state through edits and persists the new fields", () => {
    const h = harness();
    const session = h.open();
    const alert = session.add(crossing);
    session.setEnabled(alert.id, false);
    const edited = {
      price: 200,
      condition: "crossing-down" as const,
      repeat: true,
      cooldownMs: 5000,
    };
    h.advance(100);
    expect(session.update(alert.id, edited)).toBe(true);
    expect(session.getSnapshot().alerts[0]).toMatchObject({
      ...edited,
      id: alert.id,
      enabled: false,
    });
    expect(session.getSnapshot().alerts[0]!.armedAt).toBeGreaterThan(alert.armedAt);
    session.observeQuote(h.quote(201));
    session.observeQuote(h.quote(199));
    expect(h.onTrigger).not.toHaveBeenCalled();
    expect(h.open().getSnapshot()).toEqual(session.getSnapshot());
  });

  it("requires a fresh crossing after target and condition edits, including quotes already seen at a future timestamp", () => {
    const h = harness();
    const session = h.open();
    const alert = session.add(crossing);
    const beforeEdit = h.quote(199, 1, { timestamp: new Date(EPOCH + 4000).toISOString() });
    session.observeQuote(beforeEdit);
    expect(session.update(alert.id, { ...crossing, price: 200, condition: "crossing-up" })).toBe(
      true,
    );
    expect(session.getSnapshot().alerts[0]!.armedAt).toBe(EPOCH + 4001);
    session.observeQuote({ ...beforeEdit, last: 201 });
    h.advance(4000);
    session.observeQuote(h.quote(201));
    expect(h.onTrigger).not.toHaveBeenCalled();
    session.observeQuote(h.quote(199));
    session.observeQuote(h.quote(200));
    expect(h.onTrigger).toHaveBeenCalledTimes(1);
    expect(h.onTrigger.mock.lastCall![0]).toMatchObject({
      alertId: alert.id,
      condition: "crossing-up",
      target: 200,
    });
  });

  it("retains one-shot history and remains disabled until manually rearmed", () => {
    const h = harness();
    const session = h.open();
    const alert = session.add(crossing);
    session.observeQuote(h.quote(99));
    session.observeQuote(h.quote(100));
    const before = session.getSnapshot();
    expect(session.update(alert.id, { ...crossing, price: 200, condition: "crossing-down" })).toBe(
      true,
    );
    const edited = session.getSnapshot();
    expect(edited.history).toBe(before.history);
    expect(edited.alerts[0]).toMatchObject({
      id: alert.id,
      enabled: false,
      lastTriggeredAt: before.alerts[0]!.lastTriggeredAt,
      lastQuoteAt: before.alerts[0]!.lastQuoteAt,
    });
    session.observeQuote(h.quote(201));
    session.observeQuote(h.quote(199));
    expect(h.onTrigger).toHaveBeenCalledTimes(1);
    session.setEnabled(alert.id, true);
    session.observeQuote(h.quote(201));
    session.observeQuote(h.quote(200));
    expect(h.onTrigger).toHaveBeenCalledTimes(2);
    expect(session.getSnapshot().history.map((event) => event.target)).toEqual([200, 100]);
  });

  it("preserves a running repeating cooldown when the target changes and applies new frequency fields", () => {
    const h = harness();
    const session = h.open();
    const alert = session.add({ ...crossing, condition: "above", repeat: true, cooldownMs: 1000 });
    session.observeQuote(h.quote(101));
    const triggered = session.getSnapshot().alerts[0]!.lastTriggeredAt;
    h.advance(100);
    session.update(alert.id, {
      ...crossing,
      price: 200,
      condition: "above",
      repeat: true,
      cooldownMs: 2000,
    });
    expect(session.getSnapshot().alerts[0]!.lastTriggeredAt).toBe(triggered);
    session.observeQuote(h.quote(201, 1000));
    expect(h.onTrigger).toHaveBeenCalledTimes(1);
    session.observeQuote(h.quote(201, 1000));
    expect(h.onTrigger).toHaveBeenCalledTimes(2);
    session.update(alert.id, {
      ...crossing,
      price: 300,
      condition: "above",
      repeat: false,
      cooldownMs: 2000,
    });
    session.observeQuote(h.quote(301));
    expect(h.onTrigger).toHaveBeenCalledTimes(3);
    expect(session.getSnapshot().alerts[0]!.enabled).toBe(false);
  });

  it("leaves the old rule and crossing baseline intact if persistence rejects an edit", () => {
    const h = harness();
    const session = h.open();
    const alert = session.add(crossing);
    session.observeQuote(h.quote(99));
    const before = session.getSnapshot();
    const listener = vi.fn();
    session.subscribe(listener);
    h.storage.setItem.mockImplementationOnce(() => {
      throw Error("Storage unavailable");
    });
    expect(() => session.update(alert.id, { ...crossing, price: 200 })).toThrow(
      "Storage unavailable",
    );
    expect(session.getSnapshot()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
    session.observeQuote(h.quote(100));
    expect(h.onTrigger).toHaveBeenCalledTimes(1);
  });
});

describe("price alerts shared by mounted chart views", () => {
  it("synchronizes additions, edits, pause, deletion and history without resurrecting a peer's deleted alert", () => {
    const h = harness();
    const a = h.open();
    const b = h.open();
    const changedA = vi.fn();
    const changedB = vi.fn();
    a.subscribe(changedA);
    b.subscribe(changedB);
    const first = a.add(crossing);
    const second = b.add({ ...crossing, price: 200 });
    expect(a.getSnapshot()).toEqual(b.getSnapshot());
    expect(a.getSnapshot().alerts.map(({ id }) => id)).toEqual([first.id, second.id]);
    b.update(first.id, { ...crossing, price: 150 });
    expect(a.getSnapshot().alerts[0]!.price).toBe(150);
    a.setEnabled(second.id, false);
    expect(b.getSnapshot().alerts[1]!.enabled).toBe(false);
    b.setEnabled(second.id, true);
    a.remove(first.id);
    b.observeQuote(h.quote(199));
    a.observeQuote(h.quote(201));
    expect(h.onTrigger).toHaveBeenCalledTimes(1);
    expect(b.getSnapshot().alerts.map(({ id }) => id)).toEqual([second.id]);
    expect(b.getSnapshot().history[0]!.alertId).toBe(second.id);
    b.clearHistory();
    expect(a.getSnapshot()).toEqual(b.getSnapshot());
    expect(a.getSnapshot().history).toEqual([]);
    expect(parseChartAlerts(h.values.get(CHART_ALERTS_KEY)!)).toEqual(a.getSnapshot());
    expect(changedA).toHaveBeenCalledTimes(8);
    expect(changedB).toHaveBeenCalledTimes(8);
  });

  it.each([false, true])(
    "shares quote continuity and emits once regardless of which view receives first (reverse=%s)",
    (reverse) => {
      const h = harness();
      const a = h.open();
      const b = h.open();
      a.add({ ...crossing, repeat: true, cooldownMs: 1000 });
      const [first, second] = reverse ? [b, a] : [a, b];
      first.observeQuote(h.quote(99));
      const reached = h.quote(100);
      second.observeQuote(reached);
      first.observeQuote(reached);
      expect(h.onTrigger).toHaveBeenCalledTimes(1);
      expect(a.getSnapshot().history).toHaveLength(1);
      expect(b.getSnapshot()).toEqual(a.getSnapshot());
      first.dispose();
      second.observeQuote(h.quote(101, 1000));
      second.observeQuote(h.quote(99));
      expect(h.onTrigger).toHaveBeenCalledTimes(2);
    },
  );

  it("preserves crossing continuity when another alert changes or a new peer mounts with an empty quote", () => {
    const h = harness();
    const a = h.open();
    const first = a.add(crossing);
    a.observeQuote(h.quote(99));
    const b = h.open();
    b.observeQuote(null);
    const second = b.add({ ...crossing, price: 200 });
    b.update(second.id, { ...crossing, price: 300 });
    b.remove(second.id);
    b.observeQuote(h.quote(100));
    expect(h.onTrigger).toHaveBeenCalledTimes(1);
    expect(a.getSnapshot().history[0]!.alertId).toBe(first.id);
  });

  it("rearms edited rules against the shared quote high-water mark without replaying the old baseline", () => {
    const h = harness();
    const a = h.open();
    const b = h.open();
    const alert = a.add(crossing);
    a.observeQuote(h.quote(199, 1, { timestamp: new Date(EPOCH + 4000).toISOString() }));
    b.update(alert.id, { ...crossing, price: 200, condition: "crossing-up" });
    expect(a.getSnapshot().alerts[0]!.armedAt).toBe(EPOCH + 4001);
    h.advance(4000);
    a.observeQuote(h.quote(201));
    expect(h.onTrigger).not.toHaveBeenCalled();
    b.observeQuote(h.quote(199));
    a.observeQuote(h.quote(200));
    expect(h.onTrigger).toHaveBeenCalledTimes(1);
  });

  it("preserves other contracts and uses their own high-water mark when re-enabling from a peer", () => {
    const h = harness();
    const gold = h.open();
    const nq = h.open("NQU6");
    const a = gold.add(crossing);
    const b = nq.add({ ...crossing, condition: "above" });
    nq.observeQuote(
      h.quote(101, 1, { symbol: "NQU6", timestamp: new Date(EPOCH + 4000).toISOString() }),
    );
    expect(gold.getSnapshot().history[0]!.alertId).toBe(b.id);
    gold.setEnabled(b.id, true);
    expect(nq.getSnapshot().alerts[1]!.armedAt).toBe(EPOCH + 4001);
    gold.observeQuote(h.quote(99));
    gold.observeQuote(h.quote(100));
    expect(nq.getSnapshot().history.map(({ alertId }) => alertId)).toEqual([a.id, b.id]);
    nq.remove(a.id);
    expect(gold.getSnapshot().alerts.map(({ id }) => id)).toEqual([b.id]);
  });

  it("retains all views' authoritative state when persistence fails and lets a peer retry the same crossing", () => {
    const h = harness();
    const a = h.open();
    const b = h.open();
    const alert = a.add(crossing);
    a.observeQuote(h.quote(99));
    const before = a.getSnapshot();
    const changed = vi.fn();
    b.subscribe(changed);
    const fail = () => {
      throw Error("Storage unavailable");
    };
    h.storage.setItem.mockImplementationOnce(fail);
    expect(() => b.remove(alert.id)).toThrow("Storage unavailable");
    expect(a.getSnapshot()).toBe(before);
    expect(b.getSnapshot()).toEqual(before);
    h.storage.setItem.mockImplementationOnce(fail);
    const reached = h.quote(100);
    expect(() => a.observeQuote(reached)).toThrow("Storage unavailable");
    expect(h.onTrigger).not.toHaveBeenCalled();
    expect(changed).not.toHaveBeenCalled();
    expect(a.getSnapshot()).toBe(before);
    expect(b.getSnapshot()).toEqual(before);
    b.observeQuote(reached);
    expect(h.onTrigger).toHaveBeenCalledTimes(1);
    expect(changed).toHaveBeenCalledTimes(1);
    expect(a.getSnapshot()).toEqual(b.getSnapshot());
    expect(a.getSnapshot().alerts[0]!.enabled).toBe(false);
  });

  it("resets a genuine reconnect but does not replay cached quotes, and cold-starts after the last view disposes", () => {
    const h = harness();
    const a = h.open();
    const b = h.open();
    a.add(crossing);
    const old = h.quote(99);
    a.observeQuote(old);
    b.observeQuote(old);
    b.observeQuote(null);
    a.observeQuote(h.quote(101));
    expect(h.onTrigger).not.toHaveBeenCalled();
    a.dispose();
    b.dispose();
    const reopened = h.open();
    reopened.observeQuote(h.quote(99));
    expect(h.onTrigger).not.toHaveBeenCalled();
    reopened.observeQuote(h.quote(100));
    expect(h.onTrigger).toHaveBeenCalledTimes(1);
  });

  it("unregisters disposed sessions and isolates stores even for the same contract", () => {
    const h = harness();
    const other = harness();
    const a = h.open();
    const b = h.open();
    const unrelated = other.open();
    const alert = a.add(crossing);
    const listener = vi.fn();
    a.subscribe(listener);
    a.dispose();
    a.dispose();
    expect(a.update(alert.id, { ...crossing, price: 200 })).toBe(false);
    expect(a.remove(alert.id)).toBe(false);
    expect(a.setEnabled(alert.id, false)).toBe(false);
    expect(a.clearHistory()).toBe(false);
    expect(() => a.add(crossing)).toThrow("closed");
    a.observeQuote(h.quote(99));
    b.observeQuote(h.quote(100));
    expect(h.onTrigger).not.toHaveBeenCalled();
    b.update(alert.id, { ...crossing, price: 200 });
    expect(listener).not.toHaveBeenCalled();
    expect(unrelated.getSnapshot()).toEqual({ alerts: [], history: [] });
    expect(a.getSnapshot().alerts[0]!.price).toBe(100);
    b.observeQuote(h.quote(199));
    b.observeQuote(h.quote(200));
    expect(h.onTrigger).toHaveBeenCalledTimes(1);
    expect(other.onTrigger).not.toHaveBeenCalled();
  });

  it("refreshes externally subscribed storage changes and releases subscriptions on disposal", () => {
    const h = harness();
    const listeners = new Set<() => void>();
    const storage = {
      ...h.storage,
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    };
    const session = createChartAlertSession("MGCV6", storage, { now: () => EPOCH });
    const external = h.open();
    external.add(crossing);
    listeners.forEach((listener) => listener());
    expect(session.getSnapshot()).toEqual(external.getSnapshot());
    session.dispose();
    expect(listeners.size).toBe(0);
  });
});

describe("price alert names", () => {
  it("trims names on add and reload, accepts 80 characters, and preserves legacy unnamed rows and events", () => {
    const h = harness(),
      session = h.open();
    const named = session.add({ ...crossing, name: "  Initial balance breakout  " });
    const legacy = session.add({ ...crossing, price: 200 });
    const limit = session.add({ ...crossing, price: 300, name: `  ${"x".repeat(80)}  ` });
    expect(named.name).toBe("Initial balance breakout");
    expect(limit.name).toHaveLength(80);
    expect(legacy).not.toHaveProperty("name");
    session.observeQuote(h.quote(99));
    session.observeQuote(h.quote(100));
    const raw = JSON.parse(h.values.get(CHART_ALERTS_KEY)!);
    raw.alerts[0].name = "  Revised stored name  ";
    raw.history[0].name = "  Initial balance breakout  ";
    raw.history.push({ ...raw.history[0], id: "legacy-event", name: undefined });
    const restored = parseChartAlerts(JSON.stringify(raw));
    expect(restored.alerts[0]!.name).toBe("Revised stored name");
    expect(restored.history[0]!.name).toBe("Initial balance breakout");
    expect(restored.history[1]).not.toHaveProperty("name");
    expect(restored.alerts[1]).not.toHaveProperty("name");
    session.dispose();
    expect(h.open().getSnapshot().alerts[0]!.name).toBe("Initial balance breakout");
  });

  it("rejects invalid provided names atomically in add/update and excludes malformed stored rows", () => {
    const h = harness(),
      session = h.open();
    const alert = session.add({ ...crossing, name: "Valid" });
    session.observeQuote(h.quote(99));
    session.observeQuote(h.quote(100));
    const before = session.getSnapshot();
    h.storage.setItem.mockClear();
    for (const name of [null, 123, false, {}, [], "x".repeat(81)]) {
      expect(() => session.add({ ...crossing, name } as NewChartAlert)).toThrow();
      expect(session.update(alert.id, { ...crossing, name } as NewChartAlert)).toBe(false);
      const payload = {
        version: 1,
        alerts: [before.alerts[0], { ...before.alerts[0], id: "bad", name }],
        history: [before.history[0], { ...before.history[0], id: "bad-event", name }],
      };
      expect(parseChartAlerts(JSON.stringify(payload))).toEqual(before);
    }
    expect(session.getSnapshot()).toBe(before);
    expect(h.storage.setItem).not.toHaveBeenCalled();
  });

  it("preserves a pending crossing on rename and snapshots the name at trigger time", () => {
    const h = harness(),
      session = h.open();
    const alert = session.add({ ...crossing, name: "Original" });
    session.observeQuote(h.quote(99));
    h.advance(500);
    expect(session.update(alert.id, { ...crossing, name: "  Breakout  " })).toBe(true);
    expect(session.getSnapshot().alerts[0]).toEqual({ ...alert, name: "Breakout" });
    session.observeQuote(h.quote(100));
    expect(h.onTrigger).toHaveBeenCalledTimes(1);
    const event = session.getSnapshot().history[0]!;
    expect(event.name).toBe("Breakout");
    const fired = session.getSnapshot().alerts[0]!;
    h.advance(100);
    expect(session.update(alert.id, { ...crossing, name: "Reviewed trade" })).toBe(true);
    expect(session.getSnapshot().alerts[0]).toEqual({ ...fired, name: "Reviewed trade" });
    expect(session.getSnapshot().history[0]).toBe(event);
    expect(h.onTrigger.mock.calls[0]![0].name).toBe("Breakout");
    session.dispose();
    const restored = h.open().getSnapshot();
    expect(restored.alerts[0]!.name).toBe("Reviewed trade");
    expect(restored.history[0]!.name).toBe("Breakout");
  });

  it("does not reset cooldown or notification timestamps when a repeating alert is renamed", () => {
    const h = harness(),
      session = h.open();
    const rule = { ...crossing, condition: "above" as const, repeat: true, cooldownMs: 1000 };
    const alert = session.add({ ...rule, name: "First" });
    session.observeQuote(h.quote(101));
    const fired = session.getSnapshot().alerts[0]!;
    h.advance(500);
    session.update(alert.id, { ...rule, name: "Second" });
    expect(session.getSnapshot().alerts[0]).toEqual({ ...fired, name: "Second" });
    session.observeQuote(h.quote(102));
    expect(h.onTrigger).toHaveBeenCalledTimes(1);
    session.observeQuote(h.quote(103, 499));
    expect(h.onTrigger).toHaveBeenCalledTimes(2);
    expect(session.getSnapshot().history.map((event) => event.name)).toEqual(["Second", "First"]);
  });

  it("preserves omitted names, clears explicit blank names, and avoids identical normalized writes", () => {
    const h = harness(),
      session = h.open();
    const alert = session.add({ ...crossing, name: "Breakout" });
    const listener = vi.fn(),
      unsubscribe = session.subscribe(listener);
    h.storage.setItem.mockClear();
    try {
      expect(session.update(alert.id, crossing)).toBe(true);
      expect(session.update(alert.id, { ...crossing, name: "  Breakout  " })).toBe(true);
      expect(h.storage.setItem).not.toHaveBeenCalled();
      expect(listener).not.toHaveBeenCalled();
      expect(session.update(alert.id, { ...crossing, name: " \t " })).toBe(true);
      expect(session.getSnapshot().alerts[0]).not.toHaveProperty("name");
      expect(session.getSnapshot().alerts[0]!.armedAt).toBe(alert.armedAt);
      expect(h.storage.setItem).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledTimes(1);
      session.update(alert.id, { ...crossing, name: "" });
      expect(h.storage.setItem).toHaveBeenCalledTimes(1);
      expect(session.add({ ...crossing, name: " " })).not.toHaveProperty("name");
    } finally {
      unsubscribe();
    }
  });

  it("retains existing rearm semantics on rule changes while preserving an omitted name", () => {
    const h = harness(),
      session = h.open();
    const alert = session.add({ ...crossing, name: "Original" });
    session.observeQuote(h.quote(99));
    h.advance(5);
    session.update(alert.id, { ...crossing, price: 110 });
    const updated = session.getSnapshot().alerts[0]!;
    expect(updated.name).toBe("Original");
    expect(updated.armedAt).toBeGreaterThan(alert.armedAt);
    session.observeQuote(h.quote(111));
    expect(h.onTrigger).not.toHaveBeenCalled();
    session.observeQuote(h.quote(109));
    expect(h.onTrigger).toHaveBeenCalledTimes(1);
  });

  it("synchronizes a peer rename without losing the shared pending crossing or duplicating history", () => {
    const h = harness(),
      a = h.open(),
      b = h.open();
    const alert = a.add({ ...crossing, name: "Old" });
    a.observeQuote(h.quote(99));
    h.advance(10);
    expect(b.update(alert.id, { ...crossing, name: "Peer name" })).toBe(true);
    expect(a.getSnapshot().alerts[0]).toEqual({ ...alert, name: "Peer name" });
    const next = h.quote(100);
    a.observeQuote(next);
    b.observeQuote(next);
    expect(h.onTrigger).toHaveBeenCalledTimes(1);
    expect(a.getSnapshot().history[0]!.name).toBe("Peer name");
    expect(b.getSnapshot()).toEqual(a.getSnapshot());
  });
});

describe("price alert messages", () => {
  it("normalizes stored and new messages up to 2000 characters while accepting legacy rows", () => {
    const h = harness(),
      session = h.open();
    const alert = session.add({
      ...crossing,
      name: "Breakout",
      message: "  Wait for confirmation.\nCheck risk.  ",
    });
    expect(alert.message).toBe("Wait for confirmation.\nCheck risk.");
    expect(
      session.add({ ...crossing, price: 200, message: ` ${"x".repeat(2000)} ` }).message,
    ).toHaveLength(2000);
    expect(session.add({ ...crossing, price: 300, message: " \n " })).not.toHaveProperty("message");
    session.observeQuote(h.quote(99));
    session.observeQuote(h.quote(100));
    const payload = JSON.parse(h.values.get(CHART_ALERTS_KEY)!);
    payload.alerts[0].message = "  Stored message  ";
    payload.history[0].message = "  Trigger message  ";
    payload.history.push({ ...payload.history[0], id: "old-event", message: undefined });
    const parsed = parseChartAlerts(JSON.stringify(payload));
    expect(parsed.alerts[0]!.message).toBe("Stored message");
    expect(parsed.history[0]!.message).toBe("Trigger message");
    expect(parsed.alerts[2]).not.toHaveProperty("message");
    expect(parsed.history[1]).not.toHaveProperty("message");
  });

  it("rejects invalid messages atomically and excludes malformed stored alert/event rows", () => {
    const h = harness(),
      session = h.open();
    const alert = session.add({ ...crossing, message: "Valid" });
    session.observeQuote(h.quote(99));
    session.observeQuote(h.quote(100));
    const before = session.getSnapshot();
    h.storage.setItem.mockClear();
    for (const message of [null, 10, true, {}, [], "x".repeat(2001)]) {
      expect(() => session.add({ ...crossing, message } as NewChartAlert)).toThrow();
      expect(session.update(alert.id, { ...crossing, message } as NewChartAlert)).toBe(false);
      expect(
        parseChartAlerts(
          JSON.stringify({
            version: 1,
            alerts: [before.alerts[0], { ...before.alerts[0], id: "bad", message }],
            history: [before.history[0], { ...before.history[0], id: "bad-event", message }],
          }),
        ),
      ).toEqual(before);
    }
    expect(session.getSnapshot()).toBe(before);
    expect(h.storage.setItem).not.toHaveBeenCalled();
  });

  it("preserves peer crossing continuity, pause/timestamps, and event snapshots through message-only edits", () => {
    const h = harness(),
      a = h.open(),
      b = h.open();
    const alert = a.add({ ...crossing, name: "Level", message: "Original" });
    a.observeQuote(h.quote(99));
    h.advance(100);
    expect(b.update(alert.id, { ...crossing, message: "  Check confirmation  " })).toBe(true);
    expect(a.getSnapshot().alerts[0]).toEqual({ ...alert, message: "Check confirmation" });
    const quote = h.quote(100);
    a.observeQuote(quote);
    b.observeQuote(quote);
    expect(h.onTrigger).toHaveBeenCalledTimes(1);
    const fired = a.getSnapshot().alerts[0]!;
    const event = a.getSnapshot().history[0]!;
    expect(event).toMatchObject({ name: "Level", message: "Check confirmation" });
    h.advance(100);
    a.update(alert.id, { ...crossing, message: "Journal this trade" });
    expect(a.getSnapshot().alerts[0]).toEqual({ ...fired, message: "Journal this trade" });
    expect(a.getSnapshot().history[0]).toBe(event);
    expect(b.getSnapshot().history[0]!.message).toBe("Check confirmation");
    a.dispose();
    b.dispose();
    const restored = h.open().getSnapshot();
    expect(restored.alerts[0]!.message).toBe("Journal this trade");
    expect(restored.history[0]!.message).toBe("Check confirmation");
  });

  it("retains cooldown on message edits and preserves omitted text on actual rule changes", () => {
    const h = harness(),
      session = h.open();
    const rule = { ...crossing, condition: "above" as const, repeat: true, cooldownMs: 1000 };
    const alert = session.add({ ...rule, name: "Repeated", message: "Original" });
    session.observeQuote(h.quote(101));
    const fired = session.getSnapshot().alerts[0]!;
    h.advance(500);
    session.update(alert.id, { ...rule, message: "Updated" });
    expect(session.getSnapshot().alerts[0]).toEqual({ ...fired, message: "Updated" });
    session.observeQuote(h.quote(102));
    expect(h.onTrigger).toHaveBeenCalledTimes(1);
    session.observeQuote(h.quote(103, 499));
    expect(session.getSnapshot().history.map((event) => event.message)).toEqual([
      "Updated",
      "Original",
    ]);
    h.advance(10);
    session.update(alert.id, { ...rule, price: 200 });
    expect(session.getSnapshot().alerts[0]).toMatchObject({
      name: "Repeated",
      message: "Updated",
      price: 200,
    });
    expect(session.getSnapshot().alerts[0]!.armedAt).toBeGreaterThan(alert.armedAt);
  });

  it("no-ops omitted or identically normalized text, and explicitly clears a blank message", () => {
    const h = harness(),
      session = h.open();
    const alert = session.add({ ...crossing, name: "Name", message: "Message" });
    const listener = vi.fn(),
      unsubscribe = session.subscribe(listener);
    h.storage.setItem.mockClear();
    try {
      session.update(alert.id, crossing);
      session.update(alert.id, { ...crossing, message: "  Message  " });
      expect(h.storage.setItem).not.toHaveBeenCalled();
      expect(listener).not.toHaveBeenCalled();
      session.update(alert.id, { ...crossing, name: "Renamed" });
      expect(session.getSnapshot().alerts[0]!.message).toBe("Message");
      session.update(alert.id, { ...crossing, message: " \n " });
      expect(session.getSnapshot().alerts[0]).not.toHaveProperty("message");
      expect(session.getSnapshot().alerts[0]).toMatchObject({
        name: "Renamed",
        armedAt: alert.armedAt,
      });
      expect(h.storage.setItem).toHaveBeenCalledTimes(2);
      session.update(alert.id, { ...crossing, message: "" });
      expect(h.storage.setItem).toHaveBeenCalledTimes(2);
    } finally {
      unsubscribe();
    }
  });
});

describe("price alert expiration and notification preferences", () => {
  const silent = { toast: false, sound: false, desktop: false };
  const custom = { toast: false, sound: true, desktop: true };
  const defaults = { toast: true, sound: false, desktop: false };

  it("defaults legacy alerts/history and preserves explicit preferences through reopen", () => {
    const h = harness(),
      session = h.open();
    const alert = session.add({ ...crossing, expiresAt: EPOCH + 60_000, notifications: custom });
    session.observeQuote(h.quote(99));
    session.observeQuote(h.quote(101));
    const saved = JSON.parse(h.values.get(CHART_ALERTS_KEY)!);
    const event = session.getSnapshot().history[0]!;
    expect(event.notifications).toEqual(custom);
    expect(event.notifications).not.toBe(alert.notifications);
    session.dispose();
    const reopened = h.open();
    expect(reopened.getSnapshot().alerts[0]).toMatchObject({
      expiresAt: EPOCH + 60_000,
      notifications: custom,
    });
    expect(reopened.getSnapshot().history[0]!.notifications).toEqual(custom);
    delete saved.alerts[0].expiresAt;
    delete saved.alerts[0].notifications;
    delete saved.history[0].notifications;
    const legacy = parseChartAlerts(JSON.stringify(saved));
    expect(legacy.alerts[0]).toMatchObject({ expiresAt: null, notifications: defaults });
    expect(legacy.history[0]!.notifications).toEqual(defaults);
    expect(legacy.alerts[0]!.notifications).not.toBe(legacy.history[0]!.notifications);
  });

  it("rejects malformed expiry and notification payloads without changing existing alerts", () => {
    const h = harness(),
      session = h.open();
    const alert = session.add(crossing);
    const saved = JSON.parse(h.values.get(CHART_ALERTS_KEY)!);
    h.storage.setItem.mockClear();
    for (const patch of [
      ...[-1, NaN, Infinity, "tomorrow", 8_640_000_000_000_001].map((expiresAt) => ({ expiresAt })),
      ...[null, {}, { toast: true }, { ...custom, sound: 1 }, []].map((notifications) => ({
        notifications,
      })),
    ]) {
      expect(() => session.add({ ...crossing, ...patch } as NewChartAlert)).toThrow();
      expect(session.update(alert.id, { ...crossing, ...patch } as NewChartAlert)).toBe(false);
      // NaN/Infinity serialize as null, which deliberately means no expiration.
      if (
        !(
          "expiresAt" in patch &&
          typeof patch.expiresAt === "number" &&
          !Number.isFinite(patch.expiresAt)
        )
      ) {
        expect(
          parseChartAlerts(JSON.stringify({ ...saved, alerts: [{ ...saved.alerts[0], ...patch }] }))
            .alerts,
        ).toEqual([]);
      }
    }
    for (const expiresAt of [EPOCH - 1, EPOCH]) {
      expect(() => session.add({ ...crossing, expiresAt })).toThrow();
      expect(session.update(alert.id, { ...crossing, expiresAt })).toBe(false);
    }
    expect(h.storage.setItem).not.toHaveBeenCalled();
    expect(session.getSnapshot().alerts).toEqual([alert]);
  });

  it("expires at the boundary without quotes, synchronizes peers and cannot be re-enabled", () => {
    const h = harness(),
      session = h.open(),
      peer = h.open();
    const alert = session.add({ ...crossing, repeat: true, expiresAt: EPOCH + 1000 });
    session.observeQuote(h.quote(99));
    h.advance(999);
    h.storage.setItem.mockClear();
    expect(session.checkExpiration()).toBe(true);
    expect(session.getSnapshot().alerts[0]).toEqual({ ...alert, enabled: false });
    expect(peer.getSnapshot().alerts[0]!.enabled).toBe(false);
    expect(session.setEnabled(alert.id, true)).toBe(false);
    expect(session.checkExpiration()).toBe(false);
    expect(h.storage.setItem).toHaveBeenCalledTimes(1);
    session.observeQuote(h.quote(101));
    expect(h.onTrigger).not.toHaveBeenCalled();
    expect(session.getSnapshot().history).toEqual([]);
    session.dispose();
    expect(session.checkExpiration()).toBe(false);
  });

  it("expires before evaluating fresh quotes or replaying a pending crossing after reload", () => {
    const h = harness(),
      session = h.open();
    session.add({ ...crossing, expiresAt: EPOCH + 100 });
    session.observeQuote(h.quote(99));
    session.observeQuote(h.quote(101, 99));
    expect(h.onTrigger).not.toHaveBeenCalled();
    expect(session.getSnapshot().alerts[0]!.enabled).toBe(false);
    session.dispose();
    const reopened = h.open();
    reopened.observeQuote(h.quote(99));
    reopened.observeQuote(h.quote(101));
    expect(h.onTrigger).not.toHaveBeenCalled();
  });

  it("keeps pending crossings and cooldown state when changing notification or expiration preferences", () => {
    const h = harness(),
      session = h.open();
    const input = { ...crossing, repeat: true, cooldownMs: 1000 };
    const alert = session.add({ ...input, expiresAt: EPOCH + 10_000 });
    session.observeQuote(h.quote(99));
    expect(
      session.update(alert.id, { ...input, notifications: custom, expiresAt: EPOCH + 20_000 }),
    ).toBe(true);
    expect(session.getSnapshot().alerts[0]!.armedAt).toBe(alert.armedAt);
    session.observeQuote(h.quote(101));
    const fired = session.getSnapshot().alerts[0]!;
    const history = structuredClone(session.getSnapshot().history);
    session.update(alert.id, { ...input, notifications: silent });
    expect(session.getSnapshot().alerts[0]).toMatchObject({
      armedAt: fired.armedAt,
      lastQuoteAt: fired.lastQuoteAt,
      lastTriggeredAt: fired.lastTriggeredAt,
      expiresAt: EPOCH + 20_000,
    });
    session.observeQuote(h.quote(99));
    session.observeQuote(h.quote(101));
    expect(h.onTrigger).toHaveBeenCalledTimes(1);
    expect(session.getSnapshot().history).toEqual(history);
    session.observeQuote(h.quote(99, 1000));
    session.observeQuote(h.quote(101));
    expect(h.onTrigger).toHaveBeenCalledTimes(2);
    expect(session.getSnapshot().history[0]!.notifications).toEqual(silent);
    expect(session.getSnapshot().history[1]!.notifications).toEqual(custom);
  });

  it("preserves omitted settings, skips unchanged writes and clears expiration explicitly", () => {
    const h = harness(),
      session = h.open();
    const alert = session.add({ ...crossing, expiresAt: EPOCH + 1000, notifications: custom });
    h.storage.setItem.mockClear();
    session.update(alert.id, crossing);
    session.update(alert.id, {
      ...crossing,
      notifications: { ...custom },
      expiresAt: EPOCH + 1000,
    });
    expect(h.storage.setItem).not.toHaveBeenCalled();
    session.update(alert.id, { ...crossing, expiresAt: null });
    expect(session.getSnapshot().alerts[0]).toMatchObject({
      expiresAt: null,
      notifications: custom,
    });
    h.advance(2000);
    expect(session.checkExpiration()).toBe(false);
    expect(session.getSnapshot().alerts[0]!.enabled).toBe(true);
  });

  it("does not fire when expiration persistence fails and safely retries the disable", () => {
    const h = harness(),
      session = h.open();
    const alert = session.add({ ...crossing, expiresAt: EPOCH + 10 });
    session.observeQuote(h.quote(99));
    const quote = h.quote(101, 9);
    h.storage.setItem.mockImplementationOnce(() => {
      throw new Error("Offline");
    });
    expect(() => session.observeQuote(quote)).toThrow("Offline");
    expect(session.getSnapshot().alerts[0]).toEqual(alert);
    expect(h.onTrigger).not.toHaveBeenCalled();
    session.observeQuote(quote);
    expect(session.getSnapshot().alerts[0]!.enabled).toBe(false);
    expect(h.onTrigger).not.toHaveBeenCalled();
  });

  it("rejects malformed notification history without discarding valid alerts", () => {
    const h = harness(),
      session = h.open();
    session.add({ ...crossing, condition: "above" });
    session.observeQuote(h.quote(101));
    const saved = JSON.parse(h.values.get(CHART_ALERTS_KEY)!);
    for (const notifications of [null, {}, { ...defaults, toast: "yes" }]) {
      const parsed = parseChartAlerts(
        JSON.stringify({ ...saved, history: [{ ...saved.history[0], notifications }] }),
      );
      expect(parsed.alerts).toHaveLength(1);
      expect(parsed.history).toEqual([]);
    }
  });

  it("keeps expired alerts paused when their expiration is extended until explicitly re-enabled", () => {
    const h = harness(),
      session = h.open();
    const alert = session.add({ ...crossing, expiresAt: EPOCH + 10 });
    session.observeQuote(h.quote(99));
    h.advance(9);
    expect(session.update(alert.id, { ...crossing, expiresAt: EPOCH + 1000 })).toBe(true);
    expect(session.getSnapshot().alerts[0]!.enabled).toBe(false);
    expect(session.setEnabled(alert.id, true)).toBe(true);
    session.observeQuote(h.quote(101));
    expect(h.onTrigger).not.toHaveBeenCalled();
    session.observeQuote(h.quote(99));
    expect(h.onTrigger).toHaveBeenCalledTimes(1);
  });
});
