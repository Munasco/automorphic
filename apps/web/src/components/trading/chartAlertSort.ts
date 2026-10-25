export const CHART_ALERT_SORT_OPTIONS = [
  ["newest", "Newest first"],
  ["oldest", "Oldest first"],
  ["symbol", "Symbol"],
  ["name", "Name"],
  ["message", "Message"],
] as const;

export type ChartAlertSort = (typeof CHART_ALERT_SORT_OPTIONS)[number][0];
export const CHART_ALERT_SORT_KEY = "automorphic:chart-alert-sort:v1";

function isChartAlertSort(value: unknown): value is ChartAlertSort {
  return CHART_ALERT_SORT_OPTIONS.some(([sort]) => sort === value);
}

export function readChartAlertSort(storage: Pick<Storage, "getItem">): ChartAlertSort {
  try {
    const raw = storage.getItem(CHART_ALERT_SORT_KEY);
    const value: unknown = raw === null ? null : JSON.parse(raw);
    if (value && typeof value === "object" && "sort" in value && isChartAlertSort(value.sort)) {
      return value.sort;
    }
  } catch {
    // Missing or unreadable preferences use the default order.
  }
  return "newest";
}

export function writeChartAlertSort(
  storage: Pick<Storage, "getItem" | "setItem">,
  sort: ChartAlertSort,
): void {
  if (!isChartAlertSort(sort) || readChartAlertSort(storage) === sort) return;
  storage.setItem(CHART_ALERT_SORT_KEY, JSON.stringify({ sort }));
}

type SortableAlert = { symbol: string; name?: string; message?: string; time: number };

export function compareChartAlerts(
  a: SortableAlert,
  b: SortableAlert,
  sort: ChartAlertSort,
): number {
  if (sort === "oldest") return a.time - b.time;
  if (sort === "newest") return b.time - a.time;
  const text = (alert: SortableAlert) =>
    sort === "name"
      ? alert.name?.trim() || alert.symbol
      : sort === "message"
        ? alert.message?.trim() || ""
        : alert.symbol;
  return (
    text(a).localeCompare(text(b), undefined, { numeric: true, sensitivity: "base" }) ||
    b.time - a.time
  );
}
