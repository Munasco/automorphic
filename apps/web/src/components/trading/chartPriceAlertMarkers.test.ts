import { describe, expect, it, vi } from "vite-plus/test";
import type { IPriceLine, ISeriesApi, SeriesType } from "lightweight-charts";
import {
  chartPriceAlertMarkers,
  createPriceAlertLines,
  priceAlertExpired,
} from "./chartPriceAlertMarkers";
import type { ChartPriceAlert } from "./chartAlerts";
const alert = (
  id: string,
  price: number,
  extra: Partial<ChartPriceAlert> = {},
): ChartPriceAlert => ({
  id,
  price,
  symbol: "NQ",
  condition: "crossing",
  repeat: false,
  cooldownMs: 1000,
  enabled: true,
  armedAt: 0,
  lastTriggeredAt: null,
  lastQuoteAt: null,
  ...extra,
});

describe("chart price alert marker projection", () => {
  it("uses the selected series transform and excludes other symbols and out-of-pane targets", () => {
    const alerts = [
      alert("first", 100),
      alert("second", 200),
      alert("other", 100, { symbol: "SI" }),
      alert("below", 10),
      alert("above", 400),
    ];
    const markers = chartPriceAlertMarkers(alerts, "NQ", (price) => 200 - price / 2, 300, 160);
    expect(markers.map(({ alert: item, x, y }) => [item.id, x, y])).toEqual([
      ["first", 282, 150],
      ["second", 282, 100],
      ["above", 282, 0],
    ]);
    expect(chartPriceAlertMarkers(alerts, "NQ", () => null, 300, 160)).toEqual([]);
    expect(chartPriceAlertMarkers(alerts, "NQ", () => NaN, 300, 160)).toEqual([]);
  });
  it("keeps adjacent markers separately clickable while preserving their exact price coordinate", () => {
    const markers = chartPriceAlertMarkers(
      [alert("a", 100), alert("b", 101), alert("c", 100)],
      "NQ",
      (price) => price,
      200,
      200,
    );
    expect(markers.map(({ x, y }) => [x, y])).toEqual([
      [182, 100],
      [154, 101],
      [126, 100],
    ]);
  });
  it("recognizes expiration at its boundary and leaves paused or expired markers available", () => {
    const alerts = [
      alert("paused", 100, { enabled: false }),
      alert("expired", 150, { expiresAt: 1000 }),
    ];
    expect(priceAlertExpired(alerts[0]!, 1000)).toBe(false);
    expect(priceAlertExpired(alerts[1]!, 999)).toBe(false);
    expect(priceAlertExpired(alerts[1]!, 1000)).toBe(true);
    expect(chartPriceAlertMarkers(alerts, "NQ", (price) => price, 300, 200)).toHaveLength(2);
  });
});

describe("native price alert line lifecycle", () => {
  it("updates only changed lines, keeps instance ownership, and removes stale or disposed lines", () => {
    const native: { options: Record<string, unknown>; applyOptions: ReturnType<typeof vi.fn> }[] =
      [];
    const createPriceLine = vi.fn((options: Record<string, unknown>) => {
      const line = {
        options: { ...options },
        applyOptions: vi.fn((update: Record<string, unknown>) =>
          Object.assign(line.options, update),
        ),
      };
      native.push(line);
      return line as unknown as IPriceLine;
    });
    const removePriceLine = vi.fn();
    const series = { createPriceLine, removePriceLine } as unknown as Pick<
      ISeriesApi<SeriesType>,
      "createPriceLine" | "removePriceLine"
    >;
    const manager = createPriceAlertLines(series);
    const first = alert("a", 100),
      second = alert("b", 105, { expiresAt: 1000 });
    manager.update([first, second, alert("other", 100, { symbol: "SI" })], "NQ", 500);
    expect(createPriceLine).toHaveBeenCalledTimes(2);
    manager.update([first, second], "NQ", 501);
    expect(native.every((line) => line.applyOptions.mock.calls.length === 0)).toBe(true);
    manager.update([{ ...first, price: 101, showLine: false }, second], "NQ", 1000);
    expect(native[0]!.options).toMatchObject({ price: 101, lineVisible: false, color: "#60a5fa" });
    expect(native[1]!.options).toMatchObject({ price: 105, color: "#71717a" });
    expect(native.every((line) => line.applyOptions.mock.calls.length === 1)).toBe(true);
    manager.update([{ ...first, enabled: false }], "NQ", 1001);
    expect(removePriceLine).toHaveBeenCalledWith(native[1]);
    expect(native[0]!.options).toMatchObject({ lineVisible: true, color: "#71717a" });
    manager.dispose();
    manager.dispose();
    expect(removePriceLine).toHaveBeenCalledTimes(2);
  });
});
