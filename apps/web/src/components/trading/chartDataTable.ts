import type { Candle } from "./chartIndicators";

export const CHART_DATA_TABLE_COLUMNS = [
  ["time", "Time"],
  ["open", "Open"],
  ["high", "High"],
  ["low", "Low"],
  ["close", "Close"],
  ["volume", "Volume"],
] as const;
export type ChartDataTableField = (typeof CHART_DATA_TABLE_COLUMNS)[number][0];
export type ChartDataTableSort = { field: ChartDataTableField; direction: "asc" | "desc" };
export const DEFAULT_CHART_DATA_TABLE_SORT: Readonly<ChartDataTableSort> = Object.freeze({
  field: "time",
  direction: "desc",
});
export const CHART_DATA_TABLE_SORT_KEY = "automorphic:chart-data-table-sort:v1";

type TableCandle = Pick<Candle, "time" | "actualTime" | "open" | "high" | "low" | "close"> & {
  volume?: number;
};
export type ChartDataTableRow = {
  /** Original unique chart key, retained when exchange times collide on tick charts. */
  chartTime: number;
  /** Exchange timestamp for presentation and sorting, in Unix seconds. */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

export function createChartDataTableRows(bars: readonly TableCandle[]): ChartDataTableRow[] {
  return bars.map((bar) => ({
    chartTime: bar.time,
    time:
      typeof bar.actualTime === "number" && Number.isFinite(bar.actualTime)
        ? bar.actualTime
        : bar.time,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    ...(bar.volume === undefined ? {} : { volume: bar.volume }),
  }));
}

function validSort(value: unknown): value is ChartDataTableSort {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const sort = value as Record<string, unknown>;
  return (
    CHART_DATA_TABLE_COLUMNS.some(([field]) => field === sort.field) &&
    (sort.direction === "asc" || sort.direction === "desc")
  );
}

/** Missing readings sort last in either direction; equal readings retain raw chart order. */
export function sortChartDataTableRows(
  rows: readonly ChartDataTableRow[],
  sort: ChartDataTableSort = DEFAULT_CHART_DATA_TABLE_SORT,
): ChartDataTableRow[] {
  const { field, direction } = validSort(sort) ? sort : DEFAULT_CHART_DATA_TABLE_SORT;
  return [...rows].sort((a, b) => {
    const left = a[field],
      right = b[field];
    const leftValid = typeof left === "number" && Number.isFinite(left);
    const rightValid = typeof right === "number" && Number.isFinite(right);
    if (!leftValid || !rightValid) return leftValid ? -1 : rightValid ? 1 : 0;
    const order = left < right ? -1 : left > right ? 1 : 0;
    return direction === "asc" ? order : -order;
  });
}

export function readChartDataTableSort(storage: Pick<Storage, "getItem">): ChartDataTableSort {
  try {
    const raw = storage.getItem(CHART_DATA_TABLE_SORT_KEY);
    const value: unknown = raw === null ? null : JSON.parse(raw);
    if (validSort(value)) return { field: value.field, direction: value.direction };
  } catch {
    // Unavailable or malformed preferences retain the default ordering.
  }
  return { ...DEFAULT_CHART_DATA_TABLE_SORT };
}

export function writeChartDataTableSort(
  storage: Pick<Storage, "getItem" | "setItem">,
  sort: ChartDataTableSort,
): void {
  if (!validSort(sort)) return;
  const previous = readChartDataTableSort(storage);
  if (previous.field === sort.field && previous.direction === sort.direction) return;
  storage.setItem(
    CHART_DATA_TABLE_SORT_KEY,
    JSON.stringify({ field: sort.field, direction: sort.direction }),
  );
}
