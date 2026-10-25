import type { ChartDrawing, DrawingKind } from "./drawingGeometry";

export function drawingKindLabel(kind: DrawingKind): string {
  const labels: Record<string, string> = {
    trend: "Trendline",
    "trend-angle": "Trend angle",
    "info-line": "Info line",
    "regression-trend": "Regression trend",
    horizontal: "Horizontal Line",
    "horizontal-ray": "Horizontal Ray",
    fib: "Fib Retracement",
    "fib-time-zone": "Fib Time Zone",
    "fib-trend-time": "Trend-based Fib Time",
    channel: "Parallel channel",
    "flat-channel": "Flat top/bottom",
    "disjoint-channel": "Disjoint channel",
    "rotated-rectangle": "Rotated Rectangle",
    "double-curve": "Double Curve",
  };
  return labels[kind] ?? kind.replaceAll("-", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Keep user names and text intact; only unnamed tools need a display-label fallback. */
export function drawingCopyName(drawing: Pick<ChartDrawing, "kind" | "name" | "text">): string {
  return `${drawing.name || drawing.text || drawingKindLabel(drawing.kind)} copy`.slice(0, 80);
}
