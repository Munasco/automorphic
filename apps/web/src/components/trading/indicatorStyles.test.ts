import { describe, expect, it } from "vite-plus/test";
import { normalizeChartPreferences, useChartPreferences } from "./chartPreferences";
import { normalizeIndicatorAppearance, resolveIndicatorStyle } from "./indicatorStyles";
import { initialBalanceLevels } from "./initialBalancePrimitive";
import { DEFAULT_INITIAL_BALANCE } from "./indicatorCatalog";

describe("declared indicator styles", () => {
  it("preserves legacy band colors and isolates newer per-plot overrides", () => {
    const appearance = normalizeIndicatorAppearance("bollinger", {
      color: "#123456",
      lineWidth: 2,
      plots: {
        upper: { color: "#abcdef", lineWidth: 4 },
        unknown: { color: "#123123" },
        lower: { color: "red", lineWidth: 99 },
      },
    });
    expect(appearance.plots).toEqual({ upper: { color: "#abcdef", lineWidth: 4 } });
    expect(resolveIndicatorStyle("bollinger", "upper", appearance)).toMatchObject({
      color: "#abcdef",
      lineWidth: 4,
    });
    expect(resolveIndicatorStyle("bollinger", "main", appearance)).toMatchObject({
      color: "#123456",
      lineWidth: 2,
    });
    expect(resolveIndicatorStyle("bollinger", "lower", appearance)).toMatchObject({
      color: "#123456",
      lineWidth: 2,
    });
  });

  it("round-trips VWAP band inputs and appearance while rejecting corrupt opacity and undeclared styles", () => {
    const before = useChartPreferences.getState();
    try {
      before.setIndicatorInputs("vwap", { bandMode: 1, band2Enabled: 1, band2Multiplier: 2.5 });
      before.setIndicatorAppearance("vwap", {
        plots: {
          upper1: { visible: false, opacity: 0 },
          fill1: { color: "#123456", opacity: 0.37 },
        },
      });
      before.setIndicatorAppearance("vwap", {
        plots: { fill1: { opacity: Infinity }, unknown: { opacity: 0.1 } },
      });
      const restored = normalizeChartPreferences(
        JSON.parse(JSON.stringify(useChartPreferences.getState())),
      );
      expect(restored.indicatorInputs.vwap).toMatchObject({
        bandMode: 1,
        band1Enabled: 1,
        band2Enabled: 1,
        band2Multiplier: 2.5,
        band3Enabled: 0,
      });
      expect(resolveIndicatorStyle("vwap", "fill1", restored.appearance.vwap)).toMatchObject({
        color: "#123456",
        opacity: 0.37,
        visible: true,
      });
      expect(resolveIndicatorStyle("vwap", "upper1", restored.appearance.vwap)).toMatchObject({
        opacity: 0,
        visible: false,
      });
      expect(restored.appearance.vwap?.plots).not.toHaveProperty("unknown");
      before.setIndicatorInputs("vwap", { bandMode: 2, band1Multiplier: 10 });
      expect(useChartPreferences.getState().indicatorInputs.vwap?.bandMode).toBe(1);
      before.resetIndicatorAppearance("vwap");
      before.resetIndicatorInputs("vwap");
      expect(
        resolveIndicatorStyle("vwap", "fill1", useChartPreferences.getState().appearance.vwap),
      ).toMatchObject({ color: "#81c784", opacity: 0.05, visible: true });
    } finally {
      useChartPreferences.setState(before);
    }
  });

  it("saves, restores, and resets independent IB styles without changing its session", () => {
    const before = useChartPreferences.getState();
    try {
      before.setIndicatorAppearance("ib", { plots: { high: { color: "#123456", lineWidth: 3 } } });
      before.setIndicatorAppearance("ib", { plots: { low: { color: "#abcdef" } } });
      before.setIndicatorAppearance("ib", { plots: { high: { color: "invalid", lineWidth: 99 } } });
      const restored = normalizeChartPreferences(
        JSON.parse(JSON.stringify(useChartPreferences.getState())),
      );
      expect(restored.appearance.ib?.plots).toEqual({
        high: { color: "#123456", lineWidth: 3 },
        low: { color: "#abcdef" },
      });
      const levels = initialBalanceLevels(
        {
          session: "2026-09-14",
          startTime: 0,
          endTime: 3600,
          sessionEndTime: 23400,
          lastTime: 3600,
          high: 110,
          low: 100,
          volume: 50,
          status: "complete",
        },
        DEFAULT_INITIAL_BALANCE,
        restored.appearance.ib?.plots,
      );
      expect(levels.find((level) => level.label === "IBH")).toMatchObject({
        price: 110,
        color: "#123456",
        width: 3,
      });
      expect(levels.find((level) => level.label === "IBL")).toMatchObject({
        price: 100,
        color: "#abcdef",
      });
      expect(levels.find((level) => level.label === "50%")).toMatchObject({
        price: 105,
        color: "#9ca3af",
      });
      before.resetIndicatorAppearance("ib");
      expect(useChartPreferences.getState().appearance.ib).toBeUndefined();
      expect(useChartPreferences.getState().initialBalance).toEqual(before.initialBalance);
    } finally {
      useChartPreferences.setState(before);
    }
  });
});
