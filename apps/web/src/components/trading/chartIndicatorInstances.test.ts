import { describe, expect, it } from "vite-plus/test";
import {
  createIndicatorInstance,
  getChartIndicatorInstances,
  normalizeIndicatorOrder,
} from "./chartIndicatorInstances";
import { normalizeChartPreferences } from "./chartPreferences";

describe("indicator instance ordering", () => {
  it("keeps only active IDs once and appends missing IDs in default order", () => {
    expect(
      normalizeIndicatorOrder(
        ["second", "stale", "second", 1, "first"],
        ["first", "second", "third"],
      ),
    ).toEqual(["second", "first", "third"]);
    for (const value of [null, undefined, {}, "first"])
      expect(normalizeIndicatorOrder(value, ["first", "second"])).toEqual(["first", "second"]);
  });
  it("orders legacy and extra instances together while retaining hidden rows and their configurations", () => {
    const extra = createIndicatorInstance("rsi", "duplicate");
    extra.hidden = true;
    extra.inputs.period = 7;
    extra.appearance = { color: "#123456" };
    const prefs = normalizeChartPreferences({
      indicators: { rsi: true, macd: true },
      extraIndicators: [extra],
    });
    const baseline = getChartIndicatorInstances(prefs);
    const order = ["duplicate", "base:macd", "base:rsi"];
    const ordered = getChartIndicatorInstances({ ...prefs, indicatorOrder: order });
    expect(ordered.slice(0, 3).map((item) => item.id)).toEqual(order);
    expect(ordered.find((item) => item.id === "duplicate")).toEqual(extra);
    expect(ordered.map((item) => item.id).sort()).toEqual(baseline.map((item) => item.id).sort());
    expect(prefs.extraIndicators[0]!.inputs.period).toBe(7);
    expect(order).toEqual(["duplicate", "base:macd", "base:rsi"]);
  });
});
