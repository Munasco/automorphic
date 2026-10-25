import { LineStyle, type IPriceLine, type ISeriesApi, type SeriesType } from "lightweight-charts";
import type { ChartPriceAlert } from "./chartAlerts";

export function priceAlertExpired(alert: ChartPriceAlert, now: number): boolean {
  return alert.expiresAt != null && alert.expiresAt <= now;
}

export function chartPriceAlertMarkers(
  alerts: readonly ChartPriceAlert[],
  symbol: string,
  project: (price: number) => number | null,
  width: number,
  height: number,
) {
  const markers: { alert: ChartPriceAlert; x: number; y: number }[] = [];
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0)
    return markers;
  for (const alert of alerts) {
    if (alert.symbol !== symbol || !Number.isFinite(alert.price)) continue;
    const y = project(alert.price);
    if (y === null || !Number.isFinite(y) || y < 0 || y > height) continue;
    // Adjacent targets retain separate hit areas without shifting their price positions.
    const occupied = markers.filter((marker) => Math.abs(marker.y - y) < 24);
    let x = width - 18;
    while (occupied.some((marker) => Math.abs(marker.x - x) < 28)) x -= 28;
    if (x < 12) continue;
    markers.push({ alert, x, y });
  }
  return markers;
}

export function createPriceAlertLines(
  series: Pick<ISeriesApi<SeriesType>, "createPriceLine" | "removePriceLine">,
) {
  const lines = new Map<string, { line: IPriceLine; signature: string }>();
  return {
    update(alerts: readonly ChartPriceAlert[], symbol: string, now: number) {
      const present = new Set<string>();
      for (const alert of alerts) {
        if (alert.symbol !== symbol || !Number.isFinite(alert.price)) continue;
        present.add(alert.id);
        const active = alert.enabled && !priceAlertExpired(alert, now);
        const options = {
          price: alert.price,
          color: active ? "#60a5fa" : "#71717a",
          lineWidth: 1 as const,
          lineStyle: LineStyle.Dashed,
          lineVisible: alert.showLine !== false,
          axisLabelVisible: false,
          title: "",
        };
        const signature = JSON.stringify(options);
        const existing = lines.get(alert.id);
        if (!existing) lines.set(alert.id, { line: series.createPriceLine(options), signature });
        else if (existing.signature !== signature) {
          existing.line.applyOptions(options);
          existing.signature = signature;
        }
      }
      for (const [id, entry] of lines)
        if (!present.has(id)) {
          series.removePriceLine(entry.line);
          lines.delete(id);
        }
    },
    dispose() {
      for (const { line } of lines.values()) series.removePriceLine(line);
      lines.clear();
    },
  };
}
