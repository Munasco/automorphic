export const CHART_ALERT_LOG_FILTER_OPTIONS = [
  ["all", "All events"],
  ["price", "Price alerts"],
  ["drawing", "Drawing alerts"],
] as const;
export type ChartAlertLogFilter = (typeof CHART_ALERT_LOG_FILTER_OPTIONS)[number][0];
export const CHART_ALERT_LOG_FILTER_KEY = "automorphic:chart-alert-log-filter:v1";
export function isChartAlertLogFilter(value: unknown): value is ChartAlertLogFilter {
  return CHART_ALERT_LOG_FILTER_OPTIONS.some(([kind]) => value === kind);
}
export function readChartAlertLogFilter(storage: Pick<Storage, "getItem">): ChartAlertLogFilter {
  try {
    const value: unknown = JSON.parse(storage.getItem(CHART_ALERT_LOG_FILTER_KEY) ?? "null");
    if (value && typeof value === "object" && "kind" in value && isChartAlertLogFilter(value.kind))
      return value.kind;
  } catch {
    // Unreadable preferences show all alerts.
  }
  return "all";
}
export function writeChartAlertLogFilter(
  storage: Pick<Storage, "getItem" | "setItem">,
  kind: ChartAlertLogFilter,
): void {
  if (!isChartAlertLogFilter(kind) || readChartAlertLogFilter(storage) === kind) return;
  storage.setItem(CHART_ALERT_LOG_FILTER_KEY, JSON.stringify({ kind }));
}

export function filterChartAlertLog<T extends { kind: "price" | "drawing"; searchText: string }>(
  events: readonly T[],
  kind: ChartAlertLogFilter,
  search: string,
): T[] {
  const query = search.trim().toLowerCase();
  return events.filter(
    (event) =>
      (kind === "all" || event.kind === kind) && event.searchText.toLowerCase().includes(query),
  );
}
