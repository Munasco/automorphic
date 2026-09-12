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
    expect(resolveIndicatorStyle("bollinger", "upper", appearance)).toEqual({
      color: "#abcdef",
      lineWidth: 4,
    });
    expect(resolveIndicatorStyle("bollinger", "main", appearance)).toEqual({
      color: "#123456",
      lineWidth: 2,
    });
    expect(resolveIndicatorStyle("bollinger", "lower", appearance)).toEqual({
      color: "#123456",
      lineWidth: 2,
    });
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
