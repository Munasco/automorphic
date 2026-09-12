import { describe, expect, it } from "vite-plus/test";
import { chartTechnicalReadings } from "./ChartTechnicals";
import { DEFAULT_INDICATORS } from "./indicatorCatalog";

describe("selected-contract technical readings", () => {
  it("shows only enabled indicators with finite current readings and excludes volume-only data", () => {
    expect(chartTechnicalReadings({ volume: 1000 }, DEFAULT_INDICATORS, {})).toEqual([]);
    const rows = chartTechnicalReadings(
      { sma: 200, rsi: 0, ema: 300, atr: Infinity },
      { ...DEFAULT_INDICATORS, sma: true, rsi: true, ema: false, atr: true },
      {},
    );
    expect(rows.map(({ key, value }) => ({ key, value }))).toEqual([
      { key: "sma", value: 200 },
      { key: "rsi", value: 0 },
    ]);
  });
  it("uses configured periods and removes unavailable readings rather than substituting stale values", () => {
    const enabled = { ...DEFAULT_INDICATORS, sma: true };
    expect(chartTechnicalReadings({ sma: 123.5 }, enabled, { sma: { period: 50 } })[0]?.label).toBe(
      "SMA 50",
    );
    expect(chartTechnicalReadings({}, enabled, { sma: { period: 50 } })).toEqual([]);
    expect(chartTechnicalReadings({ sma: NaN }, enabled, {})).toEqual([]);
  });
});
