import { MAX_CHART_INDICATORS } from "./chartIndicatorInstances";

export type ChartPaneSizes = Record<string, number>;

/** $price cannot collide with an indicator instance ID. Keep hidden panes bounded. */
export function normalizeChartPaneSizes(value: unknown): ChartPaneSizes {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(
        ([id, factor]) =>
          (id === "$price" || /^(?:base:)?[a-zA-Z0-9_-]{1,128}$/.test(id)) &&
          typeof factor === "number" &&
          Number.isFinite(factor) &&
          factor >= 0.000001 &&
          factor <= 1_000_000,
      )
      .slice(0, MAX_CHART_INDICATORS + 1),
  );
}

export function equalChartPaneSizes(a: ChartPaneSizes, b: ChartPaneSizes): boolean {
  return (
    Object.keys(a).length === Object.keys(b).length &&
    Object.entries(a).every(([id, factor]) => b[id] === factor)
  );
}
