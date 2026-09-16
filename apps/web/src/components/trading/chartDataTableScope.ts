import type { ChartDataTableRow } from "./chartDataTable";

export const CHART_DATA_TABLE_SCOPE_KEY = "automorphic:chart-data-table-scope:v1";
export const CHART_DATA_TABLE_SCOPE_OPTIONS = [
  ["all", "All loaded bars"],
  ["visible", "Visible chart range"],
] as const;
export type ChartDataTableScope = (typeof CHART_DATA_TABLE_SCOPE_OPTIONS)[number][0];

export function isChartDataTableScope(value: unknown): value is ChartDataTableScope {
  return value === "all" || value === "visible";
}

export function readChartDataTableScope(storage: Pick<Storage, "getItem">): ChartDataTableScope {
  try {
    const value: unknown = JSON.parse(storage.getItem(CHART_DATA_TABLE_SCOPE_KEY) ?? "null");
    if (
      value &&
      typeof value === "object" &&
      "scope" in value &&
      isChartDataTableScope(value.scope)
    )
      return value.scope;
  } catch {
    // Missing or unreadable preferences show all loaded bars.
  }
  return "all";
}

export function writeChartDataTableScope(
  storage: Pick<Storage, "getItem" | "setItem">,
  scope: ChartDataTableScope,
): void {
  if (!isChartDataTableScope(scope) || readChartDataTableScope(storage) === scope) return;
  storage.setItem(CHART_DATA_TABLE_SCOPE_KEY, JSON.stringify({ scope }));
}

/** Use chart positions, not exchange timestamps: tick bars can share the same exchange time. */
export function filterChartDataTableRows(
  rows: readonly ChartDataTableRow[],
  scope: ChartDataTableScope,
  range: { from: number; to: number } | null,
  indexAt: (chartTime: number) => number | null,
): readonly ChartDataTableRow[] {
  if (scope !== "visible") return rows;
  if (!range || !Number.isFinite(range.from) || !Number.isFinite(range.to) || range.from > range.to)
    return [];
  // Fractional bounds include the partially visible candles at either edge.
  const from = Math.floor(range.from);
  const to = Math.ceil(range.to);
  return rows.filter((row) => {
    const index = indexAt(row.chartTime);
    return index !== null && Number.isFinite(index) && index >= from && index <= to;
  });
}
