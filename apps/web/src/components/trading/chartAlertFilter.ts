export const CHART_ALERT_FILTER_OPTIONS = [
  ["all", "All statuses"],
  ["Active", "Active"],
  ["Waiting for chart", "Waiting for chart"],
  ["Paused", "Paused"],
  ["Triggered", "Triggered"],
  ["Expired", "Expired"],
  ["Drawing removed", "Drawing removed"],
] as const;
export type ChartAlertFilter = (typeof CHART_ALERT_FILTER_OPTIONS)[number][0];
export const CHART_ALERT_FILTER_KEY = "automorphic:chart-alert-filter:v1";
export function isChartAlertFilter(value: unknown): value is ChartAlertFilter {
  return CHART_ALERT_FILTER_OPTIONS.some(([status]) => value === status);
}
export function readChartAlertFilter(storage: Pick<Storage, "getItem">): ChartAlertFilter {
  try {
    const value: unknown = JSON.parse(storage.getItem(CHART_ALERT_FILTER_KEY) ?? "null");
    if (value && typeof value === "object" && "status" in value && isChartAlertFilter(value.status))
      return value.status;
  } catch {
    // Unreadable preferences show all alerts.
  }
  return "all";
}
export function writeChartAlertFilter(
  storage: Pick<Storage, "getItem" | "setItem">,
  status: ChartAlertFilter,
): void {
  if (!isChartAlertFilter(status) || readChartAlertFilter(storage) === status) return;
  storage.setItem(CHART_ALERT_FILTER_KEY, JSON.stringify({ status }));
}
