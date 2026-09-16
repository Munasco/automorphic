import type { ChartDrawing } from "./drawingGeometry";

const labels: Partial<Record<ChartDrawing["kind"], string>> = {
  trend: "Trendline",
  horizontal: "Horizontal line",
  vertical: "Vertical line",
  fib: "Fib retracement",
  "fib-extension": "Trend-based fib extension",
  "fib-trend-time": "Trend-based fib time",
  channel: "Parallel channel",
  "flat-channel": "Flat top/bottom",
  "arrow-up": "Arrow mark up",
  "arrow-down": "Arrow mark down",
};

export function drawingLabel(drawing: ChartDrawing) {
  return (
    drawing.name ||
    (drawing.kind === "text" ? drawing.text : null) ||
    labels[drawing.kind] ||
    drawing.kind.replaceAll("-", " ").replace(/^\w/, (letter) => letter.toUpperCase())
  );
}

export function objectTreeMatches(query: string, ...values: (string | undefined)[]): boolean {
  const haystack = values.filter(Boolean).join(" ").toLowerCase();
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .every((term) => haystack.includes(term));
}

export function drawingMatchesSearch(drawing: ChartDrawing, query: string): boolean {
  return objectTreeMatches(
    query,
    drawingLabel(drawing),
    labels[drawing.kind],
    drawing.kind.replaceAll("-", " "),
    drawing.text,
  );
}

export type ObjectTreeFilter = "all" | "drawings" | "indicators";
export const validObjectTreeFilter = (value: unknown): value is ObjectTreeFilter =>
  value === "all" || value === "drawings" || value === "indicators";

export function filterChartObjects<T extends { label: string }>(
  drawings: readonly ChartDrawing[],
  indicators: readonly T[],
  query: string,
  type: ObjectTreeFilter,
) {
  return {
    drawings:
      type === "indicators"
        ? []
        : drawings.filter((drawing) => drawingMatchesSearch(drawing, query)),
    indicators:
      type === "drawings"
        ? []
        : indicators.filter((indicator) => objectTreeMatches(query, indicator.label)),
  };
}
