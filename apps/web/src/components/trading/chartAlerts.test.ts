import { describe, expect, it, vi } from "vite-plus/test";
import type { MarketQuote } from "./InstrumentHeader";
import { CHART_ALERTS_KEY, createChartAlertSession, parseChartAlerts } from "./chartAlerts";

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
        if (reason === "reload") session = h.open();
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
